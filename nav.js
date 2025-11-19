// =====================================
// Shared Nav Auth Logic
// =====================================
const SUPABASE_URL = "https://laomecxehnfwikhhyehx.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxhb21lY3hlaG5md2lraGh5ZWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1MjA4ODcsImV4cCI6MjA3OTA5Njg4N30.Y1uw52DWGD2NSyqHcNqK-epk1gYPGwiCrRjOvfSwGMQ";

const supabaseNav = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

function setVisible(el, visible) {
  if (!el) return;
  if (visible) {
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const authLink = document.getElementById("nav-auth-link");
  const usernameBadge = document.getElementById("nav-username");
  const logoutBtn = document.getElementById("nav-logout");

  // Default: logged out state
  setVisible(authLink, true);
  setVisible(usernameBadge, false);
  setVisible(logoutBtn, false);

  let user = null;
  try {
    const { data, error } = await supabaseNav.auth.getUser();
    if (!error && data && data.user) {
      user = data.user;
    }
  } catch (err) {
    console.error("Error checking nav auth:", err);
  }

  const path = window.location.pathname || "";
  const isHome =
    path.endsWith("home.html") ||
    path === "/" ||
    path === "" ||
    path.endsWith("/index"); // just in case you host differently

  if (user) {
    // Logged IN: hide Login link, show badge + logout
    setVisible(authLink, false);
    setVisible(usernameBadge, true);
    setVisible(logoutBtn, true);

    // Try to load username from profiles; fallback to email
    try {
      const { data: profile, error: profileError } = await supabaseNav
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();

      let label = "";
      if (!profileError && profile && profile.username) {
        label = profile.username;
      } else if (user.email) {
        label = user.email.split("@")[0];
      } else {
        label = "User";
      }

      if (usernameBadge) {
        usernameBadge.textContent = label;
      }
    } catch (err) {
      console.error("Error loading nav username:", err);
      if (usernameBadge) {
        usernameBadge.textContent = "User";
      }
    }

    // If logged in and on landing page, redirect to dashboard
    if (isHome) {
      window.location.href = "index.html";
      return;
    }
  } else {
    // Logged OUT: keep login visible, badge+logout hidden
    setVisible(authLink, true);
    setVisible(usernameBadge, false);
    setVisible(logoutBtn, false);
  }

  // Logout handler
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await supabaseNav.auth.signOut();
      } catch (err) {
        console.error("Error during logout:", err);
      }

      // Clear your manual token store too so dashboard guards don't resurrect it
      localStorage.removeItem("bbt_auth");

      // Back to landing page
      window.location.href = "home.html";
    });
  }
});
