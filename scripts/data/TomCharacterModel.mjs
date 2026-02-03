export class TomCharacterModel {
  constructor(data = {}) {
    this.id = data.id || foundry.utils.randomID();
    this.name = data.name || 'New Character';
    this.type = 'character';
    this.states = data.states || { normal: 'icons/svg/mystery-man.svg' };
    this.currentState = data.currentState || 'normal';
    this.folder = data.folder || null;
    this.favorite = data.favorite || false;
    this.tags = new Set(data.tags || []);
    this.createdAt = data.createdAt || Date.now();
    this.lastUsed = data.lastUsed || null;
    this.playCount = data.playCount || 0;
    
    this.favoriteEmotions = new Set(data.favoriteEmotions || []);
    
    this.borderStyle = data.borderStyle || 'gold';
    
    this.locked = data.locked || false;

    
    
    this.permissions = data.permissions || {
      default: 'none',    
      players: {}         
    };

    
    
    this.canSpawnToken = data.canSpawnToken || {};
  }

  get image() {
    return this.states[this.currentState] || this.states.normal;
  }

  get thumbnail() {
    return this.states.base || this.states.normal || Object.values(this.states)[0];
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      image: this.image,
      type: this.type,
      states: this.states,
      currentState: this.currentState,
      folder: this.folder,
      favorite: this.favorite,
      tags: Array.from(this.tags),
      createdAt: this.createdAt,
      lastUsed: this.lastUsed,
      playCount: this.playCount,
      favoriteEmotions: Array.from(this.favoriteEmotions),
      borderStyle: this.borderStyle,
      locked: this.locked,
      permissions: this.permissions,
      canSpawnToken: this.canSpawnToken
    };
  }

  
  hasPermission(userId, requiredLevel = 'emotion') {
    const levels = { none: 0, view: 1, emotion: 2, full: 3 };
    const userLevel = this.permissions.players[userId] || this.permissions.default || 'none';
    return levels[userLevel] >= levels[requiredLevel];
  }

  
  setPlayerPermission(userId, level) {
    if (!this.permissions.players) {
      this.permissions.players = {};
    }
    if (level === 'none' || level === this.permissions.default) {
      delete this.permissions.players[userId];
    } else {
      this.permissions.players[userId] = level;
    }
  }

  
  canUserSpawnToken(userId) {
    return this.canSpawnToken[userId] === true;
  }
}
