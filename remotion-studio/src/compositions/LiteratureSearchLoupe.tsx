import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { entranceSpring, palette } from '../design'

// Literature search "loupe scan" motion spec: the brand magnifier sweeps back
// and forth across a document sheet, its ring drawing in at the top of the
// loop while a soft glow pulses. Seamless 3s loop. The in-app animation on
// the literature search tool row (LiteratureRow.module.css) is ported from
// these exact keyframes — sweep translate/rotate percentages and the glow
// pulse — so the two stay in sync by construction.
const DURATION = 90

export const LiteratureSearchLoupe: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  // Remotion 4 has no `loop()` helper export — modulo is the same math.
  const t = frame % DURATION

  const sweep = Math.sin((t / DURATION) * Math.PI * 2)
  const ring = spring({ frame: t - 6, fps, config: entranceSpring })
  const glow = interpolate(Math.sin((t - 24) / 14), [-1, 1], [0.25, 0.6])

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(140% 140% at 50% 0%, ${palette.paper} 0%, ${palette.bubble} 100%)`,
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      {/* document sheet with reading lines */}
      <div
        style={{
          width: 300,
          height: 190,
          padding: 22,
          background: palette.paper,
          border: `1.5px solid ${palette.border}`,
          borderRadius: 14,
          boxShadow: '0 14px 34px rgba(11, 16, 32, 0.12)',
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: 12,
              marginBottom: 14,
              borderRadius: 6,
              background: i === 0 ? palette.primary : '#D9DFEE',
              width: i === 0 ? 150 : '100%',
            }}
          />
        ))}
        <div style={{ height: 12, borderRadius: 6, background: '#D9DFEE', width: '62%' }} />
      </div>

      {/* sweeping magnifier, centered over the sheet */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `translateX(${sweep * 110}px) rotate(${sweep * 7}deg)`,
        }}
      >
        <svg
          width={84}
          height={84}
          viewBox="0 0 24 24"
          fill="none"
          style={{
            filter: `drop-shadow(0 0 ${6 + glow * 12}px rgba(77, 107, 254, ${glow}))`,
          }}
        >
          <circle
            cx={14.5}
            cy={14}
            r={4}
            stroke={palette.primary}
            strokeWidth={1.4}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={`${ring} ${1 - ring}`}
            transform="rotate(-90 14.5 14)"
          />
          <circle cx={14.5} cy={14} r={1.15} fill={palette.primary} opacity={ring} />
          <path
            d="M17.4 16.9L20.5 20L19.5 21L16.4 17.9L17.4 16.9Z"
            fill={palette.primary}
            opacity={ring}
          />
        </svg>
      </div>
    </AbsoluteFill>
  )
}
