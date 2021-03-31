# VSCode Tasks


![Project Maintenance][maintenance-shield]
[![License][license-shield]](LICENSE)


## Automating Build and Download to our P2 development boards

This document is being developed over time as I prove a working environment for each of my target platforms.  I'm expecting to document building on **Windows**, **MacOS**, and **RaspiOS** (the Raspberry Pi OS).

I'm also expecting to document building and download with various tools such as FlexProp, PNut, download with direct attached boards via USB, download via Wifi with the Wx boards attached to our development board, with more compilers as they come ready for multi-platform use, etc.

```
Latest Updates:
31 Mar 2021
- Add PNut on Windows section of document
- Add PATH setting information so our task.json files can have no expectation as to where tools are installed. See: "Setting paths for your P2 Compilers/Tools"
- BUGFIX: Correct the download to RAM tasks
19 Feb 2021
- Adjust flexspin options in tasks file to generate more errors and to generate consistent file paths in error messages
- Add section presenting configuration for running flexspin on Raspberry Pi's
```

### VSCode development of P2 Projects

By choosing to adopt the Custom Tasks described in this document along with the keybindings your work flow is now quite sweet.

- Create a new project
- Add existing files you have already created or are using from P2 Obex.
- Create your new top-level file.
- Add Custom Tasks as shown in this document (adjusting the project specifics in the task examples provided before you use them the first time.

Iterate until your project works as desired:

- Make changes to file(s)
- Compile the files to see if they compile cleanly (cmd-shift-B) on which ever file you are editing
- Once the files compile cleanly
- Download and test (cmd-shift-D) [if you use keybindings shown in examples on this page]

### Being consistent in your machine configuration

I have mostly macs for development but I also have a Windows machine and a number of Raspberry PIs (derived from Debian Linux distro.) and even some larger Ubuntu Machines (also derived from Debian Linux distro.).  If you, like me, intend to be able to run VSCode on may of your development machines and you want to make your life easier then there are a couple of things we know already that can help you.

- **Synchronize your VSCode settings and extensions** automatically by installing and using the **Settings Sync** VScode extension. Any changes you make to one machine then will be sync'd to your other VScode machines.

- **Be very consistent in where you install tools** for each type of OS.  (e.g., for all Windows machines make sure you install say, flexprop, in the same location on each Windows machine.) By being consistant your tasks will run no matter which machine your are running on. 
There is nothing worse than trying to remember where you installed a specific tool on the machine you are currently logged into. Because you install say FlexProp in the same place on all your Raspberry Pi's you will know where to find it no matter which RPi you are logged in to.

    - All like operating systems should have a specific tool installed in the same location on each. (e.g., all Windows machines have Flexspin installed in one location, all macOS machines have FlexSpin installed in a different location that on Windows but it is the same location across all Macs, etc.)
    - During installation of a tool on a machine, finish the process by configuring the PATH to the tool so that terminals/consoles can access the tool by name. This allows VSCode to run the tool from its build tasks.json file without needing to know where the tool is installed!  On Windows machines this is done by editing the User Environment from within the Settings Application. On Mac's and Linux machines (RPi's) this is done by editing the shell configuration file (e.g., Bash you edit the ~/.bashrc file)


### Setting paths for your P2 Compilers/Tools

#### OS: Windows

On windows the search path for programs is maintained by the **Windows Settings App.**  Open Window Settings and search for "environment" and you should see two choices: "**Edit the system environement variables**" and "**Edit enviroment variables for your account**".  If you want the tools to work for all users on this Windows machine then adjust the PATH values by editing the system environement variables.  If, instead, you only need the tools to work for your account then edit the enviroment variables for your account.

**NOTE** *the above is referring to **Windows 10** settings names. On earlier versions of Windows the concept is the same. Locate the environment values and make the appropriate changes.*

#### OS: MacOS

On MacOS this is really shell dependent. I tend to stick with [Bash](https://www.gnu.org/software/bash/manual/html_node/Introduction.html) as I've used it for many 10s of years now.  [zsh](https://scriptingosx.com/2019/06/moving-to-zsh/) (ZShell) is the new shell on the block (*well, new to mac's not a new shell*.) I avoided moving to it but the concepts are the same.

On my Macs I install the flexprop folder into my /Applications folder.  I then edit my .bash_profile and add the following line.  (*I have multiple lines such as this for various tools I've installed.*)

```bash
export PATH=${PATH}:/Applications/Flexprop/bin
```

From here on when I start new terminal windows or VSCode they can now get to the FlexProp binaries by name without using the path to them.

#### OS: RaspiOS

On my raspberry Pi's I run [**rspios**](https://www.raspberrypi.org/software/operating-systems) which is a Debain GNU Linux derived distribution. [Fun! See [The Periodic Table of Liux Distros](https://distrowatch.com/dwres.php?resource=family-tree)]

So, as you might have guessed, I use Bash here too.  On RPi I tend to install special tools from others, as well as those I make, under /opt.  So, in the case of FlexProp I install it on all my RPis into `/opt/flexprop/`.

Unlike my Macs which have .bash_profile, my RPis have, instead, a .profile file.  So here I edit the RPi ~/.profile.  I'm using the pattern for "optionally installed tools" so that I can sync this .profile between my many RPi's.

I edit my ~/.profile and add the path to FlexProp.  (*I have multiple groups of lines such as this for various tools I've installed.*)

```bash
# set PATH so it includes optional install of flexprop/bin if it exists
if [ -d "/opt/flexprop/bin" ] ; then
    PATH="$PATH:/opt/flexprop/bin"
fi
```

From here on when I start new terminal windows or VSCode they can now get to the FlexProp binaries by name without using the path to them.


## Tasks in VScode

A Task is how we integrate with External tools in VScode.

See: [VSCode "Tasks" Reference Page](https://code.visualstudio.com/docs/editor/tasks)

There are a number of types of tasks and places Task definitions live. These include [Auto-detected Tasks](https://code.visualstudio.com/docs/editor/tasks#_task-autodetection), [User level tasks](https://code.visualstudio.com/docs/editor/tasks#_user-level-tasks), and [Custom Tasks](https://code.visualstudio.com/docs/editor/tasks#_custom-tasks).  Tasks when run, can be crafted to depend upon the running of other tasks  See: [Compound Tasks](https://code.visualstudio.com/docs/editor/tasks#_compound-tasks)  Some tasks can be [run in background](https://code.visualstudio.com/docs/editor/tasks#_background-watching-tasks) such as file watchers which execute when a file has been changed.

When you run VScode on multiple operating systems and want to be able to run a projects tasks on whichever machine you are on then you can specify os-specific alternatives to be used withing the task. See [Operating system specific properties](https://code.visualstudio.com/docs/editor/tasks#_operating-system-specific-properties)

...More TBA...

### Invoking tasks

Tasks can be invoked with the search, identify, run technique or they can have keyboard shortcuts assigned to them.  

A project can have a single default build task which is, by default, invoked with command-shift-B. 

We'll configure our compileP2 task to be the default.

We'll add a downloadP2 task and assign command-shift-D to it. It will depend upon the compile task which makes it run first and then we download the newly compiled result.


**TODO1**: We need to ensure download doesn't proceed if compile fails

**TODO2**: We actually need two download tasks: (1) download to RAM, (2) download to FLASH.

#### More Advanced building

**TODO**: We'll also test using the file-watch technoology to automatically compile and download our project files when they are modified.

## P2 Code Development with FlexProp on macOS

To complete your setup so you can use FlexProp on your mac under VScode you'll need to install FlexProp and then:

One time:

- Install a common keybinding (works accross all your P2 projects)
- Optionally add a couple of VSCode extensions if you wish to have the features I demonstrated"
    - "Error Lens" which adds the compile errors messages to the associated line of code
    - "Explorer Exclude" which allows you to hide file types (e.g., .p2asm, .binary) from the explorer panel

For each P2 Project:

- Install a tasks.json file in each of your P2 projects
    - Make sure the names of your compiler and loader binaries are correct
    - Make sure the name of your top-level file is correctly placed in your compileTop and download tasks

### FlexProp install specifics: macOS

The FlexProp toolset does not have a standard installed location. So we will likely have many locations amongst all of us P2 users.  You have to take note of where you installed it and then adjust the following examples to point to where your binaries ended up on your file system.

In my case, on my Mac's, I install the folder at /Applications/Flexprop and I've [set the PATH](https://github.com/ironsheep/P2-vscode-extensions/blob/main/TASKS.md#os-macos) to point to the /Applications/Flexprop/bin directory.  Depending on how you obtained the FlexProp install file you may have bin/flexspin or bin/flexspin.mac and likewise bin/loadp2 or bin/loadp2.mac.  This tasks.json file shows the .mac suffixes. If your install doesn't have them then you will need to modify your `tasks.json` file.  The three lines are: 

- "command": "flexspin.mac",  (in the "compileP2" task)
- "command": "flexspin.mac",  (in the "compileTopP2" task)
- "command": "loadp2.mac",    (in the "downloadP2" task)

Simply remove the .mac suffix if your install doesn't have files with the .mac suffix.

### Top-Level file project specifics

In order to support our notion of top-level file and to prevent us from occassionally compiling and downloading a file other than the project top-level file we've adopted the notion of adding a CompileTopP2 build task.

When we request a download the automation will first compile the top-level project source and its includes producing a new binary. It is this new binary that will be downloaded.

In order to make this work you'll have to customize the CompileTopP2 task (shown below) to name your projects top-level file.

In this example our CompileTopP2 task is compiling "jm\_p2-es\_matrix\_control\_demo.spin2"

You need to find the line containing "jm\_p2-es\_matrix\_control\_demo" and replace this name with the name of your top-level file. 

And you'll have to customize the DownloadP2 task (shown below) to name your projects binary file.

In this example our DownloadP2 task is downloading "jm\_p2-es\_matrix\_control\_demo.binary"

You need to find the line containing "jm\_p2-es\_matrix\_control\_demo" and replace this name with the name of your top-level file. 

**WARNING**: *If you forget to alter the **compileTopP2** or the **downloadP2** tasks to use your filename the downloadP2 invocation of compileTopP2 will simply report an error that it cant find the file named "jm\_p2-es\_matrix\_control\_demo.spin2".*

### Add custom tasks for compileP2, compileTopP2, and downloadP2

In your project folder create a directory named ".vscode" (if it's not already there.)

In this new directory create a "tasks.json" file containing the following contents.

Here is a project-specific file for macOS: `.vscode/tasks.json`

```json
{
    // See https://go.microsoft.com/fwlink/?LinkId=733558
    // for the documentation about the tasks.json format
    "version": "2.0.0",
    "tasks": [
        {
            "label": "compileP2",
            "type": "shell",
            "command": "flexspin.mac",
            "args": [
                "-2",
                "-Wabs-paths",
                "-Wmax-errors=99",
                "${fileBasename}"
            ],
            "problemMatcher": {
                "owner": "Spin2",
                "fileLocation": ["autoDetect", "${workspaceFolder}"],
                "pattern": {
                    "regexp": "^(.*):(\\d+):\\s+(warning|error):\\s+(.*)$",
                    "file": 1,
                    "line": 2,
                    "severity": 3,
                    "message": 4
                }
            },
            "presentation": {
                "panel": "new",
                "focus": true
            },
            "group": {
                "kind": "build",
                "isDefault": true
            }
        },
        {
            "label": "compileTopP2",
            "type": "shell",
            "command": "flexspin.mac",
            "args": [
                "-2",
                "-Wabs-paths",
                "-Wmax-errors=99",
                "jm_p2-es_matrix_control_demo.spin2"
            ],
            "problemMatcher": {
                "owner": "Spin2",
                "fileLocation": ["autoDetect", "${workspaceFolder}"],
                "pattern": {
                    "regexp": "^(.*):(\\d+):\\s+(warning|error):\\s+(.*)$",
                    "file": 1,
                    "line": 2,
                    "severity": 3,
                    "message": 4
                }
            },
            "presentation": {
                "panel": "new",
                "focus": true
            },
        },
        {
            "label": "downloadP2",
            "type": "shell",
            "command": "loadp2.mac",
            "problemMatcher": [],
            "presentation": {
                "panel": "new",
                "focus": true
            },
            "args": [
                "-b230400",
                "jm_p2-es_matrix_control_demo.binary",
                "-t"
            ],
            "dependsOn": [
                "compileTopP2"
            ]
        }
    ]
}
```

This provides the commands to be run for:

- CompileP2 - Compile current file  [cmd-shift-B]
- CompileTopP2 - Compile the top-file of this project
- DownloadP2 - Download the binary to our connected P2  [cmd-shift-D -if keybindings are added.]

As written, download will always be preceeded by a CompileTop.

NOTE: VSCode does not have any concept of top-level file. So we added a custom build task invoked by the downloadP2 task to first compile the top-level file. This task must be customized for each project by configuring the file basename specified in the "args" section of CompileTopP2 task.

### Add Keyboard Shortcut for the Download task

This is the keybinding I used for mapping download to a key sequence.

You get to this file by:

1. Opening the Keyboard shortcuts list [cmd-K, cmd-S or Menu: Code->Preferences->Keyboard Shortcuts]
2. Opening the file Keyboard Shortcuts (JSON) by pressing the document icon left of the play arow icon at the top right of the Keyboard Shortcuts window.

Contents I used for file: **keybindings.json**:

```json
// Place your key bindings in this file to override the defaults
[
    {
        "key": "shift+cmd+d",
        "command": "workbench.action.tasks.runTask",
        "args": "downloadP2"
    }

]
```

*NOTE: if you change the label values in our tasks, more specifically the downloadP2 task, then this file has to be changed as well!*

## P2 Code Development with FlexProp on Windows

To complete your setup so you can use FlexProp on your Windows machine under VScode you'll need to install FlexProp and then:

One time:

- Install a common keybinding (works accross all your P2 projects)
- Optionally add a couple of VSCode extensions if you wish to have the features I demonstrated"
    - "Error Lens" which adds the compile errors messages to the associated line of code
    - "Explorer Exclude" which allows you to hide file types (e.g., .p2asm, .binary) from the explorer panel

For each P2 Project:

- Install a tasks.json file in each of your P2 projects
    - Make sure the name of your top-level file is correctly placed in your compileTop and download tasks

### FlexProp install specifics: Windows

The FlexProp toolset does not have a standard install location. So we will likely have many locations amongst all of us P2 users.  To normalize this you [added a new PATH element](https://github.com/ironsheep/P2-vscode-extensions/blob/main/TASKS.md#os-windows) in your windows settings app. to point to the FlexProp bin directory when you installed flexprop.  These tasks now just expect to be able to reference the executable by name and it will run.

### Top-Level file project specifics

In order to support our notion of top-level file and to prevent us from occassionally compiling and downloading a file other than the project top-level file we've adopted the notion of adding a CompileTopP2 build task.

When we request a download the automation will first compile the top-level project source and its includes producing a new binary. It is this new binary that will be downloaded.

In order to make this work you'll have to customize the CompileTopP2 task (shown below) to name your projects top-level file.

In this example our CompileTopP2 task is compiling "jm\_p2-es\_matrix\_control\_demo.spin2"

You need to find the line containing "jm\_p2-es\_matrix\_control\_demo" and replace this name with the name of your top-level file. 

And you'll have to customize the DownloadP2 task (shown below) to name your projects binary file.

In this example our DownloadP2 task is downloading "jm\_p2-es\_matrix\_control\_demo.binary"

You need to find the line containing "jm\_p2-es\_matrix\_control\_demo" and replace this name with the name of your top-level file. 

**WARNING**: *If you forget to alter the **compileTopP2** or the **downloadP2** tasks to use your filename the downloadP2 invocation of compileTopP2 will simply report an error that it cant find the file named "jm\_p2-es\_matrix\_control\_demo.spin2".*

### Add custom tasks for compileP2, compileTopP2, and downloadP2

In your project folder create a directory named ".vscode" (if it's not already there.)

In this new directory create a "tasks.json" file containing the following contents.

**NOTE** *three OSes are supported by VScode task files: "osx", "linux", and "windows".
I have mostly mac machines so I use the defult for OSX forms and I provide overrides for "windows" and "linux" forms.*

Here is a project-specific file for macOS/Windows: **.vscode/tasks.json**

```json
{
    // See https://go.microsoft.com/fwlink/?LinkId=733558
    // for the documentation about the tasks.json format
    "version": "2.0.0",
    "tasks": [
        {
            "label": "compileP2",
            "type": "shell",
            "command": "flexspin.mac",
            "windows": {
                "command": "flexspin.exe",
            },
            "args": [
                "-2",
                "-Wabs-paths",
                "-Wmax-errors=99",
                "${fileBasename}"
            ],
            "problemMatcher": {
                "owner": "Spin2",
                "fileLocation": ["autoDetect", "${workspaceFolder}"],
                "pattern": {
                    "regexp": "^(.*):(\\d+):\\s+(warning|error):\\s+(.*)$",
                    "file": 1,
                    "line": 2,
                    "severity": 3,
                    "message": 4
                }
            },
            "presentation": {
                "panel": "new",
                "focus": true
            },
            "group": {
                "kind": "build",
                "isDefault": true
            }
        },
        {
            "label": "compileTopP2",
            "type": "shell",
            "command": "flexspin.mac",
            "windows": {
                "command": "flexspin.exe",
            },
            "args": [
                "-2",
                "-Wabs-paths",
                "-Wmax-errors=99",
                "jm_p2-es_matrix_control_demo.spin2"
            ],
            "problemMatcher": {
                "owner": "Spin2",
                "fileLocation": ["autoDetect", "${workspaceFolder}"],
                "pattern": {
                    "regexp": "^(.*):(\\d+):\\s+(warning|error):\\s+(.*)$",
                    "file": 1,
                    "line": 2,
                    "severity": 3,
                    "message": 4
                }
            },
            "presentation": {
                "panel": "new",
                "focus": true
            },
        },
        {
            "label": "downloadP2",
            "type": "shell",
            "command": "loadp2.mac",
            "windows": {
                "command": "loadp2.exe",
            },
            "problemMatcher": [],
            "presentation": {
                "panel": "new",
                "focus": true
            },
            "args": [
                "-b230400",
                "jm_p2-es_matrix_control_demo.binary",
                "-t"
            ],
            "dependsOn": [
                "compileTopP2"
            ]
        }
    ]
}
```

This provides the commands to be run for:

- CompileP2 - Compile current file  [ctrl-shift-B]
- CompileTopP2 - Compile the top-file of this project
- DownloadP2 - Download the binary to our connected P2  [ctrl-shift-D -if keybindings are added.]

As written, download will always be preceeded by a CompileTop.

NOTE: VSCode does not have any concept of top-level file. So we added a custom build task invoked by the downloadP2 task to first compile the top-level file. This task must be customized for each project by configuring the file basename specified in the "args" section of CompileTopP2 task.

### Add Keyboard Shortcut for the Download task

This is the keybinding I used for mapping download to a key sequence.

You get to this file by:

1. Opening the Keyboard shortcuts list [ctrl-K, ctrl-S or Menu: Code->Preferences->Keyboard Shortcuts]
2. Opening the file Keyboard Shortcuts (JSON) by pressing the document icon left of the play arow icon at the top right of the Keyboard Shortcuts window.

Contents I used for file: **keybindings.json**:

```json
// Place your key bindings in this file to override the defaults
[
    {
        "key": "ctrl+shift+d",
        "command": "workbench.action.tasks.runTask",
        "args": "downloadP2"
    }

]
```

*NOTE: if you change the label values in our tasks, more specifically the downloadP2 task, then this file has to be changed as well!*


## P2 Code Development with FlexProp on Raspberry Pi

To complete your setup so you can use FlexProp on your Raspberry Pi under VScode you'll need to install FlexProp and then:

One time:

- Install a common keybinding (works accross all your P2 projects)
- Optionally add a couple of VSCode extensions if you wish to have the features I demonstrated"
    - "Error Lens" which adds the compile errors messages to the associated line of code
    - "Explorer Exclude" which allows you to hide file types (e.g., .p2asm, .binary) from the explorer panel

For each P2 Project:

- Install a tasks.json file in each of your P2 projects
    - Make sure the name of your top-level file is correctly placed in your compileTop and download tasks

    
### The Rasperry Pi OS

On my raspberry Pi's I run **rspios** as distributed by [raspberrypi.org](https://www.raspberrypi.org/) from the [downloads page](https://www.raspberrypi.org/software/operating-systems)

I tend to want the best performance from my gear so on my RPi-3's and RPi-4's I tend to run the 64bit raspios.

I've been doing this for quite a while and have a small farm of RPi's. I tend to place the image on a uSD card and then boot from it initially with a keyboard and screen attached.  I then "welcome" my new machine to my network and time zone and give it a hostname unique and generally fortelling of this purpose of this new RPi.  I also end up running the classic update sequence to ensure my new machine has the latest software available as well as all the latest security patches:

```bash
# my update process which I run each time when I first log into my machine after a bit of time away
$ sudo apt-get update
$ sudo apt-get dist-upgrade
```

After the new RPi can boot and automatically attach to my network I then remove the screen and keyboard.  I run most my RPi's remotely and "headless" (meaning no screen/keyboard attached.)

### FlexProp install specifics: Raspberry Pi

Installing the FlexProp toolset on the Raspberry Pi (*raspos, or any debian derivative, Ubuntu, etc.*) is a breeze when you follow [Eric's instructions that just work!](https://github.com/totalspectrum/flexprop#building-from-source)

In my case, I used Eric's suggestion to instruct the build/install process to install to /opt/flexprop. When you get to the build step in his instructions use:

 ```bash
 $ make install INSTALL=/opt/flexprop
 ```
 
Additionally, I [added a new PATH element](https://github.com/ironsheep/P2-vscode-extensions/blob/main/TASKS.md#os-raspios) in my ~/.profile file to point to the FlexProp bin directory.  These tasks now just expect to be able to reference the executable by name and it will run.

### Top-Level file project specifics

In order to support our notion of top-level file and to prevent us from occassionally compiling and downloading a file other than the project top-level file we've adopted the notion of adding a CompileTopP2 build task.

When we request a download the automation will first compile the top-level project source and its includes producing a new binary. It is this new binary that will be downloaded.

In order to make this work you'll have to customize the CompileTopP2 task (shown below) to name your projects top-level file.

In this example our CompileTopP2 task is compiling "jm\_p2-es\_matrix\_control\_demo.spin2"

You need to find the line containing "jm\_p2-es\_matrix\_control\_demo" and replace this name with the name of your top-level file. 

And you'll have to customize the DownloadP2 task (shown below) to name your projects binary file.

In this example our DownloadP2 task is downloading "jm\_p2-es\_matrix\_control\_demo.binary"

You need to find the line containing "jm\_p2-es\_matrix\_control\_demo" and replace this name with the name of your top-level file. 

**WARNING**: *If you forget to alter the **compileTopP2** or the **downloadP2** tasks to use your filename the downloadP2 invocation of compileTopP2 will simply report an error that it cant find the file named "jm\_p2-es\_matrix\_control\_demo.spin2".*

### Add custom tasks for compileP2, compileTopP2, and downloadP2

In your project folder create a directory named ".vscode" (if it's not already there.)

In this new directory create a "tasks.json" file containing the following contents.

**NOTE** *three OSes are supported by VScode task files: "osx", "linux", and "windows".
I have mostly mac machines so I use the defult for OSX forms and I provide overrides for "windows" and "linux" forms.  However, in the folloing file I simply explicitly declared all three OSes.*

Here is a project-specific file for macOS/Windows: **.vscode/tasks.json**

```json
{
    // See https://go.microsoft.com/fwlink/?LinkId=733558
    // for the documentation about the tasks.json format
    "version": "2.0.0",
    "tasks": [
        {
            "label": "compileP2",
            "type": "shell",
    		  "osx": {
                "command": "flexspin.mac",
    		  },
    		  "windows": {
                "command": "flexspin.exe",
    		  },            
    		  "linux": {
                "command": "flexspin",
    		  },
            "args": [
                "-2",
                "-Wabs-paths",
                "-Wmax-errors=99",
                "${fileBasename}"
            ],
            "problemMatcher": {
                "owner": "Spin2",
                "fileLocation": ["autoDetect", "${workspaceFolder}"],
                "pattern": {
                    "regexp": "^(.*):(\\d+):\\s+(warning|error):\\s+(.*)$",
                    "file": 1,
                    "line": 2,
                    "severity": 3,
                    "message": 4
                }
            },
            "presentation": {
                "panel": "new",
                "focus": true
            },
            "group": {
                "kind": "build",
                "isDefault": true
            }
        },
        {
            "label": "compileTopP2",
            "type": "shell",
            "osx": {
                "command": "flexspin.mac",
            },
            "windows": {
                "command": "flexspin.exe",
            },
            "linux": {
                "command": "flexspin",
            },
            "args": [
                "-2",
                "-Wabs-paths",
                "-Wmax-errors=99",
                "jm_p2-es_matrix_control_demo.spin2"
            ],
            "problemMatcher": {
                "owner": "Spin2",
                "fileLocation": ["autoDetect", "${workspaceFolder}"],
                "pattern": {
                    "regexp": "^(.*):(\\d+):\\s+(warning|error):\\s+(.*)$",
                    "file": 1,
                    "line": 2,
                    "severity": 3,
                    "message": 4
                }
            },
            "presentation": {
                "panel": "new",
                "focus": true
            },
        },
        {
            "label": "downloadP2",
            "type": "shell",
            "osx": {
                "command": "loadp2.mac",
            },
            "windows": {
                "command": "loadp2.exe",
            },
            "linux": {
                "command": "loadp2",
            },
            "problemMatcher": [],
            "presentation": {
                "panel": "new",
                "focus": true
            },
            "args": [
                "-b230400",
                "jm_p2-es_matrix_control_demo.binary",
                "-t"
            ],
            "dependsOn": [
                "compileTopP2"
            ]
        }
    ]
}
```

This provides the commands to be run for:

- CompileP2 - Compile current file  [ctrl-shift-B]
- CompileTopP2 - Compile the top-file of this project
- DownloadP2 - Download the binary to our connected P2  [ctrl-shift-D -if keybindings are added.]

As written, download will always be preceeded by a CompileTop.

NOTE: VSCode does not have any concept of top-level file. So we added a custom build task invoked by the downloadP2 task to first compile the top-level file. This task must be customized for each project by configuring the file basename specified in the "args" section of CompileTopP2 task.

### Add Keyboard Shortcut for the Download task

This is the keybinding I used for mapping download to a key sequence.

You get to this file by:

1. Opening the Keyboard shortcuts list [ctrl-K, ctrl-S or Menu: Code->Preferences->Keyboard Shortcuts]
2. Opening the file Keyboard Shortcuts (JSON) by pressing the document icon left of the play arow icon at the top right of the Keyboard Shortcuts window.

Contents I used for file: **keybindings.json**:

```json
// Place your key bindings in this file to override the defaults
[
    {
        "key": "ctrl+shift+d",
        "command": "workbench.action.tasks.runTask",
        "args": "downloadP2"
    }

]
```

*NOTE: if you change the label values in our tasks, more specifically the downloadP2 task, then this file has to be changed as well!*


## P2 Code Development with PNut on Windows

To complete your setup so you can use PNut on your Windows machine under VScode you'll need to install PNut and then:

One time:

- Install a common keybinding (works accross all your P2 projects)
- Optionally add a couple of VSCode extensions if you wish to have the features I demonstrated"
    - "Error Lens" which adds the compile errors messages to the associated line of code
    - "Explorer Exclude" which allows you to hide file types (e.g., .p2asm, .binary) from the explorer panel

For each P2 Project:

- Install a tasks.json file in each of your P2 projects
    - Make sure the name of your top-level file is correctly placed in your compileTop, download and flash tasks


### PNut install specifics: Windows

The PNut compiler/debug tool does not have a standard install location. So we will likely have many locations amongst all of us P2 users.  To normalize this you [added a new PATH element](https://github.com/ironsheep/P2-vscode-extensions/blob/main/TASKS.md#os-windows) in your windows settings app. to point to the PNUt directory when you installed PNut.  These tasks now just expect to be able to reference the batch file by name and it will run.

### Top-Level file project specifics

In order to support our notion of top-level file and to prevent us from occassionally compiling and downloading a file other than the project top-level file we've adopted the notion of adding a CompileTopP2 build task.

When we request a download the automation will first compile the top-level project source and its includes producing a new binary. It is this new binary that will be downloaded.

In order to make this work you'll have to customize the CompileTopP2 task (shown below) to name your projects top-level file.

In this example our CompileTopP2 task is compiling "jm\_p2-es\_matrix\_control\_demo.spin2"

You need to find the line containing "jm\_p2-es\_matrix\_control\_demo" and replace this name with the name of your top-level file. 

And you'll have to customize the downloadP2 and flashP2 tasks (shown below) to name your projects top-level file.

In this example our DownloadP2 and flashP2 tasks are downloading "jm\_p2-es\_matrix\_control\_demo.spin2"

You need to find the line containing "jm\_p2-es\_matrix\_control\_demo" and replace this name with the name of your top-level file for both tasks.

**WARNING**: *If you forget to alter the **compileTopP2**, **downloadP2** or the **flashP2** tasks to use your filename the downloadP2 invocation of compileTopP2 will simply report an error that it cant find the file named "jm\_p2-es\_matrix\_control\_demo.spin2".*

### Add custom tasks for compileP2, compileTopP2, downloadP2, and flashP2

In your project folder create a directory named ".vscode" (if it's not already there.)

In this new directory create a "tasks.json" file containing the following contents.

Here is a project-specific file for macOS/Windows: **.vscode/tasks.json**

```json
{
    // See https://go.microsoft.com/fwlink/?LinkId=733558
    // for the documentation about the tasks.json format
    "version": "2.0.0",
    "tasks": [
        {
            "label": "compileP2",
            "type": "shell",
            "windows": {
                "command": "pnut_shell.bat"
            },
            "args": [
                "${fileBasename}",
                "-c"
            ],
            "problemMatcher": {
                "owner": "Spin2",
                "fileLocation": ["autoDetect", "${workspaceFolder}"],
                "pattern": {
                    "regexp": "^(.*):(\\d+):\\s*(warning|error):\\s*(.*)$",
                    "file": 1,
                    "line": 2,
                    "severity": 3,
                    "message": 4
                }
            },
            "presentation": {
                "panel": "new",
                "focus": true
            },
            "group": {
                "kind": "build",
                "isDefault": true
            }
        },
        {
            "label": "compileTopP2",
            "type": "shell",
            "windows": {
                "command": "pnut_shell.bat"
            },
            "args": [
                "jm_p2-es_matrix_control_demo.spin22"
                "-c"
            ],
            "problemMatcher": {
                "owner": "Spin2",
                "fileLocation": ["autoDetect", "${workspaceFolder}"],
                "pattern": {
                    "regexp": "^(.*):(\\d+):\\s+(warning|error):\\s+(.*)$",
                    "file": 1,
                    "line": 2,
                    "severity": 3,
                    "message": 4
                }
            },
            "presentation": {
                "panel": "new",
                "focus": true
            }
        },
        {
            "label": "downloadP2",
            "type": "shell",
            "windows": {
                "command": "pnut_shell.bat"
            },
            "problemMatcher": {
                "owner": "Spin2",
                "fileLocation": ["autoDetect", "${workspaceFolder}"],
                "pattern": {
                    "regexp": "^(.*):(\\d+):\\s+(warning|error):\\s+(.*)$",
                    "file": 1,
                    "line": 2,
                    "severity": 3,
                    "message": 4
                }
            },
            "presentation": {
                "panel": "new",
                "focus": true
            },
            "args": [
                "jm_p2-es_matrix_control_demo.spin22",
                "-r"
            ]
        },
        {
            "label": "flashP2",
            "type": "shell",
            "windows": {
                "command": "pnut_shell.bat"
            },
            "problemMatcher": {
                "owner": "Spin2",
                "fileLocation": ["autoDetect", "${workspaceFolder}"],
                "pattern": {
                    "regexp": "^(.*):(\\d+):\\s+(warning|error):\\s+(.*)$",
                    "file": 1,
                    "line": 2,
                    "severity": 3,
                    "message": 4
                }
            },
            "presentation": {
                "panel": "new",
                "focus": true
            },
            "args": [
                "jm_p2-es_matrix_control_demo.spin22",
                "-f"
            ]
        }
    ]
}
```

This provides the commands to be run for:

- CompileP2 - Compile current file  [ctrl-shift-B]
- CompileTopP2 - Compile the top-file (and all included files) of this project
- DownloadP2 - Compile the top-file and Download the program to our connected P2  [ctrl-shift-D -if keybindings are added.]
- FlashP2 - Compile the top-file, Download and write the program to flash on our connected P2  [ctrl-shift-F -if keybindings are added.]

**NOTE** for PNut a download is also a compile so these download and flash tasks do not depend upon the CompleTopP2 task!

**NOTE2** these downloadP2 and flashP2 tasks do NOT enable debug support. The option `-r` is run without debug while `-rd` is run with debug. Likewise, the option `-f` is compile and flash without debug while `-fd` is compile and flash with debug.  Please adjust these values in the task `args:` sections to your need (using debug or not)

**TODO** let's make debug a custom VSCode setting and use the setting in this script to enable/disable debug compilation/use??

NOTE: VSCode does not have any concept of top-level file. So we added a custom build task invoked by the downloadP2 task to first compile the top-level file. This task must be customized for each project by configuring the file basename specified in the "args" section of CompileTopP2 task.

### Add Keyboard Shortcut for the Download task

This is the keybinding I used for mapping download to a key sequence.

You get to this file by:

1. Opening the Keyboard shortcuts list [ctrl-K, ctrl-S or Menu: Code->Preferences->Keyboard Shortcuts]
2. Opening the file Keyboard Shortcuts (JSON) by pressing the document icon left of the play arow icon at the top right of the Keyboard Shortcuts window.

Contents I used for file: **keybindings.json**:

```json
// Place your key bindings in this file to override the defaults
[
    {
        "key": "ctrl+shift+d",
        "command": "workbench.action.tasks.runTask",
        "args": "downloadP2"
    },
    {
        "key": "ctrl+shift+f",
        "command": "workbench.action.tasks.runTask",
        "args": "flashP2"
    }

]
```

*NOTE: if you change the label values in our tasks, more specifically the downloadP2 or flashP2 tasks, then this file has to be changed as well!*


## License

Copyright © 2021 Iron Sheep Productions, LLC. All rights reserved.<br />
Licensed under the MIT License. <br>
<br>
Follow these links for more information:

### [Copyright](copyright) | [License](LICENSE)



[maintenance-shield]: https://img.shields.io/badge/maintainer-stephen%40ironsheep%2ebiz-blue.svg?style=for-the-badge

[license-shield]: https://camo.githubusercontent.com/bc04f96d911ea5f6e3b00e44fc0731ea74c8e1e9/68747470733a2f2f696d672e736869656c64732e696f2f6769746875622f6c6963656e73652f69616e74726963682f746578742d646976696465722d726f772e7376673f7374796c653d666f722d7468652d6261646765
