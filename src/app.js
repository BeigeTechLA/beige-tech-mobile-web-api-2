const express = require("express");
const bodyParser = require("body-parser");
const helmet = require("helmet");
const xss = require("xss-clean");
const mongoSanitize = require("express-mongo-sanitize");
const compression = require("compression");
const cors = require("cors");
const passport = require("passport");
const httpStatus = require("http-status");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const config = require("./config/config");
const morgan = require("./config/morgan");
const passportStrategies = require("./config/passport");
const { authLimiter } = require("./middlewares/rateLimiter");
const routes = require("./routes/v1");
const { errorConverter, errorHandler } = require("./middlewares/error");
const ApiError = require("./utils/ApiError");
const monitoringService = require("./services/monitoring.service");

const app = express();

// Initialize monitoring (Sentry) early in the app lifecycle
monitoringService.initialize();

// Sentry request tracking must be the first middleware
app.use(monitoringService.getRequestHandler());
app.use(monitoringService.getTracingHandler());

// ✅ Enable CORS for all environments
const allowedOrigins = [
  "http://localhost:3000",
  "http://172.26.144.1:3000",
  "https://beige-v2.luminousdemo.com",
  "https://beige.app",
  "https://www.beige.app",
  "https://staging.beige.app",
  "https://app-staging.beige.app",
  "https://api-staging.beige.app",
  "https://app.beige.app",
  config.client.url, // Include environment variable for client URL
].filter(Boolean); // Remove undefined values

// CORS configuration with proper origin validation
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    //---------
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-test-webhook",
    "stripe-signature",
    "sec-ch-ua",
    "sec-ch-ua-mobile",
    "sec-ch-ua-platform",
  ],
  credentials: true,
  optionsSuccessStatus: 200, // Some legacy browsers (IE11) choke on 204
  maxAge: 86400, // Cache preflight response for 24 hours
};

// Apply CORS to all environments
app.use(cors(corsOptions));

if (config.env !== "test") {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

// Set security HTTP headers
app.use(helmet());

// IMPORTANT: Stripe webhook route must be registered BEFORE body parsing middleware
const stripeWebhookRoute = require("./routes/v1/stripe-webhook.route");
app.use("/v1/stripe", stripeWebhookRoute);

// Parse JSON request bodies
app.use(express.json());

// Parse URL-encoded request bodies
app.use(express.urlencoded({ extended: true }));

// Sanitize request data
app.use(xss());
app.use(mongoSanitize());

// Gzip compression
app.use(compression());

// JWT authentication and OAuth strategies
app.use(passport.initialize());
passport.use("jwt", passportStrategies.jwtStrategy);

// Only configure OAuth strategies if they are available
if (passportStrategies.googleStrategy) {
  passport.use("google", passportStrategies.googleStrategy);
}

if (passportStrategies.facebookStrategy) {
  passport.use("facebook", passportStrategies.facebookStrategy);
}

// Rate limit login attempts in production
if (config.env === "production") {
  app.use("/v1/auth", authLimiter);
}

// Handle favicon.ico requests with 204
app.get("/favicon.ico", (req, res) => res.status(204).end());

// Swagger configuration
const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Beige Backend API Documentation",
    version: "1.0.0",
    description: "API documentation for Beige platform backend services",
    license: {
      name: "MIT",
      url: "https://opensource.org/licenses/MIT",
    },
  },
  servers: [
    {
      url: `http://localhost:${config.port}/v1`,
      description: "Development server",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
};

const options = {
  swaggerDefinition,
  apis: ["src/docs/*.yml", "src/routes/v1/*.js"],
};

const specs = swaggerJsdoc(options);

// Swagger UI setup
app.use("/api-docs", swaggerUi.serve);
app.get(
  "/api-docs",
  swaggerUi.setup(specs, {
    explorer: true,
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "Beige API Documentation",
  })
);

// API routes
app.use("/v1", routes);

// Catch-all for unknown routes
app.use((req, res) => {
  console.log(`Unknown route accessed: ${req.method} ${req.originalUrl}`);
  res.status(httpStatus.NOT_FOUND).json({
    status: "error",
    message: "Route not found",
  });
});

// Error converters and handlers
app.use(errorConverter);

// Sentry error handler must be before other error handlers
app.use(monitoringService.getErrorHandler());

app.use(errorHandler);

module.exports = app;