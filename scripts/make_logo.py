#!/usr/bin/env python3
"""Draws the SHESHA tyre logo and writes every raster the app needs (Android launcher + adaptive + splash, favicon, public/logo.png).
   python3 scripts/make_logo.py   (needs Pillow)"""
import math, os, glob
from PIL import Image, ImageDraw, ImageFont, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AMBER, ORANGE = (251, 191, 36), (249, 115, 22)

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def tyre(size):
    """RGBA tyre filling `size` px (drawn at 4x then downsampled)."""
    S = size * 4; im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im); c = S / 2
    def ring(r, fill): d.ellipse([c - r, c - r, c + r, c + r], fill=fill)
    k = S / 200.0
    ring(92 * k, (13, 13, 16, 255))                                              # tyre body
    for i in range(36):                                                         # tread blocks
        a = i / 36 * 2 * math.pi; ca, sa = math.cos(a), math.sin(a); w = 3.0 * k
        r0, r1 = 80 * k, 92 * k
        pts = [(c + ca * r0 - sa * w, c + sa * r0 + ca * w), (c + ca * r1 - sa * w, c + sa * r1 + ca * w), (c + ca * r1 + sa * w, c + sa * r1 - ca * w), (c + ca * r0 + sa * w, c + sa * r0 - ca * w)]
        d.polygon(pts, fill=(44, 44, 49, 255))
    ring(70 * k, (23, 23, 27, 255))                                             # sidewall
    ring(67 * k, (245, 158, 11, 255)); ring(65 * k, (23, 23, 27, 255))          # amber accent stripe
    ring(50 * k, (212, 212, 216, 255)); ring(46 * k, (31, 31, 36, 255))         # rim lip + dish
    for i in range(5):                                                          # five alloy spokes with an amber->orange gradient
        a0 = i / 5 * 2 * math.pi - math.pi / 2
        for step in range(24):
            t0, t1 = step / 24, (step + 1) / 24; col = lerp(AMBER, ORANGE, t0) + (255,)
            def P(t, off):
                rr = (12 + 34 * t) * k; ww = (4.0 + 4.5 * t) * k * off; ca, sa = math.cos(a0), math.sin(a0)
                return (c + ca * rr - sa * ww, c + sa * rr + ca * ww)
            d.polygon([P(t0, -1), P(t1, -1), P(t1, 1), P(t0, 1)], fill=col)
    ring(15 * k, (39, 39, 42, 255)); ring(13 * k, (63, 63, 70, 255))            # hub
    for i in range(5):
        a = i / 5 * 2 * math.pi - math.pi / 2; x, y = c + math.cos(a) * 8 * k, c + math.sin(a) * 8 * k; r = 2.2 * k
        d.ellipse([x - r, y - r, x + r, y + r], fill=(228, 228, 231, 255))
    hl = Image.new('RGBA', (S, S), (0, 0, 0, 0)); h = ImageDraw.Draw(hl)         # soft specular arc
    h.arc([c - 78 * k, c - 78 * k, c + 78 * k, c + 78 * k], 205, 262, fill=(255, 255, 255, 40), width=int(6 * k))
    im = Image.alpha_composite(im, hl.filter(ImageFilter.GaussianBlur(k * 1.2)))
    return im.resize((size, size), Image.LANCZOS)

def background(w, h, round_=False, radius=0.22):
    S = 2; im = Image.new('RGBA', (w * S, h * S)); px = im.load()
    for y in range(h * S):
        for x in range(w * S):
            u, v = x / (w * S), y / (h * S); base = lerp((24, 24, 27), (9, 9, 11), v)
            g = max(0.0, 1 - math.hypot(u - 0.15, v - 1.0) / 0.9) ** 2
            px[x, y] = lerp(base, ORANGE, g * 0.45) + (255,)
    im = im.resize((w, h), Image.LANCZOS)
    if radius or round_:
        m = Image.new('L', (w * 4, h * 4), 0); md = ImageDraw.Draw(m)
        if round_: md.ellipse([0, 0, w * 4 - 1, h * 4 - 1], fill=255)
        else: md.rounded_rectangle([0, 0, w * 4 - 1, h * 4 - 1], radius=int(min(w, h) * 4 * radius), fill=255)
        im.putalpha(m.resize((w, h), Image.LANCZOS))
    return im

def icon(size, round_=False):
    bg = background(size, size, round_); t = tyre(int(size * 0.84)); bg.alpha_composite(t, ((size - t.width) // 2, (size - t.height) // 2)); return bg

def foreground(size):       # adaptive-icon layer: tyre inside the 66% safe zone on transparent
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0)); t = tyre(int(size * 0.6)); im.alpha_composite(t, ((size - t.width) // 2, (size - t.height) // 2)); return im

def font(px):
    for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf'):
        if os.path.exists(f): return ImageFont.truetype(f, px)
    return ImageFont.load_default()

def splash(w, h):
    im = background(w, h, False, 0).convert('RGBA'); d = min(w, h); t = tyre(int(d * 0.34)); y0 = int(h * 0.5 - t.height * 0.62)
    im.alpha_composite(t, ((w - t.width) // 2, y0))
    dr = ImageDraw.Draw(im); f = font(int(d * 0.075)); txt = 'SHESHA'; bb = dr.textbbox((0, 0), txt, font=f)
    dr.text(((w - (bb[2] - bb[0])) / 2, y0 + t.height + d * 0.04), txt, font=f, fill=(250, 250, 250, 255))
    return im.convert('RGB')

res = os.path.join(ROOT, 'android/app/src/main/res')
for dpi, px in (('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)):
    icon(px).save(f'{res}/mipmap-{dpi}/ic_launcher.png'); icon(px, True).save(f'{res}/mipmap-{dpi}/ic_launcher_round.png')
for dpi, px in (('mdpi', 108), ('hdpi', 162), ('xhdpi', 216), ('xxhdpi', 324), ('xxxhdpi', 432)):
    foreground(px).save(f'{res}/mipmap-{dpi}/ic_launcher_foreground.png')
open(f'{res}/values/ic_launcher_background.xml', 'w').write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0B0B0F</color>\n</resources>\n')
for f in glob.glob(f'{res}/drawable*/splash.png'):
    w, h = Image.open(f).size; splash(w, h).save(f)
big = icon(512); big.save(os.path.join(ROOT, 'public/logo.png')); big.resize((64, 64), Image.LANCZOS).save(os.path.join(ROOT, 'public/favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
tyre(1024).save(os.path.join(ROOT, 'public/tyre.png'))
print('logo assets written')
