# VSCode Tasks


![Project Maintenance][maintenance-shield]
[![License][license-shield]](LICENSE)

##Automating Build and Download to our P2 development boards

This Document is being developed over time as I prove a working environment for each of my target platforms.  I'm expecting to document building on Windows, MacOS, and RaspberryPiOS.

I'm also expecting to document building and download with various tools such as Flexspin, download with direct attached boards via USB, download via Wifi with the Wx boards attached to our development board, with more compilers as they come ready for multi-platform use, etc.

## Tasks in VScode

A Task is how we integrate with External toola in VScode.

See: [VSCode "Tasks" Reference Page](https://code.visualstudio.com/docs/editor/tasks)

There are a number of types of tasks and places Task definitions live. These include [Auto-detected Tasks](https://code.visualstudio.com/docs/editor/tasks#_task-autodetection), [User level tasks](https://code.visualstudio.com/docs/editor/tasks#_user-level-tasks), and [Custom Tasks](https://code.visualstudio.com/docs/editor/tasks#_custom-tasks).  Tasks when run, can be crafted to depend upon the running of other tasks  See: [Compound Tasks](https://code.visualstudio.com/docs/editor/tasks#_compound-tasks)  Some tasks can be [run in background](https://code.visualstudio.com/docs/editor/tasks#_background-watching-tasks) such as file watchers which execute when a file has been changed.


...More TBA...

### Invoking tasks

Tasks can be invoked with the search, identify, run technique or they can have keyboard shortcuts assigned to them.  

A project can have a single default build task which is, by default, invoked with comamnd-shift-B. 

We'll configure our compileP2 task to be the default.

We'll add a downloadP2 task and assign comamnd-shift-D to it. It will depend upon the compile task which makes it run first and then we download the newly compiled result.

#### More Advanced building

We'll also test using the file-watch technoology to automatically compile and download our project files when they are modified.

## Building with Flexspin on macOS

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
                "panel": "new"
            },
            "group": {
                "kind": "build",
                "isDefault": true
            }
        },
        {
            "label": "downloadP2",
            "type": "shell",
            "command": "/Applications/Flexprop/bin/loadp2.mac",
            "problemMatcher": [],
            "presentation": {
                "panel": "new"
            },
            "args": [
                "-b230400",
                "${fileBasenameNoExtension}.binary",
                "-t"
            ],
            "dependsOn": [
                "compileP2"
            ]
        }
    ]
}
```

This provides the comamds to be run for compile and download. Download will always be preceeded by a compile.

TODO: ensure download doesn't proceed if compile fails

## Tools

## License

Copyright © 2021 Iron Sheep Productions, LLC. All rights reserved.<br />
Licensed under the MIT License. <br>
<br>
Follow these links for more information:

### [Copyright](copyright) | [License](LICENSE)



[maintenance-shield]: https://img.shields.io/badge/maintainer-stephen%40ironsheep%2ebiz-blue.svg?style=for-the-badge

[license-shield]: https://camo.githubusercontent.com/bc04f96d911ea5f6e3b00e44fc0731ea74c8e1e9/68747470733a2f2f696d672e736869656c64732e696f2f6769746875622f6c6963656e73652f69616e74726963682f746578742d646976696465722d726f772e7376673f7374796c653d666f722d7468652d6261646765
