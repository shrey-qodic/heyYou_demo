import * as dotenv from "dotenv";
import crypto from "crypto-js";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

// const TZ_PRIVATE_KEY = process?.env.TZ_PRIVATE_KEY;
// const TZ_PUBLIC_KEY = process?.env.TZ_PUBLIC_KEY;

const TZ_PRIVATE_KEY = "MWf6zMD0MY";
const TZ_PUBLIC_KEY =
  "r20BT2WNBDQyi3dw9sKS8v7wNdmCGFT8Kcf13BAnzlEJe1sPwamLBj539MHMsv9HKSL85NbG2OL";

const tranzilaApiCall = async (endpoint, requestData) => {
  const time = Math.round(new Date().getTime() / 1000);
  const nonce = uuidv4();
  const hash = crypto
    .HmacSHA256(TZ_PUBLIC_KEY, TZ_PRIVATE_KEY + time + nonce)
    .toString(crypto.enc.Hex);

  const headers = {
    "Content-Type": "application/json",
    "X-tranzila-api-app-key": TZ_PUBLIC_KEY,
    "X-tranzila-api-request-time": time,
    "X-tranzila-api-nonce": nonce,
    "X-tranzila-api-access-token": hash,
  };

  try {
    const response = await axios.post(endpoint, requestData, {
      headers: headers,
    });

    const resData = response.data;

    if (!resData?.error_code === 0) {
      throw new Error(`Something went wrong | ${resData?.message}`);
    }

    return {
      status: "success",
      message: `${resData?.message}`,
      data: resData,
    };
  } catch (error) {
    return {
      status: "error",
      message: `${error.message}`,
      data: error,
    };
  }
};

export default tranzilaApiCall;
