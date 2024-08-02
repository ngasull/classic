import {
  basename,
  dirname,
  join,
  relative,
  resolve,
  SEPARATOR,
} from "@std/path";
import { join as posixJoin } from "@std/path/posix";
import {
  Bundle,
  bundleCss,
  bundleJs,
  CSSTransformer,
  generateElementBindings,
} from "./bundle.ts";
import { BuildContext } from "./context.ts";
import { buildModules, devModules, generateClientBindings } from "./modules.ts";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export type AppBuild = {
  critical: Bundle;
  context: BuildContext;
  globalCssPublic?: string;
  dev?: true;
};

export type BuildOpts = {
  outDir?: string;
  elementsDir: string;
  clientDir: string;
  generatedTypesFile: string;
  criticalStyleSheets?: string[];
  criticalModules?: string[];
  styleSheets?: string[];
  modules: string[];
  external?: string[];
  transformCss?: CSSTransformer;
  denoJsonPath?: string;
};

export const devApp = async (opts: Readonly<BuildOpts>): Promise<AppBuild> => {
  const {
    elementsDir,
    clientDir,
    criticalStyleSheets = [],
    criticalModules = [],
    styleSheets = [],
    modules,
    external,
    transformCss,
    denoJsonPath,
  } = opts;
  const context = new BuildContext(clientDir);
  await Promise.all([
    devModules({
      modules: [
        ...criticalModules,
        "@classic/element",
        "/" + posixJoin(elementsDir, "*.ts"),
        "/" + posixJoin(elementsDir, "*.tsx"),
        ...modules,
        "/" + posixJoin(clientDir, "*.ts"),
        "/" + posixJoin(clientDir, "*.tsx"),
      ],
      moduleBase: clientDir,
      external,
      denoJsonPath,
      context,
    }),
    devModules({
      modules: [
        ...criticalStyleSheets,
        ...styleSheets,
        "/" + posixJoin(clientDir, "*.css"),
      ],
      moduleBase: clientDir,
      external,
      transformCss: elementTransformCss(elementsDir, transformCss),
      context,
    }),
  ]);

  writeBindings(context, opts);
  context.watch(() => writeBindings(context, opts));

  const absCriticalCSS = new Set(
    criticalStyleSheets.map((path) => "/" + path),
  );
  context.add(
    ".dev/global.css",
    "//.dev/global.css",
    () =>
      encoder.encode(
        context.modules().flatMap(({ name, path }) =>
          name &&
            name !== "//.dev/global.css" &&
            !absCriticalCSS.has(name) &&
            path.endsWith(".css")
            ? `@import url(${
              JSON.stringify(context.resolve(name)!.publicPath)
            });`
            : []
        ).join("\n"),
      ),
  );

  return {
    critical: {
      get js() {
        return (async () => {
          const elements: [string, string][] = [];
          for await (const { name, isFile } of Deno.readDir(elementsDir)) {
            if (isFile && /\.tsx?$/.test(name)) {
              const mod = context.resolve(
                "/" + toPosix(relative(clientDir, resolve(elementsDir, name))),
              );
              if (mod) {
                elements.push([name.replace(/\.[^.]+$/, ""), mod.publicPath]);
              }
            }
          }

          return encoder.encode(
            `(async () => {
            ${
              criticalModules
                .map((m) =>
                  `import(${JSON.stringify(context.resolve(m)!.publicPath)});`
                )
                .join("\n")
            }
            const { define } = await import(${
              JSON.stringify(context.resolve("@classic/element")!.publicPath)
            });
            ${JSON.stringify(elements)}.forEach(async ([name, src]) => {
              const el = await import(src);
              define(name, el.default);
            });
            })();`,
          );
        })();
      },
      get css() {
        return (async () => {
          if (!criticalStyleSheets.length) return;

          const contents = (await Promise.all(
            criticalStyleSheets.map((s) => context.resolve(s)?.load()),
          )) as Uint8Array[];

          const merged = new Uint8Array(
            contents.reduce((count, c) => count + c.length, 0),
          );
          let i = 0;
          for (const c of contents) {
            merged.set(c, i);
            i += c.length;
          }

          return merged;
        })();
      },
    },
    context: context,
    globalCssPublic: context.resolve("//.dev/global.css")?.publicPath,
    dev: true,
  };
};

export const buildApp = async (
  opts: Readonly<BuildOpts> & { readonly outDir: string },
): Promise<void> => {
  const {
    outDir,
    elementsDir,
    clientDir,
    criticalStyleSheets = [],
    criticalModules = [],
    styleSheets = [],
    modules,
    external,
    transformCss,
    denoJsonPath,
  } = opts;
  const [elements, elementsCss] = await Promise.all([
    readElements(elementsDir),
    readGlobalCSS(elementsDir),
    Deno.mkdir(outDir, { recursive: true }),
  ]);
  await Promise.all([
    bundleJs({
      input: [
        ...criticalModules.map((p) =>
          `import ${JSON.stringify(`./${toPosix(p)}`)};`
        ),
        `import { define } from "@classic/element";`,
        ...elements.map(([, path], i) =>
          `import e${i} from ${JSON.stringify(`./${toPosix(path)}`)};`
        ),
        ...elements.map(([name], i) =>
          `define(${JSON.stringify(name)}, e${i});`
        ),
      ].join("\n"),
      external,
      denoJsonPath,
    }).then((criticalJs) =>
      Deno.writeFile(join(outDir, "critical.js"), criticalJs)
    ),

    bundleCss({
      styleSheets: criticalStyleSheets,
      external,
      transformCss,
    }).then((criticalCss) =>
      Deno.writeFile(join(outDir, "critical.css"), criticalCss)
    ),

    Promise.all([
      bundleCss({
        styleSheets: [...styleSheets, ...elementsCss],
        external,
        transformCss: elementTransformCss(elementsDir, transformCss),
      }),

      buildModules({
        modules: [
          ...modules,
          "/" + posixJoin(clientDir, "*.ts"),
          "/" + posixJoin(clientDir, "*.tsx"),
        ],
        moduleBase: clientDir,
        external,
        denoJsonPath,
      }),
    ]).then(async ([globalCss, deferred]) => {
      deferred.add(
        "global.css",
        "//global.css",
        () => globalCss,
      );

      await writeBindings(deferred, opts);
      await deferred.save(outDir);
    }),
  ]);
};

export const loadApp = async (
  { outDir }: Readonly<{ outDir: string }>,
): Promise<AppBuild> => {
  const context = await BuildContext.load(outDir);
  return {
    critical: {
      js: Deno.readFile(join(outDir, "critical.js")),
      css: Deno.readFile(join(outDir, "critical.css")).catch((_) => undefined),
    },
    globalCssPublic: context.resolve("//global.css")?.publicPath,
    context,
  };
};

const elementTransformCss = (
  elementsDir: string,
  transformCss?: CSSTransformer,
): CSSTransformer => {
  const absElementsDir = resolve(elementsDir);
  return (css, from) => {
    if (dirname(resolve(from)) === absElementsDir) {
      css = encoder.encode(
        decoder.decode(css).replaceAll(/:element\b/g, basename(from, ".css")),
      );
    }
    if (transformCss) {
      css = transformCss(css, from);
    }
    return css;
  };
};

const toPosix: (p: string) => string = SEPARATOR === "/"
  ? (p) => p
  : (p) => p.replaceAll(SEPARATOR, "/");

const tsRegExp = /^(.+)\.tsx?$/;

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

const writeBindings = async (
  context: BuildContext,
  { elementsDir, generatedTypesFile }: Readonly<BuildOpts>,
) => {
  const dir = dirname(generatedTypesFile);
  const bindings = [
    generateClientBindings(context, dir),
    await generateElementBindings(elementsDir, dir),
  ].join("\n");

  if (
    bindings !== await Deno.readTextFile(generatedTypesFile).catch(() => null)
  ) {
    return Deno.writeTextFile(generatedTypesFile, bindings);
  }
};
