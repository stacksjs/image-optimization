# Changelog

## 0.1.1

- Sign the DMG container before notarization and verify both the installer and application with Gatekeeper before publication.
- Include Apple's issuer certificate in Store signing exports and verify both identities in the ephemeral release keychain.
- Enforce the installed size budget on signed bundles as well as development builds.
- Keep processing errors with their image rows so removing a failed image also removes its error.

## 0.1.0

- Native macOS image optimization through Stacks, STX and Craft, with seven TypeScript codecs.
- Preserve originals and metadata while saving only complete, smaller copies without replacing existing files.
- Add native file and output-folder pickers, per-image results, a real screenshot and automated Apple distribution.
