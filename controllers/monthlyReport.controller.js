import * as Sentry from "@sentry/node";
import {
  createMonthlyReport,
  getMonthlyReport,
  getMonthlyReportWithUserId,
} from "../mutations/monthlyReportMutations.js";
import logGracefulMessage from "../utils/logGracefulMessage.js";
import { createObjectCsvWriter } from "csv-writer";
import { stringify } from "csv-stringify";

const createMonthlyReportController = async (req, res) => {
  const { monthlyReportPosts, extensionVersion, userId, accountId } = req.body;
  try {
    if (!accountId || !monthlyReportPosts) {
      throw new Error(`Please provide correct form data`);
    }

    const createdReport = await createMonthlyReport(
      accountId,
      monthlyReportPosts
    );

    if (!createdReport?.success) {
      throw new Error(`Something went wrong | ${createdReport?.message}`);
    }

    logGracefulMessage({
      status: "success",
      method: `createMonthlyReport`,
      message: createdReport?.message,
      userId,
      accountId,
      extensionVersion,
    });

    res.status(200).json({
      ...createdReport,
    });
    return res.end("");
  } catch (error) {
    Sentry.captureException(error);

    logGracefulMessage({
      status: "error",
      method: `createMonthlyReport`,
      message: error?.message,
      userId,
      accountId,
      extensionVersion,
    });

    res.status(400).json({ message: error?.message });
    return res.end("");
  }
};

const downloadMonthlyReportController = async (req, res) => {
  try {
    const { reportId } = req.params;

    if (!reportId) {
      throw new Error(`Please provide correct reportId`);
    }

    const curReportRes = await getMonthlyReport(reportId);

    if (!curReportRes?.success) {
      throw new Error(`${curReportRes?.message}`);
    }

    const data = curReportRes?.data;

    // Convert data to CSV format
    const csvData = [
      ["Month Name", data.fullMonthName],
      ["Company Name", data.companyName],
      ["Total Impressions", data.totalImpressions],
      ["Total Comments", data.totalComments],
      ["Total Reposts", data.totalReposts],
      ["Total Reactions", data.totalReactions],
    ];

    const postsHeader = [
      "Post Title",
      "Created At",
      "Post Type",
      "Post URL",
      "Impressions",
      "Reactions",
      "Comments",
      "Reposts",
      "Heyou Tags",
      "Post Hashtags",
      "Post Mentions",
    ];
    const postsData = data.posts.map((post) => [
      post.postTitle,
      post.createdAt,
      post.postType,
      post.postUrl,
      post.impressions,
      post.reactions,
      post.comments,
      post.reposts,
      post.hashTags.join("  |  "),
      post.postHashtags.join("  |  "),
      post.postMentions.join("  |  "),
    ]);

    // Combine header and data
    const csvContent = csvData.concat([[], postsHeader], postsData);

    // Convert CSV content to string
    stringify(csvContent, (err, output) => {
      if (err) {
        console.log(JSON.stringify(err));
        return res.status(400).send("Internal Server Error");
      }

      // Set headers for CSV file download
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="report.csv"');

      // Send the CSV file to the client
      res.send(output);
    });
  } catch (error) {
    res.status(400).send({
      success: false,
      message: `${error?.message}`,
      data: error,
    });
  }
};
const downloadMonthlyReportByUserIdController = async (req, res) => {
  try {
    const { reportId, userId } = req.params;

    if (!reportId || !userId) {
      throw new Error(`Please provide correct data`);
    }

    const curReportRes = await getMonthlyReportWithUserId(reportId, userId);

    if (!curReportRes?.success) {
      throw new Error(`${curReportRes?.message}`);
    }

    const data = curReportRes?.data;

    // Convert data to CSV format
    const csvData = [
      ["Month Name", data.fullMonthName],
      ["Company Name", data.companyName],
      ["Total Impressions", data.totalImpressions],
      ["Total Comments", data.totalComments],
      ["Total Reposts", data.totalReposts],
      ["Total Reactions", data.totalReactions],
    ];

    const postsHeader = [
      "Post Title",
      "Created At",
      "Post Type",
      "Post URL",
      "Impressions",
      "Reactions",
      "Comments",
      "Reposts",
      "Heyou Tags",
      "Post Hashtags",
      "Post Mentions",
    ];
    const postsData = data.posts.map((post) => [
      post.postTitle,
      post.createdAt,
      post.postType,
      post.postUrl,
      post.impressions,
      post.reactions,
      post.comments,
      post.reposts,
      post.hashTags.join("  |  "),
      post.postHashtags.join("  |  "),
      post.postMentions.join("  |  "),
    ]);

    // Combine header and data
    const csvContent = csvData.concat([[], postsHeader], postsData);

    // Convert CSV content to string
    stringify(csvContent, (err, output) => {
      if (err) {
        console.log(JSON.stringify(err));
        return res.status(400).send("Internal Server Error");
      }

      // Set headers for CSV file download
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="report.csv"');

      // Send the CSV file to the client
      res.send(output);
    });
  } catch (error) {
    res.status(400).send({
      success: false,
      message: `${error?.message}`,
      data: error,
    });
  }
};

export {
  createMonthlyReportController,
  downloadMonthlyReportController,
  downloadMonthlyReportByUserIdController,
};
