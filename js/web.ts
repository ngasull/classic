import * as esbuild from "../deps/esbuild.ts";
import { exists } from "../deps/std/fs.ts";
import {
  ImportMap,
  resolveImportMap,
  resolveModuleSpecifier,
} from "../deps/importmap.ts";
import { parse as JSONCParse } from "../deps/std/jsonc.ts";
import { join, resolve, toFileUrl } from "../deps/std/path.ts";
import { createContext } from "../jsx/render.ts";

export type WebBundle = {
  name: string;
  publicRoot: string;
  outputFiles: OutputFile[];
  modules: Record<string, { entryPoint: URL; output: OutputFile }>;
  dev: boolean;
  lib: {
    dom: string;
  };
};

type OutputFile = {
  path: string;
  publicPath: string;
  contents: Uint8Array;
  hash: string;
};

export const bundleContext = createContext("bundle");

export const bundleWebImports = async (
  {
    name = "web",
    src = "src",
    configPath,
    publicRoot = "/m",
    dev = true,
  }: {
    name?: string;
    src?: string;
    publicRoot?: string;
    configPath?: string;
    dev?: boolean;
  } = {},
): Promise<WebBundle> => {
  configPath = resolve(
    configPath ?? (await exists("deno.jsonc") ? "deno.jsonc" : "deno.json"),
  );

  const configURL = toFileUrl(configPath);

  const { imports, scopes } = JSONCParse(
    await Deno.readTextFile(configPath),
  ) as ImportMap;
  const importMap = resolveImportMap(
    { imports, scopes },
    configURL,
  );

  const absoluteOutDir = resolve("dist");
  const absoluteOutDirRegExp = new RegExp(
    `^${absoluteOutDir.replaceAll(/[/[.\\]/g, (m) => `\\${m}`)}`,
  );

  const srcFiles = await (async function scanDir(parent: string) {
    const tasks = [];

    for await (const entry of Deno.readDir(parent)) {
      tasks.push((async (): Promise<string[]> => {
        const file = join(parent, entry.name);
        const { isDirectory } = await Deno.realPath(file).then(Deno.stat);
        return isDirectory
          ? await scanDir(file)
          : /\.tsx?$/.test(entry.name)
          ? [file]
          : [];
      })());
    }

    const files = await Promise.all(tasks);
    return files.flatMap((fs) => fs);
  })(src);

  const moduleImportRegExp = new RegExp(
    `${name}\\s*\\.(?:import|module|path)\\(\\s*('[^']+'|"[^"]+")\\s*(?:,\\s*)?\\)`,
    "g",
  );

  const webDotModules = [
    ...new Set<string>(
      await Promise.all(srcFiles.map(async (file) => {
        const contents = await Deno.readTextFile(file);
        return [...contents.matchAll(moduleImportRegExp)].map((match) => {
          const path = match[1].slice(1, match[1].length - 1);

          if (path.match(/^\.\.?\//)) {
            throw Error(
              `Relative web module imports can't work. In ${file} : ${path}`,
            );
          } else {
            return path;
          }
        });
      })).then((pathss) => pathss.flatMap((paths) => paths)),
    ),
  ];

  const bundle = await esbuild.build({
    entryPoints: [import.meta.resolve("../dom.ts"), ...webDotModules],
    entryNames: "[name]-[hash]",
    bundle: true,
    splitting: true,
    minify: !dev,
    sourcemap: dev,
    metafile: true,
    write: false,
    outdir: absoluteOutDir,
    format: "esm",
    charset: "utf8",
    plugins: esbuild.denoPlugins({ configPath }),
  });

  const outputFiles: OutputFile[] = bundle.outputFiles
    .map(({ path, contents, hash }) => ({
      path,
      publicPath: toPublicPath(path),
      contents,
      hash,
    }));

  const modules = Object.fromEntries(
    Object.values(bundle.metafile.outputs)
      .flatMap((meta, i) =>
        meta.entryPoint
          ? [{
            entryPoint: new URL(meta.entryPoint, configURL),
            output: outputFiles[i],
          }]
          : []
      )
      .map((m) => [m.entryPoint.toString(), m]),
  );

  const modulesMap = webDotModules.length > 0
    ? `const modules = {${
      webDotModules
        .map((spec) => {
          const url = resolveModuleSpecifier(spec, importMap, configURL);
          const module = modules[url];
          return `\n  ${JSON.stringify(spec)}: { local: ${
            JSON.stringify(url)
          }, pub: ${JSON.stringify(module.output.publicPath)} },`;
        })
        .join("")
    }
} as const;

const impt = (path: keyof typeof modules) =>
  js.import(modules[path].pub);

const module = (path: keyof typeof modules) =>
  js.module(modules[path].local, modules[path].pub);

`
    : "";

  const webModulesContent = `// AUTO-GENERATED FILE, DO NOT MODIFY
import { js } from ${JSON.stringify(import.meta.resolve("../js.ts"))};
import type { JS } from ${JSON.stringify(import.meta.resolve("./types.ts"))};

${modulesMap}export const ${name} = {
  import: ${webDotModules.length > 0 ? `impt` : `((_) => undefined)`} as {${
    webDotModules
      .map((path) =>
        `\n    (mod: ${JSON.stringify(path)}): JS<Promise<typeof import(${
          JSON.stringify(path)
        })>>;`
      )
      .join("")
  }
    (mod: string): never;
  },
  module: ${webDotModules.length > 0 ? `module` : `((_) => undefined)`} as {${
    webDotModules
      .map((path) =>
        `\n    (mod: ${JSON.stringify(path)}): JS<typeof import(${
          JSON.stringify(path)
        })>;`
      )
      .join("")
  }
    (mod: string): never;
  },
  path: <M extends keyof typeof modules>(mod: M): typeof modules[M]["pub"] => modules[mod]["pub"],
};
`;

  try {
    if (
      await Deno.readTextFile("src/web-modules.gen.ts") !== webModulesContent
    ) throw 1;
  } catch (_) {
    await Deno.writeTextFile("src/web-modules.gen.ts", webModulesContent);
  }

  return {
    name,
    publicRoot,
    outputFiles,
    modules,
    dev,
    lib: { dom: modules[import.meta.resolve("../dom.ts")].output.publicPath },
  };

  function toPublicPath(path: string): string {
    return publicRoot + path.replace(absoluteOutDirRegExp, "");
  }
};
