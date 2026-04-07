const paginateChat = (schema) => {
  schema.statics.paginateChat = async function (filter, options) {
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

    let searchQuery = {};
    if (filter.search) {
      searchQuery = {
        $or: [
          { name: { $regex: filter.search, $options: "i" } },
          { chat_id: { $regex: filter.search, $options: "i" } },
        ],
      };
      delete filter.search;
    }

    const countPromise = this.countDocuments({
      ...filter,
      ...searchQuery,
    }).exec();
    let docsPromise = this.find({ ...filter, ...searchQuery })
      .sort(sort)
      .skip(skip)
      .limit(limit);

    if (options.populate) {
      options.populate.split(",").forEach((populateOption) => {
        docsPromise = docsPromise.populate(
          populateOption
            .split(".")
            .reverse()
            .reduce((a, b) => ({ path: b, populate: a }))
        );
      });
    }

    docsPromise = docsPromise.exec();

    return Promise.all([countPromise, docsPromise]).then(async (values) => {
      const [totalResults, results] = values;

      // Filter results based on order_name or chat name if search is provided
      if (options.search) {
        const searchLower = options.search.toLowerCase();
        const filteredResults = results.filter(
          (doc) =>
            // Search by new chat name field
            (doc.name && doc.name.toLowerCase().includes(searchLower)) ||
            // Search by chat_id
            (doc.chat_id && doc.chat_id.includes(options.search)) ||
            // Fallback to order_name search
            (doc.order_id &&
              doc.order_id.order_name &&
              doc.order_id.order_name.toLowerCase().includes(searchLower))
        );

        const totalFilteredResults = filteredResults.length;
        const totalFilteredPages = Math.ceil(totalFilteredResults / limit);

        return {
          results: filteredResults,
          page,
          limit,
          totalPages: totalFilteredPages,
          totalResults: totalFilteredResults,
        };
      }

      const totalPages = Math.ceil(totalResults / limit);
      return {
        results,
        page,
        limit,
        totalPages,
        totalResults,
      };
    });
  };
};

module.exports = paginateChat;
