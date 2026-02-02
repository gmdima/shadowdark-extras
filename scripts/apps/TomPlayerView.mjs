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
      // Cast-Only Mode state (cast without scene background)
      castOnlyMode: false,
      castOnlyCharacterIds: [],
      castOnlyLayoutSettings: null,
      // Arena tokens state
      arenaTokens: new Map(), // Map of tokenId -> { characterId, actorId, actorName, image, x, y, ownerId }
      // Arena assets state (GM-only image assets)
      arenaAssets: new Map(), // Map of assetId -> { image, x, y, scale }
      // Z-order counter for stacking tokens/assets (increments on each click)
      arenaZOrder: 10
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

    // === ARENA MODE: DRAG/DROP FOR PORTRAITS ===
    const scene = this.uiState.sceneId ? Store.scenes.get(this.uiState.sceneId) : null;
    if (scene?.isArena) {
      this._setupArenaDragDrop();
    }

    // === RIGHT-CLICK TO REMOVE CAST (GM ONLY) ===
    if (game.user.isGM) {
      const castPortraits = this.element.querySelectorAll('.tom-pv-character');
      castPortraits.forEach(portrait => {
        portrait.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const charId = portrait.dataset.id;
          if (charId && this.uiState.sceneId) {
            Store.removeCastMember(this.uiState.sceneId, charId);
            ui.notifications.info(`Removed ${portrait.querySelector('.tom-pv-name')?.textContent || 'character'} from broadcast.`);
          }
        });
      });
    }
  }

  /**
   * Setup drag/drop functionality for arena mode
   */
  _setupArenaDragDrop() {
    const portraits = this.element.querySelectorAll('.tom-pv-character');
    const arenaArea = this.element.querySelector('.tom-arena-rings');

    if (!arenaArea) return;

    portraits.forEach(portrait => {
      const charId = portrait.dataset.id;
      const character = Store.characters.get(charId);

      // Check if player can spawn tokens for this character
      const canSpawn = game.user.isGM || (character && character.canUserSpawnToken(game.user.id));

      if (canSpawn) {
        portrait.setAttribute('draggable', 'true');
        portrait.classList.add('can-spawn');

        portrait.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', JSON.stringify({
            characterId: charId,
            characterName: character?.name || 'Unknown',
            characterImage: character?.image || ''
          }));
          e.dataTransfer.effectAllowed = 'copy';
          portrait.classList.add('dragging');
        });

        portrait.addEventListener('dragend', (e) => {
          portrait.classList.remove('dragging');
        });
      }
    });

    // Setup drop zone on the entire player view (arena area)
    const playerView = this.element.querySelector('.tom-player-view');
    if (playerView) {
      playerView.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      });

      playerView.addEventListener('drop', async (e) => {
        e.preventDefault();

        // Calculate drop position as percentage of viewport
        const rect = playerView.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        // Get all available data types for debugging
        const types = e.dataTransfer.types;
        console.log('Tom | Drop event - available types:', types);

        // Try to get data from various sources
        const rawData = e.dataTransfer.getData('text/plain');
        const uriData = e.dataTransfer.getData('text/uri-list');
        const htmlData = e.dataTransfer.getData('text/html');

        console.log('Tom | Drop data - text/plain:', rawData);
        console.log('Tom | Drop data - text/uri-list:', uriData);

        try {
          // Check for FilePicker image drop (GM only)
          if (game.user.isGM) {
            // Try different sources for file path
            let filePath = null;

            // Check text/plain for direct file path
            if (rawData && !rawData.startsWith('{') && !rawData.startsWith('[')) {
              const isImage = /\.(webp|png|jpg|jpeg|gif|svg|webm|mp4)$/i.test(rawData);
              if (isImage) {
                filePath = rawData;
              }
            }

            // Check text/uri-list
            if (!filePath && uriData) {
              const isImage = /\.(webp|png|jpg|jpeg|gif|svg|webm|mp4)$/i.test(uriData);
              if (isImage) {
                filePath = uriData;
              }
            }

            // Check if rawData is JSON with a file path (Foundry Tile format)
            if (!filePath && rawData && rawData.startsWith('{')) {
              try {
                const parsed = JSON.parse(rawData);
                if (parsed.type === 'Tile' && parsed.texture?.src) {
                  filePath = parsed.texture.src;
                } else if (parsed.src || parsed.path || parsed.img) {
                  filePath = parsed.src || parsed.path || parsed.img;
                }
              } catch (e) { /* not JSON */ }
            }

            if (filePath) {
              console.log('Tom | Spawning asset from:', filePath);
              this._spawnAsset(filePath, x, y);
              return;
            }
          }

          const data = JSON.parse(rawData);

          // Check if it's a Foundry Actor drop (from sidebar)
          if (data.type === 'Actor' && data.uuid) {
            // Only GM can drop actors from sidebar
            if (!game.user.isGM) {
              ui.notifications.warn("Only the GM can drop actors from the sidebar.");
              return;
            }

            const actor = await fromUuid(data.uuid);
            if (!actor) {
              ui.notifications.warn("Could not find the actor.");
              return;
            }

            // Use actor's portrait image (img, fallback to token texture)
            const image = actor.img || actor.prototypeToken?.texture?.src || 'icons/svg/mystery-man.svg';

            // Spawn the token - GM is the owner, but players with actor ownership can also move it
            this._spawnActorToken(actor, image, x, y);
            return;
          }

          // Otherwise, handle Tom character portrait drop
          const characterId = data.characterId || (data.type === 'character' ? data.id : null);
          if (!characterId) return;

          const character = Store.characters.get(characterId);
          if (!character) return;

          // Check permission again
          const canSpawn = game.user.isGM || character.canUserSpawnToken(game.user.id);
          if (!canSpawn) {
            ui.notifications.warn("You don't have permission to spawn tokens for this character.");
            return;
          }

          // Get owned actors
          const ownedActors = game.actors.filter(a => a.isOwner && a.type === 'Player');

          if (ownedActors.length === 0) {
            ui.notifications.warn("You don't own any actors.");
            return;
          }

          let selectedActor;
          if (ownedActors.length === 1) {
            selectedActor = ownedActors[0];
          } else {
            // Show actor selection dialog
            selectedActor = await this._showActorSelectionDialog(ownedActors);
            if (!selectedActor) return; // User cancelled
          }

          // Spawn the token
          this._spawnToken(data.characterId, character.image, selectedActor, x, y);
        } catch (err) {
          console.error('Tom | Error handling drop:', err);
        }
      });
    }

    // Setup dragging for existing arena tokens
    this._setupArenaTokenDragging();

    // Setup dragging/resizing for arena assets (GM only)
    this._setupArenaAssetInteraction();
  }

  /**
   * Show dialog to select an actor when player owns multiple
   */
  async _showActorSelectionDialog(actors) {
    return new Promise((resolve) => {
      const content = `
        <form>
          <div class="form-group">
            <label>Select your character:</label>
            <select name="actorId" style="width: 100%;">
              ${actors.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
            </select>
          </div>
        </form>
      `;

      new Dialog({
        title: "Select Character",
        content,
        buttons: {
          ok: {
            icon: '<i class="fas fa-check"></i>',
            label: "Spawn",
            callback: (html) => {
              const actorId = html.find('select[name="actorId"]').val();
              resolve(game.actors.get(actorId));
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
            callback: () => resolve(null)
          }
        },
        default: "ok"
      }).render(true);
    });
  }

  /**
   * Spawn a token on the arena (from Tom character portrait)
   */
  _spawnToken(characterId, image, actor, x, y) {
    const tokenId = foundry.utils.randomID();

    import('../data/TomSocketHandler.mjs').then(({ TomSocketHandler }) => {
      TomSocketHandler.emitArenaTokenSpawn({
        tokenId,
        characterId,
        actorId: actor.id,
        actorName: actor.name,
        image,
        x,
        y,
        ownerId: game.user.id
      });
    });
  }

  /**
   * Spawn a token on the arena (from Foundry actor sidebar)
   * GM spawns these, but players with actor ownership can move them
   */
  _spawnActorToken(actor, image, x, y) {
    const tokenId = foundry.utils.randomID();

    import('../data/TomSocketHandler.mjs').then(({ TomSocketHandler }) => {
      TomSocketHandler.emitArenaTokenSpawn({
        tokenId,
        characterId: null, // No Tom character associated
        actorId: actor.id,
        actorName: actor.name,
        actorType: actor.type, // 'Player', 'NPC', etc.
        image,
        x,
        y,
        ownerId: actor.id // Use actor ID as owner - checked against actor ownership
      });
    });
  }

  /**
   * Spawn an asset on the arena (GM only)
   */
  _spawnAsset(image, x, y) {
    const assetId = foundry.utils.randomID();

    import('../data/TomSocketHandler.mjs').then(({ TomSocketHandler }) => {
      TomSocketHandler.emitArenaAssetSpawn({
        assetId,
        image,
        x,
        y,
        scale: 1
      });
    });
  }

  /**
   * Setup dragging and resizing for arena assets (GM only)
   */
  _setupArenaAssetInteraction() {
    if (!game.user.isGM) return;

    const assets = this.element.querySelectorAll('.tom-arena-asset:not([data-asset-initialized])');
    const playerView = this.element.querySelector('.tom-player-view');

    assets.forEach(asset => {
      const assetId = asset.dataset.assetId;
      asset.dataset.assetInitialized = 'true';

      // Drag functionality
      const dragState = { isDragging: false };

      asset.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        dragState.isDragging = true;
        asset.classList.add('dragging');

        // Bring to front: increment z-order counter and apply to this element
        this.uiState.arenaZOrder++;
        asset.style.zIndex = this.uiState.arenaZOrder;

        e.preventDefault();
        e.stopPropagation();
      });

      document.addEventListener('mousemove', (e) => {
        if (!dragState.isDragging) return;

        const rect = playerView.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        const clampedX = Math.max(2, Math.min(98, x));
        const clampedY = Math.max(2, Math.min(98, y));

        asset.style.left = `${clampedX}%`;
        asset.style.top = `${clampedY}%`;

        // Update local state
        const assetData = this.uiState.arenaAssets.get(assetId);
        if (assetData) {
          assetData.x = clampedX;
          assetData.y = clampedY;
        }
      });

      document.addEventListener('mouseup', (e) => {
        if (!dragState.isDragging) return;
        dragState.isDragging = false;
        asset.classList.remove('dragging');

        const rect = playerView.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        const clampedX = Math.max(2, Math.min(98, x));
        const clampedY = Math.max(2, Math.min(98, y));

        import('../data/TomSocketHandler.mjs').then(({ TomSocketHandler }) => {
          TomSocketHandler.emitArenaAssetMove({ assetId, x: clampedX, y: clampedY });
        });
      });

      // Wheel resize functionality
      asset.addEventListener('wheel', (e) => {
        e.preventDefault();

        const assetData = this.uiState.arenaAssets.get(assetId);
        if (!assetData) return;

        // Calculate new scale
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newScale = Math.max(0.2, Math.min(5, (assetData.scale || 1) + delta));

        // Update local state and DOM
        assetData.scale = newScale;
        asset.style.transform = `translate(-50%, -50%) scale(${newScale})`;

        // Emit resize
        import('../data/TomSocketHandler.mjs').then(({ TomSocketHandler }) => {
          TomSocketHandler.emitArenaAssetResize({ assetId, scale: newScale });
        });
      });

      // Right-click to remove
      asset.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        import('../data/TomSocketHandler.mjs').then(({ TomSocketHandler }) => {
          TomSocketHandler.emitArenaAssetRemove({ assetId });
        });
      });
    });
  }

  /**
   * Setup dragging for arena tokens
   */
  _setupArenaTokenDragging() {
    const tokens = this.element.querySelectorAll('.tom-arena-token:not([data-drag-initialized])');
    const playerView = this.element.querySelector('.tom-player-view');

    tokens.forEach(token => {
      const tokenId = token.dataset.tokenId;
      const ownerId = token.dataset.ownerId;

      // Mark as initialized to avoid duplicate listeners
      token.dataset.dragInitialized = 'true';

      // Check permissions - ownerId can be a user ID or an actor ID
      const isUserOwner = game.user.id === ownerId;
      // Check if ownerId is an actor and user has ownership of that actor
      const actor = game.actors.get(ownerId);
      const isActorOwner = actor ? actor.isOwner : false;
      const isGM = game.user.isGM;
      const canDrag = isUserOwner || isActorOwner || isGM;
      const canRemove = isUserOwner || isActorOwner || isGM;

      // Right-click to remove (owner or GM only) - always set up if can remove
      if (canRemove) {
        token.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          import('../data/TomSocketHandler.mjs').then(({ TomSocketHandler }) => {
            TomSocketHandler.emitArenaTokenRemove({ tokenId });
          });
        });
      }

      // Only allow owner or GM to drag
      if (!canDrag) return;

      token.classList.add('draggable');

      // Use a closure to track drag state per token
      const dragState = { isDragging: false };

      const onMouseDown = (e) => {
        if (e.button !== 0) return; // Left click only

        // Don't start drag if clicking on interactive elements (HP badge, conditions button, etc.)
        if (e.target.closest('.tom-arena-token-hp, .tom-arena-token-ac, .tom-arena-conditions-btn')) {
          return;
        }

        dragState.isDragging = true;
        token.classList.add('dragging');

        // Bring to front: increment z-order counter and apply to this element
        this.uiState.arenaZOrder++;
        token.style.zIndex = this.uiState.arenaZOrder;

        e.preventDefault();
        e.stopPropagation();
      };

      const onMouseMove = (e) => {
        if (!dragState.isDragging) return;

        const rect = playerView.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        // Clamp to bounds
        const clampedX = Math.max(5, Math.min(95, x));
        const clampedY = Math.max(5, Math.min(95, y));

        // Update position locally for smooth dragging
        token.style.left = `${clampedX}%`;
        token.style.top = `${clampedY}%`;

        // Also update local state to persist through re-renders
        const tokenData = this.uiState.arenaTokens.get(tokenId);
        if (tokenData) {
          tokenData.x = clampedX;
          tokenData.y = clampedY;
        }
      };

      const onMouseUp = (e) => {
        if (!dragState.isDragging) return;
        dragState.isDragging = false;
        token.classList.remove('dragging');

        const rect = playerView.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        // Clamp to bounds
        const clampedX = Math.max(5, Math.min(95, x));
        const clampedY = Math.max(5, Math.min(95, y));

        // Emit position update to all clients
        import('../data/TomSocketHandler.mjs').then(({ TomSocketHandler }) => {
          TomSocketHandler.emitArenaTokenMove({
            tokenId,
            x: clampedX,
            y: clampedY
          });
        });
      };

      token.addEventListener('mousedown', onMouseDown);
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  async _prepareContext(options) {
    const scene = this.uiState.sceneId ? Store.scenes.get(this.uiState.sceneId) : null;

    // Determine which cast to use
    let castSource;
    if (this.uiState.castOnlyMode && this.uiState.castOnlyCharacterIds) {
      // Build cast from character IDs for cast-only mode
      castSource = this.uiState.castOnlyCharacterIds.map(id => {
        const char = Store.characters.get(id);
        return char ? { id: char.id, name: char.name, image: char.image } : null;
      }).filter(c => c !== null);
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
      castOnlyMode: this.uiState.castOnlyMode,
      // Arena Mode flag
      isArena: scene?.isArena || false,
      // Arena tokens (with computed isNPC flag, ownership, and stats)
      arenaTokens: Array.from(this.uiState.arenaTokens.values()).map(token => {
        const typeLower = token.actorType?.toLowerCase() || '';
        const isNPC = token.actorType && typeLower !== 'player' && typeLower !== 'character';

        // Check ownership
        const isUserOwner = game.user.id === token.ownerId;
        const ownerActor = game.actors.get(token.ownerId);
        const isActorOwner = ownerActor ? ownerActor.isOwner : false;
        const isOwner = isUserOwner || isActorOwner || game.user.isGM;

        // Get actor stats if owner
        let ac = '?';
        let hpValue = 0;
        let hpMax = 0;
        if (isOwner) {
          const actor = game.actors.get(token.actorId) || ownerActor;
          if (actor) {
            ac = actor.system?.attributes?.ac?.value ?? actor.system?.ac?.value ?? '?';
            // Use token state HP if available (for NPCs with modified HP), otherwise actor HP
            if (token.currentHp !== undefined) {
              hpValue = token.currentHp;
              hpMax = token.maxHp ?? actor.system?.attributes?.hp?.max ?? actor.system?.hp?.max ?? 0;
            } else {
              hpValue = actor.system?.attributes?.hp?.value ?? actor.system?.hp?.value ?? 0;
              hpMax = actor.system?.attributes?.hp?.max ?? actor.system?.hp?.max ?? 0;
            }
          }
        }

        return {
          ...token,
          isNPC,
          isOwner,
          ac,
          hpValue,
          hpMax
        };
      }),
      // Arena assets (GM-only)
      arenaAssets: Array.from(this.uiState.arenaAssets.values()),
      // Current user ID for ownership checks
      userId: game.user.id
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
      // Clear arena tokens and assets
      this._instance.uiState.arenaTokens.clear();
      this._instance.uiState.arenaAssets.clear();
      this._instance.uiState.arenaZOrder = 10; // Reset z-order counter

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

  static activateWithTransition(sceneId, transitionType = 'fade', transitionDuration = 500) {
    if (!this._instance) {
      this._instance = new TomPlayerView();
    }

    const isNewScene = this._instance.uiState.sceneId !== sceneId;

    // Update state
    this._instance.uiState.previousSceneId = this._instance.uiState.sceneId;
    this._instance.uiState.active = true;
    this._instance.uiState.sceneId = sceneId;

    // Do full render
    this._instance.uiState.isSceneTransition = isNewScene;
    this._instance.render(true);
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

  /* ═══════════════════════════════════════════════════════════════
     ARENA TOKEN METHODS
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Spawn an arena token
   */
  static spawnArenaToken(data) {
    if (!this._instance || !this._instance.uiState.active) return;

    const { tokenId, characterId, actorId, actorName, actorType, image, x, y, ownerId } = data;

    // Add to state
    this._instance.uiState.arenaTokens.set(tokenId, {
      tokenId,
      characterId,
      actorId,
      actorName,
      actorType,
      image,
      x,
      y,
      ownerId
    });

    // Create token element directly (faster than full re-render)
    this._createArenaTokenElement(data);
  }

  /**
   * Create arena token DOM element
   */
  static _createArenaTokenElement(data) {
    const view = this._instance?.element;
    if (!view) return;

    let tokensContainer = view.querySelector('.tom-arena-tokens');
    if (!tokensContainer) {
      // Create container if it doesn't exist
      const playerView = view.querySelector('.tom-player-view');
      if (!playerView) return;

      tokensContainer = document.createElement('div');
      tokensContainer.className = 'tom-arena-tokens';
      playerView.appendChild(tokensContainer);
    }

    const { tokenId, actorId, actorName, actorType, image, x, y, ownerId } = data;
    // Check ownership - can be user ID or actor ID
    const isUserOwner = game.user.id === ownerId;
    const ownerActor = game.actors.get(ownerId);
    const isActorOwner = ownerActor ? ownerActor.isOwner : false;
    const isOwner = isUserOwner || isActorOwner || game.user.isGM;

    // Get the actual actor for stats (may be different from ownerActor)
    const actor = game.actors.get(actorId) || ownerActor;

    // Determine if NPC for styling (case-insensitive check)
    const actorTypeLower = actorType?.toLowerCase() || '';
    const isNPC = actorType && actorTypeLower !== 'player' && actorTypeLower !== 'character';

    // Get AC and HP - use token state if available (for NPCs with modified HP), otherwise from actor
    const tokenState = this._instance?.uiState.arenaTokens.get(tokenId);
    let ac = '?';
    let hpValue = 0;
    let hpMax = 0;

    if (actor) {
      ac = actor.system?.attributes?.ac?.value ?? actor.system?.ac?.value ?? '?';
      // For NPCs, use token state HP if set, otherwise actor HP
      if (isNPC && tokenState?.currentHp !== undefined) {
        hpValue = tokenState.currentHp;
        hpMax = tokenState.maxHp ?? actor.system?.attributes?.hp?.max ?? actor.system?.hp?.max ?? 0;
      } else {
        hpValue = actor.system?.attributes?.hp?.value ?? actor.system?.hp?.value ?? 0;
        hpMax = actor.system?.attributes?.hp?.max ?? actor.system?.hp?.max ?? 0;
      }
    }

    // Store HP in token state if not already there
    if (tokenState && tokenState.currentHp === undefined) {
      tokenState.currentHp = hpValue;
      tokenState.maxHp = hpMax;
    }

    // Build badges (only show to owners)
    let acBadge = '';
    let hpBadge = '';
    if (isOwner) {
      acBadge = `<div class="tom-arena-token-ac">${ac}</div>`;
      hpBadge = `<div class="tom-arena-token-hp" data-clickable="true">${hpValue}/${hpMax}</div>`;
    }

    // Get active conditions from token state
    const conditions = tokenState?.conditions || [];
    const conditionsHtml = conditions.map(c => {
      const condDef = this.ARENA_CONDITIONS.find(def => def.id === c);
      if (!condDef) return '';
      return `<div class="tom-arena-condition" data-condition="${c}" title="${condDef.name}">
        ${condDef.icon.startsWith('fa') ? `<i class="${condDef.icon}"></i>` : `<img src="${condDef.icon}">`}
      </div>`;
    }).join('');

    // GM conditions button
    const gmConditionsBtn = game.user.isGM ?
      `<button class="tom-arena-conditions-btn" title="Manage Conditions"><i class="fas fa-heart-crack"></i></button>` : '';

    const tokenEl = document.createElement('div');
    tokenEl.className = `tom-arena-token ${isOwner ? 'draggable' : ''} ${isNPC ? 'npc' : ''}`;
    tokenEl.dataset.tokenId = tokenId;
    tokenEl.dataset.ownerId = ownerId;
    tokenEl.dataset.actorId = actorId || '';
    tokenEl.dataset.actorType = actorType || '';
    tokenEl.dataset.isNpc = isNPC ? 'true' : 'false';
    tokenEl.style.left = `${x}%`;
    tokenEl.style.top = `${y}%`;
    tokenEl.innerHTML = `
      <div class="tom-arena-token-portrait">
        <img src="${image}" alt="${actorName}">
        <div class="tom-arena-conditions">${conditionsHtml}</div>
        ${gmConditionsBtn}
      </div>
      <div class="tom-arena-token-info">
        ${acBadge}
        <div class="tom-arena-token-name">${actorName}</div>
        ${hpBadge}
      </div>
    `;

    tokensContainer.appendChild(tokenEl);

    // Setup HP click handler for owners
    if (isOwner) {
      const hpEl = tokenEl.querySelector('.tom-arena-token-hp');
      if (hpEl) {
        hpEl.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._showHpEditDialog(tokenId, actorId, isNPC, hpValue, hpMax, actorName);
        });
      }
    }

    // Setup conditions button for GM
    if (game.user.isGM) {
      const condBtn = tokenEl.querySelector('.tom-arena-conditions-btn');
      if (condBtn) {
        condBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._showConditionsPicker(tokenId, actorName, conditions, tokenEl);
        });
      }
    }

    // Setup dragging for this token
    this._instance._setupArenaTokenDragging();
  }

  /**
   * Available conditions for arena tokens
   */
  static ARENA_CONDITIONS = [
    { id: 'dead', name: 'Dead', icon: 'fas fa-skull' },
    { id: 'unconscious', name: 'Unconscious', icon: 'fas fa-bed' },
    { id: 'paralyzed', name: 'Paralyzed', icon: 'fas fa-bolt' },
    { id: 'poisoned', name: 'Poisoned', icon: 'fas fa-skull-crossbones' },
    { id: 'stunned', name: 'Stunned', icon: 'fas fa-stars' },
    { id: 'blinded', name: 'Blinded', icon: 'fas fa-eye-slash' },
    { id: 'deafened', name: 'Deafened', icon: 'fas fa-ear-deaf' },
    { id: 'frightened', name: 'Frightened', icon: 'fas fa-ghost' },
    { id: 'charmed', name: 'Charmed', icon: 'fas fa-heart' },
    { id: 'restrained', name: 'Restrained', icon: 'fas fa-link' },
    { id: 'prone', name: 'Prone', icon: 'fas fa-person-falling' },
    { id: 'invisible', name: 'Invisible', icon: 'fas fa-eye-low-vision' },
    { id: 'petrified', name: 'Petrified', icon: 'fas fa-gem' },
    { id: 'burning', name: 'Burning', icon: 'fas fa-fire' },
    { id: 'frozen', name: 'Frozen', icon: 'fas fa-snowflake' },
    { id: 'bleeding', name: 'Bleeding', icon: 'fas fa-droplet' },
    { id: 'concentrating', name: 'Concentrating', icon: 'fas fa-brain' },
    { id: 'blessed', name: 'Blessed', icon: 'fas fa-hand-sparkles' },
    { id: 'cursed', name: 'Cursed', icon: 'fas fa-hand-middle-finger' },
    { id: 'hasted', name: 'Hasted', icon: 'fas fa-wind' },
    { id: 'slowed', name: 'Slowed', icon: 'fas fa-hourglass-half' },
    { id: 'silenced', name: 'Silenced', icon: 'fas fa-volume-xmark' },
    { id: 'exhausted', name: 'Exhausted', icon: 'fas fa-face-tired' },
    { id: 'marked', name: 'Marked', icon: 'fas fa-crosshairs' }
  ];

  /**
   * Show conditions picker for a token (GM only)
   */
  static _showConditionsPicker(tokenId, actorName, activeConditions, tokenEl) {
    // Remove any existing picker
    document.querySelector('.tom-conditions-picker')?.remove();

    const picker = document.createElement('div');
    picker.className = 'tom-conditions-picker';

    // Header
    const header = document.createElement('div');
    header.className = 'tom-conditions-header';
    header.innerHTML = `<span><i class="fas fa-heart-crack"></i> ${actorName}</span>
      <button class="tom-conditions-close"><i class="fas fa-times"></i></button>`;
    picker.appendChild(header);

    // Conditions grid
    const grid = document.createElement('div');
    grid.className = 'tom-conditions-grid';

    for (const cond of this.ARENA_CONDITIONS) {
      const isActive = activeConditions.includes(cond.id);
      const item = document.createElement('div');
      item.className = `tom-condition-item ${isActive ? 'active' : ''}`;
      item.dataset.conditionId = cond.id;
      item.title = cond.name;
      item.innerHTML = `
        ${cond.icon.startsWith('fa') ? `<i class="${cond.icon}"></i>` : `<img src="${cond.icon}">`}
        <span>${cond.name}</span>
      `;

      item.addEventListener('click', async () => {
        // Check current state dynamically (not captured isActive)
        const currentlyActive = item.classList.contains('active');

        let newConditions;
        if (currentlyActive) {
          // Remove condition
          newConditions = activeConditions.filter(c => c !== cond.id);
          const idx = activeConditions.indexOf(cond.id);
          if (idx > -1) activeConditions.splice(idx, 1);
        } else {
          // Add condition
          newConditions = [...activeConditions, cond.id];
          activeConditions.push(cond.id);
        }

        // Update picker UI
        item.classList.toggle('active');

        // Update via socket
        const { TomSocketHandler } = await import('../data/TomSocketHandler.mjs');
        TomSocketHandler.emitArenaTokenConditionsUpdate({ tokenId, conditions: newConditions });
      });

      grid.appendChild(item);
    }

    picker.appendChild(grid);

    // Position near the token
    const tokenRect = tokenEl.getBoundingClientRect();
    picker.style.position = 'fixed';
    picker.style.left = `${tokenRect.right + 10}px`;
    picker.style.top = `${tokenRect.top}px`;

    // Adjust if off-screen
    document.body.appendChild(picker);
    const pickerRect = picker.getBoundingClientRect();
    if (pickerRect.right > window.innerWidth) {
      picker.style.left = `${tokenRect.left - pickerRect.width - 10}px`;
    }
    if (pickerRect.bottom > window.innerHeight) {
      picker.style.top = `${window.innerHeight - pickerRect.height - 10}px`;
    }

    // Close button
    header.querySelector('.tom-conditions-close').addEventListener('click', () => picker.remove());

    // Close on click outside
    const closeHandler = (e) => {
      if (!picker.contains(e.target) && !e.target.closest('.tom-arena-conditions-btn')) {
        picker.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);
  }

  /**
   * Show dialog to edit token HP
   */
  static _showHpEditDialog(tokenId, actorId, isNPC, currentHp, maxHp, actorName) {
    new Dialog({
      title: `Edit HP - ${actorName}`,
      content: `
        <form class="tom-hp-edit-dialog">
          <div class="form-group">
            <label>Current HP</label>
            <input type="number" name="hp" value="${currentHp}" min="0" max="${maxHp}" autofocus>
            <span class="tom-hp-max">/ ${maxHp}</span>
          </div>
        </form>
      `,
      buttons: {
        save: {
          icon: '<i class="fas fa-check"></i>',
          label: "Save",
          callback: async (html) => {
            const newHp = parseInt(html.find('input[name="hp"]').val()) || 0;
            const clampedHp = Math.max(0, Math.min(newHp, maxHp));

            // Import socket handler
            const { TomSocketHandler } = await import('../data/TomSocketHandler.mjs');

            if (isNPC) {
              // For NPCs, update token state and broadcast
              TomSocketHandler.emitArenaTokenHpUpdate({ tokenId, hp: clampedHp, maxHp });
            } else {
              // For players, update the actor directly
              const actor = game.actors.get(actorId);
              if (actor) {
                await actor.update({ 'system.attributes.hp.value': clampedHp });
                // Broadcast token HP update to sync display
                TomSocketHandler.emitArenaTokenHpUpdate({ tokenId, hp: clampedHp, maxHp });
              }
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "save"
    }).render(true);
  }

  /**
   * Move an arena token
   */
  static moveArenaToken(tokenId, x, y) {
    if (!this._instance) return;

    // Update state
    const token = this._instance.uiState.arenaTokens.get(tokenId);
    if (token) {
      token.x = x;
      token.y = y;
    }

    // Update DOM
    const view = this._instance.element;
    if (!view) return;

    const tokenEl = view.querySelector(`.tom-arena-token[data-token-id="${tokenId}"]`);
    if (tokenEl) {
      tokenEl.style.left = `${x}%`;
      tokenEl.style.top = `${y}%`;
    }
  }

  /**
   * Remove an arena token
   */
  static removeArenaToken(tokenId) {
    if (!this._instance) return;

    // Remove from state
    this._instance.uiState.arenaTokens.delete(tokenId);

    // Remove from DOM
    const view = this._instance.element;
    if (!view) return;

    const tokenEl = view.querySelector(`.tom-arena-token[data-token-id="${tokenId}"]`);
    if (tokenEl) {
      tokenEl.classList.add('removing');
      setTimeout(() => tokenEl.remove(), 300);
    }
  }

  /**
   * Update an arena token's HP display
   */
  static updateArenaTokenHp(tokenId, hp, maxHp) {
    if (!this._instance) return;

    // Update state
    const token = this._instance.uiState.arenaTokens.get(tokenId);
    if (token) {
      token.currentHp = hp;
      token.maxHp = maxHp;
    }

    // Update DOM
    const view = this._instance.element;
    if (!view) return;

    const tokenEl = view.querySelector(`.tom-arena-token[data-token-id="${tokenId}"]`);
    if (tokenEl) {
      const hpEl = tokenEl.querySelector('.tom-arena-token-hp');
      if (hpEl) {
        hpEl.textContent = `${hp}/${maxHp}`;
      }
    }
  }

  /**
   * Update an arena token's conditions display
   */
  static updateArenaTokenConditions(tokenId, conditions) {
    if (!this._instance) return;

    // Update state
    const token = this._instance.uiState.arenaTokens.get(tokenId);
    if (token) {
      token.conditions = conditions;
    }

    // Update DOM
    const view = this._instance.element;
    if (!view) return;

    const tokenEl = view.querySelector(`.tom-arena-token[data-token-id="${tokenId}"]`);
    if (tokenEl) {
      const conditionsContainer = tokenEl.querySelector('.tom-arena-conditions');
      if (conditionsContainer) {
        const conditionsHtml = conditions.map(c => {
          const condDef = this.ARENA_CONDITIONS.find(def => def.id === c);
          if (!condDef) return '';
          return `<div class="tom-arena-condition" data-condition="${c}" title="${condDef.name}">
            ${condDef.icon.startsWith('fa') ? `<i class="${condDef.icon}"></i>` : `<img src="${condDef.icon}">`}
          </div>`;
        }).join('');
        conditionsContainer.innerHTML = conditionsHtml;
      }
    }
  }

  /**
   * Clear all arena tokens (called when broadcast stops)
   */
  static clearArenaTokens() {
    if (!this._instance) return;
    this._instance.uiState.arenaTokens.clear();
  }

  /* ═══════════════════════════════════════════════════════════════
     ARENA ASSET METHODS (GM-only image assets)
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Spawn an arena asset
   */
  static spawnArenaAsset(data) {
    if (!this._instance || !this._instance.uiState.active) return;

    const { assetId, image, x, y, scale } = data;

    // Add to state
    this._instance.uiState.arenaAssets.set(assetId, {
      assetId,
      image,
      x,
      y,
      scale: scale || 1
    });

    // Create asset element
    this._createArenaAssetElement(data);
  }

  /**
   * Create arena asset DOM element
   */
  static _createArenaAssetElement(data) {
    const view = this._instance?.element;
    if (!view) return;

    let assetsContainer = view.querySelector('.tom-arena-assets');
    if (!assetsContainer) {
      const playerView = view.querySelector('.tom-player-view');
      if (!playerView) return;

      assetsContainer = document.createElement('div');
      assetsContainer.className = 'tom-arena-assets';
      playerView.appendChild(assetsContainer);
    }

    const { assetId, image, x, y, scale } = data;

    const assetEl = document.createElement('div');
    assetEl.className = `tom-arena-asset ${game.user.isGM ? 'gm-control' : ''}`;
    assetEl.dataset.assetId = assetId;
    assetEl.style.left = `${x}%`;
    assetEl.style.top = `${y}%`;
    assetEl.style.transform = `translate(-50%, -50%) scale(${scale || 1})`;
    assetEl.innerHTML = `<img src="${image}" alt="Asset">`;

    assetsContainer.appendChild(assetEl);

    // Setup interaction (GM only)
    this._instance._setupArenaAssetInteraction();
  }

  /**
   * Move an arena asset
   */
  static moveArenaAsset(assetId, x, y) {
    if (!this._instance) return;

    const asset = this._instance.uiState.arenaAssets.get(assetId);
    if (asset) {
      asset.x = x;
      asset.y = y;
    }

    const view = this._instance.element;
    if (!view) return;

    const assetEl = view.querySelector(`.tom-arena-asset[data-asset-id="${assetId}"]`);
    if (assetEl) {
      assetEl.style.left = `${x}%`;
      assetEl.style.top = `${y}%`;
    }
  }

  /**
   * Resize an arena asset
   */
  static resizeArenaAsset(assetId, scale) {
    if (!this._instance) return;

    const asset = this._instance.uiState.arenaAssets.get(assetId);
    if (asset) {
      asset.scale = scale;
    }

    const view = this._instance.element;
    if (!view) return;

    const assetEl = view.querySelector(`.tom-arena-asset[data-asset-id="${assetId}"]`);
    if (assetEl) {
      assetEl.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }
  }

  /**
   * Remove an arena asset
   */
  static removeArenaAsset(assetId) {
    if (!this._instance) return;

    this._instance.uiState.arenaAssets.delete(assetId);

    const view = this._instance.element;
    if (!view) return;

    const assetEl = view.querySelector(`.tom-arena-asset[data-asset-id="${assetId}"]`);
    if (assetEl) {
      assetEl.classList.add('removing');
      setTimeout(() => assetEl.remove(), 300);
    }
  }

  /**
   * Clear all arena assets
   */
  static clearArenaAssets() {
    if (!this._instance) return;
    this._instance.uiState.arenaAssets.clear();
  }
}
