# Changelog

All notable changes to MK-Repos are documented here.

MK-Repos uses semantic versions. For this project, regular user-visible updates should bump the minor version, for example `1.1.0` to `1.2.0`. Patch versions are reserved for tiny packaging or hotfix corrections that do not change behavior.

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
