# AixLab Remotion Studio

用 React 写「会动的界面素材」，headless 渲染成 GIF / WebM / MP4。服务于 AixLab 聊天界面的美化：logo 动效、加载指示、消息入场动画、动态背景。

## 命令

```bash
npm run render -- ChatTypingDots out/typing.gif --codec=gif   # 渲染 GIF
npm run render -- GradientBackdropLoop out/backdrop.webm --codec=vp8  # 渲染 WebM
npm run render -- AixlabLogoEntrance out/logo.mp4            # 默认 H.264 MP4
npm run still -- AixlabLogoEntrance --frame=120 out/logo.png  # 抽一帧
npm run studio                                                # 本地交互预览（需图形环境，服务器上不用）
```

- 所有产物写入 `out/`，不要写进 Web 应用的打包目录。
- 首次渲染会下载 headless Chrome 到 `node_modules/.remotion`（需要一次网络）。
- UI 素材建议：360–720p、30fps、2–8s，背景/指示器用无缝 `loop()`。

## 构图清单

| id | 尺寸 | 时长 | 用途 |
| --- | --- | --- | --- |
| `AixlabLogoEntrance` | 480×480 | 4s | 品牌 logo 入场（纸张滑入 + 放大镜描边 + 辉光） |
| `ChatTypingDots` | 360×120 | 2s 循环 | 「正在输入」三点指示器 |
| `MessageBubbleEntrance` | 720×400 | 3s | 助手消息气泡入场（弹入动画的运动规格） |
| `LiteratureSearchLoupe` | 480×320 | 3s 循环 | 文献检索「放大镜扫描」运动规格（放大镜往复扫动 + 辉光脉冲，页内检索行动画由此移植） |
| `GradientBackdropLoop` | 1920×1080 | 8s 循环 | 极光渐变背景 |

## 新增构图

1. 在 `src/compositions/` 新建 `<Name>.tsx`，复用 `src/design.ts` 里的 `palette` / `entranceSpring`。
2. 在 `src/Root.tsx` 里注册 `<Composition id durationInFrames fps width height component />`。
3. `npm run render -- <id> out/<name>.<ext>` 出片。

## 与聊天界面的关系

- 需要**素材文件**（GIF/WebM/MP4）→ 渲染后把 `out/` 路径交给下一步集成。
- 需要**页面内 CSS 动效** → 把构图里的 spring 参数（damping/stiffness/mass）和关键帧百分比原样翻译成 CSS `@keyframes`，颜色改用 `var(--dsw-alias-*)` 主题变量，落在 `packages/client/ui-*` 里；改完执行 `pnpm run build:web`（单包则 `pnpm exec tsdown`），刷新页面即可看到。
