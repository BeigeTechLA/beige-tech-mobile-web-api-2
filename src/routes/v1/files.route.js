const express = require("express");
const multer = require("multer");
const { s3 } = require("../../aws/s3client");
const router = express.Router();
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const config = require("../../config/config");
const { v4: uuidv4 } = require("uuid");

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router
  .route("/")
  .get((req, res) => {
    res.send({ data: "get ok!" });
  })
  .post((req, res) => {
    res.send({ data: "post ok!" });
  });

router.route("/upload/").post(upload.single("image"), async (req, res) => {
  //Create a unique file name
  const fileName = `folder1/${uuidv4()}-${req.file.originalname}`;

  const params = {
    Bucket: config.aws.s3.bucketName, // The name of the bucket. For example, 'sample-bucket-101'.
    Key: fileName, // The name of the object. For example, 'sample_upload.txt'.
    Body: req.file.buffer, // The content of the object. For example, 'Hello world!".
    ContentType: req.file.mimetype,
  };

  const command = new PutObjectCommand(params);

  const data = await s3.send(command);

  res.send({ data: fileName });
});

router
  .route("/public/upload/")
  .post(upload.single("image"), async (req, res) => {
    //Create a unique file name
    const fileName = `${uuidv4()}-${req.file.originalname}`;

    const params = {
      Bucket: config.aws.s3.publicBucketName, // The name of the bucket. For example, 'sample-bucket-101'.
      Key: fileName, // The name of the object. For example, 'sample_upload.txt'.
      Body: req.file.buffer, // The content of the object. For example, 'Hello world!".
      ContentType: req.file.mimetype,
    };

    const command = new PutObjectCommand(params);

    const data = await s3.send(command);
    const filePath = `https://${config.aws.s3.publicBucketName}.s3.${config.aws.s3.bucketRegion}.amazonaws.com/${fileName}`;

    res.send({ data: filePath });
  });

module.exports = router;
