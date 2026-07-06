import { tool } from "@langchain/core/tools";
import { date, string, z } from "zod";
import { google } from "googleapis";
import { oauth2Client } from "./oauth.ts";
import { TavilySearch } from "@langchain/tavily";
import { v4 as uuidv4 } from "uuid";
import { safebrowsing } from "googleapis/build/src/apis/safebrowsing/index";
import { concatArrayBuffers } from "bun";
//===============================Google calender inetegration inside the tools FUNCTIONS
const search = new TavilySearch({
  maxResults: 5,
  topic: "general",
});
const calendar = google.calendar({ version: "v3", auth: oauth2Client }); // Google Calender
const contact = google.people({ version: "v1", auth: oauth2Client }); // Google Contact
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
    description:
      "Delete an event from the user's Google Calendar. Use this tool when the user wants to delete, cancel, or remove a calendar event. The tool accepts a search query, searches for matching events in the user's calendar, identifies the appropriate event, and deletes it.",
    schema: z.object({
      query: z.string(),
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
    description:
      "Search the web for current information such as news, facts, recent events, or topics not available in the model's knowledge.",
    schema: z.object({
      query: z.string().describe("The search query to execute."),
    }),
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
        readMask: "names,emailAddresses",
      });
      console.log(`Google Seach Contact tool run ...........`);
      const resultss = result.data.results;
      console.log(`Total Contacts`, resultss?.length);
      console.log(resultss);
      if (!resultss || resultss.length === 0) {
        return "No contacts found.";
      }
      const personDATA = resultss[0]?.person;
      const displayName = personDATA?.names?.[0]?.displayName;
      const emailAddress = personDATA?.emailAddresses?.[0]?.value;
      if (!emailAddress) {
        return "No email Address found of the given  contact";
      }
      console.log({ displayName, emailAddress });
      return { displayName, emailAddress }; // these data will go to the llm then
    } catch (err) {
      console.log(err);
    }
  },
  {
    name: "search_googel_contact",
    description:
      "Search the user's Google Contacts by name and return the contact's email address.",
    schema: z.object({
      query: z.string().describe("The name of the person to search for"),
    }),
  },
);
