import { TOM_CONFIG as CONFIG } from '../TomConfig.mjs';
import { TomStore as Store } from '../data/TomStore.mjs';

import { TomSocketHandler } from '../data/TomSocketHandler.mjs';
import { TomSmartCreator } from './TomSmartCreator.mjs';
import { TomCharacterEditor } from './TomCharacterEditor.mjs';
import { TomSceneEditor } from './TomSceneEditor.mjs';
import { TomSlideshowEditor } from './TomSlideshowEditor.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TomGMPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.uiState = {
      currentView: 'scenes-all',
      searchQuery: '',
      selectedId: null,
      inspectorOpen: false,
      activeTags: new Set(),
      excludedTags: new Set(),
      activeSceneId: Store.activeSceneId,
      emotionPicker: { open: false, characterId: null, x: 0, y: 0 },
      viewMode: 'grid', // 'grid' or 'list'
      // Novos estados para ordenação e busca
      sortBy: 'name', // 'name', 'created', 'lastUsed', 'playCount', 'custom'
      sortAscending: true,
      sortMenuOpen: false,
      isSearching: false,
      keyboardFocusIndex: -1, // Para navegação por teclado no emotion picker
      emotionSearchQuery: '', // Search query for emotion picker
      // Estado de navegação por folders
      currentFolderId: null, // null = root level
      // Scene being edited (for floating cast strip)
      editingSceneId: null,
      // Cast-Only Mode selection
      castOnlySelectedChars: new Set()
    };

    // Debounce timer para busca
    this._searchDebounceTimer = null;
  }

  static DEFAULT_OPTIONS = {
    tag: 'form',
    id: 'tom-gm-panel',
    classes: ['tom-app'],
    window: {
      title: 'Tom',
      icon: 'fas fa-film',
      resizable: true,
      controls: []
    },
    position: {
      width: 1000,
      height: 700
    },
    actions: {
      view: TomGMPanel._onViewChange,
      select: TomGMPanel._onSelect,
      'close-inspector': TomGMPanel._onCloseInspector,
      broadcast: TomGMPanel._onBroadcast,
      'stop-broadcast': TomGMPanel._onStopBroadcast,
      'add-cast': TomGMPanel._onAddCast,
      'change-emotion': TomGMPanel._onChangeEmotion,
      'cast-click': TomGMPanel._onCastClick,
      'select-emotion': TomGMPanel._onSelectEmotion,
      'close-picker': TomGMPanel._onClosePicker,
      'remove-cast': TomGMPanel._onRemoveCast,
      create: TomGMPanel._onCreate,
      edit: TomGMPanel._onEdit,
      delete: TomGMPanel._onDelete,
      'filter-tag': TomGMPanel._onFilterTag,
      'remove-filter': TomGMPanel._onRemoveFilter,
      'exclude-tag': TomGMPanel._onExcludeTag,
      'toggle-view': TomGMPanel._onToggleView,
      'quick-add': TomGMPanel._onQuickAdd,
      'toggle-favorite': TomGMPanel._onToggleFavorite,
      // Novas actions
      'toggle-sort': TomGMPanel._onToggleSort,
      'sort': TomGMPanel._onSort,
      'toggle-sort-direction': TomGMPanel._onToggleSortDirection,
      'clear-search': TomGMPanel._onClearSearch,
      // Folder actions
      'open-folder': TomGMPanel._onOpenFolder,
      'navigate-up': TomGMPanel._onNavigateUp,
      'create-folder': TomGMPanel._onCreateFolder,
      'toggle-folder': TomGMPanel._onToggleFolder,
      'delete-folder': TomGMPanel._onDeleteFolder,
      'rename-folder': TomGMPanel._onRenameFolder,
      // Floating Cast Strip actions
      'go-to-scene': TomGMPanel._onGoToScene,
      'close-floating-cast': TomGMPanel._onCloseFloatingCast,
      'floating-add-cast': TomGMPanel._onFloatingAddCast,
      // Emotion Picker actions
      'toggle-emotion-favorite': TomGMPanel._onToggleEmotionFavorite,
      'search-emotions': TomGMPanel._onSearchEmotions,
      // Slideshow actions
      'create-slideshow': TomGMPanel._onCreateSlideshow,
      'edit-slideshow': TomGMPanel._onEditSlideshow,
      'play-slideshow': TomGMPanel._onPlaySlideshow,
      'delete-slideshow': TomGMPanel._onDeleteSlideshow,
      'slideshow-pause': TomGMPanel._onSlideshowPause,
      'slideshow-resume': TomGMPanel._onSlideshowResume,
      'slideshow-next': TomGMPanel._onSlideshowNext,
      'slideshow-prev': TomGMPanel._onSlideshowPrev,
      'slideshow-stop': TomGMPanel._onSlideshowStop,
      // Scene Sequence actions
      'convert-to-sequence': TomGMPanel._onConvertToSequence,
      'remove-sequence': TomGMPanel._onRemoveSequence,
      'add-sequence-bg': TomGMPanel._onAddSequenceBg,
      'remove-sequence-bg': TomGMPanel._onRemoveSequenceBg,
      'sequence-goto': TomGMPanel._onSequenceGoto,
      'broadcast-sequence': TomGMPanel._onBroadcastSequence,
      'sequence-prev': TomGMPanel._onSequencePrev,
      'sequence-next': TomGMPanel._onSequenceNext,
      // Cast-Only Mode actions
      'toggle-cast-only-char': TomGMPanel._onToggleCastOnlyChar,
      'cast-only-start': TomGMPanel._onCastOnlyStart,
      'cast-only-stop': TomGMPanel._onCastOnlyStop,
      'cast-only-layout': TomGMPanel._onCastOnlyLayout
      // Color picker handled via direct event listeners in _onRender
    }
  };

  static PARTS = {
    main: {
      template: CONFIG.TEMPLATES.GM_PANEL,
      scrollable: ['.tom-grid']
    }
  };

  /* ═══════════════════════════════════════════════════════════════
     LIFECYCLE
     ═══════════════════════════════════════════════════════════════ */

  _onClose(options) {
    // Limpar listener de teclado ao fechar a aplicação
    if (this._keyboardHandler) {
      document.removeEventListener('keydown', this._keyboardHandler);
      this._keyboardHandler = null;
    }
    this._closeContextMenu?.();
    super._onClose?.(options);
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER CONTEXT
     ═══════════════════════════════════════════════════════════════ */

  _onRender(context, options) {
    super._onRender(context, options);

    // Track para animação de sucesso
    this._lastAddedCharId = null;
    // Fechar qualquer menu de contexto antigo ao re-renderizar
    this._closeContextMenu?.();

    // === BUSCA COM DEBOUNCE ===
    const searchInput = this.element.querySelector('.tom-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value;

        // Mostrar indicador de busca
        this.uiState.isSearching = true;

        // Cancelar timer anterior
        if (this._searchDebounceTimer) {
          clearTimeout(this._searchDebounceTimer);
        }

        // Debounce de 300ms
        this._searchDebounceTimer = setTimeout(() => {
          this.uiState.searchQuery = query;
          this.uiState.isSearching = false;
          this.render();
        }, 300);
      });

      // Atalho: Esc limpa busca
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.uiState.searchQuery) {
          e.preventDefault();
          this.uiState.searchQuery = '';
          searchInput.value = '';
          this.render();
        }
      });
    }

    // === ATALHOS DE TECLADO GLOBAIS ===
    this._setupKeyboardShortcuts();

    // === CONTEXT MENU EM ÁREA VAZIA DA GRID ===
    this._setupGridContextMenu();

    // === COLOR PICKER PARA FOLDERS ===
    const colorInputs = this.element.querySelectorAll('input[type="color"][data-action="change-folder-color"]');
    colorInputs.forEach(input => {
      // Prevenir que o click abra o folder
      input.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      // Atualizar cor em tempo real
      input.addEventListener('input', (e) => {
        e.stopPropagation();
        const folderId = e.target.closest('[data-folder-id]').dataset.folderId;
        const color = e.target.value;

        // Atualizar visualmente
        const folderCard = e.target.closest('.tom-folder-card');
        if (folderCard) {
          folderCard.style.setProperty('--folder-color', color);
          folderCard.dataset.color = color;
        }
      });

      // Salvar quando fecha o picker
      input.addEventListener('change', (e) => {
        e.stopPropagation();
        const folderId = e.target.closest('[data-folder-id]').dataset.folderId;
        const color = e.target.value;
        Store.updateFolder(folderId, { color });
      });
    });

    // === FECHAR MENU DE SORT AO CLICAR FORA ===
    if (this.uiState.sortMenuOpen) {
      const closeSort = (e) => {
        if (!e.target.closest('.tom-sort-dropdown')) {
          this.uiState.sortMenuOpen = false;
          this.render();
          document.removeEventListener('click', closeSort);
        }
      };
      // Delay para não fechar imediatamente
      setTimeout(() => document.addEventListener('click', closeSort), 10);
    }

    // Context Menu for Cast Members (Right Click to Remove)
    const castMembers = this.element.querySelectorAll('.tom-cast-member:not(.add-new)');
    castMembers.forEach(member => {
      // Get the scene ID from the parent cast strip
      const parentStrip = member.closest('.tom-cast-strip');
      const memberSceneId = parentStrip?.dataset.sceneId || this.uiState.selectedId;

      member.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const charId = member.dataset.characterId;

        Dialog.confirm({
          title: "Remove from Scene?",
          content: "<p>Remove this character from the current scene?</p>",
          yes: () => {
            Store.removeCastMember(memberSceneId, charId);
            if (this.uiState.emotionPicker.characterId === charId) {
              this.uiState.emotionPicker.open = false;
            }
            this.render();
          }
        });
      });

      // Drag Start for Cast Member (Reordering)
      member.addEventListener('dragstart', (e) => {
        // Definir dados do drag antes de qualquer outra coisa
        e.dataTransfer.setData('text/plain', JSON.stringify({
          type: 'cast-reorder',
          id: member.dataset.characterId,
          fromIndex: parseInt(member.dataset.index),
          sceneId: memberSceneId
        }));
        e.dataTransfer.effectAllowed = 'move';

        // Criar uma imagem de drag customizada (cópia do elemento)
        const dragImage = member.cloneNode(true);
        dragImage.style.position = 'absolute';
        dragImage.style.top = '-1000px';
        dragImage.style.opacity = '0.8';
        document.body.appendChild(dragImage);
        e.dataTransfer.setDragImage(dragImage, 25, 25);

        // Adicionar classe após um pequeno delay para não afetar a drag image
        setTimeout(() => {
          member.classList.add('dragging');
          document.body.removeChild(dragImage);
        }, 0);
      });

      member.addEventListener('dragend', (e) => {
        member.classList.remove('dragging');
        this.element.querySelectorAll('.tom-cast-member').forEach(m => {
          m.classList.remove('drag-target');
        });
        // Remover classe de todos os cast strips
        this.element.querySelectorAll('.tom-cast-strip').forEach(strip => {
          strip.classList.remove('drag-over');
        });
      });

      // Drop target for reordering
      member.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';

        const dragging = this.element.querySelector('.tom-cast-member.dragging');
        if (dragging && dragging !== member && !member.classList.contains('add-new')) {
          // Remover de todos os outros
          this.element.querySelectorAll('.tom-cast-member.drag-target').forEach(m => {
            if (m !== member) m.classList.remove('drag-target');
          });
          member.classList.add('drag-target');
        }
      });

      member.addEventListener('dragleave', (e) => {
        // Só remove se realmente saiu do elemento
        if (!member.contains(e.relatedTarget)) {
          member.classList.remove('drag-target');
        }
      });

      member.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        member.classList.remove('drag-target');

        try {
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
          if (data.type === 'cast-reorder') {
            const toIndex = parseInt(member.dataset.index);
            if (data.fromIndex !== toIndex) {
              Store.reorderCastMember(data.sceneId, data.fromIndex, toIndex);
              this.render();
            }
          }
        } catch (err) {
          console.warn('Invalid drop data', err);
        }
      });
    });

    // Drag Start for ALL Cards (scenes and characters) - for folder organization, cast AND reordering
    const allCards = this.element.querySelectorAll('.tom-card');
    const activeTab = this.uiState.currentView.startsWith('scenes') ? 'scenes' : 'characters';
    const isFavorites = this.uiState.currentView.includes('favorites');
    const isInFolder = this.uiState.currentFolderId !== null;
    const canReorder = !isFavorites && !isInFolder; // Can only reorder in "All" view at root

    allCards.forEach((card, cardIndex) => {
      card.setAttribute('draggable', 'true');
      card.dataset.cardIndex = cardIndex; // Store index for reordering

      card.addEventListener('dragstart', (e) => {
        const itemType = card.dataset.type;
        const itemId = card.dataset.id;

        e.dataTransfer.setData('text/plain', JSON.stringify({
          type: itemType === 'character' ? 'character' : 'scene',
          id: itemId,
          isLibraryItem: true, // Flag to identify library items for folder drop
          cardIndex: cardIndex // For reordering
        }));
        e.dataTransfer.effectAllowed = 'copyMove';

        card.classList.add('dragging');

        // Mostrar drop zones nos folders
        this.element.querySelectorAll('.tom-folder-card:not(.tom-folder-back)').forEach(f => {
          f.classList.add('drop-zone');
        });

        // Show reorder indicators on other cards (only in reorderable views)
        if (canReorder) {
          allCards.forEach(c => {
            if (c !== card) c.classList.add('reorder-target');
          });
        }
      });

      card.addEventListener('dragend', (e) => {
        card.classList.remove('dragging');
        // Remover indicadores de drop zone
        this.element.querySelectorAll('.tom-folder-card').forEach(f => {
          f.classList.remove('drop-zone', 'drag-over');
        });
        // Remove reorder indicators
        allCards.forEach(c => {
          c.classList.remove('reorder-target', 'drag-over-left', 'drag-over-right');
        });
      });

      // === REORDER DROP TARGET ===
      if (canReorder) {
        card.addEventListener('dragover', (e) => {
          e.preventDefault();

          // Check if dragging a card of the same type
          const draggingCard = this.element.querySelector('.tom-card.dragging');
          if (!draggingCard || draggingCard === card) return;
          if (draggingCard.dataset.type !== card.dataset.type) return;

          e.dataTransfer.dropEffect = 'move';

          // Determine drop position (left or right of target)
          const rect = card.getBoundingClientRect();
          const midpoint = rect.left + rect.width / 2;
          const isLeft = e.clientX < midpoint;

          // Update visual indicator
          card.classList.remove('drag-over-left', 'drag-over-right');
          card.classList.add(isLeft ? 'drag-over-left' : 'drag-over-right');
        });

        card.addEventListener('dragleave', (e) => {
          if (!card.contains(e.relatedTarget)) {
            card.classList.remove('drag-over-left', 'drag-over-right');
          }
        });

        card.addEventListener('drop', (e) => {
          e.preventDefault();
          e.stopPropagation();
          card.classList.remove('drag-over-left', 'drag-over-right');

          try {
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            if (!data.isLibraryItem) return;

            // Only reorder same type
            const targetType = card.dataset.type === 'scene' ? 'scene' : 'character';
            if (data.type !== targetType) return;

            // Get all current items in order
            const storeType = targetType === 'scene' ? 'scenes' : 'characters';
            const currentOrder = Array.from(this.element.querySelectorAll('.tom-card'))
              .filter(c => c.dataset.type === card.dataset.type)
              .map(c => c.dataset.id);

            // Find positions
            const fromIndex = currentOrder.indexOf(data.id);
            const toIndex = currentOrder.indexOf(card.dataset.id);

            if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

            // Determine if dropping left or right
            const rect = card.getBoundingClientRect();
            const midpoint = rect.left + rect.width / 2;
            const isLeft = e.clientX < midpoint;

            // Create new order
            const newOrder = [...currentOrder];
            newOrder.splice(fromIndex, 1); // Remove from old position
            let insertIndex = currentOrder.indexOf(card.dataset.id);
            if (fromIndex < insertIndex) insertIndex--; // Adjust for removed item
            if (!isLeft) insertIndex++; // Insert after if dropping on right
            newOrder.splice(insertIndex, 0, data.id);

            // Save custom order and switch to custom sort
            Store.setCustomOrder(storeType, newOrder);
            this.uiState.sortBy = 'custom';
            this.render();
            ui.notifications.info('Custom order saved');
          } catch (err) {
            console.warn('Invalid reorder drop', err);
          }
        });
      }
    });

    // Folder Drop Zones
    const folderCards = this.element.querySelectorAll('.tom-folder-card:not(.tom-folder-back)');
    folderCards.forEach(folder => {
      folder.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();

        try {
          // Verificar se é um item da biblioteca
          e.dataTransfer.dropEffect = 'move';
          folder.classList.add('drag-over');
        } catch (err) {
          // Ignore
        }
      });

      folder.addEventListener('dragleave', (e) => {
        if (!folder.contains(e.relatedTarget)) {
          folder.classList.remove('drag-over');
        }
      });

      folder.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        folder.classList.remove('drag-over');

        try {
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
          if (data.isLibraryItem) {
            const folderId = folder.dataset.folderId;
            const itemType = data.type;
            Store.moveItemToFolder(data.id, itemType, folderId);
            this.render();
            ui.notifications.info(`Moved to folder.`);
          }
        } catch (err) {
          console.warn('Invalid folder drop', err);
        }
      });
    });

    // "Back" folder and root area - move items OUT of folder
    const backFolder = this.element.querySelector('.tom-folder-back');
    if (backFolder) {
      backFolder.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        backFolder.classList.add('drag-over');
      });

      backFolder.addEventListener('dragleave', (e) => {
        if (!backFolder.contains(e.relatedTarget)) {
          backFolder.classList.remove('drag-over');
        }
      });

      backFolder.addEventListener('drop', (e) => {
        e.preventDefault();
        backFolder.classList.remove('drag-over');

        try {
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
          if (data.isLibraryItem) {
            // Mover para o parent folder (ou root se já estiver no primeiro nível)
            const currentFolder = Store.folders.get(this.uiState.currentFolderId);
            const targetFolderId = currentFolder?.parent || null;
            Store.moveItemToFolder(data.id, data.type, targetFolderId);
            this.render();
            ui.notifications.info(`Moved to parent folder.`);
          }
        } catch (err) {
          console.warn('Invalid back-folder drop', err);
        }
      });
    }

    // Drop Zone: Cast Strips (both inspector and floating)
    const castStrips = this.element.querySelectorAll('.tom-cast-strip');
    castStrips.forEach(castStrip => {
      const sceneId = castStrip.dataset.sceneId;

      castStrip.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        castStrip.classList.add('drag-over');
      });

      castStrip.addEventListener('dragleave', (e) => {
        if (!castStrip.contains(e.relatedTarget)) {
          castStrip.classList.remove('drag-over');
        }
      });

      castStrip.addEventListener('drop', async (e) => {
        e.preventDefault();
        castStrip.classList.remove('drag-over');

        try {
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
          if (data.type === 'character') {
            const targetSceneId = sceneId || this.uiState.selectedId;
            const scene = Store.scenes.get(targetSceneId);
            // Verificar se já não está no cast
            if (scene && !scene.cast.some(c => c.id === data.id)) {
              this._lastAddedCharId = data.id;
              Store.addCastMember(targetSceneId, data.id);
              this.render();
              this._showCastFeedback("Character added!");
            } else {
              ui.notifications.warn("Character is already in the cast.");
            }
          }
        } catch (err) {
          console.warn('Invalid cast drop', err);
        }
      });
    });

    // === SEQUENCE TIMELINE DROP ZONE (for dragging scenes from library) ===
    const sequenceTimeline = this.element.querySelector('.tom-sequence-timeline');
    if (sequenceTimeline) {
      sequenceTimeline.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Check if it's a scene being dragged
        try {
          e.dataTransfer.dropEffect = 'copy';
          sequenceTimeline.classList.add('drag-over');
        } catch (err) {
          // Ignore
        }
      });

      sequenceTimeline.addEventListener('dragleave', (e) => {
        if (!sequenceTimeline.contains(e.relatedTarget)) {
          sequenceTimeline.classList.remove('drag-over');
        }
      });

      sequenceTimeline.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        sequenceTimeline.classList.remove('drag-over');

        try {
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));

          // Only accept scenes (not characters)
          if (data.type !== 'scene' || !data.isLibraryItem) return;

          const droppedScene = Store.scenes.get(data.id);
          if (!droppedScene) return;

          const currentSceneId = this.uiState.selectedId;
          const currentScene = Store.scenes.get(currentSceneId);
          if (!currentScene || !currentScene.isSequence) return;

          // Don't allow dropping the same scene onto itself
          if (data.id === currentSceneId) {
            ui.notifications.warn("Cannot add a scene to its own sequence.");
            return;
          }

          // Add the dropped scene's background to the sequence
          const bgPath = droppedScene.background;
          const isVideo = bgPath.match(/\.(mp4|webm|ogg)$/i);
          currentScene.addSequenceBackground(bgPath, isVideo ? 'video' : 'image');
          Store.saveData();
          this.render();
          ui.notifications.info(`Added background from "${droppedScene.name}" to sequence.`);
        } catch (err) {
          console.warn('Invalid sequence drop', err);
        }
      });
    }

    // === SEQUENCE SETTINGS EVENT LISTENERS ===
    const sequencePanel = this.element.querySelector('.tom-sequence-panel');
    if (sequencePanel) {
      // Transition Type Select
      const transitionSelect = sequencePanel.querySelector('[data-action="sequence-transition-type"]');
      if (transitionSelect) {
        transitionSelect.addEventListener('change', (e) => {
          const sceneId = this.uiState.selectedId;
          const scene = Store.scenes.get(sceneId);
          if (scene && scene.isSequence) {
            scene.sequenceSettings.transitionType = e.target.value;
            Store.saveData();
            // Update live sequence if active
            if (Store.sequenceState.isActive && Store.sequenceState.sceneId === sceneId) {
              Store.sequenceState.transitionType = e.target.value;
            }
            this.render();
          }
        });
      }

      // Transition Duration Input
      const durationInput = sequencePanel.querySelector('[data-action="sequence-transition-duration"]');
      if (durationInput) {
        durationInput.addEventListener('change', (e) => {
          const sceneId = this.uiState.selectedId;
          const scene = Store.scenes.get(sceneId);
          if (scene && scene.isSequence) {
            const duration = parseFloat(e.target.value) || 1.0;
            scene.sequenceSettings.transitionDuration = Math.max(0.1, Math.min(5, duration));
            Store.saveData();
            // Update live sequence if active
            if (Store.sequenceState.isActive && Store.sequenceState.sceneId === sceneId) {
              Store.sequenceState.transitionDuration = scene.sequenceSettings.transitionDuration;
            }
          }
        });
      }

      // On End Select
      const onEndSelect = sequencePanel.querySelector('[data-action="sequence-on-end"]');
      if (onEndSelect) {
        onEndSelect.addEventListener('change', (e) => {
          const sceneId = this.uiState.selectedId;
          const scene = Store.scenes.get(sceneId);
          if (scene && scene.isSequence) {
            scene.sequenceSettings.onEnd = e.target.value;
            Store.saveData();
            // Update live sequence if active
            if (Store.sequenceState.isActive && Store.sequenceState.sceneId === sceneId) {
              Store.sequenceState.onEnd = e.target.value;
            }
          }
        });
      }
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

      // Hover preview for emotions - always visible, smart positioning
      const previewPanel = emotionPicker.querySelector('.tom-picker-preview');
      const previewImg = previewPanel?.querySelector('img');
      const previewLabel = previewPanel?.querySelector('.tom-picker-preview-label');
      const items = emotionPicker.querySelectorAll('.tom-picker-item');

      // Known preview dimensions (from CSS)
      const PREVIEW_WIDTH = 340;
      const PREVIEW_HEIGHT = 370;
      const MARGIN = 20; // margin from screen edges

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

    // Aplicar animação de sucesso ao último personagem adicionado
    if (this._lastAddedCharId) {
      const newMember = this.element.querySelector(`.tom-cast-member[data-character-id="${this._lastAddedCharId}"]`);
      if (newMember) {
        newMember.classList.add('just-added');
        setTimeout(() => newMember.classList.remove('just-added'), 800);
      }
      this._lastAddedCharId = null;
    }

    // Drop Zone: Main Library (Removal)
    const library = this.element.querySelector('.tom-library');
    if (library) {
      library.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      library.addEventListener('drop', (e) => {
        e.preventDefault();
        try {
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
          if (data.type === 'cast-reorder') {
            Store.removeCastMember(data.sceneId, data.id);
            this.render();
            ui.notifications.info("Character removed from scene.");
          }
        } catch (err) {
          // Ignore invalid drops
        }
      });
    }
  }

  /**
   * Mostra feedback visual no cast strip
   */
  _showCastFeedback(message) {
    const castStrip = this.element.querySelector('.tom-cast-strip');
    if (!castStrip) return;

    const toast = document.createElement('div');
    toast.className = 'es-feedback-toast';
    toast.textContent = message;
    castStrip.style.position = 'relative';
    castStrip.appendChild(toast);

    setTimeout(() => toast.remove(), 2000);
  }

  /**
   * Configura atalhos de teclado para o painel
   */
  _setupKeyboardShortcuts() {
    // Remover listener anterior se existir (do documento)
    if (this._keyboardHandler) {
      document.removeEventListener('keydown', this._keyboardHandler);
    }

    this._keyboardHandler = (e) => {
      // Ignorar se não é nossa aplicação ou se está em input de outra aplicação
      const isOurApp = this.element?.contains(document.activeElement) ||
        document.activeElement === document.body ||
        this.element?.contains(e.target);

      // Se emotion picker está aberto
      if (this.uiState.emotionPicker.open) {
        const picker = this.element?.querySelector('.tom-emotion-picker');
        if (!picker) return;

        const items = picker.querySelectorAll('.tom-picker-item');
        const itemCount = items.length;

        switch (e.key) {
          case 'Escape':
            e.preventDefault();
            e.stopPropagation();
            this.uiState.emotionPicker.open = false;
            this.uiState.keyboardFocusIndex = -1;
            this.render();
            break;

          case 'ArrowDown':
          case 'ArrowRight':
            e.preventDefault();
            this.uiState.keyboardFocusIndex = (this.uiState.keyboardFocusIndex + 1) % itemCount;
            this._updateKeyboardFocus(items);
            break;

          case 'ArrowUp':
          case 'ArrowLeft':
            e.preventDefault();
            this.uiState.keyboardFocusIndex = this.uiState.keyboardFocusIndex <= 0
              ? itemCount - 1
              : this.uiState.keyboardFocusIndex - 1;
            this._updateKeyboardFocus(items);
            break;

          case 'Enter':
            e.preventDefault();
            if (this.uiState.keyboardFocusIndex >= 0 && this.uiState.keyboardFocusIndex < itemCount) {
              const selectedItem = items[this.uiState.keyboardFocusIndex];
              const state = selectedItem.dataset.state;
              this._selectEmotionByState(state);
            }
            break;
        }
        return;
      }

      // Atalhos globais quando picker não está aberto
      // Só processar se o foco está na nossa aplicação ou no body
      if (!isOurApp) return;

      switch (e.key) {
        case 'Escape':
          // Fechar sort menu primeiro, depois inspector
          if (this.uiState.sortMenuOpen) {
            e.preventDefault();
            this.uiState.sortMenuOpen = false;
            this.render();
          } else if (this.uiState.inspectorOpen) {
            e.preventDefault();
            this.uiState.inspectorOpen = false;
            this.render();
          }
          break;

        case '/':
          // Focar na busca (só se não está em input)
          if (!e.target.matches('input, textarea')) {
            e.preventDefault();
            const searchInput = this.element?.querySelector('.tom-search-input');
            if (searchInput) searchInput.focus();
          }
          break;

        case 'f':
        case 'F':
          // Toggle favorite (só se não está em input)
          if (!e.target.matches('input, textarea') && this.uiState.selectedId) {
            e.preventDefault();
            TomGMPanel._toggleSelectedFavorite.call(this);
          }
          break;
      }
    };

    // Usar documento para capturar eventos globalmente
    document.addEventListener('keydown', this._keyboardHandler);

    // Marcar picker como ativo para keyboard quando aberto
    const picker = this.element?.querySelector('.tom-emotion-picker');
    if (picker && this.uiState.emotionPicker.open) {
      picker.classList.add('keyboard-active');
      // Inicializar foco no item ativo atual
      const items = picker.querySelectorAll('.tom-picker-item');
      const activeIndex = Array.from(items).findIndex(item => item.classList.contains('active'));
      this.uiState.keyboardFocusIndex = activeIndex >= 0 ? activeIndex : 0;
      this._updateKeyboardFocus(items);
    }
  }

  /**
   * Atualiza o foco visual do teclado nos itens
   */
  _updateKeyboardFocus(items) {
    items.forEach((item, index) => {
      item.classList.toggle('keyboard-focus', index === this.uiState.keyboardFocusIndex);
    });
    // Scroll para o item focado
    if (items[this.uiState.keyboardFocusIndex]) {
      items[this.uiState.keyboardFocusIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * Context menu on empty grid area
   */
  _setupGridContextMenu() {
    // Use the whole library area (includes padding) so empty zones respond
    const container = this.element?.querySelector('.tom-library') || this.element?.querySelector('.tom-grid');
    if (!container) return;

    // Evitar handlers duplicados quando re-renderizaÇõÇœo recria a UI
    if (this._gridContextHandler) {
      container.removeEventListener('contextmenu', this._gridContextHandler);
    }

    this._gridContextHandler = (e) => {
      // Ignorar cliques em cartas, pastas, inspector e inputs
      const isOnItem = e.target.closest('.tom-card, .tom-folder-card, .tom-cast-strip, .tom-sort-dropdown, .tom-search-container, .tom-filter-bar, .tom-inspector, input, textarea, select, button');
      if (isOnItem) return;
      // Garantir que o clique ocorreu dentro da Ç rea da library (sem pegar sidebar)
      if (!container.contains(e.target)) return;

      e.preventDefault();
      this._openContextMenu(e.clientX, e.clientY);
    };

    container.addEventListener('contextmenu', this._gridContextHandler);
  }

  _openContextMenu(x, y) {
    const isScenes = this.uiState.currentView.startsWith('scenes');
    const isFavorites = this.uiState.currentView.includes('favorites');

    const options = [];

    options.push({
      label: isScenes ? 'New Scene' : 'New Character',
      icon: isScenes ? 'fas fa-plus-circle' : 'fas fa-user-plus',
      action: () => {
        if (isScenes) {
          new TomSceneEditor().render(true);
        } else {
          new TomSmartCreator().render(true);
        }
      }
    });

    if (!isFavorites) {
      options.push({
        label: 'New Folder',
        icon: 'fas fa-folder-plus',
        action: () => {
          TomGMPanel._onCreateFolder.call(this, {}, null);
        }
      });
    }

    if (!options.length) return;

    this._closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'es-context-menu';

    options.forEach(opt => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'es-context-menu-item';
      item.innerHTML = `<i class="${opt.icon}"></i><span>${opt.label}</span>`;
      item.addEventListener('click', () => {
        this._closeContextMenu();
        opt.action();
      });
      menu.appendChild(item);
    });

    menu.style.visibility = 'hidden';
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    const padding = 8;
    const left = Math.max(padding, Math.min(x, window.innerWidth - rect.width - padding));
    const top = Math.max(padding, Math.min(y, window.innerHeight - rect.height - padding));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = 'visible';

    this._contextMenuElement = menu;

    this._contextMenuOutsideHandler = (evt) => {
      if (!this._contextMenuElement) return;
      if (evt.type === 'click' && this._contextMenuElement.contains(evt.target)) return;
      this._closeContextMenu();
    };

    this._contextMenuEscHandler = (evt) => {
      if (evt.key === 'Escape') {
        evt.preventDefault();
        this._closeContextMenu();
      }
    };

    setTimeout(() => {
      document.addEventListener('click', this._contextMenuOutsideHandler);
      document.addEventListener('contextmenu', this._contextMenuOutsideHandler);
      document.addEventListener('keydown', this._contextMenuEscHandler);
    }, 0);
  }

  _closeContextMenu() {
    if (this._contextMenuElement) {
      this._contextMenuElement.remove();
      this._contextMenuElement = null;
    }
    if (this._contextMenuOutsideHandler) {
      document.removeEventListener('click', this._contextMenuOutsideHandler);
      document.removeEventListener('contextmenu', this._contextMenuOutsideHandler);
      this._contextMenuOutsideHandler = null;
    }
    if (this._contextMenuEscHandler) {
      document.removeEventListener('keydown', this._contextMenuEscHandler);
      this._contextMenuEscHandler = null;
    }
  }


  /**
   * Seleciona emoção pelo estado
   */
  _selectEmotionByState(state) {
    const charId = this.uiState.emotionPicker.characterId;
    const character = Store.characters.get(charId);

    if (character) {
      TomSocketHandler.emitUpdateEmotion(charId, state);
      ui.notifications.info(`Updated ${character.name} to ${state}`);
    }

    this.uiState.emotionPicker.open = false;
    this.uiState.keyboardFocusIndex = -1;
    this.render();
  }

  /**
   * Ordena os itens baseado nas configurações atuais
   */
  _sortItems(items, type = 'scenes') {
    const { sortBy, sortAscending } = this.uiState;

    // Custom order - use Store's saved order
    if (sortBy === 'custom') {
      return Store.applyCustomOrder(items, type);
    }

    const sorted = [...items].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          // Case-insensitive comparison
          comparison = (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
          break;
        case 'created':
          // Mais recente primeiro quando descending
          comparison = (a.createdAt || 0) - (b.createdAt || 0);
          break;
        case 'lastUsed':
          // Mais recente primeiro quando descending, null vai pro final
          const aLast = a.lastUsed || 0;
          const bLast = b.lastUsed || 0;
          comparison = aLast - bLast;
          break;
        case 'playCount':
          // Mais usado primeiro quando descending
          comparison = (a.playCount || 0) - (b.playCount || 0);
          break;
        default:
          comparison = 0;
      }

      return sortAscending ? comparison : -comparison;
    });

    return sorted;
  }

  /**
   * Retorna o label para o tipo de ordenação atual
   */
  _getSortLabel() {
    const labels = {
      name: 'Name',
      created: 'Date',
      lastUsed: 'Recent',
      playCount: 'Popular',
      custom: 'Custom'
    };
    return labels[this.uiState.sortBy] || 'Sort';
  }

  /**
   * Aplica highlight de busca no texto
   */
  _highlightSearch(text, query) {
    if (!query || !text) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<span class="es-highlight">$1</span>');
  }

  async _prepareContext(options) {
    const activeTab = this.uiState.currentView.startsWith('scenes') ? 'scenes' : 'characters';
    const itemType = activeTab === 'scenes' ? 'scene' : 'character';
    const isFavorites = this.uiState.currentView.includes('favorites');
    const isSearching = this.uiState.searchQuery.length > 0;
    const hasTagFilters = this.uiState.activeTags.size > 0 || this.uiState.excludedTags.size > 0;

    // Get folders for current type and current parent
    let folders = [];
    if (!isFavorites && !isSearching && !hasTagFilters) {
      folders = Store.getFolders(itemType, this.uiState.currentFolderId)
        .map(f => ({
          ...f.toJSON(),
          itemCount: Store.getItemsInFolder(itemType, f.id).length,
          subfolderCount: Store.getFolders(itemType, f.id).length
        }));
      // Sort folders by name
      folders.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    }

    // Get items
    let items = [];
    if (activeTab === 'scenes') {
      items = Store.getScenes({
        search: this.uiState.searchQuery,
        favorite: isFavorites,
        tags: Array.from(this.uiState.activeTags),
        excludedTags: Array.from(this.uiState.excludedTags)
      });
    } else {
      items = Store.getCharacters({
        search: this.uiState.searchQuery,
        favorite: isFavorites,
        tags: Array.from(this.uiState.activeTags),
        excludedTags: Array.from(this.uiState.excludedTags)
      });
    }

    // Filter items by current folder (only when not searching/filtering)
    if (!isSearching && !hasTagFilters && !isFavorites) {
      items = items.filter(i => i.folder === this.uiState.currentFolderId);
    }

    // Transform for Handlebars (if needed, or use models directly)
    items = items.map(i => {
      const folder = i.folder ? Store.folders.get(i.folder) : null;
      return {
        ...i.toJSON(),
        thumbnail: i.thumbnail,
        image: i.image,
        folderName: folder ? folder.name : ''
      };
    });

    // Aplicar ordenação
    items = this._sortItems(items, activeTab);

    // Build folder path for breadcrumbs
    const folderPath = this.uiState.currentFolderId
      ? Store.getFolderPath(this.uiState.currentFolderId).map(f => f.toJSON())
      : [];
    const currentFolder = this.uiState.currentFolderId
      ? Store.folders.get(this.uiState.currentFolderId)?.toJSON()
      : null;

    // Encontrar selectedItem diretamente do Store para garantir dados atualizados
    let selectedItem = null;
    if (this.uiState.selectedId) {
      if (this.uiState.currentView.startsWith('scenes')) {
        const scene = Store.scenes.get(this.uiState.selectedId);
        if (scene) {
          // Atualizar imagens do cast com estado atual
          const updatedCast = scene.cast.map(c => {
            const char = Store.characters.get(c.id);
            return char ? { id: char.id, name: char.name, image: char.image } : c;
          });
          selectedItem = { ...scene.toJSON(), cast: updatedCast, image: scene.image, thumbnail: scene.thumbnail };
        }
      } else {
        const char = Store.characters.get(this.uiState.selectedId);
        if (char) {
          selectedItem = { ...char.toJSON(), image: char.image, thumbnail: char.thumbnail };
        }
      }
    }

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
          emotionSearchQuery: this.uiState.emotionSearchQuery || ''
        };
      }
    }

    // Contadores para a sidebar
    const counts = {
      scenesAll: Store.scenes.size,
      scenesFavorites: Store.scenes.filter(s => s.favorite).length,
      charactersAll: Store.characters.size,
      charactersFavorites: Store.characters.filter(c => c.favorite).length
    };

    // Verificar se há filtros ativos
    const hasFilters = this.uiState.searchQuery.length > 0 ||
      this.uiState.activeTags.size > 0 ||
      this.uiState.excludedTags.size > 0;

    // Floating Cast Strip - mostra quando há uma cena sendo editada e não estamos na aba de scenes com inspector aberto
    let floatingCastStrip = null;
    if (this.uiState.editingSceneId) {
      const editingScene = Store.scenes.get(this.uiState.editingSceneId);
      if (editingScene) {
        // Só mostrar floating strip se NÃO estamos vendo o inspector dessa mesma cena
        const showingInspectorForSameScene = this.uiState.inspectorOpen &&
          this.uiState.selectedId === this.uiState.editingSceneId &&
          activeTab === 'scenes';
        if (!showingInspectorForSameScene) {
          const updatedCast = editingScene.cast.map(c => {
            const char = Store.characters.get(c.id);
            return char ? { id: char.id, name: char.name, image: char.image } : c;
          });
          floatingCastStrip = {
            sceneId: editingScene.id,
            sceneName: editingScene.name,
            cast: updatedCast
          };
        }
      }
    }

    // Prepare slideshows data for sidebar
    const slideshowProgress = Store.getSlideshowProgress();
    const slideshows = Store.getSlideshows().map(s => ({
      id: s.id,
      name: s.name,
      sceneCount: s.scenes.length,
      isPlaying: slideshowProgress?.slideshowId === s.id
    }));

    // Get sequence progress if a sequence is active
    const sequenceProgress = Store.getSequenceProgress();

    // Cast-Only Mode data
    const castOnlyProgress = Store.getCastOnlyProgress();
    const castOnlyCharacters = Store.characters.contents.map(c => ({
      id: c.id,
      name: c.name,
      image: c.image,
      selected: this.uiState.castOnlySelectedChars.has(c.id)
    })).sort((a, b) => a.name.localeCompare(b.name));

    return {
      currentView: this.uiState.currentView,
      searchQuery: this.uiState.searchQuery,
      items: items,
      selectedId: this.uiState.selectedId,
      selectedItem: selectedItem,
      inspectorOpen: this.uiState.inspectorOpen && !!selectedItem,
      activeTab: activeTab,
      activeTags: Array.from(this.uiState.activeTags),
      excludedTags: Array.from(this.uiState.excludedTags),
      activeSceneId: Store.activeSceneId,
      emotionPicker: pickerContext,
      viewMode: this.uiState.viewMode,
      counts: counts,
      hasFilters: hasFilters,
      // Novas variáveis para ordenação e busca
      sortBy: this.uiState.sortBy,
      sortAscending: this.uiState.sortAscending,
      sortMenuOpen: this.uiState.sortMenuOpen,
      sortLabel: this._getSortLabel(),
      isSearching: this.uiState.isSearching,
      // Folder navigation
      folders: folders,
      currentFolderId: this.uiState.currentFolderId,
      currentFolder: currentFolder,
      folderPath: folderPath,
      isInFolder: this.uiState.currentFolderId !== null,
      isFavorites: isFavorites,
      // Floating Cast Strip
      floatingCastStrip: floatingCastStrip,
      // Slideshows
      slideshows: slideshows,
      slideshowProgress: slideshowProgress,
      // Scene Sequence
      sequenceProgress: sequenceProgress,
      // Cast-Only Mode
      castOnlyProgress: castOnlyProgress,
      castOnlyCharacters: castOnlyCharacters,
      castOnlySelectedCount: this.uiState.castOnlySelectedChars.size
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     ACTIONS
     ═══════════════════════════════════════════════════════════════ */

  static _onViewChange(event, target) {
    this.uiState.currentView = target.dataset.view;
    // Reset folder navigation when changing views
    this.uiState.currentFolderId = null;
    this.uiState.selectedId = null;
    this.uiState.inspectorOpen = false;
    this.render();
  }

  static _onSelect(event, target) {
    // If clicking a tag, don't select the card
    if (event.target.closest('.tom-tag-badge')) return;

    const id = target.dataset.id;
    const type = target.dataset.type;

    if (this.uiState.selectedId === id) {
      // Toggle inspector if clicking same item
      this.uiState.inspectorOpen = !this.uiState.inspectorOpen;
    } else {
      this.uiState.selectedId = id;
      this.uiState.inspectorOpen = true;
    }

    // Se é uma cena, setar como cena em edição para o floating cast strip
    if (type === 'scene') {
      this.uiState.editingSceneId = id;
    }

    this.render();
  }

  static _onCloseInspector() {
    this.uiState.inspectorOpen = false;
    this.render();
  }

  // --- TAG FILTERS ---

  static _onFilterTag(event, target) {
    const tag = target.dataset.tag;
    if (event.shiftKey) {
      // Shift+Click to Exclude
      this.uiState.excludedTags.add(tag);
      this.uiState.activeTags.delete(tag); // Can't be both
    } else {
      // Click to Include
      this.uiState.activeTags.add(tag);
      this.uiState.excludedTags.delete(tag);
    }
    this.render();
  }

  static _onRemoveFilter(event, target) {
    const tag = target.dataset.tag;
    const type = target.dataset.type; // 'include' or 'exclude'

    if (type === 'exclude') {
      this.uiState.excludedTags.delete(tag);
    } else {
      this.uiState.activeTags.delete(tag);
    }
    this.render();
  }

  static _onExcludeTag(event, target) {
    const tag = target.dataset.tag;
    this.uiState.excludedTags.add(tag);
    this.uiState.activeTags.delete(tag);
    this.render();
  }

  static _onBroadcast(event, target) {
    // Permitir broadcast direto do card ou do inspector
    const card = target.closest('.tom-card');
    const sceneId = card ? card.dataset.id : this.uiState.selectedId;

    if (sceneId) {
      Store.setActiveScene(sceneId);
      TomSocketHandler.emitBroadcastScene(sceneId);
      ui.notifications.info("Broadcasting Scene...");
      this.render();
    }
  }

  static _onStopBroadcast(event, target) {
    Store.clearActiveScene();
    TomSocketHandler.emitStopBroadcast();
    ui.notifications.info("Broadcast Stopped.");
    this.render();
  }


  static async _onAddCast(event, target) {
    const sceneId = this.uiState.selectedId;
    const scene = Store.scenes.get(sceneId);
    if (!scene) return;

    // Get available characters not already in cast
    const currentCastIds = new Set(scene.cast.map(c => c.id));
    const availableChars = Store.characters.contents.filter(c => !currentCastIds.has(c.id));

    if (availableChars.length === 0) {
      ui.notifications.warn("No available characters to add.");
      return;
    }

    // Simple Dialog to select character
    const content = `
      <form>
        <div class="form-group">
          <label>Select Character</label>
          <select name="characterId">
            ${availableChars.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
          </select>
        </div>
      </form>
    `;

    new Dialog({
      title: "Add to Cast",
      content: content,
      buttons: {
        add: {
          label: "Add",
          callback: (html) => {
            const charId = html.find('[name="characterId"]').val();
            Store.addCastMember(sceneId, charId);
            this.render();
          }
        }
      }
    }).render(true);
  }

  static _onCastClick(event, target) {
    const charId = target.dataset.characterId;
    const rect = target.getBoundingClientRect();

    // Calculate position relative to the window
    // We want it above the cast member, but ensure it stays within viewport
    const PICKER_WIDTH = 320;  // Approximate picker width
    const PICKER_HEIGHT = 400; // Approximate picker height
    const MARGIN = 20;         // Margin from screen edges

    let x = rect.left + (rect.width / 2);
    let y = rect.top - 10; // Default: above the cast member

    // Adjust horizontal position to stay within viewport
    const viewportWidth = window.innerWidth;
    if (x - (PICKER_WIDTH / 2) < MARGIN) {
      x = MARGIN + (PICKER_WIDTH / 2);
    } else if (x + (PICKER_WIDTH / 2) > viewportWidth - MARGIN) {
      x = viewportWidth - MARGIN - (PICKER_WIDTH / 2);
    }

    // Adjust vertical position - show below if not enough space above
    if (y - PICKER_HEIGHT < MARGIN) {
      y = rect.bottom + 10; // Show below instead
    }

    this.uiState.emotionPicker = {
      open: true,
      characterId: charId,
      x: x,
      y: y
    };
    this.render();
  }

  static _onClosePicker(event, target) {
    this.uiState.emotionPicker.open = false;
    this.render();
  }

  static _onRemoveCast(event, target) {
    const charId = this.uiState.emotionPicker.characterId;
    // Use editingSceneId if available (from floating cast), otherwise selectedId
    const sceneId = this.uiState.editingSceneId || this.uiState.selectedId;

    if (charId && sceneId) {
      Store.removeCastMember(sceneId, charId);
      this.uiState.emotionPicker.open = false;
      this.render();
      ui.notifications.info("Removed character from scene.");
    }
  }

  static _onSelectEmotion(event, target) {
    const charId = this.uiState.emotionPicker.characterId;
    const state = target.dataset.state;
    const character = Store.characters.get(charId);

    if (character) {
      // Broadcast if this character is in the active scene
      // Or just always broadcast update if we want "live" updates even if scene isn't full screen?
      // Let's broadcast.
      TomSocketHandler.emitUpdateEmotion(charId, state);

      ui.notifications.info(`Updated ${character.name} to ${state}`);
    }

    this.uiState.emotionPicker.open = false;
    this.render();
  }

  static _onChangeEmotion(event, target) {
    // Legacy cycle method - keeping it as fallback or double click?
    // For now, let's redirect to picker or keep it for quick cycle if user prefers.
    // The user asked for "agile" selection, so picker is better.
    // But let's keep this for now if they use the old action.
    const charId = target.dataset.characterId;
    const character = Store.characters.get(charId);

    if (!character) return;

    // Cycle through states
    const states = Object.keys(character.states);
    const currentIndex = states.indexOf(character.currentState);
    const nextIndex = (currentIndex + 1) % states.length;
    const nextState = states[nextIndex];

    // Broadcast Update (handles local update and save)
    TomSocketHandler.emitUpdateEmotion(charId, nextState);

    // Refresh UI to show new state
    this.render();

    ui.notifications.info(`Updated ${character.name} to ${nextState}`);
  }

  static async _onCreate(event, target) {
    // Determine type based on active tab (which we can infer from currentView)
    const isScene = this.uiState.currentView.startsWith('scenes');

    if (isScene) {
      // Open Scene Editor in create mode (no sceneId = create mode)
      new TomSceneEditor().render(true);
    } else {
      // Create Character Logic
      new TomSmartCreator().render(true);
    }
  }

  static async _onEdit(event, target) {
    const id = target.closest('.tom-card').dataset.id;
    const type = target.closest('.tom-card').dataset.type;

    if (type === 'character') {
      new TomCharacterEditor(id).render(true);
      return;
    }

    // Scene Edit Logic
    if (type === 'scene') {
      new TomSceneEditor(id).render(true);
      return;
    }
  }

  static async _onDelete(event, target) {
    const card = target.closest('.tom-card');
    const id = card.dataset.id;
    const type = card.dataset.type;
    const item = type === 'scene' ? Store.scenes.get(id) : Store.characters.get(id);
    const itemName = item?.name || 'this item';
    const typeLabel = type === 'scene' ? 'scene' : 'character';

    // Confirmation dialog
    const confirmed = await Dialog.confirm({
      title: `Delete ${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)}`,
      content: `<p>Are you sure you want to delete <strong>${itemName}</strong>?</p><p>This action cannot be undone.</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    if (!confirmed) return;

    // Delete the item
    Store.deleteItem(id, type);

    // Clear selection if we deleted the selected item
    if (this.uiState.selectedId === id) {
      this.uiState.selectedId = null;
      this.uiState.inspectorOpen = false;
    }

    ui.notifications.info(`${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} "${itemName}" deleted.`);
    this.render();
  }

  static _onToggleView(event, target) {
    this.uiState.viewMode = this.uiState.viewMode === 'grid' ? 'list' : 'grid';
    this.render();
  }

  static _onQuickAdd(event, target) {
    const card = target.closest('.tom-card');
    const charId = card ? card.dataset.id : this.uiState.selectedId;
    const sceneId = Store.activeSceneId;

    if (!sceneId) {
      ui.notifications.warn("No active scene to add character to. Please broadcast a scene first.");
      return;
    }

    if (!charId) {
      ui.notifications.warn("No character selected.");
      return;
    }

    Store.addCastMember(sceneId, charId);
    ui.notifications.info("Character added to active scene.");
  }

  // --- FAVORITES ---

  static _onToggleFavorite(event, target) {
    event.stopPropagation(); // Prevent card selection

    const id = target.dataset.id;
    const type = target.dataset.type;

    if (type === 'scene') {
      const scene = Store.scenes.get(id);
      if (scene) {
        scene.favorite = !scene.favorite;
        Store.saveData();
        const action = scene.favorite ? 'added to' : 'removed from';
        ui.notifications.info(`Scene ${action} favorites.`);
      }
    } else {
      const character = Store.characters.get(id);
      if (character) {
        character.favorite = !character.favorite;
        Store.saveData();
        const action = character.favorite ? 'added to' : 'removed from';
        ui.notifications.info(`Character ${action} favorites.`);
      }
    }

    this.render();
  }

  /**
   * Toggle favorite for the currently selected item (used by keyboard shortcut)
   */
  static _toggleSelectedFavorite() {
    if (!this.uiState.selectedId) return;

    const isScene = this.uiState.currentView.startsWith('scenes');
    const item = isScene
      ? Store.scenes.get(this.uiState.selectedId)
      : Store.characters.get(this.uiState.selectedId);

    if (item) {
      item.favorite = !item.favorite;
      Store.saveData();
      const type = isScene ? 'Scene' : 'Character';
      const action = item.favorite ? 'added to' : 'removed from';
      ui.notifications.info(`${type} ${action} favorites.`);
      this.render();
    }
  }

  // --- ORDENAÇÃO ---

  static _onToggleSort(event, target) {
    this.uiState.sortMenuOpen = !this.uiState.sortMenuOpen;
    this.render();
  }

  static _onSort(event, target) {
    const sortBy = target.dataset.sort;
    this.uiState.sortBy = sortBy;
    this.uiState.sortMenuOpen = false;
    this.render();
  }

  static _onToggleSortDirection(event, target) {
    this.uiState.sortAscending = !this.uiState.sortAscending;
    this.uiState.sortMenuOpen = false;
    this.render();
  }

  static _onClearSearch(event, target) {
    this.uiState.searchQuery = '';
    this.uiState.isSearching = false;
    this.render();
  }

  // --- FOLDER NAVIGATION ---

  static _onOpenFolder(event, target) {
    const folderId = target.dataset.folderId;
    this.uiState.currentFolderId = folderId;
    this.uiState.selectedId = null;
    this.uiState.inspectorOpen = false;
    this.render();
  }

  static _onNavigateUp(event, target) {
    const currentFolder = Store.folders.get(this.uiState.currentFolderId);
    this.uiState.currentFolderId = currentFolder?.parent || null;
    this.uiState.selectedId = null;
    this.uiState.inspectorOpen = false;
    this.render();
  }

  static async _onCreateFolder(event, target) {
    const activeTab = this.uiState.currentView.startsWith('scenes') ? 'scenes' : 'characters';
    const itemType = activeTab === 'scenes' ? 'scene' : 'character';

    const content = `
      <form>
        <div class="form-group">
          <label>Folder Name</label>
          <input type="text" name="name" value="New Folder" autofocus>
        </div>
      </form>
    `;

    new Dialog({
      title: "Create Folder",
      content: content,
      buttons: {
        create: {
          label: "Create",
          callback: (html) => {
            const name = html.find('[name="name"]').val() || "New Folder";
            Store.createFolder({
              name: name,
              type: itemType,
              parent: this.uiState.currentFolderId
            });
            this.render();
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "create"
    }).render(true);
  }

  static _onToggleFolder(event, target) {
    event.stopPropagation();
    const folderId = target.closest('[data-folder-id]').dataset.folderId;
    Store.toggleFolderExpanded(folderId);
    this.render();
  }

  static async _onDeleteFolder(event, target) {
    event.stopPropagation();
    const folderId = target.closest('[data-folder-id]').dataset.folderId;
    const folder = Store.folders.get(folderId);
    if (!folder) return;

    new Dialog({
      title: `Delete "${folder.name}"?`,
      content: `
        <p>What would you like to do with the contents of this folder?</p>
        <p><small>This action cannot be undone.</small></p>
      `,
      buttons: {
        move: {
          label: "Move to Root",
          callback: () => {
            Store.deleteFolder(folderId, false);
            if (this.uiState.currentFolderId === folderId) {
              this.uiState.currentFolderId = null;
            }
            this.render();
          }
        },
        delete: {
          label: "Delete All",
          callback: () => {
            Store.deleteFolder(folderId, true);
            if (this.uiState.currentFolderId === folderId) {
              this.uiState.currentFolderId = null;
            }
            this.render();
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "move"
    }).render(true);
  }

  static async _onRenameFolder(event, target) {
    event.stopPropagation();
    const folderId = target.closest('[data-folder-id]').dataset.folderId;
    const folder = Store.folders.get(folderId);
    if (!folder) return;

    const content = `
      <form>
        <div class="form-group">
          <label>Folder Name</label>
          <input type="text" name="name" value="${folder.name}" autofocus>
        </div>
      </form>
    `;

    new Dialog({
      title: "Rename Folder",
      content: content,
      buttons: {
        rename: {
          label: "Rename",
          callback: (html) => {
            const name = html.find('[name="name"]').val() || folder.name;
            Store.updateFolder(folderId, { name });
            this.render();
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "rename"
    }).render(true);
  }

  // --- FLOATING CAST STRIP ---

  static _onGoToScene(event, target) {
    const sceneId = target.dataset.sceneId || this.uiState.editingSceneId;
    if (sceneId) {
      this.uiState.currentView = 'scenes-all';
      this.uiState.selectedId = sceneId;
      this.uiState.inspectorOpen = true;
      this.uiState.currentFolderId = null;
      this.render();
    }
  }

  static _onCloseFloatingCast(event, target) {
    this.uiState.editingSceneId = null;
    this.render();
  }

  static async _onFloatingAddCast(event, target) {
    const sceneId = this.uiState.editingSceneId;
    const scene = Store.scenes.get(sceneId);
    if (!scene) return;

    // Get available characters not already in cast
    const currentCastIds = new Set(scene.cast.map(c => c.id));
    const availableChars = Store.characters.contents.filter(c => !currentCastIds.has(c.id));

    if (availableChars.length === 0) {
      ui.notifications.warn("No available characters to add.");
      return;
    }

    // Simple Dialog to select character
    const content = `
      <form>
        <div class="form-group">
          <label>Select Character</label>
          <select name="characterId">
            ${availableChars.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
          </select>
        </div>
      </form>
    `;

    new Dialog({
      title: "Add to Cast",
      content: content,
      buttons: {
        add: {
          label: "Add",
          callback: (html) => {
            const charId = html.find('[name="characterId"]').val();
            Store.addCastMember(sceneId, charId);
            this.render();
          }
        }
      }
    }).render(true);
  }

  // --- EMOTION PICKER ---

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

  static _onSearchEmotions(event, target) {
    // This is handled in _onRender via input listener
  }

  /* ═══════════════════════════════════════════════════════════════
     SLIDESHOW ACTIONS
     ═══════════════════════════════════════════════════════════════ */

  static _onCreateSlideshow(event, target) {
    new TomSlideshowEditor().render(true);
  }

  static _onEditSlideshow(event, target) {
    const slideshowId = target.dataset.slideshowId;
    if (slideshowId) {
      new TomSlideshowEditor(slideshowId).render(true);
    }
  }

  static _onPlaySlideshow(event, target) {
    const slideshowId = target.dataset.slideshowId;
    if (slideshowId) {
      Store.startSlideshow(slideshowId);
    }
  }

  static async _onDeleteSlideshow(event, target) {
    const slideshowId = target.dataset.slideshowId;
    const slideshow = Store.slideshows.get(slideshowId);
    if (!slideshow) return;

    const confirmed = await Dialog.confirm({
      title: 'Delete Slideshow',
      content: `<p>Are you sure you want to delete the slideshow "${slideshow.name}"?</p>`,
      yes: () => true,
      no: () => false
    });

    if (confirmed) {
      Store.deleteSlideshow(slideshowId);
      this.render();
    }
  }

  static _onSlideshowPause(event, target) {
    Store.pauseSlideshow();
    this.render();
  }

  static _onSlideshowResume(event, target) {
    Store.resumeSlideshow();
    this.render();
  }

  static _onSlideshowNext(event, target) {
    Store.nextScene();
  }

  static _onSlideshowPrev(event, target) {
    Store.previousScene();
  }

  static _onSlideshowStop(event, target) {
    Store.stopSlideshow();
    this.render();
  }

  /* ═══════════════════════════════════════════════════════════════
     SCENE SEQUENCE ACTIONS
     ═══════════════════════════════════════════════════════════════ */

  static _onConvertToSequence(event, target) {
    const sceneId = this.uiState.selectedId;
    const scene = Store.scenes.get(sceneId);
    if (!scene) return;

    scene.convertToSequence();
    Store.saveData();
    this.render();
    ui.notifications.info(`"${scene.name}" converted to a sequence. Add more backgrounds!`);
  }

  static _onRemoveSequence(event, target) {
    const sceneId = this.uiState.selectedId;
    const scene = Store.scenes.get(sceneId);
    if (!scene) return;

    Dialog.confirm({
      title: 'Convert to Regular Scene',
      content: '<p>This will convert the sequence back to a regular scene, keeping only the first background. Continue?</p>',
      yes: () => {
        // Stop sequence if it's playing
        if (Store.sequenceState.isActive && Store.sequenceState.sceneId === sceneId) {
          Store.stopSequence();
        }
        scene.convertToRegular();
        Store.saveData();
        this.render();
        ui.notifications.info(`"${scene.name}" converted back to regular scene.`);
      }
    });
  }

  static async _onAddSequenceBg(event, target) {
    const sceneId = this.uiState.selectedId;
    const scene = Store.scenes.get(sceneId);
    if (!scene) return;

    const fp = new FilePicker({
      type: 'imagevideo',
      current: scene.sequenceBackgrounds.length > 0
        ? scene.sequenceBackgrounds[scene.sequenceBackgrounds.length - 1].path
        : scene.background,
      callback: (path) => {
        const isVideo = path.match(/\.(mp4|webm|ogg)$/i);
        scene.addSequenceBackground(path, isVideo ? 'video' : 'image');
        Store.saveData();
        this.render();
      }
    });
    fp.browse();
  }

  static _onRemoveSequenceBg(event, target) {
    event.stopPropagation();
    const bgId = target.dataset.bgId;
    const sceneId = this.uiState.selectedId;
    const scene = Store.scenes.get(sceneId);
    if (!scene || !bgId) return;

    // Don't allow removing last background
    if (scene.sequenceBackgrounds.length <= 1) {
      ui.notifications.warn("Cannot remove the last background. Convert to regular scene instead.");
      return;
    }

    scene.removeSequenceBackground(bgId);
    Store.saveData();
    this.render();
  }

  static _onSequenceGoto(event, target) {
    const index = parseInt(target.dataset.index, 10);
    if (isNaN(index)) return;

    // Only navigate if sequence is active
    if (Store.sequenceState.isActive) {
      Store.sequenceGoTo(index);
    }
  }

  static _onBroadcastSequence(event, target) {
    const sceneId = this.uiState.selectedId;
    if (!sceneId) return;

    Store.startSequence(sceneId);
    this.render();
  }

  static _onSequencePrev(event, target) {
    Store.sequencePrevious();
    this.render();
  }

  static _onSequenceNext(event, target) {
    Store.sequenceNext();
    this.render();
  }

  /* ═══════════════════════════════════════════════════════════════
     CAST-ONLY MODE ACTIONS
     ═══════════════════════════════════════════════════════════════ */

  static _onToggleCastOnlyChar(event, target) {
    const charId = target.dataset.characterId;
    if (this.uiState.castOnlySelectedChars.has(charId)) {
      this.uiState.castOnlySelectedChars.delete(charId);
    } else {
      this.uiState.castOnlySelectedChars.add(charId);
    }

    // If cast-only is already active, update in real-time
    if (Store.castOnlyState.isActive) {
      const characterIds = Array.from(this.uiState.castOnlySelectedChars);
      if (characterIds.length === 0) {
        Store.stopCastOnly();
      } else {
        Store.castOnlyState.characterIds = characterIds;
        TomSocketHandler.emitCastOnlyUpdate({ characterIds });
      }
    }

    this.render();
  }

  static _onCastOnlyStart(event, target) {
    const characterIds = Array.from(this.uiState.castOnlySelectedChars);
    if (characterIds.length === 0) {
      ui.notifications.warn("Select at least one character for Cast-Only mode");
      return;
    }

    Store.startCastOnly(characterIds);
    ui.notifications.info("Cast-Only Mode started");
    this.render();
  }

  static _onCastOnlyStop(event, target) {
    Store.stopCastOnly();
    ui.notifications.info("Cast-Only Mode stopped");
    this.render();
  }

  static _onCastOnlyLayout(event, target) {
    const layoutKey = target.dataset.layout;
    if (!layoutKey) return;

    const currentLayout = Store.castOnlyState.layoutSettings;
    let newLayout = { ...currentLayout };

    // Handle preset change
    if (target.dataset.preset) {
      newLayout.preset = target.dataset.preset;
    }

    // Handle size change
    if (target.dataset.size) {
      newLayout.size = target.dataset.size;
    }

    Store.updateCastOnlyLayout(newLayout);
    this.render();
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════════ */

  static show() {
    if (!this._instance) {
      this._instance = new TomGMPanel();
    }
    this._instance.render(true);
  }
}
