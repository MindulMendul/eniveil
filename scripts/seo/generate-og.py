"""Render original share cards. Optional tooling: Pillow and Noto Sans CJK KR.

python3 scripts/seo/generate-og.py /path/to/NotoSansCJK-Regular.ttc
Checked-in PNG sources feed the common WebP build; app builds do not require Python.
"""
from pathlib import Path
import sys
from PIL import Image, ImageDraw, ImageFont

FONT = sys.argv[1]
OUT = Path(__file__).resolve().parents[2] / 'apps/web/assets/images'
OUT.mkdir(parents=True, exist_ok=True)
SCALE = 2

for lang in ('ko', 'en'):
    image = Image.new('RGB', (1200 * SCALE, 630 * SCALE), '#171c1a')
    draw = ImageDraw.Draw(image)

    def line(points, color='#d8bb79', width=2):
        draw.line([(x * SCALE, y * SCALE) for x, y in points], fill=color, width=width * SCALE)

    def text(x, y, value, size, color='#e9e5da'):
        font = ImageFont.truetype(FONT, size * SCALE, index=1)
        draw.text((x * SCALE, y * SCALE), value, font=font, fill=color, anchor='lt')

    draw.rectangle((32*SCALE, 32*SCALE, 1168*SCALE, 598*SCALE), outline='#384139', width=2)
    line([(72, 105), (126, 105)], width=3)
    text(142, 91, 'INTERACTIVE MYSTERY STORIES', 18, '#d8bb79')
    text(72, 203, '애니베일' if lang == 'ko' else 'Eniveil', 64)
    text(76, 306, '당신의 선택으로 이어지는 이야기' if lang == 'ko' else 'Every choice opens a new story.', 27, '#a1aaa2')
    text(76, 480, '발견하고 · 플레이하세요' if lang == 'ko' else 'DISCOVER  /  PLAY', 21, '#d8bb79')

    # An open book whose branching paths represent the reader's choices.
    line([(846, 213), (910, 201), (974, 213), (1038, 201), (1102, 213), (1102, 389), (1038, 377), (974, 389), (910, 377), (846, 389), (846, 213)], width=3)
    line([(974, 213), (974, 389)], width=3)
    line([(868, 246), (941, 246)], '#384139')
    line([(997, 246), (1078, 246)], '#384139')
    line([(900, 342), (924, 310), (950, 322)], width=3)
    line([(924, 310), (924, 280)], width=3)
    for x, y in [(900, 342), (950, 322), (924, 280), (1023, 291), (1064, 334)]:
        draw.ellipse(((x-5)*SCALE, (y-5)*SCALE, (x+5)*SCALE, (y+5)*SCALE), fill='#d8bb79')
    line([(1023, 291), (1064, 334)], '#d8bb79', 3)
    line([(846, 421), (1102, 421)], '#384139')
    text(913, 443, 'STORY / 01', 16, '#a1aaa2')
    image.resize((1200, 630), Image.Resampling.LANCZOS).save(OUT / f'eniveil-{lang}.png', optimize=True)
