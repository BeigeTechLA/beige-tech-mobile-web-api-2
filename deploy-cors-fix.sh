#!/bin/bash

# Quick Deployment Script for CORS Fix
# This script commits and prepares the changes for deployment

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "🚀 CORS Fix - Deployment Script"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check if we're in the right directory
if [ ! -f "src/app.js" ]; then
    echo "❌ Error: Not in the api directory"
    echo "Please run this script from: /Users/luminous_imteaj/Documents/Beige/api"
    exit 1
fi

# Show the files that will be committed
echo "📋 Files to be committed:"
echo "  ✓ src/app.js (CORS bypass for webhook)"
echo "  ✓ src/routes/v1/stripe-webhook.route.js (Webhook-specific CORS)"
echo "  ✓ src/controllers/stripe.controller.js (Enhanced logging)"
echo "  ✓ CORS-FIX-SUMMARY.md (Documentation)"
echo "  ✓ WEBHOOK-CORS-FIX.md (Technical guide)"
echo "  ✓ DEPLOYMENT-GUIDE-CORS-FIX.md (Deployment steps)"
echo "  ✓ CORS-FLOW-DIAGRAM.md (Visual flow)"
echo "  ✓ quick-cors-test.sh (Test script)"
echo "  ✓ test-live-server-cors.sh (Verification script)"
echo ""

# Git status
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Current Git Status:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
git status --short
echo ""

# Ask for confirmation
read -p "Do you want to commit these changes? (y/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled"
    exit 1
fi

# Stage the files
echo ""
echo "📦 Staging files..."
git add src/app.js
git add src/routes/v1/stripe-webhook.route.js
git add src/controllers/stripe.controller.js
git add CORS-FIX-SUMMARY.md
git add WEBHOOK-CORS-FIX.md
git add DEPLOYMENT-GUIDE-CORS-FIX.md
git add CORS-FLOW-DIAGRAM.md
git add quick-cors-test.sh
git add test-live-server-cors.sh
git add deploy-cors-fix.sh 2>/dev/null || true

echo "✅ Files staged"
echo ""

# Commit
echo "💾 Committing changes..."
git commit -m "fix: resolve CORS issues for Stripe webhook endpoint

- Bypass global CORS for webhook route (server-to-server calls)
- Add webhook-specific CORS handling for browser testing
- Enhance logging and validation in webhook controller
- Properly handle OPTIONS preflight requests

Fixes: CORS errors on live server for webhook endpoint
- Browser-based testing now works (with Origin header)
- Real Stripe webhooks work (without Origin header)
- OPTIONS preflight handled correctly

Files modified:
- src/app.js: Conditional CORS application
- src/routes/v1/stripe-webhook.route.js: Webhook CORS middleware
- src/controllers/stripe.controller.js: Enhanced logging

Documentation:
- CORS-FIX-SUMMARY.md: Executive summary
- WEBHOOK-CORS-FIX.md: Complete technical guide
- DEPLOYMENT-GUIDE-CORS-FIX.md: Deployment instructions
- CORS-FLOW-DIAGRAM.md: Visual flow diagrams
- test-live-server-cors.sh: Verification script"

echo "✅ Changes committed"
echo ""

# Show commit
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Commit Details:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
git log -1 --stat
echo ""

# Push option
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Next Steps:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Option 1: Push to repository now"
echo "  Command: git push origin main"
echo ""
echo "Option 2: Review changes first"
echo "  Command: git diff HEAD~1"
echo ""

read -p "Do you want to push to repository now? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "📤 Pushing to repository..."
    git push origin main
    echo "✅ Changes pushed to repository"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🎯 Deployment Instructions:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "1. SSH to your server:"
    echo "   ssh user@api-staging.beige.app"
    echo ""
    echo "2. Navigate to api directory:"
    echo "   cd /path/to/api"
    echo ""
    echo "3. Pull latest changes:"
    echo "   git pull origin main"
    echo ""
    echo "4. Restart the server:"
    echo "   # If using PM2:"
    echo "   pm2 restart api"
    echo ""
    echo "   # If using Docker:"
    echo "   docker-compose restart"
    echo ""
    echo "   # If using systemd:"
    echo "   sudo systemctl restart api"
    echo ""
    echo "5. Verify the fix:"
    echo "   ./test-live-server-cors.sh"
    echo ""
    echo "   Expected: All tests should pass ✅"
    echo ""
else
    echo ""
    echo "📋 Changes committed but not pushed"
    echo ""
    echo "To push later, run:"
    echo "  git push origin main"
    echo ""
fi

echo "═══════════════════════════════════════════════════════════════"
echo "✅ Deployment preparation complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📚 Documentation:"
echo "  - CORS-FIX-SUMMARY.md: Start here for overview"
echo "  - DEPLOYMENT-GUIDE-CORS-FIX.md: Detailed deployment steps"
echo "  - test-live-server-cors.sh: Verify live server after deployment"
echo ""
