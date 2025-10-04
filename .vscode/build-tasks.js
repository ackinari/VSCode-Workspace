import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import * as rimraf from "rimraf";
import * as rushstack from "@rushstack/node-core-library";
import * as just_scripts from "just-scripts";
import * as zip_lib from "zip-lib";

var MinecraftProduct = /* @__PURE__ */ ((MinecraftProduct2) => {
  MinecraftProduct2["BedrockGDK"] = "BedrockGDK";
  MinecraftProduct2["PreviewGDK"] = "PreviewGDK";
  MinecraftProduct2["Bedrock"] = "BedrockUWP";
  MinecraftProduct2["Preview"] = "PreviewUWP";
  MinecraftProduct2["Custom"] = "Custom";
  return MinecraftProduct2;
})(MinecraftProduct || {});

export function setupEnvironment(envPath) {
  dotenv.config({ path: envPath });
}

var MAP_EXTENSION = ".map";
function isRequiredToMakeAnyFileChange(sourcemap) {
  return sourcemap !== false && sourcemap !== "inline";
}
function isRequiredToLinkJsFile(sourcemap) {
  return sourcemap === true || sourcemap === "linked";
}
function linkSourceMaps(sourceMapDirectory, outputDirectory, options, outputFiles) {
  const generatedFiles = {};
  for (const element of outputFiles) {
    if (element.path.endsWith(MAP_EXTENSION)) {
      const parsedPath = path.default.parse(element.path);
      const sourceMapFilePath = path.default.join(sourceMapDirectory, parsedPath.base);
      const sourceMapContent = JSON.parse(element.text);
      sourceMapContent.file = path.default
        .relative(sourceMapDirectory, path.default.join(outputDirectory, parsedPath.name))
        .replace(/\\/g, "/");
      generatedFiles[sourceMapFilePath] = JSON.stringify(sourceMapContent);
    } else if (isRequiredToLinkJsFile(options.sourcemap)) {
      const dir = path.default.parse(element.path).dir;
      const targetSourceMap = path.default
        .join(path.default.relative(dir, sourceMapDirectory), path.default.parse(element.path).base)
        .replace(/\\/g, "/");
      generatedFiles[element.path] =
        element.text +
        `
//# sourceMappingURL=${targetSourceMap}${MAP_EXTENSION}
`;
    } else {
      generatedFiles[element.path] = element.text;
    }
  }
  return generatedFiles;
}
function writeFiles(postProcessOutputFilesResult) {
  fs.default.mkdirSync(postProcessOutputFilesResult.outputDirectory, { recursive: true });
  if (postProcessOutputFilesResult.sourceMapDirectory !== postProcessOutputFilesResult.outputDirectory) {
    fs.default.mkdirSync(postProcessOutputFilesResult.sourceMapDirectory, { recursive: true });
  }
  for (const path10 of Object.keys(postProcessOutputFilesResult.generatedFiles)) {
    fs.default.writeFileSync(path10, postProcessOutputFilesResult.generatedFiles[path10]);
  }
}
function postProcessOutputFiles(options, buildResult) {
  if (!buildResult.outputFiles) {
    return void 0;
  }
  const outputDirectory = path.default.parse(options.outfile).dir;
  const sourceMapDirectory = path.default.resolve(options.outputSourcemapPath ?? outputDirectory);
  const generatedFiles = linkSourceMaps(sourceMapDirectory, outputDirectory, options, buildResult.outputFiles);
  return { sourceMapDirectory, outputDirectory, generatedFiles };
}
export function bundleTask(options) {
  return () => {
    const isRequiredToMakeChanges = isRequiredToMakeAnyFileChange(options.sourcemap);
    const isRequiredToLinkJs = isRequiredToLinkJsFile(options.sourcemap);
    const buildResult = esbuild.default.buildSync({
      entryPoints: [options.entryPoint],
      bundle: true,
      format: "esm",
      minifyWhitespace: options.minifyWhitespace,
      outfile: options.outfile,
      sourcemap: isRequiredToLinkJs ? "external" : options.sourcemap,
      external: options.external,
      write: !isRequiredToMakeChanges,
      dropLabels: options.dropLabels,
      alias: options.alias,
    });
    if (buildResult.errors.length === 0) {
      if (isRequiredToMakeChanges) {
        if (!buildResult.outputFiles) {
          process.exitCode = 1;
          return Promise.reject(
            new Error("No output files were generated, check that your entrypoint file is configured correctly.")
          );
        }
        const result = postProcessOutputFiles(options, buildResult);
        if (result) {
          writeFiles(result);
        }
      }
      process.exitCode = 0;
      return Promise.resolve();
    }
    process.exitCode = 1;
    return Promise.reject(new Error(buildResult.errors.join("\n")));
  };
}

export const DEFAULT_CLEAN_DIRECTORIES = ["temp", "lib", "dist"];
export function cleanTask(dirs) {
  return () => {
    for (const dir of dirs) {
      try {
        console.log(`Cleaning ${dir}`);
        rimraf.sync(path.default.resolve(process.cwd(), dir));
      } catch (_2) {}
    }
  };
}

export function getOrThrowFromProcess(key, messageOverride = undefined) {
  const value = process.env[key];
  if (!value) {
    throw new Error(messageOverride ?? `Missing environment variable ${key}. Make sure to configure project.`);
  }
  return value;
}

export const STANDARD_CLEAN_PATHS = [
  "APPDATA/Minecraft Bedrock/Users/Shared/games/com.mojang/development_behavior_packs/PROJECT_NAME_BP",
  "APPDATA/Minecraft Bedrock/Users/Shared/games/com.mojang/development_resource_packs/PROJECT_NAME_RP",
  "APPDATA/Minecraft Bedrock Preview/Users/Shared/games/com.mojang/development_behavior_packs/PROJECT_NAME_BP",
  "APPDATA/Minecraft Bedrock Preview/Users/Shared/games/com.mojang/development_resource_packs/PROJECT_NAME_RP",
  "LOCALAPPDATA/Packages/Microsoft.MinecraftUWP_8wekyb3d8bbwe/LocalState/games/com.mojang/development_behavior_packs/PROJECT_NAME_BP",
  "LOCALAPPDATA/Packages/Microsoft.MinecraftUWP_8wekyb3d8bbwe/LocalState/games/com.mojang/development_resource_packs/PROJECT_NAME_RP",
  "LOCALAPPDATA/Packages/Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe/LocalState/games/com.mojang/development_behavior_packs/PROJECT_NAME_BP",
  "LOCALAPPDATA/Packages/Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe/LocalState/games/com.mojang/development_resource_packs/PROJECT_NAME_RP",
];
export function cleanCollateralTask(pathsToClean) {
  return () => {
    const projectName = getOrThrowFromProcess("PROJECT_NAME");
    const errorToken = "$ERROR_TOKEN$";
    let appData = process.env.APPDATA;
    if (!appData) {
      console.warn("Proceeding without APPDATA on this platform. File copy will fail if APPDATA is required.");
      appData = errorToken;
    }
    let localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) {
      console.warn("Proceeding without LOCALAPPDATA on this platform. File copy will fail if LOCALAPPDATA is required.");
      localAppData = errorToken;
    }
    for (const cleanPathRaw of pathsToClean) {
      const cleanPath = cleanPathRaw.replace("LOCALAPPDATA", localAppData).replace("APPDATA", appData).replace("PROJECT_NAME", projectName);
      if (cleanPath.includes(errorToken)) {
        console.warn(`Skipping clean of ${cleanPath} on current platform due to APPDATA or LOCALAPPDATA being missing.`);
        continue;
      }
      try {
        const stats = fs.statSync(cleanPath);
        console.log(`Cleaning ${stats.isDirectory() ? "directory" : "file"} ${path.resolve(cleanPath)}.`);
        rimraf.sync(cleanPath);
      } catch (_2) {}
    }
  };
}

function copyFiles(originPaths, outputPath, skipIfPossible = true) {
  const destinationPath = path.default.resolve(outputPath);
  const MTIME_TOLERANCE_MS = 1e3;
  for (const originPath of originPaths) {
    const inputPath = path.default.resolve(originPath);
    const pathStats = rushstack.FileSystem.getLinkStatistics(inputPath);
    if (pathStats.isDirectory()) {
      console.log(`Copying folder ${inputPath} to ${destinationPath}`);
    } else {
      const filename = path.default.parse(inputPath).base;
      const fileDestinationPath = path.default.resolve(destinationPath, filename);
      let shouldCopy = true;
      if (skipIfPossible) {
        try {
          const destFileStats = rushstack.FileSystem.getStatistics(fileDestinationPath);
          if (destFileStats.size !== pathStats.size) {
            shouldCopy = true;
          } else {
            const srcMtime = pathStats.mtimeMs ?? pathStats.mtime.getTime();
            const destMtime = destFileStats.mtimeMs ?? destFileStats.mtime.getTime();
            if (Math.abs(srcMtime - destMtime) > MTIME_TOLERANCE_MS) {
              shouldCopy = true;
            } else {
              shouldCopy = false;
            }
          }
        } catch {
          shouldCopy = true;
        }
      }
      if (!shouldCopy) {
        console.log(`Skipping copy for ${inputPath}; no change detected`);
        continue;
      }
      console.log(`Copying file ${inputPath} to ${fileDestinationPath}`);
      rushstack.FileSystem.copyFiles({
        sourcePath: inputPath,
        destinationPath: fileDestinationPath,
        preserveTimestamps: true,
      });
      continue;
    }
    rushstack.FileSystem.copyFiles({
      sourcePath: inputPath,
      destinationPath,
      preserveTimestamps: true,
    });
  }
}

function getGameDeploymentRootPaths() {
  const localAppDataPath = process.env["LOCALAPPDATA"];
  const appDataPath = process.env["APPDATA"];
  const customDeploymentPath = process.env["CUSTOM_DEPLOYMENT_PATH"];
  return {
    BedrockGDK: appDataPath
      ? (0, path.resolve)(appDataPath, "Minecraft Bedrock/Users/Shared/games/com.mojang/")
      : void 0,
    PreviewGDK: appDataPath
      ? (0, path.resolve)(appDataPath, "Minecraft Bedrock Preview/Users/Shared/games/com.mojang/")
      : void 0,
    BedrockUWP: localAppDataPath
      ? (0, path.resolve)(
          localAppDataPath,
          "Packages/Microsoft.MinecraftUWP_8wekyb3d8bbwe/LocalState/games/com.mojang/"
        )
      : void 0,
    PreviewUWP: localAppDataPath
      ? (0, path.resolve)(
          localAppDataPath,
          "Packages/Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe/LocalState/games/com.mojang/"
        )
      : void 0,
    Custom: customDeploymentPath ? customDeploymentPath : void 0,
  };
}
function getTargetWorldPath() {
  let deploymentPath = void 0;
  let product;
  try {
    product = getOrThrowFromProcess("MINECRAFT_PRODUCT");
    deploymentPath = getGameDeploymentRootPaths()[product];
  } catch (_2) {
    throw new Error("Unable to get deployment path. Make sure to configure package root correctly.");
  }
  if (deploymentPath === void 0) {
    throw new Error("Deployment path is undefined. Make sure to configure package root correctly.");
  }
  const projectName = getOrThrowFromProcess("PROJECT_NAME");
  const worldsFolderName = product === "Custom" /* Custom */ ? "worlds" : "minecraftWorlds";
  const activeWorldFolderName = product === "Custom" /* Custom */ ? "Bedrock level" : `${projectName}world`;
  return path.default.join(deploymentPath, worldsFolderName, activeWorldFolderName);
}

var BehaviorPacksPath = "development_behavior_packs";
var ResourcePacksPath = "development_resource_packs";
export function copyTask(params) {
  return () => {
    const projectName = getOrThrowFromProcess("PROJECT_NAME");
    let deploymentPath = void 0;
    try {
      const product = getOrThrowFromProcess("MINECRAFT_PRODUCT");
      deploymentPath = getGameDeploymentRootPaths()[product];
    } catch (_2) {
      throw new Error("Unable to get deployment path. Make sure to configure package root correctly.");
    }
    if (deploymentPath === void 0) {
      throw new Error("Deployment path is undefined. Make sure to configure package root correctly.");
    }
    copyFiles(params.copyToBehaviorPacks, path.default.join(deploymentPath, BehaviorPacksPath, projectName + "_BP"));
    copyFiles(
      params.copyToScripts,
      path.default.join(deploymentPath, BehaviorPacksPath, projectName + "_BP", "scripts")
    );
    if (params.copyToResourcePacks) {
      copyFiles(params.copyToResourcePacks, path.default.join(deploymentPath, ResourcePacksPath, projectName + "_RP"));
    }
  };
}

var WATCH_TASK_NAME = "watch-task";
(0, just_scripts.option)("watch");
function executeTask(taskFunction) {
  void taskFunction.call(void 0, () => {});
}
export function watchTask(globs, taskFunction) {
  return () => {
    const watchArgs = (0, just_scripts.argv)();
    if (!watchArgs.watch) {
      return taskFunction;
    }
    let taskInProgress = true;
    let pendingWork = false;
    const onFinished = (args) => {
      if (args.name === WATCH_TASK_NAME) {
        if (pendingWork) {
          just_scripts.logger.info("Processing pending changes...");
          pendingWork = false;
          executeTask(origTask);
        } else {
          just_scripts.logger.info("Waiting for new changes...");
          taskInProgress = false;
        }
      }
    };
    just_scripts.undertaker.on("start", function (args) {
      if (args.name === WATCH_TASK_NAME) {
        taskInProgress = true;
      }
    });
    just_scripts.undertaker.on("stop", function (args) {
      onFinished(args);
    });
    just_scripts.undertaker.on("error", function (args) {
      onFinished(args);
    });
    (0, just_scripts.task)(WATCH_TASK_NAME, (0, just_scripts.series)(taskFunction));
    const origTask = (0, just_scripts.series)(WATCH_TASK_NAME);
    executeTask(origTask);
    (0, just_scripts.watch)(globs, () => {
      if (!taskInProgress) {
        executeTask(origTask);
      } else {
        pendingWork = true;
      }
    });
    return Promise.resolve();
  };
}

function addContentsToZip(zipContents, zip) {
  for (const content of zipContents) {
    for (const originPath of content.contents) {
      const inputPath = path.default.resolve(originPath);
      const pathStats = rushstack.FileSystem.getLinkStatistics(inputPath);
      if (pathStats.isDirectory()) {
        console.log(`Adding folder ${inputPath} to package`);
        zip.addFolder(inputPath, content.targetPath);
      } else {
        const metadataPath = content.targetPath
          ? path.default.join(content.targetPath, path.default.parse(inputPath).base)
          : void 0;
        console.log(`Adding file ${inputPath} to package`);
        zip.addFile(inputPath, metadataPath);
      }
    }
  }
}
function zipTask(outputFile, zipContents) {
  return async function zip() {
    if (zipContents.length === 0 || !zipContents.some((content) => content.contents.length > 0)) {
      process.exitCode = 0;
      return Promise.resolve();
    }
    const zip2 = new zip_lib.Zip();
    addContentsToZip(zipContents, zip2);
    let isSucceeded = true;
    let errorMessage = "";
    await zip2.archive(outputFile).then(
      function () {
        console.error(`Compressed file created at ${outputFile}`);
      },
      function (err) {
        isSucceeded = false;
        errorMessage = `Compressed file failed to be created at ${outputFile}: ${err}`;
        console.error(errorMessage);
      }
    );
    if (isSucceeded) {
      process.exitCode = 0;
      return Promise.resolve();
    }
    process.exitCode = 1;
    return Promise.reject(new Error(errorMessage));
  };
}
export function mcaddonTask(params) {
  const targetFolder = path.default.parse(params.outputFile).dir;
  const outputFileName = path.default.parse(params.outputFile).name;
  const behaviorPackFile = path.default.join(targetFolder, `${outputFileName}_bp.mcpack`);
  const resourcePackFile = path.default.join(targetFolder, `${outputFileName}_rp.mcpack`);
  const mcaddonContents = { contents: [behaviorPackFile] };
  if (params.copyToResourcePacks && params.copyToResourcePacks.length > 0) {
    mcaddonContents.contents.push(resourcePackFile);
  }
  (0, just_scripts.task)(
    "packBP",
    zipTask(behaviorPackFile, [
      { contents: params.copyToBehaviorPacks },
      { contents: params.copyToScripts, targetPath: "scripts" },
    ])
  );
  (0, just_scripts.task)("packRP", zipTask(resourcePackFile, [{ contents: params.copyToResourcePacks ?? [] }]));
  (0, just_scripts.task)("packMcaddon", zipTask(params.outputFile, [mcaddonContents]));
  return (0, just_scripts.series)((0, just_scripts.parallel)("packBP", "packRP"), "packMcaddon");
}

//! tirar depois:
import * as child_process from "child_process";
import * as process from "process";
var LEGACY_CONFIG_FILES = [".eslintrc.js"];
var FLAT_CONFIG_FILES = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs"];
var POSSIBLE_CONFIG_FILES = [...LEGACY_CONFIG_FILES, ...FLAT_CONFIG_FILES];
function getConfigFilePath() {
  for (const file of POSSIBLE_CONFIG_FILES) {
    const configPath = path.default.resolve(process.default.cwd(), file);
    if ((0, fs.existsSync)(configPath)) {
      return configPath;
    }
  }
  return void 0;
}
function eslintTask(fix) {
  return () => {
    const configFilePath = getConfigFilePath();
    if (!configFilePath) {
      return Promise.resolve();
    }
    process.default.env["ESLINT_USE_FLAT_CONFIG"] = FLAT_CONFIG_FILES.some((file) => configFilePath.endsWith(file))
      ? "true"
      : "false";
    const cmd = ["npx", "eslint", ".", "--config", `"${configFilePath}"`, ...(fix ? ["--fix"] : []), "--color"].join(
      " "
    );
    just_scripts.logger.info(`Running command: ${cmd}`);
    return (0, child_process.execSync)(cmd, { stdio: "inherit" });
  };
}
function prettierTask(files, fix) {
  return () => {
    if (!files || files.length === 0) {
      return Promise.resolve();
    }
    const cmd = ["npx", "prettier", fix ? "--write" : "--check", ...files].join(" ");
    return (0, child_process.execSync)(cmd, { stdio: "inherit" });
  };
}
export function coreLint(prettierFiles, fix) {
  (0, just_scripts.task)("verify-lint", () => {
    if (!getConfigFilePath()) {
      throw new Error(
        `ESLint config file not found at ${process.default.cwd()}. Possible values: [${POSSIBLE_CONFIG_FILES.join(
          ", "
        )}]`
      );
    }
  });
  (0, just_scripts.task)("eslint", eslintTask(fix));
  (0, just_scripts.task)("prettier", prettierTask(prettierFiles, fix));
  return (0, just_scripts.series)(
    "verify-lint",
    "eslint",
    (0, just_scripts.condition)("prettier", () => !!prettierFiles && prettierFiles.length > 0)
  );
}
