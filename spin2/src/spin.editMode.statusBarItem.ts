"use strict";
import * as vscode from "vscode";

import { configuration } from "./spin.editMode.configuration";
import { eEditMode } from "./spin.editMode.mode";

let statusBarItem: vscode.StatusBarItem | null;

export const createStatusBarItem = () => {
  if (statusBarItem != null) {
    return statusBarItem;
  }

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
  statusBarItem.command = "spin2.insertMode.rotate";
  statusBarItem.show();

  updateStatusBarItem(null);

  return statusBarItem;
};

export const destroyStatusBarItem = () => {
  if (statusBarItem == null) {
    return;
  }

  statusBarItem.hide();
  statusBarItem = null;
};

export const updateStatusBarItem = (insertMode: eEditMode | null) => {
  if (statusBarItem == null) {
    return;
  }

  if (insertMode === null) {
    statusBarItem.text = "";
    statusBarItem.tooltip = "";

    statusBarItem.hide();
    return;
  }

  let sbiText;

  if (insertMode == eEditMode.OVERTYPE) {
    sbiText = configuration.labelOvertypeMode;
    statusBarItem.tooltip = "Overtype Mode, click to change to Align Mode (if enabled) or Insert Mode";
  } else if (insertMode == eEditMode.INSERT) {
    sbiText = configuration.labelInsertMode;
    statusBarItem.tooltip = "Insert Mode, click to change to Overtype Mode";
  } else if (insertMode == eEditMode.ALIGN) {
    sbiText = configuration.labelAlignMode;
    statusBarItem.tooltip = "Align Mode, click to change to Insert Mode";
  }
  if (sbiText === undefined || sbiText == null) sbiText = "";

  // preparation for https://github.com/DrMerfy/vscode-overtype/issues/2
  // if (configuration.showCapsLockState && capsLockOn) {
  //     statusBarItem.text = sbiText.toUpperCase();
  // } else {
  statusBarItem.text = sbiText.toString();
  // }

  statusBarItem.show();
};
