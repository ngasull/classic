import {
  denoLoaderPlugin,
  denoResolverPlugin,
  type DenoResolverPluginOptions,
} from "@luca/esbuild-deno-loader";
import { basename, dirname, join, relative, resolve } from "@std/path";
import { relative as posixRelative } from "@std/path/posix";
import { exists } from "@std/fs";
import * as esbuild from "esbuild";

export type BuildOpts = Readonly<{
  modules: Record<string, string>;
  external?: string[];
  outdir: string;
}>;

const externalPrefix = "/.js/";

const mkContext = async (
  { modules, outdir, external = [] }: BuildOpts,
) => {
  const metaPath = join(outdir, "metafile.json");
  let prevMeta: esbuild.Metafile | undefined = await Deno.readTextFile(metaPath)
    .then((metaJson) => JSON.parse(metaJson) as esbuild.Metafile)
    .catch(() => undefined);

  const externalSet = new Set([...external, ...Object.keys(modules)]);

  const denoOpts: DenoResolverPluginOptions = {
    configPath: resolve(
      await exists("deno.jsonc") ? "deno.jsonc" : "deno.json",
    ),
  };

  const moduleEntries = Object.entries(modules);
  const moduleByEntry = Object.fromEntries(
    moduleEntries.map(([k, v]) => [v, k]),
  );

  const context = esbuild.context({
    entryPoints: moduleEntries.map(([spec, path]) => ({
      in: path,
      out: spec,
    })),
    outdir,
    bundle: true,
    minify: true,
    sourcemap: true,
    metafile: true,
    format: "esm",
    charset: "utf8",
    plugins: [
      {
        name: "external-js",
        setup(build) {
          for (const x of externalSet) {
            build.onResolve({
              filter: new RegExp(
                `^${x.replaceAll(/[\\.[\]()]/g, (m) => "\\" + m)}(?:$|/)`,
              ),
            }, (r) => ({
              external: true,
              path: `${externalPrefix}${r.path}.js`,
            }));
          }
        },
      } satisfies esbuild.Plugin,

      denoResolverPlugin(denoOpts),

      {
        // Entry modules importing each other relatively should refer as external
        name: "entry-to-external",
        setup(build) {
          build.onResolve({ filter: /^/ }, (r) => {
            const m = r.kind !== "entry-point" &&
              moduleByEntry[relative(".", r.path)];
            if (m) return { external: true, path: `${externalPrefix}${m}.js` };
          });
        },
      } satisfies esbuild.Plugin,

      denoLoaderPlugin({
        ...denoOpts,
        // Portable loader doesn't rewrite deno.lock
        loader: "portable",
      }),

      {
        name: "generate-ts-bindings",
        setup(build) {
          build.onEnd(async (result) => {
            if (!result.metafile) return;

            if (prevMeta) {
              await Promise.all(
                Object.keys(prevMeta.outputs)
                  .map((outPath) =>
                    !result.metafile!.outputs[outPath] &&
                    Deno.remove(outPath).catch(() => {
                      // Is ok if already removed
                    })
                  ),
              );
            }

            prevMeta = result.metafile;
            await Deno.writeTextFile(metaPath, JSON.stringify(prevMeta));

            const outputEntries = Object.entries(prevMeta.outputs);
            const outPathByModule = Object.fromEntries(
              outputEntries.flatMap(([outPath, { entryPoint }]) =>
                entryPoint ? [[moduleByEntry[entryPoint], outPath]] : []
              ),
            );

            for (const [outPath, { entryPoint, imports }] of outputEntries) {
              if (
                entryPoint &&
                moduleByEntry[entryPoint] &&
                outPath.endsWith(".js")
              ) {
                const dir = dirname(outPath);
                const moduleName = moduleByEntry[entryPoint];

                const externalModules = [
                  ...new Set(
                    imports.flatMap((i) => {
                      const m = i.path.startsWith(externalPrefix) &&
                        i.path.slice(externalPrefix.length, -3);
                      return m && externalSet.has(m) ? m : [];
                    }),
                  ),
                ];

                const importModules = externalModules.map((m, i) =>
                  `\nimport 𐏑${i} from ${
                    JSON.stringify(
                      outPathByModule[m]
                        ? `./${posixRelative(dir, outPathByModule[m])}.ts`
                        : m + "/js",
                    )
                  };`
                );

                const exportName = basename(moduleName)
                  .replaceAll(
                    /[/\\[\]()-](\w)/g,
                    (_, l: string) => l.toUpperCase(),
                  )
                  .replaceAll(/[/\\[\]()-]/g, "");

                Deno.writeTextFile(
                  `${join(dir, basename(moduleName))}.js.ts`,
                  `import { type JS as 𐏑JS, js as 𐏑js } from "@classic/js";${
                    importModules.join("")
                  }

type 𐏑M = typeof import(${
                    JSON.stringify("./" + posixRelative(dir, entryPoint))
                  });

/**
 * Server wrapper for \`${moduleName}\`
 */
const ${exportName}: 𐏑JS<𐏑M> = 𐏑js.module(
  ${JSON.stringify(moduleName)},
  import.meta.resolve(${JSON.stringify(`./${basename(outPath)}`)}),
  { imports: [${externalModules.map((_, i) => `𐏑${i}`).join(", ")}] }
);

export default ${exportName};
`,
                );
              }
            }
          });
        },
      } satisfies esbuild.Plugin,
    ],
  });

  addEventListener("close", () => {
    esbuild.stop();
  });

  return context;
};

export const build = async (opts: BuildOpts): Promise<void> => {
  const context = await mkContext(opts);
  await context.rebuild();
  await esbuild.stop();
};

export const dev = async (
  { host = "127.0.0.1", port, ...opts }: BuildOpts & {
    readonly host?: string;
    readonly port?: number;
  },
): Promise<{
  host: string;
  port: number;
  hmr: string;
  stop: () => Promise<void>;
}> => {
  const context = await mkContext(opts);
  await context.watch();
  const server = await context.serve({ host, port });

  return {
    ...server,
    get hmr() {
      return `new EventSource("http://${server.host}:${server.port}/esbuild").addEventListener("change", () => location.reload());`;
    },
    stop: () => context.dispose(),
  };
};
