// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { uiMessages } from './uiMessages';

it('has English and Vietnamese translations for every explicit Korean UI template', () => {
  const missing: string[] = [];
  for (const name of readdirSync(new URL('.', import.meta.url))) {
    if (!/\.tsx?$/.test(name) || /\.test\./.test(name)) continue;
    const source = readFileSync(new URL(name, import.meta.url), 'utf8');
    for (const match of source.matchAll(/\b(?:uiText|uiT)\(\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g)) {
      // Only repository-owned quoted literals are evaluated, never application/user data.
      const key = Function(`"use strict"; return (${match[1]});`)() as string;
      if (/[가-힣]/.test(key) && !uiMessages[key] && !uiMessages[key.trim()]) missing.push(`${name}: ${key}`);
    }
  }
  expect(missing).toEqual([]);
});
