const browserify = require('browserify');
const fs = require('fs');

var bundle = browserify({ standalone: 'PeerConnection' });
bundle.add('./src/peerconnection');
bundle.bundle(function (err, source) {
  if (err) {
    console.error(err);
  }
  fs.writeFileSync('out/peerConnection.bundle.js', source);
});

bundle = browserify({ standalone: 'getUserMedia' });
bundle.add('./src/getUserMedia');
bundle.bundle(function (err, source) {
  if (err) {
    console.error(err);
  }
  fs.writeFileSync('out/getUserMedia.js', source);
});