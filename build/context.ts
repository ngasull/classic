import { resolve, SEPARATOR, toFileUrl } from "@std/path";
import {
  fromFileUrl as posixFromFileUrl,
  relative as posixRelative,
  resolve as posixResolve,
} from "@std/path/posix";

export class BuildContext {
  readonly #moduleBase: string;
  readonly #byName: Record<string, {
    name: string;
    outPath: string;
    load: ModuleLoader;
  }> = {};
  readonly #byPath: Record<string, string> = {};
  readonly #watchers: Set<() => void> = new Set();

  constructor(moduleBase: string) {
    this.#moduleBase = posixFromFileUrl(toFileUrl(resolve(moduleBase)));
    this.publicBase = "/.defer/";
  }

  #base!: string;
  #servedPathRegExp!: RegExp;
  get publicBase(): string {
    return this.#base;
  }
  set publicBase(base: string) {
    const path = new URL(this.#base = base, "http://x").pathname;
    this.#servedPathRegExp = new RegExp(
      `^${
        path.replaceAll(/[.\\[\]()]/g, (m) => "\\" + m)
      }(.+\.((?:js|css)(?:\.map)?|json))$`,
    );
  }

  meta(): BuildMeta {
    return {
      moduleBase: this.#moduleBase,
      publicBase: this.publicBase,
      modules: Object.values(this.#byName),
    };
  }

  add(
    name: string,
    outPath: string,
    load: ModuleLoader,
  ): void {
    this.#byName[name] ??= { name, outPath, load };
    this.#byName[name].outPath = outPath;
    this.#byPath[outPath] = name;
  }

  resolve(name: string): undefined | {
    name: string;
    outPath: string;
    publicPath: string;
    load(): Promise<Uint8Array>;
  } {
    const mod = this.#byName[name];
    if (!mod) return;
    return {
      name: mod.name,
      outPath: mod.outPath,
      publicPath: this.#base + mod.outPath,
      load: () => Promise.resolve(mod.load(mod.name, mod.outPath)),
    };
  }

  watch(cb: () => void): () => void {
    this.#watchers.add(cb);
    return () => {
      this.#watchers.delete(cb);
    };
  }

  notify(): void {
    for (const watcher of this.#watchers) watcher();
  }

  async generateBindings(bindingsFile: string): Promise<void> {
    const dir = toPosix(resolve(bindingsFile, ".."));
    const newClient = `import "@classic/js";

declare module "@classic/js" {
  interface Module {${
      Object.values(this.#byName).map(({ name, outPath }) =>
        outPath.endsWith(".js")
          ? `\n    ${JSON.stringify(name)}: typeof import(${
            JSON.stringify(
              name[0] === "/"
                ? "./" +
                  posixRelative(
                    dir,
                    posixResolve(this.#moduleBase, name.slice(1)),
                  )
                : name,
            )
          });`
          : ""
      ).join("")
    }
  }
}
`;

    const prevClient: string | Promise<string> = await Deno
      .readTextFile(bindingsFile).catch((_) => "");

    if (newClient !== prevClient) {
      await Deno.writeTextFile(bindingsFile, newClient);
    }
  }

  fetch(req: Request): void | Promise<Response> {
    const { pathname } = new URL(req.url);
    const match = pathname.match(this.#servedPathRegExp);
    if (!match) return;
    const [, module, ext] = match;
    return (async () => {
      const res = this.#byPath[module] &&
        await this.resolve(this.#byPath[module])!.load();
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

  static load = (
    { moduleBase, publicBase, modules }: BuildMeta,
    load: ModuleLoader,
  ): BuildContext => {
    const served = new BuildContext(moduleBase);
    served.publicBase = publicBase;

    for (const { name, outPath } of modules) {
      served.add(name, outPath, load);
    }

    return served;
  };
}

const contentTypes = {
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
} as const;

export type BuildMeta = {
  moduleBase: string;
  publicBase: string;
  modules: Array<BuildModule>;
};

export type BuildModule = {
  name: string;
  outPath: string;
};

export type ModuleLoader = (
  name: string,
  outPath: string,
) => Uint8Array | Promise<Uint8Array>;

const toPosix: (p: string) => string = SEPARATOR === "/"
  ? (p) => p
  : (p) => p.replaceAll(SEPARATOR, "/");
