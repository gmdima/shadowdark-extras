/**
 * SceneExporter: Exports a Foundry VTT scene with all dependencies as a ZIP file
 */

const MODULE_ID = "shadowdark-extras";

export class SceneExporter {

    /**
     * Main export function - exports a scene as a ZIP file
     * @param {Scene} scene - The scene to export
     */
    static async exportScene(scene) {
        if (typeof JSZip === "undefined") {
            ui.notifications.error("JSZip library not loaded. Please reload Foundry.");
            return;
        }

        ui.notifications.info(`Exporting scene: ${scene.name}...`);

        try {
            // Collect all data
            const sceneData = await this.collectSceneData(scene);
            const referencedDocs = await this.collectReferencedDocuments(scene);
            const hexData = await this.collectHexData(scene);
            const images = await this.collectImages(sceneData, referencedDocs, hexData);

            // Create ZIP package
            const zipBlob = await this.createZipPackage(scene.name, sceneData, referencedDocs, images, hexData);

            // Trigger download
            await this.downloadZip(zipBlob, `${this.sanitizeFilename(scene.name)}.zip`);

            ui.notifications.info(`Scene "${scene.name}" exported successfully!`);
        } catch (error) {
            console.error(`${MODULE_ID} | Export failed:`, error);
            ui.notifications.error(`Export failed: ${error.message}`);
        }
    }

    /**
     * Collect scene configuration and embedded documents
     * @param {Scene} scene - The scene to collect data from
     * @returns {Object} Scene data object
     */
    static async collectSceneData(scene) {
        // Get the full scene data including embedded documents
        const sceneData = scene.toObject();

        console.log(`${MODULE_ID} | Collected scene data:`, {
            name: sceneData.name,
            walls: sceneData.walls?.length || 0,
            lights: sceneData.lights?.length || 0,
            sounds: sceneData.sounds?.length || 0,
            templates: sceneData.templates?.length || 0,
            tiles: sceneData.tiles?.length || 0,
            tokens: sceneData.tokens?.length || 0,
            drawings: sceneData.drawings?.length || 0,
            notes: sceneData.notes?.length || 0
        });

        return sceneData;
    }

    /**
     * Collect all referenced documents (actors, items, journals) from the scene
     * @param {Scene} scene - The scene to analyze
     * @returns {Object} Object containing arrays of referenced documents
     */
    static async collectReferencedDocuments(scene) {
        const referenced = {
            actors: new Map(),
            items: new Map(),
            journals: new Map()
        };

        // Collect actors from tokens
        for (const tokenData of scene.tokens) {
            if (tokenData.actorId) {
                const actor = game.actors.get(tokenData.actorId);
                if (actor && !referenced.actors.has(actor.id)) {
                    referenced.actors.set(actor.id, actor.toObject());

                    // Collect items from the actor
                    if (actor.items) {
                        for (const item of actor.items) {
                            if (!referenced.items.has(item.id)) {
                                referenced.items.set(item.id, item.toObject());
                            }
                        }
                    }
                }
            }
        }

        // Collect journals from notes
        for (const noteData of scene.notes || []) {
            if (noteData.entryId) {
                const journal = game.journal.get(noteData.entryId);
                if (journal && !referenced.journals.has(journal.id)) {
                    referenced.journals.set(journal.id, journal.toObject());
                }
            }
        }

        console.log(`${MODULE_ID} | Collected referenced documents:`, {
            actors: referenced.actors.size,
            items: referenced.items.size,
            journals: referenced.journals.size
        });

        return {
            actors: Array.from(referenced.actors.values()),
            items: Array.from(referenced.items.values()),
            journals: Array.from(referenced.journals.values())
        };
    }

    /**
     * Collect hex tooltip data for the scene
     * @param {Scene} scene - The scene to collect hex data from
     * @returns {Object|null} Hex data keyed by hexKey, or null if none
     */
    static async collectHexData(scene) {
        const journal = game.journal.find(j => j.name === "__sdx_hex_data__");
        if (!journal) return null;
        const allData = journal.getFlag(MODULE_ID, "hexData") ?? {};
        const sceneHexData = allData[scene.id];
        if (!sceneHexData || Object.keys(sceneHexData).length === 0) return null;
        console.log(`${MODULE_ID} | Collected hex tooltip data: ${Object.keys(sceneHexData).length} hexes`);
        return foundry.utils.deepClone(sceneHexData);
    }

    /**
     * Collect all image files referenced by the scene and documents
     * @param {Object} sceneData - Scene data object
     * @param {Object} referencedDocs - Referenced documents
     * @param {Object|null} hexData - Hex tooltip data
     * @returns {Object} Object mapping image paths to their fetched data
     */
    static async collectImages(sceneData, referencedDocs, hexData) {
        const images = new Map();

        // Helper to add image to collection
        const addImage = async (path, category) => {
            if (!path || path === "" || images.has(path)) return;

            // Skip data URLs
            if (path.startsWith("data:")) return;

            // Skip icons and system images unless they're user assets
            if (path.includes("/icons/") && !path.startsWith("worlds/") && !path.startsWith("modules/shadowdark")) {
                return;
            }

            try {
                const response = await fetch(path);
                if (response.ok) {
                    const blob = await response.blob();
                    images.set(path, { blob, category });
                    console.log(`${MODULE_ID} | Collected image: ${path} (${category})`);
                }
            } catch (error) {
                console.warn(`${MODULE_ID} | Failed to fetch image: ${path}`, error);
            }
        };

        // Collect scene background and foreground
        if (sceneData.background?.src) await addImage(sceneData.background.src, "backgrounds");
        if (sceneData.foreground) await addImage(sceneData.foreground, "backgrounds");

        // Collect tile images
        for (const tile of sceneData.tiles || []) {
            if (tile.texture?.src) await addImage(tile.texture.src, "tiles");
        }

        // Collect token images from scene
        for (const token of sceneData.tokens || []) {
            if (token.texture?.src) await addImage(token.texture.src, "tokens");
        }

        // Collect actor images
        for (const actor of referencedDocs.actors || []) {
            if (actor.img) await addImage(actor.img, "actors");
            if (actor.prototypeToken?.texture?.src) await addImage(actor.prototypeToken.texture.src, "tokens");
        }

        // Collect item images
        for (const item of referencedDocs.items || []) {
            if (item.img) await addImage(item.img, "items");
        }

        // Collect hex tooltip images
        if (hexData) {
            for (const record of Object.values(hexData)) {
                if (record.image) await addImage(record.image, "hex-images");
            }
        }

        console.log(`${MODULE_ID} | Collected ${images.size} images`);
        return images;
    }

    /**
     * Create a ZIP file with all scene data and assets
     * @param {string} sceneName - Name of the scene
     * @param {Object} sceneData - Scene data object
     * @param {Object} referencedDocs - Referenced documents
     * @param {Map} images - Map of image paths to blobs
     * @returns {Blob} ZIP file blob
     */
    static async createZipPackage(sceneName, sceneData, referencedDocs, images, hexData) {
        const zip = new JSZip();

        // Add scene data
        zip.file("scene.json", JSON.stringify(sceneData, null, 2));

        // Add hex tooltip data
        if (hexData) {
            zip.file("hex-data.json", JSON.stringify(hexData, null, 2));
        }

        // Add manifest with metadata
        const manifest = {
            version: "1.0",
            sceneName: sceneName,
            exportDate: new Date().toISOString(),
            foundryVersion: game.version,
            systemId: game.system.id,
            systemVersion: game.system.version,
            counts: {
                actors: referencedDocs.actors.length,
                items: referencedDocs.items.length,
                journals: referencedDocs.journals.length,
                images: images.size,
                hexTooltips: hexData ? Object.keys(hexData).length : 0
            }
        };
        zip.file("manifest.json", JSON.stringify(manifest, null, 2));

        // Add documents folder
        const docsFolder = zip.folder("documents");
        if (referencedDocs.actors.length > 0) {
            docsFolder.file("actors.json", JSON.stringify(referencedDocs.actors, null, 2));
        }
        if (referencedDocs.items.length > 0) {
            docsFolder.file("items.json", JSON.stringify(referencedDocs.items, null, 2));
        }
        if (referencedDocs.journals.length > 0) {
            docsFolder.file("journals.json", JSON.stringify(referencedDocs.journals, null, 2));
        }

        // Add image paths mapping
        const imagePaths = {};
        for (const [originalPath, imageData] of images) {
            const filename = this.getFilenameFromPath(originalPath);
            const newPath = `assets/${imageData.category}/${filename}`;
            imagePaths[originalPath] = newPath;
        }
        zip.file("image-paths.json", JSON.stringify(imagePaths, null, 2));

        // Add assets folder with images
        const assetsFolder = zip.folder("assets");
        for (const [originalPath, imageData] of images) {
            const filename = this.getFilenameFromPath(originalPath);
            const categoryFolder = assetsFolder.folder(imageData.category);
            categoryFolder.file(filename, imageData.blob);
        }

        // Generate ZIP
        console.log(`${MODULE_ID} | Generating ZIP file...`);
        const zipBlob = await zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: { level: 6 }
        });

        return zipBlob;
    }

    /**
     * Trigger download of the ZIP file
     * Downloads to browser's default download location (Downloads folder in Electron)
     * @param {Blob} blob - ZIP file blob
     * @param {string} filename - Filename for download
     */
    static async downloadZip(blob, filename) {
        try {
            // Foundry blocks .zip for security, so save as .txt and instruct user to rename
            const txtFilename = filename.replace(/\.zip$/i, '.txt');

            // Create a File object from the blob
            const file = new File([blob], txtFilename, { type: 'text/plain' });

            // Use FilePicker to upload the file to the user data directory
            const response = await FilePicker.upload("data", "exported-scenes", file, {}, { notify: false });

            if (response && response.path) {
                const fullPath = response.path;
                console.log(`${MODULE_ID} | File saved to: ${fullPath}`);

                Dialog.prompt({
                    title: "Scene Exported Successfully",
                    content: `
                        <p>Your scene has been exported to:</p>
                        <p><strong>${fullPath}</strong></p>
                        <p>Use the <strong>Import Scene</strong> button to import it into another world.</p>
                    `,
                    callback: () => { },
                    rejectClose: false
                });
            } else {
                throw new Error("File upload returned no path");
            }
        } catch (error) {
            console.error(`${MODULE_ID} | Save failed:`, error);
            ui.notifications.error(`Failed to save file: ${error.message}`);
        }
    }

    /**
     * Extract filename from a path
     * @param {string} path - File path
     * @returns {string} Filename
     */
    static getFilenameFromPath(path) {
        // Handle both forward and backslashes
        const parts = path.replace(/\\/g, "/").split("/");
        return parts[parts.length - 1].split('?')[0];
    }

    /**
     * Sanitize filename for safe file system use
     * @param {string} name - Original name
     * @returns {string} Sanitized name
     */
    static sanitizeFilename(name) {
        return name.replace(/[^a-z0-9_\-]/gi, "_").toLowerCase();
    }
}
