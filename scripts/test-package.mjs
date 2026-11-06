import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { command } from "./command.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const run = async (name, args, cwd, capture = false) => (await command(name, args, { cwd, inherit: !capture })).stdout;

const artifacts = join(root, "artifacts");
await mkdir(artifacts, { recursive: true });
let tarball = process.env.STEWARD_PACKAGE_TARBALL;
if (!tarball && process.argv.includes("--packed")) {
  const archives = (await readdir(artifacts)).filter((name) => name.endsWith(".tgz"));
  assert.equal(archives.length, 1, "Expected exactly one package archive in artifacts");
  tarball = join(artifacts, archives[0]);
}
if (!tarball) {
  // Keep build output out of npm's JSON stream (npm may forward prepack stdout).
  await run("npm", ["run", "build", "-w", "ra-steward"], root);
  const [packed] = JSON.parse(await run("npm", ["pack", "-w", "ra-steward", "--ignore-scripts", "--json", "--pack-destination", artifacts], root, true));
  const paths = packed.files.map(({ path }) => path);
  assert(paths.includes("dist/index.js") && paths.includes("dist/index.d.ts") && paths.includes("README.md") && paths.includes("LICENSE"));
  assert(paths.every((path) => /^(dist\/|package\.json$|README\.md$|LICENSE$)/.test(path)), "Unexpected file in package");
  assert(!paths.some((path) => /\.test\.|\.tsx?$/.test(path) && !path.endsWith(".d.ts")), "Sources or tests in package");
  tarball = join(artifacts, packed.filename);
}
tarball = resolve(tarball);
const digest = createHash("sha256").update(await readFile(tarball)).digest("hex");
await writeFile(join(artifacts, "SHA256SUMS"), `${digest}  ${basename(tarball)}\n`);

const temp = await mkdtemp(join(tmpdir(), "ra-steward-consumer-"));
try {
  await cp(join(root, "tests/package-consumer"), temp, { recursive: true });
  const lock = await json(join(root, "package-lock.json"));
  const library = await json(join(root, "packages/ra-steward/package.json"));
  const rootPackage = await json(join(root, "package.json"));
  const versions = (names) => Object.fromEntries(names.map((name) => [name, lock.packages[`node_modules/${name}`].version]));
  const overrides = process.argv.includes("--legacy")
    ? await json(join(temp, "peers.legacy.json"))
    : JSON.parse(process.env.STEWARD_TEST_PEERS ?? "{}");
  const dependencies = { ...versions(Object.keys(library.peerDependencies)), "ra-steward": `file:${tarball}` };
  const devDependencies = versions(["@types/react", "@types/react-dom", "typescript", "vite"]);
  for (const [name, version] of Object.entries(overrides)) {
    assert(name in dependencies || name in devDependencies, `Unknown peer override: ${name}`);
    (name in devDependencies ? devDependencies : dependencies)[name] = version;
  }
  const manifest = { name: "ra-steward-package-consumer", version: "1.0.0", private: true, type: "module", dependencies, devDependencies };
  await writeFile(join(temp, "package.json"), JSON.stringify(manifest, null, 2));
  // Reuse the repository's exact transitive versions, but install into independent node_modules.
  // npm updates/prunes the lock for this consumer; there are no workspace or source symlinks.
  const packages = Object.fromEntries(Object.entries(lock.packages).filter(([path, entry]) => path.startsWith("node_modules/") && !entry.link));
  await writeFile(join(temp, "package-lock.json"), JSON.stringify({ name: manifest.name, version: manifest.version, lockfileVersion: 3, packages: { "": manifest, ...packages } }));
  await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--prefer-offline"], temp);
  assert.equal(await realpath(join(temp, "node_modules/ra-steward")), join(temp, "node_modules/ra-steward"));
  for (const name of Object.keys(library.peerDependencies)) {
    assert.equal(await realpath(join(temp, "node_modules", name)), join(temp, "node_modules", name));
  }
  assert.equal((await json(join(temp, "node_modules/vite/package.json"))).version, rootPackage.devDependencies.vite);
  await run("node", ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"], temp);
  await run("node", ["node_modules/typescript/bin/tsc", "-p", "tsconfig.nodenext.json"], temp);
  await run("node", ["verify.mjs"], temp);
  await run("node", ["node_modules/vite/bin/vite.js", "build", "--logLevel", "error"], temp);
  console.log(`Package consumer passed: ${basename(tarball)} (${digest})`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
