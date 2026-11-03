/* PlugPilot — static, client-side only. No API calls, no backend. */
const APP = "plugpilot";
const GATE_HASH = "200456dbfe720a3740a968ce184430cb052334d9aead19511fc224df52d5dbc1";

/* ───────── helpers ───────── */
const num = (v, d = 0) => { const n = parseFloat(String(v == null ? "" : v).replace(/,/g, "")); return Number.isFinite(n) ? n : d; };
const money = (n) => (n < 0 ? "-$" : "$") + Math.round(Math.abs(n)).toLocaleString("en-US");
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const r2 = (n) => Math.round(n * 100) / 100;
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const loadState = (id) => lsGet(`${APP}_state_${id}`);
function escapeHtml(str) { const d = document.createElement("div"); d.textContent = str == null ? "" : String(str); return d.innerHTML; }
const E = escapeHtml;

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg; el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-visible"), 1800);
}
function copyText(text) {
  const done = () => showToast("Copied");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); } catch (e) {}
  ta.remove(); done();
}
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function monthStartStr() { return todayStr().slice(0, 8) + "01"; }
function dayNum(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : NaN; }
function addDaysStr(s, n) { const t = (dayNum(s) + n) * 86400000; const d = new Date(t); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`; }
function fmtDate(s) { const n = dayNum(s); if (isNaN(n)) return "—"; return new Date(n * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }); }

/* ───────── gate / theme / tabs ───────── */
async function sha256Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function initGate() {
  const gate = document.getElementById("gate"), form = document.getElementById("gateForm");
  const input = document.getElementById("gatePassword"), error = document.getElementById("gateError");
  if (gate.classList.contains("is-unlocked")) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const hash = await sha256Hex(input.value.trim());
    if (hash === GATE_HASH) {
      try { localStorage.setItem("plugpilot_access", "granted"); } catch (err) {}
      gate.classList.add("is-unlocked"); error.classList.remove("is-visible");
    } else { error.classList.add("is-visible"); input.value = ""; input.focus(); }
  });
}
function initTheme() {
  const toggle = document.getElementById("themeToggle"), root = document.documentElement;
  const eff = () => { const a = root.getAttribute("data-theme"); if (a === "dark" || a === "light") return a; return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; };
  toggle.addEventListener("click", () => {
    const next = eff() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("plugpilot_theme", next); } catch (e) {}
  });
}
function initTabs() {
  const btns = document.querySelectorAll(".tab-btn");
  btns.forEach((btn) => btn.addEventListener("click", () => {
    btns.forEach((b) => { b.classList.remove("is-active"); b.setAttribute("aria-selected", "false"); });
    btn.classList.add("is-active"); btn.setAttribute("aria-selected", "true");
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("is-active"));
    document.getElementById("panel-" + btn.dataset.tab).classList.add("is-active");
    const mod = btn.dataset.tab;
    const active = document.querySelector(`#subtabs-${mod} .subtab-btn.is-active`);
    if (active && TOOLS[active.dataset.tool]) TOOLS[active.dataset.tool].refresh();
  }));
}

/* ───────── save / reopen (per tool) ───────── */
function initSaveable({ toolId, listEl, getEntry, applyEntry, max = 50 }) {
  const key = `${APP}_saved_${toolId}`;
  const read = () => lsGet(key) || [];
  const write = (entries) => { lsSet(key, entries.slice(0, max)); render(); };
  function render() {
    const entries = read();
    if (!entries.length) { listEl.innerHTML = `<p class="saved-empty">Nothing saved yet — generate something, then press Save.</p>`; return; }
    listEl.innerHTML = entries.map((e) => `
      <div class="saved-item" data-id="${E(e.id)}">
        <div class="saved-item-main"><div class="saved-item-name">${E(e.name)}</div><div class="saved-item-meta">${E(e.meta)} · ${E(formatSavedAt(e.savedAt))}</div></div>
        <div class="saved-actions"><button class="ghost-btn" data-act="open">Open</button><button class="ghost-btn" data-act="delete">Delete</button></div>
      </div>`).join("");
  }
  listEl.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-act]"); if (!btn) return;
    const id = btn.closest(".saved-item").dataset.id;
    const entry = read().find((e) => e.id === id); if (!entry) return;
    if (btn.dataset.act === "open") { applyEntry(entry.payload); showToast("Opened"); }
    else { write(read().filter((e) => e.id !== id)); showToast("Deleted"); }
  });
  render();
  return { save() {
    const entry = getEntry();
    if (!entry) { showToast("Nothing to save yet"); return; }
    write([{ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), savedAt: new Date().toISOString(), ...entry }, ...read()]);
    showToast("Saved");
  } };
}
function formatSavedAt(iso) { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }

/* ═════════ MODULE 1 — CreditWise ═════════ */
const PLAN_JOBS = [
  { id: "site", name: "Client website", cost: 48 },
  { id: "photo", name: "Product photo set", cost: 25 },
  { id: "film", name: "30-second promo film", cost: 227 },
  { id: "voice", name: "Voiceover + music track", cost: 12, est: true },
  { id: "posts", name: "Week of social posts", cost: 40, est: true },
  { id: "brand", name: "Brand starter kit", cost: 30, est: true },
];

/* Tool 1 */
function computeBudget(s) {
  s = s || {};
  const credits = num(s.cfg_credits, 2500), conn = num(s.cfg_conn, 200), turns = Math.max(0, num(s.cfg_turns, 6));
  const rows = PLAN_JOBS.map((j) => {
    const cost = Math.max(0, num(s["cost_" + j.id], j.cost));
    const qty = Math.max(0, Math.floor(num(s["qty_" + j.id], 0)));
    return { id: j.id, name: j.name, cost, qty, credits: cost * qty, conn: qty * turns };
  });
  const totalCredits = rows.reduce((a, r) => a + r.credits, 0);
  const totalConn = rows.reduce((a, r) => a + r.conn, 0);
  const totalJobs = rows.reduce((a, r) => a + r.qty, 0);
  const remCredits = credits - totalCredits, remConn = conn - totalConn;
  const overC = remCredits < 0, overN = remConn < 0;
  const verdict = overC && overN ? "over-both" : overC ? "over-credits" : overN ? "over-connections" : "fits";
  const headroom = rows.filter((r) => r.cost > 0).map((r) => {
    let more = remCredits > 0 ? Math.floor(remCredits / r.cost) : 0;
    if (turns > 0) more = Math.min(more, Math.floor(Math.max(remConn, 0) / turns));
    return { name: r.name, more };
  });
  const lines = rows.filter((r) => r.qty > 0).map((r) => `${r.qty} × ${r.name} @ ${r.cost} = ${fmt(r.credits)} credits`);
  const label = { fits: "Fits the month", "over-credits": "Over your credits", "over-connections": "Over your connections", "over-both": "Over both limits" }[verdict];
  const text = [`Credit plan — ${label}`, ...lines, `Credits: ${fmt(totalCredits)} of ${fmt(credits)} (${fmt(remCredits)} left)`, `Connections: ${fmt(totalConn)} of ${fmt(conn)} (${fmt(remConn)} left)`].join("\n");
  return { credits, conn, turns, rows, totalCredits, totalConn, totalJobs, remCredits, remConn,
    creditPct: credits > 0 ? Math.round((totalCredits / credits) * 1000) / 10 : 0,
    connPct: conn > 0 ? Math.round((totalConn / conn) * 1000) / 10 : 0, verdict, label, headroom, text };
}
function renderBudget(r, out) {
  const cls = r.verdict === "fits" ? "ok" : "bad";
  const mark = r.verdict === "fits" ? "✔ " : "✖ ";
  out.innerHTML = `
    <p class="verdict ${cls}">${mark}${E(r.label)}</p>
    <div class="kpis">
      <div class="kpi"><div class="kl">Credits used</div><div class="kv">${fmt(r.totalCredits)}</div></div>
      <div class="kpi"><div class="kl">Credits left</div><div class="kv">${fmt(r.remCredits)}</div></div>
      <div class="kpi"><div class="kl">Jobs planned</div><div class="kv">${fmt(r.totalJobs)}</div></div>
      <div class="kpi"><div class="kl">Connections left</div><div class="kv">${fmt(r.remConn)}</div></div>
    </div>
    <div class="bar-label"><span>Credits</span><span>${r.creditPct}%</span></div>
    <div class="bar ${r.remCredits < 0 ? "over" : ""}"><i style="width:${Math.min(100, r.creditPct)}%"></i></div>
    <div class="bar-label"><span>Connections</span><span>${r.connPct}%</span></div>
    <div class="bar ${r.remConn < 0 ? "over" : ""}"><i style="width:${Math.min(100, r.connPct)}%"></i></div>
    <div class="table-wrap"><table class="data"><thead><tr><th>Job</th><th class="n">Qty</th><th class="n">Credits</th></tr></thead><tbody>
      ${r.rows.filter((x) => x.qty > 0).map((x) => `<tr><td>${E(x.name)}</td><td class="n">${x.qty}</td><td class="n">${fmt(x.credits)}</td></tr>`).join("") || `<tr><td colspan="3">Enter how many of each job you expect.</td></tr>`}
    </tbody></table></div>
    <p class="note"><strong>Room for more</strong> (one job type at a time, using what's left): ${r.headroom.map((h) => `${E(h.name)} ${h.more}`).join(" · ")}</p>`;
}

/* Tool 2 */
function computeGuardrails(s) {
  s = s || {};
  const monthly = num(s.g_credits, 2500), planned = Math.max(0, num(s.g_planned, 0));
  const days = Math.max(1, num(s.g_days, 22)), burst = Math.max(1, num(s.g_burst, 1.5));
  const rounds = Math.max(0, num(s.g_rounds, 2)), pct = Math.max(0, num(s.g_pct, 20));
  const jobs = Math.max(0, num(s.g_jobs, 0)), maxJob = Math.max(0, num(s.g_maxjob, 0));
  const reserve = Math.ceil(planned * rounds * pct / 100);
  const committed = planned + reserve, headroom = monthly - committed;
  const dailyCap = Math.min(monthly, Math.ceil(committed / days * burst));
  const avg = jobs > 0 ? planned / jobs : 0;
  const askFirst = avg > 0 ? Math.ceil(avg * 1.5) : 0;
  const bigJobNeedsOk = askFirst > 0 && maxJob > askFirst;
  const clients = [];
  let pctSum = 0;
  for (let i = 1; i <= 4; i++) {
    const name = String(s["c_name_" + i] || "").trim(), p = Math.max(0, num(s["c_pct_" + i], 0));
    if (!name && !p) continue;
    pctSum += p;
    clients.push({ name: name || `Client ${i}`, pct: p, credits: Math.floor(committed * p / 100) });
  }
  const verdict = headroom >= 0 ? "fits" : "over";
  const text = [
    `Guardrails for ${fmt(monthly)} credits/month`,
    `Revision reserve: ${fmt(reserve)} credits (${rounds} rounds × ${pct}% of ${fmt(planned)})`,
    `Committed: ${fmt(committed)} — ${headroom >= 0 ? fmt(headroom) + " spare" : fmt(-headroom) + " over"}`,
    `Set your daily credit cap to: ${fmt(dailyCap)}`,
    askFirst ? `Set "ask me first" above: ${fmt(askFirst)} credits per job` : `"Ask me first": enter planned jobs to calculate`,
    ...clients.map((c) => `${c.name}: ${fmt(c.credits)} credits (${c.pct}%)`),
  ].join("\n");
  return { monthly, planned, reserve, committed, headroom, dailyCap, askFirst, bigJobNeedsOk, clients, pctSum, verdict, text };
}
function renderGuardrails(r, out) {
  out.innerHTML = `
    <p class="verdict ${r.verdict === "fits" ? "ok" : "bad"}">${r.verdict === "fits" ? "✔ Your plan plus revisions fits the month — " + fmt(r.headroom) + " credits spare" : "✖ Plan plus revision reserve is " + fmt(-r.headroom) + " credits over the month"}</p>
    <div class="kpis">
      <div class="kpi"><div class="kl">Daily credit cap</div><div class="kv">${fmt(r.dailyCap)}</div></div>
      <div class="kpi"><div class="kl">"Ask me first" above</div><div class="kv">${r.askFirst ? fmt(r.askFirst) : "—"}</div></div>
      <div class="kpi"><div class="kl">Revision reserve</div><div class="kv">${fmt(r.reserve)}</div></div>
      <div class="kpi"><div class="kl">Committed</div><div class="kv">${fmt(r.committed)}</div></div>
    </div>
    ${r.bigJobNeedsOk ? `<p class="note">Your largest job is above the "ask me first" threshold, so SuperPlug will pause for your OK on it. That is intended.</p>` : ""}
    ${r.clients.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Client</th><th class="n">Share</th><th class="n">Credits</th></tr></thead><tbody>${r.clients.map((c) => `<tr><td>${E(c.name)}</td><td class="n">${c.pct}%</td><td class="n">${fmt(c.credits)}</td></tr>`).join("")}</tbody></table></div>${r.pctSum !== 100 ? `<p class="note">Client shares add up to ${r.pctSum}%, not 100%.</p>` : ""}` : `<p class="note">Add client names and shares to split the month.</p>`}
    <p class="note">Enter the daily cap and "ask me first" numbers in SuperPlug's own spending controls. This tool only calculates them.</p>`;
}

/* Tool 3 */
function computeLedger(s) {
  s = s || {};
  const budget = num(s.l_budget, 2500), cycle = Math.max(1, Math.floor(num(s.l_cycle, 30)));
  const start = s.l_start || monthStartStr(), today = s.l_today || todayStr(), planned = Math.max(0, num(s.l_planned, 0));
  const entries = (s.entries || []).map((e) => ({ ...e, credits: num(e.credits, 0) }));
  const used = entries.reduce((a, e) => a + e.credits, 0), remaining = budget - used;
  let elapsed = dayNum(today) - dayNum(start) + 1;
  if (isNaN(elapsed)) elapsed = 1;
  elapsed = Math.min(cycle, Math.max(1, elapsed));
  const rate = used / elapsed;
  const projected = Math.round(rate * cycle);
  const runOutDay = rate > 0 ? Math.floor(budget / rate) : null;
  const runOutDate = runOutDay != null && runOutDay < cycle ? addDaysStr(start, runOutDay - 1) : null;
  let status;
  if (used === 0) status = "none";
  else if (projected > budget) status = "over";
  else if (projected >= budget * 0.9) status = "on";
  else status = "under";
  const expectedToDate = planned > 0 ? Math.round(planned * elapsed / cycle) : null;
  const varianceVsPlan = expectedToDate != null ? used - expectedToDate : null;
  const group = (k) => { const m = {}; entries.forEach((e) => { const key = (e[k] || "—").trim() || "—"; m[key] = (m[key] || 0) + e.credits; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([name, credits]) => ({ name, credits })); };
  const byJob = group("job"), byClient = group("client");
  const lbl = { none: "No entries yet", under: "Under pace", on: "On pace", over: "Over pace" }[status];
  const text = [`Credit ledger — ${lbl}`, `Used ${fmt(used)} of ${fmt(budget)} by day ${elapsed} of ${cycle}`, `Pace: ${r2(rate)} credits/day → projected ${fmt(projected)} for the cycle`,
    runOutDate ? `At this pace credits run out around ${fmtDate(runOutDate)} (day ${runOutDay})` : `At this pace credits last the whole cycle`,
    varianceVsPlan != null ? `Versus plan: ${varianceVsPlan > 0 ? "+" : ""}${fmt(varianceVsPlan)} credits against ${fmt(expectedToDate)} expected by now` : ""].filter(Boolean).join("\n");
  return { budget, cycle, start, today, elapsed, used, remaining, rate: r2(rate), projected, runOutDay, runOutDate, status, label: lbl, expectedToDate, varianceVsPlan, byJob, byClient, count: entries.length, text };
}
function renderLedger(r, out) {
  const cls = r.status === "over" ? "bad" : r.status === "on" ? "warn" : "ok";
  const sym = r.status === "over" ? "✖ " : r.status === "on" ? "⚠ " : "✔ ";
  out.innerHTML = `
    <p class="verdict ${r.status === "none" ? "" : cls}">${r.status === "none" ? "No entries yet — add a job to start tracking" : sym + E(r.label) + (r.runOutDate ? " — credits run out around " + fmtDate(r.runOutDate) : " — credits last the cycle")}</p>
    <div class="kpis">
      <div class="kpi"><div class="kl">Used</div><div class="kv">${fmt(r.used)}</div></div>
      <div class="kpi"><div class="kl">Remaining</div><div class="kv">${fmt(r.remaining)}</div></div>
      <div class="kpi"><div class="kl">Per day</div><div class="kv">${r.rate}</div></div>
      <div class="kpi"><div class="kl">Projected</div><div class="kv">${fmt(r.projected)}</div></div>
    </div>
    <div class="bar-label"><span>Day ${r.elapsed} of ${r.cycle}</span><span>${r.budget > 0 ? Math.round(r.used / r.budget * 100) : 0}% of credits</span></div>
    <div class="bar ${r.remaining < 0 ? "over" : ""}"><i style="width:${Math.min(100, r.budget > 0 ? r.used / r.budget * 100 : 0)}%"></i></div>
    ${r.varianceVsPlan != null ? `<p class="note">Against your plan you've used ${r.varianceVsPlan > 0 ? fmt(r.varianceVsPlan) + " more" : fmt(-r.varianceVsPlan) + " fewer"} credits than expected by day ${r.elapsed} (${fmt(r.expectedToDate)} expected).</p>` : ""}
    ${r.byJob.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>By job</th><th class="n">Credits</th></tr></thead><tbody>${r.byJob.map((x) => `<tr><td>${E(x.name)}</td><td class="n">${fmt(x.credits)}</td></tr>`).join("")}</tbody></table></div>` : ""}
    ${r.byClient.length && !(r.byClient.length === 1 && r.byClient[0].name === "—") ? `<div class="table-wrap"><table class="data"><thead><tr><th>By client</th><th class="n">Credits</th></tr></thead><tbody>${r.byClient.map((x) => `<tr><td>${E(x.name)}</td><td class="n">${fmt(x.credits)}</td></tr>`).join("")}</tbody></table></div>` : ""}
    <p class="note">This is a logbook: it can't see your real balance. Type in the cost SuperPlug showed you when you approved each job.</p>`;
}

/* ═════════ MODULE 2 — Briefed ═════════ */
const ASSETS = { photo: "A photo (product or person)", url: "A website or page link", logo: "Logo file", script: "Script, notes or article text", offer: "Price and offer details", contact: "Address or contact details" };
const BRIEF_JOBS = {
  commercial: { label: "Product commercial from one photo", verb: "Turn the attached product photo into a 30-second commercial", needs: ["photo"], nice: ["logo", "offer"], deliver: "a 30-second video plus a 9:16 vertical cut for Reels" },
  promo: { label: "Business promo video", verb: "Create a promo video", needs: ["offer", "contact"], nice: ["photo", "logo"], deliver: "a 30-second promo video with voiceover and music" },
  website: { label: "Cinematic website", verb: "Build a cinematic, scroll-animated website", needs: ["offer", "contact"], nice: ["photo", "logo", "url"], deliver: "a one-page site with a working enquiry form" },
  graphics: { label: "Launch graphics set", verb: "Design a set of launch graphics", needs: ["offer"], nice: ["logo", "photo"], deliver: "a feed post, a story and a web banner in the correct sizes" },
  week: { label: "Week of social content", verb: "Plan and create a week of social media content", needs: ["offer"], nice: ["logo", "url"], deliver: "seven days of graphics and captions plus two reel ideas, ready for my approval before anything is published" },
  intro: { label: "Talking introduction video", verb: "Use my attached photo to create a short talking introduction", needs: ["photo", "script"], nice: ["logo"], deliver: "a lip-synced intro video of about 30 seconds" },
  voice: { label: "Voiceover with music", verb: "Record a voiceover of my script with a music bed", needs: ["script"], nice: [], deliver: "a voiceover track and a matching music bed" },
  deck: { label: "Presentation from notes", verb: "Turn my notes into a presentation", needs: ["script"], nice: ["logo", "offer"], deliver: "a short slide deck with speaker notes" },
  blog: { label: "Blog post to video", verb: "Turn my article into a short narrated video", needs: ["script"], nice: ["logo"], deliver: "a narrated 60-second video" },
  shoot: { label: "Product photo makeover", verb: "Give my product photo a studio and lifestyle makeover", needs: ["photo"], nice: [], deliver: "studio, lifestyle and white-background versions of the image" },
  brandkit: { label: "Brand starter kit", verb: "Build a brand starter kit", needs: [], nice: ["url", "logo"], deliver: "a logo, a color palette and matching social graphics" },
  leadpage: { label: "Lead page with follow-up emails", verb: "Create a lead generation page and follow-up email drafts", needs: ["offer", "contact"], nice: ["logo"], deliver: "one lead page and three follow-up email drafts to review, not send" },
};
const AI_OPENERS = {
  claude: "In this Claude chat, use my connected SuperPlug AI tools.",
  chatgpt: "In this ChatGPT chat, use my connected SuperPlug AI connector.",
  grok: "In this Grok chat, use my connected SuperPlug AI tools.",
};
function brandLine(b) {
  if (!b || !String(b.k_name || "").trim()) return "";
  const cols = [b.k_c1, b.k_c2, b.k_c3].map((c) => String(c || "").trim()).filter(Boolean).join(", ");
  const bits = [`Brand: ${String(b.k_name).trim()}`];
  if (cols) bits.push(`colors ${cols}`);
  if (String(b.k_tone || "").trim()) bits.push(`tone ${String(b.k_tone).trim()}`);
  if (String(b.k_claims || "").trim()) bits.push(`only use these claims: ${String(b.k_claims).trim()}`);
  if (String(b.k_never || "").trim()) bits.push(`never say: ${String(b.k_never).trim()}`);
  return bits.join("; ") + ".";
}
function computeBrief(s, brands) {
  s = s || {};
  const job = BRIEF_JOBS[s.b_job] || BRIEF_JOBS.commercial;
  const biz = String(s.b_biz || "").trim(), type = String(s.b_type || "").trim(), offer = String(s.b_offer || "").trim(), aud = String(s.b_audience || "").trim();
  const tone = String(s.b_tone || "friendly").trim();
  const ai = AI_OPENERS[s.b_ai] ? s.b_ai : "claude";
  const have = (a) => !!s["a_" + a];
  const readyAssets = Object.keys(ASSETS).filter(have);
  const missingNeeds = job.needs.filter((a) => !have(a));
  const missingNice = job.nice.filter((a) => !have(a));
  let earned = 0, total = 0;
  job.needs.forEach((a) => { total += 2; if (have(a)) earned += 2; });
  job.nice.forEach((a) => { total += 1; if (have(a)) earned += 1; });
  [biz, type, offer, aud].forEach((f) => { total += 1; if (f) earned += 1; });
  const score = total ? Math.round(earned / total * 100) : 100;
  const slot = String(s.b_brand || "none");
  const bl = slot !== "none" && brands && brands[slot] ? brandLine(brands[slot]) : "";
  const forWhom = biz ? `for ${biz}${type ? `, ${/^[aeiou]/i.test(type) ? "an" : "a"} ${type}` : ""}` : (type ? `for a ${type}` : "for my business");
  const parts = [AI_OPENERS[ai], `${job.verb} ${forWhom}.`];
  parts.push(offer ? `The goal or offer: ${offer}.` : "The goal or offer: [say what you want people to do].");
  if (aud) parts.push(`The audience: ${aud}.`);
  parts.push(`Tone: ${tone}.`);
  if (bl) parts.push(bl);
  if (readyAssets.length) parts.push(`I'm giving you: ${readyAssets.map((a) => ASSETS[a].toLowerCase()).join(", ")}.`);
  parts.push(`Deliver ${job.deliver}.`);
  parts.push("Before you make anything, show me the plan, the time and the credit cost, and wait for my OK. Then make it so I can ask for changes afterwards.");
  const text = parts.join(" ");
  return { jobLabel: job.label, score, readyAssets, missingNeeds, missingNice, brandLine: bl, text };
}
function renderBrief(r, out) {
  out.innerHTML = `
    <div class="kpis"><div class="kpi"><div class="kl">Ready to send</div><div class="kv">${r.score}%</div></div>
    <div class="kpi"><div class="kl">Still to gather</div><div class="kv">${r.missingNeeds.length}</div></div></div>
    <div class="bar"><i style="width:${r.score}%"></i></div>
    <pre class="out-text">${E(r.text)}</pre>
    ${r.missingNeeds.length ? `<p class="verdict bad">✖ Needed before you send: ${r.missingNeeds.map((a) => E(ASSETS[a])).join("; ")}</p>` : `<p class="verdict ok">✔ Everything this job needs is ready</p>`}
    ${r.missingNice.length ? `<p class="note">Would improve the result: ${r.missingNice.map((a) => E(ASSETS[a])).join("; ")}.</p>` : ""}
    <p class="note">Attach the files you ticked in the same message. SuperPlug will reply with a plan and credit cost; check it against your Planner before approving.</p>`;
}

/* Tool 5 */
function validHex(c) { return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(c || "").trim()); }
const BRAND_WEIGHTS = [["k_name", 15], ["k_url", 5], ["k_c1", 15], ["k_c2", 10], ["k_c3", 5], ["k_font", 10], ["k_tone", 10], ["k_products", 10], ["k_audience", 5], ["k_claims", 10], ["k_never", 5]];
function computeBrandSheet(s) {
  s = s || {};
  const v = (k) => String(s[k] || "").trim();
  let score = 0; const missing = [];
  BRAND_WEIGHTS.forEach(([k, w]) => {
    let ok = !!v(k);
    if (k.startsWith("k_c") && ok && !validHex(v(k))) ok = false;
    if (ok) score += w; else missing.push(k);
  });
  const badColors = ["k_c1", "k_c2", "k_c3"].filter((k) => v(k) && !validHex(v(k)));
  const L = (label, val) => (val ? `${label}: ${val}` : "");
  const colors = ["k_c1", "k_c2", "k_c3"].map((k, i) => (validHex(v(k)) ? `${["Primary", "Secondary", "Accent"][i]} ${v(k).toUpperCase()}` : "")).filter(Boolean).join(", ");
  const text = ["BRAND KIT" + (v("k_name") ? " — " + v("k_name") : ""), L("Website", v("k_url")), L("Colors", colors), L("Fonts", v("k_font")), L("Voice and tone", v("k_tone")),
    L("Products or services", v("k_products")), L("Audience", v("k_audience")), L("Approved claims", v("k_claims")), L("Never say", v("k_never"))].filter(Boolean).join("\n");
  return { score, missing, badColors, colors: ["k_c1", "k_c2", "k_c3"].map((k) => (validHex(v(k)) ? v(k) : null)), text };
}
function renderBrandSheet(r, out) {
  out.innerHTML = `
    <div class="kpis"><div class="kpi"><div class="kl">Completeness</div><div class="kv">${r.score}%</div></div></div>
    <div class="bar"><i style="width:${r.score}%"></i></div>
    <div class="swatches">${r.colors.map((c) => (c ? `<span class="swatch" style="background:${E(c)}" title="${E(c)}"></span>` : "")).join("")}</div>
    ${r.badColors.length ? `<p class="verdict bad">✖ Color values must look like #4636E3 — check ${r.badColors.length} field${r.badColors.length > 1 ? "s" : ""}</p>` : ""}
    <pre class="out-text">${E(r.text)}</pre>
    <p class="note">Paste this into SuperPlug when it asks about your brand, or pick this brand in the Brief Builder.</p>`;
}

/* Tool 6 */
const REV_CATS = [
  { id: "shot", label: "shot or scene", kw: ["shot", "scene", "angle", "camera", "clip", "frame", "opening", "ending", "transition"] },
  { id: "headline", label: "on-screen text", kw: ["headline", "title", "text", "copy", "wording", "tagline", "slogan", "caption", "subtitle"] },
  { id: "cta", label: "call to action", kw: ["button", "call to action", "cta", "price", "booking", "sign up", "offer"] },
  { id: "music", label: "music", kw: ["music", "song", "soundtrack", "beat", "jingle", "score"] },
  { id: "voice", label: "voiceover", kw: ["voice", "narrat", "accent", "speaker", "read"] },
  { id: "background", label: "background", kw: ["background", "backdrop", "setting", "location", "scenery"] },
  { id: "brand", label: "colors and brand styling", kw: ["color", "colour", "palette", "font", "logo", "brand"] },
  { id: "length", label: "length and pacing", kw: ["shorter", "longer", "length", "duration", "seconds", "faster", "slower", "pace", "trim", "shorten", "lengthen"] },
  { id: "layout", label: "layout", kw: ["layout", "spacing", "section", "mobile", "menu", "footer", "header", "align", "position", "move"] },
];
const VAGUE = ["pop", "better", "nicer", "professional", "feels off", "wow", "improve", "fix it", "something", "more modern", "not right", "different"];
const WHOLE = ["redo", "start over", "everything", "all of it", "whole", "from scratch", "completely", "entire", "regenerate", "again"];
function hasWord(low, w) { return low.includes(w); }
function computeRevisions(s) {
  s = s || {};
  const asset = String(s.r_asset || "video");
  const keep = String(s.r_keep || "").trim();
  const lines = String(s.r_text || "").split(/\n/).map((x) => x.trim()).filter(Boolean);
  const items = lines.map((text) => {
    const low = text.toLowerCase();
    const scored = REV_CATS.map((c, idx) => ({ c, idx, score: c.kw.filter((k) => hasWord(low, k)).length })).filter((x) => x.score > 0);
    scored.sort((a, b) => b.score - a.score || a.idx - b.idx);
    const best = scored[0] || null;
    const tie = !!(best && scored[1] && scored[1].score === best.score);
    const whole = WHOLE.some((w) => hasWord(low, w));
    const vague = VAGUE.some((w) => hasWord(low, w));
    let risk = "low", el = best ? best.c.label : null, instruction;
    if (whole) risk = "high"; else if (vague || !best) risk = "medium";
    const keepTxt = keep ? `Keep everything else exactly as it is, including ${keep}.` : "Keep everything else exactly as it is.";
    if (!best) instruction = `Tell me which part of the ${asset} this is about, and describe one concrete change: "${text}". Do not regenerate anything yet.`;
    else if (whole) instruction = `Do not regenerate the whole ${asset}. Change only the ${el}: "${text}". ${keepTxt}`;
    else if (vague) instruction = `Change only the ${el}. My note is "${text}" — pick one specific improvement to the ${el} and tell me what you changed. ${keepTxt}`;
    else instruction = `Change only the ${el}: ${text}. ${keepTxt}`;
    return { text, element: el || "unclear", category: best ? best.c.id : "unclear", risk, tie, alternatives: tie ? scored.filter((x) => x.score === best.score).slice(1).map((x) => x.c.label) : [], instruction };
  });
  const high = items.filter((i) => i.risk === "high").length, medium = items.filter((i) => i.risk === "medium").length;
  const combined = items.length
    ? `Please make these ${asset} changes one at a time, in this order. After each, show me the result before moving on, and tell me the credit cost before regenerating anything.\n` + items.map((i, n) => `${n + 1}. ${i.instruction}`).join("\n")
    : "";
  return { asset, items, high, medium, low: items.length - high - medium, text: combined };
}
function renderRevisions(r, out) {
  if (!r.items.length) { out.innerHTML = `<p class="output-placeholder">Type one change request per line to sharpen them.</p>`; return; }
  out.innerHTML = `
    <div class="kpis"><div class="kpi"><div class="kl">Requests</div><div class="kv">${r.items.length}</div></div>
    <div class="kpi"><div class="kl">Regeneration risk</div><div class="kv">${r.high}</div></div></div>
    ${r.items.map((i) => `<div class="rev-item"><div class="orig">“${E(i.text)}”</div>
      <div><span class="pill ${i.risk}">${i.risk === "low" ? "Single element" : i.risk === "medium" ? "Needs one concrete change" : "Whole-asset risk"}</span> <strong>${E(i.element)}</strong>${i.tie ? ` <span class="orig">(could also be: ${E(i.alternatives.join(", "))})</span>` : ""}</div>
      <div>${E(i.instruction)}</div></div>`).join("")}
    <pre class="out-text">${E(r.text)}</pre>`;
}

/* ═════════ MODULE 3 — Priced ═════════ */
const RATE_ITEMS = {
  site: { label: "Local business website", unit: "site", low: 1500, high: 3000, credits: 48, hours: 3 },
  content: { label: "Monthly content package", unit: "month", low: 800, high: 1200, credits: 142, hours: 4.5 },
  voice: { label: "Voiceover", unit: "minute", low: 100, high: 300, credits: 12, hours: 0.25 },
  brand: { label: "Brand identity kit", unit: "kit", low: 250, high: 800, credits: 30, hours: 1.5 },
  promo: { label: "30-second promo video", unit: "video", low: 500, high: 5000, credits: 227, hours: 1.5 },
};
const MARKETS = { small: 0.8, mid: 1, major: 1.25 }, SCOPES = { basic: 0.85, standard: 1, extensive: 1.3 }, RUSH = { none: 1, "48": 1.25, "24": 1.5 };
function computeRate(s) {
  s = s || {};
  const it = RATE_ITEMS[s.q_item] || RATE_ITEMS.site;
  const qty = Math.max(0, num(s.q_qty, 1));
  const m = MARKETS[s.q_market] || 1, sc = SCOPES[s.q_scope] || 1, ru = RUSH[s.q_rush] || 1;
  const low = num(s.q_low, it.low), high = num(s.q_high, it.high);
  const credits = Math.max(0, num(s.q_credits, it.credits)), hours = Math.max(0, num(s.q_hours, it.hours));
  const cpc = Math.max(0, num(s.q_cpc, 0.04)), rate = Math.max(0, num(s.q_rate, 40));
  const factor = m * sc * ru * qty;
  const floor = Math.round(low * factor), premium = Math.round(high * factor), target = Math.round((low * factor + high * factor) / 2);
  const creditCost = r2(credits * qty * cpc), labor = r2(hours * qty * rate), cost = r2(creditCost + labor);
  const tier = (price) => ({ price, margin: r2(price - cost), pct: price > 0 ? Math.round((price - cost) / price * 1000) / 10 : 0 });
  const tiers = { floor: tier(floor), target: tier(target), premium: tier(premium) };
  const belowCost = floor < cost;
  const name = `${it.label}${qty !== 1 ? ` × ${qty}` : ""}`;
  const text = [`Quote: ${name}`, `Floor ${money(floor)} · Target ${money(target)} · Premium ${money(premium)}`, `Your cost ${money(cost)} (credits ${money(creditCost)} + time ${money(labor)}) — margin at target ${money(tiers.target.margin)} (${tiers.target.pct}%)`].join("\n");
  return { label: it.label, unit: it.unit, name, qty, floor, target, premium, creditCost, labor, cost, tiers, belowCost, factor: r2(m * sc * ru), text };
}
function renderRate(r, out) {
  out.innerHTML = `
    ${r.belowCost ? `<p class="verdict bad">✖ The floor price is below what this job costs you</p>` : `<p class="verdict ok">✔ Even the floor price covers your costs</p>`}
    <div class="kpis">
      <div class="kpi"><div class="kl">Floor</div><div class="kv">${money(r.floor)}</div></div>
      <div class="kpi"><div class="kl">Target</div><div class="kv">${money(r.target)}</div></div>
      <div class="kpi"><div class="kl">Premium</div><div class="kv">${money(r.premium)}</div></div>
    </div>
    <div class="table-wrap"><table class="data"><thead><tr><th>Price point</th><th class="n">Price</th><th class="n">Margin</th><th class="n">Margin %</th></tr></thead><tbody>
      ${["floor", "target", "premium"].map((k) => `<tr><td>${k[0].toUpperCase() + k.slice(1)}</td><td class="n">${money(r.tiers[k].price)}</td><td class="n">${money(r.tiers[k].margin)}</td><td class="n">${r.tiers[k].pct}%</td></tr>`).join("")}
    </tbody></table></div>
    <p class="note">Your cost: ${money(r.cost)} (credits ${money(r.creditCost)} + your time ${money(r.labor)}). Price adjustment from market, scope and turnaround: ×${r.factor}.</p>`;
}

/* Tool 8 */
const TIERS = [["Starter", 4, 2, 1], ["Growth", 8, 4, 1], ["Premium", 12, 6, 1]];
function computeRetainer(s) {
  s = s || {};
  const cp = Math.max(0, num(s.t_post, 6)), cv = Math.max(0, num(s.t_video, 55)), cr = Math.max(0, num(s.t_report, 8));
  const hp = Math.max(0, num(s.t_hpost, 0.5)), hv = Math.max(0, num(s.t_hvideo, 1)), hr = Math.max(0, num(s.t_hreport, 0.5));
  const cpc = Math.max(0, num(s.t_cpc, 0.04)), rate = Math.max(0, num(s.t_rate, 40));
  const monthly = Math.max(0, num(s.t_credits, 2500)), want = Math.max(0, Math.floor(num(s.t_clients, 3)));
  const defaults = [800, 1400, 1900];
  const tiers = TIERS.map(([name, posts, videos, reports], i) => {
    const price = Math.max(0, num(s["t_p" + (i + 1)], defaults[i]));
    const credits = posts * cp + videos * cv + reports * cr;
    const hours = posts * hp + videos * hv + reports * hr;
    const creditCost = r2(credits * cpc), labor = r2(hours * rate), cost = r2(creditCost + labor);
    const margin = r2(price - cost);
    const clientsFit = credits > 0 ? Math.floor(monthly / credits) : 0;
    return { name, posts, videos, reports, price, credits, hours: r2(hours), creditCost, labor, cost, margin, pct: price > 0 ? Math.round(margin / price * 1000) / 10 : 0, clientsFit, needed: credits * want, fitsWant: credits * want <= monthly, desc: `${posts} posts · ${videos} short videos · ${reports} report` };
  });
  const best = tiers.reduce((a, b) => (b.margin / (b.credits || 1) > a.margin / (a.credits || 1) ? b : a), tiers[0]);
  const text = ["Monthly retainer packages", ...tiers.map((t) => `${t.name} (${t.desc}): ${money(t.price)}/month — costs you ${money(t.cost)}, margin ${money(t.margin)} (${t.pct}%), ${fmt(t.credits)} credits/client, fits ${t.clientsFit} clients on ${fmt(monthly)} credits`)].join("\n");
  return { tiers, monthly, want, best: best.name, text };
}
function renderRetainer(r, out) {
  out.innerHTML = `
    <div class="table-wrap"><table class="data"><thead><tr><th>Package</th><th class="n">Price</th><th class="n">Credits / client</th><th class="n">Margin</th><th class="n">Clients it fits</th></tr></thead><tbody>
    ${r.tiers.map((t) => `<tr><td><strong>${E(t.name)}</strong><br><span class="note">${E(t.desc)}</span></td><td class="n">${money(t.price)}</td><td class="n">${fmt(t.credits)}</td><td class="n">${money(t.margin)} (${t.pct}%)</td><td class="n">${t.clientsFit}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="verdict ${r.tiers.every((t) => t.fitsWant) ? "ok" : "warn"}">${r.tiers.every((t) => t.fitsWant) ? "✔" : "⚠"} For ${r.want} client${r.want === 1 ? "" : "s"}: ${r.tiers.map((t) => `${E(t.name)} needs ${fmt(t.needed)} credits ${t.fitsWant ? "(fits)" : "(over)"}`).join(" · ")}</p>
    <p class="note">Most margin per credit: <strong>${E(r.best)}</strong>. Credits are the limit on how many clients you can carry, so margin per credit tells you which package to push.</p>`;
}

/* Tool 9 */
function computePriceSheet(s) {
  s = s || {};
  const items = (s.items || []).map((i) => ({ name: String(i.name || "").trim(), price: num(i.price, 0), note: String(i.note || "").trim() })).filter((i) => i.name);
  const retainers = s.s_inc_ret ? computeRetainer(loadState("ret") || {}).tiers : [];
  const biz = String(s.s_name || "").trim() || "Your business";
  const valid = Math.max(0, Math.floor(num(s.s_valid, 14)));
  const L = [`${biz}${s.s_tag ? " — " + String(s.s_tag).trim() : ""}`, "", ...(items.length ? ["PROJECTS", ...items.map((i) => `${i.name}: ${money(i.price)}${i.note ? " — " + i.note : ""}`)] : []),
    ...(retainers.length ? ["", "MONTHLY PACKAGES", ...retainers.map((t) => `${t.name} (${t.desc}): ${money(t.price)}/month`)] : []),
    ...(String(s.s_terms || "").trim() ? ["", "Terms: " + String(s.s_terms).trim()] : []),
    ...(valid ? ["", `Prices valid for ${valid} days.`] : []),
    ...(String(s.s_contact || "").trim() ? ["", String(s.s_contact).trim()] : [])];
  return { biz, tag: String(s.s_tag || "").trim(), items, retainers, terms: String(s.s_terms || "").trim(), contact: String(s.s_contact || "").trim(), valid, total: items.reduce((a, i) => a + i.price, 0), text: L.join("\n") };
}
function renderPriceSheet(r, out) {
  out.innerHTML = `<div class="sheet"><h2>${E(r.biz)}</h2>${r.tag ? `<p class="s-tag">${E(r.tag)}</p>` : ""}
    ${r.items.length ? `<h3>Projects</h3><table>${r.items.map((i) => `<tr><td>${E(i.name)}${i.note ? `<div class="s-sub">${E(i.note)}</div>` : ""}</td><td class="p">${money(i.price)}</td></tr>`).join("")}</table>` : ""}
    ${r.retainers.length ? `<h3>Monthly packages</h3><table>${r.retainers.map((t) => `<tr><td>${E(t.name)}<div class="s-sub">${E(t.desc)}</div></td><td class="p">${money(t.price)}/mo</td></tr>`).join("")}</table>` : ""}
    ${!r.items.length && !r.retainers.length ? `<p class="s-sub">Add items or tick “Include retainer packages” to build your sheet.</p>` : ""}
    <div class="s-foot">${r.terms ? `<div><strong>Terms:</strong> ${E(r.terms)}</div>` : ""}${r.valid ? `<div>Prices valid for ${r.valid} days.</div>` : ""}${r.contact ? `<div style="margin-top:8px">${E(r.contact).replace(/\n/g, "<br>")}</div>` : ""}</div></div>`;
}

/* ───────── tool framework ───────── */
const TOOLS = {};
const fld = (label, inner, hint) => `<div class="field"><label><span class="lab">${label}${hint ? ` <span class="optional">${hint}</span>` : ""}</span>${inner}</label></div>`;
const inp = (k, type, val, extra) => `<input type="${type || "text"}" data-k="${k}" value="${val == null ? "" : E(val)}" ${extra || ""} />`;
const sel = (k, opts, val) => `<select data-k="${k}">${opts.map(([v, l]) => `<option value="${v}"${v === val ? " selected" : ""}>${E(l)}</option>`).join("")}</select>`;
const chk = (k, label) => `<label class="check"><input type="checkbox" data-k="${k}" />${E(label)}</label>`;

function registerTool(def) {
  const host = document.getElementById("tools-" + def.module);
  const sub = document.getElementById("subtabs-" + def.module);
  const first = sub.children.length === 0;
  const btn = document.createElement("button");
  btn.className = "subtab-btn" + (first ? " is-active" : ""); btn.dataset.tool = def.id; btn.textContent = def.title; btn.type = "button";
  sub.appendChild(btn);
  const root = document.createElement("section");
  root.className = "tool" + (first ? " is-active" : ""); root.id = "tool-" + def.id;
  root.innerHTML = `
    <p class="tool-intro">${def.intro}</p>
    <div class="workspace">
      <div class="form-card">${def.form}</div>
      <div>
        <div class="output-card">
          <div class="output-head"><span class="output-label">${def.outLabel}</span>
            <div class="output-actions">${def.extraButtons || ""}<button class="ghost-btn" data-act="save" type="button">Save</button><button class="ghost-btn" data-act="copy" type="button">Copy</button></div></div>
          <div data-out></div>
        </div>
        <div class="output-card saved-card"><div class="output-head"><span class="output-label">${def.savedLabel}</span></div><div class="saved-list" data-saved></div></div>
      </div>
    </div>`;
  host.appendChild(root);
  const out = root.querySelector("[data-out]");
  const ctx = { def, root, out, extra: JSON.parse(JSON.stringify(def.extra || {})), result: null };
  ctx.read = () => {
    const s = {};
    root.querySelectorAll("[data-k]").forEach((el) => { s[el.dataset.k] = el.type === "checkbox" ? el.checked : el.value; });
    return Object.assign(s, JSON.parse(JSON.stringify(ctx.extra)));
  };
  ctx.write = (s) => {
    root.querySelectorAll("[data-k]").forEach((el) => {
      if (!(el.dataset.k in s)) return;
      if (el.type === "checkbox") el.checked = !!s[el.dataset.k]; else el.value = s[el.dataset.k];
    });
    for (const k in ctx.extra) if (k in s) ctx.extra[k] = JSON.parse(JSON.stringify(s[k]));
  };
  ctx.refresh = () => {
    if (def.beforeRefresh) def.beforeRefresh(ctx);
    const s = ctx.read();
    ctx.result = def.compute(s);
    def.render(ctx.result, out, ctx);
    if (def.afterRender) def.afterRender(ctx);
    lsSet(`${APP}_state_${def.id}`, s);
  };
  const saveable = initSaveable({
    toolId: def.id, listEl: root.querySelector("[data-saved]"),
    getEntry: () => { const s = ctx.read(); const r = def.compute(s); const e = def.entry(s, r); return e ? { name: e.name, meta: e.meta, payload: def.getPayload ? def.getPayload(s) : s } : null; },
    applyEntry: (p) => { if (def.applyPayload) def.applyPayload(ctx, p); else ctx.write(p); ctx.refresh(); },
  });
  root.addEventListener("input", (ev) => { if (ev.target.matches("[data-k]")) { if (def.onInput) def.onInput(ev, ctx); ctx.refresh(); } });
  root.addEventListener("change", (ev) => { if (ev.target.matches("[data-k]")) { if (def.onChange) def.onChange(ev, ctx); ctx.refresh(); } });
  root.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-act]"); if (!b || b.closest(".saved-list")) return;
    if (b.dataset.act === "save") saveable.save();
    else if (b.dataset.act === "copy") { if (ctx.result && ctx.result.text) copyText(ctx.result.text); else showToast("Nothing to copy yet"); }
    else if (def.onAction) { def.onAction(b.dataset.act, ctx, ev); ctx.refresh(); }
  });
  btn.addEventListener("click", () => {
    sub.querySelectorAll(".subtab-btn").forEach((x) => x.classList.remove("is-active")); btn.classList.add("is-active");
    host.querySelectorAll(".tool").forEach((x) => x.classList.remove("is-active")); root.classList.add("is-active");
    ctx.refresh();
  });
  const stored = loadState(def.id);
  if (def.prepare) { ctx.pendingBrand = stored && stored.b_brand; def.prepare(ctx); }
  if (stored) ctx.write(stored);
  if (def.init) def.init(ctx);
  ctx.refresh();
  TOOLS[def.id] = ctx;
  return ctx;
}

function briefPrepare(ctx) {
  const brands = (loadState("brand") || {}).brands || {};
  const selEl = ctx.root.querySelector('[data-k="b_brand"]');
  const cur = ctx.pendingBrand || selEl.value || "none";
  ctx.pendingBrand = null;
  selEl.innerHTML = `<option value="none">None</option>` + [1, 2, 3].map((n) => `<option value="${n}">${E((brands[n] && brands[n].k_name) || "Brand slot " + n)}</option>`).join("");
  selEl.value = cur;
  if (selEl.value !== cur) selEl.value = "none";
}

/* ───────── tool definitions ───────── */
function defineTools() {
  /* 1 Planner */
  registerTool({
    id: "planner", module: "cw", title: "Credit Budget Planner",
    intro: "Plan the month's jobs against your credits and connections. The costs for websites, photo sets and promo films come from SuperPlug's own figures; <em>est.</em> costs are placeholders — overwrite them with what SuperPlug shows.",
    outLabel: "Your month", savedLabel: "Saved budgets",
    form: `<div class="field-row">${fld("Monthly creation credits", inp("cfg_credits", "number", 2500, 'min="0"'))}${fld("Monthly MCP connections", inp("cfg_conn", "number", 200, 'min="0"'))}</div>
      ${fld("Connections used per job", inp("cfg_turns", "number", 6, 'min="0"'), "(est.)")}
      <div class="sec-title">Jobs this month</div>
      <div class="job-head"><span>Job</span><span>Credits per job</span><span>How many</span></div>
      ${PLAN_JOBS.map((j) => `<div class="job-row"><span class="jn">${E(j.name)}${j.est ? ' <span class="est">est.</span>' : ""}</span>${inp("cost_" + j.id, "number", j.cost, `min="0" aria-label="Credits per job: ${E(j.name)}"`)}${inp("qty_" + j.id, "number", 0, `min="0" step="1" aria-label="How many: ${E(j.name)}"`)}</div>`).join("")}`,
    compute: computeBudget, render: renderBudget,
    entry: (s, r) => ({ name: `${r.totalJobs} jobs · ${fmt(r.totalCredits)} credits`, meta: r.label }),
  });
  /* 2 Guardrails */
  registerTool({
    id: "guard", module: "cw", title: "Spending Guardrail Calculator",
    intro: "Turn your plan into the numbers to type into SuperPlug's spending controls — a daily cap, an “ask me first” level, and a reserve so revisions don't eat the month.",
    outLabel: "Your guardrails", savedLabel: "Saved guardrails",
    extraButtons: '<button class="ghost-btn" data-act="pull" type="button">Use Planner total</button>',
    form: `<div class="field-row">${fld("Monthly creation credits", inp("g_credits", "number", 2500, 'min="0"'))}${fld("Planned job credits", inp("g_planned", "number", 0, 'min="0"'))}</div>
      <div class="field-row">${fld("Number of jobs planned", inp("g_jobs", "number", 0, 'min="0"'))}${fld("Largest single job (credits)", inp("g_maxjob", "number", 0, 'min="0"'))}</div>
      <div class="field-row">${fld("Working days this month", inp("g_days", "number", 22, 'min="1"'))}${fld("Heavy-day allowance (×)", inp("g_burst", "number", 1.5, 'min="1" step="0.1"'))}</div>
      <div class="field-row">${fld("Revision rounds per job", inp("g_rounds", "number", 2, 'min="0"'))}${fld("Cost of one revision (% of original)", inp("g_pct", "number", 20, 'min="0"'))}</div>
      <div class="sec-title">Split across clients (optional)</div>
      ${[1, 2, 3, 4].map((i) => `<div class="client-row">${inp("c_name_" + i, "text", "", `placeholder="Client ${i}" aria-label="Client ${i} name"`)}${inp("c_pct_" + i, "number", "", `placeholder="%" min="0" aria-label="Client ${i} share percent"`)}</div>`).join("")}`,
    compute: computeGuardrails, render: renderGuardrails,
    onAction: (act, ctx) => {
      if (act !== "pull") return;
      const b = computeBudget(loadState("planner") || {});
      const el = (k) => ctx.root.querySelector(`[data-k="${k}"]`);
      el("g_planned").value = b.totalCredits; el("g_jobs").value = b.totalJobs; el("g_credits").value = b.credits;
      el("g_maxjob").value = Math.max(0, ...b.rows.filter((r) => r.qty > 0).map((r) => r.cost));
      showToast("Planner total loaded");
    },
    entry: (s, r) => ({ name: `Daily cap ${fmt(r.dailyCap)} · reserve ${fmt(r.reserve)}`, meta: r.verdict === "fits" ? "Fits the month" : "Over the month" }),
  });
  /* 3 Ledger */
  const ledgerCtx = registerTool({
    id: "ledger", module: "cw", title: "Credit Ledger & Burn-Down",
    intro: "Log each job's approved credit cost and see your pace, your projected total and the day you'd run out. A logbook only — it can't see your real balance.",
    outLabel: "Burn-down", savedLabel: "Saved months",
    extraButtons: '<button class="ghost-btn" data-act="pull" type="button">Use Planner total</button>',
    extra: { entries: [] },
    form: `<div class="field-row">${fld("Credits this month", inp("l_budget", "number", 2500, 'min="0"'))}${fld("Planned total", inp("l_planned", "number", "", 'min="0"'), "(optional)")}</div>
      <div class="field-row">${fld("Cycle starts", inp("l_start", "date", monthStartStr()))}${fld("Cycle length (days)", inp("l_cycle", "number", 30, 'min="1"'))}</div>
      ${fld("Today", inp("l_today", "date", todayStr()))}
      <div class="sec-title">Log a job</div>
      <div class="add-row"><input class="mini-input" id="le_job" type="text" placeholder="Job" aria-label="Job" /><input class="mini-input" id="le_credits" type="number" min="0" placeholder="Credits" aria-label="Credits" /></div>
      <div class="add-row"><input class="mini-input" id="le_date" type="date" aria-label="Date" /><input class="mini-input" id="le_client" type="text" placeholder="Client (optional)" aria-label="Client" /></div>
      <button class="primary-btn" type="button" data-act="addentry">Add entry</button>
      <div class="list-rows" data-entries></div>`,
    compute: computeLedger, render: renderLedger,
    afterRender: (ctx) => {
      const box = ctx.root.querySelector("[data-entries]");
      const es = ctx.extra.entries;
      box.innerHTML = es.map((e) => `<div class="list-row"><span>${E(e.date ? fmtDate(e.date) + " · " : "")}${E(e.job)} · ${fmt(num(e.credits))} credits${e.client ? " · " + E(e.client) : ""}</span><button class="ghost-btn" type="button" data-act="rmentry" data-id="${E(e.id)}">Remove</button></div>`).join("");
    },
    onAction: (act, ctx, ev) => {
      const q = (id) => ctx.root.querySelector("#" + id);
      if (act === "addentry") {
        const job = q("le_job").value.trim(), credits = num(q("le_credits").value, NaN);
        if (!job || !Number.isFinite(credits)) { showToast("Enter a job and its credits"); return; }
        ctx.extra.entries.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4), job, credits, date: q("le_date").value || ctx.read().l_today || todayStr(), client: q("le_client").value.trim() });
        q("le_job").value = ""; q("le_credits").value = ""; q("le_client").value = "";
      } else if (act === "rmentry") {
        const id = ev.target.closest("button").dataset.id;
        ctx.extra.entries = ctx.extra.entries.filter((e) => e.id !== id);
      } else if (act === "pull") {
        const b = computeBudget(loadState("planner") || {});
        ctx.root.querySelector('[data-k="l_planned"]').value = b.totalCredits;
        ctx.root.querySelector('[data-k="l_budget"]').value = b.credits;
        showToast("Planner total loaded");
      }
    },
    init: (ctx) => { ctx.root.querySelector('[data-k="l_today"]').value = todayStr(); },
    entry: (s, r) => ({ name: `${fmt(r.used)} of ${fmt(r.budget)} used · day ${r.elapsed}`, meta: `${r.count} entries · ${r.label}` }),
  });

  /* 4 Brief */
  const briefCtx = registerTool({
    id: "brief", module: "briefed", title: "One-Sentence Brief Builder",
    intro: "Assemble the message to paste into Claude, ChatGPT or Grok, and see what you still need to gather before you send it.",
    outLabel: "Your brief", savedLabel: "Saved briefs",
    form: `${fld("Job", sel("b_job", Object.entries(BRIEF_JOBS).map(([k, v]) => [k, v.label]), "commercial"))}
      ${fld("Business name", inp("b_biz", "text", "", 'placeholder="Ridgeline Roast"'))}
      ${fld("What the business is", inp("b_type", "text", "", 'placeholder="specialty coffee roaster"'))}
      ${fld("Goal or offer", inp("b_offer", "text", "", 'placeholder="15% off the first bag this Friday"'))}
      ${fld("Audience", inp("b_audience", "text", "", 'placeholder="home coffee lovers in Denver"'))}
      <div class="field-row">${fld("Tone", sel("b_tone", ["friendly", "bold", "premium", "playful", "calm", "urgent"].map((t) => [t, t[0].toUpperCase() + t.slice(1)]), "friendly"))}${fld("Your AI", sel("b_ai", [["claude", "Claude"], ["chatgpt", "ChatGPT"], ["grok", "Grok"]], "claude"))}</div>
      ${fld("Brand kit", `<select data-k="b_brand"><option value="none">None</option></select>`, "(from Brand Kit Prep Sheet)")}
      <div class="sec-title">Assets I have ready</div>
      ${Object.entries(ASSETS).map(([k, l]) => chk("a_" + k, l)).join("")}`,
    compute: (s) => computeBrief(s, (loadState("brand") || {}).brands || {}), render: renderBrief,
    prepare: (ctx) => briefPrepare(ctx),
    beforeRefresh: (ctx) => briefPrepare(ctx),
    entry: (s, r) => ({ name: `${s.b_biz || "Untitled"} — ${r.jobLabel}`, meta: `${r.score}% ready` }),
  });

  /* 5 Brand */
  registerTool({
    id: "brand", module: "briefed", title: "Brand Kit Prep Sheet",
    intro: "Write your brand down once, in the shape SuperPlug's brand kit memory wants. Three slots match Premium's three brand kits.",
    outLabel: "Your brand sheet", savedLabel: "Saved brand sheets",
    extra: { brands: {}, slot: "1" },
    form: `${fld("Brand slot", sel("k_slot", [["1", "Brand 1"], ["2", "Brand 2"], ["3", "Brand 3"]], "1"))}
      ${fld("Brand name", inp("k_name", "text", ""))}
      ${fld("Website", inp("k_url", "text", ""), "(optional)")}
      <div class="field-row">${fld("Primary color", inp("k_c1", "text", "", 'placeholder="#4636E3"'))}${fld("Secondary color", inp("k_c2", "text", "", 'placeholder="#1B1D1C"'))}</div>
      ${fld("Accent color", inp("k_c3", "text", "", 'placeholder="#FAF9F6"'))}
      ${fld("Fonts", inp("k_font", "text", "", 'placeholder="Georgia for headings, Arial for body"'))}
      ${fld("Tone words", inp("k_tone", "text", "", 'placeholder="warm, confident, plain-spoken"'))}
      ${fld("Products or services", inp("k_products", "text", ""))}
      ${fld("Audience", inp("k_audience", "text", ""))}
      ${fld("Approved claims", inp("k_claims", "text", ""))}
      ${fld("Never say", inp("k_never", "text", ""))}`,
    compute: computeBrandSheet, render: renderBrandSheet,
    onChange: (ev, ctx) => {
      if (ev.target.dataset.k !== "k_slot") return;
      const fields = ctx.root.querySelectorAll('[data-k]:not([data-k="k_slot"])');
      const newSlot = ev.target.value;
      const snap = {}; fields.forEach((el) => { snap[el.dataset.k] = el.value; });
      ctx.extra.brands[ctx.extra.slot] = snap;
      const next = ctx.extra.brands[newSlot] || {};
      fields.forEach((el) => { el.value = next[el.dataset.k] || ""; });
      ctx.extra.slot = newSlot;
    },
    beforeRefresh: (ctx) => {
      const slot = ctx.root.querySelector('[data-k="k_slot"]').value;
      ctx.extra.slot = slot;
      const snap = {}; ctx.root.querySelectorAll('[data-k]:not([data-k="k_slot"])').forEach((el) => { snap[el.dataset.k] = el.value; });
      ctx.extra.brands[slot] = snap;
    },
    getPayload: (s) => { const p = { ...s }; delete p.brands; delete p.slot; return p; },
    applyPayload: (ctx, p) => { const keep = { brands: ctx.extra.brands, slot: ctx.extra.slot }; const q = { ...p }; delete q.k_slot; ctx.write(q); ctx.extra.brands = keep.brands; ctx.extra.slot = keep.slot; },
    entry: (s, r) => (String(s.k_name || "").trim() ? { name: `${String(s.k_name).trim()} brand sheet`, meta: `${r.score}% complete` } : null),
  });

  /* 6 Revisions */
  registerTool({
    id: "rev", module: "briefed", title: "Revision Request Sharpener",
    intro: "Turn “make it pop” into “change this one thing, keep the rest”. Each line is matched to the part of the asset it's about and flagged if it risks redoing the whole thing.",
    outLabel: "Sharpened requests", savedLabel: "Saved revision lists",
    form: `${fld("Asset type", sel("r_asset", [["video", "Video"], ["website", "Website"], ["image", "Image or graphic"], ["audio", "Audio"], ["deck", "Presentation"]], "video"))}
      ${fld("Feedback (one request per line)", `<textarea data-k="r_text" rows="6" placeholder="make the music softer&#10;the headline is too long&#10;make it pop"></textarea>`)}
      ${fld("Keep untouched", inp("r_keep", "text", "", 'placeholder="the opening shot and the voiceover"'), "(optional)")}`,
    compute: computeRevisions, render: renderRevisions,
    entry: (s, r) => (r.items.length ? { name: `${r.items.length} ${r.asset} change${r.items.length > 1 ? "s" : ""}`, meta: `${r.high} whole-asset risk` } : null),
  });

  /* 7 Rate */
  registerTool({
    id: "rate", module: "priced", title: "Deliverable Rate Calculator",
    intro: "Get a floor, target and premium price for a deliverable, anchored to the market rates quoted in SuperPlug's launch materials, and see your margin after credits and time.",
    outLabel: "Your quote", savedLabel: "Saved quotes",
    extraButtons: '<button class="ghost-btn" data-act="addsheet" type="button">Add to price sheet</button>',
    form: `${fld("Deliverable", sel("q_item", Object.entries(RATE_ITEMS).map(([k, v]) => [k, v.label]), "site"))}
      <div class="field-row">${fld("Quantity", inp("q_qty", "number", 1, 'min="0" step="1"'))}${fld("Market size", sel("q_market", [["small", "Small town (×0.8)"], ["mid", "Mid-size city (×1.0)"], ["major", "Major metro (×1.25)"]], "mid"))}</div>
      <div class="field-row">${fld("Scope", sel("q_scope", [["basic", "Basic (×0.85)"], ["standard", "Standard (×1.0)"], ["extensive", "Extensive (×1.3)"]], "standard"))}${fld("Turnaround", sel("q_rush", [["none", "Normal"], ["48", "48 hours (×1.25)"], ["24", "24 hours (×1.5)"]], "none"))}</div>
      <div class="field-row">${fld("Market low", inp("q_low", "number", RATE_ITEMS.site.low, 'min="0"'), "(per unit)")}${fld("Market high", inp("q_high", "number", RATE_ITEMS.site.high, 'min="0"'), "(per unit)")}</div>
      <div class="field-row">${fld("Credits per unit", inp("q_credits", "number", RATE_ITEMS.site.credits, 'min="0"'), "(est.)")}${fld("Hands-on hours per unit", inp("q_hours", "number", RATE_ITEMS.site.hours, 'min="0" step="0.25"'))}</div>
      <div class="field-row">${fld("Cost per credit ($)", inp("q_cpc", "number", 0.04, 'min="0" step="0.005"'))}${fld("Your hourly rate ($)", inp("q_rate", "number", 40, 'min="0"'))}</div>
      <p class="field-hint">Market low and high start from the figures in the launch materials for the first four deliverables; the promo video's low end is my assumption. Overwrite them with what clients near you pay. Cost per credit starts at the $97/month list price spread over 2,500 credits.</p>`,
    compute: computeRate, render: renderRate,
    onChange: (ev, ctx) => {
      if (ev.target.dataset.k !== "q_item") return;
      const it = RATE_ITEMS[ev.target.value]; const set = (k, v) => { ctx.root.querySelector(`[data-k="${k}"]`).value = v; };
      set("q_low", it.low); set("q_high", it.high); set("q_credits", it.credits); set("q_hours", it.hours);
    },
    onAction: (act, ctx) => {
      if (act !== "addsheet") return;
      const r = ctx.result; const list = lsGet(`${APP}_pricelist`) || [];
      list.push({ name: r.name, price: r.target }); lsSet(`${APP}_pricelist`, list);
      showToast("Added to price sheet");
    },
    entry: (s, r) => ({ name: `${r.name} — ${money(r.target)}`, meta: `Floor ${money(r.floor)} · Premium ${money(r.premium)}` }),
  });

  /* 8 Retainer */
  registerTool({
    id: "ret", module: "priced", title: "Monthly Retainer Package Builder",
    intro: "Build Starter, Growth and Premium monthly packages from a simple unit — posts, short videos and a client report — and see your margin and how many clients your credits can carry.",
    outLabel: "Your packages", savedLabel: "Saved package sets",
    form: `<div class="sec-title">Package prices (per month)</div>
      <div class="field-row">${fld("Starter price ($)", inp("t_p1", "number", 800, 'min="0"'))}${fld("Growth price ($)", inp("t_p2", "number", 1400, 'min="0"'))}</div>
      ${fld("Premium price ($)", inp("t_p3", "number", 1900, 'min="0"'))}
      <div class="sec-title">What one item costs you</div>
      <div class="field-row">${fld("Credits per post", inp("t_post", "number", 6, 'min="0"'), "(est.)")}${fld("Hours per post", inp("t_hpost", "number", 0.5, 'min="0" step="0.25"'))}</div>
      <div class="field-row">${fld("Credits per short video", inp("t_video", "number", 55, 'min="0"'), "(est.)")}${fld("Hours per short video", inp("t_hvideo", "number", 1, 'min="0" step="0.25"'))}</div>
      <div class="field-row">${fld("Credits per report", inp("t_report", "number", 8, 'min="0"'), "(est.)")}${fld("Hours per report", inp("t_hreport", "number", 0.5, 'min="0" step="0.25"'))}</div>
      <div class="sec-title">Your numbers</div>
      <div class="field-row">${fld("Cost per credit ($)", inp("t_cpc", "number", 0.04, 'min="0" step="0.005"'))}${fld("Your hourly rate ($)", inp("t_rate", "number", 40, 'min="0"'))}</div>
      <div class="field-row">${fld("Monthly creation credits", inp("t_credits", "number", 2500, 'min="0"'))}${fld("Clients you want to serve", inp("t_clients", "number", 3, 'min="0"'))}</div>
      <p class="field-hint">Starter is 4 posts, 2 short videos and 1 report; Growth doubles the posts and videos; Premium triples them. The launch materials cite $800–1,200 a month for a package of this kind.</p>`,
    compute: computeRetainer, render: renderRetainer,
    entry: (s, r) => ({ name: `Packages ${r.tiers.map((t) => money(t.price)).join(" / ")}`, meta: `Best margin per credit: ${r.best}` }),
  });

  /* 9 Sheet */
  registerTool({
    id: "sheet", module: "priced", title: "One-Page Price Sheet",
    intro: "A clean, printable single page you can send a prospect today. One page of prices and terms — not a proposal deck.",
    outLabel: "Your price sheet", savedLabel: "Saved price sheets",
    extraButtons: '<button class="ghost-btn" data-act="print" type="button">Print</button>',
    extra: { items: [] },
    form: `${fld("Your business name", inp("s_name", "text", ""))}
      ${fld("Tagline", inp("s_tag", "text", ""), "(optional)")}
      ${fld("Contact details", `<textarea data-k="s_contact" rows="2" placeholder="you@example.com · 555-0100"></textarea>`)}
      ${fld("Terms", inp("s_terms", "text", "", 'placeholder="50% to start, balance on delivery"'))}
      ${fld("Prices valid for (days)", inp("s_valid", "number", 14, 'min="0"'))}
      ${chk("s_inc_ret", "Include retainer packages")}
      <div class="sec-title">Items</div>
      <div class="add-row"><input class="mini-input" id="si_name" type="text" placeholder="Item" aria-label="Item" /><input class="mini-input" id="si_price" type="number" min="0" placeholder="Price" aria-label="Price" /></div>
      <input class="mini-input" id="si_note" type="text" placeholder="Note (optional)" aria-label="Note" style="margin-bottom:8px" />
      <div class="output-actions"><button class="primary-btn" type="button" data-act="additem">Add item</button><button class="ghost-btn" type="button" data-act="import">Import from Rate Calculator</button></div>
      <div class="list-rows" data-items></div>`,
    compute: computePriceSheet, render: renderPriceSheet,
    afterRender: (ctx) => {
      ctx.root.querySelector("[data-items]").innerHTML = ctx.extra.items.map((i) => `<div class="list-row"><span>${E(i.name)} · ${money(num(i.price))}</span><button class="ghost-btn" type="button" data-act="rmitem" data-id="${E(i.id)}">Remove</button></div>`).join("");
    },
    onAction: (act, ctx, ev) => {
      const q = (id) => ctx.root.querySelector("#" + id);
      if (act === "additem") {
        const name = q("si_name").value.trim(), price = num(q("si_price").value, NaN);
        if (!name || !Number.isFinite(price)) { showToast("Enter an item and a price"); return; }
        ctx.extra.items.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4), name, price, note: q("si_note").value.trim() });
        q("si_name").value = ""; q("si_price").value = ""; q("si_note").value = "";
      } else if (act === "rmitem") {
        const id = ev.target.closest("button").dataset.id; ctx.extra.items = ctx.extra.items.filter((i) => i.id !== id);
      } else if (act === "import") {
        const list = lsGet(`${APP}_pricelist`) || [];
        if (!list.length) { showToast("Nothing to import — use Add to price sheet in the Rate Calculator"); return; }
        list.forEach((l) => { if (!ctx.extra.items.some((i) => i.name === l.name && num(i.price) === l.price)) ctx.extra.items.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4), name: l.name, price: l.price, note: "" }); });
        lsSet(`${APP}_pricelist`, []); showToast("Imported");
      } else if (act === "print") window.print();
    },
    entry: (s, r) => ((r.items.length || r.retainers.length) ? { name: `${r.biz} price sheet`, meta: `${r.items.length} item${r.items.length === 1 ? "" : "s"}${r.retainers.length ? " + retainers" : ""}` } : null),
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initGate();
  initTheme();
  initTabs();
  defineTools();
});
