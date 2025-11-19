// =====================================
// Supabase Client Setup
// =====================================
const SUPABASE_URL = "https://laomecxehnfwikhhyehx.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxhb21lY3hlaG5md2lraGh5ZWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1MjA4ODcsImV4cCI6MjA3OTA5Njg4N30.Y1uw52DWGD2NSyqHcNqK-epk1gYPGwiCrRjOvfSwGMQ";

const supabaseProfile = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

let currentUserProfile = null;
let profileSessions = [];

// =====================================
// AUTH / SESSION GUARD
// =====================================

async function getSupabaseClientProfile() {
  const raw = localStorage.getItem("bbt_auth");
  if (!raw) {
    window.location.href = "auth.html";
    return null;
  }

  let authData;
  try {
    authData = JSON.parse(raw);
  } catch {
    window.location.href = "auth.html";
    return null;
  }

  if (!authData.access_token || !authData.refresh_token) {
    window.location.href = "auth.html";
    return null;
  }

  const { error } = await supabaseProfile.auth.setSession({
    access_token: authData.access_token,
    refresh_token: authData.refresh_token,
  });

  if (error) {
    console.error("Error restoring session (profile):", error);
    window.location.href = "auth.html";
    return null;
  }

  const { data: userData, error: userError } =
    await supabaseProfile.auth.getUser();
  if (userError || !userData?.user) {
    console.error("Error getting user (profile):", userError);
    window.location.href = "auth.html";
    return null;
  }

  currentUserProfile = userData.user;
  return supabaseProfile;
}

// =====================================
// UTILITIES
// =====================================

function pfFormatMoney(value) {
  const num = Number(value) || 0;
  return `$${num.toFixed(2)}`;
}

function mapBonusRowProfile(row) {
  const cost = Number(row.cost) || 0;
  const win = Number(row.win) || 0;
  const multiplier = cost > 0 ? win / cost : 0;
  const profit = win - cost;
  return {
    id: row.id,
    game: row.game || "",
    cost,
    win,
    profit,
    multiplier,
    bigWin: !!row.big_win,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

function getProviderForGame(gameName) {
  if (!window.SLOTS_DB || !gameName) return "Unknown";
  const lower = gameName.toLowerCase();
  const found = window.SLOTS_DB.find(
    (s) => s.name.toLowerCase() === lower
  );
  return found ? found.provider : "Unknown";
}

// =====================================
// LOAD & COMPUTE PROFILE DATA
// =====================================

async function loadProfileData() {
  if (!currentUserProfile) return;

  // Set basic account fields
  const emailEl = document.getElementById("profile-email");
  const idEl = document.getElementById("profile-user-id");
  if (emailEl) emailEl.textContent = currentUserProfile.email || "(no email)";
  if (idEl) idEl.textContent = currentUserProfile.id || "(no id)";

  const { data, error } = await supabaseProfile
    .from("sessions")
    .select("id, name, created_at, bonus_buys(id, game, cost, win, big_win, created_at)")
    .eq("user_id", currentUserProfile.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error loading profile sessions:", error);
    renderProfileFallback("profile-top-providers", ["Error loading data."]);
    renderProfileFallback("profile-session-summary", ["Error loading data."]);
    return;
  }

  profileSessions = (data || []).map((s) => ({
    id: s.id,
    name: s.name,
    createdAt: s.created_at,
    bonusBuys: (s.bonus_buys || []).map(mapBonusRowProfile),
  }));

  renderProfileOverview();
  renderTopProviders();
  renderSessionSummary();
}

function renderProfileOverview() {
  const totalSessionsEl = document.getElementById("profile-total-sessions");
  const totalBuysEl = document.getElementById("profile-total-bys") || document.getElementById("profile-total-buys");
  const alltimeNetEl = document.getElementById("profile-alltime-net");
  const topMultiEl = document.getElementById("profile-top-multi");

  const totalSessions = profileSessions.length;
  const allBuys = profileSessions.flatMap((s) => s.bonusBuys || []);
  const totalBuys = allBuys.length;
  const totalCost = allBuys.reduce((s, b) => s + b.cost, 0);
  const totalWin = allBuys.reduce((s, b) => s + b.win, 0);
  const net = totalWin - totalCost;

  const bestMulti = Math.max(
    0,
    ...allBuys.map((b) => (b.multiplier && isFinite(b.multiplier) ? b.multiplier : 0))
  );

  if (totalSessionsEl) totalSessionsEl.textContent = totalSessions.toString();
  if (totalBuysEl) totalBuysEl.textContent = totalBuys.toString();
  if (alltimeNetEl) alltimeNetEl.textContent = pfFormatMoney(net);
  if (topMultiEl) topMultiEl.textContent = `${bestMulti.toFixed(2)}x`;
}

// Top providers by total net profit (or play count if no net)
function renderTopProviders() {
  const listEl = document.getElementById("profile-top-providers");
  if (!listEl) return;

  listEl.innerHTML = "";

  const allBuys = profileSessions.flatMap((s) => s.bonusBuys || []);
  if (!allBuys.length) {
    renderProfileFallback("profile-top-providers", [
      "No bonus buys yet. Log your first session to see provider stats.",
    ]);
    return;
  }

  const byProvider = new Map(); // provider -> { provider, count, totalNet }

  for (const b of allBuys) {
    const provider = getProviderForGame(b.game);
    if (!byProvider.has(provider)) {
      byProvider.set(provider, { provider, count: 0, totalNet: 0 });
    }
    const agg = byProvider.get(provider);
    agg.count += 1;
    agg.totalNet += b.profit;
  }

  const arr = Array.from(byProvider.values());
  arr.sort((a, b) => b.totalNet - a.totalNet);

  const top5 = arr.slice(0, 5);

  top5.forEach((p) => {
    const li = document.createElement("li");
    const netClass =
      p.totalNet > 0
        ? "profit-positive"
        : p.totalNet < 0
        ? "profit-negative"
        : "";
    li.innerHTML = `
      <span>${p.provider}</span>
      <span style="float:right;">
        ${p.count} plays · <span class="${netClass}">${pfFormatMoney(
      p.totalNet
    )}</span>
      </span>
    `;
    listEl.appendChild(li);
  });
}

function renderProfileFallback(elementId, lines) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = "";
  lines.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    el.appendChild(li);
  });
}

// Best & worst sessions
function renderSessionSummary() {
  const listEl = document.getElementById("profile-session-summary");
  if (!listEl) return;

  listEl.innerHTML = "";

  if (!profileSessions.length) {
    renderProfileFallback("profile-session-summary", [
      "No sessions yet. Your best and worst hunts will appear here.",
    ]);
    return;
  }

  const sessionStats = profileSessions.map((s) => {
    const buys = s.bonusBuys || [];
    const totalCost = buys.reduce((sum, b) => sum + b.cost, 0);
    const totalWin = buys.reduce((sum, b) => sum + b.win, 0);
    const net = totalWin - totalCost;
    const bestMulti = Math.max(
      0,
      ...buys.map((b) => (b.multiplier && isFinite(b.multiplier) ? b.multiplier : 0))
    );
    return {
      id: s.id,
      name: s.name,
      createdAt: s.createdAt,
      totalBuys: buys.length,
      totalCost,
      totalWin,
      net,
      bestMulti,
    };
  });

  const bestSession = sessionStats.reduce((best, s) =>
    s.net > best.net ? s : best
  );
  const worstSession = sessionStats.reduce((worst, s) =>
    s.net < worst.net ? s : worst
  );

  const bestNetClass =
    bestSession.net > 0
      ? "profit-positive"
      : bestSession.net < 0
      ? "profit-negative"
      : "";
  const worstNetClass =
    worstSession.net > 0
      ? "profit-positive"
      : worstSession.net < 0
      ? "profit-negative"
      : "";

  const bestLi = document.createElement("li");
  bestLi.innerHTML = `
    <strong>Best Session:</strong> ${bestSession.name} 
    — Buys: ${bestSession.totalBuys}, 
    Net: <span class="${bestNetClass}">${pfFormatMoney(
      bestSession.net
    )}</span>, 
    Best Multi: ${bestSession.bestMulti.toFixed(2)}x
  `;

  const worstLi = document.createElement("li");
  worstLi.innerHTML = `
    <strong>Worst Session:</strong> ${worstSession.name} 
    — Buys: ${worstSession.totalBuys}, 
    Net: <span class="${worstNetClass}">${pfFormatMoney(
      worstSession.net
    )}</span>
  `;

  listEl.appendChild(bestLi);
  // Only show worst if there's more than one session,
  // or if it's the same as best but has negative net.
  if (sessionStats.length > 1 || worstSession.id !== bestSession.id) {
    listEl.appendChild(worstLi);
  }
}

// =====================================
// LOGOUT (Profile page)
// =====================================

async function handleProfileLogout(e) {
  e.preventDefault();

  try {
    // Sign out of Supabase for this client
    await supabaseProfile.auth.signOut();
  } catch (err) {
    console.error("Profile logout error:", err);
  }

  // Clear stored session tokens for the whole app
  localStorage.removeItem("bbt_auth");

  // Send user back to landing page
  window.location.href = "home.html";
}


// =====================================
// INIT
// =====================================

document.addEventListener("DOMContentLoaded", async () => {
  const client = await getSupabaseClientProfile();
  if (!client) return;

  const yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear().toString();
  }

  const logoutBtn = document.getElementById("profile-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleProfileLogout);
  }

  await loadProfileData();
});
