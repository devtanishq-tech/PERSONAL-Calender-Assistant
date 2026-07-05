import express from "express";
import { google } from "googleapis";
import { oauth2Client } from "./oauth.ts";
const app = express();
app.get("/hi", (req, res) => {
  res.send("Hi route ");
});
const scopes = ["https://www.googleapis.com/auth/calendar"];
// now we need to create two routes
// we will create two routes , one is /auth
// /checkPointer
app.get("/auth", async (req, res) => {
  const link = oauth2Client.generateAuthUrl({
    // 'online' (default) or 'offline' (gets refresh_token)
    access_type: "offline",
    scope: scopes,
  });
  res.redirect(link);
});
app.get("/checkpointer", async (req, res) => {
  const code = req.query.code as string;
  const { tokens } = await oauth2Client.getToken(code);
  // after this , googel is sending the overal token data to the localhost
  console.log(tokens);
  res.send("Congrulation Token has been Fetched ✅");
});
app.listen(8080, async () => {
  console.log(`Server has Started SuccessFully`);
});
