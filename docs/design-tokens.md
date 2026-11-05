# Design tokens

`apps/web/design-tokens.tokens.json` is the source of truth for the web design tokens. It uses the Design Tokens Community Group (DTCG) JSON format so it can be imported into external design-system tools such as zeroheight.

UnoCSS reads this file from `apps/web/uno.config.ts` and converts its token values to the Wind4 theme shape used by the app. Keep token values in the JSON file; add UnoCSS-specific mappings in `uno.config.ts` only when a value needs CSS-specific handling.

## View tokens in zeroheight

The zeroheight free plan supports one styleguide and one token set. To view this project's tokens:

1. Create a styleguide and a token set in zeroheight.
2. Choose **JSON import** as the token source.
3. Upload `apps/web/design-tokens.tokens.json` from this repository.
4. Add a Tokens block to a styleguide page to display the imported set.

For later changes, upload the updated JSON file to replace the token set. This workflow uses zeroheight's hosted UI; it does not require an OCI server.

## Token scope

The file includes the custom breakpoints, layout sizes, typography, colors, radii, and shadow currently defined for the web UI. The viewport-relative values `90vh` and `100dvh` are stored under `$extensions.com.murderparker.unocss.viewportSizing` because the DTCG `dimension` type accepts `px` and `rem`. UnoCSS reads those CSS-specific values from the extension and exposes them as `modal-height` and `viewport` spacing utilities.

Wind4's built-in utility scales and the named component shortcuts in `uno.config.ts` remain part of UnoCSS rather than duplicated as DTCG tokens.
