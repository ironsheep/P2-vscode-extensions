"use strict";
// src/spin.vscode.utils.ts

import * as vscode from "vscode";

export function isCurrentDocumentSpin1(): boolean {
  const editor = vscode?.window.activeTextEditor!;
  const document = editor.document!;
  const spin1DocStatus: boolean = isSpin1File(document.fileName);
  return spin1DocStatus;
}

export function isSpinDocument(document: vscode.TextDocument): boolean {
  let spinDocumentStatus: boolean = isSpinFile(document.fileName);
  return spinDocumentStatus;
}

export function isSpinOrPasmDocument(document: vscode.TextDocument): boolean {
  let spinDocumentStatus: boolean = isSpinOrPasmFile(document.fileName);
  return spinDocumentStatus;
}

export function isSpin1Document(document: vscode.TextDocument): boolean {
  let spinDocumentStatus: boolean = isSpin1File(document.fileName);
  return spinDocumentStatus;
}

function isSpinOrPasmFile(fileSpec: string): boolean {
  let spinDocumentStatus: boolean = isSpin1File(fileSpec) || isSpin2File(fileSpec) || isPasmFile(fileSpec);
  return spinDocumentStatus;
}

function isPasmFile(fileSpec: string): boolean {
  let spinDocumentStatus: boolean = fileSpec.toLowerCase().endsWith(".p2asm");
  return spinDocumentStatus;
}

export function isSpinFile(fileSpec: string): boolean {
  let spinDocumentStatus: boolean = isSpin1File(fileSpec) || isSpin2File(fileSpec);
  return spinDocumentStatus;
}

export function isSpin1File(fileSpec: string): boolean {
  let spinDocumentStatus: boolean = fileSpec.toLowerCase().endsWith(".spin");
  return spinDocumentStatus;
}
export function isSpin2File(fileSpec: string): boolean {
  let spinDocumentStatus: boolean = fileSpec.toLowerCase().endsWith(".spin2");
  return spinDocumentStatus;
}

function isSpin2ORPasm(fileSpec: string): boolean {
  let spinDocumentStatus: boolean = fileSpec.toLowerCase().endsWith(".spin2") || fileSpec.toLowerCase().endsWith(".p2asm");
  return spinDocumentStatus;
}
