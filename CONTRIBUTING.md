# Contributing

Use Node.js 22 or newer on Windows. Run `npm ci`, `npm test`, and `npm run build` before opening a pull request. Changes affecting native selection must also be exercised in an actual Windows editor. Tests that mock provider responses verify protocol behavior, not a real model's accuracy.

Keep changes focused and explain the user-visible problem, final behavior, and relevant validation. Do not include API keys, user sentences, local settings, or personal paths in fixtures and screenshots. Use synthetic learning examples.

The renderer is sandboxed and talks only through the typed preload bridge. Provider calls, encryption, persistence and input injection belong in the main/native processes. Never add arbitrary file, shell, or JavaScript execution IPC.

Report issues with Windows version, LingoLeaf version, editor/application name and a synthetic reproduction sentence. Avoid attaching personal learning libraries or credentials. For security concerns, use the repository's private vulnerability reporting if enabled; do not post working secrets or private records publicly.
