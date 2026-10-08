/**
 * motion.js — Interaction & Animation Layer
 *
 * Zero external dependencies. Uses Web Animations API + IntersectionObserver.
 * Does NOT modify any app logic, state, event handlers, API calls, or routing.
 * Every function is purely additive.
 *
 * Sections
 *  1.  Helpers & flags
 *  2.  Sticky topbar
 *  3.  Orb cursor parallax
 *  4.  Cursor spotlight on panels
 *  5.  3-D card tilt
 *  6.  Magnetic buttons
 *  7.  Input focus micro-interaction
 *  8.  Error shake
 *  9.  Status pill bounce
 * 10.  Metric card stagger
 * 11.  Meal card stagger
 * 12.  History card entrance
 * 13.  Dashboard shell entrance
 * 14.  Section cross-fade
 * 15.  Nav ripple
 * 16.  Quick-macro value pop
 * 17.  Ingredient preview stagger
 * 18.  Plan preview stagger
 * 19.  Plan summary card entrance
 * 20.  Auth card entrance (login page)
 * 21.  Delete button confirm pulse
 * 22.  MutationObserver — apply effects to dynamic DOM
 * 23.  Boot
 */

(function () {
  "use strict";

  /* ── 1. HELPERS & FLAGS ─────────────────────────────────────────────── */
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TOUCH   = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const EASE_OUT    = "cubic-bezier(0.22, 1, 0.36, 1)";
  const EASE_SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";
  const EASE_IN     = "cubic-bezier(0.4, 0, 1, 1)";

  /**
   * Lightweight alternative to GSAP's fromTo.
   * Returns the Animation object.
   */
  function anim(el, from, to, opts = {}) {
    if (REDUCED || !el) return null;
    return el.animate([from, to], {
      duration: opts.duration || 400,
      delay:    opts.delay    || 0,
      easing:   opts.easing   || EASE_OUT,
      fill:     opts.fill     || "backwards",
    });
  }

  /**
   * Stagger-animate a list of children.
   */
  function stagger(els, from, to, { duration = 380, delay = 0, step = 65, easing = EASE_OUT } = {}) {
    if (REDUCED) return;
    els.forEach((el, i) => {
      el.animate([from, to], {
        duration,
        delay: delay + i * step,
        easing,
        fill: "backwards",
      });
    });
  }

  /* ── 2. STICKY TOPBAR ───────────────────────────────────────────────── */
  function initStickyTopbar() {
    const bar = $(".topbar");
    if (!bar) return;
    window.addEventListener("scroll",
      () => bar.classList.toggle("topbar-scrolled", window.scrollY > 28),
      { passive: true }
    );
  }

  /* ── 3. ORB CURSOR PARALLAX ─────────────────────────────────────────── */
  function initOrbParallax() {
    if (REDUCED || TOUCH) return;

    const orbs = [
      { el: $(".orb-1"), sx:  0.022, sy:  0.016 },
      { el: $(".orb-2"), sx: -0.016, sy: -0.022 },
      { el: $(".orb-3"), sx:  0.011, sy:  0.013 },
      { el: $(".orb-4"), sx: -0.009, sy:  0.010 },
    ].filter((o) => o.el);

    let tick = false;
    document.addEventListener("mousemove", (e) => {
      if (tick) return;
      tick = true;
      requestAnimationFrame(() => {
        const dx = e.clientX - window.innerWidth  / 2;
        const dy = e.clientY - window.innerHeight / 2;
        orbs.forEach(({ el, sx, sy }) => {
          el.style.transition = "transform 2.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
          el.style.transform  = `translate(${dx * sx}px, ${dy * sy}px)`;
        });
        tick = false;
      });
    }, { passive: true });
  }

  /* ── 4. CURSOR SPOTLIGHT ────────────────────────────────────────────── */
  function applySpotlight(el) {
    if (TOUCH || REDUCED || el._spotlight) return;
    el._spotlight = true;

    el.addEventListener("mousemove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
      el.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
      el.classList.add("spotlight-on");
    }, { passive: true });

    el.addEventListener("mouseleave", () => el.classList.remove("spotlight-on"));
  }

  /* ── 5. 3-D CARD TILT ───────────────────────────────────────────────── */
  function applyTilt(el, deg = 4) {
    if (TOUCH || REDUCED || el._tilt) return;
    el._tilt = true;

    const ease   = "cubic-bezier(0.25, 0.46, 0.45, 0.94)";
    const easeIn = "0.2s ease";

    el.addEventListener("mouseenter", () => {
      el.style.transition = `transform ${easeIn}`;
    });

    el.addEventListener("mousemove", (e) => {
      const r = el.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width  - 0.5) * deg;
      const y = ((e.clientY - r.top)  / r.height - 0.5) * deg;
      el.style.transform = `perspective(900px) rotateX(${-y}deg) rotateY(${x}deg)`;
    }, { passive: true });

    el.addEventListener("mouseleave", () => {
      el.style.transition = `transform 0.5s ${ease}`;
      el.style.transform  = "perspective(900px) rotateX(0deg) rotateY(0deg)";
    });
  }

  /* ── 6. MAGNETIC BUTTONS ────────────────────────────────────────────── */
  function applyMagnetic(el) {
    if (TOUCH || REDUCED || el._magnetic) return;
    el._magnetic = true;
    const strength = el.classList.contains("primary-btn") ? 0.24 : 0.15;

    el.addEventListener("mousemove", (e) => {
      const r  = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width  / 2)) * strength;
      const dy = (e.clientY - (r.top  + r.height / 2)) * strength;
      el.style.transition = "transform 0.18s ease";
      el.style.transform  = `translate(${dx}px, ${dy}px)`;
    }, { passive: true });

    el.addEventListener("mouseleave", () => {
      el.style.transition = "transform 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
      el.style.transform  = "translate(0, 0)";
    });
  }

  /* ── 7. INPUT FOCUS MICRO-INTERACTION ──────────────────────────────── */
  function initInputInteractions() {
    if (REDUCED) return;

    document.addEventListener("focusin", (e) => {
      if (!e.target.matches("input, textarea, select")) return;
      const label = e.target.closest("label");
      if (!label) return;
      label.style.transition = "transform 0.2s ease";
      label.style.transformOrigin = "left center";
      label.style.transform = "scale(1.007)";
    }, { passive: true });

    document.addEventListener("focusout", (e) => {
      if (!e.target.matches("input, textarea, select")) return;
      const label = e.target.closest("label");
      if (!label) return;
      label.style.transition = "transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
      label.style.transform = "scale(1)";
    }, { passive: true });
  }

  /* ── 8. ERROR SHAKE ─────────────────────────────────────────────────── */
  function shake(el) {
    if (!el || REDUCED) return;
    el.classList.remove("motion-shake");
    void el.offsetWidth;
    el.classList.add("motion-shake");
    el.addEventListener("animationend", () => el.classList.remove("motion-shake"), { once: true });
  }

  function hookFeedback() {
    ["#login-feedback", "#signup-feedback"].forEach((sel) => {
      const fb = $(sel);
      if (!fb) return;
      new MutationObserver(() => {
        if (fb.textContent.trim()) shake(fb.closest("form") || fb.parentElement);
      }).observe(fb, { childList: true, characterData: true, subtree: true });
    });
  }

  /* ── 9. STATUS PILL BOUNCE ──────────────────────────────────────────── */
  function hookStatusPill() {
    const pill = $("#summary-status");
    if (!pill || REDUCED) return;
    let prev = pill.textContent;

    new MutationObserver(() => {
      const now = pill.textContent;
      if (now !== prev) {
        prev = now;
        pill.animate(
          [{ transform: "scale(0.72)", opacity: 0.3 },
           { transform: "scale(1.14)", opacity: 1 },
           { transform: "scale(1)",    opacity: 1 }],
          { duration: 420, easing: EASE_SPRING }
        );
      }
    }).observe(pill, { childList: true, characterData: true, subtree: true });
  }

  /* ── 10. METRIC CARD STAGGER ────────────────────────────────────────── */
  function hookMacroSummary() {
    const container = $("#macro-summary");
    if (!container) return;

    new MutationObserver(() => {
      const cards = Array.from(container.querySelectorAll(".metric-card"));
      if (!cards.length) return;
      stagger(cards,
        { opacity: 0, transform: "translateY(14px) scale(0.95)" },
        { opacity: 1, transform: "translateY(0)   scale(1)" },
        { duration: 380, step: 85 }
      );
      cards.forEach((c) => { applyTilt(c, 5); applySpotlight(c); });
    }).observe(container, { childList: true });
  }

  /* ── 11. MEAL CARD STAGGER ──────────────────────────────────────────── */
  function hookMealList() {
    const container = $("#meal-list");
    if (!container) return;

    new MutationObserver(() => {
      const cards = Array.from(container.querySelectorAll(".meal-card"));
      if (!cards.length) return;
      stagger(cards,
        { opacity: 0, transform: "translateX(-10px)" },
        { opacity: 1, transform: "translateX(0)" },
        { duration: 320, step: 55 }
      );
      cards.forEach((c) => applyTilt(c, 2));
    }).observe(container, { childList: true });
  }

  /* ── 12. HISTORY CARD ENTRANCE ──────────────────────────────────────── */
  function hookHistoryList() {
    const container = $("#history-list");
    if (!container) return;

    new MutationObserver(() => {
      const cards = Array.from(container.querySelectorAll(".history-card"));
      if (!cards.length) return;
      stagger(cards,
        { opacity: 0, transform: "translateX(8px)" },
        { opacity: 1, transform: "translateX(0)" },
        { duration: 300, step: 45 }
      );
      cards.forEach((c) => applySpotlight(c));
    }).observe(container, { childList: true });
  }

  /* ── 13. DASHBOARD SHELL ENTRANCE ───────────────────────────────────── */
  function initDashboardReveal() {
    if (REDUCED) return;
    const shell = $("#app-shell");
    if (!shell) return;

    new MutationObserver(() => {
      if (shell.classList.contains("app-hidden")) return;
      const topbar = shell.querySelector(".topbar");
      if (topbar) {
        anim(topbar,
          { opacity: 0, transform: "translateY(-14px)" },
          { opacity: 1, transform: "translateY(0)" },
          { duration: 380, delay: 0 }
        );
      }
      const panels = Array.from(shell.querySelectorAll(".app-section.active .panel, #admin-panel:not(.app-hidden)"));
      stagger(panels,
        { opacity: 0, transform: "translateY(22px)" },
        { opacity: 1, transform: "translateY(0)" },
        { duration: 440, delay: 80, step: 70 }
      );
    }).observe(shell, { attributes: true, attributeFilter: ["class"] });
  }

  /* ── 14. SECTION CROSS-FADE ─────────────────────────────────────────── */
  function initSectionTransitions() {
    if (REDUCED) return;

    const sections = $$(".app-section");
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(({ target }) => {
        if (!target.classList.contains("active")) return;
        target.animate(
          [{ opacity: 0, transform: "translateY(10px)" },
           { opacity: 1, transform: "translateY(0)" }],
          { duration: 280, easing: EASE_OUT, fill: "backwards" }
        );
      });
    });

    sections.forEach((s) =>
      observer.observe(s, { attributes: true, attributeFilter: ["class"] })
    );
  }

  /* ── 15. NAV RIPPLE ─────────────────────────────────────────────────── */
  function initNavRipple() {
    if (REDUCED) return;

    // Inject ripple keyframes once
    if (!document.getElementById("ripple-kf")) {
      const s = document.createElement("style");
      s.id = "ripple-kf";
      s.textContent = "@keyframes _ripple { to { transform:scale(2.8); opacity:0; } }";
      document.head.appendChild(s);
    }

    $$(".nav-btn").forEach((btn) => {
      btn.style.overflow = "hidden";
      btn.addEventListener("click", (e) => {
        const r    = btn.getBoundingClientRect();
        const size = Math.max(r.width, r.height);
        const dot  = document.createElement("span");
        dot.style.cssText = [
          "position:absolute; border-radius:50%; pointer-events:none;",
          `width:${size}px; height:${size}px;`,
          `left:${e.clientX - r.left - size / 2}px;`,
          `top:${e.clientY  - r.top  - size / 2}px;`,
          "background:rgba(34,211,238,0.22);",
          "transform:scale(0); opacity:1;",
          "animation:_ripple 0.46s cubic-bezier(0.22,1,0.36,1) forwards;",
        ].join("");
        btn.appendChild(dot);
        dot.addEventListener("animationend", () => dot.remove());
      });
    });
  }

  /* ── 16. QUICK-MACRO VALUE POP ──────────────────────────────────────── */
  function hookQuickMacros() {
    if (REDUCED) return;

    ["#qm-calories", "#qm-protein", "#qm-carbs", "#qm-fat"].forEach((sel) => {
      const el = $(sel);
      if (!el) return;
      new MutationObserver(() => {
        el.animate(
          [{ transform: "scale(1.22)", opacity: 0.55 },
           { transform: "scale(1)",    opacity: 1 }],
          { duration: 280, easing: EASE_SPRING }
        );
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });
  }

  /* ── 17. INGREDIENT PREVIEW STAGGER ────────────────────────────────── */
  function hookIngredientPreview() {
    if (REDUCED) return;
    const container = $("#ingredient-preview");
    if (!container) return;

    new MutationObserver(() => {
      const cards = Array.from(container.querySelectorAll(".ingredient-card"));
      if (!cards.length) return;
      stagger(cards,
        { opacity: 0, transform: "translateX(-8px)" },
        { opacity: 1, transform: "translateX(0)" },
        { duration: 280, step: 50 }
      );
    }).observe(container, { childList: true });
  }

  /* ── 18. PLAN PREVIEW STAGGER ───────────────────────────────────────── */
  function hookPlanPreview() {
    if (REDUCED) return;
    const preview = $("#plan-preview");
    if (!preview) return;

    new MutationObserver(() => {
      if (preview.classList.contains("app-hidden")) return;
      const stats = Array.from(preview.querySelectorAll(".plan-preview-stat"));
      stagger(stats,
        { opacity: 0, transform: "scale(0.88) translateY(8px)" },
        { opacity: 1, transform: "scale(1)    translateY(0)" },
        { duration: 300, step: 55, easing: EASE_SPRING }
      );
    }).observe(preview, { attributes: true, childList: true, attributeFilter: ["class"] });
  }

  /* ── 19. PLAN SUMMARY CARD ENTRANCE ────────────────────────────────── */
  function hookPlanSummaryCard() {
    if (REDUCED) return;
    const card = $("#plan-summary-card");
    if (!card) return;

    new MutationObserver(() => {
      if (card.classList.contains("app-hidden")) return;
      anim(card,
        { opacity: 0, transform: "translateY(-10px) scale(0.98)" },
        { opacity: 1, transform: "translateY(0)     scale(1)" },
        { duration: 380, easing: EASE_SPRING }
      );
      const stats = Array.from(card.querySelectorAll(".plan-stat"));
      stagger(stats,
        { opacity: 0, transform: "translateY(10px)" },
        { opacity: 1, transform: "translateY(0)" },
        { duration: 300, delay: 120, step: 55 }
      );
    }).observe(card, { attributes: true, attributeFilter: ["class"] });
  }

  /* ── 20. AUTH CARD ENTRANCE ─────────────────────────────────────────── */
  function initAuthEntrance() {
    if (REDUCED) return;

    const logo = $(".auth-logo");
    const card = $(".auth-card");

    if (logo) {
      anim(logo,
        { opacity: 0, transform: "translateY(-20px) scale(0.92)" },
        { opacity: 1, transform: "translateY(0)     scale(1)" },
        { duration: 480, easing: EASE_SPRING }
      );
    }

    if (card) {
      anim(card,
        { opacity: 0, transform: "translateY(28px) scale(0.96)" },
        { opacity: 1, transform: "translateY(0)    scale(1)" },
        { duration: 500, delay: 80, easing: EASE_OUT }
      );
    }

    // Stagger form fields inside the visible form
    setTimeout(() => {
      const form = $(".auth-form:not(.auth-form-hidden)");
      if (!form) return;
      const fields = Array.from(form.querySelectorAll("label, button, p"));
      stagger(fields,
        { opacity: 0, transform: "translateY(10px)" },
        { opacity: 1, transform: "translateY(0)" },
        { duration: 280, delay: 180, step: 45 }
      );
    }, 80);
  }

  /* ── 21. DELETE BUTTON CONFIRM PULSE ────────────────────────────────── */
  function hookDeleteButtons() {
    if (REDUCED) return;
    // Pulse red on first click to hint "destructive action"
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".delete-btn");
      if (!btn || btn._confirmed) return;
      btn.animate(
        [{ boxShadow: "0 0 0 0 rgba(251,113,133,0)" },
         { boxShadow: "0 0 0 6px rgba(251,113,133,0.35)" },
         { boxShadow: "0 0 0 0 rgba(251,113,133,0)" }],
        { duration: 400, easing: "ease-out" }
      );
    }, { passive: true });
  }

  /* ── 22. APPLY EFFECTS TO ELEMENT ───────────────────────────────────── */
  function applyTo(el) {
    if (!el || !el.matches) return;
    if (el.matches(".panel"))        { applySpotlight(el); applyTilt(el, 3); }
    if (el.matches(".metric-card"))  { applyTilt(el, 5);  applySpotlight(el); }
    if (el.matches(".history-card")) applySpotlight(el);
    if (el.matches(".meal-card"))    applyTilt(el, 2);
    if (el.matches(".admin-card"))   applyTilt(el, 3);
    if (el.matches(".plan-stat"))    applyTilt(el, 3);
    if (el.matches(".primary-btn"))  applyMagnetic(el);
    if (el.matches(".ghost-btn"))    applyMagnetic(el);
  }

  function applySubtree(root) {
    const sel = ".panel,.metric-card,.history-card,.meal-card,.admin-card,.plan-stat,.primary-btn,.ghost-btn";
    (root.querySelectorAll ? root.querySelectorAll(sel) : []).forEach(applyTo);
  }

  function initMutationWatcher() {
    let timer;
    new MutationObserver((mutations) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        mutations.forEach((m) => {
          m.addedNodes.forEach((n) => {
            if (n.nodeType !== 1) return;
            applyTo(n);
            applySubtree(n);
          });
        });
      }, 50);
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* ── 23. SYNC MOBILE NAV ACTIVE STATE ──────────────────────────────── */
  function syncMobileNav() {
    const mobileNav = $(".mobile-bottom-nav");
    if (!mobileNav) return;

    const mobileButtons = Array.from(mobileNav.querySelectorAll(".nav-btn"));
    mobileButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        // Sync active state on both navs
        $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.section === btn.dataset.section));
      });
    });

    // Mirror active state changes from topbar to mobile nav
    new MutationObserver(() => {
      const activeSection = $$(".nav-btn").find((b) => b.classList.contains("active") && !mobileButtons.includes(b))?.dataset.section;
      if (activeSection) {
        mobileButtons.forEach((b) => b.classList.toggle("active", b.dataset.section === activeSection));
      }
    }).observe($(".app-nav") || document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });
  }

  /* ── 24. BOOT ────────────────────────────────────────────────────────── */
  function boot() {
    initStickyTopbar();
    initOrbParallax();
    initInputInteractions();
    initMutationWatcher();
    initSectionTransitions();

    hookFeedback();
    hookStatusPill();
    hookMacroSummary();
    hookMealList();
    hookHistoryList();
    hookQuickMacros();
    hookIngredientPreview();
    hookPlanPreview();
    hookPlanSummaryCard();
    hookDeleteButtons();

    initDashboardReveal();
    initNavRipple();
    syncMobileNav();

    applySubtree(document);

    // Login page
    if ($(".auth-card")) initAuthEntrance();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
