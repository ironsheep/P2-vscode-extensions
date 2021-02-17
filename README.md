# Parallax Propeller 2 vscode support

![Project Maintenance][maintenance-shield]

[![License][license-shield]](LICENSE)

VSCode support for the Propeller languages: Spin2 and Pasm2 for the [Parallax Inc.](https://parallax.com) Propeller 2 [P2 or P2X8C4M64P](https://propeller.parallax.com/p2.html). The P2 community thrives in the [P2 Forums](https://forums.parallax.com/categories/propeller-2-multicore-microcontroller)

## Features
- Syntax Highlighting for both Spin2 and Pasm2 including all Streamer and Smart Pin Symbols
- File Navigation
- Works with your favorite VSCode themes
- Offers companion Themes (orginal and my development theme)

### Up next
- Build and download support (using external compiler and download tool) - *Still figuring this out*

*These are all arriving over time and not yet fully functional.*

## INSTALLATION into VSCODE

The primary means to install the spin2 extension(s) into vscode with be thru the Marketplace but we are not there yet.

For the time being if you downloaded the .vsix.zip from our [Propeller 2 Forum thread](https://forums.parallax.com/discussion/170068/visual-studio-code-editor-for-p1-amp-p2-spin-amp-pasm#latest) then skip to the next section "**Load Extention into vscode**".

If you don't have the latest .vsix.zip file then visit the [Releases Page](https://github.com/ironsheep/P2-vscode-extensions/releases) and download the latest .vsix.zip file from there.

### Load Extension into vscode

Now that you have downloaded the .vsix.zip file simply unzip it to get the .vsix file.

Open a Command window (on linux, macos, rpi open a terminal window) and cd to the directory containing this file. 

Execute this command:

```bash
code --install-extension {filename}.vsix
```

*(replacing {filename} with the name of your file, of course.)*

After restarting VSCode you should be ready to start editing spin2 code.  Enjoy!

NOTE: to activate one of the experimental themes distributed with this extension using Ctl-K Ctl-T (on macos Cmd-K, Cmd-T) and select "Spin2 Ironsheep" or "Spin2 Cluso99".  Of course, your favorte themes should work as well.

---

This repository contains two subprojects. Each of which are vscode extensions:

- SPIN2 and PASM2 syntax Highlighting and code navigation [spin2](./spin2) - *Builds*
- SPIN1 and PASM1 syntax highlighting [spin1](./spin1) - *DOES NOT BUILD*

*Each of these two are self contained and package their own extension but spin1 will be migrated into spin2 shortly*

---

> If you like my work and/or this has helped you in some way then feel free to help me out for a couple of :coffee:'s or :pizza: slices! 
> 
> [![coffee](https://www.buymeacoffee.com/assets/img/custom_images/black_img.png)](https://www.buymeacoffee.com/ironsheep)


## Credits

Ray [Cluso99] in our [Propeller 2 Forums](https://forums.parallax.com/categories/propeller-2-multicore-microcontroller) which started this effort for us.

Patrick (GitHub [Entomy](https://github.com/Entomy)) for a spin1 extension which helped me get further along with this one.

## License

Copyright © 2020 Iron Sheep Productions, LLC. All rights reserved.<br />
Licensed under the MIT License. <br>
<br>
Follow these links for more information:

### [Copyright](copyright) | [License](LICENSE)



[maintenance-shield]: https://img.shields.io/badge/maintainer-S%20M%20Moraco%20%40ironsheepbiz-blue.svg?style=for-the-badge

[license-shield]: https://camo.githubusercontent.com/bc04f96d911ea5f6e3b00e44fc0731ea74c8e1e9/68747470733a2f2f696d672e736869656c64732e696f2f6769746875622f6c6963656e73652f69616e74726963682f746578742d646976696465722d726f772e7376673f7374796c653d666f722d7468652d6261646765
