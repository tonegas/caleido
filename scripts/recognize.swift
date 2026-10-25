// Riconosce la canzone che sta suonando nella stanza con ShazamKit (incluso in macOS).
// Ascolta il microfono per al massimo N secondi e stampa una riga JSON:
//   {"ok":true,"title":..,"artist":..,"offset":<secondi nel brano>,"at":<unix time del campione>}
//   {"ok":false,"error":..}
// Compilato da server.js con: swiftc -O scripts/recognize.swift -o scripts/recognize
import AVFoundation
import Foundation
import ShazamKit

final class Recognizer: NSObject, SHSessionDelegate {
  let session = SHSession()
  let engine = AVAudioEngine()
  var done = false
  var peak: Float = 0      // volume massimo ascoltato (diagnostica: 0 = microfono muto/negato)

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
      self.finish(["ok": false, "error": self.peak < 0.0005 ? "microfono muto (permesso negato?)" : "nessuna corrispondenza", "peak": self.peak])
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
    // Apple consente il catalogo Shazam solo ad app firmate con un account sviluppatore
    // che ha il servizio ShazamKit: senza, il server risponde 401 "Missing entitlements"
    if "\(error.userInfo)".contains("Missing entitlements") {
      finish(["ok": false, "error": "non-autorizzato", "fatal": true])
    } else if error.code != SHError.Code.matchAttemptFailed.rawValue {
      finish(["ok": false, "error": "shazam: \(error.localizedDescription)"])
    }
    // altrimenti continua ad ascoltare fino al timeout
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
