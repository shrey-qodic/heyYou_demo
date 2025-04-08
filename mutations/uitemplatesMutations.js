import * as dotenv from "dotenv";
import { idGeneratorHelper } from "../utils/helpers.js";
import Uitemplates from "../mongodb/models/Uitemplates.js";
dotenv.config();

// - get ui template
const getUiTemplate = async () => {
  const uiTemplate = await Uitemplates.findOne();

  return uiTemplate;
};

// - upsert ui template
const upsertUiTemplate = async ({ uiTemplateUpdates }) => {
  const uiTemplate = await Uitemplates.findOne();

  if (!uiTemplate) {
    const uiTemplateToCreate = {
      _id: idGeneratorHelper("ui_temp"),
      ...uiTemplateUpdates,
    };

    const createdUiTemplate = await Uitemplates.create(uiTemplateToCreate);

    return {
      status: "success",
      message: "ui template created successfully",
      data: createdUiTemplate,
    };
  }
  const newUpdatedUiTemplate = {
    ...uiTemplate._doc,
    ...uiTemplateUpdates,
    _id: uiTemplate._id,
  };

  const updatedTemp = await Uitemplates.findByIdAndUpdate(uiTemplate._id, {
    ...uiTemplateUpdates,
    _id: uiTemplate._id,
  });

  return {
    status: "success",
    message: "ui template updated successfully",
    data: updatedTemp,
  };
};

export { getUiTemplate, upsertUiTemplate };
