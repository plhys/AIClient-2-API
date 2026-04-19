/**
 * Shadow Proxy Manager
 * v4.2.6 Geek Custom
 */
export class ShadowProxyManager {
    constructor() {
        this.status = {};
        this.providers = ['gemini-cli-oauth', 'claude-kiro-oauth', 'openai-custom', 'nvidia-nim', 'grok-custom'];
    }

    async init() {
        await this.refresh();
    }

    async refresh() {
        try {
            const response = await fetch('/api/shadow-proxy/info');
            if (!response.ok) throw new Error('API failed');
            const data = await response.json();
            this.status = data;
            this.render();
        } catch (e) {
            console.error('Failed to fetch shadow proxy info', e);
        }
    }

    render() {
        if (!this.status) return;

        const statusBadge = document.getElementById('proxy-status');
        if (statusBadge) {
            statusBadge.innerText = this.status.enabled ? 'ON' : 'OFF';
            statusBadge.className = 'badge ' + (this.status.enabled ? 'badge-success' : 'badge-danger');
        }
        
        const portSpan = document.getElementById('proxy-active-port');
        if (portSpan) portSpan.innerText = this.status.activePort || 9700;
        
        const toggle = document.getElementById('shadowProxyToggle');
        if (toggle) toggle.checked = !!this.status.enabled;

        this.renderMatrix();
        this.renderNodes();
    }

    renderMatrix() {
        const tbody = document.getElementById('proxy-routing-matrix');
        if (!tbody) return;
        tbody.innerHTML = '';

        this.providers.forEach(p => {
            const tr = document.createElement('tr');
            const currentNode = this.status.routing?.[p] || 'DIRECT';
            
            tr.innerHTML = `
                <td><strong>${p}</strong></td>
                <td>
                    <select onchange="window.shadowProxyManager.updateRoute('${p}', this.value)">
                        <option value="DIRECT" ${currentNode === 'DIRECT' ? 'selected' : ''}>DIRECT (直接连接)</option>
                        <option value="AUTO" ${currentNode === 'AUTO' ? 'selected' : ''}>AUTO (自动延迟最优)</option>
                        ${this.status.nodes?.map(n => `<option value="${n.id}" ${currentNode === n.id ? 'selected' : ''}>${n.name}</option>`).join('') || ''}
                    </select>
                </td>
                <td><span class="badge ${currentNode === 'DIRECT' ? 'badge-secondary' : 'badge-primary'}">${currentNode === 'DIRECT' ? '不走代理' : '影子链路'}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }

    renderNodes() {
        const container = document.getElementById('proxy-node-list');
        if (!container) return;
        container.innerHTML = '';

        if (!this.status.nodes || this.status.nodes.length === 0) {
            container.innerHTML = '<div class="empty-state">未发现影子节点，请先添加订阅。</div>';
            return;
        }

        this.status.nodes.forEach(n => {
            const card = document.createElement('div');
            card.className = 'node-card';
            
            const getLatencyClass = (l) => {
                if (!l) return 'latency-high';
                if (l < 300) return 'latency-low';
                if (l < 800) return 'latency-med';
                return 'latency-high';
            };

            card.innerHTML = `
                <h4><i class="fas fa-server"></i> ${n.name}</h4>
                <div class="latency-badges">
                    <div class="latency-badge badge-openai ${getLatencyClass(n.latency?.openai)}">
                        <i class="fas fa-robot"></i> OpenAI: ${n.latency?.openai || '---'}ms
                    </div>
                    <div class="latency-badge badge-claude ${getLatencyClass(n.latency?.claude)}">
                        <i class="fas fa-brain"></i> Claude: ${n.latency?.claude || '---'}ms
                    </div>
                    <div class="latency-badge badge-gemini ${getLatencyClass(n.latency?.gemini)}">
                        <i class="fas fa-gem"></i> Gemini: ${n.latency?.gemini || '---'}ms
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    async updateRoute(provider, nodeId) {
        try {
            const response = await fetch('/api/shadow-proxy/route', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, nodeId })
            });
            if (!response.ok) throw new Error('API failed');
            
            this.status.routing[provider] = nodeId;
            this.render();
            if (window.showToast) window.showToast(`已将 ${provider} 绑定到 ${nodeId === 'DIRECT' ? '直连' : '节点'}`, 'success');
        } catch (e) {
            if (window.showToast) window.showToast('路由更新失败', 'error');
        }
    }

    async testAllAI() {
        if (window.showToast) window.showToast('AI 雷达已启动，正在进行针对性 TLS 握手探测...', 'info');
        try {
            const response = await fetch('/api/shadow-proxy/test-ai', { method: 'POST' });
            if (response.ok) {
                // 启动定时刷新直到测速完成
                const timer = setInterval(async () => {
                    await this.refresh();
                    // 如果所有节点都有了非零延迟，停止刷新
                    if (this.status.nodes?.every(n => n.latency?.openai > 0)) {
                        clearInterval(timer);
                    }
                }, 2000);
            }
        } catch (e) {}
    }
}

export function initShadowProxyManager() {
    window.shadowProxyManager = new ShadowProxyManager();
    window.handleShadowProxyToggle = async (enabled) => {
        try {
            const response = await fetch('/api/shadow-proxy/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled })
            });
            if (response.ok && window.showToast) {
                window.showToast(enabled ? '影子代理已唤醒' : '影子代理已休眠', 'success');
                window.shadowProxyManager.refresh();
            }
        } catch (e) {
            if (window.showToast) window.showToast('影子代理控制失败', 'error');
        }
    };
    return window.shadowProxyManager;
}

