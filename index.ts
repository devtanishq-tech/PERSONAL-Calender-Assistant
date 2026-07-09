import { ChatGroq } from "@langchain/groq";
import {
  getEventTool,
  createEventTool,
  tavilySearchTool,
  googelContactSearch,
  deleteTool,
  composeEmailTool,
} from "./tools.ts";
import { SystemMessage } from "@langchain/core/messages";
import {
  StateGraph,
  MessagesAnnotation,
  Annotation,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { AIMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { context } from "@langchain/core/utils/context";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "node:process";

//=====
const SYSTEM_PROMPT = new SystemMessage(`
You are an AI assistant with access to Google Calendar, Google Contacts, and web search tools. Today's date: ${new Date().toISOString().split("T")[0]} (Asia/Kolkata).

Tools:
- getEvent: search calendar events by keyword/date range.
- create_calender_event: create a meeting/event. If a named person has no email provided, call search_googel_contact first to get it — never invent an email. Map the contact's emailAddress to the attendee's email field.
- delete_Event: find and delete a calendar event by search query.
- search_googel_contact: find a contact's displayName, emailAddress, phoneNumber. A missing field does NOT mean the contact wasn't found — it means that field isn't saved. Say so instead of retrying.
- webSearch: use only when current/real-time info is needed. Answer immediately after results — don't re-call unless the first search clearly failed.

General rules:
- Chain tools when a task needs more than one (e.g. look up a contact, then create an event with their email).
- Call a tool only when the request requires it.
- After a tool result, respond directly. Do not re-call the same tool with a reworded query unless it returned an explicit error.
- Be concise.
`);
//======
const tools = [
  getEventTool,
  createEventTool,
  tavilySearchTool,
  googelContactSearch,
  deleteTool,
  composeEmailTool,
];
const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY, // Default value.
  model: "openai/gpt-oss-120b",
  temperature: 0,
}).bindTools(tools);
//=================Creation of the Nodes first //====================
// basically here typescript asking you what the type of the paramters you are using here
async function llmNODE(state: typeof MessagesAnnotation.State) {
  const llmCALL = await llm.invoke([SYSTEM_PROMPT, ...state.messages]);
  console.log(llmCALL);
  return { messages: [llmCALL] };
}
const toolNode = new ToolNode(tools);
function conditionCheck(state: typeof MessagesAnnotation.State) {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  if (lastMessage.tool_calls?.length) {
    return "toolNode";
  }
  return "__end__";
}
const checkpointer = new MemorySaver();
const graph = new StateGraph(MessagesAnnotation)
  .addNode("llmNode", llmNODE)
  .addNode("toolNode", toolNode)
  .addEdge("__start__", "llmNode")
  .addEdge("toolNode", "llmNode")
  .addConditionalEdges("llmNode", conditionCheck);
const rl = readline.createInterface({ input, output });
const finalGraph = graph.compile({ checkpointer });
async function main() {
  while (true) {
    const userQuery = await rl.question(`Asked Question :`);
    if (userQuery.includes("exit")) {
      console.log(`Okay quitting the user INput`);
      break;
    }
    const finalINvoke = await finalGraph.invoke(
      {
        messages: [
          {
            role: "user",
            content: userQuery,
          },
        ],
      },
      {
        configurable: { thread_id: "conversation-1 " },
      },
    );
    console.log(
      `Below the Graph state returned by the invoke function ............`,
    );
    console.log(
      `AI :`,
      finalINvoke.messages[finalINvoke.messages.length - 1]?.content,
    );
  }
}
main();
