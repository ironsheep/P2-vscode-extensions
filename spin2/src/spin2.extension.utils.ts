"use strict";
// src/spin2.utils.ts
import * as vscode from "vscode";
import { Position } from "vscode";

export interface IPairs {
  start: number;
  end: number;
}

/** getGoConfig is declared as an exported const rather than a function, so it can be stubbbed in testing. */
export const getSpin2Config = (uri?: vscode.Uri) => {
  return getConfig("spin2", uri);
};

function getConfig(section: string, uri?: vscode.Uri | null) {
  if (!uri) {
    if (vscode.window.activeTextEditor) {
      uri = vscode.window.activeTextEditor.document.uri;
    } else {
      uri = null;
    }
  }
  return vscode.workspace.getConfiguration(section, uri);
}

export interface IDefinitionInfo {
  file?: string;
  line: number;
  column: number;
  doc?: string;
  declarationlines: string[];
  parameters?: string[];
  returns?: string[];
  name?: string;
  toolUsed: string;
}

export interface IDefinitionInput {
  document: vscode.TextDocument;
  position: vscode.Position;
  word: string;
  includeDocs: boolean;
}

export class ExtensionUtils {
  private outputChannel: vscode.OutputChannel | undefined = undefined;
  private bLogEnabled: boolean = false;

  public constructor(isLogging: boolean, logHandle: vscode.OutputChannel | undefined) {
    this.bLogEnabled = isLogging;
    this.outputChannel = logHandle;
    this._logMessage("* Global, Local, MethodScoped Token repo's ready");
  }

  //
  // PUBLIC Methods
  //
  public adjustWordPosition(document: vscode.TextDocument, position: vscode.Position, isInBlockComment: boolean): [boolean, string, vscode.Position] {
    let wordRange: vscode.Range | undefined = document.getWordRangeAtPosition(position);
    const lineText = document.lineAt(position.line).text;
    // do fixup for Spin2 pasm local labels
    const P2_LABEL_PREFIX: string = ".";
    if (wordRange?.start.character == 1 && lineText.charAt(0) == P2_LABEL_PREFIX) {
      const newStart: vscode.Position = new Position(wordRange?.start.line, 0);
      wordRange = new vscode.Range(newStart, wordRange.end);
    }
    const word = wordRange ? document.getText(wordRange) : "";

    this._logMessage(`+ Hvr: adjustWordPosition() ENTRY  wordRange=[${wordRange?.start.line}:${wordRange?.start.character}-${wordRange?.end.line}:${wordRange?.end.character}], word=[${word}]`);
    // TODO: fix this for spin comments vs. // comments

    const stringsFound: IPairs[] = this.getStringPairOffsets(lineText);
    const ticVarsFound: IPairs[] = this.getPairOffsetsOfTicVarWraps(lineText);
    //const stringsFound: IPairs[] = [];
    let isPositionInComment: boolean = this.isPositionInComment(document, position, stringsFound);
    if (!isPositionInComment) {
      isPositionInComment = isInBlockComment;
      this._logMessage(`+ Hvr: adjustWordPosition() (post-block): isPositionInComment=${isPositionInComment}`);
    }
    if (!wordRange || this.isPositionInString(document, position, stringsFound, ticVarsFound) || isPositionInComment || word.match(/^\d+.?\d+$/) || this.spinControlFlowKeywords.indexOf(word) > 0) {
      this._logMessage(`+ Hvr: adjustWordPosition() EXIT false`);
      return [false, null!, null!];
    }
    if (position.isEqual(wordRange.end) && position.isAfter(wordRange.start)) {
      position = position.translate(0, -1);
    }

    this._logMessage(`+ Hvr: adjustWordPosition() EXIT true`);
    return [true, word, position];
  }

  public isPositionInString(document: vscode.TextDocument, position: vscode.Position, stringsInLine: IPairs[], ticVarsInLine: IPairs[]): boolean {
    let inStringStatus: boolean = false;
    const lineText = document.lineAt(position.line).text;
    let inTicVar: boolean = false;
    if (ticVarsInLine.length > 0) {
      for (let ticVarIdx = 0; ticVarIdx < ticVarsInLine.length; ticVarIdx++) {
        const ticVarSpan = ticVarsInLine[ticVarIdx];
        if (position.character >= ticVarSpan.start && position.character <= ticVarSpan.end) {
          // char is within ticVar so not in string
          inTicVar = true;
          break;
        }
      }
    }
    if (!inTicVar && stringsInLine.length > 0) {
      for (let pairIdx = 0; pairIdx < stringsInLine.length; pairIdx++) {
        const stringSpan = stringsInLine[pairIdx];
        if (position.character >= stringSpan.start && position.character <= stringSpan.end) {
          // char is within string so not in comment
          inStringStatus = true;
          break;
        }
      }
    }

    //this._logMessage(`+ Hvr: isPositionInString() = EXIT w/${inStringStatus}`);
    return inStringStatus;
  }

  public isPositionInComment(document: vscode.TextDocument, position: vscode.Position, stringsInLine: IPairs[]): boolean {
    let inCommentStatus: boolean = false;
    const lineTextUntrim = document.lineAt(position.line).text;
    const lineText = lineTextUntrim.trim();
    let inString: boolean = false;
    // if entire line is comment
    if (lineText.startsWith("'") || lineText.startsWith("{")) {
      inCommentStatus = true;
    } else {
      // if text is within trailing comment
      let trailingCommentStartSearchPos: number = 0;
      if (stringsInLine.length > 0) {
        // searfch for comment only past all strings
        trailingCommentStartSearchPos = stringsInLine[stringsInLine.length - 1].end + 1;
      }
      let firstTickMatchLocn: number = lineText.indexOf("'", trailingCommentStartSearchPos);
      let firstBraceMatchLocn: number = lineText.indexOf("{", trailingCommentStartSearchPos);
      let firstMatchLocn = firstTickMatchLocn < firstBraceMatchLocn && firstTickMatchLocn != -1 ? firstTickMatchLocn : firstBraceMatchLocn;
      if (firstBraceMatchLocn == -1) {
        firstMatchLocn = firstTickMatchLocn;
      }
      this._logMessage(`+ Hvr: isPositionInComment() pos=[${position.character}], tik=[${firstTickMatchLocn}], brc=[${firstBraceMatchLocn}], mtch=[${firstMatchLocn}]`);
      if (firstMatchLocn != -1 && position.character > firstMatchLocn) {
        inCommentStatus = true;
      }
    }
    this._logMessage(`+ Hvr: isPositionInComment() = EXIT w/${inCommentStatus}`);
    return inCommentStatus;
  }

  public getStringPairOffsets(line: string): IPairs[] {
    let findings: IPairs[] = this._getPairOffsetsOfChar(line, '"');
    this._showPairsForChar(findings, '"');
    let sglQuoStrPairs: IPairs[] = this._getPairOffsetsOfChar(line, "'");
    if (sglQuoStrPairs.length > 0) {
      // this._logMessage(`+ Hvr: _getStringPairOffsets([${line}](${line.length}))`);
      let dblQuotedStrings: IPairs[] = findings;
      if (sglQuoStrPairs.length > 0) {
        for (let sglIdx = 0; sglIdx < sglQuoStrPairs.length; sglIdx++) {
          const currFinding: IPairs = sglQuoStrPairs[sglIdx];
          let bFoundIndblStr: boolean = false;
          if (dblQuotedStrings.length > 0) {
            for (let dblIdx = 0; dblIdx < dblQuotedStrings.length; dblIdx++) {
              const dblQuoteStrPair: IPairs = dblQuotedStrings[dblIdx];
              if (currFinding.start >= dblQuoteStrPair.start && currFinding.start <= dblQuoteStrPair.end) {
                bFoundIndblStr = true;
                break;
              }
              if (currFinding.end >= dblQuoteStrPair.start && currFinding.end <= dblQuoteStrPair.end) {
                bFoundIndblStr = true;
                break;
              }
            }
          }
          if (!bFoundIndblStr) {
            findings.push(currFinding);
            this._showPairsForChar([currFinding], "'");
          }
        }
      }
    }

    //this._logMessage(`+ Hvr: _getStringPairOffsets() - found ${findings.length} pair(s)`);
    return findings;
  }

  public getPairOffsetsOfTicVarWraps(line: string): IPairs[] {
    let findings: IPairs[] = [];
    // hunting for "`(variable)" sets
    // return location of each one found
    let endIdx: number = line.length - 3;
    let currTicWrapOffset: number = 0;
    do {
      currTicWrapOffset = line.indexOf("`(", currTicWrapOffset);
      if (currTicWrapOffset == -1) {
        break; // not wrap, stop hunting
      }
      let currTicWrapEndOffset: number = line.indexOf(")", currTicWrapOffset);
      if (currTicWrapEndOffset == -1) {
        break; // not wrap, stop hunting
      }
      const newPair = { start: currTicWrapOffset, end: currTicWrapEndOffset };
      findings.push(newPair);
      currTicWrapOffset = currTicWrapEndOffset + 1;
    } while (currTicWrapOffset < endIdx);
    this._showPairsForChar(findings, "`()");
    return findings;
  }

  //
  // PRIVATE Methods
  //
  private _showPairsForChar(pairsFound: IPairs[], srchChar: string) {
    if (pairsFound.length > 0) {
      for (let pairIdx = 0; pairIdx < pairsFound.length; pairIdx++) {
        const pair: IPairs = pairsFound[pairIdx];
        this._logMessage(`+     --- pair #${pairIdx + 1} string of (${srchChar}) at([${pair.start}, ${pair.end}) `);
      }
    }
  }

  private _getPairOffsetsOfChar(line: string, searchChar: string): IPairs[] {
    let findings: IPairs[] = [];
    let startPos: number = -1;
    let endPos: number = -1;
    let seachOffset: number = 0;
    let endIdx: number = line.length - 2;
    //this._logMessage(`+ --- _getPairOffsetsOfChar([${line}](${line.length}), [${searchChar}])`);
    if (line.length > 0) {
      while (seachOffset < endIdx) {
        startPos = line.indexOf(searchChar, seachOffset);
        if (startPos == -1 || startPos >= endIdx) {
          break;
        }
        endPos = line.indexOf(searchChar, startPos + 1);
        if (endPos == -1) {
          break;
        }
        const newPair = { start: startPos, end: endPos };
        findings.push(newPair);
        if (endPos >= endIdx) {
          break;
        }
        seachOffset = endPos + 1;
        if (line.substring(seachOffset).length < 1) {
          break;
        }
      }
    }
    //this._logMessage(`+ Hvr: _getPairOffsetsOfChar(, ) - found ${findings.length} pair(s)`);
    return findings;
  }

  /*
  // place this somewhere useful to get this to run....
    if (this.firstTime) {
      this._testStringMatching();
      this.firstTime = false;
    }
    */
  private _testStringMatching() {
    this._logMessage(`+ _testStringMatching() ENTRY`);
    const test1: string = 'quoted strings "one..." no 2nd';
    const test2: string = 'quoted strings "one..." and 2nd is "two" not at end';
    const test3: string = "quoted strings 'one...' and 2nd is \"two\" and 3rd is 'three'";
    const test4: string = "'one...' and 2nd is 'two' and 3rd is \"two\"";

    this._testAndReportFindings(test1);
    this._testAndReportFindings(test2);
    this._testAndReportFindings(test3);
    this._testAndReportFindings(test4);
    this._logMessage(`+ _testStringMatching() EXIT`);
  }

  private _testAndReportFindings(text: string) {
    let pairs: IPairs[] = this.getStringPairOffsets(text);
    this._logMessage(`+     _testAndReportFindings([${text}](${text.length})) found ${pairs.length} pair(s)`);
    if (pairs.length > 0) {
      for (let pairIdx = 0; pairIdx < pairs.length; pairIdx++) {
        const pair: IPairs = pairs[pairIdx];
        this._logMessage(`+     --- pair #${pairIdx + 1} at([${pair.start}, ${pair.end}) `);
      }
    }
  }

  private _logMessage(message: string): void {
    if (this.bLogEnabled && this.outputChannel != undefined) {
      // Write to output window.
      this.outputChannel.appendLine(message);
    }
  }

  private spinControlFlowKeywords: string[] = ["if", "ifnot", "elseif", "elseifnot", "else", "case", "case_fast", "repeat", "from", "to", "step", "while", "until", "next", "quit"];
}
