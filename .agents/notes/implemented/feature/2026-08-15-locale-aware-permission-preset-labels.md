# Agent Note: Locale-aware permission preset labels

Status: implemented

English | [中文](2026-08-15-locale-aware-permission-preset-labels.zh.md)

## Problem

The Access picker (composer chip, `/permission` popup) and the General-settings Permission row rendered every preset label from the machine name through a kebab-to-title-case transform (`workspace-write` → `Workspace Write`) or the fixed product label `Full access`. The GUI keeps Chinese product copy elsewhere, so the three preset labels — `read-only`, `workspace-write`, `danger-full-access` — stayed English even under the Chinese locale, and a literal Chinese rendering of "Workspace Write" would misstate what the mode actually allows.

## Decision

The three product-known machine values now localize through the active locale dictionary. Each owner namespace (`conversation` in ui-conversation, `permission.access` and `settings.permission` in ui-permission-presets) carries `preset.read-only` / `preset.workspace-write` / `preset.danger-full-access` keys: 只读 / 工作区写入 / 完全访问 in Chinese, the previous English labels otherwise. `displayPresetLabel(value, fallback, t)` in ui-permission-presets resolves a known machine value through the bound translation function and keeps the conventional display for any other host-configured name (title-cased kebab or pass-through). The composer chip keeps its own safety copy of the key map because the two bundles load independently. The risk-confirmation copy still names the product label `Full access` (unchanged); only the mode labels localize.

## Testing

The component specs run under both locales: `input-bar.client.spec.tsx` asserts the Chinese labels through the zh dictionary, while the `ui-permission-presets` specs keep asserting the English labels through the en dictionary. The assembled-browser scenarios update their Chinese assertions (`settings-chrome.e2e.ts`, `access-confirmation.e2e.ts`) and the zh `settings-chrome/dialog.expected.md` golden; all English-locale snapshots stay untouched.

## Alternatives considered

**Translate labels in the host projection.** Rejected: the projection carries machine names and host labels without locale context, and the browser surfaces already own locale seats; translating at render keeps the store and projection locale-free.

**Change the risk-confirmation copy to 完全访问 too.** Rejected as out of scope for the label change: the confirmation text is deliberate product copy whose translation is a separate copy decision.

## Consequences

Chinese-locale sessions now read the three product-known presets as 只读 / 工作区写入 / 完全访问 on every permission surface (composer chip, `/permission` popup, General-settings row); other locales and host-configured custom preset names keep their previous display. The zh assembled-browser assertions and golden shift accordingly; the en side is byte-identical in behavior. Hosts that configure a preset whose machine value collides with a product-known key (e.g. a `read-only` preset with a custom display name) now surface the localized label instead of the custom name in Chinese.
