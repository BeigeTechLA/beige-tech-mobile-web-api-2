const { S3Client } = require("@aws-sdk/client-s3");
const config = require("../config/config");

// Set the AWS Region.
const REGION = "REGION"; //e.g. "us-east-1"
// Create an Amazon S3 service client object.
const s3 = new S3Client({
  credentials: {
    accessKeyId: config.aws.s3.accessKeyId,
    secretAccessKey: config.aws.s3.secretAccessKey,
  },
  region: config.aws.s3.bucketRegion,
});

module.exports = { s3 };
