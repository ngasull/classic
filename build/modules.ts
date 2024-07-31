import { denoPlugins } from "@luca/esbuild-deno-loader";
import { resolve, SEPARATOR } from "@std/path";
import {
  fromFileUrl as posixFromFileUrl,
  relative as posixRelative,
  resolve as posixResolve,
} from "@std/path/posix";
import { exists } from "@std/fs";
import * as esbuild from "esbuild";
import { CSSTransformer } from "./bundle.ts";
import { BuildContext, ModuleLoader } from "./context.ts";

const toPosix = SEPARATOR === "/"
  ? (p: string) => p
  : (p: string) => p.replaceAll(SEPARATOR, "/");

export type ModulesOpts = {
  modules: string[];
  moduleBase: string;
  external?: string[];
  denoJsonPath?: string;
  transformCss?: CSSTransformer;
  context?: BuildContext;
};

export const buildModules = async (
  opts: Readonly<ModulesOpts>,
): Promise<BuildContext> => {
  const [context, buildContext] = await mkContext(opts);
  try {
    const result = await context.rebuild();
    if (result.errors.length) {
      throw Error(result.errors.map((e) => e.text).join("\n"));
    }
    return buildContext;
  } finally {
    await context.dispose();
  }
};

export const devModules = async (
  opts: Readonly<ModulesOpts>,
): Promise<{
  context: BuildContext;
  stop: () => Promise<void>;
}> => {
  const [context, buildContext] = await mkContext(opts);
  await context.watch();
  await context.rebuild();

  return {
    context: buildContext,
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
  const context = providedContext ?? new BuildContext(moduleBase);

  const entryPoints = modules.map((m) =>
    m[0] === "/" ? posixResolve(m.slice(1)) : m
  );

  const moduleByItsPath = Object.fromEntries(
    modules.flatMap((m, i) =>
      m.includes("*") ? [] : [[
        m[0] === "/"
          ? entryPoints[i]
          : posixFromFileUrl(import.meta.resolve(m)),
        m,
      ]]
    ),
  );

  const buildContext = await esbuild.context({
    entryPoints,
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

            const outputEntries = Object.entries(result.metafile!.outputs);

            const loadModule: ModuleLoader = ({ outPath }) =>
              result.outputFiles!
                .find((f) => f.path === posixResolve(outPath))!
                .contents;

            for (let [outPath, { entryPoint }] of outputEntries) {
              if (entryPoint) {
                const absEntryPoint = posixResolve(entryPoint);
                context.add(
                  outPath,
                  moduleByItsPath[absEntryPoint] ??
                    "/" + posixRelative(posixBase, absEntryPoint),
                  loadModule,
                );
              } else {
                context.add(
                  outPath,
                  null,
                  loadModule,
                );
              }
            }

            context.notify();
          });
        },
      } satisfies esbuild.Plugin,
    ],
  });

  return [buildContext, context] as const;
};

export const writeClientBindings = async (
  context: BuildContext,
  bindingsFile: string,
): Promise<void> => {
  const dir = toPosix(resolve(bindingsFile, ".."));
  const newClient = `import "@classic/js";

declare module "@classic/js" {
  interface Module {${
    context.modules().map(({ name, path }) =>
      name && path.endsWith(".js")
        ? `\n    ${JSON.stringify(name)}: typeof import(${
          JSON.stringify(
            name[0] === "/"
              ? "./" +
                posixRelative(
                  dir,
                  posixResolve(context.moduleBase, name.slice(1)),
                )
              : name,
          )
        });`
        : ""
    ).join("")
  }
  }
}
`;

  if (newClient !== await Deno.readTextFile(bindingsFile).catch((_) => "")) {
    await Deno.writeTextFile(bindingsFile, newClient);
  }
};
