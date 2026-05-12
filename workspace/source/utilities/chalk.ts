import chalk from "chalk"

export const task = {
    header(text: string) {
        console.log(chalk.cyan.bold(text))
        console.log(chalk.gray('─'.repeat(50)))
    },

    error(text: string) {
        console.log(chalk.red("✗", text))
    },
    warn(text: string) {
        console.log(chalk.red("⚠️", text))
    },
    inProgress(text: string) {
        console.log(chalk.yellow(text))
    },
    success(text: string) {
        console.log(chalk.green("✓", text))
    },
    info(text: string) {
        console.log(chalk.gray(chalk.italic(text)))
    },
}