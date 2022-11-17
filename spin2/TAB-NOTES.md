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

## Research: WWVD - (What would VSCode do?)

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
    		- if text is line is already at left edge - nothing happens
    		- for any lines not at left edge they move left one tab stop 
    		- (all lines maintain their current indent relative to each other)
    [UML2] multiple full lines w/partial last line
    	- All lines in section region treated:
    		- if text is line is already at left edge - nothing happens
    		- for any lines not at left edge they move left one tab stop 
    		- (all lines maintain their current indent relative to each other)
    [UML3] multiple full lines w/partial first and last lines
    	- All lines in section region treated:
    		- if text is line is already at left edge - nothing happens
    		- for any lines not at left edge they move left one tab stop 
    		- (all lines maintain their current indent relative to each other)
    [UML4] two lines: partial first and last lines
    	- All lines in section region treated:
    		- if text is line is already at left edge - nothing happens
    		- for any lines not at left edge they move left one tab stop 
    		- (all lines maintain their current indent relative to each other)
