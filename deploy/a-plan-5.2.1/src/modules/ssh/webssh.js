/**
 * WebSSH模块 - A-Plan集成
 * 提供WebSocket到SSH的桥接服务
 */

import pkg from 'ssh2';
const { Client: SSHClient, utils } = pkg;
import { WebSocketServer } from 'ws';
import { promisify } from 'util';
import net from 'net';
import logger from '../../utils/logger.js';

// SSH连接会话管理
class WebSSHSession {
  constructor(ws) {
    this.ws = ws;
    this.sshClient = null;
    this.sshStream = null;
    this.isConnected = false;
    this.lastActivity = Date.now();
  }

  // 建立SSH连接
  async connect(config) {
    const { host, port = 22, username, password, sock } = config;

    return new Promise((resolve, reject) => {
      this.sshClient = new SSHClient();

      const connConfig = {
        host,
        port,
        username,
        readyTimeout: 20000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3
      };

      if (password) connConfig.password = password;
      if (sock) connConfig.sock = sock;

      this.sshClient.on('ready', () => {
        logger.info(`[WebSSH] SSH连接成功: ${host}:${port}`);
        
        this.sshClient.shell({
          term: 'xterm-256color',
          cols: 80,
          rows: 24
        }, (err, stream) => {
          if (err) {
            reject(new Error(`Shell失败: ${err.message}`));
            return;
          }

          this.sshStream = stream;
          this.isConnected = true;
          this.setupStreamHandlers();
          resolve();
        });
      });

      this.sshClient.on('error', (err) => {
        logger.error(`[WebSSH] SSH错误: ${err.message}`);
        reject(err);
      });

      this.sshClient.on('end', () => {
        this.close();
      });

      this.sshClient.connect(connConfig);
    });
  }

  // 设置SSH流处理器
  setupStreamHandlers() {
    // SSH -> WebSocket
    this.sshStream.on('data', (data) => {
      if (this.ws.readyState === 1) {
        this.ws.send(JSON.stringify({
          type: 'data',
          data: data.toString('utf-8')
        }));
      }
      this.lastActivity = Date.now();
    });

    // 流关闭
    this.sshStream.on('close', () => {
      this.sendDisconnect();
      this.close();
    });

    // 错误处理
    this.sshStream.stderr.on('data', (data) => {
      if (this.ws.readyState === 1) {
        this.ws.send(JSON.stringify({
          type: 'data',
          data: data.toString('utf-8')
        }));
      }
    });
  }

  // WebSocket -> SSH
  write(data) {
    if (this.sshStream && this.isConnected) {
      this.sshStream.write(data);
      this.lastActivity = Date.now();
    }
  }

  // 调整终端大小
  resize(cols, rows) {
    if (this.sshStream && this.isConnected) {
      this.sshStream.setWindow(rows, cols);
      logger.debug(`[WebSSH] 调整终端大小: ${cols}x${rows}`);
    }
  }

  // 发送断开消息
  sendDisconnect() {
    if (this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({ type: 'disconnect' }));
    }
  }

  // 关闭连接
  close() {
    this.isConnected = false;
    
    if (this.sshStream) {
      this.sshStream.close();
      this.sshStream = null;
    }
    
    if (this.sshClient) {
      this.sshClient.end();
      this.sshClient = null;
    }

    logger.info('[WebSSH] 会话已关闭');
  }
}

// WebSSH服务器
class WebSSHServer {
  constructor(httpServer, options = {}) {
    this.httpServer = httpServer;
    this.options = {
      path: '/wss/ssh',
      requireAuth: options.requireAuth !== false,
      etSocksPort: options.etSocksPort || 7890,
      maxConnections: options.maxConnections || 10
    };
    
    this.sessions = new Map();
    this.wss = null;
    this.heartbeatInterval = null;
  }

  // 启动WebSocket服务器
  start() {
    this.wss = new WebSocketServer({
      server: this.httpServer,
      path: this.options.path,
      // 允许任意来源（内网环境）
      verifyClient: (info) => {
        // 可以在这里添加认证检查
        return true;
      }
    });

    this.wss.on('connection', (ws, req) => {
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      logger.info(`[WebSSH] 新WebSocket连接: ${clientIp}`);

      // 连接数限制
      if (this.sessions.size >= this.options.maxConnections) {
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: '连接数已满，请稍后重试' 
        }));
        ws.close();
        return;
      }

      const session = new WebSSHSession(ws);
      this.sessions.set(ws, session);

      // 消息处理
      ws.on('message', async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          await this.handleMessage(ws, session, msg);
        } catch (err) {
          logger.error('[WebSSH] 消息处理错误:', err);
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: '消息格式错误' 
          }));
        }
      });

      ws.on('close', () => {
        logger.info('[WebSSH] WebSocket连接关闭');
        session.close();
        this.sessions.delete(ws);
      });

      ws.on('error', (err) => {
        logger.error('[WebSSH] WebSocket错误:', err);
        session.close();
        this.sessions.delete(ws);
      });

      // 连接超时检查（30秒内必须发connect）
      setTimeout(() => {
        if (!session.isConnected && ws.readyState === 1) {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: '连接超时，请重新连接' 
          }));
          ws.close();
        }
      }, 30000);
    });

    // 启动心跳检测
    this.startHeartbeat();

    logger.info(`[WebSSH] WebSocket服务器已启动: ${this.options.path}`);
    return this;
  }

  // 消息处理器
  async handleMessage(ws, session, msg) {
    switch (msg.type) {
      case 'connect':
        await this.handleConnect(ws, session, msg);
        break;

      case 'data':
        if (session.isConnected) {
          session.write(msg.data);
        }
        break;

      case 'resize':
        if (session.isConnected && msg.cols && msg.rows) {
          session.resize(msg.cols, msg.rows);
        }
        break;

      case 'disconnect':
        session.close();
        break;

      default:
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: '未知消息类型' 
        }));
    }
  }

  // 处理连接请求
  async handleConnect(ws, session, msg) {
    const { host, port = 22, username, password, authType } = msg;

    if (!host || !username) {
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: '缺少必要参数（host/username）' 
      }));
      return;
    }

    try {
      // 判断是否需要通过ET SOCKS5代理
      const sock = await this.getProxySocket(host, port);
      
      await session.connect({
        host,
        port,
        username,
        password: authType === 'password' ? password : undefined,
        sock
      });

      ws.send(JSON.stringify({ type: 'connected' }));
      logger.info(`[WebSSH] 会话建立成功: ${username}@${host}`);

    } catch (err) {
      logger.error(`[WebSSH] 连接失败: ${err.message}`);
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: `连接失败: ${err.message}` 
      }));
    }
  }

  // 获取代理Socket（对ET网络设备使用SOCKS5）
  async getProxySocket(host, port) {
    // 本地连接不走代理
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      logger.info(`[WebSSH] ${host} 是本地连接，直接访问`);
      return undefined;
    }
    
    // ET虚拟网段判断
    const isETNetwork = host.startsWith('10.144.') || 
                        host.startsWith('10.145.') ||
                        host.startsWith('192.168.');
    
    if (!isETNetwork) {
      return undefined; // 公网直接连接
    }

    logger.info(`[WebSSH] ${host} 属于ET网络，使用SOCKS5代理`);

    // 创建到本地SOCKS5代理的连接
    return new Promise((resolve, reject) => {
      const proxySocket = new net.Socket();
      const proxyPort = this.options.etSocksPort;
      
      proxySocket.connect(proxyPort, '127.0.0.1', () => {
        // SOCKS5握手
        // 发送握手请求（无认证）
        proxySocket.write(Buffer.from([0x05, 0x01, 0x00]));
        
        proxySocket.once('data', (data) => {
          if (data[0] !== 0x05 || data[1] !== 0x00) {
            proxySocket.destroy();
            reject(new Error('SOCKS5握手失败'));
            return;
          }

          // 发送CONNECT请求
          const req = Buffer.alloc(10);
          req[0] = 0x05; // VER
          req[1] = 0x01; // CMD=CONNECT
          req[2] = 0x00; // RSV
          req[3] = 0x01; // ATYP=IPv4
          
          // IP地址
          const ipParts = host.split('.');
          for (let i = 0; i < 4; i++) {
            req[4 + i] = parseInt(ipParts[i]);
          }
          
          // 端口
          req[8] = (port >> 8) & 0xff;
          req[9] = port & 0xff;

          proxySocket.write(req);

          proxySocket.once('data', (resp) => {
            if (resp[0] === 0x05 && resp[1] === 0x00) {
              logger.info(`[WebSSH] SOCKS5隧道建立: ${host}:${port}`);
              resolve(proxySocket);
            } else {
              proxySocket.destroy();
              reject(new Error(`SOCKS5连接失败: ${resp[1]}`));
            }
          });
        });
      });

      proxySocket.on('error', (err) => {
        reject(new Error(`SOCKS5代理错误: ${err.message}`));
      });

      proxySocket.on('timeout', () => {
        proxySocket.destroy();
        reject(new Error('SOCKS5连接超时'));
      });
    });
  }

  // 心跳检测（清理僵尸连接）
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const zombieTimeout = 5 * 60 * 1000; // 5分钟无活动视为僵尸

      this.sessions.forEach((session, ws) => {
        // 关闭僵尸连接
        if (now - session.lastActivity > zombieTimeout) {
          logger.warn('[WebSSH] 清理僵尸会话');
          session.close();
          if (ws.readyState <= 1) ws.close();
          this.sessions.delete(ws);
        }
        
        // 发送ping保持连接
        if (ws.readyState === 1 && !session.isConnected) {
          ws.ping();
        }
      });
    }, 60000); // 每分钟检查一次
  }

  // 获取统计信息
  getStats() {
    return {
      activeSessions: this.sessions.size,
      maxConnections: this.options.maxConnections,
      path: this.options.path
    };
  }

  // 停止服务器
  stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.sessions.forEach((session, ws) => {
      session.close();
      ws.close();
    });
    this.sessions.clear();

    if (this.wss) {
      this.wss.close();
    }

    logger.info('[WebSSH] 服务器已停止');
  }
}

export { WebSSHServer, WebSSHSession };
