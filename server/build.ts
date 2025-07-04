/**
 * # Build server
 *
 * Instantiate a {@linkcode BuildServer} to develop a server defined with {@link https://jsr.io/@classic/server|@classic/server}
 *
 * @module
 */

import { js, type JSable, toJs, unsafe } from "@classic/js";
import { exists } from "@std/fs/exists";
import { join, resolve, toFileUrl } from "@std/path";
import { $assetIndices, type Asset, AssetKind } from "./asset.ts";
import { $buildContext, Build, RoutePathContext } from "./build-context.ts";
import { type Route, RouteModule, routeRegExp } from "./module.ts";
import { type ClassicServer, RuntimeServer } from "./runtime.ts";

/**
 * File routing system from provivded base path
 *
 * @param base Base path to scan routes from
 */
export class BuildServer implements ClassicServer {
  readonly #addedModules = new Set<RouteModule>();
  readonly #routes: Promise<Route[]>;
  readonly #server: Promise<RuntimeServer>;

  /**
   * @constructor
   * @param base Base path to scan routes from
   */
  constructor(base: string) {
    this.#routes = (async () => {
      const unaddedSubRoutes = async (route: Route): Promise<Route[]> => {
        if (this.#addedModules.has(route.module)) return [];
        this.#addedModules.add(route.module);
        const ownRoutes = await route.module.routes;
        return [
          ...ownRoutes,
          ...(await Promise.all(ownRoutes.map(unaddedSubRoutes)))
            .flatMap((r) => r),
        ];
      };

      const fileRoutes = await $buildContext.provide(
        new Build(),
        scanDir,
        new RoutePathContext(base, []),
        this.#addedModules,
      );

      return [
        ...fileRoutes,
        ...(await Promise.all(fileRoutes.map(unaddedSubRoutes)))
          .flatMap((r) => r),
      ];
    })();

    this.#server = this.#routes.then((routes) => new RuntimeServer(routes));
  }

  fetch = async (req: Request): Promise<Response> => {
    const server = await this.#server;
    this.fetch = server.fetch;
    return server.fetch(req);
  };

  async write(
    buildDirectory: string = join(Deno.cwd(), ".build"),
  ): Promise<void> {
    const routes = await this.#routes;

    if (await exists(buildDirectory)) {
      throw Error(
        `Build directory already exists, specify another or remove first: ${buildDirectory}`,
      );
    }

    const serverJsPath = join(buildDirectory, "server.js");
    const assetsDir = join(buildDirectory, "asset");
    await Deno.mkdir(assetsDir, { recursive: true });

    // Generate handlers to track their assets
    const assetIndices = new Map<Asset, number>();
    const routesJs = $assetIndices.provide(
      assetIndices,
      toJs,
      js`Promise.all(${routes.map((r) => r.toJs())})`,
    );

    const assetKeys = new Set<string>();
    const assetsMeta: Array<readonly [AssetKind, string]> = [];
    let writtenSize = 0;
    while (assetIndices.size > writtenSize) {
      assetsMeta.push(
        ...await Promise.all(
          [...assetIndices.keys()].slice(writtenSize).map(
            async (asset, i) => {
              const contents = await asset.contents();

              const makeKey = (suffix?: string) => {
                const index = assetsMeta.length + i;
                const hint = asset.hint?.replaceAll("/", "__") ??
                  index.toString();

                let h = null;
                let key: string;
                do {
                  key = h == null ? hint : hint + h++;
                  if (suffix != null) key = key + suffix;
                } while (assetKeys.has(key));

                assetKeys.add(key);
                return key;
              };

              if (contents != null && contents instanceof Uint8Array) {
                const key = makeKey();
                await Deno.writeFile(join(assetsDir, key), contents);
                return [AssetKind.BYTES, key] as const;
              } else if (typeof contents === "string") {
                const key = makeKey();
                await Deno.writeTextFile(join(assetsDir, key), contents);
                return [AssetKind.STRING, key] as const;
              } else {
                const key = makeKey(".js");
                await Deno.writeTextFile(
                  join(assetsDir, key),
                  $assetIndices.provide(assetIndices, toJs, [
                    js`export default ${contents as JSable};`,
                  ]),
                );
                return [AssetKind.JS, key] as const;
              }
            },
          ),
        ),
      );
      writtenSize = assetIndices.size;
    }

    await Deno.writeTextFile(
      serverJsPath,
      $assetIndices.provide(assetIndices, toJs, [
        js`export const c = new ${runtimeJs.PrebuildContext}(import.meta.dirname, ${assetsMeta})`,
        js`export default new ${runtimeJs.RuntimeServer}(await ${
          unsafe(routesJs)
        })`,
      ]),
    );
  }

  async stop(): Promise<void> {
    await Promise.all(this.#addedModules.values().map((m) => m.stop()));
  }
}

const runtimeJs = js.module<typeof import("./runtime.ts")>(
  import.meta.resolve("./runtime.ts"),
);

const scanDir = async (
  parent: RoutePathContext,
  addedModules: Set<RouteModule>,
) => {
  const routeFiles = new Set<string>();
  const directories = new Set<string>();
  let indexFile: string | undefined;

  const dir = join(parent.baseDir, ...parent.segments);
  for await (const { isDirectory, name } of Deno.readDir(dir)) {
    if (isDirectory) {
      directories.add(name);
    } else {
      const match = name.match(routeRegExp);
      if (match) {
        const [, baseName] = match as [string, string, string];

        if (baseName === "route") {
          if (indexFile) {
            throw Error(
              `Two route files defined in ${dir} : ${indexFile} and ${name}`,
            );
          } else {
            indexFile = name;
          }
        } else {
          routeFiles.add(name);
        }
      }
    }
  }

  const addRouteFile = async (fileName: string) => {
    const path = join(...parent.segments, fileName);
    const cwdFilePath = join(parent.baseDir, path);
    const moduleUrl = toFileUrl(resolve(cwdFilePath));
    const module = await RouteModule.build(moduleUrl, parent);
    addedModules.add(module);
    return module.routes;
  };

  const states: Array<Route | Promise<Route>> = [];

  if (indexFile) {
    states.push(...await addRouteFile(indexFile));
  }

  const routeResults = await Promise.all(
    routeFiles.values().map((name) => addRouteFile(name)),
  );
  routeResults.forEach((routes) => states.push(...routes));

  const subStatesList = await Promise.all(
    directories.values().map((name) =>
      scanDir(
        new RoutePathContext(
          parent.baseDir,
          [...parent.segments, name],
          parent,
        ),
        addedModules,
      )
    ),
  );
  subStatesList.forEach((subStates) => states.push(...subStates));

  return Promise.all(states);
};
