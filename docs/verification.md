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

## v0.2.0 themes and readability

- Added four semantic desktop palettes (forest, ocean, lavender and midnight), plus system light/dark following, with standard/large/extra-large reading sizes. Default body baseline is18px, controls16.2px and helper text14.76px; extra-large uses20/18/16.4px respectively.
- Appearance is stored through a separate serialized save method. The18 store tests cover migration from older settings, credential/protocol/library preservation, invalid values, no Markdown rewrites, concurrent model-settings saves, and failed-write recovery. The full suite has112 passing tests.
- Used `tests/fixtures/appearance-preview.html` (synthetic UI data, no model calls) to inspect actual renderer components. At1280×720 in all four themes, the visible settings view had no horizontal overflow or low-contrast text in a read-only DOM estimate. Decorative13.5px labels remain separate from content/control text.
- At900×640 with midnight and extra-large text, inspected the model form, its error state and save controls, learning-card detail dialog, and all four review ratings. Inspected content and actions in the440×620 popup, including long grammar/translation content and an error message; no horizontal overflow or low-contrast text was detected in the checked visible content.
- Confirmed theme changes preserve an unsaved model-name edit; reload retains selected appearance. An already-open popup followed theme/font changes without reload. Emulated both system color schemes and observed the correct automatic light/dark switch.
- Short-height layouts hide decorative sidebar copy to keep navigation usable. Compact popup actions wrap into two rows; content remains scrollable. Theme colors also drive native window backgrounds.

The DOM checks are viewport-specific estimates, not a blanket accessibility certification. These appearance checks do not make new calls to paid models or alter a running user's settings.

## v0.2.1 grammar translations and text readability

- `npm test`: **125 passing tests** (63 provider, 21 store, 21 native, 16 mobile, 4 scheduler). The native check compiles and starts the hidden Windows helper, then rejects an unknown capture without injecting input. Production TypeScript, renderer and main/preload builds pass.
- Grammar responses require a complete, nonempty translation into the explanation language. Tests cover Chat Completions and Responses, all five provider adapters, missing/invalid translation without an extra request, preservation of paragraph/list spacing, and translation mode without a redundant translation field.
- Store tests cover old libraries without the new optional fields, translation/language persistence across restart and later settings changes, and literal Markdown output with annotations preserved. Mobile tests run the shipped client script, reveal and search translated content, escape HTML-like text, hide translations for old entries/translation mode, and persist phone reviews through the real store.
- Independent renderer review and React static rendering checks preserve CRLF, blank lines, indentation, tabs and trailing spaces as literal text. The two actual copy handlers forward the exact corrected/translated strings respectively. Popup copying and native replacement still use `corrected`.
- Selection text/background contrast is **7.58 / 6.43 / 6.32 / 9.45** for forest/ocean/lavender/midnight; highlight/input-background contrast is **7.22 / 6.08 / 5.99 / 9.95**. Forced-colors mode uses the system Highlight and HighlightText values. CSS review found no later rule overriding sentence whitespace preservation.
- **Live model checks:** the user's existing local OpenAI-compatible Responses service corrected a synthetic multi-paragraph English note with two grammar errors, retained its blank lines and numbered list, and produced the full Simplified Chinese translation in about 9.1 seconds. A second, grammatically correct sentence returned a Japanese translation and explanation in about 4.5 seconds when the explanation language was Japanese. Neither check read credentials, changed settings, nor wrote user learning records.
- The shared UI fixture contains multi-paragraph/list content, a stress-text popup, legacy records without translations, and translation-mode examples. It is excluded from the production app.

Browser UI verification was attempted twice but blocked by `Codex auth token is unavailable` before a browser session could open. This release therefore has source, static-rendering and API checks, **not new browser screenshots or native GUI visual acceptance**. Existing native selection logic is unchanged; these results do not establish compatibility with every model, editor or display configuration.
## v0.3.0 learning workflows — 2026-09-20

- `npm test`: 225 tests passed across provider (136), store (30), native (21), mobile (19), renderer (8), tutor orchestration (7), and scheduler (4) suites. `npm run build` and Windows x64 portable packaging passed.
- Provider coverage checks reverse reading translation, source-anchored grammar points, key points, expression alternatives/context/tone, malformed output rejection, bounded contextual follow-ups, and all existing provider transports including Responses JSON/SSE and automatic fallback.
- Persistence coverage checks old libraries, language direction, 20-turn limits, concurrent additions, unchanged review progress, atomic failure behavior, annotation-preserving conversation Markdown, exact note deletion, mobile escaping/search/display, and result rendering with preserved formatting.
- Tutor orchestration checks authoritative saved context, temporary conversations, stale/deleted entries, complete-turn history trimming, concurrent submissions, and provider failure recovery. An integration review identified cross-window conversation refresh; the UI now refreshes on opening and on change events and guards stale responses during submission.
- Live requests through a configured local compatible Responses service used synthetic examples only: a two-paragraph English reading produced a Chinese translation with retained blank lines, grammar explanations, and key points; a rough invitation-reply idea produced a cautious recommendation and three tonal alternatives; a second follow-up correctly used the first answer to illustrate regret about missing a train.
- Native desktop validation used an isolated data directory. The production renderer successfully submitted a reading request through preload/main/provider, displayed its translation/grammar/key points, accepted a contextual follow-up, and persisted the answer in both local JSON and a separate Markdown note. Light-theme reading results and dark-theme library/expression details, including alternatives and tone explanations, were visually inspected at 1280×850. User configuration, credentials and learning records were not used or changed.
- The packaged main/preload/renderer files were byte-compared against the verified build; the package reports version 0.3.0 and contains the native resources. Automated tests cover mobile rendering, but no physical phone or macOS/Linux acceptance was performed. Cross-window synchronization was code-reviewed; simultaneous popup/main interaction was not exercised manually.

## v0.4.0 writing and localization — 2026-09-22

- `npm test`: **282 passing tests** across providers (151), store (36), mobile (29), native (21), renderer (16), localization coverage (12), tutor (7), localized screens (6), and scheduler (4). TypeScript and production builds pass. All 647 UI/status keys and their placeholders are covered by the Traditional Chinese, Japanese, Korean, and Spanish catalogs in addition to the Chinese/English source pairs.
- Professional output is required in new grammar responses but optional in stored historical entries. Tests retain the grammar verdict, unchanged correct input, minimal correction, format validation, stored/exported professional wording, and escaped mobile rendering. Grammar uses an 8,192-token explicit limit; other operations use 4,096. Compatible endpoints still omit token-limit fields.
- Live compatible-service checks used synthetic text only. An incorrect email corrected `I has` to `I have` while professional wording changed `missing stuff` to `missing items`; dates and tentative `might` wording were retained. A correct professional sentence remained unchanged. A correct informal sentence kept its grammar result while receiving a separate workplace rewrite and English explanations. Setting the interface language to Japanese did not change the requested Chinese/English explanation language.
- An independent review exercised actual Workbench callbacks with five controlled responses: task/submode mapping, separate drafts/results/options, duplicate-submit protection, disabled switching during submission, and ignored stale responses passed. Professional copy and native replacement remain separate; native replacement still receives `corrected` only. Forest/midnight selected-card body text contrast measured 5.46/7.24 and border contrast 6.35/6.79.
- Browser interaction inspected the actual renderer with demonstration data: three task cards, separate expression drafts, professional output, English/Japanese/Spanish/Korean interface switching, and a 900×760 viewport with extra-large text. Switching the interface to Japanese retained an unsaved model field and both learning-language selections. Korean word wrapping was refined. These fixture checks do not claim real model or native-selection execution.
- Native desktop acceptance used a separate data directory: the production app started in English, displayed all six interface-language options, switched to Japanese through the settings UI, and persisted `uiLanguage=ja` while target/explanation languages both remained English. User credentials and learning records were not read or modified.
- README screenshots show the actual renderer using demonstration text; the language-menu screenshot is from the isolated desktop app. The professional example came from the live synthetic request. Screenshots were inspected before publication. Physical-phone and new native selection/replacement interaction were not repeated for this release; mobile and native protocol regression tests passed.

## Documentation screenshot refresh — 2026-09-22

- Replaced all four README JPEGs with fresh PNG captures of the local renderer using demonstration data. The automation pointer overlay was temporarily hidden during each capture and immediately restored, preserving the actual application content.
- Three overview images are 3842×1768; the complete professional-writing card is 1266×1198. Cropping uses the captured image's pixel scale and includes the complete card border, explanation, and all three learning points.
- A separate visual review confirmed that every final image is free of the black automation pointer and blue halo. The settings image now shows the language and appearance controls with the selector closed, and both README captions describe that view.
