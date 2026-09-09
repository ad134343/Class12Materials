// ============================================================
//  CLASS 12 — STUDY INDEX — CORE LOGIC
//  Name gate · Navigation · PDF thumbnails · Viewer · Logging
// ============================================================

(function () {
  "use strict";

  // ── PDF.js setup ───────────────────────────────────────
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  // A folder's thumbnails and the full viewer used to each call
  // pdfjsLib.getDocument() independently — meaning a 30–40MB scanned
  // PDF got fully fetched and parsed once for its thumbnail, then
  // AGAIN from scratch the moment someone clicked to actually view it.
  // This cache keeps the one loading task per file for the whole
  // session, so opening the viewer after its thumbnail has already
  // rendered reuses the same in-flight/completed load instead of
  // starting over. Session-scoped only — closing the tab clears it,
  // same as browser memory generally.
  const pdfLoadingTasks = new Map();
  function getPdfLoadingTask(encodedPath) {
    if (!pdfLoadingTasks.has(encodedPath)) {
      pdfLoadingTasks.set(encodedPath, pdfjsLib.getDocument(encodedPath));
    }
    return pdfLoadingTasks.get(encodedPath);
  }

  // ── Line icons (no emoji) ───────────────────────────────
  const ICONS = {
    maths: `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4.2 20h15.6z"/><path d="M12 3v17"/><circle cx="12" cy="3" r="1" fill="currentColor" stroke="none"/></svg>`,
    physics: `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><ellipse cx="12" cy="12" rx="9.2" ry="3.6"/><ellipse cx="12" cy="12" rx="9.2" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.2" ry="3.6" transform="rotate(120 12 12)"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>`,
    chemistry: `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2.5h5"/><path d="M10.3 2.5v6.4L4.6 18.8a1.6 1.6 0 0 0 1.4 2.4h12a1.6 1.6 0 0 0 1.4-2.4L13.7 8.9V2.5"/><path d="M7.6 15.3h8.8"/></svg>`,
    folder: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
    doc: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    tray: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2 3h6l2-3h4"/><path d="M5 12 3.5 6.4A1.6 1.6 0 0 1 5 4.5h14a1.6 1.6 0 0 1 1.5 1.9L19 12v5.4A1.6 1.6 0 0 1 17.4 19H6.6A1.6 1.6 0 0 1 5 17.4z"/></svg>`
  };

  // ── DOM refs ───────────────────────────────────────────
  const $ = (s) => document.querySelector(s);
  const gate        = $("#gate");
  const nameForm    = $("#nameForm");
  const nameInput   = $("#nameInput");
  const app         = $("#app");
  const homeBtn     = $("#homeBtn");
  const greeting    = $("#greeting");
  const logoutBtn   = $("#logoutBtn");
  const breadcrumb  = $("#breadcrumb");
  const content     = $("#content");
  const viewer      = $("#viewer");
  const viewerName  = $("#viewerName");
  const viewerClose = $("#viewerClose");
  const viewerOverlay = $("#viewerOverlay");
  const viewerPages = $("#viewerPages");
  const gateBtn     = $(".gate__btn");
  const gateError   = $("#gateError");
  const gateField   = $(".gate__field");

  // ── State ──────────────────────────────────────────────
  let curView     = "home";
  let curSubject  = null;
  let curFolder   = null;
  let currentName = "";

  // ── Helpers ────────────────────────────────────────────
  function encodePath(p) {
    return p.split("/").map((s) => encodeURIComponent(s)).join("/");
  }

  // Case/whitespace-insensitive match against the access list —
  // "PRIYA", " priya ", "Priya" all match "Priya".
  function normalizeName(s) {
    return s.trim().replace(/\s+/g, " ").toLowerCase();
  }

  // The access list stores salted SHA-256 hashes, not plaintext names,
  // so that opening dev tools on config.js doesn't hand someone the
  // exact list of valid names to try. This is a deterrent against
  // casual snooping, not real security — see the comment in config.js.
  async function sha256Hex(str) {
    const bytes = new TextEncoder().encode(str);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function hashName(name) {
    const list = SITE_CONFIG.accessList;
    const salt = (list && list.salt) || "";
    return sha256Hex(salt + normalizeName(name));
  }

  async function isAuthorized(name) {
    const list = SITE_CONFIG.accessList;
    if (!list || !list.enabled) return true;
    if (!window.crypto || !window.crypto.subtle) return true; // insecure context (e.g. plain http) — fail open rather than lock everyone out
    const hash = await hashName(name);
    return list.hashes.includes(hash);
  }

  // Console helper for adding a new student later without re-editing
  // through an AI assistant: open dev tools on the live site and run
  //   await __hashName("Their Name")
  // then paste the printed hash into config.js's accessList.hashes.
  window.__hashName = async (name) => {
    const hash = await hashName(name);
    console.log(hash);
    return hash;
  };

  // ── Device fingerprint ──────────────────────────────────
  // A hash of stable browser/hardware signals — NOT tied to any name
  // typed into the gate. This is what lets us block a specific phone
  // even if it enters someone else's name. It isn't perfect: clearing
  // site data doesn't change it (nothing is stored — it's recomputed
  // from hardware/browser traits each time), but a different browser
  // on the same phone, or reinstalling/resetting the browser's canvas
  // rendering, can shift it. Good enough as a sticky secondary layer;
  // not a substitute for the name-based block.
  function canvasFingerprint() {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("c12-fingerprint", 2, 15);
      ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
      ctx.fillText("c12-fingerprint", 4, 17);
      return canvas.toDataURL();
    } catch {
      return "";
    }
  }

  let cachedDeviceId = null;
  async function getDeviceId() {
    if (cachedDeviceId) return cachedDeviceId;
    const parts = [
      navigator.userAgent || "",
      navigator.platform || "",
      navigator.language || "",
      String(navigator.hardwareConcurrency || ""),
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      (Intl.DateTimeFormat().resolvedOptions().timeZone || ""),
      canvasFingerprint()
    ];
    cachedDeviceId = await sha256Hex(parts.join("||"));
    return cachedDeviceId;
  }

  // Console helper: open dev tools on the suspect's phone (or ask them
  // to, or just check the log sheet after their next attempt — see
  // logEvent below, which now records this on every login try) and
  // run  await __deviceId()  to get the value to paste into
  // config.js's suspended.deviceIds.
  window.__deviceId = async () => {
    const id = await getDeviceId();
    console.log(id);
    return id;
  };

  // ── Client IP (best-effort, bonus layer only) ───────────
  // Fetched from a public "what's my IP" service since a static site
  // has no server of its own to read it from. Fails silently (empty
  // string) if the request is blocked or slow — never blocks login on
  // a network hiccup.
  let cachedIp = null;
  async function getClientIp() {
    if (cachedIp !== null) return cachedIp;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const res = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();
      cachedIp = data.ip || "";
    } catch {
      cachedIp = "";
    }
    return cachedIp;
  }

  // ── Remote device blocklist ──────────────────────────────
  // Pulled from the Apps Script backend, which auto-adds a device
  // fingerprint here the moment that device gets blocked once by name
  // (see logEvent below and the Apps Script's doPost). This is what
  // makes the block automatic — you don't have to open the sheet and
  // paste anything into config.js yourself. Fails open (empty list)
  // on any network error, same philosophy as getClientIp: a hiccup
  // fetching this should never lock out a legitimate student.
  let cachedRemoteBlocked = null;
  async function fetchBlockedDeviceIds() {
    if (cachedRemoteBlocked) return cachedRemoteBlocked;
    const endpoint = SITE_CONFIG.logging && SITE_CONFIG.logging.endpoint;
    if (!endpoint || endpoint.indexOf("PASTE_YOUR") === 0) return [];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(`${endpoint}?action=blockedDevices`, { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();
      cachedRemoteBlocked = (data && data.blockedDevices) || [];
    } catch {
      cachedRemoteBlocked = [];
    }
    return cachedRemoteBlocked;
  }

  // ── Suspension check ─────────────────────────────────────
  // Checked BEFORE the normal accessList lookup. Any one of four
  // signals is enough to block: the typed name, this browser's device
  // fingerprint (checked against BOTH the static config.js list and
  // the auto-maintained remote list), or (best-effort) the current IP.
  // This is what makes "enters a classmate's name instead" not work —
  // the device fingerprint check doesn't care what name was typed.
  async function isSuspended(name) {
    const s = SITE_CONFIG.suspended;
    if (!s || !s.enabled) return false;

    if (name && Array.isArray(s.hashes) && s.hashes.length) {
      const hash = await hashName(name);
      if (s.hashes.includes(hash)) return true;
    }

    const deviceId = await getDeviceId();

    if (Array.isArray(s.deviceIds) && s.deviceIds.includes(deviceId)) return true;

    const remoteBlocked = await fetchBlockedDeviceIds();
    if (remoteBlocked.includes(deviceId)) return true;

    if (Array.isArray(s.ips) && s.ips.length) {
      const ip = await getClientIp();
      if (ip && s.ips.includes(ip)) return true;
    }

    return false;
  }

  // ── Font-load gate ───────────────────────────────────────
  // The gate's entrance animation is written in CSS as "paused"
  // until this fires. Fraunces/Archivo load async — if the reveal
  // ran on the browser's fallback-font layout, the real webfont
  // swapping in partway through would reflow the title (one line
  // → two lines) mid-clip-path and freeze the animation on a cut
  // frame. Waiting for the real fonts first removes that failure
  // mode entirely. A hard timeout guarantees the page never stays
  // invisible if font loading stalls (slow network, blocked CDN).
  function markFontsReady() {
    document.documentElement.classList.add("fonts-ready");
  }

  if (document.fonts && document.fonts.ready) {
    Promise.race([
      Promise.all([
        document.fonts.load('italic 500 100px Fraunces'),
        document.fonts.load('500 15px Archivo'),
        document.fonts.load('600 15px Archivo'),
        document.fonts.ready
      ]),
      new Promise((resolve) => setTimeout(resolve, 900))
    ]).then(markFontsReady).catch(markFontsReady);
  } else {
    setTimeout(markFontsReady, 300);
  }

  // ── Session persistence ──────────────────────────────────
  //  Stored as JSON {name, ts} rather than a bare name, so we can
  //  tell how long ago the login happened and expire it after
  //  SITE_CONFIG.session.expiryHours — this is what forces a fresh
  //  login on a browser that's been left open (or cached) for a while.
  function saveSession(name) {
    localStorage.setItem("c12_name", JSON.stringify({ name, ts: Date.now() }));
  }

  function readSession() {
    const raw = localStorage.getItem("c12_name");
    if (!raw) return null;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Old format from before expiry was added: a bare name string.
      // Treat it as expired so everyone gets re-prompted once, cleanly.
      return null;
    }
    if (!parsed || !parsed.name || !parsed.ts) return null;

    const minutes = (SITE_CONFIG.session && SITE_CONFIG.session.expiryMinutes);
    const maxAgeMs = (typeof minutes === "number" ? minutes : 15) * 60 * 1000;
    if (Date.now() - parsed.ts > maxAgeMs) return null; // expired

    return parsed.name;
  }

  function clearSession() {
    localStorage.removeItem("c12_name");
  }

  // ── Init ───────────────────────────────────────────────
  async function init() {
    const saved = readSession();
    if (saved && (await isSuspended(saved))) {
      clearSession();
      gate.classList.remove("hidden");
      app.classList.add("hidden");
      showGateError((SITE_CONFIG.suspended && SITE_CONFIG.suspended.message) || "You are not able to access this page.");
    } else if (saved && (await isAuthorized(saved))) {
      gate.classList.add("hidden");
      showApp(saved);
    } else {
      if (saved) clearSession(); // no longer on the list, or expired
      gate.classList.remove("hidden");
      app.classList.add("hidden");
    }

    nameForm.addEventListener("submit", onNameSubmit);
    nameInput.addEventListener("input", hideGateError);
    homeBtn.addEventListener("click", () => nav("home"));
    logoutBtn.addEventListener("click", () => {
      clearSession();
      location.reload();
    });
    viewerClose.addEventListener("click", closeViewer);
    viewerOverlay.addEventListener("click", closeViewer);
    $("#viewerZoomIn").addEventListener("click", zoomIn);
    $("#viewerZoomOut").addEventListener("click", zoomOut);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeViewer();

      // Block the obvious save/print shortcuts while a PDF is open.
      // This deters casual attempts, not determined ones — anyone
      // using DevTools directly can still get around it, same as any
      // browser-rendered PDF viewer (Google Drive's included).
      if (!viewer.classList.contains("hidden") && (e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "p")) {
        e.preventDefault();
      }
    });
    viewerPages.addEventListener("contextmenu", (e) => e.preventDefault());

    // Subtle magnetic pull on the gate CTA — a single deliberate
    // hover moment, not applied anywhere else.
    if (gateBtn && matchMedia("(hover: hover)").matches) {
      gateBtn.addEventListener("mousemove", (e) => {
        const r = gateBtn.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.15;
        const y = (e.clientY - r.top - r.height / 2) * 0.3;
        gateBtn.style.transform = `translate(${x}px, ${y}px)`;
      });
      gateBtn.addEventListener("mouseleave", () => {
        gateBtn.style.transform = "";
      });
    }
  }

  // ── Name Gate ──────────────────────────────────────────
  async function onNameSubmit(e) {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;

    // Tagged distinctly as "suspended" (not folded into "unauthorized")
    // so the Apps Script backend can tell this specific case apart and
    // auto-add the device fingerprint (parsed out of the page field
    // below) to its own blocklist — see the backend's doPost. This
    // needs the fresh Apps Script deployment to understand the tag;
    // it's safe now since that's being redeployed anyway.
    const [deviceId, ip] = await Promise.all([getDeviceId(), getClientIp()]);
    const trace = `${location.href} || device:${deviceId} || ip:${ip || "unknown"}`;

    if (await isSuspended(name)) {
      logEvent("login", name, "suspended", trace);
      showGateError((SITE_CONFIG.suspended && SITE_CONFIG.suspended.message) || "You are not able to access this page.");
      return;
    }

    if (!(await isAuthorized(name))) {
      logEvent("login", name, "unauthorized", trace);
      showGateError("You're not authorized to view this page. Please enter your actual name.");
      return;
    }

    hideGateError();
    saveSession(name);
    logEvent("login", name, "authorized", trace);
    gate.classList.add("fade-out");
    setTimeout(() => { gate.classList.add("hidden"); showApp(name); }, 650);
  }

  function showGateError(msg) {
    gateError.textContent = msg;
    gateError.classList.remove("hidden");
    gateField.classList.remove("shake");
    // Force reflow so the shake animation can re-trigger on repeat attempts
    void gateField.offsetWidth;
    gateField.classList.add("shake");
  }

  function hideGateError() {
    gateError.classList.add("hidden");
  }

  function showApp(name) {
    currentName = name;
    app.classList.remove("hidden");
    greeting.textContent = `Hi, ${name}`;
    nav("home");
  }

  // Generic activity logger — fires a silent background POST to the
  // Google Apps Script Web App URL in config.js, which appends a row
  // to a Google Sheet. Used for logins, PDF views, and PDF downloads.
  //
  // type:   "login" | "view" | "download"
  // detail: free-form extra info (e.g. the file name, or whether a
  //         login attempt was authorized)
  //
  // Note on mode: "no-cors" — Apps Script Web Apps don't answer the
  // CORS preflight browsers send for JSON POSTs, so a normal fetch
  // would fail silently anyway. "no-cors" plus a text/plain content
  // type keeps this a "simple request" (no preflight), and the sheet
  // still gets the row even though we can't read the response — same
  // fire-and-forget shape as the old Formspree call.
  function logEvent(type, name, detail, pageOverride) {
    const endpoint = SITE_CONFIG.logging && SITE_CONFIG.logging.endpoint;
    if (!endpoint || endpoint.indexOf("PASTE_YOUR") === 0) return;
    fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        type,
        name: name || "",
        detail: detail || "",
        time: new Date().toISOString(),
        page: pageOverride || location.href
      })
    }).catch(() => {});
  }

  // ── Navigation ─────────────────────────────────────────
  function nav(view, subjectId, folderId) {
    curView = view;
    curSubject = subjectId ? SITE_CONFIG.subjects.find((s) => s.id === subjectId) : null;
    curFolder = folderId && curSubject ? curSubject.subfolders.find((f) => f.id === folderId) : null;
    updateCrumbs();
    render();
  }

  function updateCrumbs() {
    let h = `<button class="crumb ${curView === 'home' ? 'crumb--active' : ''}" onclick="window.__nav('home')">Home</button>`;
    if (curSubject) {
      h += `<span class="crumb-sep">/</span>`;
      h += `<button class="crumb ${curView === 'subject' ? 'crumb--active' : ''}" onclick="window.__nav('subject','${curSubject.id}')">${curSubject.name}</button>`;
    }
    if (curFolder) {
      h += `<span class="crumb-sep">/</span>`;
      h += `<button class="crumb crumb--active">${curFolder.name}</button>`;
    }
    breadcrumb.innerHTML = h;
  }

  window.__nav = (v, s, f) => nav(v, s, f);

  // ── Render ─────────────────────────────────────────────
  function render() {
    content.innerHTML = "";
    switch (curView) {
      case "home":      renderSubjects(); break;
      case "subject":   renderFolders();  break;
      case "subfolder": renderFiles();    break;
    }
  }

  // ── Subjects ───────────────────────────────────────────
  function renderSubjects() {
    const label = el("p", "section-label", "Select a subject");
    const grid = el("div", "subjects stagger");

    SITE_CONFIG.subjects.forEach((s) => {
      const folderPreview = s.subfolders.map((f) => f.name).join(" · ");
      const card = el("div", "subject fade-up");
      card.style.setProperty("--subject-color", s.color);
      card.onclick = () => nav("subject", s.id);
      card.innerHTML = `
        <span class="subject__icon">${ICONS[s.id] || ICONS.maths}</span>
        <h2 class="subject__name">${s.name}</h2>
        <p class="subject__meta">${folderPreview}</p>
        <span class="subject__arrow">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>
        </span>`;
      grid.appendChild(card);
    });

    content.append(label, grid);
  }

  // ── Subfolders ─────────────────────────────────────────
  function renderFolders() {
    if (!curSubject) return;
    const label = el("p", "section-label", curSubject.name);
    const list = el("div", "subfolders stagger");

    curSubject.subfolders.forEach((f) => {
      const row = el("div", "subfolder fade-up");
      row.onclick = () => nav("subfolder", curSubject.id, f.id);
      row.innerHTML = `
        <div class="subfolder__icon">${ICONS.folder}</div>
        <div class="subfolder__info">
          <div class="subfolder__name">${f.name}</div>
          <div class="subfolder__count">${f.files.length} file${f.files.length !== 1 ? 's' : ''}</div>
        </div>
        <span class="subfolder__chevron">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </span>`;
      list.appendChild(row);
    });

    content.append(label, list);
  }

  // ── Files (Grid with PDF Thumbnails) ───────────────────
  function renderFiles() {
    if (!curFolder) return;

    const label = el("p", "section-label", curFolder.name);

    if (curFolder.files.length === 0) {
      const empty = el("div", "empty fade-up");
      empty.innerHTML = `
        <div class="empty__icon">${ICONS.tray}</div>
        <p class="empty__title">Nothing filed here yet</p>
        <p class="empty__sub">Materials will appear once added to this folder</p>`;
      content.append(label, empty);
      return;
    }

    const grid = el("div", "files stagger");

    curFolder.files.forEach((file) => {
      const card = el("div", "file-card fade-up");
      card.tabIndex = 0;

      const preview = el("div", "file-card__preview");

      const skeleton = el("div", "file-card__skeleton");
      skeleton.innerHTML = `${ICONS.doc}<span class="file-card__skeleton-text">Loading preview…</span>`;
      preview.appendChild(skeleton);

      const canvas = document.createElement("canvas");
      canvas.style.display = "none";
      preview.appendChild(canvas);
      renderThumbnail(file.path, canvas, skeleton);

      const overlay = el("div", "file-card__overlay");

      const viewBtn = document.createElement("button");
      viewBtn.className = "file-card__overlay-btn file-card__overlay-btn--view";
      viewBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> View`;
      viewBtn.addEventListener("click", (e) => { e.stopPropagation(); openViewer(file.path, file.name); });

      overlay.append(viewBtn);
      preview.appendChild(overlay);

      card.addEventListener("click", () => openViewer(file.path, file.name));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter") openViewer(file.path, file.name);
      });

      const info = el("div", "file-card__info");
      const nameP = el("p", "file-card__name");
      nameP.textContent = file.name;
      const typeP = el("p", "file-card__type", "PDF");
      info.append(nameP, typeP);

      card.append(preview, info);
      grid.appendChild(card);
    });

    content.append(label, grid);
  }

  // ── PDF Thumbnail Rendering (pdf.js) ───────────────────
  function renderThumbnail(path, canvas, skeleton) {
    if (!window.pdfjsLib) {
      skeleton.querySelector(".file-card__skeleton-text").textContent = "PDF";
      return;
    }

    const encoded = encodePath(path);
    const loading = getPdfLoadingTask(encoded);

    loading.promise.then((pdf) => {
      return pdf.getPage(1);
    }).then((page) => {
      const desiredWidth = 400;
      const unscaledViewport = page.getViewport({ scale: 1 });
      const scale = desiredWidth / unscaledViewport.width;
      const viewport = page.getViewport({ scale });

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const ctx = canvas.getContext("2d");
      return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(() => {
        skeleton.style.display = "none";
        canvas.style.display = "block";
      });
    }).catch(() => {
      skeleton.querySelector(".file-card__skeleton-text").textContent = "PDF";
      skeleton.style.animation = "none";
    });
  }

  // ── PDF Viewer ─────────────────────────────────────────
  // Renders every page to its own <canvas> via pdf.js, instead of
  // pointing an <iframe> at the raw file. Two reasons:
  //  1. No native browser/OS PDF handling involved at all — this is
  //     what fixes the iOS "stuck on thumbnail" and Android
  //     "just downloads instead of opening" behavior, since both of
  //     those come from each platform's own PDF plugin, not from
  //     this site. One consistent viewer now, same on every device.
  //  2. There's no visible `src="yourfile.pdf"` sitting in the page's
  //     HTML anymore for a "view source" to reveal instantly. It
  //     doesn't stop a DevTools Network-tab download (nothing
  //     browser-side can), but it closes the trivial route.
  let viewerLoadToken = 0;
  let currentPdf = null;
  let viewerZoom = 1;
  const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];

  function openViewer(path, name) {
    const encoded = encodePath(path);
    viewerName.textContent = name;
    viewer.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    logEvent("view", currentName, name);

    viewerPages.innerHTML = "";
    currentPdf = null;
    viewerZoom = 1;
    updateZoomLabel();
    const myToken = ++viewerLoadToken; // guards against a stale render finishing after the viewer's been closed/reopened
    const status = el("div", "viewer__status", "Loading…");
    viewerPages.appendChild(status);

    if (!window.pdfjsLib) {
      status.textContent = "Couldn't load the PDF viewer. Please refresh and try again.";
      return;
    }

    // Reuses the same loading task the folder thumbnail already
    // started (see getPdfLoadingTask) — for a large scanned PDF whose
    // thumbnail has already rendered, this resolves instantly instead
    // of re-fetching the whole file a second time.
    const task = getPdfLoadingTask(encoded);
    task.onProgress = (p) => {
      if (myToken !== viewerLoadToken) return;
      if (p.total) {
        status.textContent = `Loading… ${Math.min(100, Math.round((p.loaded / p.total) * 100))}%`;
      }
    };

    task.promise.then((pdf) => {
      if (myToken !== viewerLoadToken) return;
      currentPdf = pdf;
      status.remove();
      return renderAllPages(myToken);
    }).catch(() => {
      if (myToken !== viewerLoadToken) return;
      status.textContent = "Couldn't load this PDF. Please try again.";
    });
  }

  function renderAllPages(token) {
    viewerPages.querySelectorAll(".viewer__page").forEach((c) => c.remove());
    const pdf = currentPdf;
    if (!pdf) return Promise.resolve();

    // Rendered at devicePixelRatio so the base view is sharp on
    // retina/high-DPI phones — this alone fixes a lot of perceived
    // "blurriness" independent of zoom. The zoom buttons below then
    // ask pdf.js to redraw at a genuinely higher resolution rather
    // than stretching this canvas, which is what pinch-zoom was doing
    // before (and why it went pixelated).
    const dpr = window.devicePixelRatio || 1;

    const renderPage = (pageNum) => {
      if (token !== viewerLoadToken) return Promise.resolve();
      return pdf.getPage(pageNum).then((page) => {
        if (token !== viewerLoadToken) return;
        const displayWidth = Math.min(viewerPages.clientWidth - 32, 900) * viewerZoom;
        const unscaledViewport = page.getViewport({ scale: 1 });
        const renderScale = (displayWidth / unscaledViewport.width) * dpr;
        const viewport = page.getViewport({ scale: renderScale });

        const canvas = document.createElement("canvas");
        canvas.className = "viewer__page";
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${viewport.height / dpr}px`;
        viewerPages.appendChild(canvas);

        const ctx = canvas.getContext("2d");
        return page.render({ canvasContext: ctx, viewport }).promise;
      });
    };

    // Rendered sequentially (not all at once) so a long document
    // doesn't stall the browser trying to render every page up front.
    let chain = Promise.resolve();
    for (let i = 1; i <= pdf.numPages; i++) {
      chain = chain.then(() => renderPage(i));
    }
    return chain;
  }

  function updateZoomLabel() {
    const label = $("#viewerZoomLabel");
    if (label) label.textContent = `${Math.round(viewerZoom * 100)}%`;
  }

  function setZoom(next) {
    if (!currentPdf || next === viewerZoom) return;
    viewerZoom = next;
    updateZoomLabel();
    const myToken = ++viewerLoadToken; // supersedes any render still in flight from a prior zoom click
    renderAllPages(myToken);
  }

  function zoomIn() {
    const idx = ZOOM_STEPS.indexOf(viewerZoom);
    setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, (idx === -1 ? 1 : idx) + 1)]);
  }

  function zoomOut() {
    const idx = ZOOM_STEPS.indexOf(viewerZoom);
    setZoom(ZOOM_STEPS[Math.max(0, (idx === -1 ? 1 : idx) - 1)]);
  }

  function closeViewer() {
    viewer.classList.add("hidden");
    viewerLoadToken++; // invalidate any render still in flight
    currentPdf = null;
    viewerPages.innerHTML = "";
    viewerPages.scrollTop = 0;
    document.body.style.overflow = "";
  }

  // ── Utility ────────────────────────────────────────────
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  // ── Go ─────────────────────────────────────────────────
  init();
})();
