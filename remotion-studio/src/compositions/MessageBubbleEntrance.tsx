import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { entranceSpring, palette } from '../design'

// Assistant message entrance: the bubble springs in from its bottom-left
// corner (the anchor point message bubbles grow from in chat UIs), the avatar
// pops right after. Port this exact spring + origin into CSS for in-app
// message entrances.
export const MessageBubbleEntrance: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const bubble = spring({ frame: frame - 8, fps, config: entranceSpring })
  const avatar = spring({ frame: frame - 24, fps, config: entranceSpring })
  const text = interpolate(bubble, [0, 0.5, 1], [0, 0, 1])

  const scale = interpolate(bubble, [0, 1], [0.55, 1])

  return (
    <AbsoluteFill
      style={{
        background: '#F5F7FB',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18 }}>
        {/* avatar: brand-gradient circle with the loupe glyph */}
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${palette.primary} 0%, ${palette.violet} 100%)`,
            alignItems: 'center',
            justifyContent: 'center',
            display: 'flex',
            boxShadow: '0 6px 16px rgba(77, 107, 254, 0.35)',
            transform: `scale(${avatar})`,
            transformOrigin: 'bottom center',
          }}
        >
          <svg width={30} height={30} viewBox="0 0 24 24" fill="none">
            <circle cx={14.5} cy={14} r={3.4} stroke={palette.paper} strokeWidth={1.4} />
            <path
              d="M17 16.5L20.2 19.7L19.2 20.7L16 17.5L17 16.5Z"
              fill={palette.paper}
            />
          </svg>
        </div>

        {/* message bubble */}
        <div
          style={{
            position: 'relative',
            maxWidth: 480,
            padding: '22px 26px',
            background: palette.paper,
            border: `1.5px solid ${palette.border}`,
            borderRadius: '8px 22px 22px 22px',
            boxShadow: '0 12px 30px rgba(11, 16, 32, 0.10)',
            opacity: bubble,
            transform: `scale(${scale})`,
            transformOrigin: 'bottom left',
          }}
        >
          <div
            style={{
              fontSize: 27,
              lineHeight: 1.5,
              color: palette.ink,
              opacity: text,
            }}
          >
            你好，我是 deepseek-aix 助手，
            <br />
            可以帮你搜集和整理文献 👋
          </div>
          <div
            style={{
              marginTop: 12,
              fontSize: 18,
              color: palette.muted,
              opacity: text,
            }}
          >
            10:24
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
