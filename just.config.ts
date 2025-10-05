import { argv, parallel, series, task, tscTask, TscTaskOptions } from "just-scripts";
import path from "path";

import {
  STANDARD_CLEAN_PATHS,
  bundleTask,
  cleanTask,
  cleanCollateralTask,
  copyTask,
  mcaddonTask,
  watchTask,
  coreLint,
  newProjectTask,
  updateWorkspaceTask,
  analyzeProjectTask,
  backupProjectTask,
  updateVersionTask,
  generateUuidsTask,
  listProjectsTask,
  openMinecraftFolderTask,
  cloneProjectTask,
  deleteProjectTask,
  renameProjectTask,
  openProjectTask,
  listDevelopmentProjectsTask,
  openWorkspaceTask,
  debugTask,
} from "./.vscode/build-tasks";

//§e = = = = = = = = default configs = = = = = = = = 

const projectDir = process.env.REAL_CWD || process.cwd();
const projectName = path.basename(projectDir);

let actualProjectName = projectName;

if (process.env.INIT_CWD && process.env.INIT_CWD.includes('projects')) {
  actualProjectName = path.basename(process.env.INIT_CWD);
} else if (process.env.REAL_CWD && process.env.REAL_CWD.includes('projects')) {
  actualProjectName = path.basename(process.env.REAL_CWD);
} else if (projectDir.includes('projects') && projectDir !== path.resolve(__dirname)) {
  actualProjectName = path.basename(projectDir);
}

const paths = {
  root: path.resolve(__dirname),
  project: path.resolve(__dirname, "projects", actualProjectName),
  projectDist: path.resolve(__dirname, "projects", actualProjectName, "dist"),
};

export const config = {
  projectName: actualProjectName,
  project: paths.project,
  entry: path.join(paths.project, "tscripts/main.ts"),
  outFile: path.join(paths.projectDist, "scripts/main.js"),
  behaviorPack: path.join(paths.project, "behavior_pack"),
  resourcePack: path.join(paths.project, "resource_pack"),
  packageFile: path.join(paths.projectDist, `${actualProjectName}.mcaddon`),
};

//§e = = = = = = = = task configs = = = = = = = = 

const bundleTaskOptions = {
  entryPoint: config.entry,
  external: ["@minecraft/server", "@minecraft/server-ui"],
  outfile: config.outFile,
  minifyWhitespace: true,
};

const copyTaskOptions = {
  copyToBehaviorPacks: [config.behaviorPack],
  copyToResourcePacks: [config.resourcePack],
};

const typescriptOptions: TscTaskOptions = {
  outDir: path.join(config.behaviorPack, "scripts"),
  rootDir: path.join(config.project, "tscripts"),
  project: path.join(config.project, "tsconfig.json"),
};

const mcaddonTaskOptions = {
  copyToBehaviorPacks: [config.behaviorPack],
  copyToResourcePacks: [config.resourcePack],
  outputFile: config.packageFile,
};

const watchOptions = [
  `${config.project}/tscripts/**/*.{ts,js}`,
  `${config.behaviorPack}/**/*.{json,lang,tga,ogg,png}`,
  `${config.resourcePack}/**/*.{json,lang,tga,ogg,png}`,
];

//§e = = = = = = = = tasks list = = = = = = = = 

const TASKS = {
  DEBUG: "debug",
  LINT: "lint",
  TYPESCRIPT: "typescript",
  BUNDLE: "bundle",
  BUILD: "build",
  CLEAN_LOCAL: "clean-local",
  CLEAN_COLLATERAL: "clean-collateral",
  CLEAN: "clean",
  COPY: "copyArtifacts",
  PACKAGE: "package",
  DEPLOY: "local-deploy",
  CREATE_MCADDON: "createMcaddonFile",
  MCADDON: "mcaddon",
  NEW_PROJECT: "new-project",
  UPDATE_WORKSPACE: "update-workspace",
  ANALYZE: "analyze",
  BACKUP: "backup",
  UPDATE_VERSION: "update-version",
  GENERATE_UUIDS: "generate-uuids",
  LIST_PROJECTS: "list-projects",
  OPEN_MC_FOLDER: "open-mc-folder",
  CLONE_PROJECT: "clone-project",
  DELETE_PROJECT: "delete-project",
  RENAME_PROJECT: "rename-project",
  OPEN_PROJECT: "open-project",
  LIST_DEVELOPMENT_PROJECTS: "list-development-projects",
  OPEN_WORKSPACE: "open-workspace",
} as const;

//§e = = = = = = = = tasks = = = = = = = = 

task(TASKS.DEBUG, debugTask(paths.project));

task(TASKS.LINT, coreLint(["scripts/**/*.ts"], argv().fix));

task(TASKS.TYPESCRIPT, tscTask(typescriptOptions));
task(TASKS.BUNDLE, bundleTask(bundleTaskOptions));
task(TASKS.BUILD, series(TASKS.TYPESCRIPT, TASKS.BUNDLE));

task(TASKS.CLEAN_LOCAL, cleanTask([typescriptOptions.outDir as string]));
task(TASKS.CLEAN_COLLATERAL, cleanCollateralTask(STANDARD_CLEAN_PATHS, config.projectName));
task(TASKS.CLEAN, parallel(TASKS.CLEAN_LOCAL, TASKS.CLEAN_COLLATERAL));

task(TASKS.COPY, copyTask(copyTaskOptions, config.projectName));
task(TASKS.PACKAGE, series(TASKS.CLEAN_COLLATERAL, TASKS.COPY));

task(TASKS.DEPLOY, watchTask(watchOptions, series(TASKS.CLEAN_LOCAL, TASKS.TYPESCRIPT, TASKS.PACKAGE) as any));

task(TASKS.CREATE_MCADDON, mcaddonTask(mcaddonTaskOptions));
task(TASKS.MCADDON, series(TASKS.CLEAN_LOCAL, TASKS.TYPESCRIPT, TASKS.PACKAGE, TASKS.CREATE_MCADDON));

task(TASKS.NEW_PROJECT, newProjectTask(paths.root));

// Project management tasks
task(TASKS.UPDATE_WORKSPACE, updateWorkspaceTask(paths.project, paths.root));
task(TASKS.ANALYZE, analyzeProjectTask(paths.project));
task(TASKS.BACKUP, backupProjectTask(paths.project, paths.root));
task(TASKS.UPDATE_VERSION, updateVersionTask(paths.project));
task(TASKS.GENERATE_UUIDS, generateUuidsTask(paths.project));

// Workspace tasks
task(TASKS.LIST_PROJECTS, listProjectsTask(paths.root));
task(TASKS.OPEN_MC_FOLDER, openMinecraftFolderTask());
task(TASKS.CLONE_PROJECT, cloneProjectTask(paths.root));
task(TASKS.DELETE_PROJECT, deleteProjectTask(paths.root));
task(TASKS.RENAME_PROJECT, renameProjectTask(paths.root));
task(TASKS.OPEN_PROJECT, openProjectTask(paths.root));
task(TASKS.LIST_DEVELOPMENT_PROJECTS, listDevelopmentProjectsTask());
task(TASKS.OPEN_WORKSPACE, openWorkspaceTask(paths.root));
