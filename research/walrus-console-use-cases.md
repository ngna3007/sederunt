# Walrus Console use cases

Checked 20 Oct 2026. Architecture, encryption, the 100 MiB / 5 GB / five-folder caps, the MCP tool list, and the memory-versus-file boundary are in [walrus-console.md](walrus-console.md). This note is only the scenes a landing can show. No key is recorded here.

Primary pages opened: the Walrus Memory overview, the system-prompt templates, the codebase guide, the three example apps, the MCP reference, the import guide, the relayer API, the Console MCP page, and the Walrus Memory product page. MemWal repo docs are the source lines those pages print (`docs/` on `github.com/MystenLabs/MemWal`). If a page does not say a thing, this note says so.

## 1. What maps, and what is only our story

The documented scenes are chat, notes, research, codebase, multi-agent, personal assistant, and analyze-a-transcript. None of those pages names Slack, a spoken call, or an announcement. None names Linear, a calendar item, or two people claiming the same work.

| Sederunt source | Real mapping | Only our product story |
| --- | --- | --- |
| A Slack decision | A decision written as one complete sentence is what `remember` stores. The universal starter says to save a preference, decision, constraint, correction, identity detail, or recurring workflow, and to pass the complete statement. Chat apps "capture valuable knowledge from conversations." Noter turns note text into facts. | Nothing on these pages reads Slack, a channel, or a thread. "In #billing" is a sentence someone pasted. It is not a Slack connection. |
| A spoken call | Once the call is text, `analyze` extracts facts. The personal-assistant template says to analyze a pasted transcript, note, or email thread. The MCP tool's text is "Conversation transcript, note, or arbitrary text." The import guide says recall works on short facts, and that a raw transcript stored as one memory matches poorly. | No Memory page accepts a recording. The import guide's "session transcript" is a Claude, Codex, or Cursor chat log (`.jsonl`), not a meeting. Sitting in the call is our story. |
| An announcement that names a PDF and an image | A short announcement is one `remember` sentence, the same shape as a note. A long one can go through `analyze`, which stores facts, not the passage. The research template says to store the conclusion and the link, not the corpus, and to put a source URL on each finding. | "Link" on that page is a source URL. It is not a Console file, a PDF, or an image. No page says a memory names a Console file, or that the name fetches one. Hold (both claims stay) and File (nothing until yes) are not on these pages. |

Sources: [What is Walrus Memory?](https://docs.wal.app/walrus-memory), headings "Use cases" and "Example apps". [System Prompt Templates](https://docs.wal.app/walrus-memory/guides/system-prompt-templates), headings "Universal starter", "Personal assistant", and "Research agent". [Reference](https://docs.wal.app/walrus-memory/mcp/reference), headings "Memwal_remember" and "Memwal_analyze". [Noter Example](https://docs.wal.app/walrus-memory/examples/noter), heading "How it uses Walrus memory". [Import Your Existing Memory](https://docs.wal.app/walrus-memory/guides/import-existing-memory), heading "What to copy".

`remember` submits text. `recall` returns decrypted plaintext: `text`, `blob_id`, `distance`, and `score`. `analyze` extracts facts with an LLM and enqueues each fact as its own memory. `ask` returns an answer plus the memory texts it used. None of those bodies is a file. Source: [Relayer API Reference](https://docs.wal.app/walrus-memory/relayer/api-reference), headings "POST /api/remember", "POST /api/recall", "POST /api/analyze", and "POST /api/ask".

## 2. An announcement with a PDF and an image

Honest flow:

1. Write one sentence that states the decision and names both files. Store that sentence with `remember`. Use `analyze` only when the announcement is a long passage and you want facts split out of the text. `analyze` does not accept the PDF or the image. Its input is text. Source: [Relayer API Reference](https://docs.wal.app/walrus-memory/relayer/api-reference), headings "POST /api/remember" and "POST /api/analyze", and [Reference](https://docs.wal.app/walrus-memory/mcp/reference), heading "Memwal_analyze".
2. Prefer `remember` for the naming sentence. `analyze` keeps extracted facts, not the passage. The import guide says one `analyze` call accepts at most 64 KiB and returns at most 20 facts, and that a dense chunk can drop facts past that cap. The relayer heading for `POST /api/analyze` shows `facts` and `fact_count` and does not state those caps. The 64 KiB line on that page is under `POST /api/embed`, for embed text. A filename survives `analyze` only if the extractor keeps it. Source: [Import Your Existing Memory](https://docs.wal.app/walrus-memory/guides/import-existing-memory), heading "Ask the agent to upload".
3. Upload the PDF and the image separately, in the Console web app or with `upload_file`. `upload_file` encrypts and uploads a local file. `download_file` downloads and decrypts a file to disk. Both stay inside workspace roots the client advertises, or folders chosen at install. Source: [What is Walrus Console?](https://docs.wal.app/docs/console/overview), the opening paragraph, and [Connect AI Clients with the MCP Server](https://docs.wal.app/docs/console/mcp-server), headings "Available tools" and "Where the server can read and write files".
4. The sentence names the files in words. The docs do not describe a key from a memory to a Console file. A name inside the sentence is text.

The next morning, the user can:

- Ask who decided it, and which file was named. `recall` returns the sentence. `ask` returns an answer and the memory texts it used. Source: [Relayer API Reference](https://docs.wal.app/walrus-memory/relayer/api-reference), headings "POST /api/recall" and "POST /api/ask".
- Open the PDF or the image from the Console web app, or with `download_file` on a machine that has the Console service key, into a path that tool is allowed to write. That download is the file. It is not a memory recall.

The user cannot:

- Get the PDF or the image bytes from `recall` or `ask`. Both return text. The manual recall path returns index hits only, and the client then downloads and decrypts that memory blob. That blob is the memory, which decrypts to the sentence, not the Console file. Source: [Relayer API Reference](https://docs.wal.app/walrus-memory/relayer/api-reference), headings "POST /api/recall" and "POST /api/recall/manual", and [Sign in as a Returning User](https://docs.wal.app/walrus-memory/guides/returning-user), heading "Walrus Memory does not migrate existing data".
- Treat the filename as an attachment. Nothing on these pages fetches a Console file because a sentence mentioned it.
- Hand `analyze` the PDF. The tool extracts from text.

`remember` returns when the job is accepted, not when the blob is durable. A Console upload is also asynchronous. "The next morning" assumes both finished. Source: [Relayer API Reference](https://docs.wal.app/walrus-memory/relayer/api-reference), heading "POST /api/remember".

## 3. Three scenes

Work only. No offsite, venue, or travel. Four lines each. A landing can print these without claiming a connection the docs do not have.

Slack. A pasted line, not a Slack connection.

In #billing, Sam owns the changelog. The seat price stays as announced.
Sederunt keeps that sentence. It does not read Slack.
The next morning, ask who owns the changelog. The answer is that sentence.
A question files nothing.

Call. A transcript turned into facts, not a recording.

The call is pasted as text. Analyze splits out the facts.
One fact: the November release cutoff is the 12th. Lee writes the note.
The next morning, ask when the cutoff is. That fact comes back.
The recording does not. The whole transcript does not come back as one memory.

Announcement. A sentence that names two files.

Friday's announcement: the seat price is final. The note is pricing.pdf. The figure is diagram.png.
That sentence is the memory. The PDF and the image are uploaded apart, in Console.
The next morning, ask which file holds the price. The sentence comes back, with both names.
Recall does not return either file. Opening one is a Console download.

## 4. No sixth block

The docs support scenes the five jobs do not show. None of them is more useful on this landing than Keep, Ask, Open, Hold, and File.

| Documented scene | What the page actually says | Why it is not a sixth block |
| --- | --- | --- |
| Codebase | Store small chunks of code and project context with `rememberBulk`. Use `analyze` on a pull-request description. Recall the closest chunks for the next question. Skip the file that is currently open. | Ask already covers a question from a coding agent. Storing the repository is a different product. |
| CRM | One namespace per customer. Remember plan, preferences, commitments, pain points, and resolutions. Never write payment details, passwords, or government identifiers. | A support queue, not a decision from Slack, a call, or an announcement. |
| Personal assistant, beyond a transcript | Preferences, relationships, commitments, constraints, corrections. The page includes food, travel, birthdays, and allergies. | The transcript line is already the call inside Keep. The profile is not this landing. "Commitments" and "recurring meetings" are text to remember, not a calendar write. |
| Research sprints | Researcher stores one sprint report, with references and sources, using `remember`. The template stores the conclusion and the source URL, not the corpus. | That is the mechanism of Open. It does not add a job. |
| Noter and the chatbot | Noter runs `analyze` on note text. The chatbot wraps the model so recall runs before a reply and new context can save after it. | Both are how Keep and Ask work, not new jobs. |
| Multi-agent | "Shared memory spaces" for task lists, knowledge bases, and coordination state. The product page says "Create multi-agent workflows with shared memory." The sample under that line is one `remember` and one `recall`. | Ask already says the question can come from another agent. The pages do not say two conflicting claims both stay. The research template says to record which source you judged more credible. That is the opposite of Hold. |
| Import and restore | Copy local agent facts, standing instructions, and a coding-session transcript in. `restore` rebuilds an index and does not return the texts. | Setup and recovery. Not a job a visitor does. |

Sources: [Codebase Memory for Coding Assistants](https://docs.wal.app/walrus-memory/sdk/codebase-memory), headings "Store codebase context" and "Recall relevant context at query time". [System Prompt Templates](https://docs.wal.app/walrus-memory/guides/system-prompt-templates), headings "Coding agent", "CRM And customer support", "Personal assistant", and "Research agent". [Researcher Example](https://docs.wal.app/walrus-memory/examples/researcher), heading "How it uses Walrus memory". [Chatbot Example](https://docs.wal.app/walrus-memory/examples/chatbot), heading "How it uses Walrus memory". [What is Walrus Memory?](https://docs.wal.app/walrus-memory), heading "Use cases". [Walrus Memory](https://walrus.xyz/products/walrus-memory/), the "Build agents" block. [Reference](https://docs.wal.app/walrus-memory/mcp/reference), heading "Memwal_restore".

Hold and File stay because they are Sederunt's rules. No Walrus page documents them. Do not add a sixth block to explain them.

Clients the Memory MCP quick start names: Claude Code, Claude Desktop, Cursor, Codex, OpenCode, and Antigravity. The overview also names the ChatGPT desktop app, because it ships Codex, and says ChatGPT web connectors are not supported. The product page adds the words "Gemini CLI, and more" and does not show a setup. The quick start table does not list Gemini CLI, Copilot, or Windsurf. Source: [MCP Quick Start](https://docs.wal.app/walrus-memory/mcp/quickstart), the client table, [MCP](https://docs.wal.app/walrus-memory/mcp/overview), the client table, and [Walrus Memory](https://walrus.xyz/products/walrus-memory/), "Connect an agent". That roster is not a sixth job. Ask can say Claude Code and any agent that speaks this MCP. It should not name a client the table does not list.

## 5. File scene: safe sentence, false sentence

Safe:

- The announcement is one sentence in Walrus Memory. The PDF and the image are separate Console files. The sentence names them.
- The next morning, a question returns that sentence, including the file names.
- The files are uploaded in the Console web app, or with `upload_file`. `remember` and `analyze` do not upload them.
- Opening a file the next morning is a Console download. `download_file` decrypts it on the machine that holds the service key, inside a folder that tool may write.
- `ask` returns an answer and the memory text it used. It does not return the file.

False:

- The PDF is inside the memory.
- Recall returns the PDF or the image.
- The file name in the sentence is a link that opens the file.
- Analyze reads the PDF.
- A question about the file downloads it.
- Console shows the announcement beside the file. The product page says "alongside." The docs do not say one screen pairs the sentence with the file. The Memory tab limit is already in the Console note.
