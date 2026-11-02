(() => {
  const loginForm = document.querySelector("#login-form");
  const bootstrapForm = document.querySelector("#bootstrap-form");
  const activationForm = document.querySelector("#activation-form");
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
        body: JSON.stringify(Object.fromEntries(fields.map((field) => [field, body[field]])))
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Sign-in failed.");
      showFeedback("Session established.", true);
      location.replace(destination(result.homePath));
    } catch (error) {
      showFeedback(error instanceof TypeError ? "The secure service could not be reached." : error.message);
    } finally {
      button.disabled = false;
    }
  }

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm(loginForm, "/api/auth/login", ["username", "password"]);
  });
  bootstrapForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm(bootstrapForm, "/api/auth/bootstrap", ["bootstrapToken", "username", "password"]);
  });
  activationForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm(activationForm, "/api/auth/activate", ["token", "password"]);
  });

  fetch("/api/auth/status", { credentials: "same-origin", cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error("Service status is unavailable.");
      return response.json();
    })
    .then(({ setupRequired }) => {
      if (setupRequired) {
        activationForm.hidden = true;
        loginForm.hidden = true;
        bootstrapForm.hidden = false;
        title.textContent = "Create GM account";
        description.textContent = "Use the one-time setup token configured on the host.";
        modeLabel.textContent = "FIRST-RUN SETUP";
      } else if (new URLSearchParams(location.search).get("activate") === "1") {
        loginForm.hidden = true;
        activationForm.hidden = false;
        title.textContent = "Activate player account";
        description.textContent = "Set a password for the player account assigned by your GM.";
        modeLabel.textContent = "PLAYER ACCOUNT SETUP";
      }
    })
    .catch(() => showFeedback("Unable to reach the secure Fieldbook service."));
})();