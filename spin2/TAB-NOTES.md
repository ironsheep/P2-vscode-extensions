# Spin2/Pasm2 Syntax highlighting and Code Navigation for VSCode

This page presents how we are thinking about the new Elastic Tabbing à la Propeller Tool as implemeted in our Spin2 extension for VSCode.

![Project Maintenance][maintenance-shield]

[![License][license-shield]](LICENSE)

## Spin2 Elastic Tabs - Specification

{this section TBA}

## Spin2 Elastic Tabs - TEST Cases

### Press TAB (with what selected?):

	- [IP1] insert point: in NON-WHITE
		- (place cursor here)
		- should move text at cursor, splitting text
	- [IP2] insert point: in WHITE
		- (place cursor at left-edge of text to right, OR END-OF-LINE)
		- should move text at cursor, or just append spaces to next tab
	- [SE1] selection (All NON-WHITE)
		- (should location left edge of NON-WHITE (to left) and and place cursor there)
	- [SE2] selection (starts WHITE, ends NON-WHITE)
		- (should location left edge of NON-WHITE, within selection, set cursor there)
	- [SE3] selection (starts NON-WHITE, ends WHITE)
		- (should location left edge of NON-WHITE before start of selection, set cursor there) 
	- [SE4] selection (All WHITE)
		- (should place cursor at left-edge of text to right)
			- selected text should be removed
			- next tab is calc from left of selection, not cursor
			- insert spaces to next TAB from left of selection
		- (OR DO NOTHING if no more text to right)
	- [ML1] Multi-line (FAKE SINGLE LINE)
		- (should location left edge of NON-WHITE, place cursor there)
		- (skipping WHITE at left of line)
	
NOTE: Tab on empty lines should just cause spaces to be appended to next tab stop.

### Press SHIFT+TAB (with what selected?):

	- [UIP1] insert point: in NON-WHITE
		- (place cursor at left-edge of text (to left), OR BEGIN-OF-LINE)
		- just remove spaces from cursor to prior tab
	- [UIP2] insert point: in WHITE
		- (place cursor at left-edge of text (to right), OR END-OF-LINE)
		- just remove spaces from cursor to prior tab
	- [USE1] selection (All NON-WHITE)
		- (place cursor at left-edge of text (to left), OR BEGIN-OF-LINE)
		- just remove spaces from cursor to prior tab
	- [USE2] selection (starts WHITE, ends NON-WHITE)
		- (should location left edge of NON-WHITE, within selection, set cursor there)
		- just remove spaces from cursor to prior tab
	- [USE3] selection (starts NON-WHITE, ends WHITE)
		- (place cursor at left-edge of text (to left), OR BEGIN-OF-LINE)
		- just remove spaces from cursor to prior tab
	- [USE4] selection (All WHITE)
		- (place cursor at left-edge of text (to right), OR END-OF-LINE)
		- just remove spaces from cursor to prior tab
	- [UML1] Multi-line (FAKE SINGLE LINE)
		- (place cursor at left-edge of text (from start of line to right), OR END-OF-LINE)
		- just remove spaces from cursor to prior tab

NOTE: empty lines are ignored for Shift+Tab.


## Research: WWPTD - (What would Propeller Tool do?)

I sutdied the Propeller Tool documentation to determine what special features are present with respect TAB and insert modes.  Here are my findings:

**NOTE:** *In Propeller Tool the backspace key behavior is also altered according to the custom tab settins. We are not planning to do this in VSCode.*


### Press TAB (with what selected?):

    [TIP1] Cursor placed to left of text on line
        	- tab inserts spaces to next tab-stop to left of cursor (effictively cursor moves with text
    [TML1] multiple full/partial lines selected
    	- All lines moved right one tab stop (all lines maintain their current indent relative to each other)
    [UCML1] multiple columns selected across multiple lines
    	- All text from left selected colum moved right one tab stop

### Press SHIFT+TAB (with what selected?):

    [UP1] Cursor placed to left of text on line
    	- entire line is shifted left to next tab stop, cursor remains where it was in line
    [UML1] multiple full/partial lines selected
    	- All lines moved left one tab stop (all lines maintain their current indent relative to each other)
    	- if text on line is already at left edge - nothing happens to that line
    [UCML1] multiple columns selected across multiple lines
    	- All text from left selected colum moved left one tab stop

### Effect of INSERT, OVERTYPE and ALIGN insert Modes

The Propeller Tool documentation says very little about insert and overtype modes. But in the end **Insert Mode** shoves characters immediately to the right of the cursor to the right with each character typed while **Overtype Mode** simply replaces the character to the right of the cursor with the character entered. 

The interesting things happen with **Align Mode**. To quote propeller tool docs: 

"*While in Align Mode characters inserted affect characters immediately to the right of the cursor but not characters separated by more than one space. The result is that comments and other items separated by more than one space maintain their intended alignment for as long as possible.*"


### Effect of Block Selection and Block Moving

This is used in Propeller tool. It may be supported already in VSCode. I have to practice with it.  I'm not sure if there is an interaction with our new elastic tabs and this ability. If there should be I'll note it here when I found out. At this point in time of my learning I don't think we need to address this.  We'll see.


## Research: WWVD - (What would VSCode do?)

I tested various (hopefully comprehensive) cases of selection and what happens when I press tab or shift+tab in these cases.  The following are my notes on VSCode behavior I observed:

### Press TAB (with what selected?):

    [TIP1] insert point in non-white
    	- tab inserts spaces to next tab-stop to left of cursor, splits chars at cursor
    [TIP2] insert point in white
    	- tab inserts spaces to next tab-stop to left of cursor
    [TSE1] selection all non-white
    	- The entire selection is removed and a single tab is inserted to the left of the cursor
    [TSE2] selection all white
    	- The entire selection is removed and a single tab is inserted to the left of the cursor
    [TSE3] selection start in non-white end in white
    	- The entire selection is removed and a single tab is inserted to the left of the cursor
    [TSE4] selection start in white end in non-white
    	- The entire selection is removed and a single tab is inserted to the left of the cursor
    [TML1] multiple full lines
    	- All lines moved right one tab stop (all lines maintain their current indent relative to each other)
    [TML2] multiple full lines w/partial last line
    	- All lines moved right one tab stop (all lines maintain their current indent relative to each other)
    [TML3] multiple full lines w/partial first and last lines
    	- All lines moved right one tab stop (all lines maintain their current indent relative to each other)
    [TML4] two lines: partial first and last lines
    	- All lines moved right one tab stop (all lines maintain their current indent relative to each other)


### Press SHIFT+TAB (with what selected?):

    [UIP1] insert point in non-white
    	- entire line is shifted left to next tab stop, cursor remains where it was in line
    [UIP2] insert point in white
    	- entire line is shifted left to next tab stop, cursor remains where it was in line
    [USE1] selection all non-white
    	- entire line is shifted left to next tab stop, cursor remains where it was in line
    [USE2] selection all white
    	- 3 outcomes:
    		- (1) 1st text is left of selected white but there is whitespace to left of 1st text
    			- entire line is shifted left to next tab stop, cursor remains where it was in line
    		- (2) 1st text is right of selected white
    			- entire line is shifted left to next tab stop, cursor remains where it was in line
    		- (3) 1st text is left of selected white but 1st text is flush at left edge of line
    				- NOTHING happens!
    [USE3] selection start in non-white end in white
    	- 2 outcomes:
    		- (1) 1st text is indented from left edge
    				- entire line is shifted left to next tab stop, cursor remains where it was in line
    		- (2) 1st text is flush at left edge
    			- NOTHING happens!
    [USE4] selection start in white end in non-white
    	- 2 outcomes:
    		- (1) 1st text is indented from left edge
    				- entire line is shifted left to next tab stop, cursor remains where it was in line
    		- (2) 1st text is flush at left edge
    			- NOTHING happens!
    [UML1] multiple full lines
    	- All lines in section region treated:
    		- if text on line is already at left edge - nothing happens
    		- for any lines not at left edge they move left one tab stop 
    		- (all lines maintain their current indent relative to each other)
    [UML2] multiple full lines w/partial last line
    	- All lines in section region treated:
    		- if text on line is already at left edge - nothing happens
    		- for any lines not at left edge they move left one tab stop 
    		- (all lines maintain their current indent relative to each other)
    [UML3] multiple full lines w/partial first and last lines
    	- All lines in section region treated:
    		- if text on line is already at left edge - nothing happens
    		- for any lines not at left edge they move left one tab stop 
    		- (all lines maintain their current indent relative to each other)
    [UML4] two lines: partial first and last lines
    	- All lines in section region treated:
    		- if text on line is already at left edge - nothing happens
    		- for any lines not at left edge they move left one tab stop 
    		- (all lines maintain their current indent relative to each other)

While this will inform some of the spin2 tabbing behaviors we are adding additional behaviors on top of this.

*-Stephen*

---

> If you like my work and/or this has helped you in some way then feel free to help me out for a couple of :coffee:'s or :pizza: slices!
>
> [![coffee](https://www.buymeacoffee.com/assets/img/custom_images/black_img.png)](https://www.buymeacoffee.com/ironsheep) &nbsp;&nbsp; -OR- &nbsp;&nbsp; [![Patreon](./images/patreon.png)](https://www.patreon.com/IronSheep?fan_landing=true)[Patreon.com/IronSheep](https://www.patreon.com/IronSheep?fan_landing=true)


---

## License

Copyright © 2020 Iron Sheep Productions, LLC. All rights reserved.

Licensed under the MIT License.

Follow these links for more information:

### [Copyright](copyright) | [License](LICENSE)

[maintenance-shield]: https://img.shields.io/badge/maintainer-stephen%40ironsheep%2ebiz-blue.svg?style=for-the-badge

[marketplace-version]: https://vsmarketplacebadge.apphb.com/version-short/ironsheepproductionsllc.spin2.svg

[marketplace-installs]: https://vsmarketplacebadge.apphb.com/installs-short/ironsheepproductionsllc.spin2.svg

[marketplace-rating]: https://vsmarketplacebadge.apphb.com/rating-short/ironsheepproductionsllc.spin2.svg

[license-shield]: https://camo.githubusercontent.com/bc04f96d911ea5f6e3b00e44fc0731ea74c8e1e9/68747470733a2f2f696d672e736869656c64732e696f2f6769746875622f6c6963656e73652f69616e74726963682f746578742d646976696465722d726f772e7376673f7374796c653d666f722d7468652d6261646765
