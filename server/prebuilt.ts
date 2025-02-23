import { join } from "@std/path/join";
import { toFileUrl } from "@std/path/to-file-url";
import { Asset, AssetKind } from "./asset.ts";

export { ClassicServer } from "./server.ts";

export class PrebuildContext {
  constructor(buildDirectory: string, assets: [AssetKind, string][]) {
    this.#buildDirectory = buildDirectory;
    this.#assets = assets;
  }

  readonly #buildDirectory: string;
  readonly #assets: [AssetKind, string][];

  asset(index: number): Asset {
    return new Asset(async () => {
      const [kind, key] = this.#assets[index];
      switch (kind) {
        case AssetKind.JS: {
          const mod = await import(
            toFileUrl(join(this.#buildDirectory, "asset", key)).href
          );
          return mod.default(this);
        }
        case AssetKind.STRING:
          return Deno.readTextFile(
            join(this.#buildDirectory, "asset", key),
          );
        default:
          return Deno.readFile(join(this.#buildDirectory, "asset", key));
      }
    });
  }
}
