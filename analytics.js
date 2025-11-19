// =============================
// Supabase Client Setup
// =============================
const SUPABASE_URL = "https://laomecxehnfwikhhyehx.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxhb21lY3hlaG5md2lraGh5ZWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1MjA4ODcsImV4cCI6MjA3OTA5Njg4N30.Y1uw52DWGD2NSyqHcNqK-epk1gYPGwiCrRjOvfSwGMQ";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Chart instances
let profitOverTimeChartInstance = null;
let cumulativeProfitChartInstance = null;
let profitByGameChartInstance = null;
let weekdayChartInstance = null;
let hourChartInstance = null;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Ensure user logged in
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) {
      window.location.href = "auth.html";
      return;
    }

    // 1) Load sessions (for count)
    const { data: sessionRows, error: sessionError } = await supabase
      .from("sessions")
      .select("id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (sessionError) throw sessionError;

    // 2) Load bonus buys (core analytics data)
    const { data: buyRows, error: buyError } = await supabase
      .from("bonus_buys")
      .select("session_id, game, cost, win, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (buyError) throw buyError;

    const sessions = sessionRows || [];
    const buys = (buyRows || []).map(normalizeBuy);

    updateSummaryCards(buys, sessions);
    updateAdvancedMetrics(buys, sessions);

    renderProfitOverTimeChart(buys);
    renderCumulativeProfitChart(buys);
    renderProfitByGameChart(buys);
    renderWeekdayChart(buys);
    renderHourChart(buys);

    renderGameSummaryTable(buys);
    renderSessionListTable(buys);
  } catch (err) {
    console.error("Error loading analytics:", err);
    alert("Failed to load analytics. Open console for details.");
  }
});

// =============================
// Helpers
// =============================

function normalizeBuy(row) {
  const cost = toNumber(row.cost);
  const win = toNumber(row.win);
  const profit = win - cost;
  const created_at = row.created_at ? new Date(row.created_at) : new Date();
  const game = row.game || "Unknown";
  const session_id = row.session_id || null;

  return { ...row, cost, win, profit, created_at, game, session_id };
}

function toNumber(val) {
  const n = typeof val === "string" ? parseFloat(val) : Number(val);
  return isNaN(n) ? 0 : n;
}

function money(v) {
  return `$${v.toFixed(2)}`;
}

// =============================
// Summary & Advanced Metrics
// =============================

function updateSummaryCards(buys, sessions) {
  const totalSessions = sessions.length;
  const totalWagered = buys.reduce((sum, b) => sum + b.cost, 0);
  const netProfit = buys.reduce((sum, b) => sum + b.profit, 0);

  const wins = buys.filter((b) => b.profit > 0).length;
  const totalBuys = buys.length;
  const winRate = totalBuys > 0 ? (wins / totalBuys) * 100 : 0;

  setText("total-sessions", totalSessions.toString());
  setText("total-wagered", money(totalWagered));
  setText(
    "net-profit",
    `${netProfit >= 0 ? "+" : "-"}${money(Math.abs(netProfit))}`
  );
  setText("win-rate", `${winRate.toFixed(1)}%`);
}

function updateAdvancedMetrics(buys, sessions) {
  const totalBuys = buys.length;
  const totalSessions = sessions.length;

  if (totalBuys === 0) {
    setText("avg-bet", "-");
    setText("avg-profit-session", "-");
    setText("best-win", "-");
    setText("worst-loss", "-");
    setText("longest-win-streak", "0");
    setText("longest-loss-streak", "0");
    setText("volatility", "-");
    return;
  }

  const totalWagered = buys.reduce((sum, b) => sum + b.cost, 0);
  const netProfit = buys.reduce((sum, b) => sum + b.profit, 0);

  const avgBet = totalWagered / totalBuys;
  const avgProfitSession =
    totalSessions > 0 ? netProfit / totalSessions : netProfit;

  const bestWin = Math.max(...buys.map((b) => b.profit));
  const worstLoss = Math.min(...buys.map((b) => b.profit));

  const { longestWinStreak, longestLossStreak } = computeStreaks(buys);
  const volatility = computeStdDev(buys.map((b) => b.profit));

  setText("avg-bet", money(avgBet));
  setText(
    "avg-profit-session",
    `${avgProfitSession >= 0 ? "+" : "-"}${money(
      Math.abs(avgProfitSession)
    )}`
  );
  setText("best-win", money(bestWin));
  setText("worst-loss", `-${money(Math.abs(worstLoss))}`);
  setText("longest-win-streak", `${longestWinStreak} buys`);
  setText("longest-loss-streak", `${longestLossStreak} buys`);
  setText("volatility", money(volatility));
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function computeStreaks(buys) {
  let winStreak = 0;
  let lossStreak = 0;
  let longestWinStreak = 0;
  let longestLossStreak = 0;

  buys.forEach((b) => {
    if (b.profit > 0) {
      winStreak += 1;
      lossStreak = 0;
    } else if (b.profit < 0) {
      lossStreak += 1;
      winStreak = 0;
    } else {
      winStreak = 0;
      lossStreak = 0;
    }
    if (winStreak > longestWinStreak) longestWinStreak = winStreak;
    if (lossStreak > longestLossStreak) longestLossStreak = lossStreak;
  });

  return { longestWinStreak, longestLossStreak };
}

function computeStdDev(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

// =============================
// Charts (all based on buys)
// =============================

function renderProfitOverTimeChart(buys) {
  const canvas = document.getElementById("profitOverTimeChart");
  if (!canvas || buys.length === 0) return;

  const byDate = {};
  buys.forEach((b) => {
    const key = b.created_at.toISOString().slice(0, 10);
    byDate[key] = (byDate[key] || 0) + b.profit;
  });

  const labels = Object.keys(byDate).sort();
  const data = labels.map((l) => byDate[l]);

  if (profitOverTimeChartInstance) profitOverTimeChartInstance.destroy();

  profitOverTimeChartInstance = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Net Profit per Day",
          data,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    },
  });
}

function renderCumulativeProfitChart(buys) {
  const canvas = document.getElementById("cumulativeProfitChart");
  if (!canvas || buys.length === 0) return;

  let cumulative = 0;
  const labels = buys.map((b) => b.created_at.toISOString().slice(0, 10));
  const data = buys.map((b) => {
    cumulative += b.profit;
    return cumulative;
  });

  if (cumulativeProfitChartInstance) cumulativeProfitChartInstance.destroy();

  cumulativeProfitChartInstance = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Cumulative Bankroll",
          data,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    },
  });
}

function renderProfitByGameChart(buys) {
  const canvas = document.getElementById("profitByGameChart");
  if (!canvas || buys.length === 0) return;

  const perGame = {};
  buys.forEach((b) => {
    const game = b.game;
    perGame[game] = (perGame[game] || 0) + b.profit;
  });

  const sorted = Object.entries(perGame)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  const labels = sorted.map(([name]) => name);
  const data = sorted.map(([, profit]) => profit);

  if (profitByGameChartInstance) profitByGameChartInstance.destroy();

  profitByGameChartInstance = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Net Profit",
          data,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    },
  });
}

function renderWeekdayChart(buys) {
  const canvas = document.getElementById("weekdayChart");
  if (!canvas || buys.length === 0) return;

  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const profitByWeekday = Array(7).fill(0);

  buys.forEach((b) => {
    const day = b.created_at.getDay();
    profitByWeekday[day] += b.profit;
  });

  if (weekdayChartInstance) weekdayChartInstance.destroy();

  weekdayChartInstance = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: weekdayLabels,
      datasets: [
        {
          label: "Net Profit",
          data: profitByWeekday,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    },
  });
}

function renderHourChart(buys) {
  const canvas = document.getElementById("hourChart");
  if (!canvas || buys.length === 0) return;

  const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
  const profitByHour = Array(24).fill(0);

  buys.forEach((b) => {
    const hour = b.created_at.getHours();
    profitByHour[hour] += b.profit;
  });

  if (hourChartInstance) hourChartInstance.destroy();

  hourChartInstance = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Net Profit",
          data: profitByHour,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    },
  });
}

// =============================
// Tables
// =============================

function renderGameSummaryTable(buys) {
  const tbody = document.getElementById("game-summary-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (buys.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "No bonus buys yet.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const perGame = {};

  buys.forEach((b) => {
    const game = b.game;
    if (!perGame[game]) {
      perGame[game] = {
        buys: 0,
        sessions: new Set(),
        totalWagered: 0,
        netProfit: 0,
        wins: 0,
      };
    }
    const stats = perGame[game];
    stats.buys += 1;
    if (b.session_id) stats.sessions.add(b.session_id);
    stats.totalWagered += b.cost;
    stats.netProfit += b.profit;
    if (b.profit > 0) stats.wins += 1;
  });

  Object.entries(perGame).forEach(([game, stats]) => {
    const avgProfit = stats.netProfit / stats.buys;
    const winRate = stats.buys > 0 ? (stats.wins / stats.buys) * 100 : 0;
    const sessionCount = stats.sessions.size || 1;

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${game}</td>
      <td>${sessionCount}</td>
      <td>${money(stats.totalWagered)}</td>
      <td>${stats.netProfit >= 0 ? "+" : "-"}${money(
      Math.abs(stats.netProfit)
    )}</td>
      <td>${avgProfit >= 0 ? "+" : "-"}${money(Math.abs(avgProfit))}</td>
      <td>${winRate.toFixed(1)}%</td>
    `;

    tbody.appendChild(tr);
  });
}

function renderSessionListTable(buys) {
  const tbody = document.getElementById("session-list-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (buys.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.textContent = "No bonus buys yet.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  buys.forEach((b) => {
    const tr = document.createElement("tr");

    const dateStr = b.created_at.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    tr.innerHTML = `
      <td>${dateStr}</td>
      <td>${b.game}</td>
      <td>${money(b.cost)}</td>
      <td>${b.profit >= 0 ? "+" : "-"}${money(Math.abs(b.profit))}</td>
    `;

    tbody.appendChild(tr);
  });
}
