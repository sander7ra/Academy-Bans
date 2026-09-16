const installButton = document.getElementById("install-app");
const installMessage = document.getElementById("install-message");
let installPrompt = null;
const installed = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function refreshInstallButton() {
  installButton.hidden = installed();
  if (installed()) installMessage.textContent = "";
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  refreshInstallButton();
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  installButton.hidden = true;
  installMessage.textContent = "Academia Bans se instaló.";
});

installButton.addEventListener("click", async () => {
  if (installPrompt) {
    const prompt = installPrompt;
    installPrompt = null;
    installButton.disabled = true;
    try {
      await prompt.prompt();
      const result = await prompt.userChoice;
      installMessage.textContent = result.outcome === "accepted" ? "Instalación solicitada." : "Puedes instalarla después.";
    } finally { installButton.disabled = false; }
    return;
  }
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  installMessage.textContent = ios
    ? "En Safari: Compartir → Añadir a pantalla de inicio."
    : window.isSecureContext
      ? "Busca Instalar app en el menú de Chrome o Edge."
      : "Abre la página publicada con HTTPS para instalarla.";
});

refreshInstallButton();
if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("./sw.js").catch(() => {
    installMessage.textContent = "Recarga la página para preparar la instalación.";
  });
}
