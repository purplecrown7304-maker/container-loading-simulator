// @vitest-environment node
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const localPackage = resolve(process.cwd(), 'vendor/picomatch-safe');
const picomatch = require(localPackage);

describe('locally maintained picomatch security fix', () => {
  it('bounds every public regex construction path for repeated wildcard extglobs, including malformed classes and opt-outs', () => {
    // A child timeout contains a regression; a broken generated regex must not
    // block Vitest's event loop and prevent its own timeout from being handled.
    const patterns = ['+(*)a', '+(*a)', '*(a*)', '+(a*)', '+(*a|b)', '*(*a)',
      '+([*)x', '+([*a)b', '+(*(a)a)', '+(+(*(a)))', 'src/+(*a).js'];
    const script = `
      const assert = require('node:assert/strict');
      const pm = require(process.argv[1]);
      const posix = require(process.argv[1] + '/posix');
      const patterns = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
      for (const api of [pm, posix]) for (const pattern of patterns) {
        for (const options of [{}, { fastpaths: false }, { maxExtglobRecursion: false },
          { capture: true }, { bash: true }, { windows: true }]) {
          const state = api.parse(pattern, options);
          const regexes = [api.makeRe(pattern, options), api.compileRe(state, options)];
          const input = pattern.startsWith('src/') ? 'src/' + 'a'.repeat(128) + '!.js' : 'a'.repeat(128) + '!';
          for (const regex of regexes) assert.equal(regex.test(input), false);
          assert.equal(api(pattern, options)(input), false);
          assert.equal(api.isMatch(input, pattern, options), false);
        }
      }
      process.stdout.write('protected');
    `;
    const child = spawnSync(process.execPath, ['-e', script, localPackage], {
      input: JSON.stringify(patterns), encoding: 'utf8', timeout: 3000,
    });
    expect(child.error, child.stderr).toBeUndefined();
    expect(child.status, child.stderr).toBe(0);
    expect(child.stdout).toBe('protected');
  });

  it.each(['+(*a)', '*(a*)', '+([*)x', '+(a*)'])('uses the existing escaped-literal fallback for unsafe %s', pattern => {
    expect(picomatch.makeRe(pattern).test(pattern)).toBe(true);
    expect(picomatch.makeRe(pattern).test('aaaa')).toBe(false);
  });

  it.each([
    ['+("*a")', '*a*a', true],
    ['+("*a")', 'aaa', false],
    ['+(\\*a)', '*a*a', true],
    ['+([*])', '***', true],
    ['+(foo|bar)', 'foobarfoo', true],
    ['+(foo|bar)', 'foox', false],
    ['+(*(a)|*(b))', 'abba', true],
    ['+(*(a)|*(b))', 'abc', false],
    ['src/**/*.test.{js,ts,tsx}', 'src/motion/flights.test.js', true],
    ['**/*.{test,spec}.?(c|m)[jt]s?(x)', 'src/PalletContents.test.tsx', true],
    ['**/*.{test,spec}.?(c|m)[jt]s?(x)', 'src/App.tsx', false],
    ['**/node_modules/**', 'node_modules/vite/dist/node/index.js', true],
    ['**/!(*.d).ts', 'src/App.ts', true],
    ['**/!(*.d).ts', 'src/types.d.ts', false],
  ])('retains compatible glob semantics: %s against %s', (pattern, input, expected) => {
    expect(picomatch(pattern)(input)).toBe(expected);
  });

  it('installs the actual patched source for Vite, Vitest and their glob dependency paths', () => {
    const vite = createRequire(require.resolve('vite'));
    const vitest = createRequire(require.resolve('vitest'));
    const globby = createRequire(vite.resolve('tinyglobby'));
    const fdir = createRequire(globby.resolve('fdir'));
    for (const owner of [require, vite, vitest, globby, fdir]) {
      expect(owner('picomatch/package.json').name).toBe('@load-studio/picomatch-safe');
      expect(owner('picomatch/package.json').version).toBe('4.0.7-load-studio.1');
      expect(readFileSync(owner.resolve('picomatch/lib/parse'), 'utf8'))
        .toBe(readFileSync(resolve(localPackage, 'lib/parse.js'), 'utf8'));
    }
  });
});
