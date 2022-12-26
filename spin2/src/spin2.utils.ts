"use strict";
// src/spin2.utils.ts

export class ParseUtils {
  public getNonCommentLineRemainder(startingOffset: number, line: string): string {
    let nonCommentRHSStr: string = line;
    //this._logMessage('  -- gnclr ofs=' + startingOffset + '[' + line + '](' + line.length + ')');
    // TODO: UNDONE make this into loop to find first ' not in string
    if (line.length - startingOffset > 0) {
      //this._logMessage('- gnclr startingOffset=[' + startingOffset + '], startingOffset=[' + line + ']');
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
      //this._logMessage('- gnclr startingOffset=[' + startingOffset + '], currentOffset=[' + currentOffset + ']');
      nonCommentRHSStr = line.substr(currentOffset, nonCommentEOL - currentOffset + 1).trim();
      //this._logMessage('- gnclr nonCommentRHSStr=[' + startingOffset + ']');

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
    //    this._logMessage('  -- NCLR line [' + line.substr(startingOffset) + ']');
    //    this._logMessage('  --           [' + nonCommentRHSStr + ']');
    //}
    return nonCommentRHSStr;
  }

  public removeDoubleQuotedStrings(line: string, showDebug: boolean = true): string {
    //this._logMessage('- RQS line [' + line + ']');
    let trimmedLine: string = line;
    //this._logMessage('- RQS line [' + line + ']');
    const doubleQuote: string = '"';
    let quoteStartOffset: number = 0; // value doesn't matter
    let didRemove: boolean = false;
    while ((quoteStartOffset = trimmedLine.indexOf(doubleQuote)) != -1) {
      const quoteEndOffset: number = trimmedLine.indexOf(doubleQuote, quoteStartOffset + 1);
      //this._logMessage('  -- quoteStartOffset=[' + quoteStartOffset + '] quoteEndOffset=[' + quoteEndOffset + ']');
      if (quoteEndOffset != -1) {
        const badElement = trimmedLine.substr(quoteStartOffset, quoteEndOffset - quoteStartOffset + 1);
        //this._logMessage('  -- badElement=[' + badElement + ']');
        trimmedLine = trimmedLine.replace(badElement, "#".repeat(badElement.length));
        didRemove = showDebug ? true : false;
        //this._logMessage('-         post[' + trimmedLine + ']');
      } else {
        break; // we don't handle a single double-quote
      }
    }

    //if (didRemove) {
    //    this._logMessage('  -- RQS line [' + line + ']');
    //    this._logMessage('  --          [' + trimmedLine + ']');
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
      } else if (this.isPasmNonArgumentInstruction(name)) {
        haveLabelStatus = false;
      }
    }
    return haveLabelStatus;
  }

  public isDatNFileStorageType(name: string): boolean {
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
    let returnStatus: boolean = false;
    if (name.length > 5) {
      const checkType: string = name.toUpperCase();
      if (checkType == "ALIGNL" || checkType == "ALIGNW") {
        returnStatus = true;
      }
    }
    return returnStatus;
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
      "pa",
      "pb",
      "clkfreq",
      "_clkfreq",
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
      "_rcfast",
      "_rcslow",
      "_xinfreq",
      "_xtlfreq",
    ];
    const reservedStatus: boolean = pasmReservedswordsOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
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

  public isIllegalInlinePasmDirective(name: string): boolean {
    const illegalInlinePasmDirective: string[] = ["alignw", "alignl", "file", "orgh"];
    const illegalStatus: boolean = illegalInlinePasmDirective.indexOf(name.toLowerCase()) != -1;
    return illegalStatus;
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

  public isSpinBuiltInVariable(name: string): boolean {
    const spinVariablesOfNote: string[] = [
      "clkmode",
      "clkfreq",
      "varbase",
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
    let reservedStatus: boolean = spinVariablesOfNote.indexOf(name.toLowerCase()) != -1;
    return reservedStatus;
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
}
