import { join } from "./deps/std/path.ts";

const fetches = fetch(
  "https://api.github.com/repos/ngasull/classic/branches/main",
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
              (_, row) => row.replace("main", sha),
            ),
          )
        ),
      fetch(`${base}/task.ts`)
        .then(validResText)
        .then((text) => (path: string) =>
          Deno.writeTextFile(join(path, "task.ts"), text)
        ),
      ...["app.tsx", "bundle.ts", "db.ts", "root.tsx"].map((file) =>
        fetch(`${base}/src/${file}`)
          .then(validResText)
          .then((text) => (path: string) =>
            Deno.writeTextFile(join(path, "src", file), text)
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

const writeFiles = await fetches;
await Deno.mkdir(join(projectName, "src"), { recursive: true });
await Promise.all(writeFiles.map((write) => write(projectName)));

function validResText(res: Response): Promise<string> {
  if (!res.ok) {
    throw Error(`Failed fetching ${res.url} (${res.status} ${res.statusText})`);
  }
  return res.text();
}
