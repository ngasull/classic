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
    this.publicBase = "/.defer/";
  }

  #publicBase!: string;
  get publicBase(): string {
    return this.#publicBase;
  }
  set publicBase(base: string) {
    const path = new URL(this.#publicBase = base, "http://x").pathname;
    this.#servedPathRegExp = new RegExp(
      `^${
        path.replaceAll(/[.\\[\]()]/g, (m) => "\\" + m)
      }(.+\.((?:js|css)(?:\.map)?|json))$`,
    );
  }

  #servedPathRegExp!: RegExp;
  get servedPathRegExp(): RegExp {
    return this.#servedPathRegExp;
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
        publicBase: this.publicBase,
        modules,
      }),
    );
  }

  private static inMemoryKey = 0;
  private static inMemoryKeyContexts = new Map<number, BuildContext>();

  #inMemoryKey = BuildContext.inMemoryKey++;

  saveInMemory(): number {
    BuildContext.inMemoryKeyContexts.set(this.#inMemoryKey, this);
    return this.#inMemoryKey;
  }

  releaseFromMemory(): void {
    BuildContext.inMemoryKeyContexts.delete(this.#inMemoryKey);
  }

  static load = async (outDir: string | number): Promise<BuildContext> => {
    if (typeof outDir === "number") {
      const inMem = BuildContext.inMemoryKeyContexts.get(outDir);
      if (!inMem) {
        throw Error(`No build context in memory found with number ${outDir}`);
      }
      return inMem;
    }

    const { moduleBase, publicBase, modules }: BuildMeta = JSON.parse(
      await Deno.readTextFile(join(outDir, "meta.json")),
    );
    const loadFile: ModuleLoader = ({ outPath }) =>
      Deno.readFile(join(outDir, "defer", outPath));

    const served = new BuildContext(moduleBase);
    served.publicBase = publicBase;

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
      publicPath: this.#publicBase + path,
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
}

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
