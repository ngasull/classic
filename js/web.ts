import * as esbuild from "../deps/esbuild.ts";
import { exists } from "../deps/std/fs.ts";
import { resolve, toFileUrl } from "../deps/std/path.ts";
import { createContext } from "../jsx/render.ts";
import { JS } from "./types.ts";
import { js } from "../js.ts";

export type BundleResult = {
  name: string;
  publicRoot: string;
  outputFiles: OutputFile[];
  modules: Record<string, { entryPoint: URL; output: OutputFile }>;
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

export const bundleContext = createContext<BundleResult>("bundle");

export const bundleWebImports = async (
  {
    denoJsonPath,
    minify = false,
    name = "web",
    publicRoot = "/m",
    sourcemap = !minify,
  }: {
    denoJsonPath?: string;
    minify?: boolean;
    name?: string;
    publicRoot?: string;
    sourcemap?: boolean;
  } = {},
): Promise<BundleResult> => {
  const configPath = resolve(
    denoJsonPath ?? (await exists("deno.jsonc") ? "deno.jsonc" : "deno.json"),
  );

  const absoluteOutDir = resolve("dist");
  const absoluteOutDirRegExp = new RegExp(
    `^${absoluteOutDir.replaceAll(/[/[.\\]/g, (m) => `\\${m}`)}`,
  );

  const bundleFile = await import(
    toFileUrl(resolve("src/web-modules.gen.ts")).toString()
  );
  const webModules = [...bundleFile[name][$webModules]];

  const bundle = await esbuild.build({
    entryPoints: [
      import.meta.resolve("../dom.ts"),
      ...webModules,
    ],
    entryNames: "[name]-[hash]",
    bundle: true,
    splitting: true,
    minify,
    sourcemap,
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
            entryPoint: new URL(meta.entryPoint, toFileUrl(configPath)),
            output: outputFiles[i],
          }]
          : []
      )
      .map((m) => [m.entryPoint.toString(), m]),
  );

  const webModulesContent = `// AUTO-GENERATED FILE, DO NOT MODIFY
// deno-lint-ignore-file
/* eslint-disable */
import { Bundle } from ${JSON.stringify(import.meta.resolve("../js/web.ts"))};

const r = new Bundle<{${
    webModules
      .map((path) =>
        `\n  ${JSON.stringify(path)}: typeof import(${JSON.stringify(path)});`
      )
      .join("")
  }
}>();

export { r as ${name} };
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
    lib: { dom: modules[import.meta.resolve("../dom.ts")].output.publicPath },
  };

  function toPublicPath(path: string): string {
    return publicRoot + path.replace(absoluteOutDirRegExp, "");
  }
};

const $webModules = Symbol("webModules");

export class Bundle<
  Imports extends Record<string, unknown> = Record<string, unknown>,
> {
  [$webModules] = new Set<string>();

  add<P extends keyof Imports>(module: P): JS<Imports[P]>;
  add<T>(module: string): JS<T> {
    this[$webModules].add(module);
    return js.module(module);
  }
}
