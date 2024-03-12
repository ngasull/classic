import { app } from "./src/app.tsx";
import { bundle } from "./src/bundle.ts";

const port = 3000;
const staticOpts = {
  assetsRoot: "./public/m",
  metaPath: "./src/bundle-meta.ts",
};
const typesPath = "./src/bundle-types.ts";

if (import.meta.main) {
  const command = Deno.args[0] ?? "dev";
  switch (command) {
    case "dev": {
      bundle.watch({
        onResult() {
          bundle.writeTypes(typesPath);
        },
      });
      Deno.serve({ port }, app.fetch);
      break;
    }

    case "build": {
      Promise
        .all([
          bundle
            .build({ minify: true })
            .then((result) => result.write(staticOpts)),
          bundle.writeTypes(typesPath),
        ])
        .then(() => Deno.exit(0));
      break;
    }

    case "serve": {
      bundle.load(staticOpts);
      Deno.serve({ port }, app.fetch);
      break;
    }

    default: {
      throw Error(`Unknown command ${command}`);
    }
  }

  Deno.addSignalListener("SIGINT", () => Deno.exit(0));
}
