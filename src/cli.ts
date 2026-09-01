#!/usr/bin/env node
import { readFileSync } from 'node:fs';

import { check, generate, type AssetSetOptions } from './index.js';

/**
 * `svg-asset-set` writes the files, `--check` fails if a committed one is
 * stale. Put both in package.json:
 *
 *   "assets":       "svg-asset-set",
 *   "assets:check": "svg-asset-set --check"
 *
 * Paths default to the conventional layout; a project that differs writes them
 * into `svg-assets.config.json` (or names another file with `--config`).
 */
const argv = process.argv.slice(2);
const checking = argv.includes('--check');
const configAt = argv.indexOf('--config');
const configPath =
  configAt === -1 ? 'svg-assets.config.json' : argv[configAt + 1];

let options: AssetSetOptions = {};
try {
  options = JSON.parse(
    readFileSync(configPath ?? 'svg-assets.config.json', 'utf8')
  ) as AssetSetOptions;
} catch (error) {
  // An explicitly named config that cannot be read is a mistake worth stopping
  // for; the conventional one simply may not exist.
  if (configAt !== -1) {
    console.error(
      `svg-asset-set: cannot read ${String(configPath)}: ${(error as Error).message}`
    );
    process.exit(1);
  }
}

try {
  if (checking) {
    const { problems } = check(options);
    for (const problem of problems) console.error(problem);
    if (problems.length > 0) process.exit(1);
    console.log('assets are up to date');
  } else {
    const { changed } = generate(options);
    for (const file of changed) console.log(`wrote ${file}`);
    if (changed.length === 0) console.log('assets were already up to date');
  }
} catch (error) {
  console.error(`svg-asset-set: ${(error as Error).message}`);
  process.exit(1);
}
