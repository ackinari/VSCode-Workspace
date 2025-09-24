#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function createProject() {
  console.log('🚀 Creating new Minecraft Bedrock project...\n');

  const projectName = await question('Project name: ');
  if (!projectName) {
    console.log('❌ Project name is required');
    rl.close();
    return;
  }

  const projectType = await question('Project type (ts/js) [ts]: ') || 'ts';
  const includeResourcePack = await question('Include resource pack? (y/n) [y]: ') || 'y';

  const projectPath = path.join(__dirname, '..', 'projects', projectName);
  
  if (fs.existsSync(projectPath)) {
    console.log('❌ Project already exists');
    rl.close();
    return;
  }

  // Create project structure
  fs.mkdirSync(projectPath, { recursive: true });
  
  // Create behavior pack
  const behaviorPackPath = path.join(projectPath, 'behavior_pack');
  fs.mkdirSync(behaviorPackPath, { recursive: true });

  // Create manifest for behavior pack
  const behaviorManifest = {
    format_version: 2,
    header: {
      name: `${projectName} Behavior Pack`,
      description: `Behavior pack for ${projectName}`,
      uuid: generateUUID(),
      version: [1, 0, 0],
      min_engine_version: [1, 20, 0]
    },
    modules: [
      {
        type: "data",
        uuid: generateUUID(),
        version: [1, 0, 0]
      }
    ],
    dependencies: []
  };

  if (projectType === 'ts' || projectType === 'js') {
    behaviorManifest.modules.push({
      type: "script",
      language: "javascript",
      uuid: generateUUID(),
      version: [1, 0, 0],
      entry: "scripts/main.js"
    });
    
    behaviorManifest.dependencies.push({
      module_name: "@minecraft/server",
      version: "1.8.0"
    });
  }

  fs.writeFileSync(
    path.join(behaviorPackPath, 'manifest.json'),
    JSON.stringify(behaviorManifest, null, 2)
  );

  // Create scripts folder based on type
  if (projectType === 'ts') {
    const tscriptsPath = path.join(behaviorPackPath, 'tscripts');
    fs.mkdirSync(tscriptsPath, { recursive: true });
    
    const mainTsContent = `import { world } from "@minecraft/server";

world.beforeEvents.chatSend.subscribe((event) => {
  const { sender, message } = event;
  
  if (message === "hello") {
    event.cancel = true;
    world.sendMessage(\`Hello \${sender.name}! Welcome to ${projectName}!\`);
  }
});

console.log("${projectName} behavior pack loaded!");`;

    fs.writeFileSync(path.join(tscriptsPath, 'main.ts'), mainTsContent);
  } else if (projectType === 'js') {
    const scriptsPath = path.join(behaviorPackPath, 'scripts');
    fs.mkdirSync(scriptsPath, { recursive: true });
    
    const mainJsContent = `import { world } from "@minecraft/server";

world.beforeEvents.chatSend.subscribe((event) => {
  const { sender, message } = event;
  
  if (message === "hello") {
    event.cancel = true;
    world.sendMessage(\`Hello \${sender.name}! Welcome to ${projectName}!\`);
  }
});

console.log("${projectName} behavior pack loaded!");`;

    fs.writeFileSync(path.join(scriptsPath, 'main.js'), mainJsContent);
  }

  // Create resource pack if requested
  if (includeResourcePack.toLowerCase() === 'y') {
    const resourcePackPath = path.join(projectPath, 'resource_pack');
    fs.mkdirSync(resourcePackPath, { recursive: true });

    const resourceManifest = {
      format_version: 2,
      header: {
        name: `${projectName} Resource Pack`,
        description: `Resource pack for ${projectName}`,
        uuid: generateUUID(),
        version: [1, 0, 0],
        min_engine_version: [1, 20, 0]
      },
      modules: [
        {
          type: "resources",
          uuid: generateUUID(),
          version: [1, 0, 0]
        }
      ]
    };

    fs.writeFileSync(
      path.join(resourcePackPath, 'manifest.json'),
      JSON.stringify(resourceManifest, null, 2)
    );

    // Create textures folder
    fs.mkdirSync(path.join(resourcePackPath, 'textures'), { recursive: true });
  }

  // Create VS Code tasks
  const vscodePath = path.join(projectPath, '.vscode');
  fs.mkdirSync(vscodePath, { recursive: true });

  const tasksJson = {
    version: "2.0.0",
    tasks: [
      {
        label: "Start Minecraft Project",
        type: "shell",
        command: "node",
        args: [
          "../../eslint/workspace-manager.js",
          "start-current"
        ],
        group: {
          kind: "build",
          isDefault: true
        },
        presentation: {
          echo: true,
          reveal: "always",
          focus: false,
          panel: "shared",
          showReuseMessage: true,
          clear: false
        },
        problemMatcher: [],
        isBackground: true,
        runOptions: {
          runOn: "default"
        }
      },
      {
        label: "Build Project Once",
        type: "shell",
        command: "node",
        args: [
          "../../eslint/workspace-manager.js",
          "build-current"
        ],
        group: "build",
        presentation: {
          echo: true,
          reveal: "always",
          focus: false,
          panel: "shared"
        },
        problemMatcher: [
          "$tsc"
        ]
      },
      {
        label: "Stop Minecraft Project",
        type: "shell",
        command: "taskkill",
        args: [
          "/F",
          "/IM",
          "node.exe"
        ],
        group: "build",
        presentation: {
          echo: true,
          reveal: "always",
          focus: false,
          panel: "shared"
        },
        problemMatcher: []
      },
      {
        label: "Debug Project Info",
        type: "shell",
        command: "node",
        args: [
          "../../eslint/workspace-manager.js",
          "debug"
        ],
        group: "build",
        presentation: {
          echo: true,
          reveal: "always",
          focus: false,
          panel: "shared"
        },
        problemMatcher: []
      },
      {
        label: "List Available Libraries",
        type: "shell",
        command: "node",
        args: [
          "../../eslint/workspace-manager.js",
          "list-libraries"
        ],
        group: "build",
        presentation: {
          echo: true,
          reveal: "always",
          focus: false,
          panel: "shared"
        },
        problemMatcher: []
      }
    ]
  };

  fs.writeFileSync(
    path.join(vscodePath, 'tasks.json'),
    JSON.stringify(tasksJson, null, 2)
  );

  // Create project package.json for dependencies
  const projectPackageJson = {
    name: projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    version: "1.0.0",
    description: `Minecraft Bedrock project: ${projectName}`,
    private: true,
    scripts: {
      start: "node ../../eslint/workspace-manager.js start-current",
      build: "node ../../eslint/workspace-manager.js build-current",
      debug: "node ../../eslint/workspace-manager.js debug"
    }
  };

  fs.writeFileSync(
    path.join(projectPath, 'package.json'),
    JSON.stringify(projectPackageJson, null, 2)
  );

  console.log('\n✅ Project created successfully!');
  console.log(`📁 Project location: ${projectPath}`);
  console.log(`📝 Project type: ${projectType.toUpperCase()}`);
  console.log(`📦 Resource pack: ${includeResourcePack.toLowerCase() === 'y' ? 'Yes' : 'No'}`);
  
  console.log('\n🚀 Next steps:');
  console.log(`1. cd projects/${projectName}`);
  console.log('2. code .');
  console.log('3. Press Ctrl+Shift+P → "Tasks: Run Task" → "Start Minecraft Project"');
  
  if (projectType === 'ts') {
    console.log(`4. Edit behavior_pack/tscripts/main.ts`);
  } else {
    console.log(`4. Edit behavior_pack/scripts/main.js`);
  }

  rl.close();
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

createProject().catch(console.error);
