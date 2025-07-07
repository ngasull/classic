import { DELIMITER, join, SEPARATOR } from "jsr:@std/path@^0.225.2";

const copySample = async (
  file: string,
  target = file,
): Promise<(projectName: string) => Promise<void>> => {
  const res = await fetch(import.meta.resolve(`./${file}`));
  if (!res.ok) {
    throw Error(`Failed fetching ${res.url} (${res.status} ${res.statusText})`);
  }

  let contents = await res.text();
  return (projectName) =>
    Deno.writeTextFile(join(projectName, target), contents);
};

const samples = [
  copySample("deno.json.sample", "deno.json"),
  copySample("server.ts"),
  copySample("prebuild.ts"),
  copySample("src/route.tsx"),
  copySample("src/world.route.tsx"),
  copySample("src/db.ts"),
];

const projectName = prompt("What name to give to the project folder?");

if (!projectName) Deno.exit(1);
if (projectName.includes(SEPARATOR) || projectName.includes(DELIMITER)) {
  console.log("Folder name is not valid");
  Deno.exit(1);
}

await Deno.mkdir(join(projectName, "src"), { recursive: true });
await Promise.all(samples).then((samples) =>
  samples.map((sample) => sample(projectName))
);

console.log(
  "Project folder %s initialized. You may now run the commands below:",
  projectName,
);
console.log("cd %s", JSON.stringify(projectName));
console.log("deno task dev");
