import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { cardSvg, check, generate, parseSource } from '../src/index.js';

const SOURCE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" role="img" aria-labelledby="t">
  <title id="t">A drawing</title>
  <rect class="node" x="10" y="10" width="100" height="40" rx="8" />
  <text class="label-title" x="60" y="35">thing</text>
</svg>
`;

const roots: string[] = [];

/** A project laid out the way the defaults expect. */
function project(
  overrides: { source?: string; home?: string | null } = {}
): string {
  const root = mkdtempSync(join(tmpdir(), 'svg-asset-set-'));
  roots.push(root);
  mkdirSync(join(root, 'docs', 'assets'), { recursive: true });
  mkdirSync(join(root, 'docs', 'public'), { recursive: true });
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'thing-mcp' })
  );
  writeFileSync(
    join(root, 'docs', 'assets', 'architecture.source.svg'),
    overrides.source ?? SOURCE
  );
  writeFileSync(
    join(root, 'docs', 'assets', 'og.json'),
    JSON.stringify({
      tagline: ['One line', 'And another'],
      badges: ['7 tools', 'MIT'],
    })
  );
  writeFileSync(join(root, 'docs', 'public', 'CNAME'), 'thing.example.com\n');
  if (overrides.home !== null) {
    writeFileSync(
      join(root, 'docs', 'index.md'),
      overrides.home ??
        `# Home\n\n<!-- ARCHITECTURE:START — generated -->\nold\n<!-- ARCHITECTURE:END -->\n\nprose\n`
    );
  }
  return root;
}

const read = (root: string, ...parts: string[]): string =>
  readFileSync(join(root, ...parts), 'utf8');

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('rendering the set', () => {
  it('writes every copy plus the card', () => {
    const root = project();
    const { changed } = generate({ root });
    expect(changed.sort()).toEqual(
      [
        'docs/index.md',
        'docs/public/architecture-dark.svg',
        'docs/public/architecture-light.svg',
        'docs/public/architecture.svg',
        'docs/public/og.png',
        // The card's markup, written out so --check has something
        // deterministic to compare. The PNG cannot be compared byte for byte.
        'docs/public/og.svg',
      ].sort()
    );
  });

  it('gives the light and dark copies different palettes and no background', () => {
    // The whole reason there are two: an SVG's own media query follows the
    // operating system, not the theme toggle of the page showing it.
    const root = project();
    generate({ root });
    const light = read(root, 'docs/public/architecture-light.svg');
    const dark = read(root, 'docs/public/architecture-dark.svg');
    expect(light).toContain('#f8fafc');
    expect(dark).toContain('#e2e8f0');
    expect(light).not.toContain('class="surface"');
    expect(dark).not.toContain('class="surface"');
  });

  it('gives the npm fallback its own card', () => {
    // npm strips <picture> and keeps the <img>, so this one cannot depend on
    // what colour the surrounding page happens to be.
    const root = project();
    generate({ root });
    const carded = read(root, 'docs/public/architecture.svg');
    expect(carded).toContain('class="surface"');
    // 400x200 artwork plus 24px of padding on every side.
    expect(carded).toContain('viewBox="0 0 448 248"');
    expect(carded).toContain('npm shows');
  });

  it('gives the inline copy no palette at all', () => {
    // The docs site drives it from its own theme variables, so a palette here
    // would fight the theme toggle rather than follow it.
    const root = project();
    generate({ root });
    const home = read(root, 'docs/index.md');
    expect(home).toContain('<svg viewBox="0 0 400 200"');
    expect(home).not.toContain('<style>');
    expect(home).not.toContain('#f8fafc');
  });

  it('replaces only the marked block of the home page', () => {
    const root = project();
    generate({ root });
    const home = read(root, 'docs/index.md');
    expect(home.startsWith('# Home')).toBe(true);
    expect(home.trimEnd().endsWith('prose')).toBe(true);
    expect(home).not.toContain('\nold\n');
  });

  it('carries the accessible names into every standalone copy', () => {
    const root = project();
    generate({ root });
    for (const file of [
      'architecture-light.svg',
      'architecture-dark.svg',
      'architecture.svg',
    ]) {
      expect(read(root, 'docs/public', file), file).toContain(
        '<title id="t">A drawing</title>'
      );
      expect(read(root, 'docs/public', file), file).toContain(
        'aria-labelledby="t"'
      );
    }
  });

  it('marks the generated files as generated', () => {
    expect(read(project(), 'docs/index.md')).not.toContain('GENERATED FILE');
    const root = project();
    generate({ root });
    expect(read(root, 'docs/public/architecture-light.svg')).toContain(
      'GENERATED FILE'
    );
  });

  it('renders a social preview at the size GitHub wants', () => {
    const root = project();
    generate({ root });
    const png = readFileSync(join(root, 'docs/public/og.png'));
    expect(png.readUInt32BE(16)).toBe(1280);
    expect(png.readUInt32BE(20)).toBe(640);
    expect(png.length).toBeLessThan(1024 * 1024);
  });

  it('writes nothing the second time', () => {
    const root = project();
    generate({ root });
    // The card is rendered every run — bytes differ between machines, so it is
    // never compared — but nothing else should move.
    expect(generate({ root }).changed).toEqual(['docs/public/og.png']);
  });

  it('skips the home page when asked to', () => {
    const root = project({ home: null });
    expect(generate({ root, homePage: '' }).changed).not.toContain(
      'docs/index.md'
    );
  });
});

describe('checking the set', () => {
  it('is quiet when everything is current', () => {
    const root = project();
    generate({ root });
    expect(check({ root })).toEqual({ changed: [], problems: [] });
  });

  it('names a copy that was edited by hand', () => {
    const root = project();
    generate({ root });
    writeFileSync(
      join(root, 'docs/public/architecture-dark.svg'),
      '<svg>tampered</svg>'
    );
    const { problems } = check({ root });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('architecture-dark.svg is out of date');
  });

  it('notices a copy that is missing entirely', () => {
    const root = project();
    const { problems } = check({ root });
    expect(problems.some((p) => p.includes('architecture-light.svg'))).toBe(
      true
    );
    expect(problems.some((p) => p.includes('og.png is missing'))).toBe(true);
  });

  it('notices a card of the wrong size', () => {
    // The dimensions are the contract GitHub cares about. Bytes are not
    // comparable across machines, so they are never compared.
    const root = project();
    generate({ root });
    const png = readFileSync(join(root, 'docs/public/og.png'));
    png.writeUInt32BE(1200, 16);
    writeFileSync(join(root, 'docs/public/og.png'), png);
    expect(check({ root }).problems[0]).toContain(
      "1200x640, GitHub's social preview wants"
    );
  });

  it('notices a card too big for GitHub to accept', () => {
    const root = project();
    generate({ root });
    const png = readFileSync(join(root, 'docs/public/og.png'));
    writeFileSync(
      join(root, 'docs/public/og.png'),
      Buffer.concat([png, Buffer.alloc(1024 * 1024)])
    );
    expect(check({ root }).problems[0]).toContain(
      'GitHub rejects 1 MB and above'
    );
  });

  it('says something usable about a half-written card', () => {
    // Otherwise the header read below throws a RangeError out of the top level
    // instead of reaching a message anyone can act on.
    const root = project();
    generate({ root });
    writeFileSync(join(root, 'docs/public/og.png'), Buffer.alloc(8));
    expect(check({ root }).problems[0]).toContain('too short to be a PNG');
  });
});

describe('refusing a source it cannot work with', () => {
  it('refuses one that carries its own colours', () => {
    // They would win over the palettes, and the light copy would come out dark
    // with nobody able to say why.
    expect(() =>
      parseSource('<svg viewBox="0 0 1 1"><rect fill="#fff" /></svg>')
    ).toThrow(/carries its own colours/);
    expect(() =>
      parseSource('<svg viewBox="0 0 1 1"><style>a{}</style></svg>')
    ).toThrow(/carries its own colours/);
  });

  it('refuses one with no viewBox to size the copies from', () => {
    expect(() =>
      parseSource('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    ).toThrow(/no viewBox/);
    expect(() => parseSource('<svg viewBox="nonsense"></svg>')).toThrow(
      /unreadable viewBox/
    );
  });

  it('refuses something that is not an svg at all', () => {
    expect(() => parseSource('# not an svg')).toThrow(/no <svg> element/);
  });

  it('refuses a home page without the markers', () => {
    const root = project({ home: '# Home\n\nno markers here\n' });
    expect(() => generate({ root })).toThrow(
      /missing the <!-- ARCHITECTURE:START/
    );
  });

  it('works without an aria-labelledby', () => {
    const root = project({
      source: '<svg viewBox="0 0 10 10"><rect class="node" /></svg>',
    });
    generate({ root });
    expect(read(root, 'docs/public/architecture.svg')).not.toContain(
      'aria-labelledby'
    );
  });
});

describe('a project laid out differently', () => {
  it('takes every path from the options', () => {
    // The defaults are one project's conventions. Nothing here should be
    // reachable only by adopting them.
    const root = mkdtempSync(join(tmpdir(), 'svg-asset-set-'));
    roots.push(root);
    mkdirSync(join(root, 'art'), { recursive: true });
    mkdirSync(join(root, 'out'), { recursive: true });
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'elsewhere' })
    );
    writeFileSync(join(root, 'art', 'flow.svg'), SOURCE);
    writeFileSync(
      join(root, 'art', 'card.json'),
      JSON.stringify({ tagline: [], badges: [] })
    );

    const { changed } = generate({
      root,
      source: 'art/flow.svg',
      publicDir: 'out',
      card: 'art/card.json',
      homePage: '',
      // No CNAME to read, so the site name is passed instead.
      site: 'elsewhere.example',
    });
    expect(changed.sort()).toEqual(
      [
        'out/flow-dark.svg',
        'out/flow-light.svg',
        'out/flow.svg',
        'out/og.png',
        'out/og.svg',
      ].sort()
    );
    expect(read(root, 'out/flow.svg')).toContain('Source: art/flow.svg');
  });

  it('lets the output name be chosen outright', () => {
    const root = project();
    generate({ root, name: 'diagram' });
    expect(read(root, 'docs/public/diagram-light.svg')).toContain(
      'GENERATED FILE'
    );
  });

  it('falls back to the source name when package.json has none', () => {
    const root = project();
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ version: '1.0.0' })
    );
    writeFileSync(
      join(root, 'docs', 'assets', 'og.json'),
      JSON.stringify({ tagline: [], badges: [] })
    );
    expect(() => generate({ root })).not.toThrow();
  });
});

describe('the card copy', () => {
  it('escapes markup in whatever it is given', () => {
    // The tagline comes from a JSON file somebody edits; an unescaped `&` makes
    // the SVG unparseable and the failure surfaces as a blank image.
    const svg = cardSvg({
      name: 'a & b',
      tagline: ['<script>'],
      badges: ['x & y'],
      site: 'example.com',
    });
    expect(svg).toContain('a &amp; b');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).not.toContain('<script>');
  });

  it('sizes each badge to its own label', () => {
    const svg = cardSvg({
      name: 'n',
      tagline: [],
      badges: ['x', 'a much longer badge'],
      site: 's',
    });
    const widths = [
      ...svg.matchAll(/class="pill" x="\d+" y="\d+" width="(\d+)"/g),
    ].map((m) => Number(m[1]));
    expect(widths).toHaveLength(2);
    expect(widths[1]).toBeGreaterThan(widths[0] as number);
  });

  it('prefers an explicit title over the package name', () => {
    // package.json says @scope/thing; the card should say thing.
    const root = project();
    writeFileSync(
      join(root, 'docs', 'assets', 'og.json'),
      JSON.stringify({ title: 'thing', tagline: [], badges: [] })
    );
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: '@scope/thing' })
    );
    expect(() => generate({ root })).not.toThrow();
  });
});

describe('what --check can actually see', () => {
  it('catches an og.json edit that nobody regenerated', () => {
    // The card was the one artefact --check could not compare: it verified that
    // og.png existed, was 1280x640 and under a megabyte, and never looked at
    // the drawing. So a badge edited from "7 tools" to "8 tools" without
    // running `npm run assets` stayed green forever, and the social preview
    // kept making the old claim.
    const root = project();
    generate({ root });
    expect(check({ root }).problems).toEqual([]);

    writeFileSync(
      join(root, 'docs', 'assets', 'og.json'),
      JSON.stringify({ tagline: ['One line'], badges: ['8 tools', 'MIT'] })
    );
    const stale = check({ root });
    expect(stale.problems.join('\n')).toContain('docs/public/og.svg');
  });

  it('catches a rename that leaves the card claiming the old name', () => {
    const root = project();
    generate({ root });
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'renamed-mcp' })
    );
    expect(check({ root }).problems.join('\n')).toContain('og.svg');
  });

  it('is deterministic: the card svg is pure string building', () => {
    // The reason this works where a byte comparison of the PNG would not.
    const root = project();
    generate({ root });
    const first = read(root, 'docs/public/og.svg');
    generate({ root });
    expect(read(root, 'docs/public/og.svg')).toBe(first);
  });
});

describe('the architecture markers', () => {
  it('does not eat prose above a page that documents its own markers', () => {
    // START was the bare word while END was the whole comment, and the
    // insertion point was "the first --> after the first match". A page
    // explaining its own markers in an earlier comment therefore had that
    // sentence matched instead, and everything between it and END — including
    // the real START — was replaced without a word.
    const root = project({
      home: [
        '# Home',
        '',
        '<!-- The diagram between ARCHITECTURE:START and ARCHITECTURE:END is generated. -->',
        '',
        '## A whole section of hand-written prose',
        '',
        'that nobody wants to lose',
        '',
        '<!-- ARCHITECTURE:START -->',
        'old',
        '<!-- ARCHITECTURE:END -->',
        '',
        'tail',
        '',
      ].join('\n'),
    });
    generate({ root });
    const home = read(root, 'docs/index.md');
    expect(home).toContain('## A whole section of hand-written prose');
    expect(home).toContain('that nobody wants to lose');
    expect(home).toContain('tail');
    expect(home).toContain('<svg');
  });

  it('refuses markers in the wrong order rather than slicing the page apart', () => {
    // indexOf('-->', from) was -1 here, so afterStart became 2 and the page was
    // reduced to its first two characters.
    const root = project({
      home: '# Home\n\n<!-- ARCHITECTURE:END -->\n\n<!-- ARCHITECTURE:START -->\n',
    });
    expect(() => generate({ root })).toThrow(/before <!-- ARCHITECTURE:START/);
  });

  it('refuses a page with two start markers', () => {
    const root = project({
      home: [
        '<!-- ARCHITECTURE:START -->',
        'a',
        '<!-- ARCHITECTURE:START -->',
        'b',
        '<!-- ARCHITECTURE:END -->',
      ].join('\n'),
    });
    expect(() => generate({ root })).toThrow(/more than once/);
  });

  it('refuses an unterminated start comment', () => {
    const root = project({
      home: '<!-- ARCHITECTURE:START\nold\n<!-- ARCHITECTURE:END -->\n',
    });
    expect(() => generate({ root })).toThrow(/unterminated/);
  });
});
