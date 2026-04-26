/**
 * 转换器注册模块
 * 精简版：只保留 OpenAI 兼容格式转换器
 */

import { MODEL_PROTOCOL_PREFIX } from '../utils/common.js';
import { ConverterFactory } from './ConverterFactory.js';
import { OpenAIConverter } from './strategies/OpenAIConverter.js';
import { OpenAIResponsesConverter } from './strategies/OpenAIResponsesConverter.js';

/**
 * 注册所有转换器到工厂
 */
export function registerAllConverters() {
    // OpenAI 转换器 - 主格式
    ConverterFactory.registerConverter(MODEL_PROTOCOL_PREFIX.OPENAI, OpenAIConverter);
    ConverterFactory.registerConverter(MODEL_PROTOCOL_PREFIX.OPENAI_RESPONSES, OpenAIResponsesConverter);
    // Cloudflare Gateway 使用 OpenAI 转换器
    ConverterFactory.registerConverter(MODEL_PROTOCOL_PREFIX.CLOUDFLARE, OpenAIConverter);
    // DeepSeek 使用 OpenAI 转换器（OpenAI 兼容格式）
    ConverterFactory.registerConverter(MODEL_PROTOCOL_PREFIX.DEEPSEEK, OpenAIConverter);
}

// 自动注册
registerAllConverters();
