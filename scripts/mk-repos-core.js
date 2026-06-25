export const MK_REPOS = {
  ID: "mk-repos",
  VERSION: "1.3.0",
  FLAG_SCOPE: "mk-repos",
  FLAG_VAULT_ID: "vaultId",
  FLAG_REVISION: "revision",
  FLAG_LAST_SYNCED_AT: "lastSyncedAt",
  FLAG_TEMPLATE_ID: "templateId",
  DEFAULT_ALLOWED_TYPES: "character,Player",
  LEGACY_DEFAULT_ALLOWED_TYPES: "character,Player",
  MODULE_TITLE: "MK-Repos"
};

export function mkReposGameVersion() {
  return game?.version ?? game?.data?.version ?? "unknown";
}

export function mkReposSystemId() {
  return game?.system?.id ?? game?.system?.data?.id ?? "unknown";
}

export function mkReposSystemVersion() {
  return game?.system?.version ?? game?.system?.data?.version ?? "unknown";
}

export function mkReposNotify(message, type = "info") {
  const uiType = ui?.notifications?.[type] ? type : "info";
  ui?.notifications?.[uiType]?.(`${MK_REPOS.MODULE_TITLE}: ${message}`);
}

export function mkReposDuplicate(data) {
  if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(data);
  if (typeof duplicate === "function") return duplicate(data);
  return JSON.parse(JSON.stringify(data));
}

export function mkReposGetProperty(object, path) {
  if (globalThis.foundry?.utils?.getProperty) return foundry.utils.getProperty(object, path);
  return path.split(".").reduce((o, k) => o?.[k], object);
}

export function mkReposSetProperty(object, path, value) {
  if (globalThis.foundry?.utils?.setProperty) return foundry.utils.setProperty(object, path, value);
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

export function mkReposRandomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.foundry?.utils?.randomID) return `mk-${foundry.utils.randomID(24)}`;
  return `mk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function mkReposSlugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

export function mkReposActorTypeKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function mkReposActorTypesFromString(value) {
  return String(value ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function mkReposAddActorType(types, value) {
  const type = String(value ?? "").trim();
  if (!type) return;
  const key = mkReposActorTypeKey(type);
  if (!types.some(existing => mkReposActorTypeKey(existing) === key)) types.push(type);
}

export function mkReposSupportedActorTypes() {
  const types = [];
  const actorConfig = globalThis.CONFIG?.Actor ?? {};
  const system = globalThis.game?.system ?? {};

  const addMany = values => {
    if (!values) return;
    if (typeof values === "string") {
      mkReposAddActorType(types, values);
      return;
    }
    if (typeof values[Symbol.iterator] !== "function") {
      addMany(Object.keys(values));
      return;
    }
    for (const value of values) mkReposAddActorType(types, value);
  };

  addMany(system.documentTypes?.Actor);
  addMany(Object.keys(actorConfig.typeLabels ?? {}));
  addMany(Object.keys(actorConfig.dataModels ?? {}));
  addMany(Object.keys(system.model?.Actor ?? {}));

  if (!types.length) addMany(mkReposActorList().map(actor => actor.type));
  if (!types.length) addMany(mkReposActorTypesFromString(MK_REPOS.LEGACY_DEFAULT_ALLOWED_TYPES));

  return types.sort((a, b) => String(a).localeCompare(String(b)));
}

export function mkReposDefaultAllowedActorTypes() {
  return mkReposSupportedActorTypes().join(",");
}

export function mkReposAllowedTypes() {
  const raw = game.settings.get(MK_REPOS.ID, "allowedActorTypes") || "";
  const requested = mkReposActorTypesFromString(raw);
  const supported = mkReposSupportedActorTypes();
  const supportedKeys = new Set(supported.map(mkReposActorTypeKey));
  const legacyDefault = mkReposActorTypesFromString(MK_REPOS.LEGACY_DEFAULT_ALLOWED_TYPES)
    .map(mkReposActorTypeKey)
    .sort()
    .join(",");
  const requestedKey = requested.map(mkReposActorTypeKey).sort().join(",");

  const types = (!requested.length || requestedKey === legacyDefault) ? supported : requested;
  const filtered = supportedKeys.size
    ? types.filter(type => supportedKeys.has(mkReposActorTypeKey(type)))
    : types;
  const finalTypes = filtered.length ? filtered : supported;

  return new Set(finalTypes.map(mkReposActorTypeKey).filter(Boolean));
}

export function mkReposAllowedActorTypeNames() {
  const allowed = mkReposAllowedTypes();
  return mkReposSupportedActorTypes().filter(type => allowed.has(mkReposActorTypeKey(type)));
}

export function mkReposIsCharacterActor(actor) {
  if (!actor) return false;
  return mkReposAllowedTypes().has(mkReposActorTypeKey(actor.type));
}

export function mkReposUserCanUseActor(actor) {
  if (!actor) return false;
  if (game.user?.isGM) return true;
  if (actor.isOwner) return true;
  return false;
}

export function mkReposEscapeHtml(value) {
  const div = document.createElement("div");
  div.innerText = String(value ?? "");
  return div.innerHTML;
}

export function mkReposGetTemplateId(actor) {
  const existing = actor?.getFlag?.(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_TEMPLATE_ID);
  if (existing) return existing;
  return `${mkReposSlugify(mkReposSystemId())}-${mkReposSlugify(actor?.type)}-auto-v1`;
}

export function mkReposFlattenFields({ actorData, templateId }) {
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

export function mkReposExtractSummary(actorData) {
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

export function mkReposItemQuantity(itemData) {
  const paths = ["system.quantity", "system.qty", "system.amount", "system.quantity.value", "system.uses.value"];
  for (const path of paths) {
    const value = mkReposGetProperty(itemData, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

export function mkReposItemEquipped(itemData) {
  const paths = ["system.equipped", "system.equipped.value", "system.carried", "system.active"];
  for (const path of paths) {
    const value = mkReposGetProperty(itemData, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

export function mkReposItemDescription(itemData) {
  const paths = ["system.description", "system.description.value", "system.description.unidentified", "description"];
  for (const path of paths) {
    const value = mkReposGetProperty(itemData, path);
    if (value !== undefined && value !== null && value !== "") return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
  return "";
}

export function mkReposExportActorData(actor) {
  const data = mkReposDuplicate(actor.toObject());

  delete data._id;
  delete data.folder;
  delete data.sort;

  if (!game.settings.get(MK_REPOS.ID, "preserveOwnershipOnImport")) delete data.ownership;

  data.flags ??= {};
  data.flags[MK_REPOS.FLAG_SCOPE] ??= {};

  return data;
}

export function mkReposBuildPayload(actor, { force = false } = {}) {
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

export async function mkReposApi(actionPayload) {
  const url = String(game.settings.get(MK_REPOS.ID, "appsScriptUrl") || "").trim();
  const token = String(game.settings.get(MK_REPOS.ID, "vaultToken") || "");

  if (!url) throw new Error("Missing Google Apps Script Web App URL in module settings.");
  if (!token) throw new Error("Missing MK-Repos repository token in module settings.");

  const response = await fetch(url, {
    method: "POST",
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

export function mkReposFindActorByVaultId(vaultId) {
  if (!vaultId) return null;
  return game.actors?.find?.(actor => actor.getFlag?.(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_VAULT_ID) === vaultId) ?? null;
}

export function mkReposActorList() {
  const collection = game.actors;
  if (!collection) return [];

  const actors = [];
  const addActor = actor => {
    if (!actor || !actor.type || !actor.name) return;
    const key = actor.uuid ?? actor.id ?? actor._id;
    const exists = key
      ? actors.some(existing => (existing.uuid ?? existing.id ?? existing._id) === key)
      : actors.includes(actor);
    if (!exists) actors.push(actor);
  };
  const addActors = values => {
    if (!values) return;
    for (const actor of values) addActor(actor);
  };

  if (Array.isArray(collection.contents)) addActors(collection.contents);
  if (typeof collection.filter === "function") addActors(collection.filter(actor => actor?.type));
  if (typeof collection.values === "function") addActors(Array.from(collection.values()));
  try {
    addActors(Array.from(collection));
  } catch (err) {
    // Some Foundry collection implementations are not directly iterable.
  }

  return actors;
}

export function mkReposSelectableActors() {
  return mkReposActorList()
    .sort((a, b) => {
      const aAllowed = mkReposIsCharacterActor(a) ? 0 : 1;
      const bAllowed = mkReposIsCharacterActor(b) ? 0 : 1;
      if (aAllowed !== bAllowed) return aAllowed - bAllowed;

      const aUsable = mkReposUserCanUseActor(a) ? 0 : 1;
      const bUsable = mkReposUserCanUseActor(b) ? 0 : 1;
      if (aUsable !== bUsable) return aUsable - bUsable;

      return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });
}

export function mkReposActorById(actorId) {
  if (!actorId) return null;
  return game.actors?.get?.(actorId) ?? mkReposActorList().find(actor => actor.id === actorId || actor._id === actorId || actor.uuid === actorId) ?? null;
}

export function mkReposPrepareActorCoreData(actorData) {
  const data = mkReposDuplicate(actorData);
  delete data._id;
  delete data.folder;
  delete data.sort;
  if (!game.settings.get(MK_REPOS.ID, "preserveOwnershipOnImport")) delete data.ownership;
  return data;
}

export async function mkReposReplaceEmbeddedDocuments(actor, actorData) {
  const incomingItems = mkReposDuplicate(actorData.items ?? []);
  const incomingEffects = mkReposDuplicate(actorData.effects ?? []);

  const currentItemIds = actor.items?.map?.(i => i.id) ?? [];
  if (currentItemIds.length) await actor.deleteEmbeddedDocuments("Item", currentItemIds, { mkReposPull: true });
  if (incomingItems.length) await actor.createEmbeddedDocuments("Item", incomingItems, { mkReposPull: true, keepId: true });

  const currentEffectIds = actor.effects?.map?.(e => e.id) ?? [];
  if (currentEffectIds.length) await actor.deleteEmbeddedDocuments("ActiveEffect", currentEffectIds, { mkReposPull: true });
  if (incomingEffects.length) await actor.createEmbeddedDocuments("ActiveEffect", incomingEffects, { mkReposPull: true, keepId: true });
}

export async function mkReposImportActorData(actorData, { targetActor = null, vaultId = null, revision = null } = {}) {
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

export async function mkReposPushActor(actor, { force = false } = {}) {
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

export async function mkReposListRepository() {
  const result = await mkReposApi({ action: "list" });
  return Array.isArray(result.characters) ? result.characters : [];
}

export async function mkReposPullByVaultId(vaultId, { targetActor = null } = {}) {
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

export async function mkReposPullActor(actor) {
  const vaultId = actor.getFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_VAULT_ID);
  if (!vaultId) throw new Error("This Actor is not linked to a repository vaultId.");
  return mkReposPullByVaultId(vaultId, { targetActor: actor });
}

export async function mkReposStatus(actor) {
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

export async function mkReposTestConnection() {
  try {
    return await mkReposApi({
      action: "testConnection",
      testId: `test-${mkReposRandomId()}`,
      owner: game.user?.name ?? "",
      systemId: mkReposSystemId(),
      systemVersion: mkReposSystemVersion(),
      foundryVersion: mkReposGameVersion(),
      message: "MK-Repos connection test"
    });
  } catch (err) {
    if (err.details?.error === "unknown_action") {
      const error = new Error("The deployed Google Apps Script does not include Test Connection yet. Paste the latest Apps Script code, then deploy a new Web App version.");
      error.details = err.details;
      throw error;
    }
    throw err;
  }
}
