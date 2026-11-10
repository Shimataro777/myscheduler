/* ============================================================
   Googleドライブとの同期（My手帳 2.29.0〜。Footprints 2.17.0 の gsync.js を、My手帳のデータの形に合わせたもの）

   ・画面（React）にも、このアプリの保存まわりにも依存しない。必要なものは createGoogleSync に渡す。
     （だから Node でも試験できる。試験は gsync.test.mjs）
   ・Googleに預けるのは、ドライブの「MyTecho-Sync」フォルダ1つだけ。
     スコープは drive.file（このアプリが作ったファイルしか見えない）。ドライブの他のファイルは読めない。
   ・フォルダの中身
       mytecho-sync.json          … 記録・計画・種類・フォルダ・タグ・表示設定（写真の中身は除く）
       photo_<番号>.txt           … 写真1枚ごと（data URL）
       MyTecho-backup-日付.json   … 1日1回の控え（バックアップ画面の書き出しと同じ形式・写真入り。7日ぶん残す）

   ■ 同期のしくみ（いちばん大事なところ）
   端末ごとに「前回の同期のあとの姿（base）」を覚えておき、base・この端末・ドライブの3つを比べて混ぜる（3者マージ）。
     - 片方だけ変わった　→ 変わったほうを採る
     - 両方変わった　　　→ 更新時刻が新しいほうを採る（同じなら この端末）
     - 片方で消した　　　→ 「消した」印（tombs）をドライブに残し、もう片方の端末で消す。
                          ただし消したあとに別の端末で書き直されていたら、書き直したほうを残す（消さない）
   消した印は「消したときの中身のハッシュ」を持つ。中身が違えば（＝書き直されていれば）消さない。
   ドライブへの書き込みが途中で失われても、「相手に無い」だけでは消さない（印があるときだけ消す）。
   **記録を失う方向には、印が無い限り動かさない。** これを崩さないこと。

   ■ 認証
   Google Identity Services のトークン方式（サーバー不要）。トークンは約1時間で切れる。
   取り直すには、Googleの小さな画面（ポップアップ）が一瞬開く。これは指の操作の中でしか開けない。
   **使っている途中に、勝手にこの画面を出さないこと（2.17.0〜）。**
   以前は「切れたら、次にどこかをタップしたときに取り直す」形で、記録を書いている途中に
   Googleの画面が一瞬はさまり、何が起きたのか分からなかった（依頼により廃止）。
   いまは、起動したとき（と、しばらく離れてから戻ったとき）だけ askLogin を立て、
   画面が「Googleとつなぎ直す」の小窓を出す。そこで押したときにだけ取り直す。
   使っている途中で切れたときは、ヘッダーの雲のしるしが変わるだけ（押せばログインできる）。
   ============================================================ */

export const SYNC_FOLDER = "MyTecho-Sync";
export const DATA_FILE = "mytecho-sync.json";
export const PHOTO_PREFIX = "photo_";
export const BACKUP_PREFIX = "MyTecho-backup-";
export const BACKUP_EXT = ".json";
export const BACKUP_KEEP = 7;
export const SCOPE = "https://www.googleapis.com/auth/drive.file";
const FORMAT = 1;
const TOMB_KEEP_MS = 180 * 24 * 3600 * 1000;
const TOMB_MAX = 3000;
const ORPHAN_GRACE_MS = 30 * 24 * 3600 * 1000;

/* ------------------------------------------------------------
   ハッシュ（中身が同じかどうかを見るだけ。暗号用ではない）
   ------------------------------------------------------------ */
export function stable(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
}
function cyrb53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
export const hashOf = (v) => cyrb53(stable(v));
/* 並びに左右されないハッシュ（配列は要素ごとのハッシュを並べ替えて合わせる） */
export const setHash = (arr) => cyrb53((arr || []).map(hashOf).sort().join("|"));

/* ------------------------------------------------------------
   混ぜる：番号つきの一覧（記録・フォルダ・イラスト・タグ・収穫）
   ------------------------------------------------------------ */
/* どちらが新しいか。記録はチェックだけ付けると checkedAt だけが進むので、それも見る。計画は中の steps も見る */
const stampOf = (x) => {
  if (!x || typeof x !== "object") return "";
  let t = [x.updatedAt, x.checkedAt, x.createdAt].filter(Boolean).map(String).sort().pop() || "";
  if (Array.isArray(x.steps)) for (const st of x.steps) { const u = String((st && (st.updatedAt || st.createdAt)) || ""); if (u > t) t = u; }
  return t;
};

export function mergeKeyed({ local, remote, base, tombs, getId, now }) {
  const L = new Map();
  const R = new Map();
  for (const it of local || []) { const id = getId(it); if (id !== undefined && id !== null && id !== "" && !L.has(id)) L.set(id, it); }
  for (const it of remote || []) { const id = getId(it); if (id !== undefined && id !== null && id !== "" && !R.has(id)) R.set(id, it); }
  const B = base || {};
  const T = { ...(tombs || {}) };
  /* 前回あったのに、いまこの端末に無いもの ＝ この端末で消した。印を残す（古い印は上書き） */
  for (const id of Object.keys(B)) if (!L.has(id)) T[id] = { h: B[id], t: now };

  const order = [...L.keys(), ...[...R.keys()].filter((k) => !L.has(k))];
  const items = [];
  for (const id of order) {
    const l = L.get(id);
    const r = R.get(id);
    let pick;
    if (l !== undefined && r !== undefined) {
      const hl = hashOf(l);
      const hr = hashOf(r);
      if (hl === hr) pick = l;
      else if (hr === B[id]) pick = l;          // この端末だけ変わった
      else if (hl === B[id]) pick = r;          // ドライブだけ変わった
      else pick = stampOf(r) > stampOf(l) ? r : l; // 両方変わった
    } else {
      pick = l !== undefined ? l : r;
    }
    const tomb = T[id];
    if (tomb && tomb.h === hashOf(pick)) continue; // 消した時と同じ中身 → 消えたまま
    delete T[id];                                  // 書き直されている → 生かす
    items.push(pick);
  }
  const newBase = {};
  for (const it of items) newBase[getId(it)] = hashOf(it);
  /* 古い印を片づける */
  let entries = Object.entries(T).filter(([, v]) => v && now - v.t < TOMB_KEEP_MS);
  if (entries.length > TOMB_MAX) entries = entries.sort((a, b) => b[1].t - a[1].t).slice(0, TOMB_MAX);
  return { items, base: newBase, tombs: Object.fromEntries(entries) };
}

/* 1つの値（設定など）を混ぜる。baseHash＝前回の同期のときのハッシュ */
export function mergeValue({ local, remote, remoteExists, baseHash, hasBase }) {
  const l = local === undefined ? null : local;
  if (!remoteExists) return { value: l, hash: hashOf(l) };
  const r = remote === undefined ? null : remote;
  const hl = hashOf(l);
  const hr = hashOf(r);
  if (hl === hr) return { value: l, hash: hl };
  /* この端末が初めての同期のときは、ドライブの設定を採る（新しい端末の初期値で、整えた設定を上書きしない） */
  if (!hasBase) return { value: r, hash: hr };
  if (hr === baseHash) return { value: l, hash: hl };
  if (hl === baseHash) return { value: r, hash: hr };
  return { value: l, hash: hl };
}

/* 1件ずつ混ぜるもの（番号つき）と、まるごと1つとして混ぜるもの。
   **タグは並び順に意味がある**（よく使うものを上に置く）ので、1つの値として扱う。
   1件ずつにすると、並べ替えがほかの端末に届かない */
const COLLECTIONS = ["records", "plans", "kinds", "folders"];
const VALUES = ["tags", "prefs"];
const idOf = {
  records: (x) => (x && x.id) || null,
  plans: (x) => (x && x.id) || null,
  kinds: (x) => (x && x.id) || null,
  folders: (x) => (x && x.id) || null,
};

/* 同期する中身の形（snapshot）
   { records, plans, kinds, folders, tags, prefs } */
export function contentHash(s) {
  return cyrb53([
    setHash(s && s.records), setHash(s && s.plans), setHash(s && s.kinds), setHash(s && s.folders),
    hashOf(s && s.tags), hashOf(s && s.prefs),
  ].join("/"));
}
/* 中身の目録（{ records: {番号: ハッシュ}, …, values: {prefs: ハッシュ, …} }）。前回の同期の姿（base）と同じ形 */
export function indexOf(s) {
  const lists = { records: s && s.records, plans: s && s.plans, kinds: s && s.kinds, folders: s && s.folders };
  const out = { values: {} };
  for (const c of COLLECTIONS) {
    const m = {};
    for (const it of lists[c] || []) { const id = idOf[c](it); if (id !== null && id !== undefined && id !== "" && !(id in m)) m[id] = hashOf(it); }
    out[c] = m;
  }
  const vals = { tags: s && s.tags, prefs: s && s.prefs };
  for (const v of VALUES) out.values[v] = hashOf(vals[v] === undefined ? null : vals[v]);
  return out;
}
/* 2つの目録のちがいの数（足した・変えた・消した、を1件ずつ）。b に values が無いときは、設定は数えない */
export function diffCount(a, b) {
  let n = 0;
  for (const c of COLLECTIONS) {
    const A = (a && a[c]) || {};
    const B = (b && b[c]) || {};
    for (const id of Object.keys(A)) if (A[id] !== B[id]) n++;
    for (const id of Object.keys(B)) if (!(id in A)) n++;
  }
  if (a && a.values && b && b.values) for (const v of VALUES) if (b.values[v] !== undefined && a.values[v] !== b.values[v]) n++;
  return n;
}
const tombsHash = (t) => hashOf(Object.fromEntries(COLLECTIONS.map((c) => [c, Object.keys((t && t[c]) || {}).sort()])));

function unionTombs(a, b) {
  const out = {};
  for (const c of COLLECTIONS) {
    const m = { ...((a && a[c]) || {}) };
    const o = (b && b[c]) || {};
    for (const id of Object.keys(o)) if (!m[id] || (o[id] && o[id].t > m[id].t)) m[id] = o[id];
    out[c] = m;
  }
  return out;
}

/* local・remote は snapshot（remote は無いこともある）。ctx = { base, hasBase, tombs, now } */
export function mergeSnapshots(local, remote, ctx) {
  const now = ctx.now;
  const baseAll = ctx.base || {};
  const tombsAll = unionTombs(ctx.tombs, remote && remote.tombs);
  const out = {};
  const newBase = { values: {} };
  const newTombs = {};
  for (const c of COLLECTIONS) {
    const m = mergeKeyed({
      local: local[c] || [], remote: (remote && remote[c]) || [], base: baseAll[c] || {}, tombs: tombsAll[c] || {},
      getId: idOf[c], now,
    });
    out[c] = m.items;
    newBase[c] = m.base;
    newTombs[c] = m.tombs;
  }
  for (const v of VALUES) {
    const exists = !!remote && Object.prototype.hasOwnProperty.call(remote, v) && remote[v] !== undefined;
    const r = mergeValue({
      local: local[v], remote: remote ? remote[v] : undefined, remoteExists: exists,
      baseHash: (baseAll.values || {})[v], hasBase: !!ctx.hasBase,
    });
    out[v] = r.value;
    newBase.values[v] = r.hash;
  }
  const merged = { records: out.records, plans: out.plans, kinds: out.kinds, folders: out.folders, tags: out.tags, prefs: out.prefs };
  const mh = contentHash(merged);
  return {
    merged, base: newBase, tombs: newTombs,
    localChanged: mh !== contentHash(local),
    remoteChanged: !remote || mh !== contentHash(remote) || tombsHash(newTombs) !== tombsHash(remote.tombs),
  };
}

/* ------------------------------------------------------------
   エラー
   ------------------------------------------------------------ */
export class SyncError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

/* ------------------------------------------------------------
   Googleドライブの窓口
   ------------------------------------------------------------ */
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const qs = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export function createDrive(fetchFn, getToken) {
  async function call(url, init) {
    let res;
    try {
      res = await fetchFn(url, { ...(init || {}), headers: { ...((init && init.headers) || {}), Authorization: "Bearer " + getToken() } });
    } catch (e) {
      throw new SyncError("network", "通信できませんでした");
    }
    if (res.ok) return res;
    let reason = "";
    try { const j = await res.clone().json(); reason = (j && j.error && (j.error.errors && j.error.errors[0] && j.error.errors[0].reason || j.error.status)) || ""; } catch (e) { /* 本文が無い */ }
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
      return (j && j.user) || {};
    },
    async findFolder(name) {
      const q = "mimeType='application/vnd.google-apps.folder' and name='" + qs(name) + "' and trashed=false";
      const j = await json(API + "/files?q=" + encodeURIComponent(q) + "&orderBy=createdTime&pageSize=10&fields=files(id,name)");
      return (j.files && j.files[0]) || null;
    },
    async createFolder(name) {
      return json(API + "/files?fields=id,name", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" }),
      });
    },
    async folderAlive(id) {
      try {
        const j = await json(API + "/files/" + encodeURIComponent(id) + "?fields=id,trashed");
        return !!j && !j.trashed;
      } catch (e) { if (e instanceof SyncError && e.kind === "notfound") return false; throw e; }
    },
    async list(folderId) {
      const files = [];
      let pageToken = "";
      do {
        const q = "'" + qs(folderId) + "' in parents and trashed=false";
        const j = await json(API + "/files?q=" + encodeURIComponent(q) + "&pageSize=1000&fields=nextPageToken,files(id,name,modifiedTime,createdTime)"
          + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : ""));
        files.push(...(j.files || []));
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
      const body = "--" + b + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta)
        + "\r\n--" + b + "\r\nContent-Type: " + mime + "; charset=UTF-8\r\n\r\n" + text + "\r\n--" + b + "--";
      const url = (existingId ? UPLOAD + "/files/" + encodeURIComponent(existingId) : UPLOAD + "/files") + "?uploadType=multipart&fields=id,modifiedTime";
      return json(url, { method: existingId ? "PATCH" : "POST", headers: { "Content-Type": "multipart/related; boundary=" + b }, body });
    },
    async remove(id) { await call(API + "/files/" + encodeURIComponent(id), { method: "DELETE" }); },
  };
}

/* ------------------------------------------------------------
   Googleのログイン（Google Identity Services・トークン方式）
   ------------------------------------------------------------ */
/* **Footprints と同じ名前にしないこと。** 同じ github.io に置くと端末の置き場（localStorage）を共有し、
   フォルダの番号などを取り違える */
const TOKEN_KEY = "mt-gsync-token";
export function createGisAuth({ getClientId, ls, doc, win }) {
  let client = null;
  let clientFor = "";
  let pending = null;
  let scriptP = null;
  const gis = () => (win && win.google && win.google.accounts && win.google.accounts.oauth2) || null;
  const readTok = () => { try { return JSON.parse(ls.getItem(TOKEN_KEY) || "null"); } catch (e) { return null; } };
  return {
    getStored() {
      const t = readTok();
      return t && t.t && t.exp - 60000 > Date.now() ? t.t : null;
    },
    clear() { try { ls.removeItem(TOKEN_KEY); } catch (e) { /* noop */ } },
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
          s.onerror = () => { scriptP = null; resolve(false); };
          doc.head.appendChild(s);
        } catch (e) { scriptP = null; resolve(false); }
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
          client_id: clientId, scope: SCOPE,
          callback: (resp) => {
            const p = pending; if (!p) return;
            if (!resp || resp.error || !resp.access_token) { p.done({ token: null, why: (resp && resp.error) || "denied" }); return; }
            if (g.hasGrantedAllScopes && !g.hasGrantedAllScopes(resp, SCOPE)) { p.done({ token: null, why: "scope" }); return; }
            const exp = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
            try { ls.setItem(TOKEN_KEY, JSON.stringify({ t: resp.access_token, exp })); } catch (e) { /* noop */ }
            p.done({ token: resp.access_token, why: "" });
          },
          error_callback: (err) => { const p = pending; if (p) p.done({ token: null, why: (err && err.type) || "popup" }); },
        });
      }
      let done;
      const promise = new Promise((resolve) => { done = (r) => { clearTimeout(timer); pending = null; resolve(r); }; });
      const timer = setTimeout(() => { if (pending) pending.done({ token: null, why: "timeout" }); }, 120000);
      pending = { promise, done };
      try {
        const opt = { prompt: interactive ? "" : "none" };
        if (hint) opt.login_hint = hint;
        client.requestAccessToken(opt);
      } catch (e) { pending.done({ token: null, why: "popup" }); }
      return promise;
    },
    revoke(token) { try { const g = gis(); if (g && token) g.revoke(token, () => {}); } catch (e) { /* noop */ } },
  };
}

/* ------------------------------------------------------------
   同期の本体
   opts:
     fetch, ls（localStorage互換）, kv（{get,set,del} 非同期。大きい控えの置き場）, doc, win
     defaultClientId … index.html の window.__FT_GOOGLE_CLIENT_ID
     getSnapshot() / applySnapshot(merged) / listPhotoRefs(snapshot)
     photoHas(id) / photoGet(id) / photoPut(id, dataUrl)
     buildBackupText()  … 控えファイルの中身（無ければ控えは作らない）
     onBackedUp()       … 控えをドライブに置けたとき
     auth（試験用に差し替え可）, now()
   ------------------------------------------------------------ */
const CFG_KEY = "mt-gsync-cfg";
const STATE_KEY = "state";
const AUTO_MIN_GAP_MS = 20000;   // 自動の同期の最短の間隔
const DEBOUNCE_MS = 6000;        // 書きかえてから同期するまで
const PERIOD_MS = 5 * 60 * 1000; // 開いたままのときの定期確認

export function createGoogleSync(opts) {
  const now = opts.now || (() => Date.now());
  const ls = opts.ls;
  const fetchFn = opts.fetch;
  const listeners = new Set();
  const dayStr = (t) => { const d = new Date(t); const p = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); };

  let cfg = { enabled: false, clientId: "", email: "", folderId: "", autoBackup: true, lastBackupDay: "", lastSyncAt: 0,
    sentN: 0, sentAt: 0, recvN: 0, recvAt: 0 };
  try { Object.assign(cfg, JSON.parse(ls.getItem(CFG_KEY) || "{}")); } catch (e) { /* 初回 */ }
  const saveCfg = () => { try { ls.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* noop */ } };

  const clientId = () => cfg.clientId || opts.defaultClientId || "";
  const auth = opts.auth || createGisAuth({ getClientId: clientId, ls, doc: opts.doc, win: opts.win });

  /* pending … この端末で書きかえて、まだドライブへ送っていない数（前回の同期の姿とのちがい）
     askLogin … 起動したときにログインが切れていた。画面が「Googleとつなぎ直す」の小窓を出す
     （最後に送った数・時刻、受け取った数・時刻は cfg の sentN/sentAt・recvN/recvAt。何も動かなかった同期では変えない） */
  let status = { phase: cfg.enabled ? "idle" : "off", message: "", pending: 0, askLogin: false };
  const setStatus = (patch) => { status = { ...status, ...patch }; listeners.forEach((fn) => { try { fn(); } catch (e) { /* noop */ } }); };
  const publicStatus = () => ({
    ...status, enabled: cfg.enabled, email: cfg.email, lastSyncAt: cfg.lastSyncAt, autoBackup: cfg.autoBackup,
    lastBackupDay: cfg.lastBackupDay, clientId: cfg.clientId,
    sentN: cfg.sentN, sentAt: cfg.sentAt, recvN: cfg.recvN, recvAt: cfg.recvAt, hasClientId: !!clientId(), clientIdFixed: !!opts.defaultClientId && !cfg.clientId,
    ready: auth.isReady ? auth.isReady() : true,
  });
  let statusCache = null;

  let running = null;
  let queued = false;
  let timer = null;
  let periodic = null;
  let lastAuto = 0;
  let folderVerified = false;
  let started = false;
  let memBase = undefined; // 前回の同期の姿（目録）。undefined＝まだ読んでいない、null＝一度も同期していない
  let hiddenAt = 0;

  async function loadState() { try { return (await opts.kv.get(STATE_KEY)) || {}; } catch (e) { return {}; } }
  async function saveState(s) { memBase = s && s.base ? s.base : null; try { await opts.kv.set(STATE_KEY, s); } catch (e) { /* noop */ } }

  /* まだ送っていない数を数え直す。一度も同期していないときは、端末にあるもの全部 */
  async function refreshPending() {
    if (!cfg.enabled) return;
    try {
      if (memBase === undefined) { const st = await loadState(); if (memBase === undefined) memBase = st.base || null; }
      const snap = await opts.getSnapshot();
      const n = diffCount(indexOf(snap), memBase || {});
      if (n !== status.pending) setStatus({ pending: n });
    } catch (e) { /* 数えられなくても同期には差し支えない */ }
  }

  async function ensureFolder(drive) {
    if (cfg.folderId && folderVerified) return cfg.folderId;
    if (cfg.folderId) {
      if (await drive.folderAlive(cfg.folderId)) { folderVerified = true; return cfg.folderId; }
      cfg.folderId = "";
    }
    const found = await drive.findFolder(SYNC_FOLDER);
    const f = found || (await drive.createFolder(SYNC_FOLDER));
    cfg.folderId = f.id; folderVerified = true; saveCfg();
    return f.id;
  }

  const photoIdOfName = (n) => (n.startsWith(PHOTO_PREFIX) && n.endsWith(".txt") ? n.slice(PHOTO_PREFIX.length, -4) : null);

  function parseRemote(text) {
    let d;
    try { d = JSON.parse(text); } catch (e) { throw new SyncError("drive", "同期データを読めません。上書きはしません"); }
    if (!d || typeof d !== "object" || d.format !== FORMAT || !Array.isArray(d.records)) {
      throw new SyncError("drive", "同期データの形式が新しすぎます。アプリを更新してください");
    }
    return d;
  }

  let lastMoved = { sent: 0, received: 0 };
  /* 1回ぶん。中で書きかえが見つかったら false（やり直し） */
  async function cycle(drive, token) {
    const folderId = await ensureFolder(drive);
    const files = await drive.list(folderId);
    const dataFiles = files.filter((f) => f.name === DATA_FILE).sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)));
    const dataFile = dataFiles[0] || null;
    const st = await loadState();
    const local0 = await opts.getSnapshot();
    const localHash = contentHash(local0);
    const hasBase = !!st.base;

    if (dataFile && hasBase && st.lastRemoteModified === dataFile.modifiedTime && st.lastLocalHash === localHash) {
      await maybeBackup(drive, folderId, files, local0);
      lastMoved = { sent: 0, received: 0 };
      return true; // どちらも変わっていない
    }

    let remote = null;
    if (dataFile) remote = parseRemote(await drive.download(dataFile.id));
    const res = mergeSnapshots(local0, remote, { base: st.base, hasBase, tombs: st.tombs, now: now() });
    const localIdx = indexOf(local0);
    const mergedIdx = indexOf(res.merged);
    const received = res.localChanged ? diffCount(mergedIdx, localIdx) : 0;
    const sent = res.remoteChanged ? (remote ? diffCount(mergedIdx, indexOf(remote)) : diffCount(mergedIdx, {})) : 0;

    /* 写真：足りないものをドライブから取る（記録を反映する前に） */
    const refs = Array.from(new Set(opts.listPhotoRefs(res.merged)));
    const onDrive = new Map();
    for (const f of files) { const id = photoIdOfName(f.name); if (id) onDrive.set(id, f); }
    for (const id of refs) {
      if (await opts.photoHas(id)) continue;
      const f = onDrive.get(id);
      if (!f) continue;
      const data = await drive.download(f.id);
      if (data) await opts.photoPut(id, data);
    }

    if (res.localChanged) {
      /* 通信しているあいだに書きかえられていたら、上書きせずやり直す */
      const again = await opts.getSnapshot();
      if (contentHash(again) !== localHash) return false;
      await opts.applySnapshot(res.merged);
    }

    /* 写真：ドライブに無いものを上げる（記録のデータより先に） */
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
      const payload = { app: "mytecho-sync", format: FORMAT, updatedAt: new Date(now()).toISOString(), ...res.merged, tombs: res.tombs };
      const up = await drive.upload(DATA_FILE, JSON.stringify(payload), "application/json", folderId, dataFile ? dataFile.id : undefined);
      modified = up.modifiedTime;
      /* 同じ名前が2つできていたら（2台が同時に初回同期した場合）、古いほうを片づける */
      for (const extra of dataFiles.slice(1)) { try { await drive.remove(extra.id); } catch (e) { /* 消せなくてもよい */ } }
    }

    await saveState({ base: res.base, tombs: res.tombs, lastRemoteModified: modified, lastLocalHash: contentHash(res.merged) });
    lastMoved = { sent, received };
    await cleanOrphans(drive, files, refs, res.merged);
    await maybeBackup(drive, folderId, files, res.merged);
    return true;
  }

  /* 使われなくなった写真（30日以上たったもの）をドライブから片づける。
     記録が空のとき・半分以上が対象になるときは、何かおかしいので何もしない */
  async function cleanOrphans(drive, files, refs, merged) {
    try {
      if (!merged.records.length) return;
      const used = new Set(refs);
      const photoFiles = files.filter((f) => photoIdOfName(f.name));
      const stale = photoFiles.filter((f) => !used.has(photoIdOfName(f.name)) && now() - Date.parse(f.modifiedTime || f.createdTime || 0) > ORPHAN_GRACE_MS);
      if (!stale.length || stale.length * 2 > photoFiles.length) return;
      for (const f of stale.slice(0, 50)) await drive.remove(f.id);
    } catch (e) { /* 片づけは失敗しても構わない */ }
  }

  async function maybeBackup(drive, folderId, files, merged) {
    if (!cfg.autoBackup || !opts.buildBackupText) return;
    const today = dayStr(now());
    if (cfg.lastBackupDay === today) return;
    try {
      const text = await opts.buildBackupText();
      if (!text) return;
      const name = BACKUP_PREFIX + today + BACKUP_EXT;
      const same = files.find((f) => f.name === name);
      await drive.upload(name, text, "application/json", folderId, same ? same.id : undefined);
      const names = files.filter((f) => f.name.startsWith(BACKUP_PREFIX) && f.name !== name)
        .sort((a, b) => b.name.localeCompare(a.name));
      for (const old of names.slice(BACKUP_KEEP - 1)) { try { await drive.remove(old.id); } catch (e) { /* noop */ } }
      cfg.lastBackupDay = today; saveCfg();
      if (opts.onBackedUp) opts.onBackedUp();
    } catch (e) {
      if (e instanceof SyncError && (e.kind === "auth" || e.kind === "network")) throw e;
      /* 控えが作れなくても同期は成功として扱う */
    }
  }

  /* **ログインが切れても、次のタップで勝手にログイン画面を開かないこと（2.17.0で廃止）。**
     使っている途中に Google の画面が一瞬はさまり、何が起きたのか分からなかった。
     取り直すのは、画面のボタン（起動時の小窓・ヘッダーの雲・バックアップのカード）を押したときだけ */

  function classify(e) {
    if (e instanceof SyncError) return e;
    return new SyncError("drive", (e && e.message) || "同期に失敗しました");
  }

  async function runOnce(reason, interactive) {
    let token = auth.getStored();
    if (!token && !interactive) {
      /* 指の操作の外では取りにいかない（Googleの画面がだしぬけに開くのを防ぐ）。しるしを変えるだけ */
      setStatus({ phase: "needsAuth", message: "ログインが必要です" });
      return;
    }
    if (!token) {
      /* 起動の直後は、Googleの部品がまだ読み込み中のことがある。読み終わるのを待ってから取りにいく
         （指の操作の直後なら、数秒はポップアップを開ける） */
      if (auth.preload && auth.isReady && !auth.isReady()) await auth.preload();
      const r = await auth.request({ interactive, hint: cfg.email });
      token = r && r.token;
      if (!token) {
        const why = (r && r.why) || "";
        if (why === "noclient") { setStatus({ phase: "error", message: "クライアントIDが設定されていません" }); return; }
        if (why === "scope") { setStatus({ phase: "error", message: "Googleドライブへのアクセスを許可してください" }); return; }
        const denied = why === "access_denied" || why === "denied";
        /* 一度もログインできていない（初めての連携）ときに失敗したら、連携していない状態に戻す */
        if (interactive && !cfg.email && why !== "notready") {
          cfg.enabled = false; saveCfg();
          setStatus({ phase: "off", message: denied
            ? "Googleにログインを拒否されました。アプリのGoogle設定（公開状態）を確認してください"
            : "ログインできませんでした" });
          return;
        }
        setStatus({ phase: "needsAuth", message: why === "notready" ? "準備中です。もう一度押してください" : "ログインが完了しませんでした" });
        return;
      }
    }
    const drive = createDrive(fetchFn, () => auth.getStored() || token);
    setStatus({ phase: "syncing", message: "", askLogin: false });
    try {
      if (!cfg.email) {
        try { const u = await drive.about(); cfg.email = u.emailAddress || ""; saveCfg(); } catch (e) { if (e instanceof SyncError && e.kind === "auth") throw e; }
      }
      let ok = false;
      for (let i = 0; i < 3 && !ok; i++) ok = await cycle(drive, token);
      cfg.lastSyncAt = now();
      if (lastMoved.sent > 0) { cfg.sentN = lastMoved.sent; cfg.sentAt = cfg.lastSyncAt; }
      if (lastMoved.received > 0) { cfg.recvN = lastMoved.received; cfg.recvAt = cfg.lastSyncAt; }
      saveCfg();
      setStatus({ phase: "idle", message: "" });
      await refreshPending();
      if (!ok) scheduleSoon(); // 通信中に書きかえがあり続けた。少し置いてやり直す
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
    if (running) { queued = true; return running; }
    if (!interactive && now() - lastAuto < AUTO_MIN_GAP_MS && reason !== "manual") return Promise.resolve();
    if (!interactive) lastAuto = now();
    running = (async () => {
      try { await runOnce(reason || "auto", !!interactive); }
      finally {
        running = null;
        if (queued) { queued = false; scheduleSoon(); }
      }
    })();
    return running;
  }

  function scheduleSoon(ms) {
    clearTimeout(timer);
    timer = setTimeout(() => { syncNow({ reason: "auto" }); }, ms === undefined ? DEBOUNCE_MS : ms);
  }

  /* しばらく離れてから戻ったときは「開き直した」とみなし、ログインが切れていれば小窓を出す。
     すぐ戻ったとき（ほかのアプリをちらっと見ただけ）は出さない */
  const RESUME_ASK_MS = 3 * 60 * 1000;
  function onVisible(ev) {
    if (!opts.doc || opts.doc.visibilityState !== "visible") return;
    const away = hiddenAt ? now() - hiddenAt : 0;
    hiddenAt = 0;
    if (!cfg.enabled) return;
    if (!auth.getStored()) {
      if (away >= RESUME_ASK_MS) setStatus({ phase: "needsAuth", message: "ログインが必要です", askLogin: true });
      return;
    }
    if (now() - cfg.lastSyncAt > 30000 || (ev && ev.type === "online")) syncNow({ reason: "visible" });
  }
  function onHidden() {
    if (!opts.doc || opts.doc.visibilityState !== "hidden") return;
    hiddenAt = now();
    if (cfg.enabled && timer && auth.getStored()) { clearTimeout(timer); timer = null; syncNow({ reason: "hidden" }); }
  }

  return {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /* 画面に出す状態。**同じ中身のあいだは同じ object を返すこと**（useSyncExternalStore 向け） */
    getStatus() {
      const next = publicStatus();
      if (statusCache && stable(statusCache) === stable(next)) return statusCache;
      statusCache = next; return next;
    },
    /* Googleの部品を先に読んでおく。読み終わったら画面に知らせる（「接続」を押せる状態になる） */
    preload() { return auth.preload ? auth.preload().then((ok) => { setStatus({}); return ok; }) : Promise.resolve(true); },
    setClientId(id) { cfg.clientId = String(id || "").trim(); saveCfg(); setStatus({}); },
    setAutoBackup(on) { cfg.autoBackup = !!on; saveCfg(); setStatus({}); },
    /* 「接続」ボタンの中から呼ぶ。**awaitを挟まずに呼ぶこと**（ポップアップは指の操作の流れの中でしか開かない） */
    connect() {
      cfg.enabled = true; saveCfg();
      memBase = undefined;
      setStatus({ phase: "idle", message: "", askLogin: false });
      return syncNow({ reason: "manual", interactive: true });
    },
    syncManual() { return syncNow({ reason: "manual", interactive: !auth.getStored() }); },
    /* 起動時の小窓の「つなぎ直す」。指の操作の中から、await を挟まずに呼ぶこと */
    loginNow() { setStatus({ askLogin: false }); return syncNow({ reason: "manual", interactive: true }); },
    /* 起動時の小窓の「あとで」 */
    dismissLogin() { setStatus({ askLogin: false }); },
    /* 解除はログインなしでできること（Googleへは何も問い合わせない） */
    async disconnect() {
      memBase = undefined;
      cfg.enabled = false; cfg.email = ""; cfg.folderId = ""; cfg.lastSyncAt = 0; cfg.lastBackupDay = "";
      cfg.sentN = 0; cfg.sentAt = 0; cfg.recvN = 0; cfg.recvAt = 0; saveCfg();
      folderVerified = false; clearTimeout(timer); timer = null;
      const t = auth.getStored(); if (t) auth.revoke(t);
      auth.clear();
      try { await opts.kv.del(STATE_KEY); } catch (e) { /* noop */ }
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
      periodic = setInterval(() => { if (!opts.doc || opts.doc.visibilityState === "visible") { if (cfg.enabled && auth.getStored() && now() - cfg.lastSyncAt > PERIOD_MS - 1000) syncNow({ reason: "period" }); } }, 60000);
      if (cfg.enabled) {
        refreshPending();
        /* 起動したときにログインが切れていたら、ここで（起動の流れの中で）小窓を出してもらう */
        if (auth.getStored()) syncNow({ reason: "start" });
        else setStatus({ phase: "needsAuth", message: "ログインが必要です", askLogin: true });
      }
    },
    stop() {
      started = false; clearTimeout(timer); clearInterval(periodic);
      if (opts.doc) { opts.doc.removeEventListener("visibilitychange", onVisible); opts.doc.removeEventListener("visibilitychange", onHidden); }
      if (opts.win) opts.win.removeEventListener("online", onVisible);
    },
  };
}

/* 大きい控えの置き場（IndexedDB）。使えない端末では localStorage に置く */
export function createKV(ls) {
  const DB = "mytecho-sync-meta";
  let dbP = null;
  const open = () => {
    if (dbP) return dbP;
    dbP = new Promise((resolve) => {
      try {
        if (typeof indexedDB === "undefined") { resolve(null); return; }
        const req = indexedDB.open(DB, 1);
        const t = setTimeout(() => resolve(null), 4000);
        req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains("kv")) req.result.createObjectStore("kv"); };
        req.onsuccess = () => { clearTimeout(t); resolve(req.result); };
        req.onerror = () => { clearTimeout(t); resolve(null); };
        req.onblocked = () => { clearTimeout(t); resolve(null); };
      } catch (e) { resolve(null); }
    });
    return dbP;
  };
  const tx = (mode, fn) => open().then((db) => new Promise((resolve, reject) => {
    if (!db) { reject(new Error("nodb")); return; }
    try {
      const t = db.transaction("kv", mode);
      const r = fn(t.objectStore("kv"));
      t.oncomplete = () => resolve(r && "result" in r ? r.result : true);
      t.onerror = () => reject(t.error); t.onabort = () => reject(t.error);
    } catch (e) { reject(e); }
  }));
  const LK = "mt-gsync-kv-";
  return {
    async get(k) {
      try { const v = await tx("readonly", (s) => s.get(k)); return v === undefined ? null : v; }
      catch (e) { try { return JSON.parse(ls.getItem(LK + k) || "null"); } catch (e2) { return null; } }
    },
    async set(k, v) {
      try { await tx("readwrite", (s) => s.put(v, k)); }
      catch (e) { try { ls.setItem(LK + k, JSON.stringify(v)); } catch (e2) { /* noop */ } }
    },
    async del(k) {
      try { await tx("readwrite", (s) => s.delete(k)); } catch (e) { /* noop */ }
      try { ls.removeItem(LK + k); } catch (e) { /* noop */ }
    },
  };
}
