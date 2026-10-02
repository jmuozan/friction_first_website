"""Turn source images into 1-bit dither masks (black = ink, white = paper).
The colours are painted in the browser by js/dither.js, so palettes can be
tested without regenerating anything. `width` is the dither resolution: the
lower it is, the chunkier the dots once the page scales it up.  Run:  python3 tools/dither.py
"""
from PIL import Image, ImageOps, ImageEnhance
import numpy as np
import os

# Paths below are relative to the repo root, wherever this is run from.
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

OUT = "imgs/dither/"

def atkinson(g):
    g = g.astype(np.float32) / 255.0
    h, w = g.shape
    out = np.zeros_like(g, dtype=bool)
    for y in range(h):
        row = g[y]
        for x in range(w):
            old = row[x]
            new = 1.0 if old > 0.5 else 0.0
            out[y, x] = new == 0.0          # ink where dark
            err = (old - new) / 8.0
            for dx, dy in ((1, 0), (2, 0), (-1, 1), (0, 1), (1, 1), (0, 2)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and ny < h:
                    g[ny, nx] += err
    return out

def make(src, name, box=(0, 0, 1, 1), width=320, contrast=1.0,
         gamma=1.0, invert=False, levels=False):
    im = ImageOps.exif_transpose(Image.open(src)).convert("L")
    W, H = im.size
    im = im.crop((int(box[0]*W), int(box[1]*H), int(box[2]*W), int(box[3]*H)))
    im = im.resize((width, round(width * im.height / im.width)), Image.LANCZOS)
    if invert:
        im = ImageOps.invert(im)
    if levels:
        # Stretch so the paper of tinted scans/photos becomes white.
        im = ImageOps.autocontrast(im, cutoff=(1, 6))
    im = ImageEnhance.Contrast(im).enhance(contrast)
    a = np.asarray(im, dtype=np.float32) / 255.0
    a = (a ** gamma) * 255.0
    ink = atkinson(a)
    # 1-bit: black = ink, white = paper. js/dither.js paints the colours.
    out = Image.fromarray(~ink).convert("1")
    out.save(OUT + name + ".png", optimize=True)
    print(name, out.size)

DIAG = "imgs/diagram_2.jpg"
SRC = "imgs/sources/"

# Whole images, original proportions (only empty margins trimmed). Widths are
# ~150 per grid column so every card ends up with roughly the same dot size.
# Diagram: pink on white -> push pink into mid-greys so it reads as dot texture
make(DIAG, "diagram", box=(0.05, 0.08, 0.97, 0.86), width=320, contrast=1.8, gamma=1.6)
make(SRC + "fable.png", "fable", box=(0.035, 0.035, 0.965, 0.965), width=200, contrast=1.1, gamma=0.75)
make(SRC + "playing-cards.png", "playing-cards", width=150, levels=True, contrast=1.3)
make(SRC + "brain.png", "brain", box=(0.03, 0.03, 1, 1), width=150, levels=True, contrast=1.2)
make(SRC + "tree.png", "tree", width=150, levels=True, contrast=1.2)
make(DIAG, "diagram-loop", box=(0.55, 0.28, 0.97, 0.58), width=320, contrast=1.9, gamma=1.7)
# Photos: stretch levels so the white table / walls read as paper.
make(SRC + "cards.JPG", "cards", box=(0.3, 0.27, 0.97, 0.83), width=150, levels=True, contrast=1.1, gamma=0.7)
make(SRC + "contact.JPG", "contact", box=(0, 0.1, 1, 1), width=320, levels=True, contrast=1.1, gamma=0.65)

# Card backs for the deck builder tiles (cards.html). Trimmed to the artwork,
# without the white print border.
CARDS = "imgs/cards/"
for n in ("casestudy", "confession", "perspective", "wildcard"):
    make(CARDS + n + "_back.png", "back-" + n, box=(0.09, 0.06, 0.91, 0.94), width=150, levels=True, contrast=1.2)
    # Finer version for the printed PDF: ~0.23 mm dots on a 70 mm card.
    make(CARDS + n + "_back.png", "print-" + n, box=(0.09, 0.06, 0.91, 0.94), width=300, levels=True, contrast=1.2)
