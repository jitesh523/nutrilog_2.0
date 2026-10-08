(() => {
  const estimateButton = document.querySelector("#ai-estimate-btn");
  const description = document.querySelector("#meal-description");
  const form = document.querySelector('#chat-form');
  const input = document.querySelector('#chat-input');
  const messages = document.querySelector('#chat-messages');
  const status = document.querySelector('#chat-status');
  const recovery = document.querySelector('#chat-recovery');
  const clearConfirm = document.querySelector('#chat-clear-confirm');
  const widget = document.querySelector('#coach-widget');
  const launcher = document.querySelector('#coach-launcher');
  let returnFocus = null;
  let unread = false;
  const phoneLayout = window.matchMedia('(max-width: 600px), (max-width: 900px) and (max-height: 500px)');
  const pageSurfaces = document.querySelectorAll('#app-shell, .mobile-bottom-nav');

  function syncChatLayout() {
    const isModal = phoneLayout.matches && !widget.classList.contains('app-hidden');
    document.body.classList.toggle('coach-chat-open', isModal);
    document.documentElement.classList.toggle('coach-chat-open', isModal);
    widget.setAttribute('aria-modal', String(isModal));
    pageSurfaces.forEach(surface => { surface.toggleAttribute('inert', isModal); });
  }

  window.openAiChat = () => {
    if (!state.currentUser) return;
    returnFocus = document.activeElement;
    widget.classList.remove('app-hidden');
    launcher.setAttribute('aria-expanded', 'true');
    launcher.setAttribute('aria-label', 'Close nutrition coach chat');
    unread = false; launcher.classList.remove('has-reply');
    fitChatViewport(); syncChatLayout(); renderChat();
    // Let phone users read first; only open the keyboard when they tap to type.
    (phoneLayout.matches ? document.querySelector('#chat-close') : input).focus({preventScroll:true});
  };
  function closeChat(restoreFocus = true) {
    if (widget.contains(document.activeElement)) document.activeElement.blur();
    widget.classList.add('app-hidden');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-label', 'Open nutrition coach chat');
    syncChatLayout();
    if (restoreFocus) (returnFocus?.isConnected ? returnFocus : launcher).focus({preventScroll:true});
  }
  launcher.onclick = () => {
    if (widget.classList.contains('app-hidden')) { window.openAiChat(); returnFocus = launcher; }
    else closeChat();
  };
  document.querySelector('#chat-close').onclick = () => closeChat();
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !widget.classList.contains('app-hidden')) { event.preventDefault(); closeChat(); }
    if (event.key === 'Tab' && widget.getAttribute('aria-modal') === 'true') {
      const controls = [...widget.querySelectorAll('button:not(:disabled), textarea, summary')].filter(element => !element.closest('.app-hidden'));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !phoneLayout.matches) { event.preventDefault(); sendMessage(); }
  });
  function fitChatViewport() {
    const viewport = window.visualViewport;
    const height = viewport?.height || window.innerHeight;
    widget.style.setProperty('--chat-viewport-height', `${height}px`);
    widget.style.setProperty('--chat-viewport-top', `${viewport?.offsetTop || 0}px`);
    widget.classList.toggle('chat-compact', height < 520);
    syncChatLayout();
  }
  window.visualViewport?.addEventListener('resize', fitChatViewport);
  window.visualViewport?.addEventListener('scroll', fitChatViewport);
  window.addEventListener('resize', fitChatViewport);
  phoneLayout.addEventListener?.('change', fitChatViewport);
  fitChatViewport();
  function sizeComposer() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(112, Math.max(48, input.scrollHeight))}px`;
  }
  input.addEventListener('input', sizeComposer);
  function pauseCoachMotion() {
    launcher.classList.toggle('motion-paused', document.hidden);
    widget.classList.toggle('motion-paused', document.hidden);
  }
  document.addEventListener('visibilitychange', pauseCoachMotion);
  pauseCoachMotion();
  let owner = null;
  let chat = { id: null, messages: [] };
  let pending = false;
  let loading = false;
  let failed = null;
  let optimistic = null;
  let generation = 0;

  function appendText(parent, tag, value, className) {
    const element = document.createElement(tag);
    element.textContent = value;
    if (className) element.className = className;
    parent.appendChild(element);
    return element;
  }

  function renderChat() {
    messages.replaceChildren();
    const turns = [...chat.messages, ...(optimistic ? [optimistic] : [])];
    if (!turns.length) {
      appendText(messages, 'h2', 'What would you like to work on?');
      appendText(messages, 'p', 'We can review a meal, find an easy swap, or plan what to eat next. Tell me about anything you haven’t logged yet.', 'helper-copy');
    }
    for (const turn of turns) {
      const bubble = document.createElement('article');
      bubble.className = `chat-message chat-${turn.role}`;
      appendText(bubble, 'p', `${turn.role === 'user' ? 'You' : 'Coach'} · ${turn.date}`, 'chat-author');
      const body = appendText(bubble, 'p', '', 'chat-text');
      // A small text-only formatter: model output never becomes executable HTML.
      if (turn.role === 'assistant') {
        for (const part of turn.content.split(/(\*\*[^*]+\*\*)/g)) {
          if (part.startsWith('**') && part.endsWith('**')) appendText(body, 'strong', part.slice(2,-2));
          else body.append(document.createTextNode(part));
        }
      } else body.textContent = turn.content;
      messages.append(bubble);
    }
    if (pending) appendText(messages, 'p', 'Coach is thinking…', 'chat-thinking');
    const blocked = pending || loading;
    document.querySelector('#chat-send').disabled = blocked;
    document.querySelector('#chat-send').textContent = pending ? 'Thinking…' : 'Send';
    document.querySelector('#chat-clear').disabled = blocked;
    document.querySelector('#chat-retry').disabled = blocked;
    document.querySelector('#chat-reload').disabled = blocked;
    document.querySelectorAll('[data-chat-prompt]').forEach(button => { button.disabled = blocked; });
    recovery.classList.toggle('app-hidden', !failed || pending);
    status.classList.toggle('chat-error', Boolean(failed));
    document.querySelector('#chat-starters').classList.toggle('app-hidden', turns.length > 0);
    launcher.classList.toggle('has-reply', unread);
    launcher.classList.toggle('is-thinking', pending);
    widget.classList.toggle('is-thinking', pending);
    launcher.querySelector('.coach-launcher-label').textContent = pending ? 'Thinking…' : unread ? 'New reply' : 'Ask coach';
    if (widget.classList.contains('app-hidden')) launcher.setAttribute('aria-label', unread ? 'Open nutrition coach chat. New reply.' : 'Open nutrition coach chat');
    messages.scrollTop = messages.scrollHeight;
    sizeComposer();
  }

  window.resetAiChat = () => {
    generation += 1; owner = null; chat = {id:null,messages:[]};
    pending = false; loading = false; failed = null; optimistic = null;
    input.value = ''; status.textContent = ''; clearConfirm.classList.add('app-hidden');
    unread = false; closeChat(false); launcher.classList.add('app-hidden'); renderChat();
  };

  async function loadChat() {
    const version = ++generation;
    loading = true; failed = null; optimistic = null;
    status.textContent = 'Loading your conversation…'; renderChat();
    try {
      const saved = await apiRequest('/api/ai/chat');
      if (version !== generation) return;
      chat = saved; status.textContent = 'You can ask follow-up questions. Each reply uses your current log.';
    } catch (error) {
      if (version !== generation) return;
      // Do not allow a new conversation to overwrite an existing one after a failed load.
      failed = { load: true }; status.textContent = error.message;
    } finally {
      if (version === generation) { loading = false; renderChat(); document.querySelector('#chat-send').disabled = Boolean(failed?.load); }
    }
  }

  window.refreshAiContext = () => {
    if (!state.currentUser) { if (owner) window.resetAiChat(); return; }
    launcher.classList.remove('app-hidden');
    document.querySelector('#chat-context').textContent = `Your log · ${state.selectedDate}`;
    if (owner !== state.currentUser.id) { owner = state.currentUser.id; loadChat(); }
  };

  async function sendMessage(retry = false) {
    if (pending || loading || failed?.load) return;
    const content = retry ? failed?.content : input.value.trim();
    if (!content || content.length > 2000) return;
    const version = generation;
    const request = retry ? failed : { content, date: state.selectedDate, requestId: crypto.randomUUID(), conversationId: chat.id };
    failed = null; pending = true; optimistic = {role:'user', content, date:request.date};
    status.textContent = 'Reviewing your message and current meals…'; renderChat();
    try {
      const saved = await apiRequest('/api/ai/chat', { method:'POST', body:{message:content, date:request.date, requestId:request.requestId, conversationId:request.conversationId} });
      if (version !== generation) return;
      chat = saved; optimistic = null;
      unread = widget.classList.contains('app-hidden');
      if (input.value.trim() === content) input.value = '';
      status.textContent = 'Reply saved. Ask a follow-up whenever you like.';
    } catch (error) {
      if (version !== generation) return;
      failed = request;
      status.textContent = `${error.message} Your message hasn’t been lost. You can retry or reload the conversation.`;
    } finally {
      if (version === generation) { pending = false; renderChat(); }
    }
  }

  form.addEventListener('submit', event => { event.preventDefault(); sendMessage(); });
  document.querySelector('#chat-retry').onclick = () => failed?.load ? loadChat() : sendMessage(true);
  document.querySelector('#chat-reload').onclick = () => { if (!pending) loadChat(); };
  document.querySelectorAll('[data-chat-prompt]').forEach(button => {
    button.onclick = () => { input.value = button.dataset.chatPrompt; input.focus(); };
  });
  document.querySelector('#chat-clear').onclick = () => { if (!pending && !loading) clearConfirm.classList.remove('app-hidden'); };
  document.querySelector('#chat-cancel-clear').onclick = () => clearConfirm.classList.add('app-hidden');
  document.querySelector('#chat-confirm-clear').onclick = async () => {
    if (pending || loading) return;
    const version = generation;
    loading = true; renderChat();
    document.querySelector('#chat-confirm-clear').disabled = true;
    try {
      const saved = await apiRequest('/api/ai/chat', {method:'DELETE'});
      if (version !== generation) return;
      chat = saved; failed = null; optimistic = null; input.value = '';
      status.textContent = 'Fresh conversation ready.'; clearConfirm.classList.add('app-hidden');
    } catch (error) { if (version === generation) status.textContent = error.message; }
    finally { if (version === generation) { loading = false; document.querySelector('#chat-confirm-clear').disabled = false; renderChat(); } }
  };
  window.refreshAiContext();

  description.addEventListener("input", () => {
    if (state.aiEstimate) {
      state.aiEstimate = null; state.formIngredients = []; state.formSource = "manual";
      ingredientPreview.replaceChildren();
      analysisFeedback.textContent = "Description changed. Recalculate or review the nutrition values before saving.";
    }
  });

  estimateButton.addEventListener("click", async () => {
    if (state.aiEstimatePending) return;
    const mealDescription = description.value.trim();
    if (!mealDescription) {
      analysisFeedback.textContent = "Describe your meal first, including portions if you know them.";
      return;
    }
    const selectedDate = state.selectedDate;
    const submitButton = mealForm.querySelector('button[type="submit"]');
    state.aiEstimatePending = true;
    estimateButton.disabled = true;
    analyzeMealBtn.disabled = true;
    submitButton.disabled = true;
    estimateButton.textContent = "Estimating…";
    analysisFeedback.textContent = "Estimating portions and nutrition…";
    try {
      const estimate = await apiRequest("/api/ai/estimate", {
        method: "POST", body: { description: mealDescription },
      });
      if (description.value.trim() !== mealDescription || state.selectedDate !== selectedDate) {
        analysisFeedback.textContent = "Your meal or date changed. Estimate again for the current entry.";
        return;
      }
      ingredientPreview.replaceChildren();
      if (!estimate.items.length) {
        analysisFeedback.textContent = estimate.notes || "Add more food details and try again.";
        return;
      }
      state.aiEstimate = { description: mealDescription, items: estimate.items };
      state.formIngredients = estimate.items; state.formSource = "ai";
      for (const key of ["calories", "protein", "carbs", "fat"]) {
        document.querySelector(`#meal-${key}`).value = key === "calories" ? Math.round(estimate.totals[key]) : estimate.totals[key];
      }
      estimate.items.forEach((item) => {
        const card = document.createElement("section");
        card.className = "ingredient-card";
        appendText(card, "strong", `${item.food} · approximately ${formatNumber(item.grams)}g`);
        appendText(card, "p", `${formatNumber(item.calories)} cal · P ${formatNumber(item.protein)}g · C ${formatNumber(item.carbs)}g · F ${formatNumber(item.fat)}g`, "ingredient-meta");
        ingredientPreview.appendChild(card);
      });
      resetPortions();
      if (!document.querySelector("#meal-name").value.trim()) document.querySelector("#meal-name").value = estimate.items.map(i=>i.food).join(", ").slice(0,120);
      analysisFeedback.textContent = `AI estimate — review before saving. ${estimate.notes}`;
    } catch (error) {
      analysisFeedback.textContent = `${error.message} You can use Calculate From Foods or enter values manually.`;
    } finally {
      state.aiEstimatePending = false;
      const locked = !isEditableDate(state.selectedDate);
      estimateButton.disabled = locked;
      analyzeMealBtn.disabled = locked;
      submitButton.disabled = locked;
      estimateButton.textContent = "Estimate with AI";
    }
  });
})();
