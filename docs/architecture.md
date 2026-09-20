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

Grammar analysis requests a full translation of the corrected text into the explanation language in the same model response. New grammar responses require a nonempty `translation`; `translationLanguage` comes from the request's local settings. Both fields are optional in stored entries for compatibility with older libraries. Translation mode continues to use `corrected` alone. Renderers display all sentence content as literal text with preserved spacing, without interpreting it as HTML or Markdown.

Markdown is a portable learning mirror, not the transactional database. Per-entry files preserve personal annotations; the generated index links to entries and due dates. Directory failures retain the local record and surface a sync error. Moving the configured mirror does not delete the old directory.

Reading mode translates `targetLanguage` into `explanationLanguage`, with grammar points anchored to exact source substrings and a concise learning summary. Expression mode accepts rough ideas plus optional situation/tone and returns a recommendation, alternatives, and clarification questions. Both use the existing `corrected` result field; all additional stored fields remain optional for older libraries. New model responses have mode-specific validation before persistence. These modes run from the practice page and do not use automatic native replacement.

Contextual follow-ups use the same provider transport. `TutorService` validates the IPC request, loads saved context and conversation from the store, excludes entry metadata from the model payload, and prevents concurrent questions on the same record. Each entry retains up to 20 complete turns, while model requests use the most recent complete turns within a 48,000-character history budget. Questions are limited to 4,000 characters and answers to 12,000. Deleted entries cannot be recreated by late answers. Unsaved analysis results can have a temporary renderer conversation without creating a new library entry.

Saved conversations live in the entry's optional `conversation` array. Each successful turn also creates a separate immutable `conversations/<entry-id>-<turn-id>.md` file, linked from the generated index. This avoids rewriting an annotated learning note or an earlier question-and-answer note. Single-file exports include the current complete conversation; mobile review can display it but does not initiate model requests.

Reviews use an auditable SM-2-inspired scheduler in `src/shared/scheduler.ts`. An initial entry is due immediately. A rating updates its interval, ease, repetition count and due date in one serialized transaction.

## Mobile companion

The desktop starts an HTTP server only on explicit request. A 256-bit random token in a URL fragment pairs a phone without putting the token into server request paths. The client holds it in session storage and sends it as a Bearer header. Mobile APIs expose learning entries and review ratings only; no settings, keys, deletion or model calls. Same-origin checks and token checks protect writes. All learned text is escaped before rendering.

The companion uses the exact same library authority as desktop, so reviews appear on both sides immediately after refresh / change notification. It requires a running desktop and a trusted network. OneDrive/Obsidian sync is an independent option for mobile Markdown reading and personal notes.

## Build

Vite bundles React. esbuild bundles Electron main/preload into CommonJS. electron-builder copies the native resources outside ASAR and creates a portable Windows x64 package. CI checks TypeScript, provider/store/scheduler/mobile tests, native compilation, and the packaged directory on Windows.
