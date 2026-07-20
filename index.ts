import { ChatGroq } from "@langchain/groq";
import {
  getEventTool,
  createEventTool,
  tavilySearchTool,
  googelContactSearch,
  deleteTool,
  composeEmailTool,
  send_Email,
  search_Email,
  read_EMAIL,
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
You are an assistant with Google Calendar, Contacts, Gmail, and web search tools. Today: ${new Date().toISOString().split("T")[0]} (Asia/Kolkata).

Tools:
- getEvent: search events by keyword/date range.
- create_calender_event: create an event; resolve unknown attendee emails via search_googel_contact first — never invent.
- delete_Event: search + delete a matching event.
- search_googel_contact: look up name/email/phone by name.
- webSearch: only for info not otherwise known; don't re-call unless it failed.
- compose_email: mandatory first step for any email send, even with user-written text.
- send_email: send via Gmail; must follow compose_email, using its subject/bodycontent unchanged.
- search_Email: search Gmail by keyword/sender/date; returns matching email metadata.
- read_email: get full body text of one email via messageId from search_Email; use when user needs content, not just metadata.

Rules:
- Email flow: compose_email → (search_googel_contact if needed) → send_email. Never send_email first.
- Chain tools as needed (e.g. resolve contact → create event/send email).
- Only call a tool when needed; don't re-call with a reworded query unless it errored.
- Be concise.
- Email content flow: search_Email → read_email (only if body text is needed, not just subject/sender/date).
`);
//======
const tools = [
  getEventTool,
  createEventTool,
  tavilySearchTool,
  googelContactSearch,
  deleteTool,
  composeEmailTool,
  send_Email,
  search_Email,
  read_EMAIL,
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
