from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import modal
import base64
import uvicorn

app = FastAPI(title="Audio Separator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "running", "message": "Audio Separator API is live"}

@app.post("/separate")
async def separate(file: UploadFile = File(...)):
    audio_bytes = await file.read()

    if len(audio_bytes) > 50 * 1024 * 1024:
        raise HTTPException(400, "File too large. Max 50MB.")

    try:
        f = modal.Function.from_name("audio-separator", "separate_audio")
        result = await f.remote.aio(audio_bytes, file.filename)

        return JSONResponse({
            "vocals": base64.b64encode(result["vocals"]).decode(),
            "bgm":    base64.b64encode(result["bgm"]).decode(),
            "filename": file.filename,
        })

    except Exception as e:
        raise HTTPException(500, f"Processing failed: {str(e)}")

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
