import { devModules as _devModules } from "@classic/compile/modules";
import { useBuild, useRoute } from "../build/mod.ts";
import { serveAsset } from "./asset-serve-build.ts";

export const devModules = (): Promise<Record<string, string>> =>
  useBuild(async () => {
    const modules = await _devModules({
      modules: [
        "@classic/server/client/router",
      ],
      moduleBase: "client",
    });

    // root.segment("/.hmr").method("GET", );
    const moduleMap: Record<string, string> = {};
    for (const { name, path } of modules.context.modules()) {
      const module = modules.context.get(path)!;
      serveAsset({
        path: module.publicPath,
        contents: () => module.load(),
        contentType: "text/javascript",
      });

      if (name) moduleMap[name] = module.publicPath;
    }

    useRoute(
      "GET",
      "*",
      import.meta.resolve("./bundle-runtime.ts"),
      moduleMap,
    );

    return moduleMap;
  });

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
