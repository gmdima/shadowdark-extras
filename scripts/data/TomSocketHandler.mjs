import { TOM_CONFIG as CONFIG } from '../TomConfig.mjs';
import { TomPlayerView } from '../apps/TomPlayerView.mjs';
import { TomStore as Store } from './TomStore.mjs';

export class TomSocketHandler {
  static initialize() {
    game.socket.on(CONFIG.SOCKET_NAME, this._handleSocketMessage.bind(this));
    console.warn(`${CONFIG.MODULE_NAME} | Socket Handler Initialized | Socket Name: ${CONFIG.SOCKET_NAME}`);
  }

  static _handleSocketMessage(payload) {

    if (payload.__$socketOptions) return;

    switch (payload.type) {
      case 'broadcast-scene':
        this._onBroadcastScene(payload.data);
        break;
      case 'stop-broadcast':
        this._onStopBroadcast(payload.data);
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
      case 'arena-ruler-update':
        this._onArenaRulerUpdate(payload.data);
        break;
      case 'arena-ruler-hide':
        this._onArenaRulerHide(payload.data);
        break;
    }
  }


  static async _onBroadcastScene(data) {
    const { sceneId, inAnimation, outAnimation } = data;

    // If there's an active scene, play its out animation first
    if (Store.activeSceneId && Store.activeSceneId !== sceneId && outAnimation && outAnimation !== 'none') {
      await TomPlayerView.playOutAnimation(outAnimation);
    }

    Store.setActiveScene(sceneId);
    TomPlayerView.activate(sceneId, inAnimation || 'fade');
    game.user.isGM && this._updateTraySceneSwitcher(sceneId);
    game.user.isGM && this._showSceneNavBar(sceneId);
  }

  static async _onStopBroadcast(data = {}) {
    const { outAnimation } = data;
    await TomPlayerView.deactivate(outAnimation || 'fade');
    Store.clearActiveScene();
    this._removeOverlayElement();
    Store.currentOverlay = null;
    game.user.isGM && this._hideTraySceneSwitcher();
    game.user.isGM && this._hideSceneNavBar();
  }


  static _updateTraySceneSwitcher(sceneId) {
    import('../TrayApp.mjs').then(({ TrayApp }) => {
      const trayApp = TrayApp._instance;
      if (!trayApp) return;
      // Just render, the state is already in TomStore which the tray reads
      trayApp.render();
    });
  }


  static _hideTraySceneSwitcher() {
    import('../TrayApp.mjs').then(({ TrayApp }) => {
      const trayApp = TrayApp._instance;
      if (!trayApp) return;
      trayApp.render();
    });
  }

  static _showSceneNavBar(sceneId) {
    import('../SceneNavBar.mjs').then(({ SceneNavBar }) => {
      SceneNavBar.show(sceneId);
    });
  }

  static _hideSceneNavBar() {
    import('../SceneNavBar.mjs').then(({ SceneNavBar }) => {
      SceneNavBar.hide();
    });
  }

  static emitBroadcastScene(sceneId, inAnimation = 'fade', outAnimation = null) {
    // If switching scenes, get the current scene's out animation
    if (outAnimation === null && Store.activeSceneId && Store.activeSceneId !== sceneId) {
      const currentScene = Store.scenes.get(Store.activeSceneId);
      outAnimation = currentScene?.outAnimation || 'fade';
    }

    console.warn(`${CONFIG.MODULE_NAME} | Socket Message Emitted: broadcast-scene`, { sceneId, inAnimation, outAnimation });
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'broadcast-scene',
      data: { sceneId, inAnimation, outAnimation }
    });

    this._onBroadcastScene({ sceneId, inAnimation, outAnimation });
  }

  static emitStopBroadcast(outAnimation = 'fade') {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'stop-broadcast',
      data: { outAnimation }
    });
    this._onStopBroadcast({ outAnimation });
  }

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

  }

  static emitArenaAssetResize(data) {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'arena-asset-resize',
      data
    });

  }

  static emitArenaAssetRemove(data) {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'arena-asset-remove',
      data
    });
    this._onArenaAssetRemove(data);
  }

  static _onSceneFadeTransition(data) {
    const { sceneId } = data;


    const overlay = document.createElement("div");
    overlay.className = "tom-scene-fade-overlay";
    document.body.appendChild(overlay);


    requestAnimationFrame(() => {
      overlay.classList.add("active");
    });


    setTimeout(() => {

      this._removeOverlayElement();
      Store.currentOverlay = null;


      Store.setActiveScene(sceneId);
      TomPlayerView.activate(sceneId);


      if (game.user.isGM) {
        this._updateTraySceneSwitcher(sceneId);
        this._showSceneNavBar(sceneId);
      }


      setTimeout(() => {
        overlay.classList.remove("active");


        setTimeout(() => {
          overlay.remove();
        }, 400);
      }, 100);
    }, 400);
  }


  static emitSceneFadeTransition(sceneId) {
    if (!game.user.isGM) return;

    console.warn(`${CONFIG.MODULE_NAME} | Socket Message Emitted: scene-fade-transition`, { sceneId });
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'scene-fade-transition',
      data: { sceneId }
    });

    this._onSceneFadeTransition({ sceneId });
  }


  static _onOverlaySet(data) {
    const { overlayPath } = data;


    this._removeOverlayElement();


    const playerView = document.querySelector(".tom-player-view");
    if (!playerView) return;


    const extension = overlayPath.split('.').pop().toLowerCase();
    const mimeType = extension === 'mp4' ? 'video/mp4' : 'video/webm';
    const isMp4 = extension === 'mp4';



    const overlay = document.createElement("div");
    overlay.className = `tom-video-overlay ${isMp4 ? 'blend-mode' : ''}`;
    overlay.innerHTML = `
      <video loop autoplay muted playsinline disablepictureinpicture>
        <source src="${overlayPath}" type="${mimeType}">
      </video>
    `;


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


    Store.currentOverlay = overlayPath;
  }


  static _onOverlayClear() {
    this._removeOverlayElement();
    Store.currentOverlay = null;
  }


  static _removeOverlayElement() {
    const existing = document.querySelector(".tom-video-overlay");
    if (existing) existing.remove();
  }


  static emitOverlaySet(overlayPath) {
    if (!game.user.isGM) return;

    console.warn(`${CONFIG.MODULE_NAME} | Socket Message Emitted: overlay-set`, { overlayPath });
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'overlay-set',
      data: { overlayPath }
    });

    this._onOverlaySet({ overlayPath });
  }


  static emitOverlayClear() {
    if (!game.user.isGM) return;

    console.warn(`${CONFIG.MODULE_NAME} | Socket Message Emitted: overlay-clear`);
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'overlay-clear',
      data: {}
    });

    this._onOverlayClear();
  }

  static _onArenaRulerUpdate(data) {
    const { userId, userName, startX, startY, endX, endY, distance, isGreen } = data;

    if (userId === game.user.id) return;
    TomPlayerView.showRemoteRuler({ userId, userName, startX, startY, endX, endY, distance, isGreen });
  }


  static _onArenaRulerHide(data) {
    const { userId } = data;
    if (userId === game.user.id) return;
    TomPlayerView.hideRemoteRuler(userId);
  }


  static emitArenaRulerUpdate(data) {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'arena-ruler-update',
      data: {
        userId: game.user.id,
        userName: game.user.name,
        ...data
      }
    });

  }

  static emitArenaRulerHide() {
    game.socket.emit(CONFIG.SOCKET_NAME, {
      type: 'arena-ruler-hide',
      data: {
        userId: game.user.id
      }
    });

  }
}
