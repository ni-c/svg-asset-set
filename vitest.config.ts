import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // The CLI is argument parsing around the two exported functions and exits
      // the process; it is covered by running the built binary, not by a unit
      // test that would have to stub process.exit.
      exclude: ['src/cli.ts'],
      // Three branches short of 100, all of them the same kind: the
      // `process.cwd()` default (every test names a temp root instead, which is
      // the point of the option) and two `??` fallbacks that TypeScript demands
      // on values the expression above already guarantees — `[].pop()` on a
      // split result, and a replacer for characters the regex did not match.
      thresholds: {
        statements: 100,
        branches: 95,
        functions: 100,
        lines: 100,
      },
    },
  },
});
