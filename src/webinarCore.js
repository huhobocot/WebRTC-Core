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