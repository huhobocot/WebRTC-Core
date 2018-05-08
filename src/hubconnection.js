function HubConnection(config) {
    var self = this;
    config = config || {};
    var defaultConfig = {
        debug: false,
        logger: console,
        hubUrl: "/signalr/hubs",
        hubName: "chathub",
        eventId: "00000000-0000-0000-0000-000000000000"
    };

    this.config = defaultConfig;
    //apply config
    for (var item in config) {
        if (config.hasOwnProperty(item)) {
            this.config[item] = config[item];
        }
    }

    this.logger = this.config.logger;

    this.hubConnection = $.connection.hub;
    this.hub = this.hubConnection.proxies[this.config.hubName];

    this.hubConnection.logging = this.config.debug;
    this.hubConnection.url = this.config.hubUrl;
    this.hubConnection.qs = { "eventID": this.config.eventId };

    this.hubConnection.stateChanged(function (e) {
        self.isConnected = e.newState === 1;
    });

    this.hubConnection.disconnected(function () {
        if (self.hubConnection.lastError) {
            self.logger.warn("Disconnected. Reason: " + self.hubConnection.lastError.message);
        }

        if (self.disconnected)
            return;

        setTimeout(function () {
            self.hubConnection.start()
                .done(function () {
                    self.logger.warn("Reconnected");
                });
        }, 100); // Restart connection
    });
}

HubConnection.prototype.on = function (ev, fn) {
    this.hub.on(ev, fn);
};

HubConnection.prototype.send = function (data) {
    //protect interaction with disconnected connect
    if (!this.isConnected)
        return;

    this.hub.invoke("send", JSON.stringify(data));
};

HubConnection.prototype.getSessionid = function () {
    return this.config.eventId;
};

HubConnection.prototype.connect = function (options, cb) {
    var self = this;
    //return start promise
    this.hubConnection
        .start(options)
        .done(function () {
            if (cb) {
                cb();
            }
        })
        .fail(function (err) {
            self.logger.error(err);
        });
}

HubConnection.prototype.disconnect = function () {
    this.disconnected = true;
    this.hubConnection.stop();
};

Object.defineProperty(HubConnection.prototype, 'connected', {
    get: function () {
        return this.isConnected || false;
    }
});

module.exports = HubConnection;
