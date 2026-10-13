package com.gt1midi

import android.content.Context
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

class Gt1MidiModule : Module() {
  private data class Connection(
    val info: MidiDeviceInfo,
    val device: MidiDevice,
    val input: MidiInputPort,
    val output: MidiOutputPort,
    val receiver: MidiReceiver,
  )

  private var midiManager: MidiManager? = null
  @Volatile private var connection: Connection? = null
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
    Events("onSysEx", "onDisconnect")

    OnCreate {
      val context = appContext.reactContext
        ?: throw IllegalStateException("O contexto Android não está disponível.")
      midiManager = context.getSystemService(Context.MIDI_SERVICE) as? MidiManager
      midiManager?.registerDeviceCallback(deviceCallback, mainHandler)
    }

    OnDestroy {
      midiManager?.unregisterDeviceCallback(deviceCallback)
      closeConnection()
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

            @Synchronized
            override fun onSend(msg: ByteArray, offset: Int, count: Int, timestamp: Long) {
              for (index in offset until offset + count) {
                val value = msg[index].toInt() and 0xff
                if (value == 0xf0) {
                  frame.clear()
                  frame.add(value)
                } else if (frame.isNotEmpty()) {
                  frame.add(value)
                  if (frame.size > MAX_SYSEX_LENGTH) {
                    frame.clear()
                  } else if (value == 0xf7) {
                    sendEvent("onSysEx", mapOf("bytes" to frame.toList()))
                    frame.clear()
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
  }

  private fun deviceId(info: MidiDeviceInfo): String = "android-midi:${info.id}"

  @Synchronized
  private fun closeConnection() {
    val active = connection ?: return
    connection = null
    runCatching { active.output.disconnect(active.receiver) }
    runCatching { active.input.close() }
    runCatching { active.output.close() }
    runCatching { active.receiver.close() }
    runCatching { active.device.close() }
  }

  companion object {
    private const val MAX_SYSEX_LENGTH = 8192
  }
}
