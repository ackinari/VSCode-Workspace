import { argv, parallel, series, task, tscTask } from "just-scripts";

import {
    DEFAULT_CLEAN_DIRECTORIES,
    STANDARD_CLEAN_PATHS,

    bundleTask,
    cleanTask,
    cleanCollateralTask,
    copyTask,
    
    mcaddonTask,
    
    getOrThrowFromProcess,
    setupEnvironment,
    watchTask,

    coreLint
} from "./.vscode/build-tasks"
import path from "path";

setupEnvironment(path.resolve(__dirname, ".env"));
const projectName = getOrThrowFromProcess("PROJECT_NAME");

type BundleTaskParameters = {
    entryPoint: string;
    external?: string[] | undefined;
    minifyWhitespace?: boolean;
    outfile: string;
    sourcemap?: boolean | "linked" | "inline" | "external" | "both";
    outputSourcemapPath?: string;
    dropLabels?: string[];
    alias?: Record<string, string>;
}
const bundleTaskOptions: BundleTaskParameters = {
  entryPoint: path.join(__dirname, "./tscripts/main.ts"),
  external: ["@minecraft/server", "@minecraft/server-ui"],
  outfile: path.resolve(__dirname, "./dist/scripts/main.js"),
  minifyWhitespace: true, //*
//   sourcemap: true, // desativei source map tanto aqui quanto no tsconfig
//   outputSourcemapPath: path.resolve(__dirname, "./dist/debug"),
};

type CopyTaskParameters = {
    copyToBehaviorPacks: string[];
    copyToScripts: string[];
    copyToResourcePacks?: string[];
}
const copyTaskOptions: CopyTaskParameters = {
  copyToBehaviorPacks: [`./behavior_packs/${projectName}`],
  copyToScripts: ["./dist/scripts"],
  copyToResourcePacks: [`./resource_packs/${projectName}`],
};

type ZipTaskParameters = CopyTaskParameters & {
    outputFile: string;
}
const mcaddonTaskOptions: ZipTaskParameters = {...copyTaskOptions, outputFile: `./dist/packages/${projectName}.mcaddon`};

task("lint", coreLint(["scripts/**/*.ts"], argv().fix)); // faz um lint nos scripts procurando por erros

task("typescript", tscTask()); // transpila ts pra js em lib/scripts com .map
task("bundle", bundleTask(bundleTaskOptions)); // separa os .map de lib em dist/debug | separa os .js de lib em dist/scripts §c se nao tiver sourcemap nao precisa
task("build", series("typescript", "bundle")); // faz os dois acima

task("clean-local", cleanTask(DEFAULT_CLEAN_DIRECTORIES)); // remove dist e lib
task("clean-collateral", cleanCollateralTask(STANDARD_CLEAN_PATHS)); // remove da development
task("clean", parallel("clean-local", "clean-collateral")); // faz os dois acima

task("copyArtifacts", copyTask(copyTaskOptions)); // copia a BP (com tudo de dentro da dist/scripts) e RP para a development
task("package", series("clean-collateral", "copyArtifacts")); // limpa a development e copia tudo pra lá

task("local-deploy", watchTask(["scripts/**/*.ts", "behavior_packs/**/*.{json,lang,tga,ogg,png}", "resource_packs/**/*.{json,lang,tga,ogg,png}"], series("clean-local", "typescript", "package", "clean-local"))); // posso adicionar "clean-local" no final

task("createMcaddonFile", mcaddonTask(mcaddonTaskOptions));
task("mcaddon", series("clean-local", "build", "createMcaddonFile")); // cria um bp.mcpack | rp.mcpack | mcaddon em dist/packages
