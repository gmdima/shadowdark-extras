import { TOM_CONFIG as CONFIG } from '../TomConfig.mjs';
import { TomStore as Store } from '../data/TomStore.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function getSizeValue(size) {
  const preset = CONFIG.SIZE_PRESETS[size];
  if (preset) return preset.value;
  
  if (typeof size === 'number') return `${size}vh`;
  
  if (typeof size === 'string' && size.match(/^\d+/)) return size;
  
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
      previousSceneId: null,  
      isSceneTransition: false, 
      
      castOnlyMode: false,
      castOnlyCharacterIds: [],
      castOnlyLayoutSettings: null,
      
      arenaTokens: new Map(), 
      
      arenaAssets: new Map(), 
      
      arenaZOrder: 10,
      
      ruler: { active: false, startX: 0, startY: 0, endX: 0, endY: 0, startElement: null }
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

  

  _onRender(context, options) {
    super._onRender(context, options);

    
    this._setFoundryUIOffsets();

    
    this._ensureVideoPlays();

    
    if (this.uiState.isSceneTransition) {
      const background = this.element.querySelector('.tom-pv-bg-media');
      const characters = this.element.querySelectorAll('.tom-pv-character');

      
      if (background) {
        background.classList.add('es-transition-fade');
        background.addEventListener('animationend', () => {
          background.classList.remove('es-transition-fade');
        }, { once: true });
      }

      
      characters.forEach((char, index) => {
        char.style.setProperty('--char-index', index);
        char.classList.add('es-entering');
        char.addEventListener('animationend', () => {
          char.classList.remove('es-entering');
        }, { once: true });
      });

      
      this.uiState.isSceneTransition = false;
    }

    
    const emotionPicker = this.element.querySelector('.tom-emotion-picker');
    if (emotionPicker) {
      
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
        
        setTimeout(() => searchInput.focus(), 50);
      }

      
      
      const previewPanel = this.element.querySelector('.tom-player-view > .tom-picker-preview');
      const previewImg = previewPanel?.querySelector('img');
      const previewLabel = previewPanel?.querySelector('.tom-picker-preview-label');
      const items = emotionPicker.querySelectorAll('.tom-picker-item');

      
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

            
            const spaceAbove = pickerRect.top - MARGIN;

            
            left = pickerRect.left + (pickerRect.width / 2) - (PREVIEW_WIDTH / 2);

            
            left = Math.max(MARGIN, Math.min(left, viewportWidth - PREVIEW_WIDTH - MARGIN));

            
            previewPanel.classList.remove('preview-left', 'preview-below');

            if (spaceAbove >= PREVIEW_HEIGHT) {
              
              top = pickerRect.top - PREVIEW_HEIGHT - 16;
              previewPanel.classList.add('preview-above');
            } else {
              
              top = pickerRect.bottom + 16;
              previewPanel.classList.remove('preview-above');
              previewPanel.classList.add('preview-below');
            }

            
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

    
    const scene = this.uiState.sceneId ? Store.scenes.get(this.uiState.sceneId) : null;
    if (scene?.isArena) {
      this._setupArenaDragDrop();
      this._setupArenaRuler();
    }

    
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

  
  _setupArenaDragDrop() {
    const portraits = this.element.querySelectorAll('.tom-pv-character');
    const arenaArea = this.element.querySelector('.tom-arena-rings');

    if (!arenaArea) return;

    portraits.forEach(portrait => {
      const charId = portrait.dataset.id;
      const character = Store.characters.get(charId);

      
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

    
    const playerView = this.element.querySelector('.tom-player-view');
    if (playerView) {
      playerView.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      });

      playerView.addEventListener('drop', async (e) => {
        e.preventDefault();

        
        const rect = playerView.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        
        const types = e.dataTransfer.types;
        console.log('Tom | Drop event - available types:', types);

        
        const rawData = e.dataTransfer.getData('text/plain');
        const uriData = e.dataTransfer.getData('text/uri-list');
        const htmlData = e.dataTransfer.getData('text/html');

        console.log('Tom | Drop data - text/plain:', rawData);
        console.log('Tom | Drop data - text/uri-list:', uriData);

        try {
          
          if (game.user.isGM) {
            
            let filePath = null;

            
            if (rawData && !rawData.startsWith('{') && !rawData.startsWith('[')) {
              const isImage = /\.(webp|png|jpg|jpeg|gif|svg|webm|mp4)$/i.test(rawData);
              if (isImage) {
                filePath = rawData;
              }
            }

            
            if (!filePath && uriData) {
              const isImage = /\.(webp|png|jpg|jpeg|gif|svg|webm|mp4)$/i.test(uriData);
              if (isImage) {
                filePath = uriData;
              }
            }

            
            if (!filePath && rawData && rawData.startsWith('{')) {
              try {
                const parsed = JSON.parse(rawData);
                if (parsed.type === 'Tile' && parsed.texture?.src) {
                  filePath = parsed.texture.src;
                } else if (parsed.src || parsed.path || parsed.img) {
                  filePath = parsed.src || parsed.path || parsed.img;
                }
              } catch (e) {  }
            }

            if (filePath) {
              console.log('Tom | Spawning asset from:', filePath);
              this._spawnAsset(filePath, x, y);
              return;
            }
          }

          const data = JSON.parse(rawData);

          
          if (data.type === 'Actor' && data.uuid) {
            
            if (!game.user.isGM) {
              ui.notifications.warn("Only the GM can drop actors from the sidebar.");
              return;
            }

            const actor = await fromUuid(data.uuid);
            if (!actor) {
              ui.notifications.warn("Could not find the actor.");
              return;
            }

            
            const image = actor.img || actor.prototypeToken?.texture?.src || 'icons/svg/mystery-man.svg';

            
            this._spawnActorToken(actor, image, x, y);
            return;
          }

          
          const characterId = data.characterId || (data.type === 'character' ? data.id : null);
          if (!characterId) return;

          const character = Store.characters.get(characterId);
          if (!character) return;

          
          const canSpawn = game.user.isGM || character.canUserSpawnToken(game.user.id);
          if (!canSpawn) {
            ui.notifications.warn("You don't have permission to spawn tokens for this character.");
            return;
          }

          
          const ownedActors = game.actors.filter(a => a.isOwner && a.type === 'Player');

          if (ownedActors.length === 0) {
            ui.notifications.warn("You don't own any actors.");
            return;
          }

          let selectedActor;
          if (ownedActors.length === 1) {
            selectedActor = ownedActors[0];
          } else {
            
            selectedActor = await this._showActorSelectionDialog(ownedActors);
            if (!selectedActor) return; 
          }

          
          this._spawnToken(data.characterId, character.image, selectedActor, x, y);
        } catch (err) {
          console.error('Tom | Error handling drop:', err);
        }
      });
    }

    
    this._setupArenaTokenDragging();

    
    this._setupArenaAssetInteraction();
  }

  
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

  
  _spawnActorToken(actor, image, x, y) {
    const tokenId = foundry.utils.randomID();

    import('../data/TomSocketHandler.mjs').then(({ TomSocketHandler }) => {
      TomSocketHandler.emitArenaTokenSpawn({
        tokenId,
        characterId: null, 
        actorId: actor.id,
        actorName: actor.name,
        actorType: actor.type, 
        image,
        x,
        y,
        ownerId: actor.id 
      });
    });
  }

  
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

  
  _setupArenaAssetInteraction() {
    if (!game.user.isGM) return;

    const assets = this.element.querySelectorAll('.tom-arena-asset:not([data-asset-initialized])');
    const playerView = this.element.querySelector('.tom-player-view');

    assets.forEach(asset => {
      const assetId = asset.dataset.assetId;
      asset.dataset.assetInitialized = 'true';

      
      const dragState = { isDragging: false };

      asset.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        dragState.isDragging = true;
        asset.classList.add('dragging');

        
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

      
      asset.addEventListener('wheel', (e) => {
        e.preventDefault();

        const assetData = this.uiState.arenaAssets.get(assetId);
        if (!assetData) return;

        
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newScale = Math.max(0.2, Math.min(5, (assetData.scale || 1) + delta));

        
        assetData.scale = newScale;
        asset.style.transform = `translate(-50%, -50%) scale(${newScale})`;

        
        import('../data/TomSocketHandler.mjs').then(({ TomSocketHandler }) => {
          TomSocketHandler.emitArenaAssetResize({ assetId, scale: newScale });
        });
      });

      
      asset.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        import('../data/TomSocketHandler.mjs').then(({ TomSocketHandler }) => {
          TomSocketHandler.emitArenaAssetRemove({ assetId });
        });
      });
    });
  }

  
  _setupArenaTokenDragging() {
    const tokens = this.element.querySelectorAll('.tom-arena-token:not([data-drag-initialized])');
    const playerView = this.element.querySelector('.tom-player-view');

    tokens.forEach(token => {
      const tokenId = token.dataset.tokenId;
      const ownerId = token.dataset.ownerId;

      
      token.dataset.dragInitialized = 'true';

      
      const isUserOwner = game.user.id === ownerId;
      
      const actor = game.actors.get(ownerId);
      const isActorOwner = actor ? actor.isOwner : false;
      const isGM = game.user.isGM;
      const canDrag = isUserOwner || isActorOwner || isGM;
      const canRemove = isUserOwner || isActorOwner || isGM;

      
      if (canRemove) {
        token.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          import('../data/TomSocketHandler.mjs').then(({ TomSocketHandler }) => {
            TomSocketHandler.emitArenaTokenRemove({ tokenId });
          });
        });
      }

      
      if (!canDrag) return;

      token.classList.add('draggable');

      
      const dragState = { isDragging: false };

      const onMouseDown = (e) => {
        if (e.button !== 0) return; 

        
        if (e.target.closest('.tom-arena-token-hp, .tom-arena-token-ac, .tom-arena-conditions-btn')) {
          return;
        }

        dragState.isDragging = true;
        token.classList.add('dragging');

        
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

        
        const clampedX = Math.max(5, Math.min(95, x));
        const clampedY = Math.max(5, Math.min(95, y));

        
        token.style.left = `${clampedX}%`;
        token.style.top = `${clampedY}%`;

        
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

        
        const clampedX = Math.max(5, Math.min(95, x));
        const clampedY = Math.max(5, Math.min(95, y));

        
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

  
  _setupArenaRuler() {
    const playerView = this.element.querySelector('.tom-player-view');
    if (!playerView) return;

    
    if (playerView.dataset.rulerInitialized) return;
    playerView.dataset.rulerInitialized = 'true';

    const rulerState = this.uiState.ruler;
    const DRAG_THRESHOLD = 15; 

    
    
    const arenaRings = playerView.querySelector('.tom-arena-rings');

    
    let rulerContainer = playerView.querySelector('.tom-arena-ruler:not(.tom-arena-ruler-remote)');
    if (!rulerContainer) {
      rulerContainer = document.createElement('div');
      rulerContainer.className = 'tom-arena-ruler';
      rulerContainer.innerHTML = `
        <div class="ruler-line-container">
          <div class="ruler-line-bg"></div>
          <div class="ruler-line"></div>
        </div>
        <div class="ruler-label"></div>
      `;
      rulerContainer.style.display = 'none';
      playerView.appendChild(rulerContainer);
    }

    const rulerLineContainer = rulerContainer.querySelector('.ruler-line-container');
    const rulerLabel = rulerContainer.querySelector('.ruler-label');

    
    let rightMouseDown = false;
    let hasDragged = false;
    let startTarget = null;
    
    let startPx = { x: 0, y: 0 };
    let endPx = { x: 0, y: 0 };

    
    let socketHandler = null;
    import('../data/TomSocketHandler.mjs').then(module => {
      socketHandler = module.TomSocketHandler;
    });

    
    const VIEWBOX_MIN_X = 0;
    const VIEWBOX_MIN_Y = -50;
    const VIEWBOX_WIDTH = 1000;
    const VIEWBOX_HEIGHT = 700;
    const VIEWBOX_ASPECT = VIEWBOX_WIDTH / VIEWBOX_HEIGHT;

    
    const getSvgContentBounds = () => {
      const arenaEl = playerView.querySelector('.tom-arena-rings');
      if (!arenaEl) return null;

      const svg = arenaEl.querySelector('svg');
      if (!svg) return null;

      const containerRect = arenaEl.getBoundingClientRect();
      const containerAspect = containerRect.width / containerRect.height;

      let contentWidth, contentHeight, offsetX, offsetY;

      if (containerAspect > VIEWBOX_ASPECT) {
        
        contentHeight = containerRect.height;
        contentWidth = contentHeight * VIEWBOX_ASPECT;
        offsetX = (containerRect.width - contentWidth) / 2;
        offsetY = 0;
      } else {
        
        contentWidth = containerRect.width;
        contentHeight = contentWidth / VIEWBOX_ASPECT;
        offsetX = 0;
        offsetY = (containerRect.height - contentHeight) / 2;
      }

      return {
        left: containerRect.left + offsetX,
        top: containerRect.top + offsetY,
        width: contentWidth,
        height: contentHeight,
        scale: contentWidth / VIEWBOX_WIDTH 
      };
    };

    
    const screenToViewBox = (screenX, screenY) => {
      const bounds = getSvgContentBounds();
      if (!bounds) {
        
        const rect = playerView.getBoundingClientRect();
        return {
          x: ((screenX - rect.left) / rect.width) * VIEWBOX_WIDTH,
          y: ((screenY - rect.top) / rect.height) * VIEWBOX_HEIGHT + VIEWBOX_MIN_Y
        };
      }

      return {
        x: ((screenX - bounds.left) / bounds.width) * VIEWBOX_WIDTH + VIEWBOX_MIN_X,
        y: ((screenY - bounds.top) / bounds.height) * VIEWBOX_HEIGHT + VIEWBOX_MIN_Y
      };
    };

    
    const viewBoxToScreen = (viewBoxX, viewBoxY) => {
      const bounds = getSvgContentBounds();
      const viewRect = playerView.getBoundingClientRect();

      if (!bounds) {
        
        return {
          x: (viewBoxX / VIEWBOX_WIDTH) * viewRect.width,
          y: ((viewBoxY - VIEWBOX_MIN_Y) / VIEWBOX_HEIGHT) * viewRect.height
        };
      }

      
      const screenX = ((viewBoxX - VIEWBOX_MIN_X) / VIEWBOX_WIDTH) * bounds.width + bounds.left;
      const screenY = ((viewBoxY - VIEWBOX_MIN_Y) / VIEWBOX_HEIGHT) * bounds.height + bounds.top;

      return {
        x: screenX - viewRect.left,
        y: screenY - viewRect.top
      };
    };

    
    const onMouseDown = (e) => {
      if (e.button !== 2) return; 

      rightMouseDown = true;
      hasDragged = false;
      startTarget = e.target;

      const viewRect = playerView.getBoundingClientRect();

      
      startPx.x = e.clientX - viewRect.left;
      startPx.y = e.clientY - viewRect.top;
      endPx.x = startPx.x;
      endPx.y = startPx.y;

      
      const startVB = screenToViewBox(e.clientX, e.clientY);
      rulerState.startX = startVB.x;
      rulerState.startY = startVB.y;
      rulerState.endX = startVB.x;
      rulerState.endY = startVB.y;
    };

    
    const onMouseMove = (e) => {
      if (!rightMouseDown) return;

      const viewRect = playerView.getBoundingClientRect();

      
      endPx.x = e.clientX - viewRect.left;
      endPx.y = e.clientY - viewRect.top;

      
      const endVB = screenToViewBox(e.clientX, e.clientY);
      rulerState.endX = endVB.x;
      rulerState.endY = endVB.y;

      
      const dx = endPx.x - startPx.x;
      const dy = endPx.y - startPx.y;
      const distPx = Math.sqrt(dx * dx + dy * dy);

      
      if (distPx >= DRAG_THRESHOLD) {
        hasDragged = true;
        rulerState.active = true;
        rulerContainer.style.display = 'block';
        const { distance, isGreen } = this._updateRuler(rulerLineContainer, rulerLabel, startPx, endPx);

        
        if (socketHandler) {
          socketHandler.emitArenaRulerUpdate({
            startX: rulerState.startX,
            startY: rulerState.startY,
            endX: rulerState.endX,
            endY: rulerState.endY,
            distance,
            isGreen
          });
        }
      }
    };

    
    const onMouseUp = (e) => {
      if (e.button !== 2) return;
      if (!rightMouseDown) return;

      rightMouseDown = false;

      if (hasDragged) {
        
        rulerState.active = false;
        rulerContainer.style.display = 'none';

        
        if (socketHandler) {
          socketHandler.emitArenaRulerHide();
        }
      }
      

      startTarget = null;
    };

    
    const onContextMenu = (e) => {
      if (hasDragged) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        hasDragged = false;
        return false;
      }
      
      hasDragged = false;
    };

    
    const onLeftClick = (e) => {
      if (rulerState.active) {
        rulerState.active = false;
        rulerContainer.style.display = 'none';

        
        if (socketHandler) {
          socketHandler.emitArenaRulerHide();
        }
      }
    };

    playerView.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    playerView.addEventListener('contextmenu', onContextMenu, true);
    playerView.addEventListener('click', onLeftClick);
  }

  
  _updateRuler(lineContainer, label, startPx, endPx) {
    
    const dx = endPx.x - startPx.x;
    const dy = endPx.y - startPx.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    
    lineContainer.style.left = `${startPx.x}px`;
    lineContainer.style.top = `${startPx.y}px`;
    lineContainer.style.width = `${length}px`;
    lineContainer.style.transform = `rotate(${angle}deg)`;

    
    const playerView = this.element?.querySelector('.tom-player-view');
    const viewRect = playerView?.getBoundingClientRect() || { width: 1000, height: 700 };
    const diagonal = Math.sqrt(viewRect.width * viewRect.width + viewRect.height * viewRect.height);
    const distPercent = (length / diagonal) * 100;
    const distance = Math.round(distPercent);

    
    const isGreen = distance <= 30;

    
    const midX = (startPx.x + endPx.x) / 2;
    const midY = (startPx.y + endPx.y) / 2;
    const userName = game.user.name;
    label.textContent = `${userName}: ${distance}`;
    label.style.left = `${midX}px`;
    label.style.top = `${midY}px`;
    label.dataset.color = isGreen ? 'green' : 'red';

    return { distance, isGreen };
  }

  async _prepareContext(options) {
    const scene = this.uiState.sceneId ? Store.scenes.get(this.uiState.sceneId) : null;

    
    let castSource;
    if (this.uiState.castOnlyMode && this.uiState.castOnlyCharacterIds) {
      
      castSource = this.uiState.castOnlyCharacterIds.map(id => {
        const char = Store.characters.get(id);
        return char ? { id: char.id, name: char.name, image: char.image } : null;
      }).filter(c => c !== null);
    } else {
      castSource = scene ? scene.cast : [];
    }

    
    const cast = castSource.map(charRef => {
      const realChar = Store.characters.get(charRef.id);
      if (realChar) {
        return {
          id: realChar.id,
          name: realChar.name,
          image: realChar.image, 
          borderStyle: realChar.borderStyle || 'gold',
          locked: realChar.locked || false
        };
      }
      return { ...charRef, borderStyle: 'gold', locked: false }; 
    });

    
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

    
    let borderPickerContext = null;
    if (this.uiState.borderPicker.open && this.uiState.borderPicker.characterId) {
      const char = Store.characters.get(this.uiState.borderPicker.characterId);
      if (char) {
        const currentBorder = char.borderStyle || 'gold';
        const presets = CONFIG.BORDER_PRESETS;

        
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

    
    
    let background = scene?.background;
    let bgType = scene?.bgType;

    if (this.uiState.sequenceBackground) {
      background = this.uiState.sequenceBackground.path;
      bgType = this.uiState.sequenceBackground.bgType;
    }

    
    
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
      
      castOnlyMode: this.uiState.castOnlyMode,
      
      isArena: scene?.isArena || false,
      
      arenaTokens: Array.from(this.uiState.arenaTokens.values()).map(token => {
        const typeLower = token.actorType?.toLowerCase() || '';
        const isNPC = token.actorType && typeLower !== 'player' && typeLower !== 'character';

        
        const isUserOwner = game.user.id === token.ownerId;
        const ownerActor = game.actors.get(token.ownerId);
        const isActorOwner = ownerActor ? ownerActor.isOwner : false;
        const isOwner = isUserOwner || isActorOwner || game.user.isGM;

        
        let ac = '?';
        let hpValue = 0;
        let hpMax = 0;
        if (isOwner) {
          const actor = game.actors.get(token.actorId) || ownerActor;
          if (actor) {
            ac = actor.system?.attributes?.ac?.value ?? actor.system?.ac?.value ?? '?';
            
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
      
      arenaAssets: Array.from(this.uiState.arenaAssets.values()),
      
      userId: game.user.id
    };
  }

  

  
  _setFoundryUIOffsets() {
    const root = this.element;
    if (!root) return;

    
    
    let leftOffset = 10; 
    const controls = document.getElementById('controls');

    if (controls) {
      const controlsRect = controls.getBoundingClientRect();
      
      if (controlsRect.width > 0) {
        leftOffset = controlsRect.width + 15;
      }
    }

    
    let rightOffset = 0;
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.classList.contains('collapsed')) {
      const sidebarRect = sidebar.getBoundingClientRect();
      if (sidebarRect.width > 0) {
        rightOffset = sidebarRect.width + 15;
      }
    }

    
    root.style.setProperty('--foundry-left-offset', `${leftOffset}px`);
    root.style.setProperty('--foundry-right-offset', `${rightOffset}px`);
  }

  
  _ensureVideoPlays() {
    const video = this.element?.querySelector('video.tom-pv-bg-media');
    if (video) {
      
      video.muted = true;

      
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          if (error.name === 'AbortError') return; 
          console.warn('Tom | Video autoplay was blocked:', error);
          
          const playOnClick = () => {
            video.play();
            document.removeEventListener('click', playOnClick);
          };
          document.addEventListener('click', playOnClick, { once: true });
        });
      }
    }
  }

  

  static _onCharacterClick(event, target) {
    const charId = target.dataset.id;
    const character = Store.characters.get(charId);

    
    if (character?.locked && !game.user.isGM) {
      ui.notifications.warn(`${character.name} is locked. Only the GM can change emotions.`);
      return;
    }

    
    if (!game.user.isGM && character) {
      const hasPermission = character.hasPermission(game.user.id, 'emotion');
      if (!hasPermission) {
        ui.notifications.warn(`You don't have permission to edit ${character.name}.`);
        return;
      }
    }

    const rect = target.getBoundingClientRect();

    
    
    const showBelow = rect.top < 300;

    
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

  

  static _onOpenBorderPicker(event, target) {
    
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

    
    this.element?.querySelectorAll('.tom-border-option').forEach(el => el.classList.remove('active'));
    target.classList.add('active');

    
    import('../data/TomSocketHandler.mjs').then(({ TomSocketHandler }) => {
      TomSocketHandler.emitUpdateBorder(charId, preset);
    });
  }

  

  static activate(sceneId) {
    if (!this._instance) {
      this._instance = new TomPlayerView();
    }

    
    const isNewScene = this._instance.uiState.sceneId !== sceneId;

    this._instance.uiState.previousSceneId = this._instance.uiState.sceneId;
    this._instance.uiState.active = true;
    this._instance.uiState.sceneId = sceneId;
    this._instance.uiState.isSceneTransition = isNewScene; 
    this._instance.uiState.sequenceBackground = null; 

    this._instance.render(true);
  }

  static deactivate() {
    if (this._instance && this._instance.uiState.active) {
      
      this._instance.uiState.arenaTokens.clear();
      this._instance.uiState.arenaAssets.clear();
      this._instance.uiState.arenaZOrder = 10; 

      
      const view = this._instance.element;
      if (view) {
        const playerView = view.querySelector('.tom-player-view');
        if (playerView) {
          playerView.classList.add('closing');

          
          setTimeout(() => {
            this._instance.uiState.active = false;
            this._instance.uiState.sceneId = null;
            this._instance.uiState.sequenceBackground = null; 
            this._instance.render();
          }, 600);
          return;
        }
      }

      
      this._instance.uiState.active = false;
      this._instance.uiState.sceneId = null;
      this._instance.uiState.sequenceBackground = null; 
      this._instance.render();
    }
  }

  static refresh() {
    if (this._instance && this._instance.uiState.active) {
      this._instance.render();
    }
  }

  
  static refreshCharacter(characterId) {
    if (!this._instance || !this._instance.uiState.active) return;

    const view = this._instance.element;
    if (!view) return;

    const character = Store.characters.get(characterId);
    if (!character) return;

    
    const charElement = view.querySelector(`.tom-pv-character[data-id="${characterId}"]`);
    if (charElement) {
      const img = charElement.querySelector('.tom-pv-portrait img');
      if (img) {
        
        
        const newSrc = character.image;
        if (!img.src.endsWith(newSrc) && img.getAttribute('src') !== newSrc) {
          img.src = newSrc;
        }
      }
    }
  }

  
  static refreshCast() {
    if (!this._instance || !this._instance.uiState.active) return;
    
    
    this._instance.uiState.isSceneTransition = false;
    this._instance.render();
  }

  
  static refreshCharacterBorder(characterId, borderStyle) {
    if (!this._instance || !this._instance.uiState.active) return;

    const view = this._instance.element;
    if (!view) return;

    
    const portrait = view.querySelector(`.tom-pv-character[data-id="${characterId}"] .tom-pv-portrait`);
    if (portrait) {
      portrait.dataset.border = borderStyle;
    }
  }

  static activateWithTransition(sceneId, transitionType = 'fade', transitionDuration = 500) {
    if (!this._instance) {
      this._instance = new TomPlayerView();
    }

    const isNewScene = this._instance.uiState.sceneId !== sceneId;

    
    this._instance.uiState.previousSceneId = this._instance.uiState.sceneId;
    this._instance.uiState.active = true;
    this._instance.uiState.sceneId = sceneId;

    
    this._instance.uiState.isSceneTransition = isNewScene;
    this._instance.render(true);
  }

  

  
  static activateSequence(sceneId, background, transitionType = 'dissolve', transitionDuration = 1.0) {
    if (!this._instance) {
      this._instance = new TomPlayerView();
    }

    
    this._instance.uiState.sequenceBackground = background;

    this._instance.uiState.previousSceneId = this._instance.uiState.sceneId;
    this._instance.uiState.active = true;
    this._instance.uiState.sceneId = sceneId;
    this._instance.uiState.isSceneTransition = true;

    this._instance.render(true);
  }

  
  static updateSequenceBackground(background, transitionType = 'dissolve', transitionDuration = 1.0) {
    const view = this._instance?.element;
    if (!view) return;

    
    this._instance.uiState.sequenceBackground = background;

    const bgContainer = view.querySelector('.tom-pv-background');
    if (!bgContainer) return;

    const currentMedia = bgContainer.querySelector('.tom-pv-bg-media:not(.tom-bg-outgoing)');
    const isVideo = background.bgType === 'video';

    
    const durationMs = transitionType === 'cut' ? 0 : (transitionDuration * 1000);
    const transitionClass = transitionType === 'cut' ? 'es-bg-transition-cut' : 'es-bg-transition-dissolve';

    
    const newMedia = document.createElement(isVideo ? 'video' : 'img');
    newMedia.className = 'es-pv-bg-media es-bg-incoming';
    newMedia.src = background.path;

    if (isVideo) {
      newMedia.autoplay = true;
      newMedia.loop = true;
      newMedia.muted = true;
      newMedia.playsInline = true;
      newMedia.disablePictureInPicture = true;
      
      newMedia.addEventListener('loadeddata', () => {
        newMedia.play().catch(() => { });
      }, { once: true });
    }

    
    if (transitionType === 'cut') {
      
      if (currentMedia) {
        currentMedia.remove();
      }
      bgContainer.appendChild(newMedia);
      return;
    }

    
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

  

  
  static activateCastOnly(characterIds, layoutSettings) {
    if (!this._instance) {
      this._instance = new TomPlayerView();
    }

    
    this._instance.uiState.active = true;
    this._instance.uiState.castOnlyMode = true;
    this._instance.uiState.castOnlyCharacterIds = [...characterIds];
    this._instance.uiState.castOnlyLayoutSettings = layoutSettings || CONFIG.DEFAULT_LAYOUT;
    this._instance.uiState.sceneId = null; 
    this._instance.uiState.isSceneTransition = true; 

    this._instance.render(true);
  }

  
  static deactivateCastOnly() {
    if (!this._instance || !this._instance.uiState.castOnlyMode) return;

    
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

    
    this._instance.uiState.active = false;
    this._instance.uiState.castOnlyMode = false;
    this._instance.uiState.castOnlyCharacterIds = [];
    this._instance.render();
  }

  
  static updateCastOnly(characterIds, layoutSettings) {
    if (!this._instance || !this._instance.uiState.castOnlyMode) return;

    if (characterIds) {
      this._instance.uiState.castOnlyCharacterIds = [...characterIds];
    }
    if (layoutSettings) {
      this._instance.uiState.castOnlyLayoutSettings = layoutSettings;
    }

    
    this._instance.uiState.isSceneTransition = false;
    this._instance.render();
  }

  
  static refreshCastOnlyCharacter(characterId) {
    if (!this._instance || !this._instance.uiState.castOnlyMode) return;
    this.refreshCharacter(characterId);
  }

  

  
  static spawnArenaToken(data) {
    if (!this._instance || !this._instance.uiState.active) return;

    const { tokenId, characterId, actorId, actorName, actorType, image, x, y, ownerId } = data;

    
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

    
    this._createArenaTokenElement(data);
  }

  
  static _createArenaTokenElement(data) {
    const view = this._instance?.element;
    if (!view) return;

    let tokensContainer = view.querySelector('.tom-arena-tokens');
    if (!tokensContainer) {
      
      const playerView = view.querySelector('.tom-player-view');
      if (!playerView) return;

      tokensContainer = document.createElement('div');
      tokensContainer.className = 'tom-arena-tokens';
      playerView.appendChild(tokensContainer);
    }

    const { tokenId, actorId, actorName, actorType, image, x, y, ownerId } = data;
    
    const isUserOwner = game.user.id === ownerId;
    const ownerActor = game.actors.get(ownerId);
    const isActorOwner = ownerActor ? ownerActor.isOwner : false;
    const isOwner = isUserOwner || isActorOwner || game.user.isGM;

    
    const actor = game.actors.get(actorId) || ownerActor;

    
    const actorTypeLower = actorType?.toLowerCase() || '';
    const isNPC = actorType && actorTypeLower !== 'player' && actorTypeLower !== 'character';

    
    const tokenState = this._instance?.uiState.arenaTokens.get(tokenId);
    let ac = '?';
    let hpValue = 0;
    let hpMax = 0;

    if (actor) {
      ac = actor.system?.attributes?.ac?.value ?? actor.system?.ac?.value ?? '?';
      
      if (isNPC && tokenState?.currentHp !== undefined) {
        hpValue = tokenState.currentHp;
        hpMax = tokenState.maxHp ?? actor.system?.attributes?.hp?.max ?? actor.system?.hp?.max ?? 0;
      } else {
        hpValue = actor.system?.attributes?.hp?.value ?? actor.system?.hp?.value ?? 0;
        hpMax = actor.system?.attributes?.hp?.max ?? actor.system?.hp?.max ?? 0;
      }
    }

    
    if (tokenState && tokenState.currentHp === undefined) {
      tokenState.currentHp = hpValue;
      tokenState.maxHp = hpMax;
    }

    
    let acBadge = '';
    let hpBadge = '';
    if (isOwner) {
      acBadge = `<div class="tom-arena-token-ac">${ac}</div>`;
      hpBadge = `<div class="tom-arena-token-hp" data-clickable="true">${hpValue}/${hpMax}</div>`;
    }

    
    const conditions = tokenState?.conditions || [];
    const conditionsHtml = conditions.map(c => {
      const condDef = this.ARENA_CONDITIONS.find(def => def.id === c);
      if (!condDef) return '';
      return `<div class="tom-arena-condition" data-condition="${c}" title="${condDef.name}">
        ${condDef.icon.startsWith('fa') ? `<i class="${condDef.icon}"></i>` : `<img src="${condDef.icon}">`}
      </div>`;
    }).join('');

    
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

    
    this._instance._setupArenaTokenDragging();
  }

  
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

  
  static _showConditionsPicker(tokenId, actorName, activeConditions, tokenEl) {
    
    document.querySelector('.tom-conditions-picker')?.remove();

    const picker = document.createElement('div');
    picker.className = 'tom-conditions-picker';

    
    const header = document.createElement('div');
    header.className = 'tom-conditions-header';
    header.innerHTML = `<span><i class="fas fa-heart-crack"></i> ${actorName}</span>
      <button class="tom-conditions-close"><i class="fas fa-times"></i></button>`;
    picker.appendChild(header);

    
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
        
        const currentlyActive = item.classList.contains('active');

        let newConditions;
        if (currentlyActive) {
          
          newConditions = activeConditions.filter(c => c !== cond.id);
          const idx = activeConditions.indexOf(cond.id);
          if (idx > -1) activeConditions.splice(idx, 1);
        } else {
          
          newConditions = [...activeConditions, cond.id];
          activeConditions.push(cond.id);
        }

        
        item.classList.toggle('active');

        
        const { TomSocketHandler } = await import('../data/TomSocketHandler.mjs');
        TomSocketHandler.emitArenaTokenConditionsUpdate({ tokenId, conditions: newConditions });
      });

      grid.appendChild(item);
    }

    picker.appendChild(grid);

    
    const tokenRect = tokenEl.getBoundingClientRect();
    picker.style.position = 'fixed';
    picker.style.left = `${tokenRect.right + 10}px`;
    picker.style.top = `${tokenRect.top}px`;

    
    document.body.appendChild(picker);
    const pickerRect = picker.getBoundingClientRect();
    if (pickerRect.right > window.innerWidth) {
      picker.style.left = `${tokenRect.left - pickerRect.width - 10}px`;
    }
    if (pickerRect.bottom > window.innerHeight) {
      picker.style.top = `${window.innerHeight - pickerRect.height - 10}px`;
    }

    
    header.querySelector('.tom-conditions-close').addEventListener('click', () => picker.remove());

    
    const closeHandler = (e) => {
      if (!picker.contains(e.target) && !e.target.closest('.tom-arena-conditions-btn')) {
        picker.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 10);
  }

  
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

            
            const { TomSocketHandler } = await import('../data/TomSocketHandler.mjs');

            if (isNPC) {
              
              TomSocketHandler.emitArenaTokenHpUpdate({ tokenId, hp: clampedHp, maxHp });
            } else {
              
              const actor = game.actors.get(actorId);
              if (actor) {
                await actor.update({ 'system.attributes.hp.value': clampedHp });
                
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

  
  static moveArenaToken(tokenId, x, y) {
    if (!this._instance) return;

    
    const token = this._instance.uiState.arenaTokens.get(tokenId);
    if (token) {
      token.x = x;
      token.y = y;
    }

    
    const view = this._instance.element;
    if (!view) return;

    const tokenEl = view.querySelector(`.tom-arena-token[data-token-id="${tokenId}"]`);
    if (tokenEl) {
      tokenEl.style.left = `${x}%`;
      tokenEl.style.top = `${y}%`;
    }
  }

  
  static removeArenaToken(tokenId) {
    if (!this._instance) return;

    
    this._instance.uiState.arenaTokens.delete(tokenId);

    
    const view = this._instance.element;
    if (!view) return;

    const tokenEl = view.querySelector(`.tom-arena-token[data-token-id="${tokenId}"]`);
    if (tokenEl) {
      tokenEl.classList.add('removing');
      setTimeout(() => tokenEl.remove(), 300);
    }
  }

  
  static updateArenaTokenHp(tokenId, hp, maxHp) {
    if (!this._instance) return;

    
    const token = this._instance.uiState.arenaTokens.get(tokenId);
    if (token) {
      token.currentHp = hp;
      token.maxHp = maxHp;
    }

    
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

  
  static updateArenaTokenConditions(tokenId, conditions) {
    if (!this._instance) return;

    
    const token = this._instance.uiState.arenaTokens.get(tokenId);
    if (token) {
      token.conditions = conditions;
    }

    
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

  
  static clearArenaTokens() {
    if (!this._instance) return;
    this._instance.uiState.arenaTokens.clear();
  }

  

  
  static spawnArenaAsset(data) {
    if (!this._instance || !this._instance.uiState.active) return;

    const { assetId, image, x, y, scale } = data;

    
    this._instance.uiState.arenaAssets.set(assetId, {
      assetId,
      image,
      x,
      y,
      scale: scale || 1
    });

    
    this._createArenaAssetElement(data);
  }

  
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

    
    this._instance._setupArenaAssetInteraction();
  }

  
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

  
  static clearArenaAssets() {
    if (!this._instance) return;
    this._instance.uiState.arenaAssets.clear();
  }

  
  static showRemoteRuler(data) {
    if (!this._instance) return;
    const { userId, userName, startX, startY, endX, endY, distance, isGreen } = data;

    const playerView = this._instance.element?.querySelector('.tom-player-view');
    if (!playerView) return;

    
    const VIEWBOX_MIN_X = 0;
    const VIEWBOX_MIN_Y = -50;
    const VIEWBOX_WIDTH = 1000;
    const VIEWBOX_HEIGHT = 700;
    const VIEWBOX_ASPECT = VIEWBOX_WIDTH / VIEWBOX_HEIGHT;

    
    const arenaEl = playerView.querySelector('.tom-arena-rings');
    const svg = arenaEl?.querySelector('svg');
    const viewRect = playerView.getBoundingClientRect();

    let bounds = null;
    if (arenaEl && svg) {
      const containerRect = arenaEl.getBoundingClientRect();
      const containerAspect = containerRect.width / containerRect.height;

      let contentWidth, contentHeight, offsetX, offsetY;

      if (containerAspect > VIEWBOX_ASPECT) {
        contentHeight = containerRect.height;
        contentWidth = contentHeight * VIEWBOX_ASPECT;
        offsetX = (containerRect.width - contentWidth) / 2;
        offsetY = 0;
      } else {
        contentWidth = containerRect.width;
        contentHeight = contentWidth / VIEWBOX_ASPECT;
        offsetX = 0;
        offsetY = (containerRect.height - contentHeight) / 2;
      }

      bounds = {
        left: containerRect.left + offsetX,
        top: containerRect.top + offsetY,
        width: contentWidth,
        height: contentHeight
      };
    }

    
    
    let startPx, endPx;
    if (bounds) {
      const screenStartX = ((startX - VIEWBOX_MIN_X) / VIEWBOX_WIDTH) * bounds.width + bounds.left;
      const screenStartY = ((startY - VIEWBOX_MIN_Y) / VIEWBOX_HEIGHT) * bounds.height + bounds.top;
      const screenEndX = ((endX - VIEWBOX_MIN_X) / VIEWBOX_WIDTH) * bounds.width + bounds.left;
      const screenEndY = ((endY - VIEWBOX_MIN_Y) / VIEWBOX_HEIGHT) * bounds.height + bounds.top;

      startPx = { x: screenStartX - viewRect.left, y: screenStartY - viewRect.top };
      endPx = { x: screenEndX - viewRect.left, y: screenEndY - viewRect.top };
    } else {
      
      startPx = {
        x: (startX / VIEWBOX_WIDTH) * viewRect.width,
        y: ((startY - VIEWBOX_MIN_Y) / VIEWBOX_HEIGHT) * viewRect.height
      };
      endPx = {
        x: (endX / VIEWBOX_WIDTH) * viewRect.width,
        y: ((endY - VIEWBOX_MIN_Y) / VIEWBOX_HEIGHT) * viewRect.height
      };
    }

    
    const dx = endPx.x - startPx.x;
    const dy = endPx.y - startPx.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    
    let rulerContainer = playerView.querySelector(`.tom-arena-ruler-remote[data-user-id="${userId}"]`);
    if (!rulerContainer) {
      rulerContainer = document.createElement('div');
      rulerContainer.className = 'tom-arena-ruler tom-arena-ruler-remote';
      rulerContainer.dataset.userId = userId;
      rulerContainer.innerHTML = `
        <div class="ruler-line-container">
          <div class="ruler-line-bg"></div>
          <div class="ruler-line"></div>
        </div>
        <div class="ruler-label"></div>
      `;
      playerView.appendChild(rulerContainer);
    }

    
    const lineContainer = rulerContainer.querySelector('.ruler-line-container');
    const label = rulerContainer.querySelector('.ruler-label');

    lineContainer.style.left = `${startPx.x}px`;
    lineContainer.style.top = `${startPx.y}px`;
    lineContainer.style.width = `${length}px`;
    lineContainer.style.transform = `rotate(${angle}deg)`;

    
    const midX = (startPx.x + endPx.x) / 2;
    const midY = (startPx.y + endPx.y) / 2;
    label.textContent = `${userName}: ${distance}`;
    label.style.left = `${midX}px`;
    label.style.top = `${midY}px`;
    label.dataset.color = isGreen ? 'green' : 'red';

    rulerContainer.style.display = 'block';
  }

  
  static hideRemoteRuler(userId) {
    if (!this._instance) return;
    const playerView = this._instance.element?.querySelector('.tom-player-view');
    if (!playerView) return;

    const rulerContainer = playerView.querySelector(`.tom-arena-ruler-remote[data-user-id="${userId}"]`);
    if (rulerContainer) {
      rulerContainer.style.display = 'none';
    }
  }

  
  static clearRemoteRulers() {
    if (!this._instance) return;
    const playerView = this._instance.element?.querySelector('.tom-player-view');
    if (!playerView) return;

    const rulers = playerView.querySelectorAll('.tom-arena-ruler-remote');
    rulers.forEach(r => r.remove());
  }
}
