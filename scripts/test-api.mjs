// End-to-end API tests against a running app (default http://127.0.0.1:3000)
// that is pointed at the mock LLM server. Run:
//   npm run mock-llm &
//   OPENAI_API_KEY=test OPENAI_BASE_URL=http://127.0.0.1:8788/v1 npm run build && npm start &
//   npm run test:api
import assert from "node:assert/strict";

const BASE = process.env.APP_URL ?? "http://127.0.0.1:3000";
const jar = new Map();
function cookieHeader() { return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "); }
function storeCookies(res) {
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) { const [kv] = c.split(";"); const [k, v] = kv.split("="); jar.set(k, v); }
}
async function call(path, init = {}, { raw = false } = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "content-type": "application/json", cookie: cookieHeader(), origin: BASE, ...(init.headers ?? {}) },
  });
  storeCookies(res);
  if (raw) return res;
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}
async function chat(body, { abortAfterDeltas = Infinity } = {}) {
  const ctl = new AbortController();
  const res = await call("/api/chat", { method: "POST", body: JSON.stringify(body), signal: ctl.signal }, { raw: true });
  if (!res.ok) return { status: res.status, error: (await res.json()).error, events: [] };
  const events = [];
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let deltas = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        const evt = JSON.parse(line);
        events.push(evt);
        if (evt.type === "delta" && ++deltas >= abortAfterDeltas) { ctl.abort(); return { status: 200, events, aborted: true }; }
      }
    }
  } catch (e) { if (e.name !== "AbortError") throw e; }
  return { status: 200, events };
}
const text = (events) => events.filter((e) => e.type === "delta").map((e) => e.text).join("");
const meta = (events) => events.find((e) => e.type === "meta");
const done = (events) => events.find((e) => e.type === "done");

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`✓ ${name}`); }
  catch (err) { console.error(`✗ ${name}\n  ${err.message}`); process.exitCode = 1; }
}

await test("status reports configuration honestly", async () => {
  const { status, json } = await call("/api/status");
  assert.equal(status, 200);
  assert.equal(json.ai.configured, true);
  assert.equal(json.ai.tiers.length, 3);
  assert.equal(json.auth.mode, "demo");
});

await test("cross-site mutation is blocked", async () => {
  const { status } = await call("/api/conversations", { method: "POST", body: "{}", headers: { origin: "https://evil.example" } });
  assert.equal(status, 403);
});

await test("empty and oversized messages are rejected", async () => {
  let r = await call("/api/chat", { method: "POST", body: JSON.stringify({ action: "send", content: "   " }) });
  assert.equal(r.status, 400);
  r = await call("/api/chat", { method: "POST", body: JSON.stringify({ action: "send", content: "x".repeat(20000) }) });
  assert.equal(r.status, 400);
  assert.match(r.json.error.message, /too long/i);
});

let convId, firstUserId, firstAssistantId;
await test("new conversation streams a reply and generates a title", async () => {
  const { events } = await chat({ action: "send", content: "Hello there, first message" });
  const m = meta(events); const d = done(events);
  assert.ok(m?.conversationId && m.assistantMessageId && m.userMessageId);
  assert.match(text(events), /^Echo\(.*\) \[turns=1\]: Hello there/);
  assert.equal(d.title, "Mock Generated Title");
  convId = m.conversationId; firstUserId = m.userMessageId; firstAssistantId = m.assistantMessageId;
});

await test("messages are persisted with roles, timestamps and model", async () => {
  const { json } = await call(`/api/conversations/${convId}`);
  assert.equal(json.conversation.title, "Mock Generated Title");
  assert.equal(json.messages.length, 2);
  assert.deepEqual(json.messages.map((m) => m.role), ["user", "assistant"]);
  assert.ok(json.messages[1].model);
  assert.ok(json.messages[1].createdAt);
  assert.match(json.messages[1].content, /Hello world/);
});

await test("follow-up carries conversation context", async () => {
  const { events } = await chat({ action: "send", conversationId: convId, content: "Second message" });
  assert.match(text(events), /\[turns=3\]/); // user, assistant, user
  const { json } = await call(`/api/conversations/${convId}`);
  assert.equal(json.messages.length, 4);
});

await test("model tier override reaches the provider", async () => {
  const { events } = await chat({ action: "send", conversationId: convId, content: "tier check", modelTier: "advanced" });
  const { json: st } = await call("/api/status");
  const advanced = st.ai.tiers.find((t) => t.tier === "advanced").model;
  assert.equal(meta(events).model, advanced);
  assert.match(text(events), new RegExp(`Echo\\(${advanced.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`));
});

await test("regenerate replaces the last assistant message", async () => {
  const before = (await call(`/api/conversations/${convId}`)).json.messages;
  const lastId = before[before.length - 1].id;
  const { events } = await chat({ action: "regenerate", conversationId: convId });
  const after = (await call(`/api/conversations/${convId}`)).json.messages;
  assert.equal(after.length, before.length);
  assert.notEqual(after[after.length - 1].id, lastId);
  assert.equal(after[after.length - 1].id, meta(events).assistantMessageId);
});

await test("editing a message truncates the branch and regenerates", async () => {
  const { events } = await chat({ action: "edit", conversationId: convId, messageId: firstUserId, content: "Edited first message" });
  assert.match(text(events), /\[turns=1\]: Edited first message/);
  const { json } = await call(`/api/conversations/${convId}`);
  assert.equal(json.messages.length, 2);
  assert.equal(json.messages[0].id, firstUserId);
  assert.equal(json.messages[0].content, "Edited first message");
  assert.notEqual(json.messages[1].id, firstAssistantId);
});

await test("stop generation keeps the partial reply", async () => {
  const { events, aborted } = await chat({ action: "send", conversationId: convId, content: "SLOW please" }, { abortAfterDeltas: 3 });
  assert.ok(aborted);
  await new Promise((r) => setTimeout(r, 400));
  const { json } = await call(`/api/conversations/${convId}`);
  const last = json.messages[json.messages.length - 1];
  assert.equal(last.role, "assistant");
  assert.ok(last.content.length > 0 && last.content.length < 60, `partial content: ${JSON.stringify(last.content)}`);
  assert.equal(meta(events).assistantMessageId, last.id);
});

await test("custom system prompt is used", async () => {
  const s = (await call("/api/settings")).json;
  await call("/api/settings", { method: "PUT", body: JSON.stringify({ ...s, systemPrompt: "MOCK-CUSTOM-PROMPT for tests" }) });
  const { events } = await chat({ action: "send", conversationId: convId, content: "system-check" });
  assert.match(text(events), /SYSTEM=MOCK-CUSTOM-PROMPT/);
  await call("/api/settings", { method: "PUT", body: JSON.stringify({ ...s, systemPrompt: null }) });
});

await test("settings persist and validate", async () => {
  const s = (await call("/api/settings")).json;
  const r = await call("/api/settings", { method: "PUT", body: JSON.stringify({ ...s, theme: "dark", temperature: 1.2, enterToSend: false }) });
  assert.equal(r.status, 200);
  const again = (await call("/api/settings")).json;
  assert.equal(again.theme, "dark"); assert.equal(again.temperature, 1.2); assert.equal(again.enterToSend, false);
  const bad = await call("/api/settings", { method: "PUT", body: JSON.stringify({ ...s, temperature: 9 }) });
  assert.equal(bad.status, 400);
});

await test("provider errors are surfaced as readable stream errors", async () => {
  let { events } = await chat({ action: "send", conversationId: convId, content: "FAIL_500" });
  let err = events.find((e) => e.type === "error");
  assert.equal(err.code, "provider_error");
  assert.doesNotMatch(err.message, /at .*\.js/);
  ({ events } = await chat({ action: "send", conversationId: convId, content: "FAIL_429" }));
  err = events.find((e) => e.type === "error");
  assert.equal(err.code, "provider_rate_limit");
  // Failed generations don't leave empty assistant rows behind.
  const { json } = await call(`/api/conversations/${convId}`);
  assert.equal(json.messages[json.messages.length - 1].role, "user");
});

await test("feedback (like/dislike) is stored", async () => {
  const msgs = (await call(`/api/conversations/${convId}`)).json.messages;
  const a = msgs.find((m) => m.role === "assistant");
  const r = await call(`/api/messages/${a.id}`, { method: "PATCH", body: JSON.stringify({ feedback: "up" }) });
  assert.equal(r.json.feedback, "up");
});

await test("rename, list pagination and search", async () => {
  const r = await call(`/api/conversations/${convId}`, { method: "PATCH", body: JSON.stringify({ title: "Renamed chat about zebras" }) });
  assert.equal(r.json.title, "Renamed chat about zebras");
  assert.equal(r.json.titleIsCustom, true);
  for (let i = 0; i < 3; i++) await call("/api/conversations", { method: "POST", body: JSON.stringify({ title: `Filler ${i}` }) });
  const page1 = (await call("/api/conversations?limit=2")).json;
  assert.equal(page1.items.length, 2); assert.ok(page1.nextCursor);
  const page2 = (await call(`/api/conversations?limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`)).json;
  assert.ok(page2.items.length >= 1);
  assert.ok(!page2.items.some((c) => page1.items.some((p) => p.id === c.id)));
  let s = (await call("/api/search?q=zebras")).json.results;
  assert.equal(s.length, 1); assert.equal(s[0].conversation.id, convId);
  s = (await call("/api/search?q=Edited%20first")).json.results;
  assert.equal(s[0].conversation.id, convId); assert.ok(s[0].snippet);
});

await test("authorization: another guest cannot see this conversation", async () => {
  const saved = new Map(jar); jar.clear();
  try {
    // No session at all → 401.
    assert.equal((await call(`/api/conversations/${convId}`)).status, 401);
    // A different guest (fresh cookie) → the conversation simply doesn't exist for them.
    await call("/api/status");
    assert.ok(jar.size > 0, "expected a new guest cookie");
    assert.equal((await call(`/api/conversations/${convId}`)).status, 404);
    assert.equal((await call(`/api/conversations/${convId}`, { method: "DELETE" })).status, 404);
    assert.equal((await call(`/api/conversations/${convId}`, { method: "PATCH", body: JSON.stringify({ title: "hijack" }) })).status, 404);
    assert.equal((await call("/api/search?q=zebras")).json.results.length, 0);
  } finally {
    jar.clear(); for (const [k, v] of saved) jar.set(k, v);
  }
  const mine = await call(`/api/conversations/${convId}`);
  assert.equal(mine.status, 200);
  assert.equal(mine.json.conversation.title, "Renamed chat about zebras");
});

await test("delete conversation and clear history", async () => {
  assert.equal((await call(`/api/conversations/${convId}`, { method: "DELETE" })).status, 200);
  assert.equal((await call(`/api/conversations/${convId}`)).status, 404);
  const cleared = (await call("/api/conversations", { method: "DELETE" })).json;
  assert.ok(cleared.deleted >= 3);
  assert.equal((await call("/api/conversations")).json.items.length, 0);
});

await test("chat rate limit kicks in", async () => {
  let limited = false;
  for (let i = 0; i < 25; i++) {
    const r = await call("/api/chat", { method: "POST", body: JSON.stringify({ action: "send", content: `burst ${i}` }) }, { raw: true });
    if (r.status === 429) { limited = true; break; }
    await r.body?.cancel();
  }
  assert.ok(limited, "expected a 429 within 25 rapid chat requests");
});

console.log(`\n${passed} test group(s) passed${process.exitCode ? ", with failures" : ""}.`);
