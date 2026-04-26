/**
 * EasyTier + TTYD 统一管理器
 * 
 * 设计理念：
 * - TTYD 作为 A-Plan 的基础组件，随主进程启动/停止
 * - EasyTier 作为可选的 VPN 扩展功能，按需启动
 * - 两者解耦，可以独立控制
 */

import { spawn, exec, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import logger from '../../utils/logger.js';

// A-Plan 项目根目录（TTYD 默认工作目录）
const APLAN_ROOT = '/data/workspace/a-plan';

// 自动检测 easytier-core 路径
function detectEasytierPath() {
    const possiblePaths = [
        process.env.EASYTIER_PATH,
        '/usr/local/bin/easytier-core',
        '/opt/easytier/easytier-core',
        '/usr/bin/easytier-core'
    ].filter(Boolean);
    
    for (const p of possiblePaths) {
        try {
            require('fs').accessSync(p, require('fs').constants.X_OK);
            return p;
        } catch (e) {
            // 继续尝试下一个路径
        }
    }
    return possiblePaths[0] || '/opt/easytier/easytier-core';
}

// 配置
const ET_CONFIG = {
  easytierPath: detectEasytierPath(),
  ttydPath: process.env.TTYD_PATH || '/usr/local/bin/ttyd',
  configFile: process.env.ET_CONFIG_FILE || path.join(APLAN_ROOT, 'configs/easytier.json'),
  rpcPort: 15888,
  defaultVip: '',  // 留空，不预设默认IP
  ttydPort: 822,
  ttydCwd: APLAN_ROOT  // TTYD 工作目录设为项目根目录
};

// 进程状态
let etProcess = null;
let ttydProcess = null;
let etStatus = {
  running: false,
  pid: null,
  ttydPid: null,
  startTime: null,
  config: null,
  vip: null  // 当前 VPN 虚拟 IP
};

/**
 * 加载配置
 */
function loadETConfig() {
  try {
    if (fs.existsSync(ET_CONFIG.configFile)) {
      const config = JSON.parse(fs.readFileSync(ET_CONFIG.configFile, 'utf8'));
      logger.info('[EasyTier] 配置已加载:', config.networkName || '未命名');
      return config;
    }
  } catch (err) {
    logger.error('[EasyTier] 配置加载失败:', err.message);
  }
  return null;
}

/**
 * 保存配置
 */
function saveETConfig(config) {
  try {
    fs.writeFileSync(ET_CONFIG.configFile, JSON.stringify(config, null, 2));
    logger.info('[EasyTier] 配置已保存');
  } catch (err) {
    logger.error('[EasyTier] 配置保存失败:', err.message);
  }
}

/**
 * 检查进程是否在运行
 */
function isProcessRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * 等待 VPN 可用（通过检查 EasyTier 进程）
 */
async function waitForVPN(timeout = 10000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (etStatus.running && etStatus.pid) {
      return true;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

/**
 * 启动 TTYD - 独立模式（不依赖 EasyTier VPN）
 * 作为 A-Plan 的基础组件，直接监听 0.0.0.0:822
 * 工作目录设为 A-Plan 项目根目录
 */
async function startTTYDStandalone() {
  // 如果已运行，先停止
  if (isProcessRunning(etStatus.ttydPid)) {
    logger.info('[TTYD] 已在运行，先停止旧实例');
    await stopTTYD();
    await new Promise(r => setTimeout(r, 500));
  }

  // TTYD 参数：监听所有接口，无认证，可写模式
  const args = ['-p', ET_CONFIG.ttydPort.toString(), '--writable', 'bash'];

  logger.info(`[TTYD] 启动: ${ET_CONFIG.ttydPath} ${args.join(' ')}`);
  logger.info(`[TTYD] 工作目录: ${ET_CONFIG.ttydCwd}`);

  try {
    ttydProcess = spawn(ET_CONFIG.ttydPath, args, {
      detached: false,  // 非分离模式，随父进程终止
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: ET_CONFIG.ttydCwd  // 设置工作目录为 A-Plan 根目录
    });

    etStatus.ttydPid = ttydProcess.pid;

    ttydProcess.stdout.on('data', (data) => {
      logger.info('[TTYD]', data.toString().trim());
    });

    ttydProcess.stderr.on('data', (data) => {
      logger.error('[TTYD]', data.toString().trim());
    });

    ttydProcess.on('exit', (code) => {
      logger.info(`[TTYD] 进程退出，代码: ${code}`);
      etStatus.ttydPid = null;
      ttydProcess = null;
    });

    logger.info(`[TTYD] 启动成功，PID: ${etStatus.ttydPid}，端口: ${ET_CONFIG.ttydPort}`);
    logger.info(`[TTYD] 工作目录: ${ET_CONFIG.ttydCwd}`);
    return { success: true, pid: etStatus.ttydPid, port: ET_CONFIG.ttydPort, cwd: ET_CONFIG.ttydCwd };
  } catch (err) {
    logger.error('[TTYD] 启动失败:', err.message);
    throw err;
  }
}

/**
 * 启动 TTYD - VPN 模式（绑定到 VPN 虚拟 IP，通过 EasyTier 路由）
 * 原理：
 * - TTYD 监听 0.0.0.0:822（所有接口）
 * - EasyTier 捕获 VPN 虚拟 IP 的流量并转发
 * - 外部 VPN 客户端访问虚拟IP:822 → EasyTier → TTYD
 */
async function startTTYD(vip) {
  // 如果已运行，先停止
  if (isProcessRunning(etStatus.ttydPid)) {
    logger.info('[TTYD] 已在运行，先停止');
    try {
      process.kill(etStatus.ttydPid, 'SIGTERM');
      await new Promise(r => setTimeout(r, 500));
    } catch {}
  }

  // 等待 EasyTier 就绪
  logger.info('[TTYD] 等待 EasyTier 就绪...');
  const ready = await waitForVPN(15000);
  if (!ready) {
    logger.warn('[TTYD] EasyTier 未就绪，TTYD 将不启动');
    return { success: false, error: 'EasyTier 未就绪' };
  }

  // TTYD 绑定到 0.0.0.0，让 EasyTier 处理 VPN 路由
  const bindIp = '0.0.0.0';
  const args = ['-p', ET_CONFIG.ttydPort.toString(), '-i', bindIp, 'bash'];

  logger.info(`[TTYD] 启动: ${ET_CONFIG.ttydPath} ${args.join(' ')}`);

  try {
    ttydProcess = spawn(ET_CONFIG.ttydPath, args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: ET_CONFIG.ttydCwd  // 同样设置工作目录
    });

    etStatus.ttydPid = ttydProcess.pid;

    ttydProcess.stdout.on('data', (data) => {
      logger.info('[TTYD]', data.toString().trim());
    });

    ttydProcess.stderr.on('data', (data) => {
      logger.error('[TTYD]', data.toString().trim());
    });

    ttydProcess.on('exit', (code) => {
      logger.info(`[TTYD] 进程退出，代码: ${code}`);
      etStatus.ttydPid = null;
      ttydProcess = null;
    });

    ttydProcess.unref();
    logger.info(`[TTYD] 启动成功，PID: ${etStatus.ttydPid}，绑定到 ${bindIp}:${ET_CONFIG.ttydPort}`);
    return { success: true, pid: etStatus.ttydPid, bindIp, port: ET_CONFIG.ttydPort };
  } catch (err) {
    logger.error('[TTYD] 启动失败:', err.message);
    throw err;
  }
}

/**
 * 停止 TTYD
 */
async function stopTTYD() {
  if (!etStatus.ttydPid) {
    return { success: true, message: 'TTYD 未运行' };
  }

  try {
    process.kill(etStatus.ttydPid, 'SIGTERM');
    logger.info(`[TTYD] 已发送停止信号，PID: ${etStatus.ttydPid}`);
    
    await new Promise((resolve) => {
      let count = 0;
      const check = setInterval(() => {
        if (!isProcessRunning(etStatus.ttydPid) || count > 10) {
          clearInterval(check);
          if (isProcessRunning(etStatus.ttydPid)) {
            try { process.kill(etStatus.ttydPid, 'SIGKILL'); } catch {}
          }
          resolve();
        }
        count++;
      }, 300);
    });

    etStatus.ttydPid = null;
    ttydProcess = null;
    return { success: true, message: 'TTYD 已停止' };
  } catch (err) {
    logger.error('[TTYD] 停止失败:', err.message);
    throw err;
  }
}

/**
 * 启动 EasyTier + TTYD
 */
async function startEasyTier(config = null) {
  // 如果已运行，先停止
  if (isProcessRunning(etStatus.pid)) {
    logger.warn('[EasyTier] 服务已在运行，先停止');
    await stopEasyTier();
    await new Promise(r => setTimeout(r, 1000));
  }

  // 使用传入配置或加载配置
  const cfg = config || loadETConfig();
  if (!cfg || !cfg.networkName || !cfg.networkSecret) {
    throw new Error('缺少网络名称或密码');
  }

  // 保存配置
  if (config) saveETConfig(config);

  // 获取虚拟 IP（从配置读取，如果为空则使用 DHCP 自动分配）
  const vip = cfg.vip || ET_CONFIG.defaultVip;
  etStatus.vip = vip;

  // 构建 EasyTier 命令
  const args = [
    '--network-name', cfg.networkName,
    '--network-secret', cfg.networkSecret,
    '--rpc-portal', `0.0.0.0:${ET_CONFIG.rpcPort}`
  ];

  // 如果指定了 VIP，使用静态IP；否则使用 DHCP 自动分配
  if (vip) {
    args.push('--ipv4', vip);
  } else {
    args.push('-d');  // DHCP 模式，自动分配 IP
    logger.info('[EasyTier] 使用 DHCP 自动分配 IP');
  }

  if (cfg.relay) args.push('--peers', cfg.relay);
  if (cfg.noTun) args.push('--no-tun');
  if (cfg.latencyFirst) args.push('--latency-first');
  if (cfg.multiThread) args.push('--multi-thread');

  logger.info('[EasyTier] 启动命令:', ET_CONFIG.easytierPath, args.join(' '));

  return new Promise((resolve, reject) => {
    etProcess = spawn(ET_CONFIG.easytierPath, args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    etStatus.pid = etProcess.pid;
    etStatus.running = true;
    etStatus.startTime = new Date().toISOString();
    etStatus.config = cfg;

    etProcess.stdout.on('data', (data) => {
      logger.info('[EasyTier]', data.toString().trim());
    });

    etProcess.stderr.on('data', (data) => {
      logger.error('[EasyTier]', data.toString().trim());
    });

    etProcess.on('exit', async (code) => {
      logger.info(`[EasyTier] 进程退出，代码: ${code}`);
      etStatus.running = false;
      etStatus.pid = null;
      etProcess = null;
      // EasyTier 退出时，TTYD 也停止
      await stopTTYD();
    });

    etProcess.on('error', (err) => {
      logger.error('[EasyTier] 进程错误:', err.message);
      etStatus.running = false;
      reject(err);
    });

    // 等待启动成功，然后启动 TTYD
    setTimeout(async () => {
      if (etStatus.running) {
        logger.info(`[EasyTier] 启动成功，PID: ${etStatus.pid}，虚拟IP: ${vip}`);
        try {
          // 启动 TTYD（绑定到 0.0.0.0，让 EasyTier 处理 VPN 路由）
          const ttydResult = await startTTYD(vip);
          resolve({ 
            success: true, 
            pid: etStatus.pid, 
            vip: vip,
            ttyd: ttydResult
          });
        } catch (err) {
          // TTYD 失败不影响 EasyTier
          logger.warn('[TTYD] 启动失败，但 EasyTier 已运行:', err.message);
          resolve({ success: true, pid: etStatus.pid, vip: vip, ttyd: null });
        }
      } else {
        reject(new Error('EasyTier 启动失败'));
      }
    }, 3000);

    etProcess.unref();
  });
}

/**
 * 停止 EasyTier + TTYD
 */
async function stopEasyTier() {
  const results = { easytier: null, ttyd: null };

  // 先停 TTYD
  try {
    results.ttyd = await stopTTYD();
  } catch (err) {
    results.ttyd = { success: false, error: err.message };
  }

  // 再停 EasyTier
  if (!etStatus.pid) {
    results.easytier = { success: true, message: 'EasyTier 未运行' };
    etStatus.running = false;
    return results;
  }

  try {
    process.kill(etStatus.pid, 'SIGTERM');
    logger.info(`[EasyTier] 已发送停止信号，PID: ${etStatus.pid}`);
    
    await new Promise((resolve) => {
      let count = 0;
      const check = setInterval(() => {
        if (!isProcessRunning(etStatus.pid) || count > 15) {
          clearInterval(check);
          if (isProcessRunning(etStatus.pid)) {
            try { process.kill(etStatus.pid, 'SIGKILL'); } catch {}
          }
          resolve();
        }
        count++;
      }, 400);
    });

    etStatus.running = false;
    etStatus.pid = null;
    etProcess = null;
    results.easytier = { success: true, message: 'EasyTier 已停止' };
  } catch (err) {
    logger.error('[EasyTier] 停止失败:', err.message);
    results.easytier = { success: false, error: err.message };
  }

  return results;
}

/**
 * 自动启动
 */
async function autoStart() {
  const config = loadETConfig();
  if (config && config.autoStart) {
    logger.info('[EasyTier] 检测到自动启动配置');
    try {
      await startEasyTier();
      logger.info('[EasyTier] 自动启动成功');
    } catch (err) {
      logger.error('[EasyTier] 自动启动失败:', err.message);
    }
  }
}

/**
 * 获取状态
 */
function getStatus() {
  // 检测当前记录的进程
  let running = isProcessRunning(etStatus.pid);
  let pid = etStatus.pid;
  
  // 如果记录的进程不在运行，尝试检测系统中的 EasyTier 进程
  if (!running) {
    try {
      const result = execSync('pgrep -f "easytier-core.*network-name" 2>/dev/null || echo ""').toString().trim();
      if (result) {
        const systemPid = parseInt(result, 10);
        if (systemPid && isProcessRunning(systemPid)) {
          running = true;
          pid = systemPid;
          // 更新 etStatus 以便下次检测
          etStatus.pid = pid;
          etStatus.running = true;
        }
      }
    } catch {
      // 忽略错误
    }
  }
  
  return {
    ...etStatus,
    running: running,
    pid: pid,
    ttydRunning: isProcessRunning(etStatus.ttydPid),
    rpcPort: ET_CONFIG.rpcPort,
    ttydPort: ET_CONFIG.ttydPort
  };
}

/**
 * 获取默认配置
 */
function getDefaultConfig() {
  return {
    vip: '',  // 留空，使用 DHCP 自动分配
    networkName: '',
    networkSecret: '',
    relay: '',  // 留空，用户自行填写
    noTun: true,
    latencyFirst: true,
    multiThread: true,
    autoStart: true
  };
}

export {
  startEasyTier,
  stopEasyTier,
  autoStart,
  getStatus,
  loadETConfig,
  saveETConfig,
  getDefaultConfig,
  startTTYDStandalone,  // 新增：独立启动 TTYD（不依赖 EasyTier）
  stopTTYD           // 新增：单独停止 TTYD
};
