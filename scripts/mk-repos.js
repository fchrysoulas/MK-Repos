/*
 * MK-Repos v1.0.0
 * Foundry VTT v12-v14 compatible character repository bridge.
 *
 * Design goals:
 * - Manual Push / Pull only.
 * - Player-character only by default.
 * - Google Apps Script bridge, no Google credentials inside Foundry.
 * - Store full Actor JSON for faithful reconstruction.
 * - Store flattened system fields for a human-readable Google Sheet repository.
 */

const MK_REPOS = {
  ID: "mk-repos",
  FLAG_SCOPE: "mk-repos",
  FLAG_VAULT_ID: "vaultId",
  FLAG_REVISION: "revision",
  FLAG_LAST_SYNCED_AT: "lastSyncedAt",
  FLAG_TEMPLATE_ID: "templateId",
  DEFAULT_ALLOWED_TYPES: "character",
  MODULE_TITLE: "MK-Repos"
};

function mkReposGameVersion() {
  return game?.version ?? game?.data?.version ?? "unknown";
}

function mkReposSystemId() {
  return game?.system?.id ?? game?.system?.data?.id ?? "unknown";
}

function mkReposSystemVersion() {
  return game?.system?.version ?? game?.system?.data?.version ?? "unknown";
}

function mkReposNotify(message, type = "info") {
  const uiType = ui?.notifications?.[type] ? type : "info";
  ui?.notifications?.[uiType]?.(`${MK_REPOS.MODULE_TITLE}: ${message}`);
}

function mkReposDuplicate(data) {
  if (foundry?.utils?.deepClone) return foundry.utils.deepClone(data);
  if (typeof duplicate === "function") return duplicate(data);
  return JSON.parse(JSON.stringify(data));
}

function mkReposGetProperty(object, path) {
  if (foundry?.utils?.getProperty) return foundry.utils.getProperty(object, path);
  return path.split(".").reduce((o, k) => o?.[k], object);
}

function mkReposSetProperty(object, path, value) {
  if (foundry?.utils?.setProperty) return foundry.utils.setProperty(object, path, value);
  const parts = path.split(".");
  let target = object;
  while (parts.length > 1) {
    const key = parts.shift();
    target[key] ??= {};
    target = target[key];
  }
  target[parts[0]] = value;
  return true;
}

function mkReposRandomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (foundry?.utils?.randomID) return `mk-${foundry.utils.randomID(24)}`;
  return `mk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mkReposSlugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function mkReposAllowedTypes() {
  const raw = game.settings.get(MK_REPOS.ID, "allowedActorTypes") || MK_REPOS.DEFAULT_ALLOWED_TYPES;
  return new Set(raw.split(",").map(s => s.trim()).filter(Boolean));
}

function mkReposIsCharacterActor(actor) {
  if (!actor) return false;
  return mkReposAllowedTypes().has(actor.type);
}

function mkReposUserCanUseActor(actor) {
  if (!actor) return false;
  if (game.user?.isGM) return true;
  if (actor.isOwner) return true;
  return false;
}

function mkReposGetRootElement(html, app) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  if (html?.jquery && html[0] instanceof HTMLElement) return html[0];
  if (app?.element instanceof HTMLElement) return app.element;
  if (app?.element?.[0] instanceof HTMLElement) return app.element[0];
  return null;
}

function mkReposActorFromApp(app) {
  if (app?.actor) return app.actor;
  if (app?.document?.documentName === "Actor") return app.document;
  if (globalThis.Actor && app?.document instanceof Actor) return app.document;
  return null;
}

function mkReposEscapeHtml(value) {
  const div = document.createElement("div");
  div.innerText = String(value ?? "");
  return div.innerHTML;
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

  game.settings.register(MK_REPOS.ID, "allowedActorTypes", {
    name: "Allowed Actor Types",
    hint: "Comma-separated Actor types that MK-Repos may push/pull. Default: character.",
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

  game.settings.register(MK_REPOS.ID, "showSheetButton", {
    name: "Show Character Sheet Button",
    hint: "Add the MK-Repos box button to character sheet headers.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });
}

function mkReposGetTemplateId(actor) {
  const existing = actor?.getFlag?.(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_TEMPLATE_ID);
  if (existing) return existing;
  return `${mkReposSlugify(mkReposSystemId())}-${mkReposSlugify(actor?.type)}-auto-v1`;
}

function mkReposFlattenFields({ actorData, templateId }) {
  const rows = [];

  const push = (section, label, path, value, type = typeof value, editable = true) => {
    if (value === undefined) return;
    rows.push({
      section: String(section || "General"),
      label: String(label || path),
      path,
      value: value === null ? "" : String(value),
      type: value === null ? "null" : type,
      editable,
      templateId
    });
  };

  push("Identity", "Name", "name", actorData.name, "string", true);
  push("Identity", "Type", "type", actorData.type, "string", false);
  push("Identity", "Portrait", "img", actorData.img, "string", true);

  const system = actorData.system ?? {};
  const visit = (value, pathParts) => {
    if (value === undefined) return;
    const path = ["system", ...pathParts].join(".");
    const label = pathParts[pathParts.length - 1] ?? path;
    const section = pathParts[0] ? String(pathParts[0]).replace(/[-_]/g, " ") : "System";

    if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
      push(section, label, path, value, value === null ? "null" : typeof value, true);
      return;
    }

    if (Array.isArray(value)) {
      if (!value.length) push(section, label, path, "[]", "array", false);
      value.forEach((entry, index) => visit(entry, [...pathParts, String(index)]));
      return;
    }

    if (typeof value === "object") {
      const entries = Object.entries(value);
      if (!entries.length) push(section, label, path, "{}", "object", false);
      for (const [key, entry] of entries) visit(entry, [...pathParts, key]);
    }
  };

  visit(system, []);
  return rows;
}

function mkReposExtractSummary(actorData) {
  const candidates = {
    level: [
      "system.level.value",
      "system.level",
      "system.attributes.level.value",
      "system.details.level.value",
      "system.details.level"
    ],
    className: [
      "system.class",
      "system.class.value",
      "system.details.class",
      "system.details.class.value"
    ],
    ancestry: [
      "system.ancestry",
      "system.ancestry.value",
      "system.race",
      "system.details.race",
      "system.details.ancestry"
    ]
  };

  const readFirst = (paths) => {
    for (const path of paths) {
      const value = mkReposGetProperty(actorData, path);
      if (value !== undefined && value !== null && value !== "") return typeof value === "object" ? JSON.stringify(value) : String(value);
    }
    return "";
  };

  return {
    level: readFirst(candidates.level),
    className: readFirst(candidates.className),
    ancestry: readFirst(candidates.ancestry)
  };
}

function mkReposItemQuantity(itemData) {
  const paths = ["system.quantity", "system.qty", "system.amount", "system.quantity.value", "system.uses.value"];
  for (const path of paths) {
    const value = mkReposGetProperty(itemData, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function mkReposItemEquipped(itemData) {
  const paths = ["system.equipped", "system.equipped.value", "system.carried", "system.active"];
  for (const path of paths) {
    const value = mkReposGetProperty(itemData, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function mkReposItemDescription(itemData) {
  const paths = ["system.description", "system.description.value", "system.description.unidentified", "description"];
  for (const path of paths) {
    const value = mkReposGetProperty(itemData, path);
    if (value !== undefined && value !== null && value !== "") return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
  return "";
}

function mkReposExportActorData(actor) {
  const data = mkReposDuplicate(actor.toObject());

  // These are local-world placement details, not character sheet data.
  delete data._id;
  delete data.folder;
  delete data.sort;

  if (!game.settings.get(MK_REPOS.ID, "preserveOwnershipOnImport")) delete data.ownership;

  // Keep flags because they often contain sheet-relevant system/module data, but scrub volatile MK-Repos values later.
  data.flags ??= {};
  data.flags[MK_REPOS.FLAG_SCOPE] ??= {};

  return data;
}

function mkReposBuildPayload(actor, { force = false } = {}) {
  const vaultId = actor.getFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_VAULT_ID) || mkReposRandomId();
  const revision = Number(actor.getFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_REVISION) || 0);
  const templateId = mkReposGetTemplateId(actor);
  const actorData = mkReposExportActorData(actor);
  mkReposSetProperty(actorData, `flags.${MK_REPOS.FLAG_SCOPE}.${MK_REPOS.FLAG_VAULT_ID}`, vaultId);
  mkReposSetProperty(actorData, `flags.${MK_REPOS.FLAG_SCOPE}.${MK_REPOS.FLAG_REVISION}`, revision);
  mkReposSetProperty(actorData, `flags.${MK_REPOS.FLAG_SCOPE}.${MK_REPOS.FLAG_TEMPLATE_ID}`, templateId);

  const summary = mkReposExtractSummary(actorData);
  const fields = mkReposFlattenFields({ actorData, templateId });
  const items = (actorData.items ?? []).map(item => ({
    itemId: item._id ?? "",
    name: item.name ?? "",
    type: item.type ?? "",
    quantity: mkReposItemQuantity(item),
    equipped: mkReposItemEquipped(item),
    description: mkReposItemDescription(item),
    systemJson: JSON.stringify(item.system ?? {}),
    itemJson: JSON.stringify(item)
  }));

  const effects = (actorData.effects ?? []).map(effect => ({
    effectId: effect._id ?? "",
    name: effect.name ?? effect.label ?? "",
    disabled: effect.disabled ?? false,
    durationJson: JSON.stringify(effect.duration ?? {}),
    changesJson: JSON.stringify(effect.changes ?? []),
    effectJson: JSON.stringify(effect)
  }));

  return {
    action: "push",
    vaultId,
    baseRevision: revision,
    force,
    metadata: {
      vaultId,
      name: actor.name,
      owner: game.user?.name ?? "",
      systemId: mkReposSystemId(),
      systemVersion: mkReposSystemVersion(),
      foundryVersion: mkReposGameVersion(),
      actorType: actor.type,
      templateId,
      level: summary.level,
      className: summary.className,
      ancestry: summary.ancestry,
      status: "synced"
    },
    fields,
    items,
    effects,
    actorJson: JSON.stringify(actorData)
  };
}

async function mkReposApi(actionPayload) {
  const url = String(game.settings.get(MK_REPOS.ID, "appsScriptUrl") || "").trim();
  const token = String(game.settings.get(MK_REPOS.ID, "vaultToken") || "");

  if (!url) throw new Error("Missing Google Apps Script Web App URL in module settings.");
  if (!token) throw new Error("Missing MK-Repos repository token in module settings.");

  const response = await fetch(url, {
    method: "POST",
    // text/plain avoids a browser CORS preflight against Apps Script web apps.
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ token, ...actionPayload })
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`Repository returned non-JSON response: ${text.slice(0, 300)}`);
  }

  if (!response.ok || data.ok === false) {
    const error = new Error(data.error || `Repository request failed (${response.status})`);
    error.details = data;
    throw error;
  }
  return data;
}

function mkReposFindActorByVaultId(vaultId) {
  if (!vaultId) return null;
  return game.actors?.find?.(actor => actor.getFlag?.(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_VAULT_ID) === vaultId) ?? null;
}

function mkReposPrepareActorCoreData(actorData) {
  const data = mkReposDuplicate(actorData);
  delete data._id;
  delete data.folder;
  delete data.sort;
  if (!game.settings.get(MK_REPOS.ID, "preserveOwnershipOnImport")) delete data.ownership;
  return data;
}

async function mkReposReplaceEmbeddedDocuments(actor, actorData) {
  const incomingItems = mkReposDuplicate(actorData.items ?? []);
  const incomingEffects = mkReposDuplicate(actorData.effects ?? []);

  const currentItemIds = actor.items?.map?.(i => i.id) ?? [];
  if (currentItemIds.length) await actor.deleteEmbeddedDocuments("Item", currentItemIds, { mkReposPull: true });
  if (incomingItems.length) await actor.createEmbeddedDocuments("Item", incomingItems, { mkReposPull: true, keepId: true });

  const currentEffectIds = actor.effects?.map?.(e => e.id) ?? [];
  if (currentEffectIds.length) await actor.deleteEmbeddedDocuments("ActiveEffect", currentEffectIds, { mkReposPull: true });
  if (incomingEffects.length) await actor.createEmbeddedDocuments("ActiveEffect", incomingEffects, { mkReposPull: true, keepId: true });
}

async function mkReposImportActorData(actorData, { targetActor = null, vaultId = null, revision = null } = {}) {
  const data = mkReposPrepareActorCoreData(actorData);
  data.flags ??= {};
  data.flags[MK_REPOS.FLAG_SCOPE] ??= {};
  if (vaultId) data.flags[MK_REPOS.FLAG_SCOPE][MK_REPOS.FLAG_VAULT_ID] = vaultId;
  if (revision !== null && revision !== undefined) data.flags[MK_REPOS.FLAG_SCOPE][MK_REPOS.FLAG_REVISION] = Number(revision);
  data.flags[MK_REPOS.FLAG_SCOPE][MK_REPOS.FLAG_LAST_SYNCED_AT] = new Date().toISOString();
  data.flags[MK_REPOS.FLAG_SCOPE][MK_REPOS.FLAG_TEMPLATE_ID] ??= `${mkReposSlugify(data.systemId ?? mkReposSystemId())}-${mkReposSlugify(data.type)}-auto-v1`;

  const embeddedItems = mkReposDuplicate(data.items ?? []);
  const embeddedEffects = mkReposDuplicate(data.effects ?? []);
  delete data.items;
  delete data.effects;

  if (targetActor) {
    if (!mkReposUserCanUseActor(targetActor)) throw new Error("You do not own this local Actor.");
    delete data.type;
    await targetActor.update(data, { mkReposPull: true, diff: false, recursive: false });
    await mkReposReplaceEmbeddedDocuments(targetActor, { items: embeddedItems, effects: embeddedEffects });
    return targetActor;
  }

  const created = await Actor.create(data, { mkReposPull: true });
  if (created) await mkReposReplaceEmbeddedDocuments(created, { items: embeddedItems, effects: embeddedEffects });
  return created;
}

async function mkReposPushActor(actor, { force = false } = {}) {
  if (!mkReposIsCharacterActor(actor)) throw new Error(`Actor type '${actor.type}' is not allowed by MK-Repos.`);
  if (!mkReposUserCanUseActor(actor)) throw new Error("You do not own this Actor.");

  const payload = mkReposBuildPayload(actor, { force });
  const result = await mkReposApi(payload);
  const newRevision = Number(result.revision ?? result.metadata?.revision ?? payload.baseRevision + 1);

  await actor.setFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_VAULT_ID, payload.vaultId);
  await actor.setFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_REVISION, newRevision);
  await actor.setFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_LAST_SYNCED_AT, new Date().toISOString());
  await actor.setFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_TEMPLATE_ID, payload.metadata.templateId);

  return { ...result, vaultId: payload.vaultId, revision: newRevision };
}

async function mkReposPullByVaultId(vaultId, { targetActor = null } = {}) {
  const result = await mkReposApi({ action: "get", vaultId });
  const actorJson = result.actorJson ?? result.character?.actorJson;
  if (!actorJson) throw new Error("Repository response did not include actorJson.");

  let actorData;
  try {
    actorData = typeof actorJson === "string" ? JSON.parse(actorJson) : actorJson;
  } catch (err) {
    throw new Error("Repository actorJson could not be parsed.");
  }

  if (!mkReposIsCharacterActor(actorData)) throw new Error(`Pulled Actor type '${actorData.type}' is not allowed by MK-Repos.`);

  const revision = Number(result.revision ?? result.character?.revision ?? 0);
  const actor = await mkReposImportActorData(actorData, { targetActor, vaultId, revision });
  return { actor, revision, result };
}

async function mkReposPullActor(actor) {
  const vaultId = actor.getFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_VAULT_ID);
  if (!vaultId) throw new Error("This Actor is not linked to a repository vaultId.");
  return mkReposPullByVaultId(vaultId, { targetActor: actor });
}

async function mkReposStatus(actor) {
  const vaultId = actor.getFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_VAULT_ID);
  if (!vaultId) return { linked: false };
  const result = await mkReposApi({ action: "getMeta", vaultId });
  return {
    linked: true,
    vaultId,
    localRevision: Number(actor.getFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_REVISION) || 0),
    remoteRevision: Number(result.character?.revision ?? 0),
    updatedAt: result.character?.updatedAt ?? ""
  };
}

function mkReposModal({ title, content, buttons = [], width = 620 }) {
  const overlay = document.createElement("div");
  overlay.className = "mk-repos-overlay";
  overlay.innerHTML = `
    <div class="mk-repos-modal" style="max-width: ${Number(width) || 620}px">
      <header class="mk-repos-modal-header">
        <h2>${mkReposEscapeHtml(title)}</h2>
        <button type="button" class="mk-repos-close" title="Close">×</button>
      </header>
      <section class="mk-repos-modal-content">${content}</section>
      <footer class="mk-repos-modal-footer"></footer>
    </div>`;

  const footer = overlay.querySelector(".mk-repos-modal-footer");
  const close = () => overlay.remove();
  overlay.querySelector(".mk-repos-close")?.addEventListener("click", close);
  overlay.addEventListener("click", event => {
    if (event.target === overlay) close();
  });

  for (const button of buttons) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `mk-repos-button ${button.class ?? ""}`.trim();
    el.innerHTML = button.icon ? `<i class="${button.icon}"></i> ${mkReposEscapeHtml(button.label)}` : mkReposEscapeHtml(button.label);
    el.addEventListener("click", async event => {
      try {
        if (button.close !== false) close();
        await button.callback?.(event, overlay);
      } catch (err) {
        console.error(`${MK_REPOS.MODULE_TITLE} button failed`, err);
        mkReposNotify(err.message ?? err, "error");
      }
    });
    footer.append(el);
  }

  document.body.append(overlay);
  return overlay;
}

function mkReposConfirm(message) {
  return Promise.resolve(window.confirm(message));
}

function mkReposPrompt(message, defaultValue = "") {
  return Promise.resolve(window.prompt(message, defaultValue));
}

function mkReposActorStatusHtml(actor) {
  const vaultId = actor.getFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_VAULT_ID) || "Not linked";
  const revision = actor.getFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_REVISION) ?? "-";
  const lastSynced = actor.getFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_LAST_SYNCED_AT) || "Never";
  const templateId = mkReposGetTemplateId(actor);

  return `
    <div class="mk-repos-status-grid">
      <div><strong>Actor</strong></div><div>${mkReposEscapeHtml(actor.name)}</div>
      <div><strong>Type</strong></div><div>${mkReposEscapeHtml(actor.type)}</div>
      <div><strong>System</strong></div><div>${mkReposEscapeHtml(mkReposSystemId())} ${mkReposEscapeHtml(mkReposSystemVersion())}</div>
      <div><strong>Vault ID</strong></div><div><code>${mkReposEscapeHtml(vaultId)}</code></div>
      <div><strong>Local Revision</strong></div><div>${mkReposEscapeHtml(revision)}</div>
      <div><strong>Template</strong></div><div><code>${mkReposEscapeHtml(templateId)}</code></div>
      <div><strong>Last Synced</strong></div><div>${mkReposEscapeHtml(lastSynced)}</div>
    </div>
    <p class="mk-repos-help">V1 stores full Actor JSON plus flattened sheet fields, items, and effects in Google Sheets. Push/Pull is manual to avoid accidental overwrites.</p>
  `;
}

function mkReposOpenActorPanel(actor) {
  if (!mkReposIsCharacterActor(actor)) {
    mkReposNotify(`Actor type '${actor.type}' is not enabled for MK-Repos.`, "warn");
    return;
  }

  mkReposModal({
    title: `MK-Repos: ${actor.name}`,
    content: mkReposActorStatusHtml(actor),
    buttons: [
      {
        label: "Link ID",
        icon: "fas fa-link",
        close: false,
        callback: async () => {
          const existing = actor.getFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_VAULT_ID) || mkReposRandomId();
          const vaultId = await mkReposPrompt("Vault ID for this character", existing);
          if (!vaultId) return;
          await actor.setFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_VAULT_ID, vaultId.trim());
          await actor.setFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_TEMPLATE_ID, mkReposGetTemplateId(actor));
          mkReposNotify(`Linked ${actor.name} to ${vaultId.trim()}.`);
        }
      },
      {
        label: "Push",
        icon: "fas fa-upload",
        callback: async () => {
          try {
            const result = await mkReposPushActor(actor);
            mkReposNotify(`Pushed ${actor.name} to repository. Revision ${result.revision}.`);
          } catch (err) {
            if (err.details?.error === "conflict") {
              const proceed = await mkReposConfirm(`Conflict detected. Repository revision is ${err.details.repositoryRevision}. Force push and overwrite it?`);
              if (proceed) {
                const result = await mkReposPushActor(actor, { force: true });
                mkReposNotify(`Force-pushed ${actor.name}. Revision ${result.revision}.`, "warn");
              }
              return;
            }
            throw err;
          }
        }
      },
      {
        label: "Pull",
        icon: "fas fa-download",
        callback: async () => {
          const proceed = await mkReposConfirm(`Pull repository version into ${actor.name}? This replaces local sheet data, items, and effects.`);
          if (!proceed) return;
          const result = await mkReposPullActor(actor);
          mkReposNotify(`Pulled ${result.actor.name}. Revision ${result.revision}.`);
        }
      },
      {
        label: "Status",
        icon: "fas fa-circle-info",
        close: false,
        callback: async () => {
          const status = await mkReposStatus(actor);
          if (!status.linked) {
            mkReposNotify(`${actor.name} is not linked to the repository.`, "warn");
            return;
          }
          const state = status.localRevision === status.remoteRevision ? "Synced" : "Different revisions";
          mkReposNotify(`${state}. Local ${status.localRevision}, repository ${status.remoteRevision}.`);
        }
      },
      {
        label: "Repository",
        icon: "fas fa-box-archive",
        callback: () => mkReposOpenBrowser()
      }
    ]
  });
}

async function mkReposOpenBrowser() {
  let result;
  try {
    result = await mkReposApi({ action: "list" });
  } catch (err) {
    mkReposNotify(err.message ?? err, "error");
    return;
  }

  const characters = result.characters ?? [];
  const rows = characters.length ? characters.map(ch => `
    <tr data-vault-id="${mkReposEscapeHtml(ch.vaultId)}">
      <td><strong>${mkReposEscapeHtml(ch.name)}</strong></td>
      <td>${mkReposEscapeHtml(ch.systemId)} ${mkReposEscapeHtml(ch.systemVersion)}</td>
      <td>${mkReposEscapeHtml(ch.level)}</td>
      <td>${mkReposEscapeHtml(ch.className)}</td>
      <td>${mkReposEscapeHtml(ch.revision)}</td>
      <td>${mkReposEscapeHtml(ch.updatedAt)}</td>
      <td><button type="button" class="mk-repos-row-pull" data-vault-id="${mkReposEscapeHtml(ch.vaultId)}"><i class="fas fa-download"></i></button></td>
    </tr>
  `).join("") : `<tr><td colspan="7">No characters found in repository.</td></tr>`;

  const overlay = mkReposModal({
    title: "MK-Repos Repository",
    width: 900,
    content: `
      <table class="mk-repos-table">
        <thead>
          <tr><th>Name</th><th>System</th><th>LV</th><th>Class</th><th>Rev</th><th>Updated</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `,
    buttons: [
      { label: "Close", icon: "fas fa-xmark" }
    ]
  });

  overlay.querySelectorAll(".mk-repos-row-pull").forEach(button => {
    button.addEventListener("click", async event => {
      const vaultId = event.currentTarget.dataset.vaultId;
      const existing = mkReposFindActorByVaultId(vaultId);
      const message = existing
        ? `Pull repository character into existing local Actor '${existing.name}'?`
        : "Create this repository character as a new local Actor?";
      const proceed = await mkReposConfirm(message);
      if (!proceed) return;
      try {
        const result = await mkReposPullByVaultId(vaultId, { targetActor: existing });
        mkReposNotify(`Pulled ${result.actor.name}. Revision ${result.revision}.`);
        overlay.remove();
      } catch (err) {
        console.error(`${MK_REPOS.MODULE_TITLE} pull failed`, err);
        mkReposNotify(err.message ?? err, "error");
      }
    });
  });
}

function mkReposInjectSheetButton(app, html) {
  if (!game.settings.get(MK_REPOS.ID, "showSheetButton")) return;
  const actor = mkReposActorFromApp(app);
  if (!mkReposIsCharacterActor(actor)) return;
  if (!mkReposUserCanUseActor(actor)) return;

  const root = mkReposGetRootElement(html, app);
  if (!root || root.querySelector(".mk-repos-sheet-button")) return;

  const header = root.querySelector(".window-header") ?? root.querySelector("header.window-header") ?? root;
  const button = document.createElement("a");
  button.className = "mk-repos-sheet-button";
  button.title = "MK-Repos Character Repository";
  button.innerHTML = `<i class="fas fa-box-archive"></i>`;
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    mkReposOpenActorPanel(actor);
  });

  // Try to place before close buttons on V1/V2 sheets.
  const close = header.querySelector(".close") ?? header.querySelector("[data-action='close']");
  if (close?.parentElement === header) header.insertBefore(button, close);
  else header.append(button);
}

function mkReposRegisterRenderHooks() {
  const inject = (app, html, data) => {
    try { mkReposInjectSheetButton(app, html, data); }
    catch (err) { console.warn(`${MK_REPOS.MODULE_TITLE} sheet injection failed`, err); }
  };

  Hooks.on("renderActorSheet", inject);
  Hooks.on("renderActorSheetV2", inject);
  Hooks.on("renderDocumentSheet", inject);
}

function mkReposExposeApi() {
  game.mkRepos = {
    openBrowser: mkReposOpenBrowser,
    openActorPanel: mkReposOpenActorPanel,
    pushActor: mkReposPushActor,
    pullActor: mkReposPullActor,
    pullByVaultId: mkReposPullByVaultId,
    status: mkReposStatus,
    buildPayload: mkReposBuildPayload
  };
}

Hooks.once("init", () => {
  mkReposRegisterSettings();
});

Hooks.once("ready", () => {
  mkReposRegisterRenderHooks();
  mkReposExposeApi();
  console.log(`${MK_REPOS.MODULE_TITLE} | Ready v1.0.0 for Foundry ${mkReposGameVersion()} / system ${mkReposSystemId()} ${mkReposSystemVersion()}`);
});
