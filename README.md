<h1 align="center">Minecraft Bedrock Workspace</h1>
<p align="center"><img src="projects\template\behavior_pack\pack_icon.png" style="border-radius: 50px;"></img></p>
<p align="center">A VSCode Workspace dedicated for developing Minecraft Bedrock projects using JavaScript or TypeScript.</p>
  
## Project Structure
Each new project includes:
- **behavior_pack/**: Entities, Compiled scripts, etc.
- **resource_pack/**: Textures, text, sounds, etc.
- **tscripts/**: JavaScript or TypeScript code.

TypeScript files inside `tscripts/` are compiled direct into `behavior_pack/scripts/`. So make sure to code inside of it instead of the original `scripts/` folder.

### Overview
```
workspace/
├── .vscode/                   # Workspace configs (tasks / settings)
│   └── ...
├── backups/                   # Own projects generated backups
├── libraries/                 # Shared libraries (not implemented yet)
├── projects/                  # Individual projects
│   ├── template/              # Base template for new projects
│   └── your_project/          # User projects
│       ├── behavior_pack/
│       ├── resource_pack/
│       ├── tscripts/
│       └── tsconfig.json      # TypeScript configs
├── .gitgnore
├── .prettierc.json            # Prettier configs
├── eslint.config.mjs          # ESlint configs
├── just.config.ts             # Task configs
├── package.json               # Dependencies and scripts
├── README.md                  # Hi!
└── tsconfig.json              # Main TypeScript configs

```

The `projects/template` project is the main project it gets cloned every time you start a new project, so beware of that before editing it. Besides that, Feel free to edit it according to your needs.

## Available Tasks
### How to run tasks
To Run any task, open the VSCode Command Palette `ctrl+shift+P` or simply press `F1`, after that type `Tasks: Run Task` and run it. Then you will be able to see every task listed with it description.

### Global Tasks (Workspace root only)
- `New Project`: Create new project from template
- `Clone Project`: Clone existing project with new UUIDs and name
- `Delete Project`: Delete project from workspace (with confirmation)
- `Rename Project`: Rename project directory and update manifests
- `Open Project`: Open project directory in VSCode
- `List Development Projects`: Import Development Projects
- `Import Development Projects`: Import projects from Minecraft folders
- `Update Bedrock-Workspace`: Update bedrock-workspace from the newest github version

### Project Tasks (Project only)
#### Development:
- `TypeScript Compile`: Compile TypeScript files to JavaScript
- `Watch`: Watch files and auto-deploy changes

#### Deploy:
- `Local Deploy`: Deploy project to local Minecraft installation
- `Clean All`: Remove compiled and project files from Minecraft directories
- `Create McAddon`: Build and package project as .mcaddon file
- `Clean Local`: Remove compiled scripts from project
- `Clean Collateral`: Remove project files from Minecraft directories
- `Copy Artifacts`: Deploy project files to Minecraft directories

#### Management:
- `Analyze Project`: Analyze project statistics and structure
- `Backup Project`: Create compressed backup of current project
- `Update Version`: Update project version in manifests
- `Generate UUIDs`: Generate new UUIDs for project manifests
- `Debug`: Show current project information and debug details

#### Workspace:
- `Open Workspace`: Open workspace root in VS Code
- `Update Workspace`: Update workspace configurations from template
- `List Projects`: List all available projects in the current workspace

#### Minecraft:
- `Open Minecraft Folder`: Open Minecraft development folders
- `List Development Projects`: List all projects deployed to Minecraft folders

# Setup
1. **Install:**
   ```bash
   npm init @ackinari/bedrock-workspace # It can take some minutes
   ```
2. **Create a new project:**
   ```bash
   F1 > Tasks: Run Task > New Project
   ```
### In the project:
1. **Deploy into com.mojang:**
   ```bash
   F1 > Tasks: Run Task > Local Deploy
   ```

# Notes:
The project was made with the help of `ClaudeAI Sonnet 4.5`.

Functions were token from [@minecraft/core-build-tasks](https://www.npmjs.com/package/@minecraft/core-build-tasks) and modified to work with the this workspace system.

Feel free to use and modify it however you want.