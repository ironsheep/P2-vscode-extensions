# Spin2/Pasm2 Syntax highlighting and Code Navigaion for VSCode

This Extension is in development. Things may not totally work correctly. See _Support_, below, for how to report issues.

## ABOUT

This extension provides support for Spin2 and Pasm2, the primary languages for programming the [Parallax Propeller2 or P2X8C4M64P](https://propeller.parallax.com/p2.html)

## Feature: Code Outline

The code outline for .spin2 files works as follows:

- Shows All Sections CON, OBJ, VAR, DAT
- Section name is shown in outline, except:
- If section name is following by {comment} then name and comment will be shown in outline
- For PUB and PRI the method name, parameters and return values are shown

_Hint:_ Configure the OUTLINE panel to "Sort by Position" to reflect the order in your source code.

## Known Issues

We are working on fixes to the following issues we've seen during our testing. However, they are not major enough to prevent this release.

- Some line comments are not properly colored
- Multiple return values are not properly colored

## Reporting Issues

An active list of issues is maintained at github. [P2-vscode-support/Issues](https://github.com/ironsheep/P2-vscode-support/issues). When you want to report something missing, not working right, or even request a new feature please submit an issue. By doing so you will be able to track progress against the request and learn of the new version containing your fix/enhancement when it is available.
