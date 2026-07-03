const mongoose = require("mongoose");
const config = require("../src/config/config");
const productionFolderService = require("../src/services/productionFolder.service");

const FILTERS = [
  "post_production_raw_footages",
  "post_production_edits",
  "post_production_final_deliverables",
];

const printResult = (result) => {
  console.log(`\nproduction_filter=${result.production_filter}`);
  console.log("evaluated FileMeta rows:");

  result.evaluatedFileMeta.forEach((row) => {
    const status = row.included ? "INCLUDED" : "EXCLUDED";
    const location = row.path || row.fullPath || row.key || row.fileName || row.name || "";
    console.log(
      `- ${status} | fileMeta=${row.id} | projectId=${row.extractedProjectId || ""} | isFolder=${row.isFolder} | contentType=${row.contentType || ""} | reason=${row.reason} | ${location}`
    );
  });

  console.log("matched FileMeta ids:", result.matchedFileMeta.map((row) => row.id));
  console.log("final matched IDs:", result.matchedIds);
};

const main = async () => {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);

  const requestedFilter = process.argv[2];
  const filters = requestedFilter ? [requestedFilter] : FILTERS;

  for (const productionFilter of filters) {
    const result = await productionFolderService.getProductionFolderMatches(productionFilter, { includeRows: true });
    printResult(result);
  }

  await mongoose.disconnect();
};

if (require.main === module) {
  main().catch(async (error) => {
    console.error(error);
    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      // Ignore disconnect errors during failure cleanup.
    }
    process.exit(1);
  });
}
