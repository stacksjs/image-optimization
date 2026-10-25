# ImageOptimization

This is a Stacks native macOS application. Keep application code in TypeScript
and STX. Do not add Swift, Kotlin, or generated native projects to this repo.
Native platform behavior belongs behind shared STX APIs and Craft.

- Use `./buddy dev`, `./buddy build`, and `./buddy upgrade`.
- Fix shared behavior at its source: `~/Code/stacks`, `~/Code/Tools/stx`,
  `~/Code/Tools/craft`, and the image codecs under `~/Code/Libraries/ts-*`.
  Consume released packages here; do not commit local links, patches or copied
  framework implementations. Do not substitute browser behavior for a failed
  native capability.
- Preserve originals. Save only smaller, complete copies without overwriting
  existing files. Keep pixel data, orientation, animation and color profiles.
- Run `bun test tests`, `bun run lint`, `./buddy build`, and `bun run test:e2e`.
  Verify UI changes in the actual native app. Keep the README screenshot real.
- Keep the installed bundle below 100,000 KiB. Ship one Bun executable plus
  Craft; do not embed duplicate runtimes or external image-processing tools.
- Releases must pass signing, notarization, stapling and artifact verification
  before publication. Keep all credentials outside the repository and bundle.
- Use conventional commits as Chris Breuer (`chris@stacksjs.com`) with no
  coauthor or agent attribution. Integrate `origin/main` and push completed
  changes to `origin/main` normally; never force-push. Preserve unrelated work.
