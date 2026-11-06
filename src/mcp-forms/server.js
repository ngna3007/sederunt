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

const questionOutput = z.object({
  questionId: z.string(),
  title: z.string(),
  type: z.string(),
  required: z.boolean(),
});

const createOutput = z.object({
  formId: z.string(),
  title: z.string(),
  responderUri: z.string(),
  editUrl: z.string(),
  published: z.boolean(),
  questionCount: z.number(),
});

const getOutput = z.object({
  formId: z.string(),
  title: z.string(),
  description: z.string(),
  responderUri: z.string(),
  editUrl: z.string(),
  published: z.boolean(),
  accepting: z.boolean(),
  questionCount: z.number(),
  questions: z.array(questionOutput),
});

const listOutput = z.object({
  formId: z.string(),
  responses: z.array(z.object({
    responseId: z.string(),
    createTime: z.string(),
    answers: z.record(z.string(), z.string()),
  })),
  nextPageToken: z.string().optional(),
});

const addOutput = z.object({
  formId: z.string(),
  questionCount: z.number(),
  added: z.number(),
});

const publishOutput = z.object({
  formId: z.string(),
  published: z.boolean(),
  accepting: z.boolean(),
  responderUri: z.string(),
});

/**
 * @param {string} name
 * @param {Record<string, unknown>} result
 */
function summaryFor(name, result) {
  if (!result || typeof result !== "object") return JSON.stringify(result ?? null);
  if (name === "create_form" && result.formId) {
    return `Created "${result.title}" (${result.formId}).`;
  }
  if (name === "get_form" && result.formId) {
    const count = Number(result.questionCount);
    const n = Number.isFinite(count) ? count : 0;
    return `${result.title} (${result.formId}), ${n} ${n === 1 ? "question" : "questions"}.`;
  }
  if (name === "list_responses" && Array.isArray(result.responses)) {
    const n = result.responses.length;
    return n === 1 ? "1 response." : `${n} responses.`;
  }
  if (name === "add_questions") {
    const added = Number(result.added) || 0;
    const total = Number(result.questionCount) || 0;
    return `Added ${added} ${added === 1 ? "question" : "questions"}. ${total} on the form.`;
  }
  if (name === "publish_form" && result.formId) return `Published ${result.formId}.`;
  return JSON.stringify(result);
}

/**
 * @param {string} text
 */
function splitToolError(text) {
  const raw = String(text || "");
  const index = raw.indexOf(":");
  if (index > 0 && index < 40) {
    return { code: raw.slice(0, index).trim(), message: raw.slice(index + 1).trim() };
  }
  return { code: "invalid-argument", message: raw || "Google Forms could not be reached." };
}

/**
 * @param {string} name
 * @param {() => Promise<Record<string, unknown>>} run
 */
async function toolResult(name, run) {
  try {
    const result = await run();
    return {
      content: [{ type: "text", text: summaryFor(name, result) }],
      structuredContent: result,
    };
  } catch (error) {
    const token = typeof formsContext().token === "string" ? formsContext().token : "";
    const text = toolErrorText(error, token);
    const split = splitToolError(text);
    return {
      isError: true,
      content: [{ type: "text", text }],
      structuredContent: { code: split.code, message: split.message },
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
    outputSchema: createOutput,
    annotations: writeNotes,
  }, async (args) => toolResult("create_form", () => service.createForm(args)));

  server.registerTool("add_questions", {
    description: "Append questions after the items already on a form.",
    inputSchema: z.object({
      formId: z.string(),
      questions: z.array(questionSchema),
    }),
    outputSchema: addOutput,
    annotations: writeNotes,
  }, async (args) => toolResult("add_questions", () => service.addQuestions(args)));

  server.registerTool("get_form", {
    description: "Read a form's title, questions, publish state, and links.",
    inputSchema: z.object({
      formId: z.string(),
    }),
    outputSchema: getOutput,
    annotations: readNotes,
  }, async (args) => toolResult("get_form", () => service.getForm(args)));

  server.registerTool("list_responses", {
    description: "Read responses. Answers are keyed by question title.",
    inputSchema: z.object({
      formId: z.string(),
      pageSize: z.number().optional(),
      pageToken: z.string().optional(),
    }),
    outputSchema: listOutput,
    annotations: readNotes,
  }, async (args) => toolResult("list_responses", () => service.listResponses(args)));

  server.registerTool("publish_form", {
    description: "Publish a form and set whether it accepts responses.",
    inputSchema: z.object({
      formId: z.string(),
      accepting: z.boolean().optional(),
    }),
    outputSchema: publishOutput,
    annotations: writeNotes,
  }, async (args) => toolResult("publish_form", () => service.publishForm(args)));

  return server;
}
