(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.PeerConnection = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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
},{}],3:[function(require,module,exports){
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

},{"./parsers":2,"wildemitter":1}]},{},[3])(3)
});

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvd2lsZGVtaXR0ZXIvd2lsZGVtaXR0ZXIuanMiLCJzcmMvcGFyc2Vycy5qcyIsInNyYy9wZWVyY29ubmVjdGlvbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsIi8qXHJcbldpbGRFbWl0dGVyLmpzIGlzIGEgc2xpbSBsaXR0bGUgZXZlbnQgZW1pdHRlciBieSBAaGVucmlram9yZXRlZyBsYXJnZWx5IGJhc2VkXHJcbm9uIEB2aXNpb25tZWRpYSdzIEVtaXR0ZXIgZnJvbSBVSSBLaXQuXHJcblxyXG5XaHk/IEkgd2FudGVkIGl0IHN0YW5kYWxvbmUuXHJcblxyXG5JIGFsc28gd2FudGVkIHN1cHBvcnQgZm9yIHdpbGRjYXJkIGVtaXR0ZXJzIGxpa2UgdGhpczpcclxuXHJcbmVtaXR0ZXIub24oJyonLCBmdW5jdGlvbiAoZXZlbnROYW1lLCBvdGhlciwgZXZlbnQsIHBheWxvYWRzKSB7XHJcblxyXG59KTtcclxuXHJcbmVtaXR0ZXIub24oJ3NvbWVuYW1lc3BhY2UqJywgZnVuY3Rpb24gKGV2ZW50TmFtZSwgcGF5bG9hZHMpIHtcclxuXHJcbn0pO1xyXG5cclxuUGxlYXNlIG5vdGUgdGhhdCBjYWxsYmFja3MgdHJpZ2dlcmVkIGJ5IHdpbGRjYXJkIHJlZ2lzdGVyZWQgZXZlbnRzIGFsc28gZ2V0XHJcbnRoZSBldmVudCBuYW1lIGFzIHRoZSBmaXJzdCBhcmd1bWVudC5cclxuKi9cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gV2lsZEVtaXR0ZXI7XHJcblxyXG5mdW5jdGlvbiBXaWxkRW1pdHRlcigpIHsgfVxyXG5cclxuV2lsZEVtaXR0ZXIubWl4aW4gPSBmdW5jdGlvbiAoY29uc3RydWN0b3IpIHtcclxuICAgIHZhciBwcm90b3R5cGUgPSBjb25zdHJ1Y3Rvci5wcm90b3R5cGUgfHwgY29uc3RydWN0b3I7XHJcblxyXG4gICAgcHJvdG90eXBlLmlzV2lsZEVtaXR0ZXI9IHRydWU7XHJcblxyXG4gICAgLy8gTGlzdGVuIG9uIHRoZSBnaXZlbiBgZXZlbnRgIHdpdGggYGZuYC4gU3RvcmUgYSBncm91cCBuYW1lIGlmIHByZXNlbnQuXHJcbiAgICBwcm90b3R5cGUub24gPSBmdW5jdGlvbiAoZXZlbnQsIGdyb3VwTmFtZSwgZm4pIHtcclxuICAgICAgICB0aGlzLmNhbGxiYWNrcyA9IHRoaXMuY2FsbGJhY2tzIHx8IHt9O1xyXG4gICAgICAgIHZhciBoYXNHcm91cCA9IChhcmd1bWVudHMubGVuZ3RoID09PSAzKSxcclxuICAgICAgICAgICAgZ3JvdXAgPSBoYXNHcm91cCA/IGFyZ3VtZW50c1sxXSA6IHVuZGVmaW5lZCxcclxuICAgICAgICAgICAgZnVuYyA9IGhhc0dyb3VwID8gYXJndW1lbnRzWzJdIDogYXJndW1lbnRzWzFdO1xyXG4gICAgICAgIGZ1bmMuX2dyb3VwTmFtZSA9IGdyb3VwO1xyXG4gICAgICAgICh0aGlzLmNhbGxiYWNrc1tldmVudF0gPSB0aGlzLmNhbGxiYWNrc1tldmVudF0gfHwgW10pLnB1c2goZnVuYyk7XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9O1xyXG5cclxuICAgIC8vIEFkZHMgYW4gYGV2ZW50YCBsaXN0ZW5lciB0aGF0IHdpbGwgYmUgaW52b2tlZCBhIHNpbmdsZVxyXG4gICAgLy8gdGltZSB0aGVuIGF1dG9tYXRpY2FsbHkgcmVtb3ZlZC5cclxuICAgIHByb3RvdHlwZS5vbmNlID0gZnVuY3Rpb24gKGV2ZW50LCBncm91cE5hbWUsIGZuKSB7XHJcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzLFxyXG4gICAgICAgICAgICBoYXNHcm91cCA9IChhcmd1bWVudHMubGVuZ3RoID09PSAzKSxcclxuICAgICAgICAgICAgZ3JvdXAgPSBoYXNHcm91cCA/IGFyZ3VtZW50c1sxXSA6IHVuZGVmaW5lZCxcclxuICAgICAgICAgICAgZnVuYyA9IGhhc0dyb3VwID8gYXJndW1lbnRzWzJdIDogYXJndW1lbnRzWzFdO1xyXG4gICAgICAgIGZ1bmN0aW9uIG9uKCkge1xyXG4gICAgICAgICAgICBzZWxmLm9mZihldmVudCwgb24pO1xyXG4gICAgICAgICAgICBmdW5jLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMub24oZXZlbnQsIGdyb3VwLCBvbik7XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9O1xyXG5cclxuICAgIC8vIFVuYmluZHMgYW4gZW50aXJlIGdyb3VwXHJcbiAgICBwcm90b3R5cGUucmVsZWFzZUdyb3VwID0gZnVuY3Rpb24gKGdyb3VwTmFtZSkge1xyXG4gICAgICAgIHRoaXMuY2FsbGJhY2tzID0gdGhpcy5jYWxsYmFja3MgfHwge307XHJcbiAgICAgICAgdmFyIGl0ZW0sIGksIGxlbiwgaGFuZGxlcnM7XHJcbiAgICAgICAgZm9yIChpdGVtIGluIHRoaXMuY2FsbGJhY2tzKSB7XHJcbiAgICAgICAgICAgIGhhbmRsZXJzID0gdGhpcy5jYWxsYmFja3NbaXRlbV07XHJcbiAgICAgICAgICAgIGZvciAoaSA9IDAsIGxlbiA9IGhhbmRsZXJzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoaGFuZGxlcnNbaV0uX2dyb3VwTmFtZSA9PT0gZ3JvdXBOYW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy9jb25zb2xlLmxvZygncmVtb3ZpbmcnKTtcclxuICAgICAgICAgICAgICAgICAgICAvLyByZW1vdmUgaXQgYW5kIHNob3J0ZW4gdGhlIGFycmF5IHdlJ3JlIGxvb3BpbmcgdGhyb3VnaFxyXG4gICAgICAgICAgICAgICAgICAgIGhhbmRsZXJzLnNwbGljZShpLCAxKTtcclxuICAgICAgICAgICAgICAgICAgICBpLS07XHJcbiAgICAgICAgICAgICAgICAgICAgbGVuLS07XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9O1xyXG5cclxuICAgIC8vIFJlbW92ZSB0aGUgZ2l2ZW4gY2FsbGJhY2sgZm9yIGBldmVudGAgb3IgYWxsXHJcbiAgICAvLyByZWdpc3RlcmVkIGNhbGxiYWNrcy5cclxuICAgIHByb3RvdHlwZS5vZmYgPSBmdW5jdGlvbiAoZXZlbnQsIGZuKSB7XHJcbiAgICAgICAgdGhpcy5jYWxsYmFja3MgPSB0aGlzLmNhbGxiYWNrcyB8fCB7fTtcclxuICAgICAgICB2YXIgY2FsbGJhY2tzID0gdGhpcy5jYWxsYmFja3NbZXZlbnRdLFxyXG4gICAgICAgICAgICBpO1xyXG5cclxuICAgICAgICBpZiAoIWNhbGxiYWNrcykgcmV0dXJuIHRoaXM7XHJcblxyXG4gICAgICAgIC8vIHJlbW92ZSBhbGwgaGFuZGxlcnNcclxuICAgICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMSkge1xyXG4gICAgICAgICAgICBkZWxldGUgdGhpcy5jYWxsYmFja3NbZXZlbnRdO1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIHJlbW92ZSBzcGVjaWZpYyBoYW5kbGVyXHJcbiAgICAgICAgaSA9IGNhbGxiYWNrcy5pbmRleE9mKGZuKTtcclxuICAgICAgICBjYWxsYmFja3Muc3BsaWNlKGksIDEpO1xyXG4gICAgICAgIGlmIChjYWxsYmFja3MubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLmNhbGxiYWNrc1tldmVudF07XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfTtcclxuXHJcbiAgICAvLy8gRW1pdCBgZXZlbnRgIHdpdGggdGhlIGdpdmVuIGFyZ3MuXHJcbiAgICAvLyBhbHNvIGNhbGxzIGFueSBgKmAgaGFuZGxlcnNcclxuICAgIHByb3RvdHlwZS5lbWl0ID0gZnVuY3Rpb24gKGV2ZW50KSB7XHJcbiAgICAgICAgdGhpcy5jYWxsYmFja3MgPSB0aGlzLmNhbGxiYWNrcyB8fCB7fTtcclxuICAgICAgICB2YXIgYXJncyA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSxcclxuICAgICAgICAgICAgY2FsbGJhY2tzID0gdGhpcy5jYWxsYmFja3NbZXZlbnRdLFxyXG4gICAgICAgICAgICBzcGVjaWFsQ2FsbGJhY2tzID0gdGhpcy5nZXRXaWxkY2FyZENhbGxiYWNrcyhldmVudCksXHJcbiAgICAgICAgICAgIGksXHJcbiAgICAgICAgICAgIGxlbixcclxuICAgICAgICAgICAgaXRlbSxcclxuICAgICAgICAgICAgbGlzdGVuZXJzO1xyXG5cclxuICAgICAgICBpZiAoY2FsbGJhY2tzKSB7XHJcbiAgICAgICAgICAgIGxpc3RlbmVycyA9IGNhbGxiYWNrcy5zbGljZSgpO1xyXG4gICAgICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBsaXN0ZW5lcnMubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcclxuICAgICAgICAgICAgICAgIGlmICghbGlzdGVuZXJzW2ldKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcnNbaV0uYXBwbHkodGhpcywgYXJncyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChzcGVjaWFsQ2FsbGJhY2tzKSB7XHJcbiAgICAgICAgICAgIGxlbiA9IHNwZWNpYWxDYWxsYmFja3MubGVuZ3RoO1xyXG4gICAgICAgICAgICBsaXN0ZW5lcnMgPSBzcGVjaWFsQ2FsbGJhY2tzLnNsaWNlKCk7XHJcbiAgICAgICAgICAgIGZvciAoaSA9IDAsIGxlbiA9IGxpc3RlbmVycy5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKCFsaXN0ZW5lcnNbaV0pIHtcclxuICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGxpc3RlbmVyc1tpXS5hcHBseSh0aGlzLCBbZXZlbnRdLmNvbmNhdChhcmdzKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfTtcclxuXHJcbiAgICAvLyBIZWxwZXIgZm9yIGZvciBmaW5kaW5nIHNwZWNpYWwgd2lsZGNhcmQgZXZlbnQgaGFuZGxlcnMgdGhhdCBtYXRjaCB0aGUgZXZlbnRcclxuICAgIHByb3RvdHlwZS5nZXRXaWxkY2FyZENhbGxiYWNrcyA9IGZ1bmN0aW9uIChldmVudE5hbWUpIHtcclxuICAgICAgICB0aGlzLmNhbGxiYWNrcyA9IHRoaXMuY2FsbGJhY2tzIHx8IHt9O1xyXG4gICAgICAgIHZhciBpdGVtLFxyXG4gICAgICAgICAgICBzcGxpdCxcclxuICAgICAgICAgICAgcmVzdWx0ID0gW107XHJcblxyXG4gICAgICAgIGZvciAoaXRlbSBpbiB0aGlzLmNhbGxiYWNrcykge1xyXG4gICAgICAgICAgICBzcGxpdCA9IGl0ZW0uc3BsaXQoJyonKTtcclxuICAgICAgICAgICAgaWYgKGl0ZW0gPT09ICcqJyB8fCAoc3BsaXQubGVuZ3RoID09PSAyICYmIGV2ZW50TmFtZS5zbGljZSgwLCBzcGxpdFswXS5sZW5ndGgpID09PSBzcGxpdFswXSkpIHtcclxuICAgICAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5jb25jYXQodGhpcy5jYWxsYmFja3NbaXRlbV0pO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9O1xyXG5cclxufTtcclxuXHJcbldpbGRFbWl0dGVyLm1peGluKFdpbGRFbWl0dGVyKTtcclxuIiwidmFyIGlkQ291bnRlciA9IE1hdGgucmFuZG9tKCk7XG5cbnZhciBwYXJzZUNhbmRpZGF0ZSA9IGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgdmFyIHBhcnRzO1xuICAgIGlmIChsaW5lLmluZGV4T2YoJ2E9Y2FuZGlkYXRlOicpID09PSAwKSB7XG4gICAgICAgIHBhcnRzID0gbGluZS5zdWJzdHJpbmcoMTIpLnNwbGl0KCcgJyk7XG4gICAgfSBlbHNlIHsgLy8gbm8gYT1jYW5kaWRhdGVcbiAgICAgICAgcGFydHMgPSBsaW5lLnN1YnN0cmluZygxMCkuc3BsaXQoJyAnKTtcbiAgICB9XG5cbiAgICB2YXIgY2FuZGlkYXRlID0ge1xuICAgICAgICBmb3VuZGF0aW9uOiBwYXJ0c1swXSxcbiAgICAgICAgY29tcG9uZW50OiBwYXJ0c1sxXSxcbiAgICAgICAgcHJvdG9jb2w6IHBhcnRzWzJdLnRvTG93ZXJDYXNlKCksXG4gICAgICAgIHByaW9yaXR5OiBwYXJ0c1szXSxcbiAgICAgICAgaXA6IHBhcnRzWzRdLFxuICAgICAgICBwb3J0OiBwYXJ0c1s1XSxcbiAgICAgICAgLy8gc2tpcCBwYXJ0c1s2XSA9PSAndHlwJ1xuICAgICAgICB0eXBlOiBwYXJ0c1s3XSxcbiAgICAgICAgZ2VuZXJhdGlvbjogJzAnXG4gICAgfTtcblxuICAgIGZvciAodmFyIGkgPSA4OyBpIDwgcGFydHMubGVuZ3RoOyBpICs9IDIpIHtcbiAgICAgICAgaWYgKHBhcnRzW2ldID09PSAncmFkZHInKSB7XG4gICAgICAgICAgICBjYW5kaWRhdGUucmVsQWRkciA9IHBhcnRzW2kgKyAxXTtcbiAgICAgICAgfSBlbHNlIGlmIChwYXJ0c1tpXSA9PT0gJ3Jwb3J0Jykge1xuICAgICAgICAgICAgY2FuZGlkYXRlLnJlbFBvcnQgPSBwYXJ0c1tpICsgMV07XG4gICAgICAgIH0gZWxzZSBpZiAocGFydHNbaV0gPT09ICdnZW5lcmF0aW9uJykge1xuICAgICAgICAgICAgY2FuZGlkYXRlLmdlbmVyYXRpb24gPSBwYXJ0c1tpICsgMV07XG4gICAgICAgIH0gZWxzZSBpZiAocGFydHNbaV0gPT09ICd0Y3B0eXBlJykge1xuICAgICAgICAgICAgY2FuZGlkYXRlLnRjcFR5cGUgPSBwYXJ0c1tpICsgMV07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjYW5kaWRhdGUubmV0d29yayA9ICcxJztcblxuICAgIHJldHVybiBjYW5kaWRhdGU7XG59O1xuXG5leHBvcnRzLnRvQ2FuZGlkYXRlSlNPTiA9IGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgdmFyIGNhbmRpZGF0ZSA9IHBhcnNlQ2FuZGlkYXRlKGxpbmUuc3BsaXQoJ1xcclxcbicpWzBdKTtcbiAgICBjYW5kaWRhdGUuaWQgPSAoaWRDb3VudGVyKyspLnRvU3RyaW5nKDM2KS5zdWJzdHIoMCwgMTIpO1xuICAgIHJldHVybiBjYW5kaWRhdGU7XG59OyIsInZhciBwYXJzZXIgPSByZXF1aXJlKCcuL3BhcnNlcnMnKTtcclxudmFyIFdpbGRFbWl0dGVyID0gcmVxdWlyZSgnd2lsZGVtaXR0ZXInKTtcclxuLy92YXIgSW50ZXJvcCA9IHJlcXVpcmUoJ3NkcC1pbnRlcm9wJyk7XHJcblxyXG5mdW5jdGlvbiBQZWVyQ29ubmVjdGlvbihjb25maWcsIGNvbnN0cmFpbnRzKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICB2YXIgaXRlbTtcclxuICAgIFdpbGRFbWl0dGVyLmNhbGwodGhpcyk7XHJcblxyXG4gICAgY29uZmlnID0gY29uZmlnIHx8IHt9O1xyXG4gICAgY29uZmlnLmljZVNlcnZlcnMgPSBjb25maWcuaWNlU2VydmVycyB8fCBbXTtcclxuXHJcbiAgICAvLyBFWFBFUklNRU5UQUwgRkxBRywgbWlnaHQgZ2V0IHJlbW92ZWQgd2l0aG91dCBub3RpY2VcclxuICAgIC8vIHRoaXMgYXR0ZW1wcyB0byBzdHJpcCBvdXQgY2FuZGlkYXRlcyB3aXRoIGFuIGFscmVhZHkga25vd24gZm91bmRhdGlvblxyXG4gICAgLy8gYW5kIHR5cGUgLS0gaS5lLiB0aG9zZSB3aGljaCBhcmUgZ2F0aGVyZWQgdmlhIHRoZSBzYW1lIFRVUk4gc2VydmVyXHJcbiAgICAvLyBidXQgZGlmZmVyZW50IHRyYW5zcG9ydHMgKFRVUk4gdWRwLCB0Y3AgYW5kIHRscyByZXNwZWN0aXZlbHkpXHJcbiAgICBpZiAoY29uZmlnLmVsaW1pbmF0ZUR1cGxpY2F0ZUNhbmRpZGF0ZXMgJiYgd2luZG93LmNocm9tZSkge1xyXG4gICAgICAgIHNlbGYuZWxpbWluYXRlRHVwbGljYXRlQ2FuZGlkYXRlcyA9IGNvbmZpZy5lbGltaW5hdGVEdXBsaWNhdGVDYW5kaWRhdGVzO1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMucGMgPSBuZXcgUlRDUGVlckNvbm5lY3Rpb24oY29uZmlnLCBjb25zdHJhaW50cyk7XHJcblxyXG4gICAgaWYgKHR5cGVvZiB0aGlzLnBjLmdldExvY2FsU3RyZWFtcyA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHRoaXMuZ2V0TG9jYWxTdHJlYW1zID0gdGhpcy5wYy5nZXRMb2NhbFN0cmVhbXMuYmluZCh0aGlzLnBjKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5nZXRMb2NhbFN0cmVhbXMgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBbXTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAodHlwZW9mIHRoaXMucGMuZ2V0U2VuZGVycyA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHRoaXMuZ2V0U2VuZGVycyA9IHRoaXMucGMuZ2V0U2VuZGVycy5iaW5kKHRoaXMucGMpO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICB0aGlzLmdldFNlbmRlcnMgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBbXTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0eXBlb2YgdGhpcy5wYy5nZXRSZW1vdGVTdHJlYW1zID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgdGhpcy5nZXRSZW1vdGVTdHJlYW1zID0gdGhpcy5wYy5nZXRSZW1vdGVTdHJlYW1zLmJpbmQodGhpcy5wYyk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRoaXMuZ2V0UmVtb3RlU3RyZWFtcyA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgcmV0dXJuIFtdO1xyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHR5cGVvZiB0aGlzLnBjLmdldFJlY2VpdmVycyA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHRoaXMuZ2V0UmVjZWl2ZXJzID0gdGhpcy5wYy5nZXRSZWNlaXZlcnMuYmluZCh0aGlzLnBjKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5nZXRSZWNlaXZlcnMgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBbXTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuYWRkU3RyZWFtID0gdGhpcy5wYy5hZGRTdHJlYW0uYmluZCh0aGlzLnBjKTtcclxuXHJcbiAgICB0aGlzLnJlbW92ZVN0cmVhbSA9IGZ1bmN0aW9uIChzdHJlYW0pIHtcclxuICAgICAgICBpZiAodHlwZW9mIHNlbGYucGMucmVtb3ZlU3RyZWFtID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgIHNlbGYucGMucmVtb3ZlU3RyZWFtLmFwcGx5KHNlbGYucGMsIGFyZ3VtZW50cyk7XHJcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygc2VsZi5wYy5yZW1vdmVUcmFjayA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICBzZWxmLnBjLmdldFNlbmRlcnMoKS5mb3JFYWNoKGZ1bmN0aW9uKHNlbmRlcikge1xyXG4gICAgICAgICAgICAgICAgaWYgKHNlbmRlci50cmFjayAmJiBzdHJlYW0uZ2V0VHJhY2tzKCkuaW5kZXhPZihzZW5kZXIudHJhY2spICE9PSAtMSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHNlbGYucGMucmVtb3ZlVHJhY2soc2VuZGVyKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICBpZiAodHlwZW9mIHRoaXMucGMucmVtb3ZlVHJhY2sgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICB0aGlzLnJlbW92ZVRyYWNrID0gdGhpcy5wYy5yZW1vdmVUcmFjay5iaW5kKHRoaXMucGMpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIHByb3h5IHNvbWUgZXZlbnRzIGRpcmVjdGx5XHJcbiAgICB0aGlzLnBjLm9ucmVtb3Zlc3RyZWFtID0gdGhpcy5lbWl0LmJpbmQodGhpcywgJ3JlbW92ZVN0cmVhbScpO1xyXG4gICAgdGhpcy5wYy5vbnJlbW92ZXRyYWNrID0gdGhpcy5lbWl0LmJpbmQodGhpcywgJ3JlbW92ZVRyYWNrJyk7XHJcbiAgICB0aGlzLnBjLm9uYWRkc3RyZWFtID0gdGhpcy5lbWl0LmJpbmQodGhpcywgJ2FkZFN0cmVhbScpO1xyXG4gICAgdGhpcy5wYy5vbm5lZ290aWF0aW9ubmVlZGVkID0gdGhpcy5lbWl0LmJpbmQodGhpcywgJ25lZ290aWF0aW9uTmVlZGVkJyk7XHJcbiAgICB0aGlzLnBjLm9uaWNlY29ubmVjdGlvbnN0YXRlY2hhbmdlID0gdGhpcy5lbWl0LmJpbmQodGhpcywgJ2ljZUNvbm5lY3Rpb25TdGF0ZUNoYW5nZScpO1xyXG4gICAgdGhpcy5wYy5vbnNpZ25hbGluZ3N0YXRlY2hhbmdlID0gdGhpcy5lbWl0LmJpbmQodGhpcywgJ3NpZ25hbGluZ1N0YXRlQ2hhbmdlJyk7XHJcblxyXG4gICAgLy8gaGFuZGxlIGljZSBjYW5kaWRhdGUgYW5kIGRhdGEgY2hhbm5lbCBldmVudHNcclxuICAgIHRoaXMucGMub25pY2VjYW5kaWRhdGUgPSB0aGlzLl9vbkljZS5iaW5kKHRoaXMpO1xyXG4gICAgdGhpcy5wYy5vbmRhdGFjaGFubmVsID0gdGhpcy5fb25EYXRhQ2hhbm5lbC5iaW5kKHRoaXMpO1xyXG5cclxuICAgIHRoaXMuY29uZmlnID0ge1xyXG4gICAgICAgIGRlYnVnOiBmYWxzZSxcclxuICAgICAgICBzZHBTZXNzaW9uSUQ6IERhdGUubm93KCksXHJcbiAgICAgICAgbG9nZ2VyOiBjb25zb2xlXHJcbiAgICB9O1xyXG5cclxuICAgIC8vIGFwcGx5IG91ciBjb25maWdcclxuICAgIGZvciAoaXRlbSBpbiBjb25maWcpIHtcclxuICAgICAgICB0aGlzLmNvbmZpZ1tpdGVtXSA9IGNvbmZpZ1tpdGVtXTtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLmxvZ2dlciA9IHRoaXMuY29uZmlnLmxvZ2dlciB8fCBjb25zb2xlO1xyXG5cclxuICAgIGlmICh0aGlzLmNvbmZpZy5kZWJ1Zykge1xyXG4gICAgICAgIHRoaXMub24oJyonLCBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIHNlbGYubG9nZ2VyLmxvZygnUGVlckNvbm5lY3Rpb24gZXZlbnQ6JywgYXJndW1lbnRzKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLmhhZExvY2FsU3R1bkNhbmRpZGF0ZSA9IGZhbHNlO1xyXG4gICAgdGhpcy5oYWRSZW1vdGVTdHVuQ2FuZGlkYXRlID0gZmFsc2U7XHJcbiAgICB0aGlzLmhhZExvY2FsUmVsYXlDYW5kaWRhdGUgPSBmYWxzZTtcclxuICAgIHRoaXMuaGFkUmVtb3RlUmVsYXlDYW5kaWRhdGUgPSBmYWxzZTtcclxuICAgIHRoaXMuaGFkTG9jYWxJUHY2Q2FuZGlkYXRlID0gZmFsc2U7XHJcbiAgICB0aGlzLmhhZFJlbW90ZUlQdjZDYW5kaWRhdGUgPSBmYWxzZTtcclxuXHJcbiAgICAvL0luaXRpYWxpemUgVW5pZmlkUGxhbiA8LS0+IFBsYW5CIEludGVyb3BcclxuICAgIC8vdGhpcy5pbnRlcm9wID0gbmV3IEludGVyb3AuSW50ZXJvcCgpO1xyXG5cclxuICAgIC8vIGtlZXBpbmcgcmVmZXJlbmNlcyBmb3IgYWxsIG91ciBkYXRhIGNoYW5uZWxzXHJcbiAgICAvLyBzbyB0aGV5IGRvbnQgZ2V0IGdhcmJhZ2UgY29sbGVjdGVkXHJcbiAgICAvLyBjYW4gYmUgcmVtb3ZlZCBvbmNlIHRoZSBmb2xsb3dpbmcgYnVncyBoYXZlIGJlZW4gZml4ZWRcclxuICAgIC8vIGh0dHBzOi8vY3JidWcuY29tLzQwNTU0NVxyXG4gICAgLy8gaHR0cHM6Ly9idWd6aWxsYS5tb3ppbGxhLm9yZy9zaG93X2J1Zy5jZ2k/aWQ9OTY0MDkyXHJcbiAgICAvLyB0byBiZSBmaWxlZCBmb3Igb3BlcmFcclxuICAgIHRoaXMuX3JlbW90ZURhdGFDaGFubmVscyA9IFtdO1xyXG4gICAgdGhpcy5fbG9jYWxEYXRhQ2hhbm5lbHMgPSBbXTtcclxuXHJcbiAgICB0aGlzLl9jYW5kaWRhdGVCdWZmZXIgPSBbXTtcclxuICAgIHRoaXMuX2ljZUJ1ZmZlciA9IFtdO1xyXG59XHJcblxyXG5QZWVyQ29ubmVjdGlvbi5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKFdpbGRFbWl0dGVyLnByb3RvdHlwZSk7XHJcblxyXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoUGVlckNvbm5lY3Rpb24ucHJvdG90eXBlLCAnc2lnbmFsaW5nU3RhdGUnLCB7XHJcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5wYy5zaWduYWxpbmdTdGF0ZTtcclxuICAgIH1cclxufSk7XHJcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShQZWVyQ29ubmVjdGlvbi5wcm90b3R5cGUsICdpY2VDb25uZWN0aW9uU3RhdGUnLCB7XHJcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5wYy5pY2VDb25uZWN0aW9uU3RhdGU7XHJcbiAgICB9XHJcbn0pO1xyXG5cclxuUGVlckNvbm5lY3Rpb24ucHJvdG90eXBlLl9yb2xlID0gZnVuY3Rpb24gKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuaXNJbml0aWF0b3IgPyAnaW5pdGlhdG9yJyA6ICdyZXNwb25kZXInO1xyXG59O1xyXG5cclxuLy8gQWRkIGEgc3RyZWFtIHRvIHRoZSBwZWVyIGNvbm5lY3Rpb24gb2JqZWN0XHJcblBlZXJDb25uZWN0aW9uLnByb3RvdHlwZS5hZGRTdHJlYW0gPSBmdW5jdGlvbiAoc3RyZWFtKSB7XHJcbiAgICB0aGlzLmxvY2FsU3RyZWFtID0gc3RyZWFtO1xyXG4gICAgdGhpcy5wYy5hZGRTdHJlYW0oc3RyZWFtKTtcclxufTtcclxuXHJcbi8vIGhlbHBlciBmdW5jdGlvbiB0byBjaGVjayBpZiBhIHJlbW90ZSBjYW5kaWRhdGUgaXMgYSBzdHVuL3JlbGF5XHJcbi8vIGNhbmRpZGF0ZSBvciBhbiBpcHY2IGNhbmRpZGF0ZVxyXG5QZWVyQ29ubmVjdGlvbi5wcm90b3R5cGUuX2NoZWNrTG9jYWxDYW5kaWRhdGUgPSBmdW5jdGlvbiAoY2FuZGlkYXRlKSB7XHJcbiAgICB2YXIgY2FuZCA9IHBhcnNlci50b0NhbmRpZGF0ZUpTT04oY2FuZGlkYXRlKTtcclxuICAgIGlmIChjYW5kLnR5cGUgPT0gJ3NyZmx4Jykge1xyXG4gICAgICAgIHRoaXMuaGFkTG9jYWxTdHVuQ2FuZGlkYXRlID0gdHJ1ZTtcclxuICAgIH0gZWxzZSBpZiAoY2FuZC50eXBlID09ICdyZWxheScpIHtcclxuICAgICAgICB0aGlzLmhhZExvY2FsUmVsYXlDYW5kaWRhdGUgPSB0cnVlO1xyXG4gICAgfVxyXG4gICAgaWYgKGNhbmQuaXAuaW5kZXhPZignOicpICE9IC0xKSB7XHJcbiAgICAgICAgdGhpcy5oYWRMb2NhbElQdjZDYW5kaWRhdGUgPSB0cnVlO1xyXG4gICAgfVxyXG59O1xyXG5cclxuLy8gaGVscGVyIGZ1bmN0aW9uIHRvIGNoZWNrIGlmIGEgcmVtb3RlIGNhbmRpZGF0ZSBpcyBhIHN0dW4vcmVsYXlcclxuLy8gY2FuZGlkYXRlIG9yIGFuIGlwdjYgY2FuZGlkYXRlXHJcblBlZXJDb25uZWN0aW9uLnByb3RvdHlwZS5fY2hlY2tSZW1vdGVDYW5kaWRhdGUgPSBmdW5jdGlvbiAoY2FuZGlkYXRlKSB7XHJcbiAgICB2YXIgY2FuZCA9IHBhcnNlci50b0NhbmRpZGF0ZUpTT04oY2FuZGlkYXRlKTtcclxuICAgIGlmIChjYW5kLnR5cGUgPT0gJ3NyZmx4Jykge1xyXG4gICAgICAgIHRoaXMuaGFkUmVtb3RlU3R1bkNhbmRpZGF0ZSA9IHRydWU7XHJcbiAgICB9IGVsc2UgaWYgKGNhbmQudHlwZSA9PSAncmVsYXknKSB7XHJcbiAgICAgICAgdGhpcy5oYWRSZW1vdGVSZWxheUNhbmRpZGF0ZSA9IHRydWU7XHJcbiAgICB9XHJcbiAgICBpZiAoY2FuZC5pcC5pbmRleE9mKCc6JykgIT0gLTEpIHtcclxuICAgICAgICB0aGlzLmhhZFJlbW90ZUlQdjZDYW5kaWRhdGUgPSB0cnVlO1xyXG4gICAgfVxyXG59O1xyXG5cclxuXHJcbi8vIEluaXQgYW5kIGFkZCBpY2UgY2FuZGlkYXRlIG9iamVjdCB3aXRoIGNvcnJlY3QgY29uc3RydWN0b3JcclxuUGVlckNvbm5lY3Rpb24ucHJvdG90eXBlLnByb2Nlc3NJY2UgPSBmdW5jdGlvbiAobXNnLCBjYikge1xyXG4gICAgY2IgPSBjYiB8fCBmdW5jdGlvbiAoKSB7fTtcclxuICAgIHZhciBzZWxmID0gdGhpcztcclxuXHJcbiAgICAvLyBpZ25vcmUgYW55IGFkZGVkIGljZSBjYW5kaWRhdGVzIHRvIGF2b2lkIGVycm9ycy4gd2h5IGRvZXMgdGhlXHJcbiAgICAvLyBzcGVjIG5vdCBkbyB0aGlzP1xyXG4gICAgaWYgKHRoaXMucGMuc2lnbmFsaW5nU3RhdGUgPT09ICdjbG9zZWQnKSByZXR1cm4gY2IoKTtcclxuXHJcbiAgICAvLyB3b3JraW5nIGFyb3VuZCBodHRwczovL2NvZGUuZ29vZ2xlLmNvbS9wL3dlYnJ0Yy9pc3N1ZXMvZGV0YWlsP2lkPTM2NjlcclxuICAgIGlmIChtc2cuY2FuZGlkYXRlICYmIG1zZy5jYW5kaWRhdGUuY2FuZGlkYXRlLmluZGV4T2YoJ2E9JykgIT09IDApIHtcclxuICAgICAgICBtc2cuY2FuZGlkYXRlLmNhbmRpZGF0ZSA9ICdhPScgKyBtc2cuY2FuZGlkYXRlLmNhbmRpZGF0ZTtcclxuICAgIH1cclxuXHJcbiAgICBzZWxmLl9jaGVja1JlbW90ZUNhbmRpZGF0ZShtc2cuY2FuZGlkYXRlLmNhbmRpZGF0ZSk7XHJcblxyXG4gICAgaWYgKCFzZWxmLnBjLnJlbW90ZURlc2NyaXB0aW9uKSB7XHJcbiAgICAgICAgc2VsZi5faWNlQnVmZmVyLnB1c2gobXNnLmNhbmRpZGF0ZSk7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIHNlbGYucGMuYWRkSWNlQ2FuZGlkYXRlKG5ldyBSVENJY2VDYW5kaWRhdGUobXNnLmNhbmRpZGF0ZSkpXHJcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gY2IoKTtcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5jYXRjaChmdW5jdGlvbiAoZXJyKSB7XHJcbiAgICAgICAgICAgIHNlbGYuZW1pdCgnZXJyb3InLCBlcnIpO1xyXG4gICAgICAgICAgICAvL3NlbGYubG9nZ2VyLmVycm9yKGVycik7XHJcbiAgICAgICAgICAgIHJldHVybiBjYihlcnIpO1xyXG4gICAgfSk7XHJcbn07XHJcblxyXG4vLyBHZW5lcmF0ZSBhbmQgZW1pdCBhbiBvZmZlciB3aXRoIHRoZSBnaXZlbiBjb25zdHJhaW50c1xyXG5QZWVyQ29ubmVjdGlvbi5wcm90b3R5cGUuY3JlYXRlT2ZmZXIgPSBmdW5jdGlvbiAoY29uc3RyYWludHMsIGNiKSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICB2YXIgaGFzQ29uc3RyYWludHMgPSBhcmd1bWVudHMubGVuZ3RoID09PSAyO1xyXG4gICAgdmFyIG1lZGlhQ29uc3RyYWludHMgPSBoYXNDb25zdHJhaW50cyAmJiBjb25zdHJhaW50cyA/IGNvbnN0cmFpbnRzIDoge1xyXG4gICAgICAgICAgICBvZmZlclRvUmVjZWl2ZUF1ZGlvOiAxLFxyXG4gICAgICAgICAgICBvZmZlclRvUmVjZWl2ZVZpZGVvOiAxXHJcbiAgICAgICAgfTtcclxuICAgIGNiID0gaGFzQ29uc3RyYWludHMgPyBjYiA6IGNvbnN0cmFpbnRzO1xyXG4gICAgY2IgPSBjYiB8fCBmdW5jdGlvbiAoKSB7fTtcclxuXHJcbiAgICBpZiAodGhpcy5wYy5zaWduYWxpbmdTdGF0ZSA9PT0gJ2Nsb3NlZCcpIHJldHVybiBjYignUGVlciBhbHJlYWR5IGNsb3NlZCcpO1xyXG5cclxuICAgIC8vIEFjdHVhbGx5IGdlbmVyYXRlIHRoZSBvZmZlclxyXG4gICAgdGhpcy5wYy5jcmVhdGVPZmZlcihtZWRpYUNvbnN0cmFpbnRzKVxyXG4gICAgICAgIC50aGVuKGZ1bmN0aW9uIChvZmZlcikge1xyXG4gICAgICAgICAgICBzZWxmLl9jYW5kaWRhdGVCdWZmZXIgPSBbXTtcclxuXHJcbiAgICAgICAgICAgIC8vIHRoaXMgaGFjay4uLlxyXG4gICAgICAgICAgICB2YXIgZXhwYW5kZWRPZmZlciA9IHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdvZmZlcicsXHJcbiAgICAgICAgICAgICAgICBzZHA6IG9mZmVyLnNkcFxyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHNlbGYucGMuc2V0TG9jYWxEZXNjcmlwdGlvbihvZmZlcilcclxuICAgICAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgICAgICBleHBhbmRlZE9mZmVyLnNkcC5zcGxpdCgnXFxyXFxuJykuZm9yRWFjaChmdW5jdGlvbiAobGluZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobGluZS5pbmRleE9mKCdhPWNhbmRpZGF0ZTonKSA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc2VsZi5fY2hlY2tMb2NhbENhbmRpZGF0ZShsaW5lKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBzZWxmLmVtaXQoJ29mZmVyJywgZXhwYW5kZWRPZmZlcik7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNiKG51bGwsIGV4cGFuZGVkT2ZmZXIpO1xyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5jYXRjaChmdW5jdGlvbiAoZXJyKSB7XHJcbiAgICAgICAgICAgIHNlbGYuZW1pdCgnZXJyb3InLCBlcnIpO1xyXG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihlcnIpO1xyXG4gICAgICAgICAgICByZXR1cm4gY2IoZXJyKTtcclxuICAgICAgICB9KTtcclxufTtcclxuXHJcblxyXG4vLyBQcm9jZXNzIGFuIGluY29taW5nIG9mZmVyIHNvIHRoYXQgSUNFIG1heSBwcm9jZWVkIGJlZm9yZSBkZWNpZGluZ1xyXG4vLyB0byBhbnN3ZXIgdGhlIHJlcXVlc3QuXHJcblBlZXJDb25uZWN0aW9uLnByb3RvdHlwZS5oYW5kbGVPZmZlciA9IGZ1bmN0aW9uIChvZmZlciwgY2IpIHtcclxuICAgIGNiID0gY2IgfHwgZnVuY3Rpb24gKCkge307XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICBvZmZlci50eXBlID0gJ29mZmVyJztcclxuXHJcbiAgICBvZmZlci5zZHAuc3BsaXQoJ1xcclxcbicpLmZvckVhY2goZnVuY3Rpb24gKGxpbmUpIHtcclxuICAgICAgICBpZiAobGluZS5pbmRleE9mKCdhPWNhbmRpZGF0ZTonKSA9PT0gMCkge1xyXG4gICAgICAgICAgICBzZWxmLl9jaGVja1JlbW90ZUNhbmRpZGF0ZShsaW5lKTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuXHJcbiAgICB2YXIgZGVzY3JpcHRpb24gPSBuZXcgUlRDU2Vzc2lvbkRlc2NyaXB0aW9uKG9mZmVyKTtcclxuXHJcbiAgICAvKnRyeSB7XHJcbiAgICBpZiAobmF2aWdhdG9yLm1vekdldFVzZXJNZWRpYSlcclxuICAgICAgICBkZXNjcmlwdGlvbiA9IHRoaXMuaW50ZXJvcC50b1VuaWZpZWRQbGFuKGRlc2NyaXB0aW9uKTtcclxuXHJcbiAgICBpZiAobmF2aWdhdG9yLndlYmtpdEdldFVzZXJNZWRpYSlcclxuICAgICAgICBkZXNjcmlwdGlvbiA9IHRoaXMuaW50ZXJvcC50b1BsYW5CKGRlc2NyaXB0aW9uKTtcclxuICAgIH0gY2F0Y2goZXJyKSB7fTsqL1xyXG5cclxuICAgIHNlbGYucGMuc2V0UmVtb3RlRGVzY3JpcHRpb24oZGVzY3JpcHRpb24pXHJcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24gKCl7XHJcbiAgICAgICAgICAgIHZhciBwcm9taXNlcyA9IFtdO1xyXG4gICAgICAgICAgICBzZWxmLl9pY2VCdWZmZXIuZm9yRWFjaChmdW5jdGlvbihjYW5kaWRhdGUpe1xyXG4gICAgICAgICAgICAgICAgcHJvbWlzZXMucHVzaChzZWxmLnBjLmFkZEljZUNhbmRpZGF0ZShjYW5kaWRhdGUpKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHNlbGYuX2ljZUJ1ZmZlciA9IFtdO1xyXG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xyXG4gICAgICAgIH0pXHJcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gY2IoKTtcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5jYXRjaChmdW5jdGlvbiAoZXJyKSB7XHJcbiAgICAgICAgICAgIHNlbGYuZW1pdCgnZXJyb3InLCBlcnIpO1xyXG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihlcnIpO1xyXG4gICAgICAgICAgICByZXR1cm4gY2IoZXJyKTtcclxuICAgICAgICB9KTtcclxufTtcclxuXHJcbi8vIEFuc3dlciBhbiBvZmZlciB3aXRoIGF1ZGlvIG9ubHlcclxuUGVlckNvbm5lY3Rpb24ucHJvdG90eXBlLmFuc3dlckF1ZGlvT25seSA9IGZ1bmN0aW9uIChjYikge1xyXG4gICAgdmFyIG1lZGlhQ29uc3RyYWludHMgPSB7XHJcbiAgICAgICAgICAgIG1hbmRhdG9yeToge1xyXG4gICAgICAgICAgICAgICAgT2ZmZXJUb1JlY2VpdmVBdWRpbzogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIE9mZmVyVG9SZWNlaXZlVmlkZW86IGZhbHNlXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG4gICAgdGhpcy5fYW5zd2VyKG1lZGlhQ29uc3RyYWludHMsIGNiKTtcclxufTtcclxuXHJcbi8vIEFuc3dlciBhbiBvZmZlciB3aXRob3V0IG9mZmVyaW5nIHRvIHJlY2lldmVcclxuUGVlckNvbm5lY3Rpb24ucHJvdG90eXBlLmFuc3dlckJyb2FkY2FzdE9ubHkgPSBmdW5jdGlvbiAoY2IpIHtcclxuICAgIHZhciBtZWRpYUNvbnN0cmFpbnRzID0ge1xyXG4gICAgICAgICAgICBtYW5kYXRvcnk6IHtcclxuICAgICAgICAgICAgICAgIE9mZmVyVG9SZWNlaXZlQXVkaW86IGZhbHNlLFxyXG4gICAgICAgICAgICAgICAgT2ZmZXJUb1JlY2VpdmVWaWRlbzogZmFsc2VcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcbiAgICB0aGlzLl9hbnN3ZXIobWVkaWFDb25zdHJhaW50cywgY2IpO1xyXG59O1xyXG5cclxuLy8gQW5zd2VyIGFuIG9mZmVyIHdpdGggZ2l2ZW4gY29uc3RyYWludHMgZGVmYXVsdCBpcyBhdWRpby92aWRlb1xyXG5QZWVyQ29ubmVjdGlvbi5wcm90b3R5cGUuY3JlYXRlQW5zd2VyID0gZnVuY3Rpb24gKGNvbnN0cmFpbnRzLCBjYikge1xyXG4gICAgdmFyIGhhc0NvbnN0cmFpbnRzID0gYXJndW1lbnRzLmxlbmd0aCA9PT0gMjtcclxuICAgIHZhciBjYWxsYmFjayA9IGhhc0NvbnN0cmFpbnRzID8gY2IgOiBjb25zdHJhaW50cztcclxuICAgIHZhciBtZWRpYUNvbnN0cmFpbnRzID0gaGFzQ29uc3RyYWludHMgJiYgY29uc3RyYWludHMgPyBjb25zdHJhaW50cyA6IHtcclxuICAgICAgICAgICAgbWFuZGF0b3J5OiB7XHJcbiAgICAgICAgICAgICAgICBPZmZlclRvUmVjZWl2ZUF1ZGlvOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgT2ZmZXJUb1JlY2VpdmVWaWRlbzogdHJ1ZVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICB0aGlzLl9hbnN3ZXIobWVkaWFDb25zdHJhaW50cywgY2FsbGJhY2spO1xyXG59O1xyXG5cclxuLy8gUHJvY2VzcyBhbiBhbnN3ZXJcclxuUGVlckNvbm5lY3Rpb24ucHJvdG90eXBlLmhhbmRsZUFuc3dlciA9IGZ1bmN0aW9uIChhbnN3ZXIsIGNiKSB7XHJcbiAgICBjYiA9IGNiIHx8IGZ1bmN0aW9uICgpIHt9O1xyXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xyXG4gICAgXHJcbiAgICBhbnN3ZXIuc2RwLnNwbGl0KCdcXHJcXG4nKS5mb3JFYWNoKGZ1bmN0aW9uIChsaW5lKSB7XHJcbiAgICAgICAgaWYgKGxpbmUuaW5kZXhPZignYT1jYW5kaWRhdGU6JykgPT09IDApIHtcclxuICAgICAgICAgICAgc2VsZi5fY2hlY2tSZW1vdGVDYW5kaWRhdGUobGluZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgdmFyIGRlc2NyaXB0aW9uID0gbmV3IFJUQ1Nlc3Npb25EZXNjcmlwdGlvbihhbnN3ZXIpO1xyXG5cclxuICAgIC8qdHJ5IHtcclxuICAgIGlmIChuYXZpZ2F0b3IubW96R2V0VXNlck1lZGlhKVxyXG4gICAgICAgIGRlc2NyaXB0aW9uID0gdGhpcy5pbnRlcm9wLnRvVW5pZmllZFBsYW4oZGVzY3JpcHRpb24pO1xyXG4gICAgXHJcbiAgICBpZiAobmF2aWdhdG9yLndlYmtpdEdldFVzZXJNZWRpYSlcclxuICAgICAgICBkZXNjcmlwdGlvbiA9IHRoaXMuaW50ZXJvcC50b1BsYW5CKGRlc2NyaXB0aW9uKTtcclxuICAgIH0gY2F0Y2goZXJyKSB7fTsqL1xyXG5cclxuICAgIHNlbGYucGMuc2V0UmVtb3RlRGVzY3JpcHRpb24oZGVzY3JpcHRpb24pXHJcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gY2IoKTtcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5jYXRjaChmdW5jdGlvbiAoZXJyKSB7XHJcbiAgICAgICAgICAgIHNlbGYuZW1pdCgnZXJyb3InLCBlcnIpO1xyXG4gICAgICAgICAgICBzZWxmLmxvZ2dlci5lcnJvcihlcnIpO1xyXG4gICAgICAgICAgICByZXR1cm4gY2IoZXJyKTtcclxuICAgICAgICB9KTtcclxufTtcclxuXHJcbi8vIENsb3NlIHRoZSBwZWVyIGNvbm5lY3Rpb25cclxuUGVlckNvbm5lY3Rpb24ucHJvdG90eXBlLmNsb3NlID0gZnVuY3Rpb24gKCkge1xyXG4gICAgdGhpcy5fbG9jYWxEYXRhQ2hhbm5lbHMgPSBbXTtcclxuICAgIHRoaXMuX3JlbW90ZURhdGFDaGFubmVscyA9IFtdO1xyXG5cclxuICAgIHRoaXMub2ZmKCdyZW1vdmVUcmFjaycpO1xyXG4gICAgdGhpcy5vZmYoJ2FkZFN0cmVhbScpO1xyXG4gICAgdGhpcy5vZmYoJ25lZ290aWF0aW9uTmVlZGVkJyk7XHJcbiAgICB0aGlzLm9mZignaWNlQ29ubmVjdGlvblN0YXRlQ2hhbmdlJyk7XHJcbiAgICB0aGlzLm9mZignc2lnbmFsaW5nU3RhdGVDaGFuZ2UnKTtcclxuICAgIHRoaXMub2ZmKCdlcnJvcicpO1xyXG4gICAgdGhpcy5vZmYoJ29mZmVyJyk7XHJcbiAgICB0aGlzLm9mZignYW5zd2VyJyk7XHJcbiAgICB0aGlzLm9mZignaWNlJyk7XHJcbiAgICB0aGlzLm9mZignZW5kT2ZDYW5kaWRhdGVzJyk7XHJcbiAgICB0aGlzLm9mZignYWRkQ2hhbm5lbCcpO1xyXG5cclxuICAgIHRoaXMucGMuY2xvc2UoKTtcclxuICAgIHRoaXMuZW1pdCgnY2xvc2UnKTtcclxufTtcclxuXHJcbi8vIEludGVybmFsIGNvZGUgc2hhcmluZyBmb3IgdmFyaW91cyB0eXBlcyBvZiBhbnN3ZXIgbWV0aG9kc1xyXG5QZWVyQ29ubmVjdGlvbi5wcm90b3R5cGUuX2Fuc3dlciA9IGZ1bmN0aW9uIChjb25zdHJhaW50cywgY2IpIHtcclxuICAgIGNiID0gY2IgfHwgZnVuY3Rpb24gKCkge307XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICBpZiAoIXRoaXMucGMucmVtb3RlRGVzY3JpcHRpb24pIHtcclxuICAgICAgICAvLyB0aGUgb2xkIEFQSSBpcyB1c2VkLCBjYWxsIGhhbmRsZU9mZmVyXHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdyZW1vdGVEZXNjcmlwdGlvbiBub3Qgc2V0Jyk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMucGMuc2lnbmFsaW5nU3RhdGUgPT09ICdjbG9zZWQnKSByZXR1cm4gY2IoJ0FscmVhZHkgY2xvc2VkJyk7XHJcblxyXG4gICAgc2VsZi5wYy5jcmVhdGVBbnN3ZXIoY29uc3RyYWludHMpXHJcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24gKGFuc3dlcikge1xyXG4gICAgICAgICAgICBzZWxmLl9jYW5kaWRhdGVCdWZmZXIgPSBbXTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciBleHBhbmRlZEFuc3dlciA9IHtcclxuICAgICAgICAgICAgICAgIHR5cGU6ICdhbnN3ZXInLFxyXG4gICAgICAgICAgICAgICAgc2RwOiBhbnN3ZXIuc2RwXHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICByZXR1cm4gc2VsZi5wYy5zZXRMb2NhbERlc2NyaXB0aW9uKGFuc3dlcilcclxuICAgICAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgICAgICBleHBhbmRlZEFuc3dlci5zZHAuc3BsaXQoJ1xcclxcbicpLmZvckVhY2goZnVuY3Rpb24gKGxpbmUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxpbmUuaW5kZXhPZignYT1jYW5kaWRhdGU6JykgPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuX2NoZWNrTG9jYWxDYW5kaWRhdGUobGluZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBzZWxmLmVtaXQoJ2Fuc3dlcicsIGV4cGFuZGVkQW5zd2VyKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2IobnVsbCwgZXhwYW5kZWRBbnN3ZXIpO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSlcclxuICAgICAgICAuY2F0Y2goZnVuY3Rpb24gKGVycikge1xyXG4gICAgICAgICAgICBzZWxmLmVtaXQoJ2Vycm9yJywgZXJyKTtcclxuICAgICAgICAgICAgc2VsZi5sb2dnZXIuZXJyb3IoZXJyKTtcclxuICAgICAgICAgICAgcmV0dXJuIGNiKGVycik7XHJcbiAgICAgICAgfSk7XHJcbn07XHJcblxyXG4vLyBJbnRlcm5hbCBtZXRob2QgZm9yIGVtaXR0aW5nIGljZSBjYW5kaWRhdGVzIG9uIG91ciBwZWVyIG9iamVjdFxyXG5QZWVyQ29ubmVjdGlvbi5wcm90b3R5cGUuX29uSWNlID0gZnVuY3Rpb24gKGV2ZW50KSB7XHJcbiAgICB2YXIgc2VsZiA9IHRoaXM7XHJcbiAgICBpZiAoZXZlbnQuY2FuZGlkYXRlKSB7XHJcbiAgICAgICAgdmFyIGljZSA9IGV2ZW50LmNhbmRpZGF0ZTtcclxuXHJcbiAgICAgICAgdmFyIGV4cGFuZGVkQ2FuZGlkYXRlID0ge1xyXG4gICAgICAgICAgICBjYW5kaWRhdGU6IHtcclxuICAgICAgICAgICAgICAgIGNhbmRpZGF0ZTogaWNlLmNhbmRpZGF0ZSxcclxuICAgICAgICAgICAgICAgIHNkcE1pZDogaWNlLnNkcE1pZCxcclxuICAgICAgICAgICAgICAgIHNkcE1MaW5lSW5kZXg6IGljZS5zZHBNTGluZUluZGV4XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9O1xyXG4gICAgICAgIHRoaXMuX2NoZWNrTG9jYWxDYW5kaWRhdGUoaWNlLmNhbmRpZGF0ZSk7XHJcblxyXG4gICAgICAgIHZhciBjYW5kID0gcGFyc2VyLnRvQ2FuZGlkYXRlSlNPTihpY2UuY2FuZGlkYXRlKTtcclxuXHJcbiAgICAgICAgdmFyIGFscmVhZHk7XHJcbiAgICAgICAgdmFyIGlkeDtcclxuICAgICAgICBpZiAodGhpcy5lbGltaW5hdGVEdXBsaWNhdGVDYW5kaWRhdGVzICYmIGNhbmQudHlwZSA9PT0gJ3JlbGF5Jykge1xyXG4gICAgICAgICAgICAvLyBkcm9wIGNhbmRpZGF0ZXMgd2l0aCBzYW1lIGZvdW5kYXRpb24sIGNvbXBvbmVudFxyXG4gICAgICAgICAgICAvLyB0YWtlIGxvY2FsIHR5cGUgcHJlZiBpbnRvIGFjY291bnQgc28gd2UgZG9uJ3QgaWdub3JlIHVkcFxyXG4gICAgICAgICAgICAvLyBvbmVzIHdoZW4gd2Uga25vdyBhYm91dCBhIFRDUCBvbmUuIHVubGlrZWx5IGJ1dC4uLlxyXG4gICAgICAgICAgICBhbHJlYWR5ID0gdGhpcy5fY2FuZGlkYXRlQnVmZmVyLmZpbHRlcihcclxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIChjKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGMudHlwZSA9PT0gJ3JlbGF5JztcclxuICAgICAgICAgICAgICAgIH0pLm1hcChmdW5jdGlvbiAoYykge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjLmZvdW5kYXRpb24gKyAnOicgKyBjLmNvbXBvbmVudDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgaWR4ID0gYWxyZWFkeS5pbmRleE9mKGNhbmQuZm91bmRhdGlvbiArICc6JyArIGNhbmQuY29tcG9uZW50KTtcclxuICAgICAgICAgICAgLy8gcmVtZW1iZXI6IGxvY2FsIHR5cGUgcHJlZiBvZiB1ZHAgaXMgMCwgdGNwIDEsIHRscyAyXHJcbiAgICAgICAgICAgIGlmIChpZHggPiAtMSAmJiAoKGNhbmQucHJpb3JpdHkgPj4gMjQpID49IChhbHJlYWR5W2lkeF0ucHJpb3JpdHkgPj4gMjQpKSkge1xyXG4gICAgICAgICAgICAgICAgLy8gZHJvcCBpdCwgc2FtZSBmb3VuZGF0aW9uIHdpdGggaGlnaGVyICh3b3JzZSkgdHlwZSBwcmVmXHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHRoaXMuY29uZmlnLmJ1bmRsZVBvbGljeSA9PT0gJ21heC1idW5kbGUnKSB7XHJcbiAgICAgICAgICAgIC8vIGRyb3AgY2FuZGlkYXRlcyB3aGljaCBhcmUgZHVwbGljYXRlIGZvciBhdWRpby92aWRlby9kYXRhXHJcbiAgICAgICAgICAgIC8vIGR1cGxpY2F0ZSBtZWFucyBzYW1lIGhvc3QvcG9ydCBidXQgZGlmZmVyZW50IHNkcE1pZFxyXG4gICAgICAgICAgICBhbHJlYWR5ID0gdGhpcy5fY2FuZGlkYXRlQnVmZmVyLmZpbHRlcihcclxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uIChjKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNhbmQudHlwZSA9PT0gYy50eXBlO1xyXG4gICAgICAgICAgICAgICAgfSkubWFwKGZ1bmN0aW9uIChjYW5kKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNhbmQuYWRkcmVzcyArICc6JyArIGNhbmQucG9ydDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgaWR4ID0gYWxyZWFkeS5pbmRleE9mKGNhbmQuYWRkcmVzcyArICc6JyArIGNhbmQucG9ydCk7XHJcbiAgICAgICAgICAgIGlmIChpZHggPiAtMSkgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBhbHNvIGRyb3AgcnRjcCBjYW5kaWRhdGVzIHNpbmNlIHdlIGtub3cgdGhlIHBlZXIgc3VwcG9ydHMgUlRDUC1NVVhcclxuICAgICAgICAvLyB0aGlzIGlzIGEgd29ya2Fyb3VuZCB1bnRpbCBicm93c2VycyBpbXBsZW1lbnQgdGhpcyBuYXRpdmVseVxyXG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy5ydGNwTXV4UG9saWN5ID09PSAncmVxdWlyZScgJiYgY2FuZC5jb21wb25lbnQgPT09ICcyJykge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuX2NhbmRpZGF0ZUJ1ZmZlci5wdXNoKGNhbmQpO1xyXG5cclxuICAgICAgICB0aGlzLmVtaXQoJ2ljZScsIGV4cGFuZGVkQ2FuZGlkYXRlKTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhpcy5lbWl0KCdlbmRPZkNhbmRpZGF0ZXMnKTtcclxuICAgIH1cclxufTtcclxuXHJcbi8vIEludGVybmFsIG1ldGhvZCBmb3IgcHJvY2Vzc2luZyBhIG5ldyBkYXRhIGNoYW5uZWwgYmVpbmcgYWRkZWQgYnkgdGhlXHJcbi8vIG90aGVyIHBlZXIuXHJcblBlZXJDb25uZWN0aW9uLnByb3RvdHlwZS5fb25EYXRhQ2hhbm5lbCA9IGZ1bmN0aW9uIChldmVudCkge1xyXG4gICAgLy8gbWFrZSBzdXJlIHdlIGtlZXAgYSByZWZlcmVuY2Ugc28gdGhpcyBkb2Vzbid0IGdldCBnYXJiYWdlIGNvbGxlY3RlZFxyXG4gICAgdmFyIGNoYW5uZWwgPSBldmVudC5jaGFubmVsO1xyXG4gICAgdGhpcy5fcmVtb3RlRGF0YUNoYW5uZWxzLnB1c2goY2hhbm5lbCk7XHJcblxyXG4gICAgdGhpcy5lbWl0KCdhZGRDaGFubmVsJywgY2hhbm5lbCk7XHJcbn07XHJcblxyXG4vLyBDcmVhdGUgYSBkYXRhIGNoYW5uZWwgc3BlYyByZWZlcmVuY2U6XHJcbi8vIGh0dHA6Ly9kZXYudzMub3JnLzIwMTEvd2VicnRjL2VkaXRvci93ZWJydGMuaHRtbCNpZGwtZGVmLVJUQ0RhdGFDaGFubmVsSW5pdFxyXG5QZWVyQ29ubmVjdGlvbi5wcm90b3R5cGUuY3JlYXRlRGF0YUNoYW5uZWwgPSBmdW5jdGlvbiAobmFtZSwgb3B0cykge1xyXG4gICAgdmFyIGNoYW5uZWwgPSB0aGlzLnBjLmNyZWF0ZURhdGFDaGFubmVsKG5hbWUsIG9wdHMpO1xyXG5cclxuICAgIC8vIG1ha2Ugc3VyZSB3ZSBrZWVwIGEgcmVmZXJlbmNlIHNvIHRoaXMgZG9lc24ndCBnZXQgZ2FyYmFnZSBjb2xsZWN0ZWRcclxuICAgIHRoaXMuX2xvY2FsRGF0YUNoYW5uZWxzLnB1c2goY2hhbm5lbCk7XHJcblxyXG4gICAgcmV0dXJuIGNoYW5uZWw7XHJcbn07XHJcblxyXG5QZWVyQ29ubmVjdGlvbi5wcm90b3R5cGUuZ2V0U3RhdHMgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICBpZiAodHlwZW9mIGFyZ3VtZW50c1swXSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIHZhciBjYiA9IGFyZ3VtZW50c1swXTtcclxuICAgICAgICB0aGlzLnBjLmdldFN0YXRzKCkudGhlbihmdW5jdGlvbiAocmVzKSB7XHJcbiAgICAgICAgICAgIGNiKG51bGwsIHJlcyk7XHJcbiAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xyXG4gICAgICAgICAgICBjYihlcnIpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5wYy5nZXRTdGF0cy5hcHBseSh0aGlzLnBjLCBhcmd1bWVudHMpO1xyXG4gICAgfVxyXG59O1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBQZWVyQ29ubmVjdGlvbjtcclxuIl19
