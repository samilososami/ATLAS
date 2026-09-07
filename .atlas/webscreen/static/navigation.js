/* Same-tab presentation navigation; the existing access lifecycle owns release
 * and revalidation. Never transfer credentials, take over or open a new client. */
(() => {
  "use strict";
  const links = document.querySelectorAll("[data-webscreen-design-switch]");
  if (!links.length) return;
  const isNew = document.body?.dataset.design === "new";
  const destination = new URL(isNew ? "/" : "/new/", window.location.href);
  const current = new URL(window.location.href);
  // These boolean presentation flags are the only useful query parameters.
  // Do not copy arbitrary queries/fragments that might contain credentials.
  for (const name of ["kiosk", "remote"]) {
    const value = current.searchParams.get(name);
    if (value === "1" || value === "0") destination.searchParams.set(name, value);
  }
  for (const link of links) {
    link.textContent = isNew ? "Debugging Webscreen" : "New Webscreen";
    link.setAttribute("href", destination.pathname + destination.search);
    link.setAttribute("target", "_self");
  }
  // Plain same-origin links deliberately keep native pagehide/pageshow. The
  // prior page releases control; the next page revalidates normally, never
  // requesting takeover automatically or persisting the per-page access token.
})();
