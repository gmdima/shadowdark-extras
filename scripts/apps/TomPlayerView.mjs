import { TOM_CONFIG as CONFIG } from '../TomConfig.mjs';
import { TomStore as Store } from '../data/TomStore.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Get the CSS value for a size preset or custom value
 * @param {string} size - Size preset key or custom vh value
 * @returns {string} CSS value (e.g., '18vh')
 */
function getSizeValue(size) {
  const preset = CONFIG.SIZE_PRESETS[size];
  if (preset) return preset.value;
  // If it's a number, assume vh units
  if (typeof size === 'number') return `${size}vh`;
  // If it already has units, use as-is
  if (typeof size === 'string' && size.match(/^\d+/)) return size;
  // Default fallback
  return CONFIG.SIZE_PRESETS.medium.value;
}

export class TomPlayerView extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.uiState = {
      active: false,
      sceneId: null,
      emotionPicker: { open: false, characterId: null, x: 0, y: 0 },
      borderPicker: { open: false, characterId: null, x: 0, y: 0 },
      previousSceneId: null,  // Para detectar troca de cena
      isSceneTransition: false, // Flag para controlar animações
      // Slideshow state
      slideshowMode: false,
      cinematicMode: false,
      slideshowPaused: false,
      // Cast-Only Mode state (cast without scene background)
      castOnlyMode: false,
      castOnlyCharacterIds: [],
      castOnlyLayoutSettings: null
    };
  }

  static DEFAULT_OPTIONS = {
    tag: 'div',
    id: 'tom-player-view',
    classes: [],
    window: {
      frame: false,
      positioned: false,
      controls: []
    },
    position: {
      width: '100%',
      height: '100%',
      top: 0,
      left: 0
    },
    actions: {
      'character-click': TomPlayerView._onCharacterClick,
      'select-emotion': TomPlayerView._onSelectEmotion,
      'close-picker': TomPlayerView._onClosePicker,
      'toggle-emotion-favorite': TomPlayerView._onToggleEmotionFavorite,
      'open-border-picker': TomPlayerView._onOpenBorderPicker,
      'close-border-picker': TomPlayerView._onCloseBorderPicker,
      'back-to-emotions': TomPlayerView._onBackToEmotions,
      'select-border': TomPlayerView._onSelectBorder
    }
  };

  static PARTS = {
    main: {
      template: CONFIG.TEMPLATES.PLAYER_VIEW
    }
  };

  /* ═══════════════════════════════════════════════════════════════
     RENDER CONTEXT
     ═══════════════════════════════════════════════════════════════ */

  _onRender(context, options) {
    super._onRender(context, options);

    // Calculate and set Foundry UI offset CSS variables to avoid overlap
    this._setFoundryUIOffsets();

    // Ensure video plays (some browsers block autoplay)
    this._ensureVideoPlays();

    // Aplicar animações apenas em transição de cena
    if (this.uiState.isSceneTransition) {
      const background = this.element.querySelector('.tom-pv-bg-media');
      const characters = this.element.querySelectorAll('.tom-pv-character');

      // Animar background
      if (background) {
        background.classList.add('es-transition-fade');
        background.addEventListener('animationend', () => {
          background.classList.remove('es-transition-fade');
        }, { once: true });
      }

      // Animar personagens com delay escalonado
      characters.forEach((char, index) => {
        char.style.setProperty('--char-index', index);
        char.classList.add('es-entering');
        char.addEventListener('animationend', () => {
          char.classList.remove('es-entering');
        }, { once: true });
      });

      // Reset flag
      this.uiState.isSceneTransition = false;
    }

    // === EMOTION PICKER: SEARCH AND PREVIEW ===
    const emotionPicker = this.element.querySelector('.tom-emotion-picker');
    if (emotionPicker) {
      // Search input for emotions
      const searchInput = emotionPicker.querySelector('.tom-picker-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          const query = e.target.value.toLowerCase();
          const items = emotionPicker.querySelectorAll('.tom-picker-item');
          items.forEach(item => {
            const emotionKey = item.dataset.state.toLowerCase();
            item.style.display = emotionKey.includes(query) ? '' : 'none';
          });
        });
        // Focus on the search input when picker opens
        setTimeout(() => searchInput.focus(), 50);
      }

      // Hover preview for emotions - smart positioning above picker
      // Note: previewPanel is now OUTSIDE the emotionPicker (to avoid transform containment issues)
      const previewPanel = this.element.querySelector('.tom-player-view > .tom-picker-preview');
      const previewImg = previewPanel?.querySelector('img');
      const previewLabel = previewPanel?.querySelector('.tom-picker-preview-label');
      const items = emotionPicker.querySelectorAll('.tom-picker-item');

      // Known preview dimensions (from CSS - PlayerView uses larger preview)
      const PREVIEW_WIDTH = 400;
      const PREVIEW_HEIGHT = 430;
      const MARGIN = 20;

      items.forEach(item => {
        item.addEventListener('mouseenter', (e) => {
          if (previewPanel && previewImg && previewLabel) {
            const path = item.dataset.path;
            const state = item.dataset.state;
            previewImg.src = path;
            previewLabel.textContent = state;

            const pickerRect = emotionPicker.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            let left, top;

            // Position preview ABOVE the picker
            const spaceAbove = pickerRect.top - MARGIN;

            // Horizontal: center above the picker
            left = pickerRect.left + (pickerRect.width / 2) - (PREVIEW_WIDTH / 2);

            // Clamp horizontal position to viewport bounds
            left = Math.max(MARGIN, Math.min(left, viewportWidth - PREVIEW_WIDTH - MARGIN));

            // Reset position classes
            previewPanel.classList.remove('preview-left', 'preview-below');

            if (spaceAbove >= PREVIEW_HEIGHT) {
              // Fits above the picker
              top = pickerRect.top - PREVIEW_HEIGHT - 16;
              previewPanel.classList.add('preview-above');
            } else {
              // Not enough space above, place below the picker
              top = pickerRect.bottom + 16;
              previewPanel.classList.remove('preview-above');
              previewPanel.classList.add('preview-below');
            }

            // Clamp vertical position to viewport bounds
            top = Math.max(MARGIN, Math.min(top, viewportHeight - PREVIEW_HEIGHT - MARGIN));

            previewPanel.style.left = `${left}px`;
            previewPanel.style.top = `${top}px`;
            previewPanel.style.display = 'block';
          }
        });

        item.addEventListener('mouseleave', (e) => {
          if (previewPanel) {
            previewPanel.style.display = 'none';
          }
        });
      });
    }
  }

  async _prepareContext(options) {
    const scene = this.uiState.sceneId ? Store.scenes.get(this.uiState.sceneId) : null;

    // Determine which cast to use:
    // - In cast-only mode: use castOnlyCharacterIds to build cast
    // - In slideshow mode: use the fixed slideshowCast (characters persist across all backgrounds)
    // - Otherwise: use the scene's cast
    let castSource;
    if (this.uiState.castOnlyMode && this.uiState.castOnlyCharacterIds) {
      // Build cast from character IDs for cast-only mode
      castSource = this.uiState.castOnlyCharacterIds.map(id => {
        const char = Store.characters.get(id);
        return char ? { id: char.id, name: char.name, image: char.image } : null;
      }).filter(c => c !== null);
    } else if (this.uiState.slideshowMode && this.uiState.slideshowCast) {
      castSource = this.uiState.slideshowCast;
    } else {
      castSource = scene ? scene.cast : [];
    }

    // Prepare cast with current states and border styles
    const cast = castSource.map(charRef => {
      const realChar = Store.characters.get(charRef.id);
      if (realChar) {
        return {
          id: realChar.id,
          name: realChar.name,
          image: realChar.image, // This uses the getter that checks currentState
          borderStyle: realChar.borderStyle || 'gold',
          locked: realChar.locked || false
        };
      }
      return { ...charRef, borderStyle: 'gold', locked: false }; // Fallback
    });

    // Prepare Emotion Picker Context
    let pickerContext = null;
    if (this.uiState.emotionPicker.open && this.uiState.emotionPicker.characterId) {
      const char = Store.characters.get(this.uiState.emotionPicker.characterId);
      if (char) {
        const favoriteEmotions = char.favoriteEmotions || new Set();
        const emotions = Object.entries(char.states).map(([key, path]) => ({
          key,
          path,
          isFavorite: favoriteEmotions.has(key)
        }));
        // Sort: favorites first, then alphabetically
        emotions.sort((a, b) => {
          if (a.isFavorite && !b.isFavorite) return -1;
          if (!a.isFavorite && b.isFavorite) return 1;
          return a.key.localeCompare(b.key);
        });
        pickerContext = {
          character: char,
          emotions: emotions,
          x: this.uiState.emotionPicker.x,
          y: this.uiState.emotionPicker.y,
          locked: char.locked || false,
          pickerBelow: this.uiState.emotionPicker.pickerBelow || false
        };
      }
    }

    // Prepare Border Picker Context
    let borderPickerContext = null;
    if (this.uiState.borderPicker.open && this.uiState.borderPicker.characterId) {
      const char = Store.characters.get(this.uiState.borderPicker.characterId);
      if (char) {
        const currentBorder = char.borderStyle || 'gold';
        const presets = CONFIG.BORDER_PRESETS;

        // Organize presets by type
        const solid = [];
        const gradient = [];
        const animated = [];
        const styled = [];

        for (const [key, preset] of Object.entries(presets)) {
          const item = {
            key,
            name: preset.name,
            active: currentBorder === key,
            color: preset.color || '#888'
          };

          if (preset.type === 'solid') {
            solid.push(item);
          } else if (preset.type === 'gradient') {
            gradient.push(item);
          } else if (preset.type === 'animated') {
            animated.push(item);
          } else if (preset.type === 'styled') {
            styled.push(item);
          }
        }

        borderPickerContext = {
          character: char,
          solid,
          gradient,
          animated,
          styled,
          x: this.uiState.borderPicker.x,
          y: this.uiState.borderPicker.y,
          pickerBelow: this.uiState.borderPicker.pickerBelow || false
        };
      }
    }

    // Determine the correct background to display
    // If we're in a sequence and have a stored sequence background, use that instead of scene.background
    let background = scene?.background;
    let bgType = scene?.bgType;

    if (this.uiState.sequenceBackground) {
      background = this.uiState.sequenceBackground.path;
      bgType = this.uiState.sequenceBackground.bgType;
    }

    // Prepare layout settings with CSS-ready values
    // In cast-only mode, use castOnlyLayoutSettings
    const layoutSettings = this.uiState.castOnlyMode && this.uiState.castOnlyLayoutSettings
      ? this.uiState.castOnlyLayoutSettings
      : (scene?.layoutSettings || CONFIG.DEFAULT_LAYOUT);
    const layoutContext = {
      preset: layoutSettings.preset || 'bottom-center',
      size: getSizeValue(layoutSettings.size),
      spacing: layoutSettings.spacing || 24,
      offsetX: layoutSettings.offsetX || 0,
      offsetY: layoutSettings.offsetY || 5
    };

    return {
      active: this.uiState.active,
      scene: scene ? {
        ...scene.toJSON(),
        background: background,
        bgType: bgType
      } : null,
      cast: cast,
      isGM: game.user.isGM,
      emotionPicker: pickerContext,
      borderPicker: borderPickerContext,
      layout: layoutContext,
      // Cast-Only Mode flag
      castOnlyMode: this.uiState.castOnlyMode
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     FOUNDRY UI OFFSET CALCULATION
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Calculate Foundry VTT UI element widths and set CSS variables
   * This prevents cast layouts from overlapping with Foundry's sidebar/controls
   */
  _setFoundryUIOffsets() {
    const root = this.element;
    if (!root) return;

    // Calculate left offset (scene controls width)
    // In FoundryVTT, the left controls (#controls) is typically 50-60px wide
    let leftOffset = 10; // Minimal padding
    const controls = document.getElementById('controls');

    if (controls) {
      const controlsRect = controls.getBoundingClientRect();
      // Use the WIDTH of controls, not position
      if (controlsRect.width > 0) {
        leftOffset = controlsRect.width + 15;
      }
    }

    // Calculate right offset (sidebar)
    let rightOffset = 0;
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.classList.contains('collapsed')) {
      const sidebarRect = sidebar.getBoundingClientRect();
      if (sidebarRect.width > 0) {
        rightOffset = sidebarRect.width + 15;
      }
    }

    // Set CSS variables on the root element
    root.style.setProperty('--foundry-left-offset', `${leftOffset}px`);
    root.style.setProperty('--foundry-right-offset', `${rightOffset}px`);
  }

  /**
   * Ensure video backgrounds play correctly
   * Some browsers block autoplay even with muted attribute
   */
  _ensureVideoPlays() {
    const video = this.element?.querySelector('video.tom-pv-bg-media');
    if (video) {
      // Force muted state (required for autoplay in most browsers)
      video.muted = true;

      // Try to play the video
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          if (error.name === 'AbortError') return; // Ignore interruption by re-render
          console.warn('Tom | Video autoplay was blocked:', error);
          // Add click handler to play on user interaction
          const playOnClick = () => {
            video.play();
            document.removeEventListener('click', playOnClick);
          };
          document.addEventListener('click', playOnClick, { once: true });
        });
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     ACTIONS
     ═══════════════════════════════════════════════════════════════ */

  static _onCharacterClick(event, target) {
    const charId = target.dataset.id;
    const character = Store.characters.get(charId);

    // Check if character is locked and user is not GM
    if (character?.locked && !game.user.isGM) {
      ui.notifications.warn(`${character.name} is locked. Only the GM can change emotions.`);
      return;
    }

    // Check permission level (GM always has access)
    if (!game.user.isGM && character) {
      const hasPermission = character.hasPermission(game.user.id, 'emotion');
      if (!hasPermission) {
        ui.notifications.warn(`You don't have permission to edit ${character.name}.`);
        return;
      }
    }

    const rect = target.getBoundingClientRect();

    // Determine if character is near top of screen (picker should appear below)
    // Use 300px threshold - if character is within 300px of top, show picker below
    const showBelow = rect.top < 300;

    // Position picker above or below character depending on position
    this.uiState.emotionPicker = {
      open: true,
      characterId: charId,
      x: rect.left + (rect.width / 2),
      y: showBelow ? rect.bottom + 20 : rect.top - 20,
      pickerBelow: showBelow
    };
    this.render();
  }

  static _onClosePicker(event, target) {
    this.uiState.emotionPicker.open = false;
    this.render();
  }

  static _onSelectEmotion(event, target) {
    const charId = this.uiState.emotionPicker.characterId;
    const state = target.dataset.state;

    // Emit update to everyone (including GM who will save it)
    import('../data/TomSocketHandler.mjs').then(({ TomSocketHandler }) => {
      TomSocketHandler.emitUpdateEmotion(charId, state);
    });

    this.uiState.emotionPicker.open = false;
    this.render();
  }

  static _onToggleEmotionFavorite(event, target) {
    event.stopPropagation();
    const charId = this.uiState.emotionPicker.characterId;
    const state = target.dataset.state;
    const character = Store.characters.get(charId);

    if (character && state) {
      if (character.favoriteEmotions.has(state)) {
        character.favoriteEmotions.delete(state);
      } else {
        character.favoriteEmotions.add(state);
      }
      Store.saveData();
      this.render();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     BORDER PICKER ACTIONS
     ═══════════════════════════════════════════════════════════════ */

  static _onOpenBorderPicker(event, target) {
    // Switch from emotion picker to border picker (keep same position and character)
    const charId = this.uiState.emotionPicker.characterId;
    const x = this.uiState.emotionPicker.x;
    const y = this.uiState.emotionPicker.y;
    const pickerBelow = this.uiState.emotionPicker.pickerBelow;

    this.uiState.emotionPicker.open = false;
    this.uiState.borderPicker = {
      open: true,
      characterId: charId,
      x: x,
      y: y,
      pickerBelow: pickerBelow
    };
    this.render();
  }

  static _onCloseBorderPicker(event, target) {
    this.uiState.borderPicker.open = false;
    this.render();
  }

  static _onBackToEmotions(event, target) {
    // Switch back from border picker to emotion picker
    const charId = this.uiState.borderPicker.characterId;
    const x = this.uiState.borderPicker.x;
    const y = this.uiState.borderPicker.y;
    const pickerBelow = this.uiState.borderPicker.pickerBelow;

    this.uiState.borderPicker.open = false;
    this.uiState.emotionPicker = {
      open: true,
      characterId: charId,
      x: x,
      y: y,
      pickerBelow: pickerBelow
    };
    this.render();
  }

  static _onSelectBorder(event, target) {
    const charId = this.uiState.borderPicker.characterId;
    const preset = target.dataset.preset;

    // Emit update to everyone (including GM who will save it)
    import('../data/TomSocketHandler.mjs').then(({ TomSocketHandler }) => {
      TomSocketHandler.emitUpdateBorder(charId, preset);
    });

    // Keep border picker open so user can see the change
    this.render();
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC API & SOCKET HANDLERS
     ═══════════════════════════════════════════════════════════════ */

  static activate(sceneId) {
    if (!this._instance) {
      this._instance = new TomPlayerView();
    }

    // Detectar se é uma nova cena (transição) ou apenas um refresh
    const isNewScene = this._instance.uiState.sceneId !== sceneId;

    this._instance.uiState.previousSceneId = this._instance.uiState.sceneId;
    this._instance.uiState.active = true;
    this._instance.uiState.sceneId = sceneId;
    this._instance.uiState.isSceneTransition = isNewScene; // Só anima se for cena diferente
    this._instance.uiState.sequenceBackground = null; // Clear sequence background when activating a regular scene

    this._instance.render(true);
  }

  static deactivate() {
    if (this._instance && this._instance.uiState.active) {
      // Adicionar classe de saída para animação
      const view = this._instance.element;
      if (view) {
        const playerView = view.querySelector('.tom-player-view');
        if (playerView) {
          playerView.classList.add('closing');

          // Aguardar animação terminar antes de desativar
          setTimeout(() => {
            this._instance.uiState.active = false;
            this._instance.uiState.sceneId = null;
            this._instance.uiState.sequenceBackground = null; // Clear sequence background
            this._instance.render();
          }, 600);
          return;
        }
      }

      // Fallback se não encontrar o elemento
      this._instance.uiState.active = false;
      this._instance.uiState.sceneId = null;
      this._instance.uiState.sequenceBackground = null; // Clear sequence background
      this._instance.render();
    }
  }

  static refresh() {
    if (this._instance && this._instance.uiState.active) {
      this._instance.render();
    }
  }

  /**
   * Update only a specific character's image without full re-render
   * This prevents flickering of other characters when one emotion changes
   */
  static refreshCharacter(characterId) {
    if (!this._instance || !this._instance.uiState.active) return;

    const view = this._instance.element;
    if (!view) return;

    const character = Store.characters.get(characterId);
    if (!character) return;

    // Find the character element and update only its image
    const charElement = view.querySelector(`.tom-pv-character[data-id="${characterId}"]`);
    if (charElement) {
      const img = charElement.querySelector('.tom-pv-portrait img');
      if (img) {
        // Always update the src - the browser will handle caching
        // Using a direct assignment is faster than checking equality
        const newSrc = character.image;
        if (!img.src.endsWith(newSrc) && img.getAttribute('src') !== newSrc) {
          img.src = newSrc;
        }
      }
    }
  }

  /**
   * Update cast (add/remove characters) with minimal re-render
   * Only re-renders the cast strip, not the entire view
   */
  static refreshCast() {
    if (!this._instance || !this._instance.uiState.active) return;
    // For cast changes (add/remove), we need a full render
    // but we avoid triggering scene transition animations
    this._instance.uiState.isSceneTransition = false;
    this._instance.render();
  }

  /**
   * Update only a specific character's border without full re-render
   */
  static refreshCharacterBorder(characterId, borderStyle) {
    if (!this._instance || !this._instance.uiState.active) return;

    const view = this._instance.element;
    if (!view) return;

    // Find the character element and update its border class
    const charElement = view.querySelector(`.tom-pv-character[data-id="${characterId}"]`);
    if (charElement) {
      // Remove old border classes and add new one
      charElement.className = charElement.className.replace(/es-border-\S+/g, '');
      charElement.classList.add(`es-border-${borderStyle}`);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     SLIDESHOW METHODS
     ═══════════════════════════════════════════════════════════════ */

  static setSlideshowMode(enabled, cinematicMode = false, cast = null) {
    if (!this._instance) {
      this._instance = new TomPlayerView();
    }
    this._instance.uiState.slideshowMode = enabled;
    this._instance.uiState.cinematicMode = cinematicMode;
    this._instance.uiState.slideshowPaused = false;

    // Store the fixed cast for the entire slideshow
    // This ensures characters persist across all background changes
    if (enabled && cast) {
      this._instance.uiState.slideshowCast = cast;
    } else if (!enabled) {
      this._instance.uiState.slideshowCast = null;
    }

    if (this._instance.uiState.active) {
      this._instance.render();
    }
  }

  static setSlideshowPaused(paused) {
    if (this._instance) {
      this._instance.uiState.slideshowPaused = paused;
      if (this._instance.uiState.active) {
        this._instance.render();
      }
    }
  }

  static activateWithTransition(sceneId, transitionType = 'fade', transitionDuration = 500) {
    if (!this._instance) {
      this._instance = new TomPlayerView();
    }

    const isNewScene = this._instance.uiState.sceneId !== sceneId;
    const wasActive = this._instance.uiState.active;

    // Update state
    this._instance.uiState.previousSceneId = this._instance.uiState.sceneId;
    this._instance.uiState.active = true;
    this._instance.uiState.sceneId = sceneId;

    // If in slideshow mode and already active, only update background (don't re-render)
    if (this._instance.uiState.slideshowMode && wasActive && isNewScene) {
      this._updateBackgroundOnly(sceneId, transitionType, transitionDuration);
      return;
    }

    // Otherwise do full render (first activation or non-slideshow mode)
    this._instance.uiState.isSceneTransition = isNewScene;
    this._instance.render(true);
  }

  /**
   * Update the cast strip without full re-render
   * Used during slideshow transitions to update characters for new scene
   */
  static _updateCastOnly(scene) {
    const view = this._instance?.element;
    if (!view || !scene) return;

    const castContainer = view.querySelector('.tom-pv-cast');
    if (!castContainer) return;

    // Build new cast HTML
    const castHTML = scene.cast.map(charRef => {
      const realChar = Store.characters.get(charRef.id);
      if (!realChar) return '';

      const isLocked = realChar.locked || false;
      const borderStyle = realChar.borderStyle || 'gold';

      return `
        <div class="es-pv-character ${isLocked ? 'is-locked' : ''}"
             data-id="${realChar.id}"
             data-action="character-click">
          <div class="es-pv-portrait" data-border="${borderStyle}">
            <img src="${realChar.image}" alt="${realChar.name}">
          </div>
          ${isLocked ? `
            <div class="es-pv-lock-indicator" title="Locked - Only GM can change emotions">
              <i class="fas fa-lock"></i>
            </div>
          ` : ''}
          <div class="es-pv-hint">
            <i class="fas ${isLocked ? 'fa-lock' : 'fa-theater-masks'}"></i>
          </div>
          <div class="es-pv-name">${realChar.name}</div>
        </div>
      `;
    }).join('');

    castContainer.innerHTML = castHTML;
  }

  /**
   * Update background during slideshow without full re-render
   * This preserves picker state and keeps the fixed slideshow cast
   * Characters persist across all background changes in slideshow mode
   */
  static _updateBackgroundOnly(sceneId, transitionType = 'dissolve', transitionDuration = 500) {
    const view = this._instance?.element;
    if (!view) return;

    const scene = Store.scenes.get(sceneId);
    if (!scene) return;

    // NOTE: We do NOT update the cast here!
    // In slideshow mode, the cast is fixed from the first scene and persists across all backgrounds
    // This represents a journey where the same characters travel through different locations

    const bgContainer = view.querySelector('.tom-pv-background');
    if (!bgContainer) return;

    const currentMedia = bgContainer.querySelector('.tom-pv-bg-media:not(.tom-bg-outgoing)');
    const isVideo = scene.bgType === 'video';
    const transitionClass = `es-bg-transition-${transitionType}`;

    // Create new background element
    const newMedia = document.createElement(isVideo ? 'video' : 'img');
    newMedia.className = 'es-pv-bg-media es-bg-incoming';
    newMedia.src = scene.background;

    if (isVideo) {
      newMedia.autoplay = true;
      newMedia.loop = true;
      newMedia.muted = true;
      newMedia.playsInline = true;
      newMedia.disablePictureInPicture = true;
      // Force play after append
      newMedia.addEventListener('loadeddata', () => {
        newMedia.play().catch(() => { });
      }, { once: true });
    }

    // Set transition duration on both elements
    newMedia.style.setProperty('--transition-duration', `${transitionDuration}ms`);

    // Add appropriate transition class to the new element
    newMedia.classList.add(transitionClass);

    // Also add transition class to old element so it animates out properly
    if (currentMedia) {
      currentMedia.style.setProperty('--transition-duration', `${transitionDuration}ms`);
      currentMedia.classList.add(transitionClass);
    }

    // Insert new background
    bgContainer.appendChild(newMedia);

    // Trigger transition after a frame (for CSS transition to work)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Add active state to trigger animation (incoming will be overridden by specificity)
        newMedia.classList.add('es-bg-active');

        if (currentMedia) {
          currentMedia.classList.add('es-bg-outgoing');
        }

        // Remove old background after transition completes
        setTimeout(() => {
          if (currentMedia && currentMedia.parentNode) {
            currentMedia.remove();
          }
          // Clean up transition classes from new media
          newMedia.classList.remove('es-bg-incoming', transitionClass, 'es-bg-active');
        }, transitionDuration + 50);
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     SCENE SEQUENCE METHODS (Manual navigation by GM)
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Activate the player view with a sequence (starts at first background)
   */
  static activateSequence(sceneId, background, transitionType = 'dissolve', transitionDuration = 1.0) {
    if (!this._instance) {
      this._instance = new TomPlayerView();
    }

    // Store current background info for sequence
    this._instance.uiState.sequenceBackground = background;

    this._instance.uiState.previousSceneId = this._instance.uiState.sceneId;
    this._instance.uiState.active = true;
    this._instance.uiState.sceneId = sceneId;
    this._instance.uiState.isSceneTransition = true;

    this._instance.render(true);
  }

  /**
   * Update the background during a sequence without re-rendering everything
   */
  static updateSequenceBackground(background, transitionType = 'dissolve', transitionDuration = 1.0) {
    const view = this._instance?.element;
    if (!view) return;

    // Store new background
    this._instance.uiState.sequenceBackground = background;

    const bgContainer = view.querySelector('.tom-pv-background');
    if (!bgContainer) return;

    const currentMedia = bgContainer.querySelector('.tom-pv-bg-media:not(.tom-bg-outgoing)');
    const isVideo = background.bgType === 'video';

    // Convert duration from seconds to milliseconds
    const durationMs = transitionType === 'cut' ? 0 : (transitionDuration * 1000);
    const transitionClass = transitionType === 'cut' ? 'es-bg-transition-cut' : 'es-bg-transition-dissolve';

    // Create new background element
    const newMedia = document.createElement(isVideo ? 'video' : 'img');
    newMedia.className = 'es-pv-bg-media es-bg-incoming';
    newMedia.src = background.path;

    if (isVideo) {
      newMedia.autoplay = true;
      newMedia.loop = true;
      newMedia.muted = true;
      newMedia.playsInline = true;
      newMedia.disablePictureInPicture = true;
      // Force play after append
      newMedia.addEventListener('loadeddata', () => {
        newMedia.play().catch(() => { });
      }, { once: true });
    }

    // Handle cut transition (instant)
    if (transitionType === 'cut') {
      // Just swap immediately
      if (currentMedia) {
        currentMedia.remove();
      }
      bgContainer.appendChild(newMedia);
      return;
    }

    // Handle dissolve transition
    newMedia.style.setProperty('--transition-duration', `${durationMs}ms`);
    newMedia.classList.add(transitionClass);

    if (currentMedia) {
      currentMedia.style.setProperty('--transition-duration', `${durationMs}ms`);
      currentMedia.classList.add(transitionClass);
    }

    bgContainer.appendChild(newMedia);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        newMedia.classList.add('es-bg-active');

        if (currentMedia) {
          currentMedia.classList.add('es-bg-outgoing');
        }

        setTimeout(() => {
          if (currentMedia && currentMedia.parentNode) {
            currentMedia.remove();
          }
          newMedia.classList.remove('es-bg-incoming', transitionClass, 'es-bg-active');
        }, durationMs + 50);
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     CAST-ONLY MODE METHODS (Cast without scene background)
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Activate Cast-Only Mode
   * @param {string[]} characterIds - Array of character IDs to display
   * @param {Object} layoutSettings - Layout settings for cast positioning
   */
  static activateCastOnly(characterIds, layoutSettings) {
    if (!this._instance) {
      this._instance = new TomPlayerView();
    }

    // Set cast-only mode state
    this._instance.uiState.active = true;
    this._instance.uiState.castOnlyMode = true;
    this._instance.uiState.castOnlyCharacterIds = [...characterIds];
    this._instance.uiState.castOnlyLayoutSettings = layoutSettings || CONFIG.DEFAULT_LAYOUT;
    this._instance.uiState.sceneId = null; // No scene in cast-only mode
    this._instance.uiState.isSceneTransition = true; // Trigger entrance animation

    this._instance.render(true);
  }

  /**
   * Deactivate Cast-Only Mode
   */
  static deactivateCastOnly() {
    if (!this._instance || !this._instance.uiState.castOnlyMode) return;

    // Animate out
    const view = this._instance.element;
    if (view) {
      const playerView = view.querySelector('.tom-player-view');
      if (playerView) {
        playerView.classList.add('closing');

        setTimeout(() => {
          this._instance.uiState.active = false;
          this._instance.uiState.castOnlyMode = false;
          this._instance.uiState.castOnlyCharacterIds = [];
          this._instance.render();
        }, 600);
        return;
      }
    }

    // Fallback
    this._instance.uiState.active = false;
    this._instance.uiState.castOnlyMode = false;
    this._instance.uiState.castOnlyCharacterIds = [];
    this._instance.render();
  }

  /**
   * Update Cast-Only Mode (characters or layout)
   * @param {string[]} characterIds - Updated character IDs (optional)
   * @param {Object} layoutSettings - Updated layout settings (optional)
   */
  static updateCastOnly(characterIds, layoutSettings) {
    if (!this._instance || !this._instance.uiState.castOnlyMode) return;

    if (characterIds) {
      this._instance.uiState.castOnlyCharacterIds = [...characterIds];
    }
    if (layoutSettings) {
      this._instance.uiState.castOnlyLayoutSettings = layoutSettings;
    }

    // Don't trigger scene transition animation
    this._instance.uiState.isSceneTransition = false;
    this._instance.render();
  }

  /**
   * Refresh a character in Cast-Only Mode
   * @param {string} characterId - Character ID to refresh
   */
  static refreshCastOnlyCharacter(characterId) {
    if (!this._instance || !this._instance.uiState.castOnlyMode) return;
    this.refreshCharacter(characterId);
  }
}
