/**
 * Configuration for Playwright using default from @jupyterlab/galata
 */
import { defineConfig } from '@playwright/test';
import baseConfig from '@jupyterlab/galata/lib/playwright-config';

export default defineConfig({
  ...baseConfig,
  webServer: {
    command: 'jlpm start',
    url: 'http://localhost:8888/lab',
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI
  }
});
