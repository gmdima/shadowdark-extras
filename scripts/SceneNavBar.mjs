/**
 * Scene Navigation Bar
 * Displays at the top-center of the screen when broadcasting a scene
 * Shows current scene name with previous/next navigation buttons
 * Uses direct DOM manipulation like the arena grid
 */

export class SceneNavBar {
    static _container = null;

    /**
     * Show the navigation bar with a specific scene
     */
    static async show(sceneId) {
        const { TomStore } = await import("./data/TomStore.mjs");
        const scene = sceneId ? TomStore.scenes.get(sceneId) : null;

        if (!scene) {
            this.hide();
            return;
        }

        // Create container if it doesn't exist
        if (!this._container) {
            this._container = document.createElement('div');
            this._container.className = 'sdx-scene-nav-bar';
            document.body.appendChild(this._container);
        }

        // Update content
        this._container.innerHTML = `
            <button class="scene-nav-btn scene-nav-prev" data-action="prev-scene" title="Previous Scene">
                <i class="fas fa-caret-left"></i>
            </button>
            <div class="scene-nav-name">${scene.name}</div>
            <button class="scene-nav-btn scene-nav-next" data-action="next-scene" title="Next Scene">
                <i class="fas fa-caret-right"></i>
            </button>
        `;

        // Store current scene ID
        this._container.dataset.sceneId = sceneId;

        // Attach event listeners
        this._container.querySelector('[data-action="prev-scene"]')?.addEventListener('click', () => {
            this._navigateScene(-1);
        });

        this._container.querySelector('[data-action="next-scene"]')?.addEventListener('click', () => {
            this._navigateScene(1);
        });
    }

    /**
     * Hide the navigation bar
     */
    static hide() {
        if (this._container) {
            this._container.remove();
            this._container = null;
        }
    }

    /**
     * Navigate to previous or next scene
     * @param {number} direction - -1 for previous, 1 for next
     */
    static async _navigateScene(direction) {
        const { TomStore } = await import("./data/TomStore.mjs");
        const { TomSocketHandler } = await import("./data/TomSocketHandler.mjs");

        const currentSceneId = this._container?.dataset.sceneId;
        if (!currentSceneId) return;

        const scenes = Array.from(TomStore.scenes.values());
        if (scenes.length === 0) return;

        const currentIndex = scenes.findIndex(s => s.id === currentSceneId);
        if (currentIndex === -1) return;

        // Calculate next index with wrapping
        let nextIndex = currentIndex + direction;
        if (nextIndex < 0) nextIndex = scenes.length - 1;
        if (nextIndex >= scenes.length) nextIndex = 0;

        const nextScene = scenes[nextIndex];
        if (nextScene) {
            const inAnimation = nextScene.inAnimation || 'fade';
            TomSocketHandler.emitBroadcastScene(nextScene.id, inAnimation);
        }
    }
}
