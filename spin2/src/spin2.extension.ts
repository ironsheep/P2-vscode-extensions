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
		'modification', 'async', 'definition', 'defaultLibrary', 'local', 'instance'
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
    private localPasmTokensByMethodName = new Map<string, Map<string, IRememberedToken>>();
    private conEnumInProgress: boolean = false;

    private currentMethodName: string = "";

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
            const trimmedNonCOmmentLine = this._getNonCommentLineRemainder(0, line);
            const sectionStatus = this._isSectionStartLine(line);
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
                this._logState('- scan ln:' + i+1 + ' currState=[' + currState + ']');
                // ID the remainder of the line
                if (currState == eParseState.inPub || currState == eParseState.inPri) {
                    // process method signature
                    if (trimmedNonCOmmentLine.length > 3) {
                        this._getPUB_PRI_Name(3, line)
                    }
                }
                else if (currState == eParseState.inCon) {
                    // process a constant line
                    if (trimmedNonCOmmentLine.length > 3) {
                        this._getCON_Declaration(3, line)
                    }
                }
                else if (currState == eParseState.inDat) {
                    // process a data line
                    //this._logPASM('- ('+ i + 1 +'): pre-scan DAT line trimmedLine=[' + trimmedLine + ']');
                    if (trimmedNonCOmmentLine.length > 6) {
                        if (trimmedLine.toUpperCase().includes("ORG")) { // ORG, ORGF, ORGH
                            this._logPASM('- ('+ i + 1 +'): pre-scan DAT line trimmedLine=[' + trimmedLine + '] now Dat PASM');
                            prePasmState = currState;
                            currState = eParseState.inDatPasm;
                            // and ignore rest of this line
                            continue;
                        }
                    }
                    this._getDAT_Declaration(0, line)
                }
                else if (currState == eParseState.inObj) {
                    // process a constant line
                    if (trimmedNonCOmmentLine.length > 3) {
                        this._getOBJ_Declaration(3, line)
                    }
                }
                else if (currState == eParseState.inVar) {
                    // process a constant line
                    if (trimmedNonCOmmentLine.length > 3) {
                        this._getVAR_Declaration(3, line)
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
                    this._getCON_Declaration(0, line)
                }
            }
            else if (currState == eParseState.inDat) {
                // process a data line
                if (trimmedLine.length > 0) {
                    if (trimmedLine.length > 6) {
                        if (trimmedLine.toUpperCase().includes("ORG")) { // ORG, ORGF, ORGH
                            this._logPASM('- ('+ i + 1 +'): pre-scan DAT line trimmedLine=[' + trimmedLine + '] now Dat PASM');
                            prePasmState = currState;
                            currState = eParseState.inDatPasm;
                            // and ignore rest of this line
                            continue;
                        }
                    }
                    this._getDAT_Declaration(0, line)
                }
            }
            else if (currState == eParseState.inVar) {
                // process a variable declaration line
                if (trimmedLine.length > 0) {
                    this._getVAR_Declaration(0, line)
                }
            }
            else if (currState == eParseState.inObj) {
                // process an object declaration line
                if (trimmedLine.length > 0) {
                    this._getOBJ_Declaration(0, line)
                }
            }
            else if (currState == eParseState.inPasmInline) {
                // process pasm (assembly) lines
                if (trimmedLine.length > 0) {
                    const lineParts: string[] = trimmedLine.split(/[ \t]/);
                    if (lineParts.length > 0 && lineParts[0].toUpperCase() == "END") {
                        this._logPASM('- ('+ i + 1 +'): pre-scan SPIN PASM line trimmedLine=[' + trimmedLine + ']');
                        currState = prePasmState;
                        this._logState('- scan ln:' + i+1 + ' POP currState=[' + currState + ']');
                        // and ignore rest of this line
                    }
                    else {
                        this._getSPIN_PasmDeclaration(0, line)
                    }
                }
            }
            else if (currState == eParseState.inDatPasm) {
                // process pasm (assembly) lines
                if (trimmedLine.length > 0) {
                    const lineParts: string[] = trimmedLine.split(/[ \t]/);
                    if (lineParts.length > 0 && lineParts[0].toUpperCase() == "FIT") {
                        this._logPASM('- ('+ i + 1 +'): pre-scan DAT PASM line trimmedLine=[' + trimmedLine + ']');
                        currState = prePasmState;
                        this._logState('- scan ln:' + i+1 + ' POP currState=[' + currState + ']');
                        // and ignore rest of this line
                    }
                    else {
                        this._getDAT_PasmDeclaration(0, line)
                    }
                }
            }
            else if (currState == eParseState.inPub || currState == eParseState.inPri) {
                // Detect start of INLINE PASM - org detect
                if (trimmedLine.length > 0) {
                    const lineParts: string[] = trimmedLine.split(/[ \t]/);
                    if (lineParts.length > 0 && lineParts[0].toUpperCase() == "ORG") {  // Only ORG not ORGF, ORGH
                        this._logPASM('- ('+ i + 1 +'): pre-scan PUB/PRI line trimmedLine=[' + trimmedLine + ']');
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
            const sectionStatus = this._isSectionStartLine(line);
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
                this._logState('  -- ln:' + i+1 + ' currState=[' + currState + ']');
                // ID the section name
                // DON'T mark the section literal, Syntax hightlighting does this well!

                // ID the remainder of the line
                if (currState == eParseState.inPub || currState == eParseState.inPri) {
                    // process method signature
                    if (line.length > 3) {
                        const partialTokenSet: IParsedToken[] = this._reportPUB_PRI_Signature(i, 3, line)
                        partialTokenSet.forEach(newToken => {
                            tokenSet.push(newToken);
                        });
                    }
                }
                else if (currState == eParseState.inCon) {
                    this.conEnumInProgress = false; // so we can tell in CON processor when to allow isolated names
                    // process a possible constant use on the CON line itself!
                    if (line.length > 3) {
                        const partialTokenSet: IParsedToken[] = this._reportCON_DeclarationLine(i, 3, line)
                        partialTokenSet.forEach(newToken => {
                            tokenSet.push(newToken);
                        });
                    }
                }
                else if (currState == eParseState.inDat) {
                    // process a possible constant use on the CON line itself!
                    if (line.length > 3) {
                        if (trimmedLine.length > 6) {
                            const nonCommentLineRemainder: string = this._getNonCommentLineRemainder(0, trimmedLine);
                            const orgOffset: number = nonCommentLineRemainder.toUpperCase().indexOf("ORG"); // ORG, ORGF, ORGH
                            if (orgOffset != -1) {
                                this._logPASM('- (' + i + 1 + '): scan DAT line nonCommentLineRemainder=[' + nonCommentLineRemainder + ']');

                                // process remainder of ORG line
                                const nonCommentOffset = line.indexOf(nonCommentLineRemainder, 0);
                                // lineNumber, currentOffset, line, allowLocalVarStatus, this.showPasmCode
                                const allowLocalVarStatus: boolean = false;
                                const partialTokenSet: IParsedToken[] = this._reportDAT_ValueDeclarationCode(i, nonCommentOffset + orgOffset + 3, line, allowLocalVarStatus, this.showDAT);
                                partialTokenSet.forEach(newToken => {
                                    tokenSet.push(newToken);
                                });

                                prePasmState = currState;
                                currState = eParseState.inDatPasm;
                                // and ignore rest of this line
                                continue;
                            }
                        }
                        const partialTokenSet: IParsedToken[] = this._reportDAT_DeclarationLine(i, 3, line)
                        partialTokenSet.forEach(newToken => {
                            tokenSet.push(newToken);
                        });
                    }
                }
                else if (currState == eParseState.inObj) {
                    // process a possible constant use on the CON line itself!
                    if (line.length > 3) {
                        const partialTokenSet: IParsedToken[] = this._reportOBJ_DeclarationLine(i, 3, line)
                        partialTokenSet.forEach(newToken => {
                            tokenSet.push(newToken);
                        });
                    }
                }
                else if (currState == eParseState.inVar) {
                    // process a possible constant use on the CON line itself!
                    if (line.length > 3) {
                        const partialTokenSet: IParsedToken[] = this._reportVAR_DeclarationLine(i, 3, line)
                        partialTokenSet.forEach(newToken => {
                            tokenSet.push(newToken);
                        });
                    }
                }
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
                    this._logCON('- process CON line(' + i+1 + '):  trimmedLine=[' + trimmedLine + ']');
                    const partialTokenSet: IParsedToken[] = this._reportCON_DeclarationLine(i, 0, line)
                    partialTokenSet.forEach(newToken => {
                        tokenSet.push(newToken);
                    });
                }
            }
            else if (currState == eParseState.inDat) {
                // process a line in a data section
                if (trimmedLine.length > 0) {
                    this._logDAT('- process DAT line(' + i+1 + '): trimmedLine=[' + trimmedLine + ']');
                    const linePrefix: string = trimmedLine.substr(0, 3).toUpperCase();
                    const nonCommentLineRemainder: string = this._getNonCommentLineRemainder(0, trimmedLine);
                    const orgOffset: number = nonCommentLineRemainder.toUpperCase().indexOf("ORG"); // ORG, ORGF, ORGH
                    if (orgOffset != -1) {
                        // process remainder of ORG line
                        const nonCommentOffset = line.indexOf(nonCommentLineRemainder, 0);
                        // lineNumber, currentOffset, line, allowLocalVarStatus, this.showPasmCode
                        const allowLocalVarStatus: boolean = false;
                        const partialTokenSet: IParsedToken[] = this._reportDAT_ValueDeclarationCode(i, nonCommentOffset + orgOffset + 3, line, allowLocalVarStatus, this.showDAT);
                        partialTokenSet.forEach(newToken => {
                            tokenSet.push(newToken);
                        });

                        prePasmState = currState;
                        currState = eParseState.inDatPasm;
                        // and ignore rest of this line
                    }
                    else {
                        const partialTokenSet: IParsedToken[] = this._reportDAT_DeclarationLine(i, 0, line)
                        partialTokenSet.forEach(newToken => {
                            tokenSet.push(newToken);
                        });
                    }
                }
            }
            else if (currState == eParseState.inVar) {
                // process a line in a variable data section
                if (trimmedLine.length > 0) {
                    this._logVAR('- process VAR line(' + i+1 + '):  trimmedLine=[' + trimmedLine + ']');
                    const partialTokenSet: IParsedToken[] = this._reportVAR_DeclarationLine(i, 0, line)
                    partialTokenSet.forEach(newToken => {
                        tokenSet.push(newToken);
                    });
                }
            }
            else if (currState == eParseState.inObj) {
                // process a line in an object section
                if (trimmedLine.length > 0) {
                    this._logOBJ('- process OBJ line(' + i+1 + '):  trimmedLine=[' + trimmedLine + ']');
                    const partialTokenSet: IParsedToken[] = this._reportOBJ_DeclarationLine(i, 0, line)
                    partialTokenSet.forEach(newToken => {
                        tokenSet.push(newToken);
                    });
                }
            }
            else if (currState == eParseState.inDatPasm) {
                // process DAT section pasm (assembly) lines
                if (trimmedLine.length > 0) {
                    this._logPASM('- process DAT PASM line(' + i+1 + '):  trimmedLine=[' + trimmedLine + ']');
                    // in DAT sections we end with FIT or just next section
                    const partialTokenSet: IParsedToken[] = this._reportDAT_PasmCode(i, 0, line)
                    partialTokenSet.forEach(newToken => {
                        tokenSet.push(newToken);
                    });
                    const lineParts: string[] = trimmedLine.split(/[ \t]/);
                    if (lineParts.length > 0 && lineParts[0].toUpperCase() == "FIT") {
                        currState = prePasmState;
                        this._logState('- scan ln:' + i+1 + ' POP currState=[' + currState + ']');
                        // and ignore rest of this line
                    }
                }
            }
            else if (currState == eParseState.inPasmInline) {
                // process pasm (assembly) lines
                if (trimmedLine.length > 0) {
                    this._logPASM('- process SPIN2 PASM line(' + i+1 + '):  trimmedLine=[' + trimmedLine + ']');
                    const lineParts: string[] = trimmedLine.split(/[ \t]/);
                    if (lineParts.length > 0 && lineParts[0].toUpperCase() == "END") {
                        currState = prePasmState;
                        this._logState('- scan ln:' + i+1 + ' POP currState=[' + currState + ']');
                        // and ignore rest of this line
                    }
                    else {
                        const partialTokenSet: IParsedToken[] = this._reportSPIN_PasmCode(i, 0, line)
                        partialTokenSet.forEach(newToken => {
                            tokenSet.push(newToken);
                        });
                    }
                }
            }
            else if (currState == eParseState.inPub || currState == eParseState.inPri) {
                // process a method def'n line
                if (trimmedLine.length > 0) {
                    this._logSPIN('- process SPIN2 line(' + i+1 + '): trimmedLine=[' + trimmedLine + ']');
                    const lineParts: string[] = trimmedLine.split(/[ \t]/);
                    if (lineParts.length > 0 && lineParts[0].toUpperCase() == "ORG") {  // Only ORG not ORGF, ORGH
                        prePasmState = currState;
                        currState = eParseState.inPasmInline;
                        // and ignore rest of this line
                    }
                    else {
                        const partialTokenSet: IParsedToken[] = this._reportSPIN_Code(i, 0, line)
                        partialTokenSet.forEach(newToken => {
                            tokenSet.push(newToken);
                        });
                    }
                }
            }
        }
        this._checkTokenSet(tokenSet);
        return tokenSet;
    }

    private _getCON_Declaration(startingOffset: number, line: string): void {
        // HAVE    DIGIT_NO_VALUE = -2   ' digit value when NOT [0-9]
        //  -or-   _clkfreq = CLK_FREQ   ' set system clock
        //
        if (line.substr(startingOffset).length > 1) {
            //skip Past Whitespace
            let currentOffset = this._skipWhite(line, startingOffset)
            const nonCommentConstantLine = this._getNonCommentLineRemainder(currentOffset, line);
            this._logCON('  -- GetCONDecl nonCommentConstantLine=[' + nonCommentConstantLine + ']');

            const haveEnumDeclaration: boolean = (nonCommentConstantLine.indexOf('#') != -1);
            const containsMultiAssignments: boolean = (nonCommentConstantLine.indexOf(',') != -1);
            let statements: string[] = [nonCommentConstantLine];
            if (!haveEnumDeclaration && containsMultiAssignments) {
                statements =  nonCommentConstantLine.split(',')
            }
            this._logCON('  -- statements=[' + statements + ']');
            for (let index = 0; index < statements.length; index++) {
                const conDeclarationLine: string = statements[index].trim();
                this._logCON('  -- conDeclarationLine=[' + conDeclarationLine + ']');
                currentOffset = line.indexOf(conDeclarationLine, currentOffset)
                const assignmentOffset: number = conDeclarationLine.indexOf('=');
                if (assignmentOffset != -1) {
                    // recognize constant name getting initialized via assignment
                    // get line parts - we only care about first one
                    const lineParts: string[] = line.substr(currentOffset).split(/[ \t=]/)
                    const newName = lineParts[0];
                    if (newName.substr(0, 1).match(/[a-zA-Z_]/)) {
                        this._logCON('  -- GetCONDecl newName=[' + newName + ']');
                        // remember this object name so we can annotate a call to it
                        this._setGlobalToken(newName, {
                            tokenType: 'variable',
                            tokenModifiers: ['readonly']
                        })
                    }
                }
                else {
                    // recognize enum values getting initialized
                    const lineParts: string[] = conDeclarationLine.split(/[ \t,]/);
                    //this._logCON('  -- lineParts=[' + lineParts + ']');
                    for (let index = 0; index < lineParts.length; index++) {
                        let enumConstant: string = lineParts[index];
                        // our enum name can have a step offset
                        if (enumConstant.includes('[')) {
                            // it does, isolate name from offset
                            const enumNameParts: string[] = enumConstant.split('[');
                            enumConstant = enumNameParts[0];
                        }
                        if (enumConstant.substr(0, 1).match(/[a-zA-Z_]/)) {
                            this._logCON('  -- enumConstant=[' + enumConstant + ']');
                            this._setGlobalToken(enumConstant, {
                                tokenType: 'enumMember',
                                tokenModifiers: []
                            })
                        }
                    }
                }
            }
        }
    }

    private _getDAT_Declaration(startingOffset: number, line: string): void {
        // HAVE    bGammaEnable        BYTE   TRUE               ' comment
        //         didShow             byte   FALSE[256]
        let currentOffset = this._skipWhite(line, startingOffset)
        // get line parts - we only care about first one
        const dataDeclNonCommentStr = this._getNonCommentLineRemainder(currentOffset, line);
        let lineParts: string[] = this._getNonWhiteLineParts(dataDeclNonCommentStr);
        // remember this object name so we can annotate a call to it
        if (lineParts.length > 1) {
            if (this._isStorageType(lineParts[0])) {
                // if we start with storage type, not name, ignore line!
            }
            else {
                this._logDAT('- GetDatDecl lineParts=[' + lineParts + '](' + lineParts.length + ')');
                const hasGoodType: boolean = this._isDatNFileStorageType(lineParts[1]);
                const preceedsIf: boolean = lineParts[1].toUpperCase().startsWith('IF_');
                const isNoOtPasmOpcode: boolean = !this._isPasmInstruction(lineParts[0]);
                if (hasGoodType || preceedsIf || isNoOtPasmOpcode) {
                    let newName = lineParts[0];
                    const nameType: string = (hasGoodType) ? 'variable' : 'label'
                    this._logDAT('  -- newName=[' + newName + '](' + nameType + ')');
                    this._setGlobalToken(newName, {
                        tokenType: nameType,
                        tokenModifiers: []
                    })
                } else {
                    if (!hasGoodType) {
                        this._logDAT('  -- GetDatDecl BAD DATA TYPE');
                    }
                    if (!preceedsIf) {
                        this._logDAT('  -- GetDatDecl No IF_ prefix');
                    }
                    if (!isNoOtPasmOpcode) {
                        this._logDAT('  -- GetDatDecl is instruction! [' + lineParts[0] + ']');
                    }
                }
            }
        }
        else if (lineParts.length == 1) {
            // handle name declaration only line: [name 'comment]
            let newName = lineParts[0];
            if (!this._isAlignType(newName) && !this._isPasmNonArgumentInstruction(newName)) {  // don't show ALIGNW/L they're not variable names
                this._logDAT('  -- newName=[' + newName + ']');
                this._setGlobalToken(newName, {
                    tokenType: 'variable',
                    tokenModifiers: []
                })
            }
        }
        else {
            this._logDAT('  -- getDAT SKIPPED: lineParts=[' + lineParts + ']');
        }
    }

    private _getDAT_PasmDeclaration(startingOffset: number, line: string): void {
        // HAVE    bGammaEnable        BYTE   TRUE               ' comment
        //         didShow             byte   FALSE[256]
        let currentOffset = this._skipWhite(line, startingOffset)
        // get line parts - we only care about first one
        const datPasmRHSStr = this._getNonCommentLineRemainder(currentOffset, line);
        const lineParts: string[] = this._getNonWhiteLineParts(datPasmRHSStr);
        //this._logPASM('- GetDATPasmDecl lineParts=[' + lineParts + ']');
        // handle name in 1 column
        const isDataDeclarationLine: boolean = (lineParts.length > 1 && this._isDatStorageType(lineParts[1]));
        if (line.substr(0, 1).match(/[a-zA-Z_\.\:]/)) {
            const labelName: string = lineParts[0];
            if (labelName.toUpperCase() != "ORG" && !labelName.toUpperCase().startsWith("IF_")) { // org in first column is not label name, nor is if_ conditional
                const labelType: string = (isDataDeclarationLine) ? 'variable' : 'label';
                this._logPASM('  -- DAT PASM labelName=[' + labelName + '(' + labelType + ')]');
                this._setGlobalToken(labelName, {
                    tokenType: labelType,
                    tokenModifiers: []
                })
            }
            else {
                this._logPASM('  -- DAT PASM SKIPPED bad labelName=[' + labelName + ']');
            }
        }
    }

    private _getOBJ_Declaration(startingOffset: number, line: string): void {
        // HAVE    color           : "isp_hub75_color"
        //  -or-   segments[7]     : "isp_hub75_segment"
        //
        //skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        // get line parts - we only care about first one
        const lineParts: string[] = line.substr(currentOffset).split(/[ \t\[\:]/)
        const newName = lineParts[0];
        this._logOBJ('  -- GetOBJDecl newName=[' + newName + ']');
        // remember this object name so we can annotate a call to it
        this._setGlobalToken(newName, {
            tokenType: 'namespace',
            tokenModifiers: []
        })
    }

    private _getPUB_PRI_Name(startingOffset: number, line: string): void {
        const methodType = line.substr(0, 3).toUpperCase();
        // reset our list of local variables
        const isPrivate = methodType.indexOf('PRI');
        //skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        const startNameOffset = currentOffset
        // find open paren
        currentOffset = line.indexOf('(', currentOffset);
        let nameLength = currentOffset - startNameOffset
        const newName = line.substr(startNameOffset, nameLength);
        const nameType: string = (isPrivate) ?  'private': 'public';
        this._logSPIN('  -- GetMethodDecl newName=[' + newName + '](' + nameType + ')');
        this.currentMethodName = newName;   // notify of latest method name so we can track inLine PASM symbols
        // remember this method name so we can annotate a call to it
        const refModifiers: string[] = (isPrivate) ? [] : ['static']
        this._setGlobalToken(newName, {
            tokenType: 'method',
            tokenModifiers: refModifiers
        })
    }

    private _getSPIN_PasmDeclaration(startingOffset: number, line: string): void {
        // HAVE    next8SLine ' or .nextLine in col 0
        //         nPhysLineIdx        long    0
        let currentOffset = this._skipWhite(line, startingOffset)
        // get line parts - we only care about first one
        const inLinePasmRHSStr = this._getNonCommentLineRemainder(currentOffset, line);
        const lineParts: string[] = this._getNonWhiteLineParts(inLinePasmRHSStr);
        //this._logPASM('- GetInLinePasmDecl lineParts=[' + lineParts + ']');
        // handle name in 1 column
        const isDataDeclarationLine: boolean = (lineParts.length > 1 && this._isDatStorageType(lineParts[1]));
        if (line.substr(0, 1).match(/[a-zA-Z_\.\:]/)) {
            const labelName: string = lineParts[0];
            const labelType: string = (isDataDeclarationLine) ? 'variable' : 'label';
            this._logPASM('  -- Inline PASM labelName=[' + labelName + '(' + labelType + ')]');
            this._setLocalPasmTokenForMethod(this.currentMethodName, labelName, {
                tokenType: labelType,
                tokenModifiers: []
            });
        }
    }


    private _getVAR_Declaration(startingOffset: number, line: string): void {
        // HAVE    long    demoPausePeriod   ' comment
        //
        //skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        const remainingNonCommentLineStr: string = this._getNonCommentLineRemainder(currentOffset, line);
        this._logVAR('- GetVarDecl remainingNonCommentLineStr=[' + remainingNonCommentLineStr + ']');
        const isMultiDeclaration: boolean = remainingNonCommentLineStr.includes(',');
        let lineParts: string[] = this._getNonWhiteDataInitLineParts(remainingNonCommentLineStr);
        const hasGoodType: boolean = this._isStorageType(lineParts[0]);
        this._logVAR('  -- lineParts=[' + lineParts + ']');
        let nameSet: string[] = [];
        if (hasGoodType && lineParts.length > 1) {
            if(!isMultiDeclaration) {
                // get line parts - we only care about first one after type
                nameSet.push(lineParts[0])
                nameSet.push(lineParts[1])
            }
            else {
                // have multiple declarations separated by commas, we care about all after type
                nameSet = lineParts
            }
            // remember this object name so we can annotate a call to it
            // NOTE this is an instance-variable!
            for (let index = 1; index < nameSet.length; index++) {
                // remove array suffix and comma delim. from name
                const newName = nameSet[index] // .replace(/[\[,]/, '');
                if (newName.substr(0, 1).match(/[a-zA-Z_]/)) {
                    this._logVAR('  -- GetVarDecl newName=[' + newName + ']');
                    this._setGlobalToken(newName, {
                        tokenType: 'variable',
                        tokenModifiers: ['instance']
                    })
                }
            }
        } else if (!hasGoodType && lineParts.length > 0) {
            for (let index = 0; index < lineParts.length; index++) {
                const longVarName = lineParts[index];
                if (longVarName.substr(0, 1).match(/[a-zA-Z_]/)) {
                    this._logVAR('  -- GetVarDecl newName=[' + longVarName + ']');
                    this._setGlobalToken(longVarName, {
                        tokenType: 'variable',
                        tokenModifiers: ['instance']
                    })
                }
            }
        }
    }

    private _reportCON_DeclarationLine(lineNumber: number, startingOffset: number, line: string): IParsedToken[]
    {
        const tokenSet: IParsedToken[] = [];
        // skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        const nonCommentConstantLine = this._getNonCommentLineRemainder(currentOffset, line);
        this._logCON('- reportConstant nonCommentConstantLine=[' + nonCommentConstantLine + ']');

        const haveEnumDeclaration: boolean = (nonCommentConstantLine.indexOf('#') != -1);
        const containsMultiAssignments: boolean = (nonCommentConstantLine.indexOf(',') != -1);
        let statements: string[] = [nonCommentConstantLine];
        if (!haveEnumDeclaration && containsMultiAssignments) {
            statements =  nonCommentConstantLine.split(',')
        }
        this._logCON('  -- statements=[' + statements + ']');
        if (nonCommentConstantLine.length > 0) {
            for (let index = 0; index < statements.length; index++) {
                const conDeclarationLine: string = statements[index].trim();
                this._logCON('  -- conDeclarationLine=[' + conDeclarationLine + ']');
                currentOffset = line.indexOf(conDeclarationLine, currentOffset)
                // locate key indicators of line style
                const isAssignment: boolean = (conDeclarationLine.indexOf('=') != -1);
                if (isAssignment) {
                    // -------------------------------------------
                    // have line assigning value to new constant
                    // -------------------------------------------
                    const assignmentParts: string[] = conDeclarationLine.split('=');
                    const constantName = assignmentParts[0].trim();
                    this._logCON('  -- constantName=[' + constantName + ']');
                    tokenSet.push({
                        line: lineNumber,
                        startCharacter: currentOffset,
                        length: constantName.length,
                        tokenType: 'variable',
                        tokenModifiers: ['declaration', 'readonly']
                    });

                    // remember so we can ID references (if we don't know this name, yet)
                    this._setGlobalToken(constantName, {
                        tokenType: 'variable',
                        tokenModifiers: ['readonly']
                    })
                    currentOffset = constantName.length + 1;   // skip to RHS of assignment
                    const assignmentRHSStr = assignmentParts[1].trim();
                    this._logCON('  -- assignmentRHSStr=[' + assignmentRHSStr + ']');
                    const possNames: string[] = assignmentRHSStr.split(/[ \t\(\)\*\+\-\/\>\<]/);
                    this._logCON('  -- possNames=[' + possNames + ']');
                    for (let index = 0; index < possNames.length; index++) {
                        const possibleName = possNames[index];
                        const currPossibleLen = possibleName.length;
                        if (currPossibleLen < 1) {
                            continue;
                        }
                        if (possibleName.substr(0, 1).match(/[a-zA-Z_]/)) {
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
                            if (this._isGlobalToken(namePart)) {
                                referenceDetails = this._getGlobalToken(namePart);
                                this._logCON('  --  FOUND global name=[' + namePart + ']');
                            }
                            if (referenceDetails != undefined) {
                                const nameOffset = line.indexOf(searchString, currentOffset);
                                tokenSet.push({
                                    line: lineNumber,
                                    startCharacter: nameOffset,
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
                                const nameOffset = line.indexOf(constantPart, referenceOffset)
                                tokenSet.push({
                                    line: lineNumber,
                                    startCharacter: nameOffset,
                                    length: constantPart.length,
                                    tokenType: 'variable',
                                    tokenModifiers: ['readonly']
                                });
                            }
                        }
                        currentOffset += currPossibleLen + 1;
                    }
                }
                else {
                    // -------------------------------------------------
                    // have line creating one or more of enum constants
                    // -------------------------------------------------
                    // recognize enum values getting initialized
                    const lineParts: string[] = conDeclarationLine.split(',');
                    //this._logCON('  -- lineParts=[' + lineParts + ']');
                    for (let index = 0; index < lineParts.length; index++) {
                        let enumConstant = lineParts[index].trim();
                        // our enum name can have a step offset: name[step]
                        if (enumConstant.includes('[')) {
                            // it does, isolate name from offset
                            const enumNameParts: string[] = enumConstant.split('[');
                            enumConstant = enumNameParts[0];
                        }
                        if (enumConstant.substr(0, 1).match(/[a-zA-Z_]/)) {
                            this._logCON('  -- enumConstant=[' + enumConstant + ']');
                            // our enum name can have a step offset
                            const nameOffset = line.indexOf(enumConstant, currentOffset)
                            tokenSet.push({
                                line: lineNumber,
                                startCharacter: nameOffset,
                                length: enumConstant.length,
                                tokenType: 'enumMember',
                                tokenModifiers: ['declaration']
                            });

                            // remember so we can ID references (if we don't know this name, yet)
                            this._setGlobalToken(enumConstant, {
                                tokenType: 'enumMember',
                                tokenModifiers: []
                            })
                        }
                    }
                }
            }
        }
        return tokenSet;
    }

    private _reportDAT_DeclarationLine(lineNumber: number, startingOffset: number, line: string): IParsedToken[]
    {
		const tokenSet: IParsedToken[] = [];
        //skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        // get line parts - we only care about first one
        const dataDeclNonCommentStr = this._getNonCommentLineRemainder(currentOffset, line);
        let lineParts: string[] = this._getNonWhiteLineParts(dataDeclNonCommentStr);
        this._logVAR('- rptDataDeclLn lineParts=[' + lineParts + ']');
        // remember this object name so we can annotate a call to it
        if (lineParts.length > 1) {
            if (this._isStorageType(lineParts[0])) {
                // if we start with storage type, not name, ignore line!
            }
            else {
                // this is line with name storageType and initial value
                this._logDAT('  -- rptDatDecl lineParts=[' + lineParts + ']');
                let newName = lineParts[0];
                // remove array suffix from name
                this._logDAT('  -- newName=[' + newName + ']');
                const nameOffset: number = line.indexOf(newName, currentOffset)
                tokenSet.push({
                    line: lineNumber,
                    startCharacter: nameOffset,
                    length: newName.length,
                    tokenType: 'variable',
                    tokenModifiers: ['declaration']
                });
                this._setGlobalToken(newName, {
                    tokenType: 'variable',
                    tokenModifiers: []
                })
                // process remainder of line
                currentOffset = line.indexOf(lineParts[1], currentOffset);
                const allowLocalVarStatus: boolean = false;
                const partialTokenSet: IParsedToken[] = this._reportDAT_ValueDeclarationCode(lineNumber, currentOffset, line, allowLocalVarStatus, this.showDAT)
                partialTokenSet.forEach(newToken => {
                    tokenSet.push(newToken);
                });
            }
        }
        else if (lineParts.length == 1) {
            // handle name declaration only line: [name 'comment]
            let newName = lineParts[0];
            if (!this._isAlignType(newName)) {
                this._logDAT('  -- newName=[' + newName + ']');
                const nameOffset: number = line.indexOf(newName, currentOffset)
                tokenSet.push({
                    line: lineNumber,
                    startCharacter: nameOffset,
                    length: newName.length,
                    tokenType: 'variable',
                    tokenModifiers: ['declaration']
                });
                this._setGlobalToken(newName, {
                    tokenType: 'variable',
                    tokenModifiers: []
                })
            }
        }
        else {
            this._logDAT('  -- DAT SKIPPED: lineParts=[' + lineParts + ']');
        }
        return tokenSet;
    }

    private _reportDAT_ValueDeclarationCode(lineNumber: number, startingOffset: number, line: string, allowLocal: boolean, showDebug: boolean): IParsedToken[] {
        const tokenSet: IParsedToken[] = [];
        // process data declaration
        const dataValueInitStr = this._getNonCommentLineRemainder(startingOffset, line);
        if(dataValueInitStr.length > 1) {
            if (showDebug) {
                this._logMessage('  -- reportDataValueInit dataValueInitStr=[' + dataValueInitStr + ']');
            }
            let lineParts: string[] = this._getNonWhiteDataInitLineParts(dataValueInitStr);
            const argumentStartIndex: number = (this._isDatStorageType(lineParts[0])) ? 1 : 0;
            if (showDebug) {
                this._logMessage('  -- lineParts=[' + lineParts + ']');
            }
            // process remainder of line
            for (let index = argumentStartIndex; index < lineParts.length; index++) {
                const possibleName = lineParts[index].replace(/[\(\)\@]/, '');
                //if (showDebug) {
                //    this._logMessage('  -- possibleName=[' + possibleName + ']');
                //}
                const currPossibleLen = possibleName.length;
                if (currPossibleLen < 1) {
                    continue;
                }
                let currentOffset: number = line.indexOf(possibleName, startingOffset);
                let possibleNameSet: string[] = [];
                if (possibleName.substr(0, 1).match(/[a-zA-Z_]/)) {
                    if (showDebug) {
                        this._logMessage('  -- possibleName=[' + possibleName + ']');
                    }
                    // does name contain a namespace reference?
                    if (possibleName.includes('.')) {
                        possibleNameSet = possibleName.split('.');
                    }
                    else {
                        possibleNameSet = [possibleName];
                    }
                    if (showDebug) {
                        this._logMessage('  --  possibleNameSet=[' + possibleNameSet + ']');
                    }
                    const namePart = possibleNameSet[0];
                    const searchString: string = (possibleNameSet.length == 1) ? possibleNameSet[0] : possibleNameSet[0] + '.' + possibleNameSet[1]
                    let referenceDetails: IRememberedToken | undefined = undefined;
                    if (allowLocal && this._isLocalToken(namePart)) {
                        referenceDetails = this._getLocalToken(namePart);
                        if (showDebug) {
                            this._logMessage('  --  FOUND local name=[' + namePart + ']');
                        }
                    }
                    else if (this._isGlobalToken(namePart)) {
                        referenceDetails = this._getGlobalToken(namePart);
                        if (showDebug) {
                            this._logMessage('  --  FOUND global name=[' + namePart + ']');
                        }
                    }
                    if (referenceDetails != undefined) {
                        const nameOffset = line.indexOf(searchString, currentOffset);
                        tokenSet.push({
                            line: lineNumber,
                            startCharacter: nameOffset,
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
                        if (showDebug) {
                            this._logMessage('  --  FOUND external constantPart=[' + constantPart + ']');
                        }
                        const nameOffset = line.indexOf(constantPart, referenceOffset)
                        tokenSet.push({
                            line: lineNumber,
                            startCharacter: nameOffset,
                            length: constantPart.length,
                            tokenType: 'variable',
                            tokenModifiers: ['readonly']
                        });
                    }
                }
                currentOffset += currPossibleLen + 1;
            }
        }
        return tokenSet;
    }

    private _reportDAT_PasmCode(lineNumber: number, startingOffset: number, line: string): IParsedToken[] {
        const tokenSet: IParsedToken[] = [];
        // skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        // get line parts - we only care about first one
        const inLinePasmRHSStr = this._getNonCommentLineRemainder(currentOffset, line);
        const lineParts: string[] = this._getNonWhitePasmLineParts(inLinePasmRHSStr);
        this._logPASM('  -- reportDATPasmDecl lineParts=[' + lineParts + ']');
        // handle name in 1 column
        const isDataDeclarationLine: boolean = (lineParts.length > 1 && (this._isDatStorageType(lineParts[1]) || this._isDatStorageType(lineParts[0])));
        let haveLabel: boolean = false;
        if (!this._isDatStorageType(lineParts[0]) && line.substr(0, 1).match(/[a-zA-Z_\.\:]/)) {
            // process label/variable name
            const labelName: string = lineParts[0];
            this._logPASM('  -- labelName=[' + labelName + ']');
            let referenceDetails: IRememberedToken | undefined = undefined;
            if (this._isGlobalToken(labelName)) {
                referenceDetails = this._getGlobalToken(labelName);
                this._logPASM('  --  FOUND global name=[' + labelName + ']');
            }
            if (referenceDetails != undefined) {
                const nameOffset = line.indexOf(labelName, currentOffset);
                tokenSet.push({
                    line: lineNumber,
                    startCharacter: nameOffset,
                    length: labelName.length,
                    tokenType: referenceDetails.tokenType,
                    tokenModifiers: referenceDetails.tokenModifiers
                });
                haveLabel = true;
            }
            else {
                // FIXME: UNDONE maybe we shouldn't have this code?
                // hrmf... no global type???? this should be a lebel
                const labelType: string = (isDataDeclarationLine) ? 'variable' : 'label';
                tokenSet.push({
                    line: lineNumber,
                    startCharacter: 0,
                    length: labelName.length,
                    tokenType: labelType,
                    tokenModifiers: ['declaration']
                });
                haveLabel = true;
            }
        }
        if (!isDataDeclarationLine) {
            // process assembly code
            let argumentOffset = 0;
            if (lineParts.length > 1) {
                let minNonLabelParts: number = 1;
                if (haveLabel) {
                    // skip our label
                    argumentOffset++;
                    minNonLabelParts++;
                }
                if (lineParts[argumentOffset].toUpperCase().startsWith("IF_")) {
                    // skip our conditional
                    argumentOffset++;
                    minNonLabelParts++;
                }
                if (lineParts.length > minNonLabelParts) {
                    currentOffset = line.indexOf(lineParts[minNonLabelParts - 1], currentOffset) + lineParts[minNonLabelParts - 1].length + 1;
                    for (let index = minNonLabelParts; index < lineParts.length; index++) {
                        const argumentName = lineParts[index].replace(/[@#]/, '');
                        if (argumentName.length < 1) {
                            // skip empty operand
                            continue;
                        }
                        if (index == lineParts.length - 1 && this._isPasmConditional(argumentName)) {
                            // conditional flag-set spec.
                            this._logPASM('  -- SKIP argumentName=[' + argumentName + ']');
                            continue;
                        }
                        const currArgumentLen = argumentName.length;
                        if (argumentName.substr(0, 1).match(/[a-zA-Z_\.]/)) {
                            // does name contain a namespace reference?
                            this._logPASM('  -- argumentName=[' + argumentName + ']');
                            let possibleNameSet: string[] = [];
                            if (argumentName.includes('.') && !argumentName.startsWith('.')) {
                                possibleNameSet = argumentName.split('.');
                            }
                            else {
                                possibleNameSet = [argumentName]
                            }
                            this._logPASM('  --  possibleNameSet=[' + possibleNameSet + ']');
                            const namePart = possibleNameSet[0];
                            const searchString: string = (possibleNameSet.length == 1) ? possibleNameSet[0] : possibleNameSet[0] + '.' + possibleNameSet[1]
                            let referenceDetails: IRememberedToken | undefined = undefined;
                            if (this._isGlobalToken(namePart)) {
                                referenceDetails = this._getGlobalToken(namePart);
                                this._logPASM('  --  FOUND global name=[' + namePart + ']');
                            }
                            else {
                                this._logPASM('  --  ?NOT FOUND?  name=[' + namePart + ']');
                            }
                            if (referenceDetails != undefined) {
                                const nameOffset = line.indexOf(searchString, currentOffset);
                                tokenSet.push({
                                    line: lineNumber,
                                    startCharacter: nameOffset,
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
                                const nameOffset = line.indexOf(constantPart, referenceOffset)
                                tokenSet.push({
                                    line: lineNumber,
                                    startCharacter: nameOffset,
                                    length: constantPart.length,
                                    tokenType: 'variable',
                                    tokenModifiers: ['readonly']
                                });
                            }
                        }
                        currentOffset += currArgumentLen + 1;
                    }
                }
            }
        }
        else {
            // process data declaration
            if (this._isDatStorageType(lineParts[0])) {
                currentOffset = line.indexOf(lineParts[0], currentOffset);
            }
            else {
                currentOffset = line.indexOf(lineParts[1], currentOffset);
            }
            const allowLocalVarStatus: boolean = false;
            const partialTokenSet: IParsedToken[] = this._reportDAT_ValueDeclarationCode(lineNumber, currentOffset, line, allowLocalVarStatus, this.showPasmCode)
            partialTokenSet.forEach(newToken => {
                tokenSet.push(newToken);
            });
        }
        return tokenSet;
    }

    private _reportPUB_PRI_Signature(lineNumber: number, startingOffset: number, line: string): IParsedToken[] {
        const tokenSet: IParsedToken[] = [];
        const methodType = line.substr(0, 3).toUpperCase();
        // reset our list of local variables
        this.localTokens.clear();
        const isPrivate = methodType.indexOf('PRI');
        //skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        const startNameOffset = currentOffset
        // find open paren - skipping past method name
        currentOffset = line.indexOf('(', currentOffset);
        const methodName: string = line.substr(startNameOffset, currentOffset - startNameOffset);
        this.currentMethodName = methodName;   // notify of latest method name so we can track inLine PASM symbols
        // record definition of method
        const declModifiers: string[] = (isPrivate) ? ['declaration'] : ['declaration', 'static']
        tokenSet.push({
            line: lineNumber,
            startCharacter: startNameOffset,
            length: methodName.length,
            tokenType: 'method',
            tokenModifiers: declModifiers
        });
        // and remember this so we can refer to it properly later
        const refModifiers: string[] = (isPrivate) ? [] : ['static']
        this._setGlobalToken(methodName, {
            tokenType: 'method',
            tokenModifiers: refModifiers
        })
        this._logSPIN('-reportMethod: methodName=[' + methodName + ']');
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
                this._logSPIN('  -- paramName=[' + paramName + ']');
                const nameOffset = line.indexOf(paramName, currentOffset + 1);
                tokenSet.push({
                    line: lineNumber,
                    startCharacter: nameOffset,
                    length: paramName.length,
                    tokenType: 'parameter',
                    tokenModifiers: ['declaration', 'readonly', 'local']
                });
                // remember so we can ID references
                this._setLocalToken(paramName, {
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
                this._logSPIN('  -- returnValueName=[' + returnValueName + ']');
                const nameOffset = line.indexOf(returnValueName, currentOffset + 1);
                tokenSet.push({
                    line: lineNumber,
                    startCharacter: nameOffset,
                    length: returnValueName.length,
                    tokenType: 'returnValue',
                    tokenModifiers: ['declaration', 'local']
                });
                // remember so we can ID references
                this._setLocalToken(returnValueName, {
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
            this._logSPIN('  -- localVarNames=[' + localVarNames + ']');
            for (let index = 0; index < localVarNames.length; index++) {
                const localVariableName = localVarNames[index].trim();
                const localVariableOffset = line.indexOf(localVariableName, currentOffset);
                let nameParts: string[] = []
                if (localVariableName.includes(" ")) {
                    // have name with storage and/or alignment operators
                    nameParts = localVariableName.split(' ')
                }
                else {
                    // have single name
                    nameParts = [localVariableName]
                }
                this._logSPIN('  -- nameParts=[' + nameParts + ']');
                for (let index = 0; index < nameParts.length; index++) {
                    let localName = nameParts[index];
                    // have name similar to scratch[12]?
                    if (localName.includes('[')) {
                        // yes remove array suffix
                        let localNameParts: string[] = localName.split('[');
                        localName = localNameParts[0];
                    }
                    this._logSPIN('  -- localName=[' + localName + ']');
                    const nameOffset = line.indexOf(localName, localVariableOffset);
                    if (index == nameParts.length - 1) {
                        // have name
                        tokenSet.push({
                            line: lineNumber,
                            startCharacter: nameOffset,
                            length: localName.length,
                            tokenType: 'variable',
                            tokenModifiers: ['declaration', 'local']
                        });
                        // remember so we can ID references
                        this._setLocalToken(localName, {
                            tokenType: 'variable',
                            tokenModifiers: ['local']
                        });
                    }
                    else {
                        // have modifier!
                        if (this._isStorageType(localName)) {
                            tokenSet.push({
                                line: lineNumber,
                                startCharacter: nameOffset,
                                length: localName.length,
                                tokenType: 'storageType',
                                tokenModifiers: []
                            });
                        }
                        else if (this._isAlignType(localName)) {
                            tokenSet.push({
                                line: lineNumber,
                                startCharacter: nameOffset,
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

    private _reportSPIN_Code(lineNumber: number, startingOffset: number, line: string): IParsedToken[] {
        const tokenSet: IParsedToken[] = [];
        // skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        const remainingLength: number = line.length - (currentOffset + 1);
        if (remainingLength > 0) {
            // locate key indicators of line style
            let assignmentOffset = line.indexOf(':=', currentOffset);
            if (assignmentOffset != -1) {
                // -------------------------------------------
                // have line assigning value to new constant
                // -------------------------------------------
                const variableName = line.substr(currentOffset, (assignmentOffset - 1) - currentOffset).trim()
                if (variableName.includes("[")) {
                    // NOTE this handles code: byte[pColor][2] := {value}
                    // have complex target name, parse in loop
                    const variableNameParts: string[] = variableName.split(/[ \t\[\]\+\-\(\)\<\>]/);
                    this._logSPIN('  -- Spin: variableNameParts=[' + variableNameParts + ']');
                    let haveModification: boolean = false;
                    for (let index = 0; index < variableNameParts.length; index++) {
                        const variableNamePart = variableNameParts[index].replace('@','');
                        const nameOffset = line.indexOf(variableNamePart, currentOffset);
                        if (variableNamePart.substr(0, 1).match(/[a-zA-Z_]/)) {
                            this._logSPIN('  -- variableNamePart=[' + variableNamePart + ', (' + nameOffset + 1 + ')]');
                            if (this._isStorageType(variableNamePart)) {
                                tokenSet.push({
                                    line: lineNumber,
                                    startCharacter: nameOffset,
                                    length: variableNamePart.length,
                                    tokenType: 'storageType',
                                    tokenModifiers: []
                                });
                            }
                            else {
                                let referenceDetails: IRememberedToken | undefined = undefined;
                                if (this._isLocalToken(variableNamePart)) {
                                    referenceDetails = this._getLocalToken(variableNamePart);
                                    this._logSPIN('  --  FOUND local name=[' + variableNamePart + ']');
                                }
                                else if (this._isGlobalToken(variableNamePart)) {
                                    referenceDetails = this._getGlobalToken(variableNamePart);
                                    this._logSPIN('  --  FOUND global name=[' + variableNamePart + ']');
                                }
                                if (referenceDetails != undefined) {
                                    let modificationArray: string[] = referenceDetails.tokenModifiers;
                                    if (!haveModification) {
                                        // place modification attribute on only 1st name
                                        modificationArray.push('modification');
                                        haveModification = true;
                                    }
                                    if (referenceDetails != undefined) {
                                        tokenSet.push({
                                            line: lineNumber,
                                            startCharacter: nameOffset,
                                            length: variableNamePart.length,
                                            tokenType: referenceDetails.tokenType,
                                            tokenModifiers: modificationArray
                                        });
                                    }
                                }
                                else {
                                    // we don't have name registered so just mark it
                                    tokenSet.push({
                                        line: lineNumber,
                                        startCharacter: nameOffset,
                                        length: variableNamePart.length,
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
                    this._logSPIN('  -- spin: variableName=[' + variableName + ']');
                    let referenceDetails: IRememberedToken | undefined = undefined;
                    if (this._isLocalToken(variableName)) {
                        referenceDetails = this._getLocalToken(variableName);
                        this._logSPIN('  --  FOUND local name=[' + variableName + ']');
                    }
                    else if (this._isGlobalToken(variableName)) {
                        referenceDetails = this._getGlobalToken(variableName);
                        this._logSPIN('  --  FOUND globel name=[' + variableName + ']');
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
            const assignmentRHSStr = this._getNonCommentLineRemainder(currentOffset, line);
            this._logSPIN('  -- assignmentRHSStr=[' + assignmentRHSStr + ']');
            let possNames: string[] = assignmentRHSStr.split(/[ \t\-\:\,\+\[\]\@\(\)\!\*\=\<\>\&\|\?\\\~\#\^\/]/);
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
                let possibleNameSet: string[] = [];
                if (possibleName.substr(0, 1).match(/[a-zA-Z_]/)) {
                    this._logSPIN('  -- possibleName=[' + possibleName + ']');
                    // does name contain a namespace reference?
                    if (possibleName.includes('.')) {
                        possibleNameSet = possibleName.split('.');
                        this._logSPIN('  --  possibleNameSet=[' + possibleNameSet + ']');
                    }
                    else {
                        possibleNameSet = [possibleName]
                    }
                    const namePart = possibleNameSet[0];
                    const searchString: string = (possibleNameSet.length == 1) ? possibleNameSet[0] : possibleNameSet[0] + '.' + possibleNameSet[1]
                    let referenceDetails: IRememberedToken | undefined = undefined;
                    if (this._isLocalToken(namePart)) {
                        referenceDetails = this._getLocalToken(namePart);
                        this._logSPIN('  --  FOUND local name=[' + namePart + ']');
                    } else if (this._isGlobalToken(namePart)) {
                        referenceDetails = this._getGlobalToken(namePart);
                        this._logSPIN('  --  FOUND global name=[' + namePart + ']');
                    }
                    if (referenceDetails != undefined) {
                        const nameOffset = line.indexOf(searchString, currentOffset);
                        tokenSet.push({
                            line: lineNumber,
                            startCharacter: nameOffset,
                            length: namePart.length,
                            tokenType: referenceDetails.tokenType,
                            tokenModifiers: referenceDetails.tokenModifiers
                        });
                    }
                    else {
                        // have unknown name!? is storage type spec?
                        if (this._isStorageType(namePart)) {
                            this._logSPIN('  --  storageType=[' + namePart + ']');
                            const nameOffset = line.indexOf(searchString, currentOffset);
                            tokenSet.push({
                                line: lineNumber,
                                startCharacter: nameOffset,
                                length: namePart.length,
                                tokenType: 'storageType',
                                tokenModifiers: []
                            });
                        }
                        // NO DEBUG FOR ELSE, most of spin control elements come through here!
                        //else {
                        //    this._logSPIN('  -- UNKNOWN?? name=[' + namePart + '] - name-get-breakage??');
                        //}
                    }
                    if (possibleNameSet.length > 1) {
                        // we have .constant namespace suffix
                        // determine if this is method has '(' or constant name
                        const referenceOffset = line.indexOf(searchString, currentOffset);
                        let isMethod: boolean = false;
                        if (line.substr(referenceOffset + searchString.length, 1) == '(') {
                            isMethod = true;
                        }
                        const constantPart: string = possibleNameSet[1];
                        const nameOffset = line.indexOf(constantPart, currentOffset)
                        if (isMethod) {
                            tokenSet.push({
                                line: lineNumber,
                                startCharacter: nameOffset,
                                length: constantPart.length,
                                tokenType: 'method',
                                tokenModifiers: []
                            });
                        }
                        else {
                            tokenSet.push({
                                line: lineNumber,
                                startCharacter: nameOffset,
                                length: constantPart.length,
                                tokenType: 'variable',
                                tokenModifiers: ['readonly']
                            });
                        }
                    }
                }
                else if (possibleName.startsWith('.')) {
                    const externalMethodName: string = possibleName.replace('.', '')
                    this._logSPIN('  --  externalMethodName=[' + externalMethodName + ']');
                    const nameOffset = line.indexOf(externalMethodName, currentOffset);
                    tokenSet.push({
                        line: lineNumber,
                        startCharacter: nameOffset,
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


    private _reportSPIN_PasmCode(lineNumber: number, startingOffset: number, line: string): IParsedToken[] {
        const tokenSet: IParsedToken[] = [];
        // skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        // get line parts - we only care about first one
        const inLinePasmRHSStr = this._getNonCommentLineRemainder(currentOffset, line);
        const lineParts: string[] = this._getNonWhitePasmLineParts(inLinePasmRHSStr);
        this._logPASM('  -- reportInLinePasmDecl lineParts=[' + lineParts + ']');
        // handle name in 1 column
        const isDataDeclarationLine: boolean = (lineParts.length > 1 && (this._isDatStorageType(lineParts[0]) || this._isDatStorageType(lineParts[1])));
        let haveLabel: boolean = false;
        if (!this._isDatStorageType(lineParts[0]) && line.substr(0, 1).match(/[a-zA-Z_\.\:]/)) {
            // process label/variable name
            const labelName: string = lineParts[0];
            this._logPASM('  -- labelName=[' + labelName + ']');
            const labelType: string = (isDataDeclarationLine) ? 'variable' : 'label';
            tokenSet.push({
                line: lineNumber,
                startCharacter: 0,
                length: labelName.length,
                tokenType: labelType,
                tokenModifiers: ['declaration']
            });
            haveLabel = true;
        }
        if (!isDataDeclarationLine) {
            // process assembly code
            let argumentOffset = 0;
            if (lineParts.length > 1) {
                let minNonLabelParts: number = 1;
                if (haveLabel) {
                    // skip our label
                    argumentOffset++;
                    minNonLabelParts++;
                }
                if (lineParts[argumentOffset].toUpperCase().startsWith("IF_")) {
                    // skip our conditional
                    argumentOffset++;
                    minNonLabelParts++;
                }
                if (lineParts.length > minNonLabelParts) {
                    currentOffset = line.indexOf(lineParts[minNonLabelParts - 1], currentOffset) + lineParts[minNonLabelParts - 1].length + 1;
                    for (let index = minNonLabelParts; index < lineParts.length; index++) {
                        const argumentName = lineParts[index].replace(/[@#]/, '');
                        if (argumentName.length < 1) {
                            // skip empty operand
                            continue;
                        }
                        if (index == lineParts.length - 1 && this._isPasmConditional(argumentName)) {
                            // conditional flag-set spec.
                            this._logPASM('  -- SKIP argumentName=[' + argumentName + ']');
                            continue;
                        }
                        const currArgumentLen = argumentName.length;
                        if (argumentName.substr(0, 1).match(/[a-zA-Z_\.]/)) {
                            // does name contain a namespace reference?
                            this._logPASM('  -- argumentName=[' + argumentName + ']');
                            let possibleNameSet: string[] = [];
                            if (argumentName.includes('.') && !argumentName.startsWith('.')) {
                                possibleNameSet = argumentName.split('.');
                            }
                            else {
                                possibleNameSet = [argumentName]
                            }
                            this._logPASM('  --  possibleNameSet=[' + possibleNameSet + ']');
                            const namePart = possibleNameSet[0];
                            const searchString: string = (possibleNameSet.length == 1) ? possibleNameSet[0] : possibleNameSet[0] + '.' + possibleNameSet[1]
                            let referenceDetails: IRememberedToken | undefined = undefined;
                            if (this._isLocalPasmTokenForMethod(this.currentMethodName, namePart)) {
                                referenceDetails = this._getLocalPasmTokenForMethod(this.currentMethodName, namePart);
                                this._logPASM('  --  FOUND local PASM name=[' + namePart + ']');
                            }
                            else if (this._isLocalToken(namePart)) {
                                referenceDetails = this._getLocalToken(namePart);
                                this._logPASM('  --  FOUND local name=[' + namePart + ']');
                            }
                            else if (this._isGlobalToken(namePart)) {
                                referenceDetails = this._getGlobalToken(namePart);
                                this._logPASM('  --  FOUND global name=[' + namePart + ']');
                            }
                            if (referenceDetails != undefined) {
                                const nameOffset = line.indexOf(searchString, currentOffset);
                                tokenSet.push({
                                    line: lineNumber,
                                    startCharacter: nameOffset,
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
                                const nameOffset = line.indexOf(constantPart, referenceOffset)
                                tokenSet.push({
                                    line: lineNumber,
                                    startCharacter: nameOffset,
                                    length: constantPart.length,
                                    tokenType: 'variable',
                                    tokenModifiers: ['readonly']
                                });
                            }
                        }
                        currentOffset += currArgumentLen + 1;
                    }
                }
            }
        }
        else {
            // process data declaration
            if (this._isDatStorageType(lineParts[0])) {
                currentOffset = line.indexOf(lineParts[0], currentOffset);
            }
            else {
                currentOffset = line.indexOf(lineParts[1], currentOffset);
            }
            const allowLocalVarStatus: boolean = true;
            const partialTokenSet: IParsedToken[] = this._reportDAT_ValueDeclarationCode(lineNumber, currentOffset, line, allowLocalVarStatus, this.showPasmCode)
            partialTokenSet.forEach(newToken => {
                tokenSet.push(newToken);
            });
        }
        return tokenSet;
    }

    private _reportOBJ_DeclarationLine(lineNumber: number, startingOffset: number, line: string): IParsedToken[]
    {
        const tokenSet: IParsedToken[] = [];
        //skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        const remainingLength: number = line.length - (currentOffset + 1);
        if (remainingLength > 0) {
            // get line parts - initially, we only care about first one
            const lineParts: string[] = line.substr(currentOffset).split(/[ \t\[]/)
            const objectName = lineParts[0];
            const nameOffset: number = line.indexOf(objectName, currentOffset)
            tokenSet.push({
                line: lineNumber,
                startCharacter: nameOffset,
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
                    if (elemCountStr.substr(0, 1).match(/[a-zA-Z_]/)) {
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
                            if (this._isGlobalToken(nameReference)) {
                                const referenceDetails: IRememberedToken | undefined = this._getGlobalToken(nameReference);
                                const nameOffset = line.indexOf(nameReference, currentOffset)
                                if (referenceDetails != undefined) {
                                    this._logOBJ('  --  FOUND global name=[' + nameReference + ']');
                                    tokenSet.push({
                                        line: lineNumber,
                                        startCharacter: nameOffset,
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

    private _reportVAR_DeclarationLine(lineNumber: number, startingOffset: number, line: string): IParsedToken[]
    {
		const tokenSet: IParsedToken[] = [];
        //skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        const remainingNonCommentLineStr: string = this._getNonCommentLineRemainder(currentOffset, line);
        // get line parts - we only care about first one
        let lineParts: string[]  = this._getCommaDelimitedNonWhiteLineParts(remainingNonCommentLineStr);
        this._logVAR('  -- rptVarDecl lineParts=[' + lineParts + ']');
        // remember this object name so we can annotate a call to it
        const isMultiDeclaration: boolean = remainingNonCommentLineStr.includes(',');
        const hasStorageType: boolean = (this._isStorageType(lineParts[0]));
        if (lineParts.length > 1) {
            const startIndex: number = (hasStorageType) ? 1 : 0;
            for (let index = startIndex; index < lineParts.length; index++) {
                let newName = lineParts[index];
                const hasArrayReference: boolean = (newName.indexOf('[') != -1);
                if (hasArrayReference) {
                    // remove array suffix from name
                    if (newName.includes('[')) {
                        const nameParts: string[] = newName.split('[');
                        newName = nameParts[0];
                    }
                }
                if (newName.substr(0, 1).match(/[a-zA-Z_]/)) {
                    this._logVAR('  -- newName=[' + newName + ']');
                    const nameOffset: number = line.indexOf(newName, currentOffset)
                    tokenSet.push({
                        line: lineNumber,
                        startCharacter: nameOffset,
                        length: newName.length,
                        tokenType: 'variable',
                        tokenModifiers: ['declaration', 'instance']
                    });
                    this._setGlobalToken(newName, {
                        tokenType: 'variable',
                        tokenModifiers: ['instance']
                    })
                    currentOffset = nameOffset + newName.length;
                }
                if (hasArrayReference) {
                    // process name with array length value
                    const arrayOpenOffset: number = line.indexOf('[', currentOffset);
                    const arrayCloseOffset: number = line.indexOf(']', currentOffset);
                    const arrayReference: string = line.substr(arrayOpenOffset + 1, arrayCloseOffset - arrayOpenOffset - 1);
                    const arrayReferenceParts: string[] = arrayReference.split(/[ \t\*\+\<\>]/)
                    this._logVAR('  --  arrayReferenceParts=[' + arrayReferenceParts + ']');
                    for (let index = 0; index < arrayReferenceParts.length; index++) {
                        const referenceName = arrayReferenceParts[index];
                        if (referenceName.substr(0, 1).match(/[a-zA-Z_]/)) {
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
                            if (this._isGlobalToken(namePart)) {
                                const referenceDetails: IRememberedToken | undefined = this._getGlobalToken(namePart);
                                const searchString: string = (possibleNameSet.length == 1) ? possibleNameSet[0] : possibleNameSet[0] + '.' + possibleNameSet[1]
                                const nameOffset = line.indexOf(searchString, currentOffset)
                                if (referenceDetails != undefined) {
                                    this._logVAR('  --  FOUND global name=[' + namePart + ']');
                                    tokenSet.push({
                                        line: lineNumber,
                                        startCharacter: nameOffset,
                                        length: namePart.length,
                                        tokenType: referenceDetails.tokenType,
                                        tokenModifiers: referenceDetails.tokenModifiers
                                    });
                                }
                            }
                            if (possibleNameSet.length > 1) {
                                // we have .constant namespace suffix
                                const constantPart: string = possibleNameSet[1];
                                const nameOffset = line.indexOf(constantPart, currentOffset)
                                tokenSet.push({
                                    line: lineNumber,
                                    startCharacter: nameOffset,
                                    length: constantPart.length,
                                    tokenType: 'variable',
                                    tokenModifiers: ['readonly']
                                });
                            }
                        }
                    }
                }
            }
        }
        else {
            // have single declaration per line
            let newName = lineParts[0];
            if (newName.substr(0, 1).match(/[a-zA-Z_]/)) {
                this._logVAR('  -- newName=[' + newName + ']');
                const nameOffset: number = line.indexOf(newName, currentOffset)
                tokenSet.push({
                    line: lineNumber,
                    startCharacter: nameOffset,
                    length: newName.length,
                    tokenType: 'variable',
                    tokenModifiers: ['declaration', 'instance']
                });
                this._setGlobalToken(newName, {
                    tokenType: 'variable',
                    tokenModifiers: ['instance']
                })
            }
        }
        return tokenSet;
    }

    private spin2log: any = undefined;
    // adjust following true/false to show specific parsing debug
    private spinDebugLogEnabled: boolean = true;
    private showSpinCode: boolean = true;
    private showCON: boolean = true;
    private showOBJ: boolean = true;
    private showDAT: boolean = true;
    private showVAR: boolean = true;
    private showPasmCode: boolean = true;
    private showState: boolean = false;


    private _logState(message: string): void {
        if (this.showState) {
            this._logMessage(message)
        }
    }

    private _logSPIN(message: string): void {
        if (this.showSpinCode) {
            this._logMessage(message)
        }
    }

    private _logCON(message: string): void {
        if (this.showCON) {
            this._logMessage(message)
        }
    }

    private _logVAR(message: string): void {
        if (this.showVAR) {
            this._logMessage(message)
        }
    }

    private _logDAT(message: string): void {
        if (this.showDAT) {
            this._logMessage(message)
        }
    }

    private _logOBJ(message: string): void {
        if (this.showOBJ) {
            this._logMessage(message)
        }
    }

    private _logPASM(message: string): void {
        if (this.showPasmCode) {
            this._logMessage(message)
        }
    }

    private _logMessage(message: string): void {
        if (this.spin2log != undefined) {
            //Write to output window.
            this.spin2log.appendLine(message);
        }
    }

    private _isSectionStartLine(line: string): { isSectionStart: boolean, inProgressStatus: eParseState }  {
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

    private _getNonCommentLineRemainder(startingOffset: number, line: string): string
    {
        let nonCommentRHSStr: string = line;
        if (line.length - startingOffset > 0) {
            //this._logMessage('- gnclr startingOffset=[' + startingOffset + '], startingOffset=[' + line + ']');
            let currentOffset = this._skipWhite(line, startingOffset);
            // get line parts - we only care about first one
            let beginCommentOffset = line.indexOf("'", currentOffset);
            if (beginCommentOffset === -1) {
                beginCommentOffset = line.indexOf("{", currentOffset);
            }
            const nonCommentEOL = (beginCommentOffset != -1) ? beginCommentOffset - 1 : line.length - 1;
            //this._logMessage('- gnclr startingOffset=[' + startingOffset + '], currentOffset=[' + currentOffset + ']');
            nonCommentRHSStr = line.substr(currentOffset, nonCommentEOL - currentOffset + 1).trim();
            //this._logMessage('- gnclr nonCommentRHSStr=[' + startingOffset + ']');
        }
        return nonCommentRHSStr;
    }

    private _getNonWhiteDataInitLineParts(line: string): string[]
    {
        let lineParts: string[] | null = line.match(/[^ \t\,\[\]\(\)]+/g);
        if (lineParts === null) {
            lineParts = [];
        }
        return lineParts;
    }

    private _getNonWhitePasmLineParts(line: string): string[]
    {
        let lineParts: string[] | null = line.match(/[^ \t\,\(\)\<\>\+\*\&\|\-\\\#]+/g);
        if (lineParts === null) {
            lineParts = [];
        }
        return lineParts;
    }

    private _getNonWhiteLineParts(line: string): string[]
    {
        let lineParts: string[] | null = line.match(/[^ \t]+/g);
        if (lineParts === null) {
            lineParts = [];
        }
        return lineParts;
    }

    private _getCommaDelimitedNonWhiteLineParts(line: string): string[]
    {
        let lineParts: string[] | null = line.match(/[^ \t,]+/g);
        if (lineParts === null) {
            lineParts = [];
        }
        return lineParts;
    }

    private _isGlobalToken(tokenName: string): boolean
    {
        const foundStatus: boolean = this.globalTokens.has(tokenName.toLowerCase());
        return foundStatus;
    }

    private _setGlobalToken(tokenName: string, token: IRememberedToken): void
    {
        if (!this._isGlobalToken(tokenName)) {
            this.globalTokens.set(tokenName.toLowerCase(), token);
        }
    }

    private _getGlobalToken(tokenName: string): IRememberedToken | undefined
    {
        const desiredToken: IRememberedToken | undefined = this.globalTokens.get(tokenName.toLowerCase());
        return desiredToken
    }

    private _isLocalToken(tokenName: string): boolean
    {
        const foundStatus: boolean = this.localTokens.has(tokenName.toLowerCase());
        return foundStatus;
    }

    private _setLocalToken(tokenName: string, token: IRememberedToken): void
    {
        if (!this._isLocalToken(tokenName)) {
            this.localTokens.set(tokenName.toLowerCase(), token);
        }
    }

    private _getLocalToken(tokenName: string): IRememberedToken | undefined
    {
        const desiredToken: IRememberedToken | undefined = this.localTokens.get(tokenName.toLowerCase());
        return desiredToken
    }

    private _getLocalPasmTokensMap(methodName: string): Map<string, IRememberedToken>
    {
        // get our exiting list, or make a new empty list and return it
        const desiredMethodNameKey = methodName.toLowerCase();
        let desiredMap: Map<string, IRememberedToken> | undefined = this.localPasmTokensByMethodName.get(desiredMethodNameKey);
        if (desiredMap == undefined) {
            desiredMap = new Map<string, IRememberedToken>();
            this.localPasmTokensByMethodName.set(desiredMethodNameKey, desiredMap)
        }
        return desiredMap;
    }

    private _isLocalPasmTokenListForMethod(methodName: string): boolean
    {
        let mapExistsStatus: boolean = true;
        const desiredMethodNameKey = methodName.toLowerCase();
        let desiredMap: Map<string, IRememberedToken> | undefined = this.localPasmTokensByMethodName.get(desiredMethodNameKey);
        if (desiredMap == undefined) {
            mapExistsStatus = false;
        }
        return mapExistsStatus;
    }

    private _isLocalPasmTokenForMethod(methodName: string, tokenName: string): boolean
    {
        let foundStatus: boolean = false;
        if (this._isLocalPasmTokenListForMethod(methodName)) {
            const methodLocalTokens = this._getLocalPasmTokensMap(methodName)
            const desiredNameKey = tokenName.toLowerCase();
            foundStatus = methodLocalTokens.has(desiredNameKey);
        }
        return foundStatus;
    }

    private _setLocalPasmTokenForMethod(methodName: string, tokenName: string, token: IRememberedToken): void
    {
        const methodLocalTokens = this._getLocalPasmTokensMap(methodName)
        const desiredNameKey = tokenName.toLowerCase();
        if (!methodLocalTokens.has(desiredNameKey)) {
            methodLocalTokens.set(desiredNameKey, token);
        }
    }

    private _getLocalPasmTokenForMethod(methodName: string, tokenName: string): IRememberedToken | undefined
    {
        let desiredToken: IRememberedToken | undefined = undefined;
        if (this._isLocalPasmTokenListForMethod(methodName)) {
            const methodLocalTokens = this._getLocalPasmTokensMap(methodName)
            const desiredNameKey = tokenName.toLowerCase();
            desiredToken= methodLocalTokens.get(desiredNameKey);
        }
        return desiredToken
    }

    private _isPasmInstruction(name: string): boolean
    {
        const pasmInstructions: string[] = [
            'abs', 'add', 'addct1', 'addct2', 'addct3',
            'addpix', 'adds', 'addsx', 'addx', 'akpin',
            'allowi', 'altb', 'altd', 'altgb', 'altgn',
            'altgw', 'alti', 'altr', 'alts', 'altsb',
            'altsn', 'altsw', 'and', 'andn', 'augd',
            'augs',
            'bitc', 'bith', 'bitl', 'bitnc', 'bitnot',
            'bitnz', 'bitrnd', 'bitz', 'blnpix', 'bmask',
            'brk',
            'call', 'calla', 'callb', 'calld', 'callpa',
            'callpb', 'cmp', 'cmpm', 'cmpr', 'cmps',
            'cmpsub', 'cmpsx', 'cmpx', 'cogatn', 'cogbrk', '',
            'cogid', 'coginit', 'cogstop', 'crcbit', 'crcnib',
            'decmod', 'decod', 'dirc', 'dirh', 'dirl',
            'dirnc', 'dirnot', 'dirnz', 'dirrnd', 'dirz',
            'djf', 'djnf', 'djnz', 'djz', 'drvc',
            'drvh', 'drvl', 'drvnc', 'drvnot', 'drvnz',
            'drvrnd', 'drvz',
            'encod', 'execf',
            'fblock', 'fge', 'fges', 'fle', 'fles',
            'fltc', 'flth', 'fltl', 'fltnc', 'fltnot',
            'fltnz', 'fltrnd', 'fltz',
            'getbrk', 'getbyte', 'getbyte', 'getct', 'getnib',
            'getptr', 'getqx', 'getqy', 'getrnd', 'getrnd',
            'getscp', 'getword', 'getword', 'getxacc',
            'hubset',
            'ijnz', 'ijz', 'incmod',
            'jatn', 'jct1', 'jct2', 'jct3', 'jfbw',
            'jint', 'jmp', 'jmprel', 'jnatn', 'jnct1',
            'jnct2', 'jnct3', 'jnfbw', 'jnint', 'jnpat',
            'jnqmt', 'jnse1', 'jnse2', 'jnse3', 'jnse4',
            'jnxfi', 'jnxmt', 'jnxrl', 'jnxro', 'jpat',
            'jqmt', 'jse1', 'jse2', 'jse3', 'jse4', 'jxfi',
            'jxmt', 'jxrl', 'jxro',
            'loc', 'locknew', 'lockrel', 'lockret', 'locktry',
            'mergeb', 'mergew', 'mixpix', 'modc', 'modcz',
            'modz', 'mov', 'movbyts', 'mul', 'mulpix',
            'muls', 'muxc', 'muxnc', 'muxnibs', 'muxnits',
            'muxnz', 'muxq', 'muxz',
            'neg', 'negc', 'negnc', 'negnz', 'negz',
            'nixint1', 'nixint2', 'nixint3', 'nop', 'not',
            'ones', 'or', 'outc', 'outh', 'outl',
            'outnc', 'outnot', 'outnz', 'outrnd', 'outz',
            'pollatn', 'pollct1', 'pollct2', 'pollct3', 'pollfbw',
            'pollint', 'pollpat', 'pollqmt', 'pollse1',
            'pollse2', 'pollse3', 'pollse4', 'pollxfi', 'pollxmt',
            'pollxrl', 'pollxro', 'pop', 'popa', 'popb',
            'push', 'pusha', 'pushb', 'qdiv', 'qexp',
            'qfrac', 'qlog', 'qmul', 'qrotate', 'qsqrt',
            'qvector',
            'rcl', 'rcr', 'rczl', 'rczr', 'rdbyte',
            'rdfast', 'rdlong', 'rdlut', 'rdpin', 'rdword',
            'rep', 'resi0', 'resi1', 'resi2', 'resi3',
            'ret', 'reta', 'retb', 'reti0', 'reti1',
            'reti2', 'reti3', 'rev', 'rfbyte', 'rflong',
            'rfvar', 'rfvars', 'rfword', 'rgbexp', 'rgbsqz',
            'rol', 'rolbyte', 'rolbyte', 'rolnib', 'rolword',
            'rolword', 'ror', 'rqpin',
            'sal', 'sar', 'sca', 'scas', 'setbyte',
            'setcfrq', 'setci', 'setcmod', 'setcq', 'setcy',
            'setd', 'setdacs', 'setint1', 'setint2', 'setint3',
            'setluts', 'setnib', 'setpat', 'setpiv', 'setpix',
            'setq', 'setq2', 'setr', 'sets', 'setscp',
            'setse1', 'setse2', 'setse3', 'setse4', 'setword',
            'setxfrq', 'seussf', 'seussr', 'shl', 'shr',
            'signx', 'skip', 'skipf', 'splitb', 'splitw',
            'stalli', 'sub', 'subr', 'subs', 'subsx',
            'subx', 'sumc', 'sumnc', 'sumnz', 'sumz',
            'test', 'testb', 'testbn', 'testn', 'testp',
            'testpn', 'tjf', 'tjnf', 'tjns', 'tjnz',
            'tjs', 'tjv', 'tjz', 'trgint1', 'trgint2',
            'trgint3', 'waitatn', 'waitct1', 'waitct2', 'waitct3',
            'waitfbw', 'waitint', 'waitpat', 'waitse1', 'waitse2',
            'waitse3', 'waitse4', 'waitx', 'waitxfi', 'waitxmt',
            'waitxrl', 'waitxro', 'wfbyte', 'wflong', 'wfword',
            'wmlong', 'wrbyte', 'wrc', 'wrfast', 'wrlong',
            'wrlut', 'wrnc', 'wrnz', 'wrpin', 'wrword',
            'wrz', 'wxpin', 'wypin',
            'xcont', 'xinit', 'xor', 'xoro32', 'xstop', 'xzero',
            'zerox',
        ];
        const instructionStatus = (pasmInstructions.indexOf(name.toLowerCase()) != -1);
        return instructionStatus;
    }

    private _isPasmNonArgumentInstruction(name: string): boolean
    {
        const pasmNonArgumentInstructions: string[] = [
            'nop', 'resi3', 'resi2', 'resi1', 'resi0',
            'reti3', 'reti2', 'reti1', 'reti0', 'xstop',
            'allowi', 'stalli', 'trgint1', 'trgint2', 'trgint3',
            'nixint1', 'nixint2', 'nixint3',
            'ret', 'reta', 'retb',
            'pollint', 'pollct1', 'pollct2', 'pollct3', 'pollse1',
            'pollse2', 'pollse3', 'pollse4', 'pollpat', 'pollfbw',
            'pollxmt', 'pollxfi', 'pollxro', 'pollxrl', 'pollatn',
            'pollqmt', 'waitint', 'waitct1', 'waitct2', 'waitct3',
            'waitse1', 'waitse2', 'waitse3', 'waitse4', 'waitpat',
            'waitfbw', 'waitxmt', 'waitxfi', 'waitxro', 'waitxrl',
            'waitatn',
        ];
        const instructionStatus = (pasmNonArgumentInstructions.indexOf(name.toLowerCase()) != -1);
        return instructionStatus;
    }

    private _isPasmConditional(name: string): boolean
    {
        /*
            ' flag write controls
            WC | WZ | WCZ
            XORC | XORZ
            ORC | ORZ
            ANDC | ANDZ
        */
        let returnStatus: boolean = false;
        if (name.length >= 2) {
            const checkType: string = name.toUpperCase();
            if (checkType == "WC" || checkType == "WZ" || checkType == "WCZ" ||
            checkType == "XORC" || checkType == "XORZ" ||
            checkType == "ORC" || checkType == "ORZ" ||
            checkType == "ANDC" || checkType == "ANDZ") {
                returnStatus = true;
            }
        }
        return returnStatus;
    }

    private _isDatNFileStorageType(name: string): boolean
    {
        let returnStatus: boolean = false;
        if (name.length > 2) {
            const checkType: string = name.toUpperCase();
            // yeah, FILE too!  (oddly enough)
            if (checkType == "BYTE" || checkType == "WORD" || checkType == "LONG" || checkType == "RES" || checkType == "FILE") {
                returnStatus = true;
            }
        }
        return returnStatus;
    }

    private _isDatStorageType(name: string): boolean
    {
        let returnStatus: boolean = false;
        if (name.length > 2) {
            const checkType: string = name.toUpperCase();
            if (checkType == "BYTE" || checkType == "WORD" || checkType == "LONG" || checkType == "RES") {
                returnStatus = true;
            }
        }
        return returnStatus;
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

    private _checkTokenSet(tokenSet : IParsedToken[]): void {
        this._logMessage('\n---- Checking ' + tokenSet.length + ' tokens. ----');
        tokenSet.forEach(parsedToken => {
            if (parsedToken.length == undefined || parsedToken.startCharacter == undefined) {
                this._logMessage('- BAD Token=[' + parsedToken + ']');
            }
        });
        this._logMessage('---- Check DONE ----\n');
    }
}
