"use strict";
// src/spin2.utils.ts

export enum eDebugDisplayType {
  Unknown = 0,
  ddtLogic,
  ddtScope,
  ddtScopeXY,
  ddtFFT,
  ddtSpectro,
  ddtPlot,
  ddtTerm,
  ddtBitmap,
  ddtMidi,
}

export enum eBuiltInType {
  Unknown = 0,
  BIT_VARIABLE,
  BIT_METHOD,
  BIT_SYMBOL,
  BIT_LANG_PART,
  BIT_DEBUG_INVOKE,
  BIT_DEBUG_SYMBOL,
  BIT_DEBUG_METHOD,
  BIT_TYPE,
}

export interface IBuiltinDescription {
  found: boolean;
  type: eBuiltInType; // [variable|method]
  category: string;
  description: string;
  signature: string;
}

export const debugTypeForDisplay = new Map<string, eDebugDisplayType>([
  ["logic", eDebugDisplayType.ddtLogic],
  ["scope", eDebugDisplayType.ddtScope],
  ["scope_xy", eDebugDisplayType.ddtScopeXY],
  ["fft", eDebugDisplayType.ddtFFT],
  ["spectro", eDebugDisplayType.ddtSpectro],
  ["plot", eDebugDisplayType.ddtPlot],
  ["term", eDebugDisplayType.ddtTerm],
  ["bitmap", eDebugDisplayType.ddtBitmap],
  ["midi", eDebugDisplayType.ddtMidi],
]);

export class ParseUtils {
  public etDebugStatement(startingOffset: number, line: string): string {
    let currentOffset: number = this.skipWhite(line, startingOffset);
    let debugNonCommentStr: string = line;
    let openParenOffset: number = line.indexOf("(", currentOffset);
    let closeParenOffset: number = this.indexOfMatchingCloseParen(line, openParenOffset);
    if (line.length - startingOffset > 0 && openParenOffset != -1 && closeParenOffset != -1) {
      // have scope of debug line - remove trailing comment, trim it and return it
      let commentOffset: number = line.indexOf("'", closeParenOffset + 1);
      if (commentOffset != -1) {
        // have trailing comment remove it
        const nonCommentEOL: number = commentOffset != -1 ? commentOffset - 1 : line.length - 1;
        debugNonCommentStr = line.substring(currentOffset, nonCommentEOL).trim();
      } else {
        debugNonCommentStr = line.substring(currentOffset).trim();
      }
    } else if (line.length - startingOffset == 0 || openParenOffset == -1) {
      // if we don't have open paren - erase entire line
      debugNonCommentStr = "";
    }
    //if (line.length != debugNonCommentStr.length) {
    //    this.logMessage('  -- DS line [' + line.substring(startingOffset) + ']');
    //    this.logMessage('  --         [' + debugNonCommentStr + ']');
    //}
    return debugNonCommentStr;
  }

  public indexOfMatchingCloseParen(line: string, openParenOffset: number): number {
    let desiredCloseOffset: number = -1;
    let nestingDepth: number = 1;
    for (let offset = openParenOffset + 1; offset < line.length; offset++) {
      if (line.substring(offset, offset + 1) == "(") {
        nestingDepth++;
      } else if (line.substring(offset, offset + 1) == ")") {
        nestingDepth--;
        if (nestingDepth == 0) {
          // we closed the inital open
          desiredCloseOffset = offset;
          break; // done, get outta here
        }
      }
    }
    // this.logMessage('  -- iomcp line=[' + line + ']');
    // this.logMessage('  --       open=(' + openParenOffset + '), close=(' + desiredCloseOffset + ')');
    return desiredCloseOffset;
  }

  public getDebugNonWhiteLineParts(line: string): string[] {
    // remove douple and then any single quotes string from display list
    //this.logMessage('  -- gdnwlp raw-line [' + line + ']');
    const nonDblStringLine: string = this.removeDoubleQuotedStrings(line);
    //this.logMessage("  -- gdnwlp nonDblStringLine=[" + nonDblStringLine + "]");
    const nonSglStringLine: string = this.removeDebugSingleQuotedStrings(nonDblStringLine, false);
    //this.logMessage("  -- gdnwlp nonSglStringLine=[" + nonSglStringLine + "]");
    let lineParts: string[] | null = nonSglStringLine.match(/[^ ,@\[\]\+\-\*\/\<\>\t\(\)\!\?\~]+/g);
    //let lineParts: string[] | null = line.match(/[^ ,@\[\]\+\-\*\/\<\>\t\(\)]+/g);
    if (lineParts === null) {
      lineParts = [];
    }
    return lineParts;
  }

  public getCommaDelimitedNonWhiteLineParts(line: string): string[] {
    let lineParts: string[] | null = line.match(/[^ \t,]+/g);
    if (lineParts === null) {
      lineParts = [];
    }
    return lineParts;
  }

  public removeDebugSingleQuotedStrings(line: string, showDebug: boolean = true): string {
    // remove single-quoted strings from keyword processing
    //  Ex #1:   ' a string '
    //  Ex #2:   ' a string up to [`(var)]
    //  Ex #3:   [)] a string after var'
    //  Ex #4:   [)] a string up to another [`(var)]
    //  Ex #5:   debug(`scope_xy xy size 200 range 1000 samples 200 dotsize 5 'Goertzel' `dly(#200))
    //this.logMessage("- RQS line [" + line + "]");
    let trimmedLine: string = line;
    //this.logMessage("  -- trim line [" + trimmedLine + "]");
    const chrSingleQuote: string = "'";
    const chrBackTic: string = "`";
    const chrOpenParen: string = "(";
    const chrCloseParen: string = ")";
    let didRemove: boolean = false;
    const firstOpenParenOffset: number = trimmedLine.indexOf(chrOpenParen, 0);
    // skip past tic-open pairs and their closes
    let nextBackTic: number = trimmedLine.indexOf(chrBackTic, 0);
    let secondsBackTic: number = trimmedLine.indexOf(chrBackTic, nextBackTic + 1);
    let lastCloseParenOffset: number = trimmedLine.indexOf(chrCloseParen, 0);
    // this.logMessage('  -- 1 nextBackTic=[' + nextBackTic + '] lastCloseParenOffset=[' + lastCloseParenOffset + ']');
    while (nextBackTic != -1) {
      // if we have another back-tic before any parens skip the first one it's only a debug term id marker
      if (secondsBackTic < lastCloseParenOffset) {
        nextBackTic = secondsBackTic;
        // this.logMessage('  -- 1b nextBackTic=[' + nextBackTic + '] lastCloseParenOffset=[' + lastCloseParenOffset + ']');
      }
      // if we have `( followed by ) then skip this close, look for next
      if (lastCloseParenOffset > nextBackTic) {
        // look for next close
        // this.logMessage('  -- SKIP backticOpenOffset=[' + nextBackTic + '] lastCloseParenOffset=[' + lastCloseParenOffset + ']');
        lastCloseParenOffset = trimmedLine.indexOf(chrCloseParen, lastCloseParenOffset + 1);
      }
      nextBackTic = trimmedLine.indexOf(chrBackTic, nextBackTic + 1);
    }
    // by now lastCloseParenOffset should point to end of statement within line
    let quoteStartOffset: number = trimmedLine.indexOf(chrSingleQuote, 0);
    // this.logMessage('  -- 2 quoteStartOffset=[' + quoteStartOffset + '] lastCloseParenOffset=[' + lastCloseParenOffset + ']');
    while (quoteStartOffset != -1) {
      let bHaveBackTic: boolean = false;
      const quoteEndOffset: number = trimmedLine.indexOf(chrSingleQuote, quoteStartOffset + 1);
      if (quoteEndOffset > lastCloseParenOffset) {
        break; // nothing beyond end of line please
      }
      //this.logMessage("  -- quoteStartOffset=[" + quoteStartOffset + "] quoteEndOffset=[" + quoteEndOffset + "]");
      if (quoteEndOffset != -1) {
        // any more strings? on this line?
        let badElement: string = trimmedLine.substr(quoteStartOffset, quoteEndOffset - quoteStartOffset + 1);
        let backTicOffset: number = trimmedLine.indexOf(chrBackTic, quoteStartOffset);
        //this.logMessage("  -- RdsQS backTicOffset=[" + backTicOffset + "], quoteEndOffset=[" + quoteEndOffset + "], badElement=[" + badElement + "]");
        if (backTicOffset != -1 && backTicOffset < quoteEndOffset) {
          bHaveBackTic = true;
          badElement = trimmedLine.substr(quoteStartOffset, backTicOffset - quoteStartOffset);
          if (badElement.length > 0) {
            // badElement = badElement.replace(chrBackTic, '');    // remove bacTicks
          }
          // this.logMessage('  -- RdsQS 2 backTicOffset=[' + backTicOffset + '], quoteEndOffset=[' + quoteEndOffset + '], badElement=[' + badElement + ']');
        }
        //this.logMessage("  -- RdsQS badElement=[" + badElement + "]");
        trimmedLine = trimmedLine.replace(badElement, "#".repeat(badElement.length));
        didRemove = showDebug ? true : false;
        //this.logMessage("  -- RdsQS post[" + trimmedLine + "]");
        // handle  #3 and #4 cases
        if (bHaveBackTic) {
          const closeParenOffset: number = trimmedLine.indexOf(chrCloseParen, backTicOffset + 1);
          // have case #2?
          backTicOffset = trimmedLine.indexOf(chrBackTic, closeParenOffset);
          if (backTicOffset != -1) {
            // we have another backtic, just return to top of loop
            quoteStartOffset = closeParenOffset + 1;
          } else if (closeParenOffset != -1) {
            // let's skip to triling string
            quoteStartOffset = closeParenOffset + 1;
            if (quoteStartOffset < quoteEndOffset) {
              badElement = trimmedLine.substr(quoteStartOffset, quoteEndOffset - quoteStartOffset + 1);
              //this.logMessage('  -- RdsQS rhs quoteStartOffset=[' + quoteStartOffset + '], quoteEndOffset=[' + quoteEndOffset + '], badElement=[' + badElement + ']');
              trimmedLine = trimmedLine.replace(badElement, "#".repeat(badElement.length));
              if (showDebug) {
                didRemove = true;
              }
              //this.logMessage('  -- RdsQS rhs post[' + trimmedLine + ']');
            }
            // finished this quote pair, find start of next possible pair
            quoteStartOffset = trimmedLine.indexOf(chrSingleQuote, quoteEndOffset + 1);
          }
        }
      } else {
        break; // we don't handle a single double-quote
      }
    }

    if (didRemove) {
      // this.logMessage("  -- RdsQS line [" + line + "]");
      //this.logMessage("  --            [" + trimmedLine + "]");
    }

    return trimmedLine;
  }

  public getNonInlineCommentLine(line: string): string {
    // NEW remove {comment} and {{comment}} single-line elements too
    let nonInlineCommentStr: string = line;
    // TODO: UNDONE make this into loop to find all single line {} or {{}} comments
    const startDoubleBraceOffset: number = nonInlineCommentStr.indexOf("{{");
    if (startDoubleBraceOffset != -1) {
      const endDoubleBraceOffset: number = nonInlineCommentStr.indexOf("}}", startDoubleBraceOffset + 2);
      if (endDoubleBraceOffset != -1) {
        // remove this comment
        const badElement = nonInlineCommentStr.substr(startDoubleBraceOffset, endDoubleBraceOffset - startDoubleBraceOffset + 1);
        //this.logMessage('  -- badElement=[' + badElement + ']');
        nonInlineCommentStr = nonInlineCommentStr.replace(badElement, " ".repeat(badElement.length));
      }
    }
    const startSingleBraceOffset: number = nonInlineCommentStr.indexOf("{");
    if (startSingleBraceOffset != -1) {
      const endSingleBraceOffset: number = nonInlineCommentStr.indexOf("}", startSingleBraceOffset + 1);
      if (endSingleBraceOffset != -1) {
        // remove this comment
        const badElement = nonInlineCommentStr.substr(startSingleBraceOffset, endSingleBraceOffset - startSingleBraceOffset + 1);
        //this.logMessage('  -- badElement=[' + badElement + ']');
        nonInlineCommentStr = nonInlineCommentStr.replace(badElement, " ".repeat(badElement.length));
      }
    }
    //if (nonInlineCommentStr.length != line.length) {
    //    this.logMessage('  -- NIC line [' + line + ']');
    //    this.logMessage('  --          [' + nonInlineCommentStr + ']');
    //}
    return nonInlineCommentStr;
  }

  public getNonDocCommentLineRemainder(startingOffset: number, line: string): string {
    let nonDocCommentRHSStr: string = line;
    //this.logMessage('  -- gnclr ofs=' + startingOffset + '[' + line + '](' + line.length + ')');
    // TODO: UNDONE make this into loop to find first ' not in string
    if (line.length - startingOffset > 0) {
      const nonCommentEOL: number = line.length - 1;
      //this.logMessage('- gnclr startingOffset=[' + startingOffset + '], currentOffset=[' + currentOffset + ']');
      nonDocCommentRHSStr = line.substr(startingOffset, nonCommentEOL - startingOffset + 1).trim();
      //this.logMessage('- gnclr nonCommentRHSStr=[' + startingOffset + ']');

      const singleLineMultiBeginOffset: number = nonDocCommentRHSStr.indexOf("{", startingOffset);
      if (singleLineMultiBeginOffset != -1) {
        const singleLineMultiEndOffset: number = nonDocCommentRHSStr.indexOf("}", singleLineMultiBeginOffset);
        if (singleLineMultiEndOffset != -1) {
          const oneLineMultiComment: string = nonDocCommentRHSStr.substr(singleLineMultiBeginOffset, singleLineMultiEndOffset - singleLineMultiBeginOffset + 1);
          nonDocCommentRHSStr = nonDocCommentRHSStr.replace(oneLineMultiComment, "").trim();
        }
      }
    } else if (line.length - startingOffset == 0) {
      nonDocCommentRHSStr = "";
    }
    //if (line.substr(startingOffset).length != nonCommentRHSStr.length) {
    //    this.logMessage('  -- NCLR line [' + line.substr(startingOffset) + ']');
    //    this.logMessage('  --           [' + nonCommentRHSStr + ']');
    //}
    return nonDocCommentRHSStr;
  }

  public getNonWhiteDataInitLineParts(line: string): string[] {
    const nonEqualsLine: string = this.removeDoubleQuotedStrings(line);
    let lineParts: string[] | null = nonEqualsLine.match(/[^ \t\,\[\]\(\)\+\-\/\<\>\|\*\@]+/g);
    if (lineParts === null) {
      lineParts = [];
    }
    return lineParts;
  }

  public getNonWhiteCONLineParts(line: string): string[] {
    const nonEqualsLine: string = this.removeDoubleQuotedStrings(line);
    let lineParts: string[] | null = nonEqualsLine.match(/[^  \t\(\)\*\+\-\/\>\<\=]+/g);
    if (lineParts === null) {
      lineParts = [];
    }
    return lineParts;
  }

  public getNonWhitePasmLineParts(line: string): string[] {
    const nonEqualsLine: string = this.removeDoubleQuotedStrings(line);
    let lineParts: string[] | null = nonEqualsLine.match(/[^ \t\,\(\)\[\]\<\>\=\?\!\^\+\*\&\|\-\\\#\@\/]+/g);
    if (lineParts === null) {
      lineParts = [];
    }
    return lineParts;
  }

  public getNonCommentLineRemainder(startingOffset: number, line: string): string {
    let nonCommentRHSStr: string = line;
    //this.logMessage('  -- gnclr ofs=' + startingOffset + '[' + line + '](' + line.length + ')');
    // TODO: UNDONE make this into loop to find first ' not in string
    if (line.length - startingOffset > 0) {
      //this.logMessage('- gnclr startingOffset=[' + startingOffset + '], startingOffset=[' + line + ']');
      let currentOffset: number = this.skipWhite(line, startingOffset);
      // get line parts - we only care about first one
      let beginCommentOffset: number = line.indexOf("'", currentOffset);
      if (beginCommentOffset != -1) {
        // have single quote, is it within quoted string?
        const startDoubleQuoteOffset: number = line.indexOf('"', currentOffset);
        if (startDoubleQuoteOffset != -1) {
          const nonStringLine: string = this.removeDoubleQuotedStrings(line, false); // false disabled debug output
          beginCommentOffset = nonStringLine.indexOf("'", currentOffset);
        }
      }
      if (beginCommentOffset === -1) {
        beginCommentOffset = line.indexOf("{", currentOffset);
      }
      const nonCommentEOL: number = beginCommentOffset != -1 ? beginCommentOffset - 1 : line.length - 1;
      //this.logMessage('- gnclr startingOffset=[' + startingOffset + '], currentOffset=[' + currentOffset + ']');
      nonCommentRHSStr = line.substr(currentOffset, nonCommentEOL - currentOffset + 1).trim();
      //this.logMessage('- gnclr nonCommentRHSStr=[' + startingOffset + ']');

      const singleLineMultiBeginOffset: number = nonCommentRHSStr.indexOf("{", currentOffset);
      if (singleLineMultiBeginOffset != -1) {
        const singleLineMultiEndOffset: number = nonCommentRHSStr.indexOf("}", singleLineMultiBeginOffset);
        if (singleLineMultiEndOffset != -1) {
          const oneLineMultiComment: string = nonCommentRHSStr.substr(singleLineMultiBeginOffset, singleLineMultiEndOffset - singleLineMultiBeginOffset + 1);
          nonCommentRHSStr = nonCommentRHSStr.replace(oneLineMultiComment, "").trim();
        }
      }
    } else if (line.length - startingOffset == 0) {
      nonCommentRHSStr = "";
    }
    //if (line.substr(startingOffset).length != nonCommentRHSStr.length) {
    //    this.logMessage('  -- NCLR line [' + line.substr(startingOffset) + ']');
    //    this.logMessage('  --           [' + nonCommentRHSStr + ']');
    //}
    return nonCommentRHSStr;
  }

  public removeDoubleQuotedStrings(line: string, showDebug: boolean = true): string {
    //this.logMessage('- RQS line [' + line + ']');
    let trimmedLine: string = line;
    //this.logMessage('- RQS line [' + line + ']');
    const doubleQuote: string = '"';
    let quoteStartOffset: number = 0; // value doesn't matter
    let didRemove: boolean = false;
    while ((quoteStartOffset = trimmedLine.indexOf(doubleQuote)) != -1) {
      const quoteEndOffset: number = trimmedLine.indexOf(doubleQuote, quoteStartOffset + 1);
      //this.logMessage('  -- quoteStartOffset=[' + quoteStartOffset + '] quoteEndOffset=[' + quoteEndOffset + ']');
      if (quoteEndOffset != -1) {
        const badElement = trimmedLine.substr(quoteStartOffset, quoteEndOffset - quoteStartOffset + 1);
        //this.logMessage('  -- badElement=[' + badElement + ']');
        trimmedLine = trimmedLine.replace(badElement, "#".repeat(badElement.length));
        didRemove = showDebug ? true : false;
        //this.logMessage('-         post[' + trimmedLine + ']');
      } else {
        break; // we don't handle a single double-quote
      }
    }

    //if (didRemove) {
    //    this.logMessage('  -- RQS line [' + line + ']');
    //    this.logMessage('  --          [' + trimmedLine + ']');
    //}

    return trimmedLine;
  }

  public skipWhite(line: string, currentOffset: number): number {
    let firstNonWhiteIndex: number = currentOffset;
    for (let index = currentOffset; index < line.length; index++) {
      if (line.substr(index, 1) != " " && line.substr(index, 1) != "\t") {
        firstNonWhiteIndex = index;
        break;
      }
    }
    return firstNonWhiteIndex;
  }

  public getNonWhiteLineParts(line: string): string[] {
    let lineParts: string[] | null = line.match(/[^ \t]+/g);
    if (lineParts === null) {
      lineParts = [];
    }
    return lineParts;
  }

  public getNonWhiteNParenLineParts(line: string): string[] {
    let lineParts: string[] | null = line.match(/[^ \t\()]+/g);
    if (lineParts === null) {
      lineParts = [];
    }
    return lineParts;
  }

  // ----------------------------------------------------------------------------
  // Built-in SPIN variables P2
  //
  private spinHubLocations: { [Identifier: string]: string } = {
    clkmode: "Clock mode value",
    clkfreq: "Clock frequency value",
  };

  private spinHubVariables: { [Identifier: string]: string } = {
    varbase: "Object base pointer, @VARBASE is VAR base, used by method-pointer calls",
  };

  private spinCogRegisters: { [Identifier: string]: string } = {
    pr0: "Spin2 <-> PASM communication",
    pr1: "Spin2 <-> PASM communication",
    pr2: "Spin2 <-> PASM communication",
    pr3: "Spin2 <-> PASM communication",
    pr4: "Spin2 <-> PASM communication",
    pr5: "Spin2 <-> PASM communication",
    pr6: "Spin2 <-> PASM communication",
    pr7: "Spin2 <-> PASM communication",
    ijmp1: "Interrupt JMP 1 (of 3)",
    ijmp2: "Interrupt JMP 2 (of 3)",
    ijmp3: "Interrupt JMP 3 (of 3)",
    iret1: "Interrupt RET 1 (of 3)",
    iret2: "Interrupt RET 2 (of 3)",
    iret3: "Interrupt RET 3 (of 3)",
    pa: "General pointer register A",
    pb: "General pointer register B",
    ptra: "Data pointer passed from COGINIT",
    ptrb: "Code pointer passed from COGINIT",
    dira: "Output enables for P31..P0",
    dirb: "Output enables for P63..P32",
    outa: "Output states for P31..P0",
    outb: "Output states for P63..P32",
    ina: "Input states from P31..P0",
    inb: "Input states from P63..P32",
  };

  private _docTextForSpinBuiltInVariable(name: string): IBuiltinDescription {
    const nameKey: string = name.toLowerCase();
    let desiredDocText: IBuiltinDescription = { found: false, type: eBuiltInType.Unknown, category: "", description: "", signature: "" };
    if (this.isSpinBuiltInVariable(name)) {
      desiredDocText.found = true;
      if (nameKey in this.spinHubLocations) {
        desiredDocText.category = "Hub Location";
        desiredDocText.description = this.spinHubLocations[nameKey];
      } else if (nameKey in this.spinHubVariables) {
        desiredDocText.category = "Hub Variable";
        desiredDocText.description = this.spinHubVariables[nameKey];
      } else if (nameKey in this.spinCogRegisters) {
        desiredDocText.category = "Cog Register";
        desiredDocText.description = this.spinCogRegisters[nameKey];
      }
    }
    return desiredDocText;
  }

  public isSpinBuiltInVariable(name: string): boolean {
    const nameKey: string = name.toLowerCase();
    let reservedStatus: boolean = nameKey in this.spinHubLocations;
    if (!reservedStatus) {
      reservedStatus = nameKey in this.spinHubVariables;
    }
    if (!reservedStatus) {
      reservedStatus = nameKey in this.spinCogRegisters;
    }
    return reservedStatus;
  }

  // ----------------------------------------------------------------------------
  // Built-in SPIN variables P2
  //
  private _tableSpinBlockNames: { [Identifier: string]: string } = {
    con: "32-bit Constant declarations<br>*(NOTE: CON is the initial/default block type)*",
    obj: "Child object instantiations<br>*(objects manipulated by this object)*",
    var: "Object Instance variable declarations",
    pub: "Public method for use by the parent object and within this object",
    pri: "Private method for use within this object",
    dat: "Object Shared variable declarations and/or PASM code",
  };

  private _docTextForSpinBuiltInLanguagePart(name: string): IBuiltinDescription {
    const nameKey: string = name.toLowerCase();
    let desiredDocText: IBuiltinDescription = { found: false, type: eBuiltInType.Unknown, category: "", description: "", signature: "" };
    if (nameKey in this._tableSpinBlockNames) {
      desiredDocText.found = true;
      desiredDocText.category = "Block Name";
      desiredDocText.description = this._tableSpinBlockNames[nameKey];
    }
    return desiredDocText;
  }

  public docTextForBuiltIn(name: string): IBuiltinDescription {
    let desiredDocText: IBuiltinDescription = this._docTextForSpinBuiltInVariable(name);
    if (desiredDocText.found) {
      desiredDocText.type = eBuiltInType.BIT_VARIABLE;
    } else {
      desiredDocText = this._docTextForSpinBuiltInMethod(name);
      if (desiredDocText.found) {
        desiredDocText.type = eBuiltInType.BIT_METHOD;
      } else {
        desiredDocText = this._docTextForCogAndNumericSymbols(name);
        if (desiredDocText.found) {
          desiredDocText.type = eBuiltInType.BIT_SYMBOL;
        } else {
          desiredDocText = this._docTextForSpinBuiltInLanguagePart(name);
          if (desiredDocText.found) {
            desiredDocText.type = eBuiltInType.BIT_LANG_PART;
          } else {
            desiredDocText = this._docTextForSpinDebugBuiltInMethod(name);
            if (desiredDocText.found) {
              desiredDocText.type = eBuiltInType.BIT_DEBUG_METHOD;
            } else {
              desiredDocText = this._docTextForSpinDebugBuiltInSymbols(name);
              if (desiredDocText.found) {
                desiredDocText.type = eBuiltInType.BIT_DEBUG_SYMBOL;
              } else {
                desiredDocText = this._docTextForSpinBuiltInDebugDisplayType(name);
                if (desiredDocText.found) {
                  desiredDocText.type = eBuiltInType.BIT_DEBUG_SYMBOL;
                } else {
                  desiredDocText = this._docTextForSpinStorageTypesAlignment(name);
                  if (desiredDocText.found) {
                    desiredDocText.type = eBuiltInType.BIT_TYPE;
                  } else {
                    // TOD: add more calls here
                    // FIXME: do next assignment
                  }
                }
              }
            }
          }
        }
      }
    }
    return desiredDocText;
  }

  public isBuiltinReservedWord(name: string): boolean {
    // streamer constants, smart-pin constants
    const builtinNamesOfNote: string[] = [
      // streamer names
      "x_16p_2dac8_wfword",
      "x_16p_4dac4_wfword",
      "x_1adc8_0p_1dac8_wfbyte",
      "x_1adc8_8p_2dac8_wfword",
      "x_1p_1dac1_wfbyte",
      "x_2adc8_0p_2dac8_wfword",
      "x_2adc8_16p_4dac8_wflong",
      "x_2p_1dac2_wfbyte",
      "x_2p_2dac1_wfbyte",
      "x_32p_4dac8_wflong",
      "x_4adc8_0p_4dac8_wflong",
      "x_4p_1dac4_wfbyte",
      "x_4p_2dac2_wfbyte",
      "x_4p_4dac1_wfbyte",
      "x_8p_1dac8_wfbyte",
      "x_8p_2dac4_wfbyte",
      "x_8p_4dac2_wfbyte",
      "x_alt_off",
      "x_alt_on",
      "x_dacs_0n0_0n0",
      "x_dacs_0n0_x_x",
      "x_dacs_0_0_0_0",
      "x_dacs_0_0_x_x",
      "x_dacs_0_x_x_x",
      "x_dacs_1n1_0n0",
      "x_dacs_1_0_1_0",
      "x_dacs_1_0_x_x",
      "x_dacs_3_2_1_0",
      "x_dacs_off",
      "x_dacs_x_0_x_x",
      "x_dacs_x_x_0n0",
      "x_dacs_x_x_0_0",
      "x_dacs_x_x_0_x",
      "x_dacs_x_x_1_0",
      "x_dacs_x_x_x_0",
      "x_dds_goertzel_sinc1",
      "x_dds_goertzel_sinc2",
      "x_imm_16x2_1dac2",
      "x_imm_16x2_2dac1",
      "x_imm_16x2_lut",
      "x_imm_1x32_4dac8",
      "x_imm_2x16_2dac8",
      "x_imm_2x16_4dac4",
      "x_imm_32x1_1dac1",
      "x_imm_32x1_lut",
      "x_imm_4x8_1dac8",
      "x_imm_4x8_2dac4",
      "x_imm_4x8_4dac2",
      "x_imm_4x8_lut",
      "x_imm_8x4_1dac4",
      "x_imm_8x4_2dac2",
      "x_imm_8x4_4dac1",
      "x_imm_8x4_lut",
      "x_pins_off",
      "x_pins_on",
      "x_rfbyte_1p_1dac1",
      "x_rfbyte_2p_1dac2",
      "x_rfbyte_2p_2dac1",
      "x_rfbyte_4p_1dac4",
      "x_rfbyte_4p_2dac2",
      "x_rfbyte_4p_4dac1",
      "x_rfbyte_8p_1dac8",
      "x_rfbyte_8p_2dac4",
      "x_rfbyte_8p_4dac2",
      "x_rfbyte_luma8",
      "x_rfbyte_rgb8",
      "x_rfbyte_rgbi8",
      "x_rflong_16x2_lut",
      "x_rflong_32p_4dac8",
      "x_rflong_32x1_lut",
      "x_rflong_4x8_lut",
      "x_rflong_8x4_lut",
      "x_rflong_rgb24",
      "x_rfword_16p_2dac8",
      "x_rfword_16p_4dac4",
      "x_rfword_rgb16",
      "x_write_off",
      "x_write_on",
      // smart pin names
      "p_adc",
      "p_adc_100x",
      "p_adc_10x",
      "p_adc_1x",
      "p_adc_30x",
      "p_adc_3x",
      "p_adc_ext",
      "p_adc_float",
      "p_adc_gio",
      "p_adc_scope",
      "p_adc_vio",
      "p_async_io",
      "p_async_rx",
      "p_async_tx",
      "p_bitdac",
      "p_channel",
      "p_compare_ab",
      "p_compare_ab_fb",
      "p_counter_highs",
      "p_counter_periods",
      "p_counter_ticks",
      "p_count_highs",
      "p_count_rises",
      "p_dac_124r_3v",
      "p_dac_600r_2v",
      "p_dac_75r_2v",
      "p_dac_990r_3v",
      "p_dac_dither_pwm",
      "p_dac_dither_rnd",
      "p_dac_noise",
      "p_events_ticks",
      "p_high_100ua",
      "p_high_10ua",
      "p_high_150k",
      "p_high_15k",
      "p_high_1k5",
      "p_high_1ma",
      "p_high_fast",
      "p_high_float",
      "p_high_ticks",
      "p_invert_a",
      "p_invert_b",
      "p_invert_in",
      "p_invert_output",
      "p_level_a",
      "p_level_a_fbn",
      "p_level_a_fbp",
      "p_local_a",
      "p_local_b",
      "p_logic_a",
      "p_logic_a_fb",
      "p_logic_b_fb",
      "p_low_100ua",
      "p_low_10ua",
      "p_low_150k",
      "p_low_15k",
      "p_low_1k5",
      "p_low_1ma",
      "p_low_fast",
      "p_low_float",
      "p_minus1_a",
      "p_minus1_b",
      "p_minus2_a",
      "p_minus2_b",
      "p_minus3_a",
      "p_minus3_b",
      "p_nco_duty",
      "p_nco_freq",
      "p_normal",
      "p_oe",
      "p_outbit_a",
      "p_outbit_b",
      "p_periods_highs",
      "p_periods_ticks",
      "p_plus1_a",
      "p_plus1_b",
      "p_plus2_a",
      "p_plus2_b",
      "p_plus3_a",
      "p_plus3_b",
      "p_pulse",
      "p_pwm_sawtooth",
      "p_pwm_smps",
      "p_pwm_triangle",
      "p_quadrature",
      "p_reg_down",
      "p_reg_up",
      "p_repository",
      "p_schmitt_a",
      "p_schmitt_a_fb",
      "p_schmitt_b_fb",
      "p_state_ticks",
      "p_sync_io",
      "p_sync_rx",
      "p_sync_tx",
      "p_transition",
      "p_true_a",
      "p_true_b",
      "p_true_in",
      "p_true_output",
      "p_tt_00",
      "p_tt_01",
      "p_tt_10",
      "p_tt_11",
      "p_usb_pair",
      // event names
      "event_atn",
      "event_ct1",
      "event_ct2",
      "event_ct3",
      "event_fbw",
      "event_int",
      "event_pat",
      "event_qmt",
      "event_se1",
      "event_se2",
      "event_se3",
      "event_se4",
      "event_xfi",
      "event_xmt",
      "event_xrl",
      "event_xro",
      //
      "pr0",
      "pr1",
      "pr2",
      "pr3",
      "pr4",
      "pr5",
      "pr6",
      "pr7",
      "ijmp1",
      "ijmp2",
      "ijmp3",
      "iret1",
      "iret2",
      "iret3",
      "pa",
      "pb",
      "ptra",
      "ptrb",
      "dira",
      "dirb",
      "outa",
      "outb",
      "ina",
      "inb",
    ];
    const reservedStatus: boolean = builtinNamesOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  // -------------------------------------------------------------------------
  // keyword checks
  private _tableDebugMethodsString: { [Identifier: string]: string[] } = {
    zstr: ["ZSTR(hub_pointer)", "Output zero-terminated string at hub_pointer"],
    lstr: ["LSTR(hub_pointer,size)", "Output 'size' characters of string at hub_pointer"],
  };

  private _tableDebugMethodsUnsignedDec: { [Identifier: string]: string[] } = {
    udec: ["UDEC(value)", "Output unsigned decimal value (0 - 4_294_967_295)"],
    udec_byte: ["UDEC_BYTE(value)", "Output BYTE-size(8-bit) unsigned decimal value (0 - 255)"],
    udec_word: ["UDEC_WORD(value)", "Output WORD-size(16-bit) unsigned decimal value (0 - 65_535)"],
    udec_long: ["UDEC_LONG(value)", "Output LONG-size(32-bit) unsigned decimal value (0 - 4_294_967_295)"],
    udec_reg_array: ["UDEC_REG_ARRAY(reg_pointer,size)", "Output register array as unsigned decimal values (0 - 4_294_967_295)"],
    udec_byte_array: ["UDEC_BYTE_ARRAY(hub_pointer,size)", "Output hub BYTE array as unsigned decimal values (0 - 255)"],
    udec_word_array: ["UDEC_WORD_ARRAY(hub_pointer,size)", "Output hub WORD array as unsigned decimal value (0 - 65_535)"],
    udec_long_array: ["UDEC_LONG_ARRAY(hub_pointer,size)", "Output hub LONG array as unsigned decimal value (0 - 4_294_967_295)"],
  };

  private _tableDebugMethodsSignedDec: { [Identifier: string]: string[] } = {
    sdec: ["SDEC(value)", "Output signed decimal value (-2_147_483_648 - 2_147_483_647)"],
    sdec_byte: ["SDEC_BYTE(value)", "Output BYTE-size(8-bit) signed decimal value (-128 - 127)"],
    sdec_word: ["SDEC_WORD(value)", "Output WORD-size(16-bit) signed decimal value (-32_768 - 65_535)"],
    sdec_long: ["SDEC_LONG(value)", "Output LONG-size(32-bit) signed decimal value (-2_147_483_648 - 2_147_483_647)"],
    sdec_reg_array: ["SDEC_REG_ARRAY(reg_pointer,size)", "Output register array as signed decimal values (-2_147_483_648 - 2_147_483_647)"],
    sdec_byte_array: ["SDEC_BYTE_ARRAY(hub_pointer,size)", "Output hub BYTE array as signed decimal values (-128 - 127)"],
    sdec_word_array: ["SDEC_WORD_ARRAY(hub_pointer,size)", "Output hub WORD array as signed decimal value (-32_768 - 32_767)"],
    sdec_long_array: ["SDEC_LONG_ARRAY(hub_pointer,size)", "Output hub LONG array as signed decimal value (-2_147_483_648 - 2_147_483_647)"],
  };

  private _tableDebugMethodsUnsignedHex: { [Identifier: string]: string[] } = {
    uhex: ["UHEX(value)", "Output auto-size unsigned hex value ($0 - $FFFF_FFFF)"],
    uhex_byte: ["UHEX_BYTE(value)", "Output BYTE-size(8-bit) unsigned hex value ($00 - $FF)"],
    uhex_word: ["UHEX_WORD(value)", "Output WORD-size(16-bit) unsigned hex value ($0000 - $FFFF)"],
    uhex_long: ["UHEX_LONG(value)", "Output LONG-size(32-bit) unsigned hex value ($0000_0000 - $FFFF_FFFF)"],
    uhex_reg_array: ["UHEX_REG_ARRAY(reg_pointer,size)", "Output register array as unsigned hex values ($0000_0000 - $FFFF_FFFF)"],
    uhex_byte_array: ["UHEX_BYTE_ARRAY(hub_pointer,size)", "Output hub BYTE array as unsigned hex values ($00 - $FF)"],
    uhex_word_array: ["UHEX_WORD_ARRAY(hub_pointer,size)", "Output hub WORD array as unsigned hex values ($0000 - $FFFF)"],
    uhex_long_array: ["UHEX_LONG_ARRAY(hub_pointer,size)", "Output hub LONG array as unsigned hex values ($0000_0000 - $FFFF_FFFF)"],
  };

  private _tableDebugMethodsSignedHex: { [Identifier: string]: string[] } = {
    shex: ["SHEX(value)", "Output auto-size signed hex value (-$8000_0000 - $7FFF_FFFF)"],
    shex_byte: ["SHEX_BYTE(value)", "Output BYTE-size(8-bit) signed hex value (-$80 - $7F)"],
    shex_word: ["SHEX_WORD(value)", "Output WORD-size(16-bit) signed hex value (-$8000 - $7FFF)"],
    shex_long: ["SHEX_LONG(value)", "Output LONG-size(32-bit) signed hex value (-$8000_0000 - $7FFF_FFFF)"],
    shex_reg_array: ["SHEX_REG_ARRAY(reg_pointer,size)", "Output register array as signed hex values (-$8000_0000 - $7FFF_FFFF)"],
    shex_byte_array: ["SHEX_BYTE_ARRAY(hub_pointer,size)", "Output hub BYTE array as signed hex values (-$80 - $7F)"],
    shex_word_array: ["SHEX_WORD_ARRAY(hub_pointer,size)", "Output hub WORD array as signed hex values (-$8000 - $7FFF)"],
    shex_long_array: ["SHEX_LONG_ARRAY(hub_pointer,size)", "Output hub LONG array as signed hex values (-$8000_0000 - $7FFF_FFFF)"],
  };

  private _tableDebugMethodsUnsignedBin: { [Identifier: string]: string[] } = {
    ubin: ["UBIN(value)", "Output auto-size unsigned binary value"],
    ubin_byte: ["UBIN_BYTE(value)", "Output BYTE-size(8-bit) unsigned binary value"],
    ubin_word: ["UBIN_WORD(value)", "Output WORD-size(16-bit) unsigned binary value"],
    ubin_long: ["UBIN_LONG(value)", "Output LONG-size(32-bit) unsigned binary value"],
    ubin_reg_array: ["UBIN_REG_ARRAY(reg_pointer,size)", "Output register array as unsigned binary values"],
    ubin_byte_array: ["UBIN_BYTE_ARRAY(hub_pointer,size)", "Output hub BYTE array as unsigned binary values"],
    ubin_word_array: ["UBIN_WORD_ARRAY(hub_pointer,size)", "Output hub WORD array as unsigned binary values"],
    ubin_long_array: ["UBIN_LONG_ARRAY(hub_pointer,size)", "Output hub LONG array as unsigned binary values"],
  };

  private _tableDebugMethodsSignedBin: { [Identifier: string]: string[] } = {
    sbin: ["SBIN(value)", "Output auto-size signed binary value"],
    sbin_byte: ["SBIN_BYTE(value)", "Output BYTE-size(8-bit) signed binary value"],
    sbin_word: ["SBIN_WORD(value)", "Output WORD-size(16-bit) signed binary value"],
    sbin_long: ["SBIN_LONG(value)", "Output LONG-size(32-bit) signed binary value"],
    sbin_reg_array: ["SBIN_REG_ARRAY(reg_pointer,size)", "Output register array as signed binary values"],
    sbin_byte_array: ["SBIN_BYTE_ARRAY(hub_pointer,size)", "Output hub BYTE array as signed binary values"],
    sbin_word_array: ["SBIN_WORD_ARRAY(hub_pointer,size)", "Output hub WORD array as signed binary values"],
    sbin_long_array: ["SBIN_LONGARRAY(hub_pointer,size)", "Output hub LONG array as signed binary values"],
  };

  private _tableDebugMethodsFloat: { [Identifier: string]: string[] } = {
    fdec: ["FDEC(value)", "Output floating-point value (-3.4e+38 - 3.4e+38)"],
    fdec_array: ["FDEC_ARRAY(hub_pointer,size)", "Output hub long array as floating-point values (-3.4e+38 - 3.4e+38)"],
    fdec_reg_array: ["FDEC_REG_ARRAY(reg_pointer,size)", "Output register array as floating-point values (-3.4e+38 - 3.4e+38)"],
  };

  private _tableDebugMethodsMisc: { [Identifier: string]: string[] } = {
    dly: ["DLY(milliseconds)", "Delay for some milliseconds to slow down continuous message outputs for this cog."],
    pc_key: [
      "PC_KEY(pointer_to_long)",
      "FOR USE IN GRAPHICAL DEBUG() DISPLAYS - Must be the last command in a DEBUG() statement.<br>Returns any new host-PC keypress that occurred within the last 100ms into a long inside the chip. The DEBUG() Display must have focus for keypresses to be noticed.",
    ],
    pc_mouse: [
      "PC_MOUSE(pointer_to_7_longs)",
      "FOR USE IN GRAPHICAL DEBUG DISPLAYS - Must be the last command in a DEBUG() statement.<br>Returns the current host-PC mouse status into a 7-long structure inside the chip",
    ],
  };

  private _tableDebugMethodsConditionals: { [Identifier: string]: string[] } = {
    if: ["IF(condition)", "If condition <> 0 then continue at the next command within the DEBUG() statement, else skip all remaining commands and output CR+LF."],
    ifnot: ["IFNOT(condition)", "If condition = 0 then continue at the next command within the DEBUG() statement, else skip all remaining commands and output CR+LF."],
  };

  public isDebugMethod(name: string): boolean {
    const bIsUnderscoreSuffix: boolean = name.endsWith("_") ? true : false;
    const nameKey: string = bIsUnderscoreSuffix ? name.substring(0, name.length - 1).toLowerCase() : name.toLowerCase();
    let reservedStatus: boolean = nameKey in this._tableDebugMethodsString;
    if (!reservedStatus) {
      reservedStatus = nameKey in this._tableDebugMethodsUnsignedDec;
    }
    if (!reservedStatus) {
      reservedStatus = nameKey in this._tableDebugMethodsSignedDec;
    }
    if (!reservedStatus) {
      reservedStatus = nameKey in this._tableDebugMethodsUnsignedHex;
    }
    if (!reservedStatus) {
      reservedStatus = nameKey in this._tableDebugMethodsSignedHex;
    }
    if (!reservedStatus) {
      reservedStatus = nameKey in this._tableDebugMethodsUnsignedBin;
    }
    if (!reservedStatus) {
      reservedStatus = nameKey in this._tableDebugMethodsSignedBin;
    }
    if (!reservedStatus) {
      reservedStatus = nameKey in this._tableDebugMethodsFloat;
    }
    if (!reservedStatus) {
      reservedStatus = nameKey in this._tableDebugMethodsMisc;
    }
    if (!reservedStatus) {
      reservedStatus = nameKey in this._tableDebugMethodsConditionals;
    }
    return reservedStatus;
  }

  private _docTextForSpinDebugBuiltInMethod(name: string): IBuiltinDescription {
    const bIsUnderscoreSuffix: boolean = name.endsWith("_") ? true : false;
    const nameKey: string = bIsUnderscoreSuffix ? name.substring(0, name.length - 1).toLowerCase() : name.toLowerCase();
    let desiredDocText: IBuiltinDescription = { found: false, type: eBuiltInType.Unknown, category: "", description: "", signature: "" };
    let bSupportsSuffix: boolean = true;
    if (this.isDebugMethod(name)) {
      desiredDocText.found = true;
      let protoWDescr: string[] = [];
      if (nameKey in this._tableDebugMethodsString) {
        desiredDocText.category = "String Output";
        protoWDescr = this._tableDebugMethodsString[nameKey];
      } else if (nameKey in this._tableDebugMethodsUnsignedDec) {
        desiredDocText.category = "Unsigned Decimal Output";
        protoWDescr = this._tableDebugMethodsUnsignedDec[nameKey];
      } else if (nameKey in this._tableDebugMethodsSignedDec) {
        desiredDocText.category = "Signed Decimal Output";
        protoWDescr = this._tableDebugMethodsSignedDec[nameKey];
      } else if (nameKey in this._tableDebugMethodsUnsignedHex) {
        desiredDocText.category = "Unsigned Hexedecimal Output";
        protoWDescr = this._tableDebugMethodsUnsignedHex[nameKey];
      } else if (nameKey in this._tableDebugMethodsSignedHex) {
        desiredDocText.category = "Signed Hexedecimal Output";
        protoWDescr = this._tableDebugMethodsSignedHex[nameKey];
      } else if (nameKey in this._tableDebugMethodsUnsignedBin) {
        desiredDocText.category = "Unsigned Binary Output";
        protoWDescr = this._tableDebugMethodsUnsignedBin[nameKey];
      } else if (nameKey in this._tableDebugMethodsSignedBin) {
        desiredDocText.category = "Signed Binary Output";
        protoWDescr = this._tableDebugMethodsSignedBin[nameKey];
      } else if (nameKey in this._tableDebugMethodsFloat) {
        desiredDocText.category = "Floating Point Output";
        protoWDescr = this._tableDebugMethodsFloat[nameKey];
      } else if (nameKey in this._tableDebugMethodsMisc) {
        bSupportsSuffix = false;
        desiredDocText.category = "Miscellaneous";
        protoWDescr = this._tableDebugMethodsMisc[nameKey];
      } else if (nameKey in this._tableDebugMethodsConditionals) {
        bSupportsSuffix = false;
        desiredDocText.category = "Conditionals";
        protoWDescr = this._tableDebugMethodsConditionals[nameKey];
      }
      if (!bIsUnderscoreSuffix || (bIsUnderscoreSuffix && bSupportsSuffix)) {
        if (protoWDescr.length != 0) {
          desiredDocText.signature = protoWDescr[0];
          if (bIsUnderscoreSuffix) {
            desiredDocText.description = protoWDescr[1] + "<br>*(Trailing underscore: removes the variable name from the output)*"; // italics
          } else {
            desiredDocText.description = protoWDescr[1];
          }
        }
      } else if (bIsUnderscoreSuffix && !bSupportsSuffix) {
        desiredDocText.signature = protoWDescr[0];
        desiredDocText.description = protoWDescr[1] + "<br>**(WARNING Underscore Suffix is NOT allowed)**"; // bold
      }
    }
    return desiredDocText;
  }

  private _tableDebugInvocations: { [Identifier: string]: string } = {
    debug: "invoke this cog's PASM-level debugger.",
    debug_main:
      'each cog\'s PASM-level debugger will initially be invoked when a COGINIT occurs, and it will be ready to single-step through main (non-interrupt) code. In this case, DEBUG commands will be ignored, until you select "DEBUG" sensitivity in the debugger.',
    debug_coginit: "each cog's PASM-level debugger will initially be invoked when a COGINIT occurs",
  };

  public isDebugInvocation(name: string): boolean {
    const nameKey: string = name.toLowerCase();
    let reservedStatus: boolean = nameKey in this._tableDebugInvocations;
    return reservedStatus;
  }

  private _tableDebugSymbols: { [Identifier: string]: string } = {
    download_baud: "(default 2_000_000)<br>Sets the download baud rate.",
    debug_cogs: "(default %1111_1111)<br>Selects which cogs have debug interrupts enabled. Bits 7..0 enable debugging interrupts in cogs 7..0.",
    debug_delay: "(default 0)<br>Sets a delay in milliseconds before your application runs and begins transmitting DEBUG messages.",
    debug_pin_tx: "(default 62)<br>Sets the DEBUG serial output pin. For DEBUG windows to open, DEBUG_PIN must be 62.",
    debug_pin_rx: "(default 63)<br>Sets the DEBUG serial input pin for interactivity with the host PC.",
    debug_baud: "(default download_baud)<br>Sets the DEBUG baud rate. May be necessary to add DEBUG_DELAY if DEBUG_BAUD is less than DOWNLOAD_BAUD.",
    debug_timestamp: "By declaring this symbol, each DEBUG message will be time-stamped with the 64-bit CT value.",
    debug_log_size: "(default 0)<br>Sets the maximum size in bytes of the 'DEBUG.log' file which will collect DEBUG messages. A value of 0 will inhibit log file generation.",
    debug_left: "Sets the left screen coordinate where the DEBUG message window will appear.",
    debug_top: "Sets the top screen coordinate where the DEBUG message window will appear.",
    debug_width: "Sets the width of the DEBUG message window.",
    debug_height: "Sets the height of the DEBUG message window.",
    debug_display_left: "(default 0)<br>Sets the overall left screen offset where any DEBUG displays will appear (adds to 'POS' x coordinate in each DEBUG display).",
    debug_display_top: "(default 0)<br>Sets the overall top screen offset where any DEBUG displays will appear (adds to 'POS' y coordinate in each DEBUG display).",
    debug_windows_off: "(default 0)<br>Disables any DEBUG windows from opening after downloading, if set to a non-zero value.",
  };

  public isDebugSymbol(name: string): boolean {
    const nameKey: string = name.toLowerCase();
    let reservedStatus: boolean = nameKey in this._tableDebugSymbols;
    return reservedStatus;
  }

  private _docTextForSpinDebugBuiltInSymbols(name: string): IBuiltinDescription {
    const bIsUnderscoreSuffix: boolean = name.endsWith("_") ? true : false;
    const nameKey: string = bIsUnderscoreSuffix ? name.substring(0, name.length - 1).toLowerCase() : name.toLowerCase();
    let desiredDocText: IBuiltinDescription = { found: false, type: eBuiltInType.Unknown, category: "", description: "", signature: "" };
    let bSupportsSuffix: boolean = true;
    if (this.isDebugMethod(nameKey) || this.isDebugInvocation(nameKey)) {
      desiredDocText.found = true;
      let protoWDescr: string[] = [];
      if (nameKey in this._tableDebugInvocations) {
        desiredDocText.category = "Debug Invocation";
        desiredDocText.description = this._tableDebugInvocations[nameKey];
      } else if (nameKey in this._tableDebugSymbols) {
        desiredDocText.category = "Debug Symbol";
        desiredDocText.description = this._tableDebugSymbols[nameKey];
      }
    }
    return desiredDocText;
  }

  // operators

  public isBinaryOperator(name: string): boolean {
    const binaryOperationsOfNote: string[] = ["sar", "ror", "rol", "rev", "zerox", "signx", "sca", "scas", "frac", "addbits", "addpins", "and", "or", "xor"];
    const reservedStatus: boolean = binaryOperationsOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  public isUnaryOperator(name: string): boolean {
    const unaryOperationsOfNote: string[] = ["not", "abs", "fabs", "encod", "decod", "bmask", "ones", "sqrt", "fsqrt", "qlog", "qexp"];
    const reservedStatus: boolean = unaryOperationsOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  public isSpinReservedWord(name: string): boolean {
    const nameKey: string = name.toLowerCase();
    const spinInstructionsOfNote: string[] = [
      "reg",
      "field",
      "float",
      "round",
      "trunc",
      "nan",
      "clkmode",
      "clkfreq",
      "varbase",
      "clkmode_",
      "clkfreq_",
      "if",
      "ifnot",
      "elseif",
      "elseifnot",
      "else",
      "while",
      "repeat",
      "until",
      "from",
      "to",
      "step",
      "next",
      "quit",
      "case",
      "case_fast",
      "other",
      "abort",
      "return",
    ];
    let reservedStatus: boolean = spinInstructionsOfNote.indexOf(nameKey) != -1;
    if (reservedStatus == false) {
      reservedStatus = this.isBinaryOperator(name);
    }
    if (reservedStatus == false) {
      reservedStatus = this.isUnaryOperator(name);
    }
    if (reservedStatus == false) {
      reservedStatus = nameKey in this.spinNumericSymbols;
    }
    return reservedStatus;
  }

  private spinNumericSymbols: { [Identifier: string]: string } = {
    false: "%0000_0000, Same as 0",
    true: "%FFFF_FFFF, Same as -1",
    negx: "%8000_0000, Negative-extreme integer, -2_147_483_648",
    posx: "%7FFF_FFFF, ositive-extreme integer, +2_147_483_647 ($7FFF_FFFF)",
    pi: "%4049_0FDB, Single-precision floating-point value of Pi, 3.14159265",
  };

  private spinCoginitSymbols: { [Identifier: string]: string } = {
    cogexec: '%00_0000, (default) Use "COGEXEC + CogNumber" to start a cog in cogexec mode',
    hubexec: '%10_0000, Use "HUBEXEC + CogNumber" to start a cog in hubexec mode',
    cogexec_new: "%01_0000, Starts an available cog in cogexec mode",
    hubexec_new: "%11_0000, Starts an available cog in hubexec mode",
    cogexec_new_pair: "%01_0001, Starts an available eve/odd pair of cogs in cogexec mode, useful for LUT sharing",
    hubexec_new_pair: "%11_0001, Starts an available eve/odd pair of cogs in hubexec mode, useful for LUT sharing",
  };

  private spinCogexecSymbols: { [Identifier: string]: string } = {
    newcog: "%01_0000, Starts an available cog",
  };

  private _docTextForCogAndNumericSymbols(name: string): IBuiltinDescription {
    const nameKey: string = name.toLowerCase();
    let desiredDocText: IBuiltinDescription = { found: false, type: eBuiltInType.Unknown, category: "", description: "", signature: "" };
    if (this.isCoginitReservedSymbol(name)) {
      desiredDocText.found = true;
      if (nameKey in this.spinCoginitSymbols) {
        desiredDocText.category = "Coginit";
        desiredDocText.description = this.spinCoginitSymbols[nameKey];
      } else if (nameKey in this.spinCogexecSymbols) {
        desiredDocText.category = "Cogexec";
        desiredDocText.description = this.spinCogexecSymbols[nameKey];
      }
    } else if (nameKey in this.spinNumericSymbols) {
      desiredDocText.found = true;
      desiredDocText.category = "Numeric";
      desiredDocText.description = this.spinNumericSymbols[nameKey];
    }
    return desiredDocText;
  }

  public isCoginitReservedSymbol(name: string): boolean {
    const nameKey: string = name.toLowerCase();
    let reservedStatus: boolean = nameKey in this.spinCoginitSymbols;
    if (!reservedStatus) {
      reservedStatus = nameKey in this.spinCogexecSymbols;
    }
    return reservedStatus;
  }

  public isFloatConversion(name: string): boolean {
    const floatConversionOfNote: string[] = ["float", "round", "trunc"];
    const reservedStatus: boolean = floatConversionOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  public isPasmModczOperand(name: string): boolean {
    const pasmModczOperand: string[] = [
      "_clr",
      "_nc_and_nz",
      "_nz_and_nc",
      " _gt",
      "_nc_and_z",
      "_z_and_nc",
      "_nc",
      "_ge",
      "_c_and_nz",
      "_nz_and_c",
      "_nz",
      "_ne",
      "_c_ne_z",
      "_z_ne_c",
      "_nc_or_nz",
      "_nz_or_nc",
      "_c_and_z",
      "_z_and_c",
      "_c_eq_z",
      "_z_eq_c",
      "_z",
      "_e",
      "_nc_or_z",
      "_z_or_nc",
      "_c",
      "_lt",
      "_c_or_nz",
      "_nz_or_c",
      "_c_or_z",
      "_z_or_c",
      "_le",
      "_set",
    ];
    const reservedStatus: boolean = pasmModczOperand.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  // ----------------------------------------------------------------------------
  // Built-in SPIN methods P2
  //
  private spinHubMethods: { [Identifier: string]: string[] } = {
    hubset: ["HUBSET(Value)", "Execute HUBSET instruction using Value."],
    clkset: ["CLKSET(NewCLKMODE, NewCLKFREQ)", "Safely establish new clock settings, updates CLKMODE and CLKFREQ."],
    cogspin: ["COGSPIN(CogNum, Method({Pars}), StkAddr)", "Start Spin2 method in a cog, returns cog's ID if used as an expression element, -1 = no cog free."],
    coginit: ["COGINIT(CogNum, PASMaddr, PTRAvalue)", "Start PASM code in a cog, returns cog's ID if used as an expression element, -1 = no cog free."],
    cogstop: ["COGSTOP(CogNum)", "Stop cog CogNum."],
    cogid: ["COGID() : CogNum", "Get this cog's ID."],
    cogchk: ["COGCHK(CogNum) : Running", "Check if cog CogNum is running, returns -1 if running or 0 if not."],
    locknew: ["LOCKNEW() : LockNum", "Check out a new LOCK from inventory, LockNum = 0..15 if successful or < 0 if no LOCK available."],
    lockret: ["LOCKRET(LockNum)", "Return a certain LOCK to inventory."],
    locktry: ["LOCKTRY(LockNum) : LockState", "Try to capture a certain LOCK, LockState = -1 if successful or 0 if another cog has captured the LOCK."],
    lockrel: ["LOCKREL(LockNum)", "Release a certain LOCK."],
    lockchk: ["LOCKCHK(LockNum) : LockState", "Check a certain LOCK's state, LockState[31] = captured, LockState[3:0] = current or last owner cog."],
    cogatn: ["COGATN(CogMask)", "Strobe ATN input(s) of cog(s) according to 16-bit CogMask."],
    pollatn: ["POLLATN() : AtnFlag", "Check if this cog has received an ATN strobe, AtnFlag = -1 if ATN strobed or 0 if not strobed."],
    waitatn: ["WAITATN()", "Wait for this cog to receive an ATN strobe."],
  };

  private spinPinMethods: { [Identifier: string]: string[] } = {
    // key: [ signature, description ]
    pinw: ["PINW(PinField, Data) | PINWRITE(PinField, Data)", "Drive PinField pin(s) with Data."],
    pinwrite: ["PINW(PinField, Data) | PINWRITE(PinField, Data)", "Drive PinField pin(s) with Data."],
    pinr: ["PINR(PinField) : PinStates | PINREAD(PinField) : PinStates", "Read PinField pin(s)."],
    pinread: ["PINR(PinField) : PinStates | PINREAD(PinField) : PinStates", "Read PinField pin(s)."],
    pinl: ["PINL(PinField) | PINLOW(PinField)", "Drive PinField pin(s) low."],
    pinlow: ["PINL(PinField) | PINLOW(PinField)", "Drive PinField pin(s) low."],
    pinh: ["PINH(PinField) | PINHIGH(PinField)", "Drive PinField pin(s) high."],
    pinhigh: ["PINH(PinField) | PINHIGH(PinField)", "Drive PinField pin(s) high."],
    pint: ["PINT(PinField) | PINTOGGLE(PinField)", "Drive and toggle PinField pin(s)."],
    pintoggle: ["PINT(PinField) | PINTOGGLE(PinField)", "Drive and toggle PinField pin(s)."],
    pinf: ["PINF(PinField) | PINFLOAT(PinField)", "Float PinField pin(s)."],
    pinfloat: ["PINF(PinField) | PINFLOAT(PinField)", "Float PinField pin(s)."],
    pinstart: ["PINSTART(PinField, Mode, Xval, Yval)", "Start PinField smart pin(s): DIR=0, then WRPIN=Mode, WXPIN=Xval, WYPIN=Yval, then DIR=1."],
    pinclear: ["PINCLEAR(PinField)", "Clear PinField smart pin(s): DIR=0, then WRPIN=0."],
    wrpin: ["WRPIN(PinField, Data)", "Write 'mode' register(s) of PinField smart pin(s) with Data."],
    wxpin: ["WXPIN(PinField, Data)", "Write 'X' register(s) of PinField smart pin(s) with Data."],
    wypin: ["WYPIN(PinField, Data)", "Write 'Y' register(s) of PinField smart pin(s) with Data."],
    akpin: ["AKPIN(PinField)", "Acknowledge PinField smart pin(s)."],
    rdpin: ["RDPIN(Pin) : Zval", "Read Pin smart pin and acknowledge, Zval[31] = C flag from RDPIN, other bits are RDPIN data."],
    rqpin: ["RQPIN(Pin) : Zval", "Read Pin smart pin without acknowledge, Zval[31] = C flag from RQPIN, other bits are RQPIN data."],
  };

  private spinTimingMethods: { [Identifier: string]: string[] } = {
    getct: ["GETCT() : Count", "Get 32-bit system counter."],
    pollct: ["POLLCT(Tick) : Past", "Check if system counter has gone past 'Tick', returns -1 if past or 0 if not past."],
    waitct: ["WAITCT(Tick)", "Wait for system counter to get past 'Tick'."],
    waitus: ["WAITUS(Microseconds)", "Wait Microseconds, uses CLKFREQ, duration must not exceed $8000_0000 clocks."],
    waitms: ["WAITMS(Milliseconds)", "Wait Milliseconds, uses CLKFREQ, duration must not exceed $8000_0000 clocks."],
    getsec: ["GETSEC() : Seconds", "Get seconds since booting, uses 64-bit system counter and CLKFREQ, rolls over every 136 years."],
    getms: ["GETMS() : Milliseconds", "Get milliseconds since booting, uses 64-bit system counter and CLKFREQ, rolls over every 49.7 days."],
  };

  private pasmInterfaceMethods: { [Identifier: string]: string[] } = {
    call: ["CALL(RegisterOrHubAddr)", "CALL PASM code at Addr, PASM code should avoid registers $130..$1D7 and LUT."],
    regexec: ["REGEXEC(HubAddr)", "Load a self-defined chunk of PASM code at HubAddr into registers and CALL it. See REGEXEC description."],
    regload: ["REGLOAD(HubAddr)", "Load a self-defined chunk of PASM code or data at HubAddr into registers. See REGLOAD description."],
  };

  private spinMathMethods: { [Identifier: string]: string[] } = {
    rotxy: ["ROTXY(x, y, angle32bit) : rotx, roty", "Rotate (x,y) by angle32bit and return rotated (x,y)."],
    polxy: ["POLXY(length, angle32bit) : x, y", "Convert (length,angle32bit) to (x,y)."],
    xypol: ["XYPOL(x, y) : length, angle32bit", "Convert (x,y) to (length,angle32bit)."],
    qsin: ["QSIN(length, angle, twopi) : y", "Rotate (length,0) by (angle / twopi) * 2Pi and return y. Use 0 for twopi = $1_0000_0000. Twopi is unsigned."],
    qcos: ["QCOS(length, angle, twopi) : x", "Rotate (length,0) by (angle / twopi) * 2Pi and return x. Use 0 for twopi = $1_0000_0000. Twopi is unsigned."],
    muldiv64: ["MULDIV64(mult1,mult2,divisor) : quotient", "Divide the 64-bit product of 'mult1' and 'mult2' by 'divisor', return quotient (unsigned operation)."],
    getrnd: ["GETRND() : rnd", "Get random long (from xoroshiro128** PRNG, seeded on boot with thermal noise from ADC)."],
    nan: ["NAN(float) : NotANumber", "Determine if a floating-point value is not a number, returns true (-1) or false (0)."],
  };

  private spinMemoryMethods: { [Identifier: string]: string[] } = {
    getregs: ["GETREGS(HubAddr, CogAddr, Count)", "Move Count registers at CogAddr to longs at HubAddr."],
    setregs: ["SETREGS(HubAddr, CogAddr, Count)", "Move Count longs at HubAddr to registers at CogAddr."],
    bytemove: ["BYTEMOVE(Destination, Source, Count)", "Move Count bytes from Source to Destination."],
    wordmove: ["WORDMOVE(Destination, Source, Count)", "Move Count words from Source to Destination."],
    longmove: ["LONGMOVE(Destination, Source, Count)", "Move Count longs from Source to Destination."],
    bytefill: ["BYTEFILL(Destination, Value, Count)", "Fill Count bytes starting at Destination with Value."],
    wordfill: ["WORDFILL(Destination, Value, Count)", "Fill Count words starting at Destination with Value."],
    longfill: ["LONGFILL(Destination, Value, Count)", "Fill Count longs starting at Destination with Value."],
  };

  private spinStringMethods: { [Identifier: string]: string[] } = {
    strsize: ["STRSIZE(Addr) : Size", "Count bytes in zero-terminated string at Addr and return string size, not including the zero."],
    strcomp: ["STRCOMP(AddrA,AddrB) : Match", "Compare zero-terminated strings at AddrA and AddrB, return -1 if match or 0 if mismatch."],
    strcopy: [
      "STRCOPY(Destination, Source, Max)",
      "Copy a zero-terminated string of up to Max characters from Source to Destination. The copied string will occupy up to Max+1 bytes, including the zero terminator.",
    ],
    string: ['STRING("Text",13) : StringAddress', "Compose a zero-terminated string (quoted characters and values 1..255 allowed), return address of string."],
    getcrc: ["GETCRC(BytePtr, Poly, Count) : CRC", "Compute a CRC of Count bytes starting at BytePtr using a custom polynomial of up to 32 bits."],
  };

  private spinIndexValueMethods: { [Identifier: string]: string[] } = {
    lookup: ["LOOKUP(Index: v1, v2..v3, etc) : Value", "Lookup value (values and ranges allowed) using 1-based index, return value (0 if index out of range)."],
    lookupz: ["LOOKUPZ(Index: v1, v2..v3, etc) : Value", "Lookup value (values and ranges allowed) using 0-based index, return value (0 if index out of range)."],
    lookdown: ["LOOKDOWN(Value: v1, v2..v3, etc) : Index", "Determine 1-based index of matching value (values and ranges allowed), return index (0 if no match)."],
    lookdownz: ["LOOKDOWNZ(Value: v1, v2..v3, etc) : Index", "Determine 0-based index of matching value (values and ranges allowed), return index (0 if no match)."],
  };

  public isSpinBuiltinMethod(name: string): boolean {
    const nameKey: string = name.toLowerCase();
    let reservedStatus: boolean = nameKey in this.spinHubMethods;
    if (!reservedStatus) {
      reservedStatus = nameKey in this.spinPinMethods;
      if (!reservedStatus) {
        reservedStatus = nameKey in this.spinTimingMethods;
        if (!reservedStatus) {
          reservedStatus = nameKey in this.pasmInterfaceMethods;
          if (!reservedStatus) {
            reservedStatus = nameKey in this.spinMathMethods;
            if (!reservedStatus) {
              reservedStatus = nameKey in this.spinMemoryMethods;
              if (!reservedStatus) {
                reservedStatus = nameKey in this.spinStringMethods;
                if (!reservedStatus) {
                  reservedStatus = nameKey in this.spinIndexValueMethods;
                }
              }
            }
          }
        }
      }
    }
    return reservedStatus;
  }

  private _docTextForSpinBuiltInMethod(name: string): IBuiltinDescription {
    const nameKey: string = name.toLowerCase();
    let desiredDocText: IBuiltinDescription = { found: false, type: eBuiltInType.Unknown, category: "", description: "", signature: "" };
    if (this.isSpinBuiltinMethod(name)) {
      desiredDocText.found = true;
      let protoWDescr: string[] = [];
      if (nameKey in this.spinHubMethods) {
        desiredDocText.category = "Hub Method";
        protoWDescr = this.spinHubMethods[nameKey];
      } else if (nameKey in this.spinPinMethods) {
        desiredDocText.category = "Pin Method";
        protoWDescr = this.spinPinMethods[nameKey];
      } else if (nameKey in this.spinTimingMethods) {
        desiredDocText.category = "Timing Method";
        protoWDescr = this.spinTimingMethods[nameKey];
      } else if (nameKey in this.pasmInterfaceMethods) {
        desiredDocText.category = "Pasm Interface Method";
        protoWDescr = this.pasmInterfaceMethods[nameKey];
      } else if (nameKey in this.spinMathMethods) {
        desiredDocText.category = "Math Method";
        protoWDescr = this.spinMathMethods[nameKey];
      } else if (nameKey in this.spinMemoryMethods) {
        desiredDocText.category = "Memory Method";
        protoWDescr = this.spinMemoryMethods[nameKey];
      } else if (nameKey in this.spinStringMethods) {
        desiredDocText.category = "String Method";
        protoWDescr = this.spinStringMethods[nameKey];
      } else if (nameKey in this.spinIndexValueMethods) {
        desiredDocText.category = "Hub Method";
        protoWDescr = this.spinIndexValueMethods[nameKey];
      }
      if (protoWDescr.length != 0) {
        desiredDocText.signature = protoWDescr[0];
        desiredDocText.description = protoWDescr[1];
      }
    }
    return desiredDocText;
  }

  public isFlexspinPreprocessorDirective(name: string): boolean {
    const flexspinDirectiveOfNote: string[] = ["#define", "#ifdef", "#ifndef", "#else", "#elseifdef", "#elseifndef", "#endif", "#error", "#include", "#warn", "#undef"];
    const reservedStatus: boolean = flexspinDirectiveOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  public isFlexspinReservedWord(name: string): boolean {
    const flexspinReservedswordsOfNote: string[] = [
      "__propeller__",
      "__propeller2__",
      "__p2__",
      "__flexspin__",
      "__spincvt__",
      "__spin2pasm__",
      "__spin2cpp__",
      "__have_fcache__",
      "__cplusplus__",
      "__date__",
      "__file__",
      "__line__",
      "__time__",
      "__version__",
      "__debug__",
      "__output_asm__",
      "__output_bytecode__",
      "__output_c__",
      "__output_cpp__",
    ];
    const reservedStatus: boolean = flexspinReservedswordsOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  public isReservedPasmSymbols(name: string): boolean {
    const reservedPasmSymbolNames: string[] = ["org", "orgf", "orgh", "fit", "end"];
    const reservedStatus: boolean = reservedPasmSymbolNames.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  public isPasmReservedWord(name: string): boolean {
    const pasmReservedswordsOfNote: string[] = [
      "ijmp1",
      "ijmp2",
      "ijmp3",
      "iret1",
      "iret2",
      "iret3",
      "ptra",
      "ptrb",
      "addpins",
      "clkfreq_",
      "clkmode_",
      "pa",
      "pb",
      "clkfreq",
      "_clkfreq",
      "_rcfast",
      "_rcslow",
      "_xinfreq",
      "_xtlfreq",
      "round",
      "float",
      "trunc",
      "dira",
      "dirb",
      "ina",
      "inb",
      "outa",
      "outb",
      "fvar",
      "fvars",
      "addbits",
      "true",
      "false",
    ];
    const reservedStatus: boolean = pasmReservedswordsOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  public isPasmInstruction(name: string): boolean {
    const pasmInstructions: string[] = [
      "abs",
      "add",
      "addct1",
      "addct2",
      "addct3",
      "addpix",
      "adds",
      "addsx",
      "addx",
      "akpin",
      "allowi",
      "altb",
      "altd",
      "altgb",
      "altgn",
      "altgw",
      "alti",
      "altr",
      "alts",
      "altsb",
      "altsn",
      "altsw",
      "and",
      "andn",
      "asmclk",
      "augd",
      "augs",
      "bitc",
      "bith",
      "bitl",
      "bitnc",
      "bitnot",
      "bitnz",
      "bitrnd",
      "bitz",
      "blnpix",
      "bmask",
      "brk",
      "call",
      "calla",
      "callb",
      "calld",
      "callpa",
      "callpb",
      "cmp",
      "cmpm",
      "cmpr",
      "cmps",
      "cmpsub",
      "cmpsx",
      "cmpx",
      "cogatn",
      "cogbrk",
      "cogid",
      "coginit",
      "cogstop",
      "crcbit",
      "crcnib",
      "decmod",
      "decod",
      "dirc",
      "dirh",
      "dirl",
      "dirnc",
      "dirnot",
      "dirnz",
      "dirrnd",
      "dirz",
      "djf",
      "djnf",
      "djnz",
      "djz",
      "drvc",
      "drvh",
      "drvl",
      "drvnc",
      "drvnot",
      "drvnz",
      "drvrnd",
      "drvz",
      "encod",
      "execf",
      "fblock",
      "fge",
      "fges",
      "fle",
      "fles",
      "fltc",
      "flth",
      "fltl",
      "fltnc",
      "fltnot",
      "fltnz",
      "fltrnd",
      "fltz",
      "getbrk",
      "getbyte",
      "getbyte",
      "getct",
      "getnib",
      "getptr",
      "getqx",
      "getqy",
      "getrnd",
      "getrnd",
      "getscp",
      "getword",
      "getword",
      "getxacc",
      "hubset",
      "ijnz",
      "ijz",
      "incmod",
      "jatn",
      "jct1",
      "jct2",
      "jct3",
      "jfbw",
      "jint",
      "jmp",
      "jmprel",
      "jnatn",
      "jnct1",
      "jnct2",
      "jnct3",
      "jnfbw",
      "jnint",
      "jnpat",
      "jnqmt",
      "jnse1",
      "jnse2",
      "jnse3",
      "jnse4",
      "jnxfi",
      "jnxmt",
      "jnxrl",
      "jnxro",
      "jpat",
      "jqmt",
      "jse1",
      "jse2",
      "jse3",
      "jse4",
      "jxfi",
      "jxmt",
      "jxrl",
      "jxro",
      "loc",
      "locknew",
      "lockrel",
      "lockret",
      "locktry",
      "mergeb",
      "mergew",
      "mixpix",
      "modc",
      "modcz",
      "modz",
      "mov",
      "movbyts",
      "mul",
      "mulpix",
      "muls",
      "muxc",
      "muxnc",
      "muxnibs",
      "muxnits",
      "muxnz",
      "muxq",
      "muxz",
      "neg",
      "negc",
      "negnc",
      "negnz",
      "negz",
      "nixint1",
      "nixint2",
      "nixint3",
      "nop",
      "not",
      "ones",
      "or",
      "outc",
      "outh",
      "outl",
      "outnc",
      "outnot",
      "outnz",
      "outrnd",
      "outz",
      "pollatn",
      "pollct1",
      "pollct2",
      "pollct3",
      "pollfbw",
      "pollint",
      "pollpat",
      "pollqmt",
      "pollse1",
      "pollse2",
      "pollse3",
      "pollse4",
      "pollxfi",
      "pollxmt",
      "pollxrl",
      "pollxro",
      "pop",
      "popa",
      "popb",
      "push",
      "pusha",
      "pushb",
      "qdiv",
      "qexp",
      "qfrac",
      "qlog",
      "qmul",
      "qrotate",
      "qsqrt",
      "qvector",
      "rcl",
      "rcr",
      "rczl",
      "rczr",
      "rdbyte",
      "rdfast",
      "rdlong",
      "rdlut",
      "rdpin",
      "rdword",
      "rep",
      "resi0",
      "resi1",
      "resi2",
      "resi3",
      "ret",
      "reta",
      "retb",
      "reti0",
      "reti1",
      "reti2",
      "reti3",
      "rev",
      "rfbyte",
      "rflong",
      "rfvar",
      "rfvars",
      "rfword",
      "rgbexp",
      "rgbsqz",
      "rol",
      "rolbyte",
      "rolbyte",
      "rolnib",
      "rolword",
      "rolword",
      "ror",
      "rqpin",
      "sal",
      "sar",
      "sca",
      "scas",
      "setbyte",
      "setcfrq",
      "setci",
      "setcmod",
      "setcq",
      "setcy",
      "setd",
      "setdacs",
      "setint1",
      "setint2",
      "setint3",
      "setluts",
      "setnib",
      "setpat",
      "setpiv",
      "setpix",
      "setq",
      "setq2",
      "setr",
      "sets",
      "setscp",
      "setse1",
      "setse2",
      "setse3",
      "setse4",
      "setword",
      "setxfrq",
      "seussf",
      "seussr",
      "shl",
      "shr",
      "signx",
      "skip",
      "skipf",
      "splitb",
      "splitw",
      "stalli",
      "sub",
      "subr",
      "subs",
      "subsx",
      "subx",
      "sumc",
      "sumnc",
      "sumnz",
      "sumz",
      "test",
      "testb",
      "testbn",
      "testn",
      "testp",
      "testpn",
      "tjf",
      "tjnf",
      "tjns",
      "tjnz",
      "tjs",
      "tjv",
      "tjz",
      "trgint1",
      "trgint2",
      "trgint3",
      "waitatn",
      "waitct1",
      "waitct2",
      "waitct3",
      "waitfbw",
      "waitint",
      "waitpat",
      "waitse1",
      "waitse2",
      "waitse3",
      "waitse4",
      "waitx",
      "waitxfi",
      "waitxmt",
      "waitxrl",
      "waitxro",
      "wfbyte",
      "wflong",
      "wfword",
      "wmlong",
      "wrbyte",
      "wrc",
      "wrfast",
      "wrlong",
      "wrlut",
      "wrnc",
      "wrnz",
      "wrpin",
      "wrword",
      "wrz",
      "wxpin",
      "wypin",
      "xcont",
      "xinit",
      "xor",
      "xoro32",
      "xstop",
      "xzero",
      "zerox",
    ];
    const instructionStatus: boolean = pasmInstructions.indexOf(name.toLowerCase()) != -1;
    return instructionStatus;
  }

  public isPasm1Instruction(name: string): boolean {
    // mark these RED if seen in P2 code
    const pasm1Instructions: string[] = [
      "absneg",
      "addabs",
      "clkset",
      "hubop",
      "jmpret",
      "lockclr",
      "lockset",
      "max",
      "maxs",
      "min",
      "mins",
      "movd",
      "movi",
      "movs",
      "subabs",
      "waitcnt",
      "waitpeq",
      "waitpne",
      "waitvid",
    ];
    const instructionStatus: boolean = pasm1Instructions.indexOf(name.toLowerCase()) != -1;
    return instructionStatus;
  }

  public isPasm1Variable(name: string): boolean {
    // mark these RED if seen in P2 code
    const pasm1Variables: string[] = [
      "_clkmode",
      "_free",
      "_stack",
      "cnt",
      "xtal1",
      "xtal2",
      "xtal3",
      "rcfast",
      "rcslow",
      "pll1x",
      "pll2x",
      "pll4x",
      "pll8x",
      "pll16x",
      "ctra",
      "ctrb",
      "frqa",
      "frqb",
      "phsa",
      "phsb",
      "vcfg",
      "vscl",
      "par",
      "spr",
    ];
    const instructionStatus: boolean = pasm1Variables.indexOf(name.toLowerCase()) != -1;
    return instructionStatus;
  }

  public isPasmNonArgumentInstruction(name: string): boolean {
    const pasmNonArgumentInstructions: string[] = [
      "nop",
      "resi3",
      "resi2",
      "resi1",
      "resi0",
      "reti3",
      "reti2",
      "reti1",
      "reti0",
      "xstop",
      "allowi",
      "stalli",
      "trgint1",
      "trgint2",
      "trgint3",
      "nixint1",
      "nixint2",
      "nixint3",
      "ret",
      "reta",
      "retb",
      "pollint",
      "pollct1",
      "pollct2",
      "pollct3",
      "pollse1",
      "pollse2",
      "pollse3",
      "pollse4",
      "pollpat",
      "pollfbw",
      "pollxmt",
      "pollxfi",
      "pollxro",
      "pollxrl",
      "pollatn",
      "pollqmt",
      "waitint",
      "waitct1",
      "waitct2",
      "waitct3",
      "waitse1",
      "waitse2",
      "waitse3",
      "waitse4",
      "waitpat",
      "waitfbw",
      "waitxmt",
      "waitxfi",
      "waitxro",
      "waitxrl",
      "waitatn",
    ];
    const instructionStatus: boolean = pasmNonArgumentInstructions.indexOf(name.toLowerCase()) != -1;
    return instructionStatus;
  }

  public isIllegalInlinePasmDirective(name: string): boolean {
    const illegalInlinePasmDirective: string[] = ["alignw", "alignl", "file", "orgh"];
    const illegalStatus: boolean = illegalInlinePasmDirective.indexOf(name.toLowerCase()) != -1;
    return illegalStatus;
  }

  public isPasm1Conditional(name: string): boolean {
    let returnStatus: boolean = false;
    if (name.length >= 2) {
      const checkType: string = name.toUpperCase();
      if (checkType == "NR" || checkType == "WR" || checkType == "IF_ALWAYS" || checkType == "IF_NEVER") {
        returnStatus = true;
      }
    }
    return returnStatus;
  }

  public isPasmConditional(name: string): boolean {
    let returnStatus: boolean = false;
    if (name.length >= 2) {
      const checkType: string = name.toUpperCase();
      if (
        checkType == "WC" ||
        checkType == "WZ" ||
        checkType == "WCZ" ||
        checkType == "XORC" ||
        checkType == "XORZ" ||
        checkType == "ORC" ||
        checkType == "ORZ" ||
        checkType == "ANDC" ||
        checkType == "ANDZ"
      ) {
        returnStatus = true;
      }
    }
    return returnStatus;
  }

  public isDatOrPasmLabel(name: string): boolean {
    let haveLabelStatus: boolean = name.substr(0, 1).match(/[a-zA-Z_\.\:]/) ? true : false;
    if (haveLabelStatus) {
      if (this.isDatNFileStorageType(name)) {
        haveLabelStatus = false;
      } else if (name.toUpperCase() == "DAT") {
        haveLabelStatus = false;
      } else if (this.isReservedPasmSymbols(name)) {
        haveLabelStatus = false;
      } else if (name.toUpperCase().startsWith("IF_") || name.toUpperCase() == "_RET_") {
        haveLabelStatus = false;
      } else if (this.isPasmConditional(name)) {
        haveLabelStatus = false;
      } else if (this.isIllegalInlinePasmDirective(name)) {
        haveLabelStatus = false;
      } else if (this.isPasmInstruction(name)) {
        haveLabelStatus = false;
      } else if (this.isPasm1Conditional(name)) {
        haveLabelStatus = false;
      } else if (this.isPasm1Instruction(name)) {
        haveLabelStatus = false;
      } else if (this.isPasmNonArgumentInstruction(name)) {
        haveLabelStatus = false;
      }
    }
    return haveLabelStatus;
  }

  public isDatNFileStorageType(name: string): boolean {
    // storage type + RES + FILE
    let returnStatus: boolean = false;
    if (name.length > 2) {
      const checkType: string = name.toUpperCase();
      // yeah, FILE too!  (oddly enough)
      if (checkType == "FILE") {
        returnStatus = true;
      } else {
        returnStatus = this.isDatStorageType(name);
      }
    }
    return returnStatus;
  }

  public isDatStorageType(name: string): boolean {
    // storage type + RES
    let returnStatus: boolean = false;
    if (name.length > 2) {
      const checkType: string = name.toUpperCase();
      if (checkType == "RES") {
        returnStatus = true;
      } else {
        returnStatus = this.isStorageType(name);
      }
    }
    return returnStatus;
  }

  public isStorageType(name: string): boolean {
    // storage type : (BYTE|WORD)FIT, BYTE, WORD, LONG
    let returnStatus: boolean = false;
    if (name.length > 3) {
      const checkType: string = name.toUpperCase();
      if (checkType == "BYTEFIT" || checkType == "WORDFIT" || checkType == "BYTE" || checkType == "WORD" || checkType == "LONG") {
        returnStatus = true;
      }
    }
    return returnStatus;
  }

  public isAlignType(name: string): boolean {
    // align type : ALIGNL, ALIGNW
    let returnStatus: boolean = false;
    if (name.length > 5) {
      const checkType: string = name.toUpperCase();
      if (checkType == "ALIGNL" || checkType == "ALIGNW") {
        returnStatus = true;
      }
    }
    return returnStatus;
  }

  private _tableSpinStorageTypes: { [Identifier: string]: string } = {
    byte: "8-bit storage",
    word: "16-bit storage",
    long: "32-bit storage",
    bytefit: "like BYTE for use in DAT sections, but verifies BYTE data are -$80 to $FF.",
    wordfit: "like WORD for use in DAT sections, but verifies word data are -$8000 to $FFFF.",
  };

  private _tableSpinStorageSpecials: { [Identifier: string]: string[] } = {
    res: ["RES n", "reserve n register(s), advance cog address by n, don't advance hub address"],
    file: ['FileDat  FILE "Filename"', 'include binary file, "FileDat" is a BYTE symbol that points to file'],
  };

  private _tableSpinAlignment: { [Identifier: string]: string } = {
    alignw: "word-align to hub memory, advances variable pointer as necessary",
    alignl: "long-align to hub memory, advances variable pointer as necessary",
  };

  private _docTextForSpinStorageTypesAlignment(name: string): IBuiltinDescription {
    const nameKey: string = name.toLowerCase();
    let desiredDocText: IBuiltinDescription = { found: false, type: eBuiltInType.Unknown, category: "", description: "", signature: "" };
    if (nameKey in this._tableSpinStorageTypes) {
      desiredDocText.found = true;
      desiredDocText.category = "Storage Types";
      desiredDocText.description = this._tableSpinStorageTypes[nameKey];
    } else if (nameKey in this._tableSpinAlignment) {
      desiredDocText.found = true;
      desiredDocText.category = "DAT Alignment";
      desiredDocText.description = this._tableSpinAlignment[nameKey];
    } else if (nameKey in this._tableSpinStorageSpecials) {
      desiredDocText.found = true;
      desiredDocText.category = "DAT Special";
      const protoWDescr: string[] = this._tableSpinStorageSpecials[nameKey];
      desiredDocText.signature = protoWDescr[0];
      desiredDocText.description = protoWDescr[1];
    }
    return desiredDocText;
  }

  // ---------------- new debug() support ----------------
  //  updated: 26 Mar 2022  - (as of Spin2 v35s)
  //  debug() statements for special displays support the following
  //    plot      - General-purpose plotter with cartesian and polar modes
  //    term      - Text terminal with up to 300 x 200 characters, 6..200 point font size, 4 simultaneous color schemes
  //    midi      - Piano keyboard with 1..128 keys, velocity depiction, variable screen scale
  //    logic     - PDM, Logic analyzer with single and multi-bit labels, 1..32 channels, can trigger on pattern
  //    scope     - PDM, Oscilloscope with 1..8 channels, can trigger on level with hysteresis
  //    scope_xy  - PDM, XY oscilloscope with 1..8 channels, persistence of 0..512 samples, polar mode, log scale mode
  //    fft       - PDM, Fast Fourier Transform with 1..8 channels, 4..2048 points, windowed results, log scale mode
  //    spectro   - PDM, Spectrograph with 4..2048-point FFT, windowed results, phase-coloring, and log scale mode
  //    bitmap    - PDM, Bitmap, 1..2048 x 1..2048 pixels, 1/2/4/8/16/32-bit pixels with 19 color systems, 15 direction/autoscroll modes, independent X and Y pixel size of 1..256
  // ----------------------------------------------------
  private _tableDebugDisplayTypes: { [Identifier: string]: string } = {
    plot: "General-purpose plotter with cartesian and polar modes",
    term: "Text terminal with up to 300 x 200 characters, 6..200 point font size, 4 simultaneous color schemes",
    midi: "Piano keyboard with 1..128 keys, velocity depiction, variable screen scale",
    logic: "PDM, Logic analyzer with single and multi-bit labels, 1..32 channels, can trigger on pattern",
    scope: "PDM, Oscilloscope with 1..8 channels, can trigger on level with hysteresis",
    scope_xy: "PDM, XY oscilloscope with 1..8 channels, persistence of 0..512 samples, polar mode, log scale mode",
    fft: "PDM, Fast Fourier Transform with 1..8 channels, 4..2048 points, windowed results, log scale mode",
    spectro: "PDM, Spectrograph with 4..2048-point FFT, windowed results, phase-coloring, and log scale mode",
    bitmap: "PDM, Bitmap, 1..2048 x 1..2048 pixels, 1/2/4/8/16/32-bit pixels with 19 color systems, 15 direction/autoscroll modes, independent X and Y pixel size of 1..256",
  };

  public isDebugDisplayType(name: string): boolean {
    const nameKey: string = name.toLowerCase();
    const bDisplayTypeStatus: boolean = nameKey in this._tableDebugDisplayTypes;
    return bDisplayTypeStatus;
  }

  private _docTextForSpinBuiltInDebugDisplayType(name: string): IBuiltinDescription {
    const nameKey: string = name.toLowerCase();
    let desiredDocText: IBuiltinDescription = { found: false, type: eBuiltInType.Unknown, category: "", description: "", signature: "" };
    if (nameKey in this._tableDebugDisplayTypes) {
      desiredDocText.found = true;
      desiredDocText.category = "Debug Display-type";
      desiredDocText.description = this._tableDebugDisplayTypes[nameKey];
    }
    return desiredDocText;
  }

  public isNameWithTypeInstantiation(newParameter: string, displayType: eDebugDisplayType): boolean {
    var nameStatus: boolean = false;
    const bHasPackedData: boolean = this.debugTypeHasPackedData(displayType);
    const bHasColorMode: boolean = this.debugTypeHasColorMode(displayType);
    switch (displayType) {
      case eDebugDisplayType.ddtTerm:
        nameStatus = this.isDebugTermDeclarationParam(newParameter);
        break;
      case eDebugDisplayType.ddtScope:
        nameStatus = this.isDebugScopeDeclarationParam(newParameter);
        break;
      case eDebugDisplayType.ddtScopeXY:
        nameStatus = this.isDebugScopeXYDeclarationParam(newParameter);
        break;
      case eDebugDisplayType.ddtLogic:
        nameStatus = this.isDebugLogicDeclarationParam(newParameter);
        break;
      case eDebugDisplayType.ddtFFT:
        nameStatus = this.isDebugFFTDeclarationParam(newParameter);
        break;
      case eDebugDisplayType.ddtSpectro:
        nameStatus = this.isDebugSpectroDeclarationParam(newParameter);
        // SPECTRO-Instantiation supports a special color mode, check it too
        if (nameStatus == false) {
          nameStatus = this.isDebugSpectroColorMode(newParameter);
        }
        break;
      case eDebugDisplayType.ddtPlot:
        nameStatus = this.isDebugPlotDeclarationParam(newParameter);
        break;
      case eDebugDisplayType.ddtBitmap:
        nameStatus = this.isDebugBitmapDeclarationParam(newParameter);
        break;
      case eDebugDisplayType.ddtMidi:
        nameStatus = this.isDebugMidiDeclarationParam(newParameter);
        break;
      default:
        break;
    }
    // if we don't have a match yet then check packed data
    if (nameStatus == false && bHasPackedData) {
      nameStatus = this.isDebugPackedDataType(newParameter);
    }
    if (nameStatus == false && bHasColorMode) {
      nameStatus = this.isDebugBitmapColorMode(newParameter);
    }
    return nameStatus;
  }

  public isNameWithTypeFeed(newParameter: string, displayType: eDebugDisplayType): boolean {
    var nameStatus: boolean = false;
    const bHasColorMode: boolean = this.debugTypeHasColorMode(displayType);
    switch (displayType) {
      case eDebugDisplayType.ddtTerm:
        nameStatus = this.isDebugTermFeedParam(newParameter);
        break;
      case eDebugDisplayType.ddtScope:
        nameStatus = this.isDebugScopeFeedParam(newParameter);
        break;
      case eDebugDisplayType.ddtScopeXY:
        nameStatus = this.isDebugScopeXYFeedParam(newParameter);
        break;
      case eDebugDisplayType.ddtLogic:
        nameStatus = this.isDebugLogicFeedParam(newParameter);
        break;
      case eDebugDisplayType.ddtFFT:
        nameStatus = this.isDebugFFTFeedParam(newParameter);
        break;
      case eDebugDisplayType.ddtSpectro:
        nameStatus = this.isDebugSpectroFeedParam(newParameter);
        break;
      case eDebugDisplayType.ddtPlot:
        nameStatus = this.isDebugPlotFeedParam(newParameter);
        break;
      case eDebugDisplayType.ddtBitmap:
        nameStatus = this.isDebugBitmapFeedParam(newParameter);
        break;
      case eDebugDisplayType.ddtMidi:
        nameStatus = this.isDebugMidiFeedParam(newParameter);
        break;
      default:
        break;
    }
    // if we don't have a match yet then check color mode
    if (nameStatus == false && bHasColorMode) {
      nameStatus = this.isDebugBitmapColorMode(newParameter);
    }
    //this.logDEBUG("  -- _isNameWithTypeFeed(" + newParameter + ", " + displayType + ") = " + nameStatus);
    return nameStatus;
  }

  // each type has decl and feed parameter-name check methods
  // Debug Display: TERM declaration
  public isDebugTermDeclarationParam(name: string): boolean {
    const debugTermDeclTypes: string[] = ["title", "pos", "size", "textsize", "color", "backcolor", "update", "hidexy"];
    const bTermDeclParamStatus: boolean = debugTermDeclTypes.indexOf(name.toLowerCase()) != -1;
    return bTermDeclParamStatus;
  }

  // Debug Display: TERM feed
  public isDebugTermFeedParam(name: string): boolean {
    const debugTermFeedTypes: string[] = ["clear", "update", "save", "close"];
    const bTermFeedParamStatus: boolean = debugTermFeedTypes.indexOf(name.toLowerCase()) != -1;
    return bTermFeedParamStatus;
  }

  // Debug Display: SCOPE declaration
  public isDebugScopeDeclarationParam(name: string): boolean {
    const debugScopeDeclTypes: string[] = ["title", "pos", "size", "samples", "rate", "dotsize", "linesize", "textsize", "color", "hidexy"];
    const bScopeDeclParamStatus: boolean = debugScopeDeclTypes.indexOf(name.toLowerCase()) != -1;
    return bScopeDeclParamStatus;
  }

  // Debug Display: SCOPE feed
  public isDebugScopeFeedParam(name: string): boolean {
    const debugScopeFeedTypes: string[] = ["trigger", "holdoff", "samples", "clear", "save", "window", "close"];
    const bScopeFeedParamStatus: boolean = debugScopeFeedTypes.indexOf(name.toLowerCase()) != -1;
    return bScopeFeedParamStatus;
  }

  // Debug Display: SCOPE_XY declaration
  public isDebugScopeXYDeclarationParam(name: string): boolean {
    const debugScopeXYDeclTypes: string[] = ["title", "pos", "size", "range", "samples", "rate", "dotsize", "textsize", "color", "polar", "logscale", "hidexy"];
    const bScopeXYDeclParamStatus: boolean = debugScopeXYDeclTypes.indexOf(name.toLowerCase()) != -1;
    return bScopeXYDeclParamStatus;
  }

  // Debug Display: SCOPE_XY feed
  public isDebugScopeXYFeedParam(name: string): boolean {
    const debugScopeXYFeedTypes: string[] = ["clear", "save", "window", "close"];
    const bScopeXYFeedParamStatus: boolean = debugScopeXYFeedTypes.indexOf(name.toLowerCase()) != -1;
    return bScopeXYFeedParamStatus;
  }

  // Debug Display: LOGIC declaration
  public isDebugLogicDeclarationParam(name: string): boolean {
    const debugLogicDeclTypes: string[] = ["title", "pos", "samples", "spacing", "rate", "linesize", "textsize", "color", "hidexy"];
    const bLogicDeclParamStatus: boolean = debugLogicDeclTypes.indexOf(name.toLowerCase()) != -1;
    return bLogicDeclParamStatus;
  }

  // Debug Display: LOGIC feed
  public isDebugLogicFeedParam(name: string): boolean {
    const debugLogicFeedTypes: string[] = ["trigger", "holdoff", "clear", "save", "window", "close"];
    const bLogicFeedParamStatus: boolean = debugLogicFeedTypes.indexOf(name.toLowerCase()) != -1;
    return bLogicFeedParamStatus;
  }

  // Debug Display: FFT declaration
  public isDebugFFTDeclarationParam(name: string): boolean {
    const debugFFTDeclTypes: string[] = ["title", "pos", "size", "samples", "rate", "dotsize", "linesize", "textsize", "color", "logscale", "hidexy"];
    const bFFTDeclParamStatus: boolean = debugFFTDeclTypes.indexOf(name.toLowerCase()) != -1;
    return bFFTDeclParamStatus;
  }

  // Debug Display: FFT feed
  public isDebugFFTFeedParam(name: string): boolean {
    const debugFFTFeedTypes: string[] = ["clear", "save", "window", "close"];
    const bFFTFeedParamStatus: boolean = debugFFTFeedTypes.indexOf(name.toLowerCase()) != -1;
    return bFFTFeedParamStatus;
  }

  // Debug Display: SPECTRO declaration
  public isDebugSpectroDeclarationParam(name: string): boolean {
    const debugSpectroDeclTypes: string[] = ["title", "pos", "samples", "depth", "mag", "range", "rate", "trace", "dotsize", "logscale", "hidexy"];
    const bSpectroDeclParamStatus: boolean = debugSpectroDeclTypes.indexOf(name.toLowerCase()) != -1;
    return bSpectroDeclParamStatus;
  }

  // Debug Display: SPECTRO feed
  public isDebugSpectroFeedParam(name: string): boolean {
    const debugSpectroFeedTypes: string[] = ["clear", "save", "window", "close"];
    const bSpectroFeedParamStatus: boolean = debugSpectroFeedTypes.indexOf(name.toLowerCase()) != -1;
    return bSpectroFeedParamStatus;
  }

  // Debug Display: PLOT declaration
  public isDebugPlotDeclarationParam(name: string): boolean {
    const debugPlotDeclTypes: string[] = ["title", "pos", "size", "dotsize", "lutcolors", "backcolor", "update", "hidexy"];
    const bPlotDeclParamStatus: boolean = debugPlotDeclTypes.indexOf(name.toLowerCase()) != -1;
    return bPlotDeclParamStatus;
  }

  // Debug Display: PLOT feed
  public isDebugPlotFeedParam(name: string): boolean {
    const debugPlotFeedTypes: string[] = [
      "lutcolors",
      "backcolor",
      "color",
      "opacity",
      "precise",
      "linesize",
      "origin",
      "set",
      "dot",
      "line",
      "circle",
      "oval",
      "box",
      "obox",
      "textsize",
      "textstyle",
      "textangle",
      "text",
      "spritedef",
      "sprite",
      "polar",
      "cartesian",
      "update",
      "clear",
      "save",
      "window",
      "close",
    ];
    const bPlotFeedParamStatus: boolean = debugPlotFeedTypes.indexOf(name.toLowerCase()) != -1;
    return bPlotFeedParamStatus;
  }

  // Debug Display: BITMAP declaration
  public isDebugBitmapDeclarationParam(name: string): boolean {
    const debugBitmapDeclTypes: string[] = ["title", "pos", "size", "dotsize", "lutcolors", "trace", "rate", "update", "hidexy", "sparse"];
    const bBitmapDeclParamStatus: boolean = debugBitmapDeclTypes.indexOf(name.toLowerCase()) != -1;
    return bBitmapDeclParamStatus;
  }

  // Debug Display: BITMAP feed
  public isDebugBitmapFeedParam(name: string): boolean {
    const debugBitmapFeedTypes: string[] = ["lutcolors", "trace", "rate", "set", "scroll", "clear", "update", "save", "window", "close"];
    const bBitmapFeedParamStatus: boolean = debugBitmapFeedTypes.indexOf(name.toLowerCase()) != -1;
    return bBitmapFeedParamStatus;
  }

  // Debug Display: MIDI declaration
  public isDebugMidiDeclarationParam(name: string): boolean {
    const debugMidiDeclTypes: string[] = ["title", "pos", "size", "range", "channel", "color"];
    const bMidiDeclParamStatus: boolean = debugMidiDeclTypes.indexOf(name.toLowerCase()) != -1;
    return bMidiDeclParamStatus;
  }

  // Debug Display: MIDI feed
  public isDebugMidiFeedParam(name: string): boolean {
    const debugMidiFeedTypes: string[] = ["clear", "save", "window", "close"];
    const bMidiFeedParamStatus: boolean = debugMidiFeedTypes.indexOf(name.toLowerCase()) != -1;
    return bMidiFeedParamStatus;
  }

  public debugTypeHasPackedData(displayType: eDebugDisplayType): boolean {
    // return indication if displayType has Packed Data Mode
    let bHasPackedData: boolean = true;
    switch (displayType) {
      case eDebugDisplayType.ddtTerm:
        bHasPackedData = false;
        break;
      case eDebugDisplayType.ddtPlot:
        bHasPackedData = false;
        break;
      case eDebugDisplayType.ddtMidi:
        bHasPackedData = false;
        break;
      default:
        break;
    }
    return bHasPackedData;
  }

  public debugTypeHasColorMode(displayType: eDebugDisplayType): boolean {
    // return indication if displayType has lut1_to_rgb24 Color Mode
    let bHasColorMode: boolean = false;
    switch (displayType) {
      case eDebugDisplayType.ddtBitmap:
        bHasColorMode = true;
        break;
      case eDebugDisplayType.ddtPlot:
        bHasColorMode = true;
        break;
      default:
        break;
    }
    return bHasColorMode;
  }

  // color names for use in debug()
  //   BLACK / WHITE or ORANGE / BLUE / GREEN / CYAN / RED / MAGENTA / YELLOW / GREY|GRAY
  public isDebugColorName(name: string): boolean {
    const debugColorNames: string[] = ["black", "white", "orange", "blue", "green", "cyan", "red", "magenta", "yellow", "grey", "gray"];
    const bColorNameStatus: boolean = debugColorNames.indexOf(name.toLowerCase()) != -1;
    return bColorNameStatus;
  }

  // packed data forms for use in debug()
  public isDebugPackedDataType(name: string): boolean {
    const debugPackedDataTypes: string[] = [
      "longs_1bit",
      "longs_2bit",
      "longs_4bit",
      "longs_8bit",
      "longs_16bit",
      "words_1bit",
      "words_2bit",
      "words_4bit",
      "words_8bit",
      "bytes_1bit",
      "bytes_2bit",
      "bytes_4bit",
      // optional operators
      "alt",
      "signed",
    ];
    const bPackedDataTypeStatus: boolean = debugPackedDataTypes.indexOf(name.toLowerCase()) != -1;
    return bPackedDataTypeStatus;
  }

  //  Bitmap Color Modes
  public isDebugBitmapColorMode(name: string): boolean {
    const debugBitmapColorModes: string[] = [
      "lut1",
      "lut2",
      "lut4",
      "lut8",
      "luma8",
      "luma8w",
      "luma8x",
      "hsv8",
      "hsv8w",
      "hsv8x",
      "rgbi8",
      "rgbi8w",
      "rgbi8x",
      "rgb8",
      "rgb16",
      "rgb24",
      "hsv16",
      "hsv16w",
      "hsv16x",
    ];
    const bBitmapColorModeStatus: boolean = debugBitmapColorModes.indexOf(name.toLowerCase()) != -1;
    return bBitmapColorModeStatus;
  }

  //  Spectro reduced-set Color Modes
  public isDebugSpectroColorMode(name: string): boolean {
    const debugSpectropColorModes: string[] = ["luma8", "luma8w", "luma8x", "hsv16", "hsv16w", "hsv16x"];
    const bSpectroColorModeStatus: boolean = debugSpectropColorModes.indexOf(name.toLowerCase()) != -1;
    return bSpectroColorModeStatus;
  }
}
