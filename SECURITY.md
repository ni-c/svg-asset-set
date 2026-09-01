# Security policy

## Reporting a vulnerability

Please use [GitHub private vulnerability reporting](https://github.com/ni-c/svg-asset-set/security/advisories/new).
Do not open a public issue for an unpatched vulnerability.

Only the latest release and the current `main` branch receive security fixes.

## Trust model

Build tooling. It runs at development and CI time, reads files from the repository
it is run in, and writes files back into it. It is never part of a running service
and handles no credentials.

The input it parses — the source SVG and the card JSON — comes from the repository
itself, so it is as trusted as the rest of the checkout. Nothing here is hardened
against a hostile source file, and it should not be pointed at one.

It is not published to npm, and `package.json` is `private` so it cannot be by
accident. Consumers take the tarball attached to a release, which gives `npm ci` an
integrity hash.
