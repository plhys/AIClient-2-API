import logger from '../utils/logger.js';
import { broadcastEvent } from '../ui-modules/event-broadcast.js';

/**
 * DeepSeek 授权嗅探逻辑
 */
export async function handleDeepSeekAuth(req, res, config) {
    const authUrl = 'https://chat.deepseek.com/login';
    
    // 告知前端授权已启动
    logger.info('[DeepSeek-Auth] Starting interactive login capture...');
    
    return {
        success: true,
        authUrl: authUrl,
        authInfo: {
            provider: 'deepseek-free',
            message: '请在弹出的窗口中完成 DeepSeek 登录，系统将自动捕获您的 Token。'
        }
    };
}

/**
 * 核心黑科技：手动回调处理（给用户一个简单的书签脚本，一键回传）
 * 虽然不能 100% 自动，但我们可以给用户提供一个“一键捕获”的小工具
 */
export async function handleDeepSeekManualCallback(callbackData, providerPoolManager) {
    const { token } = callbackData;
    if (!token) throw new Error('未检测到有效的 Token');

    // 自动寻找或创建一个 DeepSeek 免费版节点
    const providerType = 'deepseek-free';
    const uuid = `ds-free-${Date.now().toString(36)}`;
    
    const newNode = {
        uuid: uuid,
        customName: '自动捕获节点-' + new Date().toLocaleTimeString(),
        DEEPSEEK_USER_TOKEN: token.replace('Bearer ', ''),
        isHealthy: true,
        isDisabled: false
    };

    await providerPoolManager.providerPools[providerType].push(newNode);
    providerPoolManager.initializeProviderStatus();
    
    logger.info(`[DeepSeek-Auth] Successfully captured and saved token for UUID: ${uuid}`);
    
    return {
        success: true,
        relativePath: uuid
    };
}
