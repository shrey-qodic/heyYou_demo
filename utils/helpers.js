import { v4 as uuidv4 } from "uuid";

/**
 *
 * @param {String} prefix : ;
 * @returns String
 */

export const idGeneratorHelper = (prefix) =>
  `${prefix || "id"}_${uuidv4().slice(0, 13).replace("-", "")}`;

export const toCookieObject = async (string) => {
  let cookie = [];
  let items = string.split(";");
  items.forEach((item) => {
    item = item.trim();
    let indexOfEqualSign = item.indexOf("=");
    let name = item.slice(0, indexOfEqualSign);
    let value = item.slice(indexOfEqualSign + 1);
    // FIXME: write mapper for differnet cookies
    cookie.push({ name: name, value: value, domain: "www.linkedin.com" });
  });
  // FIXME: remove this line and filter inside forEach
  return cookie.filter((cookie) => cookie["name"] == "li_at");
};

export const getV4UUID = () => uuidv4();

export const generateVerificationCode = () => {
  // Generates a random 4-digit number between 1000 and 9999
  return Math.floor(1000 + Math.random() * 9000).toString();
};

export const validateDomain = (domain) => {
  if (!domain) return false;
  const commonDomains = [
    "gmail.com",
    "yahoo.com",
    "outlook.com",
    "hotmail.com",
  ];
  return !commonDomains.includes(domain.toLowerCase());
};

export const isEmailDomainValid = (email) => {
  // Regular expression for extracting the domain from an email address
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  // Extract the domain from the email address
  const match = email.match(emailRegex);

  if (match) {
    const domain = match[0].split("@")[1];
    return domain;
  } else {
    return null;
  }
};

export const isValidDomain = (url) => {
  // Regular expression to validate a URL with an optional "https://" or "http://"
  const urlRegex =
    /^(https?:\/\/)?([a-zA-Z0-9.-]+(\.[a-zA-Z]{2,}){1,2})(\/.*)?$/;
  return urlRegex.test(url);
};

export const getDomainName = (url) => {
  if (isValidDomain(url)) {
    const matches = url.match(
      /^(https?:\/\/)?([a-zA-Z0-9.-]+(\.[a-zA-Z]{2,}){1,2})(\/.*)?$/
    );
    const domain = matches[2];
    return domain;
  } else {
    return "Invalid URL";
  }
};

export const getTimeDifference = (date1, date2) => {
  const difference = Math.abs(date1 - date2);

  const seconds = Math.floor(difference / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(months / 12);

  if (years > 0) {
    return {
      timeago: `${years} year${years !== 1 ? "s" : ""} ago`,
      preciseString: `${years} year${years !== 1 ? "s" : ""}`,
    };
  } else if (months > 0) {
    return {
      timeago: `${months} month${months !== 1 ? "s" : ""} ago`,
      preciseString: `${months} month${months !== 1 ? "s" : ""}`,
    };
  } else if (days > 0) {
    return {
      timeago: `${days} day${days !== 1 ? "s" : ""} ago`,
      preciseString: `${days} day${days !== 1 ? "s" : ""}`,
    };
  } else if (hours > 0) {
    return {
      timeago: `${hours} hour${hours !== 1 ? "s" : ""} ago`,
      preciseString: `${hours} hour${hours !== 1 ? "s" : ""}`,
    };
  } else if (minutes > 0) {
    return {
      timeago: `${minutes} minute${minutes !== 1 ? "s" : ""} ago`,
      preciseString: `${minutes} minute${minutes !== 1 ? "s" : ""}`,
    };
  } else {
    return {
      timeago: `${seconds} second${seconds !== 1 ? "s" : ""} ago`,
      preciseString: `${seconds} second${seconds !== 1 ? "s" : ""}`,
    };
  }
};

export const makeStringUrlFriendly = (str = "Helo World ! , special") =>
  str.replace(/[^\w\s]/gi, "").replace(/\s+/g, "-");

export const getFormattedDate = (daysToAdd = 0) => {
  const today = new Date();
  today.setDate(today.getDate() + daysToAdd);

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export const isThirtyDaysPassed = (inputDate, daysToCheckFor = 30) => {
  // Create a date object for the input date
  const inputDateObj = new Date(inputDate);

  // Get the current date
  const currentDate = new Date();

  // Calculate the difference in milliseconds between the current date and the input date
  const differenceInMillis = currentDate - inputDateObj;

  // Convert milliseconds to days
  const daysPassed = differenceInMillis / (1000 * 60 * 60 * 24);

  // Check if 30 days have passed
  return daysPassed >= daysToCheckFor;
};
