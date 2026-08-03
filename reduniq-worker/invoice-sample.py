from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "rival-praxis-invoice-sample.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)

INK = colors.HexColor("#211A16")
GOLD = colors.HexColor("#A78461")
CREAM = colors.HexColor("#F3EEE8")
MUTED = colors.HexColor("#6E655E")
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="Brand", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=17, leading=20, textColor=INK, spaceAfter=3))
styles.add(ParagraphStyle(name="Small", parent=styles["Normal"], fontSize=7.8, leading=11, textColor=MUTED))
styles.add(ParagraphStyle(name="Label", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=7.2, leading=10, textColor=GOLD, spaceAfter=4))
styles.add(ParagraphStyle(name="InvoiceTitle", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=25, leading=27, alignment=TA_RIGHT, textColor=INK))
styles.add(ParagraphStyle(name="RightSmall", parent=styles["Small"], alignment=TA_RIGHT))
styles.add(ParagraphStyle(name="Body8", parent=styles["Normal"], fontSize=8.5, leading=12, textColor=INK))

def money(v): return f"EUR {v:,.2f}"

def watermark(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.Color(0.55, 0.48, 0.42, alpha=0.10))
    canvas.setFont("Helvetica-Bold", 40)
    canvas.translate(A4[0] / 2, A4[1] / 2)
    canvas.rotate(35)
    canvas.drawCentredString(0, 0, "SAMPLE - NOT A TAX DOCUMENT")
    canvas.restoreState()

doc = SimpleDocTemplate(str(OUT), pagesize=A4, rightMargin=18*mm, leftMargin=18*mm, topMargin=16*mm, bottomMargin=16*mm)
story = []
logo = ROOT / "images" / "rival-praxis-logo.png"
brand = Image(str(logo), width=48*mm, height=18*mm, kind="proportional") if logo.exists() else Paragraph("RIVAL PRAXIS", styles["Brand"])
company = Paragraph("<b>RIVAL PRAXIS UNIPESSOAL LDA</b><br/>NIF/NIPC 519497074<br/>Lisboa, Portugal<br/>rivalpraxisunipessoallda@gmail.com", styles["Small"])
title = Paragraph("FATURA / INVOICE", styles["InvoiceTitle"])
meta = Paragraph("<b>FT RP2026/000001</b><br/>Issue date: 03 August 2026<br/>Currency: EUR<br/>Page 1 / 1", styles["RightSmall"])
head = Table([[brand, title], [company, meta]], colWidths=[88*mm, 86*mm])
head.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),("ALIGN",(1,0),(1,-1),"RIGHT"),("BOTTOMPADDING",(0,0),(-1,0),6)]))
story += [head, Spacer(1, 10*mm)]

buyer = Paragraph("<b>BUYER / BILL TO</b><br/><br/><b>Acme Distribution Europe Lda</b><br/>VAT: PT 501234567<br/>Rua do Comércio 25<br/>1100-150 Lisboa, Portugal<br/>accounts@example.com", styles["Body8"])
refs = Paragraph("<b>DOCUMENT DETAILS</b><br/><br/>Quotation: RP-Q-2026-00142<br/>Transaction: RQ-9F2A7C41D8<br/>Payment: Hosted card payment<br/>ATCUD: SAMPLE-NOT-VALID", styles["Body8"])
info = Table([[buyer, refs]], colWidths=[92*mm, 82*mm], style=[("BACKGROUND",(0,0),(-1,-1),CREAM),("BOX",(0,0),(-1,-1),0.5,colors.HexColor("#DDD2C6")),("INNERGRID",(0,0),(-1,-1),0.5,colors.HexColor("#DDD2C6")),("VALIGN",(0,0),(-1,-1),"TOP"),("PADDING",(0,0),(-1,-1),10)])
story += [info, Spacer(1, 9*mm)]

rows = [["REF", "DESCRIPTION", "QTY", "UNIT NET", "VAT", "TOTAL"]]
rows += [["RP-AC-0003", "Premium cotton accessories - One Size", "500", money(32.44), "23%", money(16220.00)], ["DELIVERY", "Insured B2B delivery", "1", money(250.00), "23%", money(250.00)]]
items = Table(rows, colWidths=[25*mm, 67*mm, 14*mm, 23*mm, 15*mm, 30*mm], repeatRows=1)
items.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),INK),("TEXTCOLOR",(0,0),(-1,0),colors.white),("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,-1),7.5),("ALIGN",(2,1),(-1,-1),"RIGHT"),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,CREAM]),("LINEBELOW",(0,-1),(-1,-1),0.5,colors.HexColor("#D9CFC5")),("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7)]))
story += [items, Spacer(1, 8*mm)]

vat = Table([["VAT RATE", "TAXABLE", "VAT"], ["23%", money(16470.00), money(3788.10)]], colWidths=[23*mm, 29*mm, 29*mm])
vat.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),CREAM),("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("FONTSIZE",(0,0),(-1,-1),7.5),("ALIGN",(1,0),(-1,-1),"RIGHT"),("GRID",(0,0),(-1,-1),0.4,colors.HexColor("#D9CFC5")),("PADDING",(0,0),(-1,-1),6)]))
totals = Table([["Net subtotal", money(16220.00)], ["Shipping", money(250.00)], ["VAT", money(3788.10)], ["TOTAL PAID", money(20258.10)]], colWidths=[42*mm, 38*mm])
totals.setStyle(TableStyle([("ALIGN",(1,0),(-1,-1),"RIGHT"),("FONTSIZE",(0,0),(-1,-1),8.5),("LINEABOVE",(0,-1),(-1,-1),1.2,GOLD),("FONTNAME",(0,-1),(-1,-1),"Helvetica-Bold"),("TEXTCOLOR",(0,-1),(-1,-1),INK),("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5)]))
summary = Table([[vat, totals]], colWidths=[94*mm, 80*mm], style=[("VALIGN",(0,0),(-1,-1),"TOP"),("ALIGN",(1,0),(1,0),"RIGHT")])
story += [summary, Spacer(1, 12*mm)]

qr_box = Table([[Paragraph("<b>AT QR CODE</b><br/><br/>Supplied only by the selected AT-certified invoicing provider.", styles["Small"])]], colWidths=[35*mm], rowHeights=[35*mm], style=[("BOX",(0,0),(-1,-1),0.8,GOLD),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("ALIGN",(0,0),(-1,-1),"CENTER"),("PADDING",(0,0),(-1,-1),7)])
notes = Paragraph("<b>PAYMENT CONFIRMED</b><br/>This sample demonstrates the intended professional layout. The production document will be generated by certified invoicing software and will carry its official sequential number, ATCUD and AT QR code.<br/><br/><b>Thank you for your business.</b>", styles["Body8"])
story += [KeepTogether(Table([[qr_box, notes]], colWidths=[45*mm,129*mm], style=[("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(1,0),(1,0),8)])), Spacer(1, 8*mm)]
story += [Paragraph("RIVAL PRAXIS UNIPESSOAL LDA  |  NIF/NIPC 519497074  |  Generated securely after verified hosted payment", styles["Small"])]
doc.build(story, onFirstPage=watermark, onLaterPages=watermark)
print(OUT)
