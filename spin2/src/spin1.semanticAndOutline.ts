"use strict";
// src/spin1.semanticAndOutline.ts

import * as vscode from "vscode";
//import { Z_UNKNOWN } from "zlib";
import { semanticConfiguration, reloadSemanticConfiguration } from "./spin2.semantic.configuration";

// ----------------------------------------------------------------------------
//  this file contains both an outline provider
//    and our semantic highlighting provider
//

// ----------------------------------------------------------------------------
//   OUTLINE Provider
//
export class Spin1ConfigDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
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

export const Spin1Legend = (function () {
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
  inDatPasm,
  inMultiLineComment,
  inMultiLineDocComment,
  inNothing,
}

export class Spin1DocumentSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
  async provideDocumentSemanticTokens(document: vscode.TextDocument, cancelToken: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
    // SEE https://www.codota.com/code/javascript/functions/vscode/CancellationToken/isCancellationRequested
    if (cancelToken) {
    } // silence our compiler for now... TODO: we should adjust loop so it can break on cancelToken.isCancellationRequested
    this._resetForNewDocument();
    this._logMessage("* Config: spinExtensionBehavior.highlightFlexspinDirectives: [" + this.configuration.highlightFlexspin + "]");

    const allTokens = this._parseText(document.getText());
    const builder = new vscode.SemanticTokensBuilder();
    allTokens.forEach((token) => {
      builder.push(token.line, token.startCharacter, token.length, this._encodeTokenType(token.ptTokenType), this._encodeTokenModifiers(token.ptTokenModifiers));
    });
    return builder.build();
  }

  private globalTokens = new Map<string, RememberedToken>();
  private localTokens = new Map<string, RememberedToken>();
  private localPasmTokensByMethodName = new Map<string, Map<string, RememberedToken>>();
  private conEnumInProgress: boolean = false;

  private configuration = semanticConfiguration;

  // list of directives found in file

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
    if (reloadSemanticConfiguration()) {
      this.configuration = semanticConfiguration;
    }
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

    if (this.spin1DebugLogEnabled) {
      if (this.spin1log === undefined) {
        //Create output channel
        this.spin1log = vscode.window.createOutputChannel("Spin1 DEBUG");
        this._logMessage("Spin1 log started.");
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
      const lineParts: string[] = trimmedNonCommentLine.split(/[ \t]/);
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
      } else if (this._isFlexspinPreprocessorDirective(lineParts[0])) {
        this._getPreProcessor_Declaration(0, i + 1, line);
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
        if (closingOffset == -1) {
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
          }
        }
      }
    }
    // --------------------         End of PRE-PARSE             --------------------
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
      const lineParts: string[] = trimmedLine.split(/[ \t]/);
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
      } else if (this._isFlexspinPreprocessorDirective(lineParts[0])) {
        const partialTokenSet: IParsedToken[] = this._reportPreProcessorLine(i, 0, line);
        partialTokenSet.forEach((newToken) => {
          this._logPreProc("=> PreProc: " + this._tokenString(newToken, line));
          tokenSet.push(newToken);
        });
        continue;
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
              this._logCON("=> CON: " + this._tokenString(newToken, line));
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
            this._logCON("=> CON: " + this._tokenString(newToken, line));
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
              this._logOBJ("=> ORG: " + this._tokenString(newToken, line));
              tokenSet.push(newToken);
            });

            prePasmState = currState;
            currState = eParseState.inDatPasm;
            // and ignore rest of this line
          } else {
            const partialTokenSet: IParsedToken[] = this._reportDAT_DeclarationLine(i, 0, line);
            partialTokenSet.forEach((newToken) => {
              this._logDAT("=> DAT: " + this._tokenString(newToken, line));
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
            this._logVAR("=> VAR: " + this._tokenString(newToken, line));
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
            this._logPASM("=> DAT: " + this._tokenString(newToken, line));
            tokenSet.push(newToken);
          });
          const lineParts: string[] = trimmedLine.split(/[ \t]/);
          if (lineParts.length > 0 && lineParts[0].toUpperCase() == "FIT") {
            currState = prePasmState;
            this._logState("- scan ln:" + (i + 1) + " POP currState=[" + currState + "]");
            // and ignore rest of this line
          }
        }
      } else if (currState == eParseState.inPub || currState == eParseState.inPri) {
        // process a method def'n line
        if (trimmedLine.length > 0) {
          this._logSPIN("- process SPIN2 line(" + (i + 1) + "): trimmedLine=[" + trimmedLine + "]");
          const lineParts: string[] = trimmedLine.split(/[ \t]/);
          const partialTokenSet: IParsedToken[] = this._reportSPIN_Code(i, 0, line);
          partialTokenSet.forEach((newToken) => {
            this._logSPIN("=> SPIN: " + this._tokenString(newToken, line));
            tokenSet.push(newToken);
          });
        }
      }
    }
    this._checkTokenSet(tokenSet);
    return tokenSet;
  }

  private _getPreProcessor_Declaration(startingOffset: number, lineNbr: number, line: string): void {
    if (this.configuration.highlightFlexspin) {
      let currentOffset: number = this._skipWhite(line, startingOffset);
      const nonCommentConstantLine = this._getNonCommentLineRemainder(currentOffset, line);
      // get line parts - we only care about first one
      const lineParts: string[] = nonCommentConstantLine.split(/[ \t=]/);
      this._logPreProc("  - ln:" + lineNbr + " GetPreProcDecl lineParts=[" + lineParts + "]");
      const directive: string = lineParts[0];
      const symbolName: string | undefined = lineParts.length > 1 ? lineParts[1] : undefined;
      if (this._isFlexspinPreprocessorDirective(directive)) {
        // check a valid preprocessor line for a declaration
        if (symbolName != undefined && directive.toLowerCase() == "#define") {
          this._logPreProc("  -- new PreProc Symbol=[" + symbolName + "]");
          this._setGlobalToken(symbolName, new RememberedToken("variable", ["readonly"]));
        }
      }
    }
  }

  private _getCON_Declaration(startingOffset: number, lineNbr: number, line: string): void {
    // HAVE    DIGIT_NO_VALUE = -2   ' digit value when NOT [0-9]
    //  -or-     _clkmode = xtal1 + pll16x
    //
    if (line.substr(startingOffset).length > 1) {
      //skip Past Whitespace
      let currentOffset: number = this._skipWhite(line, startingOffset);
      const nonCommentConstantLine = this._getNonCommentLineRemainder(currentOffset, line);
      this._logCON("  - ln:" + lineNbr + " GetCONDecl nonCommentConstantLine=[" + nonCommentConstantLine + "]");

      const haveEnumDeclaration: boolean = nonCommentConstantLine.startsWith("#");
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
            // our enum name can have a step offset
            if (enumConstant.includes("[")) {
              // it does, isolate name from offset
              const enumNameParts: string[] = enumConstant.split("[");
              enumConstant = enumNameParts[0];
            }
            if (enumConstant.substr(0, 1).match(/[a-zA-Z_]/)) {
              this._logCON("  -- GLBL enumConstant=[" + enumConstant + "]");
              this._setGlobalToken(enumConstant, new RememberedToken("enumMember", ["readonly"]));
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
        if (!this._isSpin2ReservedWords(newName)) {
          const nameType: string = isDataDeclarationLine ? "variable" : "label";
          var labelModifiers: string[] = [];
          if (!isDataDeclarationLine) {
            if (newName.startsWith(".")) {
              labelModifiers = ["illegalUse", "static"];
            } else {
              labelModifiers = newName.startsWith(":") ? ["static"] : [];
            }
          }
          this._logDAT("  -- GLBL gddcl newName=[" + newName + "](" + nameType + ")");
          this._setGlobalToken(newName, new RememberedToken(nameType, labelModifiers));
        }
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
        var labelModifiers: string[] = [];
        if (!isDataDeclarationLine) {
          labelModifiers = labelName.startsWith(":") ? ["static"] : [];
        }
        this._logPASM("  -- DAT PASM GLBL labelName=[" + labelName + "(" + labelType + ")]");
        this._setGlobalToken(labelName, new RememberedToken(labelType, labelModifiers));
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
    const isPrivate = methodType.indexOf("PRI") != -1;
    //skip Past Whitespace
    let currentOffset: number = this._skipWhite(line, startingOffset);
    const startNameOffset = currentOffset;
    // find open paren
    currentOffset = line.indexOf("(", startNameOffset); // in spin1 ()'s are optional!
    if (currentOffset == -1) {
      currentOffset = line.indexOf(":", startNameOffset);
      if (currentOffset == -1) {
        currentOffset = line.indexOf("|", startNameOffset);
        if (currentOffset == -1) {
          currentOffset = line.indexOf(" ", startNameOffset);
          if (currentOffset == -1) {
            currentOffset = line.indexOf("'", startNameOffset);
            if (currentOffset == -1) {
              currentOffset = line.length;
            }
          }
        }
      }
    }
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
      var labelModifiers: string[] = [];
      if (!isDataDeclarationLine) {
        labelModifiers = labelName.startsWith(":") ? ["static"] : [];
      }
      this._logPASM("  -- Inline PASM labelName=[" + labelName + "(" + labelType + ")]");
      this._setLocalPasmTokenForMethod(this.currentMethodName, labelName, new RememberedToken(labelType, labelModifiers));
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

  private _reportPreProcessorLine(lineNumber: number, startingOffset: number, line: string): IParsedToken[] {
    const tokenSet: IParsedToken[] = [];
    // skip Past Whitespace
    let currentOffset: number = this._skipWhite(line, startingOffset);
    const nonCommentConstantLine = this._getNonCommentLineRemainder(currentOffset, line);
    // get line parts - we only care about first one
    const lineParts: string[] = nonCommentConstantLine.split(/[ \t=]/);
    this._logPreProc("  - ln:" + lineNumber + " reportPreProc lineParts=[" + lineParts + "]");
    const directive: string = lineParts[0];
    const symbolName: string | undefined = lineParts.length > 1 ? lineParts[1] : undefined;
    if (this.configuration.highlightFlexspin) {
      if (this._isFlexspinPreprocessorDirective(directive)) {
        // record the directive
        tokenSet.push({
          line: lineNumber,
          startCharacter: 0,
          length: directive.length,
          ptTokenType: "keyword",
          ptTokenModifiers: ["control", "directive"],
        });
        const hasSymbol: boolean =
          directive.toLowerCase() == "#define" ||
          directive.toLowerCase() == "#ifdef" ||
          directive.toLowerCase() == "#ifndef" ||
          directive.toLowerCase() == "#elseifdef" ||
          directive.toLowerCase() == "#elseifndef";
        if (hasSymbol && symbolName != undefined) {
          const nameOffset = line.indexOf(symbolName, currentOffset);
          this._logPreProc("  -- GLBL symbolName=[" + symbolName + "]");
          let referenceDetails: RememberedToken | undefined = undefined;
          if (this._isGlobalToken(symbolName)) {
            referenceDetails = this._getGlobalToken(symbolName);
            this._logPreProc("  --  FOUND preProc global " + this._rememberdTokenString(symbolName, referenceDetails));
          }
          if (referenceDetails != undefined) {
            // record a constant declaration!
            const updatedModificationSet: string[] = directive.toLowerCase() == "#define" ? this._modifiersWith(referenceDetails.modifiers, "declaration") : referenceDetails.modifiers;
            tokenSet.push({
              line: lineNumber,
              startCharacter: nameOffset,
              length: symbolName.length,
              ptTokenType: referenceDetails.type,
              ptTokenModifiers: updatedModificationSet,
            });
          } else if (this._isFlexspinReservedWord(symbolName)) {
            // record a constant reference
            tokenSet.push({
              line: lineNumber,
              startCharacter: nameOffset,
              length: symbolName.length,
              ptTokenType: "variable",
              ptTokenModifiers: ["readonly"],
            });
          } else {
            // record an unknown name
            tokenSet.push({
              line: lineNumber,
              startCharacter: nameOffset,
              length: symbolName.length,
              //ptTokenType: "variable",
              //ptTokenModifiers: ["readonly", "missingDeclaration"],
              ptTokenType: "comment",
              ptTokenModifiers: ["line"],
            });
          }
        }
      }
    } else {
      //  DO NOTHING we don't highlight these (flexspin support not enabled)
      tokenSet.push({
        line: lineNumber,
        startCharacter: 0,
        length: lineParts[0].length,
        ptTokenType: "macro",
        ptTokenModifiers: ["directive", "illegalUse"],
      });
    }

    return tokenSet;
  }

  private _reportCON_DeclarationLine(lineNumber: number, startingOffset: number, line: string): IParsedToken[] {
    const tokenSet: IParsedToken[] = [];
    // skip Past Whitespace
    let currentOffset: number = this._skipWhite(line, startingOffset);
    const nonCommentConstantLine = this._getNonCommentLineReturnComment(lineNumber, currentOffset, line, tokenSet);

    const haveEnumDeclaration: boolean = nonCommentConstantLine.startsWith("#");
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
              let refChar: string = "";
              if (possibleName.includes(".")) {
                refChar = ".";
                possibleNameSet = possibleName.split(".");
                this._logSPIN("  --  . possibleNameSet=[" + possibleNameSet + "]");
              } else if (possibleName.includes("#")) {
                refChar = "#";
                possibleNameSet = possibleName.split("#");
                this._logSPIN("  --  # possibleNameSet=[" + possibleNameSet + "]");
              } else {
                possibleNameSet = [possibleName];
              }
              const namePart = possibleNameSet[0];
              let matchLen: number = namePart.length;
              const searchString: string = possibleNameSet.length == 1 ? possibleNameSet[0] : possibleNameSet[0] + refChar + possibleNameSet[1];
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
                  !this._isUnaryOperator(namePart) &&
                  !this._isSpinBuiltInConstant(namePart) &&
                  !this._isPasmReservedWord(namePart)
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
                this._logCON("  -- GLBL enumConstant=[" + enumConstant + "]");
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
            if (enumConstant.substr(0, 1).match(/[a-zA-Z_]/)) {
              this._logCON("  -- GLBL enumConstant=[" + enumConstant + "]");
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
    if (lineParts.length > 0) {
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
        } else if (
          !this._isReservedPasmSymbols(newName) &&
          !this._isPasmInstruction(newName) &&
          !this._isPasmConditional(newName) &&
          !this._isDatStorageType(newName) &&
          !newName.toUpperCase().startsWith("IF_")
        ) {
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
    } else {
      this._logDAT("  -- DAT SKIPPED: lineParts=[" + lineParts + "]");
    }
    return tokenSet;
  }

  private _reportDAT_ValueDeclarationCode(lineNumber: number, startingOffset: number, line: string, allowLocal: boolean, showDebug: boolean, isDatPasm: boolean): IParsedToken[] {
    const tokenSet: IParsedToken[] = [];
    //this._logMessage(' DBG _reportDAT_ValueDeclarationCode(#' + lineNumber + ', ofs=' + startingOffset + ')');
    this._logDAT("- process ValueDeclaration line(" + (lineNumber + 1) + "): line=[" + line + "]: startingOffset=(" + startingOffset + ")");

    // process data declaration
    let currentOffset: number = this._skipWhite(line, startingOffset);
    const dataValueInitStr = this._getNonCommentLineReturnComment(lineNumber, currentOffset, line, tokenSet);
    this._logDAT("- ln(" + (lineNumber + 1) + "): dataValueInitStr=[" + dataValueInitStr + "]");
    if (dataValueInitStr.length > 1) {
      this._logDAT("  -- reportDataValueInit dataValueInitStr=[" + dataValueInitStr + "]");

      let lineParts: string[] = this._getNonWhiteDataInitLineParts(dataValueInitStr);
      const argumentStartIndex: number = this._isDatStorageType(lineParts[0]) ? 1 : 0;
      this._logDAT("  -- lineParts=[" + lineParts + "]");

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
            let refChar: string = "";
            if (possibleName.includes(".") && !possibleName.startsWith(".")) {
              refChar = ".";
              possibleNameSet = possibleName.split(".");
              this._logSPIN("  --  . possibleNameSet=[" + possibleNameSet + "]");
            } else if (possibleName.includes("#")) {
              refChar = "#";
              possibleNameSet = possibleName.split("#");
              this._logSPIN("  --  # possibleNameSet=[" + possibleNameSet + "]");
            } else {
              possibleNameSet = [possibleName];
            }
            const namePart = possibleNameSet[0];
            const searchString: string = possibleNameSet.length == 1 ? possibleNameSet[0] : possibleNameSet[0] + refChar + possibleNameSet[1];
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
    let haveLabel: boolean = this._isDatOrPasmLabel(lineParts[0]);
    const isDataDeclarationLine: boolean = lineParts.length > 1 && haveLabel && this._isDatStorageType(lineParts[1]) ? true : false;
    // TODO: REWRITE this to handle "non-label" line with unknown op-code!
    if (haveLabel) {
      // YES Label
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
        const updatedModificationSet: string[] = this._modifiersWith(referenceDetails.modifiers, "declaration");
        this._logPASM("  --  DAT Pasm " + referenceDetails.type + "=[" + labelName + "](" + (nameOffset + 1) + ")");
        tokenSet.push({
          line: lineNumber,
          startCharacter: nameOffset,
          length: labelName.length,
          ptTokenType: referenceDetails.type,
          ptTokenModifiers: updatedModificationSet,
        });
        haveLabel = true;
      } else {
        // NO Label
        // hrmf... no global type???? this should be a label?
        this._logPASM("  --  DAT Pasm ERROR NOT A label=[" + labelName + "](" + (0 + 1) + ")");
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
    if (!isDataDeclarationLine) {
      // process assembly code
      this._logPASM("  -- reportDATPasmDecl NOT Decl lineParts=[" + lineParts + "]");
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
          // have at least instruction name
          const likelyInstructionName: string = lineParts[minNonLabelParts - 1];
          currentOffset = line.indexOf(likelyInstructionName, currentOffset);
          this._logPASM("  -- DAT PASM likelyInstructionName=[" + likelyInstructionName + "], currentOffset=(" + currentOffset + ")");
          currentOffset += likelyInstructionName.length + 1;
          for (let index = minNonLabelParts; index < lineParts.length; index++) {
            let argumentName = lineParts[index].replace(/[@#]/, "");
            this._logPASM("  -- DAT PASM checking argumentName=[" + argumentName + "], currentOffset=(" + currentOffset + ")");
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
            if (argumentName.substr(0, 1).match(/[a-zA-Z_\.\:]/)) {
              // does name contain a namespace reference?
              this._logPASM("  -- argumentName=[" + argumentName + "]");
              let possibleNameSet: string[] = [];
              let refChar: string = "";
              if (argumentName.includes(".") && !argumentName.startsWith(".")) {
                refChar = ".";
                possibleNameSet = argumentName.split(".");
                this._logSPIN("  --  . possibleNameSet=[" + possibleNameSet + "]");
              } else if (argumentName.includes("#")) {
                refChar = "#";
                possibleNameSet = argumentName.split("#");
                this._logSPIN("  --  # possibleNameSet=[" + possibleNameSet + "]");
              } else {
                possibleNameSet = [argumentName];
              }
              const namePart = possibleNameSet[0];
              const searchString: string = possibleNameSet.length == 1 ? possibleNameSet[0] : possibleNameSet[0] + refChar + possibleNameSet[1];
              nameOffset = line.indexOf(searchString, currentOffset);
              this._logPASM("  --  DAT Pasm searchString=[" + searchString + "](" + (nameOffset + 1) + ")");
              let referenceDetails: RememberedToken | undefined = undefined;
              if (this._isGlobalToken(namePart)) {
                referenceDetails = this._getGlobalToken(namePart);
                this._logPASM("  --  FOUND global name=[" + namePart + "]");
              }
              if (referenceDetails != undefined) {
                this._logPASM("  --  DAT Pasm name=[" + namePart + "](" + (nameOffset + 1) + ")");
                tokenSet.push({
                  line: lineNumber,
                  startCharacter: nameOffset,
                  length: namePart.length,
                  ptTokenType: referenceDetails.type,
                  ptTokenModifiers: referenceDetails.modifiers,
                });
              } else {
                if (
                  !this._isPasmReservedWord(namePart) &&
                  !this._isPasmInstruction(namePart) &&
                  !this._isPasmConditional(namePart) &&
                  !this._isBinaryOperator(namePart) &&
                  !this._isBuiltinReservedWord(namePart)
                ) {
                  this._logPASM("  --  DAT Pasm MISSING name=[" + namePart + "](" + (nameOffset + 1) + ")");
                  tokenSet.push({
                    line: lineNumber,
                    startCharacter: nameOffset,
                    length: namePart.length,
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
                nameOffset = line.indexOf(constantPart, referenceOffset);
                this._logPASM("  --  DAT Pasm constant=[" + namePart + "](" + (nameOffset + 1) + ")");
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
      } else if (this._isSpin2ReservedWords(lineParts[0])) {
        const namePart: string = lineParts[argumentOffset];
        let nameOffset: number = line.indexOf(namePart, currentOffset);
        this._logPASM("  --  DAT Pasm ILLEGAL use of Pasm2 name=[" + namePart + "](" + (nameOffset + 1) + ")");
        tokenSet.push({
          line: lineNumber,
          startCharacter: nameOffset,
          length: namePart.length,
          ptTokenType: "variable",
          ptTokenModifiers: ["illegalUse"],
        });
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
    const methodType: string = line.substr(0, 3).toUpperCase();
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
    const startNameOffset: number = currentOffset;

    // find open paren - skipping past method name
    currentOffset = line.indexOf("(", startNameOffset); // in spin1 ()'s are optional!
    const openParenOffset: number = currentOffset;
    if (currentOffset == -1) {
      currentOffset = line.indexOf(":", startNameOffset);
      if (currentOffset == -1) {
        currentOffset = line.indexOf("|", startNameOffset);
        if (currentOffset == -1) {
          currentOffset = line.indexOf(" ", startNameOffset);
          if (currentOffset == -1) {
            currentOffset = line.indexOf("'", startNameOffset);
            if (currentOffset == -1) {
              currentOffset = line.length;
            }
          }
        }
      }
    }
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
    if (openParenOffset != -1) {
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
                  this._logSPIN("  --  lcl-idx variableName=[" + namedIndexPart + "](" + (nameOffset + 1) + ")");
                  tokenSet.push({
                    line: lineNumber,
                    startCharacter: nameOffset,
                    length: namedIndexPart.length,
                    ptTokenType: referenceDetails.type,
                    ptTokenModifiers: referenceDetails.modifiers,
                  });
                } else {
                  if (!this._isSpinReservedWord(namedIndexPart) && !this._isSpinBuiltinMethod(namedIndexPart) && !this._isBuiltinReservedWord(namedIndexPart)) {
                    // we don't have name registered so just mark it
                    this._logSPIN("  --  SPIN MISSING varname=[" + namedIndexPart + "](" + (nameOffset + 1) + ")");
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
          let variableName: string = varNameList[index];
          const variableNameLen: number = variableName.length;
          if (variableName.includes("[")) {
            // NOTE this handles code: byte[pColor][2] := {value}
            //outa[D7..D4] := %0011               P1 OBEX:LCD SPIN driver - 2x16.spin (315)

            // have complex target name, parse in loop (remove our range specifier '..')
            if (variableName.includes("..")) {
              variableName = variableName.replace("..", " ");
            }
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
                                        this._logSPIN('  --  SPIN storageType=[' + varNameParts[1] + '](' + (nameOffset + 1) + ')');
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
                this._logSPIN("  -- variableNamePart=[" + variableNamePart + "](" + (nameOffset + 1) + ")");
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
                    this._logSPIN("  --  SPIN variableName=[" + variableNamePart + "](" + (nameOffset + 1) + ")");
                    tokenSet.push({
                      line: lineNumber,
                      startCharacter: nameOffset,
                      length: variableNamePart.length,
                      ptTokenType: referenceDetails.type,
                      ptTokenModifiers: modificationArray,
                    });
                  } else {
                    if (!this._isSpinReservedWord(variableNamePart) && !this._isBuiltinReservedWord(variableNamePart) && !this._isSpinBuiltinMethod(variableNamePart)) {
                      // we don't have name registered so just mark it
                      this._logSPIN("  --  SPIN MISSING varname=[" + variableNamePart + "](" + (nameOffset + 1) + ")");
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
              this._logSPIN("  --  SPIN cleanedVariableName=[" + cleanedVariableName + "](" + (nameOffset + 1) + ")");
              if (cleanedVariableName.includes(".")) {
                const varNameParts: string[] = cleanedVariableName.split(".");
                if (this._isDatStorageType(varNameParts[1])) {
                  cleanedVariableName = varNameParts[0]; // just use first part of name
                  /*
                                    // FIXME: UNDONE mark storage part correctly, yes, out-of-order
                                    const nameOffset: number = line.indexOf(varNameParts[1]);
                                    this._logSPIN('  --  SPIN storageType=[' + varNameParts[1] + '](' + (nameOffset + 1) + ')');
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
                this._logSPIN("  -- spin: simple variableName=[" + cleanedVariableName + "](" + (nameOffset + 1) + ")");
                tokenSet.push({
                  line: lineNumber,
                  startCharacter: nameOffset,
                  length: cleanedVariableName.length,
                  ptTokenType: referenceDetails.type,
                  ptTokenModifiers: modificationArray,
                });
              } else if (cleanedVariableName == "_") {
                this._logSPIN("  --  built-in=[" + cleanedVariableName + "](" + (nameOffset + 1) + ")");
                tokenSet.push({
                  line: lineNumber,
                  startCharacter: nameOffset,
                  length: cleanedVariableName.length,
                  ptTokenType: "variable",
                  ptTokenModifiers: ["modification", "defaultLibrary"],
                });
              } else if (cleanedVariableName.toLowerCase() == "result") {
                this._logSPIN("  --  SPIN return Special Name=[" + cleanedVariableName + "]");
                tokenSet.push({
                  line: lineNumber,
                  startCharacter: nameOffset,
                  length: cleanedVariableName.length,
                  ptTokenType: "returnValue",
                  ptTokenModifiers: ["declaration", "local"],
                });
              } else {
                // we don't have name registered so just mark it
                if (!this._isSpinReservedWord(cleanedVariableName) && !this._isSpinBuiltinMethod(cleanedVariableName) && !this._isBuiltinReservedWord(cleanedVariableName)) {
                  this._logSPIN("  --  SPIN MISSING cln name=[" + cleanedVariableName + "](" + (nameOffset + 1) + ")");
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
          let refChar: string = "";
          if (possibleName.includes(".")) {
            refChar = ".";
            possibleNameSet = possibleName.split(".");
            this._logSPIN("  --  . possibleNameSet=[" + possibleNameSet + "]");
          } else if (possibleName.includes("#")) {
            refChar = "#";
            possibleNameSet = possibleName.split("#");
            this._logSPIN("  --  # possibleNameSet=[" + possibleNameSet + "]");
          } else {
            possibleNameSet = [possibleName];
          }
          const namePart = possibleNameSet[0];
          const searchString: string = possibleNameSet.length == 1 ? possibleNameSet[0] : possibleNameSet[0] + refChar + possibleNameSet[1];
          nameOffset = nonStringAssignmentRHSStr.indexOf(searchString, currNonStringOffset) + currentOffset;
          this._logSPIN("  --  SPIN RHS  nonStringAssignmentRHSStr=[" + nonStringAssignmentRHSStr + "]");
          this._logSPIN("  --  SPIN RHS   searchString=[" + searchString + "], namePart=[" + namePart + "]");
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
            this._logSPIN("  --  SPIN RHS name=[" + namePart + "](" + (nameOffset + 1) + ")");
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
            } else if (this._isSpinBuiltInConstant(namePart)) {
              this._logSPIN("  --  SPIN RHS builtin constant=[" + namePart + "]");
              tokenSet.push({
                line: lineNumber,
                startCharacter: nameOffset,
                length: namePart.length,
                ptTokenType: "variable",
                ptTokenModifiers: ["readonly", "defaultLibrary"],
              });
            } else if (namePart.toLowerCase() == "result") {
              this._logSPIN("  --  SPIN return Special Name=[" + namePart + "]");
              tokenSet.push({
                line: lineNumber,
                startCharacter: nameOffset,
                length: namePart.length,
                ptTokenType: "returnValue",
                ptTokenModifiers: ["declaration", "local"],
              });
            } else if (!this._isSpinReservedWord(namePart) && !this._isSpinBuiltinMethod(namePart) && !this._isSpinBuiltInVariable(namePart) && !this._isBuiltinReservedWord(namePart)) {
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
            } else {
              this._logSPIN("  --  SPIN ??? What to do with: rhs name=[" + namePart + "]");
            }
          }
          if (possibleNameSet.length > 1) {
            // we have .methodName or #constantName namespace suffix
            // determine if this is method has '(' or constant name
            const referenceOffset = nonStringAssignmentRHSStr.indexOf(searchString, currNonStringOffset) + currentOffset;
            let isMethod: boolean = false;
            if (line.substr(referenceOffset + searchString.length, 1) == "(") {
              isMethod = true;
            } else if (refChar == ".") {
              // spin1 does NOT require name() method calls!
              isMethod = true;
            }
            const constantPart: string = possibleNameSet[1];
            if (this._isStorageType(constantPart)) {
              // FIXME: UNDONE remove when syntax see this correctly
              const nameOffset: number = line.indexOf(constantPart, currentOffset);
              this._logSPIN("  --  SPIN rhs storageType=[" + constantPart + "](" + (nameOffset + 1) + ")");
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
              this._logSPIN("  --  SPIN rhs constant=[" + constantPart + "](" + (nameOffset + 1) + ") (" + tokenTypeID + ")");
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
          this._logSPIN("  --  SPIN rhs externalMethodName=[" + externalMethodName + "](" + (nameOffset + 1) + ")");
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
    if (lineParts.length == 0) {
      return tokenSet;
    }
    // handle name in as first part of line...
    // (process label/variable name)
    let haveLabel: boolean = this._isDatOrPasmLabel(lineParts[0]);
    const isDataDeclarationLine: boolean = lineParts.length > 1 && haveLabel && this._isDatStorageType(lineParts[1]) ? true : false;
    if (haveLabel) {
      const labelName: string = lineParts[0];
      this._logPASM("  -- labelName=[" + labelName + "]");
      const labelType: string = isDataDeclarationLine ? "variable" : "label";
      const nameOffset: number = line.indexOf(labelName, currentOffset);
      var labelModifiers: string[] = [];
      if (!isDataDeclarationLine) {
        labelModifiers = labelName.startsWith(":") ? ["declaration", "static"] : ["declaration"];
      }
      tokenSet.push({
        line: lineNumber,
        startCharacter: nameOffset,
        length: labelName.length,
        ptTokenType: labelType,
        ptTokenModifiers: labelModifiers,
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
                let refChar: string = "";
                this._logPASM("  -- argumentName=[" + argumentName + "]");
                let possibleNameSet: string[] = [];
                if (argumentName.includes(".") && !argumentName.startsWith(".")) {
                  refChar = ".";
                  possibleNameSet = argumentName.split(".");
                  this._logSPIN("  --  . possibleNameSet=[" + possibleNameSet + "]");
                } else if (argumentName.includes("#")) {
                  refChar = "#";
                  possibleNameSet = argumentName.split("#");
                  this._logSPIN("  --  # possibleNameSet=[" + possibleNameSet + "]");
                } else {
                  possibleNameSet = [argumentName];
                }
                const namePart = possibleNameSet[0];
                const searchString: string = possibleNameSet.length == 1 ? possibleNameSet[0] : possibleNameSet[0] + refChar + possibleNameSet[1];
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
                    if (!this._isSpinReservedWord(namePart) && !this._isBuiltinReservedWord(namePart)) {
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
                else if (!this._isSpinReservedWord(nameReference) && !this._isBuiltinReservedWord(nameReference)) {
                  this._logOBJ("  --  OBJ MISSING name=[" + nameReference + "]");
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
                    if (!this._isSpinReservedWord(namePart) && !this._isBuiltinReservedWord(namePart)) {
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
            this._logSPIN("  --  rOr rhs storageType=[" + constantPart + "](" + (nameOffset + 1) + ")");
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
            this._logSPIN("  --  rOr rhs constant=[" + constantPart + "](" + (referenceOffset + 1) + ") (" + tokenTypeID + ")");
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
      this._logDEBUG("  -- gsqs nextString=[" + nextString + "](" + nextString.length + ")");
    }
    return nextString;
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
      this._logDEBUG("  -- gdqs nextString=[" + nextString + "](" + nextString.length + ")");
    }
    return nextString;
  }

  private spin1log: any = undefined;
  // adjust following true/false to show specific parsing debug
  private spin1DebugLogEnabled: boolean = false; // WARNING (REMOVE BEFORE FLIGHT)- change to 'false' - disable before commit
  private showSpinCode: boolean = true;
  private showPreProc: boolean = true;
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

  private _logPreProc(message: string): void {
    if (this.showPreProc) {
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
    if (this.spin1log != undefined) {
      //Write to output window.
      this.spin1log.appendLine(message);
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
    let lineParts: string[] | null = nonEqualsLine.match(/[^ \t\,\(\)\[\]\<\>\=\?\!\^\+\*\&\|\-\\\#\@\/]+/g);
    if (lineParts === null) {
      lineParts = [];
    }
    return lineParts;
  }

  private _getNonWhiteSpinLineParts(line: string): IFilteredStrings {
    //                                     split(/[ \t\-\:\,\+\[\]\@\(\)\!\*\=\<\>\&\|\?\\\~\#\^\/]/);
    const nonEqualsLine: string = this._removeDoubleQuotedStrings(line);
    let lineParts: string[] | null = nonEqualsLine.match(/[^ \t\-\:\,\+\[\]\@\(\)\!\*\=\<\>\&\|\?\\\~\^\/]+/g);
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

  private _getCommaDelimitedNonWhiteLineParts(line: string): string[] {
    let lineParts: string[] | null = line.match(/[^ \t,]+/g);
    if (lineParts === null) {
      lineParts = [];
    }
    return lineParts;
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
      //
      "dira",
      "dirb",
      "ina",
      "inb",
      "outa",
      "outb",
      "cnt",
      "ctra",
      "ctrb",
      "frqa",
      "frqb",
      "phsa",
      "phsb",
      "vcfg",
      "vscl",
      "par",
      "spr",
    ];
    const reservedStatus: boolean = builtinNamesOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  private _isSpinBuiltInConstant(name: string): boolean {
    const spinVariablesOfNote: string[] = ["clkmode", "clkfreq", "chipver", "cogid", "cnt", "xtal1", "xtal2", "xtal3", "rcfast", "rcslow", "pll1x", "pll2x", "pll4x", "pll8x", "pll16x"];
    let reservedStatus: boolean = spinVariablesOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  private _isSpinBuiltInVariable(name: string): boolean {
    const spinVariablesOfNote: string[] = ["_clkmode", "_xinfreq", "dira", "dirb", "ina", "inb", "outa", "outb", "ctra", "ctrb", "frqa", "frqb", "phsa", "phsb", "vcfg", "vscl", "par", "spr"];
    let reservedStatus: boolean = spinVariablesOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  private _isSpinReservedWord(name: string): boolean {
    const spinInstructionsOfNote: string[] = [
      "float",
      "round",
      "trunc",
      "nan",
      "_clkmode",
      "_clkfreq",
      "_free",
      "_stack",
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
      "other",
      "abort",
      "return",
      "true",
      "false",
      "posx",
      "negx",
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

  private _isSpin2ReservedWords(name: string): boolean {
    const spin2InstructionsOfNote: string[] = [
      "alignl",
      "alignw",
      "orgf",
      "orgh",
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
      "addct1",
      "addct2",
      "addct3",
      "addpix",
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
      "calla",
      "callb",
      "calld",
      "callpa",
      "callpb",
      "cmpm",
      "cmpr",
      "cogatn",
      "cogbrk",
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
      "lockrel",
      "locktry",
      "mergeb",
      "mergew",
      "mixpix",
      "modc",
      "modcz",
      "modz",
      "movbyts",
      "mulpix",
      "muxnibs",
      "muxnits",
      "muxq",
      "nixint1",
      "nixint2",
      "nixint3",
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
      "rczl",
      "rczr",
      "rdfast",
      "rdlut",
      "rdpin",
      "rep",
      "resi0",
      "resi1",
      "resi2",
      "resi3",
      "reta",
      "retb",
      "reti0",
      "reti1",
      "reti2",
      "reti3",
      "rfbyte",
      "rflong",
      "rfvar",
      "rfvars",
      "rfword",
      "rgbexp",
      "rgbsqz",
      "rolbyte",
      "rolbyte",
      "rolnib",
      "rolword",
      "rolword",
      "rqpin",
      "sal",
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
      "signx",
      "skip",
      "skipf",
      "splitb",
      "splitw",
      "stalli",
      "subr",
      "testb",
      "testbn",
      "testp",
      "testpn",
      "tjf",
      "tjnf",
      "tjns",
      "",
      "tjs",
      "tjv",
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
      "wrc",
      "wrfast",
      "wrlut",
      "wrnc",
      "wrnz",
      "wrpin",
      "wrz",
      "wxpin",
      "wypin",
      "xcont",
      "xinit",
      "xoro32",
      "xstop",
      "xzero",
      "zerox",
      "wcz",
      "xorc",
      "xorz",
      "orc",
      "orz",
      "andc",
      "andz",
      "_ret_",
      "if_00",
      "if_01",
      "if_0x",
      "if_10",
      "if_x0",
      "if_diff",
      "if_not_11",
      "if_11",
      "if_same",
      "if_x1",
      "if_not_10",
      "if_1x",
      "if_not_01",
      "if_not_00",
      "if_le",
      "if_lt",
      "if_ge",
      "if_gt",
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
      "x_4p_4dac1_wf_byte",
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
    ];
    const reservedStatus: boolean = spin2InstructionsOfNote.indexOf(name.toLowerCase()) != -1;
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

  private _isSpinBuiltinMethod(name: string): boolean {
    const spinMethodNames: string[] = [
      "bytefill",
      "bytemove",
      "call",
      "clkset",
      "coginit",
      "cogspin",
      "cogstop",
      "cognew",
      "lockclr",
      "locknew",
      "lockret",
      "lockset",
      "longfill",
      "longmove",
      "lookdown",
      "lookdownz",
      "lookup",
      "lookupz",
      "reboot",
      "strcomp",
      "strsize",
      "string",
      "constant",
      "waitcnt",
      "waitpeq",
      "waitpne",
      "waitvid",
      "wordfill",
      "wordmove",
    ];
    const reservedStatus: boolean = spinMethodNames.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  private _isFlexspinPreprocessorDirective(name: string): boolean {
    const flexspinDirectiveOfNote: string[] = ["#define", "#ifdef", "#ifndef", "#else", "#elseifdef", "#elseifndef", "#endif", "#error", "#include", "#warn", "#undef"];
    const reservedStatus: boolean = flexspinDirectiveOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  private _isFlexspinReservedWord(name: string): boolean {
    const flexspinReservedswordsOfNote: string[] = [
      "__propeller__",
      "__propeller2__",
      "__p2__",
      "__flexspin__",
      "__spincvt__",
      "__spin2pasm__",
      "__spin2cpp__",
      "__have_fcache__",
      "__cplusplus__",
      "__date__",
      "__file__",
      "__line__",
      "__time__",
      "__version__",
      "__debug__",
      "__output_asm__",
      "__output_bytecode__",
      "__output_c__",
      "__output_cpp__",
    ];
    const reservedStatus: boolean = flexspinReservedswordsOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  private _isReservedPasmSymbols(name: string): boolean {
    const reservedPasmSymbolNames: string[] = ["org", "fit", "end"];
    const reservedStatus: boolean = reservedPasmSymbolNames.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  private _isPasmReservedWord(name: string): boolean {
    const pasmReservedswordsOfNote: string[] = ["cnt", "scr", "_clkfreq", "_clkmode", "_xinfreq", "_stack", "_free", "round", "float", "trunc", "true", "false", "negx", "pi", "posx"];
    const reservedStatus: boolean = pasmReservedswordsOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  private _isPasmInstruction(name: string): boolean {
    const pasmInstructions: string[] = [
      "abs",
      "absneg",
      "add",
      "addabs",
      "adds",
      "addsx",
      "addx",
      "and",
      "andn",
      "call",
      "clkset",
      "cmp",
      "cmps",
      "cmpsub",
      "cmpsx",
      "cmpx",
      "cogid",
      "coginit",
      "cogstop",
      "djnz",
      "hubop",
      "jmp",
      "jmpret",
      "lockclr",
      "locknew",
      "lockret",
      "lockset",
      "max",
      "maxs",
      "min",
      "mins",
      "mov",
      "movd",
      "movi",
      "movs",
      "muxc",
      "muxnc",
      "muxz",
      "muxnz",
      "neg",
      "negc",
      "negnc",
      "negnz",
      "negz",
      "nop",
      "or",
      "rcl",
      "rcr",
      "rdbyte",
      "rdlong",
      "rdword",
      "ret",
      "rev",
      "rol",
      "ror",
      "sar",
      "shl",
      "shr",
      "sub",
      "subabs",
      "subs",
      "subsx",
      "subx",
      "sumc",
      "sumnc",
      "sumnz",
      "sumz",
      "test",
      "testn",
      "tjnz",
      "tjz",
      "waitcnt",
      "waitpeq",
      "waitpne",
      "waitvid",
      "wrbyte",
      "wrlong",
      "wrword",
      "xor",
    ];
    const instructionStatus: boolean = pasmInstructions.indexOf(name.toLowerCase()) != -1;
    return instructionStatus;
  }

  private _isPasmNonArgumentInstruction(name: string): boolean {
    const pasmNonArgumentInstructions: string[] = ["nop", "ret"];
    const instructionStatus: boolean = pasmNonArgumentInstructions.indexOf(name.toLowerCase()) != -1;
    return instructionStatus;
  }

  private _isIllegalInlinePasmDirective(name: string): boolean {
    const illegalInlinePasmDirective: string[] = ["file"];
    const illegalStatus: boolean = illegalInlinePasmDirective.indexOf(name.toLowerCase()) != -1;
    return illegalStatus;
  }

  private _isPasmConditional(name: string): boolean {
    let returnStatus: boolean = false;
    if (name.length >= 2) {
      const checkType: string = name.toUpperCase();
      if (checkType == "WC" || checkType == "WZ" || checkType == "NR" || checkType == "WR") {
        returnStatus = true;
      }
    }
    return returnStatus;
  }

  private _isDatOrPasmLabel(name: string): boolean {
    let haveLabelStatus: boolean = false;
    if (name.length > 0) {
      haveLabelStatus = name.substr(0, 1).match(/[a-zA-Z_\.\:]/) ? true : false;
      if (haveLabelStatus) {
        if (this._isDatNFileStorageType(name)) {
          haveLabelStatus = false;
        } else if (name.toLowerCase() == "dat") {
          haveLabelStatus = false;
        } else if (this._isReservedPasmSymbols(name)) {
          haveLabelStatus = false;
        } else if (name.toUpperCase().startsWith("IF_")) {
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
    }
    return haveLabelStatus;
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
      "  -- token=[ln:" + (aToken.line + 1) + ",ofs:" + aToken.startCharacter + ",len:" + aToken.length + " [" + varName + "](" + aToken.ptTokenType + "[" + aToken.ptTokenModifiers + "])]";
    return desiredInterp;
  }

  private _rememberdTokenString(tokenName: string, aToken: RememberedToken | undefined): string {
    let desiredInterp: string = "  -- token=[len:" + tokenName.length + " [" + tokenName + "](undefined)";
    if (aToken != undefined) {
      desiredInterp = "  -- token=[len:" + tokenName.length + " [" + tokenName + "](" + aToken.type + "[" + aToken.modifiers + "])]";
    }
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
