const { test, expect } = require('@playwright/test');

test.describe('Dashboard Management E2E', () => {
  test.use({ storageState: 'tests/e2e/auth-state.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('should display comprehensive booking dashboard', async ({ page }) => {
    // Verify dashboard loads with user context
    await expect(page.locator('[data-testid="dashboard-header"]')).toContainText('E2E TestUser');
    await expect(page.locator('[data-testid="dashboard-stats"]')).toBeVisible();

    // Should show booking statistics
    await expect(page.locator('[data-testid="total-bookings"]')).toBeVisible();
    await expect(page.locator('[data-testid="upcoming-bookings"]')).toBeVisible();
    await expect(page.locator('[data-testid="completed-bookings"]')).toBeVisible();
    await expect(page.locator('[data-testid="total-spent"]')).toBeVisible();

    // Should show bookings list
    await expect(page.locator('[data-testid="bookings-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="bookings-filter"]')).toBeVisible();

    // Should show orders section
    await expect(page.locator('[data-testid="orders-section"]')).toBeVisible();
  });

  test('should filter bookings by status and date', async ({ page }) => {
    // Test status filters
    await page.click('[data-testid="filter-all"]');
    const allCount = await page.locator('[data-testid="booking-item"]').count();

    await page.click('[data-testid="filter-upcoming"]');
    const upcomingCount = await page.locator('[data-testid="booking-item"]').count();
    expect(upcomingCount).toBeLessThanOrEqual(allCount);

    await page.click('[data-testid="filter-completed"]');
    const completedCount = await page.locator('[data-testid="booking-item"]').count();

    await page.click('[data-testid="filter-cancelled"]');
    const cancelledCount = await page.locator('[data-testid="booking-item"]').count();

    // Total should equal all individual counts
    await page.click('[data-testid="filter-all"]');
    const totalCountCheck = await page.locator('[data-testid="booking-item"]').count();
    // Note: This might not equal sum if there are overlapping statuses

    // Test date range filter
    await page.click('[data-testid="date-filter-button"]');
    await expect(page.locator('[data-testid="date-range-picker"]')).toBeVisible();

    // Select last 30 days
    await page.click('[data-testid="date-range-30-days"]');
    await page.click('[data-testid="apply-date-filter"]');

    // Should update bookings list
    await expect(page.locator('[data-testid="active-filter-30-days"]')).toBeVisible();
  });

  test('should allow detailed booking management', async ({ page }) => {
    // Click on first booking
    await page.click('[data-testid="booking-item"]', { first: true });

    // Should open detailed view
    await expect(page.locator('[data-testid="booking-details-modal"]')).toBeVisible();

    // Verify all booking details are shown
    await expect(page.locator('[data-testid="booking-service-details"]')).toBeVisible();
    await expect(page.locator('[data-testid="booking-date-time"]')).toBeVisible();
    await expect(page.locator('[data-testid="booking-location"]')).toBeVisible();
    await expect(page.locator('[data-testid="booking-payment-status"]')).toBeVisible();
    await expect(page.locator('[data-testid="booking-confirmation-number"]')).toBeVisible();

    // Test edit functionality
    await page.click('[data-testid="edit-booking-button"]');
    await expect(page.locator('[data-testid="edit-booking-form"]')).toBeVisible();

    // Modify description
    await page.fill('[data-testid="edit-description"]', 'Updated booking description via dashboard');
    await page.click('[data-testid="save-booking-changes"]');

    // Should show success message
    await expect(page.locator('[data-testid="edit-success-message"]')).toBeVisible();

    // Verify changes are reflected
    await expect(page.locator('[data-testid="booking-description"]')).toContainText('Updated booking description');
  });

  test('should handle booking cancellation with refund options', async ({ page }) => {
    // Find a cancellable booking (upcoming, paid)
    await page.click('[data-testid="filter-upcoming"]');
    await page.click('[data-testid="booking-item"]', { first: true });

    await expect(page.locator('[data-testid="booking-details-modal"]')).toBeVisible();

    // Click cancel button
    await page.click('[data-testid="cancel-booking-button"]');

    // Should show cancellation form
    await expect(page.locator('[data-testid="cancellation-form"]')).toBeVisible();

    // Should show cancellation policy
    await expect(page.locator('[data-testid="cancellation-policy"]')).toBeVisible();

    // Should show refund amount calculation
    await expect(page.locator('[data-testid="refund-calculation"]')).toBeVisible();

    // Fill cancellation reason
    await page.selectOption('[data-testid="cancellation-reason"]', 'schedule_conflict');
    await page.fill('[data-testid="cancellation-notes"]', 'Test cancellation from E2E dashboard test');

    // Confirm cancellation
    await page.click('[data-testid="confirm-cancellation"]');

    // Should show cancellation confirmation
    await expect(page.locator('[data-testid="cancellation-success"]')).toBeVisible();
    await expect(page.locator('[data-testid="refund-processing-message"]')).toBeVisible();

    // Close modal and verify booking status updated
    await page.click('[data-testid="close-details-modal"]');

    // Booking should now appear in cancelled filter
    await page.click('[data-testid="filter-cancelled"]');
    await expect(page.locator('[data-testid="booking-item"]').first()).toContainText('Cancelled');
  });

  test('should display order tracking and progress', async ({ page }) => {
    // Navigate to orders section
    await page.click('[data-testid="orders-tab"]');
    await expect(page.locator('[data-testid="orders-section"]')).toBeVisible();

    // Should show orders list
    await expect(page.locator('[data-testid="orders-list"]')).toBeVisible();

    // Click on first order
    await page.click('[data-testid="order-item"]', { first: true });

    // Should open order details
    await expect(page.locator('[data-testid="order-details-modal"]')).toBeVisible();

    // Should show order progress timeline
    await expect(page.locator('[data-testid="order-timeline"]')).toBeVisible();
    await expect(page.locator('[data-testid="timeline-booking-created"]')).toBeVisible();
    await expect(page.locator('[data-testid="timeline-payment-received"]')).toBeVisible();

    // Should show current status
    await expect(page.locator('[data-testid="current-order-status"]')).toBeVisible();

    // Should show expected completion date
    await expect(page.locator('[data-testid="expected-completion"]')).toBeVisible();

    // Should show contact options
    await expect(page.locator('[data-testid="contact-team-button"]')).toBeVisible();

    // Test file downloads (if available)
    const downloadSection = page.locator('[data-testid="order-downloads"]');
    if (await downloadSection.isVisible()) {
      await expect(page.locator('[data-testid="download-files-button"]')).toBeVisible();
    }
  });

  test('should show payment history and invoices', async ({ page }) => {
    // Navigate to payments section
    await page.click('[data-testid="payments-tab"]');
    await expect(page.locator('[data-testid="payments-section"]')).toBeVisible();

    // Should show payment history
    await expect(page.locator('[data-testid="payments-list"]')).toBeVisible();

    // Each payment should show key details
    const paymentItems = page.locator('[data-testid="payment-item"]');
    const count = await paymentItems.count();

    if (count > 0) {
      await expect(paymentItems.first()).toContainText(/\$\d+/); // Amount
      await expect(paymentItems.first()).toContainText(/\d{4}/); // Year

      // Click on first payment
      await paymentItems.first().click();

      // Should show payment details
      await expect(page.locator('[data-testid="payment-details-modal"]')).toBeVisible();
      await expect(page.locator('[data-testid="payment-amount"]')).toBeVisible();
      await expect(page.locator('[data-testid="payment-method"]')).toBeVisible();
      await expect(page.locator('[data-testid="payment-date"]')).toBeVisible();

      // Should have invoice download option
      await expect(page.locator('[data-testid="download-invoice-button"]')).toBeVisible();

      // Should show refund information if applicable
      const refundSection = page.locator('[data-testid="refund-info"]');
      if (await refundSection.isVisible()) {
        await expect(page.locator('[data-testid="refund-amount"]')).toBeVisible();
        await expect(page.locator('[data-testid="refund-status"]')).toBeVisible();
      }
    }
  });

  test('should provide user account management', async ({ page }) => {
    // Navigate to account settings
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="account-settings"]');

    await expect(page.locator('[data-testid="account-settings-page"]')).toBeVisible();

    // Should show profile information
    await expect(page.locator('[data-testid="profile-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="profile-name"]')).toHaveValue('E2E TestUser');
    await expect(page.locator('[data-testid="profile-email"]')).toHaveValue('e2e.test@beige.app');

    // Test profile update
    await page.fill('[data-testid="profile-phone"]', '+1555111222');
    await page.fill('[data-testid="profile-address"]', '123 E2E Test Street, Test City, TC 12345');
    await page.click('[data-testid="save-profile-button"]');

    await expect(page.locator('[data-testid="profile-update-success"]')).toBeVisible();

    // Should show communication preferences
    await expect(page.locator('[data-testid="communication-prefs"]')).toBeVisible();
    await page.check('[data-testid="email-notifications"]');
    await page.check('[data-testid="sms-notifications"]');
    await page.uncheck('[data-testid="marketing-emails"]');

    await page.click('[data-testid="save-preferences-button"]');
    await expect(page.locator('[data-testid="preferences-update-success"]')).toBeVisible();

    // Should show saved payment methods
    await page.click('[data-testid="payment-methods-tab"]');
    await expect(page.locator('[data-testid="saved-payment-methods"]')).toBeVisible();

    // Should allow adding new payment method
    await page.click('[data-testid="add-payment-method-button"]');
    await expect(page.locator('[data-testid="add-payment-form"]')).toBeVisible();
  });

  test('should show analytics and insights for repeat customers', async ({ page }) => {
    // Navigate to insights section
    await page.click('[data-testid="insights-tab"]');
    await expect(page.locator('[data-testid="insights-section"]')).toBeVisible();

    // Should show booking statistics
    await expect(page.locator('[data-testid="booking-stats-chart"]')).toBeVisible();
    await expect(page.locator('[data-testid="spending-over-time"]')).toBeVisible();

    // Should show service preferences
    await expect(page.locator('[data-testid="favorite-services"]')).toBeVisible();
    await expect(page.locator('[data-testid="preferred-times"]')).toBeVisible();

    // Should show loyalty/rewards information
    const loyaltySection = page.locator('[data-testid="loyalty-rewards"]');
    if (await loyaltySection.isVisible()) {
      await expect(page.locator('[data-testid="loyalty-points"]')).toBeVisible();
      await expect(page.locator('[data-testid="rewards-available"]')).toBeVisible();
    }

    // Should show recommendations
    await expect(page.locator('[data-testid="service-recommendations"]')).toBeVisible();
  });

  test('should handle dashboard data loading states', async ({ page }) => {
    // Refresh page to see loading states
    await page.reload();

    // Should show loading indicators
    await expect(page.locator('[data-testid="dashboard-loading"]')).toBeVisible();

    // Wait for data to load
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="dashboard-loading"]')).not.toBeVisible();

    // Should show loaded content
    await expect(page.locator('[data-testid="bookings-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-stats"]')).toBeVisible();

    // Test error state by simulating network issues
    await page.route('**/api/v1/dashboard/**', route => route.abort());

    // Try to refresh dashboard data
    await page.click('[data-testid="refresh-dashboard"]');

    // Should show error state
    await expect(page.locator('[data-testid="dashboard-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="retry-load-button"]')).toBeVisible();

    // Restore network and retry
    await page.unroute('**/api/v1/dashboard/**');
    await page.click('[data-testid="retry-load-button"]');

    // Should load successfully
    await expect(page.locator('[data-testid="dashboard-error"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="bookings-section"]')).toBeVisible();
  });

  test('should work responsively on mobile devices', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();

    // Should show mobile-optimized dashboard
    await expect(page.locator('[data-testid="mobile-dashboard"]')).toBeVisible();

    // Should have collapsible sections
    await expect(page.locator('[data-testid="mobile-stats-toggle"]')).toBeVisible();
    await page.click('[data-testid="mobile-stats-toggle"]');
    await expect(page.locator('[data-testid="dashboard-stats"]')).toBeVisible();

    // Should have mobile navigation
    await expect(page.locator('[data-testid="mobile-dashboard-nav"]')).toBeVisible();

    // Test mobile booking management
    await page.click('[data-testid="mobile-bookings-tab"]');
    await expect(page.locator('[data-testid="mobile-bookings-list"]')).toBeVisible();

    // Bookings should be displayed in mobile-friendly cards
    await page.click('[data-testid="booking-item"]', { first: true });
    await expect(page.locator('[data-testid="mobile-booking-details"]')).toBeVisible();

    // Should have swipe actions
    await expect(page.locator('[data-testid="mobile-booking-actions"]')).toBeVisible();
  });
});