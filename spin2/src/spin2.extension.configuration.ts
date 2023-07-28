"use strict";
// src/spin2.extension.configuration.ts

import * as vscode from "vscode";

const loadSemanticConfiguration = () => {
  const semanticConfiguration = vscode.workspace.getConfiguration("spinExtensionBehavior");

  return {
    highlightFlexspin: semanticConfiguration.get<boolean>("highlightFlexspinDirectives"),
    colorBackground: semanticConfiguration.get<boolean>("colorEditorBackground"),
  };
};

export const semanticConfiguration = loadSemanticConfiguration();

export const reloadSemanticConfiguration = () => {
  const newSemanticConfiguration = loadSemanticConfiguration();

  // bail out if nothing changed
  if (semanticConfiguration.highlightFlexspin === newSemanticConfiguration.highlightFlexspin && semanticConfiguration.colorBackground === newSemanticConfiguration.colorBackground) {
    return false;
  }

  semanticConfiguration.highlightFlexspin = newSemanticConfiguration.highlightFlexspin;
  semanticConfiguration.colorBackground = newSemanticConfiguration.colorBackground;

  return true;
};
