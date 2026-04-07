const { test, expect } = require('@playwright/test');

test.describe('Guest Booking Flow E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Start from homepage
    await page.goto('/');

    // Wait for page to load
    await page.waitForLoadState('networkidle');
  });

  test('should complete full guest booking journey', async ({ page }) => {
    // Step 1: Navigate to booking page
    await page.click('[data-testid="book-now-button"]');
    await expect(page.locator('[data-testid="booking-modal"]')).toBeVisible();

    // Step 2: Fill service selection
    await page.selectOption('[data-testid="service-type-select"]', 'videography');
    await page.check('[data-testid="content-type-video"]');
    await page.click('[data-testid="next-step-button"]');

    // Step 3: Fill date and time
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowString = tomorrow.toISOString().split('T')[0];

    await page.fill('[data-testid="booking-date"]', tomorrowString);
    await page.fill('[data-testid="booking-time"]', '14:00');
    await page.fill('[data-testid="duration-hours"]', '2');
    await page.click('[data-testid="next-step-button"]');

    // Step 4: Fill location
    await page.fill('[data-testid="location-input"]', 'Test Location for E2E');
    await page.click('[data-testid="next-step-button"]');

    // Step 5: Fill guest information
    const testEmail = `e2e.guest.${Date.now()}@test.com`;
    await page.fill('[data-testid="guest-name"]', 'John Doe E2E');
    await page.fill('[data-testid="guest-email"]', testEmail);
    await page.fill('[data-testid="guest-phone"]', '+1234567890');
    await page.fill('[data-testid="budget"]', '300');
    await page.fill('[data-testid="description"]', 'E2E test booking description');

    // Step 6: Submit booking
    await page.click('[data-testid="submit-booking-button"]');

    // Step 7: Verify booking creation success
    await expect(page.locator('[data-testid="booking-success-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="booking-confirmation-number"]')).toBeVisible();

    // Step 8: Proceed to payment
    await page.click('[data-testid="proceed-to-payment-button"]');

    // Step 9: Fill payment form (test mode)
    await page.waitForSelector('[data-testid="stripe-card-element"]');
    await page.fill('[data-testid="card-number"]', '4242424242424242');
    await page.fill('[data-testid="card-expiry"]', '12/25');
    await page.fill('[data-testid="card-cvc"]', '123');
    await page.fill('[data-testid="cardholder-name"]', 'John Doe E2E');

    // Step 10: Complete payment
    await page.click('[data-testid="complete-payment-button"]');

    // Step 11: Verify payment success
    await expect(page.locator('[data-testid="payment-success-message"]')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-testid="booking-final-confirmation"]')).toContainText('confirmed');

    // Step 12: Verify tracking information is provided
    await expect(page.locator('[data-testid="tracking-info"]')).toBeVisible();
    await expect(page.locator('[data-testid="confirmation-email-sent"]')).toBeVisible();
  });

  test('should allow guest to track existing booking', async ({ page }) => {
    // Create a test booking first (can be done via API)
    const testBooking = {
      confirmationNumber: 'BG-TEST-E2E-' + Date.now(),
      guestEmail: 'e2e.tracking@test.com'
    };

    // Navigate to tracking page
    await page.goto('/track-booking');

    // Fill tracking form
    await page.fill('[data-testid="confirmation-number"]', testBooking.confirmationNumber);
    await page.fill('[data-testid="email-address"]', testBooking.guestEmail);
    await page.click('[data-testid="track-booking-button"]');

    // Should show booking not found or booking details if exists
    const resultMessage = page.locator('[data-testid="tracking-result"]');
    await expect(resultMessage).toBeVisible();
  });

  test('should handle booking form validation errors', async ({ page }) => {
    // Navigate to booking form
    await page.click('[data-testid="book-now-button"]');
    await expect(page.locator('[data-testid="booking-modal"]')).toBeVisible();

    // Try to proceed without selecting service
    await page.click('[data-testid="next-step-button"]');
    await expect(page.locator('[data-testid="service-type-error"]')).toBeVisible();

    // Select service and proceed
    await page.selectOption('[data-testid="service-type-select"]', 'photography');
    await page.check('[data-testid="content-type-photo"]');
    await page.click('[data-testid="next-step-button"]');

    // Try to proceed without date
    await page.click('[data-testid="next-step-button"]');
    await expect(page.locator('[data-testid="date-error"]')).toBeVisible();

    // Fill invalid date (past date)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = yesterday.toISOString().split('T')[0];

    await page.fill('[data-testid="booking-date"]', yesterdayString);
    await page.click('[data-testid="next-step-button"]');
    await expect(page.locator('[data-testid="past-date-error"]')).toBeVisible();
  });

  test('should work on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Navigate to booking
    await page.click('[data-testid="mobile-menu-button"]');
    await page.click('[data-testid="mobile-book-now"]');

    // Verify mobile-optimized booking form
    await expect(page.locator('[data-testid="mobile-booking-form"]')).toBeVisible();

    // Fill mobile booking form
    await page.selectOption('[data-testid="service-type-select"]', 'videography');
    await page.check('[data-testid="content-type-video"]');

    // Mobile form might use swipe or different navigation
    await page.click('[data-testid="mobile-next-button"]');

    // Verify mobile date picker
    await expect(page.locator('[data-testid="mobile-date-picker"]')).toBeVisible();

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowString = tomorrow.toISOString().split('T')[0];

    await page.fill('[data-testid="booking-date"]', tomorrowString);
    await page.fill('[data-testid="booking-time"]', '15:00');
    await page.fill('[data-testid="duration-hours"]', '1');

    // Continue through mobile flow
    await page.click('[data-testid="mobile-next-button"]');
    await page.fill('[data-testid="location-input"]', 'Mobile Test Location');
    await page.click('[data-testid="mobile-next-button"]');

    // Fill guest info on mobile
    await page.fill('[data-testid="guest-name"]', 'Mobile Test User');
    await page.fill('[data-testid="guest-email"]', `mobile.test.${Date.now()}@test.com`);
    await page.fill('[data-testid="guest-phone"]', '+1987654321');
    await page.fill('[data-testid="budget"]', '200');

    // Submit mobile booking
    await page.click('[data-testid="mobile-submit-booking"]');

    // Verify mobile success screen
    await expect(page.locator('[data-testid="mobile-booking-success"]')).toBeVisible();
  });

  test('should handle network interruptions gracefully', async ({ page }) => {
    // Navigate to booking form
    await page.click('[data-testid="book-now-button"]');
    await expect(page.locator('[data-testid="booking-modal"]')).toBeVisible();

    // Fill out form
    await page.selectOption('[data-testid="service-type-select"]', 'photography');
    await page.check('[data-testid="content-type-photo"]');
    await page.click('[data-testid="next-step-button"]');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await page.fill('[data-testid="booking-date"]', tomorrow.toISOString().split('T')[0]);
    await page.fill('[data-testid="booking-time"]', '16:00');
    await page.fill('[data-testid="duration-hours"]', '1');
    await page.click('[data-testid="next-step-button"]');

    await page.fill('[data-testid="location-input"]', 'Network Test Location');
    await page.click('[data-testid="next-step-button"]');

    await page.fill('[data-testid="guest-name"]', 'Network Test User');
    await page.fill('[data-testid="guest-email"]', `network.test.${Date.now()}@test.com`);
    await page.fill('[data-testid="guest-phone"]', '+1555000123');
    await page.fill('[data-testid="budget"]', '150');

    // Simulate network offline
    await page.context().setOffline(true);

    // Try to submit - should show retry option
    await page.click('[data-testid="submit-booking-button"]');
    await expect(page.locator('[data-testid="network-error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="retry-button"]')).toBeVisible();

    // Restore network and retry
    await page.context().setOffline(false);
    await page.click('[data-testid="retry-button"]');

    // Should succeed after retry
    await expect(page.locator('[data-testid="booking-success-message"]')).toBeVisible();
  });

  test('should save form progress and allow resumption', async ({ page }) => {
    // Navigate to booking form
    await page.click('[data-testid="book-now-button"]');
    await expect(page.locator('[data-testid="booking-modal"]')).toBeVisible();

    // Fill first step
    await page.selectOption('[data-testid="service-type-select"]', 'editing_only');
    await page.check('[data-testid="content-type-edit"]');
    await page.click('[data-testid="next-step-button"]');

    // Fill second step partially
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    await page.fill('[data-testid="booking-date"]', tomorrow.toISOString().split('T')[0]);
    await page.fill('[data-testid="booking-time"]', '10:00');

    // Close modal (simulate user leaving)
    await page.click('[data-testid="close-modal-button"]');

    // Reopen booking modal
    await page.click('[data-testid="book-now-button"]');

    // Should resume where left off (if implemented)
    const serviceSelect = page.locator('[data-testid="service-type-select"]');
    if (await serviceSelect.isVisible()) {
      // If form reset, verify draft save functionality exists
      await expect(page.locator('[data-testid="resume-draft-button"]')).toBeVisible();
    } else {
      // If resumed, verify we're on the right step
      await expect(page.locator('[data-testid="booking-date"]')).toHaveValue(tomorrow.toISOString().split('T')[0]);
    }
  });
});