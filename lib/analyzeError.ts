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

  // Bad input photo — the user can fix this by retaking the shot.
  if (/face_too_small|no_face|face/i.test(msg)) {
    return {
      status: 400,
      message: "We couldn't read your face clearly. Please upload a well-lit photo showing your whole face up close.",
    };
  }

  // Upstream credits exhausted — not the user's fault; a transient service state.
  if (/creditinsufficiency|credit/i.test(msg)) {
    return {
      status: 503,
      message: "Skin analysis is temporarily unavailable. Please try again later.",
    };
  }

  return { status: 500, message: "Analysis failed. Please try again." };
}
