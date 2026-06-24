/*
 * MK-Repos v1.1.3
 * Foundry VTT v12-v14 compatible character repository bridge.
 */

import {
  MK_REPOS,
  mkReposBuildPayload,
  mkReposGameVersion,
  mkReposNotify,
  mkReposPullActor,
  mkReposPullByVaultId,
  mkReposPushActor,
  mkReposStatus,
  mkReposSystemId,
  mkReposSystemVersion,
  mkReposTestConnection
} from "./mk-repos-core.js";

import {
  mkReposOpenActorPanel,
  mkReposOpenBrowser,
  mkReposOpenSettingsPanel,
  mkReposRunConnectionTest
} from "./mk-repos-ui.js";

function mkReposMenuClass(callback) {
  const BaseApplication = globalThis.FormApplication ?? globalThis.Application ?? globalThis.foundry?.applications?.api?.ApplicationV2;
  if (!BaseApplication) {
    return class MKReposMenu {
      render() {
        callback();
        return this;
      }
    };
  }

  return class MKReposMenu extends BaseApplication {
    render() {
      callback();
      return this;
    }
  };
}

function mkReposConnectionTestMenuClass() {
  return mkReposMenuClass(async () => {
    try {
      await mkReposRunConnectionTest();
    } catch (err) {
      console.error(`${MK_REPOS.MODULE_TITLE} connection test failed`, err);
      mkReposNotify(err.message ?? err, "error");
    }
  });
}

function mkReposRegisterSettings() {
  game.settings.register(MK_REPOS.ID, "appsScriptUrl", {
    name: "Google Apps Script Web App URL",
    hint: "Paste the /exec deployment URL for the MK-Repos Apps Script bridge.",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  game.settings.register(MK_REPOS.ID, "vaultToken", {
    name: "Repository Token",
    hint: "Shared token checked by the Apps Script bridge. Do not use a valuable password.",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  game.settings.registerMenu(MK_REPOS.ID, "connectionTest", {
    name: "Test Connection",
    label: "Test Connection",
    hint: "Add a dummy row to the ConnectionTests sheet to verify the URL, token, and spreadsheet write access.",
    type: mkReposConnectionTestMenuClass(),
    restricted: false
  });

  game.settings.register(MK_REPOS.ID, "allowedActorTypes", {
    name: "Allowed Actor Types",
    hint: "Comma-separated Actor types that MK-Repos may push/pull. Defaults include character and Player.",
    scope: "world",
    config: true,
    type: String,
    default: MK_REPOS.DEFAULT_ALLOWED_TYPES
  });

  game.settings.register(MK_REPOS.ID, "preserveOwnershipOnImport", {
    name: "Preserve Imported Ownership",
    hint: "If disabled, pulled characters keep local Foundry ownership instead of importing ownership from another server.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.registerMenu(MK_REPOS.ID, "repositoryControls", {
    name: "Repository Controls",
    label: "Open MK-Repos",
    hint: "Push, pull, browse repository characters, and inspect local repository status.",
    icon: "fas fa-box-archive",
    type: mkReposMenuClass(mkReposOpenSettingsPanel),
    restricted: false
  });
}

function mkReposExposeApi() {
  game.mkRepos = {
    openSettings: mkReposOpenSettingsPanel,
    openBrowser: mkReposOpenBrowser,
    openActorPanel: mkReposOpenActorPanel,
    pushActor: mkReposPushActor,
    pullActor: mkReposPullActor,
    pullByVaultId: mkReposPullByVaultId,
    testConnection: mkReposTestConnection,
    status: mkReposStatus,
    buildPayload: mkReposBuildPayload
  };
}

Hooks.once("init", () => {
  mkReposRegisterSettings();
});

Hooks.once("ready", () => {
  mkReposExposeApi();
  console.log(`${MK_REPOS.MODULE_TITLE} | Ready v${MK_REPOS.VERSION} for Foundry ${mkReposGameVersion()} / system ${mkReposSystemId()} ${mkReposSystemVersion()}`);
});
