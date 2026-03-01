/**
 * MaphubSD.mjs
 * Watches for sdx-maphub-map placeholder divs via MutationObserver and
 * replaces them with inline iframes pointing to the locally-served maphub
 * generator pages.  express.static does not add X-Frame-Options, so the
 * iframes load freely.  Falls back to the external watabou.github.io URL
 * if the local files are not present.
 */

const MODULE_ID = "shadowdark-extras";
const LOCAL_MAPHUB_BASE = `modules/${MODULE_ID}/scripts/maphub`;

// Guards against processing the same placeholder twice
const _processing = new WeakSet();

// ── Placeholder → inline iframe ──────────────────────────────────────────────

async function replacePlaceholder(div) {
	if (_processing.has(div)) return;
	_processing.add(div);
	if (!div.isConnected) return;

	const type    = div.dataset.maphubType;
	const qs      = div.dataset.maphubParams;
	const extBase = div.dataset.maphubExternal;
	if (!type || !qs || !extBase) return;

	// Try the local maphub files first (express.static has no X-Frame-Options).
	// Fall back to the external watabou URL if the local files aren't present.
	const localUrl = `${window.location.origin}/${LOCAL_MAPHUB_BASE}/to/${type}/index.html?${qs}`;
	let src = `${extBase}?${qs}`;
	try {
		const r = await fetch(localUrl, { method: "HEAD" });
		if (r.ok) src = localUrl;
	} catch (_) { /* network error — use external */ }

	const iframe = document.createElement("iframe");
	iframe.src = src;
	iframe.title = "Settlement Map";
	iframe.style.cssText = "width:100%;height:500px;border:none;display:block;border-radius:6px;margin:0.5em 0 1em;";
	div.replaceWith(iframe);
}

function scanAndReplace(root) {
	if (!(root instanceof Element)) return;
	if (root.matches(".sdx-maphub-map[data-maphub-type]")) replacePlaceholder(root);
	for (const div of root.querySelectorAll(".sdx-maphub-map[data-maphub-type]")) replacePlaceholder(div);
}

// ── Public API ───────────────────────────────────────────────────────────────

export function registerMaphubHooks() {
	const observer = new MutationObserver((mutations) => {
		for (const m of mutations)
			for (const node of m.addedNodes)
				scanAndReplace(node);
	});

	Hooks.once("ready", () => {
		observer.observe(document.body, { childList: true, subtree: true });
		scanAndReplace(document.body);
	});
}
