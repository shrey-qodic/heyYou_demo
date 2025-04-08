import {
  getUiTemplate,
  upsertUiTemplate,
} from "../mutations/uitemplatesMutations.js";
import * as Sentry from "@sentry/node";

// - Add ui template controller
const getUiTemplateController = async (req, res) => {
  try {
    const uiTemplate = await getUiTemplate();
    res.status(200).json({
      success: true,
      message: "Template fetched successfully",
      data: uiTemplate,
    });
  } catch (error) {
    //
    Sentry.captureException(error);
    res.status(400).json({ message: error?.message });
  }
};

// - upser
const upsertUiTemplateController = async (req, res) => {
  try {
    const { uiTemplateUpdates = {}, extensionVersion } = req.body;
    const result = await upsertUiTemplate(uiTemplateUpdates);

    res.status(200).json({
      ...result,
      extensionVersion,
    });
    res.end("");
  } catch (error) {
    //
    Sentry.captureException(error);
    res.status(400).json({ message: error?.message });
    res.end("");
  }
};

export { getUiTemplateController, upsertUiTemplateController };
