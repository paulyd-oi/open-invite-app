/**
 * E2E Test Helpers
 * 
 * Shared utilities for ensuring deterministic test isolation.
 * Every test file should use resetAppToFreshState() in beforeAll.
 */

import { device, element, by, waitFor } from 'detox';

/**
 * Reset app to fresh state (logged out, on welcome screen).
 * 
 * Isolation strategy:
 * 1. Terminate if running
 * 2. Uninstall to clear all app data (SecureStore, AsyncStorage, etc.)
 * 3. Reinstall from build
 * 4. Launch fresh instance
 * 5. Wait for welcome screen anchor
 * 
 * This guarantees every test starts from loggedOut on /welcome.
 */
export async function resetAppToFreshState() {
  console.log('[E2E_ISOLATION] Starting app reset...');
  
  try {
    // Step 1: Terminate if running
    await device.terminateApp();
    console.log('[E2E_ISOLATION] App terminated');
  } catch (error) {
    console.log('[E2E_ISOLATION] App not running, skipping terminate');
  }
  
  try {
    // Step 2: Uninstall to clear all state (most important for isolation)
    await device.uninstallApp();
    console.log('[E2E_ISOLATION] App uninstalled - all state cleared');
  } catch (error) {
    console.warn('[E2E_ISOLATION] Uninstall failed:', error);
    // If uninstall fails, try to continue with delete flag
  }
  
  // Step 3: Reinstall
  await device.installApp();
  console.log('[E2E_ISOLATION] App installed');
  
  // Step 4: Launch with newInstance to ensure clean start
  await device.launchApp({
    newInstance: true,
    launchArgs: { detoxPrintBusyIdleResources: 'YES' }, // Debug flag
  });
  console.log('[E2E_ISOLATION] App launched');
  
  // Step 5: Wait for boot to complete
  // Give generous time for boot sequence (bootstrap, fonts, splash)
  console.log('[E2E_ISOLATION] Waiting for boot sequence to complete...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Step 6: Wait for welcome screen anchor
  try {
    await waitFor(element(by.id('welcome-screen')))
      .toBeVisible()
      .withTimeout(15000);
    console.log('[E2E_ISOLATION] ✓ Welcome screen visible - reset complete');
  } catch (error) {
    console.log('[E2E_ISOLATION] Welcome screen testID not found, trying text fallback...');
    try {
      await waitFor(element(by.text('Your Social Calendar')))
        .toBeVisible()
        .withTimeout(5000);
      console.log('[E2E_ISOLATION] ✓ Welcome screen visible (text) - reset complete');
    } catch (fallbackError) {
      console.error('[E2E_ISOLATION] ✗ Could not find welcome screen!');
      console.error('[E2E_ISOLATION] This likely means:');
      console.error('[E2E_ISOLATION] 1. App crashed during boot');
      console.error('[E2E_ISOLATION] 2. User was already logged in (isolation failed)');
      console.error('[E2E_ISOLATION] 3. testID="welcome-screen" missing');
      throw fallbackError;
    }
  }
}

/**
 * Login helper for tests that need authenticated state.
 * Must be called AFTER resetAppToFreshState().
 */
export async function loginAsTestUser(email: string, password: string) {
  console.log('[E2E_ISOLATION] Starting login flow...');
  
  // Navigate to login
  try {
    await element(by.id('welcome-login-button')).tap();
  } catch {
    await element(by.text('Log In')).tap();
  }
  
  // Wait for login inputs
  await waitFor(element(by.id('login-email-input')))
    .toBeVisible()
    .withTimeout(5000);
  
  // Perform login
  await element(by.id('login-email-input')).clearText();
  await element(by.id('login-email-input')).typeText(email);
  
  await element(by.id('login-password-input')).clearText();
  await element(by.id('login-password-input')).typeText(password);
  await element(by.id('login-password-input')).tapReturnKey();
  
  await element(by.id('login-submit-button')).tap();
  
  // Wait for calendar screen
  await waitFor(element(by.id('calendar-screen')))
    .toBeVisible()
    .withTimeout(15000);
  
  console.log('[E2E_ISOLATION] Login complete - calendar screen visible');
}
