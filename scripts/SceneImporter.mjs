/**
 * SceneImporter: Imports a Foundry VTT scene from a ZIP file exported by SceneExporter
 */

const MODULE_ID = "shadowdark-extras";

export class SceneImporter {

    /**
     * Prompt user to select a ZIP file to import
     */
    static async promptImport() {
        if (typeof JSZip === "undefined") {
            ui.notifications.error("JSZip library not loaded. Please reload Foundry.");
            return;
        }

        const template = `
            <div class="form-group">
                <label>Select Scene Archive</label>
                <div class="form-fields">
                    <input type="file" accept=".zip,.txt" id="import-file" />
                </div>
                <p class="notes">Select a .zip or .txt file exported by Shadowdark Extras.</p>
            </div>
        `;

        new Dialog({
            title: "Import Scene",
            content: template,
            buttons: {
                import: {
                    icon: '<i class="fas fa-file-import"></i>',
                    label: "Import",
                    callback: async (html) => {
                        const input = html.find("#import-file")[0];
                        const file = input.files[0];
                        if (!file) {
                            ui.notifications.warn("No file selected.");
                            return;
                        }
                        await this.importScene(file);
                    }
                },
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancel"
                }
            },
            default: "import"
        }).render(true);
    }

    /**
     * Main import function
     * @param {File} file - The ZIP file object 
     */
    static async importScene(file) {
        ui.notifications.info(`Reading archive: ${file.name}...`);
        console.log(`${MODULE_ID} | Starting import of: ${file.name}`);

        try {
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(file);

            // Validation
            if (!zipContent.file("scene.json") || !zipContent.file("manifest.json")) {
                throw new Error("Invalid archive: missing scene.json or manifest.json");
            }

            const manifest = JSON.parse(await zipContent.file("manifest.json").async("string"));
            console.log(`${MODULE_ID} | Manifest loaded:`, manifest);

            // Determine unique scene name
            let sceneName = manifest.sceneName || "Imported Scene";
            sceneName = await this.getUniqueDocumentName("Scene", sceneName);

            ui.notifications.info(`Importing as "${sceneName}"... (this may take a moment)`);

            // 1. Extract and Upload Assets
            const assetMap = await this.processAssets(zipContent, sceneName);

            // 2. Create Documents (Actors, Items, Journals)
            const idMap = await this.createDocuments(zipContent, sceneName, assetMap);

            // 3. Create Scene
            await this.createScene(zipContent, sceneName, assetMap, idMap);

            ui.notifications.info(`Scene "${sceneName}" imported successfully!`);
        } catch (error) {
            console.error(`${MODULE_ID} | Import failed:`, error);
            ui.notifications.error(`Import failed: ${error.message}`);
        }
    }

    /**
     * ensure unique name for a document type
     */
    static async getUniqueDocumentName(collectionName, baseName) {
        let name = baseName;
        let counter = 1;
        const collection = game.collections.get(collectionName) || game[collectionName.toLowerCase() + "s"];
        if (!collection) return baseName;

        while (collection.getName(name)) {
            name = `${baseName} (${counter++})`;
        }
        return name;
    }

    /**
     * Extract assets from ZIP and upload
     * @returns {Map<string, string>} Map of original path -> new local path
     */
    static async processAssets(zip, sceneName) {
        const assetMap = new Map();
        const assetsFolder = zip.folder("assets");

        if (!assetsFolder) return assetMap;

        // Prepare target directory: Data/imported-scenes/<SafeSceneName>/assets
        const safeName = this.sanitizeFilename(sceneName);
        const baseDir = "imported-scenes";
        const sceneDir = `${baseDir}/${safeName}`;

        // Ensure directories exist
        await this.ensureDirectory("data", baseDir);
        await this.ensureDirectory("data", sceneDir);

        const filesToUpload = [];

        // Gather all files first
        zip.folder("assets").forEach((relativePath, zipEntry) => {
            if (zipEntry.dir) return; // Skip directories
            filesToUpload.push({ path: relativePath, entry: zipEntry });
        });

        // Upload sequentially 
        for (const fileItem of filesToUpload) {
            const category = fileItem.path.split('/')[0]; // e.g., 'tokens'
            let filename = fileItem.path.split('/').pop();

            // SANITIZE: Remove query strings if present (fixes issues with previous exports)
            if (filename.includes('?')) {
                filename = filename.split('?')[0];
            }

            const blob = await fileItem.entry.async("blob");
            const file = new File([blob], filename, { type: blob.type });

            const uploadDir = `${sceneDir}/${category}`; // Clean structure
            await this.ensureDirectory("data", uploadDir);

            try {
                // Determine mimetype manually if missing to help FilePicker
                const options = {}; // could add type?

                await FilePicker.upload("data", uploadDir, file, {}, { notify: false });
                // const newPath = `${uploadDir}/${filename}`;
                // We actually don't trust the return path blindly, constructing it is safer if we know where we put it.
            } catch (e) {
                console.warn(`${MODULE_ID} | Failed to upload ${filename}`, e);
            }
        }

        // Build the full Asset Map using image-paths.json
        if (zip.file("image-paths.json")) {
            const pathMapping = JSON.parse(await zip.file("image-paths.json").async("string"));
            for (const [originalPath, relativePath] of Object.entries(pathMapping)) {
                // relativePath might contain query strings from bad exports e.g. "assets/tokens/img.webp?123"
                // We need to clean it to match the file we just uploaded: "tokens/img.webp"

                let cleanRelative = relativePath.replace(/^assets\//, "");
                if (cleanRelative.includes('?')) {
                    cleanRelative = cleanRelative.split('?')[0];
                }

                const newPath = `${sceneDir}/${cleanRelative}`;
                assetMap.set(originalPath, newPath);
            }
        }

        return assetMap;
    }

    /**
     * Create Actors, Items, Journals from the zip
     * @returns {Object} Maps of OldID -> NewID
     */
    static async createDocuments(zip, sceneName, assetMap) {
        const idMap = {
            Actor: new Map(),
            Item: new Map(),
            JournalEntry: new Map()
        };

        const createDocs = async (type, filename, collectionName) => {
            // SKIP ITEMS: They are embedded in Actors and importing them separately causes massive redundancy.
            if (type === "Item") return;

            const file = zip.file(`documents/${filename}`);
            if (!file) return;

            const content = await file.async("string");
            // Replace asset paths in the raw JSON before parsing
            const processedContent = this.replaceStringPaths(content, assetMap);
            const docsData = JSON.parse(processedContent);

            // Create Folder
            const folder = await this.getOrCreateFolder(type, sceneName);

            for (const docData of docsData) {
                const oldId = docData._id;
                delete docData._id; // New ID
                docData.folder = folder.id;

                // Strip ownership/permission to defaults
                // docData.ownership = { default: 0 }; 

                try {
                    const cls = getDocumentClass(type);
                    const doc = await cls.create(docData);
                    idMap[type].set(oldId, doc.id);
                    console.log(`${MODULE_ID} | Created ${type}: ${doc.name}`);
                } catch (e) {
                    console.error(`${MODULE_ID} | Failed to create ${type}:`, e);
                }
            }
        };

        await createDocs("Actor", "actors.json", "actors");
        await createDocs("Item", "items.json", "items");
        await createDocs("JournalEntry", "journals.json", "journal");

        return idMap;
    }

    /**
     * Create the final scene
     */
    static async createScene(zip, sceneName, assetMap, idMap) {
        const file = zip.file("scene.json");
        if (!file) return;

        let content = await file.async("string");

        // 1. Replace Asset Paths
        content = this.replaceStringPaths(content, assetMap);

        // 2. Parse
        const sceneData = JSON.parse(content);

        // 3. Update Document IDs (Tokens, Notes)
        // Tokens
        if (sceneData.tokens) {
            sceneData.tokens.forEach(token => {
                if (token.actorId && idMap.Actor.has(token.actorId)) {
                    token.actorId = idMap.Actor.get(token.actorId);
                }
            });
        }

        // Notes (Journal Pins)
        if (sceneData.notes) {
            sceneData.notes.forEach(note => {
                if (note.entryId && idMap.JournalEntry.has(note.entryId)) {
                    note.entryId = idMap.JournalEntry.get(note.entryId);
                }
            });
        }

        // Clean up
        delete sceneData._id;
        sceneData.name = sceneName;
        // Optionally put scene in a folder too? User didn't ask, but good practice.
        // Let's stick to root for scenes unless requested.

        await Scene.create(sceneData);
    }

    /**
     * Global replace of mapped strings
     */
    static replaceStringPaths(content, map) {
        let newContent = content;
        for (const [oldPath, newPath] of map.entries()) {
            // Escape special regex chars in oldPath
            const escapedOld = oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedOld, 'g');
            newContent = newContent.replace(regex, newPath);
        }
        return newContent;
    }

    static async getOrCreateFolder(type, name) {
        let folder = game.folders.find(f => f.type === type && f.name === name);
        if (!folder) {
            folder = await Folder.create({ name: name, type: type, color: "#450d0d" });
        }
        return folder;
    }

    static async ensureDirectory(source, path) {
        try {
            await FilePicker.browse(source, path);
        } catch (e) {
            await FilePicker.createDirectory(source, path);
        }
    }

    static sanitizeFilename(name) {
        return name.replace(/[^a-z0-9_\-]/gi, "_").toLowerCase();
    }
}
