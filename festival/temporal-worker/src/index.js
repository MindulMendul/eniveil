import { createServer } from "node:http";
import { Client } from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";
import { roomSessionWorkflow } from "./workflows.js";

const port = Number(process.env.PORT ?? 8081);
const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? "festival-room-sessions";
const namespace = process.env.TEMPORAL_NAMESPACE ?? "default";
const address = process.env.TEMPORAL_ADDRESS ?? "127.0.0.1:7233";
const token = process.env.TEMPORAL_GATEWAY_TOKEN;

if (!token) throw new Error("TEMPORAL_GATEWAY_TOKEN is required");

const connection = await NativeConnection.connect({
  address,
  ...(process.env.TEMPORAL_API_KEY
    ? { tls: true, apiKey: process.env.TEMPORAL_API_KEY }
    : {}),
});
const client = new Client({ connection, namespace });
const worker = await Worker.create({
  connection,
  namespace,
  taskQueue,
  workflowsPath: new URL("./workflows.js", import.meta.url).pathname,
});

const reply = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    reply(res, 200, { ok: true });
    return;
  }
  if (req.method !== "POST" || !req.url?.startsWith("/internal/sessions/")) {
    reply(res, 404, { error: "not found" });
    return;
  }
  if (req.headers.authorization !== `Bearer ${token}`) {
    reply(res, 401, { error: "unauthorized" });
    return;
  }

  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 4096) {
      reply(res, 413, { error: "payload too large" });
      return;
    }
  }

  try {
    const payload = JSON.parse(body);
    const { sessionId, occurredAt = new Date().toISOString() } = payload;
    if (typeof sessionId !== "string" || sessionId.length > 128) {
      reply(res, 400, { error: "invalid sessionId" });
      return;
    }

    const workflowId = `room-session-${sessionId}`;
    if (req.url === "/internal/sessions/start") {
      try {
        await client.workflow.start(roomSessionWorkflow, {
          args: [{ sessionId, startedAt: occurredAt }],
          taskQueue,
          workflowId,
        });
      } catch (error) {
        if (error?.name !== "WorkflowExecutionAlreadyStartedError") throw error;
      }
      reply(res, 202, { workflowId });
      return;
    }

    const handle = client.workflow.getHandle(workflowId);
    if (req.url === "/internal/sessions/event") {
      if (
        !["briefing", "discussion", "voting", "reveal"].includes(payload.phase)
      ) {
        reply(res, 400, { error: "invalid phase" });
        return;
      }
      await handle.signal("sessionEvent", {
        phase: payload.phase,
        occurredAt,
      });
      reply(res, 202, { workflowId });
      return;
    }

    if (req.url === "/internal/sessions/end") {
      await handle.signal("sessionEnded", { occurredAt });
      reply(res, 202, { workflowId });
      return;
    }

    reply(res, 404, { error: "not found" });
  } catch (error) {
    const status = error?.name === "WorkflowNotFoundError" ? 404 : 400;
    reply(res, status, {
      error: error instanceof Error ? error.message : "request failed",
    });
  }
});

server.listen(port, "0.0.0.0");
await worker.run();
