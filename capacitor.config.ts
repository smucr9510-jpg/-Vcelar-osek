import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cz.toreno.vcelarosek',
  appName: 'Včelař – Osek',
  webDir: 'www',
  bundledWebRuntime: false,
  server: { androidScheme: 'https' }
};

export default config;
