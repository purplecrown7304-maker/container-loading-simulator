import type { Browser, Page } from '@playwright/test';
import { build } from 'vite';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Build the real engine and module Worker, isolated from App and physics UI. */
export async function withWorkerParityPage(browser: Browser, run: (page: Page) => Promise<void>) {
  const outDir = await mkdtemp(join(tmpdir(), 'loading-worker-parity-'));
  const context = await browser.newContext();
  try {
    await build({
      configFile: false,
      root: fileURLToPath(new URL('../fixtures/loading-worker-parity/', import.meta.url)),
      base: '/__loading-worker-parity/',
      logLevel: 'warn',
      build: { outDir, emptyOutDir: true },
    });
    const files = new Map<string, Buffer>();
    async function collect(dir: string) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await collect(path);
        else files.set(relative(outDir, path).replaceAll('\\', '/'), await readFile(path));
      }
    }
    await collect(outDir);
    await context.route('**/__loading-worker-parity/**', async route => {
      const path = new URL(route.request().url()).pathname.replace('/__loading-worker-parity/', '');
      const body = files.get(path);
      if (!body) return route.fulfill({ status: 404, body: 'Unknown parity fixture asset' });
      await route.fulfill({ body, contentType: path.endsWith('.html') ? 'text/html' : 'text/javascript' });
    });
    const page = await context.newPage();
    await page.goto('/__loading-worker-parity/index.html');
    await page.waitForFunction(() => typeof (window as any).runLoadingWorkerParity === 'function');
    await run(page);
  } finally {
    await context.close();
    await rm(outDir, { recursive: true, force: true });
  }
}
