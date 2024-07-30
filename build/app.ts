import {
  createServedContext,
  loadServedContext,
  ModuleLoader,
  ServedJSContext,
} from "@classic/js";
import {
  basename,
  dirname,
  join,
  resolve,
  SEPARATOR,
  toFileUrl,
} from "@std/path";
import { Bundle, bundleCss, bundleJs, CSSTransformer } from "./bundle.ts";
import { buildModules, devModules } from "./modules.ts";
import { generateBindings } from "./bundle.ts";

export type AppBuild = {
  critical: Bundle;
  deferred: ServedJSContext;
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
  deferredModules: string[];
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
  deferredModules,
  external,
  transformCss,
  denoJsonPath,
}: Readonly<BuildOpts>): Promise<AppBuild> => {
  const context = createServedContext();
  await Promise.all([
    devModules({
      modules: [
        ...criticalModules,
        "@classic/element",
        join(elementsDir, "*.ts"),
        join(elementsDir, "*.tsx"),
        ...deferredModules,
        join(clientDir, "*.ts"),
        join(clientDir, "*.tsx"),
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
        join(clientDir, "*.css"),
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
    criticalStyleSheets.map((path) => resolve(path)),
  );
  context.add(
    ".dev/global.css",
    null,
    "memory://.dev/global.css",
    ".dev/global.css",
    () =>
      new TextEncoder().encode(
        context.meta().modules.flatMap(({ name, src, pub }) =>
          name !== ".dev/global.css" &&
            !absCriticalCSS.has(resolve(name)) &&
            pub.endsWith(".css")
            ? `@import url(${JSON.stringify(context.resolve(src)!)});`
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
              const pub = context.resolve(
                toFileUrl(resolve(elementsDir, name)).href,
              );
              if (pub) elements.push([name.replace(/\.[^.]+$/, ""), pub]);
            }
          }

          return new TextEncoder().encode(
            `(async () => {
            ${
              criticalModules
                .map((m) => `import(${JSON.stringify(context.resolve(m))});`)
                .join("\n")
            }
            const { define } = await import(${
              JSON.stringify(context.resolve("@classic/element"))
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
            criticalStyleSheets.map((s) =>
              context.load(toFileUrl(resolve(s)).href)
            ),
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
    deferred: context,
    globalCssPublic: context.resolve(".dev/global.css"),
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
  deferredModules,
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
        modules: deferredModules,
        moduleBase: clientDir,
        external,
        denoJsonPath,
      }),
    ]).then(async ([globalCss, deferred]) => {
      deferred.add(
        "global.css",
        null,
        "memory://global.css",
        "global.css",
        () => globalCss,
      );

      await deferred.generateBindings(clientFile);

      const meta = deferred.meta();

      const dir = join(outDir, "defer");
      await Promise.all([
        ...meta.modules.map(async ({ src, pub }) => {
          const path = join(dir, pub);
          await Deno.mkdir(dirname(path), { recursive: true });
          await Deno.writeFile(path, (await deferred.load(src))!);
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
  const deferred = loadServedContext(
    meta.deferred,
    fileLoader(join(outDir, "defer")),
  );
  return {
    critical: {
      js: Deno.readFile(join(outDir, "critical.js")),
      css: Deno.readFile(join(outDir, "critical.css")).catch((_) => undefined),
    },
    globalCssPublic: deferred.resolve("memory://global.css"),
    deferred,
  };
};

const fileLoader: (base: string) => ModuleLoader = (base) => (url) =>
  Deno.readFile(join(base, url));

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
