import * as child_process from 'child_process'
import chalk from "chalk"

export function openInVSCode(projectPath: string): void {
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