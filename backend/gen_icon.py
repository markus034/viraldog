from PIL import Image, ImageDraw
import os, io, struct

def make_icon_image(size):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx = cy = size // 2
    r = int(size * 0.46)
    # Fundo circular laranja
    draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(245, 129, 26, 255))
    # Anel interno mais escuro
    r2 = int(r * 0.85)
    draw.ellipse([cx-r2, cy-r2, cx+r2, cy+r2], fill=(224, 67, 10, 255))
    # Letra V
    v_scale = size / 256
    pts = [
        (int(70*v_scale), int(80*v_scale)),
        (int(128*v_scale), int(176*v_scale)),
        (int(186*v_scale), int(80*v_scale)),
        (int(168*v_scale), int(80*v_scale)),
        (int(128*v_scale), int(152*v_scale)),
        (int(88*v_scale), int(80*v_scale)),
    ]
    draw.polygon(pts, fill=(255, 255, 255, 255))
    # Letra D
    x0 = int(98*v_scale)
    x1 = int(165*v_scale)
    y0 = int(92*v_scale)
    y1 = int(164*v_scale)
    draw.rectangle([x0, y0, x0+int(14*v_scale), y1], fill=(255,255,255,255))
    draw.ellipse([x0, y0, x1, y1], outline=(255,255,255,255), width=int(14*v_scale))
    return img

# Salvar PNG temporarios e empacotar como ICO manualmente
sizes = [16, 32, 48, 64, 128, 256]
png_data = []
for s in sizes:
    img = make_icon_image(s)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    png_data.append(buf.getvalue())

# Montar ICO binário manualmente (garante tamanho correto)
n = len(sizes)
header_size = 6 + n * 16
offset = header_size
ico = bytearray()
# ICONDIR
ico += struct.pack('<HHH', 0, 1, n)
# ICONDIRENTRY para cada imagem
for i, s in enumerate(sizes):
    data = png_data[i]
    w = s if s < 256 else 0  # 256 codifica como 0 no ICO
    h = s if s < 256 else 0
    ico += struct.pack('<BBBBHHII', w, h, 0, 0, 1, 32, len(data), offset)
    offset += len(data)
# Dados PNG
for data in png_data:
    ico += data

out_path = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'electron', 'assets', 'icon.ico'))
with open(out_path, 'wb') as f:
    f.write(ico)

print(f"ICO salvo em: {out_path}")
print(f"Tamanho: {os.path.getsize(out_path):,} bytes")
print(f"Resolucoes: {sizes}")

