const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const chokidar = require('chokidar');
const os = require('os');

class WorkspaceManager {
  constructor() {
    this.projectsDir = path.join(__dirname, '..', 'projects');
    this.eslintDir = __dirname;
    this.librariesDir = path.join(__dirname, '..', 'libraries');
    this.minecraftDir = this.getMinecraftDirectory();
    this.activeWatchers = new Map();
  }

  getMinecraftDirectory() {
    const homeDir = os.homedir();
    const possiblePaths = [
      path.join(homeDir, 'AppData', 'Local', 'Packages', 'Microsoft.MinecraftUWP_8wekyb3d8bbwe', 'LocalState', 'games', 'com.mojang'),
      path.join(homeDir, 'AppData', 'Local', 'Packages', 'Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe', 'LocalState', 'games', 'com.mojang')
    ];

    for (const mcPath of possiblePaths) {
      if (fs.existsSync(mcPath)) {
        return mcPath;
      }
    }

    console.warn('Minecraft .com.mojang folder not found automatically. Configure manually if needed.');
    return null;
  }

  async startProject(projectName) {
    const projectPath = path.join(this.projectsDir, projectName);
    
    if (!fs.existsSync(projectPath)) {
      throw new Error(`Project ${projectName} not found at ${projectPath}`);
    }

    console.log(`Starting project monitoring: ${projectName}`);
    
    // Ensure shared dependencies
    await this.ensureSharedDependencies();
    
    // Start watcher
    this.startWatcher(projectName, projectPath);
    
    // Initial build
    await this.buildProject(projectPath);
    await this.syncToMinecraft(projectName, projectPath);
    
    console.log(`Project ${projectName} is now being monitored`);
  }

  async startCurrentProject() {
    const currentDir = process.cwd();
    const projectName = path.basename(currentDir);
    
    // Check if we're in a project directory
    const behaviorPackPath = path.join(currentDir, 'behavior_pack');
    if (!fs.existsSync(behaviorPackPath)) {
      throw new Error('Not in a valid project directory. behavior_pack folder not found.');
    }
    
    console.log(`Auto-detected project: ${projectName}`);
    
    // Ensure shared dependencies
    await this.ensureSharedDependencies();
    
    // Create/update project tsconfig for VS Code
    await this.createProjectTsConfig(currentDir);
    
    // Start watcher
    this.startWatcher(projectName, currentDir);
    
    // Initial build
    await this.buildProject(currentDir);
    await this.syncToMinecraft(projectName, currentDir);
    
    console.log(`Project ${projectName} is now being monitored`);
  }

  async ensureSharedDependencies() {
    const eslintPackageJsonPath = path.join(this.eslintDir, 'package.json');
    const eslintNodeModulesPath = path.join(this.eslintDir, 'node_modules');
    
    if (fs.existsSync(eslintPackageJsonPath) && !fs.existsSync(eslintNodeModulesPath)) {
      console.log('Installing shared dependencies...');
      try {
        execSync('npm install', { cwd: this.eslintDir, stdio: 'inherit' });
      } catch (error) {
        console.error('Error installing shared dependencies:', error.message);
      }
    }
  }

  startWatcher(projectName, projectPath) {
    if (this.activeWatchers.has(projectName)) {
      this.activeWatchers.get(projectName).close();
    }

    const watchPaths = [
      path.join(projectPath, 'behavior_pack', 'tscripts', '**', '*.ts'),
      path.join(projectPath, 'behavior_pack', 'typescripts', '**', '*.ts'),
      path.join(projectPath, 'behavior_pack', 'scripts', '**', '*.js'),
      path.join(projectPath, 'behavior_pack', 'tscripts'),  // Watch folder creation
      path.join(projectPath, 'behavior_pack', 'typescripts'), // Watch folder creation
      path.join(projectPath, 'behavior_pack', '**', '*.{json,lang,tga,ogg,png}'),
      path.join(projectPath, 'resource_pack', '**', '*.{json,lang,tga,ogg,png}')
    ];

    const watcher = chokidar.watch(watchPaths, {
      ignored: [/node_modules/, /\.map$/],
      persistent: true
    });

    watcher.on('change', async (filePath) => {
      const relativePath = path.relative(projectPath, filePath);
      console.log(`Changed: ${relativePath}`);
      
      if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
        await this.buildProject(projectPath);
      }
      
      await this.syncToMinecraft(projectName, projectPath);
    });

    watcher.on('add', async (filePath) => {
      const relativePath = path.relative(projectPath, filePath);
      console.log(`Added: ${relativePath}`);
      
      if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
        await this.buildProject(projectPath);
      }
      
      await this.syncToMinecraft(projectName, projectPath);
    });

    watcher.on('addDir', async (dirPath) => {
      const relativePath = path.relative(projectPath, dirPath);
      console.log(`Directory added: ${relativePath}`);
      
      // Check if tscripts or typescripts folder was created
      if (relativePath.includes('tscripts') || relativePath.includes('typescripts')) {
        console.log('TypeScript source folder detected, rebuilding...');
        await this.buildProject(projectPath);
        await this.syncToMinecraft(projectName, projectPath);
      }
    });

    watcher.on('unlink', async (filePath) => {
      const relativePath = path.relative(projectPath, filePath);
      console.log(`Removed: ${relativePath}`);
      
      // If it's a TypeScript file, also remove the corresponding JS file
      if (filePath.endsWith('.ts') && this.minecraftDir) {
        const jsFileName = path.basename(filePath, '.ts') + '.js';
        const outputDir = path.join(this.minecraftDir, 'development_behavior_packs', `${projectName}_BP`, 'scripts');
        const jsFilePath = path.join(outputDir, jsFileName);
        
        if (fs.existsSync(jsFilePath)) {
          fs.unlinkSync(jsFilePath);
          console.log(`Removed compiled JS file: ${jsFileName}`);
        }
      }
      
      await this.syncToMinecraft(projectName, projectPath);
    });

    this.activeWatchers.set(projectName, watcher);
  }

  async buildProject(projectPath) {
    const behaviorPackPath = path.join(projectPath, 'behavior_pack');
    const tscriptsPath = path.join(behaviorPackPath, 'tscripts');
    const typescriptsPath = path.join(behaviorPackPath, 'typescripts');
    const scriptsSourcePath = path.join(behaviorPackPath, 'scripts');

    let sourceDir = null;
    let isTypeScript = false;
    let outputDir = null;

    // Check for TypeScript sources first
    if (fs.existsSync(tscriptsPath)) {
      sourceDir = tscriptsPath;
      isTypeScript = true;
      outputDir = path.join(this.minecraftDir, 'development_behavior_packs', `${path.basename(projectPath)}_BP`, 'scripts');
    } else if (fs.existsSync(typescriptsPath)) {
      sourceDir = typescriptsPath;
      isTypeScript = true;
      outputDir = path.join(this.minecraftDir, 'development_behavior_packs', `${path.basename(projectPath)}_BP`, 'scripts');
    } else if (fs.existsSync(scriptsSourcePath)) {
      // Use existing JS files - no compilation needed
      console.log('Using existing JavaScript files');
      // Still check for library usage in JS files
      await this.syncLibrariesIfNeeded(projectPath, scriptsSourcePath);
      return;
    }

    if (!sourceDir) {
      return; // No source code to compile
    }

    // Check if TypeScript folder is empty
    if (isTypeScript) {
      const tsFiles = fs.readdirSync(sourceDir).filter(file => file.endsWith('.ts'));
      if (tsFiles.length === 0) {
        console.log('TypeScript folder is empty, skipping compilation');
        return;
      }
      
      // Check for library usage in TypeScript files
      await this.syncLibrariesIfNeeded(projectPath, sourceDir);
    }

    try {
      if (isTypeScript && this.minecraftDir) {
        console.log('Compiling TypeScript directly to development folder...');
        
        // Create output directory if it doesn't exist
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Create temporary tsconfig for this project
        const tempTsConfig = {
          compilerOptions: {
            target: "es6",
            moduleResolution: "Node",
            module: "ES2020",
            declaration: false,
            sourceMap: false,
            strict: false,
            noImplicitAny: false,
            outDir: outputDir,
            // Remove rootDir to allow files from different directories
            skipLibCheck: true,
            skipDefaultLibCheck: true,
            noResolve: false,
            typeRoots: [],
            types: [],
            lib: ["ES2020", "DOM"],
            moduleDetection: "force",
            baseUrl: projectPath,
            paths: {
              "libraries/*": [path.relative(projectPath, path.join(this.librariesDir, "*")).replace(/\\/g, '/')],
              "@workspace/*": [path.relative(projectPath, path.join(this.librariesDir, "*")).replace(/\\/g, '/')]
            }
          },
          include: [
            path.relative(projectPath, path.join(sourceDir, "**/*")).replace(/\\/g, '/')
          ],
          exclude: [
            "node_modules", 
            "**/*.d.ts", 
            "**/node_modules/**",
            "libraries/templates/**/*"
          ]
        };

        const tempTsConfigPath = path.join(projectPath, 'tsconfig.temp.json');
        fs.writeFileSync(tempTsConfigPath, JSON.stringify(tempTsConfig, null, 2));

        try {
          execSync(`npx tsc --project ${tempTsConfigPath}`, { 
            cwd: this.eslintDir, 
            stdio: 'inherit'
          });
          console.log('TypeScript compiled successfully to development folder');
        } catch (tscError) {
          console.error('TypeScript compilation failed. Check your code for errors.');
          console.error('Error details:', tscError.message);
        }

        // Remove temporary tsconfig
        if (fs.existsSync(tempTsConfigPath)) {
          fs.unlinkSync(tempTsConfigPath);
        }
      } else if (isTypeScript && !this.minecraftDir) {
        console.warn('Minecraft folder not found. Cannot compile TypeScript directly to development.');
      }
    } catch (error) {
      console.error('Build error:', error.message);
    }
  }

  async syncToMinecraft(projectName, projectPath) {
    if (!this.minecraftDir) {
      console.warn('Minecraft .com.mojang folder not configured. Skipping sync.');
      return;
    }

    try {
      const behaviorPackSource = path.join(projectPath, 'behavior_pack');
      const resourcePackSource = path.join(projectPath, 'resource_pack');
      
      const behaviorPackDest = path.join(this.minecraftDir, 'development_behavior_packs', `${projectName}_BP`);
      const resourcePackDest = path.join(this.minecraftDir, 'development_resource_packs', `${projectName}_RP`);

      // Check if we have TypeScript sources
      const tscriptsPath = path.join(behaviorPackSource, 'tscripts');
      const typescriptsPath = path.join(behaviorPackSource, 'typescripts');
      const hasTypeScript = fs.existsSync(tscriptsPath) || fs.existsSync(typescriptsPath);

      // Sync behavior pack
      if (fs.existsSync(behaviorPackSource)) {
        if (hasTypeScript) {
          // For TypeScript projects, exclude tscripts/typescripts but preserve scripts folder in destination
          await this.smartSync(behaviorPackSource, behaviorPackDest, ['tscripts', 'typescripts'], ['scripts']);
        } else {
          // For JavaScript projects, exclude only tscripts/typescripts
          await this.smartSync(behaviorPackSource, behaviorPackDest, ['tscripts', 'typescripts']);
        }
        console.log(`Synced behavior pack`);
      }

      // Sync resource pack
      if (fs.existsSync(resourcePackSource)) {
        await this.smartSync(resourcePackSource, resourcePackDest);
        console.log(`Synced resource pack`);
      }
    } catch (error) {
      console.error('Sync error:', error.message);
    }
  }

  async smartSync(source, destination, excludeDirs = [], preserveDirs = []) {
    // Create destination if it doesn't exist
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    // Get current files in both directories
    const sourceItems = fs.existsSync(source) ? fs.readdirSync(source) : [];
    const destItems = fs.existsSync(destination) ? fs.readdirSync(destination) : [];

    let syncedFiles = 0;
    let skippedFiles = 0;

    // Remove files that no longer exist in source, but preserve certain directories
    for (const destItem of destItems) {
      if (!sourceItems.includes(destItem) && !preserveDirs.includes(destItem)) {
        const destPath = path.join(destination, destItem);
        try {
          if (fs.statSync(destPath).isDirectory()) {
            this.removeDirectory(destPath);
            console.log(`Removed directory: ${destItem}`);
          } else {
            fs.unlinkSync(destPath);
            console.log(`Removed file: ${destItem}`);
          }
        } catch (error) {
          console.warn(`Failed to remove ${destItem}: ${error.message}`);
        }
      }
    }

    // Copy/update files from source
    for (const item of sourceItems) {
      const sourcePath = path.join(source, item);
      const destPath = path.join(destination, item);
      
      let stat;
      try {
        stat = fs.statSync(sourcePath);
      } catch (error) {
        console.warn(`Failed to stat ${sourcePath}: ${error.message}`);
        continue;
      }
      
      if (stat.isDirectory()) {
        // Skip excluded directories
        if (excludeDirs.includes(item)) {
          continue;
        }
        
        await this.smartSync(sourcePath, destPath, excludeDirs);
      } else {
        // Skip .map files and temporary files
        if (item.endsWith('.map') || item.endsWith('.temp.json') || item.startsWith('.')) {
          continue;
        }
        
        // Enhanced file comparison for better performance
        let shouldCopy = false;
        
        if (!fs.existsSync(destPath)) {
          shouldCopy = true;
        } else {
          try {
            const sourceStats = stat;
            const destStats = fs.statSync(destPath);
            
            // Compare size first (fastest check)
            if (sourceStats.size !== destStats.size) {
              shouldCopy = true;
            } else {
              // Only check modification time if sizes are equal
              const sourceMtime = Math.floor(sourceStats.mtime.getTime() / 1000);
              const destMtime = Math.floor(destStats.mtime.getTime() / 1000);
              
              if (sourceMtime > destMtime) {
                shouldCopy = true;
              }
            }
          } catch (error) {
            // If we can't stat the destination, copy the file
            shouldCopy = true;
          }
        }
        
        if (shouldCopy) {
          try {
            fs.copyFileSync(sourcePath, destPath);
            syncedFiles++;
          } catch (error) {
            console.warn(`Failed to copy ${item}: ${error.message}`);
          }
        } else {
          skippedFiles++;
        }
      }
    }

    // Only log summary for large operations
    if (syncedFiles > 0 || skippedFiles > 10) {
      console.log(`Sync summary: ${syncedFiles} files updated, ${skippedFiles} files skipped (unchanged)`);
    }
  }

  removeDirectory(dir) {
    if (fs.existsSync(dir)) {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          this.removeDirectory(itemPath);
        } else {
          fs.unlinkSync(itemPath);
        }
      }
      
      fs.rmdirSync(dir);
    }
  }

  stopProject(projectName) {
    if (this.activeWatchers.has(projectName)) {
      this.activeWatchers.get(projectName).close();
      this.activeWatchers.delete(projectName);
      console.log(`Stopped monitoring project: ${projectName}`);
    }
  }

  async buildOnce(projectName) {
    const projectPath = projectName ? path.join(this.projectsDir, projectName) : process.cwd();
    
    if (!fs.existsSync(projectPath)) {
      throw new Error(`Project not found at ${projectPath}`);
    }

    const actualProjectName = projectName || path.basename(projectPath);
    console.log(`Building project once: ${actualProjectName}`);
    
    await this.ensureSharedDependencies();
    await this.buildProject(projectPath);
    await this.syncToMinecraft(actualProjectName, projectPath);
    
    console.log(`Build completed for ${actualProjectName}`);
  }

  async syncDevelopment(projectName) {
    const projectPath = projectName ? path.join(this.projectsDir, projectName) : process.cwd();
    
    if (!fs.existsSync(projectPath)) {
      throw new Error(`Project not found at ${projectPath}`);
    }

    const actualProjectName = projectName || path.basename(projectPath);
    
    if (!this.minecraftDir) {
      throw new Error('Minecraft .com.mojang folder not found. Cannot sync development.');
    }

    const behaviorPackSource = path.join(projectPath, 'behavior_pack');
    const resourcePackSource = path.join(projectPath, 'resource_pack');
    
    const behaviorPackDest = path.join(this.minecraftDir, 'development_behavior_packs', `${actualProjectName}_BP`);
    const resourcePackDest = path.join(this.minecraftDir, 'development_resource_packs', `${actualProjectName}_RP`);

    console.log(`\n=== SYNC DEVELOPMENT ANALYSIS FOR ${actualProjectName} ===`);
    
    let needsSync = false;
    const issues = [];

    // Check behavior pack
    if (fs.existsSync(behaviorPackSource)) {
      if (!fs.existsSync(behaviorPackDest)) {
        issues.push(`❌ Behavior pack missing in development: ${behaviorPackDest}`);
        needsSync = true;
      } else {
        const sourceFiles = this.getAllFilesRecursive(behaviorPackSource);
        const destFiles = this.getAllFilesRecursive(behaviorPackDest);
        
        // Check for missing files
        for (const file of sourceFiles) {
          const relativePath = path.relative(behaviorPackSource, file);
          const destFile = path.join(behaviorPackDest, relativePath);
          
          // Skip excluded directories
          if (relativePath.includes('tscripts') || relativePath.includes('typescripts')) {
            continue;
          }
          
          if (!fs.existsSync(destFile)) {
            issues.push(`❌ Missing file: ${relativePath}`);
            needsSync = true;
          } else {
            // Check if file is different
            const sourceStats = fs.statSync(file);
            const destStats = fs.statSync(destFile);
            
            if (sourceStats.mtime > destStats.mtime || sourceStats.size !== destStats.size) {
              issues.push(`⚠️  Outdated file: ${relativePath}`);
              needsSync = true;
            }
          }
        }
        
        // Check for extra files in development
        for (const file of destFiles) {
          const relativePath = path.relative(behaviorPackDest, file);
          const sourceFile = path.join(behaviorPackSource, relativePath);
          
          // Skip compiled scripts and libraries
          if (relativePath.startsWith('scripts') && !fs.existsSync(path.join(behaviorPackSource, 'scripts'))) {
            continue;
          }
          
          if (!fs.existsSync(sourceFile) && !relativePath.startsWith('scripts')) {
            issues.push(`🗑️  Extra file in development: ${relativePath}`);
            needsSync = true;
          }
        }
      }
    }

    // Check resource pack
    if (fs.existsSync(resourcePackSource)) {
      if (!fs.existsSync(resourcePackDest)) {
        issues.push(`❌ Resource pack missing in development: ${resourcePackDest}`);
        needsSync = true;
      }
    }

    // Display results
    if (needsSync) {
      console.log('\n📋 Issues found:');
      issues.forEach(issue => console.log(`  ${issue}`));
      
      console.log('\n⚠️  WARNING: This will completely replace the development folder!');
      console.log('   All files in development will be deleted and rebuilt from source.');
      console.log('\n❓ Do you want to proceed? (y/N)');
      
      // In a real implementation, you'd want to use readline for user input
      // For now, we'll assume the user confirms
      console.log('\n🔄 Proceeding with sync...');
      
      // Clean development folders
      if (fs.existsSync(behaviorPackDest)) {
        this.removeDirectory(behaviorPackDest);
        console.log('🗑️  Cleaned behavior pack development folder');
      }
      
      if (fs.existsSync(resourcePackDest)) {
        this.removeDirectory(resourcePackDest);
        console.log('🗑️  Cleaned resource pack development folder');
      }
      
      // Rebuild everything
      await this.ensureSharedDependencies();
      await this.buildProject(projectPath);
      await this.syncToMinecraft(actualProjectName, projectPath);
      
      console.log('\n✅ Development sync completed successfully!');
    } else {
      console.log('\n✅ Development folder is already in sync with source!');
    }

    return { needsSync, issues };
  }

  getAllFilesRecursive(dir, files = []) {
    if (!fs.existsSync(dir)) return files;
    
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        this.getAllFilesRecursive(itemPath, files);
      } else {
        files.push(itemPath);
      }
    }
    
    return files;
  }

  async syncLibrariesIfNeeded(projectPath, sourceDir) {
    if (!fs.existsSync(this.librariesDir)) {
      return;
    }

    // Scan source files for library imports
    const usedLibraries = await this.detectLibraryUsage(sourceDir);
    
    // Determine destination based on project type
    const projectName = path.basename(projectPath);
    let librariesDestPath;
    
    if (this.minecraftDir) {
      // For TypeScript projects, copy to development folder
      librariesDestPath = path.join(this.minecraftDir, 'development_behavior_packs', `${projectName}_BP`, 'scripts', 'libraries');
    } else {
      // Fallback to project scripts folder
      const behaviorPackPath = path.join(projectPath, 'behavior_pack');
      const scriptsPath = path.join(behaviorPackPath, 'scripts');
      librariesDestPath = path.join(scriptsPath, 'libraries');
    }

    // Clean up unused libraries first
    if (fs.existsSync(librariesDestPath)) {
      const existingLibs = fs.readdirSync(librariesDestPath)
        .filter(item => fs.statSync(path.join(librariesDestPath, item)).isDirectory());
      
      for (const existingLib of existingLibs) {
        if (!usedLibraries.includes(existingLib)) {
          const libPath = path.join(librariesDestPath, existingLib);
          this.removeDirectory(libPath);
          console.log(`Removed unused library: ${existingLib}`);
        }
      }
    }

    if (usedLibraries.length === 0) {
      // Remove entire libraries folder if no libraries are used
      if (fs.existsSync(librariesDestPath)) {
        this.removeDirectory(librariesDestPath);
        console.log('Removed libraries folder (no libraries in use)');
      }
      return;
    }

    console.log(`Detected library usage: ${usedLibraries.join(', ')}`);

    // Create libraries directory
    if (!fs.existsSync(librariesDestPath)) {
      fs.mkdirSync(librariesDestPath, { recursive: true });
    }

    // Copy only used libraries
    for (const libName of usedLibraries) {
      const libSourcePath = path.join(this.librariesDir, libName);
      const libDestPath = path.join(librariesDestPath, libName);
      
      if (fs.existsSync(libSourcePath)) {
        await this.smartSync(libSourcePath, libDestPath);
      }
    }
    
    console.log(`Synced libraries to development: ${usedLibraries.join(', ')}`);
  }

  async detectLibraryUsage(sourceDir) {
    const usedLibraries = new Set();
    
    if (!fs.existsSync(sourceDir)) {
      return [];
    }

    const files = this.getAllFiles(sourceDir, ['.ts', '.js']);
    
    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Look for imports from libraries
      // Supports multiple patterns:
      // import { func } from './libraries/math/utils'
      // import { func } from '../libraries/math/utils'  
      // import { func } from 'libraries/math/utils'
      // import { func } from 'libraries/math'  <- This pattern was missing
      // import { func } from '@workspace/math'
      const importPatterns = [
        // Relative paths with subpaths
        /import\s+.*?\s+from\s+['"`]\.\.?\/libraries\/([^\/'"]+)(?:\/[^'"`]*)?['"`]/g,
        // Direct libraries path with optional subpaths
        /import\s+.*?\s+from\s+['"`]libraries\/([^\/'"]+)(?:\/[^'"`]*)?['"`]/g,
        // @workspace pattern
        /import\s+.*?\s+from\s+['"`]@workspace\/([^'"`]+)['"`]/g
      ];
      
      for (const regex of importPatterns) {
        let match;
        while ((match = regex.exec(content)) !== null) {
          const libraryName = match[1];
          usedLibraries.add(libraryName);
          console.log(`Detected library import: ${libraryName} in ${path.basename(filePath)}`);
        }
      }
    }
    
    return Array.from(usedLibraries);
  }

  getAllFiles(dir, extensions) {
    const files = [];
    
    if (!fs.existsSync(dir)) {
      return files;
    }
    
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        files.push(...this.getAllFiles(itemPath, extensions));
      } else if (extensions.some(ext => item.endsWith(ext))) {
        files.push(itemPath);
      }
    }
    
    return files;
  }

  async createProjectTsConfig(projectPath) {
    const tsconfigPath = path.join(projectPath, 'tsconfig.json');
    
    // Create tsconfig.json for VS Code IntelliSense
    const projectTsConfig = {
      compilerOptions: {
        target: "ES2020",
        module: "ES2020",
        moduleResolution: "Node",
        strict: false,
        skipLibCheck: true,
        skipDefaultLibCheck: true,
        lib: ["ES2020", "DOM"],
        baseUrl: ".",
        paths: {
          "libraries/*": [path.relative(projectPath, path.join(this.librariesDir, "*")).replace(/\\/g, '/')],
          "@workspace/*": [path.relative(projectPath, path.join(this.librariesDir, "*")).replace(/\\/g, '/')]
        }
      },
      include: [
        "behavior_pack/tscripts/**/*",
        "behavior_pack/typescripts/**/*"
      ],
      exclude: [
        "node_modules",
        "behavior_pack/scripts",
        "**/*.temp.json",
        "libraries/templates/**/*"
      ]
    };

    fs.writeFileSync(tsconfigPath, JSON.stringify(projectTsConfig, null, 2));
    console.log('Created/updated tsconfig.json for VS Code IntelliSense');
  }

  async syncLibraries(projectPath) {
    if (!fs.existsSync(this.librariesDir)) {
      return;
    }

    const behaviorPackPath = path.join(projectPath, 'behavior_pack');
    const scriptsPath = path.join(behaviorPackPath, 'scripts');
    const librariesDestPath = path.join(scriptsPath, 'libraries');

    // Create libraries directory in scripts
    if (!fs.existsSync(librariesDestPath)) {
      fs.mkdirSync(librariesDestPath, { recursive: true });
    }

    // Copy all libraries
    await this.smartSync(this.librariesDir, librariesDestPath);
    console.log('Synced global libraries to project');
  }

  listProjects() {
    if (!fs.existsSync(this.projectsDir)) {
      console.log('No projects found.');
      return [];
    }

    const projects = fs.readdirSync(this.projectsDir)
      .filter(item => fs.statSync(path.join(this.projectsDir, item)).isDirectory());
    
    console.log('Available projects:');
    projects.forEach(project => console.log(`  ${project}`));
    
    return projects;
  }

  listLibraries() {
    if (!fs.existsSync(this.librariesDir)) {
      console.log('No libraries found.');
      return [];
    }

    const libraries = fs.readdirSync(this.librariesDir)
      .filter(item => fs.statSync(path.join(this.librariesDir, item)).isDirectory());
    
    console.log('Available libraries:');
    libraries.forEach(lib => {
      const libPath = path.join(this.librariesDir, lib);
      const files = fs.readdirSync(libPath).filter(f => f.endsWith('.js'));
      console.log(`  ${lib}/`);
      files.forEach(file => console.log(`    ${file}`));
    });
    
    return libraries;
  }

  debugProject(projectName) {
    const projectPath = projectName ? path.join(this.projectsDir, projectName) : process.cwd();
    const actualProjectName = projectName || path.basename(projectPath);
    
    console.log(`=== DEBUG INFORMATION FOR PROJECT: ${actualProjectName} ===`);
    console.log(`Project path: ${projectPath}`);
    console.log(`Minecraft directory: ${this.minecraftDir || 'Not found'}`);
    console.log(`Libraries directory: ${this.librariesDir}`);
    console.log(`ESLint directory: ${this.eslintDir}`);
    
    // Check workspace structure
    console.log('\n=== WORKSPACE STRUCTURE ===');
    console.log(`Projects directory: ${fs.existsSync(this.projectsDir) ? 'EXISTS' : 'MISSING'}`);
    console.log(`Libraries directory: ${fs.existsSync(this.librariesDir) ? 'EXISTS' : 'MISSING'}`);
    console.log(`ESLint config: ${fs.existsSync(path.join(this.eslintDir, 'package.json')) ? 'EXISTS' : 'MISSING'}`);
    console.log(`Node modules: ${fs.existsSync(path.join(this.eslintDir, 'node_modules')) ? 'EXISTS' : 'MISSING'}`);
    
    // Check project structure
    const behaviorPackPath = path.join(projectPath, 'behavior_pack');
    const resourcePackPath = path.join(projectPath, 'resource_pack');
    const tscriptsPath = path.join(behaviorPackPath, 'tscripts');
    const scriptsPath = path.join(behaviorPackPath, 'scripts');
    const vscodePath = path.join(projectPath, '.vscode');
    
    console.log('\n=== PROJECT STRUCTURE ===');
    console.log(`  behavior_pack: ${fs.existsSync(behaviorPackPath) ? 'EXISTS' : 'MISSING'}`);
    console.log(`  resource_pack: ${fs.existsSync(resourcePackPath) ? 'EXISTS' : 'MISSING'}`);
    console.log(`  tscripts: ${fs.existsSync(tscriptsPath) ? 'EXISTS' : 'MISSING'}`);
    console.log(`  scripts: ${fs.existsSync(scriptsPath) ? 'EXISTS' : 'MISSING'}`);
    console.log(`  .vscode: ${fs.existsSync(vscodePath) ? 'EXISTS' : 'MISSING'}`);
    
    // Check TypeScript files
    if (fs.existsSync(tscriptsPath)) {
      const tsFiles = fs.readdirSync(tscriptsPath).filter(f => f.endsWith('.ts'));
      console.log(`\n=== TYPESCRIPT FILES (${tsFiles.length}) ===`);
      tsFiles.forEach(file => {
        const filePath = path.join(tscriptsPath, file);
        const stats = fs.statSync(filePath);
        console.log(`    ${file} (${stats.size} bytes, modified: ${stats.mtime.toLocaleString()})`);
      });
      
      // Check for library usage
      const usedLibraries = this.detectLibraryUsage(tscriptsPath);
      if (usedLibraries.length > 0) {
        console.log(`\n=== DETECTED LIBRARY USAGE ===`);
        usedLibraries.forEach(lib => console.log(`    ${lib}`));
      }
    }
    
    // Check JavaScript files
    if (fs.existsSync(scriptsPath)) {
      const jsFiles = fs.readdirSync(scriptsPath).filter(f => f.endsWith('.js'));
      console.log(`\n=== JAVASCRIPT FILES (${jsFiles.length}) ===`);
      jsFiles.forEach(file => {
        const filePath = path.join(scriptsPath, file);
        const stats = fs.statSync(filePath);
        console.log(`    ${file} (${stats.size} bytes, modified: ${stats.mtime.toLocaleString()})`);
      });
    }
    
    // Check Minecraft development folders
    if (this.minecraftDir) {
      const devBehaviorPath = path.join(this.minecraftDir, 'development_behavior_packs', `${actualProjectName}_BP`);
      const devResourcePath = path.join(this.minecraftDir, 'development_resource_packs', `${actualProjectName}_RP`);
      
      console.log('\n=== MINECRAFT DEVELOPMENT ===');
      console.log(`  Behavior pack: ${fs.existsSync(devBehaviorPath) ? 'EXISTS' : 'MISSING'}`);
      console.log(`  Resource pack: ${fs.existsSync(devResourcePath) ? 'EXISTS' : 'MISSING'}`);
      
      if (fs.existsSync(devBehaviorPath)) {
        const devScriptsPath = path.join(devBehaviorPath, 'scripts');
        const devLibrariesPath = path.join(devScriptsPath, 'libraries');
        console.log(`  Scripts folder: ${fs.existsSync(devScriptsPath) ? 'EXISTS' : 'MISSING'}`);
        console.log(`  Libraries folder: ${fs.existsSync(devLibrariesPath) ? 'EXISTS' : 'MISSING'}`);
        
        if (fs.existsSync(devScriptsPath)) {
          const compiledFiles = fs.readdirSync(devScriptsPath).filter(f => f.endsWith('.js'));
          console.log(`  Compiled JS files: ${compiledFiles.length}`);
          compiledFiles.forEach(file => console.log(`    ${file}`));
        }
      }
    }
    
    // Check active watchers
    console.log('\n=== ACTIVE WATCHERS ===');
    if (this.activeWatchers.size > 0) {
      this.activeWatchers.forEach((watcher, name) => {
        console.log(`  ${name}: ACTIVE`);
      });
    } else {
      console.log('  No active watchers');
    }
    
    // System information
    console.log('\n=== SYSTEM INFORMATION ===');
    console.log(`  Node.js version: ${process.version}`);
    console.log(`  Platform: ${process.platform}`);
    console.log(`  Architecture: ${process.arch}`);
    console.log(`  Working directory: ${process.cwd()}`);
    
    // Available libraries
    if (fs.existsSync(this.librariesDir)) {
      const availableLibs = fs.readdirSync(this.librariesDir)
        .filter(item => fs.statSync(path.join(this.librariesDir, item)).isDirectory());
      
      console.log('\n=== AVAILABLE LIBRARIES ===');
      availableLibs.forEach(lib => {
        const libPath = path.join(this.librariesDir, lib);
        const files = fs.readdirSync(libPath).filter(f => f.endsWith('.js'));
        console.log(`  ${lib}/ (${files.length} files)`);
        files.forEach(file => console.log(`    ${file}`));
      });
    }
    
    console.log('\n=== DEBUG COMPLETE ===');
  }
}

// CLI Interface
if (require.main === module) {
  const manager = new WorkspaceManager();
  const command = process.argv[2];
  const projectName = process.argv[3];

  switch (command) {
    case 'start':
      if (!projectName) {
        console.error('Usage: node workspace-manager.js start <project-name>');
        process.exit(1);
      }
      manager.startProject(projectName).catch(console.error);
      break;
    
    case 'start-current':
      manager.startCurrentProject().catch(console.error);
      break;
    
    case 'build':
      manager.buildOnce(projectName).catch(console.error);
      break;
    
    case 'build-current':
      manager.buildOnce().catch(console.error);
      break;
    
    case 'stop':
      if (!projectName) {
        console.error('Usage: node workspace-manager.js stop <project-name>');
        process.exit(1);
      }
      manager.stopProject(projectName);
      break;
    
    case 'list':
      manager.listProjects();
      break;
    
    case 'list-libraries':
      manager.listLibraries();
      break;
    
    case 'sync-development':
      manager.syncDevelopment(projectName).catch(console.error);
      break;
    
    case 'debug':
      manager.debugProject(projectName);
      break;
    
    default:
      console.log('Available commands:');
      console.log('  start <project>     - Start monitoring a project');
      console.log('  start-current       - Start monitoring current project');
      console.log('  build <project>     - Build project once');
      console.log('  build-current       - Build current project once');
      console.log('  sync-development    - Force sync with development folder');
      console.log('  stop <project>      - Stop monitoring a project');
      console.log('  list               - List available projects');
      console.log('  list-libraries     - List available libraries');
      console.log('  debug [project]    - Show debug information');
  }
}

module.exports = WorkspaceManager;
