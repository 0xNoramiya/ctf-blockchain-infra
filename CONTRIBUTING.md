# Contributing

The goal: keep the infra small, predictable, and honest about its
trade-offs. Adoption is the metric, not surface area. PRs that *remove*
code or sharpen the bar are as welcome as PRs that add features.

## What we want

- **More worked examples** based on real audit findings — Solodit,
  c4-rena, immunefi disclosures. One bug per example.
- **Better docs** — concise, opinionated, with mermaid where it helps.
- **Bug fixes** with a regression test (forge test or backend unit
  test).
- **Generic features** — anything that benefits all four templates or
  the backend, not just your event.

## What we don't want

- Per-event branding, custom themes, scoreboard plugins inside this
  repo. Fork or build them as a separate package.
- Heavy frameworks pulled in for one feature (`prom-client`,
  full Web3.js stack, opinionated test runners). The backend deps list
  is short on purpose.
- Templates with hand-crafted "look how clever this bug is" hooks.
  Templates should be skeletons; clever bugs go in `examples/`.

## Adding a contract template

A new template under `contracts-template/` earns its place when it
covers a category none of the existing four already cover.

Bar:

- [ ] `foundry.toml` builds cleanly with `forge install foundry-rs/forge-std`.
- [ ] `src/` contains the minimum machinery to enforce the
      `isSolved(address)` invariant; *no bug pattern* — bugs go in `examples/`.
- [ ] `script/Deploy.s.sol` prints copy-paste manifest values.
- [ ] `test/` has at least one positive test (default state is
      unsolved) and one structural test (whatever the template's
      invariant is).
- [ ] `README.md` shows how to extend.
- [ ] Added to the matrix in `.github/workflows/foundry.yml`.
- [ ] Linked from `docs/docs/challenges/overview.md` and the README.

## Adding a worked example

Bar:

- [ ] One real bug pattern, **with a Solodit / public-audit link** in
      the README. No invented bugs.
- [ ] `src/` ships every contract the bug needs. No magic external
      dependencies beyond `contracts-template/lib/`.
- [ ] `test/` has **two** tests minimum:
      `test_*_succeeds_to_solve` and `test_*_negative_case` (some
      naive attempt that does **not** solve, proving the bug pattern
      isn't accidentally a free win).
- [ ] `script/Deploy.s.sol` deploys end-to-end with one command and
      prints exact manifest values.
- [ ] `solver/solve.js` (or `.py` / shell) — under 100 lines,
      reproducible exploit.
- [ ] `challenges-entry.json` — the manifest snippet, with placeholder
      addresses.
- [ ] `README.md` under 200 lines, with the bug, the mitigation, and
      the exploit walkthrough as state transitions.
- [ ] Added to `examples/README.md`, `docs/docs/examples.md`, and the
      foundry CI matrix.
- [ ] `.ctf-smoke.json` next to the solver so
      `ctf-admin smoke-solve <id>` works end-to-end. See
      [smoke recipes](docs/docs/smoke-recipes.md).

## Backend changes

The single-file constraint went away with the launcher, but the spirit
holds: modules should fit in one screen, dependencies should be obvious.

- Run `node --check backend/*.js` after every change.
- If adding env vars, document them in `backend/.env.example` AND
  surface them in `docs/docs/operations/` somewhere.
- New endpoints: add a rate-limit entry in `server.js` (`limits.*`) and
  document the rate limit's default in `.env.example`.
- New metric? Add to `backend/metrics.js`'s `M` export, increment from
  the call site, document in `docs/docs/operations/metrics.md`.
- New webhook event? Update the table in `docs/docs/operations/webhook.md`
  AND the sample receiver if its shape would surprise an integrator.

## Frontend changes

- Vanilla JS, no build step, no framework. ethers from a CDN.
- One-CSS-file rebrand should still work after your change. Don't
  introduce inline styles.
- Keep wallet interactions opt-in — the frontend should still load
  when no wallet is injected, just with Connect disabled.

## Docs

- Authored as MkDocs Material (see `docs/mkdocs.yml`).
- Each page is one concept. Don't write a docs page that says "see also
  five other pages" without resolving the question first.
- Tables for comparison ("when to use mode X vs Y") work well.
- Mermaid for sequence + flow diagrams. Static images only if mermaid
  can't express it.

## Code style

- **Backend (Node)**: ESM, async/await, no `then`-chains in new code.
  No `var`. Named exports where possible.
- **Frontend**: same. No CommonJS.
- **Contracts**: `forge fmt --check` is advisory in CI. If your bug
  depends on a specific formatting, comment why.
- **Comments**: explain *why*, not *what*. The Solidity in `examples/`
  is the exception — the `// 🚨` markers showing the bug locations are
  intentional teaching aids.

## Devcontainer / Codespaces

The repo ships a `.devcontainer/` config. Open in VSCode (Reopen in
Container) or GitHub Codespaces and the post-create script installs
foundry + node deps + symlinks `bin/ctf-admin` onto `$PATH`. Common
ports are forwarded (8080, 8787, 8545).

If you're on bare metal, `just` covers the same shortcuts — `just dev`,
`just test`, `just up`, `just e2e`.

## Pre-commit

The repo ships a `.pre-commit-config.yaml`. Wire it in once:

```bash
pip install pre-commit
pre-commit install
```

After that, every commit runs trailing-whitespace + EOF + JSON/YAML
parse + `node --check` on touched JS + `forge fmt --check` on touched
Solidity. Skip a hook with `SKIP=hook-id git commit`.

## PR checklist

```
- [ ] CI green (forge build + tests, helm lint, mkdocs build, node --check)
- [ ] New env vars documented in .env.example and docs/
- [ ] New endpoints rate-limited + documented
- [ ] If user-facing: README / docs updated
- [ ] If contracts: forge fmt --check clean OR a comment explaining why not
- [ ] Worked examples cite a real audit finding
```

## Maintenance

Issues and PRs without activity for 30 days get a polite ping; 60 days
without response gets closed. Re-open with a comment is fine.

## License

By contributing you agree the code is MIT-licensed. Don't paste in code
under incompatible licenses — when in doubt, link to the upstream
implementation in a comment instead.
