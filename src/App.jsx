import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Plus, X, Check, Pencil, Trash2, ChevronLeft, ChevronRight, ChevronDown,
  Star, Menu, Tag, Clock, Link as LinkIcon, Image as ImageIcon,
  ListChecks, CalendarDays, StickyNote, Repeat, MapPin, Download, Upload,
  Copy, ClipboardPaste, Settings, ListTodo, Heart, AlertTriangle, Search,
  Target, Folder, FolderPlus, ArrowRightLeft, Palette, CalendarClock,
  GripVertical, CircleHelp, Layers, Pin, Filter, RotateCcw, Type as TypeIcon
} from "lucide-react";

/* ============================================================
   Hibi（ひび）— 日々の記録アプリ
   ・記録はすべてこの端末の中だけに保存される（外に送らない）
   ・作りは Footprints（聖書学習記録アプリ）の作法に合わせてある。
     手ざわりの演出（ft-*）・ドラム・カレンダー・小窓の決まりは
     そちらの引き継ぎ資料と同じものを踏襲すること
   ============================================================ */
const APP_NAME = "Hibi";
const KEY = (name) => `hibi-${name}`;

/* ============================================================
   保存まわり
   ・まず専用ストレージ、だめなら端末の localStorage へ、と二段構え
     （片方が使えない環境でも記録が消えないようにするため）
   ============================================================ */
async function storageGet(key) {
  try {
    if (typeof window !== "undefined" && window.storage && window.storage.get) {
      const res = await window.storage.get(key, false);
      if (res && typeof res.value === "string") return res.value;
    }
  } catch (e) { /* 次の手段へ */ }
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
async function storageSet(key, value) {
  let firstError = null;
  try {
    if (typeof window !== "undefined" && window.storage && window.storage.set) {
      await window.storage.set(key, value, false);
      try { localStorage.setItem(key, value); } catch (e) { /* 控えは失敗しても構わない */ }
      return { ok: true };
    }
  } catch (e) { firstError = e; }
  try { localStorage.setItem(key, value); return { ok: true }; }
  catch (e) {
    const err = firstError || e;
    return { ok: false, message: (err && err.message) ? err.message : String(err) };
  }
}

/* 壊れた中身でも必ず配列を返す。
   **この防御を外さないこと。** 保存された中身が配列でなかったり null が混ざったりすると
   r.map is not a function で画面が真っ白になり、操作もバックアップもできなくなる */
async function loadList(key, keep) {
  try {
    const raw = await storageGet(key);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter((x) => x && typeof x === "object" && !Array.isArray(x) && (!keep || keep(x)));
  } catch (e) { return []; }
}
async function saveList(key, list) {
  const res = await storageSet(key, JSON.stringify(list));
  if (!res.ok) console.error("保存に失敗しました", res.message);
  return res;
}

const REC_KEY = KEY("records");
const PLAN_KEY = KEY("plans");
const KIND_KEY = KEY("plankinds");
const FOLDER_KEY = KEY("folders");
const TAG_KEY = KEY("tags");
const PREF_KEY = KEY("prefs");
const DRAFT_KEY = KEY("draft");

/* ============================================================
   小さな道具
   ============================================================ */
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/* 端末の地域の日付を返す。
   **toISOString().slice(0,10) を日付として使い回さないこと。**
   世界標準時なので、日本では朝9時より前だと前日になる */
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const todayStr = () => ymd(new Date());
const parseYmd = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
const addDays = (s, n) => { const d = parseYmd(s) || new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const startOfWeek = (s) => { const d = parseYmd(s) || new Date(); d.setDate(d.getDate() - d.getDay()); return ymd(d); };
const daysBetween = (a, b) => {
  const da = parseYmd(a), db = parseYmd(b);
  if (!da || !db) return 0;
  return Math.round((db.setHours(0, 0, 0, 0) - da.setHours(0, 0, 0, 0)) / 86400000);
};
const WEEK_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const weekColor = (i) => (i === 0 ? "text-rose-600" : i === 6 ? "text-sky-700" : "text-neutral-500");
const dowOf = (s) => { const d = parseYmd(s); return d ? d.getDay() : 0; };
const fmtDate = (s) => { const d = parseYmd(s); return d ? `${d.getMonth() + 1}月${d.getDate()}日(${WEEK_LABELS[d.getDay()]})` : ""; };
const fmtDateFull = (s) => { const d = parseYmd(s); return d ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${WEEK_LABELS[d.getDay()]})` : ""; };
const fmtTime = (t) => (t || "");

/* ============================================================
   タグ
   ============================================================ */
const TAG_MAX = 24;
function normalizeTags(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  list.forEach((t) => {
    if (typeof t !== "string") return;
    const v = t.replace(/[\s　]+/g, " ").trim().slice(0, TAG_MAX);
    if (!v) return;
    if (!out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  });
  return out;
}
function allTagsOf(...groups) {
  const out = [];
  groups.forEach((list) => (list || []).forEach((r) => {
    normalizeTags(r && r.tags).forEach((t) => {
      if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
    });
  }));
  return out.sort((a, b) => a.localeCompare(b, "ja"));
}

/* ============================================================
   記録の種類
   色は種類ごとに固定。設定画面から選び直せる（prefs.typeColor）
   ============================================================ */
const TYPES = ["memo", "media", "checklist", "link", "schedule"];
/* 週や月ぜんたいに付けられる種類。予定は日に付くものなので入れない */
const SCOPED_TYPES = ["memo", "checklist", "link", "media"];
const TYPE_LABELS = {
  memo: "メモ", media: "画像", checklist: "チェックリスト",
  link: "リンク", schedule: "スケジュール",
};
const TYPE_ICON = {
  memo: <StickyNote size={22} />,
  media: <ImageIcon size={22} />,
  checklist: <ListChecks size={22} />,
  link: <LinkIcon size={22} />,
  schedule: <CalendarClock size={22} />,
};
const typeIcon = (t, size = 18) => React.cloneElement(TYPE_ICON[t] || TYPE_ICON.memo, { size });

/* 色見本。**色の数値を画面の部品に直接書かないこと。**
   ここから引いて style で当てる（テーマを変えたときに取り残しが出ないようにするため） */
const COLORS = [
  /* deep ＝ 字やしるしの色／mid ＝ 帯や線／soft ＝ 下じき／line ＝ ふちどり。
     **どれも濃くしすぎないこと。** 記録がいくつも並ぶので、
     一つひとつが強いと画面ぜんたいが騒がしくなる */
  { key: "teal", label: "緑", deep: "#2E9E80", mid: "#5FCBAE", soft: "#F2FBF8", line: "#CDEDE2" },
  { key: "sky", label: "水色", deep: "#3E96C8", mid: "#77C0E4", soft: "#F2F9FD", line: "#CDE7F6" },
  { key: "indigo", label: "青", deep: "#6272C7", mid: "#93A1E0", soft: "#F4F6FD", line: "#D8DEF6" },
  { key: "violet", label: "紫", deep: "#8A7BC8", mid: "#B3A6E3", soft: "#F7F5FD", line: "#E2DBF7" },
  { key: "rose", label: "赤", deep: "#D4788D", mid: "#EFA3B4", soft: "#FEF4F6", line: "#F8D9E0" },
  { key: "amber", label: "黄", deep: "#C08F3C", mid: "#E5BE72", soft: "#FDF8EF", line: "#F3E3C4" },
  { key: "green", label: "若草", deep: "#5AA05C", mid: "#8FC98F", soft: "#F4FAF4", line: "#D5EBD5" },
  { key: "slate", label: "墨", deep: "#6B7783", mid: "#9CA7B2", soft: "#F7F8FA", line: "#DFE4E9" },
];
const colorOf = (key) => COLORS.find((c) => c.key === key) || COLORS[0];
const DEFAULT_TYPE_COLOR = {
  memo: "slate", media: "violet", checklist: "teal", link: "sky", schedule: "rose",
};

/* テーマ色（画面ぜんたいの基調）。--th-* を差し替えると配色が一括で変わる */
const THEMES = [
  /* 画面の基調も淡く。**濃く沈んだ色にしないこと** */
  { key: "teal", label: "みどり", swatch: "#6FC7AC", vars: { 50: "#F4FBF8", 100: "#E4F5EE", 200: "#C6EBDD", 300: "#A2DEC9", 600: "#7FD0B7", 700: "#6FC7AC", 800: "#57B79B", 900: "#479B83" } },
  { key: "sky", label: "そら", swatch: "#87C4E4", vars: { 50: "#F4FAFD", 100: "#E5F2FA", 200: "#C9E5F5", 300: "#A5D3EC", 600: "#96CBE8", 700: "#87C4E4", 800: "#6FAFD2", 900: "#5C95B4" } },
  { key: "rose", label: "さくら", swatch: "#F0A6B4", vars: { 50: "#FEF6F7", 100: "#FCEAEE", 200: "#F8D3DA", 300: "#F4BBC6", 600: "#F2AFBC", 700: "#F0A6B4", 800: "#DC8F9E", 900: "#C07786" } },
  { key: "amber", label: "やまぶき", swatch: "#EFCB86", vars: { 50: "#FEFBF3", 100: "#FCF4E2", 200: "#F8E7C2", 300: "#F3D89F", 600: "#F1D191", 700: "#EFCB86", 800: "#D9B26B", 900: "#B99457" } },
  { key: "violet", label: "ふじ", swatch: "#BCA9DF", vars: { 50: "#F9F7FD", 100: "#F1ECFA", 200: "#E2D8F3", 300: "#CFC0EA", 600: "#C5B3E3", 700: "#BCA9DF", 800: "#A492CB", 900: "#8B79AF" } },
  { key: "slate", label: "はいいろ", swatch: "#9BA6B2", vars: { 50: "#F8F9FA", 100: "#F0F2F5", 200: "#E0E4E9", 300: "#C9D0D8", 600: "#A7B1BC", 700: "#9BA6B2", 800: "#86919D", 900: "#6F7984" } },
];

/* 大事な記録に付ける印。淡い色でそろえる */
const MARKS = [
  { key: "star", label: "星", icon: <Star size={15} />, color: "#EFCB86" },
  { key: "excl", label: "！", icon: <AlertTriangle size={15} />, color: "#F2A0AC" },
  { key: "heart", label: "ハート", icon: <Heart size={15} />, color: "#E7A9CE" },
];
const markOf = (key) => MARKS.find((m) => m.key === key) || null;

/* ============================================================
   設定
   ============================================================ */
const DEFAULT_PREFS = {
  theme: "teal",
  motion: true,
  fontSize: "s",
  typeColor: { ...DEFAULT_TYPE_COLOR },
  typeName: {},          // 記録の種類の呼び名を変えたいとき
  showWeekNumbers: false,
  weekStart: 0,          // 0＝日曜はじまり
  lastBackup: null,
  headerPhoto: "",       // 見出しの帯に敷く写真（photo:番号）。空なら色だけ
};
const FONT_SIZES = [{ key: "s", label: "小" }, { key: "m", label: "中" }, { key: "l", label: "大" }];

async function loadPrefs() {
  try {
    const raw = await storageGet(PREF_KEY);
    const p = raw ? JSON.parse(raw) : {};
    return {
      ...DEFAULT_PREFS, ...(p && typeof p === "object" ? p : {}),
      typeColor: { ...DEFAULT_TYPE_COLOR, ...((p && p.typeColor) || {}) },
      typeName: { ...((p && p.typeName) || {}) },
    };
  } catch (e) { return { ...DEFAULT_PREFS, typeColor: { ...DEFAULT_TYPE_COLOR }, typeName: {} }; }
}
const persistPrefs = (p) => storageSet(PREF_KEY, JSON.stringify(p));

/* 種類の呼び名。**「メモ」などを文字で直接書かないこと。**
   設定で名前を変えたとき、そこだけ古い名前が残る */
const TypeNameContext = React.createContext(TYPE_LABELS);
const useTypeNames = () => React.useContext(TypeNameContext) || TYPE_LABELS;
const PrefsContext = React.createContext(null);
const ColorContext = React.createContext(DEFAULT_TYPE_COLOR);

/* 札の中から使う受け渡し（持ち越しなど）。
   画面をいくつも通して手渡すと数が増えて追えなくなるので、ここでまとめる */
const RecordActionsContext = React.createContext(null);
function useTypeColor(type) {
  const map = React.useContext(ColorContext) || DEFAULT_TYPE_COLOR;
  return colorOf(map[type] || DEFAULT_TYPE_COLOR[type]);
}

/* ============================================================
   記録
   共通： id / type / tags / date / time / mark / comment / planId
   ============================================================ */
/* scope ＝ その記録が「いつ」に付くか。
   "day"（ふつうの日の記録）／"week"（その週ぜんたい）／"month"（その月ぜんたい）。
   week のときは date に週のはじめの日、month のときはその月の1日を入れる。 */
/* pinned ＝ 上に固定。大事なものを、その日や計画のいちばん上に置いておける */
function emptyRecord(type, date, scope) {
  const base = {
    id: uid(), type, tags: [], date: date || todayStr(), time: null,
    scope: scope || "day",
    pinned: false,
    /* fromRepeat ＝ 繰り返しから生まれた実体。もとの記録のid。
       **これを付け忘れないこと。** 同じ日に何枚も作られてしまう */
    fromRepeat: "",
    mark: null, comment: "", planId: null,
    createdAt: new Date().toISOString(), updatedAt: null,
  };
  if (type === "memo") return { ...base, text: "" };
  if (type === "media") return { ...base, text: "", images: [] };
  if (type === "checklist") return { ...base, title: "", items: [], repeat: { freq: "none", days: [], until: "" } };
  if (type === "link") return { ...base, url: "", title: "" };
  if (type === "schedule") return { ...base, title: "", allDay: false, endDate: "", endTime: "", body: "", place: "", placeUrl: "" };
  return base;
}

/* 保存された記録を、いまの形にそろえる。
   項目を増やしたときは必ずここにも足すこと（足さないと古い記録で undefined になる） */
function migrateRecord(r) {
  if (!r || typeof r !== "object") return null;
  const type = TYPES.includes(r.type) ? r.type : "memo";
  const out = {
    ...emptyRecord(type, r.date || todayStr()),
    ...r,
    type,
    tags: normalizeTags(r.tags),
    comment: typeof r.comment === "string" ? r.comment : "",
    mark: markOf(r.mark) ? r.mark : null,
    scope: (r.scope === "week" || r.scope === "month") ? r.scope : "day",
    pinned: !!r.pinned,
    fromRepeat: String(r.fromRepeat || ""),
    id: r.id || uid(),
  };
  if (type === "checklist") {
    out.items = Array.isArray(r.items)
      ? r.items.filter((i) => i && typeof i === "object").map((i) => ({ id: i.id || uid(), text: String(i.text || ""), done: !!i.done }))
      : [];
    out.repeat = (r.repeat && typeof r.repeat === "object")
      ? { freq: r.repeat.freq || "none", days: Array.isArray(r.repeat.days) ? r.repeat.days : [], until: String(r.repeat.until || "") }
      : { freq: "none", days: [], until: "" };
  }
  if (type === "media") out.images = Array.isArray(r.images) ? r.images.filter((s) => typeof s === "string") : [];
  return out;
}

/* 記録に含まれるすべての文字。検索の土台 */
function recordAllText(r) {
  if (!r) return "";
  const parts = [r.title, r.text, r.comment, r.url, r.body, r.place, r.placeUrl, ...(r.tags || [])];
  if (Array.isArray(r.items)) r.items.forEach((i) => parts.push(i.text));
  return parts.filter(Boolean).join("\n");
}

/* 一覧に出す見出し */
function recordTitle(r, names) {
  const N = names || TYPE_LABELS;
  if (!r) return "";
  if (r.type === "schedule" || r.type === "checklist") return r.title || N[r.type] || TYPE_LABELS[r.type];
  if (r.type === "link") return r.title || r.url || N.link;
  const t = (r.text || "").trim().split("\n")[0];
  return t || (N[r.type] || TYPE_LABELS[r.type]);
}

/* タイムラインの並び順。
   時刻のあるものが先（時間順）、時刻なしはそのあと（作った順） */
function timeRank(r) {
  if (r.type === "schedule" && r.allDay) return -1;      // 終日はいちばん上
  if (r.time) return Number(r.time.slice(0, 2)) * 60 + Number(r.time.slice(3, 5));
  return 100000;
}
/* 並び順。**固定したものを、まっ先に出すこと。**
   そのあとは、時刻のあるものが時間順、時刻のないものが後ろ */
function compareTimeline(a, b) {
  if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
  const ra = timeRank(a), rb = timeRank(b);
  if (ra !== rb) return ra - rb;
  return (a.createdAt || "").localeCompare(b.createdAt || "");
}

/* チェックリストの達成度 */
function doneRatio(r) {
  const items = (r && r.items) || [];
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, ratio: items.length ? done / items.length : 0 };
}

/* 繰り返しの設定から、実際に出す日を数える */
const REPEATS = [
  { key: "none", label: "なし" },
  { key: "daily", label: "毎日" },
  { key: "weekly", label: "毎週（曜日を指定）" },
  { key: "monthly", label: "毎月（同じ日）" },
];
/* 繰り返しの言い方。**ここ1か所で決めること**（画面ごとに書くと食い違う） */
function repeatLabel(rep) {
  if (!rep || rep.freq === "none") return "なし";
  let base = "";
  if (rep.freq === "daily") base = "毎日";
  else if (rep.freq === "monthly") base = "毎月";
  else if (rep.freq === "weekly") {
    const days = (rep.days || []).slice().sort((a, b) => a - b);
    base = days.length ? "毎週 " + days.map((i) => WEEK_LABELS[i]).join("・") : "毎週";
  } else return "なし";
  /* 終わりを決めているときは、それも一緒に見せる */
  if (rep.until) base += `・${Number(rep.until.slice(5, 7))}/${Number(rep.until.slice(8, 10))}まで`;
  return base;
}

/* その記録が「ふつうの日の記録」かどうか。
   週ぜんたい・月ぜんたいの記録は、日のタイムラインには出さない */
const isDayRec = (r) => !r.scope || r.scope === "day";

/* その週のはじめの日（日曜はじまり）と、その月のついたち */
function weekKeyOf(date) { return startOfWeek(date); }
function monthKeyOf(date) { return String(date || todayStr()).slice(0, 7) + "-01"; }

/* 繰り返しの記録が、その日に出るかどうか */
function repeatsOn(r, date) {
  const rep = r && r.repeat;
  if (!rep || rep.freq === "none" || !r.date) return false;
  if (date <= r.date) return false;
  /* 終わりの日を決めていたら、それより先には出さない */
  if (rep.until && date > rep.until) return false;
  const base = parseYmd(r.date), d = parseYmd(date);
  if (!base || !d) return false;
  if (rep.freq === "daily") return true;
  if (rep.freq === "weekly") {
    const days = (rep.days && rep.days.length) ? rep.days : [base.getDay()];
    return days.includes(d.getDay());
  }
  if (rep.freq === "monthly") return base.getDate() === d.getDate();
  return false;
}

/* ============================================================
   計画
   ============================================================ */
function emptyPlan(kindId) {
  return {
    id: uid(), kindId: kindId || null, name: "", color: "teal", note: "",
    steps: [],    // 2段のチェックリスト {id,title,dueDate,done,items:[{id,text,done}]}
    pinned: false, // 上に固定（いちばん上に出す）
    doneAt: "",    // やり遂げた日（空なら、まだ進行中）
    createdAt: new Date().toISOString(),
  };
}
function migratePlan(p) {
  if (!p || typeof p !== "object") return null;
  return {
    ...emptyPlan(p.kindId), ...p,
    /* 古いつくり（goals）で保存したものも、そのまま読めるようにしておく */
    steps: (Array.isArray(p.steps) ? p.steps : Array.isArray(p.goals) ? p.goals : [])
      .filter((g) => g && typeof g === "object").map((g) => ({
        id: g.id || uid(), title: String(g.title || ""), dueDate: g.dueDate || "",
        done: !!g.done,
        items: Array.isArray(g.items) ? g.items.filter((i) => i && typeof i === "object")
          .map((i) => ({ id: i.id || uid(), text: String(i.text || ""), done: !!i.done })) : [],
      })),
    pinned: !!p.pinned,
    doneAt: typeof p.doneAt === "string" ? p.doneAt : "",
    id: p.id || uid(),
  };
}

/* 2段のチェックリストが達成かどうか。
   中の小さな項目がぜんぶ済んでいれば達成。項目がなければ上の段のチェックで決める */
function stepDone(s) {
  const items = (s && s.items) || [];
  if (items.length) return items.every((i) => i.done);
  return !!(s && s.done);
}



/* ============================================================
   フォルダ
   ・tags … このタグが付いた記録を自動で集める（どれかに当てはまれば入る）
   ・types … 集める記録の種類を絞りたいとき
   ・picked … 手で選んで入れた記録
   ============================================================ */
function emptyFolder(name) {
  /* picked ＝ 手で入れた記録。excluded ＝ 手で外した記録（タグで入ってきたものも外せる） */
  return { id: uid(), name: name || "", tags: [], types: [], picked: [], excluded: [], createdAt: new Date().toISOString() };
}
function migrateFolder(f) {
  if (!f || typeof f !== "object") return null;
  return {
    ...emptyFolder(f.name), ...f,
    tags: normalizeTags(f.tags),
    types: Array.isArray(f.types) ? f.types.filter((t) => TYPES.includes(t)) : [],
    picked: Array.isArray(f.picked) ? f.picked.filter((x) => typeof x === "string") : [],
    excluded: Array.isArray(f.excluded) ? f.excluded.filter((x) => typeof x === "string") : [],
    id: f.id || uid(),
  };
}
/* フォルダに入る記録を集める。自動で集めたものと、手で選んだものを合わせる */
function folderRecords(folder, records) {
  if (!folder) return [];
  const tags = normalizeTags(folder.tags).map((t) => t.toLowerCase());
  const types = folder.types || [];
  const picked = new Set(folder.picked || []);
  const out = new Set(folder.excluded || []);
  /* タグと種類は、どちらか片方だけでも集められる。
     **タグが空だと何も集めない、という作りにしないこと。**
     「メモだけ集める」といった使い方ができなくなる */
  const hasCond = tags.length > 0 || types.length > 0;
  return records.filter((r) => {
    if (out.has(r.id)) return false;
    if (picked.has(r.id)) return true;
    if (!hasCond) return false;
    if (types.length && !types.includes(r.type)) return false;
    if (tags.length && !normalizeTags(r.tags).some((t) => tags.includes(t.toLowerCase()))) return false;
    return true;
  });
}

/* ============================================================
   画像を縮めてから保存する（端末の容量を圧迫しないため）
   ============================================================ */
/* ============================================================
   写真の置き場（IndexedDB）
   **写真を記録の中に文字のまま持たないこと。**
   端末がふつうに置ける量（5MBほど）をすぐ超えて、保存できなくなる。
   記録には「photo:番号」だけを持たせ、絵の中身はここに置く
   ============================================================ */
const PHOTO_DB = "hibi-photos";
const PHOTO_STORE = "photos";
const photoCache = new Map();   // 一度読んだ絵は覚えておく（何度も読みに行かない）
let photoDbPromise = null;

function photoDB() {
  if (photoDbPromise) return photoDbPromise;
  photoDbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") { resolve(null); return; }
      const req = indexedDB.open(PHOTO_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PHOTO_STORE)) db.createObjectStore(PHOTO_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
  return photoDbPromise;
}

function photoTx(mode, fn) {
  return photoDB().then((db) => {
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(PHOTO_STORE, mode);
        const store = tx.objectStore(PHOTO_STORE);
        const req = fn(store);
        tx.oncomplete = () => resolve(req && "result" in req ? req.result : true);
        tx.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  });
}

const isPhotoRef = (s) => typeof s === "string" && s.slice(0, 6) === "photo:";
async function photoPut(id, dataUrl) {
  photoCache.set(id, dataUrl);
  return photoTx("readwrite", (st) => st.put(dataUrl, id));
}
async function photoGet(id) {
  if (photoCache.has(id)) return photoCache.get(id);
  const v = await photoTx("readonly", (st) => st.get(id));
  if (typeof v === "string") { photoCache.set(id, v); return v; }
  return null;
}
async function photoDel(id) {
  photoCache.delete(id);
  return photoTx("readwrite", (st) => st.delete(id));
}

/* 記録の中の写真を、置き場へ移す。**保存の前に必ず通すこと** */
async function stashPhotos(rec) {
  const imgs = rec && rec.images;
  if (!Array.isArray(imgs) || !imgs.length) return rec;
  const out = [];
  for (const src of imgs) {
    if (isPhotoRef(src)) { out.push(src); continue; }
    const id = "ph_" + uid();
    const res = await photoPut(id, src);
    /* 置き場が使えない端末では、これまでどおり記録の中に持つ */
    out.push(res === null ? src : "photo:" + id);
  }
  return { ...rec, images: out };
}

/* 使われなくなった写真を片づける */
async function sweepPhotos(records) {
  const used = new Set();
  (records || []).forEach((r) => (r.images || []).forEach((s) => { if (isPhotoRef(s)) used.add(s.slice(6)); }));
  const all = await photoTx("readonly", (st) => st.getAllKeys());
  if (!Array.isArray(all)) return;
  for (const k of all) if (!used.has(k)) await photoDel(k);
}

/* 写真1枚のおよその重さ：長辺900px・webp0.72 で 40〜80KB ほど。
   **これ以上大きくしないこと。** 端末の保存できる量（5MBほど）はすぐ埋まる */
function shrinkImage(file, maxSide = 900) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("読み込めませんでした"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("画像として読めませんでした"));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        const ctx = cv.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        let out = "";
        try { out = cv.toDataURL("image/webp", 0.72); } catch (e) { out = ""; }
        if (!out || out.length < 40 || out.indexOf("image/webp") < 0) out = cv.toDataURL("image/jpeg", 0.72);
        resolve(out);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* いま端末に置いてある量（およそのバイト数）。
   写真は文字にして持っているので、枚数が増えると効いてくる */
/* いま使っている量。写真は別の置き場にあるので、記録の重さとは分けて数える */
function usedBytes(records) {
  let all = 0, n = 0;
  (records || []).forEach((r) => {
    all += JSON.stringify(r).length;
    n += (r.images || []).length;
  });
  return { all, photos: n };
}
const fmtBytes = (n) => (n > 900000 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);

/* 端末がどれくらい置かせてくれるか、いまどれだけ使っているか。
   **数を決め打ちしないこと。** 端末と空き容量で大きく変わる */
async function storageRoom() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      if (e && e.quota) return { used: e.usage || 0, quota: e.quota };
    }
  } catch (err) { /* 分からない端末もある */ }
  return null;
}
/* 「消さないでほしい」と端末にお願いしておく。
   iPhone は、ホーム画面に追加していないと、しばらく使わないだけで消されることがある */
async function askPersist() {
  try {
    if (navigator.storage && navigator.storage.persist && navigator.storage.persisted) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (err) { /* 使えない端末は、そのまま */ }
  return false;
}
/* 写真1枚のおよその重さ（長辺900px・webp0.72）。目安を出すのに使う */
const PHOTO_BYTES = 130 * 1024;

/* ============================================================
   バックアップに合言葉のカギをかける
   **中身をそのまま書き出したファイルは、開けば全部読める。**
   人に見られたくない記録もあるので、合言葉でロックできるようにしてある。
   仕組みは、端末に元から入っている暗号の道具（Web Crypto）。
   合言葉から鍵を作り（PBKDF2・15万回）、中身を包む（AES-GCM）。
   **合言葉を忘れると、二度と開けない。** 画面でも必ずそう伝えること
   ============================================================ */
const LOCK_APP = "hibi-locked";
const b64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};
const unb64 = (s) => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};
function cryptoOk() {
  return typeof crypto !== "undefined" && crypto.subtle && typeof TextEncoder !== "undefined";
}
async function keyFrom(pass, salt) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function lockText(text, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(pass, salt);
  const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  return JSON.stringify({
    app: LOCK_APP, version: 1, lockedAt: new Date().toISOString(),
    note: "このファイルは合言葉でロックされています。Hibi の「読み込む」から開いてください。",
    salt: b64(salt), iv: b64(iv), body: b64(buf),
  }, null, 2);
}
async function unlockText(obj, pass) {
  const key = await keyFrom(pass, unb64(obj.salt));
  const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(obj.iv) }, key, unb64(obj.body));
  return new TextDecoder().decode(buf);
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* 古い方式へ */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (e) { return false; }
}

/* ============================================================
   共通の見た目
   ・入力欄の文字は必ず16px以上（.ft-input）。
     iPhoneのSafariは、16pxより小さい入力欄に触れると画面を勝手に拡大する
   ・ボタンの高さは .btn-h（40px）を下限にする。これより低くしないこと
   ============================================================ */
const inputCls = "w-full rounded-xl bg-white border border-neutral-200 px-3.5 py-3 ft-input leading-normal text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-4 focus:ring-th-800/20 focus:border-th-800 h-[52px]";
const SAFE_TOP = (extra) => ({ paddingTop: `calc(env(safe-area-inset-top) + ${extra}px)` });
const SAFE_BOTTOM = (extra) => ({ paddingBottom: `calc(env(safe-area-inset-bottom) + ${extra}px)` });

const BTN_H = "btn-h";
/* 沈み方はグローバルCSSの .ft-tap にまとめてある。
   ボタンごとに active:scale-… を書かないこと（少しずつ深さや速さがずれていく） */
const BTN_BASE = "rounded-xl font-bold flex items-center justify-center gap-1.5 disabled:opacity-40 ft-tap";
const BTN_PRIMARY = BTN_BASE + " bg-th-800 text-white hover:bg-th-900";
const BTN_SECONDARY = BTN_BASE + " bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50";
const BTN_DANGER = BTN_BASE + " bg-rose-700 text-white hover:bg-rose-800";
const BTN_DANGER_SOFT = BTN_BASE + " bg-white border border-rose-200 text-rose-700 hover:bg-rose-50";
const BTN_QUIET = BTN_BASE + " text-neutral-500 hover:bg-neutral-100";

function TextInput(props) { return <input {...props} className={inputCls + " " + (props.className || "")} />; }

/* bare ＝ 枠なしの書き味。メモ本文のように、紙に書くように使う欄で使う。
   **枠を消すのに border-0 を足さないこと。** もとの枠の指定と重なって
   どちらが勝つか分からなくなるので、はじめから付けない形にしてある */
function TextArea({ value, onChange, className, minRows, bare, ...rest }) {
  const ref = useRef(null);
  /* 中身に合わせて高さを測り直す。
     測るときに一度 height を auto に戻すが、そのあいだ欄が縮むため、
     何もしないとまわりの巻き物（スクロール位置）が動いてしまう。
     測る前に位置を覚えておき、直後に戻すこと */
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    const holders = [];
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (p.scrollHeight > p.clientHeight + 1) holders.push([p, p.scrollTop]);
    }
    const winY = typeof window !== "undefined" ? window.scrollY : 0;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
    holders.forEach(([p, top]) => { if (p.scrollTop !== top) p.scrollTop = top; });
    if (typeof window !== "undefined" && window.scrollY !== winY) window.scrollTo(0, winY);
  };
  useEffect(() => { resize(); }, [value]);
  const style = minRows ? { minHeight: `${minRows * 1.7 + 1.5}em` } : undefined;
  /* rows={1} は必ず付けること。
     textarea は何も指定しないと「2行ぶん」の高さから始まり、
     1行だけの欄が、となりの入力欄より2〜3割ほど背が高く見えてしまう */
  const base = bare
    ? "w-full bg-transparent ft-input leading-relaxed text-neutral-900 placeholder-neutral-400 focus:outline-none"
    : inputCls;
  return <textarea ref={ref} rows={1} value={value} onChange={onChange} onInput={resize} style={style}
    className={base + " resize-none overflow-hidden " + (className || "")} {...rest} />;
}

/* 入力のひと区切り。
   **記録の入力画面では、項目名も説明も出さないこと。**
   何を書く欄かは、欄の中の薄い字（placeholder）で分かるようにしてある。
   説明を並べると、書きたいことより先に字を読むことになって手が止まる。
   label は設定画面など、記録以外の場所でだけ使う */
function Field({ label, children, className }) {
  return (
    <div className={"block mb-4 " + (className || "")}>
      {label && (
        <span className="block text-[13.5px] font-bold text-neutral-700 mb-1.5 tracking-wide">{label}</span>
      )}
      {children}
    </div>
  );
}

/* 写真を出す小さな部品。
   記録には「photo:番号」しか入っていないので、置き場から絵を読んでくる。
   **img の src に、そのまま「photo:…」を渡さないこと。**（絵が出ない） */
function usePhotoSrc(src) {
  const [url, setUrl] = useState(() => (isPhotoRef(src) ? (photoCache.get(src.slice(6)) || "") : src || ""));
  useEffect(() => {
    let alive = true;
    if (!isPhotoRef(src)) { setUrl(src || ""); return undefined; }
    const cached = photoCache.get(src.slice(6));
    if (cached) { setUrl(cached); return undefined; }
    photoGet(src.slice(6)).then((v) => { if (alive) setUrl(v || ""); });
    return () => { alive = false; };
  }, [src]);
  return url;
}

function Photo({ src, className, style, alt = "" }) {
  const url = usePhotoSrc(src);
  if (!url) return <span className={"block bg-neutral-100 " + (className || "")} style={style} />;
  return <img src={url} alt={alt} className={className} style={style} />;
}

/* iPhoneの設定でおなじみの、入り切りのつまみ */
function Switch({ on, onChange, label }) {
  return (
    /* つまみの見た目は52×32だが、**押せる範囲は44px以上にすること。**
       小さいと、指がすべって切り替わらない */
    <button type="button" role="switch" aria-checked={!!on} aria-label={label}
      onClick={() => onChange(!on)}
      className="shrink-0 flex items-center justify-end ft-tap"
      style={{ minHeight: 44, minWidth: 60 }}>
      <span className="block rounded-full" style={{
        width: 52, height: 32, padding: 3,
        background: on ? "var(--th-700)" : "#D4D4D4",
        transition: "background 200ms cubic-bezier(0.16,1,0.3,1)",
      }}>
        <span className="block rounded-full bg-white shadow-sm"
          style={{ width: 26, height: 26, transform: on ? "translateX(20px)" : "none", transition: "transform 200ms cubic-bezier(0.16,1,0.3,1)" }} />
      </span>
    </button>
  );
}

/* 白い箱にならぶ一行（左に名前、右に操作）。
   日時のように「何の日時か」を言わないと分からないところだけで使う */
/* 設定のような1行。**縦を詰めないこと。**
   iPhoneのカレンダーと同じくらい（64px）ないと、指がねらいを外す */
function SheetRow({ label, children, last }) {
  return (
    <div className={"flex items-center gap-3 px-4 py-2 min-h-[64px] " + (last ? "" : "border-b border-neutral-200")}>
      <span className="text-[16px] text-neutral-900 shrink-0">{label}</span>
      <span className="flex-1" />
      {children}
    </div>
  );
}
function RowCard({ children, className }) {
  return <div className={"bg-white rounded-2xl border border-neutral-200 overflow-hidden " + (className || "")}>{children}</div>;
}

/* ============================================================
   「？」を押したときだけ出る説明
   画面に説明文を出しっぱなしにすると、慣れた人には邪魔になる。
   吹き出しは position:fixed。入力欄は縦に流れる箱の中なので、
   その中に置くと端が切れてしまう
   ============================================================ */
function HelpTip({ text, label }) {
  const btnRef = useRef(null);
  const [box, setBox] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef([]);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => clearTimers(), []);

  const close = useCallback(() => {
    clearTimers();
    setLeaving(true);
    timers.current.push(setTimeout(() => { setBox(null); setLeaving(false); }, 200));
  }, []);

  const open = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const W = 240;
    const vw = window.innerWidth || 360;
    let left = r.left + r.width / 2 - W / 2;
    left = Math.max(12, Math.min(left, vw - W - 12));
    clearTimers();
    setLeaving(false);
    setBox({ left, top: r.bottom + 8, width: W, arrow: r.left + r.width / 2 - left });
    /* 時間では消さない。読み終わる速さは人それぞれなので、
       消すのは「周りを触ったとき」と「もう一度押したとき」だけ */
  };

  useEffect(() => {
    if (!box || leaving) return;
    const onDown = (e) => { if (btnRef.current && btnRef.current.contains(e.target)) return; close(); };
    /* 開いたそのひと押しで閉じてしまわないよう、ひと呼吸おいてから聞き始める */
    const id = setTimeout(() => {
      document.addEventListener("pointerdown", onDown, true);
      window.addEventListener("scroll", close, true);
      window.addEventListener("resize", close);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [box, leaving, close]);

  const shown = !!box && !leaving;
  return (
    <>
      <button ref={btnRef} type="button" aria-label={label ? `${label}の説明` : "説明を見る"} aria-expanded={shown}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); shown ? close() : open(); }}
        onContextMenu={(e) => e.preventDefault()}
        className={"shrink-0 border flex items-center justify-center font-bold leading-none ft-tap ft-tap-icon "
          + (shown ? "border-th-800 bg-th-800 text-white" : "border-neutral-300 bg-white text-neutral-400")}
        style={{ width: 18, height: 18, borderRadius: 9999, fontSize: 11 }}>?</button>
      {box && (
        /* 重なり順は指定（style）で直接与える。クラス任せにすると、
           あとに置かれた箱の下に潜り込むことがある */
        <span className={"fixed pointer-events-none " + (leaving ? "ft-tip-out" : "ft-tip")}
          style={{ left: box.left, top: box.top, width: box.width, zIndex: 2147483000 }}>
          <span className="absolute -top-1.5 w-3 h-3 rotate-45 bg-neutral-900 rounded-[2px]"
            style={{ left: Math.max(8, Math.min(box.arrow - 6, box.width - 20)) }} />
          <span className="relative block rounded-xl bg-neutral-900 text-white text-[12.5px] leading-relaxed px-3 py-2.5 shadow-xl">{text}</span>
        </span>
      )}
    </>
  );
}

/* 押すとひと呼吸おいてから画面が変わる。押した手ごたえを見せるため */
function useTapThen(fn, ms = 60) {
  const [pressed, setPressed] = useState(false);
  const t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);
  const run = useCallback((...args) => {
    if (!fn || pressed) return;
    setPressed(true);
    t.current = setTimeout(() => { fn(...args); setPressed(false); }, ms);
  }, [fn, pressed, ms]);
  return [pressed, run];
}
function TapButton({ onClick, className = "", children, delay, ...rest }) {
  const [pressed, go] = useTapThen(onClick, delay);
  return (
    <button onClick={go} {...rest} className={className + " ft-tap " + (pressed ? "ft-tap-pressed" : "")}>
      {children}
    </button>
  );
}

function CountBadge({ n, size = 22, className = "" }) {
  if (!n || n <= 0) return null;
  const txt = n > 99 ? "99+" : String(n);
  const fs = txt.length >= 3 ? size * 0.36 : txt.length === 2 ? size * 0.44 : size * 0.52;
  return (
    <span className={"bg-amber-500 text-white font-bold flex items-center justify-center shrink-0 tabular-nums leading-none " + className}
      style={{ width: size, height: size, borderRadius: 9999, fontSize: Math.round(fs * 10) / 10 }}>{txt}</span>
  );
}

function Spinner({ size = 22, className = "" }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={"spin " + className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M12 3 a9 9 0 0 1 9 9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
function LoadingBlock({ label = "読み込んでいます" }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-th-800">
      <Spinner size={30} />
      <p className="text-[12.5px] font-bold text-neutral-500 mt-3">{label}</p>
    </div>
  );
}

/* 途中保存のアイコン。左が「保存する」、右が「保存できた」 */
function SaveArrowIcon({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5 L12 14.5" /><path d="M6.5 9.5 L12 15 L17.5 9.5" /><path d="M5 20.5 L19 20.5" />
    </svg>
  );
}
function SaveCheckIcon({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 12.5 L9.5 17.5 L19.5 6.5" />
    </svg>
  );
}

/* ============================================================
   重なって出る画面
   ============================================================ */
function useClosing(onClose, ms = 230) {
  const [closing, setClosing] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const startClose = useCallback((...args) => {
    setClosing((c) => {
      if (c) return c;
      timer.current = setTimeout(() => {
        onClose && onClose(...args);
        /* **閉じ終わったら「閉じ中」を必ず解くこと。**
           解かないと、次に開いたときも閉じる動きのまま描かれ、
           見えないのに覆いだけが残って、画面のどこを押しても効かなくなる */
        setClosing(false);
      }, ms);
      return true;
    });
  }, [onClose, ms]);
  return [closing, startClose];
}

/* 重なる画面が開いているあいだ、うしろの画面を動かないようにする。
   何枚か重なることがあるので、枚数を数えて最後の1枚が閉じたときだけ元に戻す。
   **戻し忘れると、以後どの画面も動かせなくなる。** */
let overlayCount = 0;
function useLockBackground() {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const body = document.body;
    if (overlayCount === 0) {
      body.dataset.ftPrevOverflow = body.style.overflow || "";
      body.style.overflow = "hidden";
    }
    overlayCount += 1;
    return () => {
      overlayCount -= 1;
      if (overlayCount <= 0) {
        overlayCount = 0;
        body.style.overflow = body.dataset.ftPrevOverflow || "";
        delete body.dataset.ftPrevOverflow;
      }
    };
  }, []);
}

function OverlayScreen({ from = "right", closing, children, zIndex = 50 }) {
  useLockBackground();
  const inCls = from === "bottom" ? "anim-up" : "anim-right";
  const outCls = from === "bottom" ? "anim-down-out" : "anim-right-out";
  return (
    <div className="fixed inset-0" style={{ zIndex }}>
      <div className={"absolute inset-0 bg-black/25 " + (closing ? "anim-fade-out" : "anim-fade")} />
      <div className={"absolute inset-0 " + (closing ? outCls : inCls)}>{children}</div>
    </div>
  );
}

/* 画面左端を右へ払うと戻る。
   ボタンに判定を邪魔されないよう、透明な帯（stripRef）を敷いて検知している。
   **帯をやめないこと。** */
function useEdgeSwipeBack(onBack, canClose) {
  const stripRef = useRef(null);
  const screenRef = useRef(null);
  const onBackRef = useRef(onBack); onBackRef.current = onBack;
  const canCloseRef = useRef(canClose); canCloseRef.current = canClose;

  useEffect(() => {
    const strip = stripRef.current;
    const screen = screenRef.current;
    if (!strip || !screen) return;

    const THRESHOLD = 0.14;
    const VELOCITY_THRESHOLD = 0.18;
    const SETTLE_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
    const SPRING_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

    let active = false, dragging = false, startX = 0, startY = 0, startTime = 0, width = 1, pointerId = null;
    let clearTimer = null;
    const setTransform = (x, animate, easing, duration) => {
      clearTimeout(clearTimer);
      screen.style.transition = animate ? `transform ${duration}ms ${easing}` : "none";
      screen.style.transform = x === 0 ? "translateX(0px)" : `translateX(${x}px)`;
      if (x === 0) {
        const wait = animate ? duration + 30 : 0;
        clearTimer = setTimeout(() => { screen.style.transition = ""; screen.style.transform = ""; }, wait);
      }
    };
  const onPointerDown = (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      active = true; dragging = false;
      startX = e.clientX; startY = e.clientY; startTime = performance.now();
      width = screen.offsetWidth || window.innerWidth || 375;
      pointerId = e.pointerId;
    };
    const onPointerMove = (e) => {
      if (!active) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        if (dx <= 0 || Math.abs(dy) > Math.abs(dx) * 1.3) { active = false; return; }
        dragging = true;
        try { strip.setPointerCapture(pointerId); } catch (err) { /* noop */ }
      }
      setTransform(Math.max(0, Math.min(dx, width)), false);
      e.preventDefault();
    };
    const finish = (e) => {
      if (!active) return;
      active = false;
      if (!dragging) return;
      dragging = false;
      const dx = Math.max(0, Math.min(e.clientX - startX, width));
      const dt = Math.max(1, performance.now() - startTime);
      const passed = dx / width > THRESHOLD || dx / dt > VELOCITY_THRESHOLD;
      if (passed) {
        if (canCloseRef.current && !canCloseRef.current()) { setTransform(0, true, SPRING_EASE, 340); return; }
        const duration = Math.max(110, Math.min(220, (width - dx) / 1.3));
        setTransform(width, true, SETTLE_EASE, duration);
        setTimeout(() => onBackRef.current && onBackRef.current(), duration);
      } else {
        setTransform(0, true, SPRING_EASE, 340);
      }
    };
    strip.addEventListener("pointerdown", onPointerDown);
    strip.addEventListener("pointermove", onPointerMove, { passive: false });
    strip.addEventListener("pointerup", finish);
    strip.addEventListener("pointercancel", finish);
    return () => {
      strip.removeEventListener("pointerdown", onPointerDown);
      strip.removeEventListener("pointermove", onPointerMove);
      strip.removeEventListener("pointerup", finish);
      strip.removeEventListener("pointercancel", finish);
      clearTimeout(clearTimer);
    };
  }, []);

  return { stripRef, screenRef };
}

/* ============================================================
   左右に払って、日・週・月を送る
   ・押しているものの上でも効くよう、面全体で受ける
   ・縦に動かしたときは巻き物（スクロール）に譲る
   ・上下の動きのほうが大きいあいだは、いっさい横へ動かさない
   ============================================================ */
function useSwipePages(onPrev, onNext) {
  const areaRef = useRef(null);
  const [dir, setDir] = useState(0);      // 直前に送った向き（現れる動きに使う）
  const prevRef = useRef(onPrev); prevRef.current = onPrev;
  const nextRef = useRef(onNext); nextRef.current = onNext;

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    let startX = 0, startY = 0, startT = 0, tracking = false, decided = 0;
    const down = (e) => {
      if (e.pointerType === "mouse") return;   // 指のときだけ
      tracking = true; decided = 0;
      startX = e.clientX; startY = e.clientY; startT = performance.now();
    };
    const move = (e) => {
      if (!tracking || decided === -1) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!decided) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        decided = Math.abs(dx) > Math.abs(dy) * 1.4 ? 1 : -1;   // 横向きだけ受ける
      }
    };
    const up = (e) => {
      if (!tracking) return;
      tracking = false;
      if (decided !== 1) return;
      const dx = e.clientX - startX;
      const dt = Math.max(1, performance.now() - startT);
      const far = Math.abs(dx) > Math.min(90, (el.offsetWidth || 360) * 0.22);
      const fast = Math.abs(dx) / dt > 0.35 && Math.abs(dx) > 40;
      if (!far && !fast) return;
      if (dx > 0) { setDir(-1); prevRef.current && prevRef.current(); }
      else { setDir(1); nextRef.current && nextRef.current(); }
    };
    el.addEventListener("pointerdown", down, { passive: true });
    el.addEventListener("pointermove", move, { passive: true });
    el.addEventListener("pointerup", up, { passive: true });
    el.addEventListener("pointercancel", () => { tracking = false; }, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
  }, []);

  /* 送った向きから入ってくるようにする（紙送りと同じ調子） */
  const pageCls = dir === 0 ? "" : dir > 0 ? "ft-page-r" : "ft-page-l";
  return { areaRef, pageCls, setDir };
}

/* ============================================================
   ドラム式（ホイール）ピッカー
   慣性つきの自前実装。ブラウザのスクロールに任せると上方向が効かなくなるため、
   pointerdown/move/up を passive:false で自前処理している。
   **安易にスクロール方式へ戻さないこと。**
   ============================================================ */
const WHEEL_ITEM_H = 40;
const WHEEL_VISIBLE = 5;

function WheelColumn({ items, value, onChange, minWidth = 72 }) {
  const boxRef = useRef(null);
  const offsetRef = useRef(0);
  const rafRef = useRef(null);
  const draggingRef = useRef(false);
  const activeRef = useRef(false);
  const lastYRef = useRef(0);
  const startYRef = useRef(0);
  const movedRef = useRef(false);
  const lastTRef = useRef(0);
  const velRef = useRef(0);
  const [offset, setOffsetState] = useState(0);

  const itemsRef = useRef(items); itemsRef.current = items;
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const valueRef = useRef(value); valueRef.current = value;

  /* 1項目ぶん進むたび、ごく短く震わせて「カチッ」を返す。
     対応していない端末では何も起こらない。演出を切っているときは鳴らさない */
  const prefsForTick = React.useContext(PrefsContext);
  const lastTickRef = useRef(0);
  const tick = () => {
    if (prefsForTick && prefsForTick.motion === false) return;
    const now = performance.now();
    if (now - lastTickRef.current < 40) return;
    lastTickRef.current = now;
    try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(4); } catch (e) { /* 使えなくても構わない */ }
  };

  const count = items.length;
  const maxOffset = Math.max(0, (count - 1) * WHEEL_ITEM_H);
  const idxOf = (v) => { const i = items.findIndex((it) => it.value === v); return i < 0 ? 0 : i; };
  const applyOffset = (v) => { offsetRef.current = v; setOffsetState(v); };
  const clampIdx = (i) => Math.max(0, Math.min(itemsRef.current.length - 1, i));

  const commitFromOffset = () => {
    const idx = clampIdx(Math.round(offsetRef.current / WHEEL_ITEM_H));
    const item = itemsRef.current[idx];
    if (item && item.value !== valueRef.current) {
      valueRef.current = item.value;
      tick();
      onChangeRef.current(item.value);
    }
  };
  const stopAnim = () => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };

  const snap = () => {
    const target = clampIdx(Math.round(offsetRef.current / WHEEL_ITEM_H)) * WHEEL_ITEM_H;
    const start = offsetRef.current;
    const delta = target - start;
    if (Math.abs(delta) < 0.5) { applyOffset(target); commitFromOffset(); activeRef.current = false; return; }
    const dur = 260, t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      applyOffset(start + delta * e);
      commitFromOffset();
      if (p < 1) rafRef.current = requestAnimationFrame(step);
      else { rafRef.current = null; activeRef.current = false; commitFromOffset(); }
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const startInertia = () => {
    let v = velRef.current;
    if (Math.abs(v) < 0.05) { snap(); return; }
    const OVER = WHEEL_ITEM_H * 0.9;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(34, now - last); last = now;
      v *= Math.pow(0.945, dt / 16.67);
      let next = offsetRef.current + v * dt;
      if (next < -OVER) { next = -OVER; v = 0; }
      if (next > maxOffset + OVER) { next = maxOffset + OVER; v = 0; }
      applyOffset(next);
      commitFromOffset();
      const outOfRange = next < 0 || next > maxOffset;
      if (Math.abs(v) > 0.015 && !outOfRange) rafRef.current = requestAnimationFrame(step);
      else { rafRef.current = null; snap(); }
    };
    rafRef.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    if (activeRef.current) return;
    applyOffset(idxOf(value) * WHEEL_ITEM_H);
  }, [value, count]); // eslint-disable-line
  useEffect(() => () => stopAnim(), []);

  const onPointerDown = (e) => {
    stopAnim();
    draggingRef.current = true; activeRef.current = true; movedRef.current = false;
    startYRef.current = e.clientY; lastYRef.current = e.clientY;
    lastTRef.current = performance.now(); velRef.current = 0;
    try { boxRef.current.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
  };
  const onPointerMove = (e) => {
    if (!draggingRef.current) return;
    const now = performance.now();
    const dy = e.clientY - lastYRef.current;
    const dt = Math.max(1, now - lastTRef.current);
    lastYRef.current = e.clientY; lastTRef.current = now;
    if (Math.abs(e.clientY - startYRef.current) > 4) movedRef.current = true;
    velRef.current = velRef.current * 0.7 + (-dy / dt) * 0.3;
    const OVER = WHEEL_ITEM_H * 0.9;
    const cur = offsetRef.current;
    const resist = cur < 0 || cur > maxOffset ? 0.35 : 1;
    let next = cur - dy * resist;
    next = Math.max(-OVER, Math.min(maxOffset + OVER, next));
    applyOffset(next);
    commitFromOffset();
    e.preventDefault();
  };
  /* 押した行まで、なめらかに転がす */
  const tapTo = (i) => {
    stopAnim();
    activeRef.current = true; velRef.current = 0;
    const start = offsetRef.current, target = i * WHEEL_ITEM_H, t0 = performance.now(), dur = 260;
    const step = (now) => {
      const pr = Math.min(1, (now - t0) / dur);
      const e2 = 1 - Math.pow(1 - pr, 3);
      applyOffset(start + (target - start) * e2);
      commitFromOffset();
      if (pr < 1) rafRef.current = requestAnimationFrame(step);
      else { rafRef.current = null; activeRef.current = false; commitFromOffset(); }
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const onPointerUp = (e) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    /* 指を動かしていなければ「押した」とみなし、その行まで転がす。
       **行の側の onClick に頼らないこと。** 指の受け取りをこの箱が
       捕まえているので、行までタップが届かない（動かない不具合になる） */
    if (!movedRef.current && boxRef.current && e && typeof e.clientY === "number") {
      const rect = boxRef.current.getBoundingClientRect();
      const centerPadPx = WHEEL_ITEM_H * ((WHEEL_VISIBLE - 1) / 2);
      /* 行の高さの半分をひくこと。**ひき忘れると1つ下の行が選ばれる** */
      const i = clampIdx(Math.round((e.clientY - rect.top - centerPadPx + offsetRef.current - WHEEL_ITEM_H / 2) / WHEEL_ITEM_H));
      velRef.current = 0;
      tapTo(i);
      return;
    }
    if (performance.now() - lastTRef.current > 120) velRef.current = 0;
    startInertia();
  };
  const onWheelEvent = (e) => {
    stopAnim();
    activeRef.current = true;
    const next = Math.max(-WHEEL_ITEM_H * 0.9, Math.min(maxOffset + WHEEL_ITEM_H * 0.9, offsetRef.current + e.deltaY));
    applyOffset(next);
    commitFromOffset();
    clearTimeout(onWheelEvent._t);
    onWheelEvent._t = setTimeout(() => { velRef.current = 0; snap(); }, 90);
  };

  const centerPad = WHEEL_ITEM_H * ((WHEEL_VISIBLE - 1) / 2);
  const activeIdx = clampIdx(Math.round(offset / WHEEL_ITEM_H));

  /* ネイティブに（passive:false で）登録する。
     React経由だとブラウザ側にスクロールを持っていかれ、上方向が効かないことがある */
  const handlersRef = useRef({});
  handlersRef.current = { onPointerDown, onPointerMove, onPointerUp, onWheelEvent };
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const down = (e) => handlersRef.current.onPointerDown(e);
    const move = (e) => handlersRef.current.onPointerMove(e);
    const up = (e) => handlersRef.current.onPointerUp(e);
    const wheel = (e) => { e.preventDefault(); handlersRef.current.onWheelEvent(e); };
    el.addEventListener("pointerdown", down, { passive: false });
    el.addEventListener("pointermove", move, { passive: false });
    el.addEventListener("pointerup", up, { passive: false });
    el.addEventListener("pointercancel", up, { passive: false });
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, []);

  return (
    <div ref={boxRef} className="relative overflow-hidden select-none"
      style={{ height: WHEEL_ITEM_H * WHEEL_VISIBLE, minWidth, touchAction: "none", cursor: "grab" }}>
      <div style={{ transform: `translateY(${centerPad - offset}px)` }}>
        {items.map((it, i) => {
          const dist = Math.abs(i - offset / WHEEL_ITEM_H);
          const isActive = i === activeIdx;
          return (
            <div key={it.value === "" ? `__empty${i}` : String(it.value)}
              onClick={() => { if (movedRef.current) { movedRef.current = false; return; } tapTo(i); }}
              className="flex items-center justify-center"
              style={{
                height: WHEEL_ITEM_H,
                opacity: Math.max(0.22, 1 - dist * 0.3),
                transform: `scale(${Math.max(0.76, 1 - dist * 0.09)})`,
                fontWeight: isActive ? 700 : 500,
                /* 選ばれている行はテーマカラー。色の数値を直接書かないこと */
                color: isActive ? "var(--th-800)" : "#404040",
                fontSize: isActive ? "17px" : "16px",
                whiteSpace: "nowrap",
              }}>
              {it.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* zIndex＝重なり順。ほかの小窓の上にさらに重ねるときは大きい数を渡すこと */
/* plain ＝ ドラムではなく、ふつうの中身を入れるとき（帯を出さない） */
function WheelSheet({ title, onClose, onConfirm, children, zIndex = 2147483000, plain }) {
  return (
    <div className="ft-sheet-wrap flex items-end justify-center" style={{ zIndex }} onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl border-t border-neutral-100 shadow-lg anim-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          <span className="font-display text-[15.5px] text-neutral-900">{title}</span>
          <button type="button" onClick={onClose} aria-label="閉じる"
            className="min-w-[52px] min-h-[52px] flex items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100"><X size={28} /></button>
        </div>
        <div className="relative px-4 pt-3">
          {!plain && (
            <div className="pointer-events-none absolute left-4 right-4 border-y-2 border-th-700/35 bg-th-50/40 rounded-md"
              style={{ height: WHEEL_ITEM_H, top: `calc(0.75rem + ${WHEEL_ITEM_H * ((WHEEL_VISIBLE - 1) / 2)}px)` }} />
          )}
          <div className={plain ? "relative" : "relative flex justify-center gap-2"}>{children}</div>
        </div>
        <div className="px-4 pt-3" style={SAFE_BOTTOM(14)}>
          <button type="button" onClick={onConfirm} className={BTN_PRIMARY + " w-full " + BTN_H + " text-[15.5px]"}>完了</button>
        </div>
      </div>
    </div>
  );
}

/* 1列のドラム選択欄 */
function DrumSelect({ value, onChange, options, placeholder = "選択", title, className, disabled }) {
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState(value ?? "");
  const items = [{ value: "", label: placeholder }, ...options];
  const current = options.find((o) => o.value === value);
  const openSheet = () => { if (disabled) return; setTemp(value ?? ""); setOpen(true); };
  const confirm = () => { onChange(temp === "" ? "" : temp); setOpen(false); };
  return (
    <>
      <button type="button" onClick={openSheet} disabled={disabled}
        className={inputCls + " flex items-center justify-between text-left disabled:opacity-50 " + (className || "")}>
        <span className={current ? "text-neutral-900 truncate" : "text-neutral-400 truncate"}>{current ? current.label : placeholder}</span>
        <ChevronDown size={18} className="text-neutral-500 shrink-0 ml-2" />
      </button>
      {open && (
        <WheelSheet title={title || placeholder} onClose={() => setOpen(false)} onConfirm={confirm}>
          <WheelColumn items={items} value={temp} onChange={setTemp} minWidth={180} />
        </WheelSheet>
      )}
    </>
  );
}

/* ============================================================
   時刻はドラムで選ぶ（依頼どおり）
   ・「時刻指定なし」を切ると選べるようになる
   ============================================================ */
const HOURS = Array.from({ length: 24 }, (_, i) => ({ value: String(i).padStart(2, "0"), label: `${i}時` }));
const MINUTES = Array.from({ length: 12 }, (_, i) => ({ value: String(i * 5).padStart(2, "0"), label: `${i * 5}分` }));

function TimeInput({ value, onChange, className, placeholder = "時刻を選択", pill }) {
  const [open, setOpen] = useState(false);
  const cur = /^\d{2}:\d{2}$/.test(value || "") ? value : "";
  const [h, setH] = useState(cur ? cur.slice(0, 2) : "09");
  const [m, setM] = useState(cur ? cur.slice(3, 5) : "00");
  const openSheet = () => {
    const c = /^\d{2}:\d{2}$/.test(value || "") ? value : "";
    setH(c ? c.slice(0, 2) : "09");
    /* 5分刻みでない時刻が入っていたら、いちばん近いところに寄せる */
    setM(c ? String(Math.round(Number(c.slice(3, 5)) / 5) * 5 % 60).padStart(2, "0") : "00");
    setOpen(true);
  };
  return (
    <>
      {pill ? (
        <button type="button" onClick={openSheet}
          className={"min-h-[52px] px-4 py-2 rounded-xl bg-neutral-100 text-[17px] tabular-nums ft-tap ft-tap-card shrink-0 "
            + (cur ? "text-neutral-900" : "text-neutral-400") + " " + (className || "")}>
          {/* **先頭の0を取らないこと。** 9:30 と 09:30 が混ざって読みにくい */}
          {cur || placeholder}
        </button>
      ) : (
        <button type="button" onClick={openSheet}
          className={"h-[52px] rounded-xl border border-neutral-300 bg-white flex items-center justify-between px-3 text-left ft-tap ft-tap-card " + (className || "w-[150px]")}>
          <span className={"text-[15.5px] truncate " + (cur ? "text-neutral-900" : "text-neutral-400")}>
            {cur ? cur.replace(":", "時") + "分" : placeholder}
          </span>
          <ChevronDown size={18} className="text-neutral-500 shrink-0 ml-1" />
        </button>
      )}
      {open && (
        <WheelSheet title="時刻を選択" onClose={() => setOpen(false)}
          onConfirm={() => { onChange(`${h}:${m}`); setOpen(false); }}>
          <WheelColumn items={HOURS} value={h} onChange={setH} minWidth={92} />
          <WheelColumn items={MINUTES} value={m} onChange={setM} minWidth={92} />
        </WheelSheet>
      )}
    </>
  );
}

/* ============================================================
   カレンダーの見出し（＜ 年月 今日 ＞）と、年月をまとめて選ぶ小窓。
   月の画面と、日付を選択欄で共通に使う。**同じものを2か所に書かないこと**
   ============================================================ */
function MonthNavHeader({ label, sub, className, onPrev, onNext, onJump, onToday, todayLabel = "今日" }) {
  return (
    /* **上下を詰めないこと。** 日付は目印なので、まわりに余白がいる */
    <div className={"flex items-center justify-between py-1.5 " + (className || "mb-3")}>
      <button type="button" onClick={onPrev} aria-label="前へ"
        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 ft-tap ft-tap-icon"><ChevronLeft size={22} /></button>
      <div className="flex items-center gap-1 min-w-0">
        <button type="button" onClick={onJump} aria-label="年月を選ぶ"
          className="flex items-center gap-1 px-2 min-h-[52px] rounded-lg hover:bg-neutral-100 ft-tap">
          {/* いま見ている日付はこの画面の主役。**小さく置かないこと** */}
          {sub && <span className="text-[12.5px] text-neutral-400 whitespace-nowrap">{sub}</span>}
          <span className="font-display text-[21px] text-neutral-900 whitespace-nowrap tracking-tight">{label}</span>
          <ChevronDown size={18} className="text-neutral-400 shrink-0" />
        </button>
        {onToday && (
          <button type="button" onClick={onToday}
            className="min-h-[40px] px-3 rounded-full text-[13px] font-bold text-th-800 bg-th-50 hover:bg-th-100 ft-tap whitespace-nowrap shrink-0">{todayLabel}</button>
        )}
      </div>
      <button type="button" onClick={onNext} aria-label="次へ"
        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 ft-tap ft-tap-icon"><ChevronRight size={22} /></button>
    </div>
  );
}

function MonthJumpSheet({ year, month, years, onClose, onConfirm, zIndex }) {
  const [y, setY] = useState(year);
  const [m, setM] = useState(month);
  return (
    <WheelSheet title="表示する期間" onClose={onClose} onConfirm={() => onConfirm(y, m)} zIndex={zIndex}>
      <WheelColumn minWidth={96} value={y} onChange={setY} items={years.map((v) => ({ value: v, label: `${v}年` }))} />
      <WheelColumn minWidth={78} value={m} onChange={setM} items={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1}月` }))} />
    </WheelSheet>
  );
}

const YEARS_SPAN = 100;
function jumpYears(shownY, extra = []) {
  const now = new Date().getFullYear();
  const cands = [shownY, ...extra].filter((n) => Number.isFinite(n));
  const lo = Math.min(now - YEARS_SPAN, ...cands);
  const hi = Math.max(now + YEARS_SPAN, ...cands);
  const out = [];
  for (let y = lo; y <= hi; y++) out.push(y);
  return out;
}

/* 日付はカレンダーから選ぶ。
   ドラム式だと曜日が分からず「いつの話か」が思い浮かびにくいため。
   **日付を登録するところは、すべてこの部品を使うこと** */
/* zIndex ＝ 重ねる高さ。**小窓の中でカレンダーを開くときは、必ず高くすること。**
   同じ高さだと下に潜って、見えていても押せなくなる */
function DateInput({ className, value, onChange, placeholder = "日付を選択", allowEmpty, pill, zIndex = 2147483000 }) {
  const [open, setOpen] = useState(false);
  const today = new Date();
  const parse = (v) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || "");
    return m ? { y: +m[1], mo: +m[2], d: +m[3] } : null;
  };
  const p = parse(value);
  const [cursor, setCursor] = useState(() => (p ? { y: p.y, mo: p.mo } : { y: today.getFullYear(), mo: today.getMonth() + 1 }));
  const [picked, setPicked] = useState(() => value || "");
  const [closing, close] = useClosing(() => setOpen(false), 200);
  const [jumpOpen, setJumpOpen] = useState(false);

  const openSheet = () => {
    const q = parse(value);
    setCursor(q ? { y: q.y, mo: q.mo } : { y: today.getFullYear(), mo: today.getMonth() + 1 });
    setPicked(value || "");
    setOpen(true);
  };
  const shiftMonth = (delta) => setCursor((c) => {
    let mo = c.mo + delta, y = c.y;
    if (mo < 1) { mo = 12; y -= 1; }
    if (mo > 12) { mo = 1; y += 1; }
    return { y, mo };
  });
  const confirm = () => { onChange && onChange({ target: { value: picked } }); setOpen(false); };

  const firstDow = new Date(cursor.y, cursor.mo - 1, 1).getDay();
  const lastDay = new Date(cursor.y, cursor.mo, 0).getDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: lastDay }, (_, i) => i + 1)];
  const key = (d) => `${cursor.y}-${String(cursor.mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const todayKey = ymd(today);

  return (
    <>
      {pill ? (
        <button type="button" onClick={openSheet}
          className={"min-h-[52px] px-4 py-2 rounded-xl bg-neutral-100 text-[17px] tabular-nums ft-tap ft-tap-card shrink-0 "
            + (p ? "text-neutral-900" : "text-neutral-400") + " " + (className || "")}>
          {p ? `${p.y}/${String(p.mo).padStart(2, "0")}/${String(p.d).padStart(2, "0")}` : placeholder}
        </button>
      ) : (
        <button type="button" onClick={openSheet}
          className={"h-[52px] rounded-xl border border-neutral-300 bg-white flex items-center justify-between px-3 text-left ft-tap ft-tap-card " + (className || "w-[170px]")}>
          <span className={"text-[15.5px] truncate " + (p ? "text-neutral-900" : "text-neutral-400")}>
            {p ? `${p.y}/${p.mo}/${p.d}` : placeholder}
          </span>
          <ChevronDown size={18} className="text-neutral-500 shrink-0 ml-1" />
        </button>
      )}

      {open && (
        <div className={"ft-sheet-wrap flex items-end justify-center " + (closing ? "anim-fade-out" : "anim-fade")}
          style={{ zIndex }} onClick={close}>
          <div className="absolute inset-0 bg-black/45" />
          <div className={"relative w-full max-w-md bg-white rounded-t-2xl border-t border-neutral-100 shadow-lg flex flex-col ft-sheet-box "
            + (closing ? "anim-sheet-out" : "anim-sheet")} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 shrink-0">
              <span className="font-display text-[15.5px] text-neutral-900 tracking-wide">日付を選択</span>
              <button type="button" onClick={close} aria-label="閉じる"
                className="min-w-[44px] min-h-[52px] flex items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100 ft-tap ft-tap-icon"><X size={24} /></button>
            </div>

            <div className="ft-sheet-body overflow-y-auto px-4 py-3">
              <MonthNavHeader label={`${cursor.y}年 ${cursor.mo}月`}
                onPrev={() => shiftMonth(-1)} onNext={() => shiftMonth(1)}
                onJump={() => setJumpOpen(true)}
                onToday={() => { setCursor({ y: today.getFullYear(), mo: today.getMonth() + 1 }); setPicked(todayKey); }} />

              <div className="grid grid-cols-7 gap-1 text-center text-[12.5px] font-bold mb-1">
                {WEEK_LABELS.map((d, i) => <div key={d} className={weekColor(i)}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((d, i) => {
                  if (d === null) return <div key={"e" + i} />;
                  const ds = key(d);
                  const isPicked = ds === picked;
                  const isToday = ds === todayKey;
                  const dow = (firstDow + d - 1) % 7;
                  return (
                    <button key={ds + (isPicked ? "-s" : "")} type="button" onClick={() => setPicked(ds)}
                      className={"aspect-square min-h-[42px] rounded-lg text-[15.5px] font-bold flex items-center justify-center border-2 ft-tap "
                        + (isPicked ? "bg-th-800 border-th-800 text-white ft-daypop"
                          : isToday ? "border-th-300 bg-th-50 " + weekColor(dow)
                            : "border-transparent " + weekColor(dow) + " hover:bg-neutral-100")}>
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="shrink-0 flex gap-2.5 px-4 py-3 border-t border-neutral-200" style={SAFE_BOTTOM(12)}>
              <button type="button" onClick={close} className={BTN_SECONDARY + " flex-1 " + BTN_H + " text-[14.5px]"}>キャンセル</button>
              {allowEmpty && (
                <button type="button" onClick={() => { onChange && onChange({ target: { value: "" } }); setOpen(false); }}
                  className={BTN_SECONDARY + " flex-1 " + BTN_H + " text-[14.5px]"}>選択解除</button>
              )}
              <button type="button" onClick={confirm} disabled={!picked}
                className={BTN_PRIMARY + " flex-1 " + BTN_H + " text-[14.5px]"}>完了</button>
            </div>

            {jumpOpen && (
              <MonthJumpSheet year={cursor.y} month={cursor.mo} years={jumpYears(cursor.y)} zIndex={zIndex + 100}
                onClose={() => setJumpOpen(false)}
                onConfirm={(y, mo) => { setCursor({ y, mo }); setJumpOpen(false); }} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* 複数の日付をカレンダーから選ぶ（計画の一括登録で使う） */
function MultiDateSheet({ initial, onCancel, onConfirm }) {
  const today = new Date();
  const [closing, close] = useClosing(onCancel, 200);
  const [picked, setPicked] = useState(() => (initial || []).slice());
  const [cursor, setCursor] = useState({ y: today.getFullYear(), mo: today.getMonth() + 1 });
  const [jumpOpen, setJumpOpen] = useState(false);

  const firstDow = new Date(cursor.y, cursor.mo - 1, 1).getDay();
  const lastDay = new Date(cursor.y, cursor.mo, 0).getDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: lastDay }, (_, i) => i + 1)];
  const key = (d) => `${cursor.y}-${String(cursor.mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const shiftMonth = (delta) => setCursor((c) => {
    let mo = c.mo + delta, y = c.y;
    if (mo < 1) { mo = 12; y -= 1; }
    if (mo > 12) { mo = 1; y += 1; }
    return { y, mo };
  });
  const toggle = (ds) => setPicked((p) => p.includes(ds) ? p.filter((x) => x !== ds) : [...p, ds]);
  /* 週の同じ曜日をまとめて選ぶ。1日ずつ押さなくてよいように */
  const pickDow = (dow) => {
    const add = [];
    for (let d = 1; d <= lastDay; d++) {
      if ((firstDow + d - 1) % 7 === dow) add.push(key(d));
    }
    const allOn = add.every((x) => picked.includes(x));
    setPicked((p) => allOn ? p.filter((x) => !add.includes(x)) : [...new Set([...p, ...add])]);
  };

  return (
    <div className={"ft-sheet-wrap flex items-end justify-center " + (closing ? "anim-fade-out" : "anim-fade")}
      style={{ zIndex: 2147483000 }} onClick={close}>
      <div className="absolute inset-0 bg-black/45" />
      <div className={"relative w-full max-w-md bg-white rounded-t-2xl border-t border-neutral-100 shadow-lg flex flex-col ft-sheet-box "
        + (closing ? "anim-sheet-out" : "anim-sheet")} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 shrink-0">
          <span className="font-display text-[15.5px] text-neutral-900 tracking-wide">日付を選択（何日でも）</span>
          <button type="button" onClick={close} aria-label="閉じる"
            className="min-w-[44px] min-h-[52px] flex items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100 ft-tap ft-tap-icon"><X size={24} /></button>
        </div>
        <div className="ft-sheet-body overflow-y-auto px-4 py-3">
          <MonthNavHeader label={`${cursor.y}年 ${cursor.mo}月`}
            onPrev={() => shiftMonth(-1)} onNext={() => shiftMonth(1)} onJump={() => setJumpOpen(true)}
            onToday={() => setCursor({ y: today.getFullYear(), mo: today.getMonth() + 1 })} todayLabel="今月" />
          <div className="grid grid-cols-7 gap-1 text-center text-[12.5px] font-bold mb-1">
            {WEEK_LABELS.map((d, i) => (
              <button key={d} type="button" onClick={() => pickDow(i)}
                className={"py-1 rounded-md hover:bg-neutral-100 ft-tap " + weekColor(i)}>{d}</button>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (d === null) return <div key={"e" + i} />;
              const ds = key(d);
              const on = picked.includes(ds);
              const dow = (firstDow + d - 1) % 7;
              return (
                <button key={ds + (on ? "-s" : "")} type="button" onClick={() => toggle(ds)}
                  className={"aspect-square min-h-[42px] rounded-lg text-[15.5px] font-bold flex items-center justify-center border-2 ft-tap "
                    + (on ? "bg-th-800 border-th-800 text-white ft-daypop" : "border-transparent " + weekColor(dow) + " hover:bg-neutral-100")}>
                  {d}
                </button>
              );
            })}
          </div>
          <p className="text-[12.5px] text-neutral-500 mt-3">曜日の字を押すと、その月の同じ曜日をまとめて選べます。</p>
        </div>
        <div className="shrink-0 flex gap-2.5 px-4 py-3 border-t border-neutral-200" style={SAFE_BOTTOM(12)}>
          <button type="button" onClick={close} className={BTN_SECONDARY + " flex-1 " + BTN_H + " text-[14.5px]"}>キャンセル</button>
          <button type="button" onClick={() => onConfirm(picked.slice().sort())} disabled={!picked.length}
            className={BTN_PRIMARY + " flex-1 " + BTN_H + " text-[14.5px]"}>完了（{picked.length}日）</button>
        </div>
        {jumpOpen && (
          <MonthJumpSheet year={cursor.y} month={cursor.mo} years={jumpYears(cursor.y)} zIndex={2147483100}
            onClose={() => setJumpOpen(false)} onConfirm={(y, mo) => { setCursor({ y, mo }); setJumpOpen(false); }} />
        )}
      </div>
    </div>
  );
}

/* ============================================================
   タグ
   **一覧を画面に出しっぱなしにしないこと。** 増えるほど画面を圧迫する
   ============================================================ */
/* zIndex ＝ 重ねる高さ。**小窓の上でさらに開くときは、必ず高くすること。**
   同じ高さだと、下に隠れて押せなくなる（見えているのに反応しない） */
function TagPickDialog({ title, selected, known, onApply, onCancel, onCreate, note, zIndex = 2147483000 }) {
  const [picked, setPicked] = useState(normalizeTags(selected));
  const [draft, setDraft] = useState("");
  const [closing, close] = useClosing(onCancel, 200);

  const q = draft.trim().toLowerCase();
  const list = normalizeTags(known);
  const shown = q ? list.filter((t) => t.toLowerCase().includes(q)) : list;
  const canCreate = !!onCreate && !!draft.trim() && !list.some((t) => t.toLowerCase() === draft.trim().toLowerCase());

  const toggle = (t) => setPicked((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  const create = () => {
    const t = normalizeTags([draft])[0];
    if (!t) return;
    onCreate(t);
    setPicked((prev) => prev.includes(t) ? prev : [...prev, t]);
    setDraft("");
  };

  return (
    <div className={"ft-sheet-wrap flex items-end justify-center " + (closing ? "anim-fade-out" : "anim-fade")}
      style={{ zIndex }} onClick={close}>
      <div className="absolute inset-0 bg-black/45" />
      <div className={"relative w-full max-w-md bg-white rounded-t-2xl border-t border-neutral-100 shadow-lg flex flex-col ft-sheet-box "
        + (closing ? "anim-sheet-out" : "anim-sheet")} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 shrink-0">
          <span className="font-display text-[15.5px] text-neutral-900 tracking-wide">{title}</span>
          <button type="button" onClick={close} aria-label="閉じる"
            className="min-w-[44px] min-h-[52px] flex items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100 ft-tap ft-tap-icon"><X size={24} /></button>
        </div>

        <div className="px-4 pt-3 shrink-0">
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <TextInput value={draft} onChange={(e) => setDraft(e.target.value)}
                placeholder={onCreate ? "さがす／新しく作る" : "さがす"}
                onKeyDown={(e) => { if (e.key === "Enter" && canCreate) { e.preventDefault(); create(); } }} />
            </div>
            {/* 出たり消えたりすると目がちらつくので、いつも同じ場所に置いておく */}
            {onCreate && (
              <button type="button" onClick={create} disabled={!canCreate}
                className={(canCreate ? BTN_PRIMARY : BTN_BASE + " bg-neutral-100 border border-neutral-200 text-neutral-400")
                  + " " + BTN_H + " px-3.5 text-[14.5px] shrink-0"}><Plus size={15} /> 作る</button>
            )}
          </div>
          {note && <p className="text-[12.5px] text-neutral-500 mt-2">{note}</p>}
        </div>

        <div className="ft-sheet-body overflow-y-auto px-4 py-3">
          {shown.length === 0 ? (
            <p className="text-[13.5px] text-neutral-500 py-6 text-center">
              {list.length === 0 ? "まだタグがありません。" : "見つかりません。"}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {shown.map((t) => {
                const on = picked.includes(t);
                return (
                  <button key={t} type="button" onClick={() => toggle(t)} aria-pressed={on}
                    className={"text-[13.5px] font-bold px-3.5 py-2 rounded-full border ft-tap "
                      + (on ? "border-th-800 bg-th-800 text-white" : "border-neutral-200 bg-white text-neutral-600")}>
                    {t}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 flex gap-2.5 px-4 py-3 border-t border-neutral-200" style={SAFE_BOTTOM(12)}>
          <button type="button" onClick={close} className={BTN_SECONDARY + " flex-1 " + BTN_H + " text-[14.5px]"}>キャンセル</button>
          <button type="button" onClick={() => onApply(normalizeTags(picked))}
            className={BTN_PRIMARY + " flex-1 " + BTN_H + " text-[14.5px]"}>
            完了{picked.length > 0 ? `（${picked.length}）` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

function TagField({ value, onChange, knownTags, onCreateTag }) {
  const tags = normalizeTags(value);
  const [open, setOpen] = useState(false);
  return (
    <div>
      {/* **足すボタンを、付けたタグの下に置かないこと。**
          タグが増えるたびにボタンが下へ逃げて、押しにくくなる */}
      <button type="button" onClick={() => setOpen(true)}
        className="min-h-[52px] px-4 rounded-full border border-neutral-200 bg-white text-[14.5px] text-neutral-500 inline-flex items-center gap-1.5 ft-tap ft-tap-card">
        タグを追加 <Plus size={15} />
      </button>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {tags.map((t) => (
            <span key={t} className="ft-chip inline-flex items-center gap-1 rounded-full bg-th-50 border border-th-200 pl-3 pr-1 py-1">
              <span className="text-[13.5px] font-bold text-th-900">{t}</span>
              <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))} aria-label={`${t} を外す`}
                className="w-6 h-6 flex items-center justify-center rounded-full text-th-800/60 hover:text-red-700 ft-tap ft-tap-icon"><X size={14} /></button>
            </span>
          ))}
        </div>
      )}
      {open && (
        <TagPickDialog title="タグを選択" selected={tags} known={knownTags}
          onCreate={onCreateTag}
          onApply={(v) => { onChange(v); setOpen(false); }}
          onCancel={() => setOpen(false)} />
      )}
    </div>
  );
}

function TagChips({ tags, className }) {
  const list = normalizeTags(tags);
  if (!list.length) return null;
  return (
    <div className={"flex flex-wrap gap-1.5 " + (className || "")}>
      {list.map((t) => (
        <span key={t} className="text-[12.5px] font-bold px-2.5 py-1 rounded-full bg-th-50 text-th-900 border border-th-200">{t}</span>
      ))}
    </div>
  );
}

/* 押して切り替えるカプセル。**絞り込みの部品はこれにそろえること** */
function FilterPill({ on, onClick, children, color }) {
  const style = on && color ? { background: color.deep, borderColor: color.deep, color: "#fff" } : undefined;
  return (
    <button type="button" onClick={onClick} aria-pressed={on} style={style}
      className={"text-[13.5px] font-bold px-3.5 min-h-[44px] rounded-full border ft-tap inline-flex items-center gap-1.5 "
        + (on ? (color ? "" : "border-th-800 bg-th-800 text-white") : "border-neutral-200 bg-white text-neutral-600")}>
      {children}
    </button>
  );
}

/* ============================================================
   確かめるダイアログ（消すときなど）
   ============================================================ */
/* ============================================================
   下から出てくる、決めるための小窓
   **設定を変えたら「保存」で決める形にすること。**
   さわるたびに反映すると、決めたつもりがないのに変わってしまう
   ============================================================ */
function SheetDialog({ title, children, onCancel, onConfirm, confirmLabel = "保存", disabled }) {
  const [closing, close] = useClosing(onCancel, 200);
  useLockBackground();
  return (
    <div className={"ft-sheet-wrap flex items-end justify-center " + (closing ? "anim-fade-out" : "anim-fade")}
      style={{ zIndex: 2147483200 }} onClick={close}>
      <div className="absolute inset-0 bg-black/45" />
      <div className={"relative w-full max-w-md bg-white rounded-t-2xl border-t border-neutral-100 shadow-lg flex flex-col ft-sheet-box "
        + (closing ? "anim-sheet-out" : "anim-sheet")} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-200 shrink-0">
          <h3 className="font-display text-[15.5px] text-neutral-900 flex-1 min-w-0 truncate">{title}</h3>
          <button type="button" onClick={close} aria-label="閉じる"
            className="w-11 h-11 -mr-2 flex items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100 ft-tap ft-tap-icon"><X size={20} /></button>
        </div>
        <div className="ft-sheet-body px-4 py-4">{children}</div>
        <div className="flex gap-2 px-4 py-3 border-t border-neutral-200 shrink-0"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}>
          <button type="button" onClick={close} className={BTN_SECONDARY + " flex-1 btn-h-lg text-[16px]"}>キャンセル</button>
          <button type="button" onClick={onConfirm} disabled={disabled}
            className={BTN_PRIMARY + " flex-1 btn-h-lg text-[16px]"}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({ title, body, confirmLabel = "削除する", danger = true, onConfirm, onCancel }) {
  const [closing, close] = useClosing(onCancel, 180);
  useLockBackground();
  return (
    <div className={"ft-sheet-wrap flex items-center justify-center p-6 " + (closing ? "anim-fade-out" : "anim-fade")}
      style={{ zIndex: 2147483300 }} onClick={close}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-lg p-5 anim-pop" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-[15.5px] text-neutral-900 mb-2">{title}</h3>
        {body && <p className="text-[13.5px] text-neutral-600 leading-relaxed mb-4 whitespace-pre-line">{body}</p>}
        <div className="flex gap-2.5">
          <button type="button" onClick={close} className={BTN_SECONDARY + " flex-1 " + BTN_H + " text-[14.5px]"}>キャンセル</button>
          <button type="button" onClick={onConfirm}
            className={(danger ? BTN_DANGER : BTN_PRIMARY) + " flex-1 " + BTN_H + " text-[14.5px]"}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* 名前をひとつ打ち込むだけの小窓（フォルダ名・リスト名・計画の種類など） */
function NameDialog({ title, label, initial = "", placeholder, confirmLabel = "完了", onConfirm, onCancel }) {
  const [v, setV] = useState(initial);
  const [closing, close] = useClosing(onCancel, 180);
  useLockBackground();
  return (
    /* **真ん中に置かないこと。** 文字を打つとキーボードが下から出てきて、
       ちょうど重なって見えなくなる。上のほうに寄せておく */
    <div className={"ft-sheet-wrap flex items-start justify-center px-6 " + (closing ? "anim-fade-out" : "anim-fade")}
      style={{ zIndex: 2147483300, paddingTop: "calc(env(safe-area-inset-top) + 64px)" }} onClick={close}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-lg p-5 anim-pop" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-[15.5px] text-neutral-900 mb-3">{title}</h3>
        <div className="mb-4">
          <TextInput value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder || label} autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) onConfirm(v.trim()); }} />
        </div>
        <div className="flex gap-2.5">
          <button type="button" onClick={close} className={BTN_SECONDARY + " flex-1 " + BTN_H + " text-[15.5px]"}>キャンセル</button>
          <button type="button" onClick={() => onConfirm(v.trim())} disabled={!v.trim()}
            className={BTN_PRIMARY + " flex-1 " + BTN_H + " text-[15.5px]"}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   見出しと三本線
   **三本線の大きさは1か所で決めること。**
   別々の数にすると、画面を移ったとき大きさが変わって見える
   ============================================================ */
const MenuContext = React.createContext(null);
const MENU_BTN = 56;
const MENU_ICON = 32;

function MenuButton() {
  const openMenu = React.useContext(MenuContext);
  if (!openMenu) return null;
  return (
    <button onClick={openMenu} aria-label="メニュー"
      className="relative flex items-center justify-center rounded-xl text-neutral-700 ft-tap ft-tap-icon shrink-0"
      style={{ minWidth: 48, minHeight: 48 }}>
      <Menu size={24} strokeWidth={2} />
    </button>
  );
}

function ScreenHeader({ title, right, sub }) {
  const openMenu = React.useContext(MenuContext);
  const prefs = React.useContext(PrefsContext) || DEFAULT_PREFS;
  const photo = usePhotoSrc(prefs.headerPhoto || "");
  return (
    /* 画面のいちばん上は、深い色の帯。
       **白い背景に黒い字、にしないこと。** 帯があると、
       どこまでが見出しでどこからが中身かが、ひと目で分かる */
    /* 題は真ん中、両側にボタン。**左に寄せて大きく置かないこと。**
       どの画面でも同じ場所に同じ大きさで出るほうが、迷わない */
    <div className={"px-2 pb-2 sticky top-0 z-10 relative overflow-hidden " + (photo ? "" : "bg-head")} style={SAFE_TOP(8)}>
      {/* 好きな写真を敷けるようにしてある。
          **写真の上にそのまま字を置かないこと。** 明るい写真だと読めなくなるので、
          うすい黒をかぶせてから字をのせる */}
      {photo && (
        <>
          <span className="absolute inset-0" style={{
            backgroundImage: `url(${photo})`, backgroundSize: "cover", backgroundPosition: "center",
          }} />
          <span className="absolute inset-0" style={{
            background: "linear-gradient(180deg, rgba(0,0,0,.28), rgba(0,0,0,.42))",
          }} />
        </>
      )}
      <div className="relative flex items-center gap-1 min-h-[48px]">
        <span className="w-12 shrink-0" />
        <div className="flex-1 min-w-0 text-center">
          <h1 className="font-display text-[17px] text-white truncate tracking-wide">{title}</h1>
          {sub && <p className="text-[12px] text-white/70 truncate">{sub}</p>}
        </div>
        <div className="flex items-center justify-end gap-0.5 shrink-0" style={{ minWidth: 48 }}>
          {right}
          {/* **押したあとの色を残さないこと。** 触った所だけ色が変わって見える */}
          {openMenu && (
            <button onClick={openMenu} aria-label="メニュー"
              className="relative flex items-center justify-center rounded-xl text-white ft-tap ft-tap-icon shrink-0"
              style={{ minWidth: 48, minHeight: 48 }}>
              <Menu size={24} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* 重なって出る画面の見出し（戻る＋題＋三本線） */
function OverlayHeader({ title, onBack, right, hideMenu }) {
  return (
    /* 覆いの見出しも同じ並び。左は矢印だけ、題は真ん中 */
    <div className="bg-white border-b border-neutral-100 px-2 pb-2 flex items-center gap-1 shrink-0" style={SAFE_TOP(10)}>
      <TapButton onClick={onBack} aria-label="戻る"
        className="w-12 h-12 flex items-center justify-center rounded-xl text-neutral-700 hover:bg-neutral-100 shrink-0">
        <ChevronLeft size={24} />
      </TapButton>
      <h2 className="font-display text-[17.5px] text-neutral-900 truncate flex-1 text-center">{title}</h2>
      <div className="flex items-center justify-end gap-0.5 shrink-0" style={{ minWidth: 48 }}>
        {right}
        {!hideMenu && <MenuButton />}
      </div>
    </div>
  );
}

function MenuRow({ it }) {
  const [pressed, go] = useTapThen(it.onClick);
  return (
    <button onClick={go}
      className={"w-full flex items-center gap-3 px-5 py-4 text-left min-h-[60px] ft-tap ft-tap-card "
        + (pressed ? "bg-neutral-200 ft-tap-pressed" : "hover:bg-neutral-50")}>
      <span className="w-10 h-10 rounded-xl bg-th-50 border border-th-200 flex items-center justify-center shrink-0 text-th-800">{it.icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block font-display text-[15.5px] text-neutral-900 tracking-wide">{it.label}</span>
        {it.desc && <span className="block text-[12.5px] text-neutral-500 mt-0.5">{it.desc}</span>}
      </span>
      <ChevronRight size={18} className="text-neutral-400 shrink-0" />
    </button>
  );
}

function SideMenu({ open, onClose, items, footer, instant }) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let t;
    if (open) {
      setMounted(true);
      t = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(t);
    }
    /* 画面へ移るときは、メニューが左へ滑って消える動きを見せない。
       ただし要素を即座に外すと、その位置にある別のものがタップを拾ってしまう。
       透明なまま少しの間だけ残して受け止める */
    if (instant) {
      setShown(false);
      const q = setTimeout(() => setMounted(false), 320);
      return () => clearTimeout(q);
    }
    setShown(false);
    const timer = setTimeout(() => setMounted(false), 260);
    return () => clearTimeout(timer);
  }, [open]); // eslint-disable-line

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* 払ったぶんだけ、板が指について動く。
     **払った瞬間に消さないこと。** 手ざわりが固く、行き先も分からない。
     半分ちかくまで払ったら閉じ、それより浅ければ元へ戻る */
  const [drag, setDrag] = useState(null);   // 右へ動かしている量（px）
  const dragRef = useRef(null);
  /* 指でもマウスでも同じように動くよう、pointer で受ける。
     **touch だけで受けないこと。** 環境によっては何も起きない */
  const dragNowRef = useRef(0);
  const onPointerDown = (e) => {
    dragRef.current = { x: e.clientX, y: e.clientY, w: e.currentTarget.offsetWidth, lock: null };
    dragNowRef.current = 0;
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (d.lock === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.lock = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (d.lock !== "x") return;
    const v = Math.max(0, dx);
    dragNowRef.current = v;
    setDrag(v);
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    const moved = dragNowRef.current;
    dragNowRef.current = 0;
    if (d && moved > (d.w || 300) * 0.3) { setDrag(null); onClose(); return; }
    setDrag(null);
  };

  if (!mounted) return null;
  return (
    <div className="fixed inset-0" style={{ zIndex: 2147483200 }}>
      {/* うしろの暗さ。**板の下まで敷かないこと。**
          左の空いているところだけを暗くすると、どこを押せば戻れるかが分かる。
          払ったぶんだけ薄くなる */}
      <div onClick={onClose} className="absolute inset-0 bg-black/35"
        style={{
          opacity: shown ? (drag !== null ? Math.max(0, 1 - drag / 260) : 1) : 0,
          transition: drag !== null ? "none" : "opacity 240ms cubic-bezier(0.16,1,0.3,1)",
        }} />
      <div className="absolute top-0 right-0 h-full w-[67%] max-w-[320px] bg-white shadow-xl flex flex-col"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        style={{
          transform: drag !== null ? `translateX(${drag}px)` : (shown ? "translateX(0)" : "translateX(100%)"),
          transition: drag !== null ? "none" : "transform 280ms cubic-bezier(0.16,1,0.3,1)",
          touchAction: "pan-y",
        }}>
        <div className="flex items-center justify-between px-5 pb-4 border-b border-neutral-200 shrink-0" style={SAFE_TOP(16)}>
          <span className="font-display text-[16px] text-neutral-900">メニュー</span>
          <button onClick={onClose} aria-label="閉じる"
            className="min-w-[52px] min-h-[52px] flex items-center justify-center rounded-xl text-neutral-600 hover:bg-neutral-100"><X size={28} /></button>
        </div>
        <div className="flex-1 overflow-y-auto py-2 ft-seq">
          {items.map((it) => <MenuRow key={it.label} it={it} />)}
        </div>
        {footer && (
          <div className="border-t border-neutral-200 px-5 py-4 shrink-0" style={SAFE_BOTTOM(16)}>{footer}</div>
        )}
      </div>
    </div>
  );
}

/* 知らせ（トースト）。**前のタイマーを必ず止めること。**
   止めないと、続けて操作したとき前のタイマーが新しい知らせを消してしまう */
function useToast() {
  const [msg, setMsg] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const tell = useCallback((text, ms = 2400) => {
    clearTimeout(timer.current);
    setMsg(text);
    timer.current = setTimeout(() => setMsg(null), ms);
  }, []);
  return [msg, tell];
}
function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div className="fixed left-1/2 -translate-x-1/2 anim-pop pointer-events-none"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 96px)", zIndex: 2147483250 }}>
      <div className="bg-neutral-900 text-white text-[13.5px] font-bold px-4 py-2.5 rounded-full shadow-xl max-w-[86vw] text-center">{msg}</div>
    </div>
  );
}

/* 本文のURLを、押せるリンクとして描く。
   **自前で確認を出さないこと・自前のiframeで映さないこと。**
   iPhoneは必ず「このリンクを開きますか？」を出すので二度手間になる */
const URL_REGEX = /https?:\/\/[^\s<>"'）)】」、。]+/g;
function LinkedText({ text, className }) {
  if (!text) return null;
  const parts = [];
  let last = 0;
  const src = String(text);
  src.replace(URL_REGEX, (m, idx) => {
    if (idx > last) parts.push({ t: src.slice(last, idx) });
    parts.push({ t: m, url: m });
    last = idx + m.length;
    return m;
  });
  if (last < src.length) parts.push({ t: src.slice(last) });
  return (
    <span className={"whitespace-pre-line break-words " + (className || "")}>
      {parts.map((p, i) => p.url
        ? <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="ft-link text-sky-700 font-bold">{p.t}</a>
        : <React.Fragment key={i}>{p.t}</React.Fragment>)}
    </span>
  );
}

/* ============================================================
   記録の入力画面
   ・種類は＋を押したあとのシートで選んでから入る（typeLocked）ので、
     フォルダの中に「種類を選び直す」欄は出さない
   ・途中保存は同じidを上書きするので、何度でも押せて記録は増えない。
     **このとき setEditing / setIsNew を呼ばないこと。**
     呼ぶと入力欄が作り直され、打っている最中のカーソルが外れる
   ============================================================ */

/* 大事な記録に付ける印を選ぶ */
function MarkPicker({ value, onChange }) {
  return (
    <div className="flex gap-2">
      <button type="button" onClick={() => onChange(null)}
        className={"min-h-[52px] px-3.5 rounded-xl border text-[14.5px] font-bold ft-tap "
          + (!value ? "border-th-800 bg-th-800 text-white" : "border-neutral-200 bg-white text-neutral-500")}>なし</button>
      {MARKS.map((m) => {
        const on = value === m.key;
        return (
          <button key={m.key} type="button" onClick={() => onChange(m.key)} aria-pressed={on} aria-label={m.label}
            className={"min-h-[52px] min-w-[52px] rounded-xl border flex items-center justify-center ft-tap ft-tap-icon "
              + (on ? "border-th-800 bg-th-50" : "border-neutral-200 bg-white")}
            style={{ color: m.color }}>
            {/* 付けた瞬間だけ弾ませたいので、key を変えて描き直させている */}
            <span key={on ? "on" : "off"} className={"flex " + (on ? "ft-mark" : "")}>
              {React.cloneElement(m.icon, { size: 20, fill: on ? m.color : "none" })}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* 記録に付いた印を小さく見せる */
function MarkDot({ mark, size = 15 }) {
  const m = markOf(mark);
  if (!m) return null;
  return <span className="shrink-0 inline-flex" style={{ color: m.color }}>{React.cloneElement(m.icon, { size, fill: m.color })}</span>;
}

/* 「時刻指定なし」の切り替え。既定は入（時刻なし） */
function TimeRow({ time, onChange, label = "時刻" }) {
  const noTime = !time;
  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      <button type="button" onClick={() => onChange(noTime ? "09:00" : null)} aria-pressed={noTime}
        className={"min-h-[52px] px-3.5 rounded-xl border text-[14.5px] font-bold flex items-center gap-2 ft-tap "
          + (noTime ? "border-th-800 bg-th-800 text-white" : "border-neutral-200 bg-white text-neutral-500")}>
        <span className="w-4 h-4 rounded-md border-[1.5px] flex items-center justify-center"
          style={{ borderColor: noTime ? "#fff" : "#A3A3A3", background: noTime ? "#fff" : "transparent" }}>
          {noTime && <Check size={11} strokeWidth={3.5} className="thick text-th-800" />}
        </span>
        時刻を指定しない
      </button>
      {!noTime && <TimeInput value={time} onChange={onChange} className="w-[150px]" />}
    </div>
  );
}

/* ============================================================
   チェックリストの中身を作る欄
   ・それぞれ独立していて、順番を入れ替えられる
   ・移し替え（持ち越し）は閲覧画面から行う
   ============================================================ */
/* ============================================================
   やることを書きならべる
   **並べ替えを小さな矢印にしないこと。** 押し分けにくく、動きも分かりにくい。
   右の三本線をつまんで、そのまま上下に運ぶ形にしてある
   ============================================================ */
function ChecklistEditor({ items, onChange }) {
  const [draft, setDraft] = useState("");
  const [dragId, setDragId] = useState(null);   // いまつまんでいる行
  const boxRef = useRef(null);
  const rowsRef = useRef({});                    // 行の位置をおぼえておく

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    onChange([...items, { id: uid(), text: t, done: false }]);
    setDraft("");
  };
  const setText = (i, v) => { const next = items.slice(); next[i] = { ...next[i], text: v }; onChange(next); };
  const remove = (i) => onChange(items.filter((_, k) => k !== i));

  /* 指の位置から「いま何番目にいるか」を出して、その場で入れ替える */
  const moveTo = (id, clientY) => {
    const from = items.findIndex((x) => x.id === id);
    if (from < 0) return;
    let to = from;
    items.forEach((it, k) => {
      const el = rowsRef.current[it.id];
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (clientY > r.top && clientY < r.bottom) to = k;
    });
    if (to === from) return;
    const next = items.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  const onHandleDown = (id) => (e) => {
    e.preventDefault();
    setDragId(id);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* 使えない端末は無視 */ }
  };
  const onHandleMove = (e) => { if (dragId) moveTo(dragId, e.clientY); };
  const onHandleUp = () => setDragId(null);

  return (
    <div ref={boxRef}>
      {items.length > 0 && (
        <div className="mb-1">
          {items.map((it, i) => (
            <div key={it.id} ref={(el) => { rowsRef.current[it.id] = el; }}
              className={"flex items-center gap-1 rounded-xl " + (dragId === it.id ? "bg-th-50" : "")}>
              <span className="w-6 shrink-0 flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-neutral-300" />
              </span>
              {/* **1行の入力欄にしないこと。** 長い字が横に流れて読めなくなる */}
              <TextArea bare value={it.text} onChange={(e) => setText(i, e.target.value)} placeholder="やること"
                minRows={1} className="flex-1 min-w-0 py-2.5 placeholder-neutral-300" />
              <button type="button" onClick={() => remove(i)} aria-label="削除"
                className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl text-neutral-300 hover:text-rose-700 ft-tap ft-tap-icon"><X size={17} /></button>
              {items.length > 1 && (
                <button type="button" aria-label="つまんで並べ替え"
                  onPointerDown={onHandleDown(it.id)} onPointerMove={onHandleMove}
                  onPointerUp={onHandleUp} onPointerCancel={onHandleUp}
                  className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl text-neutral-300"
                  style={{ touchAction: "none", cursor: "grab" }}><GripVertical size={18} /></button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1">
        <span className="w-6 shrink-0 flex items-center justify-center text-neutral-300"><Plus size={15} /></span>
        <TextArea bare value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="やることを追加"
          minRows={1} className="flex-1 min-w-0 py-2.5 placeholder-neutral-300"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          onBlur={add} />
        <button type="button" onClick={add} disabled={!draft.trim()} aria-label="追加"
          className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl text-th-800 disabled:opacity-25 ft-tap ft-tap-icon"><Check size={18} /></button>
      </div>
    </div>
  );
}

/* ============================================================
   画像をえらぶ
   端末の中に、小さくしてから持つ（そのままだと入りきらない）
   ============================================================ */
function ImagesField({ images, onChange, onError }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const list = images || [];
  const pick = async (files) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const out = [];
      for (const f of Array.from(files).slice(0, 8)) {
        try { out.push(await shrinkImage(f)); } catch (e) { onError && onError("読み込めない画像がありました"); }
      }
      if (out.length) onChange([...list, ...out].slice(0, 12));
    } finally { setBusy(false); }
  };
  const open = () => { if (fileRef.current) fileRef.current.click(); };

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" multiple
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        onChange={(e) => { const fs = e.target.files; pick(fs).then(() => { e.target.value = ""; }); }} />

      {list.length === 0 ? (
        /* まだ1枚もないときは、大きな枠ごと押せるようにする */
        <button type="button" onClick={open} disabled={busy}
          className="w-full min-h-[160px] rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 flex flex-col items-center justify-center gap-2 text-neutral-400 ft-tap ft-tap-card">
          {busy ? <Spinner size={22} /> : <ImageIcon size={30} />}
          <span className="text-[13.5px] font-bold">{busy ? "読み込み中" : "写真を選ぶ"}</span>
        </button>
      ) : (
        <>
          <div className={"grid gap-2 mb-2 " + (list.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
            {/* 見え方をタイムラインとそろえる。ここで全体が見えても、
                並んだときに切れていては意味がない */}
            {list.map((src, i) => (
              <div key={i} className="relative rounded-2xl overflow-hidden border border-neutral-200 bg-neutral-100 ft-chip"
                style={{ aspectRatio: list.length === 1 ? "4 / 3" : "1 / 1" }}>
                <Photo src={src} className="block w-full h-full" style={{ objectFit: "cover" }} />
                <button type="button" onClick={() => onChange(list.filter((_, k) => k !== i))} aria-label="削除"
                  className="absolute top-1.5 right-1.5 w-9 h-9 rounded-full bg-black/55 text-white flex items-center justify-center ft-tap ft-tap-icon"><X size={17} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={open} disabled={busy}
            className={BTN_SECONDARY + " w-full " + BTN_H + " text-[14.5px]"}>
            {busy ? <Spinner size={15} /> : <Plus size={15} />} 写真を追加
          </button>
        </>
      )}
    </div>
  );
}

/* ============================================================
   繰り返しの中身をえらぶ
   **この部品を消さないこと。** 行（RepeatRow）から呼んでいるので、
   なくなると小窓を開いたとたんに画面が真っ白になる
   ============================================================ */
function RepeatEditor({ value, onChange }) {
  const v = value || { freq: "none", days: [], until: "" };
  const setFreq = (freq) => onChange({ ...v, freq, days: freq === "weekly" ? (v.days || []) : [] });
  const toggleDay = (i) => {
    const days = (v.days || []).includes(i) ? v.days.filter((x) => x !== i) : [...(v.days || []), i];
    onChange({ ...v, days });
  };
  return (
    <div>
      {/* 繰り返し方は、ほかの選び方と同じドラムでえらぶ。
          **ここだけ並んだボタンにしないこと。** 選び方がばらばらだと迷う */}
      <div className="mb-3">
        <WheelColumn items={REPEATS.map((r) => ({ value: r.key, label: r.label }))}
          value={v.freq} onChange={setFreq} minWidth={200} />
      </div>

      {v.freq === "weekly" && (
        <div className="flex gap-1.5 mb-3 ft-open">
          {WEEK_LABELS.map((d, i) => {
            const on = (v.days || []).includes(i);
            return (
              <button key={d} type="button" onClick={() => toggleDay(i)} aria-pressed={on}
                className={"flex-1 min-h-[52px] rounded-xl border text-[15.5px] font-bold ft-tap "
                  + (on ? "border-th-800 bg-th-800 text-white" : "border-neutral-200 bg-white " + weekColor(i))}>{d}</button>
            );
          })}
        </div>
      )}

      {/* いつまで繰り返すか。決めなければ、ずっと続く。
          **出したり消したりしないこと。** 場所が動くと、押そうとした先が消える。
          「繰り返さない」ときは、うすくして押せなくしておく */}
      <RowCard>
        <SheetRow label="いつまで" last>
          {v.freq === "none" ? (
            <span className="min-h-[52px] px-4 py-2 rounded-xl bg-neutral-100 text-[17px] text-neutral-300 flex items-center">なし</span>
          ) : (
            <DateInput pill value={v.until} allowEmpty placeholder="ずっと" zIndex={2147483250}
              onChange={(e) => onChange({ ...v, until: e.target.value })} />
          )}
        </SheetRow>
      </RowCard>
    </div>
  );
}

/* 繰り返しを選ぶ行（「なし ⌄」を押すと小窓が出る） */
function RepeatRow({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [tmp, setTmp] = useState(value || { freq: "none", days: [], until: "" });
  return (
    <RowCard className="mb-3">
      <SheetRow label="繰り返し" last>
        <button type="button" onClick={() => { setTmp(value || { freq: "none", days: [], until: "" }); setOpen(true); }}
          className="min-h-[52px] px-4 py-2 rounded-xl bg-neutral-100 text-[17px] text-neutral-900 flex items-center gap-1.5 ft-tap ft-tap-card">
          {repeatLabel(value)} <ChevronDown size={17} className="text-neutral-500" />
        </button>
      </SheetRow>
      {open && (
        <WheelSheet plain title="繰り返し" onClose={() => setOpen(false)} onConfirm={() => { onChange(tmp); setOpen(false); }}>
          <div className="w-full px-1 py-1">
            <RepeatEditor value={tmp} onChange={setTmp} />
          </div>
        </WheelSheet>
      )}
    </RowCard>
  );
}

/* ============================================================
   日付と時刻の行（メモ・写真・チェックリスト・リンク用）
   画像の手帳のように、いちばん上に日付と時刻だけを置く
   ============================================================ */
function WhenRow({ rec, onChange, withTime }) {
  if (rec.scope === "week" || rec.scope === "month") {
    return (
      <div className="flex items-center gap-2 mb-3 text-neutral-500">
        <CalendarDays size={19} className="shrink-0" />
        <span className="text-[15.5px] text-neutral-900">
          {rec.scope === "week" ? `${fmtDate(rec.date)} の週` : `${rec.date.slice(0, 4)}年${Number(rec.date.slice(5, 7))}月`}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <CalendarDays size={19} className="text-neutral-400 shrink-0" />
      <DateInput pill value={rec.date} onChange={(e) => onChange({ date: e.target.value })} />
      {withTime && (
        rec.time ? (
          <span className="flex items-center">
            <TimeInput pill value={rec.time} onChange={(v) => onChange({ time: v })} />
            <button type="button" onClick={() => onChange({ time: null })} aria-label="時刻をなくす"
              className="w-9 h-9 flex items-center justify-center rounded-full text-neutral-400 ft-tap ft-tap-icon"><X size={16} /></button>
          </span>
        ) : (
          <TimeInput pill value="" placeholder="時刻" onChange={(v) => onChange({ time: v })} />
        )
      )}
    </div>
  );
}

/* ============================================================
   RecordForm ＝ 記録を書く画面
   **項目名も使い方の説明も置かないこと。**
   何を書く欄かは、欄の中の薄い字だけで分かるようにしてある。
   ============================================================ */
function RecordForm({ initial, onSave, onCancel, onDelete, knownTags, onCreateTag, plans, onAutoDraft }) {
  const [rec, setRec] = useState(() => migrateRecord(initial) || emptyRecord("memo"));
  const [confirmDel, setConfirmDel] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState(null);
  const N = useTypeNames();
  const color = useTypeColor(rec.type);

  const set = (patch) => { setRec((r) => ({ ...r, ...patch })); setDirty(true); };

  /* 自動下書き：入力が止まって0.8秒後と、アプリが背面に回ったとき。
     **保存し終えたあとは書かないこと。**（doneRef）
     書いてしまうと、保存ずみの記録が「書きかけ」として残り、
     開き直したときに同じものがもう一枚あるように見える */
  const recRef = useRef(rec); recRef.current = rec;
  const doneRef = useRef(false);
  useEffect(() => {
    if (!dirty || !onAutoDraft) return undefined;
    const t = setTimeout(() => { if (!doneRef.current) onAutoDraft(recRef.current); }, 800);
    return () => clearTimeout(t);
  }, [rec, dirty, onAutoDraft]);
  useEffect(() => {
    if (!onAutoDraft) return undefined;
    /* **入れた覚えは必ず外すこと。** 外し忘れると、画面を閉じたあとも
       この仕掛けが残り、消したはずの下書きが書き戻される */
    const flush = () => { if (!doneRef.current) onAutoDraft(recRef.current); };
    const onVis = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", flush);
    };
  }, [onAutoDraft]);

  const finish = () => { doneRef.current = true; onSave({ ...rec, updatedAt: new Date().toISOString() }, {}); };
  /* 書きかけのまま閉じようとしたら、いちど確かめる。
     **黙って閉じないこと。** 書いたものが消えたように見える */
  const [confirmLeave, setConfirmLeave] = useState(false);
  const leave = () => { doneRef.current = true; onCancel(); };
  const cancel = () => { if (dirty) setConfirmLeave(true); else leave(); };

  const canSave = (() => {
    if (rec.type === "link") return !!(rec.url || "").trim();
    if (rec.type === "schedule") return !!(rec.title || "").trim();
    if (rec.type === "checklist") return !!(rec.title || "").trim() || (rec.items || []).length > 0;
    if (rec.type === "media") return (rec.images || []).length > 0 || !!(rec.text || "").trim();
    return !!(rec.text || "").trim();
  })();

  const starred = !!rec.mark;

  /* 開始時刻を決めたら、終了時刻は1時間後を入れておく。
     すでに手で終了を決めているときは、そのぶんの長さを保って動かす */
  const setStart = (v) => {
    if (!v) { set({ time: null }); return; }
    const mins = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
    const hhmm = (n) => `${String(Math.floor((n % 1440) / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
    const before = mins(rec.time), after = mins(rec.endTime), now = mins(v);
    const span = (before !== null && after !== null && after >= before) ? after - before : 60;
    set({ time: v, endTime: now === null ? rec.endTime : hhmm(now + span) });
  };

  return (
    <OverlayScreen from="bottom" zIndex={60}>
      <div className="absolute inset-0 bg-white flex flex-col">
        {/* ヘッダ。左に閉じる、右に星。それ以外は置かない */}
        <div className="px-3 pb-2 flex items-center gap-1 shrink-0" style={SAFE_TOP(10)}>
          <TapButton onClick={cancel} aria-label="キャンセル"
            className="min-w-[52px] min-h-[52px] flex items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 shrink-0">
            <X size={26} />
          </TapButton>
          <span className="flex-1 min-w-0 flex items-center justify-center gap-1.5">
            <span style={{ color: color.deep }}>{typeIcon(rec.type, 17)}</span>
            <span className="text-[15.5px] font-bold text-neutral-700 truncate">{N[rec.type] || TYPE_LABELS[rec.type]}</span>
          </span>
          {/* 印はここだけ。押すと入る、もう一度押すと外れる */}
          <button type="button" onClick={() => set({ mark: starred ? null : "star" })}
            aria-pressed={starred} aria-label="大事な記録にする"
            className="min-w-[52px] min-h-[52px] flex items-center justify-center rounded-full ft-tap ft-tap-icon shrink-0"
            style={{ color: starred ? "#F59E0B" : "#A3A3A3" }}>
            <span key={starred ? "on" : "off"} className={"flex " + (starred ? "ft-mark" : "")}>
              <Star size={25} fill={starred ? "#F59E0B" : "none"} />
            </span>
          </button>
        </div>

        {/* 中身 */}
        <div className="flex-1 overflow-y-auto px-5 pb-28 max-w-2xl mx-auto w-full">
          {err && <p className="text-[13.5px] font-bold text-rose-700 mb-3">{err}</p>}

          {/* いつのことか → タグ → 中身、の順にそろえる。
              **画面ごとに順番を変えないこと。** 迷わず手が動くようにするため */}
          {rec.type !== "schedule" && (
            <WhenRow rec={rec} onChange={set} withTime={rec.type === "media" || rec.type === "checklist"} />
          )}

          {rec.type === "schedule" && (
            <input value={rec.title} onChange={(e) => set({ title: e.target.value })} placeholder="予定の名前"
              className="w-full ft-input text-[19px] font-bold bg-transparent py-2 mb-2 text-neutral-900 placeholder-neutral-300 focus:outline-none" />
          )}
          {rec.type === "schedule" && (
            <>
              <RowCard className="mb-3">
                <SheetRow label="終日">
                  <Switch on={!!rec.allDay} onChange={(v) => set({ allDay: v })} label="終日" />
                </SheetRow>
                <SheetRow label="開始">
                  <span className="flex items-center gap-2">
                    <DateInput pill value={rec.date} onChange={(e) => set({ date: e.target.value })} />
                    {!rec.allDay && <TimeInput pill value={rec.time} placeholder="時刻" onChange={(v) => setStart(v)} />}
                  </span>
                </SheetRow>
                <SheetRow label="終了" last>
                  <span className="flex items-center gap-2">
                    <DateInput pill value={rec.endDate || rec.date} onChange={(e) => set({ endDate: e.target.value })} />
                    {!rec.allDay && <TimeInput pill value={rec.endTime} placeholder="時刻" onChange={(v) => set({ endTime: v })} />}
                  </span>
                </SheetRow>
              </RowCard>
              <RepeatRow value={rec.repeat} onChange={(v) => set({ repeat: v })} />
            </>
          )}

          <div className="mb-4">
            <TagField value={rec.tags} onChange={(v) => set({ tags: v })} knownTags={knownTags} onCreateTag={onCreateTag} />
          </div>

          {/* --- メモ --- */}
          {rec.type === "memo" && (
            <TextArea bare value={rec.text} onChange={(e) => set({ text: e.target.value })} minRows={8}
              placeholder="思ったこと" />
          )}

          {/* --- 画像 --- */}
          {rec.type === "media" && (
            <>
              <div className="mb-4"><ImagesField images={rec.images} onChange={(v) => set({ images: v })} onError={setErr} /></div>
              <TextArea bare value={rec.text} onChange={(e) => set({ text: e.target.value })} minRows={5}
                placeholder="そのときのこと" />
            </>
          )}

          {/* --- チェックリスト --- */}
          {rec.type === "checklist" && (
            <>
              {/* **繰り返しは、やることを書く前に置くこと。**
                  「これは毎日やるものか」を先に決めるほうが、書く手が迷わない */}
              {rec.scope === "day" && <RepeatRow value={rec.repeat} onChange={(v) => set({ repeat: v })} />}
              <input value={rec.title} onChange={(e) => set({ title: e.target.value })} placeholder="チェックリストの題"
                className="w-full ft-input text-[19px] font-bold bg-transparent py-2 mb-1 text-neutral-900 placeholder-neutral-300 focus:outline-none" />
              <div className="mb-3"><ChecklistEditor items={rec.items || []} onChange={(v) => set({ items: v })} /></div>
            </>
          )}

          {/* --- リンク --- */}
          {rec.type === "link" && (
            <>
              <input value={rec.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" inputMode="url"
                className="w-full ft-input bg-transparent py-2.5 text-th-800 placeholder-neutral-300 focus:outline-none break-all" />
              <input value={rec.title} onChange={(e) => set({ title: e.target.value })} placeholder="何のリンクか"
                className="w-full ft-input bg-transparent py-2.5 border-t border-neutral-100 text-neutral-900 placeholder-neutral-300 focus:outline-none" />
            </>
          )}

          {/* --- スケジュール --- */}
          {rec.type === "schedule" && (
            <>
              <TextArea bare value={rec.body} onChange={(e) => set({ body: e.target.value })} minRows={3} placeholder="予定の内容" />
              {/* 場所とそのリンクは、同じ形・同じ幅でならべる。
                  **片方だけ細い線の欄にしないこと。** ちぐはぐに見えて、詰まって感じる */}
              <div className="mt-3 space-y-2">
                <TextInput value={rec.place} onChange={(e) => set({ place: e.target.value })} placeholder="場所" />
                <TextInput value={rec.placeUrl} onChange={(e) => set({ placeUrl: e.target.value })} placeholder="場所のリンク" inputMode="url" />
              </div>
            </>
          )}

          {/* コメント（見るときは吹き出しで出る）。ここも枠で囲わず、区切り線だけ */}
          <div className="mt-3 pt-2 border-t border-neutral-100">
            <TextArea bare value={rec.comment} onChange={(e) => set({ comment: e.target.value })} minRows={2} placeholder="コメント" />
          </div>

          {plans && plans.length > 0 && rec.scope === "day" && (
            <div className="mt-3">
              <DrumSelect value={rec.planId || ""} onChange={(v) => set({ planId: v || null })}
                options={plans.map((p) => ({ value: p.id, label: p.name || "（名前なし）" }))}
                placeholder="計画を選択" title="計画を選択" />
            </div>
          )}

          {onDelete && (
            <button type="button" onClick={() => setConfirmDel(true)}
              className={BTN_DANGER_SOFT + " w-full " + BTN_H + " text-[14.5px] mt-5"}><Trash2 size={16} /> 削除</button>
          )}
        </div>

        {/* 決定。**保存だけを置かないこと。** やめる道が見えないと落ち着かない */}
        <div className="shrink-0 bg-white border-t border-neutral-200 px-5 py-3 flex gap-2.5" style={SAFE_BOTTOM(12)}>
          <button type="button" onClick={cancel}
            className={BTN_SECONDARY + " btn-h-lg px-6 text-[16px]"}>キャンセル</button>
          <button type="button" onClick={finish} disabled={!canSave}
            className={BTN_PRIMARY + " flex-1 btn-h-lg text-[17px]"}><Check size={20} /> 保存する</button>
        </div>

        {confirmLeave && (
          <ConfirmDialog title="保存せずに閉じますか" body="書いた内容は残りません。" danger={false} confirmLabel="閉じる"
            onCancel={() => setConfirmLeave(false)} onConfirm={() => { setConfirmLeave(false); leave(); }} />
        )}

        {confirmDel && (
          <ConfirmDialog title="削除しますか" body="消すと元に戻せません。"
            onCancel={() => setConfirmDel(false)} onConfirm={() => { setConfirmDel(false); onDelete(); }} />
        )}
      </div>
    </OverlayScreen>
  );
}

/* ============================================================
   ＋を押したあとの「記録の種類」
   **ここは順に現れさせないこと。** 開いた瞬間から選べるほうがよい
   ============================================================ */
function TypeRow({ t, onPick, label, icon }) {
  const N = useTypeNames();
  const color = useTypeColor(t);
  const [pressed, go] = useTapThen(() => onPick(t));
  return (
    <button type="button" onClick={go}
      className={"w-full flex items-center gap-3 px-3 py-3 min-h-[64px] rounded-xl text-left ft-tap ft-tap-card "
        + (pressed ? "bg-neutral-200 ft-tap-pressed" : "hover:bg-neutral-50")}>
      <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: color.soft, border: `1px solid ${color.line}`, color: color.deep }}>{icon || typeIcon(t, 22)}</span>
      {/* **ここに説明文を並べないこと。** 名前だけのほうが選ぶ手が速い */}
      <span className="flex-1 min-w-0 text-[15.5px] font-bold text-neutral-900">{label || N[t] || TYPE_LABELS[t]}</span>
      <ChevronRight size={18} className="text-neutral-400 shrink-0" />
    </button>
  );
}

function TypePickSheet({ onPick, onCancel, title = "記録の種類", types = TYPES, labels, icons }) {
  const [closing, close] = useClosing(onCancel, 240);
  return (
    <div className="ft-sheet-wrap flex items-end justify-center" style={{ zIndex: 2147483000 }} onClick={close}>
      <div className={"absolute inset-0 bg-black/40 " + (closing ? "anim-fade-out" : "anim-fade")} />
      <div className={"relative w-full max-w-lg bg-white rounded-t-2xl border-t border-neutral-100 shadow-lg "
        + (closing ? "anim-sheet-out" : "anim-sheet")}
        onClick={(e) => e.stopPropagation()} style={SAFE_BOTTOM(12)}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          <span className="font-display text-[15.5px] text-neutral-900">{title}</span>
          <button type="button" onClick={close} aria-label="閉じる"
            className="min-w-[52px] min-h-[52px] flex items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100"><X size={28} /></button>
        </div>
        <div className="p-2">
          {types.map((t) => (
            <TypeRow key={t} t={t} onPick={onPick}
              label={labels ? labels[t] : null} icon={icons ? icons[t] : null} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* 前回、保存しないまま閉じられた記録を知らせるカード */
function DraftCard({ draft, onResume, onDiscard }) {
  const N = useTypeNames();
  const color = useTypeColor(draft.type);
  const [closing, close] = useClosing(onDiscard, 180);
  useLockBackground();
  /* **画面の上に居すわらせないこと。**
     毎回そこにあると、記録の並びを押しのけてしまう。
     開いたときに一度だけたずねて、答えたら消える形にする */
  return (
    <div className={"ft-sheet-wrap flex items-start justify-center px-6 " + (closing ? "anim-fade-out" : "anim-fade")}
      style={{ zIndex: 2147483300, paddingTop: "calc(env(safe-area-inset-top) + 72px)" }}>
      <div className="absolute inset-0 bg-black/45" />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-lg p-5 anim-pop">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: color.soft, color: color.deep }}>{typeIcon(draft.type, 19)}</span>
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-neutral-500">書きかけの記録があります</p>
            <p className="text-[15.5px] font-bold text-neutral-900 truncate">{recordTitle(draft, N)}</p>
          </div>
        </div>
        <div className="flex gap-2.5">
          <button type="button" onClick={close} className={BTN_SECONDARY + " flex-1 btn-h-lg text-[15.5px]"}>削除</button>
          <button type="button" onClick={onResume} className={BTN_PRIMARY + " flex-1 btn-h-lg text-[15.5px]"}>続きから書く</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   タイムラインの札（記録概要）
   タップすると閲覧、鉛筆で編集
   ============================================================ */
function ProgressBar({ ratio, color }) {
  return (
    <span className="block h-1 rounded-full bg-neutral-100 overflow-hidden">
      <span className="block h-full rounded-full transition-all duration-300"
        style={{ width: `${Math.round(ratio * 100)}%`, background: color }} />
    </span>
  );
}

function CheckRow({ item, onToggle, size = "m" }) {
  const big = size === "l";
  return (
    <button type="button" onClick={onToggle}
      className={"w-full flex items-start gap-2.5 text-left rounded-xl ft-tap ft-tap-card " + (big ? "px-2 py-2.5 min-h-[52px]" : "px-1.5 py-2 min-h-[52px]")}>
      {/* チェックの形は、どの画面でも同じ「まるい枠」にそろえる。
          **四角と丸を混ぜないこと。** 押す所が毎回ちがって見える */}
      <span className={"shrink-0 rounded-full border-2 flex items-center justify-center mt-0.5 " + (big ? "w-6 h-6" : "w-5 h-5")}
        style={item.done ? { background: "var(--th-800)", borderColor: "var(--th-800)" } : { borderColor: "#C4C4C4" }}>
        {/* 入った瞬間だけ弾ませたいので、key を変えて描き直させている */}
        {item.done && <span key="on" className="flex ft-check-in text-white"><Check size={big ? 14 : 12} strokeWidth={3.5} className="thick" /></span>}
      </span>
      <span className={(big ? "text-[15.5px]" : "text-[13.5px]") + " leading-snug flex-1 min-w-0 break-words "
        + (item.done ? "text-neutral-400 line-through" : "text-neutral-800")}>{item.text}</span>
    </button>
  );
}

/* コメントは吹き出しで、記録の下部に出す */
/* コメントの吹き出し。
   **しっぽと本体の境目に線を残さないこと。**
   本体の上の線は、しっぽの下に白い帯を重ねて消している（同じ絵の中で消す）。
   別々の要素で消そうとすると、位置がずれて線が見えてしまう */
function CommentBubble({ text, small }) {
  if (!text) return null;
  const line = "#B9BDC2";
  return (
    <div className="relative mt-3">
      <svg width="26" height="14" viewBox="0 0 26 14" className="block ml-4 relative z-10"
        style={{ marginBottom: -4.2 }} aria-hidden="true">
        {/* しっぽの中身（白）と、本体の上の線を隠す帯（白） */}
        <path d="M13 1.2 L24 10.4 L2 10.4 Z" fill="#FFFFFF" />
        <rect x="2" y="9.4" width="22" height="4.6" fill="#FFFFFF" />
        {/* しっぽの2辺だけを線で描く。
            **本体の線より下まで伸ばさないこと。** 足が生えたように見える */}
        <path d="M2.2 10 L12.1 2.2 A1.3 1.3 0 0 1 13.9 2.2 L23.8 10"
          fill="none" stroke={line} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className={"relative z-0 rounded-2xl bg-white " + (small ? "px-3.5 py-2.5" : "px-4 py-3")}
        style={{ border: `1.4px solid ${line}` }}>
        <LinkedText text={text} className={(small ? "text-[13px]" : "text-[14px]") + " leading-relaxed text-neutral-700"} />
      </div>
    </div>
  );
}

function timeLabel(r) {
  if (r.type === "schedule" && r.allDay) return "終日";
  if (!r.time) return "";
  if (r.type === "schedule" && r.endTime) return `${r.time}–${r.endTime}`;
  return r.time;
}

/* 見出しに使った1行目をのぞいた、のこりの本文。
   restOfText ＝ 概要に添える1行ぶん（改行はつめる）
   restOfLines ＝ 開いたときに見せる本文（改行はそのまま） */
function restOfText(r) {
  return (r.text || "").trim().split("\n").slice(1).join(" ").trim();
}
function restOfLines(r) {
  return (r.text || "").trim().split("\n").slice(1).join("\n").trim();
}

/* ============================================================
   タイムラインの札
   ・はじめは概要だけ。タップすると、たたんであった中身がぜんぶ開く
   ・**開いた札は、ほかの札を開いても閉じないこと。**
     開き閉じはこの札じぶんで覚えている（親でひとつだけ覚えると、
     新しく開いたときに前のが閉じてしまう）
   ============================================================ */

/* 開いたときに出る、記録の中身ぜんぶ */
/* ============================================================
   タイムラインの札（Xのつぶやきのような並び）
   ・**たたまないこと。** 中身ははじめから全部見えている
   ・左は丸いしるしの列。時刻のある記録は、この列を縦線が串のように貫く
   ・枠で囲わず、うすい横線で区切るだけにする
   ============================================================ */
function RecordRow({ r, onEdit, onToggleItem, repeated, selectMode, selected, onSelect,
  lineUp, lineDown, onPin }) {
  const N = useTypeNames();
  const color = useTypeColor(r.type);
  const [moving, setMoving] = useState(null);
  const [photo, setPhoto] = useState(null);   // 大きく見ている写真の番号
  const acts = React.useContext(RecordActionsContext);
  const ratio = r.type === "checklist" ? doneRatio(r) : null;
  const allDone = ratio && ratio.total > 0 && ratio.done === ratio.total;
  const t = timeLabel(r);
  const canMove = !!(acts && acts.onMoveItem) && r.type === "checklist" && !r.__repeat;
  const body = (r.type === "memo" || r.type === "media") ? restOfLines(r) : "";

  const tap = () => { if (selectMode) onSelect(r); };

  return (
    /* 左に時間の筋、右に白い札。**札を枠で囲わないこと。**
       うすい影で浮かせるほうが、並んだときに軽く見える */
    <div onClick={tap} className={"flex gap-2.5 px-4 pb-3 relative " + (selectMode ? "ft-tap cursor-pointer " : "")}>

      {/* 左は細い帯。線と、時刻のある記録の小さな点だけ。
          **ここにしるしを置かないこと。** そのぶん札が細くなり、字が読みにくくなる
          （種類のしるしは、札の中の1行目に置いてある） */}
      <span className={"shrink-0 relative flex justify-center " + (selectMode ? "w-8" : "w-4")}>
        {lineUp && !selectMode && <span className="absolute -top-2.5 h-6 border-l border-dashed border-th-200" />}
        {lineDown && !selectMode && <span className="absolute top-5 -bottom-2.5 border-l border-dashed border-th-200" />}
        {(lineUp || lineDown) && !selectMode && (
          <span className="absolute top-3.5 w-2 h-2 rounded-full" style={{ background: color.mid }} />
        )}
        {/* えらぶ最中の丸は、**札の外（左）に出すこと。**
            札の中に置くと、種類のしるしと並んで見分けがつかない */}
        {selectMode && (
          <span className="absolute top-3 w-6 h-6 rounded-full border-2 flex items-center justify-center"
            style={selected ? { background: color.deep, borderColor: color.deep } : { borderColor: "#C4C4C4", background: "#FFFFFF" }}>
            {selected && <span key="on" className="flex text-white ft-check-in"><Check size={15} strokeWidth={3.5} className="thick" /></span>}
          </span>
        )}

      </span>

      {/* えらぶ最中は、札ぜんたいが押せる。
          **小さな丸だけを的にしないこと。** どこを押せばよいか分からない */}
      <article className={"flex-1 min-w-0 rounded-2xl px-4 py-3.5 card-soft "
        + (selectMode
          ? (selected ? "bg-th-50 border border-th-800" : "bg-white border border-dashed border-neutral-300")
          : "bg-white")}
        style={(!selectMode && r.pinned) ? { boxShadow: `inset 3px 0 0 ${color.mid}, 0 1px 3px rgba(30,60,55,.07)` } : undefined}>
        {/* 上の1行：時刻・種類・印。Xの「名前と時刻」の並びに近い */}
        <div className="flex items-center gap-1.5 mb-0.5">
          {/* しるしは、この行のいちばん左に。**札の外に出さないこと** */}
          <span className="shrink-0 flex" style={{ color: color.deep }}>{typeIcon(r.type, 15)}</span>
          {t && <span className="text-[13px] font-bold tabular-nums" style={{ color: color.deep }}>{t}</span>}
          <span className="text-[12.5px] text-neutral-400 truncate">{N[r.type] || TYPE_LABELS[r.type]}</span>
          {repeated && <Repeat size={12} className="text-neutral-300 shrink-0" />}
          {r.mark && <MarkDot mark={r.mark} />}
          <span className="flex-1" />
          {/* ピンと鉛筆は、ひとまとまりに見えるよう間を詰めて置く */}
          {/* ピンと鉛筆は、まるい皿にのせて隣り合わせに置く。
              **離して置かないこと。** ばらばらだと、まとまりに見えない */}
          {!selectMode && (
            <span className="flex items-center gap-1 -mr-1 -mt-1 shrink-0">
              {/* **上向きの矢印にしないこと。** 「上へ動かす」と読めてしまう。
                  押しピンの絵なら「留めておく」と分かる */}
              {onPin && !r.__repeat && (
                <button type="button" onClick={(e) => { e.stopPropagation(); onPin(r); }}
                  aria-label={r.pinned ? "固定を解除" : "上に固定"} aria-pressed={!!r.pinned}
                  className="w-9 h-9 flex items-center justify-center rounded-full ft-tap ft-tap-icon"
                  style={r.pinned
                    ? { background: color.soft, color: color.deep }
                    : { background: "#F5F5F5", color: "#A3A3A3" }}>
                  <span key={r.pinned ? "on" : "off"} className={"flex " + (r.pinned ? "ft-mark" : "")}>
                    <Pin size={17} fill={r.pinned ? "currentColor" : "none"} />
                  </span>
                </button>
              )}
              <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(r); }} aria-label="編集"
                className="w-9 h-9 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:text-th-800 ft-tap ft-tap-icon">
                <Pencil size={16} />
              </button>
            </span>
          )}
        </div>

        {/* 見出し。**種類名と同じ字が出るときは、出さないこと。**
            すぐ上に種類が書いてあるので、同じ言葉が二度ならぶ */}
        {recordTitle(r, N) && recordTitle(r, N) !== (N[r.type] || TYPE_LABELS[r.type])
          && !(r.type === "link" && !(r.title || "").trim()) && (
          <p className={"text-[15px] font-bold leading-snug break-words mb-1 "
            + (allDone ? "text-neutral-400" : "text-neutral-900")}>{recordTitle(r, N)}</p>
        )}

        {/* 本文 */}
        {body && <LinkedText text={body} className="text-[14.5px] leading-relaxed text-neutral-800 mb-1.5" />}
        {r.type === "schedule" && (r.body || "").trim() && (
          <LinkedText text={r.body} className="text-[14.5px] leading-relaxed text-neutral-800 mb-1.5" />
        )}
        {r.type === "schedule" && r.endDate && r.endDate !== r.date && (
          <p className="text-[12.5px] text-neutral-500 mb-1.5 tabular-nums">{scheduleWhen(r)}</p>
        )}
        {r.type === "schedule" && r.place && (
          <p className="text-[13px] text-neutral-600 mb-1.5 flex items-center gap-1"><MapPin size={14} className="text-neutral-400" />{r.place}</p>
        )}

        {/* 写真 */}
        {r.type === "media" && (r.images || []).length > 0 && (
          <div className={"grid gap-1.5 mb-2 rounded-2xl overflow-hidden " + (r.images.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
            {/* **縦長の写真をそのまま出さないこと。**
                タイムラインが一枚で埋まってしまう。4対3に切りそろえて見せる */}
            {/* 形は style で直に決める。**クラス名だけに頼らないこと。**
                当て方の設定次第で効かないことがあり、縦長の写真がそのまま伸びてしまう */}
            {r.images.map((src, i) => (
              <button key={i} type="button" aria-label="拡大"
                onClick={(e) => { e.stopPropagation(); if (!selectMode) setPhoto(i); }}
                className="block bg-neutral-100 overflow-hidden ft-tap ft-tap-card"
                style={{ aspectRatio: r.images.length === 1 ? "4 / 3" : "1 / 1" }}>
                <Photo src={src} className="block w-full h-full" style={{ objectFit: "cover" }} />
              </button>
            ))}
          </div>
        )}

        {/* リンク。Xの引用カードのように、押せる一枚にする。
            **住所を二度出さないこと。** 見出しにも出ていると、くどくなる */}
        {r.type === "link" && (r.url || "").trim() && (
          <a href={r.url} target="_blank" rel="noopener noreferrer" onClick={(e) => selectMode && e.preventDefault()}
            className="flex items-center gap-2.5 rounded-2xl border border-neutral-200 bg-neutral-50 px-3.5 py-3 mb-2 ft-tap ft-tap-card ft-link">
            <span className="w-9 h-9 rounded-xl bg-white border border-neutral-200 flex items-center justify-center shrink-0 text-neutral-500">
              <LinkIcon size={17} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[12px] text-neutral-500">{hostOf(r.url)}</span>
              <span className="block text-[13.5px] text-th-800 truncate leading-snug">{shortUrl(r.url)}</span>
            </span>
            <ChevronRight size={17} className="text-neutral-300 shrink-0" />
          </a>
        )}
        {r.type === "schedule" && r.placeUrl && (
          <a href={r.placeUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => selectMode && e.preventDefault()}
            className="inline-flex items-center gap-1.5 text-[13px] text-th-800 mb-2 ft-link"><MapPin size={14} /> 場所をひらく</a>
        )}

        {/* チェックリスト */}
        {ratio && (
          <div className="mb-1">
            {ratio.total > 0 && (
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[12px] font-bold tabular-nums" style={{ color: allDone ? color.deep : "#737373" }}>{ratio.done}/{ratio.total}</span>
                <span className="flex-1"><ProgressBar ratio={ratio.ratio} color={color.mid} /></span>
              </div>
            )}
            <div className="-ml-1.5">
              {(r.items || []).map((it) => (
                <div key={it.id} className="flex items-center gap-1">
                  <span className="flex-1 min-w-0">
                    <CheckRow item={it} size="l" onToggle={() => { if (!selectMode) onToggleItem(r, it.id); }} />
                  </span>
                  {canMove && !selectMode && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); setMoving(it); }} aria-label="別のリストへ移す"
                      className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full text-neutral-300 hover:text-th-800 hover:bg-neutral-100 ft-tap ft-tap-icon">
                      <ArrowRightLeft size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {r.repeat && r.repeat.freq !== "none" && (
              <p className="text-[12px] text-neutral-400 mt-0.5 flex items-center gap-1"><Repeat size={12} />{repeatLabel(r.repeat)}</p>
            )}
          </div>
        )}

        {normalizeTags(r.tags).length > 0 && <TagChips tags={r.tags} className="mt-2" />}
        {r.comment && <CommentBubble text={r.comment} small />}
      </article>

      {photo !== null && (
        <PhotoViewer images={r.images || []} index={photo} onClose={() => setPhoto(null)} />
      )}

      {moving && acts && (
        <MoveItemSheet item={moving} from={r} records={acts.records || []}
          onCancel={() => setMoving(null)}
          onMove={(toId) => { acts.onMoveItem(r, moving, toId); setMoving(null); }}
          onCreate={(name) => { acts.onCreateAndMove(r, moving, name); setMoving(null); }} />
      )}
    </div>
  );
}

/* リンクの住所から、見せる名前だけを取り出す */
/* ============================================================
   拡大窓
   タイムラインでは4対3に切っているので、全体はここで見る
   ============================================================ */
function PhotoViewer({ images, index, onClose }) {
  const [i, setI] = useState(index || 0);
  const [closing, close] = useClosing(onClose, 180);
  useLockBackground();
  const list = images || [];
  const go = (d) => setI((v) => (v + d + list.length) % list.length);
  return (
    <div className={"ft-sheet-wrap flex items-center justify-center " + (closing ? "anim-fade-out" : "anim-fade")}
      style={{ zIndex: 2147483400 }} onClick={close}>
      <div className="absolute inset-0 bg-black/90" />
      <div className="relative w-full h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center px-3 shrink-0" style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}>
          <button type="button" onClick={close} aria-label="閉じる"
            className="w-12 h-12 flex items-center justify-center rounded-full text-white ft-tap ft-tap-icon"><X size={24} /></button>
          <span className="flex-1" />
          {list.length > 1 && <span className="text-[13.5px] text-white/70 tabular-nums pr-3">{i + 1} / {list.length}</span>}
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center px-2" onClick={close}>
          {/* 切らずに、画面に収まるいちばん大きさで見せる */}
          <Photo src={list[i]} className="max-w-full max-h-full" style={{ objectFit: "contain" }} />
        </div>
        {list.length > 1 && (
          <div className="flex items-center justify-center gap-3 pb-6 shrink-0" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}>
            <button type="button" onClick={() => go(-1)} aria-label="前の写真"
              className="w-14 h-14 rounded-full bg-white/15 text-white flex items-center justify-center ft-tap ft-tap-icon"><ChevronLeft size={24} /></button>
            <button type="button" onClick={() => go(1)} aria-label="次の写真"
              className="w-14 h-14 rounded-full bg-white/15 text-white flex items-center justify-center ft-tap ft-tap-icon"><ChevronRight size={24} /></button>
          </div>
        )}
      </div>
    </div>
  );
}

/* 住所は長いので、うしろのほうだけ見せる */
function shortUrl(url) {
  const s = String(url || "").replace(/^https?:\/\//i, "").replace(/^www\./, "");
  return s.length > 60 ? s.slice(0, 58) + "…" : s;
}

function hostOf(url) {
  const m = /^https?:\/\/([^/?#]+)/i.exec(String(url || ""));
  return m ? m[1].replace(/^www\./, "") : "リンク";
}

/* スケジュールの日時の言い方。**ここ1か所で決めること** */
function scheduleWhen(r) {
  if (r.allDay) {
    const end = r.endDate && r.endDate !== r.date ? ` 〜 ${fmtDate(r.endDate)}` : "";
    return `${fmtDate(r.date)}${end}・終日`;
  }
  const s = `${fmtDate(r.date)} ${r.time || ""}`.trim();
  if (r.endDate && r.endDate !== r.date) return `${s} 〜 ${fmtDate(r.endDate)} ${r.endTime || ""}`.trim();
  if (r.endTime) return `${s} 〜 ${r.endTime}`;
  return s;
}

/* ============================================================
   1日ごとの画面（全ての記録がタイムラインで並ぶ）
   ============================================================ */
function DayTimeline({ date, records, onEdit, onToggleItem, selectMode, selectedIds, onSelect, onPin, hidden, sort }) {
  const list = useMemo(() => {
    const own = records.filter((r) => isDayRec(r) && r.date === date);
    /* 繰り返しの記録は、その日ぶんの控えを作って並べる（元の記録は書き換えない） */
    /* 繰り返しから作る仮の札には、**表示している日付を入れること。**
       元の日付のままだと、チェックを入れたとき別の日の記録が作られてしまう */
    /* 繰り返しは、チェックリストだけでなく**予定にも効かせること**。
       毎週の授業などが、その日に出てこないと役に立たない */
    /* その日ぶんの実体がすでにあるなら、仮の札は出さない。
       **出してしまうと、同じ札が二枚ならぶ。** */
    const madeFrom = new Set(own.filter((r) => r.fromRepeat).map((r) => r.fromRepeat));
    const rep = records.filter((r) => (r.type === "checklist" || r.type === "schedule")
      && repeatsOn(r, date) && !madeFrom.has(r.id))
      .map((r) => ({
        ...r, __repeat: true, date,
        endDate: r.endDate && r.endDate !== r.date ? date : "",
        items: (r.items || []).map((i) => ({ ...i, done: false })),
      }));
    let all = [...own, ...rep];
    if (hidden && hidden.length) all = all.filter((r) => !hidden.includes(r.type));
    /* 並べかた。時間順が既定。新しい順は、書いた時刻の新しいものから */
    if (sort === "new") {
      return all.slice().sort((a, b) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
    }
    return all.sort(compareTimeline);
  }, [records, date, hidden, sort]);

  /* **絵文字を置かないこと。** 画面の調子がそこだけ変わって見える */
  if (!list.length) {
    return (
      <div className="py-14 text-center ft-noresult">
        <p className="text-[14.5px] text-neutral-400">この日はまだ記録がありません</p>
      </div>
    );
  }
  /* 時刻の入った記録は、しるしの列を縦線が貫いて串のように見える。
     時刻のないものには線を引かない（つながっていないほうが正しい） */
  const timed = (r) => !!r.time || (r.type === "schedule" && r.allDay);
  return (
    /* 端まで使う。**左右の余白をここで足さないこと。**（札じたいが余白を持っている） */
    <div className="ft-seq -mx-5 pt-1">
      {list.map((r, i) => {
        const on = timed(r);
        return (
          <RecordRow key={r.id + (r.__repeat ? "-rep" : "")} r={r} repeated={r.__repeat}
            onEdit={onEdit} onToggleItem={onToggleItem}
            lineUp={on && i > 0 && timed(list[i - 1])}
            lineDown={on && i < list.length - 1 && timed(list[i + 1])}
            onPin={onPin}
            selectMode={selectMode} selected={!!selectedIds && selectedIds.has(r.id)} onSelect={onSelect} />
        );
      })}
    </div>
  );
}

/* ============================================================
   1週間ごとの画面
   スケジュールとチェックリストが1週間ぶん見わたせる
   ============================================================ */
function WeekView({ start, records, onOpenDay }) {
  /* 色の一覧はここで一度だけ受け取る。
     **この受け取りを map の中に書かないこと。**（React の決まりで、
     繰り返しの中で受け取ると数が変わったときに壊れる） */
  const colorMap = React.useContext(ColorContext) || DEFAULT_TYPE_COLOR;
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = todayStr();
  return (
    /* 7日ぶんを2列で。**1列で縦に長くしないこと。**
       一週間ぜんたいを、指を動かさずに見わたせるようにする */
    <div className="grid grid-cols-2 gap-2 ft-seq">
      {days.map((d) => {
        const made = new Set(records.filter((r) => r.date === d && r.fromRepeat).map((r) => r.fromRepeat));
        const list = records.filter((r) => isDayRec(r) && ((r.date === d && (r.type === "schedule" || r.type === "checklist"))
          || ((r.type === "checklist" || r.type === "schedule") && repeatsOn(r, d) && !made.has(r.id))))
          .map((r) => (r.date === d ? r : { ...r, __repeat: true, date: d, items: (r.items || []).map((i) => ({ ...i, done: false })) }))
          .sort(compareTimeline);
        const dow = dowOf(d);
        const isToday = d === today;
        return (
          <div key={d} className={"rounded-2xl bg-white overflow-hidden card-soft " + (isToday ? "border border-th-800" : "")}>
            <button type="button" onClick={() => onOpenDay(d)}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-left hover:bg-neutral-50 ft-tap ft-tap-card min-h-[48px]">
              <span className={"text-[12.5px] font-bold shrink-0 " + weekColor(dow)}>{WEEK_LABELS[dow]}</span>
              <span className={"font-display text-[15px] " + (isToday ? "text-th-800" : "text-neutral-900")}>
                {Number(d.slice(5, 7))}/{Number(d.slice(8, 10))}
              </span>
              <span className="flex-1" />
              {list.length > 0 && <span className="text-[12px] text-neutral-400 tabular-nums">{list.length}</span>}
            </button>
            {list.length > 0 && (
              <div className="px-2 pb-2 space-y-1">
                {list.map((r) => {
                  const color = colorOf(colorMap[r.type]);
                  const ratio = r.type === "checklist" ? doneRatio(r) : null;
                  return (
                    <button key={r.id + (r.__repeat ? "-rep" : "")} type="button" onClick={() => onOpenDay(d)}
                      className="w-full flex flex-col items-start gap-0.5 text-left rounded-lg px-2 py-1.5 min-h-[44px] ft-tap ft-tap-card"
                      style={{ background: color.soft }}>
                      {timeLabel(r) && <span className="text-[11px] font-bold tabular-nums" style={{ color: color.deep }}>{timeLabel(r)}</span>}
                      <span className="text-[12.5px] font-bold text-neutral-800 truncate w-full">{recordTitle(r)}</span>
                      {ratio && ratio.total > 0 && (
                        <span className="text-[12px] font-bold tabular-nums shrink-0" style={{ color: color.deep }}>{ratio.done}/{ratio.total}</span>
                      )}
                      <MarkDot mark={r.mark} size={13} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   1ヶ月ごとの画面（各日付のスケジュール）
   ============================================================ */
function MonthView({ year, month, records, onOpenDay, onToggleItem }) {
  const colorMap = React.useContext(ColorContext) || DEFAULT_TYPE_COLOR;
  const firstDow = new Date(year, month - 1, 1).getDay();
  const lastDay = new Date(year, month, 0).getDate();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: lastDay }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const today = todayStr();
  const key = (d) => `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const inThisMonth = today.slice(0, 7) === `${year}-${String(month).padStart(2, "0")}`;

  /* 押した日を下に開く。**その場で日のタイムラインへ飛ばさないこと。**
     月を見ながら、いくつかの日をのぞいて回れるようにする。
     はじめは今日をえらんでおく（下に今日の予定が出る） */
  const [sel, setSel] = useState(inThisMonth ? today : null);
  useEffect(() => { setSel(inThisMonth ? today : null); }, [year, month]); // eslint-disable-line

  const byDate = useMemo(() => {
    const m = new Map();
    records.forEach((r) => {
      if (!r.date || !isDayRec(r)) return;
      if (!m.has(r.date)) m.set(r.date, []);
      m.get(r.date).push(r);
    });
    m.forEach((v) => v.sort(compareTimeline));
    return m;
  }, [records]);

  /* 下に出すのは、その日の予定とチェックリスト */
  const selMade = new Set(sel ? (byDate.get(sel) || []).filter((r) => r.fromRepeat).map((r) => r.fromRepeat) : []);
  const selList = sel ? [
    ...(byDate.get(sel) || []).filter((r) => r.type === "schedule" || r.type === "checklist"),
    ...records.filter((r) => isDayRec(r) && (r.type === "schedule" || r.type === "checklist")
      && repeatsOn(r, sel) && !selMade.has(r.id))
      .map((r) => ({ ...r, __repeat: true, date: sel })),
  ] : [];
  const MAX = 4;   // マスに出す予定の数

  return (
    <div>
      <div className="rounded-2xl bg-white card-soft border border-neutral-100 overflow-hidden">
        <div className="grid grid-cols-7 text-center text-[11.5px] font-bold py-1.5 border-b border-neutral-100">
          {WEEK_LABELS.map((d, i) => <div key={d} className={weekColor(i)}>{d}</div>)}
        </div>
        {/* マスに出すのは予定だけ。**チェックリストは出さないこと。**
            数が多く、予定の見通しがきかなくなる（押せば下に出る） */}
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            if (d === null) return <div key={"e" + i} className="min-h-[92px] border-b border-r border-neutral-100" />;
            const ds = key(d);
            const madeHere = new Set((byDate.get(ds) || []).filter((r) => r.fromRepeat).map((r) => r.fromRepeat));
            const sched = [
              ...(byDate.get(ds) || []).filter((r) => r.type === "schedule"),
              ...records.filter((r) => isDayRec(r) && r.type === "schedule" && repeatsOn(r, ds) && !madeHere.has(r.id)),
            ];
            const isToday = ds === today;
            const isSel = ds === sel;
            const dow = (firstDow + d - 1) % 7;
            return (
              <button key={ds} type="button" onClick={() => setSel(ds)}
                className={"min-h-[92px] border-b border-r border-neutral-100 px-0.5 pt-1 pb-1 flex flex-col items-stretch text-left ft-tap "
                  + (isSel ? "bg-th-50" : "hover:bg-neutral-50")}>
                <span className="flex justify-center mb-0.5">
                  <span className={"w-6 h-6 rounded-full flex items-center justify-center text-[12px] tabular-nums "
                    + (isToday ? "bg-th-800 text-white font-bold" : (isSel ? "font-bold " : "") + weekColor(dow))}>{d}</span>
                </span>
                <span className="flex-1 space-y-[2px] overflow-hidden">
                  {/* 小さくても、全角4〜5文字は読めるようにする。
                      **左右の余白を取りすぎないこと。** 字が入らなくなる */}
                  {sched.slice(0, MAX).map((r) => {
                    const c = colorOf(colorMap[r.type]);
                    return (
                      <span key={r.id} className="block text-[9px] leading-[13px] truncate rounded-[3px] px-[3px]"
                        style={{ background: c.soft, color: c.deep, letterSpacing: "-0.02em" }}>
                        {recordTitle(r) || "予定"}
                      </span>
                    );
                  })}
                  {sched.length > MAX && (
                    <span className="block text-[9.5px] leading-[12px] text-neutral-400 text-center">…</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* えらんだ日の、予定とチェックリスト */}
      {sel && (
        <div className="mt-3 rounded-2xl bg-white card-soft border border-neutral-100 overflow-hidden ft-open">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-100">
            <span className="font-display text-[15.5px] text-neutral-900">{fmtDate(sel)}</span>
            <span className="flex-1" />
            <span className="text-[12.5px] text-neutral-400 tabular-nums">{selList.length}件</span>
          </div>
          {selList.length === 0 ? (
            <p className="text-[13.5px] text-neutral-400 px-4 py-4">予定はありません</p>
          ) : (
            <div className="ft-seq py-1">
              {selList.map((r) => <RecordRow key={r.id} r={r} onEdit={() => onOpenDay(sel)} onToggleItem={onToggleItem} />)}
            </div>
          )}
          {/* **細い帯にしないこと。** 押せるものだと分かるよう、しっかり高さを取る */}
          <div className="p-3 pt-2">
            <button type="button" onClick={() => onOpenDay(sel)}
              className="w-full rounded-xl bg-th-50 flex items-center justify-center gap-1.5 text-[15px] font-bold text-th-900 ft-tap ft-tap-card"
              style={{ minHeight: 56 }}>
              {Number(sel.slice(5, 7))}/{Number(sel.slice(8, 10))} のタイムラインを見る <ChevronRight size={17} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   その週・その月ぜんたいに付ける記録
   日付に縛られないメモやチェックリストを、週や月の頭に置いておける
   ============================================================ */
function ScopedNotes({ scope, dateKey, records, onEdit, onToggleItem, onAdd, onPin }) {
  const list = useMemo(
    () => records.filter((r) => r.scope === scope && r.date === dateKey).sort(compareTimeline),
    [records, scope, dateKey]
  );
  return (
    <div className="mb-3">
      {list.length > 0 && (
        <div className="mb-2 ft-seq -mx-5 pt-1">
          {list.map((r) => <RecordRow key={r.id} r={r} onEdit={onEdit} onToggleItem={onToggleItem} onPin={onPin} />)}
        </div>
      )}
      <button type="button" onClick={() => onAdd(scope, dateKey)}
        className={BTN_SECONDARY + " w-full min-h-[52px] text-[13.5px] border-dashed text-neutral-500"}>
        <Plus size={15} /> この{scope === "week" ? "週" : "月"}のメモ
      </button>
    </div>
  );
}

/* ============================================================
   記録をえらんで、まとめて削除する
   ・「選択」を押すと、札を押すたびに選ばれる
   ・**選んだ最中は開かないこと。** 開くつもりで押した札が消えると困る
   ============================================================ */
function useSelectMode(onDeleteMany) {
  const [on, setOn] = useState(false);
  const [ids, setIds] = useState(() => new Set());
  const [confirm, setConfirm] = useState(false);
  const start = () => { setIds(new Set()); setOn(true); };
  const stop = () => { setOn(false); setIds(new Set()); };
  const toggle = (r) => setIds((s) => {
    const n = new Set(s);
    if (n.has(r.id)) n.delete(r.id); else n.add(r.id);
    return n;
  });
  /* いま出ているものを、まとめて選ぶ・はずす。
     **見えていないものまで選ばないこと。** あとで気づけなくなる */
  const setAll = (list) => setIds((s) => {
    const all = list.length > 0 && list.every((r) => s.has(r.id));
    const n = new Set(s);
    list.forEach((r) => (all ? n.delete(r.id) : n.add(r.id)));
    return n;
  });
  const allOf = (list) => list.length > 0 && list.every((r) => ids.has(r.id));
  const doDelete = () => { if (onDeleteMany) onDeleteMany(Array.from(ids)); setConfirm(false); stop(); };
  return { on, ids, start, stop, toggle, setAll, allOf, confirm, setConfirm, doDelete, can: !!onDeleteMany };
}

/* 記録をえらぶボタン。**画面ごとに形を変えないこと。**
   どこでも同じ、まるいしるしのボタンにそろえてある */
function SelectButton({ sel, onDark }) {
  if (!sel.can) return null;
  const on = sel.on;
  return (
    <button type="button" onClick={() => (on ? sel.stop() : sel.start())} aria-pressed={on}
      aria-label={on ? "選ぶのをやめる" : "選択"}
      className={"w-11 h-11 shrink-0 flex items-center justify-center rounded-full ft-tap ft-tap-icon "
        + (on ? "bg-th-800 text-white" : onDark ? "text-white" : "text-neutral-500 hover:bg-neutral-100")}>
      {on ? <X size={19} /> : <ListChecks size={19} />}
    </button>
  );
}

function SelectBar({ sel, list, extraLabel, onExtra }) {
  if (!sel.on) return null;
  const all = sel.allOf(list || []);
  return (
    <>
      {/* えらんでいる間の帯。**上と下に同じボタンを置かないこと。**
          ここ1本にまとめて、左＝全選択、右＝することの順にそろえる */}
      <div className="fixed left-0 right-0 bg-white border-t border-neutral-200 px-4 py-2.5 flex items-center gap-2"
        style={{ zIndex: 45, bottom: 0, paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}>
        <button type="button" onClick={() => sel.setAll(list || [])}
          className="flex items-center gap-2 min-h-[52px] pr-2 ft-tap">
          <span className="w-6 h-6 rounded-lg border-[1.5px] flex items-center justify-center"
            style={all ? { background: "var(--th-800)", borderColor: "var(--th-800)" } : { borderColor: "#D4D4D4" }}>
            {all && <span className="flex text-white"><Check size={15} strokeWidth={3.5} className="thick" /></span>}
          </span>
          <span className="text-[14.5px] font-bold text-neutral-600">全選択</span>
        </button>
        <span className="flex-1 text-center text-[14.5px] font-bold text-neutral-500 tabular-nums">{sel.ids.size}件</span>
        {onExtra && (
          <button type="button" onClick={() => onExtra(Array.from(sel.ids))} disabled={sel.ids.size === 0}
            className={BTN_SECONDARY + " " + BTN_H + " px-3.5 text-[14.5px]"}>{extraLabel}</button>
        )}
        <button type="button" onClick={() => sel.setConfirm(true)} disabled={sel.ids.size === 0}
          className={BTN_DANGER + " " + BTN_H + " px-4 text-[14.5px]"}><Trash2 size={16} /> 削除</button>
      </div>
      {sel.confirm && (
        <ConfirmDialog title={`${sel.ids.size}件を削除しますか`} body="元に戻せません" danger confirmLabel="削除"
          onCancel={() => sel.setConfirm(false)} onConfirm={sel.doDelete} />
      )}
    </>
  );
}

/* ============================================================
   Today（日・週・月の切り替え）
   左右に払っても送れる
   ============================================================ */
const SPANS = [{ key: "day", label: "日" }, { key: "week", label: "週" }, { key: "month", label: "月" }];
const SORTS = [{ key: "time", label: "時間順" }, { key: "new", label: "新しい順" }];

function TodayScreen({ records, onEdit, onToggleItem, onOpenDay, plans, onOpenPlan, onAddScoped, onDeleteMany, onPin, onSelecting }) {
  const [span, setSpan] = useState("day");
  const [date, setDate] = useState(todayStr());
  const [jumpOpen, setJumpOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [hidden, setHidden] = useState([]);   // 出さない記録の種類
  const [sort, setSort] = useState("time");   // time＝時間順／new＝新しい順
  const sel = useSelectMode(onDeleteMany);
  useEffect(() => { if (onSelecting) onSelecting(sel.on); }, [sel.on]); // eslint-disable-line
  /* いま日の画面に出ている記録。「全選択」はこれに対して働く */
  const dayList = useMemo(() => records.filter((r) => isDayRec(r) && r.date === date), [records, date]);

  const weekStart = startOfWeek(date);
  const y = Number(date.slice(0, 4)), mo = Number(date.slice(5, 7));

  const step = (d) => {
    if (span === "day") setDate((s) => addDays(s, d));
    else if (span === "week") setDate((s) => addDays(s, d * 7));
    else setDate((s) => {
      const cur = parseYmd(s) || new Date();
      const nd = new Date(cur.getFullYear(), cur.getMonth() + d, 1);
      return ymd(nd);
    });
  };
  const { areaRef, pageCls, setDir } = useSwipePages(() => step(-1), () => step(1));

  /* 日は「8月25日(火)」のように短く。年は小さく添えるほうが読みやすい */
  const label = span === "day" ? fmtDate(date)
    : span === "week" ? `${Number(weekStart.slice(5, 7))}/${Number(weekStart.slice(8, 10))} – ${Number(addDays(weekStart, 6).slice(5, 7))}/${Number(addDays(weekStart, 6).slice(8, 10))}`
      : `${y}年 ${mo}月`;

  /* 締め切りが近い目標を、そっと上に出す（設定で出さないようにもできる） */
  const upcoming = useMemo(() => {
    const out = [];
    (plans || []).forEach((p) => (p.steps || []).forEach((g) => {
      if (!g.dueDate || stepDone(g)) return;
      out.push({ plan: p, goal: g, left: daysBetween(todayStr(), g.dueDate) });
    }));
    return out.filter((x) => x.left >= 0).sort((a, b) => a.left - b.left).slice(0, 3);
  }, [plans]);

  return (
    <div className="pb-28">
      <ScreenHeader title="Today" />

      {/* 日・週・月。**上下を詰めないこと。** 見出しの帯と日付が
          くっついて見えて、どこからが中身か分かりにくくなる */}
      <div className="px-5 pt-5">
        {/* 選んだものは白い札。**面を色で塗りつぶさないこと。**
            色は要所だけに使うほうが、画面が軽く見える */}
        <div className="flex gap-1 mb-5 p-1 rounded-full bg-neutral-100">
          {SPANS.map((s) => (
            <button key={s.key} type="button" onClick={() => { setDir(0); setSpan(s.key); }} aria-pressed={span === s.key}
              style={{ minHeight: 44 }}
              className={"flex-1 rounded-full text-[14px] font-bold flex items-center justify-center ft-tap "
                + (span === s.key ? "bg-white text-th-900 card-soft" : "text-neutral-400")}>
              <span key={span === s.key ? "on" : "off"} className={"inline-block " + (span === s.key ? "ft-tabpop" : "")}>{s.label}</span>
            </button>
          ))}
        </div>

        <MonthNavHeader className="mb-1" label={label} sub={span === "day" ? `${date.slice(0, 4)}年` : null}
          onPrev={() => { setDir(-1); step(-1); }} onNext={() => { setDir(1); step(1); }}
          onJump={() => setJumpOpen(true)} onToday={() => { setDir(0); setDate(todayStr()); }} />

        {/* 日付のすぐ下に、えらぶ・しぼる・並べかえるの3つ。
            **見出しの帯に混ぜないこと。** どの日に効くのかが分からなくなる */}
        {/* **えらぶボタンは、どの画面でも右はし。**
            左はしぼりこみ、右は並べかえと「えらぶ」でそろえてある */}
        {span === "day" && (
          <div className="flex items-center gap-1 mt-2 mb-2">
            <button type="button" onClick={() => setFilterOpen(true)} aria-label="種類でしぼる"
              className={"w-11 h-11 flex items-center justify-center rounded-full ft-tap ft-tap-icon relative "
                + (hidden.length ? "text-th-800" : "text-neutral-500 hover:bg-neutral-100")}>
              <Filter size={18} />
              {hidden.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-th-800" />
              )}
            </button>
            <span className="flex-1" />
            {SORTS.map((s, i) => (
              <span key={s.key} className="flex items-center">
                {i > 0 && <span className="text-neutral-200 px-0.5">|</span>}
                <button type="button" onClick={() => setSort(s.key)} aria-pressed={sort === s.key}
                  className={"min-h-[44px] px-2 rounded-lg text-[14px] ft-tap "
                    + (sort === s.key ? "font-bold text-neutral-900" : "text-neutral-400")}>{s.label}</button>
              </span>
            ))}
            <SelectButton sel={sel} />
          </div>
        )}
      </div>

      {upcoming.length > 0 && span === "day" && (
        <div className="px-5 mb-3 space-y-1.5">
          {upcoming.map(({ plan, goal, left }) => (
            <button key={goal.id} type="button" onClick={() => onOpenPlan(plan)}
              className="w-full flex items-center gap-2 rounded-2xl bg-white border border-neutral-100 card-soft px-3.5 min-h-[52px] py-2 text-left ft-tap ft-tap-card">
              <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: colorOf(plan.color).soft, color: colorOf(plan.color).deep }}><Target size={16} /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-[11.5px] text-neutral-500 truncate">{plan.name}</span>
                <span className="block text-[14.5px] font-bold text-neutral-900 truncate">{goal.title}</span>
              </span>
              <span className="text-[13.5px] font-bold tabular-nums shrink-0" style={{ color: colorOf(plan.color).deep }}>
                {left === 0 ? "今日まで" : `あと${left}日`}
              </span>
            </button>
          ))}
        </div>
      )}

      <div ref={areaRef} className="px-5" style={{ touchAction: "pan-y" }}>
        <div key={span + date} className={pageCls}>
          {span === "day" && (
            <DayTimeline date={date} records={records} onEdit={onEdit} onToggleItem={onToggleItem}
              hidden={hidden} sort={sort}
              selectMode={sel.on} selectedIds={sel.ids} onSelect={sel.toggle} onPin={onPin} />
          )}
          {span === "week" && (
            <>
              <ScopedNotes scope="week" dateKey={weekStart} records={records}
                onEdit={onEdit} onToggleItem={onToggleItem} onAdd={onAddScoped} onPin={onPin} />
              <WeekView start={weekStart} records={records} onOpenDay={(d) => { setDate(d); setSpan("day"); }} />
            </>
          )}
          {span === "month" && (
            <>
              <ScopedNotes scope="month" dateKey={monthKeyOf(date)} records={records}
                onEdit={onEdit} onToggleItem={onToggleItem} onAdd={onAddScoped} onPin={onPin} />
              <MonthView year={y} month={mo} records={records} onToggleItem={onToggleItem}
                onOpenDay={(d) => { setDate(d); setSpan("day"); }} />
            </>
          )}
        </div>
      </div>

      {/* えらぶ最中は、下の帯が出る。**＋と重ねないこと** */}
      <SelectBar sel={sel} list={dayList.filter((r) => !hidden.includes(r.type))} />

      {/* 出さない種類をえらぶ */}
      {filterOpen && (
        <SheetDialog title="表示する種類" onCancel={() => setFilterOpen(false)}
          onConfirm={() => setFilterOpen(false)} confirmLabel="完了">
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <FilterPill key={t} on={!hidden.includes(t)}
                onClick={() => setHidden((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t]))}>
                {typeIcon(t, 14)} {TYPE_LABELS[t]}
              </FilterPill>
            ))}
          </div>
          {hidden.length > 0 && (
            <button type="button" onClick={() => setHidden([])}
              className={BTN_SECONDARY + " w-full " + BTN_H + " text-[14.5px] mt-3"}>すべて表示</button>
          )}
        </SheetDialog>
      )}

      {jumpOpen && (
        <MonthJumpSheet year={y} month={mo} years={jumpYears(y)}
          onClose={() => setJumpOpen(false)}
          onConfirm={(yy, mm) => {
            const d = Math.min(Number(date.slice(8, 10)), new Date(yy, mm, 0).getDate());
            setDate(`${yy}-${String(mm).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
            setJumpOpen(false);
          }} />
      )}
    </div>
  );
}

/* ============================================================
   チェックリストの項目を、別のチェックリストへ移し替える（持ち越し）
   ============================================================ */
function MoveItemSheet({ item, from, records, onCancel, onMove, onCreate }) {
  const [closing, close] = useClosing(onCancel, 200);
  const [nameOpen, setNameOpen] = useState(false);
  const N = useTypeNames();
  const targets = records.filter((r) => r.type === "checklist" && r.id !== from.id)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <>
      <div className={"ft-sheet-wrap flex items-end justify-center " + (closing ? "anim-fade-out" : "anim-fade")}
        style={{ zIndex: 2147483000 }} onClick={close}>
        <div className="absolute inset-0 bg-black/45" />
        <div className={"relative w-full max-w-md bg-white rounded-t-2xl border-t border-neutral-100 shadow-lg flex flex-col ft-sheet-box "
          + (closing ? "anim-sheet-out" : "anim-sheet")} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 shrink-0">
            <span className="font-display text-[15.5px] text-neutral-900 tracking-wide">どのチェックリストに移しますか</span>
            <button type="button" onClick={close} aria-label="閉じる"
              className="min-w-[44px] min-h-[52px] flex items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100 ft-tap ft-tap-icon"><X size={24} /></button>
          </div>
          <div className="px-4 pt-3 shrink-0">
            <div className="rounded-xl bg-neutral-100 px-3 py-2.5">
              <p className="text-[11.5px] font-bold text-neutral-500 mb-0.5">移すもの</p>
              <p className="text-[14.5px] font-bold text-neutral-900 break-words">{item.text}</p>
            </div>
          </div>
          <div className="ft-sheet-body overflow-y-auto px-4 py-3 space-y-1.5 ft-seq">
            {targets.length === 0 && <p className="text-[13.5px] text-neutral-500 py-6 text-center">ほかのチェックリストがまだありません。</p>}
            {targets.map((t) => (
              <button key={t.id} type="button" onClick={() => onMove(t.id)}
                className="w-full flex items-center gap-2.5 rounded-xl border border-neutral-200 bg-white px-3 min-h-[52px] text-left ft-tap ft-tap-card hover:bg-neutral-50">
                <span className="w-9 h-9 rounded-xl bg-th-50 border border-th-200 flex items-center justify-center text-th-800 shrink-0"><ListChecks size={17} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14.5px] font-bold text-neutral-900 truncate">{t.title || N.checklist}</span>
                  <span className="block text-[12px] text-neutral-500">{fmtDate(t.date)}・{doneRatio(t).done}/{doneRatio(t).total}</span>
                </span>
                <ArrowRightLeft size={16} className="text-neutral-400 shrink-0" />
              </button>
            ))}
          </div>
          <div className="shrink-0 px-4 py-3 border-t border-neutral-200" style={SAFE_BOTTOM(12)}>
            <button type="button" onClick={() => setNameOpen(true)} className={BTN_SECONDARY + " w-full " + BTN_H + " text-[14.5px]"}>
              <Plus size={15} /> 移し替え先を新しく作る
            </button>
          </div>
        </div>
      </div>
      {nameOpen && (
        <NameDialog title="新しいチェックリスト" label="題" placeholder="持ち越し" confirmLabel="作って移す"
          onCancel={() => setNameOpen(false)} onConfirm={(name) => { setNameOpen(false); onCreate(name); }} />
      )}
    </>
  );
}

/* 日付をタップして開く、その日だけの画面 */
function DayScreen({ date, records, onClose, onEdit, onToggleItem, onPin, onDeleteMany }) {
  const [closing, close] = useClosing(onClose);
  const { stripRef, screenRef } = useEdgeSwipeBack(close);
  const sel = useSelectMode(onDeleteMany);
  const dayList = useMemo(() => records.filter((r) => isDayRec(r) && r.date === date), [records, date]);
  return (
    <OverlayScreen from="right" closing={closing}>
      <div ref={screenRef} className="absolute inset-0 bg-app flex flex-col">
        <div ref={stripRef} className="absolute left-0 top-16 bottom-0 w-9 z-10" style={{ touchAction: "none" }} />
        <OverlayHeader title={fmtDateFull(date)} onBack={close} />
        <div className="flex-1 overflow-y-auto px-5 py-5 max-w-2xl mx-auto w-full pb-28">
          {/* ほかの画面と同じ場所（右）に「選ぶ」を置く */}
          {dayList.length > 0 && (
            <div className="flex items-center gap-2 mb-1">
              <span className="flex-1" />
              <SelectButton sel={sel} />
            </div>
          )}
          <DayTimeline date={date} records={records} onEdit={onEdit} onToggleItem={onToggleItem} onPin={onPin}
            selectMode={sel.on} selectedIds={sel.ids} onSelect={sel.toggle} />
        </div>
        <SelectBar sel={sel} list={dayList} />
      </div>
    </OverlayScreen>
  );
}

/* ============================================================
   みつける
   ・タグ／記録の種類／言葉でしぼりこむ
   ・種類は「どれか」、タグは「すべて含む」。目的が違うのであえて揃えていない
   ・**はじめの状態が1画面に収まること。** 絞り込みは開いた状態で始める
   ============================================================ */
function FindScreen({ records, knownTags, onEdit, onToggleItem, onDeleteMany, onPin, onSelecting }) {
  const sel = useSelectMode(onDeleteMany);
  useEffect(() => { if (onSelecting) onSelecting(sel.on); }, [sel.on]); // eslint-disable-line
  const N = useTypeNames();
  const [q, setQ] = useState("");
  const [types, setTypes] = useState([]);
  const [tags, setTags] = useState([]);
  const [tagOpen, setTagOpen] = useState(false);
  const [markOnly, setMarkOnly] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rangeOpen, setRangeOpen] = useState(false);
  const colorMap = React.useContext(ColorContext) || DEFAULT_TYPE_COLOR;

  const hasCriteria = !!q.trim() || types.length > 0 || tags.length > 0 || markOnly || !!from || !!to;

  /* 条件なしのときに見せる「さいきんの記録」。最後に手を入れた順に20件 */
  const recent = useMemo(() => {
    if (hasCriteria) return [];
    return [...records]
      .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
      .slice(0, 20);
  }, [records, hasCriteria]);

  const results = useMemo(() => {
    if (!hasCriteria) return [];
    const words = q.trim().toLowerCase().split(/[\s　]+/).filter(Boolean);
    const wanted = tags.map((t) => t.toLowerCase());
    return records.filter((r) => {
      if (types.length && !types.includes(r.type)) return false;
      if (markOnly && !r.mark) return false;
      if (from && (r.date || "") < from) return false;
      if (to && (r.date || "") > to) return false;
      if (wanted.length) {
        const has = normalizeTags(r.tags).map((t) => t.toLowerCase());
        if (!wanted.every((t) => has.includes(t))) return false;
      }
      if (words.length) {
        const text = recordAllText(r).toLowerCase();
        if (!words.every((w) => text.includes(w))) return false;
      }
      return true;
    }).sort((a, b) => (b.date || "").localeCompare(a.date || "") || compareTimeline(a, b));
  }, [records, q, types, tags, markOnly, from, to, hasCriteria]);

  const toggleType = (t) => setTypes((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t]);
  const clear = () => { setQ(""); setTypes([]); setTags([]); setMarkOnly(false); setFrom(""); setTo(""); };

  return (
    <div className="pb-20">
      <ScreenHeader title="みつける" />
      <div className="px-5 pt-3 max-w-2xl mx-auto w-full">
        <div className="rounded-2xl bg-white border border-neutral-200 p-2.5 space-y-2.5 mb-4">
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="キーワードで検索" />
            </div>
            {hasCriteria && (
              <button type="button" onClick={clear} className={BTN_SECONDARY + " " + BTN_H + " px-3.5 text-[14.5px] shrink-0"}>条件を解除</button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <FilterPill key={t} on={types.includes(t)} onClick={() => toggleType(t)}>
                {typeIcon(t, 14)} {N[t] || TYPE_LABELS[t]}
              </FilterPill>
            ))}
          </div>

          {/* タグ・印・期間も、種類のしぼりこみと同じ形の札にそろえる。
              **ここだけボタンの形を変えないこと。** 大きさがそろわず、ちぐはぐに見える */}
          {/* タグは、フォルダの条件と同じ「横に広いボタン」でえらぶ。
              **小さな札にしないこと。** いくつ選んだかが読み取りにくい */}
          <button type="button" onClick={() => setTagOpen(true)}
            className={BTN_SECONDARY + " w-full " + BTN_H + " text-[14.5px]"}>
            <Tag size={15} /> タグで絞り込む{tags.length ? `（${tags.length}）` : ""}
          </button>

          <div className="flex flex-wrap gap-1.5 items-center">
            <FilterPill on={markOnly} onClick={() => setMarkOnly((v) => !v)}><Star size={14} /> 印つき</FilterPill>
            <FilterPill on={rangeOpen || !!from || !!to} onClick={() => setRangeOpen((v) => !v)}><CalendarDays size={14} /> 期間</FilterPill>
          </div>

          {tags.length > 0 && <TagChips tags={tags} />}

          {rangeOpen && (
            <div className="flex items-center gap-2 flex-wrap ft-open">
              <DateInput value={from} onChange={(e) => setFrom(e.target.value)} placeholder="はじめ" className="w-[150px]" allowEmpty />
              <span className="text-[13.5px] text-neutral-500">〜</span>
              <DateInput value={to} onChange={(e) => setTo(e.target.value)} placeholder="おわり" className="w-[150px]" allowEmpty />
            </div>
          )}
        </div>

        {/* 条件を選んでいないときは、あたらしい順に少しだけ並べておく。
            まっ白な画面より、ここから探せるほうが手がかりになる */}
        {!hasCriteria ? (
          recent.length === 0 ? (
            <p className="text-[13.5px] text-neutral-500 text-center py-10">記録がありません</p>
          ) : (
            <>
              {/* 「選択」は結果のすぐ上に置く。**遠くの見出しに置かないこと。**
                  どこを選んでいるのか分からなくなる */}
              <div className="flex items-center gap-2 mb-2">
                <p className="text-[12.5px] font-bold text-neutral-500 flex-1">最近の記録</p>
                <SelectButton sel={sel} />
              </div>
              <div className="ft-seq -mx-5 pt-1">
                {recent.map((r) => (
                  <RecordRow key={r.id} r={r} onEdit={onEdit} onToggleItem={onToggleItem} onPin={onPin}
                    selectMode={sel.on} selected={sel.ids.has(r.id)} onSelect={sel.toggle} />
                ))}
              </div>
  
            </>
          )
        ) : results.length === 0 ? (
          <div className="ft-noresult py-10 text-center">
            <p className="text-[14.5px] text-neutral-400">見つかりません</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[12.5px] font-bold text-neutral-500 flex-1">{results.length}件</p>
              <SelectButton sel={sel} />
            </div>
            <div className="ft-seq -mx-5 pt-1">
              {results.map((r) => (
                <RecordRow key={r.id} r={r} onEdit={onEdit} onToggleItem={onToggleItem} onPin={onPin}
                    selectMode={sel.on} selected={sel.ids.has(r.id)} onSelect={sel.toggle} />
              ))}
            </div>
          </>
        )}
      </div>

      <SelectBar sel={sel} list={hasCriteria ? results : recent} />

      {tagOpen && (
        <TagPickDialog title="タグで絞り込む" selected={tags} known={knownTags}
          onApply={(v) => { setTags(v); setTagOpen(false); }} onCancel={() => setTagOpen(false)} />
      )}
    </div>
  );
}

/* ============================================================
   計画
   ・種類と計画は、右下の＋から追加する（画面の中にボタンを置かない）
   ・計画をひらくと、Todayと同じように記録を書ける画面になる
   ============================================================ */
/* 計画の札。一覧でも、種類の中でも同じものを使う */
function PlanCard({ plan, records, onOpen, onPin }) {
  const p = plan;
  const c = colorOf(p.color);
  const steps = p.steps || [];
  const doneSteps = steps.filter((g) => stepDone(g)).length;
  const recs = records.filter((r) => r.planId === p.id).length;
  const next = steps.filter((g) => !stepDone(g) && g.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const left = next ? daysBetween(todayStr(), next.dueDate) : null;
  const done = !!p.doneAt;
  return (
    /* **札ぜんたいを button にしないこと。** 中にピンのボタンを置けなくなる */
    <div onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      className="w-full rounded-2xl bg-white p-4 text-left ft-tap ft-tap-card card-soft cursor-pointer"
      style={done ? { background: c.soft } : undefined}>
      <div className="flex items-center gap-3">
        <span className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
          style={done ? { background: c.deep, color: "#FFFFFF" } : { background: c.soft, color: c.deep }}>
          {done ? <Check size={26} strokeWidth={3} className="thick" /> : <Target size={24} />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-display text-[17px] text-neutral-900 leading-snug break-words">{p.name || "（名前なし）"}</span>
          <span className="block text-[13px] text-neutral-500 mt-1">
            {done ? `${fmtDate(p.doneAt)} にやり遂げた` : (steps.length ? `${doneSteps}/${steps.length} 達成・` : "") + `記録 ${recs}件`}
          </span>
        </span>
        {onPin && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onPin(p); }}
            aria-label={p.pinned ? "固定を解除" : "上に固定"} aria-pressed={!!p.pinned}
            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full ft-tap ft-tap-icon"
            style={{ color: p.pinned ? c.deep : "#C4C4C4" }}>
            <span key={p.pinned ? "on" : "off"} className={"flex " + (p.pinned ? "ft-mark" : "")}>
              <Pin size={19} fill={p.pinned ? "currentColor" : "none"} />
            </span>
          </button>
        )}
        <ChevronRight size={20} className="text-neutral-300 shrink-0" />
      </div>
      {!done && next && left !== null && left >= 0 && (
        <div className="mt-2.5 flex items-center gap-2">
          <span className="flex-1 min-w-0 text-[13px] text-neutral-600 truncate">{next.title}</span>
          <span className="text-[14.5px] font-bold tabular-nums shrink-0" style={{ color: c.deep }}>
            {left === 0 ? "今日まで" : `あと${left}日`}
          </span>
        </div>
      )}
    </div>
  );
}

function PlanScreen({ plans, kinds, records, onOpenPlan, onOpenKind, onPinPlan }) {
  /* 並び順：上に固定したもの → ふつうのもの → やり遂げたもの */
  const sortPlans = (list) => list.slice().sort((a, b) => {
    const da = !!a.doneAt, db = !!b.doneAt;
    if (da !== db) return da ? 1 : -1;
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return 0;
  });
  const grouped = useMemo(() => {
    const m = new Map();
    kinds.forEach((k) => m.set(k.id, []));
    m.set("__none", []);
    plans.forEach((p) => {
      const key = p.kindId && m.has(p.kindId) ? p.kindId : "__none";
      m.get(key).push(p);
    });
    return m;
  }, [plans, kinds]);

  const renderPlan = (p) => (
    <PlanCard key={p.id} plan={p} records={records} onOpen={() => onOpenPlan(p)} onPin={onPinPlan} />
  );

  return (
    <div className="pb-28">
      <ScreenHeader title="計画" />
      <div className="px-5 pt-4 max-w-2xl mx-auto w-full space-y-5">
        {/* 種類は、フォルダと同じ「押せる枠」で並べる。
            **見出しの字だけにしないこと。** 押せるものだと分からない */}
        {kinds.length > 0 && (
          <div className="space-y-2.5 ft-seq">
            {kinds.map((k) => {
              const c = colorOf(k.color);
              const n = (grouped.get(k.id) || []).length;
              return (
                <button key={k.id} type="button" onClick={() => onOpenKind(k)}
                  className="w-full flex items-center gap-3 rounded-2xl bg-white p-4 text-left ft-tap ft-tap-card card-soft">
                  <span className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: c.soft, color: c.deep }}><Layers size={24} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-display text-[17px] text-neutral-900 leading-snug break-words">{k.name}</span>
                    <span className="block text-[13px] text-neutral-500 mt-1">計画 {n}件</span>
                  </span>
                  <ChevronRight size={20} className="text-neutral-300 shrink-0" />
                </button>
              );
            })}
          </div>
        )}

        {/* 種類に入れていない計画は、そのまま下に並べる */}
        {(grouped.get("__none") || []).length > 0 && (
          <div>
            {kinds.length > 0 && <p className="text-[12.5px] font-bold text-neutral-500 mb-2">種類なし</p>}
            <div className="space-y-2.5 ft-seq">{sortPlans(grouped.get("__none") || []).map(renderPlan)}</div>
          </div>
        )}

        {plans.length === 0 && kinds.length === 0 && (
          <p className="text-[13.5px] text-neutral-400 text-center py-6">右下の＋から計画を作れます</p>
        )}
      </div>
    </div>
  );
}

/* 種類をひらいた画面。その種類の計画だけが並ぶ */
function KindScreen({ kind, plans, records, onClose, onOpenPlan, onAddPlan, onRename, onDelete, onPinPlan }) {
  const [closing, close] = useClosing(onClose);
  const { stripRef, screenRef } = useEdgeSwipeBack(close);
  const [menuOpen, setMenuOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [doneAsk, setDoneAsk] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const mine = plans.filter((p) => p.kindId === kind.id).slice().sort((a, b) => {
    const da = !!a.doneAt, db = !!b.doneAt;
    if (da !== db) return da ? 1 : -1;
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return 0;
  });

  return (
    <OverlayScreen from="right" closing={closing}>
      <div ref={screenRef} className="absolute inset-0 bg-app flex flex-col">
        <div ref={stripRef} className="absolute left-0 top-16 bottom-0 w-9 z-10" style={{ touchAction: "none" }} />
        <OverlayHeader title={kind.name} onBack={close}
          right={
            <button type="button" onClick={() => setMenuOpen(true)}
              className="min-h-[52px] px-3.5 rounded-xl text-[14.5px] font-bold text-neutral-600 ft-tap">設定</button>
          } />
        <div className="flex-1 overflow-y-auto px-5 py-4 max-w-2xl mx-auto w-full pb-28">
          <div className="space-y-2.5 ft-seq">
            {mine.map((p) => (
              <PlanCard key={p.id} plan={p} records={records} onOpen={() => onOpenPlan(p)} onPin={onPinPlan} />
            ))}
            {mine.length === 0 && <p className="text-[13.5px] text-neutral-400 py-3">右下の＋から計画を作れます</p>}
          </div>
        </div>
        <button type="button" onClick={() => onAddPlan(kind)} aria-label="計画を追加"
          className="fixed right-5 w-14 h-14 rounded-2xl bg-fab text-white card-soft flex items-center justify-center ft-tap ft-fab"
          style={{ zIndex: 40, bottom: "calc(env(safe-area-inset-bottom) + 24px)" }}>
          <Plus size={30} />
        </button>

        {menuOpen && (
          <TypePickSheet title="種類の設定" types={["__rename", "__delete"]}
            labels={{ __rename: "名前を変更", __delete: "この種類を削除" }}
            icons={{ __rename: <Pencil size={22} />, __delete: <Trash2 size={22} /> }}
            onCancel={() => setMenuOpen(false)}
            onPick={(k) => { setMenuOpen(false); if (k === "__rename") setRenameOpen(true); else setDelOpen(true); }} />
        )}
        {renameOpen && (
          <NameDialog title="名前を変更" label="名前" initial={kind.name} confirmLabel="保存"
            onCancel={() => setRenameOpen(false)} onConfirm={(n) => { onRename(kind.id, n); setRenameOpen(false); }} />
        )}
        {delOpen && (
          <ConfirmDialog title="この種類を削除しますか" body="計画は「種類なし」に移ります"
            onCancel={() => setDelOpen(false)} onConfirm={() => { setDelOpen(false); onDelete(kind.id); close(); }} />
        )}
      </div>
    </OverlayScreen>
  );
}

/* ============================================================
   2段のチェックリスト（計画の中身）
   大きな1つ「いつまでに何を」の中に、小さな「そのために何をするか」が入る
   例：8/31までにこの単元を覚える → 12〜18ページ／19〜25ページ …
   ============================================================ */
function StepBlock({ step, color, onChange, onDelete }) {
  const [draft, setDraft] = useState("");
  const items = step.items || [];
  const done = items.filter((i) => i.done).length;
  const left = step.dueDate ? daysBetween(todayStr(), step.dueDate) : null;
  const allDone = items.length > 0 ? done === items.length : !!step.done;

  const addItem = () => {
    const t = draft.trim();
    if (!t) return;
    onChange({ ...step, items: [...items, { id: uid(), text: t, done: false }] });
    setDraft("");
  };
  const toggleItem = (id) => onChange({ ...step, items: items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)) });
  const delItem = (id) => onChange({ ...step, items: items.filter((i) => i.id !== id) });

  return (
    <div className="rounded-2xl bg-white border overflow-hidden" style={{ borderColor: allDone ? color.mid : "#E5E5E5" }}>
      {/* 上の段：いつまでに、何を */}
      <div className="flex items-start gap-1 px-2 py-2 border-b border-neutral-100" style={{ background: allDone ? color.soft : "transparent" }}>
        <button type="button" onClick={() => onChange({ ...step, done: !step.done })} aria-label="達成"
          className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl ft-tap ft-tap-icon">
          {/* チェックの形は、どの画面でも同じまるい枠にそろえる */}
          <span className="w-6 h-6 rounded-full border-2 flex items-center justify-center"
            style={allDone ? { background: color.deep, borderColor: color.deep } : { borderColor: "#C4C4C4" }}>
            {allDone && <span key="on" className="flex ft-check-in text-white"><Check size={14} strokeWidth={3.5} className="thick" /></span>}
          </span>
        </button>
        <div className="flex-1 min-w-0 py-1.5">
          <input value={step.title} onChange={(e) => onChange({ ...step, title: e.target.value })} placeholder="いつまでに何をするか"
            className={"w-full ft-input font-bold bg-transparent text-neutral-900 placeholder-neutral-300 focus:outline-none "
              + (allDone ? "line-through text-neutral-400" : "")} />
          <div className="flex items-center gap-2 mt-1">
            <DateInput pill value={step.dueDate} allowEmpty placeholder="期限"
              onChange={(e) => onChange({ ...step, dueDate: e.target.value })} />
            {step.dueDate && left !== null && !allDone && (
              <span className="text-[12.5px] font-bold tabular-nums" style={{ color: color.deep }}>
                {left >= 0 ? `あと${left}日` : `${-left}日すぎ`}
              </span>
            )}
            {items.length > 0 && (
              <span className="text-[12.5px] font-bold text-neutral-400 tabular-nums ml-auto">{done}/{items.length}</span>
            )}
          </div>
          {items.length > 0 && <div className="mt-1.5"><ProgressBar ratio={done / items.length} color={color.mid} /></div>}
        </div>
        <button type="button" onClick={onDelete} aria-label="削除"
          className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl text-neutral-300 hover:text-rose-700 ft-tap ft-tap-icon"><X size={18} /></button>
      </div>

      {/* 下の段：そのために何をするか */}
      {/* 中の小さな項目は、ひと目盛ぶん内側へ下げる */}
      <div className="pl-5 pr-2 py-1">
        {items.map((it) => (
          <div key={it.id} className="flex items-start gap-1">
            <button type="button" onClick={() => toggleItem(it.id)}
              className="flex-1 min-w-0 flex items-start gap-2.5 text-left px-1.5 py-2.5 min-h-[52px] rounded-xl ft-tap">
              <span className="w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center mt-0.5"
                style={it.done ? { background: color.mid, borderColor: color.mid } : { borderColor: "#C4C4C4" }}>
                {it.done && <span key="on" className="flex ft-check-in text-white"><Check size={12} strokeWidth={3.5} className="thick" /></span>}
              </span>
              <span className={"text-[14.5px] leading-snug flex-1 min-w-0 break-words " + (it.done ? "text-neutral-400 line-through" : "text-neutral-800")}>{it.text}</span>
            </button>
            <button type="button" onClick={() => delItem(it.id)} aria-label="削除"
              className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full text-neutral-300 hover:text-rose-700 ft-tap ft-tap-icon"><X size={16} /></button>
          </div>
        ))}
        <div className="flex items-start gap-1">
          <span className="w-7 shrink-0 flex items-center justify-center text-neutral-300 pt-3"><Plus size={15} /></span>
          <TextArea bare value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="そのためにやること"
            minRows={1} className="flex-1 min-w-0 py-2.5 placeholder-neutral-300"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }} onBlur={addItem} />
        </div>
      </div>
    </div>
  );
}

/* --- 計画をひらいた画面 ---
   ひとつの計画のなかで、
   ①やること（2段のチェックリスト） ②日々の記録
   がひと続きに見える。**ここを細かく分けすぎないこと。**
   画面が増えるほど、書く気持ちが遠のく */
function PlanDashboard({ plan, records, kinds, onClose, onChange, onDelete, onAddRecord, onEditRecord, onToggleItem, onPin, onDeleteMany }) {
  const sel = useSelectMode(onDeleteMany);
  const [closing, close] = useClosing(onClose);
  const { stripRef, screenRef } = useEdgeSwipeBack(close);
  const [delOpen, setDelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [doneAsk, setDoneAsk] = useState(false);
  const color = colorOf(plan.color);
  const today = todayStr();

  const planRecords = useMemo(
    () => records.filter((r) => r.planId === plan.id).sort(compareTimeline),
    [records, plan.id]);

  const pinned = useMemo(() => planRecords.filter((r) => r.pinned), [planRecords]);

  const byDate = useMemo(() => {
    const m = new Map();
    planRecords.filter((r) => !r.pinned).forEach((r) => {
      const k = r.date || "";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [planRecords]);

  /* 2段のチェックリスト */
  const steps = plan.steps || [];
  const setStep = (s) => onChange({ ...plan, steps: steps.map((x) => (x.id === s.id ? s : x)) });
  const addStep = () => onChange({ ...plan, steps: [...steps, { id: uid(), title: "", dueDate: "", done: false, items: [] }] });
  const delStep = (id) => onChange({ ...plan, steps: steps.filter((x) => x.id !== id) });

  const doneSteps = steps.filter((s) => stepDone(s)).length;
  /* 期日の近い順にならべる。**書いた順のままにしないこと。**
     いま何をすればよいかが、上から読めるようにする */
  const sortedSteps = useMemo(() => steps.slice().sort((a, b) => {
    const da = stepDone(a), db = stepDone(b);
    if (da !== db) return da ? 1 : -1;                            // 済んだものは下へ
    if (!!a.dueDate !== !!b.dueDate) return a.dueDate ? -1 : 1;   // 期日なしは下へ
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return 0;
  }), [steps]);

  return (
    <OverlayScreen from="right" closing={closing}>
      <div ref={screenRef} className="absolute inset-0 bg-app flex flex-col">
        <div ref={stripRef} className="absolute left-0 top-16 bottom-0 w-9 z-10" style={{ touchAction: "none" }} />
        {/* **歯車だけを置かないこと。** 何ができるか分からない。
            言葉で「設定」と書き、押すと中身が並ぶ小窓を出す */}
        <OverlayHeader title={plan.name || "（名前なし）"} onBack={close}
          right={
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => setMenuOpen(true)}
                className="min-h-[52px] px-3.5 rounded-xl text-[14.5px] font-bold text-neutral-600 hover:bg-neutral-100 ft-tap">
                設定
              </button>
            </span>
          } />

        <div className="flex-1 overflow-y-auto px-5 py-4 max-w-2xl mx-auto w-full pb-28">
          {/* いまの進み具合。いちばん上に置いて、成果が見えるようにする */}
          {steps.length > 0 && (
            <div className="rounded-2xl p-4 mb-5 flex items-end gap-3" style={{ background: color.soft, border: `1px solid ${color.line}` }}>
              <span className="flex-1">
                <span className="block text-[12px] text-neutral-500 mb-0.5">達成したもの</span>
                <span className="block font-display text-[20px] tabular-nums" style={{ color: color.deep }}>{doneSteps}<span className="text-[15px] text-neutral-400"> / {steps.length}</span></span>
              </span>
              <span className="flex-[2] pb-1.5"><ProgressBar ratio={steps.length ? doneSteps / steps.length : 0} color={color.mid} /></span>
            </div>
          )}

          {/* ①2段のチェックリスト。
              上の段＝いつまでに何をするか／下の段＝そのために何をするか */}
          <div className="mb-5">
            <h3 className="font-display text-[15.5px] text-neutral-900 mb-2">やること</h3>
            <div className="space-y-2.5 ft-seq">
              {sortedSteps.map((s) => (
                <StepBlock key={s.id} step={s} color={color}
                  onChange={setStep} onDelete={() => delStep(s.id)} />
              ))}
            </div>
            <button type="button" onClick={addStep} className={BTN_SECONDARY + " w-full " + BTN_H + " text-[14.5px] mt-2.5 border-dashed"}>
              <Plus size={16} /> 追加
            </button>
          </div>

          {/* やり遂げたことを残す */}
          <div className="mb-5">
            {plan.doneAt ? (
              <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: color.soft }}>
                <span className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: color.deep, color: "#FFFFFF" }}><Check size={22} strokeWidth={3} className="thick" /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-bold" style={{ color: color.deep }}>やり遂げました</span>
                  <span className="block text-[13px] text-neutral-500">{fmtDate(plan.doneAt)}</span>
                </span>
              </div>
            ) : (
              <button type="button" onClick={() => setDoneAsk(true)}
                className={BTN_SECONDARY + " w-full btn-h-lg text-[15.5px]"}>
                <Check size={18} /> この計画をやり遂げた
              </button>
            )}
          </div>

          {/* ③日々の記録
              **「思っていること」の専用欄は作らないこと。**
              思いついたときにメモとして書き、大事なものはピンで上に置く。
              書く場所が分かれているほど、書かなくなる */}
          {/* 「選択」は、それが効く「記録」のすぐ横に置く。
              **画面のいちばん上の見出しに置かないこと。** どこに効くのか分からない */}
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-display text-[15.5px] text-neutral-900 flex-1">記録</h3>
            {planRecords.length > 0 && <SelectButton sel={sel} />}
          </div>
          {/* 上に固定した記録は、日付にかかわらずここへ集める */}
          {pinned.length > 0 && (
            <div className="mb-4">
              <p className="text-[12.5px] font-bold text-neutral-400 mb-1 flex items-center gap-1"><Pin size={12} /> 上に固定</p>
              <div className="ft-seq -mx-5 pt-1">
                {pinned.map((r) => (
                  <RecordRow key={r.id} r={r} onEdit={onEditRecord} onToggleItem={onToggleItem} onPin={onPin}
                    selectMode={sel.on} selected={sel.ids.has(r.id)} onSelect={sel.toggle} />
                ))}
              </div>
            </div>
          )}

          {byDate.length === 0 ? (
            <p className="text-[13.5px] text-neutral-400 py-3">右下の＋から書けます</p>
          ) : (
            <div className="space-y-4">
              {byDate.map(([d, list]) => (
                <div key={d}>
                  <p className="text-[12.5px] font-bold text-neutral-400 mb-1 tabular-nums">{d ? fmtDate(d) : ""}</p>
                  <div className="ft-seq -mx-5 pt-1">
                    {list.map((r) => (
                      <RecordRow key={r.id} r={r} onEdit={onEditRecord} onToggleItem={onToggleItem} onPin={onPin}
                        selectMode={sel.on} selected={sel.ids.has(r.id)} onSelect={sel.toggle} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <SelectBar sel={sel} list={planRecords} />

        {!sel.on && <button type="button" onClick={() => onAddRecord(plan)} aria-label="記録する"
          className="fixed right-5 w-16 h-16 rounded-full bg-th-900 text-white flex items-center justify-center card-soft ft-tap ft-fab"
          style={{ zIndex: 40, bottom: "calc(env(safe-area-inset-bottom) + 24px)" }}>
          <Plus size={30} />
        </button>}

        {menuOpen && (
          <TypePickSheet title="計画の設定"
            types={plan.doneAt ? ["__undone", "__edit", "__delete"] : ["__edit", "__delete"]}
            labels={{ __undone: "やり遂げたのを取り消す", __edit: "名前・種類・色を変更", __delete: "この計画を削除" }}
            icons={{ __undone: <RotateCcw size={22} />, __edit: <Pencil size={22} />, __delete: <Trash2 size={22} /> }}
            onCancel={() => setMenuOpen(false)}
            onPick={(k) => {
              setMenuOpen(false);
              if (k === "__undone") onChange({ ...plan, doneAt: "" });
              else if (k === "__edit") setSettingsOpen(true);
              else setDelOpen(true);
            }} />
        )}

        {/* やり遂げたときのお祝い。**ただ色を変えるだけにしないこと。**
            ひと呼吸おいて讃えるほうが、続ける力になる */}
        {celebrate && (
          <div className="ft-sheet-wrap flex items-center justify-center anim-fade" style={{ zIndex: 2147483400 }}
            onClick={() => setCelebrate(false)}>
            <div className="absolute inset-0" style={{ background: "rgba(255,255,255,.92)" }} />
            <div className="relative text-center px-8">
              <span className="ft-celebrate inline-flex w-28 h-28 rounded-full items-center justify-center mb-5"
                style={{ background: color.soft, color: color.deep }}>
                <Check size={56} strokeWidth={3} className="thick" />
              </span>
              <p className="font-display text-[22px] text-neutral-900 mb-1.5">やり遂げました</p>
              <p className="text-[15px] text-neutral-600 leading-relaxed mb-6">
                「{plan.name || "この計画"}」<br />おつかれさまでした。
              </p>
              <button type="button" onClick={() => setCelebrate(false)}
                className={BTN_PRIMARY + " btn-h-lg px-8 text-[16px]"}>とじる</button>
            </div>
          </div>
        )}
        {settingsOpen && (
          <SheetDialog title="名前・種類・色" onCancel={() => setSettingsOpen(false)}
            onConfirm={() => setSettingsOpen(false)} confirmLabel="完了">
            <div className="mb-3"><TextInput value={plan.name} onChange={(e) => onChange({ ...plan, name: e.target.value })} placeholder="計画の名前" /></div>
            <div className="mb-3">
              <DrumSelect value={plan.kindId || ""} onChange={(v) => onChange({ ...plan, kindId: v || null })}
                options={kinds.map((k) => ({ value: k.id, label: k.name }))} placeholder="種類を選択" title="種類を選択" />
            </div>
            {/* 色は、ほかの画面と同じプルダウンでえらぶ。
                **四角をずらりと並べないこと。** 場所を取るうえ、選び方もばらつく */}
            <RowCard>
              <SheetRow label="色" last>
                <ColorSelect value={plan.color} title="計画の色" options={COLORS}
                  onChange={(v) => onChange({ ...plan, color: v })} />
              </SheetRow>
            </RowCard>
          </SheetDialog>
        )}
        {doneAsk && (
          <ConfirmDialog title="やり遂げましたか" body="計画は一覧の下のほうへ移り、いつでも見返せます。"
            confirmLabel="やり遂げた"
            onCancel={() => setDoneAsk(false)}
            onConfirm={() => { setDoneAsk(false); onChange({ ...plan, doneAt: todayStr() }); setCelebrate(true); }} />
        )}

        {delOpen && (
          <ConfirmDialog title="この計画を削除しますか" body="記録そのものは残ります"
            onCancel={() => setDelOpen(false)} onConfirm={() => { setDelOpen(false); onDelete(plan.id); }} />
        )}
      </div>
    </OverlayScreen>
  );
}

/* ============================================================
   フォルダ
   ・タグから自動で集める（例：「ゲーム」に「fgo」「ツイステ」タグの記録）
   ・任意の記録を手で入れることもできる。どちらも同時に使える
   ============================================================ */
function PickRecordsSheet({ records, picked, onCancel, onConfirm }) {
  const [closing, close] = useClosing(onCancel, 200);
  const [sel, setSel] = useState(() => new Set(picked || []));
  const [q, setQ] = useState("");
  const N = useTypeNames();
  const colorMap = React.useContext(ColorContext) || DEFAULT_TYPE_COLOR;

  const [types, setTypes] = useState([]);
  const [tags, setTags] = useState([]);
  const [tagOpen, setTagOpen] = useState(false);
  const knownTags = useMemo(() => allTagsOf(records), [records]);

  /* しぼりこんだ結果。**「すべて選ぶ」はこの結果に対して働かせること。**
     見えていないものまで選ばれると、あとで気づけない */
  const shown = useMemo(() => {
    const w = q.trim().toLowerCase();
    const tl = tags.map((t) => t.toLowerCase());
    return records.slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .filter((r) => {
        if (types.length && !types.includes(r.type)) return false;
        if (tl.length && !normalizeTags(r.tags).some((t) => tl.includes(t.toLowerCase()))) return false;
        if (w && !recordAllText(r).toLowerCase().includes(w)) return false;
        return true;
      })
      .slice(0, 300);
  }, [records, q, types, tags]);

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleType = (t) => setTypes((v) => (v.includes(t) ? v.filter((x) => x !== t) : [...v, t]));
  const allShown = shown.length > 0 && shown.every((r) => sel.has(r.id));
  const pickAll = () => setSel((s) => {
    const n = new Set(s);
    if (allShown) shown.forEach((r) => n.delete(r.id));
    else shown.forEach((r) => n.add(r.id));
    return n;
  });

  return (
    <div className={"ft-sheet-wrap flex items-end justify-center " + (closing ? "anim-fade-out" : "anim-fade")}
      style={{ zIndex: 2147483000 }} onClick={close}>
      <div className="absolute inset-0 bg-black/45" />
      <div className={"relative w-full max-w-md bg-white rounded-t-2xl border-t border-neutral-100 shadow-lg flex flex-col ft-sheet-box "
        + (closing ? "anim-sheet-out" : "anim-sheet")} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 shrink-0">
          <span className="font-display text-[15.5px] text-neutral-900 tracking-wide">記録を選ぶ</span>
          <button type="button" onClick={close} aria-label="閉じる"
            className="min-w-[44px] min-h-[52px] flex items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100 ft-tap ft-tap-icon"><X size={24} /></button>
        </div>
        <div className="px-4 pt-3 shrink-0 space-y-2">
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="キーワードで検索" />
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <FilterPill key={t} on={types.includes(t)} onClick={() => toggleType(t)}>
                {typeIcon(t, 14)} {N[t] || TYPE_LABELS[t]}
              </FilterPill>
            ))}
            <FilterPill on={tags.length > 0} onClick={() => setTagOpen(true)}>
              <Tag size={14} /> タグ{tags.length ? `（${tags.length}）` : ""}
            </FilterPill>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-neutral-500 tabular-nums flex-1">{shown.length}件・選んだのは{sel.size}件</span>
            <button type="button" onClick={pickAll} className={BTN_SECONDARY + " " + BTN_H + " px-3.5 text-[13px]"}>
              {allShown ? "全解除" : "全選択"}
            </button>
          </div>
        </div>
        <div className="ft-sheet-body overflow-y-auto px-4 py-3 space-y-1.5">
          {shown.map((r) => {
            const on = sel.has(r.id);
            const c = colorOf(colorMap[r.type]);
            return (
              <button key={r.id} type="button" onClick={() => toggle(r.id)}
                className={"w-full flex items-center gap-2.5 rounded-xl border-2 px-3 min-h-[52px] text-left ft-tap ft-tap-card "
                  + (on ? "bg-th-50" : "bg-white hover:bg-neutral-50")}
                style={{ borderColor: on ? "var(--th-800)" : "#E5E5E5" }}>
                <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                  style={on ? { background: "var(--th-800)", borderColor: "var(--th-800)" } : { borderColor: "#C4C4C4" }}>
                  {on && <Check size={12} strokeWidth={3.5} className="thick text-white" />}
                </span>
                <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: c.soft, color: c.deep }}>{typeIcon(r.type, 14)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14.5px] font-bold text-neutral-900 truncate">{recordTitle(r, N)}</span>
                  <span className="block text-[12px] text-neutral-500">{fmtDate(r.date)}</span>
                </span>
              </button>
            );
          })}
          {shown.length === 0 && <p className="text-[13.5px] text-neutral-500 py-6 text-center">見つかりません。</p>}
        </div>
        <div className="shrink-0 flex gap-2.5 px-4 py-3 border-t border-neutral-200" style={SAFE_BOTTOM(12)}>
          <button type="button" onClick={close} className={BTN_SECONDARY + " flex-1 " + BTN_H + " text-[14.5px]"}>キャンセル</button>
          <button type="button" onClick={() => onConfirm(Array.from(sel))}
            className={BTN_PRIMARY + " flex-1 " + BTN_H + " text-[14.5px]"}>完了（{sel.size}）</button>
        </div>

        {tagOpen && (
          <TagPickDialog title="タグで絞り込む" zIndex={2147483250} selected={tags} known={knownTags}
            onApply={(v) => { setTags(v); setTagOpen(false); }} onCancel={() => setTagOpen(false)} />
        )}
      </div>
    </div>
  );
}

function FolderDetail({ folder, records, knownTags, onCreateTag, onClose, onChange, onDelete, onAddRecord, onEditRecord, onToggleItem, onPin, onDeleteMany }) {
  /* このフォルダから外すための選ぶしくみ。**記録そのものは消さないこと** */
  const sel = useSelectMode(onDeleteMany);
  const removeFromFolder = (ids) => {
    const set = new Set(ids);
    onChange({
      ...folder,
      picked: (folder.picked || []).filter((x) => !set.has(x)),
      excluded: Array.from(new Set([...(folder.excluded || []), ...ids])),
    });
    sel.stop();
  };
  const [closing, close] = useClosing(onClose);
  const { stripRef, screenRef } = useEdgeSwipeBack(close);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const N = useTypeNames();
  const colorMap = React.useContext(ColorContext) || DEFAULT_TYPE_COLOR;

  const list = useMemo(() => folderRecords(folder, records).sort(compareTimeline), [folder, records]);

  /* 日ごとにまとめる。Todayと同じ並び方にそろえてある */
  const byDate = useMemo(() => {
    const m = new Map();
    list.forEach((r) => {
      const k = r.date || "";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [list]);

  /* 条件は、いじっている間は手もとで持っておき、「保存」で決める。
     **さわるたびに反映しないこと。** 決めたつもりがないのに変わると落ち着かない */
  const [draft, setDraft] = useState({ tags: folder.tags, types: folder.types });
  const openSettings = () => { setDraft({ tags: folder.tags, types: folder.types }); setSettingsOpen(true); };
  const saveSettings = () => { onChange({ ...folder, tags: draft.tags, types: draft.types }); setSettingsOpen(false); };
  const toggleType = (t) => setDraft((d) => ({ ...d, types: d.types.includes(t) ? d.types.filter((x) => x !== t) : [...d.types, t] }));

  return (
    <OverlayScreen from="right" closing={closing}>
      <div ref={screenRef} className="absolute inset-0 bg-app flex flex-col">
        <div ref={stripRef} className="absolute left-0 top-16 bottom-0 w-9 z-10" style={{ touchAction: "none" }} />
        {/* 計画の画面と同じ並びにそろえる。
            右上＝設定（名前・削除）、右下＝このフォルダに入れる */}
        <OverlayHeader title={folder.name || "（名前なし）"} onBack={close}
          right={
            <button type="button" onClick={() => setMenuOpen(true)}
              className="min-h-[52px] px-3.5 rounded-xl text-[14.5px] font-bold text-neutral-600 ft-tap">設定</button>
          } />

        <div className="flex-1 overflow-y-auto px-5 py-4 max-w-2xl mx-auto w-full pb-28">
          {/* 「選択」は、それが効く記録のすぐ上に置く */}
          {list.length > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[12.5px] font-bold text-neutral-500 flex-1">{list.length}件</p>
              <SelectButton sel={sel} />
            </div>
          )}
          {byDate.length === 0 ? (
            <p className="text-[13.5px] text-neutral-400 py-3">右下のボタンから、記録を入れられます</p>
          ) : (
            <div className="space-y-4">
              {byDate.map(([d, items]) => (
                <div key={d}>
                  <p className="text-[12.5px] font-bold text-neutral-400 mb-1.5 tabular-nums">{d ? fmtDate(d) : ""}</p>
                  <div className="ft-seq -mx-5 pt-1">
                    {items.map((r) => (
                      <RecordRow key={r.id} r={r} onEdit={onEditRecord} onToggleItem={onToggleItem} onPin={onPin}
                        selectMode={sel.on} selected={sel.ids.has(r.id)} onSelect={sel.toggle} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* **入口をふたつに分けないこと。**
            このフォルダに関することは、すべてこの右下のボタンから入る */}
        {!sel.on && (
          <button type="button" onClick={() => setAddOpen(true)} aria-label="このフォルダに入れる"
            className="fixed right-5 w-14 h-14 rounded-2xl bg-fab text-white flex items-center justify-center card-soft ft-tap ft-fab"
            style={{ zIndex: 40, bottom: "calc(env(safe-area-inset-bottom) + 24px)" }}>
            {/* ここは「このフォルダに入れる」ための入口 */}
            <FolderPlus size={26} />
          </button>
        )}

        {/* えらんだものを、フォルダから外す／まるごと削除する */}
        <SelectBar sel={sel} list={list} extraLabel="外す" onExtra={removeFromFolder} />

        {/* 右下を押したときに出る入口。ここにフォルダのことをぜんぶ集めてある */}
        {addOpen && (
          <TypePickSheet title="このフォルダに入れる" types={["__pick", "__cond"]}
            labels={{ __pick: "記録を手で選ぶ", __cond: "タグや種類で集める" }}
            icons={{ __pick: <ListChecks size={22} />, __cond: <Tag size={22} /> }}
            onCancel={() => setAddOpen(false)}
            onPick={(k) => { setAddOpen(false); if (k === "__pick") setPickOpen(true); else openSettings(); }} />
        )}

        {menuOpen && (
          <TypePickSheet title="フォルダの設定" types={["__cond", "__rename", "__delete"]}
            labels={{ __cond: "集める条件", __rename: "名前を変更", __delete: "このフォルダを削除" }}
            icons={{ __cond: <Tag size={22} />, __rename: <Pencil size={22} />, __delete: <Trash2 size={22} /> }}
            onCancel={() => setMenuOpen(false)}
            onPick={(k) => {
              setMenuOpen(false);
              if (k === "__cond") openSettings();
              else if (k === "__rename") setRenameOpen(true);
              else setDelOpen(true);
            }} />
        )}

        {/* 集める条件。決めたら「保存」で反映する */}
        {settingsOpen && (
          <SheetDialog title="集める条件" onCancel={() => setSettingsOpen(false)} onConfirm={saveSettings} confirmLabel="保存">
            <p className="text-[12.5px] font-bold text-neutral-500 mb-1.5">タグ</p>
            <button type="button" onClick={() => setTagOpen(true)} className={BTN_SECONDARY + " w-full " + BTN_H + " text-[14.5px] mb-2"}>
              <Tag size={15} /> タグを選択{draft.tags.length ? `（${draft.tags.length}）` : ""}
            </button>
            {draft.tags.length > 0 && <TagChips tags={draft.tags} className="mb-3" />}
            <p className="text-[12.5px] font-bold text-neutral-500 mb-1.5">記録の種類</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {TYPES.map((t) => (
                <FilterPill key={t} on={draft.types.includes(t)} onClick={() => toggleType(t)}>
                  {typeIcon(t, 14)} {N[t] || TYPE_LABELS[t]}
                </FilterPill>
              ))}
            </div>
            {/* 手で外した記録があると、条件に合っていても入ってこない。
                その事実と、戻すための道をここに出しておく */}
            {(folder.excluded || []).length > 0 && (
              <div className="rounded-xl bg-neutral-50 border border-neutral-200 px-3 py-2.5 mb-3">
                <p className="text-[13px] text-neutral-600 mb-2">
                  手で外した記録が {(folder.excluded || []).length} 件あります。条件に合っていても入りません。
                </p>
                <button type="button" onClick={() => onChange({ ...folder, excluded: [] })}
                  className={BTN_SECONDARY + " w-full " + BTN_H + " text-[14.5px]"}>外したものを戻す</button>
              </div>
            )}

            {/* いま何件集まるかを見せる。保存する前に確かめられる */}
            <p className="text-[13.5px] text-neutral-600">
              この条件で <span className="font-bold tabular-nums">{folderRecords({ ...folder, tags: draft.tags, types: draft.types }, records).length}</span> 件</p>
          </SheetDialog>
        )}

        {tagOpen && (
          <TagPickDialog title="まとめるタグ" zIndex={2147483250} selected={draft.tags} known={knownTags} onCreate={onCreateTag}
            onApply={(v) => { setDraft((d) => ({ ...d, tags: v })); setTagOpen(false); }}
            onCancel={() => setTagOpen(false)} />
        )}
        {pickOpen && (
          <PickRecordsSheet records={records} picked={folder.picked}
            onCancel={() => setPickOpen(false)}
            onConfirm={(ids) => { onChange({ ...folder, picked: ids }); setPickOpen(false); }} />
        )}
        {renameOpen && (
          <NameDialog title="名前を変更" label="フォルダの名前" initial={folder.name} confirmLabel="保存"
            onCancel={() => setRenameOpen(false)} onConfirm={(n) => { onChange({ ...folder, name: n }); setRenameOpen(false); }} />
        )}
        {delOpen && (
          <ConfirmDialog title="このフォルダを削除しますか" body="記録そのものは残ります"
            onCancel={() => setDelOpen(false)} onConfirm={() => { setDelOpen(false); onDelete(folder.id); }} />
        )}
      </div>
    </OverlayScreen>
  );
}

function FolderScreen({ folders, records, onOpen }) {
  return (
    <div className="pb-28">
      <ScreenHeader title="フォルダ" />
      <div className="px-5 pt-4 max-w-2xl mx-auto w-full space-y-2.5 ft-seq">
        {folders.map((f) => {
          const n = folderRecords(f, records).length;
          return (
            /* **小さくしないこと。** 作ったフォルダがひと目で分かる大きさにしてある */
            <button key={f.id} type="button" onClick={() => onOpen(f)}
              className="w-full flex items-center gap-3 rounded-2xl bg-white p-4 text-left ft-tap ft-tap-card card-soft">
              <span className="w-14 h-14 rounded-2xl bg-th-50 border border-th-200 flex items-center justify-center text-th-800 shrink-0"><Folder size={26} /></span>
              <span className="flex-1 min-w-0">
                <span className="block font-display text-[17px] text-neutral-900 leading-snug break-words">{f.name || "（名前なし）"}</span>
                <span className="block text-[13px] text-neutral-500 mt-1">
                  {n}件{f.tags.length ? `・${f.tags.slice(0, 3).join("・")}${f.tags.length > 3 ? "ほか" : ""}` : ""}
                </span>
              </span>
              <ChevronRight size={20} className="text-neutral-300 shrink-0" />
            </button>
          );
        })}
        {folders.length === 0 && (
          <p className="text-[13.5px] text-neutral-400 text-center py-6">右下の＋からフォルダを作れます</p>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   設定（表示設定）
   ============================================================ */
/* 色を1つえらぶプルダウン。押すとドラムが出る。
   **色の丸をずらりと並べないこと。** 場所を取るうえ、押し分けにくい */
function ColorSelect({ value, options, onChange, title }) {
  const [open, setOpen] = useState(false);
  const [tmp, setTmp] = useState(value);
  const cur = options.find((c) => c.key === value) || options[0];
  return (
    <>
      {/* **中身の字数で幅を変えないこと。** 行ごとに端がずれて、ちぐはぐに見える */}
      {/* 幅は style で直に決める。**クラス名だけに頼らないこと。**
          当て方の設定によっては効かず、字数ぶんだけ幅がずれる */}
      <button type="button" onClick={() => { setTmp(value); setOpen(true); }}
        style={{ width: 118 }}
        className="min-h-[52px] pl-3 pr-2 rounded-xl bg-neutral-100 flex items-center gap-2 shrink-0 ft-tap ft-tap-card">
        <span className="w-6 h-6 rounded-full shrink-0" style={{ background: cur.mid }} />
        <span className="text-[15px] text-neutral-900 flex-1 min-w-0 truncate text-left">{cur.label}</span>
        <ChevronDown size={17} className="text-neutral-400 shrink-0" />
      </button>
      {open && (
        <WheelSheet title={title} onClose={() => setOpen(false)} onConfirm={() => { onChange(tmp); setOpen(false); }}>
          <WheelColumn items={options.map((c) => ({ value: c.key, label: c.label }))}
            value={tmp} onChange={setTmp} minWidth={160} />
        </WheelSheet>
      )}
    </>
  );
}

function SettingsScreen({ prefs, onSave, onClose }) {
  const headRef = useRef(null);
  const [headBusy, setHeadBusy] = useState(false);
  const [closing, close] = useClosing(onClose);
  const { stripRef, screenRef } = useEdgeSwipeBack(close);
  const N = useTypeNames();
  const set = (patch) => onSave({ ...prefs, ...patch });

  return (
    <OverlayScreen from="right" closing={closing}>
      <div ref={screenRef} className="absolute inset-0 bg-app flex flex-col">
        <div ref={stripRef} className="absolute left-0 top-16 bottom-0 w-9 z-10" style={{ touchAction: "none" }} />
        <OverlayHeader title="表示設定" onBack={close} />
        <div className="flex-1 overflow-y-auto px-5 py-5 max-w-2xl mx-auto w-full pb-16">

          {/* 色は、ラベルの右のプルダウンでえらぶ。
              **小さな丸を並べないこと。** 押しにくく、いま何色かも読み取りにくい */}
          <p className="text-[12.5px] font-bold text-neutral-500 mb-2">記録の色</p>
          <RowCard className="mb-5">
            {TYPES.map((t, i) => {
              const cur = colorOf(prefs.typeColor[t]);
              return (
                <div key={t} className={"flex items-center gap-2.5 px-4 py-2 min-h-[64px] " + (i === TYPES.length - 1 ? "" : "border-b border-neutral-100")}>
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: cur.soft, color: cur.deep }}>{typeIcon(t, 17)}</span>
                  <span className="text-[15.5px] text-neutral-900 flex-1 min-w-0 truncate">{TYPE_LABELS[t]}</span>
                  <ColorSelect value={prefs.typeColor[t]} title={TYPE_LABELS[t] + "の色"}
                    options={COLORS} onChange={(v) => set({ typeColor: { ...prefs.typeColor, [t]: v } })} />
                </div>
              );
            })}
          </RowCard>

          {/* 見出しの帯に敷く写真 */}
          <p className="text-[12.5px] font-bold text-neutral-500 mb-2">見出しの写真</p>
          <RowCard className="mb-5">
            <div className="px-4 py-5">
              <input ref={headRef} type="file" accept="image/*"
                style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
                onChange={async (e) => {
                  const f = e.target.files && e.target.files[0];
                  e.target.value = "";
                  if (!f) return;
                  setHeadBusy(true);
                  try {
                    /* 帯は横に広いので、少し大きめに持つ */
                    const src = await shrinkImage(f, 1200);
                    const id = "ph_" + uid();
                    const res = await photoPut(id, src);
                    set({ headerPhoto: res === null ? src : "photo:" + id });
                  } catch (err) { /* 読めない画像は何もしない */ }
                  setHeadBusy(false);
                }} />
              {prefs.headerPhoto ? (
                <>
                  <div className="rounded-xl overflow-hidden mb-2.5" style={{ aspectRatio: "16 / 6" }}>
                    <Photo src={prefs.headerPhoto} className="block w-full h-full" style={{ objectFit: "cover" }} />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => headRef.current && headRef.current.click()} disabled={headBusy}
                      className={BTN_SECONDARY + " flex-1 btn-h-lg text-[14.5px]"}>
                      {headBusy ? <Spinner size={15} /> : <ImageIcon size={16} />} 変更
                    </button>
                    <button type="button" onClick={() => set({ headerPhoto: "" })}
                      className={BTN_SECONDARY + " flex-1 btn-h-lg text-[14.5px]"}>色にもどす</button>
                  </div>
                </>
              ) : (
                /* 写真をえらぶ入口は、まだ何もない状態でいちばん目立つところ。
                   **細いボタンにしないこと。** どこを押せばよいか分かりにくい */
                <button type="button" onClick={() => headRef.current && headRef.current.click()} disabled={headBusy}
                  className={BTN_SECONDARY + " w-full flex-col gap-3 border-dashed text-[14.5px] py-7"}
                  style={{ minHeight: 132 }}>
                  {headBusy ? <Spinner size={22} /> : <ImageIcon size={26} className="text-neutral-400" />}
                  写真を選ぶ
                </button>
              )}
            </div>
          </RowCard>

          <p className="text-[12.5px] font-bold text-neutral-500 mb-2">画面の色</p>
          <RowCard className="mb-5">
            <SheetRow label="基調の色" last>
              <ColorSelect value={prefs.theme} title="画面の色" theme
                options={THEMES.map((th) => ({ key: th.key, label: th.label, mid: th.swatch, deep: th.vars[800], soft: th.vars[50] }))}
                onChange={(v) => set({ theme: v })} />
            </SheetRow>
          </RowCard>

          <p className="text-[12.5px] font-bold text-neutral-500 mb-2">文字と動き</p>
          <RowCard>
            {/* **小さな札にしないこと。** 押し分けにくい。大きく、字の大きさそのままで見せる */}
            <div className="px-4 py-3 border-b border-neutral-100">
              <p className="text-[13.5px] text-neutral-900 mb-2">文字の大きさ</p>
              <div className="flex gap-2.5">
                {FONT_SIZES.map((f) => (
                  <button key={f.key} type="button" onClick={() => set({ fontSize: f.key })} aria-pressed={prefs.fontSize === f.key}
                    className={"flex-1 h-[64px] rounded-2xl border flex items-center justify-center font-bold ft-tap ft-tap-card "
                      + (f.key === "s" ? "text-[15px] " : f.key === "m" ? "text-[17.5px] " : "text-[21px] ")
                      + (prefs.fontSize === f.key ? "border-th-800 bg-th-50 text-th-900" : "border-neutral-200 bg-white text-neutral-600")}>{f.label}</button>
                ))}
              </div>
            </div>
            <SheetRow label="画面の動き" last>
              <Switch on={prefs.motion !== false} onChange={(v) => set({ motion: v })} label="画面の動き" />
            </SheetRow>
          </RowCard>

        </div>
      </div>
    </OverlayScreen>
  );
}

/* ============================================================
   タグの編集
   名前を変える・消すときは、一覧と記録の両方に同じことをすること。
   片方だけ直すと、記録に古い名前が残って食い違う
   ============================================================ */
function TagManageScreen({ tags, records, onAdd, onRename, onDelete, onClose }) {
  const [closing, close] = useClosing(onClose);
  const { stripRef, screenRef } = useEdgeSwipeBack(close);
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const count = (t) => records.filter((r) => normalizeTags(r.tags).some((x) => x.toLowerCase() === t.toLowerCase())).length;

  return (
    <OverlayScreen from="right" closing={closing}>
      <div ref={screenRef} className="absolute inset-0 bg-app flex flex-col">
        <div ref={stripRef} className="absolute left-0 top-16 bottom-0 w-9 z-10" style={{ touchAction: "none" }} />
        <OverlayHeader title="タグの編集" onBack={close} />
        <div className="flex-1 overflow-y-auto px-5 py-5 max-w-2xl mx-auto w-full pb-16">
          <div className="flex gap-2 mb-4">
            <div className="flex-1 min-w-0">
              <TextInput value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="新しいタグ"
                onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { onAdd(draft.trim()); setDraft(""); } }} />
            </div>
            <button type="button" onClick={() => { onAdd(draft.trim()); setDraft(""); }} disabled={!draft.trim()}
              className={(draft.trim() ? BTN_PRIMARY : BTN_BASE + " bg-neutral-100 border border-neutral-200 text-neutral-400")
                + " " + BTN_H + " px-4 text-[14.5px] shrink-0"}><Plus size={15} /> 作る</button>
          </div>

          <div className="space-y-2 ft-seq">
            {tags.map((t) => (
              <div key={t} className="flex items-center gap-1.5 rounded-2xl bg-white border border-neutral-200 px-3 py-2 min-h-[56px]">
                <span className="w-9 h-9 rounded-xl bg-th-50 border border-th-200 flex items-center justify-center text-th-800 shrink-0"><Tag size={16} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[14.5px] font-bold text-neutral-900 truncate">{t}</span>
                  <span className="block text-[12px] text-neutral-500 tabular-nums">{count(t)}件</span>
                </span>
                <button type="button" onClick={() => setRenaming(t)} aria-label="名前を変更"
                  className="w-10 h-10 flex items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100 ft-tap ft-tap-icon"><Pencil size={16} /></button>
                <button type="button" onClick={() => setDeleting(t)} aria-label="削除"
                  className="w-10 h-10 flex items-center justify-center rounded-xl text-neutral-400 hover:text-rose-700 hover:bg-rose-50 ft-tap ft-tap-icon"><Trash2 size={16} /></button>
              </div>
            ))}
            {tags.length === 0 && <p className="text-[13.5px] text-neutral-500 text-center py-8">まだタグがありません。</p>}
          </div>
        </div>

        {renaming && (
          <NameDialog title="タグの名前を変更" label="新しい名前" initial={renaming} confirmLabel="保存"
            onCancel={() => setRenaming(null)} onConfirm={(n) => { onRename(renaming, n); setRenaming(null); }} />
        )}
        {deleting && (
          <ConfirmDialog title="このタグを削除しますか" body="記録そのものは消えません。タグが外れるだけです。"
            onCancel={() => setDeleting(null)} onConfirm={() => { onDelete(deleting); setDeleting(null); }} />
        )}
      </div>
    </OverlayScreen>
  );
}

/* ============================================================
   バックアップ
   書き出す形式は { app, version, exportedAt, records, plans, kinds, folders, tags, prefs }
   ============================================================ */
const BACKUP_APP = "hibi-backup";
/* 写真ごと書き出すと重くなるので、選べるようにしてある。
   **写真を入れないときは、その旨を必ず伝えること。**
   戻したときに絵が出ないと、壊れたと思われる */
async function buildBackup(data, withPhotos) {
  const photos = {};
  if (withPhotos) {
    for (const r of (data.records || [])) {
      for (const s of (r.images || [])) {
        if (isPhotoRef(s) && !photos[s.slice(6)]) {
          const v = await photoGet(s.slice(6));
          if (v) photos[s.slice(6)] = v;
        }
      }
    }
  }
  return JSON.stringify({
    app: BACKUP_APP, version: 2, exportedAt: new Date().toISOString(),
    records: data.records, plans: data.plans, kinds: data.kinds,
    folders: data.folders, tags: data.tags,
    photos: withPhotos ? photos : undefined,
    prefs: (() => { const p = { ...data.prefs }; delete p.lastBackup; return p; })(),
  }, null, 2);
}

function BackupScreen({ data, onClose, onRestore, onBackedUp }) {
  const used = useMemo(() => usedBytes(data.records), [data.records]);
  const [closing, close] = useClosing(onClose);
  const { stripRef, screenRef } = useEdgeSwipeBack(close);
  const [msg, tell] = useToast();
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(null);
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  /* 書き出しの決めごと */
  const [withPhotos, setWithPhotos] = useState(true);
  const [lock, setLock] = useState(false);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [askPass, setAskPass] = useState(null);   // 読み込むときに合言葉を聞く
  const [room, setRoom] = useState(null);        // 端末の空き具合
  useEffect(() => { storageRoom().then(setRoom); }, []);

  /* ファイル名は半角の英数字とハイフンだけにすること。
     空白や日本語を混ぜると、共有や送信の途中で文字化けすることがある。
     .json は iPhone でも Android でも扱える */
  const fileName = `${APP_NAME}-backup-${todayStr()}${lock ? "-locked" : ""}.json`;

  const canPickFolder = typeof window !== "undefined" && !!window.showSaveFilePicker;

  const makeText = async () => {
    const text = await buildBackup(data, withPhotos);
    if (!lock) return text;
    return lockText(text, pass);
  };

  /* 出し方は3つ。**ひとつしか道を用意しないこと。**
     端末によって使えるものが違う（iPhoneは共有、Androidは保存先えらび） */
  const doExport = async (how) => {
    if (lock) {
      if (!cryptoOk()) { tell("この端末ではロックが使えません"); return; }
      if (pass.length < 4) { tell("合言葉は4文字以上にしてください"); return; }
      if (pass !== pass2) { tell("合言葉が一致しません"); return; }
    }
    setBusy(true);
    try {
      const text = await makeText();
      if (how === "pick" && canPickFolder) {
        try {
          const h = await window.showSaveFilePicker({
            suggestedName: fileName,
            types: [{ description: "Hibi のバックアップ", accept: { "application/json": [".json"] } }],
          });
          const w = await h.createWritable();
          await w.write(new Blob([text], { type: "application/json" }));
          await w.close();
          onBackedUp(); tell("保存しました");
          return;
        } catch (e) { if (e && e.name === "AbortError") return; /* だめなら下へ */ }
      }
      if (how === "share") {
        try {
          const file = new File([text], fileName, { type: "application/json" });
          if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
            /* title は渡さないこと。iPhoneが余分なテキストファイルまで作ってしまう */
            await navigator.share({ files: [file] });
            onBackedUp();
            return;
          }
        } catch (e) { if (e && e.name === "AbortError") return; }
      }
      /* ふつうのダウンロード（どの端末でも最後はこれで残せる） */
      const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      onBackedUp(); tell("ファイルを書き出しました");
    } catch (e) {
      tell("書き出せませんでした");
    } finally { setBusy(false); }
  };

  const readFile = (f) => {
    const reader = new FileReader();
    reader.onload = () => tryRestore(String(reader.result || ""));
    reader.onerror = () => tell("読み込めませんでした");
    reader.readAsText(f);
  };
  const tryRestore = (text) => {
    try {
      const obj = JSON.parse(text);
      if (!obj || typeof obj !== "object") throw new Error("形式が違います");
      /* ロックされたファイルなら、合言葉を聞いてから開く */
      if (obj.app === LOCK_APP) { setAskPass({ obj, pass: "" }); return; }
      setConfirmRestore(obj);
    } catch (e) { tell("このファイルは読み込めませんでした"); }
  };
  const openLocked = async (obj, p2) => {
    try {
      const text = await unlockText(obj, p2);
      const inner = JSON.parse(text);
      setAskPass(null);
      setConfirmRestore(inner);
    } catch (e) { tell("合言葉が違うようです"); }
  };

  const n = (x) => (Array.isArray(x) ? x.length : 0);

  return (
    <OverlayScreen from="right" closing={closing}>
      <div ref={screenRef} className="absolute inset-0 bg-app flex flex-col">
        <div ref={stripRef} className="absolute left-0 top-16 bottom-0 w-9 z-10" style={{ touchAction: "none" }} />
        <OverlayHeader title="バックアップ" onBack={close} />
        <div className="flex-1 overflow-y-auto px-5 py-5 max-w-2xl mx-auto w-full pb-16">

          {/* いまの中身 */}
          <div className="rounded-2xl bg-white card-soft p-4 mb-7">
            <p className="text-[13.5px] text-neutral-600 leading-relaxed">
              記録はこの端末の中にだけ入っています。ブラウザの履歴を消したり、端末を替えたりすると失われます。
              ときどき書き出して、ファイルとして残しておいてください。
            </p>
            <p className="text-[12.5px] text-neutral-500 mt-3 tabular-nums leading-relaxed">
              記録 {n(data.records)}件・計画 {n(data.plans)}・フォルダ {n(data.folders)}<br />
              記録の大きさ およそ {fmtBytes(used.all)}・写真 {used.photos}枚
            </p>
            {/* 端末がどれだけ置かせてくれるか。写真の残り枚数の目安も出す */}
            {room && (
              <p className="text-[12.5px] text-neutral-500 mt-2 leading-relaxed tabular-nums">
                この端末に置ける見込み {fmtBytes(room.quota)}（いま {fmtBytes(room.used)} 使用）
                <br />
                写真はあと {Math.max(0, Math.floor((room.quota - room.used) / PHOTO_BYTES)).toLocaleString()} 枚ほど入ります
              </p>
            )}
            {data.prefs && data.prefs.lastBackup && (
              <p className="text-[12.5px] text-neutral-500 mt-2">最後に書き出したのは {String(data.prefs.lastBackup).slice(0, 10)}</p>
            )}
          </div>

          {/* 書き出す。**まず中身と形式を決めてから、出し方をえらぶ** */}
          <h3 className="font-display text-[15.5px] text-neutral-900 mb-2.5">書き出す</h3>
          <RowCard className="mb-4">
            <SheetRow label="写真もふくめる">
              <Switch on={withPhotos} onChange={setWithPhotos} label="写真もふくめる" />
            </SheetRow>
            <SheetRow label="合言葉でロックする" last={!lock}>
              <Switch on={lock} onChange={(v) => { setLock(v); if (!v) { setPass(""); setPass2(""); } }} label="合言葉でロックする" />
            </SheetRow>
            {lock && (
              <div className="px-4 pt-1 pb-4 space-y-2.5 ft-open">
                <p className="text-[12.5px] text-neutral-500 leading-relaxed">
                  ファイルの中身が読めなくなります。合言葉を忘れると、二度と開けません。
                </p>
                <TextInput value={pass} onChange={(e) => setPass(e.target.value)} type="password" placeholder="合言葉（4文字以上）" />
                <TextInput value={pass2} onChange={(e) => setPass2(e.target.value)} type="password" placeholder="もう一度" />
              </div>
            )}
          </RowCard>

          <p className="text-[12.5px] text-neutral-500 leading-relaxed mb-3">
            {withPhotos ? "写真ごと書き出します（そのぶん重くなります）。" : "記録だけを書き出します。戻したとき、写真は出ません。"}
            {lock ? "ファイルはロックされ、Hibi でしか開けません。" : ""}
          </p>

          <div className="space-y-3 mb-8">
            {canPickFolder && (
              <button type="button" onClick={() => doExport("pick")} disabled={busy}
                className={BTN_PRIMARY + " w-full btn-h-lg text-[16px]"}>
                {busy ? <Spinner size={16} /> : <Download size={18} />} 保存先を選んで書き出す
              </button>
            )}
            <button type="button" onClick={() => doExport("share")} disabled={busy}
              className={(canPickFolder ? BTN_SECONDARY : BTN_PRIMARY) + " w-full btn-h-lg text-[16px]"}>
              {busy ? <Spinner size={16} /> : <Upload size={17} className="rotate-180" />} 送る・保存する
            </button>
            <button type="button" onClick={async () => {
              if (lock) { tell("ロックしたものは、文字ではコピーできません"); return; }
              const ok = await copyToClipboard(await buildBackup(data, false));
              tell(ok ? "コピーしました" : "コピーできませんでした");
            }} className={BTN_SECONDARY + " w-full " + BTN_H + " text-[14.5px]"}>
              <Copy size={15} /> 文字でコピーする
            </button>
          </div>

          {/* 読み込む */}
          <h3 className="font-display text-[15.5px] text-neutral-900 mb-2.5">読み込む</h3>
          <p className="text-[12.5px] text-neutral-500 leading-relaxed mb-3">
            読み込むと、いまの記録はすべて置き換わります。ロックしたファイルは、合言葉を聞きます。
          </p>
          {/* 種類で絞り込まないこと。Androidの選択画面は、種類の分からないファイルを選べなくする */}
          <input ref={fileRef} type="file" className="hidden"
            onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) readFile(f); }} />
          <div className="space-y-3">
            <button type="button" onClick={() => fileRef.current && fileRef.current.click()}
              className={BTN_SECONDARY + " w-full btn-h-lg text-[15.5px]"}><Upload size={17} /> ファイルから読み込む</button>
            <button type="button" onClick={() => setPasteOpen(true)}
              className={BTN_SECONDARY + " w-full " + BTN_H + " text-[14.5px]"}><ClipboardPaste size={15} /> 文字から読み込む</button>
          </div>
        </div>

        {askPass && (
          <SheetDialog title="合言葉を入れてください" confirmLabel="ひらく"
            onCancel={() => setAskPass(null)}
            onConfirm={() => openLocked(askPass.obj, askPass.pass)}>
            <p className="text-[13px] text-neutral-600 leading-relaxed mb-3">
              このファイルはロックされています。書き出したときの合言葉を入れてください。
            </p>
            <TextInput value={askPass.pass} type="password" autoFocus placeholder="合言葉"
              onChange={(e) => setAskPass({ ...askPass, pass: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") openLocked(askPass.obj, askPass.pass); }} />
          </SheetDialog>
        )}

        {pasteOpen && (
          <SheetDialog title="文字から読み込む" confirmLabel="読み込む" disabled={!pasteText.trim()}
            onCancel={() => setPasteOpen(false)}
            onConfirm={() => { setPasteOpen(false); tryRestore(pasteText); }}>
            <TextArea value={pasteText} onChange={(e) => setPasteText(e.target.value)} minRows={5} placeholder="書き出した中身をここに貼る" />
          </SheetDialog>
        )}

        {confirmRestore && (
          <ConfirmDialog title="このバックアップを読み込みますか"
            body={`記録 ${n(confirmRestore.records)}件・計画 ${n(confirmRestore.plans)}・フォルダ ${n(confirmRestore.folders)}\n\nいまの記録はすべて置き換わります。`}
            danger confirmLabel="読み込む"
            onCancel={() => setConfirmRestore(null)}
            onConfirm={() => { const o = confirmRestore; setConfirmRestore(null); onRestore(o); tell("読み込みました"); }} />
        )}

        <Toast msg={msg} />
      </div>
    </OverlayScreen>
  );
}

/* ============================================================
   ヘルプ
   使い方の説明はここと「？」の2か所だけに置く。
   画面に出しっぱなしにしないこと
   ============================================================ */
const HELP_SECTIONS = [
  {
    title: "記録のしかた",
    body: "画面の右下の＋を押すと、何を記録するか選べます。メモ・画像・チェックリスト・リンク・スケジュールの5つです。大事な記録には、書く画面の右上の星を押しておくと印が付きます。まとめて消したいときは、右上の「選択」から選んで削除できます。",
  },
  {
    title: "Today",
    body: "日・週・月で見かたを切り替えられます。左右に払うと前後へ移ります。日付のすぐ下に、選ぶ・種類でしぼる・並べかえる（時間順／新しい順）の3つがあります。記録は開かなくても中身がぜんぶ見えます。時刻を入れたものは、左の点線でつながって時間の流れが見えます。月の画面はマスに予定が最大4件まで並び、はじめは今日がえらばれています。",
  },
  {
    title: "チェックリスト",
    body: "チェックを入れると帯が伸びて、いくつ終わったかが「3/5」のように見えます。ぜんぶ終わると札の色が変わります。終わらなかったものは、右へ出る矢印から別のチェックリストへ移せます（持ち越し）。繰り返しはドラムで毎日・毎週（曜日を指定）・毎月から選べ、「いつまで」を決めればその日で止まります。",
  },
  {
    title: "計画",
    body: "右下の＋から「計画」か「種類」を作ります。種類はフォルダのような押せる札で並び、ひらくとその中の計画だけが出ます。やることは2段のチェックリストです。上の段に「いつまでに何をするか」と期限、その中に「そのためにやること」を書きます。中がぜんぶ済むと上の段も達成になり、並びは期限の近い順、済んだものは下に回ります。心配ごとや気づきは、そのつどメモとして書き、大事なものは記録の右上のピンで上に固定できます。",
  },
  {
    title: "フォルダ",
    body: "フォルダは右下の＋から作ります。ひらいたら右下の歯車から、記録を手で選ぶ・タグや種類で集める・名前を変える・削除するのすべてができます。タグと種類はどちらか片方だけでも集められ、保存する前に「この条件で◯件」と出ます。記録の上の「選択」から全選択して、フォルダから外したり、まとめて削除したりできます（「外す」を選べば記録そのものは残ります）。",
  },
  {
    title: "記録の置き場所",
    body: "記録はこの端末の中にだけ保存され、外には送られません。写真は記録とは別の置き場（端末の中）に入れているので、たくさん入れても記録そのものは軽いままです。そのぶん、ブラウザの履歴を消したり端末を替えたりすると失われます。メニューの「バックアップ」から、ときどきファイルに書き出しておいてください。写真も残したいときは「写真ごと書き出す」を選びます。",
  },
];

function HelpScreen({ onClose }) {
  const [closing, close] = useClosing(onClose);
  const { stripRef, screenRef } = useEdgeSwipeBack(close);
  const [open, setOpen] = useState(null);
  return (
    <OverlayScreen from="right" closing={closing}>
      <div ref={screenRef} className="absolute inset-0 bg-app flex flex-col">
        <div ref={stripRef} className="absolute left-0 top-16 bottom-0 w-9 z-10" style={{ touchAction: "none" }} />
        <OverlayHeader title="ヘルプ" onBack={close} />
        <div className="flex-1 overflow-y-auto px-5 py-5 max-w-2xl mx-auto w-full pb-16 space-y-2 ft-seq">
          {HELP_SECTIONS.map((s, i) => (
            <div key={s.title} className="rounded-2xl bg-white border border-neutral-200 overflow-hidden">
              <button type="button" onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center gap-2 px-3.5 py-3 text-left min-h-[56px] ft-tap ft-tap-card hover:bg-neutral-50">
                <span className="flex-1 font-display text-[16px] text-neutral-900">{s.title}</span>
                <ChevronDown size={18} className={"text-neutral-400 ft-chev " + (open === i ? "ft-chev-on" : "")} />
              </button>
              {open === i && (
                <p className="px-3.5 pb-3.5 text-[13.5px] leading-relaxed text-neutral-600 ft-open-y">{s.body}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </OverlayScreen>
  );
}

/* ============================================================
   グローバルCSS
   手ざわりの演出（ft-*）は、ここ1か所にまとめてある。
   **ボタンごとに active:scale-… を書かないこと。**
   ばらばらに書くと、少しずつ深さや速さがずれて全体の手ざわりが揃わなくなる
   ============================================================ */
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600&display=swap');
/* 見出しも本文も、同じゴシックでそろえる。
   **見出しだけ極太（900）や明朝にしないこと。**
   字が重くなって、画面が息苦しく見える。太さは700まで */
/* **極太にしないこと。** 字が重なって見えて、画面が息苦しくなる */
.font-display { font-family: 'Noto Sans JP', sans-serif; font-weight: 600; letter-spacing: .01em; }
/* 太字は600まで。Tailwind の font-bold（700）もここでゆるめる */
.font-bold { font-weight: 600; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.font-sans, body { font-family: 'Noto Sans JP', sans-serif; }
/* 線は細く。しるしの線が太いと、それだけで画面が固く見える */
.ft-root svg:not(.thick) { stroke-width: 1.75; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
.no-scrollbar::-webkit-scrollbar { display: none; }

/* ボタンの高さ。**これより低くしないこと** */
/* ボタンの高さはここ1か所で決める。**画面ごとに別の高さを書かないこと。**
   細いボタンが混じると、押しづらいうえに全体が落ち着かなく見える */
.btn-h { min-height: 50px; }
/* 画面のいちばん下にある「保存する」など、いちばん大事なボタン */
.btn-h-lg { min-height: 54px; }
.ft-h-field { min-height: 48px; }

/* 入力欄の文字は必ず16px。
   iPhoneのSafariは、16pxより小さい入力欄に触れると画面を勝手に拡大し、
   横にも動くようになって書きづらくなる。文字の大きさの設定からも外してある */
.ft-input { font-size: 16px; }

/* タップの質を上げるための共通設定。
   端末が勝手に出す青い枠や灰色の膜を消し、待ち時間をなくす */
button, [role="button"], label, a {
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
button { -webkit-user-select: none; user-select: none; }
button:active { transition-duration: 60ms; }

@keyframes ft-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes ft-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes ft-right-in  { from { transform: translateX(100%); } to { transform: translateX(0); } }
@keyframes ft-right-out { from { transform: translateX(0); } to { transform: translateX(100%); } }
@keyframes ft-up-in    { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes ft-down-out { from { transform: translateY(0); } to { transform: translateY(100%); } }
@keyframes ft-sheet-down { from { transform: translateY(0); } to { transform: translateY(100%); } }
@keyframes ft-spin { to { transform: rotate(360deg); } }
@keyframes ft-pop { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
/* 下から出るシート：いったん少し行き過ぎて、定位置に戻る */
@keyframes ft-sheet-up {
  0%   { transform: translateY(100%); }
  72%  { transform: translateY(-8px); }
  88%  { transform: translateY(2px); }
  100% { transform: translateY(0); }
}

/* fill-mode は必ず backwards にすること。
   both だと終わったあとも transform が残り、
   中にある position:fixed の要素（ダイアログ）の位置の基準がずれる */
.anim-right     { animation: ft-right-in 0.26s cubic-bezier(0.22,1,0.36,1) backwards; }
.anim-right-out { animation: ft-right-out 0.22s cubic-bezier(0.55,0,0.68,0.53) forwards; }
.anim-up        { animation: ft-up-in 0.28s cubic-bezier(0.22,1,0.36,1) backwards; }
.anim-down-out  { animation: ft-down-out 0.24s cubic-bezier(0.55,0,0.68,0.53) forwards; }
.anim-sheet     { animation: ft-sheet-up 0.36s cubic-bezier(0.33,1,0.5,1) backwards; }
.anim-sheet-out { animation: ft-sheet-down 0.24s cubic-bezier(0.55,0,0.68,0.53) forwards; }
.anim-fade      { animation: ft-fade-in 0.2s ease-out backwards; }
.anim-fade-out  { animation: ft-fade-out 0.2s ease-out forwards; }
.anim-pop       { animation: ft-pop 0.26s cubic-bezier(0.34,1.4,0.5,1) backwards; }
.spin           { animation: ft-spin 0.75s linear infinite; }

/* --- 押した手ごたえ（全ボタン共通の土台）---
   沈むのは速く、戻りはゆっくり。これだけで指に返る感じが出る */
.ft-tap { transition: transform 0.24s cubic-bezier(0.22,1,0.36,1), filter 0.22s ease-out; }
.ft-tap:active { transform: scale(0.955); filter: brightness(0.95); transition-duration: 70ms; }
/* 大きなカードは沈みを控えめに、小さなアイコンは深めにすると同じ強さに感じる */
.ft-tap.ft-tap-card:active { transform: scale(0.982); }
.ft-tap.ft-tap-icon:active { transform: scale(0.88); }
.ft-tap:disabled { transform: none; filter: none; }
/* 押されてから画面が変わるまでの、ひと呼吸のあいだ沈めておく状態。
   ここは素早く暗くする。既定の0.24秒のままだと、
   暗くなりきる前に画面が切り替わってしまい、押した手ごたえが見えない */
.ft-tap-pressed { transform: scale(0.96); filter: brightness(0.9); transition-duration: 45ms; }
.ft-tap-card.ft-tap-pressed { transform: scale(0.982); }

@keyframes ft-bloom { 0% { opacity: 0; transform: scale(0.7); } 100% { opacity: 1; transform: scale(1); } }
.ft-chip { animation: ft-bloom 0.26s cubic-bezier(0.34,1.45,0.5,1) backwards; }

@keyframes ft-rise { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }
.ft-rise { animation: ft-rise 0.28s cubic-bezier(0.22,1,0.36,1) backwards; }
/* タブの入れ物そのものは、透明度だけで切り替える。
   ここで位置を動かすと、中の sticky なヘッダがぶれてしまう */
.ft-tabswap { animation: ft-fade-in 0.2s ease-out backwards; }

@keyframes ft-tabpop { 0% { transform: scale(1); } 34% { transform: scale(1.24); } 100% { transform: scale(1); } }
.ft-tabpop { animation: ft-tabpop 0.38s cubic-bezier(0.34,1.3,0.5,1) backwards; }
/* 下線は左右中央に寄せる指定（translateX(-50%)）が既に入っている。
   書き足しておかないと、伸びている間だけ左へずれる */
@keyframes ft-tabbar {
  from { transform: translateX(-50%) scaleX(0.1); opacity: 0.3; }
  to   { transform: translateX(-50%) scaleX(1);   opacity: 1; }
}
.ft-tabbar { animation: ft-tabbar 0.32s cubic-bezier(0.22,1,0.36,1) backwards; }

@keyframes ft-fab-in {
  0%   { opacity: 0; transform: scale(0.5) rotate(-90deg); }
  62%  { opacity: 1; transform: scale(1.09) rotate(8deg); }
  100% { opacity: 1; transform: scale(1) rotate(0deg); }
}
.ft-fab { animation: ft-fab-in 0.44s cubic-bezier(0.3,1.2,0.4,1) backwards; }

@keyframes ft-ring { 0% { opacity: 0.5; transform: scale(0.72); } 100% { opacity: 0; transform: scale(1.6); } }
.ft-ring { animation: ft-ring 0.62s cubic-bezier(0.22,1,0.36,1) forwards; }

@keyframes ft-mark {
  0% { transform: scale(1); } 28% { transform: scale(0.82); }
  64% { transform: scale(1.18); } 100% { transform: scale(1); }
}
.ft-mark { animation: ft-mark 0.44s cubic-bezier(0.34,1.2,0.5,1) backwards; }

/* 折りたたみを開いたとき。
   ft-open は透明度だけ。**中にドラム（position:fixed のシート）がある場所は必ず ft-open**。
   ft-open-y はわずかに上から降りてくる。中に fixed が無い場所だけで使うこと */
.ft-open   { animation: ft-fade-in 0.22s ease-out backwards; }
@keyframes ft-open-y { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: none; } }
.ft-open-y { animation: ft-open-y 0.24s cubic-bezier(0.22,1,0.36,1) backwards; }

.ft-chev { transition: transform 0.34s cubic-bezier(0.34,1.45,0.5,1); }
.ft-chev-on { transform: rotate(180deg); }

@keyframes ft-stagger { from { opacity: 0; transform: translateY(9px); } to { opacity: 1; transform: none; } }
.ft-seq > * { animation: ft-stagger 0.32s cubic-bezier(0.22,1,0.36,1) backwards; }
.ft-seq > *:nth-child(1) { animation-delay: 0.02s; }
.ft-seq > *:nth-child(2) { animation-delay: 0.05s; }
.ft-seq > *:nth-child(3) { animation-delay: 0.08s; }
.ft-seq > *:nth-child(4) { animation-delay: 0.11s; }
.ft-seq > *:nth-child(5) { animation-delay: 0.14s; }
.ft-seq > *:nth-child(6) { animation-delay: 0.17s; }
.ft-seq > *:nth-child(7) { animation-delay: 0.20s; }
.ft-seq > *:nth-child(n+8) { animation-delay: 0.22s; }

/* カレンダー・日週月の紙送り。押した向きへ送られるように */
@keyframes ft-page-l { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
@keyframes ft-page-r { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: none; } }
.ft-page-l { animation: ft-page-l 0.26s cubic-bezier(0.22,1,0.36,1) backwards; }
.ft-page-r { animation: ft-page-r 0.26s cubic-bezier(0.22,1,0.36,1) backwards; }
@keyframes ft-daypop { 0% { transform: scale(0.72); } 58% { transform: scale(1.1); } 100% { transform: scale(1); } }
.ft-daypop { animation: ft-daypop 0.34s cubic-bezier(0.34,1.3,0.5,1) backwards; }

@keyframes ft-check-in { 0% { opacity: 0; transform: scale(0) rotate(-45deg); } 100% { opacity: 1; transform: none; } }
.ft-check-in { animation: ft-check-in 0.3s cubic-bezier(0.34,1.5,0.5,1) backwards; }

/* 見つからなかったときの現れ方。
   ぱっと切り替わると「本当に探したのか」が分かりにくいので、
   絵がふわりと出て、少し遅れて文が続くようにする */
@keyframes ft-noresult {
  from { opacity: 0; transform: translateY(10px) scale(0.96); }
  to   { opacity: 1; transform: none; }
}
.ft-noresult > * { animation: ft-noresult 0.42s cubic-bezier(0.22,1,0.36,1) backwards; }
.ft-noresult > *:nth-child(1) { animation-delay: 0.04s; }
.ft-noresult > *:nth-child(2) { animation-delay: 0.18s; }

@keyframes ft-tip { from { opacity: 0; transform: translateY(-4px) scale(0.96); } to { opacity: 1; transform: none; } }
.ft-tip { animation: ft-tip 0.16s cubic-bezier(0.22,1,0.36,1) backwards; }
@keyframes ft-tip-out { from { opacity: 1; } to { opacity: 0; transform: translateY(-3px); } }
.ft-tip-out { animation: ft-tip-out 0.2s ease-in forwards; }

/* 本文の中のリンク。**下線は引かない**（色だけで押せることを示す）。
   <a> はブラウザが既定で下線を引くため、こちらで打ち消しておくこと */
.ft-link { text-decoration: none; }

/* --- 下からせり上がる小窓 ---
   高さは dvh（いま実際に見えている高さ）で決めること。
   vh は iPhone だとブラウザの帯を含んだ高さになるため、
   画面より下に伸びて、いちばん下のボタンが見えなくなる。
   margin: 0 も必ず付けること。space-y-* の中に置くと外側の余白が足され、その分だけ下へずれる */
.ft-sheet-wrap { position: fixed; left: 0; right: 0; top: 0; height: 100vh; margin: 0; }
.ft-sheet-box  { max-height: 82vh; }
@supports (height: 100dvh) {
  .ft-sheet-wrap { height: 100dvh; }
  .ft-sheet-box  { max-height: 82dvh; }
}
/* 中の「一覧」の場所。**flex-1 を使わないこと。**
   flex-1 は基準の高さが0なので、まわりに余りが無いと高さ0までつぶれる */
.ft-sheet-body { flex: 1 1 auto; min-height: 0; }

/* ============================================================
   文字の大きさ（小・中・大）
   クラス名ごとに大きさを上書きする形にしている。
   画面じゅうの text-[…] を書き換えるより、ここ1か所で切り替えるほうが取りこぼしが無い。
   **この一覧は手で書き足さないこと。** 使っている大きさをぜんぶ拾って、
   中＝1.09倍、大＝1.22倍で作ってある（順序が逆転しないように）
   ============================================================ */
.ft-font-m .text-\\[9\\.5px\\] { font-size: 10.5px; }
.ft-font-m .text-\\[11\\.5px\\] { font-size: 12.5px; }
.ft-font-m .text-\\[12px\\] { font-size: 13px; }
.ft-font-m .text-\\[12\\.5px\\] { font-size: 13.5px; }
.ft-font-m .text-\\[13px\\] { font-size: 14px; }
.ft-font-m .text-\\[13\\.5px\\] { font-size: 14.5px; }
.ft-font-m .text-\\[14px\\] { font-size: 15.5px; }
.ft-font-m .text-\\[14\\.5px\\] { font-size: 16px; }
.ft-font-m .text-\\[15px\\] { font-size: 16.5px; }
.ft-font-m .text-\\[15\\.5px\\] { font-size: 17px; }
.ft-font-m .text-\\[16px\\] { font-size: 17.5px; }
.ft-font-m .text-\\[17px\\] { font-size: 18.5px; }
.ft-font-m .text-\\[17\\.5px\\] { font-size: 19px; }
.ft-font-m .text-\\[19px\\] { font-size: 20.5px; }
.ft-font-m .text-\\[20px\\] { font-size: 22px; }
.ft-font-m .text-\\[21px\\] { font-size: 23px; }

.ft-font-l .text-\\[9\\.5px\\] { font-size: 11.5px; }
.ft-font-l .text-\\[11\\.5px\\] { font-size: 14px; }
.ft-font-l .text-\\[12px\\] { font-size: 14.5px; }
.ft-font-l .text-\\[12\\.5px\\] { font-size: 15px; }
.ft-font-l .text-\\[13px\\] { font-size: 16px; }
.ft-font-l .text-\\[13\\.5px\\] { font-size: 16.5px; }
.ft-font-l .text-\\[14px\\] { font-size: 17px; }
.ft-font-l .text-\\[14\\.5px\\] { font-size: 17.5px; }
.ft-font-l .text-\\[15px\\] { font-size: 18.5px; }
.ft-font-l .text-\\[15\\.5px\\] { font-size: 19px; }
.ft-font-l .text-\\[16px\\] { font-size: 19.5px; }
.ft-font-l .text-\\[17px\\] { font-size: 20.5px; }
.ft-font-l .text-\\[17\\.5px\\] { font-size: 21.5px; }
.ft-font-l .text-\\[19px\\] { font-size: 23px; }
.ft-font-l .text-\\[20px\\] { font-size: 24.5px; }
.ft-font-l .text-\\[21px\\] { font-size: 25.5px; }

/* ============================================================
   動きを止めるとき
   ・端末側の「視差効果を減らす」設定
   ・表示設定の「押したときの動き」を切ったとき（.ft-still）
   止めるのは動きだけ。読み込み中のくるくる（.spin）は残す
   ============================================================ */
.ft-still *:not(.spin), .ft-still *:not(.spin)::before, .ft-still *:not(.spin)::after {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
}
@media (prefers-reduced-motion: reduce) {
  .ft-root *:not(.spin), .ft-root *:not(.spin)::before, .ft-root *:not(.spin)::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* テーマカラー。--th-* を差し替えると配色が一括で変わる。
   **薄さ付きの色は、使う前にここへ足すこと。**
   足し忘れると色が付かず、線や字が見えないまま消える */
:root{
  --th-50:#F2FBF8; --th-100:#DFF4EC; --th-200:#BCE8DA; --th-300:#8FD9C2;
  --th-600:#4CC5A1; --th-700:#3DBD97; --th-800:#35A985; --th-900:#2C9273;
}
.bg-th-50{background-color:var(--th-50)} .bg-th-100{background-color:var(--th-100)}
.bg-th-600{background-color:var(--th-600)} .bg-th-700{background-color:var(--th-700)}
.bg-th-800{background-color:var(--th-800)} .bg-th-900{background-color:var(--th-900)}
.bg-th-50\\/40{background-color:color-mix(in srgb, var(--th-50) 40%, transparent)}
.hover\\:bg-th-50:hover{background-color:var(--th-50)} .hover\\:bg-th-100:hover{background-color:var(--th-100)}
.hover\\:bg-th-800:hover{background-color:var(--th-800)} .hover\\:bg-th-900:hover{background-color:var(--th-900)}
.text-th-700{color:var(--th-700)} .text-th-800{color:var(--th-800)} .text-th-900{color:var(--th-900)}
.text-th-800\\/60{color:color-mix(in srgb, var(--th-800) 60%, transparent)}
.hover\\:text-th-900:hover{color:var(--th-900)}
.border-th-200{border-color:var(--th-200)} .border-th-300{border-color:var(--th-300)}
.border-th-700{border-color:var(--th-700)} .border-th-800{border-color:var(--th-800)} .border-th-900{border-color:var(--th-900)}
.border-th-700\\/35{border-color:color-mix(in srgb, var(--th-700) 35%, transparent)}
.focus\\:border-th-800:focus{border-color:var(--th-800)}
.focus\\:ring-th-800\\/20:focus{box-shadow:0 0 0 4px color-mix(in srgb, var(--th-800) 20%, transparent)}

/* 画面の地の色。**まっ白にしないこと。**
   ほんのり色を敷いておくと、白い札が浮き上がって読みやすくなる */
/* 地はまっ白。**色を敷かないこと。**（札は影とうすい線で浮かせる） */
.bg-app{background-color:#FFFFFF}
.bg-white\\/15{background-color:rgba(255,255,255,.15)}
.hover\\:bg-white\\/15:hover{background-color:rgba(255,255,255,.15)}
.text-white\\/70{color:rgba(255,255,255,.7)}
.border-dashed-th{border-color:var(--th-200)}
/* 札のうすい影。線をなくして、影で浮かせる */
/* やり遂げたときの、ひと呼吸のお祝い */
@keyframes ftCelebrate { 0%{transform:scale(.6);opacity:0} 55%{transform:scale(1.12);opacity:1} 100%{transform:scale(1);opacity:1} }
.ft-celebrate{animation:ftCelebrate 620ms cubic-bezier(0.16,1,0.3,1) backwards}
.card-soft{box-shadow:0 1px 2px rgba(30,60,55,.04), 0 6px 16px rgba(30,60,55,.05)}
/* 見出しの帯。ひとつの色でベタ塗りにせず、ごく淡い流れをつける。
   **強いグラデーションにしないこと。** 色が主役になって、中身が負ける */
.bg-head{background:linear-gradient(165deg, var(--th-600) 0%, var(--th-800) 100%)}
.bg-fab{background:linear-gradient(160deg, var(--th-600) 0%, var(--th-800) 100%)}
/* 帯から中身へのつなぎ目をやわらげる、ごく薄い影 */
.head-fade{background:linear-gradient(180deg, rgba(30,60,55,.05), rgba(30,60,55,0))}
`;

/* ============================================================
   下のタブ
   ============================================================ */
const TABS = [
  { key: "today", label: "Today", icon: CalendarDays },
  { key: "find", label: "みつける", icon: Search },
  { key: "plan", label: "計画", icon: Target },
  { key: "folder", label: "フォルダ", icon: Folder },
];
function BottomNav({ active, onChange }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-neutral-200" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="max-w-lg lg:max-w-5xl mx-auto flex">
        {TABS.map(({ key, label, icon: Icon }) => {
          const isActive = active === key;
          return (
            <button key={key} onClick={() => onChange(key)} className="flex-1 flex flex-col items-center gap-1 py-2.5 min-h-[56px] relative ft-tap">
              {isActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] bg-th-800 rounded-full ft-tabbar" />}
              {/* 選ばれた瞬間だけ弾ませたいので、key を変えて描き直させている */}
              <Icon key={isActive ? "on" : "off"} size={21}
                className={isActive ? "text-th-800 ft-tabpop" : "text-neutral-500"} strokeWidth={isActive ? 2.5 : 2} />
              <span className={"text-[11.5px] tracking-tight whitespace-nowrap " + (isActive ? "text-th-800 font-bold" : "text-neutral-500 font-medium")}>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   最後の砦
   どこかで表示に失敗しても真っ白にはならず、復旧画面が出る。
   テーマ色のCSSは AppMain の中にあるため、**ここは inline style で直接指定している。**
   CSSが一切効いていない状態でも読めるようにするため。クラス名に置き換えないこと
   ============================================================ */
const EB_BOX = { minHeight: "100vh", background: "#FAFAF9", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px", fontFamily: "sans-serif" };
const EB_BTN = { width: "100%", minHeight: "40px", borderRadius: "12px", fontSize: "14.5px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" };

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false, copied: null }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { try { console.error("画面の表示に失敗しました", error); } catch (e) { /* noop */ } }

  async rescue() {
    try {
      const raw = await storageGet(REC_KEY);
      if (!raw) { this.setState({ copied: "empty" }); return; }
      const ok = await copyToClipboard(raw);
      this.setState({ copied: ok ? "ok" : "ng" });
    } catch (e) { this.setState({ copied: "ng" }); }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { copied } = this.state;
    return (
      <div style={EB_BOX}>
        <div style={{ maxWidth: "384px", width: "100%" }}>
          <h1 style={{ fontSize: "20px", fontWeight: 900, color: "#1C1917", margin: "0 0 8px" }}>画面を表示できませんでした</h1>
          <p style={{ fontSize: "13.5px", color: "#57534E", lineHeight: 1.7, margin: "0 0 8px" }}>
            記録は消えていません。この端末の中にそのまま残っています。
          </p>
          <p style={{ fontSize: "13.5px", color: "#57534E", lineHeight: 1.7, margin: "0 0 20px" }}>
            まず「もう一度開く」をお試しください。それでも直らないときは、下のボタンで記録を取り出し、メモアプリなどに貼り付けて保管してください。
          </p>
          <button onClick={() => { try { window.location.reload(); } catch (e) { /* noop */ } }}
            style={{ ...EB_BTN, background: "#134E4A", color: "#fff", border: "0", marginBottom: "10px" }}>もう一度開く</button>
          <button onClick={() => this.rescue()}
            style={{ ...EB_BTN, background: "#fff", color: "#44403C", border: "2px solid #D6D3D1" }}>記録をコピーして取り出す</button>
          {copied === "ok" && <p style={{ fontSize: "13px", fontWeight: 700, color: "#134E4A", marginTop: "12px" }}>コピーしました。メモアプリなどに貼り付けて保管してください。</p>}
          {copied === "ng" && <p style={{ fontSize: "13px", fontWeight: 700, color: "#9F1239", marginTop: "12px" }}>コピーできませんでした。</p>}
          {copied === "empty" && <p style={{ fontSize: "13px", fontWeight: 700, color: "#57534E", marginTop: "12px" }}>取り出せる記録が見つかりません。</p>}
        </div>
      </div>
    );
  }
}

export default function App() {
  return <ErrorBoundary><AppMain /></ErrorBoundary>;
}

function AppMain() {
  const [loaded, setLoaded] = useState(false);
  const [records, setRecordsState] = useState([]);
  const [plans, setPlansState] = useState([]);
  const [kinds, setKindsState] = useState([]);
  const [folders, setFoldersState] = useState([]);
  const [tagMaster, setTagMasterState] = useState([]);
  const [prefs, setPrefsState] = useState(DEFAULT_PREFS);

  const [tab, setTab] = useState("today");
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuInstant, setMenuInstant] = useState(false);

  const [typePick, setTypePick] = useState(false);
  const [scoped, setScoped] = useState(null);   // 週・月ぜんたいに付ける記録を作るとき
  const [selecting, setSelecting] = useState(false);   // えらぶ最中かどうか（＋を隠すため）
  const [kindOpen, setKindOpen] = useState(null);
  const [inPlan, setInPlan] = useState(null);   // 計画の中で記録を作るとき
  const [inFolder, setInFolder] = useState(null); // フォルダの中で記録を作るとき
  const [addPlanOpen, setAddPlanOpen] = useState(false);
  const [addPlanKind, setAddPlanKind] = useState(null);
  const [addKindOpen, setAddKindOpen] = useState(false);
  const [addFolderOpen, setAddFolderOpen] = useState(false);
  const [planPick, setPlanPick] = useState(false);
  const [editing, setEditing] = useState(null);
  const [dayOpen, setDayOpen] = useState(null);
  const [planOpen, setPlanOpen] = useState(null);
  const [folderOpen, setFolderOpen] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tagScreenOpen, setTagScreenOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [msg, tell] = useToast();

  /* --- 読み込み --- */
  useEffect(() => {
    let alive = true;
    (async () => {
      const [rs, ps, ks, fs, tg, pf, dr] = await Promise.all([
        loadList(REC_KEY), loadList(PLAN_KEY), loadList(KIND_KEY), loadList(FOLDER_KEY),
        storageGet(TAG_KEY), loadPrefs(), storageGet(DRAFT_KEY),
      ]);
      if (!alive) return;
      setRecordsState(rs.map(migrateRecord).filter(Boolean));
      setPlansState(ps.map(migratePlan).filter(Boolean));
      setKindsState(ks.filter((k) => k && k.id));
      setFoldersState(fs.map(migrateFolder).filter(Boolean));
      try { setTagMasterState(normalizeTags(JSON.parse(tg || "[]"))); } catch (e) { setTagMasterState([]); }
      setPrefsState(pf);
      try { const d = dr ? migrateRecord(JSON.parse(dr)) : null; if (d) setDraft(d); } catch (e) { /* noop */ }
      /* 端末に「この記録を消さないで」とお願いしておく */
      askPersist();
      setLoaded(true);
      try { if (typeof window !== "undefined" && window.__hibiHideSplash) window.__hibiHideSplash(); } catch (e) { /* noop */ }
    })();
    return () => { alive = false; };
  }, []);

  /* --- 保存 --- */
  /* 保存できなかったとき（端末の空きがない、写真が多すぎるなど）は、
     **黙って落とさないこと。** 書いたものが消えたように見える */
  const setRecords = useCallback((next) => {
    setRecordsState(next);
    saveList(REC_KEY, next).then((res) => {
      if (res && res.ok === false) {
        tell("保存できませんでした。写真を減らすか、バックアップを取ってから古い記録を消してください");
      }
    });
  }, []);
  const setPlans = useCallback((next) => { setPlansState(next); saveList(PLAN_KEY, next); }, []);
  const setKinds = useCallback((next) => { setKindsState(next); saveList(KIND_KEY, next); }, []);
  const setFolders = useCallback((next) => { setFoldersState(next); saveList(FOLDER_KEY, next); }, []);
  const setTagMaster = useCallback((next) => {
    const v = normalizeTags(next);
    setTagMasterState(v);
    storageSet(TAG_KEY, JSON.stringify(v));
  }, []);
  const savePrefs = useCallback((next) => { setPrefsState(next); persistPrefs(next); }, []);

  /* 画面に出すタグの一覧。一覧と記録の両方から作る。
     **記録から集めるだけにしないこと。** それだけだと、記録を消したとたんタグも選べなくなる */
  const knownTags = useMemo(
    () => normalizeTags([...tagMaster, ...allTagsOf(records)]).sort((a, b) => a.localeCompare(b, "ja")),
    [tagMaster, records]);
  const addTagToMaster = useCallback((t) => {
    const v = normalizeTags([t])[0];
    if (!v) return;
    setTagMaster([...tagMaster, v]);
  }, [tagMaster, setTagMaster]);

  const typeNames = useMemo(() => {
    const out = { ...TYPE_LABELS };
    TYPES.forEach((t) => { const v = (prefs.typeName || {})[t]; if (v && v.trim()) out[t] = v.trim(); });
    return out;
  }, [prefs.typeName]);

  /* --- 記録の出し入れ --- */
  const saveRecord = async (rec0, opts = {}) => {
    /* 写真は記録の中に持たず、置き場へ移してから保存する。
       **この一手を飛ばさないこと。** すぐに保存できなくなる */
    const rec = await stashPhotos(rec0);
    const exists = records.some((r) => r.id === rec.id);
    const next = exists ? records.map((r) => (r.id === rec.id ? rec : r)) : [...records, rec];
    setRecords(next);
    normalizeTags(rec.tags).forEach((t) => { if (!knownTags.some((k) => k.toLowerCase() === t.toLowerCase())) addTagToMaster(t); });
    if (!opts.keepOpen) {
      setEditing(null);
      storageSet(DRAFT_KEY, "");
      setDraft(null);
      tell(exists ? "書き直しました" : "記録しました");
    }
  };
  const deleteRecord = (id) => {
    const next = records.filter((r) => r.id !== id);
    setRecords(next);
    sweepPhotos(next);
    setEditing(null);
    tell("削除しました");
  };
  /* えらんだぶんをまとめて削除。フォルダに手で入れてあった控えも一緒に外す */
  const deleteMany = (ids) => {
    if (!ids || !ids.length) return;
    const set = new Set(ids);
    const left = records.filter((r) => !set.has(r.id));
    setRecords(left);
    sweepPhotos(left);
    const nf = folders.map((f) => ({ ...f, picked: (f.picked || []).filter((x) => !set.has(x)) }));
    if (JSON.stringify(nf) !== JSON.stringify(folders)) setFolders(nf);
    tell(`${ids.length}件を削除しました`);
  };

  /* チェックの入れ外し。
     繰り返しから作られた仮の札を押したときは、その日ぶんの記録として実体を作る */
  const toggleItem = (rec, itemId) => {
    if (rec.__repeat) {
      /* その日ぶんの実体が**すでにあるなら、それを使うこと。**
         毎回あたらしく作ると、同じ札がどんどん増えていく */
      const already = records.find((r) => r.fromRepeat === rec.id && r.date === rec.date);
      if (already) {
        setRecords(records.map((r) => (r.id === already.id
          ? { ...r, items: (r.items || []).map((i, k) => (i.id === itemId || (rec.items || [])[k] && (rec.items || [])[k].id === itemId ? { ...i, done: !i.done } : i)), updatedAt: new Date().toISOString() }
          : r)));
        return;
      }
      const real = {
        ...emptyRecord("checklist", rec.date),
        tags: rec.tags, title: rec.title, time: rec.time, comment: rec.comment,
        planId: rec.planId, mark: rec.mark, fromRepeat: rec.id,
        items: (rec.items || []).map((i) => ({ id: i.id, text: i.text, done: i.id === itemId })),
        repeat: { freq: "none", days: [], until: "" },
      };
      setRecords([...records, real]);
      return;
    }
    setRecords(records.map((r) => r.id === rec.id
      ? { ...r, items: (r.items || []).map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)), updatedAt: new Date().toISOString() }
      : r));
  };

  /* 項目を別のチェックリストへ移す（持ち越し） */
  const moveItem = (from, item, toId) => {
    setRecords(records.map((r) => {
      if (r.id === from.id) return { ...r, items: r.items.filter((i) => i.id !== item.id), updatedAt: new Date().toISOString() };
      if (r.id === toId) return { ...r, items: [...(r.items || []), { ...item, id: uid(), done: false }], updatedAt: new Date().toISOString() };
      return r;
    }));
    tell("移しました");
  };
  const createAndMove = (from, item, name) => {
    const fresh = {
      ...emptyRecord("checklist", todayStr()),
      title: name, tags: from.tags, planId: from.planId,
      items: [{ ...item, id: uid(), done: false }],
    };
    setRecords([
      ...records.map((r) => (r.id === from.id ? { ...r, items: r.items.filter((i) => i.id !== item.id), updatedAt: new Date().toISOString() } : r)),
      fresh,
    ]);
    tell("新しいチェックリストへ移しました");
  };

  /* --- 計画 --- */
  const addKind = (name) => setKinds([...kinds, { id: uid(), name, color: COLORS[kinds.length % COLORS.length].key }]);
  const renameKind = (id, name) => setKinds(kinds.map((k) => (k.id === id ? { ...k, name } : k)));
  const deleteKind = (id) => {
    setKinds(kinds.filter((k) => k.id !== id));
    setPlans(plans.map((p) => (p.kindId === id ? { ...p, kindId: null } : p)));
  };
  const addPlan = (kindId, name) => {
    const kind = kinds.find((k) => k.id === kindId);
    const p = { ...emptyPlan(kindId), name: name || "新しい計画", color: (kind && kind.color) || "teal" };
    setPlans([...plans, p]);
    setPlanOpen(p.id);
  };
  /* 上への固定の入り切り */
  const togglePin = (rec) => {
    setRecords(records.map((r) => (r.id === rec.id ? { ...r, pinned: !r.pinned } : r)));
  };
  const changePlan = (p) => setPlans(plans.map((x) => (x.id === p.id ? p : x)));
  const deletePlan = (id) => { setPlans(plans.filter((x) => x.id !== id)); setPlanOpen(null); tell("計画を削除しました"); };

  /* 複数の日付に、同じチェックリストをまとめて作る */

  /* --- フォルダ --- */
  const addFolder = (name) => { const f = emptyFolder(name); setFolders([...folders, f]); setFolderOpen(f.id); };
  const changeFolder = (f) => setFolders(folders.map((x) => (x.id === f.id ? f : x)));
  const deleteFolder = (id) => { setFolders(folders.filter((x) => x.id !== id)); setFolderOpen(null); tell("フォルダを削除しました"); };

  /* --- タグの整理。一覧と記録の両方に同じことをすること --- */
  const renameTag = (from, to) => {
    const v = normalizeTags([to])[0];
    if (!v) return;
    setTagMaster(tagMaster.map((t) => (t === from ? v : t)));
    setRecords(records.map((r) => {
      const has = normalizeTags(r.tags).some((t) => t.toLowerCase() === from.toLowerCase());
      return has ? { ...r, tags: normalizeTags(r.tags.map((t) => (t.toLowerCase() === from.toLowerCase() ? v : t))) } : r;
    }));
    setFolders(folders.map((f) => ({ ...f, tags: normalizeTags(f.tags.map((t) => (t.toLowerCase() === from.toLowerCase() ? v : t))) })));
  };
  const deleteTag = (t) => {
    setTagMaster(tagMaster.filter((x) => x !== t));
    setRecords(records.map((r) => ({ ...r, tags: normalizeTags(r.tags).filter((x) => x.toLowerCase() !== t.toLowerCase()) })));
    setFolders(folders.map((f) => ({ ...f, tags: normalizeTags(f.tags).filter((x) => x.toLowerCase() !== t.toLowerCase()) })));
  };

  /* --- バックアップ --- */
  const restore = async (obj) => {
    /* 写真ごとのバックアップなら、絵も置き場へ戻す */
    if (obj.photos && typeof obj.photos === "object") {
      for (const [id, src] of Object.entries(obj.photos)) {
        if (typeof src === "string") await photoPut(id, src);
      }
    }
    const rs = Array.isArray(obj.records) ? obj.records.map(migrateRecord).filter(Boolean) : [];
    setRecords(rs);
    setPlans(Array.isArray(obj.plans) ? obj.plans.map(migratePlan).filter(Boolean) : []);
    setKinds(Array.isArray(obj.kinds) ? obj.kinds.filter((k) => k && k.id) : []);
    setFolders(Array.isArray(obj.folders) ? obj.folders.map(migrateFolder).filter(Boolean) : []);
    setTagMaster(Array.isArray(obj.tags) ? obj.tags : []);
    /* 読み込んだものは、もう書き出し済み。促さないよう「最後に書き出した日」を今にする */
    const nextPrefs = obj.prefs && typeof obj.prefs === "object"
      ? { ...DEFAULT_PREFS, ...obj.prefs, typeColor: { ...DEFAULT_TYPE_COLOR, ...(obj.prefs.typeColor || {}) }, typeName: obj.prefs.typeName || {}, lastBackup: new Date().toISOString() }
      : { ...prefs, lastBackup: new Date().toISOString() };
    savePrefs(nextPrefs);
    setBackupOpen(false);
    tell("読み込みました");
  };

  const editingLive = editing;

  /* ＋から作るとき。scoped ＝ 週や月ぜんたいに付ける記録 */
  const startNew = (type) => {
    setTypePick(false);
    const s = scoped, pl = inPlan, fo = inFolder;
    setScoped(null); setInPlan(null); setInFolder(null);
    const base = s ? emptyRecord(type, s.dateKey, s.scope) : emptyRecord(type);
    /* 計画やフォルダの中で作ったときは、はじめからそこに入るようにしておく */
    if (pl) base.planId = pl;
    if (fo) setFolders(folders.map((f) => (f.id === fo ? { ...f, picked: [...(f.picked || []), base.id] } : f)));
    setEditing(base);
  };
  const addScoped = (scope, dateKey) => { setScoped({ scope, dateKey }); setTypePick(true); };

  /* 右下の＋。押したときの働きは、いま見ている画面によって変わる */
  const onFab = () => {
    /* 計画タブでは、いつも「計画」か「種類」かを聞く。
       **種類がないときに、いきなり種類作りへ入れないこと。**
       はじめて使う人は「まず計画を書きたい」ので、そこで止まってしまう */
    if (tab === "plan") { setPlanPick(true); return; }
    if (tab === "folder") { setAddFolderOpen(true); return; }
    setTypePick(true);
  };

  /* 札の中から使う受け渡し（持ち越しなど）。
     画面をまたいで同じものを渡したいので、ここでひとつにまとめてある */
  const recordActions = useMemo(
    () => ({ records, onMoveItem: moveItem, onCreateAndMove: createAndMove }),
    [records]
  );

  /* メニューから画面へ移るときは、いま出ている画面をすべて閉じること。
     **画面を増やしたらここにも足すこと。** 閉じ忘れると下に残ったままになる */
  const goFromMenu = (fn) => {
    setMenuInstant(true);
    setMenuOpen(false);
    setEditing(null); setDayOpen(null); setPlanOpen(null);
    setFolderOpen(null); setKindOpen(null); setSettingsOpen(false);
    setTagScreenOpen(false); setBackupOpen(false); setHelpOpen(false);
    setTimeout(() => { fn(); setMenuInstant(false); }, 0);
  };

  const theme = THEMES.find((t) => t.key === prefs.theme) || THEMES[0];
  const planObj = plans.find((p) => p.id === planOpen) || null;
  const kindObj = kinds.find((k) => k.id === kindOpen) || null;
  const folderObj = folders.find((f) => f.id === folderOpen) || null;

  const menuItems = [
    { label: "表示設定", desc: "色・文字の大きさ・動き", icon: <Palette size={19} />, onClick: () => goFromMenu(() => setSettingsOpen(true)) },
    { label: "タグの編集", desc: "名前の変更・削除", icon: <Tag size={19} />, onClick: () => goFromMenu(() => setTagScreenOpen(true)) },
    { label: "バックアップ", desc: "書き出す・読み込む", icon: <Download size={19} />, onClick: () => goFromMenu(() => setBackupOpen(true)) },
    { label: "ヘルプ", desc: "使いかた", icon: <CircleHelp size={19} />, onClick: () => goFromMenu(() => setHelpOpen(true)) },
  ];

  return (
    <PrefsContext.Provider value={prefs}>
      <ColorContext.Provider value={prefs.typeColor}>
        <TypeNameContext.Provider value={typeNames}>
          <MenuContext.Provider value={() => setMenuOpen(true)}>
           <RecordActionsContext.Provider value={recordActions}>
            {/* ft-root ＝ 動きの効き先。「動きの演出」を切ると ft-still が付いて、すべて止まる */}
            <div className={"min-h-screen bg-app font-sans text-neutral-900 ft-root "
              + (prefs.motion === false ? "ft-still " : "")
              + ("ft-font-" + (prefs.fontSize || "s"))}>
              <style>{GLOBAL_CSS}</style>
              <style>{`:root{${Object.entries(theme.vars).map(([k, v]) => `--th-${k}:${v}`).join(";")}}`}</style>

              {!loaded ? (
                <LoadingBlock label="読み込んでいます" />
              ) : (
                <div key={tab} className="ft-tabswap">
                  <div className="max-w-lg lg:max-w-3xl mx-auto ft-rise">
                    {tab === "today" && (
                      <>
                        <TodayScreen records={records} plans={plans}
                          onEdit={(r) => setEditing(r)}
                          onToggleItem={toggleItem} onOpenDay={(d) => setDayOpen(d)}
                          onOpenPlan={(p) => setPlanOpen(p.id)} onAddScoped={addScoped}
                          onDeleteMany={deleteMany} onPin={togglePin} onSelecting={setSelecting} />
                      </>
                    )}
                    {tab === "find" && (
                      <FindScreen records={records} knownTags={knownTags}
                        onEdit={(r) => setEditing(r)} onToggleItem={toggleItem} onDeleteMany={deleteMany} onPin={togglePin}
                        onSelecting={setSelecting} />
                    )}
                    {tab === "plan" && (
                      <PlanScreen plans={plans} kinds={kinds} records={records}
                        onOpenPlan={(p) => setPlanOpen(p.id)} onOpenKind={(k) => setKindOpen(k.id)}
                        onPinPlan={(pl) => changePlan({ ...pl, pinned: !pl.pinned })} />
                    )}
                    {tab === "folder" && (
                      <FolderScreen folders={folders} records={records}
                        onOpen={(f) => setFolderOpen(f.id)} />
                    )}
                  </div>
                </div>
              )}

              {/* ＋ボタン。**動く入れ物の中に置かないこと**（上から落ちてくるように見える）。
                  z-40。下の帯（z-30）より小さいと帯の下に潜って欠けて見える */}
              {/* えらぶ最中は、下に帯が出るので＋は隠す */}
              {loaded && !selecting && (
                <button type="button" onClick={onFab}
                  aria-label={tab === "plan" ? "計画を追加" : tab === "folder" ? "フォルダを追加" : "記録する"}
                  className="fixed right-5 w-14 h-14 rounded-2xl bg-fab text-white flex items-center justify-center ft-tap ft-fab z-40 card-soft"
                  style={{ bottom: "calc(env(safe-area-inset-bottom) + 96px)" }}>
                  {/* **どの画面でも同じ絵にしないこと。** 何が増えるのかが分かる絵にする */}
                  {tab === "plan" ? <Target size={24} /> : tab === "folder" ? <FolderPlus size={24} /> : <Plus size={26} />}
                </button>
              )}

              {loaded && <BottomNav active={tab} onChange={(k) => { setTab(k); }} />}

              <SideMenu open={menuOpen} instant={menuInstant} onClose={() => setMenuOpen(false)} items={menuItems}
                footer={<p className="text-[12px] text-neutral-400 leading-relaxed">
                  記録はこの端末の中だけに保存されます。ときどきバックアップを書き出しておいてください。
                </p>} />

              {/* 書きかけの記録。**画面の上に置きっぱなしにしないこと。**
                  開いたときに一度だけたずねる */}
              {draft && !editing && (
                <DraftCard draft={draft} onResume={() => { setEditing(draft); setDraft(null); }}
                  onDiscard={() => { setDraft(null); storageSet(DRAFT_KEY, ""); }} />
              )}

              {typePick && (
                <TypePickSheet onPick={startNew}
                  onCancel={() => { setTypePick(false); setScoped(null); setInPlan(null); setInFolder(null); }}
                  types={scoped ? SCOPED_TYPES : TYPES} />
              )}

              {/* 計画タブの＋：計画を作るか、種類を作るか */}
              {planPick && (
                <TypePickSheet title="追加するもの" types={["__plan", "__kind"]}
                  labels={{ __plan: "計画", __kind: "計画の種類" }}
                  icons={{ __plan: <Target size={22} />, __kind: <Layers size={22} /> }}
                  onCancel={() => setPlanPick(false)}
                  onPick={(k) => { setPlanPick(false); if (k === "__plan") setAddPlanOpen(true); else setAddKindOpen(true); }} />
              )}
              {addKindOpen && (
                <NameDialog title="種類を追加" label="名前" placeholder="勉強／からだ／旅 など" confirmLabel="作成"
                  onCancel={() => setAddKindOpen(false)} onConfirm={(n) => { addKind(n); setAddKindOpen(false); }} />
              )}
              {addPlanOpen && (
                <NameDialog title="計画を追加" label="名前" placeholder="英語／体づくり など" confirmLabel="作成"
                  onCancel={() => setAddPlanOpen(false)}
                  /* **種類がひとつでも、勝手にそこへ入れないこと。**
                     計画はまず「種類なし」で独立して並び、あとから種類へ移せる */
                  onConfirm={(n) => { addPlan(addPlanKind || null, n); setAddPlanOpen(false); setAddPlanKind(null); }} />
              )}
              {addFolderOpen && (
                <NameDialog title="フォルダを追加" label="名前" placeholder="ゲーム／旅 など" confirmLabel="作成"
                  onCancel={() => setAddFolderOpen(false)} onConfirm={(n) => { addFolder(n); setAddFolderOpen(false); }} />
              )}

              {editingLive && (
                <RecordForm initial={editingLive} plans={plans}
                  knownTags={knownTags} onCreateTag={addTagToMaster}
                  onSave={saveRecord}
                  onCancel={() => { setEditing(null); }}
                  onDelete={records.some((r) => r.id === editingLive.id) ? () => deleteRecord(editingLive.id) : null}
                  onAutoDraft={(d) => { storageSet(DRAFT_KEY, JSON.stringify(d)); }} />
              )}

              {dayOpen && (
                <DayScreen date={dayOpen} records={records} onClose={() => setDayOpen(null)}
                  onEdit={(r) => setEditing(r)} onToggleItem={toggleItem} onPin={togglePin} onDeleteMany={deleteMany} />
              )}

              {kindObj && (
                <KindScreen kind={kindObj} plans={plans} records={records}
                  onClose={() => setKindOpen(null)} onOpenPlan={(p) => setPlanOpen(p.id)}
                  onAddPlan={(k) => { setAddPlanKind(k.id); setAddPlanOpen(true); }}
                  onRename={renameKind} onDelete={deleteKind}
                  onPinPlan={(pl) => changePlan({ ...pl, pinned: !pl.pinned })} />
              )}

              {planObj && (
                <PlanDashboard plan={planObj} records={records} kinds={kinds}
                  onClose={() => setPlanOpen(null)} onChange={changePlan} onDelete={deletePlan}
                  onAddRecord={(pl) => { setInPlan(pl.id); setTypePick(true); }}
                  onEditRecord={(r) => setEditing(r)} onToggleItem={toggleItem} onPin={togglePin} onDeleteMany={deleteMany} />
              )}

              {folderObj && (
                <FolderDetail folder={folderObj} records={records} knownTags={knownTags} onCreateTag={addTagToMaster}
                  onClose={() => setFolderOpen(null)} onChange={changeFolder} onDelete={deleteFolder}
                  onAddRecord={(f) => { setInFolder(f.id); setTypePick(true); }}
                  onEditRecord={(r) => setEditing(r)} onToggleItem={toggleItem} onPin={togglePin} onDeleteMany={deleteMany} />
              )}

              {settingsOpen && <SettingsScreen prefs={prefs} onSave={savePrefs} onClose={() => setSettingsOpen(false)} />}
              {tagScreenOpen && (
                <TagManageScreen tags={knownTags} records={records}
                  onAdd={addTagToMaster} onRename={renameTag} onDelete={deleteTag}
                  onClose={() => setTagScreenOpen(false)} />
              )}
              {backupOpen && (
                <BackupScreen data={{ records, plans, kinds, folders, tags: tagMaster, prefs }}
                  onClose={() => setBackupOpen(false)} onRestore={restore}
                  onBackedUp={() => savePrefs({ ...prefs, lastBackup: new Date().toISOString() })} />
              )}
              {helpOpen && <HelpScreen onClose={() => setHelpOpen(false)} />}

              <Toast msg={msg} />
            </div>
           </RecordActionsContext.Provider>
          </MenuContext.Provider>
        </TypeNameContext.Provider>
      </ColorContext.Provider>
    </PrefsContext.Provider>
  );
}
