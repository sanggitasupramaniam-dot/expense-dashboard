import { useState, useEffect, useCallback } from "react";

// ─── CONFIG — your personal setup ────────────────────────────────────────────
const SHEET_WEBAPP_URL = "/api/proxy";

const FIXED_EXPENSES = [
  { name: "Apple iCloud",         amount: 14.12, card: "UOB EVOL",          category: "Gym/Telco/Streaming" },
  { name: "AIA Investment",       amount: 600,   card: "Citibank Cashback+", category: "Other" },
];

// Billing cycles: cycle ENDS on statementDay, so it STARTS on statementDay+1 of prev month
const CARDS = {
  "UOB EVOL": {
    accent: "#3B82F6", accentDim: "rgba(59,130,246,0.15)", accentBorder: "rgba(59,130,246,0.3)",
    statementDay: 12,   // cycle: 13th → 12th
    dueDay: 2,          // due 2nd of month after statement
    minSpend: 800, cap: 80,
    cashbackRules: [
      { label: "Online & Mobile Contactless", rate: 0.10, categories: ["Shopping","Grab/Gojek/Tada","Gym/Telco/Streaming","Food Delivery"] },
      { label: "Everything else", rate: 0.003, categories: ["*"] },
    ],
    tip: "⚡ Need $800/cycle to unlock 10%",
    strategy: "Use for all tap-to-pay & online SGD spend. iCloud ($14.12) already counts. Hit $800 to unlock 10% on everything contactless.",
  },
  "Citibank Cashback+": {
    accent: "#F97316", accentDim: "rgba(249,115,22,0.15)", accentBorder: "rgba(249,115,22,0.3)",
    statementDay: 19,   // cycle: 20th → 19th
    dueDay: 13,
    minSpend: 0, cap: null,
    cashbackRules: [
      { label: "All spend — unlimited", rate: 0.016, categories: ["*"] },
    ],
    tip: "✓ Unlimited 1.6% — no cap, no min spend",
    strategy: "Your Grab/Gojek/Tada card. AIA premium ($600) earns 1.6% = $9.60/month. Perfect fallback once other caps hit.",
  },
  "Maybank XL": {
    accent: "#22C55E", accentDim: "rgba(34,197,94,0.15)", accentBorder: "rgba(34,197,94,0.3)",
    statementDay: 25,   // cycle: 26th → 25th
    dueDay: 15,
    minSpend: 500, cap: 80,
    cashbackRules: [
      { label: "Dine, Shop, Travel & Play", rate: 0.05, categories: ["Dining","Shopping","Entertainment","Food Delivery","Transport"] },
      { label: "Everything else", rate: 0.002, categories: ["*"] },
    ],
    tip: "🍜 5% on dining & shopping up to $80/cycle",
    strategy: "Best for dining, food delivery, shopping & entertainment. Hit $500/cycle to unlock 5%. Switch to Citi once $80 cap is reached.",
  },
};

// ─── BILLING CYCLE HELPERS ───────────────────────────────────────────────────
function getCycleForCard(cardName, referenceDate = new Date()) {
  const { statementDay, dueDay } = CARDS[cardName];
  const ref = new Date(referenceDate);
  const day = ref.getDate();
  const month = ref.getMonth();
  const year = ref.getFullYear();

  // Cycle ends on statementDay. If today > statementDay, current cycle end is this month's statementDay.
  // If today <= statementDay, current cycle end is last month's statementDay.
  let cycleEndMonth, cycleEndYear;
  if (day <= statementDay) {
    cycleEndMonth = month;
    cycleEndYear = year;
  } else {
    cycleEndMonth = month + 1;
    cycleEndYear = year;
    if (cycleEndMonth > 11) { cycleEndMonth = 0; cycleEndYear++; }
  }

  const cycleEnd = new Date(cycleEndYear, cycleEndMonth, statementDay);
  const cycleStart = new Date(cycleEndYear, cycleEndMonth - 1, statementDay + 1);
  if (cycleStart.getMonth() !== (cycleEndMonth - 1 + 12) % 12) {
    cycleStart.setDate(1);
    cycleStart.setMonth(cycleEndMonth);
  }

  // Due date is dueDay of month after statement
  const dueDate = new Date(cycleEndYear, cycleEndMonth + 1, dueDay);

  const daysLeft = Math.ceil((cycleEnd - ref) / (1000 * 60 * 60 * 24));
  const totalDays = Math.ceil((cycleEnd - cycleStart) / (1000 * 60 * 60 * 24));
  const daysIn = totalDays - daysLeft;
  const progress = Math.min(Math.max(daysIn / totalDays, 0), 1);

  return { cycleStart, cycleEnd, dueDate, daysLeft, totalDays, daysIn, progress };
}

function isInCycle(dateStr, cycleStart, cycleEnd) {
  const d = new Date(dateStr);
  return d >= cycleStart && d <= cycleEnd;
}

function fmtDate(d) {
  return d.toLocaleDateString("en-SG", { day: "numeric", month: "short" });
}

function calcCashback(card, amount, category) {
  const rules = CARDS[card]?.cashbackRules || [];
  for (const rule of rules) {
    if (rule.categories.includes("*") || rule.categories.includes(category)) {
      return amount * rule.rate;
    }
  }
  return amount * 0.003;
}

function getCardRecommendation(cardTotals, category) {
  const scores = Object.entries(CARDS).map(([card, def]) => {
    const capReached = def.cap && (cardTotals[card]?.cashback || 0) >= def.cap;
    let rate = 0.003;
    for (const r of def.cashbackRules) {
      if (r.categories.includes("*") || r.categories.includes(category)) { rate = r.rate; break; }
    }
    return { card, rate, capReached };
  });
  scores.sort((a, b) => {
    if (a.capReached && !b.capReached) return 1;
    if (!a.capReached && b.capReached) return -1;
    return b.rate - a.rate;
  });
  return scores[0];
}

const CATEGORIES = [
  ["Grab/Gojek/Tada","🚗"],["Food Delivery","🛵"],["Dining","🍜"],
  ["Groceries","🛒"],["Shopping","🛍️"],["Entertainment","🎬"],
  ["Transport","🚇"],["Gym/Telco/Streaming","📱"],["Other","💳"],
];

const SAMPLE_DATA = [
  { date: "2026-05-17", amount: "32",  category: "Grab/Gojek/Tada", card: "Citibank Cashback+", notes: "" },
  { date: "2026-05-17", amount: "18.50",category: "Dining",         card: "Maybank XL",         notes: "lunch" },
  { date: "2026-05-18", amount: "65",  category: "Shopping",        card: "UOB EVOL",           notes: "" },
  { date: "2026-05-18", amount: "12.90",category: "Food Delivery",  card: "Maybank XL",         notes: "" },
  { date: "2026-05-20", amount: "120", category: "Shopping",        card: "UOB EVOL",           notes: "Shopee" },
  { date: "2026-05-21", amount: "45",  category: "Dining",          card: "Maybank XL",         notes: "dinner" },
  { date: "2026-05-22", amount: "8",   category: "Transport",       card: "Citibank Cashback+", notes: "" },
];

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [expenses, setExpenses]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeTab, setActiveTab]   = useState("overview");
  const [refreshing, setRefreshing] = useState(false);
  const now = new Date();

  const fetchExpenses = useCallback(async () => {
    setRefreshing(true);
    try {
      const res  = await fetch(`/api/proxy`);
      const data = await res.json();
      setExpenses(data.rows || []);
    } catch {
      setExpenses(SAMPLE_DATA);
    }
    setLastUpdated(new Date());
    setRefreshing(false);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchExpenses();
    const t = setInterval(fetchExpenses, 60000);
    return () => clearInterval(t);
  }, [fetchExpenses]);

  // Build per-card totals based on each card's own billing cycle
  const cardData = {};
  for (const cardName of Object.keys(CARDS)) {
    const cycle   = getCycleForCard(cardName, now);
    const def     = CARDS[cardName];
    let total = 0, cashback = 0, items = [];

    // Fixed expenses (charged once per cycle)
    for (const f of FIXED_EXPENSES) {
      if (f.card === cardName) {
        total    += f.amount;
        cashback += calcCashback(cardName, f.amount, f.category);
        items.push({ ...f, fixed: true });
      }
    }
    // Variable expenses within this cycle
    for (const e of expenses) {
      if (e.card === cardName && isInCycle(e.date, cycle.cycleStart, cycle.cycleEnd)) {
        const amt = parseFloat(e.amount) || 0;
        total    += amt;
        cashback += calcCashback(cardName, amt, e.category);
        items.push(e);
      }
    }

    const capReached  = def.cap && cashback >= def.cap;
    const minMet      = !def.minSpend || total >= def.minSpend;
    const cashbackPct = def.cap ? Math.min((cashback / def.cap) * 100, 100) : null;
    const spendPct    = def.minSpend ? Math.min((total / def.minSpend) * 100, 100) : null;

    cardData[cardName] = { ...cycle, total, cashback, items, capReached, minMet, cashbackPct, spendPct };
  }

  const totalSpend    = Object.values(cardData).reduce((s, c) => s + c.total, 0);
  const totalCashback = Object.values(cardData).reduce((s, c) => s + c.cashback, 0);

  const s = { // shared styles
    card: { background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:20, padding:"18px 18px", position:"relative", overflow:"hidden" },
    label: { fontSize:11, color:"#555", textTransform:"uppercase", letterSpacing:"0.1em" },
    row: { display:"flex", justifyContent:"space-between", alignItems:"center" },
  };

  return (
    <div style={{ minHeight:"100vh", background:"#080810", fontFamily:"'DM Sans','SF Pro Display',-apple-system,sans-serif", color:"#F0F0F0" }}>
      <div style={{ position:"fixed", inset:0, zIndex:0, background:"radial-gradient(ellipse at 10% 0%, rgba(59,130,246,0.07) 0%, transparent 50%), radial-gradient(ellipse at 90% 100%, rgba(34,197,94,0.05) 0%, transparent 50%)", pointerEvents:"none" }} />

      <div style={{ position:"relative", zIndex:1, maxWidth:460, margin:"0 auto", padding:"20px 14px 90px" }}>

        {/* ── HEADER ── */}
        <div style={{ ...s.row, marginBottom:20 }}>
          <div>
            <div style={{ fontSize:11, letterSpacing:"0.15em", color:"#555", textTransform:"uppercase" }}>Cashback Tracker</div>
            <div style={{ fontSize:22, fontWeight:700, letterSpacing:"-0.02em", marginTop:2 }}>
              {now.toLocaleDateString("en-SG",{day:"numeric",month:"long",year:"numeric"})}
            </div>
          </div>
          <button onClick={fetchExpenses} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"7px 13px", color:"#888", fontSize:12, cursor:"pointer" }}>
            {refreshing ? "⟳" : "↻"} Sync
          </button>
        </div>

        {/* ── SUMMARY STRIP ── */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 }}>
          <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:"14px 16px" }}>
            <div style={s.label}>Total Spend</div>
            <div style={{ fontSize:26, fontWeight:700, marginTop:4 }}>${totalSpend.toFixed(0)}</div>
            <div style={{ fontSize:11, color:"#444", marginTop:2 }}>across active cycles</div>
          </div>
          <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:"14px 16px" }}>
            <div style={s.label}>Cashback Earned</div>
            <div style={{ fontSize:26, fontWeight:700, marginTop:4, color:"#22C55E" }}>${totalCashback.toFixed(2)}</div>
            <div style={{ fontSize:11, color:"#444", marginTop:2 }}>this cycle period</div>
          </div>
        </div>

        {/* ── TABS ── */}
        <div style={{ display:"flex", gap:3, marginBottom:18, background:"rgba(255,255,255,0.04)", borderRadius:12, padding:3 }}>
          {[["overview","Overview"],["strategy","Best Card"],["cycles","Cycles & Dues"],["breakdown","Breakdown"],["transactions","Transactions"]].map(([id,label]) => (
            <button key={id} onClick={() => setActiveTab(id)} style={{
              flex:1, padding:"7px 0", borderRadius:9, fontSize:12, fontWeight:500, cursor:"pointer",
              background: activeTab===id ? "rgba(255,255,255,0.1)" : "transparent",
              color: activeTab===id ? "#fff" : "#555", border:"none",
            }}>{label}</button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === "overview" && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {Object.entries(cardData).map(([cardName, data]) => {
              const def = CARDS[cardName];
              return (
                <div key={cardName} style={{ ...s.card, borderColor: data.capReached ? "rgba(239,68,68,0.35)" : "rgba(255,255,255,0.08)" }}>
                  <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:def.accent, borderRadius:"20px 20px 0 0" }} />

                  {/* Card header */}
                  <div style={{ ...s.row, marginBottom:14 }}>
                    <div>
                      <div style={{ fontSize:15, fontWeight:600 }}>{cardName}</div>
                      <div style={{ fontSize:11, color:"#555", marginTop:2 }}>{def.tip}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:22, fontWeight:700, color:"#22C55E" }}>${data.cashback.toFixed(2)}</div>
                      <div style={{ fontSize:11, color:"#444" }}>cashback</div>
                    </div>
                  </div>

                  {/* Cycle timeline bar */}
                  <div style={{ marginBottom:12 }}>
                    <div style={{ ...s.row, marginBottom:5 }}>
                      <span style={{ fontSize:11, color:"#555" }}>{fmtDate(data.cycleStart)} → {fmtDate(data.cycleEnd)}</span>
                      <span style={{ fontSize:11, color: data.daysLeft <= 3 ? "#EF4444" : data.daysLeft <= 7 ? "#F97316" : "#555" }}>
                        {data.daysLeft}d left {data.daysLeft <= 3 ? "⚠️" : ""}
                      </span>
                    </div>
                    <div style={{ height:4, background:"rgba(255,255,255,0.06)", borderRadius:99, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${data.progress*100}%`, background:`linear-gradient(90deg, ${def.accent}88, ${def.accent})`, borderRadius:99, transition:"width 0.6s" }} />
                    </div>
                  </div>

                  {/* Total spend */}
                  <div style={{ ...s.row, marginBottom:10 }}>
                    <span style={{ fontSize:13, color:"#666" }}>Cycle spend</span>
                    <span style={{ fontSize:13, fontWeight:600 }}>${data.total.toFixed(2)}</span>
                  </div>

                  {/* Cashback cap bar */}
                  {def.cap && (
                    <div style={{ marginBottom:10 }}>
                      <div style={{ ...s.row, marginBottom:4 }}>
                        <span style={{ fontSize:11, color:"#555" }}>Cashback cap</span>
                        <span style={{ fontSize:11, color: data.capReached ? "#EF4444" : data.cashbackPct > 75 ? "#F97316" : "#666" }}>
                          ${data.cashback.toFixed(2)} / ${def.cap} {data.capReached ? "· MAXED ⚠️" : `· $${(def.cap - data.cashback).toFixed(2)} left`}
                        </span>
                      </div>
                      <div style={{ height:6, background:"rgba(255,255,255,0.06)", borderRadius:99, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${data.cashbackPct}%`, background: data.capReached ? "#EF4444" : data.cashbackPct > 75 ? "#F97316" : def.accent, borderRadius:99, transition:"width 0.6s" }} />
                      </div>
                    </div>
                  )}

                  {/* Min spend bar */}
                  {def.minSpend > 0 && (
                    <div style={{ marginBottom:10 }}>
                      <div style={{ ...s.row, marginBottom:4 }}>
                        <span style={{ fontSize:11, color:"#555" }}>Min spend to unlock bonus</span>
                        <span style={{ fontSize:11, color: data.minMet ? "#22C55E" : "#666" }}>
                          ${data.total.toFixed(0)} / ${def.minSpend} {data.minMet ? "✓ Unlocked" : `· $${(def.minSpend - data.total).toFixed(0)} to go`}
                        </span>
                      </div>
                      <div style={{ height:6, background:"rgba(255,255,255,0.06)", borderRadius:99, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${data.spendPct}%`, background: data.minMet ? "#22C55E" : "#F97316", borderRadius:99, transition:"width 0.6s" }} />
                      </div>
                    </div>
                  )}

                  {/* Fixed expense pills */}
                  <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:6 }}>
                    {FIXED_EXPENSES.filter(f => f.card === cardName).map(f => (
                      <span key={f.name} style={{ fontSize:11, padding:"2px 8px", borderRadius:99, background:"rgba(255,255,255,0.05)", color:"#555" }}>
                        📌 {f.name} ${f.amount}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
            {lastUpdated && <div style={{ textAlign:"center", fontSize:11, color:"#333", marginTop:4 }}>Synced {lastUpdated.toLocaleTimeString("en-SG",{hour:"2-digit",minute:"2-digit"})} · updates every min</div>}
          </div>
        )}

        {/* ── STRATEGY TAB ── */}
        {activeTab === "strategy" && (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ fontSize:12, color:"#444", marginBottom:4 }}>Real-time recommendation based on your current cycle spend:</div>
            {CATEGORIES.map(([cat, emoji]) => {
              const best = getCardRecommendation(cardData, cat);
              const def  = CARDS[best.card];
              return (
                <div key={cat} style={{ ...s.row, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:"13px 15px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:18 }}>{emoji}</span>
                    <span style={{ fontSize:13, fontWeight:500 }}>{cat}</span>
                  </div>
                  <div style={{ padding:"4px 12px", borderRadius:99, fontSize:12, fontWeight:600, background: best.capReached ? "rgba(239,68,68,0.15)" : def.accentDim, color: best.capReached ? "#EF4444" : def.accent, border:`1px solid ${best.capReached ? "rgba(239,68,68,0.3)" : def.accentBorder}` }}>
                    {best.capReached ? "⚠️ Cap hit → use Citi" : best.card}
                  </div>
                </div>
              );
            })}
            <div style={{ height:1, background:"rgba(255,255,255,0.06)", margin:"8px 0" }} />
            <div style={{ fontSize:11, color:"#444", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:4 }}>Strategy notes</div>
            {Object.entries(CARDS).map(([name, def]) => (
              <div key={name} style={{ background:"rgba(255,255,255,0.02)", border:`1px solid ${def.accentBorder}`, borderRadius:14, padding:"13px 15px" }}>
                <div style={{ fontSize:13, fontWeight:600, color:def.accent, marginBottom:5 }}>{name}</div>
                <div style={{ fontSize:12, color:"#666", lineHeight:1.7 }}>{def.strategy}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── CYCLES & DUES TAB ── */}
        {activeTab === "cycles" && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ fontSize:12, color:"#444", marginBottom:4 }}>Your billing cycles and upcoming payment due dates:</div>
            {Object.entries(cardData).map(([cardName, data]) => {
              const def = CARDS[cardName];
              const daysUntilDue = Math.ceil((data.dueDate - now) / (1000*60*60*24));
              const daysUntilStatement = data.daysLeft;
              return (
                <div key={cardName} style={{ ...s.card }}>
                  <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:def.accent, borderRadius:"20px 20px 0 0" }} />
                  <div style={{ fontSize:15, fontWeight:600, marginBottom:14 }}>{cardName}</div>

                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                    <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:12, padding:"10px 12px" }}>
                      <div style={{ fontSize:10, color:"#444", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>Cycle</div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{fmtDate(data.cycleStart)}</div>
                      <div style={{ fontSize:11, color:"#555" }}>→ {fmtDate(data.cycleEnd)}</div>
                    </div>
                    <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:12, padding:"10px 12px" }}>
                      <div style={{ fontSize:10, color:"#444", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>Days left</div>
                      <div style={{ fontSize:20, fontWeight:700, color: daysUntilStatement <= 3 ? "#EF4444" : daysUntilStatement <= 7 ? "#F97316" : "#fff" }}>{daysUntilStatement}</div>
                      <div style={{ fontSize:11, color:"#555" }}>in cycle</div>
                    </div>
                  </div>

                  <div style={{ background: daysUntilDue <= 5 ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)", border:`1px solid ${daysUntilDue <= 5 ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.06)"}`, borderRadius:12, padding:"12px 14px" }}>
                    <div style={{ ...s.row }}>
                      <div>
                        <div style={{ fontSize:11, color:"#555", marginBottom:2 }}>Payment due</div>
                        <div style={{ fontSize:14, fontWeight:600 }}>{fmtDate(data.dueDate)}</div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:22, fontWeight:700, color: daysUntilDue <= 5 ? "#EF4444" : daysUntilDue <= 10 ? "#F97316" : "#22C55E" }}>{daysUntilDue}d</div>
                        <div style={{ fontSize:11, color:"#555" }}>until due {daysUntilDue <= 5 ? "⚠️" : ""}</div>
                      </div>
                    </div>
                    <div style={{ marginTop:10, ...s.row }}>
                      <span style={{ fontSize:12, color:"#555" }}>Amount to pay (est.)</span>
                      <span style={{ fontSize:13, fontWeight:600 }}>${data.total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── TRANSACTIONS TAB ── */}
        {activeTab === "transactions" && (
          <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
            <div style={{ fontSize:11, color:"#444", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:2 }}>Fixed Monthly</div>
            {FIXED_EXPENSES.map(f => (
              <div key={f.name} style={{ ...s.row, background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12, padding:"11px 14px" }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:500 }}>📌 {f.name}</div>
                  <div style={{ fontSize:11, color:"#444", marginTop:2 }}>{f.card} · {f.category}</div>
                </div>
                <div style={{ fontSize:14, fontWeight:600 }}>${f.amount.toFixed(2)}</div>
              </div>
            ))}

            <div style={{ fontSize:11, color:"#444", textTransform:"uppercase", letterSpacing:"0.1em", margin:"10px 0 2px" }}>
              Logged ({expenses.length})
            </div>
            {expenses.length === 0 ? (
              <div style={{ textAlign:"center", padding:"28px 0", color:"#333", fontSize:13 }}>
                No expenses logged yet.<br/>
                <span style={{ fontSize:12, display:"block", marginTop:6 }}>Tap your home screen widget to add one!</span>
              </div>
            ) : (
              [...expenses].reverse().map((e, i) => {
                const def = CARDS[e.card];
                return (
                  <div key={i} style={{ ...s.row, background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12, padding:"11px 14px" }}>
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ fontSize:13, fontWeight:500 }}>{e.category || "Other"}</span>
                        {def && <span style={{ fontSize:10, padding:"1px 7px", borderRadius:99, background:def.accentDim, color:def.accent }}>{e.card}</span>}
                      </div>
                      <div style={{ fontSize:11, color:"#444", marginTop:2 }}>{e.date}{e.notes ? ` · ${e.notes}` : ""}</div>
                    </div>
                    <div style={{ fontSize:14, fontWeight:600 }}>${parseFloat(e.amount).toFixed(2)}</div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── BREAKDOWN TAB ── */}
        {activeTab === "breakdown" && (() => {
          const catTotals = {};
          const catCards  = {};
          for (const [cat] of CATEGORIES) { catTotals[cat] = 0; catCards[cat] = {}; }

          for (const f of FIXED_EXPENSES) {
            const cat = f.category || "Other";
            catTotals[cat] = (catTotals[cat] || 0) + f.amount;
            catCards[cat]  = catCards[cat] || {};
            catCards[cat][f.card] = (catCards[cat][f.card] || 0) + f.amount;
          }

          for (const e of expenses) {
            const cycle = getCycleForCard(e.card, now);
            if (!isInCycle(e.date, cycle.cycleStart, cycle.cycleEnd)) continue;
            const cat = e.category || "Other";
            const amt = parseFloat(e.amount) || 0;
            catTotals[cat] = (catTotals[cat] || 0) + amt;
            catCards[cat]  = catCards[cat] || {};
            catCards[cat][e.card] = (catCards[cat][e.card] || 0) + amt;
          }

          const grandTotal = Object.values(catTotals).reduce((s, v) => s + v, 0);
          const sorted = CATEGORIES.map(([cat, emoji]) => ({ cat, emoji, total: catTotals[cat] || 0, cards: catCards[cat] || {} }))
            .filter(c => c.total > 0).sort((a, b) => b.total - a.total);
          const maxVal = sorted[0]?.total || 1;

          return (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ fontSize:12, color:"#444", marginBottom:4 }}>All spend within current billing cycles, grouped by category:</div>

              <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:20, padding:"16px 18px", marginBottom:4 }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                  {sorted.slice(0,6).map(({ cat, emoji, total }) => (
                    <div key={cat} style={{ textAlign:"center", padding:"10px 6px", background:"rgba(255,255,255,0.03)", borderRadius:12 }}>
                      <div style={{ fontSize:20, marginBottom:4 }}>{emoji}</div>
                      <div style={{ fontSize:13, fontWeight:600 }}>${total.toFixed(0)}</div>
                      <div style={{ fontSize:10, color:"#555", marginTop:2 }}>{grandTotal > 0 ? ((total/grandTotal)*100).toFixed(0) : 0}%</div>
                    </div>
                  ))}
                </div>
              </div>

              {sorted.map(({ cat, emoji, total, cards }) => {
                const pct = grandTotal > 0 ? (total / grandTotal) * 100 : 0;
                const barPct = (total / maxVal) * 100;
                return (
                  <div key={cat} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:"14px 16px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:18 }}>{emoji}</span>
                        <span style={{ fontSize:14, fontWeight:500 }}>{cat}</span>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <span style={{ fontSize:14, fontWeight:700 }}>${total.toFixed(2)}</span>
                        <span style={{ fontSize:11, color:"#555", marginLeft:6 }}>{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div style={{ height:6, background:"rgba(255,255,255,0.05)", borderRadius:99, marginBottom:8, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${barPct}%`, background:"linear-gradient(90deg,#3B82F6,#22C55E)", borderRadius:99, transition:"width 0.6s" }} />
                    </div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {Object.entries(cards).map(([card, amt]) => {
                        const def = CARDS[card];
                        return (
                          <span key={card} style={{ fontSize:11, padding:"2px 9px", borderRadius:99, background: def ? def.accentDim : "rgba(255,255,255,0.05)", color: def ? def.accent : "#666", border:`1px solid ${def ? def.accentBorder : "rgba(255,255,255,0.1)"}` }}>
                            {card.split(" ")[0]} ${amt.toFixed(0)}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {sorted.length === 0 && (
                <div style={{ textAlign:"center", padding:"30px 0", color:"#444", fontSize:13 }}>No spending data yet for this cycle.</div>
              )}

              <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:14, padding:"13px 16px", display:"flex", justifyContent:"space-between", marginTop:4 }}>
                <span style={{ fontSize:14, fontWeight:500 }}>Total this cycle</span>
                <span style={{ fontSize:14, fontWeight:700 }}>${grandTotal.toFixed(2)}</span>
              </div>
            </div>
          );
        })()}
      </div>

      <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:10, background:"linear-gradient(to top, #080810 60%, transparent)", padding:"16px", textAlign:"center", fontSize:11, color:"#2a2a3a" }}>
        Bookmark this page · syncs from your Google Sheet every minute
      </div>
    </div>
  );
}
