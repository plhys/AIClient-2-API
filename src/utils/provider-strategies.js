import { OpenAIStrategy } from '../providers/openai/openai-strategy.js';

/**
 * Strategy factory that returns the appropriate strategy instance based on the provider protocol.
 * Simplified: All providers now use OpenAI-compatible format exclusively.
 */
class ProviderStrategyFactory {
    static getStrategy(providerProtocol) {
        return new OpenAIStrategy();
    }
}

export { ProviderStrategyFactory };
