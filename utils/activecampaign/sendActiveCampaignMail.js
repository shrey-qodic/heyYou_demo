import nodemailer from "nodemailer";
import postmarkTransport from "nodemailer-postmark-transport";
import otpLoginAdminTemplate from "./emailTemplates/otpLoginAdminTemplate.js";
import logGracefulMessage from "../logGracefulMessage.js";

// -
const POSTMARK_API = process.env.POSTMARK_API_KEY;
const SIGNATURE_EMAIL = process.env.POSTMARK_SIGNATURE_EMAIL;

// Transporter
const mailTransport = nodemailer.createTransport(
  postmarkTransport({
    auth: {
      apiKey: POSTMARK_API,
    },
  })
);

const DEFAULT_EMAIL_TEMPLATE = otpLoginAdminTemplate(8890);

const sendActiveCampaignMail = async (
  to = "dauds@heyou.io",
  subject = "OTP for verification",
  template = DEFAULT_EMAIL_TEMPLATE
) => {
  try {
    // - Options for mail
    const mailOptions = {
      from: SIGNATURE_EMAIL,
      to,
      subject,
      html: template,
    };

    // console.log("API key is ", POSTMARK_API);

    const resSnap = await mailTransport.sendMail(mailOptions);
    // console.log("succesfully sent email  ", resSnap);
    return {
      emailSent: true,
      message: "Email sent successfully",
    };
  } catch (error) {
    logGracefulMessage({
      status: "Error",
      message: `${err?.message}`,
      userId: ``,
      accountId: ``,
      method: `mixpanelTrack`,
    });
    return {
      emailSent: false,
      message: JSON.stringify(error),
    };
  }
};

export default sendActiveCampaignMail;
