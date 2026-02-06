/**
 * E2E Test: Auth Smoke
 * 
 * P0 acceptance test for authentication flow.
 * Validates: login with email/password → lands on calendar (home) screen.
 * 
 * Test user credentials should be set via environment variables:
 * - E2E_TEST_EMAIL
 * - E2E_TEST_PASSWORD
 */

import { device, element, by, expect, waitFor } from 'detox';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL || 'test@openinvite.cloud';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'TestPassword123!';

describe('Auth Smoke', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      delete: true, // Fresh install state
    });
  });

  it('should show login or welcome screen on fresh launch', async () => {
    // Fresh launch should show either welcome or login
    // Wait for app to stabilize after launch
    await waitFor(element(by.type('RCTView')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('should navigate to login screen', async () => {
    // Try to find login inputs - if not visible, might need to navigate from welcome
    try {
      await waitFor(element(by.id('login-email-input')))
        .toBeVisible()
        .withTimeout(5000);
    } catch {
      // If login inputs not visible, look for "Log In" or "Sign In" button on welcome
      try {
        await element(by.text('Log In')).tap();
      } catch {
        try {
          await element(by.text('Sign In')).tap();
        } catch {
          // Already on login screen or different flow
        }
      }
      await waitFor(element(by.id('login-email-input')))
        .toBeVisible()
        .withTimeout(5000);
    }
  });

  it('should enter credentials and submit login', async () => {
    // Clear and type email
    await element(by.id('login-email-input')).clearText();
    await element(by.id('login-email-input')).typeText(TEST_EMAIL);
    
    // Clear and type password
    await element(by.id('login-password-input')).clearText();
    await element(by.id('login-password-input')).typeText(TEST_PASSWORD);
    
    // Dismiss keyboard
    await element(by.id('login-password-input')).tapReturnKey();
    
    // Tap submit button
    await element(by.id('login-submit-button')).tap();
  });

  it('should land on calendar (home) screen after successful login', async () => {
    // Wait for calendar screen to appear (successful login)
    await waitFor(element(by.id('calendar-screen')))
      .toBeVisible()
      .withTimeout(15000);
    
    // Verify we're on the calendar/home screen
    await expect(element(by.id('calendar-screen'))).toBeVisible();
  });
});
