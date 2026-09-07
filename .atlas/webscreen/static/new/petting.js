/* Deliberate local petting only. No voice, haptics, requests or model input. */
(() => {
  "use strict";

  function createPettingDetector({ onPet = () => {}, minDurationMs = 1200,
    windowMs = 4000, cooldownMs = 6000, maxGapMs = 1100 } = {}) {
    let stroke = null;
    let cooldownUntil = -Infinity;
    const finitePoint = (x, y, at) => [x, y, at].every(Number.isFinite);
    function begin(x, y, at, threshold = 48) {
      if (!finitePoint(x, y, at)) { stroke = null; return; }
      stroke = { x, y, at, lastAt: at, threshold: Math.max(12, Number(threshold) || 48),
        motionAt: null, axis: null, extreme: 0, direction: 1, passes: 0, reversals: 0 };
    }
    function move(x, y, at) {
      if (!stroke || !finitePoint(x, y, at)) { stroke = null; return false; }
      const s = stroke;
      if (at < s.lastAt) { stroke = null; return false; }
      if (at < cooldownUntil || at - s.lastAt > maxGapMs
          || (s.motionAt !== null && at - s.motionAt > windowMs)) {
        begin(x, y, at, s.threshold);
        return false;
      }
      s.lastAt = at;
      const dx = x - s.x, dy = y - s.y, distance = Math.hypot(dx, dy);
      // Waiting with a finger down does not count towards the 1.2s of petting.
      if (s.motionAt === null && distance >= Math.min(8, s.threshold / 5)) s.motionAt = at;
      if (!s.axis) {
        if (distance < s.threshold) return false;
        s.axis = { x: dx / distance, y: dy / distance };
        s.extreme = distance;
        s.passes = 1;
        return false;
      }
      const projection = dx * s.axis.x + dy * s.axis.y;
      const sideways = Math.abs(dx * s.axis.y - dy * s.axis.x);
      if (sideways > s.threshold * 1.5) { begin(x, y, at, s.threshold); return false; }
      let completedPass = false;
      if ((projection - s.extreme) * s.direction > 0) s.extreme = projection;
      else if ((s.extreme - projection) * s.direction >= s.threshold) {
        s.direction *= -1;
        s.extreme = projection;
        s.passes++;
        s.reversals++;
        completedPass = true;
      }
      if (!completedPass || s.passes < 4 || s.reversals < 3 || at - s.motionAt < minDurationMs) return false;
      cooldownUntil = at + cooldownMs;
      begin(x, y, at, s.threshold);
      try { return onPet() !== false; } catch { return false; }
    }
    return Object.freeze({ begin, move, cancel() { stroke = null; } });
  }

  function install(win, doc) {
    if (doc.body?.dataset.design !== "new" || win.AtlasPetting) return null;
    const stage = doc.querySelector(".face-stage");
    const character = stage?.querySelector(".face-character");
    const canvas = stage?.querySelector(".face-canvas");
    const view = doc.querySelector("#view-atlas");
    const content = doc.querySelector("#webscreen-content");
    const connection = doc.querySelector(".face-connection");
    const panel = doc.querySelector("#side-panel");
    if (!stage || !character || !canvas || !view || !content || !connection) return null;

    // The HTML input region inherits the real SVG face's scale/rotation through
    // foreignObject. Chromium ignores touch-action on a bare SVG rect and steals
    // touch drags for scrolling; keep the HTML touch-action region face-only.
    const frame = doc.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
    frame.setAttribute("class", "face-petting-frame");
    frame.setAttribute("pointer-events", "all");
    frame.setAttribute("aria-hidden", "true");
    frame.setAttribute("focusable", "false");
    const zone = doc.createElement("div");
    zone.setAttribute("class", "face-petting-zone");
    zone.setAttribute("aria-hidden", "true");
    frame.append(zone);
    let bounds = null, disposed = false, pageHidden = false;
    let activePointer = null;
    const heldPointers = new Set();
    const removers = [];
    const detector = createPettingDetector({ onPet: () => win.AtlasFace?.expression?.({
      expression: "delighted", source: "petting", durationMs: 6000,
    }) ?? false });

    function refreshBounds() {
      // At DOMContentLoaded the access lease can still keep the view hidden.
      // Never cache geometry from display:none; visibility observers refresh it
      // before the first touch so Chromium can see the HTML touch-action region.
      if (!available()) { bounds = null; return; }
      try {
        const inverse = character.getScreenCTM().inverse();
        const points = [];
        for (const node of character.querySelectorAll(".face-eye, .face-mouth")) {
          const box = node.getBBox();
          // Neutral eye ellipses already use character-local coordinates. Their
          // parent blink/working transform is transient, not an input boundary:
          // measuring its CTM during resize used to leave a permanently cropped
          // zone until the next resize. The mouth's deliberate CSS offset stays.
          const matrix = node.classList.contains("face-eye") ? null : inverse.multiply(node.getScreenCTM());
          for (const [x, y] of [[box.x, box.y], [box.x + box.width, box.y],
            [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]) {
            const point = new win.DOMPoint(x, y);
            points.push(matrix ? point.matrixTransform(matrix) : point);
          }
        }
        if (!points.length) return;
        const x = Math.min(...points.map(p => p.x)) - 6, y = Math.min(...points.map(p => p.y)) - 6;
        const right = Math.max(...points.map(p => p.x)) + 6, bottom = Math.max(...points.map(p => p.y)) + 6;
        bounds = { x, y, right, bottom };
        for (const [name, value] of Object.entries({ x, y, width: right - x, height: bottom - y })) {
          if (frame.getAttribute(name) !== String(value)) frame.setAttribute(name, String(value));
        }
      } catch { bounds = null; }
    }
    refreshBounds();
    character.append(frame);

    function available() {
      return !disposed && !pageHidden && !doc.hidden && stage.isConnected !== false
        && !view.hidden && !content.hidden && !content.inert
        && doc.body.dataset.facePaused !== "true" && win.navigator?.onLine !== false
        && connection.dataset.healthy === "true"
        && ["idle", "working", "speaking"].includes(stage.dataset.state)
        && !panel?.classList.contains("open");
    }
    function inside(event) {
      if (!bounds || event.target?.closest?.("button, a, input, select, textarea, summary, #side-panel, .face-header, .face-wave")) return false;
      try {
        const point = new win.DOMPoint(event.clientX, event.clientY).matrixTransform(character.getScreenCTM().inverse());
        return point.x >= bounds.x && point.x <= bounds.right && point.y >= bounds.y && point.y <= bounds.bottom;
      } catch { return false; }
    }
    function cancel(clearPointers = false) {
      const previous = activePointer;
      activePointer = null;
      detector.cancel();
      if (clearPointers) heldPointers.clear();
      try { if (previous !== null && stage.hasPointerCapture?.(previous)) stage.releasePointerCapture(previous); } catch {}
    }
    function down(event) {
      heldPointers.add(event.pointerId);
      if (heldPointers.size !== 1 || event.isPrimary === false) { cancel(); return; }
      if (!["touch", "pen", "mouse"].includes(event.pointerType)
          || (event.pointerType !== "touch" && (event.button !== 0 || !(event.buttons & 1)))) return;
      if (!available()) return;
      // Cover layout changes that did not resize the window (e.g. navigation or
      // an expression change) without polling or any idle animation frame.
      refreshBounds();
      if (!inside(event)) return;
      activePointer = event.pointerId;
      const width = canvas.getBoundingClientRect().width;
      detector.begin(event.clientX, event.clientY, win.performance.now(), Math.max(18, Math.min(84, width * 48 / 1024)));
      try { stage.setPointerCapture(event.pointerId); } catch {}
    }
    function move(event) {
      if (activePointer === null || event.pointerId !== activePointer) return;
      if (!available() || heldPointers.size !== 1 || !inside(event)
          || (event.pointerType !== "touch" && !(event.buttons & 1))) { cancel(); return; }
      detector.move(event.clientX, event.clientY, win.performance.now());
    }
    function up(event) {
      heldPointers.delete(event.pointerId);
      if (event.pointerId === activePointer) cancel();
    }
    function add(target, event, handler, options = { passive: true }) {
      target.addEventListener(event, handler, options);
      removers.push(() => target.removeEventListener(event, handler, options));
    }
    function invalidate() {
      if (!available()) { cancel(true); bounds = null; }
      else refreshBounds();
    }
    add(doc, "pointerdown", down, { capture: true, passive: true });
    add(doc, "pointermove", move, { capture: true, passive: true });
    add(doc, "pointerup", up, { capture: true, passive: true });
    add(doc, "pointercancel", event => { heldPointers.delete(event.pointerId); cancel(); }, { capture: true, passive: true });
    add(stage, "lostpointercapture", () => cancel());
    add(doc, "visibilitychange", invalidate);
    add(win, "pagehide", () => { pageHidden = true; cancel(true); });
    add(win, "pageshow", () => { pageHidden = false; refreshBounds(); });
    add(win, "blur", () => cancel(true));
    add(win, "offline", () => cancel(true));
    add(win, "resize", () => { cancel(true); refreshBounds(); });
    const observer = new win.MutationObserver(invalidate);
    for (const [node, names] of [[stage, ["data-state"]], [view, ["hidden"]],
      [content, ["hidden", "inert"]], [connection, ["data-healthy"]],
      [doc.body, ["data-face-paused"]], [panel, ["class"]]]) {
      if (node) observer.observe(node, { attributes: true, attributeFilter: names });
    }
    const api = Object.freeze({ reset() { cancel(true); }, disconnect() {
      if (disposed) return;
      disposed = true;
      cancel(true);
      observer.disconnect();
      removers.forEach(remove => remove());
      frame.remove();
    } });
    win.AtlasPetting = api;
    return api;
  }

  if (typeof module === "object" && module.exports) module.exports = { createPettingDetector, install };
  if (typeof window !== "undefined" && typeof document !== "undefined" && document.body?.dataset.design === "new") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => install(window, document), { once: true });
    else install(window, document);
  }
})();
