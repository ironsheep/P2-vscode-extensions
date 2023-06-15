"use strict";
// src/spin2.semantic.findings.ts

import * as vscode from "vscode";

// ============================================================================
//  this file contains objects we use in tracking symbol use and declaration
//

// ----------------------------------------------------------------------------
//  This is the bask token type we report to VSCode
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
  get type() {
    return this._type;
  }
  get modifiers() {
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
//  Shared Data Storage for what our current document contains
//   CLASS DocumentFindings
export class DocumentFindings {
  private globalTokens;
  private localTokens;
  private localPasmTokensByMethodName;

  private outputChannel: vscode.OutputChannel | undefined = undefined;
  private bLogEnabled: boolean = false;

  public constructor(isLogging: boolean, logHandle: vscode.OutputChannel | undefined) {
    this.bLogEnabled = isLogging;
    this.outputChannel = logHandle;
    this._logTokenMessage("* Global, Local, MethodScoped Token repo's ready");
    this.globalTokens = new TokenSet("gloTOK", isLogging, logHandle);
    this.localTokens = new TokenSet("locTOK", isLogging, logHandle);
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
  }
  public isKnownToken(tokenName: string): boolean {
    const foundStatus: boolean = this.isGlobalToken(tokenName) || this.isLocalToken(tokenName) || this.hasLocalPasmToken(tokenName) ? true : false;
    return foundStatus;
  }

  public isGlobalToken(tokenName: string): boolean {
    const foundStatus: boolean = this.globalTokens.hasToken(tokenName);
    return foundStatus;
  }

  public setGlobalToken(tokenName: string, token: RememberedToken): void {
    if (!this.isGlobalToken(tokenName)) {
      this._logTokenMessage("  -- NEW-gloTOK " + this._rememberdTokenString(tokenName, token));
      this.globalTokens.setToken(tokenName, token);
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

  public setLocalToken(tokenName: string, token: RememberedToken): void {
    if (!this.isLocalToken(tokenName)) {
      this._logTokenMessage("  -- NEW-locTOK " + this._rememberdTokenString(tokenName, token));
      this.localTokens.setToken(tokenName, token);
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

  public setLocalPasmTokenForMethod(methodName: string, tokenName: string, token: RememberedToken): void {
    if (this.hasLocalPasmTokenForMethod(methodName, tokenName)) {
      // WARNING attempt to set again
    } else {
      // set new one!
      this.localPasmTokensByMethodName.setTokenForMethod(methodName, tokenName, token);
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
