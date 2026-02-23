const TOKEN_PATTERNS: RegExp[] = [
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._\-+/=]{16,}\b/gi,
  /\b(?:access_token|refresh_token|client_secret|authorization|token)\s*[:=]\s*["']?[^\s,"']{8,}["']?/gi,
];

export function redactSensitiveText(input: string): string {
  let output = input;
  for (const pattern of TOKEN_PATTERNS) {
    output = output.replace(pattern, "[REDACTED]");
  }
  return output;
}

export function toRedactedError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactSensitiveText(error.message),
    };
  }

  return {
    name: "unknown_error",
    message: redactSensitiveText(String(error)),
  };
}
