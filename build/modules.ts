import { createServedContext, ServedJSContext } from "@classic/js";
import { denoPlugins } from "@luca/esbuild-deno-loader";
import { relative, resolve, SEPARATOR, toFileUrl } from "@std/path";
import {
  fromFileUrl as posixFromFileUrl,
  relative as posixRelative,
} from "@std/path/posix";
import { exists } from "@std/fs";
import * as esbuild from "esbuild";
import { CSSTransformer } from "./bundle.ts";

const externalPrefix = `..${SEPARATOR}`;
const toPosix = SEPARATOR === "/"
  ? (p: string) => p
  : (p: string) => p.replaceAll(SEPARATOR, "/");

export type ModulesOpts = {
  modules: string[];
  moduleBase: string;
  external?: string[];
  denoJsonPath?: string;
  transformCss?: CSSTransformer;
  context?: ServedJSContext;
};

export const buildModules = async (
  opts: Readonly<ModulesOpts>,
): Promise<ServedJSContext> => {
  const [context, served] = await mkContext(opts);
  try {
    const result = await context.rebuild();
    if (result.errors.length) {
      throw Error(result.errors.map((e) => e.text).join("\n"));
    }
    return served;
  } finally {
    await context.dispose();
  }
};

export const devModules = async (
  opts: Readonly<ModulesOpts>,
): Promise<{
  served: ServedJSContext;
  stop: () => Promise<void>;
}> => {
  const [context, served] = await mkContext(opts);
  await context.watch();
  await context.rebuild();

  return {
    served,
    stop: () => context.dispose(),
  };
};

const mkContext = async ({
  modules,
  external,
  moduleBase,
  denoJsonPath,
  transformCss,
  context: providedContext,
}: Readonly<ModulesOpts>) => {
  let lastResult: esbuild.BuildResult<{ write: false }>;
  const loadModule = (publicPath: string) =>
    lastResult
      .outputFiles
      .find((f) => relative(Deno.cwd(), f.path) === publicPath)
      ?.contents;

  const context = providedContext ?? createServedContext();

  const buildContext = await esbuild.context({
    entryPoints: modules,
    logOverride: { "empty-glob": "silent" },
    external,
    outbase: moduleBase,
    outdir: ".",
    entryNames: "[dir]/[name]-[hash]",
    write: false,
    bundle: true,
    splitting: true,
    minify: true,
    sourcemap: true,
    metafile: true,
    format: "esm",
    charset: "utf8",
    jsx: "automatic",
    jsxImportSource: "@classic/element",
    plugins: [
      ...transformCss
        ? [
          {
            name: "transform-css",
            setup(build) {
              build.onLoad(
                { filter: /\.css$/ },
                async ({ path }) => ({
                  loader: "css",
                  contents: await transformCss(
                    await Deno.readTextFile(path),
                    path,
                  ),
                }),
              );
            },
          } satisfies esbuild.Plugin,
        ]
        : denoPlugins({
          configPath: resolve(
            denoJsonPath ??
              (await exists("deno.jsonc") ? "deno.jsonc" : "deno.json"),
          ),
        }),
      {
        name: "sync-served",
        setup(build) {
          build.onEnd((result) => {
            if (!result.metafile) return;

            const posixBase = toPosix(moduleBase);

            const moduleByItsPath = Object.fromEntries(
              modules.flatMap((m) =>
                m.includes("*") ? [] : [[
                  posixRelative(
                    Deno.cwd(),
                    posixFromFileUrl(import.meta.resolve(m)),
                  ),
                  m,
                ]]
              ),
            );
            const outputEntries = Object.entries(result.metafile!.outputs);

            for (let [outPath, { entryPoint }] of outputEntries) {
              if (entryPoint) {
                entryPoint = entryPoint.replace(/^[A-z-]+:/, "");
                const rel = posixRelative(posixBase, entryPoint);
                const [moduleName, modulePath] = rel.startsWith(externalPrefix)
                  ? [
                    moduleByItsPath[entryPoint] ?? entryPoint,
                    moduleByItsPath[entryPoint] ?? entryPoint,
                  ]
                  : [rel, null];

                context.add(
                  moduleName,
                  modulePath,
                  toFileUrl(resolve(entryPoint)).href,
                  outPath,
                  loadModule,
                );
              } else {
                context.add(
                  outPath,
                  null,
                  toFileUrl(resolve(outPath)).href,
                  outPath,
                  loadModule,
                );
              }
            }

            lastResult = result;
            context.notify();
          });
        },
      } satisfies esbuild.Plugin,
    ],
  });

  return [buildContext, context] as const;
};
