/** Interpreter discovery IPC. Policy about which one to use lives in `env/`. */
import { invoke } from "@tauri-apps/api/core";

/** `custom` is a path the user browsed to; SPAWN never discovers those. */
export type CandidateSource = "broodVenv" | "uv" | "path" | "custom";

export interface Candidate {
  path: string;
  source: CandidateSource;
}

export interface PythonInfo {
  executable: string;
  version: string;
  prefix: string;
  platform: string;
}

export function discoverInterpreters(brood: string | null): Promise<Candidate[]> {
  return invoke<Candidate[]>("env_discover", { brood });
}

export function probeInterpreter(python: string): Promise<PythonInfo> {
  return invoke<PythonInfo>("env_probe", { python });
}

export function uvPath(): Promise<string | null> {
  return invoke<string | null>("env_uv_path");
}

/** What the ML stack looks like in an interpreter. Every package is optional. */
export interface MlInfo {
  numpy: string | null;
  pandas: string | null;
  torch: string | null;
  device: "cuda" | "mps" | "cpu" | null;
  deviceName: string | null;
  cuda: string | null;
  gpuMemUsed: number | null;
  gpuMemTotal: number | null;
  jax: string | null;
}

export interface MemoryInfo {
  used: number;
  total: number;
}

/** Slow (imports torch); run it in the background. Times out after 20 s. */
export function probeMl(python: string): Promise<MlInfo> {
  return invoke<MlInfo>("env_probe_ml", { python });
}

export function sysMemory(): Promise<MemoryInfo> {
  return invoke<MemoryInfo>("sys_memory");
}

/** Absolute path of an executable on PATH, or null. */
export function which(name: string): Promise<string | null> {
  return invoke<string | null>("env_which", { name });
}
