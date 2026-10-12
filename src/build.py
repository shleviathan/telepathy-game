#!/usr/bin/env python3
"""把 src/ 底下的共用原始檔組成兩份輸出：
  dist/index.html     獨立版（GitHub Pages，Firebase compat SDK）
  dist/artifact.html  Artifact 版（沒有 doctype/html/head/body，用 window.claude.use("db")）

  dist/manifest.webmanifest、sw.js、icon-192.png、icon-512.png、icon-maskable-512.png、apple-touch-icon.png
                      獨立版專用的 PWA 檔案（Artifact 版沒有）；圖示用 Pillow 畫，需要 `pip install pillow`

用法：python3 build.py [--out DIR]
  （已移除 --no-wrapper：改版後行為和 _baseline 不同，不再逐位元組比對；_baseline 保留當歷史紀錄。）

原始檔內的建置指令（都必須獨佔一行、從第 1 欄開始）：
  //#@ 名稱                 檔案內的「區段」起點（build.py 的 SCRIPT_ORDER 用 檔案:區段 引用）
  //#if standalone|artifact / //#else / //#endif   條件區塊（CSS 內用 /*#if ...*/ 寫法）
"""
import hashlib, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, "dist")

# ---- 每個輸出版本的設定 ------------------------------------------------------
TARGETS = {
    "standalone": {
        "out": "index.html",
        "template": "head.standalone.html",
        "backend": "backend.firebase.js",
        "script_head": ["backend.firebase.js:config"],   # 放在 <script> 最前面（firebaseConfig）
    },
    "artifact": {
        "out": "artifact.html",
        "template": "head.artifact.html",
        "backend": "backend.artifact.js",
        "script_head": [],
    },
}

# ---- <script> 內容的組裝順序（檔案:區段；沒有區段的檔案整份引用）-----------------
# 「接力畫猜 / 誰最可能 / 狼人殺」三組 actions 在改版前兩個版本的順序不同
# （獨立版：draw, mostlikely, werewolf；Artifact 版：werewolf, draw, mostlikely）。
# 函式宣告會提升、順序不影響行為；為了和原檔逐位元組一致，這裡暫時保留各自的順序。
# 想統一時把 ACTION_ORDER 兩邊改成同一個即可。
ACTION_ORDER = {
    "standalone": ["draw.js:actions", "mostlikely.js:actions", "werewolf.js:actions"],
    "artifact":   ["werewolf.js:actions", "draw.js:actions", "mostlikely.js:actions"],
}

def script_order(target):
    t = TARGETS[target]
    return (
        t["script_head"]
        + ["version.js"]
        + ["core.js:base", "ux.js:logic", "sync.js:logic",
           "mostlikely.js:logic", "draw.js:logic", "werewolf.js:logic", "avalon.js:logic",
           "codenames.js:logic", "justone.js:logic",
           "core.js:content", "core.js:runtime",
           "home.js", "ux.js:view", "telepathy.js",
           "mostlikely.js:view", "draw.js:view", "werewolf.js:view", "avalon.js:view",
           "codenames.js:view", "justone.js:view",
           "room.js:head", t["backend"] + ":adapter", "room.js:actions", "sync.js:actions"]
        + ACTION_ORDER[target]
        + ["avalon.js:actions", "codenames.js:actions", "justone.js:actions",
           "boot.js"]
    )

# ---- 工具 ---------------------------------------------------------------------
DIRECTIVE = re.compile(r"^(?://|/\*)#(if|else|endif)(?: (\w+))?(?:\*/)?$")
PART = re.compile(r"^//#@ (\w+)$")

def read(name):
    with open(os.path.join(HERE, name), encoding="utf-8", newline="") as f:
        return f.read()

def preprocess(text, flags, where):
    """處理 //#if / //#else / //#endif；flags 是目前啟用的旗標集合。"""
    out, stack = [], []          # stack 元素：(此層是否輸出, 父層是否輸出, 條件結果)
    live = True
    for n, line in enumerate(text.split("\n"), 1):
        raw = line
        m = DIRECTIVE.match(line)
        if m:
            kind, flag = m.groups()
            if kind == "if":
                cond = flag in flags
                stack.append((live, cond))
                live = live and cond
            elif kind == "else":
                parent, cond = stack[-1]
                live = parent and not cond
            else:
                parent, _ = stack.pop()
                live = parent
            continue
        if line.startswith("//#") and not PART.match(line):
            raise SystemExit("%s:%d 不認得的建置指令：%s" % (where, n, raw))
        if live:
            out.append(raw)
    if stack:
        raise SystemExit("%s 的 #if 沒有對應的 #endif" % where)
    return "\n".join(out)

def split_parts(text, where):
    """依 //#@ 切成 {區段名: 內容}；沒有任何標記時整份是 ''。"""
    lines = text.split("\n")
    if not any(PART.match(l) for l in lines):
        return {"": text}
    parts, cur, buf = {}, None, []
    for l in lines:
        m = PART.match(l)
        if m:
            if cur is not None:
                parts[cur] = "\n".join(buf) + "\n"
            cur, buf = m.group(1), []
            if cur in parts:
                raise SystemExit("%s 區段重複：%s" % (where, cur))
        else:
            if cur is None:
                if l:
                    raise SystemExit("%s：第一個 //#@ 之前不能有內容" % where)
                continue
            buf.append(l)
    parts[cur] = "\n".join(buf)
    return parts

def fill(template, **frags):
    for k, v in frags.items():
        ph = "{{%s}}\n" % k
        if template.count(ph) != 1:
            raise SystemExit("樣板必須剛好有一行 {{%s}}" % k)
        template = template.replace(ph, v)
    return template

def build(target):
    flags = {target}
    cfg = TARGETS[target]
    cache = {}
    def fragment(ref):
        name, _, part = ref.partition(":")
        if name not in cache:
            cache[name] = split_parts(preprocess(read(name), flags, name), name)
        try:
            return cache[name][part]
        except KeyError:
            raise SystemExit("找不到區段 %s" % ref)
    script = "".join(fragment(r) for r in script_order(target))
    styles = preprocess(read("styles.css"), flags, "styles.css")
    markup = preprocess(read("markup.html"), flags, "markup.html")
    template = preprocess(read(cfg["template"]), flags, cfg["template"])
    return fill(template, STYLES=styles, MARKUP=markup, SCRIPT=script)

# ---- PWA（只有獨立版）：manifest / sw.js / 圖示 ---------------------------------
# 調色盤取自 styles.css 的 :root（--bg / --accent / --safe / --ink / --surface）。
PALETTE = {"bg": "#eae3da", "accent": "#a68b7c", "safe": "#7f9482", "ink": "#4a4038", "surface": "#fdfaf7"}

def app_version():
    m = re.search(r'APP_VERSION\s*=\s*"([^"]+)"', read("version.js"))
    return m.group(1) if m else "dev"

def make_manifest():
    return {
        "name": "派對遊戲", "short_name": "派對遊戲", "description": "和朋友一起玩的手機派對遊戲",
        "lang": "zh-Hant", "dir": "ltr", "id": "./", "start_url": "./", "scope": "./",
        "display": "standalone", "orientation": "portrait",
        "theme_color": PALETTE["bg"], "background_color": PALETTE["bg"],
        "icons": [
            {"src": "./icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": "./icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": "./icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }

def make_sw(index_html):
    h = hashlib.sha1(index_html.encode("utf-8")).hexdigest()[:8]
    return read("sw.js").replace("__VERSION__", app_version()).replace("__HASH__", h)

def hex_rgb(h):
    h = h.lstrip("#"); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def draw_icon(size, kind):
    """kind: 'any'（圓角、四角透明）| 'maskable'（滿版，骰子縮在安全區內）| 'apple'（滿版，iOS 自己套圓角）。
    用 PIL 畫：accent→safe 對角漸層底 + 一顆微傾的骰子（五點）。不需要任何字型。"""
    from PIL import Image, ImageDraw, ImageFilter
    S = size * 4
    a, b = hex_rgb(PALETTE["accent"]), hex_rgb(PALETTE["safe"])
    bg = Image.new("RGB", (S, S))
    d = ImageDraw.Draw(bg)
    for i in range(2 * S):                       # 對角線由左上掃到右下，顏色線性內插
        t = i / (2 * S - 1)
        d.line([(i, 0), (0, i)], fill=tuple(round(a[k] + (b[k] - a[k]) * t) for k in range(3)), width=2)
    img = bg.convert("RGBA")
    scale = 0.5 if kind == "maskable" else 0.6
    die = int(S * scale)
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    x0 = y0 = (S - die) // 2
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([x0, y0 + S // 40, x0 + die, y0 + die + S // 40], radius=die // 5, fill=(40, 30, 24, 90))
    layer = Image.alpha_composite(layer, sh.filter(ImageFilter.GaussianBlur(S // 60)))
    ld = ImageDraw.Draw(layer)
    ld.rounded_rectangle([x0, y0, x0 + die, y0 + die], radius=die // 5, fill=hex_rgb(PALETTE["surface"]) + (255,))
    r = die // 11
    for fx, fy in [(0.25, 0.25), (0.75, 0.25), (0.5, 0.5), (0.25, 0.75), (0.75, 0.75)]:
        cx, cy = x0 + die * fx, y0 + die * fy
        ld.ellipse([cx - r, cy - r, cx + r, cy + r], fill=hex_rgb(PALETTE["ink"]) + (255,))
    layer = layer.rotate(-10, resample=Image.BICUBIC, center=(S // 2, S // 2))
    img = Image.alpha_composite(img, layer)
    if kind == "any":                            # 圓角遮罩
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=S // 5, fill=255)
        img.putalpha(mask)
    else:
        img = img.convert("RGB")
    return img.resize((size, size), Image.LANCZOS)

def write_pwa_files(outdir, index_html):
    """獨立版專用的額外檔案；Artifact 版不會有任何一個。"""
    def w(name, text):
        with open(os.path.join(outdir, name), "w", encoding="utf-8", newline="") as f:
            f.write(text)
    w("manifest.webmanifest", json.dumps(make_manifest(), ensure_ascii=False, indent=2) + "\n")
    w("sw.js", make_sw(index_html))
    try:
        import PIL  # noqa: F401
    except ImportError:
        raise SystemExit("需要 python3 的 Pillow（pip install pillow）才能產生 PWA 圖示")
    draw_icon(192, "any").save(os.path.join(outdir, "icon-192.png"), optimize=True)
    draw_icon(512, "any").save(os.path.join(outdir, "icon-512.png"), optimize=True)
    draw_icon(512, "maskable").save(os.path.join(outdir, "icon-maskable-512.png"), optimize=True)
    draw_icon(180, "apple").save(os.path.join(outdir, "apple-touch-icon.png"), optimize=True)

def main(argv):
    outdir = DIST
    if "--out" in argv:
        outdir = os.path.abspath(argv[argv.index("--out") + 1])
    os.makedirs(outdir, exist_ok=True)
    for target, cfg in TARGETS.items():
        html = build(target)
        path = os.path.join(outdir, cfg["out"])
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.write(html)
        print("%-12s -> %s (%d bytes)" % (target, os.path.relpath(path), len(html.encode("utf-8"))))
        if target == "standalone":
            write_pwa_files(outdir, html)
            print("%-12s -> manifest.webmanifest, sw.js, icon-192/512/maskable-512.png, apple-touch-icon.png" % "standalone")

if __name__ == "__main__":
    main(sys.argv[1:])
