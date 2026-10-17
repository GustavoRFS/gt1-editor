export type VideoRecordingOptions = {
  width: number;
  height: number;
  fps: number;
  videoBitrate: number;
  audioDelayMs: number;
  audioDeviceId: string;
  videoDeviceId: string;
};

export type CaptureDevice = { id: string; label: string; kind: 'audioinput' | 'videoinput' };
export type RecordingHandle = { stop(): Promise<Blob | string> };

export async function listCaptureDevices(): Promise<CaptureDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) throw new Error('A captura de áudio/vídeo não está disponível neste ambiente.');
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === 'audioinput' || device.kind === 'videoinput').map((device) => ({
    id: device.deviceId,
    label: device.label || (device.kind === 'audioinput' ? 'Entrada de áudio' : 'Câmera'),
    kind: device.kind as CaptureDevice['kind'],
  }));
}

export async function requestCapturePermission(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  stream.getTracks().forEach((track) => track.stop());
}

export async function startVideoRecording(
  options: VideoRecordingOptions,
  onPreviewStream: (stream: MediaStream) => void,
): Promise<RecordingHandle> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Este ambiente não oferece gravação de vídeo.');
  const source = await navigator.mediaDevices.getUserMedia({
    video: { deviceId: { exact: options.videoDeviceId }, width: { ideal: options.width }, height: { ideal: options.height }, frameRate: { ideal: options.fps, max: options.fps } },
    audio: { deviceId: { exact: options.audioDeviceId }, channelCount: { ideal: 2 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const camera = source.getVideoTracks()[0];
  const canvas = document.createElement('canvas');
  canvas.width = options.width;
  canvas.height = options.height;
  const context = canvas.getContext('2d');
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([camera]);
  await video.play();
  let frameId = 0;
  let active = true;
  const delayVideoMs = Math.max(0, -options.audioDelayMs);
  const recordStartedAt = performance.now();
  const draw = () => {
    if (!active) return;
    if (context && performance.now() - recordStartedAt >= delayVideoMs) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
    } else if (context) {
      context.fillStyle = '#000';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    frameId = requestAnimationFrame(draw);
  };
  draw();
  const delayedVideoStream = canvas.captureStream(options.fps);
  const outputAudio = new AudioContext();
  const inputAudio = outputAudio.createMediaStreamSource(new MediaStream(source.getAudioTracks()));
  const destination = outputAudio.createMediaStreamDestination();
  const positiveDelay = Math.max(0, options.audioDelayMs) / 1000;
  if (positiveDelay > 0) {
    const delay = outputAudio.createDelay(Math.max(1, positiveDelay + 0.25));
    delay.delayTime.value = positiveDelay;
    inputAudio.connect(delay).connect(destination);
  } else {
    inputAudio.connect(destination);
  }
  await outputAudio.resume();
  const output = new MediaStream([...delayedVideoStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
  onPreviewStream(source);
  const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find((candidate) => MediaRecorder.isTypeSupported(candidate));
  const recorder = new MediaRecorder(output, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: options.videoBitrate });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  recorder.start(1000);
  return {
    stop: () => new Promise((resolve, reject) => {
      recorder.onerror = (event) => reject((event as Event & { error?: Error }).error ?? new Error('Falha na gravação.'));
      recorder.onstop = () => {
        active = false;
        cancelAnimationFrame(frameId);
        source.getTracks().forEach((track) => track.stop());
        delayedVideoStream.getTracks().forEach((track) => track.stop());
        void outputAudio.close();
        video.srcObject = null;
        resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
      };
      try { recorder.stop(); } catch (error) { reject(error); }
    }),
  };
}

export async function saveRecording(blob: Blob | string): Promise<void> {
  if (typeof blob === 'string') throw new Error('URI de arquivo inválida para o gravador web.');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `gt1-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
