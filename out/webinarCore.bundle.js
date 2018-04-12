(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.WebinarCore = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
var methods = "assert,count,debug,dir,dirxml,error,exception,group,groupCollapsed,groupEnd,info,log,markTimeline,profile,profileEnd,time,timeEnd,trace,warn".split(",");
var l = methods.length;
var fn = function () {};
var mockconsole = {};

while (l--) {
    mockconsole[methods[l]] = fn;
}

module.exports = mockconsole;

},{}],2:[function(require,module,exports){
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

},{}],3:[function(require,module,exports){
var mockconsole = require('mockconsole');
var LocalMedia = require('./localmedia');
var PeerManager = require('./peerManager');

function WebinarCore(connection, options) {
    options = options || {};
    // call emitter constructor
    LocalMedia.call(this, options);

    var defaultConfig = {
        debug: false,
        logger: console || mockconsole,
        peerConnectionConfig: {
            iceServers: [
                { 'urls': 'stun:stun.l.google.com:19302' }
            ]
        },
        peerConnectionConstraints: {
            optional: []
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

    this.remoteStreams = [];
    this._streamsInfo = {};
}

WebinarCore.prototype = Object.create(LocalMedia.prototype);

WebinarCore.prototype.addPeer = function (id) {
    var self = this;
    if (id === this.config.userId)
        return;

    var peer = this.peerManager.getPeer(id);
    if (!peer) {
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

        // let the 'negotiationneeded' event trigger offer generation
        peer.on("negotiationNeeded", function () {
            var pc = this;
            // Workaround for Chrome: skip nested negotiations
            /*if (pc.isNegotiating)
                return;*/
            self._createOffer.bind(self);
            self._createOffer(pc);
        });

        peer.on("signalingStateChange", function () {
            var pc = this;
            pc.isNegotiating = (pc.signalingState !== "stable");
        });

        // once remote stream arrives, show it in the remote video element
        peer.on("addStream", this._handleRemoteStream.bind(this, peer));

        //add opened streams
        this.localStreams.forEach(function(stream) {
            self._sendStreamInfo("camera", stream.id);
            self.peerManager.addStream(stream);
        });

        this.localScreens.forEach(function(stream) {
            self._sendStreamInfo("screen", stream.id);
            self.peerManager.addStream(stream);
        });

        if (this.config.isLeader && !this.config.isOneWay) {
            this._createOffer(peer);
        }
    } else {
        //recreate peer
        this.peerManager.removePeer(id);
        this.addPeer(id);
    }
}

WebinarCore.prototype.removePeer = function (id) {
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
            evt.type = "candidate";
            self.connection.send(evt);
        }
    });

    //add opened streams
    this.localStreams.forEach(function (stream) {
        self._sendStreamInfo("camera", stream.id);
        self.peerManager.addStream(stream);
    });

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

        var localPeer = this.peerManager.localPeer;
        /*if (msg.type === "offer" && !localPeer) {
            debugger;
            localPeer = this.peerManager.createLocalPeer(userId);
            localPeer.on("addStream", this._handleRemoteStream.bind(this));
        }*/
        
        pc = localPeer;
    }

    if (!pc) {
        this.logger.error("Peer not found");
        return;
    }

    if (msg.type === "offer") {
        pc.remoteId = msg.from;
        pc.handleOffer(msg, function (err) {
            pc.createAnswer(function (err, answer) {
                if (err) {
                    self.logger.error(err);
                    return;
                }

                answer.from = self.config.userId;
                answer.to = msg.from;
                self.connection.send(answer);
            });
        });

        return;
    }

    if (msg.type === "candidate") {
        pc.processIce(msg);
        return;
    }

    if (msg.type === "answer") {
        pc.handleAnswer(msg);
        return;
    }

    if (msg.type === "media-captured") {
        self._streamsInfo[msg.data.streamId] = msg.data;

        if (this.config.isLeader) {
            this._createOffer(pc);
        }

        return;
    }

    this.logger.warn("Unknown message:");
    this.logger.warn(msg);
}

WebinarCore.prototype._createOffer = function (pc) {
    var self = this;
    pc.createOffer(self.config.receiveMedia,
        function (error, offer) {
            if (error) {
                this.logger.error(error);
                return;
            }

            var userId = self.config.userId;
            offer.from = userId;
            offer.to = pc.userId;
            self.connection.send(offer);
        });
}

WebinarCore.prototype._handleStream = function (stream) {
    stream["type"] = "camera";
    this._sendStreamInfo("camera", stream.id);
    this.peerManager.addStream(stream);

    //add local stream to local peer if TwoWay mode
    if (this.peerManager.localPeer)
        this.peerManager.localPeer.addStream(stream);
}

WebinarCore.prototype._handleScreen = function (stream) {
    stream["type"] = "screen";
    this._sendStreamInfo("screen", stream.id);
    this.peerManager.addStream(stream);
}

WebinarCore.prototype._handleStreamEnded = function (stream) {
    this.peerManager.removeStream(stream);
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

    var info = self._streamsInfo[e.stream.id];
    if (info)
        e.stream["type"] = info.type;


    this.remoteStreams.push(e.stream);

    e.stream.getTracks().forEach(function (track) {
        track.addEventListener("ended", function () {
            if (self._isAllTracksEnded(e.stream)) {
                e.stream.stop();
                self.remoteStreams.removeItem(e.stream);
                self.emit("remoteStreamEnded", e.stream);
            }
        });
    });

    this.emit("remoteStream", e.stream);
}

WebinarCore.prototype._sendStreamInfo = function (type, streamId) {
    var msg = {
        type: "media-captured",
        from: this.config.userId,
        data: {
            streamId: streamId,
            type: type
        }
    }
    this.connection.send(msg);
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
},{"./localmedia":5,"./peerManager":7,"mockconsole":1}],4:[function(require,module,exports){
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

},{}],5:[function(require,module,exports){
//var hark = require('hark');
var getUserMedia = require('./getusermedia');
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

},{"./getusermedia":4,"mockconsole":1,"wildemitter":2}],6:[function(require,module,exports){
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
},{}],7:[function(require,module,exports){
var WildEmitter = require('wildemitter');
var mockconsole = require('mockconsole');
var PeerConnection = require('./peerconnection')

function PeerManager(options) {
    options = options || {}
    this.peers = [];
    this.localPeer = null;

    // call emitter constructor
    WildEmitter.call(this);

    var defaultConfig = {
        debug: false,
        logger: console || mockconsole,
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

PeerManager.prototype = Object.create(WildEmitter.prototype);

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
},{"./peerconnection":8,"mockconsole":1,"wildemitter":2}],8:[function(require,module,exports){
var parser = require('./parsers');
var WildEmitter = require('wildemitter');

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
            stream.getTracks().forEach(function (track) {
                self.pc.removeTrack(track);
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

    this.localDescription = {
        contents: []
    };
    this.remoteDescription = {
        contents: []
    };

    this.config = {
        debug: false,
        sid: '',
        isInitiator: true,
        sdpSessionID: Date.now(),
        useJingle: false
    };

    this.iceCredentials = {
        local: {},
        remote: {}
    };

    // apply our config
    for (item in config) {
        this.config[item] = config[item];
    }

    if (this.config.debug) {
        this.on('*', function () {
            var logger = config.logger || console;
            logger.log('PeerConnection event:', arguments);
        });
    }
    this.hadLocalStunCandidate = false;
    this.hadRemoteStunCandidate = false;
    this.hadLocalRelayCandidate = false;
    this.hadRemoteRelayCandidate = false;

    this.hadLocalIPv6Candidate = false;
    this.hadRemoteIPv6Candidate = false;

    // keeping references for all our data channels
    // so they dont get garbage collected
    // can be removed once the following bugs have been fixed
    // https://crbug.com/405545
    // https://bugzilla.mozilla.org/show_bug.cgi?id=964092
    // to be filed for opera
    this._remoteDataChannels = [];
    this._localDataChannels = [];

    this._candidateBuffer = [];
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
PeerConnection.prototype.processIce = function (update, cb) {
    cb = cb || function () {};
    var self = this;

    // ignore any added ice candidates to avoid errors. why does the
    // spec not do this?
    if (this.pc.signalingState === 'closed') return cb();

    // working around https://code.google.com/p/webrtc/issues/detail?id=3669
    if (update.candidate && update.candidate.candidate.indexOf('a=') !== 0) {
        update.candidate.candidate = 'a=' + update.candidate.candidate;
    }

    self.pc.addIceCandidate(
        new RTCIceCandidate(update.candidate),
        function () { },
        function (err) {
            self.emit('error', err);
        }
    );
    self._checkRemoteCandidate(update.candidate.candidate);
    cb();
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
    this.pc.createOffer(
        function (offer) {
            // does not work for jingle, but jingle.js doesn't need
            // this hack...
            var expandedOffer = {
                type: 'offer',
                sdp: offer.sdp
            };
            
            self._candidateBuffer = [];
            self.pc.setLocalDescription(offer,
                function () {
                    expandedOffer.sdp.split('\r\n').forEach(function (line) {
                        if (line.indexOf('a=candidate:') === 0) {
                            self._checkLocalCandidate(line);
                        }
                    });

                    self.emit('offer', expandedOffer);
                    cb(null, expandedOffer);
                },
                function (err) {
                    self.emit('error', err);
                    cb(err);
                }
            );
        },
        function (err) {
            self.emit('error', err);
            cb(err);
        },
        mediaConstraints
    );
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
    self.pc.setRemoteDescription(new RTCSessionDescription(offer), cb,
        function (err) {
            self.emit('error', err);
            cb(err);
        }
    );
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
    self.pc.setRemoteDescription(
        new RTCSessionDescription(answer), cb,
        function (err) {
            self.emit('error', err);
            cb(err);
        }
    );
};

// Close the peer connection
PeerConnection.prototype.close = function () {
    this.pc.close();

    this._localDataChannels = [];
    this._remoteDataChannels = [];

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

    self.pc.createAnswer(
        function (answer) {
            var sim = [];

            var expandedAnswer = {
                type: 'answer',
                sdp: answer.sdp
            };
            
            self._candidateBuffer = [];
            self.pc.setLocalDescription(answer,
                function () {
                    expandedAnswer.sdp.split('\r\n').forEach(function (line) {
                        if (line.indexOf('a=candidate:') === 0) {
                            self._checkLocalCandidate(line);
                        }
                    });
                    
                    self.emit('answer', expandedAnswer);
                    cb(null, expandedAnswer);
                },
                function (err) {
                    self.emit('error', err);
                    cb(err);
                }
            );
        },
        function (err) {
            self.emit('error', err);
            cb(err);
        },
        constraints
    );
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

},{"./parsers":6,"wildemitter":2}]},{},[3])(3)
});
