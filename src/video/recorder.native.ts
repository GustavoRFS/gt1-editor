import type { CaptureDevice, RecordingHandle, VideoRecordingOptions } from './recorder';
import { PermissionsAndroid, Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import Gt1Midi from '../../modules/gt1-midi';
export type { CaptureDevice, RecordingHandle, VideoRecordingOptions };
export async function listCaptureDevices(): Promise<CaptureDevice[]> {
  if (!Gt1Midi) throw new Error('O módulo de gravação nativa não está instalado. Recompile o app Android.');
  return Gt1Midi.listCaptureDevices();
}
export async function requestCapturePermission(): Promise<void> {
  if (Platform.OS !== 'android') throw new Error('Gravação nativa disponível apenas no Android.');
  const result = await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]);
  if (Object.values(result).some((value) => value !== PermissionsAndroid.RESULTS.GRANTED)) throw new Error('Permita acesso à câmera e ao áudio para gravar.');
}
export async function startVideoRecording(options: VideoRecordingOptions, _onPreviewStream: (stream: MediaStream) => void): Promise<RecordingHandle> {
  if (!Gt1Midi) throw new Error('O módulo de gravação nativa não está instalado. Recompile o app Android.');
  const initialUri = await Gt1Midi.startVideoRecording(options.videoDeviceId, options.audioDeviceId, options.width, options.height, options.fps, options.videoBitrate);
  return { stop: () => Gt1Midi.stopVideoRecording(options.audioDelayMs).then((uri) => uri || initialUri) };
}
export async function saveRecording(uri: Blob | string): Promise<void> {
  if (typeof uri !== 'string') throw new Error('URI de arquivo inválida para gravação Android.');
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'video/mp4', UTI: 'public.mpeg-4' });
  else throw new Error(`Gravação salva em ${uri}`);
}
