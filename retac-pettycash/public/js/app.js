import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import {
  getAuth, connectAuthEmulator, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  deleteUser, sendPasswordResetEmail, signOut, onAuthStateChanged, setPersistence,
  browserSessionPersistence, inMemoryPersistence
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
  getFirestore, connectFirestoreEmulator, doc, collection, query, where, onSnapshot,
  getDoc, getDocs, setDoc, updateDoc, runTransaction, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { firebaseConfig, USER_DOMAIN, CATEGORIES, USE_EMULATORS } from "./firebase-config.js";

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);
if (USE_EMULATORS) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

/* ---------------- ثوابت وأدوات ---------------- */
const ROLES = { emp: "موظف", acc: "مدير الحسابات", fin: "المدير المالي", admin: "مسؤول النظام" };
const ST = {
  draft: "مسودة",
  p1: "بانتظار مدير الحسابات",
  p2: "بانتظار المدير المالي",
  approved: "جاهز للصرف",
  paid: "مكتمل",
  rejected: "مرفوض",
  returned: "مرجّع للتعديل"
};
const OPEN = ["draft", "p1", "p2", "approved", "returned"];

let me = null;            // { uid, name, role }
let requests = [];
let beneficiaries = [];
let userProfiles = [];
let page = "home", editing = null, files = [], openNo = null, busy = false;
let stops = [];           // إيقاف المتابعة اللحظية عند الخروج
let loginNotice = "";
let lang = localStorage.getItem("retac-lang") || "ar";
let theme = localStorage.getItem("retac-theme") || "light";

const EN_TEXT = {
  "نظام إدارة المصروفات":"Petty Cash Management",
  "ريتاك أبوسمبل":"RETAC Abu Simbel",
  "ريتاك أبو سمبل":"RETAC Abu Simbel",
  "اعتماد البيتي كاش والشيكات":"Petty-cash and cheque approvals",
  "اسم المستخدم":"Username",
  "أدخل اسم المستخدم أو البريد":"Enter username or email",
  "كلمة السر":"Password",
  "تسجيل الدخول":"Sign in",
  "نحو إدارة مالية أكثر كفاءة":"Toward a more efficient financial system",
  "تسجيل الخروج":"Sign out",
  "الرئيسية":"Home",
  "طلب جديد":"New request",
  "الطلبات الجارية":"Active requests",
  "طلباتي الجارية":"My active requests",
  "الطلبات المعلقة":"Pending requests",
  "طلبات معلّقة":"Pending requests",
  "تحتاج إلى إجراء":"Action required",
  "جاهزة للصرف":"Ready for payment",
  "المرفوضة":"Rejected",
  "الطلبات المرفوضة":"Rejected requests",
  "الطلبات المكتملة":"Completed requests",
  "طلبات اليوم":"Today's requests",
  "التقارير":"Reports",
  "المستفيدون":"Beneficiaries",
  "إدارة المستخدمين":"User management",
  "مرحباً بك في نظام إدارة المصروفات":"Welcome to the petty-cash management system",
  "معاً نحو إدارة مالية أكثر كفاءة":"Together for more efficient financial management",
  "ملخص الطلبات":"Request summary",
  "حالة الطلبات خلال آخر 30 يومًا":"Request status over the last 30 days",
  "إحصائيات سريعة":"Quick statistics",
  "أدوات سريعة":"Quick actions",
  "أحدث الطلبات":"Latest requests",
  "رقم الطلب":"Request number",
  "التاريخ":"Date",
  "الحالة":"Status",
  "المبلغ":"Amount",
  "معتمد":"Approved",
  "مرفوض":"Rejected",
  "قيد المراجعة":"Under review",
  "مرجّع للتعديل":"Returned for revision",
  "طلب":"Request",
  "طلبات":"Requests",
  "متابعة الطلبات":"Track requests",
  "عرض التفاصيل":"View details",
  "اضغط للعرض":"Click to view",
  "بيتي كاش":"Petty cash",
  "شيك":"Cheque",
  "شيكات":"Cheques",
  "الإرسال":"Submitted",
  "مدير الحسابات":"Accounts manager",
  "المدير المالي":"Finance manager",
  "الصرف":"Payment",
  "مسودة":"Draft",
  "بانتظار مدير الحسابات":"Waiting for accounts manager",
  "بانتظار المدير المالي":"Waiting for finance manager",
  "جاهز للصرف":"Ready for payment",
  "مكتمل":"Completed",
  "مرجّع للتعديل":"Returned for revision",
  "تحديث":"Refresh",
  "إلغاء":"Cancel",
  "حفظ كمسودة":"Save draft",
  "تعديل وإعادة إرسال الطلب":"Edit and resubmit",
  "إرسال الطلب":"Submit request",
  "إغلاق":"Close",
  "مسؤول النظام":"System administrator",
  "موظف":"Employee"
};

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = d => { const x = new Date(d); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
const when = d => day(d) + " " + new Date(d).toTimeString().slice(0, 5);
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  ["theme_btn", "login_theme_btn"].forEach(id => {
    if ($(id)) $(id).innerHTML = theme === "dark" ? icon("sun") : icon("moon");
  });
  localStorage.setItem("retac-theme", theme);
}
function applyLanguage() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  ["lang_btn", "login_lang_btn"].forEach(id => { if ($(id)) $(id).textContent = lang === "ar" ? "EN" : "عربي"; });
  localStorage.setItem("retac-lang", lang);
  translateDocument();
  updateDateAndTime();
  if (me) { renderNav(); refresh(); }
  if ($("topbar_search_label")) $("topbar_search_label").textContent = lang === "ar"
    ? "البحث في الطلبات والمستفيدين..."
    : "Search requests, beneficiaries...";
}
function translateDocument() {
  if (lang === "en") {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      if (!node.nodeValue?.trim()) return;
      if (!node.__retacOriginal) node.__retacOriginal = node.nodeValue;
      let text = node.__retacOriginal;
      Object.entries(EN_TEXT).sort((a, b) => b[0].length - a[0].length).forEach(([ar, en]) => { text = text.split(ar).join(en); });
      node.nodeValue = text;
    });
  } else {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.__retacOriginal) node.nodeValue = node.__retacOriginal;
    }
  }
  if ($("u")) $("u").placeholder = lang === "ar" ? "أدخل اسم المستخدم أو البريد" : "Enter username or email";
  if ($("pw")) $("pw").placeholder = lang === "ar" ? "••••••••" : "••••••••";
}
function updateDateAndTime() {
  const locale = lang === "ar" ? "ar-EG" : "en-GB";
  const now = new Date();
  const hour = now.getHours();
  const greeting = lang === "ar"
    ? (hour < 12 ? "صباح الخير" : hour < 18 ? "نهارك سعيد" : "مساء الخير")
    : (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
  if ($("greeting_label")) $("greeting_label").textContent = greeting;
  if ($("today_label")) $("today_label").textContent = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  if ($("clock_label")) $("clock_label").textContent = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: lang === "en" }).format(now);
}
const ago = n => Date.now() - n * 864e5;
const typeName = t => t === "cash" ? "بيتي كاش" : "شيك";
const safeData = d => /^data:(image\/jpeg|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(d);
const entry = (action, note = "") => ({ action, note, uid: me.uid, name: me.name, at: Timestamp.now() });

const ICON = {
  home: "M3 11l9-8 9 8M5 10v10h14V10", new: "M12 5v14M5 12h14",
  users: "M16 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M10 11a4 4 0 100-8 4 4 0 000 8M20 8v6M23 11h-6",
  inbox: "M4 13l3-8h10l3 8v6H4zM4 13h5l1 3h4l1-3h5",
  pending: "M4 13l3-8h10l3 8v6H4zM4 13h5l1 3h4l1-3h5",
  ready: "M3 7h18v10H3zM12 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5",
  completed: "M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h3",
  report: "M5 20V10M12 20V4M19 20v-7",
  benef: "M16 19c0-3-2-5-5-5s-5 2-5 5M11 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7M17 5a3 3 0 010 6M19 19c0-2-1-3.5-2-4",
  cash: "M3 7h18v10H3zM12 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5",
  cheque: "M3 6h18v12H3zM7 10h6M7 14h3M15 15l3-4",
  out: "M10 5H5v14h5M14 8l4 4-4 4M18 12H9",
  up: "M12 16V4M7 9l5-5 5 5M5 20h14", x: "M6 6l12 12M18 6L6 18",
  bell: "M18 8a6 6 0 00-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  calendar: "M4 5h16v16H4zM8 3v4M16 3v4M4 10h16",
  alert: "M12 3L2.5 20h19zM12 9v5M12 17.5v.1",
  handshake: "M3 11l4-4 4 2 3-2 7 4-4 6-4-2-4 2-5-4zM7 7l3-3 4 1 3-1 4 4",
  trend: "M3 17l6-6 4 3 8-9M15 5h6v6",
  clock: "M12 22a10 10 0 110-20 10 10 0 010 20M12 6v6l4 2",
  lightning: "M13 2L4 14h7l-1 8 10-13h-7z",
  filePlus: "M14 2H6v20h12V8zM14 2v6h6M12 12v6M9 15h6",
  search: "M10.5 3a7.5 7.5 0 105.3 12.8L21 21M16 16l5 5",
  chart: "M4 20V11M10 20V5M16 20v-8M22 20V2M2 20h22",
  receipt: "M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h3",
  check: "M20 6L9 17l-5-5",
  shield: "M12 3l8 4v5c0 5-4 9-8 10C4 21 2 17 2 12V7z",
  filter: "M3 6h18M6 12h12M9 18h6",
  sun: "M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4M16 12a4 4 0 11-8 0 4 4 0 018 0",
  moon: "M20 15.5A8.5 8.5 0 118.5 4a7 7 0 0011.5 11.5"
};
const icon = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[n] || ""}"/></svg>`;

let timer;
function toast(t) { $("toast").textContent = t; $("toast").hidden = false; clearTimeout(timer); timer = setTimeout(() => $("toast").hidden = true, 3000); }

function errorText(e) {
  if (e.code === "permission-denied") return "العملية غير مسموحة. تأكد من صلاحياتك وضبط ساعة الجهاز، ثم حدّث الصفحة وحاول مرة أخرى.";
  if (e.code === "unavailable") return "لا يوجد اتصال بالإنترنت. حاول مرة أخرى.";
  if (e.code === "auth/email-already-in-use") return "البريد الإلكتروني أو اسم المستخدم مسجل بالفعل.";
  if (e.code === "auth/invalid-email") return "صيغة البريد الإلكتروني غير صحيحة.";
  if (e.code === "auth/weak-password") return "كلمة السر ضعيفة جدًا (6 أحرف على الأقل).";
  return e.userText || "حدث خطأ: " + (e.code || e.message);
}
const fail = text => Object.assign(new Error(text), { userText: text });

/* يمنع الضغط المتكرر أثناء الحفظ */
async function once(job, errId) {
  if (busy) return;
  busy = true;
  const buttons = [...document.querySelectorAll("button.btn")];
  const wasDisabled = buttons.map(b => b.disabled);
  buttons.forEach(b => b.disabled = true);
  try { await job(); }
  catch (e) { console.error(e); const el = $(errId); if (el) el.textContent = errorText(e); else toast(errorText(e)); }
  finally { busy = false; buttons.forEach((b, i) => b.disabled = wasDisabled[i]); }
}

/* ---------------- تسجيل الدخول ---------------- */
$("lform").onsubmit = async ev => {
  ev.preventDefault();
  $("lerr").textContent = ""; $("lbtn").disabled = true;
  const u = $("u").value.trim().toLowerCase();
  try {
    await setPersistence(auth, browserSessionPersistence);
    await signInWithEmailAndPassword(auth, u.includes("@") ? u : `${u}@${USER_DOMAIN}`, $("pw").value);
  } catch (e) {
    console.error(e);
    $("lerr").textContent = e.code === "auth/network-request-failed" ? "لا يوجد اتصال بالإنترنت"
      : e.code === "auth/too-many-requests" ? "محاولات كثيرة، انتظر قليلًا"
      : "اسم المستخدم أو كلمة السر غير صحيحة";
  } finally { $("lbtn").disabled = false; }
};

if (firebaseConfig.apiKey.startsWith("PUT_")) {
  $("lerr").textContent = "أضف بيانات مشروع Firebase في الملف js/firebase-config.js";
  $("lbtn").disabled = true;
}

onAuthStateChanged(auth, async user => {
  stopAll();
  if (!user) return showLogin();
  me = null; requests = []; beneficiaries = []; userProfiles = []; files = []; editing = null; openNo = null;
  $("app").hidden = true; closeM();
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    const p = snap.data();
    if (!p || p.active !== true || !ROLES[p.role]) {
      await signOut(auth);
      $("lerr").textContent = "هذا الحساب غير مفعل. راجع مسؤول النظام.";
      return;
    }
    me = { uid: user.uid, name: p.name, role: p.role };
    startApp();
  } catch (e) { console.error(e); await signOut(auth); $("lerr").textContent = errorText(e); }
});

function startApp() {
  $("lform").reset(); $("lerr").textContent = ""; $("login").hidden = true; $("app").hidden = false;
  $("uname").textContent = me.name; $("av").textContent = me.name.trim()[0] || "؟"; $("out_btn").innerHTML = icon("out");
  $("user_role").textContent = ROLES[me.role];
  updateDateAndTime();
  page = "home"; render();

  const uid = me.uid, role = me.role;
  stops.push(onSnapshot(doc(db, "users", uid), snap => {
    if (!me || me.uid !== uid) return;
    const profile = snap.data();
    if (!snap.exists() || profile.active !== true || profile.role !== role || !ROLES[profile.role]) {
      loginNotice = "تم إيقاف الحساب أو تغيير دوره. سجّل الدخول مجددًا بعد مراجعة مسؤول النظام.";
      signOut(auth).catch(e => { console.error(e); toast(errorText(e)); });
      return;
    }
    if (profile.name !== me.name) {
      me = { ...me, name: profile.name };
      $("uname").textContent = profile.name;
      $("av").textContent = profile.name.trim()[0] || "؟";
      if (openNo) view(openNo);
    }
  }, e => toast(errorText(e))));

  const base = collection(db, "requests");
  const sources = new Map();
  const applyDocs = (snap, sourceKey) => {
    sources.set(sourceKey, snap.docs);
    const merged = new Map();
    for (const docs of sources.values()) {
      docs.forEach(d => {
        const x = d.data({ serverTimestamps: "estimate" });
        merged.set(d.id, { ...x, no: d.id, date: x.createdAt.toMillis() });
      });
    }
    requests = [...merged.values()].sort((a, b) => b.date - a.date);
    refresh();
  };
  if (me.role === "fin") {
    stops.push(onSnapshot(query(base, where("finVisible", "==", true)), s => applyDocs(s, "fin"), e => toast(errorText(e))));
  } else if (me.role === "acc") {
    stops.push(onSnapshot(query(base, where("status", "!=", "draft")), s => applyDocs(s, "acc"), e => toast(errorText(e))));
  } else if (me.role === "emp") {
    stops.push(onSnapshot(query(base, where("status", "!=", "draft")), s => applyDocs(s, "pub"), e => toast(errorText(e))));
    stops.push(onSnapshot(query(base, where("createdBy", "==", uid)), s => applyDocs(s, "own"), e => toast(errorText(e))));
  } else {
    stops.push(onSnapshot(base, s => applyDocs(s, "all"), e => toast(errorText(e))));
  }

  if (me.role !== "fin") {
    stops.push(onSnapshot(collection(db, "beneficiaries"), snap => {
      beneficiaries = snap.docs.map(d => d.data()).sort((a, b) => a.name.localeCompare(b.name, "ar"));
      if (page === "benef") render();
    }, e => toast(errorText(e))));
  }
  if (me.role === "admin") {
    stops.push(onSnapshot(collection(db, "users"), snap => {
      userProfiles = snap.docs.map(d => ({ ...d.data(), uid: d.id })).sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
      if (page === "users") render();
    }, e => toast(errorText(e))));
  }
}

function stopAll() { stops.forEach(s => s()); stops = []; }
function showLogin() {
  me = null; requests = []; beneficiaries = []; userProfiles = []; files = []; editing = null; busy = false;
  closeM(); $("toast").hidden = true; $("main").innerHTML = ""; $("sheet").innerHTML = "";
  if (loginNotice) { $("lerr").textContent = loginNotice; loginNotice = ""; }
  $("app").hidden = true; $("login").hidden = false; scrollTo(0, 0);
}
$("out_btn").onclick = () => signOut(auth);

/* تحديث لحظي بدون مسح ما يكتبه المستخدم */
function refresh() {
  renderNav();
  if (["home", "inbox", "pending", "action", "ready", "rejected", "completed", "today", "benef"].includes(page)) render();
  if (page === "report") run();
  if (openNo) {
    const r = requests.find(x => x.no === openNo);
    if (!r) closeM();
    else if ($("sheet").dataset.status !== r.status) view(openNo);
  }
}

/* ---------------- الحالات ---------------- */
function viewSt(s) {
  if (me.role !== "emp" && (s === "p1" || s === "p2")) return me.role === "acc" && s === "p2" ? ["mine", "تمت موافقتك"] : ["review", "قيد المراجعة"];
  return [s, ST[s]];
}
const label = r => viewSt(r.status)[1];
const badge = r => { const [c, t] = viewSt(r.status); return `<span class="pill ${c}"><i class="dot"></i>${t}</span>`; };
function groups() { const g = {}; Object.keys(ST).filter(s => !((me.role === "fin" || me.role === "acc") && s === "draft") && !(me.role === "fin" && s === "p1")).forEach(s => { const t = viewSt(s)[1]; (g[t] = g[t] || []).push(s); }); return g; }
const mine = r => me.role === "acc" ? r.status === "p1" && r.createdBy !== me.uid
  : me.role === "fin" ? r.status === "p2" && r.createdBy !== me.uid
    : me.role === "admin" ? ["p1", "p2"].includes(r.status) && r.createdBy !== me.uid
      : OPEN.includes(r.status) && r.createdBy === me.uid;
const sum = l => money(l.reduce((a, r) => a + r.amount, 0));

function steps(r) {
  const rejectedAt = (r.rejectedStage === "fin" || r.log.at(-2)?.action === "موافقة أولى") ? 2 : 1;
  const at = { draft: 0, returned: 0, p1: 1, p2: 2, approved: 3, paid: 4, rejected: rejectedAt }[r.status] ?? 0;
  return `<div class="steps">${["الإرسال", "مدير الحسابات", "المدير المالي", "الصرف"].map((n, i) => `<div class="step ${i < at ? "done" : i === at ? "now" : ""}">${n}</div>`).join("")}</div>`;
}

function list(l, track = false, none = "لا توجد طلبات هنا") {
  if (!l.length) return `<div class="empty">${none}</div>`;
  return `<div class="list">${l.map(r => `<button class="item" data-act="view" data-no="${esc(r.no)}"><span class="kind ${r.type === "cheque" ? "cheque" : "cash"}">${icon(r.type === "cheque" ? "cheque" : "cash")}</span><span><b>${esc(r.benef)}</b><small>${typeName(r.type)}، ${day(r.date)}<br><bdi>${esc(r.no)}</bdi></small></span>${badge(r)}<span class="amt">${money(r.amount)}</span>${track ? steps(r) : ""}</button>`).join("")}</div>`;
}

/* ---------------- الملاحة ---------------- */
function renderNav() {
  const emp = me.role === "emp";
  const admin = me.role === "admin";
  const acc = me.role === "acc";
  const fin = me.role === "fin";

  let tabs;
  if (admin) {
    tabs = [
      ["home", "الرئيسية", "home"],
      ["new", "طلب جديد", "new"],
      ["inbox", "الطلبات الجارية", "inbox"],
      ["pending", "الطلبات المعلقة", "pending"],
      ["action", "تحتاج إلى إجراء", "alert"],
      ["ready", "جاهزة للصرف", "ready"],
      ["rejected", "المرفوضة", "x"],
      ["completed", "الطلبات المكتملة", "completed"],
      ["today", "طلبات اليوم", "calendar"],
      ["report", "التقارير", "report"],
      ["benef", "المستفيدون", "benef"],
      ["users", "إدارة المستخدمين", "users"]
    ];
  } else if (emp) {
    tabs = [
      ["home", "الرئيسية", "home"],
      ["new", "طلب جديد", "new"],
      ["inbox", "طلباتي الجارية", "inbox"],
      ["ready", "جاهزة للصرف", "ready"],
      ["rejected", "المرفوضة", "x"],
      ["completed", "الطلبات المكتملة", "completed"],
      ["report", "التقارير", "report"],
      ["benef", "المستفيدون", "benef"]
    ];
  } else {
    // acc, fin
    tabs = [
      ["home", "الرئيسية", "home"],
      ["pending", "الطلبات المعلقة", "pending"],
      ["action", "تحتاج إلى إجراء", "alert"],
      ["rejected", "المرفوضة", "x"],
      ["completed", "الطلبات المكتملة", "completed"],
      ["report", "التقارير", "report"],
      ["benef", "المستفيدون", "benef"]
    ];
  }

  const canReview = requests.filter(r => ["p1", "p2"].includes(r.status) && r.createdBy !== me.uid);
  const myActionCount = requests.filter(r => {
    if (emp) return r.createdBy === me.uid && ["draft", "returned", "rejected", "approved"].includes(r.status);
    if (admin) return mine(r) || r.status === "approved" || (["draft", "returned", "rejected"].includes(r.status) && r.createdBy === me.uid);
    return mine(r);
  }).length;

  const counts = {
    inbox: requests.filter(r => emp ? (OPEN.includes(r.status) && r.createdBy === me.uid) : OPEN.includes(r.status)).length,
    pending: admin ? canReview.length : (acc || fin) ? requests.filter(r => mine(r)).length : requests.filter(r => r.createdBy === me.uid && ["p1", "p2"].includes(r.status)).length,
    action: myActionCount,
    ready: requests.filter(r => r.status === "approved" && (!emp || r.createdBy === me.uid)).length,
    rejected: requests.filter(r => r.status === "rejected" && (!emp || r.createdBy === me.uid)).length,
    completed: requests.filter(r => r.status === "paid" && (!emp || r.createdBy === me.uid)).length,
    today: requests.filter(r => day(r.date) === day(Date.now())).length
  };

  const notifyCount = emp ? myActionCount : (admin ? canReview.length : counts.action);

  $("nav").innerHTML = tabs.map(([k, t, symbol]) =>
    `<button class="nav-link ${page === k ? "on" : ""}" ${page === k ? 'aria-current="page"' : ""} data-act="go" data-page="${k}">${icon(symbol)}<span>${t}</span>${counts[k] ? `<span class="count">${counts[k]}</span>` : ""}</button>`
  ).join("");

  $("notice_btn").dataset.page = emp ? "inbox" : (admin || acc || fin) ? "action" : "pending";
  $("notice_btn").innerHTML = `${icon("bell")}${notifyCount ? `<span class="notice-count">${notifyCount}</span>` : ""}`;
}

function render() {
  renderNav();
  ({
    home,
    new: form,
    inbox,
    pending: pendingPage,
    action: actionPage,
    ready,
    rejected: rejectedPage,
    completed,
    today,
    report,
    benef,
    users: manageUsers
  })[page]();
  translateDocument();
}
function go(p) { page = p; editing = null; files = []; render(); scrollTo(0, 0); }

/* ---------------- مخططات الداشبورد ---------------- */
function activityChart() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (29 - i));
    return date;
  });
  const counts = dates.map(d => requests.filter(r => day(r.date) === day(d)).length);
  const max = Math.max(5, Math.ceil(Math.max(...counts) / 5) * 5);
  const points = counts.map((v, i) => ({ x: 42 + i * 522 / 29, y: 112 - (v / max) * 82, value: v }));
  const line = points.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ");
  const area = `${line} L${points[points.length - 1].x} 116 L${points[0].x} 116 Z`;
  const tickIndexes = [0, 5, 10, 14, 19, 24, 29];
  const labels = dates.map(d => new Intl.DateTimeFormat("ar-EG", { weekday: "short" }).format(d));
  return `<svg class="activity-chart" viewBox="0 0 610 158" role="img" aria-label="عدد الطلبات خلال آخر 30 يومًا">
    <defs><linearGradient id="activity-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f4b43e" stop-opacity=".42"/><stop offset="1" stop-color="#f4b43e" stop-opacity=".04"/></linearGradient></defs>
    ${[30, 59, 88, 117].map(y => `<line x1="42" y1="${y}" x2="564" y2="${y}" class="chart-grid"/>`).join("")}
    ${[0, Math.ceil(max / 2), max].map((n, i) => `<text x="31" y="${121 - i * 43}" class="chart-axis" text-anchor="end">${n}</text>`).join("")}
    <path d="${area}" fill="url(#activity-fill)"/><path d="${line}" class="chart-line"/>
    ${points.map((p, i) => tickIndexes.includes(i) ? `<circle cx="${p.x}" cy="${p.y}" r="4.5" class="chart-point"><title>${labels[i]}: ${p.value}</title></circle><text x="${p.x}" y="148" class="chart-day" text-anchor="middle">${labels[i]}</text>` : "").join("")}
  </svg>`;
}

function statusDonut() {
  const rows = [
    { name: "معتمد", states: ["approved", "paid"], color: "#17a47b" },
    { name: "مرفوض", states: ["rejected"], color: "#ed3545" },
    { name: "قيد المراجعة", states: ["p1", "p2"], color: "#1d68c9" },
    { name: "مرجّع للتعديل", states: ["returned"], color: "#f6a21a" }
  ].map(({ name, states, color }) => ({
    name,
    count: requests.filter(r => states.includes(r.status)).length,
    color
  }));
  const total = rows.reduce((n, row) => n + row.count, 0);
  let angle = 0;
  const stops = rows.map(row => {
    const start = angle;
    angle += total ? row.count / total * 360 : 0;
    return `${row.color} ${start}deg ${angle}deg`;
  });
  const donut = total ? `conic-gradient(${stops.join(",")})` : "conic-gradient(#e4e8f0 0deg 360deg)";
  return `<div class="status-content">
    <div class="donut" style="--donut:${donut}"><div class="donut-center"><strong>${total}</strong><span>طلب</span></div></div>
    <div class="status-legend">${rows.map(row => `<div class="legend-row"><i style="--swatch:${row.color}"></i><span>${esc(row.name)}</span><b>${row.count}</b></div>`).join("")}</div>
  </div>`;
}

/* ---------------- لوحة المعلومات ---------------- */
function home() {
  const emp = me.role === "emp", admin = me.role === "admin";
  const acc = me.role === "acc", fin = me.role === "fin";
  const myRequests = requests.filter(r => r.createdBy === me.uid);
  const active = (emp ? myRequests : requests).filter(r => OPEN.includes(r.status));
  const todayCount = (emp ? myRequests : requests).filter(r => day(r.date) === day(Date.now())).length;

  // طلبات تحتاج إجراء حسب الدور
  const actionRequests = requests.filter(r => emp
    ? r.createdBy === me.uid && ["draft", "returned", "rejected", "approved"].includes(r.status)
    : admin ? mine(r) || r.status === "approved" || (["draft", "returned", "rejected"].includes(r.status) && r.createdBy === me.uid) : mine(r));

  // طلبات معلقة حسب الدور
  const pendingRequests = requests.filter(r => emp
    ? r.createdBy === me.uid && ["p1", "p2"].includes(r.status)
    : mine(r));

  // بطاقات الملخص - كل بطاقة تنقل للصفحة المناسبة عند الضغط
  const readyCount = requests.filter(r => r.status === "approved" && (!emp || r.createdBy === me.uid)).length;
  const rejectedCount = requests.filter(r => r.status === "rejected" && (!emp || r.createdBy === me.uid)).length;
  const paidCount = requests.filter(r => r.status === "paid" && (!emp || r.createdBy === me.uid)).length;

  let metrics;
  if (emp) {
    metrics = [
      ["inbox", "طلباتي الجارية", sum(active) + " ج.م", `${active.length} طلب (تشمل المسودات)`, "cash", "metric-white"],
      ["ready", "جاهزة للصرف", readyCount, "طلباتك المعتمدة بانتظار الصرف", "ready", "metric-red"],
      ["rejected", "الطلبات المرفوضة", rejectedCount, "طلبات مرفوضة مع الأسباب", "x", "metric-gold"],
      ["completed", "الطلبات المكتملة", paidCount, "طلباتك المنصرفة حسب الشهر", "completed", "metric-blue"]
    ];
  } else if (acc) {
    metrics = [
      ["action", "معلقة لدى مدير الحسابات", actionRequests.length, "طلبات بانتظار موافقتك", "alert", "metric-red"],
      ["pending", "إجمالي الطلبات الجارية", sum(active) + " ج.م", `${active.length} طلب نشط`, "cash", "metric-white"],
      ["rejected", "الطلبات المرفوضة", rejectedCount, "عرض أسباب الرفض", "x", "metric-gold"],
      ["completed", "الطلبات المكتملة", paidCount, "منظمة حسب الشهر والسنة", "completed", "metric-blue"]
    ];
  } else if (fin) {
    metrics = [
      ["action", "معلقة لدى المدير المالي", actionRequests.length, "طلبات معتمدة محاسبيًا", "alert", "metric-red"],
      ["pending", "إجمالي ما وصلك", sum(requests) + " ج.م", `${requests.length} طلب محال إليك`, "cash", "metric-white"],
      ["rejected", "الطلبات المرفوضة", rejectedCount, "عرض أسباب الرفض", "x", "metric-gold"],
      ["completed", "الطلبات المكتملة", paidCount, "منظمة حسب الشهر والسنة", "completed", "metric-blue"]
    ];
  } else { // admin
    metrics = [
      ["today", "طلبات اليوم", todayCount, "خلال اليوم الحالي", "calendar", "metric-gold"],
      ["inbox", "إجمالي الطلبات الجارية", sum(active) + " ج.م", `${active.length} طلب نشط`, "cash", "metric-white"],
      ["action", "تحتاج إلى إجراء", actionRequests.length, `${pendingRequests.length} بانتظار الاعتماد`, "alert", "metric-red"],
      ["rejected", "الطلبات المرفوضة", rejectedCount, "عرض ومراجعة المرفوضة", "x", "metric-blue"]
    ];
  }

  const metricsHtml = metrics.map(([target, title, value, note, symbol, tone]) =>
    `<button type="button" class="metric-card ${tone}" data-act="go" data-page="${target}">
      <span class="metric-icon">${icon(symbol)}</span>
      <span class="metric-copy">
        <span>${title}</span>
        <strong>${value}</strong>
        <small>${note}</small>
      </span>
      <span class="metric-link">عرض التفاصيل ${icon("trend")}</span>
    </button>`
  ).join("");

  const recent = requests.slice(0, 5);

  let shortcutItems;
  if (admin) {
    shortcutItems = [
      ["new", "طلب جديد", "filePlus"],
      ["pending", "طلبات معلّقة", "pending"],
      ["action", "تحتاج إلى إجراء", "alert"],
      ["ready", "جاهزة للصرف", "ready"],
      ["completed", "الطلبات المكتملة", "completed"],
      ["users", "إدارة المستخدمين", "users"]
    ];
  } else if (emp) {
    shortcutItems = [
      ["new", "طلب جديد", "filePlus"],
      ["inbox", "متابعة الطلبات", "search"],
      ["ready", "جاهزة للصرف", "ready"],
      ["completed", "الطلبات المكتملة", "completed"]
    ];
  } else {
    shortcutItems = [
      ["action", "تحتاج إلى إجراء", "alert"],
      ["pending", "طلبات معلّقة", "pending"],
      ["completed", "الطلبات المكتملة", "completed"],
      ["report", "التقارير", "chart"]
    ];
  }

  const shortcuts = shortcutItems.map(([target, title, symbol]) =>
    `<button class="shortcut" data-act="go" data-page="${target}">${icon(symbol)}<span>${title}</span></button>`
  ).join("");

  // إشعار خاص إذا كان هناك طلبات تحتاج إجراء
  const urgentNotice = actionRequests.length > 0
    ? `<div class="notice-banner" data-act="go" data-page="${emp ? "inbox" : "action"}" role="button" tabindex="0">
        ${icon("alert")} لديك <strong>${actionRequests.length}</strong> ${actionRequests.length === 1 ? "طلب يحتاج" : "طلبات تحتاج"} إلى إجراء منك
        <span class="notice-link">اضغط للعرض</span>
      </div>`
    : "";

  $("main").innerHTML = `<div class="dashboard">
    <section class="dashboard-welcome"><p>مرحباً بك في نظام إدارة المصروفات</p><h1>ريتاك أبو سمبل</h1><span>معاً نحو إدارة مالية أكثر كفاءة</span></section>
    ${urgentNotice}
    <section class="dashboard-metrics" aria-label="ملخص الطلبات">${metricsHtml}</section>
    <section class="dashboard-analytics">
      <article class="dashboard-panel activity-panel"><div class="panel-heading"><h2>حالة الطلبات خلال آخر 30 يومًا</h2>${icon("trend")}</div>${activityChart()}</article>
      <article class="dashboard-panel status-panel"><div class="panel-heading"><h2>إحصائيات سريعة</h2>${icon("chart")}</div>${statusDonut()}</article>
    </section>
    <section class="dashboard-lower">
      <article class="dashboard-panel shortcuts-panel"><div class="panel-heading"><h2>أدوات سريعة</h2>${icon("lightning")}</div><div class="shortcuts">${shortcuts}</div></article>
      <article class="dashboard-panel recent-panel"><div class="panel-heading"><h2>أحدث الطلبات</h2>${icon("clock")}</div>
        <div class="recent-table"><div class="recent-head"><span>رقم الطلب</span><span>التاريخ</span><span>الحالة</span><span>المبلغ</span></div>
          ${recent.length ? recent.map(r => `<button class="recent-row" data-act="view" data-no="${esc(r.no)}"><span class="recent-number"><bdi>${esc(r.no)}</bdi></span><span>${day(r.date)}</span><span>${badge(r)}</span><strong>${money(r.amount)} ج.م</strong></button>`).join("") : `<div class="empty recent-empty">لا توجد طلبات حتى الآن</div>`}
        </div>
      </article>
    </section>
  </div>`;

  // جعل إشعار الإجراء قابلاً للضغط بلوحة المفاتيح
  const noticeBanner = $("main").querySelector(".notice-banner");
  if (noticeBanner) {
    noticeBanner.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") go(emp ? "inbox" : "action"); });
  }
}

/* ---------------- صفحات القوائم ---------------- */
function inbox() {
  const rows = requests.filter(r => me.role === "emp"
    ? (OPEN.includes(r.status) && r.createdBy === me.uid)
    : OPEN.includes(r.status));
  $("main").innerHTML = `<h2 class="title">${me.role === "emp" ? "طلباتي الجارية والمسودات" : "الطلبات الجارية"}</h2>${list(rows, me.role === "emp", "لا توجد طلبات جارية حاليًا")}`;
}

function pendingPage() {
  const isEmp = me.role === "emp";
  const rows = isEmp
    ? requests.filter(r => r.createdBy === me.uid && ["p1", "p2"].includes(r.status))
    : requests.filter(r => mine(r));

  const title = isEmp ? "طلباتي قيد الاعتماد" : "الطلبات المعلّقة - بانتظار إجراء منك";
  $("main").innerHTML = `<h2 class="title">${title}</h2>${list(rows, false, "لا توجد طلبات بانتظار الاعتماد")}`;
}

function actionPage() {
  const emp = me.role === "emp";
  const admin = me.role === "admin";
  const rows = requests.filter(r => emp
    ? r.createdBy === me.uid && ["draft", "returned", "rejected", "approved"].includes(r.status)
    : admin ? mine(r) || r.status === "approved" || (["draft", "returned", "rejected"].includes(r.status) && r.createdBy === me.uid) : mine(r));

  const roleHint = emp
    ? "مسودات غير مرسلة، طلبات مرجعة أو مرفوضة تحتاج تعديل، وطلبات معتمدة تحتاج تأكيد صرف"
    : me.role === "acc"
    ? "طلبات في المرحلة الأولى بانتظار موافقتك - لا يمكنك اعتماد طلباتك الخاصة"
    : me.role === "fin"
    ? "طلبات في المرحلة الثانية بانتظار اعتمادك النهائي"
    : "طلبات تحتاج إلى إجراء منك";

  $("main").innerHTML = `
    <h2 class="title">طلبات تحتاج إلى إجراء</h2>
    <p class="page-hint">${roleHint}</p>
    ${list(rows, emp || admin, "لا توجد طلبات تحتاج إلى إجراء")}`;
}

function ready() {
  const emp = me.role === "emp";

  // الموظف يرى طلباته المعتمدة فقط، الأدمن يرى الكل
  const rows = emp
    ? requests.filter(r => r.status === "approved" && r.createdBy === me.uid)
    : requests.filter(r => r.status === "approved");

  const hint = emp
    ? "طلباتك المعتمدة وجاهزة للصرف - اضغط على الطلب لتأكيد الصرف"
    : "جميع الطلبات المعتمدة وجاهزة للصرف";

  $("main").innerHTML = `
    <h2 class="title">طلبات جاهزة للصرف</h2>
    <p class="page-hint">${hint}</p>
    ${list(rows, false, "لا توجد طلبات جاهزة للصرف")}`;
}

function rejectedPage() {
  const emp = me.role === "emp";
  const rows = emp
    ? requests.filter(r => r.status === "rejected" && r.createdBy === me.uid)
    : requests.filter(r => r.status === "rejected");
  const hint = emp
    ? "الطلبات المرفوضة مع سبب ومرحلة الرفض — يمكنك تعديل طلبك وإعادة تقديمه"
    : "الطلبات المرفوضة مع سبب ومرحلة الرفض";
  $("main").innerHTML = `
    <h2 class="title">الطلبات المرفوضة</h2>
    <p class="page-hint">${hint}</p>
    ${list(rows, emp, "لا توجد طلبات مرفوضة")}`;
}

function today() {
  const rows = requests.filter(r => day(r.date) === day(Date.now()));
  $("main").innerHTML = `<h2 class="title">طلبات اليوم</h2>${list(rows, false, "لا توجد طلبات اليوم")}`;
}

function paidAt(r) {
  if (r.paidAt?.toMillis) return r.paidAt.toMillis();
  const paid = [...(r.log || [])].reverse().find(item => item.action === "تأكيد الصرف");
  return paid?.at?.toMillis?.() || r.date;
}

/* ---------------- صفحة الطلبات المكتملة - بطاقات شهرية ---------------- */
function completed() {
  const emp = me.role === "emp";
  const admin = me.role === "admin";

  // الموظف يرى طلباته المكتملة فقط، بقية الأدوار يرون الكل
  const basePaid = emp
    ? requests.filter(r => r.status === "paid" && r.createdBy === me.uid)
    : requests.filter(r => r.status === "paid");

  if (!basePaid.length) {
    $("main").innerHTML = `<h2 class="title">الطلبات المكتملة</h2><div class="empty">لا توجد طلبات مكتملة بعد</div>`;
    return;
  }

  // تجميع حسب شهر وسنة تاريخ الصرف
  const months = new Map();
  basePaid.forEach(r => {
    const date = new Date(paidAt(r));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(r);
  });

  // إجمالي الكل
  const grandTotal = sum(basePaid);
  const grandCount = basePaid.length;

  // بناء الصفحة
  const summaryCards = [...months.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([key, rows], index) => {
    const [year, month] = key.split("-").map(Number);
    const title = new Intl.DateTimeFormat("ar-EG", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
    const monthSum = sum(rows);
    const cashRows = rows.filter(r => r.type === "cash");
    const chequeRows = rows.filter(r => r.type === "cheque");
    return `<details class="month-group" ${index === 0 ? "open" : ""}>
      <summary>
        <div class="month-summary-info">
          <strong>${title}</strong>
          <div class="month-stats">
            <span class="month-stat cash-stat">${icon("cash")} بيتي كاش: ${cashRows.length} (${sum(cashRows)} ج.م)</span>
            <span class="month-stat cheque-stat">${icon("cheque")} شيكات: ${chequeRows.length} (${sum(chequeRows)} ج.م)</span>
          </div>
        </div>
        <div class="month-summary-total">
          <strong>${monthSum} ج.م</strong>
          <span>${rows.length} طلب</span>
        </div>
      </summary>
      <div class="month-search-bar">
        <input type="text" class="month-filter" placeholder="بحث في هذا الشهر..." data-month="${esc(key)}" aria-label="بحث في طلبات ${title}">
        <div class="month-filter-btns">
          <button class="btn soft month-filter-btn active-filter" data-month="${esc(key)}" data-filter-type="">الكل</button>
          <button class="btn soft month-filter-btn" data-month="${esc(key)}" data-filter-type="cash">بيتي كاش</button>
          <button class="btn soft month-filter-btn" data-month="${esc(key)}" data-filter-type="cheque">شيك</button>
        </div>
      </div>
      <div class="month-list" id="month-${esc(key)}">${list(rows)}</div>
    </details>`;
  }).join("");

  $("main").innerHTML = `
    <h2 class="title">الطلبات المكتملة</h2>
    <div class="completed-summary">
      <div class="completed-total">
        <span>الإجمالي الكلي</span>
        <strong>${grandTotal} ج.م</strong>
        <small>${grandCount} طلب مكتمل</small>
      </div>
    </div>
    ${summaryCards}`;

  // ربط فلاتر البحث داخل كل شهر
  $("main").querySelectorAll(".month-filter").forEach(input => {
    input.addEventListener("input", () => filterMonth(input.dataset.month));
  });
  $("main").querySelectorAll(".month-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const month = btn.dataset.month;
      const type = btn.dataset.filterType;
      const container = btn.closest(".month-group");
      container.querySelectorAll(".month-filter-btn").forEach(b => b.classList.remove("active-filter"));
      btn.classList.add("active-filter");
      filterMonth(month, type);
    });
  });
}

function filterMonth(monthKey, typeFilter) {
  const monthList = document.getElementById(`month-${monthKey}`);
  if (!monthList) return;
  const container = monthList.closest(".month-group");
  if (typeFilter === undefined) {
    typeFilter = container?.querySelector(".month-filter-btn.active-filter")?.dataset.filterType || "";
  }
  const searchInput = $("main").querySelector(`.month-filter[data-month="${monthKey}"]`);
  const q = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const [year, month] = monthKey.split("-").map(Number);
  const emp = me.role === "emp";
  const monthRows = requests.filter(r => {
    if (r.status !== "paid") return false;
    if (emp && r.createdBy !== me.uid) return false;
    const pd = new Date(paidAt(r));
    if (pd.getFullYear() !== year || pd.getMonth() + 1 !== month) return false;
    if (typeFilter && r.type !== typeFilter) return false;
    if (q && !r.benef.toLowerCase().includes(q) && !r.no.toLowerCase().includes(q)) return false;
    return true;
  });
  monthList.innerHTML = list(monthRows, false, "لا توجد نتائج للبحث");
}

/* ---------------- نموذج الطلب ---------------- */
function field(id, lbl, val = "", type = "text") { return `<div><label for="${id}">${lbl}</label><input id="${id}" type="${type}" value="${esc(val)}"></div>`; }
function pick(id, val, btn) { $(id).value = val; [...btn.parentNode.children].forEach(b => b.setAttribute("aria-pressed", b === btn)); if (id === "type") chqToggle(); }

function form() {
  const r = editing || { type: "cash", category: CATEGORIES[0] };
  $("main").innerHTML = `<h2 class="title">${editing ? "تعديل الطلب <bdi>" + esc(r.no) + "</bdi>" : "طلب جديد"}</h2><div class="panel"><div class="grid">
  <div class="full"><input type="hidden" id="type" value="${r.type === "cheque" ? "cheque" : "cash"}"><div class="seg">${["cash", "cheque"].map(k => `<button type="button" aria-pressed="${r.type === k}" ${editing ? "disabled" : ""} data-act="pick" data-field="type" data-val="${k}">${icon(k)}${typeName(k)}</button>`).join("")}</div></div>
  <div class="full money"><label for="amount">المبلغ بالجنيه</label><input id="amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" value="${esc(r.amount)}"></div>
  <div class="combo"><label for="benef">اسم المستفيد</label><input id="benef" autocomplete="off" maxlength="200" value="${esc(r.benef)}"><div class="sugg" id="sugg" hidden></div><div class="hint" id="bhint">لو الاسم جديد هيتحفظ مع الطلب.</div></div>
  ${field("phone", "التليفون", r.phone, "tel")}${field("account", "رقم حساب المستفيد (اختياري)", r.account)}
  <div class="full"><span class="lbl">بند الصرف</span><input type="hidden" id="category" value="${esc(r.category)}"><div class="chips" id="chips">${CATEGORIES.map(c => `<button type="button" aria-pressed="${r.category === c}" data-act="pick" data-field="category" data-val="${esc(c)}">${esc(c)}</button>`).join("")}</div></div>
  <div class="grid full" id="chqbox">${field("bank", "البنك", r.bank)}${field("chq", "رقم الشيك", r.chq)}${field("due", "تاريخ الاستحقاق", r.due, "date")}</div>
  <div class="full"><label for="desc">البيان</label><textarea id="desc" rows="3" maxlength="2000">${esc(r.desc)}</textarea></div>
  <div class="full"><label class="drop">${icon("up")}<b>أرفق الفواتير</b><small>صور أو PDF (حتى 700 كيلوبايت)، 3 مرفقات كحد أقصى</small><input id="file" type="file" accept="image/*,application/pdf" multiple></label><div id="flist"></div></div>
  </div><div class="err" id="err" role="alert"></div><div class="row">${(!editing || editing.status === "draft") ? `<button class="btn soft" data-act="save" data-submit="0">حفظ كمسودة</button><button class="btn" data-act="save" data-submit="1">Submit Request – إرسال الطلب</button>` : `<button class="btn" data-act="save" data-submit="1">تعديل وإعادة إرسال الطلب</button>`}<button class="btn soft" data-act="go" data-page="home">إلغاء</button></div></div>`;
  $("benef").oninput = suggest; $("benef").onfocus = suggest;
  $("file").onchange = e => attach(e.target);
  chqToggle(); showFiles();
}
function chqToggle() { $("chqbox").style.display = $("type").value === "cheque" ? "grid" : "none"; }

function suggest() {
  const q = $("benef").value.trim();
  const m = beneficiaries.map((b, i) => [b, i]).filter(([b]) => b.name.includes(q) && b.name !== q).slice(0, 5);
  $("sugg").innerHTML = m.map(([b, i]) => `<button type="button" data-act="choose" data-i="${i}">${esc(b.name)}<small class="hint"> ${esc(b.phone)}</small></button>`).join("");
  $("sugg").hidden = !m.length;
  const exact = beneficiaries.findIndex(b => b.name === q);
  if (exact >= 0) choose(exact); else $("bhint").textContent = "لو الاسم جديد هيتحفظ مع الطلب.";
}
function choose(i) {
  const b = beneficiaries[i];
  $("benef").value = b.name; $("phone").value = b.phone; $("account").value = b.account;
  const btn = [...$("chips").children].find(x => x.textContent === b.category);
  if (btn) pick("category", b.category, btn);
  $("sugg").hidden = true; $("bhint").textContent = "مستفيد مسجل، تم ملء بياناته.";
}

/* ---------------- المرفقات ---------------- */
const readDataUrl = f => new Promise((res, rej) => { const rd = new FileReader(); rd.onload = () => res(rd.result); rd.onerror = rej; rd.readAsDataURL(f); });

async function attach(input) {
  const target = files;
  $("err").textContent = "";
  for (const f of [...input.files]) {
    if (target.length >= 3) { $("err").textContent = "الحد الأقصى 3 مرفقات"; break; }
    try {
      if (f.type.startsWith("image/")) {
        const img = await createImageBitmap(f), k = Math.min(1, 1400 / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = img.width * k; c.height = img.height * k;
        const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        const data = c.toDataURL("image/jpeg", .7);
        if (data.length > 950000) { $("err").textContent = "الصورة كبيرة جدًا: " + f.name; continue; }
        target.push({ name: f.name, data, img: true });
      } else if (f.type === "application/pdf" && f.size <= 700 * 1024) {
        target.push({ name: f.name, data: await readDataUrl(f), img: false });
      } else $("err").textContent = "ملف غير مقبول أو أكبر من الحد: " + f.name;
    } catch (e) { $("err").textContent = "تعذر قراءة الملف: " + f.name; }
  }
  input.value = ""; showFiles();
}
function showFiles() {
  if ($("flist")) $("flist").innerHTML = files.map((f, i) => `<div class="file"><span>${esc(f.name)}</span><button type="button" data-act="unfile" data-i="${i}" aria-label="حذف المرفق">${icon("x")}</button></div>`).join("");
}
async function loadFiles(no) {
  const snap = await getDocs(collection(db, "requests", no, "files"));
  return snap.docs.sort((a, b) => a.id.localeCompare(b.id)).map(d => d.data());
}

/* ---------------- الحفظ ---------------- */
function save(el) {
  const submit = el?.dataset?.submit !== "0";
  return once(async () => {
    const v = id => $(id).value.trim();
    const type = v("type"), cheque = type === "cheque", amount = Math.round(Number(v("amount")) * 100) / 100;
    if (!v("benef") || !v("desc")) throw fail("اكتب اسم المستفيد والبيان");
    if (!(amount > 0)) throw fail("اكتب مبلغًا أكبر من صفر");
    if (cheque && (!v("bank") || !v("chq") || !v("due"))) throw fail("أكمل بيانات الشيك");
    if (!navigator.onLine) throw fail("لا يوجد اتصال بالإنترنت");

    const attachments = [...files];
    const data = {
      benef: v("benef"), phone: v("phone"), account: v("account"), category: v("category"), amount, desc: v("desc"),
      bank: cheque ? v("bank") : "", chq: cheque ? v("chq") : "", due: cheque ? v("due") : "", fileCount: attachments.length
    };
    const writeFiles = (tx, no) => attachments.forEach((f, i) => tx.set(doc(db, "requests", no, "files", String(i)), { name: f.name, data: f.data, img: f.img }));
    let no;
    let targetStatus = submit ? "p1" : "draft";

    if (editing) {
      no = editing.no;
      const oldCount = editing.fileCount;
      await runTransaction(db, async tx => {
        const ref = doc(db, "requests", no), cur = (await tx.get(ref)).data();
        if (!["draft", "returned", "rejected"].includes(cur.status)) throw fail("تغيرت حالة الطلب");
        if (cur.status !== "draft") targetStatus = "p1";
        const actionName = cur.status === "draft"
          ? (targetStatus === "p1" ? "إرسال الطلب" : "تعديل المسودة")
          : "تعديل وإعادة إرسال";
        tx.update(ref, { ...data, status: targetStatus, finVisible: false, updatedAt: serverTimestamp(), log: [...cur.log, entry(actionName)] });
        writeFiles(tx, no);
        for (let i = attachments.length; i < oldCount; i++) tx.delete(doc(db, "requests", no, "files", String(i)));
      });
    } else {
      const prefix = cheque ? "CHQ" : "PC", year = new Date().getFullYear();
      await runTransaction(db, async tx => {
        const cref = doc(db, "counters", `${prefix}-${year}`), c = await tx.get(cref);
        const n = c.exists() ? c.data().n + 1 : 1;
        no = `${prefix}-ABS-${year}-${String(n).padStart(4, "0")}`;
        tx.set(cref, { n, last: no });
        tx.set(doc(db, "requests", no), {
          ...data, type, status: targetStatus, finVisible: false, createdBy: me.uid, createdName: me.name,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          log: [entry(targetStatus === "draft" ? "حفظ كمسودة" : "إنشاء وإرسال")]
        });
        writeFiles(tx, no);
      });
    }

    // حفظ المستفيد الجديد أو تحديث بياناته - فشلها لا يلغي الطلب
    const id = "b_" + data.benef.replaceAll("/", "-");
    setDoc(doc(db, "beneficiaries", id), { name: data.benef, phone: data.phone, account: data.account, category: data.category })
      .catch(e => console.error(e));

    go("inbox");
    toast(targetStatus === "draft" ? "تم حفظ المسودة: " + no : "تم إرسال الطلب وبانتظار مدير الحسابات: " + no);
  }, "err");
}

/* ---------------- تفاصيل الطلب ---------------- */
async function view(no) {
  const r = requests.find(x => x.no === no);
  if (!r) return closeM();
  const keepNote = openNo === no ? $("note")?.value || "" : "";
  openNo = no; $("sheet").dataset.status = r.status;
  const owner = r.createdBy === me.uid;

  const canReview = !owner && (
    (me.role === "acc" && r.status === "p1")
    || (me.role === "fin" && r.status === "p2")
    || (me.role === "admin" && ["p1", "p2"].includes(r.status))
  );

  let act = "";
  if (canReview) {
    const stageInfo = r.status === "p1"
      ? "موافقتك ستحيل الطلب للمدير المالي"
      : "موافقتك النهائية ستجعل الطلب جاهزاً للصرف";
    act = `<div class="review-stage-info">${icon("shield")} ${stageInfo}</div>
      <input id="note" aria-label="ملاحظة" placeholder="ملاحظة (مطلوبة للرفض أو الإرجاع)">
      <div class="row">
        <button class="btn ok" style="flex-basis:100%" data-act="decide" data-what="ok">موافقة ${r.status === "p1" ? "وإحالة للمدير المالي" : "نهائية"}</button>
        <button class="btn warn" data-act="decide" data-what="back">إرجاع للتعديل</button>
        <button class="btn no" data-act="decide" data-what="no">رفض</button>
      </div>`;
  }

  if (((me.role === "emp" && owner) || me.role === "admin") && r.status === "approved") {
    act += `<input id="pay_ref" class="pay-ref-input" maxlength="100" aria-label="مرجع عملية الصرف" placeholder="رقم أو مرجع عملية الصرف (اختياري)"><div class="row"><button class="btn ok" data-act="pay">تأكيد الصرف</button></div>`;
  }
  if ((me.role === "emp" || me.role === "admin") && owner && r.status === "draft") {
    act += `<div class="row"><button class="btn ok" data-act="submitDraft">Submit Request – إرسال الطلب</button><button class="btn soft" data-act="edit">تعديل المسودة</button></div>`;
  }
  if ((me.role === "emp" || me.role === "admin") && owner && ["returned", "rejected"].includes(r.status)) {
    act += `<div class="row"><button class="btn" data-act="edit">تعديل وإعادة إرسال</button></div>`;
  }
  if (["approved", "paid"].includes(r.status)) {
    act += `<div class="row"><button class="btn soft" data-act="print">طباعة إذن الصرف</button></div>`;
  }

  const paidNote = r.status === "paid" ? [
    ["تاريخ الصرف", r.paidAt?.toMillis ? when(r.paidAt.toMillis()) : when(paidAt(r))],
    ["منفذ الصرف", r.paidByName || [...(r.log || [])].reverse().find(l => l.action === "تأكيد الصرف")?.name || ""],
    ["مرجع الصرف", r.paymentRef || ""]
  ] : [];

  const rows = [
    ["النوع", typeName(r.type)],
    ["المستفيد", r.benef],
    ["التليفون", r.phone],
    ["الحساب", r.account],
    ["البند", r.category],
    ["البيان", r.desc],
    ["أنشأه", r.createdName],
    ...(r.type === "cheque" ? [["البنك", r.bank], ["رقم الشيك", r.chq], ["الاستحقاق", r.due]] : []),
    ...paidNote
  ];

  const rejEntry = r.status === "rejected" ? [...(r.log || [])].reverse().find(l => l.action === "رفض") : null;
  const rejStageLabel = r.rejectedStage === "fin" ? "المدير المالي" : r.rejectedStage === "acc" ? "مدير الحسابات" : (r.log.at(-2)?.action === "موافقة أولى" ? "المدير المالي" : "مدير الحسابات");
  const rejectHtml = r.status === "rejected"
    ? `<div class="reject-box"><b>تم الرفض في مرحلة: ${rejStageLabel}</b><span>السبب: ${esc(r.rejectedReason || rejEntry?.note || "غير محدد")}</span></div>`
    : "";

  const logHtml = r.log.map(l => `<div class="log">
    <b>${esc(l.action)}</b>، ${esc(l.name)}
    <div class="hint">${when(l.at.toMillis())} ${l.note ? "<br>" + esc(l.note) : ""}</div>
  </div>`).join("");

  $("sheet").innerHTML = `<div class="body">
    <div class="shead"><b><bdi>${esc(r.no)}</bdi></b><button class="icon noprint" data-act="close" aria-label="إغلاق">${icon("x")}</button></div>
    <div class="total">${badge(r)}<strong>${money(r.amount)}</strong>جنيه مصري</div>
    ${steps(r)}
    ${rejectHtml}
    <dl>${rows.filter(x => x[1]).map(x => `<dt>${x[0]}</dt><dd>${esc(x[1])}</dd>`).join("")}</dl>
    <div id="vfiles">${r.fileCount ? '<div class="hint">جاري تحميل المرفقات...</div>' : ""}</div>
    <h2>سجل الحركة</h2>${logHtml}
  </div>
  ${act ? `<div class="acts"><div class="err" id="merr" role="alert"></div>${act}</div>` : ""}`;

  if (keepNote && $("note")) $("note").value = keepNote;
  $("modal").classList.add("show");

  if (!r.fileCount) return;
  try {
    const fl = await loadFiles(no);
    if (openNo !== no) return;
    $("vfiles").innerHTML = fl.filter(f => safeData(f.data)).map(f =>
      `<div class="file"><span>${esc(f.name)}</span><a href="${f.data}" download="${esc(f.name)}">تنزيل</a></div>${f.img ? `<img class="thumb" src="${f.data}" alt="مرفق">` : ""}`
    ).join("");
  } catch (e) { if (openNo === no) $("vfiles").innerHTML = `<div class="err">تعذر تحميل المرفقات</div>`; }
}

function closeM() { openNo = null; $("modal").classList.remove("show"); }

/* تغيير حالة الطلب داخل معاملة */
async function move(no, from, changes, action, note) {
  if (!navigator.onLine) throw fail("لا يوجد اتصال بالإنترنت");
  await runTransaction(db, async tx => {
    const ref = doc(db, "requests", no), cur = (await tx.get(ref)).data();
    if (cur.status !== from) throw fail("تغيرت حالة الطلب");
    tx.update(ref, { ...changes, updatedAt: serverTimestamp(), log: [...cur.log, entry(action, note)] });
  });
}

function decide(what) {
  const no = openNo, note = $("note")?.value.trim() || "";
  return once(async () => {
    const request = requests.find(r => r.no === no);
    const from = request?.status;
    if (!request || !["p1", "p2"].includes(from)) throw fail("لم تعد هذه المرحلة بانتظار الاعتماد");
    if (request.createdBy === me.uid) throw fail("لا يمكنك اعتماد طلب أنشأته بنفسك");
    if (me.role !== "admin" && !((me.role === "acc" && from === "p1") || (me.role === "fin" && from === "p2")))
      throw fail("لا تملك صلاحية اعتماد هذه المرحلة");
    if (what !== "ok" && !note) throw fail("اكتب السبب أولًا");
    const first = from === "p1";
    const status = what === "back" ? "returned" : what === "no" ? "rejected" : first ? "p2" : "approved";
    const action = what === "back" ? "إرجاع للتعديل" : what === "no" ? "رفض" : first ? "موافقة أولى" : "اعتماد نهائي";
    const finVisible = first ? what === "ok" : true;
    const changes = what === "no"
      ? { status, finVisible, rejectedStage: first ? "acc" : "fin", rejectedReason: note }
      : { status, finVisible };
    await move(no, from, changes, action, note);
    toast(what === "ok" ? (first ? "تمت الموافقة، الطلب محال للمدير المالي" : "تم الاعتماد النهائي، الطلب جاهز للصرف") : what === "back" ? "تم الإرجاع للتعديل" : "تم الرفض وتسجيل السبب");
  }, "merr");
}

function submitDraft() {
  const no = openNo;
  return once(async () => {
    await move(no, "draft", { status: "p1", finVisible: false }, "إرسال الطلب", "");
    toast("تم إرسال الطلب وبانتظار مدير الحسابات");
  }, "merr");
}

function pay() {
  const no = openNo;
  const paymentRef = $("pay_ref")?.value.trim() || "";
  return once(async () => {
    const note = paymentRef ? `مرجع الصرف: ${paymentRef}` : "";
    await move(no, "approved", {
      status: "paid",
      finVisible: true,
      paidAt: serverTimestamp(),
      paidByUid: me.uid,
      paidByName: me.name,
      paymentRef
    }, "تأكيد الصرف", note);
    toast("تم تأكيد الصرف بنجاح");
  }, "merr");
}

function edit() {
  const no = openNo;
  return once(async () => {
    const r = requests.find(x => x.no === no);
    const old = r.fileCount ? await loadFiles(no) : [];
    closeM(); page = "new"; editing = r; files = old; render(); scrollTo(0, 0);
  }, "merr");
}

/* ---------------- إدارة المستخدمين ---------------- */
const roleOptions = selected => Object.entries(ROLES)
  .map(([value, name]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${name}</option>`).join("");

const realEmail = email => typeof email === "string" && email.includes("@")
  && !email.toLowerCase().endsWith("@" + USER_DOMAIN.toLowerCase());

function manageUsers() {
  if (me.role !== "admin") {
    $("main").innerHTML = `<h2 class="title">غير مصرح</h2><p class="page-hint">هذه الصفحة للمسؤول فقط</p>`;
    return;
  }

  // إحصائيات سريعة
  const totalUsers = userProfiles.length;
  const activeUsers = userProfiles.filter(u => u.active).length;
  const roleStats = Object.keys(ROLES).map(r => ({ role: r, count: userProfiles.filter(u => u.role === r).length }));

  const statsHtml = `<div class="user-stats">
    <div class="user-stat-item"><strong>${totalUsers}</strong><span>إجمالي المستخدمين</span></div>
    <div class="user-stat-item"><strong>${activeUsers}</strong><span>مفعّلون</span></div>
    <div class="user-stat-item"><strong>${totalUsers - activeUsers}</strong><span>موقوفون</span></div>
    ${roleStats.map(s => `<div class="user-stat-item"><strong>${s.count}</strong><span>${ROLES[s.role]}</span></div>`).join("")}
  </div>`;

  const rows = userProfiles.map(profile => {
    const self = profile.uid === me.uid;
    const email = profile.email || "";
    return `<article class="managed-user ${profile.active ? "" : "user-inactive"}">
      <div class="user-header">
        <div class="user-avatar">${(profile.name || "؟")[0]}</div>
        <div class="user-identity">
          <strong>${esc(profile.name || "")}</strong>
          <small><bdi>${esc(email)}</bdi></small>
        </div>
        <span class="pill ${profile.active ? "approved" : "rejected"}">${profile.active ? "مفعّل" : "موقوف"}</span>
      </div>
      <div class="user-fields">
        <div><label for="profile-name-${esc(profile.uid)}">الاسم</label><input id="profile-name-${esc(profile.uid)}" value="${esc(profile.name || "")}" maxlength="100"></div>
        <div><label for="profile-email-${esc(profile.uid)}">البريد / اسم المستخدم</label><input id="profile-email-${esc(profile.uid)}" value="${esc(email)}" readonly></div>
        <div><label for="profile-role-${esc(profile.uid)}">الدور</label><select id="profile-role-${esc(profile.uid)}" ${self ? "disabled" : ""}>${roleOptions(profile.role)}</select></div>
      </div>
      <div class="user-actions">
        <button class="btn" data-act="saveUser" data-uid="${esc(profile.uid)}">${icon("check")} حفظ التعديلات</button>
        <button class="btn ${profile.active ? "warn" : "ok"}" data-act="toggleUser" data-uid="${esc(profile.uid)}" ${self ? "disabled" : ""}>${profile.active ? "إيقاف المستخدم" : "تفعيل المستخدم"}</button>
        ${realEmail(email)
          ? `<button class="btn soft" data-act="resetUserPassword" data-uid="${esc(profile.uid)}">إرسال رابط تغيير كلمة السر</button>`
          : `<span class="hint">لا يتوفر بريد إلكتروني حقيقي لإرسال رابط التغيير</span>`}
        ${self ? `<span class="hint self-hint">أنت هذا المستخدم - لا يمكنك تعديل دورك أو إيقاف نفسك</span>` : ""}
      </div>
    </article>`;
  }).join("");

  $("main").innerHTML = `<h2 class="title">إدارة المستخدمين</h2>
    ${statsHtml}
    <section class="panel user-create">
      <h3>إنشاء مستخدم جديد</h3>
      <div class="grid user-create-grid">
        <div><label for="new_user_name">الاسم الكامل</label><input id="new_user_name" maxlength="100" autocomplete="name" required placeholder="مثال: محمد أحمد"></div>
        <div><label for="new_user_login">البريد الإلكتروني أو اسم المستخدم</label><input id="new_user_login" autocomplete="username" required placeholder="مثال: m.ahmed أو m.ahmed@example.com"></div>
        <div><label for="new_user_password">كلمة السر (6 أحرف على الأقل)</label><input id="new_user_password" type="password" minlength="6" autocomplete="new-password" required></div>
        <div><label for="new_user_role">الدور</label><select id="new_user_role">${roleOptions("emp")}</select></div>
      </div>
      <div class="err" id="user_create_err" role="alert"></div>
      <button class="btn" data-act="createUser">${icon("new")} إنشاء الحساب</button>
    </section>
    <h2>المستخدمون الحاليون (${userProfiles.length})</h2>
    <div class="managed-users">${rows || '<div class="empty">لا يوجد مستخدمون</div>'}</div>`;
}

function createManagedUser() {
  return once(async () => {
    const name = $("new_user_name").value.trim();
    const login = $("new_user_login").value.trim().toLowerCase();
    const password = $("new_user_password").value;
    const role = $("new_user_role").value;
    if (!name || name.length > 100) throw fail("اكتب اسمًا صالحًا لا يتجاوز 100 حرف");
    if (!login || (login.includes("@") ? !/^[^@\s]+@[^@\s]+$/.test(login) : /\s/.test(login)))
      throw fail("اكتب بريدًا إلكترونيًا صالحًا أو اسم مستخدم بدون مسافات");
    if (password.length < 6) throw fail("كلمة السر يجب ألا تقل عن 6 أحرف");
    if (!Object.prototype.hasOwnProperty.call(ROLES, role)) throw fail("اختر دورًا صالحًا");

    const email = login.includes("@") ? login : `${login}@${USER_DOMAIN}`;
    const appName = `user-create-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let secondaryApp, secondaryAuth, createdUser, operationError, cleanupError;
    try {
      secondaryApp = initializeApp(firebaseConfig, appName);
      secondaryAuth = getAuth(secondaryApp);
      if (USE_EMULATORS) connectAuthEmulator(secondaryAuth, "http://127.0.0.1:9099", { disableWarnings: true });
      await setPersistence(secondaryAuth, inMemoryPersistence);
      createdUser = (await createUserWithEmailAndPassword(secondaryAuth, email, password)).user;
      try {
        await setDoc(doc(db, "users", createdUser.uid), { name, role, active: true, email });
      } catch (e) {
        try {
          await deleteUser(createdUser);
          createdUser = null;
        } catch (rollbackError) {
          console.error("Failed to roll back the newly created Auth account", rollbackError);
          throw fail("فشل حفظ ملف المستخدم وتعذر حذف حساب المصادقة الجديد. راجع Firebase Console.");
        }
        throw e;
      }
    } catch (e) {
      operationError = e;
    } finally {
      if (secondaryAuth?.currentUser) {
        try { await signOut(secondaryAuth); }
        catch (e) { console.error("Failed to sign out the secondary Firebase app", e); cleanupError = e; }
      }
      if (secondaryApp) {
        try { await deleteApp(secondaryApp); }
        catch (e) { console.error("Failed to delete the secondary Firebase app", e); cleanupError = cleanupError || e; }
      }
    }
    if (operationError) throw operationError;
    if (cleanupError) throw fail("تم إنشاء المستخدم، لكن تعذر إغلاق التطبيق الثانوي بالكامل.");
    $("new_user_name").value = "";
    $("new_user_login").value = "";
    $("new_user_password").value = "";
    $("new_user_role").value = "emp";
    toast("تم إنشاء المستخدم بنجاح: " + name);
  }, "user_create_err");
}

function activeAdminCount() {
  return userProfiles.filter(u => u.role === "admin" && u.active === true).length;
}

function saveUser(el) {
  return once(async () => {
    const profile = userProfiles.find(u => u.uid === el.dataset.uid);
    if (!profile) throw fail("المستخدم غير موجود");
    const name = $("profile-name-" + profile.uid).value.trim();
    const role = $("profile-role-" + profile.uid).value;
    if (!name || name.length > 100) throw fail("اكتب اسمًا صالحًا لا يتجاوز 100 حرف");
    if (!Object.prototype.hasOwnProperty.call(ROLES, role)) throw fail("اختر دورًا صالحًا");
    if (profile.uid === me.uid && role !== profile.role) throw fail("لا يمكنك تغيير دورك");
    if (profile.role === "admin" && profile.active && role !== "admin" && activeAdminCount() <= 1) {
      throw fail("لا يمكن تغيير دور آخر مسؤول نظام نشط");
    }
    await updateDoc(doc(db, "users", profile.uid), { name, role });
    toast("تم تحديث بيانات المستخدم: " + name);
  });
}

function toggleUser(el) {
  return once(async () => {
    const profile = userProfiles.find(u => u.uid === el.dataset.uid);
    if (!profile) throw fail("المستخدم غير موجود");
    if (profile.uid === me.uid) throw fail("لا يمكنك إيقاف حسابك");
    if (profile.role === "admin" && profile.active && activeAdminCount() <= 1) {
      throw fail("لا يمكن إيقاف آخر مسؤول نظام نشط");
    }
    await updateDoc(doc(db, "users", profile.uid), { active: !profile.active });
    toast(profile.active ? "تم إيقاف المستخدم: " + profile.name : "تم تفعيل المستخدم: " + profile.name);
  });
}

function resetUserPassword(el) {
  return once(async () => {
    const profile = userProfiles.find(u => u.uid === el.dataset.uid);
    if (!profile || !realEmail(profile.email)) throw fail("إرسال الرابط متاح للبريد الإلكتروني الحقيقي فقط");
    await sendPasswordResetEmail(auth, profile.email);
    toast("تم إرسال رابط تغيير كلمة السر إلى البريد: " + profile.email);
  });
}

/* ---------------- التقارير ---------------- */
function report() {
  $("main").innerHTML = `<h2 class="title">تقرير العمليات</h2><div class="panel"><div class="grid">${field("from", "من تاريخ", day(ago(30)), "date")}${field("to", "إلى تاريخ", day(Date.now()), "date")}
  <div><label for="ftype">النوع</label><select id="ftype"><option value="">الكل</option><option value="cash">بيتي كاش</option><option value="cheque">شيك</option></select></div>
  <div><label for="fst">الحالة</label><select id="fst"><option value="">الكل</option>${Object.entries(groups()).map(([t, ss]) => `<option value="${ss.join(",")}">${t}</option>`).join("")}</select></div>
  ${field("fq", "بحث بالمستفيد")}</div></div><div id="out"></div>`;
  ["from", "to", "ftype", "fst", "fq"].forEach(i => $(i).oninput = run); run();
}

function filtered() {
  const f = $("from").value, t = $("to").value, ty = $("ftype").value, s = $("fst").value, q = $("fq").value.trim();
  return requests.filter(r => {
    const d = day(r.date);
    return (!f || d >= f) && (!t || d <= t) && (!ty || r.type === ty) && (!s || s.split(",").includes(r.status)) && (!q || r.benef.includes(q));
  });
}

function run() {
  const l = filtered();
  const cashTotal = sum(l.filter(r => r.type === "cash"));
  const chequeTotal = sum(l.filter(r => r.type === "cheque"));
  $("out").innerHTML = `<section class="focus" style="margin:12px 0">
    <div>
      <p>إجمالي الفترة، عدد العمليات: ${l.length}</p>
      <div class="big">${sum(l)}<small>ج.م</small></div>
      <div class="report-breakdown">
        <span>${icon("cash")} بيتي كاش: ${cashTotal} ج.م</span>
        <span>${icon("cheque")} شيكات: ${chequeTotal} ج.م</span>
      </div>
    </div>
    <button class="btn sun" data-act="csv">تصدير Excel (CSV)</button>
  </section>${list(l, false, "لا توجد عمليات بهذه الفلاتر. وسّع الفترة أو غيّر الحالة.")}`;
}

function csv() {
  const cell = v => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const rows = [["الرقم", "التاريخ", "النوع", "المستفيد", "البند", "المبلغ", "البيان", "الحالة", "أنشأه"],
    ...filtered().map(r => [r.no, day(r.date), typeName(r.type), r.benef, r.category, r.amount, r.desc, label(r), r.createdName])];
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF" + rows.map(x => x.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  a.download = `report_${$("from").value}_${$("to").value}.csv`; a.click(); URL.revokeObjectURL(a.href);
}

/* ---------------- المستفيدين ---------------- */
function benef() {
  // المدير المالي يرى فقط مستفيدي الطلبات التي وصلته
  const l = me.role === "fin"
    ? [...new Map(requests.map(r => [r.benef, { name: r.benef, phone: r.phone, account: r.account, category: r.category }])).values()]
    : beneficiaries;
  $("main").innerHTML = `<h2 class="title">المستفيدين</h2><div class="list">${l.map(b => `<div class="item"><span class="av">${esc(b.name[0])}</span><span><b>${esc(b.name)}</b><small>${esc(b.phone)} ${esc(b.account)}</small></span><span class="pill paid">${esc(b.category)}</span></div>`).join("") || '<div class="empty">لا يوجد مستفيدين بعد</div>'}</div>`;
}

/* ---------------- الأحداث ---------------- */
const actions = {
  go: el => go(el.dataset.page),
  view: el => view(el.dataset.no),
  pick: el => pick(el.dataset.field, el.dataset.val, el),
  choose: el => choose(+el.dataset.i),
  unfile: el => { files.splice(+el.dataset.i, 1); showFiles(); },
  decide: el => decide(el.dataset.what),
  save: el => save(el), submitDraft, pay, edit, csv,
  createUser: createManagedUser,
  saveUser, toggleUser, resetUserPassword,
  close: closeM,
  print: () => window.print()
};

document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (el && me && !el.disabled) actions[el.dataset.act]?.(el);
  if (e.target === $("modal")) closeM();
  if ($("sugg") && !e.target.closest(".combo")) $("sugg").hidden = true;
});

document.addEventListener("keydown", e => { if (e.key === "Escape") closeM(); });

if ($("sidebar_toggle")) {
  $("sidebar_toggle").addEventListener("click", () => {
    document.querySelector(".app-shell")?.classList.toggle("sidebar-open");
  });
}

["theme_btn", "login_theme_btn"].forEach(id => {
  $(id).addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    applyTheme();
  });
});
["lang_btn", "login_lang_btn"].forEach(id => {
  $(id).addEventListener("click", () => {
    lang = lang === "ar" ? "en" : "ar";
    applyLanguage();
  });
});
applyTheme();
applyLanguage();
setInterval(updateDateAndTime, 1000);
