var GSync = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/bible-tracker/gsync.js
  var gsync_exports = {};
  __export(gsync_exports, {
    BACKUP_KEEP: () => BACKUP_KEEP,
    BACKUP_PREFIX: () => BACKUP_PREFIX,
    DATA_FILE: () => DATA_FILE,
    FOOTPRINTS_SCHEMA: () => FOOTPRINTS_SCHEMA,
    MYTECHO_SCHEMA: () => MYTECHO_SCHEMA,
    PHOTO_PREFIX: () => PHOTO_PREFIX,
    SCOPE: () => SCOPE,
    SYNC_FOLDER: () => SYNC_FOLDER,
    SyncError: () => SyncError,
    contentHash: () => contentHash,
    createDrive: () => createDrive,
    createGisAuth: () => createGisAuth,
    createGoogleSync: () => createGoogleSync,
    createKV: () => createKV,
    hashOf: () => hashOf,
    mergeKeyed: () => mergeKeyed,
    mergeSnapshots: () => mergeSnapshots,
    mergeValue: () => mergeValue,
    setHash: () => setHash,
    stable: () => stable
  });
  var SYNC_FOLDER = "Footprints-Sync";
  var DATA_FILE = "footprints-sync.json";
  var PHOTO_PREFIX = "photo_";
  var BACKUP_PREFIX = "Footprints-backup-";
  var BACKUP_KEEP = 7;
  var SCOPE = "https://www.googleapis.com/auth/drive.file";
  var FORMAT = 1;
  var TOMB_KEEP_MS = 180 * 24 * 3600 * 1e3;
  var TOMB_MAX = 3e3;
  var ORPHAN_GRACE_MS = 30 * 24 * 3600 * 1e3;
  function stable(v) {
    if (v === null || v === void 0) return "null";
    if (typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    const keys = Object.keys(v).filter((k) => v[k] !== void 0).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  }
  function cyrb53(str) {
    let h1 = 3735928559, h2 = 1103547991;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
    h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  var hashOf = (v) => cyrb53(stable(v));
  var setHash = (arr) => cyrb53((arr || []).map(hashOf).sort().join("|"));
  var stampOf = (x) => {
    if (!x || typeof x !== "object") return "";
    let m = "";
    for (const k of ["createdAt", "updatedAt", "checkedAt"]) {
      const v = x[k];
      if (typeof v === "string" && v > m) m = v;
    }
    return m;
  };
  var stampMs = (x) => {
    const t = Date.parse(stampOf(x));
    return Number.isFinite(t) ? t : 0;
  };
  function mergeKeyed({ local, remote, base, baseAt, tombs, getId, now }) {
    const L = /* @__PURE__ */ new Map();
    const R = /* @__PURE__ */ new Map();
    for (const it of local || []) {
      const id = getId(it);
      if (id !== void 0 && id !== null && id !== "" && !L.has(id)) L.set(id, it);
    }
    for (const it of remote || []) {
      const id = getId(it);
      if (id !== void 0 && id !== null && id !== "" && !R.has(id)) R.set(id, it);
    }
    const B = base || {};
    const T = { ...tombs || {} };
    for (const id of Object.keys(B)) if (!L.has(id)) T[id] = { h: B[id], t: now, since: baseAt || now };
    const order = [...L.keys(), ...[...R.keys()].filter((k) => !L.has(k))];
    const items = [];
    for (const id of order) {
      const l = L.get(id);
      const r = R.get(id);
      let pick;
      if (l !== void 0 && r !== void 0) {
        const hl = hashOf(l);
        const hr = hashOf(r);
        if (hl === hr) pick = l;
        else if (hr === B[id]) pick = l;
        else if (hl === B[id]) pick = r;
        else pick = stampOf(r) > stampOf(l) ? r : l;
      } else {
        pick = l !== void 0 ? l : r;
      }
      const tomb = T[id];
      if (tomb) {
        const same = tomb.h === hashOf(pick);
        const untouched = typeof tomb.since === "number" && stampMs(pick) > 0 && stampMs(pick) <= tomb.since;
        if (same || untouched) continue;
        delete T[id];
      }
      items.push(pick);
    }
    const newBase = {};
    for (const it of items) newBase[getId(it)] = hashOf(it);
    let entries = Object.entries(T).filter(([, v]) => v && now - v.t < TOMB_KEEP_MS);
    if (entries.length > TOMB_MAX) entries = entries.sort((a, b) => b[1].t - a[1].t).slice(0, TOMB_MAX);
    return { items, base: newBase, tombs: Object.fromEntries(entries) };
  }
  function mergeValue({ local, remote, remoteExists, baseHash, hasBase }) {
    const l = local === void 0 ? null : local;
    if (!remoteExists) return { value: l, hash: hashOf(l) };
    const r = remote === void 0 ? null : remote;
    const hl = hashOf(l);
    const hr = hashOf(r);
    if (hl === hr) return { value: l, hash: hl };
    if (!hasBase) return { value: r, hash: hr };
    if (hr === baseHash) return { value: l, hash: hl };
    if (hl === baseHash) return { value: r, hash: hr };
    return { value: l, hash: hl };
  }
  var byId = (x) => x && x.id || null;
  var byName = (x) => typeof x === "string" && x ? x : null;
  var FOOTPRINTS_SCHEMA = {
    collections: [
      { key: "records", get: (s) => s.records, id: byId },
      { key: "folders", get: (s) => s.folders, id: byId },
      { key: "artworks", get: (s) => s.artworks, id: byId },
      { key: "tags", get: (s) => s.tags, id: byName },
      { key: "harvests", get: (s) => (s.garden || {}).harvests, id: (x) => x && (x.id || (x.date && x.fruit ? x.date + "|" + x.fruit : null)) || null }
    ],
    values: [
      { key: "prefs", get: (s) => s.prefs },
      { key: "captions", get: (s) => s.captions },
      { key: "typeDesc", get: (s) => s.typeDesc },
      { key: "headerBg", get: (s) => s.headerBg },
      { key: "cycle", get: (s) => (s.garden || {}).cycle }
    ],
    build: (c, v) => ({
      records: c.records,
      folders: c.folders,
      artworks: c.artworks,
      tags: c.tags,
      garden: { cycle: v.cycle, harvests: c.harvests },
      prefs: v.prefs,
      captions: v.captions,
      typeDesc: v.typeDesc,
      headerBg: v.headerBg
    })
  };
  var MYTECHO_SCHEMA = {
    collections: [
      { key: "records", get: (s) => s.records, id: byId },
      { key: "plans", get: (s) => s.plans, id: byId },
      { key: "kinds", get: (s) => s.kinds, id: byId },
      { key: "folders", get: (s) => s.folders, id: byId },
      { key: "tags", get: (s) => s.tags, id: byName }
    ],
    values: [{ key: "prefs", get: (s) => s.prefs }],
    build: (c, v) => ({ records: c.records, plans: c.plans, kinds: c.kinds, folders: c.folders, tags: c.tags, prefs: v.prefs })
  };
  function contentHash(s, schema) {
    const sc = schema || FOOTPRINTS_SCHEMA;
    const x = s || {};
    return cyrb53([
      ...sc.collections.map((c) => setHash(c.get(x))),
      ...sc.values.map((v) => hashOf(v.get(x)))
    ].join("/"));
  }
  var tombsHash = (sc, t) => hashOf(Object.fromEntries(sc.collections.map((c) => [c.key, Object.keys(t && t[c.key] || {}).sort()])));
  function unionTombs(sc, a, b) {
    const out = {};
    for (const c of sc.collections) {
      const m = { ...a && a[c.key] || {} };
      const o = b && b[c.key] || {};
      for (const id of Object.keys(o)) if (!m[id] || o[id] && o[id].t > m[id].t) m[id] = o[id];
      out[c.key] = m;
    }
    return out;
  }
  function mergeSnapshots(local, remote, ctx) {
    const sc = ctx.schema || FOOTPRINTS_SCHEMA;
    const now = ctx.now;
    const baseAll = ctx.base || {};
    const tombsAll = unionTombs(sc, ctx.tombs, remote && remote.tombs);
    const cols = {};
    const newBase = { values: {} };
    const newTombs = {};
    for (const c of sc.collections) {
      const m = mergeKeyed({
        local: c.get(local) || [],
        remote: remote && c.get(remote) || [],
        base: baseAll[c.key] || {},
        baseAt: ctx.baseAt,
        tombs: tombsAll[c.key] || {},
        getId: c.id,
        now
      });
      cols[c.key] = m.items;
      newBase[c.key] = m.base;
      newTombs[c.key] = m.tombs;
    }
    const vals = {};
    for (const v of sc.values) {
      const rv = remote ? v.get(remote) : void 0;
      const r = mergeValue({
        local: v.get(local),
        remote: rv,
        remoteExists: !!remote && rv !== void 0,
        baseHash: (baseAll.values || {})[v.key],
        hasBase: !!ctx.hasBase
      });
      vals[v.key] = r.value;
      newBase.values[v.key] = r.hash;
    }
    const merged = sc.build(cols, vals);
    const mh = contentHash(merged, sc);
    return {
      merged,
      base: newBase,
      tombs: newTombs,
      localChanged: mh !== contentHash(local, sc),
      remoteChanged: !remote || mh !== contentHash(remote, sc) || tombsHash(sc, newTombs) !== tombsHash(sc, remote.tombs)
    };
  }
  var SyncError = class extends Error {
    constructor(kind, message) {
      super(message);
      this.kind = kind;
    }
  };
  var API = "https://www.googleapis.com/drive/v3";
  var UPLOAD = "https://www.googleapis.com/upload/drive/v3";
  var qs = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  function createDrive(fetchFn, getToken) {
    async function call(url, init) {
      let res;
      try {
        res = await fetchFn(url, { ...init || {}, headers: { ...init && init.headers || {}, Authorization: "Bearer " + getToken() } });
      } catch (e) {
        throw new SyncError("network", "\u901A\u4FE1\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F");
      }
      if (res.ok) return res;
      let reason = "";
      try {
        const j = await res.clone().json();
        reason = j && j.error && (j.error.errors && j.error.errors[0] && j.error.errors[0].reason || j.error.status) || "";
      } catch (e) {
      }
      if (res.status === 401) throw new SyncError("auth", "\u30ED\u30B0\u30A4\u30F3\u306E\u671F\u9650\u304C\u5207\u308C\u307E\u3057\u305F");
      if (res.status === 404) throw new SyncError("notfound", "\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F");
      if (res.status === 403) {
        if (/rate|quota/i.test(reason)) throw new SyncError("rate", "\u6DF7\u96D1\u4E2D\u3067\u3059\u3002\u3057\u3070\u3089\u304F\u5F85\u3063\u3066\u304F\u3060\u3055\u3044");
        if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason)) throw new SyncError("config", "Drive API \u304C\u6709\u52B9\u306B\u306A\u3063\u3066\u3044\u307E\u305B\u3093");
        throw new SyncError("auth", "\u30C9\u30E9\u30A4\u30D6\u3078\u306E\u30A2\u30AF\u30BB\u30B9\u304C\u8A31\u53EF\u3055\u308C\u3066\u3044\u307E\u305B\u3093");
      }
      if (res.status === 429) throw new SyncError("rate", "\u6DF7\u96D1\u4E2D\u3067\u3059\u3002\u3057\u3070\u3089\u304F\u5F85\u3063\u3066\u304F\u3060\u3055\u3044");
      throw new SyncError("drive", "Google\u30C9\u30E9\u30A4\u30D6\u3067\u30A8\u30E9\u30FC\u304C\u8D77\u304D\u307E\u3057\u305F\uFF08" + res.status + "\uFF09");
    }
    const json = async (url, init) => (await call(url, init)).json();
    return {
      async about() {
        const j = await json(API + "/about?fields=user(emailAddress,displayName)");
        return j && j.user || {};
      },
      async findFolder(name) {
        const q = "mimeType='application/vnd.google-apps.folder' and name='" + qs(name) + "' and trashed=false";
        const j = await json(API + "/files?q=" + encodeURIComponent(q) + "&orderBy=createdTime&pageSize=10&fields=files(id,name)");
        return j.files && j.files[0] || null;
      },
      async createFolder(name) {
        return json(API + "/files?fields=id,name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" })
        });
      },
      async folderAlive(id) {
        try {
          const j = await json(API + "/files/" + encodeURIComponent(id) + "?fields=id,trashed");
          return !!j && !j.trashed;
        } catch (e) {
          if (e instanceof SyncError && e.kind === "notfound") return false;
          throw e;
        }
      },
      async list(folderId) {
        const files = [];
        let pageToken = "";
        do {
          const q = "'" + qs(folderId) + "' in parents and trashed=false";
          const j = await json(API + "/files?q=" + encodeURIComponent(q) + "&pageSize=1000&fields=nextPageToken,files(id,name,modifiedTime,createdTime)" + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : ""));
          files.push(...j.files || []);
          pageToken = j.nextPageToken || "";
        } while (pageToken);
        return files;
      },
      async download(id) {
        return (await call(API + "/files/" + encodeURIComponent(id) + "?alt=media")).text();
      },
      async upload(name, text, mime, parentId, existingId) {
        const b = "ftb" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        const meta = existingId ? { name } : { name, parents: [parentId] };
        const body = "--" + b + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) + "\r\n--" + b + "\r\nContent-Type: " + mime + "; charset=UTF-8\r\n\r\n" + text + "\r\n--" + b + "--";
        const url = (existingId ? UPLOAD + "/files/" + encodeURIComponent(existingId) : UPLOAD + "/files") + "?uploadType=multipart&fields=id,modifiedTime";
        return json(url, { method: existingId ? "PATCH" : "POST", headers: { "Content-Type": "multipart/related; boundary=" + b }, body });
      },
      async remove(id) {
        await call(API + "/files/" + encodeURIComponent(id), { method: "DELETE" });
      }
    };
  }
  function createGisAuth({ getClientId, ls, doc, win, tokenKey }) {
    const TOKEN_KEY = tokenKey || "ft-gsync-token";
    let client = null;
    let clientFor = "";
    let pending = null;
    let scriptP = null;
    const gis = () => win && win.google && win.google.accounts && win.google.accounts.oauth2 || null;
    const readTok = () => {
      try {
        return JSON.parse(ls.getItem(TOKEN_KEY) || "null");
      } catch (e) {
        return null;
      }
    };
    return {
      getStored() {
        const t = readTok();
        return t && t.t && t.exp - 6e4 > Date.now() ? t.t : null;
      },
      clear() {
        try {
          ls.removeItem(TOKEN_KEY);
        } catch (e) {
        }
      },
      isReady: () => !!gis(),
      /* 読み込んでおく。**ログインの操作より前に済ませること**
         （指の操作の流れの中でしかポップアップは開けず、読み込みを待つとその流れが切れる） */
      preload() {
        if (gis()) return Promise.resolve(true);
        if (scriptP) return scriptP;
        scriptP = new Promise((resolve) => {
          try {
            const s = doc.createElement("script");
            s.src = "https://accounts.google.com/gsi/client";
            s.async = true;
            s.onload = () => resolve(!!gis());
            s.onerror = () => {
              scriptP = null;
              resolve(false);
            };
            doc.head.appendChild(s);
          } catch (e) {
            scriptP = null;
            resolve(false);
          }
        });
        return scriptP;
      },
      /* interactive：指の操作の中から呼ぶとき true。返り値はトークン。取れなければ null と理由 */
      request({ interactive, hint }) {
        const g = gis();
        const clientId = getClientId();
        if (!g || !clientId) return Promise.resolve({ token: null, why: !clientId ? "noclient" : "notready" });
        if (pending) return pending.promise;
        if (!client || clientFor !== clientId) {
          clientFor = clientId;
          client = g.initTokenClient({
            client_id: clientId,
            scope: SCOPE,
            callback: (resp) => {
              const p = pending;
              if (!p) return;
              if (!resp || resp.error || !resp.access_token) {
                p.done({ token: null, why: resp && resp.error || "denied" });
                return;
              }
              if (g.hasGrantedAllScopes && !g.hasGrantedAllScopes(resp, SCOPE)) {
                p.done({ token: null, why: "scope" });
                return;
              }
              const exp = Date.now() + (Number(resp.expires_in) || 3600) * 1e3;
              try {
                ls.setItem(TOKEN_KEY, JSON.stringify({ t: resp.access_token, exp }));
              } catch (e) {
              }
              p.done({ token: resp.access_token, why: "" });
            },
            error_callback: (err) => {
              const p = pending;
              if (p) p.done({ token: null, why: err && err.type || "popup" });
            }
          });
        }
        let done;
        const promise = new Promise((resolve) => {
          done = (r) => {
            clearTimeout(timer);
            pending = null;
            resolve(r);
          };
        });
        const timer = setTimeout(() => {
          if (pending) pending.done({ token: null, why: "timeout" });
        }, 12e4);
        pending = { promise, done };
        try {
          const opt = { prompt: interactive ? "" : "none" };
          if (hint) opt.login_hint = hint;
          client.requestAccessToken(opt);
        } catch (e) {
          pending.done({ token: null, why: "popup" });
        }
        return promise;
      },
      revoke(token) {
        try {
          const g = gis();
          if (g && token) g.revoke(token, () => {
          });
        } catch (e) {
        }
      }
    };
  }
  var STATE_KEY = "state";
  var AUTO_MIN_GAP_MS = 2e4;
  var DEBOUNCE_MS = 6e3;
  var PERIOD_MS = 5 * 60 * 1e3;
  function createGoogleSync(opts) {
    const PREFIX = opts.storagePrefix || "ft-gsync";
    const CFG_KEY = PREFIX + "-cfg";
    const now = opts.now || (() => Date.now());
    const ls = opts.ls;
    const fetchFn = opts.fetch;
    const listeners = /* @__PURE__ */ new Set();
    const dayStr = (t) => {
      const d = new Date(t);
      const p = (n) => String(n).padStart(2, "0");
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
    };
    let cfg = { enabled: false, clientId: "", email: "", folderId: "", autoBackup: true, lastBackupDay: "", lastSyncAt: 0 };
    try {
      Object.assign(cfg, JSON.parse(ls.getItem(CFG_KEY) || "{}"));
    } catch (e) {
    }
    const saveCfg = () => {
      try {
        ls.setItem(CFG_KEY, JSON.stringify(cfg));
      } catch (e) {
      }
    };
    const schema = opts.schema || FOOTPRINTS_SCHEMA;
    const NAMES = { folder: SYNC_FOLDER, data: DATA_FILE, backup: BACKUP_PREFIX, ...opts.names || {} };
    const clientId = () => cfg.clientId || opts.defaultClientId || "";
    const auth = opts.auth || createGisAuth({ getClientId: clientId, ls, doc: opts.doc, win: opts.win, tokenKey: PREFIX + "-token" });
    let status = { phase: cfg.enabled ? "idle" : "off", message: "" };
    const setStatus = (patch) => {
      status = { ...status, ...patch };
      listeners.forEach((fn) => {
        try {
          fn();
        } catch (e) {
        }
      });
    };
    const publicStatus = () => ({
      ...status,
      enabled: cfg.enabled,
      email: cfg.email,
      lastSyncAt: cfg.lastSyncAt,
      autoBackup: cfg.autoBackup,
      lastBackupDay: cfg.lastBackupDay,
      clientId: cfg.clientId,
      hasClientId: !!clientId(),
      clientIdFixed: !!opts.defaultClientId && !cfg.clientId,
      ready: auth.isReady ? auth.isReady() : true
    });
    let statusCache = null;
    let running = null;
    let queued = false;
    let timer = null;
    let periodic = null;
    let lastAuto = 0;
    let folderVerified = false;
    let tapArmed = false;
    let started = false;
    async function loadState() {
      try {
        return await opts.kv.get(STATE_KEY) || {};
      } catch (e) {
        return {};
      }
    }
    async function saveState(s) {
      try {
        await opts.kv.set(STATE_KEY, s);
      } catch (e) {
      }
    }
    async function ensureFolder(drive) {
      if (cfg.folderId && folderVerified) return cfg.folderId;
      if (cfg.folderId) {
        if (await drive.folderAlive(cfg.folderId)) {
          folderVerified = true;
          return cfg.folderId;
        }
        cfg.folderId = "";
      }
      const found = await drive.findFolder(NAMES.folder);
      const f = found || await drive.createFolder(NAMES.folder);
      cfg.folderId = f.id;
      folderVerified = true;
      saveCfg();
      return f.id;
    }
    const photoIdOfName = (n) => n.startsWith(PHOTO_PREFIX) && n.endsWith(".txt") ? n.slice(PHOTO_PREFIX.length, -4) : null;
    function parseRemote(text) {
      let d;
      try {
        d = JSON.parse(text);
      } catch (e) {
        throw new SyncError("drive", "\u540C\u671F\u30C7\u30FC\u30BF\u3092\u8AAD\u3081\u307E\u305B\u3093\u3002\u4E0A\u66F8\u304D\u306F\u3057\u307E\u305B\u3093");
      }
      if (!d || typeof d !== "object" || d.format !== FORMAT || !Array.isArray(schema.collections[0].get(d))) {
        throw new SyncError("drive", "\u540C\u671F\u30C7\u30FC\u30BF\u306E\u5F62\u5F0F\u304C\u65B0\u3057\u3059\u304E\u307E\u3059\u3002\u30A2\u30D7\u30EA\u3092\u66F4\u65B0\u3057\u3066\u304F\u3060\u3055\u3044");
      }
      return d;
    }
    async function cycle(drive, token) {
      const folderId = await ensureFolder(drive);
      const files = await drive.list(folderId);
      const dataFiles = files.filter((f) => f.name === NAMES.data).sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)));
      const dataFile = dataFiles[0] || null;
      const st = await loadState();
      const local0 = await opts.getSnapshot();
      const localHash = contentHash(local0, schema);
      const hasBase = !!st.base;
      if (dataFile && hasBase && st.lastRemoteModified === dataFile.modifiedTime && st.lastLocalHash === localHash) {
        await maybeBackup(drive, folderId, files, local0);
        return true;
      }
      let remote = null;
      if (dataFile) remote = parseRemote(await drive.download(dataFile.id));
      const res = mergeSnapshots(local0, remote, { schema, base: st.base, baseAt: st.baseAt, hasBase, tombs: st.tombs, now: now() });
      const refs = Array.from(new Set(opts.listPhotoRefs(res.merged)));
      const onDrive = /* @__PURE__ */ new Map();
      for (const f of files) {
        const id = photoIdOfName(f.name);
        if (id) onDrive.set(id, f);
      }
      for (const id of refs) {
        if (await opts.photoHas(id)) continue;
        const f = onDrive.get(id);
        if (!f) continue;
        const data = await drive.download(f.id);
        if (data) await opts.photoPut(id, data);
      }
      if (res.localChanged) {
        const again = await opts.getSnapshot();
        if (contentHash(again, schema) !== localHash) return false;
        await opts.applySnapshot(res.merged);
      }
      for (const id of refs) {
        if (onDrive.has(id)) continue;
        const data = await opts.photoGet(id);
        if (typeof data === "string" && data) {
          const up = await drive.upload(PHOTO_PREFIX + id + ".txt", data, "text/plain", folderId);
          onDrive.set(id, { id: up.id, name: PHOTO_PREFIX + id + ".txt", modifiedTime: up.modifiedTime });
        }
      }
      let modified = dataFile ? dataFile.modifiedTime : "";
      if (res.remoteChanged || !dataFile) {
        const payload = { app: "bible-tracker-sync", format: FORMAT, updatedAt: new Date(now()).toISOString(), ...res.merged, tombs: res.tombs };
        const up = await drive.upload(NAMES.data, JSON.stringify(payload), "application/json", folderId, dataFile ? dataFile.id : void 0);
        modified = up.modifiedTime;
        for (const extra of dataFiles.slice(1)) {
          try {
            await drive.remove(extra.id);
          } catch (e) {
          }
        }
      }
      await saveState({ base: res.base, tombs: res.tombs, lastRemoteModified: modified, lastLocalHash: contentHash(res.merged, schema), baseAt: now() });
      await cleanOrphans(drive, files, refs, res.merged);
      await maybeBackup(drive, folderId, files, res.merged);
      return true;
    }
    async function cleanOrphans(drive, files, refs, merged) {
      try {
        if (!merged.records.length) return;
        const used = new Set(refs);
        const photoFiles = files.filter((f) => photoIdOfName(f.name));
        const stale = photoFiles.filter((f) => !used.has(photoIdOfName(f.name)) && now() - Date.parse(f.modifiedTime || f.createdTime || 0) > ORPHAN_GRACE_MS);
        if (!stale.length || stale.length * 2 > photoFiles.length) return;
        for (const f of stale.slice(0, 50)) await drive.remove(f.id);
      } catch (e) {
      }
    }
    async function maybeBackup(drive, folderId, files, merged) {
      if (!cfg.autoBackup || !opts.buildBackupText) return;
      const today = dayStr(now());
      if (cfg.lastBackupDay === today) return;
      try {
        const text = await opts.buildBackupText();
        if (!text) return;
        const name = NAMES.backup + today + (NAMES.backupExt || ".txt");
        const same = files.find((f) => f.name === name);
        await drive.upload(name, text, "text/plain", folderId, same ? same.id : void 0);
        const names = files.filter((f) => f.name.startsWith(NAMES.backup) && f.name !== name).sort((a, b) => b.name.localeCompare(a.name));
        for (const old of names.slice(BACKUP_KEEP - 1)) {
          try {
            await drive.remove(old.id);
          } catch (e) {
          }
        }
        cfg.lastBackupDay = today;
        saveCfg();
        if (opts.onBackedUp) opts.onBackedUp();
      } catch (e) {
        if (e instanceof SyncError && (e.kind === "auth" || e.kind === "network")) throw e;
      }
    }
    let tapHandler = null;
    function disarmTap() {
      if (tapHandler && opts.doc) opts.doc.removeEventListener("pointerup", tapHandler, true);
      tapHandler = null;
      tapArmed = false;
    }
    function armTap() {
      if (tapArmed || !opts.doc || !cfg.enabled || !cfg.email) return;
      tapArmed = true;
      tapHandler = (ev) => {
        const t = ev && ev.target;
        if (t && t.closest && t.closest("[data-gsync-card]")) return;
        disarmTap();
        if (!cfg.enabled || auth.getStored()) return;
        syncNow({ reason: "tap", interactive: true });
      };
      opts.doc.addEventListener("pointerup", tapHandler, true);
    }
    function classify(e) {
      if (e instanceof SyncError) return e;
      return new SyncError("drive", e && e.message || "\u540C\u671F\u306B\u5931\u6557\u3057\u307E\u3057\u305F");
    }
    async function runOnce(reason, interactive) {
      let token = auth.getStored();
      if (!token) {
        if (auth.preload && auth.isReady && !auth.isReady()) await auth.preload();
        const r = await auth.request({ interactive, hint: cfg.email });
        token = r && r.token;
        if (!token) {
          const why = r && r.why || "";
          if (why === "noclient") {
            setStatus({ phase: "error", message: "\u30AF\u30E9\u30A4\u30A2\u30F3\u30C8ID\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093" });
            return;
          }
          if (why === "scope") {
            setStatus({ phase: "error", message: "Google\u30C9\u30E9\u30A4\u30D6\u3078\u306E\u30A2\u30AF\u30BB\u30B9\u3092\u8A31\u53EF\u3057\u3066\u304F\u3060\u3055\u3044" });
            return;
          }
          const denied = why === "access_denied" || why === "denied";
          if (interactive && !cfg.email && why !== "notready") {
            cfg.enabled = false;
            saveCfg();
            disarmTap();
            setStatus({ phase: "off", message: denied ? "Google\u306B\u30ED\u30B0\u30A4\u30F3\u3092\u62D2\u5426\u3055\u308C\u307E\u3057\u305F\u3002\u30A2\u30D7\u30EA\u306EGoogle\u8A2D\u5B9A\uFF08\u516C\u958B\u72B6\u614B\uFF09\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044" : "\u30ED\u30B0\u30A4\u30F3\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F" });
            return;
          }
          if (interactive && why !== "notready") {
            setStatus({ phase: "needsAuth", message: "\u30ED\u30B0\u30A4\u30F3\u304C\u5B8C\u4E86\u3057\u307E\u305B\u3093\u3067\u3057\u305F" });
            return;
          }
          setStatus({ phase: "needsAuth", message: "\u518D\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059" });
          armTap();
          return;
        }
      }
      const drive = createDrive(fetchFn, () => auth.getStored() || token);
      setStatus({ phase: "syncing", message: "" });
      try {
        if (!cfg.email) {
          try {
            const u = await drive.about();
            cfg.email = u.emailAddress || "";
            saveCfg();
          } catch (e) {
            if (e instanceof SyncError && e.kind === "auth") throw e;
          }
        }
        let ok = false;
        for (let i = 0; i < 3 && !ok; i++) ok = await cycle(drive, token);
        cfg.lastSyncAt = now();
        saveCfg();
        setStatus({ phase: "idle", message: "" });
        if (!ok) scheduleSoon();
      } catch (e) {
        const err = classify(e);
        if (err.kind === "auth") {
          auth.clear();
          setStatus({ phase: "needsAuth", message: err.message });
          armTap();
        } else if (err.kind === "network") {
          setStatus({ phase: "offline", message: "\u901A\u4FE1\u3067\u304D\u307E\u305B\u3093\u3002\u3064\u306A\u304C\u308C\u3070\u81EA\u52D5\u3067\u518D\u958B\u3057\u307E\u3059" });
        } else {
          setStatus({ phase: "error", message: err.message });
        }
      }
    }
    function syncNow({ reason, interactive } = {}) {
      if (!cfg.enabled) return Promise.resolve();
      if (running) {
        queued = true;
        return running;
      }
      if (!interactive && now() - lastAuto < AUTO_MIN_GAP_MS && reason !== "manual") return Promise.resolve();
      if (!interactive) lastAuto = now();
      running = (async () => {
        try {
          await runOnce(reason || "auto", !!interactive);
        } finally {
          running = null;
          if (queued) {
            queued = false;
            scheduleSoon();
          }
        }
      })();
      return running;
    }
    function scheduleSoon(ms) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        syncNow({ reason: "auto" });
      }, ms === void 0 ? DEBOUNCE_MS : ms);
    }
    function onVisible() {
      if (!opts.doc || opts.doc.visibilityState !== "visible") return;
      if (cfg.enabled && now() - cfg.lastSyncAt > 3e4) syncNow({ reason: "visible" });
    }
    function onHidden() {
      if (opts.doc && opts.doc.visibilityState === "hidden" && cfg.enabled && timer) {
        clearTimeout(timer);
        timer = null;
        syncNow({ reason: "hidden" });
      }
    }
    return {
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      /* 画面に出す状態。**同じ中身のあいだは同じ object を返すこと**（useSyncExternalStore 向け） */
      getStatus() {
        const next = publicStatus();
        if (statusCache && stable(statusCache) === stable(next)) return statusCache;
        statusCache = next;
        return next;
      },
      /* Googleの部品を先に読んでおく。読み終わったら画面に知らせる（「接続」を押せる状態になる） */
      preload() {
        return auth.preload ? auth.preload().then((ok) => {
          setStatus({});
          return ok;
        }) : Promise.resolve(true);
      },
      setClientId(id) {
        cfg.clientId = String(id || "").trim();
        saveCfg();
        setStatus({});
      },
      setAutoBackup(on) {
        cfg.autoBackup = !!on;
        saveCfg();
        setStatus({});
      },
      /* 「接続」ボタンの中から呼ぶ。**awaitを挟まずに呼ぶこと**（ポップアップは指の操作の流れの中でしか開かない） */
      connect() {
        cfg.enabled = true;
        saveCfg();
        setStatus({ phase: "idle", message: "" });
        return syncNow({ reason: "manual", interactive: true });
      },
      syncManual() {
        return syncNow({ reason: "manual", interactive: !auth.getStored() });
      },
      /* 解除はログインなしでできること（Googleへは何も問い合わせない） */
      async disconnect() {
        disarmTap();
        cfg.enabled = false;
        cfg.email = "";
        cfg.folderId = "";
        cfg.lastSyncAt = 0;
        cfg.lastBackupDay = "";
        saveCfg();
        folderVerified = false;
        clearTimeout(timer);
        timer = null;
        const t = auth.getStored();
        if (t) auth.revoke(t);
        auth.clear();
        try {
          await opts.kv.del(STATE_KEY);
        } catch (e) {
        }
        setStatus({ phase: "off", message: "" });
      },
      /* 端末の中の記録が書きかわったとき */
      notifyChange() {
        if (cfg.enabled && started) scheduleSoon();
      },
      start() {
        if (started) return;
        started = true;
        if (cfg.enabled && auth.preload) auth.preload();
        if (opts.doc) opts.doc.addEventListener("visibilitychange", onVisible);
        if (opts.doc) opts.doc.addEventListener("visibilitychange", onHidden);
        if (opts.win) opts.win.addEventListener("online", onVisible);
        periodic = setInterval(() => {
          if (!opts.doc || opts.doc.visibilityState === "visible") {
            if (cfg.enabled && now() - cfg.lastSyncAt > PERIOD_MS - 1e3) syncNow({ reason: "period" });
          }
        }, 6e4);
        if (cfg.enabled) syncNow({ reason: "start" });
      },
      stop() {
        started = false;
        clearTimeout(timer);
        clearInterval(periodic);
        if (opts.doc) {
          opts.doc.removeEventListener("visibilitychange", onVisible);
          opts.doc.removeEventListener("visibilitychange", onHidden);
        }
        if (opts.win) opts.win.removeEventListener("online", onVisible);
      }
    };
  }
  function createKV(ls, dbName, lsPrefix) {
    const DB = dbName || "footprints-sync-meta";
    let dbP = null;
    const open = () => {
      if (dbP) return dbP;
      dbP = new Promise((resolve) => {
        try {
          if (typeof indexedDB === "undefined") {
            resolve(null);
            return;
          }
          const req = indexedDB.open(DB, 1);
          const t = setTimeout(() => resolve(null), 4e3);
          req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains("kv")) req.result.createObjectStore("kv");
          };
          req.onsuccess = () => {
            clearTimeout(t);
            resolve(req.result);
          };
          req.onerror = () => {
            clearTimeout(t);
            resolve(null);
          };
          req.onblocked = () => {
            clearTimeout(t);
            resolve(null);
          };
        } catch (e) {
          resolve(null);
        }
      });
      return dbP;
    };
    const tx = (mode, fn) => open().then((db) => new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error("nodb"));
        return;
      }
      try {
        const t = db.transaction("kv", mode);
        const r = fn(t.objectStore("kv"));
        t.oncomplete = () => resolve(r && "result" in r ? r.result : true);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      } catch (e) {
        reject(e);
      }
    }));
    const LK = lsPrefix || "ft-gsync-kv-";
    return {
      async get(k) {
        try {
          const v = await tx("readonly", (s) => s.get(k));
          return v === void 0 ? null : v;
        } catch (e) {
          try {
            return JSON.parse(ls.getItem(LK + k) || "null");
          } catch (e2) {
            return null;
          }
        }
      },
      async set(k, v) {
        try {
          await tx("readwrite", (s) => s.put(v, k));
        } catch (e) {
          try {
            ls.setItem(LK + k, JSON.stringify(v));
          } catch (e2) {
          }
        }
      },
      async del(k) {
        try {
          await tx("readwrite", (s) => s.delete(k));
        } catch (e) {
        }
        try {
          ls.removeItem(LK + k);
        } catch (e) {
        }
      }
    };
  }
  return __toCommonJS(gsync_exports);
})();
