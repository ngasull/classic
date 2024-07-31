import { dirname, join, SEPARATOR } from "@std/path";

export class BuildContext {
  readonly moduleBase: string;
  readonly #byPath: Record<string, {
    name?: string;
    path: string;
    load: ModuleLoader;
  }> = {};
  readonly #byName: Record<string, string> = {};
  readonly #watchers: Set<() => void> = new Set();

  constructor(moduleBase: string) {
    this.moduleBase = toPosix(moduleBase);
    this.#publicBase = "/.defer/";
  }

  #_publicBase!: string;
  #servedPathRegExp!: RegExp;
  get #publicBase(): string {
    return this.#_publicBase;
  }
  set #publicBase(base: string) {
    const path = new URL(this.#_publicBase = base, "http://x").pathname;
    this.#servedPathRegExp = new RegExp(
      `^${
        path.replaceAll(/[.\\[\]()]/g, (m) => "\\" + m)
      }(.+\.((?:js|css)(?:\.map)?|json))$`,
    );
  }

  modules(): BuildModuleMeta[] {
    return Object.values(this.#byPath);
  }

  async save(outDir: string): Promise<void> {
    const dir = join(outDir, "defer");
    const modules = await Promise.all(
      Object.values(this.#byPath).map(async (m) => {
        const path = join(dir, m.path);
        await Deno.mkdir(dirname(path), { recursive: true });
        await Deno.writeFile(path, await this.get(m.path)!.load());
        return {
          name: m.name,
          path: m.path,
        } satisfies BuildModuleMeta;
      }),
    );

    Deno.writeTextFile(
      join(outDir, "meta.json"),
      JSON.stringify({
        moduleBase: this.moduleBase,
        publicBase: this.#publicBase,
        modules,
      }),
    );
  }

  static load = async (outDir: string): Promise<BuildContext> => {
    const { moduleBase, publicBase, modules }: BuildMeta = JSON.parse(
      await Deno.readTextFile(join(outDir, "meta.json")),
    );
    const loadFile: ModuleLoader = ({ outPath }) =>
      Deno.readFile(join(outDir, "defer", outPath));

    const served = new BuildContext(moduleBase);
    served.#publicBase = publicBase;

    for (const { path, name } of modules) {
      served.add(path, name, loadFile);
    }

    return served;
  };

  add(
    path: string,
    name: string | undefined | null,
    load: ModuleLoader,
  ): void {
    this.#byPath[path] ??= { name: name ?? undefined, path, load };
    if (name) {
      this.#byName[name] = path;
    }
  }

  get(path: string): ModuleApi | undefined {
    const mod = this.#byPath[path];
    if (!mod) return;
    const api = {
      name: mod.name,
      outPath: path,
      publicPath: this.#_publicBase + path,
      load: () => Promise.resolve(mod.load(api)),
    };
    return api;
  }

  resolve(name: string): ModuleApi | undefined {
    const path = this.#byName[name];
    return path == null ? undefined : this.get(path);
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

  fetch(req: Request): void | Promise<Response> {
    const { pathname } = new URL(req.url);
    const match = pathname.match(this.#servedPathRegExp);
    if (!match) return;
    const [, path, ext] = match;
    return (async () => {
      const res = await this.get(path)?.load();
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

const contentTypes = {
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
} as const;

export type ModuleApi = {
  name?: string;
  outPath: string;
  publicPath: string;
  load(): Promise<Uint8Array>;
};

export type BuildMeta = {
  moduleBase: string;
  publicBase: string;
  modules: Array<BuildModuleMeta>;
};

export type BuildModuleMeta = {
  name?: string;
  path: string;
};

export type ModuleLoader = (mod: ModuleApi) => Uint8Array | Promise<Uint8Array>;

const toPosix: (p: string) => string = SEPARATOR === "/"
  ? (p) => p
  : (p) => p.replaceAll(SEPARATOR, "/");
