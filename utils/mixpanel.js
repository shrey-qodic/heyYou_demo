import Mixpanel from "mixpanel";
import * as dotenv from "dotenv";
import logGracefulMessage from "./logGracefulMessage.js";
import Users from "../mongodb/models/Users.js";
dotenv.config();

const isDev = process.env.APP_ENV == "dev";

const mp = Mixpanel.init(process.env.MIXPANEL_TOKEN, {});
const MIXPANEL_TOKEN = process.env.MIXPANEL_TOKEN;

// const mixpanelTrack = async (event, userId, data = {}) => {
//   try {
//     let finalDataToSend = {
//       ...data,
//     };

//     data["distinct_id"] = userId;

//     if (userId) {
//       const prevUser = await Users.findById(userId);
//       finalDataToSend = {
//         ...finalDataToSend,
//         id: prevUser?._id,
//         accountId: prevUser?.accountId,
//         companyName: prevUser?.companyName,
//         email: prevUser?.email,
//         city_country: prevUser?.city,
//         designation: prevUser?.designation,
//         firstName: prevUser?.firstName,
//         LastName: prevUser?.lastName,
//         role: prevUser?.role,
//         status: prevUser?.status,
//         linkedinProfileUrl: prevUser?.linkedinProfileUrl,
//       };
//     }

//     mp.track(event, {
//       ...finalDataToSend,
//     });
//   } catch (err) {
//     logGracefulMessage({
//       status: "Error",
//       message: `${err?.message}`,
//       userId: ``,
//       accountId: ``,
//       method: `mixpanelTrack`,
//     });
//   }
// };

async function mixpanelTrack(eventName, eventData = {}, mixpanelDistinctId) {
  const fullEventData = {
    event: eventName,
    properties: {
      token: MIXPANEL_TOKEN,
      distinct_id: mixpanelDistinctId,
      ...eventData,
    },
  };

  try {
    const sanitizedEventData = JSON.stringify(fullEventData, (key, value) =>
      typeof value === "string" ? value.replace(/[^\w\s.,-]/g, "") : value
    );

    const base64Data = btoa(sanitizedEventData);
    const response = await fetch(
      `https://api.mixpanel.com/track/?data=${base64Data}`
    );

    if (!response.ok) {
      throw new Error(`Network response was not ok: ${response.statusText}`);
    }

    console.log(`Event tracked: ${eventName}`);
  } catch (error) {
    console.log(JSON.stringify({
      message: `Error sending event to ${eventName}`,
      error
    }))
  }
}

const setOnce = (...args) => {
  try {
    mp.people.set_once(...args);
  } catch (err) {
    logGracefulMessage({
      status: "Error",
      message: `${err?.message}`,
      userId: ``,
      accountId: ``,
      method: `setOnce`,
    });
  }
};

const mixpanelUpdateUserRole = async (userId, userRole) => {
  try {
    if (!userId)
      throw new Error(
        "couldnt update user role in mixpanel - userId is missing"
      );
    if (!userRole)
      throw new Error(
        "couldnt update user role in mixpanel - userRole is missing"
      );

    mp.people.set(userId, {
      $role: userRole,
    });

    logGracefulMessage({
      status: "Success",
      accountId: ``,
      userId: `${userId}`,
      message: `User role updated successfully`,
      method: `mixpanelUpdateUserRole`,
    });
  } catch (e) {
    logGracefulMessage({
      status: "Error",
      accountId: ``,
      userId: `${userId}`,
      message: `${e?.message}`,
      method: `mixpanelUpdateUserRole`,
    });
  }
};

export { mixpanelTrack, setOnce, mixpanelUpdateUserRole };
