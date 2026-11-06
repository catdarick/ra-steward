import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const number = "(?:0|[1-9][0-9]*)";
const identifier = `(?:${number}|[0-9]*[A-Za-z-][0-9A-Za-z-]*)`;
const semver = new RegExp(`^${number}\\.${number}\\.${number}(?:-${identifier}(?:\\.${identifier})*)?$`);

export function releaseInfo(manifest, tag, repository) {
  assert(semver.test(manifest.version), "Use a semantic version without build metadata");
  assert.equal(tag, `v${manifest.version}`, "Release tag must match packages/ra-steward/package.json");
  assert(manifest.name && manifest.private !== true, "The package must be publishable");
  assert(typeof manifest.license === "string" && manifest.license.trim() && manifest.license !== "UNLICENSED", "Choose a license before publishing");
  assert(/^[\w.-]+\/[\w.-]+$/.test(repository ?? ""), "Set GITHUB_REPOSITORY to owner/name for local release checks");
  const repositoryUrl = `git+https://github.com/${repository}.git`;
  assert.equal(manifest.repository?.url, repositoryUrl, "repository.url must exactly match the publishing GitHub repository");
  assert.equal(manifest.repository?.directory, "packages/ra-steward");
  assert.equal(manifest.publishConfig?.access, "public");
  assert.equal(manifest.publishConfig?.registry, "https://registry.npmjs.org/");
  const prerelease = manifest.version.includes("-");
  return { name: manifest.name, version: manifest.version, tag, prerelease, distTag: prerelease ? "next" : "latest" };
}

export async function checkRelease() {
  if (process.env.GITHUB_ACTIONS === "true") {
    assert(process.env.GITHUB_REF?.startsWith("refs/tags/"), "Run releases from a version tag");
  }
  const root = new URL("../", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("packages/ra-steward/package.json", root), "utf8"));
  const lock = JSON.parse(await readFile(new URL("package-lock.json", root), "utf8"));
  assert.equal(lock.packages["packages/ra-steward"].version, manifest.version, "Refresh package-lock.json after changing the version");
  const info = releaseInfo(manifest, process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME, process.env.GITHUB_REPOSITORY);
  const license = await readFile(new URL("LICENSE", root), "utf8");
  assert(license.trim().length > 100, "Include the chosen license text in the published package");
  return info;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  console.log(JSON.stringify(await checkRelease(), null, 2));
}
