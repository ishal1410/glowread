// Map an internal analysis error to a user-facing HTTP status + message. The
// skin-analysis path throws errors whose text embeds the upstream Perfect Corp
// signal (e.g. "error_src_face_too_small", the raw CreditInsufficiency body).
// This turns those into something a real user (or a demo judge) can act on,
// instead of a blanket 500 "Analysis failed".

export interface AnalyzeErrorResponse {
  status: number;
  message: string;
}

export function analyzeErrorResponse(err: unknown): AnalyzeErrorResponse {
  const msg = err instanceof Error ? err.message : String(err);

  // Bad input photo — the user can fix this by retaking the shot. Matched on
  // the specific upstream/internal signals only: a bare /face/ also matched
  // unrelated failures ("iface.surface is not a function") and turned a server
  // bug into "your photo is bad".
  if (/face_too_small|no_face|face_not_detected|face_too_large|no face detected/i.test(msg)) {
    return {
      status: 400,
      message: "We couldn't read your face clearly. Please upload a well-lit photo showing your whole face up close.",
    };
  }

  // The bytes are not a decodable image. The magic-byte sniff only reads the
  // first few bytes, so a truncated or renamed file gets past it and fails in
  // the decoder. That is a client input error: answering 500 told the user to
  // retry a file that can never work, and counted their mistake as our outage.
  if (/unsupported image format|premature end of input|input file is missing|vipsjpeg|vipspng|bad extension|corrupt/i.test(msg)) {
    return {
      status: 400,
      message: "That image couldn't be read. Please upload a valid JPEG, PNG, or WebP photo.",
    };
  }

  // The polled task is gone (expired, or a stale id from an old tab). Not a
  // server fault and not retryable against the same task — ask for a new scan.
  if (/poll http 404|task not found|invalid task/i.test(msg)) {
    return {
      status: 404,
      message: "That analysis is no longer available. Please run a new scan.",
    };
  }

  // Upstream credits exhausted — not the user's fault; a transient service state.
  // "credential" must NOT match here — that is our misconfiguration, not an
  // upstream credit state.
  if (/creditinsufficiency|credit_insufficient|insufficient credit|out of credit|quota/i.test(msg)) {
    return {
      status: 503,
      message: "Skin analysis is temporarily unavailable. Please try again later.",
    };
  }

  return { status: 500, message: "Analysis failed. Please try again." };
}
