const config = require("../config/config");
const AWS = require("aws-sdk");
const s3Config = config.aws.s3;

//Configure AWS
AWS.config.update({
    accessKeyId: s3Config.accessKeyId,
    secretAccessKey: s3Config.secretAccessKey,
    region: s3Config.bucketRegion
});

//Initiate operation variables
const s3 = new AWS.S3();

module.exports = {
    s3,
    s3Config
};