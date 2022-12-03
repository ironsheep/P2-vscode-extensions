"use strict";
import * as vscode from "vscode";

const stringToCursorStyle = (config: vscode.WorkspaceConfiguration, style: string, def: vscode.TextEditorCursorStyle) => {
  switch (config.get<string>(style)) {
    case "line":
      return vscode.TextEditorCursorStyle.Line;
    case "line-thin":
      return vscode.TextEditorCursorStyle.LineThin;
    case "block":
      return vscode.TextEditorCursorStyle.Block;
    case "block-outline":
      return vscode.TextEditorCursorStyle.BlockOutline;
    case "underline":
      return vscode.TextEditorCursorStyle.Underline;
    case "underline-thin":
      return vscode.TextEditorCursorStyle.UnderlineThin;
    default:
      return def;
  }
};

const getActiveConfiguration = (section: string): vscode.WorkspaceConfiguration => {
  const activeLanguageId = vscode.window.activeTextEditor?.document.languageId;
  if (activeLanguageId) {
    const languageScope = { languageId: activeLanguageId };
    const languageSpecificConfiguration = vscode.workspace.getConfiguration(section, languageScope);
    return languageSpecificConfiguration;
  }
  return vscode.workspace.getConfiguration(section);
};

const loadConfiguration = () => {
  const insertModeConfiguration = vscode.workspace.getConfiguration("spinInsertMode");
  const editorConfiguration = vscode.workspace.getConfiguration("editor");

  return {
    overtypePaste: insertModeConfiguration.get<boolean>("overtypePaste"),
    perEditor: insertModeConfiguration.get<boolean>("perEditor") ? true : false,

    enableAlign: insertModeConfiguration.get<boolean>("enableAlign"),

    labelInsertMode: insertModeConfiguration.get<string>("labelInsertMode"),
    labelOvertypeMode: insertModeConfiguration.get<string>("labelOvertypeMode"),
    labelAlignMode: insertModeConfiguration.get<String>("labelAlignMode"),

    // tslint:disable-next-line:object-literal-sort-keys
    get defaultCursorStyle(): vscode.TextEditorCursorStyle {
      const editorConfiguration = getActiveConfiguration("editor");
      return stringToCursorStyle(editorConfiguration, "cursorStyle", vscode.TextEditorCursorStyle.Block);
    },

    // Get the user defined cursor style for overtype mode
    secondaryCursorStyle: (() => {
      return stringToCursorStyle(insertModeConfiguration, "secondaryCursorStyle", vscode.TextEditorCursorStyle.Line);
    })(),

    ternaryCursorStyle: (() => {
      return stringToCursorStyle(insertModeConfiguration, "ternaryCursorStyle", vscode.TextEditorCursorStyle.Line);
    })(),
  };
};

export const configuration = loadConfiguration();

export const reloadConfiguration = () => {
  const newConfiguration = loadConfiguration();

  // bail out if nothing changed
  if (
    configuration.labelInsertMode === newConfiguration.labelInsertMode &&
    configuration.labelOvertypeMode === newConfiguration.labelOvertypeMode &&
    configuration.labelAlignMode === newConfiguration.labelAlignMode &&
    configuration.enableAlign === newConfiguration.enableAlign &&
    configuration.overtypePaste === newConfiguration.overtypePaste &&
    configuration.perEditor === newConfiguration.perEditor &&
    configuration.defaultCursorStyle === newConfiguration.defaultCursorStyle &&
    configuration.secondaryCursorStyle === newConfiguration.secondaryCursorStyle &&
    configuration.ternaryCursorStyle === newConfiguration.ternaryCursorStyle
  ) {
    return false;
  }

  configuration.labelInsertMode = newConfiguration.labelInsertMode;
  configuration.labelOvertypeMode = newConfiguration.labelOvertypeMode;
  configuration.labelAlignMode = newConfiguration.labelAlignMode;
  configuration.enableAlign = newConfiguration.enableAlign;
  configuration.overtypePaste = newConfiguration.overtypePaste;
  configuration.perEditor = newConfiguration.perEditor;
  // guess we don't save .defaultCursorStyle
  configuration.secondaryCursorStyle = newConfiguration.secondaryCursorStyle;
  configuration.ternaryCursorStyle = newConfiguration.ternaryCursorStyle;

  return true;
};
