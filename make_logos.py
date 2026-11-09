import os
import math
from PIL import Image, ImageDraw, ImageFont

def get_font(size, bold=True):
    font_paths = [
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/SFNS.ttf"
    ]
    for p in font_paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()

def parse_svg_path_to_polygons(path_str, scale=1.0, offset_x=0.0, offset_y=0.0):
    """Simple SVG path parser for M, L, H, V, C, c, z commands."""
    import re
    # Tokenize path
    tokens = re.findall(r'([A-Za-z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?)', path_str)
    
    polygons = []
    current_poly = []
    
    i = 0
    curr_x, curr_y = 0.0, 0.0
    start_x, start_y = 0.0, 0.0
    cmd = ''
    
    def bezier_pt(p0, p1, p2, p3, t):
        u = 1 - t
        tt = t * t
        uu = u * u
        uuu = uu * u
        ttt = tt * t
        x = uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0]
        y = uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1]
        return (x, y)

    while i < len(tokens):
        token = tokens[i]
        if token.isalpha():
            cmd = token
            i += 1
        
        if cmd == 'M':
            curr_x = float(tokens[i])
            curr_y = float(tokens[i+1])
            start_x, start_y = curr_x, curr_y
            current_poly = [(curr_x * scale + offset_x, curr_y * scale + offset_y)]
            i += 2
            cmd = 'L'
        elif cmd == 'm':
            curr_x += float(tokens[i])
            curr_y += float(tokens[i+1])
            start_x, start_y = curr_x, curr_y
            current_poly = [(curr_x * scale + offset_x, curr_y * scale + offset_y)]
            i += 2
            cmd = 'l'
        elif cmd == 'L':
            curr_x = float(tokens[i])
            curr_y = float(tokens[i+1])
            current_poly.append((curr_x * scale + offset_x, curr_y * scale + offset_y))
            i += 2
        elif cmd == 'l':
            curr_x += float(tokens[i])
            curr_y += float(tokens[i+1])
            current_poly.append((curr_x * scale + offset_x, curr_y * scale + offset_y))
            i += 2
        elif cmd == 'H':
            curr_x = float(tokens[i])
            current_poly.append((curr_x * scale + offset_x, curr_y * scale + offset_y))
            i += 1
        elif cmd == 'h':
            curr_x += float(tokens[i])
            current_poly.append((curr_x * scale + offset_x, curr_y * scale + offset_y))
            i += 1
        elif cmd == 'V':
            curr_y = float(tokens[i])
            current_poly.append((curr_x * scale + offset_x, curr_y * scale + offset_y))
            i += 1
        elif cmd == 'v':
            curr_y += float(tokens[i])
            current_poly.append((curr_x * scale + offset_x, curr_y * scale + offset_y))
            i += 1
        elif cmd == 'C':
            p0 = (curr_x, curr_y)
            p1 = (float(tokens[i]), float(tokens[i+1]))
            p2 = (float(tokens[i+2]), float(tokens[i+3]))
            p3 = (float(tokens[i+4]), float(tokens[i+5]))
            for step in range(1, 11):
                t = step / 10.0
                pt = bezier_pt(p0, p1, p2, p3, t)
                current_poly.append((pt[0] * scale + offset_x, pt[1] * scale + offset_y))
            curr_x, curr_y = p3
            i += 6
        elif cmd == 'c':
            p0 = (curr_x, curr_y)
            p1 = (curr_x + float(tokens[i]), curr_y + float(tokens[i+1]))
            p2 = (curr_x + float(tokens[i+2]), curr_y + float(tokens[i+3]))
            p3 = (curr_x + float(tokens[i+4]), curr_y + float(tokens[i+5]))
            for step in range(1, 11):
                t = step / 10.0
                pt = bezier_pt(p0, p1, p2, p3, t)
                current_poly.append((pt[0] * scale + offset_x, pt[1] * scale + offset_y))
            curr_x, curr_y = p3
            i += 6
        elif cmd in ['Z', 'z']:
            current_poly.append((start_x * scale + offset_x, start_y * scale + offset_y))
            if current_poly:
                polygons.append(current_poly)
            current_poly = []
            curr_x, curr_y = start_x, start_y
        else:
            i += 1
            
    if current_poly:
        polygons.append(current_poly)
    return polygons

def generate_logos():
    os.makedirs('/Users/mohammedminhaajali/Desktop/payPal/assets', exist_ok=True)
    
    # 1. GITHUB LOGO (Octocat Silhouette in Circle + Wordmark)
    gh_svg = "M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
    
    # Render at 4x for super sampling / antialiasing
    scale_factor = 4
    W, H = 512 * scale_factor, 140 * scale_factor
    img_gh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw_gh = ImageDraw.Draw(img_gh)
    
    # Draw octocat mark
    gh_polys = parse_svg_path_to_polygons(gh_svg, scale=5.0 * scale_factor, offset_x=20 * scale_factor, offset_y=10 * scale_factor)
    for poly in gh_polys:
        draw_gh.polygon(poly, fill=(255, 255, 255, 255))
        
    font_gh = get_font(56 * scale_factor, bold=True)
    draw_gh.text((150 * scale_factor, 36 * scale_factor), "GitHub", font=font_gh, fill=(255, 255, 255, 255))
    
    img_gh = img_gh.resize((512, 140), Image.Resampling.LANCZOS)
    img_gh.save('/Users/mohammedminhaajali/Desktop/payPal/assets/github_logo.png')
    
    # 2. PAYPAL LOGO (Dual-P Monogram + Wordmark)
    W_p, H_p = 512 * scale_factor, 140 * scale_factor
    img_pp = Image.new('RGBA', (W_p, H_p), (0, 0, 0, 0))
    draw_pp = ImageDraw.Draw(img_pp)
    
    # Draw PayPal dual-P monogram using clean geometric shapes
    # Back P (Dark Blue: #003087)
    p_dark = (0, 48, 135, 255)
    # Front P (Bright Blue: #0079C1)
    p_light = (0, 121, 193, 255)
    # Blend P (Navy: #001C64)
    p_blend = (0, 28, 100, 255)
    
    # Draw back P stem and loop
    bx, by = 30 * scale_factor, 20 * scale_factor
    pw = 65 * scale_factor
    ph = 100 * scale_factor
    
    # Back P
    draw_pp.rounded_rectangle([bx, by, bx + 24 * scale_factor, by + ph], radius=8 * scale_factor, fill=p_dark)
    draw_pp.rounded_rectangle([bx, by, bx + pw, by + 58 * scale_factor], radius=24 * scale_factor, fill=p_dark)
    draw_pp.rounded_rectangle([bx + 18 * scale_factor, by + 16 * scale_factor, bx + pw - 14 * scale_factor, by + 42 * scale_factor], radius=12 * scale_factor, fill=(0, 0, 0, 0))
    
    # Front P (shifted right + down)
    fx, fy = bx + 16 * scale_factor, by + 16 * scale_factor
    draw_pp.rounded_rectangle([fx, fy, fx + 24 * scale_factor, fy + ph], radius=8 * scale_factor, fill=p_light)
    draw_pp.rounded_rectangle([fx, fy, fx + pw, fy + 58 * scale_factor], radius=24 * scale_factor, fill=p_light)
    draw_pp.rounded_rectangle([fx + 18 * scale_factor, fy + 16 * scale_factor, fx + pw - 14 * scale_factor, fy + 42 * scale_factor], radius=12 * scale_factor, fill=(0, 0, 0, 0))
    
    # Wordmark: "Pay" (Dark Blue) + "Pal" (Cyan/Blue)
    font_pp = get_font(58 * scale_factor, bold=True)
    draw_pp.text((140 * scale_factor, 36 * scale_factor), "Pay", font=font_pp, fill=(0, 48, 135, 255))
    # Measure width of Pay to place Pal
    draw_pp.text((260 * scale_factor, 36 * scale_factor), "Pal", font=font_pp, fill=(0, 156, 222, 255))
    
    img_pp = img_pp.resize((512, 140), Image.Resampling.LANCZOS)
    img_pp.save('/Users/mohammedminhaajali/Desktop/payPal/assets/paypal_logo.png')
    
    # 3. GITHUB x PAYPAL HERO BANNER (For Slide 1)
    W_b, H_b = 900 * scale_factor, 160 * scale_factor
    img_b = Image.new('RGBA', (W_b, H_b), (0, 0, 0, 0))
    draw_b = ImageDraw.Draw(img_b)
    
    # Paste GitHub Logo on left
    gh_icon_polys = parse_svg_path_to_polygons(gh_svg, scale=5.5 * scale_factor, offset_x=20 * scale_factor, offset_y=18 * scale_factor)
    for poly in gh_icon_polys:
        draw_b.polygon(poly, fill=(255, 255, 255, 255))
    draw_b.text((160 * scale_factor, 45 * scale_factor), "GitHub", font=get_font(60 * scale_factor, bold=True), fill=(255, 255, 255, 255))
    
    # '×' in center
    draw_b.text((435 * scale_factor, 40 * scale_factor), "×", font=get_font(64 * scale_factor, bold=False), fill=(56, 189, 248, 255))
    
    # PayPal on right
    pp_ox = 510 * scale_factor
    # Back P
    draw_b.rounded_rectangle([pp_ox, by + 10 * scale_factor, pp_ox + 26 * scale_factor, by + 10 * scale_factor + ph], radius=8 * scale_factor, fill=(0, 48, 135, 255))
    draw_b.rounded_rectangle([pp_ox, by + 10 * scale_factor, pp_ox + pw, by + 10 * scale_factor + 58 * scale_factor], radius=24 * scale_factor, fill=(0, 48, 135, 255))
    draw_b.rounded_rectangle([pp_ox + 18 * scale_factor, by + 26 * scale_factor, pp_ox + pw - 14 * scale_factor, by + 52 * scale_factor], radius=12 * scale_factor, fill=(0, 0, 0, 0))
    # Front P
    pfx, pfy = pp_ox + 18 * scale_factor, by + 26 * scale_factor
    draw_b.rounded_rectangle([pfx, pfy, pfx + 26 * scale_factor, pfy + ph], radius=8 * scale_factor, fill=(0, 156, 222, 255))
    draw_b.rounded_rectangle([pfx, pfy, pfx + pw, pfy + 58 * scale_factor], radius=24 * scale_factor, fill=(0, 156, 222, 255))
    draw_b.rounded_rectangle([pfx + 18 * scale_factor, pfy + 16 * scale_factor, pfx + pw - 14 * scale_factor, pfy + 42 * scale_factor], radius=12 * scale_factor, fill=(0, 0, 0, 0))
    
    draw_b.text((pp_ox + 120 * scale_factor, 45 * scale_factor), "PayPal", font=get_font(60 * scale_factor, bold=True), fill=(0, 156, 222, 255))
    
    img_b = img_b.resize((900, 160), Image.Resampling.LANCZOS)
    img_b.save('/Users/mohammedminhaajali/Desktop/payPal/assets/github_x_paypal.png')
    
    print("Successfully generated all logo assets in /Users/mohammedminhaajali/Desktop/payPal/assets/")

if __name__ == "__main__":
    generate_logos()
