(() => {
  const panel = document.querySelector("#codex-usage");
  const status = document.querySelector("#quota-status");
  const rows = [
    ["fiveHour", document.querySelector("#quota-five-hour")],
    ["weekly", document.querySelector("#quota-weekly")],
  ];
  let timer = null;
  let fetching = false;
  let lastGood = null;
  const percent = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

  function render(data) {
    panel.classList.toggle("stale", Boolean(data.stale));
    status.textContent = data.message || "Límites no disponibles";
    for (const [key, row] of rows) {
      const quota = data[key];
      const available = quota && typeof quota.remainingPercent === "number"
        && Number.isFinite(quota.remainingPercent);
      const progress = row.querySelector("progress");
      row.classList.toggle("unavailable", !available);
      row.classList.toggle("low", available && quota.remainingPercent <= 15);
      row.querySelector(".usage-value").textContent = available
        ? `${percent.format(quota.remainingPercent)} %` : "—";
      progress.value = available ? quota.remainingPercent : 0;
      progress.setAttribute("aria-valuetext", available
        ? `${percent.format(quota.remainingPercent)} por ciento disponible${data.stale ? ', última lectura' : ''}`
        : "No disponible");
      const resetAt = quota?.resetAt;
      let reset = available ? "Renovación no disponible" : "No disponible";
      if (typeof resetAt === "number" && Number.isFinite(resetAt)) {
        reset = resetAt <= Date.now() ? "Pendiente de actualizar" : "Renueva " +
          new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit",
            hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(resetAt));
      }
      row.querySelector(".usage-reset").textContent = reset;
      row.title = available ? `${percent.format(quota.usedPercent)} % usado. ${reset} (hora de España)` : reset;
    }
  }

  async function refresh() {
    clearTimeout(timer);
    if (fetching || document.visibilityState === "hidden" || !window.atlasAccess.hasControl()) return;
    fetching = true;
    let delay = 15000;
    try {
      const response = await window.atlasAccess.fetch("/api/codex-usage", {
        cache: "no-store", signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error("Usage unavailable");
      const data = await response.json();
      render(data);
      if (data.available) lastGood = data;
      if (data.refreshing) delay = 2000;
    } catch {
      render({ ...(lastGood || {}), stale: true,
        message: lastGood ? "Sin conexión · última lectura" : "Límites no disponibles" });
    } finally {
      fetching = false;
      timer = setTimeout(refresh, delay);
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refresh();
    else clearTimeout(timer);
  });
  window.addEventListener("beforeunload", () => clearTimeout(timer));
  window.addEventListener("atlas-access-acquired", () => void refresh());
  void refresh();
})();
