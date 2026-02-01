export class TomSceneModel {
  constructor(data = {}) {
    this.id = data.id || foundry.utils.randomID();
    this.name = data.name || 'New Scene';
    this.type = 'scene';
    this.background = data.background || 'modules/shadowdark-extras/assets/default-scene.jpg';
    this.bgType = data.bgType || 'image'; // 'image' or 'video'
    this.folder = data.folder || null;
    this.favorite = data.favorite || false;
    this.tags = data.tags || [];
    this.createdAt = data.createdAt || Date.now();
    this.lastUsed = data.lastUsed || null;
    this.playCount = data.playCount || 0;

    // Cast members (references to characters)
    this.cast = data.cast || [];

    // Sequence feature - multiple backgrounds with shared cast
    this.isSequence = data.isSequence || false;
    this.sequenceBackgrounds = data.sequenceBackgrounds || []; // Array of { id, path, bgType }
    this.sequenceSettings = data.sequenceSettings || {
      transitionType: 'dissolve', // 'dissolve' or 'cut'
      transitionDuration: 1.0,    // seconds (ignored if cut)
      onEnd: 'stop'               // 'stop' or 'loop'
    };

    // Layout settings for cast display
    this.layoutSettings = data.layoutSettings || {
      preset: 'bottom-center',    // Position preset
      size: 'medium',             // Size preset (small, medium, large, xlarge) or custom vh value
      spacing: 24,                // Gap between characters in pixels
      offsetX: 0,                 // Horizontal offset in vh
      offsetY: 5                  // Vertical offset in vh
    };

    // Arena mode: allows players with canSpawnToken permission to spawn tokens
    this.isArena = data.isArena || false;
  }

  get thumbnail() {
    // For sequences, show the first background
    if (this.isSequence && this.sequenceBackgrounds.length > 0) {
      return this.sequenceBackgrounds[0].path;
    }
    return this.background;
  }

  get image() {
    return this.background;
  }

  /**
   * Get the current background for a specific index in the sequence
   */
  getSequenceBackground(index) {
    if (!this.isSequence || this.sequenceBackgrounds.length === 0) {
      return { path: this.background, bgType: this.bgType };
    }
    const safeIndex = Math.max(0, Math.min(index, this.sequenceBackgrounds.length - 1));
    return this.sequenceBackgrounds[safeIndex];
  }

  /**
   * Add a background to the sequence
   */
  addSequenceBackground(path, bgType = 'image') {
    const bg = {
      id: foundry.utils.randomID(),
      path,
      bgType
    };
    this.sequenceBackgrounds.push(bg);
    return bg;
  }

  /**
   * Remove a background from the sequence
   */
  removeSequenceBackground(id) {
    this.sequenceBackgrounds = this.sequenceBackgrounds.filter(bg => bg.id !== id);
  }

  /**
   * Reorder backgrounds in the sequence
   */
  reorderSequenceBackground(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const [moved] = this.sequenceBackgrounds.splice(fromIndex, 1);
    this.sequenceBackgrounds.splice(toIndex, 0, moved);
  }

  /**
   * Convert a regular scene to a sequence (keeping current background as first)
   */
  convertToSequence() {
    if (this.isSequence) return;
    this.isSequence = true;
    // Add current background as the first item
    this.sequenceBackgrounds = [{
      id: foundry.utils.randomID(),
      path: this.background,
      bgType: this.bgType
    }];
  }

  /**
   * Convert sequence back to regular scene (using first background)
   */
  convertToRegular() {
    if (!this.isSequence) return;
    if (this.sequenceBackgrounds.length > 0) {
      this.background = this.sequenceBackgrounds[0].path;
      this.bgType = this.sequenceBackgrounds[0].bgType;
    }
    this.isSequence = false;
    this.sequenceBackgrounds = [];
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
      isArena: this.isArena
    };
  }
}
