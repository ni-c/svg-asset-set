# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- #region changelog -->

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
