import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { palette } from '../design'

// Three-dot "assistant is typing" indicator. Seamless 2s loop; render as GIF
// (`--codec=gif`) for use as a chat loading asset.
export const ChatTypingDots: React.FC = () => {
  const frame = useCurrentFrame() % 60
  const dots = [0, 1, 2].map((i) => {
    const t = frame - i * 8
    const phase = Math.max(0, Math.sin((t / 60) * Math.PI * 2))
    return {
      y: -phase * 9,
      opacity: 0.45 + phase * 0.55,
    }
  })

  return (
    <AbsoluteFill
      style={{
        background: palette.bubble,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 14,
          padding: '24px 34px',
          background: palette.paper,
          border: `1.5px solid ${palette.border}`,
          borderRadius: 999,
          boxShadow: '0 10px 28px rgba(11, 16, 32, 0.10)',
        }}
      >
        {dots.map((d, i) => (
          <div
            key={i}
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: palette.primary,
              opacity: d.opacity,
              transform: `translateY(${d.y}px)`,
            }}
          />
        ))}
      </div>
    </AbsoluteFill>
  )
}
