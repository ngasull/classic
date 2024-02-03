import * as esbuild from "../deps/esbuild.ts";
import { exists } from "../deps/std/fs.ts";
import { join, resolve, toFileUrl } from "../deps/std/path.ts";

export type WebBundle = Record<string, { contents: Uint8Array; hash: string }>;

export const bundleWebImports = async (
  {
    name = "web",
    src = "src",
    publicRoot = "/m",
    importMapURL,
    dev = true,
  }: {
    name?: string;
    src?: string;
    publicRoot?: string;
    importMapURL?: string;
    dev?: boolean;
  } = {},
): Promise<WebBundle> => {
  importMapURL ??= toFileUrl(
    resolve(
      await exists("import_map.json")
        ? "import_map.json"
        : await exists("deno.json")
        ? "deno.json"
        : await exists("deno.jsonc")
        ? "deno.jsonc"
        : "import_map.json",
    ),
  ).toString();

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
    `${name}\\s*\\.(?:import|module|path)\\(\\s*('[^']+'|"[^"]+")\\s*\\)`,
    "g",
  );

  const modules = [
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

  const sourcemap = dev;
  const absoluteOutdir = resolve("dist");
  const bundle = await esbuild.build({
    entryPoints: modules,
    entryNames: "[name]-[hash]",
    bundle: true,
    splitting: true,
    minify: !dev,
    sourcemap,
    write: false,
    outdir: absoluteOutdir,
    format: "esm",
    plugins: esbuild.denoPlugins({ importMapURL }),
  });

  const outputFiles: {
    path: string;
    contents: Uint8Array;
    hash: string;
  }[] = bundle.outputFiles;

  const modulesMap = modules.length > 0
    ? `const modules = {${
      modules
        .map((path, i) =>
          `\n  ${JSON.stringify(path)}: { local: ${
            JSON.stringify(path)
          }, pub: ${
            JSON.stringify(
              `${publicRoot}${
                toPublicPath(outputFiles[sourcemap ? i * 2 + 1 : i].path)
              }`,
            )
          } },`
        )
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
import type { WrappedPureJS } from ${
    JSON.stringify(import.meta.resolve("./types.ts"))
  };

${modulesMap}export const ${name} = {
  import: ${modules.length > 0 ? `impt` : `((_) => undefined)`} as {${
    modules
      .map((path) =>
        `\n    (mod: ${
          JSON.stringify(path)
        }): WrappedPureJS<Promise<typeof import(${JSON.stringify(path)})>>;`
      )
      .join("")
  }
    (mod: string): never;
  },
  module: ${modules.length > 0 ? `module` : `((_) => undefined)`} as {${
    modules
      .map((path) =>
        `\n    (mod: ${JSON.stringify(path)}): WrappedPureJS<typeof import(${
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

  return Object.fromEntries(
    outputFiles.map((
      { path, contents, hash },
    ) => [toPublicPath(path), { contents, hash }]),
  );

  function toPublicPath(path: string): string {
    return path.replace(absoluteOutdir, "");
  }
};
