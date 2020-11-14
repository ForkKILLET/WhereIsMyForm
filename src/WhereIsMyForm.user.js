// ==UserScript==
// @name         WhereIsMyForm
// @namespace    https://github.com/ForkFG
// @version      0.3
// @description  管理你的表单，不让他们走丢。适用场景：问卷，发帖，……
// @author       ForkKILLET
// @match        *://*/*
// @noframes
// @grant        unsafeWindow
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @require      https://code.jquery.com/jquery-1.11.0.min.js
// ==/UserScript==

const $ = jQuery // Debug: Kill eslint warnings in TM editor: "'$' is not defined".

function Throw(msg, detail) {
    msg = `[WIMF] ${msg}`
    arguments.length === 2
        ? console.error(msg + "\n%o", detail)
        : console.error(msg)
}

function Dat({ getter, setter, useWrapper, getW, setW, dataW }) {
    function dat(opt, src = dat, path) {
        for (let n in opt) {
            const p = path ? path + "." + n : n
            Object.defineProperty(src, n, useWrapper
                ? {
                    get: () => ls.__(".", getW(), p),
                    set: v => {
                        debugger
                        const d = getW()
                        ls.__(".", d)[p] = dataW ? dataW(v) : v
                        setW(dataW ? dataW(d) : d)
                    }
                }
                : {
                    get: () => getter(p, n),
                    set: val => setter(p, n, val)
                }
            )
            if (typeof opt[n] === "object") {
                if (! dat[n]) dat[n] = {}
                dat(opt[n], dat[n], p)
            }
            else if (! dat[n]) dat[n] = opt[n]
        }
    }

    function parse(path, spliter = ".", src = dat) {
        const keys = path.split(spliter), len = keys.length
        function _parse(idx, now) {
            let k = keys[idx]
            if (len - idx <= 1) return [ dat, k ]
            return _parse(idx + 1, now[k])
        }
        return _parse(0, src)
    }

    dat.__ = (spliter, src, raw) => new Proxy(dat, {
        get: (_, path) => {
            const r = parse(path, spliter, src)
            return raw ? r : r[0][r[1]]
        },
        set: (_, path, val) => {
            const r = parse(path, spliter, src)
            r[0][r[1]] = val
        }
    })
    dat._ = dat.__()

    return dat
}

const ls = Dat({
    useWrapper: true,
    getW: () => JSON.parse(unsafeWindow.localStorage.getItem("WIMF")),
    setW: v => unsafeWindow.localStorage.setItem("WIMF", v),
    dataW: v => JSON.stringify(v)
})
const ts = Dat({
    useWrapper: true,
    getW: () => GM_getValue("app"),
    setW: v => GM_setValue("app", v)
})

$.fn.extend({
    path() {
        // Note: Too strict. We need a smarter path.
        //       It doesn't work on dynamic pages sometimes.
        return (function _path(e, p = "", f = true) {
            if (! e) return p
            const $e = $(e), t = e.tagName.toLowerCase()
            let pn = t
            if (e.id) pn += `#${e.id}`
            if (e.name) pn += `[name=${e.name}]`
            if (! e.id && $e.parent().children(t).length > 1) pn += `:nth-of-type(${
                $e.prevAll(t).length + 1
            })`
            return _path(e.parentElement, pn + (f ? "" : `>${p}`), false)
        })(this[0])
    },
    one(event, func) {
        return this.off(event).on(event, func)
    },
    forWhat() {
        if (! this.is("label")) return null
        let for_ = this.attr("for")
        if (for_) return $(`#${for_}`)
        for (let i of [ "prev", "next", "children" ]) {
            let $i = this[i]("input[type=checkbox]")
            if ($i.length) return $i
        }
        return null
    }
})

function scan({ hl, root, vOnly } = {
    root: "body"
}) {
    const op = ls.op

    const $t = $(`${root} input[type=text],textarea`),
          $r = $(`${root} input[type=radio],label`),
          $c = $(`${root} input[type=checkbox],label`),
          $A = [ $t, $r, $c ]

    if (vOnly) {
        const vOf = [
            $_ => $_.val(),
            $_ => ($_.is("label") ? $_.forWhat() : $_).$attr
        ]
        let res = {}
        for (let [ i, $i ] in $A.entries()) {
            if (! $i.length) continue
            const f = vOf[i]
            if (f == null) Throw(`Can't get value. ${i}#`)
            for (let j = 0; j < $i.length; j++) {
                const $_ = $($i[j])
                res[$_.path()] = f($_)
            }
        }
        return res
    }

    $t.one("change.WIMF", () => {
        const $_ = $(this), path = $_.path(), val = $_.val()
        let f = true; for (let i in op) {
            if (op[i].type === "text" && op[i].path === path){
                op[i].val = val
                f = false; break
            }
        }
        if (f) op.push({ path, val, type: "text" })
        ls.op = op
    })
    $r.one("click.WIMF", () => {
        let $_ = $(this)
        let path = $_.path(), label
        if ($_.is("label")) {
            label = path
            $_ = $_.forWhat()
            path = $_.path()
        }
        if (! $_.is("[type=radio]")) return

        let f = true; for (let i in op) {
            if (op[i].type === "radio") {
                if (op[i].path === path){
                    f = false; break
                }
                // Note: Replace the old choice.
                if ($(op[i].path).attr("name") === $_.attr("name")) {
                    op[i].path = path
                    f = false; break
                }
            }
        }
        if (f) op.push({ path, label, type: "radio" })
        ls.op = op
    })
    $c.one("click.WIMF", () => {
        let $_ = $(this)
        let path = $_.path(), label
        if ($_.is("label")) {
            label = path
            $_ = $_.forWhat()
            path = $_.path()
        }
        if (! $_.is("[type=checkbox]")) return

        let f = true; for (let i in op)
            if (op[i].type === "checkbox" && op[i].path === path){
                f = false; break
            }
        if (f) op.push({ path, label, type: "checkbox" })
        ls.op = op
    })

    if (typeof hl === "function") for (let $i of $A) hl($i)
}

const UI = {}
UI.meta = {
    author: "ForkKILLET",
    slogan: "管理你的表单，不让他们走丢",
    aboutCompetition: `
<p>华东师大二附中“创意·创新·创造”大赛 <br/>
    <i>-- 刘怀轩 东昌南校 初三2班
</p>`,

    mainButton: (name, emoji) => `
<span class="WIMF-button" name="${name}">${emoji}</span>
`,
    html: `
<div class="WIMF">
    <div class="WIMF-main">
        <b class="WIMF-title">WhereIsMyForm</b>
        #{mainButton | mark 标记 | 🔍}
        #{mainButton | fill 填充 | 📃}
        #{mainButton | rset 清存 | 🗑️}
        #{mainButton | conf 设置 | ⚙️}
        #{mainButton | info 关于 | ℹ️}
        #{mainButton | quit 退出 | ❌}
    </div>
    <div class="WIMF-text"></div>
</div>
`,
    testURL: "https://www.wjx.cn/newsurveys.aspx",
    info: `
<b class="WIMF-title">Infomation</b> <br/>

<p>#{slogan} <br/>
    <i>-- #{author}</i>
</p> <br/> <br/>

#{aboutCompetition} <br/> <br/>

<p>可用的测试页面：</p>
<a href="#{testURL}">#{testURL}</a>
`,
    confInput: (zone, name, hint) => `
<input type="text" name="${zone}_${name}"
    placeholder="${name[0].toUpperCase() + name.slice(1)} ${hint}"
/>
`,
    confApply: zone => `<button data-zone="${zone}">OK</button>`,
    conf: `
<b class="WIMF-title">Configuration</b> <br/>

<p>
    Shortcuts 快捷键 <br/>
    #{confInput | key | leader | 引导}
    #{confInput | key | toggle | 开关浮窗}
    #{confApply | key}
</p>
`,
    styl: `
.WIMF {
    position: fixed;
    z-index: 1919810;

    opacity: 1;
    transition: top 1s, right 1s;
}
.WIMF, .WIMF * {
    box-sizing: content-box;
}
.WIMF-main, .WIMF-text {
    position: absolute;

    padding: 0 3px 0 4.5px;

    border-radius: 12px;
    font-size: 12px;
    background-color: #fff;
    box-shadow: 0 0 4px #aaa;
}
.WIMF-main {
    top: 0;
    right: 0;
    width: 100px;
    height: 80px;
}
.WIMF-main::after {
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    pointer-events: none;

    content: "";
    border-radius: 12px;
    background-color: black;

    opacity: 0;
    transition: opacity .8s;
}
.WIMF-main.dragging::after {
    opacity: .5;
}
.WIMF-title {
    display: block;
    font-size: 12px;
    text-align: center;
    transform: scale(.9)
}
.WIMF-button {
    display: inline-block;
    width: 17px;
    height: 17px;

    padding: 2px 3px 3px 3px;
    margin: 3px;

    border-radius: 7px;
    font-size: 12px;
    text-align: center;
    box-shadow: 0 0 3px #bbb;

    background-color: #fff;
    transition: background-color .8s;
}
.WIMF-button:hover, .WIMF-button.active {
    background-color: #bbb;
}
.WIMF-button:hover::before {
    position: absolute;
    right: 114px;
    width: 75px;

    content: attr(name);
    padding: 0 3px;

    font-size: 14px;
    border-radius: 4px;
    background-color: #fff;
    box-shadow: 0 0 4px #aaa;
}
.WIMF-mark {
    background-color: #ffff81;
}
.WIMF-text {
    display: none;
    top: 85px;
    right: 0;
    width: 100px;
    height: 300px;
}
.WIMF-text a {
    overflow-wrap: anywhere;
}
.WIMF-text input {
    width: 95px;
    margin: 3px 0;

    border: none;
    border-radius: 3px;
    outline: none;
    box-shadow: 0 0 3px #aaa;
}
.WIMF-text button {
    margin: 3px 0;
    padding: 0 5px;

    border: none;
    border-radius: 3px;
    outline: none;

    box-shadow: 0 0 3px #aaa;
    background-color: #fff;
    transition: background-color .8s;
}
.WIMF-text button:hover {
    background-color: #bbb;
}
`
}
UI.M = new Proxy(UI.meta, {
    get: (t, n) => t[n].replace(/#{(.*?)}/g, (_, s) => {
        const [ k, ...a ] = s.split(/ *\| */), m = t[k]
        if (a.length && typeof m === "function") return m(...a)
        return m
    })
})

UI.$btn = n => $(`.WIMF-button[name^=${n}]`)
UI.action = {
    mark() {
        const $b = UI.$btn("mark")
        if ($b.is(".active")) $(".WIMF-mark").removeClass("WIMF-mark")
        else scan({
            hl: $i => $i.addClass("WIMF-mark")
        })
        $b.toggleClass("active")
    },
    fill() {
        for (let o of ls.op) {
            const $i = $(o.path)
            if (! $i.length) Throw("Form path not found")
            switch (o.type) {
                case "text":
                    $i.val(o.val)
                    break
                case "radio":
                case "checkbox":
                    // Hack: HTMLElement:.click is stabler than $.click sometimes.
                    //       If user clicks <label> instead of <input>, we also do that.
                    if (o.label) $(o.label)[0].click()
                    else $i[0].click()
                    break
                default:
                    Throw("Unknown form type.")
            }
        }
    },
    rset() {
        ls.op = []
    },
    conf() {
        UI.text.show("conf")

        const $A = $(".WIMF-text button")
        for (let i = 0; i < $A.length; i++) {
            const $b = $($A[i]),
                  zone = $b.data("zone"),
                  $t = $b.prevAll(`input[name^=${zone}_]`)
            for (let j = 0; j < $t.length; j++) {
                const $e = $($t[j])
            }
        }
    },
    info() {
        UI.text.show("info")
    },
    quit() {
        $(".WIMF-main").hide()
    },
    back() {
        $(".WIMF-text").hide()
        UI.$btn("back").attr("name", "quit 退出")
        UI.hideText()
    }
}
UI.text = {
    hide: () => UI.$btn(UI.textActive).removeClass("active"),
        show: (n) => {
        UI.text.hide()
        $(".WIMF-text").show().html(UI.M[n])
        UI.$btn(n).addClass("active")
        UI.textActive = n
        UI.$btn("quit").attr("name", "back 返回")
    }
}
UI.move = (t, r) => {
    if (t != null) ts.top = Math.max(t, 0)
    if (r != null) ts.right = Math.max(r, 0)
    $(".WIMF").css("top", ts.top + "px").css("right", ts.right + "px")
}
UI.init = () => {
    GM_addStyle(UI.M.styl)
    $("body").after(UI.M.html)
    UI.move()

    const $m = $(".WIMF-main"), $w = $(unsafeWindow)

    $(".WIMF-button").on("click", e =>
         UI.action[e.target.getAttribute("name").split(" ")[0]]())

    $m.on("mousedown", e => {
        const { clientX: x0, clientY: y0 } = e

        $w.on("mouseup", finish)

        let c = false
        const t_f = setTimeout(finish, 1800),
              t_c = setTimeout(() => {
            c = true
            $m.addClass("dragging")
        }, 200) // Note: Differentiate from clickings.

        function finish(f) {
            clearTimeout(t_f); clearTimeout(t_c)
            if (c && f) {
                const { clientX: x1, clientY: y1 } = f,
                      dx = x1 - x0, dy = y1 - y0
                UI.move(ts.top + dy, ts.right - dx)
            }
            if (c) $m.removeClass("dragging").off("mousemove")
            $w.off("mouseup")
        }
    })
}

$(() => {
    ls({
        op: []
    })
    ts({
        top: 0,
        right: 0,
        key: {
            leader: "A+w",
            toggle: "L>q"
        }
    })
    UI.init()
    scan()
})

