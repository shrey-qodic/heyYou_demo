import * as dotenv from "dotenv";
import MonthlyReports from "../mongodb/models/MonthlyReports.js";
import { idGeneratorHelper } from "../utils/helpers.js";
import Posts from "../mongodb/models/Posts.js";
import Accounts from "../mongodb/models/Accounts.js";
import Users from "../mongodb/models/Users.js";

dotenv.config();

const createMonthlyReport = async (accountId, postData) => {
  try {
    const currentDate = new Date();

    // Get the first day of the current month
    const firstDayOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );

    // Get the last day of the current month
    const lastDayOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0
    );

    const allMonthlyReports = await MonthlyReports.find({
      createdAt: {
        $gte: firstDayOfMonth,
        $lte: lastDayOfMonth,
      },
    });

    const curMonthReport = allMonthlyReports[0];

    if (curMonthReport && curMonthReport?._id) {
      const updatedReport = await MonthlyReports.findByIdAndUpdate(
        curMonthReport?._id,
        {
          accountId: postData[0]?.accountId || accountId,
          posts: postData?.map((post) => {
            return {
              postId: `${post?._id}`,
              impressions: post?.impressions?.replaceAll(",", "") || 0,
              reactions: post?.reactions?.replaceAll(",", "") || 0,
              comments: post?.comments?.replaceAll(",", "") || 0,
              reposts: post?.reposts?.replaceAll(",", "") || 0,
            };
          }),
        },
        { new: true }
      );

      return {
        success: true,
        message: `Updated monthly report successfully`,
        data: updatedReport,
      };
    }

    const monthlyReportToAdd = {
      _id: idGeneratorHelper("mrp"),
      createdAt: new Date(),
      reportedForDate: new Date(),
      accountId,
      posts: postData?.map((post) => {
        return {
          postId: `${post?._id}`,
          impressions: post?.impressions?.replaceAll(",", "") || 0,
          reactions: post?.reactions?.replaceAll(",", "") || 0,
          comments: post?.comments?.replaceAll(",", "") || 0,
          reposts: post?.reposts?.replaceAll(",", "") || 0,
        };
      }),
    };

    const addedMonthlyReportRes = await MonthlyReports.create(
      monthlyReportToAdd
    );

    return {
      success: true,
      message: `Added monthly report successfully`,
      data: addedMonthlyReportRes,
    };
  } catch (error) {
    return {
      success: false,
      message: `${error?.message}`,
      data: error,
    };
  }
};

const getMonthlyReport = async (reportId) => {
  try {
    const dateFormatOption = {
      month: "long", // Display full month name (e.g., March)
      day: "2-digit", // Display day with leading zeros (e.g., 01, 02, ..., 31)
      year: "numeric", // Display full year (e.g., 2024)
    };
    const reportData = await MonthlyReports.findById(reportId);
    const companyData = await Accounts.findById(reportData?.accountId);

    const fullMonthName = new Date(reportData?.createdAt).toLocaleDateString(
      "en-US",
      { month: "long" }
    );
    const companyName = companyData?.company || "Not found";
    const companyFollowers = companyData?.followers || "1";

    let totalReactions = 0;
    let totalComments = 0;
    let totalImpressions = 0;
    let totalReposts = 0;

    const reportsWithData = await Promise.all(
      reportData.posts.map(async (post) => {
        const fullPost = await Posts.findById(post?.postId);

        return {
          postTitle: `${fullPost?.postTitle}`,
          createdAt: new Date(fullPost?.linkedInCreatedAt).toLocaleDateString(
            "en-US",
            dateFormatOption
          ),
          unformatted: fullPost?.linkedInCreatedAt || new Date(),
          postType: "Image",
          postUrl: fullPost?.postUrl,
          postHashtags: fullPost?.postHashtags,
          postMentions: fullPost?.postMentions,
          hashTags: fullPost?.hashTags,
          impressions: post?.impressions?.replaceAll(",", "") || 0,
          reactions: post?.reactions?.replaceAll(",", "") || 0,
          comments: post?.comments?.replaceAll(",", "") || 0,
          reposts: post?.reposts?.replaceAll(",", "") || 0,
        };
      })
    );

    reportsWithData
      .sort((a, b) => b.unformatted - a.unformatted)
      .forEach((post) => {
        totalImpressions += (post?.impressions || 0) * 1;
        totalReactions += (post?.reactions || 0) * 1;
        totalComments += (post?.comments || 0) * 1;
        totalReposts += (post?.reposts || 0) * 1;
      });

    const finalDataToDisplay = {
      fullMonthName,
      companyName,
      companyFollowers,
      totalImpressions,
      totalReactions,
      totalComments,
      totalReposts,
      posts: reportsWithData,
    };

    if (!reportData || !reportData?._id) {
      throw new Error(
        `Couldn't find monthly report for given reportId ${reportId}`
      );
    }

    return {
      success: true,
      message: `Report found  successfully`,
      data: finalDataToDisplay,
    };
  } catch (error) {
    return {
      success: false,
      message: `${error?.message}`,
      data: error,
    };
  }
};

const getMonthlyReportWithUserId = async (reportId, userId) => {
  try {
    const curUser = await Users.findById(userId);

    const dateFormatOption = {
      month: "long", // Display full month name (e.g., March)
      day: "2-digit", // Display day with leading zeros (e.g., 01, 02, ..., 31)
      year: "numeric", // Display full year (e.g., 2024)
    };
    const reportData = await MonthlyReports.findById(reportId);
    const companyData = await Accounts.findById(reportData?.accountId);

    const fullMonthName = new Date(reportData?.createdAt).toLocaleDateString(
      "en-US",
      { month: "long" }
    );
    const companyName = companyData?.company || "Not found";
    const companyFollowers = companyData?.followers || "1";

    let totalReactions = 0;
    let totalComments = 0;
    let totalImpressions = 0;
    let totalReposts = 0;

    const reportsWithData = await Promise.all(
      reportData.posts.map(async (post) => {
        const fullPost = await Posts.findById(post?.postId);

        return {
          postTitle: `${fullPost?.postTitle}`,
          createdAt: new Date(fullPost?.linkedInCreatedAt).toLocaleDateString(
            "en-US",
            dateFormatOption
          ),
          unformatted: fullPost?.linkedInCreatedAt || new Date(),
          postType: "Image",
          postUrl: fullPost?.postUrl,
          postHashtags: fullPost?.postHashtags,
          postMentions: fullPost?.postMentions,
          hashTags: fullPost?.hashTags,
          impressions: post?.impressions?.replaceAll(",", "") || 0,
          reactions: post?.reactions?.replaceAll(",", "") || 0,
          comments: post?.comments?.replaceAll(",", "") || 0,
          reposts: post?.reposts?.replaceAll(",", "") || 0,
        };
      })
    );

    reportsWithData
      .sort((a, b) => b.unformatted - a.unformatted)
      .forEach((post) => {
        totalImpressions += post?.impressions * 1;
        totalReactions += post?.reactions * 1;
        totalComments += post?.comments * 1;
        totalReposts += post?.reposts * 1;
      });

    const finalDataToDisplay = {
      fullMonthName,
      companyName,
      companyFollowers,
      totalImpressions,
      totalReactions,
      totalComments,
      totalReposts,
      posts: reportsWithData,
    };

    if (!reportData || !reportData?._id) {
      throw new Error(
        `Couldn't find monthly report for given reportId ${reportId}`
      );
    }

    if (curUser && curUser?._id) {
      await Users.findByIdAndUpdate(curUser._id, {
        lastReportDownloadedAt: new Date(),
      });
    }

    return {
      success: true,
      message: `Report found  successfully`,
      data: finalDataToDisplay,
    };
  } catch (error) {
    return {
      success: false,
      message: `${error?.message}`,
      data: error,
    };
  }
};

export { createMonthlyReport, getMonthlyReport, getMonthlyReportWithUserId };
