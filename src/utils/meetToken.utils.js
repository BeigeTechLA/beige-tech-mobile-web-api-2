const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

const trimTrailingSlash = (value = "") => value.replace(/\/+$/, "");

const buildLocalBackendUrl = () => {
  const host = process.env.HOST || "localhost";
  const port = process.env.PORT || "5002";
  return `http://${host}:${port}`;
};

const buildRedirectUris = () => {
  const localBackendUrl = trimTrailingSlash(buildLocalBackendUrl());
  const configuredBackendUrl = trimTrailingSlash(process.env.BACKEND_URL || "");
  const normalizedConfiguredBackendUrl =
    configuredBackendUrl && /^https?:\/\//i.test(configuredBackendUrl)
      ? configuredBackendUrl
      : configuredBackendUrl
        ? `https://${configuredBackendUrl}`
        : "";

  return [
    `${localBackendUrl}/v1/create-event`,
    normalizedConfiguredBackendUrl
      ? `${normalizedConfiguredBackendUrl}/v1/create-event`
      : null,
  ].filter(Boolean);
};

const credentials = {
  installed: {
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID,
    client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRETE,
    redirect_uris: buildRedirectUris(),
  },
};

module.exports = {
  SCOPES,
  credentials,
};
