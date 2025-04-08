// import { getV4UUID } from "./helpers.js";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import * as dotenv from "dotenv";

dotenv.config();

const REGION = "us-east-1";

const s3Client = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// const storeCookieAsSecretKey = async (key, cookie) => {
//   const secretValue = JSON.stringify({
//     cookie: cookie,
//   });
//   try {
//     const putObjectParams = {
//       Bucket: process.env.bucketName,
//       Key: key,
//       Body: secretValue,
//     };
//     const command = new PutObjectCommand(putObjectParams);
//     await s3Client.send(command);
//     console.log(
//       `secret key uploaded successfully to s3 ${process.env.bucketName}/${key}`
//     );
//   } catch (error) {
//     console.error("Error uploading string to S3:", error.message);
//     throw error;
//   }
// };

// const retrieveStoredCookie = async (userId) => {
//   try {
//     const getObjectParams = {
//       Bucket: process.env.bucketName,
//       Key: userId,
//     };
//     const command = new GetObjectCommand(getObjectParams);
//     const response = await s3Client.send(command);

//     // Convert the stream to a string and then parse it as JSON
//     const fileContent = await streamToString(response.Body);
//     const secretObject = JSON.parse(fileContent);
//     return secretObject;
//   } catch (error) {
//     console.error("Error retrieving content from S3:", error.message);
//     throw error;
//   }
// };

// Utility function to convert a readable stream to a string
async function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", reject);
  });
}

export // storeCookieAsSecretKey,
// updateStoredCookie,
// retrieveStoredCookie,
 {};
