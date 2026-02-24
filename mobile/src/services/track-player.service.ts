type TrackInput = {
  url: string
  title: string
  artist: string
}

type TrackPlayerLike = {
  setupPlayer: () => Promise<void>
  stop: () => Promise<void>
  reset: () => Promise<void>
  add: (track: TrackInput) => Promise<void>
  play: () => Promise<void>
}

let cachedPlayer: TrackPlayerLike | null | undefined

const resolveTrackPlayer = (): TrackPlayerLike | null => {
  if (cachedPlayer !== undefined) {
    return cachedPlayer
  }

  try {
    const mod = require('react-native-track-player') as TrackPlayerLike
    cachedPlayer = mod ?? null
  } catch {
    cachedPlayer = null
  }

  return cachedPlayer
}

export const isTrackPlayerAvailable = (): boolean => Boolean(resolveTrackPlayer())

export const setupTrackPlayer = async (): Promise<void> => {
  const player = resolveTrackPlayer()
  if (!player) {
    throw new Error('Track player native module is not available in this build.')
  }
  await player.setupPlayer()
}

export const resetTrackPlayer = async (): Promise<void> => {
  const player = resolveTrackPlayer()
  if (!player) return
  await player.reset()
}

export const stopTrackPlayer = async (): Promise<void> => {
  const player = resolveTrackPlayer()
  if (!player) return
  await player.stop()
}

export const addTrack = async (track: TrackInput): Promise<void> => {
  const player = resolveTrackPlayer()
  if (!player) {
    throw new Error('Track player native module is not available in this build.')
  }
  await player.add(track)
}

export const playTrack = async (): Promise<void> => {
  const player = resolveTrackPlayer()
  if (!player) {
    throw new Error('Track player native module is not available in this build.')
  }
  await player.play()
}
