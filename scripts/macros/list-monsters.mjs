const pack = game.packs.get("shadowdark.monsters");
if (!pack) return ui.notifications.error("Compendium shadowdark.monsters not found.");
const index = await pack.getIndex();
const names = index.map(e => e.name).sort();
const html = names.map(n => `<li>${n}</li>`).join("");
new Dialog({
	title: `Monsters (${names.length})`,
	content: `<ol style="columns:2;max-height:600px;overflow:auto">${html}</ol>`,
	buttons: {
		copy: {
			label: "Copy to Clipboard",
			callback: () => {
				navigator.clipboard.writeText(names.join("\n"));
				ui.notifications.info("Copied to clipboard.");
			}
		},
		ok: { label: "Close" }
	}
}).render(true);
