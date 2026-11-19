import { defineConfig } from 'vitest/config';

// Node 25+ defines its own `localStorage` global. Without --localstorage-file it is
// `undefined`, and it shadows the one happy-dom provides, so every test that touches
// storage fails. Turn the built-in off in test workers; older Node gets no extra flag.
const nodeMajor = Number(process.versions.node.split('.')[0]);
const workerExecArgv = nodeMajor >= 25 ? ['--no-experimental-webstorage'] : [];

export default defineConfig({
  test: {
    environment: 'happy-dom',
    execArgv: workerExecArgv,
    include: ['src/**/*.test.{js,ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
