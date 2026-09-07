# GraphQL Schema Breaking-Change Companion (VS Code)

Diffs a GraphQL SDL file against its git baseline (`HEAD`) and flags
breaking changes — removed types/fields/enum values, changed field
types. No data leaves your editor (git is invoked locally, never
network).

**v0.1, new niche.** Not a port from the Gap Hunter Labs IntelliJ-
family catalog. Evidence, confirmed twice independently: the official
GraphQL VS Code extensions give validation/autocompletion but no
diffing against a baseline; GraphQL Inspector and Kiwi.com's
`graphql-bc-checker` are *"typically integrated into CI/CD pipelines
rather than as VS Code extensions directly."* Design precedent:
[`Protobuf VSC`](https://marketplace.visualstudio.com/items?itemName=zxh404.vscode-proto3)
already proves the "diff schema text against a git ref, inside the
editor" mechanism works, for a sibling schema format.

## What it does

**Command: `GraphQL Schema Breaking-Change Companion: Check for
Breaking Changes`** — run it with a `.graphql`/`.gql` file open. It
runs `git show HEAD:<path>` to get the last-committed version, parses
both versions' `type`/`interface`/`input`/`enum` blocks, and reports:

- A type/interface/input/enum removed entirely.
- A field removed from a type/interface/input.
- A field's type changed.
- An enum value removed.

Additive changes (a new field, a new type, a new enum value) are
never flagged — those are backward-compatible by GraphQL's own
semantics.

**v0.1 scope, honestly noted:** a new *required* argument added to an
existing field is a real breaking change too, but argument parsing
isn't implemented here. Not a real GraphQL grammar — directives,
`union`, `extend`, and descriptions aren't modeled. Diagnostics
anchor at the top of the file rather than a precise line (a removed
field/type may no longer exist in the current file's text at all, so
there's nothing meaningful to point at there).

## Privacy

See [PRIVACY.md](PRIVACY.md) — zero network calls; `git show` runs
locally against your own repository history.

## Development

```bash
npm install
npm run compile   # or: npm run watch
npm test
```

To build an installable package without publishing:

```bash
npx @vscode/vsce package
```

## License

Apache License 2.0 — see [LICENSE](LICENSE).
