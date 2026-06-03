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

void init();
