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
// @grant        GM_listValues
// @require      https://code.jquery.com/jquery-1.11.0.min.js
// ==/UserScript==

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
                    get: () => dat._[p],
                    set: v => dat._[p] = v
                }
                : {
                    get: () => getter(p, n),
                    set: v => setter(p, n, v)
                }
            )
            if (typeof opt[n] === "object" && ! Array.isArray(opt[n])) {
                if (src[n] == null) src[n] = {}
                dat(opt[n], dat[n], p)
            }
            else if (src[n] == null) src[n] = opt[n]
        }
    }

    function parse(path, src = dat) {
        const keys = path.split("."), len = keys.length
        function _parse(idx, now) {
            let k = keys[idx]
            if (len - idx <= 1) return [ now, k ]
            return _parse(idx + 1, now[k])
        }
        return _parse(0, src)
    }

    dat._ = new Proxy(dat, {
        get: (_, path) => {
            const r = parse(path, getW())
            return r[0][r[1]]
        },
        set: (_, path, val) => {
            const d = getW(), r = parse(path, d)
            r[0][r[1]] = val
            setW(dataW ? dataW(d) : d)
        }
    })

    return dat
}

const ls = Dat({
    useWrapper: true,
    getW: () => JSON.parse(unsafeWindow.localStorage.getItem("WIMF") ?? "{}"),
    setW: v => unsafeWindow.localStorage.setItem("WIMF", v),
    dataW: v => JSON.stringify(v)
})
const ts = Dat({
    useWrapper: true,
    getW: () => GM_getValue("app") ?? {},
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
    },
    melt(type, time, rm) {
        if (type === "fadeio")
            type = this.css("display") === "none" ? "fadein" : "fadeout"
        if (type === "fadein") this.show()
        this.css("animation", `melting-${type} ${time}s`)
        time *= 1000
        setTimeout(() => {
            if (type !== "fadein") rm ? this.remove() : this.hide()
        }, time > 100 ? time - 100 : time * 0.9)
        // Note: A bit shorter than the animation duration for avoid "flash back".
    }
})

function scan({ hl, root } = {
    root: "body"
}) {
    const op = ls.op

    const $t = $(`${root} input[type=text],textarea`),
          $r = $(`${root} input[type=radio],label`),
          $c = $(`${root} input[type=checkbox],label`),
          $A = [ $t, $r, $c ]

    $t.one("change.WIMF", function() {
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
    $r.one("click.WIMF", function() {
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
    $c.one("click.WIMF", function() {
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

function shortcut() {
    let t_pk
    const pk = []
    pk.last = () => pk[pk.length - 1]

    const $w = $(unsafeWindow), sc = ts.sc,
          sc_rm = () => {
              for (let i in sc) sc[i].m = 0
          },
          ct = () => {
              clearTimeout(t_pk)
              pk.splice(0)
              pk.sdk =  false
              t_pk = null
              sc_rm()
          },
          st = () => {
              clearTimeout(t_pk)
              t_pk = setTimeout(ct, 800)
          }

    for (let i in sc) sc[i] = sc[i].split("&").map(i => i === "" ? sc.leader[0] : i)
    const c_k = {
        toggle: () => $(".WIMF").melt("fadeio", 1.5),
        mark: UI.action.mark,
        fill: UI.action.fill,
        rset: UI.action.rset,
        conf: UI.action.conf,
        info: UI.action.info
    }

    ct()
    $w.one("keydown.WIMF", e => {
        st(); let ck = "", sdk = false
        for (let dk of [ "alt", "ctrl", "shift", "meta" ]) {
            if (e[dk + "Key"]) {
                ck += dk = dk[0].toUpperCase() + dk.slice(1)
                if (e.key === dk || e.key === "Control") {
                    sdk = true; break
                }
                ck += "-"
            }
        }
        if (! sdk) ck += e.key.toLowerCase()

        if (pk.sdk && ck.includes(pk.last())) {
            pk.pop()
        }
        pk.sdk = sdk
        pk.push(ck)

        for (let i in sc) {
            const k = sc[i]
            if (k.m === k.length) continue
            if (k[k.m] === ck) {
                if (++k.m === k.length) {
                    if (i !== "leader") ct()
                    if (c_k[i]) c_k[i]()
                }
            }
            else if (pk.sdk && k[k.m].includes(ck)) ;
            else k.m = 0
        }
    })
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
    <div class="WIMF-task"></div>
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
${name[0].toUpperCase() + name.slice(1)} ${hint}
<input type="text" name="${zone}_${name}"/>
`,
    confApply: (zone) => `<button data-zone="${zone}">OK</button>`,
    conf: `
<b class="WIMF-title">Configuration</b> <br/>

<p>
    <b>Shortcuts 快捷键</b> <br/>
    #{confInput | sc | leader | 引导}
    #{confInput | sc | toggle | 开关浮窗}
    #{confInput | sc | mark | 标记}
    #{confInput | sc | fill | 填充}
    #{confInput | sc | rset | 清存}
    #{confInput | sc | conf | 设置}
    #{confInput | sc | info | 关于}
    #{confApply | sc}
</p>
`,
    styl: `
/* :: Animation */

@keyframes melting-sudden {
    0%, 70% { opacity: 1; }
    100% { opacity: 0; }
}
@keyframes melting-fadeout {
    0% { opacity: 1; }
    100% { opacity: 0; }
}
@keyframes melting-fadein {
    0% { opacity: 0; }
    100% { opacity: 1; }
}

/* :: Skeleton */

.WIMF {
    position: fixed;
    z-index: 1919810;
    user-select: none;

    opacity: 1;
    transition: top 1s, right 1s;
    transform: scale(.9);
}
.WIMF, .WIMF * {
    box-sizing: content-box;
}

.WIMF-main, .WIMF-text, .WIMF-task p {
    width: 100px;

    padding: 0 3px 0 4.5px;
    border-radius: 12px;
    font-size: 12px;
    background-color: #fff;
    box-shadow: 0 0 4px #aaa;
}
.WIMF-main {
    position: absolute;
    top: 0;
    right: 0;
    height: 80px;
}

.WIMF-task {
    position: absolute;
    top: 0;
    right: 115px;
}

/* :: Modification */

.WIMF-mark {
    background-color: #ffff81;
}
.WIMF-title {
    display: block;
    text-align: center;
}

/* :: Cell */

.WIMF-main::after { /* Note: A cover. */
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

.WIMF-text {
    position: absolute;
    display: none;
    top: 85px;
    right: 0;
    height: 300px;

    overflow: -moz-scrollbars-none;
    overflow-y: scroll;
    -ms-overflow-style: none;
}
.WIMF-text::-webkit-scrollbar {
    display: none;
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

.WIMF-task p {
    margin-bottom: 3px;
    background-color: #9f9;
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
        if ($b.is(".active")) {
            $(".WIMF-mark").removeClass("WIMF-mark")
            UI.task("表单高亮已取消。", "Form highlight is canceled.")
        }
        else {
            scan({
                hl: $i => $i.addClass("WIMF-mark")
            })
            UI.task("表单已高亮。", "Forms are highlighted.")
        }
        $b.toggleClass("active")
    },
    fill() {
        let c = 0; for (let o of ls.op) {
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
            c++
        }
        UI.task(`已填充 ${c} 个表单项。`, `${c} form field(s) is filled.`)
    },
    rset() {
        ls.op = []
        UI.task("保存的表单已清除。", "Saved form is reset.")
    },
    conf() {
        UI.text.show("conf")

        const $A = $(".WIMF-text button")
        for (let i = 0; i < $A.length; i++) {
            const $b = $($A[i]),
                  zone = $b.data("zone"),
                  $t = $b.prevAll(`input[type=text][name^=${zone}_]`),
                  c_b = {
                      sc: shortcut
                  }

            function map(it) {
                for (let j = $t.length - 1; j >= 0; j--) {
                    const $e = $($t[j]), sp = $e.attr("name").replace("_", ".")
                    it($e, sp)
                }
            }
            map(($_, sp) => $_.val(ts._[sp]))
            $b.on("click", () => {
                map(($_, sp) => ts._[sp] = $_.val())
                if (c_b[zone]) c_b[zone]()
                UI.task(`设置块 ${zone} 已应用。`, `Configuration zone ${zone} is applied.`)
            })
        }
    },
    info() {
        UI.text.show("info")
    },
    quit() {
        $(".WIMF").melt("fadeout", 1.5, true)
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
UI.task = (m) => $(`<p>${m}</p>`).prependTo($(".WIMF-task")).melt("sudden", 3, true)
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

    $(".WIMF-button").on("click", function() {
         UI.action[$(this).attr("name").split(" ")[0]]()
    })

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

$(function init() {
    ls({
        op: []
    })
    ts({
        top: 0,
        right: 0,
        sc: {
            leader: "Alt-w",
            toggle: "&q",
            mark: "&m",
            fill: "&f",
            rset: "&r",
            conf: "&c",
            info: "&i"
        }
    })

    UI.init()
    scan()
    shortcut()
})

