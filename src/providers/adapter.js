import { OpenAIApiService } from './openai/openai-core.js';
import { MODEL_PROVIDER } from '../utils/constants.js';
import logger from '../utils/logger.js';

// 适配器注册表
const adapterRegistry = new Map();

/**
 * 注册服务适配器
 * @param {string} provider - 提供商名称 (来自 MODEL_PROVIDER)
 * @param {typeof ApiServiceAdapter} adapterClass - 适配器类
 */
export function registerAdapter(provider, adapterClass) {
    logger.info(`[Adapter] Registering adapter for provider: ${provider}`);
    adapterRegistry.set(provider, adapterClass);
}

/**
 * 获取所有已注册的提供商
 * @returns {string[]} 已注册的提供商名称列表
 */
export function getRegisteredProviders() {
    return Array.from(adapterRegistry.keys());
}

// 定义AI服务适配器接口 (所有服务适配器都应实现这些方法)
export class ApiServiceAdapter {
    constructor() {
        if (new.target === ApiServiceAdapter) {
            throw new TypeError("Cannot construct ApiServiceAdapter instances directly");
        }
    }
    async generateContent(model, requestBody) { throw new Error("Method 'generateContent()' must be implemented."); }
    async *generateContentStream(model, requestBody) { throw new Error("Method 'generateContentStream()' must be implemented."); }
    async listModels() { throw new Error("Method 'listModels()' must be implemented."); }
    async refreshToken() { throw new Error("Method 'refreshToken()' must be implemented."); }
    async forceRefreshToken() { throw new Error("Method 'forceRefreshToken()' must be implemented."); }
    isExpiryDateNear() { throw new Error("Method 'isExpiryDateNear()' must be implemented."); }
}

// OpenAI API 服务适配器 (统一的 OpenAI 兼容格式适配器)
export class OpenAIApiServiceAdapter extends ApiServiceAdapter {
    constructor(config) {
        super();
        this.openAIApiService = new OpenAIApiService(config);
    }
    async generateContent(model, requestBody) {
        return this.openAIApiService.generateContent(model, requestBody);
    }
    async *generateContentStream(model, requestBody) {
        yield* this.openAIApiService.generateContentStream(model, requestBody);
    }
    async listModels() {
        return this.openAIApiService.listModels();
    }
    async refreshToken() { return Promise.resolve(); }
    async forceRefreshToken() { return Promise.resolve(); }
    isExpiryDateNear() { return false; }
}

// 注册所有内置适配器 (统一使用 OpenAI 兼容格式)
registerAdapter(MODEL_PROVIDER.OPENAI_CUSTOM, OpenAIApiServiceAdapter);
registerAdapter(MODEL_PROVIDER.DEEPSEEK, OpenAIApiServiceAdapter);
registerAdapter(MODEL_PROVIDER.DEEPSEEK_CUSTOM, OpenAIApiServiceAdapter);

// 用于存储服务适配器单例的映射
export const serviceInstances = {};
const lastAccessTimes = new Map();

export function getServiceInstanceKey(provider, uuid = null) {
    return uuid ? provider + uuid : provider;
}

export function invalidateServiceAdapter(provider, uuid = null) {
    const providerKey = getServiceInstanceKey(provider, uuid);
    if (serviceInstances[providerKey]) {
        delete serviceInstances[providerKey];
        lastAccessTimes.delete(providerKey);
        logger.info(`[Adapter] Invalidated service adapter, provider: ${provider}, uuid: ${uuid || 'default'}`);
        return true;
    }
    return false;
}

// 自动清理闲置实例
function cleanupIdleInstances() {
    const now = Date.now();
    const IDLE_TIMEOUT = 30 * 60 * 1000;
    for (const [key, lastAccess] of lastAccessTimes.entries()) {
        if (now - lastAccess > IDLE_TIMEOUT) {
            delete serviceInstances[key];
            lastAccessTimes.delete(key);
            logger.info(`[Adapter] Auto-cleaned idle instance: ${key}`);
        }
    }
}
setInterval(cleanupIdleInstances, 5 * 60 * 1000);

// 检查提供商是否已注册（支持前缀匹配）
export function isRegisteredProvider(provider) {
    if (adapterRegistry.has(provider)) return true;
    if (provider) {
        for (const key of adapterRegistry.keys()) {
            if (provider.startsWith(key + '-')) return true;
        }
    }
    return false;
}

// 服务适配器工厂
export function getServiceAdapter(config) {
    const provider = config.MODEL_PROVIDER;
    const providerKey = getServiceInstanceKey(provider, config.uuid);
    lastAccessTimes.set(providerKey, Date.now());

    if (!serviceInstances[providerKey]) {
        const customNameDisplay = config.customName ? ` (${config.customName})` : '';
        logger.info(`[Adapter] Creating NEW service adapter, provider: ${config.MODEL_PROVIDER}, uuid: ${config.uuid}${customNameDisplay}`);
        
        let AdapterClass = adapterRegistry.get(provider);
        if (!AdapterClass && provider) {
            for (const [key, value] of adapterRegistry.entries()) {
                if (provider === key || provider.startsWith(key + '-')) {
                    AdapterClass = value;
                    break;
                }
            }
        }
        if (AdapterClass) {
            serviceInstances[providerKey] = new AdapterClass(config);
        } else {
            throw new Error(`Unsupported model provider: ${provider}`);
        }
    }
    return serviceInstances[providerKey];
}
