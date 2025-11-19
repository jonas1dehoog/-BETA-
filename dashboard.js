// =====================================
// Supabase Client Setup
// =====================================
const SUPABASE_URL = "https://laomecxehnfwikhhyehx.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxhb21lY3hlaG5md2lraGh5ZWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1MjA4ODcsImV4cCI6MjA3OTA5Njg4N30.Y1uw52DWGD2NSyqHcNqK-epk1gYPGwiCrRjOvfSwGMQ";

const supabaseDashboard = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// =====================================
// GLOBAL STATE
// =====================================
let currentUser = null;
let sessions = []; // [{ id, name, createdAt, bonusBuys: [...] }]
let activeSessionId = null;

// =====================================
// AUTH / SESSION GUARD
// =====================================
async function getSupabaseClientDashboard() {
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

  const { error } = await supabaseDashboard.auth.setSession({
    access_token: authData.access_token,
    refresh_token: authData.refresh_token,
  });

  if (error) {
    console.error("Error restoring session (dashboard):", error);
    window.location.href = "auth.html";
    return null;
  }

  const { data: userData, error: userError } =
    await supabaseDashboard.auth.getUser();

  if (userError || !userData?.user) {
    console.error("Error getting user (dashboard):", userError);
    window.location.href = "auth.html";
    return null;
  }

  currentUser = userData.user;
  return supabaseDashboard;
}

// =====================================
// UTILITIES
// =====================================
function formatMoney(value) {
  const num = Number(value) || 0;
  return `$${num.toFixed(2)}`;
}

function mapBonusRow(row) {
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

// =====================================
// AUTOCOMPLETE HELPERS (GAME FIELD)
// =====================================
let suggestionsVisible = false;

function getSlotSuggestions(query, limit = 10) {
  if (!window.SLOTS_DB || !query) return [];
  const q = query.toLowerCase();
  return window.SLOTS_DB.filter((s) =>
    s.name.toLowerCase().includes(q)
  ).slice(0, limit);
}

function renderSuggestions(list) {
  const container = document.getElementById("game-suggestions");
  if (!container) return;

  container.innerHTML = "";

  if (!list.length) {
    container.classList.add("hidden");
    suggestionsVisible = false;
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "suggestions-list";

  list.forEach((slot) => {
    const item = document.createElement("div");
    item.className = "suggestion-item";
    item.innerHTML = `
      <span>${slot.name}</span>
      <span class="provider">${slot.provider}</span>
    `;
    item.addEventListener("click", () => {
      const gameInput = document.getElementById("game");
      if (gameInput) {
        gameInput.value = slot.name;
        gameInput.focus();
      }
      container.classList.add("hidden");
      suggestionsVisible = false;
    });
    wrapper.appendChild(item);
  });

  container.appendChild(wrapper);
  container.classList.remove("hidden");
  suggestionsVisible = true;
}

// =====================================
// MODAL HELPERS (DYNAMIC POPUPS)
// =====================================
function showModal({
  title,
  bodyHTML,
  confirmText = "Save",
  confirmClass = "",
  showCancel = true,
  onConfirm,
}) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const modal = document.createElement("div");
  modal.className = "modal";

  modal.innerHTML = `
    <div class="modal-header">
      <h3>${title}</h3>
      <span class="modal-close">&times;</span>
    </div>
    <div class="modal-body">
      ${bodyHTML || ""}
    </div>
    <div class="modal-actions">
      ${
        showCancel
          ? '<button class="btn btn-ghost modal-cancel">Cancel</button>'
          : ""
      }
      <button class="btn btn-ghost ${confirmClass} modal-confirm">${confirmText}</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  function close() {
    if (document.body.contains(overlay)) {
      document.body.removeChild(overlay);
    }
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      close();
    }
  });

  const closeBtn = modal.querySelector(".modal-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      close();
    });
  }

  const cancelBtn = modal.querySelector(".modal-cancel");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", (e) => {
      e.preventDefault();
      close();
    });
  }

  const confirmBtn = modal.querySelector(".modal-confirm");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      if (typeof onConfirm === "function") {
        await onConfirm(modal);
      }
      close();
    });
  }
}

function showConfirm({
  title,
  message,
  confirmText = "Delete",
  confirmClass = "modal-confirm-delete",
  onConfirm,
}) {
  showModal({
    title,
    bodyHTML: `<p class="modal-delete-text">${message}</p>`,
    confirmText,
    confirmClass,
    showCancel: true,
    onConfirm,
  });
}

// =====================================
// LOAD & RENDER SESSIONS / BUYS
// =====================================
async function loadSessions() {
  if (!currentUser) return;

  const { data, error } = await supabaseDashboard
    .from("sessions")
    .select(
      "id, name, created_at, bonus_buys(id, game, cost, win, big_win, created_at)"
    )
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error loading sessions:", error);
    return;
  }

  sessions = (data || []).map((s) => ({
    id: s.id,
    name: s.name,
    createdAt: s.created_at,
    bonusBuys: (s.bonus_buys || []).map(mapBonusRow),
  }));

  // Restore active session from localStorage or fallback to first
  const storedId = localStorage.getItem("bbt_active_session_id");
  if (storedId && sessions.some((s) => s.id === storedId)) {
    activeSessionId = storedId;
  } else if (sessions.length > 0) {
    activeSessionId = sessions[0].id;
    localStorage.setItem("bbt_active_session_id", activeSessionId);
  } else {
    activeSessionId = null;
    localStorage.removeItem("bbt_active_session_id");
  }

  renderSessionSelect();
  renderDashboard();
}

function getActiveSession() {
  if (!activeSessionId) return null;
  return sessions.find((s) => s.id === activeSessionId) || null;
}

function renderSessionSelect() {
  const select = document.getElementById("session-select");
  if (!select) return;

  select.innerHTML = "";

  if (!sessions.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No sessions yet – create one";
    select.appendChild(opt);
    select.disabled = true;
    return;
  }

  select.disabled = false;

  sessions.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    if (s.id === activeSessionId) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

function renderDashboard() {
  renderStats();
  renderBonusTable();
}

function renderStats() {
  const session = getActiveSession();
  const totalBuysEl = document.getElementById("stat-total-buys");
  const totalCostEl = document.getElementById("stat-total-cost");
  const totalWinEl = document.getElementById("stat-total-win");
  const netEl = document.getElementById("stat-net");

  if (!session) {
    if (totalBuysEl) totalBuysEl.textContent = "0";
    if (totalCostEl) totalCostEl.textContent = "$0.00";
    if (totalWinEl) totalWinEl.textContent = "$0.00";
    if (netEl) {
      netEl.textContent = "$0.00";
      netEl.className = "value";
    }
    return;
  }

  const totalBuys = session.bonusBuys.length;
  const totalCost = session.bonusBuys.reduce((sum, b) => sum + b.cost, 0);
  const totalWin = session.bonusBuys.reduce((sum, b) => sum + b.win, 0);
  const net = totalWin - totalCost;

  if (totalBuysEl) totalBuysEl.textContent = totalBuys.toString();
  if (totalCostEl) totalCostEl.textContent = formatMoney(totalCost);
  if (totalWinEl) totalWinEl.textContent = formatMoney(totalWin);

  if (netEl) {
    netEl.textContent = formatMoney(net);
    if (net > 0) {
      netEl.className = "value profit-positive";
    } else if (net < 0) {
      netEl.className = "value profit-negative";
    } else {
      netEl.className = "value";
    }
  }
}

function renderBonusTable() {
  const tbody = document.getElementById("bonus-table");
  if (!tbody) return;

  tbody.innerHTML = "";

  const session = getActiveSession();
  if (!session) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td colspan="7" style="text-align:center; padding:1rem; color: var(--muted);">
        No active session. Create one to start tracking bonus buys.
      </td>
    `;
    tbody.appendChild(tr);
    return;
  }

  if (!session.bonusBuys.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td colspan="7" style="text-align:center; padding:1rem; color: var(--muted);">
        No buys in this session yet. Add your first bonus buy above.
      </td>
    `;
    tbody.appendChild(tr);
    return;
  }

  session.bonusBuys
    .slice()
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .forEach((b) => {
      const tr = document.createElement("tr");
      if (b.bigWin) {
        tr.classList.add("big-win-row");
      }

      const profitClass =
        b.profit > 0 ? "profit-positive" : b.profit < 0 ? "profit-negative" : "";
      const profitText = formatMoney(b.profit);
      const multiText = b.multiplier ? b.multiplier.toFixed(2) + "x" : "–";
      const winText = b.win > 0 ? formatMoney(b.win) : "–";

      tr.innerHTML = `
        <td>${b.game}</td>
        <td>${formatMoney(b.cost)}</td>
        <td>
          <div class="flex-between">
            <span>${winText}</span>
            <button class="btn btn-ghost small" data-edit-buy-id="${b.id}">
              Edit
            </button>
          </div>
        </td>
        <td class="${profitClass}">${profitText}</td>
        <td>${multiText}</td>
        <td>${b.bigWin ? "⭐" : ""}</td>
        <td>
          <button class="btn btn-ghost small modal-confirm-delete" data-delete-buy-id="${b.id}">
            Delete
          </button>
        </td>
      `;

      tbody.appendChild(tr);
    });
}

// =====================================
// EVENT HANDLERS
// =====================================

function setupSessionSelect() {
  const select = document.getElementById("session-select");
  if (!select) return;

  select.addEventListener("change", (e) => {
    const value = e.target.value;
    activeSessionId = value || null;
    if (activeSessionId) {
      localStorage.setItem("bbt_active_session_id", activeSessionId);
    } else {
      localStorage.removeItem("bbt_active_session_id");
    }
    renderDashboard();
  });
}

function setupNewSessionButton() {
  const btn = document.getElementById("new-session-btn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    showModal({
      title: "New Session",
      confirmText: "Create",
      bodyHTML: `
        <form>
          <div class="form-row">
            <label>Session Name</label>
            <input id="new-session-name" type="text" placeholder="e.g. Friday Night Hunt" />
            <p class="hint">Give this hunt a name so you can find it later.</p>
          </div>
        </form>
      `,
      onConfirm: async (modalEl) => {
        const input = modalEl.querySelector("#new-session-name");
        let name = (input && input.value.trim()) || "";
        if (!name) {
          name = "New Session";
        }

        if (!currentUser) return;

        const { data, error } = await supabaseDashboard
          .from("sessions")
          .insert({
            user_id: currentUser.id,
            name,
          })
          .select("id, name, created_at")
          .single();

        if (error) {
          console.error("Error creating session:", error);
          alert("Failed to create session.");
          return;
        }

        sessions.push({
          id: data.id,
          name: data.name,
          createdAt: data.created_at,
          bonusBuys: [],
        });

        activeSessionId = data.id;
        localStorage.setItem("bbt_active_session_id", activeSessionId);
        renderSessionSelect();
        renderDashboard();
      },
    });
  });
}

function setupDeleteSessionButton() {
  const btn = document.getElementById("delete-session-btn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const session = getActiveSession();
    if (!session) {
      alert("No active session to delete.");
      return;
    }

    showConfirm({
      title: "Delete Session",
      message:
        "Are you sure you want to delete this entire session and all its bonus buys? This cannot be undone.",
      confirmText: "Delete Session",
      onConfirm: async () => {
        if (!currentUser || !session) return;

        const { error: buysError } = await supabaseDashboard
          .from("bonus_buys")
          .delete()
          .eq("user_id", currentUser.id)
          .eq("session_id", session.id);

        if (buysError) {
          console.error("Error deleting bonus buys:", buysError);
          alert("Failed to delete session bonus buys.");
          return;
        }

        const { error: sessionError } = await supabaseDashboard
          .from("sessions")
          .delete()
          .eq("id", session.id)
          .eq("user_id", currentUser.id);

        if (sessionError) {
          console.error("Error deleting session:", sessionError);
          alert("Failed to delete session.");
          return;
        }

        sessions = sessions.filter((s) => s.id !== session.id);

        if (sessions.length > 0) {
          activeSessionId = sessions[0].id;
          localStorage.setItem("bbt_active_session_id", activeSessionId);
        } else {
          activeSessionId = null;
          localStorage.removeItem("bbt_active_session_id");
        }

        renderSessionSelect();
        renderDashboard();
      },
    });
  });
}

// Add bonus buy
function setupBonusForm() {
  const form = document.getElementById("bonus-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const session = getActiveSession();
    if (!session) {
      alert("Create a session first.");
      return;
    }

    const gameInput = document.getElementById("game");
    const costInput = document.getElementById("cost");
    const winInput = document.getElementById("win");

    const game = gameInput ? gameInput.value.trim() : "";
    const cost = costInput ? Number(costInput.value) : 0;
    const winVal = winInput && winInput.value !== "" ? Number(winInput.value) : 0;

    if (!game || !cost) {
      alert("Game and cost are required.");
      return;
    }

    if (!currentUser) return;

    const { data, error } = await supabaseDashboard
      .from("bonus_buys")
      .insert({
        user_id: currentUser.id,
        session_id: session.id,
        game,
        cost,
        win: winVal,
        big_win: false,
      })
      .select("id, game, cost, win, big_win, created_at")
      .single();

    if (error) {
      console.error("Error adding bonus buy:", error);
      alert("Failed to add bonus buy.");
      return;
    }

    const mapped = mapBonusRow(data);
    session.bonusBuys.push(mapped);

    if (gameInput) gameInput.value = "";
    if (costInput) costInput.value = "";
    if (winInput) winInput.value = "";

    renderDashboard();
  });
}

// Edit buy
function openEditBuyModal(buy) {
  showModal({
    title: `Edit ${buy.game}`,
    confirmText: "Save",
    bodyHTML: `
      <form>
        <div class="form-row">
          <label>Win Amount</label>
          <input
            id="edit-win-input"
            type="number"
            step="0.01"
            value="${buy.win || ""}"
            placeholder="Enter win amount"
          />
          <p class="hint">You can leave this as 0 if it was a no-win.</p>
        </div>
        <div class="form-row">
          <label>Big Win?</label>
          <select id="edit-bigwin-select">
            <option value="false" ${!buy.bigWin ? "selected" : ""}>No</option>
            <option value="true" ${buy.bigWin ? "selected" : ""}>Yes</option>
          </select>
          <p class="hint">Mark this as a standout hit (e.g. 200x+).</p>
        </div>
      </form>
    `,
    onConfirm: async (modalEl) => {
      const winField = modalEl.querySelector("#edit-win-input");
      const bigWinField = modalEl.querySelector("#edit-bigwin-select");

      const winRaw = winField ? winField.value.trim() : "";
      const winVal = winRaw === "" ? 0 : Number(winRaw);
      const bigWinVal = bigWinField ? bigWinField.value === "true" : false;

      if (Number.isNaN(winVal)) {
        alert("Invalid win amount.");
        return;
      }

      if (!currentUser) return;

      const { error } = await supabaseDashboard
        .from("bonus_buys")
        .update({
          win: winVal,
          big_win: bigWinVal,
        })
        .eq("id", buy.id)
        .eq("user_id", currentUser.id);

      if (error) {
        console.error("Error updating buy:", error);
        alert("Failed to update bonus buy.");
        return;
      }

      const session = getActiveSession();
      if (!session) return;
      const idx = session.bonusBuys.findIndex((b) => b.id === buy.id);
      if (idx !== -1) {
        const updated = {
          ...session.bonusBuys[idx],
          win: winVal,
          bigWin: bigWinVal,
          profit: winVal - session.bonusBuys[idx].cost,
          multiplier:
            session.bonusBuys[idx].cost > 0
              ? winVal / session.bonusBuys[idx].cost
              : 0,
        };
        session.bonusBuys[idx] = updated;
      }

      renderDashboard();
    },
  });
}

// Delete buy
function openDeleteBuyModal(buy) {
  showConfirm({
    title: "Delete Bonus Buy",
    message: `Delete this buy on <strong>${buy.game}</strong>? This cannot be undone.`,
    confirmText: "Delete Buy",
    onConfirm: async () => {
      if (!currentUser) return;

      const { error } = await supabaseDashboard
        .from("bonus_buys")
        .delete()
        .eq("id", buy.id)
        .eq("user_id", currentUser.id);

      if (error) {
        console.error("Error deleting buy:", error);
        alert("Failed to delete buy.");
        return;
      }

      const session = getActiveSession();
      if (!session) return;
      session.bonusBuys = session.bonusBuys.filter((b) => b.id !== buy.id);
      renderDashboard();
    },
  });
}

// Table action buttons
function setupTableActions() {
  const tbody = document.getElementById("bonus-table");
  if (!tbody) return;

  tbody.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const editId = target.getAttribute("data-edit-buy-id");
    const deleteId = target.getAttribute("data-delete-buy-id");

    const session = getActiveSession();
    if (!session) return;

    if (editId) {
      const buy = session.bonusBuys.find((b) => b.id === editId);
      if (!buy) return;
      openEditBuyModal(buy);
    } else if (deleteId) {
      const buy = session.bonusBuys.find((b) => b.id === deleteId);
      if (!buy) return;
      openDeleteBuyModal(buy);
    }
  });
}

// =====================================
// AUTOCOMPLETE BINDINGS
// =====================================
function setupGameAutocomplete() {
  const gameInput = document.getElementById("game");
  const suggestionsEl = document.getElementById("game-suggestions");
  if (!gameInput || !suggestionsEl) return;

  gameInput.addEventListener("input", (e) => {
    const q = e.target.value.trim();
    if (!q) {
      renderSuggestions([]);
      return;
    }
    const res = getSlotSuggestions(q);
    renderSuggestions(res);
  });

  gameInput.addEventListener("focus", () => {
    const q = gameInput.value.trim();
    if (!q) return;
    const res = getSlotSuggestions(q);
    renderSuggestions(res);
  });

  gameInput.addEventListener("blur", () => {
    setTimeout(() => {
      if (suggestionsEl) {
        suggestionsEl.classList.add("hidden");
        suggestionsVisible = false;
      }
    }, 150);
  });
}

// =====================================
// INIT
// =====================================
document.addEventListener("DOMContentLoaded", async () => {
  const client = await getSupabaseClientDashboard();
  if (!client) return;

  const yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear().toString();
  }

  setupSessionSelect();
  setupNewSessionButton();
  setupDeleteSessionButton();
  setupBonusForm();
  setupTableActions();
  setupGameAutocomplete();

  await loadSessions();
});
