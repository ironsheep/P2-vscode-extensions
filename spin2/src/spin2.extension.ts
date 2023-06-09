"use strict";

//import { toNamespacedPath } from "path";
//import { stringify } from 'querystring';
//import { createStringLiteralFromNode, EndOfLineState } from 'typescript';
// src/spin2.extension.ts

import * as vscode from "vscode";

import { TabFormatter } from "./spin.tabFormatter";
import { overtypeBeforePaste, overtypeBeforeType } from "./spin.editMode.behavior";
import { configuration, reloadConfiguration } from "./spin.editMode.configuration";
import { getMode, resetModes, toggleMode, toggleMode2State, eEditMode, modeName } from "./spin.editMode.mode";
import { createStatusBarItem, destroyStatusBarItem, updateStatusBarItem } from "./spin.editMode.statusBarItem";
import { Spin2ConfigDocumentSymbolProvider, Spin2DocumentSemanticTokensProvider, Spin2Legend } from "./spin2.semanticAndOutline";
import { Spin1ConfigDocumentSymbolProvider, Spin1DocumentSemanticTokensProvider, Spin1Legend } from "./spin1.semanticAndOutline";
import { BackgroundHighlighter } from "./spin.bkgndHighlight.behavior";

// ----------------------------------------------------------------------------
//  this file contains both an outline provider
//    and our semantic highlighting provider
//

var tabFormatter: TabFormatter;
var bgHighlighter: BackgroundHighlighter;

var fmtOutputChannel: vscode.OutputChannel | undefined = undefined;
var bgcoOutputChannel: vscode.OutputChannel | undefined = undefined;
var backgroundColorEnabled: boolean = false;

const formatDebugLogEnabled: boolean = false; // WARNING (REMOVE BEFORE FLIGHT)- change to 'false' - disable before commit
const bgColorDebugLogEnabled: boolean = true; // WARNING (REMOVE BEFORE FLIGHT)- change to 'false' - disable before commit

export const logFormatMessage = (message: string): void => {
  if (formatDebugLogEnabled && fmtOutputChannel != undefined) {
    //Write to output window.
    fmtOutputChannel.appendLine(message);
  }
};

export const logBgColorMessage = (message: string): void => {
  if (bgColorDebugLogEnabled && bgcoOutputChannel != undefined) {
    //Write to output window.
    bgcoOutputChannel.appendLine(message);
  }
};

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
  //   TAB TabFormatter Provider
  //
  if (formatDebugLogEnabled) {
    if (fmtOutputChannel === undefined) {
      //Create output channel
      fmtOutputChannel = vscode.window.createOutputChannel("Spin/Spin2 Format DEBUG");
      logFormatMessage("Spin/Spin2 Format log started.");
    } else {
      logFormatMessage("\n\n------------------   NEW FILE ----------------\n\n");
    }
  }

  tabFormatter = new TabFormatter(fmtOutputChannel, formatDebugLogEnabled);
  vscode.commands.executeCommand("setContext", "spin2.tabStops.enabled", tabFormatter.isEnabled());

  if (tabFormatter.isEnabled()) {
    const insertTabStopsCommentCommand = "spin2.insertTabStopsComment";

    context.subscriptions.push(
      vscode.commands.registerCommand(insertTabStopsCommentCommand, async () => {
        logFormatMessage("* insertTabStopsCommentCommand");
        try {
          const editor = vscode?.window.activeTextEditor!;
          const document = editor.document!;
          var textEdits = await tabFormatter.insertTabStopsComment(document, editor.selections);
          applyTextEdits(document, textEdits!);
        } catch (error) {
          await vscode.window.showErrorMessage("TabFormatter Add Comment Problem");
          console.error(error);
        }
      })
    );

    const indentTabStopCommand = "spin2.indentTabStop";

    context.subscriptions.push(
      vscode.commands.registerCommand(indentTabStopCommand, async () => {
        logFormatMessage("* indentTabStopCommand");
        try {
          const editor = vscode?.window.activeTextEditor!;
          const document = editor.document!;
          var textEdits = await tabFormatter.indentTabStop(document, editor);
          let [cursorSelect, bShouldSelect] = tabFormatter.indentEndingSelection();
          applyTextEdits(document, textEdits!);
          if (bShouldSelect) {
            tabFormatter.logMessage(`* SET CURSOR sel=[${cursorSelect.anchor.line}:${cursorSelect.anchor.character}, ${cursorSelect.active.line}:${cursorSelect.active.character}]`);
            editor.selection = cursorSelect;
          }
        } catch (error) {
          await vscode.window.showErrorMessage("TabFormatter TAB Problem");
          console.error(error);
        }
      })
    );
    const outdentTabStopCommand = "spin2.outdentTabStop";

    context.subscriptions.push(
      vscode.commands.registerCommand(outdentTabStopCommand, async () => {
        logFormatMessage("* outdentTabStopCommand");
        try {
          const editor = vscode.window.activeTextEditor!;
          const document = editor.document!;
          var textEdits = await tabFormatter.outdentTabStop(document, editor);
          let [cursorSelect, bShouldSelect] = tabFormatter.outdentEndingSelection();
          applyTextEdits(document, textEdits!);
          if (bShouldSelect) {
            tabFormatter.logMessage(`* SET CURSOR sel=[${cursorSelect.anchor.line}:${cursorSelect.anchor.character}, ${cursorSelect.active.line}:${cursorSelect.active.character}]`);
            editor.selection = cursorSelect;
          }
          console.log();
        } catch (error) {
          await vscode.window.showErrorMessage("TabFormatter Shift+TAB Problem");
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

    vscode.workspace.onDidChangeConfiguration(configurationChanged),

    vscode.workspace.onDidChangeTextDocument(textDocumentChanged),

    statusBarItem
  );

  // ----------------------------------------------------------------------------
  //   Background Color fill
  //
  if (bgColorDebugLogEnabled) {
    if (bgcoOutputChannel === undefined) {
      //Create output channel
      bgcoOutputChannel = vscode.window.createOutputChannel("Spin/Spin2 bgColor DEBUG");
      logBgColorMessage("Spin/Spin2 bgColor log started.");
    } else {
      logBgColorMessage("\n\n------------------   NEW FILE ----------------\n\n");
    }
  }

  bgHighlighter = new BackgroundHighlighter(bgcoOutputChannel, bgColorDebugLogEnabled);
  backgroundColorEnabled = bgHighlighter.isEnabled();

  // lastly, if we already have editor... trigger an update
  let textEditor = vscode.window.activeTextEditor;
  if (textEditor && backgroundColorEnabled) {
    triggerUpdateDecorations();
  }
};

export const deactivate = () => {
  destroyStatusBarItem();
};

// ----------------------------------------------------------------------------
//   InsertMode command handlers   ////////////////////////////////////////////

// EVENT Handler: onDidChangeActiveTextEditor
function activeTextEditorChanged(textEditor?: vscode.TextEditor) {
  if (textEditor === undefined) {
    textEditor = vscode.window.activeTextEditor;
  }

  if (textEditor == null) {
    updateStatusBarItem(null);
  } else {
    const mode = getMode(textEditor);
    updateStatusBarItem(mode);
    logFormatMessage("* activeTextEditorChanged");
    vscode.commands.executeCommand("setContext", "spin2.insert.mode", modeName(mode));

    // if in overtype mode, set the cursor to secondary style; otherwise, reset to default
    let cursorStyle;
    switch (mode) {
      default:
        cursorStyle = configuration.defaultCursorStyle;
        break;
      case eEditMode.OVERTYPE:
        cursorStyle = configuration.secondaryCursorStyle;
        break;
      case eEditMode.ALIGN:
        cursorStyle = configuration.ternaryCursorStyle;
        break;
    }
    textEditor.options.cursorStyle = cursorStyle;

    // now also update our background colors
    triggerUpdateDecorations();
  }
}

function toggleCommand() {
  const textEditor = vscode.window.activeTextEditor;
  logFormatMessage("* toggle");
  if (textEditor == null) {
    return;
  }

  toggleMode(textEditor);
  activeTextEditorChanged(textEditor);
}

function toggleCommand2State() {
  const textEditor = vscode.window.activeTextEditor;
  logFormatMessage("* toggle2State");
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

let bkUpdateTimer: NodeJS.Timer | undefined = undefined;

function triggerUpdateDecorations(throttle = false) {
  if (bkUpdateTimer) {
    clearTimeout(bkUpdateTimer);
    bkUpdateTimer = undefined;
  }
  if (backgroundColorEnabled) {
    if (throttle) {
      bkUpdateTimer = setTimeout(bgHighlighter.updateDecorations, 500);
    } else {
      bgHighlighter.updateDecorations();
    }
  }
}

// EVENT Handler: onDidChangeConfiguration
const configurationChanged = () => {
  const previousPerEditor = configuration.perEditor;
  const previousShowInStatusBar = getShowInStatusBar();

  // tell tabFormatter that is might have changed, too
  tabFormatter.updateTabConfiguration();
  bgHighlighter.updateConfiguration();

  // see if we still want background Coloring
  backgroundColorEnabled = bgHighlighter.isEnabled();
  if (backgroundColorEnabled == false) {
    bgHighlighter.removeDecorations();
  }

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

// EVENT Handler: onDidChangeTextDocument
const textDocumentChanged = (event: vscode.TextDocumentChangeEvent) => {
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor && event.document === activeEditor.document) {
    triggerUpdateDecorations(true);
  }
};

function typeCommand(args: { text: string }) {
  const editor = vscode.window.activeTextEditor;
  var editMode: eEditMode = eEditMode.INSERT;
  if (editor == undefined) {
    //logFormatMessage("* VSCode type (early)");
    vscode.commands.executeCommand("default:type", args);
    return;
  }
  if (formatDebugLogEnabled) {
    const firstChar: number = args.text.charCodeAt(0);
    if (args.text.length == 1 && firstChar < 0x20) {
      logFormatMessage("* type [0x" + firstChar.toString(16) + "](" + args.text.length + ")");
    } else {
      logFormatMessage("* type [" + args.text + "](" + args.text.length + ")");
    }
  }
  if (editor != undefined) {
    editMode = getMode(editor);
  }
  if (editor != undefined && tabFormatter.isEnabled() && editMode == eEditMode.OVERTYPE) {
    logFormatMessage("* OVERTYPE type");
    overtypeBeforeType(editor, args.text, false);
  } else if (editor != undefined && tabFormatter.isEnabled() && editMode == eEditMode.ALIGN) {
    tabFormatter.alignBeforeType(editor, args.text, false);
  } else {
    //logFormatMessage("* VSCode type");
    vscode.commands.executeCommand("default:type", args);
  }
}

function deleteLeftCommand() {
  const editor = vscode.window.activeTextEditor;
  logFormatMessage("* deleteLeft");
  var bAlignEdit: boolean = editor != undefined && tabFormatter.isEnabled();
  if (editor != undefined) {
    const editMode = getMode(editor);
    if (editMode != eEditMode.ALIGN) {
      bAlignEdit = false;
    }
  }
  if (bAlignEdit && editor != undefined) {
    tabFormatter.alignDelete(editor, false);
    return null;
  } else {
    //logFormatMessage("* VSCode deleteLeft");
    return vscode.commands.executeCommand("deleteLeft");
  }
}

function deleteRightCommand() {
  const editor = vscode.window.activeTextEditor;
  logFormatMessage("* deleteRight");
  if (tabFormatter.isEnabled() && editor && getMode(editor) == eEditMode.ALIGN) {
    tabFormatter.alignDelete(editor, true);
    return null;
  } else {
    //logFormatMessage("* VSCode deleteRight");
    return vscode.commands.executeCommand("deleteRight");
  }
}

function pasteCommand(args: { text: string; pasteOnNewLine: boolean }) {
  const editor = vscode.window.activeTextEditor;
  if (editor != undefined) {
    logFormatMessage("* paste");
    if (getMode(editor) == eEditMode.OVERTYPE && configuration.overtypePaste) {
      // TODO: Make paste work with align
      logFormatMessage("* OVERTYPE paste");
      overtypeBeforePaste(editor, args.text, args.pasteOnNewLine);
      return vscode.commands.executeCommand("default:paste", args);
    } else if (tabFormatter.isEnabled() && getMode(editor) == eEditMode.ALIGN && !args.pasteOnNewLine) {
      tabFormatter.alignBeforeType(editor, args.text, true);
      return null;
    } else {
      //logFormatMessage("* VSCode paste");
      return vscode.commands.executeCommand("default:paste", args);
    }
  }
  return null;
}
