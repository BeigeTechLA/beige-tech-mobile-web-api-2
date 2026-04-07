const express = require('express');
const { satisfaction } = require('../../controllers');
const { auth } = require('../../middlewares/auth');
const { roles } = require('../../config/roles');

const router = express.Router();

/**
 * @route GET /api/v1/satisfaction/summary
 * @description Get client satisfaction summary statistics
 * @access Private/Admin, ProjectManager
 */
router.get(
  '/summary',
  // auth([roles.ADMIN, roles.PROJECT_MANAGER]),
  satisfaction.getClientSatisfactionSummary
);

/**
 * @route GET /api/v1/satisfaction/reviews
 * @description Get detailed review information with pagination
 * @access Private/Admin, ProjectManager
 */
router.get(
  '/reviews',
  // auth([roles.ADMIN, roles.PROJECT_MANAGER]),
  satisfaction.getDetailedReviews
);

/**
 * @route GET /api/v1/satisfaction/pending-reviews
 * @description Get completed orders without reviews
 * @access Private/Admin, ProjectManager
 */
router.get(
  '/pending-reviews',
  // auth([roles.ADMIN, roles.PROJECT_MANAGER]),
  satisfaction.getPendingReviews
);

module.exports = router;
