import mongoose from "mongoose";

const ExtensionInstallSourceSchema = new mongoose.Schema({
  _id: { type: "string", required: true },
  ipAddress: { type: String, required: true },
  referrer: { type: String, required: true },
  utm_medium: { type: String, default: "Not Found" },
  utm_campaign: { type: String, default: "Not Found" },
  createdAt: { type: Number, default: Date.now },
  updatedAt: { type: Number, default: Date.now },
});

const ExtensionInstallSource = mongoose.model(
  "ExtensionInstallSource",
  ExtensionInstallSourceSchema,
  "extensionInstallSource"
);

export default ExtensionInstallSource;
