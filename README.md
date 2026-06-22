# MK-Repos v1.0.0

MK-Repos is a lightweight Foundry VTT character repository module for sharing player character sheet data between different Foundry servers.

Version 1 is intentionally manual and safe:

- Foundry VTT v12-v13-v14 compatibility target
- Character-only by default (`actor.type === "character"`)
- Manual Push / Pull
- Google Sheets as the repository
- Google Apps Script as the bridge
- Revision conflict protection
- Full Actor JSON storage for faithful reconstruction
- Human-readable flattened character sheet fields
- Items and Active Effects exported into separate repository tabs

## Why this architecture?

The Google Sheet is human-readable, but the full Actor JSON remains the source of truth. This avoids losing system-specific sheet information, embedded items, effects, flags, talents, spells, and module data.

## Installation

1. Extract `mk-repos` into your Foundry user data folder:
   `Data/modules/mk-repos`
2. Restart Foundry.
3. Enable **MK-Repos** in your world.
4. Configure the module settings:
   - Google Apps Script Web App URL
   - Repository Token
   - Allowed Actor Types, default: `character`

## Google Sheets setup

1. Create a Google Sheet.
2. Open **Extensions -> Apps Script**.
3. Paste `apps-script/MK-Repos-AppsScript.gs` into the Apps Script editor.
4. In Apps Script project settings, add this Script Property:
   - `MK_REPOS_TOKEN` = your shared token
5. Optional, if the script is not bound to the target sheet:
   - `MK_REPOS_SPREADSHEET_ID` = your spreadsheet ID
6. Run `mkReposSetup()` once from the Apps Script editor and authorize it.
7. Deploy as a Web App:
   - Execute as: **Me**
   - Who has access: **Anyone with the link**
8. Copy the `/exec` Web App URL into the Foundry module setting.

## Using it

1. Open a player character sheet.
2. Click the box/archive icon in the sheet header.
3. Use:
   - **Link ID** to manually assign or inspect a character vault ID.
   - **Push** to send the PC to the repository.
   - **Pull** to overwrite the local PC from the repository.
   - **Status** to compare local and repository revisions.
   - **Repository** to list available repository characters.

You can also open the repository browser from the console or a macro:

```js
await game.mkRepos.openBrowser();
```

Push an actor from a macro:

```js
await game.mkRepos.pushActor(actor);
```

Pull by vault ID:

```js
await game.mkRepos.pullByVaultId("your-vault-id-here");
```

## Repository tabs

The Apps Script creates these tabs:

- `Characters`: readable index and metadata
- `CharacterFields`: flattened primitive character sheet fields from `actor.system`
- `Items`: embedded item summary and full item JSON
- `Effects`: active effect summary and full effect JSON
- `RawActor`: full Actor JSON in chunks
- `Templates`: reserved for future system template builder support

## v12-v13-v14 compatibility notes

MK-Repos avoids subclassing Actor sheets or depending on system-specific sheet internals. It injects a small button into rendered Actor sheets and uses Foundry's stable document methods for Actor, Item, and ActiveEffect import/export.

It registers these render hooks for compatibility across sheet generations:

- `renderActorSheet`
- `renderActorSheetV2`
- `renderDocumentSheet`

The modal UI is plain DOM, not a custom Application subclass, to avoid ApplicationV1/ApplicationV2 differences.

## Known v1 limitations

- No automatic live sync.
- No field-level merge UI yet.
- Google Sheet edits are not imported field-by-field yet; Pull uses `RawActor` as the source of truth.
- Image files are not uploaded. If a portrait/token path exists only on Server A, Server B may need the same asset path or a manual replacement.
- The Shadowdark template is currently automatic: all primitive fields from `actor.system` are flattened. A visual template builder is planned for a later version.

## Safety notes

The repository token is not a high-security secret because it is used by client-side Foundry code. Use it as a shared access key for your own table, not as a valuable password.

Do not use auto-sync for PCs until conflict and merge handling are expanded. Manual Push/Pull is safer.
