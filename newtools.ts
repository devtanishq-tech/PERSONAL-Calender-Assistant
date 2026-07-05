import { tool } from "@langchain/core/tools";
import { google } from "googleapis";
import { oauth2Client } from "./oauth.ts";
import { string, z } from "zod";
import { v4 as uuidv4 } from "uuid";

const calendar = google.calendar({ version: "v3", auth: oauth2Client });
oauth2Client.setCredentials({
  access_token: process.env.GOOGLE_ACCESS_TOKEN_NEWSERVER,
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN_NEWSERVER,
});
// now we will define the schema of the createEvent

const EventScheam = z.object({
  summary: z
    .string()
    .describe(
      "The title or name of the calendar event. Examples: 'Project Meeting', 'Doctor Appointment', 'Birthday Party'.",
    ),
  description: z
    .string()
    .describe(
      "A detailed description or notes for the event. Include any additional information provided by the user. Use an empty string if no description is given.",
    ),
  start: z.object({
    dateTime: z
      .string()
      .describe(
        "The event start date and time in RFC3339/ISO 8601 format (e.g. '2026-07-11T10:00:00+05:30').",
      ),

    timeZone: z
      .string()
      .describe(
        "The IANA time zone of the event start time. Example: 'Asia/Kolkata', 'America/New_York', 'Europe/London'.",
      ),
  }),
  end: z.object({
    dateTime: z
      .string()
      .describe(
        "The event end date and time in RFC3339/ISO 8601 format (e.g. '2026-07-11T11:30:00+05:30').",
      ),

    timeZone: z
      .string()
      .describe(
        "The IANA time zone of the event end time. Usually the same as the start time zone.",
      ),
  }),
  attendees: z
    .array(
      z.object({
        email: z
          .string()
          .describe(
            "The attendee's valid email address used to send the calendar invitation.",
          ),

        displayName: z
          .string()
          .describe(
            "The attendee's display name if mentioned by the user. Use an empty string if not provided.",
          ),
        organizer: z
          .boolean()
          .describe(
            "Whether this attendee is the organizer of the event. Use false unless the user explicitly specifies that the attendee is the organizer.",
          ),
      }),
    )
    .describe(
      "An array of attendees to invite to the event. Return an empty array if the user does not mention anyone to invite.",
    ),
});
type eventData = z.infer<typeof EventScheam>;
export const getEvent = tool(
  async ({ query }) => {
    const result = await calendar.events.list({
      calendarId: "primary",
      q: query, // used to find the specific event -
    });
    // this will fetch all the details from the google calender api
    const events = result.data.items?.map((current) => {
      return {
        id: current.id,
        Summary: current.summary,
        status: current.status,
        meetingLink: current.hangoutLink,
        description: current.description,
        eventType: current.eventType,
        organizer: current.organizer,
      };
    });
    console.log(`Event Data : `, events);
    return events;
  },
  {
    name: "getevent",
    description: "Search calendar events matching a query.",
    schema: z.object({
      query: z.string().describe("Search keyword for the calendar event."),
    }),
  },
);
export const createEvent = tool(
  async (event) => {
    const { summary, description, end, start, attendees } = event as eventData;
    const createData = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: 1,
      sendUpdates: "all",
      requestBody: {
        end,
        start,
        description,
        summary,
        attendees,
        conferenceData: {
          createRequest: {
            requestId: uuidv4(), // this generate uinque id , everyTime
            conferenceSolutionKey: {
              type: "hangoutsMeet",
            },
          },
        },
      },
    });
    // now this will insert data into the  calender

    return "Your Event  Has been SuccessFully Created  ✅";
  },
  {
    name: "createEvent",
    description:
      "Create a Google Calendar event whenever the user wants to schedule, add, or book an event; automatically generate a Google Meet link if requested, assume the timezone is Asia/Kolkata when not specified, populate all event details from the user's request, infer reasonable defaults when possible, and call this tool immediately without asking follow-up questions unless essential information (such as the event date or time) is missing.",
    schema: EventScheam,
  },
);
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
    description:
      "Delete an event from the user's Google Calendar. Use this tool when the user wants to delete, cancel, or remove a calendar event. The tool accepts a search query, searches for matching events in the user's calendar, identifies the appropriate event, and deletes it.",
    schema: z.object({
      query: z.string(),
    }),
  },
);
