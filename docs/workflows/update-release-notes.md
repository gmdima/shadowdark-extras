---
description: How to update release notes when fixing bugs or adding features
---

# Updating Release Notes

When you fix a bug or introduce a new feature in the `shadowdark-extras` module, update the release notes file at `RELEASENOTES.md`.

## Steps

1. Open `RELEASENOTES.md` in the module root.

2. Find the `## [Unreleased]` section at the top. If it doesn't exist, create it below the title:
   ```markdown
   ## [Unreleased]
   ```

3. Add your change under the appropriate subsection:
   - **New Features** - for new functionality
   - **Improvements** - for enhancements to existing features
   - **Bug Fixes** - for bug fixes

4. If the subsection doesn't exist, create it:
   ```markdown
   ### New Features
   - Description of the new feature
   
   ### Improvements
   - Description of the improvement
   
   ### Bug Fixes
   - Description of the bug fix
   ```

5. Write a concise, user-facing description of the change. Start with a verb (Added, Fixed, Improved, etc.):
   ```markdown
   - Added `@DisplayTable` journal enricher for displaying rollable tables
   - Fixed damage card appearing on initiative rolls
   - Improved UI responsiveness for aura checkboxes
   ```

6. When releasing a new version, rename `## [Unreleased]` to the version number with the date:
   ```markdown
   ## [4.12] - 2026-01-07
   ```
   Then create a new `## [Unreleased]` section above it.

## Example Entry

```markdown
## [Unreleased]

### New Features
- Added `@DisplayTable` journal enricher for displaying styled, rollable tables in journals
- Added `@DisplayNpcCard` journal enricher for NPC stat blocks

### Bug Fixes
- Fixed level-up animation duplicating when multiple players are connected
```
