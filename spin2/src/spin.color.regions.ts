"use strict";
// src/spin.color.regions.ts

import * as vscode from "vscode";
import { Position } from "vscode";
import { DocumentFindings, eBLockType, IBlockSpan } from "./spin.semantic.findings";
import { semanticConfiguration, reloadSemanticConfiguration } from "./spin2.extension.configuration";
// import { runInThisContext } from "vm";
import { activeFilespec, isSpinOrPasmFile, activeSpinEditors } from "./spin.vscode.utils";

interface DecoratorMap {
  [Identifier: string]: DecoratorDescription;
}

interface DecoratorDescription {
  name: string;
  regions: vscode.DecorationOptions[];
  decorator: undefined | vscode.TextEditorDecorationType;
}

interface DecoratorInstanceMap {
  [Identifier: string]: vscode.TextEditorDecorationType;
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

  //private decoratorInstances = new Map<string, vscode.TextEditorDecorationType>();
  private colorInfoByFilespec = new Map<string, DecoratorMap>();
  private decoratorInstancesByFilespec = new Map<string, DecoratorInstanceMap>();
  private findingsByFilespec = new Map<string, DocumentFindings>();

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

      // we need to force redraw of open editor when config changes!
      // FIXME: the rec-olor happens out of sequence!!! (after the doc updates)
      const activeEdtors: vscode.TextEditor[] = activeSpinEditors();
      if (activeEdtors.length > 0) {
        for (let index = 0; index < activeEdtors.length; index++) {
          const currEditor = activeEdtors[index];
          const filespec: string = currEditor.document.fileName;
          this.logMessage(`* config: re-coloring [${filespec}]`);
          const docFindings: DocumentFindings | undefined = this.findingsByFilespec.has(filespec) ? this.findingsByFilespec.get(filespec) : undefined;
          if (docFindings) {
            this.updateRegionColors(currEditor, docFindings, "cfgChg");
          } else {
            this.logMessage(`  -- config: NO cached DocumentFindings for [${filespec}]`);
          }
        }
      } else {
        this.logMessage(`* config: NO spin editors to update`);
      }
    }
  }

  public closedAllFiles() {
    // empty all caches for files
    this.logMessage(`- closedAllFiles() removed all cached entries`);
    this.decoratorInstancesByFilespec.clear();
    this.colorInfoByFilespec.clear();
    this.findingsByFilespec.clear();
  }

  public closedFilespec(filespec: string) {
    // remove caches for files that are closed
    this.logMessage(`- closedFilespec() removing cached entries for [${filespec}]`);
    if (this.decoratorInstancesByFilespec.has(filespec)) {
      this.decoratorInstancesByFilespec.delete(filespec);
    }
    if (this.colorInfoByFilespec.has(filespec)) {
      this.colorInfoByFilespec.delete(filespec);
    }
    if (this.findingsByFilespec.has(filespec)) {
      this.findingsByFilespec.delete(filespec);
    }
  }

  public updateRegionColors(activeEditor: vscode.TextEditor, symbolRepository: DocumentFindings, caller: string) {
    // remove any prior colors, then recolor
    const isConfigChange: boolean = caller.includes("cfgChg");
    const isWindowChange: boolean = caller.includes("actvEditorChg");
    const isFromRescan: boolean = caller.includes("end1stPass");
    if (isWindowChange) {
      this.logMessage(`- updateRegionColors() changing windows`);
    }
    if (isConfigChange) {
      this.logMessage(`- updateRegionColors() color config changed`);
    }
    const filespec: string = activeFilespec(activeEditor);
    if (isFromRescan || isWindowChange) {
      // when we get real dta save it for config change use
      this.findingsByFilespec.set(filespec, symbolRepository);
    }
    const isSpinFile = isSpinOrPasmFile(filespec);
    let instancesByColor: DecoratorInstanceMap = {};
    let foundInstancesByColor: DecoratorInstanceMap | undefined = this.decoratorInstancesByFilespec.has(filespec) ? this.decoratorInstancesByFilespec.get(filespec) : undefined;
    if (foundInstancesByColor) {
      instancesByColor = foundInstancesByColor;
      this.logMessage(`  -- using existing instance cache`);
    } else {
      this.decoratorInstancesByFilespec.set(filespec, instancesByColor);
      this.logMessage(`  -- new instance cache created`);
    }

    // don't show following message if coloring is turned off
    if (isSpinFile) {
      const isColoringEnabled: boolean = this.isColoringBackground() == true;
      // only clear if coloring is OFF   -OR-
      //   if text changed, or if syntax pass requested update
      if (!isColoringEnabled) {
        this.removeBackgroundColors("NOT COLORING updRgnCo():" + caller, activeEditor);
      } else {
        // only color if
        //  (1) coloring is turned on
        this.logMessage(`- updateRegionColors() fm=(${caller}) [${filespec}]`);
        let decorationsByColor: DecoratorMap | undefined = this.colorInfoByFilespec.has(filespec) ? this.colorInfoByFilespec.get(filespec) : undefined;
        if (isWindowChange) {
          // use existing color set
        } else {
          this.logMessage(`  -- build new decoration map`);
          // NOT a window change... build new color set
          this.decoratorInstancesByFilespec.set(filespec, instancesByColor); // save latest colorInstances
          // build new updated color set
          const newDecorationsByColor: DecoratorMap = this.buildColorSet(symbolRepository, instancesByColor);
          // determine if same (color and color ranges)
          // if called from semantic pass then always adopt new!
          //   otherwise only adopt new only if changed
          if (isFromRescan || isConfigChange || this.colorSetsAreDifferent(newDecorationsByColor, decorationsByColor)) {
            // newly built color set is different... adopt it
            decorationsByColor = newDecorationsByColor;
            // replace cache with this latest color-set for file
            this.colorInfoByFilespec.set(filespec, decorationsByColor); // save latest colorSet
            this.logMessage(`  -- new decoration cache created`);
          } else {
            if (decorationsByColor) {
              this.logMessage(`  -- using existing decoration cache`);
            } else {
              this.logMessage(`  -- NO existing,  forcing use of NEW decoration cache`);
              decorationsByColor = newDecorationsByColor;
              this.colorInfoByFilespec.set(filespec, decorationsByColor); // save latest colorSet
            }
          }
        }
        //this.logMessage(`- updateRegionColors(): FOUND ${codeBlockSpans.length} codeBlockSpan(s)`);
        if (decorationsByColor) {
          if (!isWindowChange) {
            this.removeBackgroundColors("updRgnCo():" + caller, activeEditor);
          }
          // for all decorations add to editor
          const keys = Object.keys(decorationsByColor);
          this.logMessage(`  -- coloring region(s) with ${keys.length} color(s)`);
          for (const key of keys) {
            const currDecoration = decorationsByColor[key];
            //this.logMessage(` -- color=[${key}] name=[${currDecoration.name}], regionCt=(${currDecoration.regions.length}), optionsBGColor=[${currDecoration.decorator}]`);

            if (currDecoration.decorator !== undefined) {
              activeEditor.setDecorations(currDecoration.decorator, []);
              activeEditor.setDecorations(currDecoration.decorator, currDecoration.regions);
            }
          }
        } else {
          this.logMessage(`  -- No colored regions found!`);
        }
      }
    } else {
      this.logMessage(`  -- SKIPping non-spin file`);
    }
  }

  private buildColorSet(symbolRepository: DocumentFindings, decoratorInstances: DecoratorInstanceMap): DecoratorMap {
    const decorationsByColor: DecoratorMap = {};
    const codeBlockSpans: IBlockSpan[] = symbolRepository.blockSpans();
    if (codeBlockSpans.length > 0) {
      // for each colorized region
      for (let blkIdx = 0; blkIdx < codeBlockSpans.length; blkIdx++) {
        const codeBlockSpan: IBlockSpan = codeBlockSpans[blkIdx];
        // lookup color
        const color: string | undefined = this.colorForBlock(codeBlockSpan.blockType, codeBlockSpan.sequenceNbr);
        if (color) {
          //this.logMessage(`- updateRegionColors(): color=[${color}], span=[${codeBlockSpan.startLineNbr} - ${codeBlockSpan.endLineNbr}]`);
          // grab and instance for this color
          const colorDecorator: vscode.TextEditorDecorationType = this.instanceForColor(color, decoratorInstances);
          // create the next/first span for this color
          this.logMessage(`  -- color=[${color}], start=[${codeBlockSpan.startLineNbr}, 0], end=[${codeBlockSpan.endLineNbr}, 0]`);
          const startPos = new Position(codeBlockSpan.startLineNbr, 0);
          const endPos = new Position(codeBlockSpan.endLineNbr, 0);

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
    }
    return decorationsByColor;
  }

  private instanceForColor(color: string, decoratorInstances: DecoratorInstanceMap): vscode.TextEditorDecorationType {
    const foundInstance = decoratorInstances[color];
    if (foundInstance !== undefined) {
      return foundInstance;
    }

    const newInstance = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: color,
    });

    decoratorInstances[color] = newInstance;
    return newInstance;
  }

  private colorSetsAreDifferent(lhsMap: DecoratorMap, rhsMap: DecoratorMap | undefined): boolean {
    let mapsDiffStatus = false;
    if (rhsMap) {
      const lhsColors = Object.keys(lhsMap);
      const rhsColors = Object.keys(rhsMap);
      if (lhsColors.length != rhsColors.length) {
        mapsDiffStatus = true;
      } else {
        for (let color in lhsColors) {
          const lhsDescription: DecoratorDescription = lhsMap[color];
          if (color in rhsColors) {
            /// both have same color?
            const rhsDescription: DecoratorDescription = rhsMap[color];
            if (!lhsDescription || !rhsDescription) {
              // left or righ hand side is missing...
              mapsDiffStatus = true;
              break;
            }
            // CHK: name
            if (lhsDescription.name != rhsDescription.name) {
              // color not in rhs so are diff.
              mapsDiffStatus = true;
              break;
            } else {
              // CHK: regions
              if (lhsDescription.regions.length != rhsDescription.regions.length) {
                // colored regions count is diff.
                mapsDiffStatus = true;
                break;
              }
              for (let rgnIdx = 0; rgnIdx < lhsDescription.regions.length; rgnIdx++) {
                const lhsRange: vscode.Range = lhsDescription.regions[rgnIdx]["range"];
                const rhsRange: vscode.Range = rhsDescription.regions[rgnIdx]["range"];
                if (lhsRange.start != rhsRange.start || lhsRange.end != rhsRange.end) {
                  // colored region linenumber range is diff.
                  mapsDiffStatus = true;
                  break;
                }
              }
            }
          } else {
            // color not in rhs so are diff.
            mapsDiffStatus = true;
            break;
          }
        }
      }
    } else {
      // only one map to compare, yes it is different
      mapsDiffStatus = true;
    }
    this.logMessage(`  -- colorSetsAreDifferent() = ${mapsDiffStatus}`);
    return mapsDiffStatus;
  }

  private removeBackgroundColors(caller: string, activeEditor?: vscode.TextEditor) {
    if (!activeEditor) {
      activeEditor = vscode.window.activeTextEditor;
    }
    if (activeEditor) {
      const filespec: string = activeFilespec(activeEditor);
      this.logMessage(`- removeBackgroundColors() fm=(${caller}) [${filespec}]`);
      const instancesByColor: DecoratorInstanceMap | undefined = this.decoratorInstancesByFilespec.get(filespec);
      if (instancesByColor) {
        // Clear decorations
        const keys = Object.keys(instancesByColor);
        for (const key of keys) {
          const foundInstance = instancesByColor[key];
          if (foundInstance) {
            // If rangesOrOptions is empty, the existing decorations with the given decoration type will be removed
            activeEditor.setDecorations(foundInstance, []);
          }
        }
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
}
