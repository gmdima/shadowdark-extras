import { getDDPacks, removeDDPack, scanDDPack, setDDPackEnabled, DD_DECOR_BASE } from "./DDPackManagerSD.mjs";
import { DDPackPreviewApp } from "./DDPackPreviewAppSD.mjs";
import { reloadDecorAssets } from "./HexPainterSD.mjs";

const MODULE_ID = "shadowdark-extras";
const { ApplicationV2 } = foundry.applications.api;

const STYLES = `
<style id="sdx-ddpack-settings-styles">
.sdx-ddpack-settings{padding:14px 16px 16px;background:#151515;color:#ddd;display:flex;flex-direction:column;gap:12px}
.sdx-ddpack-top{display:flex;flex-direction:column;gap:10px}
.sdx-ddpack-top p{margin:0;color:#c6b8a0;font-size:14px;line-height:1.35;max-width:64ch}
.sdx-ddpack-toolbar{display:flex;justify-content:flex-end}
.sdx-ddpack-add{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-width:128px;border:1px solid #4a6630;background:#1d2b14;color:#b9e58a;border-radius:5px;padding:7px 12px;cursor:pointer;white-space:nowrap;font-weight:600}
.sdx-ddpack-add i{font-size:13px}
.sdx-ddpack-list{display:flex;flex-direction:column;gap:8px}
.sdx-ddpack-row{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;background:#202020;border:1px solid #333;border-radius:5px;padding:8px}
.sdx-ddpack-row.sdx-ddpack-hidden{background:#1b1b1b;border-color:#2b2b2b}
.sdx-ddpack-toggle{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:82px;border:1px solid #4a6630;background:#172b10;color:#b9e58a;border-radius:4px;padding:5px 8px;cursor:pointer;white-space:nowrap;font-size:12px}
.sdx-ddpack-toggle.hidden-pack{border-color:#55402e;background:#2b1f18;color:#c7a37b}
.sdx-ddpack-toggle i{font-size:12px}
.sdx-ddpack-name{font-weight:700;color:#e4d29a}
.sdx-ddpack-row.sdx-ddpack-hidden .sdx-ddpack-name{color:#9d9270}
.sdx-ddpack-meta{font-size:11px;color:#888;margin-top:2px}
.sdx-ddpack-actions{display:flex;gap:5px}
.sdx-ddpack-actions button{border:1px solid #444;background:#2a2a2a;color:#ddd;border-radius:4px;padding:4px 7px;cursor:pointer}
.sdx-ddpack-actions button.danger{border-color:#6a3030;background:#2a1010;color:#e08888}
.sdx-ddpack-empty{padding:18px;text-align:center;color:#777;border:1px dashed #444;border-radius:5px}
.sdx-ddpack-file{display:none}
</style>`;

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

export class DDPackSettingsApp extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
        id: "sdx-ddpack-settings",
        classes: ["sdx-ddpack-settings-app"],
        tag: "div",
        window: { title: "Dungeondraft Decor Packs", icon: "fas fa-cubes", resizable: true },
        position: { width: 620, height: "auto" }
    };

    constructor(options = {}) {
        super(options);
        this.status = "";
    }

    async _renderHTML() {
        const existingStyles = document.getElementById("sdx-ddpack-settings-styles");
        if (existingStyles) {
            existingStyles.outerHTML = STYLES;
        } else {
            document.head.insertAdjacentHTML("beforeend", STYLES);
        }
        const packs = getDDPacks();
        const el = document.createElement("div");
        el.className = "sdx-ddpack-settings";
        el.innerHTML = `
            <div class="sdx-ddpack-top">
                <p>Import Dungeondraft object packs into the SDX Decor tray. Disabling a pack hides it; extracted files remain in <code>Data/${DD_DECOR_BASE}/</code>.</p>
                <div class="sdx-ddpack-toolbar">
                    <button type="button" class="sdx-ddpack-add"><i class="fas fa-plus"></i> Add Pack</button>
                </div>
                <input class="sdx-ddpack-file" type="file" accept=".dungeondraft_pack">
            </div>
            ${this.status ? `<div class="sdx-ddpack-meta">${escapeHtml(this.status)}</div>` : ""}
            <div class="sdx-ddpack-list">
                ${packs.length ? packs.map(pack => `
                    <div class="sdx-ddpack-row${pack.enabled === false ? " sdx-ddpack-hidden" : ""}" data-pack-id="${escapeHtml(pack.packId)}">
                        <button type="button" class="sdx-ddpack-toggle${pack.enabled === false ? " hidden-pack" : ""}" data-enabled="${pack.enabled === false ? "false" : "true"}" aria-pressed="${pack.enabled === false ? "false" : "true"}" title="${pack.enabled === false ? "Show in Decor tray" : "Hide from Decor tray"}">
                            <i class="fas ${pack.enabled === false ? "fa-eye-slash" : "fa-eye"}"></i>
                            <span>${pack.enabled === false ? "Hidden" : "Shown"}</span>
                        </button>
                        <div>
                            <div class="sdx-ddpack-name">${escapeHtml(pack.folderLabel || pack.name || pack.packId)}</div>
                            <div class="sdx-ddpack-meta">${escapeHtml(pack.name || pack.packId)}${pack.author ? ` · ${escapeHtml(pack.author)}` : ""}${pack.version ? ` · v${escapeHtml(pack.version)}` : ""} · ${Number(pack.assetCount || 0)} assets</div>
                        </div>
                        <div class="sdx-ddpack-actions">
                            <button type="button" class="danger sdx-ddpack-remove"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                `).join("") : `<div class="sdx-ddpack-empty">No Dungeondraft decor packs imported yet.</div>`}
            </div>`;
        return el;
    }

    _replaceHTML(result, content) {
        content.replaceChildren(result);
    }

    _onRender() {
        const fileInput = this.element.querySelector(".sdx-ddpack-file");
        this.element.querySelector(".sdx-ddpack-add")?.addEventListener("click", () => fileInput?.click());
        fileInput?.addEventListener("change", async event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            await this.#importPack(file);
        });

        this.element.querySelectorAll(".sdx-ddpack-row").forEach(row => {
            const packId = row.dataset.packId;
            row.querySelector(".sdx-ddpack-toggle")?.addEventListener("click", async event => {
                const currentlyEnabled = event.currentTarget.dataset.enabled !== "false";
                await setDDPackEnabled(packId, !currentlyEnabled);
                await reloadDecorAssets();
                Hooks.callAll("sdx.decorAssetsImported");
                this.render();
            });
            row.querySelector(".sdx-ddpack-remove")?.addEventListener("click", async () => {
                const pack = getDDPacks().find(p => p.packId === packId);
                const ok = await Dialog.confirm({
                    title: "Remove Dungeondraft Pack",
                    content: `<p>Remove <strong>${escapeHtml(pack?.folderLabel || pack?.name || packId)}</strong> from the Decor tray?</p><p>Extracted files stay in <code>Data/${DD_DECOR_BASE}/${escapeHtml(packId)}/</code>.</p>`,
                    defaultYes: false
                });
                if (!ok) return;
                await removeDDPack(packId);
                await reloadDecorAssets();
                Hooks.callAll("sdx.decorAssetsImported");
                this.render();
            });
        });
    }

    async #importPack(file) {
        if (!file.name.endsWith(".dungeondraft_pack")) {
            ui.notifications.warn("Please select a .dungeondraft_pack file.");
            return;
        }
        try {
            this.status = "Reading pack...";
            this.render();
            const scan = await scanDDPack(file);
            this.status = "";
            this.render();
            new DDPackPreviewApp({
                scan,
                file,
                onDone: indexData => {
                    this.status = `"${indexData.name}" imported (${indexData.assetCount} assets).`;
                    this.render();
                }
            }).render(true);
        } catch (err) {
            console.error(`${MODULE_ID} | Could not read Dungeondraft pack:`, err);
            ui.notifications.error(`Could not read pack: ${err?.message || err}`);
            this.status = "";
            this.render();
        }
    }
}
