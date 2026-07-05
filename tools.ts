import { tool } from "@langchain/core/tools";
import { date, string, z } from "zod";
import { google } from "googleapis";
import { oauth2Client } from "./server.ts";
import tokens from "./token.json";
import { start } from "node:repl";
import { create } from "node:domain";
import { v4 as uuidv4 } from "uuid";
//===============================Google calender inetegration inside the tools FUNCTIONS
const calendar = google.calendar({ version: "v3", auth: oauth2Client });
oauth2Client.setCredentials({
  access_token: process.env.GOOGLE_ACCESS_TOKEN,
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});
//
//========================================get Event tools //==================================
const EventSchema = z.object({
  summary: z
    .string()
    .describe(
      "Title of the calendar event, such as 'Team Meeting' or 'Doctor Appointment'.",
    ),
  start: z.object({
    dateTime: z
      .string()
      .describe(
        "The start date and time of the event in RFC3339 format. Example: 2026-07-05T10:00:00+05:30 or 2026-07-05T04:30:00Z.",
      ),
    timeZone: z
      .string()
      .describe(
        "The IANA time zone of the event. Example: Asia/Kolkata, America/New_York, Europe/London.",
      ),
  }),
  end: z.object({
    dateTime: z
      .string()
      .describe(
        "The end date and time of the event in RFC3339 format. Example: 2026-07-05T11:00:00+05:30 or 2026-07-05T05:30:00Z.",
      ),
    timeZone: z
      .string()
      .describe(
        "The IANA time zone of the event. Example: Asia/Kolkata, America/New_York, Europe/London.",
      ),
  }),
  description: z.string().describe("Optional details or agenda for the event."),
  attendees: z
    .array(
      z.object({
        email: z
          .string()
          .describe(
            "The attendee's email address exactly as provided by the user.",
          ),
        displayName: z
          .string()
          .describe(
            "The attendee's display name exactly as mentioned by the user. If the user explicitly provides a display name, preserve it.",
          ),
      }),
    )
    .describe(
      "Complete list of attendees to invite. Extract every attendee mentioned by the user. For each attendee, include both the email address and display name. If the user requests that someone be invited, never omit them. Return an empty array only when no attendees are mentioned.",
    ),
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
    description: "Search calendar events matching a query.",
    schema: z.object({
      query: z.string().describe("Search keyword for the calendar event."),
      timeMin: z
        .string()
        .optional()
        .describe("Start of the search window in RFC3339 format."),
      timeMax: z
        .string()
        .optional()
        .describe("End of the search window in RFC3339 format."),
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

    return "MEETING HAS BEEN SET ";
  },
  {
    name: "create_calender_event",
    description:
      "Use this tool to create a new calendar event or meeting. Call this tool whenever the user asks to schedule, book, arrange, add, or create an event in their calendar. Examples include meetings, interviews, appointments, reminders, or any event with a specified date, time, or location. Extract every event detail mentioned by the user, including the title, description, start time, end time, time zone, and attendees. If the user asks to invite one or more people, always extract every attendee's email address and display name and include them in the attendees array. Never omit an attendee when an invitation is requested. Return an empty attendees array only if the user does not mention anyone to invite.",
    schema: EventSchema,
  },
);
