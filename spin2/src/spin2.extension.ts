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
import { DocGenerator } from "./spin.document.generate";
import { ObjectTreeProvider, Dependency } from "./spin.object.dependencies";
import { RegionColorizer } from "./spin.color.regions";

import { Spin2ConfigDocumentSymbolProvider } from "./spin2.outline";
import { Spin2DocumentSemanticTokensProvider, Spin2Legend } from "./spin2.semantic";
import { Spin2HoverProvider } from "./spin2.hover.behavior";
import { Spin2SignatureHelpProvider } from "./spin2.signature.help";

import { Spin1ConfigDocumentSymbolProvider } from "./spin1.outline";
import { Spin1DocumentSemanticTokensProvider, Spin1Legend } from "./spin1.semantic";
import { Spin1HoverProvider } from "./spin1.hover.behavior";
import { Spin1SignatureHelpProvider } from "./spin1.signature.help";
import { isSpinOrPasmDocument, isSpin1Document } from "./spin.vscode.utils";
import { listeners } from "cluster";

// ----------------------------------------------------------------------------
//  this file contains both an outline provider
//    and our semantic highlighting provider
//

interface Filter extends vscode.DocumentFilter {
  language: string;
  scheme: string;
}
const SPIN1_FILE: Filter = { language: "spin", scheme: "file" };
const SPIN2_FILE: Filter = { language: "spin2", scheme: "file" };

var objTreeProvider: ObjectTreeProvider = new ObjectTreeProvider();
var tabFormatter: Formatter = new Formatter();

const docGenerator: DocGenerator = new DocGenerator();
const codeBlockColorizer: RegionColorizer = new RegionColorizer();

const spin1SemanticTokensProvider = new Spin1DocumentSemanticTokensProvider(docGenerator, codeBlockColorizer);
const spin2SemanticTokensProvider = new Spin2DocumentSemanticTokensProvider(docGenerator, codeBlockColorizer);

const extensionDebugLogEnabled: boolean = true; // WARNING (REMOVE BEFORE FLIGHT)- change to 'false' - disable before commit
var extensionOutputChannel: vscode.OutputChannel | undefined = undefined;

const logExtensionMessage = (message: string): void => {
  // simple utility to write to TABBING  output window.
  if (extensionDebugLogEnabled && extensionOutputChannel != undefined) {
    //Write to output window.
    extensionOutputChannel.appendLine(message);
  }
};

// register services provided by this file
export const activate = (context: vscode.ExtensionContext) => {
  // do one time logging init
  if (extensionDebugLogEnabled) {
    if (extensionOutputChannel === undefined) {
      //Create output channel
      extensionOutputChannel = vscode.window.createOutputChannel("Spin/Spin2 Extension DEBUG");
      logExtensionMessage("Spin/Spin2 Extension log started.");
    } else {
      logExtensionMessage("\n\n------------------   NEW FILE ----------------\n\n");
    }
  }
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
  //   Hook GENERATE Object Public Interface Document
  //
  const generateDocumentFileCommand: string = "spin2.generate.documentation.file";

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

  // ----------------------------------------------------------------------------
  //   Hook GENERATE PUB/PRI Comment Block
  //
  const generateDocCommentCommand: string = "spin2.generate.doc.comment";

  context.subscriptions.push(
    vscode.commands.registerCommand(generateDocCommentCommand, async () => {
      docGenerator.logMessage("* generateDocumentCommentCommand");
      try {
        // and test it!
        const editor = vscode?.window.activeTextEditor!;
        const document = editor.document!;
        var textEdits = await docGenerator.insertDocComment(document, editor.selections);
        applyTextEdits(document, textEdits!);
      } catch (error) {
        await vscode.window.showErrorMessage("Document Comment Generation Problem");
        console.error(error);
      }
    })
  );

  // ----------------------------------------------------------------------------
  //   Set Up our TAB Formatting
  //
  // post information to out-side world via our CONTEXT
  vscode.commands.executeCommand("setContext", "spin2.tabStops.enabled", tabFormatter.isEnbled());

  //   Hook TAB Formatting
  if (tabFormatter.isEnbled()) {
    const insertTabStopsCommentCommand = "spin2.insertTabStopsComment";

    context.subscriptions.push(
      vscode.commands.registerCommand(insertTabStopsCommentCommand, async () => {
        logExtensionMessage("* insertTabStopsCommentCommand");
        try {
          const editor = vscode?.window.activeTextEditor!;
          const document = editor.document!;
          var textEdits = await tabFormatter.insertTabStopsComment(document, editor.selections);
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
        logExtensionMessage("* indentTabStopCommand");
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
          await vscode.window.showErrorMessage("Formatter TAB Problem");
          console.error(error);
        }
      })
    );
    const outdentTabStopCommand = "spin2.outdentTabStop";

    context.subscriptions.push(
      vscode.commands.registerCommand(outdentTabStopCommand, async () => {
        logExtensionMessage("* outdentTabStopCommand");
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
          await vscode.window.showErrorMessage("Formatter Shift+TAB Problem");
          console.error(error);
        }
      })
    );
  }

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

    //vscode.workspace.onDidChangeTextDocument(textDocumentChanged),

    vscode.workspace.onDidChangeConfiguration(configurationChanged),

    statusBarItem
  );

  vscode.workspace.onDidChangeTextDocument(
    (event) => {
      vscode.window.visibleTextEditors.map((editor) => {
        if (editor.document === event.document) {
          if (isSpinOrPasmDocument(editor.document)) {
            logExtensionMessage(`* onDidChangeTextDocument(${editor.document.fileName})`);
            const isSpin1Doc: boolean = isSpin1Document(editor.document);
            const docFindings = isSpin1Doc ? spin1SemanticTokensProvider.docFindings() : spin2SemanticTokensProvider.docFindings();
            codeBlockColorizer.updateRegionColors(editor, docFindings, "Ext-docDidChg");
          }
        }
      });
    },
    null,
    context.subscriptions
  );

  // ----------------------------------------------------------------------------
  //   Object Tree View Provider
  //
  //vscode.window.registerTreeDataProvider("objectDependencies", objTreeProvider);
  var objDepTreeView: vscode.TreeView<Dependency>;

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
  let argumentInterp: string = "undefined";
  if (textEditor != null && textEditor !== undefined) {
    if (isSpinOrPasmDocument(textEditor.document)) {
      argumentInterp = textEditor.document.fileName;
    } else {
      argumentInterp = "-- NOT-SPIN-WINDOW --";
    }
  }
  logExtensionMessage(`* activeTextEditorChanged(${argumentInterp}) ENTRY`);

  if (textEditor !== undefined) {
    const document = textEditor.document!;
    if (isSpinOrPasmDocument(document)) {
      logExtensionMessage(`-- colorizing [${document.fileName}]`);
      const isSpin1Doc: boolean = isSpin1Document(document);
      const docFindings = isSpin1Doc ? spin1SemanticTokensProvider.docFindings() : spin2SemanticTokensProvider.docFindings();
      codeBlockColorizer.updateRegionColors(textEditor, docFindings, "Ext-actvEditorChg");
    }
  }

  if (textEditor == null || textEditor === undefined) {
    updateStatusBarItem(null);
    textEditor = vscode.window.activeTextEditor;
  }

  if (textEditor) {
    const mode = getMode(textEditor);
    updateStatusBarItem(mode);

    // post information to out-side world via our CONTEXT
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

const configurationChanged = () => {
  const previousPerEditor = configuration.perEditor;
  const previousShowInStatusBar = getShowInStatusBar();
  logExtensionMessage("* configurationChanged");

  // tell tabFormatter that is might have changed, too
  tabFormatter.updateTabConfiguration();

  codeBlockColorizer.updateColorizerConfiguration();

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
    if (textEditor != null) {
      activeTextEditorChanged(textEditor);
    }
  } else {
    activeTextEditorChanged();
  }
};

function toggleCommand() {
  const textEditor = vscode.window.activeTextEditor;
  logExtensionMessage("* toggle");
  if (textEditor == null) {
    return;
  }

  toggleMode(textEditor);
  activeTextEditorChanged(textEditor);
}

function toggleCommand2State() {
  const textEditor = vscode.window.activeTextEditor;
  logExtensionMessage("* toggle2State");
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

function typeCommand(args: { text: string }) {
  const editor = vscode.window.activeTextEditor;
  var editMode: eEditMode = eEditMode.INSERT;
  if (editor == undefined) {
    //logExtensionMessage("* VSCode type (early)");
    vscode.commands.executeCommand("default:type", args);
    return;
  }
  if (extensionDebugLogEnabled) {
    const firstChar: number = args.text.charCodeAt(0);
    if (args.text.length == 1 && firstChar < 0x20) {
      logExtensionMessage("* type [0x" + firstChar.toString(16) + "](" + args.text.length + ")");
    } else {
      logExtensionMessage("* type [" + args.text + "](" + args.text.length + ")");
    }
  }
  if (editor != undefined) {
    editMode = getMode(editor);
  }
  if (editor != undefined && tabFormatter.isEnbled() && editMode == eEditMode.OVERTYPE) {
    logExtensionMessage("* OVERTYPE type");
    overtypeBeforeType(editor, args.text, false);
  } else if (editor != undefined && tabFormatter.isEnbled() && editMode == eEditMode.ALIGN) {
    tabFormatter.alignBeforeType(editor, args.text, false);
  } else {
    //logExtensionMessage("* VSCode type");
    vscode.commands.executeCommand("default:type", args);
  }
}

function deleteLeftCommand() {
  const editor = vscode.window.activeTextEditor;
  logExtensionMessage("* deleteLeft");
  var bAlignEdit: boolean = editor != undefined && tabFormatter.isEnbled();
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
    //logExtensionMessage("* VSCode deleteLeft");
    return vscode.commands.executeCommand("deleteLeft");
  }
}

function deleteRightCommand() {
  const editor = vscode.window.activeTextEditor;
  logExtensionMessage("* deleteRight");
  if (tabFormatter.isEnbled() && editor && getMode(editor) == eEditMode.ALIGN) {
    tabFormatter.alignDelete(editor, true);
    return null;
  } else {
    //logExtensionMessage("* VSCode deleteRight");
    return vscode.commands.executeCommand("deleteRight");
  }
}

function pasteCommand(args: { text: string; pasteOnNewLine: boolean }) {
  const editor = vscode.window.activeTextEditor;
  if (editor != undefined) {
    logExtensionMessage("* paste");
    if (getMode(editor) == eEditMode.OVERTYPE && configuration.overtypePaste) {
      // TODO: Make paste work with align
      logExtensionMessage("* OVERTYPE paste");
      overtypeBeforePaste(editor, args.text, args.pasteOnNewLine);
      return vscode.commands.executeCommand("default:paste", args);
    } else if (tabFormatter.isEnbled() && getMode(editor) == eEditMode.ALIGN && !args.pasteOnNewLine) {
      tabFormatter.alignBeforeType(editor, args.text, true);
      return null;
    } else {
      //logExtensionMessage("* VSCode paste");
      return vscode.commands.executeCommand("default:paste", args);
    }
  }
  return null;
}

function applyTextEdits(document: vscode.TextDocument, textEdits: vscode.TextEdit[]) {
  if (!textEdits) {
    return;
  }
  const workEdits = new vscode.WorkspaceEdit();
  workEdits.set(document.uri, textEdits); // give the edits
  vscode.workspace.applyEdit(workEdits); // apply the edits
}
