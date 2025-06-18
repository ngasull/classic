/**
 * # Build server
 *
 * Instantiate a {@linkcode BuildServer} to develop a server defined with {@link https://jsr.io/@classic/server|@classic/server}
 *
 * @module
 */

import { stringify } from "@classic/js/stringify";
import { exists } from "@std/fs/exists";
import { join, resolve, toFileUrl } from "@std/path";
import { writeAssets } from "./asset.ts";
import { type Route, RouteModule, routeRegExp } from "./module.ts";
import { type ClassicServer, RuntimeServer } from "./runtime.ts";

class FileRouterState {
  readonly firstRoutes: Route[] = [];
  readonly lastRoutes: Route[] = [];

  constructor(
    public readonly base: string,
  ) {}
}

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
    const state = new FileRouterState(base);
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

      const fileRoutes = await scanDir(base, [], this.#addedModules);

      return [
        ...state.firstRoutes,
        ...fileRoutes,
        ...(await Promise.all(fileRoutes.map(unaddedSubRoutes)))
          .flatMap((r) => r),
        ...state.lastRoutes,
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

    const assetsDir = join(buildDirectory, "asset");
    await Deno.mkdir(assetsDir, { recursive: true });

    // Generate handlers to track their assets
    const [meta, assetsMeta] = await writeAssets(
      routes.map((r) => r.toMeta()),
      assetsDir,
    );

    await Deno.writeTextFile(
      join(buildDirectory, "server.js"),
      `import { PrebuildContext, RuntimeServer, Route } from ${
        JSON.stringify(import.meta.url)
      };
const c = new PrebuildContext(import.meta.dirname, ${stringify(assetsMeta)});
export default new RuntimeServer(${meta}.map(Route.fromMeta));
`,
    );
  }

  async stop(): Promise<void> {
    await Promise.all(this.#addedModules.values().map((m) => m.stop()));
  }
}

const scanDir = async (
  baseDir: string,
  parentSegments: string[],
  addedModules: Set<RouteModule>,
) => {
  const routeFiles = new Set<string>();
  const directories = new Set<string>();
  let indexFile: string | undefined;

  const dir = join(baseDir, ...parentSegments);
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
    const path = join(...parentSegments, fileName);
    const cwdFilePath = join(baseDir, path);
    const moduleUrl = toFileUrl(resolve(cwdFilePath));
    const module = await RouteModule.build(moduleUrl, baseDir);
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
      scanDir(baseDir, [...parentSegments, name], addedModules)
    ),
  );
  subStatesList.forEach((subStates) => states.push(...subStates));

  return Promise.all(states);
};
