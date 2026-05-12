import { ProjectConfig } from "../../task-runner";
import { getAvailableProjects } from "./checkers";

interface InquirerChoice {
    name: string
    value: string
}

export function getProjectsChoices(config: ProjectConfig): InquirerChoice[] {
    const projectList: string[] = getAvailableProjects(config)

    return projectList.map((project: string) => ({
        name: project,
        value: project
    }))
}