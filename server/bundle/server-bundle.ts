import { Context } from "@classic/context";
import { type JS, js } from "@classic/js";
import type { BuildableOptions } from "@classic/server";
import { ServedAsset } from "../asset-serve/mod.ts";

/**
 * Represents a JS bundle
 */
export class Bundle {
  readonly #moduleBase: string;
  readonly #addedSpecs: Set<string> = new Set();
  #moduleMap?: Record<string, string>;

  /**
   * Declares new bundle
   *
   * @param moduleBase Base build directory
   * @constructor
   */
  constructor(moduleBase: string) {
    this.#moduleBase = moduleBase;
  }

  /**
   * Add an entrypoint to the bundle and access its API.
   * Each entrypoint generates an output which can be resolved with {@linkcode Bundle.resolve}
   *
   * @param spec Module specifier
   * @returns Module's exported API
   */
  add<T>(spec: string | URL): JS<T> {
    if (typeof spec !== "string") spec = spec.href;
    this.#addedSpecs.add(spec);
    return js.module<T>(() => this.resolve(spec));
  }

  /**
   * Resolve a specifier to its generated target specifier
   *
   * @param spec Source specifier
   * @returns Target specifier
   */
  resolve(spec: string): string {
    return $bypass.get() ? spec : this.#moduleMap![spec];
  }

  /** @ignore */
  [Symbol.for("classic.buildable")](): BuildableOptions<
    Record<string, string>
  > {
    let build:
      | Awaited<ReturnType<typeof import("@classic/build/modules").devModules>>
      | undefined;
    return {
      isAfter: true,

      build: async (exported) => {
        const { devModules } = await import("@classic/build/modules");

        const modules = [...this.#addedSpecs];
        console.debug(
          `Buidling bundle "%s" with entrypoints: %o`,
          this.#moduleBase,
          modules,
        );
        build = await devModules({
          modules,
          moduleBase: this.#moduleBase,
        });

        // root.segment("/.hmr").method("GET", );
        const moduleMap: Record<string, string> = {};
        for (const { name, path } of build.context.modules()) {
          const module = build.context.get(path)!;
          exported.build(
            new ServedAsset({
              path: module.publicPath,
              contents: () => module.load(),
              contentType: "text/javascript",
            }),
          );

          if (name) moduleMap[name] = module.publicPath;
        }

        return moduleMap;
      },

      restore: (moduleMap) => {
        this.#moduleMap = moduleMap;
      },

      stop: () => {
        const b = build;
        build = undefined;
        return b?.stop();
      },
    };
  }
}

const $bypass = Context.for<boolean>("classic.bundle.bypass");

/**
 * Bypass module resolution in bundles built in `cb`
 *
 * @param cb Callback in which to bypass resolution
 * @returns `cb`'s result
 */
export const bypassResolution = <T>(cb: () => T): T =>
  $bypass.provide(true, cb);

// export const buildModules = async <Params>(
//   route: Build,
// ): Promise<(spec: string) => string> => {
//   const moduleMap = await route.use(async (build: Build) => {
//     let moduleMap = route.get($moduleMap);
//     if (!moduleMap) {
//       const {
//         resolve,
//         promise,
//       } = Promise.withResolvers<Record<string, string>>();
//       moduleMap = promise;

//       route.provide($moduleMap, promise);

//       const context = await _buildModules({
//         modules: [
//           "@classic/server/client/router",
//         ],
//         moduleBase: "client",
//       });

//       const _moduleMap: Record<string, string> = {};
//       for (const { name, path } of context.modules()) {
//         const module = context.get(path)!;
//         route.root("/").use(serveAsset, {
//           path: module.publicPath,
//           contents: () => module.load(),
//           contentType: "text/javascript",
//           headers: {
//             "Cache-Control": "public, max-age=31536000, immutable",
//           },
//         });

//         if (name) _moduleMap[name] = module.publicPath;
//       }

//       resolve(_moduleMap);
//     }

//     return moduleMap;
//   });

//   return (spec: string) => moduleMap[spec];
// };
