// https://typescript.hotexamples.com/examples/vscode/window/createTextEditorDecorationType/typescript-window-createtexteditordecorationtype-method-examples.html

import { nextTick } from 'process';
import * as vscode from 'vscode';

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

    private tabbingDebugLogEnabled: boolean = true;    // WARNING disable before commit
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
        return tabStops[index - 2] ?? 0;
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
        return tabStops[index - 1] ?? 0;
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
        return tabStops[index];
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
            for (var idx: number = cursorPos.character - 1; idx >= 0; idx--) {
                if (this.isWhite(selectedText, idx)) {
                    leftMostNonWhitePos = cursorPos.with(cursorPos.line, idx + 1);
                    break;
               }
            }
        }
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
            for (var currLineIdx: number = 0; currLineIdx < lines.length; currLineIdx++) {
                if (lines[currLineIdx].length == 0) {
                    lineCount--
                    if (currLineIdx == 0) {
                        firstLine++
                    }
                    if (currLineIdx == lines.length - 1) {
                        lastLine--
                    }
                }
            }
        }

        return { firstLine, lastLine, lineCount }
    }

    /**
     * indent tab stop
     *
     * @param document A text document.
     * @return A list of text edit objects.
     */
    indentTabStop(document: vscode.TextDocument, selections: readonly vscode.Selection[]): vscode.ProviderResult<vscode.TextEdit[]> {
        return selections.map(selection => {
            let results: vscode.ProviderResult<vscode.TextEdit[]> = [];
            const block = this.getBlockName(document, selection);
            this._logMessage(`inD enabled=[${this.enable}], selection(isSingle-[${selection.isSingleLine}] BLOK-[${block}] isEmpty-[${selection.isEmpty}] s,e-[${selection.start.line}:${selection.start.character} - ${selection.end.line}:${selection.end.character}] activ-[${selection.active.character}] anchor-[${selection.anchor.character}])`);
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

            this._logMessage(` - (DBG) ${lineCount} lines: fm,to=[${firstLine}, ${lastLine}]`);
            const bWholeLines: boolean = (firstLine != lastLine);


            // set initial position to right edge of selection
            let cursorPos: vscode.Position = selection.anchor;
            if (selection.active > selection.anchor) {
                cursorPos = selection.active
            }
            // if we have multi-line selection reset cursor to first char of all lines
            if (firstLine != lastLine) {
                cursorPos = cursorPos.with(cursorPos.line, 0);
            }

            this._logMessage(` - finding: BLOK-[${block}], wholeLines=(${bWholeLines}), lines fm,to=[${firstLine}, ${lastLine}], cursor-[${cursorPos.line}:${cursorPos.character}]`);
            for (var currLine: number = firstLine; currLine <= lastLine; currLine++) {
                // now use selection to skip whitespace to right of cursor
                cursorPos = cursorPos.with(currLine, cursorPos.character);

                let selectedText: string = ''
                if (selection.isEmpty) {
                    // have insert point
                    //  (will never happen in multi-line case)
                    selectedText = document.lineAt(currLine).text;
                } else if (selection.isSingleLine) {
                    // have true single line selection
                    //  (will never happen in multi-line case)
                    selectedText = document.getText(selection);
                }  else {
                    // have FAKE single line selection
                    // -OR- have single line of multi-line selection
                    selectedText = document.lineAt(currLine).text;
                }

                // if we found text to adjust...
                if (selectedText.length > 0) {
                    // now adjust cursor: if at white, skip to next rightmost non-white, if at non-white, skip to left edge of non-white
                    //  or put another way skip to left most char of text (if in text find left edge, if not in text find first text to right)
                    const bReplaceLeftOfSelection = (!selection.isEmpty && selection.isSingleLine && this.isWhite(selectedText, 0));

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
                        const selectionLeft : vscode.Position = cursorPos.with(cursorPos.line, selection.start.character)
                        cursorPos = this.locateLeftTextEdge(selectedText, selectionLeft)
                        // if our selection is white-space on left we are intending to replace this white-space
                        if (bReplaceLeftOfSelection) {
                            // if text is beyond selection...
                            if (cursorPos.character > selection.end.character) {
                                replaceCount = cursorPos.character - selection.start.character;
                            } else {
                                replaceCount = selection.end.character - selection.start.character;
                            }
                        }
                    } else {
                        // have FAKE single line selection
                        // -OR- have single line of multiple line selection
                        cursorPos = this.locateLeftTextEdge(selectedText, cursorPos)
                    }

                    this._logMessage(` - line#${currLine} bRplcLeft=[${bReplaceLeftOfSelection}] ltEdge-[${cursorPos.line}:${cursorPos.character}] text-[${selectedText}] rplcCt=(${replaceCount})`);

                    // lastly move non-white chars from cusor to next tabstop to right
                    let nextTabstop: number = this.getNextTabStop(block, cursorPos.character);
                    if (bReplaceLeftOfSelection) {
                        // select tab-stop that is to right of start of selection (not left of non-white)
                        nextTabstop = this.getNextTabStop(block, selection.start.character);
                    }
                    this._logMessage(` - line#${currLine} finding: BLOK-[${block}] next TabStop is TAB-[${nextTabstop}]`);

                    // if we need ot move right...
                    if (nextTabstop > cursorPos.character) {
                        // insert spaces at cursor
                        const charactersToInsert: string = ' '.repeat(Math.abs(nextTabstop - cursorPos.character));
                        results.push(vscode.TextEdit.insert(cursorPos, charactersToInsert))
                        this._logMessage(`  line#${currLine} pushed INSERT ${charactersToInsert.length} spaces before col ${cursorPos.character}`);
                    } else {
                        // remove spaces from left of cursor
                        let charsToRemove: number = cursorPos.character - nextTabstop;
                        const deleteStart: vscode.Position = cursorPos.with(cursorPos.line, cursorPos.character - charsToRemove)
                        const deleteEnd: vscode.Position = deleteStart.with(deleteStart.line, deleteStart.character + charsToRemove)
                        const range = selection.with({ start: deleteStart, end: deleteEnd })
                        results.push(vscode.TextEdit.delete(range))
                        this._logMessage(`  line#${currLine} pushed DELETE spaces at columns [${deleteStart.character}-${deleteEnd.character}]`);
                    }
                } else {
                    cursorPos = cursorPos.with(cursorPos.line, 0)
                    const nextTabstop: number = this.getNextTabStop(block, cursorPos.character);
                    const charactersToInsert: string = ' '.repeat(nextTabstop);
                    results.push(vscode.TextEdit.insert(cursorPos, charactersToInsert))
                    this._logMessage(`  line#${currLine} pushed blank-line INSERT ${charactersToInsert.length} spaces before col ${cursorPos.character}`);
                }
            }

            return results;
        }).reduce((selections, selection) => selections.concat(selection), []);
    };

    /**
     * outdent tab stop
     *
     * @param document A text document.
     * @return A list of text edit objects.
     */
    outdentTabStop(document: vscode.TextDocument, selections: readonly vscode.Selection[]): vscode.ProviderResult<vscode.TextEdit[]> {
        return selections.map(selection => {
            let results: vscode.ProviderResult<vscode.TextEdit[]> = [];
            const block = this.getBlockName(document, selection);
            this._logMessage(`outD enabled=[${this.enable}], selection(isSingle-[${selection.isSingleLine}] BLOK-[${block}] isEmpty-[${selection.isEmpty}] s,e-[${selection.start.line}:${selection.start.character} - ${selection.end.line}:${selection.end.character}] activ-[${selection.active.character}] anchor-[${selection.anchor.character}])`);
            // if tabbing is not enabled, just return after doing nothing
            if (this.enable == false) {
                return results;
            }
            //  if no selection, just cursor - skip whitespace to right - treat chars to left
            //  if selection is single line then cursor is at front of selection - skip whitespace to right - treat chars to left

            // SPECIAL: multiLine lineA and lineA+1 both at char pos 0 is really single line selection of lineA
            //   CURSOR POS is always .anchor! if SPECIAL case anchor is conveniently ZERO already!
            // COLUMN MODE is really multiple single-line selections!

            // set initial position to right edge of selection
            let cursorPos: vscode.Position = selection.anchor;
            if (selection.active > selection.anchor) {
                cursorPos = selection.active
            }
            // now use selection to skip whitespace to right of cursor
            let selectedText: string = ''
            if (selection.isEmpty) {
                selectedText = document.lineAt(cursorPos.line).text;
            } else if (selection.isSingleLine) {
                // have true partial single line selection
                // for DELETE (UnTab) get whole line
                selectedText = document.lineAt(selection.start.line).text;
            } else if (selection.start.line + 1 == selection.end.line && selection.start.character == 0 && selection.end.character == 0) {
                // have FAKE single line selection
                selectedText = document.lineAt(selection.start.line).text;
            }
            else {
                // have multiple line selection
                // WHAT TO DO HERE?!!
            }

            // if we found text to adjust...
            if (selectedText.length > 0) {
                // now adjust cursor: if at white, skip to next rightmost non-white, if at non-white, skip to left edge of non-white
                //  or put another way skip to left most char of text (if in text find left edge, if not in text find first text to right)
                const bReplaceLeftOfSelection = (!selection.isEmpty && selection.isSingleLine && this.isWhite(selectedText, 0));
                let replaceCount : number = 0;
                if (selection.isEmpty) {
                    // have insert point
                    // if we are pointing to white space, move to left edge of text (to right of position)
                    if (this.isWhite(selectedText, cursorPos.character)) {
                        cursorPos = this.locateLeftTextEdge(selectedText, cursorPos)
                    }
                } else if (selection.isSingleLine) {
                    // have true single line selection
                    // move to left edge of text (to left -OR- right of position)
                    cursorPos = this.locateLeftTextEdge(selectedText, cursorPos)
                    // if our selection is white-space on left we are intending to replace this white-space
                    if (bReplaceLeftOfSelection) {
                        if (cursorPos.character > selection.anchor.character) {
                            replaceCount = selection.anchor.character - selection.active.character;
                        } else {
                            replaceCount = cursorPos.character - selection.active.character;
                        }
                    }
                } else if (selection.start.line + 1 == selection.end.line && selection.start.character == 0 && selection.end.character == 0) {
                    // have FAKE single line selection
                    cursorPos = this.locateLeftTextEdge(selectedText, cursorPos)
                }

                this._logMessage(`outD  bRplcLeft=[${bReplaceLeftOfSelection}] ltEdge-[${cursorPos.line}:${cursorPos.character}] text-[${selectedText}] rplcCt=(${replaceCount})`);

                // we'd like to outdent to prev tab-stop but let's only go as far a to leave 1 space before prior text
                const nextTabStopToLeft : number = this.getPreviousTabStop(block, cursorPos.character);
                let whiteSpaceToLeftCt : number = this.countLeftWhiteSpace(selectedText, cursorPos.character)
                let nbrCharsToDelete : number = cursorPos.character - nextTabStopToLeft
                this._logMessage(`outD tabStop=(${nextTabStopToLeft}), spacesToLeft=(${whiteSpaceToLeftCt}), nbrCharsToDelete=(${nbrCharsToDelete})`);
                if (nbrCharsToDelete > whiteSpaceToLeftCt) {
                    nbrCharsToDelete = whiteSpaceToLeftCt
                }
                const deleteStart : vscode.Position = cursorPos.with(cursorPos.line, cursorPos.character - nbrCharsToDelete)
                const deleteEnd : vscode.Position = deleteStart.with(deleteStart.line, deleteStart.character + nbrCharsToDelete)
                this._logMessage(`outD delete(s,e-[${deleteStart.line}:${deleteStart.character} - ${deleteEnd.line}:${deleteEnd.character}])`);

                const range = selection.with({ start: deleteStart, end: deleteEnd })
                this._logMessage(`delete([${range.start.line}:${range.start.character} - ${range.end.line}:${range.end.character}] tabStop: ${nextTabStopToLeft})`);
                return [
                    vscode.TextEdit.delete(range)
                ];
            }
            else {
                return []   // nothing to adjust in this case
            }
        }).reduce((selections, selection) => selections.concat(selection), []);
    };

};
