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

  // ── Thumbnail lazy-load + concurrency throttle ─────────
  // Opening a folder used to fire off a full pdf.js load for EVERY
  // file in it at once, which could genuinely choke a connection on
  // a folder with many large files. But capping it too low backfires
  // just as badly: with only a couple of slots open, a small file
  // sitting near the back of an 8-file folder has to wait for
  // several bigger files ahead of it to finish before it even starts
  // — so a quick 4MB file can *look* like it took 45 seconds when
  // really it spent most of that time queued, not downloading.
  // 4 concurrent is a better balance for realistic folder sizes here
  // (single digits to ~17MB each) — enough parallelism that nothing
  // sits queued for long, while still well short of firing off every
  // file in a folder simultaneously.
  const THUMBNAIL_CONCURRENCY = 4;
  let activeThumbnailLoads = 0;
  const thumbnailQueue = [];

  function queueThumbnailLoad(task) {
    thumbnailQueue.push(task);
    drainThumbnailQueue();
  }

  function drainThumbnailQueue() {
    while (activeThumbnailLoads < THUMBNAIL_CONCURRENCY && thumbnailQueue.length) {
      const task = thumbnailQueue.shift();
      activeThumbnailLoads++;
      task().finally(() => {
        activeThumbnailLoads--;
        drainThumbnailQueue();
      });
    }
  }

  let thumbObserver = null;
  function observeThumbnail(target, path, canvas, skeleton) {
    if (!("IntersectionObserver" in window)) {
      // No IntersectionObserver support — fall back to loading
      // immediately (still throttled by the concurrency queue above).
      queueThumbnailLoad(() => renderThumbnail(path, canvas, skeleton));
      return;
    }
    if (!thumbObserver) {
      thumbObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            thumbObserver.unobserve(entry.target);
            const data = entry.target.__thumbData;
            if (data) queueThumbnailLoad(() => renderThumbnail(data.path, data.canvas, data.skeleton));
          });
        },
        { rootMargin: "300px 0px", threshold: 0.01 }
      );
    }
    target.__thumbData = { path, canvas, skeleton };
    thumbObserver.observe(target);
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

  // ── Admin dashboard refs ─────────────────────────────────
  const adminApp           = $("#adminApp");
  const adminBackBtn       = $("#adminBackBtn");
  const adminRefreshBtn    = $("#adminRefreshBtn");
  const adminPresenceList  = $("#adminPresenceList");
  const adminRosterList    = $("#adminRosterList");
  const adminDetail        = $("#adminDetail");
  const adminDetailOverlay = $("#adminDetailOverlay");
  const adminDetailClose   = $("#adminDetailClose");
  const adminDetailName    = $("#adminDetailName");
  const adminDetailBody    = $("#adminDetailBody");

  // ── State ──────────────────────────────────────────────
  let curView     = "home";
  let curSubject  = null;
  let curFolder   = null;
  let currentName = "";

  // ── Session / view tracking (for the activity log) ──────
  // sessionId identifies one "visit" (from the app becoming visible
  // to the tab closing/reloading/logging out). viewId identifies one
  // PDF being open. Both are randomly generated client-side purely to
  // let rows in the Log sheet be grouped back into a readable trail —
  // they carry no personal info themselves.
  let sessionId          = null;
  let sessionStart        = null;
  let currentViewId       = null;
  let currentViewName     = null;
  let currentViewActiveMs = 0;   // accumulated foreground time for the open PDF
  let currentViewResumedAt = null; // timestamp the PDF most recently became foregrounded
  let heartbeatTimer      = null;

  function makeId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

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

  // Admin secret hashing — same salted-hash model as hashName above,
  // but NOT lowercased/space-collapsed, so case and spacing in your
  // chosen phrase count toward its strength instead of being thrown
  // away. Console helper: open dev tools on the live site and run
  //   await __hashAdminSecret("your chosen phrase")
  // then paste the printed value into config.js's admin.secretHash.
  async function hashAdminSecret(secret) {
    const salt = (SITE_CONFIG.admin && SITE_CONFIG.admin.salt) || "";
    return sha256Hex(salt + secret.trim());
  }

  window.__hashAdminSecret = async (secret) => {
    const hash = await hashAdminSecret(secret);
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
      const timeout = setTimeout(() => controller.abort(), 1500);
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
      const timeout = setTimeout(() => controller.abort(), 1500);
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
    // Safety net for mobile keyboards: some virtual keyboards' Enter/Go
    // key doesn't reliably fire a native form submit inside in-app
    // browsers. Preventing the default here and calling requestSubmit()
    // ourselves makes Enter behave exactly like tapping Continue, on
    // every browser, without ever double-submitting.
    nameInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (nameForm.requestSubmit) nameForm.requestSubmit();
      else onNameSubmit(e);
    });
    homeBtn.addEventListener("click", () => nav("home"));
    logoutBtn.addEventListener("click", () => {
      endCurrentView();
      if (sessionId) {
        const seconds = sessionStart ? Math.round((Date.now() - sessionStart) / 1000) : "";
        logEventBeacon("session_end", currentName, "logout", undefined, { duration: seconds });
      }
      stopHeartbeat();
      clearSession();
      location.reload();
    });
    document.addEventListener("visibilitychange", () => {
      if (!currentViewId) return;
      if (document.hidden) {
        if (currentViewResumedAt !== null) {
          currentViewActiveMs += Date.now() - currentViewResumedAt;
          currentViewResumedAt = null;
        }
      } else {
        currentViewResumedAt = Date.now();
      }
    });

    // Fires on tab close, browser close, and reload — the one moment
    // a normal fetch can't be trusted to finish, so both of these go
    // out via sendBeacon instead (see logEventBeacon above).
    window.addEventListener("pagehide", () => {
      endCurrentView();
      if (sessionId) {
        const seconds = sessionStart ? Math.round((Date.now() - sessionStart) / 1000) : "";
        logEventBeacon("session_end", currentName, "closed", undefined, { duration: seconds });
      }
    });

    adminBackBtn.addEventListener("click", exitAdmin);
    adminRefreshBtn.addEventListener("click", refreshAdmin);
    adminDetailClose.addEventListener("click", closeAdminDetail);
    adminDetailOverlay.addEventListener("click", closeAdminDetail);

    viewerClose.addEventListener("click", closeViewer);
    viewerOverlay.addEventListener("click", closeViewer);
    $("#viewerZoomIn").addEventListener("click", zoomIn);
    $("#viewerZoomOut").addEventListener("click", zoomOut);
    viewerPages.addEventListener("touchstart", onViewerTouchStart, { passive: true });
    viewerPages.addEventListener("touchmove", onViewerTouchMove, { passive: false });
    viewerPages.addEventListener("touchend", onViewerTouchEnd, { passive: true });
    viewerPages.addEventListener("touchcancel", onViewerTouchEnd, { passive: true });
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

    // Instant feedback the moment Continue is tapped/clicked — before
    // any of the network-bound checks below even start. Those checks
    // (device/IP lookups) can take a second or two on a slow
    // connection, and with no visual change on tap it looked like the
    // press hadn't registered, so people tapped again (or gave up).
    setGateBusy(true);
    hideGateError();

    try {
      // Admin entry: checked before anything else, and returns early
      // so this never touches the Log sheet, the access list, or
      // localStorage — the admin secret leaves no trace of itself in
      // your own student-facing data. Compared as a salted hash, same
      // model as the access list, so the real phrase never sits in
      // config.js as plain text.
      if (SITE_CONFIG.admin && SITE_CONFIG.admin.enabled && SITE_CONFIG.admin.secretHash) {
        const candidateHash = await hashAdminSecret(name);
        if (candidateHash === SITE_CONFIG.admin.secretHash) {
          nameInput.value = "";
          hideGateError();
          enterAdmin();
          return;
        }
      }

      // Tagged distinctly as "suspended" (not folded into "unauthorized")
      // so the Apps Script backend can tell this specific case apart and
      // auto-add the device fingerprint (parsed out of the page field
      // below) to its own blocklist — see the backend's doPost. This
      // needs the fresh Apps Script deployment to understand the tag;
      // it's safe now since that's being redeployed anyway.
      //
      // All three network-bound lookups fire together instead of one
      // after another — isSuspended() below used to trigger its own
      // separate blocklist fetch AFTER this line finished, so on a
      // slow connection the two waits stacked (up to ~5s total).
      // Prefetching fetchBlockedDeviceIds() here means isSuspended()
      // just reads the already-resolved, cached result.
      const [deviceId, ip] = await Promise.all([
        getDeviceId(),
        getClientIp(),
        fetchBlockedDeviceIds()
      ]);
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
    } finally {
      // Always release the busy state — on a rejected path the person
      // needs the button back immediately to retry; on the success
      // path it's harmless since the gate is already fading out.
      setGateBusy(false);
    }
  }

  // Instant visual proof that the tap/click registered, before any of
  // the network checks above resolve: button dims, label swaps, and
  // the arrow spins in place instead of nothing appearing to happen
  // for a couple of seconds.
  const gateBtnLabel = gateBtn.querySelector(".gate__btn-label");
  const gateBtnLabelText = gateBtnLabel ? gateBtnLabel.textContent : "";
  function setGateBusy(isBusy) {
    gateBtn.disabled = isBusy;
    gateBtn.classList.toggle("is-busy", isBusy);
    if (gateBtnLabel) gateBtnLabel.textContent = isBusy ? "Please wait…" : gateBtnLabelText;
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
    sessionId = makeId();
    sessionStart = Date.now();
    app.classList.remove("hidden");
    greeting.textContent = `Hi, ${name}`;
    logEvent("session_start", name, "");
    startHeartbeat();
    nav("home");
  }

  // ── Heartbeat ("who's on the site right now") ───────────
  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(sendHeartbeat, 45000);
    sendHeartbeat(); // so Presence shows them immediately, not after 45s
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function sendHeartbeat() {
    if (!sessionId) return;
    const where = currentViewId
      ? `viewing: ${currentViewName}`
      : (curFolder ? curFolder.name : curSubject ? curSubject.name : "home");
    logEvent("heartbeat", currentName, where);
  }

  // Generic activity logger — fires a silent background POST to the
  // Google Apps Script Web App URL in config.js, which appends a row
  // to a Google Sheet. Used for logins, PDF views, navigation, and
  // session start/end.
  //
  // type:   "login" | "session_start" | "session_end" | "view" |
  //         "view_end" | "navigate" | "heartbeat"
  // detail: free-form extra info (e.g. the file name, or whether a
  //         login attempt was authorized)
  // extra:  optional { viewId, duration } — duration is in seconds
  //
  // Note on mode: "no-cors" — Apps Script Web Apps don't answer the
  // CORS preflight browsers send for JSON POSTs, so a normal fetch
  // would fail silently anyway. "no-cors" plus a text/plain content
  // type keeps this a "simple request" (no preflight), and the sheet
  // still gets the row even though we can't read the response — same
  // fire-and-forget shape as the old Formspree call.
  function buildLogPayload(type, name, detail, pageOverride, extra) {
    return JSON.stringify({
      type,
      name: name || "",
      detail: detail || "",
      time: new Date().toISOString(),
      page: pageOverride || location.href,
      sessionId: sessionId || "",
      viewId: (extra && extra.viewId) || "",
      duration: (extra && extra.duration !== undefined && extra.duration !== null) ? extra.duration : ""
    });
  }

  function logEvent(type, name, detail, pageOverride, extra) {
    const endpoint = SITE_CONFIG.logging && SITE_CONFIG.logging.endpoint;
    if (!endpoint || endpoint.indexOf("PASTE_YOUR") === 0) return;
    fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: buildLogPayload(type, name, detail, pageOverride, extra)
    }).catch(() => {});
  }

  // Same as logEvent, but for events that need to survive the tab
  // actually closing (session end, a PDF view ending as someone
  // leaves). A normal fetch can get killed mid-flight when the page
  // unloads; sendBeacon is built specifically to still deliver in
  // that moment. Falls back to a keepalive fetch on old browsers.
  function logEventBeacon(type, name, detail, pageOverride, extra) {
    const endpoint = SITE_CONFIG.logging && SITE_CONFIG.logging.endpoint;
    if (!endpoint || endpoint.indexOf("PASTE_YOUR") === 0) return;
    const payload = buildLogPayload(type, name, detail, pageOverride, extra);
    if (navigator.sendBeacon) {
      try {
        if (navigator.sendBeacon(endpoint, payload)) return;
      } catch {
        // fall through to fetch below
      }
    }
    fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      keepalive: true,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: payload
    }).catch(() => {});
  }

  // ── Navigation ─────────────────────────────────────────
  function nav(view, subjectId, folderId) {
    curView = view;
    curSubject = subjectId ? SITE_CONFIG.subjects.find((s) => s.id === subjectId) : null;
    curFolder = folderId && curSubject ? curSubject.subfolders.find((f) => f.id === folderId) : null;
    updateCrumbs();
    render();

    if (sessionId) {
      const where = curFolder ? `folder:${curFolder.name}` : curSubject ? `subject:${curSubject.name}` : "home";
      logEvent("navigate", currentName, where);
    }
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
      observeThumbnail(preview, file.path, canvas, skeleton);

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
  // Caches a small JPEG snapshot of each rendered thumbnail so the
  // viewer can show it instantly as a placeholder — see openViewer.
  const thumbnailImageCache = new Map();

  function renderThumbnail(path, canvas, skeleton) {
    const textEl = skeleton.querySelector(".file-card__skeleton-text");
    if (!window.pdfjsLib) {
      textEl.textContent = "PDF";
      return Promise.resolve();
    }

    const encoded = encodePath(path);
    const loading = getPdfLoadingTask(encoded);

    // Only wire progress onto the skeleton if nothing else (e.g. an
    // already-open viewer for this same file) has claimed the task's
    // progress callback since.
    loading.onProgress = (p) => {
      if (p.total) {
        textEl.textContent = `Loading… ${Math.min(100, Math.round((p.loaded / p.total) * 100))}%`;
      }
    };

    return loading.promise.then((pdf) => {
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
        try {
          // Low quality is fine — this is only ever shown briefly,
          // scaled up, as a stand-in for the real page.
          thumbnailImageCache.set(path, canvas.toDataURL("image/jpeg", 0.7));
        } catch {
          // toDataURL can throw in odd browser/security configs —
          // just skip the placeholder for this file, not fatal.
        }
      });
    }).catch(() => {
      textEl.textContent = "PDF";
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
  let pagesInner = null; // scaled independently of the scrolling outer container, so a live pinch can transform it without fighting scroll
  let viewerPlaceholder = null; // instant cached-thumbnail stand-in, removed once the real page 1 renders
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 3;
  const ZOOM_INCREMENT = 0.25;

  function openViewer(path, name) {
    endCurrentView(); // in case a different PDF was already open — close out its timer first
    const encoded = encodePath(path);
    viewerName.textContent = name;
    viewer.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    currentViewId = makeId();
    currentViewName = name;
    currentViewActiveMs = 0;
    currentViewResumedAt = document.hidden ? null : Date.now();
    logEvent("view", currentName, name, undefined, { viewId: currentViewId });

    viewerPages.innerHTML = "";
    currentPdf = null;
    viewerZoom = 1;
    updateZoomLabel();
    pagesInner = el("div", "viewer__pages-inner");

    const myToken = ++viewerLoadToken; // guards against a stale render finishing after the viewer's been closed/reopened

    // Instant placeholder: if this file's thumbnail already rendered
    // in the folder grid, show that cached snapshot immediately —
    // zero wait — while the real high-res pages load behind it. Purely
    // a perceived-speed trick: nothing here is a network request.
    let placeholder = null;
    const cachedThumb = thumbnailImageCache.get(path);
    if (cachedThumb) {
      placeholder = el("img", "viewer__placeholder");
      placeholder.src = cachedThumb;
      pagesInner.appendChild(placeholder);
      viewerPages.appendChild(pagesInner);
    }
    viewerPlaceholder = placeholder;

    // Real progress bar instead of a plain "Loading…" label — a
    // determinate fill once the file size is known, falling back to
    // an indeterminate sliding animation if the server doesn't report
    // Content-Length. The point is just to keep showing the person
    // something is actively happening so they don't give up and leave.
    const status = el("div", "viewer__status");
    const statusText = el("p", "viewer__status-text", placeholder ? "Loading full quality…" : "Loading document…");
    const track = el("div", "viewer__progress-track viewer__progress-track--indeterminate");
    const fill = el("div", "viewer__progress-fill");
    track.appendChild(fill);
    status.append(statusText, track);
    if (placeholder) {
      status.classList.add("viewer__status--over-placeholder");
    }
    viewerPages.appendChild(status);

    if (!window.pdfjsLib) {
      statusText.textContent = "Couldn't load the PDF viewer. Please refresh and try again.";
      track.remove();
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
        track.classList.remove("viewer__progress-track--indeterminate");
        const pct = Math.min(100, Math.round((p.loaded / p.total) * 100));
        fill.style.width = `${pct}%`;
        statusText.textContent = `Loading… ${pct}%`;
      }
    };

    task.promise.then((pdf) => {
      if (myToken !== viewerLoadToken) return;
      currentPdf = pdf;
      status.remove();
      viewerPages.appendChild(pagesInner);
      return renderAllPages(myToken);
    }).catch(() => {
      if (myToken !== viewerLoadToken) return;
      statusText.textContent = "Couldn't load this PDF. Please try again.";
      track.remove();
    });
  }

  function renderAllPages(token) {
    if (!pagesInner) return Promise.resolve();
    pagesInner.querySelectorAll(".viewer__page").forEach((c) => c.remove());
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
        pagesInner.appendChild(canvas);

        // The real page 1 has arrived — swap out the instant cached
        // placeholder now instead of leaving it stacked above the
        // genuine pages.
        if (pageNum === 1 && viewerPlaceholder) {
          viewerPlaceholder.remove();
          viewerPlaceholder = null;
        }

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

  function clampZoom(z) {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  }

  function setZoom(next) {
    next = Math.round(clampZoom(next) * 100) / 100;
    if (!currentPdf || next === viewerZoom) return;
    viewerZoom = next;
    updateZoomLabel();
    const myToken = ++viewerLoadToken; // supersedes any render still in flight from a prior zoom click
    renderAllPages(myToken);
  }

  function zoomIn() {
    setZoom(viewerZoom + ZOOM_INCREMENT);
  }

  function zoomOut() {
    setZoom(viewerZoom - ZOOM_INCREMENT);
  }

  // ── Pinch-to-zoom ────────────────────────────────────────
  // Native pinch was disabled on purpose (touch-action: pan-x pan-y
  // in CSS) because it just stretches the already-rendered canvas —
  // pinch out far enough and it goes visibly blurry. This gives the
  // same real pinch gesture back without that trade-off: while the
  // fingers are moving, a cheap CSS transform on the pages wrapper
  // tracks them live for instant visual feedback; the moment the
  // gesture ends, the transform resets and a single real re-render
  // happens at the new zoom level through the normal high-res path.
  let pinchStartDist = null;
  let pinchStartZoom = 1;
  let pinchLiveZoom = null;

  function touchDistance(touches) {
    const [a, b] = touches;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function onViewerTouchStart(e) {
    if (e.touches.length === 2 && currentPdf) {
      pinchStartDist = touchDistance(e.touches);
      pinchStartZoom = viewerZoom;
    }
  }

  function onViewerTouchMove(e) {
    if (e.touches.length === 2 && pinchStartDist && pagesInner) {
      e.preventDefault();
      const scale = touchDistance(e.touches) / pinchStartDist;
      pinchLiveZoom = clampZoom(pinchStartZoom * scale);
      pagesInner.style.transform = `scale(${pinchLiveZoom / pinchStartZoom})`;
    }
  }

  function onViewerTouchEnd(e) {
    if (pinchStartDist !== null && e.touches.length < 2) {
      pinchStartDist = null;
      if (pagesInner) pagesInner.style.transform = "";
      if (pinchLiveZoom !== null) setZoom(pinchLiveZoom);
      pinchLiveZoom = null;
    }
  }

  function closeViewer() {
    endCurrentView();
    viewer.classList.add("hidden");
    viewerLoadToken++; // invalidate any render still in flight
    currentPdf = null;
    pagesInner = null;
    viewerPlaceholder = null;
    viewerPages.innerHTML = "";
    viewerPages.scrollTop = 0;
    document.body.style.overflow = "";
  }

  // Ends the currently-open PDF's timer (if any) and logs how long it
  // was actually on screen — foreground time only, since the pause on
  // tab-hidden/visible below stops the clock while the tab is
  // backgrounded. Sent via beacon so it survives the tab closing too.
  function endCurrentView() {
    if (!currentViewId) return;
    if (currentViewResumedAt !== null) {
      currentViewActiveMs += Date.now() - currentViewResumedAt;
      currentViewResumedAt = null;
    }
    const seconds = Math.round(currentViewActiveMs / 1000);
    logEventBeacon("view_end", currentName, currentViewName, undefined, { viewId: currentViewId, duration: seconds });
    currentViewId = null;
    currentViewName = null;
    currentViewActiveMs = 0;
  }

  // ── Admin Dashboard ──────────────────────────────────────
  // Everything here reads fresh from the sheet on every open — no
  // client-side caching between visits, per your request. The only
  // "live" piece is the online-now list, which re-polls on an
  // interval while the dashboard is actually open.

  let adminPresenceTimer = null;
  let fileSubjectMap = null;

  function adminEndpointUrl(action, params) {
    const endpoint = SITE_CONFIG.logging && SITE_CONFIG.logging.endpoint;
    const key = SITE_CONFIG.admin && SITE_CONFIG.admin.key;
    const url = new URL(endpoint);
    url.searchParams.set("action", action);
    url.searchParams.set("key", key);
    if (params) Object.keys(params).forEach((k) => url.searchParams.set(k, params[k]));
    return url.toString();
  }

  async function adminFetch(action, params) {
    try {
      const res = await fetch(adminEndpointUrl(action, params));
      const data = await res.json();
      return (data && data.ok) ? data : null;
    } catch {
      return null;
    }
  }

  // Maps a file's display name (what's logged as `detail` on view
  // events) back to which subject/folder it lives under, using the
  // same SITE_CONFIG this page already has — no need for the backend
  // to know anything about subjects.
  function getFileSubjectMap() {
    if (fileSubjectMap) return fileSubjectMap;
    fileSubjectMap = {};
    SITE_CONFIG.subjects.forEach((s) => {
      s.subfolders.forEach((f) => {
        f.files.forEach((file) => {
          fileSubjectMap[file.name] = { subject: s.name, folder: f.name };
        });
      });
    });
    return fileSubjectMap;
  }

  function enterAdmin() {
    gate.classList.add("hidden");
    app.classList.add("hidden");
    adminApp.classList.remove("hidden");
    refreshAdmin();
    stopAdminPolling();
    adminPresenceTimer = setInterval(renderAdminPresence, 20000);
  }

  function exitAdmin() {
    stopAdminPolling();
    closeAdminDetail();
    adminApp.classList.add("hidden");
    gate.classList.remove("hidden");
  }

  function stopAdminPolling() {
    if (adminPresenceTimer) {
      clearInterval(adminPresenceTimer);
      adminPresenceTimer = null;
    }
  }

  function refreshAdmin() {
    renderAdminPresence();
    renderAdminRoster();
  }

  async function renderAdminPresence() {
    const data = await adminFetch("presenceLive");
    const online = (data && data.online) || [];
    adminPresenceList.innerHTML = "";

    if (!data) {
      adminPresenceList.innerHTML = `<p class="admin__empty">Couldn't reach the sheet — check the admin key.</p>`;
      return;
    }
    if (!online.length) {
      adminPresenceList.innerHTML = `<p class="admin__empty">Nobody online right now</p>`;
      return;
    }

    online.forEach((person) => {
      const startedAt = new Date(person.sessionStart).getTime();
      const mins = Math.max(0, Math.round((Date.now() - startedAt) / 60000));
      const row = el("div", "admin__presence-row");
      row.innerHTML = `
        <span class="admin__presence-dot"></span>
        <div class="admin__presence-info">
          <span class="admin__presence-name">${person.name}</span>
          <span class="admin__presence-meta">online ${mins} min · ${person.currentPage || "home"}</span>
        </div>`;
      row.addEventListener("click", () => openAdminDetail(person.name));
      adminPresenceList.appendChild(row);
    });
  }

  async function renderAdminRoster() {
    adminRosterList.innerHTML = `<p class="admin__loading">Loading…</p>`;
    const data = await adminFetch("adminSummary");
    const people = (data && data.people) || [];
    adminRosterList.innerHTML = "";

    if (!data) {
      adminRosterList.innerHTML = `<p class="admin__empty">Couldn't reach the sheet — check the admin key.</p>`;
      return;
    }
    if (!people.length) {
      adminRosterList.innerHTML = `<p class="admin__empty">No activity logged yet</p>`;
      return;
    }

    people.forEach((p) => {
      const row = el("div", "admin__roster-row");
      row.tabIndex = 0;
      const lastSeen = p.lastSeen ? new Date(p.lastSeen).toLocaleString() : "—";
      const totalMins = Math.round((p.totalSessionSeconds || 0) / 60);
      row.innerHTML = `
        <div class="admin__roster-name">${p.name}</div>
        <div class="admin__roster-stat">${totalMins}m total</div>
        <div class="admin__roster-stat">${p.sessionCount} session${p.sessionCount === 1 ? "" : "s"}</div>
        <div class="admin__roster-stat admin__roster-lastseen">Last seen ${lastSeen}</div>`;
      row.addEventListener("click", () => openAdminDetail(p.name));
      row.addEventListener("keydown", (e) => { if (e.key === "Enter") openAdminDetail(p.name); });
      adminRosterList.appendChild(row);
    });
  }

  async function openAdminDetail(name) {
    adminDetail.classList.remove("hidden");
    adminDetailName.textContent = name;
    adminDetailBody.innerHTML = `<p class="admin__loading">Loading…</p>`;
    const data = await adminFetch("personDetail", { name });
    if (!data) {
      adminDetailBody.innerHTML = `<p class="admin__empty">Couldn't reach the sheet — check the admin key.</p>`;
      return;
    }
    renderAdminDetail(data.events || []);
  }

  function closeAdminDetail() {
    adminDetail.classList.add("hidden");
  }

  function renderAdminDetail(events) {
    const subjectMap = getFileSubjectMap();
    const subjectSeconds = {};
    const fileSeconds = {};
    let totalViewSeconds = 0;
    let totalSessionSeconds = 0;
    let sessionCount = 0;
    const recentRows = events.slice(0, 40);

    events.forEach((ev) => {
      if (ev.type === "view_end" && ev.duration) {
        totalViewSeconds += ev.duration;
        fileSeconds[ev.detail] = (fileSeconds[ev.detail] || 0) + ev.duration;
        const mapped = subjectMap[ev.detail];
        const subj = mapped ? mapped.subject : "Other";
        subjectSeconds[subj] = (subjectSeconds[subj] || 0) + ev.duration;
      }
      if (ev.type === "session_end" && ev.duration) {
        totalSessionSeconds += ev.duration;
        sessionCount++;
      }
    });

    const barRows = (obj, unit) =>
      Object.keys(obj)
        .sort((a, b) => obj[b] - obj[a])
        .slice(0, 10)
        .map((k) => `<div class="admin__bar-row"><span class="admin__bar-label">${k}</span><span class="admin__bar-value">${Math.round(obj[k] / 60)}${unit}</span></div>`)
        .join("") || `<p class="admin__empty">No PDF views yet</p>`;

    const timeline = recentRows.map((ev) => {
      const t = ev.timestamp ? new Date(ev.timestamp).toLocaleString() : "";
      const extra = ev.duration ? ` · ${Math.round(ev.duration)}s` : "";
      return `<div class="admin__timeline-row">
        <span class="admin__timeline-time">${t}</span>
        <span class="admin__timeline-type">${ev.type}</span>
        <span class="admin__timeline-detail">${ev.detail || ""}${extra}</span>
      </div>`;
    }).join("") || `<p class="admin__empty">No activity yet</p>`;

    adminDetailBody.innerHTML = `
      <div class="admin__detail-summary">
        <div class="admin__detail-stat"><span class="admin__detail-num">${Math.round(totalSessionSeconds / 60)}m</span><span class="admin__detail-label">total on site</span></div>
        <div class="admin__detail-stat"><span class="admin__detail-num">${Math.round(totalViewSeconds / 60)}m</span><span class="admin__detail-label">inside PDFs</span></div>
        <div class="admin__detail-stat"><span class="admin__detail-num">${sessionCount}</span><span class="admin__detail-label">sessions</span></div>
      </div>
      <p class="admin__detail-heading">Time by subject</p>
      <div class="admin__bars">${barRows(subjectSeconds, "m")}</div>
      <p class="admin__detail-heading">Most-viewed files</p>
      <div class="admin__bars">${barRows(fileSeconds, "m")}</div>
      <p class="admin__detail-heading">Recent activity</p>
      <div class="admin__timeline">${timeline}</div>
    `;
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
