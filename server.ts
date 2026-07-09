import express from "express";
import { oauth2Client } from "./oauth.ts";
const app = express();
import { google } from "googleapis";
//=======================integrating google api //-========================
//===============================
app.get("/auth", (req, res) => {
  const scopes = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/contacts.readonly",
    // Gmail Permissions
    // "https://www.googleapis.com/auth/gmail.modify",
    // "https://www.googleapis.com/auth/gmail.send",
  ]; // here we telling google which intergration we are using

  const link = oauth2Client.generateAuthUrl({
    // 'online' (default) or 'offline' (gets refresh_token)
    access_type: "offline",
    // If you only need one scope, you can pass it as a string
    scope: scopes,
  });
  res.redirect(link);
});
app.get("/callback", async (req, res) => {
  try {
    const code = req.query.code as string;
    const { tokens } = await oauth2Client.getToken(code);
    console.log(tokens);
    res.send(
      "verification Done , Access has been granted :,you can close the TAB✅",
    );
  } catch (err) {
    console.log(err);
  }

  // now we want to send , code+ client id+ client secret as response to the consrent screen
});

app.listen(8080, () => {
  console.log(`Server is running on the port 8080`);
});
