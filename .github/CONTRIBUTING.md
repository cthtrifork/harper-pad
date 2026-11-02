# Contributing

1. Branch from `main`: `git checkout -b <topic> origin/main`.
2. Make the change with tests. Add or update tests where there is logic to test.
3. Run what CI runs: `make check` (gofmt, `go mod tidy -diff`, vet, tests and the headless build, all GTK-free), plus `make lint` for the linters.
4. Update docs and the README for user-visible changes.
5. Open a PR using the template.

Standing rules and the layout: [`AGENTS.md`](../AGENTS.md). The spike notes are in [`docs/spike.md`](../docs/spike.md).

Report security issues privately to the maintainers rather than in a public issue.
