/* Private API snapshots and durable meal outbox. The service worker caches public files only. */
(() => {
  let syncError = "",
    database,
    syncing = false,
    cacheKey = null,
    identity = null,
    unavailable = false;
  async function db() {
    if (!window.indexedDB)
      throw new Error("Offline storage is unavailable in this browser.");
    if (!database)
      database = new Promise((resolve, reject) => {
        const open = indexedDB.open("nutrilog-offline-v1", 1);
        open.onupgradeneeded = () => open.result.createObjectStore("records");
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
    return database;
  }
  async function record(key, value, remove = false) {
    const connection = await db();
    return new Promise((resolve, reject) => {
      const tx = connection.transaction(
          "records",
          value === undefined && !remove ? "readonly" : "readwrite",
        ),
        store = tx.objectStore("records");
      const req = remove
        ? store.delete(key)
        : value === undefined
          ? store.get(key)
          : store.put(value, key);
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  async function updateQueue(id, change) {
    const connection = await db();
    return new Promise((resolve, reject) => {
      const tx = connection.transaction("records", "readwrite"),
        store = tx.objectStore("records"),
        req = store.get("outbox:" + id);
      req.onsuccess = () => store.put(change(req.result || []), "outbox:" + id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  async function keyFor(token) {
    if (!token || !crypto.subtle) return null;
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token),
    );
    return (
      "session:" +
      Array.from(new Uint8Array(bytes), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("")
    );
  }
  function canCache(path) {
    return [
      "/api/auth/session",
      "/api/goals",
      "/api/history",
      "/api/meals",
      "/api/profile",
      "/api/favorites",
      "/api/weights",
      "/api/templates",
      "/api/ai/weekly",
    ].includes(path.split("?")[0]);
  }
  async function getQueue(id = identity?.user.id) {
    return id ? (await record("outbox:" + id)) || [] : [];
  }
  async function draw() {
    if (!window.document) return;
    const drawnOwner = identity?.user.id;
    const el = document.querySelector("#offline-status");
    if (!el) return;
    let queue = [];
    try {
      queue = await getQueue();
    } catch {
      unavailable = true;
    }
    if (!window.document || identity?.user.id !== drawnOwner) return;
    el.replaceChildren();
    el.classList.toggle(
      "app-hidden",
      navigator.onLine && !queue.length && !unavailable && !syncError,
    );
    const p = document.createElement("p");
    p.textContent =
      syncError ||
      (unavailable
        ? "Offline storage is unavailable. Connect to save your meals."
        : queue.length
          ? `${queue.length} meal${queue.length === 1 ? "" : "s"} saved on this device, waiting to sync. These are not included in your totals yet.`
          : "You’re offline. You can view saved logs and queue new meals. AI, editing and other changes need a connection.");
    el.append(p);
    queue.forEach((item) => {
      const row = document.createElement("div");
      row.className = "quick-item";
      const label = document.createElement("span");
      label.textContent = `${item.body.name} · ${item.body.date}${item.error ? " · " + item.error : ""}`;
      row.append(label);
      const discard = document.createElement("button");
      discard.className = "text-btn";
      discard.textContent = "Discard";
      discard.onclick = async () => {
        if (!confirm("Discard this unsynced meal from this device?")) return;
        await updateQueue(drawnOwner, (queue) =>
          queue.filter((q) => q.body.requestId !== item.body.requestId),
        );
        draw();
      };
      row.append(discard);
      el.append(row);
    });
    if (queue.length) {
      const retry = document.createElement("button");
      retry.className = "ghost-btn";
      retry.textContent = syncing ? "Syncing…" : "Retry sync";
      retry.disabled = syncing || !navigator.onLine;
      retry.onclick = () => sync();
      el.append(retry);
    }
  }
  async function request(path, options, network) {
    const token =
      typeof getSessionToken === "function" ? getSessionToken() : null;
    const currentKey = await keyFor(token);
    const ensureAccount = () => {
      if (getSessionToken() !== token) {
        const error = new Error("Your account changed. Please try again.");
        error.status = 409;
        throw error;
      }
    };
    ensureAccount();
    const send = (path, opts) => {
      ensureAccount();
      return network(path, { ...opts, sessionToken: token });
    };
    if (currentKey !== cacheKey) {
      cacheKey = currentKey;
      identity = null;
    }
    const method = options.method || "GET";
    if (method === "POST" && path === "/api/meals") {
      if (!identity && cacheKey) {
        try {
          const savedIdentity = await record(currentKey + ":/api/auth/session");
          ensureAccount();
          identity = savedIdentity;
        } catch {}
      }
      const requestOwner = identity?.user.id;
      const body = {
        ...options.body,
        requestId: crypto.randomUUID(),
        offline: true,
      };
      const item = { body, createdAt: new Date().toISOString() };
      let durable = false;
      if (identity)
        try {
          await updateQueue(requestOwner, (queue) => [...queue, item]);
          durable = true;
        } catch {
          unavailable = true;
        }
      try {
        if (!navigator.onLine) throw new TypeError("Offline");
        const result = await send(path, { ...options, body });
        ensureAccount();
        if (durable)
          await updateQueue(requestOwner, (queue) =>
            queue.filter((q) => q.body.requestId !== body.requestId),
          );
        draw();
        return result;
      } catch (error) {
        if (error.status || !durable) {
          if (durable)
            await updateQueue(requestOwner, (queue) =>
              queue.filter((q) => q.body.requestId !== body.requestId),
            );
          throw error;
        }
        draw();
        return {
          queued: true,
          meal: { ...body, id: "pending-" + body.requestId },
        };
      }
    }
    try {
      if (!navigator.onLine) throw new TypeError("Offline");
      const value = await send(path, options);
      ensureAccount();
      if (method === "GET" && cacheKey && canCache(path))
        try {
          await record(
            currentKey + ":" + path,
            path === "/api/auth/session"
              ? { ...value, offlineCachedAt: Date.now() }
              : value,
          );
          ensureAccount();
          if (path === "/api/auth/session") identity = value;
        } catch {
          unavailable = true;
        }
      ensureAccount();
      return value;
    } catch (error) {
      if (error.status === 401 && cacheKey) {
        try {
          await record(currentKey + ":/api/auth/session", undefined, true);
        } catch {}
        if (cacheKey === currentKey && getSessionToken() === token)
          identity = null;
      }
      ensureAccount();
      if (method !== "GET" || error.status || !currentKey) throw error;
      if (path.startsWith("/api/admin/"))
        return path.includes("audit") ? { events: [] } : { notifications: [] };
      if (canCache(path))
        try {
          const value = await record(currentKey + ":" + path);
          if (value) {
            ensureAccount();
            if (path === "/api/auth/session") {
              if (
                !value.offlineCachedAt ||
                Date.now() - value.offlineCachedAt > 14 * 86400000
              )
                throw new Error("Sign in online to refresh offline access.");
              identity = value;
            }
            draw();
            return value;
          }
        } catch {
          unavailable = true;
        }
      if (path.startsWith("/api/meals?"))
        try {
          const saved = await record(currentKey + ":/api/meals");
          if (saved)
            return {
              meals: saved.meals.filter(
                (m) =>
                  m.date ===
                  new URL(path, location.origin).searchParams.get("date"),
              ),
            };
        } catch {}
      if (path === "/api/templates") return { templates: [] };
      if (path === "/api/ai/weekly")
        return { review: null, loggedDays: 0, offline: true };
      throw new Error(
        "This page has not been saved for offline use. Reconnect and open it once.",
      );
    }
  }
  async function sync() {
    if (
      syncing ||
      !navigator.onLine ||
      !identity ||
      typeof state === "undefined" ||
      state.currentUser?.id !== identity.user.id
    )
      return;
    const syncToken = getSessionToken(),
      syncOwner = identity.user.id;
    syncing = true;
    syncError = "";
    draw();
    try {
      const session = await networkApiRequest("/api/auth/session", {
        sessionToken: syncToken,
      });
      if (
        session.user.id !== syncOwner ||
        getSessionToken() !== syncToken ||
        state.currentUser?.id !== syncOwner
      )
        return;
      const id = session.user.id;
      for (const item of await getQueue(id)) {
        if (getSessionToken() !== syncToken || state.currentUser?.id !== id)
          return;
        try {
          await networkApiRequest("/api/meals", {
            method: "POST",
            body: item.body,
            sessionToken: syncToken,
          });
          await updateQueue(id, (queue) =>
            queue.filter((q) => q.body.requestId !== item.body.requestId),
          );
        } catch (error) {
          await updateQueue(id, (queue) =>
            queue.map((q) =>
              q.body.requestId === item.body.requestId
                ? {
                    ...q,
                    error: error.status
                      ? error.message
                      : "Waiting for a connection",
                  }
                : q,
            ),
          );
          if (
            error.status &&
            error.status >= 400 &&
            error.status < 500 &&
            ![401, 403, 429].includes(error.status)
          )
            continue;
          break;
        }
      }
      await loadDashboardData();
      render();
    } catch (error) {
      syncError =
        error.status === 401
          ? "Sign in again to sync. Your pending meals are still saved on this device."
          : "Could not sync yet. Your pending meals are still saved on this device.";
    } finally {
      syncing = false;
      draw();
    }
  }
  window.OfflineMeals = {
    request,
    draw,
    sync,
    async deleteAccountData() {
      if (identity) await record("outbox:" + identity.user.id, undefined, true);
      await this.forget();
    },
    async forget() {
      const forgottenKey = cacheKey;
      identity = null;
      cacheKey = null;
      syncError = "";
      if (forgottenKey) {
        const connection = await db().catch(() => null);
        if (connection)
          await new Promise((resolve) => {
            const tx = connection.transaction("records", "readwrite");
            const cursor = tx.objectStore("records").openCursor();
            cursor.onsuccess = () => {
              const c = cursor.result;
              if (c) {
                if (String(c.key).startsWith(forgottenKey + ":")) c.delete();
                c.continue();
              }
            };
            tx.oncomplete = resolve;
          });
      }
    },
  };
  for (const type of ["error", "unhandledrejection"])
    addEventListener(type, () => {
      if (
        typeof getSessionToken !== "function" ||
        !getSessionToken() ||
        !navigator.onLine
      )
        return;
      fetch("/api/telemetry", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + getSessionToken(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type,
          page: location.pathname.includes("dashboard") ? "dashboard" : "auth",
        }),
      }).catch(() => {});
    });
  addEventListener("online", () => {
    draw();
    sync();
  });
  addEventListener("offline", draw);
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("/sw.js").catch(() => {});
})();
