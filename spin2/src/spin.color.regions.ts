"use strict";
// src/spin.color.regions.ts

import * as vscode from "vscode";
import { Position } from "vscode";
import { DocumentFindings, eBLockType, IBlockSpan } from "./spin.semantic.findings";
import { semanticConfiguration, reloadSemanticConfiguration } from "./spin2.extension.configuration";
import { runInThisContext } from "vm";
import { isSpinOrPasmDocument } from "./spin.vscode.utils";

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
    /*  MINE
    objLt: "#FFBFBFff", // red
    objDk: "#FDA7A6ff",
    varLt: "#FFDFBFff", // orange
    varDk: "#FDD2A7ff",
    conLt: "#FEF7C0ff", // yellow
    conDk: "#FDF3A9ff",
    datLt: "#BFFDC8ff", // green
    datDk: "#A7FCB3ff",
    priLt: "#BFF8FFff", // blue
    priDk: "#A7F3FEff",
    pubLt: "#BEDFFFff", // purple
    pubDk: "#A7D2FDff",
   */
    /* Mine Cleaned up
    objLt: "#FFBFBFff", // HSB:   0,25,100 - OBJ red
    objDk: "#FFB0B0ff", // HSB:   0,31,100  (33 was too dark/rich)
    varLt: "#FFDFBFff", // HSB:  30,25,100 - VAR orange
    varDk: "#FFD5ABff", // HSB:  30,33,100
    conLt: "#FFFFBFff", // HSB:  60,25,100 - CON yellow
    conDk: "#FFFFA1ff", // HSB:  60,37,100 (33 was too light)
    datLt: "#D5FFBFff", // HSB: 100,25,100 - DAT green
    datDk: "#C0FFA1ff", // HSB: 100,37,100 (33 was too light)
    priLt: "#BFFFFFff", // HSB: 180,25,100 - PRI blue
    priDk: "#A1FFFFff", // HSB: 180,37,100 (33 was too light)
    pubLt: "#BFD5FFff", // HSB: 220,25,100 - PUB purple
    pubDk: "#B0CAFFff", // HSB: 220,31,100  (33 was too dark/rich)
    */
    //  Jeff's
    objLt: "#FFD9D9ff", // HSB:   0,15,100 - OBJ red
    objDk: "#FFC7C7ff", // HSB:   0,22,100  (25 was too dark/rich)
    varLt: "#FFECD9ff", // HSB:  30,15,100 - VAR orange
    varDk: "#FFDFBFff", // HSB:  30,25,100
    conLt: "#FFFFD9ff", // HSB:  60,15,100 - CON yellow
    conDk: "#FFFFBFff", // HSB:  60,25,100
    datLt: "#E0FFE4ff", // HSB: 128,12,100 - DAT green
    datDk: "#C4FFCCff", // HSB: 128,23,100  (25 was too dark/rich)
    priLt: "#D9FAFFff", // HSB: 188,15,100 - PRI blue
    priDk: "#BFF7FFff", // HSB: 188,25,100
    pubLt: "#D9EBFFff", // HSB: 211,15,100 - PUB purple
    pubDk: "#C4E1FFff", // HSB: 211,23,100  (25 was too dark/rich)
  };
  private namedColorsAlpha: number = -1;
  private settingsChanged: boolean = false;
  private coloredFilename: string = "";

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
    this.logMessage("* Config: spinExtensionBehavior.backgroundApha: [" + this.configuration.backgroundApha + "]");

    this.updateColorizerConfiguration(); // ensure we match the current setting value
  }

  public isColoringBackground(): boolean {
    return this.configuration.colorBackground ? this.configuration.colorBackground : false;
  }

  public backgroundAlpha(): number {
    let interpretedAlpha: number = this.configuration.backgroundApha ? this.configuration.backgroundApha : 80;
    return interpretedAlpha;
  }

  public updateColorizerConfiguration() {
    this.logMessage("* updateColorizerConfiguration() settings changed");
    this.settingsChanged = true;
    const updated = reloadSemanticConfiguration();
    if (updated || this.namedColorsAlpha == -1) {
      const settingsAlpha: number = this.backgroundAlpha();
      if (this.namedColorsAlpha != settingsAlpha) {
        this.logMessage("* Config: spinExtensionBehavior.backgroundApha: [" + settingsAlpha + "]");
        this.namedColorsAlpha = this.backgroundAlpha();
        this.updateColorTable();
      }
      if (this.isColoringBackground() == false) {
        this.removeBackgroundColors("updateCfg");
      }
    }
  }

  private removeBackgroundColors(caller: string) {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      this.logMessage(`- removeBackgroundColors() fm=(${caller}) [${activeEditor.document.fileName}]`);
      // Clear decorations
      const keys = Object.keys(this.decoratorInstances);
      for (const key of keys) {
        // If rangesOrOptions is empty, the existing decorations with the given decoration type will be removed
        activeEditor.setDecorations(this.decoratorInstances[key], []);
      }
    }
  }

  public updateRegionColors(activeEditor: vscode.TextEditor, symbolRepository: DocumentFindings, caller: string) {
    // remove any prior colors
    const isWindowChange: boolean = caller.includes("actvEditorChg") && !this.settingsChanged;
    const isColoring: boolean = this.isColoringBackground() == true;
    if (isWindowChange) {
      this.logMessage(`- updateRegionColors() changing windows`);
    }
    const isSpinFile = isSpinOrPasmDocument(activeEditor.document);

    // don't show following message if coloring is turned off
    if (!isSpinFile && isColoring) {
      this.logMessage(`- updateRegionColors() SKIPping non-spin file`);
      return;
    }

    const isDifferentFile: boolean = this.coloredFilename == activeEditor.document.fileName ? false : true;
    // don't show following message if coloring is turned off or if changing windows
    if (isDifferentFile && isColoring && !isWindowChange) {
      this.logMessage(`- updateRegionColors() diff file than last colored: was:[${this.coloredFilename}]now:[${activeEditor.document.fileName}]`);
    }

    // only clear if coloring is OFF   -OR-
    //   if text changed, or if syntax pass requested update
    if (isWindowChange == false || !isColoring) {
      this.removeBackgroundColors("updRgnCo():" + caller);
    }

    // only color if
    //  (1) coloring is turned on
    //  (2) if NOT doing a window change (if changing a follow-up color request will be done from syntax pass)
    //
    //  NOTE: the window-change clause prevents us from coloring with wrong color-spans for this file
    //
    if (isColoring && !isWindowChange) {
      this.settingsChanged = false;
      this.coloredFilename = activeEditor.document.fileName; // show that we colored this file
      this.logMessage(`  -- fm=(${caller}) [${this.coloredFilename}]`);
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
        this.logMessage(`  -- coloring ${codeBlockSpans.length} region(s) with ${keys.length} color(s)`);
        for (const key of keys) {
          const currDecoration = decorationsByColor[key];
          //this.logMessage(` -- color=[${key}] name=[${currDecoration.name}], regionCt=(${currDecoration.regions.length}), optionsBGColor=[${currDecoration.decorator}]`);

          if (currDecoration.decorator !== undefined) {
            activeEditor.setDecorations(currDecoration.decorator, []);
            activeEditor.setDecorations(currDecoration.decorator, currDecoration.regions);
          }
        }
      } else {
        this.logMessage(`  -- ${codeBlockSpans.length} region(s) to color BYPASS`);
      }
    } else {
      if (isWindowChange) {
        this.logMessage(`  -- skip re-coloring changing windows BYPASS`);
      } else {
        this.logMessage(`  -- coloring disabled BYPASS`);
      }
    }
  }

  private updateColorTable(): void {
    // alpha is specified in percent [10-100]
    if (this.namedColorsAlpha > 0) {
      const bgAlphaHex: string = this.twoDigitHexForByteValue(255 * (this.namedColorsAlpha / 100));
      for (let colorKey in this.namedColors) {
        const colorRGBA: string = this.namedColors[colorKey];
        const updatedRGBA: string = colorRGBA.substring(0, 7) + bgAlphaHex;
        this.namedColors[colorKey] = updatedRGBA;
        this.logMessage(`- updateColorTable(): ${colorKey} [${colorRGBA}] => [${updatedRGBA}]`);
      }
    }
  }

  private twoDigitHexForByteValue(value: number): string {
    const limitedValue: number = value & 255; // limit to 0-255
    const interp: string = limitedValue.toString(16);
    const hexString = interp.length > 1 ? interp : `0${interp}`;
    return hexString;
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
