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
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     HANDLERS
     ═══════════════════════════════════════════════════════════════ */

  static _onBroadcastScene(data) {
    const { sceneId } = data;
    Store.setActiveScene(sceneId);
    TomPlayerView.activate(sceneId);
  }

  static _onStopBroadcast() {
    TomPlayerView.deactivate();
    Store.clearActiveScene();
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
}
