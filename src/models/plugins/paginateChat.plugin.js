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
      const searchRoomIds = filter.search_room_ids || [];
      searchQuery = {
        $or: [
          { name: { $regex: filter.search, $options: "i" } },
          { chat_id: { $regex: filter.search, $options: "i" } },
          { external_order_ref: { $regex: filter.search, $options: "i" } },
          { "client_snapshot.name": { $regex: filter.search, $options: "i" } },
          { "client_snapshot.email": { $regex: filter.search, $options: "i" } },
          { "client_ids.name": { $regex: filter.search, $options: "i" } },
          { "client_ids.email": { $regex: filter.search, $options: "i" } },
          ...(searchRoomIds.length ? [{ _id: { $in: searchRoomIds } }] : []),
        ],
      };
      delete filter.search;
      delete filter.search_room_ids;
    }

    const query = Object.keys(searchQuery).length && filter.$or
      ? { $and: [filter, searchQuery] }
      : { ...filter, ...searchQuery };

    const countPromise = this.countDocuments(query).exec();
    let docsPromise = this.find(query)
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
