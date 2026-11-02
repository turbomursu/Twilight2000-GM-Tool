(() => {
  const loginForm = document.querySelector("#login-form");
  const passwordChangeForm = document.querySelector("#password-change-form");
  const bootstrapForm = document.querySelector("#bootstrap-form");
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

  function showPasswordChange() {
    loginForm.hidden = true;
    bootstrapForm.hidden = true;
    passwordChangeForm.hidden = false;
    title.textContent = "Change your password";
    description.textContent = "Set a new password before continuing to Fieldbook.";
    modeLabel.textContent = "FIRST LOGIN REQUIRED";
    passwordChangeForm.querySelector("#current-password").focus();
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
      if (result.mustChangePassword) {
        showPasswordChange();
        showFeedback("Change your temporary password to continue.");
        return;
      }
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
  passwordChangeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(passwordChangeForm));
    if (body.newPassword !== body.confirmPassword) {
      showFeedback("The new passwords do not match.");
      return;
    }
    const button = passwordChangeForm.querySelector("button[type='submit']");
    button.disabled = true;
    showFeedback("");
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ currentPassword: body.currentPassword, newPassword: body.newPassword })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Password change failed.");
      location.replace(destination(result.homePath));
    } catch (error) {
      showFeedback(error instanceof TypeError ? "The secure service could not be reached." : error.message);
    } finally {
      button.disabled = false;
    }
  });
  bootstrapForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm(bootstrapForm, "/api/auth/bootstrap", ["bootstrapToken", "username", "password"]);
  });
  fetch("/api/auth/status", { credentials: "same-origin", cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error("Service status is unavailable.");
      return response.json();
    })
    .then(({ setupRequired }) => {
      if (setupRequired) {
        passwordChangeForm.hidden = true;
        loginForm.hidden = true;
        bootstrapForm.hidden = false;
        title.textContent = "Create GM account";
        description.textContent = "Use the one-time setup token configured on the host.";
        modeLabel.textContent = "FIRST-RUN SETUP";
      }
    })
    .catch(() => showFeedback("Unable to reach the secure Fieldbook service."));

  fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
    .then(async (response) => response.ok ? response.json() : null)
    .then((session) => {
      if (session?.mustChangePassword) showPasswordChange();
      else if (session?.authenticated) location.replace(destination(session.homePath));
    })
    .catch(() => {});
})();