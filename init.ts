import { join } from "./deps/std/path.ts";

const fetches = fetch(
  "https://api.github.com/repos/ngasull/jsx-machine/branches/master",
)
  .then((res) => res.json())
  .then(({ commit: { sha } }) => sha)
  .then((sha) => {
    const base =
      `https://raw.githubusercontent.com/ngasull/jsx-machine/${sha}/examples/hello-world`;
    return Promise.all([
      fetch(`${base}/deno.json`)
        .then((res) => res.text())
        .then((denoJson) =>
          denoJson.replaceAll(
            /("jsx-machine\/(jsx-runtime)?": "[^"]+)"/g,
            (_, row) => row.replace("master", sha),
          )
        ),
      fetch(`${base}/src/main.tsx`).then((res) => res.text()),
    ]);
  });

const projectName = prompt("What folder name do you want to create?");

const [denoJson, main] = await fetches;

if (!projectName) Deno.exit(1);
if (projectName.includes("/")) {
  console.log("Folder name is not valid");
  Deno.exit(1);
}

const src = join(projectName, "src");

await Deno.mkdir(projectName);
await Promise.all([
  Deno.writeTextFile(
    join(projectName, "deno.json"),
    denoJson,
  ),

  Deno.mkdir(src)
    .then(() => Deno.writeTextFile(join(src, "main.tsx"), main)),
]);
