"use strict";

import { deepStrictEqual } from "assert";
// src/spin2.semanticAndOutline.ts

import * as vscode from "vscode";

// ----------------------------------------------------------------------------
//  this file contains both an outline provider
//    and our semantic highlighting provider
//

// ----------------------------------------------------------------------------
//   OUTLINE Provider
//
export class Spin2ConfigDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  public provideDocumentSymbols(document: vscode.TextDocument, _token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[]> {
    return new Promise((resolve, _reject) => {
      let symbols: vscode.DocumentSymbol[] = [];

      for (let i = 0; i < document.lineCount; i++) {
        let line = document.lineAt(i);
        let linePrefix: string = line.text;
        let lineHasComment: boolean = false;
        let commentOffset: number = 0;
        let commentLength: number = 0;
        if (line.text.length > 2) {
          const lineParts: string[] = linePrefix.split(/[ \t]/);
          linePrefix = lineParts.length > 0 ? lineParts[0].toUpperCase() : "";
          // the only form of comment we care about here is block comment after section name (e.g., "CON { text }")
          //  NEW and let's add the use of ' comment too
          const openBraceOffset: number = line.text.indexOf("{");
          const singleQuoteOffset: number = line.text.indexOf("'");
          if (openBraceOffset != -1) {
            commentOffset = openBraceOffset;
            const closeBraceOffset: number = line.text.indexOf("}", openBraceOffset + 1);
            if (closeBraceOffset != -1) {
              lineHasComment = true;
              commentLength = closeBraceOffset - openBraceOffset + 1;
            }
          } else if (singleQuoteOffset != -1) {
            commentOffset = singleQuoteOffset;
            lineHasComment = true;
            commentLength = line.text.length - singleQuoteOffset + 1;
          }
        }

        if (linePrefix == "CON" || linePrefix == "DAT" || linePrefix == "VAR" || linePrefix == "OBJ") {
          let sectionComment = lineHasComment ? line.text.substr(commentOffset, commentLength) : "";
          const marker_symbol = new vscode.DocumentSymbol(linePrefix + " " + sectionComment, "", vscode.SymbolKind.Field, line.range, line.range);

          symbols.push(marker_symbol);
        } else if (linePrefix == "PUB" || linePrefix == "PRI") {
          let methodScope: string = "Public";
          if (line.text.startsWith("PRI")) {
            methodScope = "Private";
          }
          let methodName: string = line.text.substr(3).trim();
          if (methodName.includes("'")) {
            const lineParts: string[] = methodName.split("'");
            methodName = lineParts[0].trim();
          }
          if (methodName.includes("{")) {
            const lineParts: string[] = methodName.split("{");
            methodName = lineParts[0].trim();
          }
          if (methodName.includes("|")) {
            const lineParts: string[] = methodName.split("|");
            methodName = lineParts[0].trim();
          }

          const cmd_symbol = new vscode.DocumentSymbol(linePrefix + " " + methodName, "", vscode.SymbolKind.Function, line.range, line.range);

          symbols.push(cmd_symbol);
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

export const Spin2Legend = (function () {
  const tokenTypesLegend = [
    "comment",
    "string",
    "keyword",
    "number",
    "regexp",
    "operator",
    "namespace",
    "type",
    "struct",
    "class",
    "interface",
    "enum",
    "typeParameter",
    "function",
    "method",
    "macro",
    "variable",
    "parameter",
    "property",
    "label",
    "enumMember",
    "event",
    "returnValue",
    "storageType",
    "colorName",
    "displayType",
    "displayName",
    "setupParameter",
    "feedParameter",
  ];
  tokenTypesLegend.forEach((tokenType, index) => tokenTypes.set(tokenType, index));

  const tokenModifiersLegend = [
    "declaration",
    "documentation",
    "readonly",
    "static",
    "abstract",
    "deprecated",
    "modification",
    "async",
    "definition",
    "defaultLibrary",
    "local",
    "instance",
    "missingDeclaration",
    "illegalUse",
  ];
  tokenModifiersLegend.forEach((tokenModifier, index) => tokenModifiers.set(tokenModifier, index));

  return new vscode.SemanticTokensLegend(tokenTypesLegend, tokenModifiersLegend);
})();

interface IParsedToken {
  line: number;
  startCharacter: number;
  length: number;
  ptTokenType: string;
  ptTokenModifiers: string[];
}

class RememberedToken {
  _type: string;
  _modifiers: string[] = [];
  constructor(type: string, modifiers: string[] | undefined) {
    this._type = type;
    if (modifiers != undefined) {
      this._modifiers = modifiers;
    }
  }
  get type() {
    return this._type;
  }
  get modifiers() {
    return this._modifiers;
  }
}

interface IFilteredStrings {
  lineNoQuotes: string;
  lineParts: string[];
}

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
  inNothing,
}

enum eDebugDisplayType {
  Unknown = 0,
  ddtLogic,
  ddtScope,
  ddtScopeXY,
  ddtFFT,
  ddtSpectro,
  ddtPlot,
  ddtTerm,
  ddtBitmap,
  ddtMidi,
}

enum eSpin2Directive {
  Unknown = 0,
  s2dDebugDisplayForLine,
}
interface ISpin2Directive {
  lineNumber: number;
  displayType: string;
  eDisplayType: eDebugDisplayType;
}

// map of display-type to etype'
const debugTypeForDisplay = new Map<string, eDebugDisplayType>([
  ["logic", eDebugDisplayType.ddtLogic],
  ["scope", eDebugDisplayType.ddtScope],
  ["scope_xy", eDebugDisplayType.ddtScopeXY],
  ["fft", eDebugDisplayType.ddtFFT],
  ["spectro", eDebugDisplayType.ddtSpectro],
  ["plot", eDebugDisplayType.ddtPlot],
  ["term", eDebugDisplayType.ddtTerm],
  ["bitmap", eDebugDisplayType.ddtBitmap],
  ["midi", eDebugDisplayType.ddtMidi],
]);

export class Spin2DocumentSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
  async provideDocumentSemanticTokens(document: vscode.TextDocument, cancelToken: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
    // SEE https://www.codota.com/code/javascript/functions/vscode/CancellationToken/isCancellationRequested
    if (cancelToken) {
    } // silence our compiler for now... TODO: we should adjust loop so it can break on cancelToken.isCancellationRequested
    const allTokens = this._parseText(document.getText());
    const builder = new vscode.SemanticTokensBuilder();
    this._resetForNewDocument();
    allTokens.forEach((token) => {
      builder.push(token.line, token.startCharacter, token.length, this._encodeTokenType(token.ptTokenType), this._encodeTokenModifiers(token.ptTokenModifiers));
    });
    return builder.build();
  }

  private globalTokens = new Map<string, RememberedToken>();
  private localTokens = new Map<string, RememberedToken>();
  private localPasmTokensByMethodName = new Map<string, Map<string, RememberedToken>>();
  private conEnumInProgress: boolean = false;

  // map of display-name to etype'
  private debugDisplays = new Map<string, eDebugDisplayType>();
  // list of directives found in file
  private fileDirectives: ISpin2Directive[] = [];

  private currentMethodName: string = "";

  private bRecordTrailingComments: boolean = false; // initially, we don't generate tokens for trailing comments on lines

  private _encodeTokenType(tokenType: string): number {
    if (tokenTypes.has(tokenType)) {
      return tokenTypes.get(tokenType)!;
    } else if (tokenType === "notInLegend") {
      return tokenTypes.size + 2;
    }
    return 0;
  }

  private _resetForNewDocument(): void {
    this.globalTokens.clear();
    this.localTokens.clear();
    this.localPasmTokensByMethodName.clear();
    this.conEnumInProgress = false;
    this.currentMethodName = "";
    this.debugDisplays.clear();
    this.fileDirectives = [];
  }

  private _encodeTokenModifiers(strTokenModifiers: string[]): number {
    let result = 0;
    for (let i = 0; i < strTokenModifiers.length; i++) {
      const tokenModifier = strTokenModifiers[i];
      if (tokenModifiers.has(tokenModifier)) {
        result = result | (1 << tokenModifiers.get(tokenModifier)!);
      } else if (tokenModifier === "notInLegend") {
        result = result | (1 << (tokenModifiers.size + 2));
      }
    }
    return result;
  }

  private _parseText(text: string): IParsedToken[] {
    // parse our entire file
    const lines = text.split(/\r\n|\r|\n/);
    let currState: eParseState = eParseState.inCon; // compiler defaults to CON at start
    let priorState: eParseState = currState;
    let prePasmState: eParseState = currState;

    const tokenSet: IParsedToken[] = [];

    if (this.spin2DebugLogEnabled) {
      if (this.spin2log === undefined) {
        //Create output channel
        this.spin2log = vscode.window.createOutputChannel("Spin2 DEBUG");
        this._logMessage("Spin2 log started.");
      } else {
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
        let closingOffset = line.indexOf("}");
        if (closingOffset != -1) {
          // have close, comment ended
          currState = priorState;
        }
        //  DO NOTHING Let Syntax highlighting do this
        continue;
      } else if (currState == eParseState.inMultiLineDocComment) {
        // in multi-line doc-comment, hunt for end '}}' to exit
        let closingOffset = line.indexOf("}}");
        if (closingOffset != -1) {
          // have close, comment ended
          currState = priorState;
        }
        //  DO NOTHING Let Syntax highlighting do this
        continue;
      } else if (sectionStatus.isSectionStart) {
        currState = sectionStatus.inProgressStatus;
        this._logState("- scan ln:" + (i + 1) + " currState=[" + currState + "]");
        // ID the remainder of the line
        if (currState == eParseState.inPub || currState == eParseState.inPri) {
          // process PUB/PRI method signature
          if (trimmedNonCommentLine.length > 3) {
            this._getPUB_PRI_Name(3, line);
          }
        } else if (currState == eParseState.inCon) {
          // process a constant line
          if (trimmedNonCommentLine.length > 3) {
            this._getCON_Declaration(3, i + 1, line);
          }
        } else if (currState == eParseState.inDat) {
          // process a class(static) variable line
          if (trimmedNonCommentLine.length > 6 && trimmedNonCommentLine.toUpperCase().includes("ORG")) {
            // ORG, ORGF, ORGH
            const nonStringLine: string = this._removeDoubleQuotedStrings(trimmedNonCommentLine);
            if (nonStringLine.toUpperCase().includes("ORG")) {
              this._logPASM("- (" + (i + 1) + "): pre-scan DAT line trimmedLine=[" + trimmedLine + "] now Dat PASM");
              prePasmState = currState;
              currState = eParseState.inDatPasm;
              this._getDAT_Declaration(0, line); // let's get possible label on this ORG statement
              continue;
            }
          }
          this._getDAT_Declaration(0, line);
        } else if (currState == eParseState.inObj) {
          // process an object line
          if (trimmedNonCommentLine.length > 3) {
            this._getOBJ_Declaration(3, line);
          }
        } else if (currState == eParseState.inVar) {
          // process a instance-variable line
          if (trimmedNonCommentLine.length > 3) {
            this._getVAR_Declaration(3, line);
          }
        }
        continue;
      } else if (trimmedLine.startsWith("''")) {
        // process single line doc comment
        //  DO NOTHING Let Syntax highlighting do this
      } else if (trimmedLine.startsWith("'")) {
        // process single line non-doc comment
        //  DO NOTHING Let Syntax highlighting do this
      } else if (trimmedLine.startsWith("{{")) {
        // process multi-line doc comment
        let openingOffset = line.indexOf("{{");
        const closingOffset = line.indexOf("}}", openingOffset + 2);
        if (closingOffset != -1) {
          // is single line comment, just ignore it Let Syntax highlighting do this
        } else {
          // is open of multiline comment
          priorState = currState;
          currState = eParseState.inMultiLineDocComment;
          //  DO NOTHING Let Syntax highlighting do this
        }
      } else if (trimmedLine.startsWith("{")) {
        // process possible multi-line non-doc comment
        // do we have a close on this same line?
        let openingOffset = line.indexOf("{");
        const closingOffset = line.indexOf("}", openingOffset + 1);
        if (closingOffset != -1) {
          // is single line comment, we can have Spin2 Directive in here
          this._getSpin2_Directive(i, 0, line);
        } else {
          // is open of multiline comment
          priorState = currState;
          currState = eParseState.inMultiLineComment;
          //  DO NOTHING Let Syntax highlighting do this
        }
      } else if (currState == eParseState.inCon) {
        // process a constant line
        if (trimmedLine.length > 0) {
          this._getCON_Declaration(0, i + 1, line);
        }
      } else if (currState == eParseState.inDat) {
        // process a data line
        if (trimmedLine.length > 0) {
          if (trimmedLine.length > 6) {
            if (trimmedLine.toUpperCase().includes("ORG")) {
              // ORG, ORGF, ORGH
              const nonStringLine: string = this._removeDoubleQuotedStrings(trimmedLine);
              if (nonStringLine.toUpperCase().includes("ORG")) {
                this._logPASM("- (" + (i + 1) + "): pre-scan DAT line trimmedLine=[" + trimmedLine + "] now Dat PASM");
                prePasmState = currState;
                currState = eParseState.inDatPasm;
                this._getDAT_Declaration(0, line); // let's get possible label on this ORG statement
                continue;
              }
            }
          }
          this._getDAT_Declaration(0, line);
        }
      } else if (currState == eParseState.inVar) {
        // process a variable declaration line
        if (trimmedLine.length > 0) {
          this._getVAR_Declaration(0, line);
        }
      } else if (currState == eParseState.inObj) {
        // process an object declaration line
        if (trimmedLine.length > 0) {
          this._getOBJ_Declaration(0, line);
        }
      } else if (currState == eParseState.inPasmInline) {
        // process pasm (assembly) lines
        if (trimmedLine.length > 0) {
          const lineParts: string[] = trimmedLine.split(/[ \t]/);
          if (lineParts.length > 0 && lineParts[0].toUpperCase() == "END") {
            this._logPASM("- (" + (i + 1) + "): pre-scan SPIN PASM line trimmedLine=[" + trimmedLine + "]");
            currState = prePasmState;
            this._logState("- scan ln:" + (i + 1) + " POP currState=[" + currState + "]");
            // and ignore rest of this line
          } else {
            this._getSPIN_PasmDeclaration(0, line);
            // scan SPIN-Inline-Pasm line for debug() display declaration
            this._getDebugDisplay_Declaration(0, line);
          }
        }
      } else if (currState == eParseState.inDatPasm) {
        // process pasm (assembly) lines
        if (trimmedLine.length > 0) {
          const lineParts: string[] = trimmedLine.split(/[ \t]/);
          if (lineParts.length > 0 && lineParts[0].toUpperCase() == "FIT") {
            this._logPASM("- (" + (i + 1) + "): pre-scan DAT PASM line trimmedLine=[" + trimmedLine + "]");
            currState = prePasmState;
            this._logState("- scan ln:" + (i + 1) + " POP currState=[" + currState + "]");
            // and ignore rest of this line
          } else {
            this._getDAT_PasmDeclaration(0, line);
            // scan DAT-Pasm line for debug() display declaration
            this._getDebugDisplay_Declaration(0, line);
          }
        }
      } else if (currState == eParseState.inPub || currState == eParseState.inPri) {
        // Detect start of INLINE PASM - org detect
        // NOTE: The directives ORGH, ALIGNW, ALIGNL, and FILE are not allowed within in-line PASM code.
        if (trimmedLine.length > 0) {
          const lineParts: string[] = trimmedLine.split(/[ \t]/);
          if (lineParts.length > 0 && lineParts[0].toUpperCase() == "ORG") {
            // Only ORG, not ORGF or ORGH
            this._logPASM("- (" + (i + 1) + "): pre-scan PUB/PRI line trimmedLine=[" + trimmedLine + "]");
            prePasmState = currState;
            currState = eParseState.inPasmInline;
            // and ignore rest of this line
          } else {
            // scan SPIN2 line for debug() display declaration
            this._getDebugDisplay_Declaration(0, line);
          }
        }
      }
    }
    // --------------------         End of PRE-PARSE             --------------------
    this._logMessage("--->             <---");
    this._logMessage("---> Actual SCAN");

    this.bRecordTrailingComments = true; // from here forward generate tokens for trailing comments on lines

    //
    // Final PASS to identify all name references
    //
    currState = eParseState.inCon; // reset for 2nd pass - compiler defaults to CON at start
    priorState = currState; // reset for 2nd pass
    prePasmState = currState; // same

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
        let closingOffset = line.indexOf("}");
        if (closingOffset != -1) {
          // have close, comment ended
          currState = priorState;
        }
        //  DO NOTHING Let Syntax highlighting do this
      } else if (currState == eParseState.inMultiLineDocComment) {
        // in multi-line doc-comment, hunt for end '}}' to exit
        let closingOffset = line.indexOf("}}");
        if (closingOffset != -1) {
          // have close, comment ended
          currState = priorState;
        }
        //  DO NOTHING Let Syntax highlighting do this
      } else if (sectionStatus.isSectionStart) {
        currState = sectionStatus.inProgressStatus;
        this._logState("  -- ln:" + (i + 1) + " currState=[" + currState + "]");
        // ID the section name
        // DON'T mark the section literal, Syntax highlighting does this well!

        // ID the remainder of the line
        if (currState == eParseState.inPub || currState == eParseState.inPri) {
          // process method signature
          if (line.length > 3) {
            const partialTokenSet: IParsedToken[] = this._reportPUB_PRI_Signature(i, 3, line);
            partialTokenSet.forEach((newToken) => {
              tokenSet.push(newToken);
            });
          }
        } else if (currState == eParseState.inCon) {
          this.conEnumInProgress = false; // so we can tell in CON processor when to allow isolated names
          // process a possible constant use on the CON line itself!
          if (line.length > 3) {
            const partialTokenSet: IParsedToken[] = this._reportCON_DeclarationLine(i, 3, line);
            partialTokenSet.forEach((newToken) => {
              this._logOBJ("=> CON: " + this._tokenString(newToken, line));
              tokenSet.push(newToken);
            });
          }
        } else if (currState == eParseState.inDat) {
          // process a possible constant use on the CON line itself!
          if (line.length > 3) {
            if (trimmedLine.length > 6) {
              const nonCommentLineRemainder: string = this._getNonCommentLineRemainder(0, trimmedLine);
              let orgStr: string = "ORGH";
              let orgOffset: number = nonCommentLineRemainder.toUpperCase().indexOf(orgStr); // ORGH
              if (orgOffset == -1) {
                orgStr = "ORGF";
                orgOffset = nonCommentLineRemainder.toUpperCase().indexOf(orgStr); // ORGF
                if (orgOffset == -1) {
                  orgStr = "ORG";
                  orgOffset = nonCommentLineRemainder.toUpperCase().indexOf(orgStr); // ORG
                }
              }
              if (orgOffset != -1) {
                // let's double check this is NOT in quoted string
                const nonStringLine: string = this._removeDoubleQuotedStrings(nonCommentLineRemainder);
                orgOffset = nonStringLine.toUpperCase().indexOf(orgStr); // ORG, ORGF, ORGH
              }
              if (orgOffset != -1) {
                this._logPASM("- (" + (i + 1) + "): scan DAT line nonCommentLineRemainder=[" + nonCommentLineRemainder + "]");

                // process remainder of ORG line
                const nonCommentOffset = line.indexOf(nonCommentLineRemainder, 0);
                // lineNumber, currentOffset, line, allowLocalVarStatus, this.showPasmCode
                const allowLocalVarStatus: boolean = false;
                const NOT_DAT_PASM: boolean = false;
                const partialTokenSet: IParsedToken[] = this._reportDAT_ValueDeclarationCode(i, nonCommentOffset + orgOffset + orgStr.length, line, allowLocalVarStatus, this.showDAT, NOT_DAT_PASM);
                partialTokenSet.forEach((newToken) => {
                  tokenSet.push(newToken);
                });

                prePasmState = currState;
                currState = eParseState.inDatPasm;
                // and ignore rest of this line
                continue;
              }
            }
            const partialTokenSet: IParsedToken[] = this._reportDAT_DeclarationLine(i, 3, line);
            partialTokenSet.forEach((newToken) => {
              tokenSet.push(newToken);
            });
          }
        } else if (currState == eParseState.inObj) {
          // process a possible constant use on the CON line itself!
          if (line.length > 3) {
            const partialTokenSet: IParsedToken[] = this._reportOBJ_DeclarationLine(i, 3, line);
            partialTokenSet.forEach((newToken) => {
              this._logOBJ("=> OBJ: " + this._tokenString(newToken, line));
              tokenSet.push(newToken);
            });
          }
        } else if (currState == eParseState.inVar) {
          // process a possible constant use on the CON line itself!
          if (line.length > 3) {
            const partialTokenSet: IParsedToken[] = this._reportVAR_DeclarationLine(i, 3, line);
            partialTokenSet.forEach((newToken) => {
              tokenSet.push(newToken);
            });
          }
        }
      } else if (trimmedLine.startsWith("''")) {
        // process single line doc comment
        //  DO NOTHING Let Syntax highlighting do this
      } else if (trimmedLine.startsWith("'")) {
        // process single line non-doc comment
        //  DO NOTHING Let Syntax highlighting do this
      } else if (trimmedLine.startsWith("{{")) {
        // process multi-line doc comment
        let openingOffset = line.indexOf("{{");
        const closingOffset = line.indexOf("}}", openingOffset + 2);
        if (closingOffset != -1) {
          // is single line comment, just ignore it Let Syntax highlighting do this
        } else {
          // is open of multiline comment
          priorState = currState;
          currState = eParseState.inMultiLineDocComment;
          //  DO NOTHING Let Syntax highlighting do this
        }
      } else if (trimmedLine.startsWith("{")) {
        // process possible multi-line non-doc comment
        // do we have a close on this same line?
        let openingOffset = line.indexOf("{");
        const closingOffset = line.indexOf("}", openingOffset + 1);
        if (closingOffset != -1) {
          // is single line comment, just ignore it Let Syntax highlighting do this
        } else {
          // is open of multiline comment
          priorState = currState;
          currState = eParseState.inMultiLineComment;
          //  DO NOTHING Let Syntax highlighting do this
        }
      } else if (currState == eParseState.inCon) {
        // process a line in a constant section
        if (trimmedLine.length > 0) {
          this._logCON("- process CON line(" + (i + 1) + "):  trimmedLine=[" + trimmedLine + "]");
          const partialTokenSet: IParsedToken[] = this._reportCON_DeclarationLine(i, 0, line);
          partialTokenSet.forEach((newToken) => {
            this._logOBJ("=> CON: " + this._tokenString(newToken, line));
            tokenSet.push(newToken);
          });
        }
      } else if (currState == eParseState.inDat) {
        // process a line in a data section
        if (trimmedLine.length > 0) {
          this._logDAT("- process DAT line(" + (i + 1) + "): trimmedLine=[" + trimmedLine + "]");
          const nonCommentLineRemainder: string = this._getNonCommentLineRemainder(0, trimmedLine);
          let orgStr: string = "ORGH";
          let orgOffset: number = nonCommentLineRemainder.toUpperCase().indexOf(orgStr); // ORGH
          if (orgOffset == -1) {
            orgStr = "ORGF";
            orgOffset = nonCommentLineRemainder.toUpperCase().indexOf(orgStr); // ORGF
            if (orgOffset == -1) {
              orgStr = "ORG";
              orgOffset = nonCommentLineRemainder.toUpperCase().indexOf(orgStr); // ORG
            }
          }
          if (orgOffset != -1) {
            // let's double check this is NOT in quoted string
            const nonStringLine: string = this._removeDoubleQuotedStrings(nonCommentLineRemainder);
            orgOffset = nonStringLine.toUpperCase().indexOf(orgStr); // ORG, ORGF, ORGH
          }
          if (orgOffset != -1) {
            // process ORG line allowing label to be present
            const partialTokenSet: IParsedToken[] = this._reportDAT_DeclarationLine(i, 0, line);
            partialTokenSet.forEach((newToken) => {
              tokenSet.push(newToken);
            });

            prePasmState = currState;
            currState = eParseState.inDatPasm;
            // and ignore rest of this line
          } else {
            const partialTokenSet: IParsedToken[] = this._reportDAT_DeclarationLine(i, 0, line);
            partialTokenSet.forEach((newToken) => {
              tokenSet.push(newToken);
            });
          }
        }
      } else if (currState == eParseState.inVar) {
        // process a line in a variable data section
        if (trimmedLine.length > 0) {
          this._logVAR("- process VAR line(" + (i + 1) + "):  trimmedLine=[" + trimmedLine + "]");
          const partialTokenSet: IParsedToken[] = this._reportVAR_DeclarationLine(i, 0, line);
          partialTokenSet.forEach((newToken) => {
            tokenSet.push(newToken);
          });
        }
      } else if (currState == eParseState.inObj) {
        // process a line in an object section
        if (trimmedLine.length > 0) {
          this._logOBJ("- process OBJ line(" + (i + 1) + "):  trimmedLine=[" + trimmedLine + "]");
          const partialTokenSet: IParsedToken[] = this._reportOBJ_DeclarationLine(i, 0, line);
          partialTokenSet.forEach((newToken) => {
            this._logOBJ("=> OBJ: " + this._tokenString(newToken, line));
            tokenSet.push(newToken);
          });
        }
      } else if (currState == eParseState.inDatPasm) {
        // process DAT section pasm (assembly) lines
        if (trimmedLine.length > 0) {
          this._logPASM("- process DAT PASM line(" + (i + 1) + "):  trimmedLine=[" + trimmedLine + "]");
          // in DAT sections we end with FIT or just next section
          const partialTokenSet: IParsedToken[] = this._reportDAT_PasmCode(i, 0, line);
          partialTokenSet.forEach((newToken) => {
            tokenSet.push(newToken);
          });
          const lineParts: string[] = trimmedLine.split(/[ \t]/);
          if (lineParts.length > 0 && lineParts[0].toUpperCase() == "FIT") {
            currState = prePasmState;
            this._logState("- scan ln:" + (i + 1) + " POP currState=[" + currState + "]");
            // and ignore rest of this line
          }
        }
      } else if (currState == eParseState.inPasmInline) {
        // process pasm (assembly) lines
        if (trimmedLine.length > 0) {
          this._logPASM("- process SPIN2 PASM line(" + (i + 1) + "):  trimmedLine=[" + trimmedLine + "]");
          const lineParts: string[] = trimmedLine.split(/[ \t]/);
          if (lineParts.length > 0 && lineParts[0].toUpperCase() == "END") {
            currState = prePasmState;
            this._logState("- scan ln:" + (i + 1) + " POP currState=[" + currState + "]");
            // and ignore rest of this line
          } else {
            const partialTokenSet: IParsedToken[] = this._reportSPIN_PasmCode(i, 0, line);
            partialTokenSet.forEach((newToken) => {
              this._logOBJ("=> inlinePASM: " + this._tokenString(newToken, line));
              tokenSet.push(newToken);
            });
          }
        }
      } else if (currState == eParseState.inPub || currState == eParseState.inPri) {
        // process a method def'n line
        if (trimmedLine.length > 0) {
          this._logSPIN("- process SPIN2 line(" + (i + 1) + "): trimmedLine=[" + trimmedLine + "]");
          const lineParts: string[] = trimmedLine.split(/[ \t]/);
          if (lineParts.length > 0 && lineParts[0].toUpperCase() == "ORG") {
            // Only ORG not ORGF, ORGH
            prePasmState = currState;
            currState = eParseState.inPasmInline;
            // and ignore rest of this line
          } else if (trimmedLine.toLowerCase().startsWith("debug(")) {
            const partialTokenSet: IParsedToken[] = this._reportDebugStatement(i, 0, line);
            partialTokenSet.forEach((newToken) => {
              this._logSPIN("=> SPIN: " + this._tokenString(newToken, line));
              tokenSet.push(newToken);
            });
          } else {
            const partialTokenSet: IParsedToken[] = this._reportSPIN_Code(i, 0, line);
            partialTokenSet.forEach((newToken) => {
              this._logSPIN("=> SPIN: " + this._tokenString(newToken, line));
              tokenSet.push(newToken);
            });
          }
        }
      }
    }
    this._checkTokenSet(tokenSet);
    return tokenSet;
  }

  private _getSpin2_Directive(lineNumber: number, startingOffset: number, line: string): void {
    // HAVE {-* VSCode-Spin2: nextline debug()-display: bitmap  *-}
    // (only this one so far)
    if (line.toLowerCase().indexOf("{-* vscode-spin2:") != -1) {
      this._logMessage("- _getSpin2_Directive: ofs:" + startingOffset + ", [" + line + "](" + lineNumber + ")");
      // have possible directive
      let currentOffset: number = this._skipWhite(line, startingOffset);
      // get line parts - we only care about first one
      let lineParts: string[] = line
        .substring(currentOffset)
        .toLowerCase()
        .split(/[ \t,]/)
        .filter((element) => element);
      this._logMessage("  -- lineParts(" + lineParts.length + ")=[" + lineParts + "]");
      if (lineParts.length > 4 && lineParts[3] == "debug()-display:") {
        for (let index = 4; index < lineParts.length - 1; index++) {
          const displayType: string = lineParts[index];
          this._recordDisplayTypeForLine(displayType, lineNumber + 1);
        }
      }
    }
  }

  private _getCON_Declaration(startingOffset: number, lineNbr: number, line: string): void {
    // HAVE    DIGIT_NO_VALUE = -2   ' digit value when NOT [0-9]
    //  -or-   _clkfreq = CLK_FREQ   ' set system clock
    //
    if (line.substr(startingOffset).length > 1) {
      //skip Past Whitespace
      let currentOffset: number = this._skipWhite(line, startingOffset);
      const nonCommentConstantLine = this._getNonCommentLineRemainder(currentOffset, line);
      this._logCON("  - ln:" + lineNbr + " GetCONDecl nonCommentConstantLine=[" + nonCommentConstantLine + "]");

      const haveEnumDeclaration: boolean = nonCommentConstantLine.indexOf("#") != -1;
      const containsMultiAssignments: boolean = nonCommentConstantLine.indexOf(",") != -1;
      let statements: string[] = [nonCommentConstantLine];
      if (!haveEnumDeclaration && containsMultiAssignments) {
        statements = nonCommentConstantLine.split(",");
      }
      this._logCON("  -- statements=[" + statements + "]");
      for (let index = 0; index < statements.length; index++) {
        const conDeclarationLine: string = statements[index].trim();
        this._logCON("  -- conDeclarationLine=[" + conDeclarationLine + "]");
        currentOffset = line.indexOf(conDeclarationLine, currentOffset);
        const assignmentOffset: number = conDeclarationLine.indexOf("=");
        if (assignmentOffset != -1) {
          // recognize constant name getting initialized via assignment
          // get line parts - we only care about first one
          const lineParts: string[] = line.substr(currentOffset).split(/[ \t=]/);
          const newName = lineParts[0];
          if (newName.substr(0, 1).match(/[a-zA-Z_]/)) {
            this._logCON("  -- GLBL GetCONDecl newName=[" + newName + "]");
            // remember this object name so we can annotate a call to it
            this._setGlobalToken(newName, new RememberedToken("variable", ["readonly"]));
          }
        } else {
          // recognize enum values getting initialized
          const lineParts: string[] = conDeclarationLine.split(/[ \t,]/);
          //this._logCON('  -- lineParts=[' + lineParts + ']');
          for (let index = 0; index < lineParts.length; index++) {
            let enumConstant: string = lineParts[index];
            // use _isDebugInvocation to filter out use of debug invocation command from constant def'
            if (this._isDebugInvocation(enumConstant)) {
              continue; // yep this is not a constant
            } else {
              // our enum name can have a step offset
              if (enumConstant.includes("[")) {
                // it does, isolate name from offset
                const enumNameParts: string[] = enumConstant.split("[");
                enumConstant = enumNameParts[0];
              }
              if (enumConstant.substr(0, 1).match(/[a-zA-Z_]/)) {
                this._logCON("  -- C GLBL enumConstant=[" + enumConstant + "]");
                this._setGlobalToken(enumConstant, new RememberedToken("enumMember", ["readonly"]));
              }
            }
          }
        }
      }
    }
  }

  private _getDAT_Declaration(startingOffset: number, line: string): void {
    // HAVE    bGammaEnable        BYTE   TRUE               ' comment
    //         didShow             byte   FALSE[256]
    //                             byte   FALSE[256]
    let currentOffset: number = this._skipWhite(line, startingOffset);
    // get line parts - we only care about first one
    const dataDeclNonCommentStr = this._getNonCommentLineRemainder(currentOffset, line);
    let lineParts: string[] = this._getNonWhiteLineParts(dataDeclNonCommentStr);
    this._logDAT("- GetDatDecl lineParts=[" + lineParts + "](" + lineParts.length + ")");
    let haveMoreThanDat: boolean = lineParts.length > 1 && lineParts[0].toUpperCase() == "DAT";
    if (haveMoreThanDat || lineParts[0].toUpperCase() != "DAT") {
      // remember this object name so we can annotate a call to it
      let nameIndex: number = 0;
      let typeIndex: number = 1;
      let maxParts: number = 2;
      if (lineParts[0].toUpperCase() == "DAT") {
        nameIndex = 1;
        typeIndex = 2;
        maxParts = 3;
      }
      let haveLabel: boolean = this._isDatOrPasmLabel(lineParts[nameIndex]);
      const isDataDeclarationLine: boolean = lineParts.length > maxParts - 1 && haveLabel && this._isDatStorageType(lineParts[typeIndex]) ? true : false;
      let lblFlag: string = haveLabel ? "T" : "F";
      let dataDeclFlag: string = isDataDeclarationLine ? "T" : "F";
      this._logDAT("- GetDatDecl lineParts=[" + lineParts + "](" + lineParts.length + ") label=" + lblFlag + ", daDecl=" + dataDeclFlag);
      if (haveLabel) {
        let newName = lineParts[nameIndex];
        const nameType: string = isDataDeclarationLine ? "variable" : "label";
        this._logDAT("  -- GLBL gddcl newName=[" + newName + "](" + nameType + ")");
        this._setGlobalToken(newName, new RememberedToken(nameType, []));
      }
    }
  }

  private _getDAT_PasmDeclaration(startingOffset: number, line: string): void {
    // HAVE    bGammaEnable        BYTE   TRUE               ' comment
    //         didShow             byte   FALSE[256]
    let currentOffset: number = this._skipWhite(line, startingOffset);
    // get line parts - we only care about first one
    const datPasmRHSStr = this._getNonCommentLineRemainder(currentOffset, line);
    const lineParts: string[] = this._getNonWhiteLineParts(datPasmRHSStr);
    //this._logPASM('- GetDATPasmDecl lineParts=[' + lineParts + ']');
    // handle name in 1 column
    let haveLabel: boolean = this._isDatOrPasmLabel(lineParts[0]);
    const isDataDeclarationLine: boolean = lineParts.length > 1 && haveLabel && this._isDatStorageType(lineParts[1]) ? true : false;
    if (haveLabel) {
      const labelName: string = lineParts[0];
      if (!this._isReservedPasmSymbols(labelName) && !labelName.toUpperCase().startsWith("IF_")) {
        // org in first column is not label name, nor is if_ conditional
        const labelType: string = isDataDeclarationLine ? "variable" : "label";
        this._logPASM("  -- DAT PASM GLBL labelName=[" + labelName + "(" + labelType + ")]");
        this._setGlobalToken(labelName, new RememberedToken(labelType, []));
      } else {
        this._logPASM("  -- DAT PASM SKIPPED bad labelName=[" + labelName + "]");
        // FIXME: report token for this and mark as RED
      }
    }
  }

  private _getOBJ_Declaration(startingOffset: number, line: string): void {
    // HAVE    color           : "isp_hub75_color"
    //  -or-   segments[7]     : "isp_hub75_segment"
    //
    //skip Past Whitespace
    let currentOffset: number = this._skipWhite(line, startingOffset);
    const remainingNonCommentLineStr: string = this._getNonCommentLineRemainder(currentOffset, line);
    //this._logOBJ('- RptObjDecl remainingNonCommentLineStr=[' + remainingNonCommentLineStr + ']');
    const remainingLength: number = remainingNonCommentLineStr.length;
    if (remainingLength > 0) {
      // get line parts - we only care about first one
      const lineParts: string[] = remainingNonCommentLineStr.split(/[ \t\[\:]/);
      const newName = lineParts[0];
      this._logOBJ("  -- GLBL GetOBJDecl newName=[" + newName + "]");
      // remember this object name so we can annotate a call to it
      this._setGlobalToken(newName, new RememberedToken("namespace", []));
    }
  }

  private _getPUB_PRI_Name(startingOffset: number, line: string): void {
    const methodType = line.substr(0, 3).toUpperCase();
    // reset our list of local variables
    const isPrivate: boolean = methodType.indexOf("PRI") != -1;
    //const matchIdx: number = methodType.indexOf("PRI");
    //this._logSPIN("  -- GLBL GetMethodDecl methodType=[" + methodType + "], matchIdx(" + matchIdx + "), isPrivate(" + isPrivate + ")");

    //skip Past Whitespace
    let currentOffset: number = this._skipWhite(line, startingOffset);
    const startNameOffset = currentOffset;
    // find open paren
    currentOffset = line.indexOf("(", currentOffset);
    let nameLength = currentOffset - startNameOffset;
    const methodName = line.substr(startNameOffset, nameLength).trim();
    const nameType: string = isPrivate ? "private" : "public";
    this._logSPIN("  -- GLBL GetMethodDecl newName=[" + methodName + "](" + nameType + ")");
    this.currentMethodName = methodName; // notify of latest method name so we can track inLine PASM symbols
    // remember this method name so we can annotate a call to it
    const refModifiers: string[] = isPrivate ? ["static"] : [];
    this._setGlobalToken(methodName, new RememberedToken("method", refModifiers));
  }

  private _getSPIN_PasmDeclaration(startingOffset: number, line: string): void {
    // HAVE    next8SLine ' or .nextLine in col 0
    //         nPhysLineIdx        long    0
    let currentOffset: number = this._skipWhite(line, startingOffset);
    // get line parts - we only care about first one
    const inLinePasmRHSStr = this._getNonCommentLineRemainder(currentOffset, line);
    const lineParts: string[] = this._getNonWhiteLineParts(inLinePasmRHSStr);
    //this._logPASM('- GetInLinePasmDecl lineParts=[' + lineParts + ']');
    // handle name in 1 column
    let haveLabel: boolean = this._isDatOrPasmLabel(lineParts[0]);
    const isDataDeclarationLine: boolean = lineParts.length > 1 && haveLabel && this._isDatStorageType(lineParts[1]) ? true : false;
    if (haveLabel) {
      const labelName: string = lineParts[0];
      const labelType: string = isDataDeclarationLine ? "variable" : "label";
      this._logPASM("  -- Inline PASM labelName=[" + labelName + "(" + labelType + ")]");
      this._setLocalPasmTokenForMethod(this.currentMethodName, labelName, new RememberedToken(labelType, []));
    }
  }

  private _getVAR_Declaration(startingOffset: number, line: string): void {
    // HAVE    long    demoPausePeriod   ' comment
    //
    //skip Past Whitespace
    let currentOffset: number = this._skipWhite(line, startingOffset);
    const remainingNonCommentLineStr: string = this._getNonCommentLineRemainder(currentOffset, line);
    this._logVAR("- GetVarDecl remainingNonCommentLineStr=[" + remainingNonCommentLineStr + "]");
    const isMultiDeclaration: boolean = remainingNonCommentLineStr.includes(",");
    let lineParts: string[] = this._getNonWhiteDataInitLineParts(remainingNonCommentLineStr);
    const hasGoodType: boolean = this._isStorageType(lineParts[0]);
    this._logVAR("  -- lineParts=[" + lineParts + "]");
    let nameSet: string[] = [];
    if (hasGoodType && lineParts.length > 1) {
      if (!isMultiDeclaration) {
        // get line parts - we only care about first one after type
        nameSet.push(lineParts[0]);
        nameSet.push(lineParts[1]);
      } else {
        // have multiple declarations separated by commas, we care about all after type
        nameSet = lineParts;
      }
      // remember this object name so we can annotate a call to it
      // NOTE this is an instance-variable!
      for (let index = 1; index < nameSet.length; index++) {
        // remove array suffix and comma delim. from name
        const newName = nameSet[index]; // .replace(/[\[,]/, '');
        if (newName.substr(0, 1).match(/[a-zA-Z_]/)) {
          this._logVAR("  -- GLBL GetVarDecl newName=[" + newName + "]");
          this._setGlobalToken(newName, new RememberedToken("variable", ["instance"]));
        }
      }
    } else if (!hasGoodType && lineParts.length > 0) {
      for (let index = 0; index < lineParts.length; index++) {
        const longVarName = lineParts[index];
        if (longVarName.substr(0, 1).match(/[a-zA-Z_]/)) {
          this._logVAR("  -- GLBL GetVarDecl newName=[" + longVarName + "]");
          this._setGlobalToken(longVarName, new RememberedToken("variable", ["instance"]));
        }
      }
    }
  }

  private _getDebugDisplay_Declaration(startingOffset: number, line: string): void {
    // locate and collect debug() display user names and types
    //
    // HAVE    debug(`{displayType} {displayName} ......)            ' comment
    let currentOffset: number = this._skipWhite(line, startingOffset);
    // get line parts - we only care about first one
    const datPasmStatementStr = this._getNonDocCommentLineRemainder(currentOffset, line);
    if (datPasmStatementStr.toLowerCase().startsWith("debug(`")) {
      const lineParts: string[] = this._getDebugNonWhiteLineParts(datPasmStatementStr);
      //this._logDEBUG('  -- debug(...) lineParts=[' + lineParts + ']');
      if (lineParts.length >= 3) {
        const displayType: string = lineParts[1];
        if (displayType.startsWith("`")) {
          const newDisplayType: string = displayType.substring(1, displayType.length);
          //this._logDEBUG('  --- debug(...) newDisplayType=[' + newDisplayType + ']');
          if (this._isDebugDisplayType(newDisplayType)) {
            const newDisplayName: string = lineParts[2];
            //this._logDEBUG('  --- debug(...) newDisplayType=[' + newDisplayType + '], newDisplayName=[' + newDisplayName + ']');
            this._setUserDebugDisplay(newDisplayType, newDisplayName);
          }
        }
      }
    }
  }

  private _reportCON_DeclarationLine(lineNumber: number, startingOffset: number, line: string): IParsedToken[] {
    const tokenSet: IParsedToken[] = [];
    // skip Past Whitespace
    let currentOffset: number = this._skipWhite(line, startingOffset);
    const nonCommentConstantLine = this._getNonCommentLineReturnComment(lineNumber, currentOffset, line, tokenSet);

    const haveEnumDeclaration: boolean = nonCommentConstantLine.indexOf("#") != -1;
    const containsMultiAssignments: boolean = nonCommentConstantLine.indexOf(",") != -1;
    this._logCON("- reportConstant haveEnum=(" + haveEnumDeclaration + "), containsMulti=(" + containsMultiAssignments + "), nonCommentConstantLine=[" + nonCommentConstantLine + "]");
    let statements: string[] = [nonCommentConstantLine];
    if (!haveEnumDeclaration && containsMultiAssignments) {
      statements = nonCommentConstantLine.split(",");
    }
    this._logCON("  -- statements=[" + statements + "]");
    if (nonCommentConstantLine.length > 0) {
      for (let index = 0; index < statements.length; index++) {
        const conDeclarationLine: string = statements[index].trim();
        this._logCON("  -- conDeclarationLine=[" + conDeclarationLine + "]");
        currentOffset = line.indexOf(conDeclarationLine, currentOffset);
        // locate key indicators of line style
        const isAssignment: boolean = conDeclarationLine.indexOf("=") != -1;
        if (isAssignment && !haveEnumDeclaration) {
          // -------------------------------------------
          // have line assigning value to new constant
          // -------------------------------------------
          const assignmentParts: string[] = conDeclarationLine.split("=");
          const lhsConstantName = assignmentParts[0].trim();
          const nameOffset = line.indexOf(lhsConstantName, currentOffset);
          this._logCON("  -- GLBL lhsConstantName=[" + lhsConstantName + "]");
          let referenceDetails: RememberedToken | undefined = undefined;
          if (this._isGlobalToken(lhsConstantName)) {
            referenceDetails = this._getGlobalToken(lhsConstantName);
            this._logCON("  --  FOUND rcdl lhs global " + this._rememberdTokenString(lhsConstantName, referenceDetails));
          }
          if (referenceDetails != undefined) {
            // this is a constant declaration!
            const updatedModificationSet: string[] = this._modifiersWith(referenceDetails.modifiers, "declaration");
            tokenSet.push({
              line: lineNumber,
              startCharacter: nameOffset,
              length: lhsConstantName.length,
              ptTokenType: referenceDetails.type,
              ptTokenModifiers: updatedModificationSet,
            });
          } else {
            this._logCON("  --  CON ERROR[CODE] missed recording declaration! name=[" + lhsConstantName + "]");
            tokenSet.push({
              line: lineNumber,
              startCharacter: nameOffset,
              length: lhsConstantName.length,
              ptTokenType: "variable",
              ptTokenModifiers: ["readonly", "missingDeclaration"],
            });
          }
          // remove front LHS of assignment and process remainder
          const fistEqualOffset: number = conDeclarationLine.indexOf("=");
          const assignmentRHSStr = conDeclarationLine.substring(fistEqualOffset + 1).trim();
          currentOffset = line.indexOf(assignmentRHSStr); // skip to RHS of assignment
          this._logCON("  -- CON assignmentRHSStr=[" + assignmentRHSStr + "]");
          const possNames: string[] = this._getNonWhiteCONLineParts(assignmentRHSStr);
          this._logCON("  -- possNames=[" + possNames + "]");
          for (let index = 0; index < possNames.length; index++) {
            const possibleName = possNames[index];
            const currPossibleLen = possibleName.length;
            currentOffset = line.indexOf(possibleName, currentOffset); // skip to RHS of assignment
            if (possibleName.substr(0, 1).match(/[a-zA-Z_]/)) {
              // does name contain a namespace reference?
              let possibleNameSet: string[] = [];
              if (possibleName.includes(".")) {
                possibleNameSet = possibleName.split(".");
              } else {
                possibleNameSet = [possibleName];
              }
              this._logCON("  --  possibleNameSet=[" + possibleNameSet + "]");
              const namePart = possibleNameSet[0];
              let matchLen: number = namePart.length;
              const searchString: string = possibleNameSet.length == 1 ? possibleNameSet[0] : possibleNameSet[0] + "." + possibleNameSet[1];
              let referenceDetails: RememberedToken | undefined = undefined;
              const nameOffset = line.indexOf(searchString, currentOffset);
              this._logCON("  -- namePart=[" + namePart + "](" + nameOffset + ")");
              if (this._isGlobalToken(namePart)) {
                referenceDetails = this._getGlobalToken(namePart);
                this._logCON("  --  FOUND rcds rhs global " + this._rememberdTokenString(namePart, referenceDetails));
              }
              if (referenceDetails != undefined) {
                // this is a constant reference!
                //const updatedModificationSet: string[] = this._modifiersWithout(referenceDetails.modifiers, "declaration");
                tokenSet.push({
                  line: lineNumber,
                  startCharacter: nameOffset,
                  length: matchLen,
                  ptTokenType: referenceDetails.type,
                  ptTokenModifiers: referenceDetails.modifiers,
                });
              } else {
                if (
                  !this._isSpinReservedWord(namePart) &&
                  !this._isBuiltinReservedWord(namePart) &&
                  !this._isDebugMethod(namePart) &&
                  !this._isDebugSymbol(namePart) &&
                  !this._isUnaryOperator(namePart)
                ) {
                  this._logCON("  --  CON MISSING name=[" + namePart + "]");
                  tokenSet.push({
                    line: lineNumber,
                    startCharacter: nameOffset,
                    length: matchLen,
                    ptTokenType: "variable",
                    ptTokenModifiers: ["readonly", "missingDeclaration"],
                  });
                }
              }
              if (possibleNameSet.length > 1) {
                // we have .constant namespace suffix
                // this can NOT be a method name it can only be a constant name
                const referenceOffset = line.indexOf(searchString, currentOffset);
                const constantPart: string = possibleNameSet[1];
                matchLen = constantPart.length;
                const nameOffset = line.indexOf(constantPart, referenceOffset);
                this._logCON("  -- constantPart=[" + namePart + "](" + nameOffset + ")");
                tokenSet.push({
                  line: lineNumber,
                  startCharacter: nameOffset,
                  length: constantPart.length,
                  ptTokenType: "variable",
                  ptTokenModifiers: ["readonly"],
                });
              }
              currentOffset += matchLen; // skip past this name
            }
          }
        } else {
          // -------------------------------------------------
          // have line creating one or more of enum constants
          // -------------------------------------------------
          // recognize enum values getting initialized
          const lineParts: string[] = conDeclarationLine.split(",");
          //this._logCON('  -- lineParts=[' + lineParts + ']');
          for (let index = 0; index < lineParts.length; index++) {
            let enumConstant = lineParts[index].trim();
            // our enum name can have a step offset: name[step]
            if (enumConstant.includes("[")) {
              // it does, isolate name from offset
              const enumNameParts: string[] = enumConstant.split("[");
              enumConstant = enumNameParts[0];
            }
            if (enumConstant.includes("=")) {
              const enumAssignmentParts: string[] = enumConstant.split("=");
              enumConstant = enumAssignmentParts[0].trim();
              const enumExistingName: string = enumAssignmentParts[1].trim();
              if (enumExistingName.substr(0, 1).match(/[a-zA-Z_]/)) {
                this._logCON("  -- A GLBL enumConstant=[" + enumConstant + "]");
                // our enum name can have a step offset
                const nameOffset = line.indexOf(enumExistingName, currentOffset);
                tokenSet.push({
                  line: lineNumber,
                  startCharacter: nameOffset,
                  length: enumExistingName.length,
                  ptTokenType: "enumMember",
                  ptTokenModifiers: ["readonly"],
                });
              }
            }
            if (enumConstant.substr(0, 1).match(/[a-zA-Z_]/) && !this._isDebugInvocation(enumConstant)) {
              this._logCON("  -- B GLBL enumConstant=[" + enumConstant + "]");
              // our enum name can have a step offset
              const nameOffset = line.indexOf(enumConstant, currentOffset);
              tokenSet.push({
                line: lineNumber,
                startCharacter: nameOffset,
                length: enumConstant.length,
                ptTokenType: "enumMember",
                ptTokenModifiers: ["declaration", "readonly"],
              });
            }
            currentOffset += enumConstant.length + 1;
          }
        }
      }
    }
    return tokenSet;
  }

  private _reportDAT_DeclarationLine(lineNumber: number, startingOffset: number, line: string): IParsedToken[] {
    const tokenSet: IParsedToken[] = [];
    //skip Past Whitespace
    let currentOffset: number = this._skipWhite(line, startingOffset);
    // get line parts - we only care about first one
    const dataDeclNonCommentStr = this._getNonCommentLineReturnComment(lineNumber, currentOffset, line, tokenSet);
    let lineParts: string[] = this._getNonWhiteLineParts(dataDeclNonCommentStr);
    this._logVAR("- rptDataDeclLn lineParts=[" + lineParts + "]");
    // remember this object name so we can annotate a call to it
    if (lineParts.length > 1) {
      if (this._isStorageType(lineParts[0]) || lineParts[0].toUpperCase() == "FILE" || lineParts[0].toUpperCase() == "ORG") {
        // if we start with storage type (or FILE, or ORG), not name, process rest of line for symbols
        currentOffset = line.indexOf(lineParts[0], currentOffset);
        const allowLocalVarStatus: boolean = false;
        const NOT_DAT_PASM: boolean = false;
        const partialTokenSet: IParsedToken[] = this._reportDAT_ValueDeclarationCode(lineNumber, currentOffset, line, allowLocalVarStatus, this.showDAT, NOT_DAT_PASM);
        partialTokenSet.forEach((newToken) => {
          tokenSet.push(newToken);
        });
      } else {
        // this is line with name storageType and initial value
        this._logDAT("  -- rptDatDecl lineParts=[" + lineParts + "]");
        let newName = lineParts[0];
        const nameOffset: number = line.indexOf(newName, currentOffset);
        let referenceDetails: RememberedToken | undefined = undefined;
        if (this._isGlobalToken(newName)) {
          referenceDetails = this._getGlobalToken(newName);
          this._logMessage("  --  FOUND rddl global name=[" + newName + "]");
        }
        if (referenceDetails != undefined) {
          tokenSet.push({
            line: lineNumber,
            startCharacter: nameOffset,
            length: newName.length,
            ptTokenType: referenceDetails.type,
            ptTokenModifiers: referenceDetails.modifiers,
          });
        } else if (!this._isReservedPasmSymbols(newName)) {
          this._logDAT("  --  DAT rDdl MISSING name=[" + newName + "]");
          tokenSet.push({
            line: lineNumber,
            startCharacter: nameOffset,
            length: newName.length,
            ptTokenType: "variable",
            ptTokenModifiers: ["missingDeclaration"],
          });
        }

        // process remainder of line
        currentOffset = line.indexOf(lineParts[1], nameOffset + newName.length);
        const allowLocalVarStatus: boolean = false;
        const NOT_DAT_PASM: boolean = false;
        const partialTokenSet: IParsedToken[] = this._reportDAT_ValueDeclarationCode(lineNumber, currentOffset, line, allowLocalVarStatus, this.showDAT, NOT_DAT_PASM);
        partialTokenSet.forEach((newToken) => {
          tokenSet.push(newToken);
        });
      }
    } else if (lineParts.length == 1) {
      // handle name declaration only line: [name 'comment]
      let newName = lineParts[0];
      if (!this._isAlignType(newName)) {
        let referenceDetails: RememberedToken | undefined = undefined;
        if (this._isGlobalToken(newName)) {
          referenceDetails = this._getGlobalToken(newName);
          this._logMessage("  --  FOUND global name=[" + newName + "]");
        }
        if (referenceDetails != undefined) {
          tokenSet.push({
            line: lineNumber,
            startCharacter: currentOffset,
            length: newName.length,
            ptTokenType: referenceDetails.type,
            ptTokenModifiers: referenceDetails.modifiers,
          });
        }
      }
    } else {
      this._logDAT("  -- DAT SKIPPED: lineParts=[" + lineParts + "]");
    }
    return tokenSet;
  }

  private _reportDAT_ValueDeclarationCode(lineNumber: number, startingOffset: number, line: string, allowLocal: boolean, showDebug: boolean, isDatPasm: boolean): IParsedToken[] {
    const tokenSet: IParsedToken[] = [];
    //this._logMessage(' DBG _reportDAT_ValueDeclarationCode(#' + lineNumber + ', ofs=' + startingOffset + ')');
    this._logDAT("- process ValueDeclaration line(" + (lineNumber + 1) + "): line=[" + line + "]");

    // process data declaration
    let currentOffset: number = this._skipWhite(line, startingOffset);
    const dataValueInitStr = this._getNonCommentLineReturnComment(lineNumber, currentOffset, line, tokenSet);
    if (dataValueInitStr.length > 1) {
      if (showDebug) {
        this._logMessage("  -- reportDataValueInit dataValueInitStr=[" + dataValueInitStr + "]");
      }
      let lineParts: string[] = this._getNonWhiteDataInitLineParts(dataValueInitStr);
      const argumentStartIndex: number = this._isDatStorageType(lineParts[0]) ? 1 : 0;
      if (showDebug) {
        this._logMessage("  -- lineParts=[" + lineParts + "]");
      }
      // process remainder of line
      if (lineParts.length < 2) {
        return tokenSet;
      }
      if (lineParts.length > 1) {
        for (let index = argumentStartIndex; index < lineParts.length; index++) {
          const possibleName = lineParts[index].replace(/[\(\)\@]/, "");
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
              this._logMessage("  -- possibleName=[" + possibleName + "]");
            }
            // does name contain a namespace reference?
            if (possibleName.includes(".") && !possibleName.startsWith(".")) {
              possibleNameSet = possibleName.split(".");
            } else {
              possibleNameSet = [possibleName];
            }
            if (showDebug) {
              this._logMessage("  --  possibleNameSet=[" + possibleNameSet + "]");
            }
            const namePart = possibleNameSet[0];
            const searchString: string = possibleNameSet.length == 1 ? possibleNameSet[0] : possibleNameSet[0] + "." + possibleNameSet[1];
            currentOffset = line.indexOf(searchString, currentOffset);
            let referenceDetails: RememberedToken | undefined = undefined;
            if (allowLocal && this._isLocalToken(namePart)) {
              referenceDetails = this._getLocalToken(namePart);
              if (showDebug) {
                this._logMessage("  --  FOUND local name=[" + namePart + "]");
              }
            } else if (this._isGlobalToken(namePart)) {
              referenceDetails = this._getGlobalToken(namePart);
              if (showDebug) {
                this._logMessage("  --  FOUND global name=[" + namePart + "]");
              }
            }
            if (referenceDetails != undefined) {
              tokenSet.push({
                line: lineNumber,
                startCharacter: currentOffset,
                length: namePart.length,
                ptTokenType: referenceDetails.type,
                ptTokenModifiers: referenceDetails.modifiers,
              });
            } else {
              if (
                !this._isPasmReservedWord(namePart) &&
                !this._isReservedPasmSymbols(namePart) &&
                !this._isPasmInstruction(namePart) &&
                !this._isDatNFileStorageType(namePart) &&
                !this._isBinaryOperator(namePart) &&
                !this._isUnaryOperator(namePart) &&
                !this._isBuiltinReservedWord(namePart)
              ) {
                if (showDebug) {
                  this._logMessage("  --  DAT rDvdc MISSING name=[" + namePart + "]");
                }
                tokenSet.push({
                  line: lineNumber,
                  startCharacter: currentOffset,
                  length: namePart.length,
                  ptTokenType: "variable",
                  ptTokenModifiers: ["missingDeclaration"],
                });
              }
            }
            if (possibleNameSet.length > 1) {
              // we have .constant namespace suffix
              // this can NOT be a method name it can only be a constant name
              const referenceOffset = line.indexOf(searchString, currentOffset);
              const constantPart: string = possibleNameSet[1];
              if (showDebug) {
                this._logMessage("  --  FOUND external constantPart=[" + constantPart + "]");
              }
              const nameOffset = line.indexOf(constantPart, referenceOffset);
              tokenSet.push({
                line: lineNumber,
                startCharacter: nameOffset,
                length: constantPart.length,
                ptTokenType: "variable",
                ptTokenModifiers: ["readonly"],
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
    let currentOffset: number = this._skipWhite(line, startingOffset);
    // get line parts - we only care about first one
    const inLinePasmRHSStr = this._getNonCommentLineReturnComment(lineNumber, currentOffset, line, tokenSet);
    const lineParts: string[] = this._getNonWhitePasmLineParts(inLinePasmRHSStr);
    currentOffset = line.indexOf(inLinePasmRHSStr, currentOffset);
    this._logPASM("  -- reportDATPasmDecl lineParts=[" + lineParts + "]");
    // handle name in 1 column
    const firstName: string = lineParts.length > 0 ? lineParts[0] : "";
    const secondName: string = lineParts.length > 1 ? lineParts[1] : "";
    const bIsAlsoDebugLine: boolean = inLinePasmRHSStr.toLowerCase().indexOf("debug(") != -1 ? true : false;
    if (bIsAlsoDebugLine) {
      const partialTokenSet: IParsedToken[] = this._reportDebugStatement(lineNumber, startingOffset, line);
      partialTokenSet.forEach((newToken) => {
        this._logSPIN("=> DATpasm: " + this._tokenString(newToken, line));
        tokenSet.push(newToken);
      });
    }
    let haveLabel: boolean = this._isDatOrPasmLabel(lineParts[0]);
    const isDataDeclarationLine: boolean = lineParts.length > 1 && haveLabel && this._isDatStorageType(lineParts[1]) ? true : false;
    // TODO: REWRITE this to handle "non-label" line with unknown op-code!
    if (haveLabel) {
      // process label/variable name - starting in column 0
      const labelName: string = lineParts[0];
      this._logPASM("  -- labelName=[" + labelName + "]");
      let referenceDetails: RememberedToken | undefined = undefined;
      if (this._isGlobalToken(labelName)) {
        referenceDetails = this._getGlobalToken(labelName);
        this._logPASM("  --  FOUND global name=[" + labelName + "]");
      }
      if (referenceDetails != undefined) {
        const nameOffset = line.indexOf(labelName, currentOffset);
        this._logPASM("  --  DAT Pasm " + referenceDetails.type + "=[" + labelName + "](" + nameOffset + 1 + ")");
        tokenSet.push({
          line: lineNumber,
          startCharacter: nameOffset,
          length: labelName.length,
          ptTokenType: referenceDetails.type,
          ptTokenModifiers: referenceDetails.modifiers,
        });
        haveLabel = true;
      } else {
        if (labelName.toLowerCase() != "debug" && bIsAlsoDebugLine) {
          // hrmf... no global type???? this should be a label?
          this._logPASM("  --  DAT Pasm ERROR NOT A label=[" + labelName + "](" + 0 + 1 + ")");
          const nameOffset = line.indexOf(labelName, currentOffset);
          tokenSet.push({
            line: lineNumber,
            startCharacter: nameOffset,
            length: labelName.length,
            ptTokenType: "variable", // color this offender!
            ptTokenModifiers: ["illegalUse"],
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
          this._logPASM("  -- DAT PASM likelyInstructionName=[" + likelyInstructionName + "], currentOffset=(" + currentOffset + ")");
          currentOffset += likelyInstructionName.length + 1;
          for (let index = minNonLabelParts; index < lineParts.length; index++) {
            let argumentName = lineParts[index].replace(/[@#]/, "");
            if (argumentName.length < 1) {
              // skip empty operand
              continue;
            }
            if (index == lineParts.length - 1 && this._isPasmConditional(argumentName)) {
              // conditional flag-set spec.
              this._logPASM("  -- SKIP argumentName=[" + argumentName + "]");
              continue;
            }
            const currArgumentLen = argumentName.length;
            const argHasArrayRereference: boolean = argumentName.includes("[");
            if (argHasArrayRereference) {
              const nameParts: string[] = argumentName.split("[");
              argumentName = nameParts[0];
            }
            let nameOffset: number = 0;
            if (argumentName.substr(0, 1).match(/[a-zA-Z_\.]/)) {
              // does name contain a namespace reference?
              this._logPASM("  -- argumentName=[" + argumentName + "]");
              let possibleNameSet: string[] = [];
              if (argumentName.includes(".") && !argumentName.startsWith(".")) {
                possibleNameSet = argumentName.split(".");
              } else {
                possibleNameSet = [argumentName];
              }
              this._logPASM("  --  possibleNameSet=[" + possibleNameSet + "]");
              const namePart = possibleNameSet[0];
              const searchString: string = possibleNameSet.length == 1 ? possibleNameSet[0] : possibleNameSet[0] + "." + possibleNameSet[1];
              nameOffset = line.indexOf(searchString, currentOffset);
              this._logPASM("  --  DAT Pasm searchString=[" + searchString + "](" + nameOffset + 1 + ")");
              let referenceDetails: RememberedToken | undefined = undefined;
              if (this._isGlobalToken(namePart)) {
                referenceDetails = this._getGlobalToken(namePart);
                this._logPASM("  --  FOUND global name=[" + namePart + "]");
              }
              if (referenceDetails != undefined) {
                this._logPASM("  --  DAT Pasm name=[" + namePart + "](" + nameOffset + 1 + ")");
                tokenSet.push({
                  line: lineNumber,
                  startCharacter: nameOffset,
                  length: namePart.length,
                  ptTokenType: referenceDetails.type,
                  ptTokenModifiers: referenceDetails.modifiers,
                });
              } else {
                // we use bIsDebugLine in next line so we don't flag debug() arguments!
                if (
                  !this._isPasmReservedWord(namePart) &&
                  !this._isPasmInstruction(namePart) &&
                  !this._isPasmConditional(namePart) &&
                  !this._isBinaryOperator(namePart) &&
                  !this._isBuiltinReservedWord(namePart) &&
                  !this._isCoginitReservedSymbol(namePart) &&
                  !this._isPasmModczOperand(namePart) &&
                  !this._isDebugMethod(namePart) &&
                  !bIsAlsoDebugLine
                ) {
                  this._logPASM("  --  DAT Pasm MISSING name=[" + namePart + "](" + nameOffset + 1 + ")");
                  tokenSet.push({
                    line: lineNumber,
                    startCharacter: nameOffset,
                    length: namePart.length,
                    ptTokenType: "variable",
                    ptTokenModifiers: ["readonly", "missingDeclaration"],
                  });
                } else {
                  this._logPASM("  --  DAT Pasm WHAT IS THIS?? name=[" + namePart + "](" + nameOffset + 1 + ")");
                }
              }
              if (possibleNameSet.length > 1) {
                // we have .constant namespace suffix
                // this can NOT be a method name it can only be a constant name
                const referenceOffset = line.indexOf(searchString, currentOffset);
                const constantPart: string = possibleNameSet[1];
                nameOffset = line.indexOf(constantPart, referenceOffset);
                this._logPASM("  --  DAT Pasm constant=[" + namePart + "](" + nameOffset + 1 + ")");
                tokenSet.push({
                  line: lineNumber,
                  startCharacter: nameOffset,
                  length: constantPart.length,
                  ptTokenType: "variable",
                  ptTokenModifiers: ["readonly"],
                });
              }
            }
            currentOffset += currArgumentLen + 1;
          }
        }
      }
    } else {
      // process data declaration
      if (this._isDatStorageType(lineParts[0])) {
        currentOffset = line.indexOf(lineParts[0], currentOffset);
      } else {
        // skip line part 0 length when searching for [1] name
        currentOffset = line.indexOf(lineParts[1], currentOffset + lineParts[0].length);
      }
      const allowLocalVarStatus: boolean = false;
      const IS_DAT_PASM: boolean = true;
      const partialTokenSet: IParsedToken[] = this._reportDAT_ValueDeclarationCode(lineNumber, currentOffset, line, allowLocalVarStatus, this.showPasmCode, IS_DAT_PASM);
      partialTokenSet.forEach((newToken) => {
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
    const isPrivate = methodType.indexOf("PRI") != -1;
    //skip Past Whitespace
    let currentOffset: number = this._skipWhite(line, startingOffset);
    const spineDeclarationLHSStr = this._getNonCommentLineReturnComment(lineNumber, currentOffset, line, tokenSet);
    if (spineDeclarationLHSStr) {
    } // we don't use this string, we called this to record our rhs comment!
    // -----------------------------------
    //   Method Name
    //
    const startNameOffset = currentOffset;
    // find open paren - skipping past method name
    currentOffset = line.indexOf("(", currentOffset);
    const methodName: string = line.substr(startNameOffset, currentOffset - startNameOffset).trim();
    this.currentMethodName = methodName; // notify of latest method name so we can track inLine PASM symbols
    // record definition of method
    const declModifiers: string[] = isPrivate ? ["declaration", "static"] : ["declaration"];
    tokenSet.push({
      line: lineNumber,
      startCharacter: startNameOffset,
      length: methodName.length,
      ptTokenType: "method",
      ptTokenModifiers: declModifiers,
    });
    this._logSPIN("-reportPubPriSig: methodName=[" + methodName + "](" + startNameOffset + ")");
    // -----------------------------------
    //   Parameters
    //
    // find close paren - so we can study parameters
    const closeParenOffset = line.indexOf(")", currentOffset);
    if (closeParenOffset != -1 && currentOffset + 1 != closeParenOffset) {
      // we have parameter(s)!
      const parameterStr = line.substr(currentOffset + 1, closeParenOffset - currentOffset - 1).trim();
      let parameterNames: string[] = [];
      if (parameterStr.includes(",")) {
        // we have multiple parameters
        parameterNames = parameterStr.split(",");
      } else {
        // we have one parameter
        parameterNames = [parameterStr];
      }
      for (let index = 0; index < parameterNames.length; index++) {
        const paramName = parameterNames[index].trim();
        const nameOffset = line.indexOf(paramName, currentOffset + 1);
        this._logSPIN("  -- paramName=[" + paramName + "](" + nameOffset + ")");
        tokenSet.push({
          line: lineNumber,
          startCharacter: nameOffset,
          length: paramName.length,
          ptTokenType: "parameter",
          ptTokenModifiers: ["declaration", "readonly", "local"],
        });
        // remember so we can ID references
        this._setLocalToken(paramName, new RememberedToken("parameter", ["readonly", "local"])); // TOKEN SET in _report()
        currentOffset += paramName.length + 1;
      }
    }
    // -----------------------------------
    //   Return Variable(s)
    //
    // find return vars
    const returnValueSep = line.indexOf(":", currentOffset);
    const localVarsSep = line.indexOf("|", currentOffset);
    let beginCommentOffset = line.indexOf("'", currentOffset);
    if (beginCommentOffset === -1) {
      beginCommentOffset = line.indexOf("{", currentOffset);
    }
    const nonCommentEOL = beginCommentOffset != -1 ? beginCommentOffset - 1 : line.length - 1;
    const returnVarsEnd = localVarsSep != -1 ? localVarsSep - 1 : nonCommentEOL;
    let returnValueNames: string[] = [];
    if (returnValueSep != -1) {
      // we have return var(s)!
      // we move currentOffset along so we don't falsely find short variable names earlier in string!
      currentOffset = returnValueSep + 1;
      const varNameStr = line.substr(returnValueSep + 1, returnVarsEnd - returnValueSep).trim();
      if (varNameStr.indexOf(",")) {
        // have multiple return value names
        returnValueNames = varNameStr.split(",");
      } else {
        // have a single return value name
        returnValueNames = [varNameStr];
      }
      for (let index = 0; index < returnValueNames.length; index++) {
        const returnValueName = returnValueNames[index].trim();
        const nameOffset = line.indexOf(returnValueName, currentOffset);
        this._logSPIN("  -- returnValueName=[" + returnValueName + "](" + nameOffset + ")");
        tokenSet.push({
          line: lineNumber,
          startCharacter: nameOffset,
          length: returnValueName.length,
          ptTokenType: "returnValue",
          ptTokenModifiers: ["declaration", "local"],
        });
        // remember so we can ID references
        this._setLocalToken(returnValueName, new RememberedToken("returnValue", ["local"])); // TOKEN SET in _report()
        currentOffset += returnValueName.length + 1; // +1 for trailing comma
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
      currentOffset = localVarsSep + 1;
      let localVarNames: string[] = [];
      if (localVarStr.indexOf(",")) {
        // have multiple return value names
        localVarNames = localVarStr.split(",");
      } else {
        // have a single return value name
        localVarNames = [localVarStr];
      }
      this._logSPIN("  -- localVarNames=[" + localVarNames + "]");
      for (let index = 0; index < localVarNames.length; index++) {
        const localVariableName = localVarNames[index].trim();
        const localVariableOffset = line.indexOf(localVariableName, currentOffset);
        let nameParts: string[] = [];
        if (localVariableName.includes(" ")) {
          // have name with storage and/or alignment operators
          nameParts = localVariableName.split(" ");
        } else {
          // have single name
          nameParts = [localVariableName];
        }
        this._logSPIN("  -- nameParts=[" + nameParts + "]");
        for (let index = 0; index < nameParts.length; index++) {
          let localName = nameParts[index];
          // have name similar to scratch[12]?
          if (localName.includes("[")) {
            // yes remove array suffix
            const lineInfo: IFilteredStrings = this._getNonWhiteSpinLineParts(localName);
            let localNameParts: string[] = lineInfo.lineParts;
            localName = localNameParts[0];
            for (let index = 1; index < localNameParts.length; index++) {
              const namedIndexPart = localNameParts[index];
              const nameOffset = line.indexOf(namedIndexPart, currentOffset);
              if (namedIndexPart.substr(0, 1).match(/[a-zA-Z_]/)) {
                let referenceDetails: RememberedToken | undefined = undefined;
                if (this._isLocalToken(namedIndexPart)) {
                  referenceDetails = this._getLocalToken(namedIndexPart);
                  this._logSPIN("  --  FOUND local name=[" + namedIndexPart + "]");
                } else if (this._isGlobalToken(namedIndexPart)) {
                  referenceDetails = this._getGlobalToken(namedIndexPart);
                  this._logSPIN("  --  FOUND global name=[" + namedIndexPart + "]");
                }
                if (referenceDetails != undefined) {
                  this._logSPIN("  --  lcl-idx variableName=[" + namedIndexPart + "](" + nameOffset + 1 + ")");
                  tokenSet.push({
                    line: lineNumber,
                    startCharacter: nameOffset,
                    length: namedIndexPart.length,
                    ptTokenType: referenceDetails.type,
                    ptTokenModifiers: referenceDetails.modifiers,
                  });
                } else {
                  if (
                    !this._isSpinReservedWord(namedIndexPart) &&
                    !this._isSpinBuiltinMethod(namedIndexPart) &&
                    !this._isBuiltinReservedWord(namedIndexPart) &&
                    !this._isDebugMethod(namedIndexPart) &&
                    !this._isDebugSymbol(namedIndexPart)
                  ) {
                    // we don't have name registered so just mark it
                    this._logSPIN("  --  SPIN MISSING varname=[" + namedIndexPart + "](" + nameOffset + 1 + ")");
                    tokenSet.push({
                      line: lineNumber,
                      startCharacter: nameOffset,
                      length: namedIndexPart.length,
                      ptTokenType: "variable",
                      ptTokenModifiers: ["missingDeclaration"],
                    });
                  }
                }
              }
            }
          }
          const nameOffset = line.indexOf(localName, localVariableOffset);
          this._logSPIN("  -- localName=[" + localName + "](" + nameOffset + ")");
          if (index == nameParts.length - 1) {
            // have name
            tokenSet.push({
              line: lineNumber,
              startCharacter: nameOffset,
              length: localName.length,
              ptTokenType: "variable",
              ptTokenModifiers: ["declaration", "local"],
            });
            // remember so we can ID references
            this._setLocalToken(localName, new RememberedToken("variable", ["local"])); // TOKEN SET in _report()
          } else {
            // have modifier!
            if (this._isStorageType(localName)) {
              tokenSet.push({
                line: lineNumber,
                startCharacter: nameOffset,
                length: localName.length,
                ptTokenType: "storageType",
                ptTokenModifiers: [],
              });
            } else if (this._isAlignType(localName)) {
              tokenSet.push({
                line: lineNumber,
                startCharacter: nameOffset,
                length: localName.length,
                ptTokenType: "storageType",
                ptTokenModifiers: [],
              });
            }
          }
        }
        currentOffset += localVariableName.length + 1; // +1 for trailing comma
      }
    }
    return tokenSet;
  }

  private _reportSPIN_Code(lineNumber: number, startingOffset: number, line: string): IParsedToken[] {
    const tokenSet: IParsedToken[] = [];
    // skip Past Whitespace
    let currentOffset: number = this._skipWhite(line, startingOffset);
    const nonCommentSpinLine = this._getNonCommentLineReturnComment(lineNumber, currentOffset, line, tokenSet);
    const remainingLength: number = nonCommentSpinLine.length;
    this._logCON("- reportSPIN nonCommentSpinLine=[" + nonCommentSpinLine + "] remainingLength=" + remainingLength);
    if (remainingLength > 0) {
      // locate key indicators of line style
      let assignmentOffset: number = line.indexOf(":=", currentOffset);
      if (assignmentOffset != -1) {
        // -------------------------------------------
        // have line assigning value to variable(s)
        //  Process LHS side of this assignment
        // -------------------------------------------
        const possibleVariableName = line.substr(currentOffset, assignmentOffset - currentOffset).trim();
        this._logSPIN("  -- LHS: possibleVariableName=[" + possibleVariableName + "]");
        let varNameList: string[] = [possibleVariableName];
        if (possibleVariableName.includes(",")) {
          varNameList = possibleVariableName.split(",");
        }
        if (possibleVariableName.includes(" ")) {
          // force special case range chars to be removed
          //  Ex: RESP_OVER..RESP_NOT_FOUND : error_code.byte[3] := mod
          // change .. to : so it is removed by getNonWhite...
          const filteredLine: string = possibleVariableName.replace("..", ":");
          const lineInfo: IFilteredStrings = this._getNonWhiteSpinLineParts(filteredLine);
          varNameList = lineInfo.lineParts;
        }
        this._logSPIN("  -- LHS: varNameList=[" + varNameList + "]");
        for (let index = 0; index < varNameList.length; index++) {
          const variableName: string = varNameList[index];
          const variableNameLen: number = variableName.length;
          if (variableName.includes("[")) {
            // NOTE this handles code: byte[pColor][2] := {value}
            // NOTE2 this handles code: result.byte[3] := {value}  P2 OBEX: jm_apa102c.spin2 (139)
            // have complex target name, parse in loop
            const variableNameParts: string[] = variableName.split(/[ \t\[\]\/\*\+\-\(\)\<\>]/);
            this._logSPIN("  -- LHS: [] variableNameParts=[" + variableNameParts + "]");
            let haveModification: boolean = false;
            for (let index = 0; index < variableNameParts.length; index++) {
              let variableNamePart = variableNameParts[index].replace("@", "");
              // secial case handle datar.[i] which leaves var name as 'darar.'
              if (variableNamePart.endsWith(".")) {
                variableNamePart = variableNamePart.substr(0, variableNamePart.length - 1);
              }
              const nameOffset = line.indexOf(variableNamePart, currentOffset);
              if (variableNamePart.substr(0, 1).match(/[a-zA-Z_]/)) {
                if (variableNamePart.includes(".")) {
                  const varNameParts: string[] = variableNamePart.split(".");
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
                                            ptTokenType: 'storageType',
                                            ptTokenModifiers: []
                                        });
                                        */
                  }
                }
                this._logSPIN("  -- variableNamePart=[" + variableNamePart + "](" + nameOffset + 1 + ")");
                if (this._isStorageType(variableNamePart)) {
                  tokenSet.push({
                    line: lineNumber,
                    startCharacter: nameOffset,
                    length: variableNamePart.length,
                    ptTokenType: "storageType",
                    ptTokenModifiers: [],
                  });
                } else {
                  let referenceDetails: RememberedToken | undefined = undefined;
                  if (this._isLocalToken(variableNamePart)) {
                    referenceDetails = this._getLocalToken(variableNamePart);
                    this._logSPIN("  --  FOUND local name=[" + variableNamePart + "]");
                  } else if (this._isGlobalToken(variableNamePart)) {
                    referenceDetails = this._getGlobalToken(variableNamePart);
                    this._logSPIN("  --  FOUND global name=[" + variableNamePart + "]");
                  }
                  if (referenceDetails != undefined) {
                    const modificationArray: string[] = this._modifiersWith(referenceDetails.modifiers, "modification");
                    this._logSPIN("  --  SPIN variableName=[" + variableNamePart + "](" + nameOffset + 1 + ")");
                    tokenSet.push({
                      line: lineNumber,
                      startCharacter: nameOffset,
                      length: variableNamePart.length,
                      ptTokenType: referenceDetails.type,
                      ptTokenModifiers: modificationArray,
                    });
                  } else {
                    if (
                      !this._isSpinReservedWord(variableNamePart) &&
                      !this._isBuiltinReservedWord(variableNamePart) &&
                      !this._isDebugMethod(variableNamePart) &&
                      !this._isDebugSymbol(variableNamePart) &&
                      !this._isSpinBuiltinMethod(variableNamePart)
                    ) {
                      // we don't have name registered so just mark it
                      this._logSPIN("  --  SPIN MISSING varname=[" + variableNamePart + "](" + nameOffset + 1 + ")");
                      tokenSet.push({
                        line: lineNumber,
                        startCharacter: nameOffset,
                        length: variableNamePart.length,
                        ptTokenType: "variable",
                        ptTokenModifiers: ["modification", "missingDeclaration"],
                      });
                    }
                  }
                }
              }
            }
          } else {
            // have simple target name, no []
            let cleanedVariableName: string = variableName.replace(/[ \t\(\)]/, "");
            const nameOffset = line.indexOf(cleanedVariableName, currentOffset);
            if (cleanedVariableName.substr(0, 1).match(/[a-zA-Z_]/) && !this._isStorageType(cleanedVariableName)) {
              this._logSPIN("  --  SPIN cleanedVariableName=[" + cleanedVariableName + "](" + nameOffset + 1 + ")");
              if (cleanedVariableName.includes(".")) {
                const varNameParts: string[] = cleanedVariableName.split(".");
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
                                        ptTokenType: 'storageType',
                                        ptTokenModifiers: []
                                    });
                                    */
                }
              }
              let referenceDetails: RememberedToken | undefined = undefined;
              if (this._isLocalToken(cleanedVariableName)) {
                referenceDetails = this._getLocalToken(cleanedVariableName);
                this._logSPIN("  --  FOUND local name=[" + cleanedVariableName + "]");
              } else if (this._isGlobalToken(cleanedVariableName)) {
                referenceDetails = this._getGlobalToken(cleanedVariableName);
                this._logSPIN("  --  FOUND globel name=[" + cleanedVariableName + "]");
              }
              if (referenceDetails != undefined) {
                const modificationArray: string[] = this._modifiersWith(referenceDetails.modifiers, "modification");
                this._logSPIN("  -- spin: simple variableName=[" + cleanedVariableName + "](" + nameOffset + 1 + ")");
                tokenSet.push({
                  line: lineNumber,
                  startCharacter: nameOffset,
                  length: cleanedVariableName.length,
                  ptTokenType: referenceDetails.type,
                  ptTokenModifiers: modificationArray,
                });
              } else if (cleanedVariableName == "_") {
                this._logSPIN("  --  built-in=[" + cleanedVariableName + "](" + nameOffset + 1 + ")");
                tokenSet.push({
                  line: lineNumber,
                  startCharacter: nameOffset,
                  length: cleanedVariableName.length,
                  ptTokenType: "variable",
                  ptTokenModifiers: ["modification", "defaultLibrary"],
                });
              } else {
                // we don't have name registered so just mark it
                if (
                  !this._isSpinReservedWord(cleanedVariableName) &&
                  !this._isSpinBuiltinMethod(cleanedVariableName) &&
                  !this._isBuiltinReservedWord(cleanedVariableName) &&
                  !this._isDebugMethod(cleanedVariableName) &&
                  !this._isDebugSymbol(cleanedVariableName)
                ) {
                  this._logSPIN("  --  SPIN MISSING cln name=[" + cleanedVariableName + "](" + nameOffset + 1 + ")");
                  tokenSet.push({
                    line: lineNumber,
                    startCharacter: nameOffset,
                    length: cleanedVariableName.length,
                    ptTokenType: "variable",
                    ptTokenModifiers: ["modification", "missingDeclaration"],
                  });
                }
              }
            }
          }
          currentOffset += variableNameLen + 1;
        }
        currentOffset = assignmentOffset + 2;
      }
      // -------------------------------------------
      // could be line with RHS of assignment or a
      //  line with no assignment (process it)
      // -------------------------------------------
      const assignmentRHSStr: string = this._getNonCommentLineReturnComment(lineNumber, currentOffset, line, tokenSet);
      currentOffset = line.indexOf(assignmentRHSStr, currentOffset);
      const preCleanAssignmentRHSStr = this._getNonInlineCommentLine(assignmentRHSStr).replace("..", "  ");
      this._logSPIN("  -- SPIN assignmentRHSStr=[" + assignmentRHSStr + "]");
      const lineInfo: IFilteredStrings = this._getNonWhiteSpinLineParts(preCleanAssignmentRHSStr);
      let possNames: string[] = lineInfo.lineParts;
      const nonStringAssignmentRHSStr: string = lineInfo.lineNoQuotes;
      let currNonStringOffset = 0;
      // special code to handle case range strings:  [e.g., SEG_TOP..SEG_BOTTOM:]
      //const isCaseValue: boolean = assignmentRHSStr.endsWith(':');
      //if (isCaseValue && possNames[0].includes("..")) {
      //    possNames = possNames[0].split("..");
      //}
      this._logSPIN("  -- possNames=[" + possNames + "]");
      const firstName: string = possNames.length > 0 ? possNames[0] : "";
      const bIsDebugLine: boolean = nonStringAssignmentRHSStr.toLowerCase().indexOf("debug(") != -1 ? true : false;
      for (let index = 0; index < possNames.length; index++) {
        let possibleName = possNames[index];
        // special code to handle case of var.[bitfield] leaving name a 'var.'
        if (possibleName.endsWith(".")) {
          possibleName = possibleName.substr(0, possibleName.length - 1);
        }
        let possibleNameSet: string[] = [];
        let nameOffset: number = 0;
        currNonStringOffset = nonStringAssignmentRHSStr.indexOf(possNames[index], currNonStringOffset);
        const currNonStringNameLen: number = possNames[index].length;
        if (possibleName.substr(0, 1).match(/[a-zA-Z_]/)) {
          this._logSPIN("  -- possibleName=[" + possibleName + "]");
          // does name contain a namespace reference?
          if (possibleName.includes(".")) {
            possibleNameSet = possibleName.split(".");
            this._logSPIN("  --  possibleNameSet=[" + possibleNameSet + "]");
          } else {
            possibleNameSet = [possibleName];
          }
          const namePart = possibleNameSet[0];
          const searchString: string = possibleNameSet.length == 1 ? possibleNameSet[0] : possibleNameSet[0] + "." + possibleNameSet[1];
          nameOffset = nonStringAssignmentRHSStr.indexOf(searchString, currNonStringOffset) + currentOffset;
          this._logSPIN("  --  SPIN RHS  nonStringAssignmentRHSStr=[" + nonStringAssignmentRHSStr + "]");
          this._logSPIN("  --  SPIN RHS   searchString=[" + searchString + "]");
          this._logSPIN("  --  SPIN RHS    nameOffset=(" + nameOffset + "), currNonStringOffset=(" + currNonStringOffset + "), currentOffset=(" + currentOffset + ")");
          let referenceDetails: RememberedToken | undefined = undefined;
          if (this._isLocalToken(namePart)) {
            referenceDetails = this._getLocalToken(namePart);
            this._logSPIN("  --  FOUND local name=[" + namePart + "]");
          } else if (this._isGlobalToken(namePart)) {
            referenceDetails = this._getGlobalToken(namePart);
            this._logSPIN("  --  FOUND global name=[" + namePart + "]");
          }
          if (referenceDetails != undefined) {
            this._logSPIN("  --  SPIN RHS name=[" + namePart + "](" + nameOffset + 1 + ")");
            tokenSet.push({
              line: lineNumber,
              startCharacter: nameOffset,
              length: namePart.length,
              ptTokenType: referenceDetails.type,
              ptTokenModifiers: referenceDetails.modifiers,
            });
          } else {
            // have unknown name!? is storage type spec?
            if (this._isStorageType(namePart)) {
              this._logSPIN("  --  SPIN RHS storageType=[" + namePart + "]");
              tokenSet.push({
                line: lineNumber,
                startCharacter: nameOffset,
                length: namePart.length,
                ptTokenType: "storageType",
                ptTokenModifiers: [],
              });
            }
            // we use bIsDebugLine in next line so we don't flag debug() arguments!
            else if (
              !this._isSpinReservedWord(namePart) &&
              !this._isSpinBuiltinMethod(namePart) &&
              !this._isBuiltinReservedWord(namePart) &&
              !this._isCoginitReservedSymbol(namePart) &&
              !this._isDebugMethod(namePart) &&
              !bIsDebugLine &&
              !this._isDebugInvocation(namePart)
            ) {
              // NO DEBUG FOR ELSE, most of spin control elements come through here!
              //else {
              //    this._logSPIN('  -- UNKNOWN?? name=[' + namePart + '] - name-get-breakage??');
              //}

              this._logSPIN("  --  SPIN MISSING rhs name=[" + namePart + "]");
              tokenSet.push({
                line: lineNumber,
                startCharacter: nameOffset,
                length: namePart.length,
                ptTokenType: "variable",
                ptTokenModifiers: ["missingDeclaration"],
              });
            }
          }
          if (possibleNameSet.length > 1) {
            // we have .constant namespace suffix
            // determine if this is method has '(' or constant name
            const referenceOffset = nonStringAssignmentRHSStr.indexOf(searchString, currNonStringOffset) + currentOffset;
            let isMethod: boolean = false;
            if (line.substr(referenceOffset + searchString.length, 1) == "(") {
              isMethod = true;
            }
            const constantPart: string = possibleNameSet[1];
            if (this._isStorageType(constantPart)) {
              // FIXME: UNDONE remove when syntax see this correctly
              const nameOffset: number = line.indexOf(constantPart, currentOffset);
              this._logSPIN("  --  SPIN rhs storageType=[" + constantPart + "](" + nameOffset + 1 + ")");
              tokenSet.push({
                line: lineNumber,
                startCharacter: nameOffset,
                length: constantPart.length,
                ptTokenType: "storageType",
                ptTokenModifiers: [],
              });
            } else {
              nameOffset = nonStringAssignmentRHSStr.indexOf(constantPart, currNonStringOffset) + currentOffset;
              const tokenTypeID: string = isMethod ? "method" : "variable";
              const tokenModifiers: string[] = isMethod ? [] : ["readonly"];
              this._logSPIN("  --  SPIN rhs constant=[" + constantPart + "](" + nameOffset + 1 + ") (" + tokenTypeID + ")");
              tokenSet.push({
                line: lineNumber,
                startCharacter: nameOffset,
                length: constantPart.length,
                ptTokenType: tokenTypeID,
                ptTokenModifiers: tokenModifiers,
              });
            }
          }
        } else if (possibleName.startsWith(".")) {
          const externalMethodName: string = possibleName.replace(".", "");
          nameOffset = nonStringAssignmentRHSStr.indexOf(externalMethodName, currNonStringOffset) + currentOffset;
          this._logSPIN("  --  SPIN rhs externalMethodName=[" + externalMethodName + "](" + nameOffset + 1 + ")");
          tokenSet.push({
            line: lineNumber,
            startCharacter: nameOffset,
            length: externalMethodName.length,
            ptTokenType: "method",
            ptTokenModifiers: [],
          });
        }
        currNonStringOffset += currNonStringNameLen + 1;
      }
    }
    return tokenSet;
  }

  private _reportSPIN_PasmCode(lineNumber: number, startingOffset: number, line: string): IParsedToken[] {
    const tokenSet: IParsedToken[] = [];
    // skip Past Whitespace
    let currentOffset: number = this._skipWhite(line, startingOffset);
    // get line parts - we only care about first one
    const inLinePasmRHSStr = this._getNonCommentLineReturnComment(lineNumber, currentOffset, line, tokenSet);
    const lineParts: string[] = this._getNonWhitePasmLineParts(inLinePasmRHSStr);
    this._logPASM("  -- reportInLinePasmDecl lineParts=[" + lineParts + "]");
    const firstName: string = lineParts.length > 0 ? lineParts[0] : "";
    const secondName: string = lineParts.length > 1 ? lineParts[1] : "";
    const bIsAlsoDebugLine: boolean = inLinePasmRHSStr.toLowerCase().indexOf("debug(") != -1 ? true : false;
    if (bIsAlsoDebugLine) {
      const partialTokenSet: IParsedToken[] = this._reportDebugStatement(lineNumber, startingOffset, line);
      partialTokenSet.forEach((newToken) => {
        this._logSPIN("=> SPINpasm: " + this._tokenString(newToken, line));
        tokenSet.push(newToken);
      });
    }
    // handle name in as first part of line...
    // (process label/variable name (but 'debug' of debug() is NOT a label!))
    let haveLabel: boolean = this._isDatOrPasmLabel(lineParts[0]) && lineParts[0].toLowerCase() != "debug";
    const isDataDeclarationLine: boolean = lineParts.length > 1 && haveLabel && this._isDatStorageType(lineParts[1]) ? true : false;
    if (haveLabel) {
      const labelName: string = lineParts[0];
      this._logPASM("  -- labelName=[" + labelName + "]");
      const labelType: string = isDataDeclarationLine ? "variable" : "label";
      const nameOffset: number = line.indexOf(labelName, currentOffset);
      tokenSet.push({
        line: lineNumber,
        startCharacter: nameOffset,
        length: labelName.length,
        ptTokenType: labelType,
        ptTokenModifiers: ["declaration"],
      });
      haveLabel = true;
    }
    if (bIsAlsoDebugLine) {
      // this line is [{label}] debug() ' comment
      //  no more to do so exit!
      return tokenSet;
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
        const possibleDirective: string = lineParts[argumentOffset];
        if (possibleDirective.toUpperCase() == "FILE") {
          // we have illegal so flag it and abort handling rest of line
          this._logPASM("  --  SPIN inlinePasm ERROR[CODE] illegal directive=[" + possibleDirective + "]");
          const nameOffset: number = line.indexOf(possibleDirective, currentOffset);
          tokenSet.push({
            line: lineNumber,
            startCharacter: nameOffset,
            length: possibleDirective.length,
            ptTokenType: "variable",
            ptTokenModifiers: ["illegalUse"],
          });
        } else {
          if (lineParts.length > minNonLabelParts) {
            currentOffset = line.indexOf(lineParts[minNonLabelParts - 1], currentOffset) + lineParts[minNonLabelParts - 1].length + 1;
            for (let index = minNonLabelParts; index < lineParts.length; index++) {
              const argumentName = lineParts[index].replace(/[@#]/, "");
              if (argumentName.length < 1) {
                // skip empty operand
                continue;
              }
              if (index == lineParts.length - 1 && this._isPasmConditional(argumentName)) {
                // conditional flag-set spec.
                this._logPASM("  -- SKIP argumentName=[" + argumentName + "]");
                continue;
              }
              const currArgumentLen = argumentName.length;
              if (argumentName.substr(0, 1).match(/[a-zA-Z_\.]/)) {
                // does name contain a namespace reference?
                this._logPASM("  -- argumentName=[" + argumentName + "]");
                let possibleNameSet: string[] = [];
                if (argumentName.includes(".") && !argumentName.startsWith(".")) {
                  possibleNameSet = argumentName.split(".");
                } else {
                  possibleNameSet = [argumentName];
                }
                this._logPASM("  --  possibleNameSet=[" + possibleNameSet + "]");
                const namePart = possibleNameSet[0];
                const searchString: string = possibleNameSet.length == 1 ? possibleNameSet[0] : possibleNameSet[0] + "." + possibleNameSet[1];
                const nameOffset = line.indexOf(searchString, currentOffset);
                let referenceDetails: RememberedToken | undefined = undefined;
                if (this._isLocalPasmTokenForMethod(this.currentMethodName, namePart)) {
                  referenceDetails = this._getLocalPasmTokenForMethod(this.currentMethodName, namePart);
                  this._logPASM("  --  FOUND local PASM name=[" + namePart + "]");
                } else if (this._isLocalToken(namePart)) {
                  referenceDetails = this._getLocalToken(namePart);
                  this._logPASM("  --  FOUND local name=[" + namePart + "]");
                } else if (this._isGlobalToken(namePart)) {
                  referenceDetails = this._getGlobalToken(namePart);
                  this._logPASM("  --  FOUND global name=[" + namePart + "]");
                }
                if (referenceDetails != undefined) {
                  this._logPASM("  --  SPIN inlinePASM add name=[" + namePart + "]");
                  tokenSet.push({
                    line: lineNumber,
                    startCharacter: nameOffset,
                    length: namePart.length,
                    ptTokenType: referenceDetails.type,
                    ptTokenModifiers: referenceDetails.modifiers,
                  });
                } else {
                  // we don't have name registered so just mark it
                  if (namePart != ".") {
                    // odd special case!
                    if (!this._isSpinReservedWord(namePart) && !this._isBuiltinReservedWord(namePart) && !this._isDebugMethod(namePart)) {
                      this._logPASM("  --  SPIN Pasm MISSING name=[" + namePart + "]");
                      tokenSet.push({
                        line: lineNumber,
                        startCharacter: nameOffset,
                        length: namePart.length,
                        ptTokenType: "variable",
                        ptTokenModifiers: ["missingDeclaration"],
                      });
                    } else if (this._isIllegalInlinePasmDirective(namePart)) {
                      this._logPASM("  --  SPIN inlinePasm ERROR[CODE] illegal name=[" + namePart + "]");
                      tokenSet.push({
                        line: lineNumber,
                        startCharacter: nameOffset,
                        length: namePart.length,
                        ptTokenType: "variable",
                        ptTokenModifiers: ["illegalUse"],
                      });
                    }
                  }
                }
                if (possibleNameSet.length > 1) {
                  // we have .constant namespace suffix
                  // this can NOT be a method name it can only be a constant name
                  this._logPASM("  --  SPIN inlinePasm constant name=[" + possibleNameSet[1] + "]");
                  const referenceOffset = line.indexOf(searchString, currentOffset);
                  const constantPart: string = possibleNameSet[1];
                  const nameOffset = line.indexOf(constantPart, referenceOffset);
                  tokenSet.push({
                    line: lineNumber,
                    startCharacter: nameOffset,
                    length: constantPart.length,
                    ptTokenType: "variable",
                    ptTokenModifiers: ["readonly"],
                  });
                }
              }
              currentOffset += currArgumentLen + 1;
            }
          }
        }
      } else {
        // have only 1 line part is directive or op-code
        // flag non-opcode or illegal directive
        const nameOrDirective: string = lineParts[0];
        // if this symbol is NOT a global token then it could be bad!
        if (!this._isKnownToken(nameOrDirective)) {
          if (this._isIllegalInlinePasmDirective(nameOrDirective) || !this._isPasmInstruction(nameOrDirective)) {
            this._logPASM("  --  SPIN inline-Pasm MISSING name=[" + nameOrDirective + "]");
            const nameOffset = line.indexOf(nameOrDirective, currentOffset);
            tokenSet.push({
              line: lineNumber,
              startCharacter: nameOffset,
              length: nameOrDirective.length,
              ptTokenType: "variable", // color this offender!
              ptTokenModifiers: ["illegalUse"],
            });
          }
        }
      }
    } else {
      // process data declaration
      if (this._isDatStorageType(lineParts[0])) {
        currentOffset = line.indexOf(lineParts[0], currentOffset);
      } else {
        currentOffset = line.indexOf(lineParts[1], currentOffset);
      }
      const allowLocalVarStatus: boolean = true;
      const NOT_DAT_PASM: boolean = false;
      const partialTokenSet: IParsedToken[] = this._reportDAT_ValueDeclarationCode(lineNumber, currentOffset, line, allowLocalVarStatus, this.showPasmCode, NOT_DAT_PASM);
      partialTokenSet.forEach((newToken) => {
        tokenSet.push(newToken);
      });
    }
    return tokenSet;
  }

  private _reportOBJ_DeclarationLine(lineNumber: number, startingOffset: number, line: string): IParsedToken[] {
    const tokenSet: IParsedToken[] = [];
    //skip Past Whitespace
    let currentOffset: number = this._skipWhite(line, startingOffset);
    const remainingNonCommentLineStr: string = this._getNonCommentLineReturnComment(lineNumber, currentOffset, line, tokenSet);
    //this._logOBJ('- RptObjDecl remainingNonCommentLineStr=[' + remainingNonCommentLineStr + ']');
    const remainingLength: number = remainingNonCommentLineStr.length;
    if (remainingLength > 0) {
      // get line parts - initially, we only care about first one
      const lineParts: string[] = remainingNonCommentLineStr.split(/[ \t\[]/);
      this._logOBJ("  --  OBJ lineParts=[" + lineParts + "]");
      const objectName = lineParts[0];
      // object name token must be offset into full line for token
      const nameOffset: number = line.indexOf(objectName, currentOffset);
      tokenSet.push({
        line: lineNumber,
        startCharacter: nameOffset,
        length: objectName.length,
        ptTokenType: "namespace",
        ptTokenModifiers: ["declaration"],
      });
      const objArrayOpen: number = remainingNonCommentLineStr.indexOf("[");
      if (objArrayOpen != -1) {
        // we have an array of objects, study the index value for possible named reference(s)
        const objArrayClose: number = remainingNonCommentLineStr.indexOf("]");
        if (objArrayClose != -1) {
          const elemCountStr: string = remainingNonCommentLineStr.substr(objArrayOpen + 1, objArrayClose - objArrayOpen - 1);
          // if we have a variable name...
          if (elemCountStr.substr(0, 1).match(/[a-zA-Z_]/)) {
            let possibleNameSet: string[] = [];
            const hasOpenParen: boolean = elemCountStr.indexOf("(") != -1; // should never be, but must check
            // is it a namespace reference?
            if (elemCountStr.includes(".")) {
              possibleNameSet = elemCountStr.split(".");
            } else {
              possibleNameSet = [elemCountStr];
            }
            for (let index = 0; index < possibleNameSet.length; index++) {
              const nameReference = possibleNameSet[index];
              if (this._isGlobalToken(nameReference)) {
                const referenceDetails: RememberedToken | undefined = this._getGlobalToken(nameReference);
                // Token offsets must be line relative so search entire line...
                const nameOffset = line.indexOf(nameReference, currentOffset);
                if (referenceDetails != undefined) {
                  //const updatedModificationSet: string[] = this._modifiersWithout(referenceDetails.modifiers, "declaration");
                  this._logOBJ("  --  FOUND global name=[" + nameReference + "]");
                  tokenSet.push({
                    line: lineNumber,
                    startCharacter: nameOffset,
                    length: nameReference.length,
                    ptTokenType: referenceDetails.type,
                    ptTokenModifiers: referenceDetails.modifiers,
                  });
                }
              } else {
                // have possible dotted reference with name in other object. if has to be a constant
                if (!hasOpenParen) {
                  this._logOBJ("  --  OBJ Constant in external object name=[" + nameReference + "]");
                  const nameOffset = line.indexOf(nameReference, currentOffset);
                  tokenSet.push({
                    line: lineNumber,
                    startCharacter: nameOffset,
                    length: nameReference.length,
                    ptTokenType: "variable",
                    ptTokenModifiers: ["readonly"],
                  });
                }
                // we don't have name registered so just mark it
                else if (!this._isSpinReservedWord(nameReference) && !this._isBuiltinReservedWord(nameReference) && !this._isDebugMethod(nameReference)) {
                  this._logOBJ("  --  OBJ MISSING name=[" + nameReference + "]");
                  const nameOffset = line.indexOf(nameReference, currentOffset);
                  tokenSet.push({
                    line: lineNumber,
                    startCharacter: nameOffset,
                    length: nameReference.length,
                    ptTokenType: "variable",
                    ptTokenModifiers: ["missingDeclaration"],
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
    let currentOffset: number = this._skipWhite(line, startingOffset);
    const remainingNonCommentLineStr: string = this._getNonCommentLineReturnComment(lineNumber, currentOffset, line, tokenSet);
    if (remainingNonCommentLineStr.length > 0) {
      // get line parts - we only care about first one
      let lineParts: string[] = this._getCommaDelimitedNonWhiteLineParts(remainingNonCommentLineStr);
      this._logVAR("  -- rptVarDecl lineParts=[" + lineParts + "]");
      // remember this object name so we can annotate a call to it
      const isMultiDeclaration: boolean = remainingNonCommentLineStr.includes(",");
      const hasStorageType: boolean = this._isStorageType(lineParts[0]);
      if (lineParts.length > 1) {
        const startIndex: number = hasStorageType ? 1 : 0;
        for (let index = startIndex; index < lineParts.length; index++) {
          let newName = lineParts[index];
          const hasArrayReference: boolean = newName.indexOf("[") != -1;
          if (hasArrayReference) {
            // remove array suffix from name
            if (newName.includes("[")) {
              const nameParts: string[] = newName.split("[");
              newName = nameParts[0];
            }
          }
          // in the following, let's not register a name with a trailing ']' this is part of an array size calculation!
          if (newName.substr(0, 1).match(/[a-zA-Z_]/) && newName.indexOf("]") == -1) {
            this._logVAR("  -- GLBL ADD rvdl newName=[" + newName + "]");
            const nameOffset: number = line.indexOf(newName, currentOffset);
            tokenSet.push({
              line: lineNumber,
              startCharacter: nameOffset,
              length: newName.length,
              ptTokenType: "variable",
              ptTokenModifiers: ["declaration", "instance"],
            });
            currentOffset = nameOffset + newName.length;
          }
          if (hasArrayReference) {
            // process name with array length value
            const arrayOpenOffset: number = line.indexOf("[", currentOffset);
            const arrayCloseOffset: number = line.indexOf("]", currentOffset);
            const arrayReference: string = line.substr(arrayOpenOffset + 1, arrayCloseOffset - arrayOpenOffset - 1);
            const arrayReferenceParts: string[] = arrayReference.split(/[ \t\/\*\+\<\>]/);
            this._logVAR("  --  arrayReferenceParts=[" + arrayReferenceParts + "]");
            for (let index = 0; index < arrayReferenceParts.length; index++) {
              const referenceName = arrayReferenceParts[index];
              if (referenceName.substr(0, 1).match(/[a-zA-Z_]/)) {
                let possibleNameSet: string[] = [];
                // is it a namespace reference?
                if (referenceName.includes(".")) {
                  possibleNameSet = referenceName.split(".");
                } else {
                  possibleNameSet = [referenceName];
                }
                this._logVAR("  --  possibleNameSet=[" + possibleNameSet + "]");
                const namePart = possibleNameSet[0];
                if (this._isGlobalToken(namePart)) {
                  const referenceDetails: RememberedToken | undefined = this._getGlobalToken(namePart);
                  const searchString: string = possibleNameSet.length == 1 ? possibleNameSet[0] : possibleNameSet[0] + "." + possibleNameSet[1];
                  const nameOffset = line.indexOf(searchString, currentOffset);
                  if (referenceDetails != undefined) {
                    this._logVAR("  --  FOUND global name=[" + namePart + "]");
                    tokenSet.push({
                      line: lineNumber,
                      startCharacter: nameOffset,
                      length: namePart.length,
                      ptTokenType: referenceDetails.type,
                      ptTokenModifiers: referenceDetails.modifiers,
                    });
                  } else {
                    // we don't have name registered so just mark it
                    if (!this._isSpinReservedWord(namePart) && !this._isBuiltinReservedWord(namePart) && !this._isDebugMethod(namePart)) {
                      this._logVAR("  --  VAR Add MISSING name=[" + namePart + "]");
                      tokenSet.push({
                        line: lineNumber,
                        startCharacter: nameOffset,
                        length: namePart.length,
                        ptTokenType: "variable",
                        ptTokenModifiers: ["missingDeclaration"],
                      });
                    }
                  }
                }
                if (possibleNameSet.length > 1) {
                  // we have .constant namespace suffix
                  this._logVAR("  --  VAR Add ReadOnly name=[" + namePart + "]");
                  const constantPart: string = possibleNameSet[1];
                  const nameOffset = line.indexOf(constantPart, currentOffset);
                  tokenSet.push({
                    line: lineNumber,
                    startCharacter: nameOffset,
                    length: constantPart.length,
                    ptTokenType: "variable",
                    ptTokenModifiers: ["readonly"],
                  });
                }
              }
            }
          }
        }
      } else {
        // have single declaration per line
        let newName = lineParts[0];
        if (newName.substr(0, 1).match(/[a-zA-Z_]/)) {
          this._logVAR("  -- GLBL rvdl2 newName=[" + newName + "]");
          const nameOffset: number = line.indexOf(newName, currentOffset);
          tokenSet.push({
            line: lineNumber,
            startCharacter: nameOffset,
            length: newName.length,
            ptTokenType: "variable",
            ptTokenModifiers: ["declaration", "instance"],
          });
        }
      }
    }
    return tokenSet;
  }

  private _reportDebugStatement(lineNumber: number, startingOffset: number, line: string): IParsedToken[] {
    const tokenSet: IParsedToken[] = [];
    // locate and collect debug() display user names and types
    //
    // debug(`{displayName} ... )
    // debug(`zstr_(displayName) lutcolors `uhex_long_array_(image_address, lut_size))
    // debug(`lstr_(displayName, len) lutcolors `uhex_long_array_(image_address, lut_size))
    // debug(``#(letter) lutcolors `uhex_long_array_(image_address, lut_size))
    //
    let currentOffset: number = this._skipWhite(line, startingOffset);
    // get line parts - we only care about first one
    const debugStatementStr = this._getDebugStatement(currentOffset, line);
    this._logDEBUG(" -- rptDbg debugStatementStr=[" + debugStatementStr + "]");
    if (debugStatementStr.length == 0) {
      return tokenSet;
    }
    // now record the comment if we have one
    const commentRHSStrOffset: number = currentOffset + debugStatementStr.length;
    const commentOffset: number = line.indexOf("'", commentRHSStrOffset);
    if (commentOffset != -1) {
      const newToken: IParsedToken = {
        line: lineNumber,
        startCharacter: commentOffset,
        length: line.length - commentOffset + 1,
        ptTokenType: "comment",
        ptTokenModifiers: ["line"],
      };
      tokenSet.push(newToken);
    }
    this._logDEBUG("-- DEBUG line(" + lineNumber + ") debugStatementStr=[" + debugStatementStr + "]");
    let lineParts: string[] = this._getDebugNonWhiteLineParts(debugStatementStr);
    this._logDEBUG(" -- rptDbg lineParts=[" + lineParts + "]");
    if (lineParts.length > 0 && lineParts[0].toLowerCase() != "debug") {
      //this._logDEBUG(' -- rptDbg first name not debug! (label?) removing! lineParts[0]=[' + lineParts[0] + ']');
      lineParts.shift(); // assume pasm, remove label
    }
    if (lineParts[0].toLowerCase() == "debug") {
      let symbolOffset: number = currentOffset;
      if (lineParts.length >= 2) {
        const displayType: string = lineParts[1];
        if (displayType.startsWith("`")) {
          this._logDEBUG(' -- rptDbg have "debug("` lineParts=[' + lineParts + "]");
          symbolOffset = line.indexOf(displayType, symbolOffset) + 1; // plus 1 to get past back-tic
          const newDisplayType: string = displayType.substring(1, displayType.length);
          let displayTestName: string = lineParts[1] == "`" ? lineParts[1] + lineParts[2] : lineParts[1];
          displayTestName = displayTestName.toLowerCase().replace(/ \t/g, "");
          const isRuntimeNamed: boolean = displayTestName.startsWith("``") || displayTestName.startsWith("`zstr") || displayTestName.startsWith("`lstr");
          this._logDEBUG(" -- rptDbg displayTestName=[" + displayTestName + "], isRuntimeNamed=" + isRuntimeNamed);
          let bHaveInstantiation = this._isDebugDisplayType(newDisplayType) && !isRuntimeNamed;
          if (bHaveInstantiation) {
            this._logDEBUG("  -- rptDbg --- PROCESSING Instantiation");
            // -------------------------------------
            // process Debug() display instantiation
            //   **    debug(`{displayType} {displayName} ......)
            // (0a) register type use
            this._logDEBUG("  -- rptDbg newDisplayType=[" + newDisplayType + "]");
            tokenSet.push({
              line: lineNumber,
              startCharacter: symbolOffset,
              length: newDisplayType.length,
              ptTokenType: "displayType",
              ptTokenModifiers: ["reference", "defaultLibrary"],
            });
            // (0b) register userName use
            symbolOffset += displayType.length;
            const newDisplayName: string = lineParts[2];
            symbolOffset = line.indexOf(newDisplayName, symbolOffset);
            this._logDEBUG("  -- rptDbg newDisplayName=[" + newDisplayName + "]");
            tokenSet.push({
              line: lineNumber,
              startCharacter: symbolOffset,
              length: newDisplayName.length,
              ptTokenType: "displayName",
              ptTokenModifiers: ["declaration"],
            });
            symbolOffset += newDisplayName.length;
            // (1) highlight parameter names
            let eDisplayType: eDebugDisplayType = this._getDebugDisplayType(newDisplayType);
            const firstParamIdx: number = 3; // [0]=debug [1]=`{type}, [2]={userName}
            for (let idx = firstParamIdx; idx < lineParts.length; idx++) {
              const newParameter: string = lineParts[idx];
              symbolOffset = line.indexOf(newParameter, symbolOffset);
              const bIsParameterName: boolean = this._isNameWithTypeInstantiation(newParameter, eDisplayType);
              if (bIsParameterName) {
                this._logDEBUG("  -- rptDbg newParam=[" + newParameter + "]");
                tokenSet.push({
                  line: lineNumber,
                  startCharacter: symbolOffset,
                  length: newParameter.length,
                  ptTokenType: "setupParameter",
                  ptTokenModifiers: ["reference", "defaultLibrary"],
                });
              } else {
                const bIsColorName: boolean = this._isDebugColorName(newParameter);
                if (bIsColorName) {
                  this._logDEBUG("  -- rptDbg newColor=[" + newParameter + "]");
                  tokenSet.push({
                    line: lineNumber,
                    startCharacter: symbolOffset,
                    length: newParameter.length,
                    ptTokenType: "colorName",
                    ptTokenModifiers: ["reference", "defaultLibrary"],
                  });
                } else {
                  // unknown parameter, is known symbol?
                  let referenceDetails: RememberedToken | undefined = undefined;
                  if (this._isLocalPasmTokenForMethod(this.currentMethodName, newParameter)) {
                    referenceDetails = this._getLocalPasmTokenForMethod(this.currentMethodName, newParameter);
                    this._logPASM("  --  FOUND local PASM name=[" + newParameter + "]");
                  } else if (this._isLocalToken(newParameter)) {
                    referenceDetails = this._getLocalToken(newParameter);
                    this._logPASM("  --  FOUND local name=[" + newParameter + "]");
                  } else if (this._isGlobalToken(newParameter)) {
                    referenceDetails = this._getGlobalToken(newParameter);
                    this._logPASM("  --  FOUND global name=[" + newParameter + "]");
                  }
                  if (referenceDetails != undefined) {
                    this._logPASM("  --  SPIN/Pasm add name=[" + newParameter + "]");
                    tokenSet.push({
                      line: lineNumber,
                      startCharacter: symbolOffset,
                      length: newParameter.length,
                      ptTokenType: referenceDetails.type,
                      ptTokenModifiers: referenceDetails.modifiers,
                    });
                  } else {
                    // handle unknown-name case
                    const paramIsSymbolName: boolean = newParameter.substring(0, 1).match(/[a-zA-Z_]/) ? true : false;
                    if (
                      paramIsSymbolName &&
                      !this._isDebugMethod(newParameter) &&
                      newParameter.indexOf("`") == -1 &&
                      !this._isUnaryOperator(newParameter) &&
                      !this._isBinaryOperator(newParameter) &&
                      !this._isFloatConversion(newParameter) &&
                      !this._isSpinBuiltinMethod(newParameter) &&
                      !this._isBuiltinReservedWord(newParameter)
                    ) {
                      this._logDEBUG("  -- rptDbg 1 unkParam=[" + newParameter + "]");
                      tokenSet.push({
                        line: lineNumber,
                        startCharacter: symbolOffset,
                        length: newParameter.length,
                        ptTokenType: "setupParameter",
                        ptTokenModifiers: ["illegalUse"],
                      });
                    }
                  }
                }
              }
              symbolOffset += newParameter.length;
            }
            // (2) highlight strings
            const tokenStringSet: IParsedToken[] = this._reportDebugStrings(lineNumber, line, debugStatementStr);
            tokenStringSet.forEach((newToken) => {
              tokenSet.push(newToken);
            });
          } else {
            // -------------------------------------
            // process Debug() display feed/instantiation
            //   **    debug(`{(displayName} {displayName} {...}} ......)
            //   **    debug(`zstr_(displayName) lutcolors `uhex_long_array_(image_address, lut_size))
            //   **    debug(`lstr_(displayName, len) lutcolors `uhex_long_array_(image_address, lut_size))
            //   **    debug(``#(letter) lutcolors `uhex_long_array_(image_address, lut_size))
            //  NOTE: 1 or more display names!
            //  FIXME: Chip: how do we validate types when multiple displays! (of diff types)??
            //    Chip: "only types common to all"!
            let displayName: string = newDisplayType;
            let bHaveFeed = this._isKnownDebugDisplay(displayName);
            if (isRuntimeNamed) {
              bHaveFeed = true;
            }
            // handle 1st display here
            let firstParamIdx: number = 0; // value NOT used
            if (bHaveFeed) {
              this._logDEBUG("  -- rptDbg --- PROCESSING feed");
              if (isRuntimeNamed) {
                firstParamIdx = displayName == "`" || displayName == "``" ? 2 : 1; // [0]=`debug` [1]=`runtimeName, [2]... symbols
              } else {
                firstParamIdx = 1; // [0]=debug [1]=`{userName}[[, {userName}], ...]
                // handle one or more names!
                do {
                  // (0) register UserName use
                  this._logDEBUG("  -- rptDbg displayName=[" + displayName + "]");
                  tokenSet.push({
                    line: lineNumber,
                    startCharacter: symbolOffset,
                    length: displayName.length,
                    ptTokenType: "displayName",
                    ptTokenModifiers: ["reference"],
                  });
                  symbolOffset += displayName.length + 1;
                  if (firstParamIdx < lineParts.length) {
                    firstParamIdx++;
                    displayName = lineParts[firstParamIdx];
                    bHaveFeed = this._isKnownDebugDisplay(displayName);
                  } else {
                    bHaveFeed = false;
                  }
                } while (bHaveFeed);
              }
              // (1) highlight parameter names (NOTE: based on first display type, only)
              let eDisplayType: eDebugDisplayType = this._getUserDebugDisplayType(newDisplayType);
              if (isRuntimeNamed) {
                // override bad display type with directive if present
                eDisplayType = this._getDisplayTypeForLine(lineNumber);
              }
              let newParameter: string = "";
              for (let idx = firstParamIdx; idx < lineParts.length; idx++) {
                newParameter = lineParts[idx];
                if (newParameter.indexOf("'") != -1 || this._isStorageType(newParameter)) {
                  symbolOffset += newParameter.length;
                  continue; // skip this name (it's part of a string!)
                } else if (newParameter.indexOf("#") != -1) {
                  symbolOffset += newParameter.length;
                  continue; // skip this name (it's part of a string!)
                }
                symbolOffset = line.indexOf(newParameter, symbolOffset);
                this._logDEBUG("  -- rptDbg ?check? [" + newParameter + "] symbolOffset=" + symbolOffset);
                let bIsParameterName: boolean = this._isNameWithTypeFeed(newParameter, eDisplayType);
                if (isRuntimeNamed && newParameter.toLowerCase() == "lutcolors") {
                  bIsParameterName = true;
                }
                if (bIsParameterName) {
                  this._logDEBUG("  -- rptDbg newParam=[" + newParameter + "]");
                  tokenSet.push({
                    line: lineNumber,
                    startCharacter: symbolOffset,
                    length: newParameter.length,
                    ptTokenType: "feedParameter",
                    ptTokenModifiers: ["reference", "defaultLibrary"],
                  });
                } else {
                  const bIsColorName: boolean = this._isDebugColorName(newParameter);
                  if (bIsColorName) {
                    this._logDEBUG("  -- rptDbg newColor=[" + newParameter + "]");
                    tokenSet.push({
                      line: lineNumber,
                      startCharacter: symbolOffset,
                      length: newParameter.length,
                      ptTokenType: "colorName",
                      ptTokenModifiers: ["reference", "defaultLibrary"],
                    });
                  } else {
                    // unknown parameter, is known symbol?
                    let referenceDetails: RememberedToken | undefined = undefined;
                    if (this._isLocalPasmTokenForMethod(this.currentMethodName, newParameter)) {
                      referenceDetails = this._getLocalPasmTokenForMethod(this.currentMethodName, newParameter);
                      this._logPASM("  --  FOUND local PASM name=[" + newParameter + "]");
                    } else if (this._isLocalToken(newParameter)) {
                      referenceDetails = this._getLocalToken(newParameter);
                      this._logPASM("  --  FOUND local name=[" + newParameter + "]");
                    } else if (this._isGlobalToken(newParameter)) {
                      referenceDetails = this._getGlobalToken(newParameter);
                      this._logPASM("  --  FOUND global name=[" + newParameter + "]");
                    }
                    if (referenceDetails != undefined) {
                      this._logPASM("  --  SPIN Pasm add name=[" + newParameter + "]");
                      tokenSet.push({
                        line: lineNumber,
                        startCharacter: symbolOffset, // <-- this offset is bad!
                        length: newParameter.length,
                        ptTokenType: referenceDetails.type,
                        ptTokenModifiers: referenceDetails.modifiers,
                      });
                    } else {
                      // handle unknown-name case
                      const paramIsSymbolName: boolean = newParameter.substring(0, 1).match(/[a-zA-Z_]/) ? true : false;
                      if (
                        paramIsSymbolName &&
                        this._isDebugMethod(newParameter) == false &&
                        newParameter.indexOf("`") == -1 &&
                        !this._isUnaryOperator(newParameter) &&
                        !this._isBinaryOperator(newParameter) &&
                        !this._isFloatConversion(newParameter) &&
                        !this._isSpinBuiltinMethod(newParameter) &&
                        !this._isBuiltinReservedWord(newParameter)
                      ) {
                        this._logDEBUG("  -- rptDbg 2 unkParam=[" + newParameter + "]"); // XYZZY LutColors
                        tokenSet.push({
                          line: lineNumber,
                          startCharacter: symbolOffset,
                          length: newParameter.length,
                          ptTokenType: "setupParameter",
                          ptTokenModifiers: ["illegalUse"],
                        });
                      }
                    }
                  }
                }
                symbolOffset += newParameter.length;
              }
              // (2) highlight strings
              const tokenStringSet: IParsedToken[] = this._reportDebugStrings(lineNumber, line, debugStatementStr);
              tokenStringSet.forEach((newToken) => {
                tokenSet.push(newToken);
              });
            }
          }
        } else {
          this._logDEBUG("  -- rptDbg --- PROCESSING non-display (other)");
          // -------------------------------------
          // process non-display debug statement
          const firstParamIdx: number = 0; // no prefix to skip
          let symbolOffset: number = currentOffset;
          let newParameter: string = "";
          for (let idx = firstParamIdx; idx < lineParts.length; idx++) {
            newParameter = lineParts[idx];
            if (newParameter.toLowerCase() == "debug" || this._isStorageType(newParameter)) {
              continue;
            }
            symbolOffset = line.indexOf(newParameter, symbolOffset); // walk this past each
            // does name contain a namespace reference?
            let bHaveObjReference: boolean = false;
            if (newParameter.includes(".")) {
              // go register object reference!
              bHaveObjReference = this._reportObjectReference(newParameter, lineNumber, startingOffset, line, tokenSet);
            }
            if (!bHaveObjReference) {
              this._logDEBUG("  -- ?check? [" + newParameter + "]");

              let referenceDetails: RememberedToken | undefined = undefined;
              if (this._isLocalPasmTokenForMethod(this.currentMethodName, newParameter)) {
                referenceDetails = this._getLocalPasmTokenForMethod(this.currentMethodName, newParameter);
                this._logPASM("  --  FOUND local PASM name=[" + newParameter + "]");
              } else if (this._isLocalToken(newParameter)) {
                referenceDetails = this._getLocalToken(newParameter);
                this._logPASM("  --  FOUND local name=[" + newParameter + "]");
              } else if (this._isGlobalToken(newParameter)) {
                referenceDetails = this._getGlobalToken(newParameter);
                this._logPASM("  --  FOUND global name=[" + newParameter + "]");
              }
              if (referenceDetails != undefined) {
                //this._logPASM('  --  Debug() colorize name=[' + newParameter + ']');
                tokenSet.push({
                  line: lineNumber,
                  startCharacter: symbolOffset,
                  length: newParameter.length,
                  ptTokenType: referenceDetails.type,
                  ptTokenModifiers: referenceDetails.modifiers,
                });
              } else {
                // handle unknown-name case
                const paramIsSymbolName: boolean = newParameter.substring(0, 1).match(/[a-zA-Z_]/) ? true : false;
                if (
                  paramIsSymbolName &&
                  !this._isDebugMethod(newParameter) &&
                  !this._isBinaryOperator(newParameter) &&
                  !this._isUnaryOperator(newParameter) &&
                  !this._isFloatConversion(newParameter) &&
                  !this._isSpinBuiltinMethod(newParameter) &&
                  !this._isSpinBuiltInVariable(newParameter)
                ) {
                  this._logDEBUG("  -- rptDbg 3 unkParam=[" + newParameter + "]");
                  tokenSet.push({
                    line: lineNumber,
                    startCharacter: symbolOffset,
                    length: newParameter.length,
                    ptTokenType: "setupParameter",
                    ptTokenModifiers: ["illegalUse"],
                  });
                }
              }
            }
            symbolOffset += newParameter.length;
          }
          // (2) highlight strings
          const tokenStringSet: IParsedToken[] = this._reportDebugStrings(lineNumber, line, debugStatementStr);
          tokenStringSet.forEach((newToken) => {
            tokenSet.push(newToken);
          });
        }
      }
    } else {
      this._logDEBUG("ERROR: _reportDebugStatement() line(" + lineNumber + ") line=[" + line + "] no debug()??");
    }
    return tokenSet;
  }

  private _reportObjectReference(dotReference: string, lineNumber: number, startingOffset: number, line: string, tokenSet: IParsedToken[]): boolean {
    this._logDEBUG("  --  rOr dotReference=[" + dotReference + "]");
    let possibleNameSet: string[] = [];
    let bGeneratedReference: boolean = false;
    if (dotReference.includes(".")) {
      const symbolOffset: number = line.indexOf(dotReference, startingOffset); // walk this past each
      possibleNameSet = dotReference.split(".");
      const namePart = possibleNameSet[0];
      let referenceDetails: RememberedToken | undefined = undefined;
      if (this._isGlobalToken(namePart)) {
        referenceDetails = this._getGlobalToken(namePart);
        this._logPASM("  --  FOUND global name=[" + namePart + "]");
      }
      if (referenceDetails != undefined) {
        //this._logPASM('  --  Debug() colorize name=[' + newParameter + ']');
        bGeneratedReference = true;
        tokenSet.push({
          line: lineNumber,
          startCharacter: symbolOffset,
          length: namePart.length,
          ptTokenType: referenceDetails.type,
          ptTokenModifiers: referenceDetails.modifiers,
        });
        if (possibleNameSet.length > 1) {
          // we have .constant namespace suffix
          // determine if this is method has '(' or constant name
          const refPart = possibleNameSet[1];
          const referenceOffset = line.indexOf(refPart, symbolOffset + namePart.length + 1);
          let isMethod: boolean = false;
          if (line.substr(referenceOffset + refPart.length, 1) == "(") {
            isMethod = true;
          }
          const constantPart: string = possibleNameSet[1];
          if (this._isStorageType(constantPart)) {
            // FIXME: UNDONE remove when syntax see this correctly
            const nameOffset: number = line.indexOf(constantPart, referenceOffset + refPart.length + 1);
            this._logSPIN("  --  rOr rhs storageType=[" + constantPart + "](" + nameOffset + 1 + ")");
            tokenSet.push({
              line: lineNumber,
              startCharacter: nameOffset,
              length: constantPart.length,
              ptTokenType: "storageType",
              ptTokenModifiers: [],
            });
          } else {
            const tokenTypeID: string = isMethod ? "method" : "variable";
            const tokenModifiers: string[] = isMethod ? [] : ["readonly"];
            this._logSPIN("  --  rOr rhs constant=[" + constantPart + "](" + referenceOffset + 1 + ") (" + tokenTypeID + ")");
            tokenSet.push({
              line: lineNumber,
              startCharacter: referenceOffset,
              length: refPart.length,
              ptTokenType: tokenTypeID,
              ptTokenModifiers: tokenModifiers,
            });
          }
        }
      }
    }
    return bGeneratedReference;
  }

  private _reportDebugStrings(lineNumber: number, line: string, debugStatementStr: string): IParsedToken[] {
    // debug statements typically have single or double quoted strings.  Let's color either if/when found!
    const tokenSet: IParsedToken[] = [];
    let tokenStringSet: IParsedToken[] = this._reportDebugDblQuoteStrings(lineNumber, line, debugStatementStr);
    tokenStringSet.forEach((newToken) => {
      tokenSet.push(newToken);
    });
    let bNeedSingleQuoteProcessing: boolean = true;
    if (tokenStringSet.length > 0) {
      // see if we have sgl quites outside if dbl-quote strings
      const nonStringLine: string = this._removeDoubleQuotedStrings(debugStatementStr);
      bNeedSingleQuoteProcessing = nonStringLine.indexOf("'") != -1;
    }
    if (bNeedSingleQuoteProcessing) {
      tokenStringSet = this._reportDebugSglQuoteStrings(lineNumber, line, debugStatementStr);
      tokenStringSet.forEach((newToken) => {
        tokenSet.push(newToken);
      });
    }
    return tokenSet;
  }

  private _reportDebugSglQuoteStrings(lineNumber: number, line: string, debugStatementStr: string): IParsedToken[] {
    const tokenSet: IParsedToken[] = [];
    // find all strings in debug() statement but for now just do first...
    let currentOffset: number = line.indexOf(debugStatementStr);
    let nextStringOffset: number = 0;
    let nextString: string = "";
    do {
      nextString = this._getSingleQuotedString(nextStringOffset, debugStatementStr);
      if (nextString.length > 0) {
        nextStringOffset = debugStatementStr.indexOf(nextString, nextStringOffset);
        const chrBackTic: string = "`";
        const chrCloseParen: string = ")";
        const bStringContainssBackTic: boolean = nextString.indexOf(chrBackTic) != -1;
        if (bStringContainssBackTic) {
          // add special handling for '`()' this case
          //
          // EX #1: '`{!!}(P_GAIN)'                           - emit two strings, each just a tic
          // EX #2" 'enc=`(encVal), extra'                    - emit two strings
          // EX #3: 'FwdEnc=`{!!}(encVal)'                    - emit two strings, leading and trailing(just a tic)
          // EX #4: 'FwdEnc=`{!!}(encVal), dty=`{!!}(duty)'   - emit three strings: leading, middle, and trailing(just a tic)
          //    where {!!} is optional and is one of [$,%,#]
          //
          // - for each backtic string ends at chrBackTic, record it
          // - skip to close paren (string starts after close paren)
          //this._logMessage('- rdsqs nextString=[' + nextString + '] line=[' + line + ']');
          let searchOffset: number = 0; // value doesn't matter
          let currStrOffset: number = 0; // we start at zero!
          let lineStrOffset: number = line.indexOf(nextString, currentOffset);
          let backTicOffset: number = nextString.indexOf(chrBackTic, searchOffset);
          while (backTicOffset != -1) {
            const currStr = nextString.substring(currStrOffset, backTicOffset);
            //this._logDEBUG('  --  rdsqs currStr=[' + currStr + '](' + lineStrOffset  + ')');
            // record the left edge string
            tokenSet.push({
              line: lineNumber,
              startCharacter: lineStrOffset,
              length: currStr.length,
              ptTokenType: "string",
              ptTokenModifiers: ["quoted", "single"],
            });
            currStrOffset += currStr.length;
            lineStrOffset += currStr.length;
            //this._logMessage('  -- currStr=[' + currStr + '] lineStrOffset=[' + lineStrOffset + ']');
            const closeParenOffset: number = nextString.indexOf(chrCloseParen, backTicOffset + 2); // +2 is past open paren
            if (closeParenOffset != -1) {
              const ticParenLen: number = closeParenOffset - backTicOffset + 1;
              //this._logMessage('  --  rdsqs closeParenOffset=[' + closeParenOffset + '], backTicOffset=[' + backTicOffset + '], ticParenLen=[' + ticParenLen + ']');
              backTicOffset = nextString.indexOf(chrBackTic, closeParenOffset);
              lineStrOffset += ticParenLen;
              // if we have another back-tic...
              if (backTicOffset != -1) {
                // had this string to front string processing
                currStrOffset += ticParenLen;
              } else {
                const rightStr = nextString.substring(closeParenOffset + 1, nextString.length);
                //this._logDEBUG('  --  rdsqs rightStr=[' + rightStr + '](' + lineStrOffset + ')');
                // record the right edge string
                tokenSet.push({
                  line: lineNumber,
                  startCharacter: lineStrOffset,
                  length: rightStr.length,
                  ptTokenType: "string",
                  ptTokenModifiers: ["quoted", "single"],
                });
                searchOffset = closeParenOffset + currStr.length + 1;
              }
            } else {
              this._logDEBUG("  --  rdsqs  ERROR missing close paren!");
              break; // no close paren?  get outta here...
            }
          }
        } else {
          const strOffset: number = line.indexOf(nextString, currentOffset);
          //this._logMessage('  -- str=(' + strOffset + ')[' + nextString + ']');
          tokenSet.push({
            line: lineNumber,
            startCharacter: strOffset,
            length: nextString.length,
            ptTokenType: "string",
            ptTokenModifiers: ["quoted", "single"],
          });
        }
        currentOffset += nextString.length + 1;
        nextStringOffset += nextString.length + 1;
      }
    } while (nextString.length > 0);

    return tokenSet;
  }

  private _getSingleQuotedString(currentOffset: number, searchText: string): string {
    let nextString: string = "";
    const stringStartOffset: number = searchText.indexOf("'", currentOffset);
    if (stringStartOffset != -1) {
      this._logDEBUG("  -- _getSingleQuotedString(" + currentOffset + ", [" + searchText + "])");
      const stringEndOffset: number = searchText.indexOf("'", stringStartOffset + 1);
      if (stringEndOffset != -1) {
        nextString = searchText.substring(stringStartOffset, stringEndOffset + 1);
      }
    }
    if (nextString.length > 0) {
      this._logDEBUG("  -- debug() gsqs nextString=[" + nextString + "](" + nextString.length + ")");
    }
    return nextString;
  }

  private _reportDebugDblQuoteStrings(lineNumber: number, line: string, debugStatementStr: string): IParsedToken[] {
    const tokenSet: IParsedToken[] = [];
    // find all strings in debug() statement but for now just do first...
    let currentOffset: number = line.indexOf(debugStatementStr);
    let nextStringOffset: number = 0;
    let nextString: string = "";
    do {
      nextString = this._getDoubleQuotedString(nextStringOffset, debugStatementStr);
      if (nextString.length > 0) {
        nextStringOffset = debugStatementStr.indexOf(nextString, nextStringOffset);
        const chrBackTic: string = "`";
        const bStringContainssBackTic: boolean = nextString.indexOf(chrBackTic) != -1;
        if (bStringContainssBackTic) {
          // add special handling for '`()' this case
          //this._logMessage('- BackTic nextString=[' + nextString + '] line=[' + line + ']');
          const chrCloseParen: string = ")";
          let searchOffset: number = 0; // value doesn't matter
          let lineStrOffset: number = line.indexOf(nextString, currentOffset);
          let backTicOffset: number = 0; // value doesn't matter
          while ((backTicOffset = nextString.indexOf(chrBackTic, searchOffset)) != -1) {
            const leftStr = nextString.substring(0, backTicOffset);
            // record the left edge string
            tokenSet.push({
              line: lineNumber,
              startCharacter: lineStrOffset,
              length: leftStr.length,
              ptTokenType: "string",
              ptTokenModifiers: ["quoted", "double"],
            });
            //this._logMessage('  -- leftStr=[' + leftStr + '] lineStrOffset=[' + lineStrOffset + ']');
            const closeParenOffset: number = nextString.indexOf(chrCloseParen, backTicOffset);
            //this._logMessage('  -- backTicOffset=[' + backTicOffset + '] closeParenOffset=[' + closeParenOffset + ']');
            if (closeParenOffset != -1) {
              searchOffset = closeParenOffset;
              const nextBackTicOffset: number = nextString.indexOf(chrBackTic, searchOffset);
              const currStrEndOffset: number = nextBackTicOffset != -1 ? nextBackTicOffset - 1 : nextString.length - 1;
              const rightStr = nextString.substring(closeParenOffset + 1, currStrEndOffset + 1);
              let rightStrOffset: number = lineStrOffset + closeParenOffset + 1;
              const leftOffset: number = closeParenOffset + 1;
              //this._logMessage('  -- rightStr=(' + rightStrOffset + ')[' + rightStr + '] leftOffset=[' + leftOffset + '] currStrEndOffset=[' + currStrEndOffset + ']');
              // record the right edge string
              tokenSet.push({
                line: lineNumber,
                startCharacter: rightStrOffset,
                length: rightStr.length,
                ptTokenType: "string",
                ptTokenModifiers: ["quoted", "double"],
              });
              searchOffset = closeParenOffset + leftStr.length + 1;
            } else {
              break; // no close paren?  get outta here...
            }
          }
        } else {
          const strOffset: number = line.indexOf(nextString, currentOffset);
          //this._logMessage('  -- str=(' + strOffset + ')[' + nextString + ']');
          tokenSet.push({
            line: lineNumber,
            startCharacter: strOffset,
            length: nextString.length,
            ptTokenType: "string",
            ptTokenModifiers: ["quoted", "double"],
          });
        }
        currentOffset += nextString.length + 1;
        nextStringOffset += nextString.length + 1;
      }
    } while (nextString.length > 0);

    return tokenSet;
  }

  private _getDoubleQuotedString(currentOffset: number, searchText: string): string {
    let nextString: string = "";
    const chrDoubleQuote: string = '"';
    const stringStartOffset: number = searchText.indexOf(chrDoubleQuote, currentOffset);
    if (stringStartOffset != -1) {
      this._logDEBUG("  -- _getDoubleQuotedString(" + currentOffset + ", [" + searchText + "])");
      const stringEndOffset: number = searchText.indexOf(chrDoubleQuote, stringStartOffset + 1);
      if (stringEndOffset != -1) {
        nextString = searchText.substring(stringStartOffset, stringEndOffset + 1);
      }
    }
    if (nextString.length > 0) {
      this._logDEBUG("  -- debug() gdqs nextString=[" + nextString + "](" + nextString.length + ")");
    }
    return nextString;
  }

  private _recordDisplayTypeForLine(displayType: string, lineNbr: number): void {
    //this._logMessage('  -- line#' + lineNbr + ', displayType=[' + displayType + ']');
    const newDirective: ISpin2Directive = {
      lineNumber: lineNbr,
      displayType: displayType,
      eDisplayType: this._getDebugDisplayType(displayType),
    };
    this._logMessage("=> Add DIRECTIVE: " + this._directiveString(newDirective));
    this.fileDirectives.push(newDirective);
  }

  private _getDisplayTypeForLine(lineNumber: number): eDebugDisplayType {
    let desiredType: eDebugDisplayType = eDebugDisplayType.Unknown;
    let maxLineBefore: number = 0;
    let desiredDirective: ISpin2Directive;
    for (let index = 0; index < this.fileDirectives.length; index++) {
      const currDirective: ISpin2Directive = this.fileDirectives[index];
      this._logMessage("  -- hunt:" + lineNumber + ", ln=" + currDirective.lineNumber + ", typ=" + currDirective.displayType + "(" + currDirective.eDisplayType + ")");
      if (currDirective.lineNumber <= lineNumber) {
        if (currDirective.lineNumber > maxLineBefore) {
          desiredDirective = currDirective;
          desiredType = currDirective.eDisplayType;
          maxLineBefore = currDirective.lineNumber;
        }
      }
    }
    if (desiredType != eDebugDisplayType.Unknown) {
      this._logMessage("  -- directive for line#" + lineNumber + ": " + desiredType);
    }
    return desiredType;
  }

  private spin2log: any = undefined;
  // adjust following true/false to show specific parsing debug
  private spin2DebugLogEnabled: boolean = false; // WARNING (REMOVE BEFORE FLIGHT)- change to 'false' - disable before commit
  private showSpinCode: boolean = true;
  private showCON: boolean = true;
  private showOBJ: boolean = true;
  private showDAT: boolean = true;
  private showVAR: boolean = true;
  private showDEBUG: boolean = true;
  private showPasmCode: boolean = true;
  private showState: boolean = true;
  private logTokenDiscover: boolean = true;

  private _logTokenSet(message: string): void {
    if (this.logTokenDiscover) {
      this._logMessage(message);
    }
  }

  private _logState(message: string): void {
    if (this.showState) {
      this._logMessage(message);
    }
  }

  private _logSPIN(message: string): void {
    if (this.showSpinCode) {
      this._logMessage(message);
    }
  }

  private _logCON(message: string): void {
    if (this.showCON) {
      this._logMessage(message);
    }
  }

  private _logVAR(message: string): void {
    if (this.showVAR) {
      this._logMessage(message);
    }
  }

  private _logDAT(message: string): void {
    if (this.showDAT) {
      this._logMessage(message);
    }
  }

  private _logOBJ(message: string): void {
    if (this.showOBJ) {
      this._logMessage(message);
    }
  }

  private _logPASM(message: string): void {
    if (this.showPasmCode) {
      this._logMessage(message);
    }
  }

  private _logMessage(message: string): void {
    if (this.spin2log != undefined) {
      //Write to output window.
      this.spin2log.appendLine(message);
    }
  }

  private _logDEBUG(message: string): void {
    if (this.showDEBUG) {
      this._logMessage(message);
    }
  }

  private _isSectionStartLine(line: string): {
    isSectionStart: boolean;
    inProgressStatus: eParseState;
  } {
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
        } else if (sectionName === "DAT") {
          inProgressState = eParseState.inDat;
        } else if (sectionName === "OBJ") {
          inProgressState = eParseState.inObj;
        } else if (sectionName === "PUB") {
          inProgressState = eParseState.inPub;
        } else if (sectionName === "PRI") {
          inProgressState = eParseState.inPri;
        } else if (sectionName === "VAR") {
          inProgressState = eParseState.inVar;
        } else {
          startStatus = false;
        }
      }
    }
    if (startStatus) {
      this._logMessage("** isSectStart line=[" + line + "]");
    }
    return {
      isSectionStart: startStatus,
      inProgressStatus: inProgressState,
    };
  }

  private _getNonInlineCommentLine(line: string): string {
    // NEW remove {comment} and {{comment}} single-line elements too
    let nonInlineCommentStr: string = line;
    // TODO: UNDONE make this into loop to find all single line {} or {{}} comments
    const startDoubleBraceOffset: number = nonInlineCommentStr.indexOf("{{");
    if (startDoubleBraceOffset != -1) {
      const endDoubleBraceOffset: number = nonInlineCommentStr.indexOf("}}", startDoubleBraceOffset + 2);
      if (endDoubleBraceOffset != -1) {
        // remove this comment
        const badElement = nonInlineCommentStr.substr(startDoubleBraceOffset, endDoubleBraceOffset - startDoubleBraceOffset + 1);
        //this._logMessage('  -- badElement=[' + badElement + ']');
        nonInlineCommentStr = nonInlineCommentStr.replace(badElement, " ".repeat(badElement.length));
      }
    }
    const startSingleBraceOffset: number = nonInlineCommentStr.indexOf("{");
    if (startSingleBraceOffset != -1) {
      const endSingleBraceOffset: number = nonInlineCommentStr.indexOf("}", startSingleBraceOffset + 1);
      if (endSingleBraceOffset != -1) {
        // remove this comment
        const badElement = nonInlineCommentStr.substr(startSingleBraceOffset, endSingleBraceOffset - startSingleBraceOffset + 1);
        //this._logMessage('  -- badElement=[' + badElement + ']');
        nonInlineCommentStr = nonInlineCommentStr.replace(badElement, " ".repeat(badElement.length));
      }
    }
    //if (nonInlineCommentStr.length != line.length) {
    //    this._logMessage('  -- NIC line [' + line + ']');
    //    this._logMessage('  --          [' + nonInlineCommentStr + ']');
    //}
    return nonInlineCommentStr;
  }

  private _getNonCommentLineReturnComment(lineNumber: number, startingOffset: number, line: string, tokenSet: IParsedToken[]): string {
    // skip Past Whitespace
    let currentOffset: number = this._skipWhite(line, startingOffset);
    const nonCommentLHSStr = this._getNonCommentLineRemainder(currentOffset, line);
    // now record the comment if we have one
    const commentRHSStrOffset: number = currentOffset + nonCommentLHSStr.length;
    const commentOffset: number = line.indexOf("'", commentRHSStrOffset);
    const bHaveDocComment: boolean = line.indexOf("''", commentOffset) != -1;
    if (commentOffset != -1 && !bHaveDocComment) {
      const newToken: IParsedToken = {
        line: lineNumber,
        startCharacter: commentOffset,
        length: line.length - commentOffset + 1,
        ptTokenType: "comment",
        ptTokenModifiers: ["line"],
      };
      tokenSet.push(newToken);
    }
    return nonCommentLHSStr;
  }

  private _getNonCommentLineRemainder(startingOffset: number, line: string): string {
    let nonCommentRHSStr: string = line;
    //this._logMessage('  -- gnclr ofs=' + startingOffset + '[' + line + '](' + line.length + ')');
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
          const nonStringLine: string = this._removeDoubleQuotedStrings(line, false); // false disabled debug output
          beginCommentOffset = nonStringLine.indexOf("'", currentOffset);
        }
      }
      if (beginCommentOffset === -1) {
        beginCommentOffset = line.indexOf("{", currentOffset);
      }
      const nonCommentEOL: number = beginCommentOffset != -1 ? beginCommentOffset - 1 : line.length - 1;
      //this._logMessage('- gnclr startingOffset=[' + startingOffset + '], currentOffset=[' + currentOffset + ']');
      nonCommentRHSStr = line.substr(currentOffset, nonCommentEOL - currentOffset + 1).trim();
      //this._logMessage('- gnclr nonCommentRHSStr=[' + startingOffset + ']');

      const singleLineMultiBeginOffset: number = nonCommentRHSStr.indexOf("{", currentOffset);
      if (singleLineMultiBeginOffset != -1) {
        const singleLineMultiEndOffset: number = nonCommentRHSStr.indexOf("}", singleLineMultiBeginOffset);
        if (singleLineMultiEndOffset != -1) {
          const oneLineMultiComment: string = nonCommentRHSStr.substr(singleLineMultiBeginOffset, singleLineMultiEndOffset - singleLineMultiBeginOffset + 1);
          nonCommentRHSStr = nonCommentRHSStr.replace(oneLineMultiComment, "").trim();
        }
      }
    } else if (line.length - startingOffset == 0) {
      nonCommentRHSStr = "";
    }
    //if (line.substr(startingOffset).length != nonCommentRHSStr.length) {
    //    this._logMessage('  -- NCLR line [' + line.substr(startingOffset) + ']');
    //    this._logMessage('  --           [' + nonCommentRHSStr + ']');
    //}
    return nonCommentRHSStr;
  }

  private _getDebugStatement(startingOffset: number, line: string): string {
    let currentOffset: number = this._skipWhite(line, startingOffset);
    let debugNonCommentStr: string = line;
    let openParenOffset: number = line.indexOf("(", currentOffset);
    let closeParenOffset: number = this._indexOfMatchingCloseParen(line, openParenOffset);
    if (line.length - startingOffset > 0 && openParenOffset != -1 && closeParenOffset != -1) {
      // have scope of debug line - remove trailing comment, trim it and return it
      let commentOffset: number = line.indexOf("'", closeParenOffset + 1);
      if (commentOffset != -1) {
        // have trailing comment remove it
        const nonCommentEOL: number = commentOffset != -1 ? commentOffset - 1 : line.length - 1;
        debugNonCommentStr = line.substring(currentOffset, nonCommentEOL).trim();
      } else {
        debugNonCommentStr = line.substring(currentOffset).trim();
      }
    } else if (line.length - startingOffset == 0 || openParenOffset == -1) {
      // if we don't have open paren - erase entire line
      debugNonCommentStr = "";
    }
    //if (line.length != debugNonCommentStr.length) {
    //    this._logMessage('  -- DS line [' + line.substring(startingOffset) + ']');
    //    this._logMessage('  --         [' + debugNonCommentStr + ']');
    //}
    return debugNonCommentStr;
  }

  private _indexOfMatchingCloseParen(line: string, openParenOffset: number): number {
    let desiredCloseOffset: number = -1;
    let nestingDepth: number = 1;
    for (let offset = openParenOffset + 1; offset < line.length; offset++) {
      if (line.substring(offset, offset + 1) == "(") {
        nestingDepth++;
      } else if (line.substring(offset, offset + 1) == ")") {
        nestingDepth--;
        if (nestingDepth == 0) {
          // we closed the inital open
          desiredCloseOffset = offset;
          break; // done, get outta here
        }
      }
    }
    // this._logMessage('  -- iomcp line=[' + line + ']');
    // this._logMessage('  --       open=(' + openParenOffset + '), close=(' + desiredCloseOffset + ')');
    return desiredCloseOffset;
  }

  private _getNonDocCommentLineRemainder(startingOffset: number, line: string): string {
    let nonDocCommentRHSStr: string = line;
    //this._logMessage('  -- gnclr ofs=' + startingOffset + '[' + line + '](' + line.length + ')');
    // TODO: UNDONE make this into loop to find first ' not in string
    if (line.length - startingOffset > 0) {
      const nonCommentEOL: number = line.length - 1;
      //this._logMessage('- gnclr startingOffset=[' + startingOffset + '], currentOffset=[' + currentOffset + ']');
      nonDocCommentRHSStr = line.substr(startingOffset, nonCommentEOL - startingOffset + 1).trim();
      //this._logMessage('- gnclr nonCommentRHSStr=[' + startingOffset + ']');

      const singleLineMultiBeginOffset: number = nonDocCommentRHSStr.indexOf("{", startingOffset);
      if (singleLineMultiBeginOffset != -1) {
        const singleLineMultiEndOffset: number = nonDocCommentRHSStr.indexOf("}", singleLineMultiBeginOffset);
        if (singleLineMultiEndOffset != -1) {
          const oneLineMultiComment: string = nonDocCommentRHSStr.substr(singleLineMultiBeginOffset, singleLineMultiEndOffset - singleLineMultiBeginOffset + 1);
          nonDocCommentRHSStr = nonDocCommentRHSStr.replace(oneLineMultiComment, "").trim();
        }
      }
    } else if (line.length - startingOffset == 0) {
      nonDocCommentRHSStr = "";
    }
    //if (line.substr(startingOffset).length != nonCommentRHSStr.length) {
    //    this._logMessage('  -- NCLR line [' + line.substr(startingOffset) + ']');
    //    this._logMessage('  --           [' + nonCommentRHSStr + ']');
    //}
    return nonDocCommentRHSStr;
  }

  private _getNonWhiteDataInitLineParts(line: string): string[] {
    const nonEqualsLine: string = this._removeDoubleQuotedStrings(line);
    let lineParts: string[] | null = nonEqualsLine.match(/[^ \t\,\[\]\(\)\+\-\/\<\>\|\*\@]+/g);
    if (lineParts === null) {
      lineParts = [];
    }
    return lineParts;
  }

  private _getNonWhiteCONLineParts(line: string): string[] {
    const nonEqualsLine: string = this._removeDoubleQuotedStrings(line);
    let lineParts: string[] | null = nonEqualsLine.match(/[^  \t\(\)\*\+\-\/\>\<\=]+/g);
    if (lineParts === null) {
      lineParts = [];
    }
    return lineParts;
  }

  private _getNonWhitePasmLineParts(line: string): string[] {
    const nonEqualsLine: string = this._removeDoubleQuotedStrings(line);
    let lineParts: string[] | null = nonEqualsLine.match(/[^ \t\,\(\)\[\]\<\>\=\?\:\!\^\+\*\&\|\-\\\#\@\/]+/g);
    if (lineParts === null) {
      lineParts = [];
    }
    return lineParts;
  }

  private _getNonWhiteSpinLineParts(line: string): IFilteredStrings {
    //                                     split(/[ \t\-\:\,\+\[\]\@\(\)\!\*\=\<\>\&\|\?\\\~\#\^\/]/);
    const nonEqualsLine: string = this._removeDoubleQuotedStrings(line);
    let lineParts: string[] | null = nonEqualsLine.match(/[^ \t\-\:\,\+\[\]\@\(\)\!\*\=\<\>\&\|\?\\\~\#\^\/]+/g);
    if (lineParts === null) {
      lineParts = [];
    }
    return {
      lineNoQuotes: nonEqualsLine,
      lineParts: lineParts,
    };
  }

  private _removeDoubleQuotedStrings(line: string, showDebug: boolean = true): string {
    //this._logMessage('- RQS line [' + line + ']');
    let trimmedLine: string = line;
    //this._logMessage('- RQS line [' + line + ']');
    const doubleQuote: string = '"';
    let quoteStartOffset: number = 0; // value doesn't matter
    let didRemove: boolean = false;
    while ((quoteStartOffset = trimmedLine.indexOf(doubleQuote)) != -1) {
      const quoteEndOffset: number = trimmedLine.indexOf(doubleQuote, quoteStartOffset + 1);
      //this._logMessage('  -- quoteStartOffset=[' + quoteStartOffset + '] quoteEndOffset=[' + quoteEndOffset + ']');
      if (quoteEndOffset != -1) {
        const badElement = trimmedLine.substr(quoteStartOffset, quoteEndOffset - quoteStartOffset + 1);
        //this._logMessage('  -- badElement=[' + badElement + ']');
        trimmedLine = trimmedLine.replace(badElement, "#".repeat(badElement.length));
        didRemove = showDebug ? true : false;
        //this._logMessage('-         post[' + trimmedLine + ']');
      } else {
        break; // we don't handle a single double-quote
      }
    }

    //if (didRemove) {
    //    this._logMessage('  -- RQS line [' + line + ']');
    //    this._logMessage('  --          [' + trimmedLine + ']');
    //}

    return trimmedLine;
  }

  private _getNonWhiteLineParts(line: string): string[] {
    let lineParts: string[] | null = line.match(/[^ \t]+/g);
    if (lineParts === null) {
      lineParts = [];
    }
    return lineParts;
  }

  private _removeDebugSingleQuotedStrings(line: string, showDebug: boolean = true): string {
    // remove single-quoted strings from keyword processing
    //  Ex #1:   ' a string '
    //  Ex #2:   ' a string up to [`(var)]
    //  Ex #3:   [)] a string after var'
    //  Ex #4:   [)] a string up to another [`(var)]
    //  Ex #5:   debug(`scope_xy xy size 200 range 1000 samples 200 dotsize 5 'Goertzel' `dly(#200))
    this._logMessage("- RQS line [" + line + "]");
    let trimmedLine: string = line;
    this._logMessage("  -- trim line [" + trimmedLine + "]");
    const chrSingleQuote: string = "'";
    const chrBackTic: string = "`";
    const chrOpenParen: string = "(";
    const chrCloseParen: string = ")";
    let didRemove: boolean = false;
    const firstOpenParenOffset: number = trimmedLine.indexOf(chrOpenParen, 0);
    // skip past tic-open pairs and their closes
    let nextBackTic: number = trimmedLine.indexOf(chrBackTic, 0);
    let secondsBackTic: number = trimmedLine.indexOf(chrBackTic, nextBackTic + 1);
    let lastCloseParenOffset: number = trimmedLine.indexOf(chrCloseParen, 0);
    // this._logMessage('  -- 1 nextBackTic=[' + nextBackTic + '] lastCloseParenOffset=[' + lastCloseParenOffset + ']');
    while (nextBackTic != -1) {
      // if we have another back-tic before any parens skip the first one it's only a debug term id marker
      if (secondsBackTic < lastCloseParenOffset) {
        nextBackTic = secondsBackTic;
        // this._logMessage('  -- 1b nextBackTic=[' + nextBackTic + '] lastCloseParenOffset=[' + lastCloseParenOffset + ']');
      }
      // if we have `( followed by ) then skip this close, look for next
      if (lastCloseParenOffset > nextBackTic) {
        // look for next close
        // this._logMessage('  -- SKIP backticOpenOffset=[' + nextBackTic + '] lastCloseParenOffset=[' + lastCloseParenOffset + ']');
        lastCloseParenOffset = trimmedLine.indexOf(chrCloseParen, lastCloseParenOffset + 1);
      }
      nextBackTic = trimmedLine.indexOf(chrBackTic, nextBackTic + 1);
    }
    // by now lastCloseParenOffset should point to end of statement within line
    let quoteStartOffset: number = trimmedLine.indexOf(chrSingleQuote, 0);
    // this._logMessage('  -- 2 quoteStartOffset=[' + quoteStartOffset + '] lastCloseParenOffset=[' + lastCloseParenOffset + ']');
    while (quoteStartOffset != -1) {
      let bHaveBackTic: boolean = false;
      const quoteEndOffset: number = trimmedLine.indexOf(chrSingleQuote, quoteStartOffset + 1);
      if (quoteEndOffset > lastCloseParenOffset) {
        break; // nothing beyond end of line please
      }
      this._logMessage("  -- quoteStartOffset=[" + quoteStartOffset + "] quoteEndOffset=[" + quoteEndOffset + "]");
      if (quoteEndOffset != -1) {
        // any more strings? on this line?
        let badElement: string = trimmedLine.substr(quoteStartOffset, quoteEndOffset - quoteStartOffset + 1);
        let backTicOffset: number = trimmedLine.indexOf(chrBackTic, quoteStartOffset);
        this._logMessage("  -- RdsQS backTicOffset=[" + backTicOffset + "], quoteEndOffset=[" + quoteEndOffset + "], badElement=[" + badElement + "]");
        if (backTicOffset != -1 && backTicOffset < quoteEndOffset) {
          bHaveBackTic = true;
          badElement = trimmedLine.substr(quoteStartOffset, backTicOffset - quoteStartOffset);
          if (badElement.length > 0) {
            // badElement = badElement.replace(chrBackTic, '');    // remove bacTicks
          }
          // this._logMessage('  -- RdsQS 2 backTicOffset=[' + backTicOffset + '], quoteEndOffset=[' + quoteEndOffset + '], badElement=[' + badElement + ']');
        }
        this._logMessage("  -- RdsQS badElement=[" + badElement + "]");
        trimmedLine = trimmedLine.replace(badElement, "#".repeat(badElement.length));
        didRemove = showDebug ? true : false;
        this._logMessage("  -- RdsQS post[" + trimmedLine + "]");
        // handle  #3 and #4 cases
        if (bHaveBackTic) {
          const closeParenOffset: number = trimmedLine.indexOf(chrCloseParen, backTicOffset + 1);
          // have case #2?
          backTicOffset = trimmedLine.indexOf(chrBackTic, closeParenOffset);
          if (backTicOffset != -1) {
            // we have another backtic, just return to top of loop
            quoteStartOffset = closeParenOffset + 1;
          } else if (closeParenOffset != -1) {
            // let's skip to triling string
            quoteStartOffset = closeParenOffset + 1;
            if (quoteStartOffset < quoteEndOffset) {
              badElement = trimmedLine.substr(quoteStartOffset, quoteEndOffset - quoteStartOffset + 1);
              //this._logMessage('  -- RdsQS rhs quoteStartOffset=[' + quoteStartOffset + '], quoteEndOffset=[' + quoteEndOffset + '], badElement=[' + badElement + ']');
              trimmedLine = trimmedLine.replace(badElement, "#".repeat(badElement.length));
              if (showDebug) {
                didRemove = true;
              }
              //this._logMessage('  -- RdsQS rhs post[' + trimmedLine + ']');
            }
            // finished this quote pair, find start of next possible pair
            quoteStartOffset = trimmedLine.indexOf(chrSingleQuote, quoteEndOffset + 1);
          }
        }
      } else {
        break; // we don't handle a single double-quote
      }
    }

    if (didRemove) {
      this._logMessage("  -- RdsQS line [" + line + "]");
      this._logMessage("  --            [" + trimmedLine + "]");
    }

    return trimmedLine;
  }

  private _getDebugNonWhiteLineParts(line: string): string[] {
    // remove douple and then any single quotes string from display list
    //this._logMessage('  -- gdnwlp raw-line [' + line + ']');
    const nonDblStringLine: string = this._removeDoubleQuotedStrings(line);
    this._logMessage("  -- gdnwlp nonDblStringLine=[" + nonDblStringLine + "]");
    const nonSglStringLine: string = this._removeDebugSingleQuotedStrings(nonDblStringLine, false);
    this._logMessage("  -- gdnwlp nonSglStringLine=[" + nonSglStringLine + "]");
    let lineParts: string[] | null = nonSglStringLine.match(/[^ ,@\[\]\+\-\*\/\<\>\t\(\)\!\?\~]+/g);
    //let lineParts: string[] | null = line.match(/[^ ,@\[\]\+\-\*\/\<\>\t\(\)]+/g);
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

  // -------------------------------------------------------------------------
  //  debug() display support

  private _setUserDebugDisplay(typeName: string, userName: string): void {
    //this._logTokenSet('  DBG _setUserDebugDisplay(' + typeName + ', ' + userName + ')');
    if (!this._isKnownDebugDisplay(userName)) {
      let eDisplayType: eDebugDisplayType = this._getDebugDisplayType(typeName);
      this.debugDisplays.set(userName.toLowerCase(), eDisplayType);
      this._logTokenSet("  -- NEW-DDsply " + userName.toLowerCase() + "=[" + eDisplayType + " : " + typeName.toLowerCase() + "]");
    } else {
      this._logMessage("ERROR: _setNewDebugDisplay() display exists [" + userName + "]");
    }
  }

  private _getUserDebugDisplayType(possibleUserName: string): eDebugDisplayType {
    let desiredType: eDebugDisplayType = eDebugDisplayType.Unknown;
    if (this._isKnownDebugDisplay(possibleUserName)) {
      const possibleType: eDebugDisplayType | undefined = this.debugDisplays.get(possibleUserName.toLowerCase());
      desiredType = possibleType || eDebugDisplayType.Unknown;
    }
    return desiredType;
  }

  private _getDebugDisplayType(typeName: string): eDebugDisplayType {
    let desiredType: eDebugDisplayType = eDebugDisplayType.Unknown;
    if (debugTypeForDisplay.has(typeName.toLowerCase())) {
      const possibleType: eDebugDisplayType | undefined = debugTypeForDisplay.get(typeName.toLowerCase());
      desiredType = possibleType || eDebugDisplayType.Unknown;
    }
    // this._logTokenSet('  DBG _getDebugDisplayType(' + typeName + ') = ' + desiredType);
    return desiredType;
  }

  private _isKnownDebugDisplay(possibleUserName: string): boolean {
    const foundStatus: boolean = this.debugDisplays.has(possibleUserName.toLowerCase());
    //this._logTokenSet('  DBG _isKnownDebugDisplay(' + possibleUserName + ') = ' + foundStatus);
    return foundStatus;
  }

  // -------------------------------------------------------------------------
  // global/local/localPasm name token handling...

  private _isKnownToken(tokenName: string): boolean {
    const foundStatus: boolean = this._isGlobalToken(tokenName) || this._isLocalToken(tokenName) || this._isLocalPasmToken(tokenName) ? true : false;
    return foundStatus;
  }

  private _isGlobalToken(tokenName: string): boolean {
    const foundStatus: boolean = this.globalTokens.has(tokenName.toLowerCase());
    return foundStatus;
  }

  private _setGlobalToken(tokenName: string, token: RememberedToken): void {
    if (!this._isGlobalToken(tokenName)) {
      this._logTokenSet("  -- NEW-gTOK " + this._rememberdTokenString(tokenName, token));
      this.globalTokens.set(tokenName.toLowerCase(), token);
    }
  }

  private _getGlobalToken(tokenName: string): RememberedToken | undefined {
    var desiredToken: RememberedToken | undefined = this.globalTokens.get(tokenName.toLowerCase());
    if (desiredToken != undefined) {
      // let's never return a declaration modifier! (somehow declaration creeps in to our list!??)
      let modifiersNoDecl: string[] = this._modifiersWithout(desiredToken.modifiers, "declaration");
      desiredToken = new RememberedToken(desiredToken.type, modifiersNoDecl);
    }
    return desiredToken;
  }

  private _isLocalToken(tokenName: string): boolean {
    const foundStatus: boolean = this.localTokens.has(tokenName.toLowerCase());
    return foundStatus;
  }

  private _setLocalToken(tokenName: string, token: RememberedToken): void {
    if (!this._isLocalToken(tokenName)) {
      this._logTokenSet("  -- NEW-lTOK " + this._rememberdTokenString(tokenName, token));
      this.localTokens.set(tokenName.toLowerCase(), token);
    }
  }

  private _getLocalToken(tokenName: string): RememberedToken | undefined {
    const desiredToken: RememberedToken | undefined = this.localTokens.get(tokenName.toLowerCase());
    if (desiredToken != undefined) {
      this._logOBJ("  -- FND-lTOK " + this._rememberdTokenString(tokenName, desiredToken));
    }
    return desiredToken;
  }

  private _getLocalPasmTokensMap(methodName: string): Map<string, RememberedToken> {
    // get our exiting list, or make a new empty list and return it
    const desiredMethodNameKey = methodName.toLowerCase();
    let desiredMap: Map<string, RememberedToken> | undefined = this.localPasmTokensByMethodName.get(desiredMethodNameKey);
    if (desiredMap == undefined) {
      desiredMap = new Map<string, RememberedToken>();
      this.localPasmTokensByMethodName.set(desiredMethodNameKey, desiredMap);
    }
    return desiredMap;
  }

  // -------------------------------------------------------------------------
  // method-scoped name token handling...

  private _isLocalPasmTokenListForMethod(methodName: string): boolean {
    let mapExistsStatus: boolean = true;
    const desiredMethodNameKey = methodName.toLowerCase();
    let desiredMap: Map<string, RememberedToken> | undefined = this.localPasmTokensByMethodName.get(desiredMethodNameKey);
    if (desiredMap == undefined) {
      mapExistsStatus = false;
    }
    return mapExistsStatus;
  }

  private _isLocalPasmToken(tokenName: string): boolean {
    let tokenExistsStatus: boolean = false;
    for (let methodName of this.localPasmTokensByMethodName.keys()) {
      if (this._isLocalPasmTokenForMethod(methodName, tokenName)) {
        tokenExistsStatus = true;
        break;
      }
    }
    return tokenExistsStatus;
  }

  private _isLocalPasmTokenForMethod(methodName: string, tokenName: string): boolean {
    let foundStatus: boolean = false;
    if (this._isLocalPasmTokenListForMethod(methodName)) {
      const methodLocalTokens = this._getLocalPasmTokensMap(methodName);
      const desiredNameKey = tokenName.toLowerCase();
      foundStatus = methodLocalTokens.has(desiredNameKey);
    }
    return foundStatus;
  }

  private _setLocalPasmTokenForMethod(methodName: string, tokenName: string, token: RememberedToken): void {
    const methodLocalTokens = this._getLocalPasmTokensMap(methodName);
    const desiredNameKey = tokenName.toLowerCase();
    if (!methodLocalTokens.has(desiredNameKey)) {
      this._logTokenSet("  -- NEW-lpTOK " + tokenName + "=[" + token.type + "[" + token.modifiers + "]]");
      methodLocalTokens.set(desiredNameKey, token);
    }
  }

  private _getLocalPasmTokenForMethod(methodName: string, tokenName: string): RememberedToken | undefined {
    let desiredToken: RememberedToken | undefined = undefined;
    if (this._isLocalPasmTokenListForMethod(methodName)) {
      const methodLocalTokens = this._getLocalPasmTokensMap(methodName);
      const desiredNameKey = tokenName.toLowerCase();
      desiredToken = methodLocalTokens.get(desiredNameKey);
    }
    return desiredToken;
  }

  // -------------------------------------------------------------------------
  // variable modifier fix ups

  private _modifiersWith(initialModifiers: string[], newModifier: string): string[] {
    // add modification attribute
    var updatedModifiers: string[] = initialModifiers;
    if (!updatedModifiers.includes(newModifier)) {
      updatedModifiers.push(newModifier);
    }
    return updatedModifiers;
  }

  private _modifiersWithout(initialModifiers: string[], unwantedModifier: string): string[] {
    //  remove modification attribute
    var updatedModifiers: string[] = [];
    for (var idx = 0; idx < initialModifiers.length; idx++) {
      var possModifier: string = initialModifiers[idx];
      if (possModifier !== unwantedModifier) {
        updatedModifiers.push(possModifier);
      }
    }
    return updatedModifiers;
  }

  // -------------------------------------------------------------------------
  // keyword checks
  private _isBuiltinReservedWord(name: string): boolean {
    // streamer constants, smart-pin constants
    const builtinNamesOfNote: string[] = [
      // streamer names
      "x_16p_2dac8_wfword",
      "x_16p_4dac4_wfword",
      "x_1adc8_0p_1dac8_wfbyte",
      "x_1adc8_8p_2dac8_wfword",
      "x_1p_1dac1_wfbyte",
      "x_2adc8_0p_2dac8_wfword",
      "x_2adc8_16p_4dac8_wflong",
      "x_2p_1dac2_wfbyte",
      "x_2p_2dac1_wfbyte",
      "x_32p_4dac8_wflong",
      "x_4adc8_0p_4dac8_wflong",
      "x_4p_1dac4_wfbyte",
      "x_4p_2dac2_wfbyte",
      "x_4p_4dac1_wfbyte",
      "x_8p_1dac8_wfbyte",
      "x_8p_2dac4_wfbyte",
      "x_8p_4dac2_wfbyte",
      "x_alt_off",
      "x_alt_on",
      "x_dacs_0n0_0n0",
      "x_dacs_0n0_x_x",
      "x_dacs_0_0_0_0",
      "x_dacs_0_0_x_x",
      "x_dacs_0_x_x_x",
      "x_dacs_1n1_0n0",
      "x_dacs_1_0_1_0",
      "x_dacs_1_0_x_x",
      "x_dacs_3_2_1_0",
      "x_dacs_off",
      "x_dacs_x_0_x_x",
      "x_dacs_x_x_0n0",
      "x_dacs_x_x_0_0",
      "x_dacs_x_x_0_x",
      "x_dacs_x_x_1_0",
      "x_dacs_x_x_x_0",
      "x_dds_goertzel_sinc1",
      "x_dds_goertzel_sinc2",
      "x_imm_16x2_1dac2",
      "x_imm_16x2_2dac1",
      "x_imm_16x2_lut",
      "x_imm_1x32_4dac8",
      "x_imm_2x16_2dac8",
      "x_imm_2x16_4dac4",
      "x_imm_32x1_1dac1",
      "x_imm_32x1_lut",
      "x_imm_4x8_1dac8",
      "x_imm_4x8_2dac4",
      "x_imm_4x8_4dac2",
      "x_imm_4x8_lut",
      "x_imm_8x4_1dac4",
      "x_imm_8x4_2dac2",
      "x_imm_8x4_4dac1",
      "x_imm_8x4_lut",
      "x_pins_off",
      "x_pins_on",
      "x_rfbyte_1p_1dac1",
      "x_rfbyte_2p_1dac2",
      "x_rfbyte_2p_2dac1",
      "x_rfbyte_4p_1dac4",
      "x_rfbyte_4p_2dac2",
      "x_rfbyte_4p_4dac1",
      "x_rfbyte_8p_1dac8",
      "x_rfbyte_8p_2dac4",
      "x_rfbyte_8p_4dac2",
      "x_rfbyte_luma8",
      "x_rfbyte_rgb8",
      "x_rfbyte_rgbi8",
      "x_rflong_16x2_lut",
      "x_rflong_32p_4dac8",
      "x_rflong_32x1_lut",
      "x_rflong_4x8_lut",
      "x_rflong_8x4_lut",
      "x_rflong_rgb24",
      "x_rfword_16p_2dac8",
      "x_rfword_16p_4dac4",
      "x_rfword_rgb16",
      "x_write_off",
      "x_write_on",
      // smart pin names
      "p_adc",
      "p_adc_100x",
      "p_adc_10x",
      "p_adc_1x",
      "p_adc_30x",
      "p_adc_3x",
      "p_adc_ext",
      "p_adc_float",
      "p_adc_gio",
      "p_adc_scope",
      "p_adc_vio",
      "p_async_io",
      "p_async_rx",
      "p_async_tx",
      "p_bitdac",
      "p_channel",
      "p_compare_ab",
      "p_compare_ab_fb",
      "p_counter_highs",
      "p_counter_periods",
      "p_counter_ticks",
      "p_count_highs",
      "p_count_rises",
      "p_dac_124r_3v",
      "p_dac_600r_2v",
      "p_dac_75r_2v",
      "p_dac_990r_3v",
      "p_dac_dither_pwm",
      "p_dac_dither_rnd",
      "p_dac_noise",
      "p_events_ticks",
      "p_high_100ua",
      "p_high_10ua",
      "p_high_150k",
      "p_high_15k",
      "p_high_1k5",
      "p_high_1ma",
      "p_high_fast",
      "p_high_float",
      "p_high_ticks",
      "p_invert_a",
      "p_invert_b",
      "p_invert_in",
      "p_invert_output",
      "p_level_a",
      "p_level_a_fbn",
      "p_level_a_fbp",
      "p_local_a",
      "p_local_b",
      "p_logic_a",
      "p_logic_a_fb",
      "p_logic_b_fb",
      "p_low_100ua",
      "p_low_10ua",
      "p_low_150k",
      "p_low_15k",
      "p_low_1k5",
      "p_low_1ma",
      "p_low_fast",
      "p_low_float",
      "p_minus1_a",
      "p_minus1_b",
      "p_minus2_a",
      "p_minus2_b",
      "p_minus3_a",
      "p_minus3_b",
      "p_nco_duty",
      "p_nco_freq",
      "p_normal",
      "p_oe",
      "p_outbit_a",
      "p_outbit_b",
      "p_periods_highs",
      "p_periods_ticks",
      "p_plus1_a",
      "p_plus1_b",
      "p_plus2_a",
      "p_plus2_b",
      "p_plus3_a",
      "p_plus3_b",
      "p_pulse",
      "p_pwm_sawtooth",
      "p_pwm_smps",
      "p_pwm_triangle",
      "p_quadrature",
      "p_reg_down",
      "p_reg_up",
      "p_repository",
      "p_schmitt_a",
      "p_schmitt_a_fb",
      "p_schmitt_b_fb",
      "p_state_ticks",
      "p_sync_io",
      "p_sync_rx",
      "p_sync_tx",
      "p_transition",
      "p_true_a",
      "p_true_b",
      "p_true_in",
      "p_true_output",
      "p_tt_00",
      "p_tt_01",
      "p_tt_10",
      "p_tt_11",
      "p_usb_pair",
      // event names
      "event_atn",
      "event_ct1",
      "event_ct2",
      "event_ct3",
      "event_fbw",
      "event_int",
      "event_pat",
      "event_qmt",
      "event_se1",
      "event_se2",
      "event_se3",
      "event_se4",
      "event_xfi",
      "event_xmt",
      "event_xrl",
      "event_xro",
      //
      "pr0",
      "pr1",
      "pr2",
      "pr3",
      "pr4",
      "pr5",
      "pr6",
      "pr7",
      "ijmp1",
      "ijmp2",
      "ijmp3",
      "iret1",
      "iret2",
      "iret3",
      "pa",
      "pb",
      "ptra",
      "ptrb",
      "dira",
      "dirb",
      "outa",
      "outb",
      "ina",
      "inb",
    ];
    const reservedStatus: boolean = builtinNamesOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  private _isDebugMethod(name: string): boolean {
    const debugMethodOfNote: string[] = [
      "zstr",
      "lstr",
      "udec",
      "udec_byte",
      "udec_word",
      "udec_long",
      "udec_reg_array",
      "udec_byte_array",
      "udec_word_array",
      "udec_long_array",
      "sdec",
      "sdec_byte",
      "sdec_word",
      "sdec_long",
      "sdec_reg_array",
      "sdec_byte_array",
      "sdec_word_array",
      "sdec_long_array",
      "uhex",
      "uhex_byte",
      "uhex_word",
      "uhex_long",
      "uhex_reg_array",
      "uhex_byte_array",
      "uhex_word_array",
      "uhex_long_array",
      "shex",
      "shex_byte",
      "shex_word",
      "shex_long",
      "shex_reg_array",
      "shex_byte_array",
      "shex_word_array",
      "shex_long_array",
      "ubin",
      "ubin_byte",
      "ubin_word",
      "ubin_long",
      "ubin_reg_array",
      "ubin_byte_array",
      "ubin_word_array",
      "ubin_long_array",
      "sbin",
      "sbin_byte",
      "sbin_word",
      "sbin_long",
      "sbin_reg_array",
      "sbin_byte_array",
      "sbin_word_array",
      "sbin_long_array",
      "fdec",
      "fdec_array",
      "fdec_reg_array",
      "dly",
      "pc_key",
      "pc_mouse",
      "if",
      "ifnot",
    ];
    const searchName: string = name.endsWith("_") ? name.substr(0, name.length - 1) : name;
    const reservedStatus: boolean = debugMethodOfNote.indexOf(searchName.toLowerCase()) != -1;
    return reservedStatus;
  }

  private _isDebugInvocation(name: string): boolean {
    const debugExec: string[] = [
      // debug overridable CONSTANTS
      "debug_main",
      "debug_coginit",
      "debug",
    ];
    const reservedStatus: boolean = debugExec.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  private _isDebugSymbol(name: string): boolean {
    const debugSymbolOfNote: string[] = [
      // debug overridable CONSTANTS
      "download_baud",
      "debug_cogs",
      "debug_delay",
      "debug_pin_tx",
      "debug_pin_rx",
      "debug_baud",
      "debug_timestamp",
      "debug_log_size",
      "debug_left",
      "debug_top",
      "debug_width",
      "debug_height",
      "debug_display_left",
      "debug_display_top",
      "debug_windows_off",
    ];
    const searchName: string = name.endsWith("_") ? name.substr(0, name.length - 1) : name;
    const reservedStatus: boolean = debugSymbolOfNote.indexOf(searchName.toLowerCase()) != -1;
    return reservedStatus;
  }

  private _isSpinBuiltInVariable(name: string): boolean {
    const spinVariablesOfNote: string[] = [
      "clkmode",
      "clkfreq",
      "varbase",
      "pr0",
      "pr1",
      "pr2",
      "pr3",
      "pr4",
      "pr5",
      "pr6",
      "pr7",
      "ijmp1",
      "ijmp2",
      "ijmp3",
      "iret1",
      "iret2",
      "iret3",
      "pa",
      "pb",
      "ptra",
      "ptrb",
      "dira",
      "dirb",
      "outa",
      "outb",
      "ina",
      "inb",
    ];
    let reservedStatus: boolean = spinVariablesOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  private _isSpinReservedWord(name: string): boolean {
    const spinInstructionsOfNote: string[] = [
      "reg",
      "float",
      "round",
      "trunc",
      "nan",
      "clkmode",
      "clkfreq",
      "varbase",
      "clkmode_",
      "clkfreq_",
      "if",
      "ifnot",
      "elseif",
      "elseifnot",
      "else",
      "while",
      "repeat",
      "until",
      "from",
      "to",
      "step",
      "next",
      "quit",
      "case",
      "case_fast",
      "other",
      "abort",
      "return",
      "true",
      "false",
      "posx",
      "negx",
      "pi",
    ];
    let reservedStatus: boolean = spinInstructionsOfNote.indexOf(name.toLowerCase()) != -1;
    if (reservedStatus == false) {
      reservedStatus = this._isBinaryOperator(name);
    }
    if (reservedStatus == false) {
      reservedStatus = this._isUnaryOperator(name);
    }
    return reservedStatus;
  }
  private _isCoginitReservedSymbol(name: string): boolean {
    const coginitSymbolOfNote: string[] = [
      //
      "newcog",
      "cogexec",
      "hubexec",
      "cogexec_new",
      "hubexec_new",
      "cogexec_new_pair",
      "hubexec_new_pair",
    ];
    const reservedStatus: boolean = coginitSymbolOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  private _isBinaryOperator(name: string): boolean {
    const binaryOperationsOfNote: string[] = ["sar", "ror", "rol", "rev", "zerox", "signx", "sca", "scas", "frac", "addbits", "addpins", "and", "or", "xor"];
    const reservedStatus: boolean = binaryOperationsOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  private _isUnaryOperator(name: string): boolean {
    const unaryOperationsOfNote: string[] = ["not", "abs", "fabs", "encod", "decod", "bmask", "ones", "sqrt", "fsqrt", "qlog", "qexp"];
    const reservedStatus: boolean = unaryOperationsOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  private _isFloatConversion(name: string): boolean {
    const floatConversionOfNote: string[] = ["float", "round", "trunc"];
    const reservedStatus: boolean = floatConversionOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  private _isPasmModczOperand(name: string): boolean {
    const pasmModczOperand: string[] = [
      "_clr",
      "_nc_and_nz",
      "_nz_and_nc",
      " _gt",
      "_nc_and_z",
      "_z_and_nc",
      "_nc",
      "_ge",
      "_c_and_nz",
      "_nz_and_c",
      "_nz",
      "_ne",
      "_c_ne_z",
      "_z_ne_c",
      "_nc_or_nz",
      "_nz_or_nc",
      "_c_and_z",
      "_z_and_c",
      "_c_eq_z",
      "_z_eq_c",
      "_z",
      "_e",
      "_nc_or_z",
      "_z_or_nc",
      "_c",
      "_lt",
      "_c_or_nz",
      "_nz_or_c",
      "_c_or_z",
      "_z_or_c",
      "_le",
      "_set",
    ];
    const reservedStatus: boolean = pasmModczOperand.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  private _isSpinBuiltinMethod(name: string): boolean {
    const spinMethodNames: string[] = [
      "akpin",
      "bytefill",
      "bytemove",
      "call",
      "clkset",
      "cogatn",
      "cogchk",
      "cogid",
      "coginit",
      "cogspin",
      "cogstop",
      "getct",
      "getcrc",
      "getregs",
      "getrnd",
      "getsec",
      "getms",
      "hubset",
      "lockchk",
      "locknew",
      "lockrel",
      "lockret",
      "locktry",
      "longfill",
      "longmove",
      "lookdown",
      "lookdownz",
      "lookup",
      "lookupz",
      "muldiv64",
      "pinclear",
      "pinf",
      "pinfloat",
      "pinh",
      "pinhigh",
      "pinl",
      "pinlow",
      "pinr",
      "pinread",
      "pinstart",
      "pint",
      "pintoggle",
      "pinw",
      "pinwrite",
      "pollatn",
      "pollct",
      "polxy",
      "rdpin",
      "recv",
      "regexec",
      "regload",
      "rotxy",
      "rqpin",
      "send",
      "setregs",
      "strcomp",
      "strcopy",
      "string",
      "strsize",
      "waitatn",
      "waitct",
      "waitms",
      "waitus",
      "wordfill",
      "wordmove",
      "wrpin",
      "wxpin",
      "wypin",
      "xypol",
      "qsin",
      "qcos",
    ];
    const reservedStatus: boolean = spinMethodNames.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  private _isReservedPasmSymbols(name: string): boolean {
    const reservedPasmSymbolNames: string[] = ["org", "orgf", "orgh", "fit", "end"];
    const reservedStatus: boolean = reservedPasmSymbolNames.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  private _isPasmReservedWord(name: string): boolean {
    const pasmReservedswordsOfNote: string[] = [
      "ijmp1",
      "ijmp2",
      "ijmp3",
      "iret1",
      "iret2",
      "iret3",
      "ptra",
      "ptrb",
      "addpins",
      "clkfreq_",
      "pa",
      "pb",
      "clkfreq",
      "_clkfreq",
      "round",
      "float",
      "trunc",
      "dira",
      "dirb",
      "ina",
      "inb",
      "outa",
      "outb",
      "fvar",
      "fvars",
      "addbits",
      "true",
      "false",
    ];
    const reservedStatus: boolean = pasmReservedswordsOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  private _isPasmInstruction(name: string): boolean {
    const pasmInstructions: string[] = [
      "abs",
      "add",
      "addct1",
      "addct2",
      "addct3",
      "addpix",
      "adds",
      "addsx",
      "addx",
      "akpin",
      "allowi",
      "altb",
      "altd",
      "altgb",
      "altgn",
      "altgw",
      "alti",
      "altr",
      "alts",
      "altsb",
      "altsn",
      "altsw",
      "and",
      "andn",
      "augd",
      "augs",
      "bitc",
      "bith",
      "bitl",
      "bitnc",
      "bitnot",
      "bitnz",
      "bitrnd",
      "bitz",
      "blnpix",
      "bmask",
      "brk",
      "call",
      "calla",
      "callb",
      "calld",
      "callpa",
      "callpb",
      "cmp",
      "cmpm",
      "cmpr",
      "cmps",
      "cmpsub",
      "cmpsx",
      "cmpx",
      "cogatn",
      "cogbrk",
      "cogid",
      "coginit",
      "cogstop",
      "crcbit",
      "crcnib",
      "decmod",
      "decod",
      "dirc",
      "dirh",
      "dirl",
      "dirnc",
      "dirnot",
      "dirnz",
      "dirrnd",
      "dirz",
      "djf",
      "djnf",
      "djnz",
      "djz",
      "drvc",
      "drvh",
      "drvl",
      "drvnc",
      "drvnot",
      "drvnz",
      "drvrnd",
      "drvz",
      "encod",
      "execf",
      "fblock",
      "fge",
      "fges",
      "fle",
      "fles",
      "fltc",
      "flth",
      "fltl",
      "fltnc",
      "fltnot",
      "fltnz",
      "fltrnd",
      "fltz",
      "getbrk",
      "getbyte",
      "getbyte",
      "getct",
      "getnib",
      "getptr",
      "getqx",
      "getqy",
      "getrnd",
      "getrnd",
      "getscp",
      "getword",
      "getword",
      "getxacc",
      "hubset",
      "ijnz",
      "ijz",
      "incmod",
      "jatn",
      "jct1",
      "jct2",
      "jct3",
      "jfbw",
      "jint",
      "jmp",
      "jmprel",
      "jnatn",
      "jnct1",
      "jnct2",
      "jnct3",
      "jnfbw",
      "jnint",
      "jnpat",
      "jnqmt",
      "jnse1",
      "jnse2",
      "jnse3",
      "jnse4",
      "jnxfi",
      "jnxmt",
      "jnxrl",
      "jnxro",
      "jpat",
      "jqmt",
      "jse1",
      "jse2",
      "jse3",
      "jse4",
      "jxfi",
      "jxmt",
      "jxrl",
      "jxro",
      "loc",
      "locknew",
      "lockrel",
      "lockret",
      "locktry",
      "mergeb",
      "mergew",
      "mixpix",
      "modc",
      "modcz",
      "modz",
      "mov",
      "movbyts",
      "mul",
      "mulpix",
      "muls",
      "muxc",
      "muxnc",
      "muxnibs",
      "muxnits",
      "muxnz",
      "muxq",
      "muxz",
      "neg",
      "negc",
      "negnc",
      "negnz",
      "negz",
      "nixint1",
      "nixint2",
      "nixint3",
      "nop",
      "not",
      "ones",
      "or",
      "outc",
      "outh",
      "outl",
      "outnc",
      "outnot",
      "outnz",
      "outrnd",
      "outz",
      "pollatn",
      "pollct1",
      "pollct2",
      "pollct3",
      "pollfbw",
      "pollint",
      "pollpat",
      "pollqmt",
      "pollse1",
      "pollse2",
      "pollse3",
      "pollse4",
      "pollxfi",
      "pollxmt",
      "pollxrl",
      "pollxro",
      "pop",
      "popa",
      "popb",
      "push",
      "pusha",
      "pushb",
      "qdiv",
      "qexp",
      "qfrac",
      "qlog",
      "qmul",
      "qrotate",
      "qsqrt",
      "qvector",
      "rcl",
      "rcr",
      "rczl",
      "rczr",
      "rdbyte",
      "rdfast",
      "rdlong",
      "rdlut",
      "rdpin",
      "rdword",
      "rep",
      "resi0",
      "resi1",
      "resi2",
      "resi3",
      "ret",
      "reta",
      "retb",
      "reti0",
      "reti1",
      "reti2",
      "reti3",
      "rev",
      "rfbyte",
      "rflong",
      "rfvar",
      "rfvars",
      "rfword",
      "rgbexp",
      "rgbsqz",
      "rol",
      "rolbyte",
      "rolbyte",
      "rolnib",
      "rolword",
      "rolword",
      "ror",
      "rqpin",
      "sal",
      "sar",
      "sca",
      "scas",
      "setbyte",
      "setcfrq",
      "setci",
      "setcmod",
      "setcq",
      "setcy",
      "setd",
      "setdacs",
      "setint1",
      "setint2",
      "setint3",
      "setluts",
      "setnib",
      "setpat",
      "setpiv",
      "setpix",
      "setq",
      "setq2",
      "setr",
      "sets",
      "setscp",
      "setse1",
      "setse2",
      "setse3",
      "setse4",
      "setword",
      "setxfrq",
      "seussf",
      "seussr",
      "shl",
      "shr",
      "signx",
      "skip",
      "skipf",
      "splitb",
      "splitw",
      "stalli",
      "sub",
      "subr",
      "subs",
      "subsx",
      "subx",
      "sumc",
      "sumnc",
      "sumnz",
      "sumz",
      "test",
      "testb",
      "testbn",
      "testn",
      "testp",
      "testpn",
      "tjf",
      "tjnf",
      "tjns",
      "tjnz",
      "tjs",
      "tjv",
      "tjz",
      "trgint1",
      "trgint2",
      "trgint3",
      "waitatn",
      "waitct1",
      "waitct2",
      "waitct3",
      "waitfbw",
      "waitint",
      "waitpat",
      "waitse1",
      "waitse2",
      "waitse3",
      "waitse4",
      "waitx",
      "waitxfi",
      "waitxmt",
      "waitxrl",
      "waitxro",
      "wfbyte",
      "wflong",
      "wfword",
      "wmlong",
      "wrbyte",
      "wrc",
      "wrfast",
      "wrlong",
      "wrlut",
      "wrnc",
      "wrnz",
      "wrpin",
      "wrword",
      "wrz",
      "wxpin",
      "wypin",
      "xcont",
      "xinit",
      "xor",
      "xoro32",
      "xstop",
      "xzero",
      "zerox",
    ];
    const instructionStatus: boolean = pasmInstructions.indexOf(name.toLowerCase()) != -1;
    return instructionStatus;
  }

  private _isPasmNonArgumentInstruction(name: string): boolean {
    const pasmNonArgumentInstructions: string[] = [
      "nop",
      "resi3",
      "resi2",
      "resi1",
      "resi0",
      "reti3",
      "reti2",
      "reti1",
      "reti0",
      "xstop",
      "allowi",
      "stalli",
      "trgint1",
      "trgint2",
      "trgint3",
      "nixint1",
      "nixint2",
      "nixint3",
      "ret",
      "reta",
      "retb",
      "pollint",
      "pollct1",
      "pollct2",
      "pollct3",
      "pollse1",
      "pollse2",
      "pollse3",
      "pollse4",
      "pollpat",
      "pollfbw",
      "pollxmt",
      "pollxfi",
      "pollxro",
      "pollxrl",
      "pollatn",
      "pollqmt",
      "waitint",
      "waitct1",
      "waitct2",
      "waitct3",
      "waitse1",
      "waitse2",
      "waitse3",
      "waitse4",
      "waitpat",
      "waitfbw",
      "waitxmt",
      "waitxfi",
      "waitxro",
      "waitxrl",
      "waitatn",
    ];
    const instructionStatus: boolean = pasmNonArgumentInstructions.indexOf(name.toLowerCase()) != -1;
    return instructionStatus;
  }

  private _isIllegalInlinePasmDirective(name: string): boolean {
    const illegalInlinePasmDirective: string[] = ["alignw", "alignl", "file", "orgh"];
    const illegalStatus: boolean = illegalInlinePasmDirective.indexOf(name.toLowerCase()) != -1;
    return illegalStatus;
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
      if (
        checkType == "WC" ||
        checkType == "WZ" ||
        checkType == "WCZ" ||
        checkType == "XORC" ||
        checkType == "XORZ" ||
        checkType == "ORC" ||
        checkType == "ORZ" ||
        checkType == "ANDC" ||
        checkType == "ANDZ"
      ) {
        returnStatus = true;
      }
    }
    return returnStatus;
  }

  private _isDatOrPasmLabel(name: string): boolean {
    let haveLabelStatus: boolean = name.substr(0, 1).match(/[a-zA-Z_\.\:]/) ? true : false;
    if (haveLabelStatus) {
      if (this._isDatNFileStorageType(name)) {
        haveLabelStatus = false;
      } else if (name.toLowerCase() == "dat") {
        haveLabelStatus = false;
      } else if (this._isReservedPasmSymbols(name)) {
        haveLabelStatus = false;
      } else if (name.toUpperCase().startsWith("IF_") || name.toUpperCase() == "_RET_") {
        haveLabelStatus = false;
      } else if (this._isPasmConditional(name)) {
        haveLabelStatus = false;
      } else if (this._isIllegalInlinePasmDirective(name)) {
        haveLabelStatus = false;
      } else if (this._isPasmInstruction(name)) {
        haveLabelStatus = false;
      } else if (this._isPasmNonArgumentInstruction(name)) {
        haveLabelStatus = false;
      }
    }
    return haveLabelStatus;
  }

  private _isDatNFileStorageType(name: string): boolean {
    let returnStatus: boolean = false;
    if (name.length > 2) {
      const checkType: string = name.toUpperCase();
      // yeah, FILE too!  (oddly enough)
      if (checkType == "FILE") {
        returnStatus = true;
      } else {
        returnStatus = this._isDatStorageType(name);
      }
    }
    return returnStatus;
  }

  private _isDatStorageType(name: string): boolean {
    let returnStatus: boolean = false;
    if (name.length > 2) {
      const checkType: string = name.toUpperCase();
      if (checkType == "RES") {
        returnStatus = true;
      } else {
        returnStatus = this._isStorageType(name);
      }
    }
    return returnStatus;
  }

  private _isStorageType(name: string): boolean {
    let returnStatus: boolean = false;
    if (name.length > 3) {
      const checkType: string = name.toUpperCase();
      if (checkType == "BYTEFIT" || checkType == "WORDFIT" || checkType == "BYTE" || checkType == "WORD" || checkType == "LONG") {
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

  // ---------------- new deug() support ----------------
  //  updated: 26 Mar 2022  - (as of Spin2 v35s)
  //  debug() statements for special displays support the following
  //    plot      - General-purpose plotter with cartesian and polar modes
  //    term      - Text terminal with up to 300 x 200 characters, 6..200 point font size, 4 simultaneous color schemes
  //    midi      - Piano keyboard with 1..128 keys, velocity depiction, variable screen scale
  //    logic     - PDM, Logic analyzer with single and multi-bit labels, 1..32 channels, can trigger on pattern
  //    scope     - PDM, Oscilloscope with 1..8 channels, can trigger on level with hysteresis
  //    scope_xy  - PDM, XY oscilloscope with 1..8 channels, persistence of 0..512 samples, polar mode, log scale mode
  //    fft       - PDM, Fast Fourier Transform with 1..8 channels, 4..2048 points, windowed results, log scale mode
  //    spectro   - PDM, Spectrograph with 4..2048-point FFT, windowed results, phase-coloring, and log scale mode
  //    bitmap    - PDM, Bitmap, 1..2048 x 1..2048 pixels, 1/2/4/8/16/32-bit pixels with 19 color systems, 15 direction/autoscroll modes, independent X and Y pixel size of 1..256
  // ----------------------------------------------------
  private _isDebugDisplayType(name: string): boolean {
    const debugDisplayTypes: string[] = ["logic", "scope", "scope_xy", "fft", "spectro", "plot", "term", "bitmap", "midi"];
    //const bDisplayTypeStatus: boolean = (debugDisplayTypes.indexOf(name.toLowerCase()) != -1);
    const bDisplayTypeStatus: boolean = debugDisplayTypes.includes(name.toLowerCase());
    return bDisplayTypeStatus;
  }

  private _isNameWithTypeInstantiation(newParameter: string, displayType: eDebugDisplayType): boolean {
    var nameStatus: boolean = false;
    const bHasPackedData: boolean = this._typeHasPackedData(displayType);
    const bHasColorMode: boolean = this._typeHasColorMode(displayType);
    switch (displayType) {
      case eDebugDisplayType.ddtTerm:
        nameStatus = this._isDebugTermDeclarationParam(newParameter);
        break;
      case eDebugDisplayType.ddtScope:
        nameStatus = this._isDebugScopeDeclarationParam(newParameter);
        break;
      case eDebugDisplayType.ddtScopeXY:
        nameStatus = this._isDebugScopeXYDeclarationParam(newParameter);
        break;
      case eDebugDisplayType.ddtLogic:
        nameStatus = this._isDebugLogicDeclarationParam(newParameter);
        break;
      case eDebugDisplayType.ddtFFT:
        nameStatus = this._isDebugFFTDeclarationParam(newParameter);
        break;
      case eDebugDisplayType.ddtSpectro:
        nameStatus = this._isDebugSpectroDeclarationParam(newParameter);
        // SPECTRO-Instantiation supports a special color mode, check it too
        if (nameStatus == false) {
          nameStatus = this._isDebugSpectroColorMode(newParameter);
        }
        break;
      case eDebugDisplayType.ddtPlot:
        nameStatus = this._isDebugPlotDeclarationParam(newParameter);
        break;
      case eDebugDisplayType.ddtBitmap:
        nameStatus = this._isDebugBitmapDeclarationParam(newParameter);
        break;
      case eDebugDisplayType.ddtMidi:
        nameStatus = this._isDebugMidiDeclarationParam(newParameter);
        break;
      default:
        break;
    }
    // if we don't have a match yet then check packed data
    if (nameStatus == false && bHasPackedData) {
      nameStatus = this._isDebugPackedDataType(newParameter);
    }
    if (nameStatus == false && bHasColorMode) {
      nameStatus = this._isDebugBitmapColorMode(newParameter);
    }
    return nameStatus;
  }

  private _isNameWithTypeFeed(newParameter: string, displayType: eDebugDisplayType): boolean {
    var nameStatus: boolean = false;
    const bHasColorMode: boolean = this._typeHasColorMode(displayType);
    switch (displayType) {
      case eDebugDisplayType.ddtTerm:
        nameStatus = this._isDebugTermFeedParam(newParameter);
        break;
      case eDebugDisplayType.ddtScope:
        nameStatus = this._isDebugScopeFeedParam(newParameter);
        break;
      case eDebugDisplayType.ddtScopeXY:
        nameStatus = this._isDebugScopeXYFeedParam(newParameter);
        break;
      case eDebugDisplayType.ddtLogic:
        nameStatus = this._isDebugLogicFeedParam(newParameter);
        break;
      case eDebugDisplayType.ddtFFT:
        nameStatus = this._isDebugFFTFeedParam(newParameter);
        break;
      case eDebugDisplayType.ddtSpectro:
        nameStatus = this._isDebugSpectroFeedParam(newParameter);
        break;
      case eDebugDisplayType.ddtPlot:
        nameStatus = this._isDebugPlotFeedParam(newParameter);
        break;
      case eDebugDisplayType.ddtBitmap:
        nameStatus = this._isDebugBitmapFeedParam(newParameter);
        break;
      case eDebugDisplayType.ddtMidi:
        nameStatus = this._isDebugMidiFeedParam(newParameter);
        break;
      default:
        break;
    }
    // if we don't have a match yet then check color mode
    if (nameStatus == false && bHasColorMode) {
      nameStatus = this._isDebugBitmapColorMode(newParameter);
    }
    this._logDEBUG("  -- _isNameWithTypeFeed(" + newParameter + ", " + displayType + ") = " + nameStatus);
    return nameStatus;
  }

  // each type has decl and feed parameter-name check methods
  // Debug Display: TERM declaration
  private _isDebugTermDeclarationParam(name: string): boolean {
    const debugTermDeclTypes: string[] = ["title", "pos", "size", "textsize", "color", "backcolor", "update", "hidexy"];
    const bTermDeclParamStatus: boolean = debugTermDeclTypes.indexOf(name.toLowerCase()) != -1;
    return bTermDeclParamStatus;
  }

  // Debug Display: TERM feed
  private _isDebugTermFeedParam(name: string): boolean {
    const debugTermFeedTypes: string[] = ["clear", "update", "save", "close"];
    const bTermFeedParamStatus: boolean = debugTermFeedTypes.indexOf(name.toLowerCase()) != -1;
    return bTermFeedParamStatus;
  }

  // Debug Display: SCOPE declaration
  private _isDebugScopeDeclarationParam(name: string): boolean {
    const debugScopeDeclTypes: string[] = ["title", "pos", "size", "samples", "rate", "dotsize", "linesize", "textsize", "color", "hidexy"];
    const bScopeDeclParamStatus: boolean = debugScopeDeclTypes.indexOf(name.toLowerCase()) != -1;
    return bScopeDeclParamStatus;
  }

  // Debug Display: SCOPE feed
  private _isDebugScopeFeedParam(name: string): boolean {
    const debugScopeFeedTypes: string[] = ["trigger", "holdoff", "samples", "clear", "save", "window", "close"];
    const bScopeFeedParamStatus: boolean = debugScopeFeedTypes.indexOf(name.toLowerCase()) != -1;
    return bScopeFeedParamStatus;
  }

  // Debug Display: SCOPE_XY declaration
  private _isDebugScopeXYDeclarationParam(name: string): boolean {
    const debugScopeXYDeclTypes: string[] = ["title", "pos", "size", "range", "samples", "rate", "dotsize", "textsize", "color", "polar", "logscale", "hidexy"];
    const bScopeXYDeclParamStatus: boolean = debugScopeXYDeclTypes.indexOf(name.toLowerCase()) != -1;
    return bScopeXYDeclParamStatus;
  }

  // Debug Display: SCOPE_XY feed
  private _isDebugScopeXYFeedParam(name: string): boolean {
    const debugScopeXYFeedTypes: string[] = ["clear", "save", "window", "close"];
    const bScopeXYFeedParamStatus: boolean = debugScopeXYFeedTypes.indexOf(name.toLowerCase()) != -1;
    return bScopeXYFeedParamStatus;
  }

  // Debug Display: LOGIC declaration
  private _isDebugLogicDeclarationParam(name: string): boolean {
    const debugLogicDeclTypes: string[] = ["title", "pos", "samples", "spacing", "rate", "linesize", "textsize", "color", "hidexy"];
    const bLogicDeclParamStatus: boolean = debugLogicDeclTypes.indexOf(name.toLowerCase()) != -1;
    return bLogicDeclParamStatus;
  }

  // Debug Display: LOGIC feed
  private _isDebugLogicFeedParam(name: string): boolean {
    const debugLogicFeedTypes: string[] = ["trigger", "holdoff", "clear", "save", "window", "close"];
    const bLogicFeedParamStatus: boolean = debugLogicFeedTypes.indexOf(name.toLowerCase()) != -1;
    return bLogicFeedParamStatus;
  }

  // Debug Display: FFT declaration
  private _isDebugFFTDeclarationParam(name: string): boolean {
    const debugFFTDeclTypes: string[] = ["title", "pos", "size", "samples", "rate", "dotsize", "linesize", "textsize", "color", "logscale", "hidexy"];
    const bFFTDeclParamStatus: boolean = debugFFTDeclTypes.indexOf(name.toLowerCase()) != -1;
    return bFFTDeclParamStatus;
  }

  // Debug Display: FFT feed
  private _isDebugFFTFeedParam(name: string): boolean {
    const debugFFTFeedTypes: string[] = ["clear", "save", "window", "close"];
    const bFFTFeedParamStatus: boolean = debugFFTFeedTypes.indexOf(name.toLowerCase()) != -1;
    return bFFTFeedParamStatus;
  }

  // Debug Display: SPECTRO declaration
  private _isDebugSpectroDeclarationParam(name: string): boolean {
    const debugSpectroDeclTypes: string[] = ["title", "pos", "samples", "depth", "mag", "range", "rate", "trace", "dotsize", "logscale", "hidexy"];
    const bSpectroDeclParamStatus: boolean = debugSpectroDeclTypes.indexOf(name.toLowerCase()) != -1;
    return bSpectroDeclParamStatus;
  }

  // Debug Display: SPECTRO feed
  private _isDebugSpectroFeedParam(name: string): boolean {
    const debugSpectroFeedTypes: string[] = ["clear", "save", "window", "close"];
    const bSpectroFeedParamStatus: boolean = debugSpectroFeedTypes.indexOf(name.toLowerCase()) != -1;
    return bSpectroFeedParamStatus;
  }

  // Debug Display: PLOT declaration
  private _isDebugPlotDeclarationParam(name: string): boolean {
    const debugPlotDeclTypes: string[] = ["title", "pos", "size", "dotsize", "lutcolors", "backcolor", "update", "hidexy"];
    const bPlotDeclParamStatus: boolean = debugPlotDeclTypes.indexOf(name.toLowerCase()) != -1;
    return bPlotDeclParamStatus;
  }

  // Debug Display: PLOT feed
  private _isDebugPlotFeedParam(name: string): boolean {
    const debugPlotFeedTypes: string[] = [
      "lutcolors",
      "backcolor",
      "color",
      "opacity",
      "precise",
      "linesize",
      "origin",
      "set",
      "dot",
      "line",
      "circle",
      "oval",
      "box",
      "obox",
      "textsize",
      "textstyle",
      "textangle",
      "text",
      "spritedef",
      "sprite",
      "polar",
      "cartesian",
      "update",
      "clear",
      "save",
      "window",
      "close",
    ];
    const bPlotFeedParamStatus: boolean = debugPlotFeedTypes.indexOf(name.toLowerCase()) != -1;
    return bPlotFeedParamStatus;
  }

  // Debug Display: BITMAP declaration
  private _isDebugBitmapDeclarationParam(name: string): boolean {
    const debugBitmapDeclTypes: string[] = ["title", "pos", "size", "dotsize", "lutcolors", "trace", "rate", "update", "hidexy", "sparse"];
    const bBitmapDeclParamStatus: boolean = debugBitmapDeclTypes.indexOf(name.toLowerCase()) != -1;
    return bBitmapDeclParamStatus;
  }

  // Debug Display: BITMAP feed
  private _isDebugBitmapFeedParam(name: string): boolean {
    const debugBitmapFeedTypes: string[] = ["lutcolors", "trace", "rate", "set", "scroll", "clear", "update", "save", "window", "close"];
    const bBitmapFeedParamStatus: boolean = debugBitmapFeedTypes.indexOf(name.toLowerCase()) != -1;
    return bBitmapFeedParamStatus;
  }

  // Debug Display: MIDI declaration
  private _isDebugMidiDeclarationParam(name: string): boolean {
    const debugMidiDeclTypes: string[] = ["title", "pos", "size", "range", "channel", "color"];
    const bMidiDeclParamStatus: boolean = debugMidiDeclTypes.indexOf(name.toLowerCase()) != -1;
    return bMidiDeclParamStatus;
  }

  // Debug Display: MIDI feed
  private _isDebugMidiFeedParam(name: string): boolean {
    const debugMidiFeedTypes: string[] = ["clear", "save", "window", "close"];
    const bMidiFeedParamStatus: boolean = debugMidiFeedTypes.indexOf(name.toLowerCase()) != -1;
    return bMidiFeedParamStatus;
  }

  private _typeHasPackedData(displayType: eDebugDisplayType): boolean {
    // return indication if displayType has Packed Data Mode
    let bHasPackedData: boolean = true;
    switch (displayType) {
      case eDebugDisplayType.ddtTerm:
        bHasPackedData = false;
        break;
      case eDebugDisplayType.ddtPlot:
        bHasPackedData = false;
        break;
      case eDebugDisplayType.ddtMidi:
        bHasPackedData = false;
        break;
      default:
        break;
    }
    return bHasPackedData;
  }

  private _typeHasColorMode(displayType: eDebugDisplayType): boolean {
    // return indication if displayType has lut1_to_rgb24 Color Mode
    let bHasColorMode: boolean = false;
    switch (displayType) {
      case eDebugDisplayType.ddtBitmap:
        bHasColorMode = true;
        break;
      case eDebugDisplayType.ddtPlot:
        bHasColorMode = true;
        break;
      default:
        break;
    }
    return bHasColorMode;
  }

  // color names for use in debug()
  //   BLACK / WHITE or ORANGE / BLUE / GREEN / CYAN / RED / MAGENTA / YELLOW / GREY|GRAY
  private _isDebugColorName(name: string): boolean {
    const debugColorNames: string[] = ["black", "white", "orange", "blue", "green", "cyan", "red", "magenta", "yellow", "grey", "gray"];
    const bColorNameStatus: boolean = debugColorNames.indexOf(name.toLowerCase()) != -1;
    return bColorNameStatus;
  }

  // packed data forms for use in debug()
  private _isDebugPackedDataType(name: string): boolean {
    const debugPackedDataTypes: string[] = [
      "longs_1bit",
      "longs_2bit",
      "longs_4bit",
      "longs_8bit",
      "longs_16bit",
      "words_1bit",
      "words_2bit",
      "words_4bit",
      "words_8bit",
      "bytes_1bit",
      "bytes_2bit",
      "bytes_4bit",
      // optional operators
      "alt",
      "signed",
    ];
    const bPackedDataTypeStatus: boolean = debugPackedDataTypes.indexOf(name.toLowerCase()) != -1;
    return bPackedDataTypeStatus;
  }

  //  Bitmap Color Modes
  private _isDebugBitmapColorMode(name: string): boolean {
    const debugBitmapColorModes: string[] = [
      "lut1",
      "lut2",
      "lut4",
      "lut8",
      "luma8",
      "luma8w",
      "luma8x",
      "hsv8",
      "hsv8w",
      "hsv8x",
      "rgbi8",
      "rgbi8w",
      "rgbi8x",
      "rgb8",
      "rgb16",
      "rgb24",
      "hsv16",
      "hsv16w",
      "hsv16x",
    ];
    const bBitmapColorModeStatus: boolean = debugBitmapColorModes.indexOf(name.toLowerCase()) != -1;
    return bBitmapColorModeStatus;
  }

  //  Spectro reduced-set Color Modes
  private _isDebugSpectroColorMode(name: string): boolean {
    const debugSpectropColorModes: string[] = ["luma8", "luma8w", "luma8x", "hsv16", "hsv16w", "hsv16x"];
    const bSpectroColorModeStatus: boolean = debugSpectropColorModes.indexOf(name.toLowerCase()) != -1;
    return bSpectroColorModeStatus;
  }

  //
  // ----------------------------------------------------

  private _skipWhite(line: string, currentOffset: number): number {
    let firstNonWhiteIndex: number = currentOffset;
    for (let index = currentOffset; index < line.length; index++) {
      if (line.substr(index, 1) != " " && line.substr(index, 1) != "\t") {
        firstNonWhiteIndex = index;
        break;
      }
    }
    return firstNonWhiteIndex;
  }

  private _tokenString(aToken: IParsedToken, line: string): string {
    let varName: string = line.substr(aToken.startCharacter, aToken.length);
    let desiredInterp: string =
      "  -- token=[ln:" + aToken.line + 1 + ",ofs:" + aToken.startCharacter + ",len:" + aToken.length + " [" + varName + "](" + aToken.ptTokenType + "[" + aToken.ptTokenModifiers + "])]";
    return desiredInterp;
  }

  private _rememberdTokenString(tokenName: string, aToken: RememberedToken | undefined): string {
    let desiredInterp: string = "  -- token=[len:" + tokenName.length + " [" + tokenName + "](undefined)";
    if (aToken != undefined) {
      desiredInterp = "  -- token=[len:" + tokenName.length + " [" + tokenName + "](" + aToken.type + "[" + aToken.modifiers + "])]";
    }
    return desiredInterp;
  }

  private _directiveString(aDirective: ISpin2Directive): string {
    let desiredInterp: string = "  -- directive=[ln:" + aDirective.lineNumber + 1 + ",typ:" + aDirective.displayType + "[" + aDirective.eDisplayType + "])]";
    return desiredInterp;
  }

  private _checkTokenSet(tokenSet: IParsedToken[]): void {
    this._logMessage("\n---- Checking " + tokenSet.length + " tokens. ----");
    tokenSet.forEach((parsedToken) => {
      if (parsedToken.length == undefined || parsedToken.startCharacter == undefined) {
        this._logMessage("- BAD Token=[" + parsedToken + "]");
      }
    });
    this._logMessage("---- Check DONE ----\n");
  }
}
