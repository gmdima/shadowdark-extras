import { TOM_CONFIG as CONFIG } from '../TomConfig.mjs';
import { TomSocketHandler } from './TomSocketHandler.mjs';

class TomSceneModel {
  constructor(data = {}) {
    this.id = data.id || foundry.utils.randomID();
    this.name = data.name || 'New Scene';
    this.type = 'scene';
    this.background = data.background || 'modules/shadowdark-extras/assets/default-scene.jpg';
    this.bgType = data.bgType || 'image';
    this.isArena = data.isArena || false;
    this.arenaType = data.arenaType || 'isometric';
    this.inAnimation = data.inAnimation || 'fade';
    this.outAnimation = data.outAnimation || 'fade';
    this.folderId = data.folderId || null;
  }

  get thumbnail() {
    return this.background;
  }

  get image() {
    return this.background;
  }

  toJSON() {
    const { id, name, type, background, bgType, isArena, arenaType, inAnimation, outAnimation, folderId } = this;
    return {
      id,
      name,
      type,
      background,
      bgType,
      isArena,
      arenaType,
      inAnimation,
      outAnimation,
      folderId
    };
  }
}

export class TomStoreClass {
  constructor() {
    this.scenes = new foundry.utils.Collection();
    this.folders = [];
    this.activeSceneId = null;
    this.currentOverlay = null;
    this.isInitialized = false;

    // Sequence state for slideshow functionality
    this.sequenceState = {
      isActive: false,
      sceneId: null,
      currentIndex: 0,
      totalBackgrounds: 0,
      transitionType: 'dissolve',
      transitionDuration: 1.0,
      onEnd: 'stop'
    };
  }

  setActiveScene(id) {
    this.activeSceneId = id;
  }

  clearActiveScene() {
    this.activeSceneId = null;
  }

  async initialize() {
    if (this.isInitialized) return;
    console.log(`${CONFIG.MODULE_NAME} | Initializing Data Store`);

    await this._loadData();
    this.isInitialized = true;


    Hooks.on('updateSetting', (setting, data, options, userId) => {

      const newValue = data.value !== undefined ? data.value : data;

      if (setting.key === `${CONFIG.MODULE_ID}.${CONFIG.SETTINGS.SCENES}`) {
        this._loadScenes(newValue);

        if (this.activeSceneId) {
          import('../apps/TomPlayerView.mjs').then(({ TomPlayerView }) => {
            TomPlayerView.refresh();
          });
        }
      }

      if (setting.key === `${CONFIG.MODULE_ID}.tom-folders`) {
        const parsed = this._parseData(newValue);
        if (Array.isArray(parsed)) {
          this.folders = parsed;
        }
      }
    });
  }

  _parseData(data) {
    let parsed = data;
    if (typeof data === 'string') {
      try { parsed = JSON.parse(data); } catch (e) {
        console.warn(`${CONFIG.MODULE_NAME} | Failed to parse data string: `, e);
      }
    }
    if (!Array.isArray(parsed) && typeof parsed === 'object' && parsed !== null) {
      parsed = Object.values(parsed);
    }
    return Array.isArray(parsed) ? parsed : null;
  }

  _loadScenes(data) {
    const scenes = this._parseData(data);
    if (!scenes) {
      console.warn(`${CONFIG.MODULE_NAME} | Received invalid scenes data(type: ${typeof data}): `, data);
      return;
    }
    this.scenes.clear();
    scenes.forEach(d => this.scenes.set(d.id, new TomSceneModel(d)));

  }

  async _loadData() {
    const scenesData = game.settings.get(CONFIG.MODULE_ID, CONFIG.SETTINGS.SCENES) || [];
    this.scenes.clear();
    scenesData.forEach(d => this.scenes.set(d.id, new TomSceneModel(d)));

    // Load folders
    try {
      this.folders = game.settings.get(CONFIG.MODULE_ID, 'tom-folders') || [];
    } catch (e) {
      this.folders = [];
    }

    console.log(`${CONFIG.MODULE_NAME} | Loaded ${this.scenes.size} scenes, ${this.folders.length} folders.`);
  }

  async saveData() {
    if (!this.isInitialized) return;

    const scenesData = this.scenes.map(s => s.toJSON());
    await game.settings.set(CONFIG.MODULE_ID, CONFIG.SETTINGS.SCENES, scenesData);
  }

  async saveFolders() {
    if (!this.isInitialized) return;
    await game.settings.set(CONFIG.MODULE_ID, 'tom-folders', foundry.utils.deepClone(this.folders));
  }

  getScenes() {
    return this.scenes.contents;
  }

  createScene(data) {
    const scene = new TomSceneModel(data);
    this.scenes.set(scene.id, scene);
    this.saveData();
    return scene;
  }

  deleteItem(id, type) {
    if (type === 'scene') {
      if (this.activeSceneId === id) {
        const scene = this.scenes.get(id);
        const outAnimation = scene?.outAnimation || 'fade';
        TomSocketHandler.emitStopBroadcast(outAnimation);
      }
      this.scenes.delete(id);
    }
    this.saveData();
  }

  reorderScenes(sceneIds) {
    // Create a new collection with scenes in the specified order
    const newScenes = new foundry.utils.Collection();

    // Add scenes in the new order
    for (const id of sceneIds) {
      const scene = this.scenes.get(id);
      if (scene) {
        newScenes.set(id, scene);
      }
    }

    // Replace the scenes collection
    this.scenes = newScenes;

    // Save the new order
    this.saveData();
  }

  // ── Folder Management ──────────────────────────────────────────

  /**
   * Create a new folder
   * @param {string} name - Folder name
   * @returns {object} The created folder { id, name, collapsed }
   */
  createFolder(name = 'New Folder') {
    const folder = {
      id: foundry.utils.randomID(),
      name,
      collapsed: false
    };
    this.folders.push(folder);
    this.saveFolders();
    return folder;
  }

  /**
   * Rename a folder
   * @param {string} folderId
   * @param {string} newName
   */
  renameFolder(folderId, newName) {
    const folder = this.folders.find(f => f.id === folderId);
    if (folder) {
      folder.name = newName;
      this.saveFolders();
    }
  }

  /**
   * Delete a folder (scenes inside become uncategorized)
   * @param {string} folderId
   */
  deleteFolder(folderId) {
    this.folders = this.folders.filter(f => f.id !== folderId);
    // Unassign all scenes that were in this folder
    for (const scene of this.scenes.values()) {
      if (scene.folderId === folderId) {
        scene.folderId = null;
      }
    }
    this.saveFolders();
    this.saveData();
  }

  /**
   * Toggle folder collapsed state
   * @param {string} folderId
   */
  toggleFolderCollapsed(folderId) {
    const folder = this.folders.find(f => f.id === folderId);
    if (folder) {
      folder.collapsed = !folder.collapsed;
      this.saveFolders();
    }
  }

  /**
   * Move a scene into a folder (or null to uncategorize)
   * @param {string} sceneId
   * @param {string|null} folderId
   */
  moveSceneToFolder(sceneId, folderId) {
    const scene = this.scenes.get(sceneId);
    if (scene) {
      scene.folderId = folderId;
      this.saveData();
    }
  }

  /**
   * Get all scenes in a specific folder
   * @param {string|null} folderId - Folder ID, or null for uncategorized
   * @returns {Array} Array of TomSceneModel
   */
  getScenesInFolder(folderId) {
    return this.scenes.filter(s => (s.folderId || null) === folderId);
  }

  /**
   * Get the folder a scene belongs to
   * @param {string} sceneId
   * @returns {object|null} The folder object, or null if uncategorized
   */
  getSceneFolder(sceneId) {
    const scene = this.scenes.get(sceneId);
    if (!scene || !scene.folderId) return null;
    return this.folders.find(f => f.id === scene.folderId) || null;
  }

}

export const TomStore = new TomStoreClass();
