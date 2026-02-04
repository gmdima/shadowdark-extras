import { TOM_CONFIG as CONFIG } from '../TomConfig.mjs';
import { TomStore as Store } from '../data/TomStore.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TomSceneEditor extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(sceneId = null, options = {}) {
        super(options);
        this.sceneId = sceneId;
        this.scene = sceneId ? Store.scenes.get(sceneId) : null;
        this.isCreateMode = !sceneId;
        this.uiState = {
            data: this.scene ? this.scene.toJSON() : {
                name: 'New Scene',
                background: CONFIG.DEFAULTS.SCENE_BG,
                bgType: 'image',
                cast: [],
                layoutSettings: { ...CONFIG.DEFAULT_LAYOUT },
                isArena: false,
                arenaType: 'isometric'
            },
            activeTab: 'general'
        };


        if (!this.uiState.data.layoutSettings) {
            this.uiState.data.layoutSettings = { ...CONFIG.DEFAULT_LAYOUT };
        }
    }

    static DEFAULT_OPTIONS = {
        tag: 'form',
        id: 'tom-scene-editor',
        classes: ['tom-app', 'es-scene-editor'],
        window: {
            title: 'Scene Editor',
            icon: 'fas fa-edit',
            resizable: true,
            controls: []
        },
        position: {
            width: 600,
            height: 700
        },
        actions: {
            save: TomSceneEditor._onSave,
            close: TomSceneEditor._onClose,
            'tab-switch': TomSceneEditor._onTabSwitch,
            'file-picked': TomSceneEditor._onFilePicked
        }
    };

    static PARTS = {
        main: {
            template: 'modules/shadowdark-extras/templates/tom-scene-editor.hbs',
            scrollable: ['.tom-editor-content']
        }
    };

    get title() {
        return this.isCreateMode ? 'Create New Scene' : 'Edit Scene';
    }



    async _prepareContext(options) {
        const arenaTypeOptions = [
            { value: 'isometric', label: 'Isometric (Ellipse)' },
            { value: 'topdown', label: 'Top Down (Circle)' },
            { value: 'expanded', label: 'Expanded (Radial Grid)' },
            { value: 'ladder', label: 'Ladder (Linear Track)' },
            { value: 'none', label: 'No Grid (None)' }
        ];

        return {
            scene: this.uiState.data,
            activeTab: this.uiState.activeTab,
            isImage: this.uiState.data.bgType === 'image',
            isVideo: this.uiState.data.bgType === 'video',
            isCreateMode: this.isCreateMode,
            arenaTypeOptions,
            selectedArenaType: this.uiState.data.arenaType
        };
    }

    _onRender(context, options) {
        super._onRender(context, options);

        this.element.querySelector('input[name="name"]')?.addEventListener('input', (e) => {
            this.uiState.data.name = e.target.value;
        });

        this.element.querySelector('input[name="background"]')?.addEventListener('change', (e) => {
            this._updateBackground(e.target.value);
        });

        this.element.querySelector('.file-picker')?.addEventListener('click', async (e) => {
            e.preventDefault();
            const bgInput = this.element.querySelector('input[name="background"]');
            return new FilePicker({
                type: "imagevideo",
                current: this.uiState.data.background,
                callback: path => {
                    this._updateBackground(path);
                    if (bgInput) bgInput.value = path;
                    this.render();
                }
            }).render(true);
        });

        this.element.querySelector('select[name="arenaType"]')?.addEventListener('change', (e) => {
            this.uiState.data.arenaType = e.target.value;
        });

        this.element.querySelector('input[name="isArena"]')?.addEventListener('change', (e) => {
            this.uiState.data.isArena = e.target.checked;
            this.render();
        });
    }



    _updateBackground(path) {
        this.uiState.data.background = path;
        this.uiState.data.bgType = path.match(/\.(webm|mp4|m4v)$/i) ? 'video' : 'image';
    }



    static _onTabSwitch(event, target) {
        this.uiState.activeTab = target.dataset.tab;
        this.render();
    }

    static async _onSave(event, target) {
        const originalHtml = target.innerHTML;
        Object.assign(target, {
            innerHTML: '<i class="fas fa-spinner fa-spin"></i> Saving...',
            disabled: true
        });
        target.classList.add('es-btn-loading');

        try {
            if (this.isCreateMode) {
                const { name, background, bgType, layoutSettings, isArena, arenaType } = this.uiState.data;
                const newScene = Store.createScene({ name, background, bgType, layoutSettings, isArena, arenaType });
                document.querySelector(".tom-scene-switcher-panel")?.remove();
                this.close();
                ui.notifications.info(`Created Scene: ${newScene.name}`);
            } else {
                Object.assign(this.scene, this.uiState.data);
                Store.saveData();
                document.querySelector(".tom-scene-switcher-panel")?.remove();
                this.close();
                ui.notifications.info(`Saved Scene: ${this.scene.name}`);
            }
        } catch (error) {
            console.error('Tom | Error saving scene:', error);
            ui.notifications.error('Failed to save scene. Check console for details.');
            target.classList.remove('es-btn-loading');
            Object.assign(target, { innerHTML: originalHtml, disabled: false });
        }
    }

    static _onClose(event, target) {
        this.close();
    }
}


