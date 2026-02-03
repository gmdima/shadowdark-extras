import { TOM_CONFIG as CONFIG } from '../TomConfig.mjs';
import { TomSceneModel } from './TomSceneModel.mjs';
import { TomCharacterModel } from './TomCharacterModel.mjs';
//import { TomFolderModel } from './TomFolderModel.mjs';
import { TomSocketHandler } from './TomSocketHandler.mjs';

export class TomStoreClass {
  constructor() {
    this.scenes = new foundry.utils.Collection();
    this.characters = new foundry.utils.Collection();
    this.folders = new foundry.utils.Collection();
    this.activeSceneId = null;
    this.currentOverlay = null;
    this.isInitialized = false;


    this.sequenceState = {
      isActive: false,
      sceneId: null,
      currentIndex: 0,
      totalBackgrounds: 0,
      transitionType: 'dissolve',
      transitionDuration: 1.0,
      onEnd: 'stop'
    };


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


  async _loadData() {

    const scenesData = game.settings.get(CONFIG.MODULE_ID, CONFIG.SETTINGS.SCENES) || [];
    this.scenes.clear();
    scenesData.forEach(d => this.scenes.set(d.id, new TomSceneModel(d)));


    const charsData = game.settings.get(CONFIG.MODULE_ID, CONFIG.SETTINGS.CHARACTERS) || [];
    this.characters.clear();
    charsData.forEach(d => this.characters.set(d.id, new TomCharacterModel(d)));


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

    if (options.tags && options.tags.length > 0) {
      scenes = scenes.filter(s => options.tags.every(tag => s.tags.includes(tag)));
    }


    if (options.excludedTags && options.excludedTags.length > 0) {
      scenes = scenes.filter(s => !options.excludedTags.some(tag => s.tags.includes(tag)));
    }

    return scenes;
  }

  getCharacters(options = {}) {
    let chars = this.characters.contents;


    if (options.search) {
      const search = options.search.toLowerCase();
      chars = chars.filter(c => c.name.toLowerCase().includes(search) || Array.from(c.tags).some(t => t.toLowerCase().includes(search)));
    }


    if (options.favorite) {
      chars = chars.filter(c => c.favorite);
    }


    if (options.tags && options.tags.length > 0) {
      chars = chars.filter(c => options.tags.every(tag => c.tags.has(tag)));
    }


    if (options.excludedTags && options.excludedTags.length > 0) {
      chars = chars.filter(c => !options.excludedTags.some(tag => c.tags.has(tag)));
    }

    return chars;
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

      if (scene.cast.some(c => c.id === charId)) return;

      scene.cast.push({ id: character.id, name: character.name, image: character.image });
      this.saveData();


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


      if (this.activeSceneId === sceneId) {
        TomSocketHandler.emitUpdateCast(sceneId);
      }
    }
  }

  reorderCastMember(sceneId, fromIndex, toIndex) {
    const scene = this.scenes.get(sceneId);
    if (!scene || fromIndex === toIndex) return;


    const [movedItem] = scene.cast.splice(fromIndex, 1);


    scene.cast.splice(toIndex, 0, movedItem);

    this.saveData();


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


}

export const TomStore = new TomStoreClass();
