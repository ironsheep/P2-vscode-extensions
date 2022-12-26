"use strict";
// src/spin2.semantic.findings.ts

import * as vscode from "vscode";

// ============================================================================
//  this file contains both an outline provider
//    and our semantic highlighting provider
//
class RememberedToken {
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
}

// ----------------------------------------------------------------------------
//  Shared Data Storage for what our current document contains
//
export class DocumentFindings {
  private tokenSet = new Map<string, RememberedToken>();
  private outputChannel: vscode.OutputChannel | undefined = undefined;
  private bLogEnabled: boolean = false;
  private bDataLoaded: boolean = false;

  public constructor(isLogging: boolean, logHandle: vscode.OutputChannel | undefined) {
    this.bLogEnabled = isLogging;
    this.outputChannel = logHandle;
    this.logTokenMessage("* gTOK ready");
  }

  private logTokenMessage(message: string): void {
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
    this.logTokenMessage("* gTOK clear() now " + this.length() + " tokens");
  }
  public isReady(): boolean {
    return this.bDataLoaded;
  }

  public setLoaded(bState: boolean): void {
    this.bDataLoaded = bState;
  }

  public length(): number {
    return this.tokenSet.size;
  }

  public rememberdTokenString(tokenName: string, aToken: RememberedToken | undefined): string {
    let desiredInterp: string = "  -- token=[len:" + tokenName.length + " [" + tokenName + "](undefined)";
    if (aToken != undefined) {
      desiredInterp = "  -- token=[len:" + tokenName.length + " [" + tokenName + "](" + aToken.type + "[" + aToken.modifiers + "])]";
    }
    return desiredInterp;
  }

  public isToken(tokenName: string): boolean {
    let foundStatus: boolean = false;
    if (tokenName.length > 0) {
      foundStatus = this.tokenSet.has(tokenName.toLowerCase());
      if (foundStatus) {
        this.logTokenMessage("* gTOK [" + tokenName + "] found: " + foundStatus);
      }
    }
    return foundStatus;
  }

  public setToken(tokenName: string, token: RememberedToken): void {
    if (tokenName.length > 0 && !this.isToken(tokenName)) {
      this.tokenSet.set(tokenName.toLowerCase(), token);
      const currCt: number = this.length();
      this.logTokenMessage("* gTOK #" + currCt + ":  " + this.rememberdTokenString(tokenName, token));
    }
  }

  public getToken(tokenName: string): RememberedToken | undefined {
    var desiredToken: RememberedToken | undefined = this.tokenSet.get(tokenName.toLowerCase());
    if (desiredToken != undefined) {
      // let's never return a declaration modifier! (somehow "declaration" creeps in to our list!??)
      let modifiersNoDecl: string[] = this._modifiersWithout(desiredToken.modifiers, "declaration");
      desiredToken = new RememberedToken(desiredToken.type, modifiersNoDecl);
    }
    return desiredToken;
  }

  private _modifiersWithout(initialModifiers: string[], unwantedModifier: string): string[] {
    //  remove modification attribute
    var updatedModifiers: string[] = [];
    for (var idx = 0; idx < initialModifiers.length; idx++) {
      var possModifier: string = initialModifiers[idx];
      if (possModifier !== unwantedModifier) {
        updatedModifiers.push(possModifier);
      }
    }
    return updatedModifiers;
  }
}
