'' =================================================================================================
''
''   File....... test_spin.spin
''   Purpose.... SPIN File in P1 series of test files used to verify syntax highlighting
''   Authors.... Stephen M Moraco
''               -- Copyright (c) 2022 Iron Sheep Productions, LLC
''               -- see below for terms of use
''   E-mail..... stephen@ironsheep.biz
''   Started.... Nov 2022
''   Updated.... 30 Nov 2022
''
'' =================================================================================================


'' this is our full Spin P1 instruction set


OBJ

    mouse   : "USB_Mouse"       ' instantiate "USB_Mouse.spin2" as "mouse"
    v[16]   : "VocalSynth"      ' instantiate an array of 16 objects
    vga     : "tv_vga"

CON
    _clkfreq
    _clkmode
    _free
    _stack
    _xinfreq
    FALSE
    FLOAT
    NEGX
    PI
    PLL1X
    PLL2X
    PLL4X
    PLL8X
    PLL16X
    POSX
    RCFAST
    RCSLOW
    ROUND
    TRUE
    TRUNC
    XINPUT
    xtal1
    xtal2
    xtal3

VAR

    BYTE
    FLOAT
    LONG
    ROUND
    WORD
    TRUNC
OBJ

    FLOAT
    ROUND
    TRUNC

DAT

chkBffr     long    0[vga.MAX_BUFFER_LEN]
            long    0[vga.MAX_COG_BUFFER_SIZE_IN_LONGS]


PUB null()

    '' This is NOT a top level object

PUB allSpinLanguageParts()
' core spin verbs
    ABORT
    BYTE
    BYTEFILL
    BYTEMOVE
    CASE
    CHIPVER
    CLKFREQ
    CLKMODE
    CLKSET
    CNT
    COGID
    COGINIT
    COGNEW
    COGSTOP
    CONSTANT
    CTRA
    CTRB
    DIRA
    DIRB
    ELSE
    FALSE
    FLOAT
    FRQA
    FRQB
    IF
    IFNOT
    INA
    INB
    LOCKCLR
    LOCKNEW
    LOCKRET
    LOCKSET
    LONG
    LONGFILL
    LONGMOVE
    LOOKDOWN
    LOOKDOWNZ
    LOOKUP
    LOOKUPZ
    NEGX
    NEXT
    OUTA
    OUTB
    PAR
    PHSA
    PI
    PLL1X
    PLL2X
    PLL4X
    PLL8X
    PLL16X
    POSX
    QUIT
    RCFAST
    RCSLOW
    REBOOT
    REPEAT
    RESULT
    RETURN
    ROUND
    SPR
    STRCOMP
    STRING
    STRSIZE
    TRUE
    TRUNC
    VCFG
    VSCL
    WAITCNT
    WAITPEQ
    WAITPNE
    WAITVID
    WORD
    WORDFILL
    WORDMOVE
    XINPUT
    xtal1
    xtal2
    xtal3

PUB allHubVariableNames()
                CLKFREQ
                CLKMODE
                CHIPVER
                DIRA
                DIRB
                INA
                INB
                OUTA
                OUTB
                CNT
                CTRA
                CTRB
                FRQA
                FRQB
                PHSA
                PHSB
                VCFG
                VSCL
                PAR


'PUB allHubsetValuesForClockSetup()
' these are mostly numbers so we won't colorize these!
'    00_00
'    00_01
'    01_10
'    10_11
'    1x_10
'    1x_11

PUB allClockVariabless()
' value can be set with HUBSET
' - these are the compiled values
    ' CONSTANT SYMBOLS
    clkmode_
    clkfreq_
' set via CLKSET()
    ' SPIN2 VARIABLES
    clkfreq
    clkmode

PUB allSpinConstants()
    TRUE
    FALSE
    POSX
    NEGX
    PI

PUB allnamedOperators()
    NOT
    AND
    OR

    FLOAT
    ROUND
    TRUNC


PUB allDebugMethods()
    ' conditionals
    IF
    IFNOT
    ' String Output *
    ZSTR
    LSTR
    ' Float
    FDEC
    FDEC_REG_ARRAY
    FDEC_ARRAY
    ' Unsigned Decimal
    UDEC
    UDEC_BYTE
    UDEC_WORD
    UDEC_LONG
    UDEC_REG_ARRAY
    UDEC_BYTE_ARRAY
    UDEC_WORD_ARRAY
    UDEC_LONG_ARRAY
    ' Signed Decimal
    SDEC
    SDEC_BYTE
    SDEC_WORD
    SDEC_LONG
    SDEC_REG_ARRAY
    SDEC_BYTE_ARRAY
    SDEC_WORD_ARRAY
    SDEC_LONG_ARRAY
    ' Hexadecimal Output, unsigned *
    UHEX
    UHEX_BYTE
    UHEX_WORD
    UHEX_LONG
    UHEX_REG_ARRAY
    UHEX_BYTE_ARRAY
    UHEX_WORD_ARRAY
    UHEX_LONG_ARRAY
    ' Hexadecimal Output, signed *
    SHEX
    SHEX_BYTE
    SHEX_WORD
    SHEX_LONG
    SHEX_REG_ARRAY
    SHEX_BYTE_ARRAY
    SHEX_WORD_ARRAY
    SHEX_LONG_ARRAY
    ' Binary Output, unsigned *
    UBIN
    UBIN_BYTE
    UBIN_WORD
    UBIN_LONG
    UBIN_REG_ARRAY
    UBIN_BYTE_ARRAY
    UBIN_WORD_ARRAY
    UBIN_LONG_ARRAY
    ' Binary Output, signed *
    SBIN
    SBIN_BYTE
    SBIN_WORD
    SBIN_LONG
    SBIN_REG_ARRAY
    SBIN_BYTE_ARRAY
    SBIN_WORD_ARRAY
    SBIN_LONG_ARRAY
    ' Miscellaneous
    DLY
    PC_KEY
    PC_MOUSE
    ' DEBUG constants
    DOWNLOAD_BAUD
    DEBUG_COGS
    DEBUG_DELAY
    DEBUG_PIN_TX
    DEBUG_PIN_RX
    DEBUG_BAUD
    DEBUG_TIMESTAMP
    DEBUG_LOG_SIZE
    DEBUG_LEFT
    DEBUG_TOP
    DEBUG_WIDTH
    DEBUG_HEIGHT
    DEBUG_DISPLAY_LEFT
    DEBUG_DISPLAY_TOP
    DEBUG_WINDOWS_OFF


PRI allFlowControl()
    ABORT
    CASE
    ELSE
    ELSEIF
    ELSEIFNOT
    FROM
    IF
    IFNOT
    NEXT
    OTHER
    QUIT
    REPEAT
    STEP
    TO
    UNTIL
    WHILE
    RETURN


PUB allSmartPinAliases()
' symbols that are used in setting up smartpins
            P_ADC
            P_ADC_100X
            P_ADC_10X
            P_ADC_1X
            P_ADC_30X
            P_ADC_3X
            P_ADC_EXT
            P_ADC_FLOAT
            P_ADC_GIO
            P_ADC_SCOPE
            P_ADC_VIO
            P_ASYNC_IO
            P_ASYNC_RX
            P_ASYNC_TX
            P_BITDAC
            P_CHANNEL
            P_COMPARE_AB
            P_COMPARE_AB_FB
            P_COUNTER_HIGHS
            P_COUNTER_PERIODS
            P_COUNTER_TICKS
            P_COUNT_HIGHS
            P_COUNT_RISES
            P_DAC_124R_3V
            P_DAC_600R_2V
            P_DAC_75R_2V
            P_DAC_990R_3V
            P_DAC_DITHER_PWM
            P_DAC_DITHER_RND
            P_DAC_NOISE
            P_EVENTS_TICKS
            P_HIGH_100UA
            P_HIGH_10UA
            P_HIGH_150K
            P_HIGH_15K
            P_HIGH_1K5
            P_HIGH_1MA
            P_HIGH_FAST
            P_HIGH_FLOAT
            P_HIGH_TICKS
            P_INVERT_A
            P_INVERT_B
            P_INVERT_IN
            P_INVERT_OUTPUT
            P_LEVEL_A
            P_LEVEL_A_FBN
            P_LEVEL_A_FBP
            P_LOCAL_A
            P_LOCAL_B
            P_LOGIC_A
            P_LOGIC_A_FB
            P_LOGIC_B_FB
            P_LOW_100UA
            P_LOW_10UA
            P_LOW_150K
            P_LOW_15K
            P_LOW_1K5
            P_LOW_1MA
            P_LOW_FAST
            P_LOW_FLOAT
            P_MINUS1_A
            P_MINUS1_B
            P_MINUS2_A
            P_MINUS2_B
            P_MINUS3_A
            P_MINUS3_B
            P_NCO_DUTY
            P_NCO_FREQ
            P_NORMAL
            P_OE
            P_OUTBIT_A
            P_OUTBIT_B
            P_PERIODS_HIGHS
            P_PERIODS_TICKS
            P_PLUS1_A
            P_PLUS1_B
            P_PLUS2_A
            P_PLUS2_B
            P_PLUS3_A
            P_PLUS3_B
            P_PULSE
            P_PWM_SAWTOOTH
            P_PWM_SMPS
            P_PWM_TRIANGLE
            P_QUADRATURE
            P_REG_DOWN
            P_REG_UP
            P_REPOSITORY
            P_SCHMITT_A
            P_SCHMITT_A_FB
            P_SCHMITT_B_FB
            P_STATE_TICKS
            P_SYNC_IO
            P_SYNC_RX
            P_SYNC_TX
            P_TRANSITION
            P_TRUE_A
            P_TRUE_B
            P_TRUE_IN
            P_TRUE_OUTPUT
            P_TT_00
            P_TT_01
            P_TT_10
            P_TT_11
            P_USB_PAIR


PUB symbolsThatAre()
' symbols that are used to setup streamers
        X_16P_2DAC8_WFWORD
        X_16P_4DAC4_WFWORD
        X_1ADC8_0P_1DAC8_WFBYTE
        X_1ADC8_8P_2DAC8_WFWORD
        X_1P_1DAC1_WFBYTE
        X_2ADC8_0P_2DAC8_WFWORD
        X_2ADC8_16P_4DAC8_WFLONG
        X_2P_1DAC2_WFBYTE
        X_2P_2DAC1_WFBYTE
        X_32P_4DAC8_WFLONG
        X_4ADC8_0P_4DAC8_WFLONG
        X_4P_1DAC4_WFBYTE
        X_4P_2DAC2_WFBYTE
        X_4P_4DAC1_WFBYTE
        X_8P_1DAC8_WFBYTE
        X_8P_2DAC4_WFBYTE
        X_8P_4DAC2_WFBYTE
        X_ALT_OFF
        X_ALT_ON
        X_DACS_0N0_0N0
        X_DACS_0N0_X_X
        X_DACS_0_0_0_0
        X_DACS_0_0_X_X
        X_DACS_0_X_X_X
        X_DACS_1N1_0N0
        X_DACS_1_0_1_0
        X_DACS_1_0_X_X
        X_DACS_3_2_1_0
        X_DACS_OFF
        X_DACS_X_0_X_X
        X_DACS_X_X_0N0
        X_DACS_X_X_0_0
        X_DACS_X_X_0_X
        X_DACS_X_X_1_0
        X_DACS_X_X_X_0
        X_DDS_GOERTZEL_SINC1
        X_DDS_GOERTZEL_SINC2
        X_IMM_16X2_1DAC2
        X_IMM_16X2_2DAC1
        X_IMM_16X2_LUT
        X_IMM_1X32_4DAC8
        X_IMM_2X16_2DAC8
        X_IMM_2X16_4DAC4
        X_IMM_32X1_1DAC1
        X_IMM_32X1_LUT
        X_IMM_4X8_1DAC8
        X_IMM_4X8_2DAC4
        X_IMM_4X8_4DAC2
        X_IMM_4X8_LUT
        X_IMM_8X4_1DAC4
        X_IMM_8X4_2DAC2
        X_IMM_8X4_4DAC1
        X_IMM_8X4_LUT
        X_PINS_OFF
        X_PINS_ON
        X_RFBYTE_1P_1DAC1
        X_RFBYTE_2P_1DAC2
        X_RFBYTE_2P_2DAC1
        X_RFBYTE_4P_1DAC4
        X_RFBYTE_4P_2DAC2
        X_RFBYTE_4P_4DAC1
        X_RFBYTE_8P_1DAC8
        X_RFBYTE_8P_2DAC4
        X_RFBYTE_8P_4DAC2
        X_RFBYTE_LUMA8
        X_RFBYTE_RGB8
        X_RFBYTE_RGBI8
        X_RFLONG_16X2_LUT
        X_RFLONG_32P_4DAC8
        X_RFLONG_32X1_LUT
        X_RFLONG_4X8_LUT
        X_RFLONG_8X4_LUT
        X_RFLONG_RGB24
        X_RFWORD_16P_2DAC8
        X_RFWORD_16P_4DAC4
        X_RFWORD_RGB16
        X_WRITE_OFF
        X_WRITE_ON

CON { license }

{{


 -------------------------------------------------------------------------------------------------
  MIT License

  Copyright (c) 2022 Iron Sheep Productions, LLC

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
 =================================================================================================
}}
