var http = require('http');
var util = require('../lib/util');

var LOCALHOST = '127.0.0.1';

module.exports = function init(proxy, callback) {
  var config = proxy.config;
  var count = 2;
  var execCallback = function() {
    if (--count === 0) {
      callback();
    }
  };
  if (config.customUIPort) {
    var server = http.createServer();
    require(config.uipath)(server, proxy);
    if (config.host === LOCALHOST) {
      server.listen(config.uiport, LOCALHOST, execCallback);
    } else {
      server.listen(config.uiport, execCallback);
    }
  } else {
    util.getServer(function(server, port) {
      config.uiport = port;
      require(config.uipath)(server, proxy);
      execCallback();
    }, config.uiport);
  }
  util.getServer(function(server, port) {
    config.weinreport = port;
    require('./weinre')(server);
    execCallback();
  }, config.weinreport);
};
