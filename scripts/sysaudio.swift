// Captures the Mac's own audio output (everything that is playing) with a Core Audio
// process tap and streams it to stdout (build it for macOS 14.2 or later):
//   first line: "RATE <sample rate>\n"
//   then:       raw mono Float32 little-endian samples, until stdout is closed
// On failure it prints "ERROR <message>\n" and exits with status 1.
// macOS asks once for the "System Audio Recording" permission; if it's denied, the stream is silent.
import AudioToolbox
import CoreAudio
import Foundation

func fail(_ msg: String) -> Never {
  FileHandle.standardOutput.write(Data("ERROR \(msg)\n".utf8))
  exit(1)
}

func property<T>(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector, _ initial: T) -> T? {
  var address = AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal,
                                           mElement: kAudioObjectPropertyElementMain)
  var value = initial
  var size = UInt32(MemoryLayout<T>.size)
  let err = withUnsafeMutablePointer(to: &value) { AudioObjectGetPropertyData(object, &address, 0, nil, &size, $0) }
  return err == noErr ? value : nil
}

// 1. a private tap on the whole system output
let tap = CATapDescription(stereoGlobalTapButExcludeProcesses: [])
tap.uuid = UUID()
tap.name = "Caleido"
tap.isPrivate = true
tap.muteBehavior = .unmuted
var tapID = AudioObjectID(kAudioObjectUnknown)
guard AudioHardwareCreateProcessTap(tap, &tapID) == noErr else { fail("cannot create the audio tap") }

guard var format = property(tapID, kAudioTapPropertyFormat, AudioStreamBasicDescription()),
      format.mFormatID == kAudioFormatLinearPCM,
      format.mFormatFlags & kAudioFormatFlagIsFloat != 0 else { fail("unexpected tap format") }

// 2. a private aggregate device that contains the tap, clocked by the current output device
guard let outputID = property(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyDefaultSystemOutputDevice,
                              AudioObjectID(kAudioObjectUnknown)),
      let outputUID = property(outputID, kAudioDevicePropertyDeviceUID, "" as CFString) else {
  fail("no audio output device")
}
let aggregate: [String: Any] = [
  kAudioAggregateDeviceNameKey: "Caleido system audio",
  kAudioAggregateDeviceUIDKey: UUID().uuidString,
  kAudioAggregateDeviceMainSubDeviceKey: outputUID as String,
  kAudioAggregateDeviceIsPrivateKey: true,
  kAudioAggregateDeviceIsStackedKey: false,
  kAudioAggregateDeviceTapAutoStartKey: true,
  kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: outputUID as String]],
  kAudioAggregateDeviceTapListKey: [[kAudioSubTapDriftCompensationKey: true, kAudioSubTapUIDKey: tap.uuid.uuidString]],
]
var deviceID = AudioObjectID(kAudioObjectUnknown)
guard AudioHardwareCreateAggregateDevice(aggregate as CFDictionary, &deviceID) == noErr else {
  fail("cannot create the capture device")
}

func cleanup() {
  AudioHardwareDestroyAggregateDevice(deviceID)
  AudioHardwareDestroyProcessTap(tapID)
}
for sig in [SIGTERM, SIGINT, SIGPIPE] {
  signal(sig) { _ in cleanup(); exit(0) }
}

// 3. read the tap, mix to mono and write to stdout
let out = FileHandle.standardOutput
out.write(Data("RATE \(Int(format.mSampleRate))\n".utf8))
let channels = Int(format.mChannelsPerFrame)
let interleaved = format.mFormatFlags & kAudioFormatFlagIsNonInterleaved == 0
let writer = DispatchQueue(label: "caleido.sysaudio.out")
var procID: AudioDeviceIOProcID?
let ioQueue = DispatchQueue(label: "caleido.sysaudio.io", qos: .userInteractive)
let status = AudioDeviceCreateIOProcIDWithBlock(&procID, deviceID, ioQueue) { _, input, _, _, _ in
  let buffers = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: input))
  guard let first = buffers.first, let base = first.mData else { return }
  var mono: [Float]
  if interleaved {
    let p = base.assumingMemoryBound(to: Float.self)
    let frames = Int(first.mDataByteSize) / (4 * max(channels, 1))
    mono = [Float](repeating: 0, count: frames)
    for f in 0..<frames {
      var s: Float = 0
      for c in 0..<channels { s += p[f * channels + c] }
      mono[f] = s / Float(channels)
    }
  } else {
    let frames = Int(first.mDataByteSize) / 4
    mono = [Float](repeating: 0, count: frames)
    for b in buffers {
      guard let d = b.mData?.assumingMemoryBound(to: Float.self) else { continue }
      for f in 0..<frames { mono[f] += d[f] / Float(buffers.count) }
    }
  }
  let data = mono.withUnsafeBufferPointer { Data(buffer: $0) }
  writer.async { out.write(data) }   // SIGPIPE (reader gone) ends the process
}
guard status == noErr, AudioDeviceStart(deviceID, procID) == noErr else {
  cleanup()
  fail("cannot start the capture")
}
dispatchMain()
