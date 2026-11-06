import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function publishNpm(info, { tarball, bytes }, run) {
  const published = await run("npm", ["view", `${info.name}@${info.version}`, "dist.integrity", "--json", "--registry=https://registry.npmjs.org/"], true);
  if (published.status === 0) {
    const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    assert.equal(JSON.parse(published.stdout), integrity, "This version already exists in npm with a different archive");
    return { skipped: true };
  }
  let error;
  try { error = JSON.parse(published.stdout).error; } catch { /* Report the original registry failure below. */ }
  assert.equal(error?.code, "E404", `Unable to check npm version: ${published.stderr}`);
  await run("npm", ["publish", tarball, "--access", "public", "--tag", info.distTag, "--registry=https://registry.npmjs.org/", "--ignore-scripts"]);
  return { skipped: false };
}

export async function publishGithub(info, { artifacts, tarball, filename, bytes, sums }, run) {
  const existing = await run("gh", ["release", "view", info.tag, "--json", "isDraft"], true);
  if (existing.status !== 0) {
    assert(/release not found|HTTP 404/i.test(existing.stderr), `Unable to query GitHub release: ${existing.stderr}`);
    await run("gh", ["release", "create", info.tag, tarball, join(artifacts, "SHA256SUMS"), "--verify-tag", "--title", info.tag, "--generate-notes", "--draft", ...(info.prerelease ? ["--prerelease"] : [])]);
  } else if (JSON.parse(existing.stdout).isDraft) {
    await run("gh", ["release", "upload", info.tag, tarball, join(artifacts, "SHA256SUMS"), "--clobber"]);
  } else {
    // Published releases may be immutable. A rerun verifies assets without overwriting them.
    const temp = await mkdtemp(join(tmpdir(), "ra-steward-release-"));
    try {
      await run("gh", ["release", "download", info.tag, "--dir", temp, "--pattern", filename, "--pattern", "SHA256SUMS"]);
      assert.deepEqual(await readFile(join(temp, filename)), bytes, "GitHub release contains a different archive");
      assert.equal(await readFile(join(temp, "SHA256SUMS"), "utf8"), sums);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
    return { skipped: true };
  }
  await run("gh", ["release", "edit", info.tag, "--draft=false", `--prerelease=${info.prerelease}`, ...(info.prerelease ? ["--latest=false"] : [])]);
  return { skipped: false };
}
