# Change Log

All notable changes to the "spin2 syntax highlighting & code navigation" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for reminders on how to structure this file. Also, note that our version numbering adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Work to appear in upcoming releases:

- Add support for "debug() statements NOT using strings" - new debug() shorthand support
- Investigate and possibly add unique coloring for method pointers
- work on fixes to any reported issues

Possible next additions:

- Add new-file templates as Snippets
- Add additional Snippets as the community identifies them

## [1.1.0] 2021-05-19

Minor update to fix incorrect highlighting

Semantic Adjustments:

- BUGFIX: correct highlighting of debug() functions in DAT section pasm code

### - Known Issues w/v1.1.0

- debug() statements that don't use double-quoted strings currently are not parsed correctly
- Syntax highlight of DAT section sometimes fails... RES and FIT not colored correctly
- Semantic highlight: the 'modification' attribute is being over-applied, should use more than := as test!!!!
- _I'm sure there are more issues..._

## [1.0.1] 2021-03-30

Minor update to fix missing things

Syntax Adjustments:

- BUGFIX: add missing `recv` symbol support

### - Known Issues w/v1.0.1

- debug() statements that don't use double-quoted strings currently are not parsed correctly
- Syntax highlight of DAT section sometimes fails... RES and FIT not colored correctly
- Semantic highlight: the 'modification' attribute is being over-applied, should use more than := as test!!!!
- _I'm sure there are more issues..._

## [1.0.0] 2021-03-18

The Official Release of Semantic Highlighting

In this release we clean things up a bit more, we deliver unknown name highlighting in brighter red, and **herein** we report on the state of testing against various code-sets.

**NOTE:** _with this new **unknown names** coloring feature we were able to find two files that shouldn't compile due to undefined symbols but actually do compile. The findings are being reported to Chip. The author of the files confirmed that the two files are missing symbols._

Semantic Adjustments:

- NEW FEATURE! **Unknown names** in the file are now highlighted with noticable bright red
- BUGFIX: pasm - repaired variable/label hightlight when short names
- BUGFIX: by default the compiler treats the first lines in the file as being in CON, this highlighter does now as well.
- BUGFIX: recognize round(), float(), and trunc() in DAT, CON and PUB/PRI
- BUGFIX: built-in constants should now be colored correctly

Syntax Adjustments:

- BUGFIX: adjusted built-in symbol recognition, now independent of case
- BUGFIX: added missing, newly added to PNut, `DEBUG_*` variables

### - Known Issues w/v1.0.0

- Syntax missing `recv` symbol (but has `send`)
- debug() statements that don't use double-quoted strings currently can't be parsed
- Syntax highlight of DAT section sometimes fails... RES and FIT not colored correctly
- Semantic highlight: the 'modification' attribute is being over-applied, should use more than := as test!!!!
- _I'm sure there are more issues..._

### REPORT: Source code shipped with PNut

- **LIMITATIONs**: all highlighting is working with the exception of:
- FILE `Spin2_interpreter.spin2` - breaks the syntax highlighter, but the sematic highlighter works.
- (meaning pasm instruction names, built-in names, conditions, etc. are not highlighted)
- All files with debug() statements that don't use double-quoted strings can't be parsed correctly

### REPORT: Source code shipped in P2 OBEX

- For all P2 Obex files, highlighting is working with the exception of:
- FILE `Parktransformation.spin2` I'm checking the Chip as to why this is.

## [0.3.4] 2021-03-17

5th Release of Semantic Highlighting

This adds quoted-string avoidance when looking for names and their use.

Theme Adjustments:

- Darkened storage type color slightly.

Semantic Adjustments:

- BUGFIX Spin: now ignores contents of strings
- BUGFIX Spin: debug() statements should now be parsing correctly

Syntax Adjustments:

- BUGFIX removed invalid instruction `pinc` (older form of pinclear, no longer legal)
- BUGFIX added recognition of `BYTE|WORD|LONG` within spin statements

### - Known Issues w/v0.3.4

- debug() statements that don't use double-quoted strings just can't be parsed
- Pasm: doesn't recognize round(), float(), and trunc() as pasm operand
- Incorrectly colors **built-in** constants (should be own color)
- Syntax highlight of DAT section sometimes fails... RES and FIT not colored correctly
- Semantic highlight: the 'modification' attribute is being over-applied
- Semantic highlight: the 'modification' attribute should use more than := as test!!!!
- _I'm sure there are more issues..._

## [0.3.3] 2021-03-16

4th Release of Semantic Highlighting

This represents a noticeable cleanup of parsing most existing code.

### - What's new

Theme Adjustments:

- Removed `Spin2 Cluso99` theme (by request)
- Added `Spin2 Ironsheep Syntax` theme (primarily for extension developer use, disables Semantic highlighting)

**Note**: _Should you wish, you can switch between the two ironsheep themes to show code with or without semantic highlighting_

Semantic Adjustments:

- Update: VAR declarations - parses all examples in spin2 doc
- Update: CON declarations - parses all examples in spin2 doc
- Update: parses all examples shipped with PNut (less `Spin2_interpreter.spin2`)
- Update: now parses most of the P2 OBEX cleanly... still more to do tho'
- NEW: if variables are used but not (yet?) defined they'll be shown in RED
- BUGFIX: no longer marking vars within `{ }` single line comments
- BUGFIX: now handles multi-line enum declarations
- BUGFIX: now handles comma-delimited constant assignments
- BUGFIX: most if not all embedded assignment (e.g., `until ((b := rxcheck()) >= 0)`) now correct
- BUGFIX: most if not all shorter variable highlight is now working
- BUGFIX: multiple assignment LHS of := now highlighted correctly

Syntax Adjustments:

- BUGFIX improved variable index recognition - missing fewer of them now...
- ENHANCEMENT added floating point number recognition
- BUGFIX improved number recognition - recognizes asll examples in spin2 doc
- BUGFIX add missing `clkfreq_`, `_clkfreq` constant
- BUGFIX add missing `FVAR`, `FVARS` overrides
- BUGFIX add missing `REG`, `AND` operators
- BUGFIX add missing spin built-ins `getms()`, `QSIN()`, `QCOS()`, `PINC()`
- BUGFIX adjusted pub/pri to allow space before open paren

### - Known Issues w/v0.3.3

- Pasm: doesn't recognize round(), float(), and trunc() as pasm operand
- Spin: Badly handles strings (should be ignoring contents of them)
- Incorrectly colors **built-in** constants (should be own color)
- Fails to parse some debug() statements correctly
- Syntax highlight of DAT section sometimes fails... RES and FIT not colored correctly
- Semantic highlight: the 'modification' attribute is being over-applied
- Semantic highlight: the 'modification' attribute should use more than := as test!!!!
- _I'm sure there are more issues..._

## [0.3.2] 2021-03-12

3rd Release of Semantic Highlighting

This represents an overall improvement in parsing when there is less whitespace between things

### - What's new

Semantic Fixes:

- BUGFIX spin is not case-sensitive... adjust so highlighting is also not!
- Decision: not fixing: Does not handle the .label (local-scoped pasm labels) properly
  - works well enough to highlight properly

Syntax Fixes:

- BUGFIX add missing `posx` and `negx` spin2 constants

### - Known Issues w/v0.3.2

- Spin: Badly handles single line { comment }: see's names in them, no good
- Spin: Badly handles strings (should be ignoring contents of them)
- Spin: Badly handles marking multiple vars LHS of assignment
- Incorrectly colors **built-in** constants (should be own color)
- Fails to parse some debug() statements correctly
- Does NOT handle multi-line enum declarations
- Does NOT handle comma-delimited constant assignment
- Fails to properly identify location of shorter variable name when is found within longer name earler in line...
- Syntax highlight of DAT section sometimes fails... RES and FIT not colored correctly
- Semantic highlight: the 'modification' attribute is being over-applied
- Semantic highlight: the 'modification' attribute should use more than := as test!!!!
- _I'm sure there are more issues..._

## [0.3.1] 2021-03-09

2nd Release of Semantic Highlighting

### - What's new

- Theme: Entire theme moved to pastel-like colors, less shocking, closer to commercial quality

- Spin2: Added Semantic Highlighting support for PASM

Semantic Fixes:

- BUGFIX recognize comma separated var declarations (names after first name)
- BUGFIX Repaired identification of constant assignment from constant of external object
- BUGFIX cleaned up couple of minor OUTLINE issues (false detections, missing comments)
- BUGFIX recognize range-value symbols in case statement (e.g., SEG_TOP..SEG_BOTTOM:)
- BUGFIX repair recognizer for assignment LHS: (eg., `byte[pColor][2] := {value}`)
- BUGFIX identify storage types in method's local variable list
- BUGFIX recognize method calls to indexed objects
- BUGFIX recognize data init from external constant in DAT section
- BUGFIX correctly highlight symbol when NOT(!) used: `!maskBitsBGR`
- BUGFIX correctly highlight address var of: `byte[@msgPwm][3] := frameASCII`

Syntax Fixes:

- BUGFIX add recognition of 'FILE' include operator in DAT sections
- BUGFIX repair decimal number recognition (was falsely including [+|-] prefix)

### - Known Issues w/v0.3.1

- Pasm: Does not handle the .label (local-scoped pasm labels) properly (:labels for P1, . for P2)
- Spin: Badly handles strings (should be ignoring contents of them)
- Spin: Badly handles marking multiple vars LHS of assignment
- Incorrectly colors **built-in** constants (should be own color)
- Fails to parse some debug() statements correctly
- Does NOT handle multi-line enum declarations
- Does NOT handle comma-delimited constant assignment
- Fails to properly identify location of shorter variable name when is found within longer name earler in line...
- Syntax highlight of DAT section sometimes fails... RES and FIT not colored correctly
- Semantic the 'modification' attribute is being over-applied
- Oops spin is not case-sensative... I need to adjust so highlighting is also not!
- _I'm sure there are more issues..._

## [0.3.0] 2021-03-07

Preview Release of Semantic Highlighting

- Spin2: Initial Semantic Highlighting support (partial: Spin only, no Pasm)
- Syntax Highlight BUGFIX: stop falsely recognizing 'or' within symbol name
- Syntax Highlight BUGFIX: stop falsely recognizing numbers within symbol name
- DECISION: we won't add FIXME/TODO highlighting as there is an extension for that!

### - Known Issues w/v0.3.0

- Pasm: Does not handle the .label (local-scoped pasm labels) properly
- Spin: Badly handles strings (should be ignoring contents of them)
- Spin: Fails to correctly highlight symbol when NOT used `!maskBitsBGR`
- Spin: Fails to correctly highlight address var of `byte[@msgPwm][3] := frameASCII`
- Fails to recognize comma separated var declarations (misses names after first)
- Fails to recognize data init from external constant in DAT section
- Incorrectly colors **built-in** constants
- Fails to identify storage types in local variable list of method
- Fails to parse some debug() statements correctly
- Misses some symbols in constant declarations
- PASM code not processed at all (in DAT or in PRI/PUB inline)
- Does NOT handle multi-line enum declarations
- Does NOT handle comma-delimited constant assignment
- Does NOT recognize method calls to indexed objects
- Fails to properly identify location of shorter variable name when is found within longer name earler in line...
- Syntax highlight of DAT section sometimes failes... RES and FIT not colored correctly
- _I'm sure there are more issues..._

## [0.2.2] 2020-11-30

### Minor update

- Spin2: Added missing named operators

## [0.2.1] 2020-11-25

### Minor repairs

- Spin2: Added "not" operator
- Spin2: Removed escape sequence recognizer so that strings would highlight correctly

## [0.2.0] 2020-11-07

### Spin2 and Pasm2 are now complete

- Spin2: Added 105 smart pin symbols
- Spin2: Added 78 streamer mode symbols
- Spin2: Added missing AKPIN instru.
- Spin2: Added 24 COG-REGISTER symbols, fixed classification of 3 variables and 1 instru.
- Pasm2: Completely rebuilt the Pasm2 instructions each group seperately labelled
- Pasm2: Added 105 smart pin symbols
- Pasm2: Added 78 streamer mode symbols
- Pasm2: Added 24 COG-REGISTER symbols
- Pasm2: Added missing clock variables

## [0.1.2] 2020-11-06

- Works with many of your favorite theme
- (Ships with my test theme: "Spin2 IronSheep", and the "Spin2 Cluso99" theme which still needs to have my changes backported)
- Add Outline support for file navigation
- Nearly all of spin2 language core is in place (less operators)
- Nearly all of debug() related methods are place (less "if(condition)" as the "if" is not unique in this case)
- Symbols for Events and Interrupt sources in place
- Most of pasm2 (lots still to verify)
- Two draft themes are in place

## [0.1.1] 2020-11-04 (internal only)

- Internal build testing packaging
- Converted to new content arrangement as exhibited by [entomy](https://github.com/Entomy)'s work

## [0.1.0] 2019-04-22

- Initial files published by Cluso99 in [P2 forum post](https://forums.parallax.com/discussion/170068/visual-studio-code-editor-for-p1-p2-spin-pasm/p1)
