import {
  denoLoaderPlugin,
  denoResolverPlugin,
} from "@luca/esbuild-deno-loader";
import { exists } from "@std/fs";
import { join, relative, resolve, SEPARATOR } from "@std/path";
import * as esbuild from "esbuild";

export type ElementsBundle = {
  // **Not** readonly (dev mode)
  js: Promise<Uint8Array>;
  css: Promise<Uint8Array | undefined>;
};

export const buildElements = async (
  {
    elementsDir,
    elementsDeclarationFile,
    extraModules = [],
    denoJsonPath,
    transformCss,
  }: BuildElementsOpts & {
    readonly transformCss?: (css: string) => string;
  },
): Promise<{ js: Uint8Array; css?: Uint8Array }> => {
  const elementFiles: string[] = [];
  for await (const { name, isFile } of Deno.readDir(elementsDir)) {
    if (isFile && tsRegExp.test(name)) {
      elementFiles.push(`${elementsDir}/${name}`);
    }
  }

  const result = await esbuild.build({
    stdin: {
      contents: [...elementFiles, ...extraModules]
        .map((p) => `import ${JSON.stringify(`./${toPosix(p)}`)};`)
        .join("\n"),
      loader: "js",
      resolveDir: ".",
    },
    outdir: ".",
    bundle: true,
    minify: true,
    sourcemap: false,
    write: false,
    format: "iife",
    charset: "utf8",
    jsx: "automatic",
    jsxImportSource: "@classic/element",
    plugins: [
      {
        name: "accept-stdin",
        setup(build) {
          build.onResolve(
            { filter: /^/ },
            (args) =>
              args.importer === "<stdin>"
                ? {
                  namespace: args.path.endsWith(".css")
                    ? "css-intercept"
                    : "file",
                  path: args.path,
                }
                : undefined,
          );
        },
      },
      ...await resolvePlugins(denoJsonPath),
      ...elementsDeclarationFile
        ? [genTypesPlugin(elementsDir, elementsDeclarationFile)]
        : [],
      ...transformCss
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
        : [],
    ],
  });
  await esbuild.stop();

  const byExt = result.outputFiles.reduce((byExt, file) => {
    const [, ext] = file.path.match(extensionRegExp)!;
    byExt[ext] ??= { length: 0, files: [] };
    byExt[ext].files.push(file.contents);
    byExt[ext].length += file.contents.length;
    return byExt;
  }, {} as Record<string, { length: number; files: Uint8Array[] }>);

  return Object.fromEntries(
    Object.entries(byExt).map(([ext, { length, files }]) => {
      const contents = new Uint8Array(length);
      let i = 0;
      for (const bytes of files) {
        contents.set(bytes, i);
        i += bytes.length;
      }
      return [ext, contents];
    }),
  ) as { js: Uint8Array; css?: Uint8Array };
};

export type BuildElementsOpts = {
  readonly elementsDir: string;
  readonly elementsDeclarationFile?: string;
  readonly extraModules?: string[];
  readonly denoJsonPath?: string;
};

export const devElements = async (
  {
    elementsDir,
    elementsDeclarationFile,
    extraModules = [],
    denoJsonPath,
    host = "localhost",
    port,
  }: BuildElementsOpts & {
    readonly host?: string;
    readonly port?: number;
  },
): Promise<{
  stop: () => Promise<void>;
  bundle: ElementsBundle;
  hmr: string;
}> => {
  type Result = esbuild.BuildResult<typeof opts>;
  let last: Result | null = null;
  let next = Promise.withResolvers<Result>();

  const opts = {
    entryPoints: [join(elementsDir, "*"), ...extraModules],
    outbase: elementsDir,
    outdir: ".",
    metafile: true,
    sourcemap: true,
    write: false,
    bundle: true,
    // entryNames: "[name]-[hash]",
    // splitting: true,
    // format: "esm",
    charset: "utf8",
    jsx: "automatic",
    jsxImportSource: "@classic/element",
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

  if (elementsDeclarationFile) {
    opts.plugins.push(genTypesPlugin(elementsDir, elementsDeclarationFile));
  }

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
                  return outFile.text + ";";
                  // return `import("http://${server.host}:${server.port}/${relativePath}");`;
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
      denoResolverPlugin({ configPath }),
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
      denoLoaderPlugin({ configPath }),
    ];
  } else {
    return [];
  }
};

const tsRegExp = /^(.+)\.tsx?$/;

const taggedCssRegExp = /\bcss(`(?:[^\\]\\`|[^`])+`)/g;

const extensionRegExp = /\.([^.]+)$/;

const genTypesPlugin = (
  elementsDir: string,
  typesFile: string,
): esbuild.Plugin => ({
  name: "generate-types",
  setup(build) {
    let prevDef: string | Promise<string> = Deno
      .readTextFile(typesFile).catch((_) => "");

    build.onEnd(async () => {
      const elementToSrc: [string, string][] = [];
      for await (const { name, isFile } of Deno.readDir(elementsDir)) {
        const match = name.match(tsRegExp);
        if (isFile && match) {
          elementToSrc.push([match[1], `./${toPosix(elementsDir)}/${name}`]);
        }
      }

      const newDef = `import "@classic/element";

declare module "@classic/element" {
  namespace Classic {
    interface Elements {
${
        elementToSrc.map(([name, src]) =>
          `      ${JSON.stringify(name)}: typeof import(${
            JSON.stringify(src)
          })["default"];`
        ).join("\n")
      }
    }
  }
}
`;

      if (newDef !== await prevDef) {
        await Deno.writeTextFile(typesFile, newDef);
        prevDef = newDef;
      }
    });
  },
});

const toPosix: (p: string) => string = SEPARATOR === "/"
  ? (p) => p
  : (p) => p.replaceAll(SEPARATOR, "/");
