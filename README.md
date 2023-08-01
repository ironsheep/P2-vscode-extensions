# Parallax Propeller 2 VSCode support

![Project Maintenance][maintenance-shield]
[![License][license-shield]](LICENSE) 
[![Release][Release-shield]](https://github.com/ironsheep/P2-vscode-extensions/releases) 
[![GitHub issues][Issues-shield]](https://github.com/ironsheep/P2-vscode-extensions/issues)

**Spin2 Extension**: 
[![Version][marketplace-version]](https://marketplace.visualstudio.com/items?itemName=ironsheepproductionsllc.spin2) 
[![Installs][marketplace-installs]](https://marketplace.visualstudio.com/items?itemName=ironsheepproductionsllc.spin2) 
[![Ratings][marketplace-rating]](https://marketplace.visualstudio.com/items?itemName=ironsheepproductionsllc.spin2)

VSCode support for the Propeller languages: Spin2 and Pasm2 for the [Parallax Inc.](https://parallax.com) Propeller 2 [P2 or P2X8C4M64P](https://propeller.parallax.com/p2.html) along with Spin and Pasm support for the Propeller 1.  The P2 and P1 communities thrive in the [P2 Forums](https://forums.parallax.com/categories/propeller-2-multicore-microcontroller) and the [P1 Forums](https://forums.parallax.com/categories/propeller-1-multicore-microcontroller)

The **P2 Forum Thread** containing discussion of [this VSCode support](https://forums.parallax.com/discussion/170068/visual-studio-code-editor-for-p1-p2-spin-pasm#latest)

## Features
- Full support for both P1 (spin/pasm) and P2 (spin2/pasm2) languages
- P2 Support:
   - **P2: Syntax and Semantic Highlighting** for both Spin2 and Pasm2 including all Streamer and Smart-pin Symbols as well as all debug() statements with parameter validation for all display types
   - **P2: Show Hovers Feature** Hovers show information about the symbol/object that's below the mouse cursor. In our case this is for both user written code and for Spin2 built-ins.
   - **P2: Signature Help Feature** As you are typing a method name show signature help for both user written methods and for Spin2 built-in methods.
- P1 Support:
   - **P1: Syntax and Semantic Highlighting** for both Spin and Pasm
   - **P1: Show Hovers Feature** Hovers show information about the symbol/object that's below the mouse cursor. In our case this is for both user written code and for Spin built-ins.
   - **P1: Signature Help Feature** As you are typing a method name show signature help for both user written methods and for Spin built-in methods.
- **Object Public interface documentation generation** via keystroke [Ctrl+Alt+d], doc opens on right side of editor
- **Doc-Comment Generation** for PUB and PRI methods via keystroke [Ctrl+Alt+c] - Ctrl+Alt+( c )omment. <br>- Comment is inserted immediately below the PUB or PRI line.
- Editor **Screen Coloring** support per section à la Parallax **Propeller Tool**
- **Custom tabbing** Tab-stop support per section à la Parallax **Propeller Tool**
- **Tab Sets** You can choose between `Propeller Tool`, `IronSheep`, and `User1` (*adjust in settings to make your favorite set*)
- File navigation from **Outline View**
- File navigation from **Object Hierarchy View**
- **Edit Mode** support à la Parallax **Propeller Tool** [Insert, Overtype and Align]
- Provides rich companion themes for use with non-color backgrounds or with colored backgrounds as well as Syntax only theme (mostly used during semantic highlighting development

### Up next
We are working to routinely add features to this extension for the next month or two.  The hover support for P2 just arrived, here the next updates in the works:

- Improve Hover support for P2

These are not yet definate but I'm:

- Looking into providing a full spin/spin2 language server. This would allow all files in the project to contribute symbols, not just the current file being edited
- Looking into adding a setting to our extension allowing one to change a "PNut Enable Debug" setting which would be used when building with on windows with PNut
- Looking into developing a Task Provider (to be built into our extension) which would recognize the tools installed and the OS and then provide only the tasks appropriate for the OS with the tools installed.


### Future directions

- Task Provider - *studies the current environment and offers to write the tasks for a given P2 project*
- Spin2/Pasm2 code formatter/beautifier - *allows us to have standard formatting for code we share! (source code could be formatted on each file save)*
- Snippets for Spin2/Pasm2 (common code sequences which can be added easily to file being edited (e.g., smart pin setup code for given mode/use)
- Possible Extension Package for P2 (would include all P2 specific extensions)

## Installation

In VSCode search for the "spin2" extension and install it.  It's that easy!  After installation you will be notified to download and install a new version as new versions are released.

**Note:** This extension replaces the [Spin by Entomy](https://marketplace.visualstudio.com/items?itemName=Entomy.spin) vscode extension. While either can be used, our version provides more comprehensive Syntax highlighting (as the former has not been maintained) and this extension adds full Semantic Highlighting, Outlining, and Tab support with InsertModes, Document generation, etc. The older Spin extension can now be uninstalled with no loss of functionality.

## VSCode Environment

There are additional companion documents in this Repository:

1. [Configuring User Tasks - Windows](TASKS-User-win.md) which advises on how to automate your P2 Development when using VScode on **Windows**
2. [Configuring User Tasks - MacOS](TASKS-User-macOS.md) which advises on how to automate your P2 Development when using VScode on **macOS**
3. [Configuring User Tasks - Windows|MacOS|RPI](TASKS-User.md) which advises on how to automate your P2 Development when using VScode on **any of the supported platforms**
4. [VSCode Extensions](EXTENSIONS.md) we find useful in our own P2 development
5. [Visual Examples - Tabbing](TAB-VisualEx.md) a visual explaination of how our Tabbing feature works (*For those of us, like me, who understand more easily when we see pictures.*)
6. [Engineering Notes - Tabbing](TAB-SPECs.md) more detailed description of how our Tabbing feature works

Also, here are a couple of really useful VSCode sources:

- [VSCode can do that?](https://www.vscodecandothat.com/) Fun website showing specific things VSCode can do - review whats possible that may help you in your use of VSCode.
- YouTube Channel: [Code 2020](https://www.youtube.com/channel/UCyYh-eAr74avLwOyPa1dDNg) - A large list of short videos presenting all manner of useful VSCode tips.

*Please go look at each of these once so you can know what's here when you need them!*

## Known Conflicts with other VSCode Extensions
We know the three extension so far which might interfere with our Spin2 extension. Here's what we've seem:

1. If I haven't already, I'll be submitting pull requests to the Overtype extension maintainers to add code for avoiding interference with our .spin/.spin2 InsertMode feature but in the meantime please ensure that the [Overtype by Adma Maras](https://marketplace.visualstudio.com/items?itemName=adammaras.overtype) and/or [Overtype by DrMerfy](https://marketplace.visualstudio.com/items?itemName=DrMerfy.overtype) extensions are disabled or uninstalled as they can interfere with our extensions' behavior.
2. The Extension [Document This](https://marketplace.visualstudio.com/items?itemName=oouo-diogo-perdigao.docthis) v0.8.2 currently also occasionally intercepts the Ctrl+Alt+D keystroke which we use to generate documentation and our extension then doesn't get the request. I've filed an issue with that extensions' maintainer so maybe this will be fixed in the future.  Meanwhile, you can either disable the **Document This** extension or when you see the warning pop up from the document this extension you can usually just click in your editor window again and then press Ctrl+Alt+d again and it will work after one or more tries.

## Repository Notes

This repository contains a single subproject which is the vscode extension:

- SPIN2/SPIN and PASM2/PASM syntax Highlighting and code navigation [spin2](./spin2) - *Builds*



---

>  If you like my work and/or this has helped you in some way then feel free to help me out for a couple of :coffee:'s or :pizza: slices or support my work by contributing at Patreon!
>
> [![coffee](https://www.buymeacoffee.com/assets/img/custom_images/black_img.png)](https://www.buymeacoffee.com/ironsheep) &nbsp;&nbsp; -OR- &nbsp;&nbsp; [![Patreon](./DOCs/patreon.png)](https://www.patreon.com/IronSheep?fan_landing=true)[Patreon.com/IronSheep](https://www.patreon.com/IronSheep?fan_landing=true)

---

## Credits

Ray [Cluso99] in our [Propeller 2 Forums](https://forums.parallax.com/categories/propeller-2-multicore-microcontroller) which started this effort for us.

Patrick (GitHub [Entomy](https://github.com/Entomy)) for a spin1 extension which helped me get further along with this one.

Jay B. Harlow for contributing the initial elastic tabs feature.

George (GitHub [DrMerfy](https://github.com/DrMerfy)) for the latest [VSCode-Overtype](https://marketplace.visualstudio.com/items?itemName=DrMerfy.overtype) extension which provided the foundation to which we could add the Align mode.

## License

Copyright © 2022 Iron Sheep Productions, LLC. All rights reserved.<br />
Licensed under the MIT License. <br>
<br>
Follow these links for more information:

### [Copyright](copyright) | [License](LICENSE)

[maintenance-shield]: https://img.shields.io/badge/maintainer-stephen%40ironsheep%2ebiz-blue.svg?style=for-the-badge

[marketplace-version]: https://vsmarketplacebadge.apphb.com/version-short/ironsheepproductionsllc.spin2.svg

[marketplace-installs]: https://vsmarketplacebadge.apphb.com/installs-short/ironsheepproductionsllc.spin2.svg

[marketplace-rating]: https://vsmarketplacebadge.apphb.com/rating-short/ironsheepproductionsllc.spin2.svg

[license-shield]: https://camo.githubusercontent.com/bc04f96d911ea5f6e3b00e44fc0731ea74c8e1e9/68747470733a2f2f696d672e736869656c64732e696f2f6769746875622f6c6963656e73652f69616e74726963682f746578742d646976696465722d726f772e7376673f7374796c653d666f722d7468652d6261646765

[Release-shield]: https://img.shields.io/github/release/ironsheep/P2-vscode-extensions/all.svg

[Issues-shield]: https://img.shields.io/github/issues/ironsheep/P2-vscode-extensions.svg
