import { userScriptsStatus } from "./autofill.js";
import { loadConfig, saveConfig } from "./storage.js";

async function init() {
  const cfg = await loadConfig();
  if (cfg) {
    (document.getElementById("endpoint") as HTMLInputElement).value = cfg.endpoint;
    (document.getElementById("token") as HTMLInputElement).value = cfg.token;
  }
  document.getElementById("save-btn")!.addEventListener("click", async () => {
    const endpoint = (document.getElementById("endpoint") as HTMLInputElement)
      .value.trim();
    const token = (document.getElementById("token") as HTMLInputElement)
      .value.trim();
    const status = document.getElementById("status")!;
    if (!endpoint || !token) {
      status.className = "err";
      status.textContent = "Faltan campos";
      return;
    }
    await saveConfig({ endpoint, token });
    status.className = "ok";
    status.textContent = "Guardado";
  });
}

function renderUserScripts() {
  const out = document.getElementById("userscripts-status")!;
  const btn = document.getElementById("userscripts-btn") as HTMLButtonElement;
  const status = userScriptsStatus();
  const optional = (chrome.runtime.getManifest().optional_permissions ?? []).includes(
    "userScripts" as chrome.runtime.ManifestPermissions,
  );
  btn.style.display = status === "disabled" && optional ? "block" : "none";
  out.className = status === "ready" ? "ok" : "";
  out.textContent =
    status === "ready"
      ? "Los scripts JavaScript de tus automatizaciones están permitidos."
      : status === "unsupported"
        ? "Los pasos funcionan; los scripts JavaScript necesitan Chrome 135 o posterior."
        : optional
          ? "Los pasos funcionan; para los scripts JavaScript pulsa el botón y acepta el permiso."
          : "Los pasos funcionan; para los scripts JavaScript activa «Permitir scripts de usuario» en chrome://extensions, en los detalles de esta extensión.";
}

void init().then(() => {
  renderUserScripts();
  document.getElementById("userscripts-btn")!.addEventListener("click", async () => {
    await chrome.permissions.request({
      permissions: ["userScripts" as chrome.runtime.ManifestPermissions],
    });
    renderUserScripts();
  });
});
