# Publishing ra-steward

`Release` builds and tests the library, installs the npm archive into a separate React Admin
app, checks compatibility, and publishes that exact archive to npm and GitHub Releases.
Stable versions use npm's `latest` tag. Versions such as `0.2.0-beta.1` use `next` and a
GitHub prerelease. The GitHub release includes the `.tgz` archive and `SHA256SUMS`.

## One-time setup

1. The package metadata selects `catdarick/ra-steward` and the MIT license. If the repository
   moves, update `repository.url`, `homepage` and `bugs.url` in the package manifest together.
   The canonical license is the root `LICENSE`; the build copies it into the npm package.
2. Ensure you own the npm package name. If `ra-steward` is unavailable, choose a scoped name
   and update the workspace references, consumer fixture imports and documentation together.
3. Create a GitHub environment called `npm`. Configure npm's trusted publisher with the
   exact owner, repository, workflow filename **`release.yml`** and environment **`npm`**.
   Allow direct `npm publish`. The workflow uses GitHub OIDC; it needs no `NPM_TOKEN`.
   See [npm's trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).
4. For a new npm name, publish the initial archive once while logged into an npm account
   with access, then configure its trusted publisher in the package settings. Use the
   artifact produced by `task pack`: `npm publish ./artifacts/ra-steward-0.1.0.tgz --access public`.
   Keep this archive for that release. Subsequent tagged releases publish through OIDC.
5. To include backend contract and browser checks in the release gate, set the repository
   variables `STEWARD_REPOSITORY` and optionally `STEWARD_REF`. For a private backend set
   `STEWARD_CHECKOUT_TOKEN` with read access. Without a backend selection, the frontend and
   package checks still run, and backend integration is skipped.
   Select a backend ref containing `protocol:fixtures` and the matching protocol updates.

The package metadata must match the publishing repository exactly for npm OIDC. Provenance
is generated automatically by npm for public packages built in public repositories.
An npm trusted publisher needs its first successful publication within npm's activation
window; configure it when you are ready to publish.

## A release

```sh
task version VERSION=0.2.0
task check
GITHUB_REPOSITORY=catdarick/ra-steward RELEASE_TAG=v0.2.0 task release:check
```

Commit the version and lockfile changes along with the implementation, then create and
push a tag at that commit:

```sh
git tag -a v0.2.0 -m "ra-steward 0.2.0"
git push origin HEAD
git push origin v0.2.0
```

The workflow verifies the tag matches the package version before any publishing. It gates
publishing on the same checks as ordinary CI, then downloads the tested archive without
rebuilding it. Installation checks exercise ESM imports, TypeScript Bundler and NodeNext
resolution, a host layout with native resources and authentication, shared React Admin
contexts, provider requests, and a production consumer build. CI also runs a React 18 /
MUI 7 / React Router 6 consumer alongside the current dependency set.

To retry a failed publication, rerun the failed workflow jobs, or run `Release` manually
and select the existing version tag. If npm already has that exact archive, publishing
continues with the GitHub release. A different archive under the same version is rejected;
change the version to publish different contents. Existing published GitHub release assets
are verified without overwriting them, including when releases are immutable.

## Local artifacts

`task build:library` creates `packages/ra-steward/dist` with ESM, source maps and `.d.ts`
files. `task build` builds that library and the demo. `task pack` writes a publishable archive
to `artifacts`; npm's `prepack` hook always rebuilds it. `task test:package` packs and tests
it in a temporary directory with independent dependencies. With `-- --packed`, that task
checks the single archive already in `artifacts`, as compatibility CI does.

Only the compiled distribution, package README, license and package manifest are included.
Sources, tests, demo files and repository configuration are excluded by the package's
`files` allowlist. Development and release commands use the root Taskfile.
