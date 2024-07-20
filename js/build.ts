import { denoPlugins } from "@luca/esbuild-deno-loader";
import { basename, dirname, join, resolve } from "@std/path";
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

  const moduleByEntry = Object.fromEntries(
    Object.entries(modules).map(([k, v]) => [v, k]),
  );
  const entryPoints = Object.values(modules);
  const context = esbuild.context({
    entryPoints: Object.entries(modules).map(([spec, path]) => ({
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
      ...denoPlugins({
        configPath: resolve(
          await exists("deno.jsonc") ? "deno.jsonc" : "deno.json",
        ),
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

            for (
              const [outPath, { entryPoint, imports, exports }] of outputEntries
            ) {
              if (
                entryPoint && entryPoints.includes(entryPoint) &&
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

                const exportLines = exports.flatMap((x) =>
                  x === "default"
                    ? []
                    : `export const ${x}: 𐏑JS<𐏑M[${
                      JSON.stringify(x)
                    }]> = ${exportName}[${JSON.stringify(x)}];`
                );

                Deno.writeTextFile(
                  `${join(dir, basename(moduleName))}.js.ts`,
                  `import { type JS as 𐏑JS, js as 𐏑js } from "@classic/js";${
                    importModules.join("")
                  }

type 𐏑M = typeof import(${
                    JSON.stringify("./" + posixRelative(dir, entryPoint))
                  });

const ${exportName}: 𐏑JS<𐏑M> = 𐏑js.module(
  ${JSON.stringify(moduleName)},
  import.meta.resolve(${JSON.stringify(`./${basename(outPath)}`)}),
  { imports: [${externalModules.map((_, i) => `𐏑${i}`).join(", ")}] }
);

export default ${exportName};

${exportLines.join("\n")}
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
