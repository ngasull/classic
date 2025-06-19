import { devModules as _devModules } from "@classic/build/modules";
import { Buildable } from "@classic/server";
import { ServedAsset } from "./asset-serve-build.ts";

class BuildModules extends Buildable<Promise<Record<string, string>>> {
  #modules?: Awaited<ReturnType<typeof _devModules>>;

  constructor() {
    super(async (exported) => {
      this.#modules = await _devModules({
        modules: [
          "@classic/router",
        ],
        moduleBase: "client",
      });

      // root.segment("/.hmr").method("GET", );
      const moduleMap: Record<string, string> = {};
      for (const { name, path } of this.#modules.context.modules()) {
        const module = this.#modules.context.get(path)!;
        exported.build(
          new ServedAsset({
            path: module.publicPath,
            contents: () => module.load(),
            contentType: "text/javascript",
          }),
        );

        if (name) moduleMap[name] = module.publicPath;
      }

      exported.route({
        pattern: "*",
        moduleUrl: new URL(import.meta.resolve("./bundle-runtime.ts")),
        params: [moduleMap],
      });

      return moduleMap;
    });
  }

  override stop(): void | Promise<void> {
    const modules = this.#modules;
    this.#modules = undefined;
    return modules?.stop();
  }
}

export const devModules = (): BuildModules => new BuildModules();

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
