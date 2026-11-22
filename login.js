(() => {
  const loginForm = document.querySelector("#login-form");
  const registerForm = document.querySelector("#register-form");
  const title = document.querySelector("#auth-title");
  const description = document.querySelector("#auth-description");
  const modeLabel = document.querySelector("#auth-mode-label");
  const feedback = document.querySelector("#auth-feedback");
  const allowedNext = new Set([
    "/index.html",
    "/campaign-setup.html",
    "/player-interface.html",
    "/player-interface-concepts.html"
  ]);

  function showFeedback(message, success = false) {
    feedback.textContent = message;
    feedback.classList.toggle("success", success);
  }

  function destination(defaultPath = "/index.html") {
    const candidate = new URLSearchParams(location.search).get("next");
    return allowedNext.has(candidate) ? candidate : allowedNext.has(defaultPath) ? defaultPath : "/index.html";
  }

  function showMode(mode) {
    const registering = mode === "register";
    loginForm.hidden = registering;
    registerForm.hidden = !registering;
    title.textContent = registering ? "Create user" : "Sign in";
    description.textContent = registering
      ? "Choose a username and account type. No password is required on this network."
      : "Enter your username to continue. No password is required on this network.";
    modeLabel.textContent = registering ? "NEW USER" : "LOCAL SIGN-IN";
    showFeedback("");
    (registering ? registerForm : loginForm).querySelector("input[name='username']").focus();
  }

  async function submitForm(form, path, fields) {
    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    showFeedback("");
    try {
      const body = Object.fromEntries(new FormData(form));
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(Object.fromEntries(fields.filter((field) => body[field] !== undefined).map((field) => [field, body[field]])))
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Sign-in failed.");
      showFeedback("Signed in.", true);
      location.replace(destination(result.homePath));
    } catch (error) {
      showFeedback(error instanceof TypeError ? "The Fieldbook service could not be reached." : error.message);
    } finally {
      button.disabled = false;
    }
  }

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm(loginForm, "/api/auth/login", ["username"]);
  });
  registerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm(registerForm, "/api/auth/register", ["username", "role"]);
  });
  document.querySelector("#show-register").addEventListener("click", () => showMode("register"));
  document.querySelector("#show-login").addEventListener("click", () => showMode("login"));

  fetch("/api/auth/status", { credentials: "same-origin", cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error("Service status is unavailable.");
      return response.json();
    })
    .then(({ setupRequired }) => {
      if (!setupRequired) return;
      showMode("register");
      description.textContent = "No users exist yet. The first user created becomes the Game Master.";
      modeLabel.textContent = "FIRST-RUN SETUP";
    })
    .catch(() => showFeedback("Unable to reach the Fieldbook service."));

  fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
    .then(async (response) => response.ok ? response.json() : null)
    .then((session) => {
      if (session?.authenticated) location.replace(destination(session.homePath));
    })
    .catch(() => {});
})();
