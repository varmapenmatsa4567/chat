// Copy text to clipboard with a mobile/HTTP fallback.
// navigator.clipboard only works in secure contexts (https / localhost);
// on plain http (e.g. LAN IP from a phone) it is unavailable, so we fall
// back to a hidden textarea + document.execCommand('copy').
export async function copyText(text: string): Promise<boolean> {
  // 1. Modern async API — requires a secure context
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy method
    }
  }

  // 2. Legacy fallback for non-secure contexts / older mobile browsers
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length); // required for iOS
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
