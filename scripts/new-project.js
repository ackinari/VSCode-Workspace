#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { v4: uuidv4 } = require('uuid');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function generateUUID() {
  return uuidv4();
}

async function createNewProject() {
  console.log('🚀 Creating new Minecraft Bedrock project from template...\n');

  // Get project details
  const projectName = await question('Project name: ');
  if (!projectName) {
    console.log('❌ Project name is required');
    rl.close();
    return;
  }

  const author = await question('Author name: ') || 'Anonymous';
  const description = await question('Project description: ') || `A Minecraft Bedrock project: ${projectName}`;

  // Check if project already exists
  const projectsDir = path.join(__dirname, '..', '..', 'projects');
  const projectPath = path.join(projectsDir, projectName);
  
  if (fs.existsSync(projectPath)) {
    console.log('❌ Project already exists');
    rl.close();
    return;
  }

  // Template path
  const templatePath = path.join(__dirname, '..', '..', 'libraries', 'templates', 'basicTS');
  
  if (!fs.existsSync(templatePath)) {
    console.log('❌ Template not found at:', templatePath);
    rl.close();
    return;
  }

  console.log('\n🔄 Creating project from template...');

  // Create project directory
  fs.mkdirSync(projectPath, { recursive: true });

  // Copy template files
  copyDirectory(templatePath, projectPath);

  // Generate new UUIDs
  const behaviorPackUUID = generateUUID();
  const behaviorDataUUID = generateUUID();
  const behaviorScriptUUID = generateUUID();
  const resourcePackUUID = generateUUID();
  const resourceDataUUID = generateUUID();

  // Update behavior pack manifest
  const behaviorManifestPath = path.join(projectPath, 'behavior_pack', 'manifest.json');
  if (fs.existsSync(behaviorManifestPath)) {
    const behaviorManifest = JSON.parse(fs.readFileSync(behaviorManifestPath, 'utf8'));
    
    // Update header
    behaviorManifest.header.uuid = behaviorPackUUID;
    behaviorManifest.header.name = `pack.name`;
    behaviorManifest.header.description = `pack.description`;
    
    // Update modules
    if (behaviorManifest.modules) {
      behaviorManifest.modules.forEach(module => {
        if (module.type === 'data') {
          module.uuid = behaviorDataUUID;
        } else if (module.type === 'script') {
          module.uuid = behaviorScriptUUID;
        }
      });
    }

    fs.writeFileSync(behaviorManifestPath, JSON.stringify(behaviorManifest, null, 2));
    console.log('✅ Updated behavior pack manifest');
  }

  // Update resource pack manifest
  const resourceManifestPath = path.join(projectPath, 'resource_pack', 'manifest.json');
  if (fs.existsSync(resourceManifestPath)) {
    const resourceManifest = JSON.parse(fs.readFileSync(resourceManifestPath, 'utf8'));
    
    // Update header
    resourceManifest.header.uuid = resourcePackUUID;
    resourceManifest.header.name = `pack.name`;
    resourceManifest.header.description = `pack.description`;
    
    // Update modules
    if (resourceManifest.modules) {
      resourceManifest.modules.forEach(module => {
        if (module.type === 'resources') {
          module.uuid = resourceDataUUID;
        }
      });
    }

    fs.writeFileSync(resourceManifestPath, JSON.stringify(resourceManifest, null, 2));
    console.log('✅ Updated resource pack manifest');
  }

  // Update en_US.lang file
  const langPath = path.join(projectPath, 'resource_pack', 'texts', 'en_US.lang');
  if (fs.existsSync(langPath)) {
    const langContent = `pack.name=${projectName}
pack.description=${description}`;
    
    fs.writeFileSync(langPath, langContent);
    console.log('✅ Updated language file');
  }

  // Update main.ts with project name
  const mainTsPath = path.join(projectPath, 'behavior_pack', 'tscripts', 'main.ts');
  if (fs.existsSync(mainTsPath)) {
    let mainContent = fs.readFileSync(mainTsPath, 'utf8');
    mainContent = mainContent.replace(/Template Project/g, projectName);
    mainContent = mainContent.replace(/template behavior pack/g, `${projectName} behavior pack`);
    
    fs.writeFileSync(mainTsPath, mainContent);
    console.log('✅ Updated main TypeScript file');
  }

  // Update package.json
  const packageJsonPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    packageJson.name = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    packageJson.description = description;
    packageJson.author = author;
    
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    console.log('✅ Updated package.json');
  }

  // Update VS Code tasks
  const tasksPath = path.join(projectPath, '.vscode', 'tasks.json');
  if (fs.existsSync(tasksPath)) {
    // Tasks are already configured with relative paths, no need to update
    console.log('✅ VS Code tasks ready');
  }

  console.log('\n✅ Project created successfully!');
  console.log(`📁 Project location: ${projectPath}`);
  console.log(`👤 Author: ${author}`);
  console.log(`📝 Description: ${description}`);
  
  console.log('\n🆔 Generated UUIDs:');
  console.log(`  Behavior Pack: ${behaviorPackUUID}`);
  console.log(`  Resource Pack: ${resourcePackUUID}`);
  
  console.log('\n🚀 Next steps:');
  console.log(`1. cd projects/${projectName}`);
  console.log('2. code .');
  console.log('3. Press Ctrl+Shift+P → "Tasks: Run Task" → "Auto Build"');
  console.log(`4. Edit behavior_pack/tscripts/main.ts`);
  console.log('5. Your project will auto-sync to Minecraft development folder!');

  rl.close();
}

function copyDirectory(source, destination) {
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }

  const items = fs.readdirSync(source);

  for (const item of items) {
    const sourcePath = path.join(source, item);
    const destPath = path.join(destination, item);
    const stat = fs.statSync(sourcePath);

    if (stat.isDirectory()) {
      copyDirectory(sourcePath, destPath);
    } else {
      fs.copyFileSync(sourcePath, destPath);
    }
  }
}

// Handle UUID generation - try to use crypto.randomUUID first, fallback to manual
try {
  const crypto = require('crypto');
  if (crypto.randomUUID) {
    generateUUID = () => crypto.randomUUID();
  }
} catch (error) {
  // Fallback to manual UUID generation
  generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
}

createNewProject().catch(console.error);
