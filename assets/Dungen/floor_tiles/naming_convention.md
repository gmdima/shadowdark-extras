# Floor Tile Naming Convention

This document defines the naming convention for floor tiles in the Dungeon Delve module.

## File Naming Format

```
{material}_{pattern}_{tone}_{nn}.png
```

### Components

| Component | Required | Description |
|-----------|----------|-------------|
| `material` | Yes | Primary material (stone, wood, etc.) |
| `pattern` | Yes | Visual pattern (slab, checkered, circle, etc.) |
| `tone` | Optional | Color tone if not obvious from material |
| `nn` | Yes | Two-digit variation number (00, 01, 02...) |

### Material Values
- `stone` - Stone/brick tiles
- `wood` - Wooden planks/boards
- `marble` - Marble tiles
- `metal` - Metallic tiles

### Pattern Values
- `slab` - Plain stone slabs
- `brick` - Brick pattern
- `checkered` - Checkered pattern (large or small)
- `circle` - Circular/radial design (for focal tiles)
- `mosaic` - Detailed mosaic pattern
- `plank` - Wooden planks

### Tone Values (Optional)
- `neutral` - Gray tones (default, can be omitted)
- `warm` - Brown/tan/orange tones
- `cool` - Blue/gray tones
- `dark` - Dark/shadowy tones
- `light` - Light/bright tones

### Pattern Modifiers (for patterns with size variants)
- `lg` - Large pattern
- `sm` - Small pattern

---

## Examples

| Filename | Description |
|----------|-------------|
| `stone_slab_00.png` | Gray stone slab, variation 0 |
| `stone_slab_warm_00.png` | Brown/tan stone slab |
| `stone_checkered_lg_00.png` | Large checkered stone tiles |
| `stone_circle_mosaic_00.png` | Circular mosaic focal tile |
| `wood_plank_dark_00.png` | Dark wooden planks |

---

## Tile Roles

When adding tiles to `tileset.json`, assign appropriate roles:

| Role | Usage | Typical Patterns |
|------|-------|------------------|
| `primary` | Main dungeon flooring | slab, brick, plank |
| `room` | Room-specific flooring | checkered, decorated slabs |
| `focal` | Room center decorations | circle, mosaic |

---

## Adding New Tiles

1. Follow the naming format above
2. Place variations with sequential numbers (00, 01, 02...)
3. Add entry to `tileset.json` with:
   - Unique `id` (matches base filename without variation number)
   - Descriptive `name`
   - Appropriate `role`, `pattern`, and `tone` tags
   - `preview` pointing to the `_00` variation
   - `variations` array with all variation paths
