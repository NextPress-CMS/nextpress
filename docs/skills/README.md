# NextPress AI Agent Skills

Structured, source-grounded skills for AI coding agents working on NextPress. Each skill is a folder with a `SKILL.md` (entry point: rules + workflow) and a `reference.md` (exact API signatures with `file:line` citations).

| Skill | Track | Scope |
|-------|-------|-------|
| [theme-development](theme-development/SKILL.md) | Themes | `themes/{slug}/` — layouts, template hierarchy, block overrides, `theme.json` |
| [plugin-development](plugin-development/SKILL.md) | Plugins | `plugins/{slug}/` — content types, fields, blocks, hooks, admin pages, API routes via `PluginContext` |
| [core-development](core-development/SKILL.md) | Core engine | `packages/*`, `apps/web/` — services, tRPC, Prisma, guardrails |

## Usage

These follow the [Agent Skills](https://www.anthropic.com/news/skills) convention: an agent loads `SKILL.md` first, then pulls the sibling `reference.md` only when writing real code. To use them with a local agent, copy or symlink the folders into your agent's skills directory.
