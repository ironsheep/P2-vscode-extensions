"use strict";
// src/spin.color.regions.ts

import * as vscode from "vscode";
import { Position } from "vscode";
import { DocumentFindings, eBLockType, IBlockSpan } from "./spin.semantic.findings";
import { semanticConfiguration } from "./spin2.extension.configuration";

interface DecoratorMap {
  [key: string]: DecoratorDescription;
}

interface DecoratorDescription {
  name: string;
  regions: vscode.DecorationOptions[];
  decorator: undefined | vscode.TextEditorDecorationType;
}

interface DecoratorInstances {
  [key: string]: vscode.TextEditorDecorationType;
}

export class RegionColorizer {
  private coloringDebugLogEnabled: boolean = true; // WARNING (REMOVE BEFORE FLIGHT)- change to 'false' - disable before commit
  private coloringOutputChannel: vscode.OutputChannel | undefined = undefined;

  private namedColors: { [Identifier: string]: string } = {
    //  key: "rgba hex value"
    conLt: "#FEF7C0ff",
    conDk: "#FDF3A9ff",
    objLt: "#FFBFBFff",
    objDk: "#FDA7A6ff",
    varLt: "#FFDFBFff",
    varDk: "#FDD2A7ff",
    datLt: "#BFFDC8ff",
    datDk: "#A7FCB3ff",
    pubLt: "#BEDFFFff",
    pubDk: "#A7D2FDff",
    priLt: "#BFF8FFff",
    priDk: "#A7F3FEff",
  };
  private decoratorInstances: DecoratorInstances = {};

  private configuration = semanticConfiguration;

  constructor() {
    if (this.coloringDebugLogEnabled) {
      if (this.coloringOutputChannel === undefined) {
        //Create output channel
        this.coloringOutputChannel = vscode.window.createOutputChannel("Spin/Spin2 BGColor DEBUG");
        this.logMessage("Spin/Spin2 BGColor log started.");
      } else {
        this.logMessage("\n\n------------------   NEW FILE ----------------\n\n");
      }
    }
    this.logMessage("* Config: spinExtensionBehavior.colorBackground: [" + this.configuration.colorBackground + "]");
  }

  public isColoringBackground(): boolean {
    return this.configuration.colorBackground ? this.configuration.colorBackground : false;
  }

  public updateRegionColors(activeEditor: vscode.TextEditor, symbolRepository: DocumentFindings) {
    if (this.isColoringBackground()) {
      {
        // Clear decorations
        const keys = Object.keys(this.decoratorInstances);
        for (const key of keys) {
          activeEditor.setDecorations(this.decoratorInstances[key], []);
        }
      }

      const codeBlockSpans: IBlockSpan[] = symbolRepository.blockSpans();
      const decorationsByColor: DecoratorMap = {};
      //this.logMessage(`- updateRegionColors(): FOUND ${codeBlockSpans.length} codeBlockSpan(s)`);
      if (codeBlockSpans.length > 0) {
        // for each colorized region
        for (let blkIdx = 0; blkIdx < codeBlockSpans.length; blkIdx++) {
          const codeBlockSpan: IBlockSpan = codeBlockSpans[blkIdx];
          // lookup color
          const color: string | undefined = this.colorForBlock(codeBlockSpan.blockType, codeBlockSpan.sequenceNbr);
          if (color) {
            //this.logMessage(`- updateRegionColors(): color=[${color}], span=[${codeBlockSpan.startLineNbr} - ${codeBlockSpan.endLineNbr}]`);
            // grab and instance for this color
            const colorDecorator: vscode.TextEditorDecorationType = this.instanceForColor(color);
            // create the next/first span for this color
            const startPos = new Position(codeBlockSpan.startLineNbr, 0);
            const endPos = new Position(codeBlockSpan.endLineNbr, 0);
            //this.logMessage(`  -- color=[${color}], start=[${startPos.line}, ${startPos.character}], end=[${endPos.line}, ${endPos.character}]`);

            const decorationRange = {
              range: new vscode.Range(startPos, endPos),
            };

            // if decoration for this color doesn't exist
            if (decorationsByColor[color] === undefined) {
              // record empty decoration
              decorationsByColor[color] = {
                name: color,
                regions: [],
                decorator: undefined,
              };
            }

            // add range to new or existing decoration
            decorationsByColor[color].regions.push(decorationRange);
            if (decorationsByColor[color].decorator == undefined) {
              decorationsByColor[color].decorator = colorDecorator;
            }
          }
        }

        // for all decorations add to editor
        const keys = Object.keys(decorationsByColor);
        this.logMessage(`- updateRegionColors(): coloring ${codeBlockSpans.length} region(s) with ${keys.length} color(s)`);
        for (const key of keys) {
          const currDecoration = decorationsByColor[key];
          //this.logMessage(` -- color=[${key}] name=[${currDecoration.name}], regionCt=(${currDecoration.regions.length}), optionsBGColor=[${currDecoration.decorator}]`);

          if (currDecoration.decorator !== undefined) {
            activeEditor.setDecorations(currDecoration.decorator, []);
            activeEditor.setDecorations(currDecoration.decorator, currDecoration.regions);
          }
        }
      }
    }
  }

  /**
   * write message to formatting log (when log enabled)
   *
   * @param the message to be written
   * @returns nothing
   */
  public logMessage(message: string): void {
    if (this.coloringDebugLogEnabled && this.coloringOutputChannel != undefined) {
      //Write to output window.
      this.coloringOutputChannel.appendLine(message);
    }
  }

  private colorForBlock(currblockType: eBLockType, sequenceNbr: number): string | undefined {
    let colorKey: string | undefined = undefined;
    if (currblockType == eBLockType.isCon) {
      colorKey = "con";
    } else if (currblockType == eBLockType.isObj) {
      colorKey = "obj";
    } else if (currblockType == eBLockType.isVar) {
      colorKey = "var";
    } else if (currblockType == eBLockType.isDat) {
      colorKey = "dat";
    } else if (currblockType == eBLockType.isPub) {
      colorKey = "pub";
    } else if (currblockType == eBLockType.isPri) {
      colorKey = "pri";
    }
    let desiredColor: string | undefined = undefined;
    if (colorKey) {
      const suffix: string = (sequenceNbr & 0x01) == 0x01 ? "Lt" : "Dk";
      colorKey = `${colorKey}${suffix}`;
      if (colorKey in this.namedColors) {
        desiredColor = this.namedColors[colorKey];
      }
    }
    //this.logMessage(`- colorForBlock(${currblockType}, ${sequenceNbr}) -> hash[${colorKey}] = [${desiredColor}]`);
    return desiredColor;
  }

  private instanceForColor(color: string): vscode.TextEditorDecorationType {
    if (this.decoratorInstances[color] !== undefined) {
      return this.decoratorInstances[color];
    }

    const newInstance = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: color,
    });

    this.decoratorInstances[color] = newInstance;
    return newInstance;
  }
}
