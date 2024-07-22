import { denoPlugins } from "@luca/esbuild-deno-loader";
import { dirname, join, resolve, SEPARATOR, toFileUrl } from "@std/path";
import {
  fromFileUrl as posixFromFileUrl,
  relative as posixRelative,
} from "@std/path/posix";
import { exists } from "@std/fs";
import * as esbuild from "esbuild";
import { ServedJSContext } from "./js.ts";

const externalPrefix = `..${SEPARATOR}`;
const toPosix = SEPARATOR === "/"
  ? (p: string) => p
  : (p: string) => p.replaceAll(SEPARATOR, "/");

export const buildAppClient = async (
  opts: ContextOpts & { readonly outDir: string },
): Promise<void> => {
  const context = await mkContext(opts);
  try {
    const result = await context.rebuild();
    if (result.errors.length) {
      throw Error(result.errors.map((e) => e.text).join("\n"));
    }
  } finally {
    await context.dispose();
    await esbuild.stop();
  }
};

export const devAppClient = async (
  { host = "127.0.0.1", port, ...opts }: ContextOpts & {
    readonly host?: string;
    readonly port?: number;
  },
): Promise<{
  served: ServedJSContext;
  host: string;
  port: number;
  hmr: string;
  stop: () => Promise<void>;
}> => {
  const context = await mkContext(opts);
  await context.watch();
  const server = await context.serve({ host, port });

  await context.rebuild();
  const { served } = await import(toFileUrl(resolve(opts.clientFile)).href);

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

type ContextOpts = {
  readonly modules: string[];
  readonly clientDir: string;
  readonly clientFile: string;
  readonly external?: string[];
  readonly outDir?: string;
};

const mkContext = async (opts: ContextOpts) => {
  const { modules, external, clientDir, clientFile, outDir } = opts;
  let prevClient: string | Promise<string> = Deno.readTextFile(clientFile);
  return esbuild.context({
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
          await exists("deno.jsonc") ? "deno.jsonc" : "deno.json",
        ),
      }),
      {
        name: "generate-ts-bindings",
        setup(build) {
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
              outPath: string;
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

                outs.push({
                  outPath,
                  entryPoint,
                  moduleName,
                  modulePath,
                });
              }
            }

            const newClient =
              `import { createServedContext, type JS } from "@classic/js";

export const served = createServedContext();

type Client = {${
                outs.map(({ moduleName, modulePath }) =>
                  `\n  ${JSON.stringify(moduleName)}: JS<typeof import(${
                    JSON.stringify(modulePath)
                  })>,`
                ).join("")
              }
};

/**
 * Client code wrapper
 */
export const client: Client = {${
                outs.map(({ moduleName, modulePath, outPath }) =>
                  `\n  ${JSON.stringify(moduleName)}: served.add(
    ${JSON.stringify(moduleName)},
    import.meta.resolve(${JSON.stringify(modulePath)}),
    ${JSON.stringify(outPath)},
  ),`
                ).join("")
              }
};
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
};
