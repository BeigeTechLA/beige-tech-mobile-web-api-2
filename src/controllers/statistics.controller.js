const Order = require("../models/order.model"); // Adjust the path as necessary

const getStatistics = async (req, res) => {
  try {
    const statuses = [
      "pending",
      "pre_production",
      "production",
      "post_production",
      "revision",
      "completed",
      "cancelled",
      "in_dispute",
    ];
    const counts = await Promise.all(
      statuses.map((status) => Order.countDocuments({ order_status: status }))
    );

    res.status(200).json({
      pending: counts[0],
      pre_production: counts[1],
      production: counts[2],
      post_production: counts[3],
      revision: counts[4],
      completed: counts[5],
      cancelled: counts[6],
      in_dispute: counts[7],
      total: counts.reduce((a, b) => a + b, 0),
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching statistics", error });
  }
};
const getCategoryStatistics = async (req, res) => {
  try {
    const categoryCounts = await Order.aggregate([
      {
        $group: {
          _id: "$content_vertical",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    const formattedCategoryCounts = categoryCounts.map((category) => ({
      category: category._id,
      count: category.count,
    }));
    res.status(200).json(formattedCategoryCounts);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching category statistics", error });
  }
};

const getYearlyStatistics = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const statistics = await Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(`${currentYear}-01-01`),
            $lt: new Date(`${currentYear + 1}-01-01`),
          },
        },
      },
      {
        $group: {
          _id: { month: { $month: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.month": 1 },
      },
    ]);

    const monthlyCounts = Array(12).fill(0);
    statistics.forEach((stat) => {
      monthlyCounts[stat._id.month - 1] = stat.count;
    });

    const formattedStatistics = {
      series: [
        {
          name: "Shoots per month",
          data: monthlyCounts,
        },
      ],
    };

    res.status(200).json(formattedStatistics);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching yearly statistics", error });
  }
};

module.exports = {
  getStatistics,
  getYearlyStatistics,
  getCategoryStatistics,
};
