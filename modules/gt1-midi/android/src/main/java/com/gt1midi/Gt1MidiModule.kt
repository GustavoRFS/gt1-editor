package com.gt1midi

import android.content.Context
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.media.MediaRecorder
import android.media.midi.MidiDevice
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiInputPort
import android.media.midi.MidiManager
import android.media.midi.MidiOutputPort
import android.media.midi.MidiReceiver
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException
import java.io.File
import java.nio.ByteBuffer

class Gt1MidiModule : Module() {
  private data class VideoSession(
    val camera: CameraDevice,
    val capture: CameraCaptureSession,
    val recorder: MediaRecorder,
    val file: File,
  )
  private data class Connection(
    val info: MidiDeviceInfo,
    val device: MidiDevice,
    val input: MidiInputPort,
    val output: MidiOutputPort,
    val receiver: MidiReceiver,
  )

  private var midiManager: MidiManager? = null
  @Volatile private var connection: Connection? = null
  @Volatile private var videoSession: VideoSession? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  private val deviceCallback = object : MidiManager.DeviceCallback() {
    override fun onDeviceRemoved(info: MidiDeviceInfo) {
      val active = connection
      if (active?.info?.id == info.id) {
        closeConnection()
        sendEvent("onDisconnect", mapOf("deviceId" to deviceId(info)))
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("Gt1Midi")
    Events("onSysEx", "onMidi", "onDisconnect")

    OnCreate {
      val context = appContext.reactContext
        ?: throw IllegalStateException("O contexto Android não está disponível.")
      midiManager = context.getSystemService(Context.MIDI_SERVICE) as? MidiManager
      midiManager?.registerDeviceCallback(deviceCallback, mainHandler)
    }

    OnDestroy {
      midiManager?.unregisterDeviceCallback(deviceCallback)
      closeConnection()
      stopVideoSession()
      midiManager = null
    }

    AsyncFunction("listDevices") {
      val manager = midiManager ?: throw IllegalStateException("O serviço MIDI Android não está disponível.")
      manager.devices.mapNotNull { info ->
        val hasAppOutput = info.ports.any { it.type == MidiDeviceInfo.PortInfo.TYPE_INPUT }
        val hasAppInput = info.ports.any { it.type == MidiDeviceInfo.PortInfo.TYPE_OUTPUT }
        if (!hasAppOutput || !hasAppInput) return@mapNotNull null
        mapOf(
          "id" to deviceId(info),
          "name" to (info.properties.getString(MidiDeviceInfo.PROPERTY_NAME) ?: "Dispositivo MIDI USB"),
        )
      }
    }

    AsyncFunction("connect") { id: String, promise: Promise ->
      val manager = midiManager
      val info = manager?.devices?.firstOrNull { deviceId(it) == id }
      if (manager == null || info == null) {
        promise.reject("device-disconnected", "A GT-1 não está mais disponível. Atualize a lista de dispositivos.", null)
        return@AsyncFunction
      }
      closeConnection()
      manager.openDevice(info, { device ->
        if (device == null) {
          promise.reject("connect-failed", "O Android não conseguiu abrir a porta MIDI USB.", null)
          return@openDevice
        }
        try {
          val appOutput = info.ports.firstOrNull { it.type == MidiDeviceInfo.PortInfo.TYPE_INPUT }
            ?: throw IOException("A GT-1 não expõe uma porta de entrada MIDI.")
          val appInput = info.ports.firstOrNull { it.type == MidiDeviceInfo.PortInfo.TYPE_OUTPUT }
            ?: throw IOException("A GT-1 não expõe uma porta de saída MIDI.")
          val midiOut = device.openInputPort(appOutput.portNumber)
            ?: throw IOException("Não foi possível abrir a porta MIDI de envio.")
          val midiIn = device.openOutputPort(appInput.portNumber)
            ?: throw IOException("Não foi possível abrir a porta MIDI de recepção.")
          val receiver = object : MidiReceiver() {
            private val frame = ArrayList<Int>()
            private val shortMessage = ArrayList<Int>()
            private var expectedDataBytes = 0

            @Synchronized
            override fun onSend(msg: ByteArray, offset: Int, count: Int, timestamp: Long) {
              for (index in offset until offset + count) {
                val value = msg[index].toInt() and 0xff
                if (value == 0xf0) {
                  frame.clear()
                  frame.add(value)
                  shortMessage.clear()
                  expectedDataBytes = 0
                } else if (frame.isNotEmpty()) {
                  frame.add(value)
                  if (frame.size > MAX_SYSEX_LENGTH) {
                    frame.clear()
                  } else if (value == 0xf7) {
                    sendEvent("onSysEx", mapOf("bytes" to frame.toList()))
                    frame.clear()
                  }
                } else if (value >= 0xf8) {
                  sendEvent("onMidi", mapOf("bytes" to listOf(value), "timestamp" to System.currentTimeMillis()))
                } else if (value >= 0x80) {
                  shortMessage.clear()
                  shortMessage.add(value)
                  val command = value and 0xf0
                  expectedDataBytes = when {
                    command == 0xc0 || command == 0xd0 -> 1
                    command in 0x80..0xe0 -> 2
                    else -> 0
                  }
                  if (expectedDataBytes == 0) shortMessage.clear()
                } else if (expectedDataBytes > 0 && shortMessage.isNotEmpty()) {
                  shortMessage.add(value)
                  if (shortMessage.size == expectedDataBytes + 1) {
                    sendEvent("onMidi", mapOf("bytes" to shortMessage.toList(), "timestamp" to System.currentTimeMillis()))
                    shortMessage.clear()
                    expectedDataBytes = 0
                  }
                }
              }
            }
          }
          midiIn.connect(receiver)
          connection = Connection(info, device, midiOut, midiIn, receiver)
          promise.resolve(null)
        } catch (error: Exception) {
          runCatching { device.close() }
          promise.reject("connect-failed", error.message ?: "Falha ao abrir as portas MIDI.", error)
        }
      }, mainHandler)
    }

    AsyncFunction("disconnect") {
      closeConnection()
    }

    AsyncFunction("sendSysEx") { bytes: List<Int> ->
      if (bytes.size < 2 || bytes.size > MAX_SYSEX_LENGTH || bytes.firstOrNull() != 0xf0 || bytes.lastOrNull() != 0xf7) {
        throw IllegalArgumentException("Envie uma mensagem SysEx completa, de F0 a F7, com até 8192 bytes.")
      }
      if (bytes.drop(1).dropLast(1).any { it !in 0..0x7f }) {
        throw IllegalArgumentException("O corpo SysEx da GT-1 deve conter bytes entre 00 e 7F.")
      }
      val active = connection ?: throw IllegalStateException("Nenhuma porta MIDI está conectada.")
      val payload = ByteArray(bytes.size) { bytes[it].toByte() }
      active.input.send(payload, 0, payload.size)
    }

    AsyncFunction("sendMidiMessage") { bytes: List<Int> ->
      val status = bytes.getOrNull(0) ?: -1
      val data = bytes.getOrNull(1) ?: -1
      if (bytes.size != 2 || status !in 0xc0..0xcf || data !in 0..0x7f) {
        throw IllegalArgumentException("Envie uma mensagem Program Change MIDI válida, com dois bytes.")
      }
      val active = connection ?: throw IllegalStateException("Nenhuma porta MIDI está conectada.")
      val payload = ByteArray(bytes.size) { bytes[it].toByte() }
      active.input.send(payload, 0, payload.size)
    }

    AsyncFunction("listCaptureDevices") {
      val context = appContext.reactContext ?: throw IllegalStateException("O contexto Android não está disponível.")
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val cameras = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
      val audioInputs = audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS)
        .filter { it.type == AudioDeviceInfo.TYPE_USB_DEVICE || it.type == AudioDeviceInfo.TYPE_USB_HEADSET }
        .map { mapOf("id" to it.id.toString(), "label" to (it.productName?.toString() ?: "USB audio"), "kind" to "audioinput") }
      val videoInputs = cameras.cameraIdList.map { id -> mapOf("id" to id, "label" to "Câmera $id", "kind" to "videoinput") }
      audioInputs + videoInputs
    }

    AsyncFunction("startVideoRecording") { cameraId: String, audioDeviceId: String, width: Int, height: Int, fps: Int, bitrate: Int, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("recording-context", "O contexto Android não está disponível.", null)
        return@AsyncFunction
      }
      if (videoSession != null) {
        promise.reject("recording-active", "Já existe uma gravação em andamento.", null)
        return@AsyncFunction
      }
      try {
        if (android.os.Build.VERSION.SDK_INT < 28) throw IOException("A seleção direta da entrada USB exige Android 9 ou superior.")
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val audioInput = audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS)
          .firstOrNull { it.id.toString() == audioDeviceId }
          ?: throw IOException("A entrada USB de áudio selecionada não está mais conectada.")
        val cameras = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val outputFile = File(context.cacheDir, "gt1-recording-${System.currentTimeMillis()}.mp4")
        val recorder = if (android.os.Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else MediaRecorder()
        recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
        if (!recorder.setPreferredDevice(audioInput)) throw IOException("O Android não conseguiu rotear o áudio para a entrada USB selecionada.")
        recorder.setVideoSource(MediaRecorder.VideoSource.SURFACE)
        recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        recorder.setOutputFile(outputFile.absolutePath)
        recorder.setVideoSize(width, height)
        recorder.setVideoFrameRate(fps)
        recorder.setVideoEncodingBitRate(bitrate)
        recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264)
        recorder.setAudioChannels(2)
        recorder.setAudioEncodingBitRate(192_000)
        recorder.setAudioSamplingRate(48_000)
        recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        recorder.prepare()
        cameras.openCamera(cameraId, object : CameraDevice.StateCallback() {
          override fun onOpened(camera: CameraDevice) {
            try {
              camera.createCaptureSession(listOf(recorder.surface), object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(session: CameraCaptureSession) {
                  try {
                    val request = camera.createCaptureRequest(CameraDevice.TEMPLATE_RECORD).apply { addTarget(recorder.surface) }.build()
                    session.setRepeatingRequest(request, null, mainHandler)
                    recorder.start()
                    val routed = recorder.routedDevice
                    if (routed?.id != audioInput.id) {
                      runCatching { recorder.stop() }; runCatching { session.close() }; runCatching { camera.close() }; runCatching { recorder.release() }
                      outputFile.delete()
                      promise.reject("recording-audio-route", "O Android direcionou o áudio para outro dispositivo, não para a entrada USB selecionada.", null)
                      return
                    }
                    videoSession = VideoSession(camera, session, recorder, outputFile)
                    promise.resolve(android.net.Uri.fromFile(outputFile).toString())
                  } catch (error: Exception) {
                    runCatching { session.close() }; runCatching { camera.close() }; runCatching { recorder.release() }
                    promise.reject("recording-start", error.message ?: "Falha ao iniciar a captura.", error)
                  }
                }
                override fun onConfigureFailed(session: CameraCaptureSession) {
                  session.close(); camera.close(); recorder.release()
                  outputFile.delete()
                  promise.reject("recording-camera", "A câmera não aceitou a configuração de gravação.", null)
                }
              }, mainHandler)
            } catch (error: Exception) {
              camera.close(); recorder.release()
              promise.reject("recording-camera", error.message ?: "Falha ao abrir a câmera.", error)
            }
          }
          override fun onDisconnected(camera: CameraDevice) {
            camera.close(); recorder.release()
            outputFile.delete()
            promise.reject("recording-camera", "A câmera foi desconectada.", null)
          }
          override fun onError(camera: CameraDevice, errorCode: Int) {
            camera.close(); recorder.release()
            outputFile.delete()
            promise.reject("recording-camera", "Falha da câmera ($errorCode).", null)
          }
        }, mainHandler)
      } catch (error: Exception) {
        promise.reject("recording-start", error.message ?: "Falha ao preparar a gravação.", error)
      }
    }

    AsyncFunction("stopVideoRecording") { audioDelayMs: Int ->
      val completed = stopVideoSession() ?: throw IllegalStateException("Nenhuma gravação está ativa.")
      val output = applyAvOffset(completed, audioDelayMs)
      android.net.Uri.fromFile(output).toString()
    }
  }

  private fun deviceId(info: MidiDeviceInfo): String = "android-midi:${info.id}"

  @Synchronized
  private fun closeConnection() {
    val active = connection ?: return
    connection = null
    runCatching { active.output.disconnect(active.receiver) }
    runCatching { active.input.close() }
    runCatching { active.output.close() }
    runCatching { active.device.close() }
  }

  @Synchronized
  private fun stopVideoSession(): File? {
    val active = videoSession ?: return null
    videoSession = null
    runCatching { active.capture.stopRepeating() }
    runCatching { active.recorder.stop() }
    runCatching { active.capture.close() }
    runCatching { active.camera.close() }
    runCatching { active.recorder.reset() }
    runCatching { active.recorder.release() }
    return active.file.takeIf { it.exists() && it.length() > 0 }
  }

  private fun applyAvOffset(source: File, offsetMs: Int): File {
    if (offsetMs == 0) return source
    val target = File(source.parentFile, source.nameWithoutExtension + "-sync.mp4")
    val extractor = MediaExtractor()
    var muxer: MediaMuxer? = null
    try {
      extractor.setDataSource(source.absolutePath)
      muxer = MediaMuxer(target.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      val outputTracks = IntArray(extractor.trackCount)
      val trackFormats = ArrayList<MediaFormat>()
      for (index in 0 until extractor.trackCount) {
        val format = extractor.getTrackFormat(index)
        trackFormats.add(format)
        outputTracks[index] = muxer.addTrack(format)
        extractor.selectTrack(index)
      }
      muxer.start()
      val info = MediaCodecBufferInfoCompat()
      val maxSize = trackFormats.maxOfOrNull { if (it.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) it.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE) else 0 } ?: 0
      val buffer = ByteBuffer.allocateDirect(maxSize.coerceIn(8 * 1024 * 1024, 16 * 1024 * 1024))
      while (true) {
        buffer.clear()
        val size = extractor.readSampleData(buffer, 0)
        if (size < 0) break
        val inputTrack = extractor.sampleTrackIndex
        val mime = trackFormats[inputTrack].getString(MediaFormat.KEY_MIME) ?: ""
        val shift = if (offsetMs > 0 && mime.startsWith("audio/")) offsetMs.toLong() * 1000
          else if (offsetMs < 0 && mime.startsWith("video/")) -offsetMs.toLong() * 1000
          else 0L
        val time = extractor.sampleTime + shift
        info.set(size, time, extractor.sampleFlags)
        muxer.writeSampleData(outputTracks[inputTrack], buffer, info.bufferInfo)
        extractor.advance()
      }
      muxer.stop()
      source.delete()
      return target
    } catch (error: Exception) {
      target.delete()
      throw IOException("Não foi possível ajustar a sincronização A/V: ${error.message}", error)
    } finally {
      runCatching { muxer?.release() }
      extractor.release()
    }
  }

  private class MediaCodecBufferInfoCompat {
    val bufferInfo = android.media.MediaCodec.BufferInfo()
    fun set(size: Int, timeUs: Long, flags: Int) { bufferInfo.set(0, size, timeUs, flags) }
  }

  companion object {
    private const val MAX_SYSEX_LENGTH = 8192
  }
}
