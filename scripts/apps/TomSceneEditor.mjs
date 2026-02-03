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
      isTopPosition: this.uiState.data.layoutSettings.preset.startsWith('top'),
      sizePresets,
      arenaTypeOptions: [
        { value: 'isometric', label: 'Isometric (Ellipse)' },
        { value: 'topdown', label: 'Top Down (Circle)' },
        { value: 'expanded', label: 'Expanded (Radial Grid)' },
        { value: 'ladder', label: 'Ladder (Linear Track)' },
        { value: 'none', label: 'No Grid (None)' }
      ],
      selectedArenaType: this.uiState.data.arenaType,
      layoutSettings: this.uiState.data.layoutSettings
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    
    const nameInput = this.element.querySelector('input[name="name"]');
    if (nameInput) {
      nameInput.addEventListener('input', (e) => {
        this.uiState.data.name = e.target.value;
      });
    }

    
    const bgInput = this.element.querySelector('input[name="background"]');
    if (bgInput) {
      bgInput.addEventListener('change', (e) => {
        this._updateBackground(e.target.value);
      });
    }

    
    const filePickerBtn = this.element.querySelector('.file-picker');
    if (filePickerBtn) {
      filePickerBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const fp = new FilePicker({
          type: "imagevideo",
          current: this.uiState.data.background,
          callback: path => {
            this._updateBackground(path);
            
            if (bgInput) bgInput.value = path;
            this.render();
          }
        });
        return fp.render(true);
      });
    }

    
    this.element.querySelectorAll('.tom-pos-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.uiState.data.layoutSettings.preset = btn.dataset.position;
        this.element.querySelectorAll('.tom-pos-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

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

    const offsetYInput = this.element.querySelector('input[name="layoutOffsetY"]');
    if (offsetYInput) {
      offsetYInput.addEventListener('input', (e) => {
        this.uiState.data.layoutSettings.offsetY = parseInt(e.target.value) || 5;
      });
    }

    
    const arenaToggle = this.element.querySelector('input[name="isArena"]');
    if (arenaToggle) {
      arenaToggle.addEventListener('change', (e) => {
        this.uiState.data.isArena = e.target.checked;
        this.render();
      });
    }

    
    const arenaTypeSelect = this.element.querySelector('select[name="arenaType"]');
    if (arenaTypeSelect) {
      arenaTypeSelect.addEventListener('change', (e) => {
        this.uiState.data.arenaType = e.target.value;
      });
    }
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
    
    const btn = target;
    const originalHtml = btn.innerHTML;
    btn.classList.add('es-btn-loading');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    try {
      if (this.isCreateMode) {
        
        const newScene = Store.createScene({
          name: this.uiState.data.name,
          background: this.uiState.data.background,
          bgType: this.uiState.data.bgType,
          layoutSettings: this.uiState.data.layoutSettings,
          isArena: this.uiState.data.isArena,
          arenaType: this.uiState.data.arenaType
        });

        
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
      
      btn.classList.remove('es-btn-loading');
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  }

  static _onClose(event, target) {
    this.close();
  }
}
