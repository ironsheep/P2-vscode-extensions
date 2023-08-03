#!/usr/bin/env python3
# coding: utf8

import json
import jstyleson
import sys
import os.path
import argparse
from time import sleep, localtime, strftime
import time

from signal import signal, SIGPIPE, SIG_DFL
# from colorama import init as colorama_init
from colorama import Fore, Back, Style

signal(SIGPIPE, SIG_DFL)

script_version = "0.0.1"
script_name = "thmChk.py"
script_info = "{} v{}".format(script_name, script_version)
project_name = "theme-check utility"
project_url = "https://github.com/ironsheep/P2-vscode-extensions"


if False:
    # will be caught by python 2.7 to be illegal syntax
    print_line(
        "Sorry, this script requires a python3 runtime environment.", file=sys.stderr
    )

# Argparse
opt_debug = False
opt_verbose = False
opt_logging = False
opt_ansii = False

def print_line(
    text,
    error=False,
    warning=False,
    info=False,
    verbose=False,
    progress=False,
    debug=False,
    console=True,
    report=False,
    log=False,
):
    timestamp = "[{}] ".format(strftime("%Y-%m-%d %H:%M:%S", localtime()))
    if console:
        if error:
            print(
                Fore.RED
                + Style.BRIGHT
                + timestamp
                + Style.RESET_ALL
                + Fore.RED
                + "- (Error): "
                + "{}".format(text)
                + Style.RESET_ALL,
                file=sys.stderr,
            )
        elif warning:
            print(
                Fore.YELLOW
                + Style.BRIGHT
                + timestamp
                + Style.RESET_ALL
                + Fore.YELLOW
                + "- (Warning): "
                + "{}".format(text)
                + Style.RESET_ALL,
                file=sys.stderr,
            )
        elif info or verbose:
            if verbose and opt_verbose:
                print(
                    Fore.GREEN
                    + timestamp
                    + Fore.YELLOW
                    + "- (Verbose): "
                    + "{}".format(text)
                    + Style.RESET_ALL
                )
            elif info:
                print(
                    Fore.GREEN
                    + Style.BRIGHT
                    + timestamp
                    + Style.RESET_ALL
                    + Fore.GREEN
                    + "- (Info): "
                    + "{}".format(text)
                    + Style.RESET_ALL
                )
        elif debug:
            if opt_debug:
                print(
                    Fore.CYAN
                    + timestamp
                    + "- (DBG): "
                    + "{}".format(text)
                    + Style.RESET_ALL
                )
        elif progress:
            print(
                Fore.BLUE
                + Style.BRIGHT
                + timestamp
                + Style.RESET_ALL
                + Fore.BLUE
                + "- "
                + "{}".format(text)
                + Style.RESET_ALL
            )
        elif report:
            print("{}".format(text))
        else:
            print(
                Fore.MAGENTA
                + Style.BRIGHT
                + timestamp
                + Style.RESET_ALL
                + Fore.MAGENTA
                + "{}".format(text)
                + Style.RESET_ALL
            )
        # log messages can be debug too!
    else:
        if error:
            print(
                timestamp
                + "- (Error): "
                + "{}".format(text),
                file=sys.stderr,
            )
        elif warning:
            print(
                timestamp
                + "- (Warning): "
                + "{}".format(text),
                file=sys.stderr,
            )
        elif info or verbose:
            if verbose and opt_verbose:
                print(
                    timestamp
                    + "- (Verbose): "
                    + "{}".format(text),
                )
            elif info:
                print(
                    timestamp
                    + "- (Info): "
                    + "{}".format(text),
                )
        elif debug:
            if opt_debug:
                print(
                    timestamp
                    + "- (DBG): "
                    + "{}".format(text),
                )
        elif progress:
            print(
                timestamp
                + "- "
                + "{}".format(text),
            )
        elif report:
            print("{}".format(text))
        else:
            print(
                timestamp
                + "{}".format(text),
            )
    if log and opt_logging:
        if debug:
            message = "{}".format(timestamp) + "- (DBG): " + "{}".format(text)
        else:
            message = "{}".format(timestamp) + "- " + "{}".format(text)
        if log_fp is not None:
            # print("Log [{}]".format(message))
            log_fp.write(message + "\n")
            log_fp.flush()


# -----------------------------------------------------------------------------
#  Parameter Handling
# -----------------------------------------------------------------------------

parser = argparse.ArgumentParser(
    description=script_info, epilog="For further details see: " + project_url
)
parser.add_argument(
    "-v", "--verbose", help="increase output (v)erbosity", action="store_true"
)
parser.add_argument("-a", "--ansii", help="omit (a)nsii output coloring", action="store_true")
parser.add_argument("-e", "--emit", help="(e)mit key, color list for sorting", action="store_true")
parser.add_argument("-s", "--scopes", help="list (s)copes in theme", action="store_true")
parser.add_argument("-d", "--debug", help="show (d)ebug output", action="store_true")
parser.add_argument("-r", "--rewrite", help="(r)ewrite theme file", action="store_true")
parser.add_argument(
    "-l",
    "--log_filename",
    help="(l)og actions to {LOG FILENAME}",
    default="",
)
parser.add_argument(
    "-t",
    "--theme_filename",
    help="process (t)heme file {THEME_FILENAME}",
    default="",
)
parse_args = parser.parse_args()

log_filename = parse_args.log_filename
theme_filename = parse_args.theme_filename
opt_ansii = parse_args.ansii
opt_emit = parse_args.emit
opt_scopes = parse_args.scopes
opt_debug = parse_args.debug
opt_rewrite = parse_args.rewrite
opt_verbose = parse_args.verbose
opt_logging = len(log_filename) > 0
opt_read_theme = len(theme_filename) > 0


print_line(script_info, info=True)
if opt_verbose:
    print_line("Verbose enabled", info=True)
if opt_debug:
    print_line("Debug enabled", debug=True)
if opt_emit:
    print_line("Emit enabled", debug=True)
if opt_scopes:
    print_line("List Scopes enabled", debug=True)
if opt_logging:
    logFspec = "./logs/" + log_filename
    # print("Log  Logging to [{}]".format(logFspec))
    print_line("* Writing Log {}".format(logFspec), info=True)
    log_fp = open(logFspec, "a")
    print_line("* Log {} - Started".format(log_filename), log=True)
else:
    log_fp = None
if opt_read_theme:
    themeFspec = "./" + theme_filename
    # print("Log  Logging to [{}]".format(logFspec))
    print_line("* Processing Theme {}".format(themeFspec), info=True)
    # open a theme file
    theme_fp = open(theme_filename)
    if(opt_logging):
        print_line("* Theme {} - Opened".format(theme_filename), log=True)
else:
    theme_fp = None

# returns JSON object as
# a dictionary

masterColorDict = {}  # colorName:entryDict
#entryDict = {}  # entryName:scopesList
#scopesList = []  # [scopeName, scopeName, ...]

def registerColorForScope(entryType, scopeName, colorName):
    #new version
    global masterColorDict
    if not colorName in masterColorDict.keys():
        scopesList = [scopeName]
        entryDict = {}
        entryDict[entryType] = scopesList
        masterColorDict[colorName] = entryDict
    else:
        # get current dictionary for color
        entryDict = masterColorDict[colorName]
        if not entryType in entryDict.keys():
            # add new entry type for this color
            scopesList = [scopeName]
            entryDict[entryType] = scopesList
        else:
            # add scope name to existing list for entry
            scopesList = entryDict[entryType]
            scopesList.append(scopeName)

def getScopeNameDict():
    # get a list of entryTypes from the masterColorDict
    global masterColorDict
    masterScopeNamesDict = {}  # key:occurranceCount
    colorKeys = list(masterColorDict.keys())
    for colorName in colorKeys:
        # get current dictionary for color
        entryDict = masterColorDict[colorName]
        entryTypes = list(entryDict.keys())
        for entryType in entryTypes:
            scopesList = entryDict[entryType]
            for scopeName in scopesList:
                if not scopeName in masterScopeNamesDict.keys():
                    # count our first one
                    masterScopeNamesDict[scopeName] = 1
                else:
                    # count our next one
                    count = masterScopeNamesDict[scopeName]
                    count += 1
                    masterScopeNamesDict[scopeName] = count

    return masterScopeNamesDict

def displayScopesFound():
    masterScopeNamesDict = getScopeNameDict() # scopeName:occurranceCount
    secondListDict = {} # scopeName:occurranceCount
    scopeNames = list(masterScopeNamesDict.keys())
    if len(scopeNames) > 1:
        scopeNames.sort()
    for scopeName in scopeNames:
        count = masterScopeNamesDict[scopeName]
        if count > 1:
            secondListDict[scopeName] = count
        else:
            print_line("- {}".format(scopeName), report=True, console=False)
    print_line("* Found {} scope names in [{}]".format(len(scopeNames), theme_filename), report=True, console=False)

    print_line("", report=True, console=False)
    scopeNames = list(secondListDict.keys())
    for scopeName in scopeNames:
        count = secondListDict[scopeName]
        print_line("- {}x  {}".format(count, scopeName), report=True, console=False)

def getEntryTypes():
    # get a list of entryTypes from the masterColorDict
    global masterColorDict
    masterEntryList = []
    colorKeys = list(masterColorDict.keys())
    for colorName in colorKeys:
        # get current dictionary for color
        entryDict = masterColorDict[colorName]
        entryTypes = list(entryDict.keys())
        for entryType in entryTypes:
            if not entryType in masterEntryList:
                masterEntryList.append(entryType)

    if len(masterEntryList) > 1:
        masterEntryList.sort()
    return masterEntryList

def displayKeyColorSortList():
    global masterColorDict
    sortedColorKeys = list(masterColorDict.keys())
    sortedColorKeys.sort()
    mastermEntryListOrder = getEntryTypes()
    for masterEntryType in mastermEntryListOrder:
        print_line("", info=True)    # blank line
        for colorName in sortedColorKeys:
            # get current dictionary for color
            entryDict = masterColorDict[colorName]
            sortedEntryKeys = list(entryDict.keys())
            if len(sortedEntryKeys) > 1:
                sortedEntryKeys.sort()
            for entryType in sortedEntryKeys:
                if entryType == masterEntryType:
                    scopesList = entryDict[entryType]
                    if len(scopesList) > 1:
                        scopesList.sort()
                    for scopeName in scopesList:
                        print_line("  -- {} {} [{}]".format(entryType, scopeName, colorName), report=True, console=False)

def displayColorForScopeInfo():
    global masterColorDict
    colorCheckDict = {}
    print_line("- Checking all colors:", verbose=True)
    sortedColorKeys = list(masterColorDict.keys())
    sortedColorKeys.sort()
    for colorName in sortedColorKeys:
        print_line("", verbose=True)    # blank line
        print_line("- color: {}".format(colorName), verbose=True)
        entryDict = masterColorDict[colorName]
        sortedEntryKeys = list(entryDict.keys())
        sortedEntryKeys.sort()
        for entryType in sortedEntryKeys:
            scopesList = entryDict[entryType]
            scopesList.sort()
            for scopeName in scopesList:
                entryScopeKey = "{} [{}]".format(entryType, scopeName)
                print_line("  -- entry: {} [{}]".format(entryType, scopeName), verbose=True)
                #print_line("    --- scope: [{}]".format(scopeName), verbose=True)
                if not entryScopeKey in colorCheckDict.keys():
                    # add color list for new entry scope
                    colorCheckDict[entryScopeKey] = [colorName]
                else:
                    # add additional color for existing entry scope
                    colorList = colorCheckDict[entryScopeKey]
                    if not colorName in colorList:
                        colorList.append(colorName)
                        colorCheckDict[entryScopeKey] = colorList
    # report entries where more than one color for a single entryScope
    foundError = False
    firstError = True
    for entryScope in colorCheckDict.keys():
        colorList = colorCheckDict[entryScope]
        if len(colorList) > 1:
            colorList.sort()
            foundError = True
            print_line("", info=True)    # blank line
            if (firstError):
                print_line("----", info=True)    # blank line
                print_line("---- Error Report ---- file:{}".format(theme_filename), info=True)    # blank line
                print_line("----", info=True)    # blank line
                print_line("", info=True)    # blank line
                firstError = False
            print_line("- DUPE color entryScope: {}".format(entryScope), info=True)
            for colorName in colorList:
                print_line("  -- color: {}".format(colorName), info=True)
    if(foundError == False):
        print_line("* NO DUPE color entries", info=True)


if theme_fp is not None:
    themeData = jstyleson.load(theme_fp)
    # print_line("- json file [{}]".format(themeData), debug=True)
    for keyName in themeData.keys():
        #print_line("- key [{}]".format(keyName), debug=True)
        if(keyName == "$schema" or keyName == "name" or keyName == "semanticHighlighting"):
            print_line("- {}: {}".format(keyName, themeData[keyName]), verbose=True)
        elif(keyName == "colors"):
            #  FMT:  "checkbox.border": "#919191",
            colorDict = themeData[keyName]
            print_line("  -- colors: has {} values".format(len(colorDict)), verbose=True)
            for scopeName in colorDict.keys():
                 #print_line("  --- [{}]: {}".format(scopeName, colorDict[scopeName]), debug=True)
                 registerColorForScope(keyName, scopeName, colorDict[scopeName])
        elif(keyName == "tokenColors"):
            #  FMT: [{
            #      "scope": ["meta.embedded", "source.groovy.embedded", "string meta.image.inline.markdown"],
            #      "settings": {
            #        "foreground": "#000000ff"
            #      }
            #    },{}]
            tokenColorList = themeData[keyName]
            print_line("  -- tokenColors: has {} values".format(len(tokenColorList)), verbose=True)
            for tokenColorDict in tokenColorList:
                settingsDict = tokenColorDict["settings"] # returns dictionary of color name:value pairs
                colorRaw = ""
                fontStyle = ""
                colorValue = ""
                if "foreground" in settingsDict.keys():
                    colorRaw = settingsDict["foreground"]
                    colorValue = colorRaw
                if "fontStyle" in settingsDict.keys():
                    fontStyle = settingsDict["fontStyle"]
                    if colorRaw == "":
                        colorValue = fontStyle
                    else:
                        colorValue = colorRaw + " " + fontStyle
                scopeItem = tokenColorDict["scope"] # returns string or list of strings
                if isinstance(scopeItem, list):
                    # have list of scopes
                    for scopeName in scopeItem:
                        registerColorForScope(keyName, scopeName, colorValue)
                else:
                    # have single scope
                    registerColorForScope(keyName, scopeItem, colorValue)
        elif(keyName == "semanticTokenColors"):
            #  FMT: "newOperator": "#0000ff",
            #       "stringLiteral": "#a31515",
            #       "customLiteral": "#000000",
            semanticTokenColorsDict = themeData[keyName]
            print_line("  -- semanticTokenColorsDict: has {} values".format(len(semanticTokenColorsDict)), verbose=True)
            for scopeName in semanticTokenColorsDict.keys():
                colorValue  = semanticTokenColorsDict[scopeName]
                if isinstance(colorValue, dict):
                    colorRaw = ""
                    fontStyle = ""
                    newColorValue = ""
                    if "foreground" in colorValue.keys():
                        colorRaw = colorValue["foreground"]
                        newColorValue = colorRaw
                    if "fontStyle" in colorValue.keys():
                        fontStyle = colorValue["fontStyle"]
                        if colorRaw == "":
                            newColorValue = fontStyle
                        else:
                            newColorValue = colorRaw + " " + fontStyle
                    registerColorForScope(keyName, scopeName, newColorValue)
                else:
                    registerColorForScope(keyName, scopeName, colorValue)
    # done, finish up
    displayColorForScopeInfo()

    if opt_emit:
        displayKeyColorSortList()

    if opt_scopes:
        displayScopesFound()
