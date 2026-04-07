const dotenv = require("dotenv");
const path = require("path");
const Joi = require("joi");
const { en } = require("faker/lib/locales");

dotenv.config({ path: path.join(__dirname, "../../.env") });

const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string()
      .valid("production", "development", "test")
      .required(),
    PORT: Joi.number().default(3000),
    MONGODB_URL: Joi.string().required().description("Mongo DB url"),
    JWT_SECRET: Joi.string().required().description("JWT secret key"),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number()
      .default(30)
      .description("minutes after which access tokens expire"),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number()
      .default(30)
      .description("days after which refresh tokens expire"),
    JWT_RESET_PASSWORD_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description("minutes after which reset password token expires"),
    JWT_VERIFY_EMAIL_EXPIRATION_MINUTES: Joi.number()
      .default(10)
      .description("minutes after which verify email token expires"),
    SMTP_HOST: Joi.string().description("server that will send the emails"),
    SMTP_PORT: Joi.number().description("port to connect to the email server"),
    SMTP_USERNAME: Joi.string().description("username for email server"),
    SMTP_PASSWORD: Joi.string().description("password for email server"),
    EMAIL_FROM: Joi.string().description(
      "the from field in the emails sent by the app"
    ),
    ADMIN_EMAIL: Joi.string().description(
      "admin email address for notifications"
    ),
    STRIPE_SECRET_KEY: Joi.string().description(
      "Secret key for stripe payment gateway integration"
    ),
    STRIPE_ENDPOINT_SECRET: Joi.string().description(
      "Secret key for webhook request verification"
    ),
    AWS_S3_BUCKET_NAME: Joi.string().description("AWS S3 bucket name"),
    AWS_S3_PUBLIC_BUCKET_NAME: Joi.string().description(
      "AWS S3 public bucket name"
    ),
    AWS_S3_BUCKET_REGION: Joi.string().description("AWS S3 bucket region"),
    AWS_S3_ACCESS_KEY: Joi.string().description("AWS S3 access key"),
    AWS_S3_SECRET_ACCESS_KEY: Joi.string().description(
      "AWS S3 secret access key"
    ),
    AWS_S3_PRIVATE_FILE_DOWNLOAD_URL_EXPIRATION_TIME: Joi.number().description(
      "AWS S3 Private Bucket File Download URL expiration time"
    ),
    FIREBASE_SERVICE_ACCOUNT: Joi.string().description(
      "Firebase service account secret"
    ),
    GOOGLE_PLACES_API_KEY: Joi.string().description(
      "Google Places API key for fetching reviews"
    ),
    ENCRYPTION_KEY: Joi.string().description(
      "Encryption key for securing sensitive data"
    ),
    ENCRYPTION_IV: Joi.string().description("Encryption initialization vector"),
    CLIENT_URL: Joi.string().description(
      "Client application URL for redirects and links"
    ),
    QUOTATION_EXPIRY_DAYS: Joi.number()
      .default(30)
      .description("Number of days before quotations expire"),
    AIRTABLE_API_KEY: Joi.string().description(
      "Airtable API key for ops dashboard integration"
    ),
    AIRTABLE_BASE_ID: Joi.string().description(
      "Airtable base ID for bookings table"
    ),
    AIRTABLE_TABLE_NAME: Joi.string().description(
      "Airtable table name for bookings"
    ),
    SENDGRID_API_KEY: Joi.string().description(
      "SendGrid API key for email service"
    ),
    // Frame.io V4 Configuration
    FRAMEIO_TOKEN: Joi.string().description("Frame.io V4 developer token"),
    FRAMEIO_PROJECT_ID: Joi.string().description("Frame.io V4 project ID from next.frame.io URL"),
    // Adobe OAuth for Frame.io V4
    ADOBE_CLIENT_ID: Joi.string().description("Adobe Developer Console Client ID"),
    ADOBE_CLIENT_SECRET: Joi.string().description("Adobe Developer Console Client Secret"),
    ADOBE_REDIRECT_URI: Joi.string().description("Adobe OAuth Redirect URI"),
    FRAMEIO_AUTO_UPLOAD: Joi.boolean().default(false).description("Enable Frame.io auto-upload"),
  })
  .unknown();

const { value: envVars, error } = envVarsSchema
  .prefs({ errors: { label: "key" } })
  .validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

module.exports = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  mongoose: {
    url: envVars.MONGODB_URL + (envVars.NODE_ENV === "test" ? "-test" : ""),
    options: {},
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    accessExpirationMinutes: envVars.JWT_ACCESS_EXPIRATION_MINUTES,
    refreshExpirationDays: envVars.JWT_REFRESH_EXPIRATION_DAYS,
    resetPasswordExpirationMinutes:
      envVars.JWT_RESET_PASSWORD_EXPIRATION_MINUTES,
    verifyEmailExpirationMinutes: envVars.JWT_VERIFY_EMAIL_EXPIRATION_MINUTES,
  },
  email: {
    smtp: {
      host: envVars.SMTP_HOST,
      port: envVars.SMTP_PORT,
      auth: {
        user: envVars.SMTP_USERNAME,
        pass: envVars.SMTP_PASSWORD,
      },
    },
    from: envVars.EMAIL_FROM,
    adminEmail: envVars.ADMIN_EMAIL || "admin@beigecorporation.io",
  },
  stripe: {
    secretKey: envVars.STRIPE_SECRET_KEY,
    endpointSecret: envVars.STRIPE_ENDPOINT_SECRET,
  },
  aws: {
    s3: {
      bucketName: envVars.AWS_S3_BUCKET_NAME,
      publicBucketName: envVars.AWS_S3_PUBLIC_BUCKET_NAME,
      bucketRegion: envVars.AWS_S3_BUCKET_REGION,
      accessKeyId: envVars.AWS_S3_ACCESS_KEY,
      secretAccessKey: envVars.AWS_S3_SECRET_ACCESS_KEY,
      privateFileDownloadUrlExpirationTime:
        envVars.AWS_S3_PRIVATE_FILE_DOWNLOAD_URL_EXPIRATION_TIME,
    },
  },
  firebase: {
    serviceAccountSecret: envVars.FIREBASE_SERVICE_ACCOUNT,
  },
  //
  GCP: {
    bucketName: envVars.GCP_BUCKET_NAME,
    projectId: envVars.GCP_PROJECT_ID,
    keyFilename: envVars.GCP_KEY_FILE_NAME,
    cdnAdmins: envVars.CDN_ADMINS,
  },
  google: {
    placesApiKey: envVars.GOOGLE_PLACES_API_KEY,
  },
  encryption: {
    // For AES-256-CBC, key should be 32 bytes (or 64 hex chars)
    key:
      envVars.ENCRYPTION_KEY || "beigeSecretKey123456789012345678901234567890", // Default for development only
    // For AES-256-CBC, IV should be 16 bytes
    iv: envVars.ENCRYPTION_IV || "beigeSecretIv1234", // Default for development only
  },
  client: {
    url: envVars.CLIENT_URL || "http://localhost:3000",
  },
  quotation: {
    expiryDays: envVars.QUOTATION_EXPIRY_DAYS || 30,
  },
  airtable: {
    apiKey: envVars.AIRTABLE_API_KEY,
    baseId: envVars.AIRTABLE_BASE_ID,
    tableName: envVars.AIRTABLE_TABLE_NAME || "Bookings",
  },
  sendgrid: {
    apiKey: envVars.SENDGRID_API_KEY,
  },
  frameio: {
    token: envVars.FRAMEIO_TOKEN,
    projectId: envVars.FRAMEIO_PROJECT_ID,
    adobeClientId: envVars.ADOBE_CLIENT_ID,
    adobeClientSecret: envVars.ADOBE_CLIENT_SECRET,
    adobeRedirectUri: envVars.ADOBE_REDIRECT_URI || "http://localhost:5002/v1/frameio/oauth/callback",
    autoUpload: envVars.FRAMEIO_AUTO_UPLOAD || false,
  },
};
