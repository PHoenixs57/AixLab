# Agent Note: 权限预设标签随界面语言本地化

Status: implemented

[English](2026-08-15-locale-aware-permission-preset-labels.md) | 中文

## Problem

Access 选择器（编辑器 chip、`/permission` 弹层）与「通用」设置中的权限行过去一律把预设名经 kebab 转 Title Case 的变换渲染（`workspace-write` → `Workspace Write`），或使用固定产品标签 `Full access`。GUI 的其他产品文案均为中文，因此 `read-only`、`workspace-write`、`danger-full-access` 这三个预设标签即使在中文界面下也保持英文，而把 "Workspace Write" 直译成中文又无法准确表达该模式的实际权限范围。

## Decision

三个产品已知的机器值现在通过活动界面的语言字典本地化。各属主命名空间（ui-conversation 的 `conversation`，ui-permission-presets 的 `permission.access` 与 `settings.permission`）都携带 `preset.read-only` / `preset.workspace-write` / `preset.danger-full-access` 键：中文为「只读 / 工作区写入 / 完全访问」，其余语言保持原有的英文标签。ui-permission-presets 的 `displayPresetLabel(value, fallback, t)` 把已知机器值解析到绑定的翻译函数，其他 host 配置的名称继续沿用原有显示（kebab 转 Title Case 或原样透传）。编辑器 chip 因两个 bundle 可独立加载，各自持有同一份键映射的安全副本。风险确认文案仍保留产品标签 `Full access`（不变）；本次只本地化模式标签本身。

## Testing

组件测试在两种语言下运行：`input-bar.client.spec.tsx` 经 zh 字典断言中文标签；`ui-permission-presets` 的各 spec 继续经 en 字典断言英文标签。组装态浏览器场景更新其中文断言（`settings-chrome.e2e.ts`、`access-confirmation.e2e.ts`）与中文版 `settings-chrome/dialog.expected.md` golden；所有英文 locale 的快照保持不变。

## Alternatives considered

**在 host 投影中翻译标签。** 否决：投影只携带机器名与 host 标签，不含 locale 上下文，而浏览器界面本就拥有自己的 locale seat；在渲染层翻译能让 store 与投影保持与语言无关。

**把风险确认文案也改为「完全访问」。** 否决：超出标签改动的范围；确认文案是有意为之的产品文案，其翻译属于单独的文案决策。

## Consequences

中文界面的会话现在在全部权限界面上把三个产品已知的预设读作「只读 / 工作区写入 / 完全访问」（编辑器 chip、`/permission` 弹层、「通用」设置行）；其他语言与 host 配置的自定义预设名保持原有显示。中文组装态浏览器断言与 golden 相应更新；英文侧行为逐字节不变。若 host 配置的预设机器值与产品已知键冲突（例如名为 `read-only` 但带自定义显示名的预设），中文界面将显示本地化标签而非自定义名称。
