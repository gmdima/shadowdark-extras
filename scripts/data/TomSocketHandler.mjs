import { TOM_CONFIG as CONFIG } from '../TomConfig.mjs';
import { TomPlayerView } from '../apps/TomPlayerView.mjs';
import { TomStore as Store } from './TomStore.mjs';

export class TomSocketHandler {
  static initialize() {
    game.socket.on(CONFIG.SOCKET_NAME, this._handleSocketMessage.bind(this));
    console.warn(`${CONFIG.MODULE_NAME} | Socket Handler Initialized | Socket Name: ${CONFIG.SOCKET_NAME}`);
  }

  static _handleSocketMessage(payload) {
    // Ignore messages from SdxRolls/SocketSD (which share this channel)
    if (payload.__$socketOptions) return;

    // Optional: Filter only known Tom message types if needed
    // if (!payload.type) return;

    console.warn(`${CONFIG.MODULE_NAME} | Socket Message Received:`, payload);

    switch (payload.type) {
      case 'broadcast-scene':
        this._onBroadcastScene(payload.data);
        break;
      case 'stop-broadcast':
        this._onStopBroadcast();
        break;
      case 'update-emotion':
        this._onUpdateEmotion(payload.data);
        break;
      case 'update-cast':
        this._onUpdateCast(payload.data);
        break;
      case 'update-border':
        this._onUpdateBorder(payload.data);
        break;
      case 'update-lock':
        this._onUpdateLock(payload.data);
        break;
      case 'slideshow-start':
        this._onSlideshowStart(payload.data);
        break;
      case 'slideshow-scene':
        this._onSlideshowScene(payload.data);
        break;
      case 'slideshow-pause':
        this._onSlideshowPause();
        break;
      case 'slideshow-resume':
        this._onSlideshowResume();
        break;
      case 'slideshow-stop':
        this._onSlideshowStop();
        break;
      case 'sequence-start':
        this._onSequenceStart(payload.data);
        break;
      case 'sequence-change':
        this._onSequenceChange(payload.data);
        break;
      case 'sequence-stop':
        this._onSequenceStop();
        break;
      case 'cast-only-start':
        this._onCastOnlyStart(payload.data);
        break;
      case 'cast-only-update':
        this._onCastOnlyUpdate(payload.data);
        break;
      case 'cast-only-stop':
        this._onCastOnlyStop();
        break;
      case 'arena-token-spawn':
        this._onArenaTokenSpawn(payload.data);
        break;
      case 'arena-token-move':
        this._onArenaTokenMove(payload.data);
        break;
      case 'arena-token-remove':
        this._onArenaTokenRemove(payload.data);
        break;
      case 'arena-token-hp-update':
        this._onArenaTokenHpUpdate(payload.data);
        break;
      case 'arena-token-conditions-update':
        this._onArenaTokenConditionsUpdate(payload.data);
        break;
      case 'arena-asset-spawn':
        this._onArenaAssetSpawn(payload.data);
        break;
      case 'arena-asset-move':
        this._onArenaAssetMove(payload.data);
        break;
      case 'arena-asset-resize':
        this._onArenaAssetResize(payload.data);
        break;
      case 'arena-asset-remove':
        this._onArenaAssetRemove(payload.data);
        break;
      case 'scene-fade-transition':
        this._onSceneFadeTransition(payload.data);
        break;
      case 'overlay-set':
        this._onOverlaySet(payload.data);
        break;
      case 'overlay-clear':
        this._onOverlayClear();
        break;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     HANDLERS
     ═══════════════════════════════════════════════════════════════ */

  static _onBroadcastScene(data) {
    const { sceneId } = data;
    Store.setActiveScene(sceneId);
    TomPlayerView.activate(sceneId);

    // Show scene switcher button in tray (GM only)
    if (game.user.isGM) {
      this._updateTraySceneSwitcher(sceneId);
    }
  }

  static _onStopBroadcast() {
    TomPlayerView.deactivate();
    Store.clearActiveScene();

    // Clear any active overlay
    this._removeOverlayElement();
    Store.currentOverlay = null;

    // Hide scene switcher button in tray (GM only)
    if (game.user.isGM) {
      this._hideTraySceneSwitcher();
    }
  }

  /**
   * Update or show the tray scene switcher, cast manager, and overlay manager
   */
  static _updateTraySceneSwitcher(sceneId) {
    // Get tray app instance via static reference
    import('../TrayApp.mjs').then(({ TrayApp }) => {
      const trayApp = TrayApp._instance;
      if (!trayApp) return;

      // Check if scene switcher button already exists
      const existingBtn = document.querySelector(".tom-scene-switcher-btn");
      if (existingBtn) {
        // Just update the active scene
        trayApp.updateTomSceneSwitcher(sceneId);
      } else {
        // Show the buttons
        trayApp.showTomSceneSwitcher(sceneId);
        trayApp.showTomCastManager();
        trayApp.showTomOverlayManager();
      }
    });
  }

  /**
   * Hide the tray scene switcher
   */
  static _hideTraySceneSwitcher() {
    import('../TrayApp.mjs').then(({ TrayApp }) => {
      const trayApp = TrayApp._instance;
      if (trayApp) {
        trayApp.hideTomSceneSwitcher();
      }
    });
  }

  static _onUpdateEmotion(data) {
    const { characterId, state, userId } = data;
    // Update the local store character instance if needed, or just refresh the view
    const character = Store.characters.get(characterId);
    if (character) {
      // Server-side (GM) permission validation for non-GM users
      if (game.user.isGM && userId && userId !== game.user.id) {
        // Check if the user has permission to edit this character
        if (!character.hasPermission(userId, 'emotion')) {
          console.warn(`${CONFIG.MODULE_NAME} | User ${userId} attempted unauthorized emotion change on ${character.name}`);
          return; // Reject the change
        }
        // Also check lock status
        if (character.locked) {
          console.warn(`${CONFIG.MODULE_NAME} | User ${userId} attempted to change locked character ${character.name}`);
          return;
        }
      }

      character.currentState = state;

      // If we are the GM, we must persist this change!
      if (game.user.isGM) {
        Store.saveData();
      }

      // Refresh only the specific character to avoid flickering other characters
      TomPlayerView.refreshCharacter(characterId);

      // Also refresh GM Panel if open
      if (game.user.isGM) {
        import('../apps/TomGMPanel.mjs').then(({ TomGMPanel }) => {
          if (TomGMPanel._instance && TomGMPanel._instance.rendered) {
            TomGMPanel._instance.render();
          }
        });
      }
    }
  }

  static _onUpdateCast(data) {
    // Refresh the cast (add/remove characters) without triggering scene transition animations
    TomPlayerView.refreshCast();

    // Re-apply overlay if one was active (refresh may have removed it)
    if (Store.currentOverlay) {
      setTimeout(() => {
        this._onOverlaySet({ overlayPath: Store.currentOverlay });
      }, 100);
    }
  }

  static _onUpdateBorder(data) {
    const { characterId, borderStyle, userId } = data;
    const character = Store.characters.get(characterId);
    if (character) {
      // Server-side (GM) permission validation for non-GM users
      // Border changes require 'full' permission level
      if (game.user.isGM && userId && userId !== game.user.id) {
        if (!character.hasPermission(userId, 'full')) {
          console.warn(`${CONFIG.MODULE_NAME} | User ${userId} attempted unauthorized border change on ${character.name}`);
          return;
        }
        if (character.locked) {
          console.warn(`${CONFIG.MODULE_NAME} | User ${userId} attempted to change locked character ${character.name}`);
          return;
        }
      }

      character.borderStyle = borderStyle;

      // If we are the GM, we must persist this change!
      if (game.user.isGM) {
        Store.saveData();
      }

      // Refresh only the specific character's border to avoid flickering
      TomPlayerView.refreshCharacterBorder(characterId, borderStyle);

      // Also refresh GM Panel if open
      if (game.user.isGM) {
        import('../apps/TomGMPanel.mjs').then(({ TomGMPanel }) => {
          if (TomGMPanel._instance && TomGMPanel._instance.rendered) {
            TomGMPanel._instance.render();
          }
        });
      }
    }
  }

  static _onUpdateLock(data) {
    const { characterId, locked } = data;
    const character = Store.characters.get(characterId);
    if (character) {
      character.locked = locked;

      // If we are the GM, we must persist this change!
      if (game.user.isGM) {
        Store.saveData();
      }

      // Refresh views
      TomPlayerView.refresh();

      // Re-apply overlay if one was active (refresh may have removed it)
      if (Store.currentOverlay) {
        setTimeout(() => {
          this._onOverlaySet({ overlayPath: Store.currentOverlay });
        }, 100);
      }

      // Also refresh GM Panel if open
      if (game.user.isGM) {
        import('../apps/TomGMPanel.mjs').then(({ TomGMPanel }) => {
          if (TomGMPanel._instance && TomGMPanel._instance.rendered) {
            TomGMPanel._instance.render();
          }
        });
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     EMITTERS
     ═══════════════════════════════════════════════════════════════ */

  static emitBroadcastScene(sceneId) {
    console.warn(`${CONFIG.MODULE_NAME} | Socket Message Emitted: broadcast-scene`, { sceneId });
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'broadcast-scene',
      data: { sceneId }
    });
    // Also trigger locally
    this._onBroadcastScene({ sceneId });
  }

  static emitStopBroadcast() {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'stop-broadcast',
      data: {}
    });
    this._onStopBroadcast();
  }

  static emitUpdateEmotion(characterId, state) {
    const userId = game.user.id;
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'update-emotion',
      data: { characterId, state, userId }
    });
    this._onUpdateEmotion({ characterId, state, userId });
  }

  static emitUpdateCast(sceneId) {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'update-cast',
      data: { sceneId }
    });
    this._onUpdateCast({ sceneId });
  }

  static emitUpdateBorder(characterId, borderStyle) {
    const userId = game.user.id;
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'update-border',
      data: { characterId, borderStyle, userId }
    });
    this._onUpdateBorder({ characterId, borderStyle, userId });
  }

  static emitUpdateLock(characterId, locked) {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'update-lock',
      data: { characterId, locked }
    });
    this._onUpdateLock({ characterId, locked });
  }

  /* ═══════════════════════════════════════════════════════════════
     SLIDESHOW HANDLERS
     ═══════════════════════════════════════════════════════════════ */

  static _onSlideshowStart(data) {
    const { slideshowId, cinematicMode, cast } = data;
    // Non-GM clients just track that a slideshow started
    // The first scene will be sent via slideshow-scene
    // Pass the fixed cast that will be used for the entire slideshow
    TomPlayerView.setSlideshowMode(true, cinematicMode, cast);
  }

  static _onSlideshowScene(data) {
    const { sceneId, index, total, transitionType, transitionDuration } = data;
    Store.setActiveScene(sceneId);
    TomPlayerView.activateWithTransition(sceneId, transitionType, transitionDuration);
  }

  static _onSlideshowPause() {
    TomPlayerView.setSlideshowPaused(true);
  }

  static _onSlideshowResume() {
    TomPlayerView.setSlideshowPaused(false);
  }

  static _onSlideshowStop() {
    TomPlayerView.setSlideshowMode(false);
    TomPlayerView.deactivate();
    Store.clearActiveScene();
  }

  /* ═══════════════════════════════════════════════════════════════
     SLIDESHOW EMITTERS
     ═══════════════════════════════════════════════════════════════ */

  static emitSlideshowStart(data) {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'slideshow-start',
      data
    });
    this._onSlideshowStart(data);
  }

  static emitSlideshowScene(data) {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'slideshow-scene',
      data
    });
    this._onSlideshowScene(data);
  }

  static emitSlideshowPause() {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'slideshow-pause',
      data: {}
    });
    this._onSlideshowPause();
  }

  static emitSlideshowResume() {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'slideshow-resume',
      data: {}
    });
    this._onSlideshowResume();
  }

  static emitSlideshowStop() {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'slideshow-stop',
      data: {}
    });
    this._onSlideshowStop();
  }

  /* ═══════════════════════════════════════════════════════════════
     SCENE SEQUENCE HANDLERS (Manual navigation by GM)
     ═══════════════════════════════════════════════════════════════ */

  static _onSequenceStart(data) {
    const { sceneId, backgroundIndex, background, cast, transitionType, transitionDuration } = data;
    Store.setActiveScene(sceneId);
    TomPlayerView.activateSequence(sceneId, background, transitionType, transitionDuration);
  }

  static _onSequenceChange(data) {
    const { sceneId, backgroundIndex, background, transitionType, transitionDuration } = data;
    TomPlayerView.updateSequenceBackground(background, transitionType, transitionDuration);

    // Refresh GM Panel to update controls
    if (game.user.isGM) {
      import('../apps/TomGMPanel.mjs').then(({ TomGMPanel }) => {
        if (TomGMPanel._instance && TomGMPanel._instance.rendered) {
          TomGMPanel._instance.render();
        }
      });
    }
  }

  static _onSequenceStop() {
    TomPlayerView.deactivate();
    Store.clearActiveScene();
  }

  /* ═══════════════════════════════════════════════════════════════
     SCENE SEQUENCE EMITTERS
     ═══════════════════════════════════════════════════════════════ */

  static emitSequenceStart(data) {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'sequence-start',
      data
    });
    this._onSequenceStart(data);
  }

  static emitSequenceChange(data) {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'sequence-change',
      data
    });
    this._onSequenceChange(data);
  }

  static emitSequenceStop() {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'sequence-stop',
      data: {}
    });
    this._onSequenceStop();
  }

  /* ═══════════════════════════════════════════════════════════════
     CAST-ONLY MODE HANDLERS
     ═══════════════════════════════════════════════════════════════ */

  static _onCastOnlyStart(data) {
    const { characterIds, layoutSettings } = data;
    // Update local store state (non-GM clients)
    if (!game.user.isGM) {
      Store.castOnlyState = {
        isActive: true,
        characterIds: [...characterIds],
        layoutSettings: { ...layoutSettings }
      };
    }
    TomPlayerView.activateCastOnly(characterIds, layoutSettings);
  }

  static _onCastOnlyUpdate(data) {
    const { characterIds, layoutSettings } = data;
    // Update local store state
    if (characterIds) {
      Store.castOnlyState.characterIds = [...characterIds];
    }
    if (layoutSettings) {
      Store.castOnlyState.layoutSettings = { ...layoutSettings };
    }
    TomPlayerView.updateCastOnly(characterIds, layoutSettings);
  }

  static _onCastOnlyStop() {
    Store.castOnlyState.isActive = false;
    Store.castOnlyState.characterIds = [];
    TomPlayerView.deactivateCastOnly();
  }

  /* ═══════════════════════════════════════════════════════════════
     CAST-ONLY MODE EMITTERS
     ═══════════════════════════════════════════════════════════════ */

  static emitCastOnlyStart(data) {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'cast-only-start',
      data
    });
    this._onCastOnlyStart(data);
  }

  static emitCastOnlyUpdate(data) {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'cast-only-update',
      data
    });
    this._onCastOnlyUpdate(data);
  }

  static emitCastOnlyStop() {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'cast-only-stop',
      data: {}
    });
    this._onCastOnlyStop();
  }

  /* ═══════════════════════════════════════════════════════════════
     ARENA TOKEN HANDLERS
     ═══════════════════════════════════════════════════════════════ */

  static _onArenaTokenSpawn(data) {
    const { tokenId, characterId, actorId, actorName, actorType, image, x, y, ownerId } = data;
    TomPlayerView.spawnArenaToken({ tokenId, characterId, actorId, actorName, actorType, image, x, y, ownerId });
  }

  static _onArenaTokenMove(data) {
    const { tokenId, x, y } = data;
    TomPlayerView.moveArenaToken(tokenId, x, y);
  }

  static _onArenaTokenRemove(data) {
    const { tokenId } = data;
    TomPlayerView.removeArenaToken(tokenId);
  }

  static _onArenaTokenHpUpdate(data) {
    const { tokenId, hp, maxHp } = data;
    TomPlayerView.updateArenaTokenHp(tokenId, hp, maxHp);
  }

  static _onArenaTokenConditionsUpdate(data) {
    const { tokenId, conditions } = data;
    TomPlayerView.updateArenaTokenConditions(tokenId, conditions);
  }

  /* ═══════════════════════════════════════════════════════════════
     ARENA TOKEN EMITTERS
     ═══════════════════════════════════════════════════════════════ */

  static emitArenaTokenSpawn(data) {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'arena-token-spawn',
      data
    });
    this._onArenaTokenSpawn(data);
  }

  static emitArenaTokenMove(data) {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'arena-token-move',
      data
    });
    // Update local state (important for persisting through re-renders)
    this._onArenaTokenMove(data);
  }

  static emitArenaTokenRemove(data) {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'arena-token-remove',
      data
    });
    this._onArenaTokenRemove(data);
  }

  static emitArenaTokenHpUpdate(data) {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'arena-token-hp-update',
      data
    });
    this._onArenaTokenHpUpdate(data);
  }

  static emitArenaTokenConditionsUpdate(data) {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'arena-token-conditions-update',
      data
    });
    this._onArenaTokenConditionsUpdate(data);
  }

  /* ═══════════════════════════════════════════════════════════════
     ARENA ASSET HANDLERS (GM-only image assets)
     ═══════════════════════════════════════════════════════════════ */

  static _onArenaAssetSpawn(data) {
    TomPlayerView.spawnArenaAsset(data);
  }

  static _onArenaAssetMove(data) {
    TomPlayerView.moveArenaAsset(data.assetId, data.x, data.y);
  }

  static _onArenaAssetResize(data) {
    TomPlayerView.resizeArenaAsset(data.assetId, data.scale);
  }

  static _onArenaAssetRemove(data) {
    TomPlayerView.removeArenaAsset(data.assetId);
  }

  /* ═══════════════════════════════════════════════════════════════
     ARENA ASSET EMITTERS
     ═══════════════════════════════════════════════════════════════ */

  static emitArenaAssetSpawn(data) {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'arena-asset-spawn',
      data
    });
    this._onArenaAssetSpawn(data);
  }

  static emitArenaAssetMove(data) {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'arena-asset-move',
      data
    });
    // Local state already updated during drag
  }

  static emitArenaAssetResize(data) {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'arena-asset-resize',
      data
    });
    // Local state already updated during resize
  }

  static emitArenaAssetRemove(data) {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'arena-asset-remove',
      data
    });
    this._onArenaAssetRemove(data);
  }

  /* ═══════════════════════════════════════════════════════════════
     SCENE FADE TRANSITION (Quick scene switch with fade effect)
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Handle scene fade transition on all clients
   * Creates a fade overlay, waits, then switches to the new scene
   */
  static _onSceneFadeTransition(data) {
    const { sceneId } = data;

    // Create fade overlay
    const overlay = document.createElement("div");
    overlay.className = "tom-scene-fade-overlay";
    document.body.appendChild(overlay);

    // Trigger fade in
    requestAnimationFrame(() => {
      overlay.classList.add("active");
    });

    // Wait for fade in to complete, then switch scene
    setTimeout(() => {
      // Clear any active video overlay when changing scenes
      this._removeOverlayElement();
      Store.currentOverlay = null;

      // Switch to the new scene
      Store.setActiveScene(sceneId);
      TomPlayerView.activate(sceneId);

      // Update tray scene switcher for GM
      if (game.user.isGM) {
        this._updateTraySceneSwitcher(sceneId);
      }

      // Wait a moment for the new scene to render, then fade out
      setTimeout(() => {
        overlay.classList.remove("active");

        // Remove overlay after fade out completes
        setTimeout(() => {
          overlay.remove();
        }, 400);
      }, 100);
    }, 400);
  }

  /**
   * Emit scene fade transition to all clients (GM only)
   * This broadcasts the fade effect and scene change to everyone
   */
  static emitSceneFadeTransition(sceneId) {
    if (!game.user.isGM) return;

    console.warn(`${CONFIG.MODULE_NAME} | Socket Message Emitted: scene-fade-transition`, { sceneId });
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'scene-fade-transition',
      data: { sceneId }
    });
    // Also trigger locally
    this._onSceneFadeTransition({ sceneId });
  }

  /* ═══════════════════════════════════════════════════════════════
     OVERLAY HANDLERS (Video overlays on broadcast)
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Handle overlay set on all clients
   * Creates a video overlay above the scene but below tokens
   */
  static _onOverlaySet(data) {
    const { overlayPath } = data;

    // Remove existing overlay if any
    this._removeOverlayElement();

    // Get the player view container
    const playerView = document.querySelector(".tom-player-view");
    if (!playerView) return;

    // Determine video type from file extension
    const extension = overlayPath.split('.').pop().toLowerCase();
    const mimeType = extension === 'mp4' ? 'video/mp4' : 'video/webm';
    const isMp4 = extension === 'mp4';

    // Create overlay container
    // Add 'blend-mode' class for mp4 files (no alpha support, need screen blend)
    const overlay = document.createElement("div");
    overlay.className = `tom-video-overlay ${isMp4 ? 'blend-mode' : ''}`;
    overlay.innerHTML = `
      <video loop autoplay muted playsinline disablepictureinpicture>
        <source src="${overlayPath}" type="${mimeType}">
      </video>
    `;

    // Insert after the overlay layer but before arena/cast elements
    const arenaRings = playerView.querySelector(".tom-arena-rings");
    const arenaAssets = playerView.querySelector(".tom-arena-assets");
    const castLayer = playerView.querySelector(".tom-pv-cast");

    if (arenaAssets) {
      playerView.insertBefore(overlay, arenaAssets);
    } else if (arenaRings) {
      playerView.insertBefore(overlay, arenaRings);
    } else if (castLayer) {
      playerView.insertBefore(overlay, castLayer);
    } else {
      playerView.appendChild(overlay);
    }

    // Store current overlay path
    Store.currentOverlay = overlayPath;
  }

  /**
   * Handle overlay clear on all clients
   */
  static _onOverlayClear() {
    this._removeOverlayElement();
    Store.currentOverlay = null;
  }

  /**
   * Remove the overlay DOM element
   */
  static _removeOverlayElement() {
    const existing = document.querySelector(".tom-video-overlay");
    if (existing) existing.remove();
  }

  /**
   * Emit overlay set to all clients (GM only)
   */
  static emitOverlaySet(overlayPath) {
    if (!game.user.isGM) return;

    console.warn(`${CONFIG.MODULE_NAME} | Socket Message Emitted: overlay-set`, { overlayPath });
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'overlay-set',
      data: { overlayPath }
    });
    // Also trigger locally
    this._onOverlaySet({ overlayPath });
  }

  /**
   * Emit overlay clear to all clients (GM only)
   */
  static emitOverlayClear() {
    if (!game.user.isGM) return;

    console.warn(`${CONFIG.MODULE_NAME} | Socket Message Emitted: overlay-clear`);
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'overlay-clear',
      data: {}
    });
    // Also trigger locally
    this._onOverlayClear();
  }
}
