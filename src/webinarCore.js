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