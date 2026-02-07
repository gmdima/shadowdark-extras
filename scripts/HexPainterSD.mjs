const MODULE_ID = "shadowdark-extras";
const TILE_FOLDER = `modules/${MODULE_ID}/assets/tiles`;
const HEX_TILE_W = 296;
const HEX_TILE_H = 256;
const SCENE_BUFFER = 768;

let _tiles = null;
let _chosenTiles = new Set();
let _searchFilter = "";
let _waterEffect = false;
let _windEffect = false;
let _fogAnimation = false;
let _brushActive = false;
let _lastCell = null;
let _paintEnabled = false;
let _isPainting = false;

let _mapColumns = 15;
let _mapRows = 15;

export async function loadTileAssets() {
    if (_tiles) return;

    try {
        const listing = await FilePicker.browse("data", TILE_FOLDER);
        const pngFiles = (listing.files || []).filter(f => f.endsWith(".png"));

        _tiles = pngFiles
            .map(path => {
                const filename = path.split("/").pop().replace(".png", "");
                const raw = filename.replace(/^hex-tile-/, "");
                return {
                    key: raw,
                    label: _formatLabel(raw),
                    path
                };
            })
            .sort((a, b) => a.key.localeCompare(b.key));

        if (_tiles.length && _chosenTiles.size === 0) {
            _chosenTiles.add(_tiles[0].path);
        }
    } catch (err) {
        console.error(`${MODULE_ID} | Failed to discover hex tiles:`, err);
        _tiles = [];
    }
}

export function getHexPainterData() {
    if (!_tiles) return { hexTiles: [], hexColumns: _mapColumns, hexRows: _mapRows, hexSearchFilter: "" };

    const filteredTiles = getFilteredTiles();
    const hexTiles = filteredTiles.map(t => ({
        key: t.key,
        label: t.label,
        path: t.path,
        active: _chosenTiles.has(t.path)
    }));

    return { hexTiles, hexColumns: _mapColumns, hexRows: _mapRows, hexSearchFilter: _searchFilter };
}

export function toggleTileSelection(tilePath) {
    if (_chosenTiles.has(tilePath)) {
        _chosenTiles.delete(tilePath);
    } else {
        _chosenTiles.add(tilePath);
    }
}

export function setSearchFilter(term) {
    _searchFilter = term.toLowerCase();
}

export function getSearchFilter() {
    return _searchFilter;
}

export function getFilteredTiles() {
    if (!_tiles) return [];
    if (!_searchFilter) return _tiles;
    return _tiles.filter(t => t.label.toLowerCase().includes(_searchFilter));
}

export function isPainting() {
    return _isPainting;
}

export function toggleWaterEffect() {
    _waterEffect = !_waterEffect;
}

export function isWaterEffect() {
    return _waterEffect;
}

export function toggleWindEffect() {
    _windEffect = !_windEffect;
}

export function isWindEffect() {
    return _windEffect;
}

export function toggleFogAnimation() {
    _fogAnimation = !_fogAnimation;
}

export function isFogAnimation() {
    return _fogAnimation;
}

export function setMapDimension(axis, value) {
    const clamped = Math.max(5, Math.min(50, parseInt(value) || 15));
    if (axis === "columns") _mapColumns = clamped;
    if (axis === "rows") _mapRows = clamped;
}

export function getMapDimensions() {
    return { columns: _mapColumns, rows: _mapRows };
}

export async function formatActiveScene() {
    const scene = canvas.scene;
    if (!scene) {
        ui.notifications.error("SDX | No active scene to format.");
        return;
    }

    const pxW = Math.ceil(HEX_TILE_W * 0.75 * _mapColumns + HEX_TILE_W * 0.25) + SCENE_BUFFER;
    const pxH = (_mapRows * HEX_TILE_H) + Math.ceil(HEX_TILE_H / 2) + SCENE_BUFFER;

    const sceneData = {
        width: pxW,
        height: pxH,
        padding: 0,
        backgroundColor: "#3C3836",
        "grid.type": CONST.GRID_TYPES.HEXODDQ,
        "grid.size": HEX_TILE_H,
        "grid.distance": 6,
        "grid.units": "mi",
        "background.src": null
    };

    try {
        ui.notifications.info(`SDX | Formatting scene to ${_mapColumns}×${_mapRows} hexes…`);
        await scene.update(sceneData);

        let tries = 0;
        while (tries < 40) {
            const rect = canvas.dimensions.sceneRect || canvas.dimensions;
            if (Math.abs((rect.width || 0) - pxW) < 2) break;
            await new Promise(r => setTimeout(r, 120));
            tries++;
        }

        await scene.setFlag(MODULE_ID, "hexScene", true);
        ui.notifications.info("SDX | Scene formatted for hex painting.");
    } catch (err) {
        console.error(`${MODULE_ID} | Scene format failed:`, err);
        ui.notifications.error("SDX | Could not format the scene.");
    }
}

export function enablePainting() {
    _paintEnabled = true;
}

export function disablePainting() {
    _paintEnabled = false;
    _brushActive = false;
    _lastCell = null;
    _chosenTiles.clear();
}

export function bindCanvasEvents() {
    if (!canvas.stage) return;

    canvas.stage.off("mousedown", _onPointerDown);
    canvas.stage.off("mousemove", _onPointerMove);
    canvas.stage.off("mouseup", _onPointerUp);
    canvas.stage.off("mouseupoutside", _onPointerUp);

    canvas.stage.on("mousedown", _onPointerDown);
    canvas.stage.on("mousemove", _onPointerMove);
    canvas.stage.on("mouseup", _onPointerUp);
    canvas.stage.on("mouseupoutside", _onPointerUp);
}

function _isToolActive() {
    return _paintEnabled;
}

function _onPointerDown(ev) {
    if (!_isToolActive()) return;
    if (ev.data?.button !== undefined && ev.data.button !== 0) return;

    _brushActive = true;
    _isPainting = true;
    _lastCell = null;
    _stampAtPointer(ev);
}

function _onPointerMove(ev) {
    if (_brushActive) _stampAtPointer(ev);
}

function _onPointerUp() {
    _brushActive = false;
    _isPainting = false;
    _lastCell = null;
}

async function _stampAtPointer(ev) {
    if (!_isToolActive()) return;

    const pos = ev.data.getLocalPosition(canvas.stage);
    const cell = canvas.grid.getOffset(pos);
    const cellKey = `${cell.i}:${cell.j}`;

    if (cellKey === _lastCell) return;
    _lastCell = cellKey;

    const center = canvas.grid.getCenterPoint(cell);
    const verticalNudge = 0;

    const occupants = canvas.tiles.placeables.filter(t => {
        const cx = t.document.x + t.document.width / 2;
        const cy = t.document.y + t.document.height / 2;
        return Math.abs(cx - center.x) < 5 &&
               Math.abs(cy - (center.y - verticalNudge)) < 5;
    });

    const erasing = ev.data?.originalEvent?.shiftKey ?? false;
    if (erasing) {
        if (occupants.length) {
            await canvas.scene.deleteEmbeddedDocuments("Tile", occupants.map(t => t.id));
        }
        return;
    }

    if (_chosenTiles.size === 0) {
        ui.notifications.warn("SDX | Pick at least one tile first.");
        _brushActive = false;
        return;
    }

    const selectedTiles = Array.from(_chosenTiles);
    const chosenTile = selectedTiles[Math.floor(Math.random() * selectedTiles.length)];

    if (occupants.length) {
        await canvas.scene.deleteEmbeddedDocuments("Tile", occupants.map(t => t.id));
    }

    const tw = HEX_TILE_W;
    const th = HEX_TILE_H;

    const tileData = {
        texture: { src: chosenTile },
        x: center.x - tw / 2,
        y: center.y - th / 2 - verticalNudge,
        width: tw,
        height: th,
        sort: Math.floor(center.y),
        flags: {
            [MODULE_ID]: {
                painted: true
            }
        }
    };

    const createdTiles = await canvas.scene.createEmbeddedDocuments("Tile", [tileData]);

    if (window.TokenMagic && createdTiles.length > 0) {
        const tileId = createdTiles[0].id;
        const tileObj = canvas.tiles.placeables.find(t => t.document.id === tileId);
        if (tileObj) {
            const allParams = [];

            if (_waterEffect) {
                allParams.push(
                    {
                        "filterType": "distortion",
                        "filterId": "Sea",
                        "maskPath": "modules/tokenmagic/fx/assets/distortion-1.png",
                        "maskSpriteScaleX": 5,
                        "maskSpriteScaleY": 5,
                        "padding": 20,
                        "animated": {
                            "maskSpriteX": {
                                "active": true,
                                "speed": 0.05,
                                "animType": "move"
                            },
                            "maskSpriteY": {
                                "active": true,
                                "speed": 0.07,
                                "animType": "move"
                            }
                        },
                        "rank": 10003,
                        "enabled": true
                    },
                    {
                        "filterType": "adjustment",
                        "filterId": "Sea",
                        "saturation": 0.65,
                        "brightness": 0.8,
                        "contrast": 2,
                        "gamma": 0.42,
                        "red": 1,
                        "green": 1,
                        "blue": 1,
                        "alpha": 0.74,
                        "animated": {},
                        "rank": 10005,
                        "enabled": true
                    }
                );
            }

            if (_windEffect) {
                allParams.push(
                    {
                        "filterType": "distortion",
                        "filterId": "Wind",
                        "maskPath": "modules/tokenmagic/fx/assets/distortion-1.png",
                        "maskSpriteScaleX": 0.3,
                        "maskSpriteScaleY": 0,
                        "padding": 177,
                        "animated": {
                            "maskSpriteX": {
                                "active": true,
                                "speed": 0.05,
                                "animType": "move"
                            },
                            "maskSpriteY": {
                                "active": true,
                                "speed": 0.07,
                                "animType": "move"
                            },
                            "maskSpriteScaleX": {
                                "active": true,
                                "animType": "sinOscillation",
                                "speed": 0.0000025,
                                "val1": 2.6,
                                "val2": 0.9,
                                "loopDuration": 3000,
                                "syncShift": 0,
                                "loops": null,
                                "chaosFactor": 0.23,
                                "clockWise": true,
                                "wantInteger": false
                            }
                        },
                        "rank": 10000,
                        "enabled": true
                    }
                );
            }

            if (_fogAnimation) {
                allParams.push(
                    {
                        "filterType": "smoke",
                        "filterId": "Fog",
                        "color": 16777215,
                        "time": 0,
                        "blend": 2,
                        "dimX": 0.01,
                        "dimY": 1,
                        "animated": {
                            "time": {
                                "active": true,
                                "speed": 0.001,
                                "animType": "move",
                                "val1": 24136.1,
                                "val2": 10186.3,
                                "loopDuration": 32740,
                                "syncShift": 0.76,
                                "loops": null
                            },
                            "dimX": {
                                "active": true,
                                "animType": "cosOscillation",
                                "speed": 0.0000025,
                                "val1": -0.03,
                                "val2": 0.03,
                                "loopDuration": 5000,
                                "syncShift": 0,
                                "loops": null
                            }
                        },
                        "rank": 10002,
                        "enabled": true
                    }
                );
            }

            if (allParams.length > 0) {
                try {
                    await TokenMagic.addUpdateFilters(tileObj.document, allParams);
                } catch (err) {
                    console.warn(`${MODULE_ID} | Could not apply effects:`, err);
                }
            }
        }
    }
}

function _formatLabel(key) {
    return key
        .split("-")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}
