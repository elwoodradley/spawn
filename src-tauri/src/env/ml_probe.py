# Run by SPAWN to learn which ML packages an interpreter has and what
# device torch sees. Every import is guarded: a missing package is `null`,
# never a failure. Prints exactly one JSON line.
import json
out = {"numpy": None, "pandas": None, "torch": None, "device": None, "deviceName": None,
       "cuda": None, "gpuMemUsed": None, "gpuMemTotal": None, "jax": None}
def version(name):
    try:
        return getattr(__import__(name), "__version__", None)
    except Exception:
        return None
out["numpy"] = version("numpy")
out["pandas"] = version("pandas")
out["jax"] = version("jax")
try:
    import torch
    out["torch"] = torch.__version__
    try:
        if torch.cuda.is_available():
            out["device"] = "cuda"
            out["deviceName"] = torch.cuda.get_device_name(0)
            out["cuda"] = torch.version.cuda
            free, total = torch.cuda.mem_get_info(0)
            out["gpuMemUsed"] = total - free
            out["gpuMemTotal"] = total
        elif getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
            out["device"] = "mps"
        else:
            out["device"] = "cpu"
    except Exception:
        out["device"] = out["device"] or "cpu"
except Exception:
    pass
print(json.dumps(out))
