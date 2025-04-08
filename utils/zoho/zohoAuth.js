import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

async function getTokensFromCode(code) {
  const TOKEN_ENDPOINT = "https://accounts.zoho.com/oauth/v2/token";
  const response = await axios.post(TOKEN_ENDPOINT, null, {
    params: {
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    },
  });
  return response.data;
}

let inMemoryAccessToken = null;
let accessTokenInfo = {
  access_token: null,
  retrieved_at: null, // Timestamp when the token was retrieved
  expires_in: null, // Duration in seconds the token is valid
};

async function getAccessTokenFromRefreshToken(REFRESH_TOKEN) {
  const now = Math.floor(new Date().getTime() / 1000); // Current timestamp in seconds
  if (
    accessTokenInfo.access_token &&
    accessTokenInfo.retrieved_at + accessTokenInfo.expires_in > now
  ) {
    return accessTokenInfo.access_token;
  }

  // Make the request to refresh the access token
  const response = await axios.post(
    "https://accounts.zoho.com/oauth/v2/token",
    null,
    {
      params: {
        refresh_token: REFRESH_TOKEN,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "refresh_token",
      },
    }
  );

  // Update the stored token and expiry information
  accessTokenInfo = {
    access_token: response.data.access_token,
    retrieved_at: now,
    expires_in: response.data.expires_in,
  };

  return accessTokenInfo.access_token;
}

export { getTokensFromCode, getAccessTokenFromRefreshToken };
