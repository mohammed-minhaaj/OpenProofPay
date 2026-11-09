import os
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

def draw_github_mark(draw, cx, cy, r):
    # Head & ears & body of Octocat
    # Outer circle
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 255))
    # Cutout with navy
    navy = (11, 17, 32, 255)
    # Inner face silhouette
    draw.ellipse([cx - r*0.65, cy - r*0.45, cx + r*0.65, cy + r*0.65], fill=navy)
    # Cat ears
    draw.polygon([(cx - r*0.55, cy - r*0.2), (cx - r*0.45, cy - r*0.75), (cx - r*0.15, cy - r*0.4)], fill=navy)
    draw.polygon([(cx + r*0.55, cy - r*0.2), (cx + r*0.45, cy - r*0.75), (cx + r*0.15, cy - r*0.4)], fill=navy)
    # Body cutout
    draw.ellipse([cx - r*0.8, cy + r*0.4, cx + r*0.8, cy + r*1.3], fill=navy)

def draw_paypal_mark(draw, ox, oy, scale):
    c_dark = (0, 48, 135, 255)   # #003087 Deep Navy
    c_light = (0, 156, 222, 255) # #009CDE Sky Blue
    c_blend = (0, 24, 80, 255)
    
    pw = 46 * scale
    ph = 76 * scale
    stem_w = 17 * scale
    
    # Back P
    bx, by = ox, oy
    draw.rounded_rectangle([bx, by, bx + stem_w, by + ph], radius=int(6*scale), fill=c_dark)
    draw.rounded_rectangle([bx, by, bx + pw, by + 46 * scale], radius=int(18*scale), fill=c_dark)
    draw.rounded_rectangle([bx + stem_w - 2*scale, by + 12*scale, bx + pw - 12*scale, by + 34*scale], radius=int(8*scale), fill=(15, 23, 42, 255))
    
    # Front P
    fx, fy = ox + 14 * scale, oy + 12 * scale
    draw.rounded_rectangle([fx, fy, fx + stem_w, fy + ph], radius=int(6*scale), fill=c_light)
    draw.rounded_rectangle([fx, fy, fx + pw, fy + 46 * scale], radius=int(18*scale), fill=c_light)
    draw.rounded_rectangle([fx + stem_w - 2*scale, fy + 12*scale, fx + pw - 12*scale, fy + 34*scale], radius=int(8*scale), fill=(15, 23, 42, 255))
    
    # Overlap
    draw.rounded_rectangle([fx, fy, fx + stem_w, by + 46 * scale], radius=int(4*scale), fill=c_blend)

def create_all_assets():
    os.makedirs('/Users/mohammedminhaajali/Desktop/payPal/assets', exist_ok=True)
    
    # 1. SLIDE 1 HERO: [ GitHub ]  ×  [ PayPal ] on Midnight Navy Badge
    S = 4
    W, H = 820 * S, 120 * S
    img = Image.new('RGBA', (W, H), (15, 23, 42, 255)) # Slate 900
    draw = ImageDraw.Draw(img)
    
    # Rounded container border
    draw.rounded_rectangle([2*S, 2*S, W - 3*S, H - 3*S], radius=24*S, outline=(51, 65, 85, 255), width=2*S)
    
    # GitHub Mark & Text
    gh_cx, gh_cy = 75 * S, 60 * S
    # White circle with Octocat cutout
    draw.ellipse([gh_cx - 32*S, gh_cy - 32*S, gh_cx + 32*S, gh_cy + 32*S], fill=(255, 255, 255, 255))
    # Cutout
    navy = (15, 23, 42, 255)
    draw.ellipse([gh_cx - 20*S, gh_cy - 14*S, gh_cx + 20*S, gh_cy + 22*S], fill=navy)
    draw.polygon([(gh_cx - 18*S, gh_cy - 6*S), (gh_cx - 15*S, gh_cy - 24*S), (gh_cx - 5*S, gh_cy - 12*S)], fill=navy)
    draw.polygon([(gh_cx + 18*S, gh_cy - 6*S), (gh_cx + 15*S, gh_cy - 24*S), (gh_cx + 5*S, gh_cy - 12*S)], fill=navy)
    draw.ellipse([gh_cx - 25*S, gh_cy + 12*S, gh_cx + 25*S, gh_cy + 42*S], fill=navy)
    
    font_bold = get_font(46 * S, bold=True)
    draw.text((125 * S, 32 * S), "GitHub", font=font_bold, fill=(255, 255, 255, 255))
    
    # Glowing '×' in center
    font_x = get_font(52 * S, bold=False)
    draw.text((385 * S, 26 * S), "×", font=font_x, fill=(56, 189, 248, 255))
    
    # PayPal Mark & Text
    pp_ox, pp_oy = 465 * S, 22 * S
    draw_paypal_mark(draw, pp_ox, pp_oy, 0.95 * S)
    draw.text((550 * S, 32 * S), "Pay", font=font_bold, fill=(255, 255, 255, 255))
    draw.text((630 * S, 32 * S), "Pal", font=font_bold, fill=(0, 156, 222, 255))
    
    img = img.resize((820, 120), Image.Resampling.LANCZOS)
    img.save('/Users/mohammedminhaajali/Desktop/payPal/assets/hero_github_x_paypal.png')
    
    # 2. SLIDES 2, 3, 4 HEADER LOGOS PAIR: [GitHub] • [PayPal]
    W2, H2 = 360 * S, 52 * S
    img2 = Image.new('RGBA', (W2, H2), (15, 23, 42, 255))
    draw2 = ImageDraw.Draw(img2)
    draw2.rounded_rectangle([2*S, 2*S, W2 - 3*S, H2 - 3*S], radius=14*S, outline=(51, 65, 85, 255), width=2*S)
    
    # GitHub
    gcx, gcy = 30 * S, 26 * S
    draw2.ellipse([gcx - 14*S, gcy - 14*S, gcx + 14*S, gcy + 14*S], fill=(255, 255, 255, 255))
    draw2.ellipse([gcx - 9*S, gcy - 6*S, gcx + 9*S, gcy + 10*S], fill=navy)
    draw2.polygon([(gcx - 8*S, gcy - 3*S), (gcx - 7*S, gcy - 11*S), (gcx - 2*S, gcy - 5*S)], fill=navy)
    draw2.polygon([(gcx + 8*S, gcy - 3*S), (gcx + 7*S, gcy - 11*S), (gcx + 2*S, gcy - 5*S)], fill=navy)
    draw2.ellipse([gcx - 11*S, gcy + 5*S, gcx + 11*S, gcy + 19*S], fill=navy)
    
    font_sm = get_font(20 * S, bold=True)
    draw2.text((54 * S, 14 * S), "GitHub", font=font_sm, fill=(255, 255, 255, 255))
    
    # Dot
    draw2.ellipse([156 * S, 23 * S, 162 * S, 29 * S], fill=(100, 116, 139, 255))
    
    # PayPal
    draw_paypal_mark(draw2, 182 * S, 9 * S, 0.42 * S)
    draw2.text((224 * S, 14 * S), "Pay", font=font_sm, fill=(255, 255, 255, 255))
    draw2.text((259 * S, 14 * S), "Pal", font=font_sm, fill=(0, 156, 222, 255))
    
    img2 = img2.resize((360, 52), Image.Resampling.LANCZOS)
    img2.save('/Users/mohammedminhaajali/Desktop/payPal/assets/header_logos_pair.png')
    
    print("Logos generated cleanly with dark background badge!")

if __name__ == "__main__":
    create_all_assets()
