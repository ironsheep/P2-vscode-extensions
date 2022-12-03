# P1 and P2 Syntax highlighting and Code Navigation for VSCode

This Extension is continually in development. Things may not totally work correctly. See _Support_, below, for how to report issues.

## ABOUT

This extension provides support for P1 (spin and pasm) along with P2 (Spin2 and Pasm2), the primary languages for programming P1 [Parallax Propeller 1 or P8X32A](https://www.parallax.com/propeller-1/) and the P2 [Parallax Propeller2 or P2X8C4M64P](https://propeller.parallax.com/p2.html)

## Feature: Syntax Highlighting

Both Spin and Pasm are now completely supported for the P1 while Spin2 and Pasm2 are completely supported for the P2 - including streamer and smartpins constants

## Feature: Semantic Highlighting

P1 Spin/Pasm along with P2 Spin2/Pasm2 are fully supported and will be improving over future releases.
See the **[ChangeLog](https://github.com/ironsheep/P2-vscode-extensions/blob/main/spin2/CHANGELOG.md)** for detailed status.

## Feature: Code Outline

The code outline for .spin and .spin2 files works as follows:

- Shows All Sections CON, OBJ, VAR, DAT, PUB, PRI
- Section name is shown in outline, except:
  - If section name is following by `{comment}` (or `' comment`) then name and comment will be shown in outline
  - For PUB and PRI the method name, parameters and return values are shown

_Hint:_ Configure the OUTLINE panel to `"Sort by Position"` to reflect the order in your source code.

## Feature: Tab-stop support à la Propeller Tool

(Initial Tabbing Feature contributed by **Jay B. Harlow**)

- Unique tab stops per section: CON, OBJ, VAR, DAT, PUB, PRI
- Global default has tabstops as defined by Propeller Tool v2.7.0 except +3 more tabstops for PUB, PRI (at 12, 14, and 16)
- Uses DAT tabbing for in-line pasm (pasm within PUB, PRI blocks)
- Place cursor on line and press `TAB` or `Shift-TAB` to indent or outdent the text
- Place cursor on line and press `Ctrl+Alt+Tab` to generate tab location comment
- Supports the InsertMode operations à la Propeller Tool (*INSERT / OVERTYPE / ALIGN modes*) see [Insert Mode for Spin/Spin2](https://github.com/ironsheep/P2-vscode-extensions/blob/main/InsertMode.md) for more detailed info on this InsertMode feature.


## Possible Conflicts with other VSCode Extensions

**NOTE1:** *This extension now replaces the [Spin by Entomy](https://marketplace.visualstudio.com/items?itemName=Entomy.spin) vscode extension. While either can be used, this version provides more comprehensive Syntax highlighting (as the former has not been maintained) and this extension adds full Semantice Highlighting, Outlining and Tab support with InsertModes.* The `Spin` extension can be **uninistalled** with no loss of functionality.

**NOTE2:** *I'll be submitting pull requests to the Overtype extension maintainer to add code for avoiding interferrance with our .spin/.spin2 InsertMode feature but in the meantime please ensure that the [Overtype by Adma Maras](https://marketplace.visualstudio.com/items?itemName=adammaras.overtype) and/or [Overtype by DrMerfy](https://marketplace.visualstudio.com/items?itemName=DrMerfy.overtype) extensions are disabled or uninstalled as they can interfere with this extensions' behavior.*

## Known Issues

We are working on fixes to the following issues we've seen during our testing. However, they are not major enough to prevent this release.

- We are still working through validating the P1 support against the full P1 obex - this is a work in progress
- **Align mode** needs to do special things for [Delete] and [Backspace] - this is not working yet.
- Some line comments are not properly colored
- Occasionally [byte|word|long] storage types are not properly colored
- Occasionally some pasm code escapes coloring.  We're trying to understand this.
- Ocassionally the syntax highlighting will just stop working for the final lines in a file. This appears to be a VSCode issue. But we are monitoring it.

*These appear to be mostly syntax recognizer issues*

## Reporting Issues

An active list of issues is maintained at github. [P2-vscode-extensions/Issues](https://github.com/ironsheep/P2-vscode-extensions/issues). When you want to report something missing, not working right, or even request a new feature please submit an issue. By doing so you will be able to track progress against the request and learn of the new version containing your fix/enhancement when it is available.
