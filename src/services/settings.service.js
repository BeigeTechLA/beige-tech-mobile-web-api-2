const { AlgoSetting, Settings } = require("../models");

/**
 * Retrieves the AlgoSetting document from the database.
 *
 * @returns {Promise<AlgoSetting>} A promise that resolves to the AlgoSetting document.
 */
const getAlgoSetting = async () => {
  const algoSetting = await AlgoSetting.findOne();
  return algoSetting;
};

/**
 * Retrieves search algorithm parameters from the database.
 *
 * @returns {Promise<Object>} A promise that resolves to search algorithm parameters.
 */
const getSearchAlgoParams = async () => {
  const algoSetting = await getAlgoSetting();
  return algoSetting?.search;
};

/**
 * Updates search algorithm parameters in the database.
 *
 * @param {Object} updateBody - The updated search algorithm parameters.
 * @returns {Promise<Object>} A promise that resolves to the updated search algorithm parameters.
 */
const updateSearchAlgoParams = async (updateBody) => {
  const algoParams = await getAlgoSetting();

  if (!algoParams) {
    const defaultAlgoParams = {
      content_type: 6,
      content_vertical: 4,
      vst: 4,
      avg_rating: 6,
      avg_response_time: 5,
    };

    const newAlgoParams = new AlgoSetting();
    newAlgoParams.search = { ...defaultAlgoParams, ...updateBody };
    await newAlgoParams.save();
    return newAlgoParams.search;
  }

  algoParams.search = { ...algoParams.search, ...updateBody };
  await algoParams.save();
  return algoParams?.search;
};
const createBasicSettings = async (settings) => {
  // Create a new Settings with the settings
  const allSettings = await Settings.create(settings);
  // Save the settings
  await allSettings.save();
  return allSettings;
};
const getSettingsById = async (id) => {
  return Settings.findById(id);
};
const updateSettingById = async (settingsId, updateBody) => {
  try {
    //Fetch and check settings
    const settings = await getSettingsById(settingsId);
    if (!settings) {
      throw new ApiError(httpStatus.NOT_FOUND, "Settings not found");
    }
    Object.assign(settings, updateBody);
    await settings.save();
    return settings;
  } catch (error) {
    if (error instanceof mongoose.CastError) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid Settings ID");
    }
    throw error;
  }
};
const getAllSettings = async () => {
  // const orders = await Order.paginate(filter, options);
  const allSettings = await Settings.find();
  return allSettings;
};
module.exports = {
  getSearchAlgoParams,
  updateSearchAlgoParams,
  createBasicSettings,
  updateSettingById,
  getAllSettings,
};
