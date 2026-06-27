"""
Scanbook OCR converter on Modal.

Spawn-on-demand batch job: download a scanned PDF, run rednote-hilab/dots.mocr
over every page via a local vLLM server, and write the assembled markdown back
to Turso. Figures and the cover ride along as inline base64 data URIs (that's
how dots.mocr's own `layoutjson2md` emits Pictures), so no blob storage needed.

Deploy:
  modal secret create scanbook-turso \
      TURSO_DATABASE_URL=libsql://your-db.turso.io TURSO_AUTH_TOKEN=...
  modal deploy scanbook_modal.py

The printed `convert_endpoint` URL goes in the Next app's MODAL_CONVERT_URL.
"""

import os
import time

import modal
from pydantic import BaseModel

MODEL = "rednote-hilab/dots.mocr"

# GPU image: vLLM (official dots.mocr support since 0.11.0) + the dots.mocr repo
# for its parsing/markdown code. flash-attn is NOT needed — vLLM has its own
# kernels — so the image builds without a CUDA compile.
gpu_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("git", "libgl1", "libglib2.0-0")
    .pip_install("vllm==0.11.0", "huggingface_hub[hf_transfer]", "libsql-client")
    .run_commands(
        "git clone https://github.com/rednote-hilab/dots.mocr.git /opt/dotsmocr",
        "cd /opt/dotsmocr && pip install -e . --no-deps",
        # Only the runtime deps the parser actually needs (skip gradio/streamlit).
        "pip install PyMuPDF openai qwen_vl_utils transformers==4.57.6 accelerate cairosvg pydantic",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "PYTHONPATH": "/opt/dotsmocr"})
)

api_image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "fastapi[standard]"
)

hf_cache = modal.Volume.from_name("scanbook-hf-cache", create_if_missing=True)
turso_secret = modal.Secret.from_name("scanbook-turso")

app = modal.App("scanbook")

HOUR = 60 * 60


def normalize_turso_url(url: str) -> str:
    """libsql-client speaks http(s)/ws(s), so map Turso's libsql:// scheme."""
    return url.replace("libsql://", "https://")


def _now_ms() -> int:
    return int(time.time() * 1000)


class ConvertReq(BaseModel):
    book_id: str
    pdf_url: str


@app.function(
    image=gpu_image,
    gpu="L4",
    volumes={"/root/.cache/huggingface": hf_cache},
    secrets=[turso_secret],
    timeout=2 * HOUR,
)
def convert(book_id: str, pdf_url: str):
    import subprocess
    import tempfile
    import urllib.request

    import libsql_client

    db = libsql_client.create_client_sync(
        url=normalize_turso_url(os.environ["TURSO_DATABASE_URL"]),
        auth_token=os.environ.get("TURSO_AUTH_TOKEN"),
    )

    def update(**fields):
        cols = ", ".join(f"{k} = ?" for k in fields)
        db.execute(
            f"UPDATE books SET {cols}, updated_at = ? WHERE id = ?",
            [*fields.values(), _now_ms(), book_id],
        )

    server = None
    try:
        from dots_mocr.parser import DotsMOCRParser
        from dots_mocr.utils.doc_utils import load_images_from_pdf
        from dots_mocr.utils.image_utils import PILimage_to_base64

        workdir = tempfile.mkdtemp()
        pdf_path = os.path.join(workdir, "book.pdf")
        urllib.request.urlretrieve(pdf_url, pdf_path)

        # Start a local vLLM server for dots.mocr.
        server = subprocess.Popen(
            [
                "vllm", "serve", MODEL,
                "--port", "8000",
                "--served-model-name", "model",
                "--trust-remote-code",
                "--chat-template-content-format", "string",
                "--gpu-memory-utilization", "0.9",
            ]
        )
        _wait_for_server("http://127.0.0.1:8000/health", timeout=15 * 60)

        images = load_images_from_pdf(pdf_path, dpi=200)
        if not images:
            raise RuntimeError("No renderable pages found in PDF.")

        cover = PILimage_to_base64(_thumbnail(images[0]))
        update(status="processing", page_count=len(images), pages_done=0, cover_url=cover)

        parser = DotsMOCRParser(
            use_hf=False, ip="127.0.0.1", port=8000, model_name="model",
            dpi=200, output_dir=workdir,
        )
        save_dir = os.path.join(workdir, "out")
        os.makedirs(save_dir, exist_ok=True)

        parts = []
        for i, img in enumerate(images):
            res = parser._parse_single_image(
                img, "prompt_layout_all_en", save_dir, "book",
                source="pdf", page_idx=i,
            )
            # Prefer the header/footer-stripped markdown for cleaner reading.
            md_path = res.get("md_content_nohf_path") or res.get("md_content_path")
            parts.append(open(md_path, encoding="utf-8").read() if md_path else "")
            update(pages_done=i + 1)

        update(status="review", content="\n\n---\n\n".join(parts))
    except Exception as e:  # noqa: BLE001 — surface any failure to the UI
        update(status="error", error=str(e))
        raise
    finally:
        if server is not None:
            server.terminate()
        db.close()


def _wait_for_server(url: str, timeout: int):
    import urllib.request

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=5) as r:
                if r.status == 200:
                    return
        except Exception:
            pass
        time.sleep(3)
    raise TimeoutError(f"vLLM server not ready after {timeout}s")


def _thumbnail(img, max_w: int = 400):
    w, h = img.size
    if w > max_w:
        img = img.resize((max_w, round(h * max_w / w)))
    return img


@app.function(image=api_image, secrets=[turso_secret])
@modal.fastapi_endpoint(method="POST")
def convert_endpoint(req: ConvertReq):
    convert.spawn(req.book_id, req.pdf_url)
    return {"status": "queued", "book_id": req.book_id}


if __name__ == "__main__":
    # ponytail: the OCR path needs a real GPU; only the pure helper is unit-checkable.
    assert normalize_turso_url("libsql://x.turso.io") == "https://x.turso.io"
    assert normalize_turso_url("https://x.turso.io") == "https://x.turso.io"
    print("ok")
