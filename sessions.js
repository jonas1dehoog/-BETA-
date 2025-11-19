// =====================================
// Supabase Client Setup
// =====================================
const SUPABASE_URL = "https://laomecxehnfwikhhyehx.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxhb21lY3hlaG5md2lraGh5ZWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1MjA4ODcsImV4cCI6MjA3OTA5Njg4N30.Y1uw52DWGD2NSyqHcNqK-epk1gYPGwiCrRjOvfSwGMQ";

const supabaseSessions = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

let currentUser = null;
let sessionsHistory = []; // [{ id, name, createdAt, bonusBuys: [...] }]
let sessionToDeleteId = null;

// =====================================
// AUTH / SESSION GUARD
// =====================================

async function getSupabaseClientSessions() {
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

  const { error } = await supabaseSessions.auth.setSession({
    access_token: authData.access_token,
    refresh_token: authData.refresh_token,
  });

  if (error) {
    console.error("Error restoring session (history):", error);
    window.location.href = "auth.html";
    return null;
  }

  const { data: userData, error: userError } =
    await supabaseSessions.auth.getUser();
  if (userError || !userData?.user) {
    console.error("Error getting user (history):", userError);
    window.location.href = "auth.html";
    return null;
  }

  currentUser = userData.user;
  return supabaseSessions;
}

// =====================================
// UTILITIES
// =====================================

function formatMoney(value) {
  const num = Number(value) || 0;
  return `$${num.toFixed(2)}`;
}

function mapBonusRowHistory(row) {
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

function sessionStats(session) {
  const buys = session.bonusBuys || [];
  const totalBuys = buys.length;
  const totalCost = buys.reduce((s, b) => s + b.cost, 0);
  const totalWin = buys.reduce((s, b) => s + b.win, 0);
  const net = totalWin - totalCost;
  const bestMulti = Math.max(
    0,
    ...buys.map((b) => (b.multiplier && isFinite(b.multiplier) ? b.multiplier : 0))
  );
  return { totalBuys, totalCost, totalWin, net, bestMulti };
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// =====================================
// LOAD & RENDER SESSIONS HISTORY
// =====================================

async function loadSessionsHistory() {
  if (!currentUser) return;

  const { data, error } = await supabaseSessions
    .from("sessions")
    .select("id, name, created_at, bonus_buys(id, game, cost, win, big_win, created_at)")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading session history:", error);
    return;
  }

  sessionsHistory = (data || []).map((s) => ({
    id: s.id,
    name: s.name,
    createdAt: s.created_at,
    bonusBuys: (s.bonus_buys || []).map(mapBonusRowHistory),
  }));

  renderSessionsList();
}

function renderSessionsList() {
  const container = document.getElementById("session-history-list");
  if (!container) return;

  container.innerHTML = "";

  if (!sessionsHistory.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.style.padding = "1rem 0";
    empty.style.textAlign = "center";
    empty.textContent = "No sessions yet. Create a hunt from the Dashboard.";
    container.appendChild(empty);
    return;
  }

  sessionsHistory.forEach((s, index) => {
    const stats = sessionStats(s);

    const wrapper = document.createElement("div");
    wrapper.className = "session-item";
    wrapper.setAttribute("data-session-id", s.id);

    const created = new Date(s.createdAt);
    const dateStr = created.toLocaleString();

    const netClass =
      stats.net > 0 ? "profit-positive" : stats.net < 0 ? "profit-negative" : "";

    wrapper.innerHTML = `
      <div>
        <div class="title">Session ${sessionsHistory.length - index}: ${s.name}</div>
        <div class="meta">
          ${stats.totalBuys} buys · 
          Spent ${formatMoney(stats.totalCost)} · 
          Won ${formatMoney(stats.totalWin)} · 
          <span class="${netClass}">Net ${formatMoney(stats.net)}</span> · 
          Best ${stats.bestMulti.toFixed(2)}x · 
          ${dateStr}
        </div>
      </div>
      <div style="display:flex; gap:0.4rem;">
        <button class="btn btn-ghost small" data-open-session-id="${s.id}">
          Open
        </button>
        <button class="btn btn-ghost small modal-confirm-delete" data-delete-session-id="${s.id}">
          Delete
        </button>
      </div>
    `;

    container.appendChild(wrapper);
  });
}

// =====================================
// DELETE SESSION (with static modal)
// =====================================

function setupDeleteSessionModal() {
  const modal = document.getElementById("delete-session-modal");
  if (!modal) return;

  const confirmBtn = document.getElementById("confirm-delete-session-history");
  const closeEls = modal.querySelectorAll("[data-close-modal='delete-session-modal'], .modal-close");

  function closeModal() {
    modal.classList.add("hidden");
    sessionToDeleteId = null;
  }

  closeEls.forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      closeModal();
    });
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  if (confirmBtn) {
    confirmBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!sessionToDeleteId || !currentUser) return;

      // Delete buys first
      const { error: buysError } = await supabaseSessions
        .from("bonus_buys")
        .delete()
        .eq("user_id", currentUser.id)
        .eq("session_id", sessionToDeleteId);

      if (buysError) {
        console.error("Error deleting buys for session:", buysError);
        alert("Failed to delete session buys.");
        return;
      }

      const { error: sessionError } = await supabaseSessions
        .from("sessions")
        .delete()
        .eq("id", sessionToDeleteId)
        .eq("user_id", currentUser.id);

      if (sessionError) {
        console.error("Error deleting session:", sessionError);
        alert("Failed to delete session.");
        return;
      }

      sessionsHistory = sessionsHistory.filter((s) => s.id !== sessionToDeleteId);

      // If we just deleted the active session, clear it from localStorage
      const activeId = localStorage.getItem("bbt_active_session_id");
      if (activeId && activeId === sessionToDeleteId) {
        localStorage.removeItem("bbt_active_session_id");
      }

      closeModal();
      renderSessionsList();
    });
  }
}

function openDeleteSessionModal(id) {
  sessionToDeleteId = id;
  const modal = document.getElementById("delete-session-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
}

// =====================================
// EXPORT / IMPORT
// =====================================

function handleExport() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    sessions: sessionsHistory.map((s) => ({
      id: s.id,
      name: s.name,
      createdAt: s.createdAt,
      bonusBuys: (s.bonusBuys || []).map((b) => ({
        id: b.id,
        game: b.game,
        cost: b.cost,
        win: b.win,
        bigWin: b.bigWin,
        createdAt: b.createdAt,
      })),
    })),
  };

  downloadJSON(payload, "bonusbuytracker_sessions.json");
}

async function handleImport(file) {
  if (!file) return;
  if (!currentUser) {
    alert("You must be logged in to import sessions.");
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (!parsed.sessions || !Array.isArray(parsed.sessions)) {
      alert("Invalid JSON format. Expected { sessions: [...] }.");
      return;
    }

    const ok = confirm(
      "Import sessions from this file? This will ADD new sessions to your account."
    );
    if (!ok) return;

    for (const s of parsed.sessions) {
      const { data: sessionData, error: sessionError } = await supabaseSessions
        .from("sessions")
        .insert({
          user_id: currentUser.id,
          name: s.name || "Imported Session",
          created_at: s.createdAt || undefined,
        })
        .select("id, name, created_at")
        .single();

      if (sessionError || !sessionData) {
        console.error("Error importing session:", sessionError);
        continue;
      }

      const newSessionId = sessionData.id;

      const buysToInsert = (s.bonusBuys || []).map((b) => ({
        user_id: currentUser.id,
        session_id: newSessionId,
        game: b.game || "",
        cost: b.cost || 0,
        win: b.win || 0,
        big_win: !!b.bigWin,
        created_at: b.createdAt || undefined,
      }));

      if (buysToInsert.length) {
        const { error: buysError } = await supabaseSessions
          .from("bonus_buys")
          .insert(buysToInsert);
        if (buysError) {
          console.error("Error importing buys:", buysError);
        }
      }
    }

    await loadSessionsHistory();
    alert("Import complete.");
  } catch (err) {
    console.error("Import error:", err);
    alert("Error reading or importing file.");
  }
}

// =====================================
// EVENT BINDINGS
// =====================================

function setupHistoryEvents() {
  const container = document.getElementById("session-history-list");
  if (container) {
    container.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const openId = target.getAttribute("data-open-session-id");
      const deleteId = target.getAttribute("data-delete-session-id");

      if (openId) {
        // Save selected session and go to dashboard
        localStorage.setItem("bbt_active_session_id", openId);
        window.location.href = "index.html";
      } else if (deleteId) {
        openDeleteSessionModal(deleteId);
      }
    });
  }

  const exportBtn = document.getElementById("btn-export");
  const importInput = document.getElementById("import-file");

  if (exportBtn) {
    exportBtn.addEventListener("click", (e) => {
      e.preventDefault();
      handleExport();
    });
  }

  if (importInput) {
    importInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        handleImport(file);
      }
      // reset input so you can re-import the same file if needed
      e.target.value = "";
    });
  }
}

// =====================================
// INIT
// =====================================

document.addEventListener("DOMContentLoaded", async () => {
  const client = await getSupabaseClientSessions();
  if (!client) return;

  const yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear().toString();
  }

  setupHistoryEvents();
  setupDeleteSessionModal();
  await loadSessionsHistory();
});
