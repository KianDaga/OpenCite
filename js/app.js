/* =============================================================================
   MURDER AT VERIDIAN ISLE — GAME ENGINE
   -----------------------------------------------------------------------------
   Vanilla JS. No build step, no dependencies. Drives state, routing, the five
   distinct scene interactions, the deduction board, and the accusation.
   ========================================================================== */
(function () {
  "use strict";

  const G = window.GAME;
  const STORAGE_KEY = "veridian_save_v2";

  /* ----------------------------- tiny DOM helper --------------------------- */
  function h(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === "class") node.className = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k.startsWith("on") && typeof attrs[k] === "function")
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else if (k === "dataset") for (const d in attrs[k]) node.dataset[d] = attrs[k][d];
        else if (attrs[k] === true) node.setAttribute(k, "");
        else if (attrs[k] !== false && attrs[k] != null) node.setAttribute(k, attrs[k]);
      }
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c == null || c === false) return;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      });
    }
    return node;
  }
  const $ = (sel) => document.querySelector(sel);

  /* ------------------------------- icons (SVG) ----------------------------- */
  const ICONS = {
    physical: '<svg viewBox="0 0 24 24"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/></svg>',
    document: '<svg viewBox="0 0 24 24"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/><path d="M9 12h6M9 16h6"/></svg>',
    testimony: '<svg viewBox="0 0 24 24"><path d="M4 4h16v11H8l-4 4z"/></svg>',
    timeline: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
    digital: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="1"/><path d="M8 21h8M12 17v4"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="1"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  };
  function icon(name, cls) {
    const s = h("span", { class: "ico " + (cls || ""), html: ICONS[name] || ICONS.search });
    return s;
  }

  /* ------------------------------- state ----------------------------------- */
  function defaultState() {
    const board = {};
    G.suspects.forEach((s) => (board[s.id] = { means: null, motive: null, opportunity: null }));
    return {
      route: "title",
      started: false,
      detective: "",
      onboardStep: 0,
      evidence: [],
      hotspots: {},      // sceneId -> [hotspotIds found]
      scenesDone: {},    // sceneId -> true
      presses: [],       // interrogation suspect ids pressed
      board: board,
      solved: false,
    };
  }

  let state = load() || defaultState();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s.board) return null;
      s.route = s.started ? "hub" : "title";
      return s;
    } catch (e) {
      return null;
    }
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }
  function resetGame() {
    state = defaultState();
    save();
    render();
  }

  /* --------------------------- evidence helpers ---------------------------- */
  const has = (id) => state.evidence.includes(id);
  function collect(id) {
    if (!id || has(id)) return false;
    state.evidence.push(id);
    save();
    return true;
  }
  const sceneById = (id) => G.scenes.find((s) => s.id === id);
  const suspectById = (id) => G.suspects.find((s) => s.id === id);
  const allScenesDone = () => G.scenes.every((s) => state.scenesDone[s.id]);

  /* ------------------------------- routing --------------------------------- */
  function go(route) {
    state.route = route;
    save();
    render();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  // Top-bar / footer nav delegation
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-nav]");
    if (!btn) return;
    const dest = btn.dataset.nav;
    if (dest === "accuse" && !allScenesDone()) return; // guarded
    go(dest);
  });

  /* =========================================================================
     RENDER ROOT
  ========================================================================= */
  function render() {
    const app = $("#app");
    app.innerHTML = "";
    syncChrome();

    const r = state.route || "title";
    let view;
    if (r === "title") view = ScreenTitle();
    else if (r === "onboard") view = ScreenOnboard();
    else if (r === "briefing") view = ScreenBriefing();
    else if (r === "hub") view = ScreenHub();
    else if (r === "notebook") view = ScreenNotebook();
    else if (r === "board") view = ScreenBoard();
    else if (r === "accuse") view = ScreenAccuse();
    else if (r === "result") view = ScreenResult();
    else if (r === "team") view = ScreenTeam();
    else if (r === "rules") view = ScreenRules();
    else if (r.startsWith("scene:")) view = ScreenScene(r.slice(6));
    else view = ScreenTitle();

    app.appendChild(view);
  }

  function syncChrome() {
    const bar = $("#topbar");
    const inGame = state.started && !["title", "onboard"].includes(state.route);
    bar.hidden = !inGame;
    $("#evcount").textContent = state.evidence.length;
    const accuse = $("#accuseBtn");
    if (allScenesDone()) {
      accuse.disabled = false;
      accuse.title = "Name the killer";
    } else {
      accuse.disabled = true;
      accuse.title = "Finish investigating every location first";
    }
    // active nav highlight
    document.querySelectorAll("#mainnav button").forEach((b) => {
      b.classList.toggle("active", b.dataset.nav === state.route);
    });
  }

  /* =========================================================================
     TITLE
  ========================================================================= */
  function ScreenTitle() {
    const hasSave = state.started;
    const wrap = h("section", { class: "screen title-screen" }, [
      h("div", { class: "title-aura" }),
      h("div", { class: "title-inner" }, [
        h("p", { class: "kicker", text: "AN INTERACTIVE MURDER MYSTERY" }),
        h("h1", { class: "title-h1" }, [
          h("span", { class: "t-line t-small", text: "MURDER AT" }),
          h("span", { class: "t-line t-big", text: "VERIDIAN ISLE" }),
        ]),
        h("p", { class: "title-tag", text: G.meta.tagline }),
        h("div", { class: "title-actions" }, [
          h("button", {
            class: "btn btn-primary",
            onclick: () => (hasSave ? go("hub") : go("onboard")),
          }, hasSave ? "Resume Investigation" : "Accept the Invitation"),
          hasSave
            ? h("button", {
                class: "btn btn-ghost",
                onclick: () => {
                  if (confirm("Start a brand-new investigation? Your current progress will be erased.")) {
                    resetGame();
                    go("onboard");
                  }
                },
              }, "New Case")
            : null,
          h("button", { class: "btn btn-ghost", onclick: () => go("rules") }, "How to Play"),
        ]),
        h("div", { class: "title-meta" }, [
          chip("Single-player"),
          chip("Mouse-driven"),
          chip("Evidence-based deduction"),
          chip("No two scenes alike"),
        ]),
        h("button", { class: "title-credit linklike", onclick: () => go("team") },
          "A game by Kian · Andrew · Vivaan · Charlie"),
      ]),
    ]);
    return wrap;
  }
  function chip(t) { return h("span", { class: "chip", text: t }); }

  /* =========================================================================
     ONBOARDING (multi-step flow)
  ========================================================================= */
  function ScreenOnboard() {
    const steps = [
      {
        kicker: "THE INVITATION",
        title: "A box with no sender",
        body:
          "An obsidian puzzle-box arrived at your door. Inside: a brass key and a card " +
          "summoning you to the private island of billionaire Augustus Crane — for his birthday. " +
          "You don't know him. You don't know who sent it. You go anyway.",
      },
      {
        kicker: "THE ISLAND",
        title: "Welcome to Veridian Isle",
        body:
          "Crane built the world's energy on the 'infinite' Helios cell and made himself the " +
          "richest man alive. Tonight his inner circle gathers to toast him under the stars — " +
          "and a woman he erased from history walks off the ferry, uninvited.",
      },
      {
        kicker: "HOW YOU'LL PLAY",
        title: "Read the island like a detective",
        body:
          "You'll move between five locations, each played a different way — search a crime " +
          "scene, rebuild a timeline, crack a keycard puzzle, read hidden documents, and " +
          "interrogate suspects. Every clue files itself into your Notebook.",
      },
      {
        kicker: "HOW YOU'LL WIN",
        title: "Means, motive, and opportunity",
        body:
          "Everyone here has a reason to kill. On the Deduction board you'll prove who had the " +
          "means, the motive, AND the opportunity — then name the killer, the method, and the " +
          "one piece of evidence that clinches it. Get all three right before dawn.",
      },
    ];

    const step = Math.min(state.onboardStep, steps.length); // last = name entry
    const total = steps.length + 1;

    const dots = h("div", { class: "stepdots" },
      Array.from({ length: total }, (_, i) =>
        h("span", { class: "stepdot" + (i === step ? " on" : i < step ? " done" : "") })));

    let card;
    if (step < steps.length) {
      const s = steps[step];
      card = h("div", { class: "onboard-card" }, [
        h("p", { class: "kicker", text: s.kicker }),
        h("h2", { text: s.title }),
        h("p", { class: "onboard-body", text: s.body }),
        h("div", { class: "onboard-actions" }, [
          step > 0
            ? h("button", { class: "btn btn-ghost", onclick: () => { state.onboardStep--; save(); render(); } }, "Back")
            : h("button", { class: "btn btn-ghost", onclick: () => go("title") }, "Cancel"),
          h("button", { class: "btn btn-primary", onclick: () => { state.onboardStep++; save(); render(); } },
            step === steps.length - 1 ? "Almost ready" : "Continue"),
        ]),
      ]);
    } else {
      // Name entry
      const input = h("input", {
        class: "name-input", type: "text", maxlength: "24",
        placeholder: "e.g. Blanc, Marlowe, Holmes…", value: state.detective || "",
      });
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") begin(); });
      function begin() {
        state.detective = (input.value || "").trim() || G.meta.detectiveDefault;
        state.started = true;
        save();
        go("briefing");
      }
      card = h("div", { class: "onboard-card" }, [
        h("p", { class: "kicker", text: "THE DETECTIVE" }),
        h("h2", { text: "What shall they call you?" }),
        h("p", { class: "onboard-body", text:
          "The other guests will want a name. Choose the one they'll remember after tonight." }),
        input,
        h("div", { class: "onboard-actions" }, [
          h("button", { class: "btn btn-ghost", onclick: () => { state.onboardStep--; save(); render(); } }, "Back"),
          h("button", { class: "btn btn-primary", onclick: begin }, "Step onto the island"),
        ]),
      ]);
      setTimeout(() => input.focus(), 30);
    }

    return h("section", { class: "screen onboard-screen" }, [
      h("div", { class: "onboard-wrap" }, [dots, card]),
    ]);
  }

  /* =========================================================================
     BRIEFING
  ========================================================================= */
  function ScreenBriefing() {
    return h("section", { class: "screen briefing-screen" }, [
      h("div", { class: "doc-sheet briefing-sheet" }, [
        h("p", { class: "kicker", text: "CASE BRIEFING" }),
        h("h2", { class: "briefing-h", text: "Murder at Veridian Isle" }),
        ...G.briefing.intro.map((p) => h("p", { class: "briefing-p", text: p })),
        h("div", { class: "briefing-victim" }, [
          h("span", { class: "vlabel", text: "THE VICTIM" }),
          h("strong", { text: G.victim.name + " — " + G.victim.role }),
          h("p", { text: G.victim.bio }),
          h("p", { class: "vfound", text: G.victim.found }),
        ]),
        h("p", { class: "briefing-deadline", text: G.briefing.deadline }),
        h("div", { class: "onboard-actions center" }, [
          h("button", { class: "btn btn-primary btn-lg", onclick: () => go("hub") },
            "Begin the investigation"),
        ]),
      ]),
    ]);
  }

  /* =========================================================================
     HUB — the Case File
  ========================================================================= */
  function ScreenHub() {
    const done = G.scenes.filter((s) => state.scenesDone[s.id]).length;
    const header = h("div", { class: "hub-head" }, [
      h("div", {}, [
        h("p", { class: "kicker", text: "THE CASE FILE" }),
        h("h2", { class: "hub-title", text: "Veridian Isle — " + (done) + " of " + G.scenes.length + " locations examined" }),
        h("p", { class: "hub-sub", text:
          "Welcome, " + (state.detective || "Detective") + ". Investigate the locations in any order. " +
          "When every location is examined, you may make your accusation." }),
      ]),
      h("div", { class: "progress-ring", style: "--p:" + Math.round((done / G.scenes.length) * 100) }, [
        h("span", { class: "pr-num", text: Math.round((done / G.scenes.length) * 100) + "%" }),
      ]),
    ]);

    const grid = h("div", { class: "scene-grid" },
      G.scenes.map((sc) => {
        const isDone = !!state.scenesDone[sc.id];
        return h("button", {
          class: "scene-card" + (isDone ? " done" : ""),
          onclick: () => go("scene:" + sc.id),
        }, [
          h("div", { class: "scene-card-top" }, [
            h("span", { class: "scene-num", text: "0" + sc.order }),
            isDone
              ? h("span", { class: "scene-badge done" }, [icon("check"), "Examined"])
              : h("span", { class: "scene-badge", text: sceneKindLabel(sc.kind) }),
          ]),
          h("h3", { class: "scene-name", text: sc.name }),
          h("p", { class: "scene-blurb", text: sc.blurb }),
          h("span", { class: "scene-go", text: isDone ? "Revisit →" : "Investigate →" }),
        ]);
      })
    );

    const accuseRow = h("div", { class: "hub-accuse" }, [
      allScenesDone()
        ? h("div", { class: "ready" }, [
            h("p", { text: "Every location examined. The evidence is in your hands." }),
            h("button", { class: "btn btn-danger btn-lg", onclick: () => go("accuse") }, "Make Your Accusation"),
          ])
        : h("p", { class: "notready", text:
            "Examine all " + G.scenes.length + " locations to unlock your accusation." }),
    ]);

    return h("section", { class: "screen hub-screen" }, [header, grid, accuseRow]);
  }

  function sceneKindLabel(kind) {
    return {
      hotspot: "Search", timeline: "Reconstruct", logicgrid: "Deduce",
      documents: "Read", interrogation: "Interrogate",
    }[kind] || "Investigate";
  }

  /* =========================================================================
     SCENE ROUTER
  ========================================================================= */
  function ScreenScene(id) {
    const sc = sceneById(id);
    if (!sc) return ScreenHub();
    const header = h("div", { class: "scene-header" }, [
      h("button", { class: "back-link", onclick: () => go("hub") }, "← Case File"),
      h("p", { class: "kicker", text: "LOCATION 0" + sc.order + " · " + sceneKindLabel(sc.kind) }),
      h("h2", { class: "scene-h", text: sc.name }),
      h("p", { class: "scene-lead", text: sc.lead }),
    ]);
    let body;
    if (sc.kind === "hotspot") body = SceneHotspot(sc);
    else if (sc.kind === "timeline") body = SceneTimeline(sc);
    else if (sc.kind === "logicgrid") body = SceneLogicGrid(sc);
    else if (sc.kind === "documents") body = SceneDocuments(sc);
    else if (sc.kind === "interrogation") body = SceneInterrogation(sc);
    return h("section", { class: "screen scene-screen" }, [header, body]);
  }

  // Reusable: a small toast/announce inside scenes
  function flash(container, msg, kind) {
    const t = h("div", { class: "flash " + (kind || ""), text: msg });
    container.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 350); }, 2600);
  }

  /* ---------------------- SCENE 1: HOTSPOT SEARCH -------------------------- */
  function SceneHotspot(sc) {
    state.hotspots[sc.id] = state.hotspots[sc.id] || [];
    const found = () => state.hotspots[sc.id];

    const wrap = h("div", { class: "hotspot-wrap" });

    const stage = h("div", { class: "hotspot-stage" });
    // atmospheric CSS scene (pure CSS, no images)
    stage.appendChild(h("div", { class: "hs-bg pavilion-bg" }, [
      h("div", { class: "hs-moon" }),
      h("div", { class: "hs-sea" }),
      h("div", { class: "hs-deck" }),
      h("div", { class: "hs-label", text: "THE STAR PAVILION · 12:07 A.M." }),
    ]));

    sc.hotspots.forEach((hp) => {
      const got = found().includes(hp.id);
      const dot = h("button", {
        class: "hotspot" + (got ? " found" : ""),
        style: `left:${hp.x}%; top:${hp.y}%`,
        title: hp.label,
        onclick: () => {
          if (found().includes(hp.id)) return;
          found().push(hp.id);
          collect(hp.evidence);
          dot.classList.add("found");
          renderList();
          flash(wrap, "Evidence logged: " + G.evidence[hp.evidence].title, "good");
          if (found().length === sc.hotspots.length) completeScene(sc, wrap);
          syncChrome();
          save();
        },
      }, [h("span", { class: "hs-pulse" }), h("span", { class: "hs-tip", text: hp.label })]);
      stage.appendChild(dot);
    });

    const list = h("div", { class: "hs-findings" });
    function renderList() {
      list.innerHTML = "";
      list.appendChild(h("p", { class: "hs-count", text:
        found().length + " / " + sc.hotspots.length + " points examined" }));
      sc.hotspots.forEach((hp) => {
        if (found().includes(hp.id)) list.appendChild(evidenceCard(hp.evidence));
      });
      if (!found().length)
        list.appendChild(h("p", { class: "muted", text: "Click the glowing points on the scene to examine them." }));
    }
    renderList();

    wrap.appendChild(stage);
    wrap.appendChild(list);
    return wrap;
  }

  /* ---------------------- SCENE 2: TIMELINE ------------------------------- */
  function SceneTimeline(sc) {
    const wrap = h("div", { class: "timeline-wrap" });
    const correct = sc.events.map((e) => e.id); // data is in correct order
    let pool = shuffle(sc.events.slice());
    let placed = []; // event ids in player order

    const slotsEl = h("div", { class: "tl-slots" });
    const poolEl = h("div", { class: "tl-pool" });
    const controls = h("div", { class: "tl-controls" });

    function draw() {
      slotsEl.innerHTML = "";
      poolEl.innerHTML = "";
      for (let i = 0; i < correct.length; i++) {
        const evId = placed[i];
        const ev = evId ? sc.events.find((e) => e.id === evId) : null;
        const slot = h("div", { class: "tl-slot" + (ev ? " filled" : "") }, [
          h("span", { class: "tl-rank", text: i + 1 }),
          ev
            ? h("button", { class: "tl-card placed", onclick: () => { placed.splice(i, 1); draw(); } }, [
                h("span", { class: "tl-time", text: ev.time }),
                h("span", { class: "tl-text", text: ev.text }),
                h("span", { class: "tl-remove", text: "✕" }),
              ])
            : h("span", { class: "tl-empty", text: "Drop the next event here" }),
        ]);
        slotsEl.appendChild(slot);
      }
      pool.filter((e) => !placed.includes(e.id)).forEach((e) => {
        poolEl.appendChild(
          h("button", { class: "tl-card", onclick: () => {
            if (placed.length < correct.length) { placed.push(e.id); draw(); }
          } }, [
            h("span", { class: "tl-time", text: e.time }),
            h("span", { class: "tl-text", text: e.text }),
          ])
        );
      });
      controls.innerHTML = "";
      const full = placed.length === correct.length;
      controls.appendChild(h("button", {
        class: "btn btn-primary", disabled: !full,
        onclick: verify,
      }, "Verify the sequence"));
      controls.appendChild(h("button", { class: "btn btn-ghost", onclick: () => { placed = []; draw(); } }, "Clear"));
    }

    function verify() {
      const ok = placed.every((id, i) => id === correct[i]);
      if (ok) {
        sc.reward.forEach((r) => collect(r));
        flash(wrap, "Timeline confirmed. The 11:14 lab window is now in your notebook.", "good");
        completeScene(sc, wrap);
        syncChrome();
        save();
      } else {
        flash(wrap, "That order doesn't match the statements. Check the times again.", "bad");
        wrap.classList.remove("shake"); void wrap.offsetWidth; wrap.classList.add("shake");
      }
    }

    draw();
    wrap.appendChild(h("p", { class: "tl-help", text:
      "Click an event to place it in the next slot. Click a placed event to take it back." }));
    wrap.appendChild(poolEl);
    wrap.appendChild(h("div", { class: "tl-arrow", text: "▾  arrange in order  ▾" }));
    wrap.appendChild(slotsEl);
    wrap.appendChild(controls);
    if (state.scenesDone[sc.id]) wrap.appendChild(solvedReward(sc));
    return wrap;
  }

  /* ---------------------- SCENE 3: LOGIC GRID ----------------------------- */
  function SceneLogicGrid(sc) {
    const wrap = h("div", { class: "logic-wrap" });
    const choice = {}; // suspectId -> place

    const hints = h("div", { class: "logic-hints" }, [
      h("h4", { text: "Statements & alibis" }),
      h("ul", {}, sc.hints.map((t) => h("li", { text: t }))),
    ]);

    const rows = h("div", { class: "logic-grid" });
    G.suspects.forEach((s) => {
      const sel = h("select", { class: "logic-select", onchange: (e) => { choice[s.id] = e.target.value; } });
      sel.appendChild(h("option", { value: "", text: "— where were they? —" }));
      sc.places.forEach((p) => sel.appendChild(h("option", { value: p, text: p })));
      rows.appendChild(h("div", { class: "logic-row" }, [
        monogramEl(s.monogram, "sm"),
        h("div", { class: "logic-who" }, [
          h("strong", { text: s.name }),
          h("span", { class: "muted", text: s.title.split(" · ")[0] }),
        ]),
        sel,
      ]));
    });

    const controls = h("div", { class: "logic-controls" }, [
      h("button", { class: "btn btn-primary", onclick: check }, "Check deductions"),
    ]);

    function check() {
      const all = G.suspects.every((s) => choice[s.id]);
      if (!all) { flash(wrap, "Place every guest before checking.", "bad"); return; }
      const ok = G.suspects.every((s) => choice[s.id] === sc.solutionGrid[s.id]);
      if (ok) {
        sc.reward.forEach((r) => collect(r));
        flash(wrap, "Deduction confirmed — one keycard, one suspect unaccounted for.", "good");
        completeScene(sc, wrap);
        syncChrome(); save();
      } else {
        flash(wrap, "Those placements contradict the alibis. Re-read the statements.", "bad");
        wrap.classList.remove("shake"); void wrap.offsetWidth; wrap.classList.add("shake");
      }
    }

    wrap.appendChild(hints);
    wrap.appendChild(rows);
    wrap.appendChild(controls);
    if (state.scenesDone[sc.id]) wrap.appendChild(solvedReward(sc));
    return wrap;
  }

  /* ---------------------- SCENE 4: DOCUMENTS ------------------------------ */
  function SceneDocuments(sc) {
    const wrap = h("div", { class: "docs-wrap" });
    let active = sc.docs[0];

    const tabs = h("div", { class: "doc-tabs" });
    const sheet = h("div", { class: "doc-reader" });

    function draw() {
      tabs.innerHTML = "";
      sc.docs.forEach((id) => {
        const ev = G.evidence[id];
        const read = has(id);
        tabs.appendChild(h("button", {
          class: "doc-tab" + (id === active ? " active" : "") + (read ? " read" : ""),
          onclick: () => { active = id; collect(id); checkDone(); draw(); },
        }, [
          read ? icon("check", "tiny") : h("span", { class: "doc-dot" }),
          h("span", { text: ev.title }),
        ]));
      });
      const ev = G.evidence[active];
      collect(active);
      sheet.innerHTML = "";
      sheet.appendChild(h("div", { class: "doc-sheet" }, [
        h("span", { class: "doc-stamp", text: ev.tag }),
        h("p", { class: "kicker", text: typeLabel(ev.type) }),
        h("h3", { text: ev.title }),
        h("p", { class: "doc-body", text: ev.text }),
      ]));
      syncChrome(); save();
    }
    function checkDone() {
      if (sc.docs.every((id) => has(id)) && !state.scenesDone[sc.id]) {
        completeScene(sc, wrap);
        flash(wrap, "Every document read. Motives are now mapped in your notebook.", "good");
      }
    }
    draw();
    // collecting first doc on open
    collect(active); checkDone(); syncChrome();

    wrap.appendChild(h("p", { class: "docs-help", text: "Open each document to read it — they file into your notebook automatically." }));
    wrap.appendChild(h("div", { class: "docs-layout" }, [tabs, sheet]));
    return wrap;
  }

  /* ---------------------- SCENE 5: INTERROGATION -------------------------- */
  function SceneInterrogation(sc) {
    const wrap = h("div", { class: "interro-wrap" });
    let active = sc.interviews[0].suspect;

    const roster = h("div", { class: "interro-roster" });
    const stage = h("div", { class: "interro-stage" });

    function pressed(id) { return state.presses.includes(id); }

    function draw() {
      roster.innerHTML = "";
      sc.interviews.forEach((iv) => {
        const s = suspectById(iv.suspect);
        roster.appendChild(h("button", {
          class: "interro-tab" + (iv.suspect === active ? " active" : "") + (pressed(iv.suspect) ? " done" : ""),
          onclick: () => { active = iv.suspect; draw(); },
        }, [
          monogramEl(s.monogram, "sm"),
          h("div", {}, [
            h("strong", { text: s.name }),
            h("span", { class: "muted", text: s.title.split(" · ")[0] }),
          ]),
          pressed(iv.suspect) ? icon("check", "tiny") : null,
        ]));
      });

      const iv = sc.interviews.find((x) => x.suspect === active);
      const s = suspectById(active);
      stage.innerHTML = "";
      const unlocked = has(iv.press.requires);
      stage.appendChild(h("div", { class: "interro-panel" }, [
        h("div", { class: "interro-who" }, [
          monogramEl(s.monogram, "lg"),
          h("div", {}, [h("h3", { text: s.name }), h("p", { class: "muted", text: s.title })]),
        ]),
        h("p", { class: "interro-line opener", text: iv.opener }),
        h("div", { class: "interro-press" }, [
          unlocked
            ? h("button", {
                class: "btn btn-press",
                disabled: pressed(active),
                onclick: () => {
                  if (!state.presses.includes(active)) state.presses.push(active);
                  if (iv.press.yields) {
                    collect(iv.press.yields);
                    flash(wrap, "Their story cracks. New evidence: " + G.evidence[iv.press.yields].title, "good");
                  } else {
                    flash(wrap, "Noted — but no new evidence here.", "");
                  }
                  if (sc.interviews.every((x) => state.presses.includes(x.suspect)))
                    completeScene(sc, wrap);
                  syncChrome(); save(); draw();
                },
              }, pressed(active) ? "Already pressed" : iv.press.label)
            : h("div", { class: "press-locked" }, [
                icon("lock"),
                h("span", { text: "You don't yet hold the evidence to press this line of questioning." }),
              ]),
          pressed(active) && iv.press.reply
            ? h("p", { class: "interro-line reply", text: iv.press.reply })
            : null,
        ]),
      ]));
      syncChrome(); save();
    }

    draw();
    wrap.appendChild(h("p", { class: "interro-help", text:
      "Select a suspect, then press them on what you know. A line of questioning only opens once you hold the clue that exposes the lie — so investigate the other locations first." }));
    wrap.appendChild(h("div", { class: "interro-layout" }, [roster, stage]));
    return wrap;
  }

  /* ---------------------- scene completion helper ------------------------- */
  function completeScene(sc, wrap) {
    if (!state.scenesDone[sc.id]) {
      state.scenesDone[sc.id] = true;
      save();
      if (wrap) {
        const banner = h("div", { class: "scene-complete" }, [
          icon("check"),
          h("span", { text: "Location examined." }),
          allScenesDone()
            ? h("button", { class: "btn btn-danger sm", onclick: () => go("accuse") }, "Ready to accuse →")
            : h("button", { class: "btn btn-ghost sm", onclick: () => go("hub") }, "Back to Case File →"),
        ]);
        wrap.appendChild(banner);
        setTimeout(() => banner.classList.add("show"), 20);
      }
    }
    syncChrome();
  }
  function solvedReward(sc) {
    return h("div", { class: "reward-strip" }, [
      h("p", { class: "muted", text: "Evidence secured here:" }),
      h("div", { class: "reward-cards" }, (sc.reward || []).map((r) => evidenceCard(r))),
    ]);
  }

  /* =========================================================================
     NOTEBOOK
  ========================================================================= */
  function ScreenNotebook() {
    const groups = { physical: [], digital: [], document: [], testimony: [], timeline: [] };
    state.evidence.forEach((id) => {
      const ev = G.evidence[id];
      if (ev) (groups[ev.type] = groups[ev.type] || []).push(id);
    });
    const order = ["physical", "digital", "document", "testimony", "timeline"];
    const sections = order
      .filter((t) => groups[t] && groups[t].length)
      .map((t) =>
        h("div", { class: "nb-group" }, [
          h("h3", { class: "nb-group-h" }, [icon(t === "document" ? "document" : t), " " + typeLabel(t)]),
          h("div", { class: "nb-cards" }, groups[t].map((id) => evidenceCard(id))),
        ])
      );

    return h("section", { class: "screen nb-screen" }, [
      h("div", { class: "section-head" }, [
        h("p", { class: "kicker", text: "THE NOTEBOOK" }),
        h("h2", { text: "Evidence collected — " + state.evidence.length + " items" }),
        h("p", { class: "muted", text: "Every clue you find is filed here automatically by type." }),
      ]),
      state.evidence.length
        ? h("div", { class: "nb-groups" }, sections)
        : h("p", { class: "empty-note", text: "No evidence yet. Examine the locations in your Case File." }),
    ]);
  }

  function evidenceCard(id) {
    const ev = G.evidence[id];
    if (!ev) return h("div");
    return h("article", { class: "ev-card type-" + ev.type }, [
      h("div", { class: "ev-top" }, [
        h("span", { class: "ev-ico" }, [icon(ev.type)]),
        h("span", { class: "ev-tag", text: ev.tag }),
      ]),
      h("h4", { class: "ev-title", text: ev.title }),
      h("p", { class: "ev-text", text: ev.text }),
    ]);
  }
  function typeLabel(t) {
    return { physical: "Physical Evidence", digital: "Digital Evidence", document: "Documents",
      testimony: "Testimony", timeline: "Timeline" }[t] || t;
  }

  /* =========================================================================
     DEDUCTION BOARD
  ========================================================================= */
  function ScreenBoard() {
    const axes = [
      { key: "means", label: "Means", q: "Could they get the toxin into that one glass?" },
      { key: "motive", label: "Motive", q: "Did Iris's return threaten to ruin them?" },
      { key: "opportunity", label: "Opportunity", q: "Were they able to reach Iris at the toast?" },
    ];

    const wrap = h("section", { class: "screen board-screen" });
    wrap.appendChild(h("div", { class: "section-head" }, [
      h("p", { class: "kicker", text: "THE DEDUCTION BOARD" }),
      h("h2", { text: "Means · Motive · Opportunity" }),
      h("p", { class: "muted", text:
        "For each suspect, assign the clue that settles each question. Everyone has a motive — " +
        "but only the killer has all three. Click a cell to back your conclusion with evidence." }),
    ]));

    const board = h("div", { class: "ded-board" });
    // header row
    board.appendChild(h("div", { class: "ded-corner", text: "Suspect" }));
    axes.forEach((a) => board.appendChild(
      h("div", { class: "ded-axis" }, [h("strong", { text: a.label }), h("span", { class: "muted", text: a.q })])));

    G.suspects.forEach((s) => {
      board.appendChild(h("div", { class: "ded-suspect" }, [
        monogramEl(s.monogram, "sm"),
        h("div", {}, [h("strong", { text: s.name }), h("span", { class: "muted", text: s.title.split(" · ")[0] })]),
      ]));
      axes.forEach((a) => board.appendChild(cell(s, a.key)));
    });

    function cell(s, axisKey) {
      const chosen = state.board[s.id][axisKey];
      const truth = G.matrix[s.id][axisKey];
      const settled = chosen && chosen === truth.proof && has(truth.proof);
      const c = h("button", {
        class: "ded-cell" + (settled ? (truth.status === "yes" ? " yes" : " no") : ""),
        onclick: () => openChooser(s, axisKey, c),
      });
      if (settled) {
        c.appendChild(h("span", { class: "ded-mark", text: truth.status === "yes" ? "✓" : "✗" }));
        c.appendChild(h("span", { class: "ded-note", text: truth.note }));
        c.appendChild(h("span", { class: "ded-proof", text: "via " + G.evidence[truth.proof].title }));
      } else {
        c.appendChild(h("span", { class: "ded-q", text: "?" }));
        c.appendChild(h("span", { class: "ded-hint", text: "Assign evidence" }));
      }
      return c;
    }

    function openChooser(s, axisKey, cellEl) {
      const truth = G.matrix[s.id][axisKey];
      const collected = state.evidence.slice();
      const overlay = h("div", { class: "modal-overlay", onclick: (e) => { if (e.target === overlay) overlay.remove(); } });
      const list = collected.length
        ? h("div", { class: "chooser-list" }, collected.map((id) =>
            h("button", { class: "chooser-item", onclick: () => {
              if (id === truth.proof) {
                state.board[s.id][axisKey] = id;
                save();
                overlay.remove();
                refresh();
              } else {
                msg.textContent = "That clue doesn't settle " + axisKey + " for " + s.name + ". Try another.";
                msg.className = "chooser-msg bad";
              }
            } }, [
              h("span", { class: "ev-ico" }, [icon(G.evidence[id].type)]),
              h("span", {}, [h("strong", { text: G.evidence[id].title }), h("span", { class: "muted", text: G.evidence[id].tag })]),
            ])))
        : h("p", { class: "muted", text: "You haven't collected any evidence yet." });
      const msg = h("p", { class: "chooser-msg" });
      const modal = h("div", { class: "modal chooser", onclick: (e) => e.stopPropagation() }, [
        h("p", { class: "kicker", text: s.name + " · " + axisKey.toUpperCase() }),
        h("h3", { text: "Which clue settles this?" }),
        state.board[s.id][axisKey]
          ? h("button", { class: "linklike clear-cell", onclick: () => {
              state.board[s.id][axisKey] = null; save(); overlay.remove(); refresh();
            } }, "Clear this conclusion")
          : null,
        list,
        msg,
        h("button", { class: "btn btn-ghost modal-close", onclick: () => overlay.remove() }, "Cancel"),
      ]);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    }

    function refresh() { go("board"); }

    wrap.appendChild(board);

    // convergence helper
    const fullySettled = (sid) =>
      ["means", "motive", "opportunity"].every((k) => {
        const t = G.matrix[sid][k];
        return state.board[sid][k] === t.proof && has(t.proof);
      });
    const allYes = (sid) =>
      ["means", "motive", "opportunity"].every((k) => G.matrix[sid][k].status === "yes") && fullySettled(sid);
    const culprit = G.suspects.find((s) => allYes(s.id));

    wrap.appendChild(h("div", { class: "board-foot" }, [
      culprit
        ? h("p", { class: "board-converge", text:
            "Convergence: only " + culprit.name + " shows means, motive, AND opportunity. " +
            "The board points to one person." })
        : h("p", { class: "muted", text:
            "Keep assigning evidence. When one suspect shows ✓ on all three axes, you've found your killer." }),
      allScenesDone()
        ? h("button", { class: "btn btn-danger", onclick: () => go("accuse") }, "Make the accusation →")
        : h("p", { class: "muted small", text: "Finish examining every location to unlock the accusation." }),
    ]));

    return wrap;
  }

  /* =========================================================================
     ACCUSATION
  ========================================================================= */
  function ScreenAccuse() {
    if (!allScenesDone()) return ScreenHub();
    const pick = { suspect: null, method: null, gun: null };

    const wrap = h("section", { class: "screen accuse-screen" });
    wrap.appendChild(h("div", { class: "section-head" }, [
      h("p", { class: "kicker danger", text: "THE ACCUSATION" }),
      h("h2", { text: "Name the killer — and prove it" }),
      h("p", { class: "muted", text:
        "There is one right answer. Choose the murderer, the method, and the single piece of " +
        "evidence that clinches the case. The ferry leaves at dawn." }),
    ]));

    // Step 1 — suspect
    const step1 = h("div", { class: "accuse-step" }, [
      h("h3", { class: "accuse-q", text: "1 · Who killed Iris Vale?" }),
      h("div", { class: "accuse-suspects" }, G.suspects.map((s) =>
        h("button", { class: "accuse-suspect", dataset: { id: s.id }, onclick: (e) => {
          pick.suspect = s.id; markSel(step1, ".accuse-suspect", e.currentTarget); update();
        } }, [
          monogramEl(s.monogram, "md"),
          h("strong", { text: s.name }),
          h("span", { class: "muted", text: s.title.split(" · ")[0] }),
        ]))),
    ]);

    // Step 2 — method
    const step2 = h("div", { class: "accuse-step" }, [
      h("h3", { class: "accuse-q", text: "2 · How was it done?" }),
      h("div", { class: "accuse-methods" }, G.accusation.methods.map((m) =>
        h("button", { class: "accuse-method", onclick: (e) => {
          pick.method = m.id; markSel(step2, ".accuse-method", e.currentTarget); update();
        } }, m.label))),
    ]);

    // Step 3 — smoking gun
    const step3 = h("div", { class: "accuse-step" }, [
      h("h3", { class: "accuse-q", text: "3 · " + G.accusation.smokingGunPrompt }),
      h("div", { class: "accuse-guns" }, state.evidence.map((id) =>
        h("button", { class: "accuse-gun", onclick: (e) => {
          pick.gun = id; markSel(step3, ".accuse-gun", e.currentTarget); update();
        } }, [
          h("span", { class: "ev-ico" }, [icon(G.evidence[id].type)]),
          h("span", { text: G.evidence[id].title }),
        ]))),
    ]);

    const submit = h("button", { class: "btn btn-danger btn-lg", disabled: true, onclick: () => {
      resolveAccusation(pick);
    } }, "Submit the accusation");

    function update() {
      submit.disabled = !(pick.suspect && pick.method && pick.gun);
    }

    wrap.appendChild(step1);
    wrap.appendChild(step2);
    wrap.appendChild(step3);
    wrap.appendChild(h("div", { class: "accuse-submit" }, [
      h("button", { class: "btn btn-ghost", onclick: () => go("board") }, "← Review the board"),
      submit,
    ]));
    return wrap;
  }

  function markSel(scope, sel, el) {
    scope.querySelectorAll(sel).forEach((b) => b.classList.remove("selected"));
    el.classList.add("selected");
  }

  function resolveAccusation(pick) {
    const sol = G.solution;
    const rightSuspect = pick.suspect === sol.suspect;
    const rightMethod = pick.method === sol.method;
    const rightGun = pick.gun === sol.smokingGun;
    state.lastAccusation = { pick, rightSuspect, rightMethod, rightGun };
    state.solved = rightSuspect && rightMethod && rightGun;
    save();
    go("result");
  }

  /* =========================================================================
     RESULT
  ========================================================================= */
  function ScreenResult() {
    const a = state.lastAccusation;
    if (!a) return ScreenHub();
    const wrap = h("section", { class: "screen result-screen" });

    if (state.solved) {
      wrap.appendChild(h("div", { class: "result-card win" }, [
        h("div", { class: "stamp solved", text: "CASE CLOSED" }),
        h("p", { class: "kicker", text: "YOU NAMED THE KILLER" }),
        h("h2", { class: "result-h", text: G.endings.win.title }),
        h("p", { class: "result-body", text: G.endings.win.body }),
        h("div", { class: "result-recap" }, [
          recapRow("Killer", suspectById(G.solution.suspect).name, true),
          recapRow("Method", methodLabel(G.solution.method), true),
          recapRow("Decisive proof", G.evidence[G.solution.smokingGun].title, true),
        ]),
        h("p", { class: "result-sign", text:
          "Solved by " + (state.detective || "Detective") + ", before sunrise." }),
        h("div", { class: "result-actions" }, [
          h("button", { class: "btn btn-primary", onclick: () => go("team") }, "Meet the makers"),
          h("button", { class: "btn btn-ghost", onclick: () => {
            if (confirm("Play again from the beginning?")) { resetGame(); go("onboard"); }
          } }, "Play again"),
        ]),
      ]));
    } else {
      let reason;
      if (!a.rightSuspect) reason = G.endings.lose.wrongSuspect;
      else if (!a.rightMethod) reason = G.endings.lose.wrongMethod;
      else reason = G.endings.lose.wrongGun;
      const m = G.accusation.methods.find((x) => x.id === a.pick.method);
      wrap.appendChild(h("div", { class: "result-card lose" }, [
        h("div", { class: "stamp failed", text: "CASE OPEN" }),
        h("p", { class: "kicker danger", text: "THE ACCUSATION DIDN'T HOLD" }),
        h("h2", { class: "result-h", text: G.endings.lose.title }),
        h("p", { class: "result-body", text: reason }),
        m && !m.correct && m.rebuttal ? h("p", { class: "result-rebut", text: "“" + m.rebuttal + "”" }) : null,
        h("div", { class: "result-recap" }, [
          recapRow("You accused", suspectById(a.pick.suspect).name, a.rightSuspect),
          recapRow("Method", methodLabel(a.pick.method), a.rightMethod),
          recapRow("Decisive proof", G.evidence[a.pick.gun].title, a.rightGun),
        ]),
        h("div", { class: "result-actions" }, [
          h("button", { class: "btn btn-primary", onclick: () => go("accuse") }, "Re-examine and try again"),
          h("button", { class: "btn btn-ghost", onclick: () => go("board") }, "Back to the board"),
        ]),
      ]));
    }
    return wrap;
  }
  function recapRow(label, val, ok) {
    return h("div", { class: "recap-row" }, [
      h("span", { class: "recap-label", text: label }),
      h("span", { class: "recap-val" }, [
        h("span", { class: "recap-mark " + (ok ? "ok" : "no"), text: ok ? "✓" : "✗" }),
        h("span", { text: val }),
      ]),
    ]);
  }
  function methodLabel(id) { return (G.accusation.methods.find((m) => m.id === id) || {}).label || id; }

  /* =========================================================================
     TEAM
  ========================================================================= */
  function ScreenTeam() {
    return h("section", { class: "screen team-screen" }, [
      h("div", { class: "section-head center" }, [
        h("p", { class: "kicker", text: "THE INVESTIGATORS BEHIND THE INVESTIGATION" }),
        h("h2", { text: "Meet the Team" }),
        h("p", { class: "muted", text:
          "Four roles, one mystery. Murder at Veridian Isle was designed and built by:" }),
      ]),
      h("div", { class: "team-grid" }, G.team.map((m) =>
        h("article", { class: "team-card" }, [
          monogramEl(m.monogram, "lg team"),
          h("h3", { class: "team-name", text: m.name }),
          h("p", { class: "team-role", text: m.role }),
          h("p", { class: "team-blurb", text: m.blurb }),
        ]))),
      h("div", { class: "center" }, [
        h("button", { class: "btn btn-ghost", onclick: () => go(state.started ? "hub" : "title") },
          state.started ? "← Back to the Case File" : "← Back"),
      ]),
    ]);
  }

  /* =========================================================================
     RULES / GUIDE
  ========================================================================= */
  function ScreenRules() {
    const R = G.rules;
    return h("section", { class: "screen rules-screen" }, [
      h("div", { class: "section-head" }, [
        h("p", { class: "kicker", text: "THE GUIDE" }),
        h("h2", { text: "How to Play" }),
        h("p", { class: "rules-obj", text: R.objective }),
      ]),

      h("div", { class: "rules-block" }, [
        h("h3", { text: "The four phases of an investigation" }),
        h("div", { class: "loop-grid" }, R.loop.map((l) =>
          h("div", { class: "loop-card" }, [h("h4", { text: l.h }), h("p", { text: l.p })]))),
      ]),

      h("div", { class: "rules-cols" }, [
        h("div", { class: "rules-block" }, [
          h("h3", { text: "Controls" }),
          h("table", { class: "controls-table" }, R.controls.map((c) =>
            h("tr", {}, [h("td", { class: "ctrl-k", text: c[0] }), h("td", { text: c[1] })]))),
        ]),
        h("div", { class: "rules-block" }, [
          h("h3", { text: "Detective's tips" }),
          h("ul", { class: "tips-list" }, R.tips.map((t) => h("li", { text: t }))),
        ]),
      ]),

      h("div", { class: "rules-block win-block" }, [
        h("h3", { text: "How you win" }),
        h("p", { text: R.win }),
      ]),

      h("div", { class: "center" }, [
        h("button", { class: "btn btn-primary", onclick: () => go(state.started ? "hub" : "onboard") },
          state.started ? "← Back to the Case File" : "Start the game"),
      ]),
    ]);
  }

  /* ------------------------------ misc ui --------------------------------- */
  function monogramEl(text, cls) {
    return h("span", { class: "monogram " + (cls || "") }, [h("span", { text: text })]);
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /* ------------------------------- boot ----------------------------------- */
  render();
  window.__VERIDIAN = { resetGame, state: () => state }; // small debug hook
})();
