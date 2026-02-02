import { TOM_CONFIG as CONFIG } from '../TomConfig.mjs';
import { TomStore as Store } from '../data/TomStore.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TomSceneEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(sceneId = null, options = {}) {
    super(options);
    this.sceneId = sceneId;
    this.scene = sceneId ? Store.scenes.get(sceneId) : null;
    this.isCreateMode = !sceneId;

    // Clone data for editing state to avoid direct mutation until save
    // For create mode, provide default values
    this.uiState = {
      data: this.scene ? this.scene.toJSON() : {
        name: 'New Scene',
        background: CONFIG.DEFAULTS.SCENE_BG,
        bgType: 'image',
        cast: [],
        layoutSettings: { ...CONFIG.DEFAULT_LAYOUT },
        isArena: false
      },
      activeTab: 'general'
    };

    // Ensure layoutSettings exists for existing scenes
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
      'file-picked': TomSceneEditor._onFilePicked // Custom handler for file picker callback
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

  /* ═══════════════════════════════════════════════════════════════
     RENDER CONTEXT
     ═══════════════════════════════════════════════════════════════ */

  async _prepareContext(options) {
    // Prepare layout presets for the dropdown
    const layoutPresets = Object.entries(CONFIG.LAYOUT_PRESETS).map(([key, preset]) => ({
      key,
      name: preset.name,
      icon: preset.icon,
      selected: this.uiState.data.layoutSettings.preset === key
    }));

    // Prepare size presets for the dropdown
    const sizePresets = Object.entries(CONFIG.SIZE_PRESETS).map(([key, preset]) => ({
      key,
      name: preset.name,
      selected: this.uiState.data.layoutSettings.size === key
    }));

    return {
      scene: this.uiState.data,
      activeTab: this.uiState.activeTab,
      isImage: this.uiState.data.bgType === 'image',
      isVideo: this.uiState.data.bgType === 'video',
      isCreateMode: this.isCreateMode,
      layoutPresets,
      sizePresets,
      layoutSettings: this.uiState.data.layoutSettings
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // Bind Name Input
    const nameInput = this.element.querySelector('input[name="name"]');
    if (nameInput) {
      nameInput.addEventListener('input', (e) => {
        this.uiState.data.name = e.target.value;
      });
    }

    // Bind Background Input
    const bgInput = this.element.querySelector('input[name="background"]');
    if (bgInput) {
      bgInput.addEventListener('change', (e) => {
        this._updateBackground(e.target.value);
      });
    }

    // Bind File Picker Button
    const filePickerBtn = this.element.querySelector('.file-picker');
    if (filePickerBtn) {
      filePickerBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const fp = new FilePicker({
          type: "imagevideo",
          current: this.uiState.data.background,
          callback: path => {
            this._updateBackground(path);
            // Manually update input value as it won't update automatically
            if (bgInput) bgInput.value = path;
            this.render();
          }
        });
        return fp.render(true);
      });
    }


    // Bind Layout Controls
    const layoutPresetSelect = this.element.querySelector('select[name="layoutPreset"]');
    if (layoutPresetSelect) {
      layoutPresetSelect.addEventListener('change', (e) => {
        this.uiState.data.layoutSettings.preset = e.target.value;
      });
    }

    const sizeSelect = this.element.querySelector('select[name="layoutSize"]');
    if (sizeSelect) {
      sizeSelect.addEventListener('change', (e) => {
        this.uiState.data.layoutSettings.size = e.target.value;
      });
    }

    const spacingInput = this.element.querySelector('input[name="layoutSpacing"]');
    if (spacingInput) {
      spacingInput.addEventListener('input', (e) => {
        this.uiState.data.layoutSettings.spacing = parseInt(e.target.value) || 24;
      });
    }

    const offsetXInput = this.element.querySelector('input[name="layoutOffsetX"]');
    if (offsetXInput) {
      offsetXInput.addEventListener('input', (e) => {
        this.uiState.data.layoutSettings.offsetX = parseInt(e.target.value) || 0;
      });
    }

    const offsetYInput = this.element.querySelector('input[name="layoutOffsetY"]');
    if (offsetYInput) {
      offsetYInput.addEventListener('input', (e) => {
        this.uiState.data.layoutSettings.offsetY = parseInt(e.target.value) || 5;
      });
    }

    // Bind Arena Toggle
    const arenaToggle = this.element.querySelector('input[name="isArena"]');
    if (arenaToggle) {
      arenaToggle.addEventListener('change', (e) => {
        this.uiState.data.isArena = e.target.checked;
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     LOGIC
     ═══════════════════════════════════════════════════════════════ */

  _updateBackground(path) {
    this.uiState.data.background = path;
    this.uiState.data.bgType = path.match(/\.(webm|mp4|m4v)$/i) ? 'video' : 'image';
  }


  /* ═══════════════════════════════════════════════════════════════
     ACTIONS
     ═══════════════════════════════════════════════════════════════ */

  static _onTabSwitch(event, target) {
    this.uiState.activeTab = target.dataset.tab;
    this.render();
  }


  static async _onSave(event, target) {
    // Add loading state to button
    const btn = target;
    const originalHtml = btn.innerHTML;
    btn.classList.add('es-btn-loading');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    try {
      if (this.isCreateMode) {
        // Create a new scene
        const newScene = Store.createScene({
          name: this.uiState.data.name,
          background: this.uiState.data.background,
          bgType: this.uiState.data.bgType,
          layoutSettings: this.uiState.data.layoutSettings
        });

        // Refresh GM Panel and select the new scene
        const { TomGMPanel } = await import('./TomGMPanel.mjs');
        if (TomGMPanel._instance) {
          TomGMPanel._instance.uiState.selectedId = newScene.id;
          TomGMPanel._instance.uiState.inspectorOpen = true;
          TomGMPanel._instance.render();
        }

        this.close();
        ui.notifications.info(`Created Scene: ${newScene.name}`);
      } else {
        // Update existing scene
        Object.assign(this.scene, this.uiState.data);
        Store.saveData();

        // Refresh GM Panel
        const { TomGMPanel } = await import('./TomGMPanel.mjs');
        TomGMPanel.show();

        this.close();
        ui.notifications.info(`Saved Scene: ${this.scene.name}`);
      }
    } catch (error) {
      console.error('Tom | Error saving scene:', error);
      ui.notifications.error('Failed to save scene. Check console for details.');
      // Restore button state on error
      btn.classList.remove('es-btn-loading');
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  }

  static _onClose(event, target) {
    this.close();
  }
}
