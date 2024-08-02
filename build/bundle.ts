import { denoPlugins } from "@luca/esbuild-deno-loader";
import { exists } from "@std/fs";
import { dirname, relative, resolve, SEPARATOR } from "@std/path";
import * as esbuild from "esbuild";
import { transform } from "lightningcss";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export type Bundle = {
  // **Not** readonly (dev mode)
  js: Promise<Uint8Array>;
  css: Promise<Uint8Array | undefined>;
};

export const bundleJs = async ({
  input,
  external,
  denoJsonPath,
  transformCss = minifyCss,
}: Readonly<{
  input: string;
  external?: string[];
  denoJsonPath?: string;
  transformCss?: CSSTransformer;
}>): Promise<Uint8Array> => {
  const result = await esbuild.build({
    stdin: {
      contents: input,
      loader: "ts",
      sourcefile: "__in.js",
      resolveDir: ".",
    },
    external,
    outdir: ".",
    bundle: true,
    minify: true,
    sourcemap: false,
    write: false,
    format: "esm",
    charset: "utf8",
    jsx: "automatic",
    jsxImportSource: "@classic/element",
    plugins: [
      transformCssPlugin(transformCss),
      ...denoPlugins({
        configPath: resolve(
          denoJsonPath ??
            (await exists("deno.jsonc") ? "deno.jsonc" : "deno.json"),
        ),
      }),
    ],
  });

  return result.outputFiles[0]?.contents;
};

export const writeElementBindings = async (
  elementsDir: string,
  outputFile: string,
) => {
  const newBindings = await generateElementBindings(
    elementsDir,
    dirname(outputFile),
  );
  if (newBindings !== await Deno.readTextFile(outputFile).catch(() => null)) {
    return Deno.writeTextFile(outputFile, newBindings);
  }
};

export const generateElementBindings = async (
  elementsDir: string,
  outputDir: string,
) => {
  const relativeBase = "./" +
    toPosix(relative(outputDir, elementsDir));
  const elementToSrc: [string, string][] = [];
  for await (const { name, isFile } of Deno.readDir(elementsDir)) {
    const match = name.match(tsRegExp);
    if (isFile && match) {
      elementToSrc.push([match[1], `${relativeBase}/${name}`]);
    }
  }

  return `import "@classic/element";

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
};

export const bundleCss = async ({
  styleSheets,
  external,
  transformCss = minifyCss,
}: Readonly<{
  styleSheets: string[];
  external?: string[];
  transformCss?: CSSTransformer;
}>): Promise<Uint8Array> => {
  const result = await esbuild.build({
    stdin: {
      contents: styleSheets
        .map((s) =>
          `@import url(${JSON.stringify(s[0] === "/" ? s.slice(1) : s)});`
        )
        .join("\n"),
      loader: "css",
      sourcefile: "__in.css",
      resolveDir: ".",
    },
    external,
    outdir: ".",
    bundle: true,
    minify: true,
    sourcemap: false,
    write: false,
    format: "esm",
    plugins: [{
      name: "transform-css",
      setup(build) {
        build.onLoad({ filter: /\.css$/ }, async ({ path }) => ({
          contents: transformCss(await Deno.readFile(path), path),
          loader: "css",
        }));
      },
    }],
  });

  return result.outputFiles[0]?.contents;
};

const tsRegExp = /^(.+)\.tsx?$/;

const taggedCssRegExp = /\bcss(`(?:[^\\]\\`|[^`])+`)/g;

const extensionRegExp = /\.([^.]+)$/;

export type CSSTransformer = (css: Uint8Array, filename: string) => Uint8Array;

const transformCssPlugin = (transformCss: CSSTransformer) => ({
  name: "transform-tagged-css",
  setup(build) {
    build.onLoad({ filter: /\.([jt]sx?)$/ }, async (args) => {
      let prevIndex = 0;
      const parts: string[] = [];
      const source = await Deno.readTextFile(args.path);
      for (const match of source.matchAll(taggedCssRegExp)) {
        try {
          const css = decoder.decode(
            transformCss(
              encoder.encode(new Function(`return ${match[1]}`)()),
              args.path,
            ),
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

const minifyCss: CSSTransformer = (css, filename) => {
  try {
    const { code } = transform({
      filename,
      code: css,
      minify: true,
      sourceMap: true,
    });
    return code;
  } catch (e) {
    throw new TransformCSSError(e.toString(), {
      lineText: e.source.split("\n")[e.loc.line - 1],
      line: e.loc.line,
      column: e.loc.column,
    });
  }
};

const toPosix: (p: string) => string = SEPARATOR === "/"
  ? (p) => p
  : (p) => p.replaceAll(SEPARATOR, "/");
