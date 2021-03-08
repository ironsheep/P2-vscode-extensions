'use strict';

//import { createStringLiteralFromNode, EndOfLineState } from 'typescript';
// src/spin2.extension.ts

import * as vscode from 'vscode';

// ----------------------------------------------------------------------------
//  this file contains both an outline provider
//    and our semantic highlighting provider
//

// register services provided by this file
export function activate(context: vscode.ExtensionContext) {
    // register our outline provider
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            {scheme: "file", language: "spin2"},
            new Spin2ConfigDocumentSymbolProvider()
        )
    );

    // register our semantic tokens provider
    context.subscriptions.push(
        vscode.languages.registerDocumentSemanticTokensProvider(
            { language: 'spin2' },
            new Spin2DocumentSemanticTokensProvider(), legend)
    );
}

// ----------------------------------------------------------------------------
//   OUTLINE Provider
//
class Spin2ConfigDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

    public provideDocumentSymbols(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[]>
        {
        return new Promise((resolve, _reject) =>
        {
            let symbols: vscode.DocumentSymbol[] = [];

            for (let i = 0; i < document.lineCount; i++) {
                let line = document.lineAt(i);
                let linePrefix: string = line.text;
                let lineHasComment: boolean = false;
                let commentOffset: number = 0;
                let commentLength: number = 0;
                if (line.text.length > 2) {
                    const lineParts: string[] = linePrefix.split(/[ \t]/)
                    linePrefix = (lineParts.length > 0) ? lineParts[0].toUpperCase() : "";
                    // the only form of comment we care about here is block comment after section name (e.g., "CON { text }")
                    const openBraceOffset: number = line.text.indexOf('{');
                    if (openBraceOffset != -1) {
                        commentOffset = openBraceOffset;
                        const closeBraceOffset: number = line.text.indexOf('}',openBraceOffset + 1);
                        if (closeBraceOffset != -1) {
                            lineHasComment = true;
                            commentLength = closeBraceOffset - openBraceOffset + 1;
                        }
                    }
                }

                if (linePrefix == "CON" || linePrefix == "DAT" || linePrefix == "VAR" || linePrefix == "OBJ") {
                    let sectionComment = (lineHasComment) ? line.text.substr(commentOffset, commentLength) : ""
                    const marker_symbol = new vscode.DocumentSymbol(
                        linePrefix + " " + sectionComment,
                        '',
                        vscode.SymbolKind.Field,
                        line.range, line.range)

                    symbols.push(marker_symbol)
                }
                else if (linePrefix == "PUB" || linePrefix == "PRI") {
                    let methodScope: string = "Public"
                    if (line.text.startsWith("PRI")) {
                        methodScope = "Private"
                    }
                    let methodName: string = line.text.substr(3).trim()
                    if (methodName.includes("'")) {
                        const lineParts: string[] = methodName.split("'")
                        methodName = lineParts[0].trim()
                    }
                    if (methodName.includes("{")) {
                        const lineParts: string[] = methodName.split("{")
                        methodName = lineParts[0].trim()
                    }
                    if (methodName.includes("|")) {
                        const lineParts: string[] = methodName.split("|")
                        methodName = lineParts[0].trim()
                    }

                    const cmd_symbol = new vscode.DocumentSymbol(
                        linePrefix + ' ' + methodName,
                        '',
                        vscode.SymbolKind.Function,
                        line.range, line.range)

                    symbols.push(cmd_symbol)
                }
            }

            resolve(symbols);
        });
    }
}

// ----------------------------------------------------------------------------
//   Semantic Highlighting Provider
//
const tokenTypes = new Map<string, number>();
const tokenModifiers = new Map<string, number>();

/*
const enum TokenType {
    class, comment, enum, enumMember, event, function, interface, keyword, label, macro, method,
    namespace, number, operator, parameter, property, regexp, string, struct, type, typeParameter, variable, _
}

const enum TokenModifier {
	declaration, static, async, readonly, _
}
*/

const legend = (function () {
	const tokenTypesLegend = [
		'comment', 'string', 'keyword', 'number', 'regexp', 'operator', 'namespace',
		'type', 'struct', 'class', 'interface', 'enum', 'typeParameter', 'function',
        'method', 'macro', 'variable', 'parameter', 'property', 'label', 'enumMember',
        'event', 'returnValue', 'storageType'
	];
	tokenTypesLegend.forEach((tokenType, index) => tokenTypes.set(tokenType, index));

	const tokenModifiersLegend = [
		'declaration', 'documentation', 'readonly', 'static', 'abstract', 'deprecated',
		'modification', 'async', 'definition', 'defaultLibrary', 'local'
    ];
	tokenModifiersLegend.forEach((tokenModifier, index) => tokenModifiers.set(tokenModifier, index));

	return new vscode.SemanticTokensLegend(tokenTypesLegend, tokenModifiersLegend);
})();

interface IParsedToken {
	line: number;
	startCharacter: number;
	length: number;
	tokenType: string;
	tokenModifiers: string[];
}

interface IRememberedToken {
	tokenType: string;
	tokenModifiers: string[];
}

//const this.globalTokens = new Map<string, IRememberedToken>();
//const this.localTokens = new Map<string, IRememberedToken>();

enum eParseState {
    Unknown = 0,
    inCon,
    inDat,
    inObj,
    inPub,
    inPri,
    inVar,
    inPasmInline,
    inDatPasm,
    inMultiLineComment,
    inMultiLineDocComment,
    inNothing
}
class Spin2DocumentSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
    async provideDocumentSemanticTokens(document: vscode.TextDocument, cancelToken: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
        // SEE https://www.codota.com/code/javascript/functions/vscode/CancellationToken/isCancellationRequested
        if (cancelToken) { }  // silence our compiler for now... TODO: we should adjust loop so it can break on cancelToken.isCancellationRequested
        const allTokens = this._parseText(document.getText());
		const builder = new vscode.SemanticTokensBuilder();
		allTokens.forEach((token) => {
			builder.push(token.line, token.startCharacter, token.length, this._encodeTokenType(token.tokenType), this._encodeTokenModifiers(token.tokenModifiers));
		});
		return builder.build();
    }

    private globalTokens = new Map<string, IRememberedToken>();
    private localTokens = new Map<string, IRememberedToken>();

    private spin2log: any = undefined;
    // adjust following true/false to show specific parsing debug
    private spinDebugLogEnabled: boolean = true;
    private showCode: boolean = true;
    private showCON: boolean = false;
    private showOBJ: boolean = false;
    private showDAT: boolean = false;
    private showVAR: boolean = false;
    private showPASM: boolean = false;
    private showState: boolean = false;

    private _logState(message: string): void
    {
        if (this.showState) {
            this._logMessage(message)
        }
    }

    private _logCode(message: string): void
    {
        if (this.showCode) {
            this._logMessage(message)
        }
    }

    private _logCON(message: string): void
    {
        if (this.showCON) {
            this._logMessage(message)
        }
    }

    private _logVAR(message: string): void
    {
        if (this.showVAR) {
            this._logMessage(message)
        }
    }

    private _logDAT(message: string): void
    {
        if (this.showDAT) {
            this._logMessage(message)
        }
    }

    private _logOBJ(message: string): void
    {
        if (this.showOBJ) {
            this._logMessage(message)
        }
    }

    private _logPASM(message: string): void
    {
        if (this.showPASM) {
            this._logMessage(message)
        }
    }

    private _logMessage(message: string): void
    {
        if (this.spin2log != undefined) {
            //Write to output window.
            this.spin2log.appendLine(message);
        }
    }

private _encodeTokenType(tokenType: string): number {
		if (tokenTypes.has(tokenType)) {
			return tokenTypes.get(tokenType)!;
		} else if (tokenType === 'notInLegend') {
			return tokenTypes.size + 2;
		}
		return 0;
    }

	private _encodeTokenModifiers(strTokenModifiers: string[]): number {
		let result = 0;
		for (let i = 0; i < strTokenModifiers.length; i++) {
			const tokenModifier = strTokenModifiers[i];
			if (tokenModifiers.has(tokenModifier)) {
				result = result | (1 << tokenModifiers.get(tokenModifier)!);
			} else if (tokenModifier === 'notInLegend') {
				result = result | (1 << tokenModifiers.size + 2);
			}
		}
		return result;
    }

    private _parseText(text: string): IParsedToken[] {
        // parse our entire file
        const lines = text.split(/\r\n|\r|\n/);
        let currState: eParseState = eParseState.Unknown;
        let priorState: eParseState = currState
        let prePasmState: eParseState = currState

        if (this.spinDebugLogEnabled) {
            if (this.spin2log === undefined) {
                //Create output channel
                this.spin2log = vscode.window.createOutputChannel("Spin2 OUT");
                this._logMessage("Spin2 log started.");
            }
            else {
                this._logMessage("\n\n------------------   NEW FILE ----------------\n\n");
            }
        }

        //
        // prepass to find PRI/PUB method, OBJ names, and VAR/DAT names
        //

        // -------------------- PRE-PARSE just locating symbol names --------------------
        this._logMessage("---> Pre SCAN");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            const sectionStatus = this._lineIsSectionStart(line);
            if (currState == eParseState.inMultiLineComment) {
                // in multi-line non-doc-comment, hunt for end '}' to exit
                let closingOffset = line.indexOf('}');
                if (closingOffset != -1) {
                    // have close, comment ended
                    currState = eParseState.inNothing;
                }
                //  DO NOTHING Let Syntax hightlighting do this
                continue;
            }
            else if (currState == eParseState.inMultiLineDocComment) {
                // in multi-line doc-comment, hunt for end '}}' to exit
                let closingOffset = line.indexOf('}}');
                if (closingOffset != -1) {
                    // have close, comment ended
                    currState = eParseState.inNothing;
                }
                //  DO NOTHING Let Syntax hightlighting do this
                continue;
            }
            else if (sectionStatus.isSectionStart) {
                currState = sectionStatus.inProgressStatus;
                this._logState('- scan ln:' + i +' currState=[' + currState + ']');
                // ID the remainder of the line
                if (currState == eParseState.inPub || currState == eParseState.inPri) {
                    // process method signature
                    if (line.length > 3) {
                        this._getMethodName(3, line)
                    }
                }
                else if (currState == eParseState.inCon) {
                    // process a constant line
                    if (line.length > 3) {
                        this._getConstantDeclaration(3, line)
                    }
                }
                continue;
            }
            else if (trimmedLine.startsWith("''")) {
                // process single line doc comment
                //  DO NOTHING Let Syntax hightlighting do this
            }
            else if (trimmedLine.startsWith("'")) {
                // process single line non-doc comment
                //  DO NOTHING Let Syntax hightlighting do this
            }
            else if (trimmedLine.startsWith("{{")) {
                // process multi-line doc comment
                let openingOffset = line.indexOf('{{');
                const closingOffset = line.indexOf('}}', openingOffset + 2);
                if (closingOffset != -1) {
                    // is single line comment, just ignore it Let Syntax hightlighting do this
                    currState = priorState;
                }
                else {
                    // is open of multiline comment
                    priorState = currState;
                    currState = eParseState.inMultiLineDocComment;
                    //  DO NOTHING Let Syntax hightlighting do this
                }
            }
            else if (trimmedLine.startsWith("{")) {
                // process possible multi-line non-doc comment
                // do we have a close on this same line?
                let openingOffset = line.indexOf('{');
                const closingOffset = line.indexOf('}', openingOffset + 1);
                if (closingOffset != -1) {
                    // is single line comment, just ignore it Let Syntax hightlighting do this
                    currState = priorState;
                }
                else {
                    // is open of multiline comment
                    priorState = currState;
                    currState = eParseState.inMultiLineComment;
                    //  DO NOTHING Let Syntax hightlighting do this
                }
            }
            else if (currState == eParseState.inCon) {
                // process a constant line
                if (trimmedLine.length > 0) {
                    this._getConstantDeclaration(0, line)
                }
            }
            else if (currState == eParseState.inDat) {
                // process a data line
                if (trimmedLine.length > 0) {
                    if (trimmedLine.length > 3) {
                        const linePrefix: string = trimmedLine.substr(0, 3).toUpperCase();
                        if (linePrefix.startsWith("ORG")) {
                            this._logPASM('- scan DAT line trimmedLine=[' + trimmedLine + ']');
                            prePasmState = currState;
                            currState = eParseState.inDatPasm;
                            // and ignore rest of this line
                            continue;
                        }
                    }
                    this._getDataDeclaration(0, line)
                }
            }
            else if (currState == eParseState.inVar) {
                // process a variable declaration line
                if (trimmedLine.length > 0) {
                    this._getVariableDeclaration(0, line)
                }
            }
            else if (currState == eParseState.inObj) {
                // process an object declaration line
                if (trimmedLine.length > 0) {
                    this._getObjectDeclaration(0, line)
                }
            }
            else if (currState == eParseState.inPasmInline) {
                // process pasm (assembly) lines
                if (trimmedLine.length > 0) {
                    const lineParts: string[] = trimmedLine.split(/[ \t]/);
                    if (lineParts.length > 0 && lineParts[0].toUpperCase() == "END") {
                        this._logPASM('- scan SPIN PASM line trimmedLine=[' + trimmedLine + ']');
                        currState = prePasmState;
                        this._logState('- scan ln:' + i +' POP currState=[' + currState + ']');
                        // and ignore rest of this line
                    }
                    else {
                        this._getInlinePasmDeclaration(0, line)
                    }
                }
            }
            else if (currState == eParseState.inDatPasm) {
                // process pasm (assembly) lines
                if (trimmedLine.length > 0) {
                    const lineParts: string[] = trimmedLine .split(/[ \t]/);
                    if (lineParts.length > 0 && lineParts[0].toUpperCase() == "FIT") {
                        this._logPASM('- scan DAT PASM line trimmedLine=[' + trimmedLine + ']');
                        currState = prePasmState;
                        this._logState('- scan ln:' + i +' POP currState=[' + currState + ']');
                        // and ignore rest of this line
                    }
                    else {
                        this._getDataPasmDeclaration(0, line)
                    }
                }
            }
            else if (currState == eParseState.inPub || currState == eParseState.inPri) {
                // Detect start of INLINE PASM - org detect
                if (trimmedLine.length > 0) {
                    const lineParts: string[] = trimmedLine.split(/[ \t]/);
                    if (lineParts.length > 0 && lineParts[0].toUpperCase() == "ORG") {
                        this._logPASM('- scan PUB/PRI line trimmedLine=[' + trimmedLine + ']');
                        prePasmState = currState;
                        currState = eParseState.inPasmInline;
                        // and ignore rest of this line
                    }
                }
            }
        }
        // --------------------         End of PRE-PARSE             --------------------
        this._logMessage("---> Actual SCAN");

        //
        // Final PASS to identify all name references
        //
        currState = eParseState.Unknown;    // reset for 2nd pass
        priorState = currState;    // reset for 2nd pass
        prePasmState = currState;   // same

        const tokenSet: IParsedToken[] = [];

        // for each line do...
		for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            const sectionStatus = this._lineIsSectionStart(line);
            if (currState == eParseState.inMultiLineComment) {
                // in multi-line non-doc-comment, hunt for end '}' to exit
                let closingOffset = line.indexOf('}');
                if (closingOffset != -1) {
                    // have close, comment ended
                    currState = priorState;
                }
                //  DO NOTHING Let Syntax hightlighting do this
            }
            else if (currState == eParseState.inMultiLineDocComment) {
                // in multi-line doc-comment, hunt for end '}}' to exit
                let closingOffset = line.indexOf('}}');
                if (closingOffset != -1) {
                    // have close, comment ended
                    currState = priorState;
                }
                //  DO NOTHING Let Syntax hightlighting do this
            }
            else if (sectionStatus.isSectionStart) {
                currState = sectionStatus.inProgressStatus;
                this._logState('  -- ln:' + i +' currState=[' + currState + ']');
                // ID the section name
                // DON'T mark the section literal, Syntax hightlighting does this well!

                // ID the remainder of the line
                if (currState == eParseState.inPub || currState == eParseState.inPri) {
                    // process method signature
                    if (line.length > 3) {
                        const partialTokenSet: IParsedToken[] = this._reportMethodSignature(i, 3, line)
                        partialTokenSet.forEach(newToken => {
                            tokenSet.push(newToken);
                        });
                    }
                }
                else if (currState == eParseState.inCon) {
                    // process a possible constant use on the CON line itself!
                    if (line.length > 3) {
                        const partialTokenSet: IParsedToken[] = this._reportConstantDeclarationLine(i, 3, line)
                        partialTokenSet.forEach(newToken => {
                            tokenSet.push(newToken);
                        });
                    }
                }
                /*
                else {
                    // process possible comments on the SECTION line itself!
                    if (line.length > 3) {
                        const partialTokenSet: IParsedToken[] = this._reportComments(i, 3, line)
                        partialTokenSet.forEach(newToken => {
                            tokenSet.push(newToken);
                        });
                    }
                }
                */
            }
            else if (trimmedLine.startsWith("''")) {
                // process single line doc comment
                //  DO NOTHING Let Syntax hightlighting do this
            }
            else if (trimmedLine.startsWith("'")) {
                // process single line non-doc comment
                //  DO NOTHING Let Syntax hightlighting do this
            }
            else if (trimmedLine.startsWith("{{")) {
                // process multi-line doc comment
                let openingOffset = line.indexOf('{{');
                const closingOffset = line.indexOf('}}', openingOffset + 2);
                if (closingOffset != -1) {
                    // is single line comment, just ignore it Let Syntax hightlighting do this
                    currState = priorState;
                }
                else {
                    // is open of multiline comment
                    priorState = currState;
                    currState = eParseState.inMultiLineDocComment;
                    //  DO NOTHING Let Syntax hightlighting do this
                }
            }
            else if (trimmedLine.startsWith("{")) {
                // process possible multi-line non-doc comment
                // do we have a close on this same line?
                let openingOffset = line.indexOf('{');
                const closingOffset = line.indexOf('}', openingOffset + 1);
                if (closingOffset != -1) {
                    // is single line comment, just ignore it Let Syntax hightlighting do this
                    currState = priorState;
                }
                else {
                    // is open of multiline comment
                    priorState = currState;
                    currState = eParseState.inMultiLineComment;
                    //  DO NOTHING Let Syntax hightlighting do this
                }
            }
            else if (currState == eParseState.inCon) {
                // process a line in a constant section
                if (trimmedLine.length > 0) {
                    this._logCON('- process CON line trimmedLine=[' + trimmedLine + ']');
                    const partialTokenSet: IParsedToken[] = this._reportConstantDeclarationLine(i, 0, line)
                    partialTokenSet.forEach(newToken => {
                        tokenSet.push(newToken);
                    });
                }
            }
            else if (currState == eParseState.inDat) {
                // process a line in a data section
                if (trimmedLine.length > 0) {
                    this._logDAT('- process DAT line trimmedLine=[' + trimmedLine + ']');
                    const linePrefix: string = trimmedLine.substr(0, 3).toUpperCase();
                    if (linePrefix.startsWith("ORG")) {
                        prePasmState = currState;
                        currState = eParseState.inDatPasm;
                        // and ignore rest of this line
                    }
                    else {
                        const partialTokenSet: IParsedToken[] = this._reportDataDeclarationLine(i, 0, line)
                        partialTokenSet.forEach(newToken => {
                            tokenSet.push(newToken);
                        });
                    }
                }
            }
            else if (currState == eParseState.inVar) {
                // process a line in a variable data section
                if (trimmedLine.length > 0) {
                    this._logVAR('- process VAR line trimmedLine=[' + trimmedLine + ']');
                    const partialTokenSet: IParsedToken[] = this._reportVariableDeclarationLine(i, 0, line)
                    partialTokenSet.forEach(newToken => {
                        tokenSet.push(newToken);
                    });
                }
            }
            else if (currState == eParseState.inObj) {
                // process a line in an object section
                if (trimmedLine.length > 0) {
                    this._logOBJ('- process OBJ line trimmedLine=[' + trimmedLine + ']');
                    const partialTokenSet: IParsedToken[] = this._reportObjectDeclarationLine(i, 0, line)
                    partialTokenSet.forEach(newToken => {
                        tokenSet.push(newToken);
                    });
                }
            }
            else if (currState == eParseState.inDatPasm) {
                // process DAT section pasm (assembly) lines
                if (trimmedLine.length > 0) {
                    this._logPASM('- process DAT PASM line trimmedLine=[' + trimmedLine + ']');
                    // in DAT sections we end with FIT or just next section
                    const lineParts: string[] = trimmedLine.split(/[ \t]/);
                    if (lineParts.length > 0 && lineParts[0].toUpperCase() == "FIT") {
                        currState = prePasmState;
                        this._logState('- scan ln:' + i +' POP currState=[' + currState + ']');
                        // and ignore rest of this line
                    }
                    else {
                        const partialTokenSet: IParsedToken[] = this._reportLineOfDatPasmCode(i, 0, line)
                        partialTokenSet.forEach(newToken => {
                            tokenSet.push(newToken);
                        });
                    }
                }
            }
            else if (currState == eParseState.inPasmInline) {
                // process pasm (assembly) lines
                if (trimmedLine.length > 0) {
                    this._logPASM('- process SPIN2 PASM line trimmedLine=[' + trimmedLine + ']');
                    const lineParts: string[] = trimmedLine.split(/[ \t]/);
                    if (lineParts.length > 0 && lineParts[0].toUpperCase() == "END") {
                        currState = prePasmState;
                        this._logState('- scan ln:' + i +' POP currState=[' + currState + ']');
                        // and ignore rest of this line
                    }
                    else {
                        const partialTokenSet: IParsedToken[] = this._reportLineOfPasmCode(i, 0, line)
                        partialTokenSet.forEach(newToken => {
                            tokenSet.push(newToken);
                        });
                    }
                }
            }
            else if (currState == eParseState.inPub || currState == eParseState.inPri) {
                // process a method def'n line
                if (trimmedLine.length > 0) {
                    this._logCode('- process SPIN2 line trimmedLine=[' + trimmedLine + ']');
                    const lineParts: string[] = trimmedLine.split(/[ \t]/);
                    if (lineParts.length > 0 && lineParts[0].toUpperCase() == "ORG") {
                        prePasmState = currState;
                        currState = eParseState.inPasmInline;
                        // and ignore rest of this line
                    }
                    else {
                        const partialTokenSet: IParsedToken[] = this._reportLineOfSpinCode(i, 0, line)
                        partialTokenSet.forEach(newToken => {
                            tokenSet.push(newToken);
                        });
                    }
                }
            }
		}
		return tokenSet;
    }

    private _getMethodName(startingOffset: number, line: string): void
    {
        const methodType = line.substr(0, 3).toUpperCase();
        // reset our list of local variables
        const isPrivate = methodType.indexOf('PRI');
        //skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        const startName = currentOffset
        // find open paren
        currentOffset = line.indexOf('(', currentOffset);
        let nameLength = currentOffset - startName
        const newName = line.substr(startName, nameLength);
        // remember this method name so we can annotate a call to it
        if (!this.globalTokens.has(newName)) {
            const refModifiers: string[] = (isPrivate) ? [] : ['static']
            this.globalTokens.set(newName, {
                tokenType: 'method',
                tokenModifiers: refModifiers
            });
        }
    }

    private _getObjectDeclaration(startingOffset: number, line: string): void
    {
        // HAVE    color           : "isp_hub75_color"
        //  -or-   segments[7]     : "isp_hub75_segment"
        //
        //skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        // get line parts - we only care about first one
        const lineParts : string[] = line.substr(currentOffset).split(/[ \t\[]/)
        const newName = lineParts[0];
        this._logOBJ('  -- GetOBJDecl newName=[' + newName + ']');
        // remember this object name so we can annotate a call to it
        if (!this.globalTokens.has(newName)) {
            this.globalTokens.set(newName, {
                tokenType: 'namespace',
                tokenModifiers: []
            });
        }
    }

    private _getConstantDeclaration(startingOffset: number, line: string): void
    {
        // HAVE    DIGIT_NO_VALUE = -2   ' digit value when NOT [0-9]
        //  -or-   _clkfreq = CLK_FREQ   ' set system clock
        //
        if (line.substr(startingOffset).length > 1) {
            //skip Past Whitespace
            let currentOffset = this._skipWhite(line, startingOffset)
            const assignmentOffset = line.indexOf('=', currentOffset);
            const emumValueSepOffset = line.indexOf(',', currentOffset);
            if (assignmentOffset != -1) {
                // recognize constant name getting initialized
                // get line parts - we only care about first one
                const lineParts: string[] = line.substr(currentOffset).split(/[ \t=]/)
                const newName = lineParts[0];
                this._logCON('  -- GetCONDecl newName=[' + newName + ']');
                // remember this object name so we can annotate a call to it
                if (!this.globalTokens.has(newName)) {
                    this.globalTokens.set(newName, {
                        tokenType: 'variable',
                        tokenModifiers: ['readonly']
                    });
                }
            }
            else if (emumValueSepOffset != -1) {
                // recognize enum values getting initialized
                let beginCommentOffset = line.indexOf("'", currentOffset);
                if (beginCommentOffset === -1) {
                    beginCommentOffset = line.indexOf("{", currentOffset);
                }
                const nonCommentEOL = (beginCommentOffset != -1) ? beginCommentOffset - 1 : line.length - 1;
                const enumDefinitionStr = line.substr(currentOffset, nonCommentEOL - currentOffset + 1).trim();
                this._logCON('  -- GetCONDecl enumDefinitionStr=[' + enumDefinitionStr + ']');
                const lineParts: string[] = enumDefinitionStr.split(',');
                //this._logCON('  -- lineParts=[' + lineParts + ']');
                for (let index = 0; index < lineParts.length; index++) {
                    const enumConstant = lineParts[index].trim();
                    const valueSetOpOffset = enumConstant.indexOf('#');
                    if (valueSetOpOffset === -1) {
                        this._logCON('  -- enumConstant=[' + enumConstant + ']');
                        if (!this.globalTokens.has(enumConstant)) {
                            this.globalTokens.set(enumConstant, {
                                tokenType: 'enumMember',
                                tokenModifiers: []
                            });
                        }
                    }
                }
            }
        }
    }

    private _getInlinePasmDeclaration(startingOffset: number, line: string): void {
        // HAVE    bGammaEnable        BYTE   TRUE               ' comment
        //         didShow             byte   FALSE[256]
        let currentOffset = this._skipWhite(line, startingOffset)
    }

    private _getDataPasmDeclaration(startingOffset: number, line: string): void {
        // HAVE    bGammaEnable        BYTE   TRUE               ' comment
        //         didShow             byte   FALSE[256]
        let currentOffset = this._skipWhite(line, startingOffset)
    }

    private _getDataDeclaration(startingOffset: number, line: string): void
    {
        // HAVE    bGammaEnable        BYTE   TRUE               ' comment
        //         didShow             byte   FALSE[256]
        let currentOffset = this._skipWhite(line, startingOffset)
        // get line parts - we only care about first one
        let beginCommentOffset = line.indexOf("'", currentOffset);
        if (beginCommentOffset === -1) {
            beginCommentOffset = line.indexOf("{", currentOffset);
        }
        const nonCommentEOL = (beginCommentOffset != -1) ? beginCommentOffset - 1 : line.length - 1;
        const assignmentRHSStr = line.substr(currentOffset, nonCommentEOL - currentOffset + 1).trim();
        let lineParts: string[] | null = assignmentRHSStr.match(/[^ \t]+/g)
        if (lineParts === null) {
            lineParts = []
        }
        // remember this object name so we can annotate a call to it
        if (lineParts.length > 2) {
            if (this._isStorageType(lineParts[0])) {
                // if we start with storage type, not name, ignore line!
            }
            else {
                this._logDAT('- GetDatDecl lineParts=[' + lineParts + ']');
                const hasGoodType: boolean = this._isStorageType(lineParts[1])
                if (hasGoodType) {
                    let newName = lineParts[0];
                    this._logDAT('  -- newName=[' + newName + ']');
                    if (!this.globalTokens.has(newName)) {
                        this.globalTokens.set(newName, {
                            tokenType: 'variable',
                            tokenModifiers: ['static']
                        });
                    }
                } else if (!hasGoodType) {
                    this._logDAT('  -- BAD DATA TYPE: [' + lineParts[1] + ']');
                }
            }
        }
        else if (lineParts.length == 1) {
            // handle name declaration only line: [name 'comment]
            let newName = lineParts[0];
            if (!this._isAlignType(newName)) {
                this._logDAT('  -- newName=[' + newName + ']');
                if (!this.globalTokens.has(newName)) {
                    this.globalTokens.set(newName, {
                        tokenType: 'variable',
                        tokenModifiers: ['static']
                    });
                }
            }
        }
        else {
            this._logDAT('  -- SKIPPED: lineParts=[' + lineParts + ']');
        }
    }

    private _getVariableDeclaration(startingOffset: number, line: string): void
    {
        // HAVE    long    demoPausePeriod   ' comment
        //
        //skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        // get line parts - we only care about first one
        let lineParts: string[] | null = line.substr(currentOffset).match(/[^ \t]+/g)
        if (lineParts === null) {
            lineParts = []
        }
        //this._logVAR('- GetVarDecl lineParts=[' + lineParts + ']');
        // remember this object name so we can annotate a call to it
        // NOTE this is an instance-variable!
        const hasGoodType: boolean = this._isStorageType(lineParts[0]);
        if (hasGoodType && lineParts.length > 1) {
            let newName = lineParts[1];
            // remove array suffix from name
            if (newName.includes('[')) {
                const nameParts: string[] = newName.split('[');
                newName = nameParts[0];
            }
            this._logVAR('  -- GetVarDecl newName=[' + newName + ']');
            if (!this.globalTokens.has(newName)) {
                this.globalTokens.set(newName, {
                    tokenType: 'variable',
                    tokenModifiers: []
                });
            }
        } else if (!hasGoodType) {
            this._logVAR('  -- GetVarDecl BAD DATA TYPE: [' + lineParts[0] + ']');
        }
    }

    private _reportMethodSignature(lineNumber: number, startingOffset: number, line: string): IParsedToken[]
    {
        const tokenSet: IParsedToken[] = [];
        const methodType = line.substr(0, 3).toUpperCase();
        // reset our list of local variables
        this.localTokens.clear();
        const isPrivate = methodType.indexOf('PRI');
        //skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        const startName = currentOffset
        // find open paren - skipping past method name
        currentOffset = line.indexOf('(', currentOffset);
        let nameLength = currentOffset - startName
        const methodName: string = line.substr(startName, nameLength);
        // record definition of method
        const declModifiers : string[] = (isPrivate) ? ['declaration'] : ['declaration', 'static']
        tokenSet.push({
            line: lineNumber,
            startCharacter: startName,
            length: nameLength,
            tokenType: 'method',
            tokenModifiers: declModifiers
        });
        // and remember this so we can refer to it properly later
        if (!this.globalTokens.has(methodName)) {
            const refModifiers: string[] = (isPrivate) ? [] : ['static']
            this.globalTokens.set(line.substr(startName, nameLength), {
                tokenType: 'method',
                tokenModifiers: refModifiers
            });
        }
        this._logCode('-reportMethod: methodName=[' + methodName + ']');
        // find close paren - so we can study parameters
        const closeParenOffset = line.indexOf(')', currentOffset);
        if (closeParenOffset != -1 && currentOffset + 1 != closeParenOffset) {
            // we have parameter(s)!
            const parameterStr = line.substr(currentOffset + 1, (closeParenOffset - currentOffset) - 1).trim()
            let parameterNames: string[] = [];
            if (parameterStr.includes(',')) {
                // we have multiple parameters
                parameterNames = parameterStr.split(',');
            }
            else {
                // we have one parameter
                parameterNames = [parameterStr];
            }
            for (let index = 0; index < parameterNames.length; index++) {
                const paramName = parameterNames[index].trim();
                this._logCode('  -- paramName=[' + paramName + ']');
                const startIndex = line.indexOf(paramName, currentOffset + 1);
                tokenSet.push({
                    line: lineNumber,
                    startCharacter: startIndex,
                    length: paramName.length,
                    tokenType: 'parameter',
                    tokenModifiers: ['declaration','readonly', 'local']
                });
                // remember so we can ID references
                this.localTokens.set(paramName, {
                    tokenType: 'parameter',
                    tokenModifiers: ['readonly', 'local']
                });
            }
        }
        // find return vars
        const returnValueSep = line.indexOf(':', currentOffset);
        const localVarsSep = line.indexOf('|', currentOffset);
        let beginCommentOffset = line.indexOf("'", currentOffset);
        if (beginCommentOffset === -1) {
            beginCommentOffset = line.indexOf("{", currentOffset);
        }
        const nonCommentEOL = (beginCommentOffset != -1) ? beginCommentOffset - 1 : line.length - 1;
        const returnVarsEnd = (localVarsSep != -1) ? localVarsSep - 1 : nonCommentEOL;
        let returnValueNames: string[] = [];
        if (returnValueSep != -1) {
            // we have return var(s)!
            // we move currentOffset along so we don't falsely find short variable names earlier in string!
            currentOffset = returnValueSep + 1
            const varNameStr = line.substr(returnValueSep + 1, returnVarsEnd - returnValueSep).trim();
            if (varNameStr.indexOf(',')) {
                // have multiple return value names
                returnValueNames = varNameStr.split(',');
            }
            else {
                // have a single return value name
                returnValueNames = [varNameStr];
            }
            for (let index = 0; index < returnValueNames.length; index++) {
                const returnValueName = returnValueNames[index].trim();
                this._logCode('  -- returnValueName=[' + returnValueName + ']');
                const startIndex = line.indexOf(returnValueName, currentOffset + 1);
                tokenSet.push({
                    line: lineNumber,
                    startCharacter: startIndex,
                    length: returnValueName.length,
                    tokenType: 'returnValue',
                    tokenModifiers: ['declaration', 'local']
                });
                // remember so we can ID references
                this.localTokens.set(returnValueName, {
                    tokenType: 'returnValue',
                    tokenModifiers: ['local']
                });
                currentOffset += returnValueName.length + 1   // +1 for trailing comma
            }
        }
        // find local vars
        if (localVarsSep != -1) {
            // we have local var(s)!
            const localVarStr = line.substr(localVarsSep + 1, nonCommentEOL - localVarsSep).trim();
            // we move currentOffset along so we don't falsely find short variable names earlier in string!
            currentOffset = localVarsSep + 1
            let localVarNames: string[] = [];
            if (localVarStr.indexOf(',')) {
                // have multiple return value names
                localVarNames = localVarStr.split(',');
            }
            else {
                // have a single return value name
                localVarNames = [localVarStr];
            }
            for (let index = 0; index < localVarNames.length; index++) {
                const localVariableName = localVarNames[index].trim();
                const startIndex = line.indexOf(localVariableName, currentOffset);
                let nameParts: string[] = []
                if (localVariableName.includes(" ")) {
                    // have name with storage and/or alignment operators
                    nameParts = localVariableName.split(' ')
                }
                else {
                    // have single name
                    nameParts = [localVariableName]
                }
                this._logCode('  -- nameParts=[' + nameParts + ']');
                for (let index = 0; index < nameParts.length; index++) {
                    const localName = nameParts[index];
                    const localNameIndex = line.indexOf(localName, startIndex);
                    if (index == nameParts.length - 1) {
                        // have name
                        tokenSet.push({
                            line: lineNumber,
                            startCharacter: localNameIndex,
                            length: localName.length,
                            tokenType: 'variable',
                            tokenModifiers: ['declaration', 'local']
                        });
                        // remember so we can ID references
                        this.localTokens.set(localName, {
                            tokenType: 'variable',
                            tokenModifiers: ['local']
                        });
                        }
                    else {
                        // have modifier!
                        if (this._isStorageType(localName)) {
                            tokenSet.push({
                                line: lineNumber,
                                startCharacter: localNameIndex,
                                length: localName.length,
                                tokenType: 'storageType',
                                tokenModifiers: []
                            });
                        }
                        else if (this._isAlignType(localName)) {
                            tokenSet.push({
                                line: lineNumber,
                                startCharacter: localNameIndex,
                                length: localName.length,
                                tokenType: 'storageType',
                                tokenModifiers: []
                            });
                        }
                    }
                }
                currentOffset += localVariableName.length + 1   // +1 for trailing comma
            }
        }
        return tokenSet;
    }

    private _reportLineOfSpinCode(lineNumber: number, startingOffset: number, line: string): IParsedToken[]
    {
        const tokenSet: IParsedToken[] = [];
        // skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        const remainingLength: number = line.length - (currentOffset + 1);
        if (remainingLength > 0) {
            // locate key indicators of line style
            // TODO: UNDONE this should handle chained assignments:  varA := varB := 0
            let assignmentOffset = line.indexOf(':=', currentOffset);
            if (assignmentOffset != -1) {
                // -------------------------------------------
                // have line assigning value to new constant
                // -------------------------------------------
                const variableName = line.substr(currentOffset, (assignmentOffset - 1) - currentOffset).trim();
                if (variableName.includes("[")) {
                    // NOTE this handles code: byte[pColor][2] := {value}
                    // have complex target name, parse in loop
                    const variableNameParts: string[] = variableName.split(/[\[\]]/);
                    for (let index = 0; index < variableNameParts.length; index++) {
                        const variableNamePart = variableNameParts[index];
                        if (variableNamePart.substr(0, 1).match(/[a-zA-Z]/)) {
                            this._logCode('-code: variableNamePart=[' + variableNamePart + ']');
                            if (this._isStorageType(variableNamePart)) {
                                const startPos = line.indexOf(variableNamePart, currentOffset);
                                tokenSet.push({
                                    line: lineNumber,
                                    startCharacter: startPos,
                                    length: variableNamePart.length,
                                    tokenType: 'storageType',
                                    tokenModifiers: []
                                });
                            }
                            else {
                                let referenceDetails: IRememberedToken | undefined = undefined;
                                if (this.localTokens.has(variableName)) {
                                    referenceDetails = this.localTokens.get(variableName);
                                }
                                else if (this.globalTokens.has(variableName)) {
                                    referenceDetails = this.globalTokens.get(variableName);
                                }
                                if (referenceDetails != undefined) {
                                    let modificationArray: string[] = referenceDetails.tokenModifiers;
                                    modificationArray.push('modification');
                                    if (referenceDetails != undefined) {
                                        tokenSet.push({
                                            line: lineNumber,
                                            startCharacter: currentOffset,
                                            length: variableName.length,
                                            tokenType: referenceDetails.tokenType,
                                            tokenModifiers: modificationArray
                                        });
                                    }
                                }
                                else {
                                    // we don't have name registered so just mark it
                                    tokenSet.push({
                                        line: lineNumber,
                                        startCharacter: currentOffset,
                                        length: variableName.length,
                                        tokenType: 'variable',
                                        tokenModifiers: ['modification']
                                    });
                                }
                            }
                        }
                        currentOffset += variableNamePart.length + 1;
                    }
                }
                else {
                    // have simple target name
                    this._logCode('-code: variableName=[' + variableName + ']');
                    let referenceDetails: IRememberedToken | undefined = undefined;
                    if (this.localTokens.has(variableName)) {
                        referenceDetails = this.localTokens.get(variableName);
                    }
                    else if (this.globalTokens.has(variableName)) {
                        referenceDetails = this.globalTokens.get(variableName);
                    }
                    if (referenceDetails != undefined) {
                        let modificationArray: string[] = referenceDetails.tokenModifiers;
                        modificationArray.push('modification');
                        if (referenceDetails != undefined) {
                            tokenSet.push({
                                line: lineNumber,
                                startCharacter: currentOffset,
                                length: variableName.length,
                                tokenType: referenceDetails.tokenType,
                                tokenModifiers: modificationArray
                            });
                        }
                    }
                    else {
                        // we don't have name registered so just mark it
                        tokenSet.push({
                            line: lineNumber,
                            startCharacter: currentOffset,
                            length: variableName.length,
                            tokenType: 'variable',
                            tokenModifiers: ['modification']
                        });
                    }
                }
                currentOffset = assignmentOffset + 2;   // skip to RHS of assignment
            }
            let beginCommentOffset = line.indexOf("'", currentOffset);
            if (beginCommentOffset === -1) {
                beginCommentOffset = line.indexOf("{", currentOffset);
            }
            const nonCommentEOL = (beginCommentOffset != -1) ? beginCommentOffset - 1 : line.length - 1;
            const assignmentRHSStr = line.substr(currentOffset, nonCommentEOL - currentOffset + 1).trim();
            this._logCode('  -- assignmentRHSStr=[' + assignmentRHSStr + ']');
            let possNames: string[] = assignmentRHSStr.split(/[ \t\-\:\,\+\[\]\@\(\)]/);
            // special code to handle case range strings:  [e.g., SEG_TOP..SEG_BOTTOM:]
            const isCaseValue: boolean = assignmentRHSStr.endsWith(':');
            if (isCaseValue && possNames[0].includes("..")) {
                possNames = possNames[0].split("..");
            }
            for (let index = 0; index < possNames.length; index++) {
                const possibleName = possNames[index];
                const currPossibleLen = possibleName.length;
                if (currPossibleLen < 1) {
                    continue;
                }
                this._logCode('  -- possibleName=[' + possibleName + ']');
                let possibleNameSet: string[] = [];
                if (possibleName.substr(0, 1).match(/[a-zA-Z]/)) {
                    // does name contain a namespace reference?
                    if (possibleName.includes('.')) {
                        possibleNameSet = possibleName.split('.');
                    }
                    else {
                        possibleNameSet = [possibleName]
                    }
                    this._logCode('  --  possibleNameSet=[' + possibleNameSet + ']');
                    const namePart = possibleNameSet[0];
                    const searchString: string = (possibleNameSet.length == 1) ? possibleNameSet[0] : possibleNameSet[0] + '.' + possibleNameSet[1]
                    let referenceDetails: IRememberedToken | undefined = undefined;
                    if (this.localTokens.has(namePart)) {
                        referenceDetails= this.localTokens.get(namePart);
                        this._logCode('  --  FOUND local name=[' + namePart + ']');
                    } else if (this.globalTokens.has(namePart)) {
                        referenceDetails= this.globalTokens.get(namePart);
                        this._logCode('  --  FOUND global name=[' + namePart + ']');
                    }
                    if (referenceDetails != undefined) {
                        const startPos = line.indexOf(searchString, currentOffset);
                        tokenSet.push({
                            line: lineNumber,
                            startCharacter: startPos,
                            length: namePart.length,
                            tokenType: referenceDetails.tokenType,
                            tokenModifiers: referenceDetails.tokenModifiers
                        });
                    }
                    else {
                        // have unknown name!? is storage type spec?
                        if (this._isStorageType(namePart)) {
                            this._logCode('  --  storageType=[' + namePart + ']');
                            const startPos = line.indexOf(searchString, currentOffset);
                            tokenSet.push({
                                line: lineNumber,
                                startCharacter: startPos,
                                length: namePart.length,
                                tokenType: 'storageType',
                                tokenModifiers: []
                            });
                        }
                    }
                    if(possibleNameSet.length > 1) {
                        // we have .constant namespace suffix
                        // determine if this is method has '(' or constant name
                        const referenceOffset = line.indexOf(searchString, currentOffset);
                        let isMethod: boolean = false;
                        if (line.substr(referenceOffset + searchString.length, 1) == '(') {
                            isMethod = true;
                        }
                        const constantPart: string = possibleNameSet[1];
                        const startPos = line.indexOf(constantPart, currentOffset)
                        if (isMethod) {
                            tokenSet.push({
                                line: lineNumber,
                                startCharacter: startPos,
                                length: constantPart.length,
                                tokenType: 'method',
                                tokenModifiers: []
                            });
                            }
                        else {
                            tokenSet.push({
                                line: lineNumber,
                                startCharacter: startPos,
                                length: constantPart.length,
                                tokenType: 'variable',
                                tokenModifiers: ['readonly']
                            });
                        }
                    }
                }
                else if (possibleName.startsWith('.')) {
                    const externalMethodName: string = possibleName.replace('.','')
                    this._logCode('  --  externalMethodName=[' + externalMethodName + ']');
                    let referenceDetails: IRememberedToken | undefined = undefined;
                    const startPos = line.indexOf(externalMethodName, currentOffset);
                    tokenSet.push({
                        line: lineNumber,
                        startCharacter: startPos,
                        length: externalMethodName.length,
                        tokenType: 'method',
                        tokenModifiers: []
                    });
                }
                currentOffset += currPossibleLen + 1;
            }
        }
        return tokenSet;
    }

    private _reportLineOfPasmCode(lineNumber: number, startingOffset: number, line: string): IParsedToken[]
    {
        const tokenSet: IParsedToken[] = [];
        // skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        if (lineNumber) { }
        return tokenSet;
    }
    private _reportLineOfDatPasmCode(lineNumber: number, startingOffset: number, line: string): IParsedToken[]
    {
        const tokenSet: IParsedToken[] = [];
        // skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        if (lineNumber) { }
        return tokenSet;
    }

    private _reportConstantDeclarationLine(lineNumber: number, startingOffset: number, line: string): IParsedToken[]
    {
        const tokenSet: IParsedToken[] = [];
        // skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        const remainingLength: number = line.length - (currentOffset + 1);
        this._logCON('-reportConstant line=[' + line + '], currentOffset=[' + currentOffset + ']');
        //this._logCON('  -- remainingLength=[' + remainingLength + ']');
        if (remainingLength > 0) {
            // locate key indicators of line style
            let assignmentOffset = line.indexOf('=', currentOffset);
            //this._logCON('  -- assignmentOffset=[' + assignmentOffset + ']');
            if (assignmentOffset != -1) {
                // -------------------------------------------
                // have line assigning value to new constant
                // -------------------------------------------
                const constantName = line.substr(currentOffset, (assignmentOffset - 1) - currentOffset).trim();
                this._logCON('  -- constantName=[' + constantName + ']');
                tokenSet.push({
                    line: lineNumber,
                    startCharacter: currentOffset,
                    length: constantName.length,
                    tokenType: 'variable',
                    tokenModifiers: ['declaration', 'readonly']
                });

                // remember so we can ID references (if we don't know this name, yet)
                if (!this.globalTokens.has(constantName)) {
                    this.globalTokens.set(constantName, {
                        tokenType: 'variable',
                        tokenModifiers: ['readonly']
                    });
                }
                currentOffset = assignmentOffset + 1;   // skip to RHS of assignment
                let beginCommentOffset = line.indexOf("'", currentOffset);
                if (beginCommentOffset === -1) {
                    beginCommentOffset = line.indexOf("{", currentOffset);
                }
                const nonCommentEOL = (beginCommentOffset != -1) ? beginCommentOffset - 1 : line.length - 1;
                const assignmentRHSStr = line.substr(currentOffset, nonCommentEOL - currentOffset + 1).trim();
                this._logCON('  -- assignmentRHSStr=[' + assignmentRHSStr + ']');
                const possNames: string[] = assignmentRHSStr.split(/[ \t\(\)]/);
                this._logCON('  -- possNames=[' + possNames + ']');
                for (let index = 0; index < possNames.length; index++) {
                    const possibleName = possNames[index];
                    const currPossibleLen = possibleName.length;
                    if (currPossibleLen < 1) {
                        continue;
                    }
                    if (possibleName.substr(0, 1).match(/[a-zA-Z]/)) {
                        // does name contain a namespace reference?
                        this._logCON('  -- possibleName=[' + possibleName + ']');
                        let possibleNameSet: string[] = [];
                        if (possibleName.includes('.')) {
                            possibleNameSet = possibleName.split('.');
                        }
                        else {
                            possibleNameSet = [possibleName]
                        }
                        this._logCON('  --  possibleNameSet=[' + possibleNameSet + ']');
                        const namePart = possibleNameSet[0];
                        const searchString: string = (possibleNameSet.length == 1) ? possibleNameSet[0] : possibleNameSet[0] + '.' + possibleNameSet[1]
                        let referenceDetails: IRememberedToken | undefined = undefined;
                        if (this.globalTokens.has(namePart)) {
                            referenceDetails = this.globalTokens.get(namePart);
                            this._logCON('  --  FOUND global name=[' + namePart + ']');
                        }
                        if (referenceDetails != undefined) {
                            const startPos = line.indexOf(searchString, currentOffset);
                            tokenSet.push({
                                line: lineNumber,
                                startCharacter: startPos,
                                length: namePart.length,
                                tokenType: referenceDetails.tokenType,
                                tokenModifiers: referenceDetails.tokenModifiers
                            });
                        }
                        if (possibleNameSet.length > 1) {
                            // we have .constant namespace suffix
                            // this can NOT be a method name it can only be a constant name
                            const referenceOffset = line.indexOf(searchString, currentOffset);
                            const constantPart: string = possibleNameSet[1];
                            const startPos = line.indexOf(constantPart, referenceOffset)
                            tokenSet.push({
                                line: lineNumber,
                                startCharacter: startPos,
                                length: constantPart.length,
                                tokenType: 'variable',
                                tokenModifiers: ['readonly']
                            });
                        }
                    }
                    currentOffset += currPossibleLen + 1;
                }
            }
            let enumSeparatorOffset = line.indexOf(',', currentOffset);
            if (enumSeparatorOffset != -1) {
                // -------------------------------------------
                // have line creating set of enum constants
                // -------------------------------------------
                let beginCommentOffset = line.indexOf("'", currentOffset);
                if (beginCommentOffset === -1) {
                    beginCommentOffset = line.indexOf("{", currentOffset);
                }
                const nonCommentEOL = (beginCommentOffset != -1) ? beginCommentOffset - 1 : line.length - 1;
                // recognize enum values getting initialized
                const enumDefinitionStr = line.substr(currentOffset, nonCommentEOL - currentOffset + 1).trim();
                this._logCON('- reportConstant enumDefinitionStr=[' + enumDefinitionStr + ']');
                const lineParts: string[] = enumDefinitionStr.split(',');
                //this._logCON('  -- lineParts=[' + lineParts + ']');
                for (let index = 0; index < lineParts.length; index++) {
                    const enumConstant = lineParts[index].trim();
                    const valueSetOpOffset = enumConstant.indexOf('#');
                    if (valueSetOpOffset === -1) {
                        this._logCON('  -- enumConstant=[' + enumConstant + ']');
                        const startPos = line.indexOf(enumConstant, currentOffset)
                        tokenSet.push({
                            line: lineNumber,
                            startCharacter: startPos,
                            length: enumConstant.length,
                            tokenType: 'enumMember',
                            tokenModifiers: ['declaration']
                        });

                        // remember so we can ID references (if we don't know this name, yet)
                        if (!this.globalTokens.has(enumConstant)) {
                            this.globalTokens.set(enumConstant, {
                                tokenType: 'enumMember',
                                tokenModifiers: []
                            });
                        }
                    }
                }
            }
        }
        return tokenSet;
    }

    private _reportObjectDeclarationLine(lineNumber: number, startingOffset: number, line: string): IParsedToken[]
    {
        const tokenSet: IParsedToken[] = [];
        //skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        const remainingLength: number = line.length - (currentOffset + 1);
        if (remainingLength > 0) {
            // get line parts - initially, we only care about first one
            const lineParts: string[] = line.substr(currentOffset).split(/[ \t\[]/)
            const objectName = lineParts[0];
            const objectNameOffset: number = line.indexOf(objectName, currentOffset)
            tokenSet.push({
                line: lineNumber,
                startCharacter: objectNameOffset,
                length: objectName.length,
                tokenType: 'namespace',
                tokenModifiers: ['declaration']
            });
            const objArrayOpen: number = line.indexOf('[', currentOffset);
            if (objArrayOpen != -1) {
                // we have an array of objects, study the index value for possible named reference(s)
                const objArrayClose: number = line.indexOf(']', currentOffset);
                if (objArrayClose != -1) {
                    const elemCountStr: string = line.substr(objArrayOpen + 1, objArrayClose - objArrayOpen - 1);
                    // if we have a variable name...
                    if (elemCountStr.substr(0, 1).match(/[a-zA-Z]/)) {
                        let possibleNameSet: string[] = [];
                        // is it a namespace reference?
                        if (elemCountStr.includes('.')) {
                            possibleNameSet = elemCountStr.split('.');
                        }
                        else {
                            possibleNameSet = [elemCountStr]
                        }
                        for (let index = 0; index < possibleNameSet.length; index++) {
                            const nameReference = possibleNameSet[index];
                            if (this.globalTokens.has(nameReference)) {
                                const referenceDetails: IRememberedToken | undefined = this.globalTokens.get(nameReference);
                                const startPos = line.indexOf(nameReference, currentOffset)
                                if (referenceDetails != undefined) {
                                    tokenSet.push({
                                        line: lineNumber,
                                        startCharacter: startPos,
                                        length: nameReference.length,
                                        tokenType: referenceDetails.tokenType,
                                        tokenModifiers: referenceDetails.tokenModifiers
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        return tokenSet;
    }

    private _reportDataDeclarationLine(lineNumber: number, startingOffset: number, line: string): IParsedToken[]
    {
		const tokenSet: IParsedToken[] = [];
        //skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        // get line parts - we only care about first one
        let lineParts: string[] | null = line.substr(currentOffset).match(/[^ \t]+/g)
        if (lineParts === null) {
            lineParts = []
        }
        //this._logVAR('- rptVarDecl lineParts=[' + lineParts + ']');
        // remember this object name so we can annotate a call to it
        if (lineParts.length > 2) {
            if (this._isStorageType(lineParts[0])) {
                // if we start with storage type, not name, ignore line!
            }
            else {
                // this is line with name storageType and initial value
                this._logDAT('- rptDatDecl lineParts=[' + lineParts + ']');
                let newName = lineParts[0];
                // remove array suffix from name
                this._logDAT('  -- newName=[' + newName + ']');
                const startIndex: number = line.indexOf(newName, currentOffset)
                tokenSet.push({
                    line: lineNumber,
                    startCharacter: startIndex,
                    length: newName.length,
                    tokenType: 'variable',
                    tokenModifiers: ['declaration','static']
                });
                if (!this.globalTokens.has(newName)) {
                    this.globalTokens.set(newName, {
                        tokenType: 'variable',
                        tokenModifiers: ['static']
                    });
                }
            }
        }
        else if (lineParts.length == 1) {
            // handle name declaration only line: [name 'comment]
            let newName = lineParts[0];
            if (!this._isAlignType(newName)) {
                this._logDAT('  -- newName=[' + newName + ']');
                const startIndex: number = line.indexOf(newName, currentOffset)
                tokenSet.push({
                    line: lineNumber,
                    startCharacter: startIndex,
                    length: newName.length,
                    tokenType: 'variable',
                    tokenModifiers: ['declaration', 'static']
                });
                if (!this.globalTokens.has(newName)) {
                    this.globalTokens.set(newName, {
                        tokenType: 'variable',
                        tokenModifiers: ['static']
                    });
                }
            }
        }
        else {
            this._logDAT('  -- SKIPPED: lineParts=[' + lineParts + ']');
        }
        return tokenSet;
    }

    private _reportVariableDeclarationLine(lineNumber: number, startingOffset: number, line: string): IParsedToken[]
    {
		const tokenSet: IParsedToken[] = [];
        //skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        // get line parts - we only care about first one
        let lineParts: string[] | null = line.substr(currentOffset).match(/[^ \t]+/g)
        if (lineParts === null) {
            lineParts = []
        }
        //this._logVAR('- rptVarDecl lineParts=[' + lineParts + ']');
        // remember this object name so we can annotate a call to it
        let hasArrayReference: boolean = false;
        if (lineParts.length > 1) {
            let newName = lineParts[1];
            // remove array suffix from name
            if (newName.includes('[')) {
                const nameParts: string[] = newName.split('[');
                hasArrayReference = true;
                newName = nameParts[0];
            }
            this._logVAR('  -- rptVarDecl newName=[' + newName + ']');
            const startIndex :number = line.indexOf(newName, currentOffset)
            tokenSet.push({
                line: lineNumber,
                startCharacter: startIndex,
                length: newName.length,
                tokenType: 'variable',
                tokenModifiers: ['declaration']
            });
            if (!this.globalTokens.has(newName)) {
                this.globalTokens.set(newName, {
                    tokenType: 'variable',
                    tokenModifiers: []
                });
            }
            if (hasArrayReference) {
                const arrayOpenOffset: number = line.indexOf('[');
                const arrayCloseOffset: number = line.indexOf(']');
                const arrayReference: string = line.substr(arrayOpenOffset+1, arrayCloseOffset - arrayOpenOffset - 1);
                const arrayReferenceParts: string[] = arrayReference.split(/[ \t]/)
                this._logVAR('  --  arrayReferenceParts=[' + arrayReferenceParts + ']');
                for (let index = 0; index < arrayReferenceParts.length; index++) {
                    const referenceName = arrayReferenceParts[index];
                    if (referenceName.substr(0, 1).match(/[a-zA-Z]/)) {
                        let possibleNameSet: string[] = [];
                        // is it a namespace reference?
                        if (referenceName.includes('.')) {
                            possibleNameSet = referenceName.split('.');
                        }
                        else {
                            possibleNameSet = [referenceName]
                        }
                        this._logVAR('  --  possibleNameSet=[' + possibleNameSet + ']');
                        const namePart = possibleNameSet[0];
                        if (this.globalTokens.has(namePart)) {
                            const referenceDetails: IRememberedToken | undefined = this.globalTokens.get(namePart);
                            const searchString: string = (possibleNameSet.length == 1) ? possibleNameSet[0] : possibleNameSet[0] + '.' + possibleNameSet[1]
                            const startPos = line.indexOf(searchString, currentOffset)
                            if (referenceDetails != undefined) {
                                tokenSet.push({
                                    line: lineNumber,
                                    startCharacter: startPos,
                                    length: namePart.length,
                                    tokenType: referenceDetails.tokenType,
                                    tokenModifiers: referenceDetails.tokenModifiers
                                });
                            }
                        }
                        if(possibleNameSet.length > 1) {
                            // we have .constant namespace suffix
                            const constantPart: string = possibleNameSet[1];
                            const startPos = line.indexOf(constantPart, currentOffset)
                            tokenSet.push({
                                line: lineNumber,
                                startCharacter: startPos,
                                length: constantPart.length,
                                tokenType: 'variable',
                                tokenModifiers: ['readonly']
                            });
                        }
                    }
                }
            }
        }
        return tokenSet;
    }

    private _reportComments(lineNumber: number, startingOffset: number, line: string): IParsedToken[]
    {
        // recognize all single line comment forms and mark them!
		const tokenSet: IParsedToken[] = [];
        let currentOffset = startingOffset;
        do {
            let needDocClose: boolean = false;
            let needNonDocClose: boolean = false;
            let closeOffset = line.length - 1;
            let openOffset = line.indexOf('{{', currentOffset);
            if (openOffset === -1) {
                openOffset = line.indexOf('{', currentOffset);
                if (openOffset === -1) {
                    openOffset = line.indexOf("''", currentOffset);
                    if (openOffset === -1) {
                        openOffset = line.indexOf("'", currentOffset);
                    }
                }
                else {
                    needNonDocClose = true; // nust have '}' on same line to close
                }
            }
            else {
                needDocClose = true; // nust have '}}' on same line to close
            }
            if (openOffset === -1) {
                break;
            }
            if (needNonDocClose) {
                closeOffset = line.indexOf('}}', openOffset);
            }
            else if (needDocClose) {
                closeOffset = line.indexOf('}', openOffset);
            }
            if ((needDocClose || needNonDocClose) && closeOffset === -1) {
                break;
            }
            // record this comment
            tokenSet.push({
                line: lineNumber,
                startCharacter: openOffset,
                length: closeOffset - openOffset + 1,
                tokenType: 'comment',
                tokenModifiers: []
            });
            currentOffset = closeOffset;
            if(currentOffset == line.length - 1) {
                break;
            }
        } while (true);
        return tokenSet;
    }

    private _lineIsSectionStart(line: string): { isSectionStart: boolean, inProgressStatus: eParseState }  {
        // return T/F where T means our string starts a new section!
        let startStatus: boolean = false;
        let inProgressState: eParseState = eParseState.Unknown;
        if(line.length > 2) {
            const lineParts: string[] = line.split(/[ \t]/);
            if (lineParts.length > 0) {
                const sectionName: string = lineParts[0].toUpperCase();
                startStatus = true;
                if (sectionName === "CON") {
                    inProgressState = eParseState.inCon;
                }
                else if (sectionName === "DAT") {
                    inProgressState = eParseState.inDat;
                }
                else if (sectionName === "OBJ") {
                    inProgressState = eParseState.inObj;
                }
                else if (sectionName === "PUB") {
                    inProgressState = eParseState.inPub;
                }
                else if (sectionName === "PRI") {
                    inProgressState = eParseState.inPri;
                }
                else if (sectionName === "VAR") {
                    inProgressState = eParseState.inVar;
                }
                else {
                    startStatus = false;
                }
            }
        }
        //if (startStatus) {
        //    this._logMessage('- isSectStart line=[' + line + ']');
        //}
        return {
			isSectionStart: startStatus,
			inProgressStatus: inProgressState
		};
    }

    private _isStorageType(name: string): boolean
    {
        let returnStatus: boolean = false;
        if (name.length > 3) {
            const checkType: string = name.toUpperCase();
            if (checkType == "BYTE" || checkType == "WORD" || checkType == "LONG") {
                returnStatus = true;
            }
        }
        return returnStatus;
    }

    private _isAlignType(name: string): boolean
    {
        let returnStatus: boolean = false;
        if (name.length > 5) {
            const checkType: string = name.toUpperCase();
            if (checkType == "ALIGNL" || checkType == "ALIGNW") {
                returnStatus = true;
            }
        }
        return returnStatus;
    }

private _skipWhite(line: string, currentOffset : number) : number
    {
        let firstNonWhiteIndex: number = currentOffset;
        for (let index = currentOffset; index < line.length; index++) {
            if (line.substr(index, 1) != ' ' && line.substr(index, 1) != '\t') {
                firstNonWhiteIndex = index;
                break;
            }
        }
        return firstNonWhiteIndex
    }


}
