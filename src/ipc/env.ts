/** Interpreter discovery IPC. Policy about which one to use lives in `env/`. */
import { invoke } from "@tauri-apps/api/core";

export type CandidateSource = "broodVenv" | "uv" | "path";

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
