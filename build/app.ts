import { loadServedContext, ServedJSContext } from "@classic/js";
import { join, resolve } from "@std/path";
import { buildBundle, Bundle, CSSTransformer, devBundle } from "./bundle.ts";
import { buildModules, devModules } from "./modules.ts";

export type AppBuild = {
  critical: Bundle;
  deferred: ServedJSContext;
  globalCss?: string;
  dev?: true;
};

export type BuildOpts = {
  outDir?: string;
  elementsDir: string;
  elementsDeclarationFile?: string;
  clientDir: string;
  clientFile: string;
  globalCss?: string;
  criticalModules?: string[];
  deferredModules: string[];
  external?: string[];
  transformCss?: CSSTransformer;
  denoJsonPath?: string;
};

export const devApp = async ({
  elementsDir,
  elementsDeclarationFile,
  clientDir,
  clientFile,
  globalCss,
  criticalModules,
  deferredModules,
  external,
  transformCss,
  denoJsonPath,
}: Readonly<BuildOpts>): Promise<AppBuild> => {
  const [{ bundle }, { served }] = await Promise.all([
    devBundle({
      elementsDir,
      elementsDeclarationFile,
      external,
      extraModules: criticalModules,
      transformCss,
      denoJsonPath,
    }),
    devModules({
      clientDir,
      clientFile,
      modules: globalCss ? [globalCss, ...deferredModules] : deferredModules,
      external,
      denoJsonPath,
    }),
  ]);

  return {
    critical: bundle,
    deferred: served,
    globalCss: globalCss && served.resolve(globalCss),
    dev: true,
  };
};

export const buildApp = async ({
  outDir,
  elementsDir,
  elementsDeclarationFile,
  clientDir,
  clientFile,
  criticalModules,
  globalCss,
  deferredModules,
  external,
  transformCss,
  denoJsonPath,
}: Readonly<BuildOpts> & { readonly outDir: string }): Promise<void> => {
  const [{ js, css }, deferredMeta] = await Promise.all([
    buildBundle({
      elementsDir,
      elementsDeclarationFile,
      external,
      extraModules: criticalModules,
      transformCss,
      denoJsonPath,
    }),

    buildModules({
      outDir: join(outDir, "defer"),
      clientDir,
      clientFile,
      modules: globalCss ? [globalCss, ...deferredModules] : deferredModules,
      external,
      denoJsonPath,
    }),
  ]);

  await Promise.all([
    Deno.writeTextFile(
      join(outDir, "meta.json"),
      JSON.stringify({ globalCss, deferred: deferredMeta }),
    ),
    Deno.writeFile(join(outDir, "critical.js"), js),
    css && Deno.writeFile(join(outDir, "critical.css"), css),
  ]);
};

export const loadApp = async ({
  outDir,
  globalCss,
}: Readonly<
  & Pick<BuildOpts, "clientFile" | "globalCss">
  & { outDir: string }
>): Promise<AppBuild> => {
  const meta = JSON.parse(await Deno.readTextFile(join(outDir, "meta.json")));
  const deferred = loadServedContext(meta.deferred);
  return {
    critical: {
      js: Deno.readFile(join(outDir, "critical.js")),
      css: Deno.readFile(join(outDir, "critical.css")).catch((_) => undefined),
    },
    globalCss: globalCss && deferred.resolve(resolve(globalCss)),
    deferred,
  };
};
