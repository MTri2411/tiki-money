import { Feather } from '@expo/vector-icons';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDuration } from '@/lib/money';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeTokens } from '@/theme/tokens';

const WAVE_BARS = 22;
const listeners = new Set<() => void>();

function stopOtherPlayers(keep: () => void) {
  for (const stop of listeners) {
    if (stop !== keep) stop();
  }
}

function waveUnits(seed: string) {
  let n = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    n ^= seed.charCodeAt(i);
    n = Math.imul(n, 16777619);
  }
  const units: number[] = [];
  for (let i = 0; i < WAVE_BARS; i += 1) {
    n = Math.imul(n ^ (n >>> 16), 2246822507);
    units.push(0.2 + ((n >>> 0) % 80) / 100);
  }
  return units;
}

type Props = {
  uri: string;
  durationSec: number;
};

export function VoiceNote({ uri, durationSec }: Props) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <VoiceChrome
        playing={false}
        progress={0}
        currentTime={0}
        durationSec={durationSec}
        seed={uri}
        onPlay={() => setArmed(true)}
      />
    );
  }
  return <VoiceNotePlayer uri={uri} durationSec={durationSec} />;
}

function VoiceNotePlayer({ uri, durationSec }: Props) {
  const player = useAudioPlayer({ uri }, { updateInterval: 80 });
  const status = useAudioPlayerStatus(player);
  const started = useRef(false);
  const playerRef = useRef(player);

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    const stop = () => {
      const current = playerRef.current;
      if (current.playing) current.pause();
    };
    listeners.add(stop);
    return () => {
      listeners.delete(stop);
    };
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    stopOtherPlayers(() => {
      const current = playerRef.current;
      if (current.playing) current.pause();
    });
    void setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    }).then(() => {
      player.play();
    });
  }, [player]);

  useEffect(() => {
    if (!status.didJustFinish) return;
    void player.seekTo(0);
  }, [player, status.didJustFinish]);

  const total = status.duration > 0 ? status.duration : durationSec;
  const progress = total > 0 ? Math.min(1, status.currentTime / total) : 0;

  const toggle = () => {
    if (status.playing) {
      player.pause();
      return;
    }
    stopOtherPlayers(() => {
      const current = playerRef.current;
      if (current.playing) current.pause();
    });
    void setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    }).then(() => {
      if (status.didJustFinish || (total > 0 && status.currentTime >= total - 0.08)) {
        void player.seekTo(0).then(() => player.play());
        return;
      }
      player.play();
    });
  };

  return (
    <VoiceChrome
      playing={status.playing}
      progress={progress}
      currentTime={status.currentTime}
      durationSec={total}
      seed={uri}
      onPlay={toggle}
    />
  );
}

function VoiceChrome({
  playing,
  progress,
  currentTime,
  durationSec,
  seed,
  onPlay,
}: {
  playing: boolean;
  progress: number;
  currentTime: number;
  durationSec: number;
  seed: string;
  onPlay: () => void;
}) {
  const { tokens } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const units = useMemo(() => waveUnits(seed), [seed]);
  const shown = playing || currentTime > 0.05 ? currentTime : durationSec;

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Tạm dừng ghi âm' : 'Nghe lại ghi âm'}
        hitSlop={6}
        onPress={onPlay}
        style={({ pressed }) => [styles.play, pressed && styles.playPressed]}
      >
        <Feather
          name={playing ? 'pause' : 'play'}
          size={15}
          color={tokens.accentInk}
          style={playing ? undefined : styles.playIcon}
        />
      </Pressable>
      <View style={styles.wave}>
        {units.map((unit, index) => {
          const reached = index / WAVE_BARS <= progress;
          return (
            <View
              key={index}
              style={[
                styles.bar,
                {
                  height: 4 + unit * 16,
                  backgroundColor: tokens.accent,
                  opacity: reached || playing ? 0.95 : 0.28,
                },
              ]}
            />
          );
        })}
      </View>
      <Text style={styles.time}>{formatDuration(shown)}</Text>
    </View>
  );
}

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    row: {
      minWidth: 168,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    play: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: t.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    playPressed: {
      opacity: 0.82,
    },
    playIcon: {
      marginLeft: 1,
    },
    wave: {
      flex: 1,
      height: 22,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    bar: {
      width: 2.5,
      borderRadius: 2,
    },
    time: {
      minWidth: 32,
      fontFamily: 'Inter_500Medium',
      fontSize: 12,
      color: t.ink2,
      textAlign: 'right',
    },
  });
}
