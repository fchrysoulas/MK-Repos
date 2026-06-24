import {
  MK_REPOS,
  mkReposApi,
  mkReposActorById,
  mkReposEscapeHtml,
  mkReposFindActorByVaultId,
  mkReposGetTemplateId,
  mkReposIsCharacterActor,
  mkReposNotify,
  mkReposPullActor,
  mkReposPullByVaultId,
  mkReposPushActor,
  mkReposRandomId,
  mkReposSelectableActors,
  mkReposStatus,
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

export function mkReposShowProgress(message) {
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
      overlay.remove();
    }
  };
}

export async function mkReposWithProgress(message, callback) {
  const progress = mkReposShowProgress(message);
  try {
    await mkReposProgressFrame();
    return await callback(progress);
  } finally {
    progress.close();
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

export function mkReposPrompt(message, defaultValue = "") {
  return Promise.resolve(window.prompt(message, defaultValue));
}

export async function mkReposLinkActor(actor) {
  const existing = actor.getFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_VAULT_ID) || mkReposRandomId();
  const vaultId = await mkReposPrompt("Vault ID for this character", existing);
  if (!vaultId) return null;
  await actor.setFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_VAULT_ID, vaultId.trim());
  await actor.setFlag(MK_REPOS.FLAG_SCOPE, MK_REPOS.FLAG_TEMPLATE_ID, mkReposGetTemplateId(actor));
  mkReposNotify(`Linked ${actor.name} to ${vaultId.trim()}.`);
  return vaultId.trim();
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

export async function mkReposNotifyActorStatus(actor) {
  const status = await mkReposWithProgress(`Checking ${actor.name} status...`, () => mkReposStatus(actor));
  if (!status.linked) {
    mkReposNotify(`${actor.name} is not linked to the repository.`, "warn");
    return status;
  }
  const state = status.localRevision === status.remoteRevision ? "Synced" : "Different revisions";
  mkReposNotify(`${state}. Local ${status.localRevision}, repository ${status.remoteRevision}.`);
  return status;
}

export function mkReposActorStatusHtml(actor) {
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

export function mkReposOpenActorPanel(actor) {
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
        callback: () => mkReposLinkActor(actor)
      },
      {
        label: "Push",
        icon: "fas fa-upload",
        callback: () => mkReposPushActorWithPrompt(actor)
      },
      {
        label: "Pull",
        icon: "fas fa-download",
        callback: () => mkReposPullActorWithPrompt(actor)
      },
      {
        label: "Status",
        icon: "fas fa-circle-info",
        close: false,
        callback: () => mkReposNotifyActorStatus(actor)
      },
      {
        label: "Repository",
        icon: "fas fa-box-archive",
        callback: () => mkReposOpenBrowser()
      }
    ]
  });
}

export function mkReposSettingsPanelHtml() {
  const actors = mkReposSelectableActors();
  const options = actors.length ? actors.map(actor => {
    const notes = [];
    if (!mkReposIsCharacterActor(actor)) notes.push("type not allowed");
    if (!mkReposUserCanUseActor(actor)) notes.push("not owned");
    const noteText = notes.length ? ` - ${notes.join(", ")}` : "";
    const actorId = actor.id ?? actor._id ?? actor.uuid ?? "";
    return `
      <option value="${mkReposEscapeHtml(actorId)}">${mkReposEscapeHtml(actor.name)} (${mkReposEscapeHtml(actor.type)})${mkReposEscapeHtml(noteText)}</option>
    `;
  }).join("") : `<option value="">No local actors found</option>`;

  return `
    <div class="mk-repos-settings-panel">
      <label class="mk-repos-field-label" for="mk-repos-actor-select">Local Character</label>
      <select id="mk-repos-actor-select" class="mk-repos-actor-select" ${actors.length ? "" : "disabled"}>
        ${options}
      </select>
      <div class="mk-repos-selected-status"></div>
      <p class="mk-repos-help">Use the module settings controls to manually push or pull character repository data.</p>
    </div>
  `;
}

export function mkReposSelectedSettingsActor(overlay) {
  const actorId = overlay.querySelector(".mk-repos-actor-select")?.value;
  const actor = mkReposActorById(actorId);
  if (!actor) throw new Error("Choose a local character first.");
  return actor;
}

export function mkReposRefreshSettingsActorStatus(overlay) {
  const status = overlay.querySelector(".mk-repos-selected-status");
  if (!status) return;

  const actorId = overlay.querySelector(".mk-repos-actor-select")?.value;
  const actor = mkReposActorById(actorId);
  if (!actor) {
    status.innerHTML = `<p class="mk-repos-help">No local actors are available in this world.</p>`;
    return;
  }

  const warnings = [];
  if (!mkReposIsCharacterActor(actor)) {
    warnings.push(`Actor type '${actor.type}' is not in Allowed Actor Types. Add '${actor.type}' to that module setting if this is your system's character type.`);
  }
  if (!mkReposUserCanUseActor(actor)) warnings.push("You do not own this Actor, so push and pull actions will be blocked.");

  status.innerHTML = `
    ${mkReposActorStatusHtml(actor)}
    ${warnings.map(message => `<p class="mk-repos-warning">${mkReposEscapeHtml(message)}</p>`).join("")}
  `;
}

export function mkReposOpenSettingsPanel() {
  const overlay = mkReposModal({
    title: "MK-Repos Settings",
    width: 760,
    content: mkReposSettingsPanelHtml(),
    buttons: [
      {
        label: "Link ID",
        icon: "fas fa-link",
        close: false,
        callback: async (event, modal) => {
          await mkReposLinkActor(mkReposSelectedSettingsActor(modal));
          mkReposRefreshSettingsActorStatus(modal);
        }
      },
      {
        label: "Push",
        icon: "fas fa-upload",
        close: false,
        callback: async (event, modal) => {
          await mkReposPushActorWithPrompt(mkReposSelectedSettingsActor(modal));
          mkReposRefreshSettingsActorStatus(modal);
        }
      },
      {
        label: "Pull",
        icon: "fas fa-download",
        close: false,
        callback: async (event, modal) => {
          await mkReposPullActorWithPrompt(mkReposSelectedSettingsActor(modal));
          mkReposRefreshSettingsActorStatus(modal);
        }
      },
      {
        label: "Status",
        icon: "fas fa-circle-info",
        close: false,
        callback: async (event, modal) => {
          await mkReposNotifyActorStatus(mkReposSelectedSettingsActor(modal));
          mkReposRefreshSettingsActorStatus(modal);
        }
      },
      {
        label: "Repository",
        icon: "fas fa-box-archive",
        callback: () => mkReposOpenBrowser()
      }
    ]
  });

  overlay.querySelector(".mk-repos-actor-select")?.addEventListener("change", () => mkReposRefreshSettingsActorStatus(overlay));
  mkReposRefreshSettingsActorStatus(overlay);
  return overlay;
}

export async function mkReposOpenBrowser() {
  let result;
  try {
    result = await mkReposWithProgress("Loading repository characters...", () => mkReposApi({ action: "list" }));
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
        const result = await mkReposWithProgress("Pulling repository character...", () => mkReposPullByVaultId(vaultId, { targetActor: existing }));
        mkReposNotify(`Pulled ${result.actor.name}. Revision ${result.revision}.`);
        overlay.remove();
      } catch (err) {
        console.error(`${MK_REPOS.MODULE_TITLE} pull failed`, err);
        mkReposNotify(err.message ?? err, "error");
      }
    });
  });
}
