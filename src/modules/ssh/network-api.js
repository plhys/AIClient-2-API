/**
 * 网络状态API - 获取EasyTier虚拟网络信息
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { homedir } from 'os';
import logger from '../utils/logger.js';

// 配置文件路径
const CONFIG_DIR = path.join(homedir(), '.config', 'a-plan');
const CONFIG_FILE = path.join(CONFIG_DIR, 'et-config.json');

// 读取配置
function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    logger.error('[NetworkAPI] 读取配置失败:', e.message);
  }
  return getDefaultConfig();
}

// 保存配置
function saveConfig(config) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (e) {
    logger.error('[NetworkAPI] 保存配置失败:', e.message);
    return false;
  }
}

// 默认配置
function getDefaultConfig() {
  return {
    enabled: false,
    networkName: '',
    token: '',
    socks5Port: 7890,
    apiPort: 23333,
    hostname: '',
    extraArgs: ''
  };
}

// 从环境变量加载配置（优先级更高）
function loadConfigFromEnv() {
  const config = getDefaultConfig();
  if (process.env.ET_NETWORK) config.networkName = process.env.ET_NETWORK;
  if (process.env.ET_TOKEN) config.token = process.env.ET_TOKEN;
  if (process.env.ET_SOCKS5_PORT) config.socks5Port = parseInt(process.env.ET_SOCKS5_PORT);
  if (process.env.ET_API_PORT) config.apiPort = parseInt(process.env.ET_API_PORT);
  if (process.env.ET_HOSTNAME) config.hostname = process.env.ET_HOSTNAME;
  if (process.env.ET_ENABLED) config.enabled = process.env.ET_ENABLED === 'true';
  return config;
}

// 合并配置：文件 + 环境变量
function getMergedConfig() {
  const fileConfig = readConfig();
  const envConfig = loadConfigFromEnv();
  return { ...fileConfig, ...envConfig };
}

// 从ET API获取网络节点列表
async function getETPeers(etApiUrl = 'http://127.0.0.1:23333') {
  return new Promise((resolve) => {
    const req = http.get(`${etApiUrl}/api/peers`, {
      timeout: 3000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const peers = JSON.parse(data);
          resolve(peers.map(p => ({
            virtual_ip: p.virtual_ip,
            hostname: p.hostname || p.instance_id?.slice(0, 8),
            cone_status: p.cone_status,
            latency_ms: p.latency_ms
          })));
        } catch (e) {
          resolve([]);
        }
      });
    });

    req.on('error', () => resolve([]));
    req.on('timeout', () => {
      req.destroy();
      resolve([]);
    });
  });
}

// 注册网络API路由
export function registerNetworkAPI(router) {
  
  // 获取虚拟网络设备列表
  router.get('/api/network/peers', async (req, res) => {
    try {
      const peers = await getETPeers();
      res.json(peers);
    } catch (err) {
      logger.error('[NetworkAPI] 获取节点失败:', err.message);
      res.json([]);
    }
  });

  // 获取网络配置
  router.get('/api/network/config', (req, res) => {
    const config = getMergedConfig();
    res.json(config);
  });

  // 保存网络配置
  router.post('/api/network/config', (req, res) => {
    try {
      const newConfig = req.body;
      if (!newConfig || typeof newConfig !== 'object') {
        return res.status(400).json({ error: '无效的配置数据' });
      }
      
      // 验证必填字段
      if (newConfig.enabled && !newConfig.token) {
        return res.status(400).json({ error: '启用服务时需要提供 Token' });
      }

      // 读取现有配置并合并
      const currentConfig = readConfig();
      const mergedConfig = { ...currentConfig, ...newConfig };
      
      // 保存到文件
      if (saveConfig(mergedConfig)) {
        logger.info('[NetworkAPI] 配置已保存:', CONFIG_FILE);
        
        // 触发配置变更事件
        if (global.eventBus) {
          global.eventBus.emit('network:config', mergedConfig);
        }
        
        res.json({ success: true, config: mergedConfig });
        
        // 如果配置变了且启用了，可以考虑自动重启ET
        // 这里由守护进程(guardian)监听配置变化来处理
      } else {
        res.status(500).json({ error: '保存配置失败' });
      }
    } catch (err) {
      logger.error('[NetworkAPI] 保存配置失败:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // 重启EasyTier服务
  router.post('/api/network/restart', (req, res) => {
    logger.info('[NetworkAPI] 收到重启ET服务请求');
    
    // 发送重启信号给守护进程
    if (global.eventBus) {
      global.eventBus.emit('network:restart');
    }
    
    // 同时尝试通过进程信号通知
    if (global.etProcess) {
      try {
        global.etProcess.kill('SIGTERM');
      } catch (e) {
        // ignore
      }
    }
    
    res.json({ success: true, message: '重启请求已发送' });
  });

  // 获取WebSSH统计
  router.get('/api/ssh/stats', (req, res) => {
    res.json({
      active: global.activeSSHConnections || 0,
      max: 10,
      enabled: true
    });
  });

  // 获取配置文件路径（调试用）
  router.get('/api/network/debug', (req, res) => {
    res.json({
      configFile: CONFIG_FILE,
      exists: fs.existsSync(CONFIG_FILE),
      config: getMergedConfig()
    });
  });

  logger.info('[NetworkAPI] 网络API路由已注册');
}

export { getETPeers };
