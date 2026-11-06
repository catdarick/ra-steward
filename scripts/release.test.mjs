import assert from "node:assert/strict";
import { test } from "node:test";
import { releaseInfo } from "./release.mjs";

const manifest = (version = "0.1.0") => ({
  name: "ra-steward", version, license: "MIT",
  repository: { type: "git", url: "git+https://github.com/example/ra-steward.git", directory: "packages/ra-steward" },
  publishConfig: { access: "public", registry: "https://registry.npmjs.org/" },
});
test("stable releases use latest; prereleases use next", () => {
  assert.equal(releaseInfo(manifest(), "v0.1.0", "example/ra-steward").distTag, "latest");
  for (const version of ["1.0.0-beta.1", "1.0.0-0", "1.0.0-rc.2", "1.0.0-01a"]) {
    assert.equal(releaseInfo(manifest(version), `v${version}`, "example/ra-steward").distTag, "next");
  }
});
test("a release cannot publish a mismatched tag, version, repository or registry", () => {
  assert.throws(() => releaseInfo(manifest(), "v0.2.0", "example/ra-steward"), /tag must match/);
  assert.throws(() => releaseInfo(manifest(), "v0.1.0", "someone/fork"), /repository.url/);
  assert.throws(() => releaseInfo({ ...manifest(), publishConfig: { access: "public", registry: "https://other.example/" } }, "v0.1.0", "example/ra-steward"), /registry/);
  for (const version of ["01.0.0", "1.0", "1.0.0-01", "1.0.0+build", "1.0.0-", "1.0.0-rc..1"]) {
    assert.throws(() => releaseInfo(manifest(version), `v${version}`, "example/ra-steward"), /semantic version/);
  }
});
test("publishing requires an explicit license and a public package", () => {
  assert.throws(() => releaseInfo({ ...manifest(), license: undefined }, "v0.1.0", "example/ra-steward"), /license/);
  assert.throws(() => releaseInfo({ ...manifest(), private: true }, "v0.1.0", "example/ra-steward"), /publishable/);
});
