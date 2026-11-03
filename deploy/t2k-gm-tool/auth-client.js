(() => {
  document.querySelectorAll("[data-auth-logout]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const response = await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: "{}"
        });
        if (!response.ok) throw new Error("Sign out failed.");
        location.replace("/login.html");
      } catch {
        button.disabled = false;
        button.title = "The secure service could not be reached. Retry sign out.";
      }
    });
  });
})();