// Caleido.app: native macOS wrapper around the web visualizer.
// - serves the page (Contents/Resources/app) from a tiny HTTP server on 127.0.0.1,
//   so the page is a "secure context" and may use the microphone
// - implements the karaoke API (/api/nowplaying, /api/recognize) like server.js
// - opens a full-screen WebKit window on the external display (the TV) if there is one
// - keeps the display awake while running
import AppKit
import Network
import WebKit

// MARK: - helpers

/// Runs a command and returns its trimmed stdout (nil on failure or timeout).
func run(_ path: String, _ args: [String], timeout: TimeInterval = 5) -> String? {
  let p = Process()
  p.executableURL = URL(fileURLWithPath: path)
  p.arguments = args
  let out = Pipe()
  p.standardOutput = out
  p.standardError = FileHandle.nullDevice
  do { try p.run() } catch { return nil }
  let deadline = Date().addingTimeInterval(timeout)
  while p.isRunning && Date() < deadline { usleep(10_000) }
  if p.isRunning { p.terminate(); return nil }
  let data = out.fileHandleForReading.readDataToEndOfFile()
  guard p.terminationStatus == 0 else { return nil }
  return String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
}

func json(_ obj: Any) -> Data {
  (try? JSONSerialization.data(withJSONObject: obj)) ?? Data("{}".utf8)
}

// MARK: - karaoke API

enum KaraokeAPI {
  static let players: [(bundleID: String, name: String, script: String)] = [
    ("com.spotify.client", "Spotify", """
      tell application "Spotify"
        if player state is stopped then return ""
        set t to current track
        return (name of t) & "\\n" & (artist of t) & "\\n" & (album of t) & "\\n" & ((duration of t) / 1000) & "\\n" & player position & "\\n" & (player state as string)
      end tell
      """),
    ("com.apple.Music", "Music", """
      tell application "Music"
        if player state is stopped then return ""
        set t to current track
        return (name of t) & "\\n" & (artist of t) & "\\n" & (album of t) & "\\n" & (duration of t) & "\\n" & player position & "\\n" & (player state as string)
      end tell
      """),
  ]

  /// Song playing in Spotify or Music (never launches a player that is closed).
  static func nowPlaying() -> Data {
    var paused: [String: Any]?
    let running = Set(NSWorkspace.shared.runningApplications.compactMap(\.bundleIdentifier))
    for player in players where running.contains(player.bundleID) {
      let t0 = Date().timeIntervalSince1970
      guard let out = run("/usr/bin/osascript", ["-e", player.script]), !out.isEmpty else { continue }
      let t1 = Date().timeIntervalSince1970
      let f = out.components(separatedBy: "\n")
      guard f.count >= 6 else { continue }
      let num = { (s: String) in Double(s.replacingOccurrences(of: ",", with: ".")) ?? 0 }
      let info: [String: Any] = [
        "source": player.name, "title": f[0], "artist": f[1], "album": f[2],
        "duration": num(f[3]), "position": num(f[4]), "playing": f[5] == "playing",
        // the position is read near the end of the script: timestamp it there
        "at": t1 - 0.25 * (t1 - t0),
      ]
      if f[5] == "playing" { return json(info) }
      paused = paused ?? info
    }
    return json(paused ?? ["source": NSNull()])
  }

  /// Song recognition with the bundled ShazamKit helper (see scripts/recognize.swift).
  static func recognize() -> Data {
    guard let helper = Bundle.main.url(forResource: "recognize", withExtension: nil),
          let out = run(helper.path, ["12"], timeout: 20) else {
      return json(["ok": false, "error": "recognizer not available"])
    }
    return Data(out.utf8)
  }
}

// MARK: - local HTTP server

final class LocalServer {
  let root: URL
  let listener: NWListener
  let queue = DispatchQueue(label: "caleido.server", attributes: .concurrent)
  private(set) var port: UInt16 = 0

  static let types = ["html": "text/html; charset=utf-8", "js": "text/javascript", "css": "text/css",
                      "json": "application/json", "png": "image/png", "svg": "image/svg+xml"]

  init(root: URL) throws {
    self.root = root.standardizedFileURL
    let params = NWParameters.tcp
    params.requiredLocalEndpoint = NWEndpoint.hostPort(host: "127.0.0.1", port: .any)
    listener = try NWListener(using: params)
  }

  func start(ready: @escaping (UInt16) -> Void) {
    listener.newConnectionHandler = { [weak self] conn in self?.handle(conn) }
    listener.stateUpdateHandler = { [weak self] state in
      if case .ready = state, let port = self?.listener.port?.rawValue {
        self?.port = port
        DispatchQueue.main.async { ready(port) }
      }
    }
    listener.start(queue: queue)
  }

  private func handle(_ conn: NWConnection) {
    conn.start(queue: queue)
    conn.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, _, _ in
      guard let self, let data, let head = String(data: data, encoding: .utf8)?.components(separatedBy: "\r\n").first else {
        conn.cancel(); return
      }
      let parts = head.split(separator: " ")
      let target = parts.count > 1 ? String(parts[1]) : "/"
      let path = (target.components(separatedBy: "?").first ?? "/").removingPercentEncoding ?? "/"
      let (status, type, body) = self.respond(path)
      var header = "HTTP/1.1 \(status)\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\n"
      header += "Cache-Control: no-cache\r\nConnection: close\r\n\r\n"
      conn.send(content: Data(header.utf8) + body, completion: .contentProcessed { _ in conn.cancel() })
    }
  }

  private func respond(_ path: String) -> (String, String, Data) {
    switch path {
    case "/api/nowplaying": return ("200 OK", "application/json", KaraokeAPI.nowPlaying())
    case "/api/recognize": return ("200 OK", "application/json", KaraokeAPI.recognize())
    default:
      let file = root.appendingPathComponent(path == "/" ? "index.html" : String(path.dropFirst())).standardizedFileURL
      guard file.path.hasPrefix(root.path), let data = try? Data(contentsOf: file) else {
        return ("404 Not Found", "text/plain", Data("not found".utf8))
      }
      return ("200 OK", Self.types[file.pathExtension] ?? "application/octet-stream", data)
    }
  }
}

// MARK: - app

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, NSWindowDelegate {
  var window: NSWindow!
  var webView: WKWebView!
  var server: LocalServer!
  var awake: NSObjectProtocol?

  func applicationDidFinishLaunching(_ note: Notification) {
    buildMenu()
    awake = ProcessInfo.processInfo.beginActivity(
      options: [.idleDisplaySleepDisabled, .idleSystemSleepDisabled, .userInitiated],
      reason: "Caleido is showing visuals")

    let config = WKWebViewConfiguration()
    config.mediaTypesRequiringUserActionForPlayback = []
    config.preferences.setValue(true, forKey: "fullScreenEnabled")
    webView = WKWebView(frame: .zero, configuration: config)
    webView.uiDelegate = self
    if #available(macOS 13.3, *) { webView.isInspectable = true }

    let screen = Self.preferredScreen()
    window = NSWindow(contentRect: screen.frame, styleMask: [.titled, .closable, .resizable, .miniaturizable],
                      backing: .buffered, defer: false, screen: screen)
    window.title = "Caleido"
    window.backgroundColor = .black
    window.collectionBehavior = [.fullScreenPrimary]
    window.contentView = webView
    window.delegate = self
    window.setFrame(screen.frame, display: true)
    window.makeKeyAndOrderFront(nil)
    window.makeFirstResponder(webView)
    NSApp.activate(ignoringOtherApps: true)

    let root = Bundle.main.resourceURL!.appendingPathComponent("app")
    do {
      server = try LocalServer(root: root)
      server.start { [weak self] port in
        // CALEIDO_QUERY (diagnostics) lets you start with page options, e.g. "karaoke=1"
        let query = ProcessInfo.processInfo.environment["CALEIDO_QUERY"].map { "?" + $0 } ?? ""
        self?.webView.load(URLRequest(url: URL(string: "http://127.0.0.1:\(port)/\(query)")!))
        self?.window.toggleFullScreen(nil)
      }
    } catch {
      NSAlert(error: error).runModal()
      NSApp.terminate(nil)
    }
    if ProcessInfo.processInfo.environment["CALEIDO_SELFTEST"] != nil { selfTest() }
  }

  /// The first external display (the TV), otherwise the main one.
  static func preferredScreen() -> NSScreen {
    let external = NSScreen.screens.first { s in
      let id = s.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? CGDirectDisplayID ?? 0
      return CGDisplayIsBuiltin(id) == 0
    }
    return external ?? NSScreen.main ?? NSScreen.screens[0]
  }

  // grant the page's microphone request (macOS still asks the user once for Caleido)
  func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
               initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
               decisionHandler: @escaping (WKPermissionDecision) -> Void) {
    decisionHandler(origin.host == "127.0.0.1" ? .grant : .deny)
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }

  // MARK: menu

  func buildMenu() {
    let main = NSMenu()
    let appItem = NSMenuItem()
    let appMenu = NSMenu()
    appMenu.addItem(withTitle: "About Caleido", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
    appMenu.addItem(.separator())
    appMenu.addItem(withTitle: "Hide Caleido", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
    appMenu.addItem(withTitle: "Quit Caleido", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    appItem.submenu = appMenu
    main.addItem(appItem)

    let viewItem = NSMenuItem()
    let viewMenu = NSMenu(title: "View")
    let fs = viewMenu.addItem(withTitle: "Toggle Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
    fs.keyEquivalentModifierMask = [.command, .control]
    viewMenu.addItem(withTitle: "Move to Next Display", action: #selector(moveToNextDisplay), keyEquivalent: "d")
    viewMenu.addItem(withTitle: "Reload", action: #selector(reload), keyEquivalent: "r")
    viewItem.submenu = viewMenu
    main.addItem(viewItem)
    NSApp.mainMenu = main
  }

  @objc func reload() { webView.reload() }

  @objc func moveToNextDisplay() {
    let screens = NSScreen.screens
    guard screens.count > 1, let cur = window.screen, let i = screens.firstIndex(of: cur) else { return }
    let next = screens[(i + 1) % screens.count]
    let wasFull = window.styleMask.contains(.fullScreen)
    if wasFull { window.toggleFullScreen(nil) }
    DispatchQueue.main.asyncAfter(deadline: .now() + (wasFull ? 1.0 : 0)) {
      self.window.setFrame(next.frame, display: true)
      if wasFull { self.window.toggleFullScreen(nil) }
    }
  }

  // MARK: diagnostics (CALEIDO_SELFTEST=1): prints the page state every 2 s

  func selfTest() {
    Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
      let js = """
        (() => { const p = window.__party; if (!p) return 'page not ready';
          const k = p.karaoke;
          return JSON.stringify({ mic: p.audio.label(), running: p.state.running, fps: Math.round(p.state.fps),
            quality: p.viz.quality, halfFloat: p.viz.halfFloat, beats: p.audio.beatCount, level: +p.audio.level.toFixed(2),
            size: innerWidth + 'x' + innerHeight, karaoke: k.on, song: k.song && k.song.title, lines: k.lyrics?.synced?.length || 0,
            status: k.status }); })()
        """
      self?.webView.evaluateJavaScript(js) { result, error in
        print(result ?? error?.localizedDescription ?? "?")
        fflush(stdout)
      }
    }
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
