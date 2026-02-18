/** Global quiet mode flag - set by CLI before running commands */
let quietMode = false;

export function setQuietMode(quiet: boolean): void {
  quietMode = quiet;
}

export function isQuiet(): boolean {
  return quietMode;
}

/** Log a success message (suppressed in quiet mode) */
export function success(message: string): void {
  if (!quietMode) {
    console.log(message);
  }
}

/** Log a warning (never suppressed) */
export function warn(message: string): void {
  console.warn(message);
}
