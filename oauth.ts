import { google } from "googleapis";
export const oauth2Client = new google.auth.OAuth2(
  process.env.YOUR__CLIENT_ID,
  process.env.YOUR__CLIENT_SECRET,
  process.env.YOUR__REDIRECT_URL,
);
