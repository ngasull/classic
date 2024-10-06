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
  type Bundle,
  bundleCss,
  bundleJs,
  type CSSTransformer,
  generateElementBindings,
} from "./bundle.ts";
import { BuildContext } from "./context.ts";
import { buildModules, devModules, generateClientBindings } from "./modules.ts";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

class AppBuild {
  constructor(
    public dev: boolean,
    public critical: Bundle,
    public context: BuildContext,
    public globalCssPublic: string[],
  ) {}

  fetch(req: Request): void | Promise<Response> {
    const { pathname } = new URL(req.url);

    if (this.dev && pathname === "/.hmr" && req.method === "GET") {
      let cancel: () => void;
      return Promise.resolve(
        new Response(
          new ReadableStream<string>({
            start: (controller) => {
              cancel = this.context.watch(() => {
                controller.enqueue(`event: change\r\n\r\n`);
              });
            },
            cancel: () => {
              cancel();
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        ),
      );
    }

    const match = pathname.match(this.context.servedPathRegExp);
    if (!match) return;
    const [, path, ext] = match;
    return (async () => {
      const res = await this.context.get(path)?.load();
      return res
        ? new Response(res, {
          headers: {
            "Content-Type": contentTypes[ext as keyof typeof contentTypes],
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        })
        : new Response("Module not found", { status: 404 });
    })();
  }
}

export type { AppBuild };

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
    criticalStyleSheets.map((path) => path.replace(/^\/*/, "/")),
  );

  return new AppBuild(
    true,
    {
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
          const contents = await Promise.all(
            criticalStyleSheets.flatMap(async (s) => {
              const cssMod = context.resolve(s);
              return cssMod
                // CSS is inlined : source mapping messes with page path
                ? removeCssSourceMapping(decoder.decode(await cssMod.load()))
                : [];
            }),
          );
          return encoder.encode(contents.join("\n\n"));
        })();
      },
    },
    context,
    context.modules().flatMap(({ name, path }) =>
      name &&
        !absCriticalCSS.has(name) &&
        path.endsWith(".css")
        ? context.resolve(name)!.publicPath
        : []
    ),
  );
};

const contentTypes = {
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
} as const;

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
      Deno.writeTextFile(
        join(outDir, "critical.css"),
        removeCssSourceMapping(decoder.decode(criticalCss)),
      )
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
  const globalCss = context.resolve("//global.css");
  return new AppBuild(
    false,
    {
      js: Deno.readFile(join(outDir, "critical.js")),
      css: Deno.readFile(join(outDir, "critical.css")).catch((_) => undefined),
    },
    context,
    globalCss ? [globalCss.publicPath] : [],
  );
};

const removeCssSourceMapping = (css: string) =>
  css.replace(/\/\*# sourceMappingURL=.+ \*\/\n/, "");

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
