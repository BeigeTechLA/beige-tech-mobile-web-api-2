// src/services/lead.service.js
const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Lead, User, Order } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Check if email is already taken
 * @param {string} email - The lead's email
 * @param {ObjectId} [excludeLeadId] - The id of the lead to be excluded
 * @returns {Promise<boolean>}
 */
const isEmailTaken = async (email, excludeLeadId) => {
  const lead = await Lead.findOne({ 
    email, 
    _id: { $ne: excludeLeadId },
    is_deleted: false 
  });
  return !!lead;
};

/**
 * Create a lead
 * @param {Object} leadData - Lead data
 * @returns {Promise<Lead>}
 */
const createLead = async (leadData) => {
  try {
    // Transform the value field if it's a number
    const leadDataToSave = { ...leadData };
    
    // If value is a number, convert it to the proper format
    if (leadDataToSave.value && typeof leadDataToSave.value === 'number') {
      leadDataToSave.value = {
        amount: {
          type: Number,
          default: 0,
          min: 0,
          value: leadDataToSave.value
        },
        currency: 'USD' // Default currency
      };
    }
    
    // Set default status if not provided
    if (!leadDataToSave.status) {
      leadDataToSave.status = 'new';
    }
    
    // Set default source if not provided
    if (!leadDataToSave.source) {
      leadDataToSave.source = 'website';
    }
    
    // Handle name and email fields
    if (leadDataToSave.name) {
      if (!leadDataToSave.contact) leadDataToSave.contact = {};
      leadDataToSave.contact.name = leadDataToSave.name;
      delete leadDataToSave.name;
    }
    
    if (leadDataToSave.email) {
      if (!leadDataToSave.contact) leadDataToSave.contact = {};
      leadDataToSave.contact.email = leadDataToSave.email;
      delete leadDataToSave.email;
    }
    
    if (leadDataToSave.phone) {
      if (!leadDataToSave.contact) leadDataToSave.contact = {};
      leadDataToSave.contact.phone = leadDataToSave.phone;
      delete leadDataToSave.phone;
    }
    
    if (leadDataToSave.company && typeof leadDataToSave.company === 'string') {
      leadDataToSave.company = {
        name: leadDataToSave.company
      };
    }
    
    // Create the lead
    const lead = await Lead.create(leadDataToSave);
    
    // Populate the customer if customer_id is provided
    if (lead.customer_id) {
      await lead.populate('customer_id', 'name email phone');
    }
    
    // Return lead with name and email at the top level for API consistency
    const leadObj = lead.toObject();
    if (leadObj.contact) {
      if (leadObj.contact.name) leadObj.name = leadObj.contact.name;
      if (leadObj.contact.email) leadObj.email = leadObj.contact.email;
      if (leadObj.contact.phone) leadObj.phone = leadObj.contact.phone;
    }
    
    return leadObj;
  } catch (error) {
    console.error('Error creating lead:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error creating lead');
  }
};

/**
 * Query for leads with pagination
 * @param {Object} query - Query parameters
 * @param {string} [query.status] - Filter by status
 * @param {string} [query.source] - Filter by source
 * @param {string} [query.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [query.limit] - Maximum number of results per page (default = 10)
 * @param {number} [query.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryLeads = async (query) => {
  try {
    const { status, source, sortBy, limit: limitStr, page: pageStr } = query;
    const page = pageStr ? parseInt(pageStr, 10) : 1;
    const limit = limitStr ? parseInt(limitStr, 10) : 10;
    
    if (isNaN(page) || isNaN(limit)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid pagination parameters');
    }
    
    const skip = (page - 1) * limit;
    
    // Build filter object - always filter out deleted leads
    const filter = { is_deleted: false };
    
    // Add status filter if provided and not empty
    if (status) {
      filter.status = status;
    }
    
    // Add source filter if provided and not empty
    if (source) {
      filter.source = source;
    }
    
    // Build sort object
    const sortObj = {};
    if (sortBy) {
      const [field, order] = sortBy.split(':');
      sortObj[field] = order === 'desc' ? -1 : 1;
    } else {
      sortObj.createdAt = -1; // Default sort by creation date, newest first
    }
    
    // Execute query with pagination
    const [results, totalResults] = await Promise.all([
      Lead.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .populate('customer_id', 'name email phone profile_picture')
        .populate('assigned_employees', 'name email profile_picture')
        .populate('owner', 'name email profile_picture')
        .lean(),
      Lead.countDocuments(filter)
    ]);
    
    // Transform results to include name and email at top level for API consistency
    const transformedResults = results.map(lead => {
      const transformedLead = { ...lead };
      if (lead.contact) {
        if (lead.contact.name) transformedLead.name = lead.contact.name;
        if (lead.contact.email) transformedLead.email = lead.contact.email;
        if (lead.contact.phone) transformedLead.phone = lead.contact.phone;
      }
      return transformedLead;
    });
    
    const totalPages = Math.ceil(totalResults / limit) || 1;
    
    return {
      results: transformedResults,
      page,
      limit,
      totalPages,
      totalResults,
    };
  } catch (error) {
    console.error('Error in queryLeads:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error retrieving leads');
  }
};

/**
 * Get lead by id
 * @param {ObjectId} id
 * @returns {Promise<Lead>}
 */
const getLeadById = async (id) => {
  const lead = await Lead.findById(id).populate('customer_id', 'name email phone profile_picture');
  if (!lead || lead.is_deleted) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Lead not found');
  }
  return lead;
};

/**
 * Update lead by id
 * @param {ObjectId} leadId
 * @param {Object} updateBody
 * @returns {Promise<Lead>}
 */
const updateLeadById = async (leadId, updateBody) => {
  try {
    const lead = await getLeadById(leadId);
    if (!lead) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Lead not found');
    }
    
    // Create a copy of the update body to modify
    const updateData = { ...updateBody };
    
    // Handle name, email, and phone fields
    if (updateData.name) {
      if (!updateData.contact) updateData.contact = {};
      updateData.contact.name = updateData.name;
      delete updateData.name;
    }
    
    if (updateData.email) {
      if (!updateData.contact) updateData.contact = {};
      updateData.contact.email = updateData.email;
      delete updateData.email;
    }
    
    if (updateData.phone) {
      if (!updateData.contact) updateData.contact = {};
      updateData.contact.phone = updateData.phone;
      delete updateData.phone;
    }
    
    // Handle company if it's a string
    if (updateData.company && typeof updateData.company === 'string') {
      updateData.company = {
        name: updateData.company
      };
    }
    
    // Handle value if it's a number
    if (updateData.value && typeof updateData.value === 'number') {
      updateData.value = {
        amount: {
          type: Number,
          default: 0,
          min: 0,
          value: updateData.value
        },
        currency: lead.value?.currency || 'USD'
      };
    }
    
    // Update the lead
    Object.assign(lead, updateData);
    await lead.save();
    
    // Return lead with name and email at the top level for API consistency
    const updatedLead = lead.toObject();
    if (updatedLead.contact) {
      if (updatedLead.contact.name) updatedLead.name = updatedLead.contact.name;
      if (updatedLead.contact.email) updatedLead.email = updatedLead.contact.email;
      if (updatedLead.contact.phone) updatedLead.phone = updatedLead.contact.phone;
    }
    
    return updatedLead;
  } catch (error) {
    console.error('Error in updateLeadById:', {
      error: error.message,
      stack: error.stack,
      leadId,
      updateBody: JSON.stringify(updateBody, null, 2),
    });
    
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR, 
      `Error updating lead: ${error.message}`
    );
  }
};

/**
 * Delete lead by id (soft delete)
 * @param {ObjectId} leadId
 * @returns {Promise<Lead>}
 */
const deleteLeadById = async (leadId) => {
  const lead = await getLeadById(leadId);
  if (!lead) return false;

  lead.is_deleted = true;
  await lead.save();
  
  return lead;
};

const updateLeadStatus = async (leadId, status) => {
  const lead = await getLeadById(leadId);
  if (!lead) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Lead not found');
  }
  lead.status = status;
  await lead.save();
  return lead;
};

/**
 * Assign employees to a lead
 * @param {ObjectId} leadId
 * @param {Array<ObjectId>} employeeIds
 * @returns {Promise<Lead>}
 */
const assignEmployees = async (leadId, employeeIds) => {
  const lead = await getLeadById(leadId);
  lead.assigned_employees = employeeIds;
  await lead.save();
  return lead;
};

/**
 * Remove employees from a lead
 * @param {ObjectId} leadId
 * @param {Array<ObjectId>} employeeIds
 * @returns {Promise<Lead>}
 */
const removeEmployees = async (leadId, employeeIds) => {
  const lead = await getLeadById(leadId);
  lead.assigned_employees = lead.assigned_employees.filter(
    id => !employeeIds.includes(id.toString())
  );
  await lead.save();
  return lead;
};

/**
 * Add tags to a lead
 * @param {ObjectId} leadId
 * @param {Array<string>} tags
 * @returns {Promise<Lead>}
 */
const addTags = async (leadId, tags) => {
  const lead = await getLeadById(leadId);
  const newTags = tags.filter(tag => !lead.tags.includes(tag));
  lead.tags = [...lead.tags, ...newTags];
  await lead.save();
  return lead;
};

/**
 * Remove tags from a lead
 * @param {ObjectId} leadId
 * @param {Array<string>} tags
 * @returns {Promise<Lead>}
 */
const removeTags = async (leadId, tags) => {
  const lead = await getLeadById(leadId);
  lead.tags = lead.tags.filter(tag => !tags.includes(tag));
  await lead.save();
  return lead;
};

/**
 * Get lead statistics
 * @returns {Promise<Object>}
 */
const getLeadStats = async () => {
  const stats = await Lead.aggregate([
    { $match: { is_deleted: false } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  
  return stats.reduce((acc, { _id, count }) => {
    acc[_id] = count;
    return acc;
  }, {});
};

/**
 * Create a lead from an order or update existing lead with new order interaction
 * @param {ObjectId} orderId
 * @param {Object} leadData
 * @returns {Promise<Lead>}
 */
const createLeadFromOrder = async (orderId, leadData = {}) => {
  try {
    // Find the order and populate the client_id field to get user details
    const order = await Order.findById(orderId).populate('client_id', 'name email phone location company');
    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
    }
    
    // Extract client information from the populated order
    const client = order.client_id;
    
    // Check if a lead already exists for this client (by email or customer_id)
    let existingLead = null;
    
    // First check by customer_id if available
    if (client && client._id) {
      existingLead = await Lead.findOne({ 
        customer_id: client._id,
      });
    }
    
    // If not found by customer_id, try by email if available
    if (!existingLead && client && client.email) {
      existingLead = await Lead.findOne({ 
        'contact.email': client.email,
      });
    }
    
    // Prepare the log entry for this order interaction
    const logEntry = {
      order_id: orderId,
      tracking_point: leadData.tracking_point || 'order_created',
      value_amount: leadData.value?.amount || order.shoot_cost || 0,
      currency: leadData.value?.currency || 'USD',
      timestamp: new Date(),
      notes: leadData.description || `Interaction with order: ${order.order_name || order.id}`
    };
    
    // If lead exists, update it with the new order interaction
    if (existingLead) {
      // Add the new order to the leadLog
      existingLead.leadLog = existingLead.leadLog || [];
      existingLead.leadLog.push(logEntry);
      
      // Update last_contacted
      existingLead.last_contacted = new Date();
      
      // Update any other relevant fields if provided
      if (leadData.status) existingLead.status = leadData.status;
      if (leadData.tags && Array.isArray(leadData.tags)) {
        existingLead.tags = [...new Set([...(existingLead.tags || []), ...leadData.tags])];
      }
      
      // Save the updated lead
      await existingLead.save();
      return existingLead;
    }
    
    // If no existing lead, create a new one
    // Prepare lead data with client information
    const enrichedLeadData = {
      // Use client information if available
      name: client?.name || leadData.name || 'Unknown Client',
      email: client?.email || leadData.email,
      phone: client?.phone || leadData.phone,
      company: client?.company || leadData.company,
      // Include any additional data passed in leadData
      ...leadData,
      // Always set these fields
      order_id: orderId,
      customer_id: client?._id || order.client_id,
      status: leadData.status || 'new',
      source: leadData.source || 'website',
      // Initialize leadLog with this order
      leadLog: [logEntry]
    };
    
    // Create the lead with the enriched data
    return createLead(enrichedLeadData);
  } catch (error) {
    console.error('Error in createLeadFromOrder:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to create or update lead from order: ${error.message}`
    );
  }
};

/**
 * Get lead by order ID
 * @param {ObjectId} orderId
 * @returns {Promise<Lead>}
 */
const getLeadByOrderId = async (orderId) => {
  return Lead.findOne({ order_id: orderId });
};

/**
 * Create a lead if one doesn't already exist for the order
 * @param {ObjectId} orderId - The order ID
 * @param {string} name - The customer name (required)
 * @param {Object} additionalData - Optional additional lead data
 * @returns {Promise<Lead|null>} - Returns the created lead or null if lead already exists
 */
const createLeadIfNotExists = async (orderId, name, additionalData = {}) => {
  try {
    // Check if a lead already exists for this order
    const existingLead = await getLeadByOrderId(orderId);
    
    // If a lead exists, return null (skip creation)
    if (existingLead) {
      return null;
    }
    
    // Get the order to retrieve the customer_id
    const order = await Order.findById(orderId);
    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
    }
    
    // Prepare lead data with required name and order details
    const leadData = {
      name, // Required parameter
      order_id: orderId,
      customer_id: order.client_id,
      status: 'new',
      source: 'website',
      ...additionalData // Any additional optional data
    };
    
    // Create and return the lead
    return await createLead(leadData);
  } catch (error) {
    console.error('Error in createLeadIfNotExists:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to create lead: ${error.message}`
    );
  }
};

/**
 * Create or update a lead from an order
 * @param {ObjectId} orderId - The ID of the order to process
 * @param {Object} options - Optional parameters
 * @param {string} options.tracking_point - The tracking point to set (default: "order_created")
 * @returns {Promise<Lead>} - The created or updated lead
 */
const createOrUpdateLeadFromOrder = async (orderId, options = {}) => {
  try {
    // Validate tracking point
    const validTrackingPoints = ["order_created", "Payment_page", "pament_failed", "order_completed", "order_cancelled", "other"];
    const tracking_point = options.tracking_point && validTrackingPoints.includes(options.tracking_point) 
      ? options.tracking_point 
      : "order_created";

    // Find the order and populate the client_id field to get user details
    const order = await Order.findById(orderId).populate('client_id', 'name email phone location company');
    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
    }
    
    // Extract client information from the populated order
    const client = order.client_id;
    
    // Check if a lead already exists for this order
    let existingLead = await Lead.findOne({ order_id: orderId });
    
    // Prepare the log entry for this order interaction
    const logEntry = {
      order_id: orderId,
      tracking_point: tracking_point,
      value_amount: order.shoot_cost || 0,
      currency: 'USD',
      timestamp: new Date(),
      notes: `Order interaction: ${tracking_point} for order ${order.order_name || order.id}`
    };
    
    // Determine lead status based on tracking_point
    let leadStatus;
    if (tracking_point === "order_completed") {
      leadStatus = "closed_won";
    } else if (tracking_point === "order_cancelled") {
      leadStatus = "closed_lost";
    } else if (tracking_point === "pament_failed") {
      leadStatus = "negotiation"; // Set to negotiation when payment fails
    }else if (tracking_point === "Payment_page") {
      leadStatus = "contacted"; // Set to negotiation when payment fails
    }else if (tracking_point === "other") {
      leadStatus = "new"; // Set to negotiation when payment fails
    }
    
    // If lead exists, update it with the new order interaction
    if (existingLead) {
      // Add the new order interaction to the leadLog
      existingLead.leadLog = existingLead.leadLog || [];
      existingLead.leadLog.push(logEntry);
      
      // Update last_contacted
      existingLead.last_contacted = new Date();
      
      // Update status if needed based on tracking_point
      if (leadStatus) {
        existingLead.status = leadStatus;
      }
      
      // Save the updated lead
      await existingLead.save();
      return existingLead;
    }
    
    // If no existing lead, create a new one
    // Prepare lead data with client information
    const enrichedLeadData = {
      // Use client information if available
      name: client?.name || 'Unknown Client',
      email: client?.email,
      phone: client?.phone,
      company: client?.company,
      
      // Set required fields
      order_id: orderId,
      customer_id: client?._id || order.client_id,
      status: leadStatus || 'new', // Use determined status or default to 'new'
      source: 'website',
      
      // Initialize leadLog with this order interaction
      leadLog: [logEntry]
    };
    
    // Create the lead with the enriched data
    return createLead(enrichedLeadData);
  } catch (error) {
    console.error('Error in createOrUpdateLeadFromOrder:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to create or update lead from order: ${error.message}`
    );
  }
};

/**
 * Update lead basic information (assigned employees, company information, and tags)
 * @param {ObjectId} leadId - The ID of the lead to update
 * @param {Object} updateData - The data to update
 * @param {Array<ObjectId>} [updateData.assigned_employees] - Array of employee IDs to assign
 * @param {Object} [updateData.company] - Company information
 * @param {string} [updateData.company.name] - Company name
 * @param {string} [updateData.company.website] - Company website
 * @param {string} [updateData.company.size] - Company size
 * @param {string} [updateData.company.industry] - Company industry
 * @param {Array<string>} [updateData.tags] - Array of tags
 * @returns {Promise<Lead>} - The updated lead
 */
const updateLeadBasicInfo = async (leadId, updateData) => {
  try {
    // Get the lead by ID
    const lead = await getLeadById(leadId);
    
    // Update assigned employees if provided
    if (updateData.assigned_employees) {
      lead.assigned_employees = updateData.assigned_employees;
    }
    
    // Update company information if provided
    if (updateData.company) {
      // Initialize company object if it doesn't exist
      if (!lead.company) {
        lead.company = {};
      }
      
      // Update each company field if provided
      if (updateData.company.name !== undefined) {
        lead.company.name = updateData.company.name;
      }
      
      if (updateData.company.website !== undefined) {
        lead.company.website = updateData.company.website;
      }
      
      if (updateData.company.size !== undefined) {
        // Validate company size against enum values
        const validSizes = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001+", null];
        if (updateData.company.size === null || validSizes.includes(updateData.company.size)) {
          lead.company.size = updateData.company.size;
        } else {
          throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid company size');
        }
      }
      
      if (updateData.company.industry !== undefined) {
        lead.company.industry = updateData.company.industry;
      }
    }
    
    // Update tags if provided
    if (updateData.tags) {
      lead.tags = updateData.tags;
    }
    
    // Save the updated lead
    await lead.save();
    
    return lead;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Failed to update lead basic info: ${error.message}`);
  }
};

module.exports = {
  createLead,
  queryLeads,
  getLeadById,
  updateLeadById,
  deleteLeadById,
  assignEmployees,
  removeEmployees,
  addTags,
  removeTags,
  getLeadStats,
  createLeadFromOrder,
  getLead: getLeadByOrderId,
  isEmailTaken,
  updateLeadStatus,
  createLeadIfNotExists,
  createOrUpdateLeadFromOrder,
  updateLeadBasicInfo
};