"use strict";
import * as vscode from "vscode";

import { configuration } from "./spin.insertMode.configuration";

export enum EditorMode {
  INSERT,
  OVERTYPE,
  ALIGN,
}

const defaultMode = EditorMode.INSERT;

const state = {
  global: defaultMode,
  perEditor: new WeakMap<vscode.TextEditor, EditorMode>(),
};

export const getMode = (textEditor: vscode.TextEditor) => {
  if (!configuration.perEditor) {
    return state.global;
  }

  if (!state.perEditor.has(textEditor)) {
    state.perEditor.set(textEditor, defaultMode);
  }

  return state.perEditor.get(textEditor) as EditorMode;
};

export function nextMode(oldMode: EditorMode) {
  switch (oldMode) {
    case EditorMode.INSERT:
      return EditorMode.OVERTYPE;
    case EditorMode.OVERTYPE:
      return configuration.enableAlign ? EditorMode.ALIGN : EditorMode.INSERT;
    case EditorMode.ALIGN:
      return EditorMode.INSERT;
    default:
      return EditorMode.INSERT;
  }
}

export function nextMode2State(oldMode: EditorMode) {
  switch (oldMode) {
    case EditorMode.INSERT:
      return configuration.enableAlign ? EditorMode.ALIGN : EditorMode.INSERT;
    case EditorMode.ALIGN:
      return EditorMode.INSERT;
    default:
      return EditorMode.INSERT;
  }
}

export function modeName(mode: EditorMode) {
  switch (mode) {
    case EditorMode.INSERT:
      return "Insert";
    case EditorMode.OVERTYPE:
      return "Overtype";
    case EditorMode.ALIGN:
      return "Align";
    default:
      return "(ERROR)";
  }
}

export const toggleMode = (textEditor: vscode.TextEditor) => {
  const upcomingMode: EditorMode = nextMode(getMode(textEditor));

  if (!configuration.perEditor) {
    state.global = upcomingMode;
  } else {
    state.perEditor.set(textEditor, upcomingMode);
  }

  return upcomingMode;
};

export const toggleMode2State = (textEditor: vscode.TextEditor) => {
  const upcomingMode: EditorMode = nextMode2State(getMode(textEditor));

  if (!configuration.perEditor) {
    state.global = upcomingMode;
  } else {
    state.perEditor.set(textEditor, upcomingMode);
  }

  return upcomingMode;
};

export const resetModes = (mode: EditorMode | null, perEditor: boolean) => {
  if (mode === null) {
    mode = defaultMode;
  }

  if (perEditor) {
    // when switching from global to per-editor, reset the global mode to default
    // and (currently impossible) set all editors to the provided mode

    // future: this should enumerate all open editors and set their mode explicitly
    // tracking: https://github.com/Microsoft/vscode/issues/15178

    state.global = defaultMode;
    state.perEditor = state.perEditor = new WeakMap<vscode.TextEditor, EditorMode>();
  } else {
    // when switching from per-editor to global, set the global mode to the
    // provided mode and reset all per-editor modes

    state.global = mode;
    state.perEditor = state.perEditor = new WeakMap<vscode.TextEditor, EditorMode>();
  }
};
