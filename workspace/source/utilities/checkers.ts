import { ProjectConfig } from "../../task-runner";
import fs from "fs"
import path from "path";
import { getProjectsFolderPath } from "./paths";


export function getAvailableProjects(config: ProjectConfig): string[] {
    const projectsPath = getProjectsFolderPath(config)

    return fs.readdirSync(projectsPath).filter((item: string) => {
        const itemPath = path.join(projectsPath, item)
        return fs.statSync(itemPath).isDirectory() && item !== 'template'
    })
}

//* file naming validator
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i
const INVALID_CHARS = /[<>:"/\\|?*\x00-\x1F]/ // inclui chars de controle

export function validateFileName(input: string, text: string = 'Project name'): true | string {
    const name = input.trim()

    if (!name) {
        return `${text} cannot be empty`
    }

    if (!isNaN(Number(name[0]))) {
        return `${text} cannot start with numbers`
    }

    if (INVALID_CHARS.test(name)) {
        return `${text} contains invalid characters (<>:"/\\|?*)`
    }

    if (name.endsWith(' ') || name.endsWith('.')) {
        return `${text} cannot end with a space or a dot`
    }

    if (WINDOWS_RESERVED_NAMES.test(name)) {
        return 'This name is reserved in Windows (CON, PRN, AUX, etc.)'
    }

    if (name.length > 255) {
        return `${text} is too long (max 255 characters)`
    }

    return true
}
export function sanitazeFileName(input: string) {
    return input.replace(/['"]/g, '').trim()
}