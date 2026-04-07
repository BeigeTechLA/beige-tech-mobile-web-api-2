const express = require("express");
const authRoute = require("./auth.route");
const userRoute = require("./user.route");
const docsRoute = require("./docs.route");
const config = require("../../config/config");
const testRoute = require("./test.route");
const cpRoute = require("./cp.route");
const orderRoute = require("./order.route");
const bookingRoute = require("./booking.route");
const chatRoute = require("./chat.route");
const disputeRoute = require("./dispute.route");
const meetingRoute = require("./meeting.route");
const settingsRoute = require("./settings.route");
const fileRoute = require("./file.route");
const fileCommentRoute = require("./fileComment.route");
const ratingRoute = require("./rating.route");
const paymentRoute = require("./payment.route");
const algoRoute = require("./algo.route");
const pricing = require("./pricing.route");
const addOns = require("./addOns.route");
const availability = require("./cpAvailability.route");
const bankInfo = require("./bankInfo.route");
const payout = require("./payout.route");
const review = require("./review.route");
const reviewRequestRoute = require("./reviewRequest.route");
const meetToken = require("./meet.route");
const gcpFileRoute = require("./gcpFile.route");
const roleRoute = require("./role.route");
const permissionRoute = require("./permission.route");
const supportRoute = require("./support.route");
const notificationRoute = require("./notification.route");
const notificationSettings = require("./notificationSettings.route");
const errorRoute = require("./error.route");
const statistics = require("./statistics.route");
const dashboard = require("./dashboard.route");
const billingRoute = require("./billing.route");
const blogRoute = require("./blog.route");
const publicBlogRoute = require("./public.blog.route");
const profileCompletionRoute = require("./profileCompletion.route");
const publicRoute = require("./public.route");
const satisfactionRoute = require("./satisfaction.route");
const googleReviewRoute = require("./googleReview.route");
const leadRoute = require('./lead.routes');
const taskRoute = require('./task.routes');
const noteRoute = require('./note.routes');
const quotationRoute = require('./quotation.routes');
const orderStatusRoute = require('./orderStatus.route');
const faqRoute = require('./faq.route');
const serviceIncludesRoute = require('./serviceIncludes.route');
const shootTypeRoute = require('./shootType.route');
const publicShootTypeRoute = require('./public.shootType.route');
const stripeRoute = require('./stripe.route');
const airtableRoute = require('./airtable.route');
const emailTestRoute = require('./email-test.route');
const healthRoute = require('./health.route');
const analyticsRoute = require('./analytics.route');
const monitoringRoute = require('./monitoring.route');
const globalFeeRoute = require('./globalFee.route');
const transactionRoute = require('./transaction.route');
const portfolioRoute = require('./portfolio.route');
const frameioRoute = require('./frameio.route');
const encryptionRoute = require('./encryption.route');
const externalFileManagerRoute = require('./externalFileManager.route');
const externalChatRoute = require('./externalChat.route');
const externalMeetingsRoute = require('./externalMeetings.route');

const router = express.Router();

const defaultRoutes = [
  {
    path: "/auth",
    route: authRoute,
  },
  {
    path: "/users",
    route: userRoute,
  },
  {
    path: "/test",
    route: testRoute,
  },
  {
    path: "/cp",
    route: cpRoute,
  },
  {
    path: "/orders",
    route: orderRoute,
  },
  {
    path: "/bookings",
    route: bookingRoute,
  },
  {
    path: "/chats",
    route: chatRoute,
  },
  {
    path: "/disputes",
    route: disputeRoute,
  },
  {
    path: "/files",
    route: fileRoute,
  },
  {
    path: "/meetings",
    route: meetingRoute,
  },
  {
    path: "/algo",
    route: algoRoute,
  },
  {
    path: "/rating",
    route: ratingRoute,
  },
  {
    path: "/payments",
    route: paymentRoute,
  },
  {
    path: "/settings",
    route: settingsRoute,
  },
  {
    path: "/prices",
    route: pricing,
  },
  {
    path: "/addOns",
    route: addOns,
  },
  {
    path: "/availability",
    route: availability,
  },
  {
    path: "/bankInfo",
    route: bankInfo,
  },
  {
    path: "/payout",
    route: payout,
  },
  {
    path: "/review",
    route: review,
  },
  {
    path: "/review-request",
    route: reviewRequestRoute,
  },
  {
    path: "/create-event",
    route: meetToken,
  },
  {
    path: "/gcp",
    route: gcpFileRoute,
  },
  {
    path: "/external-file-manager",
    route: externalFileManagerRoute,
  },
  {
    path: "/external-chat",
    route: externalChatRoute,
  },
  {
    path: "/external-meetings",
    route: externalMeetingsRoute,
  },
  {
    path: "/roles",
    route: roleRoute,
  },
  {
    path: "/permissions",
    route: permissionRoute,
  },
  {
    path: "/support",
    route: supportRoute,
  },
  {
    path: "/notifications",
    route: notificationRoute,
  },
  {
    path: "/notificationSetting",
    route: notificationSettings,
  },
  {
    path: "/error",
    route: errorRoute,
  },
  {
    path: "/statistics",
    route: statistics,
  },
  {
    path: "/dashboard",
    route: dashboard,
  },
  {
    path: "/billings",
    route: billingRoute,
  },
  {
    path: "/comments",
    route: fileCommentRoute,
  },
  {
    path: "/blogs",
    route: blogRoute,
  },
  {
    path: "/api",
    route: publicBlogRoute,
  },
  {
    path: "/profile-completion",
    route: profileCompletionRoute,
  },
  {
    path: "/api/public",
    route: publicRoute,
  },
  {
    path: "/satisfaction",
    route: satisfactionRoute,
  },
  {
    path: "/google-reviews",
    route: googleReviewRoute,
  },
  {
    path: '/leads',
    route: leadRoute,
  },
  {
    path: '/quotations',
    route: quotationRoute,
  },
  {
    path: '/tasks',
    route: taskRoute,
  },
  {
    path: '/notes',
    route: noteRoute,
  },
  {
    path: '/',
    route: orderStatusRoute,
  },
  {
    path: '/faq',
    route: faqRoute,
  },
  {
    path: '/service-includes',
    route: serviceIncludesRoute,
  },
  {
    path: '/shoot-types',
    route: shootTypeRoute,
  },
  {
    path: '/public',
    route: publicShootTypeRoute,
  },
  {
    path: '/stripe',
    route: stripeRoute,
  },
  {
    path: '/airtable',
    route: airtableRoute,
  },
  {
    path: '/health',
    route: healthRoute,
  },
  {
    path: '/analytics',
    route: analyticsRoute,
  },
  {
    path: '/monitoring',
    route: monitoringRoute,
  },
  {
    path: '/global-fees',
    route: globalFeeRoute,
  },
  {
    path: '/transactions',
    route: transactionRoute,
  },
  {
    path: '/portfolios',
    route: portfolioRoute,
  },
  {
    path: '/frameio',
    route: frameioRoute,
  },
  {
    path: '/encryption',
    route: encryptionRoute,
  },
];
errorRoute;
const devRoutes = [
  // routes available only in development mode
  {
    path: "/docs",
    route: docsRoute,
  },
  {
    path: "/email-test",
    route: emailTestRoute,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

/* istanbul ignore next */
if (config.env === "development") {
  devRoutes.forEach((route) => {
    router.use(route.path, route.route);
  });
}

module.exports = router;
