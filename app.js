"use strict";
const { useState, useEffect, useCallback, useRef } = React;
/* ---------------------------------------------------
   window.storage シム
--------------------------------------------------- */
(function setupStorage() {
    function useOfflineFallback() {
        const mem = {};
        window.storage = {
            async get(key) {
                if (!(key in mem))
                    throw new Error("not found");
                return { key, value: mem[key], shared: true };
            },
            async set(key, value) {
                mem[key] = value;
                return { key, value, shared: true };
            },
        };
        window.OKURIKEN_OFFLINE = true;
    }
    if (!window.firebase || !window.FIREBASE_CONFIG || window.FIREBASE_CONFIG.apiKey === "ここに貼り付け") {
        useOfflineFallback();
        return;
    }
    try {
        const app = firebase.apps && firebase.apps.length
            ? firebase.app()
            : firebase.initializeApp(window.FIREBASE_CONFIG);
        const db = firebase.firestore(app);
        const col = db.collection("okuriken_storage");
        window.storage = {
            async get(key) {
                const doc = await col.doc(key).get();
                if (!doc.exists)
                    throw new Error("not found");
                return { key, value: doc.data().value, shared: true };
            },
            async set(key, value) {
                await col.doc(key).set({ value, updatedAt: Date.now() });
                return { key, value, shared: true };
            },
        };
    }
    catch (e) {
        // Firebaseの初期化に失敗しても、アプリ自体は必ず起動させる
        console.error("Firebase init failed, falling back to offline mode:", e);
        useOfflineFallback();
    }
})();
/* ---------------------------------------------------
   billet — bright modern-luxury ticket-exchange app.
   Design tokens
   Color:
     app bg         #F2F2F7 (warm off-white, not pure white)
     card / panel   #FFFFFF + soft shadow (0 20px 40px rgba(0,0,0,0.04))
                    + hairline border (1px solid rgba(0,0,0,0.06))
     ink            #1C1C1E (deep gray, not pure black — softer contrast)
     secondary text rgba(28,28,30,0.6)
     muted text     rgba(28,28,30,0.42)
     faint text     rgba(28,28,30,0.28)
     brand accent   #D6336C (rose)
     brand gradient #7C3AED → #D6336C → #F97316 (logo mark + bottom-nav
                    active state only — kept as a small, deliberate accent)
     SSR pearl      #FFD9E8 → #C9E9FF → #FFF3C4 → #E8D9FF (shell/aurora)
   Type:
     Display/Body: "Plus Jakarta Sans" (geometric, rounded, international)
     Utility: "JetBrains Mono" (serial numbers — programmatic, limited-edition feel)
   Signature: tickets are solid white cards with soft depth (no heavy
   flat shadow), a dotted perforation line instead of dashed, and a
   floating white frosted-glass pill nav at the bottom. SSR tickets
   carry a rotating pearl/shell holographic border — soft prismatic
   pink, sky blue, cream gold — like real mother-of-pearl under light.
--------------------------------------------------- */
const FONT_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');";
const RARITY = {
    normal: { label: "NORMAL", short: "N", ring: "#9CA3AF", weight: 0 },
    rare: { label: "RARE", short: "R", ring: "#3B82F6", weight: 1 },
    ssr: { label: "SSR", short: "SSR", ring: "#D9B8DE", weight: 2 },
};
const PRESETS = [
    { key: "last_train", emoji: "🚃", label: "終電券", rarity: "normal" },
    { key: "4am", emoji: "🕓", label: "4時券", rarity: "rare" },
    { key: "7am", emoji: "🕖", label: "7時券", rarity: "ssr" },
    { key: "barrier", emoji: "🛡️", label: "バリア券", rarity: "rare" },
    { key: "pierce", emoji: "⚔️", label: "バリア貫通券", rarity: "ssr" },
];
const BARRIER_KEY = "barrier";
const PIERCE_KEY = "pierce";
const USERS = ["koki", "eri"];
const STARTER_PACK_DEFAULTS = [
    { key: "last_train", qty: 4 },
    { key: "4am", qty: 2 },
    { key: "7am", qty: 2 },
    { key: "barrier", qty: 2 },
    { key: "pierce", qty: 1 },
];
const ACCENTS = [
    { key: "terracotta", hex: "#C2703D" },
    { key: "sage", hex: "#5F7A5E" },
    { key: "navy", hex: "#34435E" },
    { key: "plum", hex: "#7A4869" },
    { key: "rust", hex: "#A8452F" },
    { key: "stone", hex: "#7C7267" },
];
const TABS = [
    { key: "issue", label: "Create", icon: "➕" },
    { key: "mine", label: "My Tickets", icon: "📥" },
    { key: "theirs", label: "Partner's", icon: "📤" },
    { key: "history", label: "Logs", icon: "📜" },
];
function pad(n) {
    return String(n).padStart(6, "0");
}
function fmtDate(iso) {
    if (!iso)
        return "";
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
// 端末のローカル日付を input[type=date] と同じ "YYYY-MM-DD" 形式で返す
function todayYMD() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtYMD(ymd) {
    return ymd ? ymd.replace(/-/g, "/") : "";
}
function fmtMonthDay(iso) {
    if (!iso)
        return "";
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}
// 発行した月の月末23:59:59を有効期限として返す（当月限り失効）
function monthEndISO(iso) {
    const d = new Date(iso);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    return end.toISOString();
}
function isExpired(ticket) {
    if (ticket.status !== "unused" || !ticket.expiresAt)
        return false;
    return new Date() > new Date(ticket.expiresAt);
}
// 種類（typeKey）ごとにグループ化する。順序は既存プリセットの並び優先、
// カスタム券は登場順で末尾に続く
function groupTickets(list) {
    const map = new Map();
    list.forEach((t) => {
        if (!map.has(t.typeKey)) {
            map.set(t.typeKey, { typeKey: t.typeKey, label: t.title, emoji: t.emoji, items: [] });
        }
        map.get(t.typeKey).items.push(t);
    });
    const typeOrder = PRESETS.map((p) => p.key);
    const keys = Array.from(map.keys()).sort((a, b) => {
        const ia = typeOrder.indexOf(a);
        const ib = typeOrder.indexOf(b);
        const ra = ia === -1 ? 999 : ia;
        const rb = ib === -1 ? 999 : ib;
        if (ra !== rb)
            return ra - rb;
        return a < b ? -1 : 1;
    });
    return keys.map((k) => map.get(k));
}
function haptic(ms = 15) {
    try {
        if (typeof navigator !== "undefined" && navigator.vibrate)
            navigator.vibrate(ms);
    }
    catch (e) {
        // 振動APIが無い環境では何もしない
    }
}
function uid() {
    return "tkt_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function slugify(label) {
    return ("custom_" +
        label
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "_")
            .slice(0, 20) +
        "_" +
        Math.random().toString(36).slice(2, 6));
}
/* ---------------- Ticket stub ---------------- */
function TicketStub({ ticket, onClick, compact, onDelete }) {
    const rarity = RARITY[ticket.rarity] || RARITY.normal;
    const isSSR = ticket.rarity === "ssr";
    const isRare = ticket.rarity === "rare";
    const used = ticket.status === "used";
    const invalidated = ticket.status === "invalidated";
    const expired = ticket.status === "unused" && isExpired(ticket);
    const dimmed = used || invalidated || expired;
    return (React.createElement("div", { onClick: onClick, style: {
            cursor: "pointer",
            display: "block",
            width: "100%",
        } },
        React.createElement("div", { className: `ticket-stub${isSSR ? " stub-ssr" : ""}`, style: {
                position: "relative",
                display: "flex",
                background: "#FFFFFF",
                borderRadius: 10,
                overflow: "hidden",
                boxShadow: dimmed
                    ? "0 4px 12px rgba(0,0,0,0.04)"
                    : "0 20px 40px rgba(0,0,0,0.06)",
                border: `1.5px solid ${rarity.ring}`,
                opacity: dimmed ? 0.62 : 1,
                filter: dimmed ? "grayscale(0.35)" : "none",
                transition: "transform .15s ease, box-shadow .15s ease",
            }, onMouseEnter: (e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
            }, onMouseLeave: (e) => {
                e.currentTarget.style.transform = "translateY(0)";
            } },
            isSSR && React.createElement("div", { className: "holo-sweep" }),
            onDelete && (React.createElement("button", { onClick: (e) => {
                    e.stopPropagation();
                    onDelete(ticket);
                }, title: "\u524A\u9664\u3059\u308B", style: {
                    position: "absolute",
                    top: 6,
                    right: 6,
                    zIndex: 3,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "rgba(28,28,30,0.55)",
                    color: "#ffffff",
                    border: "none",
                    fontSize: 12,
                    lineHeight: "20px",
                    padding: 0,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                } }, "\u00D7")),
            React.createElement("div", { style: {
                    flex: 1,
                    padding: compact ? "10px 12px" : "14px 14px",
                    minWidth: 0,
                    position: "relative",
                    zIndex: 1,
                } },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
                    React.createElement("span", { style: { fontSize: compact ? 20 : 26 } }, ticket.emoji),
                    React.createElement("span", { style: {
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                            fontWeight: 800,
                            fontSize: compact ? 15 : 18,
                            color: "#1C1C1E",
                            lineHeight: 1.2,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                        } }, ticket.title)),
                React.createElement("div", { style: {
                        marginTop: 6,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontSize: 11.5,
                        color: "rgba(28,28,30,0.6)",
                        display: "flex",
                        gap: 10,
                        flexWrap: "wrap",
                    } },
                    React.createElement("span", null,
                        "From: ",
                        ticket.from),
                    React.createElement("span", null,
                        "To: ",
                        ticket.to),
                    ticket.status === "unused" && !expired && ticket.expiresAt && (React.createElement("span", { style: { color: "#D97706" } },
                        "\u671F\u9650 ",
                        fmtMonthDay(ticket.expiresAt),
                        "\u307E\u3067")))),
            React.createElement("div", { style: { position: "relative", width: 0, zIndex: 1 } },
                React.createElement("div", { style: {
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: -1,
                        borderLeft: "2px dotted rgba(0,0,0,0.18)",
                    } }),
                React.createElement("div", { style: {
                        position: "absolute",
                        top: -7,
                        left: -8,
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        background: "#F2F2F7",
                    } }),
                React.createElement("div", { style: {
                        position: "absolute",
                        bottom: -7,
                        left: -8,
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        background: "#F2F2F7",
                    } })),
            React.createElement("div", { style: {
                    width: compact ? 60 : 74,
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    padding: "8px 4px",
                    background: `linear-gradient(180deg, ${rarity.ring}22, ${rarity.ring}11)`,
                    position: "relative",
                    zIndex: 1,
                } },
                React.createElement("div", { style: {
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontWeight: 700,
                        fontSize: 10,
                        letterSpacing: 1,
                        color: rarity.ring,
                        border: `1.5px solid ${rarity.ring}`,
                        borderRadius: 999,
                        padding: "1px 6px",
                    } }, rarity.short),
                React.createElement("div", { style: {
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 9,
                        color: "rgba(28,28,30,0.6)",
                        writingMode: "vertical-rl",
                        letterSpacing: 1,
                    } },
                    "No.",
                    pad(ticket.serial))),
            dimmed && (React.createElement("div", { style: {
                    position: "absolute",
                    top: "50%",
                    left: "38%",
                    transform: "translate(-50%,-50%) rotate(-16deg)",
                    border: `3px solid ${invalidated ? "#2563EB" : expired ? "#9CA3AF" : "#DC2626"}`,
                    color: invalidated ? "#2563EB" : expired ? "#9CA3AF" : "#DC2626",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontWeight: 800,
                    fontSize: compact ? 14 : 18,
                    padding: "2px 10px",
                    borderRadius: 6,
                    letterSpacing: 2,
                    zIndex: 2,
                    background: "rgba(0,0,0,0.04)",
                } }, invalidated ? "無効化" : expired ? "期限切れ" : "使用済")))));
}
/* ---------------- Detail modal ---------------- */
function TicketModal({ ticket, myName, tickets, onClose, onUse, onInvalidate, onRestore, onTransfer, onCancelUse }) {
    // 「使用する」「渡す」は確認ステップを挟み、使用日・メモを入力してから確定する
    const [mode, setMode] = useState(null);
    const [useDate, setUseDate] = useState(todayYMD());
    const [memo, setMemo] = useState("");
    useEffect(() => {
        setMode(null);
        setUseDate(todayYMD());
        setMemo("");
    }, [ticket && ticket.id]);
    if (!ticket)
        return null;
    const rarity = RARITY[ticket.rarity] || RARITY.normal;
    const isBarrierOrPierce = ticket.typeKey === BARRIER_KEY || ticket.typeKey === PIERCE_KEY;
    const expired = ticket.status === "unused" && isExpired(ticket);
    const canUse = ticket.status === "unused" && ticket.to === myName && !isBarrierOrPierce && !expired;
    const otherUser = USERS.find((u) => u !== myName);
    const canTransfer = ticket.status === "unused" && ticket.to === myName && !!otherUser && !expired;
    const canCancelUse = ticket.status === "used" && ticket.to === myName;
    const hasBarrier = tickets.some((t) => t.to === myName && t.typeKey === BARRIER_KEY && t.status === "unused");
    const hasPierce = tickets.some((t) => t.to === myName && t.typeKey === PIERCE_KEY && t.status === "unused");
    const canInvalidate = ticket.status === "used" && !ticket.invalidatedBy && ticket.from === myName && hasBarrier;
    const canRestore = ticket.status === "invalidated" && ticket.to === myName && hasPierce;
    return (React.createElement("div", { style: {
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.72)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 50,
        }, onClick: onClose },
        React.createElement("div", { onClick: (e) => e.stopPropagation(), style: {
                width: "100%",
                maxWidth: 380,
                background: "#FFFFFF",
                borderRadius: 16,
                border: `2px solid ${rarity.ring}`,
                padding: 24,
                position: "relative",
                boxShadow: "0 20px 40px rgba(0,0,0,0.08)",
            } },
            React.createElement("button", { onClick: onClose, style: {
                    position: "absolute",
                    top: 12,
                    right: 12,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "rgba(28,28,30,0.6)",
                } },
                React.createElement("span", { style: { fontSize: 16 } }, "\u2715")),
            React.createElement("div", { style: { textAlign: "center" } },
                React.createElement("div", { style: { fontSize: 46 } }, ticket.emoji),
                React.createElement("div", { style: {
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontWeight: 800,
                        fontSize: 24,
                        color: "#1C1C1E",
                        marginTop: 4,
                    } }, ticket.title),
                React.createElement("div", { style: {
                        display: "inline-block",
                        marginTop: 8,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontWeight: 700,
                        fontSize: 11,
                        letterSpacing: 1.5,
                        color: rarity.ring,
                        border: `1.5px solid ${rarity.ring}`,
                        borderRadius: 999,
                        padding: "3px 12px",
                    } }, rarity.label)),
            ticket.message && (React.createElement("div", { style: {
                    marginTop: 18,
                    background: "rgba(0,0,0,0.06)",
                    borderRadius: 10,
                    padding: 14,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: 14,
                    color: "#1C1C1E",
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                } }, ticket.message)),
            React.createElement("div", { style: {
                    marginTop: 16,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: 12.5,
                    color: "rgba(28,28,30,0.6)",
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    rowGap: 4,
                    columnGap: 10,
                } },
                React.createElement("span", { style: { opacity: 0.7 } }, "\u5DEE\u51FA\u4EBA"),
                React.createElement("span", null, ticket.from),
                React.createElement("span", { style: { opacity: 0.7 } }, "\u5B9B\u5148"),
                React.createElement("span", null, ticket.to),
                React.createElement("span", { style: { opacity: 0.7 } }, "\u767A\u884C"),
                React.createElement("span", null, fmtDate(ticket.createdAt)),
                React.createElement("span", { style: { opacity: 0.7 } }, "\u901A\u3057\u756A\u53F7"),
                React.createElement("span", { style: { fontFamily: "'JetBrains Mono', monospace" } },
                    "No.",
                    pad(ticket.serial)),
                ticket.status === "unused" && ticket.expiresAt && (React.createElement(React.Fragment, null,
                    React.createElement("span", { style: { opacity: 0.7 } }, "\u6709\u52B9\u671F\u9650"),
                    React.createElement("span", { style: { color: expired ? "#DC2626" : "#1C1C1E", fontWeight: expired ? 700 : 400 } },
                        fmtDate(ticket.expiresAt),
                        expired ? "（期限切れ）" : ""))),
                (ticket.status === "used" || ticket.status === "invalidated") && (React.createElement(React.Fragment, null,
                    React.createElement("span", { style: { opacity: 0.7 } }, "\u4F7F\u7528\u65E5"),
                    React.createElement("span", null, ticket.usedOn ? fmtYMD(ticket.usedOn) : fmtDate(ticket.usedAt)))),
                ticket.status === "invalidated" && (React.createElement(React.Fragment, null,
                    React.createElement("span", { style: { opacity: 0.7 } }, "\u7121\u52B9\u5316\u65E5"),
                    React.createElement("span", null,
                        "\uD83D\uDEE1\uFE0F ",
                        fmtDate(ticket.invalidatedAt)))),
                ticket.restoredBy && (React.createElement(React.Fragment, null,
                    React.createElement("span", { style: { opacity: 0.7 } }, "\u5FA9\u6D3B\u65E5"),
                    React.createElement("span", null,
                        "\u2694\uFE0F ",
                        fmtDate(ticket.restoredAt))))),
            canUse && !mode && (React.createElement("button", { onClick: () => setMode("use"), style: {
                    marginTop: 20,
                    width: "100%",
                    background: "#1C1C1E",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 10,
                    padding: "12px 0",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontWeight: 700,
                    fontSize: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    cursor: "pointer",
                } }, "\uD83C\uDFF7\uFE0F \u3053\u306E\u30C1\u30B1\u30C3\u30C8\u3092\u4F7F\u7528\u3059\u308B")),
            canTransfer && !mode && (React.createElement("button", { onClick: () => setMode("transfer"), style: {
                    marginTop: 10,
                    width: "100%",
                    background: "transparent",
                    color: "rgba(28,28,30,0.6)",
                    border: "1.5px solid rgba(0,0,0,0.25)",
                    borderRadius: 10,
                    padding: "11px 0",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontWeight: 700,
                    fontSize: 13.5,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    cursor: "pointer",
                } },
                "\uD83D\uDD01 ",
                otherUser,
                "\u3055\u3093\u306B\u6E21\u3059")),
            mode && (React.createElement("div", { style: {
                    marginTop: 20,
                    background: "rgba(0,0,0,0.04)",
                    borderRadius: 10,
                    padding: 14,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                } },
                React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "rgba(28,28,30,0.6)" } }, mode === "use" ? "使用日" : `${otherUser}さんに渡すときのメモ（任意・ログに残ります）`),
                mode === "use" ? (React.createElement("input", { type: "date", value: useDate, max: todayYMD(), onChange: (e) => setUseDate(e.target.value), style: {
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1.5px solid rgba(0,0,0,0.2)",
                        background: "#FFFFFF",
                        color: "#1C1C1E",
                        fontSize: 15,
                        fontFamily: "inherit",
                    } })) : (React.createElement("textarea", { value: memo, onChange: (e) => setMemo(e.target.value), placeholder: "例：今日のお礼に", rows: 2, style: {
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1.5px solid rgba(0,0,0,0.2)",
                        background: "#FFFFFF",
                        color: "#1C1C1E",
                        fontSize: 15,
                        resize: "vertical",
                        fontFamily: "inherit",
                    } })),
                React.createElement("div", { style: { display: "flex", gap: 8 } },
                    React.createElement("button", { onClick: () => setMode(null), style: {
                            flex: 1,
                            background: "transparent",
                            color: "rgba(28,28,30,0.6)",
                            border: "1.5px solid rgba(0,0,0,0.25)",
                            borderRadius: 10,
                            padding: "11px 0",
                            fontWeight: 700,
                            fontSize: 13.5,
                            cursor: "pointer",
                        } }, "やめる"),
                    React.createElement("button", { onClick: () => {
                            if (mode === "use") {
                                if (!useDate)
                                    return;
                                onUse(ticket, useDate);
                            }
                            else {
                                onTransfer(ticket, memo.trim());
                            }
                            setMode(null);
                            setMemo("");
                        }, disabled: mode === "use" && !useDate, style: {
                            flex: 2,
                            background: "#1C1C1E",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: 10,
                            padding: "12px 0",
                            fontWeight: 700,
                            fontSize: 14,
                            cursor: "pointer",
                            opacity: mode === "use" && !useDate ? 0.4 : 1,
                        } }, mode === "use" ? "🏷️ この日付で使用する" : "🔁 渡す")))),
            canInvalidate && (React.createElement("button", { onClick: () => onInvalidate(ticket), style: {
                    marginTop: 20,
                    width: "100%",
                    background: "#2563EB",
                    color: "#1C1C1E",
                    border: "none",
                    borderRadius: 10,
                    padding: "12px 0",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontWeight: 700,
                    fontSize: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    cursor: "pointer",
                } }, "\uD83D\uDEE1\uFE0F \u30D0\u30EA\u30A2\u5238\u3067\u3053\u306E\u4F7F\u7528\u3092\u7121\u52B9\u5316\u3059\u308B")),
            canRestore && (React.createElement("button", { onClick: () => onRestore(ticket), style: {
                    marginTop: 20,
                    width: "100%",
                    background: "#D6336C",
                    color: "#1C1C1E",
                    border: "none",
                    borderRadius: 10,
                    padding: "12px 0",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontWeight: 700,
                    fontSize: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    cursor: "pointer",
                } }, "\u2694\uFE0F \u30D0\u30EA\u30A2\u8CAB\u901A\u5238\u3067\u7121\u52B9\u5316\u3092\u30AD\u30E3\u30F3\u30BB\u30EB\u3059\u308B")),
            canCancelUse && (React.createElement("button", { onClick: () => onCancelUse(ticket), style: {
                    marginTop: 10,
                    width: "100%",
                    background: "transparent",
                    color: "rgba(28,28,30,0.6)",
                    border: "1.5px solid rgba(0,0,0,0.25)",
                    borderRadius: 10,
                    padding: "11px 0",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontWeight: 700,
                    fontSize: 13.5,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    cursor: "pointer",
                } }, "\u21A9\uFE0F \u4F7F\u7528\u3092\u30AD\u30E3\u30F3\u30BB\u30EB\u3059\u308B")),
            ticket.status === "used" && !canInvalidate && (React.createElement("div", { style: {
                    marginTop: 18,
                    textAlign: "center",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: 12,
                    color: "#DC2626",
                    fontWeight: 700,
                } }, "\u3053\u306E\u30C1\u30B1\u30C3\u30C8\u306F\u4F7F\u7528\u6E08\u307F\u3067\u3059")),
            ticket.status === "invalidated" && !canRestore && (React.createElement("div", { style: {
                    marginTop: 18,
                    textAlign: "center",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: 12,
                    color: "#2563EB",
                    fontWeight: 700,
                } }, "\uD83D\uDEE1\uFE0F \u3053\u306E\u4F7F\u7528\u306F\u30D0\u30EA\u30A2\u5238\u3067\u7121\u52B9\u5316\u3055\u308C\u3066\u3044\u307E\u3059")),
            expired && (React.createElement("div", { style: {
                    marginTop: 18,
                    textAlign: "center",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: 12,
                    color: "#9CA3AF",
                    fontWeight: 700,
                } }, "\u23F3 \u3053\u306E\u30C1\u30B1\u30C3\u30C8\u306F\u6709\u52B9\u671F\u9650\u5207\u308C\u3067\u3059")))));
}
/* ---------------- Empty state ---------------- */
function Empty({ text, sub }) {
    return (React.createElement("div", { style: {
            textAlign: "center",
            padding: "56px 20px",
            color: "rgba(28,28,30,0.42)",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
        } },
        React.createElement("div", { style: { fontSize: 34, marginBottom: 10 } }, "\uD83C\uDFAB"),
        React.createElement("div", { style: { fontSize: 14, fontWeight: 700, color: "rgba(28,28,30,0.42)" } }, text),
        sub && React.createElement("div", { style: { fontSize: 12.5, marginTop: 6 } }, sub)));
}
/* ---------------- Main App ---------------- */
function TicketBooth() {
    const [myName, setMyName] = useState("");
    const [gateOpen, setGateOpen] = useState(true);
    const [tickets, setTickets] = useState([]);
    const [activityLog, setActivityLog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState("issue");
    const [detail, setDetail] = useState(null);
    const [toast, setToast] = useState("");
    // issue form state
    const [presetKey, setPresetKey] = useState("last_train");
    const [rarity, setRarity] = useState("normal");
    const [message, setMessage] = useState("");
    const [issueMemo, setIssueMemo] = useState("");
    const [packMemo, setPackMemo] = useState("");
    const [to, setTo] = useState("");
    const [qty, setQty] = useState(1);
    // starter pack (bulk issue) state
    const [packQty, setPackQty] = useState(() => {
        const init = {};
        STARTER_PACK_DEFAULTS.forEach((p) => (init[p.key] = p.qty));
        return init;
    });
    // notifications
    const [notifPermission, setNotifPermission] = useState(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
    const [popupQueue, setPopupQueue] = useState([]);
    const prevTicketsRef = useRef(null);
    const showToast = (t) => {
        setToast(t);
        setTimeout(() => setToast(""), 2200);
    };
    const requestNotifPermission = async () => {
        if (typeof Notification === "undefined")
            return;
        try {
            const perm = await Notification.requestPermission();
            setNotifPermission(perm);
        }
        catch (e) {
            // 通知がサポートされていない環境では何もしない
        }
    };
    useEffect(() => {
        if (!myName) {
            prevTicketsRef.current = tickets;
            return;
        }
        const other = USERS.find((u) => u !== myName);
        const prev = prevTicketsRef.current;
        if (prev && other) {
            const prevMap = new Map(prev.map((t) => [t.id, t]));
            const newlyUsed = tickets.filter((t) => {
                if (t.to !== other || t.status !== "used")
                    return false;
                const before = prevMap.get(t.id);
                return !before || before.status !== "used";
            });
            if (newlyUsed.length > 0) {
                setPopupQueue((q) => [...q, ...newlyUsed]);
                if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                    newlyUsed.forEach((t) => {
                        try {
                            new Notification("🎫 billet", {
                                body: `${other}さんが「${t.title}」を使用しました`,
                                icon: "./icon-192.png",
                            });
                        }
                        catch (e) {
                            // 通知の生成に失敗しても致命的ではない
                        }
                    });
                }
            }
        }
        prevTicketsRef.current = tickets;
    }, [tickets, myName]);
    const load = useCallback(async (opts) => {
        const silent = opts && opts.silent;
        if (!silent)
            setLoading(true);
        try {
            const res = await window.storage.get("tickets-all", true);
            const arr = res && res.value ? JSON.parse(res.value) : [];
            setTickets(Array.isArray(arr) ? arr : []);
        }
        catch (e) {
            setTickets([]);
        }
        try {
            const logRes = await window.storage.get("activity-log", true);
            const logArr = logRes && logRes.value ? JSON.parse(logRes.value) : [];
            setActivityLog(Array.isArray(logArr) ? logArr : []);
        }
        catch (e) {
            setActivityLog([]);
        }
        if (!silent)
            setLoading(false);
    }, []);
    useEffect(() => {
        load();
        const timer = setInterval(() => load({ silent: true }), 4000);
        return () => clearInterval(timer);
    }, [load]);
    const persist = async (arr) => {
        setTickets(arr);
        try {
            await window.storage.set("tickets-all", JSON.stringify(arr), true);
        }
        catch (e) {
            showToast("保存に失敗しました");
        }
    };
    const persistLog = async (arr) => {
        setActivityLog(arr);
        try {
            await window.storage.set("activity-log", JSON.stringify(arr), true);
        }
        catch (e) {
            // ログの保存に失敗しても操作自体は成功しているので致命的ではない
        }
    };
    // ticket の操作（発行・譲渡・使用・キャンセル・無効化・復活）を履歴ログに記録する。
    // extra には使用日（usedOn）・メモ（memo）・発行枚数（count）・差出人/宛先などを入れる。
    // ログはチケット自体の状態と切り離しているので、使用キャンセルで
    // チケットが未使用状態に戻っても履歴には残る
    const logEvent = (ticket, action, extra) => (Object.assign({
        id: uid(),
        ticketId: ticket.id,
        title: ticket.title,
        emoji: ticket.emoji,
        action,
        actor: myName,
        at: new Date().toISOString(),
    }, extra));
    const handleGate = (name) => {
        setMyName(name);
        setTo(USERS.find((u) => u !== name) || "");
        setGateOpen(false);
    };
    const issueTicket = async () => {
        const dest = to.trim();
        if (!dest) {
            showToast("宛先を入力してください");
            return;
        }
        const n = Math.max(1, Math.min(50, Number(qty) || 1));
        const item = PRESETS.find((c) => c.key === presetKey) || PRESETS[0];
        const title = item.label;
        const emoji = item.emoji;
        const typeKey = item.key;
        const base = tickets.length;
        const now = new Date().toISOString();
        const newTickets = Array.from({ length: n }).map((_, i) => ({
            id: uid(),
            title,
            emoji,
            typeKey,
            rarity,
            message: message.trim(),
            from: myName,
            to: dest,
            status: "unused",
            createdAt: now,
            expiresAt: monthEndISO(now),
            usedAt: null,
            invalidatedBy: null,
            invalidatedAt: null,
            restoredBy: null,
            restoredAt: null,
            serial: base + i + 1,
        }));
        const next = [...tickets, ...newTickets];
        await persist(next);
        await persistLog([...activityLog, logEvent(newTickets[0], "issued", { count: n, from: myName, to: dest, memo: issueMemo.trim() })]);
        showToast(`「${title}」を${dest}さんに${n}枚発行しました`);
        setMessage("");
        setIssueMemo("");
        setTo("");
        setQty(1);
    };
    const markUsed = async (ticket, usedOn) => {
        const day = usedOn || todayYMD();
        const next = tickets.map((t) => t.id === ticket.id ? Object.assign(Object.assign({}, t), { status: "used", usedAt: new Date().toISOString(), usedOn: day }) : t);
        await persist(next);
        await persistLog([...activityLog, logEvent(ticket, "used", { usedOn: day })]);
        setDetail(null);
        showToast("チケットを使用しました");
    };
    const invalidateTicket = async (target) => {
        const barrierTicket = tickets.find((t) => t.to === myName && t.typeKey === BARRIER_KEY && t.status === "unused");
        if (!barrierTicket) {
            showToast("バリア券を持っていません");
            return;
        }
        const now = new Date().toISOString();
        const next = tickets.map((t) => {
            if (t.id === barrierTicket.id) {
                return Object.assign(Object.assign({}, t), { status: "used", usedAt: now });
            }
            if (t.id === target.id) {
                return Object.assign(Object.assign({}, t), { status: "invalidated", invalidatedBy: barrierTicket.id, invalidatedAt: now });
            }
            return t;
        });
        await persist(next);
        await persistLog([...activityLog, logEvent(target, "invalidated")]);
        setDetail(next.find((t) => t.id === target.id));
        showToast(`🛡️「${target.title}」の使用を無効化しました`);
    };
    const restoreTicket = async (target) => {
        const pierceTicket = tickets.find((t) => t.to === myName && t.typeKey === PIERCE_KEY && t.status === "unused");
        if (!pierceTicket) {
            showToast("バリア貫通券を持っていません");
            return;
        }
        const now = new Date().toISOString();
        const next = tickets.map((t) => {
            if (t.id === pierceTicket.id) {
                return Object.assign(Object.assign({}, t), { status: "used", usedAt: now });
            }
            if (t.id === target.id) {
                return Object.assign(Object.assign({}, t), { status: "used", restoredBy: pierceTicket.id, restoredAt: now });
            }
            return t;
        });
        await persist(next);
        await persistLog([...activityLog, logEvent(target, "restored")]);
        setDetail(next.find((t) => t.id === target.id));
        showToast(`⚔️「${target.title}」の無効化をキャンセルしました`);
    };
    const transferTicket = async (ticket, memo) => {
        const other = USERS.find((u) => u !== myName);
        if (!other)
            return;
        const next = tickets.map((t) => (t.id === ticket.id ? Object.assign(Object.assign({}, t), { to: other }) : t));
        await persist(next);
        await persistLog([...activityLog, logEvent(ticket, "transferred", { from: myName, to: other, memo: memo || "" })]);
        setDetail(next.find((t) => t.id === ticket.id));
        showToast(`🔁「${ticket.title}」を${other}さんに渡しました`);
    };
    const deleteTicket = async (ticket) => {
        const next = tickets.filter((t) => t.id !== ticket.id);
        await persist(next);
        const nextLog = activityLog.filter((e) => e.ticketId !== ticket.id);
        if (nextLog.length !== activityLog.length)
            await persistLog(nextLog);
        if (detail && detail.id === ticket.id)
            setDetail(null);
        showToast(`🗑️「${ticket.title}」を削除しました`);
    };
    const cancelUse = async (ticket) => {
        const next = tickets.map((t) => t.id === ticket.id
            ? Object.assign(Object.assign({}, t), { status: "unused", usedAt: null, usedOn: null, invalidatedBy: null, invalidatedAt: null, restoredBy: null, restoredAt: null }) : t);
        await persist(next);
        await persistLog([...activityLog, logEvent(ticket, "cancelled")]);
        setDetail(next.find((t) => t.id === ticket.id));
        showToast(`↩️「${ticket.title}」の使用をキャンセルしました`);
    };
    const issueStarterPack = async () => {
        const dest = to.trim();
        if (!dest) {
            showToast("宛先を選んでください");
            return;
        }
        const base = tickets.length;
        const now = new Date().toISOString();
        let count = 0;
        const newTickets = [];
        STARTER_PACK_DEFAULTS.forEach(({ key }) => {
            const item = PRESETS.find((p) => p.key === key);
            const qtyForKey = Math.max(0, Math.min(50, Number(packQty[key]) || 0));
            if (!item || qtyForKey === 0)
                return;
            for (let i = 0; i < qtyForKey; i++) {
                newTickets.push({
                    id: uid(),
                    title: item.label,
                    emoji: item.emoji,
                    typeKey: item.key,
                    rarity: item.rarity,
                    accent: ACCENTS[0].hex,
                    message: "",
                    from: myName,
                    to: dest,
                    status: "unused",
                    createdAt: now,
                    expiresAt: monthEndISO(now),
                    usedAt: null,
                    invalidatedBy: null,
                    invalidatedAt: null,
                    restoredBy: null,
                    restoredAt: null,
                    serial: base + (++count),
                });
            }
        });
        if (newTickets.length === 0) {
            showToast("枚数を1枚以上にしてください");
            return;
        }
        const next = [...tickets, ...newTickets];
        await persist(next);
        await persistLog([...activityLog, logEvent(Object.assign(Object.assign({}, newTickets[0]), { title: "スターターセット", emoji: "🎁" }), "issued", { count: newTickets.length, from: myName, to: dest, memo: packMemo.trim() })]);
        setPackMemo("");
        showToast(`🎁 スターターセット（${newTickets.length}枚）を${dest}さんに発行しました`);
    };
    const sortByStatusThenDate = (a, b) => {
        const rank = (t) => (t.status === "unused" && !isExpired(t) ? 0 : 1);
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb)
            return ra - rb;
        return a.createdAt < b.createdAt ? 1 : -1;
    };
    const otherUser = USERS.find((u) => u !== myName) || null;
    const mine = tickets.filter((t) => t.to === myName).sort(sortByStatusThenDate);
    const theirs = tickets.filter((t) => t.to === otherUser).sort(sortByStatusThenDate);
    const ticketById = new Map(tickets.map((t) => [t.id, t]));
    const historyItems = activityLog
        .filter((e) => {
        const t = ticketById.get(e.ticketId);
        // 譲渡で券の差出人・宛先が両方とも相手になっても、自分が関わった操作は残す
        return t && (t.to === myName || t.from === myName || e.actor === myName || e.to === myName);
    })
        .sort((a, b) => (a.at < b.at ? 1 : -1));
    /* ---------- name gate ---------- */
    if (gateOpen) {
        return (React.createElement("div", { style: {
                minHeight: "100vh",
                background: "#F2F2F7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
            } },
            React.createElement("style", null, FONT_IMPORT),
            window.OKURIKEN_OFFLINE && (React.createElement("div", { style: {
                    position: "fixed", top: 0, left: 0, right: 0,
                    background: "#DC2626", color: "#fff", textAlign: "center",
                    fontSize: 11.5, padding: "6px 10px", zIndex: 100,
                } }, "\u26A0\uFE0F Firebase\u672A\u8A2D\u5B9A\u306E\u305F\u3081\u3001\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u3060\u3051\u306E\u4E00\u6642\u4FDD\u5B58\u306B\u306A\u3063\u3066\u3044\u307E\u3059\uFF08README\u53C2\u7167\uFF09")),
            React.createElement("div", { style: {
                    width: "100%",
                    maxWidth: 340,
                    background: "#FFFFFF",
                    borderRadius: 16,
                    padding: 30,
                    textAlign: "center",
                    boxShadow: "0 20px 40px rgba(0,0,0,0.04)",
                    border: "1px solid rgba(0,0,0,0.06)",
                } },
                React.createElement("div", { style: {
                        width: 56,
                        height: 56,
                        borderRadius: 16,
                        margin: "0 auto",
                        background: "linear-gradient(135deg, #7C3AED, #D6336C, #F97316)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 8px 20px rgba(214,51,108,0.35)",
                    } },
                    React.createElement("span", { style: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 26, color: "#ffffff" } }, "b")),
                React.createElement("div", { style: {
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontWeight: 800,
                        fontSize: 28,
                        color: "#1C1C1E",
                        marginTop: 14,
                        letterSpacing: -0.5,
                    } }, "billet"),
                React.createElement("div", { style: { fontSize: 12.5, color: "rgba(28,28,30,0.6)", marginTop: 4 } }, "\u6C17\u6301\u3061\u3092\u8D08\u308D\u3046\u3002"),
                React.createElement("div", { style: { marginTop: 24, textAlign: "left" } },
                    React.createElement("label", { style: {
                            fontSize: 12,
                            fontWeight: 700,
                            color: "rgba(28,28,30,0.6)",
                            display: "block",
                            marginBottom: 10,
                        } }, "\u3042\u306A\u305F\u306F\u3069\u3061\u3089\uFF1F"),
                    React.createElement("div", { style: { display: "flex", gap: 10 } }, USERS.map((u) => (React.createElement("button", { key: u, onClick: () => handleGate(u), style: {
                            flex: 1,
                            background: "#1C1C1E",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: 10,
                            padding: "14px 0",
                            fontWeight: 700,
                            fontSize: 15,
                            cursor: "pointer",
                            textTransform: "capitalize",
                        } }, u))))),
                React.createElement("div", { style: { fontSize: 10.5, color: "rgba(28,28,30,0.42)", marginTop: 16 } }, "\u203B\u9078\u3093\u3060\u540D\u524D\u304C\u300C\u5DEE\u51FA\u4EBA\u30FB\u5B9B\u5148\u300D\u3068\u3057\u3066\u4F7F\u308F\u308C\u307E\u3059\u3002"))));
    }
    return (React.createElement("div", { style: {
            minHeight: "100vh",
            background: "#F2F2F7",
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            paddingBottom: "calc(110px + env(safe-area-inset-bottom, 0px))",
        } },
        React.createElement("style", null, `
        ${FONT_IMPORT}
        .stub-ssr { position:relative; }
        .holo-sweep {
          position:absolute; inset:0; z-index:0;
          background: linear-gradient(115deg,
            transparent 20%, rgba(255,255,255,0) 35%,
            rgba(255,214,232,0.55) 42%, rgba(201,233,255,0.55) 50%,
            rgba(255,243,196,0.55) 58%, rgba(232,217,255,0.45) 66%, transparent 78%);
          background-size: 250% 250%;
          background-position: 0% 0%;
          opacity: 0.95;
          transition: background-position .6s ease;
          pointer-events:none;
        }
        .ticket-stub:hover .holo-sweep { background-position: 100% 100%; }

        @keyframes burnAway {
          0% { transform: scale(1); opacity: 1; filter: brightness(1); }
          40% { transform: scale(1.04); opacity: 1; filter: brightness(1.3); }
          100% { transform: scale(0.7); opacity: 0; filter: brightness(1.6) blur(2px); }
        }
        .burning { animation: burnAway 0.45s ease-in forwards; }

        @keyframes sparkPop {
          0% { transform: translate(0,0) scale(0.6); opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)) scale(0); opacity: 0; }
        }
        .spark { animation: sparkPop 0.5s ease-out forwards; }

        @media (prefers-reduced-motion: reduce) {
          .holo-sweep { transition: none; }
          .burning { animation: none; }
          .spark { animation: none; }
        }
        ::selection { background: #D6336C; color:#ffffff; }
      `),
        window.OKURIKEN_OFFLINE && (React.createElement("div", { style: { background: "#DC2626", color: "#fff", textAlign: "center", fontSize: 11.5, padding: "6px 10px" } }, "\u26A0\uFE0F Firebase\u672A\u8A2D\u5B9A\u306E\u305F\u3081\u3001\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u3060\u3051\u306E\u4E00\u6642\u4FDD\u5B58\u306B\u306A\u3063\u3066\u3044\u307E\u3059\uFF08README\u53C2\u7167\uFF09")),
        React.createElement("div", { style: {
                padding: "22px 18px 14px",
                paddingTop: "calc(22px + env(safe-area-inset-top, 0px) + 5mm)",
                textAlign: "center",
                position: "relative",
            } },
            React.createElement("div", { style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                } },
                React.createElement("div", { style: {
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        background: "linear-gradient(135deg, #7C3AED, #D6336C, #F97316)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                    } },
                    React.createElement("span", { style: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 14, color: "#ffffff" } }, "b")),
                React.createElement("span", { style: {
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontWeight: 800,
                        fontSize: 22,
                        color: "#1C1C1E",
                        letterSpacing: -0.5,
                    } }, "billet")),
            React.createElement("div", { style: { fontSize: 11.5, color: "rgba(28,28,30,0.42)", marginTop: 4 } }, "\u6C17\u6301\u3061\u3092\u8D08\u308D\u3046\u3002"),
            React.createElement("div", { style: {
                    display: "flex",
                    justifyContent: "center",
                    gap: 8,
                    marginTop: 8,
                } },
                React.createElement("span", { style: {
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: "#3B82F6",
                        border: "1.5px solid #3B82F6",
                        borderRadius: 999,
                        padding: "2px 9px",
                        background: "rgba(59,130,246,0.1)",
                    } },
                    "\uD83D\uDEE1\uFE0F ",
                    mine.filter((t) => t.typeKey === BARRIER_KEY && t.status === "unused").length),
                React.createElement("span", { style: {
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: "#D6336C",
                        border: "1.5px solid #D6336C",
                        borderRadius: 999,
                        padding: "2px 9px",
                        background: "rgba(214,51,108,0.1)",
                    } },
                    "\u2694\uFE0F ",
                    mine.filter((t) => t.typeKey === PIERCE_KEY && t.status === "unused").length)),
            React.createElement("div", { style: {
                    position: "absolute",
                    top: "calc(20px + env(safe-area-inset-top, 0px) + 5mm)",
                    right: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                } },
                React.createElement("button", { onClick: load, title: "\u66F4\u65B0", style: {
                        background: "rgba(0,0,0,0.05)",
                        border: "none",
                        borderRadius: 8,
                        padding: 6,
                        cursor: "pointer",
                        color: "rgba(28,28,30,0.42)",
                        display: "flex",
                    } },
                    React.createElement("span", { style: { fontSize: 14 } }, "\uD83D\uDD04")),
                notifPermission !== "unsupported" && notifPermission !== "granted" && (React.createElement("button", { onClick: requestNotifPermission, title: "\u901A\u77E5\u3092\u6709\u52B9\u306B\u3059\u308B", style: {
                        background: "rgba(0,0,0,0.05)",
                        border: "none",
                        borderRadius: 8,
                        padding: 6,
                        cursor: "pointer",
                        color: "rgba(28,28,30,0.42)",
                        display: "flex",
                        fontSize: 14,
                    } }, "\uD83D\uDD14")),
                React.createElement("button", { onClick: () => setGateOpen(true), style: {
                        background: "rgba(0,0,0,0.05)",
                        border: "none",
                        borderRadius: 999,
                        padding: "6px 10px",
                        cursor: "pointer",
                        color: "rgba(28,28,30,0.42)",
                        fontSize: 11.5,
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                    } },
                    React.createElement("span", { style: { fontSize: 12 } }, "\uD83D\uDC64"),
                    " ",
                    myName))),
        React.createElement("div", { style: {
                position: "fixed",
                left: "50%",
                bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
                transform: "translateX(-50%)",
                zIndex: 40,
                display: "flex",
                gap: 2,
                background: "rgba(255,255,255,0.8)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(0,0,0,0.06)",
                borderRadius: 999,
                padding: 6,
                boxShadow: "0 12px 32px rgba(0,0,0,0.1)",
            } }, TABS.map((w) => {
            const active = tab === w.key;
            const count = w.key === "mine"
                ? mine.filter((t) => t.status === "unused").length
                : 0;
            return (React.createElement("button", { key: w.key, onClick: () => {
                    haptic();
                    setTab(w.key);
                }, style: {
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    width: 68,
                    padding: "8px 4px",
                    borderRadius: 999,
                    border: "none",
                    cursor: "pointer",
                    background: active
                        ? "linear-gradient(135deg, #7C3AED, #D6336C, #F97316)"
                        : "transparent",
                    color: active ? "#ffffff" : "rgba(28,28,30,0.5)",
                    transition: "background .2s ease, color .2s ease",
                } },
                React.createElement("span", { style: { fontSize: 16 } }, w.icon),
                React.createElement("span", { style: { fontSize: 9, fontWeight: 700, whiteSpace: "nowrap" } }, w.label),
                count > 0 && (React.createElement("span", { style: {
                        position: "absolute",
                        top: 2,
                        right: 6,
                        background: "#DC2626",
                        color: "#fff",
                        borderRadius: 999,
                        fontSize: 8,
                        minWidth: 14,
                        height: 14,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "'JetBrains Mono', monospace",
                    } }, count))));
        })),
        React.createElement("div", { style: { padding: "0 14px" } },
            React.createElement("div", { style: {
                    maxWidth: 480,
                    margin: "0 auto",
                    background: "#FFFFFF",
                    borderRadius: 20,
                    border: "1px solid rgba(0,0,0,0.06)",
                    boxShadow: "0 20px 40px rgba(0,0,0,0.04)",
                    padding: 18,
                    minHeight: 300,
                } },
                tab === "issue" && (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } },
                    React.createElement("div", null,
                        React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "rgba(28,28,30,0.42)", marginBottom: 8 } }, "\u5238\u306E\u7A2E\u985E"),
                        React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 8 } }, PRESETS.map((p) => (React.createElement("div", { key: p.key, onClick: () => {
                                setPresetKey(p.key);
                                if (p.rarity)
                                    setRarity(p.rarity);
                            }, style: {
                                position: "relative",
                                border: presetKey === p.key
                                    ? "2px solid #D6336C"
                                    : "1.5px solid rgba(0,0,0,0.15)",
                                background: presetKey === p.key
                                    ? "rgba(214,51,108,0.12)"
                                    : "transparent",
                                color: "#1C1C1E",
                                borderRadius: 10,
                                padding: "8px 12px",
                                fontSize: 13,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                            } },
                            React.createElement("span", null, p.emoji),
                            React.createElement("span", null, p.label)))))),
                    React.createElement("div", null,
                        React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "rgba(28,28,30,0.42)", marginBottom: 8 } }, "\u30EC\u30A2\u5EA6"),
                        React.createElement("div", { style: { display: "flex", gap: 8 } }, Object.entries(RARITY).map(([key, r]) => (React.createElement("button", { key: key, onClick: () => setRarity(key), style: {
                                flex: 1,
                                border: rarity === key ? `2px solid ${r.ring}` : "1.5px solid rgba(0,0,0,0.15)",
                                background: rarity === key ? `${r.ring}22` : "transparent",
                                color: rarity === key ? r.ring : "rgba(28,28,30,0.42)",
                                borderRadius: 10,
                                padding: "10px 4px",
                                fontWeight: 800,
                                fontSize: 12,
                                letterSpacing: 1,
                                cursor: "pointer",
                            } }, r.label))))),
                    React.createElement("div", null,
                        React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "rgba(28,28,30,0.42)", marginBottom: 8 } }, "\u5B9B\u5148"),
                        React.createElement("div", { style: { display: "flex", gap: 8 } }, USERS.map((u) => {
                            const isSelf = u === myName;
                            const active = to === u;
                            return (React.createElement("button", { key: u, disabled: isSelf, onClick: () => setTo(u), style: {
                                    flex: 1,
                                    border: active ? "2px solid #D6336C" : "1.5px solid rgba(0,0,0,0.15)",
                                    background: active ? "rgba(214,51,108,0.12)" : "transparent",
                                    color: isSelf ? "rgba(28,28,30,0.28)" : "#1C1C1E",
                                    borderRadius: 10,
                                    padding: "10px 0",
                                    fontSize: 13.5,
                                    fontWeight: 700,
                                    textTransform: "capitalize",
                                    cursor: isSelf ? "not-allowed" : "pointer",
                                    opacity: isSelf ? 0.5 : 1,
                                } },
                                u,
                                isSelf && React.createElement("span", { style: { fontSize: 10, fontWeight: 400 } }, "\uFF08\u81EA\u5206\uFF09")));
                        }))),
                    React.createElement("div", null,
                        React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "rgba(28,28,30,0.42)", marginBottom: 8 } }, "\u30E1\u30C3\u30BB\u30FC\u30B8\uFF08\u4EFB\u610F\uFF09"),
                        React.createElement("textarea", { value: message, onChange: (e) => setMessage(e.target.value), placeholder: "\u3072\u3068\u3053\u3068\u30E1\u30C3\u30BB\u30FC\u30B8", rows: 3, style: {
                                width: "100%",
                                boxSizing: "border-box",
                                padding: "10px 12px",
                                borderRadius: 8,
                                border: "1.5px solid rgba(0,0,0,0.2)",
                                background: "rgba(0,0,0,0.05)",
                                color: "#1C1C1E",
                                fontSize: 13.5,
                                resize: "vertical",
                                fontFamily: "inherit",
                            } })),
                    React.createElement("div", null,
                        React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "rgba(28,28,30,0.42)", marginBottom: 8 } }, "メモ（任意・ログに残ります）"),
                        React.createElement("textarea", { value: issueMemo, onChange: (e) => setIssueMemo(e.target.value), placeholder: "例：記念日の追加分", rows: 2, style: {
                                width: "100%",
                                boxSizing: "border-box",
                                padding: "10px 12px",
                                borderRadius: 8,
                                border: "1.5px solid rgba(0,0,0,0.2)",
                                background: "rgba(0,0,0,0.05)",
                                color: "#1C1C1E",
                                fontSize: 13.5,
                                resize: "vertical",
                                fontFamily: "inherit",
                            } })),
                    React.createElement("div", null,
                        React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "rgba(28,28,30,0.42)", marginBottom: 8 } }, "\u679A\u6570"),
                        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12 } },
                            React.createElement("button", { onClick: () => setQty((q) => Math.max(1, q - 1)), style: {
                                    width: 34,
                                    height: 34,
                                    borderRadius: 8,
                                    border: "1.5px solid rgba(0,0,0,0.2)",
                                    background: "rgba(0,0,0,0.05)",
                                    color: "#1C1C1E",
                                    fontSize: 18,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                } }, "\u2212"),
                            React.createElement("div", { style: {
                                    minWidth: 46,
                                    textAlign: "center",
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: 18,
                                    fontWeight: 700,
                                    color: "#1C1C1E",
                                } },
                                qty,
                                "\u679A"),
                            React.createElement("button", { onClick: () => setQty((q) => Math.min(50, q + 1)), style: {
                                    width: 34,
                                    height: 34,
                                    borderRadius: 8,
                                    border: "1.5px solid rgba(0,0,0,0.2)",
                                    background: "rgba(0,0,0,0.05)",
                                    color: "#1C1C1E",
                                    fontSize: 18,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                } }, "\uFF0B"),
                            React.createElement("span", { style: { fontSize: 11, color: "rgba(28,28,30,0.42)" } },
                                "\u540C\u3058\u5238\u3092",
                                qty > 1 ? `${qty}枚まとめて` : "",
                                "\u767A\u884C\u3067\u304D\u307E\u3059"))),
                    React.createElement("div", null,
                        React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "rgba(28,28,30,0.42)", marginBottom: 8 } }, "\u30D7\u30EC\u30D3\u30E5\u30FC"),
                        React.createElement(TicketStub, { ticket: {
                                emoji: (PRESETS.find((c) => c.key === presetKey) || PRESETS[0]).emoji,
                                title: (PRESETS.find((c) => c.key === presetKey) || PRESETS[0]).label,
                                rarity,
                                from: myName,
                                to: to || "（宛先）",
                                status: "unused",
                                serial: tickets.length + 1,
                            }, onClick: () => { } })),
                    React.createElement("button", { onClick: issueTicket, style: {
                            background: "#D6336C",
                            color: "#1C1C1E",
                            border: "none",
                            borderRadius: 10,
                            padding: "13px 0",
                            fontWeight: 800,
                            fontSize: 14.5,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                        } },
                        "\uD83C\uDFAB ",
                        qty > 1 ? `${qty}枚まとめて発行する` : "発行する"),
                    React.createElement("div", { style: {
                            marginTop: 4,
                            borderTop: "1px dashed rgba(0,0,0,0.15)",
                            paddingTop: 16,
                        } },
                        React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "rgba(28,28,30,0.42)", marginBottom: 10 } }, "\uD83C\uDF81 \u30B9\u30BF\u30FC\u30BF\u30FC\u30BB\u30C3\u30C8\u3092\u4E00\u62EC\u767A\u884C"),
                        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 } }, STARTER_PACK_DEFAULTS.map(({ key }) => {
                            const item = PRESETS.find((p) => p.key === key);
                            if (!item)
                                return null;
                            const val = packQty[key] || 0;
                            return (React.createElement("div", { key: key, style: {
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 8,
                                } },
                                React.createElement("span", { style: { fontSize: 13, color: "#1C1C1E", display: "flex", alignItems: "center", gap: 6 } },
                                    React.createElement("span", null, item.emoji),
                                    React.createElement("span", null, item.label)),
                                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
                                    React.createElement("button", { onClick: () => setPackQty((p) => (Object.assign(Object.assign({}, p), { [key]: Math.max(0, (p[key] || 0) - 1) }))), style: {
                                            width: 26,
                                            height: 26,
                                            borderRadius: 6,
                                            border: "1.5px solid rgba(0,0,0,0.2)",
                                            background: "rgba(0,0,0,0.05)",
                                            color: "#1C1C1E",
                                            fontSize: 14,
                                            fontWeight: 700,
                                            cursor: "pointer",
                                        } }, "\u2212"),
                                    React.createElement("span", { style: {
                                            minWidth: 24,
                                            textAlign: "center",
                                            fontFamily: "'JetBrains Mono', monospace",
                                            fontSize: 13,
                                            color: "#1C1C1E",
                                        } }, val),
                                    React.createElement("button", { onClick: () => setPackQty((p) => (Object.assign(Object.assign({}, p), { [key]: Math.min(50, (p[key] || 0) + 1) }))), style: {
                                            width: 26,
                                            height: 26,
                                            borderRadius: 6,
                                            border: "1.5px solid rgba(0,0,0,0.2)",
                                            background: "rgba(0,0,0,0.05)",
                                            color: "#1C1C1E",
                                            fontSize: 14,
                                            fontWeight: 700,
                                            cursor: "pointer",
                                        } }, "\uFF0B"))));
                        })),
                        React.createElement("div", { style: { marginBottom: 10 } },
                            React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: "rgba(28,28,30,0.42)", marginBottom: 8 } }, "メモ（任意・ログに残ります）"),
                            React.createElement("textarea", { value: packMemo, onChange: (e) => setPackMemo(e.target.value), placeholder: "ログ用のメモ（例：今月分）", rows: 2, style: {
                                    width: "100%",
                                    boxSizing: "border-box",
                                    padding: "10px 12px",
                                    borderRadius: 8,
                                    border: "1.5px solid rgba(0,0,0,0.2)",
                                    background: "rgba(0,0,0,0.05)",
                                    color: "#1C1C1E",
                                    fontSize: 13.5,
                                    resize: "vertical",
                                    fontFamily: "inherit",
                                } })),
                        React.createElement("div", { style: { fontSize: 11, color: "rgba(28,28,30,0.42)", marginBottom: 10 } }, "\u5B9B\u5148\u306F\u4E0A\u306E\u300C\u5B9B\u5148\u300D\u6B04\u3067\u9078\u3093\u3060\u76F8\u624B\u306B\u306A\u308A\u307E\u3059"),
                        React.createElement("button", { onClick: issueStarterPack, style: {
                                width: "100%",
                                background: "transparent",
                                color: "#D6336C",
                                border: "1.5px solid #D6336C",
                                borderRadius: 10,
                                padding: "12px 0",
                                fontWeight: 800,
                                fontSize: 13.5,
                                cursor: "pointer",
                            } },
                            "\uD83C\uDF81 \u30BB\u30C3\u30C8\u3067\u4E00\u62EC\u767A\u884C\uFF08",
                            Object.values(packQty).reduce((a, b) => a + (Number(b) || 0), 0),
                            "\u679A\uFF09")))),
                tab === "mine" && (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } }, loading ? (React.createElement(Empty, { text: "\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026" })) : mine.length === 0 ? (React.createElement(Empty, { text: "\u307E\u3060\u81EA\u5206\u306E\u5238\u306F\u3042\u308A\u307E\u305B\u3093", sub: "\u8AB0\u304B\u304C\u5238\u3092\u8D08\u3063\u3066\u304F\u308C\u308B\u3068\u3053\u3053\u306B\u4E26\u3073\u307E\u3059" })) : (groupTickets(mine).map((group, gi) => (React.createElement("div", { key: group.typeKey },
                    React.createElement("div", { style: {
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            margin: gi === 0 ? "0 0 8px" : "16px 0 8px",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "rgba(28,28,30,0.42)",
                        } },
                        React.createElement("span", null, group.emoji),
                        React.createElement("span", null, group.label),
                        React.createElement("span", { style: { opacity: 0.6 } },
                            "\uFF08",
                            group.items.length,
                            "\uFF09")),
                    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } }, group.items.map((t) => (React.createElement(TicketStub, { key: t.id, ticket: t, onClick: () => setDetail(t), onDelete: deleteTicket })))))))))),
                tab === "theirs" && (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } }, loading ? (React.createElement(Empty, { text: "\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026" })) : theirs.length === 0 ? (React.createElement(Empty, { text: "\u307E\u3060\u76F8\u624B\u306E\u5238\u306F\u3042\u308A\u307E\u305B\u3093", sub: "Create\u30BF\u30D6\u304B\u3089\u5238\u3092\u8D08\u3063\u3066\u307F\u307E\u3057\u3087\u3046" })) : (groupTickets(theirs).map((group, gi) => (React.createElement("div", { key: group.typeKey },
                    React.createElement("div", { style: {
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            margin: gi === 0 ? "0 0 8px" : "16px 0 8px",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "rgba(28,28,30,0.42)",
                        } },
                        React.createElement("span", null, group.emoji),
                        React.createElement("span", null, group.label),
                        React.createElement("span", { style: { opacity: 0.6 } },
                            "\uFF08",
                            group.items.length,
                            "\uFF09")),
                    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } }, group.items.map((t) => (React.createElement(TicketStub, { key: t.id, ticket: t, onClick: () => setDetail(t) })))))))))),
                tab === "history" && (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, loading ? (React.createElement(Empty, { text: "\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026" })) : historyItems.length === 0 ? (React.createElement(Empty, { text: "履歴はまだありません", sub: "発行・譲渡・使用したチケットがここに記録されます" })) : (historyItems.map((e) => {
                    const t = ticketById.get(e.ticketId);
                    const badge = {
                        invalidated: { label: "無効化", color: "#2563EB" },
                        restored: { label: "復活", color: "#D6336C" },
                        cancelled: { label: "キャンセル", color: "rgba(28,28,30,0.42)" },
                        used: { label: "使用", color: "#1C1C1E" },
                        issued: { label: e.count > 1 ? `発行 ${e.count}枚` : "発行", color: "#16A34A" },
                        transferred: { label: "譲渡", color: "#7C3AED" },
                    }[e.action];
                    return (React.createElement("div", { key: e.id, onClick: () => t && setDetail(t), style: {
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            background: "rgba(0,0,0,0.04)",
                            borderRadius: 8,
                            padding: "10px 12px",
                            cursor: t ? "pointer" : "default",
                        } },
                        React.createElement("span", { style: { fontSize: 18 } }, e.emoji),
                        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                            React.createElement("div", { style: { color: "#1C1C1E", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 } },
                                e.title,
                                badge && (React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: badge.color, border: `1px solid ${badge.color}`, borderRadius: 4, padding: "0 4px" } }, badge.label))),
                            React.createElement("div", { style: { color: "rgba(28,28,30,0.42)", fontSize: 11 } },
                                e.from && e.to ? `${e.from} → ${e.to}` : t ? `${t.from} → ${t.to}` : e.actor,
                                " \u30FB ",
                                e.usedOn ? `使用日 ${fmtYMD(e.usedOn)}` : fmtDate(e.at)),
                            e.memo && (React.createElement("div", { style: { color: "rgba(28,28,30,0.6)", fontSize: 12, marginTop: 2, whiteSpace: "pre-wrap", wordBreak: "break-word" } },
                                "📝 ",
                                e.memo))),
                        React.createElement("span", { style: { fontSize: 14, color: "rgba(28,28,30,0.42)" } }, "\u203A")));
                })))))),
        React.createElement(TicketModal, { ticket: detail, myName: myName, tickets: tickets, onClose: () => setDetail(null), onUse: markUsed, onInvalidate: invalidateTicket, onRestore: restoreTicket, onTransfer: transferTicket, onCancelUse: cancelUse }),
        toast && (React.createElement("div", { style: {
                position: "fixed",
                bottom: 20,
                left: "50%",
                transform: "translateX(-50%)",
                background: "#1C1C1E",
                color: "#ffffff",
                padding: "10px 18px",
                borderRadius: 999,
                fontSize: 12.5,
                display: "flex",
                alignItems: "center",
                gap: 8,
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                zIndex: 60,
            } },
            "\u2705 ",
            toast)),
        popupQueue.length > 0 && (React.createElement("div", { style: {
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.75)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
                zIndex: 80,
            }, onClick: () => setPopupQueue((q) => q.slice(1)) },
            React.createElement("div", { onClick: (e) => e.stopPropagation(), style: {
                    width: "100%",
                    maxWidth: 320,
                    background: "#FFFFFF",
                    borderRadius: 16,
                    padding: 28,
                    textAlign: "center",
                    boxShadow: "0 20px 40px rgba(0,0,0,0.08)",
                    border: "1px solid rgba(0,0,0,0.06)",
                } },
                React.createElement("div", { style: { fontSize: 44 } }, popupQueue[0].emoji),
                React.createElement("div", { style: {
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontWeight: 800,
                        fontSize: 19,
                        color: "#1C1C1E",
                        marginTop: 8,
                    } },
                    popupQueue[0].to,
                    "\u3055\u3093\u304C\u4F7F\u7528\u3057\u307E\u3057\u305F"),
                React.createElement("div", { style: { fontSize: 14, color: "rgba(28,28,30,0.6)", marginTop: 6 } },
                    "\u300C",
                    popupQueue[0].title,
                    "\u300D"),
                React.createElement("button", { onClick: () => setPopupQueue((q) => q.slice(1)), style: {
                        marginTop: 20,
                        width: "100%",
                        background: "#1C1C1E",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: 10,
                        padding: "11px 0",
                        fontWeight: 700,
                        fontSize: 13.5,
                        cursor: "pointer",
                    } },
                    "\u9589\u3058\u308B",
                    popupQueue.length > 1 ? `（あと${popupQueue.length - 1}件）` : ""))))));
}
/* ---------------------------------------------------
   エラーバウンダリ / セーフティネット
   TicketBooth内で予期しないエラーが起きても、画面が真っ白の
   ままにならないよう、最低限のフォールバック表示を出す
--------------------------------------------------- */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error, info) {
        console.error("billet crashed:", error, info);
    }
    render() {
        if (this.state.error) {
            return (React.createElement("div", { style: {
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 24,
                    fontFamily: "sans-serif",
                    background: "#F2F2F7",
                    color: "#1C1C1E",
                    textAlign: "center",
                } },
                React.createElement("div", null,
                    React.createElement("div", { style: { fontSize: 28, marginBottom: 8 } }, "\u26A0\uFE0F"),
                    React.createElement("div", { style: { fontWeight: 700, marginBottom: 8 } }, "\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F"),
                    React.createElement("div", { style: { fontSize: 13, color: "#6b6b6b", marginBottom: 16, whiteSpace: "pre-wrap" } }, String(this.state.error && this.state.error.message ? this.state.error.message : this.state.error)),
                    React.createElement("button", { onClick: () => window.location.reload(), style: {
                            background: "#1C1C1E",
                            color: "#fff",
                            border: "none",
                            borderRadius: 8,
                            padding: "10px 20px",
                            cursor: "pointer",
                            fontWeight: 700,
                        } }, "\u518D\u8AAD\u307F\u8FBC\u307F"))));
        }
        return this.props.children;
    }
}
/* ---------------------------------------------------
   マウント
--------------------------------------------------- */
try {
    const root = ReactDOM.createRoot(document.getElementById("root"));
    root.render(React.createElement(ErrorBoundary, null,
        React.createElement(TicketBooth, null)));
}
catch (e) {
    console.error("billet failed to mount:", e);
    const el = document.getElementById("root");
    if (el) {
        el.innerHTML =
            '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:sans-serif;background:#F2F2F7;color:#1C1C1E;text-align:center;">' +
                '<div><div style="font-size:28px;margin-bottom:8px;">⚠️</div>' +
                '<div style="font-weight:700;margin-bottom:8px;">読み込みに失敗しました</div>' +
                '<div style="font-size:13px;color:#6b6b6b;">' + String(e && e.message ? e.message : e) + '</div></div></div>';
    }
}
