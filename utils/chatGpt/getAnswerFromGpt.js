import axios from "axios";
import { getHashtagFromPostTemplate } from "./gptQuestionTemplates.js";
import Uitemplates from "../../mongodb/models/Uitemplates.js";
import Posts from "../../mongodb/models/Posts.js";

const GPT_API_KEY = process?.env?.CHAT_GPT_TOKEN;
const GPT_API_URL = process?.env?.CHAT_GPT_API_ENDPOINT;

const getAnswerFromGpt = async (prompt) => {
  try {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GPT_API_KEY}`,
    };

    const data = {
      model: "gpt-3.5-turbo",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: `${prompt} json` }],
    };

    const res = await axios.post(GPT_API_URL, JSON.stringify(data), {
      headers,
    });

    const resultData = JSON.parse(
      res?.data?.choices[0]?.message?.content || {}
    );
    return resultData;
  } catch (error) {
    return error?.response?.data || error;
  }
};

const getHashtagFromPostDescription = async (
  postDescription = "",
  hashtagNumber = ""
) => {
  const allUiTemplates = await Uitemplates.find({});
  const allPosts = await Posts.find({});
  const mainTemplate = allUiTemplates[0];
  const randomIndex = Math.floor(Math.random() * allPosts?.length || 0);
  let prompt = mainTemplate["gptGetHashtagFromPostPromt"];
  prompt = prompt
    .replaceAll("%HASHTAG_NUMBER%", hashtagNumber)
    .replaceAll(
      "%POST_DESCIPTION%",
      allPosts[randomIndex]?.postTitle || postDescription
    );

  const gptAnswer = await getAnswerFromGpt(prompt);

  const postHashTags = gptAnswer?.hashtags;

  await Posts.findByIdAndUpdate(allPosts[randomIndex]?._id, {
    hashTags: postHashTags,
  });

  console.log(`I updated hashtags for ${allPosts[randomIndex]?._id}`);

  return gptAnswer;
};

const addHashtagToAllPosts = async (hashtagNumber = "") => {
  try {
    const allUiTemplates = await Uitemplates.find({});
    const allPosts = await Posts.find({
      $or: [{ hashTags: { $eq: [] } }, { hashTags: { $eq: null } }],
    });
    const mainTemplate = allUiTemplates[0];

    allPosts.forEach(async (post) => {
      let prompt = mainTemplate["gptGetHashtagFromPostPromt"];
      prompt = prompt
        .replaceAll("%HASHTAG_NUMBER%", hashtagNumber)
        .replaceAll("%POST_DESCIPTION%", post?.postTitle || "");
      const gptAnswer = await getAnswerFromGpt(prompt);
      const postHashTags = gptAnswer?.hashtags;

      await Posts.findByIdAndUpdate(post?._id, {
        hashTags: postHashTags,
      });

      // console.log(`I updated hashtags for ${post?._id}`);
    });

    return {
      success: true,
      message: `${allPosts?.length} Posts hashtags updated successfully`,
    };
  } catch (error) {
    return {
      success: false,
      message: `${error?.message}`,
    };
  }
};

export { getHashtagFromPostDescription, addHashtagToAllPosts };
