import { relative, resolve, toFileUrl } from "@std/path";
import { fromFileUrl as posixFromFileUrl } from "@std/path/posix";

export class BuildContext {
  readonly #bySrc: Record<string, {
    name: string;
    spec: string | null;
    src: string;
    pub: string;
    load: ModuleLoader;
  }> = {};
  readonly #byName: Record<string, string> = {};
  readonly #byPublic: Record<string, string> = {};
  readonly #watchers: Set<() => void> = new Set();

  constructor() {
    this.base = "/.defer/";
  }

  #base!: string;
  #servedPathRegExp!: RegExp;
  get base(): string {
    return this.#base;
  }
  set base(base: string) {
    const path = new URL(this.#base = base, "http://x").pathname;
    this.#servedPathRegExp = new RegExp(
      `^${
        path.replaceAll(/[.\\[\]()]/g, (m) => "\\" + m)
      }(.+\.((?:js|css)(?:\.map)?|json))$`,
    );
  }

  meta(): BuildMeta {
    return {
      base: this.base,
      modules: Object.values(this.#bySrc),
    };
  }

  add(
    name: string,
    spec: string | null,
    srcUrl: string,
    publicPath: string,
    load: ModuleLoader,
  ): void {
    this.#bySrc[srcUrl] ??= {
      name,
      spec,
      src: srcUrl,
      pub: publicPath,
      load,
    };
    this.#bySrc[srcUrl].pub = publicPath;
    this.#byName[name] = srcUrl;
    this.#byPublic[publicPath] = srcUrl;
  }

  resolve(name: string): string | undefined {
    const srcUrl = this.#byName[name] ?? name;
    return this.#bySrc[srcUrl]
      ? this.#base + this.#bySrc[srcUrl].pub
      : undefined;
  }

  async load(name: string): Promise<Uint8Array | null | undefined> {
    const mod = this.#bySrc[this.#byName[name] ?? name];
    return mod ? await mod.load(mod.pub) : undefined;
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
    const dir = posixFromFileUrl(toFileUrl(resolve(bindingsFile, "..")));
    const newClient = `import "@classic/js";

declare module "@classic/js" {
  interface Module {${
      Object.values(this.#bySrc).map(({ name, spec, src, pub }) =>
        pub.endsWith(".js")
          ? `\n    ${JSON.stringify(name)}: typeof import(${
            JSON.stringify(spec ?? relative(dir, posixFromFileUrl(src)))
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
      const res = this.#byPublic[module] &&
        await this.#bySrc[this.#byPublic[module]].load(module);
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
    { base, modules }: BuildMeta,
    load: ModuleLoader,
  ): BuildContext => {
    const served = new BuildContext();
    served.base = base;

    for (const { name, spec, src, pub } of modules) {
      served.add(name, spec, src, pub, load);
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
  base: string;
  modules: Array<BuildModule>;
};

type BuildModule = {
  name: string;
  spec: string | null;
  src: string;
  pub: string;
};

export type ModuleLoader = (
  publicPath: string,
) => Uint8Array | null | undefined | Promise<Uint8Array | null | undefined>;
