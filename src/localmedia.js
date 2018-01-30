//var hark = require('hark');
var getUserMedia = require('getusermedia');
var WildEmitter = require('wildemitter');
var mockconsole = require('mockconsole');

function LocalMedia(opts) {
    opts = opts || {};
    WildEmitter.call(this);

    var defaultConfig = {
        detectSpeakingEvents: false,
        audioFallback: false,
        media: {
            audio: true,
            video: true
        },
        //harkOptions: null,
        logger: console || mockconsole
    };
    this.config = defaultConfig;
    for (var item in opts) {
        if (opts.hasOwnProperty(item)) {
            this.config[item] = opts[item];
        }
    }

    this.logger = this.config.logger;
    this._log = this.logger.log.bind(this.logger, "LocalMedia:");
    this._logerror = this.logger.error.bind(this.logger, "LocalMedia:");

    this.localStreams = [];
    this.localScreens = [];

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        this._logerror("Your browser does not support local media capture.");
    }

    //this._audioMonitors = [];
    //this.on('localStreamStopped', this._stopAudioMonitor.bind(this));
    //this.on('localScreenStopped', this._stopAudioMonitor.bind(this));
}

LocalMedia.prototype = Object.create(WildEmitter.prototype);

LocalMedia.prototype.captureUserMedia = function (mediaConstraints, cb) {
    var self = this;
    var constraints = mediaConstraints || this.config.media;

    this.emit("localStreamRequested", constraints);

    getUserMedia(constraints,
        function(err, stream) {
            if (err) {
                // Fallback for users without a camera
                if (self.config.audioFallback && err.name === "NotFoundError" && constraints.video !== false) {
                    constraints.video = false;
                    self.captureUserMedia(constraints, cb);
                    return;
                }

                self.emit("localStreamRequestFailed", constraints);

                if (cb) {
                    cb(err, null);
                }
                return;
            }

            /*if (constraints.audio && self.config.detectSpeakingEvents) {
                self._setupAudioMonitor(stream, self.config.harkOptions);
            }*/
            self.localStreams.push(stream);
            self._subscribeForEnded(stream);

            self.emit("localStream", stream);

            if (cb) {
                cb(null, stream);
            }
        }
    );
};

LocalMedia.prototype.stop = function () {
    var self = this;
    this.localStreams.forEach(function (stream) {
        self.stopStream(stream);
    });
    
};

LocalMedia.prototype.stopStream = function (stream) {
    var self = this;

    if (stream) {
        stream.stop();
        self._removeStream(stream);
    }
};

LocalMedia.prototype.startScreenShare = function (constraints, cb) {
    var self = this;

    this.emit("localScreenRequested");

    if (typeof constraints === "function" && !cb) {
        cb = constraints;
        constraints = null;
    }

    getUserMedia(constraints, function (err, stream) {
        if (!err) {
            self.localScreens.push(stream);
            self._subscribeForEnded(stream);
            self.emit("localScreen", stream);
        } else {
            self.emit("localScreenRequestFailed");
        }

        if (cb) {
            cb(err, stream);
        }
    });
};

// Audio controls
LocalMedia.prototype.mute = function () {
    this._audioEnabled(false);
    this.emit("audioOff");
};

LocalMedia.prototype.unmute = function () {
    this._audioEnabled(true);
    this.emit("audioOn");
};

// Video controls
LocalMedia.prototype.pauseVideo = function () {
    this._videoEnabled(false);
    this.emit("videoOff");
};
LocalMedia.prototype.resumeVideo = function () {
    this._videoEnabled(true);
    this.emit("videoOn");
};

// Combined controls
LocalMedia.prototype.pause = function () {
    this.mute();
    this.pauseVideo();
};
LocalMedia.prototype.resume = function () {
    this.unmute();
    this.resumeVideo();
};

// Internal methods for enabling/disabling audio/video
LocalMedia.prototype._audioEnabled = function (bool) {
    this.localStreams.forEach(function (stream) {
        stream.getAudioTracks().forEach(function (track) {
            track.enabled = !!bool;
        });
    });
};
LocalMedia.prototype._videoEnabled = function (bool) {
    this.localStreams.forEach(function (stream) {
        stream.getVideoTracks().forEach(function (track) {
            track.enabled = !!bool;
        });
    });
};

// check if all audio streams are enabled
LocalMedia.prototype.isAudioEnabled = function () {
    var enabled = true;
    this.localStreams.forEach(function (stream) {
        stream.getAudioTracks().forEach(function (track) {
            enabled = enabled && track.enabled;
        });
    });
    return enabled;
};

// check if all video streams are enabled
LocalMedia.prototype.isVideoEnabled = function () {
    var enabled = true;
    this.localStreams.forEach(function (stream) {
        stream.getVideoTracks().forEach(function (track) {
            enabled = enabled && track.enabled;
        });
    });
    return enabled;
};

LocalMedia.prototype._removeStream = function (stream) {
    stream.getTracks().forEach(function (track) { track.stop(); });
    var idx = this.localStreams.indexOf(stream);
    if (idx > -1) {
        this.localStreams.splice(idx, 1);
        this.emit("localStreamEnded", stream);
    } else {
        idx = this.localScreens.indexOf(stream);
        if (idx > -1) {
            this.localScreens.splice(idx, 1);
            this.emit("localScreenEnded", stream);
        }
    }
};

LocalMedia.prototype._subscribeForEnded = function (stream)
{
    var self = this;
    stream.getTracks().forEach(function (track) {
        track.addEventListener("ended",
            function () {
                if (self._isAllTracksEnded(stream)) {
                    self._removeStream(stream);
                    stream.stop();
                }
            });
    });
}

LocalMedia.prototype._isAllTracksEnded = function (stream) {
    var result = true;
    stream.getTracks().forEach(function (t) {
        result = t.readyState === "ended" && result;
    });
    return result;
}

/*LocalMedia.prototype._setupAudioMonitor = function (stream, harkOptions) {
    this._log('Setup audio');
    var audio = hark(stream, harkOptions);
    var self = this;
    var timeout;

    audio.on('speaking', function () {
        self.emit('speaking');
    });

    audio.on('stopped_speaking', function () {
        if (timeout) {
            clearTimeout(timeout);
        }

        timeout = setTimeout(function () {
            self.emit('stoppedSpeaking');
        }, 1000);
    });
    audio.on('volume_change', function (volume, threshold) {
        self.emit('volumeChange', volume, threshold);
    });

    this._audioMonitors.push({audio: audio, stream: stream});
};

LocalMedia.prototype._stopAudioMonitor = function (stream) {
    var idx = -1;
    this._audioMonitors.forEach(function (monitors, i) {
        if (monitors.stream === stream) {
            idx = i;
        }
    });

    if (idx > -1) {
        this._audioMonitors[idx].audio.stop();
        this._audioMonitors.splice(idx, 1);
    }
};*/

module.exports = LocalMedia;
