/*
 * Fake PokiSDK — local stand-in for https://game-cdn.poki.com/scripts/v2/poki-sdk.js
 *
 * Implements the surface the game uses (init, gameLoadingFinished, gameplayStart/Stop,
 * commercialBreak, rewardedBreak, movePill) plus the rest of the public SDK as no-ops
 * so nothing throws. Ads are simulated with a local overlay so the game still goes
 * through its pause-audio / block-input / resume path.
 */
(function () {
    "use strict";

    if (window.PokiSDK && window.PokiSDK.__fake) return; // loaded twice (html + index.mjs)

    var CONFIG = {
        logging: true,
        showPill: true,
        interstitialSeconds: 0,   // simulated commercialBreak length
        rewardedSeconds: 0,       // simulated rewardedBreak length
        rewardedSucceeds: true,   // rewardedBreak resolve value
        adsEnabled: true          // false => every break resolves instantly
    };

    function log() {
        if (!CONFIG.logging) return;
        var args = Array.prototype.slice.call(arguments);
        console.log.apply(console, ["%c[FakePokiSDK]", "color:#8b5cf6;font-weight:bold"].concat(args));
    }

    /* ---------------------------------------------------------------- the pill */

    var pill = null;

    function ensurePill() {
        if (!CONFIG.showPill || pill) return pill;
        pill = document.createElement("div");
        pill.id = "fake-poki-pill";
        pill.textContent = "POKI";
        pill.style.cssText = [
            "position:fixed",
            "right:12px",
            "top:20px",
            "z-index:2147483000",
            "padding:4px 10px",
            "border-radius:999px",
            "background:#8b5cf6",
            "color:#fff",
            "font:bold 11px/1.4 system-ui,sans-serif",
            "letter-spacing:.08em",
            "box-shadow:0 2px 6px rgba(0,0,0,.3)",
            "pointer-events:none",
            "transition:top .2s ease"
        ].join(";");
        document.body.appendChild(pill);
        return pill;
    }

    /* ------------------------------------------------------------- ad overlay */

    var overlay = null;

    function showAdOverlay(label, seconds) {
        hideAdOverlay();
        overlay = document.createElement("div");
        overlay.style.cssText = [
            "position:fixed",
            "inset:0",
            "z-index:2147483600",
            "display:flex",
            "flex-direction:column",
            "align-items:center",
            "justify-content:center",
            "gap:14px",
            "background:rgba(10,8,20,.92)",
            "color:#fff",
            "font:600 15px/1.5 system-ui,sans-serif",
            "text-align:center",
            "user-select:none"
        ].join(";");

        var title = document.createElement("div");
        title.textContent = label;
        title.style.cssText = "font-size:20px;letter-spacing:.02em";

        var count = document.createElement("div");
        count.style.cssText = "font-size:13px;opacity:.75;font-weight:500";

        var note = document.createElement("div");
        note.textContent = "fake ad — local dev stub";
        note.style.cssText = "font-size:11px;opacity:.45;font-weight:500;letter-spacing:.06em";

        overlay.appendChild(title);
        overlay.appendChild(count);
        overlay.appendChild(note);
        document.body.appendChild(overlay);

        var left = seconds;
        count.textContent = left + "s";
        var timer = setInterval(function () {
            left -= 1;
            count.textContent = Math.max(left, 0) + "s";
            if (left <= 0) clearInterval(timer);
        }, 1000);
        overlay.__timer = timer;
        return overlay;
    }

    function hideAdOverlay() {
        if (!overlay) return;
        clearInterval(overlay.__timer);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
    }

    function runBreak(label, seconds, onStart) {
        return new Promise(function (resolve) {
            if (!CONFIG.adsEnabled || seconds <= 0) {
                if (typeof onStart === "function") onStart();
                log(label, "skipped (ads disabled)");
                resolve();
                return;
            }
            log(label, "start (" + seconds + "s)");
            if (typeof onStart === "function") {
                try { onStart(); } catch (e) { console.warn("[FakePokiSDK] onStart threw", e); }
            }
            showAdOverlay(label, seconds);
            setTimeout(function () {
                hideAdOverlay();
                log(label, "end");
                resolve();
            }, seconds * 1000);
        });
    }

    /* ------------------------------------------------------------------- state */

    var gameplayRunning = false;
    var loadingFinished = false;

    var PokiSDK = {
        __fake: true,
        config: CONFIG,

        /* lifecycle */
        init: function () {
            log("init");
            if (document.body) ensurePill();
            else document.addEventListener("DOMContentLoaded", ensurePill);
            return Promise.resolve({ sdkVersion: "fake", environment: "local" });
        },
        setDebug: function (value) { CONFIG.logging = !!value; log("setDebug", value); },
        gameLoadingStart: function () { log("gameLoadingStart"); },
        gameLoadingProgress: function (progress) { log("gameLoadingProgress", progress); },
        gameLoadingFinished: function () {
            if (loadingFinished) return;
            loadingFinished = true;
            log("gameLoadingFinished");
        },
        destroy: function () { hideAdOverlay(); log("destroy"); },

        /* gameplay signals */
        gameplayStart: function () {
            if (gameplayRunning) log("gameplayStart (already running)");
            gameplayRunning = true;
            log("gameplayStart");
        },
        gameplayStop: function () {
            if (!gameplayRunning) log("gameplayStop (already stopped)");
            gameplayRunning = false;
            log("gameplayStop");
        },
        roundStart: function (opts) { log("roundStart", opts); },
        roundEnd: function (opts) { log("roundEnd", opts); },
        happyTime: function (intensity) { log("happyTime", intensity); },
        captureError: function (err) { log("captureError", err); },
        customEvent: function (category, action, payload) { log("customEvent", category, action, payload); },

        /* ads */
        commercialBreak: function (onStart) {
            return runBreak("Interstitial ad", CONFIG.interstitialSeconds, onStart);
        },
        rewardedBreak: function (opts) {
            opts = opts || {};
            return runBreak("Rewarded ad", CONFIG.rewardedSeconds, opts.onStart).then(function () {
                var success = CONFIG.adsEnabled ? CONFIG.rewardedSucceeds : true;
                log("rewardedBreak ->", success);
                return success;
            });
        },
        displayAd: function (opts) { log("displayAd", opts); return Promise.resolve(); },
        destroyAd: function (opts) { log("destroyAd", opts); return Promise.resolve(); },
        isAdBlocked: function () { return false; },

        /* pill / chrome */
        movePill: function (topPercentage, pixelOffset) {
            log("movePill", topPercentage, pixelOffset);
            var el = ensurePill();
            if (!el) return;
            el.style.top = "calc(" + (topPercentage || 0) + "% + " + (pixelOffset || 0) + "px)";
        },
        hidePill: function () { if (pill) pill.style.display = "none"; },
        showPill: function () { if (pill) pill.style.display = ""; },

        /* misc helpers games sometimes call */
        shareableURL: function (params) {
            var url = new URL(window.location.href);
            Object.keys(params || {}).forEach(function (k) { url.searchParams.set(k, params[k]); });
            return Promise.resolve(url.toString());
        },
        getURLParam: function (name) {
            return new URLSearchParams(window.location.search).get(name) || "";
        },
        getLanguage: function () { return (navigator.language || "en").slice(0, 2); },
        isPortrait: function () { return window.innerHeight >= window.innerWidth; },
        muted: function () { return false; },
        setMuted: function (value) { log("setMuted", value); },
        requestFullscreen: function () { log("requestFullscreen"); return Promise.resolve(); },
        exitFullscreen: function () { log("exitFullscreen"); return Promise.resolve(); }
    };

    window.PokiSDK = PokiSDK;
    log("fake SDK installed");
})();
