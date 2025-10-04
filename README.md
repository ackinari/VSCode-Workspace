# Minecraft Bedrock TypeScript Workspace
Workspace for developing Minecraft Bedrock add-ons using JavaScript / TypeScript.

## Project Structure
Each project includes:
- **behavior_pack/**: Entities, Compiled scripts, ...
- **resource_pack/**: Textures, text, sounds, ...
- **tscripts/**: TypeScript or TypeScript source code
- TypeScript files inside `tscripts/` are compiled into `behavior_pack/scripts/`.
```
workspace/
├── .vscode/                   # Workspace configs
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

## Available Tasks
Note: Tasks can be run within the VSCode Command Palette or via terminal.

### Global Tasks (Workspace)
Run these tasks from the root of the workspace:
- `npm run new-project` - Create a new project from the template
- `npm run clone-project` - Clone an existing project with new UUIDs
- `npm run delete-project` - Delete a project (with confirmation)
- `npm run rename-project` - Rename a project and update manifests
- `npm run list-projects` - List all available projects
- `npm run open-mc-folder` - Open Minecraft development folders

### Project Tasks (Individual project)
Run these tasks from inside a project (e.g., `cd projects/your_project`):

#### Development
- `npm run typescript` - Compile TypeScript files
- `npm run watch` - Watch files and deploy automatically

#### Deploy
- `npm run local-deploy` - Deploy to local Minecraft installation
- `npm run clean` - Clean generated files from Minecraft development folders
- `npm run mcaddon` - Create a `.mcaddon` file for distribution

#### Management
- `npm run analyze` - Project statistics
- `npm run backup` - Create a compressed project backup
- `npm run update-version` - Update version in manifests
- `npm run generate-uuids` - Re-Generate new UUIDs for manifests
- `npm run update-workspace` - Update workspace with newest template configurations

# How to Use
1. **Install dependencies:**
   ```bash
   npm i
   ```
2. **Create a new project:**
   ```bash
   npm run new-project
   ```
3. **Navigate to your project:**
   ```bash
   cd projects/project-name
   ```
4. **Develop and test:**
   ```bash
   npm run watch  # Start development with auto-deploy
   ```
5. **Create the final package:**
   ```bash
   npm run mcaddon  # Generate the .mcaddon file
   ```