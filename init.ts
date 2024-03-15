import { join } from "./deps/std/path.ts";

const fetches = fetch(
  "https://api.github.com/repos/ngasull/classic/branches/master",
)
  .then((res) => res.json())
  .then(({ commit: { sha } }) => sha)
  .then((sha) => {
    const base =
      `https://raw.githubusercontent.com/ngasull/classic/${sha}/examples/hello-world`;
    return Promise.all([
      fetch(`${base}/deno.jsonc`)
        .then((res) => res.text())
        .then((denoJson) => (path: string) =>
          Deno.writeTextFile(
            join(path, "deno.jsonc"),
            denoJson.replaceAll(
              /("classic-web\/(jsx-runtime)?": "[^"]+")/g,
              (_, row) => row.replace("master", sha),
            ),
          )
        ),
      fetch(`${base}/task.ts`).then((res) => async (path: string) =>
        Deno.writeTextFile(join(path, "task.ts"), await res.text())
      ),
      ...["bundle.ts", "db.ts", "root.ts", "server.ts"].map((file) =>
        fetch(`${base}/src/${file}`).then((res) => async (path: string) =>
          Deno.writeTextFile(join(path, "src", file), await res.text())
        )
      ),
    ]);
  });

const projectName = prompt("What folder name do you want to create?");

if (!projectName) Deno.exit(1);
if (projectName.includes("/")) {
  console.log("Folder name is not valid");
  Deno.exit(1);
}

await Deno.mkdir(projectName);
await Deno.mkdir(join(projectName, "src"));
await fetches.then((writeFiles) =>
  Promise.all(writeFiles.map((write) => write(projectName)))
);
