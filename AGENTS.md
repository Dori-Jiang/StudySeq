# Everything Claude Code (ECC) — Agent Instructions

This project uses the Everything Claude Code (ECC) workflow model as its collaboration baseline.

## Core Principles

1. **Agent-First** — Delegate to specialized agents for domain tasks when the current environment supports agent orchestration.
2. **Test-Driven** — Write tests before implementation, with 80%+ coverage as the target for mature modules.
3. **Security-First** — Never compromise on security; validate all inputs.
4. **Immutability** — Prefer creating new objects over mutating existing objects.
5. **Plan Before Execute** — Plan complex features before writing code.

## Agent Orchestration

Use agents proactively when the environment provides them and the task benefits from delegation:

- Complex feature requests -> planner
- Code just written or modified -> code-reviewer
- Bug fix or new feature -> tdd-guide
- Architectural decision -> architect
- Security-sensitive code -> security-reviewer
- Build or type failures -> build-error-resolver
- Critical user flows -> e2e-runner
- Documentation updates -> doc-updater
- TypeScript/JavaScript changes -> typescript-reviewer
- Database schema or query work -> database-reviewer

Use parallel execution for independent operations when it is safe and supported.

## Security Guidelines

Before any commit or release:

- No hardcoded secrets, API keys, passwords, or tokens.
- All user inputs are validated at system boundaries.
- SQL operations use parameterized queries or safe ORM/query-builder APIs.
- HTML content is sanitized before rendering when user-controlled.
- Error messages do not leak sensitive information.

Secret management:

- Never hardcode secrets.
- Use environment variables or local secret storage if secrets are introduced later.
- Rotate any exposed secrets immediately.

If a security issue is found:

1. Stop feature work.
2. Use security review workflow.
3. Fix critical issues first.
4. Review nearby code for similar issues.

## Coding Style

Immutability:

- Prefer new objects and arrays over in-place mutation.
- Keep state transitions explicit and testable.

File organization:

- Prefer many small files over a few large files.
- Keep files focused; 200-400 lines is typical, 800 lines is a soft maximum.
- Organize by feature/domain where practical.
- Keep high cohesion and low coupling.

Error handling:

- Handle errors at every boundary.
- Provide user-friendly messages in UI code.
- Keep detailed technical context in logs or diagnostics.
- Do not silently swallow errors.

Input validation:

- Validate all user input at system boundaries.
- Use schema-based validation where practical.
- Fail fast with clear messages.

Code quality checklist:

- Functions are small and focused.
- Avoid deep nesting beyond 4 levels.
- Avoid hardcoded business values unless documented.
- Use readable, well-named identifiers.

## Testing Requirements

Target coverage for mature modules: 80%+.

Required test types as the project matures:

1. Unit tests for domain logic, utilities, and components.
2. Integration tests for service, database, or API boundaries.
3. E2E tests for critical user flows.

TDD workflow for meaningful behavior changes:

1. Write test first (RED) — the test should fail.
2. Write minimal implementation (GREEN) — the test should pass.
3. Refactor (IMPROVE) — keep tests passing.

Troubleshooting order:

1. Check test isolation.
2. Verify mocks and fixtures.
3. Fix implementation.
4. Fix tests only when the test expectation is wrong.

## Development Workflow

1. **Plan** — Identify dependencies, risks, and phases before complex implementation.
2. **TDD** — Write tests first, implement the smallest passing change, then refactor.
3. **Review** — Use code review workflow after modifying code; address critical and high issues first.
4. **Capture knowledge in the right place**
   - Current task state and handoff context -> `WORKING-CONTEXT.md`.
   - Personal debugging notes, preferences, and temporary context -> Codex memories where supported.
   - Team/project knowledge -> the project's existing docs structure.
   - Reusable workflow knowledge -> `skills/` or `.agents/skills/`.
   - Long-lived coding constraints -> `rules/`.
   - If there is no obvious project doc location, ask before creating a new top-level file.
5. **Commit** — Use Conventional Commits when the repository is under git.

## Workflow Surface Policy

- `skills/` is the canonical workflow surface for reusable project workflows.
- New workflow contributions should land in `skills/` first.
- `.agents/skills/` can hold project-specific skill copies or cross-harness skill variants.
- `commands/` is a legacy slash-entry compatibility surface and should only be added or updated when a shim is still required for migration or cross-harness parity.

Do not copy globally installed ECC skills into this project unless a project-specific override or cross-harness copy is needed.

## Git Workflow

Commit format:

```text
<type>: <description>
```

Allowed common types:

- `feat`
- `fix`
- `refactor`
- `docs`
- `test`
- `chore`
- `perf`
- `ci`

PR workflow when applicable:

1. Analyze changed files and relevant commit history.
2. Draft a concise summary.
3. Include a test plan.
4. Push with upstream tracking when creating a branch.

## Architecture Patterns

Repository pattern:

- Encapsulate data access behind repositories.
- Business logic should depend on domain interfaces, not direct storage calls.
- UI code should avoid direct persistence or system integration unless it is a thin app-shell adapter.

Skeleton projects:

- Prefer proven, battle-tested setup patterns when scaffolding.
- Keep architecture decisions documented in the appropriate project docs location.

## Performance

Context management:

- Avoid large refactors when context is nearly full.
- Prefer small, reviewable steps for multi-file changes.

Build troubleshooting:

1. Inspect the first meaningful error.
2. Fix incrementally.
3. Re-run the narrowest relevant verification command.

## Project Structure

```text
agents/          - ECC-style specialized subagent definitions
skills/          - Canonical reusable workflow skills
commands/        - Legacy slash command compatibility shims
rules/           - Always-follow guidelines by language or domain
scripts/         - Repository and ECC maintenance utilities
manifests/       - Structured catalogs for project workflow assets
schemas/         - Validation schemas for structured config
tests/           - Repository-level and cross-package tests
docs/            - ECC and collaboration documentation
.codex/          - Codex-specific project configuration and lifecycle hooks
.agents/         - Cross-harness agent/skill assets
product/         - Product-specific docs and design assets
app/             - Application source code
WORKING-CONTEXT.md - Current work state for context recovery
```

## Success Metrics

- User requirements are met.
- All relevant tests pass.
- No critical security issues.
- Code is readable, maintainable, and organized by clear ownership boundaries.
