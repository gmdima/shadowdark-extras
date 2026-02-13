# Floor Tile Tagging Convention

This document defines the tagging system used in `tileset.json` to categorize floor tiles for procedural dungeon generation.

---

## Tag Categories

### `role` - How the tile is used (array)

Tiles can have multiple roles. The generator uses roles to select appropriate tiles for different areas.

| Value | Description | Typical Usage |
|-------|-------------|---------------|
| `primary` | Main dungeon flooring | Corridors, default room floors |
| `room` | Room-specific flooring | Can replace primary in rooms, or used for variation |
| `focal` | Decorative centerpieces | Room centers, special features (1x1 to 4x4) |

**Examples:**
- A plain stone slab: `["primary", "room"]` - usable anywhere
- A checkered tile: `["room"]` - only for rooms, too fancy for corridors
- A circular mosaic: `["focal"]` - only for special placement

---

### `pattern` - Visual pattern type (string)

| Value | Description | Examples |
|-------|-------------|----------|
| `solid` | Plain/uniform pattern | Stone slabs, wood planks |
| `checkered` | Alternating squares | Black/white checkered, tan checkered |
| `circular` | Radial/circular designs | Mosaics, rose patterns, brick circles |
| `mosaic` | Detailed decorative patterns | Complex tile arrangements |

---

### `tone` - Color temperature (string)

Used for matching compatible tiles when mixing primary/room tiles.

| Value | Description | Color Examples |
|-------|-------------|----------------|
| `neutral` | Gray tones | Standard gray stone |
| `warm` | Brown/tan/orange | Brown stone, tan tiles |
| `cool` | Blue/gray tints | Blue-tinted stone |
| `dark` | Dark/shadowy | Dark wood, alien stone |
| `light` | Light/bright | Light wood, white marble |

---

## Generator Logic

### Basic Generation (Single Tile)
```
Select: role includes "primary"
Use: everywhere
```

### With Room Variation
```
Corridors: role includes "primary"
Rooms: role includes "room", matching tone
```

### With Focal Accents
```
Large rooms (>5x5): place role="focal" tile at center
Matching: prefer same tone as room tile
```

---

## Tile Compatibility

When mixing tiles, prefer matching `tone` values for visual coherence:

| Primary Tone | Compatible Room Tones |
|--------------|----------------------|
| `neutral` | `neutral`, `cool` |
| `warm` | `warm`, `neutral` |
| `cool` | `cool`, `neutral` |
| `dark` | `dark`, `neutral` |

---

## Example tileset.json Entry

```json
{
    "id": "stone_slab",
    "name": "Stone Slab",
    "role": ["primary", "room"],
    "pattern": "solid",
    "tone": "neutral",
    "preview": "modules/instant_dungeons/assets/floor_tiles/stone_slab_00.png",
    "variations": [
        "modules/instant_dungeons/assets/floor_tiles/stone_slab_00.png",
        "modules/instant_dungeons/assets/floor_tiles/stone_slab_01.png"
    ]
}
```

---

## Adding New Tiles

1. Name the file following `naming_convention.md`
2. Add entry to `tileset.json` with:
   - `id`: Base filename (without variation number)
   - `name`: Human-readable display name
   - `role`: Array of applicable roles
   - `pattern`: Visual pattern type
   - `tone`: Color temperature
   - `preview`: Path to `_00` variation
   - `variations`: Array of all variation paths
