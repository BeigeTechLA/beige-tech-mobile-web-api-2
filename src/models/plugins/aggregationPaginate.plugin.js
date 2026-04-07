/* eslint-disable no-param-reassign */

const aggregationPaginate = (schema) => {
  /**
   * @typedef {Object} QueryResult
   * @property {Document[]} results - Results found
   * @property {number} page - Current page
   * @property {number} limit - Maximum number of results per page
   * @property {number} totalPages - Total number of pages
   * @property {number} totalResults - Total number of documents
   */
  /**
   * Aggregate and paginate results
   * @param {Array} aggregationPipeline - Array of aggregation stages
   * @param {Object} options - Pagination and sorting options
   * @param {string} [options.sortBy] - Sorting criteria using the format: sortField:(desc|asc). Multiple sorting criteria should be separated by commas (,)
   * @param {number} [options.limit] - Maximum number of results per page (default = 10)
   * @param {number} [options.page] - Current page (default = 1)
   * @returns {Promise<QueryResult>}
   */
  schema.statics.aggregatePaginate = async function (aggregationPipeline, options) {
    const page = parseInt(options.page) || 1;
    const limit = parseInt(options.limit) || 10;
    const skip = (page - 1) * limit;

    const countPipeline = [...aggregationPipeline, { $count: 'count' }];
    const countResult = await this.aggregate(countPipeline);

    const totalResults = countResult.length > 0 ? countResult[0].count : 0;
    const totalPages = Math.ceil(totalResults / limit);

    const sort = options.sortBy
      ? options.sortBy.split(',').reduce((sortObj, sortOption) => {
        const [key, order] = sortOption.split(':');
        if (order !== 'asc' && order !== 'desc') {
          throw new Error('Invalid sorting direction');
        }
        sortObj[key] = order === 'desc' ? -1 : 1;
        return sortObj;
      }, {})
      : { createdAt: 1 };

    aggregationPipeline.push(
      { $sort: sort },
      { $skip: skip },
      { $limit: limit }
    );

    const results = await this.aggregate(aggregationPipeline);

    return {
      results,
      page,
      limit,
      totalPages,
      totalResults,
    };
  };
};

module.exports = aggregationPaginate;
