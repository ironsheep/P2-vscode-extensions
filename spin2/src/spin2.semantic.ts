"use strict";
// src/spin2.semantic.ts

import * as vscode from "vscode";
//import { EndOfLine } from "vscode";

import { semanticConfiguration, reloadSemanticConfiguration } from "./spin2.extension.configuration";
import { DocumentFindings, RememberedComment, eCommentType, RememberedToken, eBLockType } from "./spin.semantic.findings";
import { ParseUtils, eDebugDisplayType, eParseState } from "./spin2.utils";
import { DocGenerator } from "./spin.document.generate";
import { RegionColorizer } from "./spin.color.regions";
import { isCurrentDocumentSpin1 } from "./spin.vscode.utils";
//import { start } from "repl";
import { editorForFilespec } from "./spin.vscode.utils";

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
    "pasmInline",
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

interface IFilteredStrings {
  lineNoQuotes: string;
  lineParts: string[];
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
export class Spin2DocumentSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
  private parseUtils = new ParseUtils();
  private docGenerator: DocGenerator;

  private spin2log: any = undefined;
  // adjust following true/false to show specific parsing debug
  private spin2DebugLogEnabled: boolean = true; // WARNING (REMOVE BEFORE FLIGHT)- change to 'false' - disable before commit
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

  private semanticFindings: DocumentFindings;
  private conEnumInProgress: boolean = false;

  // list of directives found in file
  private fileDirectives: ISpin2Directive[] = [];

  private configuration = semanticConfiguration;

  private currentMethodName: string = "";
  private currentFilespec: string = "";
  private codeBlockColorizer: RegionColorizer;

  private bRecordTrailingComments: boolean = false; // initially, we don't generate tokens for trailing comments on lines

  public constructor(sharedDocGenerator: DocGenerator, blockColorizer: RegionColorizer) {
    this.docGenerator = sharedDocGenerator;
    this.codeBlockColorizer = blockColorizer;
    if (this.spin2DebugLogEnabled) {
      if (this.spin2log === undefined) {
        //Create output channel
        this.spin2log = vscode.window.createOutputChannel("Spin2 Highlight DEBUG");
        this._logMessage("Spin2 log started.");
      } else {
        this._logMessage("\n\n------------------   NEW FILE ----------------\n\n");
      }
    }
    this.semanticFindings = new DocumentFindings(this.spin2DebugLogEnabled, this.spin2log);
  }

  public docFindings(): DocumentFindings {
    return this.semanticFindings;
  }

  async provideDocumentSemanticTokens(document: vscode.TextDocument, cancelToken: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
    // SEE https://www.codota.com/code/javascript/functions/vscode/CancellationToken/isCancellationRequested
    if (cancelToken) {
    } // silence our compiler for now... TODO: we should adjust loop so it can break on cancelToken.isCancellationRequested
    this._resetForNewDocument();
    this._logMessage("* Config: spinExtensionBehavior.highlightFlexspinDirectives: [" + this.configuration.highlightFlexspin + "]");
    this.currentFilespec = document.fileName;
    this._logMessage(`* provideDocumentSemanticTokens(${this.currentFilespec})`);

    const allTokens = this._parseText(document.getText());
    const builder = new vscode.SemanticTokensBuilder();
    allTokens.forEach((token) => {
      builder.push(token.line, token.startCharacter, token.length, this._encodeTokenType(token.ptTokenType), this._encodeTokenModifiers(token.ptTokenModifiers));
    });
    return builder.build();
  }

  private _encodeTokenType(tokenType: string): number {
    if (tokenTypes.has(tokenType)) {
      return tokenTypes.get(tokenType)!;
    } else if (tokenType === "notInLegend") {
      return tokenTypes.size + 2;
    }
    return 0;
  }

  private _resetForNewDocument(): void {
    this.semanticFindings.clear();
    this.conEnumInProgress = false;
    this.currentMethodName = "";
    this.semanticFindings.clearDebugDisplays();
    this.fileDirectives = [];
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

  // track comment preceding declaration line
  private priorSingleLineComment: string | undefined = undefined;
  private rightEdgeComment: string | undefined = undefined;

  private _declarationComment(): string | undefined {
    // return the most appropriate comment for declaration
    const desiredComment: string | undefined = this.priorSingleLineComment ? this.priorSingleLineComment : this.rightEdgeComment;
    // and clear them out since we used them
    this.priorSingleLineComment = undefined;
    this.rightEdgeComment = undefined;
    return desiredComment;
  }

  private _parseText(text: string): IParsedToken[] {
    // parse our entire file
    const lines = text.split(/\r\n|\r|\n/);
    let currState: eParseState = eParseState.inCon; // compiler defaults to CON at start
    let priorState: eParseState = currState;
    let prePasmState: eParseState = currState;

    // track block comments
    let currBlockComment: RememberedComment | undefined = undefined;
    let currSingleLineBlockComment: RememberedComment | undefined = undefined;

    const tokenSet: IParsedToken[] = [];

    // ==============================================================================
    // prepass to find declarations: PRI/PUB method, OBJ names, and VAR/DAT names
    //

    // -------------------- PRE-PARSE just locating symbol names --------------------
    // also track and record block comments (both braces and tic's!)
    // let's also track prior single line and trailing comment on same line
    this._logMessage(`---> Pre SCAN -- `);
    let bBuildingSingleLineCmtBlock: boolean = false;
    let bBuildingSingleLineDocCmtBlock: boolean = false;
    this.semanticFindings.recordBlockStart(eBLockType.isCon, 0); // spin file defaults to CON at 1st line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      const trimmedNonCommentLine: string = trimmedLine.length > 0 ? this.parseUtils.getNonCommentLineRemainder(0, line) : "";
      const offSet: number = trimmedNonCommentLine.length > 0 ? line.indexOf(trimmedNonCommentLine) + 1 : line.indexOf(trimmedLine) + 1;
      const tempComment = line.substring(trimmedNonCommentLine.length + offSet).trim();
      this.rightEdgeComment = tempComment.length > 0 ? tempComment : undefined;
      const sectionStatus = this._isSectionStartLine(line);
      const lineParts: string[] = trimmedNonCommentLine.split(/[ \t]/);

      // special blocks of doc-comment and non-doc comment lines handling
      if (bBuildingSingleLineDocCmtBlock && !trimmedLine.startsWith("''")) {
        // process single line doc-comment
        bBuildingSingleLineDocCmtBlock = false;
        // add record single line comment block if > 1 line and clear
        if (currSingleLineBlockComment) {
          currSingleLineBlockComment.closeAsSingleLineBlock(i - 1);
          // NOTE: single line doc comments can be 1 line long!!! (unlike single line non-doc comments)
          this._logMessage("---> Pre SCAN: found comment " + currSingleLineBlockComment.spanString());
          this.semanticFindings.recordComment(currSingleLineBlockComment);
          currSingleLineBlockComment = undefined;
        }
      } else if (bBuildingSingleLineCmtBlock && !trimmedLine.startsWith("'")) {
        // process single line non-doc comment
        bBuildingSingleLineCmtBlock = false;
        // add record single line comment block if > 1 line and clear
        if (currSingleLineBlockComment) {
          // NOTE: single line non-doc comments must be 2 or more lines long!!! (unlike single line doc comments)
          if (currSingleLineBlockComment.lineCount > 1) {
            currSingleLineBlockComment.closeAsSingleLineBlock(i - 1);
            this._logMessage("---> Pre SCAN: found comment " + currSingleLineBlockComment.spanString());
            this.semanticFindings.recordComment(currSingleLineBlockComment);
          }
          currSingleLineBlockComment = undefined;
        }
      }

      // now start our processing
      if (currState == eParseState.inMultiLineComment) {
        // in multi-line non-doc-comment, hunt for end '}' to exit
        // ALLOW {...} on same line without closing!
        let nestedOpeningOffset: number = -1;
        let closingOffset: number = -1;
        let currOffset: number = 0;
        let bFoundOpenClosePair: boolean = false;
        do {
          nestedOpeningOffset = trimmedLine.indexOf("{", currOffset);
          if (nestedOpeningOffset != -1) {
            bFoundOpenClosePair = false;
            // we have an opening {
            closingOffset = trimmedLine.indexOf("}", nestedOpeningOffset);
            if (closingOffset != -1) {
              // and we have a closing, ignore this see if we have next
              currOffset = closingOffset + 1;
              bFoundOpenClosePair = true;
            } else {
              currOffset = nestedOpeningOffset + 1;
            }
          }
        } while (nestedOpeningOffset != -1 && bFoundOpenClosePair);
        closingOffset = trimmedLine.indexOf("}", currOffset);
        if (closingOffset != -1) {
          // have close, comment ended
          // end the comment recording
          currBlockComment?.appendLastLine(i, line);
          // record new comment
          if (currBlockComment) {
            this.semanticFindings.recordComment(currBlockComment);
            this._logMessage("---> Pre SCAN: found comment " + currBlockComment.spanString());
            currBlockComment = undefined;
          }
          currState = priorState;
        } else {
          // add line to the comment recording
          currBlockComment?.appendLine(line);
        }
        //  DO NOTHING Let Syntax highlighting do this
        continue;
      } else if (currState == eParseState.inMultiLineDocComment) {
        // in multi-line doc-comment, hunt for end '}}' to exit
        let closingOffset = line.indexOf("}}");
        if (closingOffset != -1) {
          // have close, comment ended
          // end the comment recording
          currBlockComment?.appendLastLine(i, line);
          // record new comment
          if (currBlockComment) {
            this.semanticFindings.recordComment(currBlockComment);
            this._logMessage("---> Pre SCAN: found comment " + currBlockComment.spanString());
            currBlockComment = undefined;
          }
          currState = priorState;
        } else {
          // add line to the comment recording
          currBlockComment?.appendLine(line);
        }
        //  DO NOTHING Let Syntax highlighting do this
        continue;
      } else if (trimmedLine.length == 0) {
        // a blank line clears pending single line comments
        this.priorSingleLineComment = undefined;
        continue;
      } else if (this.parseUtils.isFlexspinPreprocessorDirective(lineParts[0])) {
        this._getPreProcessor_Declaration(0, i + 1, line);
        // a FlexspinPreprocessorDirective line clears pending single line comments
        this.priorSingleLineComment = undefined;
        continue;
      } else if (trimmedLine.startsWith("{{")) {
        // process multi-line doc comment
        let openingOffset = line.indexOf("{{");
        const closingOffset = line.indexOf("}}", openingOffset + 2);
        if (closingOffset != -1) {
          // is single line comment, just ignore it Let Syntax highlighting do this
          // record new single-line comment
          let oneLineComment = new RememberedComment(eCommentType.multiLineDocComment, i, line);
          oneLineComment.closeAsSingleLine();
          if (!oneLineComment.isBlankLine) {
            this.semanticFindings.recordComment(oneLineComment);
            this._logMessage("---> Pre SCAN: found comment " + oneLineComment.spanString());
          }
          currBlockComment = undefined; // just making sure...
        } else {
          // is open of multiline comment
          priorState = currState;
          currState = eParseState.inMultiLineDocComment;
          // start  NEW comment
          currBlockComment = new RememberedComment(eCommentType.multiLineDocComment, i, line);
          //  DO NOTHING Let Syntax highlighting do this
        }
        continue;
      } else if (trimmedLine.startsWith("{")) {
        // process possible multi-line non-doc comment
        // do we have a close on this same line?
        let openingOffset = line.indexOf("{");
        const closingOffset = line.indexOf("}", openingOffset + 1);
        if (closingOffset != -1) {
          // is single line comment, we can have Spin2 Directive in here
          this._getSpin2_Directive(0, i + 1, line);
        } else {
          // is open of multiline comment
          priorState = currState;
          currState = eParseState.inMultiLineComment;
          // start  NEW comment
          currBlockComment = new RememberedComment(eCommentType.multiLineComment, i, line);
          //  DO NOTHING Let Syntax highlighting do this
        }
        continue;
      } else if (bBuildingSingleLineDocCmtBlock && trimmedLine.startsWith("''")) {
        // process single line doc comment which follows one of same
        // we no longer have a prior single line comment
        this.priorSingleLineComment = undefined;
        // add to existing single line doc-comment block
        currSingleLineBlockComment?.appendLine(line);
        continue;
      } else if (bBuildingSingleLineCmtBlock && trimmedLine.startsWith("'")) {
        // process single line non-doc comment which follows one of same
        // we no longer have a prior single line comment
        this.priorSingleLineComment = undefined;
        // add to existing single line non-doc-comment block
        currSingleLineBlockComment?.appendLine(line);
        continue;
      } else if (trimmedLine.startsWith("''")) {
        // process single line doc comment
        this.priorSingleLineComment = trimmedLine; // record this line
        // create new single line doc-comment block
        bBuildingSingleLineDocCmtBlock = true;
        currSingleLineBlockComment = new RememberedComment(eCommentType.singleLineDocComment, i, line);
        continue;
      } else if (trimmedLine.startsWith("'")) {
        // process single line non-doc comment
        this.priorSingleLineComment = trimmedLine; // record this line
        // create new single line non-doc-comment block
        bBuildingSingleLineCmtBlock = true;
        currSingleLineBlockComment = new RememberedComment(eCommentType.singleLineComment, i, line);
        continue;
      } else if (sectionStatus.isSectionStart) {
        // mark end of method, if we were in a method
        this.semanticFindings.endPossibleMethod(i); // pass prior line number!

        currState = sectionStatus.inProgressStatus;
        // record start of next block in code
        //  NOTE: this causes end of prior block to be recorded
        let newBlockType: eBLockType = eBLockType.Unknown;
        if (currState == eParseState.inCon) {
          newBlockType = eBLockType.isCon;
        } else if (currState == eParseState.inDat) {
          newBlockType = eBLockType.isDat;
        } else if (currState == eParseState.inVar) {
          newBlockType = eBLockType.isVar;
        } else if (currState == eParseState.inObj) {
          newBlockType = eBLockType.isObj;
        } else if (currState == eParseState.inPub) {
          newBlockType = eBLockType.isPub;
        } else if (currState == eParseState.inPri) {
          newBlockType = eBLockType.isPri;
        }
        this.semanticFindings.recordBlockStart(newBlockType, i); // start new one which ends prior

        this._logState("- scan ln:" + (i + 1) + " currState=[" + currState + "]");
        // ID the remainder of the line
        if (currState == eParseState.inPub || currState == eParseState.inPri) {
          // process PUB/PRI method signature
          if (trimmedNonCommentLine.length > 3) {
            this._getPUB_PRI_Name(3, i + 1, line);
            // and record our fake signature for later use by signature help
            const docComment: RememberedComment = this._generateFakeCommentForSignature(0, i + 1, line);
            if (docComment._type != eCommentType.Unknown) {
              this.semanticFindings.recordFakeComment(docComment);
            } else {
              this._logState("- scan ln:" + (i + 1) + " no FAKE doc comment for this signature");
            }
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
            const nonStringLine: string = this.parseUtils.removeDoubleQuotedStrings(trimmedNonCommentLine);
            if (nonStringLine.toUpperCase().includes("ORG")) {
              this._logPASM("- (" + (i + 1) + "): pre-scan DAT line trimmedLine=[" + trimmedLine + "] now Dat PASM");
              prePasmState = currState;
              currState = eParseState.inDatPasm;
              this._getDAT_Declaration(0, i + 1, line); // let's get possible label on this ORG statement
              continue;
            }
          }
          this._getDAT_Declaration(0, i + 1, line);
        } else if (currState == eParseState.inObj) {
          // process an object line
          if (trimmedNonCommentLine.length > 3) {
            this._getOBJ_Declaration(3, i + 1, line);
          }
        } else if (currState == eParseState.inVar) {
          // process a instance-variable line
          if (trimmedNonCommentLine.length > 3) {
            this._getVAR_Declaration(3, i + 1, line);
          }
        }
        // we processed the block declaration line, now wipe out prior comment
        this.priorSingleLineComment = undefined; // clear it out...
        continue;
      } else if (currState == eParseState.inCon) {
        // process a constant line
        if (trimmedLine.length > 0) {
          this._getCON_Declaration(0, i + 1, line);
        }
      } else if (currState == eParseState.inDat) {
        // process a data line
        if (trimmedLine.length > 0) {
          if (trimmedLine.toUpperCase().includes("ORG")) {
            // ORG, ORGF, ORGH
            const nonStringLine: string = this.parseUtils.removeDoubleQuotedStrings(trimmedLine);
            if (nonStringLine.toUpperCase().includes("ORG")) {
              this._logPASM("- (" + (i + 1) + "): pre-scan DAT line trimmedLine=[" + trimmedLine + "] now Dat PASM");
              prePasmState = currState;
              currState = eParseState.inDatPasm;
              this._getDAT_Declaration(0, i + 1, line); // let's get possible label on this ORG statement
              continue;
            }
          }
          this._getDAT_Declaration(0, i + 1, line); // get label from line in DAT BLOCK
        }
      } else if (currState == eParseState.inVar) {
        // process a variable declaration line
        if (trimmedLine.length > 0) {
          this._getVAR_Declaration(0, i + 1, line);
        }
      } else if (currState == eParseState.inObj) {
        // process an object declaration line
        if (trimmedLine.length > 0) {
          this._getOBJ_Declaration(0, i + 1, line);
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
            this._getSPIN_PasmDeclaration(0, i + 1, line);
            // scan SPIN-Inline-Pasm line for debug() display declaration
            this._getDebugDisplay_Declaration(0, i + 1, line);
          }
        }
      } else if (currState == eParseState.inDatPasm) {
        // process pasm (assembly) lines
        if (trimmedLine.length > 0) {
          const isDebugLine: boolean = trimmedNonCommentLine.toLowerCase().includes("debug(");
          const lineParts: string[] = trimmedLine.split(/[ \t]/);
          if (lineParts.length > 0) {
            if (lineParts[0].toUpperCase() == "FIT") {
              this._logPASM("- (" + (i + 1) + "): pre-scan DAT PASM line trimmedLine=[" + trimmedLine + "]");
              currState = prePasmState;
              this._logState("- scan ln:" + (i + 1) + " POP currState=[" + currState + "]");
              // and ignore rest of this line
            } else {
              this._getDAT_PasmDeclaration(0, i + 1, line);
              if (isDebugLine) {
                // scan DAT-Pasm line for debug() display declaration
                this._getDebugDisplay_Declaration(0, i + 1, line);
              }
            }
          }
        }
      } else if (currState == eParseState.inPub || currState == eParseState.inPri) {
        // Detect start of INLINE PASM - org detect
        // NOTE: The directives ORGH, ALIGNW, ALIGNL, and FILE are not allowed within in-line PASM code.
        if (trimmedLine.length > 0) {
          const isDebugLine: boolean = trimmedNonCommentLine.toLowerCase().includes("debug(");
          const lineParts: string[] = trimmedLine.split(/[ \t]/);
          if (lineParts.length > 0 && lineParts[0].toUpperCase() == "ORG") {
            // Only ORG, not ORGF or ORGH
            this._logPASM("- (" + (i + 1) + "): pre-scan PUB/PRI line trimmedLine=[" + trimmedLine + "]");
            prePasmState = currState;
            currState = eParseState.inPasmInline;
            // and ignore rest of this line
          } else {
            if (isDebugLine) {
              // scan SPIN2 line for debug() display declaration
              this._getDebugDisplay_Declaration(0, i + 1, line);
            } else {
              // scan SPIN2 line for object constant or method() uses
              this._getSpin2ObjectConstantMethodDeclaration(0, i + 1, line);
            }
          }
        }
      }
      // we processed statements in this line, now clear prior comment associated with this line
      this.priorSingleLineComment = undefined; // clear it out...
    }
    this.semanticFindings.endPossibleMethod(lines.length - 1); // report end if last line of file
    this.semanticFindings.finishFinalBlock(lines.length - 1); // mark end of final block in file

    // now update editor colors
    const editorForFile: vscode.TextEditor = editorForFilespec(this.currentFilespec);
    this.codeBlockColorizer.updateRegionColors(editorForFile, this.semanticFindings, "Spin2-end1stPass");

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
        // ALLOW {...} on same line without closing!
        this._logMessage("    hunt for '}' ln:" + (i + 1) + " trimmedLine=[" + trimmedLine + "]");
        let nestedOpeningOffset: number = -1;
        let closingOffset: number = -1;
        let currOffset: number = 0;
        let bFoundOpenClosePair: boolean = false;
        let bFoundNestedOpen: boolean = false;
        do {
          nestedOpeningOffset = trimmedLine.indexOf("{", currOffset);
          if (nestedOpeningOffset != -1) {
            bFoundOpenClosePair = false;
            bFoundNestedOpen = true;
            // we have an opening {
            closingOffset = trimmedLine.indexOf("}", nestedOpeningOffset);
            if (closingOffset != -1) {
              // and we have a closing, ignore this see if we have next
              currOffset = closingOffset + 1;
              bFoundOpenClosePair = true;
              this._logMessage("    skip {...} ln:" + (i + 1) + " nestedOpeningOffset=(" + nestedOpeningOffset + "), closingOffset=(" + closingOffset + ")");
            } else {
              currOffset = nestedOpeningOffset + 1;
            }
          }
        } while (nestedOpeningOffset != -1 && bFoundOpenClosePair);
        closingOffset = trimmedLine.indexOf("}", currOffset);
        if (closingOffset != -1) {
          // have close, comment ended
          this._logMessage("    FOUND '}' ln:" + (i + 1) + " trimmedLine=[" + trimmedLine + "]");
          currState = priorState;
        }
        continue;
      } else if (currState == eParseState.inMultiLineDocComment) {
        // in multi-line doc-comment, hunt for end '}}' to exit
        let closingOffset = line.indexOf("}}");
        if (closingOffset != -1) {
          // have close, comment ended
          currState = priorState;
        }
        //  DO NOTHING Let Syntax highlighting do this
      } else if (this.parseUtils.isFlexspinPreprocessorDirective(lineParts[0])) {
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
              const nonCommentLineRemainder: string = this.parseUtils.getNonCommentLineRemainder(0, trimmedLine);
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
                const nonStringLine: string = this.parseUtils.removeDoubleQuotedStrings(nonCommentLineRemainder);
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
          const nonCommentLineRemainder: string = this.parseUtils.getNonCommentLineRemainder(0, trimmedLine);
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
            const nonStringLine: string = this.parseUtils.removeDoubleQuotedStrings(nonCommentLineRemainder);
            orgOffset = nonStringLine.toUpperCase().indexOf(orgStr); // ORG, ORGF, ORGH
          }
          if (orgOffset != -1) {
            // process ORG line allowing label to be present
            const partialTokenSet: IParsedToken[] = this._reportDAT_DeclarationLine(i, 0, line);
            partialTokenSet.forEach((newToken) => {
              this._logDAT("=> DAT: " + this._tokenString(newToken, line));
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
            this._logOBJ("=> VAR: " + this._tokenString(newToken, line));
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
              this._logSPIN("=> DEBUG: " + this._tokenString(newToken, line));
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

  private _generateFakeCommentForSignature(startingOffset: number, lineNbr: number, line: string): RememberedComment {
    if (startingOffset) {
    } // kill warning
    let desiredComment: RememberedComment = new RememberedComment(eCommentType.Unknown, -1, "");
    const linePrefix: string = line.substring(0, 3).toLowerCase();
    const isSignature: boolean = linePrefix == "pub" || linePrefix == "pri" ? true : false;
    const isPri: boolean = linePrefix == "pri" ? true : false;
    this._logSPIN(" -- gfcfs linePrefix=[" + linePrefix + "](" + linePrefix.length + ")" + `, isSignature=${isSignature},  isPri=${isPri}`);
    if (isSignature) {
      const cmtType: eCommentType = isPri ? eCommentType.multiLineComment : eCommentType.multiLineDocComment;
      let tmpDesiredComment: RememberedComment = new RememberedComment(cmtType, lineNbr, "NOTE: insert comment template by pressing Ctrl+Alt+C on PRI signature line, then fill it in.");
      const bIsSpin1: boolean = isCurrentDocumentSpin1();
      const signatureComment: string[] = this.docGenerator.generateDocCommentForSignature(line, bIsSpin1);
      if (signatureComment && signatureComment.length > 0) {
        let lineCount: number = 1; // count our comment line on creation
        for (let cmtIdx = 0; cmtIdx < signatureComment.length; cmtIdx++) {
          const currCmtLine: string = signatureComment[cmtIdx];
          if (currCmtLine.includes("@param")) {
            tmpDesiredComment.appendLine(currCmtLine + "no parameter comment found");
            lineCount++; // count this line, too
          }
        }
        tmpDesiredComment.closeAsSingleLineBlock(lineNbr + lineCount - 1);
        if (lineCount > 1) {
          desiredComment = tmpDesiredComment; // only return this if we have params!
          this._logSPIN("=> SPIN: generated signature comment: sig=[" + line + "]");
        } else {
          this._logSPIN("=> SPIN: SKIPped generation of signature comment: sig=[" + line + "]");
        }
      }
    }
    return desiredComment;
  }

  private _getSpin2_Directive(startingOffset: number, lineNbr: number, line: string): void {
    // HAVE {-* VSCode-Spin2: nextline debug()-display: bitmap  *-}
    // (only this one so far)
    if (line.toLowerCase().indexOf("{-* vscode-spin2:") != -1) {
      this._logMessage("- _getSpin2_Directive: ofs:" + startingOffset + ", [" + line + "](" + lineNbr + ")");
      // have possible directive
      let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
      // get line parts - we only care about first one
      let lineParts: string[] = line
        .substring(currentOffset)
        .toLowerCase()
        .split(/[ \t,]/)
        .filter((element) => element);
      this._logMessage("  -- lineParts=[" + lineParts + "](" + lineParts.length + ")");
      if (lineParts.length > 4 && lineParts[3] == "debug()-display:") {
        for (let index = 4; index < lineParts.length - 1; index++) {
          const displayType: string = lineParts[index];
          this._recordDisplayTypeForLine(displayType, lineNbr);
        }
      }
    }
  }

  private _getSpin2ObjectConstantMethodDeclaration(startingOffset: number, lineNbr: number, line: string): void {
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    const remainingNonCommentLineStr: string = this.parseUtils.getNonCommentLineRemainder(currentOffset, line);
    //this._logOBJ('- RptObjDecl remainingNonCommentLineStr=[' + remainingNonCommentLineStr + ']');
    const bHasDotRefs: boolean = remainingNonCommentLineStr.includes(".");
    if (bHasDotRefs) {
      // get line parts - we only care about first one
      const lineParts: string[] = remainingNonCommentLineStr.split(/[ \t=]/).filter(Boolean);
      this._logSPIN("  - ln:" + lineNbr + " GetSpinObjConstMethDecl lineParts=[" + lineParts + "](" + lineParts.length + ")");
      for (let partIdx = 0; partIdx < lineParts.length; partIdx++) {
        const possObjRef = lineParts[partIdx];
        if (possObjRef.includes(".")) {
          const bISMethod: boolean = possObjRef.includes("(");
          const nameParts: string[] = possObjRef.split(/[\.\(]/).filter(Boolean);
          if (nameParts.length > 1) {
            const objName: string = nameParts[0];
            const objRef: string = nameParts[1];
            if (objName.charAt(0).match(/[a-zA-Z_]/) && objRef.charAt(0).match(/[a-zA-Z_]/)) {
              this._logSPIN("  ---  nameParts=[" + nameParts + "](" + nameParts.length + ")");
              //this._logOBJ("  -- GLBL GetOBJDecl newName=[" + nameParts[0] + "]");
              // remember this object name so we can annotate a call to it
              this._logSPIN("  --- objName=[" + objName + "], objRef=[" + objRef + "]");
              if (bISMethod) {
                this.semanticFindings.setGlobalToken(objRef, new RememberedToken("method", []), lineNbr, this._declarationComment(), objName);
              } else {
                this.semanticFindings.setGlobalToken(objRef, new RememberedToken("variable", ["readonly"]), lineNbr, this._declarationComment(), objName);
              }
            }
          }
        }
      }
    }
  }

  private _getPreProcessor_Declaration(startingOffset: number, lineNbr: number, line: string): void {
    if (this.configuration.highlightFlexspin) {
      let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
      const nonCommentConstantLine = this.parseUtils.getNonCommentLineRemainder(currentOffset, line);
      // get line parts - we only care about first one
      const lineParts: string[] = nonCommentConstantLine.split(/[ \t=]/);
      this._logPreProc("  - ln:" + lineNbr + " GetPreProcDecl lineParts=[" + lineParts + "]");
      const directive: string = lineParts[0];
      const symbolName: string | undefined = lineParts.length > 1 ? lineParts[1] : undefined;
      if (this.parseUtils.isFlexspinPreprocessorDirective(directive)) {
        // check a valid preprocessor line for a declaration
        if (symbolName != undefined && directive.toLowerCase() == "#define") {
          this._logPreProc("  -- new PreProc Symbol=[" + symbolName + "]");
          this.semanticFindings.setGlobalToken(symbolName, new RememberedToken("variable", ["readonly"]), lineNbr, this._declarationComment());
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
      let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
      const nonCommentConstantLine = this.parseUtils.getNonCommentLineRemainder(currentOffset, line);
      this._logCON("  - ln:" + lineNbr + " GetCONDecl nonCommentConstantLine=[" + nonCommentConstantLine + "]");

      const haveEnumDeclaration: boolean = nonCommentConstantLine.startsWith("#");
      const containsMultiAssignments: boolean = nonCommentConstantLine.indexOf(",") != -1;
      this._logCON("  -- haveEnumDeclaration=[" + haveEnumDeclaration + "], containsMultiAssignments=[" + containsMultiAssignments + "]");
      let statements: string[] = [nonCommentConstantLine];
      if (!haveEnumDeclaration && containsMultiAssignments) {
        statements = nonCommentConstantLine.split(",").filter(Boolean);
      }
      // FIXME: broken: how to handle enum declaration statements??
      // this works: #0, HV_1, HV_2, HV_3, HV_4, HV_MAX = HV_4
      // this doesn't: #2[3], TV_1 = 4, TV_2 = 2, TV_3 = 5, TV_4 = 7
      this._logCON("  -- statements=[" + statements + "](" + statements.length + ")");
      for (let index = 0; index < statements.length; index++) {
        const conDeclarationLine: string = statements[index].trim();
        this._logCON("  -- conDeclarationLine=[" + conDeclarationLine + "]");
        currentOffset = line.indexOf(conDeclarationLine, currentOffset);
        const assignmentOffset: number = conDeclarationLine.indexOf("=");
        if (!haveEnumDeclaration && assignmentOffset != -1) {
          // recognize constant name getting initialized via assignment
          // get line parts - we only care about first one
          const lineParts: string[] = line
            .substr(currentOffset)
            .split(/[ \t=]/)
            .filter(Boolean);
          this._logCON("  -- GetCONDecl assign lineParts=[" + lineParts + "](" + lineParts.length + ")");
          const newName = lineParts[0];
          if (newName.charAt(0).match(/[a-zA-Z_]/) && !this.parseUtils.isP1asmVariable(newName)) {
            this._logCON("  -- GLBL GetCONDecl newName=[" + newName + "]");
            // remember this object name so we can annotate a call to it
            this.semanticFindings.setGlobalToken(newName, new RememberedToken("variable", ["readonly"]), lineNbr, this._declarationComment());
          }
        } else {
          // recognize enum values getting initialized
          const lineParts: string[] = conDeclarationLine.split(/[ \t,]/).filter(Boolean);
          this._logCON("  -- GetCONDecl enumDecl lineParts=[" + lineParts + "](" + lineParts.length + ")");
          //this._logCON('  -- lineParts=[' + lineParts + ']');
          for (let index = 0; index < lineParts.length; index++) {
            let enumConstant: string = lineParts[index];
            // use parseUtils.isDebugInvocation to filter out use of debug invocation command from constant def'
            if (this.parseUtils.isDebugInvocation(enumConstant)) {
              continue; // yep this is not a constant
            } else if (this.parseUtils.isP1asmVariable(enumConstant)) {
              this._logCON("  -- GLBL PASM1 skipped=[" + enumConstant + "]");
              continue; // yep this is not a constant
            } else {
              // our enum name can have a step offset
              if (enumConstant.includes("[")) {
                // it does, isolate name from offset
                const enumNameParts: string[] = enumConstant.split("[");
                enumConstant = enumNameParts[0];
              }
              if (enumConstant.charAt(0).match(/[a-zA-Z_]/)) {
                this._logCON("  -- C GLBL enumConstant=[" + enumConstant + "]");
                this.semanticFindings.setGlobalToken(enumConstant, new RememberedToken("enumMember", ["readonly"]), lineNbr, this._declarationComment());
              }
            }
          }
        }
      }
    }
  }

  private _getDAT_Declaration(startingOffset: number, lineNbr: number, line: string): void {
    // HAVE    bGammaEnable        BYTE   TRUE               ' comment
    //         didShow             byte   FALSE[256]
    //                             byte   FALSE[256]
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    // get line parts - we only care about first one
    const dataDeclNonCommentStr = this.parseUtils.getNonCommentLineRemainder(currentOffset, line);
    const lineParts: string[] = this.parseUtils.getNonWhiteNOperatorLineParts(dataDeclNonCommentStr);
    this._logDAT("  - ln:" + lineNbr + " GetDatDecl lineParts=[" + lineParts + "](" + lineParts.length + ")");
    const bHaveDatBlockId: boolean = lineParts[0].toUpperCase() == "DAT";
    const minDecodeCount: number = bHaveDatBlockId ? 2 : 1;
    if (lineParts.length >= minDecodeCount) {
      const baseIndex: number = bHaveDatBlockId ? 1 : 0;
      const nameIndex: number = baseIndex + 0;
      const haveLabel: boolean = lineParts.length > nameIndex ? this.parseUtils.isDatOrPasmLabel(lineParts[nameIndex]) : false;
      const typeIndex: number = haveLabel ? baseIndex + 1 : baseIndex + 0;
      const dataType: string | undefined = lineParts.length > typeIndex ? lineParts[typeIndex] : undefined;
      const haveStorageType: boolean = dataType ? this.parseUtils.isDatStorageType(dataType) : false;
      const isNamedDataDeclarationLine: boolean = haveLabel && haveStorageType ? true : false;
      const isDataDeclarationLine: boolean = haveStorageType ? true : false;

      const lblFlag: string = haveLabel ? "T" : "F";
      const dataDeclFlag: string = isDataDeclarationLine ? "T" : "F";
      const newName = haveLabel ? lineParts[nameIndex] : "";

      const dataTypeOffset: number = dataType && haveStorageType ? dataDeclNonCommentStr.indexOf(dataType) : 0;
      const valueDeclNonCommentStr: string = dataType && isDataDeclarationLine && dataTypeOffset != -1 ? dataDeclNonCommentStr.substring(dataTypeOffset + dataType.length).trim() : "";
      this._logDAT("   -- GetDatDecl valueDeclNonCommentStr=[" + valueDeclNonCommentStr + "](" + valueDeclNonCommentStr.length + ")");
      const bIsFileLine: boolean = dataType && dataType.toLowerCase() == "file" ? true : false;
      this._logDAT("   -- GetDatDecl newName=[" + newName + "], label=" + lblFlag + ", daDecl=" + dataDeclFlag + ", dataType=[" + dataType + "]");
      if (
        haveLabel &&
        !this.parseUtils.isPasmReservedWord(newName) &&
        !this.parseUtils.isSpinBuiltInVariable(newName) &&
        !this.parseUtils.isSpinReservedWord(newName) &&
        !this.parseUtils.isBuiltinReservedWord(newName) &&
        // add p1asm detect
        !this.parseUtils.isP1asmInstruction(newName) &&
        !this.parseUtils.isP1asmVariable(newName) &&
        !this.parseUtils.isP1asmConditional(newName)
      ) {
        const nameType: string = isNamedDataDeclarationLine ? "variable" : "label"; // XYZZY
        var labelModifiers: string[] = [];
        if (!isNamedDataDeclarationLine) {
          if (newName.startsWith(":")) {
            labelModifiers = ["illegalUse", "static"];
          } else {
            labelModifiers = newName.startsWith(".") ? ["static"] : [];
          }
        }
        this._logDAT("   -- GetDatDecl GLBL-newName=[" + newName + "](" + nameType + ")");
        const fileName: string | undefined = bIsFileLine && lineParts.length > 2 ? lineParts[2] : undefined;
        this._logDAT("   -- GetDatDecl fileName=[" + fileName + "]");
        this.semanticFindings.setGlobalToken(newName, new RememberedToken(nameType, labelModifiers), lineNbr, this._declarationComment(), fileName);
      }
      // check for names in value declaration
      if (valueDeclNonCommentStr.length > 0) {
        //let possObjRef: string | undefined = haveObjectRef ? lineParts[firstValueIndex] : undefined;
        const bISMethod: boolean = valueDeclNonCommentStr.includes("(");
        const valueParts: string[] = valueDeclNonCommentStr.split(/[ \t\(\[\]\+\-\*\/]/).filter(Boolean);
        this._logDAT("   -- GetDatDecl valueParts=[" + valueParts + "](" + valueParts.length + ")");
        if (valueParts.length > 1) {
          // for all name parts see if we want to report any to global tables...
          for (let index = 0; index < valueParts.length; index++) {
            const currNamePart = valueParts[index];
            // do we have name not number?
            if (currNamePart.charAt(0).match(/[a-zA-Z_]/)) {
              const haveObjectRef: boolean = currNamePart.indexOf(".") != -1;
              if (haveObjectRef) {
                const objRefParts: string[] = currNamePart.split(".");
                const objName: string = objRefParts[0];
                const objRef: string = objRefParts[1];
                // if both parts are names...
                if (objName.charAt(0).match(/[a-zA-Z_]/) && objRef.charAt(0).match(/[a-zA-Z_]/)) {
                  this._logDAT("   -- GetDatDecl objRefParts=[" + objRefParts + "](" + objRefParts.length + ")");
                  // remember this object name so we can annotate a call to it
                  this._logDAT("   -- GetDatDecl objName=[" + objName + "], objRef=[" + objRef + "]");
                  if (bISMethod) {
                    this.semanticFindings.setGlobalToken(objRef, new RememberedToken("method", []), lineNbr, this._declarationComment(), objName);
                  } else {
                    this.semanticFindings.setGlobalToken(objRef, new RememberedToken("variable", ["readonly"]), lineNbr, this._declarationComment(), objName);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  private _getDAT_PasmDeclaration(startingOffset: number, lineNbr: number, line: string): void {
    // HAVE    bGammaEnable        BYTE   TRUE               ' comment
    //         didShow             byte   FALSE[256]
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    // get line parts - we only care about first one
    const datPasmRHSStr = this.parseUtils.getNonCommentLineRemainder(currentOffset, line);
    const lineParts: string[] = this.parseUtils.getNonWhiteLineParts(datPasmRHSStr);
    this._logPASM("  - ln:" + lineNbr + " GetDATPasmDecl lineParts=[" + lineParts + "](" + lineParts.length + ")");
    // handle name in 1 column
    let haveLabel: boolean = this.parseUtils.isDatOrPasmLabel(lineParts[0]);
    const bIsFileLine: boolean = haveLabel && lineParts.length > 1 && lineParts[1].toLowerCase() == "file";
    const isDataDeclarationLine: boolean = lineParts.length > 1 && haveLabel && this.parseUtils.isDatStorageType(lineParts[1]) ? true : false;
    if (haveLabel) {
      const labelName: string = lineParts[0];
      if (
        !this.parseUtils.isReservedPasmSymbols(labelName) &&
        !this.parseUtils.isPasmInstruction(labelName) &&
        !labelName.toUpperCase().startsWith("IF_") &&
        !labelName.toUpperCase().startsWith("_RET_") &&
        !labelName.startsWith(":")
      ) {
        // org in first column is not label name, nor is if_ conditional
        const labelType: string = isDataDeclarationLine ? "variable" : "label";
        var labelModifiers: string[] = [];
        if (!isDataDeclarationLine) {
          labelModifiers = labelName.startsWith(".") ? ["static"] : [];
        }
        this._logPASM("  -- DAT PASM GLBL labelName=[" + labelName + "(" + labelType + ")]");
        const fileName: string | undefined = bIsFileLine && lineParts.length > 2 ? lineParts[2] : undefined;
        this._logDAT("   -- DAT PASM GLBL fileName=[" + fileName + "]");
        this.semanticFindings.setGlobalToken(labelName, new RememberedToken(labelType, labelModifiers), lineNbr, this._declarationComment(), fileName);
      }
    }
  }

  private _getOBJ_Declaration(startingOffset: number, lineNbr: number, line: string): void {
    // HAVE    color           : "isp_hub75_color"
    //  -or-   segments[7]     : "isp_hub75_segment"
    //
    //skip Past Whitespace
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    const remainingNonCommentLineStr: string = this.parseUtils.getNonCommentLineRemainder(currentOffset, line);
    //this._logOBJ('- RptObjDecl remainingNonCommentLineStr=[' + remainingNonCommentLineStr + ']');
    const bHasOverrides: boolean = remainingNonCommentLineStr.includes("|");
    const overrideParts: string[] = remainingNonCommentLineStr.split("|");

    const remainingLength: number = remainingNonCommentLineStr.length;
    if (remainingLength > 0) {
      // get line parts - we only care about first one
      const lineParts: string[] = remainingNonCommentLineStr.split(/[ \t\|\[\]\:]/).filter(Boolean);
      this._logOBJ("  - ln:" + lineNbr + " GetOBJDecl lineParts=[" + lineParts + "](" + lineParts.length + ")");
      const newName = lineParts[0];
      this._logOBJ("  -- GLBL GetOBJDecl newName=[" + newName + "]");
      // remember this object name so we can annotate a call to it
      this.semanticFindings.setGlobalToken(newName, new RememberedToken("namespace", []), lineNbr, this._declarationComment(), lineParts[1]); // pass filename, too

      // if we have override parts handle 'em
      if (bHasOverrides && overrideParts.length > 1) {
        const overrides: string = overrideParts[1].replace(/[ \t]/, "");
        const overideSatements: string[] = overrides.split(",");
        this._logOBJ("  -- GLBL GetOBJDecl overideSatements=[" + overideSatements + "]");
        for (let index = 0; index < overideSatements.length; index++) {
          const statementParts: string[] = overideSatements[index].split("=");
          const overideName: string = statementParts[0].trim();
          this._logOBJ("  -- GLBL GetOBJDecl overideName=[" + overideName + "]");
          this.semanticFindings.setGlobalToken(overideName, new RememberedToken("variable", ["readonly"]), lineNbr, this._declarationComment());
        }
      }
    }
  }

  private _getPUB_PRI_Name(startingOffset: number, lineNbr: number, line: string): void {
    const methodType = line.substr(0, 3).toUpperCase();
    // reset our list of local variables
    const isPrivate: boolean = methodType.indexOf("PRI") != -1;
    //const matchIdx: number = methodType.indexOf("PRI");
    //this._logSPIN("  - ln:" + lineNbr + " GetMethodDecl methodType=[" + methodType + "], isPrivate(" + isPrivate + ")");

    //skip Past Whitespace
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    const remainingNonCommentLineStr: string = this.parseUtils.getNonCommentLineRemainder(0, line);
    const startNameOffset = currentOffset;
    // find open paren
    // find open paren
    currentOffset = remainingNonCommentLineStr.indexOf("(", startNameOffset); // in spin1 ()'s are optional!
    if (currentOffset == -1) {
      currentOffset = remainingNonCommentLineStr.indexOf(":", startNameOffset);
      if (currentOffset == -1) {
        currentOffset = remainingNonCommentLineStr.indexOf("|", startNameOffset);
        if (currentOffset == -1) {
          currentOffset = remainingNonCommentLineStr.indexOf(" ", startNameOffset);
          if (currentOffset == -1) {
            currentOffset = remainingNonCommentLineStr.indexOf("'", startNameOffset);
            // if nothibng found...
            if (currentOffset == -1) {
              currentOffset = remainingNonCommentLineStr.length;
            }
          }
        }
      }
    }

    let nameLength = currentOffset - startNameOffset;
    const methodName = line.substr(startNameOffset, nameLength).trim();
    const nameType: string = isPrivate ? "private" : "public";
    this._logSPIN("  - ln:" + lineNbr + " _getPUB_PRI_Name() newName=[" + methodName + "](" + nameType + ")");
    this.currentMethodName = methodName; // notify of latest method name so we can track inLine PASM symbols
    // mark start of method - we are learning span of lines this method covers
    this.semanticFindings.startMethod(methodName, lineNbr);
    // remember this method name so we can annotate a call to it
    const refModifiers: string[] = isPrivate ? ["static"] : [];
    this.semanticFindings.setGlobalToken(methodName, new RememberedToken("method", refModifiers), lineNbr, this._declarationComment());
    // reset our list of local variables
    this.semanticFindings.clearLocalPasmTokensForMethod(methodName);
    this._logSPIN("  -- _getPUB_PRI_Name() exit");
  }

  private _getSPIN_PasmDeclaration(startingOffset: number, lineNbr: number, line: string): void {
    // HAVE    next8SLine ' or .nextLine in col 0
    //         nPhysLineIdx        long    0
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    // get line parts - we only care about first one
    const inLinePasmRHSStr = this.parseUtils.getNonCommentLineRemainder(currentOffset, line);
    const lineParts: string[] = this.parseUtils.getNonWhiteLineParts(inLinePasmRHSStr);
    //this._logPASM('- GetInLinePasmDecl lineParts=[' + lineParts + ']');
    // handle name in 1 column
    let haveLabel: boolean = this.parseUtils.isDatOrPasmLabel(lineParts[0]);
    const isDataDeclarationLine: boolean = lineParts.length > 1 && haveLabel && this.parseUtils.isDatStorageType(lineParts[1]) ? true : false;
    if (haveLabel) {
      const labelName: string = lineParts[0];
      const labelType: string = isDataDeclarationLine ? "variable" : "label";
      var labelModifiers: string[] = [];
      if (!isDataDeclarationLine) {
        labelModifiers = labelName.startsWith(".") ? ["pasmInline", "static"] : ["pasmInline"];
      } else {
        labelModifiers = ["pasmInline"];
      }
      this._logPASM("  -- Inline PASM labelName=[" + labelName + "(" + labelType + ")[" + labelModifiers + "]]");
      this.semanticFindings.setLocalPasmTokenForMethod(this.currentMethodName, labelName, new RememberedToken(labelType, labelModifiers), lineNbr, this._declarationComment());
    }
  }

  private _getVAR_Declaration(startingOffset: number, lineNbr: number, line: string): void {
    // HAVE    long    demoPausePeriod   ' comment
    //
    //skip Past Whitespace
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    const remainingNonCommentLineStr: string = this.parseUtils.getNonCommentLineRemainder(currentOffset, line);
    //this._logVAR("  - ln:" + lineNbr + " GetVarDecl remainingNonCommentLineStr=[" + remainingNonCommentLineStr + "]");
    const isMultiDeclaration: boolean = remainingNonCommentLineStr.includes(",");
    let lineParts: string[] = this.parseUtils.getNonWhiteDataInitLineParts(remainingNonCommentLineStr);
    const hasGoodType: boolean = this.parseUtils.isStorageType(lineParts[0]);
    this._logVAR("  - ln:" + lineNbr + " GetVarDecl lineParts=[" + lineParts + "](" + lineParts.length + ")");
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
        if (newName.charAt(0).match(/[a-zA-Z_]/)) {
          this._logVAR("  -- GLBL GetVarDecl newName=[" + newName + "]");
          this.semanticFindings.setGlobalToken(newName, new RememberedToken("variable", ["instance"]), lineNbr, this._declarationComment());
        }
      }
    } else if (!hasGoodType && lineParts.length > 0) {
      for (let index = 0; index < lineParts.length; index++) {
        const longVarName = lineParts[index];
        if (longVarName.charAt(0).match(/[a-zA-Z_]/)) {
          this._logVAR("  -- GLBL GetVarDecl newName=[" + longVarName + "]");
          this.semanticFindings.setGlobalToken(longVarName, new RememberedToken("variable", ["instance"]), lineNbr, this._declarationComment());
        }
      }
    }
  }

  private _getDebugDisplay_Declaration(startingOffset: number, lineNbr: number, line: string): void {
    // locate and collect debug() display user names and types
    //
    // HAVE    debug(`{displayType} {displayName} ......)            ' comment
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    // get line parts - we only care about first one
    const datPasmStatementStr = this.parseUtils.getNonDocCommentLineRemainder(currentOffset, line);
    if (datPasmStatementStr.toLowerCase().startsWith("debug(`")) {
      const lineParts: string[] = this.parseUtils.getDebugNonWhiteLineParts(datPasmStatementStr);
      //this._logDEBUG('  -- debug(...) lineParts=[' + lineParts + ']');
      if (lineParts.length >= 3) {
        const displayType: string = lineParts[1];
        if (displayType.startsWith("`")) {
          const newDisplayType: string = displayType.substring(1, displayType.length);
          //this._logDEBUG('  --- debug(...) newDisplayType=[' + newDisplayType + ']');
          if (this.parseUtils.isDebugDisplayType(newDisplayType)) {
            const newDisplayName: string = lineParts[2];
            //this._logDEBUG('  --- debug(...) newDisplayType=[' + newDisplayType + '], newDisplayName=[' + newDisplayName + ']');
            this.semanticFindings.setUserDebugDisplay(newDisplayType, newDisplayName, lineNbr);
          }
        }
      }
    }
  }

  private _reportPreProcessorLine(lineIdx: number, startingOffset: number, line: string): IParsedToken[] {
    const lineNbr: number = lineIdx + 1;
    const tokenSet: IParsedToken[] = [];
    // skip Past Whitespace
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    const nonCommentConstantLine = this.parseUtils.getNonCommentLineRemainder(currentOffset, line);
    // get line parts - we only care about first one
    const lineParts: string[] = nonCommentConstantLine.split(/[ \t=]/);
    this._logPreProc("  - ln:" + lineNbr + " reportPreProc lineParts=[" + lineParts + "]");
    const directive: string = lineParts[0];
    const symbolName: string | undefined = lineParts.length > 1 ? lineParts[1] : undefined;
    if (this.configuration.highlightFlexspin) {
      if (this.parseUtils.isFlexspinPreprocessorDirective(directive)) {
        // record the directive
        tokenSet.push({
          line: lineIdx,
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
          if (this.semanticFindings.isGlobalToken(symbolName)) {
            referenceDetails = this.semanticFindings.getGlobalToken(symbolName);
            this._logPreProc("  --  FOUND preProc global " + this._rememberdTokenString(symbolName, referenceDetails));
          }
          if (referenceDetails != undefined) {
            // record a constant declaration!
            const updatedModificationSet: string[] = directive.toLowerCase() == "#define" ? referenceDetails.modifiersWith("declaration") : referenceDetails.modifiers;
            tokenSet.push({
              line: lineIdx,
              startCharacter: nameOffset,
              length: symbolName.length,
              ptTokenType: referenceDetails.type,
              ptTokenModifiers: updatedModificationSet,
            });
          } else if (this.parseUtils.isFlexspinReservedWord(symbolName)) {
            // record a constant reference
            tokenSet.push({
              line: lineIdx,
              startCharacter: nameOffset,
              length: symbolName.length,
              ptTokenType: "variable",
              ptTokenModifiers: ["readonly"],
            });
          } else {
            // record an unknown name
            tokenSet.push({
              line: lineIdx,
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
        line: lineIdx,
        startCharacter: 0,
        length: lineParts[0].length,
        ptTokenType: "macro",
        ptTokenModifiers: ["directive", "illegalUse"],
      });
    }

    return tokenSet;
  }

  private _reportCON_DeclarationLine(lineIdx: number, startingOffset: number, line: string): IParsedToken[] {
    const tokenSet: IParsedToken[] = [];
    // skip Past Whitespace
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    const nonCommentConstantLine = this._getNonCommentLineReturnComment(currentOffset, lineIdx, line, tokenSet);

    const haveEnumDeclaration: boolean = nonCommentConstantLine.startsWith("#");
    const containsMultiAssignments: boolean = nonCommentConstantLine.indexOf(",") != -1;
    this._logCON("- reportConstant haveEnum=(" + haveEnumDeclaration + "), containsMulti=(" + containsMultiAssignments + "), nonCommentConstantLine=[" + nonCommentConstantLine + "]");
    let statements: string[] = [nonCommentConstantLine];
    if (!haveEnumDeclaration && containsMultiAssignments) {
      statements = nonCommentConstantLine.split(",");
    }
    this._logCON("  -- statements=[" + statements + "](" + statements.length + ")");
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
          this._logCON("  -- GLBL assign lhsConstantName=[" + lhsConstantName + "]");
          let referenceDetails: RememberedToken | undefined = undefined;
          if (this.semanticFindings.isGlobalToken(lhsConstantName)) {
            referenceDetails = this.semanticFindings.getGlobalToken(lhsConstantName);
            this._logCON("  --  FOUND rcdl lhs global " + this._rememberdTokenString(lhsConstantName, referenceDetails));
          }
          if (referenceDetails != undefined) {
            // this is a constant declaration!
            const updatedModificationSet: string[] = referenceDetails.modifiersWith("declaration");
            tokenSet.push({
              line: lineIdx,
              startCharacter: nameOffset,
              length: lhsConstantName.length,
              ptTokenType: referenceDetails.type,
              ptTokenModifiers: updatedModificationSet,
            });
          } else {
            this._logCON("  --  CON ERROR[CODE] missed recording declaration! name=[" + lhsConstantName + "]");
            tokenSet.push({
              line: lineIdx,
              startCharacter: nameOffset,
              length: lhsConstantName.length,
              ptTokenType: "variable",
              ptTokenModifiers: ["illegalUse"],
            });
          }
          // remove front LHS of assignment and process remainder
          const fistEqualOffset: number = conDeclarationLine.indexOf("=");
          const assignmentRHSStr = conDeclarationLine.substring(fistEqualOffset + 1).trim();
          currentOffset = line.indexOf(assignmentRHSStr); // skip to RHS of assignment
          this._logCON("  -- CON assignmentRHSStr=[" + assignmentRHSStr + "]");
          const possNames: string[] = this.parseUtils.getNonWhiteCONLineParts(assignmentRHSStr);
          this._logCON("  -- possNames=[" + possNames + "]");
          for (let index = 0; index < possNames.length; index++) {
            const possibleName = possNames[index];
            const currPossibleLen = possibleName.length;
            currentOffset = line.indexOf(possibleName, currentOffset); // skip to RHS of assignment
            if (possibleName.charAt(0).match(/[a-zA-Z_]/)) {
              // does name contain a namespace reference?
              let possibleNameSet: string[] = [];
              if (possibleName.includes(".")) {
                possibleNameSet = possibleName.split(".");
              } else {
                possibleNameSet = [possibleName];
              }
              this._logCON("  --  possibleNameSet=[" + possibleNameSet + "](" + possibleNameSet.length + ")");
              const namePart = possibleNameSet[0];
              let matchLen: number = namePart.length;
              const searchString: string = possibleNameSet.length == 1 ? possibleNameSet[0] : possibleNameSet[0] + "." + possibleNameSet[1];
              let referenceDetails: RememberedToken | undefined = undefined;
              const nameOffset = line.indexOf(searchString, currentOffset);
              this._logCON("  -- namePart=[" + namePart + "](" + nameOffset + ")");
              if (this.semanticFindings.isGlobalToken(namePart)) {
                referenceDetails = this.semanticFindings.getGlobalToken(namePart);
                this._logCON("  --  FOUND rcds rhs global " + this._rememberdTokenString(namePart, referenceDetails));
              }
              if (referenceDetails != undefined) {
                // this is a constant reference!
                //const updatedModificationSet: string[] = this._modifiersWithout(referenceDetails.modifiers, "declaration");
                tokenSet.push({
                  line: lineIdx,
                  startCharacter: nameOffset,
                  length: matchLen,
                  ptTokenType: referenceDetails.type,
                  ptTokenModifiers: referenceDetails.modifiers,
                });
              } else {
                if (this.parseUtils.isFloatConversion(namePart) && (assignmentRHSStr.indexOf(namePart + "(") == -1 || assignmentRHSStr.indexOf(namePart + "()") != -1)) {
                  this._logCON("  --  CON MISSING parens=[" + namePart + "]");
                  tokenSet.push({
                    line: lineIdx,
                    startCharacter: nameOffset,
                    length: namePart.length,
                    ptTokenType: "method",
                    ptTokenModifiers: ["builtin", "missingDeclaration"],
                  });
                } else if (
                  !this.parseUtils.isSpinReservedWord(namePart) &&
                  !this.parseUtils.isBuiltinReservedWord(namePart) &&
                  !this.parseUtils.isDebugMethod(namePart) &&
                  !this.parseUtils.isDebugControlSymbol(namePart) &&
                  !this.parseUtils.isUnaryOperator(namePart)
                ) {
                  this._logCON("  --  CON MISSING name=[" + namePart + "]");
                  tokenSet.push({
                    line: lineIdx,
                    startCharacter: nameOffset,
                    length: matchLen,
                    ptTokenType: "variable",
                    ptTokenModifiers: ["illegalUse"],
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
                  line: lineIdx,
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
          const lineParts: string[] = conDeclarationLine.split(",").filter(Boolean);
          this._logCON("  -- enum lineParts=[" + lineParts + "](" + lineParts.length + ")");
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
              if (enumExistingName.charAt(0).match(/[a-zA-Z_]/)) {
                this._logCON("  -- A GLBL enumConstant=[" + enumConstant + "]");
                // our enum name can have a step offset
                const nameOffset = line.indexOf(enumExistingName, currentOffset);
                tokenSet.push({
                  line: lineIdx,
                  startCharacter: nameOffset,
                  length: enumExistingName.length,
                  ptTokenType: "enumMember",
                  ptTokenModifiers: ["readonly"],
                });
              }
            }
            if (enumConstant.charAt(0).match(/[a-zA-Z_]/) && !this.parseUtils.isDebugInvocation(enumConstant) && !this.parseUtils.isP1asmVariable(enumConstant)) {
              this._logCON("  -- B GLBL enumConstant=[" + enumConstant + "]");
              // our enum name can have a step offset
              const nameOffset = line.indexOf(enumConstant, currentOffset);
              tokenSet.push({
                line: lineIdx,
                startCharacter: nameOffset,
                length: enumConstant.length,
                ptTokenType: "enumMember",
                ptTokenModifiers: ["declaration", "readonly"],
              });
            } else if (this.parseUtils.isP1asmVariable(enumConstant)) {
              // our SPIN1 name
              this._logCON("  -- B GLBL bad SPIN1=[" + enumConstant + "]");
              const nameOffset = line.indexOf(enumConstant, currentOffset);
              tokenSet.push({
                line: lineIdx,
                startCharacter: nameOffset,
                length: enumConstant.length,
                ptTokenType: "variable",
                ptTokenModifiers: ["illegalUse"],
              });
            }
            currentOffset += enumConstant.length + 1;
          }
        }
      }
    }
    return tokenSet;
  }

  private _reportDAT_DeclarationLine(lineIdx: number, startingOffset: number, line: string): IParsedToken[] {
    const tokenSet: IParsedToken[] = [];
    //skip Past Whitespace
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    // get line parts - we only care about first one
    const dataDeclNonCommentStr = this._getNonCommentLineReturnComment(currentOffset, lineIdx, line, tokenSet);
    let lineParts: string[] = this.parseUtils.getNonWhiteLineParts(dataDeclNonCommentStr);
    this._logDAT("- rptDataDeclLn lineParts=[" + lineParts + "](" + lineParts.length + ")");
    // remember this object name so we can annotate a call to it
    if (lineParts.length > 1) {
      if (this.parseUtils.isStorageType(lineParts[0]) || lineParts[0].toUpperCase() == "FILE" || lineParts[0].toUpperCase() == "ORG") {
        // if we start with storage type (or FILE, or ORG), not name, process rest of line for symbols
        currentOffset = line.indexOf(lineParts[0], currentOffset);
        const allowLocalVarStatus: boolean = false;
        const NOT_DAT_PASM: boolean = false;
        const partialTokenSet: IParsedToken[] = this._reportDAT_ValueDeclarationCode(lineIdx, currentOffset, line, allowLocalVarStatus, this.showDAT, NOT_DAT_PASM);
        partialTokenSet.forEach((newToken) => {
          tokenSet.push(newToken);
        });
      } else {
        // this is line with name storageType and initial value
        this._logDAT("  -- rptDatDecl lineParts=[" + lineParts + "]");
        let newName = lineParts[0];
        const nameOffset: number = line.indexOf(newName, currentOffset);
        let referenceDetails: RememberedToken | undefined = undefined;
        if (this.semanticFindings.isGlobalToken(newName)) {
          referenceDetails = this.semanticFindings.getGlobalToken(newName);
          this._logMessage("  --  FOUND rddl global name=[" + newName + "]");
        }
        if (referenceDetails != undefined) {
          tokenSet.push({
            line: lineIdx,
            startCharacter: nameOffset,
            length: newName.length,
            ptTokenType: referenceDetails.type,
            ptTokenModifiers: referenceDetails.modifiers,
          });
        } else if (!this.parseUtils.isReservedPasmSymbols(newName)) {
          this._logDAT("  --  DAT rDdl MISSING name=[" + newName + "]");
          tokenSet.push({
            line: lineIdx,
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
        const partialTokenSet: IParsedToken[] = this._reportDAT_ValueDeclarationCode(lineIdx, currentOffset, line, allowLocalVarStatus, this.showDAT, NOT_DAT_PASM);
        partialTokenSet.forEach((newToken) => {
          tokenSet.push(newToken);
        });
      }
    } else if (lineParts.length == 1) {
      // handle name declaration only line: [name 'comment]
      let newName = lineParts[0];
      if (!this.parseUtils.isAlignType(newName)) {
        let referenceDetails: RememberedToken | undefined = undefined;
        if (this.semanticFindings.isGlobalToken(newName)) {
          referenceDetails = this.semanticFindings.getGlobalToken(newName);
          this._logMessage("  --  FOUND global name=[" + newName + "]");
        }
        if (referenceDetails != undefined) {
          tokenSet.push({
            line: lineIdx,
            startCharacter: currentOffset,
            length: newName.length,
            ptTokenType: referenceDetails.type,
            ptTokenModifiers: referenceDetails.modifiers,
          });
        } else if (this.parseUtils.isP1asmInstruction(newName) || this.parseUtils.isP1asmConditional(newName) || this.parseUtils.isP1asmVariable(newName)) {
          this._logMessage("  --  ERROR p1asm name=[" + newName + "]");
          tokenSet.push({
            line: lineIdx,
            startCharacter: currentOffset,
            length: newName.length,
            ptTokenType: "variable",
            ptTokenModifiers: ["illegalUse"],
          });
        }
      }
    } else {
      this._logDAT("  -- DAT SKIPPED: lineParts=[" + lineParts + "]");
    }
    return tokenSet;
  }

  private _reportDAT_ValueDeclarationCode(lineIdx: number, startingOffset: number, line: string, allowLocal: boolean, showDebug: boolean, isDatPasm: boolean): IParsedToken[] {
    const lineNbr: number = lineIdx + 1;
    const tokenSet: IParsedToken[] = [];
    //this._logMessage(' DBG _reportDAT_ValueDeclarationCode(#' + lineNbr + ', ofs=' + startingOffset + ')');
    this._logDAT("- process ValueDeclaration line(" + lineNbr + "): line=[" + line + "]");

    // process data declaration
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    const dataValueInitStr = this._getNonCommentLineReturnComment(currentOffset, lineIdx, line, tokenSet);
    if (dataValueInitStr.length > 1) {
      if (showDebug) {
        this._logMessage("  -- reportDataValueInit dataValueInitStr=[" + dataValueInitStr + "]");
      }
      let lineParts: string[] = this.parseUtils.getNonWhiteDataInitLineParts(dataValueInitStr);
      const argumentStartIndex: number = this.parseUtils.isDatStorageType(lineParts[0]) ? 1 : 0;
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
          if (possibleName.charAt(0).match(/[a-zA-Z_]/) || (isDatPasm && possibleName.charAt(0).match(/[a-zA-Z_\.]/))) {
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
            if (allowLocal && this.semanticFindings.isLocalToken(namePart)) {
              referenceDetails = this.semanticFindings.getLocalTokenForLine(namePart, lineNbr);
              if (showDebug) {
                this._logMessage("  --  FOUND local name=[" + namePart + "]");
              }
            } else if (this.semanticFindings.isGlobalToken(namePart)) {
              referenceDetails = this.semanticFindings.getGlobalToken(namePart);
              if (showDebug) {
                this._logMessage("  --  FOUND global name=[" + namePart + "]");
              }
            }
            if (referenceDetails != undefined) {
              tokenSet.push({
                line: lineIdx,
                startCharacter: currentOffset,
                length: namePart.length,
                ptTokenType: referenceDetails.type,
                ptTokenModifiers: referenceDetails.modifiers,
              });
            } else {
              if (
                !this.parseUtils.isPasmReservedWord(namePart) &&
                !this.parseUtils.isReservedPasmSymbols(namePart) &&
                !this.parseUtils.isPasmInstruction(namePart) &&
                !this.parseUtils.isDatNFileStorageType(namePart) &&
                !this.parseUtils.isBinaryOperator(namePart) &&
                !this.parseUtils.isUnaryOperator(namePart) &&
                !this.parseUtils.isBuiltinReservedWord(namePart)
              ) {
                if (showDebug) {
                  this._logMessage("  --  DAT rDvdc MISSING name=[" + namePart + "]");
                }
                tokenSet.push({
                  line: lineIdx,
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
                line: lineIdx,
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

  private _reportDAT_PasmCode(lineIdx: number, startingOffset: number, line: string): IParsedToken[] {
    const tokenSet: IParsedToken[] = [];
    // skip Past Whitespace
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    // get line parts - we only care about first one
    const inLinePasmRHSStr = this._getNonCommentLineReturnComment(currentOffset, lineIdx, line, tokenSet);
    const lineParts: string[] = this.parseUtils.getNonWhitePasmLineParts(inLinePasmRHSStr);
    currentOffset = line.indexOf(inLinePasmRHSStr, currentOffset);
    // handle name in 1 column
    const bIsAlsoDebugLine: boolean = inLinePasmRHSStr.toLowerCase().indexOf("debug(") != -1 ? true : false;
    if (bIsAlsoDebugLine) {
      const partialTokenSet: IParsedToken[] = this._reportDebugStatement(lineIdx, startingOffset, line);
      partialTokenSet.forEach((newToken) => {
        this._logSPIN("=> DATpasm: " + this._tokenString(newToken, line));
        tokenSet.push(newToken);
      });
    }
    let haveLabel: boolean = this.parseUtils.isDatOrPasmLabel(lineParts[0]);
    const isDataDeclarationLine: boolean = lineParts.length > 1 && haveLabel && this.parseUtils.isDatStorageType(lineParts[1]) ? true : false;
    this._logPASM("  -- reportDATPasmDecl lineParts=[" + lineParts + "], haveLabel=(" + haveLabel + "), isDataDeclarationLine=(" + isDataDeclarationLine + ")");
    // TODO: REWRITE this to handle "non-label" line with unknown op-code!
    if (haveLabel) {
      // process label/variable name - starting in column 0
      const labelName: string = lineParts[0];
      this._logPASM("  -- labelName=[" + labelName + "]");
      let referenceDetails: RememberedToken | undefined = undefined;
      if (this.semanticFindings.isGlobalToken(labelName)) {
        referenceDetails = this.semanticFindings.getGlobalToken(labelName);
        this._logPASM("  --  FOUND global name=[" + labelName + "]");
      }
      if (referenceDetails != undefined) {
        const nameOffset = line.indexOf(labelName, currentOffset);
        const updatedModificationSet: string[] = referenceDetails.modifiersWith("declaration");
        this._logPASM("  --  DAT Pasm " + referenceDetails.type + "=[" + labelName + "](" + (nameOffset + 1) + ")");
        tokenSet.push({
          line: lineIdx,
          startCharacter: nameOffset,
          length: labelName.length,
          ptTokenType: referenceDetails.type,
          ptTokenModifiers: updatedModificationSet,
        });
        haveLabel = true;
      } else if (labelName.startsWith(":")) {
        // hrmf... no global type???? this should be a label?
        this._logPASM("  --  DAT Pasm ERROR Spin1 label=[" + labelName + "](" + (0 + 1) + ")");
        const nameOffset = line.indexOf(labelName, currentOffset);
        tokenSet.push({
          line: lineIdx,
          startCharacter: nameOffset,
          length: labelName.length,
          ptTokenType: "variable", // color this offender!
          ptTokenModifiers: ["illegalUse"],
        });
        haveLabel = true;
      } else if (labelName.toLowerCase() != "debug" && bIsAlsoDebugLine) {
        // hrmf... no global type???? this should be a label?
        this._logPASM("  --  DAT Pasm ERROR NOT A label=[" + labelName + "](" + (0 + 1) + ")");
        const nameOffset = line.indexOf(labelName, currentOffset);
        tokenSet.push({
          line: lineIdx,
          startCharacter: nameOffset,
          length: labelName.length,
          ptTokenType: "variable", // color this offender!
          ptTokenModifiers: ["illegalUse"],
        });
        haveLabel = true;
      } else if (this.parseUtils.isP1asmInstruction(labelName)) {
        // hrmf... no global type???? this should be a label?
        this._logPASM("  --  DAT P1asm BAD label=[" + labelName + "](" + (0 + 1) + ")");
        const nameOffset = line.indexOf(labelName, currentOffset);
        tokenSet.push({
          line: lineIdx,
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
      let argumentOffset = 0;
      if (lineParts.length > 1) {
        let minNonLabelParts: number = 1;
        if (haveLabel) {
          // skip our label
          argumentOffset++;
          minNonLabelParts++;
        }
        this._logPASM("  -- DAT PASM !dataDecl lineParts=[" + lineParts + "](" + lineParts.length + "), argumentOffset=(" + argumentOffset + "), minNonLabelParts=(" + minNonLabelParts + ")");
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
            if (index == lineParts.length - 1 && this.parseUtils.isPasmConditional(argumentName)) {
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
            if (argumentName.charAt(0).match(/[a-zA-Z_\.\:]/)) {
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
              this._logPASM("  --  DAT Pasm searchString=[" + searchString + "](" + (nameOffset + 1) + ")");
              let referenceDetails: RememberedToken | undefined = undefined;
              if (this.semanticFindings.isGlobalToken(namePart)) {
                referenceDetails = this.semanticFindings.getGlobalToken(namePart);
                this._logPASM("  --  FOUND global name=[" + namePart + "]");
              }
              if (referenceDetails != undefined) {
                this._logPASM("  --  DAT Pasm name=[" + namePart + "](" + (nameOffset + 1) + ")");
                tokenSet.push({
                  line: lineIdx,
                  startCharacter: nameOffset,
                  length: namePart.length,
                  ptTokenType: referenceDetails.type,
                  ptTokenModifiers: referenceDetails.modifiers,
                });
              } else {
                // we use bIsDebugLine in next line so we don't flag debug() arguments!
                if (
                  !this.parseUtils.isPasmReservedWord(namePart) &&
                  !this.parseUtils.isPasmInstruction(namePart) &&
                  !this.parseUtils.isPasmConditional(namePart) &&
                  !this.parseUtils.isBinaryOperator(namePart) &&
                  !this.parseUtils.isBuiltinReservedWord(namePart) &&
                  !this.parseUtils.isCoginitReservedSymbol(namePart) &&
                  !this.parseUtils.isPasmModczOperand(namePart) &&
                  !this.parseUtils.isDebugMethod(namePart) &&
                  !bIsAlsoDebugLine
                ) {
                  this._logPASM("  --  DAT Pasm MISSING name=[" + namePart + "](" + (nameOffset + 1) + ")");
                  tokenSet.push({
                    line: lineIdx,
                    startCharacter: nameOffset,
                    length: namePart.length,
                    ptTokenType: "variable",
                    ptTokenModifiers: ["illegalUse"],
                  });
                } else {
                  this._logPASM("  --  DAT Pasm WHAT IS THIS?? name=[" + namePart + "](" + (nameOffset + 1) + ")");
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
                  line: lineIdx,
                  startCharacter: nameOffset,
                  length: constantPart.length,
                  ptTokenType: "variable",
                  ptTokenModifiers: ["readonly"],
                });
              }
            }
            currentOffset += currArgumentLen + 1;
          }
          if (this.parseUtils.isP1asmInstruction(likelyInstructionName)) {
            const nameOffset: number = line.indexOf(likelyInstructionName, 0);
            this._logPASM("  --  DAT A P1asm BAD instru=[" + likelyInstructionName + "](" + (nameOffset + 1) + ")");
            tokenSet.push({
              line: lineIdx,
              startCharacter: nameOffset,
              length: likelyInstructionName.length,
              ptTokenType: "variable",
              ptTokenModifiers: ["illegalUse"],
            });
          }
        }
      } else if (lineParts.length == 1 && this.parseUtils.isP1asmInstruction(lineParts[0])) {
        const likelyInstructionName: string = lineParts[0];
        const nameOffset: number = line.indexOf(likelyInstructionName, 0);
        this._logPASM("  --  DAT B P1asm BAD instru=[" + likelyInstructionName + "](" + (nameOffset + 1) + ")");
        tokenSet.push({
          line: lineIdx,
          startCharacter: nameOffset,
          length: likelyInstructionName.length,
          ptTokenType: "variable",
          ptTokenModifiers: ["illegalUse"],
        });
      }
    } else {
      // process data declaration
      if (this.parseUtils.isDatStorageType(lineParts[0])) {
        currentOffset = line.indexOf(lineParts[0], currentOffset);
      } else {
        // skip line part 0 length when searching for [1] name
        currentOffset = line.indexOf(lineParts[1], currentOffset + lineParts[0].length);
      }
      const allowLocalVarStatus: boolean = false;
      const IS_DAT_PASM: boolean = true;
      const partialTokenSet: IParsedToken[] = this._reportDAT_ValueDeclarationCode(lineIdx, currentOffset, line, allowLocalVarStatus, this.showPasmCode, IS_DAT_PASM);
      partialTokenSet.forEach((newToken) => {
        tokenSet.push(newToken);
      });
    }
    return tokenSet;
  }

  private _reportPUB_PRI_Signature(lineIdx: number, startingOffset: number, line: string): IParsedToken[] {
    const tokenSet: IParsedToken[] = [];
    const lineNbr: number = lineIdx + 1;
    const methodType = line.substr(0, 3).toUpperCase();
    const isPrivate = methodType.indexOf("PRI") != -1;
    //skip Past Whitespace
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    const spineDeclarationLHSStr = this._getNonCommentLineReturnComment(0, lineIdx, line, tokenSet);
    if (spineDeclarationLHSStr) {
    } // we don't use this string, we called this to record our rhs comment!
    // -----------------------------------
    //   Method Name
    //
    const startNameOffset = currentOffset;
    // find open paren - skipping past method name
    currentOffset = spineDeclarationLHSStr.indexOf("(", startNameOffset); // in spin1 ()'s are optional!
    const openParenOffset: number = currentOffset;
    if (currentOffset == -1) {
      currentOffset = spineDeclarationLHSStr.indexOf(":", startNameOffset);
      if (currentOffset == -1) {
        currentOffset = spineDeclarationLHSStr.indexOf("|", startNameOffset);
        if (currentOffset == -1) {
          currentOffset = spineDeclarationLHSStr.indexOf(" ", startNameOffset);
          if (currentOffset == -1) {
            currentOffset = spineDeclarationLHSStr.indexOf("'", startNameOffset);
            if (currentOffset == -1) {
              currentOffset = spineDeclarationLHSStr.length;
            }
          }
        }
      }
    }
    const methodName: string = line.substr(startNameOffset, currentOffset - startNameOffset).trim();
    this.currentMethodName = methodName; // notify of latest method name so we can track inLine PASM symbols
    const spin2MethodName: string = methodName + "(";
    this._logSPIN("-reportPubPriSig: spin2MethodName=[" + spin2MethodName + "], startNameOffset=(" + startNameOffset + ")");
    const bHaveSpin2Method: boolean = line.includes(spin2MethodName);
    if (bHaveSpin2Method) {
      const declModifiers: string[] = isPrivate ? ["declaration", "static"] : ["declaration"];
      tokenSet.push({
        line: lineIdx,
        startCharacter: startNameOffset,
        length: methodName.length,
        ptTokenType: "method",
        ptTokenModifiers: declModifiers,
      });
      this._logSPIN("-reportPubPriSig: methodName=[" + methodName + "], startNameOffset=(" + startNameOffset + ")");
    } else {
      // have a P1 style method declaration, flag it!
      const declModifiers: string[] = isPrivate ? ["declaration", "static", "illegalUse"] : ["declaration", "illegalUse"];
      tokenSet.push({
        line: lineIdx,
        startCharacter: startNameOffset,
        length: methodName.length,
        ptTokenType: "method",
        ptTokenModifiers: ["illegalUse"],
      });
      this._logSPIN("-reportPubPriSig: SPIN1 methodName=[" + methodName + "], startNameOffset=(" + startNameOffset + ")");
    }
    // record definition of method
    // -----------------------------------
    //   Parameters
    //
    // find close paren - so we can study parameters
    let closeParenOffset: number = -1;
    if (bHaveSpin2Method) {
      closeParenOffset = line.indexOf(")", currentOffset);
    }
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
          line: lineIdx,
          startCharacter: nameOffset,
          length: paramName.length,
          ptTokenType: "parameter",
          ptTokenModifiers: ["declaration", "readonly", "local"],
        });
        // remember so we can ID references
        this.semanticFindings.setLocalTokenForMethod(methodName, paramName, new RememberedToken("parameter", ["readonly", "local"]), lineNbr, this._declarationComment()); // TOKEN SET in _report()
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
          line: lineIdx,
          startCharacter: nameOffset,
          length: returnValueName.length,
          ptTokenType: "returnValue",
          ptTokenModifiers: ["declaration", "local"],
        });
        // remember so we can ID references
        this.semanticFindings.setLocalTokenForMethod(methodName, returnValueName, new RememberedToken("returnValue", ["local"]), lineNbr, this._declarationComment()); // TOKEN SET in _report()
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
              if (namedIndexPart.charAt(0).match(/[a-zA-Z_]/)) {
                let referenceDetails: RememberedToken | undefined = undefined;
                if (this.semanticFindings.isLocalToken(namedIndexPart)) {
                  referenceDetails = this.semanticFindings.getLocalTokenForLine(namedIndexPart, lineNbr);
                  this._logSPIN("  --  FOUND local name=[" + namedIndexPart + "]");
                } else if (this.semanticFindings.isGlobalToken(namedIndexPart)) {
                  referenceDetails = this.semanticFindings.getGlobalToken(namedIndexPart);
                  this._logSPIN("  --  FOUND global name=[" + namedIndexPart + "]");
                }
                if (referenceDetails != undefined) {
                  this._logSPIN("  --  lcl-idx variableName=[" + namedIndexPart + "](" + (nameOffset + 1) + ")");
                  tokenSet.push({
                    line: lineIdx,
                    startCharacter: nameOffset,
                    length: namedIndexPart.length,
                    ptTokenType: referenceDetails.type,
                    ptTokenModifiers: referenceDetails.modifiers,
                  });
                } else {
                  if (
                    !this.parseUtils.isSpinReservedWord(namedIndexPart) &&
                    !this.parseUtils.isSpinBuiltinMethod(namedIndexPart) &&
                    !this.parseUtils.isBuiltinReservedWord(namedIndexPart) &&
                    !this.parseUtils.isDebugMethod(namedIndexPart) &&
                    !this.parseUtils.isDebugControlSymbol(namedIndexPart)
                  ) {
                    // we don't have name registered so just mark it
                    this._logSPIN("  --  SPIN MISSING varname=[" + namedIndexPart + "](" + (nameOffset + 1) + ")");
                    tokenSet.push({
                      line: lineIdx,
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
              line: lineIdx,
              startCharacter: nameOffset,
              length: localName.length,
              ptTokenType: "variable",
              ptTokenModifiers: ["declaration", "local"],
            });
            // remember so we can ID references
            this.semanticFindings.setLocalTokenForMethod(methodName, localName, new RememberedToken("variable", ["local"]), lineNbr, this._declarationComment()); // TOKEN SET in _report()
          } else {
            // have modifier!
            if (this.parseUtils.isStorageType(localName)) {
              tokenSet.push({
                line: lineIdx,
                startCharacter: nameOffset,
                length: localName.length,
                ptTokenType: "storageType",
                ptTokenModifiers: [],
              });
            } else if (this.parseUtils.isAlignType(localName)) {
              tokenSet.push({
                line: lineIdx,
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

  private _reportSPIN_Code(lineIdx: number, startingOffset: number, line: string): IParsedToken[] {
    const tokenSet: IParsedToken[] = [];
    const lineNbr: number = lineIdx + 1;
    // skip Past Whitespace
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    const nonCommentSpinLine = this._getNonCommentLineReturnComment(currentOffset, lineIdx, line, tokenSet);
    const remainingLength: number = nonCommentSpinLine.length;
    this._logCON("- reportSPIN nonCommentSpinLine=[" + nonCommentSpinLine + "] remainingLength=" + remainingLength);
    if (remainingLength > 0) {
      // special early error case
      if (nonCommentSpinLine.toLowerCase().includes("else if")) {
        const nameOffset = line.toLowerCase().indexOf("else if", currentOffset);
        this._logSPIN("  --  Illegal ELSE-IF [" + nonCommentSpinLine + "]");
        tokenSet.push({
          line: lineIdx,
          startCharacter: nameOffset,
          length: "else if".length,
          ptTokenType: "keyword",
          ptTokenModifiers: ["illegalUse"],
        });
      }
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
              if (variableNamePart.charAt(0).match(/[a-zA-Z_]/)) {
                if (variableNamePart.includes(".")) {
                  const varNameParts: string[] = variableNamePart.split(".");
                  if (this.parseUtils.isDatStorageType(varNameParts[1])) {
                    variableNamePart = varNameParts[0]; // just use first part of name
                    /*
                                        // FIXME: UNDONE mark storage part correctly, yes, out-of-order
                                        const nameOffset: number = line.indexOf(varNameParts[1]);
                                        this._logSPIN('  --  SPIN storageType=[' + varNameParts[1] + '](' + (nameOffset + 1) + ')');
                                        tokenSet.push({
                                            line: lineIdx,
                                            startCharacter: nameOffset,
                                            length: varNameParts[1].length,
                                            ptTokenType: 'storageType',
                                            ptTokenModifiers: []
                                        });
                                        */
                  }
                }
                this._logSPIN("  -- variableNamePart=[" + variableNamePart + "](" + (nameOffset + 1) + ")");
                if (this.parseUtils.isStorageType(variableNamePart)) {
                  tokenSet.push({
                    line: lineIdx,
                    startCharacter: nameOffset,
                    length: variableNamePart.length,
                    ptTokenType: "storageType",
                    ptTokenModifiers: [],
                  });
                  currentOffset += variableNamePart.length;
                } else {
                  let referenceDetails: RememberedToken | undefined = undefined;
                  if (this.semanticFindings.isLocalToken(variableNamePart)) {
                    referenceDetails = this.semanticFindings.getLocalTokenForLine(variableNamePart, lineNbr);
                    this._logSPIN("  --  FOUND local name=[" + variableNamePart + "]");
                  } else if (this.semanticFindings.isGlobalToken(variableNamePart)) {
                    referenceDetails = this.semanticFindings.getGlobalToken(variableNamePart);
                    this._logSPIN("  --  FOUND global name=[" + variableNamePart + "]");
                  }
                  if (referenceDetails != undefined) {
                    const modificationArray: string[] = referenceDetails.modifiersWith("modification");
                    this._logSPIN("  --  SPIN variableName=[" + variableNamePart + "](" + (nameOffset + 1) + ")");
                    tokenSet.push({
                      line: lineIdx,
                      startCharacter: nameOffset,
                      length: variableNamePart.length,
                      ptTokenType: referenceDetails.type,
                      ptTokenModifiers: modificationArray,
                    });
                    currentOffset += variableNamePart.length;
                  } else {
                    if (
                      !this.parseUtils.isSpinReservedWord(variableNamePart) &&
                      !this.parseUtils.isBuiltinReservedWord(variableNamePart) &&
                      !this.parseUtils.isDebugMethod(variableNamePart) &&
                      !this.parseUtils.isDebugControlSymbol(variableNamePart) &&
                      !this.parseUtils.isSpinBuiltinMethod(variableNamePart)
                    ) {
                      // we don't have name registered so just mark it
                      this._logSPIN("  --  SPIN MISSING varname=[" + variableNamePart + "](" + (nameOffset + 1) + ")");
                      tokenSet.push({
                        line: lineIdx,
                        startCharacter: nameOffset,
                        length: variableNamePart.length,
                        ptTokenType: "variable",
                        ptTokenModifiers: ["modification", "missingDeclaration"],
                      });
                      currentOffset += variableNamePart.length;
                    }
                  }
                }
              }
            }
          } else {
            // have simple target name, no []
            let cleanedVariableName: string = variableName.replace(/[ \t\(\)]/, "");
            let nameOffset = line.indexOf(cleanedVariableName, currentOffset);
            if (cleanedVariableName.charAt(0).match(/[a-zA-Z_]/) && !this.parseUtils.isStorageType(cleanedVariableName) && !this.parseUtils.isSpinSpecialMethod(cleanedVariableName)) {
              this._logSPIN("  --  SPIN cleanedVariableName=[" + cleanedVariableName + "](" + (nameOffset + 1) + ")");
              // does name contain a namespace reference?
              if (cleanedVariableName.includes(".")) {
                const varNameParts: string[] = cleanedVariableName.split(".");
                this._logSPIN("  --  varNameParts=[" + varNameParts + "]");
                if (this.parseUtils.isDatStorageType(varNameParts[1])) {
                  cleanedVariableName = varNameParts[0]; // just use first part of name
                  /*
                                    // FIXME: UNDONE mark storage part correctly, yes, out-of-order
                                    const nameOffset: number = line.indexOf(varNameParts[1]);
                                    this._logSPIN('  --  SPIN storageType=[' + varNameParts[1] + '](' + (nameOffset + 1) + ')');
                                    tokenSet.push({
                                        line: lineIdx,
                                        startCharacter: nameOffset,
                                        length: varNameParts[1].length,
                                        ptTokenType: 'storageType',
                                        ptTokenModifiers: []
                                    });
                                    */
                } else {
                  const namePart = varNameParts[0];
                  const searchString: string = varNameParts.length == 1 ? varNameParts[0] : varNameParts[0] + "." + varNameParts[1];
                  nameOffset = line.indexOf(searchString, 0);
                  this._logSPIN("  --  SPIN LHS   searchString=[" + searchString + "]");
                  this._logSPIN("  --  SPIN LHS    nameOffset=(" + nameOffset + "), currentOffset=(" + currentOffset + ")");
                  let referenceDetails: RememberedToken | undefined = undefined;
                  if (this.semanticFindings.isLocalToken(namePart)) {
                    referenceDetails = this.semanticFindings.getLocalTokenForLine(namePart, lineNbr);
                    this._logSPIN("  --  FOUND local name=[" + namePart + "]");
                  } else if (this.semanticFindings.isGlobalToken(namePart)) {
                    referenceDetails = this.semanticFindings.getGlobalToken(namePart);
                    this._logSPIN("  --  FOUND global name=[" + namePart + "]");
                    if (referenceDetails != undefined && referenceDetails?.type == "method") {
                      const methodCall = namePart + "(";
                      const addressOf = "@" + namePart;
                      if (!searchString.includes(methodCall) && !searchString.includes(addressOf)) {
                        this._logSPIN("  --  MISSING parens on method=[" + namePart + "]");
                        referenceDetails = undefined;
                      }
                    }
                  }
                  if (referenceDetails != undefined) {
                    this._logSPIN("  --  SPIN RHS name=[" + namePart + "](" + (nameOffset + 1) + ")");
                    tokenSet.push({
                      line: lineIdx,
                      startCharacter: nameOffset,
                      length: namePart.length,
                      ptTokenType: referenceDetails.type,
                      ptTokenModifiers: referenceDetails.modifiers,
                    });
                  } else {
                    const searchKey: string = namePart.toLowerCase();
                    const isMethodNoParen: boolean = searchKey == "return" || searchKey == "abort";
                    // have unknown name!? is storage type spec?
                    if (this.parseUtils.isStorageType(namePart)) {
                      this._logSPIN("  --  SPIN RHS storageType=[" + namePart + "]");
                      tokenSet.push({
                        line: lineIdx,
                        startCharacter: nameOffset,
                        length: namePart.length,
                        ptTokenType: "storageType",
                        ptTokenModifiers: [],
                      });
                    } else if (this.parseUtils.isSpinBuiltinMethod(namePart) && !searchString.includes(namePart + "(") && !this.parseUtils.isSpinNoparenMethod(namePart)) {
                      this._logSPIN("  --  SPIN MISSING PARENS name=[" + namePart + "]");
                      tokenSet.push({
                        line: lineIdx,
                        startCharacter: nameOffset,
                        length: namePart.length,
                        ptTokenType: "method",
                        ptTokenModifiers: ["builtin", "missingDeclaration"],
                      });
                    }
                    // we use bIsDebugLine in next line so we don't flag debug() arguments!
                    else if (
                      !this.parseUtils.isSpinReservedWord(namePart) &&
                      !this.parseUtils.isSpinBuiltinMethod(namePart) &&
                      !this.parseUtils.isBuiltinReservedWord(namePart) &&
                      !this.parseUtils.isCoginitReservedSymbol(namePart) &&
                      !this.parseUtils.isDebugMethod(namePart) &&
                      !this.parseUtils.isDebugControlSymbol(namePart) &&
                      !this.parseUtils.isDebugInvocation(namePart)
                    ) {
                      // NO DEBUG FOR ELSE, most of spin control elements come through here!
                      //else {
                      //    this._logSPIN('  -- UNKNOWN?? name=[' + namePart + '] - name-get-breakage??');
                      //}
                      this._logSPIN("  --  SPIN MISSING rhs name=[" + namePart + "]");
                      tokenSet.push({
                        line: lineIdx,
                        startCharacter: nameOffset,
                        length: namePart.length,
                        ptTokenType: "variable",
                        ptTokenModifiers: ["missingDeclaration"],
                      });
                    }
                  }
                  if (varNameParts.length > 1) {
                    // we have .constant namespace suffix
                    // determine if this is method has '(' or constant name
                    const referenceOffset = line.indexOf(searchString, nameOffset); // + currentOffset;
                    let isMethod: boolean = false;
                    if (line.substr(referenceOffset + searchString.length, 1) == "(") {
                      isMethod = true;
                    }
                    const constantPart: string = varNameParts[1];
                    if (this.parseUtils.isStorageType(constantPart)) {
                      // FIXME: UNDONE remove when syntax see this correctly
                      const nameOffset: number = line.indexOf(constantPart, currentOffset);
                      this._logSPIN("  --  SPIN rhs storageType=[" + constantPart + "](" + (nameOffset + 1) + ")");
                      tokenSet.push({
                        line: lineIdx,
                        startCharacter: nameOffset,
                        length: constantPart.length,
                        ptTokenType: "storageType",
                        ptTokenModifiers: [],
                      });
                    } else {
                      nameOffset = line.indexOf(constantPart, nameOffset);
                      const tokenTypeID: string = isMethod ? "method" : "variable";
                      const tokenModifiers: string[] = isMethod ? [] : ["readonly"];
                      this._logSPIN("  --  SPIN rhs constant=[" + constantPart + "](" + (nameOffset + 1) + ") (" + tokenTypeID + ")");
                      tokenSet.push({
                        line: lineIdx,
                        startCharacter: nameOffset,
                        length: constantPart.length,
                        ptTokenType: tokenTypeID,
                        ptTokenModifiers: tokenModifiers,
                      });
                    }
                  }
                }
              }
              let referenceDetails: RememberedToken | undefined = undefined;
              if (this.semanticFindings.isLocalToken(cleanedVariableName)) {
                referenceDetails = this.semanticFindings.getLocalTokenForLine(cleanedVariableName, lineNbr);
                this._logSPIN("  --  FOUND local name=[" + cleanedVariableName + "]");
              } else if (this.semanticFindings.isGlobalToken(cleanedVariableName)) {
                referenceDetails = this.semanticFindings.getGlobalToken(cleanedVariableName);
                this._logSPIN("  --  FOUND globel name=[" + cleanedVariableName + "]");
              }
              if (referenceDetails != undefined) {
                const modificationArray: string[] = referenceDetails.modifiersWith("modification");
                this._logSPIN("  -- spin: simple variableName=[" + cleanedVariableName + "](" + (nameOffset + 1) + ")");
                tokenSet.push({
                  line: lineIdx,
                  startCharacter: nameOffset,
                  length: cleanedVariableName.length,
                  ptTokenType: referenceDetails.type,
                  ptTokenModifiers: modificationArray,
                });
              } else if (cleanedVariableName == "_") {
                this._logSPIN("  --  built-in=[" + cleanedVariableName + "](" + (nameOffset + 1) + ")");
                tokenSet.push({
                  line: lineIdx,
                  startCharacter: nameOffset,
                  length: cleanedVariableName.length,
                  ptTokenType: "variable",
                  ptTokenModifiers: ["modification", "defaultLibrary"],
                });
              } else {
                // we don't have name registered so just mark it
                if (
                  !this.parseUtils.isSpinReservedWord(cleanedVariableName) &&
                  !this.parseUtils.isSpinBuiltinMethod(cleanedVariableName) &&
                  !this.parseUtils.isBuiltinReservedWord(cleanedVariableName) &&
                  !this.parseUtils.isDebugMethod(cleanedVariableName) &&
                  !this.parseUtils.isDebugControlSymbol(cleanedVariableName)
                ) {
                  this._logSPIN("  --  SPIN MISSING cln name=[" + cleanedVariableName + "](" + (nameOffset + 1) + ")");
                  tokenSet.push({
                    line: lineIdx,
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
      const assignmentRHSStr: string = this._getNonCommentLineReturnComment(currentOffset, lineIdx, line, tokenSet);
      currentOffset = line.indexOf(assignmentRHSStr, currentOffset);
      const preCleanAssignmentRHSStr = this.parseUtils.getNonInlineCommentLine(assignmentRHSStr).replace("..", "  ");
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
      this._logSPIN("  -- possNames=[" + possNames + "](" + possNames.length + ")");
      const firstName: string = possNames.length > 0 ? possNames[0] : "";
      const bIsDebugLine: boolean = nonStringAssignmentRHSStr.toLowerCase().indexOf("debug(") != -1 ? true : false;
      for (let index = 0; index < possNames.length; index++) {
        let possibleName = possNames[index];
        // special code to handle case of var.[bitfield] leaving name a 'var.'
        if (possibleName.endsWith(".")) {
          possibleName = possibleName.substr(0, possibleName.length - 1);
        }
        // special code to handle case of @pasmName leaving name a 'var.'
        //if (possibleName.startsWith("@")) {
        //  possibleName = possibleName.substring(1); // remove leading char
        //}
        let possibleNameSet: string[] = [];
        let nameOffset: number = 0;
        currNonStringOffset = nonStringAssignmentRHSStr.indexOf(possNames[index], currNonStringOffset);
        const currNonStringNameLen: number = possNames[index].length;
        if (possibleName.charAt(0).match(/[a-zA-Z_]/)) {
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
          if (this.semanticFindings.isLocalToken(namePart)) {
            referenceDetails = this.semanticFindings.getLocalTokenForLine(namePart, lineNbr);
            this._logSPIN("  --  FOUND local name=[" + namePart + "]");
          } else if (this.semanticFindings.isGlobalToken(namePart)) {
            referenceDetails = this.semanticFindings.getGlobalToken(namePart);
            this._logSPIN("  --  FOUND global name=[" + namePart + "]");
            if (referenceDetails != undefined && referenceDetails?.type == "method") {
              const methodCall = namePart + "(";
              const addressOf = "@" + namePart;
              if (!nonStringAssignmentRHSStr.includes(methodCall) && !nonStringAssignmentRHSStr.includes(addressOf)) {
                this._logSPIN("  --  MISSING parens on method=[" + namePart + "]");
                referenceDetails = undefined;
              }
            }
          }
          if (referenceDetails != undefined) {
            this._logSPIN("  --  SPIN RHS name=[" + namePart + "](" + (nameOffset + 1) + ")");
            tokenSet.push({
              line: lineIdx,
              startCharacter: nameOffset,
              length: namePart.length,
              ptTokenType: referenceDetails.type,
              ptTokenModifiers: referenceDetails.modifiers,
            });
          } else {
            if (this.parseUtils.isFloatConversion(namePart) && (nonStringAssignmentRHSStr.indexOf(namePart + "(") == -1 || nonStringAssignmentRHSStr.indexOf(namePart + "()") != -1)) {
              this._logSPIN("  --  SPIN MISSING PARENS name=[" + namePart + "]");
              tokenSet.push({
                line: lineIdx,
                startCharacter: nameOffset,
                length: namePart.length,
                ptTokenType: "method",
                ptTokenModifiers: ["builtin", "missingDeclaration"],
              });
            } else if (this.parseUtils.isStorageType(namePart)) {
              // have unknown name!? is storage type spec?
              this._logSPIN("  --  SPIN RHS storageType=[" + namePart + "]");
              tokenSet.push({
                line: lineIdx,
                startCharacter: nameOffset,
                length: namePart.length,
                ptTokenType: "storageType",
                ptTokenModifiers: [],
              });
            } else if (this.parseUtils.isSpinBuiltinMethod(namePart) && !nonStringAssignmentRHSStr.includes(namePart + "(") && !this.parseUtils.isSpinNoparenMethod(namePart)) {
              this._logSPIN("  --  SPIN MISSING PARENS name=[" + namePart + "]");
              tokenSet.push({
                line: lineIdx,
                startCharacter: nameOffset,
                length: namePart.length,
                ptTokenType: "method",
                ptTokenModifiers: ["builtin", "missingDeclaration"],
              });
            }
            // we use bIsDebugLine in next line so we don't flag debug() arguments!
            else if (
              !this.parseUtils.isSpinReservedWord(namePart) &&
              !this.parseUtils.isSpinBuiltinMethod(namePart) &&
              !this.parseUtils.isBuiltinReservedWord(namePart) &&
              !this.parseUtils.isSpinSpecialMethod(namePart) &&
              !this.parseUtils.isCoginitReservedSymbol(namePart) &&
              !this.parseUtils.isDebugMethod(namePart) &&
              !this.parseUtils.isDebugControlSymbol(namePart) &&
              !bIsDebugLine &&
              !this.parseUtils.isDebugInvocation(namePart)
            ) {
              // NO DEBUG FOR ELSE, most of spin control elements come through here!
              //else {
              //    this._logSPIN('  -- UNKNOWN?? name=[' + namePart + '] - name-get-breakage??');
              //}

              this._logSPIN("  --  SPIN MISSING rhs name=[" + namePart + "]");
              tokenSet.push({
                line: lineIdx,
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
            if (this.parseUtils.isStorageType(constantPart)) {
              // FIXME: UNDONE remove when syntax see this correctly
              const nameOffset: number = line.indexOf(constantPart, currentOffset);
              this._logSPIN("  --  SPIN rhs storageType=[" + constantPart + "](" + (nameOffset + 1) + ")");
              tokenSet.push({
                line: lineIdx,
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
                line: lineIdx,
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
            line: lineIdx,
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

  private _reportSPIN_PasmCode(lineIdx: number, startingOffset: number, line: string): IParsedToken[] {
    const tokenSet: IParsedToken[] = [];
    const lineNbr: number = lineIdx + 1;
    // skip Past Whitespace
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    // get line parts - we only care about first one
    const inLinePasmRHSStr = this._getNonCommentLineReturnComment(currentOffset, lineIdx, line, tokenSet);
    const lineParts: string[] = this.parseUtils.getNonWhitePasmLineParts(inLinePasmRHSStr);
    this._logPASM("  -- reportInLinePasmDecl lineParts=[" + lineParts + "]");
    const bIsAlsoDebugLine: boolean = inLinePasmRHSStr.toLowerCase().indexOf("debug(") != -1 ? true : false;
    if (bIsAlsoDebugLine) {
      const partialTokenSet: IParsedToken[] = this._reportDebugStatement(lineIdx, startingOffset, line);
      partialTokenSet.forEach((newToken) => {
        this._logSPIN("=> SPINpasm: " + this._tokenString(newToken, line));
        tokenSet.push(newToken);
      });
    }
    // handle name in as first part of line...
    // (process label/variable name (but 'debug' of debug() is NOT a label!))
    let haveLabel: boolean = this.parseUtils.isDatOrPasmLabel(lineParts[0]) && lineParts[0].toLowerCase() != "debug";
    const isDataDeclarationLine: boolean = lineParts.length > 1 && haveLabel && this.parseUtils.isDatStorageType(lineParts[1]) ? true : false;
    if (haveLabel) {
      const labelName: string = lineParts[0];
      this._logPASM("  -- labelName=[" + labelName + "]");
      const labelType: string = isDataDeclarationLine ? "variable" : "label";
      const nameOffset: number = line.indexOf(labelName, currentOffset);
      var labelModifiers: string[] = [];
      if (!isDataDeclarationLine) {
        labelModifiers = labelName.startsWith(".") ? ["declaration", "static"] : ["declaration"];
      }
      tokenSet.push({
        line: lineIdx,
        startCharacter: nameOffset,
        length: labelName.length,
        ptTokenType: labelType,
        ptTokenModifiers: labelModifiers,
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
        if (lineParts[argumentOffset].toUpperCase().startsWith("IF_") || lineParts[argumentOffset].toUpperCase().startsWith("_RET_")) {
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
            line: lineIdx,
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
              if (index == lineParts.length - 1 && this.parseUtils.isPasmConditional(argumentName)) {
                // conditional flag-set spec.
                this._logPASM("  -- SKIP argumentName=[" + argumentName + "]");
                continue;
              }
              const currArgumentLen = argumentName.length;
              if (argumentName.charAt(0).match(/[a-zA-Z_\.]/)) {
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
                if (this.semanticFindings.hasLocalPasmTokenForMethod(this.currentMethodName, namePart)) {
                  referenceDetails = this.semanticFindings.getLocalPasmTokenForMethod(this.currentMethodName, namePart);
                  this._logPASM("  --  FOUND local PASM name=[" + namePart + "]");
                } else if (this.semanticFindings.isLocalToken(namePart)) {
                  referenceDetails = this.semanticFindings.getLocalTokenForLine(namePart, lineNbr);
                  this._logPASM("  --  FOUND local name=[" + namePart + "]");
                } else if (this.semanticFindings.isGlobalToken(namePart)) {
                  referenceDetails = this.semanticFindings.getGlobalToken(namePart);
                  this._logPASM("  --  FOUND global name=[" + namePart + "]");
                }
                if (referenceDetails != undefined) {
                  this._logPASM("  --  SPIN inlinePASM add name=[" + namePart + "]");
                  tokenSet.push({
                    line: lineIdx,
                    startCharacter: nameOffset,
                    length: namePart.length,
                    ptTokenType: referenceDetails.type,
                    ptTokenModifiers: referenceDetails.modifiers,
                  });
                } else {
                  // we don't have name registered so just mark it
                  if (namePart != ".") {
                    // odd special case!
                    if (
                      !this.parseUtils.isSpinReservedWord(namePart) &&
                      !this.parseUtils.isBuiltinReservedWord(namePart) &&
                      !this.parseUtils.isDebugMethod(namePart) &&
                      !this.parseUtils.isPasmModczOperand(namePart)
                    ) {
                      this._logPASM("  --  SPIN Pasm MISSING name=[" + namePart + "]");
                      tokenSet.push({
                        line: lineIdx,
                        startCharacter: nameOffset,
                        length: namePart.length,
                        ptTokenType: "variable",
                        ptTokenModifiers: ["missingDeclaration"],
                      });
                    } else if (this.parseUtils.isIllegalInlinePasmDirective(namePart)) {
                      this._logPASM("  --  SPIN inlinePasm ERROR[CODE] illegal name=[" + namePart + "]");
                      tokenSet.push({
                        line: lineIdx,
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
                    line: lineIdx,
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
        if (!this.semanticFindings.isKnownToken(nameOrDirective)) {
          if (this.parseUtils.isIllegalInlinePasmDirective(nameOrDirective) || !this.parseUtils.isPasmInstruction(nameOrDirective)) {
            this._logPASM("  --  SPIN inline-Pasm MISSING name=[" + nameOrDirective + "]");
            const nameOffset = line.indexOf(nameOrDirective, currentOffset);
            tokenSet.push({
              line: lineIdx,
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
      if (this.parseUtils.isDatStorageType(lineParts[0])) {
        currentOffset = line.indexOf(lineParts[0], currentOffset);
      } else {
        currentOffset = line.indexOf(lineParts[1], currentOffset);
      }
      const allowLocalVarStatus: boolean = true;
      const NOT_DAT_PASM: boolean = false;
      const partialTokenSet: IParsedToken[] = this._reportDAT_ValueDeclarationCode(lineIdx, currentOffset, line, allowLocalVarStatus, this.showPasmCode, NOT_DAT_PASM);
      partialTokenSet.forEach((newToken) => {
        tokenSet.push(newToken);
      });
    }
    return tokenSet;
  }

  private _reportOBJ_DeclarationLine(lineIdx: number, startingOffset: number, line: string): IParsedToken[] {
    const tokenSet: IParsedToken[] = [];
    //skip Past Whitespace
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    const remainingNonCommentLineStr: string = this._getNonCommentLineReturnComment(currentOffset, lineIdx, line, tokenSet);
    //this._logOBJ('- RptObjDecl remainingNonCommentLineStr=[' + remainingNonCommentLineStr + ']');
    const bHasOverrides: boolean = remainingNonCommentLineStr.includes("|");
    const overrideParts: string[] = remainingNonCommentLineStr.split("|");

    const remainingLength: number = remainingNonCommentLineStr.length;
    const bHasColon: boolean = remainingNonCommentLineStr.includes(":");
    if (remainingLength > 0) {
      // get line parts - initially, we only care about first one
      const lineParts: string[] = remainingNonCommentLineStr.split(/[ \t\:\[]/);
      this._logOBJ("  --  OBJ lineParts=[" + lineParts + "]");
      const objectName = lineParts[0];
      // object name token must be offset into full line for token
      const nameOffset: number = line.indexOf(objectName, currentOffset);
      tokenSet.push({
        line: lineIdx,
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
          if (elemCountStr.charAt(0).match(/[a-zA-Z_]/)) {
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
              if (this.semanticFindings.isGlobalToken(nameReference)) {
                const referenceDetails: RememberedToken | undefined = this.semanticFindings.getGlobalToken(nameReference);
                // Token offsets must be line relative so search entire line...
                const nameOffset = line.indexOf(nameReference, currentOffset);
                if (referenceDetails != undefined) {
                  //const updatedModificationSet: string[] = this._modifiersWithout(referenceDetails.modifiers, "declaration");
                  this._logOBJ("  --  FOUND global name=[" + nameReference + "]");
                  tokenSet.push({
                    line: lineIdx,
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
                    line: lineIdx,
                    startCharacter: nameOffset,
                    length: nameReference.length,
                    ptTokenType: "variable",
                    ptTokenModifiers: ["readonly"],
                  });
                }
                // we don't have name registered so just mark it
                else if (!this.parseUtils.isSpinReservedWord(nameReference) && !this.parseUtils.isBuiltinReservedWord(nameReference) && !this.parseUtils.isDebugMethod(nameReference)) {
                  this._logOBJ("  --  OBJ MISSING name=[" + nameReference + "]");
                  const nameOffset = line.indexOf(nameReference, currentOffset);
                  tokenSet.push({
                    line: lineIdx,
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
      if (bHasOverrides && overrideParts.length > 1) {
        // Ex:     child1 : "child" | MULTIPLIER = 3, COUNT = 5        ' override child constants
        //                            ^^^^^^^^^^^^^^^^^^^^^^^^^   (process this part)
        const overrides: string = overrideParts[1].replace(/[ \t]/, "");
        const overideSatements: string[] = overrides.split(",");
        this._logOBJ("  -- OBJ overideSatements=[" + overideSatements + "]");
        for (let index = 0; index < overideSatements.length; index++) {
          const statementParts: string[] = overideSatements[index].split("=");
          const overideName: string = statementParts[0].trim();
          const overideValue: string = statementParts[1].trim();
          this._logOBJ("  -- OBJ overideName=[" + overideName + "], " + overideName + "=[" + " + overideName + " + "]");
          let nameOffset: number = line.indexOf(overideName, currentOffset);
          if (this.semanticFindings.isGlobalToken(overideName)) {
            const referenceDetails: RememberedToken | undefined = this.semanticFindings.getGlobalToken(overideName);
            // Token offsets must be line relative so search entire line...
            if (referenceDetails != undefined) {
              //const updatedModificationSet: string[] = this._modifiersWithout(referenceDetails.modifiers, "declaration");
              this._logOBJ("  --  FOUND global name=[" + overideName + "]");
              tokenSet.push({
                line: lineIdx,
                startCharacter: nameOffset,
                length: overideName.length,
                ptTokenType: referenceDetails.type,
                ptTokenModifiers: referenceDetails.modifiers,
              });
            }
          } else {
            this._logOBJ("  --  OBJ MISSING name=[" + overideName + "]");
            tokenSet.push({
              line: lineIdx,
              startCharacter: nameOffset,
              length: overideName.length,
              ptTokenType: "variable",
              ptTokenModifiers: ["missingDeclaration"],
            });
          }
          currentOffset = nameOffset;

          /*  --- for some reason this is broken --- SO Omitting - let's get support for this in the Syntax side of things
          // do light check to see if number then highlight as number
          nameOffset = line.indexOf(overideValue, currentOffset);
          if (this.isNumeric(overideValue)) {
            this._logOBJ("  --  FOUND number=[" + overideValue + "]");
            tokenSet.push({
              line: lineIdx,
              startCharacter: nameOffset,
              length: overideValue.length,
              ptTokenType: "constant",
              ptTokenModifiers: ["numeric"],
            });
          } else {
            this._logOBJ("  --  OBJ Unknown Format number=[" + overideName + "]");
            tokenSet.push({
              line: lineIdx,
              startCharacter: nameOffset,
              length: overideName.length,
              ptTokenType: "variable",
              ptTokenModifiers: ["missingDeclaration"],
            });
          }
          currentOffset = nameOffset;
          */
        }
      }
    }
    return tokenSet;
  }

  private isNumeric(val: any): boolean {
    // REF https://stackoverflow.com/questions/23437476/in-typescript-how-to-check-if-a-string-is-numeric
    let desiredNumericStatus: boolean = false;
    if (val.indexOf("%%") == 0) {
      desiredNumericStatus = true;
    } else if (val.indexOf("%") == 0) {
      desiredNumericStatus = true;
    } else if (val.indexOf("$") == 0) {
      desiredNumericStatus = true;
    } else {
      desiredNumericStatus = !(val instanceof Array) && val - parseFloat(val) + 1 >= 0;
    }
    return desiredNumericStatus;
  }

  private _reportVAR_DeclarationLine(lineIdx: number, startingOffset: number, line: string): IParsedToken[] {
    const tokenSet: IParsedToken[] = [];
    //skip Past Whitespace
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    const remainingNonCommentLineStr: string = this._getNonCommentLineReturnComment(currentOffset, lineIdx, line, tokenSet);
    if (remainingNonCommentLineStr.length > 0) {
      // get line parts - we only care about first one
      let lineParts: string[] = this.parseUtils.getCommaDelimitedNonWhiteLineParts(remainingNonCommentLineStr);
      this._logVAR("  -- rptVarDecl lineParts=[" + lineParts + "]");
      // remember this object name so we can annotate a call to it
      const isMultiDeclaration: boolean = remainingNonCommentLineStr.includes(",");
      const hasStorageType: boolean = this.parseUtils.isStorageType(lineParts[0]);
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
          if (newName.charAt(0).match(/[a-zA-Z_]/) && newName.indexOf("]") == -1) {
            this._logVAR("  -- GLBL ADD rvdl newName=[" + newName + "]");
            const nameOffset: number = line.indexOf(newName, currentOffset);
            tokenSet.push({
              line: lineIdx,
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
              if (referenceName.charAt(0).match(/[a-zA-Z_]/)) {
                let possibleNameSet: string[] = [];
                // is it a namespace reference?
                if (referenceName.includes(".")) {
                  possibleNameSet = referenceName.split(".");
                } else {
                  possibleNameSet = [referenceName];
                }
                this._logVAR("  --  possibleNameSet=[" + possibleNameSet + "]");
                const namePart = possibleNameSet[0];
                if (this.semanticFindings.isGlobalToken(namePart)) {
                  const referenceDetails: RememberedToken | undefined = this.semanticFindings.getGlobalToken(namePart);
                  const searchString: string = possibleNameSet.length == 1 ? possibleNameSet[0] : possibleNameSet[0] + "." + possibleNameSet[1];
                  const nameOffset = line.indexOf(searchString, currentOffset);
                  if (referenceDetails != undefined) {
                    this._logVAR("  --  FOUND global name=[" + namePart + "]");
                    tokenSet.push({
                      line: lineIdx,
                      startCharacter: nameOffset,
                      length: namePart.length,
                      ptTokenType: referenceDetails.type,
                      ptTokenModifiers: referenceDetails.modifiers,
                    });
                  } else {
                    // we don't have name registered so just mark it
                    if (!this.parseUtils.isSpinReservedWord(namePart) && !this.parseUtils.isBuiltinReservedWord(namePart) && !this.parseUtils.isDebugMethod(namePart)) {
                      this._logVAR("  --  VAR Add MISSING name=[" + namePart + "]");
                      tokenSet.push({
                        line: lineIdx,
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
                    line: lineIdx,
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
        if (newName.charAt(0).match(/[a-zA-Z_]/)) {
          this._logVAR("  -- GLBL rvdl2 newName=[" + newName + "]");
          const nameOffset: number = line.indexOf(newName, currentOffset);
          tokenSet.push({
            line: lineIdx,
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

  private _reportDebugStatement(lineIdx: number, startingOffset: number, line: string): IParsedToken[] {
    const tokenSet: IParsedToken[] = [];
    const lineNbr: number = lineIdx + 1;
    // locate and collect debug() display user names and types
    //
    // debug(`{displayName} ... )
    // debug(`zstr_(displayName) lutcolors `uhex_long_array_(image_address, lut_size))
    // debug(`lstr_(displayName, len) lutcolors `uhex_long_array_(image_address, lut_size))
    // debug(``#(letter) lutcolors `uhex_long_array_(image_address, lut_size))
    //
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
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
        line: lineIdx,
        startCharacter: commentOffset,
        length: line.length - commentOffset + 1,
        ptTokenType: "comment",
        ptTokenModifiers: ["line"],
      };
      tokenSet.push(newToken);
    }
    this._logDEBUG("-- DEBUG line(" + lineIdx + ") debugStatementStr=[" + debugStatementStr + "]");
    let lineParts: string[] = this.parseUtils.getDebugNonWhiteLineParts(debugStatementStr);
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
          let bHaveInstantiation = this.parseUtils.isDebugDisplayType(newDisplayType) && !isRuntimeNamed;
          if (bHaveInstantiation) {
            this._logDEBUG("  -- rptDbg --- PROCESSING Instantiation");
            // -------------------------------------
            // process Debug() display instantiation
            //   **    debug(`{displayType} {displayName} ......)
            // (0a) register type use
            this._logDEBUG("  -- rptDbg newDisplayType=[" + newDisplayType + "]");
            tokenSet.push({
              line: lineIdx,
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
              line: lineIdx,
              startCharacter: symbolOffset,
              length: newDisplayName.length,
              ptTokenType: "displayName",
              ptTokenModifiers: ["declaration"],
            });
            symbolOffset += newDisplayName.length;
            // (1) highlight parameter names
            let eDisplayType: eDebugDisplayType = this.semanticFindings.getDebugDisplayEnumForType(newDisplayType);
            const firstParamIdx: number = 3; // [0]=debug [1]=`{type}, [2]={userName}
            for (let idx = firstParamIdx; idx < lineParts.length; idx++) {
              const newParameter: string = lineParts[idx];
              symbolOffset = line.indexOf(newParameter, symbolOffset);
              const bIsParameterName: boolean = this.parseUtils.isNameWithTypeInstantiation(newParameter, eDisplayType);
              if (bIsParameterName) {
                this._logDEBUG("  -- rptDbg newParam=[" + newParameter + "]");
                tokenSet.push({
                  line: lineIdx,
                  startCharacter: symbolOffset,
                  length: newParameter.length,
                  ptTokenType: "setupParameter",
                  ptTokenModifiers: ["reference", "defaultLibrary"],
                });
              } else {
                const bIsColorName: boolean = this.parseUtils.isDebugColorName(newParameter);
                if (bIsColorName) {
                  this._logDEBUG("  -- rptDbg newColor=[" + newParameter + "]");
                  tokenSet.push({
                    line: lineIdx,
                    startCharacter: symbolOffset,
                    length: newParameter.length,
                    ptTokenType: "colorName",
                    ptTokenModifiers: ["reference", "defaultLibrary"],
                  });
                } else {
                  // unknown parameter, is known symbol?
                  let referenceDetails: RememberedToken | undefined = undefined;
                  if (this.semanticFindings.hasLocalPasmTokenForMethod(this.currentMethodName, newParameter)) {
                    referenceDetails = this.semanticFindings.getLocalPasmTokenForMethod(this.currentMethodName, newParameter);
                    this._logPASM("  --  FOUND local PASM name=[" + newParameter + "]");
                  } else if (this.semanticFindings.isLocalToken(newParameter)) {
                    referenceDetails = this.semanticFindings.getLocalTokenForLine(newParameter, lineNbr);
                    this._logPASM("  --  FOUND local name=[" + newParameter + "]");
                  } else if (this.semanticFindings.isGlobalToken(newParameter)) {
                    referenceDetails = this.semanticFindings.getGlobalToken(newParameter);
                    this._logPASM("  --  FOUND global name=[" + newParameter + "]");
                  }
                  if (referenceDetails != undefined) {
                    this._logPASM("  --  SPIN/Pasm add name=[" + newParameter + "]");
                    tokenSet.push({
                      line: lineIdx,
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
                      !this.parseUtils.isDebugMethod(newParameter) &&
                      newParameter.indexOf("`") == -1 &&
                      !this.parseUtils.isUnaryOperator(newParameter) &&
                      !this.parseUtils.isBinaryOperator(newParameter) &&
                      !this.parseUtils.isFloatConversion(newParameter) &&
                      !this.parseUtils.isSpinBuiltinMethod(newParameter) &&
                      !this.parseUtils.isBuiltinReservedWord(newParameter)
                    ) {
                      this._logDEBUG("  -- rptDbg 1 unkParam=[" + newParameter + "]");
                      tokenSet.push({
                        line: lineIdx,
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
            const tokenStringSet: IParsedToken[] = this._reportDebugStrings(lineIdx, line, debugStatementStr);
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
            let bHaveFeed = this.semanticFindings.isKnownDebugDisplay(displayName);
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
                    line: lineIdx,
                    startCharacter: symbolOffset,
                    length: displayName.length,
                    ptTokenType: "displayName",
                    ptTokenModifiers: ["reference"],
                  });
                  symbolOffset += displayName.length + 1;
                  if (firstParamIdx < lineParts.length) {
                    firstParamIdx++;
                    displayName = lineParts[firstParamIdx];
                    bHaveFeed = this.semanticFindings.isKnownDebugDisplay(displayName);
                  } else {
                    bHaveFeed = false;
                  }
                } while (bHaveFeed);
              }
              // (1) highlight parameter names (NOTE: based on first display type, only)
              let eDisplayType: eDebugDisplayType = this.semanticFindings.getDebugDisplayEnumForUserName(newDisplayType);
              if (isRuntimeNamed) {
                // override bad display type with directive if present
                eDisplayType = this._getDisplayTypeForLine(lineNbr);
              }
              let newParameter: string = "";
              for (let idx = firstParamIdx; idx < lineParts.length; idx++) {
                newParameter = lineParts[idx];
                if (newParameter.indexOf("'") != -1 || this.parseUtils.isStorageType(newParameter)) {
                  symbolOffset += newParameter.length;
                  continue; // skip this name (it's part of a string!)
                } else if (newParameter.indexOf("#") != -1) {
                  symbolOffset += newParameter.length;
                  continue; // skip this name (it's part of a string!)
                }
                symbolOffset = line.indexOf(newParameter, symbolOffset);
                this._logDEBUG("  -- rptDbg ?check? [" + newParameter + "] symbolOffset=" + symbolOffset);
                let bIsParameterName: boolean = this.parseUtils.isNameWithTypeFeed(newParameter, eDisplayType);
                if (isRuntimeNamed && newParameter.toLowerCase() == "lutcolors") {
                  bIsParameterName = true;
                }
                if (bIsParameterName) {
                  this._logDEBUG("  -- rptDbg newParam=[" + newParameter + "]");
                  tokenSet.push({
                    line: lineIdx,
                    startCharacter: symbolOffset,
                    length: newParameter.length,
                    ptTokenType: "feedParameter",
                    ptTokenModifiers: ["reference", "defaultLibrary"],
                  });
                } else {
                  const bIsColorName: boolean = this.parseUtils.isDebugColorName(newParameter);
                  if (bIsColorName) {
                    this._logDEBUG("  -- rptDbg newColor=[" + newParameter + "]");
                    tokenSet.push({
                      line: lineIdx,
                      startCharacter: symbolOffset,
                      length: newParameter.length,
                      ptTokenType: "colorName",
                      ptTokenModifiers: ["reference", "defaultLibrary"],
                    });
                  } else {
                    // unknown parameter, is known symbol?
                    let referenceDetails: RememberedToken | undefined = undefined;
                    if (this.semanticFindings.hasLocalPasmTokenForMethod(this.currentMethodName, newParameter)) {
                      referenceDetails = this.semanticFindings.getLocalPasmTokenForMethod(this.currentMethodName, newParameter);
                      this._logPASM("  --  FOUND local PASM name=[" + newParameter + "]");
                    } else if (this.semanticFindings.isLocalToken(newParameter)) {
                      referenceDetails = this.semanticFindings.getLocalTokenForLine(newParameter, lineNbr);
                      this._logPASM("  --  FOUND local name=[" + newParameter + "]");
                    } else if (this.semanticFindings.isGlobalToken(newParameter)) {
                      referenceDetails = this.semanticFindings.getGlobalToken(newParameter);
                      this._logPASM("  --  FOUND global name=[" + newParameter + "]");
                    }
                    if (referenceDetails != undefined) {
                      this._logPASM("  --  SPIN Pasm add name=[" + newParameter + "]");
                      tokenSet.push({
                        line: lineIdx,
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
                        this.parseUtils.isDebugMethod(newParameter) == false &&
                        newParameter.indexOf("`") == -1 &&
                        !this.parseUtils.isUnaryOperator(newParameter) &&
                        !this.parseUtils.isBinaryOperator(newParameter) &&
                        !this.parseUtils.isFloatConversion(newParameter) &&
                        !this.parseUtils.isSpinBuiltinMethod(newParameter) &&
                        !this.parseUtils.isSpinReservedWord(newParameter) &&
                        !this.parseUtils.isBuiltinReservedWord(newParameter)
                      ) {
                        this._logDEBUG("  -- rptDbg 2 unkParam=[" + newParameter + "]"); // XYZZY LutColors
                        tokenSet.push({
                          line: lineIdx,
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
              const tokenStringSet: IParsedToken[] = this._reportDebugStrings(lineIdx, line, debugStatementStr);
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
            if (newParameter.toLowerCase() == "debug" || this.parseUtils.isStorageType(newParameter)) {
              continue;
            }
            symbolOffset = line.indexOf(newParameter, symbolOffset); // walk this past each
            // does name contain a namespace reference?
            let bHaveObjReference: boolean = false;
            if (newParameter.includes(".")) {
              // go register object reference!
              bHaveObjReference = this._reportObjectReference(newParameter, lineIdx, startingOffset, line, tokenSet);
            }
            if (!bHaveObjReference) {
              this._logDEBUG("  -- ?check? [" + newParameter + "]");

              let referenceDetails: RememberedToken | undefined = undefined;
              if (this.semanticFindings.hasLocalPasmTokenForMethod(this.currentMethodName, newParameter)) {
                referenceDetails = this.semanticFindings.getLocalPasmTokenForMethod(this.currentMethodName, newParameter);
                this._logPASM("  --  FOUND local PASM name=[" + newParameter + "]");
              } else if (this.semanticFindings.isLocalToken(newParameter)) {
                referenceDetails = this.semanticFindings.getLocalTokenForLine(newParameter, lineNbr);
                this._logPASM("  --  FOUND local name=[" + newParameter + "]");
              } else if (this.semanticFindings.isGlobalToken(newParameter)) {
                referenceDetails = this.semanticFindings.getGlobalToken(newParameter);
                this._logPASM("  --  FOUND global name=[" + newParameter + "]");
              }
              if (referenceDetails != undefined) {
                //this._logPASM('  --  Debug() colorize name=[' + newParameter + ']');
                tokenSet.push({
                  line: lineIdx,
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
                  !this.parseUtils.isDebugMethod(newParameter) &&
                  !this.parseUtils.isBinaryOperator(newParameter) &&
                  !this.parseUtils.isUnaryOperator(newParameter) &&
                  !this.parseUtils.isFloatConversion(newParameter) &&
                  !this.parseUtils.isSpinBuiltinMethod(newParameter) &&
                  !this.parseUtils.isSpinBuiltInVariable(newParameter)
                ) {
                  this._logDEBUG("  -- rptDbg 3 unkParam=[" + newParameter + "]");
                  tokenSet.push({
                    line: lineIdx,
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
          const tokenStringSet: IParsedToken[] = this._reportDebugStrings(lineIdx, line, debugStatementStr);
          tokenStringSet.forEach((newToken) => {
            tokenSet.push(newToken);
          });
        }
      }
    } else {
      this._logDEBUG("ERROR: _reportDebugStatement() line(" + lineIdx + ") line=[" + line + "] no debug()??");
    }
    return tokenSet;
  }

  private _reportObjectReference(dotReference: string, lineIdx: number, startingOffset: number, line: string, tokenSet: IParsedToken[]): boolean {
    const lineNbr: number = lineIdx + 1;
    this._logDEBUG("  --  rOr dotReference=[" + dotReference + "]");
    let possibleNameSet: string[] = [];
    let bGeneratedReference: boolean = false;
    if (dotReference.includes(".")) {
      const symbolOffset: number = line.indexOf(dotReference, startingOffset); // walk this past each
      possibleNameSet = dotReference.split(".").filter(Boolean);
      this._logDEBUG("  --  possibleNameSet=[" + possibleNameSet + "](" + possibleNameSet.length + ")");
      const namePart = possibleNameSet[0];
      let referenceDetails: RememberedToken | undefined = undefined;
      if (this.semanticFindings.isGlobalToken(namePart)) {
        referenceDetails = this.semanticFindings.getGlobalToken(namePart);
        this._logPASM("  --  FOUND global name=[" + namePart + "]");
      } else if (this.semanticFindings.isLocalToken(namePart)) {
        referenceDetails = this.semanticFindings.getLocalTokenForLine(namePart, lineNbr);
        this._logMessage("  --  FOUND local name=[" + namePart + "]");
      }
      if (referenceDetails != undefined) {
        //this._logPASM('  --  Debug() colorize name=[' + newParameter + ']');
        bGeneratedReference = true;
        tokenSet.push({
          line: lineIdx,
          startCharacter: symbolOffset,
          length: namePart.length,
          ptTokenType: referenceDetails.type,
          ptTokenModifiers: referenceDetails.modifiers,
        });
        if (possibleNameSet.length > 1) {
          // we have .constant namespace suffix
          // determine if this is method has '(' or is constant name
          const refPart = possibleNameSet[1];
          const referenceOffset = line.indexOf(refPart, symbolOffset + namePart.length + 1);
          let isMethod: boolean = false;
          if (line.substr(referenceOffset + refPart.length, 1) == "(") {
            isMethod = true;
          }
          const constantPart: string = possibleNameSet[1];
          if (this.parseUtils.isStorageType(constantPart)) {
            // FIXME: UNDONE remove when syntax see this correctly
            const nameOffset: number = line.indexOf(constantPart, referenceOffset + refPart.length + 1);
            this._logSPIN("  --  rOr rhs storageType=[" + constantPart + "](" + (nameOffset + 1) + ")");
            tokenSet.push({
              line: lineIdx,
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
              line: lineIdx,
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

  private _reportDebugStrings(lineIdx: number, line: string, debugStatementStr: string): IParsedToken[] {
    // debug statements typically have single or double quoted strings.  Let's color either if/when found!
    const tokenSet: IParsedToken[] = [];
    let tokenStringSet: IParsedToken[] = this._reportDebugDblQuoteStrings(lineIdx, line, debugStatementStr);
    tokenStringSet.forEach((newToken) => {
      tokenSet.push(newToken);
    });
    let bNeedSingleQuoteProcessing: boolean = true;
    if (tokenStringSet.length > 0) {
      // see if we have sgl quites outside if dbl-quote strings
      const nonStringLine: string = this.parseUtils.removeDoubleQuotedStrings(debugStatementStr);
      bNeedSingleQuoteProcessing = nonStringLine.indexOf("'") != -1;
    }
    if (bNeedSingleQuoteProcessing) {
      tokenStringSet = this._reportDebugSglQuoteStrings(lineIdx, line, debugStatementStr);
      tokenStringSet.forEach((newToken) => {
        tokenSet.push(newToken);
      });
    }
    return tokenSet;
  }

  private _reportDebugSglQuoteStrings(lineIdx: number, line: string, debugStatementStr: string): IParsedToken[] {
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
              line: lineIdx,
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
                  line: lineIdx,
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
            line: lineIdx,
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

  private _reportDebugDblQuoteStrings(lineIdx: number, line: string, debugStatementStr: string): IParsedToken[] {
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
              line: lineIdx,
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
                line: lineIdx,
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
            line: lineIdx,
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

  private _getSingleQuotedString(currentOffset: number, searchText: string): string {
    let nextString: string = "";
    const stringStartOffset: number = searchText.indexOf("'", currentOffset);
    if (stringStartOffset != -1) {
      this._logDEBUG("  -- gsqs(" + currentOffset + ", [" + searchText + "])");
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

  private _recordDisplayTypeForLine(displayType: string, lineIdx: number): void {
    //this._logMessage('  -- line#' + lineIdx + ', displayType=[' + displayType + ']');
    const newDirective: ISpin2Directive = {
      lineNumber: lineIdx,
      displayType: displayType,
      eDisplayType: this.semanticFindings.getDebugDisplayEnumForType(displayType),
    };
    this._logMessage("=> Add DIRECTIVE: " + this._directiveString(newDirective));
    this.fileDirectives.push(newDirective);
  }

  private _getDisplayTypeForLine(lineNbr: number): eDebugDisplayType {
    let desiredType: eDebugDisplayType = eDebugDisplayType.Unknown;
    let maxLineBefore: number = 0;
    let desiredDirective: ISpin2Directive;
    for (let index = 0; index < this.fileDirectives.length; index++) {
      const currDirective: ISpin2Directive = this.fileDirectives[index];
      this._logMessage("  -- hunt:" + lineNbr + ", ln=" + currDirective.lineNumber + ", typ=" + currDirective.displayType + "(" + currDirective.eDisplayType + ")");
      if (currDirective.lineNumber <= lineNbr) {
        if (currDirective.lineNumber > maxLineBefore) {
          desiredDirective = currDirective;
          desiredType = currDirective.eDisplayType;
          maxLineBefore = currDirective.lineNumber;
        }
      }
    }
    if (desiredType != eDebugDisplayType.Unknown) {
      this._logMessage("  -- directive for line#" + lineNbr + ": " + desiredType);
    }
    return desiredType;
  }

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

  private _getDebugStatement(startingOffset: number, line: string): string {
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    let debugNonCommentStr: string = line;
    let openParenOffset: number = line.indexOf("(", currentOffset);
    let closeParenOffset: number = this.parseUtils.indexOfMatchingCloseParen(line, openParenOffset);
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

  private _getNonWhiteSpinLineParts(line: string): IFilteredStrings {
    //                                     split(/[ \t\-\:\,\+\[\]\@\(\)\!\*\=\<\>\&\|\?\\\~\#\^\/]/);
    const nonEqualsLine: string = this.parseUtils.removeDoubleQuotedStrings(line);
    let lineParts: string[] | null = nonEqualsLine.match(/[^ \t\-\:\,\+\[\]\@\(\)\!\*\=\<\>\&\|\?\\\~\#\^\/]+/g);
    if (lineParts === null) {
      lineParts = [];
    }
    return {
      lineNoQuotes: nonEqualsLine,
      lineParts: lineParts,
    };
  }

  private _getNonCommentLineReturnComment(startingOffset: number, lineIdx: number, line: string, tokenSet: IParsedToken[]): string {
    // skip Past Whitespace
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    const nonCommentLHSStr = this.parseUtils.getNonCommentLineRemainder(currentOffset, line);
    // now record the comment if we have one
    const commentRHSStrOffset: number = currentOffset + nonCommentLHSStr.length;
    const commentOffset: number = line.indexOf("'", commentRHSStrOffset);
    const bHaveDocComment: boolean = line.indexOf("''", commentOffset) != -1;
    this._logMessage("  -- gnwclrc commentOffset=(" + commentOffset + "), bHaveDocComment=[" + bHaveDocComment + "], line=[" + line + "]");
    if (commentOffset != -1) {
      if (!bHaveDocComment) {
        const newToken: IParsedToken = {
          line: lineIdx,
          startCharacter: commentOffset,
          length: line.length - commentOffset + 1,
          ptTokenType: "comment",
          ptTokenModifiers: ["line"],
        };
        //this._logMessage("=> CMT: " + this._tokenString(newToken, line));
        tokenSet.push(newToken);
      }
    }
    return nonCommentLHSStr;
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

  private _directiveString(aDirective: ISpin2Directive): string {
    let desiredInterp: string = "  -- directive=[ln:" + aDirective.lineNumber + ",typ:" + aDirective.displayType + "[" + aDirective.eDisplayType + "])]";
    return desiredInterp;
  }
}
