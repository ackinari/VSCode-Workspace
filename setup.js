#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Setting up Minecraft Bedrock Workspace...\n');

// Check Node.js version
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

if (majorVersion < 16) {
  console.error('❌ Node.js 16 or higher is required. Current version:', nodeVersion);
  process.exit(1);
}

console.log('✅ Node.js version check passed:', nodeVersion);

// Install dependencies
console.log('\n📦 Installing dependencies...');
try {
  execSync('npm install', { cwd: path.join(__dirname, 'eslint'), stdio: 'inherit' });
  console.log('✅ Dependencies installed successfully');
} catch (error) {
  console.error('❌ Failed to install dependencies:', error.message);
  process.exit(1);
}

// Create projects directory if it doesn't exist
const projectsDir = path.join(__dirname, 'projects');
if (!fs.existsSync(projectsDir)) {
  fs.mkdirSync(projectsDir, { recursive: true });
  console.log('✅ Created projects directory');
}

// Create libraries directory if it doesn't exist
const librariesDir = path.join(__dirname, 'libraries');
if (!fs.existsSync(librariesDir)) {
  fs.mkdirSync(librariesDir, { recursive: true });
  console.log('✅ Created libraries directory');
}

// Ensure example project has proper structure
const exampleProject = path.join(projectsDir, 'Example');
const behaviorPack = path.join(exampleProject, 'behavior_pack');
const resourcePack = path.join(exampleProject, 'resource_pack');

if (fs.existsSync(exampleProject)) {
  if (!fs.existsSync(behaviorPack)) {
    fs.mkdirSync(behaviorPack, { recursive: true });
  }
  if (!fs.existsSync(resourcePack)) {
    fs.mkdirSync(resourcePack, { recursive: true });
  }
  console.log('✅ Example project structure verified');
}

// Check for Minecraft installation
const os = require('os');
const homeDir = os.homedir();
const possiblePaths = [
  path.join(homeDir, 'AppData', 'Local', 'Packages', 'Microsoft.MinecraftUWP_8wekyb3d8bbwe', 'LocalState', 'games', 'com.mojang'),
  path.join(homeDir, 'AppData', 'Local', 'Packages', 'Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe', 'LocalState', 'games', 'com.mojang')
];

let minecraftFound = false;
for (const mcPath of possiblePaths) {
  if (fs.existsSync(mcPath)) {
    console.log('✅ Minecraft installation found:', mcPath);
    minecraftFound = true;
    break;
  }
}

if (!minecraftFound) {
  console.log('⚠️  Minecraft installation not found automatically');
  console.log('   The workspace will still work, but you may need to configure the path manually');
}

console.log('\n🎉 Setup completed successfully!');
console.log('\n📖 Quick Start:');
console.log('1. Navigate to a project: cd projects/Example');
console.log('2. Open in VS Code: code .');
console.log('3. Use Ctrl+Shift+P → "Tasks: Run Task" → "Start Minecraft Project"');
console.log('\n📚 For more information, see README.md');

console.log('\n🔧 Available commands:');
console.log('  npm run setup              - Run this setup again');
console.log('  npm run start-current      - Start current project');
console.log('  npm run debug              - Debug current project');
console.log('  npm run list-projects      - List all projects');
console.log('  npm run list-libraries     - List available libraries');

console.log('\n✨ Happy coding!');
