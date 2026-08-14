import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { palette } from '../design'

// Slow aurora backdrop: three blurred brand-color blobs orbiting on a
// seamless 8s loop. Render as WebM (`--codec=vp8`) for an animated chat
// background or hero section.
const DURATION = 240

type Blob = { color: string; cx: number; cy: number; r: number; phase: number }

const blobs: Blob[] = [
  { color: palette.primary, cx: 480, cy: 540, r: 420, phase: 0 },
  { color: palette.teal, cx: 1440, cy: 540, r: 460, phase: 2.1 },
  { color: palette.violet, cx: 960, cy: 300, r: 380, phase: 4.2 },
]

export const GradientBackdropLoop: React.FC = () => {
  const t = useCurrentFrame() % DURATION
  const angle = (t / DURATION) * Math.PI * 2

  return (
    <AbsoluteFill style={{ background: palette.ink, overflow: 'hidden' }}>
      {blobs.map((b, i) => {
        const x = b.cx + Math.cos(angle + b.phase) * b.r * 0.55
        const y = b.cy + Math.sin(angle + b.phase) * b.r * 0.4
        const size = 620 + (i % 2) * 240
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x - size / 2,
              top: y - size / 2,
              width: size,
              height: size,
              borderRadius: '50%',
              background: b.color,
              opacity: 0.34,
              filter: 'blur(120px)',
            }}
          />
        )
      })}
    </AbsoluteFill>
  )
}
