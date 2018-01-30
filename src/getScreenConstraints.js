var getAspectRatio = function(w, h) {
    function gcd(a, b) {
        return (b === 0) ? a : gcd(b, a % b);
    }
    var r = gcd(w, h);
    return (w / r) / (h / r);
}

function getScreenConstraints (cb) {
    if (typeof window === "undefined" || window.location.protocol === "http:") {
        var error = new Error("NavigatorUserMediaError");
        error.name = "HTTPS_REQUIRED";
        return cb(error);
    }

    if (window.navigator.userAgent.match("Firefox")) {
        var ffConstraints = {
            mozMediaSource: "window",
            mediaSource: "window"
        };
        return cb(null, ffConstraints);
    } else if (window.navigator.userAgent.match("Chrome")) {
        var constraints = {
            mandatory: {
                chromeMediaSource: "desktop",
                maxWidth: window.screen.width,
                maxHeight: window.screen.height,
                //minWidth: screen.width,
                //minHeight: screen.height,
                //minAspectRatio: getAspectRatio(screen.width, screen.height),
                maxAspectRatio: getAspectRatio(window.screen.width, window.screen.height),
                minFrameRate: 3,
                maxFrameRate: 128
            },
            optional: []
        };

        return cb(null, constraints);
    }

    return new Error("NotSupportedError");
}

module.exports = getScreenContraints;