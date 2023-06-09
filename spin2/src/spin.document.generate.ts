"use strict";

// https://typescript.hotexamples.com/examples/vscode/window/createTextEditorDecorationType/typescript-window-createtexteditordecorationtype-method-examples.html

import * as vscode from "vscode";
import { EndOfLine } from "vscode";

import * as fs from "fs";
import * as path from "path";

import { ParseUtils } from "./spin2.utils";

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

export class DocGenerator {
  private generatorDebugLogEnabled: boolean = false;
  private generatorLog: any = undefined;
  private parseUtils = new ParseUtils();

  constructor(outputChannel: vscode.OutputChannel | undefined, docGenDebugLogEnabled: boolean) {
    this.generatorDebugLogEnabled = docGenDebugLogEnabled;
    // save output channel
    this.generatorLog = outputChannel;
  }

  /**
   * write message to formatting log (when log enabled)
   *
   * @param the message to be written
   * @returns nothing
   */
  logMessage(message: string): void {
    if (this.generatorDebugLogEnabled && this.generatorLog != undefined) {
      //Write to output window.
      this.generatorLog.appendLine(message);
    }
  }

  generateDocument(): void {
    let textEditor = vscode.window.activeTextEditor;
    if (textEditor) {
      let endOfLineStr: string = "\n";
      if (textEditor.document.eol == EndOfLine.CRLF) {
        endOfLineStr = "\r\n";
      }

      var currentlyOpenTabfilePath = textEditor.document.uri.fsPath;
      var currentlyOpenTabfolderName = path.dirname(currentlyOpenTabfilePath);
      var currentlyOpenTabfileName = path.basename(currentlyOpenTabfilePath);
      this.logMessage(`+ (DBG) generateDocument() fsPath-(${currentlyOpenTabfilePath})`);
      this.logMessage(`+ (DBG) generateDocument() folder-(${currentlyOpenTabfolderName})`);
      this.logMessage(`+ (DBG) generateDocument() filename-(${currentlyOpenTabfileName})`);
      if (currentlyOpenTabfileName.includes(".spin2")) {
        const objectName: string = currentlyOpenTabfileName.replace(".spin2", "");
        const docFilename: string = currentlyOpenTabfileName.replace(".spin2", ".txt");
        this.logMessage(`+ (DBG) generateDocument() outFn-(${docFilename})`);
        const outFSpec = path.join(currentlyOpenTabfolderName, docFilename);
        this.logMessage(`+ (DBG) generateDocument() outFSpec-(${outFSpec})`);

        let outFile = fs.openSync(outFSpec, "w");

        let shouldEmitTopDocComments: boolean = true;

        let currState: eParseState = eParseState.inCon; // compiler defaults to CON at start!
        let priorState: eParseState = currState;

        let pubsFound: number = 0;
        //
        // 1st pass: emit topfile doc comments then list of pub methods
        //
        for (let i = 0; i < textEditor.document.lineCount; i++) {
          let line = textEditor.document.lineAt(i);
          const trimmedLine = line.text.trim();

          const sectionStatus = this._isSectionStartLine(line.text);
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
              //  if last line has additional text write it!
              if (trimmedLine.length > 2 && shouldEmitTopDocComments) {
                fs.appendFileSync(outFile, trimmedLine + endOfLineStr);
              }
            } else {
              //  if last line has additional text write it!
              if (shouldEmitTopDocComments) {
                fs.appendFileSync(outFile, trimmedLine + endOfLineStr);
              }
            }
            continue;
          } else if (currState == eParseState.inMultiLineComment) {
            // in multi-line non-doc-comment, hunt for end '}' to exit
            let closingOffset = trimmedLine.indexOf("}");
            if (closingOffset != -1) {
              // have close, comment ended
              currState = priorState;
            }
            //  DO NOTHING
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
              //  if first line has additional text write it!
              if (trimmedLine.length > 2 && shouldEmitTopDocComments) {
                fs.appendFileSync(outFile, trimmedLine + endOfLineStr);
              }
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
              //  DO NOTHING
              continue;
            }
          } else if (trimmedLine.startsWith("''")) {
            // process single-line doc comment
            if (trimmedLine.length > 2 && shouldEmitTopDocComments) {
              // emit comment without leading ''
              fs.appendFileSync(outFile, trimmedLine.substring(2) + endOfLineStr);
            }
          } else if (sectionStatus.isSectionStart && currState == eParseState.inPub) {
            pubsFound++;
            if (shouldEmitTopDocComments) {
              fs.appendFileSync(outFile, "" + endOfLineStr); // blank line
              const introText: string = 'Object "' + objectName + '" Interface:';
              fs.appendFileSync(outFile, introText + endOfLineStr);
              fs.appendFileSync(outFile, "" + endOfLineStr); // blank line
            }
            shouldEmitTopDocComments = false; // no more of these!
            // emit new PUB prototype (w/o any trailing comment)
            const trimmedNonCommentLine = this.parseUtils.getNonCommentLineRemainder(0, trimmedLine);
            fs.appendFileSync(outFile, trimmedNonCommentLine + endOfLineStr);
          }
        }
        //
        // 2nd pass: emit list of pub methods with doc comments for each (if any)
        //
        let pubsSoFar: number = 0;
        let emitPubDocComment: boolean = false;
        let emitTrailingDocComment: boolean = false;
        for (let i = 0; i < textEditor.document.lineCount; i++) {
          let line = textEditor.document.lineAt(i);
          const trimmedLine = line.text.trim();

          const sectionStatus = this._isSectionStartLine(line.text);
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
              //  if last line has additional text write it!
              if (trimmedLine.length > 2 && (emitTrailingDocComment || emitPubDocComment)) {
                fs.appendFileSync(outFile, line.text.substring(2).trimEnd() + endOfLineStr);
              }
            } else {
              //  if last line has additional text write it!
              if (emitTrailingDocComment || emitPubDocComment) {
                fs.appendFileSync(outFile, line.text.trimEnd() + endOfLineStr);
              }
            }
            continue;
          } else if (currState == eParseState.inMultiLineComment) {
            // in multi-line non-doc-comment, hunt for end '}' to exit
            let closingOffset = trimmedLine.indexOf("}");
            if (closingOffset != -1) {
              // have close, comment ended
              currState = priorState;
            }
            //  DO NOTHING
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
              //  if first line has additional text write it!
              if (trimmedLine.length > 2 && (emitTrailingDocComment || emitPubDocComment)) {
                fs.appendFileSync(outFile, line.text.trimEnd() + endOfLineStr);
              }
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
              //  DO NOTHING
              continue;
            }
          } else if (trimmedLine.startsWith("''")) {
            // process single-line doc comment
            if (trimmedLine.length > 2 && (emitTrailingDocComment || emitPubDocComment)) {
              // emit comment without leading ''
              fs.appendFileSync(outFile, trimmedLine.substring(2) + endOfLineStr);
            }
          } else if (sectionStatus.isSectionStart && currState == eParseState.inPub) {
            emitPubDocComment = true;
            pubsSoFar++;
            // emit new PUB prototype (w/o any trailing comment)
            const trimmedNonCommentLine = this.parseUtils.getNonCommentLineRemainder(0, trimmedLine);
            const header: string = "_".repeat(trimmedNonCommentLine.length);
            fs.appendFileSync(outFile, "" + endOfLineStr); // blank line
            fs.appendFileSync(outFile, header + endOfLineStr); // underscore header line
            fs.appendFileSync(outFile, trimmedNonCommentLine + endOfLineStr);
            fs.appendFileSync(outFile, "" + endOfLineStr); // blank line
            if (pubsSoFar >= pubsFound) {
              emitTrailingDocComment = true;
              emitPubDocComment = false;
            }
          } else if (sectionStatus.isSectionStart && currState != eParseState.inPub && emitTrailingDocComment) {
            // emit blank line just before we do final doc comment at end of file
            fs.appendFileSync(outFile, "" + endOfLineStr); // blank line
          }
        }
        fs.closeSync(outFile);
      }
    }
  }

  async showDocument() {
    let textEditor = vscode.window.activeTextEditor;
    if (textEditor) {
      var currentlyOpenTabfilePath = textEditor.document.uri.fsPath;
      var currentlyOpenTabfolderName = path.dirname(currentlyOpenTabfilePath);
      var currentlyOpenTabfileName = path.basename(currentlyOpenTabfilePath);
      //this.logMessage(`+ (DBG) generateDocument() fsPath-(${currentlyOpenTabfilePath})`);
      //this.logMessage(`+ (DBG) generateDocument() folder-(${currentlyOpenTabfolderName})`);
      //this.logMessage(`+ (DBG) generateDocument() filename-(${currentlyOpenTabfileName})`);
      if (currentlyOpenTabfileName.includes(".spin2")) {
        const docFilename: string = currentlyOpenTabfileName.replace(".spin2", ".txt");
        //this.logMessage(`+ (DBG) generateDocument() outFn-(${docFilename})`);
        const outFSpec = path.join(currentlyOpenTabfolderName, docFilename);
        //this.logMessage(`+ (DBG) generateDocument() outFSpec-(${outFSpec})`);
        let doc = await vscode.workspace.openTextDocument(outFSpec); // calls back into the provider
        await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
      }
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
      this.logMessage("** isSectStart line=[" + line + "], enum(" + inProgressState + ")");
    }
    return {
      isSectionStart: startStatus,
      inProgressStatus: inProgressState,
    };
  }
}
