"use strict";
import * as vscode from "vscode";

import { configuration } from "./spin.insertMode.configuration";

export enum eInsertMode {
  INSERT,
  OVERTYPE,
  ALIGN,
}

const defaultMode = eInsertMode.INSERT;

const state = {
  global: defaultMode,
  perEditor: new WeakMap<vscode.TextEditor, eInsertMode>(),
};

export const getMode = (textEditor: vscode.TextEditor) => {
  if (!configuration.perEditor) {
    return state.global;
  }

  if (!state.perEditor.has(textEditor)) {
    state.perEditor.set(textEditor, defaultMode);
  }

  return state.perEditor.get(textEditor) as eInsertMode;
};

export function nextMode(oldMode: eInsertMode): eInsertMode {
  switch (oldMode) {
    case eInsertMode.INSERT:
      return eInsertMode.OVERTYPE;
    case eInsertMode.OVERTYPE:
      return configuration.enableAlign ? eInsertMode.ALIGN : eInsertMode.INSERT;
    case eInsertMode.ALIGN:
      return eInsertMode.INSERT;
    default:
      return eInsertMode.INSERT;
  }
}

export function nextMode2State(oldMode: eInsertMode): eInsertMode {
  switch (oldMode) {
    case eInsertMode.INSERT:
      return configuration.enableAlign ? eInsertMode.ALIGN : eInsertMode.INSERT;
    case eInsertMode.ALIGN:
      return eInsertMode.INSERT;
    default:
      return eInsertMode.INSERT;
  }
}

export function modeName(mode: eInsertMode): string {
  switch (mode) {
    case eInsertMode.INSERT:
      return "Insert";
    case eInsertMode.OVERTYPE:
      return "Overtype";
    case eInsertMode.ALIGN:
      return "Align";
    default:
      return "(ERROR)";
  }
}

export const toggleMode = (textEditor: vscode.TextEditor) => {
  const upcomingMode: eInsertMode = nextMode(getMode(textEditor));

  if (!configuration.perEditor) {
    state.global = upcomingMode;
  } else {
    state.perEditor.set(textEditor, upcomingMode);
  }

  return upcomingMode;
};

export const toggleMode2State = (textEditor: vscode.TextEditor) => {
  const upcomingMode: eInsertMode = nextMode2State(getMode(textEditor));

  if (!configuration.perEditor) {
    state.global = upcomingMode;
  } else {
    state.perEditor.set(textEditor, upcomingMode);
  }

  return upcomingMode;
};

export const resetModes = (mode: eInsertMode | null, perEditor: boolean) => {
  if (mode === null) {
    mode = defaultMode;
  }

  if (perEditor) {
    // when switching from global to per-editor, reset the global mode to default
    // and (currently impossible) set all editors to the provided mode

    // future: this should enumerate all open editors and set their mode explicitly
    // tracking: https://github.com/Microsoft/vscode/issues/15178

    state.global = defaultMode;
    state.perEditor = state.perEditor = new WeakMap<vscode.TextEditor, eInsertMode>();
  } else {
    // when switching from per-editor to global, set the global mode to the
    // provided mode and reset all per-editor modes

    state.global = mode;
    state.perEditor = state.perEditor = new WeakMap<vscode.TextEditor, eInsertMode>();
  }
};
