# Issue 80 verification

The workshop editor now provides an image converter: PNG, JPEG, GIF and WebP inputs are decoded and encoded to WebP locally, then downloaded with a `.webp` filename. The encoder's returned MIME must be `image/webp`; PNG fallback is rejected. Input limit: 10 MB and 16 million pixels. A bounded 256 KB PNG/GIF/JPEG/WebP header scan checks dimensions before bitmap decoding; the decoded bitmap is checked again. Files whose dimensions cannot be read within that bound are rejected. GIF/animated inputs produce a still first frame, explained in the UI. No image upload/storage endpoint exists, so this feature provides local conversion/download without introducing hosting.

- `bash scripts/codex/verify.sh`: passed (43 tests, 463 assertions).
- Chromium/Playwright against built app: each of PNG, JPEG, GIF and WebP yielded a downloaded `.webp` with actual RIFF/WEBP bytes; oversized PNG metadata is rejected before createImageBitmap is called; corrupt input and >10 MB input show errors and offer no stale download; Korean/English and 320px without horizontal overflow passed. Account requests were mocked; conversion uses actual browser decoding/encoding and real downloads.
- Fixture inspection with Pillow verifies dimensions and transparency after conversion. Screenshot: `/tmp/issue80-ko-320.png`.
- `test:e2e` is not configured in the repository; browser checks ran separately.

No existing PNG/JPEG/GIF assets were present in this repository. External thumbnail URLs remain URLs; they are not fetched and rehosted. QA/main deployment was not performed.

Browser-independent header tests live under `apps/web/tests`, run by the root test command alongside server tests. They cover PNG/GIF/JPEG/WebP VP8, VP8L and VP8X dimensions, invalid headers, pixel limits and download naming.
