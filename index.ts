import { ChatGroq } from "@langchain/groq";
import {
  getEventTool,
  createEventTool,
  tavilySearchTool,
  googelContactSearch,
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
You are an AI assistant.

Use the webSearch tool only when current information is required.

After receiving search results, answer the user's question immediately.

Do NOT repeatedly call the webSearch tool unless the previous search clearly failed.
`);
//======
const tools = [
  getEventTool,
  createEventTool,
  tavilySearchTool,
  googelContactSearch,
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
