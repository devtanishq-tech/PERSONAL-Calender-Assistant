//Now we are creating calender applciation
import { ChatGroq } from "@langchain/groq";
import { StateGraph, MessagesAnnotation, START } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { getEvent, createEvent, deleteTool } from "./newtools.ts";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import readline from "readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { stat } from "node:fs";
import { MemorySaver } from "@langchain/langgraph";
import { uuidv4 } from "zod";
const tools = [getEvent, createEvent, deleteTool];
const llm = new ChatGroq({
  model: "openai/gpt-oss-120b",
  temperature: 0,
  apiKey: process.env.GROQ_API_KEY,
}).bindTools(tools);
const System_prompt = new SystemMessage(`You are a Google Calendar assistant.  
Your job is to populate the tool arguments as completely and accurately as possible.

- Copy the event title exactly.
- Copy the description exactly.
- Extract every attendee email.
- Extract every attendee name.
- Never leave description empty if the user provided one.
- Never return an empty attendees array if the user listed attendees.
- Preserve all dates and times.
- Do not invent information.
- If required information is missing, ask the user instead of guessing.`);

// formation of  llm function Node
// basically we are telling typescript that our  state is of this type
async function llmNode(state: typeof MessagesAnnotation.State) {
  // LLMNODE
  const llmresponse = await llm.invoke([System_prompt, ...state.messages]);
  console.log(llmresponse);
  return { messages: [llmresponse] };
}
const toolNode = new ToolNode(tools); // ToolNode
async function condition1(state: typeof MessagesAnnotation.State) {
  const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
  if (lastMessage.tool_calls?.length) {
    return "toolNode";
  }
  return "__end__";
}
const graph = new StateGraph(MessagesAnnotation)
  .addNode("llmNode", llmNode)
  .addNode("toolNode", toolNode)
  .addEdge("__start__", "llmNode")
  .addEdge("toolNode", "llmNode")
  .addConditionalEdges("llmNode", condition1);
const checkpointer = new MemorySaver();
const finalGraph = graph.compile({ checkpointer });
const rl = readline.createInterface({ input, output });
async function main() {
  while (true) {
    const userInput = await rl.question("Ask Question :");
    if (userInput === "exit") {
      console.log(`Closing the userInput `);
      break;
    }
    const finalInvoke = await finalGraph.invoke(
      {
        messages: {
          role: "user",
          content: userInput,
        },
      },
      {
        configurable: { thread_id: "1" },
      },
    );
    console.log(
      `AI :`,
      finalInvoke.messages[finalInvoke.messages.length - 1]?.content,
    );
  }
}
main();
