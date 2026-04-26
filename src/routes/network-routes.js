/**
 * EasyTier 网络管理 API
 */

import express from 'express';
import {
  startEasyTier,
  stopEasyTier,
  getStatus,
  loadETConfig,
  saveETConfig,
  getDefaultConfig
} from '../../modules/network/easytier-manager.js';
import logger from '../../utils/logger.js';

const router = express.Router();

// 获取状态
router.get('/status', (req, res) => {
  try {
    const status = getStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    logger.error('[NetworkAPI] 获取状态失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 获取配置
router.get('/config', (req, res) => {
  try {
    const config = loadETConfig() || getDefaultConfig();
    // 不返回密码
    const safeConfig = { ...config };
    if (safeConfig.networkSecret) {
      safeConfig.networkSecret = '********';
    }
    res.json({ success: true, config: safeConfig });
  } catch (err) {
    logger.error('[NetworkAPI] 获取配置失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 启动 EasyTier
router.post('/start', async (req, res) => {
  try {
    const { vip, networkName, networkSecret, relay, noTun, latencyFirst, multiThread, autoStart } = req.body;
    
    if (!networkName || !networkSecret) {
      return res.status(400).json({ 
        success: false, 
        error: '缺少网络名称或密码' 
      });
    }

    const config = {
      vip: vip,  // 留空则使用 DHCP 自动分配
      networkName,
      networkSecret,
      relay: relay,  // 留空则不指定对等节点
      noTun: !!noTun,
      latencyFirst: !!latencyFirst,
      multiThread: multiThread !== false,
      autoStart: !!autoStart
    };

    const result = await startEasyTier(config);
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('[NetworkAPI] 启动失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 停止 EasyTier
router.post('/stop', async (req, res) => {
  try {
    const result = await stopEasyTier();
    res.json(result);
  } catch (err) {
    logger.error('[NetworkAPI] 停止失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 保存配置（不启动）
router.post('/config', (req, res) => {
  try {
    const config = req.body;
    saveETConfig(config);
    res.json({ success: true, message: '配置已保存' });
  } catch (err) {
    logger.error('[NetworkAPI] 保存配置失败:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 健康检查
router.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    status: getStatus().running ? 'running' : 'stopped',
    timestamp: new Date().toISOString()
  });
});

export default router;
