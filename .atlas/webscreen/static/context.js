(() => {
  "use strict";

  const panel = document.querySelector("#context-usage");
  const progress = document.querySelector("#context-progress");
  const value = document.querySelector("#context-usage-value");
  const percent = document.querySelector("#context-usage-percent");
  const detail = document.querySelector("#context-detail");
  const reset = document.querySelector("#context-reset");
  const formatter = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
  let timer = 0;
  let revision = "";
  let lastStats = null;
  let requestedCompaction = false;

  function render(stats) {
    if (!stats || typeof stats !== "object") return;
    lastStats = stats;
    const used = Number(stats.fillerEstimatedTokens || 0);
    const available = Number(stats.availableFillerTokens || 0);
    const percentage = Number(stats.fillerUsagePercent || 0);
    progress.value = Number.isFinite(percentage) ? percentage : 0;
    value.textContent = `${formatter.format(used)} / ${formatter.format(available)}`;
    percent.textContent = Number.isFinite(percentage) ? `${percentage.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %` : "—";
    progress.setAttribute("aria-valuetext", `${formatter.format(used)} de ${formatter.format(available)} tokens de memoria conversacional`);
    detail.textContent = `Crucial: ${formatter.format(Number(stats.crucialEstimatedTokens || 0))} tokens · Relleno persistente compartido entre sesiones`;
    if (stats.revision) revision = String(stats.revision);
    if (stats.compactionRequested && !requestedCompaction) {
      requestedCompaction = true;
      window.dispatchEvent(new CustomEvent("atlas-context-compact", { detail: stats }));
    }
    if (!stats.compactionRequested) requestedCompaction = false;
    reset.disabled = !window.atlasAccess?.hasControl?.();
    panel.classList.toggle("near-limit", percentage >= 90);
  }

  async function refresh({ restartIfChanged = false } = {}) {
    window.clearTimeout(timer);
    if (!window.atlasAccess?.hasControl?.() || document.visibilityState === "hidden") return;
    try {
      const response = await window.atlasAccess.fetch("/api/realtime/context", {
        cache: "no-store", signal: AbortSignal.timeout(5000),
      });
      const stats = await response.json();
      if (!response.ok) throw new Error(stats.error || "Contexto no disponible");
      const previous = revision;
      render(stats);
      if (restartIfChanged && previous && stats.revision && previous !== stats.revision) {
        window.dispatchEvent(new CustomEvent("atlas-context-revision", { detail: stats }));
      }
    } catch {
      if (!lastStats) detail.textContent = "Contexto no disponible";
    } finally {
      timer = window.setTimeout(() => void refresh({ restartIfChanged: true }), 5000);
    }
  }

  reset.addEventListener("click", async () => {
    if (!window.atlasAccess?.hasControl?.()) return;
    const confirmed = window.confirm("¿Reiniciar el contexto conversacional? Los archivos .md cruciales seguirán cargándose.");
    if (!confirmed) return;
    reset.disabled = true;
    try {
      const response = await window.atlasAccess.fetch("/api/realtime/context-empty", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "No se pudo reiniciar el contexto");
      render(payload.stats || {});
      window.dispatchEvent(new CustomEvent("atlas-context-restart", { detail: payload.stats || {} }));
    } catch (error) {
      detail.textContent = `No se pudo reiniciar: ${error?.message || error}`;
    } finally {
      reset.disabled = !window.atlasAccess?.hasControl?.();
    }
  });

  window.addEventListener("atlas-context-stats", (event) => render(event.detail || {}));
  window.addEventListener("atlas-access-acquired", () => void refresh());
  window.addEventListener("atlas-access-lost", () => { reset.disabled = true; });
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refresh({ restartIfChanged: true });
    else window.clearTimeout(timer);
  });
  window.addEventListener("beforeunload", () => window.clearTimeout(timer));
  void refresh();
})();
