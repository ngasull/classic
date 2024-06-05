import * as esbuild from "../deps/esbuild.ts";
import { exists } from "../deps/std/fs.ts";
import { typeByExtension } from "../deps/std/media_types.ts";
import { fromFileUrl, resolve, toFileUrl } from "../deps/std/path.ts";
import {
  fromFileUrl as posixFromFileUrl,
  resolve as resolvePosix,
} from "../deps/std/path/posix.ts";
import { js } from "./js.ts";
import type { JS } from "./types.ts";

const liveBundles = new Set<Bundle>();

export class Bundle<
  Imports extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly #importedModules = new Set<string>([
    import.meta.resolve("../dom.ts"),
  ]);
  #ctx?: BuildCtx;
  #currentBuild?: {
    promise: Promise<BundleResult>;
    resolve: (result: BundleResult | PromiseLike<BundleResult>) => void;
  };
  readonly #resultHandlers = new Set<(result: BundleResult) => void>();
  #watcher?: (req: Request) => Promise<Response | void>;
  #markedRebuild?: number;

  private constructor() {}

  static init<
    Imports extends Record<string, unknown> = Record<string, unknown>,
  >(): Bundle<Imports> {
    return new Bundle<Imports>();
  }

  async build({
    denoJsonPath,
    minify = false,
    publicPath = "/public/m",
    sourcemap = !minify,
    esbuildOptions,
  }: {
    denoJsonPath?: string;
    minify?: boolean;
    publicPath?: string;
    sourcemap?: boolean;
    esbuildOptions?: (options: esbuild.BuildOptions) => unknown;
  } = {}): Promise<BundleResult> {
    const resolver = Promise.withResolvers<BundleResult>();
    this.#currentBuild?.resolve(resolver.promise);
    this.#currentBuild = resolver;

    const configPath = resolve(
      denoJsonPath ?? (await exists("deno.jsonc") ? "deno.jsonc" : "deno.json"),
    );
    const outdir = "public/m";
    const options = {
      entryPoints: [...this.#importedModules],
      entryNames: "[name]-[hash]",
      bundle: true,
      splitting: true,
      minify,
      sourcemap,
      metafile: true,
      write: false,
      outdir,
      publicPath,
      format: "esm",
      charset: "utf8",
      plugins: [
        ...esbuild.denoPlugins({ configPath }),
        {
          name: "notify-watch-plugin",
          setup: (build) => {
            build.onEnd(
              (
                result: esbuild.BuildResult<{ metafile: true; write: false }>,
              ) => {
                if (!result.errors.length && this.#currentBuild === resolver) {
                  const cwdURL = toFileUrl(Deno.cwd()) + "/";
                  const absOutdirPosixLength =
                    (resolvePosix(outdir) + "/").length;

                  const outputs = Object.entries(result.metafile.outputs).map((
                    [path, meta],
                    i,
                  ) => ({
                    path: posixFromFileUrl(toFileUrl(resolve(path)))
                      .slice(absOutdirPosixLength),
                    contents: result.outputFiles[i].contents,
                    entryPoint: meta.entryPoint
                      ? new URL(meta.entryPoint, cwdURL)
                      : undefined,
                  }));

                  const bundleResult = BundleResult.init(outputs, publicPath);
                  resolver.resolve(
                    this.watched
                      ? bundleResult
                      : this.dispose().then(() => bundleResult),
                  );
                  for (const cb of this.#resultHandlers) {
                    cb(bundleResult);
                  }
                }
              },
            );
          },
        },
      ],
    } satisfies esbuild.BuildOptions;
    if (esbuildOptions) await esbuildOptions(options);

    liveBundles.add(this);
    const ctx = await esbuild.context(options);
    ctx.rebuild();
    this.#ctx?.dispose();
    this.#ctx = ctx;

    return this.#currentBuild.promise;
  }

  get result(): Promise<BundleResult> {
    return this.#currentBuild?.promise ?? this.build();
  }

  get watched(): boolean {
    return !!this.#watcher;
  }

  add<P extends keyof Imports>(module: P): JS<Imports[P]>;
  add<T>(module: string): JS<T>;
  add<T>(module: string): JS<T> {
    if (!/^\w+:/.test(module)) {
      throw Error(
        `"${module}" isn't an URL specifier. \`import.meta.resolve\` can be used`,
      );
    }

    this.#importedModules.add(module);

    if (this.#ctx) {
      if (this.watched) {
        this.#markedRebuild ??= setTimeout(() => {
          this.#markedRebuild = undefined;
          this.build();
        });
      } else {
        throw Error(
          `Module ${module} can't be added to bundle: app is already running`,
        );
      }
    }

    return js.module(module);
  }

  async load(opts: {
    assetsRoot: string;
    metaPath: string;
  }): Promise<void> {
    this.#currentBuild = Promise.withResolvers();
    this.#currentBuild.resolve(BundleResult.load(opts));
    await this.#currentBuild.promise;
  }

  watch(
    { onResult, ...opts }: Parameters<typeof this.build>[0] & {
      onResult?: (result: BundleResult) => void | PromiseLike<void>;
    } = {},
  ): (req: Request) => Promise<Response | void> {
    if (!this.#currentBuild) this.build(opts);
    return this.#watcher ??= (() => {
      let prevCtx: BuildCtx | null = null;
      let baseURL = "";
      this.#resultHandlers.add(async (result) => {
        if (this.#ctx != prevCtx) {
          prevCtx = this.#ctx!;
          await prevCtx.watch();
          const { port } = await prevCtx.serve({ host: "127.0.0.1" });
          baseURL = `http://127.0.0.1:${port}`;
        }

        onResult?.(result);
      });

      return async (req) => {
        const result = await this.result;
        const { pathname } = new URL(req.url);

        if (
          req.headers.get("Accept") === "text/event-stream" &&
          pathname.startsWith("/hmr")
        ) {
          const res = await fetch(new URL("/esbuild", baseURL), req);
          return new Response(res.body, { headers: res.headers });
        }

        if (pathname.startsWith(result.publicRoot)) {
          const contents = result.contents(pathname);
          if (!contents) return new Response("Not found", { status: 404 });

          const headers = new Headers();

          const ext = pathname.match(/(\.[^./]+)?$/)![1];
          const type = ext && typeByExtension(ext);
          if (type) headers.set("Content-Type", `${type}; charset=UTF-8`);

          return new Response(contents, { headers });
        }
      };
    })();
  }

  // deno-lint-ignore require-await
  async generateTypes(): Promise<string> {
    return `// AUTO-GENERATED FILE, DO NOT MODIFY
// deno-lint-ignore-file
/* eslint-disable */

export type Types = {${
      [...this.#importedModules]
        .map((path) =>
          `\n  ${JSON.stringify(path)}: typeof import(${JSON.stringify(path)});`
        )
        .join("")
    }
};
`;
  }

  async writeTypes(path: string): Promise<void> {
    const webModulesContent = await this.generateTypes();
    try {
      if (
        await Deno.readTextFile(path) !== webModulesContent
      ) throw 1;
    } catch (_) {
      await Deno.writeTextFile(path, webModulesContent);
    }
  }

  async dispose(): Promise<void> {
    await this.#ctx?.dispose();

    liveBundles.delete(this);
    if (liveBundles.size === 0) {
      esbuild.stop();
    }
  }
}

type BuildCtx = esbuild.BuildContext<{ metafile: true }>;

export class BundleResult {
  readonly publicRoot: string;
  readonly #outputByPath: Map<
    string, // Output path (not public path yet)
    BundleOutput
  >;
  readonly #outputByEntryPoint = new Map<
    string, // Entry point URL
    BundleOutput
  >();

  private constructor(
    publicRoot: string,
    outputByPublicPath: Map<string, BundleOutput>,
  ) {
    this.publicRoot = publicRoot.replace(/\/*$/, "/");
    this.#outputByPath = outputByPublicPath;

    for (const output of outputByPublicPath.values()) {
      if (output.entryPoint) {
        this.#outputByEntryPoint.set(output.entryPoint.toString(), output);
      }
    }
  }

  static init(
    outputs: readonly BundleOutput[],
    publicRoot: string,
  ): BundleResult {
    return new BundleResult(
      publicRoot,
      new Map(outputs.map((output) => [output.path, output])),
    );
  }

  static async load({ assetsRoot, metaPath }: {
    assetsRoot: string;
    metaPath: string;
  }): Promise<BundleResult> {
    const meta: BundleResultMeta = JSON.parse(
      await Deno.readTextFile(metaPath),
    );
    const staticRootUrl = toFileUrl(resolve(assetsRoot)) + "/";
    return BundleResult.init(
      await Promise.all(
        meta.outputs.map(async ({ path, entryPoint }) => ({
          path,
          entryPoint: entryPoint ? new URL(entryPoint) : undefined,
          contents: await Deno.readFile(new URL(path, staticRootUrl)),
        })),
      ),
      meta.publicRoot,
    );
  }

  meta(): BundleResultMeta {
    return {
      outputs: [...this.#outputByPath.values()].map(({ path, entryPoint }) => ({
        path,
        entryPoint: entryPoint?.toString(),
      })),
      publicRoot: this.publicRoot,
    };
  }

  contents(publicPath: string): Uint8Array | undefined {
    const path = publicPath.slice(this.publicRoot.length);
    return this.#outputByPath.get(path)?.contents;
  }

  publicPath(module: string): string | undefined {
    const path = this.#outputByEntryPoint.get(module)?.path;
    return path && this.publicRoot + path;
  }

  async write({ assetsRoot, metaPath }: {
    readonly assetsRoot: string;
    readonly metaPath: string;
  }): Promise<void> {
    const destinationURL = toFileUrl(resolve(assetsRoot)) + "/";
    const deletableRegExp = /\.js(?:\.map)?$/;
    const written = new Set<string>();

    await Deno.mkdir(assetsRoot, { recursive: true });

    let tasks = Array<Promise<unknown>>(this.#outputByPath.size);
    let i = 0;
    tasks[i] = Deno.writeTextFile(metaPath, JSON.stringify(this.meta()));

    for (const [url, { contents }] of this.#outputByPath.entries()) {
      i++;
      const path = fromFileUrl(new URL(url, destinationURL));
      written.add(path);
      tasks[i] = Deno.stat(path)
        .then((stat) => {
          if (stat.size !== contents.length) {
            throw 1;
          }
        })
        .catch(() => Deno.writeFile(path, contents));
    }
    await Promise.all(tasks);
    tasks.splice(0, tasks.length);

    tasks = [];
    for await (const { isFile, name } of Deno.readDir(assetsRoot)) {
      const path = resolve(assetsRoot, name);
      if (isFile && !written.has(path) && deletableRegExp.test(name)) {
        tasks.push(Deno.remove(path));
      }
    }

    await Promise.all(tasks);
  }
}

type BundleOutput = {
  readonly path: string;
  readonly contents: Uint8Array;
  readonly entryPoint?: URL;
};

type BundleResultMeta = {
  readonly outputs: { readonly path: string; readonly entryPoint?: string }[];
  readonly publicRoot: string;
};
