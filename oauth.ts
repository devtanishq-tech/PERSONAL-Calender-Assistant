import { google } from "googleapis";
export const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.YOUR_REDIRECT_URL,
);
