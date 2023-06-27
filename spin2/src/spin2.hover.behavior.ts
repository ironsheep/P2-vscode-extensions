"use strict";

import * as vscode from "vscode";
import * as path from "path";
import { CancellationToken, Hover, HoverProvider, Position, TextDocument, WorkspaceConfiguration } from "vscode";
import { DocumentFindings } from "./spin.semantic.findings";
import { ParseUtils, eBuiltInType } from "./spin2.utils";
import { IncomingMessage } from "http";
import { isDeepStrictEqual } from "util";

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

export interface definitionInfo {
  file?: string;
  line: number;
  column: number;
  doc?: string;
  declarationlines: string[];
  name?: string;
  toolUsed: string;
}

interface definitionInput {
  document: vscode.TextDocument;
  position: vscode.Position;
  word: string;
  includeDocs: boolean;
}

interface IPairs {
  start: number;
  end: number;
}

//import { Spin2HoverProvider } from './src/spin2.hover.behavior.ts';
export class Spin2HoverProvider implements HoverProvider {
  private spinConfig: WorkspaceConfiguration | undefined;
  hoverLogEnabled: boolean = false; // WARNING (REMOVE BEFORE FLIGHT)- change to 'false' - disable before commit
  private hoverOutputChannel: vscode.OutputChannel | undefined = undefined;
  private symbolsFound: DocumentFindings;
  private parseUtils = new ParseUtils();

  private firstTime: boolean = true;

  constructor(symbolRepository: DocumentFindings, spinConfig?: WorkspaceConfiguration) {
    this.spinConfig = spinConfig;
    this.symbolsFound = symbolRepository;
    if (this.hoverLogEnabled) {
      if (this.hoverOutputChannel === undefined) {
        //Create output channel
        this.hoverOutputChannel = vscode.window.createOutputChannel("Spin2 Hover DEBUG");
        this._logMessage("Spin2 log started.");
      } else {
        this._logMessage("\n\n------------------   NEW FILE ----------------\n\n");
      }
    }
  }

  /**
   * Write message to debug log (when debug enabled)
   * @param message - text to be written
   * @returns nothing
   */
  private _logMessage(message: string): void {
    if (this.hoverLogEnabled && this.hoverOutputChannel != undefined) {
      //Write to output window.
      this.hoverOutputChannel.appendLine(message);
    }
  }

  // fm GO project
  //  export function isPositionInString()
  //  export function adjustWordPosition()
  //  public provideTypeDefinition()
  //  export function definitionLocation()
  //  definitionLocation
  //  definitionInfo
  //  GoDefinitionInformation
  //  src/language/legacy/goDeclaration.ts

  /**
   *
   * @param document
   * @param position
   * @param token
   * @returns Hover | null
   */
  public provideHover(document: TextDocument, position: Position, token: CancellationToken): Thenable<Hover | null> {
    this._logMessage(`+ Hvr: provideHover() ENTRY`);
    if (!this.spinConfig) {
      this.spinConfig = getSpin2Config(document.uri);
    }
    let spinConfig = this.spinConfig;
    this._logMessage(`+ Hvr: provideHover() EXIT after providing def'location`);
    return this.definitionLocation(document, position, spinConfig, true, token).then(
      (definitionInfo) => {
        if (definitionInfo == null) {
          this._logMessage(`+ Hvr: definitionLocation() EXIT no info`);
          return null;
        }
        const lines = definitionInfo.declarationlines.filter((line) => line !== "").map((line) => line.replace(/\t/g, "    "));
        let text;
        text = lines.join("\n").replace(/\n+$/, "");
        const hoverTexts = new vscode.MarkdownString();
        hoverTexts.supportHtml = true; // yes, let's support some html
        hoverTexts.appendCodeblock(text, "spin2"); // should be spin2/spin but "code lanuguage not supported or defined" : bad ones are: json
        if (definitionInfo.doc != null) {
          hoverTexts.appendMarkdown(definitionInfo.doc);
        }
        const hover = new Hover(hoverTexts);
        this._logMessage(`+ Hvr: definitionLocation() EXIT with hover`);
        return hover;
      },
      () => {
        this._logMessage(`+ Hvr: definitionLocation() EXIT null`);
        return null;
      }
    );
  }

  private definitionLocation(
    document: vscode.TextDocument,
    position: vscode.Position,
    spinConfig: vscode.WorkspaceConfiguration | undefined,
    includeDocs: boolean,
    token: vscode.CancellationToken
  ): Promise<definitionInfo | null> {
    this._logMessage(`+ Hvr: definitionLocation() ENTRY`);
    const adjustedPos = this.adjustWordPosition(document, position);
    if (!adjustedPos[0]) {
      this._logMessage(`+ Hvr: definitionLocation() EXIT fail`);
      return Promise.resolve(null);
    }
    const word = adjustedPos[1];
    position = adjustedPos[2];
    let fileBasename = path.basename(document.fileName);
    this._logMessage(`+ Hvr: word=[${word}], adjPos=(${position.line},${position.character}), file=[${fileBasename}], line=[${document.lineAt(position.line).text}]`);

    if (!spinConfig) {
      spinConfig = getSpin2Config(document.uri);
    }
    const searchDetails: definitionInput = {
      document,
      position,
      word,
      includeDocs,
    };
    this._logMessage(`+ Hvr: definitionLocation() EXIT after getting symbol details`);
    return this.getSymbolDetails(searchDetails, token, false);
  }

  private getSymbolDetails(input: definitionInput, token: vscode.CancellationToken, useTags: boolean): Promise<definitionInfo | null> {
    if (token) {
    } // kill compiler warns for now...
    if (useTags) {
    } // kill compiler warns for now...  Probably remove these from interface
    return new Promise((resolve, reject) => {
      const defInfo: definitionInfo = {
        file: input.document.uri.fsPath,
        line: input.position.line,
        column: input.position.character,
        toolUsed: "????",
        declarationlines: [],
        doc: "{huh, I have no clue!}",
        name: input.document.fileName,
      };
      const sourceLineRaw = input.document.lineAt(input.position.line).text;
      const sourceLine = sourceLineRaw.trim();
      let cursorCharPosn = input.position.character;
      do {
        const char: string = sourceLineRaw.substring(cursorCharPosn, cursorCharPosn);
        if (char == " " || char == "\t") {
          break;
        }
        cursorCharPosn--;
      } while (cursorCharPosn > 0);
      const sourceTextToRight: string = sourceLineRaw.substring(cursorCharPosn).trim();
      const isSignatureLine: boolean = sourceLine.toLowerCase().startsWith("pub") || sourceLine.toLowerCase().startsWith("pri");
      const isDebugLine: boolean = sourceLine.toLowerCase().startsWith("debug(");

      let bFoundSomething: boolean = false; // we've no answer
      let builtInFindings = isDebugLine ? this.parseUtils.docTextForDebugBuiltIn(input.word) : this.parseUtils.docTextForBuiltIn(input.word);
      if (!builtInFindings.found) {
        this._logMessage(`+ Hvr: built-in=[${input.word}], NOT found!`);
      } else {
        this._logMessage(`+ Hvr: built-in=[${input.word}], Found!`);
      }
      let bFoundParseToken: boolean = this.symbolsFound.isKnownToken(input.word);
      if (!bFoundParseToken) {
        this._logMessage(`+ Hvr: token=[${input.word}], NOT found!`);
      } else {
        this._logMessage(`+ Hvr: token=[${input.word}], Found!`);
      }
      if (bFoundParseToken && !builtInFindings.found) {
        bFoundSomething = true;
        const tokenFindings = this.symbolsFound.getTokenWithDescription(input.word);
        if (tokenFindings.found) {
          this._logMessage(
            `+ Hvr: token=[${input.word}], interpRaw=(${tokenFindings.tokenRawInterp}), scope=[${tokenFindings.scope}], interp=[${tokenFindings.interpretation}], adjName=[${tokenFindings.adjustedName}]`
          );
          this._logMessage(`+ Hvr:    file=[${tokenFindings.relatedFilename}], declCmt=(${tokenFindings.declarationComment})]`);
        } else {
          this._logMessage(`+ Hvr: get token failed?!!`);
        }
        const nameString = tokenFindings.adjustedName;
        const scopeString = tokenFindings.scope;
        const typeString = tokenFindings.interpretation;

        let docRootCommentMD = `(*${scopeString}* ${typeString}) **${nameString}**`; // parsedFindings
        let typeInterpWName = `(${scopeString} ${typeString}) ${nameString}`; // better formatting of interp
        let typeInterp = `(${scopeString} ${typeString})`; // better formatting of interp
        if (scopeString.length == 0) {
          docRootCommentMD = `(${typeString}) **${nameString}**`;
          typeInterpWName = `(${typeString}) ${nameString}`; // better formatting of interp
          typeInterp = `(${typeString})`;
        }
        const declLine = input.document.lineAt(tokenFindings.declarationLine).text.trim(); // declaration line
        const nonCommentDecl: string = this.parseUtils.getNonCommentLineRemainder(0, declLine).trim();

        // -------------------------------
        // load CODE section of hover
        //
        if (typeString.includes("method")) {
          if (tokenFindings.scope.includes("object")) {
            defInfo.declarationlines = [`(${scopeString} ${typeString}) ${nameString}`];
          } else if (isSignatureLine) {
            // for method declaration use declaration line
            defInfo.declarationlines = [sourceLine];
          } else {
            // for method use, replace PUB/PRI with our interp
            const interpDecl = typeInterp + nonCommentDecl.substring(3);
            defInfo.declarationlines = [interpDecl];
          }
        } else if (tokenFindings.isGoodInterp) {
          // else spew good interp details
          defInfo.declarationlines = [typeInterpWName];
        } else {
          // else spew details until we figure out more...
          defInfo.declarationlines = [typeInterpWName, tokenFindings.tokenRawInterp];
        }

        // -------------------------------
        // load MarkDown section
        //
        let mdLines: string[] = [];
        if (typeString.includes("method")) {
          //if (!isSignatureLine) {
          mdLines.push(`Custom Method: User defined<br>`);
          //}
        }
        if (
          (tokenFindings.interpretation.includes("constant (32-bit)") && !tokenFindings.relatedObjectName) ||
          tokenFindings.interpretation.includes("shared variable") ||
          tokenFindings.interpretation.includes("instance variable") ||
          tokenFindings.interpretation.includes("inline-pasm variable") ||
          tokenFindings.interpretation.includes("enum value")
        ) {
          // if global constant push declaration line, first...
          mdLines.push("Decl: " + nonCommentDecl + "<br>");
        }
        if (tokenFindings.interpretation.includes("pasm label") && tokenFindings.relatedFilename) {
          mdLines.push("Refers to file: " + tokenFindings.relatedFilename + "<br>");
        }
        if (tokenFindings.interpretation.includes("named instance") && tokenFindings.relatedFilename) {
          mdLines.push("An instance of: " + tokenFindings.relatedFilename + "<br>");
        }
        if (tokenFindings.relatedObjectName) {
          mdLines.push("Found in object: " + tokenFindings.relatedObjectName + "<br>");
        }
        if (tokenFindings.declarationComment) {
          // have object comment
          mdLines.push(tokenFindings.declarationComment);
        } else {
          // no object comment
          if (typeString.includes("method")) {
            // if methods show that we should have doc-comment, except for external object reference were we can't get to doc comments, yet!...
            if (!tokenFindings.relatedObjectName) {
              mdLines.push(`*(no doc-comment provided)*`);
            }
          } else {
            // no doc-comment, not method, do nothing
          }
        }
        if (mdLines.length > 0) {
          defInfo.doc = mdLines.join(" ");
        } else {
          defInfo.doc = undefined;
        }
        /*
        if (tokenFindings.declarationComment) {
          // have declaration comment...
          if (typeString.includes("method")) {
            // is method with doc
            if (!isSignatureLine) {
              defInfo.doc = "".concat(`Custom Method: User defined<br>`, tokenFindings.declarationComment);
            } else {
              defInfo.doc = "".concat(tokenFindings.declarationComment);
            }
          } else {
            // is non-method with doc
            defInfo.doc = "".concat(tokenFindings.declarationComment);
          }
        } else {
          if (typeString.includes("method")) {
            // no declaration comment but is user-defined method
            const noCommentProvided = `*(no doc-comment provided)*`;
            if (!isSignatureLine) {
              defInfo.doc = "".concat(`Custom Method: User defined<br>`, noCommentProvided);
            } else {
              defInfo.doc = "".concat(noCommentProvided); // TODO: add doc comments here when we finally get them...
            }
          } else {
            // no doc-comment, not method
            defInfo.doc = `${docRootCommentMD}`;
          }
        }
        */
      } else {
        // -------------------------------
        // no token, let's check for built-in language parts
        if (builtInFindings.found) {
          let bISdebugStatement: boolean = false;
          if (input.word.toLowerCase() == "debug" && sourceLine.toLowerCase().startsWith("debug(")) {
            bISdebugStatement = true;
          }
          this._logMessage(`+ Hvr: bISdebugStatement=[${bISdebugStatement}], sourceLine=[${sourceLine}]`);
          let mdLines: string[] = [];
          bFoundSomething = true;
          defInfo.declarationlines = [];
          this._logMessage(`+ Hvr: word=[${input.word}], descr=(${builtInFindings.description}), type=[spin2 built-in], cat=[${builtInFindings.category}]`);

          let titleText: string | undefined = builtInFindings.category;
          let subTitleText: string | undefined = undefined;
          if (builtInFindings.type == eBuiltInType.BIT_VARIABLE) {
            defInfo.declarationlines = ["(variable) " + input.word];
            subTitleText = ` variable: *Spin2 built-in*`;
          } else if (builtInFindings.type == eBuiltInType.BIT_SYMBOL) {
            defInfo.declarationlines = ["(symbol) " + input.word];
            subTitleText = ` symbol: *Spin2 built-in*`;
          } else if (builtInFindings.type == eBuiltInType.BIT_CONSTANT) {
            defInfo.declarationlines = ["(constant 32-bit) " + input.word];
            subTitleText = ` constant: *Spin2 built-in*`;
          } else if (builtInFindings.type == eBuiltInType.BIT_METHOD) {
            defInfo.declarationlines = ["(method) " + builtInFindings.signature];
            subTitleText = `: *Spin2 built-in*`;
          } else if (builtInFindings.type == eBuiltInType.BIT_LANG_PART) {
            defInfo.declarationlines = ["(spin2 language) " + input.word];
            subTitleText = `: *Spin2 built-in*`;
          } else if (builtInFindings.type == eBuiltInType.BIT_DEBUG_SYMBOL) {
            this._logMessage(`+ Hvr: builtInFindings.type=[eBuiltInType.BIT_DEBUG_SYMBOL]`);
            if (bISdebugStatement) {
              defInfo.declarationlines = ["(DEBUG method) " + builtInFindings.signature];
              defInfo.doc = "".concat(`${builtInFindings.category}: *Spin2 debug built-in*<br>`, "- " + builtInFindings.description);
              // deselect lines into mdLines mech...
              mdLines = [];
              titleText = undefined;
              subTitleText = undefined;
            } else {
              defInfo.declarationlines = ["(DEBUG symbol) " + input.word];
              subTitleText = `: *Spin2 debug built-in*`;
            }
          } else if (builtInFindings.type == eBuiltInType.BIT_DEBUG_METHOD) {
            this._logMessage(`+ Hvr: builtInFindings.type=[eBuiltInType.BIT_DEBUG_METHOD]`);
            defInfo.declarationlines = ["(DEBUG method) " + builtInFindings.signature];
            subTitleText = `: *Spin2 debug built-in*`;
          } else if (builtInFindings.type == eBuiltInType.BIT_TYPE) {
            defInfo.declarationlines = ["(Spin2 Storage) " + input.word];
            subTitleText = `: *Spin2 built-in*`;
          }
          if (titleText && subTitleText) {
            if (builtInFindings.type == eBuiltInType.BIT_CONSTANT && bFoundParseToken) {
              const tokenFindings = this.symbolsFound.getTokenWithDescription(input.word);
              if (tokenFindings.found) {
                const declLine = input.document.lineAt(tokenFindings.declarationLine).text.trim(); // declaration line
                const nonCommentDecl: string = this.parseUtils.getNonCommentLineRemainder(0, declLine).trim();
                mdLines.push("Decl: " + nonCommentDecl + "<br>");
              }
            }
            mdLines.push(`${titleText}${subTitleText}<br>`);
            mdLines.push("- " + builtInFindings.description);
          }
          if (mdLines.length > 0) {
            defInfo.doc = mdLines.join(" ");
          } else {
            // if we have title or subTitle but no mdLines then just clear .doc
            if (titleText || subTitleText) {
              defInfo.doc = undefined;
            }
          }
        }
      }
      if (bFoundSomething) {
        return resolve(defInfo);
      } else {
        return reject(null); // we have no answer!
      }
    });
  }

  private adjustWordPosition(document: vscode.TextDocument, position: vscode.Position): [boolean, string, vscode.Position] {
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

    /*
    if (this.firstTime) {
      this._testStringMatching();
      this.firstTime = false;
    }
    */

    const stringsFound: IPairs[] = this._getStringPairOffsets(lineText);
    const ticVarsFound: IPairs[] = this._getPairOffsetsOfTicVarWraps(lineText);
    //const stringsFound: IPairs[] = [];
    if (
      !wordRange ||
      this.isPositionInString(document, position, stringsFound, ticVarsFound) ||
      this.isPositionInComment(document, position, stringsFound) ||
      word.match(/^\d+.?\d+$/) ||
      spinControlFlowKeywords.indexOf(word) > 0
    ) {
      this._logMessage(`+ Hvr: adjustWordPosition() EXIT false`);
      return [false, null!, null!];
    }
    if (position.isEqual(wordRange.end) && position.isAfter(wordRange.start)) {
      position = position.translate(0, -1);
    }

    this._logMessage(`+ Hvr: adjustWordPosition() EXIT true`);
    return [true, word, position];
  }

  private isPositionInString(document: vscode.TextDocument, position: vscode.Position, stringsInLine: IPairs[], ticVarsInLine: IPairs[]): boolean {
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

    this._logMessage(`+ Hvr: isPositionInString() = EXIT w/${inStringStatus}`);
    return inStringStatus;
  }

  private isPositionInComment(document: vscode.TextDocument, position: vscode.Position, stringsInLine: IPairs[]): boolean {
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
    if (!inCommentStatus) {
      // not in comment see if is in a block comment
      inCommentStatus = this.symbolsFound.isLineInBlockComment(position.line);
      this._logMessage(`+ Hvr: isPositionInComment() (post-block) = EXIT w/${inCommentStatus}`);
    } else {
      this._logMessage(`+ Hvr: isPositionInComment() = EXIT w/${inCommentStatus}`);
    }
    return inCommentStatus;
  }

  private _getStringPairOffsets(line: string): IPairs[] {
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

  private _getPairOffsetsOfTicVarWraps(line: string): IPairs[] {
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

  private _testAndReportFindings(text: string) {
    let pairs: IPairs[] = this._getStringPairOffsets(text);
    this._logMessage(`+     _testAndReportFindings([${text}](${text.length})) found ${pairs.length} pair(s)`);
    if (pairs.length > 0) {
      for (let pairIdx = 0; pairIdx < pairs.length; pairIdx++) {
        const pair: IPairs = pairs[pairIdx];
        this._logMessage(`+     --- pair #${pairIdx + 1} at([${pair.start}, ${pair.end}) `);
      }
    }
  }

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
}

export const spinControlFlowKeywords: string[] = ["if", "ifnot", "elseif", "elseifnot", "else", "case", "case_fast", "repeat", "from", "to", "step", "while", "until", "next", "quit"];
