# Change Log

All notable changes to the "spin2 syntax highlighting & code navigation" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for reminders on how to structure this file. Also, note that our version numbering adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Work to appear in upcoming releases:

- Finish 1st draft of Semantic Highlight by adding inline and non-inline pasm support
- Finish Semantic Highlight of debug() statements
- working on fixes to known issues

Possible next additions:

- Adding operators so they can be colored is harder... so, not right away...
- Add new-file templates as Snippets
- Add additional Snippets as the community identifies them

## [0.3.3] 2021-03-??
4th Release of Semantic Highlighting

This represents further improvement in parsing

### - What's new

Theme adjustments:

- Removed `Spin2 Cluso99` theme (by request)
- Added `Spin2 Ironsheep Syntax` theme (primarily for extension developer use, disables Semantic highlighting)

**Note**: *Sould you wish, you can switch between the two ironsheep themes to show code with/without semantic highlighting*

Semantic Fixes:

- VAR declaration updates - parses all examples in spin2 doc
- CON declaration updates - parses all examples in spin2 doc

Syntax Fixes:

- BUGFIX improved variable index recognition - missing fewer of them now...
- BUGFIX improved number recognition - recognizes all examples in spin2 doc
- ENHANCEMENT added floating point number recognition
- BUGFIX add missing `clkfreq_` constant

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
- *I'm sure there are more issues...*

## [0.3.2] 2021-03-12
3rd Release of Semantic Highlighting

This represents an overall improvement in parsing when there is less whitespace between things

### - What's new

Semantic Fixes:

- BUGFIX spin is not case-sensitive... adjust so highlighting is also not!
- Decision: not fixing: Does not handle the .label (local-scoped pasm labels) properly
    -   works well enough to highlight properly

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
- *I'm sure there are more issues...*


## [0.3.1] 2021-03-09
2nd Release of Semantic Highlighting

### - What's new

- Theme: Entire theme moved to pastel-like colors, less shocking, closer to commercial quality

- Spin2: Added Semantic Highlighting support for PASM

Semantic Fixes:

- BUGFIX recognize comma separated var declarations (names after first name)
- BUGFIX Repaired identification of constant assignment from constant of external object 
- BUGFIX cleaned up couple of minor OUTLINE issues (false detections, missing comments)
- BUGFIX recognize range-value symbols in case statement (e.g., SEG\_TOP..SEG_BOTTOM:)
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
- *I'm sure there are more issues...*


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
- *I'm sure there are more issues...*

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
