/**
 * TomSlideshowModel - Represents a slideshow configuration
 * A slideshow is a sequence of scenes that can be played automatically
 */
export class TomSlideshowModel {
  constructor(data = {}) {
    this.id = data.id || foundry.utils.randomID();
    this.name = data.name || 'New Slideshow';
    this.type = 'slideshow';

    // Scene sequence: array of { sceneId, duration (ms) }
    this.scenes = data.scenes || [];

    // Timing settings
    this.defaultDuration = data.defaultDuration || 5000; // 5 seconds default

    // Transition settings
    this.transitionType = data.transitionType || 'dissolve'; // dissolve or none
    this.transitionDuration = data.transitionDuration || 500; // ms

    // Playback options
    this.loop = data.loop !== undefined ? data.loop : false;
    this.shuffle = data.shuffle !== undefined ? data.shuffle : false;
    this.cinematicMode = data.cinematicMode !== undefined ? data.cinematicMode : false;

    // Metadata
    this.createdAt = data.createdAt || Date.now();
    this.lastUsed = data.lastUsed || null;
    this.playCount = data.playCount || 0;
  }

  /**
   * Add a scene to the slideshow
   */
  addScene(sceneId, duration = null) {
    // Prevent duplicates
    if (this.scenes.some(s => s.sceneId === sceneId)) return false;

    this.scenes.push({
      sceneId,
      duration: duration || this.defaultDuration
    });
    return true;
  }

  /**
   * Remove a scene from the slideshow
   */
  removeScene(sceneId) {
    const index = this.scenes.findIndex(s => s.sceneId === sceneId);
    if (index !== -1) {
      this.scenes.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Reorder scenes
   */
  reorderScene(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const [moved] = this.scenes.splice(fromIndex, 1);
    this.scenes.splice(toIndex, 0, moved);
  }

  /**
   * Update duration for a specific scene
   */
  setSceneDuration(sceneId, duration) {
    const scene = this.scenes.find(s => s.sceneId === sceneId);
    if (scene) {
      scene.duration = duration;
      return true;
    }
    return false;
  }

  /**
   * Get total duration of the slideshow
   */
  get totalDuration() {
    return this.scenes.reduce((sum, s) => sum + s.duration, 0);
  }

  /**
   * Get formatted total duration string
   */
  get formattedDuration() {
    const total = this.totalDuration;
    const minutes = Math.floor(total / 60000);
    const seconds = Math.floor((total % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Get the scene sequence (optionally shuffled)
   */
  getPlaySequence() {
    if (this.shuffle) {
      return [...this.scenes].sort(() => Math.random() - 0.5);
    }
    return [...this.scenes];
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      scenes: this.scenes,
      defaultDuration: this.defaultDuration,
      transitionType: this.transitionType,
      transitionDuration: this.transitionDuration,
      loop: this.loop,
      shuffle: this.shuffle,
      cinematicMode: this.cinematicMode,
      createdAt: this.createdAt,
      lastUsed: this.lastUsed,
      playCount: this.playCount
    };
  }
}
