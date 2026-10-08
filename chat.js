const crypto = require("node:crypto");
const {
  AiError,
  buildAdviceContext,
  chatReply,
  streamChatReply,
} = require("./ai");

const emptyChat = () => ({ id: null, messages: [] });

// Provider latency must never hold the database's app-wide write lock.
async function handleChat(request, response, helpers) {
  const {
    storage,
    requireSession,
    readData,
    writeData,
    readJsonBody,
    sendJson,
    getUserTodayDateKey,
    buildHistory,
    getGoalsForDate,
    reserveAiUsage,
  } = helpers;
  if (!["GET", "POST", "DELETE"].includes(request.method)) {
    return sendJson(response, 405, { error: "Method not allowed." });
  }
  if (request.method !== "POST") {
    return storage.runRequest(request.method === "DELETE", () => {
      const session = requireSession(request, response);
      if (!session) return;
      const data = readData();
      if (request.method === "DELETE") {
        data.chatsByUser[session.user.id] = {
          id: crypto.randomUUID(),
          messages: [],
        };
        writeData(data);
      }
      sendJson(response, 200, data.chatsByUser[session.user.id] || emptyChat());
    });
  }
  const streaming = Boolean(
    request.headers.accept?.includes("text/event-stream"),
  );
  const sendChat = (chat) => {
    if (!streaming) return sendJson(response, 200, chat);
    storage.respond(() => {
      startStream();
      response.end(`data: ${JSON.stringify({ type: "saved", chat })}\n\n`);
    });
  };
  function startStream() {
    if (!response.headersSent) {
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      });
      response.flushHeaders?.();
    }
  }
  let prepared;
  let release;
  try {
    await storage.runRequest(false, async () => {
      const session = requireSession(request, response);
      if (!session) return;
      const body = await readJsonBody(request);
      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        typeof body.message !== "string" ||
        !body.message.trim() ||
        body.message.length > 2000 ||
        typeof body.requestId !== "string" ||
        !/^[a-zA-Z0-9-]{8,80}$/.test(body.requestId) ||
        !(
          body.conversationId === null ||
          (typeof body.conversationId === "string" &&
            body.conversationId.length <= 80)
        )
      ) {
        throw new AiError(
          400,
          "Send a message of 1–2,000 characters with the current conversation.",
        );
      }
      const today = getUserTodayDateKey(session.account);
      const date = body.date ?? today;
      if (
        typeof date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        date > today ||
        !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date
      ) {
        throw new AiError(400, "Choose today or a previous valid date.");
      }
      const data = readData();
      const chat = data.chatsByUser[session.user.id] || emptyChat();
      // Retrying a completed request must not duplicate a turn or spend another AI call.
      if (chat.messages.some((m) => m.requestId === body.requestId)) {
        sendChat(chat);
        return;
      }
      if (chat.id !== body.conversationId)
        throw new AiError(
          409,
          "This chat changed in another tab. Reload the conversation and try again.",
        );
      release = await reserveAiUsage(session.user.id);
      const history = buildHistory(data, session.user.id, today).filter(
        (day) => day.date <= date,
      );
      prepared = {
        userId: session.user.id,
        chat,
        body,
        date,
        context: buildAdviceContext(
          data,
          session.user.id,
          date,
          getGoalsForDate(data, session.user.id, date, today),
          history,
        ),
      };
    });
    if (!prepared) return;
    const { userId, chat, body, date, context } = prepared;
    const question = {
      role: "user",
      content: body.message.trim(),
      date,
      createdAt: new Date().toISOString(),
      requestId: body.requestId,
    };
    const reply = streaming
      ? await streamChatReply(
          context,
          [...chat.messages, question],
          (delta) => {
            startStream();
            response.write(
              `data: ${JSON.stringify({ type: "delta", delta })}\n\n`,
            );
          },
        )
      : await chatReply(context, [...chat.messages, question]);
    await storage.runRequest(true, () => {
      // Revalidate after generation: logout, reset, deletion and other-tab clears win.
      let authFailed = false;
      const authResponse =
        streaming && response.headersSent
          ? {
              setHeader() {},
              writeHead() {},
              end() {
                authFailed = true;
              },
            }
          : response;
      const session = requireSession(request, authResponse);
      if (!session || session.user.id !== userId || authFailed)
        throw new AiError(401, "Sign in again to save this reply.");
      const data = readData();
      const current = data.chatsByUser[userId] || emptyChat();
      if (current.messages.some((m) => m.requestId === body.requestId))
        return sendChat(current);
      if (
        current.id !== chat.id ||
        current.messages.at(-1)?.id !== chat.messages.at(-1)?.id
      ) {
        throw new AiError(
          409,
          "This chat changed while I was replying. Reload the conversation and try again.",
        );
      }
      const saved = {
        id: chat.id || crypto.randomUUID(),
        messages: [
          ...current.messages,
          { ...question, id: crypto.randomUUID() },
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: reply,
            date,
            createdAt: new Date().toISOString(),
          },
        ].slice(-60),
      };
      data.chatsByUser[userId] = saved;
      writeData(data);
      sendChat(saved);
    });
  } finally {
    release?.();
  }
}

module.exports = { handleChat };
