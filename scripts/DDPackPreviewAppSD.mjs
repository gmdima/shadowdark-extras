import { extractDDPack, upsertDDPack } from "./DDPackManagerSD.mjs";
import { reloadDecorAssets } from "./HexPainterSD.mjs";

const MODULE_ID = "shadowdark-extras";
const { ApplicationV2 } = foundry.applications.api;

const STYLES = `
<style id="sdx-ddpack-preview-styles">
.sdx-ddp-wrap{display:flex;flex-direction:column;height:100%;min-height:0;background:#111;color:#ccc}
.sdx-ddp-head{padding:10px 14px;background:#1b1b1b;border-bottom:1px solid #333}
.sdx-ddp-head h2{margin:0 0 2px;color:#e8d5a3;font-size:17px}
.sdx-ddp-meta{font-size:12px;color:#888;margin-bottom:8px}
.sdx-ddp-folder{display:flex;align-items:center;gap:8px}
.sdx-ddp-folder label{color:#c8a96e;white-space:nowrap}
.sdx-ddp-folder input{flex:1;background:#222;border:1px solid #444;color:#e0d0a8;padding:5px 8px;border-radius:4px}
.sdx-ddp-body{display:flex;flex:1;min-height:0;overflow:hidden}
.sdx-ddp-tree{width:240px;min-width:190px;overflow:auto;background:#141414;border-right:1px solid #292929;padding:6px 0}
.sdx-ddp-row{display:flex;align-items:center;gap:5px;padding:4px 8px;color:#b8a878;cursor:pointer;white-space:nowrap;overflow:hidden}
.sdx-ddp-row.active,.sdx-ddp-row:hover{background:#261e0e;color:#e8d5a3}
.sdx-ddp-row input{width:14px;height:14px;accent-color:#6a9a40}
.sdx-ddp-row .label{flex:1;overflow:hidden;text-overflow:ellipsis}
.sdx-ddp-row .count{font-size:11px;color:#777}
.sdx-ddp-right{display:flex;flex-direction:column;flex:1;min-width:0;overflow:hidden}
.sdx-ddp-assets-head{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#181818;border-bottom:1px solid #242424}
.sdx-ddp-assets-head h3{margin:0;flex:1;color:#e0c880;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sdx-ddp-assets-head button,.sdx-ddp-foot button{border-radius:4px;border:1px solid #3a5a3a;background:#102010;color:#8fe28f;cursor:pointer;padding:4px 9px}
.sdx-ddp-grid{flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(82px,1fr));gap:7px;align-content:start;padding:9px}
.sdx-ddp-thumb{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:5px;background:#1e1e1e;border:2px solid transparent;border-radius:5px;cursor:pointer}
.sdx-ddp-thumb.selected{border-color:#6a9a40}
.sdx-ddp-thumb img{width:64px;height:64px;object-fit:contain}
.sdx-ddp-thumb span{font-size:10px;color:#aaa;max-width:72px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sdx-ddp-check{position:absolute;top:3px;left:3px;width:13px;height:13px;border:1px solid #555;background:#111;border-radius:2px}
.sdx-ddp-thumb.selected .sdx-ddp-check{background:#6a9a40;border-color:#6a9a40}
.sdx-ddp-foot{display:flex;align-items:center;gap:8px;padding:9px 14px;background:#1b1b1b;border-top:1px solid #333}
.sdx-ddp-count{flex:1;color:#999}
.sdx-ddp-foot .all{background:#1e2010;border-color:#5a6330;color:#c9e58a}
.sdx-ddp-foot .cancel{background:#2a1010;border-color:#6a3030;color:#e08888}
.sdx-ddp-foot button:disabled{opacity:.45;cursor:not-allowed}
.sdx-ddp-progress{position:absolute;inset:0;background:rgba(0,0,0,.78);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;z-index:10}
.sdx-ddp-bar{width:65%;height:8px;background:#222;border-radius:4px;overflow:hidden}
.sdx-ddp-fill{height:100%;background:#6a9a40}
</style>`;

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function formatLabel(filename) {
    return String(filename || "").replace(/\.(png|webp)$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export class DDPackPreviewApp extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
        id: "sdx-ddpack-preview",
        classes: ["sdx-ddpack-preview-app"],
        tag: "div",
        window: { title: "Preview Dungeondraft Pack", icon: "fas fa-cubes", resizable: true },
        position: { width: 900, height: 660 }
    };

    constructor({ scan, file, onDone } = {}) {
        super();
        this.scan = scan;
        this.file = file;
        this.onDone = onDone;
        this.selected = new Set(scan.categories.flatMap(category => category.files.map(file => file.path)));
        this.tree = this.#buildTree(scan.categories);
        this.open = {};
        this.viewKey = this.tree[0]?.key ?? null;
        this.extracting = false;
        this.progress = 0;
        this.total = 0;
        this.status = "";
    }

    close(options) {
        for (const category of this.scan.categories) {
            for (const file of category.files) URL.revokeObjectURL(file.previewUrl);
        }
        return super.close(options);
    }

    async _renderHTML() {
        if (!document.getElementById("sdx-ddpack-preview-styles")) {
            document.head.insertAdjacentHTML("beforeend", STYLES);
        }
        const meta = this.scan.meta;
        const selectedCount = this.selected.size;
        const progress = this.extracting
            ? `<div class="sdx-ddp-progress"><div class="sdx-ddp-bar"><div class="sdx-ddp-fill" style="width:${this.total ? Math.round(this.progress / this.total * 100) : 0}%"></div></div><div>${escapeHtml(this.status)}</div></div>`
            : "";
        const el = document.createElement("div");
        el.className = "sdx-ddp-wrap";
        el.style.position = "relative";
        el.innerHTML = `
            <div class="sdx-ddp-head">
                <h2>${escapeHtml(meta.name || "Unknown Pack")}</h2>
                <div class="sdx-ddp-meta">${meta.author ? `By ${escapeHtml(meta.author)} · ` : ""}${meta.version ? `v${escapeHtml(meta.version)} · ` : ""}${this.scan.totalAssets} objects · ${this.scan.categories.length} categories</div>
                <div class="sdx-ddp-folder"><label>Folder name</label><input id="sdx-ddp-folder" type="text" value="${escapeHtml(meta.name || "Pack")}"></div>
            </div>
            <div class="sdx-ddp-body">
                <div class="sdx-ddp-tree"></div>
                <div class="sdx-ddp-right">
                    <div class="sdx-ddp-assets-head"><h3>-</h3><button type="button" data-action="all">All</button><button type="button" data-action="none">None</button><span class="asset-count"></span></div>
                    <div class="sdx-ddp-grid"></div>
                </div>
            </div>
            <div class="sdx-ddp-foot">
                <span class="sdx-ddp-count">${selectedCount} / ${this.scan.totalAssets} selected</span>
                <button type="button" data-action="extract-selected" ${selectedCount ? "" : "disabled"}><i class="fas fa-filter"></i> Extract Selected (${selectedCount})</button>
                <button type="button" class="all" data-action="extract-all"><i class="fas fa-download"></i> Extract All (${this.scan.totalAssets})</button>
                <button type="button" class="cancel" data-action="cancel"><i class="fas fa-times"></i> Cancel</button>
            </div>
            ${progress}`;
        return el;
    }

    _replaceHTML(result, content) {
        content.replaceChildren(result);
    }

    _onRender() {
        this.#renderTree();
        this.#renderAssets();
        this.element.querySelector("[data-action='extract-selected']")?.addEventListener("click", () => this.#extract(new Set(this.selected)));
        this.element.querySelector("[data-action='extract-all']")?.addEventListener("click", () => this.#extract(null));
        this.element.querySelector("[data-action='cancel']")?.addEventListener("click", () => this.close());
    }

    #buildTree(categories) {
        const roots = [];
        const byKey = new Map();
        for (const category of categories) {
            const parts = (category.name === "__root__" ? ["Root"] : category.name.split("/")).filter(Boolean);
            let parentKey = "";
            for (let i = 0; i < parts.length; i++) {
                const key = parts.slice(0, i + 1).join("/");
                if (!byKey.has(key)) {
                    const node = { key, label: parts[i], children: [], files: [] };
                    byKey.set(key, node);
                    if (parentKey) byKey.get(parentKey).children.push(node);
                    else roots.push(node);
                }
                parentKey = key;
            }
            byKey.get(parentKey).files = category.files;
        }
        return roots;
    }

    #nodeFiles(node) {
        return [...node.files, ...node.children.flatMap(child => this.#nodeFiles(child))];
    }

    #nodeByKey(key, nodes = this.tree) {
        for (const node of nodes) {
            if (node.key === key) return node;
            const found = this.#nodeByKey(key, node.children);
            if (found) return found;
        }
        return null;
    }

    #renderTree() {
        const panel = this.element.querySelector(".sdx-ddp-tree");
        panel.replaceChildren(...this.tree.map(node => this.#treeNode(node, 0)));
    }

    #treeNode(node, depth) {
        const files = this.#nodeFiles(node);
        const selected = files.filter(file => this.selected.has(file.path)).length;
        const row = document.createElement("div");
        row.className = `sdx-ddp-row${this.viewKey === node.key ? " active" : ""}`;
        row.style.paddingLeft = `${8 + depth * 14}px`;
        row.dataset.key = node.key;
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selected === files.length;
        checkbox.indeterminate = selected > 0 && selected < files.length;
        checkbox.addEventListener("change", event => {
            event.stopPropagation();
            for (const file of files) checkbox.checked ? this.selected.add(file.path) : this.selected.delete(file.path);
            this.#refresh();
        });
        row.innerHTML = `<i class="fas ${node.children.length ? (this.open[node.key] ? "fa-folder-open" : "fa-folder") : "fa-images"}"></i>`;
        row.prepend(checkbox);
        row.insertAdjacentHTML("beforeend", `<span class="label" title="${escapeHtml(node.key)}">${escapeHtml(node.label)}</span><span class="count">(${files.length})</span>`);
        row.addEventListener("click", event => {
            if (event.target.closest("input")) return;
            if (node.children.length) this.open[node.key] = !this.open[node.key];
            this.viewKey = node.key;
            this.#refresh();
        });
        const wrap = document.createElement("div");
        wrap.appendChild(row);
        if (node.children.length && this.open[node.key]) {
            for (const child of node.children) wrap.appendChild(this.#treeNode(child, depth + 1));
        }
        return wrap;
    }

    #renderAssets() {
        const grid = this.element.querySelector(".sdx-ddp-grid");
        const head = this.element.querySelector(".sdx-ddp-assets-head h3");
        const count = this.element.querySelector(".sdx-ddp-assets-head .asset-count");
        const node = this.#nodeByKey(this.viewKey);
        if (!node) return;
        const files = this.#nodeFiles(node);
        head.textContent = node.key;
        count.textContent = `${files.filter(file => this.selected.has(file.path)).length} / ${files.length}`;
        grid.innerHTML = files.map(file => {
            const selected = this.selected.has(file.path);
            return `<button type="button" class="sdx-ddp-thumb${selected ? " selected" : ""}" data-path="${escapeHtml(file.path)}" title="${escapeHtml(file.filename)}">
                <span class="sdx-ddp-check"></span><img src="${file.previewUrl}" loading="lazy" alt=""><span>${escapeHtml(formatLabel(file.filename))}</span>
            </button>`;
        }).join("");
        grid.querySelectorAll(".sdx-ddp-thumb").forEach(button => {
            button.addEventListener("click", () => {
                const path = button.dataset.path;
                this.selected.has(path) ? this.selected.delete(path) : this.selected.add(path);
                this.#refresh();
            });
        });
        this.element.querySelector("[data-action='all']")?.addEventListener("click", () => {
            for (const file of files) this.selected.add(file.path);
            this.#refresh();
        });
        this.element.querySelector("[data-action='none']")?.addEventListener("click", () => {
            for (const file of files) this.selected.delete(file.path);
            this.#refresh();
        });
    }

    #refresh() {
        this.render();
    }

    async #extract(selectedPaths) {
        if (this.extracting) return;
        const folderLabel = this.element.querySelector("#sdx-ddp-folder")?.value?.trim() || this.scan.meta.name || "Pack";
        this.extracting = true;
        this.progress = 0;
        this.total = selectedPaths ? selectedPaths.size : this.scan.totalAssets;
        this.status = "Creating folders...";
        this.render();

        try {
            const indexData = await extractDDPack(this.file, folderLabel, (done, total) => {
                this.progress = done;
                this.total = total;
                this.status = `Extracting... ${done} / ${total}`;
                if (done % 20 === 0 || done === total) this.render();
            }, selectedPaths);
            await upsertDDPack(indexData);
            await reloadDecorAssets();
            Hooks.callAll("sdx.decorAssetsImported");
            ui.notifications.info(`Dungeondraft pack "${indexData.name}" imported (${indexData.assetCount} assets).`);
            this.onDone?.(indexData);
            await this.close();
        } catch (err) {
            console.error(`${MODULE_ID} | Dungeondraft import failed:`, err);
            ui.notifications.error(`Import failed: ${err?.message || err}`);
            this.extracting = false;
            this.status = "";
            this.render();
        }
    }
}
