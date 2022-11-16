# Spin2/Pasm2 Syntax highlighting and Code Navigation for VSCode

This page presents how we are thinking about the new Elastic Tabbing à la Propeller Tool as implemeted in our Spin2 extension for VSCode.

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
