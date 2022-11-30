# Insert Modes for Spin/Spin2 VSCode Extensions


![Project Maintenance][maintenance-shield]
[![License][license-shield]](LICENSE) 


Recreation of [Parallax Propeller Tool](https://www.parallax.com/package/propeller-tool-software-for-windows-spin-assembly-2/) Insert Modes: Overtype, Insert, and Align for VSCode

## Features

Adds an overtype mode to vscode based editors, plus a couple of bells and whistles.

### Basic Insert Mode Usage

The Insert Mode support for Spin/Spin2 provides three modes: Overtype, Insert and Align.

The aptly named **Overtype mode** allows one to type over and replace existing characters in one's text editor. The most common scenario for overtype mode is when it's activated by accident by an unsuspecting user who can't figure out why the computer is eating all the words they already typed.

To rotate through all insert modes, press the `Insert` key. If you don't have an `Insert` key, you can press `Fn+Enter` (on Mac). As an alternative you can also click on the Insert/Overtype/Align label to rotate through the insert modes.

If, instead, you wish to toggle back and forth between the Insert and Align modes only, press `Ctrl+Shift+I` (on Windows and Linux) or `Cmd+Shift+I` (on Mac)

If you don't care for these keybindings, you can customize them in your Keyboard Shortcuts preferences; just set your own bindings:

| Default Key binding | Description |
| --- | --- |
|`Insert` (on Windows and Linux) </br>`Fn+Enter` (on Mac) | `spin.insertMode.rotate`:</br>Rotate thru: Insert -> Overtype -> Align -> and back to Insert...
|`Ctrl+Shift+I` (on Windows and Linux) </br>`Cmd+Shift+I` (on Mac) | `spin.insertMode.toggle`:</br>Rotate thru: Insert -> Align -> and back to Insert...


### Visual Demo: Overtype vs. Insert modes

![Basic demo](DOCs/demo-basic.gif)

### Settings: Global or per-editor

It's bad enough that you have to keep track of that damn overtype indicator at the bottom of the window... but you want to have a separate overtype setting for *each editor?*

Fine.

```json
"overtype.perEditor": true
```

> Sets the insert/overtype mode per editor.

### Settings: Overtype Paste behavior

If you want to enable "Hard Mode", you can turn on overtype paste mode. This setting applies overtype behavior to when you paste text into your editor. Here are the rules:

- If you paste part of a line of text into another line of text, the clipboard contents will overwrite characters until it's done pasting, unless it hits the end of the line first, in which case it'll just extend that line.
- If you already have some text selected when you paste, that text will *always* be overwritten, even if the contents of the clipboard are smaller.
- If you paste some multiline text into a line of text, everything left on that line will be overwritten with the first line of the pasted text, and the remaining pasted lines will be inserted below that line.
- If you cut or copy using vscode's feature that grabs the entire line when you don't have anything selected, pasting that line will overwrite the *entire* line that you're pasting on.

Some additional tips for using overtype paste:

- Don't forget your Undo shortcut(s).
- I know this doesn't work like [insert editor here]. Every single freaking editor handles overtype paste differently. It's not my fault.
- If you think you have a saner way to handle this, for the love of everything warm and cuddly, [MAKE A PULL REQUEST](https://github.com/DrMerfy/vscode-overtype/pulls).

Without further ado...

```json
"overtype.paste": true
```

> When in overtype mode, uses overtype behavior when pasting text.

### Settings: Status Bar indicators (abbreviated, localized or none)

Horizontal screen space at a premium? Have too many things in your status bar already?
Turned your monitor sideways because somebody told you it would increase your productivity by at least 23%?
Or simply want to match the language to the general UI?
Don't worry, we've got just the setting for you!

```json
"overtype.labelInsertMode": "",
"overtype.labelOvertypeMode": "Ovr"
"overtype.labelAlignMode": "Aln"
```

> Shows an abbreviated overtype status (`Ovr`) in the status bar if active, an abbreviated align status (`Aln`) in the status bar if activ and nothing for the "normal" insert mode.

```json
"overtype.labelInsertMode": "",
"overtype.labelOvertypeMode": ""
"overtype.labelAlignMode": ""
```

> Disable showing the insert mode status in the status bar completely.

### Settings: Overtype cursor style

You can change the overtype cursor style from the preferences.
Set the `overtype.secondaryCursorStyle` to either one of:

- line
- line-thin
- block
- block-outline
- underline
- underline-thin

e.g.

```json
"overtype.secondaryCursorStyle": "underline"
```

> Sets the overtype cursor style.</br>
> Default: block

### Settings: Align cursor style

You can change the align cursor style from the preferences.
Set the `overtype.ternaryCursorStyle` to either one of:

- line
- line-thin
- block
- block-outline
- underline
- underline-thin

e.g.

```json
"overtype.ternaryCursorStyle": "underline"
```

> Sets the align cursor style.</br>
> Default: underline

## Contributing

How can you contribute?

- [**Open an issue**](https://github.com/DrMerfy/vscode-overtype/issues) if you found a problem.
- [**Make a pull request**](https://github.com/DrMerfy/vscode-overtype/pulls) if you fixed a problem!

> Make sure to run `npm run lint` before pushing

## Release notes

There's a [`CHANGELOG.md`](https://github.com/DrMerfy/vscode-overtype/blob/master/CHANGELOG.md) file.

## License

Copyright © 2022 Iron Sheep Productions, LLC. All rights reserved.<br />
Licensed under the MIT License. <br>
<br>
Follow these links for more information:

### [Copyright](copyright) | [License](LICENSE)


[maintenance-shield]: https://img.shields.io/badge/maintainer-stephen%40ironsheep%2ebiz-blue.svg?style=for-the-badge

[license-shield]: https://camo.githubusercontent.com/bc04f96d911ea5f6e3b00e44fc0731ea74c8e1e9/68747470733a2f2f696d672e736869656c64732e696f2f6769746875622f6c6963656e73652f69616e74726963682f746578742d646976696465722d726f772e7376673f7374796c653d666f722d7468652d6261646765

