import express from "express";
import {
  createPost,
  getCookie,
  reactPost,
  viewPost,
  newPost,
  createAdmin,
  updateUserByEmail,
  updateUserByProfileUrl,
  createOrRetrieveUserByProfileUrlController,
  updateLastFrontendLikeForUserController,
  userUninstalledController,
  generateShareLinkController,
  generateVerificationCodeController,
  addLinkInvitedUserController,
  getUsersImagesBySimilarAccountIdController,
  emailVerificationController,
  updateUsersEmailController,
  clearUserDataController,
  clearUserDataByEmailController,
  validateAndSendOtpController,
  validateOtpController,
  verifyTokenController,
  getAllRelatedUsersFromTokenController,
  clearUserDataByEmailWithAccountController,
  getAllUsersToPayFor,
  updateUsersExtensioVersionController,
  updateUserByIdController,
  checkIfEmailExistsController,
  getAllUsersToPayForByAccountIdController,
  updateNoOfContactsForAllUsersController,
  createOrRetrieveUserByProfileUrlWithCompaniesController,
  updatePaymentLinkForAllAdminsInCrmAndDbController,
  updateUsersSchemaAccordingToNewCompaniesArrayController,
  getAccountUrlToScrapPostsController,
  getUserByIdController,
  addInviterNameForAllUsersController,
  deleteProspectsWithUserIdController,
  deleteUserProspectsOfUninstalledUsersController,
  getUserFromProfileUrlController,
  addCrmUrlToUsersController,
  synAllAccountsCrmIdController,
  syncAllUsersAdminStatusController,
  syncAllEndUsersInviterNameController,
  syncAccountPaidStatus,
  syncUsersAccountsInCrmController,
  removeCompleteDataFromDBAndCrmController,
  updateUserPaymentStatusController,
  removeProspectConnectionFromUserController,
  getAllRelatedPostsFromTokenController,
} from "../controllers/user.controller.js";
import {
  inviterNameForAllUsersInCrm,
  upsertUserWithOrWithoutCompanyOrEmail,
} from "../mutations/userMutations.js";
import { prePostUserCrmSyncController } from "../controllers/post.controller.js";

const userRouter = express.Router();

userRouter.route("/cookie").post(getCookie);
userRouter.route("/create-post").post(createPost);
userRouter.route("/view-post").post(viewPost);
userRouter.route("/react-post").post(reactPost);
userRouter.route("/new-post").get(newPost);
userRouter.route("/create-admin").post(createAdmin);
userRouter.route("/update-user-by-email").post(updateUserByEmail);
userRouter.route("/update-user-by-profileurl").post(updateUserByProfileUrl);
userRouter
  .route("/user-by-profile")
  .post(createOrRetrieveUserByProfileUrlWithCompaniesController);

userRouter
  .route("/updateUserLastFrontLike")
  .post(updateLastFrontendLikeForUserController);

userRouter.route("/uninstallUser/:userId").get(userUninstalledController);

userRouter
  .route("/checkIfEmailExists/:email")
  .get(checkIfEmailExistsController);

userRouter.route("/createFromLink").post(addLinkInvitedUserController);
userRouter
  .route("/GenerateCodeVerification")
  .post(generateVerificationCodeController);
userRouter.route("/emailVerification").post(emailVerificationController);

userRouter
  .route("/getSimilarUsersImages/:accountId")
  .get(getUsersImagesBySimilarAccountIdController);

userRouter.route("/updateUsersEmail").put(updateUsersEmailController);

userRouter.route("/clearUserData/:userId").get(clearUserDataController);
userRouter.route("/checkUserprofileUrl").post(getUserFromProfileUrlController);
userRouter
  .route("/clearUserDataByEmail/:userEmail")
  .get(clearUserDataByEmailController);

// - This route is for deleting account , all users related to it and all likes related to it only if user is Admin
userRouter
  .route("/clearUserDataByEmailWithAccount")
  .post(clearUserDataByEmailWithAccountController);

userRouter
  .route("/validateAndSentOtp/:userEmail")
  .get(validateAndSendOtpController);

userRouter.route("/update/:userId").post(updateUserByIdController);

userRouter
  .route("/deleteProspectsById/:userId")
  .get(deleteProspectsWithUserIdController);

userRouter
  .route("/deleteUninstallUsersProspects")
  .get(deleteUserProspectsOfUninstalledUsersController);

userRouter.route("/validateOtp").post(validateOtpController);
userRouter.route("/verifyToken").post(verifyTokenController);

userRouter
  .route("/getAllRelatedUsersFromToken")
  .post(getAllRelatedUsersFromTokenController); //

userRouter
  .route("/getAllRelatedPostsFromToken")
  .post(getAllRelatedPostsFromTokenController); //

userRouter.route("/getAllUsersToPayFor").post(getAllUsersToPayFor);
userRouter
  .route("/getAllUsersToPayFor/:accountId")
  .get(getAllUsersToPayForByAccountIdController);

userRouter
  .route("/updateNumberOfContacts")
  .get(updateNoOfContactsForAllUsersController);

userRouter
  .route("/updateExtensionVersion")
  .post(updateUsersExtensioVersionController);

userRouter.route("/updateInviterNameForUsers").get(inviterNameForAllUsersInCrm);

userRouter
  .route("/createUserWithoutCompanyOrEmail")
  .post(upsertUserWithOrWithoutCompanyOrEmail);

userRouter
  .route("/updatePaymentLinkForAllUsers")
  .get(updatePaymentLinkForAllAdminsInCrmAndDbController);

userRouter
  .route("/updateCompaniesSchemaForAllUsers")
  .get(updateUsersSchemaAccordingToNewCompaniesArrayController);

userRouter.route("/addInviterNames").get(addInviterNameForAllUsersController);
userRouter.route("/addCrmUrls").get(addCrmUrlToUsersController);

userRouter
  .route("/getPostAlignAccountLink/:userId")
  .get(getAccountUrlToScrapPostsController);

userRouter
  .route("/prePostUserCrmSync/:userId")
  .get(prePostUserCrmSyncController);

userRouter
  .route("/updateUserPaymentStatusToggle/:userId")
  .post(updateUserPaymentStatusController);

userRouter
  .route("/removeProspectConnection")
  .post(removeProspectConnectionFromUserController);

userRouter
  .route("/removeCompleteDataFromDBAndCrm/:userId")
  .get(removeCompleteDataFromDBAndCrmController);

userRouter.route("/syncCrmIds").get(synAllAccountsCrmIdController);

userRouter
  .route("/syncUsersAccountsInCrm")
  .get(syncUsersAccountsInCrmController);

userRouter.route("/syncAccountPaidStatus").get(syncAccountPaidStatus);

userRouter.route("/synAdminStatus").get(syncAllUsersAdminStatusController);

userRouter
  .route("/syncAllEndUsersInviterName")
  .get(syncAllEndUsersInviterNameController);

userRouter.route("/:userId").get(getUserByIdController);

// Export user router
//

export { userRouter };
