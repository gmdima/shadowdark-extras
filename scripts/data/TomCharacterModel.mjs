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
    // Favorite emotions for this character (stored as array of state keys)
    this.favoriteEmotions = new Set(data.favoriteEmotions || []);
    // Border style customization (preset ID from CONFIG.BORDER_PRESETS)
    this.borderStyle = data.borderStyle || 'gold';
    // Lock: when true, only GM can change emotions in PlayerView
    this.locked = data.locked || false;

    // Permission system: controls who can edit this character
    // Levels: 'none' (no access), 'view' (read-only), 'emotion' (can change emotions), 'full' (full control)
    this.permissions = data.permissions || {
      default: 'none',    // Default permission for non-listed players
      players: {}         // Map of playerId -> permission level
    };
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
      permissions: this.permissions
    };
  }

  /**
   * Check if a user has a specific permission level or higher
   * @param {string} userId - The user ID to check
   * @param {string} requiredLevel - The minimum required permission level
   * @returns {boolean}
   */
  hasPermission(userId, requiredLevel = 'emotion') {
    const levels = { none: 0, view: 1, emotion: 2, full: 3 };
    const userLevel = this.permissions.players[userId] || this.permissions.default || 'none';
    return levels[userLevel] >= levels[requiredLevel];
  }

  /**
   * Set permission for a specific player
   * @param {string} userId - The user ID
   * @param {string} level - Permission level ('none', 'view', 'emotion', 'full')
   */
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
}
