import { defineConfig, devices } from '@playwright/test';

const PORT = 4318;

/**
 * End-to-end tests run the real server (../server.ts) against the committed build in ../public,
 * so run `npm run build` first. A separate port keeps them clear of a dev server on 4317, and
 * STUN is disabled so tests never touch the network: two local peers connect via host candidates.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            // The viewer's <video> must start without a user gesture.
            '--autoplay-policy=no-user-gesture-required',
            // A synthetic microphone, so the presenter's mic path runs without prompts or hardware.
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'node server.ts',
    cwd: '..',
    url: `http://127.0.0.1:${PORT}/api/health`,
    // A fixed device-ID key keeps the test server from writing a key file.
    env: { PORT: String(PORT), HOST: '127.0.0.1', STUN_URLS: 'none', DEVICE_ID_KEY: 'e2e-device-id-key-not-a-secret-0000' },
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
