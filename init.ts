import { join } from "./deps/std/path.ts";

const projectName = prompt("What folder name do you want to create?");

if (!projectName) Deno.exit(1);
if (projectName.includes("/")) {
  console.log("Folder name is not valid");
  Deno.exit(1);
}

const src = join(projectName, "src");

await Deno.mkdir(projectName);
await Promise.all([
  fetch(
    new URL(import.meta.resolve("./examples/hello-world/deno.json")),
  )
    .then((res) => res.text())
    .then((denoJson) =>
      Deno.writeTextFile(
        join(projectName, "deno.json"),
        denoJson.replaceAll(
          /"jsx-machine\/(jsx-runtime)?": "([^"]+)"/g,
          (_, runtime) =>
            `"jsx-machine/${runtime ?? ""}": "${
              runtime
                ? import.meta.resolve("./jsx-runtime.ts")
                : `${import.meta.resolve("./")}`
            }"`,
        ),
      )
    ),
  Deno.mkdir(src),
]);

await Promise.all([
  fetch(
    new URL(import.meta.resolve("./examples/hello-world/src/main.tsx")),
  )
    .then((res) => res.text())
    .then((main) => Deno.writeTextFile(join(src, "main.tsx"), main)),
]);
