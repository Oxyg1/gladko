// Builds dist/firefox and dist/chrome (+ zips in dist/) from src/ and manifests/.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const target of ["firefox", "chrome"]) {
  const out = join(dist, target);
  cpSync(join(root, "src"), out, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(root, "manifests", `${target}.json`), "utf8"));
  manifest.version = version;
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const zip = join(dist, `gladko-${target}-${version}.zip`);
  if (existsSync(zip)) rmSync(zip);
  execFileSync("zip", ["-r", "-X", "-q", zip, "."], { cwd: out });
  console.log("built", zip);
}
