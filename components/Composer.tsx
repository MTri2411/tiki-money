/* eslint-disable react-hooks/immutability, react-hooks/purity */
import { Feather } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { formatDuration } from '@/lib/money';
import { RECORD_CAP_SECONDS, recordingToPayload } from '@/lib/voice';
import { useTheme } from '@/theme/ThemeProvider';
import type { ThemeTokens } from '@/theme/tokens';

type Props = {
  inFlight: boolean;
  onSend: (text: string) => void;
  onAudio: (clip: {
    uri: string;
    base64: string;
    durationSec: number;
    mimeType: string;
  }) => void;
};

const WAVE_BARS = 28;
const RECORD_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

export function Composer({ inFlight, onSend, onAudio }: Props) {
  const { tokens, reduceMotion } = useTheme();
  const styles = useMemo(() => makeStyles(tokens), [tokens]);
  const recorder = useAudioRecorder(RECORD_OPTIONS);
  const recState = useAudioRecorderState(recorder, 80);
  const [value, setValue] = useState('');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [micHint, setMicHint] = useState<string | null>(null);
  const recordingRef = useRef(false);
  const finishing = useRef(false);
  const startedAt = useRef(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const capTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ready = value.trim().length > 0;
  const sendProgress = useSharedValue(0);
  const sendScale = useSharedValue(1);
  const canSendVoice = elapsed >= 0.4;

  useEffect(() => {
    sendProgress.value = withTiming(recording || ready ? 1 : 0, { duration: reduceMotion ? 0 : 200 });
  }, [ready, recording, reduceMotion, sendProgress]);

  useEffect(() => {
    return () => {
      if (tick.current) clearInterval(tick.current);
      if (capTimer.current) clearTimeout(capTimer.current);
    };
  }, []);

  const sendBg = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(sendProgress.value, [0, 1], [tokens.surface2, tokens.accent]),
    transform: [{ scale: sendScale.value }],
  }));

  const clearTimers = () => {
    if (tick.current) {
      clearInterval(tick.current);
      tick.current = null;
    }
    if (capTimer.current) {
      clearTimeout(capTimer.current);
      capTimer.current = null;
    }
  };

  const submit = () => {
    const text = value.trim();
    if (!text || inFlight || recording) return;
    setValue('');
    onSend(text);
  };

  const startRecording = async () => {
    if (inFlight || recordingRef.current || finishing.current) return;
    setMicHint(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setMicHint('Cần quyền micro để ghi giọng nói.');
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: RECORD_CAP_SECONDS });
      recordingRef.current = true;
      finishing.current = false;
      startedAt.current = Date.now();
      setElapsed(0);
      setRecording(true);
      tick.current = setInterval(() => {
        const fromClock = (Date.now() - startedAt.current) / 1000;
        const fromNative = (recState.durationMillis ?? 0) / 1000;
        setElapsed(Math.max(fromClock, fromNative));
      }, 200);
      capTimer.current = setTimeout(() => {
        capTimer.current = null;
        void finishRecording(true);
      }, RECORD_CAP_SECONDS * 1000);
    } catch (err) {
      if (__DEV__) console.error('[composer] start recording failed', err);
      recordingRef.current = false;
      clearTimers();
      setRecording(false);
      setMicHint('Không ghi được âm thanh.');
    }
  };

  const finishRecording = async (send: boolean) => {
    if (!recordingRef.current || finishing.current) return;
    finishing.current = true;
    recordingRef.current = false;
    clearTimers();
    const durationSec = Math.max(elapsed, (Date.now() - startedAt.current) / 1000);
    try {
      try {
        if (recorder.isRecording) await recorder.stop();
      } catch {
        // recorder may already be stopped
      }
      const uri = recorder.uri;
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
      setRecording(false);
      if (!send) return;
      if (durationSec < 0.4) {
        setMicHint('Nói lâu hơn một chút rồi gửi.');
        return;
      }
      const result = await recordingToPayload({ uri, durationSec });
      onAudio(result);
    } catch (err) {
      if (__DEV__) console.error('[composer] finish recording failed', err);
      setRecording(false);
      setMicHint('Không gửi được ghi âm. Thử lại nhé.');
    } finally {
      finishing.current = false;
    }
  };

  const pressSend = () => {
    sendScale.value = withTiming(0.93, { duration: reduceMotion ? 0 : 80 });
  };
  const releaseSend = () => {
    sendScale.value = withTiming(1, { duration: reduceMotion ? 0 : 80 });
  };

  if (recording) {
    return (
      <View style={[styles.bar, styles.barLive]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Huỷ ghi âm"
          hitSlop={8}
          onPress={() => void finishRecording(false)}
          style={({ pressed }) => [styles.sideBtn, pressed && styles.sideBtnPressed]}
        >
          <Feather name="x" size={18} color={tokens.ink2} />
        </Pressable>
        <Waveform
          live
          level={meterToUnit(recState.metering)}
          reduceMotion={reduceMotion}
          color={tokens.accent}
        />
        <Text style={styles.timer}>{formatDuration(elapsed)}</Text>
        <Animated.View style={[styles.send, sendBg]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Gửi ghi âm"
            disabled={!canSendVoice}
            hitSlop={8}
            onPress={() => void finishRecording(true)}
            onPressIn={pressSend}
            onPressOut={releaseSend}
            style={styles.sendHit}
          >
            <Feather name="arrow-up" size={19} color={canSendVoice ? tokens.accentInk : tokens.ink3} />
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ghi âm"
        disabled={inFlight}
        hitSlop={8}
        onPress={() => void startRecording()}
        style={({ pressed }) => [styles.sideBtn, pressed && styles.sideBtnPressed]}
      >
        <Feather name="mic" size={19} color={tokens.ink2} />
      </Pressable>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={setValue}
        placeholder={micHint ?? 'Ghi một khoản chi, hoặc bấm mic để nói'}
        placeholderTextColor={micHint ? tokens.neg : tokens.ink3}
        returnKeyType="send"
        blurOnSubmit={false}
        onSubmitEditing={submit}
        editable={!inFlight}
      />
      <Animated.View style={[styles.send, sendBg]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Gửi"
          disabled={inFlight || !ready}
          hitSlop={8}
          onPress={submit}
          onPressIn={pressSend}
          onPressOut={releaseSend}
          style={styles.sendHit}
        >
          <Feather name="arrow-up" size={19} color={ready ? tokens.accentInk : tokens.ink3} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

function meterToUnit(db?: number) {
  if (typeof db !== 'number' || Number.isNaN(db)) return 0.28;
  return Math.min(1, Math.max(0.12, (db + 52) / 48));
}

function Waveform({
  live,
  level,
  reduceMotion,
  color,
}: {
  live: boolean;
  level: number;
  reduceMotion: boolean;
  color: string;
}) {
  const [bars, setBars] = useState(() => Array.from({ length: WAVE_BARS }, () => 0.2));

  useEffect(() => {
    if (!live || reduceMotion) return;
    const id = setInterval(() => {
      setBars((prev) => {
        const next = prev.slice(1);
        const jitter = 0.12 + Math.random() * 0.28;
        next.push(Math.min(1, level * 0.82 + jitter * 0.3));
        return next;
      });
    }, 70);
    return () => clearInterval(id);
  }, [live, level, reduceMotion]);

  return (
    <View style={waveStyles.row}>
      {bars.map((unit, index) => (
        <View
          key={index}
          style={[
            waveStyles.bar,
            {
              height: 4 + unit * 22,
              backgroundColor: color,
              opacity: 0.35 + unit * 0.65,
            },
          ]}
        />
      ))}
    </View>
  );
}

const waveStyles = StyleSheet.create({
  row: {
    flex: 1,
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  bar: {
    width: 2.5,
    borderRadius: 2,
  },
});

function makeStyles(t: ThemeTokens) {
  return StyleSheet.create({
    bar: {
      marginHorizontal: 12,
      height: 52,
      borderRadius: 26,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.line,
      paddingLeft: 8,
      paddingRight: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    barLive: {
      borderColor: t.accent,
      backgroundColor: t.surface,
    },
    sideBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sideBtnPressed: {
      backgroundColor: t.surface2,
    },
    timer: {
      minWidth: 36,
      fontFamily: 'Inter_500Medium',
      fontSize: 12.5,
      color: t.accent,
      textAlign: 'right',
    },
    input: {
      flex: 1,
      fontSize: 15,
      fontFamily: 'Inter_400Regular',
      color: t.ink,
      paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    },
    send: {
      width: 39,
      height: 39,
      borderRadius: 20,
      overflow: 'hidden',
    },
    sendHit: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
