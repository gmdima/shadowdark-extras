import { TOM_CONFIG as CONFIG } from '../TomConfig.mjs';
import { TomSceneModel } from './TomSceneModel.mjs';
import { TomCharacterModel } from './TomCharacterModel.mjs';
import { TomFolderModel } from './TomFolderModel.mjs';
import { TomSocketHandler } from './TomSocketHandler.mjs';

export class TomStoreClass {
  constructor() {
    this.scenes = new foundry.utils.Collection();
    this.characters = new foundry.utils.Collection();
    this.folders = new foundry.utils.Collection();
    this.activeSceneId = null;
    this.currentOverlay = null; // Current video overlay path
    this.isInitialized = false;

    // Scene Sequence playback state (manual navigation by GM)
    this.sequenceState = {
      isActive: false,
      sceneId: null,
      currentIndex: 0,
      totalBackgrounds: 0,
      transitionType: 'dissolve',
      transitionDuration: 1.0,
      onEnd: 'stop'
    };

    // Cast-Only Mode state (cast without scene background)
    this.castOnlyState = {
      isActive: false,
      characterIds: [],
      layoutSettings: {
        preset: 'bottom-center',
        size: 'medium',
        spacing: 24,
        offsetX: 0,
        offsetY: 5
      }
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

    // Listen for external changes (Sync)
    Hooks.on('updateSetting', (setting, data, options, userId) => {
      // In Foundry V10+, setting updates are passed as {value: newValue}
      const newValue = data.value !== undefined ? data.value : data;

      if (setting.key === `${CONFIG.MODULE_ID}.${CONFIG.SETTINGS.SCENES}`) {
        this._loadScenes(newValue);
        // If active scene was updated, refresh views
        if (this.activeSceneId) {
          import('../apps/TomPlayerView.mjs').then(({ TomPlayerView }) => {
            TomPlayerView.refresh();
          });
        }
      }
      if (setting.key === `${CONFIG.MODULE_ID}.${CONFIG.SETTINGS.CHARACTERS}`) {
        this._loadCharacters(newValue);
      }
      if (setting.key === `${CONFIG.MODULE_ID}.${CONFIG.SETTINGS.FOLDERS}`) {
        this._loadFolders(newValue);
      }
    });
  }

  _parseData(data) {
    let parsed = data;
    if (typeof data === 'string') {
      try { parsed = JSON.parse(data); } catch (e) {
        console.warn(`${CONFIG.MODULE_NAME} | Failed to parse data string:`, e);
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
      console.warn(`${CONFIG.MODULE_NAME} | Received invalid scenes data (type: ${typeof data}):`, data);
      return;
    }
    this.scenes.clear();
    scenes.forEach(d => this.scenes.set(d.id, new TomSceneModel(d)));

  }

  _loadCharacters(data) {
    const chars = this._parseData(data);
    if (!chars) {
      console.warn(`${CONFIG.MODULE_NAME} | Received invalid characters data (type: ${typeof data}):`, data);
      return;
    }
    this.characters.clear();
    chars.forEach(d => this.characters.set(d.id, new TomCharacterModel(d)));

  }

  _loadFolders(data) {
    const folders = this._parseData(data);
    if (!folders) {
      console.warn(`${CONFIG.MODULE_NAME} | Received invalid folders data (type: ${typeof data}):`, data);
      return;
    }
    this.folders.clear();
    folders.forEach(d => this.folders.set(d.id, new TomFolderModel(d)));

  }

  async _loadData() {
    // Load Scenes
    const scenesData = game.settings.get(CONFIG.MODULE_ID, CONFIG.SETTINGS.SCENES) || [];
    this.scenes.clear();
    scenesData.forEach(d => this.scenes.set(d.id, new TomSceneModel(d)));

    // Load Characters
    const charsData = game.settings.get(CONFIG.MODULE_ID, CONFIG.SETTINGS.CHARACTERS) || [];
    this.characters.clear();
    charsData.forEach(d => this.characters.set(d.id, new TomCharacterModel(d)));

    // Load Folders
    const foldersData = game.settings.get(CONFIG.MODULE_ID, CONFIG.SETTINGS.FOLDERS) || [];
    this.folders.clear();
    foldersData.forEach(d => this.folders.set(d.id, new TomFolderModel(d)));

    console.log(`${CONFIG.MODULE_NAME} | Loaded ${this.scenes.size} scenes, ${this.characters.size} characters.`);
  }

  async saveData() {
    if (!this.isInitialized) return;

    const scenesData = this.scenes.map(s => s.toJSON());
    const charsData = this.characters.map(c => c.toJSON());
    const foldersData = this.folders.map(f => f.toJSON());

    await Promise.all([
      game.settings.set(CONFIG.MODULE_ID, CONFIG.SETTINGS.SCENES, scenesData),
      game.settings.set(CONFIG.MODULE_ID, CONFIG.SETTINGS.CHARACTERS, charsData),
      game.settings.set(CONFIG.MODULE_ID, CONFIG.SETTINGS.FOLDERS, foldersData)
    ]);


  }



  getScenes(options = {}) {
    let scenes = this.scenes.contents;
    if (options.search) {
      const search = options.search.toLowerCase();
      scenes = scenes.filter(s => s.name.toLowerCase().includes(search));
    }
    if (options.favorite) {
      scenes = scenes.filter(s => s.favorite);
    }
    // Tag Filtering (AND Logic)
    if (options.tags && options.tags.length > 0) {
      scenes = scenes.filter(s => options.tags.every(tag => s.tags.includes(tag)));
    }

    // Tag Exclusion (NOT Logic)
    if (options.excludedTags && options.excludedTags.length > 0) {
      scenes = scenes.filter(s => !options.excludedTags.some(tag => s.tags.includes(tag)));
    }

    return scenes;
  }

  getCharacters(options = {}) {
    let chars = this.characters.contents;

    // Search
    if (options.search) {
      const search = options.search.toLowerCase();
      chars = chars.filter(c => c.name.toLowerCase().includes(search) || Array.from(c.tags).some(t => t.toLowerCase().includes(search)));
    }

    // Favorites
    if (options.favorite) {
      chars = chars.filter(c => c.favorite);
    }

    // Tag Filtering (AND Logic)
    if (options.tags && options.tags.length > 0) {
      chars = chars.filter(c => options.tags.every(tag => c.tags.has(tag)));
    }

    // Tag Exclusion (NOT Logic)
    if (options.excludedTags && options.excludedTags.length > 0) {
      chars = chars.filter(c => !options.excludedTags.some(tag => c.tags.has(tag)));
    }

    return chars;
  }

  getAllTags(type = 'all') {
    const tags = new Set();

    if (type === 'all' || type === 'character') {
      this.characters.forEach(c => {
        c.tags.forEach(t => tags.add(t));
      });
    }

    if (type === 'all' || type === 'scene') {
      this.scenes.forEach(s => {
        if (s.tags) s.tags.forEach(t => tags.add(t));
      });
    }

    return Array.from(tags).sort();
  }


  createScene(data) {
    const scene = new TomSceneModel(data);
    this.scenes.set(scene.id, scene);
    this.saveData();
    return scene;
  }

  addCastMember(sceneId, charId) {
    const scene = this.scenes.get(sceneId);
    const character = this.characters.get(charId);

    if (scene && character) {
      // Prevent duplicates
      if (scene.cast.some(c => c.id === charId)) return;

      scene.cast.push({ id: character.id, name: character.name, image: character.image });
      this.saveData();

      // Live Update
      if (this.activeSceneId === sceneId) {
        TomSocketHandler.emitUpdateCast(sceneId);
      }
    }
  }

  removeCastMember(sceneId, charId) {
    const scene = this.scenes.get(sceneId);
    if (scene) {
      scene.cast = scene.cast.filter(c => c.id !== charId);
      this.saveData();

      // Live Update
      if (this.activeSceneId === sceneId) {
        TomSocketHandler.emitUpdateCast(sceneId);
      }
    }
  }

  reorderCastMember(sceneId, fromIndex, toIndex) {
    const scene = this.scenes.get(sceneId);
    if (!scene || fromIndex === toIndex) return;

    // Remover o item da posição original
    const [movedItem] = scene.cast.splice(fromIndex, 1);

    // Inserir na nova posição
    scene.cast.splice(toIndex, 0, movedItem);

    this.saveData();

    // Live Update
    if (this.activeSceneId === sceneId) {
      TomSocketHandler.emitUpdateCast(sceneId);
    }
  }

  createCharacter(data) {
    const character = new TomCharacterModel(data);
    this.characters.set(character.id, character);
    this.saveData();
    return character;
  }

  deleteItem(id, type) {
    if (type === 'scene') {
      this.scenes.delete(id);
    } else {
      this.characters.delete(id);
    }
    this.saveData();
  }


  createFolder(data) {
    const folder = new TomFolderModel(data);
    this.folders.set(folder.id, folder);
    this.saveData();
    return folder;
  }

  updateFolder(id, data) {
    const folder = this.folders.get(id);
    if (folder) {
      Object.assign(folder, data);
      this.saveData();
    }
    return folder;
  }

  deleteFolder(id, deleteContents = false) {
    const folder = this.folders.get(id);
    if (!folder) return;

    // Get all subfolders recursively
    const getAllSubfolders = (parentId) => {
      const subfolders = this.folders.filter(f => f.parent === parentId);
      let allIds = subfolders.map(f => f.id);
      subfolders.forEach(sf => {
        allIds = allIds.concat(getAllSubfolders(sf.id));
      });
      return allIds;
    };

    const folderIds = [id, ...getAllSubfolders(id)];

    if (deleteContents) {
      // Delete all items in these folders
      if (folder.type === 'scene') {
        this.scenes.filter(s => folderIds.includes(s.folder)).forEach(s => {
          this.scenes.delete(s.id);
        });
      } else {
        this.characters.filter(c => folderIds.includes(c.folder)).forEach(c => {
          this.characters.delete(c.id);
        });
      }
    } else {
      // Move items to root (null folder)
      if (folder.type === 'scene') {
        this.scenes.filter(s => folderIds.includes(s.folder)).forEach(s => {
          s.folder = null;
        });
      } else {
        this.characters.filter(c => folderIds.includes(c.folder)).forEach(c => {
          c.folder = null;
        });
      }
    }

    // Delete all subfolders and the folder itself
    folderIds.forEach(fid => this.folders.delete(fid));
    this.saveData();
  }

  toggleFolderExpanded(id) {
    const folder = this.folders.get(id);
    if (folder) {
      folder.expanded = !folder.expanded;
      this.saveData();
    }
  }

  moveItemToFolder(itemId, itemType, folderId) {
    if (itemType === 'scene') {
      const scene = this.scenes.get(itemId);
      if (scene) {
        scene.folder = folderId;
        this.saveData();
      }
    } else {
      const char = this.characters.get(itemId);
      if (char) {
        char.folder = folderId;
        this.saveData();
      }
    }
  }

  getFolders(type, parentId = null) {
    return this.folders.filter(f => f.type === type && f.parent === parentId);
  }

  getFolderPath(folderId) {
    const path = [];
    let current = this.folders.get(folderId);
    while (current) {
      path.unshift(current);
      current = current.parent ? this.folders.get(current.parent) : null;
    }
    return path;
  }

  getItemsInFolder(type, folderId) {
    if (type === 'scene') {
      return this.scenes.filter(s => s.folder === folderId);
    } else {
      return this.characters.filter(c => c.folder === folderId);
    }
  }



  startSequence(sceneId) {
    const scene = this.scenes.get(sceneId);
    if (!scene || !scene.isSequence || scene.sequenceBackgrounds.length === 0) {
      ui.notifications.warn("This scene is not a valid sequence");
      return false;
    }

    // Stop any sequence that might be playing
    this.stopSequence(false);

    // Set as active scene
    this.setActiveScene(sceneId);

    // Update scene stats
    scene.lastUsed = Date.now();
    scene.playCount++;
    this.saveData();

    // Initialize sequence state
    this.sequenceState = {
      isActive: true,
      sceneId: sceneId,
      currentIndex: 0,
      totalBackgrounds: scene.sequenceBackgrounds.length,
      transitionType: scene.sequenceSettings.transitionType,
      transitionDuration: scene.sequenceSettings.transitionDuration,
      onEnd: scene.sequenceSettings.onEnd
    };

    // Broadcast to players
    TomSocketHandler.emitSequenceStart({
      sceneId,
      backgroundIndex: 0,
      background: scene.sequenceBackgrounds[0],
      cast: scene.cast,
      transitionType: scene.sequenceSettings.transitionType,
      transitionDuration: scene.sequenceSettings.transitionDuration
    });

    return true;
  }

  /**
   * Navigate to next background in sequence
   */
  sequenceNext() {
    const state = this.sequenceState;
    if (!state.isActive) return false;

    const scene = this.scenes.get(state.sceneId);
    if (!scene) return false;

    let nextIndex = state.currentIndex + 1;

    // Check if we've reached the end
    if (nextIndex >= state.totalBackgrounds) {
      if (state.onEnd === 'loop') {
        nextIndex = 0;
      } else {
        // Stop the sequence
        this.stopSequence();
        return false;
      }
    }

    state.currentIndex = nextIndex;
    const background = scene.sequenceBackgrounds[nextIndex];

    // Broadcast change to players
    TomSocketHandler.emitSequenceChange({
      sceneId: state.sceneId,
      backgroundIndex: nextIndex,
      background: background,
      transitionType: state.transitionType,
      transitionDuration: state.transitionDuration
    });

    return true;
  }

  /**
   * Navigate to previous background in sequence
   */
  sequencePrevious() {
    const state = this.sequenceState;
    if (!state.isActive) return false;

    const scene = this.scenes.get(state.sceneId);
    if (!scene) return false;

    let prevIndex = state.currentIndex - 1;

    // Check if we've reached the beginning
    if (prevIndex < 0) {
      if (state.onEnd === 'loop') {
        prevIndex = state.totalBackgrounds - 1;
      } else {
        prevIndex = 0; // Stay at first
      }
    }

    if (prevIndex === state.currentIndex) return false;

    state.currentIndex = prevIndex;
    const background = scene.sequenceBackgrounds[prevIndex];

    // Broadcast change to players
    TomSocketHandler.emitSequenceChange({
      sceneId: state.sceneId,
      backgroundIndex: prevIndex,
      background: background,
      transitionType: state.transitionType,
      transitionDuration: state.transitionDuration
    });

    return true;
  }

  /**
   * Jump to specific index in sequence
   */
  sequenceGoTo(index) {
    const state = this.sequenceState;
    if (!state.isActive) return false;

    const scene = this.scenes.get(state.sceneId);
    if (!scene) return false;

    // Clamp index to valid range
    const targetIndex = Math.max(0, Math.min(index, state.totalBackgrounds - 1));
    if (targetIndex === state.currentIndex) return false;

    state.currentIndex = targetIndex;
    const background = scene.sequenceBackgrounds[targetIndex];

    // Broadcast change to players
    TomSocketHandler.emitSequenceChange({
      sceneId: state.sceneId,
      backgroundIndex: targetIndex,
      background: background,
      transitionType: state.transitionType,
      transitionDuration: state.transitionDuration
    });

    return true;
  }

  /**
   * Stop the sequence broadcast
   */
  stopSequence(broadcast = true) {
    const wasActive = this.sequenceState.isActive;

    // Reset state
    this.sequenceState = {
      isActive: false,
      sceneId: null,
      currentIndex: 0,
      totalBackgrounds: 0,
      transitionType: 'dissolve',
      transitionDuration: 1.0,
      onEnd: 'stop'
    };

    // Clear active scene
    this.clearActiveScene();

    // Broadcast stop to players
    if (wasActive && broadcast) {
      TomSocketHandler.emitSequenceStop();
    }
  }

  /**
   * Get current sequence progress info
   */
  getSequenceProgress() {
    const state = this.sequenceState;
    if (!state.isActive) return null;

    const scene = this.scenes.get(state.sceneId);
    if (!scene) return null;

    return {
      isActive: state.isActive,
      sceneId: state.sceneId,
      sceneName: scene.name,
      currentIndex: state.currentIndex,
      totalBackgrounds: state.totalBackgrounds,
      currentBackground: scene.sequenceBackgrounds[state.currentIndex],
      transitionType: state.transitionType,
      transitionDuration: state.transitionDuration,
      onEnd: state.onEnd,
      isFirst: state.currentIndex === 0,
      isLast: state.currentIndex === state.totalBackgrounds - 1
    };
  }


  startCastOnly(characterIds, layoutSettings = null) {
    if (!characterIds || characterIds.length === 0) {
      ui.notifications.warn("Select at least one character for Cast-Only mode");
      return false;
    }

    // Stop any other active broadcasts
    this.stopSequence(false);
    this.stopSequence(false);
    if (this.activeSceneId) {
      this.clearActiveScene();
      TomSocketHandler.emitStopBroadcast();
    }

    // Initialize cast-only state
    this.castOnlyState = {
      isActive: true,
      characterIds: [...characterIds],
      layoutSettings: layoutSettings || this.castOnlyState.layoutSettings
    };

    // Broadcast to players
    TomSocketHandler.emitCastOnlyStart({
      characterIds: this.castOnlyState.characterIds,
      layoutSettings: this.castOnlyState.layoutSettings
    });

    return true;
  }

  /**
   * Stop Cast-Only Mode
   * @param {boolean} broadcast - Whether to emit socket event (default true)
   */
  stopCastOnly(broadcast = true) {
    const wasActive = this.castOnlyState.isActive;

    // Reset state (keep layout settings for next use)
    const preservedLayout = { ...this.castOnlyState.layoutSettings };
    this.castOnlyState = {
      isActive: false,
      characterIds: [],
      layoutSettings: preservedLayout
    };

    if (wasActive && broadcast) {
      TomSocketHandler.emitCastOnlyStop();
    }
  }

  /**
   * Add a character to Cast-Only Mode
   * @param {string} characterId - Character ID to add
   */
  addCharacterToCastOnly(characterId) {
    if (!this.castOnlyState.isActive) return false;
    if (this.castOnlyState.characterIds.includes(characterId)) return false;

    this.castOnlyState.characterIds.push(characterId);

    // Broadcast update
    TomSocketHandler.emitCastOnlyUpdate({
      characterIds: this.castOnlyState.characterIds
    });

    return true;
  }

  /**
   * Remove a character from Cast-Only Mode
   * @param {string} characterId - Character ID to remove
   */
  removeCharacterFromCastOnly(characterId) {
    if (!this.castOnlyState.isActive) return false;

    const index = this.castOnlyState.characterIds.indexOf(characterId);
    if (index === -1) return false;

    this.castOnlyState.characterIds.splice(index, 1);

    // If no characters left, stop cast-only mode
    if (this.castOnlyState.characterIds.length === 0) {
      this.stopCastOnly();
      return true;
    }

    // Broadcast update
    TomSocketHandler.emitCastOnlyUpdate({
      characterIds: this.castOnlyState.characterIds
    });

    return true;
  }

  /**
   * Update Cast-Only layout settings
   * @param {Object} layoutSettings - New layout settings
   */
  updateCastOnlyLayout(layoutSettings) {
    this.castOnlyState.layoutSettings = {
      ...this.castOnlyState.layoutSettings,
      ...layoutSettings
    };

    // Broadcast update if active
    if (this.castOnlyState.isActive) {
      TomSocketHandler.emitCastOnlyUpdate({
        characterIds: this.castOnlyState.characterIds,
        layoutSettings: this.castOnlyState.layoutSettings
      });
    }
  }

  /**
   * Get current Cast-Only progress info
   */
  getCastOnlyProgress() {
    const state = this.castOnlyState;
    if (!state.isActive) return null;

    // Build character list with current data
    const characters = state.characterIds
      .map(id => this.characters.get(id))
      .filter(c => c !== undefined)
      .map(c => ({
        id: c.id,
        name: c.name,
        image: c.image,
        borderStyle: c.borderStyle || 'gold',
        locked: c.locked || false
      }));

    return {
      isActive: state.isActive,
      characterIds: state.characterIds,
      characters: characters,
      layoutSettings: state.layoutSettings
    };
  }
}




// Singleton Instance
export const TomStore = new TomStoreClass();
