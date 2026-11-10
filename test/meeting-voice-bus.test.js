import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { once } from "node:events";
import { request } from "node:http";
import test from "node:test";
import { SILENT_MEETING_MP3 } from "../src/meeting/silent-clip.js";
import { applyPlayedFloor } from "../src/meeting/voice.js";
import { bindMeetingEar, clearPlayedFloor, meetingFloorClosedAt, meetingHoldRequested, offerMeetingClip, playedMeetingFloor, requestMeetingHold, stageMeetingFloor, takeMeetingClip, takeMeetingVoice } from "../src/meeting/voice-bus.js";
import { createApp } from "../src/server.js";

const secret = `whsec_${Buffer.from("recall-test-secret").toString("base64")}`;

function redisMock() {
  const ears = new Map();
  const queues = new Map();
  const calls = [];
  return {
    ears,
    queues,
    calls,
    async fetch(url, init) {
      calls.push(String(url));
      const command = JSON.parse(init.body);
      const pipeline = Array.isArray(command[0]);
      const commands = pipeline ? command : [command];
      const results = commands.map((parts) => {
        const [op, key, a] = parts;
        if (op === "SET") {
          ears.set(key, a);
          return { result: "OK" };
        }
        if (op === "GET") return { result: ears.get(key) ?? null };
        if (op === "DEL") {
          ears.delete(key);
          queues.delete(key);
          return { result: 1 };
        }
        if (op === "RPUSH") {
          const list = queues.get(key) || [];
          list.push(a);
          queues.set(key, list);
          return { result: list.length };
        }
        if (op === "LTRIM") {
          const list = queues.get(key) || [];
          queues.set(key, list.slice(Number(a)));
          return { result: "OK" };
        }
        if (op === "EXPIRE") return { result: 1 };
        if (op === "LPUSH") {
          const list = queues.get(key) || [];
          list.unshift(a);
          queues.set(key, list);
          return { result: list.length };
        }
        if (op === "LPOP") {
          const list = queues.get(key) || [];
          const item = list.shift() ?? null;
          queues.set(key, list);
          return { result: item };
        }
        return { result: null };
      });
      return { ok: true, async json() { return pipeline ? results : results[0]; } };
    },
  };
}

test("a newer clip replaces one that has not played", async () => {
  const workspace = {};
  const ear = "ab".repeat(24);
  const clip = Buffer.from("same-process-clip");
  assert.equal(await bindMeetingEar(workspace, "short", "bot-1", {}), false);
  assert.equal(await bindMeetingEar(workspace, ear, "bot-1", {}), true);
  assert.equal(await offerMeetingClip(workspace, "bot-1", Buffer.alloc(0), {}), false);
  assert.equal(await offerMeetingClip(workspace, "bot-1", Buffer.alloc(700001), {}), false);
  assert.equal(await offerMeetingClip(workspace, "missing", clip, {}), false);
  for (let i = 1; i <= 5; i += 1) {
    assert.equal(await offerMeetingClip(workspace, "bot-1", Buffer.from([i]), {}), true);
  }
  const got = [];
  for (let i = 0; i < 5; i += 1) got.push(await takeMeetingClip(workspace, ear, {}));
  assert.deepEqual(got[0], Buffer.from([5]));
  assert.equal(got[1], null);
  assert.equal(await takeMeetingClip(workspace, "nope", {}), null);
});

test("a newer clip replaces earlier ones across redis", async () => {
  const redis = redisMock();
  const env = { UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "token" };
  const join = {};
  const webhook = {};
  const page = {};
  const ear = "cd".repeat(24);
  assert.equal(await bindMeetingEar(join, ear, "bot-redis", env, redis.fetch), true);
  assert.equal(join.meetingVoice.queues.size, 0);
  for (let i = 1; i <= 5; i += 1) {
    assert.equal(await offerMeetingClip(webhook, "bot-redis", Buffer.from([i, 9]), env, redis.fetch), true);
  }
  assert.equal(webhook.meetingVoice.queues.size, 0);
  const got = [];
  for (let i = 0; i < 5; i += 1) got.push(await takeMeetingClip(page, ear, env, redis.fetch));
  assert.deepEqual([...got[0]], [5, 9]);
  assert.equal(got[1], null);
  assert.equal(redis.calls.some((url) => url.endsWith("/pipeline")), true);
  assert.equal(redis.calls.some((url) => url.includes("token")), false);
});

test("the floor stays closed until the page takes the clip", async () => {
  const workspace = {};
  const ear = "aa".repeat(24);
  assert.equal(await bindMeetingEar(workspace, ear, "bot-floor", {}), true);
  stageMeetingFloor(workspace, "bot-floor", { roomId: "bot-floor", speaker: "id:100" });
  assert.equal(await offerMeetingClip(workspace, "bot-floor", Buffer.from([1]), {}), true);
  assert.equal(await playedMeetingFloor(workspace, "bot-floor", {}), null);
  stageMeetingFloor(workspace, "bot-floor", { roomId: "bot-floor", speaker: "id:200" });
  assert.equal(await offerMeetingClip(workspace, "bot-floor", Buffer.from([2]), {}), true);
  assert.equal(await playedMeetingFloor(workspace, "bot-floor", {}), null);
  assert.deepEqual(await takeMeetingClip(workspace, ear, {}), Buffer.from([2]));
  const played = await playedMeetingFloor(workspace, "bot-floor", {});
  assert.equal(played.speaker, "id:200");
  assert.equal(played.roomId, "bot-floor");
  assert.equal(await takeMeetingClip(workspace, ear, {}), null);
  assert.equal((await playedMeetingFloor(workspace, "bot-floor", {})).speaker, "id:200");
});

test("a taken clip opens the floor for the webhook that queued it", async () => {
  const redis = redisMock();
  const env = { UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "token" };
  const webhook = {};
  const page = {};
  const ear = "bb".repeat(24);
  assert.equal(await bindMeetingEar(webhook, ear, "bot-live-floor", env, redis.fetch), true);
  stageMeetingFloor(webhook, "bot-live-floor", { roomId: "bot-live-floor", speaker: "id:100" });
  assert.equal(await offerMeetingClip(webhook, "bot-live-floor", Buffer.from([7]), env, redis.fetch), true);
  assert.equal(await playedMeetingFloor(webhook, "bot-live-floor", env, redis.fetch), null);
  assert.deepEqual([...(await takeMeetingClip(page, ear, env, redis.fetch))], [7]);
  const played = await playedMeetingFloor(webhook, "bot-live-floor", env, redis.fetch);
  assert.equal(played.speaker, "id:100");
  assert.equal(played.roomId, "bot-live-floor");
  assert.equal(await requestMeetingHold(webhook, "bot-live-floor", env, redis.fetch), true);
  assert.equal(await meetingHoldRequested(webhook, ear, env, redis.fetch), true);
  assert.equal(await meetingHoldRequested(webhook, ear, env, redis.fetch), false);
  assert.equal(await requestMeetingHold(webhook, "bot-live-floor", env, redis.fetch), true);
  assert.equal(await meetingHoldRequested(page, ear, env, redis.fetch), true);
  assert.equal(await meetingHoldRequested(page, ear, env, redis.fetch), false);
});

test("a slow hold cannot delete the replacement clip", async () => {
  const redis = redisMock();
  const env = { UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "token" };
  const log = [];
  let releaseHold = () => {};
  const holdGate = new Promise((resolve) => { releaseHold = resolve; });
  let markHold = () => {};
  const holdSeen = new Promise((resolve) => { markHold = resolve; });
  const fetch = async (url, init) => {
    const command = JSON.parse(init.body);
    const commands = Array.isArray(command[0]) ? command : [command];
    const hold = commands.some((parts) => parts[0] === "SET" && String(parts[1]).startsWith("sederunt:voice:hold:"));
    if (hold) {
      markHold();
      await holdGate;
    }
    log.push(commands.map((parts) => parts[0]).join(","));
    return redis.fetch(url, init);
  };
  const webhook = {};
  const ear = "e5".repeat(24);
  assert.equal(await bindMeetingEar(webhook, ear, "bot-slow-hold", env, fetch), true);
  assert.equal(await offerMeetingClip(webhook, "bot-slow-hold", Buffer.from([1]), env, fetch), true);
  const holding = requestMeetingHold(webhook, "bot-slow-hold", env, fetch);
  await holdSeen;
  let offered = false;
  const offering = offerMeetingClip(webhook, "bot-slow-hold", Buffer.from([2]), env, fetch).then((ok) => {
    offered = true;
    return ok;
  });
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  assert.equal(offered, false);
  assert.equal(log.filter((line) => line.includes("RPUSH")).length, 1);
  releaseHold();
  assert.equal(await holding, true);
  assert.equal(await offering, true);
  const holdAt = log.indexOf("DEL,DEL,SET,SET");
  const secondPush = log.lastIndexOf("DEL,RPUSH,EXPIRE");
  assert.equal(holdAt >= 0 && secondPush > holdAt, true);
  assert.deepEqual([...(await takeMeetingClip({}, ear, env, fetch))], [2]);
  assert.equal(await meetingHoldRequested({}, ear, env, fetch), true);
  assert.equal(await meetingHoldRequested({}, ear, env, fetch), false);
});

test("an older poll does not consume the replacement after a newer stop", async () => {
  const redis = redisMock();
  const env = { UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "token" };
  let releasePop = () => {};
  const popGate = new Promise((resolve) => { releasePop = resolve; });
  let markPop = () => {};
  const popSeen = new Promise((resolve) => { markPop = resolve; });
  let held = false;
  const fetch = async (url, init) => {
    const command = JSON.parse(init.body);
    const commands = Array.isArray(command[0]) ? command : [command];
    if (!held && commands.some((parts) => parts[0] === "LPOP")) {
      held = true;
      markPop();
      await popGate;
    }
    return redis.fetch(url, init);
  };
  const webhook = {};
  const ear = "f6".repeat(24);
  assert.equal(await bindMeetingEar(webhook, ear, "bot-old-poll", env, fetch), true);
  const older = takeMeetingClip(webhook, ear, env, fetch, 1);
  await popSeen;
  assert.equal(await takeMeetingClip(webhook, ear, env, fetch, 2), null);
  await new Promise((resolve) => setTimeout(resolve, 20));
  stageMeetingFloor(webhook, "bot-old-poll", { roomId: "bot-old-poll", speaker: "id:200" });
  assert.equal(await offerMeetingClip(webhook, "bot-old-poll", Buffer.from([2]), env, fetch), true);
  releasePop();
  assert.equal(await older, null);
  assert.equal(await playedMeetingFloor(webhook, "bot-old-poll", env, fetch), null);
  assert.deepEqual([...(await takeMeetingClip(webhook, ear, env, fetch, 3))], [2]);
  assert.equal((await playedMeetingFloor(webhook, "bot-old-poll", env, fetch)).speaker, "id:200");
});

test("a replacement queued in the same millisecond is kept", async () => {
  const redis = redisMock();
  const env = { UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "token" };
  let releasePop = () => {};
  const popGate = new Promise((resolve) => { releasePop = resolve; });
  let markPop = () => {};
  const popSeen = new Promise((resolve) => { markPop = resolve; });
  let held = false;
  const fetch = async (url, init) => {
    const command = JSON.parse(init.body);
    const commands = Array.isArray(command[0]) ? command : [command];
    if (!held && commands.some((parts) => parts[0] === "LPOP")) {
      held = true;
      markPop();
      await popGate;
    }
    return redis.fetch(url, init);
  };
  const webhook = {};
  const ear = "a7".repeat(24);
  const clock = Date.now();
  assert.equal(await bindMeetingEar(webhook, ear, "bot-same-ms", env, fetch), true);
  const older = takeMeetingClip(webhook, ear, env, fetch, 1);
  await popSeen;
  const now = Date.now;
  Date.now = () => clock;
  try {
    assert.equal(await takeMeetingClip(webhook, ear, env, fetch, 2), null);
    stageMeetingFloor(webhook, "bot-same-ms", { roomId: "bot-same-ms", speaker: "id:200" });
    assert.equal(await offerMeetingClip(webhook, "bot-same-ms", Buffer.from([2]), env, fetch), true);
  } finally {
    Date.now = now;
  }
  releasePop();
  assert.equal(await older, null);
  assert.equal(await playedMeetingFloor(webhook, "bot-same-ms", env, fetch), null);
  assert.deepEqual([...(await takeMeetingClip(webhook, ear, env, fetch, 3))], [2]);
  assert.equal((await playedMeetingFloor(webhook, "bot-same-ms", env, fetch)).speaker, "id:200");
});

test("an expired poll mark does not block the next page", async () => {
  const redis = redisMock();
  const env = { UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "token" };
  const webhook = {};
  const ear = "b8".repeat(24);
  assert.equal(await bindMeetingEar(webhook, ear, "bot-expired-poll", env, redis.fetch), true);
  const staleAt = Date.now() - 120_000;
  webhook.meetingVoice.polls.set(ear, { n: 40, at: staleAt });
  await redis.fetch("https://redis.example", {
    body: JSON.stringify(["SET", `sederunt:voice:poll:${ear}`, `40:${staleAt}`]),
  });
  stageMeetingFloor(webhook, "bot-expired-poll", { roomId: "bot-expired-poll", speaker: "id:100" });
  assert.equal(await offerMeetingClip(webhook, "bot-expired-poll", Buffer.from([9]), env, redis.fetch), true);
  assert.deepEqual([...(await takeMeetingClip(webhook, ear, env, redis.fetch, 1))], [9]);
  assert.equal((await playedMeetingFloor(webhook, "bot-expired-poll", env, redis.fetch)).speaker, "id:100");
});

test("a clip taken before a newer hold does not play", async () => {
  const redis = redisMock();
  const env = { UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "token" };
  let releaseHold = () => {};
  const holdGate = new Promise((resolve) => { releaseHold = resolve; });
  let markHold = () => {};
  const holdSeen = new Promise((resolve) => { markHold = resolve; });
  let gated = false;
  const fetch = async (url, init) => {
    if (!String(url).startsWith("https://redis.example")) return globalThis.fetch(url, init);
    const command = JSON.parse(init.body);
    const commands = Array.isArray(command[0]) ? command : [command];
    const holdRead = commands.some((parts) => parts[0] === "GET" && String(parts[1]).startsWith("sederunt:voice:hold:"));
    if (holdRead && !gated) {
      gated = true;
      markHold();
      await holdGate;
    }
    return redis.fetch(url, init);
  };
  const held = {};
  const ear = "c9".repeat(24);
  const clock = { now: Date.now() };
  const now = Date.now;
  Date.now = () => clock.now;
  const app = createApp({
    meetingVoice: held,
    env,
    fetch,
    deps: {
      memory: null,
      tatum: { async getObject() { throw new Error("Tatum read failed"); } },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    assert.equal(await bindMeetingEar({ meetingVoice: held }, ear, "bot-stale-clip", env, fetch), true);
    stageMeetingFloor({ meetingVoice: held }, "bot-stale-clip", { roomId: "bot-stale-clip", speaker: "id:100" });
    assert.equal(await offerMeetingClip({ meetingVoice: held }, "bot-stale-clip", Buffer.from([1]), env, fetch), true);
    const pending = get(port, `/meeting/voice?ear=${ear}`);
    await holdSeen;
    clock.now += 5;
    assert.equal(await requestMeetingHold({ meetingVoice: held }, "bot-stale-clip", env, fetch), true);
    releaseHold();
    const stopped = await pending;
    assert.equal(stopped.status, 204);
    assert.equal(stopped.hold, "stop");
    assert.equal(stopped.body.length, 0);
    assert.equal(await playedMeetingFloor({ meetingVoice: held }, "bot-stale-clip", env, fetch), null);
    clock.now += 5;
    stageMeetingFloor({ meetingVoice: held }, "bot-stale-clip", { roomId: "bot-stale-clip", speaker: "id:200" });
    assert.equal(await offerMeetingClip({ meetingVoice: held }, "bot-stale-clip", Buffer.from([2]), env, fetch), true);
    const next = await get(port, `/meeting/voice?ear=${ear}`);
    assert.equal(next.status, 200);
    assert.equal(next.hold, "");
    assert.deepEqual([...next.body], [2]);
    assert.equal((await playedMeetingFloor({ meetingVoice: held }, "bot-stale-clip", env, fetch)).speaker, "id:200");
  } finally {
    Date.now = now;
    releaseHold();
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("a clip queued in the same millisecond as a hold still plays", async () => {
  const redis = redisMock();
  const env = { UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "token" };
  let releaseHold = () => {};
  const holdGate = new Promise((resolve) => { releaseHold = resolve; });
  let markHold = () => {};
  const holdSeen = new Promise((resolve) => { markHold = resolve; });
  let gated = false;
  const fetch = async (url, init) => {
    const command = JSON.parse(init.body);
    const commands = Array.isArray(command[0]) ? command : [command];
    const holdRead = commands.some((parts) => parts[0] === "GET" && String(parts[1]).startsWith("sederunt:voice:hold:"));
    if (holdRead && !gated) {
      gated = true;
      markHold();
      await holdGate;
    }
    return redis.fetch(url, init);
  };
  const webhook = {};
  const ear = "d1".repeat(24);
  const clock = Date.now();
  const now = Date.now;
  Date.now = () => clock;
  try {
    assert.equal(await bindMeetingEar(webhook, ear, "bot-hold-same", env, fetch), true);
    stageMeetingFloor(webhook, "bot-hold-same", { roomId: "bot-hold-same", speaker: "id:100" });
    assert.equal(await offerMeetingClip(webhook, "bot-hold-same", Buffer.from([4]), env, fetch), true);
    const playing = takeMeetingVoice(webhook, ear, env, fetch);
    await holdSeen;
    assert.equal(await requestMeetingHold(webhook, "bot-hold-same", env, fetch), true);
    releaseHold();
    const voice = await playing;
    assert.deepEqual([...(voice.audio)], [4]);
    assert.equal(voice.stop, false);
    assert.equal((await playedMeetingFloor(webhook, "bot-hold-same", env, fetch)).speaker, "id:100");
  } finally {
    Date.now = now;
    releaseHold();
  }
});

test("an older poll does not consume a hold for the current page", async () => {
  const redis = redisMock();
  const env = { UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "token" };
  let releasePop = () => {};
  const popGate = new Promise((resolve) => { releasePop = resolve; });
  let markPop = () => {};
  const popSeen = new Promise((resolve) => { markPop = resolve; });
  let held = false;
  const fetch = async (url, init) => {
    const command = JSON.parse(init.body);
    const commands = Array.isArray(command[0]) ? command : [command];
    if (!held && commands.some((parts) => parts[0] === "LPOP")) {
      held = true;
      markPop();
      await popGate;
    }
    return redis.fetch(url, init);
  };
  const webhook = {};
  const ear = "e1".repeat(24);
  assert.equal(await bindMeetingEar(webhook, ear, "bot-old-hold", env, fetch), true);
  const older = takeMeetingVoice(webhook, ear, env, fetch, 1);
  await popSeen;
  const current = await takeMeetingVoice(webhook, ear, env, fetch, 2);
  assert.equal(current.audio, null);
  assert.equal(current.stop, false);
  assert.equal(await requestMeetingHold(webhook, "bot-old-hold", env, fetch), true);
  releasePop();
  const late = await older;
  assert.equal(late.audio, null);
  assert.equal(late.stop, false);
  assert.equal(await meetingHoldRequested(webhook, ear, env, fetch), true);
});

test("a stale poll does not consume a stop after a newer clip", async () => {
  const redis = redisMock();
  const env = { UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "token" };
  let releaseHold = () => {};
  const holdGate = new Promise((resolve) => { releaseHold = resolve; });
  let markHold = () => {};
  const holdSeen = new Promise((resolve) => { markHold = resolve; });
  let gated = false;
  const fetch = async (url, init) => {
    const command = JSON.parse(init.body);
    const commands = Array.isArray(command[0]) ? command : [command];
    const holdRead = commands.some((parts) => parts[0] === "GET" && String(parts[1]).startsWith("sederunt:voice:hold:"));
    if (holdRead && !gated) {
      gated = true;
      markHold();
      await holdGate;
    }
    return redis.fetch(url, init);
  };
  const webhook = {};
  const ear = "e2".repeat(24);
  assert.equal(await bindMeetingEar(webhook, ear, "bot-stale-stop", env, fetch), true);
  const older = takeMeetingVoice(webhook, ear, env, fetch, 1);
  await holdSeen;
  stageMeetingFloor(webhook, "bot-stale-stop", { roomId: "bot-stale-stop", speaker: "id:200" });
  assert.equal(await offerMeetingClip(webhook, "bot-stale-stop", Buffer.from([2]), env, fetch), true);
  const played = await takeMeetingVoice(webhook, ear, env, fetch, 2);
  assert.deepEqual([...(played.audio)], [2]);
  assert.equal(played.stop, false);
  assert.equal(await requestMeetingHold(webhook, "bot-stale-stop", env, fetch), true);
  releaseHold();
  const late = await older;
  assert.equal(late.audio, null);
  assert.equal(late.stop, false);
  assert.equal((await playedMeetingFloor(webhook, "bot-stale-stop", env, fetch)).speaker, "id:200");
  const stopped = await takeMeetingVoice(webhook, ear, env, fetch, 3);
  assert.equal(stopped.audio, null);
  assert.equal(stopped.stop, true);
});

test("a poll that loses after taking a hold puts that stop back", async () => {
  const redis = redisMock();
  const env = { UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "token" };
  let releaseHold = () => {};
  const holdGate = new Promise((resolve) => { releaseHold = resolve; });
  let markHold = () => {};
  const holdSeen = new Promise((resolve) => { markHold = resolve; });
  let gated = false;
  const fetch = async (url, init) => {
    const command = JSON.parse(init.body);
    const pipeline = Array.isArray(command[0]);
    const commands = pipeline ? command : [command];
    const holdRead = commands.some((parts) => parts[0] === "GET" && String(parts[1]).startsWith("sederunt:voice:hold:"));
    if (pipeline && holdRead && !gated) {
      gated = true;
      markHold();
      await holdGate;
    }
    return redis.fetch(url, init);
  };
  const webhook = {};
  const ear = "e3".repeat(24);
  assert.equal(await bindMeetingEar(webhook, ear, "bot-put-back-stop", env, fetch), true);
  const older = takeMeetingVoice(webhook, ear, env, fetch, 1);
  await holdSeen;
  stageMeetingFloor(webhook, "bot-put-back-stop", { roomId: "bot-put-back-stop", speaker: "id:200" });
  assert.equal(await offerMeetingClip(webhook, "bot-put-back-stop", Buffer.from([2]), env, fetch), true);
  const played = await takeMeetingVoice(webhook, ear, env, fetch, 2);
  assert.deepEqual([...(played.audio)], [2]);
  assert.equal(played.stop, false);
  assert.equal(await requestMeetingHold(webhook, "bot-put-back-stop", env, fetch), true);
  releaseHold();
  const late = await older;
  assert.equal(late.audio, null);
  assert.equal(late.stop, false);
  assert.equal((await playedMeetingFloor(webhook, "bot-put-back-stop", env, fetch)).speaker, "id:200");
  const stopped = await takeMeetingVoice(webhook, ear, env, fetch, 3);
  assert.equal(stopped.audio, null);
  assert.equal(stopped.stop, true);
});

test("a stale clip does not play after another poll takes the stop", async () => {
  const redis = redisMock();
  const env = { UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "token" };
  let releasePoll = () => {};
  const pollGate = new Promise((resolve) => { releasePoll = resolve; });
  let markPoll = () => {};
  const pollSeen = new Promise((resolve) => { markPoll = resolve; });
  let pollGets = 0;
  const fetch = async (url, init) => {
    const command = JSON.parse(init.body);
    const commands = Array.isArray(command[0]) ? command : [command];
    const pollRead = commands.some((parts) => parts[0] === "GET" && String(parts[1]).startsWith("sederunt:voice:poll:"));
    if (pollRead) {
      pollGets += 1;
      if (pollGets === 2) {
        markPoll();
        await pollGate;
      }
    }
    return redis.fetch(url, init);
  };
  const webhook = {};
  const ear = "e4".repeat(24);
  const clock = { now: Date.now() };
  const now = Date.now;
  Date.now = () => clock.now;
  try {
    assert.equal(await bindMeetingEar(webhook, ear, "bot-escaped-clip", env, fetch), true);
    stageMeetingFloor(webhook, "bot-escaped-clip", { roomId: "bot-escaped-clip", speaker: "id:100" });
    assert.equal(await offerMeetingClip(webhook, "bot-escaped-clip", Buffer.from([1]), env, fetch), true);
    const newer = takeMeetingVoice(webhook, ear, env, fetch, 2);
    await pollSeen;
    clock.now += 5;
    assert.equal(await requestMeetingHold(webhook, "bot-escaped-clip", env, fetch), true);
    const older = await takeMeetingVoice(webhook, ear, env, fetch, 1);
    assert.equal(older.audio, null);
    assert.equal(older.stop, true);
    releasePoll();
    const voice = await newer;
    assert.equal(voice.audio, null);
    assert.equal(voice.stop, false);
    assert.equal(await playedMeetingFloor(webhook, "bot-escaped-clip", env, fetch), null);
  } finally {
    Date.now = now;
    releasePoll();
  }
});

test("a stale poll does not replace a newer clip's floor", async () => {
  const redis = redisMock();
  const env = { UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "token" };
  let releaseClosed = () => {};
  const closedGate = new Promise((resolve) => { releaseClosed = resolve; });
  let markClosed = () => {};
  const closedSeen = new Promise((resolve) => { markClosed = resolve; });
  let gated = false;
  const fetch = async (url, init) => {
    const command = JSON.parse(init.body);
    const commands = Array.isArray(command[0]) ? command : [command];
    const closedRead = commands.some((parts) => parts[0] === "GET" && String(parts[1]).startsWith("sederunt:voice:closed:"));
    if (closedRead && !gated) {
      gated = true;
      markClosed();
      await closedGate;
    }
    return redis.fetch(url, init);
  };
  const webhook = {};
  const ear = "e6".repeat(24);
  const clock = { now: Date.now() };
  const now = Date.now;
  Date.now = () => clock.now;
  try {
    assert.equal(await bindMeetingEar(webhook, ear, "bot-stale-floor", env, fetch), true);
    stageMeetingFloor(webhook, "bot-stale-floor", { roomId: "bot-stale-floor", speaker: "id:100" });
    assert.equal(await offerMeetingClip(webhook, "bot-stale-floor", Buffer.from([1]), env, fetch), true);
    const older = takeMeetingVoice(webhook, ear, env, fetch, 1);
    await closedSeen;
    clock.now += 5;
    stageMeetingFloor(webhook, "bot-stale-floor", { roomId: "bot-stale-floor", speaker: "id:200" });
    assert.equal(await offerMeetingClip(webhook, "bot-stale-floor", Buffer.from([2]), env, fetch), true);
    const played = await takeMeetingVoice(webhook, ear, env, fetch, 2);
    assert.deepEqual([...(played.audio)], [2]);
    assert.equal(played.stop, false);
    assert.equal((await playedMeetingFloor(webhook, "bot-stale-floor", env, fetch)).speaker, "id:200");
    releaseClosed();
    const late = await older;
    assert.equal(late.audio, null);
    assert.equal(late.stop, false);
    assert.equal((await playedMeetingFloor(webhook, "bot-stale-floor", env, fetch)).speaker, "id:200");
  } finally {
    Date.now = now;
    releaseClosed();
  }
});

test("taking one clip does not open the floor of the clip that replaced it", async () => {
  const lists = new Map();
  const kv = new Map();
  const pushed = [];
  let forced = false;
  const env = { UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "token" };
  const fetch = async (_url, init) => {
    const command = JSON.parse(init.body);
    const pipeline = Array.isArray(command[0]);
    const commands = pipeline ? command : [command];
    const results = commands.map((parts) => {
      const [op, key, a] = parts;
      if (op === "SET") {
        kv.set(key, a);
        return { result: "OK" };
      }
      if (op === "GET") return { result: kv.get(key) ?? null };
      if (op === "DEL") {
        kv.delete(key);
        lists.delete(key);
        return { result: 1 };
      }
      if (op === "RPUSH") {
        pushed.push(a);
        const list = lists.get(key) || [];
        list.push(a);
        lists.set(key, list);
        return { result: list.length };
      }
      if (op === "EXPIRE") return { result: 1 };
      if (op === "LPOP") {
        if (!forced && pushed.length > 1) {
          forced = true;
          return { result: pushed[0] };
        }
        const list = lists.get(key) || [];
        const item = list.shift() ?? null;
        lists.set(key, list);
        return { result: item };
      }
      return { result: null };
    });
    return { ok: true, async json() { return pipeline ? results : results[0]; } };
  };
  const workspace = {};
  const ear = "c3".repeat(24);
  assert.equal(await bindMeetingEar(workspace, ear, "bot-race", env, fetch), true);
  stageMeetingFloor(workspace, "bot-race", { roomId: "bot-race", speaker: "id:100" });
  assert.equal(await offerMeetingClip(workspace, "bot-race", Buffer.from([1]), env, fetch), true);
  stageMeetingFloor(workspace, "bot-race", { roomId: "bot-race", speaker: "id:200" });
  assert.equal(await offerMeetingClip(workspace, "bot-race", Buffer.from([2]), env, fetch), true);
  assert.deepEqual([...(await takeMeetingClip(workspace, ear, env, fetch))], [1]);
  assert.equal((await playedMeetingFloor(workspace, "bot-race", env, fetch)).speaker, "id:100");
  assert.deepEqual([...(await takeMeetingClip(workspace, ear, env, fetch))], [2]);
  assert.equal((await playedMeetingFloor(workspace, "bot-race", env, fetch)).speaker, "id:200");
});

test("a newer played floor replaces the cached speaker", async () => {
  const redis = redisMock();
  const env = { UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "token" };
  const webhook = {};
  const ear = "d4".repeat(24);
  assert.equal(await bindMeetingEar(webhook, ear, "bot-cache", env, redis.fetch), true);
  stageMeetingFloor(webhook, "bot-cache", { roomId: "bot-cache", speaker: "id:100" });
  assert.equal(await offerMeetingClip(webhook, "bot-cache", Buffer.from([1]), env, redis.fetch), true);
  assert.deepEqual([...(await takeMeetingClip({}, ear, env, redis.fetch))], [1]);
  assert.equal((await playedMeetingFloor(webhook, "bot-cache", env, redis.fetch)).speaker, "id:100");
  const newer = { roomId: "bot-cache", speaker: "id:200", until: Date.now() + 90_000, at: Date.now() + 50 };
  await redis.fetch("https://redis.example", {
    body: JSON.stringify(["SET", "sederunt:voice:floor:bot-cache", JSON.stringify(newer)]),
  });
  assert.equal((await playedMeetingFloor(webhook, "bot-cache", env, redis.fetch)).speaker, "id:200");
});

test("closing the floor keeps a later read from restoring it", async () => {
  const redis = redisMock();
  const env = { UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "token" };
  const webhook = {};
  const ear = "e5".repeat(24);
  assert.equal(await bindMeetingEar(webhook, ear, "bot-thanks", env, redis.fetch), true);
  stageMeetingFloor(webhook, "bot-thanks", { roomId: "bot-thanks", speaker: "id:100" });
  assert.equal(await offerMeetingClip(webhook, "bot-thanks", Buffer.from([1]), env, redis.fetch), true);
  assert.deepEqual([...(await takeMeetingClip({}, ear, env, redis.fetch))], [1]);
  const opened = await playedMeetingFloor(webhook, "bot-thanks", env, redis.fetch);
  assert.equal(opened.speaker, "id:100");
  const session = { meetingFloor: { roomId: "bot-thanks", speaker: opened.speaker, until: opened.until, at: opened.at } };
  await clearPlayedFloor(webhook, "bot-thanks", env, redis.fetch);
  const played = await playedMeetingFloor(webhook, "bot-thanks", env, redis.fetch);
  assert.equal(played, null);
  assert.equal(applyPlayedFloor(session, played, "bot-thanks", meetingFloorClosedAt(webhook, "bot-thanks")), false);
  assert.equal(session.meetingFloor, undefined);
  const stale = { meetingVoice: { played: new Map([["bot-thanks", opened]]) } };
  assert.equal(await playedMeetingFloor(stale, "bot-thanks", env, redis.fetch), null);
  stageMeetingFloor(webhook, "bot-thanks", { roomId: "bot-thanks", speaker: "id:100" });
  assert.equal(await offerMeetingClip(webhook, "bot-thanks", Buffer.from([2]), env, redis.fetch), true);
  await clearPlayedFloor(webhook, "bot-thanks", env, redis.fetch);
  assert.deepEqual([...(await takeMeetingClip({}, ear, env, redis.fetch))], [2]);
  assert.equal(await playedMeetingFloor(webhook, "bot-thanks", env, redis.fetch), null);
});

test("the meeting page receives one clip and a bad ear gets nothing", async () => {
  const held = {};
  const ear = "ef".repeat(24);
  const clip = Buffer.from("page-bytes");
  const app = createApp({
    meetingVoice: held,
    deps: {
      memory: null,
      tatum: { async getObject() { throw new Error("Tatum read failed"); } },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    const page = await get(port, "/meeting?name=Adam");
    assert.equal(page.status, 200);
    assert.match(page.raw, /Sederunt/);
    assert.match(page.raw, /\/meeting\/voice/);
    assert.match(page.raw, /x-sederunt-hold/);
    assert.doesNotMatch(page.raw, /loudTicks/);
    assert.doesNotMatch(page.raw, /getUserMedia/);
    assert.match(page.raw, /textContent/);
    assert.match(page.raw, /#081428/);
    assert.doesNotMatch(page.raw, /#f4f3ef/);
    assert.doesNotMatch(page.raw, /Quiet until addressed/);
    assert.doesNotMatch(page.raw, /Say this name/);
    assert.doesNotMatch(page.raw, /destination/);
    assert.equal(await bindMeetingEar({ meetingVoice: held }, ear, "bot-page", {}), true);
    assert.equal(await offerMeetingClip({ meetingVoice: held }, "bot-page", clip, {}), true);
    const first = await get(port, `/meeting/voice?ear=${ear}`);
    assert.equal(first.status, 200);
    assert.equal(first.type, "audio/mpeg");
    assert.equal(first.cache, "no-store");
    assert.equal(first.body.equals(clip), true);
    const second = await get(port, `/meeting/voice?ear=${ear}`);
    assert.equal(second.status, 204);
    assert.equal(second.cache, "no-store");
    assert.equal(second.body.length, 0);
    assert.equal(second.hold, "");
    assert.equal(await requestMeetingHold({ meetingVoice: held }, "bot-page", {}), true);
    const stopped = await get(port, `/meeting/voice?ear=${ear}`);
    assert.equal(stopped.status, 204);
    assert.equal(stopped.hold, "stop");
    const quiet = await get(port, `/meeting/voice?ear=${ear}`);
    assert.equal(quiet.hold, "");
    const missing = await get(port, "/meeting/voice?ear=short");
    assert.equal(missing.status, 204);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("joining binds the ear the meeting page polls", async () => {
  const held = {};
  const ear = "a1".repeat(24);
  const app = createApp({
    companyLoaded: true,
    linearReady: true,
    meetingVoice: held,
    env: {
      RECALL_API_KEY: "recall-key",
      RECALL_WEBHOOK_SECRET: secret,
      SEDERUNT_PUBLIC_ORIGIN: "https://camera.example",
      SLACK_SIGNING_SECRET: "slack-signing",
      SLACK_BOT_TOKEN: "slack-bot",
      SEDERUNT_MEMBER: "100",
      CONSOLE_API_KEY: "console-key",
      CONSOLE_SERVICE_PRIVATE_KEY: "console-service",
      CONSOLE_FOLDER_ID: "folder",
      COMPANY_MEMWAL_KEY: "company-key",
      COMPANY_MEMWAL_ACCOUNT_ID: "company-account",
    },
    deps: {
      meeting: { async join() { return { id: "bot-live", ear }; } },
      memory: {
        async remember() { return { blobId: null }; },
        async index() { return []; },
        async recall() { return []; },
      },
      tatum: { async getObject() { return { text: "", checkpoint: null, objectId: null }; } },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  try {
    const joined = await post(port, "/api/join", JSON.stringify({
      url: "https://meet.google.com/abc-defg-hij",
    }));
    assert.equal(JSON.parse(joined.raw).join, "sent");
    assert.equal(held.ears.get("bot-live"), ear);
    const clip = Buffer.from([1, 2, 3, 4]);
    assert.equal(await offerMeetingClip({ meetingVoice: held }, "bot-live", clip, {}), true);
    const played = await get(port, `/meeting/voice?ear=${ear}`);
    assert.equal(played.status, 200);
    assert.equal(played.body.equals(clip), true);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  }
});

test("the camera tile shows the guest name and plays one clip", { timeout: 60000 }, async (t) => {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    t.skip("playwright is not installed");
    return;
  }
  const executablePath = await browserPath(chromium);
  if (!executablePath) {
    t.skip("no browser binary found");
    return;
  }
  const held = {};
  const ear = "b2".repeat(24);
  const app = createApp({
    meetingVoice: held,
    deps: {
      memory: null,
      tatum: { async getObject() { throw new Error("Tatum read failed"); } },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  const browser = await chromium.launch({
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  t.after(async () => {
    await browser.close();
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  });
  const origin = `http://127.0.0.1:${port}`;
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`${origin}/meeting?name=${encodeURIComponent("Adam <b>no</b>")}&ear=${ear}`);
    await page.locator("#guest").waitFor();
    assert.equal(await page.locator("#guest").innerText(), "Adam <b>no</b>");
    assert.equal((await page.locator("#guest b").count()), 0);
    const box = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      color: getComputedStyle(document.body).backgroundColor,
      ink: getComputedStyle(document.getElementById("guest")).color,
    }));
    assert.equal(box.scroll <= box.client, true);
    assert.equal(box.color, "rgb(8, 20, 40)");
    assert.equal(box.ink, "rgb(250, 248, 245)");
    assert.equal(await bindMeetingEar({ meetingVoice: held }, ear, "bot-tile", {}), true);
    const spoken = Buffer.concat(Array.from({ length: 40 }, () => SILENT_MEETING_MP3));
    assert.equal(await offerMeetingClip({ meetingVoice: held }, "bot-tile", spoken, {}), true);
    await page.waitForFunction(() => {
      const audio = document.querySelector("#voice");
      const name = document.getElementById("guest");
      return Boolean(audio && audio.currentSrc.startsWith("blob:") && audio.paused === false && name.className === "speaking");
    });
    await page.evaluate(() => stopTalking());
    await page.waitForFunction(() => {
      const audio = document.querySelector("#voice");
      const name = document.getElementById("guest");
      return Boolean(audio && audio.paused === true && name.className === "");
    });
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test("a late stop does not cut a clip a newer poll started", { timeout: 30000 }, async (t) => {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    t.skip("playwright is not installed");
    return;
  }
  const executablePath = await browserPath(chromium);
  if (!executablePath) {
    t.skip("no browser binary found");
    return;
  }
  const ear = "c4".repeat(24);
  const app = createApp({
    deps: {
      memory: null,
      tatum: { async getObject() { throw new Error("Tatum read failed"); } },
    },
  });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const port = app.address().port;
  const browser = await chromium.launch({
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
  });
  let releaseStop = () => {};
  const stopGate = new Promise((resolve) => { releaseStop = resolve; });
  t.after(async () => {
    releaseStop();
    await browser.close();
    await new Promise((resolve, reject) => app.close((error) => (error ? reject(error) : resolve())));
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  let calls = 0;
  const tickets = [];
  let markSecond = () => {};
  const secondSeen = new Promise((resolve) => { markSecond = resolve; });
  const spoken = Buffer.concat(Array.from({ length: 80 }, () => SILENT_MEETING_MP3));
  await page.route("**/meeting/voice**", async (route) => {
    calls += 1;
    tickets.push(Number(new URL(route.request().url()).searchParams.get("n")));
    if (calls === 1) {
      await stopGate;
      await route.fulfill({ status: 204, headers: { "x-sederunt-hold": "stop" }, body: "" });
      return;
    }
    if (calls === 2) {
      markSecond();
      await route.fulfill({ status: 200, contentType: "audio/mpeg", body: spoken });
      return;
    }
    await route.fulfill({ status: 204, body: "" });
  });
  await page.goto(`http://127.0.0.1:${port}/meeting?name=Adam&ear=${ear}`);
  const overlapped = await Promise.race([
    secondSeen.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 2000)),
  ]);
  assert.equal(overlapped, true);
  assert.equal(tickets[0] > 1_000_000_000_000, true);
  assert.equal(tickets[1] > tickets[0], true);
  await page.waitForFunction(() => {
    const audio = document.querySelector("#voice");
    const name = document.getElementById("guest");
    return Boolean(audio && audio.currentSrc.startsWith("blob:") && audio.paused === false && name.className === "speaking");
  });
  releaseStop();
  await new Promise((resolve) => setTimeout(resolve, 400));
  const still = await page.evaluate(() => {
    const audio = document.querySelector("#voice");
    const name = document.getElementById("guest");
    return Boolean(audio && audio.paused === false && audio.currentSrc.startsWith("blob:") && name.className === "speaking");
  });
  assert.equal(still, true);
  assert.deepEqual(errors, []);
  await page.close();
});

function get(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: "GET" }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        type: String(res.headers["content-type"] || ""),
        cache: String(res.headers["cache-control"] || ""),
        hold: String(res.headers["x-sederunt-hold"] || ""),
        body: Buffer.concat(chunks),
        raw: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    req.on("error", reject);
    req.end();
  });
}

function post(port, path, body) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port,
      path,
      method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end(body);
  });
}

async function browserPath(chromium) {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
  ].filter(Boolean);
  for (const path of candidates) {
    try {
      await access(path);
      return path;
    } catch {
      // Try the next binary.
    }
  }
  try {
    const bundled = chromium.executablePath();
    await access(bundled);
    return bundled;
  } catch {
    return "";
  }
}
