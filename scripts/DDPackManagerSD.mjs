/**
 * SDX Dungeondraft pack manager.
 *
 * Dungeondraft packs are Godot PCK files (GDPC magic). SDX extracts object
 * textures into Data/decor/ddpacks so they appear in the Decor painter only.
 */

const MODULE_ID = "shadowdark-extras";
const SETTING_KEY = "decorDungeondraftPacks";
export const DD_DECOR_BASE = "decor/ddpacks";

const FilePickerImpl = () => foundry.applications.apps.FilePicker?.implementation ?? globalThis.FilePicker;

function parsePCK(buffer) {
    const view = new DataView(buffer);
    const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (magic !== "GDPC") throw new Error("Not a valid Dungeondraft pack file (missing GDPC magic).");

    let pos = 4 + 4 + 4 + 4 + 4 + 64;
    const fileCount = view.getUint32(pos, true);
    pos += 4;

    const files = [];
    for (let i = 0; i < fileCount; i++) {
        const pathLen = view.getUint32(pos, true);
        pos += 4;
        const path = new TextDecoder().decode(new Uint8Array(buffer, pos, pathLen));
        pos += pathLen;
        const offset = Number(view.getBigUint64(pos, true));
        pos += 8;
        const size = Number(view.getBigUint64(pos, true));
        pos += 8;
        pos += 16;
        files.push({ path, offset, size });
    }
    return files;
}

function readEntry(buffer, entry) {
    return new Uint8Array(buffer, entry.offset, entry.size);
}

function objectTextureEntries(files) {
    return files.filter(f => f.path.includes("/textures/objects/") && /\.(png|webp)$/i.test(f.path));
}

function objectPathParts(entryPath) {
    const afterObjects = entryPath.split("/textures/objects/")[1] || "";
    const slash = afterObjects.lastIndexOf("/");
    return {
        category: slash >= 0 ? afterObjects.slice(0, slash) : "",
        filename: slash >= 0 ? afterObjects.slice(slash + 1) : afterObjects
    };
}

function sanitizePathPart(part) {
    return String(part || "")
        .replace(/\\/g, "/")
        .replace(/[<>:"|?*\x00-\x1F]/g, "_")
        .replace(/^\.+$/, "_")
        .trim();
}

function sanitizePackId(id, fallback = "pack") {
    return sanitizePathPart(id || fallback).replace(/[^a-zA-Z0-9_-]/g, "_") || fallback;
}

function formatLabel(filename) {
    return String(filename || "")
        .replace(/\.(png|webp)$/i, "")
        .replace(/[_-]+/g, " ")
        .replace(/\s*\d+x\d+\s*$/i, "")
        .replace(/\s+/g, " ")
        .trim();
}

async function ensureDirectory(path) {
    const FP = FilePickerImpl();
    const parts = String(path || "").split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        try {
            await FP.browse("data", current);
        } catch {
            await FP.createDirectory("data", current);
        }
    }
}

export function getDDPacks() {
    try {
        return game.settings.get(MODULE_ID, SETTING_KEY) || [];
    } catch {
        return [];
    }
}

export async function saveDDPacks(packs) {
    await game.settings.set(MODULE_ID, SETTING_KEY, packs);
}

export async function scanDDPack(file) {
    const buffer = await file.arrayBuffer();
    const files = parsePCK(buffer);
    const packJsonEntry = files.find(f => f.path.endsWith("pack.json") && !f.path.includes("/data/"));
    if (!packJsonEntry) throw new Error("pack.json not found in pack.");

    const meta = JSON.parse(new TextDecoder().decode(readEntry(buffer, packJsonEntry)));
    const objectFiles = objectTextureEntries(files);
    if (!objectFiles.length) throw new Error("No object textures found in this pack.");

    const categoryMap = new Map();
    for (const entry of objectFiles) {
        const { category, filename } = objectPathParts(entry.path);
        const key = category || "__root__";
        if (!categoryMap.has(key)) categoryMap.set(key, []);
        const bytes = readEntry(buffer, entry);
        const mime = /\.png$/i.test(filename) ? "image/png" : "image/webp";
        const previewUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
        categoryMap.get(key).push({ path: entry.path, filename, category, previewUrl });
    }

    const categories = [...categoryMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, files]) => ({ name, files }));

    return { meta, categories, totalAssets: objectFiles.length };
}

export async function extractDDPack(file, folderLabel, onProgress, selectedPaths = null) {
    const buffer = await file.arrayBuffer();
    const files = parsePCK(buffer);
    const packJsonEntry = files.find(f => f.path.endsWith("pack.json") && !f.path.includes("/data/"));
    if (!packJsonEntry) throw new Error("pack.json not found in pack.");

    const meta = JSON.parse(new TextDecoder().decode(readEntry(buffer, packJsonEntry)));
    const packId = sanitizePackId(meta.id, meta.name || "pack");
    const allObjects = objectTextureEntries(files);
    let objects = selectedPaths ? allObjects.filter(f => selectedPaths.has(f.path)) : allObjects;
    if (selectedPaths && !objects.length && allObjects.length) objects = allObjects;
    if (!objects.length) throw new Error("No selected object textures to extract.");

    const basePath = `${DD_DECOR_BASE}/${packId}`;
    const dirs = new Set([DD_DECOR_BASE, basePath, `${basePath}/objects`]);
    for (const entry of objects) {
        const { category } = objectPathParts(entry.path);
        if (!category) continue;
        const parts = category.split("/").map(sanitizePathPart).filter(Boolean);
        for (let i = 1; i <= parts.length; i++) {
            dirs.add(`${basePath}/objects/${parts.slice(0, i).join("/")}`);
        }
    }

    for (const dir of [...dirs].sort((a, b) => a.length - b.length || a.localeCompare(b))) {
        try {
            await ensureDirectory(dir);
        } catch (err) {
            console.warn(`${MODULE_ID} | Could not create Dungeondraft directory ${dir}:`, err);
        }
    }

    const FP = FilePickerImpl();
    let uploaded = 0;
    for (const entry of objects) {
        const { category, filename } = objectPathParts(entry.path);
        if (!filename) continue;
        const safeCategory = category.split("/").map(sanitizePathPart).filter(Boolean).join("/");
        const uploadDir = safeCategory ? `${basePath}/objects/${safeCategory}` : `${basePath}/objects`;
        const mime = /\.png$/i.test(filename) ? "image/png" : "image/webp";
        const blob = new Blob([readEntry(buffer, entry)], { type: mime });
        const uploadFile = new File([blob], sanitizePathPart(filename), { type: mime });
        try {
            await FP.upload("data", uploadDir, uploadFile, {}, { notify: false });
        } catch (err) {
            console.warn(`${MODULE_ID} | Could not upload Dungeondraft asset ${filename}:`, err);
        }
        uploaded++;
        onProgress?.(uploaded, objects.length);
    }

    const indexData = {
        packId,
        name: meta.name || file.name.replace(/\.dungeondraft_pack$/i, ""),
        author: meta.author || "",
        version: meta.version || "",
        folderLabel: folderLabel || meta.name || packId,
        assetCount: objects.length,
        enabled: true
    };

    const indexFile = new File(
        [new Blob([JSON.stringify(indexData, null, 2)], { type: "application/json" })],
        "_index.json",
        { type: "application/json" }
    );
    try {
        await FP.upload("data", basePath, indexFile, {}, { notify: false });
    } catch {
        // Index is helpful but not required for tray loading.
    }

    return indexData;
}

export async function upsertDDPack(pack) {
    const packs = getDDPacks();
    const existing = packs.findIndex(p => p.packId === pack.packId);
    if (existing >= 0) packs[existing] = { ...packs[existing], ...pack, enabled: pack.enabled ?? packs[existing].enabled ?? true };
    else packs.push({ ...pack, enabled: pack.enabled ?? true });
    await saveDDPacks(packs);
}

export async function setDDPackEnabled(packId, enabled) {
    const packs = getDDPacks().map(pack => pack.packId === packId ? { ...pack, enabled: !!enabled } : pack);
    await saveDDPacks(packs);
}

export async function removeDDPack(packId) {
    await saveDDPacks(getDDPacks().filter(pack => pack.packId !== packId));
}

export async function loadDDPackDecorTiles() {
    const packs = getDDPacks().filter(pack => pack.enabled !== false);
    const FP = FilePickerImpl();
    const tiles = [];

    for (const pack of packs) {
        const root = `${DD_DECOR_BASE}/${pack.packId}/objects`;
        const queue = [{ dir: root, category: "" }];
        while (queue.length) {
            const { dir, category } = queue.shift();
            let listing;
            try {
                listing = await FP.browse("data", dir);
            } catch {
                continue;
            }

            for (const filePath of listing.files || []) {
                if (!/\.(png|webp)$/i.test(filePath)) continue;
                const filename = filePath.split("/").pop() || "";
                const groupLabel = pack.folderLabel || pack.name || pack.packId;
                const categoryLabel = category ? `${groupLabel} / ${category}` : groupLabel;
                const categoryKey = category
                    ? `ddpack/${pack.packId}/${category}`
                    : `ddpack/${pack.packId}/__root__`;
                tiles.push({
                    key: `${pack.packId}:${filePath}`,
                    label: formatLabel(filename),
                    path: filePath,
                    category: categoryKey,
                    categoryLabel,
                    packId: pack.packId,
                    packName: pack.name,
                    imported: true,
                    isDDPack: true
                });
            }

            for (const child of listing.dirs || []) {
                const name = decodeURIComponent(child.split("/").pop() || "");
                queue.push({ dir: child, category: category ? `${category}/${name}` : name });
            }
        }
    }

    return tiles;
}
