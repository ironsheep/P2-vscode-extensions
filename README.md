# Parallax Propeller 2 VSCode support




![Project Maintenance][maintenance-shield]
[![License][license-shield]](LICENSE) 

**Spin2 Extension**: 
[![Version][marketplace-version]](https://marketplace.visualstudio.com/items?itemName=ironsheepproductionsllc.spin2) 
[![Installs][marketplace-installs]](https://marketplace.visualstudio.com/items?itemName=ironsheepproductionsllc.spin2) 
[![Ratings][marketplace-rating]](https://marketplace.visualstudio.com/items?itemName=ironsheepproductionsllc.spin2)



VSCode support for the Propeller languages: Spin2 and Pasm2 for the [Parallax Inc.](https://parallax.com) Propeller 2 [P2 or P2X8C4M64P](https://propeller.parallax.com/p2.html). The P2 community thrives in the [P2 Forums](https://forums.parallax.com/categories/propeller-2-multicore-microcontroller)

The **P2 Forum Thread** containing discussion of [this VSCode support](https://forums.parallax.com/discussion/170068/visual-studio-code-editor-for-p1-p2-spin-pasm#latest)

## Features
- Full support for both P1 (spin/pasm) and P2 (spin2/pasm2) languages
- **Syntax and Semantic Highlighting** for both Spin and Pasm
- **Syntax and Semantic Highlighting** for both Spin2 and Pasm2 including all Streamer and Smart-pin Symbols as well as all debug() statements with parameter validation for all display types
- **Custom tabbing** Tab-stop support per section à la Parallax **Propeller Tool**
- **Tab Sets** You can choose between `Propeller Tool`, `IronSheep`, and `User1` (*adjust in settings to make your favorite set*)
- File navigation from **Outline View**
- **Edit Mode** support à la Parallax **Propeller Tool** [Insert, Overtype and Align]
- Works with your favorite VSCode themes
- Offers companion Theme (Two themes: Syntax+Semantic, and Syntax only - mostly used during semantic highlighting development)

### Up next
- Build and Download support (using external compiler(s) and download tool(s)) - *Still figuring this out but follow along with me as I drop HOW-TOs in [Configuring Tasks](TASKS.md)*

### Future directions

- Task Provider - *studies the current environment and offers to write the tasks for a given P2 project*
- Spin2/Pasm2 code formatter/beautifier - *allows us to have standard formatting for code we share! (source code could be formatted on each file save)*
- Snippets for Spin2/Pasm2 (common code sequences which can be added easily to file being edited (e.g., smart pin setup code for given mode/use)
- Possible Extension Package for P2 (would include all P2 specific extensions)

## Installation

In VSCode search for the "spin2" extension and install it.  It's that easy!  After installation you will be notified to download and install a new version as new versions are released.

## VSCode Environment

There are two companion documents in this Repository:

1. [Configuring Tasks](TASKS.md) which advises on how to automate your P2 Development when using VScode
2. [VSCode Extensions](EXTENSIONS.md) we find useful in our own P2 development

Also, here are a couple of really useful VSCode sources:

- [VSCode can do that?](https://www.vscodecandothat.com/) Fun website showing specific things VSCode can do - review whats possible that may help you in your use of VSCode.
- YouTube Channel: [Code 2020](https://www.youtube.com/channel/UCyYh-eAr74avLwOyPa1dDNg) - A large list of short videos presenting all manner of useful VSCode tips.

*Please go look at each of these once so you can know what's here when you need them!*

## Repository Notes

This repository contains a single subproject which is the vscode extension:

- SPIN2/SPIN and PASM2/PASM syntax Highlighting and code navigation [spin2](./spin2) - *Builds*



---

> If you like my work and/or this has helped you in some way then feel free to help me out for a couple of :coffee:'s or :pizza: slices!
>
> [![coffee](https://www.buymeacoffee.com/assets/img/custom_images/black_img.png)](https://www.buymeacoffee.com/ironsheep) &nbsp;&nbsp; -OR- &nbsp;&nbsp; [![Patreon](./DOCs/patreon.png)](https://www.patreon.com/IronSheep?fan_landing=true)[Patreon.com/IronSheep](https://www.patreon.com/IronSheep?fan_landing=true)

---

## Credits

Ray [Cluso99] in our [Propeller 2 Forums](https://forums.parallax.com/categories/propeller-2-multicore-microcontroller) which started this effort for us.

Patrick (GitHub [Entomy](https://github.com/Entomy)) for a spin1 extension which helped me get further along with this one.

Jay B. Harlow for contributing the initial elastic tabs feature.

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
