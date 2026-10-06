#!/usr/bin/env python3
"""把 src/ 底下的共用原始檔組成兩份輸出：
  dist/index.html     獨立版（GitHub Pages，Firebase compat SDK）
  dist/artifact.html  Artifact 版（沒有 doctype/html/head/body，用 window.claude.use("db")）

用法：python3 build.py [--out DIR]
  （已移除 --no-wrapper：改版後行為和 _baseline 不同，不再逐位元組比對；_baseline 保留當歷史紀錄。）

原始檔內的建置指令（都必須獨佔一行、從第 1 欄開始）：
  //#@ 名稱                 檔案內的「區段」起點（build.py 的 SCRIPT_ORDER 用 檔案:區段 引用）
  //#if standalone|artifact / //#else / //#endif   條件區塊（CSS 內用 /*#if ...*/ 寫法）
"""
import os, re, sys

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
        + ["core.js:base", "sync.js:logic",
           "mostlikely.js:logic", "draw.js:logic", "werewolf.js:logic", "avalon.js:logic",
           "codenames.js:logic", "justone.js:logic",
           "core.js:content", "core.js:runtime",
           "home.js", "telepathy.js",
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

if __name__ == "__main__":
    main(sys.argv[1:])
