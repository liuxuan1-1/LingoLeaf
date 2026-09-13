# Windows selection bridge

`windows-helper.ps1` starts in a hidden, STA Windows PowerShell 5.1 process and compiles `SelectionBridge.cs` with the Windows .NET Framework. An installed .NET SDK is not required. Electron communicates through UTF-8 JSON lines on stdin/stdout. Selected text is never interpolated into a shell command, written to temporary files, or evaluated as code.

The first choice is Windows UI Automation's selected text range. Standard Win32 Edit / RichEdit controls have a guarded selection fallback. The last fallback is Ctrl+C; it is only available when the focused application exposes a non-password UI Automation element. That fallback requires a changed clipboard sequence and clipboard ownership by the original process, so old clipboard contents are never treated as the selection.

Replacement requires the original application, process, focused UI Automation element, original selection range, and exact selected text to still match. Automatic replacement never restores another application's focus. `restoreFocus: true` is reserved for the user explicitly clicking Replace in the popup. The helper briefly joins the foreground and source threads' input queues with `AttachThreadInput`, calls `SetForegroundWindow`, and always detaches the queues in `finally`. It does not inject Alt keys, call `SetFocus`, or recreate the selection. The same focus and selection checks apply after restoration; Windows denial produces a clear error before any paste. Opaque clipboard-only selections are copy-only, and read-only document selections cannot be replaced. Documents over 500,000 characters are refused for replacement because the complete result cannot be verified within the bounded operation.

Clipboard formats are cloned before a copy/paste action. Text, HTML, RTF, images, file lists, bytes, and seekable streams are supported. Application-specific formats are copied as opaque native bytes, never deserialized; native handles that cannot be cloned cause the operation to stop before changing the clipboard. Restoration only runs while LingoLeaf still owns the observed clipboard sequence. A later user copy takes precedence. Clipboard locks, application restrictions, and Windows races can still prevent restoration; applications should never treat clipboard preservation as an absolute operating-system guarantee.

Input is submitted only after shortcut modifiers and mouse buttons are released. Requests carry an expiration deadline checked immediately before any injected input. A selection can be replaced once and expires after ten minutes; at most 64 captures remain in process memory. The actual Windows foreground process id and process name are returned for source checks; document/window titles are not read or recorded. The main process uses that process id instead of Electron's potentially stale focused-window cache. The helper requests no elevation. Windows may refuse input to applications running at a higher integrity level.

## Non-interactive verification

```powershell
powershell.exe -NoProfile -NonInteractive -STA -ExecutionPolicy Bypass -File native/windows-helper.ps1 -SelfTest
npx vitest run tests/native.test.ts
```

The self-test compiles the actual source and validates native structure size, focus identity, capture expiry, deadlines, and line-ending handling. The Windows integration test starts the real helper and submits an unknown capture id; that id is rejected before accessing the UI or clipboard. These checks do not demonstrate interactive compatibility with a particular application. Manual acceptance should cover editable Notepad/browser input, a read-only browser selection, password inputs, focus changes while a model request is in flight, multiple identical phrases in a document, and clipboard text/image/file-list preservation.
