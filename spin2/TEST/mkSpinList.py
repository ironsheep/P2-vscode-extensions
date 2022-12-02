#!/usr/bin/env python3
import sys
import os
import argparse

from time import time, sleep, localtime, strftime
from colorama import Fore, Back, Style

# v0.0.1 - awaken email send
# v0.0.2 - add file handling

script_version  = "0.0.1"
script_name     = 'mkSpinList.py'
script_info     = '{} v{}'.format(script_name, script_version)
project_name    = 'Make List of spin/spin2 files for certification'
project_url     = ''

if False:
    # will be caught by python 2.7 to be illegal syntax
    print_line('Sorry, this script requires a python3 runtime environment.', file=sys.stderr)
    os._exit(1)

# -----------------------------------------------------------------------------
# the ABOVE are identical to that found in our gateway .spin2 object
# -----------------------------------------------------------------------------
#   Colorama constants:
#  Fore: BLACK, RED, GREEN, YELLOW, BLUE, MAGENTA, CYAN, WHITE, RESET.
#  Back: BLACK, RED, GREEN, YELLOW, BLUE, MAGENTA, CYAN, WHITE, RESET.
#  Style: DIM, NORMAL, BRIGHT, RESET_ALL
#
# Logging function
def print_line(text, error=False, warning=False, info=False, verbose=False, debug=False, console=True):
    timestamp = strftime('%Y-%m-%d %H:%M:%S', localtime())
    if console:
        if error:
            print(Fore.RED + Style.BRIGHT + '[{}] '.format(timestamp) + Style.NORMAL + '{}'.format(text) + Style.RESET_ALL, file=sys.stderr)
        elif warning:
            print(Fore.YELLOW + Style.BRIGHT + '[{}] '.format(timestamp) + Style.NORMAL + '{}'.format(text) + Style.RESET_ALL)
        elif info or verbose:
            if verbose:
                # conditional verbose output...
                if opt_verbose:
                    print(Fore.GREEN + '[{}] '.format(timestamp) + Fore.YELLOW  + '- ' + '{}'.format(text) + Style.RESET_ALL)
            else:
                # info...
                print(Fore.MAGENTA + '[{}] '.format(timestamp) + Fore.WHITE  + '- ' + '{}'.format(text) + Style.RESET_ALL)
        elif debug:
            # conditional debug output...
            if opt_debug:
                print(Fore.CYAN + '[{}] '.format(timestamp) + '- (DBG): ' + '{}'.format(text) + Style.RESET_ALL)
        else:
            print(Fore.GREEN + '[{}] '.format(timestamp) + Style.RESET_ALL + '{}'.format(text) + Style.RESET_ALL)

# -----------------------------------------------------------------------------
#  Script Argument parsing
# -----------------------------------------------------------------------------

# Argparse
opt_debug = False
opt_verbose = False
opt_useTestFile = False
opt_write = False
opt_topdir = False

default_empty_fspec = ''

# Argparse
parser = argparse.ArgumentParser(description=project_name, epilog='For further details see: ' + project_url)
parser.add_argument("-v", "--verbose", help="increase output verbosity", action="store_true")
parser.add_argument("-d", "--debug", help="show debug output", action="store_true")
parser.add_argument("-o", "--outfile", help="specify output file name", default=default_empty_fspec)
parser.add_argument("-r", "--rootdir", help="specify starting root directory", default=default_empty_fspec)
parse_args = parser.parse_args()

opt_verbose = parse_args.verbose
opt_debug = parse_args.debug
output_filename = parse_args.outfile
root_dirspec = parse_args.rootdir
if len(output_filename) > 0:
    opt_write = True
if len(root_dirspec) > 0:
    opt_topdir = True

print_line(script_info, info=True)
if opt_verbose:
    print_line('Verbose enabled', verbose=True)
if opt_debug:
    print_line('Debug enabled', debug=True)

if not opt_write:
    print_line('ERROR: need output filename, missing -o directive', error=True)
    os._exit(1)

if not opt_topdir:
    print_line('ERROR: need top folder name to list, missing -t directive', error=True)
    os._exit(1)

write_fp = open(output_filename,'w')

def writeFinding(message):
    write_fp.write('{}\n'.format(message))
    write_fp.flush()

def contentsOfDir(dirSpec):
    folderSpecList = []
    fileSpecList = []
    folder_content = os.listdir(dirSpec)
    for filename in folder_content:
        fileSpec = os.path.join(dirSpec, filename)
        if os.path.isdir(fileSpec):
            folderSpecList.append(fileSpec)
        elif os.path.isfile(fileSpec):
            fileSpecList.append(filename)
        else:
            print_line('WARNING: Skipping unknown name=[{}/{}]'.format(dirSpec, fileSpec), warning=True)
    print_line('files=[{}]'.format(fileSpecList), debug=True)
    print_line('folders=[{}]'.format(folderSpecList), debug=True)
    return (fileSpecList, folderSpecList)

def spinFilesInList(fileSpecList):
    spinFileSpecList = []
    for filename in fileSpecList:
        if filename.endswith('spin2') or filename.endswith('spin'):
            spinFileSpecList.append(filename)
    return spinFileSpecList

def listFilenames(fileSpecList):
    if len(fileSpecList) > 0:
        fileList = spinFilesInList(fileSpecList)
        sortedList = sorted(fileList, key=str.casefold)
        for filename in sortedList:
            writeFinding('\t\t- {}'.format(filename))

dirname = os.path.dirname(root_dirspec)
basename = os.path.basename(root_dirspec)
writeFinding('Spin/SPin2 files in FOLDER:\n Root {}:\n {}:'.format(dirname, basename))
fileSpecList, folderSpecList = contentsOfDir(root_dirspec)

if len(fileSpecList) > 0:
    listFilenames(fileSpecList)

sortedFolderSpecList = sorted(folderSpecList, key=str.casefold)

for dirspec in sortedFolderSpecList:
    basename = os.path.basename(dirspec)
    print_line('Scanning folder=[{}]   {}'.format(basename, dirspec), verbose=True)
    fileSpecList, folderSpecList = contentsOfDir(dirspec)
    print_line('files=[{}]'.format(fileSpecList), debug=True)
    print_line('folders=[{}]'.format(folderSpecList), debug=True)

    spinFileSpecs = spinFilesInList(fileSpecList)
    if len(spinFileSpecs) > 0 and not basename.startswith('.'):
        writeFinding('\n {}:'.format(basename))
        listFilenames(spinFileSpecs)


write_fp.close()
