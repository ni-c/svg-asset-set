# svg-asset-set

Renders the documentation assets for the [ni-c](https://github.com/ni-c) MCP
projects: one SVG source into every copy those repositories actually publish,
plus the social preview.

**This is internal build tooling, not a product.** It is not on npm and
`package.json` is `private`, so it cannot get there by accident. It exists as
its own repository for one reason: the same 357-line script sat in eighteen
repositories, where it had drifted into two versions differing by an eight-line
guard. Now there is one.

If you landed here looking for something to use: this is a build script with a
hard-coded palette and a fixed card layout. It would not do what you want.

## Install

Consumers reference the tarball attached to a release, so `npm ci` gets an
integrity hash and no build step:

```json
"devDependencies": {
  "svg-asset-set": "https://github.com/ni-c/svg-asset-set/releases/download/v0.1.0/svg-asset-set-0.1.0.tgz"
}
```

```json
"scripts": {
  "assets": "svg-asset-set",
  "assets:check": "svg-asset-set --check"
}
```

## Why four copies of one drawing

Dark mode inside an SVG (`@media (prefers-color-scheme: dark)`) does work when
the SVG is embedded with `<img>` — but it follows the **operating system**, not
the theme toggle of the site showing it. Someone reading GitHub in dark mode on
a light OS gets the light drawing on a dark page: transparent artwork
disappears, and an opaque white one is a glaring slab.

So the colours are not chosen by the SVG. They are chosen here, four times:

| File                      | Palette | Background   | Consumer                              |
| ------------------------- | ------- | ------------ | ------------------------------------- |
| `<name>-light.svg`        | light   | transparent  | GitHub in light mode, via `<picture>` |
| `<name>-dark.svg`         | dark    | transparent  | GitHub in dark mode, via `<picture>`  |
| `<name>.svg`              | dark    | its own card | npm, which strips `<picture>`         |
| inline in `docs/index.md` | none    | none         | VitePress, via CSS variables          |

`<picture>` is evaluated against the _page's_ colour scheme, which is why GitHub
gets it right. npm removes `<picture>`/`<source>` when it sanitises a README and
keeps the `<img>`, so that fallback has to stand on its own: it carries its own
dark card and no media query, which reads as deliberate on a white page and
blends into a dark one.

## The source has one rule

It may only use the CSS classes — `.node`, `.edge`, `.label-title` and the rest.
A `<style>` block or a literal `fill="#…"` in the source is rejected outright,
because it would win over the palettes and the light copy would come out dark
with nobody able to say why.

## `--check`

Fails when a committed copy is stale, which is what CI runs. The **PNG is
checked by its dimensions, not its bytes**: text rasterises differently between
machines and fonts, so comparing bytes would fail CI for reasons that have
nothing to do with the drawing. Checked instead: that it exists, that it is
`1280×640`, and that it is under the 1 MB GitHub rejects.

## Layout

Everything defaults to the layout these repositories share:

| Option      | Default                                 |
| ----------- | --------------------------------------- |
| `source`    | `docs/assets/architecture.source.svg`   |
| `publicDir` | `docs/public`                           |
| `homePage`  | `docs/index.md` (empty string skips it) |
| `card`      | `docs/assets/og.json`                   |
| `site`      | contents of `docs/public/CNAME`         |
| `name`      | the source's own stem, minus `.source`  |

Override any of them in `svg-assets.config.json`, or point `--config` elsewhere.

`docs/assets/og.json` carries the card copy, split by hand because the renderer
does not wrap text:

```json
{
  "tagline": [
    "Inspect, create and adjust",
    "Healthchecks cron and uptime checks"
  ],
  "badges": ["14 tools", "MIT", "Node ≥22"]
}
```

An optional `title` overrides the heading — `package.json` says `@scope/thing`,
but the card should say `thing`.

## Licence

MIT © Willi Thiel
