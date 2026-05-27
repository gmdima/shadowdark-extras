// PROBE: Verify renderChatMessageHTML hook injects the dummy `.light-source`
// element that SD's removeTorchTimer requires.
// Catches regressions of the global Element.prototype.querySelector monkeypatch.

const msg = await ChatMessage.create({ content: "<p>sdx light-source probe</p>" });
if (!msg) return { pass: false, reason: "ChatMessage.create returned no doc" };

await new Promise(r => setTimeout(r, 250));

const el = document.querySelector(`[data-message-id="${msg.id}"]`);
if (!el) {
  await msg.delete();
  return { pass: false, reason: "rendered DOM element not found", msgId: msg.id };
}

const lightSource = el.querySelector(".light-source");
const isDummy = lightSource?.classList?.contains("sdx-dummy-light-source");
const removeWorks = typeof lightSource?.remove === "function";

await msg.delete();

return {
  pass: !!lightSource && isDummy && removeWorks,
  hookFired: !!lightSource,
  isSdxDummy: isDummy,
  removeWorks,
  styleDisplay: lightSource?.style?.display,
  classList: lightSource ? [...lightSource.classList] : [],
};
