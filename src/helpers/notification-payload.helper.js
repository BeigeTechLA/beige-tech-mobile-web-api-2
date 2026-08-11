const normalizeString = (value) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
};

const stringifyDataPayload = (data = {}) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};

  return Object.entries(data).reduce((payload, [key, value]) => {
    if (value == null) return payload;
    payload[String(key)] = typeof value === 'string' ? value : JSON.stringify(value);
    return payload;
  }, {});
};

const buildFcmHttpV1Payload = ({ token, title, body, data = {} }) => {
  const normalizedToken = normalizeString(token);
  const normalizedTitle = normalizeString(title);
  const normalizedBody = normalizeString(body);
  const normalizedData = stringifyDataPayload(data);

  if (!normalizedToken) {
    throw new Error('FCM token is required.');
  }

  const message = { token: normalizedToken };

  if (normalizedTitle || normalizedBody) {
    message.notification = {};
    if (normalizedTitle) message.notification.title = normalizedTitle;
    if (normalizedBody) message.notification.body = normalizedBody;
  }

  if (Object.keys(normalizedData).length) {
    message.data = normalizedData;
  }

  if (!message.notification && !message.data) {
    throw new Error('notification or data payload is required.');
  }

  return { message };
};

module.exports = {
  buildFcmHttpV1Payload,
};
