# Chrome Web Store listing — English

**Name:** IRP Reader — dyslexia, plain language, low vision

**Summary (≤ 132 chars):**
Read any page in an adapted view: dyslexia, plain language, low vision. 100% local — nothing leaves your device.

**Category:** Accessibility

## Detailed description

IRP Reader redisplays the page you are reading in a format that is easier on the eyes, with one click or Alt+Shift+L.

**Profiles**
• Dyslexia: generous line and letter spacing, narrow column, soft background.
• Plain language: shorter sentences, everyday words (an automatic reading aid).
• Low vision: maximum contrast, very large text.
• Night reading: dark background, comfortable contrast.

**Nothing gets lost**
After each adaptation the extension checks that every number, date, amount and name from the original page is still shown. If not, it falls back to the original text and tells you.

**Private by design**
• Everything runs in your browser: no server, no account, no ads, no analytics.
• It only acts when you ask (icon or shortcut), on the current tab only.
• The "Local AI" button uses Chrome's built-in AI if your device has it; otherwise simple rules are applied.

**Limits**
"Plain language" is an automatic reading aid, not certified Easy-to-Read (FALC). Browser pages and the Web Store cannot be adapted. Images are not loaded: their alt text is shown instead. The interface is currently in French.

Open source (MIT).

## Permission justifications
- `activeTab`: read the active tab's content only when the user clicks the icon or uses the shortcut. No host permissions.
- `scripting`: inject the reader script into the active tab after that click. Nothing is injected automatically.
- `storage`: remember the chosen profile, text size and simplification option locally.

**Remote code:** none. **Data collected:** none.
