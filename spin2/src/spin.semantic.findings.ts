"use strict";
import { IncomingMessage } from "http";
// src/spin2.semantic.findings.ts

import * as vscode from "vscode";
import { eDebugDisplayType, displayEnumByTypeName } from "./spin2.utils";

// ============================================================================
//  this file contains objects we use in tracking symbol use and declaration
//
export enum eBLockType {
  Unknown = 0,
  isCon,
  isDat,
  isVar,
  isObj,
  isPub,
  isPri,
}

export interface IBlockSpan {
  startLineNbr: number;
  endLineNbr: number;
  blockType: eBLockType;
  sequenceNbr: number;
}

export interface ITokenDescription {
  found: boolean;
  tokenRawInterp: string;
  isGoodInterp: boolean;
  scope: string;
  interpretation: string;
  adjustedName: string;
  token: RememberedToken | undefined;
  declarationLine: number;
  declarationComment: string | undefined;
  signature: string | undefined;
  relatedFilename: string | undefined;
  relatedObjectName: string | undefined;
  relatedMethodName: string | undefined;
}

export interface ITokenInterpretation {
  scope: string;
  interpretation: string;
  name: string;
  isGoodInterp: boolean;
}

export interface IDebugDisplayInfo {
  displayTypeString: string;
  userName: string;
  lineNbr: number;
  eDisplayType: eDebugDisplayType;
}

export interface IMethodSpan {
  startLineNbr: number;
  endLineNbr: number;
}

// search comment type: non-doc only, doc-only, or mixed
enum eCommentFilter {
  Unknown = 0,
  docCommentOnly,
  nondocCommentOnly,
  allComments,
}

// ----------------------------------------------------------------------------
//  Shared Data Storage for what our current document contains
//   CLASS DocumentFindings
export class DocumentFindings {
  private globalTokens;
  private localTokensByMethod;
  private globalTokensDeclarationInfo;
  private localTokensDeclarationInfo;
  private localPasmTokensByMethodName;
  private blockComments: RememberedComment[] = [];
  private fakeComments: RememberedComment[] = [];
  private methodSpanInfo = new Map<string, IMethodSpan>();
  private currMethodName: string | undefined = undefined;
  private currMethodStartLineNbr: number = 0;

  // tracking of Spin Code Blocks
  private priorBlockType: eBLockType = eBLockType.Unknown;
  private priorBlockStartLineIdx: number = -1;
  private priorInstanceCount: number = 0;
  private codeBlockSpans: IBlockSpan[] = [];

  private outputChannel: vscode.OutputChannel | undefined = undefined;
  private bLogEnabled: boolean = false;

  public constructor(isLogging: boolean, logHandle: vscode.OutputChannel | undefined) {
    this.bLogEnabled = isLogging;
    this.outputChannel = logHandle;
    this._logTokenMessage("* Global, Local, MethodScoped Token repo's ready");
    this.globalTokens = new TokenSet("gloTOK", isLogging, logHandle);
    this.localTokensByMethod = new NameScopedTokenSet("locTOK", isLogging, logHandle);
    this.globalTokensDeclarationInfo = new Map<string, RememberedTokenDeclarationInfo>();
    this.localTokensDeclarationInfo = new Map<string, RememberedTokenDeclarationInfo>();
    // and for P2
    this.localPasmTokensByMethodName = new NameScopedTokenSet("methodTOK", isLogging, logHandle);
  }

  //
  // PUBLIC Methods
  //
  public clear() {
    // we're studying a new document forget everything!
    this.globalTokens.clear();
    this.localTokensByMethod.clear();
    this.localPasmTokensByMethodName.clear();
    this.blockComments = [];
    this.fakeComments = [];
    // clear our method-span pieces
    this.methodSpanInfo.clear();
    this.currMethodName = undefined;
    this.currMethodStartLineNbr = 0;
    // clear spin-code-block tracking
    this.priorBlockType = eBLockType.Unknown;
    this.priorBlockStartLineIdx = -1;
    this.priorInstanceCount = 0;
    this.codeBlockSpans = [];
  }

  public recordBlockStart(eCurrBlockType: eBLockType, currLineIdx: number) {
    this._logTokenMessage(`  -- FND-RCD-BLOCK iblockType=[${eCurrBlockType}], span=[${currLineIdx} - ???]`);
    if (currLineIdx == 0 && this.priorBlockType != eBLockType.Unknown) {
      // we are getting a replacement for the default CON start section, use it!
      this.priorBlockType = eCurrBlockType; // override the default with possibly NEW block type
      this.priorBlockStartLineIdx = currLineIdx;
      this.priorInstanceCount = 1;
    } else if (this.priorBlockType == eBLockType.Unknown) {
      // we are starting the first block
      this.priorBlockType = eCurrBlockType;
      this.priorBlockStartLineIdx = currLineIdx;
      this.priorInstanceCount = 1;
    } else {
      // we are starting a later block, lets finish prior then start the new
      const isFirstOfThisType: boolean = this.priorBlockType != eCurrBlockType ? false : true;
      const newBlockSpan: IBlockSpan = {
        blockType: this.priorBlockType,
        sequenceNbr: this.priorInstanceCount,
        startLineNbr: this.priorBlockStartLineIdx,
        endLineNbr: currLineIdx - 1, // ends at prior line
      };
      this.codeBlockSpans.push(newBlockSpan);
      this._logTokenMessage(`  -- FND-RCD-ADD sequenceNbr=[${newBlockSpan.sequenceNbr}], blockType=[${newBlockSpan.blockType}], span=[${newBlockSpan.startLineNbr} - ${newBlockSpan.endLineNbr}]`);
      this.priorInstanceCount = this.priorBlockType == eCurrBlockType ? this.priorInstanceCount + 1 : 1;
      this.priorBlockStartLineIdx = currLineIdx;
      this.priorBlockType = eCurrBlockType;
    }
  }

  public finishFinalBlock(finalLineIdx: number) {
    this._logTokenMessage(`  -- FND-RCD-BLOCK LAST span=[??? - ${finalLineIdx}]`);
    if (this.priorBlockType != eBLockType.Unknown) {
      // we are ending the last block
      const newBlockSpan: IBlockSpan = {
        blockType: this.priorBlockType,
        sequenceNbr: this.priorInstanceCount,
        startLineNbr: this.priorBlockStartLineIdx,
        endLineNbr: finalLineIdx, // ends at the last line of the file
      };
      this._logTokenMessage(`  -- FND-RCD-ADD LAST sequenceNbr=[${newBlockSpan.sequenceNbr}], blockType=[${newBlockSpan.blockType}], span=[${newBlockSpan.startLineNbr} - ${newBlockSpan.endLineNbr}]`);
      this.codeBlockSpans.push(newBlockSpan);
    }
  }

  public blockSpans(): IBlockSpan[] {
    return this.codeBlockSpans;
  }

  public recordComment(comment: RememberedComment) {
    this.blockComments.push(comment);
  }

  public recordFakeComment(comment: RememberedComment) {
    this.fakeComments.push(comment);
  }

  public isLineInBlockComment(lineNumber: number): boolean {
    let inCommentStatus: boolean = false;
    if (this.blockComments.length > 0) {
      for (let docComment of this.blockComments) {
        if (docComment.includesLine(lineNumber)) {
          inCommentStatus = true;
          break;
        }
      }
    }
    return inCommentStatus;
  }

  public isLineInFakeComment(lineNumber: number): boolean {
    let inCommentStatus: boolean = false;
    if (this.fakeComments.length > 0) {
      for (let fakeComment of this.fakeComments) {
        if (fakeComment.includesLine(lineNumber)) {
          inCommentStatus = true;
          break;
        }
      }
    }
    return inCommentStatus;
  }

  public blockCommentMDFromLine(lineNumber: number, eFilter: eCommentFilter): string | undefined {
    let desiredComment: string | undefined = undefined;
    if (this.blockComments.length > 0) {
      for (let blockComment of this.blockComments) {
        // only one will match...
        if (blockComment.includesLine(lineNumber)) {
          const canUseThisComment: boolean = this._isUsableComment(blockComment.isDocComment, eFilter);
          if (canUseThisComment) {
            desiredComment = blockComment.commentAsMarkDown();
          }
          break; // we found the single match, so stop seraching...
        }
      }
    }
    return desiredComment;
  }

  public fakeCommentMDFromLine(lineNumber: number, eFilter: eCommentFilter): string | undefined {
    let desiredComment: string | undefined = undefined;
    if (this.fakeComments.length > 0) {
      for (let fakeComment of this.fakeComments) {
        if (fakeComment.includesLine(lineNumber)) {
          const canUseThisComment: boolean = this._isUsableComment(fakeComment.isDocComment, eFilter);
          if (canUseThisComment) {
            desiredComment = fakeComment.commentAsMarkDown();
          }
          break;
        }
      }
    }
    return desiredComment;
  }
  private _isUsableComment(bHaveDocComment: boolean, efilter: eCommentFilter): boolean {
    const canUsestatus: boolean =
      (bHaveDocComment && (efilter == eCommentFilter.allComments || efilter == eCommentFilter.docCommentOnly)) ||
      (!bHaveDocComment && (efilter == eCommentFilter.allComments || efilter == eCommentFilter.nondocCommentOnly))
        ? true
        : false;
    return canUsestatus;
  }

  public isKnownToken(tokenName: string): boolean {
    const foundStatus: boolean = this.isGlobalToken(tokenName) || this.isLocalToken(tokenName) || this.hasLocalPasmToken(tokenName) ? true : false;
    return foundStatus;
  }

  public isKnownDebugToken(tokenName: string): boolean {
    const foundStatus: boolean = this.isKnownDebugDisplay(tokenName) ? true : false;
    return foundStatus;
  }

  public getDebugTokenWithDescription(tokenName: string): ITokenDescription {
    let findings: ITokenDescription = {
      found: false,
      tokenRawInterp: "",
      isGoodInterp: false,
      token: undefined,
      scope: "",
      interpretation: "",
      adjustedName: tokenName,
      declarationLine: 0,
      declarationComment: undefined,
      signature: undefined,
      relatedFilename: undefined,
      relatedObjectName: undefined,
      relatedMethodName: undefined,
    };
    // do we have a token??
    let declInfo: RememberedTokenDeclarationInfo | undefined = undefined;
    if (this.isKnownDebugDisplay(tokenName)) {
      findings.found = true;
      // Check for debug display type?
      const displayInfo: IDebugDisplayInfo = this.getDebugDisplayInfoForUserName(tokenName);
      if (displayInfo.eDisplayType != eDebugDisplayType.Unknown) {
        // we have a debug display type!
        findings.token = new RememberedToken("debugDisplay", [displayInfo.displayTypeString]);
        findings.scope = "Global";
        findings.tokenRawInterp = "Global: " + this._rememberdTokenString(tokenName, findings.token);
        const termType: string = displayInfo.displayTypeString.toUpperCase();
        declInfo = new RememberedTokenDeclarationInfo(displayInfo.lineNbr, `Debug Output: User name for an instance of ${termType}<br>- Write output to the \`${tokenName}\` window`);
      }
    }
    if (findings.token) {
      let details: ITokenInterpretation = this._interpretToken(findings.token, findings.scope, tokenName, declInfo);
      findings.isGoodInterp = details.isGoodInterp;
      findings.interpretation = details.interpretation;
      findings.scope = details.scope;
      findings.adjustedName = details.name;
      const bIsMethod: boolean = findings.token.type == "method";
      if (declInfo) {
        // and decorate with declaration line number
        findings.declarationLine = declInfo.lineIndex;
        if (declInfo.reference) {
          if (declInfo.isFilenameReference) {
            findings.relatedFilename = declInfo.reference;
          } else {
            findings.relatedObjectName = declInfo.reference;
          }
        }
        const bIsPublic: boolean = findings.token.modifiers.includes("static") ? false : true;
        if (bIsMethod) {
          const commentType: eCommentFilter = bIsPublic ? eCommentFilter.docCommentOnly : eCommentFilter.nondocCommentOnly;
          const nonBlankLineNbr: number = this._locateNonBlankLineAfter(findings.declarationLine + 1);
          findings.declarationComment = this.blockCommentMDFromLine(nonBlankLineNbr, commentType);
          this._logTokenMessage(
            `  -- FND-DBGxxxTOK findings.signature=[${findings.signature}], findings.declarationComment=[${findings.declarationComment}], declInfo.comment=[${findings.relatedFilename}]`
          );
          // if no block doc comment then we can substitute a preceeding or trailing doc comment for method
          const canUseAlternateComment: boolean = bIsPublic == false || (bIsPublic == true && declInfo.isDocComment) ? true : false;
          if (!findings.declarationComment && canUseAlternateComment && declInfo.comment && declInfo.comment.length > 0) {
            // if we have single line doc comment and can use it, then do so!
            findings.declarationComment = declInfo.comment;
          }
          // NOTE: use fake signature comment instead when there Are params and declInfo doesn't describe them
          const haveDeclParams: boolean = findings.declarationComment && findings.declarationComment?.includes("@param") ? true : false;
          this._logTokenMessage(`  -- FND-DBGxxxTOK haveDeclParams=(${haveDeclParams})`);
          if (!haveDeclParams) {
            let fakeComment: string | undefined = this.fakeCommentMDFromLine(nonBlankLineNbr, commentType);
            if (fakeComment) {
              if (findings.declarationComment) {
                findings.declarationComment = findings.declarationComment + "<br><br>" + fakeComment;
              } else {
                findings.declarationComment = fakeComment;
              }
            }
          }
        } else {
          //  (this is in else so non-methods can get non-doc multiline preceeding blocks!)
          findings.declarationComment = this.blockCommentMDFromLine(findings.declarationLine - 1, eCommentFilter.nondocCommentOnly);
          // if no multi-line comment then ...(but don't use trailing comment when method!)
          if (!findings.declarationComment && declInfo.comment) {
            // if we have single line comment then use it!
            findings.declarationComment = declInfo.comment;
          }
        }
      }
      this._logTokenMessage(
        `  -- FND-DBGxxxTOK line(${findings.declarationLine}) cmt=[${findings.declarationComment}], file=[${findings.relatedFilename}], obj=[${findings.relatedObjectName}]` +
          this._rememberdTokenString(tokenName, findings.token)
      );
    }
    return findings;
  }

  public getTokenWithDescription(tokenName: string, lineNbr: number): ITokenDescription {
    let findings: ITokenDescription = {
      found: false,
      tokenRawInterp: "",
      isGoodInterp: false,
      token: undefined,
      scope: "",
      interpretation: "",
      adjustedName: tokenName,
      declarationLine: 0,
      declarationComment: undefined,
      signature: undefined,
      relatedFilename: undefined,
      relatedObjectName: undefined,
      relatedMethodName: undefined,
    };
    // do we have a token??
    let declInfo: RememberedTokenDeclarationInfo | undefined = undefined;
    if (this.isKnownToken(tokenName)) {
      findings.found = true;
      // Check for Global-tokens?
      findings.token = this.getGlobalToken(tokenName);
      if (findings.token) {
        // we have a GLOBAL token!
        findings.tokenRawInterp = "Global: " + this._rememberdTokenString(tokenName, findings.token);
        findings.scope = "Global";
        // and get additional info for token
        declInfo = this.globalTokensDeclarationInfo.get(tokenName);
      } else {
        // Check for Local-tokens?
        findings.token = this.getLocalTokenForLine(tokenName, lineNbr);
        if (findings.token) {
          // we have a LOCAL token!
          findings.tokenRawInterp = "Local: " + this._rememberdTokenString(tokenName, findings.token);
          findings.scope = "Local";
          // and get additional info for token
          declInfo = this.localTokensDeclarationInfo.get(tokenName);
        } else {
          // Check for Method-Local-tokens?
          findings.token = this.localPasmTokensByMethodName.getToken(tokenName);
          findings.relatedMethodName = this.localPasmTokensByMethodName.getMethodNameForToken(tokenName);
          if (findings.relatedMethodName) {
            findings.relatedMethodName = findings.relatedMethodName + "()";
          }
          if (findings.token) {
            // we have a LOCAL token!
            findings.tokenRawInterp = "Method-local: " + this._rememberdTokenString(tokenName, findings.token);
            findings.scope = "Local";
            // and get additional info for token
            declInfo = this.localTokensDeclarationInfo.get(tokenName);
          }
        }
      }
    }
    if (findings.token) {
      let details: ITokenInterpretation = this._interpretToken(findings.token, findings.scope, tokenName, declInfo);
      findings.isGoodInterp = details.isGoodInterp;
      findings.interpretation = details.interpretation;
      findings.scope = details.scope;
      findings.adjustedName = details.name;
      const bIsMethod: boolean = findings.token.type == "method";
      if (declInfo) {
        // and decorate with declaration line number
        findings.declarationLine = declInfo.lineIndex;
        if (declInfo.reference) {
          if (declInfo.isFilenameReference) {
            findings.relatedFilename = declInfo.reference;
          } else {
            findings.relatedObjectName = declInfo.reference;
          }
        }
        const bIsPublic: boolean = findings.token.modifiers.includes("static") ? false : true;
        if (bIsMethod) {
          const commentType: eCommentFilter = bIsPublic ? eCommentFilter.docCommentOnly : eCommentFilter.nondocCommentOnly;
          const nonBlankLineNbr: number = this._locateNonBlankLineAfter(findings.declarationLine + 1);
          findings.declarationComment = this.blockCommentMDFromLine(nonBlankLineNbr, commentType);
          this._logTokenMessage(
            `  -- FND-xxxTOK findings.signature=[${findings.signature}], findings.declarationComment=[${findings.declarationComment}], declInfo.comment=[${findings.relatedFilename}]`
          );
          // if no block doc comment then we can substitute a preceeding or trailing doc comment for method
          const canUseAlternateComment: boolean = bIsPublic == false || (bIsPublic == true && declInfo.isDocComment) ? true : false;
          if (!findings.declarationComment && canUseAlternateComment && declInfo.comment && declInfo.comment.length > 0) {
            // if we have single line doc comment and can use it, then do so!
            findings.declarationComment = declInfo.comment;
          }
          // NOTE: use fake signature comment instead when there Are params and declInfo doesn't describe them
          const haveDeclParams: boolean = findings.declarationComment && findings.declarationComment?.includes("@param") ? true : false;
          this._logTokenMessage(`  -- FND-DBGxxxTOK haveDeclParams=(${haveDeclParams})`);
          if (!haveDeclParams) {
            let fakeComment: string | undefined = this.fakeCommentMDFromLine(nonBlankLineNbr, commentType);
            if (fakeComment) {
              if (findings.declarationComment) {
                findings.declarationComment = findings.declarationComment + "<br><br>" + fakeComment;
              } else {
                findings.declarationComment = fakeComment;
              }
            }
          }
        } else {
          //  (this is in else so non-methods can get non-doc multiline preceeding blocks!)
          findings.declarationComment = this.blockCommentMDFromLine(findings.declarationLine - 1, eCommentFilter.nondocCommentOnly);
          // if no multi-line comment then ...(but don't use trailing comment when method!)
          if (!findings.declarationComment && declInfo.comment) {
            // if we have single line comment then use it!
            findings.declarationComment = declInfo.comment;
          }
        }
      }
      this._logTokenMessage(
        `  -- FND-xxxTOK line(${findings.declarationLine}) cmt=[${findings.declarationComment}], file=[${findings.relatedFilename}], obj=[${findings.relatedObjectName}]` +
          this._rememberdTokenString(tokenName, findings.token)
      );
    }
    return findings;
  }

  private _locateNonBlankLineAfter(lineNbr: number): number {
    let desiredNumber: number = lineNbr;
    const editor = vscode?.window.activeTextEditor!;
    const document = editor.document!;
    let currLine: string = "";
    do {
      currLine = document.lineAt(desiredNumber).text.trim();
      // if line is blank, point to next
      if (currLine.length == 0) {
        desiredNumber++;
      }
    } while (currLine.length == 0);
    return desiredNumber;
  }

  private _interpretToken(token: RememberedToken, scope: string, name: string, declInfo: RememberedTokenDeclarationInfo | undefined): ITokenInterpretation {
    this._logTokenMessage(`  -- _interpretToken() scope=[${scope}], name=[${name}], line#=[${declInfo?.lineIndex}]` + this._rememberdTokenString(name, token));
    let desiredInterp: ITokenInterpretation = { interpretation: "", scope: scope.toLowerCase(), name: name, isGoodInterp: true };
    desiredInterp.interpretation = "--type??";
    if (token?.type == "variable" && token?.modifiers.includes("readonly") && !declInfo?.isObjectReference) {
      // have non object reference
      desiredInterp.scope = "object public"; // not just global
      desiredInterp.interpretation = "32-bit constant";
    } else if (token?.type == "variable" && token?.modifiers.includes("readonly") && declInfo?.isObjectReference) {
      // have object interface constant
      desiredInterp.scope = "object interface"; // not just global
      desiredInterp.interpretation = "32-bit constant";
    } else if (token?.type == "debugDisplay") {
      desiredInterp.scope = "object"; // ignore for this (or move `object` here?)
      desiredInterp.interpretation = "user debug display";
    } else if (token?.type == "namespace") {
      desiredInterp.scope = "object"; // ignore for this (or move `object` here?)
      desiredInterp.interpretation = "named instance";
    } else if (token?.type == "variable") {
      desiredInterp.interpretation = "variable";
      if (token?.modifiers.includes("pasmInline")) {
        desiredInterp.scope = "method-local"; // ignore for this (or move `object` here?)
        desiredInterp.interpretation = "inline-pasm variable";
      } else if (token?.modifiers.includes("local")) {
        desiredInterp.scope = "method"; // ignore for this (or move `object` here?)
        desiredInterp.interpretation = "local variable";
      } else if (token?.modifiers.includes("instance")) {
        desiredInterp.scope = "object private"; // ignore for this (or move `object` here?)
        desiredInterp.interpretation = "instance " + desiredInterp.interpretation + " -VAR";
      } else {
        desiredInterp.scope = "object private"; // ignore for this (or move `object` here?)
        desiredInterp.interpretation = "shared " + desiredInterp.interpretation + " -DAT";
      }
    } else if (token?.type == "label") {
      if (token?.modifiers.includes("pasmInline")) {
        desiredInterp.scope = "method-local"; // ignore for this (or move `object` here?)
        desiredInterp.interpretation = "inline-pasm label";
      } else {
        desiredInterp.scope = "object private"; // not just global
        if (token?.modifiers.includes("static")) {
          desiredInterp.interpretation = "local pasm label";
        } else {
          desiredInterp.interpretation = "pasm label";
        }
      }
    } else if (token?.type == "returnValue") {
      desiredInterp.scope = "method"; // ignore for this (or method?)
      desiredInterp.interpretation = "return value";
    } else if (token?.type == "parameter") {
      desiredInterp.scope = "method"; // ignore for this (or method?)
      desiredInterp.interpretation = "parameter";
    } else if (token?.type == "enumMember") {
      desiredInterp.interpretation = "enum value";
    } else if (token?.type == "method") {
      desiredInterp.name = name + "()";
      desiredInterp.scope = "object";
      if (token?.modifiers.includes("static")) {
        desiredInterp.interpretation = "private method";
      } else {
        if (declInfo?.isObjectReference) {
          desiredInterp.scope = "object interface"; // not just global
        }
        desiredInterp.interpretation = "public method";
      }
    } else {
      desiredInterp.isGoodInterp = false;
    }
    return desiredInterp;
  }

  public isGlobalToken(tokenName: string): boolean {
    const foundStatus: boolean = this.globalTokens.hasToken(tokenName);
    return foundStatus;
  }

  public setGlobalToken(tokenName: string, token: RememberedToken, declarationLineNumber: number, declarationComment: string | undefined, reference?: string | undefined): void {
    if (!this.isGlobalToken(tokenName)) {
      this._logTokenMessage("  -- NEW-gloTOK " + this._rememberdTokenString(tokenName, token) + `, ln#${declarationLineNumber}, cmt=[${declarationComment}], ref=[${reference}]`);
      this.globalTokens.setToken(tokenName, token);
      // and remember declataion line# for this token
      this.globalTokensDeclarationInfo.set(tokenName, new RememberedTokenDeclarationInfo(declarationLineNumber - 1, declarationComment, reference));
    }
  }

  public getGlobalToken(tokenName: string): RememberedToken | undefined {
    var desiredToken: RememberedToken | undefined = this.globalTokens.getToken(tokenName);
    if (desiredToken != undefined) {
      // let's never return a declaration modifier! (somehow declaration creeps in to our list!??)
      //let modifiersNoDecl: string[] = this._modifiersWithout(desiredToken.modifiers, "declaration");
      let modifiersNoDecl: string[] = desiredToken.modifiersWithout("declaration");
      desiredToken = new RememberedToken(desiredToken.type, modifiersNoDecl);
      this._logTokenMessage("  -- FND-gloTOK " + this._rememberdTokenString(tokenName, desiredToken));
    }
    return desiredToken;
  }

  public isLocalToken(tokenName: string): boolean {
    const foundStatus: boolean = this.localTokensByMethod.hasToken(tokenName);
    return foundStatus;
  }

  public isLocalTokenForMethod(methodName: string, tokenName: string): boolean {
    const foundStatus: boolean = this.localTokensByMethod.hasTokenForMethod(methodName, tokenName);
    return foundStatus;
  }

  public setLocalTokenForMethod(methodName: string, tokenName: string, token: RememberedToken, declarationLineNumber: number, declarationComment: string | undefined): void {
    if (!this.isLocalTokenForMethod(methodName, tokenName)) {
      this._logTokenMessage(`  -- NEW-locTOK ln#${declarationLineNumber} method=[${methodName}], ` + this._rememberdTokenString(tokenName, token) + `, cmt=[${declarationComment}]`);
      this.localTokensByMethod.setTokenForMethod(methodName, tokenName, token);
      // and remember declataion line# for this token
      this.localTokensDeclarationInfo.set(tokenName, new RememberedTokenDeclarationInfo(declarationLineNumber - 1, declarationComment));
    }
  }

  public getLocalTokenForLine(tokenName: string, lineNbr: number): RememberedToken | undefined {
    let desiredToken: RememberedToken | undefined = undefined;
    this._logTokenMessage(`  -- SRCH-locTOK ln#${lineNbr} tokenName=[${tokenName}]`);
    const methodName: string | undefined = this._getMethodNameForLine(lineNbr);
    if (methodName) {
      desiredToken = this.localTokensByMethod.getTokenForMethod(methodName, tokenName);
      if (desiredToken != undefined) {
        this._logTokenMessage(`  -- FND-locTOK ln#${lineNbr} method=[${methodName}], ` + this._rememberdTokenString(tokenName, desiredToken));
      } else {
        this._logTokenMessage(`  -- FAILED to FND-locTOK ln#${lineNbr} method=[${methodName}], ` + tokenName);
      }
    } else {
      this._logTokenMessage(`  -- FAILED to FND-locTOK no method found for ln#${lineNbr} token=[${tokenName}]`);
    }
    return desiredToken;
  }

  public startMethod(methodName: string, lineNbr: number): void {
    // starting a new method remember the name and assoc the line number
    if (this.currMethodName) {
      this._logTokenMessage(`  -- FAILED close prior SPAN method=[${methodName}], line#=(${this.currMethodStartLineNbr})`);
    }
    this.currMethodName = methodName;
    this.currMethodStartLineNbr = lineNbr;
  }

  public endPossibleMethod(lineNbr: number): void {
    // possibly ending a method if one was started, end it, else ignore this
    if (this.currMethodName) {
      const spanInfo: IMethodSpan = { startLineNbr: this.currMethodStartLineNbr, endLineNbr: lineNbr };
      // FIXME: add check for collision in method name!!!
      this.methodSpanInfo.set(this.currMethodName, spanInfo);
      this._logTokenMessage(`  -- NEW-locTOK method=[${this.currMethodName}], span=[${spanInfo.startLineNbr}, ${spanInfo.endLineNbr}]`);
    }
    // now clear in progress
    this.currMethodName = undefined;
    this.currMethodStartLineNbr = 0;
  }

  private _getMethodNameForLine(lineNbr: number): string | undefined {
    let desiredMethodName: string | undefined = undefined;
    if (this.methodSpanInfo.size > 0) {
      for (const [currMethodName, currSpan] of this.methodSpanInfo) {
        this._logTokenMessage(`  -- locTOK CHK method=[${currMethodName}], span=[${currSpan.startLineNbr}, ${currSpan.endLineNbr}]`);
        if (lineNbr >= currSpan.startLineNbr && lineNbr <= currSpan.endLineNbr) {
          desiredMethodName = currMethodName;
          break;
        }
      }
    }
    this._logTokenMessage(`  -- locTOK _getMethodNameForLine(${lineNbr}) = method=[${desiredMethodName}]`);
    return desiredMethodName;
  }

  // -------------------------------------------------------------------------
  // method-scoped name token handling...
  public clearLocalPAsmTokensForMethod(methodName: string) {
    // we're studying a new method forget everything local!
    this.localPasmTokensByMethodName.clearForMethod(methodName);
  }

  public hasLocalPasmTokenListForMethod(methodName: string): boolean {
    const mapExistsStatus: boolean = this.localPasmTokensByMethodName.hasMethod(methodName);
    return mapExistsStatus;
  }

  public hasLocalPasmToken(tokenName: string): boolean {
    let tokenExistsStatus: boolean = this.localPasmTokensByMethodName.hasToken(tokenName);
    return tokenExistsStatus;
  }

  public hasLocalPAsmTokenForMethod(methodName: string, tokenName: string): boolean {
    let foundStatus: boolean = this.localPasmTokensByMethodName.hasTokenForMethod(methodName, tokenName);
    return foundStatus;
  }

  public setLocalPAsmTokenForMethod(methodName: string, tokenName: string, token: RememberedToken, declarationLineNumber: number, declarationComment: string | undefined): void {
    if (this.hasLocalPAsmTokenForMethod(methodName, tokenName)) {
      // WARNING attempt to set again
    } else {
      // set new one!
      this.localPasmTokensByMethodName.setTokenForMethod(methodName, tokenName, token);
      // and remember declataion line# for this token
      this.localTokensDeclarationInfo.set(tokenName, new RememberedTokenDeclarationInfo(declarationLineNumber - 1, declarationComment));
      const newToken = this.localPasmTokensByMethodName.getTokenForMethod(methodName, tokenName);
      if (newToken) {
        this._logTokenMessage("  -- NEW-lpTOK method=" + methodName + ": " + this._rememberdTokenString(tokenName, newToken));
      }
    }
  }

  public getLocalPAsmTokenForMethod(methodName: string, tokenName: string): RememberedToken | undefined {
    let desiredToken: RememberedToken | undefined = this.localPasmTokensByMethodName.getTokenForMethod(methodName, tokenName);
    if (desiredToken) {
      this._logTokenMessage("  -- FND-lpTOK method=" + methodName + ": " + this._rememberdTokenString(tokenName, desiredToken));
    }
    return desiredToken;
  }

  //
  // PRIVATE (Utility) Methods
  //
  private _logTokenMessage(message: string): void {
    if (this.bLogEnabled && this.outputChannel != undefined) {
      // Write to output window.
      this.outputChannel.appendLine(message);
    }
  }

  private _rememberdTokenString(tokenName: string, aToken: RememberedToken | undefined): string {
    let desiredInterp: string = " -- token=[len:" + tokenName.length + " [" + tokenName + "](undefined)";
    if (aToken != undefined) {
      desiredInterp = " -- token=[len:" + tokenName.length + " [" + tokenName + "](" + aToken.type + "[" + aToken.modifiers + "])]";
    }
    return desiredInterp;
  }

  // ----------------------------------------------------------------------------
  //  P2 Special handling for Debug() Displays
  //
  // map of debug-display-user-name to:
  //  export interface IDebugDisplayInfo {
  //    displayTypeString: string;
  //    userName: string;
  //    lineNbr: number;
  //    eDisplayType: eDebugDisplayType;
  //  }

  private debugDisplays = new Map<string, IDebugDisplayInfo>();

  public getDebugDisplayEnumForType(typeName: string): eDebugDisplayType {
    let desiredType: eDebugDisplayType = eDebugDisplayType.Unknown;
    if (displayEnumByTypeName.has(typeName.toLowerCase())) {
      const possibleType: eDebugDisplayType | undefined = displayEnumByTypeName.get(typeName.toLowerCase());
      desiredType = possibleType || eDebugDisplayType.Unknown;
    }
    this._logTokenMessage("  DDsply getDebugDisplayEnumForType(" + typeName + ") = enum(" + desiredType + "), " + this.getNameForDebugDisplayEnum(desiredType));
    return desiredType;
  }

  public setUserDebugDisplay(typeName: string, userName: string, lineNbr: number): void {
    const nameKey: string = userName.toLowerCase();
    this._logTokenMessage("  DDsply _setUserDebugDisplay(" + typeName + ", " + userName + ", li#" + lineNbr + ")");
    if (!this.isKnownDebugDisplay(userName)) {
      let eType: eDebugDisplayType = this.getDebugDisplayEnumForType(typeName);
      let displayInfo: IDebugDisplayInfo = { displayTypeString: typeName, userName: userName, lineNbr: lineNbr, eDisplayType: eType };
      this.debugDisplays.set(nameKey, displayInfo);
      //this._logTokenMessage("  -- DDsply " + userName.toLowerCase() + "=[" + eDisplayType + " : " + typeName.toLowerCase() + "]");
    } else {
      this._logTokenMessage("ERROR: DDsply setUserDebugDisplay() display exists [" + userName + "]");
    }
  }

  public getDebugDisplayEnumForUserName(possibleUserName: string): eDebugDisplayType {
    const nameKey: string = possibleUserName.toLowerCase();
    let desiredEnumValue: eDebugDisplayType = eDebugDisplayType.Unknown;
    if (this.isKnownDebugDisplay(possibleUserName)) {
      const possibleInfo: IDebugDisplayInfo | undefined = this.debugDisplays.get(nameKey);
      if (possibleInfo) {
        desiredEnumValue = possibleInfo.eDisplayType;
      }
    }
    return desiredEnumValue;
  }

  public getDebugDisplayInfoForUserName(possibleUserName: string): IDebugDisplayInfo {
    const nameKey: string = possibleUserName.toLowerCase();
    let possibleInfo: IDebugDisplayInfo = { displayTypeString: "", userName: "", lineNbr: 0, eDisplayType: eDebugDisplayType.Unknown };
    if (this.isKnownDebugDisplay(possibleUserName)) {
      const infoFound: IDebugDisplayInfo | undefined = this.debugDisplays.get(nameKey);
      if (infoFound) {
        possibleInfo = infoFound;
      }
    }
    return possibleInfo;
  }

  public getNameForDebugDisplayEnum(eDisplayType: eDebugDisplayType): string {
    let desiredName: string = "?no-value-in-map?";
    for (let [idString, eValue] of displayEnumByTypeName.entries()) {
      if (eValue === eDisplayType) {
        desiredName = idString;
        break;
      }
    }
    this._logTokenMessage("  DDsply getNameForDebugDisplayEnum(enum: " + eDisplayType + ") = " + desiredName);
    return desiredName;
  }

  public isKnownDebugDisplay(possibleUserName: string): boolean {
    const nameKey: string = possibleUserName.toLowerCase();
    const foundStatus: boolean = this.debugDisplays.has(nameKey);
    this._logTokenMessage("  DDsply _isKnownDebugDisplay(" + possibleUserName + ") = " + foundStatus);
    return foundStatus;
  }

  public clearDebugDisplays() {
    // clear our map of displays found
    this.debugDisplays.clear();
  }
}

// ----------------------------------------------------------------------------
//  Global or Local tokens
//   CLASS TokenSet
//
export class TokenSet {
  public constructor(idString: string, isLogging: boolean, logHandle: vscode.OutputChannel | undefined) {
    this.bLogEnabled = isLogging;
    this.outputChannel = logHandle;
    this.id = idString;
    this._logTokenMessage(`* ${this.id} ready`);
  }

  private id: string = "";
  private tokenSet = new Map<string, RememberedToken>();
  private outputChannel: vscode.OutputChannel | undefined = undefined;
  private bLogEnabled: boolean = false;

  private _logTokenMessage(message: string): void {
    if (this.bLogEnabled && this.outputChannel != undefined) {
      // Write to output window.
      this.outputChannel.appendLine(message);
    }
  }

  *[Symbol.iterator]() {
    yield* this.tokenSet;
  }

  public entries() {
    return Array.from(this.tokenSet.entries());
  }

  public clear(): void {
    this.tokenSet.clear();
    this._logTokenMessage(`* ${this.id} clear() now ` + this.length() + " tokens");
  }

  public length(): number {
    // return count of token names in list
    return this.tokenSet.size;
  }

  public rememberdTokenString(tokenName: string, aToken: RememberedToken | undefined): string {
    let desiredInterp: string = "  -- token=[len:" + tokenName.length + " [" + tokenName + "](undefined)";
    if (aToken != undefined) {
      desiredInterp = "  -- token=[len:" + tokenName.length + " [" + tokenName + "](" + aToken.type + "[" + aToken.modifiers + "])]";
    }
    return desiredInterp;
  }

  public hasToken(tokenName: string): boolean {
    let foundStatus: boolean = false;
    if (tokenName.length > 0) {
      foundStatus = this.tokenSet.has(tokenName.toLowerCase());
      if (foundStatus) {
        this._logTokenMessage(`* ${this.id} [` + tokenName + "] found: " + foundStatus);
      }
    }
    return foundStatus;
  }

  public setToken(tokenName: string, token: RememberedToken): void {
    const desiredTokenKey: string = tokenName.toLowerCase();
    if (tokenName.length > 0 && !this.hasToken(tokenName)) {
      this.tokenSet.set(desiredTokenKey, token);
      const currCt: number = this.length();
      this._logTokenMessage(`* ${this.id} #${currCt}: ` + this.rememberdTokenString(tokenName, token));
    }
  }

  public getToken(tokenName: string): RememberedToken | undefined {
    const desiredTokenKey: string = tokenName.toLowerCase();
    var desiredToken: RememberedToken | undefined = this.tokenSet.get(desiredTokenKey);
    if (desiredToken != undefined) {
      // let's never return a declaration modifier! (somehow "declaration" creeps in to our list!??)
      //let modifiersNoDecl: string[] = this._modifiersWithout(desiredToken.modifiers, "declaration");
      let modifiersNoDecl: string[] = desiredToken.modifiersWithout("declaration");
      desiredToken = new RememberedToken(desiredToken.type, modifiersNoDecl);
    }
    return desiredToken;
  }
}

// ----------------------------------------------------------------------------
//  local tokens within method
//   CLASS NameScopedTokenSet
//
export class NameScopedTokenSet {
  public constructor(idString: string, isLogging: boolean, logHandle: vscode.OutputChannel | undefined) {
    this.bLogEnabled = isLogging;
    this.outputChannel = logHandle;
    this.id = idString;
    this._logTokenMessage(`* ${this.id} ready`);
  }

  private id: string = "";
  private scopedTokenSet = new Map<string, TokenSet>();
  private outputChannel: vscode.OutputChannel | undefined = undefined;
  private bLogEnabled: boolean = false;

  private _logTokenMessage(message: string): void {
    if (this.bLogEnabled && this.outputChannel != undefined) {
      // Write to output window.
      this.outputChannel.appendLine(message);
    }
  }

  *[Symbol.iterator]() {
    yield* this.scopedTokenSet;
  }

  public entries() {
    return Array.from(this.scopedTokenSet.entries());
  }

  public keys() {
    return this.scopedTokenSet.keys();
  }

  public clear(): void {
    this.scopedTokenSet.clear();
    this._logTokenMessage(`* ${this.id} clear() now ` + this.length() + " tokens");
  }

  public clearForMethod(methodName: string) {
    const desiredMethodKey = methodName.toLowerCase();
    let tokenSet = this._getMapForMethod(desiredMethodKey);
    if (tokenSet) {
      tokenSet.clear();
      this._logTokenMessage(`* ${this.id} clearForMethod(${desiredMethodKey}) now ` + tokenSet.length() + " tokens");
    }
  }

  public length(): number {
    // return count of method names in list
    return this.scopedTokenSet.size;
  }

  public hasMethod(methodName: string): boolean {
    let foundStatus: boolean = false;
    if (methodName.length > 0) {
      const desiredMethodKey = methodName.toLowerCase();
      foundStatus = this.scopedTokenSet.has(desiredMethodKey);
      //if (foundStatus) {
      //  this._logTokenMessage(`* ${this.id} [` + desiredMethodKey + "] found: " + foundStatus);
      //}
    }
    return foundStatus;
  }

  public hasToken(tokenName: string): boolean {
    const desiredTokenKey = tokenName.toLowerCase();
    let tokenExistsStatus: boolean = false;
    for (let methodKey of this.scopedTokenSet.keys()) {
      if (this.hasTokenForMethod(methodKey, desiredTokenKey)) {
        tokenExistsStatus = true;
        break;
      }
    }
    return tokenExistsStatus;
  }

  public hasTokenForMethod(methodName: string, tokenName: string): boolean {
    let foundStatus: boolean = false;
    const desiredMethodKey = methodName.toLowerCase();
    const desiredTokenKey = tokenName.toLowerCase();
    const methodLocalsTokenSet = this._getMapForMethod(desiredMethodKey);
    if (methodLocalsTokenSet) {
      foundStatus = methodLocalsTokenSet.hasToken(desiredTokenKey);
    }
    return foundStatus;
  }

  public setTokenForMethod(methodName: string, tokenName: string, token: RememberedToken): void {
    let tokenSet: TokenSet | undefined = undefined;
    const desiredMethodKey = methodName.toLowerCase();
    const desiredTokenKey = tokenName.toLowerCase();
    if (!this.hasMethod(desiredMethodKey)) {
      tokenSet = new TokenSet(`lpTOK-${desiredMethodKey}`, this.bLogEnabled, this.outputChannel);
      this.scopedTokenSet.set(desiredMethodKey, tokenSet);
    } else {
      tokenSet = this._getMapForMethod(desiredMethodKey);
    }
    if (tokenSet && tokenSet.hasToken(desiredTokenKey)) {
      this._logTokenMessage(`ERROR attempt to redefine ${desiredTokenKey} in method ${desiredMethodKey} as: ` + this._rememberdTokenString(tokenName, token));
    } else {
      if (tokenSet) {
        this._logTokenMessage("  -- NEW-lpTOK " + desiredTokenKey + "=[" + token.type + "[" + token.modifiers + "]]");
        tokenSet.setToken(desiredTokenKey, token);
      }
    }
  }

  public getToken(tokenName: string): RememberedToken | undefined {
    let desiredToken: RememberedToken | undefined = undefined;
    const desiredTokenKey = tokenName.toLowerCase();
    let tokenExistsStatus: boolean = false;
    for (let methodKey of this.scopedTokenSet.keys()) {
      if (this.hasTokenForMethod(methodKey, desiredTokenKey)) {
        desiredToken = this.getTokenForMethod(methodKey, desiredTokenKey);
        break;
      }
    }
    return desiredToken;
  }

  public getMethodNameForToken(tokenName: string): string | undefined {
    const desiredTokenKey = tokenName.toLowerCase();
    let desiredMethodName: string | undefined = undefined;
    for (let methodKey of this.scopedTokenSet.keys()) {
      if (this.hasTokenForMethod(methodKey, desiredTokenKey)) {
        desiredMethodName = methodKey;
        break;
      }
    }
    return desiredMethodName;
  }

  public getTokenForMethod(methodName: string, tokenName: string): RememberedToken | undefined {
    let desiredToken: RememberedToken | undefined = undefined;
    const desiredMethodKey: string = methodName.toLowerCase();
    const desiredTokenKey: string = tokenName.toLowerCase();
    if (this.hasMethod(desiredMethodKey)) {
      const methodLocalsTokenSet = this._getMapForMethod(desiredMethodKey);
      if (methodLocalsTokenSet) {
        desiredToken = methodLocalsTokenSet.getToken(desiredTokenKey);
        if (desiredToken) {
          this._logTokenMessage("  -- FND-lpTOK " + this._rememberdTokenString(tokenName, desiredToken));
        }
      } else {
        this._logTokenMessage(`  -- FND - lpTOK gtfm() no such nethodName = [${methodName}]`);
      }
    } else {
      this._logTokenMessage(`  -- FND - lpTOK gtfm() no TokenSet for methodName = [${methodName}]`);
    }
    return desiredToken;
  }

  private _rememberdTokenString(tokenName: string, aToken: RememberedToken | undefined): string {
    let desiredInterp: string = "  -- LP token=[len:" + tokenName.length + " [" + tokenName + "](undefined)";
    if (aToken != undefined) {
      desiredInterp = "  -- LP token=[len:" + tokenName.length + " [" + tokenName + "](" + aToken.type + "[" + aToken.modifiers + "])]";
    }
    return desiredInterp;
  }

  private _getMapForMethod(methodName: string): TokenSet | undefined {
    let desiredTokenSet: TokenSet | undefined = undefined;
    const desiredMethodKey: string = methodName.toLowerCase();
    if (this.hasMethod(desiredMethodKey)) {
      desiredTokenSet = this.scopedTokenSet.get(desiredMethodKey);
    }
    return desiredTokenSet;
  }
}

// ----------------------------------------------------------------------------
//  This is the basic token type we report to VSCode
//   CLASS RememberedToken

export class RememberedToken {
  _type: string;
  _modifiers: string[] = [];
  constructor(type: string, modifiers: string[] | undefined) {
    this._type = type;
    if (modifiers != undefined) {
      this._modifiers = modifiers;
    }
  }
  get type(): string {
    return this._type;
  }
  get modifiers(): string[] {
    return this._modifiers;
  }

  // variable modifier fix ups

  public modifiersWith(newModifier: string): string[] {
    // add modification attribute
    var updatedModifiers: string[] = this._modifiers;
    if (!updatedModifiers.includes(newModifier)) {
      updatedModifiers.push(newModifier);
    }
    return updatedModifiers;
  }

  public modifiersWithout(unwantedModifier: string): string[] {
    //  remove modification attribute
    var updatedModifiers: string[] = [];
    for (var idx = 0; idx < this._modifiers.length; idx++) {
      var possModifier: string = this._modifiers[idx];
      if (possModifier !== unwantedModifier) {
        updatedModifiers.push(possModifier);
      }
    }
    return updatedModifiers;
  }
}
// ----------------------------------------------------------------------------
//  This is the structure we use for tracking Declaration Info for a token
//   CLASS RememberedTokenDeclarationInfo
export class RememberedTokenDeclarationInfo {
  private _type: eCommentType = eCommentType.Unknown;
  private _declLineIndex: number;
  private _declcomment: string | undefined = undefined;
  private _reference: string | undefined = undefined;

  constructor(declarationLinIndex: number, declarationComment: string | undefined, reference?: string | undefined) {
    this._declLineIndex = declarationLinIndex;
    if (declarationComment) {
      if (declarationComment.startsWith("''")) {
        this._type = eCommentType.singleLineDocComment;
        this._declcomment = declarationComment.substring(2).trim();
      } else if (declarationComment.startsWith("'")) {
        this._type = eCommentType.singleLineComment;
        this._declcomment = declarationComment.substring(1).trim();
      } else {
        // leaving type as UNKNOWN
        this._declcomment = declarationComment.trim();
      }
    }
    if (typeof reference !== "undefined" && reference != undefined) {
      this._reference = reference;
    }
  }

  get isDocComment(): boolean {
    // Return the array of comment lines for this block
    return this._type == eCommentType.multiLineDocComment || this._type == eCommentType.singleLineDocComment;
  }

  get lineIndex(): number {
    return this._declLineIndex;
  }

  get comment(): string | undefined {
    return this._declcomment;
  }

  get reference(): string | undefined {
    return this._reference;
  }

  get isFilenameReference(): boolean {
    let isFilenameStatus: boolean = false;
    if (this.reference && this._reference?.includes('"')) {
      isFilenameStatus = true;
    }
    return isFilenameStatus;
  }

  get isObjectReference(): boolean {
    let isObjectStatus: boolean = false;
    if (this.reference && !this._reference?.includes('"')) {
      isObjectStatus = true;
    }
    return isObjectStatus;
  }
}

// ----------------------------------------------------------------------------
//  This is the structure we use for tracking multiline comments
//   CLASS RememberedComment
export enum eCommentType {
  Unknown = 0,
  singleLineComment,
  singleLineDocComment,
  multiLineComment,
  multiLineDocComment,
}

export class RememberedComment {
  _type: eCommentType = eCommentType.Unknown;
  _lines: string[] = [];
  _1stLine: number = 0;
  _lastLine: number = 0;
  constructor(type: eCommentType, lineNumber: number, firstLine: string) {
    this._1stLine = lineNumber;
    this._type = type;
    // remove comment from first line
    let trimmedLine: string = firstLine;
    if (this._type == eCommentType.multiLineDocComment) {
      if (trimmedLine.startsWith("{{")) {
        trimmedLine = trimmedLine.substring(2);
      }
    } else if (this._type == eCommentType.multiLineComment) {
      if (trimmedLine.startsWith("{")) {
        trimmedLine = trimmedLine.substring(1);
      }
    }
    if (trimmedLine.length > 0) {
      this._lines = [trimmedLine];
    }
  }

  get lines(): string[] {
    // Return the array of comment lines for this block
    return this._lines;
  }

  get isDocComment(): boolean {
    // Return the array of comment lines for this block
    return this._type == eCommentType.multiLineDocComment || this._type == eCommentType.singleLineDocComment;
  }

  get lineCount(): number {
    // Return the count of comment lines for this block
    return this._lines.length;
  }

  get isBlankLine(): boolean {
    // Return T/F where T means there is no remaining text after begin/end markers are removed
    return this._lines.length == 0 || (this.lines.length == 1 && this._lines[0].length == 0);
  }

  public commentAsMarkDown(): string | undefined {
    // Return the markdown for this block comment
    let linesAsComment: string | undefined = undefined;
    let tempLines: string[] = [];
    // if keywords are found in comment then specially wrap the word following each keyword
    if (this.lineCount > 0) {
      for (let idx = 0; idx < this.lines.length; idx++) {
        const currLine = this.lines[idx];
        const lineParts = currLine.split(" ");
        let findIndex = lineParts.indexOf("@param");
        let nameItem: string | undefined = undefined;
        if (findIndex != -1 && findIndex < lineParts.length - 1) {
          nameItem = lineParts[findIndex + 1];
        } else {
          findIndex = lineParts.indexOf("@returns");
          if (findIndex != -1 && findIndex < lineParts.length - 1) {
            nameItem = lineParts[findIndex + 1];
          } else {
            findIndex = lineParts.indexOf("@local");
            if (findIndex != -1 && findIndex < lineParts.length - 1) {
              nameItem = lineParts[findIndex + 1];
            }
          }
        }
        if (nameItem) {
          // now wrap the name in single back ticks
          const originameItem: string = nameItem;
          nameItem = nameItem.replace("`", "").replace("`", "");
          const finishedLine: string = currLine.replace(originameItem, "`" + nameItem + "`");
          tempLines[idx] = finishedLine;
        } else {
          tempLines[idx] = currLine;
        }
      }
      linesAsComment = tempLines.join("<br>");
    }
    return linesAsComment;
  }

  public span(): vscode.Range {
    // return the recorded line indexes (start,end) - span of the comment block
    return new vscode.Range(new vscode.Position(this._1stLine, 0), new vscode.Position(this._lastLine, 0));
  }

  public appendLine(line: string) {
    // just save this line
    this._lines.push(line);
  }

  public appendLastLine(lineNumber: number, line: string) {
    // remove comment from last line then save remainder and line number
    this._lastLine = lineNumber;
    let trimmedLine: string = line;
    let matchLocn: number = 0;
    if (this._type == eCommentType.multiLineDocComment) {
      matchLocn = trimmedLine.indexOf("}}");
      if (matchLocn != -1) {
        if (matchLocn == 0) {
          trimmedLine = trimmedLine.substring(2);
        } else {
          const leftEdge = trimmedLine.substring(0, matchLocn - 1);
          trimmedLine = leftEdge + trimmedLine.substring(matchLocn + 2);
        }
      }
    } else if (this._type == eCommentType.multiLineComment) {
      matchLocn = trimmedLine.indexOf("}");
      if (matchLocn != -1) {
        if (matchLocn == 0) {
          trimmedLine = trimmedLine.substring(2);
        } else {
          const leftEdge = trimmedLine.substring(0, matchLocn - 1);
          trimmedLine = leftEdge + trimmedLine.substring(matchLocn + 2);
        }
      }
    }
    if (trimmedLine.length > 0) {
      this._lines.push(trimmedLine);
    }
    for (let idx = 0; idx < this._lines.length; idx++) {
      let trimmedLine = this._lines[idx].trim();
      if (trimmedLine.startsWith("''")) {
        trimmedLine = trimmedLine.substring(2);
      } else if (trimmedLine.startsWith("'")) {
        trimmedLine = trimmedLine.substring(1);
      }
      this._lines[idx] = trimmedLine;
    }
    this._clearLinesIfAllBlank();
  }

  public closeAsSingleLineBlock(lineNumber: number) {
    // block of single line comments, remove comment-end from the line then save remainder if any
    this._lastLine = lineNumber;
    for (let idx = 0; idx < this._lines.length; idx++) {
      let trimmedLine = this._lines[idx].trim();
      if (trimmedLine.startsWith("''")) {
        trimmedLine = trimmedLine.substring(2);
      } else if (trimmedLine.startsWith("'")) {
        trimmedLine = trimmedLine.substring(1);
      }
      this._lines[idx] = trimmedLine;
    }
    this._clearLinesIfAllBlank();
  }

  public closeAsSingleLine() {
    // only single line, remove comment-end from the line then save remainder if any
    this._lastLine = this._1stLine;
    let trimmedLine: string = this._lines[0];
    let matchLocn: number = 0;
    if (this._type == eCommentType.multiLineDocComment) {
      matchLocn = trimmedLine.indexOf("}}");
      if (matchLocn != -1) {
        if (matchLocn == 0) {
          trimmedLine = trimmedLine.substring(2);
        } else {
          const leftEdge = trimmedLine.substring(0, matchLocn - 1);
          trimmedLine = leftEdge + trimmedLine.substring(matchLocn + 2);
        }
      }
    } else if (this._type == eCommentType.multiLineComment) {
      matchLocn = trimmedLine.indexOf("}");
      if (matchLocn != -1) {
        if (matchLocn == 0) {
          trimmedLine = trimmedLine.substring(2);
        } else {
          const leftEdge = trimmedLine.substring(0, matchLocn - 1);
          trimmedLine = leftEdge + trimmedLine.substring(matchLocn + 2);
        }
      }
    }
    if (trimmedLine.length > 0) {
      this._lines = [trimmedLine];
    } else {
      this._lines = [];
    }
  }

  public includesLine(lineNumber: number): boolean {
    // return T/F where T means the lineNumber is within the comment
    const commentSpan: vscode.Range = this.span();
    const inCommentStatus: boolean = lineNumber >= commentSpan.start.line && lineNumber <= commentSpan.end.line;
    return inCommentStatus;
  }

  public spanString(): string {
    const commentSpan: vscode.Range = this.span();
    const startLine = commentSpan.start.line + 1;
    const endLine = commentSpan.end.line + 1;
    let typeString: string = "??BlockComment??";
    if (this._type == eCommentType.singleLineComment) {
      typeString = "singleLineCommentBlock";
    } else if (this._type == eCommentType.singleLineDocComment) {
      typeString = "singleLineDocCommentBlock";
    } else if (this._type == eCommentType.multiLineComment) {
      typeString = "multiLineCommentBlock";
    } else if (this._type == eCommentType.multiLineDocComment) {
      typeString = "multiLineDocCommentBlock";
    }
    const interpString: string = `[${typeString}] lines ${startLine}-${endLine}`;
    return interpString;
  }

  private _clearLinesIfAllBlank() {
    // emtpy our line aray if it's really nothing worthwhile
    let bHaveNonBlank: boolean = false;
    for (let idx = 0; idx < this._lines.length; idx++) {
      let currLine = this._lines[idx];
      if (currLine.length > 0) {
        bHaveNonBlank = true;
        break;
      }
    }
    if (!bHaveNonBlank) {
      this._lines = [];
    }
  }
}
