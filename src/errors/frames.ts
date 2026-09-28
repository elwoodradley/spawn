/** Which traceback frames are the user's own code, and which belong to a library. */
import type { CroakFrame } from "../spawn/croak";

const LIBRARY_PATH =
  /site-packages|dist-packages|[\\/]lib[\\/]python3(?:\.\d+)?[\\/]|[\\/]Lib[\\/]|[\\/]usr[\\/]lib[\\/]python|frozen importlib/;

export function isUserFrame(frame: CroakFrame): boolean {
  return !frame.file.startsWith("<") && !LIBRARY_PATH.test(frame.file);
}

/** The innermost frame in the user's code: where to point. */
export function userFrame(frames: readonly CroakFrame[]): CroakFrame | null {
  for (let i = frames.length - 1; i >= 0; i--) {
    const frame = frames[i];
    if (frame && isUserFrame(frame)) return frame;
  }
  return null;
}

/** The outermost user frame: the script that was run. */
export function entryFrame(frames: readonly CroakFrame[]): CroakFrame | null {
  return frames.find(isUserFrame) ?? null;
}

/** Did the error pass through a library whose path contains `name`? */
export function throughLibrary(frames: readonly CroakFrame[], name: string): boolean {
  const needle = `${name}/`;
  const needleWin = `${name}\\`;
  return frames.some((f) => f.file.includes(needle) || f.file.includes(needleWin));
}
