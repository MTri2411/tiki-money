import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { formatDuration } from '@/lib/money';

export const RECORD_CAP_SECONDS = 60;

export function recordingMimeType() {
  return Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4';
}

export function recordingExt() {
  return Platform.OS === 'web' ? 'webm' : 'm4a';
}

export function voicePlaceholder(durationSec: number) {
  return `🎙 Đoạn ghi âm ${formatDuration(durationSec)}`;
}

export function isVoicePlaceholder(text: string) {
  return text.startsWith('🎙 Đoạn ghi âm');
}

export async function fileUriToBase64(uri: string) {
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

export async function recordingToPayload(input: {
  uri: string | null;
  durationSec: number;
}) {
  if (!input.uri) {
    throw new Error('no-audio');
  }
  const base64 = await fileUriToBase64(input.uri);
  if (!base64) {
    throw new Error('empty-audio');
  }
  return {
    uri: input.uri,
    base64,
    durationSec: input.durationSec,
    mimeType: recordingMimeType(),
  };
}

function voiceDir() {
  const base = FileSystem.documentDirectory;
  return base ? `${base}voice/` : null;
}

export async function persistRecording(tempUri: string, id: string) {
  const dir = voiceDir();
  if (!dir) return tempUri;
  try {
    const folder = await FileSystem.getInfoAsync(dir);
    if (!folder.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    const dest = `${dir}${id}.${recordingExt()}`;
    const info = await FileSystem.getInfoAsync(dest);
    if (info.exists) {
      await FileSystem.deleteAsync(dest, { idempotent: true });
    }
    await FileSystem.copyAsync({ from: tempUri, to: dest });
    return dest;
  } catch (err) {
    if (__DEV__) console.error('[voice] persist failed', err);
    return tempUri;
  }
}

export async function deleteRecording(uri?: string | null) {
  if (!uri) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // file already gone
  }
}

export async function deleteRecordings(uris: (string | undefined | null)[]) {
  for (const uri of uris) {
    await deleteRecording(uri);
  }
}

export async function clearVoiceRecordings() {
  const dir = voiceDir();
  if (!dir) return;
  await FileSystem.deleteAsync(dir, { idempotent: true });
}
