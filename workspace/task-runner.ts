import path, { join, resolve, basename } from "path";
import { build } from "bun"
import { mcaddonTask, updateWorkspaceTask, analyzeProjectTask, backupProjectTask, updateVersionTask, generateUuidsTask, createSymlink, newProjectTask, openProjectTask, listProjectsTask, cloneProjectTask, renameProjectTask, deleteProjectTask, listDevelopmentProjectsTask, importDevelopmentProjectsTask, openMinecraftFolderTask, openWorkspaceTask, updateBedrockWorkspaceTask } from "./build-tasks";

console.clear()

//* = = = workspace configs = = =
type Config = {
    projectName: string,
    paths: {
        root: string,
        project: string,
        dist: string,
        // tsEntry: string,
        // jsOut: string,
        behaviorPack: string,
        resourcePack: string,
        packageFile: string,
    }
}
function getProjectConfig(): Config | undefined {
    const project_cwd = process.env.REAL_CWD
    if (!project_cwd) return
    const cwd = process.cwd()
    const PROJECT_NAME = project_cwd?.includes('projects') ? path.basename(project_cwd) : "root"
    
    const joinProject = (...args: string[]) => PROJECT_NAME == 'root' ? 'undefined' : path.resolve(cwd, 'projects', PROJECT_NAME, ...args)
    
    return {
        projectName: PROJECT_NAME,
        paths: {
            root: cwd,
            project: project_cwd,
            dist: joinProject('dist'),
            // tsEntry: joinProject('tscripts', 'main.ts'),
            // jsOut: joinProject('dist', 'scripts', 'main.js'),
            behaviorPack: joinProject('behavior_pack'),
            resourcePack: joinProject('resource_pack'),
            packageFile: joinProject('dist', `${PROJECT_NAME}.mcaddon`),
        },
    }
}

//* = = = task configs = = =
const TASKS: Record<string, (config: Config | undefined) => void> = {
    'debug': (config) => {console.log(`running debug:\n${JSON.stringify(config, null, 2)}`)},
    // 'debug': () => debugTask(config.paths.project),

    // 'createMcaddonFile': (
    //     options = {
    //         copyToBehaviorPacks: [config.paths.behaviorPack],
    //         copyToResourcePacks: [config.paths.resourcePack],
    //         outputFile: config.paths.packageFile,
    //     }
    // ) => mcaddonTask(options),

    // 'mcaddon': () => conditionalTypeScriptTask(config.paths.project, series('createMcaddonFile'),series('createMcaddonFile')),

    // project management
    'update-workspace': (config) => updateWorkspaceTask(config.paths.project, config.paths.root),
    'analyze': (config) => analyzeProjectTask(config.paths.project),
    'backup': (config) => backupProjectTask(config.paths.project, config.paths.root),
    'update-version': (config) => updateVersionTask(config.paths.project),
    'generate-uuids': (config) => generateUuidsTask(config.paths.project),
    'create-symlink': (config) => createSymlink(config.paths.project, config.projectName),

    // workspace
    'new-project': (config) => newProjectTask(config.paths.root),
    'open-project': (config) => openProjectTask(config.paths.root),
    'list-projects': (config) => listProjectsTask(config.paths.root),
    'clone-project': (config) => cloneProjectTask(config.paths.root),
    'rename-project': (config) => renameProjectTask(config.paths.root),
    'delete-project': (config) => deleteProjectTask(config.paths.root),

    'list-development-projects': (config) => listDevelopmentProjectsTask(),
    'import-development-projects': (config) => importDevelopmentProjectsTask(config.paths.root),

    'open-mc-folder': (config) => openMinecraftFolderTask(),
    'open-workspace': (config) => openWorkspaceTask(config.paths.root),

    'update-bedrock-workspace': (config) => updateBedrockWorkspaceTask(config.paths.root),
}

//* = = = run task = = =
function runTask() {
    const config = getProjectConfig()
    const taskId = Bun.argv[2]
    TASKS[taskId](config)
}

runTask()