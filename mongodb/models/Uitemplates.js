import mongoose, { Schema } from "mongoose";

const Uitemplate = new mongoose.Schema({
  _id: { type: "string", required: true },
  createdAt: { type: Number, default: Date.now },
  updatedAt: { type: Number, default: Date.now },
  logoUrl: {
    type: String,
    default: "https://ext-icons.s3.amazonaws.com/logo.svg",
  },
  feedTabText: { type: String, default: "Feed" },
  inviteTabText: { type: String, default: "Invite" },
  manageAccountText: { type: String, default: "Manage your account" },
  manageAccountLink: { type: String, default: "http://my.heyou.io" },
  helpText: { type: String, default: "Help" },
  helpLink: { type: String, default: "http://my.heyou.io/support" },
  getMoreLikesText: { type: String, default: "Get more likes! 👍" },
  invitesHeadingText: {
    type: String,
    default: "Enter emails and likes your posts together!",
  },
  invitePlaceholerText: {
    type: String,
    default: "Enter email you want to add...",
  },
  inviteBtnText: { type: String, default: "Invite" },
  invitedBtnText: { type: String, default: "Invited ✌️" },
  bulkInviteHeading: { type: String, default: "Bulk Invite" },
  bulkInviteDesc: {
    type: String,
    default: "Share the link with your team to save time.",
  },
  // Onboarding screen 1
  onBoardingLoadingGif: {
    type: String,
    default: "https://ext-icons.s3.amazonaws.com/postFetchLoading.gif",
  },
  onBoardingFetchPostsText: {
    type: [String], // Define the type as an array of strings
    default: ["Fetching posts...", "Likes on the move...", "Wait for it..."],
  },

  // On boarding screen 2
  onBoardingPostPopupHeading: {
    type: String,
    default:
      "You didn't like anything lately. Don't worry, we did it for you 😎",
  },
  onBoardingPostPopupWhatsNextBtnText: {
    type: String,
    default: "See what’s next",
  },
  onBoardingPostPopupWillBeLikedText: {
    type: String,
    default: "Will be liked in 10 minutes",
  },
  inviteFriendsPopupTitle: {
    type: String,
    default: "Invite your friends and get more automated likes for",
  },
  inviteFriendsPopupInviteBtnPrimaryText: {
    type: String,
    default: "Invite",
  },
  inviteFriendsPopupInviteBtnSecondaryText: {
    type: String,
    default: "Invited ✌️",
  },
  inviteFriendsPopupCopyInviteLinkText: {
    type: String,
    default: "Copy invite link",
  },
  inviteFriendsPopupTooltipPrimaryText: {
    type: String,
    default: "Invite you coworkers with this link",
  },
  inviteFriendsPopupTooltipSecondaryText: {
    type: String,
    default: "Link Copied",
  },
  errorPupupPrimaryText: {
    type: String,
    default: "Oops!",
  },
  errorPupupSecondaryText: {
    type: String,
    default: "Something went wrong 😞",
  },
  errorPopupDescriptionText: {
    type: String,
    default:
      "Looks like we cannot identify your company information, reload page or try again.",
  },
  errorPopupTryAgainBtnText: {
    type: String,
    default: "Try again",
  },
  errorPopupTryAgainBtnLink: {
    type: String,
    default: "https://heyou.io",
  },

  welcomePopupPrimaryText: {
    type: String,
    default: "Welcome",
  },
  welcomePopupSecondaryText: {
    type: String,
    default: "HeYou.io",
  },
  welcomePopupLink: {
    type: String,
    default: "https://heyou.io",
  },
  postAlignDelay: {
    // Changing it so we can add hours in points ~ minutes
    type: Number,
    default: 2.0,
  },
  postAlignBufferTime: {
    // Changing it so we can add hours in points ~ minutes
    type: Number,
    default: 1.0,
  },
  debugMode: { type: Boolean, default: true },
  postLikeDelay: {
    type: Number,
    // Setting this because we are using hour format instead of minutes
    // 0.34 * 60 = 20.4 ~ 20
    default: 0.34,
  },
  userAccPostDelay: {
    type: Number,
    // Setting this because we are using hour format instead of minutes
    // 0.34 * 60 = 20.4 ~ 20
    default: 24,
  },
  latestExtensionVersion: String,
  gptGetHashtagFromPostPromt: {
    type: String,
    default: `Generate %HASHTAG_NUMBER% (Minimum Five Hashtags) hashtags for a linkedIn post based on the given description:"%POST_DESCIPTION%",Result should be a array of strings in JSON format.`,
  },
});

const Uitemplates = mongoose.model("Uitemplates", Uitemplate, "uitemplates");

export default Uitemplates;
