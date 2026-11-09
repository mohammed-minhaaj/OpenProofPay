import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

def create_presentation():
    prs = Presentation()
    # 16:9 Widescreen
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    # Color Palette matching ppt.png reference and midnight navy theme
    BG_COLOR = RGBColor(11, 17, 32)       # #0B1120 Midnight Navy
    CARD_BG = RGBColor(15, 23, 42)        # #0F172A Slate 900
    CARD_BORDER = RGBColor(30, 41, 59)    # #1E293B Slate 800
    CARD_BG_ALT = RGBColor(19, 31, 56)    # #131F38 Deep Navy
    
    PRIMARY_BLUE = RGBColor(59, 130, 246) # #3B82F6 Electric / Vibrant Blue
    CYAN_ACCENT = RGBColor(56, 189, 248)  # #38BDF8 Sky Cyan
    TEXT_WHITE = RGBColor(255, 255, 255)  # #FFFFFF
    TEXT_SLATE = RGBColor(148, 163, 184)  # #94A3B8 Slate 400
    TEXT_MUTED = RGBColor(100, 116, 139)  # #64748B Slate 500
    DIVIDER_COLOR = RGBColor(30, 41, 59)  # #1E293B
    
    PILL_BG = RGBColor(23, 37, 84)        # Deep Blue Pill
    PILL_BORDER = RGBColor(37, 99, 235)   # Border Blue
    
    GREEN_ACCENT = RGBColor(52, 211, 153) # #34D399 Emerald
    AMBER_ACCENT = RGBColor(251, 191, 36) # #FBBF24 Amber
    PURPLE_ACCENT = RGBColor(168, 85, 247)# #A855F7 Purple

    blank_slide_layout = prs.slide_layouts[6]

    def set_slide_background(slide):
        # Draw full bleed background rectangle
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), prs.slide_width, prs.slide_height)
        bg.fill.solid()
        bg.fill.fore_color.rgb = BG_COLOR
        bg.line.fill.background()
        return bg

    def add_header(slide, left_text, pill_text):
        # Left badge/text
        tb_left = slide.shapes.add_textbox(Inches(0.8), Inches(0.45), Inches(5.0), Inches(0.5))
        tf_left = tb_left.text_frame
        tf_left.word_wrap = True
        tf_left.margin_left = tf_left.margin_right = tf_left.margin_top = tf_left.margin_bottom = 0
        p_left = tf_left.paragraphs[0]
        p_left.text = left_text
        p_left.font.name = "Inter"
        p_left.font.size = Pt(11)
        p_left.font.bold = True
        p_left.font.color.rgb = TEXT_SLATE

        # Right pill badge
        pill = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(10.6), Inches(0.42), Inches(1.95), Inches(0.42))
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

    def add_slide_indicator(slide, number_str):
        ind = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(6.45), Inches(6.8), Inches(0.44), Inches(0.44))
        ind.fill.solid()
        ind.fill.fore_color.rgb = RGBColor(19, 28, 48)
        ind.line.color.rgb = CARD_BORDER
        ind.line.width = Pt(1)
        tf = ind.text_frame
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        p = tf.paragraphs[0]
        p.text = number_str
        p.alignment = PP_ALIGN.CENTER
        p.font.name = "Inter"
        p.font.size = Pt(11)
        p.font.bold = True
        p.font.color.rgb = TEXT_SLATE

    # =========================================================================
    # SLIDE 1: Title Slide (Replicating ppt.png reference)
    # =========================================================================
    slide1 = prs.slides.add_slide(blank_slide_layout)
    set_slide_background(slide1)
    add_header(slide1, "⯎ OPEN SOURCE × AI", "HACKATHON PROJECT")

    # Main Title Box
    title_box = slide1.shapes.add_textbox(Inches(0.8), Inches(1.8), Inches(11.7), Inches(2.8))
    tf1 = title_box.text_frame
    tf1.word_wrap = True
    tf1.margin_left = tf1.margin_right = tf1.margin_top = tf1.margin_bottom = 0

    p_title = tf1.paragraphs[0]
    p_title.text = "OpenProofPay"
    p_title.font.name = "Inter"
    p_title.font.size = Pt(56)
    p_title.font.bold = True
    p_title.font.color.rgb = TEXT_WHITE
    p_title.space_after = Pt(14)

    p_subtitle = tf1.add_paragraph()
    p_subtitle.text = "Proof of Work Before Payment."
    p_subtitle.font.name = "Inter"
    p_subtitle.font.size = Pt(28)
    p_subtitle.font.bold = True
    p_subtitle.font.color.rgb = PRIMARY_BLUE
    p_subtitle.space_after = Pt(16)

    p_desc = tf1.add_paragraph()
    p_desc.text = "Building trust in paid open-source contributions through AI-powered GitHub verification and PayPal."
    p_desc.font.name = "Inter"
    p_desc.font.size = Pt(17)
    p_desc.font.color.rgb = TEXT_SLATE

    # Divider line
    line = slide1.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(4.85), Inches(11.73), Inches(0.015))
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
    p_lbl.space_after = Pt(6)

    p_name = tf_pres.add_paragraph()
    p_name.text = "Mohammed Minhaaj Ali"
    p_name.font.name = "Inter"
    p_name.font.size = Pt(22)
    p_name.font.bold = True
    p_name.font.color.rgb = TEXT_WHITE
    p_name.space_after = Pt(6)

    p_track = tf_pres.add_paragraph()
    p_track.text = "AI × GITHUB × PAYPAL"
    p_track.font.name = "Inter"
    p_track.font.size = Pt(11)
    p_track.font.bold = True
    p_track.font.color.rgb = TEXT_MUTED

    add_slide_indicator(slide1, "1")

    # =========================================================================
    # SLIDE 2: Problem Statement
    # =========================================================================
    slide2 = prs.slides.add_slide(blank_slide_layout)
    set_slide_background(slide2)
    add_header(slide2, "⯎ THE OPEN SOURCE DILEMMA", "PROBLEM STATEMENT")

    # Slide Title
    s2_header = slide2.shapes.add_textbox(Inches(0.8), Inches(1.05), Inches(11.7), Inches(1.1))
    tf2_h = s2_header.text_frame
    tf2_h.word_wrap = True
    tf2_h.margin_left = tf2_h.margin_right = tf2_h.margin_top = tf2_h.margin_bottom = 0

    p2_t = tf2_h.paragraphs[0]
    p2_t.text = "The Trust Gap in Paid Open Source"
    p2_t.font.name = "Inter"
    p2_t.font.size = Pt(32)
    p2_t.font.bold = True
    p2_t.font.color.rgb = TEXT_WHITE
    p2_t.space_after = Pt(6)

    p2_sub = tf2_h.add_paragraph()
    p2_sub.text = "Rewarding open-source contributors with bounties fails today due to asymmetric risk and broken escrow."
    p2_sub.font.name = "Inter"
    p2_sub.font.size = Pt(14)
    p2_sub.font.color.rgb = TEXT_SLATE

    # 3 Problem Cards
    card_width = Inches(3.72)
    card_height = Inches(3.8)
    card_top = Inches(2.25)
    gap = Inches(0.28)

    problems = [
        {
            "tag": "DEVELOPER RISK",
            "tag_color": RGBColor(248, 113, 113), # Red-400
            "title": "Unpaid Labor & Ghosting",
            "subtitle": "No guarantee of reward",
            "bullets": [
                "Developers spend hours writing code and tests without guaranteed escrow.",
                "Maintainers often ghost, delay reviews indefinitely, or reject PRs arbitrarily.",
                "Fear of uncompensated work discourages skilled engineers from contributing."
            ]
        },
        {
            "tag": "EMPLOYER RISK",
            "tag_color": AMBER_ACCENT,
            "title": "Broken Code & AI Spam",
            "subtitle": "No guarantee of quality",
            "bullets": [
                "Floods of shallow, hallucinated AI-generated PRs that fail basic builds.",
                "Hidden regression bugs, missing test suites, and security vulnerabilities.",
                "Employers lack the time to manually audit and run every submitted diff."
            ]
        },
        {
            "tag": "PLATFORM GAP",
            "tag_color": CYAN_ACCENT,
            "title": "Blind Escrow Platforms",
            "subtitle": "No code understanding",
            "bullets": [
                "Traditional freelance escrow platforms (Upwork, Fiverr) are blind to Git.",
                "Cannot inspect commit SHAs, run Docker test suites, or verify pull requests.",
                "Subjective disputes cause prolonged payment freezes and damaged trust."
            ]
        }
    ]

    for i, prob in enumerate(problems):
        left_pos = Inches(0.8) + i * (card_width + gap)
        card = slide2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left_pos, card_top, card_width, card_height)
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = CARD_BORDER
        card.line.width = Pt(1)

        tb = slide2.shapes.add_textbox(left_pos + Inches(0.25), card_top + Inches(0.25), card_width - Inches(0.5), card_height - Inches(0.5))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0

        # Tag
        p_tag = tf.paragraphs[0]
        p_tag.text = prob["tag"]
        p_tag.font.name = "Inter"
        p_tag.font.size = Pt(10)
        p_tag.font.bold = True
        p_tag.font.color.rgb = prob["tag_color"]
        p_tag.space_after = Pt(8)

        # Title
        p_ct = tf.add_paragraph()
        p_ct.text = prob["title"]
        p_ct.font.name = "Inter"
        p_ct.font.size = Pt(18)
        p_ct.font.bold = True
        p_ct.font.color.rgb = TEXT_WHITE
        p_ct.space_after = Pt(3)

        # Subtitle
        p_csub = tf.add_paragraph()
        p_csub.text = prob["subtitle"]
        p_csub.font.name = "Inter"
        p_csub.font.size = Pt(12)
        p_csub.font.color.rgb = TEXT_SLATE
        p_csub.space_after = Pt(14)

        # Bullets
        for b in prob["bullets"]:
            p_b = tf.add_paragraph()
            p_b.text = "• " + b
            p_b.font.name = "Inter"
            p_b.font.size = Pt(11)
            p_b.font.color.rgb = RGBColor(203, 213, 225) # Slate 300
            p_b.space_after = Pt(8)

    # Bottom Callout Bar
    callout = slide2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(6.2), Inches(11.73), Inches(0.48))
    callout.fill.solid()
    callout.fill.fore_color.rgb = CARD_BG_ALT
    callout.line.color.rgb = CARD_BORDER
    callout.line.width = Pt(1)
    tf_c = callout.text_frame
    tf_c.margin_left = tf_c.margin_right = tf_c.margin_top = tf_c.margin_bottom = 0
    p_call = tf_c.paragraphs[0]
    p_call.text = "The Core Issue: Money and code live in separate silos. There is no automated bridge between code delivery and payment release."
    p_call.alignment = PP_ALIGN.CENTER
    p_call.font.name = "Inter"
    p_call.font.size = Pt(11)
    p_call.font.bold = True
    p_call.font.color.rgb = CYAN_ACCENT

    add_slide_indicator(slide2, "2")

    # =========================================================================
    # SLIDE 3: Our Solution
    # =========================================================================
    slide3 = prs.slides.add_slide(blank_slide_layout)
    set_slide_background(slide3)
    add_header(slide3, "⯎ INTELLIGENT VERIFICATION PLATFORM", "OUR SOLUTION")

    # Slide Title
    s3_header = slide3.shapes.add_textbox(Inches(0.8), Inches(1.05), Inches(11.7), Inches(1.1))
    tf3_h = s3_header.text_frame
    tf3_h.word_wrap = True
    tf3_h.margin_left = tf3_h.margin_right = tf3_h.margin_top = tf3_h.margin_bottom = 0

    p3_t = tf3_h.paragraphs[0]
    p3_t.text = "OpenProofPay: Autonomous Verification Before Payment"
    p3_t.font.name = "Inter"
    p3_t.font.size = Pt(32)
    p3_t.font.bold = True
    p3_t.font.color.rgb = TEXT_WHITE
    p3_t.space_after = Pt(6)

    p3_sub = tf3_h.add_paragraph()
    p3_sub.text = "Connecting GitHub, Gemini AI, Docker Sandboxing, Human Approval, and PayPal into one trustless loop."
    p3_sub.font.name = "Inter"
    p3_sub.font.size = Pt(14)
    p3_sub.font.color.rgb = TEXT_SLATE

    # 4 Pillar Cards
    p_width = Inches(2.76)
    p_height = Inches(3.75)
    p_top = Inches(2.25)
    p_gap = Inches(0.23)

    pillars = [
        {
            "badge": "GITHUB NATIVE",
            "badge_color": TEXT_WHITE,
            "title": "GitHub Integration",
            "desc": "Seamless issue bounties directly linked to Git repositories.",
            "points": [
                "Issue-to-Bounty mapping",
                "Automated PR webhook tracking",
                "Commit SHA verification",
                "Zero context switching"
            ]
        },
        {
            "badge": "GEMINI 1.5 PRO",
            "badge_color": PURPLE_ACCENT,
            "title": "Gemini AI Audit",
            "desc": "Deep multimodal code analysis evaluating quality & security.",
            "points": [
                "Diff vs issue criteria analysis",
                "Anti-prompt injection defense",
                "Hallucination sanitization filter",
                "Deterministic confidence score"
            ]
        },
        {
            "badge": "DOCKER SANDBOX",
            "badge_color": CYAN_ACCENT,
            "title": "Automated Testing",
            "desc": "Isolated test execution providing objective proof of work.",
            "points": [
                "Ephemeral, zero-network container",
                "Automated test suite execution",
                "Strict timeout & exit code capture",
                "Tamper-proof execution logs"
            ]
        },
        {
            "badge": "PAYPAL V2",
            "badge_color": PRIMARY_BLUE,
            "title": "Two-Phase Escrow",
            "desc": "Guaranteed payment holding & instant developer payout.",
            "points": [
                "Upfront PayPal authorization hold",
                "Funds locked safely in escrow",
                "One-click employer capture",
                "Direct payout to dev PayPal wallet"
            ]
        }
    ]

    for i, pil in enumerate(pillars):
        left_pos = Inches(0.8) + i * (p_width + p_gap)
        card = slide3.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left_pos, p_top, p_width, p_height)
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = CARD_BORDER
        card.line.width = Pt(1)

        tb = slide3.shapes.add_textbox(left_pos + Inches(0.2), p_top + Inches(0.2), p_width - Inches(0.4), p_height - Inches(0.4))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0

        p_b = tf.paragraphs[0]
        p_b.text = pil["badge"]
        p_b.font.name = "Inter"
        p_b.font.size = Pt(9.5)
        p_b.font.bold = True
        p_b.font.color.rgb = pil["badge_color"]
        p_b.space_after = Pt(8)

        p_t = tf.add_paragraph()
        p_t.text = pil["title"]
        p_t.font.name = "Inter"
        p_t.font.size = Pt(17)
        p_t.font.bold = True
        p_t.font.color.rgb = TEXT_WHITE
        p_t.space_after = Pt(6)

        p_d = tf.add_paragraph()
        p_d.text = pil["desc"]
        p_d.font.name = "Inter"
        p_d.font.size = Pt(11)
        p_d.font.color.rgb = TEXT_SLATE
        p_d.space_after = Pt(12)

        for pt in pil["points"]:
            p_pt = tf.add_paragraph()
            p_pt.text = "✓ " + pt
            p_pt.font.name = "Inter"
            p_pt.font.size = Pt(10.5)
            p_pt.font.color.rgb = RGBColor(203, 213, 225)
            p_pt.space_after = Pt(5)

    # Bottom Human-in-the-Loop Governance Bar
    gov_bar = slide3.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(6.18), Inches(11.73), Inches(0.5))
    gov_bar.fill.solid()
    gov_bar.fill.fore_color.rgb = CARD_BG_ALT
    gov_bar.line.color.rgb = PRIMARY_BLUE
    gov_bar.line.width = Pt(1)
    tf_gov = gov_bar.text_frame
    tf_gov.margin_left = tf_gov.margin_right = tf_gov.margin_top = tf_gov.margin_bottom = 0
    p_gov = tf_gov.paragraphs[0]
    p_gov.text = "🛡️ Human-in-the-Loop Governance: AI & Docker produce objective evidence. Employers retain 100% final approval control before payment capture."
    p_gov.alignment = PP_ALIGN.CENTER
    p_gov.font.name = "Inter"
    p_gov.font.size = Pt(11)
    p_gov.font.bold = True
    p_gov.font.color.rgb = TEXT_WHITE

    add_slide_indicator(slide3, "3")

    # =========================================================================
    # SLIDE 4: How It Works — End-to-End Visual Workflow
    # =========================================================================
    slide4 = prs.slides.add_slide(blank_slide_layout)
    set_slide_background(slide4)
    add_header(slide4, "⯎ END-TO-END PIPELINE", "HOW IT WORKS")

    # Slide Title
    s4_header = slide4.shapes.add_textbox(Inches(0.8), Inches(1.05), Inches(11.7), Inches(1.1))
    tf4_h = s4_header.text_frame
    tf4_h.word_wrap = True
    tf4_h.margin_left = tf4_h.margin_right = tf4_h.margin_top = tf4_h.margin_bottom = 0

    p4_t = tf4_h.paragraphs[0]
    p4_t.text = "From Issue Bounty to Instant Payout"
    p4_t.font.name = "Inter"
    p4_t.font.size = Pt(32)
    p4_t.font.bold = True
    p4_t.font.color.rgb = TEXT_WHITE
    p4_t.space_after = Pt(6)

    p4_sub = tf4_h.add_paragraph()
    p4_sub.text = "The 7-step automated verification and payout lifecycle powering OpenProofPay."
    p4_sub.font.name = "Inter"
    p4_sub.font.size = Pt(14)
    p4_sub.font.color.rgb = TEXT_SLATE

    # 7 Workflow Steps arranged horizontally with clean cards
    steps = [
        {"num": "1", "title": "Create Bounty", "actor": "Employer", "desc": "Links GitHub issue & assigns monetary bounty"},
        {"num": "2", "title": "Authorize Hold", "actor": "PayPal", "desc": "Funds authorized & locked in PayPal escrow hold"},
        {"num": "3", "title": "Submit PR", "actor": "Developer", "desc": "Claims bounty, fixes issue & submits GitHub PR"},
        {"num": "4", "title": "Docker Tests", "actor": "Sandbox", "desc": "Isolated runner tests code build & passes test suite"},
        {"num": "5", "title": "Gemini AI Audit", "actor": "Gemini AI", "desc": "Audits diff against issue specs & scores quality"},
        {"num": "6", "title": "Employer Review", "actor": "Employer", "desc": "Inspects AI report, citations & clicks Approve"},
        {"num": "7", "title": "Capture & Payout", "actor": "PayPal", "desc": "PayPal captures hold & executes direct dev payout"}
    ]

    s_width = Inches(1.52)
    s_height = Inches(3.6)
    s_top = Inches(2.28)
    s_gap = Inches(0.18)

    for i, st in enumerate(steps):
        left_pos = Inches(0.8) + i * (s_width + s_gap)

        card = slide4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left_pos, s_top, s_width, s_height)
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = CARD_BORDER
        card.line.width = Pt(1)

        # Step Number Badge
        num_circle = slide4.shapes.add_shape(MSO_SHAPE.OVAL, left_pos + Inches(0.18), s_top + Inches(0.2), Inches(0.38), Inches(0.38))
        num_circle.fill.solid()
        num_circle.fill.fore_color.rgb = PRIMARY_BLUE if i in [0, 5] else (CYAN_ACCENT if i in [2, 3] else (PURPLE_ACCENT if i == 4 else GREEN_ACCENT))
        num_circle.line.fill.background()
        tf_n = num_circle.text_frame
        tf_n.margin_left = tf_n.margin_right = tf_n.margin_top = tf_n.margin_bottom = 0
        pn = tf_n.paragraphs[0]
        pn.text = st["num"]
        pn.alignment = PP_ALIGN.CENTER
        pn.font.name = "Inter"
        pn.font.size = Pt(11)
        pn.font.bold = True
        pn.font.color.rgb = RGBColor(11, 17, 32)

        # Actor badge
        tb_actor = slide4.shapes.add_textbox(left_pos + Inches(0.15), s_top + Inches(0.72), s_width - Inches(0.3), Inches(0.3))
        tf_act = tb_actor.text_frame
        tf_act.word_wrap = True
        tf_act.margin_left = tf_act.margin_right = tf_act.margin_top = tf_act.margin_bottom = 0
        pact = tf_act.paragraphs[0]
        pact.text = st["actor"].upper()
        pact.font.name = "Inter"
        pact.font.size = Pt(9)
        pact.font.bold = True
        pact.font.color.rgb = CYAN_ACCENT

        # Step title
        tb_t = slide4.shapes.add_textbox(left_pos + Inches(0.15), s_top + Inches(1.05), s_width - Inches(0.3), Inches(0.65))
        tf_t = tb_t.text_frame
        tf_t.word_wrap = True
        tf_t.margin_left = tf_t.margin_right = tf_t.margin_top = tf_t.margin_bottom = 0
        pt = tf_t.paragraphs[0]
        pt.text = st["title"]
        pt.font.name = "Inter"
        pt.font.size = Pt(13)
        pt.font.bold = True
        pt.font.color.rgb = TEXT_WHITE

        # Step description
        tb_d = slide4.shapes.add_textbox(left_pos + Inches(0.15), s_top + Inches(1.8), s_width - Inches(0.3), Inches(1.6))
        tf_d = tb_d.text_frame
        tf_d.word_wrap = True
        tf_d.margin_left = tf_d.margin_right = tf_d.margin_top = tf_d.margin_bottom = 0
        pd = tf_d.paragraphs[0]
        pd.text = st["desc"]
        pd.font.name = "Inter"
        pd.font.size = Pt(10)
        pd.font.color.rgb = TEXT_SLATE

    # Bottom 3 Milestone Summary Cards
    m_box = slide4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(6.15), Inches(11.73), Inches(0.52))
    m_box.fill.solid()
    m_box.fill.fore_color.rgb = CARD_BG_ALT
    m_box.line.color.rgb = CARD_BORDER
    m_box.line.width = Pt(1)
    tf_m = m_box.text_frame
    tf_m.margin_left = tf_m.margin_right = tf_m.margin_top = tf_m.margin_bottom = 0
    p_m = tf_m.paragraphs[0]
    p_m.text = "PHASE 1: PayPal Escrow Hold (Steps 1-2)    ➔    PHASE 2: Autonomous Verification (Steps 3-5)    ➔    PHASE 3: Capture & Payout (Steps 6-7)"
    p_m.alignment = PP_ALIGN.CENTER
    p_m.font.name = "Inter"
    p_m.font.size = Pt(11)
    p_m.font.bold = True
    p_m.font.color.rgb = GREEN_ACCENT

    add_slide_indicator(slide4, "4")

    # Output file
    output_path = "/Users/mohammedminhaajali/Desktop/payPal/OpenProofPay_Pitch_Deck.pptx"
    prs.save(output_path)
    print(f"Successfully generated PowerPoint presentation at: {output_path}")

if __name__ == "__main__":
    create_presentation()
