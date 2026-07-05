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
import re
import time

import modal
from pydantic import BaseModel

MODEL = "rednote-hilab/dots.mocr"
EMBED_MODEL = "sentence-transformers/LaBSE"  # multilingual embeddings for EN<->ZH alignment
EMBED_DIM = 768  # LaBSE embedding size

# GPU image: vLLM (official dots.mocr support since 0.11.0) + the dots.mocr repo
# for its parsing/markdown code. flash-attn is NOT needed — vLLM has its own
# kernels — so the image builds without a CUDA compile.
gpu_image = (
    modal.Image.debian_slim(python_version="3.12")
    # libcairo2: cairosvg (a dots.mocr dep) loads libcairo.so.2 at import time.
    .apt_install("git", "libgl1", "libglib2.0-0", "libcairo2")
    # hf_transfer as an explicit top-level dep — the [hf_transfer] extra didn't
    # reliably install it, and HF_HUB_ENABLE_HF_TRANSFER=1 below hard-requires it.
    .pip_install("vllm==0.11.0", "huggingface_hub", "hf_transfer", "libsql-client")
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

# Bilingual merge needs no GPU — LaBSE (via sentence-transformers) on CPU is plenty
# for a few thousand short paragraphs. The model is cached in the HF volume.
# pydantic: Modal imports this whole module into the container, and it's imported
# at module top level for the request models — so every image needs it.
combine_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("libsql-client", "sentence-transformers", "numpy")
    .pip_install("pydantic")  # separate layer so the heavy layer above stays cached
)

# Document import: pandoc converts EPUB/DOCX/HTML; the `mobi` package unpacks
# Kindle formats to HTML first. CPU only, no GPU.
doc_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("pandoc")
    .pip_install("libsql-client", "mobi", "pydantic")
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


class CombineReq(BaseModel):
    book_id: str
    en_book_id: str
    zh_book_id: str


class DocConvertReq(BaseModel):
    book_id: str
    source_url: str
    ext: str


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
        _wait_for_server(server, "http://127.0.0.1:8000/health", timeout=15 * 60)

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

        # Per-page rows for the side-by-side review workspace.
        db.execute(
            """CREATE TABLE IF NOT EXISTS pages (
                 book_id TEXT NOT NULL, idx INTEGER NOT NULL,
                 markdown TEXT, layout_image TEXT, PRIMARY KEY (book_id, idx))"""
        )
        db.execute("DELETE FROM pages WHERE book_id = ?", [book_id])  # fresh on retry

        parts = []
        for i, img in enumerate(images):
            res = parser._parse_single_image(
                img, "prompt_layout_all_en", save_dir, "book",
                source="pdf", page_idx=i,
            )
            # Prefer the header/footer-stripped markdown for cleaner reading.
            md_path = res.get("md_content_nohf_path") or res.get("md_content_path")
            page_md = open(md_path, encoding="utf-8").read() if md_path else ""
            parts.append(page_md)
            layout = (
                _layout_data_uri(res["layout_image_path"])
                if res.get("layout_image_path")
                else None
            )
            db.execute(
                "INSERT INTO pages (book_id, idx, markdown, layout_image) VALUES (?, ?, ?, ?)",
                [book_id, i, page_md, layout],
            )
            update(pages_done=i + 1)

        update(status="review", content="\n\n---\n\n".join(parts))
    except Exception as e:  # noqa: BLE001 — surface any failure to the UI
        update(status="error", error=str(e))
        raise
    finally:
        if server is not None:
            server.terminate()
        db.close()


def _wait_for_server(proc, url: str, timeout: int):
    import urllib.request

    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(
                f"vLLM server exited early (code {proc.returncode}) — see `modal app logs scanbook`"
            )
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


def _layout_data_uri(path: str, max_w: int = 1000) -> str:
    """Downscaled JPEG data URI of a boxed layout page — small enough to store
    per-page in Turso and load one at a time during review."""
    import base64
    import io

    from PIL import Image

    img = Image.open(path).convert("RGB")
    w, h = img.size
    if w > max_w:
        img = img.resize((max_w, round(h * max_w / w)))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


@app.function(image=api_image, secrets=[turso_secret])
@modal.fastapi_endpoint(method="POST")
def convert_endpoint(req: ConvertReq):
    convert.spawn(req.book_id, req.pdf_url)
    return {"status": "queued", "book_id": req.book_id}


# ---------------------------------------------------------------------------
# Bilingual merge: interleave a ZH book under its EN counterpart, paragraph by
# paragraph. Chapters (matched by number) bound the work; inside each chapter,
# LaBSE embeddings + a monotonic DP align paragraphs semantically — so the two
# editions splitting paragraphs differently still lines up. Low-confidence
# matches are flagged inline for the human reviewer.
# ---------------------------------------------------------------------------

# GAP < (good-match similarity)/2 so an orphan paragraph is left unmatched (and
# flagged) rather than silently merged into a neighbour. ponytail: tuned by eye —
# raise if true matches get skipped, lower if junk gets force-merged.
GAP = 0.4
MIN_SIM = 0.30  # ponytail: below this a 1:1 match gets flagged for review


@app.function(
    image=combine_image,
    secrets=[turso_secret],
    volumes={"/root/.cache/huggingface": hf_cache},
    timeout=HOUR,
)
def combine(book_id: str, en_book_id: str, zh_book_id: str):
    import libsql_client
    import numpy as np

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

    def load(bid):
        r = db.execute("SELECT title, content, cover_url FROM books WHERE id = ?", [bid])
        if not r.rows:
            raise RuntimeError(f"source book {bid} not found")
        row = r.rows[0]
        return (row[1] or ""), row[2]

    try:
        en_md, en_cover = load(en_book_id)
        zh_md, _ = load(zh_book_id)
        if en_cover:
            update(cover_url=en_cover)

        pairs = pair_chapters(split_chapters(en_md), split_chapters(zh_md))
        update(status="processing", page_count=len(pairs), pages_done=0)

        db.execute(
            """CREATE TABLE IF NOT EXISTS pages (
                 book_id TEXT NOT NULL, idx INTEGER NOT NULL,
                 markdown TEXT, layout_image TEXT, PRIMARY KEY (book_id, idx))"""
        )
        db.execute("DELETE FROM pages WHERE book_id = ?", [book_id])

        for i, (en_ch, zh_ch) in enumerate(pairs):
            md = merge_chapter(en_ch, zh_ch, np)
            # OR REPLACE: idempotent so a Modal retry or an accidental double-trigger
            # overwrites rather than colliding on the (book_id, idx) primary key.
            db.execute(
                "INSERT OR REPLACE INTO pages (book_id, idx, markdown, layout_image) VALUES (?, ?, ?, NULL)",
                [book_id, i, md],
            )
            update(pages_done=i + 1)

        update(status="review", content=None)  # content is assembled on approve
    except Exception as e:  # noqa: BLE001 — surface any failure to the UI
        update(status="error", error=str(e))
        raise
    finally:
        db.close()


_CHAP_RE = re.compile(
    r"^\s*(chapter|part|book|section|prologue|epilogue)\b"
    r"|^\s*\d+\s*[.:、]"
    r"|第\s*[0-9零一二三四五六七八九十百千两]+\s*[章回节卷部篇]",
    re.IGNORECASE,
)
_FIG_RE = re.compile(r"!\[[^\]]*\]\(data:")  # inline base64 figure — don't embed it
_CN = {"零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5,
       "六": 6, "七": 7, "八": 8, "九": 9}
_CN_UNITS = {"十": 10, "百": 100, "千": 1000}
_ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}


def cn_to_int(s: str):
    # ponytail: handles 零..九千多 (chapter range); add 万 if a book ever needs it
    total = num = 0
    for ch in s:
        if ch in _CN:
            num = _CN[ch]
        elif ch in _CN_UNITS:
            total += (num or 1) * _CN_UNITS[ch]
            num = 0
        else:
            return None
    return total + num


def roman_to_int(s: str):
    vals = [_ROMAN.get(c) for c in s]
    if None in vals:
        return None
    total = 0
    for k, v in enumerate(vals):
        total += -v if k + 1 < len(vals) and v < vals[k + 1] else v
    return total or None


def parse_chapter_number(text: str):
    m = re.search(r"\d+", text)
    if m:
        return int(m.group())
    m = re.search(r"第\s*([0-9零一二三四五六七八九十百千两]+)\s*[章回节卷部篇]", text)
    if m:
        return cn_to_int(m.group(1))
    m = re.search(r"\b([ivxlc]+)\b", text, re.IGNORECASE)
    if m:
        return roman_to_int(m.group(1).upper())
    return None


def split_chapters(md: str):
    """Cut a book's markdown into chapters at chapter-style headings. Falls back
    to the shallowest heading level, then to a single chapter."""
    lines = [ln for ln in md.splitlines() if ln.strip() != "---"]
    heads = []
    for i, ln in enumerate(lines):
        m = re.match(r"^(#{1,6})\s+(.*\S)\s*$", ln)
        if m:
            heads.append((i, len(m.group(1)), m.group(2).strip()))
    ch_heads = [h for h in heads if _CHAP_RE.search(h[2])]
    if not ch_heads:
        if heads:
            lvl = min(h[1] for h in heads)
            ch_heads = [h for h in heads if h[1] == lvl]
        else:
            return [{"number": None, "title": "", "body": md.strip(), "level": 1}]

    chapters = []
    front = "\n".join(lines[: ch_heads[0][0]]).strip()
    if front:
        chapters.append({"number": None, "title": "", "body": front, "level": ch_heads[0][1]})
    for k, (idx, lvl, text) in enumerate(ch_heads):
        end = ch_heads[k + 1][0] if k + 1 < len(ch_heads) else len(lines)
        chapters.append({
            "number": parse_chapter_number(text),
            "title": text,
            "body": "\n".join(lines[idx + 1 : end]).strip(),
            "level": lvl,
        })
    return chapters


_EMPTY_CH = {"number": None, "title": "", "body": "", "level": 1}


def pair_chapters(en_chs, zh_chs):
    """Pair numbered chapters by number (re-syncs across editions); pair the
    leading unnumbered front matter by order. Unmatched chapters pair with a
    blank so their text still shows up (flagged) for the reviewer."""
    pairs = []
    en_front = [c for c in en_chs if c["number"] is None]
    zh_front = [c for c in zh_chs if c["number"] is None]
    for k in range(max(len(en_front), len(zh_front))):
        pairs.append((
            en_front[k] if k < len(en_front) else dict(_EMPTY_CH),
            zh_front[k] if k < len(zh_front) else dict(_EMPTY_CH),
        ))
    en_num = {c["number"]: c for c in en_chs if c["number"] is not None}
    zh_num = {c["number"]: c for c in zh_chs if c["number"] is not None}
    for num in sorted(set(en_num) | set(zh_num)):
        pairs.append((en_num.get(num, dict(_EMPTY_CH)), zh_num.get(num, dict(_EMPTY_CH))))
    return pairs


def split_paragraphs(body: str):
    return [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]


def align_by_sim(sim, n, m, gap=GAP):
    """Monotonic DP alignment over a similarity matrix. Allows 1:1, 1:0, 0:1,
    1:2 and 2:1 — covering the usual ways two editions split paragraphs.
    Returns groups of (en_indices, zh_indices, mean_similarity)."""
    INF = float("inf")
    dp = [[INF] * (m + 1) for _ in range(n + 1)]
    back = [[None] * (m + 1) for _ in range(n + 1)]
    dp[0][0] = 0.0
    for i in range(n + 1):
        for j in range(m + 1):
            c = dp[i][j]
            if c == INF:
                continue
            if i < n and c + gap < dp[i + 1][j]:
                dp[i + 1][j], back[i + 1][j] = c + gap, (i, j, "e")
            if j < m and c + gap < dp[i][j + 1]:
                dp[i][j + 1], back[i][j + 1] = c + gap, (i, j, "z")
            if i < n and j < m:
                cost = 1 - sim[i][j]
                if c + cost < dp[i + 1][j + 1]:
                    dp[i + 1][j + 1], back[i + 1][j + 1] = c + cost, (i, j, "11")
            if i < n and j + 1 < m:
                cost = 1 - (sim[i][j] + sim[i][j + 1]) / 2
                if c + cost < dp[i + 1][j + 2]:
                    dp[i + 1][j + 2], back[i + 1][j + 2] = c + cost, (i, j, "12")
            if i + 1 < n and j < m:
                cost = 1 - (sim[i][j] + sim[i + 1][j]) / 2
                if c + cost < dp[i + 2][j + 1]:
                    dp[i + 2][j + 1], back[i + 2][j + 1] = c + cost, (i, j, "21")
    groups = []
    i, j = n, m
    while not (i == 0 and j == 0):
        pi, pj, op = back[i][j]
        if op == "e":
            groups.append(([pi], [], 0.0))
        elif op == "z":
            groups.append(([], [pj], 0.0))
        elif op == "11":
            groups.append(([pi], [pj], float(sim[pi][pj])))
        elif op == "12":
            groups.append(([pi], [pj, pj + 1], float((sim[pi][pj] + sim[pi][pj + 1]) / 2)))
        else:  # "21"
            groups.append(([pi, pi + 1], [pj], float((sim[pi][pj] + sim[pi + 1][pj]) / 2)))
        i, j = pi, pj
    groups.reverse()
    return groups


_MODEL = None


def _embed_texts(texts, np):
    if not texts:
        return np.zeros((0, EMBED_DIM), dtype="float32")
    global _MODEL
    if _MODEL is None:
        from sentence_transformers import SentenceTransformer

        _MODEL = SentenceTransformer(EMBED_MODEL)  # cached in the HF volume after first load
    # normalize_embeddings → dot product is cosine
    return _MODEL.encode(
        texts, batch_size=64, normalize_embeddings=True,
        convert_to_numpy=True, show_progress_bar=False,
    ).astype("float32")


def _embed_paragraphs(paras, np):
    # Figures (inline base64) carry no translatable text — give them zero vectors
    # so the aligner leaves them unmatched (emitted alone) instead of mis-pairing.
    is_fig = [bool(_FIG_RE.search(p)) or len(p) > 6000 for p in paras]
    keep = [k for k, f in enumerate(is_fig) if not f]
    emb = _embed_texts([paras[k][:4000] for k in keep], np)
    dim = emb.shape[1] if emb.shape[0] else EMBED_DIM
    out = np.zeros((len(paras), dim), dtype="float32")
    for r, k in enumerate(keep):
        out[k] = emb[r]
    return out, is_fig


def merge_chapter(en_ch, zh_ch, np) -> str:
    lvl = "#" * (en_ch.get("level") or zh_ch.get("level") or 1)
    out = [f"{lvl} {c['title']}" for c in (en_ch, zh_ch) if c["title"]]

    en_paras, zh_paras = split_paragraphs(en_ch["body"]), split_paragraphs(zh_ch["body"])
    n, m = len(en_paras), len(zh_paras)
    en_vec, en_fig = _embed_paragraphs(en_paras, np)
    zh_vec, zh_fig = _embed_paragraphs(zh_paras, np)
    sim = (en_vec @ zh_vec.T).tolist() if n and m else [[0.0] * m for _ in range(n)]

    for en_idx, zh_idx, score in align_by_sim(sim, n, m):
        is_fig = (en_idx and all(en_fig[k] for k in en_idx)) or (
            zh_idx and all(zh_fig[k] for k in zh_idx)
        )
        unmatched = not en_idx or not zh_idx
        if not is_fig and (unmatched or score < MIN_SIM):
            out.append("> ⚠️ check alignment")
        if en_idx:
            out.append("\n\n".join(en_paras[k] for k in en_idx))
        if zh_idx:
            out.append("\n\n".join(zh_paras[k] for k in zh_idx))
    return "\n\n".join(out).strip()


@app.function(image=api_image, secrets=[turso_secret])
@modal.fastapi_endpoint(method="POST")
def combine_endpoint(req: CombineReq):
    combine.spawn(req.book_id, req.en_book_id, req.zh_book_id)
    return {"status": "queued", "book_id": req.book_id}


# ---------------------------------------------------------------------------
# Document import: EPUB / DOCX / HTML / MOBI / AZW3 -> markdown via pandoc.
# Kindle formats are unpacked to HTML first (pandoc can't read them). Images are
# inlined as base64 data URIs and the book is split into chapters -> pages, so it
# lands in the same review workspace as OCR'd books. No GPU.
# ---------------------------------------------------------------------------

_KINDLE = {"mobi", "azw", "azw3"}


@app.function(image=doc_image, secrets=[turso_secret], timeout=HOUR)
def convert_doc(book_id: str, source_url: str, ext: str):
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

    try:
        update(status="processing")
        workdir = tempfile.mkdtemp()
        src = os.path.join(workdir, f"book.{ext}")
        urllib.request.urlretrieve(source_url, src)

        # Kindle -> HTML/EPUB via the `mobi` unpacker; pandoc reads the rest directly.
        if ext in _KINDLE:
            import mobi

            _, src = mobi.extract(src)

        media = os.path.join(workdir, "media")
        md_path = os.path.join(workdir, "out.md")
        proc = subprocess.run(
            ["pandoc", src, "-t", "gfm", "--extract-media", media, "-o", md_path],
            capture_output=True,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"pandoc failed: {proc.stderr.decode()[:500]}")

        md = _inline_media(open(md_path, encoding="utf-8").read(), workdir)
        md = re.sub(r"</?span[^>]*>", "", md)  # drop pandoc anchor spans that clutter headings
        pages = paginate_doc(md)
        update(page_count=len(pages), pages_done=0)

        db.execute(
            """CREATE TABLE IF NOT EXISTS pages (
                 book_id TEXT NOT NULL, idx INTEGER NOT NULL,
                 markdown TEXT, layout_image TEXT, PRIMARY KEY (book_id, idx))"""
        )
        db.execute("DELETE FROM pages WHERE book_id = ?", [book_id])
        for i, page_md in enumerate(pages):
            db.execute(
                "INSERT OR REPLACE INTO pages (book_id, idx, markdown, layout_image) VALUES (?, ?, ?, NULL)",
                [book_id, i, page_md],
            )
            update(pages_done=i + 1)

        update(status="review", content=None)  # content assembled on approve
    except Exception as e:  # noqa: BLE001 — surface any failure to the UI
        update(status="error", error=str(e))
        raise
    finally:
        db.close()


def _inline_media(md: str, base_dir: str) -> str:
    """Replace pandoc's extracted-image links with self-contained base64 data
    URIs (matching the OCR path), so the markdown carries its own figures."""
    import base64
    import mimetypes

    def repl(m):
        alt, path = m.group(1), m.group(2)
        if path.startswith(("data:", "http://", "https://")):
            return m.group(0)
        fp = path if os.path.isabs(path) else os.path.join(base_dir, path)
        if not os.path.exists(fp):
            return m.group(0)
        mime = mimetypes.guess_type(fp)[0] or "image/png"
        data = base64.b64encode(open(fp, "rb").read()).decode()
        return f"![{alt}](data:{mime};base64,{data})"

    # ponytail: no cover for imports yet — shelf shows the letter fallback. Add a
    # pillow-downscaled first-image cover if it feels bare.
    return re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", repl, md)


def paginate_doc(md: str):
    """Split pandoc output into review pages at the shallowest *recurring* heading
    level — the chapter level for most books. Robust to pandoc wrapping heading
    text in anchor markup (which defeats word-based chapter detection), and skips
    a lone top-level title in favour of the level that actually repeats."""
    from collections import Counter

    lines = md.splitlines()
    heads = [
        (i, len(m.group(1)))
        for i, ln in enumerate(lines)
        if (m := re.match(r"^(#{1,6})\s", ln))
    ]
    if not heads:
        return [md.strip()] if md.strip() else []

    cnt = Counter(lvl for _, lvl in heads)
    recurring = [lvl for lvl in sorted(cnt) if cnt[lvl] >= 2]
    target = recurring[0] if recurring else min(cnt)
    starts = [i for i, lvl in heads if lvl == target]

    pages = []
    front = "\n".join(lines[: starts[0]]).strip()
    if front:
        pages.append(front)
    for k, s in enumerate(starts):
        end = starts[k + 1] if k + 1 < len(starts) else len(lines)
        seg = "\n".join(lines[s:end]).strip()
        if seg:
            pages.append(seg)
    return pages


@app.function(image=api_image, secrets=[turso_secret])
@modal.fastapi_endpoint(method="POST")
def convert_doc_endpoint(req: DocConvertReq):
    convert_doc.spawn(req.book_id, req.source_url, req.ext)
    return {"status": "queued", "book_id": req.book_id}


if __name__ == "__main__":
    # ponytail: GPU/API paths can't run here; check the pure alignment logic.
    assert normalize_turso_url("libsql://x.turso.io") == "https://x.turso.io"
    assert normalize_turso_url("https://x.turso.io") == "https://x.turso.io"

    assert cn_to_int("十二") == 12 and cn_to_int("二十") == 20 and cn_to_int("一百零五") == 105
    assert parse_chapter_number("Chapter 7: Dawn") == 7
    assert parse_chapter_number("第十二章 归来") == 12
    assert parse_chapter_number("Part IV") == 4

    chs = split_chapters("# Chapter 1\n\nHello.\n\n# Chapter 2\n\nBye.")
    assert [c["number"] for c in chs] == [1, 2] and chs[0]["title"] == "Chapter 1"

    # en0~zh0 (1:1); en1 split into zh1+zh2 (1:2)
    g = align_by_sim([[1.0, 0.0, 0.0], [0.0, 1.0, 1.0]], 2, 3)
    assert [(x[0], x[1]) for x in g] == [([0], [0]), ([1], [1, 2])], g
    # middle en paragraph with no ZH match → left unaligned
    g2 = align_by_sim([[1.0, 0.0], [0.0, 0.0], [0.0, 1.0]], 3, 2)
    assert ([1], []) in [(x[0], x[1]) for x in g2], g2

    # splits at the recurring ## level, keeping the lone # title with the front matter
    assert paginate_doc("# T\n\nintro\n\n## A\n\naa\n\n## B\n\nbb") == [
        "# T\n\nintro",
        "## A\n\naa",
        "## B\n\nbb",
    ]
    assert _inline_media("![a](https://x/y.png)", "/none") == "![a](https://x/y.png)"
    assert _inline_media("![a](missing.png)", "/none") == "![a](missing.png)"
    assert re.sub(r"</?span[^>]*>", "", '## <span id="a"></span>X') == "## X"

    print("ok")
