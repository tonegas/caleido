// Recognizes the song playing in the room with ShazamKit (built into macOS).
// Listens to the microphone for at most N seconds and prints one JSON line:
//   {"ok":true,"title":..,"artist":..,"offset":<seconds into the song>,"at":<unix time of the sample>}
//   {"ok":false,"error":..}
// Compiled by server.js with: swiftc -O scripts/recognize.swift -o scripts/recognize
import AVFoundation
import Foundation
import ShazamKit

final class Recognizer: NSObject, SHSessionDelegate {
  let session = SHSession()
  let engine = AVAudioEngine()
  var done = false
  var peak: Float = 0      // loudest sample heard (diagnostics: 0 = mic muted/denied)

  func run(seconds: Double) {
    session.delegate = self
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, time in
      if let ch = buffer.floatChannelData?[0] {
        for i in 0..<Int(buffer.frameLength) { self?.peak = max(self?.peak ?? 0, abs(ch[i])) }
      }
      self?.session.matchStreamingBuffer(buffer, at: time)
    }
    do { try engine.start() } catch { finish(["ok": false, "error": "mic: \(error.localizedDescription)"]) }
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
      guard let self else { return }
      self.finish(["ok": false, "error": self.peak < 0.0005 ? "microphone silent (permission denied?)" : "no match", "peak": self.peak])
    }
  }

  func session(_ session: SHSession, didFind match: SHMatch) {
    guard let item = match.mediaItems.first else { return }
    finish([
      "ok": true,
      "title": item.title ?? "",
      "artist": item.artist ?? "",
      "offset": item.predictedCurrentMatchOffset,
      "at": Date().timeIntervalSince1970,
    ])
  }

  func session(_ session: SHSession, didNotFindMatchFor signature: SHSignature, error: Error?) {
    guard let error = error as NSError?, error.domain == SHErrorDomain else { return }
    // Apple only allows the Shazam catalog for apps signed with a developer account
    // that has the ShazamKit service: otherwise the server answers 401 "Missing entitlements"
    if "\(error.userInfo)".contains("Missing entitlements") {
      finish(["ok": false, "error": "not-authorized", "fatal": true])
    } else if error.code != SHError.Code.matchAttemptFailed.rawValue {
      finish(["ok": false, "error": "shazam: \(error.localizedDescription)"])
    }
    // otherwise keep listening until the timeout
  }

  func finish(_ result: [String: Any]) {
    DispatchQueue.main.async {
      if self.done { return }
      self.done = true
      self.engine.stop()
      let data = try! JSONSerialization.data(withJSONObject: result)
      print(String(data: data, encoding: .utf8)!)
      exit(0)
    }
  }
}

let seconds = Double(CommandLine.arguments.dropFirst().first ?? "") ?? 12
let r = Recognizer()
r.run(seconds: seconds)
RunLoop.main.run()
