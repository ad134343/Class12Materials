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
  const adminApprovalList  = $("#adminApprovalList");
  const adminAddNameInput  = $("#adminAddNameInput");
  const adminAddNameBtn    = $("#adminAddNameBtn");
  const adminRosterSearch  = $("#adminRosterSearch");
  const adminMergeBtn      = $("#adminMergeBtn");
  const adminFlagsList     = $("#adminFlagsList");
  const adminAuditList     = $("#adminAuditList");
  const adminBroadcastBtn  = $("#adminBroadcastBtn");
  const adminExportBtn     = $("#adminExportBtn");
  const adminContentStatsList = $("#adminContentStatsList");

  // ── State ──────────────────────────────────────────────
  let curView     = "home";
  let curSubject  = null;
  let curFolder   = null;
  let currentName = "";
  let adminApiToken = null; // set only after the passphrase gate succeeds — see hashAdminSecret usage above

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

  // ── Abuse/harassment filter ──────────────────────────────
  // Best-effort, not exhaustive — extend these two lists if something
  // gets through. ABUSIVE_WHOLE_WORDS is matched only against whole
  // words (so it won't false-positive on a short substring buried
  // inside a real name); ABUSIVE_PHRASES is matched as a substring of
  // the full normalized string, for multi-word taunts.
  const ABUSIVE_WHOLE_WORDS = [
    "bsdk", "bsdka", "mc", "bc", "chutiya", "chutiye", "harami",
    "kutta", "kutte", "kamina", "kamine", "randi", "gandu", "gaandu",
    "bhosdi", "bhosdike", "saala", "saale",
    "fuck", "fucker", "bitch", "asshole", "bastard", "dumbass"
  ];
  const ABUSIVE_PHRASES = [
    "tera baap", "teri maa", "teri behen"
  ];

  // Deliberately NOT a call to an external moderation API — see the
  // reasoning in chat: that would add a network dependency, a cost,
  // and latency to every single login, legitimate or not, for a name
  // field. This instead defeats the cheap, common evasion tricks
  // (leetspeak, spacing/punctuation, stretched letters) with a plain
  // string transform, which covers the realistic threat model here.
  const LEET_MAP = { "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };
  function squash(str) {
    return normalizeName(str)
      .split("")
      .map((c) => LEET_MAP[c] || c)
      .join("")
      .replace(/[^a-z]/g, "")       // drop spaces/punctuation entirely
      .replace(/(.)\1{2,}/g, "$1"); // "bsdkkkk" -> "bsdk"
  }

  function looksAbusive(name) {
    const norm = normalizeName(name).replace(/[^a-z\s]/g, "");
    if (ABUSIVE_PHRASES.some((p) => norm.includes(p))) return true;
    const words = norm.split(/\s+/).filter(Boolean);
    if (words.some((w) => ABUSIVE_WHOLE_WORDS.includes(w))) return true;

    // Second pass: squash out spacing/leetspeak/letter-stretching and
    // check again. Restricted to words of 4+ letters — squashing
    // removes spaces entirely, and re-checking a 2-letter word like
    // "mc" as a bare substring would false-positive on ordinary names
    // ("Ram Chandra" -> "ramchandra" contains "mc"). Longer words don't
    // have that problem.
    const squashed = squash(name);
    return ABUSIVE_WHOLE_WORDS.filter((w) => w.length >= 4).some((w) => squashed.includes(squash(w)));
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
    if (list.hashes.includes(hash)) return true;
    // Live-approved names — added from the admin dashboard's approval
    // queue or "Add name" box, no redeploy needed. Checked in addition
    // to the static list above, never instead of it.
    const liveHashes = await fetchLiveAccessHashes();
    return liveHashes.includes(hash);
  }

  // Mirrors fetchBlockedDeviceIds below: pulled from the Apps Script
  // backend's "AccessList" sheet, which the admin dashboard writes to
  // directly (approveName). Fails open (empty list) on any network
  // error — same philosophy as the rest of this file, a hiccup here
  // should never lock out someone who's actually approved.
  let cachedLiveAccess = null;
  async function fetchLiveAccessHashes() {
    if (cachedLiveAccess) return cachedLiveAccess;
    const endpoint = SITE_CONFIG.logging && SITE_CONFIG.logging.endpoint;
    if (!endpoint || endpoint.indexOf("PASTE_YOUR") === 0) return [];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`${endpoint}?action=accessList`, { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();
      cachedLiveAccess = (data && data.accessHashes) || [];
    } catch {
      cachedLiveAccess = [];
    }
    return cachedLiveAccess;
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
  // even if it enters someone else's name.
  //
  // The canvas-rendering signal that used to be part of this was
  // REMOVED after testing showed it changing across a fully-closed-
  // and-reopened browser on the exact same phone — which meant a
  // banned device could get a fresh ID just by force-closing the app
  // and relaunching the link. That's not a bug in this code: recent
  // Chrome (and most in-app browsers, WhatsApp's included) now inject
  // small random noise into canvas readback specifically to defeat
  // canvas fingerprinting — it's a deliberate anti-tracking feature,
  // and it resets that noise on a fresh session. There's no reliable
  // way to read a "clean" canvas value around it from JavaScript.
  //
  // What's left below is every OTHER signal — none of them are
  // subject to that noise, so they should now be stable across
  // reopens on the same phone. Trade-off worth knowing: this makes
  // the fingerprint a little less unique between two totally
  // different phones that happen to share the exact same model,
  // browser version, screen size, language, and timezone — an edge
  // case, but not impossible. There's no purely-client-side way to
  // fully close that gap; a hard guarantee would need device
  // attestation from a native app or phone-number verification,
  // neither of which fits a static site like this one.
  let cachedDeviceId = null;
  async function getDeviceId() {
    if (cachedDeviceId) return cachedDeviceId;
    const parts = [
      navigator.userAgent || "",
      navigator.platform || "",
      navigator.language || "",
      String(navigator.hardwareConcurrency || ""),
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      (Intl.DateTimeFormat().resolvedOptions().timeZone || "")
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

    // Live-suspended names — added from the admin dashboard's Suspend
    // button, which also cascades to every linked alias and device.
    // Checked in addition to the static config.js list above.
    if (name) {
      const remoteSuspended = await fetchSuspendedHashes();
      const hash = await hashName(name);
      if (remoteSuspended.includes(hash)) return true;
    }

    if (Array.isArray(s.ips) && s.ips.length) {
      const ip = await getClientIp();
      if (ip && s.ips.includes(ip)) return true;
    }

    return false;
  }

  // Mirrors fetchLiveAccessHashes above, for the Apps Script backend's
  // "SuspendedNames" sheet.
  let cachedLiveSuspended = null;
  async function fetchSuspendedHashes() {
    if (cachedLiveSuspended) return cachedLiveSuspended;
    const endpoint = SITE_CONFIG.logging && SITE_CONFIG.logging.endpoint;
    if (!endpoint || endpoint.indexOf("PASTE_YOUR") === 0) return [];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`${endpoint}?action=suspendedNames`, { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();
      cachedLiveSuspended = (data && data.suspendedHashes) || [];
    } catch {
      cachedLiveSuspended = [];
    }
    return cachedLiveSuspended;
  }

  // ── Concurrent-session lock ───────────────────────────────
  // True if this name (or any alias linked to it from the admin
  // dashboard's merge tool) is already active in another session
  // right now. Fails open (false) on any network error — a hiccup
  // here should never lock out a legitimate solo login.
  async function isNameActive(name) {
    const endpoint = SITE_CONFIG.logging && SITE_CONFIG.logging.endpoint;
    if (!endpoint || endpoint.indexOf("PASTE_YOUR") === 0) return false;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`${endpoint}?action=nameActive&name=${encodeURIComponent(name)}`, { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();
      return !!(data && data.active);
    } catch {
      return false;
    }
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
  //  sessionStorage, not localStorage: localStorage is shared by
  //  every tab/WebView instance for this domain — including a brand
  //  new one Chrome/Safari spins up the next time someone taps the
  //  same WhatsApp link. That's what made a second tap silently
  //  resume the previous person's login instead of asking fresh.
  //  sessionStorage is scoped to that one tab/instance and is wiped
  //  the moment it's actually closed, so a fresh tap always starts
  //  with nothing stored — while still keeping someone logged in
  //  normally while they navigate around inside the same open tab.
  //  Stored as JSON {name, ts} rather than a bare name, so we can
  //  also expire it after SITE_CONFIG.session.expiryMinutes if that
  //  same tab is just left open and idle for a long stretch.
  function saveSession(name) {
    sessionStorage.setItem("c12_name", JSON.stringify({ name, ts: Date.now() }));
  }

  function readSession() {
    const raw = sessionStorage.getItem("c12_name");
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
    sessionStorage.removeItem("c12_name");
  }

  // Shared by the manual "sign out" button and a forced admin logout
  // (see checkCommands below) — same clean-up either way: end any
  // open PDF view, log the session as ended, stop the heartbeat, wipe
  // the saved name, then reload back to the gate.
  function performLogout(reason) {
    endCurrentView();
    if (sessionId) {
      const seconds = sessionStart ? Math.round((Date.now() - sessionStart) / 1000) : "";
      logEventBeacon("session_end", currentName, reason || "logout", undefined, { duration: seconds });
    }
    stopHeartbeat();
    clearSession();
    location.reload();
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
    logoutBtn.addEventListener("click", () => performLogout("logout"));
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
    adminAddNameBtn.addEventListener("click", onAdminAddName);
    adminAddNameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") onAdminAddName(); });
    adminRosterSearch.addEventListener("input", () => renderAdminRoster(true));
    adminMergeBtn.addEventListener("click", onMergeSelected);
    adminBroadcastBtn.addEventListener("click", onBroadcastMessage);
    adminExportBtn.addEventListener("click", onExportCsv);
    adminDetailClose.addEventListener("click", closeAdminDetail);
    adminDetailOverlay.addEventListener("click", closeAdminDetail);

    viewerClose.addEventListener("click", closeViewer);
    viewerOverlay.addEventListener("click", closeViewer);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", syncViewerViewport);
      window.visualViewport.addEventListener("scroll", syncViewerViewport);
    }
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
          // The hash IS the API token from here on — nothing else is
          // needed. This used to be a separate plaintext admin.key
          // sitting in config.js, which is a publicly downloadable
          // file: anyone opening dev tools could read it straight off
          // and call every admin endpoint themselves, no passphrase
          // needed. Reusing candidateHash instead means the only
          // secret that ever exists is the passphrase itself, which
          // never touches any file — exactly the same guarantee the
          // access list and suspended list already rely on.
          adminApiToken = candidateHash;
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

      // Harassment/abuse in the name field itself (e.g. someone typing
      // slurs or taunts instead of a real name) gets the device
      // auto-blocked outright — tagged "abusive" so the backend's
      // doPost treats it exactly like a suspended-name login: the
      // device fingerprint goes straight into BlockedDevices, no
      // admin action needed. This is a best-effort word/phrase list
      // (see ABUSIVE_WHOLE_WORDS/ABUSIVE_PHRASES below), not a
      // guarantee — extend the lists if something gets through, and
      // the manual Suspend button in admin still works independently
      // of this for anything the filter misses.
      if (looksAbusive(name)) {
        logEvent("login", name, "abusive", trace);
        showGateError("You're not authorized to view this page. Please enter your actual name.");
        return;
      }

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

      // One active session per identity at a time — checked after
      // suspended/authorized so a blocked name never reaches this far.
      // A reload or reopened tab by the same person can momentarily
      // trip this until their old session goes stale (~90s) — a known
      // trade-off for now.
      if (await isNameActive(name)) {
        logEvent("login", name, "concurrent_blocked", trace);
        showGateError("This name is already logged in on another device right now. Please wait a minute and try again.");
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
    checkCommands();
  }

  // Heartbeats go out via a no-cors POST (see logEvent above), which
  // means the response body is opaque and unreadable — so an admin
  // message or forced logout can't ride along on that request. This
  // is a separate, plain GET instead (readable, same pattern as
  // adminFetch below) asking "anything waiting for my sessionId?".
  // Not gated behind admin.enabled — every student's browser needs to
  // be able to poll this, admin or not.
  async function checkCommands() {
    const endpoint = SITE_CONFIG.logging && SITE_CONFIG.logging.endpoint;
    if (!endpoint || endpoint.indexOf("PASTE_YOUR") === 0 || !sessionId) return;
    try {
      const url = new URL(endpoint);
      url.searchParams.set("action", "checkCommands");
      url.searchParams.set("sessionId", sessionId);
      const res = await fetch(url.toString());
      const data = await res.json();
      if (!data || !data.ok) return;
      if (data.forceLogout) {
        showAdminNotice(
          "You've been signed out by the admin.",
          () => performLogout("admin_logout")
        );
        return;
      }
      if (data.message) {
        showAdminNotice(data.message);
      }
    } catch {
      // Silent — same fire-and-forget spirit as the rest of logging.
      // A missed poll just means the message/logout arrives on the
      // next heartbeat instead.
    }
  }

  // Minimal popup for an admin-sent message (or the "you've been
  // logged out" notice). Built on demand rather than living in
  // index.html permanently, since it's rare enough not to need its
  // own static markup cluttering the page.
  function showAdminNotice(text, onClose) {
    const existing = $("#adminNotice");
    if (existing) existing.remove();

    const wrap = el("div", "admin-notice");
    wrap.id = "adminNotice";
    wrap.innerHTML = `
      <div class="admin-notice__overlay"></div>
      <div class="admin-notice__panel">
        <p class="admin-notice__text"></p>
        <button type="button" class="admin-notice__btn">OK</button>
      </div>`;
    wrap.querySelector(".admin-notice__text").textContent = text;
    document.body.appendChild(wrap);

    const dismiss = () => {
      wrap.remove();
      if (onClose) onClose();
    };
    wrap.querySelector(".admin-notice__btn").addEventListener("click", dismiss);
    // Deliberately no overlay-click-to-dismiss when it's a forced
    // logout (onClose set) — that one should require an explicit tap
    // to acknowledge, not vanish by an accidental tap outside it.
    if (!onClose) {
      wrap.querySelector(".admin-notice__overlay").addEventListener("click", dismiss);
    }
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
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 3;
  const ZOOM_INCREMENT = 0.25;

  // ── Viewer viewport pinning ──────────────────────────────
  // In-app browsers (WhatsApp's, Chrome Custom Tabs, etc.) animate
  // their own toolbar in and out as you scroll, and some of them
  // don't reliably re-fire layout for a `position: fixed; inset: 0`
  // element when that happens — the toolbar collapses but the page
  // keeps painting as if it were still there, leaving a dead gap the
  // exact height of the vanished toolbar at the very top, above
  // everything including our bar. CSS alone can't detect that; the
  // VisualViewport API can, so we actively re-pin the viewer to it
  // whenever the browser reports its chrome changed.
  function syncViewerViewport() {
    if (!window.visualViewport || viewer.classList.contains("hidden")) return;
    const vv = window.visualViewport;
    viewer.style.top = `${vv.offsetTop}px`;
    viewer.style.height = `${vv.height}px`;
  }

  function openViewer(path, name) {
    endCurrentView(); // in case a different PDF was already open — close out its timer first
    const encoded = encodePath(path);
    viewerName.textContent = name;
    viewer.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    syncViewerViewport();
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

    // The instant cached-thumbnail placeholder that used to render here
    // is gone — it was showing up essentially all-black (a bad/undersized
    // JPEG snapshot from the folder grid) for a moment before the real
    // page swapped in, which is exactly the big dark block everyone kept
    // reporting. Simpler and reliable beats "instant but sometimes
    // broken": it's just the compact loading status below until the
    // real page is ready — nothing that can ever render as a stray
    // dark rectangle again.

    // Real progress bar instead of a plain "Loading…" label — a
    // determinate fill once the file size is known, falling back to
    // an indeterminate sliding animation if the server doesn't report
    // Content-Length. The point is just to keep showing the person
    // something is actively happening so they don't give up and leave.
    const status = el("div", "viewer__status");
    const statusText = el("p", "viewer__status-text", "Loading document…");
    const track = el("div", "viewer__progress-track viewer__progress-track--indeterminate");
    const fill = el("div", "viewer__progress-fill");
    track.appendChild(fill);
    status.append(statusText, track);
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

    // Stamps a faint, repeated, diagonal "name · date" watermark over
    // a rendered PDF canvas. This does NOT stop screenshots or screen
    // recording — nothing client-side can. What it does do is make
    // any leaked page traceable back to whoever viewed it, which is
    // the realistic goal for paid material shared as images.
    function drawWatermark(ctx, canvas) {
      const label = `${currentName || "unknown"} · ${new Date().toLocaleDateString()}`;
      ctx.save();
      ctx.globalAlpha = 0.09;
      ctx.fillStyle = "#000";
      ctx.font = `${Math.round(canvas.width / 22)}px Archivo, sans-serif`;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-Math.PI / 6);
      const stepX = canvas.width * 0.6;
      const stepY = canvas.height * 0.22;
      for (let y = -canvas.height; y < canvas.height; y += stepY) {
        for (let x = -canvas.width; x < canvas.width; x += stepX) {
          ctx.fillText(label, x, y);
        }
      }
      ctx.restore();
    }

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

        const ctx = canvas.getContext("2d");
        return page.render({ canvasContext: ctx, viewport }).promise.then(() => {
          drawWatermark(ctx, canvas);
        });
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

    // renderAllPages wipes every page canvas before redrawing them at
    // the new size — and the instant they're removed, the container's
    // scroll position collapses to 0. Left alone, that meant zooming
    // while reading (say) page 6 always dumped you back on page 1.
    // Capture how far down you were as a fraction of the scrollable
    // height *before* the wipe, then re-apply that same fraction once
    // the new (differently-sized) pages are back in — since every page
    // scales by the same zoom factor, the fraction lands you back on
    // the same page at roughly the same spot within it.
    const maxScrollBefore = viewerPages.scrollHeight - viewerPages.clientHeight;
    const scrollRatio = maxScrollBefore > 0 ? viewerPages.scrollTop / maxScrollBefore : 0;

    renderAllPages(myToken).then(() => {
      if (myToken !== viewerLoadToken) return;
      const maxScrollAfter = viewerPages.scrollHeight - viewerPages.clientHeight;
      viewerPages.scrollTop = maxScrollAfter > 0 ? scrollRatio * maxScrollAfter : 0;
    });
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
    viewer.style.top = "";
    viewer.style.height = "";
    viewerLoadToken++; // invalidate any render still in flight
    currentPdf = null;
    pagesInner = null;
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
    const url = new URL(endpoint);
    url.searchParams.set("action", action);
    url.searchParams.set("key", adminApiToken || "");
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

  let lastRosterPeople = [];
  let selectedForMerge = new Set();

  function refreshAdmin() {
    renderAdminPresence();
    renderApprovalQueue();
    renderAdminRoster();
    renderFlags();
    renderAuditLog();
    renderContentStats();
  }

  async function renderContentStats() {
    const data = await adminFetch("contentStats");
    if (!data) return;
    const stats = (data.stats || []).slice(0, 15);
    adminContentStatsList.innerHTML = "";
    if (!stats.length) {
      adminContentStatsList.innerHTML = `<p class="admin__empty">No views logged yet</p>`;
      return;
    }
    stats.forEach((s) => {
      const mins = Math.round((s.seconds || 0) / 60);
      const row = el("div", "admin__presence-row");
      row.innerHTML = `
        <div class="admin__presence-info">
          <span class="admin__presence-name">${s.file}</span>
          <span class="admin__presence-meta">${s.views} views · ${s.downloads} downloads · ${s.distinctViewers} people · ${mins}m total</span>
        </div>`;
      adminContentStatsList.appendChild(row);
    });
  }

  async function renderApprovalQueue() {
    const data = await adminFetch("unauthorizedQueue");
    const queue = (data && data.queue) || [];
    adminApprovalList.innerHTML = "";

    if (!data) {
      adminApprovalList.innerHTML = `<p class="admin__empty">Couldn't reach the sheet — check the admin key.</p>`;
      return;
    }
    if (!queue.length) {
      adminApprovalList.innerHTML = `<p class="admin__empty">No pending attempts</p>`;
      return;
    }

    queue.forEach((q) => {
      const when = q.lastAttempt ? new Date(q.lastAttempt).toLocaleString() : "";
      const row = el("div", "admin__presence-row");
      row.innerHTML = `
        <div class="admin__presence-info">
          <span class="admin__presence-name">${q.name}</span>
          <span class="admin__presence-meta">${q.count} attempt${q.count === 1 ? "" : "s"} · last ${when}</span>
        </div>
        <div class="admin__presence-actions">
          <button type="button" class="admin__presence-btn" data-action="approve">Approve</button>
        </div>`;
      row.querySelector('[data-action="approve"]').addEventListener("click", async () => {
        await adminFetch("approveName", { name: q.name });
        renderApprovalQueue();
      });
      adminApprovalList.appendChild(row);
    });
  }

  async function onAdminAddName() {
    const name = adminAddNameInput.value.trim();
    if (!name) return;
    await adminFetch("approveName", { name });
    adminAddNameInput.value = "";
    renderApprovalQueue();
  }

  function updateMergeBtn() {
    const n = selectedForMerge.size;
    adminMergeBtn.textContent = `Merge selected (${n})`;
    adminMergeBtn.disabled = n !== 2;
  }

  async function onMergeSelected() {
    if (selectedForMerge.size !== 2) return;
    const [a, b] = Array.from(selectedForMerge);
    const primary = prompt(`Merging "${a}" and "${b}" as one person.\nWhich name should show on the roster? (type it exactly, or leave as-is)`, a);
    if (!primary) return;
    const alias = primary === a ? b : a;
    await adminFetch("mergeIdentities", { primary, alias });
    selectedForMerge.clear();
    updateMergeBtn();
    renderAdminRoster();
  }

  async function onToggleSuspend(name, currentlySuspended) {
    const verb = currentlySuspended ? "unsuspend" : "suspend";
    if (!confirm(`${currentlySuspended ? "Unsuspend" : "Suspend"} "${name}"?${currentlySuspended ? "" : " This also blocks every device and name they've ever used, and signs them out right now if online."}`)) return;
    await adminFetch(currentlySuspended ? "unsuspendIdentity" : "suspendIdentity", { name });
    renderAdminRoster();
  }

  async function onSetExpiry(name, currentExpiresAt) {
    const current = currentExpiresAt ? new Date(currentExpiresAt).toISOString().slice(0, 10) : "";
    const input = prompt(`Access expiry date for "${name}" (YYYY-MM-DD). Leave blank to remove expiry.`, current);
    if (input === null) return; // cancelled
    await adminFetch("setExpiry", { name, date: input.trim() });
    renderAdminRoster();
  }

  async function renderFlags() {
    const data = await adminFetch("flags");
    if (!data) {
      adminFlagsList.innerHTML = `<p class="admin__empty">Couldn't reach the sheet — check the admin key.</p>`;
      return;
    }
    const { deviceCycling = [], rapidRepeat = [], bulkView = [] } = data.flags || {};
    adminFlagsList.innerHTML = "";

    const items = [
      ...deviceCycling.map((f) => ({
        label: `One device used ${f.names.length} different names: ${f.names.join(", ")}`,
        when: f.when
      })),
      ...rapidRepeat.map((f) => ({
        label: `"${f.name}" attempted login ${f.count} times, 5+ within a minute`,
        when: f.when
      })),
      ...bulkView.map((f) => ({
        label: `${f.name} opened/downloaded ${f.count} files, 8+ within 5 minutes`,
        when: f.when
      }))
    ].sort((a, b) => new Date(b.when) - new Date(a.when));

    if (!items.length) {
      adminFlagsList.innerHTML = `<p class="admin__empty">Nothing flagged</p>`;
      return;
    }

    items.forEach((f) => {
      const row = el("div", "admin__presence-row");
      row.innerHTML = `
        <div class="admin__presence-info">
          <span class="admin__presence-name">${f.label}</span>
          <span class="admin__presence-meta">${new Date(f.when).toLocaleString()}</span>
        </div>`;
      adminFlagsList.appendChild(row);
    });
  }

  async function onBroadcastMessage() {
    const message = prompt("Message to send to everyone online right now:");
    if (!message || !message.trim()) return;
    const data = await adminFetch("presenceLive");
    const online = (data && data.online) || [];
    await Promise.all(online.map((p) => adminFetch("sendMessage", { sessionId: p.sessionId, message: message.trim() })));
    alert(`Sent to ${online.length} online session${online.length === 1 ? "" : "s"}.`);
  }

  async function renderAuditLog() {
    const data = await adminFetch("adminActionLog");
    if (!data) return;
    const log = data.log || [];
    adminAuditList.innerHTML = "";
    if (!log.length) {
      adminAuditList.innerHTML = `<p class="admin__empty">No admin actions yet</p>`;
      return;
    }
    log.slice(0, 30).forEach((entry) => {
      const row = el("div", "admin__presence-row");
      row.innerHTML = `
        <div class="admin__presence-info">
          <span class="admin__presence-name">${entry.action}${entry.detail ? " — " + entry.detail : ""}</span>
          <span class="admin__presence-meta">${new Date(entry.timestamp).toLocaleString()}</span>
        </div>`;
      adminAuditList.appendChild(row);
    });
  }

  function onExportCsv() {
    if (!lastRosterPeople.length) return;
    const headers = ["Name", "Aliases", "Suspended", "ExpiresAt", "LastSeen", "SessionCount", "TotalSessionMinutes", "TotalViewMinutes", "LoginCount", "UnauthorizedCount"];
    const rows = lastRosterPeople.map((p) => [
      p.name,
      (p.aliases || []).join("; "),
      p.suspended ? "yes" : "no",
      p.expiresAt ? new Date(p.expiresAt).toISOString().slice(0, 10) : "",
      p.lastSeen ? new Date(p.lastSeen).toISOString() : "",
      p.sessionCount,
      Math.round((p.totalSessionSeconds || 0) / 60),
      Math.round((p.totalViewSeconds || 0) / 60),
      p.loginCount,
      p.unauthorizedCount
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `roster-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
        </div>
        <div class="admin__presence-actions">
          <button type="button" class="admin__presence-btn" data-action="message">Message</button>
          <button type="button" class="admin__presence-btn admin__presence-btn--danger" data-action="logout">Log out</button>
        </div>`;
      row.addEventListener("click", () => openAdminDetail(person.name));
      row.querySelector('[data-action="message"]').addEventListener("click", (e) => {
        e.stopPropagation();
        sendAdminMessage(person.sessionId, person.name);
      });
      row.querySelector('[data-action="logout"]').addEventListener("click", (e) => {
        e.stopPropagation();
        forceLogoutUser(person.sessionId, person.name);
      });
      adminPresenceList.appendChild(row);
    });
  }

  async function sendAdminMessage(sessionId, name) {
    const message = prompt(`Message to send ${name} (pops up on their screen within ~45s):`);
    if (!message) return;
    await adminFetch("sendMessage", { sessionId, message });
  }

  async function forceLogoutUser(sessionId, name) {
    if (!confirm(`Sign ${name} out now? They'll see a notice and be returned to the login screen.`)) return;
    await adminFetch("forceLogout", { sessionId });
  }

  async function renderAdminRoster(skipFetch) {
    if (!skipFetch) {
      adminRosterList.innerHTML = `<p class="admin__loading">Loading…</p>`;
      const data = await adminFetch("adminSummary");
      if (!data) {
        adminRosterList.innerHTML = `<p class="admin__empty">Couldn't reach the sheet — check the admin key.</p>`;
        return;
      }
      lastRosterPeople = data.people || [];
    }

    const query = adminRosterSearch.value.trim().toLowerCase();
    const people = query
      ? lastRosterPeople.filter((p) => {
          const haystack = [p.name, ...(p.aliases || [])].join(" ").toLowerCase();
          return haystack.includes(query);
        })
      : lastRosterPeople;

    adminRosterList.innerHTML = "";

    if (!lastRosterPeople.length) {
      adminRosterList.innerHTML = `<p class="admin__empty">No activity logged yet</p>`;
      return;
    }
    if (!people.length) {
      adminRosterList.innerHTML = `<p class="admin__empty">No one matches "${query}"</p>`;
      return;
    }

    people.forEach((p) => {
      const row = el("div", "admin__roster-row");
      row.tabIndex = 0;
      const lastSeen = p.lastSeen ? new Date(p.lastSeen).toLocaleString() : "—";
      const totalMins = Math.round((p.totalSessionSeconds || 0) / 60);
      const akaText = p.aliases && p.aliases.length ? ` <span class="admin__roster-aka">aka ${p.aliases.join(", ")}</span>` : "";
      row.innerHTML = `
        <input type="checkbox" class="admin__roster-checkbox" ${selectedForMerge.has(p.name) ? "checked" : ""}>
        <div class="admin__roster-name">${p.name}${akaText}${p.suspended ? ' <span class="admin__roster-badge">suspended</span>' : ""}</div>
        <div class="admin__roster-stat">${totalMins}m total</div>
        <div class="admin__roster-stat">${p.sessionCount} session${p.sessionCount === 1 ? "" : "s"}</div>
        <div class="admin__roster-stat">${p.filesTouched}/${p.totalKnownFiles} files</div>
        <div class="admin__roster-stat admin__roster-lastseen">Last seen ${lastSeen}</div>
        <button type="button" class="admin__presence-btn admin__presence-btn--danger" data-action="suspend">${p.suspended ? "Unsuspend" : "Suspend"}</button>
        <button type="button" class="admin__presence-btn" data-action="expiry">${p.expiresAt ? "Expires " + new Date(p.expiresAt).toLocaleDateString() : "Set expiry"}</button>`;

      row.addEventListener("click", () => openAdminDetail(p.name));
      row.addEventListener("keydown", (e) => { if (e.key === "Enter") openAdminDetail(p.name); });

      row.querySelector(".admin__roster-checkbox").addEventListener("click", (e) => {
        e.stopPropagation();
        if (e.target.checked) selectedForMerge.add(p.name);
        else selectedForMerge.delete(p.name);
        updateMergeBtn();
      });
      row.querySelector('[data-action="suspend"]').addEventListener("click", (e) => {
        e.stopPropagation();
        onToggleSuspend(p.name, !!p.suspended);
      });
      row.querySelector('[data-action="expiry"]').addEventListener("click", (e) => {
        e.stopPropagation();
        onSetExpiry(p.name, p.expiresAt);
      });

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
    renderAdminDetail(data.events || [], data.totals || {});
  }

  function closeAdminDetail() {
    adminDetail.classList.add("hidden");
  }

  function renderAdminDetail(events, totals) {
    const subjectMap = getFileSubjectMap();
    const subjectSeconds = {};
    const fileSeconds = {};
    const recentRows = events.slice(0, 40);

    // Bars below still need to be built from view_end events (they
    // break time down per-file/subject, which the backend doesn't
    // pre-aggregate). The top summary numbers, though, come straight
    // from `totals` — computed backend-side the same way the roster
    // computes them, including an estimate for a session/view that's
    // still in progress right now. Recomputing them here from only
    // "_end" events (the old approach) is exactly why this panel used
    // to show 0m/0/0 for someone currently online.
    const totalViewSeconds = totals.totalViewSeconds || 0;
    const totalSessionSeconds = totals.totalSessionSeconds || 0;
    const sessionCount = totals.sessionCount || 0;

    events.forEach((ev) => {
      if (ev.type === "view_end" && ev.duration) {
        fileSeconds[ev.detail] = (fileSeconds[ev.detail] || 0) + ev.duration;
        const mapped = subjectMap[ev.detail];
        const subj = mapped ? mapped.subject : "Other";
        subjectSeconds[subj] = (subjectSeconds[subj] || 0) + ev.duration;
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
