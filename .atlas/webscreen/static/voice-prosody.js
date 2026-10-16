/* Small, deterministic delivery hints, not an emotion synthesizer. The selected
 * voice still owns pronunciation and intonation. Never mutate an utterance while
 * it is speaking, randomise loudness, insert audio tags, or split words. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AtlasVoiceProsody = api;
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";
  const SOFT = new Set(["sad", "worried", "empathetic", "empathy", "reassuring", "tired", "sleepy", "asleep", "calm", "care", "disappointment"]);
  const BRIGHT = new Set(["happy", "delighted", "joy", "excited", "proud", "celebrating", "playful", "humor", "celebration"]);
  const REFLECTIVE = new Set(["curious", "uncertain", "confused", "thoughtful", "thinking", "focused", "focus", "curiosity", "uncertainty"]);

  function chooseVoice(voices, preferred = "") {
    const list = Array.isArray(voices) ? voices : [];
    const language = voice => String(voice.lang || "").toLowerCase().replaceAll("_", "-");
    return (preferred && list.find(voice => voice.voiceURI === preferred || voice.name === preferred))
      || list.find(voice => language(voice) === "es-es")
      || list.find(voice => language(voice).startsWith("es-"))
      || list.find(voice => language(voice) === "es") || null;
  }

  function browserDelivery({ text = "", expression = "neutral", family = "", enabled = true } = {}) {
    if (!enabled) return { rate: 1.02, pitch: 1, volume: 1 };
    // Use the catalog family if provided; unknown expressions stay neutral.
    // These are restrained whole-phrase adjustments, not a changing character.
    const mood = String(family && family !== "legacy" ? family : expression).toLowerCase();
    let rate = 1, pitch = 1;
    if (SOFT.has(mood)) rate = 0.96;
    else if (BRIGHT.has(mood)) { rate = 1.03; pitch = 1.015; }
    else if (REFLECTIVE.has(mood)) rate = 0.98;
    // Let punctuation drive the engine; only a modest lift for a whole question.
    if (/^\s*¿[\s\S]*\?[\s"'»”’)]*$/u.test(String(text))) pitch = Math.max(pitch, 1.02);
    return { rate, pitch, volume: 1 };
  }

  return Object.freeze({ chooseVoice, browserDelivery });
});
