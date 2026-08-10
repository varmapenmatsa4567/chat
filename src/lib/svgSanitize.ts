// SVG sanitization guard for model-generated (untrusted) whiteboard markup.
//
// The agent produces raw SVG strings that we render into the DOM via
// dangerouslySetInnerHTML. That markup is untrusted, so we scrub it before it
// reaches the browser. This module is a lightweight structural guard used on
// BOTH the server (when validating a TeacherLesson) and the client (right
// before injection). On the client it runs again under DOMPurify as a
// belt-and-suspenders second layer.
//
// We never run scripts or load external resources. If a dangerous construct is
// found we reject the whole string (return null) so a lesson with a malicious
// step is dropped rather than partially sanitized.

// Tags we never allow anywhere in the SVG.
const FORBIDDEN_TAGS =
  /<\s*(script|iframe|object|embed|foreignObject|foreignobject|image)\b/i;

// Event-handler attributes (onclick, onload, ...) — stripped, not fatal.
const EVENT_HANDLER_ATTR = /\s+on[a-z]+\s*=\s*(['"]).*?\1/gi;

// Dangerous URL schemes in href/src/xlink:href. Protocol-relative (//host) and
// bare javascript:/data:/vbscript: are all rejected.
const DANGEROUS_URL =
  /\s+(href|xlink:href|src)\s*=\s*(['"])(\s*javascript:|data:|vbscript:|blob:|\/\/)/i;

// Local (same-document) fragment anchors like #arrow are fine; reject anything
// that references an absolute or external address.
const ABSOLUTE_REF = /\s+(href|xlink:href|src)\s*=\s*(['"])(https?:|\/\/|\w+:)/i;

export type SanitizeResult = { ok: true; svg: string } | { ok: false; error: string };

// Sanitize a raw SVG string. Returns a cleaned string on success, or an error
// result describing why the SVG was rejected.
export function sanitizeSvg(raw: string): SanitizeResult {
  if (!raw || typeof raw !== "string") {
    return { ok: false, error: "SVG is empty or missing" };
  }
  if (raw.length > 400_000) {
    return { ok: false, error: "SVG is too large" };
  }
  if (FORBIDDEN_TAGS.test(raw)) {
    return { ok: false, error: "SVG contains a forbidden element" };
  }
  if (DANGEROUS_URL.test(raw)) {
    return { ok: false, error: "SVG contains a dangerous URL" };
  }

  let clean = raw;

  // Strip event-handler attributes (safe — they add no visual content).
  clean = clean.replace(EVENT_HANDLER_ATTR, " ");

  // Drop any absolute/external reference (https:, //host, or other scheme) so
  // no step depends on external assets.
  clean = clean.replace(ABSOLUTE_REF, " ");

  return { ok: true, svg: clean.trim() };
}
