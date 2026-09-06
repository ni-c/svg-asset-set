# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- #region changelog -->

## [Unreleased]

### Added

- `icon-512.png`, rendered from the same `docs/public/favicon.svg` the site
  already serves. An MCP server declares `icons` in its handshake and the
  specification requires clients to support PNG while SVG is optional, so the
  SVG alone reaches only some of them. `check()` verifies the file exists and is
  512x512 — a declared size that does not match the file is a claim no client
  can test and every client will believe. A missing favicon is reported, not
  substituted: the mark belongs to the project, and a generated stand-in would
  be a different one under the same name.

### Changed

- Source maps are no longer published in the npm tarball. Node reads them only
  under `--enable-source-maps`, which nothing here sets, and the maps pointed at
  a `src/` this package does not ship — so a stack trace under that flag named a
  file nobody could open. `dist/**/*.js` is unchanged; the package is about a
  fifth smaller.

[Unreleased]: https://github.com/ni-c/svg-asset-set/compare/v0.2.0...HEAD

## [0.2.0] - 2026-09-02

### Added

- `og.svg` — the card's own markup, written next to `og.png` and compared byte
  for byte like the other artefacts. The PNG cannot be: text rasterises
  differently between machines and fonts, which is why `--check` only ever
  verified that a 1280x640 file under a megabyte existed. It never looked at
  the drawing, so an edit to `og.json`, a rename in `package.json` or a new
  `CNAME` that nobody regenerated stayed green forever while the social preview
  kept making the old claim. `cardSvg` is pure string building with no
  environment dependency, so the intermediate _is_ comparable even though its
  rasterisation is not.

  **Consumers need one `npm run assets` and one commit.** Until `og.svg` is
  committed, `assets:check` reports it as missing — which is the point.

### Fixed

- The `ARCHITECTURE:START` marker is bound to its comment. It was the bare word
  while `ARCHITECTURE:END` was the whole comment, and the insertion point was
  "the first `-->` after the first match" rather than the one closing that
  marker. A page that documented its own markers — a sentence naming them in an
  earlier comment, which is what somebody writes to make the page
  understandable — had that sentence matched instead, and everything between it
  and `END`, including the real start marker, was replaced without a word. Exit
  code 0, and the result reproduces itself on the next run, so it is only ever
  visible in the diff of the commit that did it.

  Markers in the wrong order used to reduce the page to its first two
  characters (`indexOf('-->', from)` returned -1, so the slice began at 2).
  Both that and a duplicated start marker are now refused with a message
  naming the problem.

## [0.1.0] - 2026-09-01

First release. Lifted out of eighteen repositories that carried the same
357-line script, in two versions differing by an eight-line guard against a
half-written PNG. The guard wins.

### Added

- `generate` and `check`, plus an `svg-asset-set` binary wrapping them.
- Every path is an option. The defaults are one project's conventions, not a
  requirement; `svg-assets.config.json` overrides them.

### Notes

Not published to npm, and `package.json` is `private` so it cannot be by
accident. This renders documentation assets for one set of repositories; it has
a hard-coded palette and a fixed card layout, and nobody else has a use for it.
Consumers take the tarball attached to each release, which gives `npm ci` an
integrity hash without a git clone or a TypeScript build.

<!-- #endregion changelog -->

[0.1.0]: https://github.com/ni-c/svg-asset-set/releases/tag/v0.1.0
