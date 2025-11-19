// =====================================
// Supabase Client Setup
// =====================================
const SUPABASE_URL = "https://laomecxehnfwikhhyehx.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxhb21lY3hlaG5md2lraGh5ZWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1MjA4ODcsImV4cCI6MjA3OTA5Njg4N30.Y1uw52DWGD2NSyqHcNqK-epk1gYPGwiCrRjOvfSwGMQ";

const supabaseLeaderboard = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

let currentUserLeaderboard = null;
let leaderboardData = [];

// =====================================
// AUTH / SESSION GUARD
// =====================================

async function getSupabaseClientLeaderboard() {
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

  const { error } = await supabaseLeaderboard.auth.setSession({
    access_token: authData.access_token,
    refresh_token: authData.refresh_token,
  });

  if (error) {
    console.error("Error restoring session (leaderboard):", error);
    window.location.href = "auth.html";
    return null;
  }

  const { data: userData, error: userError } =
    await supabaseLeaderboard.auth.getUser();
  if (userError || !userData?.user) {
    console.error("Error getting user (leaderboard):", userError);
    window.location.href = "auth.html";
    return null;
  }

  currentUserLeaderboard = userData.user;
  return supabaseLeaderboard;
}

// =====================================
// UTILITIES
// =====================================

function lbFormatMoney(value) {
  const num = Number(value) || 0;
  return `$${num.toFixed(2)}`;
}

// Accept the full entry object so we can use username or fallback to userId
function buildUserLabel(entry) {
  if (!entry) return "Unknown";

  // Prefer username from profiles table
  if (entry.username && entry.username.trim() !== "") {
    return entry.username.trim();
  }

  // Fallback: short user_id
  if (entry.userId && typeof entry.userId === "string") {
    return `${entry.userId.slice(0, 8)}…`;
  }

  return "Unknown";
}

// =====================================
// LOAD & BUILD LEADERBOARD
// =====================================

async function loadLeaderboard() {
  // Global leaderboard: no user_id filter
  const { data, error } = await supabaseLeaderboard
    .from("bonus_buys")
    .select("user_id, cost, win, profiles(username)");

  if (error) {
    console.error("Error loading leaderboard data:", error);
    renderLeaderboardError("Failed to load leaderboard.");
    return;
  }

  const rows = data || [];

  // Aggregate by user_id
  const byUser = new Map();

  for (const row of rows) {
    const userId = row.user_id;
    if (!userId) continue;

    const username = row.profiles?.username || null;

    const cost = Number(row.cost) || 0;
    const win = Number(row.win) || 0;
    const profit = win - cost;
    const multi = cost > 0 ? win / cost : 0;

    if (!byUser.has(userId)) {
      byUser.set(userId, {
        userId,
        username,
        totalNet: 0,
        totalWin: 0,
        totalCost: 0,
        totalBuys: 0,
        totalWins: 0,
        bestMulti: 0,
      });
    }

    const agg = byUser.get(userId);

    // If we didn’t have a username before but now we do, store it
    if (!agg.username && username) {
      agg.username = username;
    }

    agg.totalCost += cost;
    agg.totalWin += win;
    agg.totalNet += profit;
    agg.totalBuys += 1;
    if (win > 0) agg.totalWins += 1;
    if (multi > agg.bestMulti) agg.bestMulti = multi;
  }

  // Convert map → array and sort best → worst by net profit
  leaderboardData = Array.from(byUser.values());
  leaderboardData.sort((a, b) => b.totalNet - a.totalNet);

  renderLeaderboardTable();
}

// =====================================
// RENDER
// =====================================

function renderLeaderboardError(message) {
  const tbody = document.getElementById("leaderboard-table");
  if (!tbody) return;
  tbody.innerHTML = `
    <tr>
      <td colspan="6" style="text-align:center; padding:1rem; color: var(--muted);">
        ${message}
      </td>
    </tr>
  `;
}

function renderLeaderboardTable() {
  const tbody = document.getElementById("leaderboard-table");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!leaderboardData.length) {
    renderLeaderboardError(
      "No bonus buys recorded yet. Once users log hunts, they'll appear here."
    );
    return;
  }

  leaderboardData.forEach((entry, index) => {
    const tr = document.createElement("tr");

    const netClass =
      entry.totalNet > 0
        ? "profit-positive"
        : entry.totalNet < 0
        ? "profit-negative"
        : "";

    tr.innerHTML = `
      <td>#${index + 1}</td>
      <td>${buildUserLabel(entry)}</td>
      <td class="${netClass}">${lbFormatMoney(entry.totalNet)}</td>
      <td>${lbFormatMoney(entry.totalWin)}</td>
      <td>${entry.totalBuys}</td>
      <td>${entry.bestMulti.toFixed(2)}x</td>
    `;

    tbody.appendChild(tr);
  });
}

// =====================================
// INIT
// =====================================

document.addEventListener("DOMContentLoaded", async () => {
  const client = await getSupabaseClientLeaderboard();
  if (!client) return;

  await loadLeaderboard();
});