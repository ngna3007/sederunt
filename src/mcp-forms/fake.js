/**
 * In-memory forms. Ids are deterministic for a store: fake-form-1, fake-form-2, …
 * A seeded form is already there so list_responses has something to read.
 */
export function createFakeFormsStore() {
  let sequence = 0;
  const forms = new Map();
  forms.set("fake-form-seed", {
    formId: "fake-form-seed",
    title: "Weekly feedback",
    description: "How did the week go?",
    published: true,
    accepting: true,
    questions: [
      { questionId: "q-seed-1", title: "How was the week?", type: "short_text", required: true },
      { questionId: "q-seed-2", title: "Anything else?", type: "paragraph", required: false },
    ],
    responses: [
      {
        responseId: "resp-seed-1",
        createTime: "2026-11-01T09:00:00.000Z",
        answers: { "How was the week?": "Good", "Anything else?": "Ship it" },
      },
      {
        responseId: "resp-seed-2",
        createTime: "2026-11-02T09:00:00.000Z",
        answers: { "How was the week?": "Busy" },
      },
    ],
  });

  function nextId() {
    sequence += 1;
    return `fake-form-${sequence}`;
  }

  return {
    create({ title, description, questions, publish }) {
      const formId = nextId();
      const record = {
        formId,
        title,
        description: description || "",
        published: publish === true,
        accepting: publish === true,
        questions: questions.map((question, index) => ({
          questionId: `q-${formId}-${index + 1}`,
          title: question.title,
          type: question.type,
          required: question.required === true,
        })),
        responses: [],
      };
      forms.set(formId, record);
      return record;
    },
    get(formId) {
      return forms.get(formId) || null;
    },
    addQuestions(formId, questions) {
      const record = forms.get(formId);
      if (!record) return null;
      const start = record.questions.length;
      const added = questions.map((question, offset) => ({
        questionId: `q-${formId}-${start + offset + 1}`,
        title: question.title,
        type: question.type,
        required: question.required === true,
      }));
      record.questions = [...record.questions, ...added];
      return record;
    },
    publish(formId, accepting) {
      const record = forms.get(formId);
      if (!record) return null;
      record.published = true;
      record.accepting = accepting === true;
      return record;
    },
    listResponses(formId, pageSize, pageToken) {
      const record = forms.get(formId);
      if (!record) return null;
      const all = record.responses;
      if (pageSize == null) return { responses: all, nextPageToken: "" };
      const offset = pageToken ? Number(pageToken) : 0;
      if (!Number.isInteger(offset) || offset < 0 || String(offset) !== String(pageToken || 0)) return { invalid: true };
      const slice = all.slice(offset, offset + pageSize);
      const next = offset + pageSize;
      return { responses: slice, nextPageToken: next < all.length ? String(next) : "" };
    },
  };
}
