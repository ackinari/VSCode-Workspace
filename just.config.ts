import { argv, parallel, series, task, tscTask, TscTaskOptions } from "just-scripts";
import path from "path";

import {
  STANDARD_CLEAN_PATHS,
  bundleTask,
  cleanTask,
  cleanCollateralTask,
  copyTask,
  mcaddonTask,
  setupEnvironment,
  watchTask,
  coreLint,
} from "./.vscode/build-tasks";

//§e = = = = = = = = default configs = = = = = = = = 

const projectDir = process.env.REAL_CWD || process.cwd();
const projectName = path.basename(projectDir);

const paths = {
  root: path.resolve(__dirname),
  dist: path.resolve(__dirname, "dist"),
  project: path.resolve(__dirname, "projects", projectName),
};

export const config = {
  projectName,
  project: paths.project, // <- adiciona aqui
  entry: path.join(paths.root, "tscripts/main.ts"),
  outFile: path.join(paths.dist, "scripts/main.js"),
  behaviorPack: path.join(paths.project, "behavior_pack"),
  resourcePack: path.join(paths.project, "resource_pack"),
  packageFile: path.join(paths.dist, "packages", `${projectName}.mcaddon`),
};

//§e = = = = = = = = task options = = = = = = = = 

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
};

const mcaddonTaskOptions = {
  ...copyTaskOptions,
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
} as const;

//§e = = = = = = = = tasks = = = = = = = = 

task(TASKS.DEBUG, () => {
  console.log("project:", config.projectName);
  console.log("project dir:", projectDir);
});

task(TASKS.LINT, coreLint(["scripts/**/*.ts"], argv().fix));

task(TASKS.TYPESCRIPT, tscTask(typescriptOptions));
task(TASKS.BUNDLE, bundleTask(bundleTaskOptions));
task(TASKS.BUILD, series(TASKS.TYPESCRIPT, TASKS.BUNDLE));

task(TASKS.CLEAN_LOCAL, cleanTask([typescriptOptions.outDir]));
task(TASKS.CLEAN_COLLATERAL, cleanCollateralTask(STANDARD_CLEAN_PATHS, config.projectName));
task(TASKS.CLEAN, parallel(TASKS.CLEAN_LOCAL, TASKS.CLEAN_COLLATERAL));

task(TASKS.COPY, copyTask(copyTaskOptions, config.projectName));
task(TASKS.PACKAGE, series(TASKS.CLEAN_COLLATERAL, TASKS.COPY));

task(TASKS.DEPLOY, watchTask(watchOptions, series(TASKS.CLEAN_LOCAL, TASKS.TYPESCRIPT, TASKS.PACKAGE)));

task(TASKS.CREATE_MCADDON, mcaddonTask(mcaddonTaskOptions));
task(TASKS.MCADDON, series(TASKS.CLEAN_LOCAL, TASKS.BUILD, TASKS.CREATE_MCADDON));