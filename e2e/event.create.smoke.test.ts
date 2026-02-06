/**
 * E2E Test: Create Event Smoke
 * 
 * P0 acceptance test for event creation flow.
 * Validates: navigate to create → fill title → submit → lands on event detail.
 * 
 * Prerequisites: User must be logged in (run auth.smoke.test.ts first or use beforeAll login)
 */

import { device, element, by, expect, waitFor } from 'detox';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL || 'test@openinvite.cloud';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'TestPassword123!';

describe('Create Event Smoke', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      delete: true,
    });
    
    // Login first
    try {
      await waitFor(element(by.id('login-email-input')))
        .toBeVisible()
        .withTimeout(5000);
    } catch {
      // Navigate to login if on welcome screen
      try {
        await element(by.text('Log In')).tap();
      } catch {
        try {
          await element(by.text('Sign In')).tap();
        } catch {
          // May already be logged in
        }
      }
    }
    
    // If login inputs visible, perform login
    try {
      const emailInput = element(by.id('login-email-input'));
      await emailInput.clearText();
      await emailInput.typeText(TEST_EMAIL);
      
      const passwordInput = element(by.id('login-password-input'));
      await passwordInput.clearText();
      await passwordInput.typeText(TEST_PASSWORD);
      await passwordInput.tapReturnKey();
      
      await element(by.id('login-submit-button')).tap();
      
      // Wait for calendar screen
      await waitFor(element(by.id('calendar-screen')))
        .toBeVisible()
        .withTimeout(15000);
    } catch {
      // Already logged in, verify on calendar
      await waitFor(element(by.id('calendar-screen')))
        .toBeVisible()
        .withTimeout(10000);
    }
  });

  it('should be on calendar screen (logged in state)', async () => {
    await expect(element(by.id('calendar-screen'))).toBeVisible();
  });

  it('should navigate to create event screen', async () => {
    // Tap the create event button (or navigate via tab)
    try {
      await element(by.id('create-event-button')).tap();
    } catch {
      // Fallback: tap the + button in bottom nav or text
      try {
        await element(by.text('Create')).tap();
      } catch {
        await element(by.text('Create Event')).tap();
      }
    }
    
    // Wait for create screen to load
    await waitFor(element(by.id('event-title-input')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should fill in event title', async () => {
    const timestamp = Date.now();
    const eventTitle = `E2E Test Event ${timestamp}`;
    
    await element(by.id('event-title-input')).clearText();
    await element(by.id('event-title-input')).typeText(eventTitle);
    
    // Dismiss keyboard
    await element(by.id('event-title-input')).tapReturnKey();
    
    // Verify title is entered
    await expect(element(by.id('event-title-input'))).toHaveText(eventTitle);
  });

  it('should submit and create the event', async () => {
    // Scroll down if needed to see the create button
    try {
      await element(by.id('create-event-submit-button')).tap();
    } catch {
      // Try scrolling to find the button
      await element(by.type('RCTScrollView')).scrollTo('bottom');
      await element(by.id('create-event-submit-button')).tap();
    }
    
    // Wait for event detail screen to appear
    await waitFor(element(by.id('event-detail-screen')))
      .toBeVisible()
      .withTimeout(10000);
  });

  it('should show event detail screen after creation', async () => {
    await expect(element(by.id('event-detail-screen'))).toBeVisible();
    
    // Verify RSVP buttons are visible (confirms we're on event detail)
    await expect(element(by.id('rsvp-going-button'))).toBeVisible();
  });
});
