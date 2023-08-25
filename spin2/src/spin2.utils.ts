"use strict";
// src/spin2.utils.ts

export enum eParseState {
  Unknown = 0,
  inCon,
  inDat,
  inObj,
  inPub,
  inPri,
  inVar,
  inPAsmInline,
  inDatPAsm,
  inMultiLineComment,
  inMultiLineDocComment,
  inNothing,
}

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
  BIT_METHOD_POINTER,
  BIT_SYMBOL,
  BIT_CONSTANT,
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
  parameters?: string[];
  returns?: string[];
}

export const displayEnumByTypeName = new Map<string, eDebugDisplayType>([
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

// this is how we decribe our methods with parameters in our tables...
type TMethodTuple = readonly [signature: string, description: string, parameters: string[], returns?: string[] | undefined];

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
    let lineParts: string[] | null = nonSglStringLine.match(/[^ ,@\[\]\=\+\-\*\/\:\#\<\>\|\^\&\t\(\)\!\?\~]+/g);
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

  public getNonWhitePAsmLineParts(line: string): string[] {
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

  public getNonWhiteNOperatorLineParts(line: string): string[] {
    let lineParts: string[] | null = line.match(/[^ \t\-\+\<\>]+/g);
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
  private _tableSpinHubLocations: { [Identifier: string]: string } = {
    clkmode: "Clock mode value",
    clkfreq: "Clock frequency value",
  };

  private _tableSpinHubVariables: { [Identifier: string]: string } = {
    varbase: "Object base pointer, @VARBASE is VAR base, used by method-pointer calls",
  };

  private _tableSpinCogRegisters: { [Identifier: string]: string } = {
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
      if (nameKey in this._tableSpinHubLocations) {
        desiredDocText.category = "Hub Location";
        desiredDocText.description = this._tableSpinHubLocations[nameKey];
      } else if (nameKey in this._tableSpinHubVariables) {
        desiredDocText.category = "Hub Variable";
        desiredDocText.description = this._tableSpinHubVariables[nameKey];
      } else if (nameKey in this._tableSpinCogRegisters) {
        desiredDocText.category = "Cog Register";
        desiredDocText.description = this._tableSpinCogRegisters[nameKey];
      }
    }
    return desiredDocText;
  }

  public isSpinBuiltInVariable(name: string): boolean {
    const nameKey: string = name.toLowerCase();
    let reservedStatus: boolean = nameKey in this._tableSpinHubLocations;
    if (!reservedStatus) {
      reservedStatus = nameKey in this._tableSpinHubVariables;
    }
    if (!reservedStatus) {
      reservedStatus = nameKey in this._tableSpinCogRegisters;
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

  private _tableSpinPAsmLangParts: { [Identifier: string]: string[] } = {
    // DAT cogexec
    org: ["ORG", "begin a cog-exec program (no symbol allowed before ORG), <br>or Start block of inline-pasm code within SPIN (ends with END)"],
    orgf: ["ORGF [value]", "fill to cog address {value} with zeros (no symbol allowed before ORGF)"],
    orgh: ["ORGH [originValue[,limitValue]]", "begin a hub-exec program (no symbol allowed before ORGH) (Default origin=$00400, limit=$100000)"],
    end: ["END", "Ends block of inline-pasm code (started with ORG)"],
    fit: ["FIT [value]", "test to make sure hub/cog address has not exceeded {value}"],
  };

  private _docTextForSpinBuiltInLanguagePart(name: string): IBuiltinDescription {
    const nameKey: string = name.toLowerCase();
    let desiredDocText: IBuiltinDescription = { found: false, type: eBuiltInType.Unknown, category: "", description: "", signature: "" };
    if (nameKey in this._tableSpinBlockNames) {
      desiredDocText.category = "Block Name";
      desiredDocText.description = this._tableSpinBlockNames[nameKey];
    } else if (nameKey in this._tableSpinFloatConversions) {
      desiredDocText.category = "Float Conversions";
      let methodDescr: TMethodTuple = this._tableSpinFloatConversions[nameKey];
      desiredDocText.signature = methodDescr[0];
      desiredDocText.description = methodDescr[1];
      if (methodDescr[2] && methodDescr[2].length > 0) {
        desiredDocText.parameters = methodDescr[2];
      }
      if (methodDescr[3] && methodDescr[3].length > 0) {
        desiredDocText.returns = methodDescr[3];
      }
    } else if (nameKey in this._tableSpinBinaryOperators) {
      desiredDocText.category = "Binary Operators";
      desiredDocText.description = this._tableSpinBinaryOperators[nameKey];
    } else if (nameKey in this._tableSpinUnaryOperators) {
      desiredDocText.category = "Unary Operators";
      desiredDocText.description = this._tableSpinUnaryOperators[nameKey];
    } else if (nameKey in this._tableSmartPinNames) {
      desiredDocText.category = "Smart Pin Configuration";
      desiredDocText.description = this._tableSmartPinNames[nameKey];
    } else if (nameKey in this._tableEventNames) {
      desiredDocText.category = "Event / Interrupt Source";
      desiredDocText.description = this._tableEventNames[nameKey];
    } else if (nameKey in this._tableSpinPAsmLangParts) {
      desiredDocText.category = "DAT HubExec/CogExec Directives";
      const protoWDescr: string[] = this._tableSpinPAsmLangParts[nameKey];
      desiredDocText.signature = protoWDescr[0];
      desiredDocText.description = protoWDescr[1]; // bold
    }
    if (desiredDocText.category.length > 0) {
      desiredDocText.found = true;
    }
    return desiredDocText;
  }

  public docTextForDebugBuiltIn(name: string): IBuiltinDescription {
    let desiredDocText: IBuiltinDescription = this._docTextForSpinDebugBuiltInMethod(name);
    if (desiredDocText.found) {
      desiredDocText.type = eBuiltInType.BIT_DEBUG_METHOD;
    } else {
      desiredDocText = this._docTextForSpinBuiltInDebugDisplayType(name);
      if (desiredDocText.found) {
        desiredDocText.type = eBuiltInType.BIT_DEBUG_SYMBOL;
      } else if (name.toLowerCase() == "debug") {
        desiredDocText.found = true;
        desiredDocText.type = eBuiltInType.BIT_DEBUG_SYMBOL;
        desiredDocText.signature = "debug(...)";
        desiredDocText.category = "Debug Output";
        let description: string =
          "Run output commands that serially transmit the state of variables and equations as your application runs.  Each time a DEBUG statement is encountered during execution, the debugging program is invoked and it outputs the message for that statement.";
        description = description + "<br>*(Affected by DEBUG_PIN_TX symbol)*";
        desiredDocText.description = description;
      } else {
        // not a debug specific symbol then check other built-in's
        desiredDocText = this.docTextForBuiltIn(name);
      }
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
          if (desiredDocText.category.includes("Method Pointer")) {
            desiredDocText.type = eBuiltInType.BIT_METHOD_POINTER;
          } else {
            desiredDocText.type = eBuiltInType.BIT_SYMBOL;
          }
        } else {
          desiredDocText = this._docTextForSpinBuiltInLanguagePart(name);
          if (desiredDocText.found) {
            if (desiredDocText.category.includes("Float Conversions")) {
              desiredDocText.type = eBuiltInType.BIT_METHOD;
            } else {
              desiredDocText.type = eBuiltInType.BIT_LANG_PART;
            }
          } else {
            desiredDocText = this._docTextForSpinClockVars(name);
            if (desiredDocText.found) {
              // desiredDocText.type =     -->  nope, this one sets the type for us!
            } else {
              desiredDocText = this._docTextForSpinStorageTypesAlignment(name);
              if (desiredDocText.found) {
                desiredDocText.type = eBuiltInType.BIT_TYPE;
              } else {
                desiredDocText = this._docTextForSpinDebugBuiltInInvoke(name);
                if (desiredDocText.found) {
                  desiredDocText.type = eBuiltInType.BIT_DEBUG_SYMBOL;
                } else {
                  desiredDocText = this._docTextForSpinDebugBuiltInSymbols(name);
                  if (desiredDocText.found) {
                    desiredDocText.type = eBuiltInType.BIT_DEBUG_SYMBOL;
                  } else {
                    // TODO: add more calls here
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

  private _tableSmartPinNames: { [Identifier: string]: string } = {
    // smart pin names - "decr <br> mode bits"
    // FIXME: break this into multiple table each with own cat. name
    // - A Input Polarity
    p_true_a: "True A input<br>%0000_0000_000_0000000000000_00_00000_0",
    p_invert_a: "Invert A input<br>%1000_0000_000_0000000000000_00_00000_0",
    // - A Input Selection
    p_local_a: "Select local pin for A input<br>%0000_0000_000_0000000000000_00_00000_0",
    p_plus1_a: "Select pin+1 for A input<br>%0001_0000_000_0000000000000_00_00000_0",
    p_plus2_a: "Select pin+2 for A input<br>%0010_0000_000_0000000000000_00_00000_0",
    p_plus3_a: "Select pin+3 for A input<br>%0011_0000_000_0000000000000_00_00000_0",
    p_outbit_a: "Select OUT bit for A input<br>%0100_0000_000_0000000000000_00_00000_0",
    p_minus3_a: "Select pin-3 for A input<br>%0101_0000_000_0000000000000_00_00000_0",
    p_minus2_a: "Select pin-2 for A input<br>%0110_0000_000_0000000000000_00_00000_0",
    p_minus1_a: "Select pin-1 for A input<br>%0111_0000_000_0000000000000_00_00000_0",
    // - B Input Polarity
    p_true_b: "True B input<br>%0000_0000_000_0000000000000_00_00000_0",
    p_invert_b: "Invert B input<br>%0000_1000_000_0000000000000_00_00000_0",
    // - B Input Selection
    p_local_b: "Select local pin for B input<br>%0000_0000_000_0000000000000_00_00000_0",
    p_plus1_b: "Select pin+1 for B input<br>%0000_0001_000_0000000000000_00_00000_0",
    p_plus2_b: "Select pin+2 for B input<br>%0000_0010_000_0000000000000_00_00000_0",
    p_plus3_b: "Select pin+3 for B input<br>%0000_0011_000_0000000000000_00_00000_0",
    p_outbit_b: "Select OUT bit for B input<br>%0000_0100_000_0000000000000_00_00000_0",
    p_minus3_b: "Select pin-3 for B input<br>%0000_0101_000_0000000000000_00_00000_0",
    p_minus2_b: "Select pin-2 for B input<br>%0000_0110_000_0000000000000_00_00000_0",
    p_minus1_b: "Select pin-1 for B input<br>%0000_0111_000_0000000000000_00_00000_0",
    // - A,B Input Selection
    p_pass_ab: "Select A, B<br>%0000_0000_000_0000000000000_00_00000_0",
    p_and_ab: "Select A & B, B<br>%0000_0000_001_0000000000000_00_00000_0",
    p_or_ab: "Select A | B, B<br>%0000_0000_010_0000000000000_00_00000_0",
    p_xor_ab: "Select A ^ B, B<br>%0000_0000_011_0000000000000_00_00000_0",
    p_filt0_ab: "Select FILT0 settings for A, B<br>%0000_0000_100_0000000000000_00_00000_0",
    p_filt1_ab: "Select FILT1 settings for A, B<br>%0000_0000_101_0000000000000_00_00000_0",
    p_filt2_ab: "Select FILT2 settings for A, B<br>%0000_0000_110_0000000000000_00_00000_0",
    p_filt3_ab: "Select FILT3 settings for A, B<br>%0000_0000_111_0000000000000_00_00000_0",
    // - Low Level Pin Modes
    p_logic_a: "Logic level A → IN, output OUT<br>%0000_0000_000_0000000000000_00_00000_0",
    p_logic_a_fb: "Logic level A → IN, output feedback<br>%0000_0000_000_0001000000000_00_00000_0",
    p_logic_b_fb: "Logic level B → IN, output feedback<br>%0000_0000_000_0010000000000_00_00000_0",
    p_schmitt_a: "Schmitt trigger A → IN, output OUT<br>%0000_0000_000_0011000000000_00_00000_0",
    p_schmitt_a_fb: "Schmitt trigger A → IN, output feedback<br>%0000_0000_000_0100000000000_00_00000_0",
    p_schmitt_b_fb: "Schmitt trigger B → IN, output feedback<br>%0000_0000_000_0101000000000_00_00000_0",
    p_compare_ab: "A > B → IN, output OUT<br>%0000_0000_000_0110000000000_00_00000_0",
    p_compare_ab_fb: "A > B → IN, output feedback<br>%0000_0000_000_0111000000000_00_00000_0",
    // - ADC Input Modes
    p_adc_gio: "ADC GIO → IN, output OUT<br>%0000_0000_000_1000000000000_00_00000_0",
    p_adc_vio: "ADC VIO → IN, output OUT<br>%0000_0000_000_1000010000000_00_00000_0",
    p_adc_float: "ADC FLOAT → IN, output OUT<br>%0000_0000_000_1000100000000_00_00000_0",
    p_adc_1x: "ADC 1x → IN, output OUT<br>%0000_0000_000_1000110000000_00_00000_0",
    p_adc_3x: "ADC 3.16x → IN, output OUT<br>%0000_0000_000_1001000000000_00_00000_0",
    p_adc_10x: "ADC 10x → IN, output OUT<br>%0000_0000_000_1001010000000_00_00000_0",
    p_adc_30x: "ADC 31.6x → IN, output OUT<br>%0000_0000_000_1001100000000_00_00000_0",
    p_adc_100x: "ADC 100x → IN, output OUT<br>%0000_0000_000_1001110000000_00_00000_0",
    // - DAC Output Modes
    p_dac_990r_3v: "DAC 990Ω, 3.3V peak, ADC 1x → IN<br>%0000_0000_000_1010000000000_00_00000_0",
    p_dac_600r_2v: "DAC 600Ω, 2.0V peak, ADC 1x → IN<br>%0000_0000_000_1010100000000_00_00000_0",
    p_dac_124r_3v: "DAC 123.75Ω, 3.3V peak, ADC 1x → IN<br>%0000_0000_000_1011000000000_00_00000_0",
    p_dac_75r_2v: "DAC 75Ω, 2.0V peak, ADC 1x → IN<br>%0000_0000_000_1011100000000_00_00000_0",
    // - Level-Comparison Modes
    p_level_a: "A > Level → IN, output OUT<br>%0000_0000_000_1100000000000_00_00000_0",
    p_level_a_fbn: "A > Level → IN, output negative feedback<br>%0000_0000_000_1101000000000_00_00000_0",
    p_level_b_fbp: "B > Level → IN, output positive feedback<br>%0000_0000_000_1110000000000_00_00000_0",
    p_level_b_fbn: "B > Level → IN, output negative feedback<br>%0000_0000_000_1111000000000_00_00000_0",
    // - Low-Level Pin Sub-Modes: Sync Mode
    p_async_io: "Select asynchronous I/O<br>%0000_0000_000_0000000000000_00_00000_0",
    p_sync_io: "Select synchronous I/O<br>%0000_0000_000_0000100000000_00_00000_0",
    // - Low-Level Pin Sub-Modes: IN Polarity
    p_true_in: "True IN bit<br>%0000_0000_000_0000000000000_00_00000_0",
    p_invert_in: "Invert IN bit<br>%0000_0000_000_0000010000000_00_00000_0",
    // - Low-Level Pin Sub-Modes: Output Polarity
    p_true_output: "Select true output<br>%0000_0000_000_0000000000000_00_00000_0",
    p_invert_output: "Select inverted output<br>0000_0000_000_0000001000000_00_00000_0",
    // - Low-Level Pin Sub-Modes: Drive-High Strength
    p_high_fast: "Drive high fast (30mA)<br>%0000_0000_000_0000000000000_00_00000_0",
    p_high_1k5: "Drive high 1.5kΩ<br>%0000_0000_000_0000000001000_00_00000_0",
    p_high_15k: "Drive high 15kΩ<br>%0000_0000_000_0000000010000_00_00000_0",
    p_high_150k: "Drive high 150kΩ<br>%0000_0000_000_0000000011000_00_00000_0",
    p_high_1ma: "Drive high 1mA<br>%0000_0000_000_0000000100000_00_00000_0",
    p_high_100ua: "Drive high 100μA<br>%0000_0000_000_0000000101000_00_00000_0",
    p_high_10ua: "Drive high 10μA<br>%0000_0000_000_0000000110000_00_00000_0",
    p_high_float: "Float high<br>%0000_0000_000_0000000111000_00_00000_0",
    // - Low-Level Pin Sub-Modes: Drive-Low Strength
    p_low_fast: "Drive low fast (30mA)<br>%0000_0000_000_0000000000000_00_00000_0",
    p_low_1k5: "Drive low 1.5kΩ<br>%0000_0000_000_0000000000001_00_00000_0",
    p_low_15k: "Drive low 15kΩ<br>%0000_0000_000_0000000000010_00_00000_0",
    p_low_150k: "Drive low 150kΩ<br>%0000_0000_000_0000000000011_00_00000_0",
    p_low_1ma: "Drive low 1mA<br>%0000_0000_000_0000000000100_00_00000_0",
    p_low_100ua: "Drive low 100μA<br>%0000_0000_000_0000000000101_00_00000_0",
    p_low_10ua: "Drive low 10μA<br>%0000_0000_000_0000000000110_00_00000_0",
    p_low_float: "Float low<br>%0000_0000_000_0000000000111_00_00000_0",
    // - DIR/OUT Control
    p_tt_00: "TT = %00<br>%0000_0000_000_0000000000000_00_00000_0",
    p_tt_01: "TT = %01<br>%0000_0000_000_0000000000000_01_00000_0",
    p_tt_10: "TT = %10<br>%0000_0000_000_0000000000000_10_00000_0",
    p_tt_11: "TT = %11<br>%0000_0000_000_0000000000000_11_00000_0",
    p_oe: "Enable output in smart pin mode<br>%0000_0000_000_0000000000000_01_00000_0",
    p_channel: "Enable DAC channel in non-smart pin DAC mode<br>%0000_0000_000_0000000000000_01_00000_0",
    p_bitdac: "Enable BITDAC for non-smart pin DAC mode<br>%0000_0000_000_0000000000000_10_00000_0",
    // - Smart Pin Modes
    p_normal: "Normal mode (not smart pin mode)<br>%0000_0000_000_0000000000000_00_00000_0",
    p_repository: "Long repository (non-DAC mode)<br>%0000_0000_000_0000000000000_00_00001_0",
    p_dac_noise: "DAC Noise (DAC mode)<br>%0000_0000_000_0000000000000_00_00001_0",
    p_dac_dither_rnd: "DAC 16-bit random dither (DAC mode)<br>%0000_0000_000_0000000000000_00_00010_0",
    p_dac_dither_pwm: "DAC 16-bit PWM dither (DAC mode)<br>%0000_0000_000_0000000000000_00_00011_0",
    p_pulse: "Pulse/cycle output<br>%0000_0000_000_0000000000000_00_00100_0",
    p_transition: "Transition output<br>%0000_0000_000_0000000000000_00_00101_0",
    p_nco_freq: "NCO frequency output<br>%0000_0000_000_0000000000000_00_00110_0",
    p_nco_duty: "NCO duty output<br>%0000_0000_000_0000000000000_00_00111_0",
    p_pwm_triangle: "PWM triangle output<br>%0000_0000_000_0000000000000_00_01000_0",
    p_pwm_sawtooth: "PWM sawtooth output<br>%0000_0000_000_0000000000000_00_01001_0",
    p_pwm_smps: "PWM switch-mode power supply I/O<br>%0000_0000_000_0000000000000_00_01010_0",
    p_quadrature: "A-B quadrature encoder input<br>%0000_0000_000_0000000000000_00_01011_0",
    p_reg_up: "Inc on A-rise when B-high<br>%0000_0000_000_0000000000000_00_01100_0",
    p_reg_down: "Inc on A-rise when B-high, dec on A-rise when B-low<br>%0000_0000_000_0000000000000_00_01101_0",
    p_count_rises: "Inc on A-rise, optionally dec on B-rise<br>%0000_0000_000_0000000000000_00_01110_0",
    p_count_highs: "Inc on A-high, optionally dec on B-high<br>%0000_0000_000_0000000000000_00_01111_0",
    p_state_ticks: "For A-low and A-high states, count ticks<br>%0000_0000_000_0000000000000_00_10000_0",
    p_high_ticks: "For A-high states, count ticks<br>%0000_0000_000_0000000000000_00_10001_0",
    p_events_ticks: "For X A-highs/rises/edges, count ticks / Timeout on X ticks of no A-high/rise/edge<br>%0000_0000_000_0000000000000_00_10010_0",
    p_periods_ticks: "For X periods of A, count ticks<br>%0000_0000_000_0000000000000_00_10011_0",
    p_periods_highs: "For X periods of A, count highs<br>%0000_0000_000_0000000000000_00_10100_0",
    p_counter_ticks: "For periods of A in X+ ticks, count ticks<br>%0000_0000_000_0000000000000_00_10101_0",
    p_counter_highs: "For periods of A in X+ ticks, count highs<br>%0000_0000_000_0000000000000_00_10110_0",
    p_counter_periods: "For periods of A in X+ ticks, count periods<br>%0000_0000_000_0000000000000_00_10111_0",
    p_adc: "ADC sample/filter/capture, internally clocked<br>%0000_0000_000_0000000000000_00_11000_0",
    p_adc_ext: "ADC sample/filter/capture, externally clocked<br>%0000_0000_000_0000000000000_00_11001_0",
    p_adc_scope: "ADC scope with trigger<br>%0000_0000_000_0000000000000_00_11010_0",
    p_usb_pair: "USB pin pair<br>%0000_0000_000_0000000000000_00_11011_0",
    p_sync_tx: "Synchronous serial transmit<br>%0000_0000_000_0000000000000_00_11100_0",
    p_sync_rx: "Synchronous serial receive<br>%0000_0000_000_0000000000000_00_11101_0",
    p_async_tx: "Asynchronous serial transmit<br>%0000_0000_000_0000000000000_00_11110_0",
    p_async_rx: "Asynchronous serial receive<br>%0000_0000_000_0000000000000_00_11111_0",
  };

  private _tableEventNames: { [Identifier: string]: string } = {
    // event names
    event_atn: "(14) event Attention-requested from another COG",
    event_ct1: "(01) event CT-passed-CT1",
    event_ct2: "(02) event CT-passed-CT2",
    event_ct3: "(03) event CT-passed-CT3",
    event_fbw: "(09) event Hub FIFO block-wrap",
    event_int: "(00) event Interrupt-occurred",
    int_off: "(00) interrupts off",
    event_pat: "(08) INA/INB pattern match/mismatch",
    event_qmt: "(15) event GETQX/GETQY-on-empty",
    event_se1: "(04) event Selectable event 1",
    event_se2: "(05) event Selectable event 2",
    event_se3: "(06) event Selectable event 3",
    event_se4: "(07) event Selectable event 4",
    event_xfi: "(11) event Streamer command-finished",
    event_xmt: "(10) event Streamer command-empty",
    event_xrl: "(13) event Streamer-read-last-LUT-location",
    event_xro: "(12) event Streamer NCO-rollover",
  };

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
    ];
    const nameKey: string = name.toLowerCase();
    let reservedStatus: boolean = builtinNamesOfNote.indexOf(nameKey) != -1;
    if (!reservedStatus) {
      reservedStatus = nameKey in this._tableSmartPinNames;
    }
    if (!reservedStatus) {
      reservedStatus = nameKey in this._tableEventNames;
    }
    if (!reservedStatus) {
      reservedStatus = nameKey in this._tableSpinCogRegisters;
    }
    return reservedStatus;
  }

  // -------------------------------------------------------------------------
  // keyword checks
  private _tableDebugMethodsString: { [Identifier: string]: TMethodTuple } = {
    zstr: ["ZSTR(hub_pointer)", "Output zero-terminated string found at hub_pointer", ["hub_pointer - address of zero-terminated string in HUB RAM"]],
    lstr: ["LSTR(hub_pointer,byteCount)", "Output 'byteCount' characters found at hub_pointer", ["hub_pointer - address of bytes in HUB RAM", "byteCount - number of bytes at location in HUB RAM"]],
  };

  private _tableDebugMethodsUnsignedDec: { [Identifier: string]: TMethodTuple } = {
    udec: ["UDEC(value)", "Output as auto-sized unsigned decimal value (0 - 4_294_967_295)", ["value - BYTE, WORD or LONG value"]],
    udec_byte: ["UDEC_BYTE(byteValue)", "Output BYTE as unsigned decimal value (0 - 255)", ["byteValue - 8-bit value"]],
    udec_word: ["UDEC_WORD(wordValue)", "Output WORD as unsigned decimal value (0 - 65_535)", ["wordValue - 16-bit value"]],
    udec_long: ["UDEC_LONG(longValue)", "Output LONG as unsigned decimal value (0 - 4_294_967_295)", ["longValue - 32-bit value"]],
    udec_reg_array: [
      "UDEC_REG_ARRAY(reg_pointer, size)",
      "Output register array as unsigned decimal values (0 - 4_294_967_295)",
      ["reg_pointer - address of array of COG registers", "size - count of registers in array"],
    ],
    udec_byte_array: [
      "UDEC_BYTE_ARRAY(hub_pointer, size)",
      "Output hub BYTE array as unsigned decimal values (0 - 255)",
      ["hub_pointer - address of array of BYTEs in HUB ram", "size - count of BYTEs in array"],
    ],
    udec_word_array: [
      "UDEC_WORD_ARRAY(hub_pointer, size)",
      "Output hub WORD array as unsigned decimal value (0 - 65_535)",
      ["hub_pointer - address of array of WORDs in HUB ram", "size - count of WORDs in array"],
    ],
    udec_long_array: [
      "UDEC_LONG_ARRAY(hub_pointer, size)",
      "Output hub LONG array as unsigned decimal value (0 - 4_294_967_295)",
      ["hub_pointer - address of array of LONGs in HUB ram", "size - count of LONGs in array"],
    ],
  };

  private _tableDebugMethodsSignedDec: { [Identifier: string]: TMethodTuple } = {
    sdec: ["SDEC(value)", "Output as auto-sized signed decimal value (-2_147_483_648 - 2_147_483_647)", ["value - BYTE, WORD or LONG value"]],
    sdec_byte: ["SDEC_BYTE(byteValue)", "Output BYTE as signed decimal value (-128 - 127)", ["byteValue - 8-bit value"]],
    sdec_word: ["SDEC_WORD(wordValue)", "Output WORD as signed decimal value (-32_768 - 65_535)", ["wordValue - 16-bit value"]],
    sdec_long: ["SDEC_LONG(longValue)", "Output LONG as signed decimal value (-2_147_483_648 - 2_147_483_647)", ["longValue - 32-bit value"]],
    sdec_reg_array: [
      "SDEC_REG_ARRAY(reg_pointer, size)",
      "Output COG register array as signed decimal values (-2_147_483_648 - 2_147_483_647)",
      ["reg_pointer - address of array of COG registers", "size - count of registers in array"],
    ],
    sdec_byte_array: [
      "SDEC_BYTE_ARRAY(hub_pointer, size)",
      "Output hub BYTE array as signed decimal values (-128 - 127)",
      ["hub_pointer - address of array of BYTEs in HUB ram", "size - count of BYTEs in array"],
    ],
    sdec_word_array: [
      "SDEC_WORD_ARRAY(hub_pointer, size)",
      "Output hub WORD array as signed decimal value (-32_768 - 32_767)",
      ["hub_pointer - address of array of WORDs in HUB ram", "size - count of WORDs in array"],
    ],
    sdec_long_array: [
      "SDEC_LONG_ARRAY(hub_pointer, size)",
      "Output hub LONG array as signed decimal value (-2_147_483_648 - 2_147_483_647)",
      ["hub_pointer - address of array of LONGs in HUB ram", "size - count of LONGs in array"],
    ],
  };

  private _tableDebugMethodsUnsignedHex: { [Identifier: string]: TMethodTuple } = {
    uhex: ["UHEX(value)", "Output as auto-sized unsigned hex value ($0 - $FFFF_FFFF)", ["value - BYTE, WORD or LONG value"]],
    uhex_byte: ["UHEX_BYTE(byteValue)", "Output BYTE as unsigned hex value ($00 - $FF)", ["byteValue - 8-bit value"]],
    uhex_word: ["UHEX_WORD(wordValue)", "Output WORD as unsigned hex value ($0000 - $FFFF)", ["wordValue - 16-bit value"]],
    uhex_long: ["UHEX_LONG(longValue)", "Output LONG as unsigned hex value ($0000_0000 - $FFFF_FFFF)", ["longValue - 32-bit value"]],
    uhex_reg_array: [
      "UHEX_REG_ARRAY(reg_pointer, size)",
      "Output register array as unsigned hex values ($0000_0000 - $FFFF_FFFF)",
      ["reg_pointer - address of array of COG registers", "size - count of registers in array"],
    ],
    uhex_byte_array: [
      "UHEX_BYTE_ARRAY(hub_pointer, size)",
      "Output hub BYTE array as unsigned hex values ($00 - $FF)",
      ["hub_pointer - address of array of BYTEs in HUB ram", "size - count of BYTEs in array"],
    ],
    uhex_word_array: [
      "UHEX_WORD_ARRAY(hub_pointer, size)",
      "Output hub WORD array as unsigned hex values ($0000 - $FFFF)",
      ["hub_pointer - address of array of WORDs in HUB ram", "size - count of WORDs in array"],
    ],
    uhex_long_array: [
      "UHEX_LONG_ARRAY(hub_pointer, size)",
      "Output hub LONG array as unsigned hex values ($0000_0000 - $FFFF_FFFF)",
      ["hub_pointer - address of array of LONGs in HUB ram", "size - count of LONGs in array"],
    ],
  };

  private _tableDebugMethodsSignedHex: { [Identifier: string]: TMethodTuple } = {
    shex: ["SHEX(value)", "Output as auto-sized signed hex value (-$8000_0000 - $7FFF_FFFF)", ["value - BYTE, WORD or LONG value"]],
    shex_byte: ["SHEX_BYTE(byteValue)", "Output BYTE as signed hex value (-$80 - $7F)", ["byteValue - 8-bit value"]],
    shex_word: ["SHEX_WORD(wordValue)", "Output WORD as signed hex value (-$8000 - $7FFF)", ["wordValue - 16-bit value"]],
    shex_long: ["SHEX_LONG(longValue)", "Output LONG as signed hex value (-$8000_0000 - $7FFF_FFFF)", ["longValue - 32-bit value"]],
    shex_reg_array: [
      "SHEX_REG_ARRAY(reg_pointer, size)",
      "Output register array as signed hex values (-$8000_0000 - $7FFF_FFFF)",
      ["reg_pointer - address of array of COG registers", "size - count of registers in array"],
    ],
    shex_byte_array: [
      "SHEX_BYTE_ARRAY(hub_pointer, size)",
      "Output hub BYTE array as signed hex values (-$80 - $7F)",
      ["hub_pointer - address of array of BYTEs in HUB ram", "size - count of BYTEs in array"],
    ],
    shex_word_array: [
      "SHEX_WORD_ARRAY(hub_pointer, size)",
      "Output hub WORD array as signed hex values (-$8000 - $7FFF)",
      ["hub_pointer - address of array of WORDs in HUB ram", "size - count of WORDs in array"],
    ],
    shex_long_array: [
      "SHEX_LONG_ARRAY(hub_pointer, size)",
      "Output hub LONG array as signed hex values (-$8000_0000 - $7FFF_FFFF)",
      ["hub_pointer - address of array of LONGs in HUB ram", "size - count of LONGs in array"],
    ],
  };

  private _tableDebugMethodsUnsignedBin: { [Identifier: string]: TMethodTuple } = {
    ubin: ["UBIN(value)", "Output as auto-sized unsigned binary value", ["value - BYTE, WORD or LONG value"]],
    ubin_byte: ["UBIN_BYTE(byteValue)", "Output BYTE as unsigned binary value", ["byteValue - 8-bit value"]],
    ubin_word: ["UBIN_WORD(wordValue)", "Output WORD as unsigned binary value", ["wordValue - 16-bit value"]],
    ubin_long: ["UBIN_LONG(longValue)", "Output LONG as unsigned binary value", ["longValue - 32-bit value"]],
    ubin_reg_array: ["UBIN_REG_ARRAY(reg_pointer, size)", "Output register array as unsigned binary values", ["reg_pointer - address of array of COG registers", "size - count of registers in array"]],
    ubin_byte_array: [
      "UBIN_BYTE_ARRAY(hub_pointer, size)",
      "Output hub BYTE array as unsigned binary values",
      ["hub_pointer - address of array of BYTEs in HUB ram", "size - count of BYTEs in array"],
    ],
    ubin_word_array: [
      "UBIN_WORD_ARRAY(hub_pointer, size)",
      "Output hub WORD array as unsigned binary values",
      ["hub_pointer - address of array of WORDs in HUB ram", "size - count of WORDs in array"],
    ],
    ubin_long_array: [
      "UBIN_LONG_ARRAY(hub_pointer, size)",
      "Output hub LONG array as unsigned binary values",
      ["hub_pointer - address of array of LONGs in HUB ram", "size - count of LONGs in array"],
    ],
  };

  private _tableDebugMethodsSignedBin: { [Identifier: string]: TMethodTuple } = {
    sbin: ["SBIN(value)", "Output as auto-sized signed binary value", ["value - BYTE, WORD or LONG value"]],
    sbin_byte: ["SBIN_BYTE(byteValue)", "Output BYTE as signed binary value", ["byteValue - 8-bit value"]],
    sbin_word: ["SBIN_WORD(wordValue)", "Output WORD as signed binary value", ["wordValue - 16-bit value"]],
    sbin_long: ["SBIN_LONG(longValue)", "Output LONG as signed binary value", ["longValue - 32-bit value"]],
    sbin_reg_array: ["SBIN_REG_ARRAY(reg_pointer, size)", "Output register array as signed binary values", ["reg_pointer - address of array of COG registers", "size - count of registers in array"]],
    sbin_byte_array: ["SBIN_BYTE_ARRAY(hub_pointer, size)", "Output hub BYTE array as signed binary values", ["hub_pointer - address of array of BYTEs in HUB ram", "size - count of BYTEs in array"]],
    sbin_word_array: ["SBIN_WORD_ARRAY(hub_pointer, size)", "Output hub WORD array as signed binary values", ["hub_pointer - address of array of WORDs in HUB ram", "size - count of WORDs in array"]],
    sbin_long_array: ["SBIN_LONGARRAY(hub_pointer, size)", "Output hub LONG array as signed binary values", ["hub_pointer - address of array of LONGs in HUB ram", "size - count of LONGs in array"]],
  };

  private _tableDebugMethodsFloat: { [Identifier: string]: TMethodTuple } = {
    fdec: ["FDEC(value)", "Output floating-point value (-3.4e+38 - 3.4e+38)", ["value - float 32-bit value"]],
    fdec_array: [
      "FDEC_ARRAY(hub_pointer, size)",
      "Output hub long array as floating-point values (-3.4e+38 - 3.4e+38)",
      ["hub_pointer - address of long array in HUB ram", "size - count of longs in the array"],
    ],
    fdec_reg_array: [
      "FDEC_REG_ARRAY(reg_pointer, size)",
      "Output register array as floating-point values (-3.4e+38 - 3.4e+38)",
      ["reg_pointer - address of register array in COG ram", "size - count of registers in the array"],
    ],
  };

  private _tableDebugMethodsMisc: { [Identifier: string]: TMethodTuple } = {
    dly: ["DLY(milliseconds)", "Delay for some milliseconds to slow down continuous message outputs for this cog", ["milliseconds - number of 1/1_000's of seconds to delay"]],
    pc_key: [
      "PC_KEY(pointer_to_long)",
      "FOR USE IN GRAPHICAL DEBUG() DISPLAYS - Must be the last command in a DEBUG() statement<br>Returns any new host-PC keypress that occurred within the last 100ms into a long inside the chip<br>The DEBUG() Display must have focus for keypresses to be noticed",
      ["pointer_to_long - address to long to receive the pressed key-value"],
    ],
    pc_mouse: [
      "PC_MOUSE(pointer_to_7_longs)",
      "FOR USE IN GRAPHICAL DEBUG DISPLAYS - Must be the last command in a DEBUG() statement<br>Returns the current host-PC mouse status into a 7-long structure inside the chip",
      ["pointer_to_7_longs - address of the 7-long structure to receive the mouse status"],
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
      let methodDescr: TMethodTuple = ["", "", []];
      if (nameKey in this._tableDebugMethodsString) {
        desiredDocText.category = "String Output";
        methodDescr = this._tableDebugMethodsString[nameKey];
      } else if (nameKey in this._tableDebugMethodsUnsignedDec) {
        desiredDocText.category = "Unsigned Decimal Output";
        methodDescr = this._tableDebugMethodsUnsignedDec[nameKey];
      } else if (nameKey in this._tableDebugMethodsSignedDec) {
        desiredDocText.category = "Signed Decimal Output";
        methodDescr = this._tableDebugMethodsSignedDec[nameKey];
      } else if (nameKey in this._tableDebugMethodsUnsignedHex) {
        desiredDocText.category = "Unsigned Hexedecimal Output";
        methodDescr = this._tableDebugMethodsUnsignedHex[nameKey];
      } else if (nameKey in this._tableDebugMethodsSignedHex) {
        desiredDocText.category = "Signed Hexedecimal Output";
        methodDescr = this._tableDebugMethodsSignedHex[nameKey];
      } else if (nameKey in this._tableDebugMethodsUnsignedBin) {
        desiredDocText.category = "Unsigned Binary Output";
        methodDescr = this._tableDebugMethodsUnsignedBin[nameKey];
      } else if (nameKey in this._tableDebugMethodsSignedBin) {
        desiredDocText.category = "Signed Binary Output";
        methodDescr = this._tableDebugMethodsSignedBin[nameKey];
      } else if (nameKey in this._tableDebugMethodsFloat) {
        desiredDocText.category = "Floating Point Output";
        methodDescr = this._tableDebugMethodsFloat[nameKey];
      } else if (nameKey in this._tableDebugMethodsMisc) {
        bSupportsSuffix = false;
        desiredDocText.category = "Miscellaneous";
        methodDescr = this._tableDebugMethodsMisc[nameKey];
      } else if (nameKey in this._tableDebugMethodsConditionals) {
        bSupportsSuffix = false;
        desiredDocText.category = "Conditionals";
        protoWDescr = this._tableDebugMethodsConditionals[nameKey];
      }
      if (methodDescr[0].length > 0) {
        desiredDocText.signature = methodDescr[0];
        desiredDocText.description = methodDescr[1];
        if (methodDescr[2] && methodDescr[2].length > 0) {
          desiredDocText.parameters = methodDescr[2];
        }
        if (methodDescr[3] && methodDescr[3].length > 0) {
          desiredDocText.returns = methodDescr[3];
        }
      } else if (!bIsUnderscoreSuffix || (bIsUnderscoreSuffix && bSupportsSuffix)) {
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

  private _tableDebugInvokeSymbols: { [Identifier: string]: string } = {
    debug: "invoke this cog's PASM-level debugger",
    debug_main:
      'each cog\'s PASM-level debugger will initially be invoked when a COGINIT occurs, and it will be ready to single-step through main (non-interrupt) code. In this case, DEBUG commands will be ignored, until you select "DEBUG" sensitivity in the debugger.',
    debug_coginit: "each cog's PASM-level debugger will initially be invoked when a COGINIT occurs",
  };

  public isDebugInvocation(name: string): boolean {
    const nameKey: string = name.toLowerCase();
    let reservedStatus: boolean = nameKey in this._tableDebugInvokeSymbols;
    return reservedStatus;
  }

  private _tableDebugControlSymbols: { [Identifier: string]: string } = {
    download_baud: "(default 2_000_000)<br>Sets the download baud rate",
    debug_cogs: "(default %1111_1111)<br>Selects which cogs have debug interrupts enabled. Bits 7..0 enable debugging interrupts in cogs 7..0",
    debug_delay: "(default 0)<br>Sets a delay in milliseconds before your application runs and begins transmitting DEBUG messages",
    debug_pin_tx: "(default 62)<br>Sets the DEBUG serial output pin. For DEBUG windows to open, DEBUG_PIN must be 62",
    debug_pin_rx: "(default 63)<br>Sets the DEBUG serial input pin for interactivity with the host PC",
    debug_baud: "(default download_baud)<br>Sets the DEBUG baud rate. May be necessary to add DEBUG_DELAY if DEBUG_BAUD is less than DOWNLOAD_BAUD",
    debug_timestamp: "By declaring this symbol, each DEBUG message will be time-stamped with the 64-bit CT value",
    debug_log_size: "(default 0)<br>Sets the maximum size in bytes of the 'DEBUG.log' file which will collect DEBUG messages. A value of 0 will inhibit log file generation",
    debug_left: "Sets the left screen coordinate where the DEBUG message window will appear",
    debug_top: "Sets the top screen coordinate where the DEBUG message window will appear",
    debug_width: "Sets the width of the DEBUG message window",
    debug_height: "Sets the height of the DEBUG message window",
    debug_display_left: "(default 0)<br>Sets the overall left screen offset where any DEBUG displays will appear (adds to 'POS' x coordinate in each DEBUG display)",
    debug_display_top: "(default 0)<br>Sets the overall top screen offset where any DEBUG displays will appear (adds to 'POS' y coordinate in each DEBUG display)",
    debug_windows_off: "(default 0)<br>Disables any DEBUG windows from opening after downloading, if set to a non-zero value",
  };

  public isDebugControlSymbol(name: string): boolean {
    const nameKey: string = name.toLowerCase();
    let reservedStatus: boolean = nameKey in this._tableDebugControlSymbols;
    return reservedStatus;
  }

  private _docTextForSpinDebugBuiltInSymbols(name: string): IBuiltinDescription {
    const nameKey: string = name.toLowerCase();
    let desiredDocText: IBuiltinDescription = { found: false, type: eBuiltInType.Unknown, category: "", description: "", signature: "" };
    if (this.isDebugControlSymbol(nameKey)) {
      desiredDocText.found = true;
      let protoWDescr: string[] = [];
      if (nameKey in this._tableDebugControlSymbols) {
        desiredDocText.category = "Debug Symbol";
        desiredDocText.description = this._tableDebugControlSymbols[nameKey];
      }
    }
    return desiredDocText;
  }

  private _docTextForSpinDebugBuiltInInvoke(name: string): IBuiltinDescription {
    const nameKey: string = name.toLowerCase();
    let desiredDocText: IBuiltinDescription = { found: false, type: eBuiltInType.Unknown, category: "", description: "", signature: "" };
    if (this.isDebugInvocation(nameKey)) {
      desiredDocText.found = true;
      let protoWDescr: string[] = [];
      if (nameKey in this._tableDebugInvokeSymbols) {
        desiredDocText.category = "Debugger Invocation";
        desiredDocText.description = this._tableDebugInvokeSymbols[nameKey];
      }
    }
    return desiredDocText;
  }

  // operators
  // MAYBE??: add signature forms for all but last 3, logicals
  private _tableSpinBinaryOperators: { [Identifier: string]: string } = {
    sar: "Shift x right by y bits, insert MSB's",
    ror: "Rotate x right by y bits",
    rol: "Rotate x left by y bits",
    rev: "Reverse order of bits 0..y of x and zero-extend",
    zerox: "Zero-extend above bit y",
    signx: "Sign-extend from bit y",
    sca: "Unsigned scale, (x * y) >> 32",
    scas: "Signed scale, (x * y) >> 30",
    frac: "Unsigned fraction, (x << 32) / y",
    addbits: "Make bitfield, (x & $1F) | (y & $1F) << 5",
    addpins: "Make pinfield, (x & $3F) | (y & $1F) << 6",
    and: "Logical AND (x <> 0 AND y <> 0, returns FALSE (0) or TRUE (-1))",
    or: "Logical OR (x <> 0 OR y <> 0, returns FALSE (0) or TRUE (-1))",
    xor: "Logical XOR (x <> 0 XOR y <> 0, returns FALSE (0) or TRUE (-1))",
  };

  public isBinaryOperator(name: string): boolean {
    const nameKey: string = name.toLowerCase();
    const reservedStatus: boolean = nameKey in this._tableSpinBinaryOperators;
    return reservedStatus;
  }

  private _tableSpinUnaryOperators: { [Identifier: string]: string } = {
    not: "Logical NOT (0 → -1, non-0 → 0)",
    abs: "Absolute value",
    fabs: "Floating-point absolute value (clears MSB)",
    encod: "Encode MSB, 0..31",
    decod: "Decode, 1 << (x & $1F)",
    bmask: "Bitmask, (2 << (x & $1F)) - 1",
    ones: "Sum all '1' bits, 0..32",
    sqrt: "Square root of unsigned value",
    fsqrt: "Floating-point square root",
    qlog: "Unsigned value to logarithm {5'whole, 27'fraction}",
    qexp: "Logarithm to unsigned value",
  };

  public isUnaryOperator(name: string): boolean {
    const nameKey: string = name.toLowerCase();
    const reservedStatus: boolean = nameKey in this._tableSpinUnaryOperators;
    return reservedStatus;
  }

  private _tableSpinFloatConversions: { [Identifier: string]: TMethodTuple } = {
    float: ["FLOAT(x): floatValue", "Convert integer x to float", ["x - integer value to be converted"], ["floatValue - x-value represented as float"]],
    trunc: ["TRUNC(x): integerValue", "Convert float x to truncated integer", ["x - float value to be converted (remove all after decimal)"], ["integerValue - result of truncation operation"]],
    round: ["ROUND(x): integerValue", "Convert float x to rounded integer", ["x - float value to be converted (round to nearest integer)"], ["integerValue - result of rounding operation"]],
  };

  public isSpinReservedWord(name: string): boolean {
    const nameKey: string = name.toLowerCase();
    const spinInstructionsOfNote: string[] = [
      "reg",
      "field",
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
      reservedStatus = nameKey in this._tableSpinNumericSymbols;
    }
    if (reservedStatus == false) {
      reservedStatus = nameKey in this._tableSpinFloatConversions;
    }
    return reservedStatus;
  }

  private _tableSpinNumericSymbols: { [Identifier: string]: string } = {
    false: "%0000_0000, Same as 0",
    true: "%FFFF_FFFF, Same as -1",
    negx: "%8000_0000, Negative-extreme integer, -2_147_483_648",
    posx: "%7FFF_FFFF, ositive-extreme integer, +2_147_483_647 ($7FFF_FFFF)",
    pi: "%4049_0FDB, Single-precision floating-point value of Pi, 3.14159265",
  };

  private _tableSpinCoginitSymbols: { [Identifier: string]: string } = {
    cogexec: '%00_0000, (default) Use "COGEXEC + CogNumber" to start a cog in cogexec mode',
    hubexec: '%10_0000, Use "HUBEXEC + CogNumber" to start a cog in hubexec mode',
    cogexec_new: "%01_0000, Starts an available cog in cogexec mode",
    hubexec_new: "%11_0000, Starts an available cog in hubexec mode",
    cogexec_new_pair: "%01_0001, Starts an available eve/odd pair of cogs in cogexec mode, useful for LUT sharing",
    hubexec_new_pair: "%11_0001, Starts an available eve/odd pair of cogs in hubexec mode, useful for LUT sharing",
  };

  private _tableSpinCogexecSymbols: { [Identifier: string]: string } = {
    newcog: "%01_0000, Starts an available cog",
  };

  private _tableSpinMethodPointerSymbols: { [Identifier: string]: TMethodTuple } = {
    send: [
      "SEND(userParam)",
      "SEND() is a special method pointer which is inherited from the calling method and, in turn, conveyed to all called methods. Must point to a method which takes one parameter and has no return values",
      ["userParam - single value or list of values passed to pointed to method"],
    ],
    recv: [
      "RECV(): returnValue",
      "RECV(), like SEND(), is a special method pointer which is inherited from the calling method and, in turn, conveyed to all called methods. Must point to a method which takes no parameters and returns a single value",
      [],
      ["returnValue - single value returned from pointed to method"],
    ],
  };

  public isSpinSpecialMethod(name: string): boolean {
    const nameKey: string = name.toLowerCase();
    let reservedStatus: boolean = nameKey in this._tableSpinMethodPointerSymbols;
    return reservedStatus;
  }

  public isSpinNoparenMethod(name: string): boolean {
    const nameKey: string = name.toLowerCase();
    let reservedStatus: boolean = nameKey in this._tableSpinMethodPointerSymbols && nameKey == "recv"; // recv of [send, recv]
    if (!reservedStatus) {
      reservedStatus = nameKey in this._tableSpinControlFlowMethods; // abort, return
    }
    return reservedStatus;
  }

  private _docTextForCogAndNumericSymbols(name: string): IBuiltinDescription {
    const nameKey: string = name.toLowerCase();
    let desiredDocText: IBuiltinDescription = { found: false, type: eBuiltInType.Unknown, category: "", description: "", signature: "" };
    let methodDescr: TMethodTuple = ["", "", []];
    if (this.isCoginitReservedSymbol(name)) {
      if (nameKey in this._tableSpinCoginitSymbols) {
        desiredDocText.category = "Coginit";
        desiredDocText.description = this._tableSpinCoginitSymbols[nameKey];
      } else if (nameKey in this._tableSpinCogexecSymbols) {
        desiredDocText.category = "Cogexec";
        desiredDocText.description = this._tableSpinCogexecSymbols[nameKey];
      }
    } else if (nameKey in this._tableSpinNumericSymbols) {
      desiredDocText.category = "Numeric";
      desiredDocText.description = this._tableSpinNumericSymbols[nameKey];
    } else if (nameKey in this._tableSpinMethodPointerSymbols) {
      desiredDocText.category = "Method Pointer";
      methodDescr = this._tableSpinMethodPointerSymbols[nameKey];
    }
    if (methodDescr[0].length != 0) {
      desiredDocText.signature = methodDescr[0];
      desiredDocText.description = methodDescr[1];
      if (methodDescr[2] && methodDescr[2].length > 0) {
        desiredDocText.parameters = methodDescr[2];
      }
      if (methodDescr[3] && methodDescr[3].length > 0) {
        desiredDocText.returns = methodDescr[3];
      }
    }
    if (desiredDocText.category.length > 0) {
      desiredDocText.found = true;
    }
    return desiredDocText;
  }

  public isCoginitReservedSymbol(name: string): boolean {
    const nameKey: string = name.toLowerCase();
    let reservedStatus: boolean = nameKey in this._tableSpinCoginitSymbols;
    if (!reservedStatus) {
      reservedStatus = nameKey in this._tableSpinCogexecSymbols;
    }
    return reservedStatus;
  }

  public isFloatConversion(name: string): boolean {
    const floatConversionOfNote: string[] = ["float", "round", "trunc"];
    const reservedStatus: boolean = floatConversionOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  public isP2AsmModczOperand(name: string): boolean {
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
  private _tableSpinHubMethods: { [Identifier: string]: TMethodTuple } = {
    hubset: ["HUBSET(Value)", "Set HUB configuration to Value, or reset the Propeller", ["Value - hub configuration value"]],
    clkset: ["CLKSET(NewCLKMODE, NewCLKFREQ)", "Safely establish new clock settings, updates CLKMODE and CLKFREQ", ["NewCLKMODE - desired clock mode value", "NewCLKFREQ - desired clock frequency"]],
    cogspin: [
      "COGSPIN(CogNum, Method({Pars}), StkAddr)[ : CogId]",
      "Start Spin2 method in a cog, returns cog's ID if used as an expression element, -1 = no cog free",
      ["CogNum - id of COG to be started (or NEWCOG for next available)", "Method({Pars}) - method (with parameters) to be run in cog", "StkAddr - Address of memory to be used as stack"],
      ["CogId - cog's ID if used as an expression element, -1 = no cog free"],
    ],
    coginit: [
      "COGINIT(CogNum, PASMaddr, PTRAvalue)[ : CogId]",
      "Start PASM code in a cog, returns cog's ID if used as an expression element, -1 = no cog free",
      ["CogNum - COG id of cog to be started and/or COGINIT Symbol (e.g., COGEXEC_NEW)", "PASMaddr - Address of p2asm code to be run in COG", "PTRAvalue - value to be passed to new COG a startup"],
      ["CogId - cog's ID if used as an expression element, -1 = no cog free"],
    ],
    cogstop: ["COGSTOP(CogNum)", "Stop cog CogNum", ["CogNum - id of COG to be stopped"]],
    cogid: ["COGID() : CogNum", "Get this cog's ID", [], ["CogNum - ID of currently running COG"]],
    cogchk: ["COGCHK(CogNum) : Running", "Check if COG CogNum is running", ["CogNum - id of COG to be checked"], ["Running - TRUE (-1) if running or FALSE (0) if not"]],
    locknew: ["LOCKNEW() : LockNum", "Check out a new LOCK from inventory", [], ["LockNum - 0..15 if successful or < 0 if no LOCK available"]],
    lockret: ["LOCKRET(LockNum)", "Return a LOCK to inventory", ["LockNum - [0-15] id of the lock to be returned"]],
    locktry: [
      "LOCKTRY(LockNum) : LockState",
      "Try to capture a LOCK",
      ["LockNum - [0-15] id of the lock to capture"],
      ["LockState - TRUE (-1) if successful or FALSE (0) if another cog has captured the LOCK."],
    ],
    lockrel: ["LOCKREL(LockNum)", "Release a LOCK", ["LockNum - [0-15] id of the lock to release"]],
    lockchk: [
      "LOCKCHK(LockNum) : LockState",
      "Check a certain LOCK's state",
      ["LockNum - [0-15] id of the lock to check"],
      ["LockState - LockState[31] = captured, LockState[3:0] = current or last owner cog"],
    ],
    cogatn: ["COGATN(CogMask)", "Strobe ATN input(s) of cog(s) according to 16-bit CogMask", ["CogMask - [0-15] bitmask list of cogs to be Strobed"]],
    pollatn: ["POLLATN() : AtnFlag", "Check if this cog has received an ATN strobe", [], ["AtnFlag - is TRUE (-1) if ATN strobed or FALSE (0) if not strobed"]],
    waitatn: ["WAITATN()", "Wait for this cog to receive an ATN strobe", []],
  };

  private _tableSpinPinMethods: { [Identifier: string]: TMethodTuple } = {
    // key: [ signature, description, ["param1 - descr", "param2 - descr", "..."], ["return1 - descr", "return2 - descr", "..."] ]
    pinw: [
      "PINW(PinField, Data)",
      "Drive PinField pin(s) with Data<br>(same as PINWRITE(PinField, Data)",
      ["PinField - selects one or more pins within same 32-bit block (P0-P31 or P32-P63)", "Data - bit values to write, ea. bit in same position as each active pin in `PinField`"],
    ],
    pinwrite: [
      "PINWRITE(PinField, Data)",
      "Drive PinField pin(s) with Data<br>(same as PINW(PinField, Data)",
      ["PinField - selects one or more pins within same 32-bit block (P0-P31 or P32-P63)", "Data - bit values to write, ea. bit in same position as each active pin in `PinField`"],
    ],
    pinr: [
      "PINR(PinField) : PinStates : PinStates",
      "Read PinField pin(s)<br>(same as PINREAD(PinField) : PinStates)",
      ["PinField - selects one or more pins within same 32-bit block (P0-P31 or P32-P63)"],
      ["PinStates - bit values read, one bit in same position as each active pin in `PinField`"],
    ],
    pinread: [
      "PINREAD(PinField) : PinStates",
      "Read PinField pin(s)<br>(same as PINR(PinField) : PinStates)",
      ["PinField - selects one or more pins within same 32-bit block (P0-P31 or P32-P63)"],
      ["PinStates - bit values read, one bit in same position as each active pin in `PinField`"],
    ],
    pinl: ["PINL(PinField)", "Drive PinField pin(s) low<br>(same as PINLOW(PinField))", ["PinField - selects one or more pins within same 32-bit block (P0-P31 or P32-P63)"]],
    pinlow: ["PINLOW(PinField)", "Drive PinField pin(s) low<br>(same as PINL(PinField))", ["PinField - selects one or more pins within same 32-bit block (P0-P31 or P32-P63)"]],
    pinh: ["PINH(PinField)", "Drive PinField pin(s) high<br>(same as PINHIGH(PinField))", ["PinField - selects one or more pins within same 32-bit block (P0-P31 or P32-P63)"]],
    pinhigh: ["PINHIGH(PinField)", "Drive PinField pin(s) high<br>(same as PINH(PinField))", ["PinField - selects one or more pins within same 32-bit block (P0-P31 or P32-P63)"]],
    pint: ["PINT(PinField)", "Drive and toggle PinField pin(s)<br>(same as PINTOGGLE(PinField))", ["PinField - selects one or more pins within same 32-bit block (P0-P31 or P32-P63)"]],
    pintoggle: ["PINTOGGLE(PinField)", "Drive and toggle PinField pin(s)<br>(same as PINT(PinField))", ["PinField - selects one or more pins within same 32-bit block (P0-P31 or P32-P63)"]],
    pinf: ["PINF(PinField)", "Float PinField pin(s)<br>(same as PINFLOAT(PinField))", ["PinField - selects one or more pins within same 32-bit block (P0-P31 or P32-P63)"]],
    pinfloat: ["PINFLOAT(PinField)", "Float PinField pin(s)<br>(same as PINF(PinField))", ["PinField - selects one or more pins within same 32-bit block (P0-P31 or P32-P63)"]],
    pinstart: [
      "PINSTART(PinField, Mode, Xval, Yval)",
      "Start PinField smart pin(s): DIR=0, then WRPIN=Mode, WXPIN=Xval, WYPIN=Yval, then DIR=1",
      [
        "PinField - selects one or more pins within same 32-bit block (P0-P31 or P32-P63)",
        "Mode - mode bits for selected smart pin(s)",
        "XVal - initial value for X register of selected smart pin(s)",
        "YVal - initial value for Y register of selected smart pin(s)",
      ],
    ],
    pinclear: ["PINCLEAR(PinField)", "Clear PinField smart pin(s): DIR=0, then WRPIN=0", ["PinField - selects one or more pins within same 32-bit block (P0-P31 or P32-P63)"]],
    wrpin: [
      "WRPIN(PinField, Data)",
      "Write 'mode' register(s) of PinField smart pin(s) with Data",
      ["PinField - selects one or more pins within same 32-bit block (P0-P31 or P32-P63)", "Data - mode bits for selected smart pin(s)"],
    ],
    wxpin: [
      "WXPIN(PinField, Data)",
      "Write 'X' register(s) of PinField smart pin(s) with Data",
      ["PinField - selects one or more pins within same 32-bit block (P0-P31 or P32-P63)", "Data - initial value for X register of selected smart pin(s)"],
    ],
    wypin: [
      "WYPIN(PinField, Data)",
      "Write 'Y' register(s) of PinField smart pin(s) with Data",
      ["PinField - selects one or more pins within same 32-bit block (P0-P31 or P32-P63)", "Data - initial value for Y register of selected smart pin(s)"],
    ],
    akpin: ["AKPIN(PinField)", "Acknowledge PinField smart pin(s)", ["PinField - selects one or more pins within same 32-bit block (P0-P31 or P32-P63)"]],
    rdpin: [
      "RDPIN(Pin) : Zval",
      "Read Pin smart pin and acknowledge<br> NOTE: this read overwrites zval[31] with the c flag value, but this does not interfere with expected data",
      ["Pin - a single smart pin (P0-P63)"],
      ["Zval - Zval[31] = C flag from RQPIN, other bits are RQPIN data"],
    ],
    rqpin: [
      "RQPIN(Pin) : Zval",
      "Read Pin smart pin without acknowledge<br> NOTE: this read overwrites zval[31] with the c flag value, but this does not interfere with expected data",
      ["Pin - a single smart pin (P0-P63)"],
      ["Zval - Zval[31] = C flag from RQPIN, other bits are RQPIN data"],
    ],
  };

  private _tableSpinTimingMethods: { [Identifier: string]: TMethodTuple } = {
    getct: ["GETCT() : Count", "Get 32-bit system counter", [], ["Count - the current 32-bit system counter value"]],
    pollct: ["POLLCT(Tick) : Past", "Check if system counter has gone past 'Tick'", ["Tick - a 32-bit counter check value"], ["Past - returns TRUE (-1) if past or FALSE (0) if not"]],
    waitct: ["WAITCT(Tick)", "Wait for system counter to get past 'Tick'", ["Tick - 32-bit counter value"]],
    waitus: ["WAITUS(Microseconds)", "Wait Microseconds, uses CLKFREQ, duration must not exceed $8000_0000 clocks", ["Microseconds - number of 1/1_000_000's of a second to wait"]],
    waitms: ["WAITMS(Milliseconds)", "Wait Milliseconds, uses CLKFREQ, duration must not exceed $8000_0000 clocks", ["Milliseconds - number of 1/1_000's of a second to wait"]],
    getsec: ["GETSEC() : Seconds", "Get seconds since booting, uses 64-bit system counter and CLKFREQ, rolls over every 136 years", [], ["Seconds - seconds since boot"]],
    getms: ["GETMS() : Milliseconds", "Get milliseconds since booting, uses 64-bit system counter and CLKFREQ, rolls over every 49.7 days", [], ["Milliseconds - milliseconds since boot"]],
  };

  private _tablePAsmInterfaceMethods: { [Identifier: string]: TMethodTuple } = {
    call: [
      "CALL(RegisterOrHubAddr)",
      "CALL PASM code at Addr, PASM code should avoid registers $130..$1D7 and LUT",
      ["RegisterOrHubAddr - address of COG register containing instruction to be executed"],
    ],
    regexec: [
      "REGEXEC(HubAddr)",
      "Load a self-defined chunk of PASM code from HubAddr into COG registers and CALL it",
      ["HubAddr - address of chunk which is preceded with two words which provide the starting register and the number of registers (longs) to load, minus 1"],
    ],
    regload: [
      "REGLOAD(HubAddr)",
      "Load a self-defined chunk of PASM code or data from HubAddr into registers",
      ["HubAddr - address of chunk which is preceded with two words which provide the starting register and the number of registers (longs) to load, minus 1"],
    ],
  };

  private _tableSpinMathMethods: { [Identifier: string]: TMethodTuple } = {
    rotxy: [
      "ROTXY(x, y, angle32bit) : rotx, roty",
      "Rotate (x,y) by angle32bit and return rotated (x,y)",
      ["x - horizontal coordinate", "y - vertical coordinate", "angle32bit - unsigned 32-bit angle, where $00000000..$FFFFFFFF = 0..359.9999999 degrees"],
      ["x - x rotated by angle32bit", "y - y rotated by angle32bit"],
    ],
    polxy: [
      "POLXY(length, angle32bit) : x, y",
      "Convert (length,angle32bit) to (x,y)",
      ["length - integer distance from 0,0", "angle32bit - unsigned 32-bit angle, where $00000000..$FFFFFFFF = 0..359.9999999 degrees"],
      ["x - resulting X", "y - resulting Y"],
    ],
    xypol: [
      "XYPOL(x, y) : length, angle32bit",
      "Convert (x,y) to (length,angle32bit)",
      ["x - horizontal coordinate", "y - vertical coordinate"],
      ["length - integer distance from 0,0", "angle32bit - unsigned 32-bit angle, where $00000000..$FFFFFFFF = 0..359.9999999 degrees"],
    ],
    qsin: [
      "QSIN(length, step, stepsInCircle) : y",
      "Rotate (length,0) by (step / stepsInCircle) * 2Pi and return y.",
      [
        "length - integer distance from 0,0",
        "step - is the positon on the circle in terms of stepsInCircle",
        "stepsInCircle - unsigned number of steps around the circle. Use 0 for stepsInCircle = $1_0000_0000",
      ],
      ["y - computed Y value from rotation"],
    ],
    qcos: [
      "QCOS(length, step, stepsInCircle) : x",
      "Rotate (length, 0) by (step / stepsInCircle) * 2Pi and return x",
      [
        "length - integer distance from 0,0",
        "step - is the positon on the circle in terms of stepsInCircle",
        "stepsInCircle - unsigned number of steps around the circle. Use 0 for stepsInCircle = $1_0000_0000",
      ],
      ["x - computed X value from rotation"],
    ],
    muldiv64: [
      "MULDIV64(mult1,mult2,divisor) : quotient",
      "Divide the 64-bit product of 'mult1' and 'mult2' by 'divisor', return quotient (unsigned operation)",
      ["mult1 - the 32-bit multiplicand", "mult2 - the 32-bit multiplier", "divisor - the 32-bit value to divide by"],
      ["quotient - 32-bit result of multiply followed by divide"],
    ],
    getrnd: ["GETRND() : rnd", "Get random long (from xoroshiro128** pseudo-random number generator, seeded on boot with thermal noise from ADC)", [], ["rnd - a random 32-bit integer"]],
    nan: [
      "NAN(float) : NotANumber",
      "Determine if a floating-point value is not a number",
      ["float - floating point number to be evaluated"],
      ["NotANumber - returns TRUE (-1) if number or FALSE (0) if not"],
    ],
  };

  private _tableSpinMemoryMethods: { [Identifier: string]: TMethodTuple } = {
    getregs: [
      "GETREGS(HubAddr, CogAddr, Count)",
      "Move Count registers at CogAddr to longs at HubAddr",
      ["HubAddr - address of HUB long array to receive values", "CogAddr - address of COG register array to be copied", "Count - number of registers to be copied"],
    ],
    setregs: [
      "SETREGS(HubAddr, CogAddr, Count)",
      "Move Count longs at HubAddr to registers at CogAddr",
      ["HubAddr - address of HUB long array to be copied", "CogAddr - address of COG register array to receive values", "Count - number of registers to be copied"],
    ],
    bytemove: [
      "BYTEMOVE(Destination, Source, Count)",
      "Move Count bytes from Source to Destination",
      ["Destination - address of BYTE array to receive values", "Source - address of BYTE array to be copied", "Count - the number of BYTEs to be copied"],
    ],
    wordmove: [
      "WORDMOVE(Destination, Source, Count)",
      "Move Count words from Source to Destination",
      ["Destination - address of WORD array to receive values", "Source - address of WORD array to be copied", "Count - the number of WORDs to be copied"],
    ],
    longmove: [
      "LONGMOVE(Destination, Source, Count)",
      "Move Count longs from Source to Destination",
      ["Destination - address of LONG array to receive values", "Source - address of LONG array to be copied", "Count - the number of LONGs to be copied"],
    ],
    bytefill: [
      "BYTEFILL(Destination, Value, Count)",
      "Fill Count bytes starting at Destination with Value",
      ["Destination - address of BYTE array to receive values", "Value - 8-bit value", "Count - the number of BYTEs to be filled"],
    ],
    wordfill: [
      "WORDFILL(Destination, Value, Count)",
      "Fill Count words starting at Destination with Value",
      ["Destination - address of WORD array to receive values", "Value - 16-bit value", "Count - the number of WORDs to be filled"],
    ],
    longfill: [
      "LONGFILL(Destination, Value, Count)",
      "Fill Count longs starting at Destination with Value",
      ["Destination - address of LONG array to receive values", "Value - 32-bit value", "Count - the number of LONGs to be filled"],
    ],
  };

  private _tableSpinStringMethods: { [Identifier: string]: TMethodTuple } = {
    strsize: ["STRSIZE(Addr) : Size", "Count bytes of zero-terminated string at Addr", ["Addr - address of zero-terminated string"], ["Size - the string length, not including the zero"]],
    strcomp: [
      "STRCOMP(AddrA,AddrB) : Match",
      "Compare zero-terminated strings at AddrA and AddrB",
      ["AddrA - address of zero-terminated string", "AddrB - address of zero-terminated string"],
      ["Match - return TRUE (-1) if match or FALSE (0) if not"],
    ],
    strcopy: [
      "STRCOPY(Destination, Source, Max)",
      "Copy a zero-terminated string of up to Max characters from Source to Destination. The copied string will occupy up to Max+1 bytes, including the zero terminator",
      ["Destination - address of place to put string copy", "Source - address of zero-terminated string to be copied", "Max - maximum number of bytes of string to copy (less the terminator)"],
    ],

    getcrc: [
      "GETCRC(BytePtr, Poly, Count) : CRC",
      "Compute a CRC of Count bytes starting at BytePtr using a custom polynomial of up to 32 bits",
      ["BytePtr - address of source byte array", "Poly - the 32-bit polynomial to be used", "Count - number of bytes in the source byte array"],
      ["CRC - the 32-bit computed CRC value"],
    ],
  };

  private _tableSpinStringBuilder: { [Identifier: string]: string[] } = {
    // NOTE: this does NOT support signature help! (paramaters are not highlighted for signature help due to variant forms for string() being allowed)
    string: [
      'STRING("Text",13) : StringAddress',
      "Compose a zero-terminated string (quoted characters and values 1..255 allowed), return address of string<br><br>@param `listOfElements` - a comma separated list of elements to be built into a string (quoted characters and values 1..255 allowed)<br>@returns `StringAddress` - address of where string was placed in ram",
    ],
  };

  private _tableSpinIndexValueMethods: { [Identifier: string]: string[] } = {
    // NOTE: this does NOT support signature help! (paramaters are not highlighted for signature help due to ':' being param separater)
    lookup: [
      "LOOKUP(Index: ExpressionList) : Value",
      "Lookup value (values and ranges allowed) using 1-based index, return value (0 if index out of range)<br><br>" +
        "@param `Index` - an expression indicating the position of the desired value in ExpressionList<br>" +
        "@param `ExpressionList` - a comma-separated list of expressions. Quoted strings of characters are also allowed; they are treated as a comma-separated list of characters<br>" +
        "@returns `Value` - the value found (or 0 if index out of range)<br>",
    ],
    lookupz: [
      "LOOKUPZ(Index: ExpressionList) : Value",
      "Lookup value (values and ranges allowed) using 0-based index, return value (0 if index out of range)<br><br>" +
        "@param `Index' -  is an expression indicating the position of the desired value in ExpressionList<br>" +
        "@param `ExpressionList' - a comma-separated list of expressions. Quoted strings of characters are also allowed; they are treated as a comma-separated list of characters<br>" +
        "@returns `Value` - the value found (or 0 if index out of range)<br>",
    ],
    lookdown: [
      "LOOKDOWN(Value: ExpressionList) : Index",
      "Determine 1-based index of matching value (values and ranges allowed), return index (0 if no match)<br><br>" +
        "@param `Value' - is an expression indicating the value to find in ExpressionList<br>" +
        "@param `ExpressionList' - a comma-separated list of expressions. Quoted strings of characters are also allowed; they are treated as a comma-separated list of characters<br>" +
        "@returns `Index` - the index found (or 0 if no match for value in list)<br>",
    ],
    lookdownz: [
      "LOOKDOWNZ(Value: ExpressionList) : Index",
      "Determine 0-based index of matching value (values and ranges allowed), return index (0 if no match)<br><br>" +
        "@param `Value' - is an expression indicating the value to find in ExpressionList<br>" +
        "@param `ExpressionList' - a comma-separated list of expressions. Quoted strings of characters are also allowed; they are treated as a comma-separated list of characters<br>" +
        "@returns `Index` - the index found (or 0 if no match for value in list)<br>",
    ],
  };

  private _tableSpinControlFlowMethods: { [Identifier: string]: string[] } = {
    abort: [
      "ABORT [ErrorCode]",
      "Instantly return, from any depth of nested method calls, back to a base caller which used '\\' before the method name. A single return value can be conveyed from the abort point back to the base caller",
    ],
    return: ["RETURN [Value[, Value[,...]]]", "Return zero or more values from a PUB/PRI method."],
  };

  public isSpinBuiltinMethod(name: string): boolean {
    const nameKey: string = name.toLowerCase();
    let reservedStatus: boolean = nameKey in this._tableSpinHubMethods;
    if (!reservedStatus) {
      reservedStatus = nameKey in this._tableSpinPinMethods;
      if (!reservedStatus) {
        reservedStatus = nameKey in this._tableSpinTimingMethods;
        if (!reservedStatus) {
          reservedStatus = nameKey in this._tablePAsmInterfaceMethods;
          if (!reservedStatus) {
            reservedStatus = nameKey in this._tableSpinMathMethods;
            if (!reservedStatus) {
              reservedStatus = nameKey in this._tableSpinMemoryMethods;
              if (!reservedStatus) {
                reservedStatus = nameKey in this._tableSpinStringMethods;
                if (!reservedStatus) {
                  reservedStatus = nameKey in this._tableSpinStringBuilder;
                  if (!reservedStatus) {
                    reservedStatus = nameKey in this._tableSpinIndexValueMethods;
                    if (!reservedStatus) {
                      reservedStatus = nameKey in this._tableSpinControlFlowMethods;
                    }
                  }
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
      let methodDescr: TMethodTuple = ["", "", []];
      if (nameKey in this._tableSpinHubMethods) {
        desiredDocText.category = "Hub Method";
        methodDescr = this._tableSpinHubMethods[nameKey];
      } else if (nameKey in this._tableSpinPinMethods) {
        desiredDocText.category = "Pin Method";
        methodDescr = this._tableSpinPinMethods[nameKey];
      } else if (nameKey in this._tableSpinTimingMethods) {
        desiredDocText.category = "Timing Method";
        methodDescr = this._tableSpinTimingMethods[nameKey];
      } else if (nameKey in this._tablePAsmInterfaceMethods) {
        desiredDocText.category = "PAsm Interface Method";
        methodDescr = this._tablePAsmInterfaceMethods[nameKey];
      } else if (nameKey in this._tableSpinMathMethods) {
        desiredDocText.category = "Math Method";
        methodDescr = this._tableSpinMathMethods[nameKey];
      } else if (nameKey in this._tableSpinMemoryMethods) {
        desiredDocText.category = "Memory Method";
        methodDescr = this._tableSpinMemoryMethods[nameKey];
      } else if (nameKey in this._tableSpinStringMethods) {
        desiredDocText.category = "String Method";
        methodDescr = this._tableSpinStringMethods[nameKey];
      } else if (nameKey in this._tableSpinStringBuilder) {
        desiredDocText.category = "String Method";
        protoWDescr = this._tableSpinStringBuilder[nameKey];
      } else if (nameKey in this._tableSpinIndexValueMethods) {
        desiredDocText.category = "Hub Method";
        protoWDescr = this._tableSpinIndexValueMethods[nameKey];
      } else if (nameKey in this._tableSpinControlFlowMethods) {
        desiredDocText.category = "Control Flow Method";
        protoWDescr = this._tableSpinControlFlowMethods[nameKey];
      }
      if (methodDescr[0].length != 0) {
        desiredDocText.signature = methodDescr[0];
        desiredDocText.description = methodDescr[1];
        if (methodDescr[2] && methodDescr[2].length > 0) {
          desiredDocText.parameters = methodDescr[2];
        }
        if (methodDescr[3] && methodDescr[3].length > 0) {
          desiredDocText.returns = methodDescr[3];
        }
      } else if (protoWDescr.length != 0) {
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

  public isP2AsmReservedSymbols(name: string): boolean {
    const reservedPAsmSymbolNames: string[] = ["org", "orgf", "orgh", "fit", "end"];
    const reservedStatus: boolean = reservedPAsmSymbolNames.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
  }

  private _tableClockConstants: { [Identifier: string]: string } = {
    _clkfreq: "Selects XI/XO-crystal-plus-PLL mode, assumes 20 MHz crystal",
    _xtlfreq: "Selects XI/XO-crystal mode and frequency",
    _xinfreq: "Selects XI-input mode and frequency",
    _rcslow: "Selects internal RCSLOW oscillator which runs at ~20 KHz",
    _rcfast: "Selects internal RCFAST oscillator which runs at 20 MHz+",
  };

  private _tableClockSpinSymbols: { [Identifier: string]: string } = {
    clkmode_: "The compiled clock mode, settable via HUBSET",
    clkfreq_: "The compiled clock frequency",
  };

  private _tableClockSpinVariables: { [Identifier: string]: string } = {
    clkmode: "The current clock mode, located at LONG[$40]. Initialized with the 'clkmode_' value",
    clkfreq: "The current clock frequency, located at LONG[$44]. Initialized with the 'clkfreq_' value",
  };

  private _docTextForSpinClockVars(name: string): IBuiltinDescription {
    const nameKey: string = name.toLowerCase();
    let desiredDocText: IBuiltinDescription = { found: false, type: eBuiltInType.Unknown, category: "", description: "", signature: "" };
    if (nameKey in this._tableClockConstants) {
      desiredDocText.description = this._tableClockConstants[nameKey];
      desiredDocText.type = eBuiltInType.BIT_CONSTANT;
    } else if (nameKey in this._tableClockSpinSymbols) {
      desiredDocText.description = this._tableClockSpinSymbols[nameKey];
      desiredDocText.type = eBuiltInType.BIT_SYMBOL;
    } else if (nameKey in this._tableClockSpinVariables) {
      desiredDocText.description = this._tableClockSpinVariables[nameKey];
      desiredDocText.type = eBuiltInType.BIT_VARIABLE;
    }
    if (desiredDocText.type != eBuiltInType.Unknown) {
      desiredDocText.category = "Clock";
      desiredDocText.found = true;
    }
    return desiredDocText;
  }

  public isP2AsmReservedWord(name: string): boolean {
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

  public isP2AsmInstruction(name: string): boolean {
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
      "getct",
      "getnib",
      "getptr",
      "getqx",
      "getqy",
      "getrnd",
      "getrnd",
      "getscp",
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

  public isP1AsmInstruction(name: string): boolean {
    // mark these RED if seen in P2 code
    const p1asmInstructions: string[] = [
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
    const instructionStatus: boolean = p1asmInstructions.indexOf(name.toLowerCase()) != -1;
    return instructionStatus;
  }

  public isP1AsmVariable(name: string): boolean {
    // mark these RED if seen in P2 code
    const p1asmVariables: string[] = [
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
    const instructionStatus: boolean = p1asmVariables.indexOf(name.toLowerCase()) != -1;
    return instructionStatus;
  }

  public isP2AsmNonArgumentInstruction(name: string): boolean {
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

  public isIllegalInlinePAsmDirective(name: string): boolean {
    const illegalInlinePAsmDirective: string[] = ["alignw", "alignl", "file", "orgh"];
    const illegalStatus: boolean = illegalInlinePAsmDirective.indexOf(name.toLowerCase()) != -1;
    return illegalStatus;
  }

  public isP1AsmConditional(name: string): boolean {
    let returnStatus: boolean = false;
    if (name.length >= 2) {
      const checkType: string = name.toUpperCase();
      if (checkType == "NR" || checkType == "WR" || checkType == "IF_ALWAYS" || checkType == "IF_NEVER") {
        returnStatus = true;
      }
    }
    return returnStatus;
  }

  public isP2AsmConditional(name: string): boolean {
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

  public isDatOrPAsmLabel(name: string): boolean {
    let haveLabelStatus: boolean = name.substr(0, 1).match(/[a-zA-Z_\.\:]/) ? true : false;
    if (haveLabelStatus) {
      if (this.isDatNFileStorageType(name)) {
        haveLabelStatus = false;
      } else if (name.toUpperCase() == "DAT") {
        haveLabelStatus = false;
      } else if (this.isIllegalInlinePAsmDirective(name)) {
        // these can't be label either!
        haveLabelStatus = false;
      } else if (this.isP2AsmReservedSymbols(name)) {
        haveLabelStatus = false;
      } else if (name.toUpperCase().startsWith("IF_") || name.toUpperCase() == "_RET_") {
        haveLabelStatus = false;
      } else if (this.isP2AsmConditional(name)) {
        haveLabelStatus = false;
      } else if (this.isP2AsmNonArgumentInstruction(name)) {
        haveLabelStatus = false;
      } else if (this.isP2AsmInstruction(name)) {
        haveLabelStatus = false;
      } else if (this.isP1AsmConditional(name)) {
        haveLabelStatus = false;
      } else if (this.isP1AsmInstruction(name)) {
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
    bytefit: "like BYTE for use in DAT sections, but verifies BYTE data are -$80 to $FF",
    wordfit: "like WORD for use in DAT sections, but verifies word data are -$8000 to $FFFF",
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
