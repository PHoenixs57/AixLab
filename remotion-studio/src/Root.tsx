import { Composition } from 'remotion'
import { AixlabLogoEntrance } from './compositions/AixlabLogoEntrance'
import { ChatTypingDots } from './compositions/ChatTypingDots'
import { GradientBackdropLoop } from './compositions/GradientBackdropLoop'
import { LiteratureSearchLoupe } from './compositions/LiteratureSearchLoupe'
import { MessageBubbleEntrance } from './compositions/MessageBubbleEntrance'

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="AixlabLogoEntrance"
      component={AixlabLogoEntrance}
      durationInFrames={120}
      fps={30}
      width={480}
      height={480}
    />
    <Composition
      id="ChatTypingDots"
      component={ChatTypingDots}
      durationInFrames={60}
      fps={30}
      width={360}
      height={120}
    />
    <Composition
      id="MessageBubbleEntrance"
      component={MessageBubbleEntrance}
      durationInFrames={90}
      fps={30}
      width={720}
      height={400}
    />
    <Composition
      id="LiteratureSearchLoupe"
      component={LiteratureSearchLoupe}
      durationInFrames={90}
      fps={30}
      width={480}
      height={320}
    />
    <Composition
      id="GradientBackdropLoop"
      component={GradientBackdropLoop}
      durationInFrames={240}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
)
