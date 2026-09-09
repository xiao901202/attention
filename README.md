# Attention review extension

Chrome extension for local recording and a fixed-question review interface. Extension version: 3.1.0. UI version: review-ui-20260909.2. Instrument: draft-20260909.2.

The questionnaire is a review draft, not a validated measurement instrument. Local records retain the exact question version, item responses and missing-answer reasons. The app does not generate or rephrase questions with AI at runtime.

## Build and preview

```sh
npm ci
npm run build:project
npm run preview:annotation
```

Open http://127.0.0.1:5175/?demo=1 for a fictional demo. No real browsing record is fabricated when recording data is absent. The web preview does not provide the Chrome extension's recording capability.

## Load or update

Stop any active recording. Open chrome://extensions, enable developer mode for an initial install, and load the extension directory. For an existing install from this directory, click Reload and reopen the review tab. The extension loads extension/annotation/dist/index.html; rebuild after source changes.

The original shared video is not cropped by the crop marker. Review answers are stored locally in IndexedDB. Draft .1 records remain separate and downloadable; they are not relabeled as .2 responses. An update no longer clears the latest recording metadata, but recovery of an interrupted active recording is not guaranteed.

## Checks

With the preview running, run:

```sh
node tools/research/test_annotation_ui.cjs
node tools/research/test_annotation_media.cjs
node tools/research/test_extension_update.cjs
```

The browser checks require Playwright and Chrome/Chromium. The scripts use an installed Playwright package or an available local Codex runtime. Set ANNOTATION_TEST_URL to change the preview address. Tests use fictional content, synthetic video and mocked extension APIs; they are not a validation of real-world recording accuracy or psychometric properties.

The public repository contains code, build assets and synthetic test fixtures only. Private research notes, meeting materials, participant information and document deliverables are excluded. Legacy AI clients are inactive on the current review path and have no embedded API credential defaults.
