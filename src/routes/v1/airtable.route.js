const express = require('express');
const validate = require('../../middlewares/validate');
const airtableValidation = require('../../validations/airtable.validation');
const airtableController = require('../../controllers/airtable.controller');
const auth = require('../../middlewares/auth');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Airtable
 *   description: Airtable ops dashboard management
 */

/**
 * @swagger
 * /airtable/bookings:
 *   get:
 *     summary: Get bookings by status
 *     description: Retrieve bookings filtered by status for ops dashboard
 *     tags: [Airtable]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [paid, assigned, completed]
 *         description: Filter bookings by status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Maximum number of bookings to return
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "500":
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/bookings', auth('manageBookings'), validate(airtableValidation.getBookingsByStatus), airtableController.getBookingsByStatus);

/**
 * @swagger
 * /airtable/bookings/stats:
 *   get:
 *     summary: Get booking statistics
 *     description: Get comprehensive booking statistics for ops dashboard
 *     tags: [Airtable]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     stats:
 *                       type: object
 *                     totalRevenue:
 *                       type: string
 *                     recentBookings:
 *                       type: array
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "500":
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/bookings/stats', auth('manageBookings'), airtableController.getBookingStats);

/**
 * @swagger
 * /airtable/bookings/{airtableId}:
 *   get:
 *     summary: Get booking by ID
 *     description: Retrieve a specific booking by Airtable ID
 *     tags: [Airtable]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: airtableId
 *         required: true
 *         schema:
 *           type: string
 *         description: Airtable record ID
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *       "500":
 *         $ref: '#/components/responses/InternalError'
 */
router.get('/bookings/:airtableId', auth('manageBookings'), validate(airtableValidation.getBookingById), airtableController.getBookingById);

/**
 * @swagger
 * /airtable/bookings/{airtableId}/status:
 *   patch:
 *     summary: Update booking status
 *     description: Update booking status and related fields
 *     tags: [Airtable]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: airtableId
 *         required: true
 *         schema:
 *           type: string
 *         description: Airtable record ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [paid, assigned, completed]
 *               assignedPhotographer:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       "400":
 *         $ref: '#/components/responses/BadRequest'
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *       "500":
 *         $ref: '#/components/responses/InternalError'
 */
router.patch('/bookings/:airtableId/status', auth('manageBookings'), validate(airtableValidation.updateBookingStatus), airtableController.updateBookingStatus);

/**
 * @swagger
 * /airtable/bookings/{airtableId}/assign:
 *   patch:
 *     summary: Assign photographer to booking
 *     description: Assign a photographer to a booking and mark it as assigned
 *     tags: [Airtable]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: airtableId
 *         required: true
 *         schema:
 *           type: string
 *         description: Airtable record ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - photographerId
 *               - photographerName
 *             properties:
 *               photographerId:
 *                 type: string
 *               photographerName:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       "400":
 *         $ref: '#/components/responses/BadRequest'
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *       "500":
 *         $ref: '#/components/responses/InternalError'
 */
router.patch('/bookings/:airtableId/assign', auth('manageBookings'), validate(airtableValidation.assignPhotographer), airtableController.assignPhotographer);

/**
 * @swagger
 * /airtable/bookings/{airtableId}/complete:
 *   patch:
 *     summary: Mark booking as completed
 *     description: Mark a booking as completed with optional completion details
 *     tags: [Airtable]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: airtableId
 *         required: true
 *         schema:
 *           type: string
 *         description: Airtable record ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               completionNotes:
 *                 type: string
 *               deliveryDate:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *       "500":
 *         $ref: '#/components/responses/InternalError'
 */
router.patch('/bookings/:airtableId/complete', auth('manageBookings'), validate(airtableValidation.completeBooking), airtableController.completeBooking);

module.exports = router;