import { createServedContext, ServedJSContext, ServedMeta } from "@classic/js";
import { denoPlugins } from "@luca/esbuild-deno-loader";
import {
  dirname,
  join,
  relative,
  resolve,
  SEPARATOR,
  toFileUrl,
} from "@std/path";
import {
  fromFileUrl as posixFromFileUrl,
  relative as posixRelative,
} from "@std/path/posix";
import { exists } from "@std/fs";
import * as esbuild from "esbuild";

const externalPrefix = `..${SEPARATOR}`;
const toPosix = SEPARATOR === "/"
  ? (p: string) => p
  : (p: string) => p.replaceAll(SEPARATOR, "/");

export type ModulesOpts = {
  modules: string[];
  clientDir: string;
  clientFile: string;
  external?: string[];
  denoJsonPath?: string;
};

export const buildModules = async (
  opts: Readonly<ModulesOpts & { outDir: string }>,
): Promise<ServedMeta> => {
  const [context, cssContext, served] = await mkContext(opts);
  try {
    const [result, cssResult] = await Promise.all([
      context.rebuild(),
      cssContext.rebuild(),
    ]);
    if (result.errors.length + cssResult.errors.length) {
      throw Error(
        [...result.errors, ...cssResult.errors]
          .map((e) => e.text).join("\n"),
      );
    }
    return served.meta();
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
  const [context, cssContext, served] = await mkContext(opts);
  await context.watch();
  await context.rebuild();
  await cssContext.watch();
  await cssContext.rebuild();

  return {
    served,
    stop: async () => {
      await context.dispose();
      await cssContext.dispose();
      await esbuild.stop();
    },
  };
};

const mkContext = async (
  {
    denoJsonPath,
    modules,
    external,
    clientDir,
    clientFile,
    outDir,
  }: Readonly<ModulesOpts & { outDir?: string }>,
) => {
  let lastResult: esbuild.BuildResult<{ write: false }>;
  let lastCssResult: esbuild.BuildResult<{ write: false }>;
  const served = createServedContext(
    outDir
      ? undefined
      // deno-lint-ignore require-await
      : async (publicPath) =>
        (/\.css(?:\.map)?$/.test(publicPath) ? lastCssResult : lastResult)
          .outputFiles
          .find((f) => relative(Deno.cwd(), f.path) === publicPath)
          ?.contents,
  );

  const cssEntry: string[] = [join(clientDir, "*.css")];
  for (let i = modules.length - 1; i >= 0; i--) {
    if (modules[i].endsWith(".css")) cssEntry.unshift(modules.splice(i, 1)[0]);
  }

  const cssContext = await esbuild.context({
    entryPoints: cssEntry,
    logOverride: { "empty-glob": "silent" },
    outbase: clientDir,
    outdir: outDir ?? ".",
    write: !!outDir,
    format: "esm",
    bundle: true,
    splitting: true,
    minify: true,
    sourcemap: true,
    metafile: true,
    plugins: [{
      name: "serve",
      setup(build) {
        build.onEnd((result) => {
          lastCssResult = result;
          if (result.metafile) {
            for (
              let [outPath, { entryPoint }] of Object.entries(
                result.metafile.outputs,
              )
            ) {
              served.add(
                entryPoint ? `./${entryPoint}` : outPath,
                toFileUrl(resolve(entryPoint ?? outPath)).href,
                outPath,
              );
            }
          }
        });
      },
    }],
  });

  const context = await esbuild.context({
    entryPoints: [
      ...modules,
      join(clientDir, "*.ts"),
      join(clientDir, "*.tsx"),
    ],
    logOverride: { "empty-glob": "silent" },
    external,
    outbase: clientDir,
    outdir: outDir ?? ".",
    entryNames: "[dir]/[name]-[hash]",
    write: !!outDir,
    bundle: true,
    splitting: true,
    minify: true,
    sourcemap: true,
    metafile: true,
    format: "esm",
    charset: "utf8",
    plugins: [
      ...denoPlugins({
        configPath: resolve(
          denoJsonPath ??
            (await exists("deno.jsonc") ? "deno.jsonc" : "deno.json"),
        ),
      }),
      {
        name: "generate-ts-bindings",
        setup(build) {
          let prevClient: string | Promise<string> = Deno
            .readTextFile(clientFile).catch((_) => "");
          build.onEnd(async (result) => {
            if (!result.metafile) return;

            const dir = dirname(clientFile);

            const posixDir = toPosix(dir);
            const posixClientDir = toPosix(clientDir);

            const moduleByItsPath = Object.fromEntries(
              modules.map((m) => [
                posixRelative(
                  Deno.cwd(),
                  posixFromFileUrl(import.meta.resolve(m)),
                ),
                m,
              ]),
            );
            const outputEntries = Object.entries(result.metafile!.outputs);
            const outs: {
              entryPoint: string;
              modulePath: string;
              moduleName: string;
            }[] = [];

            for (let [outPath, { entryPoint }] of outputEntries) {
              if (entryPoint) {
                entryPoint = entryPoint.replace(/^[A-z-]+:/, "");
                const rel = posixRelative(posixClientDir, entryPoint);
                const [moduleName, modulePath] = rel.startsWith(externalPrefix)
                  ? [
                    moduleByItsPath[entryPoint] ?? entryPoint,
                    moduleByItsPath[entryPoint] ?? entryPoint,
                  ]
                  : [
                    rel.replace(/\.[jt]sx?$/, ""),
                    "./" + posixRelative(posixDir, entryPoint),
                  ];

                served.add(
                  moduleName,
                  toFileUrl(resolve(entryPoint)).href,
                  outPath,
                );

                if (outPath.endsWith(".js")) {
                  outs.push({
                    entryPoint,
                    moduleName,
                    modulePath,
                  });
                }
              } else {
                served.add(outPath, toFileUrl(resolve(outPath)).href, outPath);
              }
            }

            const newClient = `import "@classic/js";

declare module "@classic/js" {
  interface Module {${
              outs.map(({ moduleName, modulePath }) =>
                `\n    ${JSON.stringify(moduleName)}: typeof import(${
                  JSON.stringify(modulePath)
                });`
              ).join("")
            }
  }
}
`;

            if (newClient !== await prevClient) {
              await Deno.writeTextFile(clientFile, newClient);
              prevClient = newClient;
            }
          });
        },
      } satisfies esbuild.Plugin,

      {
        name: "classic-watch",
        setup(build) {
          build.onEnd((result) => {
            lastResult = result;
            served.notify();
          });
        },
      } satisfies esbuild.Plugin,
    ],
  });

  return [context, cssContext, served] as const;
};
