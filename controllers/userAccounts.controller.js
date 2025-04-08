import * as Sentry from "@sentry/node";

import logGracefulMessage from "../utils/logGracefulMessage.js";
import {
  bulkUpsertAndLinkProspects,
  checkIfUserAccountAlreadyLinked,
  upsertLinkUserAccount,
} from "../mutations/userAccountsMutations.js";

// - controller
const upsertLinkUserAccountController = async (req, res) => {
  try {
    //
    const { userId, userAccountUrl, userAccountName } = req.body;

    if (!userId || !userAccountUrl || !userAccountName) {
      res.status(400).json({
        success: false,
        message: "Provide correct form data",
      });
      res.end("");
      return;
    }

    const createdUserAccount = await upsertLinkUserAccount({
      userId,
      userAccountToAddAndLink: {
        linkedInUrl: userAccountUrl,
        name: userAccountName,
      },
    });

    if (!createdUserAccount?.success) {
      throw new Error(`${createdUserAccount?.message}`);
    }

    logGracefulMessage({
      status: "Success",
      message: `user account created successfully`,
      method: `upsertLinkUserAccountController`,
      userId: req?.body?.userId,
      accountId: ``,
      payload: req?.body,
      response: createdUserAccount,
      extensionVersion: req?.body?.extensionVersion,
    });

    res.status(200).json(createdUserAccount);
    res.end("");
    return;

    //
  } catch (error) {
    Sentry.captureException(error);
    logGracefulMessage({
      status: "Error",
      message: error?.message,
      method: `upsertLinkUserAccountController`,
      userId: req?.body?.userId,
      accountId: ``,
      payload: req?.body,
      response: error,
      extensionVersion: req?.body?.extensionVersion,
    });
    res
      .status(400)
      .json({ success: false, message: error?.message, data: error });
    res.end("");
  }
};

const bulkUpsertLinkUserAccountController = async (req, res) => {
  try {
    //
    const { userId, userAccountsToAddAndLink } = req.body;

    if (!userId || userAccountsToAddAndLink.length === 0) {
      res.status(400).json({
        success: false,
        message: "Provide correct form data",
      });
      res.end("");
      return;
    }



    const createdUserAccount = await bulkUpsertAndLinkProspects({
      userId,
      userAccountsToAddAndLink
    });

    if (!createdUserAccount?.success) {
      throw new Error(`${createdUserAccount?.message}`);
    }

    logGracefulMessage({
      status: "Success",
      message: `user account created successfully`,
      method: `bulkUpsertLinkUserAccountController`,
      userId: req?.body?.userId,
      accountId: ``,
      payload: req?.body,
      response: createdUserAccount,
      extensionVersion: req?.body?.extensionVersion,
    });

    res.status(200).json(createdUserAccount);
    res.end("");
    return;

    //
  } catch (error) {
    Sentry.captureException(error);
    logGracefulMessage({
      status: "Error",
      message: error?.message,
      method: `bulkUpsertLinkUserAccountController`,
      userId: req?.body?.userId,
      accountId: ``,
      payload: req?.body,
      response: error,
      extensionVersion: req?.body?.extensionVersion,
    });
    res
      .status(400)
      .json({ success: false, message: error?.message, data: error });
    res.end("");
  }
};

const checkIfUserAccountAlreadyLinkedController = async (req, res) => {
  try {
    //
    const { userId, userAccountUrl } = req.body;

    if (!userId || !userAccountUrl) {
      res.status(400).json({
        success: false,
        message: "Provide correct form data",
      });
      res.end("");
      return;
    }

    const accLinkedAlreadyResponse = await checkIfUserAccountAlreadyLinked(
      req?.body
    );

    if (!accLinkedAlreadyResponse?.success) {
      throw new Error(`${accLinkedAlreadyResponse?.message}`);
    }

    logGracefulMessage({
      status: "Success",
      message: `${accLinkedAlreadyResponse?.message}`,
      method: `checkIfUserAccountAlreadyLinkedController`,
      userId: req?.body?.userId,
      accountId: ``,
      payload: req?.body,
      response: accLinkedAlreadyResponse,
      extensionVersion: req?.body?.extensionVersion,
    });

    res.status(200).json(accLinkedAlreadyResponse);
    res.end("");
    return;

    //
  } catch (error) {
    Sentry.captureException(error);
    logGracefulMessage({
      status: "Error",
      message: error?.message,
      method: `checkIfUserAccountAlreadyLinkedController`,
      userId: req?.body?.userId,
      accountId: ``,
      payload: req?.body,
      response: error,
      extensionVersion: req?.body?.extensionVersion,
    });
    res.status(400).json({
      success: false,
      message: error?.message,
      data: { isLinked: false },
    });
    res.end("");
  }
};

export {
  upsertLinkUserAccountController,
  checkIfUserAccountAlreadyLinkedController,
  bulkUpsertLinkUserAccountController
};
