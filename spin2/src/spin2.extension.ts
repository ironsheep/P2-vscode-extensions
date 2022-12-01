"use strict";

import { toNamespacedPath } from "path";
//import { stringify } from 'querystring';
//import { createStringLiteralFromNode, EndOfLineState } from 'typescript';
// src/spin2.extension.ts

import * as vscode from "vscode";
import { Formatter } from "./spin.tabFormatter";

import { overtypeBeforePaste, overtypeBeforeType } from "./spin.insertMode.behavior";
import { configuration, reloadConfiguration } from "./spin.insertMode.configuration";
import { getMode, resetModes, toggleMode, toggleMode2State, eInsertMode, modeName } from "./spin.insertMode.mode";
import { createStatusBarItem, destroyStatusBarItem, updateStatusBarItem } from "./spin.insertMode.statusBarItem";
import { Spin2ConfigDocumentSymbolProvider, Spin2DocumentSemanticTokensProvider, Spin2Legend } from "./spin2.semanticAndOutline";
import { Spin1ConfigDocumentSymbolProvider, Spin1DocumentSemanticTokensProvider, Spin1Legend } from "./spin1.semanticAndOutline";

// ----------------------------------------------------------------------------
//  this file contains both an outline provider
//    and our semantic highlighting provider
//

// register services provided by this file
export const activate = (context: vscode.ExtensionContext) => {
  // register our Spin2 outline provider
  context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider({ scheme: "file", language: "spin2" }, new Spin2ConfigDocumentSymbolProvider()));

  // register our  Spin2 semantic tokens provider
  context.subscriptions.push(vscode.languages.registerDocumentSemanticTokensProvider({ language: "spin2" }, new Spin2DocumentSemanticTokensProvider(), Spin2Legend));

  // register our  Spin1 outline provider
  context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider({ scheme: "file", language: "spin" }, new Spin1ConfigDocumentSymbolProvider()));

  // register our  Spin1 semantic tokens provider
  context.subscriptions.push(vscode.languages.registerDocumentSemanticTokensProvider({ language: "spin" }, new Spin1DocumentSemanticTokensProvider(), Spin1Legend));

  // ----------------------------------------------------------------------------
  //   TAB Formatter Provider
  //

  var formatter = new Formatter();
  if (formatter.isEnbled()) {
    const insertTabStopsCommentCommand = "spin2.insertTabStopsComment";

    context.subscriptions.push(
      vscode.commands.registerCommand(insertTabStopsCommentCommand, async () => {
        try {
          const editor = vscode?.window.activeTextEditor!;
          const document = editor.document!;
          var textEdits = await formatter.insertTabStopsComment(document, editor.selections);
          applyTextEdits(document, textEdits!);
        } catch (error) {
          await vscode.window.showErrorMessage("Formatter Add Comment Problem");
          console.error(error);
        }
      })
    );

    const indentTabStopCommand = "spin2.indentTabStop";

    context.subscriptions.push(
      vscode.commands.registerCommand(indentTabStopCommand, async () => {
        try {
          const editor = vscode?.window.activeTextEditor!;
          const document = editor.document!;
          var textEdits = await formatter.indentTabStop(document, editor);
          applyTextEdits(document, textEdits!);
        } catch (error) {
          await vscode.window.showErrorMessage("Formatter TAB Problem");
          console.error(error);
        }
      })
    );

    const outdentTabStopCommand = "spin2.outdentTabStop";

    context.subscriptions.push(
      vscode.commands.registerCommand(outdentTabStopCommand, async () => {
        try {
          const editor = vscode.window.activeTextEditor!;
          const document = editor.document!;
          var textEdits = await formatter.outdentTabStop(document, editor);
          applyTextEdits(document, textEdits!);
          console.log();
        } catch (error) {
          await vscode.window.showErrorMessage("Formatter Shift+TAB Problem");
          console.error(error);
        }
      })
    );

    function applyTextEdits(document: vscode.TextDocument, textEdits: vscode.TextEdit[]) {
      if (!textEdits) {
        return;
      }
      const workEdits = new vscode.WorkspaceEdit();
      workEdits.set(document.uri, textEdits); // give the edits
      vscode.workspace.applyEdit(workEdits); // apply the edits
    }
  }

  // ----------------------------------------------------------------------------
  //   InserMode  Provider
  //

  const statusBarItem = createStatusBarItem();
  activeTextEditorChanged();

  context.subscriptions.push(
    vscode.commands.registerCommand("spin2.insertMode.rotate", toggleCommand),
    vscode.commands.registerCommand("spin2.insertMode.toggle", toggleCommand2State),

    vscode.commands.registerCommand("type", typeCommand),
    vscode.commands.registerCommand("paste", pasteCommand),

    vscode.commands.registerCommand("spin2.insertMode.deleteLeft", deleteLeftCommand),
    vscode.commands.registerCommand("spin2.insertMode.deleteRight", deleteRightCommand),

    vscode.window.onDidChangeActiveTextEditor(activeTextEditorChanged),

    vscode.workspace.onDidChangeConfiguration(onDidChangeConfiguration),

    statusBarItem
  );
};

export const deactivate = () => {
  destroyStatusBarItem();
};

// ----------------------------------------------------------------------------
//   InsertMode command handlers   ////////////////////////////////////////////

function activeTextEditorChanged(textEditor?: vscode.TextEditor) {
  if (textEditor === undefined) {
    textEditor = vscode.window.activeTextEditor;
  }

  if (textEditor == null) {
    updateStatusBarItem(null);
  } else {
    const mode = getMode(textEditor);
    updateStatusBarItem(mode);
    vscode.commands.executeCommand("setContext", "spin2.insert.mode", modeName(mode));

    // if in overtype mode, set the cursor to secondary style; otherwise, reset to default
    let cursorStyle;
    switch (mode) {
      default:
        cursorStyle = configuration.defaultCursorStyle;
        break;
      case eInsertMode.OVERTYPE:
        cursorStyle = configuration.secondaryCursorStyle;
        break;
      case eInsertMode.ALIGN:
        cursorStyle = configuration.ternaryCursorStyle;
        break;
    }
    textEditor.options.cursorStyle = cursorStyle;
  }
}

function toggleCommand() {
  const textEditor = vscode.window.activeTextEditor;
  if (textEditor == null) {
    return;
  }

  toggleMode(textEditor);
  activeTextEditorChanged(textEditor);
}

function toggleCommand2State() {
  const textEditor = vscode.window.activeTextEditor;
  if (textEditor == null) {
    return;
  }

  toggleMode2State(textEditor);
  activeTextEditorChanged(textEditor);
}

function getShowInStatusBar(): boolean {
  if (configuration.labelInsertMode === "" && configuration.labelOvertypeMode === "" && configuration.labelAlignMode === "") {
    return true;
  }
  return false;
}

const onDidChangeConfiguration = () => {
  const previousPerEditor = configuration.perEditor;
  const previousShowInStatusBar = getShowInStatusBar();

  const updated = reloadConfiguration();
  if (!updated) {
    return;
  }

  const showInStatusBar = getShowInStatusBar();

  // post create / destroy when changed
  if (showInStatusBar !== previousShowInStatusBar) {
    if (showInStatusBar) {
      createStatusBarItem();
    } else {
      destroyStatusBarItem();
    }
  }

  // update state if the per-editor/global configuration option changes
  if (configuration.perEditor !== previousPerEditor) {
    const textEditor = vscode.window.activeTextEditor;
    const mode = textEditor != null ? getMode(textEditor) : null;
    resetModes(mode, configuration.perEditor);
  }

  activeTextEditorChanged();
};

function typeCommand(args: { text: string }) {
  const editor = vscode.window.activeTextEditor;
  var formatter = new Formatter();
  if (editor && getMode(editor) == eInsertMode.OVERTYPE) {
    overtypeBeforeType(editor, args.text, false);
  } else if (editor && getMode(editor) == eInsertMode.ALIGN) {
    formatter.alignBeforeType(editor, args.text, false);
  } else vscode.commands.executeCommand("default:type", args);
}

function deleteLeftCommand() {
  const editor = vscode.window.activeTextEditor;
  var formatter = new Formatter();
  if (editor && getMode(editor) == eInsertMode.ALIGN) {
    formatter.alignDelete(editor, false);
    return null;
  } else return vscode.commands.executeCommand("deleteLeft");
}

function deleteRightCommand() {
  const editor = vscode.window.activeTextEditor;
  var formatter = new Formatter();
  if (editor && getMode(editor) == eInsertMode.ALIGN) {
    formatter.alignDelete(editor, true);
    return null;
  } else return vscode.commands.executeCommand("deleteRight");
}

function pasteCommand(args: { text: string; pasteOnNewLine: boolean }) {
  const editor = vscode.window.activeTextEditor;
  var formatter = new Formatter();
  if (editor) {
    if (getMode(editor) == eInsertMode.OVERTYPE && configuration.overtypePaste) {
      // TODO: Make paste work with align
      overtypeBeforePaste(editor, args.text, args.pasteOnNewLine);
      return vscode.commands.executeCommand("default:paste", args);
    } else if (getMode(editor) == eInsertMode.ALIGN && !args.pasteOnNewLine) {
      formatter.alignBeforeType(editor, args.text, true);
      return null;
    } else {
      return vscode.commands.executeCommand("default:paste", args);
    }
  }
  return null;
}
