"use strict";
// src/spin2.semantic.configuration.ts

import * as vscode from "vscode";

const loadSemanticConfiguration = () => {
  const semanticConfiguration = vscode.workspace.getConfiguration("spinExtensionBehavior");

  return {
    highlightFlexspin: semanticConfiguration.get<boolean>("highlightFlexspinDirectives"),
  };
};

export const semanticConfiguration = loadSemanticConfiguration();

export const reloadSemanticConfiguration = () => {
  const newSemanticConfiguration = loadSemanticConfiguration();

  // bail out if nothing changed
  if (semanticConfiguration.highlightFlexspin === newSemanticConfiguration.highlightFlexspin) {
    return false;
  }

  semanticConfiguration.highlightFlexspin = newSemanticConfiguration.highlightFlexspin;

  return true;
};
