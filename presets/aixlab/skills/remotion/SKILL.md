---
name: remotion
description: Use when the user asks to beautify or animate the chat interface (美化 / 动画 / 动效 / logo 动画 / 加载动画 / 头像动画), or wants animated assets (GIF / WebM / MP4) generated with Remotion. Also use when turning a UI motion idea into a renderable prototype or a CSS keyframe spec.
---

# Remotion motion-graphics skill

Remotion renders React compositions to video/GIF/WebM headlessly. In AixLab it serves two roles for chat-UI beautification: (a) produce **animated assets** (logo intro, typing indicator, background loops, message entrances) that can be dropped into the web app, and (b) act as a **motion spec** — the exact same easing/keyframes get ported to CSS in `packages/client/ui-*`.

## Layout

- Template project: `/home/penghao/work-space/claude-work/aixlab/remotion-studio` (independent npm project, already installed).
- Compositions are registered in `src/Root.tsx` and implemented in `src/compositions/*.tsx`.
- Brand palette and shared constants live in `src/design.ts` (primary `#4D6BFE` — the AixLab blue; keep new compositions on-palette).

## Existing compositions

| id | size / fps / length | purpose |
| --- | --- | --- |
| `AixlabLogoEntrance` | 480×480 / 30 / 4s | document+loupe brand mark: sheet slides in, loupe ring draws itself, glow pulse |
| `ChatTypingDots` | 360×120 / 30 / 2s loop | three-dot "assistant is typing" indicator, ready for GIF |
| `MessageBubbleEntrance` | 720×400 / 30 / 3s | assistant bubble springs in with avatar — the motion reference for in-chat message entrances |
| `GradientBackdropLoop` | 1920×1080 / 30 / 8s loop | slow aurora blob background, seamless loop |

## Commands

- Render a video/GIF: `npm run render -- <CompId> out/<name>.<ext>` (add `--codec=gif` for GIF, `--codec=vp8` for WebM; default H.264 MP4).
- Single frame: `npm run still -- <CompId> --frame=<n> out/<name>.png`.
- All outputs go to `remotion-studio/out/`. Do **not** use `npx remotion studio` — this environment is headless; `remotion render` uses the bundled headless Chrome (first run downloads the headless shell into `node_modules/.remotion`, needs network once).

## Workflow when asked to beautify the chat UI

1. **Clarify the target**: rendered asset (GIF/WebM/MP4 file) or in-app motion (CSS animation inside the web app). State which you chose in one line.
2. **Asset route**: pick/adapt a composition → render → report the output path, resolution, fps, duration, and whether it loops. UI assets stay small: 360–720p, 30 fps, 2–8 s.
3. **In-app route**: use Remotion as the timing spec. Port the same easing (`spring` config / `Easing.out(Easing.cubic)` values) and keyframe percentages into a CSS `@keyframes` in the relevant `packages/client/ui-*` package, reusing the `var(--dsw-alias-*)` theme variables — never hardcode new colors. Then rebuild (`pnpm run build:web`, or `pnpm exec tsdown` in the single client package) and tell the user to refresh the page.
4. **Adding a composition**: create `src/compositions/<Name>.tsx`, register it in `src/Root.tsx` with a `<Composition id durationInFrames fps width height component />`, then render. Keep loops seamless: wrap timing in `loop()`.

## Constraints

- Headless renderer only. If the headless-shell download fails, look for a system Chrome and pass `--browser-executable=<path>`; if neither works, report the network blocker instead of faking output.
- Never write rendered files into web-app bundles; keep them under `remotion-studio/out/`.
- Do not change theme CSS variables or brand strings while doing motion work.
