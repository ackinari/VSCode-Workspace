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

async function createLibrary() {
  console.log('📚 Creating new global library...\n');

  const libraryName = await question('Library name: ');
  if (!libraryName) {
    console.log('❌ Library name is required');
    rl.close();
    return;
  }

  const description = await question('Library description: ') || `Utility functions for ${libraryName}`;
  const author = await question('Author name: ') || 'Anonymous';

  const libraryPath = path.join(__dirname, '..', 'libraries', libraryName);
  
  if (fs.existsSync(libraryPath)) {
    console.log('❌ Library already exists');
    rl.close();
    return;
  }

  // Create library directory
  fs.mkdirSync(libraryPath, { recursive: true });

  // Create main library file
  const mainFileName = `${libraryName}.js`;
  const mainFilePath = path.join(libraryPath, mainFileName);

  const libraryTemplate = `/**
 * ${description}
 * @author ${author}
 * @version 1.0.0
 */

/**
 * Example function - replace with your own functions
 * @param {any} value - The value to process
 * @returns {any} Processed value
 */
export function example(value) {
  return value;
}

/**
 * Another example function
 * @param {string} message - Message to log
 */
export function log(message) {
  console.log(\`[${libraryName}] \${message}\`);
}

// Add more functions here...
`;

  fs.writeFileSync(mainFilePath, libraryTemplate);

  // Create TypeScript declaration file
  const dtsFileName = `${libraryName}.d.ts`;
  const dtsFilePath = path.join(libraryPath, dtsFileName);

  const dtsTemplate = `/**
 * ${description}
 * @author ${author}
 * @version 1.0.0
 */

/**
 * Example function - replace with your own functions
 * @param value - The value to process
 * @returns Processed value
 */
export function example(value: any): any;

/**
 * Another example function
 * @param message - Message to log
 */
export function log(message: string): void;

// Add more function declarations here...
`;

  fs.writeFileSync(dtsFilePath, dtsTemplate);

  // Create index.js for easier imports
  const indexFileName = 'index.js';
  const indexFilePath = path.join(libraryPath, indexFileName);
  const indexTemplate = `// Re-export all functions from ${mainFileName} for easier importing
export * from './${mainFileName}';`;

  fs.writeFileSync(indexFilePath, indexTemplate);

  // Create index.d.ts for TypeScript support
  const indexDtsFileName = 'index.d.ts';
  const indexDtsFilePath = path.join(libraryPath, indexDtsFileName);
  const indexDtsTemplate = `// Re-export all types from ${dtsFileName} for easier importing
export * from './${dtsFileName}';`;

  fs.writeFileSync(indexDtsFilePath, indexDtsTemplate);

  // Create README for the library
  const readmePath = path.join(libraryPath, 'README.md');
  const readmeContent = `# ${libraryName}

${description}

## Usage

\`\`\`javascript
import { example, log } from './libraries/${libraryName}/${mainFileName}';

// Use the functions
const result = example('hello world');
log('Library loaded successfully!');
\`\`\`

## Functions

### \`example(value)\`
- **Description**: Example function - replace with your own
- **Parameters**: 
  - \`value\` (any): The value to process
- **Returns**: (any) Processed value

### \`log(message)\`
- **Description**: Logs a message with library prefix
- **Parameters**: 
  - \`message\` (string): Message to log
- **Returns**: void

## Author

${author}

## Version

1.0.0
`;

  fs.writeFileSync(readmePath, readmeContent);

  // Create package.json for the library
  const packageJsonPath = path.join(libraryPath, 'package.json');
  const packageJson = {
    name: `@workspace/${libraryName}`,
    version: "1.0.0",
    description: description,
    main: mainFileName,
    author: author,
    license: "MIT",
    keywords: [
      "minecraft",
      "bedrock",
      "library",
      "utility",
      libraryName
    ],
    type: "module"
  };

  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

  console.log('\n✅ Library created successfully!');
  console.log(`📁 Library location: ${libraryPath}`);
  console.log(`📝 Main file: ${mainFileName}`);
  console.log(`👤 Author: ${author}`);
  
  console.log('\n📖 Usage example:');
  console.log(`import { example, log } from './libraries/${libraryName}/${mainFileName}';`);
  console.log('');
  console.log('const result = example("hello world");');
  console.log('log("Library loaded successfully!");');
  
  console.log('\n🚀 Next steps:');
  console.log(`1. Edit libraries/${libraryName}/${mainFileName}`);
  console.log('2. Add your custom functions');
  console.log('3. Use the library in your projects with import statements');
  console.log('4. The library will be automatically synced when used');

  rl.close();
}

createLibrary().catch(console.error);
