"use strict";
import * as vscode from "vscode";
// src/spin.bkgndHighlight.behavior.ts

import { semanticConfiguration, reloadSemanticConfiguration } from "./spin2.semantic.configuration";

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

// use a themable color. See package.json for the declaration and default values.
const decorationTypeCONlight = vscode.window.createTextEditorDecorationType({
  backgroundColor: { id: "spin2.conLight" },
});

const decorationTypeCONdark = vscode.window.createTextEditorDecorationType({
  backgroundColor: { id: "spin2.conDark" },
});

const decorationTypeVARlight = vscode.window.createTextEditorDecorationType({
  backgroundColor: { id: "spin2.varLight" },
});

const decorationTypeVARdark = vscode.window.createTextEditorDecorationType({
  backgroundColor: { id: "spin2.varDark" },
});

export class BackgroundHighlighter {
  private configuration = semanticConfiguration;
  private highlightDebugLogEnabled: boolean = false;
  private highlightLog: any = undefined;

  constructor(outputChannel: vscode.OutputChannel | undefined, formatDebugLogEnabled: boolean) {
    this.highlightDebugLogEnabled = formatDebugLogEnabled;
    // save output channel
    this.highlightLog = outputChannel;
  }

  /**
   * write message to formatting log (when log enabled)
   *
   * @param the message to be written
   * @returns nothing
   */
  logMessage(message: string): void {
    if (this.highlightDebugLogEnabled && this.highlightLog != undefined) {
      //Write to output window.
      this.highlightLog.appendLine(message);
    }
  }

  updateConfiguration() {
    this.logMessage(`+ (DBG) updateConfiguration()`);
    if (reloadSemanticConfiguration()) {
      this.logMessage(`+ (DBG) updateConfiguration()  DID reload!`);
      this.configuration = semanticConfiguration;
    }
  }

  isEnabled(): boolean {
    const bEnableStatus: boolean = this.configuration.colorSectionBackgrounds ? true : false;
    return bEnableStatus;
  }

  removeDecorations() {
    let activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      return;
    }
    // remove decorations of our types
    activeEditor.setDecorations(decorationTypeCONlight, []);
    activeEditor.setDecorations(decorationTypeCONdark, []);
    activeEditor.setDecorations(decorationTypeVARlight, []);
    activeEditor.setDecorations(decorationTypeVARdark, []);
  }

  private nextIsCONlight: boolean = true;
  private nextIsVARlight: boolean = true;
  private bgRegionsCONdark: vscode.DecorationOptions[] = [];
  private bgRegionsCONlight: vscode.DecorationOptions[] = [];
  private bgRegionsVARdark: vscode.DecorationOptions[] = [];
  private bgRegionsVARlight: vscode.DecorationOptions[] = [];

  updateDecorations() {
    let activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      return;
    }
    const text = activeEditor.document.getText();
    let currState: eParseState = eParseState.inCon; // compiler defaults to CON at start!
    let priorState: eParseState = currState;
    let startLineNbr: number = 0;

    for (let i = 0; i < activeEditor.document.lineCount; i++) {
      let line = activeEditor.document.lineAt(i);
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
      if (sectionStatus.isSectionStart) {
        currState = sectionStatus.inProgressStatus;
        // ending prior, now PUB ...
        this._recordBlockColor(startLineNbr, i - 1, priorState);
        startLineNbr = i;
        priorState = currState;
      }
    }
    // record last block at end of file
    this._recordBlockColor(startLineNbr, activeEditor.document.lineCount - 1, priorState);

    activeEditor.setDecorations(decorationTypeCONlight, this.bgRegionsCONlight);
    activeEditor.setDecorations(decorationTypeCONdark, this.bgRegionsCONdark);
    activeEditor.setDecorations(decorationTypeVARlight, this.bgRegionsVARlight);
    activeEditor.setDecorations(decorationTypeVARdark, this.bgRegionsVARdark);
  }

  private _recordBlockColor(startLineNumber: number, endLineNumber: number, eSectionType: eParseState): void {
    const startPos = new vscode.Position(startLineNumber, 0);
    const endPos = new vscode.Position(endLineNumber, Number.MAX_VALUE);
    let sectionName: string = this._nameStringForSection(eSectionType);
    let isLight: boolean = this._currStateForSectionAndFlip(eSectionType);
    const decoration = { range: new vscode.Range(startPos, endPos), hoverMessage: sectionName + ": lines **" + startPos.line + " to " + endPos.line + "**" };
    this.logMessage(`+ (DBG) _recordBlockColor(${sectionName}, light=(${isLight}): startFm-(${startPos.line}, ${startPos.character}) -> endAt-(${endPos.line}, MAX)`);
    if (eSectionType === eParseState.inCon) {
      if (isLight) {
        this.bgRegionsCONlight.push(decoration);
      } else {
        this.bgRegionsCONdark.push(decoration);
      }
    } else if (eSectionType === eParseState.inVar) {
      if (isLight) {
        this.bgRegionsVARlight.push(decoration);
      } else {
        this.bgRegionsVARdark.push(decoration);
      }
    }
  }

  private _isSectionStartLine(line: string): {
    isSectionStart: boolean;
    inProgressStatus: eParseState;
  } {
    // return T/F where T means our string starts a new section!
    let startStatus: boolean = true;
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
    //if (startStatus) {
    //  this._logMessage("** isSectStart line=[" + line + "], enum(" + inProgressState + ")");
    //}
    return {
      isSectionStart: startStatus,
      inProgressStatus: inProgressState,
    };
  }

  private _nameStringForSection(eSectionType: eParseState): string {
    let interpString: string = "?UNK?";
    if (eSectionType == eParseState.inCon) {
      interpString = "CON";
    } else if (eSectionType == eParseState.inDat) {
      interpString = "DAT";
    } else if (eSectionType == eParseState.inObj) {
      interpString = "OBJ";
    } else if (eSectionType == eParseState.inPub) {
      interpString = "PUB";
    } else if (eSectionType == eParseState.inPri) {
      interpString = "PRI";
    } else if (eSectionType == eParseState.inVar) {
      interpString = "VAR";
    }
    return interpString;
  }
  private _currStateForSectionAndFlip(eSectionType: eParseState): boolean {
    let initialState: boolean = false;
    if (eSectionType == eParseState.inCon) {
      initialState = this.nextIsCONlight;
      this.nextIsCONlight = this.nextIsCONlight ? false : true;
    } else if (eSectionType == eParseState.inDat) {
    } else if (eSectionType == eParseState.inObj) {
    } else if (eSectionType == eParseState.inPub) {
    } else if (eSectionType == eParseState.inPri) {
    } else if (eSectionType == eParseState.inVar) {
      initialState = this.nextIsVARlight;
      this.nextIsVARlight = this.nextIsVARlight ? false : true;
    }
    return initialState;
  }
}
