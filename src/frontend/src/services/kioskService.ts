/**
 * kioskService.ts
 *
 * Manages kiosk mode entry/exit and password validation.
 *
 * Runtime detection:
 *   - Android WebView (production): delegates to window.AndroidBridge native methods
 *   - Browser (dev/test): uses Fullscreen API
 *
 * ADR-6: requestFullscreen() is NOT available in the Kotlin WebView wrapper.
 * The native layer handles FLAG_FULLSCREEN and SYSTEM_UI_FLAG_HIDE_NAVIGATION.
 */

// Reference the ambient type declaration so TypeScript knows about window.AndroidBridge.
// Triple-slash reference is type-only and produces no runtime import (Vite cannot resolve .d.ts).
/// <reference path="../types/android-bridge.d.ts" />

const API_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) || 'http://localhost:3000';

/**
 * Returns true when running inside the Android WebView wrapper.
 * Task 14.3 — exported helper.
 */
export const isAndroidWebView = (): boolean =>
  typeof window !== 'undefined' &&
  window.AndroidBridge?.getPlatform() === 'android';

/**
 * Enter kiosk / fullscreen mode.
 * - Android: delegates to AndroidBridge.enterKiosk()
 * - Browser: calls document.documentElement.requestFullscreen()
 */
export async function enterKiosk(): Promise<void> {
  if (isAndroidWebView()) {
    window.AndroidBridge!.enterKiosk();
    return;
  }

  if (
    typeof document !== 'undefined' &&
    document.documentElement.requestFullscreen
  ) {
    try {
      await document.documentElement.requestFullscreen();
    } catch (err) {
      // Fullscreen may be denied (e.g. not triggered by user gesture in some browsers)
      console.warn('[kioskService] requestFullscreen failed:', err);
    }
  }
}

/**
 * Exit kiosk / fullscreen mode.
 * - Android: delegates to AndroidBridge.exitKiosk()
 * - Browser: calls document.exitFullscreen()
 */
export async function exitKiosk(): Promise<void> {
  if (isAndroidWebView()) {
    window.AndroidBridge!.exitKiosk();
    return;
  }

  if (
    typeof document !== 'undefined' &&
    document.exitFullscreen &&
    document.fullscreenElement
  ) {
    try {
      await document.exitFullscreen();
    } catch (err) {
      console.warn('[kioskService] exitFullscreen failed:', err);
    }
  }
}

/**
 * Validate the AdminBorne exit password.
 * - Android: delegates to AndroidBridge.validateExitPassword() (returns "true"/"false")
 * - Browser: calls backend POST /api/auth/validate-password
 *
 * Returns true if the password is correct, false otherwise.
 */
export async function validateExitPassword(password: string): Promise<boolean> {
  if (isAndroidWebView()) {
    const result = window.AndroidBridge!.validateExitPassword(password);
    return result === 'true';
  }

  // Browser path: validate against backend
  try {
    const res = await fetch(`${API_URL}/api/auth/validate-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    return res.ok;
  } catch (err) {
    console.error('[kioskService] validateExitPassword network error:', err);
    return false;
  }
}
