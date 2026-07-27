import type { CapacitorConfig } from '@capacitor/cli';

/* The native shell. `webDir` is Vite's output — run `npm run build` before
   `npx cap sync`, or the app ships the previous build. */
const config: CapacitorConfig = {
  appId: 'com.oakenfall.game',
  appName: 'Oakenfall',
  webDir: 'dist',
  backgroundColor: '#14120e',
  android: {
    backgroundColor: '#14120e',
    // The game is a canvas the player drags; let the WebView keep its own
    // gesture handling rather than the system trying to interpret it.
    allowMixedContent: false,
  },
  ios: {
    backgroundColor: '#14120e',
    contentInset: 'never',
    scrollEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#14120e',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
  },
};

export default config;
