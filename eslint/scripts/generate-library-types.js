#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Generates TypeScript declaration files for JavaScript libraries based on JSDoc
 */
class LibraryTypeGenerator {
  constructor() {
    this.librariesDir = path.join(__dirname, '..', '..', 'libraries');
  }

  /**
   * Parse JSDoc comments from JavaScript code
   */
  parseJSDoc(content) {
    const functions = [];
    const classes = [];
    
    // Match JSDoc comments followed by function/class declarations
    const jsdocPattern = /\/\*\*([\s\S]*?)\*\/\s*(?:export\s+)?(?:(function|class|const|let|var)\s+(\w+)|(\w+)\s*[:=]\s*(?:function|\(.*?\)\s*=>))/g;
    
    let match;
    while ((match = jsdocPattern.exec(content)) !== null) {
      const [fullMatch, jsdocContent, declarationType, declaredName, assignedName] = match;
      const name = declaredName || assignedName;
      
      if (!name) continue;
      
      const jsdoc = this.parseJSDocContent(jsdocContent);
      
      if (declarationType === 'class') {
        classes.push({
          name,
          jsdoc,
          type: 'class'
        });
      } else {
        functions.push({
          name,
          jsdoc,
          type: 'function'
        });
      }
    }
    
    // Also look for export statements
    const exportPattern = /export\s*\{\s*([^}]+)\s*\}/g;
    const exports = [];
    
    while ((match = exportPattern.exec(content)) !== null) {
      const exportList = match[1].split(',').map(item => item.trim());
      exports.push(...exportList);
    }
    
    return { functions, classes, exports };
  }

  /**
   * Parse JSDoc content to extract parameters, returns, description
   */
  parseJSDocContent(jsdocContent) {
    const lines = jsdocContent.split('\n').map(line => line.replace(/^\s*\*\s?/, '').trim());
    
    const result = {
      description: '',
      params: [],
      returns: null,
      author: null,
      version: null
    };
    
    let currentSection = 'description';
    
    for (const line of lines) {
      if (line.startsWith('@param')) {
        currentSection = 'param';
        const paramMatch = line.match(/@param\s*\{([^}]+)\}\s*(\w+)\s*-?\s*(.*)/);
        if (paramMatch) {
          result.params.push({
            type: paramMatch[1],
            name: paramMatch[2],
            description: paramMatch[3] || ''
          });
        }
      } else if (line.startsWith('@returns') || line.startsWith('@return')) {
        const returnMatch = line.match(/@returns?\s*\{([^}]+)\}\s*(.*)/);
        if (returnMatch) {
          result.returns = {
            type: returnMatch[1],
            description: returnMatch[2] || ''
          };
        }
      } else if (line.startsWith('@author')) {
        result.author = line.replace('@author', '').trim();
      } else if (line.startsWith('@version')) {
        result.version = line.replace('@version', '').trim();
      } else if (currentSection === 'description' && line && !line.startsWith('@')) {
        result.description += (result.description ? ' ' : '') + line;
      }
    }
    
    return result;
  }

  /**
   * Convert JSDoc type to TypeScript type
   */
  convertType(jsdocType) {
    if (!jsdocType) return 'any';
    
    const typeMap = {
      'string': 'string',
      'number': 'number',
      'boolean': 'boolean',
      'object': 'object',
      'array': 'any[]',
      'Array': 'any[]',
      'function': 'Function',
      'Function': 'Function',
      'void': 'void',
      'undefined': 'undefined',
      'null': 'null',
      'any': 'any'
    };
    
    // Handle array types like Array<string> or string[]
    if (jsdocType.includes('Array<') || jsdocType.includes('[]')) {
      return jsdocType.replace(/Array<([^>]+)>/, '$1[]');
    }
    
    // Handle union types
    if (jsdocType.includes('|')) {
      return jsdocType.split('|').map(t => typeMap[t.trim()] || t.trim()).join(' | ');
    }
    
    return typeMap[jsdocType] || jsdocType;
  }

  /**
   * Generate TypeScript declaration for a function
   */
  generateFunctionDeclaration(func) {
    const { name, jsdoc } = func;
    
    let declaration = '';
    
    // Add JSDoc comment
    if (jsdoc.description || jsdoc.params.length > 0 || jsdoc.returns) {
      declaration += '/**\n';
      if (jsdoc.description) {
        declaration += ` * ${jsdoc.description}\n`;
      }
      
      jsdoc.params.forEach(param => {
        declaration += ` * @param ${param.name} - ${param.description}\n`;
      });
      
      if (jsdoc.returns) {
        declaration += ` * @returns ${jsdoc.returns.description}\n`;
      }
      
      declaration += ' */\n';
    }
    
    // Generate function signature
    const params = jsdoc.params.map(param => {
      const type = this.convertType(param.type);
      return `${param.name}: ${type}`;
    }).join(', ');
    
    const returnType = jsdoc.returns ? this.convertType(jsdoc.returns.type) : 'any';
    
    declaration += `export function ${name}(${params}): ${returnType};`;
    
    return declaration;
  }

  /**
   * Generate TypeScript declaration for a class
   */
  generateClassDeclaration(cls) {
    const { name, jsdoc } = cls;
    
    let declaration = '';
    
    // Add JSDoc comment
    if (jsdoc.description) {
      declaration += '/**\n';
      declaration += ` * ${jsdoc.description}\n`;
      if (jsdoc.author) {
        declaration += ` * @author ${jsdoc.author}\n`;
      }
      if (jsdoc.version) {
        declaration += ` * @version ${jsdoc.version}\n`;
      }
      declaration += ' */\n';
    }
    
    declaration += `export declare class ${name} {\n`;
    declaration += '  // Add method declarations here based on your class implementation\n';
    declaration += '}';
    
    return declaration;
  }

  /**
   * Process a single library directory
   */
  processLibrary(libraryPath) {
    const libraryName = path.basename(libraryPath);
    console.log(`Processing library: ${libraryName}`);
    
    // Find JavaScript files
    const jsFiles = fs.readdirSync(libraryPath)
      .filter(file => file.endsWith('.js') && !file.startsWith('index.'));
    
    if (jsFiles.length === 0) {
      console.log(`  No JavaScript files found in ${libraryName}`);
      return;
    }
    
    const allDeclarations = [];
    const allExports = [];
    
    // Process each JavaScript file
    for (const jsFile of jsFiles) {
      const jsFilePath = path.join(libraryPath, jsFile);
      const content = fs.readFileSync(jsFilePath, 'utf8');
      
      const parsed = this.parseJSDoc(content);
      
      // Generate declarations for functions
      parsed.functions.forEach(func => {
        const declaration = this.generateFunctionDeclaration(func);
        allDeclarations.push(declaration);
        allExports.push(func.name);
      });
      
      // Generate declarations for classes
      parsed.classes.forEach(cls => {
        const declaration = this.generateClassDeclaration(cls);
        allDeclarations.push(declaration);
        allExports.push(cls.name);
      });
      
      // Create individual .d.ts file
      const dtsFileName = jsFile.replace('.js', '.d.ts');
      const dtsFilePath = path.join(libraryPath, dtsFileName);
      
      let dtsContent = '';
      
      // Add imports if needed
      if (content.includes('import')) {
        const importMatches = content.match(/import\s+.*?\s+from\s+['"][^'"]+['"]/g);
        if (importMatches) {
          importMatches.forEach(importStatement => {
            // Convert JS imports to TS imports
            dtsContent += importStatement + '\n';
          });
          dtsContent += '\n';
        }
      }
      
      // Add function declarations
      const fileFunctions = parsed.functions.filter(func => 
        content.includes(`function ${func.name}`) || 
        content.includes(`${func.name} =`) ||
        content.includes(`export function ${func.name}`)
      );
      
      const fileClasses = parsed.classes.filter(cls => 
        content.includes(`class ${cls.name}`) || 
        content.includes(`export class ${cls.name}`)
      );
      
      fileFunctions.forEach(func => {
        dtsContent += this.generateFunctionDeclaration(func) + '\n\n';
      });
      
      fileClasses.forEach(cls => {
        dtsContent += this.generateClassDeclaration(cls) + '\n\n';
      });
      
      if (dtsContent.trim()) {
        fs.writeFileSync(dtsFilePath, dtsContent);
        console.log(`  Generated ${dtsFileName}`);
      }
    }
    
    // Create or update index.js
    const indexJsPath = path.join(libraryPath, 'index.js');
    if (!fs.existsSync(indexJsPath) && allExports.length > 0) {
      const indexContent = jsFiles.map(file => {
        const baseName = file.replace('.js', '');
        return `export * from './${baseName}.js';`;
      }).join('\n');
      
      fs.writeFileSync(indexJsPath, indexContent);
      console.log(`  Generated index.js`);
    }
    
    // Create or update index.d.ts
    const indexDtsPath = path.join(libraryPath, 'index.d.ts');
    if (allDeclarations.length > 0) {
      const indexDtsContent = jsFiles.map(file => {
        const baseName = file.replace('.js', '');
        return `export * from './${baseName}';`;
      }).join('\n');
      
      fs.writeFileSync(indexDtsPath, indexDtsContent);
      console.log(`  Generated index.d.ts`);
    }
  }

  /**
   * Process all libraries
   */
  processAllLibraries() {
    if (!fs.existsSync(this.librariesDir)) {
      console.log('Libraries directory not found');
      return;
    }
    
    const libraries = fs.readdirSync(this.librariesDir)
      .filter(item => {
        const itemPath = path.join(this.librariesDir, item);
        return fs.statSync(itemPath).isDirectory() && item !== 'templates';
      });
    
    console.log(`Found ${libraries.length} libraries to process\n`);
    
    libraries.forEach(library => {
      const libraryPath = path.join(this.librariesDir, library);
      this.processLibrary(libraryPath);
      console.log('');
    });
    
    console.log('✅ Library type generation completed!');
  }
}

// CLI usage
if (require.main === module) {
  const generator = new LibraryTypeGenerator();
  
  const libraryName = process.argv[2];
  
  if (libraryName) {
    const libraryPath = path.join(generator.librariesDir, libraryName);
    if (fs.existsSync(libraryPath)) {
      generator.processLibrary(libraryPath);
    } else {
      console.log(`Library '${libraryName}' not found`);
    }
  } else {
    generator.processAllLibraries();
  }
}

module.exports = LibraryTypeGenerator;
