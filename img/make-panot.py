"""Draws an original four-petal paving tile (in the spirit of Barcelona's
panot de flor) as SVG, in several colorways. Each file is one 100x100 tile
including half the joint on each side, so it repeats seamlessly."""
import sys

def tile(c, size=100):
    # Nested quatrefoil: layers drawn outer to inner. Each layer = highlight
    # ring (offset down-right), groove ring, then a fill that covers the
    # inside, so only the outline of the union of the four circles is left.
    layers = [
        # (petal radius, petal distance from centre)
        (19.5, 19.0),
        (12.5, 16.5),
    ]
    centre_r = 10.5
    w = c["w"]
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 100 100">']
    # joint (gap between tiles)
    out.append(f'<rect width="100" height="100" fill="{c["joint"]}"/>')
    # tile face with bevel: light top-left edge, dark bottom-right edge
    out.append(f'<rect x="2.5" y="2.5" width="95" height="95" rx="2.5" fill="{c["shade"]}"/>')
    out.append(f'<rect x="2.5" y="2.5" width="94" height="94" rx="2.5" fill="{c["light"]}"/>')
    out.append(f'<rect x="3.5" y="3.5" width="93" height="93" rx="2" fill="{c["face"]}"/>')
    cx = cy = 50
    dirs = [(0, -1), (1, 0), (0, 1), (-1, 0)]
    for r, d in layers:
        pts = [(cx + dx * d, cy + dy * d) for dx, dy in dirs]
        for x, y in pts:
            out.append(f'<circle cx="{x + 0.9:.2f}" cy="{y + 0.9:.2f}" r="{r:.2f}" fill="none" stroke="{c["light"]}" stroke-width="{w}"/>')
        for x, y in pts:
            out.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{r:.2f}" fill="none" stroke="{c["groove"]}" stroke-width="{w}"/>')
        for x, y in pts:
            out.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{r - w / 2 - 0.05:.2f}" fill="{c["face"]}"/>')
    out.append(f'<circle cx="{cx + 0.9}" cy="{cy + 0.9}" r="{centre_r}" fill="none" stroke="{c["light"]}" stroke-width="{w}"/>')
    out.append(f'<circle cx="{cx}" cy="{cy}" r="{centre_r}" fill="{c["face"]}" stroke="{c["groove"]}" stroke-width="{w}"/>')
    out.append("</svg>")
    return "".join(out)

COLORWAYS = {
    # tone-on-tone on the red header (#aa151b)
    "panot-red": dict(joint="#97121a", shade="#9e131b", light="#b31e26", face="#aa151b", groove="#98121a", w=2.2),
    # warm sand, like the pavement in the photo but light enough for a page
    "panot-sand": dict(joint="#d7c3a4", shade="#dfcdb1", light="#f8efdf", face="#efe2cb", groove="#d6bf9c", w=2.2),
}

if __name__ == "__main__":
    out_dir = sys.argv[1]
    for name, c in COLORWAYS.items():
        with open(f"{out_dir}/{name}.svg", "w") as f:
            f.write(tile(c))
        print(name)
