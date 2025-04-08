import * as Sentry from "@sentry/node";
import ExtensionInstallSource from "../mongodb/models/ExtensionInstallSource.js";
import { idGeneratorHelper } from "../utils/helpers.js";
import logGracefulMessage from "../utils/logGracefulMessage.js";

const addExtensionnSourceController = async (req, res) => {
  try {
    //
    const extInstallSourceToAdd = req.body;

    if (
      !extInstallSourceToAdd ||
      !extInstallSourceToAdd?.ipAddress ||
      !extInstallSourceToAdd?.referrer
    ) {
      res.status(400).json({
        success: false,
        message: "Provide valid form data",
      });
      res.end("");
      return;
    }

    const prevSource = await ExtensionInstallSource.findOne({
      ipAddress: extInstallSourceToAdd?.ipAddress,
    });

    if (prevSource?._id) {
      res.status(200).json({
        success: true,
        message: "Source is already added",
        data: prevSource,
      });
      res.end("");
      return;
    }

    const newSourceToAdd = {
      _id: idGeneratorHelper("ext_src"),
      ...extInstallSourceToAdd,
    };

    const createdSource = await ExtensionInstallSource.create(newSourceToAdd);

    logGracefulMessage({
      status: "Success",
      message: `Source created successfully`,
      method: `addExtensionnSourceController`,
      userId: req?.body?.userId,
      accountId: ``,
      payload: req?.body,
      response: createdSource,
      extensionVersion: extInstallSourceToAdd?.extensionVersion,
    });

    res.status(200).json({
      success: true,
      message: "Source created successfully",
      data: createdSource,
    });
    res.end("");
    return;

    //
  } catch (error) {
    Sentry.captureException(error);
    logGracefulMessage({
      status: "Error",
      message: error?.message,
      method: `addLikeController`,
      userId: req?.body?.userId,
      accountId: ``,
      payload: req?.body,
      response: error,
      extensionVersion: req?.body?.extensionVersion,
    });
    res.status(400).json({ message: error?.message });
    res.end("");
  }
};

export { addExtensionnSourceController };
