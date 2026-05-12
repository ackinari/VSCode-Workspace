import path from "path";
import { ProjectConfig } from "../../task-runner";

//* project
export function getLangFilePaths(config: ProjectConfig): string[] {
    return [
        path.join(config.paths.behaviorPack, 'texts', 'en_US.lang'),
        path.join(config.paths.resourcePack, 'texts', 'en_US.lang'),
    ]
}
export function getManifestFilePaths(config: ProjectConfig): string[] {
    return [
        path.join(config.paths.behaviorPack, 'manifest.json'),
        path.join(config.paths.resourcePack, 'manifest.json'),
    ]
}

//* workspace
export function getProjectsFolderPath(config: ProjectConfig): string {
    return path.join(config.paths.root, 'projects')
}

export function getTemplateFilePath(config: ProjectConfig): string {
    return path.join(config.paths.root, 'templates', 'template')
}