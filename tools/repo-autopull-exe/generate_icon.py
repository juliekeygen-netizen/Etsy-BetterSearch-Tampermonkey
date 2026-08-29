from pathlib import Path
from PIL import Image, ImageDraw
import math

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "Repo_AutoPull" / "assets"
ASSETS.mkdir(parents=True, exist_ok=True)

S = 512
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Dark rounded tile.
m = 36
d.rounded_rectangle([m, m, S - m, S - m], radius=96, fill=(28, 37, 54, 255))

# Blue repository/folder.
d.rounded_rectangle([105, 145, 245, 220], radius=24, fill=(68, 128, 196, 255))
d.rounded_rectangle([92, 180, 420, 360], radius=44, fill=(57, 111, 177, 255))
d.rounded_rectangle([112, 205, 400, 340], radius=32, fill=(66, 124, 191, 255))

# Cyan sync arrows.
cx, cy, r = 270, 270, 105
cyan = (76, 211, 224, 255)
light = (129, 237, 245, 255)
bbox = [cx - r, cy - r, cx + r, cy + r]
d.arc(bbox, start=205, end=335, fill=cyan, width=30)
d.arc(bbox, start=25, end=155, fill=light, width=30)

def arrowhead(angle_deg, color):
    ang = math.radians(angle_deg)
    tip = (cx + r * math.cos(ang), cy + r * math.sin(ang))
    tangent = ang + math.pi / 2
    back = (tip[0] - 42 * math.cos(tangent), tip[1] - 42 * math.sin(tangent))
    left = (back[0] + 24 * math.cos(ang), back[1] + 24 * math.sin(ang))
    right = (back[0] - 24 * math.cos(ang), back[1] - 24 * math.sin(ang))
    d.polygon([tip, left, right], fill=color)

arrowhead(335, cyan)
arrowhead(155, light)

# Pull/download mark.
white = (235, 250, 252, 255)
d.rounded_rectangle([248, 225, 292, 300], radius=18, fill=white)
d.polygon([(226, 286), (314, 286), (270, 330)], fill=white)

png_path = ASSETS / "RepoAutoPull.png"
ico_path = ASSETS / "RepoAutoPull.ico"
img.save(png_path)
img.save(
    ico_path,
    format="ICO",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
print(f"Wrote {png_path}")
print(f"Wrote {ico_path}")
