const fs = require('fs').promises;
const path = require('path');

const logDirectory = path.resolve(process.env.PUSH_NOTIFICATION_LOG_DIR || path.resolve(__dirname, '../../logs/push-notifications'));
const minuteMilliseconds = 60 * 1000;
const retentionMilliseconds = 60 * minuteMilliseconds;

const minuteFileName = (date) => `${date.toISOString().slice(0, 16).replace(':', '-')}.jsonl`;

const removeExpiredLogs = async () => {
  try {
    const files = await fs.readdir(logDirectory);
    const now = Date.now();

    await Promise.all(files.map(async (file) => {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}\.jsonl$/.test(file)) return;
      const filePath = path.join(logDirectory, file);
      const { mtimeMs } = await fs.stat(filePath);
      if (now - mtimeMs >= retentionMilliseconds) await fs.unlink(filePath);
    }));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('[PushLog] Could not remove expired logs:', error);
    }
  }
};

const writePushNotificationLog = async (details) => {
  try {
    const timestamp = new Date();
    await fs.mkdir(logDirectory, { recursive: true });
    await fs.appendFile(
      path.join(logDirectory, minuteFileName(timestamp)),
      `${JSON.stringify({ timestamp: timestamp.toISOString(), ...details })}\n`,
      { mode: 0o600 }
    );
  } catch (error) {
    console.error('[PushLog] Could not write push notification log:', error);
  }
};

removeExpiredLogs();
const cleanupTimer = setInterval(removeExpiredLogs, minuteMilliseconds);
cleanupTimer.unref();

module.exports = { writePushNotificationLog, removeExpiredLogs };
