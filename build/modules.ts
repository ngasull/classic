import { createServedContext, ServedJSContext } from "@classic/js";
import { denoPlugins } from "@luca/esbuild-deno-loader";
import { dirname, join, resolve, SEPARATOR } from "@std/path";
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
): Promise<string> => {
  const [context, served] = await mkContext(opts);
  try {
    const result = await context.rebuild();
    if (result.errors.length) {
      throw Error(result.errors.map((e) => e.text).join("\n"));
    }
    return served.meta();
  } finally {
    await context.dispose();
  }
};

export const devModules = async (
  { host = "127.0.0.1", port, ...opts }: Readonly<
    ModulesOpts & { host?: string; port?: number }
  >,
): Promise<{
  served: ServedJSContext;
  host: string;
  port: number;
  hmr: string;
  stop: () => Promise<void>;
}> => {
  const [context, served] = await mkContext(opts);
  await context.watch();
  const server = await context.serve({ host, port });

  await context.rebuild();
  served.base = `http://${server.host}:${server.port}/`;

  return {
    ...server,
    served,
    get hmr() {
      return `new EventSource("http://${server.host}:${server.port}/esbuild").addEventListener("change", () => location.reload());`;
    },
    stop: async () => {
      await context.dispose();
      await esbuild.stop();
    },
  };
};

const mkContext = async (
  opts: Readonly<ModulesOpts & { outDir?: string }>,
) => {
  const { denoJsonPath, modules, external, clientDir, clientFile, outDir } =
    opts;
  const served = createServedContext();

  const context = await esbuild.context({
    entryPoints: [...modules, join(clientDir, "*")],
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

            for (const [outPath, { entryPoint }] of outputEntries) {
              if (outPath.endsWith(".js") && entryPoint) {
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

                served.add(moduleName, entryPoint, outPath);

                outs.push({
                  entryPoint,
                  moduleName,
                  modulePath,
                });
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
    ],
  });

  return [context, served] as const;
};
