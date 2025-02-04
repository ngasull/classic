import {
  buildModules as _buildModules,
  devModules as _devModules,
} from "../../build/modules.ts";
import type { Resolver } from "../../js/types.ts";
import type { BuildRoute } from "../build.ts";
import type { FileBuildContext } from "../file-router.ts";
import { Key } from "../key.ts";
import type { MiddlewareContext } from "../mod.ts";
import { serveAsset } from "../plugin/asset.ts";

const $moduleMapAsset = new Key<Promise<string>>(
  "module map asset",
);

const $moduleMap = new Key<Promise<Record<string, string>>>(
  "module map",
);

type $Resolver = <P>(ctx: MiddlewareContext<P>) => Promise<Resolver>;

export const devModules = async <Params>(
  fileRoute: FileBuildContext<Params>,
): Promise<$Resolver> => {
  const moduleMapAsset = await fileRoute.useBuild(async (route: BuildRoute) => {
    const root = route.root();
    let moduleMapAsset = root.get($moduleMapAsset);
    if (!moduleMapAsset) {
      const {
        resolve,
        promise,
      } = Promise.withResolvers<string>();
      moduleMapAsset = promise;

      root.provide($moduleMapAsset, promise);

      const modules = await _devModules({
        modules: [
          "@classic/server/client/router",
        ],
        moduleBase: "client",
      });

      // root.segment("/.hmr").method("GET", );
      const _moduleMap: Record<string, string> = {};
      for (const { name, path } of modules.context.modules()) {
        const module = modules.context.get(path)!;
        root.use(serveAsset, {
          path: module.publicPath,
          contents: () => module.load(),
          contentType: "text/javascript",
        });

        if (name) _moduleMap[name] = module.publicPath;
      }

      resolve(route.build.asset(() => JSON.stringify(_moduleMap)));
    }

    return moduleMapAsset;
  });

  return async (ctx) => {
    const moduleMap = await (
      ctx.get($moduleMap) ?? ctx.provide(
        $moduleMap,
        ctx.runtime.textAsset(moduleMapAsset).then((json) => JSON.parse(json)),
      )
    );
    return (spec) => moduleMap[spec];
  };
};

export const buildModules = async <Params>(
  route: FileBuildContext<Params>,
): Promise<(spec: string) => string> => {
  const moduleMap = await route.useBuild(async (build: BuildRoute) => {
    const root = build.root();
    let moduleMap = root.get($moduleMap);
    if (!moduleMap) {
      const {
        resolve,
        promise,
      } = Promise.withResolvers<Record<string, string>>();
      moduleMap = promise;

      root.provide($moduleMap, promise);

      const context = await _buildModules({
        modules: [
          "@classic/server/client/router",
        ],
        moduleBase: "client",
      });

      const _moduleMap: Record<string, string> = {};
      for (const { name, path } of context.modules()) {
        const module = context.get(path)!;
        root.use(serveAsset, {
          path: module.publicPath,
          contents: () => module.load(),
          contentType: "text/javascript",
          headers: {
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });

        if (name) _moduleMap[name] = module.publicPath;
      }

      resolve(_moduleMap);
    }

    return moduleMap;
  });

  return (spec: string) => moduleMap[spec];
};
