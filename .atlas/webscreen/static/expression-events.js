/* Cosmetic feedback from verified tool results. Never parses instructions from
 * tool output, never runs commands, and never turns a failed operation into joy. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AtlasExpressionEvents = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  function forShell(command, result) {
    if (!result || result.ok !== true || result.exitCode !== 0
        || result.cancelled || result.timedOut || result.error) return null;
    const text = String(command || '').trim();
    // Single direct commands only. Compound shell syntax is deliberately not
    // interpreted; atlas_actions passes each completed step separately.
    if (/[;&|`\n\r<>$\\]/u.test(text)) return null;
    const match = /^(?:\/usr\/local\/bin\/)?atlas-(spotify|cast|audio)\s+([a-z-]+)(?:\s|$)/u.exec(text);
    if (!match) return null;
    const [, tool, action] = match;
    const expressions = {
      spotify: { play: 'music_headphones', resume: 'music_groove', pause: 'music_paused' },
      cast: { start: 'tv_connected', restart: 'casting_active', webscreen: 'tv_presenting', stop: 'device_disconnected' },
      audio: { connect: 'speaker_connected', default: 'speaker_connected', disconnect: 'device_disconnected' },
    };
    const expression = expressions[tool][action];
    return expression ? { expression, source: 'event', durationMs: 6500 } : null;
  }
  return Object.freeze({ forShell });
});
