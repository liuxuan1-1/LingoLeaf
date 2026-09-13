# Architecture

## Processes and trust boundaries

React renderer → narrow Electron preload bridge → Electron main process → provider HTTP API / atomic local library / Windows selection helper. The renderer has context isolation and sandbox enabled, Node integration disabled, navigation blocked and a content security policy. It never receives stored API keys.

The Windows helper is a long-lived, hidden PowerShell 5.1 process compiling the bundled C# bridge once. User text travels as JSON over standard input; text is never interpolated into executable script. Capture contexts remain in the helper, where selection identity and source window are revalidated before replacement. Timeouts dispose the helper rather than allowing delayed input to run after the user has moved on.

## Capture and replace

1. Global shortcut fires; an in-flight capture is not started twice.
2. Wait for physical modifier release, inspect foreground and focused element, reject password fields, capture selection via UI Automation. If necessary, perform a bounded clipboard-copy fallback with clipboard ownership tracking.
3. Send only the selected text and user language settings to the configured API. Parse and validate the response before storing or applying it.
4. Grammar appears in a floating result window. For automatic translation, do not activate another window before validating and replacing the original selection.
5. If focus or selection changes, cancel replacement. For explicit popup Apply, restore the original window only as part of that user action, then verify selection identity and text again. Do not replace opaque clipboard-only selections.

## Data and learning

Settings and learning JSON are stored under Electron's `userData` directory. API keys are scoped to provider plus endpoint and encrypted using Windows-backed `safeStorage`. JSON writes use temp files, flush and atomic rename, with in-process serialization preventing lost updates.

Markdown is a portable learning mirror, not the transactional database. Per-entry files preserve personal annotations; the generated index links to entries and due dates. Directory failures retain the local record and surface a sync error. Moving the configured mirror does not delete the old directory.

Reviews use an auditable SM-2-inspired scheduler in `src/shared/scheduler.ts`. An initial entry is due immediately. A rating updates its interval, ease, repetition count and due date in one serialized transaction.

## Mobile companion

The desktop starts an HTTP server only on explicit request. A 256-bit random token in a URL fragment pairs a phone without putting the token into server request paths. The client holds it in session storage and sends it as a Bearer header. Mobile APIs expose learning entries and review ratings only; no settings, keys, deletion or model calls. Same-origin checks and token checks protect writes. All learned text is escaped before rendering.

The companion uses the exact same library authority as desktop, so reviews appear on both sides immediately after refresh / change notification. It requires a running desktop and a trusted network. OneDrive/Obsidian sync is an independent option for mobile Markdown reading and personal notes.

## Build

Vite bundles React. esbuild bundles Electron main/preload into CommonJS. electron-builder copies the native resources outside ASAR and creates a portable Windows x64 package. CI checks TypeScript, provider/store/scheduler/mobile tests, native compilation, and the packaged directory on Windows.
