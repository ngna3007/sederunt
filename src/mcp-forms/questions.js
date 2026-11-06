import { formsError } from "./errors.js";

const TITLE_MAX = 300;
const DESCRIPTION_MAX = 8000;
const QUESTION_MAX = 100;
const OPTION_MAX = 50;
const LABEL_MAX = 300;
const FORM_ID = /^[A-Za-z0-9_-]+$/;

const CHOICE = {
  multiple_choice: "RADIO",
  checkboxes: "CHECKBOX",
  dropdown: "DROP_DOWN",
};

const TYPES = new Set(["short_text", "paragraph", ...Object.keys(CHOICE), "scale", "date"]);

/**
 * @param {unknown} value
 */
function codePoints(value) {
  return Array.from(String(value ?? "")).length;
}

/**
 * @param {unknown} value
 */
function trimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * @param {unknown} value
 * @param {string} label
 */
function requireTitle(value, label) {
  if (typeof value !== "string") throw formsError(`invalid-argument: Enter a ${label}.`);
  const title = value.trim();
  if (!title) throw formsError(`invalid-argument: Enter a ${label}.`);
  if (codePoints(title) > TITLE_MAX) throw formsError(`invalid-argument: A ${label} can be at most 300 characters.`);
  return title;
}

/**
 * @param {unknown} value
 */
export function validateFormId(value) {
  const formId = trimmed(value);
  if (!formId || formId.length > 256 || !FORM_ID.test(formId)) {
    throw formsError("invalid-argument: Enter a form id.");
  }
  return formId;
}

/**
 * @param {Record<string, unknown>} question
 */
function choiceOptions(question) {
  if (!Array.isArray(question.options)) {
    throw formsError("invalid-argument: Choice questions need between 1 and 50 options.");
  }
  if (question.options.length < 1 || question.options.length > OPTION_MAX) {
    throw formsError("invalid-argument: Choice questions need between 1 and 50 options.");
  }
  const options = [];
  const seen = new Set();
  for (const option of question.options) {
    if (typeof option !== "string") throw formsError("invalid-argument: Options must not be empty.");
    const value = option.trim();
    if (!value) throw formsError("invalid-argument: Options must not be empty.");
    if (seen.has(value)) throw formsError("invalid-argument: Options must be unique.");
    seen.add(value);
    options.push({ value });
  }
  return options;
}

/**
 * @param {Record<string, unknown>} question
 */
function scaleBody(question) {
  const low = question.low == null ? 1 : question.low;
  const high = question.high == null ? 5 : question.high;
  if (!Number.isInteger(low) || !Number.isInteger(high) || low < 0 || high > 10 || low >= high) {
    throw formsError("invalid-argument: Scale bounds must be integers from 0 to 10, with low below high.");
  }
  const nested = question.labels && typeof question.labels === "object" ? question.labels : {};
  const lowLabel = trimmed(question.lowLabel) || trimmed(nested.low);
  const highLabel = trimmed(question.highLabel) || trimmed(nested.high);
  if (codePoints(lowLabel) > LABEL_MAX || codePoints(highLabel) > LABEL_MAX) {
    throw formsError("invalid-argument: A scale label can be at most 300 characters.");
  }
  const body = { low, high };
  if (lowLabel) body.lowLabel = lowLabel;
  if (highLabel) body.highLabel = highLabel;
  return { scaleQuestion: body };
}

/**
 * @param {Record<string, unknown>} question
 */
function questionBody(question) {
  if (question.type === "short_text") return { textQuestion: { paragraph: false } };
  if (question.type === "paragraph") return { textQuestion: { paragraph: true } };
  if (question.type === "date") return { dateQuestion: { includeTime: false, includeYear: true } };
  if (question.type === "scale") return scaleBody(question);
  if (Object.hasOwn(CHOICE, question.type)) {
    return { choiceQuestion: { type: CHOICE[question.type], options: choiceOptions(question) } };
  }
  throw formsError("invalid-argument: Unknown question type.");
}

/**
 * @param {unknown} question
 */
export function normalizeQuestion(question) {
  if (!question || typeof question !== "object" || Array.isArray(question)) {
    throw formsError("invalid-argument: A question needs a title and a type.");
  }
  const row = /** @type {Record<string, unknown>} */ (question);
  const title = requireTitle(row.title, "question title");
  if (typeof row.type !== "string" || !TYPES.has(row.type)) throw formsError("invalid-argument: Unknown question type.");
  if (row.required != null && typeof row.required !== "boolean") {
    throw formsError("invalid-argument: Required must be true or false.");
  }
  const required = row.required === true;
  return {
    title,
    type: row.type,
    required,
    body: questionBody({ ...row, title, type: row.type, required }),
  };
}

/**
 * @param {unknown} questions
 * @param {number} [existingCount]
 */
export function normalizeQuestions(questions, existingCount = 0) {
  if (questions == null) return [];
  if (!Array.isArray(questions)) throw formsError("invalid-argument: Questions must be a list.");
  if (existingCount + questions.length > QUESTION_MAX) {
    throw formsError("invalid-argument: A form can have at most 100 questions.");
  }
  return questions.map(normalizeQuestion);
}

/**
 * @param {unknown} input
 */
export function validateCreateInput(input) {
  const source = input && typeof input === "object" ? input : {};
  const title = requireTitle(source.title, "form title");
  let description;
  if (source.description != null) {
    if (typeof source.description !== "string") throw formsError("invalid-argument: Description must be text.");
    if (codePoints(source.description) > DESCRIPTION_MAX) {
      throw formsError("invalid-argument: A description can be at most 8000 characters.");
    }
    description = source.description;
  }
  if (source.publish != null && typeof source.publish !== "boolean") {
    throw formsError("invalid-argument: Publish must be true or false.");
  }
  const questions = normalizeQuestions(source.questions);
  return { title, description, questions, publish: source.publish !== false };
}

/**
 * @param {unknown} input
 */
export function validateAddInput(input) {
  const source = input && typeof input === "object" ? input : {};
  const formId = validateFormId(source.formId);
  if (!Array.isArray(source.questions) || source.questions.length < 1) {
    throw formsError("invalid-argument: Add at least one question.");
  }
  return { formId, questions: source.questions };
}

/**
 * @param {unknown} value
 */
export function validatePageSize(value) {
  if (value == null) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > 500) {
    throw formsError("invalid-argument: Page size must be an integer from 1 to 500.");
  }
  return value;
}

/**
 * @param {unknown} value
 */
export function validatePageToken(value) {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || value.length > 512 || /[\u0000-\u001f]/.test(value)) {
    throw formsError("invalid-argument: That page token is not valid.");
  }
  return value;
}

/**
 * @param {{ title: string, required: boolean, body: Record<string, unknown> }} question
 * @param {number} index
 */
export function createItemRequest(question, index) {
  return {
    createItem: {
      item: {
        title: question.title,
        questionItem: {
          question: {
            required: question.required === true,
            ...question.body,
          },
        },
      },
      location: { index },
    },
  };
}

/**
 * @param {string | undefined} description
 * @param {Array<{ title: string, required: boolean, body: Record<string, unknown> }>} questions
 * @param {number} startIndex
 */
export function batchUpdateBody(description, questions, startIndex) {
  const requests = [];
  if (typeof description === "string") {
    requests.push({
      updateFormInfo: {
        info: { description },
        updateMask: "description",
      },
    });
  }
  questions.forEach((question, offset) => {
    requests.push(createItemRequest(question, startIndex + offset));
  });
  if (!requests.length) return null;
  return { requests };
}

/**
 * @param {boolean} accepting
 */
export function publishSettingsBody(accepting) {
  return {
    publishSettings: {
      publishState: {
        isPublished: true,
        isAcceptingResponses: accepting === true,
      },
    },
    updateMask: "publishState",
  };
}

/**
 * @param {string} formId
 */
export function editUrlFor(formId) {
  return `https://docs.google.com/forms/d/${formId}/edit`;
}
