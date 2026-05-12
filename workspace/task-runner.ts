import path from 'path'
import { cloneProjectTask, newProjectTask } from './source/tasks/project'
import chalk from 'chalk'

//* = = = workspace configs = = =
export type ProjectConfig = {
    projectName: string
    paths: {
        root: string
        project: string
        dist: string
        behaviorPack: string
        resourcePack: string
        packageFile: string
    }
}
function getProjectConfig(): ProjectConfig {
    const project_cwd = process.env.REAL_CWD
    const cwd = process.cwd()
    const PROJECT_NAME = project_cwd?.includes('projects') ? path.basename(project_cwd) : 'root'

    const joinProject = (...args: string[]) => (PROJECT_NAME == 'root' ? 'undefined' : path.resolve(cwd, 'projects', PROJECT_NAME, ...args))

    return {
        projectName: PROJECT_NAME,
        paths: {
            root: cwd,
            project: joinProject(),
            dist: joinProject('dist'),
            behaviorPack: joinProject('behavior_pack'),
            resourcePack: joinProject('resource_pack'),
            packageFile: joinProject('dist', `${PROJECT_NAME}.mcaddon`),
        },
    }
}

//* = = = task configs = = =
const TASKS: Record<string, (config: ProjectConfig) => void> = {
    'debug': (config) => console.log(`debug task:\n${JSON.stringify(config, null, 2)}`),
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
    // 'update-workspace': (config) => updateWorkspaceTask(config.paths.project, config.paths.root),
    // 'analyze': (config) => analyzeProjectTask(config.paths.project),
    // 'backup': (config) => backupProjectTask(config.paths.project, config.paths.root),
    // 'update-version': (config) => updateVersionTask(config.paths.project),
    // 'generate-uuids': (config) => generateUuidsTask(config.paths.project),
    // 'create-symlink': (config) => createSymlink(config.paths.project, config.projectName),

    // workspace
    'new-project': (config) => newProjectTask(config),
    // 'open-project': (config) => openProjectTask(config.paths.root),
    // 'list-projects': (config) => listProjectsTask(config.paths.root),
    'clone-project': (config) => cloneProjectTask(config),
    // 'rename-project': (config) => renameProjectTask(config.paths.root),
    // 'delete-project': (config) => deleteProjectTask(config.paths.root),

    // 'list-development-projects': (config) => listDevelopmentProjectsTask(),
    // 'import-development-projects': (config) => importDevelopmentProjectsTask(config.paths.root),

    // 'open-mc-folder': (config) => openMinecraftFolderTask(),
    // 'open-workspace': (config) => openWorkspaceTask(config.paths.root),

    // 'update-bedrock-workspace': (config) => updateBedrockWorkspaceTask(config.paths.root),
}

//* = = = run task = = =
function runTask() {
    console.clear()

    const config = getProjectConfig()
    const taskId = Bun.argv[2]
    typeof TASKS[taskId] == 'function' ? TASKS[taskId](config) : console.log(chalk.red("✗ No tasks called:"), taskId)
}

runTask()
// bun run task new-project