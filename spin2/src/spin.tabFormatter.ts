"use strict";

// https://typescript.hotexamples.com/examples/vscode/window/createTextEditorDecorationType/typescript-window-createtexteditordecorationtype-method-examples.html

import * as vscode from "vscode";
import { EndOfLine } from "vscode";
import { getMode, eInsertMode, modeName } from "./spin.insertMode.mode";

// ----------------------------------------------------------------------------
//  this file contains routines for tabbing the code: ==> or <==

/**
 *
 */
export interface Block {
  tabStops: number[];
}

/**
 *
 */
export interface Blocks {
  con: Block;
  var: Block;
  obj: Block;
  pub: Block;
  pri: Block;
  dat: Block;

  [block: string]: Block;
}

/**
 *
 */
export class Formatter {
  readonly config = vscode.workspace.getConfiguration("spinElasticTabstops");
  readonly blocks = this.config.get<Blocks>("blocks")!;
  readonly blocksConfig = this.config.inspect<Blocks>("blocks");

  readonly tabSize = this.config.get<number>("editor.tabSize");
  readonly useTabStops = this.config.get<number>("editor.useTabStops");

  readonly enable = this.config.get<boolean>("enable");
  readonly timeout = this.config.get<number>("timeout");
  readonly maxLineCount = this.config.get<number>("maxLineCount");
  readonly maxLineLength = this.config.get<number>("maxLineLength");

  readonly blockIdentifierREgEx1 = /^(?<block>(con|var|obj|pub|pri|dat))\s+/;
  readonly blockIdentifierREgEx2 = /^(?<block>(con|var|obj|pub|pri|dat))$/;
  readonly orgIdentifierREgEx1 = /^(?<org>\s*(org|orgf|asm))\s+/;
  readonly orgIdentifierREgEx2 = /^(?<org>\s*(org|orgf|asm))$/;
  readonly endIdentifierREgEx1 = /^(?<end>\s*(end|endasm))\s+/;
  readonly endIdentifierREgEx2 = /^(?<end>\s*(end|endasm))$/;

  private tabbingDebugLogEnabled: boolean = true; // WARNING (REMOVE BEFORE FLIGHT)- change to 'false' - disable before commit
  private tabbinglog: any = undefined;

  private _logMessage(message: string): void {
    if (this.tabbinglog != undefined) {
      //Write to output window.
      this.tabbinglog.appendLine(message);
    }
  }

  constructor() {
    if (this.tabbingDebugLogEnabled) {
      if (this.tabbinglog === undefined) {
        //Create output channel
        this.tabbinglog = vscode.window.createOutputChannel("Spin/Spin2 TAB DEBUG");
        this._logMessage("Spin/Spin2 TAB log started.");
      } else {
        this._logMessage("\n\n------------------   NEW FILE ----------------\n\n");
      }
    }
  }

  // Editor Tab Size - "editor.tabSize"
  // Editor Completion - "editor.tabCompletion": "on",
  // Editor Use Tab Stops - "editor.useTabStops": false
  // Editor Sticky Tab Stops - "editor.stickyTabStops": true
  // Editor Insert Spaces - "editor.insertSpaces": false,
  // Editor Detect Indentation "editor.detectIndentation": false

  /**
   * Return T/F where T means the formatter should be enabled
   * @returns T/F
   */
  isEnbled(): boolean {
    const bEnableStatus: boolean = this.enable ? true : false;
    return bEnableStatus;
  }

  /**
   * get the previous tab stop
   * @param blockName
   * @param character
   * @returns
   */
  getPreviousTabStop(blockName: string, character: number): number {
    if (!blockName) {
      blockName = "con";
    }
    const block = this.blocks[blockName.toLowerCase()];

    const stops = block.tabStops ?? [this.tabSize];
    const tabStops = stops?.sort((a, b) => {
      return a - b;
    });

    let index: number;
    while ((index = tabStops?.findIndex((element) => element > character)) === -1) {
      const lastTabStop = tabStops[tabStops.length - 1];
      const lastTabStop2 = tabStops[tabStops.length - 2];
      const lengthTabStop = lastTabStop - lastTabStop2;
      tabStops.push(lastTabStop + lengthTabStop);
    }
    //this._logMessage(`+ (DBG) tabStops-[${tabStops}]`);
    let prevTabStop: number = tabStops[index - 1] ?? 0;
    if (prevTabStop == character) {
      prevTabStop = tabStops[index - 2] ?? 0;
    }
    this._logMessage(`+ (DBG) getPreviousTabStop(${blockName}) startFm-(${character}) -> TabStop-(${prevTabStop})`);
    return prevTabStop;
  }

  /**
   * get the current tab stop
   * @param blockName
   * @param character
   * @returns
   */
  getCurrentTabStop(blockName: string, character: number): number {
    if (!blockName) {
      blockName = "con";
    }
    const block = this.blocks[blockName.toLowerCase()];

    const stops = block.tabStops ?? [this.tabSize];
    const tabStops = stops?.sort((a, b) => {
      return a - b;
    });

    let index: number;
    while ((index = tabStops?.findIndex((element) => element > character)) === -1) {
      const lastTabStop = tabStops[tabStops.length - 1];
      const lastTabStop2 = tabStops[tabStops.length - 2];
      const lengthTabStop = lastTabStop - lastTabStop2;
      tabStops.push(lastTabStop + lengthTabStop);
    }
    //this._logMessage(`+ (DBG) tabStops-[${tabStops}]`);
    const currTabStop: number = tabStops[index - 1] ?? 0;
    this._logMessage(`+ (DBG) getCurrentTabStop(${blockName}) startFm-(${character}) -> TabStop-(${currTabStop})`);
    return currTabStop;
  }

  /**
   * get the next tab stop
   * @param blockName
   * @param character
   * @returns
   */
  getNextTabStop(blockName: string, character: number): number {
    if (!blockName) {
      blockName = "con";
    }
    const block = this.blocks[blockName.toLowerCase()];

    const stops = block.tabStops ?? [this.tabSize];
    const tabStops = stops?.sort((a, b) => {
      return a - b;
    });

    let index: number;
    while ((index = tabStops?.findIndex((element) => element > character)) === -1) {
      const lastTabStop = tabStops[tabStops.length - 1];
      const lastTabStop2 = tabStops[tabStops.length - 2];
      const lengthTabStop = lastTabStop - lastTabStop2;
      tabStops.push(lastTabStop + lengthTabStop);
    }
    //this._logMessage(`+ (DBG) tabStops-[${tabStops}]`);

    const nextRtTabStop = tabStops[index];
    //this._logMessage(`+ (DBG) getNextTabStop(${blockName}) startFm-(${character}) -> TabStop-(${nextRtTabStop})`);
    return nextRtTabStop;
  }

  /**
   * get the name of the current block/section
   *
   * @param document
   * @param selection
   * @returns
   */
  getBlockName(document: vscode.TextDocument, selection: vscode.Selection): string {
    // searching towards top of document looking for enclosing block identifier

    // NEW for PUB/PRI - lets detect ORG and ORGF (asm for FlexSpin) being present
    // also detect END (endasm for FlexSpin)
    //  on way to finding PUB or PRI.
    //  if we find one of the ORGs and NOT END then we return DAT so as to use
    //   DAT tabs in the PUB section for inline PASM
    let blockName: string = "";
    let bFoundOrg = false;
    let bFoundEnd = false;
    for (let lineIndex = selection.anchor.line; lineIndex >= 0; lineIndex--) {
      const line = document.lineAt(lineIndex);
      if (line.text.length < 3) {
        continue;
      }
      //this._logMessage(`  -- line=[${line.text}]`);

      if (bFoundOrg == false) {
        let matchOrg = line.text.toLowerCase().match(this.orgIdentifierREgEx1);
        if (!matchOrg) {
          matchOrg = line.text.toLowerCase().match(this.orgIdentifierREgEx2);
        }
        if (matchOrg) {
          bFoundOrg = true;
        }
        //this._logMessage(`   -- matchOrg-[${matchOrg}]`);
      }

      if (bFoundEnd == false) {
        let matchEnd = line.text.toLowerCase().match(this.endIdentifierREgEx1);
        if (!matchEnd) {
          matchEnd = line.text.toLowerCase().match(this.endIdentifierREgEx2);
        }
        if (matchEnd) {
          bFoundEnd = true;
        }
        //this._logMessage(`   -- matchOrg-[${matchOrg}]`);
      }

      let match = line.text.toLowerCase().match(this.blockIdentifierREgEx1);
      if (!match) {
        match = line.text.toLowerCase().match(this.blockIdentifierREgEx2);
      }
      //const match = line.text.match(this.blockIdentifier);
      //this._logMessage(`   -- match-[${match}]`);
      if (match) {
        blockName = match.groups?.block ?? "";
        if (blockName.length > 0) {
          if (bFoundOrg && !bFoundEnd && (blockName.toUpperCase() == "PUB" || blockName.toUpperCase() == "PRI")) {
            blockName = "dat";
          }
        }

        break;
      }
    }
    blockName = blockName.toUpperCase();
    this._logMessage(`getBlockName() s,e-[${selection.start.line}:${selection.start.character} - ${selection.end.line}:${selection.end.character}] BLOK-[${blockName}]`);
    return blockName;
  }

  countWhiteSpace(textString: string, offset: number): number {
    let nbrWhiteSpaceChars: number = 0;
    if (offset < 0) {
      offset = 0;
    }
    for (var idx: number = offset; idx < textString.length; idx++) {
      if (this.isCharWhiteAt(textString, idx)) {
        break;
      }
      nbrWhiteSpaceChars++;
    }
    return nbrWhiteSpaceChars;
  }

  countLeftWhiteSpace(textString: string, offset: number): number {
    let nbrWhiteSpaceChars: number = 0;
    if (offset < 0) {
      offset = 0;
    }
    if (offset > 1) {
      for (var idx: number = offset - 1; idx >= 0; idx--) {
        if (!this.isCharWhiteAt(textString, idx)) {
          if (nbrWhiteSpaceChars > 0) {
            nbrWhiteSpaceChars--;
          }
          break;
        }
        nbrWhiteSpaceChars++;
      }
    }
    return nbrWhiteSpaceChars;
  }

  isCharWhiteAt(text: string, index: number): boolean {
    let isCharWhiteAtStatus: boolean = false;
    if (text.charAt(index) == " " || text.charAt(index) == "\t") {
      isCharWhiteAtStatus = true;
    }
    //this._logMessage(` - isCharWhiteAt() char-[${text.charAt(index)}](${index}) is white?: [${isCharWhiteAtStatus}]`);
    return isCharWhiteAtStatus;
  }

  isTextAllWhite(text: string): { bNotAllWhite: boolean; nonWhiteIndex: number } {
    var bNotAllWhite: boolean = false;
    var nonWhiteIndex: number = 0;
    for (nonWhiteIndex = 0; nonWhiteIndex < text.length; nonWhiteIndex++) {
      const bThisIsWhite: boolean = this.isCharWhiteAt(text, nonWhiteIndex);
      if (bThisIsWhite == false) {
        bNotAllWhite = true;
        break; // have our answer, abort
      }
    }
    return { bNotAllWhite, nonWhiteIndex };
  }

  locateDoubleWhiteLeftEdge(currLineText: string, cursorPos: vscode.Position): vscode.Position {
    // for Align Mode we need to manipulate the extra space at right edge of text being moved
    // this extra space is defined as two or more spaces. So find the location of two spaces to
    // right of the given position
    let leftMostDoubleWhitePos: vscode.Position = cursorPos.with(0, 0);
    for (var idx: number = cursorPos.character; idx < currLineText.length - 1; idx++) {
      if (this.isCharWhiteAt(currLineText, idx) == true && this.isCharWhiteAt(currLineText, idx + 1) == true) {
        leftMostDoubleWhitePos = cursorPos.with(cursorPos.line, idx);
        break;
      }
    }
    this._logMessage(
      ` - (DBG) locateDoubleWhiteLeftEdge() txt-[${currLineText}](${currLineText.length}) cursor-[${cursorPos.line}:${cursorPos.character}] => dblWhtPos=[${leftMostDoubleWhitePos.line}:${leftMostDoubleWhitePos.character}]`
    );
    return leftMostDoubleWhitePos;
  }

  countOfWhiteChars(currLineText: string, cursorPos: vscode.Position): number {
    // for Align Mode we are going to add or remove spaces in the extra space
    //  area right of the cursor postion, let's count how many spaces we have there
    let nbrWhiteChars: number = 0;
    for (var idx: number = cursorPos.character; idx < currLineText.length; idx++) {
      if (this.isCharWhiteAt(currLineText, idx) == false) {
        break;
      }
      nbrWhiteChars++;
    }
    this._logMessage(` - (DBG) countOfWhiteChars() txt-[${currLineText}](${currLineText.length}) cursor-[${cursorPos.line}:${cursorPos.character}] => whiteLength is (${nbrWhiteChars}) spaces`);
    return nbrWhiteChars;
  }

  locateLeftTextEdge(currLineText: string, cursorPos: vscode.Position): vscode.Position {
    // now adjust cursor: if at white, skip to next rightmost non-white, if at non-white, skip to left edge of non-white
    //  or put another way skip to left most char of text (if in text find left edge, if not in text find first text to right)
    //this._logMessage(` - locateLeftTextEdge() txt-[${currLineText}](${currLineText.length}) cursor-[${cursorPos.line}:${cursorPos.character}])`);
    //const searchArea: string = currLineText.substring(cursorPos.character);
    //this._logMessage(`   -- searching-[${searchArea}](${searchArea.length}) [0-${searchArea.length - 1}])`);
    let leftMostNonWhitePos: vscode.Position = cursorPos;
    if (this.isCharWhiteAt(currLineText, cursorPos.character)) {
      // at whitespace, look right to next non-whitespace...
      let bFoundNonWhite = false;
      for (var idx: number = cursorPos.character + 1; idx < currLineText.length; idx++) {
        if (this.isCharWhiteAt(currLineText, idx) == false) {
          leftMostNonWhitePos = cursorPos.with(cursorPos.line, idx);
          bFoundNonWhite = true;
          break;
        }
      }
      //this._logMessage(`---- endSrchRt-[${leftMostNonWhitePos.line}:${leftMostNonWhitePos.character}], bFoundNonWhite=(${bFoundNonWhite})`);
      // if we didnt find any NON-white in this search, just return location of char after selection
      if (!bFoundNonWhite) {
        leftMostNonWhitePos = cursorPos.with(cursorPos.line, currLineText.length);
      }
    } else {
      // at non-whitespace, look left to next whitespace then back one...
      let bFoundWhite = false;
      for (var idx: number = cursorPos.character - 1; idx >= 0; idx--) {
        if (this.isCharWhiteAt(currLineText, idx)) {
          leftMostNonWhitePos = cursorPos.with(cursorPos.line, idx + 1);
          bFoundWhite = true;
          break;
        }
      }
      //this._logMessage(`---- endSrchLt-[${leftMostNonWhitePos.line}:${leftMostNonWhitePos.character}], bFoundWhite=(${bFoundWhite})`);
      // if we didnt find any NON-white in this search, just return location start of line
      if (!bFoundWhite) {
        leftMostNonWhitePos = cursorPos.with(cursorPos.line, 0);
      }
    }
    this._logMessage(`---- ltEdge-[${leftMostNonWhitePos.line}:${leftMostNonWhitePos.character}])`);
    return leftMostNonWhitePos;
  }

  getNonwiteFromSelectedText(selectedText: string): string {
    // there is non-white text in (selectedText}, return it and everything else to the right of it
    let nonWhiteRightEdge: string = "";
    if (!this.isCharWhiteAt(selectedText, 0)) {
      const startPos: vscode.Position = new vscode.Position(0, 0);
      const nonWhiteCharPos = this.locateLeftTextEdge(selectedText, startPos);
      if (nonWhiteCharPos.character < selectedText.length) {
        nonWhiteRightEdge = selectedText.substring(nonWhiteCharPos.character);
      }
    } else {
      nonWhiteRightEdge = selectedText;
    }
    return nonWhiteRightEdge;
  }

  lineNumbersFromSelection(document: vscode.TextDocument, selection: vscode.Selection): { firstLine: number; lastLine: number; lineCount: number } {
    let lineCount: number = 0;
    let firstLine: number = 0;
    let lastLine: number = 0;
    // what kind of section do we have?
    if (selection.isEmpty) {
      // empty, just a cursor location
      firstLine = selection.start.line;
      lastLine = selection.end.line;
      lineCount = lastLine - firstLine + 1;
    } else {
      // non-empty then let's figure out which lines could change
      const allSelectedText: string = document.getText(selection);
      const lines: string[] = allSelectedText.split(/\r?\n/);
      lineCount = lines.length;
      firstLine = selection.start.line;
      lastLine = selection.end.line;
      //this._logMessage(` - (DBG) ${lineCount} lines: fm,to=[${firstLine}, ${lastLine}], allSelectedText=[${allSelectedText}](${allSelectedText.length}), lines=[${lines}](${lines.length})`);
      for (var currLineIdx: number = 0; currLineIdx < lines.length; currLineIdx++) {
        if (lines[currLineIdx].length == 0) {
          if (currLineIdx == lines.length - 1) {
            lastLine--;
            lineCount--;
          }
        }
      }
      if (firstLine > lastLine && lineCount == 0) {
        // have odd selection case, let's override it!
        // (selection contained just a newline!)
        firstLine--;
        lastLine = firstLine;
        lineCount = 1;
      }
    }

    return { firstLine, lastLine, lineCount };
  }

  calculateLeftEdge(document: vscode.TextDocument, firstLine: number, lastLine: number): number {
    // return column-number of left-most non-white character in set of lines
    let leftMostNonWhiteColumn: number = 999999;
    for (var currLine: number = firstLine; currLine <= lastLine; currLine++) {
      let currLineText: string = document.lineAt(currLine).text;
      // if empty line, don't count this when locating left edge
      if (currLineText.length > 0) {
        let cursorPos: vscode.Position = new vscode.Position(currLine, 0);
        let nonWhitePos: vscode.Position = this.locateLeftTextEdge(currLineText, cursorPos);
        if (nonWhitePos.character < leftMostNonWhiteColumn) {
          leftMostNonWhiteColumn = nonWhitePos.character;
        }
      }
    }
    if (leftMostNonWhiteColumn == 999999) {
      // if no elgible lines found, then just return left edge
      leftMostNonWhiteColumn = 0;
    }
    return leftMostNonWhiteColumn;
  }

  calculateRightEdge(document: vscode.TextDocument, firstLine: number, lastLine: number): number {
    // return column-number of right-most non-white left-edge character in set of lines
    let rightMostNonWhiteColumn: number = 0;
    for (var currLine: number = firstLine; currLine <= lastLine; currLine++) {
      let currLineText: string = document.lineAt(currLine).text;
      // if empty line, don't count this when locating left edge
      if (currLineText.length > 0) {
        let cursorPos: vscode.Position = new vscode.Position(currLine, 0);
        let nonWhitePos: vscode.Position = this.locateLeftTextEdge(currLineText, cursorPos);
        if (nonWhitePos.character > rightMostNonWhiteColumn) {
          rightMostNonWhiteColumn = nonWhitePos.character;
        }
      }
    }
    return rightMostNonWhiteColumn;
  }

  /**
   * insert comment showing tab stops
   *
   * @param document A text document.
   * @return A list of text edit objects.
   */
  insertTabStopsComment(document: vscode.TextDocument, selections: readonly vscode.Selection[]): vscode.ProviderResult<vscode.TextEdit[]> {
    return selections
      .map((selection) => {
        let results: vscode.ProviderResult<vscode.TextEdit[]> = [];
        const block = this.getBlockName(document, selection);
        this._logMessage(
          `* iCm enabled=[${this.enable}], selection(isSingle-[${selection.isSingleLine}] BLOK-[${block}] isEmpty-[${selection.isEmpty}] s,e-[${selection.start.line}:${selection.start.character} - ${selection.end.line}:${selection.end.character}] activ-[${selection.active.character}] anchor-[${selection.anchor.character}])`
        );
        // if tabbing is not enabled, just return after doing nothing
        if (this.enable == false) {
          return results;
        }
        const { firstLine, lastLine, lineCount } = this.lineNumbersFromSelection(document, selection);
        const cursorPos: vscode.Position = new vscode.Position(firstLine, 0);
        let charactersToInsert: string = "'";
        let priorTabstop: number = 0;
        let currTabstop: number = 0;
        let tabNumber: number = 1;
        do {
          currTabstop = this.getNextTabStop(block, currTabstop);
          let distance: number = currTabstop - priorTabstop - 1;
          const horizStr: string = "-".repeat(distance);
          priorTabstop = currTabstop;
          charactersToInsert = `${charactersToInsert}${horizStr}+`;
          //this._logMessage(` --tab#${tabNumber}  curr=(${currTabstop}) dist=(${distance})`);
          tabNumber++;
        } while (charactersToInsert.length < 80);

        let endOfLineStr: string = "\n";
        if (document.eol == EndOfLine.CRLF) {
          endOfLineStr = "\r\n";
        }
        // insert a "template tab-column comment line" above the line upon which our cursor sits
        results.push(vscode.TextEdit.insert(cursorPos, `${charactersToInsert}${endOfLineStr}`));

        return results;
      })
      .reduce((selections, selection) => selections.concat(selection), []);
  }

  leftOfCursor(cursor: vscode.Position): vscode.Position {
    // return cursor position adjusted left 1 char if cursor was not already at left edge
    let adjustedPosition: vscode.Position = cursor;
    if (cursor.character > 0) {
      adjustedPosition = cursor.with(cursor.line, cursor.character - 1);
    }
    return adjustedPosition;
  }

  /**
   * indent one tab stop
   *
   * @param document A text document.
   * @return A list of text edit objects.
   */
  indentTabStop(document: vscode.TextDocument, editor: vscode.TextEditor): vscode.ProviderResult<vscode.TextEdit[]> {
    const selections: readonly vscode.Selection[] = editor.selections;
    let finalSelections: vscode.Selection[] = [];
    const editResult: vscode.ProviderResult<vscode.TextEdit[]> = selections
      .map((selection) => {
        let results: vscode.ProviderResult<vscode.TextEdit[]> = [];
        const block = this.getBlockName(document, selection);
        this._logMessage(
          `* inD enabled=[${this.enable}], selection(isSingle-[${selection.isSingleLine}] BLOK-[${block}] isEmpty-[${selection.isEmpty}] s,e-[${selection.start.line}:${selection.start.character} - ${selection.end.line}:${selection.end.character}] activ-[${selection.active.character}] anchor-[${selection.anchor.character}])`
        );
        // if tabbing is not enabled, just return after doing nothing
        if (this.enable == false) {
          return results;
        }

        // re SELECTION - {start} and {end} are actual bounds, {active} is where cursor is! (could be left or right end of selection)
        //  if selection was created dragging from right to left cursor is at left end,
        //  if selection was created dragging from left to right cursor is at right end.

        //  if no selection, just cursor - skip whitespace to right - treat chars to right
        //  if selection is single line:
        //     then if first char is whitespace - then hunt for text-edge to right
        //          else (first char is non-white) - then hunt for text-edge to left

        // if selection left char is white get tab from left edge of selection
        // else get tab from left edge of text
        let { firstLine, lastLine, lineCount } = this.lineNumbersFromSelection(document, selection);
        const bWholeLines: boolean = firstLine != lastLine;

        // this will be used to find our tab column in multi-line case
        if (bWholeLines) {
          this._logMessage(` - (DBG) ${lineCount} lines: fm,to=[${firstLine}, ${lastLine}]`);
        }

        // set initial position (where cursor actually is)
        let initialCursorPos: vscode.Position = selection.active;
        let cursorPos: vscode.Position = initialCursorPos;
        // if we have multi-line selection reset cursor to first char of all lines
        if (bWholeLines) {
          initialCursorPos = cursorPos.with(cursorPos.line, 0);
        }
        this._logMessage(` - (DBG)BLOK-[${block}], wholeLines=(${bWholeLines}), lines fm,to=[${firstLine}, ${lastLine}], cursor-[${cursorPos.line}:${cursorPos.character}]`);

        for (var currLine: number = firstLine; currLine <= lastLine; currLine++) {
          // now use selection to skip whitespace to right of cursor
          cursorPos = cursorPos.with(currLine, initialCursorPos.character);

          // grab the text of the current selected line
          let currLineText: string = document.lineAt(currLine).text;

          let selectedText: string = ""; // non-empty if we have text within the selection

          // if we found text to adjust...
          if (currLineText.length > 0 || bWholeLines) {
            // now adjust cursor: if at white, skip to next rightmost non-white, if at non-white, skip to left edge of non-white
            //  or put another way skip to left most char of text (if in text find left edge, if not in text find first text to right)
            let textLeftEdgePos: vscode.Position = cursorPos; // value NOT used!
            // CLASSIFY our selection so we know where to place cursor
            if (selection.isEmpty) {
              // have insert point
              //  (will never happen in multi-line case)
              // if we are pointing to white space, move to left edge of text (to right of position)
              if (this.isCharWhiteAt(currLineText, cursorPos.character)) {
                cursorPos = this.locateLeftTextEdge(currLineText, cursorPos);
                textLeftEdgePos = cursorPos;
              }
            } else if (selection.isSingleLine) {
              // have true single line selection
              //  (will never happen in multi-line case)
              selectedText = document.getText(selection);

              // move to left edge of text (to left -OR- right of position)
              const selectionLeftEdgePos: vscode.Position = cursorPos.with(selection.start);
              cursorPos = this.locateLeftTextEdge(currLineText, selectionLeftEdgePos);
              textLeftEdgePos = cursorPos;

              if (textLeftEdgePos.character >= selection.start.character && textLeftEdgePos.character <= selection.end.character) {
                // if left edge of text is within selection...
                // we are possibly replacing some white... we need tab stop to right of "left edge of selection" move cursor to left edge
                cursorPos = cursorPos.with(selection.start);
              } else if (textLeftEdgePos.character < selection.start.character) {
                //  left edge of text is left of selection
                // leave CURSOR at left edge of text
              } else {
                //  left edge of text is right of selection
                cursorPos = cursorPos.with(selection.start);
              }
            } else {
              // have FAKE single line selection (treat as entire line selection)
              // -OR- have single line of multiple line selection
              textLeftEdgePos = this.locateLeftTextEdge(currLineText, cursorPos);
              cursorPos = textLeftEdgePos;
            }

            // lastly move non-white chars from cusor to next tabstop to right
            let nextTabstop: number = this.getNextTabStop(block, cursorPos.character);
            this._logMessage(
              ` - line#${currLine} cursor-[${cursorPos.line}:${cursorPos.character}], leftEdge=[${textLeftEdgePos.line}:${textLeftEdgePos.character}], nextTabstop=[${nextTabstop}], selectedText-[${selectedText}], text-[${currLineText}]`
            );

            let nbrSpacesToRemove: number = 0; // if non zero these will be removed from selection start
            let nbrSpacesToInsert: number = 0;
            if (selection.isEmpty) {
              // have insert point
              // SPACEct = dist from text to desired tab
              nbrSpacesToInsert = nextTabstop - textLeftEdgePos.character;
            } else if (selection.isSingleLine) {
              // have true single line selection
              //  (will never happen in multi-line case)
              if (textLeftEdgePos.character > selection.end.character) {
                // CASE: textEdge is right of selection
                // case (5):  (tabstop - leftEdge) + plus leftEdgeSelectionWhite (all of white)
                // we are possibly removeing or possibly adding to get to tab location
                if (textLeftEdgePos.character == nextTabstop) {
                  // already at proper location
                  // no deletes or adds
                } else if (textLeftEdgePos.character < nextTabstop) {
                  // need to move text right
                  // add only
                  nbrSpacesToInsert = nextTabstop - textLeftEdgePos.character;
                  // INSERT-POINT is textLeftEdgePos
                } else {
                  // need to move text left
                  nbrSpacesToRemove = textLeftEdgePos.character - nextTabstop;
                  // DELETE-POINT is textLeftEdgePos - nbrSpacesToRemove
                }
              } else if (textLeftEdgePos.character > selection.start.character) {
                // CASE: textEdge is within selection
                // case 1: (tabstop - leftEdge) + plus leftEdgeSelectionWhite
                // case 4:  (tabstop - leftEdge) + plus leftEdgeSelectionWhite
                // -- we have white at left edge of selection!
                if (textLeftEdgePos.character < nextTabstop) {
                  // need to move text right
                  // add only
                  nbrSpacesToInsert = nextTabstop - textLeftEdgePos.character;
                  // INSERT-POINT is textLeftEdgePos
                } else {
                  // need to move text left
                  nbrSpacesToRemove = textLeftEdgePos.character - nextTabstop;
                  // DELETE-POINT is textLeftEdgePos - nbrSpacesToRemove
                }
              } else {
                // CASE: textEdge is left of selection
                // case 2: tabstop - leftEdge
                // case 3: tabstop - leftedge
                // case 6: tabstop - leftedge
                // left edge is left of selection
                // SPACEct = dist from text to desired tab
                nbrSpacesToInsert = nextTabstop - textLeftEdgePos.character;
              }
            } else {
              // have FAKE single line selection (treat as entire line selection)
              // -OR- have single line of multiple line selection
              // SPACEct = dist from text to desired tab
              nbrSpacesToInsert = nextTabstop - textLeftEdgePos.character;
            }
            this._logMessage(`    line#${currLine} Decision: nbrSpacesToInsert=(${nbrSpacesToInsert}), nbrSpacesToRemove=(${nbrSpacesToRemove})`);

            // SPECIAL case, if empty line then insert spaces all the way to the tabstop!
            if (bWholeLines && currLineText.length == 0) {
              nbrSpacesToInsert = nextTabstop;
            }
            this._logMessage(
              ` - line#${currLine} finding: BLOK-[${block}], cursor-[${cursorPos.line}:${cursorPos.character}], next TabStop is TAB-(${nextTabstop}), nbrSpacesToRemove=(${nbrSpacesToRemove}), nbrSpacesToInsert=(${nbrSpacesToInsert})`
            );

            // optionally remove spaces, then optionally add spaces
            if (nbrSpacesToRemove > 0) {
              const deleteStartPos: vscode.Position = selection.start;
              const deleteEndPos: vscode.Position = deleteStartPos.with(deleteStartPos.line, deleteStartPos.character + nbrSpacesToRemove);
              const deleteRange: vscode.Range = new vscode.Range(deleteStartPos, deleteEndPos);
              this._logMessage(
                `    line#${currLine} pushed DELETE ${deleteRange.end.character - deleteRange.start.character} spaces at [${deleteStartPos.line}:${deleteStartPos.character}-${deleteEndPos.character}]`
              );
              results.push(vscode.TextEdit.delete(deleteRange));
              cursorPos = cursorPos.with(textLeftEdgePos.line, textLeftEdgePos.character - nbrSpacesToRemove);
              this._logMessage(`    line#${currLine} > after-DELETE cursor-[${cursorPos.line}:${cursorPos.character}]`);
              // since we are single line we could have putback text to put it back in if we need!
              // if we are in align mode, let's count this change
              if (getMode(editor) == eInsertMode.ALIGN) {
                // see if we have double-white-space to manipulate...
                let doubleWhitePos: vscode.Position = this.locateDoubleWhiteLeftEdge(currLineText, textLeftEdgePos);
                if (doubleWhitePos.line != 0 && doubleWhitePos.character != 0) {
                  // yes we do!
                  // insert length of spaces we removed but at this doubleWhite location
                  const charactersToInsert: string = " ".repeat(deleteRange.end.character - deleteRange.start.character);
                  this._logMessage(`    line#${currLine} pushed AlignMode INSERT ${charactersToInsert.length} spaces before [${doubleWhitePos.line}:${doubleWhitePos.character}]`);
                  results.push(vscode.TextEdit.insert(doubleWhitePos, charactersToInsert));
                }
              }
            }
            if (nbrSpacesToInsert > 0) {
              // insert spaces to left of cursor
              const charactersToInsert: string = " ".repeat(nbrSpacesToInsert);
              results.push(vscode.TextEdit.insert(cursorPos, charactersToInsert));
              this._logMessage(`    line#${currLine} pushed INSERT ${charactersToInsert.length} spaces at [${cursorPos.line}:${cursorPos.character}]`);
              //cursorPos = cursorPos.with(currLine, cursorPos.character + nbrSpacesToInsert);
              //this._logMessage(` - line#${currLine} afterINSERT cursor-[${cursorPos.line}:${cursorPos.character}]`);
              // if we are in align mode, let's count this change
              if (getMode(editor) == eInsertMode.ALIGN) {
                // see if we have double-white-space to manipulate...
                let doubleWhitePos: vscode.Position = this.locateDoubleWhiteLeftEdge(currLineText, textLeftEdgePos);
                if (doubleWhitePos.line != 0 && doubleWhitePos.character != 0) {
                  // yes we do!
                  // delete length of spaces we inserted but from this doubleWhite location
                  const doubleWhiteLength: number = this.countOfWhiteChars(currLineText, doubleWhitePos);
                  const deleteLength: number = doubleWhiteLength < nbrSpacesToInsert ? doubleWhiteLength : nbrSpacesToInsert;
                  const deleteStartPos: vscode.Position = doubleWhitePos;
                  const deleteEndPos: vscode.Position = deleteStartPos.with(deleteStartPos.line, deleteStartPos.character + deleteLength);
                  const deleteRange: vscode.Range = new vscode.Range(deleteStartPos, deleteEndPos);
                  this._logMessage(
                    `    line#${currLine} pushed AlignMode DELETE ${deleteRange.end.character - deleteRange.start.character} spaces at [${deleteRange.start.line}:${deleteRange.start.character}-${
                      deleteRange.end.character
                    }]`
                  );
                  results.push(vscode.TextEdit.delete(deleteRange));
                }
              }
            }
            // ------------ FAILED EXPERIMENT to relocate cursor after edits ---------------------
            // now place our cursor at desired location
            // HUH this aint working!!!
            //const endingSelection: vscode.Selection = new vscode.Selection(cursorPos.line, cursorPos.character, cursorPos.line, cursorPos.character);
            //finalSelections = [endingSelection];
            //this._logMessage(
            //  ` - line#${currLine} end PLACEMENT, s,e-[${endingSelection.start.line}:${endingSelection.start.character} - ${endingSelection.end.line}:${endingSelection.end.character}]`
            //  );
            // ------------------------------------------------------------------------------------
          } else {
            // have insert point, insert spaces to left of cursor
            cursorPos = cursorPos.with(cursorPos.line, 0);
            const nextTabstop: number = this.getNextTabStop(block, cursorPos.character);
            const charactersToInsert: string = " ".repeat(nextTabstop);
            this._logMessage(`    line#${currLine} pushed blank-line INSERT ${charactersToInsert.length} spaces before [${cursorPos.line}:${cursorPos.character}]`);
            results.push(vscode.TextEdit.insert(this.leftOfCursor(cursorPos), charactersToInsert));
            // NOTE: nothing to do for Align Mode in this empty-line case!
          }
        }

        return results;
      })
      .reduce((selections, selection) => selections.concat(selection), []);
    //editor.selections = finalSelections;
    return editResult;
  }

  /**
   * outdent one tab stop
   *
   * @param document A text document.
   * @return A list of text edit objects.
   */
  outdentTabStop(document: vscode.TextDocument, editor: vscode.TextEditor): vscode.ProviderResult<vscode.TextEdit[]> {
    const selections: readonly vscode.Selection[] = editor.selections;
    return selections
      .map((selection) => {
        let results: vscode.ProviderResult<vscode.TextEdit[]> = [];
        const block = this.getBlockName(document, selection);
        this._logMessage(
          `* outD enabled=[${this.enable}], selection(isSingle-[${selection.isSingleLine}] BLOK-[${block}] isEmpty-[${selection.isEmpty}] s,e-[${selection.start.line}:${selection.start.character} - ${selection.end.line}:${selection.end.character}] activ-[${selection.active.character}] anchor-[${selection.anchor.character}])`
        );
        // if tabbing is not enabled, just return after doing nothing
        if (this.enable == false) {
          return results;
        }
        //  if no selection, just cursor - skip whitespace to right - treat chars to left
        //  if selection is single line then cursor is at front of selection - skip whitespace to right - treat chars to left

        // SPECIAL: multiLine lineA and lineA+1 both at char pos 0 is really single line selection of lineA
        //   CURSOR POS is always .anchor! if SPECIAL case anchor is conveniently ZERO already!
        // COLUMN MODE is really multiple single-line selections!
        let { firstLine, lastLine, lineCount } = this.lineNumbersFromSelection(document, selection);
        const bWholeLines: boolean = firstLine != lastLine;

        // this will be used to find our new tab column in multi-line case
        this._logMessage(` - (DBG) ${lineCount} lines: fm,to=[${firstLine}, ${lastLine}], bWholeLines=(${bWholeLines})`);

        // set initial position to right edge of selection
        let initialCursorPos: vscode.Position = selection.end;
        let cursorPos: vscode.Position = initialCursorPos;
        // if we have multi-line selection reset cursor to first char of all lines
        if (bWholeLines) {
          cursorPos = cursorPos.with(cursorPos.line, 0);
        }
        this._logMessage(` - finding: BLOK-[${block}], wholeLines=(${bWholeLines}), lines fm,to=[${firstLine}, ${lastLine}], cursor-[${cursorPos.line}:${cursorPos.character}]`);

        for (var currLine: number = firstLine; currLine <= lastLine; currLine++) {
          // now use selection to skip whitespace to right of cursor
          cursorPos = cursorPos.with(currLine, initialCursorPos.character);

          // grab the text of the current selected line
          let currLineText: string = document.lineAt(currLine).text;

          // if we found text to adjust...
          if (currLineText.length > 0 || bWholeLines) {
            // now adjust cursor: if at white, skip to next rightmost non-white, if at non-white, skip to left edge of non-white
            //  or put another way skip to left most char of text (if in text find left edge, if not in text find first text to right)
            if (selection.isEmpty) {
              // have insert point
              // if we are pointing to white space, move to left edge of text (to right of position)
              cursorPos = this.locateLeftTextEdge(currLineText, cursorPos);
            } else if (selection.isSingleLine) {
              // have true single line selection
              // move to left edge of text (to left -OR- right of position)
              const selectionLeftEdgePos: vscode.Position = cursorPos.with(cursorPos.line, selection.start.character);
              cursorPos = this.locateLeftTextEdge(currLineText, selectionLeftEdgePos);
            } else {
              // have FAKE single line selection
              // -OR- have single line of multiple line selection
              cursorPos = this.locateLeftTextEdge(currLineText, cursorPos);
            }

            this._logMessage(` - line#${currLine} ltEdge-[${cursorPos.line}:${cursorPos.character}], text-[${currLineText}]`);

            // we'd like to outdent to prev tab-stop but let's only go as far a to leave 1 space before prior text
            let nextTabStopToLeft: number = this.getPreviousTabStop(block, cursorPos.character);
            let whiteSpaceToLeftCt: number = this.countLeftWhiteSpace(currLineText, cursorPos.character);
            let nbrCharsToDelete: number = cursorPos.character - nextTabStopToLeft;
            this._logMessage(` - line#${currLine} tabStop=(${nextTabStopToLeft}), spacesToLeft=(${whiteSpaceToLeftCt}), nbrCharsToDelete=(${nbrCharsToDelete})`);
            if (nbrCharsToDelete > whiteSpaceToLeftCt) {
              nbrCharsToDelete = whiteSpaceToLeftCt;
            }
            const deleteStart: vscode.Position = cursorPos.with(cursorPos.line, cursorPos.character - nbrCharsToDelete);
            const deleteEnd: vscode.Position = deleteStart.with(deleteStart.line, deleteStart.character + nbrCharsToDelete);
            const range = selection.with({ start: deleteStart, end: deleteEnd });
            this._logMessage(`    line#${currLine} pushed DELETE spaces [${range.start.line}:${range.start.character} - ${range.end.line}:${range.end.character}], tabStop: ${nextTabStopToLeft})`);
            results.push(vscode.TextEdit.delete(range));
            // if we are in align mode, let's count this change
            const currMode: eInsertMode = getMode(editor);
            const currModeName: string = modeName(currMode);
            this._logMessage(`    Editor Mode = [${currModeName}]`);

            if (currMode == eInsertMode.ALIGN) {
              // see if we have double-white-space to manipulate...
              const doubleWhitePos: vscode.Position = this.locateDoubleWhiteLeftEdge(currLineText, deleteEnd);
              if (doubleWhitePos.line != 0 && doubleWhitePos.character != 0) {
                // yes we do!
                // insert length of spaces we removed but at this doubleWhite location
                const charactersToInsert: string = " ".repeat(range.end.character - range.start.character);
                this._logMessage(`    line#${currLine} pushed AlignMode INSERT ${charactersToInsert.length} spaces before [${doubleWhitePos.line}:${doubleWhitePos.character}]`);
                results.push(vscode.TextEdit.insert(doubleWhitePos, charactersToInsert));
              }
            }
          } else {
            // Empty selection, nothing to do here!
          }
        }
        return results;
      })
      .reduce((selections, selection) => selections.concat(selection), []);
  }

  readonly alignWordExpr = /([^ ]+ ?)*[^ ]+/;

  /**
   * align before type
   *
   * @param editor The current editor window.
   * @return Nothing.
   */
  alignBeforeType(editor: vscode.TextEditor, text: string, undoStop: boolean) {
    // skip overtype behavior when enter is pressed
    if (text === "\r" || text === "\n" || text === "\r\n") {
      vscode.commands.executeCommand("default:type", { text: text });
      return;
    }
    if (getMode(editor) != eInsertMode.ALIGN) {
      this._logMessage(`* alnBT ABORT, not in Align mode`);
      return; // bail if not in Align Mode!
    }
    if (text.indexOf(" ") !== -1) undoStop = true;

    editor
      .edit(
        (edit) => {
          editor.selections = editor.selections.map((selection) => {
            this._logMessage(
              `* alnBT enabled=[${this.enable}], text=[${text}], selection(isSingle-[${selection.isSingleLine}] isEmpty-[${selection.isEmpty}] s,e-[${selection.start.line}:${selection.start.character} - ${selection.end.line}:${selection.end.character}] activ-[${selection.active.character}] anchor-[${selection.anchor.character}])`
            );
            const cursorPosition = selection.start;
            const lineEndPosition = editor.document.lineAt(cursorPosition).range.end;
            let typeSel = selection;

            // handle alignment
            if (typeSel.isSingleLine) {
              let typeSize = editor.document.offsetAt(typeSel.end) - editor.document.offsetAt(typeSel.start);
              if (typeSize > 1) undoStop = true;
              if (typeSize != text.length) {
                let spaceDiff = text.length - typeSize;
                let currWord = editor.document.getWordRangeAtPosition(typeSel.end, this.alignWordExpr);
                if (!currWord) currWord = editor.document.getWordRangeAtPosition(typeSel.end.translate(0, +1), this.alignWordExpr);
                let spacesAfter;
                if (currWord && !currWord.end.isEqual(lineEndPosition)) {
                  spacesAfter = editor.document.getWordRangeAtPosition(currWord.end, / {2,}/);
                } else if (!typeSel.end.isEqual(lineEndPosition)) {
                  if (editor.document.getText(new vscode.Range(typeSel.end, typeSel.end.translate(0, +2))) === "  ") {
                    spacesAfter = editor.document.getWordRangeAtPosition(typeSel.end, / {2,}/);
                  }
                }
                if (spacesAfter && typeSize < text.length) {
                  // remove spaces if possible
                  let spaceCount = editor.document.offsetAt(spacesAfter.end) - editor.document.offsetAt(spacesAfter.start);
                  edit.delete(new vscode.Range(spacesAfter.end.translate(0, -Math.min(spaceDiff, spaceCount - 1)), spacesAfter.end));
                } else if (spacesAfter && typeSize > text.length) {
                  // Add spaces
                  edit.insert(spacesAfter.end, " ".repeat(typeSize - text.length));
                }
              }
            } else {
              undoStop = true;
            }
            if (typeSel.isEmpty) {
              edit.insert(typeSel.end, text);
            } else {
              edit.replace(typeSel, text);
            }
            return new vscode.Selection(typeSel.end, typeSel.end);
          });
        },
        { undoStopAfter: undoStop, undoStopBefore: false }
      )
      .then(() => {});
  }

  /**
   * align delete (left or right)
   *
   * @param isRight T/F where T means is Delete-right
   * @return Nothing
   */
  alignDelete(editor: vscode.TextEditor, isRight: boolean) {
    if (getMode(editor) != eInsertMode.ALIGN) {
      this._logMessage(`* alnDEL ABORT, not in Align mode`);
      return; // bail if not in Align Mode!
    }
    editor.edit((edit) => {
      editor.selections = editor.selections.map((selection) => {
        this._logMessage(
          `* alnDEL enabled=[${this.enable}], isRight=[${isRight}], selection(isSingle-[${selection.isSingleLine}] isEmpty-[${selection.isEmpty}] s,e-[${selection.start.line}:${selection.start.character} - ${selection.end.line}:${selection.end.character}] activ-[${selection.active.character}] anchor-[${selection.anchor.character}])`
        );
        let range: vscode.Range = selection;
        if (selection.isEmpty) {
          if (selection.start.character == 0 && !isRight) {
            // Delete at beginning of line
            if (selection.start.line == 0) return selection;
            let linelen = editor.document.lineAt(selection.start.line - 1).range.end.character;
            range = new vscode.Range(new vscode.Position(selection.start.line - 1, linelen), selection.start);
          } else {
            range = new vscode.Range(selection.start, selection.start.translate(0, isRight ? +1 : -1));
          }
        }
        let wordRange = editor.document.getWordRangeAtPosition(range.end.translate(0, +1), this.alignWordExpr) || range;
        let checkRange = new vscode.Range(range.end, range.end.translate(0, +2));

        let rangeSize = editor.document.offsetAt(range.end) - editor.document.offsetAt(range.start); // WTF why isn't there an API for this??????

        let rangeEndtoEndOfLine = new vscode.Range(range.end, editor.document.lineAt(range.end).range.end);

        if (!range.isSingleLine) {
          edit.delete(range);
        } else if (rangeEndtoEndOfLine.isEmpty || editor.document.getText(rangeEndtoEndOfLine).match(/^ +$/)) {
          edit.delete(range.union(rangeEndtoEndOfLine));
        } else if (editor.document.getText(checkRange) === "  " || wordRange.isEmpty) {
          if (!editor.document.getText(range).match(/^ +$/)) {
            edit.replace(range, " ".repeat(rangeSize));
          }
        } else {
          edit.delete(range);
          if (!wordRange.end.isEqual(rangeEndtoEndOfLine.end)) edit.insert(wordRange.end, " ".repeat(rangeSize));
        }
        return new vscode.Selection(range.start, range.start);
      });
    });
  }
}