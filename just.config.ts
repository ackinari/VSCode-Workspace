import { parallel, series, task, tscTask, TscTaskOptions } from 'just-scripts'
import path from 'path'

import {
    analyzeProjectTask,
    backupProjectTask,
    cleanCollateralTask,
    cleanTask,
    cloneProjectTask,
    conditionalTypeScriptTask,
    copyTask,
    createSymlink,
    debugTask,
    deleteProjectTask,
    generateUuidsTask,
    importDevelopmentProjectsTask,
    listDevelopmentProjectsTask,
    listProjectsTask,
    mcaddonTask,
    newProjectTask,
    openMinecraftFolderTask,
    openProjectTask,
    openWorkspaceTask,
    renameProjectTask,
    STANDARD_CLEAN_PATHS,
    updateBedrockWorkspaceTask,
    updateVersionTask,
    updateWorkspaceTask,
    watchTask,
} from './.vscode/build-tasks'

//§e = = = = = = = = default configs = = = = = = = =

const ROOT = path.resolve(__dirname)

const ENV = {
    REAL_CWD: process.env.REAL_CWD,
    INIT_CWD: process.env.INIT_CWD,
    CWD: process.cwd(),
}

const BASE_PROJECT_DIR =
    ENV.INIT_CWD?.includes('projects') ? ENV.INIT_CWD :
    ENV.REAL_CWD?.includes('projects') ? ENV.REAL_CWD :
    ENV.CWD?.includes('projects') && ENV.CWD !== ROOT ? ENV.CWD :
    ENV.CWD

const PROJECT_NAME = path.basename(BASE_PROJECT_DIR)

const joinRoot = (...args: string[]) => path.resolve(ROOT, ...args)
const joinProject = (...args: string[]) => path.resolve(ROOT, 'projects', PROJECT_NAME, ...args)

export const config = {
    env: ENV,
    root: ROOT,
    projectName: PROJECT_NAME,
    paths: {
        root: ROOT,
        project: joinProject(),
        dist: joinProject('dist'),
        tsEntry: joinProject('tscripts', 'main.ts'),
        jsOut: joinProject('dist', 'scripts', 'main.js'),
        behaviorPack: joinProject('behavior_pack'),
        resourcePack: joinProject('resource_pack'),
        packageFile: joinProject('dist', `${PROJECT_NAME}.mcaddon`),
    },
}

//§e = = = = = = = = task configs = = = = = = = =

const TASK_LIST: Record<string, Function> = {
    'debug': () => debugTask(config.paths.project),

    'typescript': (
        options = {
            outDir: path.join(config.paths.behaviorPack, 'scripts'),
            rootDir: path.join(config.paths.project, 'tscripts'),
            project: path.join(config.paths.project, 'tsconfig.json'),
        } as TscTaskOptions
    ) => tscTask(options),

    'clean-local': (
        dirs = [path.join(config.paths.behaviorPack, 'scripts')]
    ) => cleanTask(dirs),

    'clean-collateral': () => cleanCollateralTask(STANDARD_CLEAN_PATHS, config.projectName),
    'clean': () => parallel('clean-local', 'clean-collateral'),

    'copyArtifacts': (
        options = {
            copyToBehaviorPacks: [config.paths.behaviorPack],
            copyToResourcePacks: [config.paths.resourcePack],
        }
    ) => copyTask(options, config.projectName),

    'build': () => series('clean-collateral', 'copyArtifacts'),

    'local-deploy': (
        globs = [
            `${config.paths.project}/tscripts/**/*.{ts,js}`,
            `${config.paths.behaviorPack}/**/*.{json,png,js}`,
            `${config.paths.resourcePack}/**/*.{json,lang,tga,ogg,png,material}`,
        ]
    ) => conditionalTypeScriptTask(
        config.paths.project,
        watchTask(globs, series('clean-local', 'typescript', 'build') as any),
        watchTask(globs, series('build') as any)
    ),

    'createMcaddonFile': (
        options = {
            copyToBehaviorPacks: [config.paths.behaviorPack],
            copyToResourcePacks: [config.paths.resourcePack],
            outputFile: config.paths.packageFile,
        }
    ) => mcaddonTask(options),

    'mcaddon': () => conditionalTypeScriptTask(
        config.paths.project,
        series('clean-local', 'typescript', 'build', 'createMcaddonFile'),
        series('build', 'createMcaddonFile')
    ),

    // project management
    'update-workspace': () => updateWorkspaceTask(config.paths.project, config.paths.root),
    'update-bedrock-workspace': () => updateBedrockWorkspaceTask(config.paths.root),
    'analyze': () => analyzeProjectTask(config.paths.project),
    'backup': () => backupProjectTask(config.paths.project, config.paths.root),
    'update-version': () => updateVersionTask(config.paths.project),
    'generate-uuids': () => generateUuidsTask(config.paths.project),
    'create-symlink': () => createSymlink(config.paths.project, config.projectName),

    // workspace
    'new-project': () => newProjectTask(config.paths.root),
    'open-project': () => openProjectTask(config.paths.root),
    'list-projects': () => listProjectsTask(config.paths.root),
    'clone-project': () => cloneProjectTask(config.paths.root),
    'rename-project': () => renameProjectTask(config.paths.root),
    'delete-project': () => deleteProjectTask(config.paths.root),

    'list-development-projects': () => listDevelopmentProjectsTask(),
    'import-development-projects': () => importDevelopmentProjectsTask(config.paths.root),

    'open-mc-folder': () => openMinecraftFolderTask(),
    'open-workspace': () => openWorkspaceTask(config.paths.root),
} as const

for (const [name, _function] of Object.entries(TASK_LIST)) {
    task(name, _function())
}
