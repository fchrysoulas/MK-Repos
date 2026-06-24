import {
  MK_REPOS,
  mkReposActorTypeKey,
  mkReposAllowedActorTypeNames,
  mkReposActorList,
  mkReposActorById,
  mkReposEscapeHtml,
  mkReposIsCharacterActor,
  mkReposNotify,
  mkReposPullActor,
  mkReposPushActor,
  mkReposSupportedActorTypes,
  mkReposSystemId,
  mkReposSystemVersion,
  mkReposTestConnection,
  mkReposUserCanUseActor
} from "./mk-repos-core.js";

function mkReposProgressFrame() {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

function mkReposRemoveElement(element) {
  if (!element) return;
  if (typeof element.remove === "function") element.remove();
  else element.parentNode?.removeChild?.(element);
}

export function mkReposCloseProgressOverlays() {
  document.querySelectorAll(".mk-repos-progress-overlay").forEach(mkReposRemoveElement);
}

export function mkReposShowProgress(message) {
  mkReposCloseProgressOverlays();

  const overlay = document.createElement("div");
  overlay.className = "mk-repos-progress-overlay";
  overlay.innerHTML = `
    <div class="mk-repos-progress-panel" role="status" aria-live="polite">
      <div class="mk-repos-progress-title">Please wait</div>
      <div class="mk-repos-progress-message">${mkReposEscapeHtml(message)}</div>
      <div class="mk-repos-progress-track" aria-hidden="true">
        <div class="mk-repos-progress-bar"></div>
      </div>
    </div>
  `;
  document.body.append(overlay);

  return {
    update(nextMessage) {
      const messageEl = overlay.querySelector(".mk-repos-progress-message");
      if (messageEl) messageEl.textContent = String(nextMessage ?? "");
    },
    close() {
      mkReposRemoveElement(overlay);
    }
  };
}

export async function mkReposWithProgress(message, callback) {
  const progress = mkReposShowProgress(message);
  try {
    await mkReposProgressFrame();
    return await Promise.resolve(callback(progress));
  } finally {
    progress.close();
    mkReposCloseProgressOverlays();
    setTimeout(mkReposCloseProgressOverlays, 0);
  }
}

export async function mkReposRunConnectionTest() {
  const result = await mkReposWithProgress("Testing Google Sheets connection...", () => mkReposTestConnection());
  const testId = result.testId ? ` (${result.testId})` : "";
  mkReposNotify(`Connection OK. Dummy record added${testId}.`);
  return result;
}

export function mkReposModal({ title, content, buttons = [], width = 620 }) {
  const overlay = document.createElement("div");
  overlay.className = "mk-repos-overlay";
  overlay.innerHTML = `
    <div class="mk-repos-modal" style="max-width: ${Number(width) || 620}px">
      <header class="mk-repos-modal-header">
        <h2>${mkReposEscapeHtml(title)}</h2>
        <button type="button" class="mk-repos-close" title="Close">&times;</button>
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

export function mkReposConfirm(message) {
  return Promise.resolve(window.confirm(message));
}

export function mkReposAllowedActorTypesPanelHtml() {
  const supported = mkReposSupportedActorTypes();
  const allowed = new Set(mkReposAllowedActorTypeNames().map(mkReposActorTypeKey));
  const rows = supported.length ? supported.map(type => {
    const id = `mk-repos-actor-type-${mkReposActorTypeKey(type).replace(/[^a-z0-9_-]+/g, "-")}`;
    return `
      <label class="mk-repos-check-row" for="${mkReposEscapeHtml(id)}">
        <input id="${mkReposEscapeHtml(id)}" type="checkbox" data-mk-repos-actor-type="${mkReposEscapeHtml(type)}" ${allowed.has(mkReposActorTypeKey(type)) ? "checked" : ""}>
        <span>${mkReposEscapeHtml(type)}</span>
      </label>
    `;
  }).join("") : `<p class="mk-repos-help">This system did not report any Actor types.</p>`;

  return `
    <div class="mk-repos-settings-panel">
      <p class="mk-repos-help">Choose which Actor types MK-Repos may push, pull, and show in the repository grid.</p>
      <div class="mk-repos-check-list">${rows}</div>
    </div>
  `;
}

export function mkReposOpenAllowedActorTypesPanel() {
  return mkReposModal({
    title: "Allowed Actor Types",
    content: mkReposAllowedActorTypesPanelHtml(),
    buttons: [
      {
        label: "Save",
        icon: "fas fa-save",
        callback: async (event, modal) => {
          const selected = Array.from(modal.querySelectorAll("[data-mk-repos-actor-type]:checked"))
            .map(input => input.dataset.mkReposActorType)
            .filter(Boolean);
          if (!selected.length) throw new Error("Choose at least one Actor type.");
          await game.settings.set(MK_REPOS.ID, "allowedActorTypes", selected.join(","));
          if (mkReposRepositoryApp?.render) await mkReposRenderRepositoryApp(mkReposRepositoryApp);
          mkReposNotify(`Allowed Actor Types saved: ${selected.join(", ")}.`);
        }
      },
      { label: "Cancel", icon: "fas fa-xmark" }
    ]
  });
}

export async function mkReposPushActorWithPrompt(actor) {
  try {
    const result = await mkReposWithProgress(`Pushing ${actor.name}...`, () => mkReposPushActor(actor));
    mkReposNotify(`Pushed ${actor.name} to repository. Revision ${result.revision}.`);
    return result;
  } catch (err) {
    if (err.details?.error === "conflict") {
      const proceed = await mkReposConfirm(`Conflict detected. Repository revision is ${err.details.repositoryRevision}. Force push and overwrite it?`);
      if (proceed) {
        const result = await mkReposWithProgress(`Force-pushing ${actor.name}...`, () => mkReposPushActor(actor, { force: true }));
        mkReposNotify(`Force-pushed ${actor.name}. Revision ${result.revision}.`, "warn");
        return result;
      }
      return null;
    }
    throw err;
  }
}

export async function mkReposPullActorWithPrompt(actor) {
  const proceed = await mkReposConfirm(`Pull repository version into ${actor.name}? This replaces local sheet data, items, and effects.`);
  if (!proceed) return null;
  const result = await mkReposWithProgress(`Pulling ${actor.name}...`, () => mkReposPullActor(actor));
  mkReposNotify(`Pulled ${result.actor.name}. Revision ${result.revision}.`);
  return result;
}

function mkReposActorId(actor) {
  return actor?.id ?? actor?._id ?? actor?.uuid ?? "";
}

function mkReposElapsedHours(value) {
  if (!value) return "Never";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "Unknown";
  const hours = Math.max(0, Date.now() - timestamp) / 3600000;
  return hours.toFixed(2);
}

function mkReposRepositoryActors() {
  return mkReposActorList().filter(mkReposIsCharacterActor).sort((a, b) => {
    const aUsable = mkReposUserCanUseActor(a) ? 0 : 1;
    const bUsable = mkReposUserCanUseActor(b) ? 0 : 1;
    if (aUsable !== bUsable) return aUsable - bUsable;

    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
  });
}

function mkReposRowActionDisabled(actor, action) {
  if (!mkReposIsCharacterActor(actor)) return `disabled title="Actor type is not allowed"`;
  if (!mkReposUserCanUseActor(actor)) return `disabled title="You do not own this Actor"`;
  if (action === "pull" && !actor.getFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_VAULT_ID)) return `disabled title="Push once first to create a Vault ID"`;
  return "";
}

function mkReposRepositoryGridHtml() {
  const actors = mkReposRepositoryActors();
  const rows = actors.length ? actors.map(actor => {
    const actorId = mkReposActorId(actor);
    const vaultId = actor.getFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_VAULT_ID) || "";
    const localRevision = actor.getFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_REVISION) ?? "-";
    const lastSynced = actor.getFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_LAST_SYNCED_AT) || "";
    const lastSyncedLabel = mkReposElapsedHours(lastSynced);
    const rowClasses = [
      !mkReposIsCharacterActor(actor) ? "mk-repos-row-disabled" : "",
      !mkReposUserCanUseActor(actor) ? "mk-repos-row-disabled" : ""
    ].filter(Boolean).join(" ");

    return `
      <tr class="${mkReposEscapeHtml(rowClasses)}" data-actor-id="${mkReposEscapeHtml(actorId)}">
        <td class="mk-repos-cell-actor"><strong>${mkReposEscapeHtml(actor.name)}</strong></td>
        <td>${mkReposEscapeHtml(actor.type)}</td>
        <td>${mkReposEscapeHtml(mkReposSystemId())} ${mkReposEscapeHtml(mkReposSystemVersion())}</td>
        <td><code>${vaultId ? mkReposEscapeHtml(vaultId) : "-"}</code></td>
        <td>${mkReposEscapeHtml(localRevision)}</td>
        <td title="${mkReposEscapeHtml(lastSynced || "Never")}">${mkReposEscapeHtml(lastSyncedLabel)}</td>
        <td class="mk-repos-actions">
          <button type="button" data-mk-repos-action="push" data-actor-id="${mkReposEscapeHtml(actorId)}" ${mkReposRowActionDisabled(actor, "push")}>Push</button>
          <button type="button" data-mk-repos-action="pull" data-actor-id="${mkReposEscapeHtml(actorId)}" ${mkReposRowActionDisabled(actor, "pull")}>Pull</button>
        </td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="7" class="mk-repos-empty">No allowed local actors found.</td></tr>`;

  return `
    <section class="mk-repos-repository-view">
      <div class="mk-repos-grid-toolbar">
        <input type="search" class="mk-repos-grid-search" placeholder="Search actors..." aria-label="Search actors">
      </div>
      <div class="mk-repos-grid-scroll">
        <table class="mk-repos-actor-grid">
          <thead>
            <tr>
              <th>Actor</th>
              <th>Type</th>
              <th>System</th>
              <th>Vault ID</th>
              <th>LR</th>
              <th>Last Synced (h)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function mkReposContentElement(content) {
  if (content instanceof HTMLElement) return content;
  if (content?.[0] instanceof HTMLElement) return content[0];
  return null;
}

function mkReposRepositoryApplicationClass() {
  const BaseApplication = globalThis.foundry?.applications?.api?.ApplicationV2;
  if (!BaseApplication) return null;

  return class MKReposRepositoryApplication extends BaseApplication {
    static DEFAULT_OPTIONS = {
      id: "mk-repos-repository-controls",
      classes: ["mk-repos-application"],
      tag: "section",
      window: {
        title: "MK-Repos Sync",
        icon: "fas fa-box-archive",
        resizable: true
      },
      position: {
        width: 1180,
        height: 600
      }
    };

    async _renderHTML(context, options) {
      return mkReposRepositoryGridHtml();
    }

    _replaceHTML(result, content, options) {
      const root = mkReposContentElement(content);
      if (!root) return;
      root.innerHTML = result;
      mkReposActivateRepositoryGrid(root, this);
    }
  };
}

let mkReposRepositoryApp = null;
let mkReposRepositoryAppClass = null;

function mkReposRenderRepositoryApp(app) {
  try {
    return app.render({ force: true });
  } catch (err) {
    return app.render(true);
  }
}

async function mkReposRefreshRepositoryGrid(root, app) {
  if (app?.render) {
    await mkReposRenderRepositoryApp(app);
    return;
  }

  const current = root?.querySelector?.(".mk-repos-repository-view");
  if (!current) return;
  current.outerHTML = mkReposRepositoryGridHtml();
  mkReposActivateRepositoryGrid(root, app);
}

async function mkReposHandleRepositoryAction(action, actor, root, app) {
  if (action === "push") {
    await mkReposPushActorWithPrompt(actor);
    await mkReposRefreshRepositoryGrid(root, app);
    return;
  }

  if (action === "pull") {
    await mkReposPullActorWithPrompt(actor);
    await mkReposRefreshRepositoryGrid(root, app);
  }
}

function mkReposActivateRepositoryGrid(root, app) {
  const search = root.querySelector(".mk-repos-grid-search");
  search?.addEventListener("input", event => {
    const query = String(event.currentTarget.value || "").trim().toLowerCase();
    root.querySelectorAll(".mk-repos-actor-grid tbody tr").forEach(row => {
      if (row.classList.contains("mk-repos-empty")) return;
      row.hidden = query ? !row.textContent.toLowerCase().includes(query) : false;
    });
  });

  root.querySelectorAll("[data-mk-repos-action]").forEach(button => {
    button.addEventListener("click", async event => {
      const target = event.currentTarget;
      const actor = mkReposActorById(target.dataset.actorId);
      const action = target.dataset.mkReposAction;
      if (!actor || !action) return;

      try {
        await mkReposHandleRepositoryAction(action, actor, root, app);
      } catch (err) {
        console.error(`${MK_REPOS.MODULE_TITLE} repository action failed`, err);
        mkReposNotify(err.message ?? err, "error");
      }
    });
  });
}

function mkReposOpenRepositoryModalFallback() {
  const overlay = mkReposModal({
    title: "MK-Repos Repository",
    width: 1180,
    content: mkReposRepositoryGridHtml(),
    buttons: [
      { label: "Close", icon: "fas fa-xmark" }
    ]
  });
  mkReposActivateRepositoryGrid(overlay, null);
  return overlay;
}

export function mkReposOpenRepositoryApp() {
  mkReposRepositoryAppClass ??= mkReposRepositoryApplicationClass();
  if (!mkReposRepositoryAppClass) return mkReposOpenRepositoryModalFallback();

  mkReposRepositoryApp ??= new mkReposRepositoryAppClass();
  mkReposRenderRepositoryApp(mkReposRepositoryApp);
  return mkReposRepositoryApp;
}

export function mkReposOpenActorPanel(actor) {
  return mkReposOpenRepositoryApp();
}

export function mkReposOpenSettingsPanel() {
  return mkReposOpenRepositoryApp();
}

export function mkReposOpenBrowser() {
  return mkReposOpenRepositoryApp();
}
