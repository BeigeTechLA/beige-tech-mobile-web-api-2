const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const { faqValidation } = require('../../validations');
const { faqController } = require('../../controllers');

const router = express.Router();

// Public routes (no authentication required)
router
  .route('/public')
  .get(validate(faqValidation.getPublicFAQs), faqController.getPublicFAQs);

// Get FAQs by CP ID (for public profile view)
router
  .route('/cp/:cpId')
  .get(validate(faqValidation.getPublicFAQs), faqController.getFAQsByCPId);

// Protected routes (authentication required)
router.use(auth());

// CP specific routes
router
  .route('/cp')
  .get(validate(faqValidation.getCPFAQs), faqController.getCPFAQs)
  .post(validate(faqValidation.createCPFAQ), faqController.createCPFAQ);

// Admin routes for managing CP FAQs
router
  .route('/admin/cp-faqs')
  .get(validate(faqValidation.getAdminFAQs), faqController.getAllCPFAQsForAdmin);

// Admin routes for managing admin FAQs
router
  .route('/admin')
  .get(validate(faqValidation.getAdminFAQs), faqController.getAdminFAQs)
  .post(validate(faqValidation.createAdminFAQ), faqController.createAdminFAQ);

// General FAQ routes (admin only for full access)
router
  .route('/')
  .get(validate(faqValidation.getFAQs), faqController.getFAQs)
  .post(validate(faqValidation.createFAQ), faqController.createFAQ);

// Individual FAQ routes
router
  .route('/:faqId')
  .get(validate(faqValidation.getFAQ), faqController.getFAQ)
  .patch(validate(faqValidation.updateFAQ), faqController.updateFAQ)
  .delete(validate(faqValidation.deleteFAQ), faqController.deleteFAQ);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: FAQ
 *   description: FAQ management and retrieval
 */

/**
 * @swagger
 * /faq/public:
 *   get:
 *     summary: Get public FAQs
 *     description: Retrieve all public and active FAQs. No authentication required.
 *     tags: [FAQ]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [cp, admin]
 *         description: Filter by FAQ type
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in question, answer, or category
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *         description: sort by query in the form of field:desc/asc (ex. name:asc)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *         default: 10
 *         description: Maximum number of FAQs
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         default: 1
 *         description: Page number
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/FAQ'
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limit:
 *                   type: integer
 *                   example: 10
 *                 totalPages:
 *                   type: integer
 *                   example: 1
 *                 totalResults:
 *                   type: integer
 *                   example: 1
 */

/**
 * @swagger
 * /faq/cp:
 *   get:
 *     summary: Get CP's own FAQs
 *     description: Only CPs can retrieve their own FAQs.
 *     tags: [FAQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *         description: Filter by status
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in question, answer, or category
 *     responses:
 *       "200":
 *         description: OK
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 *   post:
 *     summary: Create a CP FAQ
 *     description: Only CPs can create CP FAQs.
 *     tags: [FAQ]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - question
 *               - answer
 *             properties:
 *               question:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 500
 *               answer:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 2000
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 default: active
 *               isPublic:
 *                 type: boolean
 *                 default: true
 *               category:
 *                 type: string
 *                 maxLength: 100
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                   maxLength: 50
 *     responses:
 *       "201":
 *         description: Created
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "403":
 *         $ref: '#/components/responses/Forbidden'
 */
