const firebase = require("firebase-admin");
const config = require("../config/config");

const firebaseAdminConfig = JSON.parse(config.firebase.serviceAccountSecret);

firebase.initializeApp({
    credential: firebase.credential.cert(firebaseAdminConfig),
});

module.exports = firebase;