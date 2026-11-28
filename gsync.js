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

  // gsync.src.mjs
  var gsync_src_exports = {};
  __export(gsync_src_exports, {
    BACKUP_KEEP: () => BACKUP_KEEP,
    BACKUP_PREFIX: () => BACKUP_PREFIX,
    CAL_DAYS: () => CAL_DAYS,
    CAL_MINUTES: () => CAL_MINUTES,
    CAL_NAME: () => CAL_NAME,
    CAL_SCOPE: () => CAL_SCOPE,
    DATA_FILE: () => DATA_FILE,
    FOOTPRINTS_SCHEMA: () => FOOTPRINTS_SCHEMA,
    MYTECHO_SCHEMA: () => MYTECHO_SCHEMA,
    PHOTO_PREFIX: () => PHOTO_PREFIX,
    SCOPE: () => SCOPE,
    SYNC_FOLDER: () => SYNC_FOLDER,
    SyncError: () => SyncError,
    calEventBody: () => calEventBody,
    calEventId: () => calEventId,
    contentHash: () => contentHash,
    createCalendarApi: () => createCalendarApi,
    createDrive: () => createDrive,
    createGisAuth: () => createGisAuth,
    createGoogleSync: () => createGoogleSync,
    createKV: () => createKV,
    diffCount: () => diffCount,
    hashOf: () => hashOf,
    indexOf: () => indexOf,
    mergeKeyed: () => mergeKeyed,
    mergeSnapshots: () => mergeSnapshots,
    mergeValue: () => mergeValue,
    planCalendar: () => planCalendar,
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
  function indexOf(s, schema) {
    const sc = schema || FOOTPRINTS_SCHEMA;
    const x = s || {};
    const out = { values: {} };
    for (const c of sc.collections) {
      const m = {};
      for (const it of c.get(x) || []) {
        const id = c.id(it);
        if (id !== null && id !== void 0 && id !== "" && !(id in m)) m[id] = hashOf(it);
      }
      out[c.key] = m;
    }
    for (const v of sc.values) {
      const val = v.get(x);
      out.values[v.key] = hashOf(val === void 0 ? null : val);
    }
    return out;
  }
  function diffCount(a, b, schema) {
    const sc = schema || FOOTPRINTS_SCHEMA;
    let n = 0;
    for (const c of sc.collections) {
      const A = a && a[c.key] || {};
      const B = b && b[c.key] || {};
      for (const id of Object.keys(A)) if (A[id] !== B[id]) n++;
      for (const id of Object.keys(B)) if (!(id in A)) n++;
    }
    if (a && a.values && b && b.values) {
      for (const v of sc.values) if (b.values[v.key] !== void 0 && a.values[v.key] !== b.values[v.key]) n++;
    }
    return n;
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
        throw new SyncError("network", "通信できませんでした");
      }
      if (res.ok) return res;
      let reason = "";
      try {
        const j = await res.clone().json();
        reason = j && j.error && (j.error.errors && j.error.errors[0] && j.error.errors[0].reason || j.error.status) || "";
      } catch (e) {
      }
      if (res.status === 401) throw new SyncError("auth", "ログインの期限が切れました");
      if (res.status === 404) throw new SyncError("notfound", "見つかりませんでした");
      if (res.status === 403) {
        if (/rate|quota/i.test(reason)) throw new SyncError("rate", "混雑中です。しばらく待ってください");
        if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason)) throw new SyncError("config", "Drive API が有効になっていません");
        throw new SyncError("auth", "ドライブへのアクセスが許可されていません");
      }
      if (res.status === 429) throw new SyncError("rate", "混雑中です。しばらく待ってください");
      throw new SyncError("drive", "Googleドライブでエラーが起きました（" + res.status + "）");
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
  function createGisAuth({ getClientId, ls, doc, win, tokenKey, wantCal }) {
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
      /* 今のトークンで、カレンダーにも書けるか（10.57.0〜） */
      hasCal() {
        const t = readTok();
        return !!(t && t.cal && t.exp - 6e4 > Date.now());
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
        const scope = SCOPE + (wantCal && wantCal() ? " " + CAL_SCOPE : "");
        if (!client || clientFor !== clientId + "|" + scope) {
          clientFor = clientId + "|" + scope;
          client = g.initTokenClient({
            client_id: clientId,
            scope,
            include_granted_scopes: true,
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
              const cal = !!(g.hasGrantedAllScopes ? g.hasGrantedAllScopes(resp, CAL_SCOPE) : String(resp.scope || "").indexOf(CAL_SCOPE) >= 0);
              try {
                ls.setItem(TOKEN_KEY, JSON.stringify({ t: resp.access_token, exp, cal }));
              } catch (e) {
              }
              p.done({ token: resp.access_token, why: "", cal });
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
  var CAL_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
  var CAL_DAYS = 60;
  var CAL_NAME = "My手帳";
  var CAL_MINUTES = [5, 10, 30, 60];
  var CAL_API = "https://www.googleapis.com/calendar/v3";
  var CAL_MAX_OPS = 400;
  function calEventId(key) {
    const a = cyrb53(String(key)), b = cyrb53("mt:" + key);
    const to32 = (s36) => parseInt(s36, 36).toString(32);
    return "mt" + to32(a) + to32(b);
  }
  function calEventBody(ev, minutes, tz) {
    const body = {
      summary: ev.summary || "",
      location: ev.location || void 0,
      description: ev.description || void 0,
      start: { dateTime: ev.start + ":00", timeZone: tz },
      end: { dateTime: ev.end + ":00", timeZone: tz },
      reminders: { useDefault: false, overrides: minutes > 0 ? [{ method: "popup", minutes }] : [] },
      transparency: "opaque"
    };
    const h = hashOf(body);
    body.extendedProperties = { private: { mt: "1", h } };
    return { id: calEventId(ev.key), h, body };
  }
  function planCalendar(existing, desired) {
    const want = new Map(desired.map((d) => [d.id, d]));
    const inserts = [], updates = [], deletes = [];
    for (const d of desired) {
      if (!existing.has(d.id)) inserts.push(d);
      else if (existing.get(d.id) !== d.h) updates.push(d);
    }
    for (const id of existing.keys()) if (!want.has(id)) deletes.push(id);
    return { inserts, updates, deletes };
  }
  function createCalendarApi(fetchFn, getToken) {
    async function call(url, init) {
      let res;
      try {
        res = await fetchFn(url, { ...init || {}, headers: { ...init && init.headers || {}, Authorization: "Bearer " + getToken() } });
      } catch (e) {
        throw new SyncError("network", "通信できませんでした");
      }
      if (res.ok) return res;
      let reason = "";
      try {
        const j = await res.clone().json();
        reason = j && j.error && (j.error.errors && j.error.errors[0] && j.error.errors[0].reason || j.error.status) || "";
      } catch (e) {
      }
      if (res.status === 401) throw new SyncError("auth", "ログインの期限が切れました");
      if (res.status === 404 || res.status === 410) throw new SyncError("notfound", "見つかりませんでした");
      if (res.status === 409) throw new SyncError("conflict", "すでにあります");
      if (res.status === 403) {
        if (/rate|quota/i.test(reason)) throw new SyncError("rate", "混雑中です。しばらく待ってください");
        if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason)) throw new SyncError("config", "Google Calendar API が有効になっていません");
        throw new SyncError("calauth", "カレンダーへの書き込みが許可されていません");
      }
      if (res.status === 429) throw new SyncError("rate", "混雑中です。しばらく待ってください");
      throw new SyncError("drive", "Googleカレンダーでエラーが起きました（" + res.status + "）");
    }
    const json = async (url, init) => (await call(url, init)).json();
    const enc = encodeURIComponent;
    const send = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return {
      async alive(calId) {
        try {
          await json(CAL_API + "/calendars/" + enc(calId) + "?fields=id");
          return true;
        } catch (e) {
          if (e instanceof SyncError && e.kind === "notfound") return false;
          throw e;
        }
      },
      async create(summary, tz) {
        return json(CAL_API + "/calendars?fields=id", send("POST", { summary, timeZone: tz, description: "My手帳 の予定の写し。ここで直しても My手帳 には戻りません。" }));
      },
      async removeCal(calId) {
        try {
          await call(CAL_API + "/calendars/" + enc(calId), { method: "DELETE" });
        } catch (e) {
          if (!(e instanceof SyncError && e.kind === "notfound")) throw e;
        }
      },
      /* timeMin 以降に始まる（終わる）予定。id と h だけ */
      async list(calId, timeMin) {
        const out = /* @__PURE__ */ new Map();
        let pageToken = "";
        do {
          const j = await json(CAL_API + "/calendars/" + enc(calId) + "/events?maxResults=2500&showDeleted=false&timeMin=" + enc(timeMin) + "&fields=nextPageToken,items(id,status,extendedProperties)" + (pageToken ? "&pageToken=" + enc(pageToken) : ""));
          for (const it of j.items || []) {
            if (it.status === "cancelled") continue;
            const pv = it.extendedProperties && it.extendedProperties.private || {};
            out.set(it.id, pv.h || "");
          }
          pageToken = j.nextPageToken || "";
        } while (pageToken);
        return out;
      },
      async insert(calId, id, body) {
        await json(CAL_API + "/calendars/" + enc(calId) + "/events?fields=id", send("POST", { ...body, id }));
      },
      async update(calId, id, body) {
        await json(CAL_API + "/calendars/" + enc(calId) + "/events/" + enc(id) + "?fields=id", send("PUT", { ...body, status: "confirmed" }));
      },
      async remove(calId, id) {
        try {
          await call(CAL_API + "/calendars/" + enc(calId) + "/events/" + enc(id), { method: "DELETE" });
        } catch (e) {
          if (!(e instanceof SyncError && e.kind === "notfound")) throw e;
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
    let cfg = {
      enabled: false,
      clientId: "",
      email: "",
      folderId: "",
      autoBackup: true,
      lastBackupDay: "",
      lastSyncAt: 0,
      sentN: 0,
      sentAt: 0,
      recvN: 0,
      recvAt: 0,
      /* カレンダーへ写す（10.57.0〜）。calendar＝この端末で写す、calMinutes＝何分前（ドライブの設定ファイルとそろえる）、
         calMinutesDirty＝この端末で変えて、まだ設定ファイルに書いていない、calRemove＝やめたのでカレンダーを消しに行く */
      calendar: false,
      calMinutes: 10,
      calMinutesDirty: false,
      calRemove: false,
      calId: "",
      calHash: "",
      calDay: "",
      calCount: 0,
      calAt: 0,
      calMessage: ""
    };
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
    const auth = opts.auth || createGisAuth({ getClientId: clientId, ls, doc: opts.doc, win: opts.win, tokenKey: PREFIX + "-token", wantCal: () => cfg.calendar || cfg.calRemove });
    const canCalendar = !!opts.buildCalendarEvents;
    const authHasCal = () => auth.hasCal ? auth.hasCal() : true;
    const wantsCal = () => canCalendar && (cfg.calendar || cfg.calRemove);
    let status = { phase: cfg.enabled ? "idle" : "off", message: "", pending: 0, askLogin: false };
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
      sentN: cfg.sentN,
      sentAt: cfg.sentAt,
      recvN: cfg.recvN,
      recvAt: cfg.recvAt,
      hasClientId: !!clientId(),
      clientIdFixed: !!opts.defaultClientId && !cfg.clientId,
      ready: auth.isReady ? auth.isReady() : true,
      calendar: canCalendar && cfg.calendar,
      calMinutes: cfg.calMinutes,
      calCount: cfg.calCount,
      calAt: cfg.calAt,
      calMessage: cfg.calMessage,
      /* 写す設定なのに、今のログインではカレンダーに書けない（「カレンダーを許可」のボタンを出す） */
      calNeedsAuth: canCalendar && cfg.calendar && !!auth.getStored() && !authHasCal()
    });
    let statusCache = null;
    let running = null;
    let queued = false;
    let timer = null;
    let periodic = null;
    let lastAuto = 0;
    let folderVerified = false;
    let started = false;
    let memBase = void 0;
    let hiddenAt = 0;
    let lastMoved = { sent: 0, received: 0 };
    async function loadState() {
      try {
        return await opts.kv.get(STATE_KEY) || {};
      } catch (e) {
        return {};
      }
    }
    async function saveState(s) {
      memBase = s && s.base ? s.base : null;
      try {
        await opts.kv.set(STATE_KEY, s);
      } catch (e) {
      }
    }
    async function refreshPending() {
      if (!cfg.enabled) return;
      try {
        if (memBase === void 0) {
          const st = await loadState();
          if (memBase === void 0) memBase = st.base || null;
        }
        const snap = await opts.getSnapshot();
        const n = diffCount(indexOf(snap, schema), memBase || {}, schema);
        if (n !== status.pending) setStatus({ pending: n });
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
        throw new SyncError("drive", "同期データを読めません。上書きはしません");
      }
      if (!d || typeof d !== "object" || d.format !== FORMAT || !Array.isArray(schema.collections[0].get(d))) {
        throw new SyncError("drive", "同期データの形式が新しすぎます。アプリを更新してください");
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
        lastMoved = { sent: 0, received: 0 };
        return true;
      }
      let remote = null;
      if (dataFile) remote = parseRemote(await drive.download(dataFile.id));
      const res = mergeSnapshots(local0, remote, { schema, base: st.base, baseAt: st.baseAt, hasBase, tombs: st.tombs, now: now() });
      const localIdx = indexOf(local0, schema);
      const mergedIdx = indexOf(res.merged, schema);
      const received = res.localChanged ? diffCount(mergedIdx, localIdx, schema) : 0;
      const sent = res.remoteChanged ? diffCount(mergedIdx, remote ? indexOf(remote, schema) : {}, schema) : 0;
      const refs = Array.from(new Set(opts.listPhotoRefs(res.merged)));
      const onDrive = /* @__PURE__ */ new Map();
      for (const f of files) {
        const id = photoIdOfName(f.name);
        if (id) onDrive.set(id, f);
      }
      const __need = refs.filter((id) => !onDrive.has(id));
      const __tot = 4 + refs.length + __need.length;
      let __n = 2, __at = 0;
      const __p = (label, force) => {
        const t = Date.now();
        if (!force && t - __at < 150) return;
        __at = t;
        setStatus({ progress: Math.min(0.97, __n / __tot), step: label });
      };
      __p("受け取っています", true);
      for (const id of refs) {
        __n++;
        __p("受け取っています");
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
        __n++;
        __p("送っています");
        const data = await opts.photoGet(id);
        if (typeof data === "string" && data) {
          const up = await drive.upload(PHOTO_PREFIX + id + ".txt", data, "text/plain", folderId);
          onDrive.set(id, { id: up.id, name: PHOTO_PREFIX + id + ".txt", modifiedTime: up.modifiedTime });
        }
      }
      __n = __tot - 2;
      __p("送っています", true);
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
      __n = __tot - 1;
      __p("仕上げています", true);
      await saveState({ base: res.base, tombs: res.tombs, lastRemoteModified: modified, lastLocalHash: contentHash(res.merged, schema), baseAt: now() });
      lastMoved = { sent, received };
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
    let calVerified = "";
    const tzOf = () => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo";
      } catch (e) {
        return "Asia/Tokyo";
      }
    };
    const calFileName = () => NAMES.calendar || "calendar.json";
    let calConfCache = null;
    async function readCalConf(drive, folderId) {
      if (calConfCache && now() - calConfCache.at < 10 * 60 * 1e3) return { f: calConfCache.f, conf: { ...calConfCache.conf } };
      const files = await drive.list(folderId);
      const f = files.find((x) => x.name === calFileName()) || null;
      let conf = {};
      if (f) {
        try {
          conf = JSON.parse(await drive.download(f.id)) || {};
        } catch (e) {
          conf = {};
        }
      }
      calConfCache = { at: now(), f, conf: { ...conf } };
      return { f, conf };
    }
    async function writeCalConf(drive, folderId, f, conf) {
      const up = await drive.upload(calFileName(), JSON.stringify(conf), "application/json", folderId, f ? f.id : void 0);
      calConfCache = { at: now(), f: f || { id: up.id, name: calFileName() }, conf: { ...conf } };
    }
    async function pushCalendar(drive, token) {
      if (!canCalendar || !(cfg.calendar || cfg.calRemove)) return;
      if (!authHasCal()) return;
      const capi = createCalendarApi(fetchFn, () => auth.getStored() || token);
      const folderId = await ensureFolder(drive);
      let { f, conf } = await readCalConf(drive, folderId);
      if (cfg.calRemove && !cfg.calendar) {
        const id = conf.calendarId || cfg.calId;
        if (id) await capi.removeCal(id);
        if (conf.calendarId) {
          conf = { ...conf, calendarId: "" };
          await writeCalConf(drive, folderId, f, conf);
        }
        cfg.calRemove = false;
        cfg.calId = "";
        cfg.calHash = "";
        cfg.calDay = "";
        cfg.calCount = 0;
        cfg.calMessage = "";
        saveCfg();
        return;
      }
      cfg.calRemove = false;
      let confDirty = false;
      if (cfg.calMinutesDirty) {
        conf.minutes = cfg.calMinutes;
        confDirty = true;
        cfg.calMinutesDirty = false;
      } else if (CAL_MINUTES.includes(Number(conf.minutes))) cfg.calMinutes = Number(conf.minutes);
      let calId = conf.calendarId || "";
      if (calId && calVerified !== calId) {
        if (await capi.alive(calId)) calVerified = calId;
        else calId = "";
      }
      if (!calId) {
        const c = await capi.create(CAL_NAME, tzOf());
        calId = c.id;
        calVerified = calId;
        conf.calendarId = calId;
        confDirty = true;
        cfg.calHash = "";
      }
      if (confDirty) await writeCalConf(drive, folderId, f, conf);
      cfg.calId = calId;
      const today = dayStr(now());
      const tz = tzOf();
      const evs = await opts.buildCalendarEvents({ from: today, days: CAL_DAYS }) || [];
      const desired = evs.map((e) => calEventBody(e, cfg.calMinutes, tz));
      const allHash = setHash(desired.map((d) => d.id + ":" + d.h)) + "|" + calId;
      if (cfg.calHash === allHash && cfg.calDay === today) {
        saveCfg();
        return;
      }
      const start = new Date(now());
      start.setHours(0, 0, 0, 0);
      const existing = await capi.list(calId, start.toISOString());
      const plan = planCalendar(existing, desired);
      let ops = 0;
      for (const d of plan.inserts) {
        if (ops++ >= CAL_MAX_OPS) break;
        try {
          await capi.insert(calId, d.id, d.body);
        } catch (e) {
          if (e instanceof SyncError && e.kind === "conflict") await capi.update(calId, d.id, d.body);
          else throw e;
        }
      }
      for (const d of plan.updates) {
        if (ops++ >= CAL_MAX_OPS) break;
        await capi.update(calId, d.id, d.body);
      }
      for (const id of plan.deletes) {
        if (ops++ >= CAL_MAX_OPS) break;
        await capi.remove(calId, id);
      }
      const done = ops <= CAL_MAX_OPS;
      cfg.calHash = done ? allHash : "";
      cfg.calDay = today;
      cfg.calCount = desired.length;
      cfg.calAt = now();
      cfg.calMessage = "";
      saveCfg();
    }
    async function runCalendar(drive, token) {
      try {
        await pushCalendar(drive, token);
      } catch (e) {
        const err = classify(e);
        if (err.kind === "auth") throw err;
        if (err.kind === "calauth") {
          try {
            auth.clear();
          } catch (e2) {
          }
        }
        cfg.calMessage = err.kind === "network" ? "" : err.message;
        saveCfg();
      }
    }
    function classify(e) {
      if (e instanceof SyncError) return e;
      return new SyncError("drive", e && e.message || "同期に失敗しました");
    }
    async function runOnce(reason, interactive) {
      let token = auth.getStored();
      if (token && interactive && wantsCal() && !authHasCal()) token = null;
      if (!token && !interactive) {
        setStatus({ phase: "needsAuth", message: "ログインが必要です" });
        return;
      }
      if (!token) {
        if (auth.preload && auth.isReady && !auth.isReady()) await auth.preload();
        const r = await auth.request({ interactive, hint: cfg.email });
        token = r && r.token;
        if (token && cfg.calendar && canCalendar && !authHasCal()) {
          cfg.calendar = false;
          cfg.calMessage = "カレンダーへの書き込みが許可されませんでした";
          saveCfg();
        }
        if (!token) {
          const why = r && r.why || "";
          if (why === "noclient") {
            setStatus({ phase: "error", message: "クライアントIDが設定されていません" });
            return;
          }
          if (why === "scope") {
            setStatus({ phase: "error", message: "Googleドライブへのアクセスを許可してください" });
            return;
          }
          const denied = why === "access_denied" || why === "denied";
          if (interactive && !cfg.email && why !== "notready") {
            cfg.enabled = false;
            saveCfg();
            setStatus({ phase: "off", message: denied ? "Googleにログインを拒否されました。アプリのGoogle設定（公開状態）を確認してください" : "ログインできませんでした" });
            return;
          }
          setStatus({ phase: "needsAuth", message: why === "notready" ? "準備中です。もう一度押してください" : "ログインが完了しませんでした" });
          return;
        }
      }
      const drive = createDrive(fetchFn, () => auth.getStored() || token);
      setStatus({ phase: "syncing", message: "", askLogin: false, progress: 0.05, step: "つないでいます" });
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
        if (wantsCal()) {
          setStatus({ progress: 0.98, step: "カレンダーに写しています" });
          await runCalendar(drive, token);
        }
        cfg.lastSyncAt = now();
        if (lastMoved.sent > 0) {
          cfg.sentN = lastMoved.sent;
          cfg.sentAt = cfg.lastSyncAt;
        }
        if (lastMoved.received > 0) {
          cfg.recvN = lastMoved.received;
          cfg.recvAt = cfg.lastSyncAt;
        }
        saveCfg();
        setStatus({ phase: "idle", message: "" });
        await refreshPending();
        if (!ok) scheduleSoon();
      } catch (e) {
        const err = classify(e);
        if (err.kind === "auth") {
          auth.clear();
          setStatus({ phase: "needsAuth", message: err.message });
        } else if (err.kind === "network") {
          setStatus({ phase: "offline", message: "通信できません。つながれば自動で再開します" });
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
    const RESUME_ASK_MS = 3 * 60 * 1e3;
    function onVisible(ev) {
      if (!opts.doc || opts.doc.visibilityState !== "visible") return;
      const away = hiddenAt ? now() - hiddenAt : 0;
      hiddenAt = 0;
      if (!cfg.enabled) return;
      if (!auth.getStored()) {
        if (away >= RESUME_ASK_MS) setStatus({ phase: "needsAuth", message: "ログインが必要です", askLogin: true });
        return;
      }
      if (now() - cfg.lastSyncAt > 3e4 || ev && ev.type === "online") syncNow({ reason: "visible" });
    }
    function onHidden() {
      if (!opts.doc || opts.doc.visibilityState !== "hidden") return;
      hiddenAt = now();
      if (cfg.enabled && timer && auth.getStored()) {
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
      /* カレンダーへ写す（10.57.0〜）。入れるのは指の操作の中から、await を挟まずに呼ぶこと（許可の画面を開くため） */
      setCalendar(on) {
        if (!canCalendar) return Promise.resolve();
        if (on) {
          cfg.calendar = true;
          cfg.calRemove = false;
          cfg.calMessage = "";
          cfg.calHash = "";
        } else {
          cfg.calendar = false;
          cfg.calRemove = true;
          cfg.calHash = "";
          cfg.calMessage = "";
        }
        saveCfg();
        setStatus({});
        return syncNow({ reason: "manual", interactive: !!on && !authHasCal() });
      },
      /* 「カレンダーを許可」のボタン。指の操作の中から呼ぶ */
      allowCalendar() {
        cfg.calMessage = "";
        saveCfg();
        setStatus({});
        return syncNow({ reason: "manual", interactive: true });
      },
      setCalendarMinutes(m) {
        const v = Number(m);
        if (!CAL_MINUTES.includes(v)) return Promise.resolve();
        cfg.calMinutes = v;
        cfg.calMinutesDirty = true;
        cfg.calHash = "";
        saveCfg();
        setStatus({});
        return syncNow({ reason: "manual" });
      },
      /* 「接続」ボタンの中から呼ぶ。**awaitを挟まずに呼ぶこと**（ポップアップは指の操作の流れの中でしか開かない） */
      connect() {
        cfg.enabled = true;
        saveCfg();
        memBase = void 0;
        setStatus({ phase: "idle", message: "", askLogin: false });
        return syncNow({ reason: "manual", interactive: true });
      },
      syncManual() {
        return syncNow({ reason: "manual", interactive: !auth.getStored() });
      },
      /* 起動時の小窓の「ログインして同期」。指の操作の中から、await を挟まずに呼ぶこと */
      loginNow() {
        setStatus({ askLogin: false });
        return syncNow({ reason: "manual", interactive: true });
      },
      /* 起動時の小窓の「あとで」 */
      dismissLogin() {
        setStatus({ askLogin: false });
      },
      /* 解除はログインなしでできること（Googleへは何も問い合わせない） */
      async disconnect() {
        if (canCalendar && cfg.calendar && cfg.calId && auth.getStored() && authHasCal()) {
          try {
            await createCalendarApi(fetchFn, () => auth.getStored()).removeCal(cfg.calId);
          } catch (e) {
          }
        }
        calConfCache = null;
        calVerified = "";
        memBase = void 0;
        cfg.enabled = false;
        cfg.email = "";
        cfg.folderId = "";
        cfg.lastSyncAt = 0;
        cfg.lastBackupDay = "";
        cfg.sentN = 0;
        cfg.sentAt = 0;
        cfg.recvN = 0;
        cfg.recvAt = 0;
        cfg.calendar = false;
        cfg.calRemove = false;
        cfg.calHash = "";
        cfg.calId = "";
        cfg.calCount = 0;
        cfg.calMessage = "";
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
        setStatus({ phase: "off", message: "", pending: 0, askLogin: false });
      },
      /* 端末の中の記録が書きかわったとき。まだ送っていない数をすぐ数え直す（ヘッダーの雲に出る） */
      notifyChange() {
        if (!cfg.enabled || !started) return;
        refreshPending();
        if (auth.getStored()) scheduleSoon();
        else if (status.phase !== "needsAuth") setStatus({ phase: "needsAuth", message: "ログインが必要です" });
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
            if (cfg.enabled && auth.getStored() && now() - cfg.lastSyncAt > PERIOD_MS - 1e3) syncNow({ reason: "period" });
          }
        }, 6e4);
        if (cfg.enabled) {
          refreshPending();
          if (auth.getStored()) syncNow({ reason: "start" });
          else setStatus({ phase: "needsAuth", message: "ログインが必要です", askLogin: true });
        }
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
  return __toCommonJS(gsync_src_exports);
})();
