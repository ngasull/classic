import { join, relative, resolve, toFileUrl } from "@std/path";
import {
  type Async,
  Build,
  BuildResult,
  useBuild,
} from "@classic/server/build";
import { pageCss } from "./page.ts";
import { $routeBuild, RouteBuild } from "./serve.ts";

export const fileRouter = (base: string): Promise<void> =>
  useBuild(() => scanDir(base, []));

const routeRegExp = /^((?:(.+)\.)?route)\.(tsx?|css)$/;

const scanDir = async (
  baseDir: string,
  parentSegments: string[],
) => {
  const routeFiles = new Set<[string, string]>();
  const cssRouteFiles = new Set<[string, string]>();
  const directories = new Set<string>();
  let indexFile: string | undefined;
  let cssIndexFile: string | undefined;

  const dir = join(baseDir, ...parentSegments);
  for await (const { isDirectory, name } of Deno.readDir(dir)) {
    if (isDirectory) {
      directories.add(name);
    } else {
      const match = name.match(routeRegExp);
      if (match) {
        const [
          ,
          baseName,
          routeName,
          ext,
        ] = match as [string, string, string, string];

        if (ext === "css") {
          if (baseName === "route") {
            cssIndexFile = name;
          } else {
            cssRouteFiles.add([name, routeName]);
          }
        } else {
          if (baseName === "route") {
            if (indexFile) {
              throw Error(
                `Two route files defined in ${dir} : ${indexFile} and ${name}`,
              );
            } else {
              indexFile = name;
            }
          } else {
            routeFiles.add([name, routeName]);
          }
        }
      }
    }
  }

  const addRouteFile = (fileName: string) =>
    useBuild(async () => {
      const path = join(...parentSegments, fileName);
      const cwdFilePath = join(baseDir, path);

      const url = toFileUrl(resolve(cwdFilePath)).href;
      const routeBuild = new RouteBuild(url);

      const build = new Build(async () => {
        const { default: mod }: {
          default: () => Async<void>;
        } = await import(url).catch((e) => {
          throw new Error(`Failed importing ${url}: ` + e.message);
        });
        if (!mod || typeof mod !== "function") {
          throw new Error(
            `${url} must \`export default\` a file route builder`,
          );
        }

        return $routeBuild.provide(routeBuild, mod);
      });

      const result = build.run();

      routeBuild.built.push(...await result.built);

      new BuildResult(
        undefined,
        Promise.resolve([]),
        result.routes,
        result.options,
        result.resolveOptions,
      ).use();
    });

  if (indexFile) {
    // ! \\ CSS First
    if (cssIndexFile) {
      const path = join(dir, cssIndexFile);
      pageCss({
        css: await Deno.readFile(path),
        fileName: relative(baseDir, path),
      });
    }

    addRouteFile(indexFile);
  }

  // ! \\ CSS First
  for (const [name] of cssRouteFiles) {
    const path = join(dir, name);
    await useBuild(async () =>
      pageCss({
        css: await Deno.readFile(path),
        fileName: relative(baseDir, path),
      })
    );
  }

  for (const [name, routeName] of routeFiles) {
    useBuild(
      segmentToURLPattern(routeName),
      () => addRouteFile(name),
    );
  }

  for (const name of directories) {
    useBuild(
      segmentToURLPattern(name),
      () => scanDir(baseDir, [...parentSegments, name]),
    );
  }
};

const segmentToURLPattern = (segment: string) => {
  const match = segment.match(/^\[(\.\.\.)?([^\]]+)\]$/);
  if (!match) return `/${segment}`;

  const [, spread, param] = match;
  if (spread) return `/:${param}*`;

  const optional = param?.match(/^\[(.+)\]$/)?.[1];
  return optional ? `{/:${optional}}?` : `/:${param}`;
};
