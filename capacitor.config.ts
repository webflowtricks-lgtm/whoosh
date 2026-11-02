import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.narutoarenamobile.game',
  appName: 'Naruto Arena Mobile',
  webDir: 'dist/client',
  server: {
    url: 'https://whoosh.robertosouzasouza999.workers.dev',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
      },
    },
  },
};

export default config;
