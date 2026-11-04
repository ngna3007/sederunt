import { formsContext } from "./context.js";
import { FormsToolError, formsError, mapGoogleError, redactFormsText } from "./errors.js";
import { createFakeFormsStore } from "./fake.js";
import {
  batchUpdateBody,
  editUrlFor,
  normalizeQuestions,
  publishSettingsBody,
  validateAddInput,
  validateCreateInput,
  validateFormId,
  validatePageSize,
  validatePageToken,
} from "./questions.js";

const FORMS_API = "https://forms.googleapis.com/v1";

/**
 * Fake forms when SEDERUNT_FORMS_FAKE=1.
 * SEDERUNT_FORMS_FAKE=0 stays live even if SEDERUNT_AUTH_FAKE=1.
 * Otherwise fake follows SEDERUNT_AUTH_FAKE=1.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function formsFakeEnabled(env = process.env) {
  const flag = String(env?.SEDERUNT_FORMS_FAKE ?? "").trim();
  if (flag === "1") return true;
  if (flag === "0") return false;
  return String(env?.SEDERUNT_AUTH_FAKE || "").trim() === "1";
}

/**
 * @param {string} origin
 * @param {string} formId
 */
function responderUriFor(origin, formId) {
  const base = String(origin || "http://127.0.0.1").replace(/\/$/, "");
  return `${base}/forms/fake/${formId}/viewform`;
}

/**
 * @param {Record<string, unknown>} record
 * @param {string} origin
 */
function presentFake(record, origin) {
  return {
    formId: record.formId,
    title: record.title,
    description: record.description || "",
    responderUri: responderUriFor(origin, record.formId),
    editUrl: editUrlFor(record.formId),
    published: record.published === true,
    accepting: record.accepting === true,
    questionCount: record.questions.length,
    questions: record.questions.map((question) => ({
      questionId: question.questionId,
      title: question.title,
      type: question.type,
      required: question.required === true,
    })),
  };
}

/**
 * @param {Record<string, unknown>} presented
 */
function createResult(presented) {
  return {
    formId: presented.formId,
    title: presented.title,
    responderUri: presented.responderUri,
    editUrl: presented.editUrl,
    published: presented.published === true,
    questionCount: presented.questionCount,
  };
}

/**
 * @param {unknown} item
 */
function questionTypeFromItem(item) {
  const question = item?.questionItem?.question || {};
  if (question.textQuestion) return question.textQuestion.paragraph === true ? "paragraph" : "short_text";
  if (question.choiceQuestion?.type === "CHECKBOX") return "checkboxes";
  if (question.choiceQuestion?.type === "DROP_DOWN") return "dropdown";
  if (question.choiceQuestion?.type === "RADIO") return "multiple_choice";
  if (question.scaleQuestion) return "scale";
  if (question.dateQuestion) return "date";
  return "short_text";
}

/**
 * @param {Record<string, unknown>} form
 */
function presentLive(form) {
  const formId = String(form.formId || "");
  const items = Array.isArray(form.items) ? form.items : [];
  const questions = items
    .filter((item) => item?.questionItem?.question)
    .map((item) => ({
      questionId: String(item.questionItem.question.questionId || ""),
      title: String(item.title || ""),
      type: questionTypeFromItem(item),
      required: item.questionItem.question.required === true,
    }));
  const state = form.publishSettings?.publishState || {};
  return {
    formId,
    title: String(form.info?.title || ""),
    description: String(form.info?.description || ""),
    responderUri: typeof form.responderUri === "string" ? form.responderUri : "",
    editUrl: editUrlFor(formId),
    published: state.isPublished === true,
    accepting: state.isAcceptingResponses === true,
    questionCount: questions.length,
    questions,
  };
}

/**
 * @param {Record<string, unknown>} response
 * @param {Map<string, string>} titles
 */
function compactAnswers(response, titles) {
  const answers = {};
  const raw = response?.answers && typeof response.answers === "object" ? response.answers : {};
  for (const [key, answer] of Object.entries(raw)) {
    const questionId = String(answer?.questionId || key);
    const title = titles.get(questionId) || titles.get(key) || questionId;
    const values = [];
    const texts = answer?.textAnswers?.answers;
    if (Array.isArray(texts)) {
      for (const item of texts) {
        if (typeof item?.value === "string" && item.value) values.push(item.value);
      }
    }
    if (values.length && title) answers[title] = values.join(", ");
  }
  return answers;
}

/**
 * Google Forms REST, or the in-memory fake. The bearer token is read from the
 * request context and is not stored on the service.
 *
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   fake?: boolean,
 *   store?: ReturnType<typeof createFakeFormsStore>,
 *   origin?: string,
 * }} [options]
 */
export function createFormsService(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const fake = options.fake === true;
  const store = fake ? (options.store || createFakeFormsStore()) : null;
  const fallbackOrigin = options.origin || "http://127.0.0.1";

  function current() {
    const context = formsContext();
    return {
      token: typeof context.token === "string" ? context.token : "",
      origin: typeof context.origin === "string" && context.origin ? context.origin : fallbackOrigin,
    };
  }

  async function google(method, path, body) {
    const { token } = current();
    if (!token) throw formsError("unauthorized: Google needs you to sign in again.");
    const url = path.startsWith("https://") ? path : `${FORMS_API}${path}`;
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          accept: "application/json",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw formsError("invalid-argument: Google Forms could not be reached.");
    }
    const text = await response.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: { message: text.slice(0, 300) } };
      }
    }
    if (!response.ok) throw formsError(mapGoogleError(response.status, data, token));
    return data;
  }

  function requireFake(formId) {
    const record = store.get(formId);
    if (!record) throw formsError("not-found: That form was not found.");
    return record;
  }

  return {
    fake,
    store,
    async createForm(input) {
      const parsed = validateCreateInput(input);
      if (fake) {
        const record = store.create(parsed);
        return createResult(presentFake(record, current().origin));
      }
      const created = await google("POST", "/forms", { info: { title: parsed.title } });
      const formId = validateFormId(created.formId);
      const batch = batchUpdateBody(parsed.description, parsed.questions, 0);
      if (batch) await google("POST", `/forms/${formId}:batchUpdate`, batch);
      let published = false;
      if (parsed.publish) {
        await google("POST", `/forms/${formId}:setPublishSettings`, publishSettingsBody(true));
        published = true;
      }
      const responderUri = typeof created.responderUri === "string" ? created.responderUri : "";
      return {
        formId,
        title: parsed.title,
        responderUri,
        editUrl: editUrlFor(formId),
        published,
        questionCount: parsed.questions.length,
      };
    },
    async addQuestions(input) {
      const parsed = validateAddInput(input);
      if (fake) {
        const existing = requireFake(parsed.formId);
        const questions = normalizeQuestions(parsed.questions, existing.questions.length);
        const record = store.addQuestions(parsed.formId, questions);
        return { formId: record.formId, questionCount: record.questions.length, added: questions.length };
      }
      const form = await google("GET", `/forms/${parsed.formId}`);
      const existingCount = Array.isArray(form.items) ? form.items.length : 0;
      const questions = normalizeQuestions(parsed.questions, existingCount);
      const batch = batchUpdateBody(undefined, questions, existingCount);
      await google("POST", `/forms/${parsed.formId}:batchUpdate`, batch);
      return { formId: parsed.formId, questionCount: existingCount + questions.length, added: questions.length };
    },
    async getForm(input) {
      const formId = validateFormId(input?.formId);
      if (fake) return presentFake(requireFake(formId), current().origin);
      return presentLive(await google("GET", `/forms/${formId}`));
    },
    async listResponses(input) {
      const formId = validateFormId(input?.formId);
      const pageSize = validatePageSize(input?.pageSize);
      const pageToken = validatePageToken(input?.pageToken);
      if (fake) {
        const record = requireFake(formId);
        const page = store.listResponses(formId, pageSize, pageToken);
        if (page.invalid) throw formsError("invalid-argument: That page token is not valid.");
        const result = {
          formId,
          responses: page.responses.map((response) => ({
            responseId: response.responseId,
            createTime: response.createTime,
            answers: response.answers,
          })),
        };
        if (page.nextPageToken) result.nextPageToken = page.nextPageToken;
        return result;
      }
      const form = presentLive(await google("GET", `/forms/${formId}`));
      const titles = new Map(form.questions.map((question) => [question.questionId, question.title]));
      const query = new URLSearchParams();
      if (pageSize != null) query.set("pageSize", String(pageSize));
      if (pageToken) query.set("pageToken", pageToken);
      const suffix = query.size ? `?${query}` : "";
      const listed = await google("GET", `/forms/${formId}/responses${suffix}`);
      const responses = Array.isArray(listed.responses) ? listed.responses : [];
      const result = {
        formId,
        responses: responses.map((response) => ({
          responseId: String(response.responseId || ""),
          createTime: String(response.createTime || response.lastSubmittedTime || ""),
          answers: compactAnswers(response, titles),
        })),
      };
      if (typeof listed.nextPageToken === "string" && listed.nextPageToken) result.nextPageToken = listed.nextPageToken;
      return result;
    },
    async publishForm(input) {
      const formId = validateFormId(input?.formId);
      if (input?.accepting != null && typeof input.accepting !== "boolean") {
        throw formsError("invalid-argument: Accepting must be true or false.");
      }
      const accepting = input?.accepting !== false;
      if (fake) {
        const record = store.publish(formId, accepting) || requireFake(formId);
        const presented = presentFake(record, current().origin);
        return { formId, published: true, accepting, responderUri: presented.responderUri };
      }
      await google("POST", `/forms/${formId}:setPublishSettings`, publishSettingsBody(accepting));
      const form = await google("GET", `/forms/${formId}`);
      return {
        formId,
        published: true,
        accepting,
        responderUri: typeof form.responderUri === "string" ? form.responderUri : "",
      };
    },
  };
}

/**
 * @param {unknown} error
 * @param {string} [token]
 */
export function toolErrorText(error, token = "") {
  if (error instanceof FormsToolError) return redactFormsText(error.message, token) || "invalid-argument: Google rejected the request.";
  return "invalid-argument: Google Forms could not be reached.";
}
