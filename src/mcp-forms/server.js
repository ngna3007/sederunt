import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { formsContext } from "./context.js";
import { toolErrorText } from "./api.js";

const questionSchema = z.object({
  title: z.string(),
  type: z.string(),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  low: z.number().optional(),
  high: z.number().optional(),
  lowLabel: z.string().optional(),
  highLabel: z.string().optional(),
  labels: z.object({
    low: z.string().optional(),
    high: z.string().optional(),
  }).optional(),
});

const writeNotes = { readOnlyHint: false, destructiveHint: false };
const readNotes = { readOnlyHint: true, destructiveHint: false };

/**
 * @param {() => Promise<Record<string, unknown>>} run
 */
async function toolResult(run) {
  try {
    const result = await run();
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  } catch (error) {
    const token = typeof formsContext().token === "string" ? formsContext().token : "";
    return {
      isError: true,
      content: [{ type: "text", text: toolErrorText(error, token) }],
    };
  }
}

/**
 * Five Forms tools. The handler reads the bearer token from the request
 * context and does not keep it.
 *
 * @param {ReturnType<import("./api.js").createFormsService>} service
 */
export function createFormsMcpServer(service) {
  const server = new McpServer({ name: "sederunt-forms", version: "0.0.0" });

  server.registerTool("create_form", {
    description: "Create a Google Form, add its questions, and publish it unless publish is false.",
    inputSchema: z.object({
      title: z.string(),
      description: z.string().optional(),
      questions: z.array(questionSchema).optional(),
      publish: z.boolean().optional(),
    }),
    annotations: writeNotes,
  }, async (args) => toolResult(() => service.createForm(args)));

  server.registerTool("add_questions", {
    description: "Append questions after the items already on a form.",
    inputSchema: z.object({
      formId: z.string(),
      questions: z.array(questionSchema),
    }),
    annotations: writeNotes,
  }, async (args) => toolResult(() => service.addQuestions(args)));

  server.registerTool("get_form", {
    description: "Read a form's title, questions, publish state, and links.",
    inputSchema: z.object({
      formId: z.string(),
    }),
    annotations: readNotes,
  }, async (args) => toolResult(() => service.getForm(args)));

  server.registerTool("list_responses", {
    description: "Read responses. Answers are keyed by question title.",
    inputSchema: z.object({
      formId: z.string(),
      pageSize: z.number().optional(),
      pageToken: z.string().optional(),
    }),
    annotations: readNotes,
  }, async (args) => toolResult(() => service.listResponses(args)));

  server.registerTool("publish_form", {
    description: "Publish a form and set whether it accepts responses.",
    inputSchema: z.object({
      formId: z.string(),
      accepting: z.boolean().optional(),
    }),
    annotations: writeNotes,
  }, async (args) => toolResult(() => service.publishForm(args)));

  return server;
}
