"use strict";

//import { toNamespacedPath } from "path";
//import { stringify } from 'querystring';
//import { createStringLiteralFromNode, EndOfLineState } from 'typescript';
// src/spin2.extension.ts

import * as vscode from "vscode";

import { Formatter } from "./spin.tabFormatter";
import { overtypeBeforePaste, overtypeBeforeType } from "./spin.editMode.behavior";
import { configuration, reloadConfiguration } from "./spin.editMode.configuration";
import { getMode, resetModes, toggleMode, toggleMode2State, eEditMode, modeName } from "./spin.editMode.mode";
import { createStatusBarItem, destroyStatusBarItem, updateStatusBarItem } from "./spin.editMode.statusBarItem";
import { Spin2ConfigDocumentSymbolProvider, Spin2DocumentSemanticTokensProvider, Spin2Legend } from "./spin2.semanticAndOutline";
import { Spin1ConfigDocumentSymbolProvider, Spin1DocumentSemanticTokensProvider, Spin1Legend } from "./spin1.semanticAndOutline";
import { DocGenerator } from "./spin.document.generate";
import { ObjectTreeProvider, Dependency } from "./spin.object.dependencies";
import { Spin1HoverProvider } from "./spin1.hover.behavior";
import { Spin2HoverProvider } from "./spin2.hover.behavior";
import { Spin1SignatureHelpProvider } from "./spin1.signature.help";
import { Spin2SignatureHelpProvider } from "./spin2.signature.help";

// ----------------------------------------------------------------------------
//  this file contains both an outline provider
//    and our semantic highlighting provider
//

var formatter: Formatter;
const formatDebugLogEnabled: boolean = false; // WARNING (REMOVE BEFORE FLIGHT)- change to 'false' - disable before commit
var formatOutputChannel: vscode.OutputChannel | undefined = undefined;

interface Filter extends vscode.DocumentFilter {
  language: string;
  scheme: string;
}
export const SPIN1_FILE: Filter = { language: "spin", scheme: "file" };
export const SPIN2_FILE: Filter = { language: "spin2", scheme: "file" };

export const logFormatMessage = (message: string): void => {
  if (formatDebugLogEnabled && formatOutputChannel != undefined) {
    //Write to output window.
    formatOutputChannel.appendLine(message);
  }
};

var objTreeProvider: ObjectTreeProvider;
var objDepTreeView: vscode.TreeView<Dependency>;
const objTreeDebugLogEnabled: boolean = false; // WARNING (REMOVE BEFORE FLIGHT)- change to 'false' - disable before commit
var objTreeOutputChannel: vscode.OutputChannel | undefined = undefined;
const spin1SemanticTokensProvider = new Spin1DocumentSemanticTokensProvider();
const spin2SemanticTokensProvider = new Spin2DocumentSemanticTokensProvider();

// register services provided by this file
export const activate = (context: vscode.ExtensionContext) => {
  // register our Spin2 outline provider
  context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(SPIN2_FILE, new Spin2ConfigDocumentSymbolProvider()));

  // register our  Spin2 semantic tokens provider
  context.subscriptions.push(vscode.languages.registerDocumentSemanticTokensProvider(SPIN2_FILE, spin2SemanticTokensProvider, Spin2Legend));

  // register our  Spin1 outline provider
  context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(SPIN1_FILE, new Spin1ConfigDocumentSymbolProvider()));

  // register our  Spin1 semantic tokens provider
  context.subscriptions.push(vscode.languages.registerDocumentSemanticTokensProvider(SPIN1_FILE, spin1SemanticTokensProvider, Spin1Legend));

  // register our  Spin2 hover provider
  context.subscriptions.push(vscode.languages.registerHoverProvider(SPIN2_FILE, new Spin2HoverProvider(spin2SemanticTokensProvider.docFindings())));

  // register our  Spin1 hover provider
  context.subscriptions.push(vscode.languages.registerHoverProvider(SPIN1_FILE, new Spin1HoverProvider(spin1SemanticTokensProvider.docFindings())));

  // register our  Spin2 signature help provider
  context.subscriptions.push(vscode.languages.registerSignatureHelpProvider(SPIN2_FILE, new Spin2SignatureHelpProvider(spin2SemanticTokensProvider.docFindings()), "(", ","));

  // register our  Spin1 signature help provider
  context.subscriptions.push(vscode.languages.registerSignatureHelpProvider(SPIN1_FILE, new Spin1SignatureHelpProvider(spin1SemanticTokensProvider.docFindings()), "(", ","));

  // ----------------------------------------------------------------------------
  //   TAB Formatter Provider
  //
  if (formatDebugLogEnabled) {
    if (formatOutputChannel === undefined) {
      //Create output channel
      formatOutputChannel = vscode.window.createOutputChannel("Spin/Spin2 Format DEBUG");
      logFormatMessage("Spin/Spin2 Format log started.");
    } else {
      logFormatMessage("\n\n------------------   NEW FILE ----------------\n\n");
    }
  }

  if (objTreeDebugLogEnabled) {
    if (objTreeOutputChannel === undefined) {
      //Create output channel
      objTreeOutputChannel = vscode.window.createOutputChannel("Spin/Spin2 ObjTree DEBUG");
      logFormatMessage("Spin/Spin2 ObjTree log started.");
    } else {
      logFormatMessage("\n\n------------------   NEW FILE ----------------\n\n");
    }
  }

  formatter = new Formatter(formatOutputChannel, formatDebugLogEnabled);

  objTreeProvider = new ObjectTreeProvider(objTreeOutputChannel, objTreeDebugLogEnabled);

  const generateDocumentFileCommand: string = "spin2.generate.documentation.file";
  const docGenerator: DocGenerator = new DocGenerator();

  context.subscriptions.push(
    vscode.commands.registerCommand(generateDocumentFileCommand, async () => {
      docGenerator.logMessage("* generateDocumentFileCommand");
      try {
        // and test it!
        docGenerator.generateDocument();
        docGenerator.showDocument();
      } catch (error) {
        await vscode.window.showErrorMessage("Document Generation Problem");
        console.error(error);
      }
    })
  );

  const generateDocCommentCommand: string = "spin2.generate.doc.comment";

  context.subscriptions.push(
    vscode.commands.registerCommand(generateDocCommentCommand, async () => {
      logFormatMessage("* generateDocumentCommentCommand");
      try {
        // and test it!
        const editor = vscode?.window.activeTextEditor!;
        const document = editor.document!;
        var textEdits = await spin2SemanticTokensProvider.insertDocComment(document, editor.selections);
        applyTextEdits(document, textEdits!);
      } catch (error) {
        await vscode.window.showErrorMessage("Document Comment Generation Problem");
        console.error(error);
      }
    })
  );

  vscode.commands.executeCommand("setContext", "spin2.tabStops.enabled", formatter.isEnbled());

  if (formatter.isEnbled()) {
    const insertTabStopsCommentCommand = "spin2.insertTabStopsComment";

    context.subscriptions.push(
      vscode.commands.registerCommand(insertTabStopsCommentCommand, async () => {
        logFormatMessage("* insertTabStopsCommentCommand");
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
        logFormatMessage("* indentTabStopCommand");
        try {
          const editor = vscode?.window.activeTextEditor!;
          const document = editor.document!;
          var textEdits = await formatter.indentTabStop(document, editor);
          let [cursorSelect, bShouldSelect] = formatter.indentEndingSelection();
          applyTextEdits(document, textEdits!);
          if (bShouldSelect) {
            formatter.logMessage(`* SET CURSOR sel=[${cursorSelect.anchor.line}:${cursorSelect.anchor.character}, ${cursorSelect.active.line}:${cursorSelect.active.character}]`);
            editor.selection = cursorSelect;
          }
        } catch (error) {
          await vscode.window.showErrorMessage("Formatter TAB Problem");
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
          var textEdits = await formatter.outdentTabStop(document, editor);
          let [cursorSelect, bShouldSelect] = formatter.outdentEndingSelection();
          applyTextEdits(document, textEdits!);
          if (bShouldSelect) {
            formatter.logMessage(`* SET CURSOR sel=[${cursorSelect.anchor.line}:${cursorSelect.anchor.character}, ${cursorSelect.active.line}:${cursorSelect.active.character}]`);
            editor.selection = cursorSelect;
          }
          console.log();
        } catch (error) {
          await vscode.window.showErrorMessage("Formatter Shift+TAB Problem");
          console.error(error);
        }
      })
    );
  }

  function applyTextEdits(document: vscode.TextDocument, textEdits: vscode.TextEdit[]) {
    if (!textEdits) {
      return;
    }
    const workEdits = new vscode.WorkspaceEdit();
    workEdits.set(document.uri, textEdits); // give the edits
    vscode.workspace.applyEdit(workEdits); // apply the edits
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

  // ----------------------------------------------------------------------------
  //   Object Tree View Provider
  //
  //vscode.window.registerTreeDataProvider("objectDependencies", objTreeProvider);
  objDepTreeView = vscode.window.createTreeView("objectDependencies", {
    canSelectMany: false,
    showCollapseAll: true,
    treeDataProvider: objTreeProvider,
  });
  //objDepTreeView.onDidChangeSelection(objTreeProvider.onElementClick);

  vscode.commands.registerCommand("objectDependencies.refreshEntry", () => objTreeProvider.refresh());
  vscode.commands.registerCommand("objectDependencies.activateFile", async (arg1) => objTreeProvider.onElementClick(arg1));
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

const onDidChangeConfiguration = () => {
  const previousPerEditor = configuration.perEditor;
  const previousShowInStatusBar = getShowInStatusBar();

  // tell formatter that is might have changed, too
  formatter.updateTabConfiguration();

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
  if (editor != undefined && formatter.isEnbled() && editMode == eEditMode.OVERTYPE) {
    logFormatMessage("* OVERTYPE type");
    overtypeBeforeType(editor, args.text, false);
  } else if (editor != undefined && formatter.isEnbled() && editMode == eEditMode.ALIGN) {
    formatter.alignBeforeType(editor, args.text, false);
  } else {
    //logFormatMessage("* VSCode type");
    vscode.commands.executeCommand("default:type", args);
  }
}

function deleteLeftCommand() {
  const editor = vscode.window.activeTextEditor;
  logFormatMessage("* deleteLeft");
  var bAlignEdit: boolean = editor != undefined && formatter.isEnbled();
  if (editor != undefined) {
    const editMode = getMode(editor);
    if (editMode != eEditMode.ALIGN) {
      bAlignEdit = false;
    }
  }
  if (bAlignEdit && editor != undefined) {
    formatter.alignDelete(editor, false);
    return null;
  } else {
    //logFormatMessage("* VSCode deleteLeft");
    return vscode.commands.executeCommand("deleteLeft");
  }
}

function deleteRightCommand() {
  const editor = vscode.window.activeTextEditor;
  logFormatMessage("* deleteRight");
  if (formatter.isEnbled() && editor && getMode(editor) == eEditMode.ALIGN) {
    formatter.alignDelete(editor, true);
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
    } else if (formatter.isEnbled() && getMode(editor) == eEditMode.ALIGN && !args.pasteOnNewLine) {
      formatter.alignBeforeType(editor, args.text, true);
      return null;
    } else {
      //logFormatMessage("* VSCode paste");
      return vscode.commands.executeCommand("default:paste", args);
    }
  }
  return null;
}
