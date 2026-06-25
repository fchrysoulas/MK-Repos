# Changelog

MK-Repos uses semantic versions. Bump the version on every update: patch for fixes, refactors, and small UI moves; minor for user-visible feature additions; major for breaking changes.

## 1.3.1

- Masked the Repository Token field in Foundry's module settings by rendering it as a password input.
- Updated module, client script, Apps Script, manifest download URL, and bridge version values to `1.3.1`.

## 1.3.0

- Added remote repository records to the Repository Controls grid by reading the Apps Script `list` action.
- Added an Import row action for actors that exist in the Google Sheets repository but not in the current Foundry world.
- Added a Refresh button for reloading local and remote repository rows.
- Added `game.mkRepos.listRepository()` for console/macros.
- Updated module, client script, Apps Script, manifest download URL, and bridge version values to `1.3.0`.

## 1.2.5

- Changed the Repository Controls grid Last Synced column to show elapsed hours as a two-decimal value.
- Updated module, client script, Apps Script, manifest download URL, and bridge version values to `1.2.5`.

## 1.2.4

- Replaced the raw Allowed Actor Types textbox with a checkbox picker populated from the active game system's Actor types.
- Filtered the Repository Controls actor grid so it only shows actors whose type is enabled in Allowed Actor Types.
- Updated module, client script, Apps Script, manifest download URL, and bridge version values to `1.2.4`.

## 1.2.3

- Removed the Template column from the Repository Controls actor grid.
- Fixed grid header overlap by separating the search toolbar from the scrollable table area.
- Updated module, client script, Apps Script, manifest download URL, and bridge version values to `1.2.3`.

## 1.2.2

- Added a search field above the Repository Controls actor grid.
- Tightened actor grid rows with `line-height: 0.5`.
- Updated module, client script, Apps Script, manifest download URL, and bridge version values to `1.2.2`.

## 1.2.1

- Changed the Repository Controls grid Last Synced value to show total elapsed minutes instead of `hours:minutes`.
- Updated module, client script, Apps Script, manifest download URL, and bridge version values to `1.2.1`.

## 1.2.0

- Reworked Repository Controls into an actor grid interface built on Foundry ApplicationV2 when available.
- The grid lists all local actors with Actor, Type, System, Vault ID, LR, Template, and elapsed Last Synced columns.
- Added row-level Push and Pull buttons directly in the actor grid.
- Redirected older actor panel, settings panel, and browser entrypoints to the new grid so repository work happens in one place.
- Updated module, client script, Apps Script, manifest download URL, and bridge version values to `1.2.0`.

## 1.1.4

- Made progress overlay cleanup more defensive so please-wait overlays are removed after actions finish.
- Removed stale progress overlays before starting a new action.
- Updated module, client script, Apps Script, manifest download URL, and bridge version values to `1.1.4`.

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
