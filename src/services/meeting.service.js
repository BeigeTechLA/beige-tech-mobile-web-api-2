const httpStatus = require("http-status");
const mongoose = require("mongoose");
const { Meeting, Order, User } = require("../models");
const ApiError = require("../utils/ApiError");
const { aggregationPaginate } = require("../models/plugins");
const { sendNotification } = require("./fcm.service");
const { createNotificationData, insertNotification } = require('../services/notification.service');


/**
 * Auto-update meeting statuses based on current time
 */
const autoUpdateMeetingStatuses = async (meetings) => {
  const now = new Date();
  const updates = [];

  for (const meeting of meetings) {
    let newStatus = null;
    const startTime = new Date(meeting.meeting_date_time);
    const endTime = meeting.meeting_end_time ? new Date(meeting.meeting_end_time) : null;
    const currentStatus = meeting.meeting_status?.toLowerCase();

    // Skip if meeting is already completed, cancelled, or rescheduled
    if (['completed', 'cancelled', 'rescheduled'].includes(currentStatus)) {
      continue;
    }

    // If current time has passed end time and status is in_progress -> mark as completed
    if (endTime && now >= endTime && currentStatus === 'in_progress') {
      newStatus = 'completed';
    }
    // If current time has passed start time and status is pending or confirmed -> mark as in_progress
    else if (now >= startTime && ['pending', 'confirmed'].includes(currentStatus)) {
      newStatus = 'in_progress';
    }

    // Update the meeting status if needed
    if (newStatus) {
      updates.push(
        Meeting.findByIdAndUpdate(
          meeting.id,
          { meeting_status: newStatus },
          { new: false }
        )
      );
      meeting.meeting_status = newStatus; // Update in-memory object
    }
  }

  // Execute all updates in parallel
  if (updates.length > 0) {
    await Promise.all(updates);
    console.log(`🔄 Auto-updated ${updates.length} meeting status(es)`);
  }

  return meetings;
};

const getMeetings = async (options, search, status) => {
  console.log('🔥 USING NEW MEETING CODE WITH DURATION CALCULATION');
  let matchStage = {};
  let useTimeline = false;
  let timelineMonth, timelineYear;

  // Check if timeline parameter exists and has a value
  if (options.timeline) {
    // Parse the timeline value (expected format: MM/YYYY)
    const timelineParts = options.timeline.split('/');
    if (timelineParts.length === 2) {
      timelineMonth = parseInt(timelineParts[0], 10);
      timelineYear = parseInt(timelineParts[1], 10);
      
      // Validate month and year
      if (!isNaN(timelineMonth) && !isNaN(timelineYear) && 
          timelineMonth >= 1 && timelineMonth <= 12 && 
          timelineYear >= 2000 && timelineYear <= 2100) {
        useTimeline = true;
      }
    }
  }

  // Build match conditions
  const matchConditions = [];

  if (search) {
    matchConditions.push({
      $or: [
        { "meeting_title": { $regex: search, $options: "i" } },
        { "order.name": { $regex: search, $options: "i" } },
        { "client.name": { $regex: search, $options: "i" } },
        { "cps.name": { $regex: search, $options: "i" } },
        { "admin.name": { $regex: search, $options: "i" } },
        { "participants.name": { $regex: search, $options: "i" } },
      ],
    });
  }

  if (status && status !== 'all') {
    matchConditions.push({
      "meeting_status": status.toLowerCase()
    });
  }

  // Combine conditions with $and if multiple conditions exist
  if (matchConditions.length > 0) {
    matchStage = matchConditions.length === 1
      ? matchConditions[0]
      : { $and: matchConditions };
  }

  const aggregate = [
    {
      $match: {},
    },
    {
      $addFields: {
        id: "$_id",
      },
    },
    {
      $lookup: {
        from: "orders",
        localField: "_id",
        foreignField: "meeting_date_times",
        as: "order",
      },
    },
    {
      $unwind: "$order",
    },
    {
      $lookup: {
        from: "users",
        localField: "order.cp_ids.id",
        foreignField: "_id",
        as: "cp",
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "order.client_id",
        foreignField: "_id",
        as: "client",
      },
    },
    // Lookup for meeting-specific client
    {
      $lookup: {
        from: "users",
        localField: "client_id",
        foreignField: "_id",
        as: "meeting_client",
      },
    },
    // Lookup for meeting-specific CPs
    {
      $lookup: {
        from: "users",
        localField: "cp_ids",
        foreignField: "_id",
        as: "meeting_cps",
      },
    },
    // Lookup for admin
    {
      $lookup: {
        from: "users",
        localField: "admin_id",
        foreignField: "_id",
        as: "admin",
      },
    },
    // Lookup for additional participants
    {
      $lookup: {
        from: "users",
        localField: "participants",
        foreignField: "_id",
        as: "additional_participants",
      },
    },
    // Lookup for meeting creator
    {
      $lookup: {
        from: "users",
        localField: "created_by_id",
        foreignField: "_id",
        as: "created_by_user",
      },
    },
    {
      $unwind: "$cp",
    },
    {
      $group: {
        _id: "$_id",
        id: { $first: "$id" },
        meeting_status: { $first: "$meeting_status" },
        meetLink: { $first: "$meetLink" },
        meeting_date_time: { $first: "$meeting_date_time" },
        meeting_end_time: { $first: "$meeting_end_time" },
        meeting_type: { $first: "$meeting_type" },
        change_request: { $first: "$change_request" },
        date_time_updates: { $first: "$date_time_updates" },
        meeting_title: { $first: "$meeting_title" },
        description: { $first: "$description" },
        order: { $first: "$order" },
        client: { $first: "$client" },
        meeting_client: { $first: "$meeting_client" },
        meeting_cps: { $first: "$meeting_cps" },
        admin: { $first: "$admin" },
        additional_participants: { $first: "$additional_participants" },
        created_by_user: { $first: "$created_by_user" },
        cps: {
          $push: {
            id: "$cp._id",
            name: "$cp.name",
            profile_picture: "$cp.profile_picture",
            role: "$cp.role",
          },
        },
        createdAt: { $first: "$createdAt" },
        participant_responses: { $first: "$participant_responses" },
      },
    },
    {
      $project: {
        _id: 0,
        id: 1,
        meeting_status: 1,
        meeting_date_time: 1,
        meeting_end_time: 1,
        meeting_type: 1,
        change_request: 1,
        meetLink: 1,
        date_time_updates: 1,
        meeting_title: 1,
        description: 1,
        participant_responses: 1,
        // Calculate duration in minutes
        duration: {
          $cond: {
            if: { $ne: ["$meeting_end_time", null] },
            then: {
              $round: {
                $divide: [
                  { $subtract: ["$meeting_end_time", "$meeting_date_time"] },
                  60000 // Convert milliseconds to minutes
                ]
              }
            },
            else: 30 // Default to 30 minutes if end time not set
          }
        },
        order: {
          id: "$order._id",
          name: "$order.order_name",
        },
        // Use meeting-specific participants if available, otherwise fallback to order participants
        cps: {
          $cond: {
            if: { $gt: [{ $size: "$meeting_cps" }, 0] },
            then: {
              $map: {
                input: "$meeting_cps",
                as: "cp",
                in: {
                  id: "$$cp._id",
                  name: "$$cp.name",
                  profile_picture: "$$cp.profile_picture",
                  role: "$$cp.role",
                }
              }
            },
            else: "$cps"
          }
        },
        client: {
          $cond: {
            if: { $gt: [{ $size: "$meeting_client" }, 0] },
            then: { $arrayElemAt: ["$meeting_client", 0] },
            else: { $arrayElemAt: ["$client", 0] }
          }
        },
        admin: { $arrayElemAt: ["$admin", 0] },
        created_by: {
          $let: {
            vars: { creator: { $arrayElemAt: ["$created_by_user", 0] } },
            in: {
              $cond: {
                if: { $ne: ["$$creator", null] },
                then: {
                  id: "$$creator._id",
                  name: "$$creator.name",
                  role: "$$creator.role",
                  profile_picture: "$$creator.profile_picture",
                },
                else: null
              }
            }
          }
        },
        participants: {
          $map: {
            input: "$additional_participants",
            as: "participant",
            in: {
              id: "$$participant._id",
              name: "$$participant.name",
              profile_picture: "$$participant.profile_picture",
              email: "$$participant.email",
            }
          }
        },
        createdAt: 1,
      },
    },
    {
      $project: {
        _id: 0,
        id: 1,
        meeting_status: 1,
        meeting_date_time: 1,
        meeting_end_time: 1,
        duration: 1,
        meeting_type: 1,
        change_request: 1,
        date_time_updates: 1,
        meetLink: 1,
        meeting_title: 1,
        description: 1,
        order: 1,
        cps: 1,
        client: {
          id: "$client._id",
          name: "$client.name",
          role: "$client.role",
          profile_picture: "$client.profile_picture",
          email: "$client.email",
        },
        admin: {
          $cond: {
            if: { $ne: ["$admin", null] },
            then: {
              id: "$admin._id",
              name: "$admin.name",
              profile_picture: "$admin.profile_picture",
              email: "$admin.email",
            },
            else: null
          }
        },
        created_by: 1,
        participants: 1,
        participant_responses: 1,
        createdAt: 1,
      },
    },
    {
      $match: matchStage, // Apply the search filter
    },
    {
      $sort: {
        createdAt: -1,
      },
    },
  ];

  // If timeline filter is active, execute the aggregation without pagination
  if (useTimeline) {
    // Add a match stage to filter by the specified month and year
    aggregate.push({
      $match: {
        $expr: {
          $and: [
            { $eq: [{ $month: "$meeting_date_time" }, timelineMonth] },
            { $eq: [{ $year: "$meeting_date_time" }, timelineYear] }
          ]
        }
      }
    });

    // Execute the aggregation without pagination
    const results = await Meeting.aggregate(aggregate);
    console.log('📊 Sample meeting result:', results[0]);

    // Auto-update meeting statuses based on current time
    await autoUpdateMeetingStatuses(results);

    // Return in a format similar to the paginated response
    return {
      results,
      page: 1,
      limit: results.length,
      totalPages: 1,
      totalResults: results.length,
    };
  } else {
    // Use pagination for normal queries
    const result = await Meeting.aggregatePaginate(aggregate, options);
    console.log('📊 Sample meeting result:', result.results?.[0]);

    // Auto-update meeting statuses based on current time
    if (result.results && result.results.length > 0) {
      await autoUpdateMeetingStatuses(result.results);
    }

    return result;
  }
};

const getMeetingById = async (meetingId) => {
  try {
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid meeting ID provided");
    }

    const result = await Meeting.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(meetingId),
        },
      },
      {
        $addFields: {
          id: "$_id",
        },
      },
      {
        $lookup: {
          from: "orders",
          localField: "_id",
          foreignField: "meeting_date_times",
          as: "order",
        },
      },
      {
        $unwind: "$order",
      },
      {
        $lookup: {
          from: "users",
          localField: "order.cp_ids.id",
          foreignField: "_id",
          as: "cp",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "order.client_id",
          foreignField: "_id",
          as: "client",
        },
      },
      // Lookup for meeting-specific client
      {
        $lookup: {
          from: "users",
          localField: "client_id",
          foreignField: "_id",
          as: "meeting_client",
        },
      },
      // Lookup for meeting-specific CPs
      {
        $lookup: {
          from: "users",
          localField: "cp_ids",
          foreignField: "_id",
          as: "meeting_cps",
        },
      },
      // Lookup for admin
      {
        $lookup: {
          from: "users",
          localField: "admin_id",
          foreignField: "_id",
          as: "admin",
        },
      },
      // Lookup for additional participants
      {
        $lookup: {
          from: "users",
          localField: "participants",
          foreignField: "_id",
          as: "additional_participants",
        },
      },
      // Lookup for meeting creator
      {
        $lookup: {
          from: "users",
          localField: "created_by_id",
          foreignField: "_id",
          as: "created_by_user",
        },
      },
      {
        $unwind: "$cp", // Unwind the cp array
      },
      {
        $group: {
          _id: "$_id",
          id: { $first: "$id" },
          meeting_status: { $first: "$meeting_status" },
          meetLink: { $first: "$meetLink" },
          meeting_date_time: { $first: "$meeting_date_time" },
          meeting_end_time: { $first: "$meeting_end_time" },
          meeting_type: { $first: "$meeting_type" },
          change_request: { $first: "$change_request" },
          date_time_updates: { $first: "$date_time_updates" },
          meeting_title: { $first: "$meeting_title" },
          description: { $first: "$description" },
          order: { $first: "$order" },
          client: { $first: "$client" },
          meeting_client: { $first: "$meeting_client" },
          meeting_cps: { $first: "$meeting_cps" },
          admin: { $first: "$admin" },
          additional_participants: { $first: "$additional_participants" },
          created_by_user: { $first: "$created_by_user" },
          cps: {
            $push: {
              id: "$cp._id",
              name: "$cp.name",
              profile_picture: "$cp.profile_picture",
            },
          },
          createdAt: { $first: "$createdAt" },
          participant_responses: { $first: "$participant_responses" },
        },
      },
      {
        $project: {
          _id: 0,
          id: 1,
          meeting_status: 1,
          meeting_date_time: 1,
          meeting_end_time: 1,
          meeting_type: 1,
          change_request: 1,
          meetLink: 1,
          date_time_updates: 1,
          meeting_title: 1,
          description: 1,
          participant_responses: 1,
          // Calculate duration in minutes
          duration: {
            $cond: {
              if: { $ne: ["$meeting_end_time", null] },
              then: {
                $round: {
                  $divide: [
                    { $subtract: ["$meeting_end_time", "$meeting_date_time"] },
                    60000 // Convert milliseconds to minutes
                  ]
                }
              },
              else: 30 // Default to 30 minutes if end time not set
            }
          },
          order: {
            id: "$order._id",
            name: "$order.order_name",
            order_status: "$order.order_status",
          },
          // Use meeting-specific participants if available, otherwise fallback to order participants
          cps: {
            $cond: {
              if: { $gt: [{ $size: "$meeting_cps" }, 0] },
              then: {
                $map: {
                  input: "$meeting_cps",
                  as: "cp",
                  in: {
                    id: "$$cp._id",
                    name: "$$cp.name",
                    profile_picture: "$$cp.profile_picture",
                  }
                }
              },
              else: "$cps"
            }
          },
          client: {
            $cond: {
              if: { $gt: [{ $size: "$meeting_client" }, 0] },
              then: { $arrayElemAt: ["$meeting_client", 0] },
              else: { $arrayElemAt: ["$client", 0] }
            }
          },
          admin: { $arrayElemAt: ["$admin", 0] },
          created_by: {
            $let: {
              vars: { creator: { $arrayElemAt: ["$created_by_user", 0] } },
              in: {
                $cond: {
                  if: { $ne: ["$$creator", null] },
                  then: {
                    id: "$$creator._id",
                    name: "$$creator.name",
                    role: "$$creator.role",
                    profile_picture: "$$creator.profile_picture",
                  },
                  else: null
                }
              }
            }
          },
          participants: {
            $map: {
              input: "$additional_participants",
              as: "participant",
              in: {
                id: "$$participant._id",
                name: "$$participant.name",
                profile_picture: "$$participant.profile_picture",
                email: "$$participant.email",
              }
            }
          },
          createdAt: 1,
        },
      },
      {
        $project: {
          _id: 0,
          id: 1,
          meeting_status: 1,
          meeting_date_time: 1,
          meeting_end_time: 1,
          duration: 1,
          meeting_type: 1,
          change_request: 1,
          date_time_updates: 1,
          meetLink: 1,
          meeting_title: 1,
          description: 1,
          order: 1,
          cps: 1,
          client: {
            id: "$client._id",
            name: "$client.name",
            profile_picture: "$client.profile_picture",
            email: "$client.email",
          },
          admin: {
            $cond: {
              if: { $ne: ["$admin", null] },
              then: {
                id: "$admin._id",
                name: "$admin.name",
                profile_picture: "$admin.profile_picture",
                email: "$admin.email",
              },
              else: null
            }
          },
          created_by: 1,
          created_by_id: { $toString: "$created_by.id" },
          participants: 1,
          participant_responses: 1,
          createdAt: 1,
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
    ]);

    // Auto-update meeting status based on current time
    if (result && result.length > 0) {
      await autoUpdateMeetingStatuses(result);

      // Debug log to verify participant_responses is included
      console.log('📊 getMeetingById result:', {
        id: result[0]?.id,
        has_participant_responses: !!result[0]?.participant_responses,
        participant_responses_count: result[0]?.participant_responses?.length || 0,
        participant_responses: result[0]?.participant_responses
      });
    }

    return result;
  } catch (error) {
    if (error instanceof mongoose.CastError) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid meeting ID");
    }
    throw error;
  }
};

const getMeetingByOrderId = async (options, orderId) => {
  try {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid order ID provided");
    }

    const orderObjectId = new mongoose.Types.ObjectId(orderId);
    const aggregate = [
      {
        $lookup: {
          from: "orders",
          localField: "_id",
          foreignField: "meeting_date_times",
          as: "order",
        },
      },
      {
        $unwind: "$order",
      },
      {
        $match: {
          "order._id": orderObjectId,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "order.cp_ids.id",
          foreignField: "_id",
          as: "cps",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "order.client_id",
          foreignField: "_id",
          as: "client",
        },
      },
      // Lookup for meeting-specific client
      {
        $lookup: {
          from: "users",
          localField: "client_id",
          foreignField: "_id",
          as: "meeting_client",
        },
      },
      // Lookup for meeting-specific CPs
      {
        $lookup: {
          from: "users",
          localField: "cp_ids",
          foreignField: "_id",
          as: "meeting_cps",
        },
      },
      // Lookup for admin
      {
        $lookup: {
          from: "users",
          localField: "admin_id",
          foreignField: "_id",
          as: "admin",
        },
      },
      // Lookup for additional participants
      {
        $lookup: {
          from: "users",
          localField: "participants",
          foreignField: "_id",
          as: "additional_participants",
        },
      },
      // Lookup for meeting creator
      {
        $lookup: {
          from: "users",
          localField: "created_by_id",
          foreignField: "_id",
          as: "created_by_user",
        },
      },
      {
        $addFields: {
          id: "$_id",
        },
      },
      {
        $project: {
          _id: 0,
          id: 1,
          meeting_status: 1,
          meeting_date_time: 1,
          meeting_end_time: 1,
          meeting_type: 1,
          change_request: 1,
          meetLink: 1,
          date_time_updates: 1,
          // Calculate duration in minutes
          duration: {
            $cond: {
              if: { $ne: ["$meeting_end_time", null] },
              then: {
                $round: {
                  $divide: [
                    { $subtract: ["$meeting_end_time", "$meeting_date_time"] },
                    60000 // Convert milliseconds to minutes
                  ]
                }
              },
              else: 30 // Default to 30 minutes if end time not set
            }
          },
          order: {
            id: "$order._id",
            name: "$order.order_name",
          },
          // Use meeting-specific CPs if available, otherwise fallback to order CPs
          cps: {
            $cond: {
              if: { $gt: [{ $size: "$meeting_cps" }, 0] },
              then: {
                $map: {
                  input: "$meeting_cps",
                  as: "cp",
                  in: {
                    id: "$$cp._id",
                    name: "$$cp.name",
                    profile_picture: "$$cp.profile_picture",
                    role: "$$cp.role",
                  }
                }
              },
              else: {
                $map: {
                  input: "$cps",
                  as: "cp",
                  in: {
                    id: "$$cp._id",
                    name: "$$cp.name",
                    profile_picture: "$$cp.profile_picture",
                  }
                }
              }
            }
          },
          // Use meeting-specific client if available, otherwise fallback to order client
          client: {
            $cond: {
              if: { $gt: [{ $size: "$meeting_client" }, 0] },
              then: {
                $let: {
                  vars: { c: { $arrayElemAt: ["$meeting_client", 0] } },
                  in: {
                    id: "$$c._id",
                    name: "$$c.name",
                    profile_picture: "$$c.profile_picture",
                  }
                }
              },
              else: {
                $let: {
                  vars: { c: { $arrayElemAt: ["$client", 0] } },
                  in: {
                    id: "$$c._id",
                    name: "$$c.name",
                    profile_picture: "$$c.profile_picture",
                  }
                }
              }
            }
          },
          // Add admin field
          admin: {
            $let: {
              vars: { a: { $arrayElemAt: ["$admin", 0] } },
              in: {
                $cond: {
                  if: { $ne: ["$$a", null] },
                  then: {
                    id: "$$a._id",
                    name: "$$a.name",
                    profile_picture: "$$a.profile_picture",
                  },
                  else: null
                }
              }
            }
          },
          // Add created_by field
          created_by: {
            $let: {
              vars: { creator: { $arrayElemAt: ["$created_by_user", 0] } },
              in: {
                $cond: {
                  if: { $ne: ["$$creator", null] },
                  then: {
                    id: "$$creator._id",
                    name: "$$creator.name",
                    role: "$$creator.role",
                    profile_picture: "$$creator.profile_picture",
                  },
                  else: null
                }
              }
            }
          },
          // Add additional participants field
          participants: {
            $map: {
              input: "$additional_participants",
              as: "participant",
              in: {
                id: "$$participant._id",
                name: "$$participant.name",
                profile_picture: "$$participant.profile_picture",
                email: "$$participant.email",
              }
            }
          },
          participant_responses: 1,
        },
      },
    ];

    const result = await Meeting.aggregatePaginate(aggregate, options);

    // Auto-update meeting statuses based on current time
    if (result.results && result.results.length > 0) {
      await autoUpdateMeetingStatuses(result.results);
    }

    return result;
  } catch (error) {
    if (error instanceof mongoose.CastError) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid order ID");
    }
    throw error;
  }
};

const getMeetingsByUserIdOld = async (options, userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid user ID provided");
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const aggregate = [
      {
        $addFields: {
          id: "$_id",
        },
      },
      {
        $lookup: {
          from: "orders",
          localField: "_id",
          foreignField: "meeting_date_times",
          as: "order",
        },
      },
      {
        $unwind: "$order",
      },
      {
        $lookup: {
          from: "users",
          localField: "order.cp_ids.id",
          foreignField: "_id",
          as: "cps",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "order.client_id",
          foreignField: "_id",
          as: "client",
        },
      },
      {
        $match: {
          $or: [
            {
              "cps._id": userObjectId,
              "order.cp_ids": {
                $elemMatch: {
                  id: userObjectId,
                  decision: { $ne: "cancelled" },
                },
              },
            },
            { "client._id": userObjectId },
          ],
        },
      },
      {
        $project: {
          _id: 0,
          id: 1,
          meeting_status: 1,
          meeting_date_time: 1,
          meeting_type: 1,
          meetLink: 1,
          change_request: 1,
          date_time_updates: 1,
          order: {
            id: "$order._id",
            name: "$order.order_name",
          },
          cps: {
            $map: {
              input: "$cps",
              as: "cp",
              in: {
                id: "$$cp._id",
                name: "$$cp.name",
                profile_picture: "$$cp.profile_picture",
              },
            },
          },
          client: {
            $arrayElemAt: ["$client", 0],
          },
          createdAt: 1,
        },
      },
      {
        $project: {
          _id: 0,
          id: 1,
          meeting_status: 1,
          meeting_date_time: 1,
          meeting_type: 1,
          meetLink: 1,
          change_request: 1,
          date_time_updates: 1,
          order: 1,
          cps: 1,
          client: {
            id: "$client._id",
            name: "$client.name",
          },
          createdAt: 1,
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
    ];

    return await Meeting.aggregatePaginate(aggregate, options);
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * options: { sortBy, limit, page, timeline }
 * userId: string (ObjectId)
 */
const getMeetingsByUserId = async (options, userId, search, status) => {
  try {
    // 1) Validate that the user exists
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid user ID provided");
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // 2) Build the common "base pipeline" (everything except pagination vs. timeline filter).
    //    We'll later insert a date‐range $match if timeline is present.
    const basePipeline = [
      {
        $addFields: {
          id: "$_id",
        },
      },
      {
        $lookup: {
          from: "orders",
          localField: "_id",
          foreignField: "meeting_date_times",
          as: "order",
        },
      },
      { $unwind: "$order" },
      {
        $lookup: {
          from: "users",
          localField: "order.cp_ids.id",
          foreignField: "_id",
          as: "cps",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "order.client_id",
          foreignField: "_id",
          as: "client",
        },
      },
      // Lookup for meeting-specific client
      {
        $lookup: {
          from: "users",
          localField: "client_id",
          foreignField: "_id",
          as: "meeting_client",
        },
      },
      // Lookup for meeting-specific CPs
      {
        $lookup: {
          from: "users",
          localField: "cp_ids",
          foreignField: "_id",
          as: "meeting_cps",
        },
      },
      // Lookup for admin
      {
        $lookup: {
          from: "users",
          localField: "admin_id",
          foreignField: "_id",
          as: "admin",
        },
      },
      // Lookup for additional participants
      {
        $lookup: {
          from: "users",
          localField: "participants",
          foreignField: "_id",
          as: "additional_participants",
        },
      },
      // Lookup for meeting creator
      {
        $lookup: {
          from: "users",
          localField: "created_by_id",
          foreignField: "_id",
          as: "created_by_user",
        },
      },
      {
        // Only keep meetings where the requesting user is either
        //   a) one of the "cp"s (and their decision ≠ "cancelled"), or
        //   b) the "client", or
        //   c) meeting-specific participant (cp_ids, admin_id, participants)
        $match: {
          $or: [
            {
              "cps._id": userObjectId,
              "order.cp_ids": {
                $elemMatch: {
                  id: userObjectId,
                  decision: { $ne: "cancelled" },
                },
              },
            },
            { "client._id": userObjectId },
            { "meeting_client._id": userObjectId },
            { "meeting_cps._id": userObjectId },
            { "admin._id": userObjectId },
            { "additional_participants._id": userObjectId },
          ],
        },
      },
      {
        // First project some fields, including mapping cps → {id, name, profile_picture},
        // and pulling the first element of "client" array (so client: { _id, name }).
        $project: {
          _id: 0,
          id: 1,
          meeting_status: 1,
          meeting_date_time: 1,
          meeting_end_time: 1,
          meeting_type: 1,
          meetLink: 1,
          change_request: 1,
          date_time_updates: 1,
          meeting_title: 1,
          description: 1,
          // Calculate duration in minutes
          duration: {
            $cond: {
              if: { $ne: ["$meeting_end_time", null] },
              then: {
                $round: {
                  $divide: [
                    { $subtract: ["$meeting_end_time", "$meeting_date_time"] },
                    60000 // Convert milliseconds to minutes
                  ]
                }
              },
              else: 30 // Default to 30 minutes if end time not set
            }
          },
          order: {
            id: "$order._id",
            name: "$order.order_name",
          },
          // Use meeting-specific participants if available, otherwise fallback to order participants
          cps: {
            $cond: {
              if: { $gt: [{ $size: "$meeting_cps" }, 0] },
              then: {
                $map: {
                  input: "$meeting_cps",
                  as: "cp",
                  in: {
                    id: "$$cp._id",
                    name: "$$cp.name",
                    profile_picture: "$$cp.profile_picture",
                  }
                }
              },
              else: {
                $map: {
                  input: "$cps",
                  as: "cp",
                  in: {
                    id: "$$cp._id",
                    name: "$$cp.name",
                    profile_picture: "$$cp.profile_picture",
                  }
                }
              }
            }
          },
          client: {
            $cond: {
              if: { $gt: [{ $size: "$meeting_client" }, 0] },
              then: { $arrayElemAt: ["$meeting_client", 0] },
              else: { $arrayElemAt: ["$client", 0] }
            }
          },
          admin: { $arrayElemAt: ["$admin", 0] },
          created_by: {
            $let: {
              vars: { creator: { $arrayElemAt: ["$created_by_user", 0] } },
              in: {
                $cond: {
                  if: { $ne: ["$$creator", null] },
                  then: {
                    id: "$$creator._id",
                    name: "$$creator.name",
                    role: "$$creator.role",
                    profile_picture: "$$creator.profile_picture",
                  },
                  else: null
                }
              }
            }
          },
          participants: {
            $map: {
              input: "$additional_participants",
              as: "participant",
              in: {
                id: "$$participant._id",
                name: "$$participant.name",
                profile_picture: "$$participant.profile_picture",
                email: "$$participant.email",
              }
            }
          },
          participant_responses: 1,
          createdAt: 1,
        },
      },
      {
        // Then reshape the fields
        $project: {
          id: 1,
          meeting_status: 1,
          meeting_date_time: 1,
          meeting_end_time: 1,
          duration: 1,
          meeting_type: 1,
          meetLink: 1,
          change_request: 1,
          date_time_updates: 1,
          meeting_title: 1,
          description: 1,
          order: 1,
          cps: 1,
          client: {
            id: "$client._id",
            name: "$client.name",
            profile_picture: "$client.profile_picture",
            email: "$client.email",
          },
          admin: {
            $cond: {
              if: { $ne: ["$admin", null] },
              then: {
                id: "$admin._id",
                name: "$admin.name",
                profile_picture: "$admin.profile_picture",
                email: "$admin.email",
              },
              else: null
            }
          },
          created_by: 1,
          participants: 1,
          participant_responses: 1,
          createdAt: 1,
        },
      },
      // Search and status filters: match across meeting title, order name, and attendee names
      ...(() => {
        const matchConditions = [];

        if (search) {
          matchConditions.push({
            $or: [
              { "meeting_title": { $regex: search, $options: "i" } },
              { "order.name": { $regex: search, $options: "i" } },
              { "client.name": { $regex: search, $options: "i" } },
              { "cps.name": { $regex: search, $options: "i" } },
              { "admin.name": { $regex: search, $options: "i" } },
              { "participants.name": { $regex: search, $options: "i" } },
            ],
          });
        }

        if (status && status !== 'all') {
          matchConditions.push({
            "meeting_status": status.toLowerCase()
          });
        }

        if (matchConditions.length === 0) return [];

        return [{
          $match: matchConditions.length === 1
            ? matchConditions[0]
            : { $and: matchConditions }
        }];
      })(),
      {
        $sort: { createdAt: -1 },
      },
    ];

    // 3) If "timeline" is provided, parse month/year and _inject_ a date‐range filter,
    //    then run aggregate() without paginate.
    if (options.timeline) {
      // Expect format "MM/YYYY" (e.g. "05/2025")
      const [monthStr, yearStr] = options.timeline.split("/");
      const month = parseInt(monthStr, 10);   // 1–12
      const year = parseInt(yearStr, 10);     // e.g. 2025

      if (
        isNaN(month) ||
        isNaN(year) ||
        month < 1 ||
        month > 12 ||
        year < 1900
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Invalid timeline format. Use MM/YYYY, e.g. 05/2025."
        );
      }

      // Build [startOfMonth, startOfNextMonth) range
      const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
      const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0));

      // Inject a $match stage on meeting_date_time
      // We want: meeting_date_time >= startDate AND meeting_date_time < endDate
      // where meeting_date_time is assumed to be a Date in UTC (adjust if you’re storing local times).
      const dateMatchStage = {
        $match: {
          meeting_date_time: { $gte: startDate, $lt: endDate },
        },
      };

      // Now insert `dateMatchStage` **after** the user‐filtering $match but _before_ the first $project.
      // In `basePipeline`, that user $match is at index 5 (0-based),
      // so we’ll splice right after index 5 (i.e. at index 6):
      const pipelineWithDateFilter = [
        ...basePipeline.slice(0, 6),
        dateMatchStage,
        ...basePipeline.slice(6),
      ];

      // Finally, run a plain aggregate (no paginate) and return all docs for that month.
      const timelineResults = await Meeting.aggregate(pipelineWithDateFilter);

      // Auto-update meeting statuses based on current time
      if (timelineResults && timelineResults.length > 0) {
        await autoUpdateMeetingStatuses(timelineResults);
      }

      return timelineResults;
    }

    // 4) Otherwise, "timeline" wasn't provided → do normal aggregatePaginate
    const result = await Meeting.aggregatePaginate(basePipeline, options);

    // Auto-update meeting statuses based on current time
    if (result.results && result.results.length > 0) {
      await autoUpdateMeetingStatuses(result.results);
    }

    return result;
  } catch (error) {
    // Bubble up as 500 if something goes wrong unexpectedly
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};


const createMeeting = async (reqBody) => {

  const { order_id } = reqBody;

  if (!order_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Order ID is required");
  }

  let order = await Order.findById(order_id);

  if (!order) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid order ID provided");
  }

  if (!reqBody.meeting_title) {
      reqBody.meeting_title = `Order ID ${order_id} Meeting`;
  }

  try {

    // Create the meeting
    delete reqBody.order_id;
    const sendNotification_flag = reqBody.send_notification;
    delete reqBody.send_notification;
    const meeting = await Meeting.create(reqBody);
    
    // Add the meeting ID to the order's meeting_date_times array
    order.meeting_date_times.push(meeting._id);
    await order.save();

    //Send new meeting scheduled notification to the client and cp (only if send_notification is true)
    if (sendNotification_flag && "cp_ids" in order && "client_id" in order && order.client_id !== null) {
      //Prepare notification title and content
      const notificationTitle = "New meeting has been scheduled";
      const notificationContent = `A new meeting has been scheduled for order '${order.order_name}'`;
      const notificationData = {
        type: "newMeeting",
        meetingId: meeting._id.toString(),
        id: meeting._id.toString(),
        orderId: order._id.toString(),
      };

      // Send FCM push notification to client
      sendNotification(
        order.client_id,
        notificationTitle,
        notificationContent,
        notificationData
      );

      // Create in-app notification for client
      await insertNotification({
        modelName: 'Meeting',
        modelId: meeting._id,
        clientId: order.client_id,
        category: 'Meeting',
        message: notificationContent,
        metadata: {
          title: notificationTitle,
          type: 'newMeeting',
          meetingId: meeting._id.toString(),
          orderId: order._id.toString(),
          orderName: order.order_name,
          createdBy: reqBody.created_by_id?.toString() || null,
        }
      });

      // Send notifications to all CPs
      const cpIdsForNotification = [];
      order.cp_ids.forEach((cp) => {
        if (cp.decision !== "cancelled") {
          const cpId = cp.id.toString();
          cpIdsForNotification.push(cp.id);
          // Send FCM push notification to the CP
          sendNotification(
            cpId,
            notificationTitle,
            notificationContent,
            notificationData
          );
        }
      });

      // Create in-app notification for all active CPs
      if (cpIdsForNotification.length > 0) {
        await insertNotification({
          modelName: 'Meeting',
          modelId: meeting._id,
          cpIds: cpIdsForNotification,
          category: 'Meeting',
          message: notificationContent,
          metadata: {
            title: notificationTitle,
            type: 'newMeeting',
            meetingId: meeting._id.toString(),
            orderId: order._id.toString(),
            orderName: order.order_name,
            createdBy: reqBody.created_by_id?.toString() || null,
          }
        });
      }
    }

    // Populate the meeting with participant data before returning
    const populatedMeeting = await Meeting.findById(meeting._id)
      .populate('client_id', 'name email profile_picture')
      .populate('cp_ids', 'name email profile_picture role')
      .populate('admin_id', 'name email profile_picture role')
      .populate('participants', 'name email profile_picture role')
      .populate('created_by_id', 'name email profile_picture role')
      .lean();

    if (!populatedMeeting) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Failed to retrieve created meeting");
    }

    // Transform the populated meeting to match the expected format
    const meetingData = {
      ...populatedMeeting,
      id: populatedMeeting._id,
      client: populatedMeeting.client_id ? {
        id: populatedMeeting.client_id._id,
        name: populatedMeeting.client_id.name,
        profile_picture: populatedMeeting.client_id.profile_picture,
      } : null,
      cps: populatedMeeting.cp_ids ? populatedMeeting.cp_ids.map(cp => ({
        id: cp._id,
        name: cp.name,
        profile_picture: cp.profile_picture,
        role: cp.role,
      })) : [],
      admin: populatedMeeting.admin_id ? {
        id: populatedMeeting.admin_id._id,
        name: populatedMeeting.admin_id.name,
        profile_picture: populatedMeeting.admin_id.profile_picture,
        role: populatedMeeting.admin_id.role,
      } : null,
      created_by: populatedMeeting.created_by_id ? {
        id: populatedMeeting.created_by_id._id,
        name: populatedMeeting.created_by_id.name,
        role: populatedMeeting.created_by_id.role,
        profile_picture: populatedMeeting.created_by_id.profile_picture,
      } : null,
      participants: populatedMeeting.participants ? populatedMeeting.participants.map(p => ({
        id: p._id,
        name: p.name,
        profile_picture: p.profile_picture,
        email: p.email,
      })) : [],
      order: {
        id: order._id,
        name: order.order_name,
      },
    };

    // Remove the raw ID fields and Mongoose-specific fields
    delete meetingData._id;
    delete meetingData.__v;
    delete meetingData.client_id;
    delete meetingData.cp_ids;
    delete meetingData.admin_id;
    delete meetingData.created_by_id;

    return meetingData;
  } catch (error) {
    if (error instanceof mongoose.CastError) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid order ID");
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const updateMeetingById = async (meetingId, updateData) => {
  try {
    const meeting = await Meeting.findById(meetingId);

    if (!meeting) {
      throw new ApiError(httpStatus.NOT_FOUND, "Meeting not found");
    }

    if (meeting.meeting_status === "cancelled") {
      throw new ApiError(httpStatus.BAD_REQUEST, "Cancelled meetings cannot be edited");
    }

    // Check if meeting is currently in progress (either stored status or time-based)
    let effectiveStatus = meeting.meeting_status;
    if (['pending', 'confirmed'].includes(effectiveStatus)) {
      const now = new Date();
      const startTime = new Date(meeting.meeting_date_time);
      if (now >= startTime) {
        effectiveStatus = 'in_progress';
      }
    }

    if (effectiveStatus === "in_progress") {
      throw new ApiError(httpStatus.BAD_REQUEST, "In-progress meetings cannot be edited");
    }

    const currentMeetingStatus = meeting.meeting_status;

    //Update the meeting record
    Object.assign(meeting, updateData);
    await meeting.save();

    //Send meeting status update notification
    await sendMeetingStatusUpdateNotification(meeting, currentMeetingStatus);

    return meeting;
  } catch (error) {
    if (error instanceof mongoose.CastError) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid meeting ID");
    }
    throw error;
  }
};

const deleteMeetingById = async (meetingId) => {
  try {
    await Meeting.findByIdAndDelete(meetingId);
  } catch (error) {
    if (error instanceof mongoose.CastError) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid meeting ID");
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const checkMeeting = async (meetingId) => {
  // Find the meeting by its ID
  let meeting = await Meeting.findById(meetingId);

  // Validate the meeting id
  if (!meeting) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid meeting ID provided");
  }

  return meeting;
};

const placeChangeRequest = async (meetingId, reqBody) => {
  try {
    // Find the meeting by its ID
    let meeting = await checkMeeting(meetingId);

    // Validate the meeting status
    const excludedStatuses = ["completed", "cancelled", "change_request"];
    const meetingStatus = meeting.meeting_status;
    if (excludedStatuses.includes(meetingStatus)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Schedule update request cannot be submitted for meetings with a ${meetingStatus} status`
      );
    }

    // Destructure properties from reqBody
    const { requested_by, requested_time } = reqBody;

    // Validate the presence of requested_by and requested_time in reqBody
    if (!requested_by || !requested_time) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Both 'requested_by' and 'requested_time' fields must be provided in the request body"
      );
    }

    // Create a change request object
    const changeRequestObject = {
      requested_by: requested_by,
      request_type:
        requested_by === "client"
          ? "client_reschedule_request"
          : "cp_reschedule_request",
      request_status: "pending",
      request_date_time: requested_time,
    };

    // Update the meeting status to 'change_request' and set the change request object
    meeting.meeting_status = "change_request";
    meeting.change_request = changeRequestObject;

    // Save the changes to the meeting
    meeting.save();

    //fetch the order record
    const order = await Order.findOne({ meeting_date_times: meetingId });

    //Send meeting schedule update request notification to the client
    const notificationTitle = "Meeting Schedule Update Request";
    const NotificationContent = `A schedule update request has been placed for the meeting of order '${order.order_name}'`;

    // Send FCM push notification to client
    sendNotification(order.client_id, notificationTitle, NotificationContent, {
      type: "meetingScheduleUpdateRequest",
      meetingId: meetingId.toString(),
      id: meetingId.toString(),
      orderId: order._id.toString(),
    });

    // Create in-app notification for client
    if (order.client_id) {
      await insertNotification({
        modelName: 'Meeting',
        modelId: meetingId,
        clientId: order.client_id,
        category: 'Meeting',
        message: NotificationContent,
        metadata: {
          title: notificationTitle,
          type: 'meetingScheduleUpdateRequest',
          meetingId: meetingId.toString(),
          orderId: order._id.toString(),
          orderName: order.order_name,
          requestedBy: requested_by,
          requestedTime: requested_time,
        }
      });
    }

    // Also notify all CPs about the schedule update request
    const cpIdsForNotification = [];
    order.cp_ids.forEach((cp) => {
      if (cp.decision !== "cancelled") {
        cpIdsForNotification.push(cp.id);
        sendNotification(cp.id.toString(), notificationTitle, NotificationContent, {
          type: "meetingScheduleUpdateRequest",
          meetingId: meetingId.toString(),
          id: meetingId.toString(),
          orderId: order._id.toString(),
        });
      }
    });

    if (cpIdsForNotification.length > 0) {
      await insertNotification({
        modelName: 'Meeting',
        modelId: meetingId,
        cpIds: cpIdsForNotification,
        category: 'Meeting',
        message: NotificationContent,
        metadata: {
          title: notificationTitle,
          type: 'meetingScheduleUpdateRequest',
          meetingId: meetingId.toString(),
          orderId: order._id.toString(),
          orderName: order.order_name,
          requestedBy: requested_by,
          requestedTime: requested_time,
        }
      });
    }

    return meeting;
  } catch (error) {
    throw error;
  }
};

const updateChangeRequestStatus = async (meetingId, changeRequestStatus) => {
  try {
    // Find the meeting by its ID
    let meeting = await checkMeeting(meetingId);

    // Validate the meeting status condition
    if (meeting.meeting_status !== "change_request") {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `This operation can only be performed on meetings with a 'change_request' status`
      );
    }

    // Validate the status field input
    if (
      changeRequestStatus !== "approved" &&
      changeRequestStatus !== "rejected"
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Please provide a valid 'status' field value, which must be either 'approved' or 'rejected'"
      );
    }

    //Store current status values
    const currentMeetingStatus = meeting.meeting_status;
    const currentChangeRequestStatus = meeting.change_request.request_status;

    // Update the meeting data
    const isChangeRequestApproved = changeRequestStatus === "approved";
    meeting.meeting_status = isChangeRequestApproved
      ? "rescheduled"
      : "cancelled";
    meeting.change_request.request_status = changeRequestStatus;

    if (isChangeRequestApproved) {
      // Update meeting date_time if change request is approved
      meeting.meeting_date_time = meeting.change_request.request_date_time;
    }

    //Save the meeting
    meeting.save();

    //Send meeting status update notification to the client and cp
    await sendMeetingStatusUpdateNotification(
      meeting,
      currentMeetingStatus,
      currentChangeRequestStatus
    );

    return meeting;
  } catch (error) {
    throw error;
  }
};

const sendMeetingStatusUpdateNotification = async (
  updatedMeetingObject,
  currentMeetingStatus,
  currentChangeRequestStatus = ""
) => {
  const meeting = updatedMeetingObject;
  const isMeetingStatusUpdated =
    currentMeetingStatus !== meeting.meeting_status;
  const isChangeRequestStatusUpdated =
    currentChangeRequestStatus === ""
      ? false
      : currentChangeRequestStatus !== meeting.change_request.request_status;

  //fetch the order record
  if (isMeetingStatusUpdated || isChangeRequestStatusUpdated) {
    //fetch the order record
    const order = await Order.findOne({ meeting_date_times: meeting._id });

    //Send meeting status update notification to the client and cp
    if (isMeetingStatusUpdated) {
      //Prepare notification data
      const notificationTitle = "Meeting Status Update";
      const NotificationContent = `The status of meeting for order '${order.order_name}' has transitioned from ${currentMeetingStatus} to ${meeting.meeting_status}`;
      const notificationData = {
        type: "meetingStatusUpdate",
        meetingId: meeting._id.toString(),
        id: meeting._id.toString(),
        orderId: order._id.toString(),
      };

      // Collect CP IDs for in-app notification
      const cpIdsForNotification = [];

      //Send notification to the cp and client
      order.cp_ids.forEach((cp) => {
        const cpId = cp.id.toString();
        cpIdsForNotification.push(cp.id);
        // Send FCM push notification to the CP
        sendNotification(
          cpId,
          notificationTitle,
          NotificationContent,
          notificationData
        );
      });

      // Send FCM push notification to client
      sendNotification(
        order.client_id,
        notificationTitle,
        NotificationContent,
        notificationData
      );

      // Create in-app notification for client
      if (order.client_id) {
        await insertNotification({
          modelName: 'Meeting',
          modelId: meeting._id,
          clientId: order.client_id,
          category: 'Meeting',
          message: NotificationContent,
          metadata: {
            title: notificationTitle,
            type: 'meetingStatusUpdate',
            meetingId: meeting._id.toString(),
            orderId: order._id.toString(),
            orderName: order.order_name,
            previousStatus: currentMeetingStatus,
            newStatus: meeting.meeting_status,
          }
        });
      }

      // Create in-app notification for all CPs
      if (cpIdsForNotification.length > 0) {
        await insertNotification({
          modelName: 'Meeting',
          modelId: meeting._id,
          cpIds: cpIdsForNotification,
          category: 'Meeting',
          message: NotificationContent,
          metadata: {
            title: notificationTitle,
            type: 'meetingStatusUpdate',
            meetingId: meeting._id.toString(),
            orderId: order._id.toString(),
            orderName: order.order_name,
            previousStatus: currentMeetingStatus,
            newStatus: meeting.meeting_status,
          }
        });
      }
    }

    //Send meeting schedule change request status update notification to the CP and client
    if (isChangeRequestStatusUpdated) {
      const notificationTitle = "Meeting Schedule Change Request Status Update";
      const NotificationContent = `The status of meeting schedule change request for order '${order.order_name}' has transitioned from ${currentChangeRequestStatus} to ${meeting.change_request.request_status}`;

      const cpIdsForNotification = [];

      order.cp_ids.forEach((cp) => {
        const cpId = cp.id.toString();
        cpIdsForNotification.push(cp.id);
        sendNotification(cpId, notificationTitle, NotificationContent, {
          type: "meetingScheduleChangeRequestStatusUpdate",
          meetingId: meeting._id.toString(),
          id: meeting._id.toString(),
          orderId: order._id.toString(),
        });
      });

      // Create in-app notification for CPs
      if (cpIdsForNotification.length > 0) {
        await insertNotification({
          modelName: 'Meeting',
          modelId: meeting._id,
          cpIds: cpIdsForNotification,
          category: 'Meeting',
          message: NotificationContent,
          metadata: {
            title: notificationTitle,
            type: 'meetingScheduleChangeRequestStatusUpdate',
            meetingId: meeting._id.toString(),
            orderId: order._id.toString(),
            orderName: order.order_name,
            previousStatus: currentChangeRequestStatus,
            newStatus: meeting.change_request.request_status,
          }
        });
      }

      // Also notify client about reschedule request status
      if (order.client_id) {
        sendNotification(order.client_id, notificationTitle, NotificationContent, {
          type: "meetingScheduleChangeRequestStatusUpdate",
          meetingId: meeting._id.toString(),
          id: meeting._id.toString(),
          orderId: order._id.toString(),
        });

        await insertNotification({
          modelName: 'Meeting',
          modelId: meeting._id,
          clientId: order.client_id,
          category: 'Meeting',
          message: NotificationContent,
          metadata: {
            title: notificationTitle,
            type: 'meetingScheduleChangeRequestStatusUpdate',
            meetingId: meeting._id.toString(),
            orderId: order._id.toString(),
            orderName: order.order_name,
            previousStatus: currentChangeRequestStatus,
            newStatus: meeting.change_request.request_status,
          }
        });
      }
    }
  }
};

/**
 * Add participants to a meeting
 * @param {ObjectId} meetingId
 * @param {Object} participantData - { role: 'cp' | 'manager', user_ids: [] }
 * @returns {Promise<Meeting>}
 */
const addMeetingParticipants = async (meetingId, participantData) => {
  try {
    const meeting = await Meeting.findById(meetingId);

    if (!meeting) {
      throw new ApiError(httpStatus.NOT_FOUND, "Meeting not found");
    }

    const { role, user_ids } = participantData;

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "user_ids array is required");
    }

    // Verify all user IDs exist
    const users = await User.find({ _id: { $in: user_ids } });
    if (users.length !== user_ids.length) {
      throw new ApiError(httpStatus.BAD_REQUEST, "One or more invalid user IDs");
    }

    // Add participants based on role
    if (role === 'cp') {
      // Add to cp_ids array (avoid duplicates)
      const newCpIds = user_ids.filter(id => !meeting.cp_ids.includes(id));
      meeting.cp_ids.push(...newCpIds);
    } else if (role === 'manager') {
      // Add to participants array (avoid duplicates)
      const newParticipants = user_ids.filter(id => !meeting.participants.includes(id));
      meeting.participants.push(...newParticipants);
    } else {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid role. Must be 'cp' or 'manager'");
    }

    await meeting.save();

    // Send notifications to newly added participants
    const notificationTitle = "Added to Meeting";
    const notificationContent = `You have been added as a participant to a meeting`;
    const notificationData = {
      type: "participantAdded",
      meetingId: meeting._id.toString(),
      id: meeting._id.toString(),
    };

    for (const userId of user_ids) {
      sendNotification(
        userId,
        notificationTitle,
        notificationContent,
        notificationData
      );

      await insertNotification({
        modelName: 'Meeting',
        modelId: meeting._id,
        cpIds: role === 'cp' ? [userId] : [],
        participantIds: role === 'manager' ? [userId] : [],
        category: 'Meeting',
        message: notificationContent,
        metadata: {
          title: notificationTitle,
          type: 'participantAdded',
          meetingId: meeting._id.toString(),
        }
      });
    }

    return meeting;
  } catch (error) {
    if (error instanceof mongoose.CastError) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid meeting ID or user ID");
    }
    throw error;
  }
};

/**
 * Remove a participant from a meeting
 * @param {ObjectId} meetingId
 * @param {ObjectId} userId
 * @param {string} role - 'cp' | 'admin' | 'participant'
 * @returns {Promise<Meeting>}
 */
const removeMeetingParticipant = async (meetingId, userId, role) => {
  try {
    const meeting = await Meeting.findById(meetingId);

    if (!meeting) {
      throw new ApiError(httpStatus.NOT_FOUND, "Meeting not found");
    }

    // Cannot remove client
    if (role === 'client') {
      throw new ApiError(httpStatus.FORBIDDEN, "Cannot remove client from meeting");
    }

    // Cannot remove admin if they created the meeting
    if (role === 'admin' && meeting.admin_id && meeting.admin_id.toString() === userId.toString()) {
      throw new ApiError(httpStatus.FORBIDDEN, "Admin who created the meeting cannot remove themselves");
    }

    // Remove participant based on role
    if (role === 'cp') {
      meeting.cp_ids = meeting.cp_ids.filter(id => id.toString() !== userId.toString());
    } else if (role === 'admin') {
      if (meeting.admin_id && meeting.admin_id.toString() === userId.toString()) {
        meeting.admin_id = null;
      }
    } else if (role === 'participant') {
      meeting.participants = meeting.participants.filter(id => id.toString() !== userId.toString());
    } else {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid role");
    }

    await meeting.save();

    // Send notification to removed participant
    const notificationTitle = "Removed from Meeting";
    const notificationContent = `You have been removed as a participant from a meeting`;
    const notificationData = {
      type: "participantRemoved",
      meetingId: meeting._id.toString(),
      id: meeting._id.toString(),
    };

    sendNotification(
      userId,
      notificationTitle,
      notificationContent,
      notificationData
    );

    await insertNotification({
      modelName: 'Meeting',
      modelId: meeting._id,
      cpIds: role === 'cp' ? [userId] : [],
      participantIds: role === 'participant' ? [userId] : [],
      category: 'Meeting',
      message: notificationContent,
      metadata: {
        title: notificationTitle,
        type: 'participantRemoved',
        meetingId: meeting._id.toString(),
      }
    });

    return meeting;
  } catch (error) {
    if (error instanceof mongoose.CastError) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid meeting ID or user ID");
    }
    throw error;
  }
};

/**
 * Handle participant response to meeting invitation
 * @param {ObjectId} meetingId
 * @param {ObjectId} userId - The user responding to the invitation
 * @param {string} response - 'accepted' or 'declined'
 * @returns {Promise<Meeting>}
 */
const respondToMeetingInvitation = async (meetingId, userId, response, notificationId) => {
  try {
    const meeting = await Meeting.findById(meetingId);

    if (!meeting) {
      throw new ApiError(httpStatus.NOT_FOUND, "Meeting not found");
    }

    // Validate response
    if (!['accepted', 'declined'].includes(response)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Response must be 'accepted' or 'declined'");
    }

    // Check if user is a direct participant in this meeting
    const isDirectParticipant =
      (meeting.client_id && meeting.client_id.toString() === userId.toString()) ||
      (meeting.cp_ids && meeting.cp_ids.some(cpId => cpId.toString() === userId.toString())) ||
      (meeting.admin_id && meeting.admin_id.toString() === userId.toString()) ||
      (meeting.participants && meeting.participants.some(pId => pId.toString() === userId.toString()));

    // Also check if user is a CP on the order linked to this meeting
    // (meetings are linked to orders via order.meeting_date_times)
    let isOrderCp = false;
    if (!isDirectParticipant) {
      const linkedOrder = await Order.findOne({
        meeting_date_times: meeting._id,
        'cp_ids.id': new mongoose.Types.ObjectId(userId),
      });
      if (linkedOrder) {
        const cpEntry = linkedOrder.cp_ids.find(cp => cp.id.toString() === userId.toString());
        isOrderCp = cpEntry && cpEntry.decision !== 'cancelled';
      }
    }

    if (!isDirectParticipant && !isOrderCp) {
      throw new ApiError(httpStatus.FORBIDDEN, "You are not a participant in this meeting");
    }

    // Initialize participant_responses array if it doesn't exist
    if (!meeting.participant_responses) {
      meeting.participant_responses = [];
    }

    // Find existing response from this user
    const existingResponseIndex = meeting.participant_responses.findIndex(
      r => r.user_id.toString() === userId.toString()
    );

    const existingResponse = existingResponseIndex !== -1
      ? meeting.participant_responses[existingResponseIndex]
      : null;

    // Toggle behavior: If user already has this exact response, remove it
    if (existingResponse && existingResponse.response === response) {
      // Remove the response (toggle off)
      meeting.participant_responses.splice(existingResponseIndex, 1);
    } else {
      // Add or update the response
      const responseData = {
        user_id: userId,
        response: response,
        responded_at: new Date(),
      };

      if (existingResponseIndex !== -1) {
        // Update existing response with different value
        meeting.participant_responses[existingResponseIndex] = responseData;
      } else {
        // Add new response
        meeting.participant_responses.push(responseData);
      }
    }

    // Update meeting status based on participant responses
    // Collect all participant IDs
    const allParticipantIds = new Set();
    if (meeting.client_id) allParticipantIds.add(meeting.client_id.toString());
    if (meeting.cp_ids) meeting.cp_ids.forEach(id => allParticipantIds.add(id.toString()));
    if (meeting.admin_id) allParticipantIds.add(meeting.admin_id.toString());
    if (meeting.participants) meeting.participants.forEach(id => allParticipantIds.add(id.toString()));

    // Check if all participants have accepted
    const allAccepted = Array.from(allParticipantIds).every(participantId => {
      const response = meeting.participant_responses.find(
        r => r.user_id.toString() === participantId
      );
      return response && response.response === 'accepted';
    });

    // Update meeting status based on responses
    if (allAccepted && allParticipantIds.size > 0) {
      // All participants accepted -> confirmed
      meeting.meeting_status = 'confirmed';
    } else if (meeting.meeting_status === 'confirmed') {
      // Was confirmed but someone changed/removed their acceptance -> back to pending
      meeting.meeting_status = 'pending';
    }

    await meeting.save();

    // Update ALL matching notification documents to reflect the response
    const { Notification } = require('../models');
    try {
      const wasRemoved = existingResponse && existingResponse.response === response;

      const updateQuery = wasRemoved
        ? {
            $unset: { 'metadata.response': '', 'metadata.respondedAt': '' },
            $set: { isRead: false, readAt: null }
          }
        : {
            $set: {
              'metadata.response': response,
              'metadata.respondedAt': new Date(),
              isRead: true,
              readAt: new Date()
            }
          };

      if (notificationId) {
        // Update the exact notification the user clicked — works for any role
        // (avoids the clientId/cpIds/managerIds mismatch for admin users).
        await Notification.findByIdAndUpdate(notificationId, updateQuery);
      } else {
        // Fallback: update all matching notifications for this meeting + user.
        await Notification.updateMany(
          {
            modelName: 'Meeting',
            modelId: meetingId,
            $or: [
              { clientId: userId },
              { cpIds: userId },
              { managerIds: userId }
            ],
            'metadata.type': { $in: ['meeting_created', 'newMeeting'] }
          },
          updateQuery
        );
      }
    } catch (notificationError) {
      // Log error but don't fail the main operation
      console.error('Error updating notification metadata:', notificationError);
    }

    return meeting;
  } catch (error) {
    if (error instanceof mongoose.CastError) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid meeting ID or user ID");
    }
    throw error;
  }
};

module.exports = {
  getMeetings,
  getMeetingById,
  getMeetingByOrderId,
  getMeetingsByUserId,
  createMeeting,
  updateMeetingById,
  deleteMeetingById,
  placeChangeRequest,
  updateChangeRequestStatus,
  addMeetingParticipants,
  removeMeetingParticipant,
  respondToMeetingInvitation,
};
