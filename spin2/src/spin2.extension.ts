'use strict';

// src/extension.ts

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            {scheme: "file", language: "spin2"},
            new Spin2ConfigDocumentSymbolProvider()
        )
    );
}

class Spin2ConfigDocumentSymbolProvider implements vscode.DocumentSymbolProvider {

    public provideDocumentSymbols(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[]>
        {
        return new Promise((resolve, _reject) =>
        {
            let symbols: vscode.DocumentSymbol[] = [];

            for (var i = 0; i < document.lineCount; i++) {
                var line = document.lineAt(i);
                let linePrefix : string = line.text
                if (line.text.length > 3) {
                    linePrefix = linePrefix.substring(0,3).toUpperCase()
                }

                if (linePrefix.startsWith("CON") || linePrefix.startsWith("DAT") || linePrefix.startsWith("VAR") || linePrefix.startsWith("OBJ")) {
                    var section: string = line.text.trim()
                    if (section.includes("'")) {
                        const lineParts: string[] = section.split("'")
                        section = lineParts[0].trim()
                    }
                    let marker_symbol = new vscode.DocumentSymbol(
                        linePrefix + section.substr(3),
                        '',
                        vscode.SymbolKind.Field,
                        line.range, line.range)

                    symbols.push(marker_symbol)
                }
                else if (linePrefix.startsWith("PUB") || linePrefix.startsWith("PRI")) {
                    var methodScope: string = "Public"
                    if (line.text.startsWith("PRI")) {
                        methodScope = "Private"
                    }
                    var methodName: string = line.text.substr(3).trim()
                    if (methodName.includes("'")) {
                        const lineParts: string[] = methodName.split("'")
                        methodName = lineParts[0].trim()
                    }
                    if (methodName.includes("{")) {
                        const lineParts: string[] = methodName.split("{")
                        methodName = lineParts[0].trim()
                    }
                    if (methodName.includes("|")) {
                        const lineParts: string[] = methodName.split("|")
                        methodName = lineParts[0].trim()
                    }

                    let cmd_symbol = new vscode.DocumentSymbol(
                        linePrefix + ' ' + methodName,
                        '',
                        vscode.SymbolKind.Function,
                        line.range, line.range)

                    symbols.push(cmd_symbol)
                }
            }

            resolve(symbols);
        });
    }
}