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

//import { Spin2HoverProvider } from './src/spin2.hover.behavior.ts';
export class Spin2HoverProvider implements HoverProvider {
  private spinConfig: WorkspaceConfiguration | undefined;
  hoverLogEnabled: boolean = true; // WARNING (REMOVE BEFORE FLIGHT)- change to 'false' - disable before commit
  private hoverOutputChannel: vscode.OutputChannel | undefined = undefined;
  private symbolsFound: DocumentFindings;
  private parseUtils = new ParseUtils();

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
    if (!this.spinConfig) {
      this.spinConfig = getSpin2Config(document.uri);
    }
    let spinConfig = this.spinConfig;
    return this.definitionLocation(document, position, spinConfig, true, token).then(
      (definitionInfo) => {
        if (definitionInfo == null) {
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
        return hover;
      },
      () => {
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
    const adjustedPos = this.adjustWordPosition(document, position);
    if (!adjustedPos[0]) {
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

      let bFoundSomething: boolean = false; // we've no answer
      let bFoundParseToken: boolean = this.symbolsFound.isKnownToken(input.word);
      if (bFoundParseToken) {
        bFoundSomething = true;
        let tokenFindings = this.symbolsFound.getTokenWithDescription(input.word);
        if (tokenFindings.found) {
          this._logMessage(
            `+ Hvr: token=[${input.word}], scope=(${tokenFindings.tokenRawInterp}), scope=[${tokenFindings.scope}], interp=[${tokenFindings.interpretation}], adjName=[${tokenFindings.adjustedName}]`
          );
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
        const declLine = input.document.lineAt(tokenFindings.declarationLine).text; // declaration line

        // -------------------------------
        // load CODE section of hover
        //
        if (typeString.includes("method")) {
          if (isSignatureLine) {
            // for method declaration use declaration line
            defInfo.declarationlines = [sourceLine];
          } else {
            // for method use, replace PUB/PRI with our interp
            const interpDecl = typeInterp + declLine.substring(3);
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
        } else if (typeString.includes("method")) {
          // no declaration comment but is user-defined method
          const noCommentProvided = `*(no doc-comment provided)*`;
          if (!isSignatureLine) {
            defInfo.doc = "".concat(`Custom Method: User defined<br>`, noCommentProvided);
          } else {
            defInfo.doc = "".concat(noCommentProvided); // TODO: add doc comments here when we finally get them...
          }
        } else {
          // no doc-comment, not method
          defInfo.doc = undefined; //"".concat(`${docRootCommentMD}`); // TODO: add doc comments here when we finally get them...
        }
      } else {
        this._logMessage(`+ Hvr: token=[${input.word}], NOT found!`);
        // -------------------------------
        // no token, let's check for built-in language parts
        let builtInFindings = this.parseUtils.docTextForBuiltIn(input.word);
        if (builtInFindings.found) {
          let bISdebugStatement: boolean = false;
          if (input.word.toLowerCase() == "debug" && sourceTextToRight.toLowerCase().startsWith("debug(")) {
            bISdebugStatement = true;
          }
          this._logMessage(`+ Hvr: bISdebugStatement=[${bISdebugStatement}], sourceTextToRight=[${sourceTextToRight}]`);
          bFoundSomething = true;
          defInfo.declarationlines = [];
          this._logMessage(`+ Hvr: word=[${input.word}], descr=(${builtInFindings.description}), type=[spin2 built-in], cat=[${builtInFindings.category}]`);
          if (builtInFindings.type == eBuiltInType.BIT_VARIABLE) {
            defInfo.declarationlines = ["(variable) " + input.word];
            defInfo.doc = "".concat(`${builtInFindings.category} variable: *Spin2 built-in*<br>`, "- " + builtInFindings.description);
          } else if (builtInFindings.type == eBuiltInType.BIT_SYMBOL) {
            defInfo.declarationlines = ["(symbol) " + input.word];
            defInfo.doc = "".concat(`${builtInFindings.category} symbol: *Spin2 built-in*<br>`, "- " + builtInFindings.description);
          } else if (builtInFindings.type == eBuiltInType.BIT_METHOD) {
            defInfo.declarationlines = ["(method) " + builtInFindings.signature];
            defInfo.doc = "".concat(`${builtInFindings.category}: *Spin2 built-in*<br>`, "- " + builtInFindings.description);
          } else if (builtInFindings.type == eBuiltInType.BIT_DEBUG_SYMBOL) {
            if (bISdebugStatement) {
              defInfo.declarationlines = ["(DEBUG method) " + input.word + "()"];
              let description: string =
                "Run output commands that serially transmit the state of variables and equations as your application runs.  Each time a DEBUG statement is encountered during execution, the debugging program is invoked and it outputs the message for that statement.";
              description = description + "<br>*(Affected by DEBUG_PIN_TX symbol)*";
              defInfo.doc = "".concat(`${builtInFindings.category}: *Spin2 debug built-in*<br>`, "- " + description);
            } else {
              defInfo.declarationlines = ["(DEBUG symbol) " + input.word];
              defInfo.doc = "".concat(`${builtInFindings.category}: *Spin2 debug built-in*<br>`, "- " + builtInFindings.description);
            }
          } else if (builtInFindings.type == eBuiltInType.BIT_DEBUG_METHOD) {
            defInfo.declarationlines = ["(DEBUG method) " + builtInFindings.signature];
            defInfo.doc = "".concat(`${builtInFindings.category}: *Spin2 debug built-in*<br>`, "- " + builtInFindings.description);
          } else {
            defInfo.doc = "".concat(builtInFindings.description);
          }
        } else {
          this._logMessage(`+ Hvr: built-in=[${input.word}], NOT found!`);
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
    const wordRange = document.getWordRangeAtPosition(position);
    const lineText = document.lineAt(position.line).text;
    const word = wordRange ? document.getText(wordRange) : "";
    // TODO: fix this for spin comments vs. // comments
    if (!wordRange || this.isPositionInString(document, position) || this.isPositionInComment(document, position) || word.match(/^\d+.?\d+$/) || spinKeywords.indexOf(word) > 0) {
      return [false, null!, null!];
    }
    if (position.isEqual(wordRange.end) && position.isAfter(wordRange.start)) {
      position = position.translate(0, -1);
    }

    return [true, word, position];
  }

  private isPositionInString(document: vscode.TextDocument, position: vscode.Position): boolean {
    const lineText = document.lineAt(position.line).text;
    const lineTillCurrentPosition = lineText.substr(0, position.character);
    // TODO: fix this for spin string vs. only "" strings

    // Count the number of double quotes in the line till current position. Ignore escaped double quotes
    let doubleQuotesCnt = (lineTillCurrentPosition.match(/"/g) || []).length;
    const escapedDoubleQuotesCnt = (lineTillCurrentPosition.match(/\\"/g) || []).length;

    doubleQuotesCnt -= escapedDoubleQuotesCnt;
    return doubleQuotesCnt % 2 === 1;
  }

  private isPositionInComment(document: vscode.TextDocument, position: vscode.Position): boolean {
    let inCommentStatus: boolean = false;
    const lineTextUntrim = document.lineAt(position.line).text;
    const lineText = lineTextUntrim.trim();
    // if entire line is comment
    if (lineText.startsWith("'") || lineText.startsWith("{")) {
      inCommentStatus = true;
    } else {
      // if text is within trailing comment
      let firstTickMatchLocn: number = lineTextUntrim.indexOf("'");
      let firstBraceMatchLocn: number = lineTextUntrim.indexOf("{");
      let firstMatchLocn = firstTickMatchLocn < firstBraceMatchLocn && firstTickMatchLocn != -1 ? firstTickMatchLocn : firstBraceMatchLocn;
      if (firstBraceMatchLocn == -1) {
        firstMatchLocn = firstTickMatchLocn;
      }
      this._logMessage(`+ Hvr: isPositionInComment() pos=[${position.character}], tik=[${firstTickMatchLocn}], brc=[${firstBraceMatchLocn}], mtch=[${firstMatchLocn}]`);
      if (firstMatchLocn != -1 && position.character > firstMatchLocn && !this.isPositionInString(document, position)) {
        inCommentStatus = true;
      }
    }
    if (!inCommentStatus) {
      // not in comment see if is in a block comment
      inCommentStatus = this.symbolsFound.isLineInBlockComment(position.line);
    }
    return inCommentStatus;
  }
}

export const spinKeywords: string[] = ["switch", "case", "quit", "continue", "default", "else", "for", "if", "range", "return", "select", "struct", "switch", "type", "var", "repeat", "from", "to"];
