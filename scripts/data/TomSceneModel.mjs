export class TomSceneModel {
  constructor(data = {}) {
    this.id = data.id || foundry.utils.randomID();
    this.name = data.name || 'New Scene';
    this.type = 'scene';
    this.background = data.background || 'modules/shadowdark-extras/assets/default-scene.jpg';
    this.bgType = data.bgType || 'image';
    this.folder = data.folder || null;
    this.favorite = data.favorite || false;
    this.tags = data.tags || [];
    this.createdAt = data.createdAt || Date.now();
    this.lastUsed = data.lastUsed || null;
    this.playCount = data.playCount || 0;


    this.cast = data.cast || [];


    this.isSequence = data.isSequence || false;
    this.sequenceBackgrounds = data.sequenceBackgrounds || [];
    this.sequenceSettings = data.sequenceSettings || {
      transitionType: 'dissolve',
      transitionDuration: 1.0,
      onEnd: 'stop'
    };


    this.layoutSettings = data.layoutSettings || {
      preset: 'bottom-center',
      size: 'medium',
      spacing: 24,
      offsetX: 0,
      offsetY: 5
    };


    this.isArena = data.isArena || false;
    this.arenaType = data.arenaType || 'isometric';
  }

  get thumbnail() {

    if (this.isSequence && this.sequenceBackgrounds.length > 0) {
      return this.sequenceBackgrounds[0].path;
    }
    return this.background;
  }

  get image() {
    return this.background;
  }




  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      background: this.background,
      bgType: this.bgType,
      folder: this.folder,
      favorite: this.favorite,
      tags: this.tags,
      createdAt: this.createdAt,
      lastUsed: this.lastUsed,
      playCount: this.playCount,
      cast: this.cast,
      isSequence: this.isSequence,
      sequenceBackgrounds: this.sequenceBackgrounds,
      sequenceSettings: this.sequenceSettings,
      layoutSettings: this.layoutSettings,
      isArena: this.isArena,
      arenaType: this.arenaType
    };
  }
}
