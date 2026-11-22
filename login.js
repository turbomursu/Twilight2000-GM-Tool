(() => {
  const loginForm = document.querySelector("#login-form");
  const bootstrapForm = document.querySelector("#bootstrap-form");
  const title = document.querySelector("#auth-title");
  const description = document.querySelector("#auth-description");
  const modeLabel = document.querySelector("#auth-mode-label");
  const feedback = document.querySelector("#auth-feedback");
  const createUserEntry = document.querySelector("#create-user-entry");
  const cancelUserEntry = document.querySelector("#cancel-user-entry");
  const loginUsernameLabel = document.querySelector("label[for='login-username']");
  const loginButton = loginForm.querySelector("button[type='submit']");
  let creatingUser = false;
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

  async function submitForm(form, path, fields) {
    const button = form.querySelector("button[type='submit']");
    const userCreationRequested = form === loginForm && creatingUser;
    button.disabled = true;
    createUserEntry.disabled = true;
    cancelUserEntry.disabled = true;
    showFeedback("");
    try {
      const body = Object.fromEntries(new FormData(form));
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(Object.fromEntries(fields.map((field) => [field, body[field]])))
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Sign-in failed.");
      if (userCreationRequested) {
        if (result.account?.role !== "gm") {
          const logout = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
          if (!logout.ok) throw new Error("Could not end the non-GM session. Sign out before trying again.");
          throw new Error("A GM username is required to create users.");
        }
        location.replace("/index.html?open=users");
        return;
      }
      showFeedback("Session established.", true);
      location.replace(destination(result.homePath));
    } catch (error) {
      showFeedback(error instanceof TypeError ? "The service could not be reached." : error.message);
    } finally {
      button.disabled = false;
      createUserEntry.disabled = false;
      cancelUserEntry.disabled = false;
    }
  }

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm(loginForm, "/api/auth/login", ["username"]);
  });
  bootstrapForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm(bootstrapForm, "/api/auth/bootstrap", ["username"]);
  });
  function setCreatingUser(value) {
    creatingUser = value;
    title.textContent = value ? "Create new user" : "Sign in";
    description.textContent = value
      ? "Sign in as a GM to create a player or GM username. Anyone with server access can use any username."
      : "Sign in with your username. Anyone with access to this server can use any username.";
    modeLabel.textContent = value ? "GM USER MANAGEMENT" : "LOCAL SESSION";
    loginUsernameLabel.textContent = value ? "GM username" : "Username";
    loginButton.textContent = value ? "Continue to user management" : "Sign in";
    createUserEntry.hidden = value;
    cancelUserEntry.hidden = !value;
    showFeedback("");
  }
  createUserEntry.addEventListener("click", () => setCreatingUser(true));
  cancelUserEntry.addEventListener("click", () => setCreatingUser(false));
  fetch("/api/auth/status", { credentials: "same-origin", cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error("Service status is unavailable.");
      return response.json();
    })
    .then(({ setupRequired }) => {
      if (setupRequired) {
        loginForm.hidden = true;
        bootstrapForm.hidden = false;
        title.textContent = "Create GM account";
        description.textContent = "Create the first GM username. Anyone with server access can use it.";
        modeLabel.textContent = "FIRST-RUN SETUP";
      } else createUserEntry.hidden = false;
    })
    .catch(() => showFeedback("Unable to reach the Fieldbook service."));

  fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
    .then(async (response) => response.ok ? response.json() : null)
    .then((session) => {
      if (session?.authenticated) location.replace(destination(session.homePath));
    })
    .catch(() => {});
})();