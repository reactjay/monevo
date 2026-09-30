/**
 * Sanitizes and cleans text specifically for WhatsApp delivery.
 * WhatsApp does NOT support Markdown headers (#, ###) or horizontal dividers (---).
 * This utility converts them into clean, polished WhatsApp formatting:
 * - Converts `# Heading` and `### Heading` -> `*Heading*`
 * - Removes horizontal lines (`---`, `___`, `***`)
 * - Normalizes broken double/triple asterisks (`**bold**` -> `*bold*`, `**5k*` -> `*5k*`)
 * - Cleans stray quotes/asterisks (e.g. `“Spent *5k*”*` -> `“Spent *5k*”`)
 * - Strips any abruptly cut-off trailing header/item if generation was truncated
 * - Normalizes excessive newlines
 */
export function cleanWhatsAppFormatting(text: string): string {
  if (!text) return '';
  let cleaned = text;

  // 1. Remove markdown horizontal divider lines (---, ___, ***)
  cleaned = cleaned.replace(/^[\s]*[-*_]{3,}[\s]*$/gm, '');

  // 2. Convert markdown headers (### Heading, ## Heading, # Heading) to *Heading*
  // Strip inner asterisks from heading to avoid nested bold issues on WhatsApp
  cleaned = cleaned.replace(/^#{1,6}\s+(.+)$/gm, (_match, heading) => {
    const cleanHeading = heading.replace(/\*/g, '').trim();
    return `*${cleanHeading}*`;
  });

  // 3. Normalize multiple asterisks (**** or *** or **) to single *
  cleaned = cleaned.replace(/\*{2,}/g, '*');

  // 4. Clean up unmatched quote-asterisk combinations
  cleaned = cleaned.replace(/”\*/g, '”').replace(/\*”/g, '”').replace(/“\*/g, '“');

  // 5. If text ends with an unfinished, cut-off fragment (e.g. '*4️⃣ Save before you' without closing '*')
  cleaned = cleaned.replace(/\n+\s*\*[0-9️⃣🔟#\s]+[^*\n]*$/g, '');

  // 6. Reduce 3+ consecutive newlines to 2
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
}
