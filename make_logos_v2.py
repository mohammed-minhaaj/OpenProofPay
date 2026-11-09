import os
import math
from PIL import Image, ImageDraw, ImageFont

def get_font(size, bold=True):
    font_candidates = [
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/SFNS.ttf"
    ]
    for p in font_candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()

def draw_github_octocat(draw, cx, cy, radius, fill_color=(255, 255, 255, 255)):
    """Draws an authentic, crisp GitHub Octocat silhouette using geometric shapes."""
    # Head
    head_r = radius * 0.52
    draw.ellipse([cx - head_r, cy - head_r * 0.8, cx + head_r, cy + head_r * 1.1], fill=fill_color)
    
    # Left Ear
    ear_w = radius * 0.28
    ear_h = radius * 0.45
    left_ear = [
        (cx - head_r * 0.85, cy - head_r * 0.3),
        (cx - head_r * 0.75, cy - head_r * 1.3),
        (cx - head_r * 0.25, cy - head_r * 0.7)
    ]
    draw.polygon(left_ear, fill=fill_color)
    
    # Right Ear
    right_ear = [
        (cx + head_r * 0.85, cy - head_r * 0.3),
        (cx + head_r * 0.75, cy - head_r * 1.3),
        (cx + head_r * 0.25, cy - head_r * 0.7)
    ]
    draw.polygon(right_ear, fill=fill_color)
    
    # Body / Shoulders
    body_top = cy + head_r * 0.7
    body = [
        (cx - head_r * 0.7, body_top),
        (cx + head_r * 0.7, body_top),
        (cx + radius * 0.9, cy + radius * 1.05),
        (cx - radius * 0.9, cy + radius * 1.05)
    ]
    draw.polygon(body, fill=fill_color)
    
    # Tail Curve on left
    draw.arc([cx - radius * 1.05, cy + radius * 0.4, cx - radius * 0.3, cy + radius * 1.1], start=80, end=240, fill=fill_color, width=int(radius * 0.18))

def draw_paypal_monogram(draw, ox, oy, scale):
    """Draws the authentic overlapping PayPal double-P logo."""
    # Palette
    c_dark = (0, 48, 135, 255)   # #003087 Deep Navy Blue
    c_light = (0, 156, 222, 255) # #009CDE Cyan/Sky Blue
    c_blend = (0, 30, 95, 255)   # Overlap blend
    
    pw = 50 * scale
    ph = 80 * scale
    stem_w = 18 * scale
    
    # Back P (Dark Blue)
    bx, by = ox, oy
    # Stem
    draw.rounded_rectangle([bx, by, bx + stem_w, by + ph], radius=int(6*scale), fill=c_dark)
    # Loop
    draw.rounded_rectangle([bx, by, bx + pw, by + 48 * scale], radius=int(20*scale), fill=c_dark)
    # Cutout
    draw.rounded_rectangle([bx + stem_w - 2*scale, by + 12*scale, bx + pw - 12*scale, by + 36*scale], radius=int(10*scale), fill=(0,0,0,0))
    
    # Front P (Shifted down and right)
    fx, fy = ox + 14 * scale, oy + 12 * scale
    # Stem
    draw.rounded_rectangle([fx, fy, fx + stem_w, fy + ph], radius=int(6*scale), fill=c_light)
    # Loop
    draw.rounded_rectangle([fx, fy, fx + pw, fy + 48 * scale], radius=int(20*scale), fill=c_light)
    # Cutout
    draw.rounded_rectangle([fx + stem_w - 2*scale, fy + 12*scale, fx + pw - 12*scale, fy + 36*scale], radius=int(10*scale), fill=(0,0,0,0))
    
    # Overlap intersection area (re-drawn with darker blend)
    draw.rounded_rectangle([fx, fy, fx + stem_w, by + 48 * scale], radius=int(4*scale), fill=c_blend)

def create_all_assets():
    os.makedirs('/Users/mohammedminhaajali/Desktop/payPal/assets', exist_ok=True)
    
    # =========================================================================
    # 1. SLIDE 1 HERO BANNER: [GitHub Logo]  ×  [PayPal Logo]
    # =========================================================================
    S = 4  # Super-sampling factor
    W1, H1 = 800 * S, 120 * S
    img1 = Image.new('RGBA', (W1, H1), (0, 0, 0, 0))
    draw1 = ImageDraw.Draw(img1)
    
    # GitHub Mark & Text
    gh_cx, gh_cy = 70 * S, 60 * S
    draw_github_octocat(draw1, gh_cx, gh_cy, 36 * S, (255, 255, 255, 255))
    font_h1 = get_font(48 * S, bold=True)
    draw1.text((125 * S, 32 * S), "GitHub", font=font_h1, fill=(255, 255, 255, 255))
    
    # "×" in electric cyan
    font_x = get_font(52 * S, bold=False)
    draw1.text((375 * S, 28 * S), "×", font=font_x, fill=(56, 189, 248, 255))
    
    # PayPal Mark & Text
    pp_ox, pp_oy = 460 * S, 20 * S
    draw_paypal_monogram(draw1, pp_ox, pp_oy, 1.0 * S)
    draw1.text((550 * S, 32 * S), "Pay", font=font_h1, fill=(255, 255, 255, 255))
    draw1.text((645 * S, 32 * S), "Pal", font=font_h1, fill=(0, 156, 222, 255))
    
    img1 = img1.resize((800, 120), Image.Resampling.LANCZOS)
    img1.save('/Users/mohammedminhaajali/Desktop/payPal/assets/hero_github_x_paypal.png')
    
    # =========================================================================
    # 2. SLIDES 2, 3, 4 HEADER LOGOS PAIR: [GitHub]  •  [PayPal]
    # =========================================================================
    W2, H2 = 340 * S, 48 * S
    img2 = Image.new('RGBA', (W2, H2), (0, 0, 0, 0))
    draw2 = ImageDraw.Draw(img2)
    
    # GitHub
    draw_github_octocat(draw2, 22 * S, 24 * S, 14 * S, (255, 255, 255, 255))
    font_sm = get_font(20 * S, bold=True)
    draw2.text((45 * S, 12 * S), "GitHub", font=font_sm, fill=(255, 255, 255, 255))
    
    # Dot separator
    draw2.ellipse([140 * S, 21 * S, 146 * S, 27 * S], fill=(100, 116, 139, 255))
    
    # PayPal
    draw_paypal_monogram(draw2, 165 * S, 6 * S, 0.44 * S)
    draw2.text((205 * S, 12 * S), "Pay", font=font_sm, fill=(255, 255, 255, 255))
    draw2.text((246 * S, 12 * S), "Pal", font=font_sm, fill=(0, 156, 222, 255))
    
    img2 = img2.resize((340, 48), Image.Resampling.LANCZOS)
    img2.save('/Users/mohammedminhaajali/Desktop/payPal/assets/header_logos_pair.png')
    
    print("Assets generated successfully!")

if __name__ == "__main__":
    create_all_assets()
