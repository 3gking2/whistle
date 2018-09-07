require('./base-css.js');
require('../css/composer.css');
var React = require('react');
var ReactDOM = require('react-dom');
var dataCenter = require('./data-center');
var util = require('./util');
var events = require('./events');
var storage = require('./storage');
var Divider = require('./divider');
var ResDetail = require('./res-detail');

function removeDuplicateRules(rules) {
  rules = rules.join('\n').split(/\r\n|\r|\n/g);
  var map = {};
  rules = rules.filter(function(line) {
    line = line.replace(/#.*$/, '').trim();
    if (!line || map[line]) {
      return false;
    }
    map[line] = 1;
    return true;
  }).join('\n');
  return encodeURIComponent(rules);
}

var Composer = React.createClass({
  getInitialState: function() {
    var rules = storage.get('composerRules');
    var data = util.parseJSON(storage.get('composerData')) || {};
    return {
      url: data.url,
      method: data.method,
      headers: data.headers,
      body: data.body,
      tabName: 'Raw',
      rules: typeof rules === 'string' ? rules : ''
    };
  },
  componentDidMount: function() {
    var self = this;
    self.update(self.props.modal);
    events.on('setComposer', function() {
      var activeItem = self.props.modal;
      activeItem && self.setState({
        data: activeItem,
        result: activeItem
      }, function() {
        self.update(activeItem);
        self.onComposerChange();
      });
    });
  },
  update: function(item) {
    if (!item) {
      return;
    }
    var refs = this.refs;
    var req = item.req;
    ReactDOM.findDOMNode(refs.url).value = item.url;
    ReactDOM.findDOMNode(refs.method).value = req.method;
    ReactDOM.findDOMNode(refs.headers).value =   util.getOriginalReqHeaders(item);
    ReactDOM.findDOMNode(refs.body).value = util.getBody(req);
  },
  shouldComponentUpdate: function(nextProps) {
    var hide = util.getBoolean(this.props.hide);
    return hide != util.getBoolean(nextProps.hide) || !hide;
  },
  saveComposer: function() {
    var refs = this.refs;
    var params = {
      url: ReactDOM.findDOMNode(refs.url).value.trim(),
      headers: ReactDOM.findDOMNode(refs.headers).value,
      method: ReactDOM.findDOMNode(refs.method).value || 'GET',
      body: ReactDOM.findDOMNode(refs.body).value.replace(/\r\n|\r|\n/g, '\r\n')
    };
    storage.set('composerData', JSON.stringify(params));
    return params;
  },
  onComposerChange: function() {
    clearTimeout(this.composerTimer);
    this.composerTimer = setTimeout(this.saveComposer, 1000);
  },
  execute: function(e) {
    if (e.target.nodeName === 'INPUT' && e.keyCode !== 13) {
      return;
    }
    var refs = this.refs;
    var url = ReactDOM.findDOMNode(refs.url).value.trim();
    this.onComposerChange();
    if (!url) {
      return;
    }
    var rules = this.state.rules;
    var headers = ReactDOM.findDOMNode(refs.headers).value;
    if (typeof rules === 'string' && (rules = rules.trim())) {
      var obj = util.parseJSON(headers);
      var result = [];
      rules = [rules];
      if (obj) {
        Object.keys(obj).forEach(function(key) {
          if (key.toLowerCase() === 'x-whistle-rule-value') {
            var value = obj[key];
            try {
              value = typeof value === 'string' ? decodeURIComponent(value) : '';
            } catch(e) {}
            value && rules.push(value);
            delete obj[key];
          }
        });
        obj['x-whistle-rule-value'] = removeDuplicateRules(rules);
        headers = JSON.stringify(obj);
      } else {
        headers.split(/\r\n|\r|\n/).forEach(function(line) {
          var index = line.indexOf(': ');
          if (index === -1) {
            index = line.indexOf(':');
          }
          var key = index === -1 ? line : line.substring(0, index);
          key = key.toLowerCase();
          if (key === 'x-whistle-rule-value') {
            var value = line.substring(index + 1).trim();
            try {
              value = decodeURIComponent(value);
            } catch(e) {}
            rules.push(value);
          } else {
            result.push(line);
          }
        });
        result.push('x-whistle-rule-value: ' + removeDuplicateRules(rules));
        headers = result.join('\n');
      }
    }
    var self = this;
    dataCenter.composer({
      needResponse: true,
      url: url,
      headers: headers,
      method: ReactDOM.findDOMNode(refs.method).value || 'GET',
      body: ReactDOM.findDOMNode(refs.body).value.replace(/\r\n|\r|\n/g, '\r\n')
    }, function(data, xhr) {
      if (!data || data.ec !== 0) {
        return util.showSystemError(xhr);
      }
      data.res = data.res || {};
      data.url = url;
      data.req = '';
      self.setState({
        result: data,
        pending: false,
        tabName: 'Result',
        initedResult: true
      });
    });
    events.trigger('executeComposer');
    self.setState({ result: '', pending: true });
  },
  selectAll: function(e) {
    e.target.select();
  },
  saveRules: function() {
    var rules = ReactDOM.findDOMNode(this.refs.composerRules).value;
    this.state.rules = rules;
    storage.set('composerRules', rules);
  },
  onRulesChange: function() {
    clearTimeout(this.rulesTimer);
    this.rulesTimer = setTimeout(this.saveRules, 600);
  },
  onKeyDown: function(e) {
    if ((e.ctrlKey || e.metaKey)) {
      if (e.keyCode == 68) {
        e.target.value = '';
        e.preventDefault();
        e.stopPropagation();
      } else if (e.keyCode == 88) {
        e.stopPropagation();
      }
    }

  },
  onTabChange: function(e) {
    var tabName = e.target.name;
    if (tabName === 'Pretty') {
      this.state.initedPretty = true;
    } else if (tabName === 'Result') {
      this.state.initedResult = true;
    }
    this.setState({ tabName: tabName });
  },
  render: function() {
    var state = this.state;
    var rules = state.rules;
    var pending = state.pending;
    var tabName = state.tabName;
    var showRaw = tabName === 'Raw';
    var showPretty = tabName === 'Pretty';
    var showResult = tabName === 'Result';
    return (
      <div className={'fill orient-vertical-box w-detail-content w-detail-composer' + (util.getBoolean(this.props.hide) ? ' hide' : '')}>
        <div className="w-composer-url box">
          <select disabled={pending} defaultValue={state.method} onChange={this.onComposerChange} ref="method" className="form-control w-composer-method">
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="HEAD">HEAD</option>
                  <option value="TRACE">TRACE</option>
                  <option value="DELETE">DELETE</option>
                  <option value="SEARCH">SEARCH</option>
                  <option value="CONNECT">CONNECT</option>
                  <option value="PROPFIND">PROPFIND</option>
                  <option value="PROPPATCH">PROPPATCH</option>
                  <option value="MKCOL">MKCOL</option>
                  <option value="COPY">COPY</option>
                  <option value="MOVE">MOVE</option>
                  <option value="LOCK">LOCK</option>
                  <option value="UNLOCK">UNLOCK</option>
                  <option value="OPTIONS">OPTIONS</option>
                </select>
                <input disabled={pending} defaultValue={state.url} onKeyUp={this.execute} onChange={this.onComposerChange} onKeyDown={this.onKeyDown} onFocus={this.selectAll} ref="url" type="text" maxLength="8192" placeholder="url" className="fill w-composer-input" />
          <button disabled={pending} onClick={this.execute} className="btn btn-primary w-composer-execute">Go</button>
        </div>
        <div className="w-detail-inspectors-title w-composer-tabs">
          <button onClick={this.onTabChange} name="Raw" className={showRaw ? 'w-active' : undefined}>Raw</button>
          <button onClick={this.onTabChange} name="Pretty" className={showPretty ? 'w-active' : undefined}>Pretty</button>
          <button title={state.result && state.result.url}
            onClick={this.onTabChange} name="Result"  className={showResult ? 'w-active' : undefined}>Result</button>
        </div>
        <Divider vertical="true" rightWidth="140">
          <div className="orient-vertical-box fill">
            <Divider hide={!showRaw} vertical="true">
              <textarea disabled={pending} defaultValue={state.headers} onChange={this.onComposerChange} onKeyDown={this.onKeyDown} ref="headers" className="fill orient-vertical-box w-composer-headers" placeholder="Input the headers"></textarea>
              <textarea disabled={pending} defaultValue={state.body} onChange={this.onComposerChange} onKeyDown={this.onKeyDown} ref="body" className="fill orient-vertical-box w-composer-body" placeholder="Input the body"></textarea>
            </Divider>
            {
              state.initedPretty ? (
                <Divider hide={!showPretty} vertical="true">
                  <div>1</div>
                  <div>2</div>
                </Divider>
              ) : undefined
            }
            {state.initedResult ? <ResDetail modal={state.result} hide={!showResult} /> : undefined}
          </div>
          <div ref="rulesCon" className="orient-vertical-box fill">
            <div className="w-detail-inspectors-title">Rules</div>
            <textarea
              disabled={pending}
              defaultValue={rules}
              ref='composerRules'
              onChange={this.onRulesChange}
              style={{background: rules ? 'lightyellow' : undefined }}
              maxLength="8192"
              className="fill orient-vertical-box w-composer-rules"
              placeholder="Input the rules" />
          </div>
        </Divider>
      </div>
    );
  }
});

module.exports = Composer;
