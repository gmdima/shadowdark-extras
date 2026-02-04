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
                arenaType: 'isometric',
                inAnimation: 'fade',
                outAnimation: 'fade'
            },
            activeTab: 'general'
        };

        // Ensure animation properties have defaults (for scenes saved before this feature)
        if (!this.uiState.data.inAnimation) {
            this.uiState.data.inAnimation = 'fade';
        }
        if (!this.uiState.data.outAnimation) {
            this.uiState.data.outAnimation = 'fade';
        }

        // Debug: log what animations are loaded
        console.log(`SDX Scene Editor | Loading scene animations: in=${this.uiState.data.inAnimation}, out=${this.uiState.data.outAnimation}`);

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
            width: 500,
            height: 'auto'
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

        const animationOptions = [
            { value: 'fade', label: 'Fade' },
            { value: 'slide-left', label: 'Slide Left' },
            { value: 'slide-right', label: 'Slide Right' },
            { value: 'slide-top', label: 'Slide Top' },
            { value: 'slide-bottom', label: 'Slide Bottom' },
            { value: 'zoom-in', label: 'Zoom In' },
            { value: 'zoom-out', label: 'Zoom Out' },
            { value: 'rotate', label: 'Rotate' },
            { value: 'blur', label: 'Blur' },
            { value: 'none', label: 'None (Instant)' }
        ];

        return {
            scene: this.uiState.data,
            activeTab: this.uiState.activeTab,
            isImage: this.uiState.data.bgType === 'image',
            isVideo: this.uiState.data.bgType === 'video',
            isCreateMode: this.isCreateMode,
            arenaTypeOptions,
            selectedArenaType: this.uiState.data.arenaType,
            animationOptions,
            selectedInAnimation: this.uiState.data.inAnimation || 'fade',
            selectedOutAnimation: this.uiState.data.outAnimation || 'fade'
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

        this.element.querySelector('select[name="inAnimation"]')?.addEventListener('change', (e) => {
            this.uiState.data.inAnimation = e.target.value;
        });

        this.element.querySelector('select[name="outAnimation"]')?.addEventListener('change', (e) => {
            this.uiState.data.outAnimation = e.target.value;
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
            // Debug: log what we're about to save
            console.log(`SDX Scene Editor | Saving scene with animations: in=${this.uiState.data.inAnimation}, out=${this.uiState.data.outAnimation}`);

            if (this.isCreateMode) {
                const { name, background, bgType, layoutSettings, isArena, arenaType, inAnimation, outAnimation } = this.uiState.data;
                const newScene = Store.createScene({ name, background, bgType, layoutSettings, isArena, arenaType, inAnimation, outAnimation });
                document.querySelector(".tom-scene-switcher-panel")?.remove();
                this.close();
                ui.notifications.info(`Created Scene: ${newScene.name}`);
            } else {
                Object.assign(this.scene, this.uiState.data);
                console.log(`SDX Scene Editor | After assign, scene has: in=${this.scene.inAnimation}, out=${this.scene.outAnimation}`);
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


