/**
 * FileNotFoundError: the path, the folder the program ran in, and, after a
 * look at the disk, where the file really is and the button that runs from
 * there. `describe` is pure; `probe` gets a filesystem passed in.
 */
import { define } from "./entry";
import { entryFrame, userFrame } from "./frames";
import type { ErrorContext, Explanation } from "./types";

/** `data/train.csv` when under `root`, else the path as given. */
function shorten(path: string, root: string | null): string {
  if (root && (path.startsWith(`${root}/`) || path.startsWith(`${root}\\`))) {
    return path.slice(root.length + 1);
  }
  return path;
}

// 5. File not found ----------------------------------------------------------

interface MissingFile {
  path: string;
  /** The user's file, so the probe can look next to it. */
  script: string | null;
}

function isAbsolute(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

const missingFile = define<MissingFile>({
  id: "missing-file",
  matches(type, message, frames) {
    if (type !== "FileNotFoundError") return null;
    const m = /['"]([^'"]+)['"]/.exec(message);
    if (!m?.[1]) return null;
    return { path: m[1], script: userFrame(frames)?.file ?? entryFrame(frames)?.file ?? null };
  },
  describe(details, context) {
    return describeMissingFile(details, context, []);
  },
  async probe(details, context, fs) {
    if (isAbsolute(details.path)) return null;
    const { path, script } = details;
    const root = context.projectRoot;
    const cwd = context.cwd;
    if (cwd && (await fs.exists(fs.join(cwd, path)))) {
      const found = describeMissingFile(details, context, []);
      found.title = `${path} exists now`;
      found.body = [`It was missing when this ran; it is in ${shorten(cwd, root)} now. Run again.`];
      found.todo = [];
      return found;
    }
    if (root && root !== cwd && (await fs.exists(fs.join(root, path)))) {
      return describeMissingFile(
        details,
        context,
        [
          `The file does exist, in the project root: ${shorten(fs.join(root, path), root)}. The program ran in ${describeDir(cwd, root)}, so the relative path started from the wrong folder.`,
        ],
        [{ kind: "workingDirectory", mode: "project", file: script }],
      );
    }
    const beside = script ? fs.dirName(script) : null;
    if (beside && beside !== cwd && (await fs.exists(fs.join(beside, path)))) {
      return describeMissingFile(
        details,
        context,
        [
          `The file does exist, next to your script: ${shorten(fs.join(beside, path), root)}. The program ran in ${describeDir(cwd, root)}, so the relative path started from the wrong folder.`,
        ],
        [{ kind: "workingDirectory", mode: "file", file: script }],
      );
    }
    return describeMissingFile(details, context, [
      `Nothing named ${path} is in ${describeDir(cwd, root)}${root && root !== cwd ? " or in the project root" : ""}.`,
    ]);
  },
});

function describeDir(cwd: string | null, root: string | null): string {
  if (!cwd) return "its working directory";
  if (cwd === root) return "the project root";
  return shorten(cwd, root);
}

function describeMissingFile(
  { path }: MissingFile,
  context: ErrorContext,
  extra: string[],
  actions: Explanation["actions"] = [],
): Explanation {
  const relative = !isAbsolute(path);
  const facts = [{ label: "File", value: path }];
  if (relative && context.cwd) facts.push({ label: "Looked in", value: context.cwd });
  return {
    id: "missing-file",
    title: `Python could not find the file ${path}`,
    body: [
      relative
        ? `A path without a leading / is looked up from the folder the program runs in, not from where the .py file is.`
        : `Nothing exists at that exact path.`,
      ...extra,
    ],
    facts,
    todo:
      extra.length > 0
        ? []
        : ["Check the spelling, the folder, and the file extension (train.csv vs train.csv.txt)."],
    actions,
  };
}

export { missingFile };
