export class TomFolderModel {
  constructor(data = {}) {
    this.id = data.id || foundry.utils.randomID();
    this.name = data.name || 'New Folder';
    this.type = data.type || 'scene'; // 'scene' or 'character'
    this.parent = data.parent || null; // ID of parent folder, null = root
    this.color = data.color || null;
    this.sorting = data.sorting || 'a'; // 'a' = alphabetical, 'm' = manual
    this.sort = data.sort || 0; // Manual sort order
    this.expanded = data.expanded !== false; // Default expanded
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      parent: this.parent,
      color: this.color,
      sorting: this.sorting,
      sort: this.sort,
      expanded: this.expanded
    };
  }
}
