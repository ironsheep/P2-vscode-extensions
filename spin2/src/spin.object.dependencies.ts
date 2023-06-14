"use strict";

// https://code.visualstudio.com/api/ux-guidelines/views
// https://code.visualstudio.com/api/extension-guides/tree-view#treeview
// https://code.visualstudio.com/api/extension-guides/tree-view#view-container
// icons
//   https://code.visualstudio.com/api/references/icons-in-labels

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

enum eParseState {
  Unknown = 0,
  inCon,
  inDat,
  inObj,
  inPub,
  inPri,
  inVar,
  inPasmInline,
  inDatPasm,
  inMultiLineComment,
  inMultiLineDocComment,
  inNothing,
}

export class ObjectTreeProvider implements vscode.TreeDataProvider<Dependency> {
  private rootPath: string | undefined = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0 ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
  private bFixHierToTopLevel: boolean = false;
  private topLevelFSpec: string = "";
  private topLevelFName: string = "";

  private objTreeDebugLogEnabled: boolean = false;
  private objTreeLog: any = undefined;

  private isDocument: boolean = false;
  private canExpand: boolean = true;
  private forceCollapse: boolean = false;
  private forceExpand: boolean = false;

  private countAll: number = 0;
  private countExpanded: number = 0;
  private countCollapsed: number = 0;

  // https://code.visualstudio.com/api/extension-guides/tree-view#view-container
  private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined | null | void> = new vscode.EventEmitter<Dependency | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<Dependency | undefined | null | void> = this._onDidChangeTreeData.event;

  constructor(outputChannel: vscode.OutputChannel | undefined, formatDebugLogEnabled: boolean) {
    this.objTreeDebugLogEnabled = formatDebugLogEnabled;
    // save output channel
    this.objTreeLog = outputChannel;

    // add subscriptions
    vscode.window.onDidChangeActiveTextEditor(() => this.onActiveEditorChanged());
    // vscode.workspace.onDidChangeTextDocument(e => this.onDocumentChanged(e));

    if (!this.rootPath) {
      this.logMessage("+ (DBG) ObjDep: no root path!");
    } else {
      const topFileBaseName: string | undefined = vscode.workspace.getConfiguration().get("topLevel"); // this worked!
      this.logMessage(`+ (DBG) ObjDep: rootPath=[${this.rootPath}]`);
      this.logMessage(`+ (DBG) ObjDep: topFileBaseName=[${topFileBaseName}]`);
      if (topFileBaseName) {
        this.bFixHierToTopLevel = true;
        const fileBasename = this._filenameWithSpinFileType(topFileBaseName);
        this.topLevelFSpec = path.join(this.rootPath, fileBasename);
        if (!this._pathExists(this.topLevelFSpec)) {
          this.logMessage(`+ (DBG) ObjDep: FILE NOT FOUND! [${this.topLevelFSpec}]!`);
          this.bFixHierToTopLevel = false;
        }
      }
    }

    if (!this.bFixHierToTopLevel) {
      this.logMessage(`+ (DBG) ObjDep: failed to ID top file for workspace`);
      this.topLevelFSpec = this._getActiveFile();
      this.logMessage(`+ (DBG) ObjDep: NO TOP/curr, using activeFile=[${this.topLevelFSpec}]`);
      if (this.topLevelFSpec.length == 0) {
        // ERROR failed to ID open file (or file not open)
      }
    } else {
      this.logMessage(`+ (DBG) ObjDep: topLevelFSpec=[${this.topLevelFSpec}]`);
    }

    this.rootPath = path.dirname(this.topLevelFSpec);
    this.topLevelFName = path.basename(this.topLevelFSpec);

    // cause our initial statuses to be exposed
    this.onActiveEditorChanged(); // sideeffect: showing tree-view
    this.collapseAll(); // sideeffect: showing expandAll button
  }

  /**
   * write message to formatting log (when log enabled)
   *
   * @param the message to be written
   * @returns nothing
   */
  logMessage(message: string): void {
    if (this.objTreeDebugLogEnabled && this.objTreeLog != undefined) {
      //Write to output window.
      this.objTreeLog.appendLine(message);
    }
  }

  getTreeItem(element: Dependency): vscode.TreeItem {
    this.logMessage(`+ (DBG) ObjDep: getTreeItem(${element.label})`);
    this._dumpElement("GET-ITEM", element);
    // mark what we've been seeing
    this.countAll++;
    if (element.collapsibleState == vscode.TreeItemCollapsibleState.Collapsed) {
      this.countCollapsed++;
    } else if (element.collapsibleState == vscode.TreeItemCollapsibleState.Expanded) {
      this.countExpanded++;
    }
    // show ending count values
    this.logMessage(`+ (DBG) ObjDep: ---- all=(${this.countAll}), expanded=(${this.countExpanded}), collapsed=(${this.countCollapsed})`);
    return element;
  }

  getChildren(element?: Dependency): Thenable<Dependency[]> {
    if (!this.rootPath) {
      vscode.window.showInformationMessage("No dependency in empty workspace");
      let noDepMsg = new Dependency("No object references in empty workspace", "", vscode.TreeItemCollapsibleState.None);
      noDepMsg.removeIcon(); // this is message, don't show icon
      return Promise.resolve([noDepMsg]);
    }

    let subDeps: Dependency[] = [];
    if (element) {
      this.logMessage(`+ (DBG) ObjDep: getChildren() element=[${element?.label}] ---- ENTRY`);
      // get for underlying file
      const fileBasename = this._filenameWithSpinFileType(element.label);
      const fileSpec = path.join(this.rootPath, fileBasename);
      if (!this._pathExists(fileSpec)) {
        this.logMessage(`+ (DBG) ObjDep: getChildren() element=[${fileBasename}] has (???) deps - MISSING FILE`);
        let topState: vscode.TreeItemCollapsibleState = this._stateForDependCount(0); // message
        const noFileDepMsg = new Dependency(element.label, element.descriptionString, topState);
        noFileDepMsg.setFileMissing();
        subDeps.push(noFileDepMsg);
      } else {
        const spinDeps = this._getDepsFromSpinFile(fileSpec);
        this.logMessage(`+ (DBG) ObjDep: getChildren() element=[${fileBasename}] has (${spinDeps.length}) deps`);
        spinDeps.forEach((depency) => {
          const depFileSpec = path.join(this.rootPath!, depency.baseName);
          // huh, is this if really needed?
          if (this._pathExists(depFileSpec)) {
            const subSpinDeps = this._getDepsFromSpinFile(depFileSpec);
            let expansionState: vscode.TreeItemCollapsibleState = this._stateForDependCount(subSpinDeps.length);
            const subDep = new Dependency(depency.baseName, depency.knownAs, expansionState);
            this._dumpElement("MAKE-CHILD", subDep);
            subDeps.push(subDep);
          } else {
            let topState: vscode.TreeItemCollapsibleState = this._stateForDependCount(0); // message
            const noFileDepMsg = new Dependency(depency.baseName, depency.knownAs, topState);
            noFileDepMsg.setFileMissing();
            subDeps.push(noFileDepMsg);
          }
        });
      }
      this.logMessage(`+ (DBG) ObjDep: getChildren() element=[${element?.label}] ---- EXIT`);
    } else {
      this.logMessage(`+ (DBG) ObjDep: getChildren() topLevel ---- ENTRY`);
      // get for project top level file
      this.countAll = 0;
      this.countExpanded = 0;
      this.countCollapsed = 0;

      let spinDeps = [];
      if (this.isDocument) {
        let textEditor = vscode.window.activeTextEditor;
        if (textEditor) {
          spinDeps = this._getDepsFromDocument(textEditor.document);
        }
      } else {
        spinDeps = this._getDepsFromSpinFile(this.topLevelFSpec);
      }
      this.logMessage(`+ (DBG) ObjDep: getChildren() topLevel has (${spinDeps.length}) deps`);
      let expansionState: vscode.TreeItemCollapsibleState = this._stateForDependCount(spinDeps.length);
      if (spinDeps.length > 0) {
        expansionState = vscode.TreeItemCollapsibleState.Expanded; // always leave top-level expanded?
      }
      if (spinDeps.length > 0) {
        const topDep = new Dependency(this.topLevelFName, "(top-file)", expansionState);
        this._dumpElement("MAKE-TOP", topDep);
        subDeps.push(topDep);
      } else {
        //vscode.window.showInformationMessage("Workspace has no package.json");
        let emptyMessage: string = "No object references found in `" + `${this.topLevelFName}` + "`";
        let emptyDepMsg = new Dependency(emptyMessage, "", vscode.TreeItemCollapsibleState.None);
        emptyDepMsg.removeIcon(); // this is message, don't show icon
        subDeps.push(emptyDepMsg);
      }
      this.logMessage(`+ (DBG) ObjDep: getChildren() topLevel ---- EXIT`);
    }
    return Promise.resolve(subDeps);
  }

  onElementClick(element: Dependency | undefined): void {
    this.logMessage(`+ (DBG) ObjDep: onElementClick() element=[${element?.label}]`);
    if (!element?.isFileMissing() && this.rootPath && element) {
      const fileFSpec: string = path.join(this.rootPath, element.label);
      this._showDocument(fileFSpec);
    }
  }

  // getParent(element: Dependency): Thenable<Dependency | undefined | null> {
  //
  //}
  expandAll(): void {
    this.logMessage(`+ (DBG) ObjDep: expandAll()`);
    this.forceCollapse = false;
    this.forceExpand = true;
    this.logMessage("+ (DBG) ObjDep: ---- fire DidChangeTreeData ----");
    this._onDidChangeTreeData.fire();
    vscode.commands.executeCommand("setContext", "spin2.objectDeps.expanded", true);
    this.canExpand = false;
  }

  collapseAll(): void {
    this.logMessage(`+ (DBG) ObjDep: collapseAll()`);
    this.forceCollapse = true;
    this.forceExpand = false;
    this.logMessage("+ (DBG) ObjDep: ---- fire DidChangeTreeData ----");
    this._onDidChangeTreeData.fire();
    vscode.commands.executeCommand("setContext", "spin2.objectDeps.expanded", false);
    this.canExpand = true;
  }

  refresh(): void {
    this.logMessage("+ (DBG) ObjDep: refresh()");
    this.logMessage("+ (DBG) ObjDep: ---- fire DidChangeTreeData ----");
    this._onDidChangeTreeData.fire();
  }

  destroyContextState(): void {
    this.logMessage("+ (DBG) ObjDep: destroyContextState()");
    vscode.commands.executeCommand("setContext", "spin2.objectDeps.expanded", undefined);
    vscode.commands.executeCommand("setContext", "spin2.objectDeps.enabled", undefined);
  }

  private _elementStateString(collapsibleState: vscode.TreeItemCollapsibleState): string {
    let diagString: string = "???";
    if (collapsibleState == vscode.TreeItemCollapsibleState.None) {
      diagString = "None";
    } else if (collapsibleState == vscode.TreeItemCollapsibleState.Expanded) {
      diagString = "Expanded";
    } else if (collapsibleState == vscode.TreeItemCollapsibleState.Collapsed) {
      diagString = "Collapsed";
    }
    return diagString;
  }

  private _dumpElement(srcId: string, element: Dependency | undefined): void {
    if (element) {
      const diagString: string = this._elementStateString(element.collapsibleState);
      this.logMessage(`+ (DBG) ObjDep: --- ${srcId}: [${element?.label}], [${element?.descriptionString}], [${diagString}]`);
    } else {
      this.logMessage(`+ (DBG) ObjDep: --- ${srcId}: element=[undefined]`);
    }
  }

  private async _showDocument(fileFSpec: string) {
    this.logMessage(`+ (DBG) ObjDep: _showDocument() [${fileFSpec}]`);
    let textDocument = await vscode.workspace.openTextDocument(fileFSpec);
    await vscode.window.showTextDocument(textDocument, { preview: false });
  }

  private _filenameWithSpinFileType(filename: string): string {
    const bHasFileType: boolean = filename.includes(".spin") ? true : false; // matches .spin and .spin2
    let desiredName: string = filename;
    if (!bHasFileType) {
      desiredName = filename + ".spin";
      if (!this._pathExists(desiredName)) {
        desiredName = filename + ".spin2";
      }
    }
    return desiredName;
  }

  private _getActiveFile(): string {
    const textEditor = vscode.window.activeTextEditor;
    let foundFSpec: string = "";
    if (textEditor) {
      if (textEditor.document.uri.scheme === "file") {
        this.isDocument = true; // we're loading initial deps from current tab, not file!
        var currentlyOpenTabFSpec = textEditor.document.uri.fsPath;
        var currentlyOpenTabfolderName = path.dirname(currentlyOpenTabFSpec);
        var currentlyOpenTabfileName = path.basename(currentlyOpenTabFSpec);
        this.logMessage(`+ (DBG) ObjDep: fsPath-(${currentlyOpenTabFSpec})`);
        this.logMessage(`+ (DBG) ObjDep: folder-(${currentlyOpenTabfolderName})`);
        this.logMessage(`+ (DBG) ObjDep: filename-(${currentlyOpenTabfileName})`);
        if (currentlyOpenTabfileName.includes(".spin")) {
          // matches .spin and .spin2
          foundFSpec = currentlyOpenTabFSpec;
        }
      }
    }
    return foundFSpec;
  }

  private onActiveEditorChanged(): void {
    // if we are not fixes
    if (vscode.window.activeTextEditor) {
      if (!this.bFixHierToTopLevel) {
        const fileFSpec: string = this._getActiveFile();
        const enabled: boolean = fileFSpec.includes(".spin") ? true : false; // matches .spin and .spin2
        vscode.commands.executeCommand("setContext", "spin2.objectDeps.enabled", enabled);
        if (enabled) {
          // set new file top
          this.topLevelFSpec = fileFSpec;
          this.topLevelFName = path.basename(this.topLevelFSpec);
          this.rootPath = path.dirname(this.topLevelFSpec);
          this.logMessage(`+ (DBG) ObjDep: onActiveEditorChanged() topLevelFSpec=[${this.topLevelFSpec}]`);
          this.refresh();
        }
      } else {
        // we have topLevel for this workspace, stay enabled
        vscode.commands.executeCommand("setContext", "spin2.objectDeps.enabled", true);
      }
    } else {
      vscode.commands.executeCommand("setContext", "spin2.objectDeps.enabled", false);
    }
  }

  /*
private onDocumentChanged(changeEvent: vscode.TextDocumentChangeEvent): void {
    if (this.tree && this.autoRefresh && changeEvent.document.uri.toString() === this.editor?.document.uri.toString()) {
        for (const change of changeEvent.contentChanges) {
            const path = json.getLocation(this.text, this.editor.document.offsetAt(change.range.start)).path;
            path.pop();
            const node = path.length ? json.findNodeAtLocation(this.tree, path) : void 0;
            this.parseTree();
            this._onDidChangeTreeData.fire(node ? node.offset : void 0);
        }
    }
}*/

  private _getDepsFromDocument(activeEditDocument: vscode.TextDocument): SpinObject[] {
    this.logMessage(`+ (DBG) ObjDep: _getDepsFromDocument()`);
    let currState: eParseState = eParseState.inCon; // compiler defaults to CON at start!
    let priorState: eParseState = currState;
    let deps = [];
    for (let i = 0; i < activeEditDocument.lineCount; i++) {
      let line = activeEditDocument.lineAt(i);
      const trimmedLine = line.text.trim();
      if (trimmedLine.length == 0) {
        continue; // skip blank lines
      }
      // skip all {{ --- }} multi-line doc comments
      if (currState == eParseState.inMultiLineDocComment) {
        // in multi-line doc-comment, hunt for end '}}' to exit
        let closingOffset = line.text.indexOf("}}");
        if (closingOffset != -1) {
          // have close, comment ended
          currState = priorState;
        }
        continue;
      } else if (currState == eParseState.inMultiLineComment) {
        // in multi-line non-doc-comment, hunt for end '}' to exit
        let closingOffset = trimmedLine.indexOf("}");
        if (closingOffset != -1) {
          // have close, comment ended
          currState = priorState;
        }
        //  DO NOTHING
        continue;
      } else if (trimmedLine.startsWith("{{")) {
        // process multi-line doc comment
        let openingOffset = line.text.indexOf("{{");
        const closingOffset = line.text.indexOf("}}", openingOffset + 2);
        if (closingOffset == -1) {
          // is open of multiline comment
          priorState = currState;
          currState = eParseState.inMultiLineDocComment;
        }
        continue;
      } else if (trimmedLine.startsWith("{")) {
        // process possible multi-line non-doc comment
        // do we have a close on this same line?
        let openingOffset = trimmedLine.indexOf("{");
        const closingOffset = trimmedLine.indexOf("}", openingOffset + 1);
        if (closingOffset == -1) {
          // is open of multiline comment wihtout close
          priorState = currState;
          currState = eParseState.inMultiLineComment;
        }
        continue;
      } else if (trimmedLine.startsWith("''")) {
        // process single-line doc comment
        continue;
      } else if (trimmedLine.startsWith("'")) {
        // process single-line non-doc comment
        continue;
      }
      const sectionStatus = this._isSectionStartLine(line.text);
      if (sectionStatus.isSectionStart) {
        priorState = currState;
        currState = sectionStatus.inProgressStatus;
      }
      //this.logMessage(`+ (DBG) ObjDep: _getDepsFromSpinFile() eval trimmedLine=[${trimmedLine}]`);
      if (currState == eParseState.inObj && trimmedLine.includes(":")) {
        const spinObj = this._spinDepFromObjectLine(trimmedLine);
        if (spinObj) {
          this.logMessage(`+ (DBG) ObjDep: _getDepsFromDocument() basename=[${spinObj.baseName}] known as (${spinObj.knownAs})`);
          deps.push(spinObj);
        } else {
          this.logMessage(`+ (DBG) ObjDep: _getDepsFromDocument() BAD parse of OBJ line [${trimmedLine}]`);
        }
      }
    }
    this.logMessage(`+ (DBG) ObjDep:   -- returns ${deps.length} dep(s)`);
    return deps;
  }

  private _stateForDependCount(nbrDeps: number): vscode.TreeItemCollapsibleState {
    // determine initial state of tree entry
    let interpState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None;
    if (nbrDeps > 0) {
      if (this.forceCollapse) {
        // user is closing the tree except for top level
        interpState = vscode.TreeItemCollapsibleState.Collapsed;
      } else if (this.forceExpand) {
        // user is opening the entire tree !
        interpState = vscode.TreeItemCollapsibleState.Expanded;
      } else {
        interpState = vscode.TreeItemCollapsibleState.Collapsed;
      }
      if (interpState == vscode.TreeItemCollapsibleState.Collapsed) {
        this.canExpand = true;
      }
    }
    return interpState;
  }

  private _getDepsFromSpinFile(fileSpec: string): SpinObject[] {
    let deps = [];
    this.logMessage(`+ (DBG) ObjDep: _getDepsFromSpinFile(${fileSpec})`);
    if (this._pathExists(fileSpec)) {
      const spinFileContent = fs.readFileSync(fileSpec, "utf-8");
      let lines = spinFileContent.split("\r\n");
      if (lines.length == 1) {
        // file not CRLF is LF only!
        lines = spinFileContent.split("\n");
      }
      this.logMessage(`+ (DBG) ObjDep: file has (${lines.length}) lines`);

      let currState: eParseState = eParseState.inCon; // compiler defaults to CON at start!
      let priorState: eParseState = currState;
      for (let i = 0; i < lines.length; i++) {
        let text = lines[i];
        const trimmedLine = text.trim();
        if (trimmedLine.length == 0) {
          continue; // skip blank lines
        }
        // skip all {{ --- }} multi-line doc comments
        if (currState == eParseState.inMultiLineDocComment) {
          // in multi-line doc-comment, hunt for end '}}' to exit
          let closingOffset = text.indexOf("}}");
          if (closingOffset != -1) {
            // have close, comment ended
            currState = priorState;
          }
          continue;
        } else if (currState == eParseState.inMultiLineComment) {
          // in multi-line non-doc-comment, hunt for end '}' to exit
          let closingOffset = trimmedLine.indexOf("}");
          if (closingOffset != -1) {
            // have close, comment ended
            currState = priorState;
          }
          continue;
        } else if (trimmedLine.startsWith("{{")) {
          // process multi-line doc comment
          let openingOffset = text.indexOf("{{");
          const closingOffset = text.indexOf("}}", openingOffset + 2);
          if (closingOffset == -1) {
            // is open of multiline comment
            priorState = currState;
            currState = eParseState.inMultiLineDocComment;
          }
          continue;
        } else if (trimmedLine.startsWith("{")) {
          // process possible multi-line non-doc comment
          // do we have a close on this same line?
          let openingOffset = trimmedLine.indexOf("{");
          const closingOffset = trimmedLine.indexOf("}", openingOffset + 1);
          if (closingOffset == -1) {
            // is open of multiline comment
            priorState = currState;
            currState = eParseState.inMultiLineComment;
          }
          continue;
        } else if (trimmedLine.startsWith("''")) {
          // process single-line doc comment
          continue;
        } else if (trimmedLine.startsWith("'")) {
          // process single-line non-doc comment
          continue;
        }
        const sectionStatus = this._isSectionStartLine(text);
        if (sectionStatus.isSectionStart) {
          priorState = currState;
          currState = sectionStatus.inProgressStatus;
        }
        //this.logMessage(`+ (DBG) ObjDep: _getDepsFromSpinFile() eval trimmedLine=[${trimmedLine}]`);
        if (currState == eParseState.inObj && trimmedLine.includes(":")) {
          const spinObj = this._spinDepFromObjectLine(trimmedLine);
          if (spinObj) {
            this.logMessage(`+ (DBG) ObjDep: _getDepsFromSpinFile() basename=[${spinObj.baseName}] known as (${spinObj.knownAs})`);
            deps.push(spinObj);
          } else {
            this.logMessage(`+ (DBG) ObjDep: _getDepsFromSpinFile() BAD parse of OBJ line [${trimmedLine}]`);
          }
        }
      }
    } else {
      this.logMessage(`+ (DBG) ObjDep: NOT FOUND! file=(${fileSpec})`);
    }
    this.logMessage(`+ (DBG) ObjDep:   -- returns ${deps.length} dep(s)`);
    return deps;
  }

  private _spinDepFromObjectLine(objLine: string): SpinObject | undefined {
    let desiredSpinObj = undefined;
    const lineParts = objLine.split(/[ \t\":]/).filter(Boolean);
    //this.logMessage(`+ (DBG) ObjDep: _spinDepFromObjectLine() lineParts=[${lineParts}]`);
    if (lineParts.length >= 3) {
      const partIndex: number = lineParts[0].toLowerCase().includes("obj") ? 1 : 0;
      const objName = lineParts[partIndex + 0];
      const filename = lineParts[partIndex + 1];
      const spinCodeFileName: string = this._filenameWithSpinFileType(filename);
      desiredSpinObj = new SpinObject(spinCodeFileName, objName);
    }
    return desiredSpinObj;
  }

  private _isSectionStartLine(line: string): {
    isSectionStart: boolean;
    inProgressStatus: eParseState;
  } {
    // return T/F where T means our string starts a new section!
    let startStatus: boolean = false;
    let inProgressState: eParseState = eParseState.Unknown;
    if (line.length > 2) {
      const lineParts: string[] = line.split(/[ \t]/);
      if (lineParts.length > 0) {
        const sectionName: string = lineParts[0].toUpperCase();
        startStatus = true;
        if (sectionName === "CON") {
          inProgressState = eParseState.inCon;
        } else if (sectionName === "DAT") {
          inProgressState = eParseState.inDat;
        } else if (sectionName === "OBJ") {
          inProgressState = eParseState.inObj;
        } else if (sectionName === "PUB") {
          inProgressState = eParseState.inPub;
        } else if (sectionName === "PRI") {
          inProgressState = eParseState.inPri;
        } else if (sectionName === "VAR") {
          inProgressState = eParseState.inVar;
        } else {
          startStatus = false;
        }
      }
    }
    if (startStatus && inProgressState == eParseState.inObj) {
      this.logMessage("** isSectStart line=[" + line + "], enum(" + inProgressState + ")");
    }
    return {
      isSectionStart: startStatus,
      inProgressStatus: inProgressState,
    };
  }

  private _pathExists(p: string): boolean {
    try {
      fs.accessSync(p);
    } catch (err) {
      return false;
    }
    return true;
  }
}

// class ProviderResult: Dependency | undefined | null | Thenable<Dependency | undefined | null>
class SpinObject {
  public readonly baseName: string = "";
  public readonly knownAs: string = "";

  constructor(public readonly fileBaseName: string, public objName: string) {
    this.baseName = fileBaseName;
    this.knownAs = objName;
  }
}

export class Dependency extends vscode.TreeItem {
  //private icon: vscode.ThemeIcon = new vscode.ThemeIcon("file-code", "#FF8000");
  //private icon: vscode.ThemeIcon = new vscode.ThemeIcon("symbol-field");  // hrmf... blue
  //private icon: vscode.ThemeIcon = new vscode.ThemeIcon("symbol-enum"); // nice, orange!
  //private icon: vscode.ThemeIcon = new vscode.ThemeIcon("symbol-structure"); // hrmf, no color (white)
  private icon: vscode.ThemeIcon = new vscode.ThemeIcon("symbol-class"); // nice, orange!
  private basename: string = "";
  public readonly descriptionString: string = "";
  private fileMissing: boolean = false;
  private topFile: boolean = false;
  // map our fields to underlying TreeItem
  constructor(public readonly label: string, private objName: string, public readonly collapsibleState: vscode.TreeItemCollapsibleState) {
    // element label is  filebasename
    // element description is  object name in containing file
    // element tooltip is filename (object name)
    super(label, collapsibleState);
    this.description = this.objName;
    this.descriptionString = this.objName;
    this.basename = label.replace(".spin2", "");
    this.basename = this.basename.replace(".spin", "");
    if (objName.includes("top-file")) {
      this.topFile = true;
      this.tooltip = `This is the project top-most file`;
    } else {
      this.tooltip = `An instance of ${this.basename} known as ${this.objName}`;
      this.topFile = false;
    }
    //this.iconPath = { light: new vscode.ThemeIcon("file-code").id, dark: new vscode.ThemeIcon("file-code").id };
    //this.resourceUri = new vscode.ThemeIcon('file-code').
    //this.icon = new vscode.ThemeIcon("file-code");  // nope!!
    this.iconPath = this.icon;
    this.contextValue = "dependency";
    this.command = { command: "objectDependencies.activateFile", title: "open file", tooltip: "click to open file", arguments: [this] };
  }

  isTopFile(): boolean {
    return this.topFile;
  }

  isFileMissing(): boolean {
    return this.fileMissing;
  }

  forceCollapse() {
    if (this.collapsibleState == vscode.TreeItemCollapsibleState.Expanded) {
      super.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }
  }

  forceExpand() {
    if (this.collapsibleState == vscode.TreeItemCollapsibleState.Collapsed) {
      super.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    }
  }

  setFileMissing() {
    this.fileMissing = true;
    const origText = this.description;
    if (origText) {
      this.description = `${origText} - MISSING FILE`;
    } else {
      this.description = `- MISSING FILE`;
    }
  }

  removeIcon() {
    // take off icon if we are showing dep as error/warning message
    this.iconPath = undefined;
  }
}
