// A tiny OpenAI-compatible /v1/chat/completions server used ONLY by the test
// suite so the real app code path (provider → streaming → persistence) can be
// exercised without spending API credits. It is not used by the app itself.
//
//   node scripts/mock-llm-server.mjs            # listens on :8788
//   OPENAI_BASE_URL=http://127.0.0.1:8788/v1 OPENAI_API_KEY=test npm start
//
// Behaviour switches (by content of the last user message):
//   "SLOW"      → streams slowly (for testing Stop)
//   "FAIL_500"  → returns HTTP 500
//   "FAIL_429"  → returns HTTP 429
//   "TIMEOUT"   → never responds
// Any API key other than "bad-key" is accepted.

import http from "node:http";

const PORT = Number(process.env.MOCK_LLM_PORT ?? 8788);

function sse(res, obj) { res.write(`data: ${JSON.stringify(obj)}\n\n`); }

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) { res.writeHead(404).end(); return; }
  if (req.headers.authorization === "Bearer bad-key") {
    res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "Incorrect API key provided" } }));
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const json = JSON.parse(body);
    const msgs = json.messages ?? [];
    const lastUser = [...msgs].reverse().find((m) => m.role === "user")?.content ?? "";
    const system = msgs.find((m) => m.role === "system")?.content ?? "";

    if (lastUser.includes("FAIL_500")) { res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "mock upstream failure" } })); return; }
    if (lastUser.includes("FAIL_429")) { res.writeHead(429, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "mock rate limit" } })); return; }
    if (lastUser.includes("TIMEOUT")) return; // hang

    // Title / summary requests come through complete() as non-chat prompts.
    let reply;
    if (/write a short title/i.test(lastUser)) reply = "Mock Generated Title";
    else if (/updated, compact summary/i.test(lastUser)) reply = "Summary: the user and assistant discussed several numbered topics.";
    else {
      const turns = msgs.filter((m) => m.role !== "system").length;
      reply = `Echo(${json.model}) [turns=${turns}]: ${lastUser}\n\n\`\`\`javascript\nconsole.log("Hello world");\n\`\`\`\n\n| a | b |\n|---|---|\n| 1 | 2 |`;
      if (/system-check/.test(lastUser)) reply += `\n\nSYSTEM=${system.slice(0, 40)}`;
    }

    if (!json.stream) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: reply } }] }));
      return;
    }

    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    const slow = lastUser.includes("SLOW");
    const words = reply.split(/(?<=\s)/);
    let i = 0;
    const tick = () => {
      if (res.destroyed) return;
      if (i >= words.length) {
        sse(res, { choices: [{ delta: {}, finish_reason: "stop" }] });
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
      sse(res, { choices: [{ delta: { content: words[i++] } }] });
      setTimeout(tick, slow ? 250 : 5);
    };
    tick();
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock LLM listening on http://127.0.0.1:${PORT}/v1`));
