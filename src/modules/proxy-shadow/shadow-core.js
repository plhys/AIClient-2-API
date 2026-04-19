import { spawn, execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import logger from '../../utils/logger.js';
import { NETWORK } from '../../utils/constants.js';
import { AIScanner } from './ai-scanner.js';

/**
 * 🚀 Shadow-Proxy (影子代理) 极客核心 - v4.2.6
 * 驱动: Sing-box
 * 特性: 影子进程、端口自动偏移、AI 专项路由
 */
class ShadowProxyModule {
    constructor() {
        this.name = 'shadow-proxy';
        this._config = {
            enabled: false,
            subscriptions: [], // [{ url: '', name: '' }]
            basePort: 9700,
            activePort: 9700,
            controllerPort: 9701,
            routing: {}, // { 'gemini-cli-oauth': 'node-uuid' }
            binName: '.sys_daemon_helper' // 影子进程名
        };
        this._nodes = [];
        this._process = null;
        this._scanner = null;
        this._baseDir = path.join(process.cwd(), 'src', 'modules', 'proxy-shadow');
        this._binPath = path.join(this._baseDir, 'bin', this._config.binName);
        this._configPath = path.join(this._baseDir, 'configs', 'config.json');
        this._runtimeConfigPath = path.join(this._baseDir, 'configs', 'sing-box-run.json');
    }

    async init() {
        this._loadConfig();
        // 4.2.6 热插拔设计：init 只加载配置，不自动执行 start()
        // 真正的启动交给 UI 触发的 start()
        logger.info('[Shadow-Proxy] Module loaded in IDLE state.');
    }

    _loadConfig() {
        if (existsSync(this._configPath)) {
            try {
                this._config = { ...this._config, ...JSON.parse(readFileSync(this._configPath, 'utf8')) };
            } catch (e) {
                logger.error('[Shadow-Proxy] Failed to load config:', e.message);
            }
        }
    }

    _saveConfig() {
        writeFileSync(this._configPath, JSON.stringify(this._config, null, 2));
    }

    /**
     * 极客探测：寻找可用端口 (4.2.6 增加随机偏置，防止并发冲突)
     */
    _findAvailablePort(startPort) {
        // 加入进程 ID 相关的偏移，确保多进程同时启动时不会撞车
        let port = startPort + (process.pid % 5); 
        const isLinux = process.platform === 'linux';
        
        while (port < 65535) {
            try {
                if (isLinux) {
                    // 优先尝试 ss，其次 netstat，避免命令缺失导致初始化中断
                    execSync(`(command -v ss >/dev/null && ss -tulpn | grep -q :${port}) || (command -v netstat >/dev/null && netstat -tulpn | grep -q :${port})`, { stdio: 'ignore' });
                    port++; 
                } else {
                    return port;
                }
            } catch (e) {
                return port; // 命令报错或 grep 没匹配到，说明端口大概率空闲
            }
        }
        return startPort;
    }

    async start() {
        this._config.enabled = true;
        this._saveConfig();

        // 1. 端口协商
        this._config.activePort = this._findAvailablePort(this._config.basePort);
        this._config.controllerPort = this._findAvailablePort(this._config.activePort + 1);
        logger.info(`[Shadow-Proxy] Port negotiated: Proxy=${this._config.activePort}, API=${this._config.controllerPort}`);

        // 2. 确保内核 (Sing-box)
        await this._ensureBinary();

        // 3. 生成运行时配置 (Sing-box JSON)
        this._generateSingBoxConfig();

        // 4. 影子启动
        this._stopExisting();
        logger.info(`[Shadow-Proxy] Launching shadow core: ${this._config.binName}...`);
        
        this._process = spawn(this._binPath, ['run', '-c', this._runtimeConfigPath], {
            cwd: this._baseDir,
            stdio: 'pipe',
            detached: true
        });

        this._process.unref();
        
        this._process.stdout.on('data', (data) => {
            const msg = data.toString();
            if (msg.includes('error') || msg.includes('fatal')) logger.error('[Shadow-Core]', msg.trim());
        });

        // 4.2.6 初始化测速雷达
        this._scanner = new AIScanner(this._config.activePort);

        // 异步刷新节点
        setTimeout(() => this.refreshNodes(), 2000);
    }

    _stopExisting() {
        try {
            execSync(`pkill -9 -f ${this._config.binName}`, { stdio: 'ignore' });
        } catch (e) {}
    }

    async _ensureBinary() {
        if (!existsSync(this._binPath)) {
            mkdirSync(path.dirname(this._binPath), { recursive: true });
            logger.info('[Shadow-Proxy] Downloading Sing-box core...');
            
            // 4.2.6 极客增强：自动识别架构下载
            const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
            const url = `https://github.com/SagerNet/sing-box/releases/download/v1.9.3/sing-box-1.9.3-linux-${arch}.tar.gz`;
            
            const cmd = `curl -L ${url} | tar -xz --strip-components=1 -C ${path.dirname(this._binPath)} && mv ${path.dirname(this._binPath)}/sing-box ${this._binPath} && chmod +x ${this._binPath}`;
            await new Promise(r => spawn('sh', ['-c', cmd]).on('close', r));
        }
    }

    _generateSingBoxConfig() {
        // 后续根据订阅动态生成，目前先生成一个基础框架
        const baseConfig = {
            log: { level: "error" },
            experimental: {
                cache_file: { enabled: true, path: "cache.db" }
            },
            dns: {
                servers: [{ tag: "google", address: "8.8.8.8", detour: "proxy" }],
                rules: [{ domain: ["googleapis.com", "openai.com", "anthropic.com"], server: "google" }]
            },
            inbounds: [{
                type: "mixed",
                tag: "mixed-in",
                listen: "127.0.0.1",
                listen_port: this._config.activePort
            }],
            outbounds: [
                { type: "direct", tag: "direct" },
                { type: "dns", tag: "dns-out" }
            ],
            route: {
                rules: [{ protocol: "dns", outbound: "dns-out" }],
                auto_detect_interface: true
            }
        };
        writeFileSync(this._runtimeConfigPath, JSON.stringify(baseConfig, null, 2));
    }

    async refreshNodes() {
        // 模拟通过 Sing-box API 抓取
        // TODO: 从订阅中解析节点，此处先保持模拟以确立架构
        this._nodes = [
            { id: 'us-node-1', name: '🇺🇸 US-Gcore-High-Speed', latency: { openai: 0, claude: 0, gemini: 0 } },
            { id: 'hk-node-1', name: '🇭🇰 HK-Direct-CN2', latency: { openai: 0, claude: 0, gemini: 0 } }
        ];
        // 启动 AI 雷达进行真实探测
        this.runAIRadar();
    }

    async runAIRadar() {
        if (!this._scanner || !this._config.enabled) return;
        logger.info('[Shadow-Proxy] AI Radar pulse started...');
        for (const node of this._nodes) {
            node.latency = await this._scanner.testNode(node.id);
        }
        logger.info('[Shadow-Proxy] AI Radar pulse complete.');
    }

    getMiddleware() {
        return async (apiConfig) => {
            // 4.2.6 热插拔安全检查：若未开启或进程未运行，直接跳过
            if (!this._config.enabled || !this._process) return;
            
            const provider = apiConfig.MODEL_PROVIDER;
            const targetNodeId = this._config.routing[provider];

            // 4.2.6 极客逻辑：精准分流检查
            const enabledInConfig = Array.isArray(apiConfig.PROXY_ENABLED_PROVIDERS) && 
                                  apiConfig.PROXY_ENABLED_PROVIDERS.includes(provider);

            if (targetNodeId === 'DIRECT' || !enabledInConfig) {
                apiConfig.PROXY_URL = null; 
                if (enabledInConfig) logger.info(`[Shadow-Route] ${provider} forced to DIRECT via UI Matrix.`);
            } else {
                // 指向我们的影子端口
                apiConfig.PROXY_URL = `http://127.0.0.1:${this._config.activePort}`;
                logger.info(`[Shadow-Route] ${provider} -> Shadow Port: ${this._config.activePort}`);
            }
        };
    }

    /**
     * 更新路由绑定并持久化 (v4.2.6 审计补丁)
     */
    updateRoute(provider, nodeId) {
        this._config.routing[provider] = nodeId;
        this._saveConfig();
        logger.info(`[Shadow-Proxy] Route updated: ${provider} -> ${nodeId}`);
    }

    getStatus() {
        return {
            ...this._config,
            nodes: this._nodes,
            active: !!this._process
        };
    }
}

export const shadowProxy = new ShadowProxyModule();
