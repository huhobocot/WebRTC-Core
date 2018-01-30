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
                { "urls": ["turn:webrtcweb.com:7788", "turn:webrtcweb.com:4455", "turn:webrtcweb.com:5544"], "username": "muazkh", "credential": "muazkh" },
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