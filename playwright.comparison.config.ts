import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: 'three-comparison.spec.ts', workers: 1, retries: 0,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', launchOptions: {
    executablePath: process.env.COMPARISON_CHROMIUM_PATH,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  } },
  projects: [
    { name: 'comparison-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'comparison-mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4173', url: 'http://127.0.0.1:4173/comparison.html', reuseExistingServer: true, timeout: 30000 },
});
