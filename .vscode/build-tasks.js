import * as esbuild from 'esbuild'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import * as rimraf from 'rimraf'
import * as rushstack from '@rushstack/node-core-library'
import * as just_scripts from 'just-scripts'
import * as zip_lib from 'zip-lib'
import * as child_process from 'child_process'
import * as process from 'process'
import * as crypto from 'crypto'
import * as readline from 'readline'

var MinecraftProduct = /* @__PURE__ */ ((MinecraftProduct2) => {
    MinecraftProduct2['BedrockGDK'] = 'BedrockGDK'
    MinecraftProduct2['PreviewGDK'] = 'PreviewGDK'
    MinecraftProduct2['Bedrock'] = 'BedrockUWP'
    MinecraftProduct2['Preview'] = 'PreviewUWP'
    MinecraftProduct2['Custom'] = 'Custom'
    return MinecraftProduct2
})(MinecraftProduct || {})

export function setupEnvironment(envPath) {
    dotenv.config({path: envPath})
}

var MAP_EXTENSION = '.map'
function isRequiredToMakeAnyFileChange(sourcemap) {
    return sourcemap !== false && sourcemap !== 'inline'
}
function isRequiredToLinkJsFile(sourcemap) {
    return sourcemap === true || sourcemap === 'linked'
}
function linkSourceMaps(sourceMapDirectory, outputDirectory, options, outputFiles) {
    const generatedFiles = {}
    for (const element of outputFiles) {
        if (element.path.endsWith(MAP_EXTENSION)) {
            const parsedPath = path.parse(element.path)
            const sourceMapFilePath = path.join(sourceMapDirectory, parsedPath.base)
            const sourceMapContent = JSON.parse(element.text)
            sourceMapContent.file = path.relative(sourceMapDirectory, path.join(outputDirectory, parsedPath.name)).replace(/\\/g, '/')
            generatedFiles[sourceMapFilePath] = JSON.stringify(sourceMapContent)
        } else if (isRequiredToLinkJsFile(options.sourcemap)) {
            const dir = path.parse(element.path).dir
            const targetSourceMap = path.join(path.relative(dir, sourceMapDirectory), path.parse(element.path).base).replace(/\\/g, '/')
            generatedFiles[element.path] =
                element.text +
                `
//# sourceMappingURL=${targetSourceMap}${MAP_EXTENSION}
`
        } else {
            generatedFiles[element.path] = element.text
        }
    }
    return generatedFiles
}
function writeFiles(postProcessOutputFilesResult) {
    fs.mkdirSync(postProcessOutputFilesResult.outputDirectory, {
        recursive: true,
    })
    if (postProcessOutputFilesResult.sourceMapDirectory !== postProcessOutputFilesResult.outputDirectory) {
        fs.mkdirSync(postProcessOutputFilesResult.sourceMapDirectory, {
            recursive: true,
        })
    }
    for (const path10 of Object.keys(postProcessOutputFilesResult.generatedFiles)) {
        fs.writeFileSync(path10, postProcessOutputFilesResult.generatedFiles[path10])
    }
}
function postProcessOutputFiles(options, buildResult) {
    if (!buildResult.outputFiles) {
        return void 0
    }
    const outputDirectory = path.parse(options.outfile).dir
    const sourceMapDirectory = path.resolve(options.outputSourcemapPath ?? outputDirectory)
    const generatedFiles = linkSourceMaps(sourceMapDirectory, outputDirectory, options, buildResult.outputFiles)
    return {sourceMapDirectory, outputDirectory, generatedFiles}
}
export function bundleTask(options) {
    return () => {
        const isRequiredToMakeChanges = isRequiredToMakeAnyFileChange(options.sourcemap)
        const isRequiredToLinkJs = isRequiredToLinkJsFile(options.sourcemap)
        const buildResult = esbuild.buildSync({
            entryPoints: [options.entryPoint],
            bundle: true,
            format: 'esm',
            minifyWhitespace: options.minifyWhitespace,
            outfile: options.outfile,
            sourcemap: isRequiredToLinkJs ? 'external' : options.sourcemap,
            external: options.external,
            write: !isRequiredToMakeChanges,
            dropLabels: options.dropLabels,
            alias: options.alias,
        })
        if (buildResult.errors.length === 0) {
            if (isRequiredToMakeChanges) {
                if (!buildResult.outputFiles) {
                    process.exitCode = 1
                    return Promise.reject(new Error('No output files were generated, check that your entrypoint file is configured correctly.'))
                }
                const result = postProcessOutputFiles(options, buildResult)
                if (result) {
                    writeFiles(result)
                }
            }
            process.exitCode = 0
            return Promise.resolve()
        }
        process.exitCode = 1
        return Promise.reject(new Error(buildResult.errors.join('\n')))
    }
}

export function cleanTask(dirs) {
    return () => {
        for (const dir of dirs) {
            try {
                console.log(`Cleaning ${path.resolve(process.cwd(), dir)}`)
                rimraf.sync(path.resolve(process.cwd(), dir))
            } catch (_2) {}
        }
    }
}

export function getOrThrowFromProcess(key, messageOverride = undefined) {
    const value = process.env[key]
    if (!value) {
        throw new Error(messageOverride ?? `Missing environment variable ${key}. Make sure to configure project.`)
    }
    return value
}

export const STANDARD_CLEAN_PATHS = [
    'APPDATA/Minecraft Bedrock/Users/Shared/games/com.mojang/development_behavior_packs/PROJECT_NAME_BP',
    'APPDATA/Minecraft Bedrock/Users/Shared/games/com.mojang/development_resource_packs/PROJECT_NAME_RP',
    'APPDATA/Minecraft Bedrock Preview/Users/Shared/games/com.mojang/development_behavior_packs/PROJECT_NAME_BP',
    'APPDATA/Minecraft Bedrock Preview/Users/Shared/games/com.mojang/development_resource_packs/PROJECT_NAME_RP',
    'LOCALAPPDATA/Packages/Microsoft.MinecraftUWP_8wekyb3d8bbwe/LocalState/games/com.mojang/development_behavior_packs/PROJECT_NAME_BP',
    'LOCALAPPDATA/Packages/Microsoft.MinecraftUWP_8wekyb3d8bbwe/LocalState/games/com.mojang/development_resource_packs/PROJECT_NAME_RP',
    'LOCALAPPDATA/Packages/Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe/LocalState/games/com.mojang/development_behavior_packs/PROJECT_NAME_BP',
    'LOCALAPPDATA/Packages/Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe/LocalState/games/com.mojang/development_resource_packs/PROJECT_NAME_RP',
]
export function cleanCollateralTask(pathsToClean, projectName) {
    return () => {
        const errorToken = '$ERROR_TOKEN$'
        let appData = process.env.APPDATA
        if (!appData) {
            console.warn('Proceeding without APPDATA on this platform. File copy will fail if APPDATA is required.')
            appData = errorToken
        }
        let localAppData = process.env.LOCALAPPDATA
        if (!localAppData) {
            console.warn('Proceeding without LOCALAPPDATA on this platform. File copy will fail if LOCALAPPDATA is required.')
            localAppData = errorToken
        }
        for (const cleanPathRaw of pathsToClean) {
            const cleanPath = cleanPathRaw.replace('LOCALAPPDATA', localAppData).replace('APPDATA', appData).replace('PROJECT_NAME', projectName)
            if (cleanPath.includes(errorToken)) {
                console.warn(`Skipping clean of ${cleanPath} on current platform due to APPDATA or LOCALAPPDATA being missing.`)
                continue
            }
            try {
                const stats = fs.statSync(cleanPath)
                console.log(`Cleaning ${stats.isDirectory() ? 'directory' : 'file'} ${path.resolve(cleanPath)}.`)
                rimraf.sync(cleanPath)
            } catch (_2) {}
        }
    }
}

function copyFiles(originPaths, outputPath, skipIfPossible = true) {
    const destinationPath = path.resolve(outputPath)
    const MTIME_TOLERANCE_MS = 1e3
    for (const originPath of originPaths) {
        const inputPath = path.resolve(originPath)
        const pathStats = rushstack.FileSystem.getLinkStatistics(inputPath)
        if (pathStats.isDirectory()) {
            console.log(`Copying folder ${inputPath} to ${destinationPath}`)
        } else {
            const filename = path.parse(inputPath).base
            const fileDestinationPath = path.resolve(destinationPath, filename)
            let shouldCopy = true
            if (skipIfPossible) {
                try {
                    const destFileStats = rushstack.FileSystem.getStatistics(fileDestinationPath)
                    if (destFileStats.size !== pathStats.size) {
                        shouldCopy = true
                    } else {
                        const srcMtime = pathStats.mtimeMs ?? pathStats.mtime.getTime()
                        const destMtime = destFileStats.mtimeMs ?? destFileStats.mtime.getTime()
                        if (Math.abs(srcMtime - destMtime) > MTIME_TOLERANCE_MS) {
                            shouldCopy = true
                        } else {
                            shouldCopy = false
                        }
                    }
                } catch {
                    shouldCopy = true
                }
            }
            if (!shouldCopy) {
                console.log(`Skipping copy for ${inputPath}; no change detected`)
                continue
            }
            console.log(`Copying file ${inputPath} to ${fileDestinationPath}`)
            rushstack.FileSystem.copyFiles({sourcePath: inputPath, destinationPath: fileDestinationPath, preserveTimestamps: true})
            continue
        }
        rushstack.FileSystem.copyFiles({sourcePath: inputPath, destinationPath, preserveTimestamps: true})
    }
}

function getGameDeploymentRootPaths() {
    const localAppDataPath = process.env['LOCALAPPDATA']
    const appDataPath = process.env['APPDATA']
    const customDeploymentPath = process.env['CUSTOM_DEPLOYMENT_PATH']
    return {
        BedrockGDK: appDataPath ? (0, path.resolve)(appDataPath, 'Minecraft Bedrock/Users/Shared/games/com.mojang/') : void 0,
        PreviewGDK: appDataPath ? (0, path.resolve)(appDataPath, 'Minecraft Bedrock Preview/Users/Shared/games/com.mojang/') : void 0,
        BedrockUWP: localAppDataPath ? (0, path.resolve)(localAppDataPath, 'Packages/Microsoft.MinecraftUWP_8wekyb3d8bbwe/LocalState/games/com.mojang/') : void 0,
        PreviewUWP: localAppDataPath ? (0, path.resolve)(localAppDataPath, 'Packages/Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe/LocalState/games/com.mojang/') : void 0,
        Custom: customDeploymentPath ? customDeploymentPath : void 0,
    }
}
function getTargetWorldPath() {
    let deploymentPath = void 0
    let product
    try {
        product = getOrThrowFromProcess('MINECRAFT_PRODUCT')
        deploymentPath = getGameDeploymentRootPaths()[product]
    } catch (_2) {
        throw new Error('Unable to get deployment path. Make sure to configure package root correctly.')
    }
    if (deploymentPath === void 0) {
        throw new Error('Deployment path is undefined. Make sure to configure package root correctly.')
    }
    const projectName = getOrThrowFromProcess('PROJECT_NAME')
    const worldsFolderName = product === 'Custom' /* Custom */ ? 'worlds' : 'minecraftWorlds'
    const activeWorldFolderName = product === 'Custom' /* Custom */ ? 'Bedrock level' : `${projectName}world`
    return path.join(deploymentPath, worldsFolderName, activeWorldFolderName)
}

var BehaviorPacksPath = 'development_behavior_packs'
var ResourcePacksPath = 'development_resource_packs'
export function copyTask(params, projectName) {
    return () => {
        // const projectName = getOrThrowFromProcess("PROJECT_NAME"); // passei como parametro
        let deploymentPath = void 0
        try {
            //   const product = getOrThrowFromProcess("MINECRAFT_PRODUCT");
            const product = 'BedrockUWP'
            deploymentPath = getGameDeploymentRootPaths()[product]
        } catch (_2) {
            throw new Error('Unable to get deployment path. Make sure to configure package root correctly.')
        }
        if (deploymentPath === void 0) {
            throw new Error('Deployment path is undefined. Make sure to configure package root correctly.')
        }
        params.copyToBehaviorPacks && copyFiles(params.copyToBehaviorPacks, path.join(deploymentPath, BehaviorPacksPath, projectName + '_BP'))
        params.copyToScripts && copyFiles(params.copyToScripts, path.join(deploymentPath, BehaviorPacksPath, projectName + '_BP', 'scripts'))
        params.copyToResourcePacks && copyFiles(params.copyToResourcePacks, path.join(deploymentPath, ResourcePacksPath, projectName + '_RP'))
    }
}

var WATCH_TASK_NAME = 'watch-task'
;(0, just_scripts.option)('watch')
function executeTask(taskFunction) {
    void taskFunction.call(void 0, () => {})
}
export function watchTask(globs, taskFunction) {
    return () => {
        const watchArgs = (0, just_scripts.argv)()
        if (!watchArgs.watch) {
            return taskFunction
        }
        let taskInProgress = true
        let pendingWork = false
        const onFinished = (args) => {
            if (args.name === WATCH_TASK_NAME) {
                if (pendingWork) {
                    just_scripts.logger.info('Processing pending changes...')
                    pendingWork = false
                    executeTask(origTask)
                } else {
                    just_scripts.logger.info('Waiting for new changes...')
                    taskInProgress = false
                }
            }
        }
        just_scripts.undertaker.on('start', function (args) {
            if (args.name === WATCH_TASK_NAME) {
                taskInProgress = true
            }
        })
        just_scripts.undertaker.on('stop', function (args) {
            onFinished(args)
        })
        just_scripts.undertaker.on('error', function (args) {
            onFinished(args)
        })
        ;(0, just_scripts.task)(WATCH_TASK_NAME, (0, just_scripts.series)(taskFunction))
        const origTask = (0, just_scripts.series)(WATCH_TASK_NAME)
        executeTask(origTask)
        ;(0, just_scripts.watch)(globs, () => {
            if (!taskInProgress) {
                executeTask(origTask)
            } else {
                pendingWork = true
            }
        })
        return Promise.resolve()
    }
}

function addContentsToZip(zipContents, zip) {
    for (const content of zipContents) {
        for (const originPath of content.contents) {
            const inputPath = path.resolve(originPath)
            const pathStats = rushstack.FileSystem.getLinkStatistics(inputPath)
            if (pathStats.isDirectory()) {
                console.log(`Adding folder ${inputPath} to package`)
                zip.addFolder(inputPath, content.targetPath)
            } else {
                const metadataPath = content.targetPath ? path.join(content.targetPath, path.parse(inputPath).base) : void 0
                console.log(`Adding file ${inputPath} to package`)
                zip.addFile(inputPath, metadataPath)
            }
        }
    }
}
function zipTask(outputFile, zipContents) {
    return async function zip() {
        if (zipContents.length === 0 || !zipContents.some((content) => content.contents.length > 0)) {
            process.exitCode = 0
            return Promise.resolve()
        }
        const zip2 = new zip_lib.Zip()
        addContentsToZip(zipContents, zip2)
        let isSucceeded = true
        let errorMessage = ''
        await zip2.archive(outputFile).then(
            function () {
                console.error(`Compressed file created at ${outputFile}`)
            },
            function (err) {
                isSucceeded = false
                errorMessage = `Compressed file failed to be created at ${outputFile}: ${err}`
                console.error(errorMessage)
            }
        )
        if (isSucceeded) {
            process.exitCode = 0
            return Promise.resolve()
        }
        process.exitCode = 1
        return Promise.reject(new Error(errorMessage))
    }
}
export function mcaddonTask(params) {
    const targetFolder = path.parse(params.outputFile).dir
    const outputFileName = path.parse(params.outputFile).name
    const behaviorPackFile = path.join(targetFolder, `${outputFileName}_bp.mcpack`)
    const resourcePackFile = path.join(targetFolder, `${outputFileName}_rp.mcpack`)
    const mcaddonContents = {contents: [behaviorPackFile]}
    if (params.copyToResourcePacks && params.copyToResourcePacks.length > 0) {
        mcaddonContents.contents.push(resourcePackFile)
    }
    ;(0, just_scripts.task)('packBP', zipTask(behaviorPackFile, [{contents: params.copyToBehaviorPacks}, {contents: params.copyToScripts, targetPath: 'scripts'}]))
    ;(0, just_scripts.task)('packRP', zipTask(resourcePackFile, [{contents: params.copyToResourcePacks ?? []}]))
    ;(0, just_scripts.task)('packMcaddon', zipTask(params.outputFile, [mcaddonContents]))
    return (0, just_scripts.series)((0, just_scripts.parallel)('packBP', 'packRP'), 'packMcaddon')
}

//! remove later:
var LEGACY_CONFIG_FILES = ['.eslintrc.js']
var FLAT_CONFIG_FILES = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs']
var POSSIBLE_CONFIG_FILES = [...LEGACY_CONFIG_FILES, ...FLAT_CONFIG_FILES]
function getConfigFilePath() {
    for (const file of POSSIBLE_CONFIG_FILES) {
        const configPath = path.resolve(process.cwd(), file)
        if ((0, fs.existsSync)(configPath)) {
            return configPath
        }
    }
    return void 0
}
function eslintTask(fix) {
    return () => {
        const configFilePath = getConfigFilePath()
        if (!configFilePath) {
            return Promise.resolve()
        }
        process.env['ESLINT_USE_FLAT_CONFIG'] = FLAT_CONFIG_FILES.some((file) => configFilePath.endsWith(file)) ? 'true' : 'false'
        const cmd = ['npx', 'eslint', '.', '--config', `"${configFilePath}"`, ...(fix ? ['--fix'] : []), '--color'].join(' ')
        just_scripts.logger.info(`Running command: ${cmd}`)
        return (0, child_process.execSync)(cmd, {stdio: 'inherit'})
    }
}
function prettierTask(files, fix) {
    return () => {
        if (!files || files.length === 0) {
            return Promise.resolve()
        }
        const cmd = ['npx', 'prettier', fix ? '--write' : '--check', ...files].join(' ')
        return (0, child_process.execSync)(cmd, {stdio: 'inherit'})
    }
}
export function coreLint(prettierFiles, fix) {
    ;(0, just_scripts.task)('verify-lint', () => {
        if (!getConfigFilePath()) {
            throw new Error(`ESLint config file not found at ${process.cwd()}. Possible values: [${POSSIBLE_CONFIG_FILES.join(', ')}]`)
        }
    })
    ;(0, just_scripts.task)('eslint', eslintTask(fix))
    ;(0, just_scripts.task)('prettier', prettierTask(prettierFiles, fix))
    return (0, just_scripts.series)(
        'verify-lint',
        'eslint',
        (0, just_scripts.condition)('prettier', () => !!prettierFiles && prettierFiles.length > 0)
    )
}

export function newProjectTask(rootPath) {
    return async () => {
        const rl = readline.createInterface({input: process.stdin, output: process.stdout})

        const askQuestion = (question) => {
            return new Promise((resolve) => {
                rl.question(question, (answer) => {
                    resolve(answer.trim())
                })
            })
        }

        try {
            const rawProjectName = await askQuestion('Enter project name: ')

            if (!rawProjectName) {
                console.error('Project name cannot be empty')
                rl.close()
                return
            }

            const projectName = rawProjectName.replace(/['"]/g, '').trim()
            const folderName = projectName.replace(/\s+/g, '_')

            const projectPath = path.join(rootPath, 'projects', folderName)
            const templatePath = path.join(rootPath, 'projects', 'template')

            if (fs.existsSync(projectPath)) {
                console.error(`Project "${projectName}" already exists`)
                rl.close()
                return
            }

            console.log(`Creating project "${projectName}"...`)

            rushstack.FileSystem.copyFiles({
                sourcePath: templatePath,
                destinationPath: projectPath,
                preserveTimestamps: true,
            })

            const behaviorHeaderUuid = crypto.randomUUID()
            const behaviorModuleUuid = crypto.randomUUID()
            const resourceHeaderUuid = crypto.randomUUID()
            const resourceModuleUuid = crypto.randomUUID()

            const behaviorManifestPath = path.join(projectPath, 'behavior_pack', 'manifest.json')
            const behaviorManifest = JSON.parse(fs.readFileSync(behaviorManifestPath, 'utf8'))
            behaviorManifest.header.uuid = behaviorHeaderUuid
            behaviorManifest.modules[0].uuid = behaviorModuleUuid
            behaviorManifest.dependencies[0].uuid = resourceHeaderUuid
            fs.writeFileSync(behaviorManifestPath, JSON.stringify(behaviorManifest, null, 4))

            const resourceManifestPath = path.join(projectPath, 'resource_pack', 'manifest.json')
            const resourceManifest = JSON.parse(fs.readFileSync(resourceManifestPath, 'utf8'))
            resourceManifest.header.uuid = resourceHeaderUuid
            resourceManifest.modules[0].uuid = resourceModuleUuid
            if (resourceManifest.dependencies && resourceManifest.dependencies[0]) {
                resourceManifest.dependencies[0].uuid = behaviorHeaderUuid
            }
            fs.writeFileSync(resourceManifestPath, JSON.stringify(resourceManifest, null, 4))

            const langFilePath = path.join(projectPath, 'resource_pack', 'texts', 'en_US.lang')
            const langContent = fs.readFileSync(langFilePath, 'utf8')
            const updatedLangContent = langContent.replace(/pack\.name=.*/g, `pack.name=${projectName}`)
            fs.writeFileSync(langFilePath, updatedLangContent)

            console.log(`Project "${projectName}" created successfully!`)
            console.log(`Location: ${projectPath}`)

            const openCode = await askQuestion('Open this project in VS Code? (y/n): ')

            if (openCode.toLowerCase() === 'y') {
                console.log('Opening VS Code...')

                child_process.exec(`code -r "${projectPath}"`, (err) => {
                    if (err) {
                        console.error('\nFailed to open VS Code automatically.')
                        console.error('Make sure the "code" command is installed in PATH.')
                        console.log('You can enable it in VS Code via:')
                        console.log('Ctrl+Shift+P → "Shell Command: Install \'code\' command in PATH"\n')
                    } else {
                        console.log('VS Code opened successfully!')
                    }
                    rl.close()
                })
            } else {
                console.log('Skipped opening VS Code.')
                rl.close()
            }
        } catch (error) {
            console.error('Error creating project:', error)
        } finally {
            rl.close()
        }
    }
}

// Validation utilities
function validateManifest(manifestPath, packType) {
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        const issues = []

        // Check required fields
        if (!manifest.format_version) issues.push('Missing format_version')
        if (!manifest.header) issues.push('Missing header')
        if (!manifest.modules) issues.push('Missing modules')

        if (manifest.header) {
            if (!manifest.header.name) issues.push('Missing header.name')
            if (!manifest.header.description) issues.push('Missing header.description')
            if (!manifest.header.uuid) issues.push('Missing header.uuid')
            if (!manifest.header.version) issues.push('Missing header.version')
            if (!manifest.header.min_engine_version) issues.push('Missing header.min_engine_version')

            // Check UUID format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            if (manifest.header.uuid && !uuidRegex.test(manifest.header.uuid)) {
                issues.push('Invalid header.uuid format')
            }
        }

        if (manifest.modules && Array.isArray(manifest.modules)) {
            manifest.modules.forEach((module, index) => {
                if (!module.uuid) issues.push(`Missing modules[${index}].uuid`)
                if (!module.type) issues.push(`Missing modules[${index}].type`)
                if (!module.version) issues.push(`Missing modules[${index}].version`)

                // Validate module type
                const validTypes = ['script', 'resources', 'data', 'client_data', 'interface', 'world_template']
                if (module.type && !validTypes.includes(module.type)) {
                    issues.push(`Invalid modules[${index}].type: ${module.type}`)
                }

                // Check UUID format
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
                if (module.uuid && !uuidRegex.test(module.uuid)) {
                    issues.push(`Invalid modules[${index}].uuid format`)
                }
            })
        }

        return {valid: issues.length === 0, issues, manifest}
    } catch (error) {
        return {valid: false, issues: [`Failed to parse JSON: ${error.message}`], manifest: null}
    }
}

export function validateProjectTask(projectPath) {
    return () => {
        // Check if we're in a valid project directory
        if (!fs.existsSync(projectPath) || !projectPath.includes('projects')) {
            console.log('ERROR: This command must be run from within a project directory.')
            console.log('Navigate to a project folder first (e.g., cd projects/your-project)')
            process.exitCode = 1
            return
        }

        console.log('Validating project structure and manifests...\n')

        const behaviorManifestPath = path.join(projectPath, 'behavior_pack', 'manifest.json')
        const resourceManifestPath = path.join(projectPath, 'resource_pack', 'manifest.json')

        let hasErrors = false

        // Validate behavior pack
        if (fs.existsSync(behaviorManifestPath)) {
            console.log('Validating behavior pack manifest...')
            const result = validateManifest(behaviorManifestPath, 'behavior')
            if (result.valid) {
                console.log('[PASS] Behavior pack manifest is valid')
            } else {
                console.log('[FAIL] Behavior pack manifest has issues:')
                result.issues.forEach((issue) => console.log(`   - ${issue}`))
                hasErrors = true
            }
        } else {
            console.log('[WARN] Behavior pack manifest not found')
            hasErrors = true
        }

        console.log('')

        // Validate resource pack
        if (fs.existsSync(resourceManifestPath)) {
            console.log('Validating resource pack manifest...')
            const result = validateManifest(resourceManifestPath, 'resource')
            if (result.valid) {
                console.log('[PASS] Resource pack manifest is valid')
            } else {
                console.log('[FAIL] Resource pack manifest has issues:')
                result.issues.forEach((issue) => console.log(`   - ${issue}`))
                hasErrors = true
            }
        } else {
            console.log('[WARN] Resource pack manifest not found')
        }

        console.log('')

        // Check for common files
        const commonChecks = [
            {path: path.join(projectPath, 'tscripts'), name: 'TypeScript source directory', required: true},
            {path: path.join(projectPath, 'behavior_pack', 'scripts'), name: 'Compiled scripts directory', required: false},
            {path: path.join(projectPath, 'resource_pack', 'texts'), name: 'Language files directory', required: false},
            {path: path.join(projectPath, 'tsconfig.json'), name: 'TypeScript configuration', required: true},
        ]

        console.log('Checking project structure...')
        commonChecks.forEach((check) => {
            if (fs.existsSync(check.path)) {
                console.log(`[PASS] ${check.name} found`)
            } else if (check.required) {
                console.log(`[FAIL] ${check.name} missing (required)`)
                hasErrors = true
            } else {
                console.log(`[WARN] ${check.name} missing (optional)`)
            }
        })

        console.log('')

        if (hasErrors) {
            console.log('[RESULT] Project validation failed with errors')
            process.exitCode = 1
        } else {
            console.log('[RESULT] Project validation passed!')
            process.exitCode = 0
        }
    }
}

export function analyzeProjectTask(projectPath) {
    return () => {
        // Check if we're in a valid project directory
        if (!fs.existsSync(projectPath) || !projectPath.includes('projects')) {
            console.log('ERROR: This command must be run from within a project directory.')
            console.log('Navigate to a project folder first (e.g., cd projects/your-project)')
            process.exitCode = 1
            return
        }

        console.log('Analyzing project...\n')

        const stats = {
            totalFiles: 0,
            behaviorFiles: 0,
            resourceFiles: 0,
            typeScriptFiles: 0,
            jsonFiles: 0,
            langFiles: 0,
            imageFiles: 0,
            audioFiles: 0,
            totalSize: 0,
            behaviorSize: 0,
            resourceSize: 0,
        }

        function analyzeDirectory(dirPath, relativePath = '', packType = 'other') {
            if (!fs.existsSync(dirPath)) return

            const items = fs.readdirSync(dirPath)
            items.forEach((item) => {
                const fullPath = path.join(dirPath, item)
                const stat = fs.statSync(fullPath)

                if (stat.isDirectory()) {
                    let newPackType = packType
                    if (item === 'behavior_pack') newPackType = 'behavior'
                    else if (item === 'resource_pack') newPackType = 'resource'
                    
                    analyzeDirectory(fullPath, path.join(relativePath, item), newPackType)
                } else {
                    stats.totalFiles++
                    stats.totalSize += stat.size

                    if (packType === 'behavior') {
                        stats.behaviorFiles++
                        stats.behaviorSize += stat.size
                    } else if (packType === 'resource') {
                        stats.resourceFiles++
                        stats.resourceSize += stat.size
                    }

                    const ext = path.extname(item).toLowerCase()
                    switch (ext) {
                        case '.ts':
                            stats.typeScriptFiles++
                            break
                        case '.json':
                            stats.jsonFiles++
                            break
                        case '.lang':
                            stats.langFiles++
                            break
                        case '.png':
                        case '.jpg':
                        case '.jpeg':
                        case '.tga':
                            stats.imageFiles++
                            break
                        case '.ogg':
                        case '.wav':
                        case '.mp3':
                            stats.audioFiles++
                            break
                    }
                }
            })
        }

        analyzeDirectory(projectPath)

        // Format file size
        function formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes'
            const k = 1024
            const sizes = ['Bytes', 'KB', 'MB', 'GB']
            const i = Math.floor(Math.log(bytes) / Math.log(k))
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
        }

        console.log('=== PROJECT STATISTICS ===')
        console.log(`Total files: ${stats.totalFiles}`)
        console.log(`Total size: ${formatBytes(stats.totalSize)}`)
        console.log('')
        console.log('--- Pack Distribution ---')
        console.log(`Behavior pack files: ${stats.behaviorFiles} (${formatBytes(stats.behaviorSize)})`)
        console.log(`Resource pack files: ${stats.resourceFiles} (${formatBytes(stats.resourceSize)})`)
        console.log('')
        console.log('--- File Types ---')
        console.log(`TypeScript files: ${stats.typeScriptFiles}`)
        console.log(`JSON files: ${stats.jsonFiles}`)
        console.log(`Language files: ${stats.langFiles}`)
        console.log(`Image files: ${stats.imageFiles}`)
        console.log(`Audio files: ${stats.audioFiles}`)

        // Check manifests for additional info
        const behaviorManifestPath = path.join(projectPath, 'behavior_pack', 'manifest.json')
        const resourceManifestPath = path.join(projectPath, 'resource_pack', 'manifest.json')

        if (fs.existsSync(behaviorManifestPath)) {
            try {
                const manifest = JSON.parse(fs.readFileSync(behaviorManifestPath, 'utf8'))
                console.log('\n--- Behavior Pack Info ---')
                console.log(`Name: ${manifest.header?.name || 'Unknown'}`)
                console.log(`Version: ${manifest.header?.version?.join('.') || 'Unknown'}`)
                console.log(`Min Engine: ${manifest.header?.min_engine_version?.join('.') || 'Unknown'}`)
                console.log(`Modules: ${manifest.modules?.length || 0}`)
            } catch (error) {
                console.log('\n[ERROR] Failed to read behavior pack manifest')
            }
        }

        if (fs.existsSync(resourceManifestPath)) {
            try {
                const manifest = JSON.parse(fs.readFileSync(resourceManifestPath, 'utf8'))
                console.log('\n--- Resource Pack Info ---')
                console.log(`Name: ${manifest.header?.name || 'Unknown'}`)
                console.log(`Version: ${manifest.header?.version?.join('.') || 'Unknown'}`)
                console.log(`Min Engine: ${manifest.header?.min_engine_version?.join('.') || 'Unknown'}`)
                console.log(`Modules: ${manifest.modules?.length || 0}`)
            } catch (error) {
                console.log('\n[ERROR] Failed to read resource pack manifest')
            }
        }

        console.log('\n[COMPLETE] Analysis finished!')
    }
}

export function backupProjectTask(projectPath, rootPath) {
    return async () => {
        // Check if we're in a valid project directory
        if (!fs.existsSync(projectPath) || !projectPath.includes('projects')) {
            console.log('ERROR: This command must be run from within a project directory.')
            console.log('Navigate to a project folder first (e.g., cd projects/your-project)')
            process.exitCode = 1
            return
        }

        const projectName = path.basename(projectPath)
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]
        const backupName = `${projectName}_backup_${timestamp}`
        const backupPath = path.join(rootPath, 'backups', backupName)

        console.log(`Creating backup: ${backupName}`)

        try {
            // Create backups directory if it doesn't exist
            const backupsDir = path.join(rootPath, 'backups')
            if (!fs.existsSync(backupsDir)) {
                fs.mkdirSync(backupsDir, {recursive: true})
            }

            // Copy project to backup location
            rushstack.FileSystem.copyFiles({
                sourcePath: projectPath,
                destinationPath: backupPath,
                preserveTimestamps: true,
            })

            console.log(`[SUCCESS] Backup created successfully at: ${backupPath}`)

            // Create zip archive
            const zipPath = `${backupPath}.zip`
            const zip = new zip_lib.Zip()
            zip.addFolder(backupPath)

            await zip.archive(zipPath)
            console.log(`[SUCCESS] Backup archived as: ${zipPath}`)

            // Remove uncompressed backup folder
            rimraf.sync(backupPath)
            console.log('[INFO] Cleaned up temporary files')

            // List existing backups
            const backupFiles = fs.readdirSync(backupsDir).filter((file) => file.startsWith(projectName) && file.endsWith('.zip'))
            console.log(`\n[INFO] Total backups for ${projectName}: ${backupFiles.length}`)

            if (backupFiles.length > 5) {
                console.log('[WARN] You have more than 5 backups. Consider cleaning up old ones.')
            }
        } catch (error) {
            console.error('[ERROR] Backup failed:', error.message)
            process.exitCode = 1
        }
    }
}

export function updateVersionTask(projectPath) {
    return async () => {
        // Check if we're in a valid project directory
        if (!fs.existsSync(projectPath) || !projectPath.includes('projects')) {
            console.log('ERROR: This command must be run from within a project directory.')
            console.log('Navigate to a project folder first (e.g., cd projects/your-project)')
            process.exitCode = 1
            return
        }

        const rl = readline.createInterface({input: process.stdin, output: process.stdout})

        const askQuestion = (question) => {
            return new Promise((resolve) => {
                rl.question(question, (answer) => {
                    resolve(answer.trim())
                })
            })
        }

        try {
            const behaviorManifestPath = path.join(projectPath, 'behavior_pack', 'manifest.json')
            const resourceManifestPath = path.join(projectPath, 'resource_pack', 'manifest.json')

            if (!fs.existsSync(behaviorManifestPath)) {
                console.error('[ERROR] Behavior pack manifest not found')
                rl.close()
                return
            }

            const behaviorManifest = JSON.parse(fs.readFileSync(behaviorManifestPath, 'utf8'))
            const currentVersion = behaviorManifest.header?.version || [1, 0, 0]

            console.log(`Current version: ${currentVersion.join('.')}`)
            console.log('Version update options:')
            console.log('1. Patch (x.x.X) - Bug fixes')
            console.log('2. Minor (x.X.x) - New features')
            console.log('3. Major (X.x.x) - Breaking changes')
            console.log('4. Custom version')

            const choice = await askQuestion('Select update type (1-4): ')

            let newVersion = [...currentVersion]

            switch (choice) {
                case '1':
                    newVersion[2]++
                    break
                case '2':
                    newVersion[1]++
                    newVersion[2] = 0
                    break
                case '3':
                    newVersion[0]++
                    newVersion[1] = 0
                    newVersion[2] = 0
                    break
                case '4':
                    const customVersion = await askQuestion('Enter custom version (x.y.z): ')
                    const parts = customVersion.split('.').map(Number)
                    if (parts.length === 3 && parts.every((n) => !isNaN(n) && n >= 0)) {
                        newVersion = parts
                    } else {
                        console.error('[ERROR] Invalid version format')
                        rl.close()
                        return
                    }
                    break
                default:
                    console.error('[ERROR] Invalid choice')
                    rl.close()
                    return
            }

            console.log(`Updating version to: ${newVersion.join('.')}`)

            // Update behavior pack
            behaviorManifest.header.version = newVersion
            if (behaviorManifest.modules) {
                behaviorManifest.modules.forEach((module) => {
                    module.version = newVersion
                })
            }
            fs.writeFileSync(behaviorManifestPath, JSON.stringify(behaviorManifest, null, 4))

            // Update resource pack if it exists
            if (fs.existsSync(resourceManifestPath)) {
                const resourceManifest = JSON.parse(fs.readFileSync(resourceManifestPath, 'utf8'))
                resourceManifest.header.version = newVersion
                if (resourceManifest.modules) {
                    resourceManifest.modules.forEach((module) => {
                        module.version = newVersion
                    })
                }
                fs.writeFileSync(resourceManifestPath, JSON.stringify(resourceManifest, null, 4))
            }

            console.log('[SUCCESS] Version updated successfully!')
        } catch (error) {
            console.error('[ERROR] Failed to update version:', error.message)
        } finally {
            rl.close()
        }
    }
}

export function generateUuidsTask(projectPath) {
    return () => {
        // Check if we're in a valid project directory
        if (!fs.existsSync(projectPath) || !projectPath.includes('projects')) {
            console.log('ERROR: This command must be run from within a project directory.')
            console.log('Navigate to a project folder first (e.g., cd projects/your-project)')
            process.exitCode = 1
            return
        }

        console.log('Generating new UUIDs for project...')

        const behaviorManifestPath = path.join(projectPath, 'behavior_pack', 'manifest.json')
        const resourceManifestPath = path.join(projectPath, 'resource_pack', 'manifest.json')

        try {
            const behaviorHeaderUuid = crypto.randomUUID()
            const behaviorModuleUuid = crypto.randomUUID()
            const resourceHeaderUuid = crypto.randomUUID()
            const resourceModuleUuid = crypto.randomUUID()

            // Update behavior pack
            if (fs.existsSync(behaviorManifestPath)) {
                const behaviorManifest = JSON.parse(fs.readFileSync(behaviorManifestPath, 'utf8'))
                behaviorManifest.header.uuid = behaviorHeaderUuid
                if (behaviorManifest.modules && behaviorManifest.modules[0]) {
                    behaviorManifest.modules[0].uuid = behaviorModuleUuid
                }
                if (behaviorManifest.dependencies && behaviorManifest.dependencies[0]) {
                    behaviorManifest.dependencies[0].uuid = resourceHeaderUuid
                }
                fs.writeFileSync(behaviorManifestPath, JSON.stringify(behaviorManifest, null, 4))
                console.log('[SUCCESS] Behavior pack UUIDs updated')
            }

            // Update resource pack
            if (fs.existsSync(resourceManifestPath)) {
                const resourceManifest = JSON.parse(fs.readFileSync(resourceManifestPath, 'utf8'))
                resourceManifest.header.uuid = resourceHeaderUuid
                if (resourceManifest.modules && resourceManifest.modules[0]) {
                    resourceManifest.modules[0].uuid = resourceModuleUuid
                }
                if (resourceManifest.dependencies && resourceManifest.dependencies[0]) {
                    resourceManifest.dependencies[0].uuid = behaviorHeaderUuid
                }
                fs.writeFileSync(resourceManifestPath, JSON.stringify(resourceManifest, null, 4))
                console.log('[SUCCESS] Resource pack UUIDs updated')
            }

            console.log('\n=== NEW UUIDS GENERATED ===')
            console.log(`Behavior Header: ${behaviorHeaderUuid}`)
            console.log(`Behavior Module: ${behaviorModuleUuid}`)
            console.log(`Resource Header: ${resourceHeaderUuid}`)
            console.log(`Resource Module: ${resourceModuleUuid}`)
        } catch (error) {
            console.error('[ERROR] Failed to generate UUIDs:', error.message)
            process.exitCode = 1
        }
    }
}

export function listProjectsTask(rootPath) {
    return () => {
        console.log('Available projects:\n')

        const projectsDir = path.join(rootPath, 'projects')
        if (!fs.existsSync(projectsDir)) {
            console.log('[ERROR] Projects directory not found')
            return
        }

        const projects = fs.readdirSync(projectsDir).filter((item) => {
            const itemPath = path.join(projectsDir, item)
            return fs.statSync(itemPath).isDirectory() && item !== 'template'
        })

        if (projects.length === 0) {
            console.log('[INFO] No projects found. Create one with: npm run new-project')
            return
        }

        projects.forEach((project, index) => {
            const projectPath = path.join(projectsDir, project)
            const behaviorManifestPath = path.join(projectPath, 'behavior_pack', 'manifest.json')

            let projectInfo = `${index + 1}. ${project}`

            if (fs.existsSync(behaviorManifestPath)) {
                try {
                    const manifest = JSON.parse(fs.readFileSync(behaviorManifestPath, 'utf8'))
                    const name = manifest.header?.name || 'Unknown'
                    const version = manifest.header?.version?.join('.') || 'Unknown'
                    projectInfo += ` (${name} v${version})`
                } catch (error) {
                    projectInfo += ' (Invalid manifest)'
                }
            } else {
                projectInfo += ' (No manifest)'
            }

            console.log(projectInfo)
        })

        console.log(`\n[INFO] Total projects: ${projects.length}`)
    }
}

export function openMinecraftFolderTask() {
    return async () => {
        const paths = getGameDeploymentRootPaths()
        const availablePaths = Object.entries(paths).filter(([, path]) => path && fs.existsSync(path))

        if (availablePaths.length === 0) {
            console.log('[ERROR] No Minecraft installation found')
            return
        }

        if (availablePaths.length === 1) {
            // Only one option available, open it directly
            const [product, folderPath] = availablePaths[0]
            console.log(`Opening ${product} folder: ${folderPath}`)
            try {
                child_process.exec(`explorer "${folderPath}"`)
                console.log('[SUCCESS] Folder opened successfully')
            } catch (error) {
                console.log('[ERROR] Failed to open folder')
            }
            return
        }

        // Multiple options available, let user choose
        const rl = readline.createInterface({input: process.stdin, output: process.stdout})

        const askQuestion = (question) => {
            return new Promise((resolve) => {
                rl.question(question, (answer) => {
                    resolve(answer.trim())
                })
            })
        }

        try {
            console.log('Available Minecraft installations:')
            availablePaths.forEach(([product, folderPath], index) => {
                const isDefault = product === 'BedrockUWP'
                console.log(`${index + 1}. ${product}${isDefault ? ' (default)' : ''}: ${folderPath}`)
            })

            const choice = await askQuestion('\nSelect installation to open (1-' + availablePaths.length + ', or press Enter for default): ')

            let selectedIndex = 0 // Default to BedrockUWP
            if (choice) {
                const choiceNum = parseInt(choice)
                if (choiceNum >= 1 && choiceNum <= availablePaths.length) {
                    selectedIndex = choiceNum - 1
                } else {
                    console.log('[ERROR] Invalid choice, using default')
                }
            } else {
                // Find BedrockUWP index or use first available
                const bedrockIndex = availablePaths.findIndex(([product]) => product === 'BedrockUWP')
                selectedIndex = bedrockIndex !== -1 ? bedrockIndex : 0
            }

            const [selectedProduct, selectedPath] = availablePaths[selectedIndex]
            console.log(`\nOpening ${selectedProduct} folder: ${selectedPath}`)

            try {
                child_process.exec(`explorer "${selectedPath}"`)
                console.log('[SUCCESS] Folder opened successfully')
            } catch (error) {
                console.log('[ERROR] Failed to open folder')
            }
        } catch (error) {
            console.error('[ERROR] Failed to process selection:', error.message)
        } finally {
            rl.close()
        }
    }
}
