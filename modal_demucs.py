import modal

app = modal.App("audio-separator")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("demucs", "torch", "torchaudio", "torchcodec", "diffq")
)

@app.function(
    image=image,
    gpu="T4",
    timeout=600,
    memory=8192,
)
def separate_audio(audio_bytes: bytes, filename: str) -> dict:
    import os
    import sys
    import subprocess
    import tempfile
    import torchaudio

    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, filename)
        with open(input_path, "wb") as f:
            f.write(audio_bytes)

        base = os.path.splitext(filename)[0]

        # Run two architecturally different models and average — this is the
        # standard ensemble trick that significantly reduces separation bleed.
        for model_name in ["htdemucs_ft", "mdx_extra_q"]:
            result = subprocess.run(
                [sys.executable, "-m", "demucs",
                 "-n", model_name,
                 "--two-stems", "vocals",
                 "--out", tmpdir,
                 input_path],
                capture_output=True,
                text=True
            )
            print(f"[{model_name}] STDOUT:", result.stdout[-500:])
            print(f"[{model_name}] STDERR:", result.stderr[-500:])
            if result.returncode != 0:
                raise RuntimeError(f"Demucs ({model_name}) failed:\n{result.stderr}")

        def load_stem(model_name, stem_name):
            path = os.path.join(tmpdir, model_name, base, stem_name)
            waveform, sr = torchaudio.load(path)
            return waveform, sr

        v1, sr = load_stem("htdemucs_ft", "vocals.wav")
        v2, _  = load_stem("mdx_extra_q", "vocals.wav")
        b1, _  = load_stem("htdemucs_ft", "no_vocals.wav")
        b2, _  = load_stem("mdx_extra_q", "no_vocals.wav")

        # Align to shortest length (models may differ by a few samples)
        n = min(v1.shape[-1], v2.shape[-1])
        vocals_avg = (v1[..., :n] + v2[..., :n]) / 2
        bgm_avg    = (b1[..., :n] + b2[..., :n]) / 2

        def to_bytes(waveform, name):
            # torchcodec infers format from the file extension, not the format= arg
            path = os.path.join(tmpdir, name)
            torchaudio.save(path, waveform, sr)
            with open(path, "rb") as f:
                return f.read()

        return {
            "vocals": to_bytes(vocals_avg, "_out_vocals.wav"),
            "bgm":    to_bytes(bgm_avg,    "_out_bgm.wav"),
        }
