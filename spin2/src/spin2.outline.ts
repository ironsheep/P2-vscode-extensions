"use strict";
// src/spin2.outline.ts

import * as vscode from "vscode";
import { ParseUtils, eParseState } from "./spin2.utils";

// ----------------------------------------------------------------------------
//   OUTLINE Provider
//
export class Spin2ConfigDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  private parseUtils = new ParseUtils();
  private containerDocSymbol: vscode.DocumentSymbol | undefined = undefined;
  private spin2OutlineLogEnabled: boolean = false; // WARNING (REMOVE BEFORE FLIGHT)- change to 'false' - disable before commit
  private spin2OutlineLog: any = undefined;

  public constructor() {
    if (this.spin2OutlineLogEnabled) {
      if (this.spin2OutlineLog === undefined) {
        //Create output channel
        this.spin2OutlineLog = vscode.window.createOutputChannel("Spin2 Outline DEBUG");
        this._logMessage("Spin2 Outline log started.");
      } else {
        this._logMessage("\n\n------------------   NEW FILE ----------------\n\n");
      }
    }
  }

  public provideDocumentSymbols(document: vscode.TextDocument, _token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[]> {
    return new Promise((resolve, _reject) => {
      let symbols: vscode.DocumentSymbol[] = [];

      let currState: eParseState = eParseState.inCon; // compiler defaults to CON at start!
      let priorState: eParseState = currState;
      let prePasmState: eParseState = currState;

      for (let i = 0; i < document.lineCount; i++) {
        let line = document.lineAt(i);
        const trimmedLine = line.text.trim();
        const trimmedNonCommentLine = this.parseUtils.getNonCommentLineRemainder(0, line.text);

        let linePrefix: string = line.text;
        let lineHasComment: boolean = false;
        let commentOffset: number = 0;
        let commentLength: number = 0;

        const sectionStatus = this._isOlnSectionStartLine(line.text);
        if (sectionStatus.isSectionStart) {
          currState = sectionStatus.inProgressStatus;
        }

        // skip all {{ --- }} multi-line doc comments
        if (currState == eParseState.inMultiLineDocComment) {
          // in multi-line doc-comment, hunt for end '}}' to exit
          let closingOffset = line.text.indexOf("}}");
          if (closingOffset != -1) {
            // have close, comment ended
            currState = priorState;
          }
          //  DO NOTHING Let Syntax highlighting do this
          continue;
        } else if (currState == eParseState.inMultiLineComment) {
          // in multi-line non-doc-comment, hunt for end '}' to exit
          let closingOffset = trimmedLine.indexOf("}");
          if (closingOffset != -1) {
            // have close, comment ended
            currState = priorState;
          }
          //  DO NOTHING Let Syntax highlighting do this
          continue;
        } else if (trimmedLine.startsWith("{{")) {
          // process multi-line doc comment
          let openingOffset = line.text.indexOf("{{");
          const closingOffset = line.text.indexOf("}}", openingOffset + 2);
          if (closingOffset != -1) {
            // is single line comment, just ignore it
          } else {
            // is open of multiline comment
            priorState = currState;
            currState = eParseState.inMultiLineDocComment;
            //  DO NOTHING Let Syntax highlighting do this
          }
          continue;
        } else if (trimmedLine.startsWith("{")) {
          // process possible multi-line non-doc comment
          // do we have a close on this same line?
          let openingOffset = trimmedLine.indexOf("{");
          const closingOffset = trimmedLine.indexOf("}", openingOffset + 1);
          if (closingOffset == -1) {
            // is open of multiline comment
            priorState = currState;
            currState = eParseState.inMultiLineComment;
            //  DO NOTHING Let Syntax highlighting do this
            continue;
          }
        }

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

        if (sectionStatus.isSectionStart) {
          if (linePrefix == "PUB" || linePrefix == "PRI") {
            // start PUB/PRI
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
            // NOTE this changed to METHOD when we added global labels which are to be Functions!
            const methodSymbol = new vscode.DocumentSymbol(linePrefix + " " + methodName, "", vscode.SymbolKind.Method, line.range, line.range);
            this.setContainerSymbol(methodSymbol, symbols);
            //symbols.push(methodSymbol);
          } else {
            // start CON/VAR/OBJ/DAT
            let sectionComment = lineHasComment ? line.text.substr(commentOffset, commentLength) : "";
            const blockSymbol = new vscode.DocumentSymbol(linePrefix + " " + sectionComment, "", vscode.SymbolKind.Field, line.range, line.range);
            this.setContainerSymbol(blockSymbol, symbols);
            //symbols.push(blockSymbol);
          }
        } else {
          let global_label: string | undefined = undefined;
          if (trimmedNonCommentLine.length > 0) {
            //this._logMessage("  * [" + currState + "] ln:" + (i + 1) + " trimmedNonCommentLine=[" + trimmedNonCommentLine + "]");
            // NOT a section start
            if (currState == eParseState.inPasmInline) {
              // process pasm (assembly) lines
              if (trimmedLine.length > 0) {
                this._logMessage("    scan inPasmInline ln:" + (i + 1) + " trimmedNonCommentLine=[" + trimmedNonCommentLine + "]");
                const lineParts: string[] = trimmedNonCommentLine.split(/[ \t]/);
                if (lineParts.length > 0 && lineParts[0].toUpperCase() == "END") {
                  currState = prePasmState;
                  this._logMessage("    scan END-InLine ln:" + (i + 1) + " POP currState=[" + currState + "]");
                  // and ignore rest of this line
                  continue;
                }
                // didn't leave this state check for new global label
                global_label = this._getOlnSPIN_PasmDeclaration(0, line.text);
              }
            } else if (currState == eParseState.inDatPasm) {
              // process pasm (assembly) lines
              if (trimmedLine.length > 0) {
                this._logMessage("    scan inDatPasm ln:" + (i + 1) + " trimmedNonCommentLine=[" + trimmedNonCommentLine + "]");
                const lineParts: string[] = trimmedNonCommentLine.split(/[ \t]/);
                if (lineParts.length > 0 && lineParts[0].toUpperCase() == "FIT") {
                  this._logMessage("  - (" + (i + 1) + "): pre-scan DAT PASM line trimmedLine=[" + trimmedLine + "]");
                  currState = prePasmState;
                  this._logMessage("    scan END DATPasm ln:" + (i + 1) + " POP currState=[" + currState + "]");
                  // and ignore rest of this line
                  continue;
                }
                // didn't leave this state check for new global label
                global_label = this._getOlnDAT_PasmDeclaration(0, line.text); // let's get possible label on this ORG statement
              }
            } else if (currState == eParseState.inDat) {
              this._logMessage("    scan inDat ln:" + (i + 1) + " trimmedNonCommentLine=[" + trimmedNonCommentLine + "]");
              if (trimmedNonCommentLine.length > 6 && trimmedNonCommentLine.toUpperCase().includes("ORG")) {
                // ORG, ORGF, ORGH
                const nonStringLine: string = this.parseUtils.removeDoubleQuotedStrings(trimmedNonCommentLine);
                if (nonStringLine.toUpperCase().includes("ORG")) {
                  this._logMessage("  - pre-scan DAT line trimmedLine=[" + trimmedLine + "] now Dat PASM");
                  prePasmState = currState;
                  currState = eParseState.inDatPasm;
                  this._logMessage("    scan START DATPasm ln:" + (i + 1) + " PUSH currState=[" + prePasmState + "]");
                  // and ignore rest of this line
                  global_label = this._getOlnDAT_PasmDeclaration(0, line.text); // let's get possible label on this ORG statement
                }
              } else {
                global_label = this._getOlnDAT_Declaration(0, line.text);
              }
            } else if (currState == eParseState.inPub || currState == eParseState.inPri) {
              // Detect start of INLINE PASM - org detect
              // NOTE: The directives ORGH, ALIGNW, ALIGNL, and FILE are not allowed within in-line PASM code.
              if (trimmedLine.length > 0) {
                this._logMessage("    scan inPub/inPri ln:" + (i + 1) + " trimmedNonCommentLine=[" + trimmedNonCommentLine + "]");
                const lineParts: string[] = trimmedNonCommentLine.split(/[ \t]/);
                if (lineParts.length > 0 && (lineParts[0].toUpperCase() == "ORG" || lineParts[0].toUpperCase() == "ORGF")) {
                  // Only ORG, not ORGF or ORGH
                  this._logMessage("  - (" + (i + 1) + "): outline PUB/PRI line trimmedLine=[" + trimmedLine + "]");
                  prePasmState = currState;
                  currState = eParseState.inPasmInline;
                  this._logMessage("    scan START-InLine ln:" + (i + 1) + " PUSH currState=[" + prePasmState + "]");
                  // and ignore rest of this line
                  continue;
                }
              }
            }
            if (global_label != undefined) {
              // was Variable: sorta OK (image good, color bad)
              // was Constant: sorta OK (image good, color bad)   SAME
              const labelSymbol = new vscode.DocumentSymbol(global_label, "", vscode.SymbolKind.Constant, line.range, line.range);
              if (this.containerDocSymbol != undefined) {
                this.containerDocSymbol.children.push(labelSymbol);
              } else {
                symbols.push(labelSymbol);
              }
            }
          }
        }
      }
      // if we have one last unpushed, push it
      if (this.containerDocSymbol != undefined) {
        symbols.push(this.containerDocSymbol);
        this.containerDocSymbol = undefined;
      }
      resolve(symbols);
    });
  }

  private setContainerSymbol(newSymbol: vscode.DocumentSymbol, symbolSet: vscode.DocumentSymbol[]): void {
    if (this.containerDocSymbol != undefined) {
      symbolSet.push(this.containerDocSymbol);
    }
    this.containerDocSymbol = newSymbol;
  }

  private _logMessage(message: string): void {
    if (this.spin2OutlineLog != undefined) {
      //Write to output window.
      this.spin2OutlineLog.appendLine(message);
    }
  }

  private _isOlnSectionStartLine(line: string): {
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
      this._logMessage("** isSectStart line=[" + line + "], enum(" + inProgressState + ")");
    }
    return {
      isSectionStart: startStatus,
      inProgressStatus: inProgressState,
    };
  }

  private _getOlnDAT_Declaration(startingOffset: number, line: string): string | undefined {
    // HAVE    bGammaEnable        BYTE   TRUE               ' comment
    //         didShow             byte   FALSE[256]
    //                             byte   FALSE[256]
    let newGlobalLabel: string | undefined = undefined;
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    // get line parts - we only care about first one
    const dataDeclNonCommentStr = this.parseUtils.getNonCommentLineRemainder(currentOffset, line);
    let lineParts: string[] = this.parseUtils.getNonWhiteNParenLineParts(dataDeclNonCommentStr);
    this._logMessage("- OLn GetDatDecl lineParts=[" + lineParts + "](" + lineParts.length + ")");
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
      let haveLabel: boolean = this.parseUtils.isDatOrPasmLabel(lineParts[nameIndex]);
      const isDataDeclarationLine: boolean = lineParts.length > maxParts - 1 && haveLabel && this.parseUtils.isDatStorageType(lineParts[typeIndex]) ? true : false;
      let lblFlag: string = haveLabel ? "T" : "F";
      let dataDeclFlag: string = isDataDeclarationLine ? "T" : "F";
      this._logMessage("- OLn GetDatDecl lineParts=[" + lineParts + "](" + lineParts.length + ") label=" + lblFlag + ", daDecl=" + dataDeclFlag);
      if (haveLabel) {
        let newName = lineParts[nameIndex];
        if (
          !newName.toLowerCase().startsWith("debug") &&
          !this.parseUtils.isPasmReservedWord(newName) &&
          !this.parseUtils.isSpinBuiltInVariable(newName) &&
          !this.parseUtils.isSpinReservedWord(newName) &&
          !this.parseUtils.isBuiltinReservedWord(newName) &&
          // add p1asm detect
          !this.parseUtils.isP1asmInstruction(newName) &&
          !this.parseUtils.isP1asmVariable(newName) &&
          !this.parseUtils.isP1asmConditional(newName)
        ) {
          if (!isDataDeclarationLine && !newName.startsWith(".") && !newName.startsWith(":") && !newName.includes("#")) {
            newGlobalLabel = newName;
          }
          this._logMessage("  -- OLn GLBL gddcl newName=[" + newGlobalLabel + "]");
        }
      }
    }
    return newGlobalLabel;
  }

  private _getOlnDAT_PasmDeclaration(startingOffset: number, line: string): string | undefined {
    // HAVE    bGammaEnable        BYTE   TRUE               ' comment
    //         didShow             byte   FALSE[256]
    let newGlobalLabel: string | undefined = undefined;
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    // get line parts - we only care about first one
    const datPasmRHSStr = this.parseUtils.getNonCommentLineRemainder(currentOffset, line);
    const lineParts: string[] = this.parseUtils.getNonWhiteNParenLineParts(datPasmRHSStr);
    this._logMessage("- Oln GetDatPasmDecl lineParts=[" + lineParts + "](" + lineParts.length + ")");
    // handle name in 1 column
    let haveLabel: boolean = this.parseUtils.isDatOrPasmLabel(lineParts[0]);
    const isDataDeclarationLine: boolean = lineParts.length > 1 && haveLabel && this.parseUtils.isDatStorageType(lineParts[1]) ? true : false;
    if (haveLabel && !isDataDeclarationLine && !lineParts[0].startsWith(".") && !lineParts[0].startsWith(":") && !lineParts[0].includes("#")) {
      const labelName: string = lineParts[0];
      if (
        !this.parseUtils.isReservedPasmSymbols(labelName) &&
        !labelName.toUpperCase().startsWith("IF_") &&
        !labelName.toUpperCase().startsWith("_RET_") &&
        !labelName.toUpperCase().startsWith("DEBUG")
      ) {
        // org in first column is not label name, nor is if_ conditional
        newGlobalLabel = labelName;
        this._logMessage("  -- Oln GetDatPasmDecl GLBL newGlobalLabel=[" + newGlobalLabel + "]");
      }
    }
    return newGlobalLabel;
  }

  private _getOlnSPIN_PasmDeclaration(startingOffset: number, line: string): string | undefined {
    // HAVE    next8SLine ' or .nextLine in col 0
    //         nPhysLineIdx        long    0
    let newGlobalLabel: string | undefined = undefined;
    let currentOffset: number = this.parseUtils.skipWhite(line, startingOffset);
    // get line parts - we only care about first one
    const inLinePasmRHSStr = this.parseUtils.getNonCommentLineRemainder(currentOffset, line);
    const lineParts: string[] = this.parseUtils.getNonWhiteNParenLineParts(inLinePasmRHSStr);
    //this._logPASM('- GetInLinePasmDecl lineParts=[' + lineParts + ']');
    // handle name in 1 column
    const labelName: string = lineParts[0];
    let haveLabel: boolean = this.parseUtils.isDatOrPasmLabel(labelName);
    const isDataDeclarationLine: boolean = lineParts.length > 1 && haveLabel && this.parseUtils.isDatStorageType(lineParts[1]) ? true : false;
    if (haveLabel && !isDataDeclarationLine && !labelName.startsWith(".") && !labelName.startsWith(":") && !labelName.toLowerCase().startsWith("debug") && !labelName.includes("#")) {
      newGlobalLabel = labelName;
      this._logMessage("  -- Inline PASM newGlobalLabel=[" + newGlobalLabel + "]");
    }
    return newGlobalLabel;
  }
}
