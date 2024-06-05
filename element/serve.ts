import * as esbuild from "../deps/esbuild.ts";
import { exists } from "../deps/std/fs.ts";
import { relative, resolve } from "../deps/std/path.ts";

export type ClassicBundle = {
  // **Not** readonly (dev mode)
  js: Promise<Uint8Array>;
  css: Promise<Uint8Array | undefined>;
};

const semi = new Uint8Array([";".charCodeAt(0)]);

export const bundle = async (
  entryPoints: string[],
  { denoJsonPath, transformCss }: {
    denoJsonPath?: string;
    transformCss?: (css: string) => string;
  } = {},
): Promise<{ readonly js: Uint8Array; readonly css?: Uint8Array }> => {
  const result = await esbuild.build({
    entryPoints,
    bundle: true,
    minify: true,
    sourcemap: false,
    write: false,
    format: "iife",
    charset: "utf8",
    jsx: "automatic",
    jsxImportSource: "classic/element",
    plugins: [
      ...await resolvePlugins(denoJsonPath),
      ...(transformCss
        ? [
          {
            name: "transform-tagged-css",
            setup(build) {
              build.onLoad({ filter: /\.([jt]sx?)$/ }, async (args) => {
                const source = await Deno.readTextFile(args.path);
                return {
                  contents: source.replaceAll(
                    taggedCssRegExp,
                    (_, literal) =>
                      `\`${
                        transformCss(new Function(`return ${literal}`)())
                          .replaceAll("`", "\\`")
                      }\``,
                  ),
                };
              });
            },
          } satisfies esbuild.Plugin,
        ]
        : []),
    ],
  });

  const byExt = result.outputFiles.reduce((byExt, file) => {
    const [, ext] = file.path.match(extensionRegExp)!;
    byExt[ext] ??= { length: -1, files: [] };
    byExt[ext].files.push(file);
    byExt[ext].length += file.contents.length + 1;
    return byExt;
  }, {} as Record<string, { length: number; files: esbuild.OutputFile[] }>);

  return Object.fromEntries(
    Object.entries(byExt).map(([ext, { length, files }]) => {
      const contents = new Uint8Array(length);
      for (let i = 0; i < files.length;) {
        contents.set(files[i].contents, i);
        i += files[i].contents.length;
        if (ext === "js" && i < length) contents.set(semi, i++);
      }
      return [ext, contents];
    }),
  ) as { readonly js: Uint8Array; readonly css?: Uint8Array };
};

export const serveDev = async (
  entryPoints: string[],
  { denoJsonPath, host = "localhost", port }: {
    denoJsonPath?: string;
    host?: string;
    port?: number;
  } = {},
): Promise<{
  stop: () => Promise<void>;
  bundle: ClassicBundle;
  hmr: string;
}> => {
  type Result = esbuild.BuildResult<typeof opts>;
  let last: Result | null = null;
  let next = Promise.withResolvers<Result>();

  const opts = {
    entryPoints,
    entryNames: "[name]-[hash]",
    outdir: ".",
    metafile: true,
    sourcemap: true,
    write: false,
    bundle: true,
    format: "esm",
    charset: "utf8",
    jsx: "automatic",
    jsxImportSource: "classic/element",
    plugins: [
      ...await resolvePlugins(denoJsonPath),
      {
        name: "watch-meta",
        setup(build) {
          build.onEnd((result) => {
            last = result;
            next = Promise.withResolvers<Result>();
          });
        },
      },
    ],
  } satisfies esbuild.BuildOptions;

  const context = await esbuild.context(opts);

  await context.watch();

  const server = await context.serve({ host, port });
  const encoder = new TextEncoder();
  console.debug(
    `esbuild listening on http://${server.host}:${server.port}/esbuild`,
  );

  return {
    stop: () => context.dispose(),
    bundle: {
      get css() {
        return Promise.resolve(last ?? next.promise).then((result) =>
          encoder.encode(
            result.outputFiles
              .flatMap((outFile) => {
                const ext = outFile.path.match(extensionRegExp)![1];
                const relativePath = relative(Deno.cwd(), outFile.path);
                if (
                  ext === "css" &&
                  result.metafile.outputs[relativePath]?.entryPoint
                ) {
                  return outFile.text;
                } else {
                  return [];
                }
              })
              .join("\n"),
          )
        );
      },
      get js() {
        return Promise.resolve(last ?? next.promise).then((result) =>
          encoder.encode(`
${
            result.outputFiles
              .flatMap((outFile) => {
                const ext = outFile.path.match(extensionRegExp)![1];
                const relativePath = relative(Deno.cwd(), outFile.path);
                if (
                  ext === "js" &&
                  result.metafile.outputs[relativePath]?.entryPoint
                ) {
                  return `import("http://${server.host}:${server.port}/${relativePath}");`;
                } else {
                  return [];
                }
              })
              .join("\n")
          }
new EventSource("http://${server.host}:${server.port}/esbuild").addEventListener("change", () => location.reload());
`)
        );
      },
    },
    hmr: `http://${server.host}:${server.port}/esbuild`,
  };
};

const resolvePlugins = async (
  denoJsonPath?: string,
): Promise<esbuild.Plugin[]> => {
  if ("Deno" in globalThis) {
    const configPath = resolve(
      denoJsonPath ??
        (await exists("deno.jsonc") ? "deno.jsonc" : "deno.json"),
    );
    return [
      esbuild.denoResolverPlugin({ configPath }),
      {
        name: "deno-loader-css-interceptor",
        setup(build) {
          build.onResolve(
            { filter: /\.css$/, namespace: "file" },
            (args) => ({ path: args.path, namespace: "css-intercept" }),
          );
          build.onLoad(
            { filter: /\.css$/, namespace: "css-intercept" },
            async (args) => ({
              contents: await Deno.readFile(args.path),
              loader: "css",
            }),
          );

          build.onResolve(
            { filter: /^/, namespace: "data" },
            (args) => ({ path: args.path, namespace: "data-intercept" }),
          );
          build.onLoad(
            { filter: /^/, namespace: "data-intercept" },
            (args) => ({ contents: args.path, loader: "dataurl" }),
          );
        },
      } satisfies esbuild.Plugin,
      esbuild.denoLoaderPlugin({ configPath }),
    ];
  } else {
    return [];
  }
};

const taggedCssRegExp = /\bcss(`(?:[^\\]\\`|[^`])+`)/g;

const extensionRegExp = /\.([^.]+)$/;
