"use strict";
import * as vscode from "vscode";

export const overtypeBeforeTypeOrig = (editor: vscode.TextEditor, text: string) => {
  // skip overtype behavior when enter is pressed
  if (text === "\r" || text === "\n" || text === "\r\n") {
    return;
  }

  editor.selections = editor.selections.map((selection) => {
    const cursorPosition = selection.start;
    const lineEndPosition = editor.document.lineAt(cursorPosition).range.end;

    if (selection.isEmpty && cursorPosition.character !== lineEndPosition.character) {
      const replaceEnd = cursorPosition.with(cursorPosition.line, cursorPosition.character + 1);
      const replaceSelection = new vscode.Selection(cursorPosition, replaceEnd);

      return replaceSelection;
    } else {
      return selection;
    }
  });
};

export function overtypeBeforeType(editor: vscode.TextEditor, text: string, undoStop: boolean) {
  // skip overtype behavior when enter is pressed
  if (text === "\r" || text === "\n" || text === "\r\n") {
    return vscode.commands.executeCommand("default:type", { text: text });
  }

  if (text.indexOf(" ") !== -1) undoStop = true;

  editor.edit(
    (edit) => {
      editor.selections = editor.selections.map((selection) => {
        const cursorPosition = selection.start;
        const lineEndPosition = editor.document.lineAt(cursorPosition).range.end;

        if (selection.isEmpty) {
          if (cursorPosition.character !== lineEndPosition.character) {
            const replaceEnd = cursorPosition.translate(0, +1);
            const replaceSelection = new vscode.Selection(cursorPosition, replaceEnd);

            edit.replace(replaceSelection, text);
            return new vscode.Selection(replaceSelection.end, replaceSelection.end);
          } else {
            edit.insert(cursorPosition, text);
            return selection;
          }
        } else {
          undoStop = true;
          edit.replace(selection, text);
          return selection;
        }
      });
    },
    { undoStopAfter: undoStop, undoStopBefore: false }
  );
  return null;
}

export const overtypeBeforePasteOrig = (editor: vscode.TextEditor, text: string, pasteOnNewLine: boolean) => {
  editor.selections = editor.selections.map((selection) => {
    if (pasteOnNewLine) {
      // highlight and replace all the selected lines

      const startPosition = editor.document.lineAt(selection.start).rangeIncludingLineBreak.start;
      let endPosition = editor.document.lineAt(selection.end).rangeIncludingLineBreak.end;

      if (startPosition.isEqual(endPosition)) {
        endPosition = endPosition.translate(1);
      }

      return new vscode.Selection(startPosition, endPosition);
    } else {
      // highlight the paste length or the end of the line, whichever's smaller

      const selectionStartOffset = editor.document.offsetAt(selection.start);
      const selectionEndOffset = editor.document.offsetAt(selection.end);
      const selectionLength = selectionEndOffset - selectionStartOffset;

      const lineEndOffset = editor.document.offsetAt(editor.document.lineAt(selection.end).range.end);
      const lineEndLength = lineEndOffset - selectionStartOffset;

      const hasNewLine = text.indexOf("\r") !== -1 || text.indexOf("\n") !== -1;
      const newSelectionLength = Math.max(hasNewLine ? lineEndLength : Math.min(lineEndLength, text.length), selectionLength);
      const newSelectionEndPosition = editor.document.positionAt(selectionStartOffset + newSelectionLength);

      return new vscode.Selection(selection.start, newSelectionEndPosition);
    }
  });
};

export function overtypeBeforePaste(editor: vscode.TextEditor, text: string, pasteOnNewLine: boolean) {
  editor.selections = editor.selections.map((selection) => {
    if (pasteOnNewLine) {
      // highlight and replace all the selected lines

      const startPosition = editor.document.lineAt(selection.start).rangeIncludingLineBreak.start;
      let endPosition = editor.document.lineAt(selection.end).rangeIncludingLineBreak.end;

      if (startPosition.isEqual(endPosition)) {
        endPosition = endPosition.translate(1);
      }

      return new vscode.Selection(startPosition, endPosition);
    } else {
      // highlight the paste length or the end of the line, whichever's smaller

      const selectionStartOffset = editor.document.offsetAt(selection.start);
      const selectionEndOffset = editor.document.offsetAt(selection.end);
      const selectionLength = selectionEndOffset - selectionStartOffset;

      const lineEndOffset = editor.document.offsetAt(editor.document.lineAt(selection.end).range.end);
      const lineEndLength = lineEndOffset - selectionStartOffset;

      const hasNewLine = text.indexOf("\r") !== -1 || text.indexOf("\n") !== -1;
      const newSelectionLength = Math.max(hasNewLine ? lineEndLength : Math.min(lineEndLength, text.length), selectionLength);
      const newSelectionEndPosition = editor.document.positionAt(selectionStartOffset + newSelectionLength);

      return new vscode.Selection(selection.start, newSelectionEndPosition);
    }
  });
}

const alignWordExpr = /([^ ]+ ?)*[^ ]+/;

export function alignBeforeType(editor: vscode.TextEditor, text: string, undoStop: boolean) {
  // skip overtype behavior when enter is pressed
  if (text === "\r" || text === "\n" || text === "\r\n") {
    vscode.commands.executeCommand("default:type", { text: text });
    return;
  }
  if (text.indexOf(" ") !== -1) undoStop = true;

  editor
    .edit(
      (edit) => {
        editor.selections = editor.selections.map((selection) => {
          const cursorPosition = selection.start;
          const lineEndPosition = editor.document.lineAt(cursorPosition).range.end;
          let typeSel = selection;

          // handle alignment
          if (typeSel.isSingleLine) {
            let typeSize = editor.document.offsetAt(typeSel.end) - editor.document.offsetAt(typeSel.start);
            if (typeSize > 1) undoStop = true;
            if (typeSize != text.length) {
              let spaceDiff = text.length - typeSize;
              let currWord = editor.document.getWordRangeAtPosition(typeSel.end, alignWordExpr);
              if (!currWord) currWord = editor.document.getWordRangeAtPosition(typeSel.end.translate(0, +1), alignWordExpr);
              let spacesAfter;
              if (currWord && !currWord.end.isEqual(lineEndPosition)) {
                spacesAfter = editor.document.getWordRangeAtPosition(currWord.end, / {2,}/);
              } else if (!typeSel.end.isEqual(lineEndPosition)) {
                if (editor.document.getText(new vscode.Range(typeSel.end, typeSel.end.translate(0, +2))) === "  ") {
                  spacesAfter = editor.document.getWordRangeAtPosition(typeSel.end, / {2,}/);
                }
              }
              if (spacesAfter && typeSize < text.length) {
                // remove spaces if possible
                let spaceCount = editor.document.offsetAt(spacesAfter.end) - editor.document.offsetAt(spacesAfter.start);
                edit.delete(new vscode.Range(spacesAfter.end.translate(0, -Math.min(spaceDiff, spaceCount - 1)), spacesAfter.end));
              } else if (spacesAfter && typeSize > text.length) {
                // Add spaces
                edit.insert(spacesAfter.end, " ".repeat(typeSize - text.length));
              }
            }
          } else {
            undoStop = true;
          }
          if (typeSel.isEmpty) {
            edit.insert(typeSel.end, text);
          } else {
            edit.replace(typeSel, text);
          }
          return new vscode.Selection(typeSel.end, typeSel.end);
        });
      },
      { undoStopAfter: undoStop, undoStopBefore: false }
    )
    .then(() => {});
}

export function alignDelete(editor: vscode.TextEditor, isRight: boolean) {
  editor.edit((edit) => {
    editor.selections = editor.selections.map((selection) => {
      let range: vscode.Range = selection;
      if (selection.isEmpty) {
        if (selection.start.character == 0 && !isRight) {
          // Delete at beginning of line
          if (selection.start.line == 0) return selection;
          let linelen = editor.document.lineAt(selection.start.line - 1).range.end.character;
          range = new vscode.Range(new vscode.Position(selection.start.line - 1, linelen), selection.start);
        } else {
          range = new vscode.Range(selection.start, selection.start.translate(0, isRight ? +1 : -1));
        }
      }
      let wordRange = editor.document.getWordRangeAtPosition(range.end.translate(0, +1), alignWordExpr) || range;
      let checkRange = new vscode.Range(range.end, range.end.translate(0, +2));

      let rangeSize = editor.document.offsetAt(range.end) - editor.document.offsetAt(range.start); // WTF why isn't there an API for this??????

      let rangeEndtoEndOfLine = new vscode.Range(range.end, editor.document.lineAt(range.end).range.end);

      if (!range.isSingleLine) {
        edit.delete(range);
      } else if (rangeEndtoEndOfLine.isEmpty || editor.document.getText(rangeEndtoEndOfLine).match(/^ +$/)) {
        edit.delete(range.union(rangeEndtoEndOfLine));
      } else if (editor.document.getText(checkRange) === "  " || wordRange.isEmpty) {
        if (!editor.document.getText(range).match(/^ +$/)) {
          edit.replace(range, " ".repeat(rangeSize));
        }
      } else {
        edit.delete(range);
        if (!wordRange.end.isEqual(rangeEndtoEndOfLine.end)) edit.insert(wordRange.end, " ".repeat(rangeSize));
      }
      return new vscode.Selection(range.start, range.start);
    });
  });
}
