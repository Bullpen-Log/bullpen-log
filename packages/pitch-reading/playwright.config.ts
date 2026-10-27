import { defineConfig } from '@playwright/test';
const port=Number(process.env.PITCH_READING_PORT??4173);
export default defineConfig({
  testDir: './tests/browser', timeout: 60000, workers: 1,
  use: { baseURL: `http://localhost:${port}`, viewport: { width: 1440, height: 1050 },
    launchOptions: { args: ['--use-gl=angle', '--use-angle=metal'] }, screenshot: 'only-on-failure' },
  webServer: { command: `npm run dev -- --port ${port}`, port, reuseExistingServer: true },
});
