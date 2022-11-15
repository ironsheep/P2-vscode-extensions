import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as formatter_1 from '../../spin2.tabFormatter';

suite('Indent Test Suite', async function () {
  vscode.window.showInformationMessage('Start all tests.');

  //#region properties

  const testDocument = '{Object_Title_and_Purpose}' + '\n' +
    'CON' + '\n' +
    'CONSTANT_NAME = 0';

  const formatter = new formatter_1.Formatter();

  function tab(character: number): string {
    return ' '.repeat(character);
  }

  //#endregion

  //#region Indent tab stop test

  const indentTests = [
    {
      include: true,
      title: 'tabstop #0',
      anchorLine: 0,
      anchorCharacter: 0,
      activeLine: null,
      activeCharacter: null,
      originalContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(0) + 'CONSTANT_NAME = 0',
      expectedContent: '  {Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(0) + 'CONSTANT_NAME = 0',
    },
    {
      include: true,
      title: 'tabstop #1',
      anchorLine: 2,
      anchorCharacter: 0,
      activeLine: null,
      activeCharacter: null,
      originalContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(0) + 'CONSTANT_NAME = 0',
      expectedContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(2) + 'CONSTANT_NAME = 0',
    },
    {
      include: true,
      title: 'tabstop #2',
      anchorLine: 2,
      anchorCharacter: 2,
      activeLine: null,
      activeCharacter: null,
      originalContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(2) + 'CONSTANT_NAME = 0',
      expectedContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(8) + 'CONSTANT_NAME = 0',
    },
    {
      include: true,
      title: 'tabstop #3',
      anchorLine: 2,
      anchorCharacter: 8,
      activeLine: null,
      activeCharacter: null,
      originalContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(8) + 'CONSTANT_NAME = 0',
      expectedContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(16) + 'CONSTANT_NAME = 0',
    },
    {
      include: true,
      title: 'tabstop #4',
      anchorLine: 2,
      anchorCharacter: 16,
      activeLine: null,
      activeCharacter: null,
      originalContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(16) + 'CONSTANT_NAME = 0',
      expectedContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(18) + 'CONSTANT_NAME = 0',
    },
    {
      include: true,
      title: 'tabstop #5',
      anchorLine: 2,
      anchorCharacter: 18,
      activeLine: null,
      activeCharacter: null,
      originalContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(18) + 'CONSTANT_NAME = 0',
      expectedContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(32) + 'CONSTANT_NAME = 0',
    },
    {
      include: true,
      title: 'tabstop #6',
      anchorLine: 2,
      anchorCharacter: 32,
      activeLine: null,
      activeCharacter: null,
      originalContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(32) + 'CONSTANT_NAME = 0',
      expectedContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(56) + 'CONSTANT_NAME = 0',
    },
    {
      include: true,
      title: 'tabstop #7',
      anchorLine: 2,
      anchorCharacter: 56,
      activeLine: null,
      activeCharacter: null,
      originalContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(56) + 'CONSTANT_NAME = 0',
      expectedContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(80) + 'CONSTANT_NAME = 0'
    },
    {
      include: true,
      title: 'tabstop #8',
      anchorLine: 2,
      anchorCharacter: 80,
      activeLine: null,
      activeCharacter: null,
      originalContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(80) + 'CONSTANT_NAME = 0',
      expectedContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(104) + 'CONSTANT_NAME = 0'
    },
    {
      include: true,
      title: 'tabstop #9',
      anchorLine: 2,
      anchorCharacter: 104,
      activeLine: null,
      activeCharacter: null,
      originalContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(104) + 'CONSTANT_NAME = 0',
      expectedContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(128) + 'CONSTANT_NAME = 0'
    },
  ];

  await Promise.all(indentTests.filter(test => test.include).map(async function ({ title, anchorLine, anchorCharacter, activeLine, activeCharacter, originalContent, expectedContent }) {
    test(`Indent tab stop, cursor: ${title} [${anchorLine}, ${anchorCharacter}] test`, async function () {
      this.timeout(6000);
      //console.log(`\n${'-'.repeat(80)}\nanchor: [${anchorLine}, ${anchorCharacter}], active: [${activeLine ?? anchorLine}, ${activeCharacter ?? anchorCharacter}]\noriginalContent: ${originalContent}, \nexpectedContent: ${expectedContent}\n`);
      // arrange
      const document = await vscode.workspace.openTextDocument({ content: originalContent });
      const selection = new vscode.Selection(anchorLine, anchorCharacter, activeLine ?? anchorLine, activeCharacter ?? anchorCharacter);
      const selections = [selection];

      // act
      const edits = await formatter.indentTabStop(document, selections);

      //console.log(edits);

      if (edits) {
        const workEdits = new vscode.WorkspaceEdit();
        workEdits.set(document.uri, edits); // give the edits
        await vscode.workspace.applyEdit(workEdits); // apply the edits
      };
      const updatedDocument = await vscode.workspace.openTextDocument(document.uri);
      const updatedContent = updatedDocument.getText();

      //console.log(`\n${'-'.repeat(80)}\nanchor: [${anchorLine}, ${anchorCharacter}], active: [${activeLine}, ${activeCharacter}]\noriginalContent: '${originalContent}' \nupdatedContent: '${updatedContent}'\nexpectedContent: '${expectedContent}'\n`);

      // assert
      assert.strictEqual(updatedContent, expectedContent);
    });
  }));

  //#endregion

  //#region Outdent tab stop test

  const outdentTests = [
    {
      include: true,
      title: 'tabstop #0',
      anchorLine: 0,
      anchorCharacter: 0,
      activeLine: null,
      activeCharacter: null,
      originalContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(0) + 'CONSTANT_NAME = 0',
      expectedContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(0) + 'CONSTANT_NAME = 0',
    },
    {
      include: true,
      title: 'tabstop #1',
      anchorLine: 2,
      anchorCharacter: 2,
      activeLine: null,
      activeCharacter: null,
      originalContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(2) + 'CONSTANT_NAME = 0',
      expectedContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(0) + 'CONSTANT_NAME = 0',
    },
    {
      include: true,
      title: 'tabstop #2',
      anchorLine: 2,
      anchorCharacter: 8,
      activeLine: null,
      activeCharacter: null,
      originalContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(8) + 'CONSTANT_NAME = 0',
      expectedContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(2) + 'CONSTANT_NAME = 0',
    },
    {
      include: true,
      title: 'tabstop #3',
      anchorLine: 2,
      anchorCharacter: 16,
      activeLine: null,
      activeCharacter: null,
      originalContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(16) + 'CONSTANT_NAME = 0',
      expectedContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(8) + 'CONSTANT_NAME = 0',
    },
    {
      include: true,
      title: 'tabstop #4',
      anchorLine: 2,
      anchorCharacter: 18,
      activeLine: null,
      activeCharacter: null,
      originalContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(18) + 'CONSTANT_NAME = 0',
      expectedContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(16) + 'CONSTANT_NAME = 0',
    },
    {
      include: true,
      title: 'tabstop #5',
      anchorLine: 2,
      anchorCharacter: 32,
      activeLine: null,
      activeCharacter: null,
      originalContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(32) + 'CONSTANT_NAME = 0',
      expectedContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(18) + 'CONSTANT_NAME = 0',
    },
    {
      include: true,
      title: 'tabstop #6',
      anchorLine: 2,
      anchorCharacter: 56,
      activeLine: null,
      activeCharacter: null,
      originalContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(56) + 'CONSTANT_NAME = 0',
      expectedContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(32) + 'CONSTANT_NAME = 0',
    },
    {
      include: true,
      title: 'tabstop #7',
      anchorLine: 2,
      anchorCharacter: 56,
      activeLine: null,
      activeCharacter: null,
      originalContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(56) + 'CONSTANT_NAME = 0',
      expectedContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(32) + 'CONSTANT_NAME = 0'
    },
    {
      include: true,
      title: 'tabstop #8',
      anchorLine: 2,
      anchorCharacter: 80,
      activeLine: null,
      activeCharacter: null,
      originalContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(80) + 'CONSTANT_NAME = 0',
      expectedContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(56) + 'CONSTANT_NAME = 0'
    },
    {
      include: true,
      title: 'tabstop #9',
      anchorLine: 2,
      anchorCharacter: 104,
      activeLine: null,
      activeCharacter: null,
      originalContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(104) + 'CONSTANT_NAME = 0',
      expectedContent: '{Object_Title_and_Purpose}' + '\n' +
        'CON' + '\n' +
        tab(80) + 'CONSTANT_NAME = 0'
    },
  ];

  await Promise.all(outdentTests.filter(test => test.include).map(async function ({ title, anchorLine, anchorCharacter, activeLine, activeCharacter, originalContent, expectedContent }) {
    test(`Outdent tab stop, cursor: ${title} [${anchorLine}, ${anchorCharacter}] test`, async function () {

      this.timeout(6000);
      //console.log(`\n${'-'.repeat(80)}\nanchor: [${anchorLine}, ${anchorCharacter}], active: [${activeLine ?? anchorLine}, ${activeCharacter ?? anchorCharacter}]\noriginalContent: ${originalContent}, \nexpectedContent: ${expectedContent}\n`);
      // arrange
      const document = await vscode.workspace.openTextDocument({ content: originalContent });
      const selection = new vscode.Selection(anchorLine, anchorCharacter, activeLine ?? anchorLine, activeCharacter ?? anchorCharacter);
      const selections = [selection];

      // act
      const edits = await formatter.outdentTabStop(document, selections);

      //console.log(edits);

      if (edits) {
        const workEdits = new vscode.WorkspaceEdit();
        workEdits.set(document.uri, edits); // give the edits
        await vscode.workspace.applyEdit(workEdits); // apply the edits
      };
      const updatedDocument = await vscode.workspace.openTextDocument(document.uri);
      const updatedContent = updatedDocument.getText();

      //console.log(`\n${'-'.repeat(80)}\nanchor: [${anchorLine}, ${anchorCharacter}], active: [${activeLine}, ${activeCharacter}]\noriginalContent: '${originalContent}' \nupdatedContent: '${updatedContent}'\nexpectedContent: '${expectedContent}'\n`);

      // assert
      assert.strictEqual(updatedContent, expectedContent);
    });
  }));

  //#endregion

  //#region tab stops

  const tabStops = [
    {
      character: 2, expected: { previousTabstop: 0, currentTabstop: 2, nextTabstop: 8 }
    },
    {
      character: 8, expected: { previousTabstop: 2, currentTabstop: 8, nextTabstop: 16 }
    },
    {
      character: 16, expected: { previousTabstop: 8, currentTabstop: 16, nextTabstop: 18 }
    },
    {
      character: 18, expected: { previousTabstop: 16, currentTabstop: 18, nextTabstop: 32 }
    },
    {
      character: 32, expected: { previousTabstop: 18, currentTabstop: 32, nextTabstop: 56 }
    },
    {
      character: 56, expected: { previousTabstop: 32, currentTabstop: 56, nextTabstop: 80 }
    },
    {
      character: 80, expected: { previousTabstop: 56, currentTabstop: 80, nextTabstop: 104 }
    }
  ];

  await Promise.all(tabStops.map(async function (tabStop) {
    test(`tab stop: [${tabStop.character}]`, async function () {

      this.timeout(6000);

      // Arrange

      // Act
      const previousTabstop = formatter.getPreviousTabStop('con', tabStop.character);
      const currentTabstop = formatter.getCurrentTabStop('con', tabStop.character);
      const nextTabstop = formatter.getNextTabStop('con', tabStop.character);

      // Assert
      assert.strictEqual(previousTabstop, tabStop.expected.previousTabstop, 'previous Tabstop');
      assert.strictEqual(currentTabstop, tabStop.expected.currentTabstop, 'current Tabstop');
      assert.strictEqual(nextTabstop, tabStop.expected.nextTabstop, 'next Tabstop');

    });

  }));

  //#endregion

});
