/**
 * Settings card for the model fallback chain.
 *
 * Lets the user see and reorder the models the session falls back to when
 * the active one runs out of quota, and turn the behavior off entirely.
 *
 * The chain is never allowed to reach zero entries from this UI: an empty
 * stored chain reads back as the built-in default (see
 * `getStoredFallbackChain`), so "remove everything" would silently restore
 * the defaults instead of disabling anything. The toggle is the one way off.
 */

import type { ModelRef } from "../models/fallback-chain.js";
import {
  addChainEntry,
  moveChainEntry,
  removeChainEntry,
} from "../models/fallback-chain.js";
import { createToggleRow } from "./extensions-hub-components.js";
import { createOverlayButton } from "./overlay-dialog.js";
import { showToast } from "./toast.js";

/** A model the user can add to the chain. */
export interface SelectableModel {
  provider: string;
  id: string;
  name?: string;
}

export interface FallbackChainCardDeps {
  getEnabled: () => Promise<boolean>;
  setEnabled: (enabled: boolean) => Promise<void>;
  getChain: () => Promise<ModelRef[]>;
  setChain: (chain: readonly ModelRef[]) => Promise<void>;
  /** Models from providers the user is currently logged into. */
  listSelectableModels: () => SelectableModel[];
}

function modelLabel(ref: ModelRef, catalog: readonly SelectableModel[]): string {
  const match = catalog.find((m) => m.provider === ref.provider && m.id === ref.id);
  return match?.name && match.name !== match.id ? match.name : ref.id;
}

export function createFallbackChainCard(deps: FallbackChainCardDeps): HTMLElement {
  const card = document.createElement("div");
  card.className = "pi-overlay-surface pi-settings-fallback-card";

  const toggle = createToggleRow({
    label: "Switch model when quota runs out",
    sublabel:
      "On a rate limit or exhausted daily allowance, continue the turn with the next model below.",
  });
  toggle.input.disabled = true;

  const list = document.createElement("ol");
  list.className = "pi-fallback-list";

  const addRow = document.createElement("div");
  addRow.className = "pi-fallback-add";

  const select = document.createElement("select");
  select.className = "pi-fallback-select";
  select.setAttribute("aria-label", "Model to add to the fallback chain");

  const addButton = createOverlayButton({ text: "Add" });
  addButton.disabled = true;
  addRow.append(select, addButton);

  const hint = document.createElement("p");
  hint.className = "pi-overlay-hint pi-settings-fallback-hint";
  hint.textContent =
    "Tried top to bottom, each model at most once per message. "
    + "Models from providers you are no longer logged into are skipped.";

  card.append(toggle.root, list, addRow, hint);

  let chain: ModelRef[] = [];
  let busy = false;

  const persist = async (next: ModelRef[]): Promise<void> => {
    if (busy) return;
    busy = true;

    const previous = chain;
    chain = next;
    render();

    try {
      await deps.setChain(next);
    } catch {
      chain = previous;
      render();
      showToast("Couldn't save the fallback chain.");
    } finally {
      busy = false;
      render();
    }
  };

  function renderAddOptions(): void {
    const catalog = deps.listSelectableModels();
    const inChain = new Set(chain.map((ref) => `${ref.provider}\u0000${ref.id}`));
    const available = catalog.filter((m) => !inChain.has(`${m.provider}\u0000${m.id}`));

    select.replaceChildren();

    if (available.length === 0) {
      const empty = document.createElement("option");
      empty.textContent = "No other models available";
      empty.value = "";
      select.appendChild(empty);
      select.disabled = true;
      addButton.disabled = true;
      return;
    }

    select.disabled = busy;
    addButton.disabled = busy;

    for (const model of available) {
      const option = document.createElement("option");
      option.value = JSON.stringify({ provider: model.provider, id: model.id });
      option.textContent = `${model.name ?? model.id} · ${model.provider}`;
      select.appendChild(option);
    }
  }

  function render(): void {
    const catalog = deps.listSelectableModels();
    list.replaceChildren();

    chain.forEach((ref, index) => {
      const item = document.createElement("li");
      item.className = "pi-fallback-item";

      const label = document.createElement("span");
      label.className = "pi-fallback-item__label";
      label.textContent = modelLabel(ref, catalog);

      const provider = document.createElement("span");
      provider.className = "pi-fallback-item__provider";
      provider.textContent = ref.provider;

      const actions = document.createElement("span");
      actions.className = "pi-fallback-item__actions";

      const up = document.createElement("button");
      up.type = "button";
      up.className = "pi-fallback-item__action";
      up.textContent = "↑";
      up.setAttribute("aria-label", `Move ${ref.id} up`);
      up.disabled = busy || index === 0;
      up.addEventListener("click", () => {
        void persist(moveChainEntry(chain, index, -1));
      });

      const down = document.createElement("button");
      down.type = "button";
      down.className = "pi-fallback-item__action";
      down.textContent = "↓";
      down.setAttribute("aria-label", `Move ${ref.id} down`);
      down.disabled = busy || index === chain.length - 1;
      down.addEventListener("click", () => {
        void persist(moveChainEntry(chain, index, 1));
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "pi-fallback-item__action pi-fallback-item__action--remove";
      remove.textContent = "✕";
      remove.setAttribute("aria-label", `Remove ${ref.id} from the chain`);
      // The last entry cannot be removed: an empty chain reads back as the
      // default, so removing it would restore the defaults, not disable them.
      remove.disabled = busy || chain.length <= 1;
      if (chain.length <= 1) {
        remove.title = "Use the toggle above to turn fallback off.";
      }
      remove.addEventListener("click", () => {
        void persist(removeChainEntry(chain, index));
      });

      actions.append(up, down, remove);
      item.append(label, provider, actions);
      list.appendChild(item);
    });

    renderAddOptions();
  }

  addButton.addEventListener("click", () => {
    const raw = select.value;
    if (!raw) return;

    let ref: ModelRef;
    try {
      ref = JSON.parse(raw) as ModelRef;
    } catch {
      return;
    }

    void persist(addChainEntry(chain, ref));
  });

  toggle.input.addEventListener("change", () => {
    const next = toggle.input.checked;
    toggle.input.disabled = true;

    void deps.setEnabled(next).then(
      () => {
        card.classList.toggle("pi-settings-fallback-card--off", !next);
        showToast(
          next
            ? "Pi will switch models when a quota runs out."
            : "Pi will stop on quota errors instead of switching models.",
        );
      },
      () => {
        toggle.input.checked = !next;
        showToast("Couldn't update the fallback setting.");
      },
    ).finally(() => {
      toggle.input.disabled = false;
    });
  });

  // Initial load: the card renders empty and fills in once settings resolve.
  void Promise.all([deps.getEnabled(), deps.getChain()]).then(
    ([enabled, stored]) => {
      chain = stored;
      toggle.input.checked = enabled;
      toggle.input.disabled = false;
      card.classList.toggle("pi-settings-fallback-card--off", !enabled);
      render();
    },
    () => {
      hint.textContent = "Couldn't load the fallback settings.";
    },
  );

  return card;
}
