// https://typescript.hotexamples.com/examples/vscode/window/createTextEditorDecorationType/typescript-window-createtexteditordecorationtype-method-examples.html

import { nextTick } from 'process';
import * as vscode from 'vscode';
import { EndOfLine } from 'vscode';

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

    readonly config = vscode.workspace.getConfiguration();
    readonly blocks = this.config.get<Blocks>('spin2ElasticTabstops.blocks')!;
    readonly blocksConfig = this.config.inspect<Blocks>('spin2ElasticTabstops.blocks');

    readonly tabSize = this.config.get<number>('editor.tabSize');
    readonly useTabStops = this.config.get<number>('editor.useTabStops');

    readonly enable = this.config.get<boolean>('spin2ElasticTabstops.enable');
    readonly timeout = this.config.get<number>('spin2ElasticTabstops.timeout');
    readonly maxLineCount = this.config.get<number>('spin2ElasticTabstops.maxLineCount');
    readonly maxLineLength = this.config.get<number>('spin2ElasticTabstops.maxLineLength');

    readonly blockIdentifierREgEx1 = /^(?<block>(con|var|obj|pub|pri|dat))\s+/;
    readonly blockIdentifierREgEx2 = /^(?<block>(con|var|obj|pub|pri|dat))$/;

    private tabbingDebugLogEnabled: boolean = false; //true;    // WARNING (REMOVE BEFORE FLIGHT) disable before commit
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
                this.tabbinglog = vscode.window.createOutputChannel("Spin2 TAB DEBUG");
                this._logMessage("Spin2 TAB log started.");
            }
            else {
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
     * get the previous tab stop
     * @param blockName
     * @param character
     * @returns
     */
    getPreviousTabStop(blockName: string, character: number): number {
        if (!blockName) {
            blockName = 'con';
        }
        const block = this.blocks[blockName.toLowerCase()];

        const stops = block.tabStops ?? [this.tabSize];
        const tabStops = stops?.sort((a, b) => { return a - b; });

        let index: number;
        while ((index = tabStops?.findIndex((element) => element > character)) === -1) {
            const lastTabStop = tabStops[tabStops.length - 1];
            const lastTabStop2 = tabStops[tabStops.length - 2];
            const lengthTabStop = lastTabStop - lastTabStop2;
            tabStops.push(lastTabStop + lengthTabStop);
        }
        this._logMessage(`+ (DBG) tabStops-[${tabStops}]`);
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
            blockName = 'con';
        }
        const block = this.blocks[blockName.toLowerCase()];

        const stops = block.tabStops ?? [this.tabSize];
        const tabStops = stops?.sort((a, b) => { return a - b; });

        let index: number;
        while ((index = tabStops?.findIndex((element) => element > character)) === -1) {
            const lastTabStop = tabStops[tabStops.length - 1];
            const lastTabStop2 = tabStops[tabStops.length - 2];
            const lengthTabStop = lastTabStop - lastTabStop2;
            tabStops.push(lastTabStop + lengthTabStop);
        }
        this._logMessage(`+ (DBG) tabStops-[${tabStops}]`);
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
            blockName = 'con';
        }
        const block = this.blocks[blockName.toLowerCase()];

        const stops = block.tabStops ?? [this.tabSize];
        const tabStops = stops?.sort((a, b) => { return a - b; });

        let index: number;
        while ((index = tabStops?.findIndex((element) => element > character)) === -1) {
            const lastTabStop = tabStops[tabStops.length - 1];
            const lastTabStop2 = tabStops[tabStops.length - 2];
            const lengthTabStop = lastTabStop - lastTabStop2;
            tabStops.push(lastTabStop + lengthTabStop);
        }
        this._logMessage(`+ (DBG) tabStops-[${tabStops}]`);

        const nextRtTabStop = tabStops[index]
        this._logMessage(`+ (DBG) getNextTabStop(${blockName}) startFm-(${character}) -> TabStop-(${nextRtTabStop})`);
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
        let blockName : string = ''
        for (let lineIndex = selection.anchor.line; lineIndex >= 0; lineIndex--) {
            const line = document.lineAt(lineIndex);
            if (line.text.length < 3) {
                continue;
            }
            let match = line.text.toLowerCase().match(this.blockIdentifierREgEx1);
            if (!match) {
                match = line.text.toLowerCase().match(this.blockIdentifierREgEx2);
            }
            //const match = line.text.match(this.blockIdentifier);
            //this._logMessage(`getBlockName() check-[${line.text}]`);
            if (match) {
                blockName = match.groups?.block ?? '';
                if (blockName.length > 0) {
                    break;
                }
            }
        }
        blockName = blockName.toUpperCase()
        //this._logMessage(`getBlockName() s,e-[${selection.start.line}:${selection.start.character} - ${selection.end.line}:${selection.end.character}] anchor-[${selection.anchor.character}]  BLOK-[${blockName}]`);
        return blockName;
    }

    /**
     * get the name of the current block/section
     *
     * @param document
     * @param selection
     * @returns
     */
    countWhiteSpace(textString: string, offset: number): number {
        let nbrWhiteSpaceChars: number = 0;
        if (offset < 0) {
            offset = 0
        }
        for (var idx: number = offset; idx <= textString.length - 1; idx++) {
            if (this.isWhite(textString, idx)) {
                break;
            }
            nbrWhiteSpaceChars++;
        }
        return nbrWhiteSpaceChars;
    };

    countLeftWhiteSpace(textString: string, offset: number): number {
        let nbrWhiteSpaceChars: number = 0;
        if (offset < 0) {
            offset = 0
        }
        if (offset > 1) {
            for (var idx: number = offset - 1; idx >= 0; idx--) {
                if (!this.isWhite(textString, idx)) {
                    if (nbrWhiteSpaceChars > 0) {
                        nbrWhiteSpaceChars--;
                    }
                    break;
                }
                nbrWhiteSpaceChars++;
            }
        }
        return nbrWhiteSpaceChars;
    };

    isWhite(text: string, index: number): boolean {
        let isWhiteStatus: boolean = false;
        if (text.charAt(index) == ' ' || text.charAt(index) == '\t') {
            isWhiteStatus = true;
        }
        return isWhiteStatus;
    }

    locateLeftTextEdge(selectedText : string, cursorPos : vscode.Position): vscode.Position {
        // now adjust cursor: if at white, skip to next rightmost non-white, if at non-white, skip to left edge of non-white
        //  or put another way skip to left most char of text (if in text find left edge, if not in text find first text to right)
        //this._logMessage(`-- lle txt-[${selectedText}] cursor-[${cursorPos.line}:${cursorPos.character}])`);
        let leftMostNonWhitePos: vscode.Position = cursorPos;
        if (this.isWhite(selectedText, cursorPos.character)) {
            // at whitespace, look right to next non-whitespace...
            let bFoundNonWhite = false;
            for (var idx: number = cursorPos.character + 1; idx < selectedText.length - 1; idx++) {
                if (this.isWhite(selectedText, idx) == false) {
                    leftMostNonWhitePos = cursorPos.with(cursorPos.line, idx);
                    bFoundNonWhite = true;
                    break;
                }
            }
            // if we didnt find any NON-white in this search, just return location of char after selection
            if (!bFoundNonWhite) {
                leftMostNonWhitePos = cursorPos.with(cursorPos.line, cursorPos.character + selectedText.length);
            }
        }  else {
            // at non-whitespace, look left to next whitespace then back one...
            let bFoundWhite = false;
            for (var idx: number = cursorPos.character - 1; idx >= 0; idx--) {
                if (this.isWhite(selectedText, idx)) {
                    leftMostNonWhitePos = cursorPos.with(cursorPos.line, idx + 1);
                    bFoundWhite = true;
                    break;
               }
            }
            // if we didnt find any NON-white in this search, just return location start of line
            if (!bFoundWhite) {
                leftMostNonWhitePos = cursorPos.with(cursorPos.line, 0);
            }
        }
        //this._logMessage(`---- ltEdge-[${leftMostNonWhitePos.line}:${leftMostNonWhitePos.character}])`);
        return leftMostNonWhitePos;
    };

    lineNumbersFromSelection(document: vscode.TextDocument, selection: vscode.Selection): { firstLine: number, lastLine: number, lineCount: number } {
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
                        lastLine--
                        lineCount--
                    }
                }
            }
            if (firstLine > lastLine && lineCount == 0) {
                // have odd selection case, let's override it!
                // (selection contained just a newline!)
                firstLine--
                lastLine = firstLine
                lineCount = 1
            }
        }

        return { firstLine, lastLine, lineCount }
    }

    calculateLeftEdge(document: vscode.TextDocument, firstLine: number, lastLine: number): number {
        // return column-number of left-most character in set of lines
        let leftMostNonWhiteColumn: number = 999999;
        for (var currLine: number = firstLine; currLine <= lastLine; currLine++) {
            let selectedText: string = document.lineAt(currLine).text;
            let cursorPos: vscode.Position = new vscode.Position(currLine, 0)
            let nonWhitePos: vscode.Position = this.locateLeftTextEdge(selectedText, cursorPos)
            if (nonWhitePos.character < leftMostNonWhiteColumn) {
                leftMostNonWhiteColumn = nonWhitePos.character
            }
        }
        return leftMostNonWhiteColumn;
    };

    /**
     * insert comment showing tab stops
     *
     * @param document A text document.
     * @return A list of text edit objects.
     */
    insertTabStopsComment(document: vscode.TextDocument, selections: readonly vscode.Selection[]): vscode.ProviderResult<vscode.TextEdit[]> {
        return selections.map(selection => {
            let results: vscode.ProviderResult<vscode.TextEdit[]> = [];
            const block = this.getBlockName(document, selection);
            this._logMessage(`* iCm enabled=[${this.enable}], selection(isSingle-[${selection.isSingleLine}] BLOK-[${block}] isEmpty-[${selection.isEmpty}] s,e-[${selection.start.line}:${selection.start.character} - ${selection.end.line}:${selection.end.character}] activ-[${selection.active.character}] anchor-[${selection.anchor.character}])`);
            // if tabbing is not enabled, just return after doing nothing
            if (this.enable == false) {
                return results;
            }
            const { firstLine, lastLine, lineCount } = this.lineNumbersFromSelection(document, selection);
            const cursorPos: vscode.Position = new vscode.Position(firstLine, 0);
            let charactersToInsert: string = '\'';
            let priorTabstop: number = 0;
            let currTabstop: number = 0;
            let tabNumber: number = 1;
            do {
                currTabstop = this.getNextTabStop(block, currTabstop);
                let distance: number = (currTabstop - priorTabstop) - 1;
                //if (tabNumber == 1) {
                //    distance -= 1;
                //}
                const horizStr: string = '-'.repeat(distance);
                priorTabstop = currTabstop;
                charactersToInsert = `${charactersToInsert}${horizStr}+`
                this._logMessage(` --tab#${tabNumber}  (${currTabstop}) dist(${distance})`);
                tabNumber++;
            } while (currTabstop < 80 && tabNumber < 10);

            let endOfLineStr: string = '\n';
            if (document.eol == EndOfLine.CRLF) {
                endOfLineStr = '\r\n';
            }

            results.push(vscode.TextEdit.insert(cursorPos, `${charactersToInsert}${endOfLineStr}`))

            return results;
        }).reduce((selections, selection) => selections.concat(selection), []);
    };

    /**
     * indent one tab stop
     *
     * @param document A text document.
     * @return A list of text edit objects.
     */
     indentTabStop(document: vscode.TextDocument, selections: readonly vscode.Selection[]): vscode.ProviderResult<vscode.TextEdit[]> {
        return selections.map(selection => {
            let results: vscode.ProviderResult<vscode.TextEdit[]> = [];
            const block = this.getBlockName(document, selection);
            this._logMessage(`* inD enabled=[${this.enable}], selection(isSingle-[${selection.isSingleLine}] BLOK-[${block}] isEmpty-[${selection.isEmpty}] s,e-[${selection.start.line}:${selection.start.character} - ${selection.end.line}:${selection.end.character}] activ-[${selection.active.character}] anchor-[${selection.anchor.character}])`);
            // if tabbing is not enabled, just return after doing nothing
            if (this.enable == false) {
                return results;
            }

            //  if no selection, just cursor - skip whitespace to right - treat chars to right
            //  if selection is single line then cursor is at front of selection - skip whitespace to right - treat chars to right

            // SPECIAL: multiLine lineA and lineA+1 both at char pos 0 is really single line selection of lineA
            //   CURSOR POS is always .anchor! if SPECIAL case anchor is conveniently ZERO already!
            // COLUMN MODE is really multiple single-line selections!
            let { firstLine, lastLine, lineCount } = this.lineNumbersFromSelection(document, selection);
            // this will be used to find our tab column in multi-line case
            const mutiLineLeftEdgeColumn = this.calculateLeftEdge(document, firstLine, lastLine)

            this._logMessage(` - (DBG) ${lineCount} lines: fm,to=[${firstLine}, ${lastLine}] multiLineLtEdge=(${mutiLineLeftEdgeColumn})`);
            const bWholeLines: boolean = (firstLine != lastLine);

            // set initial position to right edge of selection
            let cursorPos: vscode.Position = selection.end;

            // if we have multi-line selection reset cursor to first char of all lines
            if (firstLine != lastLine) {
                cursorPos = cursorPos.with(cursorPos.line, 0);
            }
            this._logMessage(` - finding: BLOK-[${block}], wholeLines=(${bWholeLines}), lines fm,to=[${firstLine}, ${lastLine}], cursor-[${cursorPos.line}:${cursorPos.character}]`);

            for (var currLine: number = firstLine; currLine <= lastLine; currLine++) {
                // now use selection to skip whitespace to right of cursor
                cursorPos = cursorPos.with(currLine, cursorPos.character);

                // grab the text of the current selected line
                let selectedText: string = document.lineAt(currLine).text;

                // if we found text to adjust...
                if (selectedText.length > 0) {
                    // now adjust cursor: if at white, skip to next rightmost non-white, if at non-white, skip to left edge of non-white
                    //  or put another way skip to left most char of text (if in text find left edge, if not in text find first text to right)
                    const bReplaceLeftOfSelection = (!selection.isEmpty && selection.isSingleLine && this.isWhite(selectedText, selection.start.character));

                    let replaceCount: number = 0;
                    if (selection.isEmpty) {
                        // have insert point
                        //  (will never happen in multi-line case)
                        // if we are pointing to white space, move to left edge of text (to right of position)
                        if (this.isWhite(selectedText, cursorPos.character)) {
                            cursorPos = this.locateLeftTextEdge(selectedText, cursorPos)
                        }
                    } else if (selection.isSingleLine) {
                        // have true single line selection
                        //  (will never happen in multi-line case)
                        // move to left edge of text (to left -OR- right of position)
                        const selectionLeftPos : vscode.Position = cursorPos.with(cursorPos.line, selection.start.character)
                        cursorPos = this.locateLeftTextEdge(selectedText, selectionLeftPos)
                        // if our selection is white-space on left we are intending to replace this white-space
                    } else {
                        // have FAKE single line selection
                        // -OR- have single line of multiple line selection
                        cursorPos = this.locateLeftTextEdge(selectedText, cursorPos)
                    }

                    this._logMessage(` - line#${currLine} bRplcLeft=[${bReplaceLeftOfSelection}] ltEdge-[${cursorPos.line}:${cursorPos.character}], text-[${selectedText}]`);

                    if (bReplaceLeftOfSelection) {
                        // if text is beyond selection...
                        replaceCount = cursorPos.character - selection.start.character;
                        // if replacing, let's move cursor back to start of selection
                        cursorPos = cursorPos.with(cursorPos.line, selection.start.character)
                        this._logMessage(` - line#${currLine} replacing ${replaceCount} spaces, reset cursor-[${cursorPos.line}:${cursorPos.character}]`);
                    }

                    // lastly move non-white chars from cusor to next tabstop to right
                    let nextTabstop: number = this.getNextTabStop(block, cursorPos.character);
                    if (bReplaceLeftOfSelection) {
                        // select tab-stop that is to right of start of selection (not left of non-white)
                        nextTabstop = this.getNextTabStop(block, selection.start.character);
                    } else if(bWholeLines) {
                        // -OR- have single line of multiple line selection
                        nextTabstop = this.getNextTabStop(block, mutiLineLeftEdgeColumn);
                    }

                    // if we need ot move right...
                    let padLength = (nextTabstop - cursorPos.character) - replaceCount;
                    this._logMessage(` - line#${currLine} finding: BLOK-[${block}], cursor-[${cursorPos.line}:${cursorPos.character}], next TabStop is TAB-[${nextTabstop}], padLength=(${padLength})`);
                    if (padLength > 0) {
                        // insert spaces at cursor
                        const charactersToInsert: string = ' '.repeat(padLength);
                        this._logMessage(`    line#${currLine} pushed INSERT ${charactersToInsert.length} spaces before col ${cursorPos.character}`);
                        results.push(vscode.TextEdit.insert(cursorPos, charactersToInsert))
                    } else {
                        // remove spaces from left of cursor
                        let charsToRemove: number = Math.abs(padLength);
                        const deleteStart: vscode.Position = cursorPos.with(cursorPos.line, cursorPos.character)
                        const deleteEnd: vscode.Position = deleteStart.with(deleteStart.line, deleteStart.character + charsToRemove)
                        const range = selection.with({ start: deleteStart, end: deleteEnd })
                        this._logMessage(`    line#${currLine} pushed DELETE spaces at columns [${deleteStart.character}-${deleteEnd.character}]`);
                        results.push(vscode.TextEdit.delete(range))
                    }
                } else {
                    cursorPos = cursorPos.with(cursorPos.line, 0)
                    const nextTabstop: number = this.getNextTabStop(block, cursorPos.character);
                    const charactersToInsert: string = ' '.repeat(nextTabstop);
                    this._logMessage(`    line#${currLine} pushed blank-line INSERT ${charactersToInsert.length} spaces before col ${cursorPos.character}`);
                    results.push(vscode.TextEdit.insert(cursorPos, charactersToInsert))
                }
            }

            return results;
        }).reduce((selections, selection) => selections.concat(selection), []);
    };

    /**
     * outdent one tab stop
     *
     * @param document A text document.
     * @return A list of text edit objects.
     */
    outdentTabStop(document: vscode.TextDocument, selections: readonly vscode.Selection[]): vscode.ProviderResult<vscode.TextEdit[]> {
        return selections.map(selection => {
            let results: vscode.ProviderResult<vscode.TextEdit[]> = [];
            const block = this.getBlockName(document, selection);
            this._logMessage(`* outD enabled=[${this.enable}], selection(isSingle-[${selection.isSingleLine}] BLOK-[${block}] isEmpty-[${selection.isEmpty}] s,e-[${selection.start.line}:${selection.start.character} - ${selection.end.line}:${selection.end.character}] activ-[${selection.active.character}] anchor-[${selection.anchor.character}])`);
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

            // this will be used to find our tab column in multi-line case
            // FIXME: this next might want to be rightmostcolumn of all left-edges of all lines, not left most
            const mutiLineLeftEdgeColumn = this.calculateLeftEdge(document, firstLine, lastLine)

            this._logMessage(` - (DBG) ${lineCount} lines: fm,to=[${firstLine}, ${lastLine}] multiLineLtEdge=(${mutiLineLeftEdgeColumn})`);
            const bWholeLines: boolean = (firstLine != lastLine);

            // set initial position to right edge of selection
            let cursorPos: vscode.Position = selection.end;

            // if we have multi-line selection reset cursor to first char of all lines
            if (firstLine != lastLine) {
                cursorPos = cursorPos.with(cursorPos.line, 0);
            }
            this._logMessage(` - finding: BLOK-[${block}], wholeLines=(${bWholeLines}), lines fm,to=[${firstLine}, ${lastLine}], cursor-[${cursorPos.line}:${cursorPos.character}]`);

            for (var currLine: number = firstLine; currLine <= lastLine; currLine++) {
                // now use selection to skip whitespace to right of cursor
                cursorPos = cursorPos.with(currLine, cursorPos.character);

                // grab the text of the current selected line
                let selectedText: string = document.lineAt(currLine).text;

                // if we found text to adjust...
                if (selectedText.length > 0) {
                    // now adjust cursor: if at white, skip to next rightmost non-white, if at non-white, skip to left edge of non-white
                    //  or put another way skip to left most char of text (if in text find left edge, if not in text find first text to right)
                    if (selection.isEmpty) {
                        // have insert point
                        // if we are pointing to white space, move to left edge of text (to right of position)
                        cursorPos = this.locateLeftTextEdge(selectedText, cursorPos)
                    } else if (selection.isSingleLine) {
                        // have true single line selection
                        // move to left edge of text (to left -OR- right of position)
                        const selectionLeftPos : vscode.Position = cursorPos.with(cursorPos.line, selection.start.character)
                        cursorPos = this.locateLeftTextEdge(selectedText, selectionLeftPos)
                    } else {
                        // have FAKE single line selection
                        // -OR- have single line of multiple line selection
                        cursorPos = this.locateLeftTextEdge(selectedText, cursorPos)
                    }

                    this._logMessage(` - line#${currLine} ltEdge-[${cursorPos.line}:${cursorPos.character}], text-[${selectedText}]`);

                    // we'd like to outdent to prev tab-stop but let's only go as far a to leave 1 space before prior text
                    let nextTabStopToLeft: number = this.getPreviousTabStop(block, cursorPos.character);
                    if (lineCount > 1) {
                        // in mulit-line case, we outdent to TAB before leftmost of entire group of lines
                        nextTabStopToLeft = this.getPreviousTabStop(block, mutiLineLeftEdgeColumn);
                    }
                    let whiteSpaceToLeftCt: number = this.countLeftWhiteSpace(selectedText, cursorPos.character)
                    let nbrCharsToDelete: number = cursorPos.character - nextTabStopToLeft
                    this._logMessage(` - line#${currLine} tabStop=(${nextTabStopToLeft}), spacesToLeft=(${whiteSpaceToLeftCt}), nbrCharsToDelete=(${nbrCharsToDelete})`);
                    if (nbrCharsToDelete > whiteSpaceToLeftCt) {
                        nbrCharsToDelete = whiteSpaceToLeftCt
                    }
                    const deleteStart: vscode.Position = cursorPos.with(cursorPos.line, cursorPos.character - nbrCharsToDelete)
                    const deleteEnd: vscode.Position = deleteStart.with(deleteStart.line, deleteStart.character + nbrCharsToDelete)
                    this._logMessage(` - line#${currLine} delete s,e-[${deleteStart.line}:${deleteStart.character} - ${deleteEnd.line}:${deleteEnd.character}]`);

                    const range = selection.with({ start: deleteStart, end: deleteEnd })
                    this._logMessage(`    line#${currLine} pushed DELETE spaces [${range.start.line}:${range.start.character} - ${range.end.line}:${range.end.character}], tabStop: ${nextTabStopToLeft})`);
                    results.push(vscode.TextEdit.delete(range))
                } else {
                    // Empty selection, nothing to do here!
                }
            }

            return results;
        }).reduce((selections, selection) => selections.concat(selection), []);
    };

};
