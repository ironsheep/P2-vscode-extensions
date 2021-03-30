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
            { scheme: "file", language: "spin2" },
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
        _token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[]> {
        return new Promise((resolve, _reject) => {
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
                        const closeBraceOffset: number = line.text.indexOf('}', openBraceOffset + 1);
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
        'modification', 'async', 'definition', 'defaultLibrary', 'local', 'instance', 'missingDeclaration'
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

interface IFilteredStrings {
    lineNoQuotes: string;
    lineParts: string[];
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
        let currState: eParseState = eParseState.inCon; // compiler defaults to CON at start
        let priorState: eParseState = currState
        let prePasmState: eParseState = currState

        if (this.spinDebugLogEnabled) {
            if (this.spin2log === undefined) {
                //Create output channel
                this.spin2log = vscode.window.createOutputChannel("Spin2 DEBUG");
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
            const trimmedNonCommentLine = this._getNonCommentLineRemainder(0, line);
            const sectionStatus = this._isSectionStartLine(line);
            if (currState == eParseState.inMultiLineComment) {
                // in multi-line non-doc-comment, hunt for end '}' to exit
                let closingOffset = line.indexOf('}');
                if (closingOffset != -1) {
                    // have close, comment ended
                    currState = priorState;
                }
                //  DO NOTHING Let Syntax hightlighting do this
                continue;
            }
            else if (currState == eParseState.inMultiLineDocComment) {
                // in multi-line doc-comment, hunt for end '}}' to exit
                let closingOffset = line.indexOf('}}');
                if (closingOffset != -1) {
                    // have close, comment ended
                    currState = priorState;
                }
                //  DO NOTHING Let Syntax hightlighting do this
                continue;
            }
            else if (sectionStatus.isSectionStart) {
                currState = sectionStatus.inProgressStatus;
                this._logState('- scan ln:' + i + 1 + ' currState=[' + currState + ']');
                // ID the remainder of the line
                if (currState == eParseState.inPub || currState == eParseState.inPri) {
                    // process method signature
                    if (trimmedNonCommentLine.length > 3) {
                        this._getPUB_PRI_Name(3, line)
                    }
                }
                else if (currState == eParseState.inCon) {
                    // process a constant line
                    if (trimmedNonCommentLine.length > 3) {
                        this._getCON_Declaration(3, line)
                    }
                }
                else if (currState == eParseState.inDat) {
                    // process a data line
                    if (trimmedNonCommentLine.length > 6) {
                        if (trimmedNonCommentLine.toUpperCase().includes("ORG")) { // ORG, ORGF, ORGH
                            const nonStringLine: string = this._removeQuotedStrings(trimmedNonCommentLine);
                            if (nonStringLine.toUpperCase().includes("ORG")) {
                                this._logPASM('- (' + i + 1 + '): pre-scan DAT line trimmedLine=[' + trimmedLine + '] now Dat PASM');
                                prePasmState = currState;
                                currState = eParseState.inDatPasm;
                                // and ignore rest of this line
                                continue;
                            }
                        }
                    }
                    this._getDAT_Declaration(0, line)
                }
                else if (currState == eParseState.inObj) {
                    // process a constant line
                    if (trimmedNonCommentLine.length > 3) {
                        this._getOBJ_Declaration(3, line)
                    }
                }
                else if (currState == eParseState.inVar) {
                    // process a constant line
                    if (trimmedNonCommentLine.length > 3) {
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
                            const nonStringLine: string = this._removeQuotedStrings(trimmedLine);
                            if (nonStringLine.toUpperCase().includes("ORG")) {
                                this._logPASM('- (' + i + 1 + '): pre-scan DAT line trimmedLine=[' + trimmedLine + '] now Dat PASM');
                                prePasmState = currState;
                                currState = eParseState.inDatPasm;
                                // and ignore rest of this line
                                continue;
                            }
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
                        this._logPASM('- (' + i + 1 + '): pre-scan SPIN PASM line trimmedLine=[' + trimmedLine + ']');
                        currState = prePasmState;
                        this._logState('- scan ln:' + i + 1 + ' POP currState=[' + currState + ']');
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
                        this._logPASM('- (' + i + 1 + '): pre-scan DAT PASM line trimmedLine=[' + trimmedLine + ']');
                        currState = prePasmState;
                        this._logState('- scan ln:' + i + 1 + ' POP currState=[' + currState + ']');
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
                        this._logPASM('- (' + i + 1 + '): pre-scan PUB/PRI line trimmedLine=[' + trimmedLine + ']');
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
        currState = eParseState.inCon; // reset for 2nd pass - compiler defaults to CON at start
        priorState = currState;    // reset for 2nd pass
        prePasmState = currState;   // same

        const tokenSet: IParsedToken[] = [];

        // for each line do...
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            const sectionStatus = this._isSectionStartLine(line);
            // TODO: UNDONE add filter which corrects for syntax inability to mark 'comments when more than one "'" present on line!
            //if (trimmedLine.length > 2 && trimmedLine.includes("'")) {
            //    const partialTokenSet: IParsedToken[] = this._possiblyMarkBrokenSingleLineComment(i, 0, line);
            //    partialTokenSet.forEach(newToken => {
            //        tokenSet.push(newToken);
            //    });
            //}
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
                this._logState('  -- ln:' + i + 1 + ' currState=[' + currState + ']');
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
                            let orgOffset: number = nonCommentLineRemainder.toUpperCase().indexOf("ORG"); // ORG, ORGF, ORGH
                            if (orgOffset != -1) {
                                // let's double check this is NOT in quoted string
                                const nonStringLine: string = this._removeQuotedStrings(nonCommentLineRemainder);
                                orgOffset = nonStringLine.toUpperCase().indexOf("ORG"); // ORG, ORGF, ORGH
                            }
                            if (orgOffset != -1) {
                                this._logPASM('- (' + i + 1 + '): scan DAT line nonCommentLineRemainder=[' + nonCommentLineRemainder + ']');

                                // process remainder of ORG line
                                const nonCommentOffset = line.indexOf(nonCommentLineRemainder, 0);
                                // lineNumber, currentOffset, line, allowLocalVarStatus, this.showPasmCode
                                const allowLocalVarStatus: boolean = false;
                                const NOT_DAT_PASM: boolean = false;
                                const partialTokenSet: IParsedToken[] = this._reportDAT_ValueDeclarationCode(i, nonCommentOffset + orgOffset + 3, line, allowLocalVarStatus, this.showDAT, NOT_DAT_PASM);
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
                    this._logCON('- process CON line(' + i + 1 + '):  trimmedLine=[' + trimmedLine + ']');
                    const partialTokenSet: IParsedToken[] = this._reportCON_DeclarationLine(i, 0, line)
                    partialTokenSet.forEach(newToken => {
                        tokenSet.push(newToken);
                    });
                }
            }
            else if (currState == eParseState.inDat) {
                // process a line in a data section
                if (trimmedLine.length > 0) {
                    this._logDAT('- process DAT line(' + i + 1 + '): trimmedLine=[' + trimmedLine + ']');
                    const nonCommentLineRemainder: string = this._getNonCommentLineRemainder(0, trimmedLine);
                    let orgOffset: number = nonCommentLineRemainder.toUpperCase().indexOf("ORG"); // ORG, ORGF, ORGH
                    if (orgOffset != -1) {
                        // let's double check this is NOT in quoted string
                        const nonStringLine: string = this._removeQuotedStrings(nonCommentLineRemainder);
                        orgOffset = nonStringLine.toUpperCase().indexOf("ORG"); // ORG, ORGF, ORGH
                    }
                    if (orgOffset != -1) {
                        // process remainder of ORG line
                        const nonCommentOffset = line.indexOf(nonCommentLineRemainder, 0);
                        // lineNumber, currentOffset, line, allowLocalVarStatus, this.showPasmCode
                        const allowLocalVarStatus: boolean = false;
                        const NOT_DAT_PASM: boolean = false;
                        const partialTokenSet: IParsedToken[] = this._reportDAT_ValueDeclarationCode(i, nonCommentOffset + orgOffset + 3, line, allowLocalVarStatus, this.showDAT, NOT_DAT_PASM);
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
                    this._logVAR('- process VAR line(' + i + 1 + '):  trimmedLine=[' + trimmedLine + ']');
                    const partialTokenSet: IParsedToken[] = this._reportVAR_DeclarationLine(i, 0, line)
                    partialTokenSet.forEach(newToken => {
                        tokenSet.push(newToken);
                    });
                }
            }
            else if (currState == eParseState.inObj) {
                // process a line in an object section
                if (trimmedLine.length > 0) {
                    this._logOBJ('- process OBJ line(' + i + 1 + '):  trimmedLine=[' + trimmedLine + ']');
                    const partialTokenSet: IParsedToken[] = this._reportOBJ_DeclarationLine(i, 0, line)
                    partialTokenSet.forEach(newToken => {
                        tokenSet.push(newToken);
                    });
                }
            }
            else if (currState == eParseState.inDatPasm) {
                // process DAT section pasm (assembly) lines
                if (trimmedLine.length > 0) {
                    this._logPASM('- process DAT PASM line(' + i + 1 + '):  trimmedLine=[' + trimmedLine + ']');
                    // in DAT sections we end with FIT or just next section
                    const partialTokenSet: IParsedToken[] = this._reportDAT_PasmCode(i, 0, line)
                    partialTokenSet.forEach(newToken => {
                        tokenSet.push(newToken);
                    });
                    const lineParts: string[] = trimmedLine.split(/[ \t]/);
                    if (lineParts.length > 0 && lineParts[0].toUpperCase() == "FIT") {
                        currState = prePasmState;
                        this._logState('- scan ln:' + i + 1 + ' POP currState=[' + currState + ']');
                        // and ignore rest of this line
                    }
                }
            }
            else if (currState == eParseState.inPasmInline) {
                // process pasm (assembly) lines
                if (trimmedLine.length > 0) {
                    this._logPASM('- process SPIN2 PASM line(' + i + 1 + '):  trimmedLine=[' + trimmedLine + ']');
                    const lineParts: string[] = trimmedLine.split(/[ \t]/);
                    if (lineParts.length > 0 && lineParts[0].toUpperCase() == "END") {
                        currState = prePasmState;
                        this._logState('- scan ln:' + i + 1 + ' POP currState=[' + currState + ']');
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
                    this._logSPIN('- process SPIN2 line(' + i + 1 + '): trimmedLine=[' + trimmedLine + ']');
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
                statements = nonCommentConstantLine.split(',')
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
        const newName = line.substr(startNameOffset, nameLength).trim();
        const nameType: string = (isPrivate) ? 'private' : 'public';
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
            if (!isMultiDeclaration) {
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

    private _reportCON_DeclarationLine(lineNumber: number, startingOffset: number, line: string): IParsedToken[] {
        const tokenSet: IParsedToken[] = [];
        // skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        const nonCommentConstantLine = this._getNonCommentLineRemainder(currentOffset, line);
        this._logCON('- reportConstant nonCommentConstantLine=[' + nonCommentConstantLine + ']');

        const haveEnumDeclaration: boolean = (nonCommentConstantLine.indexOf('#') != -1);
        const containsMultiAssignments: boolean = (nonCommentConstantLine.indexOf(',') != -1);
        let statements: string[] = [nonCommentConstantLine];
        if (!haveEnumDeclaration && containsMultiAssignments) {
            statements = nonCommentConstantLine.split(',')
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
                    const assignmentRHSStr = assignmentParts[1].trim();
                    currentOffset = line.indexOf(assignmentRHSStr)  // skip to RHS of assignment
                    this._logCON('  -- assignmentRHSStr=[' + assignmentRHSStr + ']');
                    const possNames: string[] = this._getNonWhiteCONLineParts(assignmentRHSStr);
                    this._logCON('  -- possNames=[' + possNames + ']');
                    for (let index = 0; index < possNames.length; index++) {
                        const possibleName = possNames[index];
                        const currPossibleLen = possibleName.length;
                        currentOffset = line.indexOf(possibleName, currentOffset)  // skip to RHS of assignment
                        if (possibleName.substr(0, 1).match(/[a-zA-Z_]/)) {
                            // does name contain a namespace reference?
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
                            const nameOffset = line.indexOf(searchString, currentOffset);
                            this._logCON('  -- namePart=[' + namePart + '](' + nameOffset + ')');
                            if (this._isGlobalToken(namePart)) {
                                referenceDetails = this._getGlobalToken(namePart);
                                this._logCON('  --  FOUND global name=[' + namePart + ']');
                            }
                            if (referenceDetails != undefined) {
                                tokenSet.push({
                                    line: lineNumber,
                                    startCharacter: nameOffset,
                                    length: namePart.length,
                                    tokenType: referenceDetails.tokenType,
                                    tokenModifiers: referenceDetails.tokenModifiers
                                });
                            }
                            else {
                                if (!this._isSpinReservedWord(namePart) && !this._isBuiltinReservedWord(namePart) && !this._iDebugMethod(namePart)) {
                                    this._logCON('  --  CON MISSING name=[' + namePart + ']');
                                    tokenSet.push({
                                        line: lineNumber,
                                        startCharacter: nameOffset,
                                        length: namePart.length,
                                        tokenType: 'variable',
                                        tokenModifiers: ['readonly', 'missingDeclaration']
                                    });
                                }
                            }
                            if (possibleNameSet.length > 1) {
                                // we have .constant namespace suffix
                                // this can NOT be a method name it can only be a constant name
                                const referenceOffset = line.indexOf(searchString, currentOffset);
                                const constantPart: string = possibleNameSet[1];
                                const nameOffset = line.indexOf(constantPart, referenceOffset)
                                this._logCON('  -- constantPart=[' + namePart + '](' + nameOffset + ')');
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
                        currentOffset += enumConstant.length + 1

                    }
                }
            }
        }
        return tokenSet;
    }

    private _reportDAT_DeclarationLine(lineNumber: number, startingOffset: number, line: string): IParsedToken[] {
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
                // if we start with storage type, not name, process rest of line for symbols
                currentOffset = line.indexOf(lineParts[0], currentOffset);
                const allowLocalVarStatus: boolean = false;
                const NOT_DAT_PASM: boolean = false;
                const partialTokenSet: IParsedToken[] = this._reportDAT_ValueDeclarationCode(lineNumber, currentOffset, line, allowLocalVarStatus, this.showDAT, NOT_DAT_PASM)
                partialTokenSet.forEach(newToken => {
                    tokenSet.push(newToken);
                });
            }
            else {
                // this is line with name storageType and initial value
                this._logDAT('  -- rptDatDecl lineParts=[' + lineParts + ']');
                let newName = lineParts[0];
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
                currentOffset = line.indexOf(lineParts[1], nameOffset + newName.length);
                const allowLocalVarStatus: boolean = false;
                const NOT_DAT_PASM: boolean = false;
                const partialTokenSet: IParsedToken[] = this._reportDAT_ValueDeclarationCode(lineNumber, currentOffset, line, allowLocalVarStatus, this.showDAT, NOT_DAT_PASM)
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

    private _reportDAT_ValueDeclarationCode(lineNumber: number, startingOffset: number, line: string, allowLocal: boolean, showDebug: boolean, isDatPasm: boolean): IParsedToken[] {
        const tokenSet: IParsedToken[] = [];
        // process data declaration
        let currentOffset = this._skipWhite(line, startingOffset)
        const dataValueInitStr = this._getNonCommentLineRemainder(currentOffset, line);
        if (dataValueInitStr.length > 1) {
            if (showDebug) {
                this._logMessage('  -- reportDataValueInit dataValueInitStr=[' + dataValueInitStr + ']');
            }
            let lineParts: string[] = this._getNonWhiteDataInitLineParts(dataValueInitStr);
            const argumentStartIndex: number = (this._isDatStorageType(lineParts[0])) ? 1 : 0;
            if (showDebug) {
                this._logMessage('  -- lineParts=[' + lineParts + ']');
            }
            // process remainder of line
            if (lineParts.length < 2) {
                return tokenSet;
            }
            if (lineParts.length > 1) {
                for (let index = argumentStartIndex; index < lineParts.length; index++) {
                    const possibleName = lineParts[index].replace(/[\(\)\@]/, '');
                    //if (showDebug) {
                    //    this._logMessage('  -- possibleName=[' + possibleName + ']');
                    //}
                    const currPossibleLen = possibleName.length;
                    if (currPossibleLen < 1) {
                        continue;
                    }
                    let possibleNameSet: string[] = [];
                    // the following allows '.' in names but  only when in DAT PASM code, not spin!
                    if (possibleName.substr(0, 1).match(/[a-zA-Z_]/) || (isDatPasm && possibleName.substr(0, 1).match(/[a-zA-Z_\.]/))) {
                        if (showDebug) {
                            this._logMessage('  -- possibleName=[' + possibleName + ']');
                        }
                        // does name contain a namespace reference?
                        if (possibleName.includes('.') && !possibleName.startsWith('.')) {
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
                        currentOffset = line.indexOf(searchString, currentOffset);
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
                            tokenSet.push({
                                line: lineNumber,
                                startCharacter: currentOffset,
                                length: namePart.length,
                                tokenType: referenceDetails.tokenType,
                                tokenModifiers: referenceDetails.tokenModifiers
                            });
                        }
                        else {
                            if (!this._isPasmReservedWord(namePart) && !this._isPasmInstruction(namePart) && !this._isDatNFileStorageType(namePart) && !this._isBuiltinReservedWord(namePart)) {
                                if (showDebug) {
                                    this._logMessage('  --  DAT MISSING name=[' + namePart + ']');
                                }
                                tokenSet.push({
                                    line: lineNumber,
                                    startCharacter: currentOffset,
                                    length: namePart.length,
                                    tokenType: 'variable',
                                    tokenModifiers: ['missingDeclaration']
                                });
                            }
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
        currentOffset = line.indexOf(inLinePasmRHSStr, currentOffset);
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
                this._logPASM('  --  DAT Pasm ' + referenceDetails.tokenType + '=[' + labelName + '](' + nameOffset + 1 + ')');
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
                if (!this._isPasmReservedWord(labelName) && !this._isPasmInstruction(labelName) && !this._isBuiltinReservedWord(labelName)) {
                    // FIXME: UNDONE maybe we shouldn't have this code?
                    // hrmf... no global type???? this should be a lebel
                    const labelType: string = (isDataDeclarationLine) ? 'variable' : 'label';
                    this._logPASM('  --  DAT Pasm missing label=[' + labelName + '](' + 0 + 1 + ')');
                    tokenSet.push({
                        line: lineNumber,
                        startCharacter: 0,
                        length: labelName.length,
                        tokenType: labelType,
                        tokenModifiers: ['declaration', 'missingDeclaration']
                    });
                    haveLabel = true;
                }
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
                if (lineParts[argumentOffset].toUpperCase().startsWith("IF_") || lineParts[argumentOffset].toUpperCase().startsWith("_RET_")) {
                    // skip our conditional
                    argumentOffset++;
                    minNonLabelParts++;
                }
                if (lineParts.length > minNonLabelParts) {
                    // have at least instruction name
                    const likelyInstructionName: string = lineParts[minNonLabelParts - 1];
                    currentOffset = line.indexOf(likelyInstructionName, currentOffset);
                    this._logPASM('  -- DAT PASM likelyInstructionName=[' + likelyInstructionName + '], currentOffset=(' + currentOffset + ')');
                    currentOffset += likelyInstructionName.length + 1;
                    for (let index = minNonLabelParts; index < lineParts.length; index++) {
                        let argumentName = lineParts[index].replace(/[@#]/, '');
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
                        const argHasArrayRereference: boolean = (argumentName.includes('['));
                        if (argHasArrayRereference) {
                            const nameParts: string[] = argumentName.split('[')
                            argumentName = nameParts[0];
                        }
                        let nameOffset: number = 0;
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
                            nameOffset = line.indexOf(searchString, currentOffset);
                            this._logPASM('  --  DAT Pasm searchString=[' + searchString + '](' + nameOffset + 1 + ')');
                            let referenceDetails: IRememberedToken | undefined = undefined;
                            if (this._isGlobalToken(namePart)) {
                                referenceDetails = this._getGlobalToken(namePart);
                                this._logPASM('  --  FOUND global name=[' + namePart + ']');
                            }
                            if (referenceDetails != undefined) {
                                this._logPASM('  --  DAT Pasm name=[' + namePart + '](' + nameOffset + 1 + ')');
                                tokenSet.push({
                                    line: lineNumber,
                                    startCharacter: nameOffset,
                                    length: namePart.length,
                                    tokenType: referenceDetails.tokenType,
                                    tokenModifiers: referenceDetails.tokenModifiers
                                });
                            }
                            else {
                                if (!this._isPasmReservedWord(namePart) && !this._isPasmInstruction(namePart) && !this._isBuiltinReservedWord(namePart)) {
                                    this._logPASM('  --  DAT Pasm MISSING name=[' + namePart + '](' + nameOffset + 1 + ')');
                                    tokenSet.push({
                                        line: lineNumber,
                                        startCharacter: nameOffset,
                                        length: namePart.length,
                                        tokenType: 'variable',
                                        tokenModifiers: ['readonly', 'missingDeclaration']
                                    });
                                }
                            }
                            if (possibleNameSet.length > 1) {
                                // we have .constant namespace suffix
                                // this can NOT be a method name it can only be a constant name
                                const referenceOffset = line.indexOf(searchString, currentOffset);
                                const constantPart: string = possibleNameSet[1];
                                nameOffset = line.indexOf(constantPart, referenceOffset)
                                this._logPASM('  --  DAT Pasm constant=[' + namePart + '](' + nameOffset + 1 + ')');
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
                // skip line part 0 length when searching for [1] name
                currentOffset = line.indexOf(lineParts[1], currentOffset + lineParts[0].length);
            }
            const allowLocalVarStatus: boolean = false;
            const IS_DAT_PASM: boolean = true;
            const partialTokenSet: IParsedToken[] = this._reportDAT_ValueDeclarationCode(lineNumber, currentOffset, line, allowLocalVarStatus, this.showPasmCode, IS_DAT_PASM)
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
        // -----------------------------------
        //   Method Name
        //
        const startNameOffset = currentOffset
        // find open paren - skipping past method name
        currentOffset = line.indexOf('(', currentOffset);
        const methodName: string = line.substr(startNameOffset, currentOffset - startNameOffset).trim();
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
        this._logSPIN('-reportPubPriSig: methodName=[' + methodName + '](' + startNameOffset + ')');
        // -----------------------------------
        //   Parameters
        //
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
                const nameOffset = line.indexOf(paramName, currentOffset + 1);
                this._logSPIN('  -- paramName=[' + paramName + '](' + nameOffset + ')');
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
                currentOffset += paramName.length + 1
            }
        }
        // -----------------------------------
        //   Return Variable(s)
        //
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
                const nameOffset = line.indexOf(returnValueName, currentOffset);
                this._logSPIN('  -- returnValueName=[' + returnValueName + '](' + nameOffset + ')');
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
        // -----------------------------------
        //   Local Variable(s)
        //
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
                        const lineInfo: IFilteredStrings = this._getNonWhiteSpinLineParts(localName);
                        let localNameParts: string[] = lineInfo.lineParts
                        localName = localNameParts[0];
                        for (let index = 1; index < localNameParts.length; index++) {
                            const namedIndexPart = localNameParts[index];
                            const nameOffset = line.indexOf(namedIndexPart, currentOffset);
                            if (namedIndexPart.substr(0, 1).match(/[a-zA-Z_]/)) {
                                let referenceDetails: IRememberedToken | undefined = undefined;
                                if (this._isLocalToken(namedIndexPart)) {
                                    referenceDetails = this._getLocalToken(namedIndexPart);
                                    this._logSPIN('  --  FOUND local name=[' + namedIndexPart + ']');
                                }
                                else if (this._isGlobalToken(namedIndexPart)) {
                                    referenceDetails = this._getGlobalToken(namedIndexPart);
                                    this._logSPIN('  --  FOUND global name=[' + namedIndexPart + ']');
                                }
                                if (referenceDetails != undefined) {
                                    this._logSPIN('  --  lcl-idx variableName=[' + namedIndexPart + '](' + nameOffset + 1 + ')');
                                    tokenSet.push({
                                        line: lineNumber,
                                        startCharacter: nameOffset,
                                        length: namedIndexPart.length,
                                        tokenType: referenceDetails.tokenType,
                                        tokenModifiers: referenceDetails.tokenModifiers
                                    });
                                }
                                else {
                                    if (!this._isSpinReservedWord(namedIndexPart) && !this._isBuiltinReservedWord(namedIndexPart) && !this._iDebugMethod(namedIndexPart)) {
                                        // we don't have name registered so just mark it
                                        this._logSPIN('  --  SPIN MISSING varname=[' + namedIndexPart + '](' + nameOffset + 1 + ')');
                                        tokenSet.push({
                                            line: lineNumber,
                                            startCharacter: nameOffset,
                                            length: namedIndexPart.length,
                                            tokenType: 'variable',
                                            tokenModifiers: ['missingDeclaration']
                                        });
                                    }
                                }
                        }
                        }
                    }
                    const nameOffset = line.indexOf(localName, localVariableOffset);
                    this._logSPIN('  -- localName=[' + localName + '](' + nameOffset + + ')');
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
                // have line assigning value to variable(s)
                // -------------------------------------------
                const possibleVariableName = line.substr(currentOffset, assignmentOffset - currentOffset).trim()
                this._logSPIN('  -- LHS: possibleVariableName=[' + possibleVariableName + ']');
                let varNameList: string[] = [possibleVariableName]
                if (possibleVariableName.includes(",")) {
                    varNameList = possibleVariableName.split(',');
                }
                if (possibleVariableName.includes(" ")) {
                    const lineInfo: IFilteredStrings = this._getNonWhiteSpinLineParts(possibleVariableName);
                    varNameList = lineInfo.lineParts;
                }
                this._logSPIN('  -- LHS: varNameList=[' + varNameList + ']');
                for (let index = 0; index < varNameList.length; index++) {
                    const variableName: string = varNameList[index];
                    const variableNameLen: number = variableName.length;
                    if (variableName.includes("[")) {
                        // NOTE this handles code: byte[pColor][2] := {value}
                        // NOTE2 this handles code: result.byte[3] := {value}  P2 OBEX: jm_apa102c.spin2 (139)
                        // have complex target name, parse in loop
                        const variableNameParts: string[] = variableName.split(/[ \t\[\]\+\-\(\)\<\>]/);
                        this._logSPIN('  -- LHS: [] variableNameParts=[' + variableNameParts + ']');
                        let haveModification: boolean = false;
                        for (let index = 0; index < variableNameParts.length; index++) {
                            let variableNamePart = variableNameParts[index].replace('@', '');
                            // secial case handle datar.[i] which leaves var name as 'darar.'
                            if (variableNamePart.endsWith('.')) {
                                variableNamePart = variableNamePart.substr(0, variableNamePart.length - 1);
                            }
                            const nameOffset = line.indexOf(variableNamePart, currentOffset);
                            if (variableNamePart.substr(0, 1).match(/[a-zA-Z_]/)) {
                                if (variableNamePart.includes('.')) {
                                    const varNameParts: string[] = variableNamePart.split('.');
                                    if (this._isDatStorageType(varNameParts[1])) {
                                        variableNamePart = varNameParts[0]; // just use first part of name
                                        /*
                                        // FIXME: UNDONE mark storage part correctly, yes, out-of-order
                                        const nameOffset: number = line.indexOf(varNameParts[1]);
                                        this._logSPIN('  --  SPIN storageType=[' + varNameParts[1] + '](' + nameOffset + 1 + ')');
                                        tokenSet.push({
                                            line: lineNumber,
                                            startCharacter: nameOffset,
                                            length: varNameParts[1].length,
                                            tokenType: 'storageType',
                                            tokenModifiers: []
                                        });
                                        */
                                   }
                                }
                                this._logSPIN('  -- variableNamePart=[' + variableNamePart + '](' + nameOffset + 1 + ')');
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
                                        this._logSPIN('  --  SPIN variableName=[' + variableNamePart + '](' + nameOffset + 1 + ')');
                                        tokenSet.push({
                                            line: lineNumber,
                                            startCharacter: nameOffset,
                                            length: variableNamePart.length,
                                            tokenType: referenceDetails.tokenType,
                                            tokenModifiers: modificationArray
                                        });
                                    }
                                    else {
                                        if (!this._isSpinReservedWord(variableNamePart) && !this._isBuiltinReservedWord(variableNamePart) && !this._iDebugMethod(variableNamePart)) {
                                            // we don't have name registered so just mark it
                                            this._logSPIN('  --  SPIN MISSING varname=[' + variableNamePart + '](' + nameOffset + 1 + ')');
                                            tokenSet.push({
                                                line: lineNumber,
                                                startCharacter: nameOffset,
                                                length: variableNamePart.length,
                                                tokenType: 'variable',
                                                tokenModifiers: ['modification', 'missingDeclaration']
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                    else {
                        // have simple target name, no []
                        let cleanedVariableName: string = variableName.replace(/[ \t\(\)]/, '');
                        const nameOffset = line.indexOf(cleanedVariableName, currentOffset);
                        if (cleanedVariableName.substr(0, 1).match(/[a-zA-Z_]/) && !this._isStorageType(cleanedVariableName)) {
                            this._logSPIN('  --  SPIN cleanedVariableName=[' + cleanedVariableName + '](' + nameOffset + 1 + ')');
                            if (cleanedVariableName.includes('.')) {
                                const varNameParts: string[] = cleanedVariableName.split('.');
                                if (this._isDatStorageType(varNameParts[1])) {
                                    cleanedVariableName = varNameParts[0]; // just use first part of name
                                    /*
                                    // FIXME: UNDONE mark storage part correctly, yes, out-of-order
                                    const nameOffset: number = line.indexOf(varNameParts[1]);
                                    this._logSPIN('  --  SPIN storageType=[' + varNameParts[1] + '](' + nameOffset + 1 + ')');
                                    tokenSet.push({
                                        line: lineNumber,
                                        startCharacter: nameOffset,
                                        length: varNameParts[1].length,
                                        tokenType: 'storageType',
                                        tokenModifiers: []
                                    });
                                    */
                               }
                            }
                        let referenceDetails: IRememberedToken | undefined = undefined;
                            if (this._isLocalToken(cleanedVariableName)) {
                                referenceDetails = this._getLocalToken(cleanedVariableName);
                                this._logSPIN('  --  FOUND local name=[' + cleanedVariableName + ']');
                            }
                            else if (this._isGlobalToken(cleanedVariableName)) {
                                referenceDetails = this._getGlobalToken(cleanedVariableName);
                                this._logSPIN('  --  FOUND globel name=[' + cleanedVariableName + ']');
                            }
                            if (referenceDetails != undefined) {
                                let modificationArray: string[] = referenceDetails.tokenModifiers;
                                modificationArray.push('modification');
                                this._logSPIN('  -- spin: simple variableName=[' + cleanedVariableName + '](' + nameOffset + 1 + ')');
                                tokenSet.push({
                                    line: lineNumber,
                                    startCharacter: nameOffset,
                                    length: cleanedVariableName.length,
                                    tokenType: referenceDetails.tokenType,
                                    tokenModifiers: modificationArray
                                });
                            }
                            else if (cleanedVariableName == '_') {
                                this._logSPIN('  --  built-in=[' + cleanedVariableName + '](' + nameOffset + 1 + ')');
                                tokenSet.push({
                                    line: lineNumber,
                                    startCharacter: nameOffset,
                                    length: cleanedVariableName.length,
                                    tokenType: 'variable',
                                    tokenModifiers: ['modification', 'defaultLibrary']
                                });
                            }
                            else {
                                // we don't have name registered so just mark it
                                if (!this._isSpinReservedWord(cleanedVariableName) && !this._isBuiltinReservedWord(cleanedVariableName) && !this._iDebugMethod(cleanedVariableName)) {
                                    this._logSPIN('  --  SPIN MISSING cln name=[' + cleanedVariableName + '](' + nameOffset + 1 + ')');
                                    tokenSet.push({
                                        line: lineNumber,
                                        startCharacter: nameOffset,
                                        length: cleanedVariableName.length,
                                        tokenType: 'variable',
                                        tokenModifiers: ['modification', 'missingDeclaration']
                                    });
                                }
                            }
                        }
                    }
                    currentOffset += variableNameLen + 1;
                }
                currentOffset = assignmentOffset + 2;
            }
            const assignmentRHSStr: string = this._getNonCommentLineRemainder(currentOffset, line);
            currentOffset = line.indexOf(assignmentRHSStr, currentOffset);
            const preCleanAssignmentRHSStr = this._getNonInlineCommentLine(assignmentRHSStr).replace('..', '  ');
            this._logSPIN('  -- assignmentRHSStr=[' + assignmentRHSStr + ']');
            const lineInfo: IFilteredStrings = this._getNonWhiteSpinLineParts(preCleanAssignmentRHSStr);
            let possNames: string[] = lineInfo.lineParts;
            const nonStringAssignmentRHSStr: string = lineInfo.lineNoQuotes;
            let currNonStringOffset = 0;
            // special code to handle case range strings:  [e.g., SEG_TOP..SEG_BOTTOM:]
            //const isCaseValue: boolean = assignmentRHSStr.endsWith(':');
            //if (isCaseValue && possNames[0].includes("..")) {
            //    possNames = possNames[0].split("..");
            //}
            this._logSPIN('  -- possNames=[' + possNames + ']');
            for (let index = 0; index < possNames.length; index++) {
                let possibleName = possNames[index];
                // special code to handle case of var.[bitfield] leaving name a 'var.'
                if (possibleName.endsWith('.')) {
                    possibleName = possibleName.substr(0, possibleName.length - 1);
                }
                let possibleNameSet: string[] = [];
                let nameOffset: number = 0;
                currNonStringOffset = nonStringAssignmentRHSStr.indexOf(possNames[index], currNonStringOffset);
                const currNonStringNameLen: number = possNames[index].length;
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
                    nameOffset = nonStringAssignmentRHSStr.indexOf(searchString, currNonStringOffset) + currentOffset;
                    this._logSPIN('  --  spin RHS  nonStringAssignmentRHSStr=[' + nonStringAssignmentRHSStr + ']');
                    this._logSPIN('  --  spin RHS   searchString=[' + searchString + ']');
                    this._logSPIN('  --  spin RHS    nameOffset=(' + nameOffset + '), currNonStringOffset=(' + currNonStringOffset + '), currentOffset=(' + currentOffset + ')');
                    let referenceDetails: IRememberedToken | undefined = undefined;
                    if (this._isLocalToken(namePart)) {
                        referenceDetails = this._getLocalToken(namePart);
                        this._logSPIN('  --  FOUND local name=[' + namePart + ']');
                    } else if (this._isGlobalToken(namePart)) {
                        referenceDetails = this._getGlobalToken(namePart);
                        this._logSPIN('  --  FOUND global name=[' + namePart + ']');
                    }
                    if (referenceDetails != undefined) {
                        this._logSPIN('  --  spin RHS name=[' + namePart + '](' + nameOffset + 1 + ')');
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
                            this._logSPIN('  --  spin RHS storageType=[' + namePart + ']');
                            tokenSet.push({
                                line: lineNumber,
                                startCharacter: nameOffset,
                                length: namePart.length,
                                tokenType: 'storageType',
                                tokenModifiers: []
                            });
                        }
                        else if (!this._isSpinReservedWord(namePart) && !this._isBuiltinReservedWord(namePart) && !this._iDebugMethod(namePart)) {
                            // NO DEBUG FOR ELSE, most of spin control elements come through here!
                            //else {
                            //    this._logSPIN('  -- UNKNOWN?? name=[' + namePart + '] - name-get-breakage??');
                            //}

                            this._logSPIN('  --  SPIN MISSING rhs name=[' + namePart + ']');
                            tokenSet.push({
                                line: lineNumber,
                                startCharacter: nameOffset,
                                length: namePart.length,
                                tokenType: 'variable',
                                tokenModifiers: ['missingDeclaration']
                            });
                        }
                    }
                    if (possibleNameSet.length > 1) {
                        // we have .constant namespace suffix
                        // determine if this is method has '(' or constant name
                        const referenceOffset = nonStringAssignmentRHSStr.indexOf(searchString, currNonStringOffset) + currentOffset;
                        let isMethod: boolean = false;
                        if (line.substr(referenceOffset + searchString.length, 1) == '(') {
                            isMethod = true;
                        }
                        const constantPart: string = possibleNameSet[1];
                        if (this._isStorageType(constantPart)) {
                            // FIXME: UNDONE remove when syntax see this correctly
                            const nameOffset: number = line.indexOf(constantPart, currentOffset);
                            this._logSPIN('  --  SPIN rhs storageType=[' + constantPart + '](' + nameOffset + 1 + ')');
                            tokenSet.push({
                                line: lineNumber,
                                startCharacter: nameOffset,
                                length: constantPart.length,
                                tokenType: 'storageType',
                                tokenModifiers: []
                            });
                        }
                        else {
                            nameOffset = nonStringAssignmentRHSStr.indexOf(constantPart, currNonStringOffset) + currentOffset;
                            const tokenTypeID: string = (isMethod) ? 'method' : 'variable';
                            const tokenModifiers: string[] = (isMethod) ? [] : ['readonly'];
                            this._logSPIN('  --  spin rhs constant=[' + constantPart + '](' + nameOffset + 1 + ') (' + tokenTypeID + ')');
                            tokenSet.push({
                                line: lineNumber,
                                startCharacter: nameOffset,
                                length: constantPart.length,
                                tokenType: tokenTypeID,
                                tokenModifiers: tokenModifiers
                            });
                        }
                    }
                }
                else if (possibleName.startsWith('.')) {
                    const externalMethodName: string = possibleName.replace('.', '')
                    nameOffset = nonStringAssignmentRHSStr.indexOf(externalMethodName, currNonStringOffset) + currentOffset;
                    this._logSPIN('  --  spin rhs externalMethodName=[' + externalMethodName + '](' + nameOffset + 1 + ')');
                    tokenSet.push({
                        line: lineNumber,
                        startCharacter: nameOffset,
                        length: externalMethodName.length,
                        tokenType: 'method',
                        tokenModifiers: []
                    });
                }
                currNonStringOffset += currNonStringNameLen + 1
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
                            const nameOffset = line.indexOf(searchString, currentOffset);
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
                                tokenSet.push({
                                    line: lineNumber,
                                    startCharacter: nameOffset,
                                    length: namePart.length,
                                    tokenType: referenceDetails.tokenType,
                                    tokenModifiers: referenceDetails.tokenModifiers
                                });
                            }
                            else {
                                // we don't have name registered so just mark it
                                if (!this._isSpinReservedWord(namePart) && !this._isBuiltinReservedWord(namePart) && !this._iDebugMethod(namePart)) {
                                    this._logPASM('  --  SPIN Pasm MISSING name=[' + namePart + ']');
                                    tokenSet.push({
                                        line: lineNumber,
                                        startCharacter: nameOffset,
                                        length: namePart.length,
                                        tokenType: 'variable',
                                        tokenModifiers: ['missingDeclaration']
                                    });
                                }
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
            const NOT_DAT_PASM: boolean = false;
            const partialTokenSet: IParsedToken[] = this._reportDAT_ValueDeclarationCode(lineNumber, currentOffset, line, allowLocalVarStatus, this.showPasmCode, NOT_DAT_PASM)
            partialTokenSet.forEach(newToken => {
                tokenSet.push(newToken);
            });
        }
        return tokenSet;
    }

    private _reportOBJ_DeclarationLine(lineNumber: number, startingOffset: number, line: string): IParsedToken[] {
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
                            else {
                                // we don't have name registered so just mark it
                                if (!this._isSpinReservedWord(nameReference) && !this._isBuiltinReservedWord(nameReference) && !this._iDebugMethod(nameReference)) {
                                    this._logOBJ('  --  OBJ MISSING name=[' + nameReference + ']');
                                    tokenSet.push({
                                        line: lineNumber,
                                        startCharacter: nameOffset,
                                        length: nameReference.length,
                                        tokenType: 'variable',
                                        tokenModifiers: ['missingDeclaration']
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

    private _reportVAR_DeclarationLine(lineNumber: number, startingOffset: number, line: string): IParsedToken[] {
        const tokenSet: IParsedToken[] = [];
        //skip Past Whitespace
        let currentOffset = this._skipWhite(line, startingOffset)
        const remainingNonCommentLineStr: string = this._getNonCommentLineRemainder(currentOffset, line);
        if (remainingNonCommentLineStr.length > 0) {
            // get line parts - we only care about first one
            let lineParts: string[] = this._getCommaDelimitedNonWhiteLineParts(remainingNonCommentLineStr);
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
                                    else {
                                        // we don't have name registered so just mark it
                                        if (!this._isSpinReservedWord(namePart) && !this._isBuiltinReservedWord(namePart) && !this._iDebugMethod(namePart)) {
                                            this._logVAR('  --  VAR MISSING name=[' + namePart + ']');
                                            tokenSet.push({
                                                line: lineNumber,
                                                startCharacter: nameOffset,
                                                length: namePart.length,
                                                tokenType: 'variable',
                                                tokenModifiers: ['missingDeclaration']
                                            });
                                        }
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
        }
        return tokenSet;
    }

    /*
    private _possiblyMarkBrokenSingleLineComment(lineNumber: number, startingOffset: number, line: string): IParsedToken[] {
        //
        //  this is an override to fix the lack of the syntax parser to recognize single line comments when there is more than one ' marker in the line.
        //
        const tokenSet: IParsedToken[] = [];
        //skip Past Whitespace
        if ((line.length - startingOffset) > 2) {
            let startLineDocCommentOffset: number = line.indexOf("''");
            if (startLineDocCommentOffset == -1) {
                let startLineCommentOffset: number = line.indexOf("'");
                if (startLineCommentOffset != -1) {
                    const nonStringLine = this._removeQuotedStrings(line);
                    startLineCommentOffset = nonStringLine.indexOf("'");
                    if (startLineCommentOffset != -1) {
                        // we have our first outside of a string
                        let secondLineCommentOffset: number = nonStringLine.indexOf("'", startLineCommentOffset + 1);
                        if (secondLineCommentOffset != -1 && secondLineCommentOffset - startLineCommentOffset > 1) {
                            this._logMessage('- pmbslc 2c! nonStringLine=[' + nonStringLine + '](' + startLineCommentOffset + ',' + secondLineCommentOffset + ')');
                            // we have a second this line needs help!
                            tokenSet.push({
                                line: lineNumber,
                                startCharacter: startLineCommentOffset,
                                length: line.substr(startLineCommentOffset).length,
                                tokenType: 'comment',
                                tokenModifiers: []
                            });
                        }
                    }
                }
            }
        }
        return tokenSet;
    }
    */

    private spin2log: any = undefined;
    // adjust following true/false to show specific parsing debug
    private spinDebugLogEnabled: boolean = false;
    private showSpinCode: boolean = true;
    private showCON: boolean = true;
    private showOBJ: boolean = true;
    private showDAT: boolean = true;
    private showVAR: boolean = true;
    private showPasmCode: boolean = true;
    private showState: boolean = true;


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

    private _isSectionStartLine(line: string): { isSectionStart: boolean, inProgressStatus: eParseState } {
        // return T/F where T means our string starts a new section!
        let startStatus: boolean = false;
        let inProgressState: eParseState = eParseState.Unknown;
        if (line.length > 2) {
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

    private _getNonInlineCommentLine(line: string): string {
       // NEW remove {comment} and {{comment}} single-line elements too
       let nonInlineCommentStr: string = line;
        // TODO: UNDONE make this into loop to find all single line {} or {{}} comments
        const startDoubleBraceOffset: number = nonInlineCommentStr.indexOf('{{');
        if (startDoubleBraceOffset != -1) {
            const endDoubleBraceOffset: number = nonInlineCommentStr.indexOf('}}', startDoubleBraceOffset + 2);
            if (endDoubleBraceOffset != -1) {
                // remove this comment
                const badElement = nonInlineCommentStr.substr(startDoubleBraceOffset, endDoubleBraceOffset - startDoubleBraceOffset + 1);
                //this._logMessage('  -- badElement=[' + badElement + ']');
                nonInlineCommentStr = nonInlineCommentStr.replace(badElement, ' '.repeat(badElement.length));
            }
        }
        const startSingleBraceOffset: number = nonInlineCommentStr.indexOf('{');
        if (startSingleBraceOffset != -1) {
            const endSingleBraceOffset: number = nonInlineCommentStr.indexOf('}', startSingleBraceOffset + 1);
            if (endSingleBraceOffset != -1) {
                // remove this comment
                const badElement = nonInlineCommentStr.substr(startSingleBraceOffset, endSingleBraceOffset - startSingleBraceOffset + 1);
                //this._logMessage('  -- badElement=[' + badElement + ']');
                nonInlineCommentStr = nonInlineCommentStr.replace(badElement, ' '.repeat(badElement.length));
            }
        }
        if (nonInlineCommentStr.length != line.length) {
            this._logMessage('  -- NIC line [' + line + ']');
            this._logMessage('  --          [' + nonInlineCommentStr + ']');
        }
        return nonInlineCommentStr;
    }

    private _getNonCommentLineRemainder(startingOffset: number, line: string): string {
        let nonCommentRHSStr: string = line;
        // TODO: UNDONE make this into loop to find first ' not in string
        if (line.length - startingOffset > 0) {
            //this._logMessage('- gnclr startingOffset=[' + startingOffset + '], startingOffset=[' + line + ']');
            let currentOffset: number = this._skipWhite(line, startingOffset);
            // get line parts - we only care about first one
            let beginCommentOffset: number = line.indexOf("'", currentOffset);
            if (beginCommentOffset != -1) {
                // have single quote, is it within quoted string?
                const startDoubleQuoteOffset: number = line.indexOf('"', currentOffset);
                if (startDoubleQuoteOffset != -1) {
                    const nonStringLine: string = this._removeQuotedStrings(line);
                    beginCommentOffset = nonStringLine.indexOf("'", currentOffset);
                }
            }
            if (beginCommentOffset === -1) {
                beginCommentOffset = line.indexOf("{", currentOffset);
            }
            const nonCommentEOL: number = (beginCommentOffset != -1) ? beginCommentOffset - 1 : line.length - 1;
            //this._logMessage('- gnclr startingOffset=[' + startingOffset + '], currentOffset=[' + currentOffset + ']');
            nonCommentRHSStr = line.substr(currentOffset, nonCommentEOL - currentOffset + 1).trim();
            //this._logMessage('- gnclr nonCommentRHSStr=[' + startingOffset + ']');

            const singleLineMultiBeginOffset: number = nonCommentRHSStr.indexOf("{", currentOffset);
            if (singleLineMultiBeginOffset != -1) {
                const singleLineMultiEndOffset: number = nonCommentRHSStr.indexOf("}", singleLineMultiBeginOffset);
                if (singleLineMultiEndOffset != -1) {
                    const oneLineMultiCOmment: string = nonCommentRHSStr.substr(singleLineMultiBeginOffset, singleLineMultiEndOffset - singleLineMultiBeginOffset + 1);
                    nonCommentRHSStr = nonCommentRHSStr.replace(oneLineMultiCOmment, '').trim();
                }
            }
        }
        //if (line.substr(startingOffset).length != nonCommentRHSStr.length) {
        //    this._logMessage('  -- NCLR line [' + line.substr(startingOffset) + ']');
        //    this._logMessage('  --           [' + nonCommentRHSStr + ']');
        //}
        return nonCommentRHSStr;
    }

    private _getNonWhiteDataInitLineParts(line: string): string[] {
        const nonEqualsLine: string = this._removeQuotedStrings(line);
        let lineParts: string[] | null = nonEqualsLine.match(/[^ \t\,\[\]\(\)\+\-\/\<\>\|\*\@]+/g);
        if (lineParts === null) {
            lineParts = [];
        }
        return lineParts;
    }

    private _getNonWhiteCONLineParts(line: string): string[] {
        const nonEqualsLine: string = this._removeQuotedStrings(line);
        let lineParts: string[] | null = nonEqualsLine.match(/[^  \t\(\)\*\+\-\/\>\<]+/g);
        if (lineParts === null) {
            lineParts = [];
        }
        return lineParts;
    }

    private _getNonWhitePasmLineParts(line: string): string[] {
        const nonEqualsLine: string = this._removeQuotedStrings(line);
        let lineParts: string[] | null = nonEqualsLine.match(/[^ \t\,\(\)\<\>\+\*\&\|\-\\\#\@\/]+/g);
        if (lineParts === null) {
            lineParts = [];
        }
        return lineParts;
    }

    private _getNonWhiteSpinLineParts(line: string): IFilteredStrings {
        //                                     split(/[ \t\-\:\,\+\[\]\@\(\)\!\*\=\<\>\&\|\?\\\~\#\^\/]/);
        const nonEqualsLine: string = this._removeQuotedStrings(line);
        let lineParts: string[] | null = nonEqualsLine.match(/[^ \t\-\:\,\+\[\]\@\(\)\!\*\=\<\>\&\|\?\\\~\#\^\/]+/g);
        if (lineParts === null) {
            lineParts = [];
        }
        return {
            lineNoQuotes: nonEqualsLine,
            lineParts: lineParts
        };
    }

    private _removeQuotedStrings(line: string): string {
        //this._logMessage('- RQS line [' + line + ']');
        let trimmedLine: string = line;
        //this._logMessage('- RQS line [' + line + ']');
        const doubleQuote: string = '"';
        let quoteStartOffset: number = 0;   // value doesn't matter
        let didRemove: boolean = false;
        while ((quoteStartOffset = trimmedLine.indexOf(doubleQuote)) != -1) {
            const quoteEndOffset: number = trimmedLine.indexOf(doubleQuote, quoteStartOffset + 1);
            //this._logMessage('  -- quoteStartOffset=[' + quoteStartOffset + '] quoteEndOffset=[' + quoteEndOffset + ']');
            if (quoteEndOffset != -1) {
                const badElement = trimmedLine.substr(quoteStartOffset, quoteEndOffset - quoteStartOffset + 1);
                //this._logMessage('  -- badElement=[' + badElement + ']');
                trimmedLine = trimmedLine.replace(badElement, '#'.repeat(badElement.length));
                didRemove = true;
                //this._logMessage('-         post[' + trimmedLine + ']');
            }
            else {
                break;  // we don't handle a single double-quote
            }
        }

        if (didRemove) {
            this._logMessage('  -- RQS line [' + line + ']');
            this._logMessage('  --          [' + trimmedLine + ']');
        }

        return trimmedLine;
    }

    private _getNonWhiteLineParts(line: string): string[] {
        let lineParts: string[] | null = line.match(/[^ \t]+/g);
        if (lineParts === null) {
            lineParts = [];
        }
        return lineParts;
    }

    private _getCommaDelimitedNonWhiteLineParts(line: string): string[] {
        let lineParts: string[] | null = line.match(/[^ \t,]+/g);
        if (lineParts === null) {
            lineParts = [];
        }
        return lineParts;
    }

    private _isGlobalToken(tokenName: string): boolean {
        const foundStatus: boolean = this.globalTokens.has(tokenName.toLowerCase());
        return foundStatus;
    }

    private _setGlobalToken(tokenName: string, token: IRememberedToken): void {
        if (!this._isGlobalToken(tokenName)) {
            this.globalTokens.set(tokenName.toLowerCase(), token);
        }
    }

    private _getGlobalToken(tokenName: string): IRememberedToken | undefined {
        const desiredToken: IRememberedToken | undefined = this.globalTokens.get(tokenName.toLowerCase());
        return desiredToken
    }

    private _isLocalToken(tokenName: string): boolean {
        const foundStatus: boolean = this.localTokens.has(tokenName.toLowerCase());
        return foundStatus;
    }

    private _setLocalToken(tokenName: string, token: IRememberedToken): void {
        if (!this._isLocalToken(tokenName)) {
            this.localTokens.set(tokenName.toLowerCase(), token);
        }
    }

    private _getLocalToken(tokenName: string): IRememberedToken | undefined {
        const desiredToken: IRememberedToken | undefined = this.localTokens.get(tokenName.toLowerCase());
        return desiredToken
    }

    private _getLocalPasmTokensMap(methodName: string): Map<string, IRememberedToken> {
        // get our exiting list, or make a new empty list and return it
        const desiredMethodNameKey = methodName.toLowerCase();
        let desiredMap: Map<string, IRememberedToken> | undefined = this.localPasmTokensByMethodName.get(desiredMethodNameKey);
        if (desiredMap == undefined) {
            desiredMap = new Map<string, IRememberedToken>();
            this.localPasmTokensByMethodName.set(desiredMethodNameKey, desiredMap)
        }
        return desiredMap;
    }

    private _isLocalPasmTokenListForMethod(methodName: string): boolean {
        let mapExistsStatus: boolean = true;
        const desiredMethodNameKey = methodName.toLowerCase();
        let desiredMap: Map<string, IRememberedToken> | undefined = this.localPasmTokensByMethodName.get(desiredMethodNameKey);
        if (desiredMap == undefined) {
            mapExistsStatus = false;
        }
        return mapExistsStatus;
    }

    private _isLocalPasmTokenForMethod(methodName: string, tokenName: string): boolean {
        let foundStatus: boolean = false;
        if (this._isLocalPasmTokenListForMethod(methodName)) {
            const methodLocalTokens = this._getLocalPasmTokensMap(methodName)
            const desiredNameKey = tokenName.toLowerCase();
            foundStatus = methodLocalTokens.has(desiredNameKey);
        }
        return foundStatus;
    }

    private _setLocalPasmTokenForMethod(methodName: string, tokenName: string, token: IRememberedToken): void {
        const methodLocalTokens = this._getLocalPasmTokensMap(methodName)
        const desiredNameKey = tokenName.toLowerCase();
        if (!methodLocalTokens.has(desiredNameKey)) {
            methodLocalTokens.set(desiredNameKey, token);
        }
    }

    private _getLocalPasmTokenForMethod(methodName: string, tokenName: string): IRememberedToken | undefined {
        let desiredToken: IRememberedToken | undefined = undefined;
        if (this._isLocalPasmTokenListForMethod(methodName)) {
            const methodLocalTokens = this._getLocalPasmTokensMap(methodName)
            const desiredNameKey = tokenName.toLowerCase();
            desiredToken = methodLocalTokens.get(desiredNameKey);
        }
        return desiredToken
    }
    private _isBuiltinReservedWord(name: string): boolean {
        // streamer constants, smart-pin constants
        const builtinNamesOfNote: string[] = [
            // streamer names
            'x_16p_2dac8_wfword', 'x_16p_4dac4_wfword', 'x_1adc8_0p_1dac8_wfbyte', 'x_1adc8_8p_2dac8_wfword',
            'x_1p_1dac1_wfbyte', 'x_2adc8_0p_2dac8_wfword', 'x_2adc8_16p_4dac8_wflong', 'x_2p_1dac2_wfbyte',
            'x_2p_2dac1_wfbyte', 'x_32p_4dac8_wflong', 'x_4adc8_0p_4dac8_wflong', 'x_4p_1dac4_wfbyte',
            'x_4p_2dac2_wfbyte', 'x_4p_4dac1_wf_byte', 'x_8p_1dac8_wfbyte', 'x_8p_2dac4_wfbyte',
            'x_8p_4dac2_wfbyte', 'x_alt_off', 'x_alt_on', 'x_dacs_0n0_0n0', 'x_dacs_0n0_x_x', 'x_dacs_0_0_0_0',
            'x_dacs_0_0_x_x', 'x_dacs_0_x_x_x', 'x_dacs_1n1_0n0', 'x_dacs_1_0_1_0', 'x_dacs_1_0_x_x',
            'x_dacs_3_2_1_0', 'x_dacs_off', 'x_dacs_x_0_x_x', 'x_dacs_x_x_0n0', 'x_dacs_x_x_0_0',
            'x_dacs_x_x_0_x', 'x_dacs_x_x_1_0', 'x_dacs_x_x_x_0', 'x_dds_goertzel_sinc1', 'x_dds_goertzel_sinc2',
            'x_imm_16x2_1dac2', 'x_imm_16x2_2dac1', 'x_imm_16x2_lut', 'x_imm_1x32_4dac8', 'x_imm_2x16_2dac8',
            'x_imm_2x16_4dac4', 'x_imm_32x1_1dac1', 'x_imm_32x1_lut', 'x_imm_4x8_1dac8', 'x_imm_4x8_2dac4',
            'x_imm_4x8_4dac2', 'x_imm_4x8_lut', 'x_imm_8x4_1dac4', 'x_imm_8x4_2dac2', 'x_imm_8x4_4dac1',
            'x_imm_8x4_lut', 'x_pins_off', 'x_pins_on', 'x_rfbyte_1p_1dac1', 'x_rfbyte_2p_1dac2',
            'x_rfbyte_2p_2dac1', 'x_rfbyte_4p_1dac4', 'x_rfbyte_4p_2dac2', 'x_rfbyte_4p_4dac1', 'x_rfbyte_8p_1dac8',
            'x_rfbyte_8p_2dac4', 'x_rfbyte_8p_4dac2', 'x_rfbyte_luma8', 'x_rfbyte_rgb8', 'x_rfbyte_rgbi8',
            'x_rflong_16x2_lut', 'x_rflong_32p_4dac8', 'x_rflong_32x1_lut', 'x_rflong_4x8_lut', 'x_rflong_8x4_lut',
            'x_rflong_rgb24', 'x_rfword_16p_2dac8', 'x_rfword_16p_4dac4', 'x_rfword_rgb16', 'x_write_off', 'x_write_on',
            // smart pin names
            'p_adc', 'p_adc_100x', 'p_adc_10x', 'p_adc_1x', 'p_adc_30x', 'p_adc_3x', 'p_adc_ext', 'p_adc_float',
            'p_adc_gio', 'p_adc_scope', 'p_adc_vio', 'p_async_io', 'p_async_rx', 'p_async_tx', 'p_bitdac',
            'p_channel', 'p_compare_ab', 'p_compare_ab_fb', 'p_counter_highs', 'p_counter_periods',
            'p_counter_ticks', 'p_count_highs', 'p_count_rises', 'p_dac_124r_3v', 'p_dac_600r_2v',
            'p_dac_75r_2v', 'p_dac_990r_3v', 'p_dac_dither_pwm', 'p_dac_dither_rnd', 'p_dac_noise',
            'p_events_ticks', 'p_high_100ua', 'p_high_10ua', 'p_high_150k', 'p_high_15k', 'p_high_1k5',
            'p_high_1ma', 'p_high_fast', 'p_high_float', 'p_high_ticks', 'p_invert_a', 'p_invert_b',
            'p_invert_in', 'p_invert_output', 'p_level_a', 'p_level_a_fbn', 'p_level_a_fbp', 'p_local_a',
            'p_local_b', 'p_logic_a', 'p_logic_a_fb', 'p_logic_b_fb', 'p_low_100ua', 'p_low_10ua', 'p_low_150k',
            'p_low_15k', 'p_low_1k5', 'p_low_1ma', 'p_low_fast', 'p_low_float', 'p_minus1_a', 'p_minus1_b',
            'p_minus2_a', 'p_minus2_b', 'p_minus3_a', 'p_minus3_b', 'p_nco_duty', 'p_nco_freq', 'p_normal', 'p_oe',
            'p_outbit_a', 'p_outbit_b', 'p_periods_highs', 'p_periods_ticks', 'p_plus1_a', 'p_plus1_b',
            'p_plus2_a', 'p_plus2_b', 'p_plus3_a', 'p_plus3_b', 'p_pulse', 'p_pwm_sawtooth', 'p_pwm_smps',
            'p_pwm_triangle', 'p_quadrature', 'p_reg_down', 'p_reg_up', 'p_repository', 'p_schmitt_a',
            'p_schmitt_a_fb', 'p_schmitt_b_fb', 'p_state_ticks', 'p_sync_io', 'p_sync_rx', 'p_sync_tx',
            'p_transition', 'p_true_a', 'p_true_b', 'p_true_in', 'p_true_output', 'p_tt_00', 'p_tt_01',
            'p_tt_10', 'p_tt_11', 'p_usb_pair',
            // event names
            'event_atn', 'event_ct1', 'event_ct2', 'event_ct3', 'event_fbw', 'event_int', 'event_pat',
            'event_qmt', 'event_se1', 'event_se2', 'event_se3', 'event_se4', 'event_xfi', 'event_xmt',
            'event_xrl', 'event_xro',
            // debug() support
            'debug_cogs', 'debug_delay', 'debug_pin', 'debug_baud', 'debug_timestamp', 'debug_log_size',
            'debug_left', 'debug_top', 'debug_width', 'debug_height', 'debug_display_left',
            'debug_display_top', 'debug_windows_off', 'debug', 'dly', 'ifnot', 'if',
            //
            'pr0', 'pr1', 'pr2', 'pr3', 'pr4', 'pr5', 'pr6', 'pr7', 'ijmp1', 'ijmp2', 'ijmp3', 'iret1',
            'iret2', 'iret3', 'pa', 'pb', 'ptra', 'ptrb', 'dira', 'dirb', 'outa', 'outb', 'ina', 'inb',
        ];
        const reservedStatus: boolean = (builtinNamesOfNote.indexOf(name.toLowerCase()) != -1);
        return reservedStatus;
    }

    private _iDebugMethod(name: string): boolean {
        const debugMethodOfNote: string[] = [
            'zstr', 'lstr', 'udec', 'udec_byte', 'udec_word', 'udec_long', 'udec_reg_array', 'udec_byte_array',
            'udec_word_array', 'udec_long_array', 'sdec', 'sdec_byte', 'sdec_word', 'sdec_long', 'sdec_reg_array',
            'sdec_byte_array', 'sdec_word_array', 'sdec_long_array', 'uhex', 'uhex_byte', 'uhex_word',
            'uhex_long', 'uhex_reg_array', 'uhex_byte_array', 'uhex_word_array', 'uhex_long_array', 'shex',
            'shex_byte', 'shex_word', 'shex_long', 'shex_reg_array', 'shex_byte_array', 'shex_word_array',
            'shex_long_array', 'ubin', 'ubin_byte', 'ubin_word', 'ubin_long', 'ubin_reg_array',
            'ubin_byte_array', 'ubin_word_array', 'ubin_long_array', 'sbin', 'sbin_byte', 'sbin_word',
            'sbin_long', 'sbin_reg_array', 'sbin_byte_array', 'sbin_word_array', 'sbin_long_array'
        ];
        const searchName: string = (name.endsWith('_')) ? name.substr(0, name.length - 1) : name;
        const reservedStatus: boolean = (debugMethodOfNote.indexOf(searchName.toLowerCase()) != -1);
        return reservedStatus;
    }


    private _isSpinReservedWord(name: string): boolean {
        const spinInstructionsOfNote: string[] = [
            'reg', 'float', 'round', 'trunc',
            'clkmode', 'clkfreq', 'varbase', 'clkmode_', 'clkfreq_',
            'if', 'ifnot', 'elseif', 'elseifnot', 'else',
            'while', 'repeat', 'until', 'from', 'to', 'step', 'next', 'quit',
            'case', 'case_fast', 'other', 'abort', 'return',
            'true', 'false', 'posx', 'negx',
            //
            'newcog', 'cogexec', 'hubexec', 'cogexec_new', 'hubexec_new', 'cogexec_new_pair', 'hubexec_new_pair',
            //
            'abs', 'encod', 'decod', 'bmask', 'ones', 'sqrt', 'qlog', 'qexp', 'sar', 'ror', 'rol', 'rev', 'zerox',
            'signx', 'sca', 'scas', 'frac', 'not', 'fieldoperations', 'addbits', 'addpins', 'and', 'or', 'xor',
            //
            'akpin', 'bytefill', 'bytemove', 'call', 'clkset', 'cogatn', 'cogchk', 'cogid', 'coginit', 'cogspin',
            'cogstop', 'getct', 'getregs', 'getrnd', 'getsec', 'hubset', 'lockchk', 'locknew', 'lockrel',
            'lockret', 'locktry', 'longfill', 'longmove', 'lookdown', 'lookdownz', 'lookup', 'lookupz',
            'muldiv64', 'pinclear', 'pinf', 'pinfloat', 'pinh', 'pinhigh', 'pinl', 'pinlow', 'pinr', 'pinread',
            'pinstart', 'pint', 'pintoggle', 'pinw', 'pinwrite', 'pollatn',
            'pollct', 'polxy', 'rdpin', 'regexec', 'regload', 'rotxy', 'rqpin', 'send', 'recv', 'setregs', 'strcomp',
            'string', 'strsize', 'waitatn', 'waitct', 'waitms', 'waitus', 'wordfill', 'wordmove', 'wrpin',
            'wxpin', 'wypin', 'xypol'
        ];
        const reservedStatus: boolean = (spinInstructionsOfNote.indexOf(name.toLowerCase()) != -1);
        return reservedStatus;
    }

    private _isPasmReservedWord(name: string): boolean {
        const pasmReservedswordsOfNote: string[] = [
            //  EVENT_(INT|CT1|CT2|CT3|SE1|SE2|SE3|SE4|PAT|FBW|XMT|XFI|XRO|XRL|ATN|QMT)
            'ijmp1', 'ijmp2', 'ijmp3', 'iret1', 'iret2', 'iret3',
            'ptra', 'ptrb', 'addpins', 'clkfreq_', 'pa', 'pb', 'clkfreq', '_clkfreq', 'round', 'float', 'trunc',
            'dira', 'dirb', 'ina', 'inb', 'outa', 'outb', 'fvar', 'fvars', 'addbits', 'true', 'false'
            //'eventse1', 'eventse2', 'eventse3', 'eventse4',
            //'eventct1', 'eventct2', 'eventct3', 'eventct4',
            //'eventpat', 'eventfbw', 'eventxmt', 'eventxfi',
            //'eventxro', 'eventxrl', 'eventatn', 'eventqmt'
        ];
        const reservedStatus: boolean = (pasmReservedswordsOfNote.indexOf(name.toLowerCase()) != -1);
        return reservedStatus;
    }

    private _isPasmInstruction(name: string): boolean {
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
        const instructionStatus: boolean = (pasmInstructions.indexOf(name.toLowerCase()) != -1);
        return instructionStatus;
    }

    private _isPasmNonArgumentInstruction(name: string): boolean {
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
        const instructionStatus: boolean = (pasmNonArgumentInstructions.indexOf(name.toLowerCase()) != -1);
        return instructionStatus;
    }

    private _isPasmConditional(name: string): boolean {
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

    private _isDatNFileStorageType(name: string): boolean {
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

    private _isDatStorageType(name: string): boolean {
        let returnStatus: boolean = false;
        if (name.length > 2) {
            const checkType: string = name.toUpperCase();
            if (checkType == "BYTE" || checkType == "WORD" || checkType == "LONG" || checkType == "RES") {
                returnStatus = true;
            }
        }
        return returnStatus;
    }

    private _isStorageType(name: string): boolean {
        let returnStatus: boolean = false;
        if (name.length > 3) {
            const checkType: string = name.toUpperCase();
            if (checkType == "BYTE" || checkType == "WORD" || checkType == "LONG") {
                returnStatus = true;
            }
        }
        return returnStatus;
    }

    private _isAlignType(name: string): boolean {
        let returnStatus: boolean = false;
        if (name.length > 5) {
            const checkType: string = name.toUpperCase();
            if (checkType == "ALIGNL" || checkType == "ALIGNW") {
                returnStatus = true;
            }
        }
        return returnStatus;
    }

    private _skipWhite(line: string, currentOffset: number): number {
        let firstNonWhiteIndex: number = currentOffset;
        for (let index = currentOffset; index < line.length; index++) {
            if (line.substr(index, 1) != ' ' && line.substr(index, 1) != '\t') {
                firstNonWhiteIndex = index;
                break;
            }
        }
        return firstNonWhiteIndex
    }

    private _checkTokenSet(tokenSet: IParsedToken[]): void {
        this._logMessage('\n---- Checking ' + tokenSet.length + ' tokens. ----');
        tokenSet.forEach(parsedToken => {
            if (parsedToken.length == undefined || parsedToken.startCharacter == undefined) {
                this._logMessage('- BAD Token=[' + parsedToken + ']');
            }
        });
        this._logMessage('---- Check DONE ----\n');
    }
}
