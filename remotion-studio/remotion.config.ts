import { Config } from '@remotion/cli/config'

// Headless-friendly defaults: overwrite outputs, jpeg frames, H.264 mp4.
Config.setOverwriteOutput(true)
Config.setVideoImageFormat('jpeg')
