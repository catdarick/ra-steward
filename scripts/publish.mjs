import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { checkRelease, releaseInfo } from "./release.mjs";
import { command } from "./command.mjs";
import { publishGithub, publishNpm } from "./publication.mjs";

// Run only from release.yml; this script publishes the already tested artifact without rebuilding it.
assert.equal(process.env.GITHUB_ACTIONS, "true", "Publish through the Release workflow");
const info = await checkRelease();
const artifacts = resolve("artifacts");
const archives = (await readdir(artifacts)).filter((name) => name.endsWith(".tgz"));
assert.equal(archives.length, 1, "Expected exactly one tested package archive");
const filename = archives[0];
const tarball = join(artifacts, filename);
const bytes = await readFile(tarball);
const sums = `${createHash("sha256").update(bytes).digest("hex")}  ${filename}\n`;
assert.equal(await readFile(join(artifacts, "SHA256SUMS"), "utf8"), sums, "Package checksum mismatch");

const run = (name, args, allowFailure = false) => command(name, args, { allowFailure });
const packed = JSON.parse((await run("tar", ["-xOf", tarball, "package/package.json"])).stdout);
assert.deepEqual(releaseInfo(packed, info.tag, process.env.GITHUB_REPOSITORY), info);
assert.equal((await run("tar", ["-xOf", tarball, "package/LICENSE"])).stdout, await readFile("LICENSE", "utf8"));

const artifact = { artifacts, tarball, filename, bytes, sums };
const npmResult = await publishNpm(info, artifact, run);
console.log(npmResult.skipped ? "Verified the existing npm archive" : "Published the npm archive");
const githubResult = await publishGithub(info, artifact, run);
console.log(githubResult.skipped ? "Verified the existing GitHub release" : "Published the GitHub release");
console.log(`Published ${info.name}@${info.version} to npm (${info.distTag}) and GitHub ${info.tag}`);
