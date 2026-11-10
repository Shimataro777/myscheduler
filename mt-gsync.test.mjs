/* My手帳の同期エンジン（mt-gsync.js）の試験。  node mt-gsync.test.mjs
   本物のGoogleドライブの代わりに、同じ形で答える偽のドライブを使い、2〜3台の端末のふるまいを再現する */
import assert from "node:assert/strict";
import { createGoogleSync, mergeKeyed, mergeValue, DATA_FILE, BACKUP_PREFIX, SYNC_FOLDER } from "./mt-gsync.js";

/* ---------- 偽のGoogleドライブ ---------- */
function fakeDrive() {
  const files = new Map();
  let n = 0;
  let clock = Date.UTC(2026, 10, 1);
  const stamp = () => new Date((clock += 1000)).toISOString();
  const api = { files, calls: 0, failNext: null, readonlyAfter: null };
  const j = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
  api.fetch = async (url, init = {}) => {
    api.calls++;
    if (api.failNext) { const f = api.failNext; api.failNext = null; if (f === "net") throw new TypeError("fail"); return j({ error: { status: "X" } }, f); }
    const u = new URL(url);
    const method = (init.method || "GET").toUpperCase();
    const path = u.pathname;
    if (path === "/drive/v3/about") return j({ user: { emailAddress: "me@example.com" } });
    if (path === "/upload/drive/v3/files" || path.startsWith("/upload/drive/v3/files/")) {
      const body = String(init.body);
      const b = /boundary=(.+)$/.exec(init.headers["Content-Type"])[1];
      const parts = body.split("--" + b).filter((x) => x.trim() && x.trim() !== "--");
      const meta = JSON.parse(parts[0].split("\r\n\r\n")[1].replace(/\r\n$/, ""));
      const content = parts[1].split("\r\n\r\n").slice(1).join("\r\n\r\n").replace(/\r\n$/, "");
      if (method === "POST") {
        const id = "f" + ++n;
        files.set(id, { id, name: meta.name, parents: meta.parents, content, modifiedTime: stamp(), createdTime: stamp() });
        return j({ id, modifiedTime: files.get(id).modifiedTime });
      }
      const id = path.split("/").pop();
      const f = files.get(id);
      if (!f) return j({}, 404);
      f.content = content; if (meta.name) f.name = meta.name; f.modifiedTime = stamp();
      return j({ id, modifiedTime: f.modifiedTime });
    }
    if (path === "/drive/v3/files" && method === "POST") {
      const meta = JSON.parse(init.body);
      const id = "d" + ++n;
      files.set(id, { id, name: meta.name, mime: meta.mimeType, folder: true, createdTime: stamp(), modifiedTime: stamp() });
      return j({ id, name: meta.name });
    }
    if (path === "/drive/v3/files" && method === "GET") {
      const q = u.searchParams.get("q");
      let m = /^mimeType='application\/vnd\.google-apps\.folder' and name='(.+)' and trashed=false$/.exec(q);
      if (m) return j({ files: [...files.values()].filter((f) => f.folder && f.name === m[1] && !f.trashed) });
      m = /^'(.+)' in parents and trashed=false$/.exec(q);
      if (m) return j({ files: [...files.values()].filter((f) => !f.folder && f.parents && f.parents[0] === m[1]).map(({ content, ...r }) => r) });
      return j({}, 400);
    }
    const m = /^\/drive\/v3\/files\/(.+)$/.exec(path);
    if (m) {
      const f = files.get(m[1]);
      if (method === "DELETE") { if (!f) return j({}, 404); files.delete(m[1]); return new Response(null, { status: 204 }); }
      if (!f) return j({}, 404);
      if (u.searchParams.get("alt") === "media") return new Response(f.content, { status: 200 });
      return j({ id: f.id, trashed: !!f.trashed });
    }
    return j({}, 400);
  };
  return api;
}

/* ---------- 端末 ---------- */
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let CLOCK = Date.UTC(2026, 10, 9, 12, 0, 0);
function device(name, drive, opt = {}) {
  const st = {
    records: [], plans: [], kinds: [], folders: [], tags: [],
    prefs: { theme: "sky", fontSize: "s" },
  };
  const photos = new Map();
  const kvm = new Map();
  const dev = { name, st, photos, applied: 0, backedUp: 0, token: "tok", allow: true };
  dev.auth = {
    getStored: () => dev.token, clear: () => { dev.token = null; }, isReady: () => true, preload: async () => true,
    request: async ({ interactive }) => { if (dev.allow && (interactive || opt.silentOk)) { dev.token = "tok"; return { token: "tok" }; } return { token: null, why: "popup" }; },
    revoke: () => {},
  };
  dev.sync = createGoogleSync({
    fetch: (u, i) => drive.fetch(u, i), ls: mem(), kv: { get: async (k) => kvm.get(k) ?? null, set: async (k, v) => kvm.set(k, JSON.parse(JSON.stringify(v))), del: async (k) => kvm.delete(k) },
    auth: dev.auth, now: () => CLOCK,
    getSnapshot: async () => JSON.parse(JSON.stringify(st)),
    applySnapshot: async (m) => { dev.applied++; Object.assign(st, JSON.parse(JSON.stringify(m))); },
    listPhotoRefs: (s) => { const out = []; const walk = (v) => { if (typeof v === "string") { if (v.startsWith("photo:")) out.push(v.slice(6)); } else if (v && typeof v === "object") Object.values(v).forEach(walk); }; walk(s); return out; },
    photoHas: async (id) => photos.has(id), photoGet: async (id) => photos.get(id) ?? null, photoPut: async (id, d) => { photos.set(id, d); },
    buildBackupText: async () => "BACKUP " + JSON.stringify(st.records.map((r) => r.id)),
    onBackedUp: () => { dev.backedUp++; },
  });
  dev.sync.connect = dev.sync.connect.bind(dev.sync);
  dev.run = async () => { CLOCK += 60000; await dev.sync.syncManual(); return dev.sync.getStatus(); };
  return dev;
}
const rec = (id, text, extra = {}) => ({ id, type: "reading", text, createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z", ...extra });
const ids = (d) => d.st.records.map((r) => r.id).sort().join(",");

let pass = 0;
const test = async (name, fn) => { try { await fn(); pass++; console.log("  ok  " + name); } catch (e) { console.log("FAIL  " + name + "\n", e); process.exitCode = 1; } };

/* ---------- 純粋な混ぜ ---------- */
await test("mergeKeyed: 片方だけ変えた／両方変えた", () => {
  const A = { id: "1", v: "a", updatedAt: "1" };
  const A2 = { id: "1", v: "b", updatedAt: "2" };
  const A3 = { id: "1", v: "c", updatedAt: "3" };
  const { hashOf } = { hashOf: null };
  const g = (x) => x.id;
  const base = { 1: undefined };
  // base を作る
  const first = mergeKeyed({ local: [A], remote: [A], base: {}, tombs: {}, getId: g, now: 1 });
  base[1] = first.base[1];
  assert.equal(mergeKeyed({ local: [A2], remote: [A], base, tombs: {}, getId: g, now: 1 }).items[0].v, "b");
  assert.equal(mergeKeyed({ local: [A], remote: [A2], base, tombs: {}, getId: g, now: 1 }).items[0].v, "b");
  assert.equal(mergeKeyed({ local: [A2], remote: [A3], base, tombs: {}, getId: g, now: 1 }).items[0].v, "c"); // 新しいほう
  assert.equal(mergeKeyed({ local: [A3], remote: [A2], base, tombs: {}, getId: g, now: 1 }).items[0].v, "c");
});
await test("mergeValue: 初回はドライブ優先、あとは変えたほう", () => {
  assert.equal(mergeValue({ local: { a: 1 }, remote: { a: 2 }, remoteExists: true, baseHash: null, hasBase: false }).value.a, 2);
  assert.equal(mergeValue({ local: { a: 1 }, remote: { a: 2 }, remoteExists: false, baseHash: null, hasBase: false }).value.a, 1);
});

/* ---------- 端末どうし ---------- */
await test("初回：A→ドライブ→B。記録・設定・写真が届く", async () => {
  const drive = fakeDrive();
  const A = device("A", drive);
  A.st.records = [rec("r1", "one", { images: ["photo:p1"] }), rec("r2", "two")];
  A.st.prefs = { theme: "rose", fontSize: "l" };
  A.photos.set("p1", "data:image/png;base64,AAAA");
  await A.sync.connect();
  assert.equal(A.sync.getStatus().phase, "idle", A.sync.getStatus().message);
  assert.equal(A.sync.getStatus().email, "me@example.com");
  const folder = [...drive.files.values()].find((f) => f.folder && f.name === SYNC_FOLDER);
  assert.ok(folder);
  const names = [...drive.files.values()].filter((f) => !f.folder).map((f) => f.name).sort();
  assert.deepEqual(names, [BACKUP_PREFIX + "2026-11-09.json", DATA_FILE, "photo_p1.txt"].sort());
  const B = device("B", drive);
  await B.sync.connect();
  assert.equal(ids(B), "r1,r2");
  assert.equal(B.photos.get("p1"), "data:image/png;base64,AAAA");
  assert.equal(B.st.prefs.theme, "rose", "新しい端末は設定もドライブに合わせる");
  assert.equal(A.backedUp, 1);
});

await test("編集が届く／両方に書いても失われない", async () => {
  const drive = fakeDrive();
  const A = device("A", drive), B = device("B", drive);
  A.st.records = [rec("r1", "one")];
  await A.sync.connect(); await B.sync.connect();
  A.st.records[0] = { ...A.st.records[0], text: "one-A", updatedAt: "2026-11-02T00:00:00.000Z" };
  B.st.records.push(rec("r3", "three"));
  await A.run(); await B.run(); await A.run();
  assert.equal(ids(A), "r1,r3"); assert.equal(ids(B), "r1,r3");
  assert.equal(B.st.records.find((r) => r.id === "r1").text, "one-A");
});

await test("削除が届く。別端末で書き直していたら消さない", async () => {
  const drive = fakeDrive();
  const A = device("A", drive), B = device("B", drive);
  A.st.records = [rec("r1", "one"), rec("r2", "two"), rec("r3", "three")];
  await A.sync.connect(); await B.sync.connect();
  assert.equal(ids(B), "r1,r2,r3");
  // A が r1・r2 を消す。B は r2 を書き直す
  A.st.records = A.st.records.filter((r) => r.id === "r3");
  B.st.records = B.st.records.map((r) => (r.id === "r2" ? { ...r, text: "two-B", updatedAt: "2026-11-05T00:00:00.000Z" } : r));
  await A.run();
  await B.run();
  assert.equal(ids(B), "r2,r3", "r1は消え、書き直したr2は残る");
  await A.run();
  assert.equal(ids(A), "r2,r3", "AにもB側のr2が戻る");
  assert.equal(A.st.records.find((r) => r.id === "r2").text, "two-B");
});

await test("ドライブへの書き込みが失われても、端末の記録は消えない", async () => {
  const drive = fakeDrive();
  const A = device("A", drive), B = device("B", drive);
  A.st.records = [rec("r1", "one")];
  await A.sync.connect(); await B.sync.connect();
  const data = [...drive.files.values()].find((f) => f.name === DATA_FILE);
  const old = data.content;
  A.st.records.push(rec("r2", "two")); await A.run();   // r2 がドライブに載る
  data.content = old;                                    // …が、その書き込みが失われたことにする
  data.modifiedTime = new Date(Date.parse(data.modifiedTime) + 5000).toISOString();
  await A.run();
  assert.equal(ids(A), "r1,r2", "Aの記録は残る");
  await B.run();
  assert.equal(ids(B), "r1,r2", "ドライブにも戻って、Bに届く");
});

await test("3台目の新しい端末は消えた記録を復活させない", async () => {
  const drive = fakeDrive();
  const A = device("A", drive), B = device("B", drive);
  A.st.records = [rec("r1", "one"), rec("r2", "two")];
  await A.sync.connect(); await B.sync.connect();
  const stale = JSON.parse(JSON.stringify(B.st));       // Bの古い写し（まだr2がある）
  A.st.records = A.st.records.filter((r) => r.id !== "r2"); await A.run();
  const C = device("C", drive); Object.assign(C.st, stale);   // 古いデータを持った端末が初めて同期
  await C.sync.connect();
  assert.equal(ids(C), "r1", "消したことを知らない古い端末も、同じ中身なら消える");
});

await test("設定：片方の変更は届き、変えていない側は上書きしない", async () => {
  const drive = fakeDrive();
  const A = device("A", drive), B = device("B", drive);
  await A.sync.connect(); await B.sync.connect();
  A.st.prefs = { ...A.st.prefs, theme: "violet" }; await A.run();
  await B.run(); assert.equal(B.st.prefs.theme, "violet");
  B.st.tags = ["仕事", "家"]; await B.run();
  await A.run(); assert.equal(A.st.prefs.theme, "violet"); assert.deepEqual(A.st.tags, ["仕事", "家"]);
  A.st.tags = ["家", "仕事"]; await A.run();
  await B.run(); assert.deepEqual(B.st.tags, ["家", "仕事"], "タグの並べ替えも届く");
});

await test("変化が無ければ書き込まない（無限ループにならない）", async () => {
  const drive = fakeDrive();
  const A = device("A", drive);
  A.st.records = [rec("r1", "one")];
  await A.sync.connect();
  const data = [...drive.files.values()].find((f) => f.name === DATA_FILE);
  const mt = data.modifiedTime;
  await A.run(); await A.run();
  assert.equal(data.modifiedTime, mt);
  assert.equal(A.applied, 0);
});

await test("1日1回の控え。日が変われば新しい控え、8日目に最古を消す", async () => {
  const drive = fakeDrive();
  const A = device("A", drive);
  A.st.records = [rec("r1", "one")];
  await A.sync.connect();
  for (let i = 0; i < 8; i++) { CLOCK += 24 * 3600 * 1000; A.st.records.push(rec("x" + i, "t")); await A.run(); }
  const backups = [...drive.files.values()].filter((f) => f.name && f.name.startsWith(BACKUP_PREFIX));
  assert.equal(backups.length, 7);
  assert.equal(A.backedUp, 9);
});

await test("ログインが切れたら『再ログインが必要』。ログインし直せば再開", async () => {
  const drive = fakeDrive();
  const A = device("A", drive);
  A.st.records = [rec("r1", "one")];
  await A.sync.connect();
  A.allow = false; A.token = null;
  let s = await A.run();
  assert.equal(s.phase, "needsAuth");
  A.allow = true;
  s = await A.run();
  assert.equal(s.phase, "idle");
});

await test("401で needsAuth／通信断で offline、あとで回復", async () => {
  const drive = fakeDrive();
  const A = device("A", drive);
  await A.sync.connect();
  drive.failNext = 401; let s = await A.run(); assert.equal(s.phase, "needsAuth");
  A.allow = true; drive.failNext = "net"; s = await A.run(); assert.equal(s.phase, "offline");
  s = await A.run(); assert.equal(s.phase, "idle");
});

await test("壊れたドライブのデータは上書きしない", async () => {
  const drive = fakeDrive();
  const A = device("A", drive);
  A.st.records = [rec("r1", "one")];
  await A.sync.connect();
  const data = [...drive.files.values()].find((f) => f.name === DATA_FILE);
  data.content = "{broken"; data.modifiedTime = "2099-01-01T00:00:00.000Z";
  const s = await A.run();
  assert.equal(s.phase, "error");
  assert.equal(data.content, "{broken");
  assert.equal(ids(A), "r1");
});

await test("接続解除でドライブのデータは残り、再接続で合流する", async () => {
  const drive = fakeDrive();
  const A = device("A", drive);
  A.st.records = [rec("r1", "one")];
  await A.sync.connect();
  await A.sync.disconnect();
  assert.equal(A.sync.getStatus().phase, "off");
  assert.ok([...drive.files.values()].some((f) => f.name === DATA_FILE));
  A.st.records.push(rec("r2", "two"));
  await A.sync.connect();
  assert.equal(ids(A), "r1,r2");
});

await test("通信中に端末が書きかえられたら、上書きせずやり直す", async () => {
  const drive = fakeDrive();
  const A = device("A", drive), B = device("B", drive);
  A.st.records = [rec("r1", "one")];
  await A.sync.connect(); await B.sync.connect();
  B.st.records.push(rec("b1", "from-B")); await B.run();
  const realFetch = drive.fetch;
  let injected = false;
  drive.fetch = async (u, i) => {
    const r = await realFetch(u, i);
    if (!injected && String(u).includes("alt=media")) { injected = true; A.st.records.push(rec("a-live", "typed during sync")); }
    return r;
  };
  await A.run();
  assert.ok(injected);
  assert.ok(ids(A).includes("a-live"), "入力中の記録が消えない: " + ids(A));
  assert.ok(ids(A).includes("b1"), "Bの記録も届く: " + ids(A));
  drive.fetch = realFetch;
  await A.run(); await B.run();
  assert.equal(ids(B), ids(A));
});

await test("初めての連携でログインを拒否されたら、未連携に戻る。解除はログインなしでできる", async () => {
  const drive = fakeDrive();
  const A = device("A", drive);
  A.allow = false; A.token = null;
  let asked = 0;
  const req = A.auth.request; A.auth.request = async (o) => { asked++; return { token: null, why: "access_denied" }; };
  await A.sync.connect();
  const s = A.sync.getStatus();
  assert.equal(s.enabled, false);
  assert.equal(s.phase, "off");
  assert.match(s.message, /拒否/);
  // 古い版で「連携中のまま」になった端末を想定：解除してもログインを求めない
  A.sync.setAutoBackup(true);
  const before = asked;
  await A.sync.disconnect();
  assert.equal(asked, before);
  assert.equal(A.sync.getStatus().enabled, false);
  A.auth.request = req;
});

await test("2.17.0 ログインが切れていても、指の操作の外ではログイン画面を開かない。起動時は askLogin を立てる", async () => {
  const drive = fakeDrive();
  const A = device("A", drive);
  A.st.records = [rec("r1", "one")];
  await A.sync.connect();
  A.token = null;
  let asked = 0;
  const req = A.auth.request; A.auth.request = async (o) => { asked++; return req(o); };
  // 自動の同期（書きかえ・定期）では取りにいかない
  A.sync.start();
  await new Promise((r) => setTimeout(r, 10));
  try {
  let s = A.sync.getStatus();
  assert.equal(asked, 0, "起動時に勝手にログインしない");
  assert.equal(s.phase, "needsAuth");
  assert.equal(s.askLogin, true, "起動時はつなぎ直しの小窓を出す");
  A.st.records.push(rec("r2", "two"));
  A.sync.notifyChange();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(asked, 0, "書きかえてもログイン画面は開かない");
  assert.equal(A.sync.getStatus().pending, 1, "送っていない数が出る");
  // 「あとで」
  A.sync.dismissLogin();
  assert.equal(A.sync.getStatus().askLogin, false);
  // 押したときだけ取りにいく
  CLOCK += 60000;
  await A.sync.loginNow();
  s = A.sync.getStatus();
  assert.equal(asked, 1);
  assert.equal(s.phase, "idle");
  assert.equal(s.pending, 0, "送ったら0");
  assert.equal(s.sentN, 1, "送った数");
  } finally { A.sync.stop(); A.auth.request = req; }
});

await test("2.17.0 送っていない数・受け取った数", async () => {
  const drive = fakeDrive();
  const A = device("A", drive);
  const B = device("B", drive);
  A.st.records = [rec("r1", "one"), rec("r2", "two")];
  await A.sync.connect();
  A.sync.start();
  await B.sync.connect();
  B.sync.start();
  await new Promise((r) => setTimeout(r, 50)); // 起動時の同期が終わるのを待つ
  try {
  assert.equal(ids(B), "r1,r2");
  assert.equal(B.sync.getStatus().recvN, 2);
  // B で1件書きかえ・1件消す
  B.st.records = [{ ...B.st.records.find((r) => r.id === "r1"), text: "ONE", updatedAt: "2026-11-02T00:00:00.000Z" }];
  B.sync.notifyChange();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(B.sync.getStatus().pending, 2);
  let s = await B.run();
  assert.equal(s.pending, 0);
  assert.equal(s.sentN, 2);
  s = await A.run();
  assert.equal(s.recvN, 2);
  assert.equal(ids(A), "r1");
  } finally { A.sync.stop(); B.sync.stop(); }
});

await test("My手帳: 計画・種類・フォルダも届く。チェックだけ付けた記録（checkedAt）が新しいほうとして残る", async () => {
  const drive = fakeDrive();
  const A = device("A", drive), B = device("B", drive);
  A.st.plans = [{ id: "p1", name: "英語", steps: [], createdAt: "2026-11-01T00:00:00.000Z" }];
  A.st.kinds = [{ id: "k1", name: "読書" }];
  A.st.folders = [{ id: "f1", name: "旅", icon: "photo:ic1" }];
  A.photos.set("ic1", "data:image/png;base64,ICON");
  A.st.records = [rec("r1", "list", { items: [{ id: "i1", text: "a", done: false }] })];
  await A.sync.connect(); await B.sync.connect();
  assert.equal(B.st.plans[0].name, "英語"); assert.equal(B.st.kinds[0].name, "読書"); assert.equal(B.st.folders[0].name, "旅");
  assert.equal(B.photos.get("ic1"), "data:image/png;base64,ICON", "フォルダのアイコンの絵も届く");
  // A はチェックだけ（checkedAt が進む）、B は古い updatedAt のまま本文を書きかえ
  A.st.records[0] = { ...A.st.records[0], items: [{ id: "i1", text: "a", done: true }], checkedAt: "2026-11-09T00:00:00.000Z" };
  B.st.records[0] = { ...B.st.records[0], text: "list-B", updatedAt: "2026-11-03T00:00:00.000Z" };
  await B.run(); await A.run(); await B.run();
  assert.equal(A.st.records[0].items[0].done, true, "新しいチェックが勝つ");
  assert.equal(B.st.records[0].items[0].done, true);
});

console.log(`\n${pass} passed${process.exitCode ? " (失敗あり)" : ""}`);
