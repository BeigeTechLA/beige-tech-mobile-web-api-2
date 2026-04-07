const httpStatus = require('http-status');
const { airtableService } = require('../services');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

/**
 * Get all bookings by status for ops dashboard
 */
const getBookingsByStatus = catchAsync(async (req, res) => {
  const { status = 'paid', limit = 100 } = req.query;
  
  const bookings = await airtableService.getBookingsByStatus(status, parseInt(limit));
  
  res.status(httpStatus.OK).json({
    success: true,
    message: `Retrieved ${bookings.length} bookings with status: ${status}`,
    data: bookings,
  });
});

/**
 * Get a specific booking by Airtable ID
 */
const getBookingById = catchAsync(async (req, res) => {
  const { airtableId } = req.params;
  
  const booking = await airtableService.getBookingRecord(airtableId);
  
  res.status(httpStatus.OK).json({
    success: true,
    message: 'Booking retrieved successfully',
    data: {
      airtableId: booking.id,
      ...booking.fields,
    },
  });
});

/**
 * Update booking status (for ops team workflow)
 */
const updateBookingStatus = catchAsync(async (req, res) => {
  const { airtableId } = req.params;
  const { status, assignedPhotographer, notes } = req.body;
  
  // Validate status
  const validStatuses = ['paid', 'assigned', 'completed'];
  if (status && !validStatuses.includes(status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }
  
  const updates = {};
  if (status) updates['Status'] = status;
  if (assignedPhotographer) updates['Assigned Photographer'] = assignedPhotographer;
  if (notes) updates['Notes'] = notes;
  
  const updatedRecord = await airtableService.updateBookingStatus(airtableId, status, updates);
  
  res.status(httpStatus.OK).json({
    success: true,
    message: 'Booking updated successfully',
    data: {
      airtableId: updatedRecord.id,
      ...updatedRecord.fields,
    },
  });
});

/**
 * Assign photographer to booking
 */
const assignPhotographer = catchAsync(async (req, res) => {
  const { airtableId } = req.params;
  const { photographerId, photographerName, notes } = req.body;
  
  if (!photographerId || !photographerName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Photographer ID and name are required');
  }
  
  const updates = {
    'Status': 'assigned',
    'Assigned Photographer': photographerName,
    'Photographer ID': photographerId,
    'Assignment Date': new Date().toISOString(),
  };
  
  if (notes) {
    updates['Notes'] = notes;
  }
  
  const updatedRecord = await airtableService.updateBookingStatus(airtableId, 'assigned', updates);
  
  res.status(httpStatus.OK).json({
    success: true,
    message: 'Photographer assigned successfully',
    data: {
      airtableId: updatedRecord.id,
      ...updatedRecord.fields,
    },
  });
});

/**
 * Mark booking as completed
 */
const completeBooking = catchAsync(async (req, res) => {
  const { airtableId } = req.params;
  const { completionNotes, deliveryDate } = req.body;
  
  const updates = {
    'Status': 'completed',
    'Completion Date': new Date().toISOString(),
  };
  
  if (completionNotes) {
    updates['Internal Notes'] = completionNotes;
  }
  
  if (deliveryDate) {
    updates['Delivery Date'] = deliveryDate;
  }
  
  const updatedRecord = await airtableService.updateBookingStatus(airtableId, 'completed', updates);
  
  res.status(httpStatus.OK).json({
    success: true,
    message: 'Booking marked as completed',
    data: {
      airtableId: updatedRecord.id,
      ...updatedRecord.fields,
    },
  });
});

/**
 * Get booking statistics for ops dashboard
 */
const getBookingStats = catchAsync(async (req, res) => {
  try {
    // Get bookings for each status
    const [paidBookings, assignedBookings, completedBookings] = await Promise.all([
      airtableService.getBookingsByStatus('paid', 1000),
      airtableService.getBookingsByStatus('assigned', 1000),
      airtableService.getBookingsByStatus('completed', 1000),
    ]);
    
    // Calculate basic stats
    const stats = {
      paid: paidBookings.length,
      assigned: assignedBookings.length,
      completed: completedBookings.length,
      total: paidBookings.length + assignedBookings.length + completedBookings.length,
    };
    
    // Calculate revenue from paid bookings
    const totalRevenue = paidBookings.reduce((sum, booking) => {
      const amount = parseFloat(booking['Payment Amount']) || 0;
      return sum + amount;
    }, 0);
    
    res.status(httpStatus.OK).json({
      success: true,
      message: 'Booking statistics retrieved successfully',
      data: {
        stats,
        totalRevenue: totalRevenue.toFixed(2),
        recentBookings: paidBookings.slice(0, 10), // Last 10 paid bookings
      },
    });
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve booking statistics');
  }
});

module.exports = {
  getBookingsByStatus,
  getBookingById,
  updateBookingStatus,
  assignPhotographer,
  completeBooking,
  getBookingStats,
};