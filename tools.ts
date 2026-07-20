import { tool } from "@langchain/core/tools";
import { date, string, success, z } from "zod";
import { google } from "googleapis";
import { oauth2Client } from "./oauth.ts";
import { TavilySearch } from "@langchain/tavily";
import { v4 as uuidv4 } from "uuid";
import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { safebrowsing } from "googleapis/build/src/apis/safebrowsing/index";
import { concatArrayBuffers } from "bun";
import { az, da } from "zod/locales";
//===============================Google calender inetegration inside the tools FUNCTIONS
const search = new TavilySearch({
  maxResults: 5,
  topic: "general",
});
//===================Google integration//===============================
const calendar = google.calendar({ version: "v3", auth: oauth2Client }); // Google Calender
const contact = google.people({ version: "v1", auth: oauth2Client }); // Google Contact
const gmail = google.gmail({ version: "v1", auth: oauth2Client });
//========================================================================
oauth2Client.setCredentials({
  access_token: process.env.GOOGLE_ACCESS_TOKEN,
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});
//
//========================================get Event tools //==================================

const EventSchema = z.object({
  summary: z.string().describe("Event title."),
  start: z.object({
    dateTime: z
      .string()
      .describe("Start, RFC3339 (e.g. 2026-07-05T10:00:00+05:30)."),
    timeZone: z.string().describe("IANA timezone, e.g. Asia/Kolkata."),
  }),
  end: z.object({
    dateTime: z
      .string()
      .describe("End, RFC3339 (e.g. 2026-07-05T11:00:00+05:30)."),
    timeZone: z.string().describe("IANA timezone, e.g. Asia/Kolkata."),
  }),
  description: z.string().optional().describe("Event details (optional)."),
  attendees: z
    .array(
      z.object({
        email: z
          .string()
          .describe("Attendee email — from user or search_googel_contact."),
        displayName: z.string().describe("Attendee name as stated by user."),
      }),
    )
    .describe("Attendees to invite. Empty array if none mentioned."),
});
type EventData = z.infer<typeof EventSchema>;

export const getEventTool = tool(
  async ({ query, timeMin, timeMax }) => {
    try {
      console.log(`Get Event tool calling...............`);
      const response = await calendar.events.list({
        calendarId: `primary`,
        q: query,
        timeMin,
        timeMax,
      });
      const result = response.data.items?.map((current) => {
        return {
          status: current.status,
          id: current.id,
          summary: current.summary,
          creatorEmail: current.creator?.email,
          startDate: current.start,
          endDate: current.end,
          meetinglink: current.hangoutLink,
          eventType: current.eventType,
        };
      });
      console.log(`result:`, result);
      return response;
    } catch (err) {
      console.log(err);
    }
  },
  {
    name: "getEvent",
    description: "Search calendar events by keyword/date range.",
    schema: z.object({
      query: z.string().describe("Search keyword."),
      timeMin: z.string().optional().describe("Window start, RFC3339."),
      timeMax: z.string().optional().describe("Window end, RFC3339."),
    }),
  },
);
//========================================Create Event tool //===================================
export const createEventTool = tool(
  async (eventData) => {
    const { summary, start, end, description, attendees } =
      eventData as EventData;
    console.log(`Below is the data comes from the LLM `);
    console.log(`EventData`, eventData);
    const createEvent = await calendar.events.insert({
      calendarId: "primary",
      sendUpdates: "all",
      conferenceDataVersion: 1,
      requestBody: {
        summary,
        start,
        end,
        description,
        attendees,
        conferenceData: {
          createRequest: {
            requestId: uuidv4(), // for each request create the random id//
            conferenceSolutionKey: {
              type: "hangoutsMeet",
            },
          },
        },
      },
    });
    console.log(`-------------------------------------------------`);
    console.log(`-------------------------------------------------`);
    console.log(`-------------------------------------------------`);
    console.log(`llm respone data after creation -`, createEvent);

    return {
      status: "Meeting created successfully.",
      meetingLink: createEvent.data.hangoutLink,
      calendarEventLink: createEvent.data.htmlLink,
    };
  },
  {
    name: "create_calender_event",
    description:
      "Create a calendar event/meeting. Extract title, times, timezone, description, attendees. Resolve unknown attendee emails via search_googel_contact first — never invent. Empty attendees array if none mentioned.",
    schema: EventSchema,
  },
);
//=========delete Calender tool
export const deleteTool = tool(
  async ({ query }) => {
    const googleGetData = await calendar.events.list({
      calendarId: "primary",
      q: query,
    });
    console.log(`Delete event has used --------------------------------`);
    const eventss = googleGetData.data.items;
    if (!eventss || eventss.length === 0) {
      return "No matching event found.";
    }
    const firstEvent = eventss[0];
    if (!firstEvent || !firstEvent.id) {
      return "Event ID not found.";
    }
    const dataDelete = await calendar.events.delete({
      calendarId: "primary",
      eventId: firstEvent.id,
    });
    console.log(`Date that deleted  is below mentioned : `);
    console.log(dataDelete);
    return "Data has been successFully Deleted";
  },
  {
    name: "delete_Event",
    description: "Search calendar events by query and delete the first match.",
    schema: z.object({
      query: z.string().describe("Search keyword for the event to delete."),
    }),
  },
);
//============delete calender tool

export const tavilySearchTool = tool(
  async ({ query }) => {
    const webSearch = await search.invoke({ query });
    console.log(`web search tool call hapeen ..........`);
    console.log(webSearch);
    return webSearch.results?.map((item: any) => item.content).join("\n\n");
  },
  {
    name: "webSearch",
    description: "Web search for current info not otherwise known.",
    schema: z.object({ query: z.string().describe("Search query.") }),
  },
);

//=====================================find contact tool //================================
export const googelContactSearch = tool(
  async ({ query }) => {
    try {
      // ths is warmpup request to the google , which basicallya activates the searchContact function
      await contact.people.searchContacts({
        query: "",
        readMask: "names,emailAddresses",
      });
      const result = await contact.people.searchContacts({
        query,
        readMask: "names,emailAddresses,phoneNumbers",
      });
      console.log(`Google Seach Contact tool run ...........`);
      const resultss = result.data.results;
      console.log(`Total Contacts`, resultss?.length);
      console.log(resultss);
      if (!resultss || resultss.length === 0) {
        return "No contacts found.";
      }
      const personDATA = resultss[0]?.person;
      const phoneNumber = personDATA?.phoneNumbers?.[0]?.value;
      const displayName = personDATA?.names?.[0]?.displayName;
      const emailAddress = personDATA?.emailAddresses?.[0]?.value;
      // if (!emailAddress) {
      //   return "No email Address found of the given  contact";
      // }
      // if (!phoneNumber) {
      //   return "Phone Number of this person email has not found ";
      // }

      console.log({ displayName, emailAddress });
      return { displayName, emailAddress, phoneNumber }; // these data will go to the llm then
    } catch (err) {
      console.log(err);
    }
  },
  {
    name: "search_googel_contact",
    description:
      "Look up a contact's name, email, and phone by name. A missing field means it isn't saved, not that the contact wasn't found.",
    schema: z.object({ query: z.string().describe("Person's name.") }),
  },
);
//================After this implemenatation of geneartion of email content //======================
const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY, // Default value.
  model: "llama-3.1-8b-instant",
  temperature: 0,
  maxTokens: 400,
});
const SENDER_NAME = process.env.SENDER_NAME || "Tanishq";
const EmailDraftSchema = z.object({
  recipientName: z.string(),
  subject: z.string(),
  bodycontent: z.string(),
});
const EMAIL_SYSTM_pROMPT = new SystemMessage(`
Rewrite the user's request into a professional email: fix grammar, improve wording, write a concise subject.
Sender: ${SENDER_NAME}. Close with a proper sign-off and the real name "${SENDER_NAME}" — no placeholders like "[Your Name]".
Use plain straight apostrophes only, no smart quotes.
Return ONLY JSON.
`);
export const composeEmailTool = tool(
  async ({ query }) => {
    const structuredLLM = llm.withStructuredOutput(EmailDraftSchema);
    const response = await structuredLLM.invoke([
      EMAIL_SYSTM_pROMPT,
      new HumanMessage(query),
    ]);
    console.log(`response return by the composeEmail tool Below --------`);
    console.log(response);
    return response;
  },
  {
    name: "compose_email",
    description:
      "Mandatory first step for any email send, even if the user already wrote the subject/body. Returns polished recipientName, subject, bodycontent.",
    schema: z.object({
      query: z.string().describe("User's raw email request."),
    }),
  },
);
// creation of email content using function
//=====================================================================================
///========================================Helper Funciton
function encodeHeaderValue(value: string): string {
  const isAscii = /^[\x00-\x7F]*$/.test(value);
  if (isAscii) return value;
  const base64 = Buffer.from(value, "utf-8").toString("base64");
  return `=?UTF-8?B?${base64}?=`;
}
//==============================Helper Function//=========================================
function sendMessageFunction({
  to,
  subject,
  bodycontent,
}: {
  to: string;
  subject: string;
  bodycontent: string;
}) {
  const emailData = [
    `To: ${to}`,
    `From: ${encodeHeaderValue(SENDER_NAME)} <tanishqcoc24@gmail.com>`,
    `Subject: ${encodeHeaderValue(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
    "",
    bodycontent,
  ].join("\r\n");
  console.log(`Raw email data before encoding`);
  // this  will return a raw document here
  return Buffer.from(emailData)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
// basically this function will return a raw text
//=========== this is the schema of agument meaning //
const SendEmailSchema = z.object({
  to: z
    .string()
    .describe(
      "Recipient email address. Use the email provided by the user or returned by search_googel_contact.",
    ),
  subject: z.string().describe("The subject of the email."),
  bodycontent: z.string().describe("The complete email body content."),
});
//======================================================================================
export const send_Email = tool(
  async ({ to, subject, bodycontent }) => {
    try {
      console.log(`Send Email tool is being called ...........`);
      const raw = sendMessageFunction({ to, subject, bodycontent });
      console.log(raw);
      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw, // this is where we are sending our message to the gmail
        },
      });
      console.log(
        `Email has been sended , now below is response data prinited `,
      );

      console.log(response.data);
      return {
        success: true,
        threadId: response.data.threadId,
        messageId: response.data.id,
        messages: `Email has been successFully send to this  email id :${to}`,
      };
    } catch (err) {
      console.log(`some error occur in sending email here `);
      console.log(err);
      throw err;
    }
  },
  {
    name: "send_email",
    description:
      "Send email via Gmail. Must run after compose_email — never first. Use its subject/bodycontent unchanged. If a named contact has no email, resolve via search_googel_contact first. Never invent an email.",
    schema: SendEmailSchema, // add short describe()s: to: "Recipient email.", subject: "Email subject.", bodycontent: "Email body."
  },
);
const retervialFunction = async (message: any[]) => {
  try {
    const emailDATA = await Promise.all(
      message.map(async (current) => {
        const email = await gmail.users.messages.get({
          userId: "me",
          id: current.id,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date", "Message-ID"],
        });
        const headers = email.data.payload?.headers ?? [];
        const getHeader = (name: string) => {
          return headers.find(
            (current) => current.name?.toLowerCase() === name.toLowerCase(),
          )?.value;
        };
        return {
          messageId: email.data.id,
          TO: getHeader("To"),
          From: getHeader("From"),
          Subject: getHeader("Subject"),
          date: getHeader("Date"),
          messageIdHeader: getHeader("Message-ID"),
          snippet: email.data.snippet,
        };
      }),
    );
    return emailDATA;
  } catch (err) {
    console.log(`Some error has occur here ..................`);
    console.log(err);
    throw err;
  }
};
export const search_Email = tool(
  async ({ query }) => {
    console.log(`QUERY RECEVIED BY LLM `, query);
    console.log(`============================================================`);
    console.log(`Search_tool is called .....`);
    try {
      const response = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 3,
      });
      const data = response.data.messages || [];
      if (data.length == 0) {
        return "Searched Email does not exist ";
      }
      // this data contains array  of thread id and message id
      console.log(`Search data has been Printed Below =------------ `);
      console.log(data);
      const FinalAns = await retervialFunction(data);
      return {
        status: "Email Found",
        totalEmail: FinalAns.length,
        FinalAns,
      };
    } catch (err) {
      console.log(`Some error has occured here `);
      console.log(err);
      throw err;
    }
  },
  {
    name: "search_Email",
    description: `Search Gmail. Syntax: from:x@y.com, subject:text, is:unread, after:2026/07/01. Returns metadata only (subject, sender, date, snippet) — call read_email with the returned messageId for full body content.`,
    schema: z.object({
      query: z
        .string()
        .describe("Gmail search query using Gmail search syntax."),
    }),
  },
);
//===================REAL EMAIL tools integration here //==============================
function debugQueryFuction(data?: string) {
  if (!data) {
    return "";
  }
  return Buffer.from(data, "base64url").toString("utf-8");
}
function extractCONTENT(payload: any): string {
  //it means this function must return a value in strings
  if (!payload) {
    return "";
  }
  // this is the case, where both needed to be present
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return debugQueryFuction(payload.body.data);
  }
  // this is the case where inside parts data existed
  if (payload.parts) {
    for (let part of payload.parts) {
      const body = extractCONTENT(part);

      if (body) {
        return body;
      }
    }
  }
  // and this is the case where data existed only inside the payload.body/data
  if (payload.body?.data) {
    return debugQueryFuction(payload.body.data);
  }
  return "";
}
const read_EMAIL = tool(
  async ({ messageId }) => {
    try {
      const gmailData = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full", // this allow to extratc full data from the gmail api
      });
      console.log(
        `Below is gmail Data return by the gmail --------------------------------`,
      );
      console.log(gmailData);
      console.log(
        `ABove is gmail Data return by the gmail -------------------`,
      );
      const payload = gmailData.data?.payload;
      const bodyContent = extractCONTENT(payload);
      return {
        messageId,
        bodyContent,
      };
    } catch (err) {
      console.log(`some error has occur inside the read-Email tool`);
      console.log(err);
      throw err;
    }
  },
  {
    name: "read_email",
    description:
      "Fetch full body text of one email by message ID. Call after search_Email when the user wants content, not just metadata. ",
    schema: z.object({
      messageId: z.string().describe("Message ID from search_Email results."),
    }),
  },
);
