"use strict";

import * as vscode from "vscode";
import * as path from "path";
import { CancellationToken, Hover, HoverProvider, Position, TextDocument, WorkspaceConfiguration } from "vscode";
import { DocumentFindings } from "./spin.semantic.findings";
import { ParseUtils, eBuiltInType } from "./spin2.utils";

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
        doc: " item documentation",
        name: input.document.fileName,
      };
      const sourceLine = input.document.lineAt(input.position.line).text.trim();
      const isSignature: boolean = sourceLine.toLowerCase().startsWith("pub") || sourceLine.toLowerCase().startsWith("pri");

      let bFoundSomething: boolean = true; // for now we don't have failure case
      let bFoundParseToken: boolean = this.symbolsFound.isKnownToken(input.word);
      if (bFoundParseToken) {
        bFoundSomething = true;
        let tokenFindings = this.symbolsFound.getTokenWithDescription(input.word);
        if (tokenFindings.found) {
          this._logMessage(
            `+ Hvr: token=[${input.word}], scope=(${tokenFindings.tokenRawInterp}), scope=[${tokenFindings.scope}], interp=[${tokenFindings.interpretation}], adjName=[${tokenFindings.adjustedName}]`
          );
        }
        /*
    found: boolean;
    tokenRawInterp: string;
    scope: string;
    interpretation: string;
    adjustedName: string;
    token: RememberedToken | undefined;
          */
        let nameString = tokenFindings.adjustedName;
        let scopeString = tokenFindings.scope;
        let typeString = tokenFindings.interpretation;
        let docRootCommentMD = `(*${scopeString}* ${typeString}) **${nameString}**`;
        let signature = `(${scopeString} ${typeString}) ${nameString}`;
        if (scopeString.length == 0) {
          docRootCommentMD = `(${typeString}) **${nameString}**`;
          signature = `(${typeString}) ${nameString}`;
        }
        defInfo.declarationlines = isSignature ? [sourceLine, signature, tokenFindings.tokenRawInterp] : [signature, tokenFindings.tokenRawInterp];
        //defInfo.doc = "".concat(`${docRootCommentMD}<br>`, `- bullet 1<br>`, "- @param `bullet` 2<br>", "<br>", `My warning paragraph.<br>`, `#### (L4) Heading<br>`, `My next paragraph.<br>`);
        defInfo.doc = "".concat(`${docRootCommentMD}`); // TODO: add doc comments here when we finally get them...
      } else {
        this._logMessage(`+ Hvr: token=[${input.word}], NOT found!`);
        // no token, let's check for built-in language parts
        let builtInFindings = this.parseUtils.docTextForBuiltIn(input.word);
        if (builtInFindings.found) {
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
        reject(null);
      }
    });
  }

  private adjustWordPosition(document: vscode.TextDocument, position: vscode.Position): [boolean, string, vscode.Position] {
    const wordRange = document.getWordRangeAtPosition(position);
    const lineText = document.lineAt(position.line).text;
    const word = wordRange ? document.getText(wordRange) : "";
    // TODO: fix this for spin comments vs. // comments
    if (
      !wordRange ||
      lineText.startsWith("//") ||
      this.isPositionInString(document, position) ||
      this.isPositionInComment(document, position) ||
      word.match(/^\d+.?\d+$/) ||
      spinKeywords.indexOf(word) > 0
    ) {
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
    const lineText = document.lineAt(position.line).text.trim();
    const lineTillCurrentPosition = lineText.substr(0, position.character);
    if (lineText.startsWith("'") || lineText.startsWith("{")) {
      inCommentStatus = true;
    }
    return inCommentStatus;
  }
}

export const spinKeywords: string[] = ["switch", "case", "quit", "continue", "default", "else", "for", "if", "range", "return", "select", "struct", "switch", "type", "var", "repeat", "from", "to"];
