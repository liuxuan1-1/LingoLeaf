# Verification record

This file is updated from actual checks before release. Passing a mocked HTTP adapter test does not establish live API access or model accuracy.

## Required checks

- TypeScript compilation and production renderer/main builds.
- Provider protocol, malformed data, error handling, credentials and translation/grammar consistency tests.
- Atomic persistence, Markdown generation, personal annotation retention, scoped key encryption and SRS tests.
- Paired mobile read/write, rejected unauthorized requests, cross-origin rejection and token rotation tests.
- Windows native helper compilation and protocol startup.
- Windows editor selection → hotkey → popup, selected Chinese text → translation → validated replacement, changed selection cancellation, password rejection and clipboard preservation.
- Desktop visual inspection: workbench, settings, library, review and mobile page, at desktop and narrow sizes.
- Portable build starts on this Windows host and contains native resources.
- Public GitHub source and CI verification.

## v0.1.0 verified on Windows, 2026-09-13

- `npm test`: **75 passing tests** (24 provider, 11 store, 4 scheduler, 21 native, 15 mobile). Native tests include the actual hidden Windows PowerShell/C# protocol startup and rejection of an invalid capture without injecting input. Mobile tests include a real LibraryStore restart after a phone rating.
- `npm run build`: TypeScript, Vite production renderer and esbuild main/preload all pass.
- Packaged `release/win-unpacked/LingoLeaf.exe` starts on Windows 11 x64 with the bundled native resources. Provider configuration was entered and tested through the actual desktop settings screen.
- **Actual Notepad interaction:** selected `She go to school every day.`, pressed Ctrl+Shift+G, saw grammar explanation and the generated Markdown entry; explicit Apply changed the original selection to `She goes to school every day.`.
- **Actual Notepad translation:** selected `今天天气怎么样`, pressed Ctrl+Shift+T, verified the original selection became `How is the weather today?` and the original/translation were recorded.
- **Changed-selection protection:** deliberately delayed the response, cleared the original selection before it arrived, verified Notepad remained unchanged and the popup explained that replacement was canceled.
- **Desktop review:** answer reveal and the `3` rating shortcut updated the saved review schedule.
- **Mobile browser interaction:** at 390×844, opened the real paired LAN URL, revealed an answer, rated it, saw the next card remain hidden, confirmed progress in the desktop JSON and desktop due count, and filtered the sentence library by Chinese search text.
- Desktop workbench, settings, popup, mobile pairing and review layouts were visually inspected. The mobile page was inspected at phone dimensions.

Interactive model responses came from the explicitly labeled local fixture in `tests/fixtures/mock-provider.mjs`. These checks prove application transport, persistence and input behavior; **no paid or authenticated production model was called**. All five provider protocol adapters were checked against local HTTP fixtures and relevant official protocol documentation.

Physical phone connectivity, firewall behavior on another machine, unusual editor/clipboard formats, and live accounts for each provider were not manually exercised. The application requires the user's own working model configuration. The mobile companion needs a trusted shared network and a running desktop; synced Markdown remains available independently.

Future native changes should rerun Notepad acceptance and add the affected editor to this matrix. Future protocol changes should update fixtures and, when credentials are available, run a live provider smoke check without committing credentials or private text.

## v0.1.1 Responses compatibility fix

- Confirmed the reported Copilot Bridge service has no `/codex/chat/completions` route, while `/codex/responses` accepts POST. Its upstream README explicitly pairs `/codex` with `wire_api = "responses"`.
- Added explicit and automatic Chat Completions / Responses selection. Auto fallback is limited to a single same-origin retry after HTTP 404/405. Full Responses URLs are recognized directly.
- Provider suite now has 54 passing tests, including JSON and streamed SSE completion, split UTF-8, terminal errors, refusal, truncated streams, duplicate events, bounded responses and no retry for authentication or completed-but-invalid output.
- Added old-settings migration coverage: existing encrypted credentials, learning entries and Markdown notes survive choosing and persisting the new protocol.
- **Live Copilot Bridge check:** the corrected adapter connected to the user's existing local Bridge with model `gpt-6-astra`, protocol auto, and no client API key. It corrected `She go to school every day.` to `She goes to school every day.` and supplied the matching subject–verb agreement explanation in approximately 4.1 seconds. No Bridge settings, auth files or user learning records were modified.

This live check validates that Bridge/model combination. It does not establish access to separate paid OpenAI, Anthropic or Azure accounts. Native selection and mobile behavior are unchanged by this protocol fix.
