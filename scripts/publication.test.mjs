import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { publishGithub, publishNpm } from "./publication.mjs";

const info = { name: "ra-steward", version: "0.1.0-beta.1", tag: "v0.1.0-beta.1", prerelease: true, distTag: "next" };
const artifact = { artifacts: "/artifacts", tarball: "/artifacts/package.tgz", filename: "package.tgz", bytes: Buffer.from("tested archive"), sums: "checksum  package.tgz\n" };
const ok = (data = {}) => ({ status: 0, stdout: JSON.stringify(data), stderr: "" });
const missing = { status: 1, stdout: JSON.stringify({ error: { code: "E404" } }), stderr: "release not found" };
const integrity = `sha512-${createHash("sha512").update(artifact.bytes).digest("base64")}`;

test("publishes a new npm prerelease under next using the tested archive", async () => {
  const calls = [];
  const result = await publishNpm(info, artifact, async (name, args) => {
    calls.push([name, args]);
    return args[0] === "view" ? missing : ok();
  });
  assert.equal(result.skipped, false);
  assert.equal(calls[1][1][1], artifact.tarball);
  assert.deepEqual(calls[1][1].slice(2, 6), ["--access", "public", "--tag", "next"]);
});
test("retries npm publication only when the existing archive matches exactly", async () => {
  const calls = [];
  const run = async (_name, args) => { calls.push(args); return ok(integrity); };
  assert.equal((await publishNpm(info, artifact, run)).skipped, true);
  assert.equal(calls.length, 1);
  await assert.rejects(publishNpm(info, artifact, async () => ok("sha512-other")), /different archive/);
});
test("registry authentication and network errors never trigger npm publish", async () => {
  for (const code of ["E401", "EAI_AGAIN"]) {
    const calls = [];
    await assert.rejects(publishNpm(info, artifact, async (_name, args) => {
      calls.push(args);
      return { status: 1, stdout: JSON.stringify({ error: { code } }), stderr: code };
    }), /Unable to check npm version/);
    assert.equal(calls.length, 1);
  }
});
test("creates a draft with assets before publishing a GitHub prerelease", async () => {
  const calls = [];
  await publishGithub(info, artifact, async (_name, args) => {
    calls.push(args);
    return args[1] === "view" ? missing : ok();
  });
  assert(calls[1].includes("--draft") && calls[1].includes(artifact.tarball));
  assert(calls[1].includes("--prerelease"));
  assert(calls[2].includes("--draft=false") && calls[2].includes("--latest=false"));
});
test("resumes a partial draft without creating a second release", async () => {
  const calls = [];
  await publishGithub(info, artifact, async (_name, args) => {
    calls.push(args);
    return args[1] === "view" ? ok({ isDraft: true }) : ok();
  });
  assert.deepEqual(calls.map((args) => args[1]), ["view", "upload", "edit"]);
});
test("verifies immutable published assets on a rerun and rejects a mismatch", async () => {
  for (const matches of [true, false]) {
    const calls = [];
    const run = async (_name, args) => {
      calls.push(args);
      if (args[1] === "view") return ok({ isDraft: false });
      const dir = args[args.indexOf("--dir") + 1];
      await writeFile(join(dir, artifact.filename), matches ? artifact.bytes : "different");
      await writeFile(join(dir, "SHA256SUMS"), artifact.sums);
      return ok();
    };
    if (matches) assert.equal((await publishGithub(info, artifact, run)).skipped, true);
    else await assert.rejects(publishGithub(info, artifact, run), /different archive/);
    assert.deepEqual(calls.map((args) => args[1]), ["view", "download"]);
  }
});
