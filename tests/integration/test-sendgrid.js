// using Twilio SendGrid's v3 Node.js Library
// https://github.com/sendgrid/sendgrid-nodejs
require("dotenv").config(); // Load environment variables
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
// sgMail.setDataResidency('eu');
// uncomment the above line if you are sending mail using a regional EU subuser

const msg = {
  to: "ali@beigecorporation.io", // Change to your recipient
  from: "noreply@beige.app", // Change to your verified sender
  subject: "Sending with SendGrid is Fun",
  text: "and easy to do anywhere, even with Node.js",
  html: "<strong>and easy to do anywhere, even with Node.js</strong>",
};
sgMail
  .send(msg)
  .then(() => {
    console.log("Email sent");
  })
  .catch((error) => {
    console.error(error);
  });

// // sendgrid-test.js
// require("dotenv").config(); // Load environment variables
// const sgMail = require("@sendgrid/mail");

// // Set API key
// sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// const testEmail = async () => {
//   const msg = {
//     to: "your-email@example.com", // Replace with your actual email
//     from: "noreply@beige.app", // Must be your verified sender
//     subject: "Beige SendGrid Test - " + new Date().toLocaleString(),
//     text: "This is a test email from Beige app SendGrid integration!",
//     html: `
//       <h2>🎬 Beige SendGrid Test</h2>
//       <p>This is a test email from your Beige app SendGrid integration!</p>
//       <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
//       <p>If you received this, your SendGrid setup is working correctly! ✅</p>
//     `,
//   };

//   try {
//     await sgMail.send(msg);
//     console.log("✅ Email sent successfully!");
//     console.log("Check your inbox for the test email.");
//   } catch (error) {
//     console.error("❌ Error sending email:");
//     console.error(error.response ? error.response.body : error);
//   }
// };

// // Run the test
// testEmail();

// using Twilio SendGrid's v3 Node.js Library
// https://github.com/sendgrid/sendgrid-nodejs
// require("dotenv").config();
// const sgMail = require("@sendgrid/mail");

// sgMail.setApiKey(process.env.SENDGRID_API_KEY);
// // sgMail.setDataResidency('eu');
// // uncomment the above line if you are sending mail using a regional EU subuser

// const msg = {
//   to: "ali@beigecorporation.io", // Change to your actual email
//   from: "ai@beigecorporation.io", // Must be your verified sender
//   subject: "Beige SendGrid Test - " + new Date().toLocaleString(),
//   text: "This is a test email from Beige app SendGrid integration!",
//   html: `
//     <h2>🎬 Beige SendGrid Test</h2>
//     <p>This is a test email from your Beige app SendGrid integration!</p>
//     <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
//     <p>If you received this, your SendGrid setup is working correctly! ✅</p>
//   `,
// };
// sgMail
//   .send(msg)
//   .then(() => {
//     console.log("Email sent");
//   })
//   .catch((error) => {
//     console.error(error);
//   });
