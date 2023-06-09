# Change Log

All notable changes to the "spin2 syntax highlighting & code navigation" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for reminders on how to structure this file. Also, note that our version numbering adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Work to appear in upcoming releases:

- Work on fixes to any reported issues
- Add tabbing to user defined tabstops as found in Propeller Tool

Possible next additions:

- Add Hover popups for `PUB` and `PRI` method signature (help text)
- Add Hover popups for pasm instructions (help text for each instruction)
- Update theme to work better with a couple common languages we use near our P2 projects (e.g., Python)
- Investigate and possibly add unique coloring for method pointers
- Add spin2 instruction templates as Snippets (_for instructions with two or more parameters_)
- Add new-file templates as Snippets
- Add additional Snippets as the community identifies them

## [1.8.9] 2023-05-16

- Attempt to deconflict TAB key with editor pop-ups

## [1.8.8] 2023-03-27

Minor Semantic updates for P2

- P2 Add parsing/highlight of new 'field' accessor
- P2 Fix highlight of short variable names within line (offset to var was incorrect)
- P2 Fix highlight of spin-builtin names within debug() lines

## [1.8.7] 2023-02-16

Minor Semantic fixes for P1 and P2

- P1/P2 Repair detection/highlight of OBJ statements with no whitespace around colon
- P2 Add parsing/highlight of new constant override syntax in OBJ section (partial, more to do in syntax parsing)

## [1.8.6] 2023-01-05

Minor Semantic fixes for P1 and P2

- P1 Repair detection/highlight of multi-line doc comments
- P2 highlight PUB/PRI P1 signatures (without parens) as NEED porting! (color them RED)

## [1.8.5] 2023-01-05

Minor Semantic/Outline fixes for P1

- Repair parsing of PUB/PRI method names (fix distraction by comment content)
- Repair parsing of object constants being used as array length specification
- Repair double-entries of PUB/PRI names in P1 Outline

## [1.8.4] 2023-01-05

Minor Outline adjustments for P1 and P2

- Repair parsing of long(...) code -- recognize long when adjacent paren. (issue #14)
- Move global labels under their enclosing DAT section, creating more descriptive outline hierarchy (issue #13)

## [1.8.3] 2023-01-04

Minor Syntax/Semantic recognizer update - Adds help for porting p1 code to p2

- Syntax P1 & P2: Recognize nested {} and {{}} comments
- Semantic P2: if () missing after a method name (mark it as unknown - RED -> error)
  - NOTE: we can't do this for "object method calls" until we have a full language server. (It's coming!)
- Semantic P2: If () missing after a spin built-in method name (mark it as unknown - RED -> error)
- Semantic P2: Flag P1 specific variables, mnemonics, methods as RED -> error so we know what needs conversion to P2

## [1.8.2] 2023-01-02

Minor Outline/Navigation update for P1

- Add global Pasm labels to outline
- This finishes the delivery of showing Global Labels within the outline for both P1 and P2

## [1.8.1] 2022-12-26

Minor Outline/Navigation update for P2

- Add global Pasm labels to outline

## [1.8.0] 2022-12-23

Add [optional] FlexSpin preprocessor support (P1 & P2), Repair semantic highlight (P2)

- Add new extension setting to enable recognition of FlexSpin Preprocessor Directives (Default: disabled)
- Adds flagging of Preprocessor directive lines as unknown when FlexSpin support is not enabled
- Fix P2 recognition of _RET_ directive in Pasm2
- Fix P2 recognition of built-in \_set, \_clr variables in Pasm2
- Fix P1 & P2 recognition of constants when assignment uses #> and <# operators

## [1.7.8] 2022-12-22

Minor tabbing update

- Ensure `org`, `asm` and `end`, `endasm` lines use PUB/PRI tabstops
- Ensure Deconflict "Tab" with "Tab to Autocomplete"
- Adjust auto-closing pairs behavior (dialing things in slowly)

## [1.7.7] 2022-12-17

Minor tabbing update

- `end` and `endasm` are now positioned using **In-line Pasm** tabstops
- Corrected delete (left/Right) behavior in Align edit mode
- Cursor now positions as expected after TAB / SHIFT+TAB (this didn't work before)

**NOTE**: _originally released as v1.7.6 which failed to codesign and had to be re-released_

## [1.7.5] 2022-12-16

Minor highlighting update

- Add offset color for local vs. global pasm labels
- Detect and Flag invalid local pasm label syntax version: pasm1 vs. pasm2
- Correct backspace behavior (no longer removes more than one character)

## [1.7.4] 2022-12-13

Minor highlighting update

- Constant declarations are now identified correctly
- Spin builtin methods are now identified so other themes can render them better

## [1.7.3] 2022-12-09

Minor update to Extension Settings

- Add Named TAB configurations (select between `Propeller Tool`, `IronSheep` or your own custom `User1` tabs)
- The extension default is `Propeller Tool`
- The `IronSheep` configuration is derived from Propeller Tool but realigned to "tabstop: 4" (every 4 spaces)

## [1.7.2] 2022-12-07

Update Spin highlighting (syntax and/or semantic parser fixes)

- Spin: Recognize label or data declaration on DAT line
- Spin: Recognize non-float decimal numbers with exponents

Update Spin2 highlighting (syntax and/or semantic parser fixes)

- Spin2: Recognize label or data declaration on DAT line
- Spin2: Recognize non-float decimal numbers with exponents
- Spin2: Recognize `debug_main` and `debug_coginit` compile time directives
- Spin2: Recognize event names in pasm2 correctly
- Spin2: Fix cases where `debug` used without parenthesis causes extension crash
- Spin2: Recognize coginit constants (some pasm2 cases were being missed)
- Spin2: Add recognition of LutColors directive in debug statements with run-time terminal assignment
- Spin2: Recognize `modcz` operand constants

### - Known Issues w/v1.7.2

- We haven't yet learned how to control the ending position of the edit cursor. So in many cases when using selection, not an insert point, the cursor may end up not being where you might expect it to be after pressing TAB or Shift+TAB. We are looking into how to solve this. Even tho' this problem exists the formatting ability this new service provides is well worth this minor headache. We will keep looking for a means to get this under control.
- The single-quote comment (now only on debug statements) is being handled by the semantic (vs. syntactic) parser this is causing external VSCode extensions to do brace, parenthesis, and bracket paring to be marked within trailing line comments on debug lines
- Syntax highlight of DAT section sometimes fails... (although it is less often now...)
- Semantic highlight: the 'modification' attribute is being over-applied, should use more than := as test!!!!
- _I'm sure there are more issues..._

## [1.7.1] 2022-12-05

Update to keyboard mapping: All key mapping now reenabled and Align mode now fully functional

- Fixed: Backspace and Delete now working correctly in Align Mode
- Fixed: Oops, now all keymapping is working. (When clause was set to enable for spin and spin2 but killed everything instead)
- [F11] key is now assigned as an alternate in case you don't have an [Insert] key (or Fn+Enter is not working)

### - Known Issues w/v1.7.1

- We haven't yet learned how to control the ending position of the edit cursor. So in many cases when using selection, not an insert point, the cursor may end up not being where you might expect it to be after pressing TAB or Shift+TAB. We are looking into how to solve this. Even tho' this problem exists the formatting ability this new service provides is well worth this minor headache. We will keep looking for a means to get this under control.
- The single-quote comment (now only on debug statements) is being handled by the semantic (vs. syntactic) parser this is causing external VSCode extensions to do brace, parenthesis, and bracket paring to be marked within trailing line comments on debug lines
- Syntax highlight of DAT section sometimes fails... (although it is less often now...)
- Semantic highlight: the 'modification' attribute is being over-applied, should use more than := as test!!!!

## [1.7.0] 2022-12-02

Fun Update! First release of two **NEW** features and more.

- **NEW** P1 support for .spin files (full syntax and semantic highlighting of the P1 language: spin/pasm)
- **NEW** Add InsertMode support: [Insert|Overwrite|Align]
- More changes to tabbing behavior, we're gradually dialing it in
- P2 Syntax/Semantic highlighting changes - adds support for:
  ● New Spin2 'GETCRC(dataptr,crcpoly,bytecount) method
  ● New Spin2 'STRCOPY(destination,source,maxsize)' method
  ● DEBUG display BITMAP now validates 'SPARSE color'
  ● GRAY, in addition to GREY, now recognized as a color in DEBUG displays

### - Known Issues w/v1.7.0

- We need to get Backspace and Delete working correctly when in InsertMode:Align - it's coming, hopefully soon.
- We haven't yet learned how to control the ending position of the edit cursor. So in many cases when using selection not an insert point the cursor may end up not being where you might expect it to be after pressing TAB or Shift+TAB. We are looking into how to solve this. Even tho' this problem exists the formatting ability this new service provides is well worth this minor headache. We will keep looking for a means to get this under control.
- The single-quote comment (now only on debug statements) is being handled by the semantic (vs. syntactic) parser this is causing external VSCode extensions to do brace, parenthesis, and bracket paring to be marked within trailing line comments on debug lines
- Syntax highlight of DAT section sometimes fails... (although it is less often now...)
- Semantic highlight: the 'modification' attribute is being over-applied, should use more than := as test!!!!

## [1.6.1] 2022-11-29

Minor update to the formal release (_clean up muli-line behavior, clean up in-line pasm support._)

- NEW: Fixes detection of in-line pasm by now treating `end` correctly and reverting to PUB/PRI tab use after the `end` statement
- NEW: Adds support for `asm` and `endasm` **FlexSpin** in-line pasm keywords
- NEW: adds 3 more tab stops for spin2 code in `PUB` and `PRI` (at 12, 14, at 16)
- Adjusts: the multiline selection behavior for `TAB` and `Shift+TAB` has changed to treating each line individually.

### - Known Issues w/v1.6.1

- We haven't yet learned how to control the ending position of the edit cursor. So in many cases when using selection not an insert point the cursor may end up not being where you might expect it to be after pressing TAB or Shift+TAB. We are looking into how to solve this. Even tho' this problem exists the formatting ability this new service provides is well worth this minor headache. We will keep looking for a means to get this under control.
- The single-quote comment (now only on debug statements) is being handled by the semantic (vs. syntactic) parser this is causing external VSCode extensions to do brace, parenthesis, and bracket paring to be marked within trailing line comments on debug lines
- Syntax highlight of DAT section sometimes fails... (although it is less often now...)
- Semantic highlight: the 'modification' attribute is being over-applied, should use more than := as test!!!!

## [1.6.0] 2022-11-28

First formal release - Update for tabbing. Now operates according to latest Spec.

- NEW: adds use of DAT tabbing for PUB/PRI inline-pasm

- Supports configurable tab-stops-per-section like Propeller Tool.
- Adds support for single-line indent/outdent
- Adds support for multi-line indent/outdent
- Adds command `Ctrl+Alt+Tab` which inserts a current tabs placement comment as a line above the cursor
- This TAB support **Spin2 Elastic Tab Stops** provides two new settings:
  - **Spin2 Elastic Tab Stops**:`Blocks`: is where the tab stops are listed for each section
  - **Spin2 Elastic Tab Stops**:`Enable`: checkbox which is by default NOT enabled</br>(_As this is an early release this feature is not enabled by default. You must enable and then restart vscode_)
  - These settings are global but can be edited and made custom per project as well

### - Known Issues w/v1.6.0

- We haven't yet learned how to control the ending postion of the edit cursor. So in many cases when using selection not single insert point the cursor may end up not being where you might expect it to be after pressing TAB or Shift+TAB. We are looking into how to solve this. Even tho' this problem exists the formatting ability this new service provides is well worth this minor headache. We will keep looking for a means to get this under control.

## [1.5.2] 2022-11-19

Bugifx Update - Extension Tabbing-Disable now works! (Oops!)

## [1.5.1] 2022-11-16

Minor Update - Release without DEBUG output enabled. (otherwise same as v1.5.0)

## [1.5.0] 2022-11-16

Feature Update - add TAB support according to traditional spin2 custom tab-stops (Propeller Tool like)

New Tabbing Support:

- Supports configurable tab-stops-per-section like Propeller Tool.
- Adds support for single-line indent/outdent
- Adds support for multi-line indent/outdent
- Adds new command `Ctrl+Alt+Tab` which inserts a current tabs placement comment as a line above the cursor
- This TAB support **Spin2 Elastic Tab Stops** provides two new settings:
  - **Spin2 Elastic Tab Stops**:`Blocks`: is where the tab stops are listed for each section
  - **Spin2 Elastic Tab Stops**:`Enable`: checkbox which is by default NOT enabled</br>(_As this is an early release this feature is not enabled by default. You must enable and then restart vscode_)
  - These settings are global but can be edited and made custom per project as well

### - Known Issues w/v1.5.0

- The new TAB support does not adhere to `INSERT/OVERTYPE/ALIGN` modes (will in a later release)
- The single-quote comment (now only on debug statements) is being handled by semantic (vs. syntactic) parser this is causing external VSCode extensions to do brace, parenthesis, and bracket paring to be marked within trailing line comments on debug lines
- Syntax highlight of DAT section sometimes fails... (although it is less often now...)
- Semantic highlight: the 'modification' attribute is being over-applied, should use more than := as test!!!!
- _I'm sure there are more issues..._

## [1.4.1] 2022-09-17

### Various Highlight fixes and better single-line comment processing

- BUGFIX: (#8) Now correctly recognize assignments within enum declarations
- BUGFIX: (#5) Most of the single-line comments are once again recognized during syntax recognition the remaining exception is when comments following debug() statements
- Now recognize the use of spin2 unary and binary operators within constant assignments
- Fixed a number of small highlight problems: (1) (local variables were not recognized in spin statements), (2) occasionally some comments were processed as spin statements

### - Known Issues w/v1.4.1

- The single-quote comment (now only on debug statements) is being handled by semantic (vs. syntactic) parser this is causing external VSCode extensions to do brace, parenthesis, and bracket paring to be marked within trailing line comments on debug lines
- Syntax highlight of DAT section sometimes fails... (although it is less often now...)
- Semantic highlight: the 'modification' attribute is being over-applied, should use more than := as test!!!!
- _I'm sure there are more issues..._

## [1.3.9] 2022-08-08

### Minor Highlight fix for unrecognized symbol

- BUGFIX: (#6) correct internal misspelling of X_4P_4DAC1_WFBYTE symbol.

### - Known Issues w/v1.3.9

- The single-quote comment now being handled as semantic (vs. syntactic) is causing external VSCode extensions to do brace, parenthesis, and bracket paring to be marked within our trailing line comments. _We have don't have a fix for this yet._
- Syntax highlight of DAT section sometimes fails... (although it is less often now...)
- Semantic highlight: the 'modification' attribute is being over-applied, should use more than := as test!!!!
- _I'm sure there are more issues..._

## [1.3.8] 2022-08-08

### Minor semantic pasm highlight fixes

- BUGFIX (#7) - Fix highlighting in pasm statements when using operators with constants. (added missing detection of =,?,:,!, and ^ pasm operators as defined in pasm language manual)

### - Known Issues w/v1.3.8

- The single-quote comment now being handled as semantic (vs. syntactic) is causing external VSCode extensions to do brace, parenthesis, and bracket paring to be marked within our trailing line comments. _We have don't have a fix for this yet._
- Syntax highlight of DAT section sometimes fails... (although it is less often now...)
- Semantic highlight: the 'modification' attribute is being over-applied, should use more than := as test!!!!
- _I'm sure there are more issues..._

## [1.3.7] 2022-05-05

### Miscellaneous semantic highlight fixes

- Fix highlighting of multiple same-name constants in con declaration
- Fix highlighting of variable and method names in debug() statements
- Fix highlighting of constant names in case statements with a constant range as match case
- Fix highlighting of org constant name as the offset
- Fix highlighting of constant names in complex constant assignment

### - Known Issues w/v1.3.7

- The single-quote comment now being handled as semantic (vs. syntactic) is causing external VSCode extensions to do brace, parenthesis, and bracket paring to be marked within our trailing line comments. _We have don't have a fix for this yet._
- Syntax highlight of DAT section sometimes fails... (although it is less often now...)
- Semantic highlight: the 'modification' attribute is being over-applied, should use more than := as test!!!!
- _I'm sure there are more issues..._

## [1.3.6] 2022-04-22

### Improve debug() highlight methods and named operators correctly - misc fixes

- NEW single-quote comments on section name (DAT, VAR, OBJ, and CON) lines now show up in the outline (was just brace comments)
- Now highlights method names and named operators within debug() statements
- Improved number, number-base recognition
- Improved highlighting of array sizes when multiple arrays are declared on single line
- Improved highlighting of array-of-objects declaration
- Finally addresses the "Occasional issues with highlighting of enum leading constant"

### - Known Issues w/v1.3.6

- The single-quote comment now being handled as semantic (vs. syntactic) is causing external VSCode extensions to do brace, parenthesis, and bracket paring to be marked within our trailing line comments. _We have don't have a fix for this yet._
- Syntax highlight of DAT section sometimes fails... (although it is less often now...)
- Semantic highlight: the 'modification' attribute is being over-applied, should use more than := as test!!!!
- _I'm sure there are more issues..._

## [1.3.5] 2022-04-20

### Improve debug() single quote string parsing and misc. fixes

- Don't flag keywords within single quote strings
- Recognize float operators in more locations
- Recognize debug methods in more correct manner

### - Known Issues w/v1.3.5

- The single-quote comment now being handled as semantic (vs. syntactic) is causing external VSCode extensions to do brace, parenthesis, and bracket paring to be marked within our trailing line comments. _We have don't have a fix for this yet._
- Syntax highlight of DAT section sometimes fails... (although it is less often now...)
- Semantic highlight: the 'modification' attribute is being over-applied, should use more than := as test!!!!
- Occasional issues with highlighting of enum leading constant (#nnn should be recognized as number)
- _I'm sure there are more issues..._

## [1.3.4] 2022-04-16

### Improve debug()-display Highlight for new style with single-quoted strings

- Fix case where there are multiple `() sets in one string

### - Known Issues w/v1.3.4

- The single-quote comment now being handled as semantic (vs. syntactic) is causing external VSCode extensions to do brace, parenthesis, and bracket paring to be marked within our trailing line comments. _We have don't have a fix for this yet._
- Syntax highlight of DAT section sometimes fails... (although it is less often now...)
- Semantic highlight: the 'modification' attribute is being over-applied, should use more than := as test!!!!
- Occasional issues with highlighting of enum leading constant (#nnn should be recognized as number)
- _I'm sure there are more issues..._

## [1.3.2] 2022-04-04

### Improve debug()-display Highlight for older style with double-quoted strings

- Fix highlighting of debug() statements containing double-quoted strings
- Fix object references in DAT-PASM and debug() statements containing double-quoted strings
- Fix highlight of comments starting with '' (two single-quotes)

### - Known Issues w/v1.3.2

- The single-quote comment now being handled as semantic (vs. syntactic) is causing external VSCode extensions to do brace, parenthesis, and bracket paring to be marked within our trailing line comments. _We have don't have a fix for this yet._
- Syntax highlight of DAT section sometimes fails... (although it is less often now...)
- Semantic highlight: the 'modification' attribute is being over-applied, should use more than := as test!!!!
- Occasional issues with highlighting of enum leading constant (#nnn should be recognized as number)
- _I'm sure there are more issues..._

## [1.3.1] 2022-03-31

### Finish debug()-display Highlight and Validation

- Adds new directive support for validating debug() display lines which use runtime display names
- Fix highlighting of debug() statements within in-line pasm
- Fix label on ORG directive
- Fix highlighting of ORGH directive

### NOTEs v1.3.1

- this adds support for the new Spin2 Extension directive:
  - {-_ VSCode-Spin2: nextline debug()-display: {displayType} _-}
  - Where: {displayType} should be one of [Logic, Scope, Scope_XY, FFT, Spectro, Plot, Term, Bitmap, and Midi]
- The following **runtime forms** can now be handled by preceeding them with this new directive:
  - debug(**\`zstr\_(displayName)** lutcolors `uhex*long_array*(image_address, lut_size))
  - debug(**\`lstr\_(displayName, len)** lutcolors `uhex*long_array*(image_address, lut_size))
  - debug(**\`#(letter)** lutcolors `uhex*long_array*(image_address, lut_size))

### - Known Issues w/v1.3.1

- The single-quote comment now being handled as semantic (vs. syntactic) is causing external VSCode extensions to do brace, parenthesis, and bracket paring to be marked within our trailing line comments. _We have don't have a fix for this yet._
- Syntax highlight of DAT section sometimes fails... (although it is less often now...)
- Semantic highlight: the 'modification' attribute is being over-applied, should use more than := as test!!!!
- Occasional issues with highlighting of enum leading constant (#nnn should be recognized as number)
- _I'm sure there are more issues..._

## [1.3.0] 2022-03-29

Initial Release of debug()-display **Highlight** and **Validation**

- NEW add initial highlighting support for all debug() displays (Logic, Scope, Scope_XY, FFT, Spectro, Plot, Term, Bitmap, and Midi)
- Unique colors within debug statement for: displayType, displayName, keywords, and colors
- Validation: when a keyword is not legal for the display or is spelled incorrectly then is colored bright red
- Moved single comment out of syntax into semantic highlighting so we can have single-quoted strings in our debug statements. (_Syntax highlighting is not context aware, so entire tail of a debug() statement was incorectly rendered as a comment_)

### Initial limitations v1.3.0

- The runtime calulation of display name is not supported, yet. (_In an upcoming release you'll be able to specify the preferred display type for validation of each of these statements._)
- The following **example runtime forms** will be handled by the new directive when released:
  - debug(**\`zstr\_(displayName)** lutcolors `uhex*long_array*(image_address, lut_size))
  - debug(**\`lstr\_(displayName, len)** lutcolors `uhex*long_array*(image_address, lut_size))
  - debug(**\`#(letter)** lutcolors `uhex*long_array*(image_address, lut_size))

### - Known Issues w/v1.3.0

- The single-quote comment now being handled as semantic (vs. syntactic) is causing external VSCode extensions to do brace, parenthesis, and bracket paring to be marked within our trailing line comments. _We have don't have a fix for this yet._
- Syntax highlight of DAT section sometimes fails... (although it is less often now...)
- Semantic highlight: the 'modification' attribute is being over-applied, should use more than := as test!!!!
- Occasional issues with highlighting of enum leading constant (#nnn should be recognized as number)
- _I'm sure there are more issues..._

## [1.2.3] 2022-03-16

Minor Highlighting Update

- Repair highlighting of float operators used in spin2
- Repair coloring of constant names used in array declarations
- Minor update to debug() statements: (1) allow in pasm, (2) don't flag unknown names within debug()
- Repair recognition of org on DAT lines

### - Known Issues w/v1.2.3

- debug() statements that don't use double-quoted strings currently are not parsed correctly
- Syntax highlight of DAT section sometimes fails... (although it is less often now...)
- Semantic highlight: the 'modification' attribute is being over-applied, should use more than := as test!!!!
- Occasional issues with highlighting of enum leading constant (#nnn should be recognized as number)
- _I'm sure there are more issues..._

## [1.2.2] 2022-02-17

Minor Highlighting Update - Repair highlighting of binary operators in DAT data declarations
(missed a case, fixed now)

### - Known Issues w/v1.2.2

- debug() statements that don't use double-quoted strings currently are not parsed correctly
- Syntax highlight of DAT section sometimes fails... (although it is less often now...)
- Semantic highlight: the 'modification' attribute is being over-applied, should use more than := as test!!!!
- Occasional issues with highlighting of enum leading constant (#nnn should be recognized as number)
- _I'm sure there are more issues..._

## [1.2.1] 2022-02-16

Minor Highlighting Update - Repair highlighting of binary operators in DAT data declarations

### - Known Issues w/v1.2.1

- debug() statements that don't use double-quoted strings currently are not parsed correctly
- Syntax highlight of DAT section sometimes fails... (although it is less often now...)
- Semantic highlight: the 'modification' attribute is being over-applied, should use more than := as test!!!!
- Occasional issues with highlighting of enum leading constant (#nnn should be recognized as number)
- _I'm sure there are more issues..._

## [1.2.0] 2022-02-09

Highlighting Update - Bugfixes and Catch up with Spin2 Language updates inclu. new DEBUG methods and constants

Syntax/Semantic Adjustments:

- NEW: add new Spin2/Pasm2/Debug methods & constants which were added since our last release
- NEW: directives that shouldn't be used in inline-pasm are now highlighted with bright red color
- BUGFIX: parser no longer expects pasm2 labels to be in the 1st column
- BUGFIX: added missing: four pasm if\_ conditionals, one spin2 method name
- BUGFIX: parser now parses multiplying of constant values correctly
- BUGFIX: previously seen files no longer affect the semantic highlighting of the current file
- BUGFIX: symbol-names starting with PUB, PRI, CON, DAT, etc. are no longer confusing parser
- BUGFIX: RES and FIT coloring is working

### - Known Issues w/v1.2.0

- debug() statements that don't use double-quoted strings currently are not parsed correctly
- Syntax highlight of DAT section sometimes fails... (although it is less often now...)
- Semantic highlight: the 'modification' attribute is being over-applied, should use more than := as test!!!!
- Occasional issues with highlighting of enum leading constant (#nnn should be recognized as number)
- _I'm sure there are more issues..._

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

### - What's new in v0.3.3

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

### - What's new in v0.3.2

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

### - What's new in v0.3.1

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
