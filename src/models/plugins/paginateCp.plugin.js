const paginateCp = (schema) => {
  schema.statics.paginateCp = async function (filter, options) {
    let sort = "";
    if (options.sortBy) {
      const sortingCriteria = [];
      options.sortBy.split(",").forEach((sortOption) => {
        const [key, order] = sortOption.split(":");
        sortingCriteria.push((order === "desc" ? "-" : "") + key);
      });
      sort = sortingCriteria.join(" ");
    } else {
      sort = "createdAt";
    }

    const limit =
      options.limit && parseInt(options.limit, 10) > 0
        ? parseInt(options.limit, 10)
        : 10;
    const page =
      options.page && parseInt(options.page, 10) > 0
        ? parseInt(options.page, 10)
        : 1;
    const skip = (page - 1) * limit;

    let matchStage = {};

    // Handle regular filters
    Object.keys(filter).forEach((key) => {
      if (key !== "search" && key !== "search_test") {
        matchStage[key] = filter[key];
      }
    });

    // Handle search
    if (filter.search) {
      matchStage.$or = [
        { name: { $regex: filter.search, $options: "i" } },
        { email: { $regex: filter.search, $options: "i" } },
        { "userId.name": { $regex: filter.search, $options: "i" } },
        { "userId.email": { $regex: filter.search, $options: "i" } },
      ];
    }

    // Handle search_test
    if (filter.search_test) {
      matchStage["userId.name"] = { $regex: filter.search_test, $options: "i" };
    }

    const aggregatePipeline = [
      {
        $lookup: {
          from: "users", // Assuming the User model name is 'users'
          localField: "userId",
          foreignField: "_id",
          as: "userId",
        },
      },
      { $unwind: "$userId" },
      { $match: matchStage },
      { $sort: { [sort]: 1 } },
      { $skip: skip },
      { $limit: limit },
    ];

    const countPipeline = [
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userId",
        },
      },
      { $unwind: "$userId" },
      { $match: matchStage },
      { $count: "total" },
    ];

    const [results, countResult] = await Promise.all([
      this.aggregate(aggregatePipeline),
      this.aggregate(countPipeline),
    ]);

    results.forEach((user) => {
      if (user.userId) {
        delete user.userId.password;
      }
    });

    const totalResults = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalResults / limit);

    return {
      results,
      page,
      limit,
      totalPages,
      totalResults,
    };
  };
};

module.exports = paginateCp;
