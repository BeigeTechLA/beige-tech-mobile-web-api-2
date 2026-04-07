const express = require("express");
const auth = require("../../middlewares/auth");
const portfolioController = require("../../controllers/portfolio.controller");
const upload = require('../../middlewares/upload');
const router = express.Router();

/**
 * Portfolio Routes
 * Base path: /v1/portfolios
 */

// Create a new portfolio with multiple media files
router
  .route("/create")
  .post(upload.multiple('mediaFiles', 10), portfolioController.createPortfolio);

// Get all portfolios with pagination and filtering
router
  .route("/all")
  .get(auth(), portfolioController.getAllPortfolios);

// Get all portfolios for a specific CP
router
  .route("/cp/:cpId")
  .get(portfolioController.getPortfoliosByCpId);

// View portfolio (public, increments view count)
router
  .route("/:id/view")
  .get(portfolioController.viewPortfolio);

// Increment portfolio views
router
  .route("/:id/increment-views")
  .post(portfolioController.incrementPortfolioViews);

// Get, update, and delete portfolio by ID
router
  .route("/:id")
  .get(portfolioController.getPortfolioById)
  .put(upload.multiple('mediaFiles', 10), portfolioController.updatePortfolio)
  .delete(auth(), portfolioController.deletePortfolio);

// Permanently delete portfolio
router
  .route("/:id/permanent")
  .delete(auth(), portfolioController.permanentlyDeletePortfolio);

module.exports = router;

