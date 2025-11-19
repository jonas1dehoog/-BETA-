// =====================================
// Supabase Client Setup
// =====================================
const SUPABASE_URL = "https://laomecxehnfwikhhyehx.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxhb21lY3hlaG5md2lraGh5ZWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1MjA4ODcsImV4cCI6MjA3OTA5Njg4N30.Y1uw52DWGD2NSyqHcNqK-epk1gYPGwiCrRjOvfSwGMQ";


const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Front-end fallback invite code (you can change this or leave blank)
// Backend enforcement is done via Supabase RPC `consume_invite_code`.
const SIGNUP_CODE = "NUKE123";

// =====================================
// Helpers
// =====================================

function showMessage(elementId, text, isError = false) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = text || "";
  el.style.color = isError ? "#ff4f7a" : "#21f3ff";
}

function saveSession(authData) {
  if (!authData || !authData.session) return;
  const { access_token, refresh_token } = authData.session;
  localStorage.setItem(
    "bbt_auth",
    JSON.stringify({
      access_token,
      refresh_token,
    })
  );
}

// If user already logged in, bounce them to dashboard
async function checkExistingSession() {
  const raw = localStorage.getItem("bbt_auth");
  if (!raw) return;

  try {
    const tokens = JSON.parse(raw);
    if (!tokens.access_token || !tokens.refresh_token) return;

    const { error } = await supabase.auth.setSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });

    if (error) {
      console.warn("Failed to restore saved session:", error.message);
      localStorage.removeItem("bbt_auth");
      return;
    }

    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data?.user) {
      console.warn("No valid user for saved session:", userError);
      localStorage.removeItem("bbt_auth");
      return;
    }

    // Session is valid → go to dashboard
    window.location.href = "index.html";
  } catch (err) {
    console.error("Error parsing saved auth:", err);
    localStorage.removeItem("bbt_auth");
  }
}

// =====================================
// LOGIN
// =====================================

async function handleLogin(e) {
  e.preventDefault();
  const email = (document.getElementById("login-email") || {}).value;
  const password = (document.getElementById("login-password") || {}).value;

  if (!email || !password) {
    showMessage("login-message", "Enter email and password.", true);
    return;
  }

  showMessage("login-message", "Logging in...");

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("Login error:", error);
    showMessage("login-message", error.message || "Login failed.", true);
    return;
  }

  saveSession(data);
  showMessage("login-message", "Login successful. Redirecting...");
  window.location.href = "index.html";
}

// =====================================
// SIGNUP (with invite code)
// =====================================

async function handleSignup(e) {
  e.preventDefault();

  const email = (document.getElementById("signup-email") || {}).value;
  const password = (document.getElementById("signup-password") || {}).value;
  const username = (document.getElementById("signup-username") || {}).value?.trim();
  const code = (document.getElementById("signup-code") || {}).value?.trim();

  if (!email || !password || !username || !code) {
    showMessage("signup-message", "Fill in all fields.", true);
    return;
  }
  if (username.length < 3) {
    showMessage("signup-message", "Username must be at least 3 characters.", true);
    return;
  }

  // Frontend quick check (optional)
  if (SIGNUP_CODE && code !== SIGNUP_CODE) {
    showMessage("signup-message", "Invalid signup code.", true);
    return;
  }

  showMessage("signup-message", "Checking invite code...");

  // Backend validation via Supabase RPC
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "consume_invite_code",
      { p_code: code }
    );

    if (rpcError) {
      console.error("RPC error:", rpcError);
      showMessage(
        "signup-message",
        "Problem validating signup code. Try again or contact admin.",
        true
      );
      return;
    }

    if (!rpcData) {
      showMessage(
        "signup-message",
        "Signup code is invalid, inactive, or used up.",
        true
      );
      return;
    }
  } catch (err) {
    console.error("RPC exception:", err);
    showMessage(
      "signup-message",
      "Error validating invite code. Try again.",
      true
    );
    return;
  }

  showMessage("signup-message", "Creating your account...");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  
  if (error) {
    console.error("Signup error:", error);
    showMessage("signup-message", error.message || "Signup failed.", true);
    return;
  }
  
  // Try to create profile (username) if we have a user object
  try {
    const userId = data?.user?.id;
    if (userId) {
      const { error: profileError } = await supabase
        .from("profiles")
        .insert({ id: userId, username });
  
      if (profileError) {
        console.error("Error creating profile:", profileError);
        // Not fatal for signup – user can still log in, but no username yet
      }
    }
  } catch (profileEx) {
    console.error("Profile creation exception:", profileEx);
  }
  
  // If email confirmations are disabled, you'll get a session immediately
  if (data?.session) {
    saveSession(data);
    showMessage("signup-message", "Account created! Redirecting to dashboard...");
    window.location.href = "index.html";
  } else {
    // If email confirmations are ON in Supabase
    showMessage(
      "signup-message",
      "Account created. Check your email to confirm, then log in.",
      false
    );
  }
  
}

// =====================================
// TOGGLE LOGIN / SIGNUP UI


function setupAuthToggle() {
  const loginSection = document.getElementById("login-section");
  const signupSection = document.getElementById("signup-section");
  const showLogin = document.getElementById("show-login");
  const showSignup = document.getElementById("show-signup");

  if (!loginSection || !signupSection) return;

  if (showLogin) {
    showLogin.addEventListener("click", (e) => {
      e.preventDefault();
      signupSection.classList.add("hidden");
      loginSection.classList.remove("hidden");
      showMessage("signup-message", "");
      showMessage("login-message", "");
    });
  }

  if (showSignup) {
    showSignup.addEventListener("click", (e) => {
      e.preventDefault();
      loginSection.classList.add("hidden");
      signupSection.classList.remove("hidden");
      showMessage("login-message", "");
      showMessage("signup-message", "");
    });
  }
}

// =====================================
// Optional: global logout helper
// (You can hook this to a button later: onclick="bbtLogout()")
// =====================================

async function bbtLogout() {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error("Logout error:", err);
  }
  localStorage.removeItem("bbt_auth");
  window.location.href = "auth.html";
}

window.bbtLogout = bbtLogout;

// =====================================
// INIT
// =====================================

document.addEventListener("DOMContentLoaded", () => {
  checkExistingSession();

  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");

  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }
  if (signupForm) {
    signupForm.addEventListener("submit", handleSignup);
  }

  setupAuthToggle();
});

