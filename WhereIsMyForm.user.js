// ==UserScript==
// @name         WhereIsMyForm
// @namespace    https://github.com/ForkFG
// @version      0.1
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

function Throw(msg, detail) {
    msg = `[WIMF] ${msg}`
    arguments.length === 2
        ? console.error(msg + "\n%o", detail)
        : console.error(msg)
}

function Dat(getter, setter) {
    return function dat(opt) {
        for (let n in opt) {
            Object.defineProperty(dat, n, {
                get: () => getter(n),
                set: val => setter(n, val)
            })
            if (! dat[n]) dat[n] = opt[n]
        }
    }
}

const ls = Dat(
    n => JSON.parse(unsafeWindow.localStorage.getItem("WIMF-" + n)),
    (n, v) => unsafeWindow.localStorage.setItem("WIMF-" + n, JSON.stringify(v))
)
const ts = Dat(
    n => GM_getValue(n),
    (n, v) => GM_setValue(n, v)
)

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

function scan(hl) {
    const op = ls.op

    const $t = $("input[type=text],textarea")
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

    const $r = $("input[type=radio],label")
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

    const $c = $("input[type=checkbox],label")
    $c.one("click.WIMF", function() {
        let $_ = $(this)
        let path = $_.path(), label
        if ($_.is("label")) {
            label = path
            $_ = $_.forWhat()
            path = $_.path()
        }
        if (! $_.is("[type=checkbox]")) return

        let f = true; for (let i in op) {
            if (op[i].type === "checkbox") {
                if (op[i].path === path){
                    f = false; break
                }
            }
        }
        if (f) op.push({ path, label, type: "checkbox" })
        ls.op = op
    })

    if (typeof hl === "function") for (let $i of [ $t, $r, $c ]) hl($i)
}

const UI = {
    init() {
        GM_addStyle(`
.WIMF {
    position: fixed;
    z-index: 1919810;
    top: 3px;
    right: 3px;
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
.WIMF-title {
    display: block;
    font-size: 12px;
    text-align: center;
    transform: scale(0.9)
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
.WIMF-button:hover {
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
`)
        $("body").after(`
<div class="WIMF">
    <div class="WIMF-main">
        <b class="WIMF-title">WhereIsMyForm</b>
        <span class="WIMF-button" name="mark 标记">🔍</span>
        <span class="WIMF-button" name="fill 填充">📃</span>
        <span class="WIMF-button" name="rset 清存">🗑️</span>
        <span class="WIMF-button" name="conf 设置">⚙️</span>
        <span class="WIMF-button" name="info 关于">ℹ️</span>
        <span class="WIMF-button" name="hide 隐藏">❌</span>
    </div>
    <div class="WIMF-text"></div>
</div>
`)
        $(".WIMF-button").on("click", function() {
            UI[this.getAttribute("name").split(" ")[0]]()
        })
    },
    text(h) {
        let $t = $(".WIMF-text")
        $t.show().html(h)
    },

    mark() {
        scan($i => $i.addClass("WIMF-mark"))
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
        UI.text(`
<b class="WIMF-title">Configuration</b> <br/>
<i>Todo... 施工中……</i>
`)
    },
    info() {
        UI.text(`
<b class="WIMF-title">Infomation</b> <br/>
<p>管理你的表单，不让他们走丢 <br/>
    <i>-- ForkKILLET</i>
</p> <br/>
<br/>
<p>华东师大二附中“创意·创新·创造”大赛 <br/>
    <i>-- 刘怀轩 东昌南校 初三2班
</p> <br/>
<br/>
<p>可用的测试页面：</p> <a href="https://www.wjx.cn/newsurveys.aspx">https://www.wjx.cn/newsurveys.aspx</a>
`)
    },
    hide() {
        $(".WIMF-main").hide()
    },
}

$(function () {
    ls({
        op: []
    })
    UI.init()
    scan()
})
