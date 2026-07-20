const express = require('express');
const internalPushController = require('../../controllers/internalPush.controller');
const internalApiKey = require('../../middlewares/internalApiKey');

const router = express.Router();

router.use(internalApiKey);

router.post('/tokens', internalPushController.saveToken);
router.delete('/tokens', internalPushController.removeToken);
router.patch('/preferences', internalPushController.updatePreferences);
router.post('/send', internalPushController.sendNotification);

module.exports = router;
