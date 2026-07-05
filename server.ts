import express from "express";
const app = express();
import { google } from "googleapis";
//=======================integrating google api //-========================
export const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.YOUR_REDIRECT_URL,
);
//===============================
app.get("/auth", (req, res) => {
  const scopes = ["https://www.googleapis.com/auth/calendar"];

  const link = oauth2Client.generateAuthUrl({
    // 'online' (default) or 'offline' (gets refresh_token)
    access_type: "offline",
    // If you only need one scope, you can pass it as a string
    scope: scopes,
  });
  res.redirect(link);
});
app.get("/callback", async (req, res) => {
  const code = req.query.code as string;
  const { tokens } = await oauth2Client.getToken(code);
  console.log(tokens);
  res.send(
    "verification Done , Access has been granted :,you can close the TAB✅",
  );

  // now we want to send , code+ client id+ client secret as response to the consrent screen
});

app.listen(8080, () => {
  console.log(`Server is running on the port 8080`);
});
