/*
 * MK-Repos v1.3.1
 * Foundry VTT v12-v14 compatible character repository bridge.
 */

import {
  MK_REPOS,
  mkReposBuildPayload,
  mkReposGameVersion,
  mkReposNotify,
  mkReposListRepository,
  mkReposPullActor,
  mkReposPullByVaultId,
  mkReposPushActor,
  mkReposStatus,
  mkReposDefaultAllowedActorTypes,
  mkReposSupportedActorTypes,
  mkReposSystemId,
  mkReposSystemVersion,
  mkReposTestConnection
} from "./mk-repos-core.js";

import {
  mkReposOpenAllowedActorTypesPanel,
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
  const supportedActorTypes = mkReposSupportedActorTypes();

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
    hint: `Comma-separated Actor types that MK-Repos may push/pull. Supported by this system: ${supportedActorTypes.join(", ") || "unknown"}.`,
    scope: "world",
    config: false,
    type: String,
    default: mkReposDefaultAllowedActorTypes()
  });

  game.settings.registerMenu(MK_REPOS.ID, "allowedActorTypesMenu", {
    name: "Allowed Actor Types",
    label: "Configure Types",
    hint: `Choose which system Actor types MK-Repos may push, pull, and show. Supported by this system: ${supportedActorTypes.join(", ") || "unknown"}.`,
    icon: "fas fa-users-cog",
    type: mkReposMenuClass(mkReposOpenAllowedActorTypesPanel),
    restricted: false
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
    hint: "Open the actor repository grid with row-level Push and Pull controls.",
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
    listRepository: mkReposListRepository,
    testConnection: mkReposTestConnection,
    status: mkReposStatus,
    buildPayload: mkReposBuildPayload
  };
}

function mkReposSettingsHtmlElement(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function mkReposMaskRepositoryTokenSetting(html) {
  const root = mkReposSettingsHtmlElement(html);
  const selectors = [
    `input[name="${MK_REPOS.ID}.vaultToken"]`,
    `input[data-setting-id="${MK_REPOS.ID}.vaultToken"]`,
    `input[id="${MK_REPOS.ID}.vaultToken"]`
  ];
  const input = root?.querySelector?.(selectors.join(", "));
  if (!input) return;

  input.type = "password";
  input.autocomplete = "off";
  input.spellcheck = false;
}

Hooks.once("init", () => {
  mkReposRegisterSettings();
});

Hooks.once("ready", () => {
  mkReposExposeApi();
  console.log(`${MK_REPOS.MODULE_TITLE} | Ready v${MK_REPOS.VERSION} for Foundry ${mkReposGameVersion()} / system ${mkReposSystemId()} ${mkReposSystemVersion()}`);
});

Hooks.on("renderSettingsConfig", (app, html) => {
  mkReposMaskRepositoryTokenSetting(html);
  setTimeout(() => mkReposMaskRepositoryTokenSetting(html), 0);
});
