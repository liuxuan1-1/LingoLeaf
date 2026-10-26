# LingoLeaf · 语叶

**English** | [简体中文](README.zh-CN.md)

**Turn everyday sentences into lasting language skills.**

An English-learning companion for Windows. Select a sentence, check its grammar or translate it with a keyboard shortcut, and turn everyday expressions into your own learning library.

<img width="2240" height="1488" alt="image" src="https://github.com/user-attachments/assets/529aa9ee-0344-4c0b-940c-1e66b3903512" />

## Everyday use

1. Open Settings (偏好设置), choose OpenAI, an OpenAI-compatible service, Anthropic, Azure OpenAI, or Ollama, and enter your endpoint, model, and API key. Test the connection and save.
2. Select text in another application and press **Ctrl + Shift + G**. A popup shows whether the sentence is grammatically correct, highlights specific errors, and explains the rules with new examples. Source-language words and mixed-language drafts are completed in your configured target language. It also translates the corrected text into your configured explanation language, with a separate copy button for that translation. Style suggestions are labeled separately from grammar errors.
3. Press **Ctrl + Shift + T** to translate the selected text into your configured target language. By default, LingoLeaf replaces the selection when it can verify an editable text range. If the original window or selection has changed, replacement is canceled and you can copy the translation from the result. Both shortcuts are customizable.
4. Search your sentences in the Learning Library. In Review, recall the answer before revealing it, then rate how well you remembered it to schedule your next review.
5. Start a connection under Mobile Sync and scan the QR code with your phone. When both devices are on the same trusted network, mobile review progress is saved directly to the desktop library.

Closing the window minimizes the app to the system tray. Right-click the tray icon to quit completely. LingoLeaf processes text when you trigger a shortcut, submit a practice request, or send a follow-up question; it does not monitor everyday typing.

## Reading, expressing ideas, and follow-up questions

The practice page has three task cards, with a clear selected border and checkmark:

| Mode | What to enter | What you get |
| --- | --- | --- |
| Improve English (修改英文) | A sentence, a mixed-language draft, a speaking script, or conversation screenshots | Correct and complete text in your target language with a separate tone rewrite, or check your reply against the question shown in a screenshot |
| Understand a text (读懂外语) | Text in your target language, such as English | A full translation into your explanation language, source-anchored grammar notes, and key points |
| Express an idea (表达想法) | A complete source text or rough ideas | Choose **Translate a text** for a faithful translation, or **Shape an idea** for suggested wording, alternatives, context/tone controls, and clarification questions |

Translation and idea shaping share one page. Each input mode retains its own draft and result while you switch tasks. The existing global shortcuts still check grammar or translate a complete selection.

For English-to-Chinese reading, set Translation target language to **English** and Explanation language to **简体中文**, then select **Understand a text**.

Professional wording is an optional style improvement, even for grammatically correct input. It has its own copy button and explains what makes the wording more suitable for work or formal communication. The grammar verdict and minimal correction stay separate; applying a grammar correction uses that correction, not the professional version. Existing notes remain readable; analyze again to add a professional version to a new note.

Choose **Professional, Spoken / presentation, Casual, Formal, or Neutral** when checking text. For a speaking script, choose **Spoken / presentation** to get wording that sounds natural aloud. The minimal grammar correction remains separate from the rewrite in your chosen tone.

If you do not know a phrase in your target language, leave it in your own language while checking text: with English selected, `she go to school 每一天` becomes `She goes to school every day.` A complete source-language sentence also works. Both the correction and tone rewrite use the target language; explanations and the meaning translation use the explanation language. Language completion is saved for learning even when no grammar error is found, without treating the source-language words themselves as errors. Existing notes keep their original content; analyze them again to get the updated result.

### Review a reply from an image

Under **Improve English → Review a screenshot reply**, paste a screenshot or use **Add images**. Include the other person's question and your answer—for example, a Teams conversation. You can optionally identify which reply is yours or type a draft. The result shows the recognized question and reply, whether the answer addresses the question, grammar/tone feedback, an improved reply, and any uncertainty. If the text or speaker is unclear, LingoLeaf asks for context and does not save a misleading verdict.

Use a model and endpoint that accept image inputs. PNG, JPEG and WebP are supported, up to four images, 5 MiB each and 12 MiB in total; dimensions are limited to 8192 pixels per side and 24 megapixels. Images are sent only when you submit. The library and Markdown save recognized text and feedback, **not the original images**. Current images can also be included in follow-ups; reattach them after reopening a saved note if needed.

![A separate professional rewrite with explanations and writing tips](docs/images/professional-writing-en-dark.png)

Use the follow-up panel on a result, library note, review answer, or selection popup to ask about an explanation or refine an expression. The model receives that result, your question, and recent conversation turns using the same configured provider. Each result supports up to 20 question-and-answer turns. Long histories remain saved; only recent complete turns within a 48,000-character history budget are sent to the model.

Follow-ups on saved learning entries are stored in the desktop library and separate Markdown conversation notes, and can be read on mobile. A grammatically correct sentence excluded by your save preference has a temporary conversation only; its follow-ups are not added to the library. Every new question is an additional model request. Model suggestions and clarifying questions never replace external text automatically.

Follow-ups accept normal conversational answers as well as older compatible services' answer wrappers. If an answer is generated but cannot be saved, it remains visible with a warning and complete conversation context; continuing becomes temporary. Switching tasks, closing the result, or analyzing again clears temporary conversations, so copy anything you want to keep. Recent-note buttons scroll back to the practice input, and **Open notes folder** reports whether the request succeeded or failed.

## Download and development

Current version: **v0.5.2 preview**. Choose the portable download for your Windows device from [Releases](https://github.com/liuxuan1-1/LingoLeaf/releases/tag/v0.5.2), then configure your own model service after launching it. No installer is needed.

| Download | Device | Supported Windows |
| --- | --- | --- |
| [LingoLeaf-0.5.2-x64.exe](https://github.com/liuxuan1-1/LingoLeaf/releases/download/v0.5.2/LingoLeaf-0.5.2-x64.exe) | Intel / AMD 64-bit PCs | Windows 10 / 11 |
| [LingoLeaf-0.5.2-arm64.zip](https://github.com/liuxuan1-1/LingoLeaf/releases/download/v0.5.2/LingoLeaf-0.5.2-arm64.zip) | ARM64 PCs, such as Snapdragon laptops and Surface Pro X | Windows 11 |

For x64, run the downloaded `.exe` directly. For ARM64, extract the **entire ZIP** to a folder and run `LingoLeaf.exe` inside it. Keep the extracted files together; moving only the executable will prevent the app from starting.

To check your device, open Windows **Settings → System → About → System type**. Both builds use the same settings, API keys, and learning records under the same Windows user account. Exit the running version from its tray menu before upgrading or switching architectures.

[![Windows checks](https://github.com/liuxuan1-1/LingoLeaf/actions/workflows/ci.yml/badge.svg)](https://github.com/liuxuan1-1/LingoLeaf/actions/workflows/ci.yml)

The native bridge uses Windows PowerShell 5.1, .NET Framework, and UI Automation; no additional .NET SDK is required. The desktop app uses Electron with a React + TypeScript interface. Development requires Node.js 22 or later.

```powershell
npm ci
npm run dev
```

Test, build, and package the portable app:

```powershell
npm test
npm run build
npm run package
```

`npm run package` generates an x64 portable EXE and an ARM64 ZIP in `release/`. To build only one architecture, use `npm run package:x64` for the EXE or `npm run package:arm64` for the ZIP. `npm run package:dir` generates unpacked app directories for both architectures.

Builds currently do not include code signing. If you distribute your own build, sign it and check security prompts on the target Windows environment before release. Do not commit runtime data or API keys.

## Appearance and readability

Under **Settings → Interface language**, choose **简体中文, 繁體中文, English, 日本語, 한국어, or Español**. The choice applies immediately and saves independently, including open result popups. It does not submit unsaved model settings or change your translation/explanation languages. The mobile learning page follows the desktop interface language when reloaded. Saved sentences, explanations, tags, and personal notes keep their original language.

![Interface language and appearance settings](docs/images/interface-languages.png)

Under Appearance and Reading (外观与阅读), choose **Forest Cream (松林米白), Sky Blue (晴空蓝白), Lavender (雾紫), or Midnight Dark (午夜深色)**, or follow the Windows light/dark setting. Themes apply to the main interface, forms, learning cards, in-app dialogs, and selection result popups.

![Spanish interface in dark mode with translation and idea shaping on one page](docs/images/expression-es-dark.png)

Text sizes are **Standard / Large / Extra Large**, with body text baselines of 16 / 18 / 20px. Large is the default. Descriptions, labels, and buttons use their own readable sizes. Smaller windows reflow and scroll to keep actions accessible when text is enlarged.

Text selections use a distinct highlight in every theme. Original text, suggested expressions, and translations retain paragraph breaks, blank lines, and indentation when displayed. Copy and Replace use the original plain text of the result.

Appearance changes take effect immediately and save independently. You do not need to click the model settings' Save button, and unsaved API configuration edits are preserved. Open result popups update as well, and your choices persist after restarting the app. Upgrading preserves your model settings, API keys, and learning library.

## API configuration

| Service | Example endpoint | Model field |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | A model your account can access |
| OpenAI-compatible | The base URL provided by the service, such as `https://example.com/v1` | The service's model name |
| LM Studio (select OpenAI-compatible) | `http://127.0.0.1:1234/v1` | The name of a locally loaded model |
| Anthropic | `https://api.anthropic.com/v1` | A Claude model your account can access |
| Azure OpenAI | `https://YOUR-RESOURCE.openai.azure.com` | **Deployment name**; the API version is configurable |
| Ollama | `http://127.0.0.1:11434` | A downloaded model name, such as `qwen3:8b` |

OpenAI and OpenAI-compatible services support **Chat Completions / Responses**. In Request Protocol (请求协议), choose Auto or select a protocol explicitly. If your service requires Responses, select Responses and enter its base URL, or enter the full endpoint ending in `/responses`, such as `https://example.com/v1/responses`. Responses supports both JSON and SSE responses.

Anthropic uses Messages, Ollama uses its native `/api/chat` endpoint, and Azure OpenAI uses deployment-based Chat Completions.

**Reasoning effort** is configurable for OpenAI, OpenAI-compatible services, and Azure OpenAI. **Default** omits the setting; other choices are `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`. Supported values depend on the model and endpoint, so choose Default if your service rejects the setting. Higher effort can take longer and use more tokens. Anthropic and native Ollama use Default in this version. Follow-ups and image requests use the same saved setting. Image or reasoning requests allow 120 seconds; ordinary text requests retain the 60-second limit.

Request formats follow [OpenAI reasoning documentation](https://developers.openai.com/api/docs/guides/reasoning) and [image input documentation](https://developers.openai.com/api/docs/guides/images-vision). Native image adapters also support [Anthropic Messages](https://platform.claude.com/docs/en/build-with-claude/vision) and [Ollama vision](https://docs.ollama.com/capabilities/vision), subject to the configured model's capabilities.

Models must follow JSON output instructions. Enter the API key required by your chosen service; local compatible endpoints or Ollama instances that do not require authentication can leave it blank. Model access and billing are managed through your own provider account. LingoLeaf does not include a shared API key.

Remote APIs require HTTPS; local loopback endpoints may use HTTP. Configure HTTPS for remote self-hosted services. API keys are encrypted with Electron `safeStorage` under your Windows user account. Saved plaintext keys are unavailable to the renderer and are not written to Markdown notes, mobile pages, or exports.

Protocol references: [Chat Completions API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) · [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create).

## Learning library and mobile access

Under Settings → Learning notes folder, choose an existing Obsidian vault or a synced folder such as OneDrive. The app creates:

```text
selected-folder/
└─ LingoLeaf/
   ├─ index.md            # Learning index organized by review time
   ├─ entries/
   │  └─ date-UUID.md     # Original sentence, answer, explanation, practice, and personal notes
   └─ conversations/
      └─ entry-UUID-turn-UUID.md  # One immutable follow-up question and answer
```

Individual Markdown notes are not overwritten after creation, so you can add your own annotations. The app updates the index. The desktop `library.json` is the authoritative source for review progress. Syncing the Markdown folder lets you read and annotate notes on your phone, but **Markdown edits are not automatically imported into review progress**. Reviewing through the QR connection writes directly to the same desktop library, avoiding conflicting progress on two devices.

New grammar notes include the corrected text's translation and its explanation language. These are available in the desktop library, Markdown notes, and mobile review. Older notes stay readable; analyze the original text again to create a new note with a translation. Changing your explanation language does not relabel historical translations.

The mobile connection runs only when you enable it. Each restart creates new pairing credentials, and stopping the connection immediately revokes access. The connection uses HTTP over your local network; use it only on a trusted home network. The QR code grants permission to access the library and submit reviews, so do not share it publicly. If Windows Firewall prompts you on first use, decide whether to allow access on private networks. Your computer must stay running. For offline reading or access from another network, use your own file sync tool.

Learning uses transparent spaced repetition: forgotten material returns soon, while remembered material receives gradually longer review intervals. This is a practice schedule, not a precise measurement of memory ability.

## Limitations

- Standard text fields, Notepad, and applications that expose selections through UI Automation can support safe replacement. PDFs, read-only web pages, custom editors, and some terminals may support only extraction or copying. Applications running with higher privileges may be inaccessible.
- Password fields are not read. When there is no selection, old clipboard content is not treated as newly selected text.
- The native bridge prefers UI Automation. When necessary, it temporarily copies the selection while making a best effort to preserve the clipboard. It refuses this fallback for special formats it cannot safely back up. Results are not pasted blindly across applications.
- LLMs can still misunderstand text. Popups retain the original sentence and explanation. You can disable automatic translation replacement in Preferences; editors usually support **Ctrl + Z** to undo a paste.
- The interface and learning library can open before a working model is configured, but translation and grammar checking require a usable API configuration.

## Contributing and license

MIT License. See [CONTRIBUTING.md](CONTRIBUTING.md) for contributions, [docs/architecture.md](docs/architecture.md) for the architecture, and [docs/verification.md](docs/verification.md) for validation coverage.
