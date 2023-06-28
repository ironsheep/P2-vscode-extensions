"use strict";
import { IncomingMessage } from "http";
// src/spin2.semantic.findings.ts

import * as vscode from "vscode";

// ============================================================================
//  this file contains objects we use in tracking symbol use and declaration
//

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
  private localTokens;
  private globalTokensDeclarationInfo;
  private localTokensDeclarationInfo;
  private localPasmTokensByMethodName;
  private blockComments: RememberedComment[] = [];

  private outputChannel: vscode.OutputChannel | undefined = undefined;
  private bLogEnabled: boolean = false;

  public constructor(isLogging: boolean, logHandle: vscode.OutputChannel | undefined) {
    this.bLogEnabled = isLogging;
    this.outputChannel = logHandle;
    this._logTokenMessage("* Global, Local, MethodScoped Token repo's ready");
    this.globalTokens = new TokenSet("gloTOK", isLogging, logHandle);
    this.localTokens = new TokenSet("locTOK", isLogging, logHandle);
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
    this.localTokens.clear();
    this.localPasmTokensByMethodName.clear();
    this.blockComments = [];
  }

  public recordComment(comment: RememberedComment) {
    this.blockComments.push(comment);
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

  public blockCommentMDFromLine(lineNumber: number, filter: eCommentFilter): string | undefined {
    let desiredComment: string | undefined = undefined;
    if (this.blockComments.length > 0) {
      for (let blockComment of this.blockComments) {
        if (blockComment.includesLine(lineNumber)) {
          if (blockComment.isDocComment) {
            if (filter == eCommentFilter.allComments || filter == eCommentFilter.docCommentOnly) {
              desiredComment = blockComment.commentAsMarkDown();
            }
          } else {
            if (filter == eCommentFilter.allComments || filter == eCommentFilter.nondocCommentOnly) {
              desiredComment = blockComment.commentAsMarkDown();
            }
          }
          break;
        }
      }
    }
    return desiredComment;
  }

  public isKnownToken(tokenName: string): boolean {
    const foundStatus: boolean = this.isGlobalToken(tokenName) || this.isLocalToken(tokenName) || this.hasLocalPasmToken(tokenName) ? true : false;
    return foundStatus;
  }

  public getTokenWithDescription(tokenName: string): ITokenDescription {
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
      relatedFilename: undefined,
      relatedObjectName: undefined,
      relatedMethodName: undefined,
    };
    // do we have a token??
    let declInfo: RememberedTokenDeclarationInfo | undefined = undefined;
    if (this.isKnownToken(tokenName)) {
      findings.found = true;
      findings.token = this.getGlobalToken(tokenName);
      if (findings.token) {
        // we have a GLOBAL token!
        findings.tokenRawInterp = "Global: " + this._rememberdTokenString(tokenName, findings.token);
        findings.scope = "Global";
        // and get additional info for token
        declInfo = this.globalTokensDeclarationInfo.get(tokenName);
      } else {
        findings.token = this.getLocalToken(tokenName);
        if (findings.token) {
          // we have a LOCAL token!
          findings.tokenRawInterp = "Local: " + this._rememberdTokenString(tokenName, findings.token);
          findings.scope = "Local";
          // and get additional info for token
          declInfo = this.localTokensDeclarationInfo.get(tokenName);
        } else {
          // Handle Method-Local-tokens?
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
        const bIsMethod: boolean = findings.token.type == "method";
        const bIsPublic: boolean = findings.token.modifiers.includes("static") ? false : true;
        if (bIsMethod) {
          const commentType: eCommentFilter = bIsPublic ? eCommentFilter.docCommentOnly : eCommentFilter.nondocCommentOnly;
          findings.declarationComment = this.blockCommentMDFromLine(findings.declarationLine + 1, commentType);
          // if no block doc comment then we can substitute a preceeding or trailing doc comment for method
          const canUseAlternateComment: boolean = bIsPublic == false || (bIsPublic == true && declInfo.isDocComment) ? true : false;
          if (!findings.declarationComment && canUseAlternateComment) {
            // if we have single line doc comment and can use it, then do so!
            findings.declarationComment = declInfo.comment;
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

  private _interpretToken(token: RememberedToken, scope: string, name: string, declInfo: RememberedTokenDeclarationInfo | undefined): ITokenInterpretation {
    let desiredInterp: ITokenInterpretation = { interpretation: "", scope: scope.toLowerCase(), name: name, isGoodInterp: true };
    desiredInterp.interpretation = "--type??";
    if (token?.type == "variable" && token?.modifiers.includes("readonly") && !declInfo?.isObjectReference) {
      // have non object reference
      desiredInterp.scope = "object public"; // not just global
      desiredInterp.interpretation = "constant (32-bit)";
    } else if (token?.type == "variable" && token?.modifiers.includes("readonly") && declInfo?.isObjectReference) {
      // have object interface constant
      desiredInterp.scope = "object interface"; // not just global
      desiredInterp.interpretation = "constant (32-bit)";
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
    const foundStatus: boolean = this.localTokens.hasToken(tokenName);
    return foundStatus;
  }

  public setLocalToken(tokenName: string, token: RememberedToken, declarationLineNumber: number, declarationComment: string | undefined): void {
    if (!this.isLocalToken(tokenName)) {
      this._logTokenMessage("  -- NEW-locTOK " + this._rememberdTokenString(tokenName, token) + `, ln#${declarationLineNumber}, cmt=[${declarationComment}]`);
      this.localTokens.setToken(tokenName, token);
      // and remember declataion line# for this token
      this.localTokensDeclarationInfo.set(tokenName, new RememberedTokenDeclarationInfo(declarationLineNumber - 1, declarationComment));
    }
  }

  public getLocalToken(tokenName: string): RememberedToken | undefined {
    const desiredToken: RememberedToken | undefined = this.localTokens.getToken(tokenName);
    if (desiredToken != undefined) {
      this._logTokenMessage("  -- FND-locTOK " + this._rememberdTokenString(tokenName, desiredToken));
    } else {
      this._logTokenMessage("  -- FAILED to FND-locTOK " + tokenName);
    }
    return desiredToken;
  }

  // -------------------------------------------------------------------------
  // method-scoped name token handling...
  public clearLocalPasmTokensForMethod(methodName: string) {
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

  public hasLocalPasmTokenForMethod(methodName: string, tokenName: string): boolean {
    let foundStatus: boolean = this.localPasmTokensByMethodName.hasTokenForMethod(methodName, tokenName);
    return foundStatus;
  }

  public setLocalPasmTokenForMethod(methodName: string, tokenName: string, token: RememberedToken, declarationLineNumber: number, declarationComment: string | undefined): void {
    if (this.hasLocalPasmTokenForMethod(methodName, tokenName)) {
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

  public getLocalPasmTokenForMethod(methodName: string, tokenName: string): RememberedToken | undefined {
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
      }
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
//  This is the structure we use for tracking multiline ocmments
//   CLASS RememberedToken
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

  public commentAsMarkDown(): string {
    // Return the markdown for this block comment
    let tempLines: string[] = this._lines;
    // if keywords are found in comment then specially wrap the word following each keyword
    for (let idx = 0; idx < this._lines.length; idx++) {
      let workline = tempLines[idx];
      let lineParts = workline.split(" ");
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
        workline = workline.replace(nameItem, "`" + nameItem + "`");
        tempLines[idx] = workline;
      }
    }
    return tempLines.join("<br>");
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
}
