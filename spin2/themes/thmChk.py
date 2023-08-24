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


def genNextWriteFilename(filename):
    desiredFilename = ""
    # generate a new name from the file basename
    if os.path.exists(filename):
        basename, filetype = os.path.splitext(filename)
        for suffixNbr in range(1, 11):  # [1-10]
            suffixText = str(suffixNbr).zfill(3)
            tmpFilename = basename + "-" + suffixText + filetype
            if not os.path.exists(tmpFilename):
                desiredFilename = tmpFilename
                break
    return desiredFilename


# -----------------------------------------------------------------------------
#  Parameter Handling
# -----------------------------------------------------------------------------

parser = argparse.ArgumentParser(
    description=script_info, epilog="For further details see: " + project_url
)
parser.add_argument(
    "-v", "--verbose", help="increase output (v)erbosity", action="store_true"
)
parser.add_argument(
    "-a", "--ansii", help="omit (a)nsii output coloring", action="store_true")
parser.add_argument(
    "-e", "--emit", help="(e)mit key, color list for sorting", action="store_true")
parser.add_argument(
    "-s", "--scopes", help="list (s)copes in theme", action="store_true")
parser.add_argument(
    "-d", "--debug", help="show (d)ebug output", action="store_true")
parser.add_argument("-r", "--rewrite",
                    help="(r)ewrite theme file", action="store_true")
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

# have to have an incoming theme to write a new version
if opt_rewrite and not opt_read_theme:
    opt_rewrite = False

# generate name for new theme file
out_filename = ""
out_fp = None
if opt_rewrite and opt_read_theme:
    out_filename = genNextWriteFilename(theme_filename)

# report on options we are using this run
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
    if (opt_logging):
        print_line("* Theme {} - Opened".format(theme_filename), log=True)
else:
    theme_fp = None

# returns JSON object as
# a dictionary
themeTopKeysDict = {}  # keyname:value
stagedNameByScopeDict = {}  # scopeName:fakeNameKey
stagedValuesDict = {}  # fakeNameKey:dict{"name":, "settings":}  w/Name optional
masterColorDict = {}  # colorName:entryDict
# entryDict = {}  # entryName:scopesList
# scopesList = []  # [scopeName, scopeName, ...]


def rememberStageNameForScope(scopeName, stageDictName):
    global stagedNameByScopeDict
    if scopeName in stagedNameByScopeDict:
        print_line(
            "* Duplicate scope in stagedNameByScopeDict, replacing value [{}]".format(scopeName), warning=True)
    stagedNameByScopeDict[scopeName] = stageDictName


def rememberStagedValues(keyName, valueDict):
    global stagedValuesDict
    if keyName in stagedValuesDict:
        print_line(
            "* Duplicate scope in stagedValuesDict, replacing value [{}]".format(keyName), warning=True)
    stagedValuesDict[keyName] = valueDict


def rememberTopKeyWithValue(keyName, value):
    global themeTopKeysDict
    themeTopKeysDict[keyName] = value


def registerColorForScope(entryType, scopeName, colorName):
    # new version
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


def writeNewThemeFile(newTheme_fileName):
    # YES write new theme file sorted by scope in each section
    # NO  write new theme file sorted by color in each section
    print_line(
        "* Writing sorted Theme File {}".format(newTheme_fileName), info=True)
    newTheme_fp = open(out_filename, "w")
    newTheme_fp.write("{\n")
    masterOrder = [
        "$schema",
        "name",
        "semanticHighlighting",
        "type",
        "colors",
        "tokenColors",
        "semanticTokenColors",
    ]
    for keyName in masterOrder:
        if keyName == "colors" or keyName == "tokenColors" or keyName == "semanticTokenColors":
            if keyName in themeTopKeysDict:
                writeThemeSection(newTheme_fp, keyName)
        else:
            if keyName in themeTopKeysDict:
                value = themeTopKeysDict[keyName]
                if value == True or value == False:
                    value = str(value)
                    newTheme_fp.write("  \"" + keyName +
                                      "\": " + value.lower() + ",\n")
                else:
                    newTheme_fp.write("  \"" + keyName +
                                      "\": \"" + value + "\",\n")

    newTheme_fp.write("}\n")
    newTheme_fp.flush()
    newTheme_fp.close()


def writeThemeSection(newTheme_fp, keyName):
    if keyName == "colors":
        newTheme_fp.write("  \"" + keyName + "\": {\n")
        # now dump colors content
        dumpColors(newTheme_fp, keyName)
        newTheme_fp.write("   },\n")
    elif keyName == "tokenColors":
        newTheme_fp.write("  \"" + keyName + "\": [\n")
        # now dump tokenColors content
        dumpTokenColors(newTheme_fp, keyName)
        newTheme_fp.write("   ],\n")
    elif keyName == "semanticTokenColors":
        newTheme_fp.write("  \"" + keyName + "\": {\n")
        # now dump semanticTokenColors content
        dumpSemanticTokenColors(newTheme_fp, keyName)
        newTheme_fp.write("   },\n")
    else:
        print_line("# Error writeThemeSection({}, ...): Unknown Key!".format(
            keyName), error=True)


def dumpColors(newTheme_fp, keyName):
    # masterColorDict = {}  # colorName:entryDict
    # entryDict = {}  # entryName:scopesList
    # scopesList = []  # [scopeName, scopeName, ...]
    colorsByScope = {}
    colorKeys = list(masterColorDict.keys())
    for colorName in colorKeys:
        entryDict = masterColorDict[colorName]
        entryNames = list(entryDict.keys())
        if keyName in entryNames:
            scopesList = entryDict[keyName]
            for scopeName in scopesList:
                colorsByScope[scopeName] = colorName

    # put out a byScope ordered list
    scopeKeys = list(colorsByScope.keys())
    scopeKeys.sort()
    for scopeName in scopeKeys:
        colorName = colorsByScope[scopeName]
        newTheme_fp.write("    \"" + scopeName +
                          "\": \"" + colorName + "\",\n")


def dumpTokenColors(newTheme_fp, keyName):
    # masterColorDict = {}  # colorName:entryDict
    # entryDict = {}  # entryName:scopesList
    # scopesList = []  # [scopeName, scopeName, ...]
    colorsByScope = {}
    colorKeys = list(masterColorDict.keys())
    for colorName in colorKeys:
        entryDict = masterColorDict[colorName]
        entryNames = list(entryDict.keys())
        if keyName in entryNames:
            scopesList = entryDict[keyName]
            for scopeName in scopesList:
                colorsByScope[scopeName] = colorName

    colorScopeKeys = list(colorsByScope.keys())
    scopeKeys = list(stagedNameByScopeDict.keys())
    scopeKeys.sort()
    print_line("* Found {} color scopes and {} fake scopes".format(
        len(colorScopeKeys), len(scopeKeys)), info=True)
    reducedScopeList = scopeKeys    # copy we can alter as we go
    # stagedNameByScopeDict = {}  # scopeName:fakeNameKey
    # stagedValuesDict = {}  # fakeNameKey:dict{"name":, "settings":}  w/Name optional
    while len(reducedScopeList) > 0:
        currScopeName = reducedScopeList.pop(0)
        # we handled this
        fakeName = ""
        if currScopeName in stagedNameByScopeDict:
            fakeName = stagedNameByScopeDict[currScopeName]
        else:
            print_line(
                "* ERROR: [{}] not found in stagedNameByScopeDict".format(currScopeName), error=True)
            os._exit(-1)
        fakeDict = stagedValuesDict[fakeName]
        scopeNameList = scopesWithFakeDictNamed(fakeName)
        for scopeName in scopeNameList:
            if scopeName in reducedScopeList:
                reducedScopeList.remove(scopeName)
        # emit our new dictionary open
        newTheme_fp.write("    {\n")
        # emit name key:value
        if "name" in fakeDict:
            nameValue = fakeDict["name"]
            newTheme_fp.write("      \"name\": \"" + nameValue + "\",\n")
        # emit scope key:value|key:[list]
        if len(scopeNameList) > 1:
            # emit multiple scope lines form
            newTheme_fp.write("      \"scope\": [\n")
            for scopeName in scopeNameList:
                newTheme_fp.write("        \"" + scopeName + "\",\n")
            newTheme_fp.write("      ],\n")
        else:
            # emit single scope lines form
            newTheme_fp.write(
                "      \"scope\": [\"" + scopeNameList[0] + "\"],\n")
        # emit settings key:value
        newTheme_fp.write("      \"settings\": {\n")
        settingsDict = fakeDict["settings"]
        for keyName in settingsDict:
            nameValue = settingsDict[keyName]
            newTheme_fp.write("        \"" + keyName +
                              "\": \"" + nameValue + "\",\n")
        newTheme_fp.write("      },\n")
        # emit our new dictionary close
        newTheme_fp.write("    },\n")


def scopesWithFakeDictNamed(fakeName):
    desiredScopeList = []
    scopeNames = list(stagedNameByScopeDict.keys())
    for scopeName in scopeNames:
        possFakeName = stagedNameByScopeDict[scopeName]
        if possFakeName == fakeName:
            desiredScopeList.append(scopeName)
    if len(desiredScopeList) > 1:
        desiredScopeList.sort()
    return desiredScopeList


def dumpSemanticTokenColors(newTheme_fp, keyName):
    # masterColorDict = {}  # colorName:entryDict
    # entryDict = {}  # entryName:scopesList
    # scopesList = []  # [scopeName, scopeName, ...]
    colorsByScope = {}
    colorKeys = list(masterColorDict.keys())
    for colorName in colorKeys:
        entryDict = masterColorDict[colorName]
        entryNames = list(entryDict.keys())
        if keyName in entryNames:
            scopesList = entryDict[keyName]
            for scopeName in scopesList:
                colorsByScope[scopeName] = colorName
    # put out a byScope ordered list
    scopeKeys = list(colorsByScope.keys())
    scopeKeys.sort()
    # emit non wildcard entries first
    dumpSemanticTokenColorsFiltered(newTheme_fp, scopeKeys, colorsByScope, False)
    # now the wildcard entries
    dumpSemanticTokenColorsFiltered(newTheme_fp, scopeKeys, colorsByScope, True)

def dumpSemanticTokenColorsFiltered(newTheme_fp, scopeKeys, colorsByScope, emitWildcards):
    for scopeName in scopeKeys:
        if "*" in scopeName and emitWildcards == False:
            continue
        if not "*" in scopeName and emitWildcards == True:
            continue
        colorName = colorsByScope[scopeName]
        # if color name has " "  then we have color, style
        #   emit as:
        #     scope: {foreground: color, fontStyle: style}
        # if color name does not have " "  and starts with #
        #   emit as:
        #     scope: color
        if " " in colorName:
            # have color, style
            lineParts = colorName.split(" ")
            newTheme_fp.write("    \"" + scopeName + "\": {\n")
            newTheme_fp.write("      \"foreground\": \"" +
                              lineParts[0] + "\",\n")
            newTheme_fp.write("      \"fontStyle\": \"" +
                              lineParts[1] + "\",\n")
            newTheme_fp.write("    },\n")
        elif "#" in colorName:
            # have color
            newTheme_fp.write("    \"" + scopeName +
                              "\": \"" + colorName + "\",\n")
        else:
            # have style
            newTheme_fp.write("    \"" + scopeName + "\": {\n")
            newTheme_fp.write("      \"fontStyle\": \"" + colorName + "\",\n")
            newTheme_fp.write("    },\n")

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
    masterScopeNamesDict = getScopeNameDict()  # scopeName:occurranceCount
    secondListDict = {}  # scopeName:occurranceCount
    scopeNames = list(masterScopeNamesDict.keys())
    if len(scopeNames) > 1:
        scopeNames.sort()
    for scopeName in scopeNames:
        count = masterScopeNamesDict[scopeName]
        if count > 1:
            secondListDict[scopeName] = count
        else:
            print_line("- {}".format(scopeName), report=True, console=False)
    print_line("* Found {} scope names in [{}]".format(
        len(scopeNames), theme_filename), report=True, console=False)

    print_line("", report=True, console=False)
    scopeNames = list(secondListDict.keys())
    for scopeName in scopeNames:
        count = secondListDict[scopeName]
        print_line("- {}x  {}".format(count, scopeName),
                   report=True, console=False)


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
                        print_line(
                            "  -- {} {} [{}]".format(entryType, scopeName, colorName), report=True, console=False)


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
                print_line(
                    "  -- entry: {} [{}]".format(entryType, scopeName), verbose=True)
                # print_line("    --- scope: [{}]".format(scopeName), verbose=True)
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
                # blank line
                print_line(
                    "---- Error Report ---- file:{}".format(theme_filename), info=True)
                print_line("----", info=True)    # blank line
                print_line("", info=True)    # blank line
                firstError = False
            print_line(
                "- DUPE color entryScope: {}".format(entryScope), info=True)
            for colorName in colorList:
                print_line("  -- color: {}".format(colorName), info=True)
    if (foundError == False):
        print_line("* NO DUPE color entries", info=True)


if theme_fp is not None:
    themeData = jstyleson.load(theme_fp)
    # print_line("- json file [{}]".format(themeData), debug=True)
    for keyName in themeData.keys():
        # print_line("- key [{}]".format(keyName), debug=True)
        if (keyName == "$schema" or keyName == "name" or keyName == "semanticHighlighting"):
            print_line("- {}: {}".format(keyName,
                       themeData[keyName]), verbose=True)
            rememberTopKeyWithValue(keyName, themeData[keyName])

        elif (keyName == "type"):
            rememberTopKeyWithValue(keyName, themeData[keyName])
        elif (keyName == "colors"):
            rememberTopKeyWithValue(keyName, "fakeValue")
            #  FMT:  "checkbox.border": "#919191",
            colorDict = themeData[keyName]
            print_line(
                "  -- colors: has {} values".format(len(colorDict)), verbose=True)
            for scopeName in colorDict.keys():
                # print_line("  --- [{}]: {}".format(scopeName, colorDict[scopeName]), debug=True)
                registerColorForScope(keyName, scopeName, colorDict[scopeName])
        elif (keyName == "tokenColors"):
            rememberTopKeyWithValue(keyName, "fakeValue")
            #  FMT: [{
            #      "scope": ["meta.embedded", "source.groovy.embedded", "string meta.image.inline.markdown"],
            #      "settings": {
            #        "foreground": "#000000ff"
            #      }
            #    },{}]
            # list of anonymous dictionaries
            tokenColorList = themeData[keyName]
            print_line(
                "  -- tokenColors: has {} values".format(len(tokenColorList)), verbose=True)
            dictNumber = 1
            for tokenColorDict in tokenColorList:
                # returns dictionary of color name:value pairs

                # remember details we need later
                stageDictName = "tokenDict" + str(dictNumber).zfill(3)
                stageDict = {}
                nameFound = False
                if "name" in tokenColorDict:
                    stageDict["name"] = tokenColorDict["name"]
                stageDict["settings"] = tokenColorDict["settings"]
                rememberStagedValues(stageDictName, stageDict)
                # now generate color entries
                settingsDict = tokenColorDict["settings"]
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
                # returns string or list of strings
                scopeItem = tokenColorDict["scope"]
                if isinstance(scopeItem, list):
                    # have list of scopes
                    for scopeName in scopeItem:
                        registerColorForScope(keyName, scopeName, colorValue)
                        rememberStageNameForScope(scopeName, stageDictName)
                else:
                    # have single scope
                    registerColorForScope(keyName, scopeItem, colorValue)
                    rememberStageNameForScope(scopeItem, stageDictName)
                dictNumber += 1
        elif (keyName == "semanticTokenColors"):
            rememberTopKeyWithValue(keyName, "fakeValue")
            #  FMT: "newOperator": "#0000ff",
            #       "stringLiteral": "#a31515",
            #       "customLiteral": "#000000",
            semanticTokenColorsDict = themeData[keyName]
            print_line("  -- semanticTokenColorsDict: has {} values".format(
                len(semanticTokenColorsDict)), verbose=True)
            for scopeName in semanticTokenColorsDict.keys():
                colorValue = semanticTokenColorsDict[scopeName]
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

    if opt_rewrite:
        writeNewThemeFile(out_filename)
