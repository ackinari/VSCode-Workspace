import * as rushstack from '@rushstack/node-core-library'
import * as child_process from 'child_process'
import * as crypto from 'crypto'
import * as dotenv from 'dotenv'
import * as esbuild from 'esbuild'
import * as fs from 'fs'
import * as just_scripts from 'just-scripts'
import * as path from 'path'
import * as rimraf from 'rimraf'
import * as zip_lib from 'zip-lib'

const chalk = require('chalk')
const inquirer = require('inquirer')

// ===== TYPES AND INTERFACES =====

interface ProjectManifest {
    format_version: number
    header: {
        name: string
        description: string
        uuid: string
        version: number[]
        min_engine_version: number[]
    }
    modules: Array<{
        uuid: string
        type: string
        version: number[]
    }>
    dependencies?: Array<{
        uuid: string
        version: number[]
    }>
}

interface ProjectStats {
    totalFiles: number
    behaviorFiles: number
    resourceFiles: number
    typeScriptFiles: number
    jsonFiles: number
    langFiles: number
    imageFiles: number
    audioFiles: number
    totalSize: number
    behaviorSize: number
    resourceSize: number
}

interface ValidationResult {
    valid: boolean
    issues: string[]
    manifest: ProjectManifest | null
}

interface InquirerChoice {
    name: string
    value: string
}

interface BundleOptions {
    entryPoint: string
    outfile: string
    sourcemap?: boolean | string
    minifyWhitespace?: boolean
    external?: string[]
    dropLabels?: string[]
    alias?: Record<string, string>
    outputSourcemapPath?: string
}

interface CopyTaskParams {
    copyToBehaviorPacks?: string[]
    copyToScripts?: string[]
    copyToResourcePacks?: string[]
}

interface McAddonTaskParams extends CopyTaskParams {
    outputFile?: string
}

enum MinecraftProduct {
    BedrockGDK = 'BedrockGDK',
    PreviewGDK = 'PreviewGDK',
    Bedrock = 'BedrockUWP',
    Preview = 'PreviewUWP',
    Custom = 'Custom'
}

type TaskFunction = () => void | Promise<void>

// ===== UTILITY FUNCTIONS =====

/**
 * Validates if a directory exists and contains projects
 */
function validateProjectsDirectory(projectsDir: string): boolean {
    if (!fs.existsSync(projectsDir)) {
        console.log(chalk.red('✗ Projects directory not found'))
        return false
    }
    return true
}

/**
 * Gets list of available projects (excluding template)
 */
function getAvailableProjects(projectsDir: string): string[] {
    return fs.readdirSync(projectsDir).filter((item: string) => {
        const itemPath = path.join(projectsDir, item)
        return fs.statSync(itemPath).isDirectory() && item !== 'template'
    })
}

/**
 * Checks if there are any projects available
 */
function checkProjectsExist(projects: string[]): boolean {
    if (projects.length === 0) {
        console.log(chalk.yellow('No projects found.'))
        console.log(chalk.gray('Create one with: npm run new-project'))
        return false
    }
    return true
}

/**
 * Converts project list to inquirer choices
 */
function createProjectChoices(projects: string[]): InquirerChoice[] {
    return projects.map((project: string) => ({
        name: project,
        value: project
    }))
}

/**
 * Validates if we're in a valid project directory
 */
function validateProjectContext(projectPath: string): boolean {
    if (!fs.existsSync(projectPath) || !projectPath.includes('projects')) {
        console.log(chalk.red('ERROR: This command must be run from within a project directory.'))
        console.log(chalk.gray('Navigate to a project folder first (e.g., cd projects/your-project)'))
        process.exitCode = 1
        return false
    }
    return true
}

/**
 * Gets project name from language file or manifest
 */
function getProjectDisplayName(projectPath: string, manifest: ProjectManifest): string {
    const langFilePath = path.join(projectPath, 'resource_pack', 'texts', 'en_US.lang')
    if (fs.existsSync(langFilePath)) {
        try {
            const langContent = fs.readFileSync(langFilePath, 'utf8')
            const nameMatch = langContent.match(/pack\.name=(.+)/)
            if (nameMatch && nameMatch[1]) {
                return nameMatch[1].trim()
            }
        } catch (error) {
            // Fall back to manifest name
        }
    }
    return manifest.header?.name || 'Unknown'
}

/**
 * Formats bytes to human readable format
 */
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Generates new UUIDs for project manifests
 */
function generateProjectUUIDs(): {
    behaviorHeaderUuid: string
    behaviorModuleUuid: string
    resourceHeaderUuid: string
    resourceModuleUuid: string
} {
    return {
        behaviorHeaderUuid: crypto.randomUUID(),
        behaviorModuleUuid: crypto.randomUUID(),
        resourceHeaderUuid: crypto.randomUUID(),
        resourceModuleUuid: crypto.randomUUID()
    }
}

/**
 * Updates manifest with new UUIDs and dependencies
 */
function updateManifestUUIDs(
    manifestPath: string,
    headerUuid: string,
    moduleUuid: string,
    dependencyUuid?: string
): void {
    if (fs.existsSync(manifestPath)) {
        const manifest: ProjectManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        manifest.header.uuid = headerUuid
        if (manifest.modules && manifest.modules[0]) {
            manifest.modules[0].uuid = moduleUuid
        }
        if (dependencyUuid && manifest.dependencies && manifest.dependencies[0]) {
            manifest.dependencies[0].uuid = dependencyUuid
        }
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4))
    }
}

/**
 * Updates project name in language files (both resource and behavior packs)
 */
function updateProjectName(projectPath: string, newName: string): void {
    // Update resource pack language file
    const resourceLangFilePath = path.join(projectPath, 'resource_pack', 'texts', 'en_US.lang')
    if (fs.existsSync(resourceLangFilePath)) {
        const langContent = fs.readFileSync(resourceLangFilePath, 'utf8')
        const updatedLangContent = langContent.replace(/pack\.name=.*/g, `pack.name=${newName}`)
        fs.writeFileSync(resourceLangFilePath, updatedLangContent)
    }

    // Update behavior pack language file
    const behaviorLangFilePath = path.join(projectPath, 'behavior_pack', 'texts', 'en_US.lang')
    if (fs.existsSync(behaviorLangFilePath)) {
        const langContent = fs.readFileSync(behaviorLangFilePath, 'utf8')
        const updatedLangContent = langContent.replace(/pack\.name=.*/g, `pack.name=${newName}`)
        fs.writeFileSync(behaviorLangFilePath, updatedLangContent)
    }
}

/**
 * Updates project description in language files (both resource and behavior packs)
 */
function updateProjectDescription(projectPath: string, newDescription: string): void {
    // Update resource pack language file
    const resourceLangFilePath = path.join(projectPath, 'resource_pack', 'texts', 'en_US.lang')
    if (fs.existsSync(resourceLangFilePath)) {
        const langContent = fs.readFileSync(resourceLangFilePath, 'utf8')
        const updatedLangContent = langContent.replace(/pack\.description=.*/g, `pack.description=${newDescription}`)
        fs.writeFileSync(resourceLangFilePath, updatedLangContent)
    }

    // Update behavior pack language file
    const behaviorLangFilePath = path.join(projectPath, 'behavior_pack', 'texts', 'en_US.lang')
    if (fs.existsSync(behaviorLangFilePath)) {
        const langContent = fs.readFileSync(behaviorLangFilePath, 'utf8')
        const updatedLangContent = langContent.replace(/pack\.description=.*/g, `pack.description=${newDescription}`)
        fs.writeFileSync(behaviorLangFilePath, updatedLangContent)
    }
}

/**
 * Deletes deployed project files from Minecraft development folders
 */
function deleteDeployedProject(projectName: string): void {
    const paths = getGameDeploymentRootPaths()
    let deletedCount = 0
    
    Object.entries(paths).forEach(([product, deployPath]) => {
        if (!deployPath || !fs.existsSync(deployPath)) return
        
        const behaviorDeployPath = path.join(deployPath, BehaviorPacksPath, `${projectName}_BP`)
        const resourceDeployPath = path.join(deployPath, ResourcePacksPath, `${projectName}_RP`)
        
        if (fs.existsSync(behaviorDeployPath)) {
            try {
                rimraf.sync(behaviorDeployPath)
                console.log(chalk.green(`✓ Deleted behavior pack from ${product}`))
                deletedCount++
            } catch (error) {
                console.log(chalk.red(`✗ Failed to delete behavior pack from ${product}`))
            }
        }
        
        if (fs.existsSync(resourceDeployPath)) {
            try {
                rimraf.sync(resourceDeployPath)
                console.log(chalk.green(`✓ Deleted resource pack from ${product}`))
                deletedCount++
            } catch (error) {
                console.log(chalk.red(`✗ Failed to delete resource pack from ${product}`))
            }
        }
    })
    
    if (deletedCount === 0) {
        console.log(chalk.gray('No deployed files found to delete'))
    } else {
        console.log(chalk.blue(`Deleted ${deletedCount} deployed pack(s)`))
    }
}
/**
 * Gets list of development projects from Minecraft folders
 */
function getDevelopmentProjects(): Array<{name: string, path: string, type: 'behavior' | 'resource'}> {
    const projects: Array<{name: string, path: string, type: 'behavior' | 'resource'}> = []
    const paths = getGameDeploymentRootPaths()
    
    Object.entries(paths).forEach(([product, rootPath]) => {
        if (!rootPath || !fs.existsSync(rootPath)) return
        
        // Check behavior packs
        const behaviorPath = path.join(rootPath, BehaviorPacksPath)
        if (fs.existsSync(behaviorPath)) {
            const behaviorProjects = fs.readdirSync(behaviorPath).filter(item => {
                const itemPath = path.join(behaviorPath, item)
                return fs.statSync(itemPath).isDirectory()
            })
            behaviorProjects.forEach(project => {
                projects.push({
                    name: `${project} (${product})`,
                    path: path.join(behaviorPath, project),
                    type: 'behavior'
                })
            })
        }
        
        // Check resource packs
        const resourcePath = path.join(rootPath, ResourcePacksPath)
        if (fs.existsSync(resourcePath)) {
            const resourceProjects = fs.readdirSync(resourcePath).filter(item => {
                const itemPath = path.join(resourcePath, item)
                return fs.statSync(itemPath).isDirectory()
            })
            resourceProjects.forEach(project => {
                projects.push({
                    name: `${project} (${product})`,
                    path: path.join(resourcePath, project),
                    type: 'resource'
                })
            })
        }
    })
    
    return projects
}

/**
 * Safely quotes paths with spaces for command line usage
 */
function quotePath(filePath: string): string {
    return filePath.includes(' ') ? `"${filePath}"` : filePath
}

/**
 * Runs prettier on specified files
 */
function runPrettier(filePaths: string[], workspaceRoot?: string): boolean {
    if (!filePaths || filePaths.length === 0) {
        return true
    }

    try {
        // Determine workspace root
        let cwd = workspaceRoot
        if (!cwd) {
            // Try to find workspace root by looking for .prettierrc.json
            let currentDir = process.cwd()
            while (currentDir !== path.dirname(currentDir)) {
                const prettierConfigPath = path.join(currentDir, '.prettierrc.json')
                const packageJsonPath = path.join(currentDir, 'package.json')
                if (fs.existsSync(prettierConfigPath) || fs.existsSync(packageJsonPath)) {
                    cwd = currentDir
                    break
                }
                currentDir = path.dirname(currentDir)
            }
            if (!cwd) {
                cwd = process.cwd()
            }
        }

        // Verify prettier config exists
        const prettierConfigPath = path.join(cwd, '.prettierrc.json')
        if (!fs.existsSync(prettierConfigPath)) {
            console.log(chalk.yellow('⚠ .prettierrc.json not found, skipping formatting'))
            return false
        }

        // Run prettier on all files at once for better performance
        const quotedPaths = filePaths.map(filePath => quotePath(filePath))
        const cmd = `npx prettier --write --config "${prettierConfigPath}" ${quotedPaths.join(' ')}`
        
        child_process.execSync(cmd, {
            stdio: 'ignore', // Suppress prettier output
            cwd: cwd
        })
        
        console.log(chalk.gray('✓ Prettier formatting completed'))
        return true
    } catch (error: any) {
        console.log(chalk.yellow('⚠ Prettier formatting failed, but files were updated'))
        return false
    }
}

/**
 * Opens a project in VS Code
 */
function openInVSCode(projectPath: string): void {
    console.log(chalk.yellow('Opening VS Code...'))
    child_process.exec(`code -r "${projectPath}"`, (err) => {
        if (err) {
            console.log(chalk.red('Failed to open VS Code automatically.'))
            console.log(chalk.gray('Make sure the "code" command is installed in PATH.'))
            console.log(chalk.gray('You can enable it in VS Code via:'))
            console.log(chalk.gray('Ctrl+Shift+P → "Shell Command: Install \'code\' command in PATH"'))
        } else {
            console.log(chalk.green('✓ VS Code opened successfully!'))
        }
    })
}

// ===== EXISTING FUNCTIONS (keeping original functionality) =====

export function setupEnvironment(envPath: string): void {
    dotenv.config({path: envPath})
}

const MAP_EXTENSION = '.map'

function isRequiredToMakeAnyFileChange(sourcemap: boolean | string | undefined): boolean {
    return sourcemap !== false && sourcemap !== 'inline'
}

function isRequiredToLinkJsFile(sourcemap: boolean | string | undefined): boolean {
    return sourcemap === true || sourcemap === 'linked'
}

function linkSourceMaps(
    sourceMapDirectory: string,
    outputDirectory: string,
    options: BundleOptions,
    outputFiles: esbuild.OutputFile[]
): Record<string, string> {
    const generatedFiles: Record<string, string> = {}
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

function writeFiles(postProcessOutputFilesResult: {
    outputDirectory: string
    sourceMapDirectory: string
    generatedFiles: Record<string, string>
}): void {
    fs.mkdirSync(postProcessOutputFilesResult.outputDirectory, {
        recursive: true,
    })
    if (postProcessOutputFilesResult.sourceMapDirectory !== postProcessOutputFilesResult.outputDirectory) {
        fs.mkdirSync(postProcessOutputFilesResult.sourceMapDirectory, {
            recursive: true,
        })
    }
    for (const filePath of Object.keys(postProcessOutputFilesResult.generatedFiles)) {
        fs.writeFileSync(filePath, postProcessOutputFilesResult.generatedFiles[filePath])
    }
}

function postProcessOutputFiles(options: BundleOptions, buildResult: esbuild.BuildResult): {
    sourceMapDirectory: string
    outputDirectory: string
    generatedFiles: Record<string, string>
} | undefined {
    if (!buildResult.outputFiles) {
        return undefined
    }
    const outputDirectory = path.parse(options.outfile).dir
    const sourceMapDirectory = path.resolve(options.outputSourcemapPath ?? outputDirectory)
    const generatedFiles = linkSourceMaps(sourceMapDirectory, outputDirectory, options, buildResult.outputFiles)
    return {sourceMapDirectory, outputDirectory, generatedFiles}
}

//! broken since there is no sourceMap system anymore
export function bundleTask(options: BundleOptions): TaskFunction {
    return () => {
        const isRequiredToMakeChanges = isRequiredToMakeAnyFileChange(options.sourcemap)
        const isRequiredToLinkJs = isRequiredToLinkJsFile(options.sourcemap)
        const buildResult = esbuild.buildSync({
            entryPoints: [options.entryPoint],
            bundle: true,
            format: 'esm',
            minifyWhitespace: options.minifyWhitespace,
            outfile: options.outfile,
            sourcemap: isRequiredToLinkJs ? 'external' : options.sourcemap as boolean | 'external' | 'linked' | 'inline' | 'both' | undefined,
            external: options.external,
            write: !isRequiredToMakeChanges,
            dropLabels: options.dropLabels,
            alias: options.alias,
        })
        if (buildResult.errors.length === 0) {
            if (isRequiredToMakeChanges) {
                if (!buildResult.outputFiles) {
                    return Promise.reject(new Error('No output files were generated, check that your entrypoint file is configured correctly.'))
                }
                const result = postProcessOutputFiles(options, buildResult)
                if (result) {
                    writeFiles(result)
                }
            }
            return Promise.resolve()
        }
        return Promise.reject(new Error(buildResult.errors.join('\n')))
    }
}

export function cleanTask(dirs: string[]): TaskFunction {
    return () => {
        for (const dir of dirs) {
            try {
                console.log(`Cleaning ${path.resolve(process.cwd(), dir)}`)
                rimraf.sync(path.resolve(process.cwd(), dir))
            } catch (_) {}
        }
    }
}

export function getOrThrowFromProcess(key: string, messageOverride?: string): string {
    const value = process.env[key]
    if (!value) {
        throw new Error(messageOverride ?? `Missing environment variable ${key}. Make sure to configure project.`)
    }
    return value
}

export const STANDARD_CLEAN_PATHS: string[] = [
    'APPDATA/Minecraft Bedrock/Users/Shared/games/com.mojang/development_behavior_packs/PROJECT_NAME_BP',
    'APPDATA/Minecraft Bedrock/Users/Shared/games/com.mojang/development_resource_packs/PROJECT_NAME_RP',
    'APPDATA/Minecraft Bedrock Preview/Users/Shared/games/com.mojang/development_behavior_packs/PROJECT_NAME_BP',
    'APPDATA/Minecraft Bedrock Preview/Users/Shared/games/com.mojang/development_resource_packs/PROJECT_NAME_RP',
    'LOCALAPPDATA/Packages/Microsoft.MinecraftUWP_8wekyb3d8bbwe/LocalState/games/com.mojang/development_behavior_packs/PROJECT_NAME_BP',
    'LOCALAPPDATA/Packages/Microsoft.MinecraftUWP_8wekyb3d8bbwe/LocalState/games/com.mojang/development_resource_packs/PROJECT_NAME_RP',
    'LOCALAPPDATA/Packages/Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe/LocalState/games/com.mojang/development_behavior_packs/PROJECT_NAME_BP',
    'LOCALAPPDATA/Packages/Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe/LocalState/games/com.mojang/development_resource_packs/PROJECT_NAME_RP',
]

export function cleanCollateralTask(pathsToClean: string[], projectName: string): TaskFunction {
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
            } catch (_) {}
        }
    }
}

function copyFiles(originPaths: string[], outputPath: string, skipIfPossible: boolean = true): void {
    const destinationPath = path.resolve(outputPath)
    const MTIME_TOLERANCE_MS = 1000
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

type GameDeploymentRootPaths = {BedrockGDK?: string, PreviewGDK?: string, BedrockUWP?: string, PreviewUWP?: string, Custom?: string}
function getGameDeploymentRootPaths(): GameDeploymentRootPaths {
    const localAppDataPath = process.env['LOCALAPPDATA']
    const appDataPath = process.env['APPDATA']
    const customDeploymentPath = process.env['CUSTOM_DEPLOYMENT_PATH']
    return {
        BedrockGDK: appDataPath ? path.resolve(appDataPath, 'Minecraft Bedrock/Users/Shared/games/com.mojang/') : undefined,
        PreviewGDK: appDataPath ? path.resolve(appDataPath, 'Minecraft Bedrock Preview/Users/Shared/games/com.mojang/') : undefined,
        BedrockUWP: localAppDataPath ? path.resolve(localAppDataPath, 'Packages/Microsoft.MinecraftUWP_8wekyb3d8bbwe/LocalState/games/com.mojang/') : undefined,
        PreviewUWP: localAppDataPath ? path.resolve(localAppDataPath, 'Packages/Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe/LocalState/games/com.mojang/') : undefined,
        Custom: customDeploymentPath || undefined,
    }
}

const BehaviorPacksPath = 'development_behavior_packs'
const ResourcePacksPath = 'development_resource_packs'

export function copyTask(params: CopyTaskParams, projectName: string): TaskFunction {
    return () => {
        let deploymentPath: string | undefined
        try {
            const product = 'BedrockUWP'
            deploymentPath = getGameDeploymentRootPaths()[product]
        } catch (_) {
            throw new Error('Unable to get deployment path. Make sure to configure package root correctly.')
        }
        if (deploymentPath === undefined) {
            throw new Error('Deployment path is undefined. Make sure to configure package root correctly.')
        }
        params.copyToBehaviorPacks && copyFiles(params.copyToBehaviorPacks, path.join(deploymentPath, BehaviorPacksPath, projectName + '_BP'))
        params.copyToScripts && copyFiles(params.copyToScripts, path.join(deploymentPath, BehaviorPacksPath, projectName + '_BP', 'scripts'))
        params.copyToResourcePacks && copyFiles(params.copyToResourcePacks, path.join(deploymentPath, ResourcePacksPath, projectName + '_RP'))
    }
}

const WATCH_TASK_NAME = 'watch-task'
just_scripts.option('watch')

function executeTask(taskFunction: TaskFunction): void {
    void (taskFunction as any).call(undefined, () => {})
}

export function watchTask(globs: string[], taskFunction: TaskFunction): TaskFunction {
    return () => {
        const watchArgs = just_scripts.argv()
        if (!watchArgs.watch) {
            return taskFunction() //! calling instead of returning it
        }
        let taskInProgress = true
        let pendingWork = false
        const onFinished = (args: any) => {
            if (args.name === WATCH_TASK_NAME) {
                if (pendingWork) {
                    just_scripts.logger.info('Processing pending changes...')
                    pendingWork = false
                    executeTask(origTask as TaskFunction)
                } else {
                    just_scripts.logger.info('Waiting for new changes...')
                    taskInProgress = false
                }
            }
        }
        just_scripts.undertaker.on('start', function (args: any) {
            if (args.name === WATCH_TASK_NAME) {
                taskInProgress = true
            }
        })
        just_scripts.undertaker.on('stop', function (args: any) {
            onFinished(args)
        })
        just_scripts.undertaker.on('error', function (args: any) {
            onFinished(args)
        })
        just_scripts.task(WATCH_TASK_NAME, just_scripts.series(taskFunction))
        const origTask = just_scripts.series(WATCH_TASK_NAME)
        executeTask(origTask as TaskFunction)
        just_scripts.watch(globs, () => {
            if (!taskInProgress) {
                executeTask(origTask as TaskFunction)
            } else {
                pendingWork = true
            }
        })
        return Promise.resolve()
    }
}

export function mcaddonTask(params: McAddonTaskParams): TaskFunction {
    return () => {
        const behaviorPackPath = params.copyToBehaviorPacks![0]
        const projectDir = path.dirname(behaviorPackPath)
        const projectName = path.basename(projectDir)
        
        // Use outputFile parameter if provided, otherwise create in project's dist folder
        let mcaddonFile: string
        if (params.outputFile) {
            mcaddonFile = params.outputFile
            // Ensure the directory exists
            const mcaddonDir = path.dirname(mcaddonFile)
            if (!fs.existsSync(mcaddonDir)) {
                fs.mkdirSync(mcaddonDir, { recursive: true })
            }
        } else {
            // Fallback: create in project's dist folder
            const distDir = path.join(projectDir, 'dist')
            if (!fs.existsSync(distDir)) {
                fs.mkdirSync(distDir, { recursive: true })
            }
            mcaddonFile = path.join(distDir, `${projectName}.mcaddon`)
        }
        
        console.log(`Creating .mcaddon package: ${mcaddonFile}`)
        
        try {
            const zip = new zip_lib.Zip()
            
            // Add behavior pack
            if (params.copyToBehaviorPacks && params.copyToBehaviorPacks.length > 0) {
                const behaviorPackPath = params.copyToBehaviorPacks[0]
                if (fs.existsSync(behaviorPackPath)) {
                    console.log(`Adding behavior pack: ${behaviorPackPath}`)
                    zip.addFolder(behaviorPackPath, `${projectName}_BP`)
                }
            }
            
            // Add resource pack
            if (params.copyToResourcePacks && params.copyToResourcePacks.length > 0) {
                const resourcePackPath = params.copyToResourcePacks[0]
                if (fs.existsSync(resourcePackPath)) {
                    console.log(`Adding resource pack: ${resourcePackPath}`)
                    zip.addFolder(resourcePackPath, `${projectName}_RP`)
                }
            }
            
            // Create the archive
            return zip.archive(mcaddonFile).then(
                () => {
                    console.log(`[SUCCESS] McAddon package created: ${mcaddonFile}`)
                    return Promise.resolve()
                },
                (error: any) => {
                    console.error(`[ERROR] Failed to create McAddon package: ${error}`)
                    return Promise.reject(new Error(`Failed to create McAddon package: ${error}`))
                }
            )
            
        } catch (error: any) {
            console.error(`[ERROR] McAddon task failed: ${error.message}`)
            return Promise.reject(error)
        }
    }
}

//! outdated
function prettierTask(files: string[], fix: boolean): TaskFunction {
    return () => {
        if (!files || files.length === 0) {
            return Promise.resolve()
        }
        const cmd = ['npx', 'prettier', fix ? '--write' : '--check', ...files].join(' ')
        try {
            child_process.execSync(cmd, {stdio: 'inherit'})
            return Promise.resolve()
        } catch (error) {
            return Promise.reject(error)
        }
    }
}

//! broken
function validateManifest(manifestPath: string, packType: string): ValidationResult {
    try {
        const manifest: ProjectManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        const issues: string[] = []

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
    } catch (error: any) {
        return {valid: false, issues: [`Failed to parse JSON: ${error.message}`], manifest: null}
    }
}

// ===== PROJECT MANAGEMENT TASKS =====

export function newProjectTask(rootPath: string): TaskFunction {
    return async () => {
        console.clear()
        console.log(chalk.cyan.bold('Create New Project'))
        console.log(chalk.gray('─'.repeat(50)))

        try {
            const answers = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'projectName',
                    message: 'Enter project name:',
                    validate: (input: string) => {
                        if (!input.trim()) {
                            return 'Project name cannot be empty'
                        }
                        return true
                    },
                    filter: (input: string) => input.replace(/['"]/g, '').trim()
                },
                {
                    type: 'input',
                    name: 'projectDescription',
                    message: 'Enter project description (optional):',
                    default: 'A Minecraft Bedrock add-on',
                    filter: (input: string) => input.replace(/['"]/g, '').trim()
                }
            ])

            const projectName: string = answers.projectName
            const folderName = projectName.replace(/\s+/g, '_')
            const projectPath = path.join(rootPath, 'projects', folderName)
            const templatePath = path.join(rootPath, 'projects', 'template')

            if (fs.existsSync(projectPath)) {
                console.log(chalk.red(`✗ Project "${projectName}" already exists`))
                return
            }

            console.log(chalk.yellow(`Creating project "${projectName}"...`))

            rushstack.FileSystem.copyFiles({
                sourcePath: templatePath,
                destinationPath: projectPath,
                preserveTimestamps: true,
            })

            const uuids = generateProjectUUIDs()

            // Update manifests with new UUIDs
            const behaviorManifestPath = path.join(projectPath, 'behavior_pack', 'manifest.json')
            const resourceManifestPath = path.join(projectPath, 'resource_pack', 'manifest.json')

            updateManifestUUIDs(behaviorManifestPath, uuids.behaviorHeaderUuid, uuids.behaviorModuleUuid, uuids.resourceHeaderUuid)
            updateManifestUUIDs(resourceManifestPath, uuids.resourceHeaderUuid, uuids.resourceModuleUuid, uuids.behaviorHeaderUuid)

            updateProjectName(projectPath, projectName)
            updateProjectDescription(projectPath, answers.projectDescription)

            console.log(chalk.green(`✓ Project "${projectName}" created successfully!`))
            console.log(chalk.gray(`Location: ${projectPath}`))

            const { openVSCode } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'openVSCode',
                    message: 'Open this project in VS Code?',
                    default: true
                }
            ])

            if (openVSCode) {
                openInVSCode(projectPath)
            } else {
                console.log(chalk.gray('Skipped opening in VS Code.'))
            }
        } catch (error: any) {
            console.log(chalk.red('✗ Error creating project:'), error.message)
        }
    }
}

export function cloneProjectTask(rootPath: string): TaskFunction {
    return async () => {
        console.clear()
        console.log(chalk.cyan.bold('Clone Existing Project'))
        console.log(chalk.gray('─'.repeat(50)))

        try {
            const projectsDir = path.join(rootPath, 'projects')
            if (!validateProjectsDirectory(projectsDir)) return

            const projects = getAvailableProjects(projectsDir)
            if (!checkProjectsExist(projects)) return

            const projectChoices = createProjectChoices(projects)

            const answers = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'sourceProject',
                    message: 'Select project to clone:',
                    choices: projectChoices
                },
                {
                    type: 'input',
                    name: 'newProjectName',
                    message: 'Enter new project name:',
                    validate: (input: string) => {
                        if (!input.trim()) {
                            return 'Project name cannot be empty'
                        }
                        const cleanName = input.replace(/['"]/g, '').trim()
                        const folderName = cleanName.replace(/\s+/g, '_')
                        const newProjectPath = path.join(projectsDir, folderName)
                        if (fs.existsSync(newProjectPath)) {
                            return `Project "${cleanName}" already exists`
                        }
                        return true
                    },
                    filter: (input: string) => input.replace(/['"]/g, '').trim()
                }
            ])

            const sourceProject: string = answers.sourceProject
            const cleanProjectName: string = answers.newProjectName
            const folderName = cleanProjectName.replace(/\s+/g, '_')
            const sourcePath = path.join(projectsDir, sourceProject)
            const newProjectPath = path.join(projectsDir, folderName)

            console.log(chalk.yellow(`Cloning "${sourceProject}" to "${cleanProjectName}"...`))

            rushstack.FileSystem.copyFiles({
                sourcePath: sourcePath,
                destinationPath: newProjectPath,
                preserveTimestamps: true,
            })

            const uuids = generateProjectUUIDs()

            // Update manifests with new UUIDs
            const behaviorManifestPath = path.join(newProjectPath, 'behavior_pack', 'manifest.json')
            const resourceManifestPath = path.join(newProjectPath, 'resource_pack', 'manifest.json')

            updateManifestUUIDs(behaviorManifestPath, uuids.behaviorHeaderUuid, uuids.behaviorModuleUuid, uuids.resourceHeaderUuid)
            updateManifestUUIDs(resourceManifestPath, uuids.resourceHeaderUuid, uuids.resourceModuleUuid, uuids.behaviorHeaderUuid)

            updateProjectName(newProjectPath, cleanProjectName)

            console.log(chalk.green('✓ Project cloned successfully!'))
            console.log(chalk.gray(`Source: ${sourceProject}`))
            console.log(chalk.gray(`New project: ${cleanProjectName}`))
            console.log(chalk.gray(`Location: ${newProjectPath}`))
            console.log(chalk.blue('New UUIDs generated automatically'))

        } catch (error: any) {
            console.log(chalk.red('✗ Failed to clone project:'), error.message)
        }
    }
}

export function deleteProjectTask(rootPath: string): TaskFunction {
    return async () => {
        console.clear()
        console.log(chalk.red.bold('Delete Project'))
        console.log(chalk.gray('─'.repeat(50)))

        try {
            const projectsDir = path.join(rootPath, 'projects')
            if (!validateProjectsDirectory(projectsDir)) return

            const projects = getAvailableProjects(projectsDir)
            if (!checkProjectsExist(projects)) return

            const projectChoices = createProjectChoices(projects)

            const { projectToDelete } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'projectToDelete',
                    message: 'Select project to delete:',
                    choices: projectChoices
                }
            ])

            const projectPath = path.join(projectsDir, projectToDelete)

            console.log(chalk.red(`\n⚠ You are about to delete project: ${projectToDelete}`))
            console.log(chalk.gray(`Location: ${projectPath}`))
            console.log(chalk.red('This action cannot be undone!'))

            const { confirmName } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'confirmName',
                    message: 'Type the project name to confirm deletion:',
                    validate: (input: string) => {
                        if (input !== projectToDelete) {
                            return 'Project name does not match'
                        }
                        return true
                    }
                }
            ])

            const { finalConfirm } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'finalConfirm',
                    message: 'Are you absolutely sure you want to delete this project?',
                    default: false
                }
            ])

            if (!finalConfirm) {
                console.log(chalk.gray('Deletion cancelled'))
                return
            }

            // Ask about deleting deployed files
            const { deleteDeployment } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'deleteDeployment',
                    message: 'Also delete deployed files from Minecraft development folders?',
                    default: true
                }
            ])

            console.log(chalk.yellow(`\nDeleting project "${projectToDelete}"...`))

            try {
                rimraf.sync(projectPath)
                console.log(chalk.green(`✓ Project "${projectToDelete}" deleted successfully`))

                if (deleteDeployment) {
                    console.log(chalk.yellow('\nDeleting deployed files...'))
                    deleteDeployedProject(projectToDelete)
                }
            } catch (error: any) {
                console.log(chalk.red(`✗ Failed to delete project: ${error.message}`))
            }

        } catch (error: any) {
            console.log(chalk.red('✗ Failed to delete project:'), error.message)
        }
    }
}

export function renameProjectTask(rootPath: string): TaskFunction {
    return async () => {
        console.clear()
        console.log(chalk.blue.bold('Rename Project'))
        console.log(chalk.gray('─'.repeat(50)))

        try {
            const projectsDir = path.join(rootPath, 'projects')
            if (!validateProjectsDirectory(projectsDir)) return

            const projects = getAvailableProjects(projectsDir)
            if (!checkProjectsExist(projects)) return

            const projectChoices = createProjectChoices(projects)

            const answers = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'oldProjectName',
                    message: 'Select project to rename:',
                    choices: projectChoices
                },
                {
                    type: 'input',
                    name: 'newProjectName',
                    message: 'Enter new project name:',
                    validate: (input: string) => {
                        if (!input.trim()) {
                            return 'Project name cannot be empty'
                        }
                        const cleanName = input.replace(/['"]/g, '').trim()
                        const folderName = cleanName.replace(/\s+/g, '_')
                        const newProjectPath = path.join(projectsDir, folderName)
                        if (fs.existsSync(newProjectPath)) {
                            return `Project "${cleanName}" already exists`
                        }
                        return true
                    },
                    filter: (input: string) => input.replace(/['"]/g, '').trim()
                },
                {
                    type: 'input',
                    name: 'newProjectDescription',
                    message: 'Enter new project description (optional):',
                    default: 'A Minecraft Bedrock add-on',
                    filter: (input: string) => input.replace(/['"]/g, '').trim()
                }
            ])

            const oldProjectName: string = answers.oldProjectName
            const cleanProjectName: string = answers.newProjectName
            const newFolderName = cleanProjectName.replace(/\s+/g, '_')
            const oldProjectPath = path.join(projectsDir, oldProjectName)
            const newProjectPath = path.join(projectsDir, newFolderName)

            console.log(chalk.yellow(`\nRenaming "${oldProjectName}" to "${cleanProjectName}"...`))

            rushstack.FileSystem.copyFiles({
                sourcePath: oldProjectPath,
                destinationPath: newProjectPath,
                preserveTimestamps: true,
            })

            updateProjectName(newProjectPath, cleanProjectName)
            updateProjectDescription(newProjectPath, answers.newProjectDescription)

            // Update manifest names if they reference the old project name
            const behaviorManifestPath = path.join(newProjectPath, 'behavior_pack', 'manifest.json')
            if (fs.existsSync(behaviorManifestPath)) {
                const behaviorManifest: ProjectManifest = JSON.parse(fs.readFileSync(behaviorManifestPath, 'utf8'))
                if (behaviorManifest.header && behaviorManifest.header.name === oldProjectName) {
                    behaviorManifest.header.name = cleanProjectName
                    fs.writeFileSync(behaviorManifestPath, JSON.stringify(behaviorManifest, null, 4))
                }
            }

            const resourceManifestPath = path.join(newProjectPath, 'resource_pack', 'manifest.json')
            if (fs.existsSync(resourceManifestPath)) {
                const resourceManifest: ProjectManifest = JSON.parse(fs.readFileSync(resourceManifestPath, 'utf8'))
                if (resourceManifest.header && resourceManifest.header.name === oldProjectName) {
                    resourceManifest.header.name = cleanProjectName
                    fs.writeFileSync(resourceManifestPath, JSON.stringify(resourceManifest, null, 4))
                }
            }

            rimraf.sync(oldProjectPath)

            console.log(chalk.green(`✓ Project renamed successfully!`))
            console.log(chalk.gray(`Old name: ${oldProjectName}`))
            console.log(chalk.gray(`New name: ${cleanProjectName}`))
            console.log(chalk.gray(`Location: ${newProjectPath}`))

        } catch (error: any) {
            console.log(chalk.red('✗ Failed to rename project:'), error.message)
        }
    }
}

export function openProjectTask(rootPath: string): TaskFunction {
    return async () => {
        console.clear()
        console.log(chalk.blue.bold('Open Project'))
        console.log(chalk.gray('─'.repeat(50)))

        try {
            const projectsDir = path.join(rootPath, 'projects')
            if (!validateProjectsDirectory(projectsDir)) return

            const projects = getAvailableProjects(projectsDir)
            if (!checkProjectsExist(projects)) return

            const projectChoices = createProjectChoices(projects)

            const { selectedProject } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'selectedProject',
                    message: 'Select project to open:',
                    choices: projectChoices
                }
            ])

            const projectPath = path.join(projectsDir, selectedProject)

            console.log(chalk.yellow(`Opening project "${selectedProject}"...`))
            openInVSCode(projectPath)

            console.log(chalk.green(`✓ Project opened successfully!`))
            console.log(chalk.gray(`Location: ${projectPath}`))

        } catch (error: any) {
            console.log(chalk.red('✗ Failed to open project:'), error.message)
        }
    }
}

export function updateWorkspaceTask(projectPath: string, rootPath: string): TaskFunction {
    return () => {
        if (!validateProjectContext(projectPath)) return

        console.clear()
        console.log(chalk.cyan.bold('Update Workspace'))
        console.log(chalk.gray('─'.repeat(50)))

        const templatePath = path.join(rootPath, 'projects', 'template')
        
        try {
            const filesToUpdate = [
                { src: '.vscode/tasks.json', dest: '.vscode/tasks.json', name: 'VS Code tasks' },
                { src: '.vscode/settings.json', dest: '.vscode/settings.json', name: 'VS Code settings' },
                { src: 'tsconfig.json', dest: 'tsconfig.json', name: 'TypeScript configuration' }
            ]

            let updatedCount = 0

            filesToUpdate.forEach(file => {
                const srcPath = path.join(templatePath, file.src)
                const destPath = path.join(projectPath, file.dest)

                if (fs.existsSync(srcPath)) {
                    try {
                        const destDir = path.dirname(destPath)
                        if (!fs.existsSync(destDir)) {
                            fs.mkdirSync(destDir, { recursive: true })
                        }

                        rushstack.FileSystem.copyFiles({
                            sourcePath: srcPath,
                            destinationPath: destPath,
                            preserveTimestamps: true,
                        })

                        console.log(chalk.green(`✓ Updated ${file.name}`))
                        updatedCount++
                    } catch (error: any) {
                        console.log(chalk.red(`✗ Failed to update ${file.name}: ${error.message}`))
                    }
                } else {
                    console.log(chalk.yellow(`⚠ Template file not found: ${file.src}`))
                }
            })

            console.log(chalk.blue(`\nCompleted: Updated ${updatedCount} configuration files`))
            
            if (updatedCount > 0) {
                console.log(chalk.gray('Restart VS Code to apply the new configurations'))
            }

        } catch (error: any) {
            console.log(chalk.red('✗ Failed to update workspace:'), error.message)
        }
    }
}

export function analyzeProjectTask(projectPath: string): TaskFunction {
    return () => {
        if (!validateProjectContext(projectPath)) return

        console.clear()
        console.log(chalk.cyan.bold('Analyze Project'))
        console.log(chalk.gray('─'.repeat(50)))

        const stats: ProjectStats = {
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

        function analyzeDirectory(dirPath: string, relativePath: string = '', packType: string = 'other'): void {
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

        console.log(chalk.white.bold('PROJECT STATISTICS'))
        console.log(`Total files: ${stats.totalFiles}`)
        console.log(`Total size: ${formatBytes(stats.totalSize)}`)
        console.log('')
        console.log(chalk.blue('Pack Distribution'))
        console.log(`Behavior pack files: ${stats.behaviorFiles} (${formatBytes(stats.behaviorSize)})`)
        console.log(`Resource pack files: ${stats.resourceFiles} (${formatBytes(stats.resourceSize)})`)
        console.log('')
        console.log(chalk.green('File Types'))
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
                const manifest: ProjectManifest = JSON.parse(fs.readFileSync(behaviorManifestPath, 'utf8'))
                const projectName = getProjectDisplayName(projectPath, manifest)
                
                console.log('')
                console.log(chalk.yellow('Behavior Pack Info'))
                console.log(`Name: ${projectName}`)
                console.log(`Version: ${manifest.header?.version?.join('.') || 'Unknown'}`)
                console.log(`Min Engine: ${manifest.header?.min_engine_version?.join('.') || 'Unknown'}`)
                console.log(`Modules: ${manifest.modules?.length || 0}`)

                // Check for Minecraft server dependencies
                const packageJsonPath = path.join(projectPath, '..', '..', 'package.json')
                if (fs.existsSync(packageJsonPath)) {
                    try {
                        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
                        const deps = packageJson.dependencies || {}
                        
                        if (deps['@minecraft/server'] || deps['@minecraft/server-ui']) {
                            console.log('')
                            console.log(chalk.magenta('Minecraft Dependencies'))
                            if (deps['@minecraft/server']) {
                                console.log(`@minecraft/server: ${deps['@minecraft/server']}`)
                            }
                            if (deps['@minecraft/server-ui']) {
                                console.log(`@minecraft/server-ui: ${deps['@minecraft/server-ui']}`)
                            }
                        }
                    } catch (error) {
                        // Ignore package.json read errors
                    }
                }
            } catch (error) {
                console.log(chalk.red('\nFailed to read behavior pack manifest'))
            }
        }

        if (fs.existsSync(resourceManifestPath)) {
            try {
                const manifest: ProjectManifest = JSON.parse(fs.readFileSync(resourceManifestPath, 'utf8'))
                const projectName = getProjectDisplayName(projectPath, manifest)
                
                console.log('')
                console.log(chalk.yellow('Resource Pack Info'))
                console.log(`Name: ${projectName}`)
                console.log(`Version: ${manifest.header?.version?.join('.') || 'Unknown'}`)
                console.log(`Min Engine: ${manifest.header?.min_engine_version?.join('.') || 'Unknown'}`)
                console.log(`Modules: ${manifest.modules?.length || 0}`)
            } catch (error) {
                console.log(chalk.red('\nFailed to read resource pack manifest'))
            }
        }

        console.log(chalk.green('\n✓ Analysis completed!'))
    }
}

export function backupProjectTask(projectPath: string, rootPath: string): TaskFunction {
    return async () => {
        if (!validateProjectContext(projectPath)) return

        const projectName = path.basename(projectPath)
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]
        const backupName = `${projectName}_backup_${timestamp}`
        const backupPath = path.join(rootPath, 'backups', backupName)

        console.log(chalk.yellow(`Creating backup: ${backupName}`))

        try {
            const backupsDir = path.join(rootPath, 'backups')
            if (!fs.existsSync(backupsDir)) {
                fs.mkdirSync(backupsDir, {recursive: true})
            }

            rushstack.FileSystem.copyFiles({
                sourcePath: projectPath,
                destinationPath: backupPath,
                preserveTimestamps: true,
            })

            console.log(chalk.green(`✓ Backup created successfully at: ${backupPath}`))

            const zipPath = `${backupPath}.zip`
            const zip = new zip_lib.Zip()
            zip.addFolder(backupPath)

            await zip.archive(zipPath)
            console.log(chalk.green(`✓ Backup archived as: ${zipPath}`))

            rimraf.sync(backupPath)
            console.log(chalk.gray('Cleaned up temporary files'))

            const backupFiles = fs.readdirSync(backupsDir).filter((file) => file.startsWith(projectName) && file.endsWith('.zip'))
            console.log(chalk.blue(`\nTotal backups for ${projectName}: ${backupFiles.length}`))

            if (backupFiles.length > 5) {
                console.log(chalk.yellow('You have more than 5 backups. Consider cleaning up old ones.'))
            }
        } catch (error: any) {
            console.log(chalk.red('✗ Backup failed:'), error.message)
        }
    }
}


export function createSymlink(projectPath: string, projectName: string): TaskFunction {
    return () => {
        if (!validateProjectContext(projectPath)) return

        console.log(chalk.yellow('Creating new Symlink for project...'))

        const projectBehaviorPath = path.join(projectPath, 'behavior_pack')
        const projectResourcePath = path.join(projectPath, 'resource_pack')
        
        const deploymentPath = getGameDeploymentRootPaths().PreviewGDK
        if (deploymentPath === undefined) {
            throw new Error('Deployment path is undefined. Make sure you have the right minecraft version installed (Minecraft GDK).')
        }

        const deploymentBehaviorPath = path.join(deploymentPath, BehaviorPacksPath, projectName + '_BP')
        const deploymentResourcePath = path.join(deploymentPath, ResourcePacksPath, projectName + '_RP')

        const logs = []
        try {
            if (fs.existsSync(projectBehaviorPath)) {
                if (!fs.existsSync(deploymentBehaviorPath)) {
                    fs.symlinkSync(projectBehaviorPath, deploymentBehaviorPath, 'junction')
                    console.log(chalk.green('✓ Behavior pack Symlink created'))
                    logs.push(`Behavior Pack: ${deploymentBehaviorPath}`)
                } else {
                    console.log(chalk.gray('? Behavior pack Symlink already exists'))
                }
            }

            if (fs.existsSync(projectResourcePath)) {
                if (!fs.existsSync(deploymentResourcePath)) {
                    fs.symlinkSync(projectResourcePath, deploymentResourcePath, 'junction')
                    console.log(chalk.green('✓ Resource pack Symlink created'))
                    logs.push(`Resource Pack: ${deploymentResourcePath}`)
                } else {
                    console.log(chalk.gray('? Resource pack Symlink already exists'))
                }
            }

            if (logs.length > 0) {
                console.log('')
                console.log(chalk.white.bold('CREATED SYMLINKS'))
                logs.forEach(log => console.log(log))
            } else {
                console.log(chalk.red.bold('0 SYMLINKS CREATED'))
            }
        } catch (error: any) {
            console.log(chalk.red('✗ Failed to create symlink:'), error.message)
        }
    }
}

export function generateUuidsTask(projectPath: string): TaskFunction {
    return () => {
        if (!validateProjectContext(projectPath)) return

        console.log(chalk.yellow('Generating new UUIDs for project...'))

        const behaviorManifestPath = path.join(projectPath, 'behavior_pack', 'manifest.json')
        const resourceManifestPath = path.join(projectPath, 'resource_pack', 'manifest.json')

        try {
            const uuids = generateProjectUUIDs()

            // Update behavior pack
            if (fs.existsSync(behaviorManifestPath)) {
                updateManifestUUIDs(behaviorManifestPath, uuids.behaviorHeaderUuid, uuids.behaviorModuleUuid, uuids.resourceHeaderUuid)
                console.log(chalk.green('✓ Behavior pack UUIDs updated'))
            }

            // Update resource pack
            if (fs.existsSync(resourceManifestPath)) {
                updateManifestUUIDs(resourceManifestPath, uuids.resourceHeaderUuid, uuids.resourceModuleUuid, uuids.behaviorHeaderUuid)
                console.log(chalk.green('✓ Resource pack UUIDs updated'))
            }

            // Run prettier on the updated files
            console.log(chalk.gray('Running prettier on updated files...'))
            const filesToFormat = []
            if (fs.existsSync(behaviorManifestPath)) {
                filesToFormat.push(behaviorManifestPath)
            }
            if (fs.existsSync(resourceManifestPath)) {
                filesToFormat.push(resourceManifestPath)
            }
            
            const workspaceRoot = path.resolve(projectPath, '..', '..')
            const prettierSuccess = runPrettier(filesToFormat, workspaceRoot)
            if (!prettierSuccess) {
                console.log(chalk.yellow('⚠ Prettier formatting failed, but UUIDs were updated'))
            }

            console.log('')
            console.log(chalk.white.bold('NEW UUIDS GENERATED'))
            console.log(`Behavior Header: ${uuids.behaviorHeaderUuid}`)
            console.log(`Behavior Module: ${uuids.behaviorModuleUuid}`)
            console.log(`Resource Header: ${uuids.resourceHeaderUuid}`)
            console.log(`Resource Module: ${uuids.resourceModuleUuid}`)
        } catch (error: any) {
            console.log(chalk.red('✗ Failed to generate UUIDs:'), error.message)
        }
    }
}

export function listProjectsTask(rootPath: string): TaskFunction {
    return () => {
        if (!fs.existsSync(rootPath) || !rootPath.includes('workspace')) {
            console.log(chalk.red('ERROR: This command must be run from within the workspace.'))
            console.log(chalk.gray('Navigate to the workspace root first'))
            return
        }

        console.clear()
        console.log(chalk.cyan.bold('Available Projects'))
        console.log(chalk.gray('─'.repeat(50)))

        const projectsDir = path.join(rootPath, 'projects')
        if (!validateProjectsDirectory(projectsDir)) return

        const projects = getAvailableProjects(projectsDir)
        if (!checkProjectsExist(projects)) return

        projects.forEach((project, index) => {
            const projectPath = path.join(projectsDir, project)
            const behaviorManifestPath = path.join(projectPath, 'behavior_pack', 'manifest.json')

            let projectInfo = `${index + 1}. ${project}`

            if (fs.existsSync(behaviorManifestPath)) {
                try {
                    const manifest: ProjectManifest = JSON.parse(fs.readFileSync(behaviorManifestPath, 'utf8'))
                    const name = getProjectDisplayName(projectPath, manifest)
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

        console.log(chalk.blue(`\nTotal projects: ${projects.length}`))
    }
}

export function openMinecraftFolderTask(): TaskFunction {
    return async () => {
        console.clear()
        console.log(chalk.blue.bold('Open Minecraft Folder'))
        console.log(chalk.gray('─'.repeat(50)))

        const paths = getGameDeploymentRootPaths()
        const availablePaths = Object.entries(paths).filter(([, path]) => path && fs.existsSync(path))

        if (availablePaths.length === 0) {
            console.log(chalk.red('✗ No Minecraft installation found'))
            return
        }

        if (availablePaths.length === 1) {
            const [product, folderPath] = availablePaths[0]
            console.log(chalk.yellow(`Opening ${product} folder...`))
            console.log(chalk.gray(`Location: ${folderPath}`))
            try {
                child_process.exec(`explorer "${folderPath}"`)
                console.log(chalk.green('✓ Folder opened successfully'))
            } catch (error) {
                console.log(chalk.red('✗ Failed to open folder'))
            }
            return
        }

        try {
            const installationChoices = availablePaths.map(([product, folderPath]) => ({
                name: `${product} - ${folderPath}`,
                value: { product, folderPath }
            }))

            const { selectedInstallation } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'selectedInstallation',
                    message: 'Select Minecraft installation to open:',
                    choices: installationChoices
                }
            ])

            console.log(chalk.yellow(`Opening ${selectedInstallation.product} folder...`))
            console.log(chalk.gray(`Location: ${selectedInstallation.folderPath}`))

            try {
                child_process.exec(`explorer "${selectedInstallation.folderPath}"`)
                console.log(chalk.green('✓ Folder opened successfully'))
            } catch (error) {
                console.log(chalk.red('✗ Failed to open folder'))
            }
        } catch (error: any) {
            console.log(chalk.red('✗ Failed to process selection:'), error.message)
        }
    }
}

export function updateVersionTask(projectPath: string): TaskFunction {
    return async () => {
        if (!validateProjectContext(projectPath)) return

        console.clear()
        console.log(chalk.magenta.bold('Update Version'))
        console.log(chalk.gray('─'.repeat(50)))

        try {
            const behaviorManifestPath = path.join(projectPath, 'behavior_pack', 'manifest.json')
            const resourceManifestPath = path.join(projectPath, 'resource_pack', 'manifest.json')

            if (!fs.existsSync(behaviorManifestPath)) {
                console.log(chalk.red('✗ Behavior pack manifest not found'))
                return
            }

            const behaviorManifest: ProjectManifest = JSON.parse(fs.readFileSync(behaviorManifestPath, 'utf8'))
            const currentVersion = behaviorManifest.header?.version || [1, 0, 0]

            console.log(chalk.blue(`Current version: ${currentVersion.join('.')}`))

            const versionChoices = [
                { name: `Patch (${currentVersion[0]}.${currentVersion[1]}.${currentVersion[2] + 1}) - Bug fixes`, value: 'patch' },
                { name: `Minor (${currentVersion[0]}.${currentVersion[1] + 1}.0) - New features`, value: 'minor' },
                { name: `Major (${currentVersion[0] + 1}.0.0) - Breaking changes`, value: 'major' },
                { name: 'Custom version', value: 'custom' }
            ]

            const answers = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'updateType',
                    message: 'Select version update type:',
                    choices: versionChoices
                }
            ])

            let newVersion = [...currentVersion]

            if (answers.updateType === 'custom') {
                const { customVersion } = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'customVersion',
                        message: 'Enter custom version (x.y.z):',
                        validate: (input: string) => {
                            const parts = input.split('.').map(Number)
                            if (parts.length !== 3 || parts.some(n => isNaN(n) || n < 0)) {
                                return 'Please enter a valid version format (x.y.z) with non-negative numbers'
                            }
                            return true
                        }
                    }
                ])
                newVersion = customVersion.split('.').map(Number)
            } else {
                switch (answers.updateType) {
                    case 'patch':
                        newVersion[2]++
                        break
                    case 'minor':
                        newVersion[1]++
                        newVersion[2] = 0
                        break
                    case 'major':
                        newVersion[0]++
                        newVersion[1] = 0
                        newVersion[2] = 0
                        break
                }
            }

            console.log(chalk.yellow(`Updating version to: ${newVersion.join('.')}`))

            // Update behavior pack
            behaviorManifest.header.version = newVersion
            if (behaviorManifest.modules) {
                behaviorManifest.modules.forEach((module) => {
                    module.version = newVersion
                })
            }
            // Update dependency version if exists
            if (behaviorManifest.dependencies && behaviorManifest.dependencies[0]) {
                behaviorManifest.dependencies[0].version = newVersion
            }
            fs.writeFileSync(behaviorManifestPath, JSON.stringify(behaviorManifest, null, 4))

            // Update resource pack if it exists
            if (fs.existsSync(resourceManifestPath)) {
                const resourceManifest: ProjectManifest = JSON.parse(fs.readFileSync(resourceManifestPath, 'utf8'))
                resourceManifest.header.version = newVersion
                if (resourceManifest.modules) {
                    resourceManifest.modules.forEach((module) => {
                        module.version = newVersion
                    })
                }
                // Update dependency version if exists
                if (resourceManifest.dependencies && resourceManifest.dependencies[0]) {
                    resourceManifest.dependencies[0].version = newVersion
                }
                fs.writeFileSync(resourceManifestPath, JSON.stringify(resourceManifest, null, 4))
            }

            // Run prettier on the updated files
            console.log(chalk.gray('Running prettier on updated files...'))
            const filesToFormat = [behaviorManifestPath]
            if (fs.existsSync(resourceManifestPath)) {
                filesToFormat.push(resourceManifestPath)
            }
            
            const workspaceRoot = path.resolve(projectPath, '..', '..')
            const prettierSuccess = runPrettier(filesToFormat, workspaceRoot)
            if (!prettierSuccess) {
                console.log(chalk.yellow('⚠ Prettier formatting failed, but version was updated'))
            }

            console.log(chalk.green('✓ Version updated successfully!'))
            console.log(chalk.gray(`New version: ${newVersion.join('.')}`))
        } catch (error: any) {
            console.log(chalk.red('✗ Failed to update version:'), error.message)
        }
    }
}

export function listDevelopmentProjectsTask(): TaskFunction {
    return () => {
        console.clear()
        console.log(chalk.cyan.bold('Development Projects'))
        console.log(chalk.gray('─'.repeat(50)))

        const developmentProjects = getDevelopmentProjects()

        if (developmentProjects.length === 0) {
            console.log(chalk.yellow('No development projects found in Minecraft folders'))
            console.log(chalk.gray('Deploy some projects first with: npm run local-deploy'))
            return
        }

        console.log(chalk.blue('Behavior Packs:'))
        const behaviorPacks = developmentProjects.filter(p => p.type === 'behavior')
        if (behaviorPacks.length === 0) {
            console.log(chalk.gray('  No behavior packs found'))
        } else {
            behaviorPacks.forEach((project, index) => {
                console.log(`  ${index + 1}. ${project.name}`)
                console.log(chalk.gray(`     ${project.path}`))
            })
        }

        console.log('')
        console.log(chalk.green('Resource Packs:'))
        const resourcePacks = developmentProjects.filter(p => p.type === 'resource')
        if (resourcePacks.length === 0) {
            console.log(chalk.gray('  No resource packs found'))
        } else {
            resourcePacks.forEach((project, index) => {
                console.log(`  ${index + 1}. ${project.name}`)
                console.log(chalk.gray(`     ${project.path}`))
            })
        }

        console.log('')
        console.log(chalk.blue(`Total development projects: ${developmentProjects.length}`))
        console.log(chalk.gray(`Behavior packs: ${behaviorPacks.length} | Resource packs: ${resourcePacks.length}`))
    }
}

export function openWorkspaceTask(rootPath: string): TaskFunction {
    return async () => {
        console.clear()
        console.log(chalk.blue.bold('Open Workspace'))
        console.log(chalk.gray('─'.repeat(50)))

        try {
            console.log(chalk.yellow('Opening workspace in VS Code...'))
            console.log(chalk.gray(`Location: ${rootPath}`))

            const quotedPath = quotePath(rootPath)
            child_process.exec(`code "${quotedPath}"`, (err) => {
                if (err) {
                    console.log(chalk.red('Failed to open VS Code automatically.'))
                    console.log(chalk.gray('Make sure the "code" command is installed in PATH.'))
                    console.log(chalk.gray('You can enable it in VS Code via:'))
                    console.log(chalk.gray('Ctrl+Shift+P → "Shell Command: Install \'code\' command in PATH"'))
                } else {
                    console.log(chalk.green('✓ Workspace opened successfully!'))
                }
            })

        } catch (error: any) {
            console.log(chalk.red('✗ Failed to open workspace:'), error.message)
        }
    }
}

export function debugTask(projectPath: string): TaskFunction {
    return () => {
        if (!validateProjectContext(projectPath)) return

        console.clear()
        console.log(chalk.red.bold('Debug Information'))
        console.log(chalk.gray('─'.repeat(60)))

        const projectName = path.basename(projectPath)
        
        // Project Information
        console.log(chalk.blue.bold('Project Information:'))
        console.log(`  ${chalk.cyan('Name:')} ${projectName}`)
        console.log(`  ${chalk.cyan('Path:')} ${projectPath}`)
        console.log(`  ${chalk.cyan('Working Directory:')} ${process.cwd()}`)
        console.log(`  ${chalk.cyan('Real CWD:')} ${process.env.REAL_CWD || 'Not set'}`)
        console.log('')

        // Environment Variables
        console.log(chalk.green.bold('Environment Variables:'))
        const envVars = [
            'NODE_ENV', 'REAL_CWD', 'APPDATA', 'LOCALAPPDATA', 
            'CUSTOM_DEPLOYMENT_PATH', 'PROJECT_NAME', 'MINECRAFT_PRODUCT'
        ]
        envVars.forEach(envVar => {
            const value = process.env[envVar]
            if (value) {
                console.log(`  ${chalk.green('✓')} ${chalk.cyan(envVar)}: ${value}`)
            } else {
                console.log(`  ${chalk.red('✗')} ${chalk.cyan(envVar)}: ${chalk.gray('undefined')}`)
            }
        })
        console.log('')

        // Package.json Dependencies
        console.log(chalk.magenta.bold('Dependencies:'))
        const packageJsonPath = path.join(projectPath, '..', '..', 'package.json')
        if (fs.existsSync(packageJsonPath)) {
            try {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
                const deps = packageJson.dependencies || {}
                const devDeps = packageJson.devDependencies || {}
                
                console.log(`  ${chalk.cyan('Production Dependencies:')}`)
                Object.entries(deps).forEach(([name, version]) => {
                    if (name.includes('minecraft')) {
                        console.log(`    ${chalk.green('✓')} ${name}: ${version}`)
                    }
                })
                
                console.log(`  ${chalk.cyan('Dev Dependencies:')}`)
                const importantDevDeps = ['typescript', 'esbuild', 'just-scripts']
                importantDevDeps.forEach(dep => {
                    if (devDeps[dep]) {
                        console.log(`    ${chalk.green('✓')} ${dep}: ${devDeps[dep]}`)
                    } else {
                        console.log(`    ${chalk.red('✗')} ${dep}: ${chalk.gray('missing')}`)
                    }
                })
            } catch (error) {
                console.log(`  ${chalk.red('✗')} Failed to read package.json`)
            }
        } else {
            console.log(`  ${chalk.red('✗')} package.json not found`)
        }
        console.log('')

        // Manifest Files Analysis
        console.log(chalk.yellow.bold('Manifest Files:'))
        const behaviorManifestPath = path.join(projectPath, 'behavior_pack', 'manifest.json')
        const resourceManifestPath = path.join(projectPath, 'resource_pack', 'manifest.json')

        const manifestsToCheck = [
            { path: behaviorManifestPath, type: 'Behavior Pack', color: chalk.blue },
            { path: resourceManifestPath, type: 'Resource Pack', color: chalk.green }
        ]

        manifestsToCheck.forEach(({ path: manifestPath, type, color }) => {
            if (fs.existsSync(manifestPath)) {
                try {
                    const manifest: ProjectManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
                    console.log(`  ${chalk.green('✓')} ${color(type)}: ${manifest.header?.name || 'Unknown'} v${manifest.header?.version?.join('.') || 'Unknown'}`)
                    console.log(`    ${chalk.cyan('UUID:')} ${manifest.header?.uuid || chalk.red('Missing')}`)
                    console.log(`    ${chalk.cyan('Format Version:')} ${manifest.format_version || chalk.red('Missing')}`)
                    console.log(`    ${chalk.cyan('Min Engine:')} ${manifest.header?.min_engine_version?.join('.') || chalk.red('Missing')}`)
                    console.log(`    ${chalk.cyan('Modules:')} ${manifest.modules?.length || 0}`)
                    
                    // Check for common issues
                    if (!manifest.header?.uuid || !manifest.header?.uuid.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
                        console.log(`    ${chalk.red('⚠ Invalid or missing UUID format')}`)
                    }
                    if (manifest.dependencies && manifest.dependencies.length > 0) {
                        console.log(`    ${chalk.cyan('Dependencies:')} ${manifest.dependencies.length}`)
                        manifest.dependencies.forEach((dep, i) => {
                            console.log(`      ${i + 1}. UUID: ${dep.uuid}, Version: ${dep.version?.join('.') || 'Unknown'}`)
                        })
                    }
                } catch (error: any) {
                    console.log(`  ${chalk.red('✗')} ${color(type)}: Invalid JSON - ${error.message}`)
                }
            } else {
                console.log(`  ${chalk.red('✗')} ${color(type)}: manifest.json not found`)
            }
        })
        console.log('')

        // TypeScript Configuration
        console.log(chalk.magenta.bold('TypeScript Configuration:'))
        const tsconfigPath = path.join(projectPath, 'tsconfig.json')
        if (fs.existsSync(tsconfigPath)) {
            try {
                const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'))
                console.log(`  ${chalk.green('✓')} tsconfig.json found`)
                console.log(`    ${chalk.cyan('Target:')} ${tsconfig.compilerOptions?.target || 'Not specified'}`)
                console.log(`    ${chalk.cyan('Module:')} ${tsconfig.compilerOptions?.module || 'Not specified'}`)
                console.log(`    ${chalk.cyan('Out Dir:')} ${tsconfig.compilerOptions?.outDir || 'Not specified'}`)
                console.log(`    ${chalk.cyan('Root Dir:')} ${tsconfig.compilerOptions?.rootDir || 'Not specified'}`)
            } catch (error) {
                console.log(`  ${chalk.red('✗')} tsconfig.json: Invalid JSON`)
            }
        } else {
            console.log(`  ${chalk.red('✗')} tsconfig.json not found`)
        }
        console.log('')

        // TypeScript Files Analysis
        console.log(chalk.magenta.bold('TypeScript Files:'))
        const tscriptsPath = path.join(projectPath, 'tscripts')
        if (fs.existsSync(tscriptsPath)) {
            try {
                const tsFiles = fs.readdirSync(tscriptsPath, { recursive: true })
                    .filter((file: any) => typeof file === 'string' && file.endsWith('.ts'))
                
                console.log(`  ${chalk.green('✓')} Found ${tsFiles.length} TypeScript files`)
                
                if (tsFiles.length > 0) {
                    console.log(`    ${chalk.cyan('Files:')}`)
                    tsFiles.slice(0, 8).forEach((file: any) => {
                        const filePath = path.join(tscriptsPath, file)
                        const stats = fs.statSync(filePath)
                        const size = formatBytes(stats.size)
                        console.log(`      - ${file} (${size})`)
                    })
                    if (tsFiles.length > 8) {
                        console.log(`      ... and ${tsFiles.length - 8} more files`)
                    }
                    
                    // Check for main.ts
                    const hasMainTs = tsFiles.some((file: any) => file === 'main.ts' || file.endsWith('/main.ts'))
                    if (hasMainTs) {
                        console.log(`    ${chalk.green('✓')} main.ts entry point found`)
                    } else {
                        console.log(`    ${chalk.yellow('⚠')} main.ts entry point not found`)
                    }
                }
            } catch (error) {
                console.log(`  ${chalk.red('✗')} Error reading tscripts directory`)
            }
        } else {
            console.log(`  ${chalk.red('✗')} tscripts folder not found`)
        }
        console.log('')

        // Build Output Analysis
        console.log(chalk.blue.bold('Build Output:'))
        const scriptsPath = path.join(projectPath, 'behavior_pack', 'scripts')
        if (fs.existsSync(scriptsPath)) {
            try {
                const jsFiles = fs.readdirSync(scriptsPath, { recursive: true })
                    .filter((file: any) => typeof file === 'string' && file.endsWith('.js'))
                
                console.log(`  ${chalk.green('✓')} Found ${jsFiles.length} compiled JavaScript files`)
                
                if (jsFiles.length > 0) {
                    jsFiles.slice(0, 5).forEach((file: any) => {
                        const filePath = path.join(scriptsPath, file)
                        const stats = fs.statSync(filePath)
                        const size = formatBytes(stats.size)
                        const mtime = stats.mtime.toLocaleString()
                        console.log(`      - ${file} (${size}, modified: ${mtime})`)
                    })
                    if (jsFiles.length > 5) {
                        console.log(`      ... and ${jsFiles.length - 5} more files`)
                    }
                }
            } catch (error) {
                console.log(`  ${chalk.red('✗')} Error reading scripts directory`)
            }
        } else {
            console.log(`  ${chalk.yellow('⚠')} No compiled scripts found (run build first)`)
        }
        console.log('')

        // Deployment Status
        console.log(chalk.cyan.bold('Deployment Status:'))
        const paths = getGameDeploymentRootPaths()
        let deployedCount = 0
        
        Object.entries(paths).forEach(([product, deployPath]) => {
            if (deployPath && fs.existsSync(deployPath)) {
                console.log(`  ${chalk.green('✓')} ${product}: ${deployPath}`)
                
                const behaviorDeployPath = path.join(deployPath, BehaviorPacksPath, `${projectName}_BP`)
                const resourceDeployPath = path.join(deployPath, ResourcePacksPath, `${projectName}_RP`)
                
                let productDeployed = false
                
                if (fs.existsSync(behaviorDeployPath)) {
                    console.log(`    ${chalk.green('✓')} Behavior pack deployed`)
                    productDeployed = true
                    
                    // Check if scripts are deployed
                    const deployedScriptsPath = path.join(behaviorDeployPath, 'scripts')
                    if (fs.existsSync(deployedScriptsPath)) {
                        const deployedJsFiles = fs.readdirSync(deployedScriptsPath, { recursive: true })
                            .filter((file: any) => typeof file === 'string' && file.endsWith('.js'))
                        console.log(`      Scripts: ${deployedJsFiles.length} files`)
                    }
                } else {
                    console.log(`    ${chalk.red('✗')} Behavior pack not deployed`)
                }
                
                if (fs.existsSync(resourceDeployPath)) {
                    console.log(`    ${chalk.green('✓')} Resource pack deployed`)
                    productDeployed = true
                } else {
                    console.log(`    ${chalk.red('✗')} Resource pack not deployed`)
                }
                
                if (productDeployed) deployedCount++
            } else {
                console.log(`  ${chalk.red('✗')} ${product}: Not found or inaccessible`)
            }
        })
        
        if (deployedCount === 0) {
            console.log(`  ${chalk.yellow('⚠')} Project not deployed to any Minecraft installation`)
            console.log(`    ${chalk.gray('Run: npm run local-deploy')}`)
        }
        console.log('')

        // System Information
        console.log(chalk.white.bold('System Information:'))
        console.log(`  ${chalk.cyan('Platform:')} ${process.platform} ${process.arch}`)
        console.log(`  ${chalk.cyan('Node.js:')} ${process.version}`)
        console.log(`  ${chalk.cyan('Memory Usage:')} ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB / ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`)
        console.log(`  ${chalk.cyan('Uptime:')} ${Math.round(process.uptime())}s`)
        
        // Check for common tools
        const tools = ['code', 'git', 'npm', 'npx']
        console.log(`  ${chalk.cyan('Available Tools:')}`)
        tools.forEach(tool => {
            try {
                child_process.execSync(`${tool} --version`, { stdio: 'ignore' })
                console.log(`    ${chalk.green('✓')} ${tool}`)
            } catch {
                console.log(`    ${chalk.red('✗')} ${tool}`)
            }
        })
        console.log('')

        // Common Issues Check
        console.log(chalk.red.bold('Common Issues Check:'))
        const issues: string[] = []
        
        // Check for spaces in path
        if (projectPath.includes(' ')) {
            issues.push('Project path contains spaces - may cause build issues')
        }
        
        // Check for missing main.ts
        const mainTsPath = path.join(projectPath, 'tscripts', 'main.ts')
        if (!fs.existsSync(mainTsPath)) {
            issues.push('main.ts entry point not found in tscripts/')
        }
        
        // Check for outdated dependencies
        if (fs.existsSync(packageJsonPath)) {
            try {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
                const deps = packageJson.dependencies || {}
                if (deps['@minecraft/server'] && deps['@minecraft/server'].startsWith('1.')) {
                    issues.push('@minecraft/server version may be outdated (v1.x)')
                }
            } catch {}
        }
        
        if (issues.length > 0) {
            issues.forEach((issue, i) => {
                console.log(`  ${chalk.red(`${i + 1}.`)} ${issue}`)
            })
        } else {
            console.log(`  ${chalk.green('✓')} No common issues detected`)
        }
        console.log('')

        // Summary
        console.log(chalk.green.bold('Summary:'))
        console.log(`  ${chalk.cyan('Project:')} ${projectName}`)
        console.log(`  ${chalk.cyan('Status:')} ${deployedCount > 0 ? chalk.green('Deployed') : chalk.yellow('Not deployed')}`)
        console.log(`  ${chalk.cyan('Issues:')} ${issues.length > 0 ? chalk.red(`${issues.length} found`) : chalk.green('None')}`)
        console.log('')
        console.log(chalk.green('✓ Debug information collected'))
        console.log(chalk.gray('Use this information when reporting bugs or asking for help'))
        console.log(chalk.gray('Copy this output and share it with developers for faster troubleshooting'))
    }
}

export function updateBedrockWorkspaceTask(rootPath: string): TaskFunction {
    return async () => {
        console.clear()
        console.log(chalk.cyan.bold('Update Bedrock Workspace'))
        console.log(chalk.gray('─'.repeat(50)))

        try {
            console.log(chalk.blue('Checking for workspace updates...'))
            
            // Get the repository URL from git config or use default
            let repoUrl: string
            try {
                const remoteUrl = child_process.execSync('git config --get remote.origin.url', { 
                    cwd: rootPath, 
                    encoding: 'utf8' 
                }).trim()
                
                // Convert SSH URL to HTTPS if needed
                if (remoteUrl.startsWith('git@github.com:')) {
                    repoUrl = remoteUrl.replace('git@github.com:', 'https://github.com/').replace('.git', '')
                } else {
                    repoUrl = remoteUrl.replace('.git', '')
                }
            } catch (error) {
                // Fallback to default repository URL when git is not available
                console.log(chalk.yellow('⚠ Git repository not found, using default repository'))
                repoUrl = 'https://github.com/ackinari/VSCode-Workspace'
            }

            console.log(chalk.gray(`Repository: ${repoUrl}`))

            // Create temporary directory for comparison
            const tempDir = path.join(rootPath, '.temp-workspace-update')
            if (fs.existsSync(tempDir)) {
                rimraf.sync(tempDir)
            }

            console.log(chalk.blue('Downloading latest workspace files...'))
            
            try {
                // Use degit to download the latest version
                const degit = require('degit')
                const repoName = repoUrl.replace('https://github.com/', '')
                const emitter = degit(repoName)
                await emitter.clone(tempDir)
            } catch (error: any) {
                console.log(chalk.red('✗ Failed to download workspace files'))
                console.log(chalk.gray(`Error: ${error.message}`))
                return
            }

            // Compare files and find differences
            const filesToCompare = [
                '.prettierrc.json',
                'just.config.ts',
                'package.json',
                'tsconfig.json',
                '.vscode/build-tasks.ts',
                '.vscode/tasks.json',
                '.vscode/settings.json',
                'projects/template/tsconfig.json',
                'projects/template/.vscode/tasks.json',
                'projects/template/.vscode/settings.json'
            ]

            const allFiles: Array<{
                file: string
                status: 'modified' | 'new' | 'missing' | 'up-to-date'
                currentExists: boolean
                remoteExists: boolean
            }> = []

            for (const file of filesToCompare) {
                const currentPath = path.join(rootPath, file)
                const remotePath = path.join(tempDir, file)
                
                const currentExists = fs.existsSync(currentPath)
                const remoteExists = fs.existsSync(remotePath)

                if (!currentExists && remoteExists) {
                    allFiles.push({
                        file,
                        status: 'new',
                        currentExists: false,
                        remoteExists: true
                    })
                } else if (currentExists && !remoteExists) {
                    allFiles.push({
                        file,
                        status: 'missing',
                        currentExists: true,
                        remoteExists: false
                    })
                } else if (currentExists && remoteExists) {
                    // Compare file contents with normalization
                    let currentContent = fs.readFileSync(currentPath, 'utf8')
                    let remoteContent = fs.readFileSync(remotePath, 'utf8')
                    
                    // Normalize line endings and whitespace for comparison
                    const normalizeContent = (content: string): string => {
                        return content
                            .replace(/\r\n/g, '\n')  // Convert CRLF to LF
                            .replace(/\r/g, '\n')    // Convert CR to LF
                            .replace(/\s+$/gm, '')   // Remove trailing whitespace from each line
                            .replace(/\n+$/, '\n')   // Normalize ending newlines
                    }
                    
                    const normalizedCurrent = normalizeContent(currentContent)
                    const normalizedRemote = normalizeContent(remoteContent)
                    
                    if (normalizedCurrent !== normalizedRemote) {
                        allFiles.push({
                            file,
                            status: 'modified',
                            currentExists: true,
                            remoteExists: true
                        })
                    } else {
                        allFiles.push({
                            file,
                            status: 'up-to-date',
                            currentExists: true,
                            remoteExists: true
                        })
                    }
                } else {
                    // Both files don't exist - still show in list
                    allFiles.push({
                        file,
                        status: 'missing',
                        currentExists: false,
                        remoteExists: false
                    })
                }
            }

            // Clean up temp directory
            rimraf.sync(tempDir)

            // Count different files for summary
            const differentFiles = allFiles.filter(f => f.status !== 'up-to-date')
            
            if (differentFiles.length === 0) {
                console.log(chalk.green('✓ Workspace is up to date!'))
                console.log(chalk.gray('All files are current, but you can still force update if needed'))
            } else {
                console.log(chalk.yellow(`Found ${differentFiles.length} file(s) with differences`))
            }

            // Create choices for file selection - show ALL files
            const fileChoices = allFiles.map(file => {
                const statusColor = file.status === 'new' ? chalk.green : 
                                  file.status === 'missing' ? chalk.red : 
                                  file.status === 'modified' ? chalk.yellow :
                                  chalk.gray
                const statusText = file.status === 'new' ? 'NEW' : 
                                 file.status === 'missing' ? 'REMOVED' : 
                                 file.status === 'modified' ? 'MODIFIED' :
                                 'UP-TO-DATE'
                
                return {
                    name: `${file.file} ${statusColor(`[${statusText}]`)}`,
                    value: file.file,
                    checked: file.status !== 'up-to-date' // Check only files that are different
                }
            })

            const { selectedFiles } = await inquirer.prompt([
                {
                    type: 'checkbox',
                    name: 'selectedFiles',
                    message: 'Select files to update (use space to select, "a" to toggle all):',
                    choices: fileChoices
                }
            ])

            if (selectedFiles.length === 0) {
                console.log(chalk.gray('No files selected for update'))
                return
            }

            // Ask for confirmation to proceed
            const { proceedWithUpdate } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'proceedWithUpdate',
                    message: `Update ${selectedFiles.length} selected file(s)?`,
                    default: true
                }
            ])

            if (!proceedWithUpdate) {
                console.log(chalk.gray('Update cancelled'))
                return
            }

            // Show what will be updated vs kept
            const filesToUpdate = selectedFiles
            const filesToKeep = differentFiles
                .map(f => f.file)
                .filter(file => !filesToUpdate.includes(file))

            if (filesToUpdate.length > 0) {
                console.log(chalk.green(`\nFiles to be updated (${filesToUpdate.length}):`))
                filesToUpdate.forEach((file:any) => {
                    console.log(chalk.green(`  ✓ ${file}`))
                })
            }

            if (filesToKeep.length > 0) {
                console.log(chalk.red(`\nFiles to keep current version (${filesToKeep.length}):`))
                filesToKeep.forEach(file => {
                    console.log(chalk.red(`  ✗ ${file}`))
                })
            }

            // Download files again for update
            console.log(chalk.blue('\nDownloading latest files for update...'))
            if (fs.existsSync(tempDir)) {
                rimraf.sync(tempDir)
            }

            try {
                const degit = require('degit')
                const repoName = repoUrl.replace('https://github.com/', '')
                const emitter = degit(repoName)
                await emitter.clone(tempDir)
            } catch (error: any) {
                console.log(chalk.red('✗ Failed to download files for update'))
                return
            }

            // Update selected files
            let updatedCount = 0
            const errors: string[] = []

            for (const file of filesToUpdate) {
                try {
                    const remotePath = path.join(tempDir, file)
                    const currentPath = path.join(rootPath, file)

                    if (fs.existsSync(remotePath)) {
                        // Ensure directory exists
                        const dir = path.dirname(currentPath)
                        if (!fs.existsSync(dir)) {
                            fs.mkdirSync(dir, { recursive: true })
                        }

                        // Copy file
                        fs.copyFileSync(remotePath, currentPath)
                        console.log(chalk.green(`  ✓ Updated: ${file}`))
                        updatedCount++
                    } else {
                        // File was removed in remote, ask if should delete local
                        const { deleteFile } = await inquirer.prompt([
                            {
                                type: 'confirm',
                                name: 'deleteFile',
                                message: `File "${file}" was removed from repository. Delete local file?`,
                                default: false
                            }
                        ])

                        if (deleteFile && fs.existsSync(currentPath)) {
                            fs.unlinkSync(currentPath)
                            console.log(chalk.yellow(`  ✓ Deleted: ${file}`))
                            updatedCount++
                        } else {
                            console.log(chalk.gray(`  - Kept: ${file}`))
                        }
                    }
                } catch (error: any) {
                    const errorMsg = `Failed to update ${file}: ${error.message}`
                    console.log(chalk.red(`  ✗ ${errorMsg}`))
                    errors.push(errorMsg)
                }
            }

            // Clean up temp directory
            rimraf.sync(tempDir)

            console.log('')
            console.log(chalk.green(`✓ Workspace update completed!`))
            console.log(chalk.blue(`Updated files: ${updatedCount}`))
            console.log(chalk.red(`Kept current: ${filesToKeep.length}`))

            if (errors.length > 0) {
                console.log(chalk.red(`Errors: ${errors.length}`))
                errors.forEach(error => {
                    console.log(chalk.red(`  - ${error}`))
                })
            }


        } catch (error: any) {
            console.log(chalk.red('✗ Failed to update workspace:'), error.message)
        }
    }
}

export function importDevelopmentProjectsTask(rootPath: string): TaskFunction {
    return async () => {
        console.clear()
        console.log(chalk.cyan.bold('Import Development Projects'))
        console.log(chalk.gray('─'.repeat(50)))

        try {
            const projectsDir = path.join(rootPath, 'projects')
            if (!validateProjectsDirectory(projectsDir)) return

            // Get current workspace projects
            const currentProjects = getAvailableProjects(projectsDir)
            console.log(chalk.blue(`Current workspace projects: ${currentProjects.length}`))

            // Get development projects from Minecraft folders
            const developmentProjects = getDevelopmentProjects()
            if (developmentProjects.length === 0) {
                console.log(chalk.yellow('No development projects found in Minecraft folders'))
                console.log(chalk.gray('Deploy some projects first or check your Minecraft installation'))
                return
            }

            // Filter behavior packs only and exclude already imported projects
            const behaviorPacks = developmentProjects.filter(p => p.type === 'behavior')
            const availableForImport = behaviorPacks.filter(devProject => {
                // Extract project name from development project (remove _BP suffix and product info)
                const projectName = devProject.name.replace(/ \(.+\)$/, '').replace(/_BP$/, '')
                return !currentProjects.some(currentProject => 
                    currentProject === projectName || 
                    currentProject.replace(/\s+/g, '_') === projectName ||
                    projectName.includes(currentProject) ||
                    currentProject.includes(projectName)
                )
            })

            if (availableForImport.length === 0) {
                console.log(chalk.yellow('No new projects available for import'))
                console.log(chalk.gray('All development projects are already in the workspace'))
                return
            }

            // Create choices for inquirer - individual projects + "Import All" option
            const projectChoices: Array<{name: string, value: any}> = availableForImport.map(project => ({
                name: project.name,
                value: project
            }))

            // Add "Import All" option at the top
            projectChoices.unshift({
                name: 'Import All Projects',
                value: 'IMPORT_ALL'
            })

            const { selectedProject } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'selectedProject',
                    message: 'Select project to import (or import all):',
                    choices: projectChoices
                }
            ])

            let selectedProjects: any[]
            if (selectedProject === 'IMPORT_ALL') {
                selectedProjects = availableForImport
                console.log(chalk.cyan(`\nImporting all ${availableForImport.length} projects...`))
            } else {
                selectedProjects = [selectedProject]
                console.log(chalk.cyan(`\nImporting selected project...`))
            }

            console.log(chalk.yellow(`\nImporting ${selectedProjects.length} project(s)...`))

            let importedCount = 0
            const errors: string[] = []

            for (const devProject of selectedProjects) {
                try {
                    // Extract clean project name - remove product info and BP/RP suffixes
                    let projectName = devProject.name.replace(/ \(.+\)$/, '') // Remove (BedrockUWP) etc
                    projectName = projectName.replace(/[_\s]*(BP|RP|bp|rp)$/i, '') // Remove BP/RP suffixes
                    projectName = projectName.trim()
                    
                    const folderName = projectName.replace(/\s+/g, '_')
                    const newProjectPath = path.join(projectsDir, folderName)

                    console.log(chalk.blue(`\nImporting: ${projectName}`))

                    // Create project directory
                    if (!fs.existsSync(newProjectPath)) {
                        fs.mkdirSync(newProjectPath, { recursive: true })
                    }

                    // Import behavior pack
                    const behaviorPackPath = path.join(newProjectPath, 'behavior_pack')
                    if (fs.existsSync(devProject.path)) {
                        console.log(chalk.gray('  Copying behavior pack...'))
                        rushstack.FileSystem.copyFiles({
                            sourcePath: devProject.path,
                            destinationPath: behaviorPackPath,
                            preserveTimestamps: true,
                        })
                    }

                    // Find and import corresponding resource pack - improved detection for projects with spaces
                    const originalProjectName = devProject.name.replace(/ \(.+\)$/, '') // Keep original name with spaces
                    const resourcePackVariations = [
                        originalProjectName.replace(/[_\s]*(BP|bp)$/i, '_RP'), // Replace BP with RP
                        originalProjectName.replace(/[_\s]*(BP|bp)$/i, ' RP'), // Replace BP with RP (with space)
                        originalProjectName.replace(/[_\s]*(BP|bp)$/i, 'RP'),  // Replace BP with RP (no separator)
                        projectName + '_RP', // Clean name + _RP
                        projectName + ' RP', // Clean name + space RP
                        projectName + 'RP'   // Clean name + RP
                    ]

                    const resourceProject = developmentProjects.find(p => {
                        if (p.type !== 'resource') return false
                        
                        // Check if any variation matches
                        return resourcePackVariations.some(variation => 
                            p.name.includes(variation) || 
                            p.name.replace(/ \(.+\)$/, '').includes(variation.replace(/ \(.+\)$/, ''))
                        )
                    })

                    if (resourceProject && fs.existsSync(resourceProject.path)) {
                        console.log(chalk.gray('  Copying resource pack...'))
                        const resourcePackPath = path.join(newProjectPath, 'resource_pack')
                        rushstack.FileSystem.copyFiles({
                            sourcePath: resourceProject.path,
                            destinationPath: resourcePackPath,
                            preserveTimestamps: true,
                        })
                    } else {
                        // Ask user if they want to create a resource pack
                        const { createResourcePack } = await inquirer.prompt([
                            {
                                type: 'confirm',
                                name: 'createResourcePack',
                                message: `  Resource pack not found for "${projectName}". Create empty resource pack?`,
                                default: false
                            }
                        ])

                        if (createResourcePack) {
                            console.log(chalk.gray('  Creating empty resource pack...'))
                            const resourcePackPath = path.join(newProjectPath, 'resource_pack')
                            const templateResourcePath = path.join(rootPath, 'projects', 'template', 'resource_pack')
                            if (fs.existsSync(templateResourcePath)) {
                                rushstack.FileSystem.copyFiles({
                                    sourcePath: templateResourcePath,
                                    destinationPath: resourcePackPath,
                                    preserveTimestamps: true,
                                })
                            }
                        } else {
                            console.log(chalk.gray('  Skipped creating resource pack'))
                        }
                    }

                    // Move scripts folder to tscripts (keeping original format)
                    const scriptsPath = path.join(behaviorPackPath, 'scripts')
                    const tscriptsPath = path.join(newProjectPath, 'tscripts')

                    if (fs.existsSync(scriptsPath)) {
                        console.log(chalk.gray('  Moving scripts to tscripts (keeping original format)...'))
                        
                        // Copy scripts folder to tscripts maintaining original format
                        rushstack.FileSystem.copyFiles({
                            sourcePath: scriptsPath,
                            destinationPath: tscriptsPath,
                            preserveTimestamps: true,
                        })

                        // Remove the original scripts folder from behavior pack
                        rimraf.sync(scriptsPath)
                        console.log(chalk.gray('  Removed original scripts folder'))
                    } else {
                        // Create basic main.js if no scripts found
                        console.log(chalk.gray('  Creating basic main.js...'))
                        if (!fs.existsSync(tscriptsPath)) {
                            fs.mkdirSync(tscriptsPath, { recursive: true })
                        }
                        const mainJsContent = `// ${projectName} - Imported from development folder
// Add your JavaScript code here

import { world, system } from '@minecraft/server';

world.beforeEvents.chatSend.subscribe((eventData) => {
    // Example: Handle chat messages
    console.log(\`\${eventData.sender.name}: \${eventData.message}\`);
});

console.log('${projectName} loaded successfully!');
`
                        fs.writeFileSync(path.join(tscriptsPath, 'main.js'), mainJsContent)
                    }

                    // Copy template configuration files
                    const templatePath = path.join(rootPath, 'projects', 'template')
                    const configFiles = ['tsconfig.json', '.vscode']
                    
                    configFiles.forEach(configFile => {
                        const srcPath = path.join(templatePath, configFile)
                        const destPath = path.join(newProjectPath, configFile)
                        
                        if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
                            if (fs.statSync(srcPath).isDirectory()) {
                                rushstack.FileSystem.copyFiles({
                                    sourcePath: srcPath,
                                    destinationPath: destPath,
                                    preserveTimestamps: true,
                                })
                            } else {
                                fs.copyFileSync(srcPath, destPath)
                            }
                        }
                    })

                    // Update project name in manifests and language files (keeping original UUIDs)
                    // console.log(chalk.gray('  Keeping original UUIDs...'))
                    updateProjectName(newProjectPath, projectName)

                    console.log(chalk.green(`  ✓ Successfully imported: ${projectName}`))
                    importedCount++

                } catch (error: any) {
                    const errorMsg = `Failed to import ${devProject.name}: ${error.message}`
                    console.log(chalk.red(`  ✗ ${errorMsg}`))
                    errors.push(errorMsg)
                }
            }

            console.log('')
            console.log(chalk.green(`✓ Import completed!`))
            console.log(chalk.blue(`Successfully imported: ${importedCount} project(s)`))
            
            if (errors.length > 0) {
                console.log(chalk.red(`Failed imports: ${errors.length}`))
                errors.forEach(error => {
                    console.log(chalk.red(`  - ${error}`))
                })
            }


        } catch (error: any) {
            console.log(chalk.red('✗ Failed to import development projects:'), error.message)
        }
    }
}
