(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.WebinarCore = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
/*
WildEmitter.js is a slim little event emitter by @henrikjoreteg largely based
on @visionmedia's Emitter from UI Kit.

Why? I wanted it standalone.

I also wanted support for wildcard emitters like this:

emitter.on('*', function (eventName, other, event, payloads) {

});

emitter.on('somenamespace*', function (eventName, payloads) {

});

Please note that callbacks triggered by wildcard registered events also get
the event name as the first argument.
*/

module.exports = WildEmitter;

function WildEmitter() { }

WildEmitter.mixin = function (constructor) {
    var prototype = constructor.prototype || constructor;

    prototype.isWildEmitter= true;

    // Listen on the given `event` with `fn`. Store a group name if present.
    prototype.on = function (event, groupName, fn) {
        this.callbacks = this.callbacks || {};
        var hasGroup = (arguments.length === 3),
            group = hasGroup ? arguments[1] : undefined,
            func = hasGroup ? arguments[2] : arguments[1];
        func._groupName = group;
        (this.callbacks[event] = this.callbacks[event] || []).push(func);
        return this;
    };

    // Adds an `event` listener that will be invoked a single
    // time then automatically removed.
    prototype.once = function (event, groupName, fn) {
        var self = this,
            hasGroup = (arguments.length === 3),
            group = hasGroup ? arguments[1] : undefined,
            func = hasGroup ? arguments[2] : arguments[1];
        function on() {
            self.off(event, on);
            func.apply(this, arguments);
        }
        this.on(event, group, on);
        return this;
    };

    // Unbinds an entire group
    prototype.releaseGroup = function (groupName) {
        this.callbacks = this.callbacks || {};
        var item, i, len, handlers;
        for (item in this.callbacks) {
            handlers = this.callbacks[item];
            for (i = 0, len = handlers.length; i < len; i++) {
                if (handlers[i]._groupName === groupName) {
                    //console.log('removing');
                    // remove it and shorten the array we're looping through
                    handlers.splice(i, 1);
                    i--;
                    len--;
                }
            }
        }
        return this;
    };

    // Remove the given callback for `event` or all
    // registered callbacks.
    prototype.off = function (event, fn) {
        this.callbacks = this.callbacks || {};
        var callbacks = this.callbacks[event],
            i;

        if (!callbacks) return this;

        // remove all handlers
        if (arguments.length === 1) {
            delete this.callbacks[event];
            return this;
        }

        // remove specific handler
        i = callbacks.indexOf(fn);
        callbacks.splice(i, 1);
        if (callbacks.length === 0) {
            delete this.callbacks[event];
        }
        return this;
    };

    /// Emit `event` with the given args.
    // also calls any `*` handlers
    prototype.emit = function (event) {
        this.callbacks = this.callbacks || {};
        var args = [].slice.call(arguments, 1),
            callbacks = this.callbacks[event],
            specialCallbacks = this.getWildcardCallbacks(event),
            i,
            len,
            item,
            listeners;

        if (callbacks) {
            listeners = callbacks.slice();
            for (i = 0, len = listeners.length; i < len; ++i) {
                if (!listeners[i]) {
                    break;
                }
                listeners[i].apply(this, args);
            }
        }

        if (specialCallbacks) {
            len = specialCallbacks.length;
            listeners = specialCallbacks.slice();
            for (i = 0, len = listeners.length; i < len; ++i) {
                if (!listeners[i]) {
                    break;
                }
                listeners[i].apply(this, [event].concat(args));
            }
        }

        return this;
    };

    // Helper for for finding special wildcard event handlers that match the event
    prototype.getWildcardCallbacks = function (eventName) {
        this.callbacks = this.callbacks || {};
        var item,
            split,
            result = [];

        for (item in this.callbacks) {
            split = item.split('*');
            if (item === '*' || (split.length === 2 && eventName.slice(0, split[0].length) === split[0])) {
                result = result.concat(this.callbacks[item]);
            }
        }
        return result;
    };

};

WildEmitter.mixin(WildEmitter);

},{}],2:[function(require,module,exports){
var LocalMedia = require('./localmedia');
var PeerManager = require('./peerManager');

function WebinarCore(connection, options) {
    options = options || {};
    // call emitter constructor
    LocalMedia.call(this, options);

    var defaultConfig = {
        debug: false,
        logger: console,
        peerConnectionConfig: {
            iceServers: [
                { 'urls': 'stun:stun.l.google.com:19302' }
            ]
        },
        peerConnectionConstraints: {
            optional: [
                { DtlsSrtpKeyAgreement: true },
                { RtpDataChannels: true }
            ]
        },
        receiveMedia: {
            offerToReceiveAudio: 1,
            offerToReceiveVideo: 1
        },
        media: {
            video: {
                mandatory: {
                    minAspectRatio: 1.33
                }
            },
            audio: true
        },
        detectSpeakingEvents: false,
        audioFallback: false,
        enableDataChannels: false,
        isLeader: false,
        isOneWay: true,
        userId: null
    };
    this.config = defaultConfig;

    for (var item in options) {
        if (options.hasOwnProperty(item)) {
            this.config[item] = options[item];
        }
    }
    this.logger = this.config.logger;
    this.connection = connection;

    var peerManagerConfig = {
        debug: this.config.debug,
        logger: this.logger,
        peerConnectionConfig: this.config.peerConnectionConfig,
        peerConnectionConstraints: this.config.peerConnectionConstraints,
        enableDataChannels: this.config.enableDataChannels
    };
    this.peerManager = new PeerManager(peerManagerConfig);
    if (!this.config.isLeader) {
        this._createLocalPeer(this.config.userId);
    }

    this.connection.on("onMessageReceived", this._handleMessage.bind(this));
    this.on("localStream", this._handleStream.bind(this));
    this.on("localScreen", this._handleScreen.bind(this));
    this.on("localStreamEnded", this._handleStreamEnded.bind(this));
    this.on("localScreenEnded", this._handleStreamEnded.bind(this));

    this._log = this.logger.log.bind(this.logger, "WebinarCore: ");
    
    this.remoteStreams = [];
    this._streamsInfo = {};
    this._sdpBuffer = [];
}

WebinarCore.prototype = Object.create(LocalMedia.prototype);

WebinarCore.prototype.addPeer = function (id) {
    var self = this;
    if (id === this.config.userId)
        return;

    var peer = this.peerManager.getPeer(id);
    if (!peer) {
        this._logDebug("Create peer for user ", id);
        peer = this.peerManager.createPeer(id);

        // send any ice candidates to the other peer
        peer.on("ice", function(evt) {
            var pc = this;
            if (evt.candidate) {
                var userId = self.config.userId;
                evt.from = userId;
                evt.type = "candidate";
                evt.to = pc.userId;
                self.connection.send(evt);
            }
        });

        //create offer if needed
        peer.on("negotiationNeeded", function () {
            var pc = this;
            self._createOffer.bind(self);
            self._createOffer(pc);
        });

        // once remote stream arrives, show it in the remote video element
        peer.on("addStream", this._handleRemoteStream.bind(this, peer));

        peer.on("iceConnectionStateChange", function () {
            if (this.iceConnectionState === "failed") {
                self.addPeer(this.userId);
            }
        });

        //add opened streams
        this.localStreams.forEach(function(stream) {
            self._sendStreamInfo(stream, peer.userId);
            peer.addStream(stream);
        });

        this.localScreens.forEach(function(stream) {
            self._sendStreamInfo(stream, peer.userId);
            peer.addStream(stream);
        });

        var needToCreateOffer = this.localStreams.length === 0 &&
            this.localScreens.length === 0 &&
            !this.config.isOneWay;

        //create connection
        if (this.config.isLeader && needToCreateOffer) {
            this._createOffer(peer);
        }

    } else {
        //recreate peer
        this._logDebug("Recreate peer for user ", id);
        this.peerManager.removePeer(id);
        this.addPeer(id);
    }
}

WebinarCore.prototype.removePeer = function (id) {
    this._logDebug("Remove peer for user ", id);
    return this.peerManager.removePeer(id);
}

WebinarCore.prototype._createLocalPeer = function (userId) {
    var self = this;
    
    var localPeer = this.peerManager.createLocalPeer(userId);
    localPeer.on("addStream", this._handleRemoteStream.bind(this, localPeer));
    localPeer.on("ice", function (evt) {
        var pc = this;
        if (evt.candidate) {
            evt.from = pc.userId;
            evt.to = "#leader";
            evt.type = "candidate";
            self.connection.send(evt);
        }
    });

    localPeer.on("iceConnectionStateChange", function () {
        if (this.iceConnectionState === "failed") {
            self.emit("iceFailed");
        }
    });

    localPeer.on("signalingStateChange", function () {
        //pop offer from queue
        if (this.signalingState === "stable") {
            var offer = self._sdpBuffer.shift();
            if (!offer)
                return;

            self._handleMessage(offer);
            self._logDebug("Pop offer from user ", offer.from);
        }
    });

    //add opened streams
    this.localStreams.forEach(function (stream) {
        localPeer.addStream(stream);
    });

    this._logDebug("Create local peer for user ", userId);
    return localPeer;
}

WebinarCore.prototype._handleMessage = function (message) {
    var msg = JSON.parse(message);
    var self = this;
    var pc;
    //find peer
    if (this.config.isLeader) {
        pc = this.peerManager.getPeer(msg.from);
    } else {
        var userId = this.config.userId;
        if (msg.to && msg.to !== userId)
            return;

        pc = this.peerManager.localPeer;
    }

    if (!pc) {
        self.logger.error("Peer not found: " + msg.from);
        return;
    }

    if (msg.type === "offer") {
        this._logDebug("Receive offer from user ", msg.from);
        pc = self._createLocalPeer(self.config.userId);
        pc.remoteId = msg.from;

        if (pc.signalingState !== "stable") {
            this._sdpBuffer.push(msg);
            this._logDebug("Put offer from user " + msg.from + "to queue");
            return;
        }
        
        pc.handleOffer(msg, function (err) {
            if (err) return;
        
            pc.createAnswer(function (err, answer) {
                if (err) {
                    return;
                }

                answer.from = self.config.userId;
                answer.to = msg.from;
                answer.id = msg.id;
                self.connection.send(answer);
                self._logDebug("Send answer ", answer);
            });
        });

        return;
    }

    if (msg.type === "candidate") {
        pc.processIce(msg);
        return;
    }

    if (msg.type === "answer") {
        this._logDebug("Receive answer from ", msg.from);

        if (pc.offerId !== msg.id)
            return;

        pc.handleAnswer(msg);
        return;
    }

    if (msg.type === "media-captured") {
        self._streamsInfo[msg.data.streamId] = msg.data;
        self._logDebug("Receive media captured message", msg);

        if (this.config.isLeader && !this.config.isOneWay) {
            var rstreams = this.remoteStreams.filter(function (stream) {
                return stream.id === msg.data.streamId;
            });
            
            if (rstreams.length === 0)
                this._createOffer(pc);
        }

        return;
    }

    //another way to handle remote streams ended
    if (msg.type === "stream-ended") {
        var streams = self.remoteStreams.filter(function(stream) {
            return stream.id === msg.data.streamId;
        });

        if (streams.length > 0)
            self._handleRemoteStreamEnded(streams[0]);

        this._logDebug("Receive stream ended message: ", msg);

        return;
    }

    this.logger.warn("Unknown message:" + msg);
}

WebinarCore.prototype._createOffer = function (pc) {
    var self = this;

    pc.createOffer(self.config.receiveMedia,
        function (error, offer) {
            if (error) {
                self.logger.error(error);
                return;
            }

            var userId = self.config.userId;
            offer.from = userId;
            offer.to = pc.userId;
            offer.id = Date.now();
            pc.offerId = offer.id;

            self._logDebug("Create offer ", offer);
            self.connection.send(offer);
        });
}

WebinarCore.prototype._handleStream = function (stream) {
    var to = this.config.isLeader ? null : "#leader";
    this._sendStreamInfo(stream, to);
    this.peerManager.addStream(stream);

    //add local stream to local peer if TwoWay mode
    if (this.peerManager.localPeer)
        this.peerManager.localPeer.addStream(stream);

    this._logDebug("Stream captured ", stream);
}

WebinarCore.prototype._handleScreen = function (stream) {
    this._sendStreamInfo(stream);
    this.peerManager.addStream(stream);
    this._logDebug("Screen captured ", stream);
}

WebinarCore.prototype._handleStreamEnded = function (stream) {
    this.peerManager.removeStream(stream);

    var msg = {
        type: "stream-ended",
        from: this.config.userId,
        data: {
            streamId: stream.id,
            type: stream.type
        }
    }
    this.connection.send(msg);
    this._logDebug("Stream ended ", stream);
}

WebinarCore.prototype._handleRemoteStream = function (peer, e) {
    var self = this;

    var tracks = e.stream.getTracks();
    if (!e.stream.active || tracks.length < 1)
        return;

    //extend stream with additional info
    if (peer) {
        e.stream["userId"] = peer.userId;

        if (!this.isLeader && peer.remoteId)
            e.stream["userId"] = peer.remoteId;
    }

    //set default type
    if (e.stream.getVideoTracks().length > 0 &&
        e.stream.getAudioTracks().length > 0)
        e.stream.type = "camera";
    else if (e.stream.getVideoTracks().length > 0
        && e.stream.getAudioTracks().length === 0)
        e.stream.type = "screen";
    else if (e.stream.getVideoTracks().length === 0 &&
        e.stream.getAudioTracks().length > 0)
        e.stream.type = "camera"; // microphone

    //update type from cache
    var info = self._streamsInfo[e.stream.id];
    if (info)
        e.stream["type"] = info.type;


    this.remoteStreams.push(e.stream);

    e.stream.getTracks().forEach(function (track) {
        track.addEventListener("ended", function () {
            if (self._isAllTracksEnded(e.stream)) {
                self._handleRemoteStreamEnded(e.stream);
                self._logDebug("Remote stream ended: ", e.stream);
            }
        });
    });

    this.emit("remoteStream", e.stream);
}

WebinarCore.prototype._handleRemoteStreamEnded = function(stream) {
    stream.stop();
    this.remoteStreams.removeItem(stream);
    this.emit("remoteStreamEnded", stream);
}

WebinarCore.prototype._sendStreamInfo = function (stream, to) {
    var msg = {
        type: "media-captured",
        from: this.config.userId,
        data: {
            streamId: stream.id,
            type: stream.type
        }
    }

    if (to)
        msg.to = to;
    this.connection.send(msg);
}

WebinarCore.prototype._logDebug = function(message, args)
{
    if (this.config.debug && arguments.length > 0) {
        this.logger.log(message, args);
    }
}

WebinarCore.prototype.connect = function (options) {
    if (!this.connection || !this.connection.connect) {
        this.logger.error("Please provide proper connection object");
        return;
    }

    var self = this;
    this.connection.connect(options, function() {
        self.emit("connected");
    });
}

module.exports = WebinarCore;
},{"./localmedia":4,"./peerManager":6}],3:[function(require,module,exports){
//use webrtc-adapter if need support old browsers
//var adapter = require('webrtc-adapter');

'use strict';

navigator.getUserMedia = navigator.getUserMedia || 
    navigator.mozGetUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.msGetUserMedia;

// make sure it's supported and bind to navigator
if (navigator.getUserMedia) {
    navigator.getUserMedia = navigator.getUserMedia.bind(navigator);
}


module.exports = function (constraints, cb) {
    var error;
    var haveOpts = arguments.length === 2;
    var defaultOpts = {video: true, audio: true};

    var denied = 'PermissionDeniedError';
    var altDenied = 'PERMISSION_DENIED';
    var notSatisfied = 'ConstraintNotSatisfiedError';

    // make constraints optional
    if (!haveOpts) {
        cb = constraints;
        constraints = defaultOpts;
    }

    // treat lack of browser support like an error
    if (typeof navigator === 'undefined' || !navigator.getUserMedia) {
        // throw proper error per spec
        error = new Error('MediaStreamError');
        error.name = 'NotSupportedError';

        // keep all callbacks async
        return setTimeout(function () {
            cb(error);
        }, 0);
    }

    // normalize error handling when no media types are requested
    if (!constraints.audio && !constraints.video) {
        error = new Error('MediaStreamError');
        error.name = 'NoMediaRequestedError';

        // keep all callbacks async
        return setTimeout(function () {
            cb(error);
        }, 0);
    }

    navigator.getUserMedia(constraints, 
    function (stream) {
        cb(null, stream);
    },function (err) {
        var error;
        // coerce into an error object since FF gives us a string
        // there are only two valid names according to the spec
        // we coerce all non-denied to "constraint not satisfied".
        if (typeof err === 'string') {
            error = new Error('MediaStreamError');
            if (err === denied || err === altDenied) {
                error.name = denied;
            } else {
                error.name = notSatisfied;
            }
        } else {
            // if we get an error object make sure '.name' property is set
            // according to spec: http://dev.w3.org/2011/webrtc/editor/getusermedia.html#navigatorusermediaerror-and-navigatorusermediaerrorcallback
            error = err;
            if (!error.name) {
                // this is likely chrome which
                // sets a property called "ERROR_DENIED" on the error object
                // if so we make sure to set a name
                if (error[denied]) {
                    err.name = denied;
                } else {
                    err.name = notSatisfied;
                }
            }
        }

        cb(error);
    });
};

},{}],4:[function(require,module,exports){
//var hark = require('hark');
var getUserMedia = require('./getusermedia');
var WildEmitter = require('wildemitter');

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
        logger: console
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
            stream["type"] = "camera";
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
            stream["type"] = "screen";
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

LocalMedia.prototype.attachStream = function (stream) {

    if (stream.getTracks().length === 0)
        return;

    stream.type = stream.getVideoTracks().length > 0 ? "video" : "audio";

    this.localStreams.push(stream);
    this._subscribeForEnded(stream);
    this.emit("localStream", stream);
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

},{"./getusermedia":3,"wildemitter":1}],5:[function(require,module,exports){
var idCounter = Math.random();

var parseCandidate = function (line) {
    var parts;
    if (line.indexOf('a=candidate:') === 0) {
        parts = line.substring(12).split(' ');
    } else { // no a=candidate
        parts = line.substring(10).split(' ');
    }

    var candidate = {
        foundation: parts[0],
        component: parts[1],
        protocol: parts[2].toLowerCase(),
        priority: parts[3],
        ip: parts[4],
        port: parts[5],
        // skip parts[6] == 'typ'
        type: parts[7],
        generation: '0'
    };

    for (var i = 8; i < parts.length; i += 2) {
        if (parts[i] === 'raddr') {
            candidate.relAddr = parts[i + 1];
        } else if (parts[i] === 'rport') {
            candidate.relPort = parts[i + 1];
        } else if (parts[i] === 'generation') {
            candidate.generation = parts[i + 1];
        } else if (parts[i] === 'tcptype') {
            candidate.tcpType = parts[i + 1];
        }
    }

    candidate.network = '1';

    return candidate;
};

exports.toCandidateJSON = function (line) {
    var candidate = parseCandidate(line.split('\r\n')[0]);
    candidate.id = (idCounter++).toString(36).substr(0, 12);
    return candidate;
};
},{}],6:[function(require,module,exports){
var PeerConnection = require('./peerconnection')

function PeerManager(options) {
    options = options || {}
    this.peers = [];
    this.localPeer = null;

    var defaultConfig = {
        debug: false,
        logger: console,
        peerConnectionConfig: {
            iceServers: [
                { 'urls': 'stun:stun.l.google.com:19302' }
            ]
        },
        peerConnectionConstraints: {
            optional: []
        },
        enableDataChannels: false
    };
    this.config = defaultConfig;

    for (var item in options) {
        if (options.hasOwnProperty(item)) {
            this.config[item] = options[item];
        }
    }
    this.logger = this.config.logger;
}

PeerManager.prototype._createPeer = function (id) {
    var peer = new PeerConnection(this.config.peerConnectionConfig, this.config.peerConnectionConstraints);
    peer.userId = id;
    return peer;
}

PeerManager.prototype.createPeer = function (id) {
    var peer = this._createPeer(id);
    this.peers.push(peer);
    return peer;
}

PeerManager.prototype.createLocalPeer = function (id) {
    if (this.localPeer)
        this.localPeer.close();

    var peer = this._createPeer(id);
    this.localPeer = peer;
    return peer;
}

PeerManager.prototype.getPeer = function (id) {
    var peers = this.peers.filter(function (peer) {
        return (peer.userId === id);
    });

    return peers.length > 0 ? peers[0] : null;
}

PeerManager.prototype.removePeer = function (id) {
    var peer = this.getPeer(id);
    if (peer) {
        peer.close();
        var idx = this.peers.indexOf(peer);
        this.peers.splice(idx, 1);
    }
}

PeerManager.prototype.addStream = function(stream) {
    this.peers.forEach(function (peer) {
        peer.addStream(stream);
    });
}

PeerManager.prototype.removeStream = function (stream) {
    this.peers.forEach(function (peer) {
        peer.removeStream(stream);
    });
}

module.exports = PeerManager;
},{"./peerconnection":7}],7:[function(require,module,exports){
var parser = require('./parsers');
var WildEmitter = require('wildemitter');
//var Interop = require('sdp-interop');

function PeerConnection(config, constraints) {
    var self = this;
    var item;
    WildEmitter.call(this);

    config = config || {};
    config.iceServers = config.iceServers || [];

    // EXPERIMENTAL FLAG, might get removed without notice
    // this attemps to strip out candidates with an already known foundation
    // and type -- i.e. those which are gathered via the same TURN server
    // but different transports (TURN udp, tcp and tls respectively)
    if (config.eliminateDuplicateCandidates && window.chrome) {
        self.eliminateDuplicateCandidates = config.eliminateDuplicateCandidates;
    }

    this.pc = new RTCPeerConnection(config, constraints);

    if (typeof this.pc.getLocalStreams === 'function') {
        this.getLocalStreams = this.pc.getLocalStreams.bind(this.pc);
    } else {
        this.getLocalStreams = function () {
            return [];
        };
    }
    
    if (typeof this.pc.getSenders === 'function') {
        this.getSenders = this.pc.getSenders.bind(this.pc);
    } else {
        this.getSenders = function () {
            return [];
        };
    }

    if (typeof this.pc.getRemoteStreams === 'function') {
        this.getRemoteStreams = this.pc.getRemoteStreams.bind(this.pc);
    } else {
        this.getRemoteStreams = function () {
            return [];
        };
    }

    if (typeof this.pc.getReceivers === 'function') {
        this.getReceivers = this.pc.getReceivers.bind(this.pc);
    } else {
        this.getReceivers = function () {
            return [];
        };
    }

    this.addStream = this.pc.addStream.bind(this.pc);

    this.removeStream = function (stream) {
        if (typeof self.pc.removeStream === 'function') {
            self.pc.removeStream.apply(self.pc, arguments);
        } else if (typeof self.pc.removeTrack === 'function') {
            self.pc.getSenders().forEach(function(sender) {
                if (sender.track && stream.getTracks().indexOf(sender.track) !== -1) {
                    self.pc.removeTrack(sender);
                }
            });
        }
    };

    if (typeof this.pc.removeTrack === 'function') {
        this.removeTrack = this.pc.removeTrack.bind(this.pc);
    }

    // proxy some events directly
    this.pc.onremovestream = this.emit.bind(this, 'removeStream');
    this.pc.onremovetrack = this.emit.bind(this, 'removeTrack');
    this.pc.onaddstream = this.emit.bind(this, 'addStream');
    this.pc.onnegotiationneeded = this.emit.bind(this, 'negotiationNeeded');
    this.pc.oniceconnectionstatechange = this.emit.bind(this, 'iceConnectionStateChange');
    this.pc.onsignalingstatechange = this.emit.bind(this, 'signalingStateChange');

    // handle ice candidate and data channel events
    this.pc.onicecandidate = this._onIce.bind(this);
    this.pc.ondatachannel = this._onDataChannel.bind(this);

    this.config = {
        debug: false,
        sdpSessionID: Date.now(),
        logger: console
    };

    // apply our config
    for (item in config) {
        this.config[item] = config[item];
    }

    this.logger = this.config.logger || console;

    if (this.config.debug) {
        this.on('*', function () {
            self.logger.log('PeerConnection event:', arguments);
        });
    }

    this.hadLocalStunCandidate = false;
    this.hadRemoteStunCandidate = false;
    this.hadLocalRelayCandidate = false;
    this.hadRemoteRelayCandidate = false;
    this.hadLocalIPv6Candidate = false;
    this.hadRemoteIPv6Candidate = false;

    //Initialize UnifidPlan <--> PlanB Interop
    //this.interop = new Interop.Interop();

    // keeping references for all our data channels
    // so they dont get garbage collected
    // can be removed once the following bugs have been fixed
    // https://crbug.com/405545
    // https://bugzilla.mozilla.org/show_bug.cgi?id=964092
    // to be filed for opera
    this._remoteDataChannels = [];
    this._localDataChannels = [];

    this._candidateBuffer = [];
    this._iceBuffer = [];
}

PeerConnection.prototype = Object.create(WildEmitter.prototype);

Object.defineProperty(PeerConnection.prototype, 'signalingState', {
    get: function () {
        return this.pc.signalingState;
    }
});
Object.defineProperty(PeerConnection.prototype, 'iceConnectionState', {
    get: function () {
        return this.pc.iceConnectionState;
    }
});

PeerConnection.prototype._role = function () {
    return this.isInitiator ? 'initiator' : 'responder';
};

// Add a stream to the peer connection object
PeerConnection.prototype.addStream = function (stream) {
    this.localStream = stream;
    this.pc.addStream(stream);
};

// helper function to check if a remote candidate is a stun/relay
// candidate or an ipv6 candidate
PeerConnection.prototype._checkLocalCandidate = function (candidate) {
    var cand = parser.toCandidateJSON(candidate);
    if (cand.type == 'srflx') {
        this.hadLocalStunCandidate = true;
    } else if (cand.type == 'relay') {
        this.hadLocalRelayCandidate = true;
    }
    if (cand.ip.indexOf(':') != -1) {
        this.hadLocalIPv6Candidate = true;
    }
};

// helper function to check if a remote candidate is a stun/relay
// candidate or an ipv6 candidate
PeerConnection.prototype._checkRemoteCandidate = function (candidate) {
    var cand = parser.toCandidateJSON(candidate);
    if (cand.type == 'srflx') {
        this.hadRemoteStunCandidate = true;
    } else if (cand.type == 'relay') {
        this.hadRemoteRelayCandidate = true;
    }
    if (cand.ip.indexOf(':') != -1) {
        this.hadRemoteIPv6Candidate = true;
    }
};


// Init and add ice candidate object with correct constructor
PeerConnection.prototype.processIce = function (msg, cb) {
    cb = cb || function () {};
    var self = this;

    // ignore any added ice candidates to avoid errors. why does the
    // spec not do this?
    if (this.pc.signalingState === 'closed') return cb();

    // working around https://code.google.com/p/webrtc/issues/detail?id=3669
    if (msg.candidate && msg.candidate.candidate.indexOf('a=') !== 0) {
        msg.candidate.candidate = 'a=' + msg.candidate.candidate;
    }

    self._checkRemoteCandidate(msg.candidate.candidate);

    if (!self.pc.remoteDescription) {
        self._iceBuffer.push(msg.candidate);
        return;
    }

    self.pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
        .then(function () {
            return cb();
        })
        .catch(function (err) {
            self.emit('error', err);
            //self.logger.error(err);
            return cb(err);
    });
};

// Generate and emit an offer with the given constraints
PeerConnection.prototype.createOffer = function (constraints, cb) {
    var self = this;
    var hasConstraints = arguments.length === 2;
    var mediaConstraints = hasConstraints && constraints ? constraints : {
            offerToReceiveAudio: 1,
            offerToReceiveVideo: 1
        };
    cb = hasConstraints ? cb : constraints;
    cb = cb || function () {};

    if (this.pc.signalingState === 'closed') return cb('Peer already closed');

    // Actually generate the offer
    this.pc.createOffer(mediaConstraints)
        .then(function (offer) {
            self._candidateBuffer = [];

            // this hack...
            var expandedOffer = {
                type: 'offer',
                sdp: offer.sdp
            };

            return self.pc.setLocalDescription(offer)
                .then(function () {
                    expandedOffer.sdp.split('\r\n').forEach(function (line) {
                        if (line.indexOf('a=candidate:') === 0) {
                            self._checkLocalCandidate(line);
                        }
                    });

                    self.emit('offer', expandedOffer);
                    return cb(null, expandedOffer);
                })
        })
        .catch(function (err) {
            self.emit('error', err);
            self.logger.error(err);
            return cb(err);
        });
};


// Process an incoming offer so that ICE may proceed before deciding
// to answer the request.
PeerConnection.prototype.handleOffer = function (offer, cb) {
    cb = cb || function () {};
    var self = this;
    offer.type = 'offer';

    offer.sdp.split('\r\n').forEach(function (line) {
        if (line.indexOf('a=candidate:') === 0) {
            self._checkRemoteCandidate(line);
        }
    });

    var description = new RTCSessionDescription(offer);

    /*try {
    if (navigator.mozGetUserMedia)
        description = this.interop.toUnifiedPlan(description);

    if (navigator.webkitGetUserMedia)
        description = this.interop.toPlanB(description);
    } catch(err) {};*/

    self.pc.setRemoteDescription(description)
        .then(function (){
            var promises = [];
            self._iceBuffer.forEach(function(candidate){
                promises.push(self.pc.addIceCandidate(candidate));
            });
            self._iceBuffer = [];
            return Promise.all(promises);
        })
        .then(function () {
            return cb();
        })
        .catch(function (err) {
            self.emit('error', err);
            self.logger.error(err);
            return cb(err);
        });
};

// Answer an offer with audio only
PeerConnection.prototype.answerAudioOnly = function (cb) {
    var mediaConstraints = {
            mandatory: {
                OfferToReceiveAudio: true,
                OfferToReceiveVideo: false
            }
        };
    this._answer(mediaConstraints, cb);
};

// Answer an offer without offering to recieve
PeerConnection.prototype.answerBroadcastOnly = function (cb) {
    var mediaConstraints = {
            mandatory: {
                OfferToReceiveAudio: false,
                OfferToReceiveVideo: false
            }
        };
    this._answer(mediaConstraints, cb);
};

// Answer an offer with given constraints default is audio/video
PeerConnection.prototype.createAnswer = function (constraints, cb) {
    var hasConstraints = arguments.length === 2;
    var callback = hasConstraints ? cb : constraints;
    var mediaConstraints = hasConstraints && constraints ? constraints : {
            mandatory: {
                OfferToReceiveAudio: true,
                OfferToReceiveVideo: true
            }
        };

    this._answer(mediaConstraints, callback);
};

// Process an answer
PeerConnection.prototype.handleAnswer = function (answer, cb) {
    cb = cb || function () {};
    var self = this;
    
    answer.sdp.split('\r\n').forEach(function (line) {
        if (line.indexOf('a=candidate:') === 0) {
            self._checkRemoteCandidate(line);
        }
    });

    var description = new RTCSessionDescription(answer);

    /*try {
    if (navigator.mozGetUserMedia)
        description = this.interop.toUnifiedPlan(description);
    
    if (navigator.webkitGetUserMedia)
        description = this.interop.toPlanB(description);
    } catch(err) {};*/

    self.pc.setRemoteDescription(description)
        .then(function () {
            return cb();
        })
        .catch(function (err) {
            self.emit('error', err);
            self.logger.error(err);
            return cb(err);
        });
};

// Close the peer connection
PeerConnection.prototype.close = function () {
    this._localDataChannels = [];
    this._remoteDataChannels = [];

    this.off('removeTrack');
    this.off('addStream');
    this.off('negotiationNeeded');
    this.off('iceConnectionStateChange');
    this.off('signalingStateChange');
    this.off('error');
    this.off('offer');
    this.off('answer');
    this.off('ice');
    this.off('endOfCandidates');
    this.off('addChannel');

    this.pc.close();
    this.emit('close');
};

// Internal code sharing for various types of answer methods
PeerConnection.prototype._answer = function (constraints, cb) {
    cb = cb || function () {};
    var self = this;
    if (!this.pc.remoteDescription) {
        // the old API is used, call handleOffer
        throw new Error('remoteDescription not set');
    }

    if (this.pc.signalingState === 'closed') return cb('Already closed');

    self.pc.createAnswer(constraints)
        .then(function (answer) {
            self._candidateBuffer = [];
            
            var expandedAnswer = {
                type: 'answer',
                sdp: answer.sdp
            };

            return self.pc.setLocalDescription(answer)
                .then(function () {
                    expandedAnswer.sdp.split('\r\n').forEach(function (line) {
                        if (line.indexOf('a=candidate:') === 0) {
                            self._checkLocalCandidate(line);
                        }
                    });
                    
                    self.emit('answer', expandedAnswer);
                    return cb(null, expandedAnswer);
                });
        })
        .catch(function (err) {
            self.emit('error', err);
            self.logger.error(err);
            return cb(err);
        });
};

// Internal method for emitting ice candidates on our peer object
PeerConnection.prototype._onIce = function (event) {
    var self = this;
    if (event.candidate) {
        var ice = event.candidate;

        var expandedCandidate = {
            candidate: {
                candidate: ice.candidate,
                sdpMid: ice.sdpMid,
                sdpMLineIndex: ice.sdpMLineIndex
            }
        };
        this._checkLocalCandidate(ice.candidate);

        var cand = parser.toCandidateJSON(ice.candidate);

        var already;
        var idx;
        if (this.eliminateDuplicateCandidates && cand.type === 'relay') {
            // drop candidates with same foundation, component
            // take local type pref into account so we don't ignore udp
            // ones when we know about a TCP one. unlikely but...
            already = this._candidateBuffer.filter(
                function (c) {
                    return c.type === 'relay';
                }).map(function (c) {
                    return c.foundation + ':' + c.component;
                }
            );
            idx = already.indexOf(cand.foundation + ':' + cand.component);
            // remember: local type pref of udp is 0, tcp 1, tls 2
            if (idx > -1 && ((cand.priority >> 24) >= (already[idx].priority >> 24))) {
                // drop it, same foundation with higher (worse) type pref
                return;
            }
        }
        if (this.config.bundlePolicy === 'max-bundle') {
            // drop candidates which are duplicate for audio/video/data
            // duplicate means same host/port but different sdpMid
            already = this._candidateBuffer.filter(
                function (c) {
                    return cand.type === c.type;
                }).map(function (cand) {
                    return cand.address + ':' + cand.port;
                }
            );
            idx = already.indexOf(cand.address + ':' + cand.port);
            if (idx > -1) return;
        }
        // also drop rtcp candidates since we know the peer supports RTCP-MUX
        // this is a workaround until browsers implement this natively
        if (this.config.rtcpMuxPolicy === 'require' && cand.component === '2') {
            return;
        }
        this._candidateBuffer.push(cand);

        this.emit('ice', expandedCandidate);
    } else {
        this.emit('endOfCandidates');
    }
};

// Internal method for processing a new data channel being added by the
// other peer.
PeerConnection.prototype._onDataChannel = function (event) {
    // make sure we keep a reference so this doesn't get garbage collected
    var channel = event.channel;
    this._remoteDataChannels.push(channel);

    this.emit('addChannel', channel);
};

// Create a data channel spec reference:
// http://dev.w3.org/2011/webrtc/editor/webrtc.html#idl-def-RTCDataChannelInit
PeerConnection.prototype.createDataChannel = function (name, opts) {
    var channel = this.pc.createDataChannel(name, opts);

    // make sure we keep a reference so this doesn't get garbage collected
    this._localDataChannels.push(channel);

    return channel;
};

PeerConnection.prototype.getStats = function () {
    if (typeof arguments[0] === 'function') {
        var cb = arguments[0];
        this.pc.getStats().then(function (res) {
            cb(null, res);
        }, function (err) {
            cb(err);
        });
    } else {
        return this.pc.getStats.apply(this.pc, arguments);
    }
};

module.exports = PeerConnection;

},{"./parsers":5,"wildemitter":1}]},{},[2])(2)
});

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvd2lsZGVtaXR0ZXIvd2lsZGVtaXR0ZXIuanMiLCJzcmMvV2ViaW5hckNvcmUiLCJzcmMvZ2V0dXNlcm1lZGlhLmpzIiwic3JjL2xvY2FsbWVkaWEuanMiLCJzcmMvcGFyc2Vycy5qcyIsInNyYy9wZWVyTWFuYWdlci5qcyIsInNyYy9wZWVyY29ubmVjdGlvbi5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3YUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCIvKlxyXG5XaWxkRW1pdHRlci5qcyBpcyBhIHNsaW0gbGl0dGxlIGV2ZW50IGVtaXR0ZXIgYnkgQGhlbnJpa2pvcmV0ZWcgbGFyZ2VseSBiYXNlZFxyXG5vbiBAdmlzaW9ubWVkaWEncyBFbWl0dGVyIGZyb20gVUkgS2l0LlxyXG5cclxuV2h5PyBJIHdhbnRlZCBpdCBzdGFuZGFsb25lLlxyXG5cclxuSSBhbHNvIHdhbnRlZCBzdXBwb3J0IGZvciB3aWxkY2FyZCBlbWl0dGVycyBsaWtlIHRoaXM6XHJcblxyXG5lbWl0dGVyLm9uKCcqJywgZnVuY3Rpb24gKGV2ZW50TmFtZSwgb3RoZXIsIGV2ZW50LCBwYXlsb2Fkcykge1xyXG5cclxufSk7XHJcblxyXG5lbWl0dGVyLm9uKCdzb21lbmFtZXNwYWNlKicsIGZ1bmN0aW9uIChldmVudE5hbWUsIHBheWxvYWRzKSB7XHJcblxyXG59KTtcclxuXHJcblBsZWFzZSBub3RlIHRoYXQgY2FsbGJhY2tzIHRyaWdnZXJlZCBieSB3aWxkY2FyZCByZWdpc3RlcmVkIGV2ZW50cyBhbHNvIGdldFxyXG50aGUgZXZlbnQgbmFtZSBhcyB0aGUgZmlyc3QgYXJndW1lbnQuXHJcbiovXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFdpbGRFbWl0dGVyO1xyXG5cclxuZnVuY3Rpb24gV2lsZEVtaXR0ZXIoKSB7IH1cclxuXHJcbldpbGRFbWl0dGVyLm1peGluID0gZnVuY3Rpb24gKGNvbnN0cnVjdG9yKSB7XHJcbiAgICB2YXIgcHJvdG90eXBlID0gY29uc3RydWN0b3IucHJvdG90eXBlIHx8IGNvbnN0cnVjdG9yO1xyXG5cclxuICAgIHByb3RvdHlwZS5pc1dpbGRFbWl0dGVyPSB0cnVlO1xyXG5cclxuICAgIC8vIExpc3RlbiBvbiB0aGUgZ2l2ZW4gYGV2ZW50YCB3aXRoIGBmbmAuIFN0b3JlIGEgZ3JvdXAgbmFtZSBpZiBwcmVzZW50LlxyXG4gICAgcHJvdG90eXBlLm9uID0gZnVuY3Rpb24gKGV2ZW50LCBncm91cE5hbWUsIGZuKSB7XHJcbiAgICAgICAgdGhpcy5jYWxsYmFja3MgPSB0aGlzLmNhbGxiYWNrcyB8fCB7fTtcclxuICAgICAgICB2YXIgaGFzR3JvdXAgPSAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMyksXHJcbiAgICAgICAgICAgIGdyb3VwID0gaGFzR3JvdXAgPyBhcmd1bWVudHNbMV0gOiB1bmRlZmluZWQsXHJcbiAgICAgICAgICAgIGZ1bmMgPSBoYXNHcm91cCA/IGFyZ3VtZW50c1syXSA6IGFyZ3VtZW50c1sxXTtcclxuICAgICAgICBmdW5jLl9ncm91cE5hbWUgPSBncm91cDtcclxuICAgICAgICAodGhpcy5jYWxsYmFja3NbZXZlbnRdID0gdGhpcy5jYWxsYmFja3NbZXZlbnRdIHx8IFtdKS5wdXNoKGZ1bmMpO1xyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfTtcclxuXHJcbiAgICAvLyBBZGRzIGFuIGBldmVudGAgbGlzdGVuZXIgdGhhdCB3aWxsIGJlIGludm9rZWQgYSBzaW5nbGVcclxuICAgIC8vIHRpbWUgdGhlbiBhdXRvbWF0aWNhbGx5IHJlbW92ZWQuXHJcbiAgICBwcm90b3R5cGUub25jZSA9IGZ1bmN0aW9uIChldmVudCwgZ3JvdXBOYW1lLCBmbikge1xyXG4gICAgICAgIHZhciBzZWxmID0gdGhpcyxcclxuICAgICAgICAgICAgaGFzR3JvdXAgPSAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMyksXHJcbiAgICAgICAgICAgIGdyb3VwID0gaGFzR3JvdXAgPyBhcmd1bWVudHNbMV0gOiB1bmRlZmluZWQsXHJcbiAgICAgICAgICAgIGZ1bmMgPSBoYXNHcm91cCA/IGFyZ3VtZW50c1syXSA6IGFyZ3VtZW50c1sxXTtcclxuICAgICAgICBmdW5jdGlvbiBvbigpIHtcclxuICAgICAgICAgICAgc2VsZi5vZmYoZXZlbnQsIG9uKTtcclxuICAgICAgICAgICAgZnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLm9uKGV2ZW50LCBncm91cCwgb24pO1xyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfTtcclxuXHJcbiAgICAvLyBVbmJpbmRzIGFuIGVudGlyZSBncm91cFxyXG4gICAgcHJvdG90eXBlLnJlbGVhc2VHcm91cCA9IGZ1bmN0aW9uIChncm91cE5hbWUpIHtcclxuICAgICAgICB0aGlzLmNhbGxiYWNrcyA9IHRoaXMuY2FsbGJhY2tzIHx8IHt9O1xyXG4gICAgICAgIHZhciBpdGVtLCBpLCBsZW4sIGhhbmRsZXJzO1xyXG4gICAgICAgIGZvciAoaXRlbSBpbiB0aGlzLmNhbGxiYWNrcykge1xyXG4gICAgICAgICAgICBoYW5kbGVycyA9IHRoaXMuY2FsbGJhY2tzW2l0ZW1dO1xyXG4gICAgICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBoYW5kbGVycy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xyXG4gICAgICAgICAgICAgICAgaWYgKGhhbmRsZXJzW2ldLl9ncm91cE5hbWUgPT09IGdyb3VwTmFtZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vY29uc29sZS5sb2coJ3JlbW92aW5nJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gcmVtb3ZlIGl0IGFuZCBzaG9ydGVuIHRoZSBhcnJheSB3ZSdyZSBsb29waW5nIHRocm91Z2hcclxuICAgICAgICAgICAgICAgICAgICBoYW5kbGVycy5zcGxpY2UoaSwgMSk7XHJcbiAgICAgICAgICAgICAgICAgICAgaS0tO1xyXG4gICAgICAgICAgICAgICAgICAgIGxlbi0tO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfTtcclxuXHJcbiAgICAvLyBSZW1vdmUgdGhlIGdpdmVuIGNhbGxiYWNrIGZvciBgZXZlbnRgIG9yIGFsbFxyXG4gICAgLy8gcmVnaXN0ZXJlZCBjYWxsYmFja3MuXHJcbiAgICBwcm90b3R5cGUub2ZmID0gZnVuY3Rpb24gKGV2ZW50LCBmbikge1xyXG4gICAgICAgIHRoaXMuY2FsbGJhY2tzID0gdGhpcy5jYWxsYmFja3MgfHwge307XHJcbiAgICAgICAgdmFyIGNhbGxiYWNrcyA9IHRoaXMuY2FsbGJhY2tzW2V2ZW50XSxcclxuICAgICAgICAgICAgaTtcclxuXHJcbiAgICAgICAgaWYgKCFjYWxsYmFja3MpIHJldHVybiB0aGlzO1xyXG5cclxuICAgICAgICAvLyByZW1vdmUgYWxsIGhhbmRsZXJzXHJcbiAgICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHtcclxuICAgICAgICAgICAgZGVsZXRlIHRoaXMuY2FsbGJhY2tzW2V2ZW50XTtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyByZW1vdmUgc3BlY2lmaWMgaGFuZGxlclxyXG4gICAgICAgIGkgPSBjYWxsYmFja3MuaW5kZXhPZihmbik7XHJcbiAgICAgICAgY2FsbGJhY2tzLnNwbGljZShpLCAxKTtcclxuICAgICAgICBpZiAoY2FsbGJhY2tzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICBkZWxldGUgdGhpcy5jYWxsYmFja3NbZXZlbnRdO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH07XHJcblxyXG4gICAgLy8vIEVtaXQgYGV2ZW50YCB3aXRoIHRoZSBnaXZlbiBhcmdzLlxyXG4gICAgLy8gYWxzbyBjYWxscyBhbnkgYCpgIGhhbmRsZXJzXHJcbiAgICBwcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uIChldmVudCkge1xyXG4gICAgICAgIHRoaXMuY2FsbGJhY2tzID0gdGhpcy5jYWxsYmFja3MgfHwge307XHJcbiAgICAgICAgdmFyIGFyZ3MgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSksXHJcbiAgICAgICAgICAgIGNhbGxiYWNrcyA9IHRoaXMuY2FsbGJhY2tzW2V2ZW50XSxcclxuICAgICAgICAgICAgc3BlY2lhbENhbGxiYWNrcyA9IHRoaXMuZ2V0V2lsZGNhcmRDYWxsYmFja3MoZXZlbnQpLFxyXG4gICAgICAgICAgICBpLFxyXG4gICAgICAgICAgICBsZW4sXHJcbiAgICAgICAgICAgIGl0ZW0sXHJcbiAgICAgICAgICAgIGxpc3RlbmVycztcclxuXHJcbiAgICAgICAgaWYgKGNhbGxiYWNrcykge1xyXG4gICAgICAgICAgICBsaXN0ZW5lcnMgPSBjYWxsYmFja3Muc2xpY2UoKTtcclxuICAgICAgICAgICAgZm9yIChpID0gMCwgbGVuID0gbGlzdGVuZXJzLmxlbmd0aDsgaSA8IGxlbjsgKytpKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWxpc3RlbmVyc1tpXSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgbGlzdGVuZXJzW2ldLmFwcGx5KHRoaXMsIGFyZ3MpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoc3BlY2lhbENhbGxiYWNrcykge1xyXG4gICAgICAgICAgICBsZW4gPSBzcGVjaWFsQ2FsbGJhY2tzLmxlbmd0aDtcclxuICAgICAgICAgICAgbGlzdGVuZXJzID0gc3BlY2lhbENhbGxiYWNrcy5zbGljZSgpO1xyXG4gICAgICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBsaXN0ZW5lcnMubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcclxuICAgICAgICAgICAgICAgIGlmICghbGlzdGVuZXJzW2ldKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcnNbaV0uYXBwbHkodGhpcywgW2V2ZW50XS5jb25jYXQoYXJncykpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH07XHJcblxyXG4gICAgLy8gSGVscGVyIGZvciBmb3IgZmluZGluZyBzcGVjaWFsIHdpbGRjYXJkIGV2ZW50IGhhbmRsZXJzIHRoYXQgbWF0Y2ggdGhlIGV2ZW50XHJcbiAgICBwcm90b3R5cGUuZ2V0V2lsZGNhcmRDYWxsYmFja3MgPSBmdW5jdGlvbiAoZXZlbnROYW1lKSB7XHJcbiAgICAgICAgdGhpcy5jYWxsYmFja3MgPSB0aGlzLmNhbGxiYWNrcyB8fCB7fTtcclxuICAgICAgICB2YXIgaXRlbSxcclxuICAgICAgICAgICAgc3BsaXQsXHJcbiAgICAgICAgICAgIHJlc3VsdCA9IFtdO1xyXG5cclxuICAgICAgICBmb3IgKGl0ZW0gaW4gdGhpcy5jYWxsYmFja3MpIHtcclxuICAgICAgICAgICAgc3BsaXQgPSBpdGVtLnNwbGl0KCcqJyk7XHJcbiAgICAgICAgICAgIGlmIChpdGVtID09PSAnKicgfHwgKHNwbGl0Lmxlbmd0aCA9PT0gMiAmJiBldmVudE5hbWUuc2xpY2UoMCwgc3BsaXRbMF0ubGVuZ3RoKSA9PT0gc3BsaXRbMF0pKSB7XHJcbiAgICAgICAgICAgICAgICByZXN1bHQgPSByZXN1bHQuY29uY2F0KHRoaXMuY2FsbGJhY2tzW2l0ZW1dKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gcmVzdWx0O1xyXG4gICAgfTtcclxuXHJcbn07XHJcblxyXG5XaWxkRW1pdHRlci5taXhpbihXaWxkRW1pdHRlcik7XHJcbiIsInZhciBMb2NhbE1lZGlhID0gcmVxdWlyZSgnLi9sb2NhbG1lZGlhJyk7XHJcbnZhciBQZWVyTWFuYWdlciA9IHJlcXVpcmUoJy4vcGVlck1hbmFnZXInKTtcclxuXHJcbmZ1bmN0aW9uIFdlYmluYXJDb3JlKGNvbm5lY3Rpb24sIG9wdGlvbnMpIHtcclxuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xyXG4gICAgLy8gY2FsbCBlbWl0dGVyIGNvbnN0cnVjdG9yXHJcbiAgICBMb2NhbE1lZGlhLmNhbGwodGhpcywgb3B0aW9ucyk7XHJcblxyXG4gICAgdmFyIGRlZmF1bHRDb25maWcgPSB7XHJcbiAgICAgICAgZGVidWc6IGZhbHNlLFxyXG4gICAgICAgIGxvZ2dlcjogY29uc29sZSxcclxuICAgICAgICBwZWVyQ29ubmVjdGlvbkNvbmZpZzoge1xyXG4gICAgICAgICAgICBpY2VTZXJ2ZXJzOiBbXHJcbiAgICAgICAgICAgICAgICB7ICd1cmxzJzogJ3N0dW46c3R1bi5sLmdvb2dsZS5jb206MTkzMDInIH1cclxuICAgICAgICAgICAgXVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgcGVlckNvbm5lY3Rpb25Db25zdHJhaW50czoge1xyXG4gICAgICAgICAgICBvcHRpb25hbDogW1xyXG4gICAgICAgICAgICAgICAgeyBEdGxzU3J0cEtleUFncmVlbWVudDogdHJ1ZSB9LFxyXG4gICAgICAgICAgICAgICAgeyBSdHBEYXRhQ2hhbm5lbHM6IHRydWUgfVxyXG4gICAgICAgICAgICBdXHJcbiAgICAgICAgfSxcclxuICAgICAgICByZWNlaXZlTWVkaWE6IHtcclxuICAgICAgICAgICAgb2ZmZXJUb1JlY2VpdmVBdWRpbzogMSxcclxuICAgICAgICAgICAgb2ZmZXJUb1JlY2VpdmVWaWRlbzogMVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgbWVkaWE6IHtcclxuICAgICAgICAgICAgdmlkZW86IHtcclxuICAgICAgICAgICAgICAgIG1hbmRhdG9yeToge1xyXG4gICAgICAgICAgICAgICAgICAgIG1pbkFzcGVjdFJhdGlvOiAxLjMzXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIGF1ZGlvOiB0cnVlXHJcbiAgICAgICAgfSxcclxuICAgICAgICBkZXRlY3RTcGVha2luZ0V2ZW50czogZmFsc2UsXHJcbiAgICAgICAgYXVkaW9GYWxsYmFjazogZmFsc2UsXHJcbiAgICAgICAgZW5hYmxlRGF0YUNoYW5uZWxzOiBmYWxzZSxcclxuICAgICAgICBpc0xlYWRlcjogZmFsc2UsXHJcbiAgICAgICAgaXNPbmVXYXk6IHRydWUsXHJcbiAgICAgICAgdXNlcklkOiBudWxsXHJcbiAgICB9O1xyXG4gICAgdGhpcy5jb25maWcgPSBkZWZhdWx0Q29uZmlnO1xyXG5cclxuICAgIGZvciAodmFyIGl0ZW0gaW4gb3B0aW9ucykge1xyXG4gICAgICAgIGlmIChvcHRpb25zLmhhc093blByb3BlcnR5KGl0ZW0pKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnW2l0ZW1dID0gb3B0aW9uc1tpdGVtXTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICB0aGlzLmxvZ2dlciA9IHRoaXMuY29uZmlnLmxvZ2dlcjtcclxuICAgIHRoaXMuY29ubmVjdGlvbiA9IGNvbm5lY3Rpb247XHJcblxyXG4gICAgdmFyIHBlZXJNYW5hZ2VyQ29uZmlnID0ge1xyXG4gICAgICAgIGRlYnVnOiB0aGlzLmNvbmZpZy5kZWJ1ZyxcclxuICAgICAgICBsb2dnZXI6IHRoaXMubG9nZ2VyLFxyXG4gICAgICAgIHBlZXJDb25uZWN0aW9uQ29uZmlnOiB0aGlzLmNvbmZpZy5wZWVyQ29ubmVjdGlvbkNvbmZpZyxcclxuICAgICAgICBwZWVyQ29ubmVjdGlvbkNvbnN0cmFpbnRzOiB0aGlzLmNvbmZpZy5wZWVyQ29ubmVjdGlvbkNvbnN0cmFpbnRzLFxyXG4gICAgICAgIGVuYWJsZURhdGFDaGFubmVsczogdGhpcy5jb25maWcuZW5hYmxlRGF0YUNoYW5uZWxzXHJcbiAgICB9O1xyXG4gICAgdGhpcy5wZWVyTWFuYWdlciA9IG5ldyBQZWVyTWFuYWdlcihwZWVyTWFuYWdlckNvbmZpZyk7XHJcbiAgICBpZiAoIXRoaXMuY29uZmlnLmlzTGVhZGVyKSB7XHJcbiAgICAgICAgdGhpcy5fY3JlYXRlTG9jYWxQZWVyKHRoaXMuY29uZmlnLnVzZXJJZCk7XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5jb25uZWN0aW9uLm9uKFwib25NZXNzYWdlUmVjZWl2ZWRcIiwgdGhpcy5faGFuZGxlTWVzc2FnZS5iaW5kKHRoaXMpKTtcclxuICAgIHRoaXMub24oXCJsb2NhbFN0cmVhbVwiLCB0aGlzLl9oYW5kbGVTdHJlYW0uYmluZCh0aGlzKSk7XHJcbiAgICB0aGlzLm9uKFwibG9jYWxTY3JlZW5cIiwgdGhpcy5faGFuZGxlU2NyZWVuLmJpbmQodGhpcykpO1xyXG4gICAgdGhpcy5vbihcImxvY2FsU3RyZWFtRW5kZWRcIiwgdGhpcy5faGFuZGxlU3RyZWFtRW5kZWQuYmluZCh0aGlzKSk7XHJcbiAgICB0aGlzLm9uKFwibG9jYWxTY3JlZW5FbmRlZFwiLCB0aGlzLl9oYW5kbGVTdHJlYW1FbmRlZC5iaW5kKHRoaXMpKTtcclxuXHJcbiAgICB0aGlzLl9sb2cgPSB0aGlzLmxvZ2dlci5sb2cuYmluZCh0aGlzLmxvZ2dlciwgXCJXZWJpbmFyQ29yZTogXCIpO1xyXG4gICAgXHJcbiAgICB0aGlzLnJlbW90ZVN0cmVhbXMgPSBbXTtcclxuICAgIHRoaXMuX3N0cmVhbXNJbmZvID0ge307XHJcbiAgICB0aGlzLl9zZHBCdWZmZXIgPSBbXTtcclxufVxyXG5cclxuV2ViaW5hckNvcmUucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShMb2NhbE1lZGlhLnByb3RvdHlwZSk7XHJcblxyXG5XZWJpbmFyQ29yZS5wcm90b3R5cGUuYWRkUGVlciA9IGZ1bmN0aW9uIChpZCkge1xyXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gICAgaWYgKGlkID09PSB0aGlzLmNvbmZpZy51c2VySWQpXHJcbiAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgIHZhciBwZWVyID0gdGhpcy5wZWVyTWFuYWdlci5nZXRQZWVyKGlkKTtcclxuICAgIGlmICghcGVlcikge1xyXG4gICAgICAgIHRoaXMuX2xvZ0RlYnVnKFwiQ3JlYXRlIHBlZXIgZm9yIHVzZXIgXCIsIGlkKTtcclxuICAgICAgICBwZWVyID0gdGhpcy5wZWVyTWFuYWdlci5jcmVhdGVQZWVyKGlkKTtcclxuXHJcbiAgICAgICAgLy8gc2VuZCBhbnkgaWNlIGNhbmRpZGF0ZXMgdG8gdGhlIG90aGVyIHBlZXJcclxuICAgICAgICBwZWVyLm9uKFwiaWNlXCIsIGZ1bmN0aW9uKGV2dCkge1xyXG4gICAgICAgICAgICB2YXIgcGMgPSB0aGlzO1xyXG4gICAgICAgICAgICBpZiAoZXZ0LmNhbmRpZGF0ZSkge1xyXG4gICAgICAgICAgICAgICAgdmFyIHVzZXJJZCA9IHNlbGYuY29uZmlnLnVzZXJJZDtcclxuICAgICAgICAgICAgICAgIGV2dC5mcm9tID0gdXNlcklkO1xyXG4gICAgICAgICAgICAgICAgZXZ0LnR5cGUgPSBcImNhbmRpZGF0ZVwiO1xyXG4gICAgICAgICAgICAgICAgZXZ0LnRvID0gcGMudXNlcklkO1xyXG4gICAgICAgICAgICAgICAgc2VsZi5jb25uZWN0aW9uLnNlbmQoZXZ0KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICAvL2NyZWF0ZSBvZmZlciBpZiBuZWVkZWRcclxuICAgICAgICBwZWVyLm9uKFwibmVnb3RpYXRpb25OZWVkZWRcIiwgZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICB2YXIgcGMgPSB0aGlzO1xyXG4gICAgICAgICAgICBzZWxmLl9jcmVhdGVPZmZlci5iaW5kKHNlbGYpO1xyXG4gICAgICAgICAgICBzZWxmLl9jcmVhdGVPZmZlcihwYyk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIG9uY2UgcmVtb3RlIHN0cmVhbSBhcnJpdmVzLCBzaG93IGl0IGluIHRoZSByZW1vdGUgdmlkZW8gZWxlbWVudFxyXG4gICAgICAgIHBlZXIub24oXCJhZGRTdHJlYW1cIiwgdGhpcy5faGFuZGxlUmVtb3RlU3RyZWFtLmJpbmQodGhpcywgcGVlcikpO1xyXG5cclxuICAgICAgICBwZWVyLm9uKFwiaWNlQ29ubmVjdGlvblN0YXRlQ2hhbmdlXCIsIGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuaWNlQ29ubmVjdGlvblN0YXRlID09PSBcImZhaWxlZFwiKSB7XHJcbiAgICAgICAgICAgICAgICBzZWxmLmFkZFBlZXIodGhpcy51c2VySWQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vYWRkIG9wZW5lZCBzdHJlYW1zXHJcbiAgICAgICAgdGhpcy5sb2NhbFN0cmVhbXMuZm9yRWFjaChmdW5jdGlvbihzdHJlYW0pIHtcclxuICAgICAgICAgICAgc2VsZi5fc2VuZFN0cmVhbUluZm8oc3RyZWFtLCBwZWVyLnVzZXJJZCk7XHJcbiAgICAgICAgICAgIHBlZXIuYWRkU3RyZWFtKHN0cmVhbSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRoaXMubG9jYWxTY3JlZW5zLmZvckVhY2goZnVuY3Rpb24oc3RyZWFtKSB7XHJcbiAgICAgICAgICAgIHNlbGYuX3NlbmRTdHJlYW1JbmZvKHN0cmVhbSwgcGVlci51c2VySWQpO1xyXG4gICAgICAgICAgICBwZWVyLmFkZFN0cmVhbShzdHJlYW0pO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICB2YXIgbmVlZFRvQ3JlYXRlT2ZmZXIgPSB0aGlzLmxvY2FsU3RyZWFtcy5sZW5ndGggPT09IDAgJiZcclxuICAgICAgICAgICAgdGhpcy5sb2NhbFNjcmVlbnMubGVuZ3RoID09PSAwICYmXHJcbiAgICAgICAgICAgICF0aGlzLmNvbmZpZy5pc09uZVdheTtcclxuXHJcbiAgICAgICAgLy9jcmVhdGUgY29ubmVjdGlvblxyXG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy5pc0xlYWRlciAmJiBuZWVkVG9DcmVhdGVPZmZlcikge1xyXG4gICAgICAgICAgICB0aGlzLl9jcmVhdGVPZmZlcihwZWVyKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvL3JlY3JlYXRlIHBlZXJcclxuICAgICAgICB0aGlzLl9sb2dEZWJ1ZyhcIlJlY3JlYXRlIHBlZXIgZm9yIHVzZXIgXCIsIGlkKTtcclxuICAgICAgICB0aGlzLnBlZXJNYW5hZ2VyLnJlbW92ZVBlZXIoaWQpO1xyXG4gICAgICAgIHRoaXMuYWRkUGVlcihpZCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbldlYmluYXJDb3JlLnByb3RvdHlwZS5yZW1vdmVQZWVyID0gZnVuY3Rpb24gKGlkKSB7XHJcbiAgICB0aGlzLl9sb2dEZWJ1ZyhcIlJlbW92ZSBwZWVyIGZvciB1c2VyIFwiLCBpZCk7XHJcbiAgICByZXR1cm4gdGhpcy5wZWVyTWFuYWdlci5yZW1vdmVQZWVyKGlkKTtcclxufVxyXG5cclxuV2ViaW5hckNvcmUucHJvdG90eXBlLl9jcmVhdGVMb2NhbFBlZXIgPSBmdW5jdGlvbiAodXNlcklkKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICBcclxuICAgIHZhciBsb2NhbFBlZXIgPSB0aGlzLnBlZXJNYW5hZ2VyLmNyZWF0ZUxvY2FsUGVlcih1c2VySWQpO1xyXG4gICAgbG9jYWxQZWVyLm9uKFwiYWRkU3RyZWFtXCIsIHRoaXMuX2hhbmRsZVJlbW90ZVN0cmVhbS5iaW5kKHRoaXMsIGxvY2FsUGVlcikpO1xyXG4gICAgbG9jYWxQZWVyLm9uKFwiaWNlXCIsIGZ1bmN0aW9uIChldnQpIHtcclxuICAgICAgICB2YXIgcGMgPSB0aGlzO1xyXG4gICAgICAgIGlmIChldnQuY2FuZGlkYXRlKSB7XHJcbiAgICAgICAgICAgIGV2dC5mcm9tID0gcGMudXNlcklkO1xyXG4gICAgICAgICAgICBldnQudG8gPSBcIiNsZWFkZXJcIjtcclxuICAgICAgICAgICAgZXZ0LnR5cGUgPSBcImNhbmRpZGF0ZVwiO1xyXG4gICAgICAgICAgICBzZWxmLmNvbm5lY3Rpb24uc2VuZChldnQpO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG5cclxuICAgIGxvY2FsUGVlci5vbihcImljZUNvbm5lY3Rpb25TdGF0ZUNoYW5nZVwiLCBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuaWNlQ29ubmVjdGlvblN0YXRlID09PSBcImZhaWxlZFwiKSB7XHJcbiAgICAgICAgICAgIHNlbGYuZW1pdChcImljZUZhaWxlZFwiKTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICBsb2NhbFBlZXIub24oXCJzaWduYWxpbmdTdGF0ZUNoYW5nZVwiLCBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgLy9wb3Agb2ZmZXIgZnJvbSBxdWV1ZVxyXG4gICAgICAgIGlmICh0aGlzLnNpZ25hbGluZ1N0YXRlID09PSBcInN0YWJsZVwiKSB7XHJcbiAgICAgICAgICAgIHZhciBvZmZlciA9IHNlbGYuX3NkcEJ1ZmZlci5zaGlmdCgpO1xyXG4gICAgICAgICAgICBpZiAoIW9mZmVyKVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgICAgICAgICAgc2VsZi5faGFuZGxlTWVzc2FnZShvZmZlcik7XHJcbiAgICAgICAgICAgIHNlbGYuX2xvZ0RlYnVnKFwiUG9wIG9mZmVyIGZyb20gdXNlciBcIiwgb2ZmZXIuZnJvbSk7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgLy9hZGQgb3BlbmVkIHN0cmVhbXNcclxuICAgIHRoaXMubG9jYWxTdHJlYW1zLmZvckVhY2goZnVuY3Rpb24gKHN0cmVhbSkge1xyXG4gICAgICAgIGxvY2FsUGVlci5hZGRTdHJlYW0oc3RyZWFtKTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuX2xvZ0RlYnVnKFwiQ3JlYXRlIGxvY2FsIHBlZXIgZm9yIHVzZXIgXCIsIHVzZXJJZCk7XHJcbiAgICByZXR1cm4gbG9jYWxQZWVyO1xyXG59XHJcblxyXG5XZWJpbmFyQ29yZS5wcm90b3R5cGUuX2hhbmRsZU1lc3NhZ2UgPSBmdW5jdGlvbiAobWVzc2FnZSkge1xyXG4gICAgdmFyIG1zZyA9IEpTT04ucGFyc2UobWVzc2FnZSk7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICB2YXIgcGM7XHJcbiAgICAvL2ZpbmQgcGVlclxyXG4gICAgaWYgKHRoaXMuY29uZmlnLmlzTGVhZGVyKSB7XHJcbiAgICAgICAgcGMgPSB0aGlzLnBlZXJNYW5hZ2VyLmdldFBlZXIobXNnLmZyb20pO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB2YXIgdXNlcklkID0gdGhpcy5jb25maWcudXNlcklkO1xyXG4gICAgICAgIGlmIChtc2cudG8gJiYgbXNnLnRvICE9PSB1c2VySWQpXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgcGMgPSB0aGlzLnBlZXJNYW5hZ2VyLmxvY2FsUGVlcjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoIXBjKSB7XHJcbiAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoXCJQZWVyIG5vdCBmb3VuZDogXCIgKyBtc2cuZnJvbSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChtc2cudHlwZSA9PT0gXCJvZmZlclwiKSB7XHJcbiAgICAgICAgdGhpcy5fbG9nRGVidWcoXCJSZWNlaXZlIG9mZmVyIGZyb20gdXNlciBcIiwgbXNnLmZyb20pO1xyXG4gICAgICAgIHBjID0gc2VsZi5fY3JlYXRlTG9jYWxQZWVyKHNlbGYuY29uZmlnLnVzZXJJZCk7XHJcbiAgICAgICAgcGMucmVtb3RlSWQgPSBtc2cuZnJvbTtcclxuXHJcbiAgICAgICAgaWYgKHBjLnNpZ25hbGluZ1N0YXRlICE9PSBcInN0YWJsZVwiKSB7XHJcbiAgICAgICAgICAgIHRoaXMuX3NkcEJ1ZmZlci5wdXNoKG1zZyk7XHJcbiAgICAgICAgICAgIHRoaXMuX2xvZ0RlYnVnKFwiUHV0IG9mZmVyIGZyb20gdXNlciBcIiArIG1zZy5mcm9tICsgXCJ0byBxdWV1ZVwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBwYy5oYW5kbGVPZmZlcihtc2csIGZ1bmN0aW9uIChlcnIpIHtcclxuICAgICAgICAgICAgaWYgKGVycikgcmV0dXJuO1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICBwYy5jcmVhdGVBbnN3ZXIoZnVuY3Rpb24gKGVyciwgYW5zd2VyKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGFuc3dlci5mcm9tID0gc2VsZi5jb25maWcudXNlcklkO1xyXG4gICAgICAgICAgICAgICAgYW5zd2VyLnRvID0gbXNnLmZyb207XHJcbiAgICAgICAgICAgICAgICBhbnN3ZXIuaWQgPSBtc2cuaWQ7XHJcbiAgICAgICAgICAgICAgICBzZWxmLmNvbm5lY3Rpb24uc2VuZChhbnN3ZXIpO1xyXG4gICAgICAgICAgICAgICAgc2VsZi5fbG9nRGVidWcoXCJTZW5kIGFuc3dlciBcIiwgYW5zd2VyKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAobXNnLnR5cGUgPT09IFwiY2FuZGlkYXRlXCIpIHtcclxuICAgICAgICBwYy5wcm9jZXNzSWNlKG1zZyk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChtc2cudHlwZSA9PT0gXCJhbnN3ZXJcIikge1xyXG4gICAgICAgIHRoaXMuX2xvZ0RlYnVnKFwiUmVjZWl2ZSBhbnN3ZXIgZnJvbSBcIiwgbXNnLmZyb20pO1xyXG5cclxuICAgICAgICBpZiAocGMub2ZmZXJJZCAhPT0gbXNnLmlkKVxyXG4gICAgICAgICAgICByZXR1cm47XHJcblxyXG4gICAgICAgIHBjLmhhbmRsZUFuc3dlcihtc2cpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAobXNnLnR5cGUgPT09IFwibWVkaWEtY2FwdHVyZWRcIikge1xyXG4gICAgICAgIHNlbGYuX3N0cmVhbXNJbmZvW21zZy5kYXRhLnN0cmVhbUlkXSA9IG1zZy5kYXRhO1xyXG4gICAgICAgIHNlbGYuX2xvZ0RlYnVnKFwiUmVjZWl2ZSBtZWRpYSBjYXB0dXJlZCBtZXNzYWdlXCIsIG1zZyk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy5pc0xlYWRlciAmJiAhdGhpcy5jb25maWcuaXNPbmVXYXkpIHtcclxuICAgICAgICAgICAgdmFyIHJzdHJlYW1zID0gdGhpcy5yZW1vdGVTdHJlYW1zLmZpbHRlcihmdW5jdGlvbiAoc3RyZWFtKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gc3RyZWFtLmlkID09PSBtc2cuZGF0YS5zdHJlYW1JZDtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBpZiAocnN0cmVhbXMubGVuZ3RoID09PSAwKVxyXG4gICAgICAgICAgICAgICAgdGhpcy5fY3JlYXRlT2ZmZXIocGMpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8vYW5vdGhlciB3YXkgdG8gaGFuZGxlIHJlbW90ZSBzdHJlYW1zIGVuZGVkXHJcbiAgICBpZiAobXNnLnR5cGUgPT09IFwic3RyZWFtLWVuZGVkXCIpIHtcclxuICAgICAgICB2YXIgc3RyZWFtcyA9IHNlbGYucmVtb3RlU3RyZWFtcy5maWx0ZXIoZnVuY3Rpb24oc3RyZWFtKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBzdHJlYW0uaWQgPT09IG1zZy5kYXRhLnN0cmVhbUlkO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBpZiAoc3RyZWFtcy5sZW5ndGggPiAwKVxyXG4gICAgICAgICAgICBzZWxmLl9oYW5kbGVSZW1vdGVTdHJlYW1FbmRlZChzdHJlYW1zWzBdKTtcclxuXHJcbiAgICAgICAgdGhpcy5fbG9nRGVidWcoXCJSZWNlaXZlIHN0cmVhbSBlbmRlZCBtZXNzYWdlOiBcIiwgbXNnKTtcclxuXHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMubG9nZ2VyLndhcm4oXCJVbmtub3duIG1lc3NhZ2U6XCIgKyBtc2cpO1xyXG59XHJcblxyXG5XZWJpbmFyQ29yZS5wcm90b3R5cGUuX2NyZWF0ZU9mZmVyID0gZnVuY3Rpb24gKHBjKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcblxyXG4gICAgcGMuY3JlYXRlT2ZmZXIoc2VsZi5jb25maWcucmVjZWl2ZU1lZGlhLFxyXG4gICAgICAgIGZ1bmN0aW9uIChlcnJvciwgb2ZmZXIpIHtcclxuICAgICAgICAgICAgaWYgKGVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihlcnJvcik7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHZhciB1c2VySWQgPSBzZWxmLmNvbmZpZy51c2VySWQ7XHJcbiAgICAgICAgICAgIG9mZmVyLmZyb20gPSB1c2VySWQ7XHJcbiAgICAgICAgICAgIG9mZmVyLnRvID0gcGMudXNlcklkO1xyXG4gICAgICAgICAgICBvZmZlci5pZCA9IERhdGUubm93KCk7XHJcbiAgICAgICAgICAgIHBjLm9mZmVySWQgPSBvZmZlci5pZDtcclxuXHJcbiAgICAgICAgICAgIHNlbGYuX2xvZ0RlYnVnKFwiQ3JlYXRlIG9mZmVyIFwiLCBvZmZlcik7XHJcbiAgICAgICAgICAgIHNlbGYuY29ubmVjdGlvbi5zZW5kKG9mZmVyKTtcclxuICAgICAgICB9KTtcclxufVxyXG5cclxuV2ViaW5hckNvcmUucHJvdG90eXBlLl9oYW5kbGVTdHJlYW0gPSBmdW5jdGlvbiAoc3RyZWFtKSB7XHJcbiAgICB2YXIgdG8gPSB0aGlzLmNvbmZpZy5pc0xlYWRlciA/IG51bGwgOiBcIiNsZWFkZXJcIjtcclxuICAgIHRoaXMuX3NlbmRTdHJlYW1JbmZvKHN0cmVhbSwgdG8pO1xyXG4gICAgdGhpcy5wZWVyTWFuYWdlci5hZGRTdHJlYW0oc3RyZWFtKTtcclxuXHJcbiAgICAvL2FkZCBsb2NhbCBzdHJlYW0gdG8gbG9jYWwgcGVlciBpZiBUd29XYXkgbW9kZVxyXG4gICAgaWYgKHRoaXMucGVlck1hbmFnZXIubG9jYWxQZWVyKVxyXG4gICAgICAgIHRoaXMucGVlck1hbmFnZXIubG9jYWxQZWVyLmFkZFN0cmVhbShzdHJlYW0pO1xyXG5cclxuICAgIHRoaXMuX2xvZ0RlYnVnKFwiU3RyZWFtIGNhcHR1cmVkIFwiLCBzdHJlYW0pO1xyXG59XHJcblxyXG5XZWJpbmFyQ29yZS5wcm90b3R5cGUuX2hhbmRsZVNjcmVlbiA9IGZ1bmN0aW9uIChzdHJlYW0pIHtcclxuICAgIHRoaXMuX3NlbmRTdHJlYW1JbmZvKHN0cmVhbSk7XHJcbiAgICB0aGlzLnBlZXJNYW5hZ2VyLmFkZFN0cmVhbShzdHJlYW0pO1xyXG4gICAgdGhpcy5fbG9nRGVidWcoXCJTY3JlZW4gY2FwdHVyZWQgXCIsIHN0cmVhbSk7XHJcbn1cclxuXHJcbldlYmluYXJDb3JlLnByb3RvdHlwZS5faGFuZGxlU3RyZWFtRW5kZWQgPSBmdW5jdGlvbiAoc3RyZWFtKSB7XHJcbiAgICB0aGlzLnBlZXJNYW5hZ2VyLnJlbW92ZVN0cmVhbShzdHJlYW0pO1xyXG5cclxuICAgIHZhciBtc2cgPSB7XHJcbiAgICAgICAgdHlwZTogXCJzdHJlYW0tZW5kZWRcIixcclxuICAgICAgICBmcm9tOiB0aGlzLmNvbmZpZy51c2VySWQsXHJcbiAgICAgICAgZGF0YToge1xyXG4gICAgICAgICAgICBzdHJlYW1JZDogc3RyZWFtLmlkLFxyXG4gICAgICAgICAgICB0eXBlOiBzdHJlYW0udHlwZVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHRoaXMuY29ubmVjdGlvbi5zZW5kKG1zZyk7XHJcbiAgICB0aGlzLl9sb2dEZWJ1ZyhcIlN0cmVhbSBlbmRlZCBcIiwgc3RyZWFtKTtcclxufVxyXG5cclxuV2ViaW5hckNvcmUucHJvdG90eXBlLl9oYW5kbGVSZW1vdGVTdHJlYW0gPSBmdW5jdGlvbiAocGVlciwgZSkge1xyXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xyXG5cclxuICAgIHZhciB0cmFja3MgPSBlLnN0cmVhbS5nZXRUcmFja3MoKTtcclxuICAgIGlmICghZS5zdHJlYW0uYWN0aXZlIHx8IHRyYWNrcy5sZW5ndGggPCAxKVxyXG4gICAgICAgIHJldHVybjtcclxuXHJcbiAgICAvL2V4dGVuZCBzdHJlYW0gd2l0aCBhZGRpdGlvbmFsIGluZm9cclxuICAgIGlmIChwZWVyKSB7XHJcbiAgICAgICAgZS5zdHJlYW1bXCJ1c2VySWRcIl0gPSBwZWVyLnVzZXJJZDtcclxuXHJcbiAgICAgICAgaWYgKCF0aGlzLmlzTGVhZGVyICYmIHBlZXIucmVtb3RlSWQpXHJcbiAgICAgICAgICAgIGUuc3RyZWFtW1widXNlcklkXCJdID0gcGVlci5yZW1vdGVJZDtcclxuICAgIH1cclxuXHJcbiAgICAvL3NldCBkZWZhdWx0IHR5cGVcclxuICAgIGlmIChlLnN0cmVhbS5nZXRWaWRlb1RyYWNrcygpLmxlbmd0aCA+IDAgJiZcclxuICAgICAgICBlLnN0cmVhbS5nZXRBdWRpb1RyYWNrcygpLmxlbmd0aCA+IDApXHJcbiAgICAgICAgZS5zdHJlYW0udHlwZSA9IFwiY2FtZXJhXCI7XHJcbiAgICBlbHNlIGlmIChlLnN0cmVhbS5nZXRWaWRlb1RyYWNrcygpLmxlbmd0aCA+IDBcclxuICAgICAgICAmJiBlLnN0cmVhbS5nZXRBdWRpb1RyYWNrcygpLmxlbmd0aCA9PT0gMClcclxuICAgICAgICBlLnN0cmVhbS50eXBlID0gXCJzY3JlZW5cIjtcclxuICAgIGVsc2UgaWYgKGUuc3RyZWFtLmdldFZpZGVvVHJhY2tzKCkubGVuZ3RoID09PSAwICYmXHJcbiAgICAgICAgZS5zdHJlYW0uZ2V0QXVkaW9UcmFja3MoKS5sZW5ndGggPiAwKVxyXG4gICAgICAgIGUuc3RyZWFtLnR5cGUgPSBcImNhbWVyYVwiOyAvLyBtaWNyb3Bob25lXHJcblxyXG4gICAgLy91cGRhdGUgdHlwZSBmcm9tIGNhY2hlXHJcbiAgICB2YXIgaW5mbyA9IHNlbGYuX3N0cmVhbXNJbmZvW2Uuc3RyZWFtLmlkXTtcclxuICAgIGlmIChpbmZvKVxyXG4gICAgICAgIGUuc3RyZWFtW1widHlwZVwiXSA9IGluZm8udHlwZTtcclxuXHJcblxyXG4gICAgdGhpcy5yZW1vdGVTdHJlYW1zLnB1c2goZS5zdHJlYW0pO1xyXG5cclxuICAgIGUuc3RyZWFtLmdldFRyYWNrcygpLmZvckVhY2goZnVuY3Rpb24gKHRyYWNrKSB7XHJcbiAgICAgICAgdHJhY2suYWRkRXZlbnRMaXN0ZW5lcihcImVuZGVkXCIsIGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgaWYgKHNlbGYuX2lzQWxsVHJhY2tzRW5kZWQoZS5zdHJlYW0pKSB7XHJcbiAgICAgICAgICAgICAgICBzZWxmLl9oYW5kbGVSZW1vdGVTdHJlYW1FbmRlZChlLnN0cmVhbSk7XHJcbiAgICAgICAgICAgICAgICBzZWxmLl9sb2dEZWJ1ZyhcIlJlbW90ZSBzdHJlYW0gZW5kZWQ6IFwiLCBlLnN0cmVhbSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuZW1pdChcInJlbW90ZVN0cmVhbVwiLCBlLnN0cmVhbSk7XHJcbn1cclxuXHJcbldlYmluYXJDb3JlLnByb3RvdHlwZS5faGFuZGxlUmVtb3RlU3RyZWFtRW5kZWQgPSBmdW5jdGlvbihzdHJlYW0pIHtcclxuICAgIHN0cmVhbS5zdG9wKCk7XHJcbiAgICB0aGlzLnJlbW90ZVN0cmVhbXMucmVtb3ZlSXRlbShzdHJlYW0pO1xyXG4gICAgdGhpcy5lbWl0KFwicmVtb3RlU3RyZWFtRW5kZWRcIiwgc3RyZWFtKTtcclxufVxyXG5cclxuV2ViaW5hckNvcmUucHJvdG90eXBlLl9zZW5kU3RyZWFtSW5mbyA9IGZ1bmN0aW9uIChzdHJlYW0sIHRvKSB7XHJcbiAgICB2YXIgbXNnID0ge1xyXG4gICAgICAgIHR5cGU6IFwibWVkaWEtY2FwdHVyZWRcIixcclxuICAgICAgICBmcm9tOiB0aGlzLmNvbmZpZy51c2VySWQsXHJcbiAgICAgICAgZGF0YToge1xyXG4gICAgICAgICAgICBzdHJlYW1JZDogc3RyZWFtLmlkLFxyXG4gICAgICAgICAgICB0eXBlOiBzdHJlYW0udHlwZVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAodG8pXHJcbiAgICAgICAgbXNnLnRvID0gdG87XHJcbiAgICB0aGlzLmNvbm5lY3Rpb24uc2VuZChtc2cpO1xyXG59XHJcblxyXG5XZWJpbmFyQ29yZS5wcm90b3R5cGUuX2xvZ0RlYnVnID0gZnVuY3Rpb24obWVzc2FnZSwgYXJncylcclxue1xyXG4gICAgaWYgKHRoaXMuY29uZmlnLmRlYnVnICYmIGFyZ3VtZW50cy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgdGhpcy5sb2dnZXIubG9nKG1lc3NhZ2UsIGFyZ3MpO1xyXG4gICAgfVxyXG59XHJcblxyXG5XZWJpbmFyQ29yZS5wcm90b3R5cGUuY29ubmVjdCA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XHJcbiAgICBpZiAoIXRoaXMuY29ubmVjdGlvbiB8fCAhdGhpcy5jb25uZWN0aW9uLmNvbm5lY3QpIHtcclxuICAgICAgICB0aGlzLmxvZ2dlci5lcnJvcihcIlBsZWFzZSBwcm92aWRlIHByb3BlciBjb25uZWN0aW9uIG9iamVjdFwiKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gICAgdGhpcy5jb25uZWN0aW9uLmNvbm5lY3Qob3B0aW9ucywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgc2VsZi5lbWl0KFwiY29ubmVjdGVkXCIpO1xyXG4gICAgfSk7XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gV2ViaW5hckNvcmU7IiwiLy91c2Ugd2VicnRjLWFkYXB0ZXIgaWYgbmVlZCBzdXBwb3J0IG9sZCBicm93c2Vyc1xyXG4vL3ZhciBhZGFwdGVyID0gcmVxdWlyZSgnd2VicnRjLWFkYXB0ZXInKTtcclxuXHJcbid1c2Ugc3RyaWN0JztcclxuXHJcbm5hdmlnYXRvci5nZXRVc2VyTWVkaWEgPSBuYXZpZ2F0b3IuZ2V0VXNlck1lZGlhIHx8IFxyXG4gICAgbmF2aWdhdG9yLm1vekdldFVzZXJNZWRpYSB8fFxyXG4gICAgbmF2aWdhdG9yLndlYmtpdEdldFVzZXJNZWRpYSB8fFxyXG4gICAgbmF2aWdhdG9yLm1zR2V0VXNlck1lZGlhO1xyXG5cclxuLy8gbWFrZSBzdXJlIGl0J3Mgc3VwcG9ydGVkIGFuZCBiaW5kIHRvIG5hdmlnYXRvclxyXG5pZiAobmF2aWdhdG9yLmdldFVzZXJNZWRpYSkge1xyXG4gICAgbmF2aWdhdG9yLmdldFVzZXJNZWRpYSA9IG5hdmlnYXRvci5nZXRVc2VyTWVkaWEuYmluZChuYXZpZ2F0b3IpO1xyXG59XHJcblxyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoY29uc3RyYWludHMsIGNiKSB7XHJcbiAgICB2YXIgZXJyb3I7XHJcbiAgICB2YXIgaGF2ZU9wdHMgPSBhcmd1bWVudHMubGVuZ3RoID09PSAyO1xyXG4gICAgdmFyIGRlZmF1bHRPcHRzID0ge3ZpZGVvOiB0cnVlLCBhdWRpbzogdHJ1ZX07XHJcblxyXG4gICAgdmFyIGRlbmllZCA9ICdQZXJtaXNzaW9uRGVuaWVkRXJyb3InO1xyXG4gICAgdmFyIGFsdERlbmllZCA9ICdQRVJNSVNTSU9OX0RFTklFRCc7XHJcbiAgICB2YXIgbm90U2F0aXNmaWVkID0gJ0NvbnN0cmFpbnROb3RTYXRpc2ZpZWRFcnJvcic7XHJcblxyXG4gICAgLy8gbWFrZSBjb25zdHJhaW50cyBvcHRpb25hbFxyXG4gICAgaWYgKCFoYXZlT3B0cykge1xyXG4gICAgICAgIGNiID0gY29uc3RyYWludHM7XHJcbiAgICAgICAgY29uc3RyYWludHMgPSBkZWZhdWx0T3B0cztcclxuICAgIH1cclxuXHJcbiAgICAvLyB0cmVhdCBsYWNrIG9mIGJyb3dzZXIgc3VwcG9ydCBsaWtlIGFuIGVycm9yXHJcbiAgICBpZiAodHlwZW9mIG5hdmlnYXRvciA9PT0gJ3VuZGVmaW5lZCcgfHwgIW5hdmlnYXRvci5nZXRVc2VyTWVkaWEpIHtcclxuICAgICAgICAvLyB0aHJvdyBwcm9wZXIgZXJyb3IgcGVyIHNwZWNcclxuICAgICAgICBlcnJvciA9IG5ldyBFcnJvcignTWVkaWFTdHJlYW1FcnJvcicpO1xyXG4gICAgICAgIGVycm9yLm5hbWUgPSAnTm90U3VwcG9ydGVkRXJyb3InO1xyXG5cclxuICAgICAgICAvLyBrZWVwIGFsbCBjYWxsYmFja3MgYXN5bmNcclxuICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIGNiKGVycm9yKTtcclxuICAgICAgICB9LCAwKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBub3JtYWxpemUgZXJyb3IgaGFuZGxpbmcgd2hlbiBubyBtZWRpYSB0eXBlcyBhcmUgcmVxdWVzdGVkXHJcbiAgICBpZiAoIWNvbnN0cmFpbnRzLmF1ZGlvICYmICFjb25zdHJhaW50cy52aWRlbykge1xyXG4gICAgICAgIGVycm9yID0gbmV3IEVycm9yKCdNZWRpYVN0cmVhbUVycm9yJyk7XHJcbiAgICAgICAgZXJyb3IubmFtZSA9ICdOb01lZGlhUmVxdWVzdGVkRXJyb3InO1xyXG5cclxuICAgICAgICAvLyBrZWVwIGFsbCBjYWxsYmFja3MgYXN5bmNcclxuICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIGNiKGVycm9yKTtcclxuICAgICAgICB9LCAwKTtcclxuICAgIH1cclxuXHJcbiAgICBuYXZpZ2F0b3IuZ2V0VXNlck1lZGlhKGNvbnN0cmFpbnRzLCBcclxuICAgIGZ1bmN0aW9uIChzdHJlYW0pIHtcclxuICAgICAgICBjYihudWxsLCBzdHJlYW0pO1xyXG4gICAgfSxmdW5jdGlvbiAoZXJyKSB7XHJcbiAgICAgICAgdmFyIGVycm9yO1xyXG4gICAgICAgIC8vIGNvZXJjZSBpbnRvIGFuIGVycm9yIG9iamVjdCBzaW5jZSBGRiBnaXZlcyB1cyBhIHN0cmluZ1xyXG4gICAgICAgIC8vIHRoZXJlIGFyZSBvbmx5IHR3byB2YWxpZCBuYW1lcyBhY2NvcmRpbmcgdG8gdGhlIHNwZWNcclxuICAgICAgICAvLyB3ZSBjb2VyY2UgYWxsIG5vbi1kZW5pZWQgdG8gXCJjb25zdHJhaW50IG5vdCBzYXRpc2ZpZWRcIi5cclxuICAgICAgICBpZiAodHlwZW9mIGVyciA9PT0gJ3N0cmluZycpIHtcclxuICAgICAgICAgICAgZXJyb3IgPSBuZXcgRXJyb3IoJ01lZGlhU3RyZWFtRXJyb3InKTtcclxuICAgICAgICAgICAgaWYgKGVyciA9PT0gZGVuaWVkIHx8IGVyciA9PT0gYWx0RGVuaWVkKSB7XHJcbiAgICAgICAgICAgICAgICBlcnJvci5uYW1lID0gZGVuaWVkO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgZXJyb3IubmFtZSA9IG5vdFNhdGlzZmllZDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIGlmIHdlIGdldCBhbiBlcnJvciBvYmplY3QgbWFrZSBzdXJlICcubmFtZScgcHJvcGVydHkgaXMgc2V0XHJcbiAgICAgICAgICAgIC8vIGFjY29yZGluZyB0byBzcGVjOiBodHRwOi8vZGV2LnczLm9yZy8yMDExL3dlYnJ0Yy9lZGl0b3IvZ2V0dXNlcm1lZGlhLmh0bWwjbmF2aWdhdG9ydXNlcm1lZGlhZXJyb3ItYW5kLW5hdmlnYXRvcnVzZXJtZWRpYWVycm9yY2FsbGJhY2tcclxuICAgICAgICAgICAgZXJyb3IgPSBlcnI7XHJcbiAgICAgICAgICAgIGlmICghZXJyb3IubmFtZSkge1xyXG4gICAgICAgICAgICAgICAgLy8gdGhpcyBpcyBsaWtlbHkgY2hyb21lIHdoaWNoXHJcbiAgICAgICAgICAgICAgICAvLyBzZXRzIGEgcHJvcGVydHkgY2FsbGVkIFwiRVJST1JfREVOSUVEXCIgb24gdGhlIGVycm9yIG9iamVjdFxyXG4gICAgICAgICAgICAgICAgLy8gaWYgc28gd2UgbWFrZSBzdXJlIHRvIHNldCBhIG5hbWVcclxuICAgICAgICAgICAgICAgIGlmIChlcnJvcltkZW5pZWRdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZXJyLm5hbWUgPSBkZW5pZWQ7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIGVyci5uYW1lID0gbm90U2F0aXNmaWVkO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjYihlcnJvcik7XHJcbiAgICB9KTtcclxufTtcclxuIiwiLy92YXIgaGFyayA9IHJlcXVpcmUoJ2hhcmsnKTtcclxudmFyIGdldFVzZXJNZWRpYSA9IHJlcXVpcmUoJy4vZ2V0dXNlcm1lZGlhJyk7XHJcbnZhciBXaWxkRW1pdHRlciA9IHJlcXVpcmUoJ3dpbGRlbWl0dGVyJyk7XHJcblxyXG5mdW5jdGlvbiBMb2NhbE1lZGlhKG9wdHMpIHtcclxuICAgIG9wdHMgPSBvcHRzIHx8IHt9O1xyXG4gICAgV2lsZEVtaXR0ZXIuY2FsbCh0aGlzKTtcclxuXHJcbiAgICB2YXIgZGVmYXVsdENvbmZpZyA9IHtcclxuICAgICAgICBkZXRlY3RTcGVha2luZ0V2ZW50czogZmFsc2UsXHJcbiAgICAgICAgYXVkaW9GYWxsYmFjazogZmFsc2UsXHJcbiAgICAgICAgbWVkaWE6IHtcclxuICAgICAgICAgICAgYXVkaW86IHRydWUsXHJcbiAgICAgICAgICAgIHZpZGVvOiB0cnVlXHJcbiAgICAgICAgfSxcclxuICAgICAgICAvL2hhcmtPcHRpb25zOiBudWxsLFxyXG4gICAgICAgIGxvZ2dlcjogY29uc29sZVxyXG4gICAgfTtcclxuICAgIHRoaXMuY29uZmlnID0gZGVmYXVsdENvbmZpZztcclxuICAgIGZvciAodmFyIGl0ZW0gaW4gb3B0cykge1xyXG4gICAgICAgIGlmIChvcHRzLmhhc093blByb3BlcnR5KGl0ZW0pKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY29uZmlnW2l0ZW1dID0gb3B0c1tpdGVtXTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5sb2dnZXIgPSB0aGlzLmNvbmZpZy5sb2dnZXI7XHJcbiAgICB0aGlzLl9sb2cgPSB0aGlzLmxvZ2dlci5sb2cuYmluZCh0aGlzLmxvZ2dlciwgXCJMb2NhbE1lZGlhOlwiKTtcclxuICAgIHRoaXMuX2xvZ2Vycm9yID0gdGhpcy5sb2dnZXIuZXJyb3IuYmluZCh0aGlzLmxvZ2dlciwgXCJMb2NhbE1lZGlhOlwiKTtcclxuXHJcbiAgICB0aGlzLmxvY2FsU3RyZWFtcyA9IFtdO1xyXG4gICAgdGhpcy5sb2NhbFNjcmVlbnMgPSBbXTtcclxuXHJcbiAgICBpZiAoIW5hdmlnYXRvci5tZWRpYURldmljZXMgfHwgIW5hdmlnYXRvci5tZWRpYURldmljZXMuZ2V0VXNlck1lZGlhKSB7XHJcbiAgICAgICAgdGhpcy5fbG9nZXJyb3IoXCJZb3VyIGJyb3dzZXIgZG9lcyBub3Qgc3VwcG9ydCBsb2NhbCBtZWRpYSBjYXB0dXJlLlwiKTtcclxuICAgIH1cclxuXHJcbiAgICAvL3RoaXMuX2F1ZGlvTW9uaXRvcnMgPSBbXTtcclxuICAgIC8vdGhpcy5vbignbG9jYWxTdHJlYW1TdG9wcGVkJywgdGhpcy5fc3RvcEF1ZGlvTW9uaXRvci5iaW5kKHRoaXMpKTtcclxuICAgIC8vdGhpcy5vbignbG9jYWxTY3JlZW5TdG9wcGVkJywgdGhpcy5fc3RvcEF1ZGlvTW9uaXRvci5iaW5kKHRoaXMpKTtcclxufVxyXG5cclxuTG9jYWxNZWRpYS5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKFdpbGRFbWl0dGVyLnByb3RvdHlwZSk7XHJcblxyXG5Mb2NhbE1lZGlhLnByb3RvdHlwZS5jYXB0dXJlVXNlck1lZGlhID0gZnVuY3Rpb24gKG1lZGlhQ29uc3RyYWludHMsIGNiKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICB2YXIgY29uc3RyYWludHMgPSBtZWRpYUNvbnN0cmFpbnRzIHx8IHRoaXMuY29uZmlnLm1lZGlhO1xyXG5cclxuICAgIHRoaXMuZW1pdChcImxvY2FsU3RyZWFtUmVxdWVzdGVkXCIsIGNvbnN0cmFpbnRzKTtcclxuXHJcbiAgICBnZXRVc2VyTWVkaWEoY29uc3RyYWludHMsXHJcbiAgICAgICAgZnVuY3Rpb24oZXJyLCBzdHJlYW0pIHtcclxuICAgICAgICAgICAgaWYgKGVycikge1xyXG4gICAgICAgICAgICAgICAgLy8gRmFsbGJhY2sgZm9yIHVzZXJzIHdpdGhvdXQgYSBjYW1lcmFcclxuICAgICAgICAgICAgICAgIGlmIChzZWxmLmNvbmZpZy5hdWRpb0ZhbGxiYWNrICYmIGVyci5uYW1lID09PSBcIk5vdEZvdW5kRXJyb3JcIiAmJiBjb25zdHJhaW50cy52aWRlbyAhPT0gZmFsc2UpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdHJhaW50cy52aWRlbyA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgIHNlbGYuY2FwdHVyZVVzZXJNZWRpYShjb25zdHJhaW50cywgY2IpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBzZWxmLmVtaXQoXCJsb2NhbFN0cmVhbVJlcXVlc3RGYWlsZWRcIiwgY29uc3RyYWludHMpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChjYikge1xyXG4gICAgICAgICAgICAgICAgICAgIGNiKGVyciwgbnVsbCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8qaWYgKGNvbnN0cmFpbnRzLmF1ZGlvICYmIHNlbGYuY29uZmlnLmRldGVjdFNwZWFraW5nRXZlbnRzKSB7XHJcbiAgICAgICAgICAgICAgICBzZWxmLl9zZXR1cEF1ZGlvTW9uaXRvcihzdHJlYW0sIHNlbGYuY29uZmlnLmhhcmtPcHRpb25zKTtcclxuICAgICAgICAgICAgfSovXHJcbiAgICAgICAgICAgIHN0cmVhbVtcInR5cGVcIl0gPSBcImNhbWVyYVwiO1xyXG4gICAgICAgICAgICBzZWxmLmxvY2FsU3RyZWFtcy5wdXNoKHN0cmVhbSk7XHJcbiAgICAgICAgICAgIHNlbGYuX3N1YnNjcmliZUZvckVuZGVkKHN0cmVhbSk7XHJcblxyXG4gICAgICAgICAgICBzZWxmLmVtaXQoXCJsb2NhbFN0cmVhbVwiLCBzdHJlYW0pO1xyXG5cclxuICAgICAgICAgICAgaWYgKGNiKSB7XHJcbiAgICAgICAgICAgICAgICBjYihudWxsLCBzdHJlYW0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgKTtcclxufTtcclxuXHJcbkxvY2FsTWVkaWEucHJvdG90eXBlLnN0b3AgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICB0aGlzLmxvY2FsU3RyZWFtcy5mb3JFYWNoKGZ1bmN0aW9uIChzdHJlYW0pIHtcclxuICAgICAgICBzZWxmLnN0b3BTdHJlYW0oc3RyZWFtKTtcclxuICAgIH0pO1xyXG4gICAgXHJcbn07XHJcblxyXG5Mb2NhbE1lZGlhLnByb3RvdHlwZS5zdG9wU3RyZWFtID0gZnVuY3Rpb24gKHN0cmVhbSkge1xyXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xyXG5cclxuICAgIGlmIChzdHJlYW0pIHtcclxuICAgICAgICBzdHJlYW0uc3RvcCgpO1xyXG4gICAgICAgIHNlbGYuX3JlbW92ZVN0cmVhbShzdHJlYW0pO1xyXG4gICAgfVxyXG59O1xyXG5cclxuTG9jYWxNZWRpYS5wcm90b3R5cGUuc3RhcnRTY3JlZW5TaGFyZSA9IGZ1bmN0aW9uIChjb25zdHJhaW50cywgY2IpIHtcclxuICAgIHZhciBzZWxmID0gdGhpcztcclxuXHJcbiAgICB0aGlzLmVtaXQoXCJsb2NhbFNjcmVlblJlcXVlc3RlZFwiKTtcclxuXHJcbiAgICBpZiAodHlwZW9mIGNvbnN0cmFpbnRzID09PSBcImZ1bmN0aW9uXCIgJiYgIWNiKSB7XHJcbiAgICAgICAgY2IgPSBjb25zdHJhaW50cztcclxuICAgICAgICBjb25zdHJhaW50cyA9IG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgZ2V0VXNlck1lZGlhKGNvbnN0cmFpbnRzLCBmdW5jdGlvbiAoZXJyLCBzdHJlYW0pIHtcclxuICAgICAgICBpZiAoIWVycikge1xyXG4gICAgICAgICAgICBzdHJlYW1bXCJ0eXBlXCJdID0gXCJzY3JlZW5cIjtcclxuICAgICAgICAgICAgc2VsZi5sb2NhbFNjcmVlbnMucHVzaChzdHJlYW0pO1xyXG4gICAgICAgICAgICBzZWxmLl9zdWJzY3JpYmVGb3JFbmRlZChzdHJlYW0pO1xyXG4gICAgICAgICAgICBzZWxmLmVtaXQoXCJsb2NhbFNjcmVlblwiLCBzdHJlYW0pO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHNlbGYuZW1pdChcImxvY2FsU2NyZWVuUmVxdWVzdEZhaWxlZFwiKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChjYikge1xyXG4gICAgICAgICAgICBjYihlcnIsIHN0cmVhbSk7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcbn07XHJcblxyXG5Mb2NhbE1lZGlhLnByb3RvdHlwZS5hdHRhY2hTdHJlYW0gPSBmdW5jdGlvbiAoc3RyZWFtKSB7XHJcblxyXG4gICAgaWYgKHN0cmVhbS5nZXRUcmFja3MoKS5sZW5ndGggPT09IDApXHJcbiAgICAgICAgcmV0dXJuO1xyXG5cclxuICAgIHN0cmVhbS50eXBlID0gc3RyZWFtLmdldFZpZGVvVHJhY2tzKCkubGVuZ3RoID4gMCA/IFwidmlkZW9cIiA6IFwiYXVkaW9cIjtcclxuXHJcbiAgICB0aGlzLmxvY2FsU3RyZWFtcy5wdXNoKHN0cmVhbSk7XHJcbiAgICB0aGlzLl9zdWJzY3JpYmVGb3JFbmRlZChzdHJlYW0pO1xyXG4gICAgdGhpcy5lbWl0KFwibG9jYWxTdHJlYW1cIiwgc3RyZWFtKTtcclxufTtcclxuXHJcbi8vIEF1ZGlvIGNvbnRyb2xzXHJcbkxvY2FsTWVkaWEucHJvdG90eXBlLm11dGUgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICB0aGlzLl9hdWRpb0VuYWJsZWQoZmFsc2UpO1xyXG4gICAgdGhpcy5lbWl0KFwiYXVkaW9PZmZcIik7XHJcbn07XHJcblxyXG5Mb2NhbE1lZGlhLnByb3RvdHlwZS51bm11dGUgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICB0aGlzLl9hdWRpb0VuYWJsZWQodHJ1ZSk7XHJcbiAgICB0aGlzLmVtaXQoXCJhdWRpb09uXCIpO1xyXG59O1xyXG5cclxuLy8gVmlkZW8gY29udHJvbHNcclxuTG9jYWxNZWRpYS5wcm90b3R5cGUucGF1c2VWaWRlbyA9IGZ1bmN0aW9uICgpIHtcclxuICAgIHRoaXMuX3ZpZGVvRW5hYmxlZChmYWxzZSk7XHJcbiAgICB0aGlzLmVtaXQoXCJ2aWRlb09mZlwiKTtcclxufTtcclxuTG9jYWxNZWRpYS5wcm90b3R5cGUucmVzdW1lVmlkZW8gPSBmdW5jdGlvbiAoKSB7XHJcbiAgICB0aGlzLl92aWRlb0VuYWJsZWQodHJ1ZSk7XHJcbiAgICB0aGlzLmVtaXQoXCJ2aWRlb09uXCIpO1xyXG59O1xyXG5cclxuLy8gQ29tYmluZWQgY29udHJvbHNcclxuTG9jYWxNZWRpYS5wcm90b3R5cGUucGF1c2UgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICB0aGlzLm11dGUoKTtcclxuICAgIHRoaXMucGF1c2VWaWRlbygpO1xyXG59O1xyXG5Mb2NhbE1lZGlhLnByb3RvdHlwZS5yZXN1bWUgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICB0aGlzLnVubXV0ZSgpO1xyXG4gICAgdGhpcy5yZXN1bWVWaWRlbygpO1xyXG59O1xyXG5cclxuLy8gSW50ZXJuYWwgbWV0aG9kcyBmb3IgZW5hYmxpbmcvZGlzYWJsaW5nIGF1ZGlvL3ZpZGVvXHJcbkxvY2FsTWVkaWEucHJvdG90eXBlLl9hdWRpb0VuYWJsZWQgPSBmdW5jdGlvbiAoYm9vbCkge1xyXG4gICAgdGhpcy5sb2NhbFN0cmVhbXMuZm9yRWFjaChmdW5jdGlvbiAoc3RyZWFtKSB7XHJcbiAgICAgICAgc3RyZWFtLmdldEF1ZGlvVHJhY2tzKCkuZm9yRWFjaChmdW5jdGlvbiAodHJhY2spIHtcclxuICAgICAgICAgICAgdHJhY2suZW5hYmxlZCA9ICEhYm9vbDtcclxuICAgICAgICB9KTtcclxuICAgIH0pO1xyXG59O1xyXG5Mb2NhbE1lZGlhLnByb3RvdHlwZS5fdmlkZW9FbmFibGVkID0gZnVuY3Rpb24gKGJvb2wpIHtcclxuICAgIHRoaXMubG9jYWxTdHJlYW1zLmZvckVhY2goZnVuY3Rpb24gKHN0cmVhbSkge1xyXG4gICAgICAgIHN0cmVhbS5nZXRWaWRlb1RyYWNrcygpLmZvckVhY2goZnVuY3Rpb24gKHRyYWNrKSB7XHJcbiAgICAgICAgICAgIHRyYWNrLmVuYWJsZWQgPSAhIWJvb2w7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9KTtcclxufTtcclxuXHJcbi8vIGNoZWNrIGlmIGFsbCBhdWRpbyBzdHJlYW1zIGFyZSBlbmFibGVkXHJcbkxvY2FsTWVkaWEucHJvdG90eXBlLmlzQXVkaW9FbmFibGVkID0gZnVuY3Rpb24gKCkge1xyXG4gICAgdmFyIGVuYWJsZWQgPSB0cnVlO1xyXG4gICAgdGhpcy5sb2NhbFN0cmVhbXMuZm9yRWFjaChmdW5jdGlvbiAoc3RyZWFtKSB7XHJcbiAgICAgICAgc3RyZWFtLmdldEF1ZGlvVHJhY2tzKCkuZm9yRWFjaChmdW5jdGlvbiAodHJhY2spIHtcclxuICAgICAgICAgICAgZW5hYmxlZCA9IGVuYWJsZWQgJiYgdHJhY2suZW5hYmxlZDtcclxuICAgICAgICB9KTtcclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIGVuYWJsZWQ7XHJcbn07XHJcblxyXG4vLyBjaGVjayBpZiBhbGwgdmlkZW8gc3RyZWFtcyBhcmUgZW5hYmxlZFxyXG5Mb2NhbE1lZGlhLnByb3RvdHlwZS5pc1ZpZGVvRW5hYmxlZCA9IGZ1bmN0aW9uICgpIHtcclxuICAgIHZhciBlbmFibGVkID0gdHJ1ZTtcclxuICAgIHRoaXMubG9jYWxTdHJlYW1zLmZvckVhY2goZnVuY3Rpb24gKHN0cmVhbSkge1xyXG4gICAgICAgIHN0cmVhbS5nZXRWaWRlb1RyYWNrcygpLmZvckVhY2goZnVuY3Rpb24gKHRyYWNrKSB7XHJcbiAgICAgICAgICAgIGVuYWJsZWQgPSBlbmFibGVkICYmIHRyYWNrLmVuYWJsZWQ7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9KTtcclxuICAgIHJldHVybiBlbmFibGVkO1xyXG59O1xyXG5cclxuTG9jYWxNZWRpYS5wcm90b3R5cGUuX3JlbW92ZVN0cmVhbSA9IGZ1bmN0aW9uIChzdHJlYW0pIHtcclxuICAgIHN0cmVhbS5nZXRUcmFja3MoKS5mb3JFYWNoKGZ1bmN0aW9uICh0cmFjaykgeyB0cmFjay5zdG9wKCk7IH0pO1xyXG4gICAgdmFyIGlkeCA9IHRoaXMubG9jYWxTdHJlYW1zLmluZGV4T2Yoc3RyZWFtKTtcclxuICAgIGlmIChpZHggPiAtMSkge1xyXG4gICAgICAgIHRoaXMubG9jYWxTdHJlYW1zLnNwbGljZShpZHgsIDEpO1xyXG4gICAgICAgIHRoaXMuZW1pdChcImxvY2FsU3RyZWFtRW5kZWRcIiwgc3RyZWFtKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgaWR4ID0gdGhpcy5sb2NhbFNjcmVlbnMuaW5kZXhPZihzdHJlYW0pO1xyXG4gICAgICAgIGlmIChpZHggPiAtMSkge1xyXG4gICAgICAgICAgICB0aGlzLmxvY2FsU2NyZWVucy5zcGxpY2UoaWR4LCAxKTtcclxuICAgICAgICAgICAgdGhpcy5lbWl0KFwibG9jYWxTY3JlZW5FbmRlZFwiLCBzdHJlYW0pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufTtcclxuXHJcbkxvY2FsTWVkaWEucHJvdG90eXBlLl9zdWJzY3JpYmVGb3JFbmRlZCA9IGZ1bmN0aW9uIChzdHJlYW0pXHJcbntcclxuICAgIHZhciBzZWxmID0gdGhpcztcclxuICAgIHN0cmVhbS5nZXRUcmFja3MoKS5mb3JFYWNoKGZ1bmN0aW9uICh0cmFjaykge1xyXG4gICAgICAgIHRyYWNrLmFkZEV2ZW50TGlzdGVuZXIoXCJlbmRlZFwiLFxyXG4gICAgICAgICAgICBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoc2VsZi5faXNBbGxUcmFja3NFbmRlZChzdHJlYW0pKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5fcmVtb3ZlU3RyZWFtKHN0cmVhbSk7XHJcbiAgICAgICAgICAgICAgICAgICAgc3RyZWFtLnN0b3AoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICB9KTtcclxufVxyXG5cclxuTG9jYWxNZWRpYS5wcm90b3R5cGUuX2lzQWxsVHJhY2tzRW5kZWQgPSBmdW5jdGlvbiAoc3RyZWFtKSB7XHJcbiAgICB2YXIgcmVzdWx0ID0gdHJ1ZTtcclxuICAgIHN0cmVhbS5nZXRUcmFja3MoKS5mb3JFYWNoKGZ1bmN0aW9uICh0KSB7XHJcbiAgICAgICAgcmVzdWx0ID0gdC5yZWFkeVN0YXRlID09PSBcImVuZGVkXCIgJiYgcmVzdWx0O1xyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG59XHJcblxyXG4vKkxvY2FsTWVkaWEucHJvdG90eXBlLl9zZXR1cEF1ZGlvTW9uaXRvciA9IGZ1bmN0aW9uIChzdHJlYW0sIGhhcmtPcHRpb25zKSB7XHJcbiAgICB0aGlzLl9sb2coJ1NldHVwIGF1ZGlvJyk7XHJcbiAgICB2YXIgYXVkaW8gPSBoYXJrKHN0cmVhbSwgaGFya09wdGlvbnMpO1xyXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gICAgdmFyIHRpbWVvdXQ7XHJcblxyXG4gICAgYXVkaW8ub24oJ3NwZWFraW5nJywgZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIHNlbGYuZW1pdCgnc3BlYWtpbmcnKTtcclxuICAgIH0pO1xyXG5cclxuICAgIGF1ZGlvLm9uKCdzdG9wcGVkX3NwZWFraW5nJywgZnVuY3Rpb24gKCkge1xyXG4gICAgICAgIGlmICh0aW1lb3V0KSB7XHJcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRpbWVvdXQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgc2VsZi5lbWl0KCdzdG9wcGVkU3BlYWtpbmcnKTtcclxuICAgICAgICB9LCAxMDAwKTtcclxuICAgIH0pO1xyXG4gICAgYXVkaW8ub24oJ3ZvbHVtZV9jaGFuZ2UnLCBmdW5jdGlvbiAodm9sdW1lLCB0aHJlc2hvbGQpIHtcclxuICAgICAgICBzZWxmLmVtaXQoJ3ZvbHVtZUNoYW5nZScsIHZvbHVtZSwgdGhyZXNob2xkKTtcclxuICAgIH0pO1xyXG5cclxuICAgIHRoaXMuX2F1ZGlvTW9uaXRvcnMucHVzaCh7YXVkaW86IGF1ZGlvLCBzdHJlYW06IHN0cmVhbX0pO1xyXG59O1xyXG5cclxuTG9jYWxNZWRpYS5wcm90b3R5cGUuX3N0b3BBdWRpb01vbml0b3IgPSBmdW5jdGlvbiAoc3RyZWFtKSB7XHJcbiAgICB2YXIgaWR4ID0gLTE7XHJcbiAgICB0aGlzLl9hdWRpb01vbml0b3JzLmZvckVhY2goZnVuY3Rpb24gKG1vbml0b3JzLCBpKSB7XHJcbiAgICAgICAgaWYgKG1vbml0b3JzLnN0cmVhbSA9PT0gc3RyZWFtKSB7XHJcbiAgICAgICAgICAgIGlkeCA9IGk7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgaWYgKGlkeCA+IC0xKSB7XHJcbiAgICAgICAgdGhpcy5fYXVkaW9Nb25pdG9yc1tpZHhdLmF1ZGlvLnN0b3AoKTtcclxuICAgICAgICB0aGlzLl9hdWRpb01vbml0b3JzLnNwbGljZShpZHgsIDEpO1xyXG4gICAgfVxyXG59OyovXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IExvY2FsTWVkaWE7XHJcbiIsInZhciBpZENvdW50ZXIgPSBNYXRoLnJhbmRvbSgpO1xuXG52YXIgcGFyc2VDYW5kaWRhdGUgPSBmdW5jdGlvbiAobGluZSkge1xuICAgIHZhciBwYXJ0cztcbiAgICBpZiAobGluZS5pbmRleE9mKCdhPWNhbmRpZGF0ZTonKSA9PT0gMCkge1xuICAgICAgICBwYXJ0cyA9IGxpbmUuc3Vic3RyaW5nKDEyKS5zcGxpdCgnICcpO1xuICAgIH0gZWxzZSB7IC8vIG5vIGE9Y2FuZGlkYXRlXG4gICAgICAgIHBhcnRzID0gbGluZS5zdWJzdHJpbmcoMTApLnNwbGl0KCcgJyk7XG4gICAgfVxuXG4gICAgdmFyIGNhbmRpZGF0ZSA9IHtcbiAgICAgICAgZm91bmRhdGlvbjogcGFydHNbMF0sXG4gICAgICAgIGNvbXBvbmVudDogcGFydHNbMV0sXG4gICAgICAgIHByb3RvY29sOiBwYXJ0c1syXS50b0xvd2VyQ2FzZSgpLFxuICAgICAgICBwcmlvcml0eTogcGFydHNbM10sXG4gICAgICAgIGlwOiBwYXJ0c1s0XSxcbiAgICAgICAgcG9ydDogcGFydHNbNV0sXG4gICAgICAgIC8vIHNraXAgcGFydHNbNl0gPT0gJ3R5cCdcbiAgICAgICAgdHlwZTogcGFydHNbN10sXG4gICAgICAgIGdlbmVyYXRpb246ICcwJ1xuICAgIH07XG5cbiAgICBmb3IgKHZhciBpID0gODsgaSA8IHBhcnRzLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgICAgIGlmIChwYXJ0c1tpXSA9PT0gJ3JhZGRyJykge1xuICAgICAgICAgICAgY2FuZGlkYXRlLnJlbEFkZHIgPSBwYXJ0c1tpICsgMV07XG4gICAgICAgIH0gZWxzZSBpZiAocGFydHNbaV0gPT09ICdycG9ydCcpIHtcbiAgICAgICAgICAgIGNhbmRpZGF0ZS5yZWxQb3J0ID0gcGFydHNbaSArIDFdO1xuICAgICAgICB9IGVsc2UgaWYgKHBhcnRzW2ldID09PSAnZ2VuZXJhdGlvbicpIHtcbiAgICAgICAgICAgIGNhbmRpZGF0ZS5nZW5lcmF0aW9uID0gcGFydHNbaSArIDFdO1xuICAgICAgICB9IGVsc2UgaWYgKHBhcnRzW2ldID09PSAndGNwdHlwZScpIHtcbiAgICAgICAgICAgIGNhbmRpZGF0ZS50Y3BUeXBlID0gcGFydHNbaSArIDFdO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgY2FuZGlkYXRlLm5ldHdvcmsgPSAnMSc7XG5cbiAgICByZXR1cm4gY2FuZGlkYXRlO1xufTtcblxuZXhwb3J0cy50b0NhbmRpZGF0ZUpTT04gPSBmdW5jdGlvbiAobGluZSkge1xuICAgIHZhciBjYW5kaWRhdGUgPSBwYXJzZUNhbmRpZGF0ZShsaW5lLnNwbGl0KCdcXHJcXG4nKVswXSk7XG4gICAgY2FuZGlkYXRlLmlkID0gKGlkQ291bnRlcisrKS50b1N0cmluZygzNikuc3Vic3RyKDAsIDEyKTtcbiAgICByZXR1cm4gY2FuZGlkYXRlO1xufTsiLCJ2YXIgUGVlckNvbm5lY3Rpb24gPSByZXF1aXJlKCcuL3BlZXJjb25uZWN0aW9uJylcclxuXHJcbmZ1bmN0aW9uIFBlZXJNYW5hZ2VyKG9wdGlvbnMpIHtcclxuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9XHJcbiAgICB0aGlzLnBlZXJzID0gW107XHJcbiAgICB0aGlzLmxvY2FsUGVlciA9IG51bGw7XHJcblxyXG4gICAgdmFyIGRlZmF1bHRDb25maWcgPSB7XHJcbiAgICAgICAgZGVidWc6IGZhbHNlLFxyXG4gICAgICAgIGxvZ2dlcjogY29uc29sZSxcclxuICAgICAgICBwZWVyQ29ubmVjdGlvbkNvbmZpZzoge1xyXG4gICAgICAgICAgICBpY2VTZXJ2ZXJzOiBbXHJcbiAgICAgICAgICAgICAgICB7ICd1cmxzJzogJ3N0dW46c3R1bi5sLmdvb2dsZS5jb206MTkzMDInIH1cclxuICAgICAgICAgICAgXVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgcGVlckNvbm5lY3Rpb25Db25zdHJhaW50czoge1xyXG4gICAgICAgICAgICBvcHRpb25hbDogW11cclxuICAgICAgICB9LFxyXG4gICAgICAgIGVuYWJsZURhdGFDaGFubmVsczogZmFsc2VcclxuICAgIH07XHJcbiAgICB0aGlzLmNvbmZpZyA9IGRlZmF1bHRDb25maWc7XHJcblxyXG4gICAgZm9yICh2YXIgaXRlbSBpbiBvcHRpb25zKSB7XHJcbiAgICAgICAgaWYgKG9wdGlvbnMuaGFzT3duUHJvcGVydHkoaXRlbSkpIHtcclxuICAgICAgICAgICAgdGhpcy5jb25maWdbaXRlbV0gPSBvcHRpb25zW2l0ZW1dO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHRoaXMubG9nZ2VyID0gdGhpcy5jb25maWcubG9nZ2VyO1xyXG59XHJcblxyXG5QZWVyTWFuYWdlci5wcm90b3R5cGUuX2NyZWF0ZVBlZXIgPSBmdW5jdGlvbiAoaWQpIHtcclxuICAgIHZhciBwZWVyID0gbmV3IFBlZXJDb25uZWN0aW9uKHRoaXMuY29uZmlnLnBlZXJDb25uZWN0aW9uQ29uZmlnLCB0aGlzLmNvbmZpZy5wZWVyQ29ubmVjdGlvbkNvbnN0cmFpbnRzKTtcclxuICAgIHBlZXIudXNlcklkID0gaWQ7XHJcbiAgICByZXR1cm4gcGVlcjtcclxufVxyXG5cclxuUGVlck1hbmFnZXIucHJvdG90eXBlLmNyZWF0ZVBlZXIgPSBmdW5jdGlvbiAoaWQpIHtcclxuICAgIHZhciBwZWVyID0gdGhpcy5fY3JlYXRlUGVlcihpZCk7XHJcbiAgICB0aGlzLnBlZXJzLnB1c2gocGVlcik7XHJcbiAgICByZXR1cm4gcGVlcjtcclxufVxyXG5cclxuUGVlck1hbmFnZXIucHJvdG90eXBlLmNyZWF0ZUxvY2FsUGVlciA9IGZ1bmN0aW9uIChpZCkge1xyXG4gICAgaWYgKHRoaXMubG9jYWxQZWVyKVxyXG4gICAgICAgIHRoaXMubG9jYWxQZWVyLmNsb3NlKCk7XHJcblxyXG4gICAgdmFyIHBlZXIgPSB0aGlzLl9jcmVhdGVQZWVyKGlkKTtcclxuICAgIHRoaXMubG9jYWxQZWVyID0gcGVlcjtcclxuICAgIHJldHVybiBwZWVyO1xyXG59XHJcblxyXG5QZWVyTWFuYWdlci5wcm90b3R5cGUuZ2V0UGVlciA9IGZ1bmN0aW9uIChpZCkge1xyXG4gICAgdmFyIHBlZXJzID0gdGhpcy5wZWVycy5maWx0ZXIoZnVuY3Rpb24gKHBlZXIpIHtcclxuICAgICAgICByZXR1cm4gKHBlZXIudXNlcklkID09PSBpZCk7XHJcbiAgICB9KTtcclxuXHJcbiAgICByZXR1cm4gcGVlcnMubGVuZ3RoID4gMCA/IHBlZXJzWzBdIDogbnVsbDtcclxufVxyXG5cclxuUGVlck1hbmFnZXIucHJvdG90eXBlLnJlbW92ZVBlZXIgPSBmdW5jdGlvbiAoaWQpIHtcclxuICAgIHZhciBwZWVyID0gdGhpcy5nZXRQZWVyKGlkKTtcclxuICAgIGlmIChwZWVyKSB7XHJcbiAgICAgICAgcGVlci5jbG9zZSgpO1xyXG4gICAgICAgIHZhciBpZHggPSB0aGlzLnBlZXJzLmluZGV4T2YocGVlcik7XHJcbiAgICAgICAgdGhpcy5wZWVycy5zcGxpY2UoaWR4LCAxKTtcclxuICAgIH1cclxufVxyXG5cclxuUGVlck1hbmFnZXIucHJvdG90eXBlLmFkZFN0cmVhbSA9IGZ1bmN0aW9uKHN0cmVhbSkge1xyXG4gICAgdGhpcy5wZWVycy5mb3JFYWNoKGZ1bmN0aW9uIChwZWVyKSB7XHJcbiAgICAgICAgcGVlci5hZGRTdHJlYW0oc3RyZWFtKTtcclxuICAgIH0pO1xyXG59XHJcblxyXG5QZWVyTWFuYWdlci5wcm90b3R5cGUucmVtb3ZlU3RyZWFtID0gZnVuY3Rpb24gKHN0cmVhbSkge1xyXG4gICAgdGhpcy5wZWVycy5mb3JFYWNoKGZ1bmN0aW9uIChwZWVyKSB7XHJcbiAgICAgICAgcGVlci5yZW1vdmVTdHJlYW0oc3RyZWFtKTtcclxuICAgIH0pO1xyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IFBlZXJNYW5hZ2VyOyIsInZhciBwYXJzZXIgPSByZXF1aXJlKCcuL3BhcnNlcnMnKTtcclxudmFyIFdpbGRFbWl0dGVyID0gcmVxdWlyZSgnd2lsZGVtaXR0ZXInKTtcclxuLy92YXIgSW50ZXJvcCA9IHJlcXVpcmUoJ3NkcC1pbnRlcm9wJyk7XHJcblxyXG5mdW5jdGlvbiBQZWVyQ29ubmVjdGlvbihjb25maWcsIGNvbnN0cmFpbnRzKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICB2YXIgaXRlbTtcclxuICAgIFdpbGRFbWl0dGVyLmNhbGwodGhpcyk7XHJcblxyXG4gICAgY29uZmlnID0gY29uZmlnIHx8IHt9O1xyXG4gICAgY29uZmlnLmljZVNlcnZlcnMgPSBjb25maWcuaWNlU2VydmVycyB8fCBbXTtcclxuXHJcbiAgICAvLyBFWFBFUklNRU5UQUwgRkxBRywgbWlnaHQgZ2V0IHJlbW92ZWQgd2l0aG91dCBub3RpY2VcclxuICAgIC8vIHRoaXMgYXR0ZW1wcyB0byBzdHJpcCBvdXQgY2FuZGlkYXRlcyB3aXRoIGFuIGFscmVhZHkga25vd24gZm91bmRhdGlvblxyXG4gICAgLy8gYW5kIHR5cGUgLS0gaS5lLiB0aG9zZSB3aGljaCBhcmUgZ2F0aGVyZWQgdmlhIHRoZSBzYW1lIFRVUk4gc2VydmVyXHJcbiAgICAvLyBidXQgZGlmZmVyZW50IHRyYW5zcG9ydHMgKFRVUk4gdWRwLCB0Y3AgYW5kIHRscyByZXNwZWN0aXZlbHkpXHJcbiAgICBpZiAoY29uZmlnLmVsaW1pbmF0ZUR1cGxpY2F0ZUNhbmRpZGF0ZXMgJiYgd2luZG93LmNocm9tZSkge1xyXG4gICAgICAgIHNlbGYuZWxpbWluYXRlRHVwbGljYXRlQ2FuZGlkYXRlcyA9IGNvbmZpZy5lbGltaW5hdGVEdXBsaWNhdGVDYW5kaWRhdGVzO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMucGMgPSBuZXcgUlRDUGVlckNvbm5lY3Rpb24oY29uZmlnLCBjb25zdHJhaW50cyk7XHJcblxyXG4gICAgaWYgKHR5cGVvZiB0aGlzLnBjLmdldExvY2FsU3RyZWFtcyA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHRoaXMuZ2V0TG9jYWxTdHJlYW1zID0gdGhpcy5wYy5nZXRMb2NhbFN0cmVhbXMuYmluZCh0aGlzLnBjKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5nZXRMb2NhbFN0cmVhbXMgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBbXTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAodHlwZW9mIHRoaXMucGMuZ2V0U2VuZGVycyA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHRoaXMuZ2V0U2VuZGVycyA9IHRoaXMucGMuZ2V0U2VuZGVycy5iaW5kKHRoaXMucGMpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLmdldFNlbmRlcnMgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBbXTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0eXBlb2YgdGhpcy5wYy5nZXRSZW1vdGVTdHJlYW1zID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgdGhpcy5nZXRSZW1vdGVTdHJlYW1zID0gdGhpcy5wYy5nZXRSZW1vdGVTdHJlYW1zLmJpbmQodGhpcy5wYyk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRoaXMuZ2V0UmVtb3RlU3RyZWFtcyA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIFtdO1xyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHR5cGVvZiB0aGlzLnBjLmdldFJlY2VpdmVycyA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHRoaXMuZ2V0UmVjZWl2ZXJzID0gdGhpcy5wYy5nZXRSZWNlaXZlcnMuYmluZCh0aGlzLnBjKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5nZXRSZWNlaXZlcnMgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBbXTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuYWRkU3RyZWFtID0gdGhpcy5wYy5hZGRTdHJlYW0uYmluZCh0aGlzLnBjKTtcclxuXHJcbiAgICB0aGlzLnJlbW92ZVN0cmVhbSA9IGZ1bmN0aW9uIChzdHJlYW0pIHtcclxuICAgICAgICBpZiAodHlwZW9mIHNlbGYucGMucmVtb3ZlU3RyZWFtID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgIHNlbGYucGMucmVtb3ZlU3RyZWFtLmFwcGx5KHNlbGYucGMsIGFyZ3VtZW50cyk7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygc2VsZi5wYy5yZW1vdmVUcmFjayA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICBzZWxmLnBjLmdldFNlbmRlcnMoKS5mb3JFYWNoKGZ1bmN0aW9uKHNlbmRlcikge1xyXG4gICAgICAgICAgICAgICAgaWYgKHNlbmRlci50cmFjayAmJiBzdHJlYW0uZ2V0VHJhY2tzKCkuaW5kZXhPZihzZW5kZXIudHJhY2spICE9PSAtMSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHNlbGYucGMucmVtb3ZlVHJhY2soc2VuZGVyKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICBpZiAodHlwZW9mIHRoaXMucGMucmVtb3ZlVHJhY2sgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICB0aGlzLnJlbW92ZVRyYWNrID0gdGhpcy5wYy5yZW1vdmVUcmFjay5iaW5kKHRoaXMucGMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIHByb3h5IHNvbWUgZXZlbnRzIGRpcmVjdGx5XHJcbiAgICB0aGlzLnBjLm9ucmVtb3Zlc3RyZWFtID0gdGhpcy5lbWl0LmJpbmQodGhpcywgJ3JlbW92ZVN0cmVhbScpO1xyXG4gICAgdGhpcy5wYy5vbnJlbW92ZXRyYWNrID0gdGhpcy5lbWl0LmJpbmQodGhpcywgJ3JlbW92ZVRyYWNrJyk7XHJcbiAgICB0aGlzLnBjLm9uYWRkc3RyZWFtID0gdGhpcy5lbWl0LmJpbmQodGhpcywgJ2FkZFN0cmVhbScpO1xyXG4gICAgdGhpcy5wYy5vbm5lZ290aWF0aW9ubmVlZGVkID0gdGhpcy5lbWl0LmJpbmQodGhpcywgJ25lZ290aWF0aW9uTmVlZGVkJyk7XHJcbiAgICB0aGlzLnBjLm9uaWNlY29ubmVjdGlvbnN0YXRlY2hhbmdlID0gdGhpcy5lbWl0LmJpbmQodGhpcywgJ2ljZUNvbm5lY3Rpb25TdGF0ZUNoYW5nZScpO1xyXG4gICAgdGhpcy5wYy5vbnNpZ25hbGluZ3N0YXRlY2hhbmdlID0gdGhpcy5lbWl0LmJpbmQodGhpcywgJ3NpZ25hbGluZ1N0YXRlQ2hhbmdlJyk7XHJcblxyXG4gICAgLy8gaGFuZGxlIGljZSBjYW5kaWRhdGUgYW5kIGRhdGEgY2hhbm5lbCBldmVudHNcclxuICAgIHRoaXMucGMub25pY2VjYW5kaWRhdGUgPSB0aGlzLl9vbkljZS5iaW5kKHRoaXMpO1xyXG4gICAgdGhpcy5wYy5vbmRhdGFjaGFubmVsID0gdGhpcy5fb25EYXRhQ2hhbm5lbC5iaW5kKHRoaXMpO1xyXG5cclxuICAgIHRoaXMuY29uZmlnID0ge1xyXG4gICAgICAgIGRlYnVnOiBmYWxzZSxcclxuICAgICAgICBzZHBTZXNzaW9uSUQ6IERhdGUubm93KCksXHJcbiAgICAgICAgbG9nZ2VyOiBjb25zb2xlXHJcbiAgICB9O1xyXG5cclxuICAgIC8vIGFwcGx5IG91ciBjb25maWdcclxuICAgIGZvciAoaXRlbSBpbiBjb25maWcpIHtcclxuICAgICAgICB0aGlzLmNvbmZpZ1tpdGVtXSA9IGNvbmZpZ1tpdGVtXTtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLmxvZ2dlciA9IHRoaXMuY29uZmlnLmxvZ2dlciB8fCBjb25zb2xlO1xyXG5cclxuICAgIGlmICh0aGlzLmNvbmZpZy5kZWJ1Zykge1xyXG4gICAgICAgIHRoaXMub24oJyonLCBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmxvZygnUGVlckNvbm5lY3Rpb24gZXZlbnQ6JywgYXJndW1lbnRzKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLmhhZExvY2FsU3R1bkNhbmRpZGF0ZSA9IGZhbHNlO1xyXG4gICAgdGhpcy5oYWRSZW1vdGVTdHVuQ2FuZGlkYXRlID0gZmFsc2U7XHJcbiAgICB0aGlzLmhhZExvY2FsUmVsYXlDYW5kaWRhdGUgPSBmYWxzZTtcclxuICAgIHRoaXMuaGFkUmVtb3RlUmVsYXlDYW5kaWRhdGUgPSBmYWxzZTtcclxuICAgIHRoaXMuaGFkTG9jYWxJUHY2Q2FuZGlkYXRlID0gZmFsc2U7XHJcbiAgICB0aGlzLmhhZFJlbW90ZUlQdjZDYW5kaWRhdGUgPSBmYWxzZTtcclxuXHJcbiAgICAvL0luaXRpYWxpemUgVW5pZmlkUGxhbiA8LS0+IFBsYW5CIEludGVyb3BcclxuICAgIC8vdGhpcy5pbnRlcm9wID0gbmV3IEludGVyb3AuSW50ZXJvcCgpO1xyXG5cclxuICAgIC8vIGtlZXBpbmcgcmVmZXJlbmNlcyBmb3IgYWxsIG91ciBkYXRhIGNoYW5uZWxzXHJcbiAgICAvLyBzbyB0aGV5IGRvbnQgZ2V0IGdhcmJhZ2UgY29sbGVjdGVkXHJcbiAgICAvLyBjYW4gYmUgcmVtb3ZlZCBvbmNlIHRoZSBmb2xsb3dpbmcgYnVncyBoYXZlIGJlZW4gZml4ZWRcclxuICAgIC8vIGh0dHBzOi8vY3JidWcuY29tLzQwNTU0NVxyXG4gICAgLy8gaHR0cHM6Ly9idWd6aWxsYS5tb3ppbGxhLm9yZy9zaG93X2J1Zy5jZ2k/aWQ9OTY0MDkyXHJcbiAgICAvLyB0byBiZSBmaWxlZCBmb3Igb3BlcmFcclxuICAgIHRoaXMuX3JlbW90ZURhdGFDaGFubmVscyA9IFtdO1xyXG4gICAgdGhpcy5fbG9jYWxEYXRhQ2hhbm5lbHMgPSBbXTtcclxuXHJcbiAgICB0aGlzLl9jYW5kaWRhdGVCdWZmZXIgPSBbXTtcclxuICAgIHRoaXMuX2ljZUJ1ZmZlciA9IFtdO1xyXG59XHJcblxyXG5QZWVyQ29ubmVjdGlvbi5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKFdpbGRFbWl0dGVyLnByb3RvdHlwZSk7XHJcblxyXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoUGVlckNvbm5lY3Rpb24ucHJvdG90eXBlLCAnc2lnbmFsaW5nU3RhdGUnLCB7XHJcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5wYy5zaWduYWxpbmdTdGF0ZTtcclxuICAgIH1cclxufSk7XHJcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShQZWVyQ29ubmVjdGlvbi5wcm90b3R5cGUsICdpY2VDb25uZWN0aW9uU3RhdGUnLCB7XHJcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5wYy5pY2VDb25uZWN0aW9uU3RhdGU7XHJcbiAgICB9XHJcbn0pO1xyXG5cclxuUGVlckNvbm5lY3Rpb24ucHJvdG90eXBlLl9yb2xlID0gZnVuY3Rpb24gKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuaXNJbml0aWF0b3IgPyAnaW5pdGlhdG9yJyA6ICdyZXNwb25kZXInO1xyXG59O1xyXG5cclxuLy8gQWRkIGEgc3RyZWFtIHRvIHRoZSBwZWVyIGNvbm5lY3Rpb24gb2JqZWN0XHJcblBlZXJDb25uZWN0aW9uLnByb3RvdHlwZS5hZGRTdHJlYW0gPSBmdW5jdGlvbiAoc3RyZWFtKSB7XHJcbiAgICB0aGlzLmxvY2FsU3RyZWFtID0gc3RyZWFtO1xyXG4gICAgdGhpcy5wYy5hZGRTdHJlYW0oc3RyZWFtKTtcclxufTtcclxuXHJcbi8vIGhlbHBlciBmdW5jdGlvbiB0byBjaGVjayBpZiBhIHJlbW90ZSBjYW5kaWRhdGUgaXMgYSBzdHVuL3JlbGF5XHJcbi8vIGNhbmRpZGF0ZSBvciBhbiBpcHY2IGNhbmRpZGF0ZVxyXG5QZWVyQ29ubmVjdGlvbi5wcm90b3R5cGUuX2NoZWNrTG9jYWxDYW5kaWRhdGUgPSBmdW5jdGlvbiAoY2FuZGlkYXRlKSB7XHJcbiAgICB2YXIgY2FuZCA9IHBhcnNlci50b0NhbmRpZGF0ZUpTT04oY2FuZGlkYXRlKTtcclxuICAgIGlmIChjYW5kLnR5cGUgPT0gJ3NyZmx4Jykge1xyXG4gICAgICAgIHRoaXMuaGFkTG9jYWxTdHVuQ2FuZGlkYXRlID0gdHJ1ZTtcclxuICAgIH0gZWxzZSBpZiAoY2FuZC50eXBlID09ICdyZWxheScpIHtcclxuICAgICAgICB0aGlzLmhhZExvY2FsUmVsYXlDYW5kaWRhdGUgPSB0cnVlO1xyXG4gICAgfVxyXG4gICAgaWYgKGNhbmQuaXAuaW5kZXhPZignOicpICE9IC0xKSB7XHJcbiAgICAgICAgdGhpcy5oYWRMb2NhbElQdjZDYW5kaWRhdGUgPSB0cnVlO1xyXG4gICAgfVxyXG59O1xyXG5cclxuLy8gaGVscGVyIGZ1bmN0aW9uIHRvIGNoZWNrIGlmIGEgcmVtb3RlIGNhbmRpZGF0ZSBpcyBhIHN0dW4vcmVsYXlcclxuLy8gY2FuZGlkYXRlIG9yIGFuIGlwdjYgY2FuZGlkYXRlXHJcblBlZXJDb25uZWN0aW9uLnByb3RvdHlwZS5fY2hlY2tSZW1vdGVDYW5kaWRhdGUgPSBmdW5jdGlvbiAoY2FuZGlkYXRlKSB7XHJcbiAgICB2YXIgY2FuZCA9IHBhcnNlci50b0NhbmRpZGF0ZUpTT04oY2FuZGlkYXRlKTtcclxuICAgIGlmIChjYW5kLnR5cGUgPT0gJ3NyZmx4Jykge1xyXG4gICAgICAgIHRoaXMuaGFkUmVtb3RlU3R1bkNhbmRpZGF0ZSA9IHRydWU7XHJcbiAgICB9IGVsc2UgaWYgKGNhbmQudHlwZSA9PSAncmVsYXknKSB7XHJcbiAgICAgICAgdGhpcy5oYWRSZW1vdGVSZWxheUNhbmRpZGF0ZSA9IHRydWU7XHJcbiAgICB9XHJcbiAgICBpZiAoY2FuZC5pcC5pbmRleE9mKCc6JykgIT0gLTEpIHtcclxuICAgICAgICB0aGlzLmhhZFJlbW90ZUlQdjZDYW5kaWRhdGUgPSB0cnVlO1xyXG4gICAgfVxyXG59O1xyXG5cclxuXHJcbi8vIEluaXQgYW5kIGFkZCBpY2UgY2FuZGlkYXRlIG9iamVjdCB3aXRoIGNvcnJlY3QgY29uc3RydWN0b3JcclxuUGVlckNvbm5lY3Rpb24ucHJvdG90eXBlLnByb2Nlc3NJY2UgPSBmdW5jdGlvbiAobXNnLCBjYikge1xyXG4gICAgY2IgPSBjYiB8fCBmdW5jdGlvbiAoKSB7fTtcclxuICAgIHZhciBzZWxmID0gdGhpcztcclxuXHJcbiAgICAvLyBpZ25vcmUgYW55IGFkZGVkIGljZSBjYW5kaWRhdGVzIHRvIGF2b2lkIGVycm9ycy4gd2h5IGRvZXMgdGhlXHJcbiAgICAvLyBzcGVjIG5vdCBkbyB0aGlzP1xyXG4gICAgaWYgKHRoaXMucGMuc2lnbmFsaW5nU3RhdGUgPT09ICdjbG9zZWQnKSByZXR1cm4gY2IoKTtcclxuXHJcbiAgICAvLyB3b3JraW5nIGFyb3VuZCBodHRwczovL2NvZGUuZ29vZ2xlLmNvbS9wL3dlYnJ0Yy9pc3N1ZXMvZGV0YWlsP2lkPTM2NjlcclxuICAgIGlmIChtc2cuY2FuZGlkYXRlICYmIG1zZy5jYW5kaWRhdGUuY2FuZGlkYXRlLmluZGV4T2YoJ2E9JykgIT09IDApIHtcclxuICAgICAgICBtc2cuY2FuZGlkYXRlLmNhbmRpZGF0ZSA9ICdhPScgKyBtc2cuY2FuZGlkYXRlLmNhbmRpZGF0ZTtcclxuICAgIH1cclxuXHJcbiAgICBzZWxmLl9jaGVja1JlbW90ZUNhbmRpZGF0ZShtc2cuY2FuZGlkYXRlLmNhbmRpZGF0ZSk7XHJcblxyXG4gICAgaWYgKCFzZWxmLnBjLnJlbW90ZURlc2NyaXB0aW9uKSB7XHJcbiAgICAgICAgc2VsZi5faWNlQnVmZmVyLnB1c2gobXNnLmNhbmRpZGF0ZSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIHNlbGYucGMuYWRkSWNlQ2FuZGlkYXRlKG5ldyBSVENJY2VDYW5kaWRhdGUobXNnLmNhbmRpZGF0ZSkpXHJcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gY2IoKTtcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5jYXRjaChmdW5jdGlvbiAoZXJyKSB7XHJcbiAgICAgICAgICAgIHNlbGYuZW1pdCgnZXJyb3InLCBlcnIpO1xyXG4gICAgICAgICAgICAvL3NlbGYubG9nZ2VyLmVycm9yKGVycik7XHJcbiAgICAgICAgICAgIHJldHVybiBjYihlcnIpO1xyXG4gICAgfSk7XHJcbn07XHJcblxyXG4vLyBHZW5lcmF0ZSBhbmQgZW1pdCBhbiBvZmZlciB3aXRoIHRoZSBnaXZlbiBjb25zdHJhaW50c1xyXG5QZWVyQ29ubmVjdGlvbi5wcm90b3R5cGUuY3JlYXRlT2ZmZXIgPSBmdW5jdGlvbiAoY29uc3RyYWludHMsIGNiKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICB2YXIgaGFzQ29uc3RyYWludHMgPSBhcmd1bWVudHMubGVuZ3RoID09PSAyO1xyXG4gICAgdmFyIG1lZGlhQ29uc3RyYWludHMgPSBoYXNDb25zdHJhaW50cyAmJiBjb25zdHJhaW50cyA/IGNvbnN0cmFpbnRzIDoge1xyXG4gICAgICAgICAgICBvZmZlclRvUmVjZWl2ZUF1ZGlvOiAxLFxyXG4gICAgICAgICAgICBvZmZlclRvUmVjZWl2ZVZpZGVvOiAxXHJcbiAgICAgICAgfTtcclxuICAgIGNiID0gaGFzQ29uc3RyYWludHMgPyBjYiA6IGNvbnN0cmFpbnRzO1xyXG4gICAgY2IgPSBjYiB8fCBmdW5jdGlvbiAoKSB7fTtcclxuXHJcbiAgICBpZiAodGhpcy5wYy5zaWduYWxpbmdTdGF0ZSA9PT0gJ2Nsb3NlZCcpIHJldHVybiBjYignUGVlciBhbHJlYWR5IGNsb3NlZCcpO1xyXG5cclxuICAgIC8vIEFjdHVhbGx5IGdlbmVyYXRlIHRoZSBvZmZlclxyXG4gICAgdGhpcy5wYy5jcmVhdGVPZmZlcihtZWRpYUNvbnN0cmFpbnRzKVxyXG4gICAgICAgIC50aGVuKGZ1bmN0aW9uIChvZmZlcikge1xyXG4gICAgICAgICAgICBzZWxmLl9jYW5kaWRhdGVCdWZmZXIgPSBbXTtcclxuXHJcbiAgICAgICAgICAgIC8vIHRoaXMgaGFjay4uLlxyXG4gICAgICAgICAgICB2YXIgZXhwYW5kZWRPZmZlciA9IHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdvZmZlcicsXHJcbiAgICAgICAgICAgICAgICBzZHA6IG9mZmVyLnNkcFxyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHNlbGYucGMuc2V0TG9jYWxEZXNjcmlwdGlvbihvZmZlcilcclxuICAgICAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgICAgICBleHBhbmRlZE9mZmVyLnNkcC5zcGxpdCgnXFxyXFxuJykuZm9yRWFjaChmdW5jdGlvbiAobGluZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobGluZS5pbmRleE9mKCdhPWNhbmRpZGF0ZTonKSA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5fY2hlY2tMb2NhbENhbmRpZGF0ZShsaW5lKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBzZWxmLmVtaXQoJ29mZmVyJywgZXhwYW5kZWRPZmZlcik7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNiKG51bGwsIGV4cGFuZGVkT2ZmZXIpO1xyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5jYXRjaChmdW5jdGlvbiAoZXJyKSB7XHJcbiAgICAgICAgICAgIHNlbGYuZW1pdCgnZXJyb3InLCBlcnIpO1xyXG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihlcnIpO1xyXG4gICAgICAgICAgICByZXR1cm4gY2IoZXJyKTtcclxuICAgICAgICB9KTtcclxufTtcclxuXHJcblxyXG4vLyBQcm9jZXNzIGFuIGluY29taW5nIG9mZmVyIHNvIHRoYXQgSUNFIG1heSBwcm9jZWVkIGJlZm9yZSBkZWNpZGluZ1xyXG4vLyB0byBhbnN3ZXIgdGhlIHJlcXVlc3QuXHJcblBlZXJDb25uZWN0aW9uLnByb3RvdHlwZS5oYW5kbGVPZmZlciA9IGZ1bmN0aW9uIChvZmZlciwgY2IpIHtcclxuICAgIGNiID0gY2IgfHwgZnVuY3Rpb24gKCkge307XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICBvZmZlci50eXBlID0gJ29mZmVyJztcclxuXHJcbiAgICBvZmZlci5zZHAuc3BsaXQoJ1xcclxcbicpLmZvckVhY2goZnVuY3Rpb24gKGxpbmUpIHtcclxuICAgICAgICBpZiAobGluZS5pbmRleE9mKCdhPWNhbmRpZGF0ZTonKSA9PT0gMCkge1xyXG4gICAgICAgICAgICBzZWxmLl9jaGVja1JlbW90ZUNhbmRpZGF0ZShsaW5lKTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICB2YXIgZGVzY3JpcHRpb24gPSBuZXcgUlRDU2Vzc2lvbkRlc2NyaXB0aW9uKG9mZmVyKTtcclxuXHJcbiAgICAvKnRyeSB7XHJcbiAgICBpZiAobmF2aWdhdG9yLm1vekdldFVzZXJNZWRpYSlcclxuICAgICAgICBkZXNjcmlwdGlvbiA9IHRoaXMuaW50ZXJvcC50b1VuaWZpZWRQbGFuKGRlc2NyaXB0aW9uKTtcclxuXHJcbiAgICBpZiAobmF2aWdhdG9yLndlYmtpdEdldFVzZXJNZWRpYSlcclxuICAgICAgICBkZXNjcmlwdGlvbiA9IHRoaXMuaW50ZXJvcC50b1BsYW5CKGRlc2NyaXB0aW9uKTtcclxuICAgIH0gY2F0Y2goZXJyKSB7fTsqL1xyXG5cclxuICAgIHNlbGYucGMuc2V0UmVtb3RlRGVzY3JpcHRpb24oZGVzY3JpcHRpb24pXHJcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24gKCl7XHJcbiAgICAgICAgICAgIHZhciBwcm9taXNlcyA9IFtdO1xyXG4gICAgICAgICAgICBzZWxmLl9pY2VCdWZmZXIuZm9yRWFjaChmdW5jdGlvbihjYW5kaWRhdGUpe1xyXG4gICAgICAgICAgICAgICAgcHJvbWlzZXMucHVzaChzZWxmLnBjLmFkZEljZUNhbmRpZGF0ZShjYW5kaWRhdGUpKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHNlbGYuX2ljZUJ1ZmZlciA9IFtdO1xyXG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xyXG4gICAgICAgIH0pXHJcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gY2IoKTtcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5jYXRjaChmdW5jdGlvbiAoZXJyKSB7XHJcbiAgICAgICAgICAgIHNlbGYuZW1pdCgnZXJyb3InLCBlcnIpO1xyXG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihlcnIpO1xyXG4gICAgICAgICAgICByZXR1cm4gY2IoZXJyKTtcclxuICAgICAgICB9KTtcclxufTtcclxuXHJcbi8vIEFuc3dlciBhbiBvZmZlciB3aXRoIGF1ZGlvIG9ubHlcclxuUGVlckNvbm5lY3Rpb24ucHJvdG90eXBlLmFuc3dlckF1ZGlvT25seSA9IGZ1bmN0aW9uIChjYikge1xyXG4gICAgdmFyIG1lZGlhQ29uc3RyYWludHMgPSB7XHJcbiAgICAgICAgICAgIG1hbmRhdG9yeToge1xyXG4gICAgICAgICAgICAgICAgT2ZmZXJUb1JlY2VpdmVBdWRpbzogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIE9mZmVyVG9SZWNlaXZlVmlkZW86IGZhbHNlXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG4gICAgdGhpcy5fYW5zd2VyKG1lZGlhQ29uc3RyYWludHMsIGNiKTtcclxufTtcclxuXHJcbi8vIEFuc3dlciBhbiBvZmZlciB3aXRob3V0IG9mZmVyaW5nIHRvIHJlY2lldmVcclxuUGVlckNvbm5lY3Rpb24ucHJvdG90eXBlLmFuc3dlckJyb2FkY2FzdE9ubHkgPSBmdW5jdGlvbiAoY2IpIHtcclxuICAgIHZhciBtZWRpYUNvbnN0cmFpbnRzID0ge1xyXG4gICAgICAgICAgICBtYW5kYXRvcnk6IHtcclxuICAgICAgICAgICAgICAgIE9mZmVyVG9SZWNlaXZlQXVkaW86IGZhbHNlLFxyXG4gICAgICAgICAgICAgICAgT2ZmZXJUb1JlY2VpdmVWaWRlbzogZmFsc2VcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcbiAgICB0aGlzLl9hbnN3ZXIobWVkaWFDb25zdHJhaW50cywgY2IpO1xyXG59O1xyXG5cclxuLy8gQW5zd2VyIGFuIG9mZmVyIHdpdGggZ2l2ZW4gY29uc3RyYWludHMgZGVmYXVsdCBpcyBhdWRpby92aWRlb1xyXG5QZWVyQ29ubmVjdGlvbi5wcm90b3R5cGUuY3JlYXRlQW5zd2VyID0gZnVuY3Rpb24gKGNvbnN0cmFpbnRzLCBjYikge1xyXG4gICAgdmFyIGhhc0NvbnN0cmFpbnRzID0gYXJndW1lbnRzLmxlbmd0aCA9PT0gMjtcclxuICAgIHZhciBjYWxsYmFjayA9IGhhc0NvbnN0cmFpbnRzID8gY2IgOiBjb25zdHJhaW50cztcclxuICAgIHZhciBtZWRpYUNvbnN0cmFpbnRzID0gaGFzQ29uc3RyYWludHMgJiYgY29uc3RyYWludHMgPyBjb25zdHJhaW50cyA6IHtcclxuICAgICAgICAgICAgbWFuZGF0b3J5OiB7XHJcbiAgICAgICAgICAgICAgICBPZmZlclRvUmVjZWl2ZUF1ZGlvOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgT2ZmZXJUb1JlY2VpdmVWaWRlbzogdHJ1ZVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICB0aGlzLl9hbnN3ZXIobWVkaWFDb25zdHJhaW50cywgY2FsbGJhY2spO1xyXG59O1xyXG5cclxuLy8gUHJvY2VzcyBhbiBhbnN3ZXJcclxuUGVlckNvbm5lY3Rpb24ucHJvdG90eXBlLmhhbmRsZUFuc3dlciA9IGZ1bmN0aW9uIChhbnN3ZXIsIGNiKSB7XHJcbiAgICBjYiA9IGNiIHx8IGZ1bmN0aW9uICgpIHt9O1xyXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gICAgXHJcbiAgICBhbnN3ZXIuc2RwLnNwbGl0KCdcXHJcXG4nKS5mb3JFYWNoKGZ1bmN0aW9uIChsaW5lKSB7XHJcbiAgICAgICAgaWYgKGxpbmUuaW5kZXhPZignYT1jYW5kaWRhdGU6JykgPT09IDApIHtcclxuICAgICAgICAgICAgc2VsZi5fY2hlY2tSZW1vdGVDYW5kaWRhdGUobGluZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgdmFyIGRlc2NyaXB0aW9uID0gbmV3IFJUQ1Nlc3Npb25EZXNjcmlwdGlvbihhbnN3ZXIpO1xyXG5cclxuICAgIC8qdHJ5IHtcclxuICAgIGlmIChuYXZpZ2F0b3IubW96R2V0VXNlck1lZGlhKVxyXG4gICAgICAgIGRlc2NyaXB0aW9uID0gdGhpcy5pbnRlcm9wLnRvVW5pZmllZFBsYW4oZGVzY3JpcHRpb24pO1xyXG4gICAgXHJcbiAgICBpZiAobmF2aWdhdG9yLndlYmtpdEdldFVzZXJNZWRpYSlcclxuICAgICAgICBkZXNjcmlwdGlvbiA9IHRoaXMuaW50ZXJvcC50b1BsYW5CKGRlc2NyaXB0aW9uKTtcclxuICAgIH0gY2F0Y2goZXJyKSB7fTsqL1xyXG5cclxuICAgIHNlbGYucGMuc2V0UmVtb3RlRGVzY3JpcHRpb24oZGVzY3JpcHRpb24pXHJcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gY2IoKTtcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5jYXRjaChmdW5jdGlvbiAoZXJyKSB7XHJcbiAgICAgICAgICAgIHNlbGYuZW1pdCgnZXJyb3InLCBlcnIpO1xyXG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihlcnIpO1xyXG4gICAgICAgICAgICByZXR1cm4gY2IoZXJyKTtcclxuICAgICAgICB9KTtcclxufTtcclxuXHJcbi8vIENsb3NlIHRoZSBwZWVyIGNvbm5lY3Rpb25cclxuUGVlckNvbm5lY3Rpb24ucHJvdG90eXBlLmNsb3NlID0gZnVuY3Rpb24gKCkge1xyXG4gICAgdGhpcy5fbG9jYWxEYXRhQ2hhbm5lbHMgPSBbXTtcclxuICAgIHRoaXMuX3JlbW90ZURhdGFDaGFubmVscyA9IFtdO1xyXG5cclxuICAgIHRoaXMub2ZmKCdyZW1vdmVUcmFjaycpO1xyXG4gICAgdGhpcy5vZmYoJ2FkZFN0cmVhbScpO1xyXG4gICAgdGhpcy5vZmYoJ25lZ290aWF0aW9uTmVlZGVkJyk7XHJcbiAgICB0aGlzLm9mZignaWNlQ29ubmVjdGlvblN0YXRlQ2hhbmdlJyk7XHJcbiAgICB0aGlzLm9mZignc2lnbmFsaW5nU3RhdGVDaGFuZ2UnKTtcclxuICAgIHRoaXMub2ZmKCdlcnJvcicpO1xyXG4gICAgdGhpcy5vZmYoJ29mZmVyJyk7XHJcbiAgICB0aGlzLm9mZignYW5zd2VyJyk7XHJcbiAgICB0aGlzLm9mZignaWNlJyk7XHJcbiAgICB0aGlzLm9mZignZW5kT2ZDYW5kaWRhdGVzJyk7XHJcbiAgICB0aGlzLm9mZignYWRkQ2hhbm5lbCcpO1xyXG5cclxuICAgIHRoaXMucGMuY2xvc2UoKTtcclxuICAgIHRoaXMuZW1pdCgnY2xvc2UnKTtcclxufTtcclxuXHJcbi8vIEludGVybmFsIGNvZGUgc2hhcmluZyBmb3IgdmFyaW91cyB0eXBlcyBvZiBhbnN3ZXIgbWV0aG9kc1xyXG5QZWVyQ29ubmVjdGlvbi5wcm90b3R5cGUuX2Fuc3dlciA9IGZ1bmN0aW9uIChjb25zdHJhaW50cywgY2IpIHtcclxuICAgIGNiID0gY2IgfHwgZnVuY3Rpb24gKCkge307XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICBpZiAoIXRoaXMucGMucmVtb3RlRGVzY3JpcHRpb24pIHtcclxuICAgICAgICAvLyB0aGUgb2xkIEFQSSBpcyB1c2VkLCBjYWxsIGhhbmRsZU9mZmVyXHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdyZW1vdGVEZXNjcmlwdGlvbiBub3Qgc2V0Jyk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMucGMuc2lnbmFsaW5nU3RhdGUgPT09ICdjbG9zZWQnKSByZXR1cm4gY2IoJ0FscmVhZHkgY2xvc2VkJyk7XHJcblxyXG4gICAgc2VsZi5wYy5jcmVhdGVBbnN3ZXIoY29uc3RyYWludHMpXHJcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24gKGFuc3dlcikge1xyXG4gICAgICAgICAgICBzZWxmLl9jYW5kaWRhdGVCdWZmZXIgPSBbXTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBleHBhbmRlZEFuc3dlciA9IHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdhbnN3ZXInLFxyXG4gICAgICAgICAgICAgICAgc2RwOiBhbnN3ZXIuc2RwXHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICByZXR1cm4gc2VsZi5wYy5zZXRMb2NhbERlc2NyaXB0aW9uKGFuc3dlcilcclxuICAgICAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgICAgICBleHBhbmRlZEFuc3dlci5zZHAuc3BsaXQoJ1xcclxcbicpLmZvckVhY2goZnVuY3Rpb24gKGxpbmUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxpbmUuaW5kZXhPZignYT1jYW5kaWRhdGU6JykgPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuX2NoZWNrTG9jYWxDYW5kaWRhdGUobGluZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBzZWxmLmVtaXQoJ2Fuc3dlcicsIGV4cGFuZGVkQW5zd2VyKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2IobnVsbCwgZXhwYW5kZWRBbnN3ZXIpO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSlcclxuICAgICAgICAuY2F0Y2goZnVuY3Rpb24gKGVycikge1xyXG4gICAgICAgICAgICBzZWxmLmVtaXQoJ2Vycm9yJywgZXJyKTtcclxuICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoZXJyKTtcclxuICAgICAgICAgICAgcmV0dXJuIGNiKGVycik7XHJcbiAgICAgICAgfSk7XHJcbn07XHJcblxyXG4vLyBJbnRlcm5hbCBtZXRob2QgZm9yIGVtaXR0aW5nIGljZSBjYW5kaWRhdGVzIG9uIG91ciBwZWVyIG9iamVjdFxyXG5QZWVyQ29ubmVjdGlvbi5wcm90b3R5cGUuX29uSWNlID0gZnVuY3Rpb24gKGV2ZW50KSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICBpZiAoZXZlbnQuY2FuZGlkYXRlKSB7XHJcbiAgICAgICAgdmFyIGljZSA9IGV2ZW50LmNhbmRpZGF0ZTtcclxuXHJcbiAgICAgICAgdmFyIGV4cGFuZGVkQ2FuZGlkYXRlID0ge1xyXG4gICAgICAgICAgICBjYW5kaWRhdGU6IHtcclxuICAgICAgICAgICAgICAgIGNhbmRpZGF0ZTogaWNlLmNhbmRpZGF0ZSxcclxuICAgICAgICAgICAgICAgIHNkcE1pZDogaWNlLnNkcE1pZCxcclxuICAgICAgICAgICAgICAgIHNkcE1MaW5lSW5kZXg6IGljZS5zZHBNTGluZUluZGV4XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG4gICAgICAgIHRoaXMuX2NoZWNrTG9jYWxDYW5kaWRhdGUoaWNlLmNhbmRpZGF0ZSk7XHJcblxyXG4gICAgICAgIHZhciBjYW5kID0gcGFyc2VyLnRvQ2FuZGlkYXRlSlNPTihpY2UuY2FuZGlkYXRlKTtcclxuXHJcbiAgICAgICAgdmFyIGFscmVhZHk7XHJcbiAgICAgICAgdmFyIGlkeDtcclxuICAgICAgICBpZiAodGhpcy5lbGltaW5hdGVEdXBsaWNhdGVDYW5kaWRhdGVzICYmIGNhbmQudHlwZSA9PT0gJ3JlbGF5Jykge1xyXG4gICAgICAgICAgICAvLyBkcm9wIGNhbmRpZGF0ZXMgd2l0aCBzYW1lIGZvdW5kYXRpb24sIGNvbXBvbmVudFxyXG4gICAgICAgICAgICAvLyB0YWtlIGxvY2FsIHR5cGUgcHJlZiBpbnRvIGFjY291bnQgc28gd2UgZG9uJ3QgaWdub3JlIHVkcFxyXG4gICAgICAgICAgICAvLyBvbmVzIHdoZW4gd2Uga25vdyBhYm91dCBhIFRDUCBvbmUuIHVubGlrZWx5IGJ1dC4uLlxyXG4gICAgICAgICAgICBhbHJlYWR5ID0gdGhpcy5fY2FuZGlkYXRlQnVmZmVyLmZpbHRlcihcclxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIChjKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGMudHlwZSA9PT0gJ3JlbGF5JztcclxuICAgICAgICAgICAgICAgIH0pLm1hcChmdW5jdGlvbiAoYykge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjLmZvdW5kYXRpb24gKyAnOicgKyBjLmNvbXBvbmVudDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgaWR4ID0gYWxyZWFkeS5pbmRleE9mKGNhbmQuZm91bmRhdGlvbiArICc6JyArIGNhbmQuY29tcG9uZW50KTtcclxuICAgICAgICAgICAgLy8gcmVtZW1iZXI6IGxvY2FsIHR5cGUgcHJlZiBvZiB1ZHAgaXMgMCwgdGNwIDEsIHRscyAyXHJcbiAgICAgICAgICAgIGlmIChpZHggPiAtMSAmJiAoKGNhbmQucHJpb3JpdHkgPj4gMjQpID49IChhbHJlYWR5W2lkeF0ucHJpb3JpdHkgPj4gMjQpKSkge1xyXG4gICAgICAgICAgICAgICAgLy8gZHJvcCBpdCwgc2FtZSBmb3VuZGF0aW9uIHdpdGggaGlnaGVyICh3b3JzZSkgdHlwZSBwcmVmXHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMuY29uZmlnLmJ1bmRsZVBvbGljeSA9PT0gJ21heC1idW5kbGUnKSB7XHJcbiAgICAgICAgICAgIC8vIGRyb3AgY2FuZGlkYXRlcyB3aGljaCBhcmUgZHVwbGljYXRlIGZvciBhdWRpby92aWRlby9kYXRhXHJcbiAgICAgICAgICAgIC8vIGR1cGxpY2F0ZSBtZWFucyBzYW1lIGhvc3QvcG9ydCBidXQgZGlmZmVyZW50IHNkcE1pZFxyXG4gICAgICAgICAgICBhbHJlYWR5ID0gdGhpcy5fY2FuZGlkYXRlQnVmZmVyLmZpbHRlcihcclxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIChjKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNhbmQudHlwZSA9PT0gYy50eXBlO1xyXG4gICAgICAgICAgICAgICAgfSkubWFwKGZ1bmN0aW9uIChjYW5kKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNhbmQuYWRkcmVzcyArICc6JyArIGNhbmQucG9ydDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgaWR4ID0gYWxyZWFkeS5pbmRleE9mKGNhbmQuYWRkcmVzcyArICc6JyArIGNhbmQucG9ydCk7XHJcbiAgICAgICAgICAgIGlmIChpZHggPiAtMSkgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBhbHNvIGRyb3AgcnRjcCBjYW5kaWRhdGVzIHNpbmNlIHdlIGtub3cgdGhlIHBlZXIgc3VwcG9ydHMgUlRDUC1NVVhcclxuICAgICAgICAvLyB0aGlzIGlzIGEgd29ya2Fyb3VuZCB1bnRpbCBicm93c2VycyBpbXBsZW1lbnQgdGhpcyBuYXRpdmVseVxyXG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy5ydGNwTXV4UG9saWN5ID09PSAncmVxdWlyZScgJiYgY2FuZC5jb21wb25lbnQgPT09ICcyJykge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuX2NhbmRpZGF0ZUJ1ZmZlci5wdXNoKGNhbmQpO1xyXG5cclxuICAgICAgICB0aGlzLmVtaXQoJ2ljZScsIGV4cGFuZGVkQ2FuZGlkYXRlKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5lbWl0KCdlbmRPZkNhbmRpZGF0ZXMnKTtcclxuICAgIH1cclxufTtcclxuXHJcbi8vIEludGVybmFsIG1ldGhvZCBmb3IgcHJvY2Vzc2luZyBhIG5ldyBkYXRhIGNoYW5uZWwgYmVpbmcgYWRkZWQgYnkgdGhlXHJcbi8vIG90aGVyIHBlZXIuXHJcblBlZXJDb25uZWN0aW9uLnByb3RvdHlwZS5fb25EYXRhQ2hhbm5lbCA9IGZ1bmN0aW9uIChldmVudCkge1xyXG4gICAgLy8gbWFrZSBzdXJlIHdlIGtlZXAgYSByZWZlcmVuY2Ugc28gdGhpcyBkb2Vzbid0IGdldCBnYXJiYWdlIGNvbGxlY3RlZFxyXG4gICAgdmFyIGNoYW5uZWwgPSBldmVudC5jaGFubmVsO1xyXG4gICAgdGhpcy5fcmVtb3RlRGF0YUNoYW5uZWxzLnB1c2goY2hhbm5lbCk7XHJcblxyXG4gICAgdGhpcy5lbWl0KCdhZGRDaGFubmVsJywgY2hhbm5lbCk7XHJcbn07XHJcblxyXG4vLyBDcmVhdGUgYSBkYXRhIGNoYW5uZWwgc3BlYyByZWZlcmVuY2U6XHJcbi8vIGh0dHA6Ly9kZXYudzMub3JnLzIwMTEvd2VicnRjL2VkaXRvci93ZWJydGMuaHRtbCNpZGwtZGVmLVJUQ0RhdGFDaGFubmVsSW5pdFxyXG5QZWVyQ29ubmVjdGlvbi5wcm90b3R5cGUuY3JlYXRlRGF0YUNoYW5uZWwgPSBmdW5jdGlvbiAobmFtZSwgb3B0cykge1xyXG4gICAgdmFyIGNoYW5uZWwgPSB0aGlzLnBjLmNyZWF0ZURhdGFDaGFubmVsKG5hbWUsIG9wdHMpO1xyXG5cclxuICAgIC8vIG1ha2Ugc3VyZSB3ZSBrZWVwIGEgcmVmZXJlbmNlIHNvIHRoaXMgZG9lc24ndCBnZXQgZ2FyYmFnZSBjb2xsZWN0ZWRcclxuICAgIHRoaXMuX2xvY2FsRGF0YUNoYW5uZWxzLnB1c2goY2hhbm5lbCk7XHJcblxyXG4gICAgcmV0dXJuIGNoYW5uZWw7XHJcbn07XHJcblxyXG5QZWVyQ29ubmVjdGlvbi5wcm90b3R5cGUuZ2V0U3RhdHMgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICBpZiAodHlwZW9mIGFyZ3VtZW50c1swXSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHZhciBjYiA9IGFyZ3VtZW50c1swXTtcclxuICAgICAgICB0aGlzLnBjLmdldFN0YXRzKCkudGhlbihmdW5jdGlvbiAocmVzKSB7XHJcbiAgICAgICAgICAgIGNiKG51bGwsIHJlcyk7XHJcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xyXG4gICAgICAgICAgICBjYihlcnIpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5wYy5nZXRTdGF0cy5hcHBseSh0aGlzLnBjLCBhcmd1bWVudHMpO1xyXG4gICAgfVxyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBQZWVyQ29ubmVjdGlvbjtcclxuIl19
