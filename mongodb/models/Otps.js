import mongoose from "mongoose";

const OtpSchema = new mongoose.Schema(
  {
    _id: { type: "string", required: true },
    otp: { type: Number, required: true },
    userId: { type: String, required: true },
    expireAt: { type: Number, default: Date.now, expires: "1y" },
    expireAt: {
      type: Number,
      default: () => Date.now() + 365 * 24 * 60 * 60 * 1000,
    }, // Set default to 1 year from now

    alreadyUsed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Otps = mongoose.model("otps", OtpSchema, "otps");

export default Otps;
