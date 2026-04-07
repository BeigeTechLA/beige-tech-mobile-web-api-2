const mongoose = require("mongoose");
const app = require("./app");
const config = require("./config/config");
const logger = require("./config/logger");
const http = require("http");
const cron = require("node-cron");
const { startSocketServer } = require("./services/socket.service");
const { checkAndReassignPendingOrders, updateOrderStatusByShootDate } = require("./services/cron.service");

//Create socket io and initialize server
let server = http.createServer(app);
// teestsss
//Start socket functionality
startSocketServer(server);

//End socket functionality

mongoose.connect(config.mongoose.url, config.mongoose.options).then(() => {
  logger.info(`Successfully Connected to MongoDB  `);
  server.listen(config.port, '0.0.0.0', () => {
    logger.info(`Listening to port ${config.port} on all network interfaces (LAN accessible)`);
  });

  // Initialize cron jobs
  // Run every hour to check for orders with pending CPs that haven't accepted within 3 hours
  cron.schedule("0 * * * *", async () => {
    logger.info("Running hourly cron job: Check and reassign pending orders");
    try {
      await checkAndReassignPendingOrders();
    } catch (error) {
      logger.error("Error in checkAndReassignPendingOrders cron job:", error);
    }
  });

  // Run every hour to update order status based on shoot dates
  cron.schedule("0 * * * *", async () => {
    logger.info("Running hourly cron job: Update order status by shoot date");
    try {
      await updateOrderStatusByShootDate();
    } catch (error) {
      logger.error("Error in updateOrderStatusByShootDate cron job:", error);
    }
  });

  logger.info("Cron jobs initialized successfully");
});

const exitHandler = () => {
  if (server) {
    server.close(() => {
      logger.info("Server closed");
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
};

const unexpectedErrorHandler = (error) => {
  logger.error(error);
  exitHandler();
};

process.on("uncaughtException", unexpectedErrorHandler);
process.on("unhandledRejection", unexpectedErrorHandler);

process.on("SIGTERM", () => {
  logger.info("SIGTERM received");
  if (server) {
    server.close();
  }
});