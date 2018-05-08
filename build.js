const browserify = require('browserify');
const fs = require('fs');

var bundle = browserify({ standalone: 'PeerConnection', debug: true });
bundle.add('./src/peerconnection');
bundle.bundle(function (err, source) {
  if (err) {
    console.error(err);
  }
  fs.writeFileSync('out/peerConnection.bundle.js', source);
});

bundle = browserify({ standalone: 'WebinarCore', debug: true });
bundle.add('./src/WebinarCore');
bundle.bundle(function (err, source) {
  if (err) {
    console.error(err);
  }
  fs.writeFileSync('out/webinarCore.bundle.js', source);
});