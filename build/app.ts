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
  generateBindings,
} from "./bundle.ts";
import { BuildContext, ModuleLoader } from "./context.ts";
import { buildModules, devModules } from "./modules.ts";

export type AppBuild = {
  critical: Bundle;
  context: BuildContext;
  globalCssPublic?: string;
  dev?: true;
};

export type BuildOpts = {
  outDir?: string;
  elementsDir: string;
  elementsDeclarationFile?: string;
  clientDir: string;
  clientFile: string;
  criticalStyleSheets?: string[];
  criticalModules?: string[];
  styleSheets?: string[];
  modules: string[];
  external?: string[];
  transformCss?: CSSTransformer;
  denoJsonPath?: string;
};

export const devApp = async ({
  elementsDir,
  elementsDeclarationFile,
  clientDir,
  clientFile,
  criticalStyleSheets = [],
  criticalModules = [],
  styleSheets = [],
  modules,
  external,
  transformCss,
  denoJsonPath,
}: Readonly<BuildOpts>): Promise<AppBuild> => {
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

  context.generateBindings(clientFile);
  context.watch(() => {
    context.generateBindings(clientFile);
    if (elementsDeclarationFile) {
      generateBindings(elementsDir).then((bindings) =>
        Deno.writeTextFile(elementsDeclarationFile, bindings)
      );
    }
  });

  const absCriticalCSS = new Set(
    criticalStyleSheets.map((path) => "/" + path),
  );
  context.add(
    "//.dev/global.css",
    ".dev/global.css",
    () =>
      new TextEncoder().encode(
        context.meta().modules.flatMap(({ name, outPath }) =>
          name !== "//.dev/global.css" &&
            !absCriticalCSS.has(name) &&
            outPath.endsWith(".css")
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

          return new TextEncoder().encode(
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

export const buildApp = async ({
  outDir,
  elementsDir,
  elementsDeclarationFile,
  clientDir,
  clientFile,
  criticalStyleSheets = [],
  criticalModules = [],
  styleSheets = [],
  modules,
  external,
  transformCss,
  denoJsonPath,
}: Readonly<BuildOpts> & { readonly outDir: string }): Promise<void> => {
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

    elementsDeclarationFile && generateBindings(elementsDir)
      .then((bindings) =>
        Deno.writeTextFile(elementsDeclarationFile, bindings)
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
        modules: modules,
        moduleBase: clientDir,
        external,
        denoJsonPath,
      }),
    ]).then(async ([globalCss, deferred]) => {
      deferred.add(
        "/global.css",
        "global.css",
        () => globalCss,
      );

      await deferred.generateBindings(clientFile);

      const meta = deferred.meta();

      const dir = join(outDir, "defer");
      await Promise.all([
        ...meta.modules.map(async ({ name, outPath }) => {
          const path = join(dir, outPath);
          await Deno.mkdir(dirname(path), { recursive: true });
          await Deno.writeFile(path, await deferred.resolve(name)!.load());
        }),
        Deno.writeTextFile(
          join(outDir, "meta.json"),
          JSON.stringify({ deferred: meta }),
        ),
      ]);
    }),
  ]);
};

export const loadApp = async ({
  outDir,
}: Readonly<
  & Pick<BuildOpts, "clientFile">
  & { outDir: string }
>): Promise<AppBuild> => {
  const meta = JSON.parse(await Deno.readTextFile(join(outDir, "meta.json")));
  const context = BuildContext.load(meta.deferred, fileLoader);
  return {
    critical: {
      js: Deno.readFile(join(outDir, "critical.js")),
      css: Deno.readFile(join(outDir, "critical.css")).catch((_) => undefined),
    },
    globalCssPublic: context.resolve("memory://global.css")?.publicPath,
    context,
  };
};

const fileLoader: ModuleLoader = (path) => Deno.readFile(path);

const elementTransformCss = (
  elementsDir: string,
  transformCss?: CSSTransformer,
): CSSTransformer => {
  const absElementsDir = resolve(elementsDir);
  return async (css, from) => {
    if (dirname(resolve(from)) === absElementsDir) {
      css = css.replaceAll(/:element\b/g, basename(from, ".css"));
    }
    if (transformCss) {
      css = await transformCss(css, from);
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
