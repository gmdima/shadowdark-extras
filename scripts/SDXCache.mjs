/**
 * SDX Caching Utility
 * Handles persistent storage of metadata and binary assets using IndexedDB
 */

const DB_NAME = "shadowdark-extras-cache";
const DB_VERSION = 1;
const STORE_METADATA = "metadata";
const STORE_BINARY = "binary";

class SDXCache {
    constructor() {
        this.db = null;
        this._blobUrls = new Map();
    }

    /**
     * Initialize the IndexedDB database
     * @returns {Promise<IDBDatabase>}
     */
    /**
     * Get a display source for a path (Blob URL if cached, file path if not)
     * @param {string} path 
     * @returns {Promise<string>}
     */
    async getCachedSrc(path) {
        // Return existing Object URL if we already created one this session
        if (this._blobUrls.has(path)) {
            return this._blobUrls.get(path);
        }

        // Try to get Blob from IndexedDB
        const blob = await this.getBinary(path);
        if (blob) {
            const blobUrl = URL.createObjectURL(blob);
            this._blobUrls.set(path, blobUrl);
            return blobUrl;
        }

        // Fallback to original path
        return path;
    }

    /**
     * Revoke all generated Blob URLs to free memory
     */
    revokeObjectURLs() {
        for (const url of this._blobUrls.values()) {
            URL.revokeObjectURL(url);
        }
        this._blobUrls.clear();
    }

    /**
     * Initialize the IndexedDB database
     * @returns {Promise<IDBDatabase>}
     */
    async init() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // Store for JSON metadata (file listing etc.)
                if (!db.objectStoreNames.contains(STORE_METADATA)) {
                    db.createObjectStore(STORE_METADATA);
                }
                // Store for Blobs (image data)
                if (!db.objectStoreNames.contains(STORE_BINARY)) {
                    db.createObjectStore(STORE_BINARY);
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error("SDX | IndexedDB error:", event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * Get a value from a store
     * @param {string} storeName - Name of the object store
     * @param {string} key - Key to retrieve
     * @returns {Promise<any|null>}
     */
    async _get(storeName, key) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction(storeName, "readonly");
                const store = transaction.objectStore(storeName);
                const request = store.get(key);

                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error);
            } catch (err) {
                console.warn(`SDX | Error getting ${key} from ${storeName}:`, err);
                resolve(null);
            }
        });
    }

    /**
     * Set a value in a store
     * @param {string} storeName - Name of the object store
     * @param {string} key - Key to store
     * @param {any} value - Value to store
     * @returns {Promise<void>}
     */
    async _set(storeName, key, value) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction(storeName, "readwrite");
                const store = transaction.objectStore(storeName);
                const request = store.put(value, key);

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            } catch (err) {
                console.error(`SDX | Error setting ${key} in ${storeName}:`, err);
                reject(err);
            }
        });
    }

    /**
     * Get metadata value
     * @param {string} key 
     * @returns {Promise<any|null>}
     */
    async getMetadata(key) {
        return this._get(STORE_METADATA, key);
    }

    /**
     * Set metadata value
     * @param {string} key 
     * @param {any} data 
     */
    async setMetadata(key, data) {
        return this._set(STORE_METADATA, key, data);
    }

    /**
     * Get binary data (Blob)
     * @param {string} key 
     * @returns {Promise<Blob|null>}
     */
    async getBinary(key) {
        return this._get(STORE_BINARY, key);
    }

    /**
     * Set binary data (Blob)
     * @param {string} key 
     * @param {Blob} blob 
     */
    async setBinary(key, blob) {
        return this._set(STORE_BINARY, key, blob);
    }

    /**
     * Clear all caches
     */
    async clear() {
        const db = await this.init();
        this.revokeObjectURLs();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_METADATA, STORE_BINARY], "readwrite");
            transaction.objectStore(STORE_METADATA).clear();
            transaction.objectStore(STORE_BINARY).clear();
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }
}

// Singleton instance
export const cache = new SDXCache();
