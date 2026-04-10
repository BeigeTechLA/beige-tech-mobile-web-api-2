// const firebase = require("firebase-admin");
// const config = require("../config/config");

// const firebaseAdminConfig = JSON.parse(config.firebase.serviceAccountSecret);

// firebase.initializeApp({
//     credential: firebase.credential.cert(firebaseAdminConfig),
// });

// module.exports = firebase;
const firebase = require("firebase-admin");
const path = require("path");

// Load JSON file directly (BEST WAY)
const serviceAccount = require(
  path.join(__dirname, "../../beige-app-bf2a39a93d2e.json")
);

firebase.initializeApp({
  credential: firebase.credential.cert(serviceAccount),
});

module.exports = firebase;