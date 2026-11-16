# Lens icon: rounded square, magnifier over two diff lines (+ green, - red).
# Drawn at 1024 and downsampled so small sizes stay crisp.
import sys
from PIL import Image, ImageDraw
S = 1024
def draw(pad):
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    p = int(S * pad)
    d.rounded_rectangle([p, p, S - p, S - p], radius=int((S - 2 * p) * 0.22), fill='#6639ba')
    k = (S - 2 * p) / S
    def X(v): return p + v * k
    # diff lines
    d.rounded_rectangle([X(250), X(330), X(560), X(400)], radius=int(35 * k), fill='#3fb950')
    d.rounded_rectangle([X(250), X(470), X(500), X(540)], radius=int(35 * k), fill='#ff7b72')
    # lens ring + handle
    cx, cy, r, w = X(470), X(435), 235 * k, 62 * k
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline='#ffffff', width=int(w))
    d.line([X(640), X(605), X(790), X(755)], fill='#ffffff', width=int(w * 1.35))
    d.ellipse([X(790) - w * .67, X(755) - w * .67, X(790) + w * .67, X(755) + w * .67], fill='#ffffff')
    return im
full = draw(0.0)
for n in (16, 32, 48, 128):
    full.resize((n, n), Image.LANCZOS).save(f'icon{n}.png')
full.resize((512, 512), Image.LANCZOS).save('icon512.png')
