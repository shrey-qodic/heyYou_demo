import * as Sentry from "@sentry/node";
import { getTokensFromCode } from "../utils/zoho/zohoAuth.js";
import { generateVideo } from "../utils/marketingVideo.js";
import {
  searchAccount,
  createAccount,
  EditAccountInZoho,
} from "../utils/zoho/zohoServices.js";
import dotenv from "dotenv";
import logGracefulMessage from "../utils/logGracefulMessage.js";

dotenv.config();

var REFRESH_TOKEN = process.env.REFRESH_TOKEN;

const zohoCallback = async (req, res) => {
  const code = req.query.code;

  if (!code) {
    res.send("Code not provided");
    return;
  }
  try {
    const tokens = await getTokensFromCode(code);
    // console.log(tokens);
    REFRESH_TOKEN = tokens.refresh_token; // Save the golden key
    res.send("Golden key received and saved!");
  } catch (error) {
    Sentry.captureException(error);
    if (error.response) {
      logGracefulMessage({
        status: "Error",
        message: `${error?.message}`,
        userId: ``,
        accountId: ``,
        method: `zohoCallBack`,
      });
    }
    res.send("Oops! Something went wrong.");
  }
};

const editMainContact = async (req, res) => {
  const { mainContact, recordId } = req.body;
  try {
    const leadData = {
      Main_Contact: mainContact,
    };
    const results = await EditAccountInZoho(recordId, leadData);
    logGracefulMessage({
      status: "Success",
      message: `Contact edited successfully`,
      method: `editMainContact`,
      userId: `${mainContact?._id}`,
      accountId: `${mainContact?.accountId}`,
    });
    res.send(results);
  } catch (e) {
    Sentry.captureException(error);

    logGracefulMessage({
      status: "Error",
      message: `${e?.message}`,
      method: `editMainContact`,
      userId: `${req?.body?.mainContact?._id}`,
      accountId: `${req?.body?.mainContact?.accountId}`,
    });
    res.send("ERROR - Something haapend");
  }
};

const marketingExtenstion = async (req, res) => {
  try {
    const data = req.body;
    const leadData = {
      Account_Name: data.companyName,
      Company_Name: data.companyName,
      "Account Photo": data.img,
      Company_Size: data.companySize,
      Industry_By_Linkedin: data.industry,
      Employees_Count: data.employeesCountLI,
      Followers: data.followers?.toString(),
      video: data.video,
      website2: data.website,
      avg_Employees_Likes: data.postsStatistic.avgEmployeeLikes?.toString(),
      avg_Likes: data.postsStatistic.avgLikes?.toString(),
      avg_Reposts: data.postsStatistic.avgReposts?.toString(),
      max_Employee_Likes: data.postsStatistic.maxEmployeeLikes?.toString(),
      max_Likes: data.postsStatistic.maxLikes?.toString(),
      max_Reposts: data.postsStatistic.maxReposts?.toString(),
      min_Employee_Likes: data.postsStatistic.minEmployeeLikes?.toString(),
      min_Likes: data.postsStatistic.minLikes?.toString(),
      min_Reposts: data.postsStatistic.minReposts?.toString(),
      Generated_Video: "",
      Manager_Editor_Video: "",
    };

    let zohoAccountId;
    try {
      zohoAccountId = await searchAccount(data.companyName);
    } catch (e) {
      Sentry.captureException(error);

      logGracefulMessage({
        status: "Error",
        message: `${e?.message}`,
        method: `marketingExtenstion`,
        userId: `${data?._id}`,
        accountId: `${data?.accountId}`,
      });
    }
    if (zohoAccountId) {
      // console.log("Found record ID:", zohoAccountId);

      const generatedVideoId = await generateVideo(
        data.video,
        leadData.Company_Name,
        zohoAccountId
      );
      if (generatedVideoId) {
        leadData.Generated_Video = `https://share.synthesia.io/embeds/videos/${generatedVideoId}`;
        leadData.Manager_Editor_Video = `https://app.synthesia.io/#/video/${generatedVideoId}`;
      }
      const response = await EditAccountInZoho(zohoAccountId, leadData);

      res.send({ results: response.data, generatedVideoId });
    } else {
      // console.log("No account found with that name. Creating a new one...");
      const generatedVideoId = await generateVideo(
        data.video,
        leadData.Company_Name
      );
      if (generatedVideoId) {
        leadData.Generated_Video = `https://share.synthesia.io/embeds/videos/${generatedVideoId}`;
        leadData.Manager_Editor_Video = `https://app.synthesia.io/#/video/${generatedVideoId}`;
      }
      const response = await createAccount(leadData);
      // console.log(response);
      res.send({ results: response.data, generatedVideoId });
    }
  } catch (error) {
    Sentry.captureException(error);
    logGracefulMessage({
      status: "Error",
      message: `${error?.message}`,
      userId: ``,
      accountId: ``,
      method: `marketingExtension`,
    });
    if (error?.response?.data?.error === "Access Denied") {
      res.status(400).send({ message: "Token error. Please try again." });
    } else {
      res.status(400).send({ message: "Failed to send data to Zoho." });
    }
  }
};

export { zohoCallback, editMainContact, marketingExtenstion };
