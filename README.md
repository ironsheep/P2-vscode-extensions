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
