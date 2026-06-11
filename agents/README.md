# Agents

ECC-style agent definitions can be added here when the project needs reusable roles such as reviewer, explorer, or documentation maintainer.

Claude Code loads project subagents from `.claude/agents/` (the harness-native surface). The current Planassiant agent set (planner, code-reviewer, tdd-guide, rust-reviewer, typescript-reviewer, database-reviewer, build-error-resolver, security-reviewer) lives there, adapted from ECC originals to this project's stack and rules.

