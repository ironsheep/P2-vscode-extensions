# Change Log

All notable changes to the "spin2 syntax highlighting & code navigation" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for reminders on how to structure this file. Also, note that our version numbering adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Work to appear in upcoming releases:

- Add watching/build/download
- working on fixes to known issues

Possible next additions:

- Adding operators so they can be colored is harder... so, not right away...
- Add detection of FIXME:, TODO: - Highlight and show in Outline
- Add Semantic Hightlighting - consistently color names whereever they appear
- (this includes parameters, return values, local variables, method names, etc.)
- Add new-file templates as Snippets
- Add additional Snippets as the community identifies them

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
