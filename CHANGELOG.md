# Changelog

MK-Repos uses semantic versions. Bump the version on every update: patch for fixes, refactors, and small UI moves; minor for user-visible feature additions; major for breaking changes.

## 1.1.3

- Added a blocking please-wait overlay with an indeterminate progress bar for long-running actions.
- Wrapped connection test, push, force-push, pull, status checks, repository listing, and repository row pull actions with progress feedback.
- Updated module, client script, Apps Script, manifest download URL, and bridge version values to `1.1.3`.

## 1.1.2

- Kept the JavaScript split but flattened the new files into `scripts/`.
- Renamed the split modules to `scripts/mk-repos-core.js` and `scripts/mk-repos-ui.js`.
- Updated imports and version metadata to `1.1.2`.

## 1.1.1

- Split the monolithic `scripts/mk-repos.js` entrypoint into logical core and UI modules.
- Kept `scripts/mk-repos.js` as the Foundry entry module for simple manifest loading.
- Moved Test Connection out of the repository controls modal and into the main module settings list near the URL and token settings.
- Bumped module, client script, Apps Script, manifest download URL, and bridge version values to `1.1.1`.

## 1.1.0

- Moved Push, Pull, Status, Repository, and Link ID controls into the module settings panel.
- Removed the character sheet header button and sheet render hook injection.
- Added a Test Connection control that writes a dummy row to the `ConnectionTests` Google Sheet tab.
- Added the Apps Script `testConnection` action and `ConnectionTests` sheet.
- Improved local actor discovery for Foundry actor collections.
- Show local actors in the settings dropdown even when they are not currently allowed or owned, with warnings explaining why sync actions may be blocked.
- Added `Player` as a default allowed actor type and made allowed actor type matching case-insensitive.
- Added clearer client messaging when the deployed Apps Script needs to be redeployed.

## 1.0.0

- Initial manual character repository release.
- Added Google Sheets and Apps Script bridge storage.
- Added full Actor JSON storage with flattened sheet fields, item rows, effect rows, and raw actor chunks.
- Added manual push, pull, repository listing, revision tracking, and conflict protection.
