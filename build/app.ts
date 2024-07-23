import { ServedJSContext } from "@classic/js";
import { join } from "@std/path";
import { buildBundle, Bundle, devBundle } from "./bundle.ts";
import { buildModules, devModules, loadModules } from "./modules.ts";

export type AppBuild = {
  critical: Bundle;
  deferred: ServedJSContext;
};

export type BuildOpts = {
  readonly outDir?: string;
  readonly elementsDir: string;
  readonly elementsDeclarationFile?: string;
  readonly clientDir: string;
  readonly clientFile: string;
  readonly criticalModules?: string[];
  readonly deferredModules: string[];
  readonly external?: string[];
  readonly transformCss?: (css: string) => string;
  readonly denoJsonPath?: string;
};

export const devApp = async ({
  elementsDir,
  elementsDeclarationFile,
  clientDir,
  clientFile,
  criticalModules,
  deferredModules,
  external,
  transformCss,
  denoJsonPath,
}: BuildOpts): Promise<AppBuild> => {
  const [{ bundle }, { servedJS }] = await Promise.all([
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
      modules: deferredModules,
      external,
      denoJsonPath,
    }),
  ]);

  return { critical: bundle, deferred: servedJS };
};

export const buildApp = async ({
  outDir,
  elementsDir,
  elementsDeclarationFile,
  clientDir,
  clientFile,
  criticalModules,
  deferredModules,
  external,
  transformCss,
  denoJsonPath,
}: BuildOpts & { readonly outDir: string }): Promise<void> => {
  const [{ js, css }] = await Promise.all([
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
      modules: deferredModules,
      external,
      denoJsonPath,
    }),
  ]);

  await Deno.writeFile(join(outDir, "critical.js"), js);
  if (css) await Deno.writeFile(join(outDir, "critical.css"), css);
};

export const loadApp = async (
  { outDir, clientFile }: Pick<BuildOpts, "clientFile"> & {
    readonly outDir: string;
  },
): Promise<AppBuild> => {
  return {
    critical: {
      js: Deno.readFile(join(outDir, "critical.js")),
      css: Deno.readFile(join(outDir, "critical.css")).catch((_) => undefined),
    },
    deferred: await loadModules({ clientFile }),
  };
};
