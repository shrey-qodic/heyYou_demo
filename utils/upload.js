import * as dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadScreenshot = async (screenshot) => {
  try {
    const photoUrl = await cloudinary.uploader.upload(screenshot.toString());
    return photoUrl;
  } catch (error) {
    console.log("uploadScreenshot: error", { errorMessage: error?.message });
    return null;
  }
};

const uploadScreenshotViaStream = (screenshot) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {};
    cloudinary.uploader
      .upload_stream(uploadOptions, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      })
      .end(screenshot);
  });
};

export { uploadScreenshot, uploadScreenshotViaStream };
