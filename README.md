# MK-Repos

MK-Repos is a lightweight Foundry VTT character repository module for sharing player character data between Foundry servers through Google Sheets and an Apps Script bridge.

The module is intentionally manual: users choose when to push or pull character data, and full Actor JSON remains the source of truth for reconstruction.

See [CHANGELOG.md](CHANGELOG.md) for release notes and versioning policy.

## Features

- Foundry VTT v12-v13-v14 compatibility target
- Manual Push and Pull from module settings
- Google Sheets repository with Apps Script bridge
- Revision conflict protection
- Full Actor JSON storage for faithful reconstruction
- Human-readable flattened character sheet fields
- Items and Active Effects exported into separate repository tabs
- Connection test that writes a dummy record to Google Sheets

## Installation

1. Extract `mk-repos` into your Foundry user data folder:
   `Data/modules/mk-repos`
2. Restart Foundry.
3. Enable **MK-Repos** in your world.
4. Configure the module settings:
   - Google Apps Script Web App URL
   - Repository Token
   - Allowed Actor Types, defaults include `character` and `Player`
   - Repository Controls

## Google Sheets Setup

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

When updating the Apps Script after it has already been deployed, open **Deploy -> Manage deployments**, edit the existing Web App deployment, choose **New version**, and deploy. The `/exec` URL can keep serving old code until a new version is deployed.

## Usage

1. Open **Configure Settings -> Module Settings -> MK-Repos -> Repository Controls**.
2. Click **Open MK-Repos**.
3. Select a local character.
4. Use:
   - **Link ID** to manually assign or inspect a character vault ID.
   - **Push** to send the PC to the repository.
   - **Pull** to overwrite the local PC from the repository.
   - **Status** to compare local and repository revisions.
   - **Repository** to list available repository characters.
   - **Test Connection** to add a dummy row to the `ConnectionTests` sheet.

If a local actor appears as **type not allowed**, add that actor type to the **Allowed Actor Types** setting. Some game systems use type names other than `character` or `Player`.

## Macros

Open the settings panel:

```js
game.mkRepos.openSettings();
```

Open only the repository browser:

```js
await game.mkRepos.openBrowser();
```

Push an actor:

```js
await game.mkRepos.pushActor(actor);
```

Pull by vault ID:

```js
await game.mkRepos.pullByVaultId("your-vault-id-here");
```

## Repository Tabs

The Apps Script creates these tabs:

- `Characters`: readable index and metadata
- `CharacterFields`: flattened primitive character sheet fields from `actor.system`
- `Items`: embedded item summary and full item JSON
- `Effects`: active effect summary and full effect JSON
- `RawActor`: full Actor JSON in chunks
- `Templates`: reserved for future system template builder support
- `ConnectionTests`: dummy connection-check records

## Safety Notes

The repository token is not a high-security secret because it is used by client-side Foundry code. Use it as a shared access key for your own table, not as a valuable password.

Do not use auto-sync for PCs until conflict and merge handling are expanded. Manual Push/Pull is safer.
