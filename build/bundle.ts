import {
  denoLoaderPlugin,
  denoResolverPlugin,
} from "@luca/esbuild-deno-loader";
import { exists } from "@std/fs";
import {
  basename,
  dirname,
  join,
  relative,
  resolve,
  SEPARATOR,
  toFileUrl,
} from "@std/path";
import cssnano from "cssnano";
import * as esbuild from "esbuild";
import postcss from "postcss";

export type Bundle = {
  // **Not** readonly (dev mode)
  js: Promise<Uint8Array>;
  css: Promise<Uint8Array | undefined>;
};

export type BundleOpts = {
  readonly elementsDir: string;
  readonly elementsDeclarationFile?: string;
  readonly extraModules?: string[];
  readonly external?: string[];
  readonly transformCss?: CSSTransformer;
  readonly denoJsonPath?: string;
};

export const buildBundle = async (
  {
    elementsDir,
    elementsDeclarationFile,
    extraModules = [],
    external,
    transformCss = defaultCssTransform(),
    denoJsonPath,
  }: BundleOpts,
): Promise<{ js: Uint8Array; css?: Uint8Array }> => {
  const [elements, cssFiles] = await Promise.all([
    readElements(elementsDir),
    readGlobalCSS(elementsDir),
  ]);

  const result = await esbuild.build({
    stdin: {
      contents: [
        ...extraModules.map((p) =>
          `import ${JSON.stringify(`./${toPosix(p)}`)};`
        ),
        `import { define } from "@classic/element";`,
        ...elements.map(([, path], i) =>
          `import e${i} from ${JSON.stringify(`./${toPosix(path)}`)};`
        ),
        ...elements.map(([name], i) =>
          `define(${JSON.stringify(name)}, e${i});`
        ),
        ...cssFiles.map((path) =>
          `import ${JSON.stringify(`./${toPosix(path)}`)};`
        ),
      ].join("\n"),
      loader: "js",
      sourcefile: "__in.js",
      resolveDir: ".",
    },
    external,
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
                  path: resolve(args.path),
                }
                : undefined,
          );
        },
      },
      ...await resolvePlugins(elementsDir, denoJsonPath, transformCss),
      ...elementsDeclarationFile
        ? [genTypesPlugin(elementsDir, elementsDeclarationFile)]
        : [],
    ],
  });

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

export const devBundle = async (
  {
    elementsDir,
    elementsDeclarationFile,
    extraModules = [],
    external,
    transformCss,
    denoJsonPath,
    host = "localhost",
    port,
  }: BundleOpts & {
    readonly host?: string;
    readonly port?: number;
  },
): Promise<{
  stop: () => Promise<void>;
  bundle: Bundle;
  hmr: string;
}> => {
  type Result = esbuild.BuildResult<typeof opts>;
  let last: Result | null = null;
  let next = Promise.withResolvers<Result>();

  const opts = {
    entryPoints: [...extraModules, "@classic/element", join(elementsDir, "*")],
    external,
    outbase: elementsDir,
    outdir: ".",
    metafile: true,
    write: false,
    format: "iife",
    globalName: "exports",
    bundle: true,
    charset: "utf8",
    jsx: "automatic",
    jsxImportSource: "@classic/element",
    logOverride: { "empty-glob": "silent" },
    plugins: [
      ...await resolvePlugins(elementsDir, denoJsonPath, transformCss),
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
        return Promise.resolve(last ?? next.promise).then(async (result) => {
          const classicElementEntry = import.meta.resolve("@classic/element");
          const elements = await readElements(elementsDir);
          const elementNameByPath = Object.fromEntries(
            elements.map(([name, path]) => [path, name]),
          );
          return encoder.encode([
            "{",
            ...result.outputFiles
              .flatMap((outFile) => {
                const ext = outFile.path.match(extensionRegExp)![1];
                const outPath = relative(Deno.cwd(), outFile.path);
                const { entryPoint } = result.metafile.outputs[outPath]!;
                if (ext === "js" && entryPoint) {
                  if (
                    toFileUrl(resolve(entryPoint)).href === classicElementEntry
                  ) {
                    return [outFile.text, `const { define } = exports;`];
                  } else if (elementNameByPath[entryPoint]) {
                    return [
                      outFile.text,
                      `define(${
                        JSON.stringify(elementNameByPath[entryPoint])
                      }, exports.default);`,
                    ];
                  }
                  return [outFile.text];
                } else {
                  return [];
                }
              }),
            "}",
            `new EventSource("http://${server.host}:${server.port}/esbuild").addEventListener("change", () => location.reload());`,
          ].join("\n"));
        });
      },
    },
    hmr: `http://${server.host}:${server.port}/esbuild`,
  };
};

const resolvePlugins = async (
  elementsDir: string,
  denoJsonPath?: string,
  transformCss?: CSSTransformer,
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
          const absElementsDir = resolve(elementsDir);
          const scopeElementCss = async (path: string) => {
            if (dirname(resolve(path)) === absElementsDir) {
              const contents = await Deno.readTextFile(path);
              return {
                contents: contents
                  .replaceAll(/:element\b/g, basename(path, ".css")),
                loader: "css",
              } as const;
            } else {
              return {
                contents: await Deno.readFile(path),
                loader: "css",
              } as const;
            }
          };

          build.onResolve(
            { filter: /\.css$/, namespace: "file" },
            (args) => ({ path: args.path, namespace: "css-intercept" }),
          );
          build.onLoad(
            { filter: /\.css$/, namespace: "css-intercept" },
            (args) => scopeElementCss(args.path),
          );
          // Probably an esbuild bug: CSS matched with a glob don't go though resolvers and land into loaders' file namespace
          build.onLoad(
            { filter: /\.css$/, namespace: "file" },
            (args) => scopeElementCss(args.path),
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
      ...transformCss ? [transformCssPlugin(transformCss)] : [],
      denoLoaderPlugin({ configPath }),
    ];
  } else {
    return [];
  }
};

const tsRegExp = /^(.+)\.tsx?$/;

const taggedCssRegExp = /\bcss(`(?:[^\\]\\`|[^`])+`)/g;

const extensionRegExp = /\.([^.]+)$/;

const readElements = async (elementsDir: string) => {
  const elements: [string, string][] = [];
  for await (const { name, isFile } of Deno.readDir(elementsDir)) {
    const match = name.match(tsRegExp);
    if (isFile && match) {
      elements.push([match[1], `${elementsDir}/${name}`]);
    }
  }
  return elements;
};

const readGlobalCSS = async (elementsDir: string) => {
  const cssFiles: string[] = [];
  for await (const { name, isFile } of Deno.readDir(elementsDir)) {
    if (isFile && name.endsWith(".css")) {
      cssFiles.push(`${elementsDir}/${name}`);
    }
  }
  return cssFiles;
};

export type CSSTransformer = (css: string, from: string) => Promise<string>;

const transformCssPlugin = (transformCss: CSSTransformer) => ({
  name: "transform-tagged-css",
  setup(build) {
    build.onLoad({ filter: /\.([jt]sx?)$/ }, async (args) => {
      let prevIndex = 0;
      const parts: string[] = [];
      const source = await Deno.readTextFile(args.path);
      for (const match of source.matchAll(taggedCssRegExp)) {
        try {
          const css = await transformCss(
            new Function(`return ${match[1]}`)(),
            args.path,
          );
          parts.push(
            source.slice(prevIndex, match.index),
            `\`${css.replaceAll("`", "\\`")}\``,
          );
        } catch (e) {
          const lines = source.split("\n");
          let i = 0, l = 0;
          for (const line of lines) {
            if (i + line.length > match.index) break;
            i += line.length + 1;
            l++;
          }
          return {
            errors: [{
              text: e instanceof TransformCSSError ? e.text : e.toString(),
              location: e instanceof TransformCSSError
                ? {
                  file: args.path,
                  lineText: e.lineText,
                  line: l + e.line,
                  column: e.line === 1 ? match.index - i + e.column : e.column,
                }
                : {
                  file: args.path,
                  lineText: lines[l],
                  line: l + 1,
                  column: match.index - i + 1,
                },
            }],
          };
        }
        prevIndex = match.index + match[0].length;
      }

      if (parts.length) {
        parts.push(source.slice(prevIndex));
        return {
          loader: args.path.match(extensionRegExp)![1] as any,
          contents: parts.join(""),
        };
      }
    });
  },
} satisfies esbuild.Plugin);

class TransformCSSError {
  lineText!: string;
  line!: number;
  column!: number;

  constructor(
    readonly text: string,
    location: Pick<esbuild.Location, "lineText" | "line" | "column">,
  ) {
    Object.assign(this, location);
  }
}

const defaultCssTransform = () => {
  let build: postcss.Processor | null = null;
  return async (css: string, from: string) => {
    build ??= postcss([cssnano({ preset: "default" })]);
    try {
      const result = await build.process(css, { from });
      return result.css;
    } catch (e) {
      throw new TransformCSSError(e.toString(), {
        lineText: e.source.split("\n")[e.line - 1],
        line: e.line,
        column: e.column,
      });
    }
  };
};

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
  interface CustomElements {
${
        elementToSrc.map(([name, src]) =>
          `    ${JSON.stringify(name)}: typeof import(${
            JSON.stringify(src)
          })["default"];`
        ).join("\n")
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
