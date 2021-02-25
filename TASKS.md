# VSCode Tasks


![Project Maintenance][maintenance-shield]
[![License][license-shield]](LICENSE)

##Automating Build and Download to our P2 development boards

This Document is being developed over time as I prove a working environment for each of my target platforms.  I'm expecting to document building on Windows, MacOS, and RaspberryPiOS.

I'm also expecting to document building and download with various tools such as Flexspin, download with direct attached boards via USB, download via Wifi with the Wx boards attached to our development board, with more compilers as they come ready for multi-platform use, etc.

## Tasks in VScode

A Task is how we integrate with External tools in VScode.

See: [VSCode "Tasks" Reference Page](https://code.visualstudio.com/docs/editor/tasks)

There are a number of types of tasks and places Task definitions live. These include [Auto-detected Tasks](https://code.visualstudio.com/docs/editor/tasks#_task-autodetection), [User level tasks](https://code.visualstudio.com/docs/editor/tasks#_user-level-tasks), and [Custom Tasks](https://code.visualstudio.com/docs/editor/tasks#_custom-tasks).  Tasks when run, can be crafted to depend upon the running of other tasks  See: [Compound Tasks](https://code.visualstudio.com/docs/editor/tasks#_compound-tasks)  Some tasks can be [run in background](https://code.visualstudio.com/docs/editor/tasks#_background-watching-tasks) such as file watchers which execute when a file has been changed.

When you run VScode on multiple operating systems and want to be able to run a projects tasks on whichever machine you are on then you can specify os-specific alternatives to be used withing the task. See [Operating system specific properties](https://code.visualstudio.com/docs/editor/tasks#_operating-system-specific-properties)

...More TBA...

### Invoking tasks

Tasks can be invoked with the search, identify, run technique or they can have keyboard shortcuts assigned to them.  

A project can have a single default build task which is, by default, invoked with comamnd-shift-B. 

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

### FlexProp install specifics

The FlexProp toolset does not have a standard install location. So we will likely have many locations amongst all of us P2 users.  You have to take note of where you installed it and then adjust the following examples to point to where your binaries ended up on your file system.

In my case, on my Mac's, I install the folder at /Applications/Flexprop. Yours will likely be different.  If it is different you will need to modify two lines in the your tasks.json file.  The two lines are: 
- "command": "{installPath}/bin/flexspin.mac",  (in the "compileP2" task)
- "command": "{installPath}/bin/loadp2.mac",    (in the "downloadP2" task)

Simply replace {installPath} with your own install path (the folder containing the bin folder).

### Add custom tasks for compileP2, compileTopP2, and downloadP2

In your project folder create a directory named ".vscode" (if it's not already there.)

In this new directory create a "tasks.json" file containing the following contents.

Here is a project-specific file for macOS: **.vscode/tasks.json**

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
                "fileLocation": ["relative", "${workspaceFolder}"],
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
                "jm_p2-es_matrix_control_demo"
            ],
            "problemMatcher": {
                "owner": "Spin2",
                "fileLocation": ["relative", "${workspaceFolder}"],
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

*Behavior Note: there is a issue with filenames not being reported the same for the top-level file as included files. This makes this problemMatcher for compileP2 not work. I've [filed an issue at Eric's Repo](https://github.com/totalspectrum/spin2cpp/issues/115) that requests that he always issue errors/warnings from all files with exactly the same filename form: either path relative to folder of top-level file or an absolute path.*

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

... coming soon! ...

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
