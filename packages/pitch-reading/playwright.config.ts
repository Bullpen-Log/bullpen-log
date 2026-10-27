import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 60000, workers: 1,
  use: { baseURL: 'http://localhost:4173', viewport: { width: 1440, height: 1050 },
    launchOptions: { args: ['--use-gl=angle', '--use-angle=metal'] }, screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev', port: 4173, reuseExistingServer: true },
});
