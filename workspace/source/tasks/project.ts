import inquirer from "inquirer"
import path from "path"
import fs from "fs"
import { ProjectConfig } from "../../task-runner"
import { updateProjectName, updateProjectDescription, updateManifestsUUIDs } from "../utilities/updaters"
import { generateManifestUUIDs } from "../utilities/UUID"
import { getProjectsFolderPath, getTemplateFilePath } from "../utilities/paths"
import { sanitazeFileName, validateFileName } from "../utilities/checkers"
import { openInVSCode } from "../utilities/vsCode"
import { task } from "../utilities/chalk"
import { getProjectsChoices } from "../utilities/inquirer"

//* = = = project related = = =
function newProjectFromTemplate(config: ProjectConfig, name: string, description: string): string | undefined {
    // checking if project already exists
    const projectPath = path.join(getProjectsFolderPath(config), name)

    if (fs.existsSync(projectPath)) {
        task.error(`Failed to create project: Project "${name}" already exists`)
        return
    }

    // copying template project
    const templatePath = getTemplateFilePath(config)

    fs.cp(templatePath, projectPath, {preserveTimestamps: true, recursive: true}, (error) => {
        if (error) {
            task.error(`Failed to create project: ${error?.message}`)
            return
        }
    })

    // updating project properties
    const uuids = generateManifestUUIDs()
    
    updateManifestsUUIDs(config, uuids.behaviorHeaderUuid, uuids.behaviorModuleUuid, uuids.resourceHeaderUuid)
    updateProjectName(config, name)
    updateProjectDescription(config, description)

    return projectPath
}
export function newProjectTask(config: ProjectConfig) {
    task.header('Create New Project')

    try {
        inquirer.prompt([
            {
                type: 'input',
                name: 'projectName',
                message: 'Enter project name:',
                validate: (input: string) => validateFileName(input),
                filter: (input: string) => sanitazeFileName(input)
            },
            {
                type: 'input',
                name: 'projectDescription',
                message: 'Enter project description (optional):',
                default: 'A Minecraft Bedrock add-on',
                filter: (input: string) => sanitazeFileName(input)
            }
        ]).then(answers => {
            task.inProgress(`Creating project "${answers.projectName}"...`)
            const projectPath = newProjectFromTemplate(config, answers.projectName, answers.projectDescription)
            if (!projectPath) return

            task.success(`Project "${answers.projectName}" created successfully!`)
            task.info(`Location: ${projectPath}`)
    
            inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'openVSCode',
                    message: 'Open this project in VS Code?',
                    default: true
                }
            ]).then(answers => {
                answers.openVSCode ? openInVSCode(projectPath) : task.info('Skipped opening in VS Code.')
            })
        })

    } catch (error: any) {
        task.error(`Failed to create project: ${error.message}`)
    }
}

export function cloneProjectTask(config: ProjectConfig) {
    task.header('Clone Project')

    try {
        inquirer.prompt([
            {
                type: 'list',
                name: 'projectToClone',
                message: 'Select a project to clone:',
                choices: getProjectsChoices(config)
            },
            {
                type: 'input',
                name: 'newProjectName',
                message: 'Enter the new project name:',
                validate: (input: string) => validateFileName(input),
                filter: (input: string) => sanitazeFileName(input)
            }
        ]).then(answers => {
            const projectsFolderPath = getProjectsFolderPath(config)
            const sourcePath = path.join(projectsFolderPath, answers.projectToClone)
            const newProjectPath = path.join(projectsFolderPath, answers.newProjectName)

            if (fs.existsSync(newProjectPath)) {
                task.error(`Failed to clone project: Project "${answers.newProjectName}" already exists`)
                return
            }

            task.inProgress(`Cloning "${answers.projectToClone}"...`)
            fs.cpSync(sourcePath, newProjectPath, {recursive: true, preserveTimestamps: true})

            const uuids = generateManifestUUIDs()
            updateManifestsUUIDs(config, uuids.behaviorHeaderUuid, uuids.behaviorModuleUuid, uuids.resourceHeaderUuid)
            updateProjectName(config, answers.newProjectName)

            task.success(`Project "${answers.newProjectName}" cloned successfully!`)
            task.info(`Source: ${answers.projectToClone}`)
            task.info(`Location: ${newProjectPath}`)
        })

    } catch (error: any) {
        task.error(`Failed to clone project: ${error.message}`)
    }
}

export function deleteProjectTask(config: ProjectConfig) {
    task.header('Delete Project')

    try {
        inquirer.prompt([
            {
                type: 'list',
                name: 'projectToDelete',
                message: 'Select a project to delete:',
                choices: getProjectsChoices(config)
            }
        ]).then(answers => {
            const projectPath = path.join(getProjectsFolderPath(config), answers.projectToDelete)

            task.warn(`You are about to delete "${answers.projectToDelete}"`)
            task.info(`Location: ${projectPath}`)

            inquirer.prompt([
                {
                    type: 'input',
                    name: 'confirmName',
                    message: 'Type the project name to confirm:',
                    validate: (input: string) => input === answers.projectToDelete || 'Project name does not match'
                }
            ]).then(_answers => {
                //! pode dar erro aqui, verificar se ele realmente so deleta se confirmar o nome
                task.inProgress(`Deleting "${answers.projectToDelete}"...`)
                fs.rmSync(projectPath, {recursive: true, force: true})
    
                task.success(`Project "${answers.projectToDelete}" deleted successfully`)
            })

        })
    } catch (error: any) {
        task.error(`Failed to delete project: ${error.message}`)
    }
}

export function renameProjectTask(config: ProjectConfig) {
    task.header('Rename Project')

    try {
        inquirer.prompt([
            {
                type: 'list',
                name: 'projectToRename',
                message: 'Select a project to rename:',
                choices: getProjectsChoices(config)
            },
            {
                type: 'input',
                name: 'newProjectName',
                message: 'Enter new name:',
                validate: (input: string) => validateFileName(input),
                filter: (input: string) => sanitazeFileName(input)
            }
        ]).then(answers => {
            const projectsPath = getProjectsFolderPath(config)
            const oldPath = path.join(projectsPath, answers.projectToRename)
            const newPath = path.join(projectsPath, answers.newProjectName)

            if (fs.existsSync(newPath)) {
                task.error(`Failed to rename project: Project "${answers.newProjectName}" already exists`)
                return
            }

            task.inProgress(`Renaming "${answers.projectToRename}" to "${answers.newProjectName}"...`)
            fs.renameSync(oldPath, newPath)

            updateProjectName(config, answers.newProjectName)

            task.success(`Project renamed successfully!`)
            task.info(`Location: ${newPath}`)
        })
    } catch (error: any) {
        task.error(`Failed to rename project: ${error.message}`)
    }
}

export function openProjectTask(config: ProjectConfig) {
    task.header('Open Project')

    try {
        inquirer.prompt([
            {
                type: 'list',
                name: 'projectName',
                message: 'Select project to open in VS Code:',
                choices: getProjectsChoices(config)
            }
        ]).then(({ projectName }) => {
            const projectPath = path.join(getProjectsFolderPath(config), projectName)

            task.inProgress(`Opening "${projectName}"...`)
            openInVSCode(projectPath)
            task.success(`Project "${projectName}" opened!`)
        })
    } catch (error: any) {
        task.error(`Failed to open project: ${error.message}`)
    }
}