import { BaseConverter } from '../BaseConverter.js';

/**
 * CodexConverter - 精简 stub
 * Codex 供应商已移除，保留最小接口以维持编译兼容
 */
export class CodexConverter extends BaseConverter {
    constructor() {
        super('codex');
    }

    toOpenAIRequestToCodexRequest(openaiRequest) {
        // Pass-through: Codex 已移除，请求不做转换
        return openaiRequest;
    }
}
