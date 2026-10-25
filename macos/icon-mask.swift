// Turns a square image into a macOS-style icon: rounded square on a transparent
// 1024x1024 canvas, with a soft shadow. Usage: swift icon-mask.swift in.png out.png
import AppKit
let args = CommandLine.arguments
let src = NSImage(contentsOfFile: args[1])!
let size = 1024.0, inset = 100.0, radius = 185.0
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024, bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let rect = NSRect(x: inset, y: inset + 10, width: size - 2 * inset, height: size - 2 * inset)
let path = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
NSGraphicsContext.saveGraphicsState()
let shadow = NSShadow(); shadow.shadowBlurRadius = 24; shadow.shadowOffset = NSSize(width: 0, height: -10)
shadow.shadowColor = NSColor.black.withAlphaComponent(0.45); shadow.set()
NSColor.black.setFill(); path.fill()
NSGraphicsContext.restoreGraphicsState()
path.addClip()
src.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1)
NSGraphicsContext.current = nil
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
