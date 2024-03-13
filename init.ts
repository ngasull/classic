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
      fetch(`${base}/deno.json`)
        .then((res) => res.text())
        .then((denoJson) =>
          denoJson.replaceAll(
            /("classic-web\/(jsx-runtime)?": "[^"]+")/g,
            (_, row) => row.replace("master", sha),
          )
        ),
      fetch(`${base}/src/db.ts`).then((res) => res.text()),
      fetch(`${base}/src/root.tsx`).then((res) => res.text()),
      fetch(`${base}/src/server.ts`).then((res) => res.text()),
    ]);
  });

const projectName = prompt("What folder name do you want to create?");

const [denoJson, db, root, server] = await fetches;

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
    .then(() =>
      Promise.all([
        Deno.writeTextFile(join(src, "db.ts"), db),
        Deno.writeTextFile(join(src, "root.tsx"), root),
        Deno.writeTextFile(join(src, "server.ts"), server),
        Deno.writeTextFile(
          join(src, "web-modules.gen.ts"),
          `// AUTO-GENERATED FILE, DO NOT MODIFY

export const web = null;
`,
        ),
      ])
    ),
]);
