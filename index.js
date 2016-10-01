'use strict';

let http = require('http');

class MegaD {
  constructor({host = '192.168.0.14', port = 80, password = 'sec'} = {}) {
    this.host = host;
    this.port = port;
    this.password = password;

    this.deviceConfig = {};
    this.portsConfig = [];
  }

  static discover() {
    let interfaces = require('os').networkInterfaces();
    let promise = Promise.resolve();
    let result = [];

    Object.keys(interfaces).map(iface =>
      interfaces[iface].map(address => {
        if (address.family == 'IPv4' && !address.internal && address.address) {
          promise = promise.then(r => (result = result.concat(r || []), this.discoverOnAddress(address.address)));
        }
      })
    );

    return promise.then(() => result);
  }

  static discoverOnAddress(ip) {
    ip = ip.replace(/\.\d+$/, '.255');

    let result = [];
    let message = new Buffer([0xAA, 0x00, 0x0C]);

    let dgram = require('dgram');
    let client = dgram.createSocket('udp4');

    console.log(ip);
    client.bind(42000, () => client.setBroadcast(true));
    client.on('error', err => console.error(ip, err));
    client.on('message', (msg, rinfo) => (msg[0] == 0xAA && result.push(rinfo.address)));

    client.send(message, 0, message.length, 52000, ip);

    return new Promise(resolve => {
      setTimeout(() => (client.close(), resolve(result)), 2000);
    })
  }

  getInternalTemp() {
    return this._send({tget: 1});
  }

  getPortsState() {
    return this._send({cmd: 'all'});
  }

  getPortState(port) {
    return this._send({pt: port, cmd: 'get'});
  }

  getDeviceConfig() {
    return this._send({cf: 1})
      .then(data => this._parseForm(data))
      .then(data => {
        let {eip = (this.host, this.port).join(':'), pwd} = data;
        eip = eip.split(':');
        this.host = eip[0];
        this.port = parseInt(eip[1]) || 80;
        this.password = pwd;
        this.deviceConfig = data;
        return data;
      });
  }

  setDeviceConfig(config) {
    return this._send(Object.assign({cf: 1}, this.deviceConfig, config))
      .then(() => this.getDeviceConfig());
  }

  getPortsConfig() {
    console.log('123');
    return new Promise(resolve => {
        console.log('234');
      let port = 0;
      let getPortConfig = () => {
        console.log('345', port);
        this.getPortConfig(port++)
          .then(() => getPortConfig())
          .catch(() => resolve(this.portsConfig));
      }
      getPortConfig();
    });
  }

  getPortConfig(port) {
    return this._send({pt: port})
      .then(data => this._parseForm(data))
      .then(data => (console.log('data', data), data))
      .then(data => (this.portsConfig[port] = data, data));
  }

  setPortConfig(port, config) {
    return this._send(Object.assign({pn: port}, this.portsConfig[port], config))
      .then(() => this.getPortConfig(port));
  }

  sendCommand(port, value) {
    return this._send({cmd: [port, value].join(':')});
  }

  sendCounter(port, value = 0) {
    return this._send({pt: port, value});
  }

  _parseForm(html) {
    let data = {};

    let inputs = html.match(/<input[^>]+name="?[\w]+"?[^>]*>/g) || [];
    inputs.map(input => {
      let args = {};
      (input.match(/(\w+)=([^<>\s]+)/g) || [])
        .map(arg => arg.split('='))
        .map(arg => (console.log(arg), arg))
        .map(arg => args[arg[0]] = arg.slice(1).join('=').replace(/^"(.*)"$/, '$1'));

      data[args.name] = args.value || '';
      if (args.type == 'checkbox' && input.indexOf('checked') == -1) {
        data[args.name] = 0;
      }
      if (args.type == 'hidden') {
        delete data[args.name];
      }
    });

    let selects = html.match(/<select[^>]+name="?[\w]+"?[^>]*>.+?<\/select>/g) || [];
    selects.map(select => {
      let args = {};
      (select.match(/(\w+)=([^<>\s]+)/g) || [])
        .map(arg => arg = arg.split('='))
        .map(arg => args[arg[0]] = arg[1].replace(/^"(.*)"$/, '$1'));

      let option = select.match(/<option value="?(\d+)"? selected>/) || [];
      data[args.name] = parseInt(option[1], 10) || 0;
    });

    if (data.pty === undefined) {
      if (html.indexOf('>Type In<') != -1) {
        data.pty = 0;
      } else if (html.indexOf('>Type Out<') != -1) {
        data.pty = 1;
      } else if (html.match(/<br>A\d+\//)) {
        data.pty = 2;
      }
    } else {
      data.pty = parseInt(data.pty, 10);
    }

    if (data.pty == 1) {
      data.m   = data.m   || 0;
      data.pwm = data.pwm || 0;
    }

    if (data.ecmd === 'ð=') {
      data.ecmd = '';
    }

    ['m', 'd', 'misc', 'pwm', 'pn', 'naf']
      .map(i => data[i] !== undefined ? data[i] = (parseInt(data[i], 10) || 0) : undefined);

    return data;
  }

  _send(params) {
    let data = Object.keys(params).map(k => [k, params[k]].join('=')).join('&');
    let options = {
      host: this.host,
      port: this.port,
      path: '/' + this.password + '/?' + data
    };
        console.log('***', options, params);

    return new Promise((resolve, reject) =>
      http.get(options, (res) => {
        let data = '';
        console.log('---', data);
        res.setEncoding('utf8');

        res.on('error', e => (console.error(e), reject(e)));
        res.on('data', chunk => (data += chunk, console.log('+++', data)));
        res.on('end', () => (console.log('!!!', res.statusCode), res.statusCode == 200 ? (console.log('resolve'), resolve(data)) : reject(data)));
      }).on('error', e => (console.error('Got error by post request', e), reject(e)))
    );
  }
}

module.exports = MegaD;
