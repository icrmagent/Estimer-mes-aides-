export {};

declare global {
  interface Window {
    AndroidBridge?: {
      /** Request native fullscreen / kiosk lock */
      enterKiosk: () => void;
      /** Release native fullscreen / kiosk lock */
      exitKiosk: () => void;
      /**
       * Validate admin password for kiosk exit.
       * Returns boolean as string "true" or "false".
       */
      validateExitPassword: (password: string) => string;
      /** Returns "android" — used for environment detection */
      getPlatform: () => 'android';
    };
  }
}
