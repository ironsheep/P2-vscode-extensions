# VSCode Tasks


![Project Maintenance][maintenance-shield]
[![License][license-shield]](LICENSE)

##Automating Build and Download to our P2 development boards

This document is being developed over time as I prove a working environment for each of my target platforms.  I'm expecting to document building on Windows, MacOS, and RaspberryPiOS.

I'm also expecting to document building and download with various tools such as Flexspin, download with direct attached boards via USB, download via Wifi with the Wx boards attached to our development board, with more compilers as they come ready for multi-platform use, etc.

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
- Download and test (cmd-shift-D) [if you use keybinds shown in examples on this page]

### Being consistent in your machine configuration

I have mostly macs for development but I also have a Windows machine and a number of Raspberry PIs (derived from Debian Linux distro.) and even some larger Ubuntu Machines (also derived from Debian Linux distro.).  If you, like me, intend to be able to run VSCode on may of your development machines and you want to make your life easier then there are a couple of things we know already that can help you.

- **Synchronize your VSCode settings and extensions** automatically by installing and using the **Settings Sync** VScode extension. Any changes you make to one machine then will be sync'd to your other VScode machines.

- **Be very consistent in where you install tools** for each type of OS.  (e.g., for all Windows machines make sure you install say, flexprop, in the same location on each Windows machine.) By being consitant you tasks will run no matter which machine your are running on.  This is because tasks have some hard-coded or path-specific information in them which then needs to work everywhere you run.
    - all like operating systems should have a specific tool installed in the same location on each. (e.g., all Windows machines have Flexspin installed in one location, all macOS machines have FlexSpin installed in a different location that on Windows but it is the same location across all Macs, etc.)

**TODO** *Ensure we are setting up envinronment paths to tools so shells can locate the binaries without path information. This would allow us to remove some path-specifics from our task definitions.*


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

TODO: we need to ensure download doesn't proceed if compile fails

#### More Advanced building

We'll also test using the file-watch technoology to automatically compile and download our project files when they are modified.

## P2 Code Development with FlexProp on macOS

To complete your setup so you can use FlexProp on your mac under VScode you'll need to install FlexProp and then:

One time:

- Install a common keybinding (works accross all your P2 projects)
- Optionally add a couple of VSCode extensions if you wish to have the features I demonstrated"
    - "Error Lens" which adds the compile errors messages to the associated line of code
    - "Explorer Exclude" which allows you to hide file types (e.g., .p2asm, .binary) from the explorer panel

For each P2 Project:

- Install a tasks.json file in each of your P2 projects
    - Make sure your path to the compiler of your choice is correct
    - Make sure the name of your top-level file is correctly placed in your compileTop task  

### FlexProp install specifics: macOS

The FlexProp toolset does not have a standard installed location. So we will likely have many locations amongst all of us P2 users.  You have to take note of where you installed it and then adjust the following examples to point to where your binaries ended up on your file system.

In my case, on my Mac's, I install the folder at /Applications/Flexprop. Yours will likely be different.  If it is different you will need to modify your `tasks.json` file.  The three lines are: 

- "command": "{installPath}/bin/flexspin.mac",  (in the "compileP2" task)
- "command": "{installPath}/bin/flexspin.mac",  (in the "compileTopP2" task)
- "command": "{installPath}/bin/loadp2.mac",    (in the "downloadP2" task)

Simply replace {installPath} with your own install path (the folder containing the bin folder).

### Top-Level file project specifics

In order to support our notion of top-level file and to prevent us from occassionally compiling and downloading a file other than the project top-level file we've adopted the notion of adding a CompileTopP2 build task.

When we request a download the automation will first compile the top-level project source and its includes producing a new binary. It is this new binary that will be downloaded.

In order to make this work you'll have to customize the CompileTopP2 task (shown below) to name your projects top-level file.

In this example our CompileTopP2 task is compiling "jm\_p2-es\_matrix\_control\_demo.spin"

You need to find the line containing "jm\_p2-es\_matrix\_control\_demo" and replace this name with the name of your top-level file. 

**WARNING**: *If you forget to alter the compileTopP2  task to use your filename the downloadP2 invocation of compileTopP2 will simply report an error that it cant find the file named "jm\_p2-es\_matrix\_control\_demo.spin".*

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
            "command": "/Applications/Flexprop/bin/flexspin.mac",
            "args": [
                "-2",
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
            "command": "/Applications/Flexprop/bin/flexspin.mac",
            "args": [
                "-2",
                "jm_p2-es_matrix_control_demo.spin"
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
            "command": "/Applications/Flexprop/bin/loadp2.mac",
            "problemMatcher": [],
            "presentation": {
                "panel": "new",
                "focus": true
            },
            "args": [
                "-b230400",
                "${fileBasenameNoExtension}.binary",
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

As written download will always be preceeded by a CompileTop.

*Behavior Note: The task problem matchers now use 'autoDetect' so we can handle Flexspin's mix of relative and absolute file specifications within error messages.*

TODO: *the compiler as driven by the compileP2 task stops on first error. I am unable to locate option to generate all errors before stop so I [filed an issue](https://github.com/totalspectrum/spin2cpp/issues/116) requesting one if it's not present.*

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

To complete your setup so you can use FlexProp on your mac under VScode you'll need to install FlexProp and then:

One time:

- Install a common keybinding (works accross all your P2 projects)
- Optionally add a couple of VSCode extensions if you wish to have the features I demonstrated"
    - "Error Lens" which adds the compile errors messages to the associated line of code
    - "Explorer Exclude" which allows you to hide file types (e.g., .p2asm, .binary) from the explorer panel

For each P2 Project:

- Install a tasks.json file in each of your P2 projects
    - Make sure your path to the compiler of your choice is correct
    - Make sure the name of your top-level file is correctly placed in your compileTop task  

### FlexProp install specifics: Windows

The FlexProp toolset does not have a standard install location. So we will likely have many locations amongst all of us P2 users.  You have to take note of where you installed it and then adjust the following examples to point to where your binaries ended up on your file system.

In my case, on my Windows machine, I installed the folder at C:\\Users\\smmor\\ProgramFiles\\flexprop. Yours will be different.  You will need to modify your `tasks.json` file.  The three lines are: 

- "command": "{installPath}\\bin\\flexspin.exe",  (in the "compileP2" task)
- "command": "{installPath}\\bin\\flexspin.exe",  (in the "compileTopP2" task)
- "command": "{installPath}\\bin\\loadp2.exe",    (in the "downloadP2" task)

Simply replace {installPath} with your own install path (the folder containing the bin folder).

### Top-Level file project specifics

In order to support our notion of top-level file and to prevent us from occassionally compiling and downloading a file other than the project top-level file we've adopted the notion of adding a CompileTopP2 build task.

When we request a download the automation will first compile the top-level project source and its includes producing a new binary. It is this new binary that will be downloaded.

In order to make this work you'll have to customize the CompileTopP2 task (shown below) to name your projects top-level file.

In this example our CompileTopP2 task is compiling "jm\_p2-es\_matrix\_control\_demo.spin"

You need to find the line containing "jm\_p2-es\_matrix\_control\_demo" and replace this name with the name of your top-level file. 

**WARNING**: *If you forget to alter the compileTopP2  task to use your filename the downloadP2 invocation of compileTopP2 will simply report an error that it cant find the file named "jm\_p2-es\_matrix\_control\_demo.spin".*

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
            "command": "/Applications/Flexprop/bin/flexspin.mac",
            "windows": {
                "command": "C:\\Users\\smmor\\ProgramFiles\\flexprop\\bin\\flexspin.exe",
            },
            "args": [
                "-2",
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
            "command": "/Applications/Flexprop/bin/flexspin.mac",
            "windows": {
                "command": "C:\\Users\\smmor\\ProgramFiles\\flexprop\\bin\\flexspin.exe",
            },
            "args": [
                "-2",
                "jm_p2-es_matrix_control_demo.spin"
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
            "command": "/Applications/Flexprop/bin/loadp2.mac",
            "windows": {
                "command": "C:\\Users\\smmor\\ProgramFiles\\flexprop\\bin\\loadp2.exe",
            },
            "problemMatcher": [],
            "presentation": {
                "panel": "new",
                "focus": true
            },
            "args": [
                "-b230400",
                "${fileBasenameNoExtension}.binary",
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

As written download will always be preceeded by a CompileTop.

*Behavior Note: The task problem matchers now use 'autoDetect' so we can handle Flexspin's mix of relative and absolute file specifications within error messages.*

TODO: *the compiler as driven by the compileP2 task stops on first error. I am unable to locate option to generate all errors before stop so I [filed an issue](https://github.com/totalspectrum/spin2cpp/issues/116) requesting one if it's not present.*

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


## P2 Code Development with FlexProp on Raspbery Pi

... coming soon! ...

## P2 Code Development with PNut on Windows

... coming soon! ...

## License

Copyright © 2021 Iron Sheep Productions, LLC. All rights reserved.<br />
Licensed under the MIT License. <br>
<br>
Follow these links for more information:

### [Copyright](copyright) | [License](LICENSE)



[maintenance-shield]: https://img.shields.io/badge/maintainer-stephen%40ironsheep%2ebiz-blue.svg?style=for-the-badge

[license-shield]: https://camo.githubusercontent.com/bc04f96d911ea5f6e3b00e44fc0731ea74c8e1e9/68747470733a2f2f696d672e736869656c64732e696f2f6769746875622f6c6963656e73652f69616e74726963682f746578742d646976696465722d726f772e7376673f7374796c653d666f722d7468652d6261646765
