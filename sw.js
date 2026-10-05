/* ============================================================
   My手帳 Service Worker（2.24.0〜）
   電波がなくてもホーム画面から開けるように、本体のファイルを端末に置いておく。

   ・記録そのもの（IndexedDB / localStorage）には**触らない**。ここで扱うのは
     index.html・app.js・app.css・アイコンなど「アプリの本体」だけ
   ・版数は index.html の window.__MT_VERSION ひとつで決まる。
     index.html が "./sw.js?v=版数" で登録するので、ここで版数を書かないこと
   ・置いておくファイルは、index.html の中の src="./…" / href="./…" から拾う。
     ファイルを足しても、index.html から読み込んでいればここを直す必要はない
   詳しくは 引継書.md「6-⑯ 電波がなくても開ける（Service Worker）」
   ============================================================ */

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const APP_CACHE = "mt-app-" + VERSION;
/* 文字（Google Fonts）は版をまたいで使い回す。版を上げても消さない */
const FONT_CACHE = "mt-fonts-v1";
/* index.html から拾えないもの（manifest の中のアイコン） */
const EXTRA_FILES = ["./icon-192-v6.png", "./icon-512-v6.png"];
/* 電波が弱いとき、この時間だけ待って端末の控えに切り替える */
const NETWORK_WAIT_MS = 3000;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    /* cache: "reload" ＝ ブラウザの一時置き場を通さず、かならず最新を取りに行く */
    const res = await fetch("./index.html", { cache: "reload" });
    if (!res.ok) throw new Error("index.html を取れませんでした");
    const html = await res.clone().text();
    const files = new Set(EXTRA_FILES);
    for (const m of html.matchAll(/\b(?:src|href)="(\.\/[^"]+)"/g)) files.add(m[1]);
    /* 全部そろわなければ入れ替えない（addAll は1つでも失敗すると全体が失敗する）。
       そのときは前の版の控えがそのまま使われる */
    await cache.addAll([...files].map((u) => new Request(u, { cache: "reload" })));
    await cache.put("./index.html", res);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((n) => n.startsWith("mt-app-") && n !== APP_CACHE)
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === "navigate") event.respondWith(openPage());
    else if (!url.pathname.endsWith("/sw.js")) event.respondWith(appFile(req));
    return;
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(fontFile(req));
  }
  /* それ以外（YouTube のサムネイルなど）は、ふつうに取りに行く */
});

/* 画面そのもの：まず最新を取りに行き、だめなら（または遅ければ）端末の控え。
   **控え優先にしないこと。** 直した版が1回遅れて届き、「直ったのに変わらない」に見える。
   取ってきた index.html は控えに入れない。控えの index.html と app.js の版が
   食い違わないように、控えは install でまとめて作ったものだけを使う */
async function openPage() {
  const cached = () => caches.match("./index.html", { cacheName: APP_CACHE })
    .then((r) => r || caches.match("./index.html"));
  try {
    const res = await Promise.race([
      fetch("./index.html", { cache: "no-cache" }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NETWORK_WAIT_MS)),
    ]);
    if (res && res.ok) return res;
    return (await cached()) || res;
  }
  catch (err) {
    const c = await cached();
    if (c) return c;
    throw err;
  }
}

/* app.js・app.css・アイコン：端末の控えを先に使う。?v= が変われば別のファイルとして取りに行く */
async function appFile(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) {
    const cache = await caches.open(APP_CACHE);
    cache.put(req, res.clone());
  }
  return res;
}

/* 文字：一度取ったものは端末から。使った字の分だけ少しずつたまる */
async function fontFile(req) {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
  return res;
}
