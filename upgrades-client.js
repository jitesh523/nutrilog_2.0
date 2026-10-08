(() => {
  if (!document.querySelector("#section-add-meal")) return;
  const el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const button = (text, fn, cls = "ghost-btn") => {
    const b = el("button", text, cls);
    b.type = "button";
    b.onclick = fn;
    return b;
  };
  const offline = el("section", null, "panel offline-status app-hidden");
  offline.id = "offline-status";
  offline.setAttribute("aria-live", "polite");
  document.querySelector("#app-shell").prepend(offline);
  const quick = el("section", null, "panel repeat-panel");
  quick.innerHTML =
    '<p class="eyebrow">LESS TYPING. MORE LIVING.</p><h2>Repeat your fuel.</h2><p class="helper-copy">Copy a logged day or save a day as a reusable template. Review the meals before adding them to today.</p><div class="repeat-controls"><label>Logged day<select id="copy-day"></select></label><button id="preview-day" class="ghost-btn" type="button">Review & copy</button><label>Template name<input id="template-name" maxlength="80" placeholder="Training day favourites" /></label><button id="save-template" class="ghost-btn" type="button">Save day as template</button></div><div id="template-list" class="quick-list"></div><p id="repeat-status" class="feedback" role="status"></p>';
  function makeExpandable(panel, label) {
    const details = el("details"),
      summary = el("summary", label);
    summary.className = "upgrade-summary";
    const children = [...panel.childNodes];
    details.append(summary, ...children);
    panel.replaceChildren(details);
  }
  makeExpandable(quick, "↻ Repeat a day or use a template");
  document.querySelector("#usuals-panel").before(quick);
  const photo = el("section", null, "panel photo-panel");
  photo.innerHTML =
    '<p class="eyebrow">SNAP. CHECK. LOG.</p><h2>Your plate, decoded.</h2><p class="helper-copy">A photo gives an approximate starting point. Check foods, portions and nutrition before saving. The selected photo is sent to Groq only when you tap Estimate; NutriLog does not save it.</p><label class="photo-picker">Choose a meal photo<input id="meal-photo" type="file" accept="image/jpeg,image/png,image/webp" /></label><img id="photo-preview" class="photo-preview app-hidden" alt="Selected meal for estimation" /><label>Portion details (optional)<input id="photo-details" maxlength="1000" placeholder="One medium plate, 2 rotis, about 1 tsp oil…" /></label><div class="button-row"><button id="estimate-photo" class="primary-btn" type="button" disabled>Estimate photo</button><button id="clear-photo" class="ghost-btn" type="button">Clear photo</button></div><p id="photo-status" class="feedback" role="status"></p>';
  makeExpandable(photo, "◎ Estimate a meal from a photo");
  document.querySelector("#meal-form").closest(".panel").before(photo);
  const weekly = el("section", null, "panel weekly-review");
  weekly.innerHTML =
    '<p class="eyebrow">BUILD ON YOUR WEEK.</p><div class="panel-heading"><div><h2>Your weekly check-in.</h2><p>Seven calendar days. Only the days you logged are used for averages.</p></div><button id="generate-weekly" class="primary-btn" type="button">Generate review</button></div><p id="weekly-evidence" class="helper-copy"></p><div id="weekly-review-content" class="review-grid"></div><p id="weekly-status" class="feedback" role="status"></p>';
  document.querySelector("#section-progress").append(weekly);
  const dialog = el("dialog", null, "upgrade-dialog");
  dialog.setAttribute("aria-labelledby", "upgrade-dialog-title");
  dialog.innerHTML =
    '<div class="panel-heading"><h2 id="upgrade-dialog-title"></h2><button type="button" class="ghost-btn" id="close-upgrade" aria-label="Close review">×</button></div><p id="upgrade-notes" class="helper-copy"></p><div id="upgrade-items"></div><p id="upgrade-totals" class="helper-copy"></p><p id="upgrade-status" class="feedback" role="status"></p><button id="apply-upgrade" class="primary-btn" type="button"></button>';
  document.body.append(dialog);
  const $ = (s) => document.querySelector(s);
  let owner,
    templates = [],
    weeklyKey,
    photoData = null,
    photoVersion = 0,
    dialogVersion = 0;
  function close() {
    dialogVersion++;
    dialog.close();
    $("#upgrade-items").replaceChildren();
  }
  $("#close-upgrade").onclick = close;
  dialog.addEventListener("cancel", () => {
    dialogVersion++;
  });
  function open(title, notes, applyLabel, apply) {
    dialogVersion++;
    $("#upgrade-dialog-title").textContent = title;
    $("#upgrade-notes").textContent = notes;
    $("#upgrade-status").textContent = "";
    $("#upgrade-items").replaceChildren();
    $("#upgrade-totals").textContent = "";
    const b = $("#apply-upgrade");
    b.textContent = applyLabel;
    b.disabled = false;
    b.onclick = async () => {
      b.disabled = true;
      try {
        await apply();
      } catch (error) {
        $("#upgrade-status").textContent = error.message;
      } finally {
        b.disabled = false;
      }
    };
    dialog.showModal();
  }
  async function refreshTemplates() {
    const id = state.currentUser?.id;
    if (!id) return;
    try {
      const data = await apiRequest("/api/templates");
      if (state.currentUser?.id !== id) return;
      templates = data.templates;
      drawTemplates();
    } catch (error) {
      if (window.document) $("#repeat-status").textContent = error.message;
    }
  }
  function drawTemplates() {
    if (!window.document) return;
    const list = $("#template-list");
    list.replaceChildren();
    templates.forEach((t) => {
      const row = el("div", null, "quick-item");
      row.append(
        el("span", `${t.name} · ${t.meals.length} meals`),
        button("Review & use", () => reviewCopy(t.meals, { templateId: t.id })),
        button(
          "Remove",
          async () => {
            if (!confirm(`Remove template “${t.name}”?`)) return;
            try {
              await apiRequest("/api/templates/" + t.id, { method: "DELETE" });
              await refreshTemplates();
            } catch (e) {
              $("#repeat-status").textContent = e.message;
            }
          },
          "text-btn",
        ),
      );
      list.append(row);
    });
  }
  function drawCopyDays() {
    const select = $("#copy-day"),
      selected = select.value;
    select.replaceChildren();
    state.history
      .filter((d) => d.mealCount > 0)
      .forEach((d) => {
        const option = el("option", `${d.date} · ${d.mealCount} meals`);
        option.value = d.date;
        select.append(option);
      });
    if ([...select.options].some((o) => o.value === selected))
      select.value = selected;
    $("#preview-day").disabled = !select.value;
    $("#save-template").disabled = !select.value;
  }
  async function sourceMeals() {
    const date = $("#copy-day").value;
    if (!date) throw new Error("Log a day first.");
    return (await apiRequest("/api/meals?date=" + date)).meals;
  }
  function reviewCopy(meals, source) {
    const requestId = crypto.randomUUID(),
      userId = state.currentUser.id;
    open(
      "Repeat these meals?",
      `These ${meals.length} meals will be added to today (${getTodayDateKey()}). Existing meals stay in your log.`,
      `Add ${meals.length} meals to today`,
      async () => {
        if (state.currentUser?.id !== userId)
          throw new Error("Your account changed. Close and try again.");
        await apiRequest("/api/meals/batch", {
          method: "POST",
          body: { ...source, date: getTodayDateKey(), requestId },
        });
        close();
        state.selectedDate = getTodayDateKey();
        await loadDashboardData();
        render();
        showSection("dashboard");
        showToast("Meals copied to today.");
      },
    );
    for (const m of meals)
      $("#upgrade-items").append(
        el("p", `${m.type} · ${m.name} · ${Math.round(m.calories)} kcal`),
      );
    $("#upgrade-totals").textContent =
      `Total: ${Math.round(meals.reduce((n, m) => n + m.calories, 0))} kcal · ${Math.round(meals.reduce((n, m) => n + m.protein, 0))}g protein`;
  }
  $("#preview-day").onclick = async () => {
    try {
      reviewCopy(await sourceMeals(), { sourceDate: $("#copy-day").value });
    } catch (e) {
      $("#repeat-status").textContent = e.message;
    }
  };
  $("#save-template").onclick = async () => {
    const b = $("#save-template");
    b.disabled = true;
    try {
      await apiRequest("/api/templates", {
        method: "POST",
        body: { name: $("#template-name").value, meals: await sourceMeals() },
      });
      $("#template-name").value = "";
      await refreshTemplates();
      $("#repeat-status").textContent = "Template saved to your account.";
    } catch (e) {
      $("#repeat-status").textContent = e.message;
    } finally {
      b.disabled = false;
    }
  };
  function showWeekly(data) {
    if (!window.document) return;
    $("#weekly-evidence").textContent = data.offline
      ? "Connect to generate a fresh review."
      : `${data.startDate} – ${data.endDate} · ${data.loggedDays}/7 days logged${data.loggedDays ? ` · ${Math.round(data.averages.calories)} kcal and ${Math.round(data.averages.protein)}g protein per logged day` : ""}. Missing logs are unknown.`;
    const content = $("#weekly-review-content");
    content.replaceChildren();
    if (!data.review) {
      content.append(
        el(
          "p",
          "Generate a review for your current log. Your review refreshes when your meals, targets or preferences change.",
          "helper-copy",
        ),
      );
      return;
    }
    for (const [key, label] of [
      ["summary", "The week"],
      ["win", "Keep building"],
      ["focus", "One focus"],
      ["nextStep", "Your next rep"],
    ]) {
      const card = el("article", null, "review-card");
      card.append(el("h3", label), el("p", data.review[key]));
      content.append(card);
    }
  }
  async function loadWeekly() {
    const id = state.currentUser?.id;
    try {
      const data = await apiRequest("/api/ai/weekly");
      if (state.currentUser?.id === id) showWeekly(data);
    } catch (e) {
      if (window.document) $("#weekly-status").textContent = e.message;
    }
  }
  $("#generate-weekly").onclick = async () => {
    const b = $("#generate-weekly"),
      id = state.currentUser?.id;
    b.disabled = true;
    $("#weekly-status").textContent = "Reviewing your logged week…";
    try {
      const data = await apiRequest("/api/ai/weekly", {
        method: "POST",
        body: {},
      });
      if (state.currentUser?.id !== id) return;
      showWeekly(data);
      $("#weekly-status").textContent = "Saved to your account.";
    } catch (e) {
      if (window.document) $("#weekly-status").textContent = e.message;
    } finally {
      b.disabled = false;
    }
  };
  function clearPhoto() {
    photoVersion++;
    photoData = null;
    $("#meal-photo").value = "";
    $("#photo-preview").removeAttribute("src");
    $("#photo-preview").classList.add("app-hidden");
    $("#estimate-photo").disabled = true;
    $("#photo-status").textContent = "";
  }
  $("#clear-photo").onclick = clearPhoto;
  $("#meal-photo").onchange = async () => {
    const file = $("#meal-photo").files[0];
    clearPhoto();
    if (!file) return;
    const version = photoVersion;
    try {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 12 * 1024 * 1024
      )
        throw new Error("Choose a JPEG, PNG or WebP image up to 12 MB.");
      const objectUrl = URL.createObjectURL(file);
      let image;
      try {
        image = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Could not open that photo."));
          img.src = objectUrl;
        });
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
      if (version !== photoVersion) return;
      const scale = Math.min(1, 1200 / Math.max(image.width, image.height)),
        canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas
        .getContext("2d")
        .drawImage(image, 0, 0, canvas.width, canvas.height);
      let quality = 0.84,
        data;
      do {
        data = canvas.toDataURL("image/jpeg", quality);
        quality -= 0.12;
      } while (data.length > 780000 && quality > 0.2);
      if (data.length > 780000)
        throw new Error(
          "This photo is still too large. Crop your plate and try again.",
        );
      photoData = data;
      $("#photo-preview").src = data;
      $("#photo-preview").classList.remove("app-hidden");
      $("#estimate-photo").disabled = false;
      $("#photo-status").textContent =
        "Ready. Check the photo, then tap Estimate to send it.";
    } catch (e) {
      $("#photo-status").textContent = e.message;
    }
  };
  function reviewEstimate(estimate, title) {
    if (!estimate.items?.length)
      throw new Error(
        estimate.notes ||
          "No meal was identified. Describe your foods instead.",
      );
    const items = structuredClone(estimate.items),
      userId = state.currentUser?.id;
    const totals = () =>
      Object.fromEntries(
        Nutrition.keys.map((k) => [
          k,
          Math.round(items.reduce((n, i) => n + Number(i[k]), 0) * 10) / 10,
        ]),
      );
    const update = () => {
      $("#upgrade-totals").textContent =
        `Approximate: ${Math.round(totals().calories)} kcal · ${totals().protein}g protein. Renaming a food does not recalculate its nutrition; edit the values too.`;
    };
    open(
      title,
      estimate.notes || "Check foods and portions. Values are approximate.",
      "Use in meal editor",
      async () => {
        if (state.currentUser?.id !== userId)
          throw new Error("Your account changed.");
        if (
          !items.length ||
          items.some(
            (i) =>
              !i.food.trim() ||
              !Number.isFinite(i.grams) ||
              i.grams <= 0 ||
              Nutrition.keys.some((k) => !Number.isFinite(i[k]) || i[k] < 0),
          )
        )
          throw new Error(
            "Check every food name, positive portion and nutrition value.",
          );
        const t = totals();
        if (
          t.calories > 10000 ||
          t.protein > 1000 ||
          t.carbs > 2000 ||
          t.fat > 1000
        )
          throw new Error(
            "These totals are too large for one meal. Check the portions.",
          );
        await loadMealEditor(
          {
            name: items
              .map((i) => i.food)
              .join(", ")
              .slice(0, 120),
            type: getSmartMealType(),
            description: items.map((i) => `${i.grams}g ${i.food}`).join(", "),
            ...t,
            ingredients: items.map((i) => ({
              ...i,
              displayAmount: i.grams,
              displayUnit: "g",
            })),
            source: "ai",
          },
          false,
        );
        close();
        clearPhoto();
        analysisFeedback.textContent =
          "Estimate loaded. Review your meal and tap Save meal when ready.";
      },
    );
    function rows() {
      const list = $("#upgrade-items");
      list.replaceChildren();
      items.forEach((item, index) => {
        const row = el("div", null, "estimate-row");
        for (const [key, label] of [
          ["food", "Food"],
          ["grams", "Portion (g)"],
          ["calories", "kcal"],
          ["protein", "Protein (g)"],
          ["carbs", "Carbs (g)"],
          ["fat", "Fat (g)"],
        ]) {
          const wrap = el("label", label),
            input = el("input");
          input.type = key === "food" ? "text" : "number";
          input.value = item[key];
          if (key !== "food") {
            input.min = key === "grams" ? "0.1" : "0";
            input.step = "0.1";
          } else input.maxLength = 160;
          input.oninput = () => {
            const value = key === "food" ? input.value : Number(input.value);
            if (key === "grams" && value > 0 && item.grams > 0) {
              const ratio = value / item.grams;
              Nutrition.keys.forEach((k) => {
                item[k] = Math.round(item[k] * ratio * 10) / 10;
                row.querySelector(`[data-value="${k}"]`).value = item[k];
              });
            }
            item[key] = value;
            update();
          };
          input.dataset.value = key;
          wrap.append(input);
          row.append(wrap);
        }
        row.append(
          button(
            "Remove",
            () => {
              items.splice(index, 1);
              rows();
              update();
            },
            "text-btn",
          ),
        );
        list.append(row);
      });
    }
    rows();
    update();
  }
  $("#estimate-photo").onclick = async () => {
    if (!photoData) return;
    const version = photoVersion,
      id = state.currentUser?.id,
      b = $("#estimate-photo");
    b.disabled = true;
    $("#photo-status").textContent = "Estimating your plate…";
    try {
      const estimate = await apiRequest("/api/ai/photo", {
        method: "POST",
        body: { image: photoData, description: $("#photo-details").value },
      });
      if (version !== photoVersion || id !== state.currentUser?.id) return;
      reviewEstimate(estimate, "Check your photo estimate");
      $("#photo-status").textContent = "Review the estimate before using it.";
    } catch (e) {
      $("#photo-status").textContent = e.message;
    } finally {
      b.disabled = !photoData;
    }
  };
  window.loadCoachDraft = async (messageId) => {
    const id = state.currentUser?.id;
    const estimate = await apiRequest("/api/ai/meal-draft", {
      method: "POST",
      body: { messageId },
    });
    if (id !== state.currentUser?.id) return;
    $("#chat-close").click();
    reviewEstimate(estimate, "Review your coach’s meal draft");
  };
  window.renderUpgrades = () => {
    if (!state.currentUser) return;
    drawCopyDays();
    if (owner !== state.currentUser.id) {
      owner = state.currentUser.id;
      templates = [];
      weeklyKey = null;
      clearPhoto();
      refreshTemplates();
    }
    const key = JSON.stringify([
      state.currentUser.id,
      getTodayDateKey(),
      state.history,
      state.profile,
      state.weights,
    ]);
    if (key !== weeklyKey) {
      weeklyKey = key;
      loadWeekly();
    }
  };
  window.renderUpgrades();
})();
