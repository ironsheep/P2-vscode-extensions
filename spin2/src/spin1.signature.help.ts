"use strict";

import * as vscode from "vscode";
import * as path from "path";

import { CancellationToken, ParameterInformation, Position, SignatureHelp, SignatureHelpProvider, SignatureInformation, TextDocument, WorkspaceConfiguration } from "vscode";
import { DocumentFindings } from "./spin.semantic.findings";
import { ParseUtils, eBuiltInType, IBuiltinDescription } from "./spin1.utils";
import { IPairs, IDefinitionInfo, IDefinitionInput, ExtensionUtils, getSpin2Config } from "./spin1.extension.utils";

export class Spin1SignatureHelpProvider implements SignatureHelpProvider {
  private spinConfig: WorkspaceConfiguration | undefined;
  private signatureLogEnabled: boolean = false; // WARNING (REMOVE BEFORE FLIGHT)- change to 'false' - disable before commit
  private signatureOutputChannel: vscode.OutputChannel | undefined = undefined;
  private symbolsFound: DocumentFindings;
  private parseUtils = new ParseUtils();
  private extensionUtils = new ExtensionUtils(this.signatureLogEnabled, this.signatureOutputChannel);
  constructor(symbolRepository: DocumentFindings, spinConfig?: WorkspaceConfiguration) {
    this.spinConfig = spinConfig;
    this.symbolsFound = symbolRepository;
    if (this.signatureLogEnabled) {
      if (this.signatureOutputChannel === undefined) {
        //Create output channel
        this.signatureOutputChannel = vscode.window.createOutputChannel("Spin1 Signature DEBUG");
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
    if (this.signatureLogEnabled && this.signatureOutputChannel != undefined) {
      //Write to output window.
      this.signatureOutputChannel.appendLine(message);
    }
  }

  public async provideSignatureHelp(document: TextDocument, position: Position, token: CancellationToken): Promise<SignatureHelp | null> {
    this._logMessage(`+ Sig: provideHover() ENTRY`);
    if (!this.spinConfig) {
      this.spinConfig = getSpin2Config(document.uri);
    }
    let spinConfig = this.spinConfig;

    const theCall = this.walkBackwardsToBeginningOfCall(document, position);
    if (theCall == null) {
      return Promise.resolve(null);
    }
    const callerPos = this.previousTokenPosition(document, theCall.openParen);
    try {
      const defInfo: IDefinitionInfo | null = await this.definitionLocation(document, callerPos, spinConfig, true, token);
      if (!defInfo) {
        // The definition was not found
        this._logMessage(`+ Sig: defInfo NOT found`);
        return null;
      }
      this._logMessage(`+ Sig: defInfo.line=[${defInfo.line}], defInfo.doc=[${defInfo.doc}], defInfo.declarationlines=[${defInfo.declarationlines}], defInfo.parameters=[${defInfo.parameters}]`);
      if (defInfo.line === callerPos?.line) {
        // This must be a function definition
        this._logMessage(`+ Sig: IGNORING function/method definition`);
        return null;
      }

      const declLine: string = defInfo.line != -1 ? document.lineAt(defInfo.line).text.trim() : ""; // declaration line
      const nonCommentDecl: string = declLine.length > 0 ? this.parseUtils.getNonCommentLineRemainder(0, declLine).trim() : "";
      let declarationText: string = (defInfo.declarationlines || []).join(" ").trim();
      this._logMessage(`+ Sig: nonCommentDecl=[${nonCommentDecl}]`);
      this._logMessage(`+ Sig: declarationText=[${declarationText}]`);
      if (!declarationText) {
        this._logMessage(`+ Sig: IGNORING no declarationText`);
        return null;
      }
      const result = new SignatureHelp();
      let sig: string | undefined;
      let si: SignatureInformation | undefined;
      if (defInfo.doc?.includes("Custom Method")) {
        // use this for user(custom) methods
        sig = nonCommentDecl;
        const methDescr: string = this.getMethodDescriptionFromDoc(defInfo.doc);
        si = new SignatureInformation(sig, methDescr);
        if (si) {
          si.parameters = this.getParametersAndReturnTypeFromDoc(defInfo.doc);
        }
      } else if (defInfo.line == -1) {
        // use this for built-in methods
        const methDescr: string = this.getMethodDescriptionFromDoc(defInfo.doc);
        sig = "(Built-in) " + defInfo.declarationlines[0];
        this._logMessage(`+ Sig: sig=[${sig}], methDescr=[${methDescr}]`);
        if (sig) {
          si = new SignatureInformation(sig, methDescr);
          if (si && defInfo.parameters) {
            si.parameters = this.getParametersAndReturnTypeFromParameterStringAr(defInfo.parameters);
          }
        }
      }
      if (!si || !sig) return result;
      result.signatures = [si];
      result.activeSignature = 0;
      this._logMessage(`+ Sig: theCall.commas.length=[${theCall.commas.length}], si.parameters.length=[${si.parameters.length}]`);
      result.activeParameter = Math.min(theCall.commas.length, si.parameters.length - 1);
      return result;
    } catch (e) {
      return null;
    }
  }

  private getParametersAndReturnTypeFromParameterStringAr(paramList: string[] | undefined): vscode.ParameterInformation[] {
    // convert list of parameters frombuilt-in description tables to vscode ParameterInformation's
    let parameterDetails: vscode.ParameterInformation[] = [];
    if (paramList && paramList.length > 0) {
      for (let paramIdx = 0; paramIdx < paramList.length; paramIdx++) {
        const paramDescr = paramList[paramIdx];
        const lineParts: string[] = paramDescr.split(/[ \t]/).filter(Boolean);
        let paramName: string = lineParts[0];
        this._logMessage(`+ Sig: gpartfpsa paramName=[${paramName}], paramDescr=[${paramDescr}})`);
        const newParamInfo: ParameterInformation = new ParameterInformation(paramName, paramDescr);
        parameterDetails.push(newParamInfo);
      }
    }
    return parameterDetails;
  }

  private definitionLocation(
    document: vscode.TextDocument,
    position: vscode.Position,
    spinConfig: vscode.WorkspaceConfiguration | undefined,
    includeDocs: boolean,
    token: vscode.CancellationToken
  ): Promise<IDefinitionInfo | null> {
    this._logMessage(`+ Sig: definitionLocation() ENTRY`);
    const isPositionInBlockComment: boolean = this.symbolsFound.isLineInBlockComment(position.line);
    const adjustedPos = this.extensionUtils.adjustWordPosition(document, position, isPositionInBlockComment);
    if (!adjustedPos[0]) {
      this._logMessage(`+ Sig: definitionLocation() EXIT fail`);
      return Promise.resolve(null);
    }
    const word = adjustedPos[1];
    position = adjustedPos[2];
    let fileBasename = path.basename(document.fileName);
    this._logMessage(`+ Sig: word=[${word}], adjPos=(${position.line},${position.character}), file=[${fileBasename}], line=[${document.lineAt(position.line).text}]`);

    if (!spinConfig) {
      spinConfig = getSpin2Config(document.uri);
    }
    const searchDetails: IDefinitionInput = {
      document,
      position,
      word,
      includeDocs,
    };
    this._logMessage(`+ Sig: definitionLocation() EXIT after getting symbol details`);
    return this.getSymbolDetails(searchDetails, token, false);
  }

  private getSymbolDetails(input: IDefinitionInput, token: vscode.CancellationToken, useTags: boolean): Promise<IDefinitionInfo | null> {
    if (token) {
    } // kill compiler warns for now...
    if (useTags) {
    } // kill compiler warns for now...  Probably remove these from interface
    this._logMessage(`+ Sig: getSymbolDetails() input.word=[${input.word}]`);
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
      this._logMessage(`+ Sig: getSymbolDetails() isSignatureLine=[${isSignatureLine}]`);

      let bFoundSomething: boolean = false; // we've no answer
      let builtInFindings: IBuiltinDescription = this.parseUtils.docTextForBuiltIn(input.word);
      if (!builtInFindings.found) {
        this._logMessage(`+ Sig: built-in=[${input.word}], NOT found!`);
      } else {
        this._logMessage(`+ Sig: built-in=[${input.word}], Found!`);
      }
      let bFoundParseToken: boolean = this.symbolsFound.isKnownToken(input.word);
      if (!bFoundParseToken) {
        this._logMessage(`+ Sig: token=[${input.word}], NOT found!`);
      } else {
        this._logMessage(`+ Sig: token=[${input.word}], Found!`);
      }
      if (bFoundParseToken && !builtInFindings.found) {
        bFoundSomething = true;
        const tokenFindings = this.symbolsFound.getTokenWithDescription(input.word);
        if (tokenFindings.found) {
          this._logMessage(
            `+ Sig: token=[${input.word}], interpRaw=(${tokenFindings.tokenRawInterp}), scope=[${tokenFindings.scope}], interp=[${tokenFindings.interpretation}], adjName=[${tokenFindings.adjustedName}]`
          );
          this._logMessage(`+ Sig:    file=[${tokenFindings.relatedFilename}], declCmt=(${tokenFindings.declarationComment})]`);
        } else {
          this._logMessage(`+ Sig: get token failed?!!`);
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
        defInfo.line = tokenFindings.declarationLine; // report not our line but where the method is declared
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
          this._logMessage(`+ Sig: bISdebugStatement=[${bISdebugStatement}], sourceLine=[${sourceLine}]`);
          let mdLines: string[] = [];
          bFoundSomething = true;
          defInfo.declarationlines = [];
          this._logMessage(`+ Sig: word=[${input.word}], descr=(${builtInFindings.description}), type=[spin1 built-in], cat=[${builtInFindings.category}]`);

          let titleText: string | undefined = builtInFindings.category;
          let subTitleText: string | undefined = undefined;
          if (builtInFindings.type == eBuiltInType.BIT_METHOD) {
            defInfo.declarationlines = [builtInFindings.signature];
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
          if (mdLines.length > 0) {
            defInfo.doc = mdLines.join(" ");
          } else {
            // if we have title or subTitle but no mdLines then just clear .doc
            if (titleText || subTitleText) {
              defInfo.doc = undefined;
            }
          }
          defInfo.line = -1; // don;t have declaration line# for built-in!
          defInfo.parameters = builtInFindings.parameters; // forward any parameters found...
          defInfo.returns = builtInFindings.returns; // forward any returns found...
        }
      }
      if (bFoundSomething) {
        return resolve(defInfo);
      } else {
        return reject(null); // we have no answer!
      }
    });
  }

  // Takes a Go function signature like:
  //     (foo, bar string, baz number) (string, string)
  // and returns an array of parameter strings:
  //     ["foo", "bar string", "baz string"]
  // Takes care of balancing parens so to not get confused by signatures like:
  //     (pattern string, handler func(ResponseWriter, *Request)) {
  private getParametersAndReturnType(signature: string): { params: string[]; returnType: string } {
    const params: string[] = [];
    let parenCount = 0;
    let lastStart = 1;
    for (let i = 1; i < signature.length; i++) {
      switch (signature[i]) {
        case "(":
          parenCount++;
          break;
        case ")":
          parenCount--;
          if (parenCount < 0) {
            if (i > lastStart) {
              params.push(signature.substring(lastStart, i));
            }
            return {
              params,
              returnType: i < signature.length - 1 ? signature.substr(i + 1) : "",
            };
          }
          break;
        case ",":
          if (parenCount === 0) {
            params.push(signature.substring(lastStart, i));
            lastStart = i + 2;
          }
          break;
      }
    }
    return { params: [], returnType: "" };
  }

  private getMethodDescriptionFromDoc(docMD: string | undefined): string {
    let methodDescr: string = "";
    // this isolates mothd description lines and returns them
    // skipping first line, and @param, @returns lines
    if (docMD) {
      const lines = docMD.split("<br>");
      let descrLines: string[] = [];
      if (lines.length > 0) {
        for (let lnIdx = 1; lnIdx < lines.length; lnIdx++) {
          const sglLine = lines[lnIdx];
          if (sglLine.includes("@param")) {
            continue;
          }
          if (sglLine.includes("@returns")) {
            continue;
          }
          descrLines.push(sglLine);
        }
        if (descrLines.length > 0) {
          methodDescr = descrLines.join(" ");
        }
      }
    }

    return methodDescr;
  }

  private getParametersAndReturnTypeFromDoc(docMD: string): ParameterInformation[] {
    let parameterDetails: ParameterInformation[] = [];
    // this ignores return type info and just provides deets on param's
    const lines = docMD.split("<br>").filter(Boolean);
    if (lines.length > 0) {
      for (let lnIdx = 0; lnIdx < lines.length; lnIdx++) {
        const sglLine = lines[lnIdx];
        if (sglLine.includes("@param")) {
          const lineParts: string[] = sglLine.split(/[ \t]/).filter(Boolean);
          let paramName: string = lineParts[1];
          this._logMessage(`+ Sig: gpartfd paramName=[${paramName}], lineParts=[${lineParts}]({${lineParts.length}})`);
          const nameStartLocn: number = sglLine.indexOf(paramName);
          if (nameStartLocn != -1) {
            const paramDoc: string = sglLine.substring(nameStartLocn + paramName.length).trim();
            this._logMessage(`+ Sig: gpartfd paramDoc=[${paramDoc}]`);
            paramName = paramName.substring(1, paramName.length - 1);
            const newParamInfo: ParameterInformation = new ParameterInformation(paramName, `${paramName} ${paramDoc}`);
            parameterDetails.push(newParamInfo);
          }
        }
      }
    }
    return parameterDetails;
  }

  private previousTokenPosition(document: TextDocument, position: Position): Position {
    while (position.character > 0) {
      const word = document.getWordRangeAtPosition(position);
      if (word) {
        position = word.start;
        break;
      } else {
        position = position.translate(0, -1);
      }
    }
    this._logMessage(`+ Sig: previousTokenPosition() = [lin=${position.line}, char=${position.character}]`);
    return position;
  }

  /**
   * Goes through the function params' lines and gets the number of commas and the start position of the call.
   */
  private walkBackwardsToBeginningOfCall(document: TextDocument, position: Position): { openParen: Position; commas: Position[] } | null {
    let parenBalance = 0;
    let maxLookupLines = 30;
    const commas = [];

    const lineText = document.lineAt(position.line).text;
    const stringsFound: IPairs[] = this.extensionUtils.getStringPairOffsets(lineText);
    const ticVarsFound: IPairs[] = this.extensionUtils.getPairOffsetsOfTicVarWraps(lineText);

    for (let lineNr = position.line; lineNr >= 0 && maxLookupLines >= 0; lineNr--, maxLookupLines--) {
      const line = document.lineAt(lineNr);

      // Stop processing if we're inside a comment
      if (this.extensionUtils.isPositionInComment(document, position, stringsFound)) {
        return null;
      }

      // if its current line, get the text until the position given, otherwise get the full line.
      const [currentLine, characterPosition] = lineNr === position.line ? [line.text.substring(0, position.character), position.character] : [line.text, line.text.length - 1];

      for (let char = characterPosition; char >= 0; char--) {
        switch (currentLine[char]) {
          case "(":
            parenBalance--;
            if (parenBalance < 0) {
              return {
                openParen: new Position(lineNr, char),
                commas,
              };
            }
            break;
          case ")":
            parenBalance++;
            break;
          case ",":
            {
              const commaPos = new Position(lineNr, char);
              if (parenBalance === 0 && !this.extensionUtils.isPositionInString(document, commaPos, stringsFound, ticVarsFound)) {
                commas.push(commaPos);
              }
            }
            break;
        }
      }
    }
    return null;
  }
}
