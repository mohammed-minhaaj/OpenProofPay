import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

def build_deck():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    # Color Palette matching ppt.png reference and midnight navy theme
    BG_COLOR = RGBColor(11, 17, 32)       # #0B1120 Midnight Navy
    CARD_BG = RGBColor(15, 23, 42)        # #0F172A Slate 900
    CARD_BORDER = RGBColor(30, 41, 59)    # #1E293B Slate 800
    CARD_BG_ALT = RGBColor(19, 31, 56)    # #131F38 Deep Navy
    
    PRIMARY_BLUE = RGBColor(59, 130, 246) # #3B82F6 Electric Blue
    CYAN_ACCENT = RGBColor(56, 189, 248)  # #38BDF8 Sky Cyan
    TEXT_WHITE = RGBColor(255, 255, 255)  # #FFFFFF
    TEXT_SLATE = RGBColor(148, 163, 184)  # #94A3B8 Slate 400
    TEXT_MUTED = RGBColor(100, 116, 139)  # #64748B Slate 500
    DIVIDER_COLOR = RGBColor(30, 41, 59)  # #1E293B
    
    PILL_BG = RGBColor(23, 37, 84)        # Deep Blue Pill
    PILL_BORDER = RGBColor(37, 99, 235)   # Border Blue
    
    GREEN_ACCENT = RGBColor(52, 211, 153) # #34D399 Emerald
    AMBER_ACCENT = RGBColor(251, 191, 36) # #FBBF24 Amber
    RED_ACCENT = RGBColor(248, 113, 113)  # #F87171 Red

    blank_layout = prs.slide_layouts[6]
    
    hero_logos_path = "/Users/mohammedminhaajali/Desktop/payPal/assets/hero_github_x_paypal.png"
    header_logos_path = "/Users/mohammedminhaajali/Desktop/payPal/assets/header_logos_pair.png"

    def set_bg(slide):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), prs.slide_width, prs.slide_height)
        bg.fill.solid()
        bg.fill.fore_color.rgb = BG_COLOR
        bg.line.fill.background()
        return bg

    def add_header(slide, pill_text, show_pair_logos=True):
        if show_pair_logos and os.path.exists(header_logos_path):
            slide.shapes.add_picture(header_logos_path, Inches(0.8), Inches(0.42), Inches(3.0), Inches(0.44))

        # Right pill badge
        pill = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(10.7), Inches(0.42), Inches(1.85), Inches(0.42))
        pill.fill.solid()
        pill.fill.fore_color.rgb = PILL_BG
        pill.line.color.rgb = PILL_BORDER
        pill.line.width = Pt(1)
        tf_pill = pill.text_frame
        tf_pill.word_wrap = False
        tf_pill.margin_left = tf_pill.margin_right = tf_pill.margin_top = tf_pill.margin_bottom = 0
        p_pill = tf_pill.paragraphs[0]
        p_pill.text = pill_text
        p_pill.alignment = PP_ALIGN.CENTER
        p_pill.font.name = "Inter"
        p_pill.font.size = Pt(10)
        p_pill.font.bold = True
        p_pill.font.color.rgb = CYAN_ACCENT

    def add_footer(slide, slide_num):
        # Center slide circle indicator
        ind = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(6.45), Inches(6.82), Inches(0.42), Inches(0.42))
        ind.fill.solid()
        ind.fill.fore_color.rgb = RGBColor(19, 28, 48)
        ind.line.color.rgb = CARD_BORDER
        ind.line.width = Pt(1)
        tf = ind.text_frame
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        p = tf.paragraphs[0]
        p.text = str(slide_num)
        p.alignment = PP_ALIGN.CENTER
        p.font.name = "Inter"
        p.font.size = Pt(11)
        p.font.bold = True
        p.font.color.rgb = TEXT_SLATE

    # =========================================================================
    # SLIDE 1: Title Slide
    # =========================================================================
    slide1 = prs.slides.add_slide(blank_layout)
    set_bg(slide1)
    add_header(slide1, "HACKATHON PROJECT", show_pair_logos=False)

    # Hero GitHub x PayPal prominent logo banner
    if os.path.exists(hero_logos_path):
        slide1.shapes.add_picture(hero_logos_path, Inches(0.8), Inches(1.2), Inches(5.8), Inches(0.85))

    # Main Title Box
    title_box = slide1.shapes.add_textbox(Inches(0.8), Inches(2.25), Inches(11.7), Inches(2.3))
    tf1 = title_box.text_frame
    tf1.word_wrap = True
    tf1.margin_left = tf1.margin_right = tf1.margin_top = tf1.margin_bottom = 0

    p_title = tf1.paragraphs[0]
    p_title.text = "OpenProofPay"
    p_title.font.name = "Inter"
    p_title.font.size = Pt(54)
    p_title.font.bold = True
    p_title.font.color.rgb = TEXT_WHITE
    p_title.space_after = Pt(10)

    p_subtitle = tf1.add_paragraph()
    p_subtitle.text = "Proof of Work Before Payment."
    p_subtitle.font.name = "Inter"
    p_subtitle.font.size = Pt(26)
    p_subtitle.font.bold = True
    p_subtitle.font.color.rgb = PRIMARY_BLUE
    p_subtitle.space_after = Pt(12)

    p_desc = tf1.add_paragraph()
    p_desc.text = "Bringing trust to paid open-source contributions with Gemini AI and PayPal."
    p_desc.font.name = "Inter"
    p_desc.font.size = Pt(18)
    p_desc.font.color.rgb = TEXT_SLATE

    # Divider line
    line = slide1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(4.8), Inches(11.73), Inches(0.015))
    line.fill.solid()
    line.fill.fore_color.rgb = DIVIDER_COLOR
    line.line.fill.background()

    # Presenter Information
    pres_box = slide1.shapes.add_textbox(Inches(0.8), Inches(5.15), Inches(8.0), Inches(1.5))
    tf_pres = pres_box.text_frame
    tf_pres.word_wrap = True
    tf_pres.margin_left = tf_pres.margin_right = tf_pres.margin_top = tf_pres.margin_bottom = 0

    p_lbl = tf_pres.paragraphs[0]
    p_lbl.text = "PRESENTED BY"
    p_lbl.font.name = "Inter"
    p_lbl.font.size = Pt(10)
    p_lbl.font.bold = True
    p_lbl.font.color.rgb = TEXT_MUTED
    p_lbl.space_after = Pt(4)

    p_name = tf_pres.add_paragraph()
    p_name.text = "Mohammed Minhaaj Ali"
    p_name.font.name = "Inter"
    p_name.font.size = Pt(22)
    p_name.font.bold = True
    p_name.font.color.rgb = TEXT_WHITE
    p_name.space_after = Pt(4)

    p_track = tf_pres.add_paragraph()
    p_track.text = "AI × GITHUB × PAYPAL"
    p_track.font.name = "Inter"
    p_track.font.size = Pt(11)
    p_track.font.bold = True
    p_track.font.color.rgb = TEXT_MUTED

    add_footer(slide1, 1)

    # =========================================================================
    # SLIDE 2: The Problem (Simple English, Very Less Content, 2 Large Cards)
    # =========================================================================
    slide2 = prs.slides.add_slide(blank_layout)
    set_bg(slide2)
    add_header(slide2, "THE PROBLEM")

    # Title Box
    h2 = slide2.shapes.add_textbox(Inches(0.8), Inches(1.15), Inches(11.7), Inches(0.95))
    tf2 = h2.text_frame
    tf2.word_wrap = True
    tf2.margin_left = tf2.margin_right = tf2.margin_top = tf2.margin_bottom = 0
    p2_t = tf2.paragraphs[0]
    p2_t.text = "Why Paid Open Source Is Broken"
    p2_t.font.name = "Inter"
    p2_t.font.size = Pt(32)
    p2_t.font.bold = True
    p2_t.font.color.rgb = TEXT_WHITE
    p2_t.space_after = Pt(4)
    p2_sub = tf2.add_paragraph()
    p2_sub.text = "Developers fear working for free. Employers fear paying for broken code."
    p2_sub.font.name = "Inter"
    p2_sub.font.size = Pt(15)
    p2_sub.font.color.rgb = TEXT_SLATE

    # 2 Large Spacious Cards Side by Side
    card_w = Inches(5.65)
    card_h = Inches(3.7)
    card_y = Inches(2.28)

    # Left Card: Developer Pain
    c1 = slide2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), card_y, card_w, card_h)
    c1.fill.solid()
    c1.fill.fore_color.rgb = CARD_BG
    c1.line.color.rgb = CARD_BORDER
    c1.line.width = Pt(1)

    tb_c1 = slide2.shapes.add_textbox(Inches(1.15), card_y + Inches(0.35), card_w - Inches(0.7), card_h - Inches(0.7))
    tfc1 = tb_c1.text_frame
    tfc1.word_wrap = True
    tfc1.margin_left = tfc1.margin_right = tfc1.margin_top = tfc1.margin_bottom = 0

    p_t1 = tfc1.paragraphs[0]
    p_t1.text = "DEVELOPER DILEMMA"
    p_t1.font.name = "Inter"
    p_t1.font.size = Pt(11)
    p_t1.font.bold = True
    p_t1.font.color.rgb = RED_ACCENT
    p_t1.space_after = Pt(8)

    p_q1 = tfc1.add_paragraph()
    p_q1.text = "\"Will I actually get paid?\""
    p_q1.font.name = "Inter"
    p_q1.font.size = Pt(22)
    p_q1.font.bold = True
    p_q1.font.color.rgb = TEXT_WHITE
    p_q1.space_after = Pt(16)

    bullets1 = [
        "Spends days writing code and tests for a GitHub issue",
        "Maintainers often delay reviews, ghost, or close PRs",
        "Zero escrow guarantee that money is actually waiting"
    ]
    for b in bullets1:
        pb = tfc1.add_paragraph()
        pb.text = "• " + b
        pb.font.name = "Inter"
        pb.font.size = Pt(13)
        pb.font.color.rgb = RGBColor(203, 213, 225)
        pb.space_after = Pt(10)

    # Right Card: Employer Pain
    c2 = slide2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.88), card_y, card_w, card_h)
    c2.fill.solid()
    c2.fill.fore_color.rgb = CARD_BG
    c2.line.color.rgb = CARD_BORDER
    c2.line.width = Pt(1)

    tb_c2 = slide2.shapes.add_textbox(Inches(7.23), card_y + Inches(0.35), card_w - Inches(0.7), card_h - Inches(0.7))
    tfc2 = tb_c2.text_frame
    tfc2.word_wrap = True
    tfc2.margin_left = tfc2.margin_right = tfc2.margin_top = tfc2.margin_bottom = 0

    p_t2 = tfc2.paragraphs[0]
    p_t2.text = "EMPLOYER DILEMMA"
    p_t2.font.name = "Inter"
    p_t2.font.size = Pt(11)
    p_t2.font.bold = True
    p_t2.font.color.rgb = AMBER_ACCENT
    p_t2.space_after = Pt(8)

    p_q2 = tfc2.add_paragraph()
    p_q2.text = "\"Does the code actually work?\""
    p_q2.font.name = "Inter"
    p_q2.font.size = Pt(22)
    p_q2.font.bold = True
    p_q2.font.color.rgb = TEXT_WHITE
    p_q2.space_after = Pt(16)

    bullets2 = [
        "Flooded with broken AI-generated PRs that fail basic builds",
        "Hidden bugs, missing tests, and security risks slip in",
        "No time to manually test and review every pull request"
    ]
    for b in bullets2:
        pb = tfc2.add_paragraph()
        pb.text = "• " + b
        pb.font.name = "Inter"
        pb.font.size = Pt(13)
        pb.font.color.rgb = RGBColor(203, 213, 225)
        pb.space_after = Pt(10)

    # Bottom summary callout
    bot2 = slide2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(6.18), Inches(11.73), Inches(0.48))
    bot2.fill.solid()
    bot2.fill.fore_color.rgb = CARD_BG_ALT
    bot2.line.color.rgb = CARD_BORDER
    bot2.line.width = Pt(1)
    tf_b2 = bot2.text_frame
    tf_b2.margin_left = tf_b2.margin_right = tf_b2.margin_top = tf_b2.margin_bottom = 0
    pb2 = tf_b2.paragraphs[0]
    pb2.text = "The Result: Employers hesitate to post bounties, and top developers refuse to contribute."
    pb2.alignment = PP_ALIGN.CENTER
    pb2.font.name = "Inter"
    pb2.font.size = Pt(12)
    pb2.font.bold = True
    pb2.font.color.rgb = CYAN_ACCENT

    add_footer(slide2, 2)

    # =========================================================================
    # SLIDE 3: The Solution (3 Clear Pillars, Human-in-Control)
    # =========================================================================
    slide3 = prs.slides.add_slide(blank_layout)
    set_bg(slide3)
    add_header(slide3, "THE SOLUTION")

    # Title Box
    h3 = slide3.shapes.add_textbox(Inches(0.8), Inches(1.15), Inches(11.7), Inches(0.95))
    tf3 = h3.text_frame
    tf3.word_wrap = True
    tf3.margin_left = tf3.margin_right = tf3.margin_top = tf3.margin_bottom = 0
    p3_t = tf3.paragraphs[0]
    p3_t.text = "Trust Built on Proof, Not Promises"
    p3_t.font.name = "Inter"
    p3_t.font.size = Pt(32)
    p3_t.font.bold = True
    p3_t.font.color.rgb = TEXT_WHITE
    p3_t.space_after = Pt(4)
    p3_sub = tf3.add_paragraph()
    p3_sub.text = "OpenProofPay tests the code and verifies the fix before PayPal releases payment."
    p3_sub.font.name = "Inter"
    p3_sub.font.size = Pt(15)
    p3_sub.font.color.rgb = TEXT_SLATE

    # 3 Clean Solution Pillars
    s_col_w = Inches(3.72)
    s_col_h = Inches(3.7)
    s_col_y = Inches(2.28)
    s_gap = Inches(0.28)

    sol_cards = [
        {
            "tag": "1. PAYPAL ESCROW",
            "tag_color": PRIMARY_BLUE,
            "title": "Safe Payment Hold",
            "points": [
                "Employer locks bounty funds upfront in PayPal",
                "Developer knows the reward is guaranteed",
                "Money is never charged until code is approved"
            ]
        },
        {
            "tag": "2. AI & DOCKER VERIFICATION",
            "tag_color": CYAN_ACCENT,
            "title": "Automated Proof",
            "points": [
                "Docker sandbox runs test suites automatically",
                "Gemini AI audits pull request diff vs issue specs",
                "Detects broken code, bad logic, and security flaws"
            ]
        },
        {
            "tag": "3. 1-CLICK PAYOUT",
            "tag_color": GREEN_ACCENT,
            "title": "Instant Release",
            "points": [
                "Employer reviews a clear 1-page audit summary",
                "Employer clicks \"Approve & Pay\"",
                "PayPal instantly pays the developer's wallet"
            ]
        }
    ]

    for i, sc in enumerate(sol_cards):
        left_pos = Inches(0.8) + i * (s_col_w + s_gap)
        card = slide3.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left_pos, s_col_y, s_col_w, s_col_h)
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = CARD_BORDER
        card.line.width = Pt(1)

        tb = slide3.shapes.add_textbox(left_pos + Inches(0.3), s_col_y + Inches(0.35), s_col_w - Inches(0.6), s_col_h - Inches(0.7))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0

        p_tag = tf.paragraphs[0]
        p_tag.text = sc["tag"]
        p_tag.font.name = "Inter"
        p_tag.font.size = Pt(10.5)
        p_tag.font.bold = True
        p_tag.font.color.rgb = sc["tag_color"]
        p_tag.space_after = Pt(8)

        p_title = tf.add_paragraph()
        p_title.text = sc["title"]
        p_title.font.name = "Inter"
        p_title.font.size = Pt(20)
        p_title.font.bold = True
        p_title.font.color.rgb = TEXT_WHITE
        p_title.space_after = Pt(18)

        for pt in sc["points"]:
            p_pt = tf.add_paragraph()
            p_pt.text = "✓ " + pt
            p_pt.font.name = "Inter"
            p_pt.font.size = Pt(12.5)
            p_pt.font.color.rgb = RGBColor(203, 213, 225)
            p_pt.space_after = Pt(12)

    # Bottom Callout
    bot3 = slide3.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(6.18), Inches(11.73), Inches(0.48))
    bot3.fill.solid()
    bot3.fill.fore_color.rgb = CARD_BG_ALT
    bot3.line.color.rgb = PRIMARY_BLUE
    bot3.line.width = Pt(1)
    tf_b3 = bot3.text_frame
    tf_b3.margin_left = tf_b3.margin_right = tf_b3.margin_top = tf_b3.margin_bottom = 0
    pb3 = tf_b3.paragraphs[0]
    pb3.text = "Human in Control: AI gives evidence and scores, but the employer always gives the final release approval."
    pb3.alignment = PP_ALIGN.CENTER
    pb3.font.name = "Inter"
    pb3.font.size = Pt(12)
    pb3.font.bold = True
    pb3.font.color.rgb = TEXT_WHITE

    add_footer(slide3, 3)

    # =========================================================================
    # SLIDE 4: How It Works (4 Spacious Steps — Completely Re-architected & Fixed!)
    # =========================================================================
    slide4 = prs.slides.add_slide(blank_layout)
    set_bg(slide4)
    add_header(slide4, "HOW IT WORKS")

    # Title Box
    h4 = slide4.shapes.add_textbox(Inches(0.8), Inches(1.15), Inches(11.7), Inches(0.95))
    tf4 = h4.text_frame
    tf4.word_wrap = True
    tf4.margin_left = tf4.margin_right = tf4.margin_top = tf4.margin_bottom = 0
    p4_t = tf4.paragraphs[0]
    p4_t.text = "How It Works"
    p4_t.font.name = "Inter"
    p4_t.font.size = Pt(32)
    p4_t.font.bold = True
    p4_t.font.color.rgb = TEXT_WHITE
    p4_t.space_after = Pt(4)
    p4_sub = tf4.add_paragraph()
    p4_sub.text = "From GitHub issue to PayPal payout in 4 simple steps."
    p4_sub.font.name = "Inter"
    p4_sub.font.size = Pt(15)
    p4_sub.font.color.rgb = TEXT_SLATE

    # 4 Wide, Clean Steps (Width 2.76 inches each, no overlapping, generous room!)
    step_w = Inches(2.76)
    step_h = Inches(3.7)
    step_y = Inches(2.28)
    step_gap = Inches(0.23)

    four_steps = [
        {
            "num": "1",
            "tag": "POST & LOCK",
            "title": "Create Bounty",
            "actor": "Employer & PayPal",
            "desc": "Employer links a GitHub issue and sets a reward. PayPal authorizes and holds the funds in escrow.",
            "status": "🔒 Escrow Locked",
            "status_color": PRIMARY_BLUE
        },
        {
            "num": "2",
            "tag": "CODE & DELIVER",
            "title": "Submit PR",
            "actor": "Developer",
            "desc": "Developer claims the bounty, solves the issue, and submits their GitHub pull request.",
            "status": "💻 PR Submitted",
            "status_color": CYAN_ACCENT
        },
        {
            "num": "3",
            "tag": "TEST & AUDIT",
            "title": "Auto-Verify",
            "actor": "Gemini AI & Docker",
            "desc": "Docker sandbox runs unit tests. Gemini AI checks if the code fixes the issue and verifies quality.",
            "status": "✅ Tests & AI Passed",
            "status_color": RGBColor(168, 85, 247) # Purple
        },
        {
            "num": "4",
            "tag": "RELEASE & PAY",
            "title": "Instant Payout",
            "actor": "Employer & PayPal",
            "desc": "Employer reviews the 1-page report and clicks Approve. PayPal pays the developer instantly.",
            "status": "💰 Paid Out!",
            "status_color": GREEN_ACCENT
        }
    ]

    for i, st in enumerate(four_steps):
        left_pos = Inches(0.8) + i * (step_w + step_gap)

        # Step card container
        card = slide4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left_pos, step_y, step_w, step_h)
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = CARD_BORDER
        card.line.width = Pt(1)

        # Number circle badge
        num_badge = slide4.shapes.add_shape(MSO_SHAPE.OVAL, left_pos + Inches(0.25), step_y + Inches(0.3), Inches(0.48), Inches(0.48))
        num_badge.fill.solid()
        num_badge.fill.fore_color.rgb = st["status_color"]
        num_badge.line.fill.background()
        tf_n = num_badge.text_frame
        tf_n.margin_left = tf_n.margin_right = tf_n.margin_top = tf_n.margin_bottom = 0
        pn = tf_n.paragraphs[0]
        pn.text = st["num"]
        pn.alignment = PP_ALIGN.CENTER
        pn.font.name = "Inter"
        pn.font.size = Pt(14)
        pn.font.bold = True
        pn.font.color.rgb = RGBColor(11, 17, 32)

        # Card text content
        tb = slide4.shapes.add_textbox(left_pos + Inches(0.25), step_y + Inches(0.95), step_w - Inches(0.5), step_h - Inches(1.1))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0

        # Step tag
        ptag = tf.paragraphs[0]
        ptag.text = st["tag"]
        ptag.font.name = "Inter"
        ptag.font.size = Pt(9.5)
        ptag.font.bold = True
        ptag.font.color.rgb = TEXT_MUTED
        ptag.space_after = Pt(4)

        # Step Title
        pt = tf.add_paragraph()
        pt.text = st["title"]
        pt.font.name = "Inter"
        pt.font.size = Pt(18)
        pt.font.bold = True
        pt.font.color.rgb = TEXT_WHITE
        pt.space_after = Pt(2)

        # Step Actor
        pa = tf.add_paragraph()
        pa.text = st["actor"]
        pa.font.name = "Inter"
        pa.font.size = Pt(11)
        pa.font.bold = True
        pa.font.color.rgb = CYAN_ACCENT
        pa.space_after = Pt(12)

        # Step Description (Simple, concise English!)
        pd = tf.add_paragraph()
        pd.text = st["desc"]
        pd.font.name = "Inter"
        pd.font.size = Pt(12)
        pd.font.color.rgb = RGBColor(203, 213, 225)
        pd.space_after = Pt(16)

        # Status Pill at bottom of card
        ps = tf.add_paragraph()
        ps.text = st["status"]
        ps.font.name = "Inter"
        ps.font.size = Pt(11)
        ps.font.bold = True
        ps.font.color.rgb = st["status_color"]

    # Bottom summary callout
    bot4 = slide4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(6.18), Inches(11.73), Inches(0.48))
    bot4.fill.solid()
    bot4.fill.fore_color.rgb = CARD_BG_ALT
    bot4.line.color.rgb = CARD_BORDER
    bot4.line.width = Pt(1)
    tf_b4 = bot4.text_frame
    tf_b4.margin_left = tf_b4.margin_right = tf_b4.margin_top = tf_b4.margin_bottom = 0
    pb4 = tf_b4.paragraphs[0]
    pb4.text = "Zero risk for employers. Guaranteed payout for developers. Fully verified by AI."
    pb4.alignment = PP_ALIGN.CENTER
    pb4.font.name = "Inter"
    pb4.font.size = Pt(12)
    pb4.font.bold = True
    pb4.font.color.rgb = GREEN_ACCENT

    add_footer(slide4, 4)

    # Save Presentation
    out_file = "/Users/mohammedminhaajali/Desktop/payPal/OpenProofPay_Pitch_Deck.pptx"
    prs.save(out_file)
    print("Clean PowerPoint deck built successfully at:", out_file)

if __name__ == "__main__":
    build_deck()
