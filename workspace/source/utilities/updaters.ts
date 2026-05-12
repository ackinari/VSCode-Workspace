import path from "path"
import fs from "fs"
import { ProjectConfig } from "../../task-runner"
import { ManifestSchema } from "../schemas/types/manifest"
import { getLangFilePaths, getManifestFilePaths } from "./paths"

//* = = = utilities = = =
export function updateTextFile(filePath: string, updater: (content: string) => string): void {
    if (!fs.existsSync(filePath)) return

    const content = fs.readFileSync(filePath, 'utf8')
    const updatedFile = updater(content)

    updatedFile != content && fs.writeFileSync(filePath, updatedFile)
}
export function updateJsonFile<T>(filePath: string, updater: (data: T) => void): void {
    if (!fs.existsSync(filePath)) return

    const data: T = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    updater(data)
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4))
}

//* manifest
export function updateManifestUUIDs(manifestPath: string, headerUuid: string, moduleUuid: string, dependencyUuid?: string): void {
    updateJsonFile<ManifestSchema>(manifestPath, manifest => {
        manifest.header.uuid = headerUuid
        manifest.modules?.forEach(m => m.uuid = moduleUuid)
        dependencyUuid && manifest.dependencies?.forEach(d => {d.uuid = dependencyUuid})
    })
}
export function updateManifestsUUIDs(config: ProjectConfig, headerUuid: string, moduleUuid: string, dependencyUuid?: string): void {
    getManifestFilePaths(config).forEach(filePath => {
        updateManifestUUIDs(filePath, headerUuid, moduleUuid, dependencyUuid)
    })
}

//* language
export function updateLangKey(config: ProjectConfig, key: string, value: string): void {
    const regex = new RegExp(`${key}=.*`, 'g')

    for (const filePath of getLangFilePaths(config)) {
        updateTextFile(filePath, content =>
            content.replace(regex, `${key}=${value}`)
        )
    }
}
export function updateProjectName(config: ProjectConfig, newName: string): void {
    updateLangKey(config, 'pack.name', newName)
}
export function updateProjectDescription(config: ProjectConfig, newDescription: string): void {
    updateLangKey(config, 'pack.description', newDescription)
}