# Rules for AI

The following rules must be followed by any AI agent working on this project.

## Git Workflow
- **NEVER** run `git commit` or `git push` unless explicitly requested by the user.
- Always ask for user confirmation before doing any destructive operations on the repository.
- It is acceptable to use `git status` or `git diff` for research, but do not stage (`git add`) or commit changes autonomously.

## Coding Standards
- Maintain existing code style and formatting.
- Check syntax before suggesting or applying changes.
- Avoid leaving `console.log` statements in production code unless they are wrapped in a debug flag or explicitly requested.
