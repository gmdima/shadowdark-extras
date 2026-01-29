import { TOM_CONFIG as CONFIG } from '../TomConfig.mjs';
import { TomSceneModel } from './TomSceneModel.mjs';
import { TomCharacterModel } from './TomCharacterModel.mjs';
import { TomFolderModel } from './TomFolderModel.mjs';
import { TomSlideshowModel } from './TomSlideshowModel.mjs';
import { TomSocketHandler } from './TomSocketHandler.mjs';

export class TomStoreClass {
  constructor() {
    this.scenes = new foundry.utils.Collection();
    this.characters = new foundry.utils.Collection();
    this.folders = new foundry.utils.Collection();
    this.slideshows = new foundry.utils.Collection();
    this.activeSceneId = null;
    this.isInitialized = false;
    this.customOrder = { scenes: [], characters: [] };

    // Slideshow playback state
    this.slideshowState = {
      isPlaying: false,
      slideshowId: null,
      currentIndex: 0,
      sequence: [],
      isPaused: false,
      timerId: null,
      startTime: null, // When current scene started
      pausedTime: null // Remaining time when paused
    };

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

  /* ═══════════════════════════════════════════════════════════════
     DATA LOADING & SAVING
     ═══════════════════════════════════════════════════════════════ */

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

    // Load Custom Order
    const customOrderData = game.settings.get(CONFIG.MODULE_ID, CONFIG.SETTINGS.CUSTOM_ORDER) || { scenes: [], characters: [] };
    this.customOrder = customOrderData;

    // Load Slideshows
    const slideshowsData = game.settings.get(CONFIG.MODULE_ID, CONFIG.SETTINGS.SLIDESHOWS) || [];
    this.slideshows.clear();
    slideshowsData.forEach(d => this.slideshows.set(d.id, new TomSlideshowModel(d)));

    console.log(`${CONFIG.MODULE_NAME} | Loaded ${this.scenes.size} scenes, ${this.characters.size} characters, ${this.slideshows.size} slideshows.`);
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


  /* ═══════════════════════════════════════════════════════════════
     ACCESSORS
     ═══════════════════════════════════════════════════════════════ */

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

  /* ═══════════════════════════════════════════════════════════════
     CRUD OPERATIONS
     ═══════════════════════════════════════════════════════════════ */

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

  /* ═══════════════════════════════════════════════════════════════
     FOLDER OPERATIONS
     ═══════════════════════════════════════════════════════════════ */

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

  /* ═══════════════════════════════════════════════════════════════
     CUSTOM ORDER
     ═══════════════════════════════════════════════════════════════ */

  getCustomOrder(type) {
    return this.customOrder[type] || [];
  }

  setCustomOrder(type, orderedIds) {
    this.customOrder[type] = orderedIds;
    this.saveCustomOrder();
  }

  async saveCustomOrder() {
    if (!this.isInitialized) return;
    await game.settings.set(CONFIG.MODULE_ID, CONFIG.SETTINGS.CUSTOM_ORDER, this.customOrder);
  }

  /**
   * Applies custom order to items array
   * Items not in the custom order are placed at the end
   */
  applyCustomOrder(items, type) {
    const order = this.getCustomOrder(type);
    if (!order.length) return items;

    const orderMap = new Map(order.map((id, idx) => [id, idx]));

    return [...items].sort((a, b) => {
      const aIdx = orderMap.has(a.id) ? orderMap.get(a.id) : Infinity;
      const bIdx = orderMap.has(b.id) ? orderMap.get(b.id) : Infinity;
      return aIdx - bIdx;
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     SLIDESHOW OPERATIONS
     ═══════════════════════════════════════════════════════════════ */

  createSlideshow(data) {
    const slideshow = new TomSlideshowModel(data);
    this.slideshows.set(slideshow.id, slideshow);
    this.saveSlideshows();
    return slideshow;
  }

  deleteSlideshow(id) {
    // Stop if currently playing
    if (this.slideshowState.slideshowId === id) {
      this.stopSlideshow();
    }
    this.slideshows.delete(id);
    this.saveSlideshows();
  }

  getSlideshows() {
    return this.slideshows.contents;
  }

  async saveSlideshows() {
    if (!this.isInitialized) return;
    const data = this.slideshows.map(s => s.toJSON());
    await game.settings.set(CONFIG.MODULE_ID, CONFIG.SETTINGS.SLIDESHOWS, data);
  }

  _loadSlideshows(data) {
    const slideshows = this._parseData(data);
    if (!slideshows) return;
    this.slideshows.clear();
    slideshows.forEach(d => this.slideshows.set(d.id, new TomSlideshowModel(d)));
    console.log(`${CONFIG.MODULE_NAME} | Loaded ${this.slideshows.size} slideshows`);
  }

  /* ═══════════════════════════════════════════════════════════════
     SLIDESHOW PLAYBACK
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Start playing a slideshow
   */
  startSlideshow(slideshowId) {
    const slideshow = this.slideshows.get(slideshowId);
    if (!slideshow || slideshow.scenes.length === 0) {
      ui.notifications.warn("Cannot play an empty slideshow");
      return false;
    }

    // Stop any current playback
    this.stopSlideshow();

    // Update slideshow stats
    slideshow.lastUsed = Date.now();
    slideshow.playCount++;
    this.saveSlideshows();

    // Get the play sequence
    const sequence = slideshow.getPlaySequence();

    // Get the cast from the FIRST scene - this will be used for the entire slideshow
    // The slideshow represents a journey where characters stay consistent across backgrounds
    const firstSceneId = sequence[0]?.sceneId;
    const firstScene = firstSceneId ? this.scenes.get(firstSceneId) : null;
    const slideshowCast = firstScene ? [...firstScene.cast] : [];

    // Initialize playback state
    this.slideshowState = {
      isPlaying: true,
      slideshowId: slideshowId,
      currentIndex: 0,
      sequence: sequence,
      isPaused: false,
      timerId: null,
      startTime: Date.now(),
      pausedTime: null,
      transitionType: slideshow.transitionType,
      transitionDuration: slideshow.transitionDuration,
      loop: slideshow.loop,
      cinematicMode: slideshow.cinematicMode,
      cast: slideshowCast // Store the fixed cast for the entire slideshow
    };

    // Broadcast slideshow start with the fixed cast
    TomSocketHandler.emitSlideshowStart({
      slideshowId,
      sequence: this.slideshowState.sequence,
      transitionType: slideshow.transitionType,
      transitionDuration: slideshow.transitionDuration,
      loop: slideshow.loop,
      cinematicMode: slideshow.cinematicMode,
      cast: slideshowCast // Send the cast to all clients
    });

    // Start first scene
    this._playCurrentScene();

    return true;
  }

  /**
   * Play the current scene in the sequence
   */
  _playCurrentScene() {
    const state = this.slideshowState;
    if (!state.isPlaying || state.currentIndex >= state.sequence.length) {
      // End of slideshow
      if (state.loop && state.sequence.length > 0) {
        state.currentIndex = 0;
        this._playCurrentScene();
      } else {
        this.stopSlideshow();
      }
      return;
    }

    const currentScene = state.sequence[state.currentIndex];
    const sceneId = currentScene.sceneId;
    const duration = currentScene.duration;

    state.startTime = Date.now();

    // Broadcast scene change
    TomSocketHandler.emitSlideshowScene({
      sceneId,
      index: state.currentIndex,
      total: state.sequence.length,
      duration,
      transitionType: state.transitionType,
      transitionDuration: state.transitionDuration
    });

    // Schedule next scene
    state.timerId = setTimeout(() => {
      state.currentIndex++;
      this._playCurrentScene();
    }, duration);
  }

  /**
   * Pause the slideshow
   */
  pauseSlideshow() {
    const state = this.slideshowState;
    if (!state.isPlaying || state.isPaused) return;

    // Bounds check before accessing sequence
    if (state.currentIndex >= state.sequence.length) return;

    // Calculate remaining time
    const elapsed = Date.now() - state.startTime;
    const currentScene = state.sequence[state.currentIndex];
    if (!currentScene) return;

    state.pausedTime = Math.max(0, currentScene.duration - elapsed);

    // Clear timer
    if (state.timerId) {
      clearTimeout(state.timerId);
      state.timerId = null;
    }

    state.isPaused = true;
    TomSocketHandler.emitSlideshowPause();
  }

  /**
   * Resume the slideshow
   */
  resumeSlideshow() {
    const state = this.slideshowState;
    if (!state.isPlaying || !state.isPaused) return;

    // Prevent double-resume
    if (state.timerId) return;

    state.isPaused = false;
    state.startTime = Date.now();

    TomSocketHandler.emitSlideshowResume();

    // Schedule next scene with remaining time (ensure valid value)
    const remainingTime = Math.max(100, state.pausedTime || 1000);
    state.timerId = setTimeout(() => {
      state.currentIndex++;
      this._playCurrentScene();
    }, remainingTime);

    state.pausedTime = null;
  }

  /**
   * Skip to next scene
   */
  nextScene() {
    const state = this.slideshowState;
    if (!state.isPlaying) return;

    // Clear current timer
    if (state.timerId) {
      clearTimeout(state.timerId);
      state.timerId = null;
    }

    state.isPaused = false;
    state.currentIndex++;
    this._playCurrentScene();
  }

  /**
   * Go to previous scene
   */
  previousScene() {
    const state = this.slideshowState;
    if (!state.isPlaying) return;

    // Clear current timer
    if (state.timerId) {
      clearTimeout(state.timerId);
      state.timerId = null;
    }

    state.isPaused = false;
    state.currentIndex = Math.max(0, state.currentIndex - 1);
    this._playCurrentScene();
  }

  /**
   * Stop the slideshow
   * @param {boolean} broadcast - Whether to emit socket event (default true)
   */
  stopSlideshow(broadcast = true) {
    const state = this.slideshowState;

    // Clear timer FIRST before anything else
    if (state.timerId) {
      clearTimeout(state.timerId);
      state.timerId = null;
    }

    // Check if was actually playing
    const wasPlaying = state.isPlaying;

    // Reset state immediately
    this.slideshowState = {
      isPlaying: false,
      slideshowId: null,
      currentIndex: 0,
      sequence: [],
      isPaused: false,
      timerId: null,
      startTime: null,
      pausedTime: null
    };

    // Only broadcast if we were actually playing and broadcast is requested
    if (wasPlaying && broadcast) {
      TomSocketHandler.emitSlideshowStop();
    }
  }

  /**
   * Get current slideshow progress info
   */
  getSlideshowProgress() {
    const state = this.slideshowState;
    if (!state.isPlaying) return null;

    const currentScene = state.sequence[state.currentIndex];
    if (!currentScene) return null;

    const scene = this.scenes.get(currentScene.sceneId);
    const elapsed = state.isPaused
      ? (currentScene.duration - state.pausedTime)
      : (Date.now() - state.startTime);

    return {
      isPlaying: state.isPlaying,
      isPaused: state.isPaused,
      currentIndex: state.currentIndex,
      totalScenes: state.sequence.length,
      sceneName: scene?.name || 'Unknown',
      sceneId: currentScene.sceneId,
      duration: currentScene.duration,
      elapsed: Math.min(elapsed, currentScene.duration),
      progress: Math.min(elapsed / currentScene.duration, 1)
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     SCENE SEQUENCE OPERATIONS (Manual navigation by GM)
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Start broadcasting a scene sequence
   */
  startSequence(sceneId) {
    const scene = this.scenes.get(sceneId);
    if (!scene || !scene.isSequence || scene.sequenceBackgrounds.length === 0) {
      ui.notifications.warn("This scene is not a valid sequence");
      return false;
    }

    // Stop any slideshow that might be playing
    this.stopSlideshow(false);

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

  /* ═══════════════════════════════════════════════════════════════
     CAST-ONLY MODE OPERATIONS (Cast without scene background)
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Start Cast-Only Mode with selected characters
   * @param {string[]} characterIds - Array of character IDs to display
   * @param {Object} layoutSettings - Optional layout settings override
   */
  startCastOnly(characterIds, layoutSettings = null) {
    if (!characterIds || characterIds.length === 0) {
      ui.notifications.warn("Select at least one character for Cast-Only mode");
      return false;
    }

    // Stop any other active broadcasts
    this.stopSlideshow(false);
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
