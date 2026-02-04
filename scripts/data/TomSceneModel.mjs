export class TomSceneModel {
  constructor(data = {}) {
    this.id = data.id || foundry.utils.randomID();
    this.name = data.name || 'New Scene';
    this.type = 'scene';
    this.background = data.background || 'modules/shadowdark-extras/assets/default-scene.jpg';
    this.bgType = data.bgType || 'image';
    this.isArena = data.isArena || false;
    this.arenaType = data.arenaType || 'isometric';
  }

  get thumbnail() {
    return this.background;
  }

  get image() {
    return this.background;
  }

  toJSON() {
    const { id, name, type, background, bgType, isArena, arenaType } = this;
    return {
      id,
      name,
      type,
      background,
      bgType,
      isArena,
      arenaType
    };
  }
}
