"use strict";

import * as vscode from "vscode";
import * as path from "path";
import { CancellationToken, Hover, HoverProvider, Position, TextDocument, WorkspaceConfiguration } from "vscode";
import { DocumentFindings } from "./spin.semantic.findings";
import { ParseUtils, eBuiltInType } from "./spin1.utils";
import { IPairs, IDefinitionInfo, IDefinitionInput, ExtensionUtils, getSpin2Config } from "./spin1.extension.utils";
//import { IncomingMessage } from "http";
//import { isDeepStrictEqual } from "util";

export class Spin1HoverProvider implements HoverProvider {
  private spinConfig: WorkspaceConfiguration | undefined;
  private hoverLogEnabled: boolean = false; // WARNING (REMOVE BEFORE FLIGHT)- change to 'false' - disable before commit
  private hoverOutputChannel: vscode.OutputChannel | undefined = undefined;
  private symbolsFound: DocumentFindings;
  private parseUtils = new ParseUtils();
  private extensionUtils = new ExtensionUtils(this.hoverLogEnabled, this.hoverOutputChannel);

  private firstTime: boolean = true;

  constructor(symbolRepository: DocumentFindings, spinConfig?: WorkspaceConfiguration) {
    this.spinConfig = spinConfig;
    this.symbolsFound = symbolRepository;
    if (this.hoverLogEnabled) {
      if (this.hoverOutputChannel === undefined) {
        //Create output channel
        this.hoverOutputChannel = vscode.window.createOutputChannel("Spin1 Hover DEBUG");
        this._logMessage("Spin1 log started.");
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
  //  IDefinitionInfo
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
      (IDefinitionInfo) => {
        if (IDefinitionInfo == null) {
          this._logMessage(`+ Hvr: provideHover() EXIT no info`);
          return null;
        }
        const lines = IDefinitionInfo.declarationlines.filter((line) => line !== "").map((line) => line.replace(/\t/g, "    "));
        let text;
        text = lines.join("\n").replace(/\n+$/, "");
        const hoverTexts = new vscode.MarkdownString();
        hoverTexts.supportHtml = true; // yes, let's support some html
        hoverTexts.appendCodeblock(text, "spin2"); // should be spin2/spin but "code lanuguage not supported or defined" : bad ones are: json
        if (IDefinitionInfo.doc != null) {
          hoverTexts.appendMarkdown(IDefinitionInfo.doc);
        }
        const hover = new Hover(hoverTexts);
        this._logMessage(`+ Hvr: provideHover() EXIT with hover`);
        return hover;
      },
      () => {
        this._logMessage(`+ Hvr: provideHover() EXIT null`);
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
  ): Promise<IDefinitionInfo | null> {
    this._logMessage(`+ Hvr: definitionLocation() ENTRY`);
    const isPositionInBlockComment: boolean = this.symbolsFound.isLineInBlockComment(position.line);
    const adjustedPos = this.extensionUtils.adjustWordPosition(document, position, isPositionInBlockComment);
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
    const searchDetails: IDefinitionInput = {
      document,
      position,
      word,
      includeDocs,
    };
    this._logMessage(`+ Hvr: definitionLocation() EXIT after getting symbol details`);
    return this.getSymbolDetails(searchDetails, token, false);
  }

  private getSignatureWithoutLocals(line: string): string {
    let desiredLinePortion: string = line;
    const localOffset: number = line.indexOf("|");
    if (localOffset != -1) {
      desiredLinePortion = line.substring(0, localOffset).trim();
    }
    return desiredLinePortion;
  }

  private getSymbolDetails(input: IDefinitionInput, token: vscode.CancellationToken, useTags: boolean): Promise<IDefinitionInfo | null> {
    if (token) {
    } // kill compiler warns for now...
    if (useTags) {
    } // kill compiler warns for now...  Probably remove these from interface
    return new Promise((resolve, reject) => {
      const defInfo: IDefinitionInfo = {
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
      let builtInFindings = this.parseUtils.docTextForBuiltIn(input.word);
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
          this._logMessage(`+ Hvr:    file=[${tokenFindings.relatedFilename}], declCmt=(${tokenFindings.declarationComment})], sig=(${tokenFindings.signature})]`);
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
        const isMethod: boolean = typeString.includes("method");
        if (isMethod && !isSignatureLine) {
          tokenFindings.signature = this.getSignatureWithoutLocals(nonCommentDecl);
        }
        if (isMethod) {
          if (tokenFindings.scope.includes("object")) {
            if (typeString.includes("method")) {
              defInfo.declarationlines = [`(${scopeString} ${typeString}) ${tokenFindings.signature}`];
            } else {
              defInfo.declarationlines = [`(${scopeString} ${typeString}) ${nameString}`];
            }
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
        if (isMethod) {
          //if (!isSignatureLine) {
          mdLines.push(`Custom Method: User defined<br>`);
          //}
        }
        if (
          (tokenFindings.interpretation.includes("32-bit constant") && !tokenFindings.relatedObjectName) ||
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
          if (isMethod) {
            mdLines.push("- " + tokenFindings.declarationComment);
          } else {
            mdLines.push(tokenFindings.declarationComment);
          }
        } else {
          // no object comment
          if (isMethod) {
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
      } else {
        // -------------------------------
        // no token, let's check for built-in language parts
        if (builtInFindings.found) {
          const bHaveParams = builtInFindings.parameters && builtInFindings.parameters.length > 0 ? true : false;
          const bHaveReturns = builtInFindings.returns && builtInFindings.returns.length > 0 ? true : false;
          this._logMessage(`+ Hvr: bHaveParams=[${bHaveParams}], bHaveReturns=[${bHaveReturns}], sourceLine=[${sourceLine}]`);
          let mdLines: string[] = [];
          bFoundSomething = true;
          defInfo.declarationlines = [];
          this._logMessage(`+ Hvr: word=[${input.word}], descr=(${builtInFindings.description}), type=[spin1 built-in], cat=[${builtInFindings.category}]`);

          let titleText: string | undefined = builtInFindings.category;
          let subTitleText: string | undefined = undefined;
          if (builtInFindings.type == eBuiltInType.BIT_VARIABLE) {
            defInfo.declarationlines = ["(variable) " + input.word];
            // in one case, we are doubling "variable", remove one...
            if (titleText.includes("Spin Variable")) {
              titleText = "Spin";
            }
            subTitleText = ` variable: *Spin1 built-in*`;
          } else if (builtInFindings.type == eBuiltInType.BIT_SYMBOL) {
            defInfo.declarationlines = ["(symbol) " + input.word];
            subTitleText = ` symbol: *Spin1 built-in*`;
          } else if (builtInFindings.type == eBuiltInType.BIT_CONSTANT) {
            defInfo.declarationlines = ["(constant 32-bit) " + input.word];
            subTitleText = ` constant: *Spin1 built-in*`;
          } else if (builtInFindings.type == eBuiltInType.BIT_METHOD) {
            defInfo.declarationlines = ["(built-in method) " + builtInFindings.signature];
            subTitleText = `: *Spin1 built-in*`;
          } else if (builtInFindings.type == eBuiltInType.BIT_PASM_DIRECTIVE) {
            defInfo.declarationlines = ["(built-in directive) " + builtInFindings.signature];
            subTitleText = `: *Spin1 built-in*`;
          } else if (builtInFindings.type == eBuiltInType.BIT_LANG_PART) {
            defInfo.declarationlines = ["(spin1 language) " + input.word];
            subTitleText = `: *Spin1 built-in*`;
          } else if (builtInFindings.type == eBuiltInType.BIT_TYPE) {
            defInfo.declarationlines = ["(Spin1 Storage) " + input.word];
            subTitleText = `: *Spin1 built-in*`;
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
          if (bHaveParams || bHaveReturns) {
            mdLines.push("<br><br>"); // blank line
          }
          if (bHaveParams && builtInFindings.parameters) {
            for (let parmIdx = 0; parmIdx < builtInFindings.parameters.length; parmIdx++) {
              const paramDescr = builtInFindings.parameters[parmIdx];
              const lineParts: string[] = paramDescr.split(" - ");
              // special handling when we have non-param lines, too
              if (lineParts.length >= 2) {
                const valueName: string = lineParts[0].replace("`", "").replace("`", "");
                mdLines.push("@param `" + valueName + "` - " + paramDescr.substring(lineParts[0].length + 3) + "<br>"); // formatted parameter description
              } else {
                mdLines.push(paramDescr + "<br>"); // formatted parameter description
              }
            }
          }
          if (bHaveReturns && builtInFindings.returns) {
            for (let parmIdx = 0; parmIdx < builtInFindings.returns.length; parmIdx++) {
              const returnsDescr = builtInFindings.returns[parmIdx];
              const lineParts: string[] = returnsDescr.split(" - ");
              const valueName: string = lineParts[0].replace("`", "").replace("`", "");
              if (lineParts.length >= 2) {
                mdLines.push("@returns `" + valueName + "` - " + returnsDescr.substring(lineParts[0].length + 3) + "<br>"); // formatted parameter description
              }
            }
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
}
