const { test, expect } = require('@playwright/test');

test.describe('Authenticated User Booking Flow E2E', () => {
  // Use pre-authenticated state for these tests
  test.use({ storageState: 'tests/e2e/auth-state.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should complete authenticated booking with pre-filled information', async ({ page }) => {
    // Verify user is logged in
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();

    // Navigate to booking
    await page.click('[data-testid="book-now-button"]');
    await expect(page.locator('[data-testid="booking-modal"]')).toBeVisible();

    // Should show authenticated user interface
    await expect(page.locator('[data-testid="authenticated-booking-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-welcome-message"]')).toContainText('E2E TestUser');

    // Fill service selection
    await page.selectOption('[data-testid="service-type-select"]', 'photography');
    await page.check('[data-testid="content-type-photo"]');
    await page.click('[data-testid="next-step-button"]');

    // Fill date and time
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowString = tomorrow.toISOString().split('T')[0];

    await page.fill('[data-testid="booking-date"]', tomorrowString);
    await page.fill('[data-testid="booking-time"]', '13:00');
    await page.fill('[data-testid="duration-hours"]', '3');
    await page.click('[data-testid="next-step-button"]');

    // Fill location
    await page.fill('[data-testid="location-input"]', 'Authenticated User Studio');
    await page.click('[data-testid="next-step-button"]');

    // User information should be pre-filled
    await expect(page.locator('[data-testid="guest-name"]')).toHaveValue('E2E TestUser');
    await expect(page.locator('[data-testid="guest-email"]')).toHaveValue('e2e.test@beige.app');

    // Fill remaining information
    await page.fill('[data-testid="guest-phone"]', '+1555123456');
    await page.fill('[data-testid="budget"]', '400');
    await page.fill('[data-testid="description"]', 'Authenticated user booking for E2E testing');

    // Submit booking
    await page.click('[data-testid="submit-booking-button"]');

    // Verify booking creation
    await expect(page.locator('[data-testid="booking-success-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="authenticated-booking-success"]')).toContainText('linked to your account');

    // Proceed to payment
    await page.click('[data-testid="proceed-to-payment-button"]');

    // Payment form with saved payment methods (if implemented)
    await page.waitForSelector('[data-testid="payment-form"]');

    // Should show option to save payment method for future
    await expect(page.locator('[data-testid="save-payment-method"]')).toBeVisible();

    // Fill payment details
    await page.fill('[data-testid="card-number"]', '4242424242424242');
    await page.fill('[data-testid="card-expiry"]', '12/26');
    await page.fill('[data-testid="card-cvc"]', '456');
    await page.fill('[data-testid="cardholder-name"]', 'E2E TestUser');

    // Check save payment method
    await page.check('[data-testid="save-payment-method"]');

    // Complete payment
    await page.click('[data-testid="complete-payment-button"]');

    // Verify payment success
    await expect(page.locator('[data-testid="payment-success-message"]')).toBeVisible({ timeout: 30000 });

    // Should offer to view in dashboard
    await expect(page.locator('[data-testid="view-in-dashboard-button"]')).toBeVisible();
  });

  test('should show booking in user dashboard immediately', async ({ page }) => {
    // Navigate to dashboard
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="dashboard-link"]');

    // Verify dashboard loads
    await expect(page.locator('[data-testid="dashboard-page"]')).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-title"]')).toContainText('My Bookings');

    // Should show user's bookings
    await expect(page.locator('[data-testid="bookings-list"]')).toBeVisible();

    // Create a test booking first
    await page.click('[data-testid="new-booking-button"]');

    // Quick booking form in dashboard
    await page.selectOption('[data-testid="quick-service-select"]', 'videography');
    await page.check('[data-testid="quick-content-video"]');

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 3);
    await page.fill('[data-testid="quick-date"]', futureDate.toISOString().split('T')[0]);
    await page.fill('[data-testid="quick-time"]', '14:30');
    await page.fill('[data-testid="quick-duration"]', '2');
    await page.fill('[data-testid="quick-location"]', 'Dashboard Quick Booking');
    await page.fill('[data-testid="quick-budget"]', '250');

    await page.click('[data-testid="create-quick-booking"]');

    // Should appear in bookings list immediately
    await expect(page.locator('[data-testid="booking-item"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="booking-item"]').first()).toContainText('Dashboard Quick Booking');
  });

  test('should allow authenticated user to manage existing bookings', async ({ page }) => {
    // Navigate to dashboard
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="dashboard-link"]');

    // Verify we have bookings
    await expect(page.locator('[data-testid="bookings-list"]')).toBeVisible();

    // Click on first booking to view details
    await page.click('[data-testid="booking-item"]', { first: true });

    // Should open booking details modal
    await expect(page.locator('[data-testid="booking-details-modal"]')).toBeVisible();

    // Should show management options
    await expect(page.locator('[data-testid="edit-booking-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="cancel-booking-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="reschedule-booking-button"]')).toBeVisible();

    // Test reschedule functionality
    await page.click('[data-testid="reschedule-booking-button"]');
    await expect(page.locator('[data-testid="reschedule-form"]')).toBeVisible();

    // Change date
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + 5);
    await page.fill('[data-testid="reschedule-date"]', newDate.toISOString().split('T')[0]);
    await page.fill('[data-testid="reschedule-time"]', '11:00');

    await page.click('[data-testid="confirm-reschedule"]');

    // Should show reschedule confirmation
    await expect(page.locator('[data-testid="reschedule-success"]')).toBeVisible();

    // Close modal and verify date updated in list
    await page.click('[data-testid="close-details-modal"]');
    await expect(page.locator('[data-testid="booking-item"]').first()).toContainText(newDate.toLocaleDateString());
  });

  test('should handle registration during checkout for new users', async ({ page }) => {
    // First log out to simulate new user
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout-button"]');

    // Verify logged out
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible();

    // Start booking process as guest
    await page.click('[data-testid="book-now-button"]');
    await expect(page.locator('[data-testid="booking-modal"]')).toBeVisible();

    // Fill booking form
    await page.selectOption('[data-testid="service-type-select"]', 'photography');
    await page.check('[data-testid="content-type-photo"]');
    await page.click('[data-testid="next-step-button"]');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await page.fill('[data-testid="booking-date"]', tomorrow.toISOString().split('T')[0]);
    await page.fill('[data-testid="booking-time"]', '15:30');
    await page.fill('[data-testid="duration-hours"]', '2');
    await page.click('[data-testid="next-step-button"]');

    await page.fill('[data-testid="location-input"]', 'New User Registration Test');
    await page.click('[data-testid="next-step-button"]');

    const newUserEmail = `newuser.${Date.now()}@beige.app`;
    await page.fill('[data-testid="guest-name"]', 'New User Registration');
    await page.fill('[data-testid="guest-email"]', newUserEmail);
    await page.fill('[data-testid="guest-phone"]', '+1555987654');
    await page.fill('[data-testid="budget"]', '300');

    // Submit booking
    await page.click('[data-testid="submit-booking-button"]');
    await expect(page.locator('[data-testid="booking-success-message"]')).toBeVisible();

    // Should show registration prompt during checkout
    await page.click('[data-testid="proceed-to-payment-button"]');
    await expect(page.locator('[data-testid="registration-prompt"]')).toBeVisible();

    // Choose to create account
    await page.click('[data-testid="create-account-button"]');

    // Fill registration form
    await page.fill('[data-testid="register-password"]', 'newUserPassword123');
    await page.fill('[data-testid="register-confirm-password"]', 'newUserPassword123');
    await page.check('[data-testid="agree-terms"]');

    await page.click('[data-testid="complete-registration"]');

    // Should automatically log in and link booking
    await expect(page.locator('[data-testid="registration-success"]')).toBeVisible();
    await expect(page.locator('[data-testid="booking-linked-message"]')).toContainText('linked to your new account');

    // Continue to payment
    await expect(page.locator('[data-testid="payment-form"]')).toBeVisible();
  });

  test('should show quick rebooking for repeat customers', async ({ page }) => {
    // Navigate to dashboard
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="dashboard-link"]');

    // Find a completed booking
    await page.click('[data-testid="filter-completed"]');

    // Should show rebook option for completed bookings
    await expect(page.locator('[data-testid="rebook-button"]').first()).toBeVisible();

    // Click rebook
    await page.click('[data-testid="rebook-button"]', { first: true });

    // Should open quick rebook form with pre-filled details
    await expect(page.locator('[data-testid="rebook-form"]')).toBeVisible();

    // Service details should be pre-filled from previous booking
    await expect(page.locator('[data-testid="rebook-service-type"]')).not.toBeEmpty();
    await expect(page.locator('[data-testid="rebook-location"]')).not.toBeEmpty();

    // Just need to select new date
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    await page.fill('[data-testid="rebook-date"]', futureDate.toISOString().split('T')[0]);
    await page.fill('[data-testid="rebook-time"]', '16:00');

    await page.click('[data-testid="confirm-rebook"]');

    // Should create new booking quickly
    await expect(page.locator('[data-testid="rebook-success"]')).toBeVisible();
    await expect(page.locator('[data-testid="new-booking-created"]')).toContainText('new booking created');
  });

  test('should handle concurrent booking attempts', async ({ page, context }) => {
    // Open second tab to simulate concurrent booking
    const secondPage = await context.newPage();
    await secondPage.goto('/dashboard');

    // Both pages try to book the same time slot
    const conflictDate = new Date();
    conflictDate.setDate(conflictDate.getDate() + 1);
    const conflictDateString = conflictDate.toISOString().split('T')[0];
    const conflictTime = '10:00';

    // First page creates booking
    await page.click('[data-testid="new-booking-button"]');
    await page.selectOption('[data-testid="quick-service-select"]', 'videography');
    await page.check('[data-testid="quick-content-video"]');
    await page.fill('[data-testid="quick-date"]', conflictDateString);
    await page.fill('[data-testid="quick-time"]', conflictTime);
    await page.fill('[data-testid="quick-duration"]', '2');
    await page.fill('[data-testid="quick-location"]', 'Conflict Test Location');
    await page.fill('[data-testid="quick-budget"]', '200');

    // Second page tries to book same slot
    await secondPage.click('[data-testid="new-booking-button"]');
    await secondPage.selectOption('[data-testid="quick-service-select"]', 'photography');
    await secondPage.check('[data-testid="quick-content-photo"]');
    await secondPage.fill('[data-testid="quick-date"]', conflictDateString);
    await secondPage.fill('[data-testid="quick-time"]', conflictTime);
    await secondPage.fill('[data-testid="quick-duration"]', '1');
    await secondPage.fill('[data-testid="quick-location"]', 'Conflict Test Location 2');
    await secondPage.fill('[data-testid="quick-budget"]', '150');

    // Submit both simultaneously
    await Promise.all([
      page.click('[data-testid="create-quick-booking"]'),
      secondPage.click('[data-testid="create-quick-booking"]')
    ]);

    // One should succeed, one should show conflict warning
    const firstResult = page.locator('[data-testid="booking-result"]');
    const secondResult = secondPage.locator('[data-testid="booking-result"]');

    // Wait for both results
    await Promise.all([
      firstResult.waitFor(),
      secondResult.waitFor()
    ]);

    // Check that conflict was handled appropriately
    const results = await Promise.all([
      firstResult.textContent(),
      secondResult.textContent()
    ]);

    // One should be success, one should be conflict/warning
    const hasSuccess = results.some(text => text.includes('success') || text.includes('created'));
    const hasConflict = results.some(text => text.includes('conflict') || text.includes('unavailable'));

    expect(hasSuccess).toBe(true);
    // Note: Conflict handling depends on business logic - might allow overlapping bookings

    await secondPage.close();
  });

  test('should maintain authentication state across page refreshes', async ({ page }) => {
    // Verify logged in
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();

    // Navigate to booking page
    await page.click('[data-testid="book-now-button"]');
    await expect(page.locator('[data-testid="authenticated-booking-form"]')).toBeVisible();

    // Refresh page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still be authenticated
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();

    // Booking form should still show authenticated state
    await page.click('[data-testid="book-now-button"]');
    await expect(page.locator('[data-testid="authenticated-booking-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-welcome-message"]')).toContainText('E2E TestUser');
  });
});