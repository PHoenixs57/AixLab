import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { entranceSpring, palette } from '../design'

// deepseek-aix brand mark entrance: the document sheet slides up, the loupe ring
// draws itself around the page, the handle follows, and a soft glow pulse
// settles in. Mirrors FishLogo's 24x24 geometry, scaled up.
export const AixlabLogoEntrance: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const sheet = spring({ frame: frame - 6, fps, config: entranceSpring })
  const ring = spring({ frame: frame - 22, fps, config: entranceSpring })
  const handle = spring({ frame: frame - 34, fps, config: entranceSpring })
  const wordmark = spring({ frame: frame - 48, fps, config: entranceSpring })
  const glow = interpolate(Math.sin((frame - 60) / 14), [-1, 1], [0.25, 0.6])

  const sheetY = interpolate(sheet, [0, 1], [-70, 0])
  const sheetOpacity = interpolate(sheet, [0, 0.4], [0, 1])

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 120% at 50% 20%, #1B2A66 0%, ${palette.ink} 62%)`,
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <svg
        width={330}
        height={330}
        viewBox="0 0 24 24"
        fill="none"
        style={{ overflow: 'visible' }}
      >
        {/* document sheet, sliding up */}
        <g
          transform={`translate(0 ${sheetY / 14})`}
          opacity={sheetOpacity}
        >
          <path
            d="M5 2.5C5 1.672 5.672 1 6.5 1H14.5L19 5.5V19.5C19 20.328 18.328 21 17.5 21H6.5C5.672 21 5 20.328 5 19.5V2.5Z"
            fill={palette.primary}
          />
          <path d="M14.5 1V5C14.5 5.276 14.724 5.5 15 5.5H19L14.5 1Z" fill={palette.primaryDark} />
        </g>

        {/* loupe ring, drawing itself */}
        <circle
          cx={14.5}
          cy={14}
          r={4}
          stroke={palette.paper}
          strokeWidth={1.1}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${ring} ${1 - ring}`}
          transform={`rotate(-90 14.5 14)`}
          style={{
            filter: `drop-shadow(0 0 ${6 + glow * 10}px rgba(77, 107, 254, ${glow}))`,
          }}
        />
        <circle cx={14.5} cy={14} r={1.15} fill={palette.paper} opacity={handle} />

        {/* handle */}
        <path
          d="M17.4 16.9L20.5 20L19.5 21L16.4 17.9L17.4 16.9Z"
          fill={palette.paper}
          opacity={handle}
        />
      </svg>

      {/* wordmark */}
      <div
        style={{
          marginTop: 44,
          fontSize: 64,
          fontWeight: 700,
          letterSpacing: 1.5,
          color: palette.paper,
          opacity: wordmark,
          transform: `translateY(${interpolate(wordmark, [0, 1], [24, 0])}px)`,
        }}
      >
        deepseek-aix
      </div>
    </AbsoluteFill>
  )
}
