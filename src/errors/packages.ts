/**
 * Which package installs which module. The import name and the name on PyPI
 * differ for a few very common libraries (`import cv2` comes from
 * `opencv-python`); everything else installs under its own name.
 */

const KNOWN: Readonly<Record<string, string>> = {
  cv2: "opencv-python",
  sklearn: "scikit-learn",
  PIL: "pillow",
  yaml: "pyyaml",
  bs4: "beautifulsoup4",
  dotenv: "python-dotenv",
  skimage: "scikit-image",
  attr: "attrs",
  Crypto: "pycryptodome",
  dateutil: "python-dateutil",
  "google.protobuf": "protobuf",
  serial: "pyserial",
  usb: "pyusb",
  wx: "wxPython",
  gi: "PyGObject",
  Levenshtein: "python-Levenshtein",
  MySQLdb: "mysqlclient",
  psycopg2: "psycopg2-binary",
  jwt: "PyJWT",
  docx: "python-docx",
  pptx: "python-pptx",
  fitz: "PyMuPDF",
  OpenSSL: "pyOpenSSL",
  websocket: "websocket-client",
  telegram: "python-telegram-bot",
  win32api: "pywin32",
  tensorflow: "tensorflow",
  torch: "torch",
  torchvision: "torchvision",
  torchaudio: "torchaudio",
  jax: "jax",
  jaxlib: "jaxlib",
  numpy: "numpy",
  pandas: "pandas",
  scipy: "scipy",
  matplotlib: "matplotlib",
  seaborn: "seaborn",
  plotly: "plotly",
  tqdm: "tqdm",
  requests: "requests",
  transformers: "transformers",
  datasets: "datasets",
  lightning: "lightning",
  pytorch_lightning: "pytorch-lightning",
  xgboost: "xgboost",
  lightgbm: "lightgbm",
  catboost: "catboost",
  statsmodels: "statsmodels",
  nltk: "nltk",
  spacy: "spacy",
  gensim: "gensim",
  networkx: "networkx",
  sympy: "sympy",
  polars: "polars",
  openpyxl: "openpyxl",
  xlrd: "xlrd",
  gymnasium: "gymnasium",
  gym: "gym",
  wandb: "wandb",
  tensorboard: "tensorboard",
  keras: "keras",
  flask: "flask",
  fastapi: "fastapi",
  django: "django",
  streamlit: "streamlit",
  ipython: "ipython",
  IPython: "ipython",
  h5py: "h5py",
  tables: "tables",
  pyarrow: "pyarrow",
  numba: "numba",
  einops: "einops",
  timm: "timm",
  accelerate: "accelerate",
  safetensors: "safetensors",
  huggingface_hub: "huggingface-hub",
  imageio: "imageio",
  librosa: "librosa",
  soundfile: "soundfile",
};

/** Modules that ship with Python itself: installing will not help. */
const STDLIB = new Set([
  "tkinter",
  "_tkinter",
  "sqlite3",
  "_sqlite3",
  "ssl",
  "_ssl",
  "lzma",
  "_lzma",
  "bz2",
  "_bz2",
  "readline",
  "curses",
  "_curses",
  "ctypes",
  "_ctypes",
  "dbm",
  "distutils",
  "imp",
  "asynchat",
  "asyncore",
  "smtpd",
]);

export interface PackageGuess {
  /** The top-level module Python could not find, e.g. `sklearn`. */
  module: string;
  /** What to install, or null when installing cannot help. */
  packageName: string | null;
  /** True when the name is in the table above, so the guess is certain. */
  known: boolean;
}

/**
 * Turn `No module named 'sklearn.linear_model'` into a package to install.
 * Dotted names are looked up longest-prefix first (`google.protobuf`), then by
 * their first segment. A name that is not in the table is guessed as itself,
 * but the card shows it as text rather than as an install button.
 */
export function packageFor(moduleName: string): PackageGuess {
  const parts = moduleName.split(".");
  for (let n = parts.length; n >= 1; n--) {
    const prefix = parts.slice(0, n).join(".");
    const hit = KNOWN[prefix];
    if (hit !== undefined) return { module: prefix, packageName: hit, known: true };
  }
  const top = parts[0] ?? moduleName;
  if (STDLIB.has(top)) return { module: top, packageName: null, known: true };
  return { module: top, packageName: top.replace(/_/g, "-"), known: false };
}
