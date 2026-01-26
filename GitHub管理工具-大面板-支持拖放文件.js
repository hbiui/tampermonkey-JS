// ==UserScript==
// @name         GitHub 批量文件管理工具
// @namespace    http://tampermonkey.net/
// @version      3.8
// @description  在GitHub页面添加批量操作按钮：删除所有文件（保留目录结构）、创建.gitignore文件、上传本地文件到仓库和一键删除存储库
// @author       Your Name
// @match        https://github.com/*
// @match        chrome-extension://dhdgffkkebhmkfjojejmpbldmpobfkfo/*
// @match        edge://extensions/*
// @match        moz-extension://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_openInTab
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_download
// @connect      api.github.com
// @connect      github.com
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@11
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // 配置
    const CONFIG = {
        API_BASE: 'https://api.github.com',
        GITHUB_TOKEN_KEY: 'github_token',
        SCRIPT_ENABLED_KEY: 'script_enabled',
        MAX_RETRIES: 3,
        RETRY_DELAY: 1000,
        PAGE_SIZE: 100,
        CHUNK_SIZE: 3,
        UPLOAD_CHUNK_SIZE: 5, // 上传文件时分块大小
        MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
        BUTTON_STYLE: `
            .github-tool-btn {
                background: #2ea44f;
                color: white;
                border: 1px solid #2ea44f;
                padding: 8px 16px;
                margin: 0 5px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                transition: all 0.2s;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
                line-height: 20px;
                white-space: nowrap;
                vertical-align: middle;
            }
            .github-tool-btn:hover {
                background: #2c974b;
                border-color: #2c974b;
                transform: translateY(-1px);
                box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            }
            .github-tool-btn.danger {
                background: #dc3545;
                border-color: #dc3545;
            }
            .github-tool-btn.danger:hover {
                background: #c82333;
                border-color: #c82333;
            }
            .github-tool-btn.warning {
                background: #fd7e14;
                border-color: #fd7e14;
            }
            .github-tool-btn.warning:hover {
                background: #e96c02;
                border-color: #e96c02;
            }
            .github-tool-btn.primary {
                background: #007bff;
                border-color: #007bff;
            }
            .github-tool-btn.primary:hover {
                background: #0069d9;
                border-color: #0062cc;
            }
            .github-tool-btn.dark-danger {
                background: #8b0000;
                border-color: #8b0000;
            }
            .github-tool-btn.dark-danger:hover {
                background: #6b0000;
                border-color: #6b0000;
            }
            .github-tool-btn:disabled {
                background: #6c757d;
                border-color: #6c757d;
                cursor: not-allowed;
                transform: none;
                opacity: 0.6;
            }
            .github-tool-btn.settings {
                background: #6c757d;
                border-color: #6c757d;
            }
            .github-tool-btn.settings:hover {
                background: #5a6268;
                border-color: #545b62;
            }
            .github-tools-floating {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 99999;
                background: white;
                border-radius: 10px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                border: 1px solid #e1e4e8;
                min-width: 200px;
                max-width: 300px;
                overflow: hidden;
                animation: slideIn 0.3s ease-out;
            }
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            .github-tools-header {
                background: #24292e;
                color: white;
                padding: 12px 15px;
                font-weight: 600;
                font-size: 14px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .github-tools-header .close-btn {
                background: none;
                border: none;
                color: white;
                cursor: pointer;
                font-size: 16px;
                padding: 0;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 3px;
            }
            .github-tools-header .close-btn:hover {
                background: rgba(255,255,255,0.1);
            }
            .github-tools-body {
                padding: 15px;
            }
            .github-tools-section {
                margin-bottom: 15px;
            }
            .github-tools-section-title {
                font-size: 12px;
                color: #586069;
                margin-bottom: 8px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .github-tools-buttons {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .github-tools-buttons-row {
                display: flex;
                gap: 10px;
            }
            .progress-container {
                width: 100%;
                background-color: #e1e4e8;
                border-radius: 4px;
                margin: 10px 0;
                overflow: hidden;
            }
            .progress-bar {
                height: 6px;
                background-color: #2ea44f;
                border-radius: 4px;
                transition: width 0.3s ease;
            }
            .status-text {
                font-size: 12px;
                color: #586069;
                margin-top: 5px;
                text-align: center;
            }
            .flash {
                animation: flash 1s ease-in-out;
            }
            @keyframes flash {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            .error-details {
                max-height: 200px;
                overflow-y: auto;
                text-align: left;
                margin-top: 10px;
                padding: 10px;
                background: #f6f8fa;
                border-radius: 4px;
                border: 1px solid #e1e4e8;
                font-size: 12px;
            }
            .error-item {
                margin-bottom: 8px;
                padding-bottom: 8px;
                border-bottom: 1px dashed #e1e4e8;
            }
            .error-item:last-child {
                border-bottom: none;
                margin-bottom: 0;
                padding-bottom: 0;
            }
            /* 上传相关样式 */
            .upload-area {
                border: 2px dashed #0366d6;
                border-radius: 6px;
                padding: 40px 20px;
                text-align: center;
                cursor: pointer;
                transition: all 0.2s;
                background: #f6f8fa;
                margin-bottom: 15px;
            }
            .upload-area:hover {
                background: #f0f7ff;
                border-color: #005cc5;
            }
            .upload-area.drag-over {
                background: #e6f7ff;
                border-color: #1890ff;
                transform: scale(1.02);
            }
            .upload-area p {
                margin: 10px 0;
                color: #586069;
            }
            .upload-icon {
                font-size: 48px;
                color: #0366d6;
                margin-bottom: 10px;
            }
            .file-list-container {
                max-height: 300px;
                overflow-y: auto;
                border: 1px solid #e1e4e8;
                border-radius: 6px;
                padding: 10px;
                background: #fafbfc;
                margin-top: 15px;
                text-align: left;
            }
            .file-list-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px;
                border-bottom: 1px solid #eaeaea;
            }
            .file-list-item:last-child {
                border-bottom: none;
            }
            .file-icon {
                margin-right: 8px;
                font-size: 16px;
            }
            .file-info {
                flex: 1;
                display: flex;
                flex-direction: column;
            }
            .file-name {
                font-weight: 500;
                color: #24292e;
                word-break: break-all;
            }
            .file-size {
                font-size: 12px;
                color: #586069;
            }
            .remove-file {
                background: none;
                border: none;
                color: #dc3545;
                cursor: pointer;
                font-size: 18px;
                padding: 0 5px;
                margin-left: 10px;
            }
            .file-stats {
                display: flex;
                justify-content: space-between;
                margin-top: 10px;
                padding: 10px;
                background: #f8f9fa;
                border-radius: 4px;
                font-size: 12px;
            }
            .file-stat {
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            .file-stat-value {
                font-weight: 600;
                font-size: 14px;
                color: #24292e;
            }
            .file-stat-label {
                color: #586069;
                margin-top: 2px;
            }
            .upload-buttons {
                display: flex;
                gap: 10px;
                margin-top: 15px;
            }
            .upload-btn {
                flex: 1;
                padding: 12px;
                font-size: 14px;
                border-radius: 6px;
                border: 1px solid #ddd;
                background: #f8f9fa;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }
            .upload-btn:hover {
                background: #e9ecef;
                border-color: #ccc;
            }
            .upload-btn.file-btn {
                background: #007bff;
                color: white;
                border-color: #007bff;
            }
            .upload-btn.file-btn:hover {
                background: #0069d9;
                border-color: #0062cc;
            }
            .upload-btn.folder-btn {
                background: #28a745;
                color: white;
                border-color: #28a745;
            }
            .upload-btn.folder-btn:hover {
                background: #218838;
                border-color: #1e7e34;
            }
            .file-conflict-options {
                background: #fff3cd;
                border: 1px solid #ffeaa7;
                border-radius: 4px;
                padding: 15px;
                margin-top: 15px;
                text-align: left;
            }
            .conflict-option {
                margin-bottom: 8px;
                display: flex;
                align-items: center;
            }
            .conflict-option input {
                margin-right: 8px;
            }
            /* 危险操作样式 */
            .danger-zone {
                margin-top: 20px;
                padding: 20px;
                background: #f8f9fa;
                border-radius: 8px;
                border: 2px solid #dc3545;
            }
            .danger-zone h3 {
                color: #dc3545;
                margin-top: 0;
                margin-bottom: 15px;
                font-size: 16px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .danger-note {
                background: #fff3cd;
                border: 1px solid #ffeaa7;
                border-radius: 4px;
                padding: 15px;
                margin: 15px 0;
                text-align: left;
            }
            .danger-note ul {
                margin: 10px 0 0 0;
                padding-left: 20px;
            }
            .danger-note li {
                margin-bottom: 5px;
            }
            /* Tampermonkey控制面板样式 */
            .tampermonkey-control-panel {
                background: #f6f8fa;
                padding: 20px;
                margin: 20px 0;
                border-radius: 8px;
                border: 1px solid #e1e4e8;
                max-width: 600px;
            }
            .tampermonkey-control-panel h3 {
                margin-top: 0;
                margin-bottom: 15px;
                color: #24292e;
                font-size: 18px;
                border-bottom: 2px solid #e1e4e8;
                padding-bottom: 10px;
            }
            .tampermonkey-control-panel .github-tools-buttons {
                display: flex;
                flex-direction: row;
                flex-wrap: wrap;
                gap: 10px;
                margin-top: 15px;
            }
            .switch {
                position: relative;
                display: inline-block;
                width: 50px;
                height: 24px;
            }
            .switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            .slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: #ccc;
                transition: .4s;
                border-radius: 24px;
            }
            .slider:before {
                position: absolute;
                content: "";
                height: 16px;
                width: 16px;
                left: 4px;
                bottom: 4px;
                background-color: white;
                transition: .4s;
                border-radius: 50%;
            }
            input:checked + .slider {
                background-color: #28a745;
            }
            input:checked + .slider:before {
                transform: translateX(26px);
            }
        `
    };

    // 全局状态管理
    class StateManager {
        static isGitHubPage() {
            return window.location.hostname === 'github.com';
        }

        static isTampermonkeyPage() {
            return window.location.href.includes('chrome-extension://dhdgffkkebhmkfjojejmpbldmpobfkfo') ||
                   window.location.href.includes('edge://extensions') ||
                   window.location.href.includes('moz-extension://');
        }

        static getScriptEnabled() {
            return GM_getValue(CONFIG.SCRIPT_ENABLED_KEY, true);
        }

        static setScriptEnabled(enabled) {
            GM_setValue(CONFIG.SCRIPT_ENABLED_KEY, enabled);
            return enabled;
        }
    }

    // GitHub Token管理
    class TokenManager {
        static getToken() {
            const token = GM_getValue(CONFIG.GITHUB_TOKEN_KEY, '');
            if (!token) {
                console.warn('GitHub Token 未设置');
                return '';
            }
            return token;
        }

        static setToken(token) {
            GM_setValue(CONFIG.GITHUB_TOKEN_KEY, token);
            console.log('GitHub Token 已保存');
        }

        static async ensureToken() {
            let token = this.getToken();
            if (!token) {
                await this.requestToken();
                token = this.getToken();
            }
            return token;
        }

        static async requestToken() {
            const { value: token } = await Swal.fire({
                title: '输入GitHub Token',
                input: 'password',
                inputLabel: '需要GitHub Personal Access Token (需要repo权限)',
                inputPlaceholder: '输入您的GitHub Token',
                inputAttributes: {
                    autocapitalize: 'off'
                },
                showCancelButton: true,
                confirmButtonText: '保存',
                cancelButtonText: '取消',
                backdrop: true,
                allowOutsideClick: false,
                heightAuto: false,
                inputValidator: (value) => {
                    if (!value) {
                        return '请输入Token！';
                    }
                    if (value.length < 10) {
                        return 'Token长度太短，请检查是否正确';
                    }
                    return null;
                }
            });

            if (token) {
                this.setToken(token);
                
                // 测试Token是否有效
                const isValid = await this.testToken(token);
                if (isValid) {
                    Swal.fire({
                        title: 'Token验证成功',
                        text: 'Token已保存并验证通过',
                        icon: 'success',
                        timer: 2000
                    });
                } else {
                    Swal.fire({
                        title: 'Token验证失败',
                        text: 'Token已保存但验证失败，请检查权限',
                        icon: 'warning'
                    });
                }
                return token;
            }
            return null;
        }

        static async testToken(token) {
            try {
                const response = await fetch('https://api.github.com/user', {
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
                
                if (response.ok) {
                    const userData = await response.json();
                    console.log('Token验证成功，用户:', userData.login);
                    return true;
                } else {
                    console.error('Token验证失败，状态码:', response.status);
                    return false;
                }
            } catch (error) {
                console.error('Token验证错误:', error);
                return false;
            }
        }
    }

    // 如果是Tampermonkey页面，添加控制面板
    if (StateManager.isTampermonkeyPage()) {
        addTampermonkeyControlPanel();
    }

    // 在Tampermonkey页面添加控制面板
    function addTampermonkeyControlPanel() {
        // 等待页面加载
        setTimeout(() => {
            // 查找Tampermonkey脚本列表
            const scriptListSelectors = [
                '#scripts',
                '.script_list',
                '.tm-container',
                '.tm-script-list',
                'body'
            ];

            for (const selector of scriptListSelectors) {
                const container = document.querySelector(selector);
                if (container && !document.getElementById('github-tools-control-panel')) {
                    createControlPanel(container);
                    break;
                }
            }
        }, 2000);
    }

    function createControlPanel(container) {
        const panel = document.createElement('div');
        panel.id = 'github-tools-control-panel';
        panel.className = 'tampermonkey-control-panel';
        
        panel.innerHTML = `
            <h3>📁 GitHub批量文件管理工具 v3.8</h3>
            <div class="github-tools-toggle" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #e1e4e8;">
                <span style="font-weight: 600;">脚本启用状态：</span>
                <label class="switch">
                    <input type="checkbox" ${StateManager.getScriptEnabled() ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
            <p><strong>功能说明：</strong></p>
            <ul style="margin: 10px 0 20px 0; padding-left: 20px; color: #586069;">
                <li>删除所有文件（保留目录结构）</li>
                <li>保留结构式删除文件（删除文件并创建.gitignore）</li>
                <li>在所有文件夹中创建.gitignore文件</li>
                <li>上传本地文件和文件夹到仓库</li>
                <li>一键删除存储库（危险操作）</li>
            </ul>
            <div class="github-tools-buttons">
                <button class="github-tool-btn" id="tm-open-github">访问GitHub</button>
                <button class="github-tool-btn settings" id="tm-configure-token">配置GitHub Token</button>
                <button class="github-tool-btn" id="tm-test-connection">测试连接</button>
                <button class="github-tool-btn danger" id="tm-open-panel">打开工具面板</button>
            </div>
            <div style="margin-top: 20px; padding: 10px; background: #f8f9fa; border-radius: 4px; font-size: 12px; color: #6c757d;">
                脚本状态：<span id="tm-status">${StateManager.getScriptEnabled() ? '✅ 已启用' : '❌ 已禁用'}</span>
                <br>
                <small>在GitHub仓库页面会自动显示工具面板</small>
            </div>
        `;

        // 添加到容器
        if (container.id === 'scripts' || container.classList.contains('script_list')) {
            container.insertBefore(panel, container.firstChild);
        } else {
            container.insertAdjacentElement('afterbegin', panel);
        }
        
        // 添加样式
        GM_addStyle(CONFIG.BUTTON_STYLE);

        // 绑定事件
        document.getElementById('tm-open-github').addEventListener('click', () => {
            GM_openInTab('https://github.com', { active: true });
        });

        document.getElementById('tm-configure-token').addEventListener('click', () => {
            showTokenConfig();
        });

        document.getElementById('tm-test-connection').addEventListener('click', () => {
            testGitHubConnection();
        });

        document.getElementById('tm-open-panel').addEventListener('click', () => {
            GM_openInTab('https://github.com', { active: true }).then(() => {
                GM_notification({
                    title: 'GitHub工具',
                    text: '请在GitHub仓库页面使用工具面板',
                    timeout: 3000
                });
            });
        });

        const toggle = panel.querySelector('.switch input');
        toggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            StateManager.setScriptEnabled(enabled);
            document.getElementById('tm-status').textContent = `脚本状态：${enabled ? '✅ 已启用' : '❌ 已禁用'}`;
            if (enabled) {
                GM_notification({
                    title: 'GitHub工具',
                    text: '脚本已启用，请刷新GitHub页面',
                    timeout: 3000
                });
            }
        });
    }

    async function showTokenConfig() {
        const { value: token } = await Swal.fire({
            title: '配置GitHub Token',
            input: 'password',
            inputLabel: 'GitHub Personal Access Token',
            inputPlaceholder: '输入您的GitHub Token',
            inputAttributes: {
                autocapitalize: 'off'
            },
            showCancelButton: true,
            confirmButtonText: '保存',
            cancelButtonText: '取消',
            inputValidator: (value) => {
                if (!value) {
                    return '请输入Token！';
                }
            }
        });

        if (token) {
            GM_setValue(CONFIG.GITHUB_TOKEN_KEY, token);
            GM_notification({
                title: '成功',
                text: 'GitHub Token已保存',
                timeout: 3000
            });
        }
    }

    async function testGitHubConnection() {
        const token = GM_getValue(CONFIG.GITHUB_TOKEN_KEY, '');
        if (!token) {
            GM_notification({
                title: '错误',
                text: '请先配置GitHub Token',
                timeout: 3000
            });
            return;
        }

        try {
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `token ${token}`
                }
            });

            if (response.ok) {
                const user = await response.json();
                GM_notification({
                    title: '连接成功',
                    text: `已连接为：${user.login}`,
                    timeout: 3000
                });
            } else {
                GM_notification({
                    title: '连接失败',
                    text: 'Token无效或网络错误',
                    timeout: 3000
                });
            }
        } catch (error) {
            GM_notification({
                title: '连接失败',
                text: '网络错误或API限制',
                timeout: 3000
            });
        }
    }

    // GitHub页面主逻辑
    if (StateManager.isGitHubPage() && StateManager.getScriptEnabled()) {
        initGitHubScript();
    }

    // GitHub页面主逻辑
    function initGitHubScript() {
        // 增强的API调用器
        class EnhancedGitHubAPI {
            constructor() {
                this.baseUrl = CONFIG.API_BASE;
                this.rateLimitRemaining = null;
                this.rateLimitReset = null;
            }

            async _requestWithRetry(method, endpoint, data = null, retryCount = 0) {
                const token = TokenManager.getToken();
                if (!token) {
                    throw new Error('未设置GitHub Token，请先配置Token');
                }

                return new Promise((resolve, reject) => {
                    const options = {
                        method: method,
                        url: `${this.baseUrl}${endpoint}`,
                        headers: {
                            'Authorization': `token ${token}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json',
                            'User-Agent': 'GitHub-Batch-Tools/3.8'
                        },
                        timeout: 30000,
                        onload: (response) => {
                            console.log(`API响应: ${method} ${endpoint} - 状态: ${response.status}`);
                            
                            // 更新速率限制信息
                            this.updateRateLimitInfo(response);
                            
                            if (response.status === 401) {
                                reject(new Error('Token无效或已过期，请重新配置Token'));
                                return;
                            }
                            
                            if (response.status === 403) {
                                if (response.headers.includes('X-RateLimit-Remaining: 0')) {
                                    const resetTime = new Date(this.rateLimitReset * 1000);
                                    reject(new Error(`API速率限制已达上限，请在 ${resetTime.toLocaleTimeString()} 后重试`));
                                } else {
                                    reject(new Error('权限不足，请检查Token是否具有repo权限'));
                                }
                                return;
                            }
                            
                            if (response.status === 404) {
                                resolve(null);
                                return;
                            }
                            
                            if (response.status >= 200 && response.status < 300) {
                                try {
                                    // 对于DELETE请求，可能返回空响应
                                    if (method === 'DELETE' && response.responseText === '') {
                                        resolve({ success: true });
                                    } else {
                                        const json = JSON.parse(response.responseText);
                                        resolve(json);
                                    }
                                } catch (e) {
                                    console.error('JSON解析错误:', e);
                                    resolve(response.responseText);
                                }
                            } else {
                                // 对于422错误，提供更详细的错误信息
                                if (response.status === 422) {
                                    try {
                                        const errorData = JSON.parse(response.responseText);
                                        let errorMsg = '请求无法处理 (422错误)';
                                        if (errorData.message) {
                                            errorMsg += `: ${errorData.message}`;
                                        }
                                        if (errorData.errors && errorData.errors.length > 0) {
                                            errorMsg += ` - ${errorData.errors.map(e => e.message || e.code).join(', ')}`;
                                        }
                                        reject(new Error(errorMsg));
                                    } catch {
                                        reject(new Error(`请求无法处理 (422错误): ${response.responseText}`));
                                    }
                                    return;
                                }
                                
                                // 重试逻辑
                                if (retryCount < CONFIG.MAX_RETRIES) {
                                    console.log(`请求失败，第${retryCount + 1}次重试...`);
                                    setTimeout(() => {
                                        this._requestWithRetry(method, endpoint, data, retryCount + 1)
                                            .then(resolve)
                                            .catch(reject);
                                    }, CONFIG.RETRY_DELAY * (retryCount + 1));
                                } else {
                                    reject(new Error(`API请求失败: ${response.status} - ${response.statusText}`));
                                }
                            }
                        },
                        onerror: (error) => {
                            console.error('API请求错误:', error);
                            if (retryCount < CONFIG.MAX_RETRIES) {
                                console.log(`网络错误，第${retryCount + 1}次重试...`);
                                setTimeout(() => {
                                    this._requestWithRetry(method, endpoint, data, retryCount + 1)
                                        .then(resolve)
                                        .catch(reject);
                                }, CONFIG.RETRY_DELAY * (retryCount + 1));
                            } else {
                                reject(new Error(`网络错误: ${error.error}`));
                            }
                        },
                        ontimeout: () => {
                            console.error('API请求超时');
                            if (retryCount < CONFIG.MAX_RETRIES) {
                                console.log(`请求超时，第${retryCount + 1}次重试...`);
                                setTimeout(() => {
                                    this._requestWithRetry(method, endpoint, data, retryCount + 1)
                                        .then(resolve)
                                        .catch(reject);
                                }, CONFIG.RETRY_DELAY * (retryCount + 1));
                            } else {
                                reject(new Error('API请求超时，请检查网络连接'));
                            }
                        }
                    };
                    
                    // 对于DELETE请求，需要特殊处理数据
                    if (method === 'DELETE' && data) {
                        options.data = JSON.stringify(data);
                    } else if (data) {
                        options.data = JSON.stringify(data);
                    }
                    
                    GM_xmlhttpRequest(options);
                });
            }

            updateRateLimitInfo(response) {
                const remaining = response.responseHeaders.match(/X-RateLimit-Remaining: (\d+)/i);
                const reset = response.responseHeaders.match(/X-RateLimit-Reset: (\d+)/i);
                
                if (remaining) {
                    this.rateLimitRemaining = parseInt(remaining[1], 10);
                    console.log(`API剩余请求次数: ${this.rateLimitRemaining}`);
                }
                if (reset) {
                    this.rateLimitReset = parseInt(reset[1], 10);
                }
            }

            get(endpoint) {
                return this._requestWithRetry('GET', endpoint);
            }

            delete(endpoint, data = null) {
                return this._requestWithRetry('DELETE', endpoint, data);
            }

            put(endpoint, data) {
                return this._requestWithRetry('PUT', endpoint, data);
            }

            // 新增：检查文件是否存在
            async checkFileExists(filePath) {
                try {
                    const encodedPath = encodeURIComponent(filePath);
                    const endpoint = `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/contents/${encodedPath}`;
                    const result = await this.get(endpoint);
                    return result ? result.sha : null;
                } catch (error) {
                    if (error.message.includes('404')) {
                        return null;
                    }
                    throw error;
                }
            }

            // 新增：创建或更新文件
            async createOrUpdateFile(filePath, content, sha = null, message = null) {
                const encodedPath = encodeURIComponent(filePath);
                const endpoint = `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/contents/${encodedPath}`;
                
                const requestData = {
                    message: message || `上传文件: ${filePath} (由 GitHub 批量工具执行)`,
                    content: content,
                    branch: this.branch
                };
                
                if (sha) {
                    requestData.sha = sha;
                }
                
                return await this.put(endpoint, requestData);
            }

            // 新增：删除存储库
            async deleteRepository(owner, repo) {
                const endpoint = `/repos/${owner}/${repo}`;
                console.log(`准备删除存储库: ${owner}/${repo}`);
                return await this.delete(endpoint);
            }

            // 新增：获取存储库信息
            async getRepositoryInfo(owner, repo) {
                const endpoint = `/repos/${owner}/${repo}`;
                return await this.get(endpoint);
            }
        }

        // 仓库信息提取
        class RepoInfo {
            static getCurrentRepo() {
                const path = window.location.pathname;
                const parts = path.split('/').filter(p => p);
                
                if (parts.length >= 2) {
                    return {
                        owner: parts[0],
                        repo: parts[1],
                        isRepoPage: true
                    };
                }
                return { isRepoPage: false };
            }

            static getCurrentBranch() {
                // 尝试从URL获取分支信息
                const pathParts = window.location.pathname.split('/');
                if (pathParts.length > 4 && pathParts[3] === 'tree') {
                    return decodeURIComponent(pathParts.slice(4).join('/'));
                }
                
                // 尝试从页面元素获取
                const branchElements = [
                    document.querySelector('[data-hotkey="w"] .css-truncate-target'),
                    document.querySelector('#branch-select-menu summary span'),
                    document.querySelector('.commit-ref'),
                    document.querySelector('[data-branch-name]'),
                    document.querySelector('.branch-name')
                ];
                
                for (const element of branchElements) {
                    if (element) {
                        const text = element.textContent.trim();
                        if (text && !text.includes('...') && text.length < 100) {
                            return text;
                        }
                    }
                }
                
                // 从URL参数获取
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.has('branch')) {
                    return urlParams.get('branch');
                }
                
                return 'main';
            }
        }

        // 改进的文件上传管理器
        class ImprovedFileUploadManager {
            constructor(api, repoInfo, branch) {
                this.api = api;
                this.repoInfo = repoInfo;
                this.branch = branch;
                this.api.repoInfo = repoInfo;
                this.api.branch = branch;
                this.files = [];
                this.uploadQueue = [];
                this.conflictStrategy = 'ask'; // ask, overwrite, skip, rename
                this.renamePattern = '{name}_{timestamp}{ext}';
            }

            // 选择文件和文件夹
            async selectFilesAndFolders() {
                return new Promise((resolve) => {
                    // 创建文件选择input
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.multiple = true;
                    fileInput.id = 'multi-file-input';
                    fileInput.style.display = 'none';
                    
                    // 添加到页面
                    document.body.appendChild(fileInput);
                    
                    fileInput.addEventListener('change', (e) => {
                        const selectedFiles = Array.from(e.target.files);
                        this.processSelectedFiles(selectedFiles);
                        resolve(selectedFiles);
                        // 清理
                        document.body.removeChild(fileInput);
                    });
                    
                    // 触发点击
                    fileInput.click();
                });
            }

            // 选择文件夹
            async selectFolders() {
                return new Promise((resolve) => {
                    // 创建文件夹选择input
                    const folderInput = document.createElement('input');
                    folderInput.type = 'file';
                    folderInput.webkitdirectory = true;
                    folderInput.multiple = true;
                    folderInput.id = 'folder-input';
                    folderInput.style.display = 'none';
                    
                    // 添加到页面
                    document.body.appendChild(folderInput);
                    
                    folderInput.addEventListener('change', (e) => {
                        const selectedFiles = Array.from(e.target.files);
                        this.processSelectedFiles(selectedFiles);
                        resolve(selectedFiles);
                        // 清理
                        document.body.removeChild(folderInput);
                    });
                    
                    // 触发点击
                    folderInput.click();
                });
            }

            // 处理选中的文件
            processSelectedFiles(files) {
                const newFiles = [];
                
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    
                    // 检查文件大小
                    if (file.size > CONFIG.MAX_FILE_SIZE) {
                        console.warn(`文件 ${file.name} 超过 ${CONFIG.MAX_FILE_SIZE / (1024*1024)}MB 限制，跳过`);
                        continue;
                    }
                    
                    // 获取文件路径
                    const path = file.webkitRelativePath || file.name;
                    
                    newFiles.push({
                        file: file,
                        name: file.name,
                        size: file.size,
                        type: file.type,
                        relativePath: path,
                        lastModified: file.lastModified,
                        status: 'pending'
                    });
                }
                
                this.files.push(...newFiles);
                console.log(`添加了 ${newFiles.length} 个新文件，总计 ${this.files.length} 个文件`);
            }

            // 处理拖放的文件和文件夹
            async handleDropItems(items) {
                const newFiles = [];
                
                for (let i = 0; i < items.length; i++) {
                    const item = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : items[i];
                    
                    if (item) {
                        const files = await this.getFolderFiles(item);
                        for (const fileInfo of files) {
                            if (fileInfo.size > CONFIG.MAX_FILE_SIZE) {
                                console.warn(`文件 ${fileInfo.name} 超过 ${CONFIG.MAX_FILE_SIZE / (1024*1024)}MB 限制，跳过`);
                                continue;
                            }
                            
                            newFiles.push({
                                file: fileInfo.file,
                                name: fileInfo.name,
                                size: fileInfo.size,
                                type: fileInfo.type,
                                relativePath: fileInfo.relativePath,
                                lastModified: fileInfo.lastModified,
                                status: 'pending'
                            });
                        }
                    }
                }
                
                this.files.push(...newFiles);
                console.log(`通过拖放添加了 ${newFiles.length} 个文件，总计 ${this.files.length} 个文件`);
            }

            // 递归获取文件夹中的所有文件
            async getFolderFiles(entry, basePath = '') {
                const files = [];
                
                if (entry.isFile) {
                    return new Promise((resolve) => {
                        entry.file((file) => {
                            const fileWithPath = {
                                file: file,
                                name: file.name,
                                size: file.size,
                                type: file.type,
                                relativePath: basePath ? `${basePath}/${file.name}` : file.name,
                                lastModified: file.lastModified
                            };
                            resolve([fileWithPath]);
                        });
                    });
                } else if (entry.isDirectory) {
                    const reader = entry.createReader();
                    const entries = await new Promise((resolve) => {
                        reader.readEntries(resolve);
                    });
                    
                    const subfolderFiles = [];
                    for (const subEntry of entries) {
                        const subPath = basePath ? `${basePath}/${subEntry.name}` : subEntry.name;
                        const subFiles = await this.getFolderFiles(subEntry, subPath);
                        subfolderFiles.push(...subFiles);
                    }
                    
                    return subfolderFiles;
                }
                
                return files;
            }

            // 获取文件统计信息
            getFileStats() {
                const stats = {
                    totalFiles: this.files.length,
                    totalSize: 0,
                    fileTypes: {},
                    folders: 0
                };
                
                const uniqueFolders = new Set();
                
                this.files.forEach(file => {
                    stats.totalSize += file.size;
                    
                    // 获取文件扩展名
                    const ext = file.name.split('.').pop().toLowerCase();
                    stats.fileTypes[ext] = (stats.fileTypes[ext] || 0) + 1;
                    
                    // 统计文件夹
                    const folderPath = file.relativePath.includes('/') ? 
                        file.relativePath.substring(0, file.relativePath.lastIndexOf('/')) : 
                        '';
                    if (folderPath) {
                        uniqueFolders.add(folderPath);
                    }
                });
                
                stats.folders = uniqueFolders.size;
                
                return stats;
            }

            // 格式化文件大小
            formatFileSize(bytes) {
                if (bytes === 0) return '0 B';
                const k = 1024;
                const sizes = ['B', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
            }

            // 读取文件内容为Base64
            readFileAsBase64(file) {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const content = e.target.result;
                        // 移除 data URL 前缀
                        const base64 = content.split(',')[1];
                        resolve(base64);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            }

            // 检查文件冲突
            async checkConflicts() {
                const conflicts = [];
                
                for (const fileInfo of this.files) {
                    const filePath = fileInfo.relativePath;
                    const existingSha = await this.api.checkFileExists(filePath);
                    
                    if (existingSha) {
                        conflicts.push({
                            fileInfo: fileInfo,
                            existingSha: existingSha,
                            path: filePath
                        });
                    }
                }
                
                return conflicts;
            }

            // 处理冲突
            async handleConflicts(conflicts) {
                if (conflicts.length === 0) {
                    return { strategy: 'overwrite', renameFiles: [] };
                }
                
                const conflictListHtml = conflicts.slice(0, 10).map((conflict, index) => {
                    return `<div>${index + 1}. ${conflict.path}</div>`;
                }).join('');
                
                const moreCount = conflicts.length > 10 ? conflicts.length - 10 : 0;
                
                const { value: strategy } = await Swal.fire({
                    title: '发现文件冲突',
                    html: `
                        <div style="text-align: left;">
                            <p>发现 <strong>${conflicts.length}</strong> 个文件与仓库中现有文件冲突。</p>
                            ${conflicts.length <= 10 ? 
                                `<div style="max-height: 200px; overflow-y: auto; margin: 10px 0; padding: 10px; background: #f6f8fa; border-radius: 4px;">
                                    ${conflictListHtml}
                                </div>` :
                                `<p>显示前10个冲突文件...</p>`
                            }
                            ${moreCount > 0 ? `<p>... 还有 ${moreCount} 个文件</p>` : ''}
                            <div class="file-conflict-options">
                                <p><strong>请选择处理方式：</strong></p>
                                <div class="conflict-option">
                                    <input type="radio" id="overwrite" name="conflict-strategy" value="overwrite" checked>
                                    <label for="overwrite">覆盖现有文件</label>
                                </div>
                                <div class="conflict-option">
                                    <input type="radio" id="skip" name="conflict-strategy" value="skip">
                                    <label for="skip">跳过这些文件</label>
                                </div>
                                <div class="conflict-option">
                                    <input type="radio" id="rename" name="conflict-strategy" value="rename">
                                    <label for="rename">重命名新文件</label>
                                </div>
                                <div class="conflict-option">
                                    <input type="radio" id="ask" name="conflict-strategy" value="ask">
                                    <label for="ask">逐个询问</label>
                                </div>
                            </div>
                        </div>
                    `,
                    showCancelButton: true,
                    confirmButtonText: '继续',
                    cancelButtonText: '取消上传',
                    input: 'radio',
                    inputOptions: {
                        'overwrite': '覆盖现有文件',
                        'skip': '跳过这些文件',
                        'rename': '重命名新文件',
                        'ask': '逐个询问'
                    },
                    inputValue: 'overwrite',
                    inputValidator: (value) => {
                        if (!value) {
                            return '请选择一个处理方式';
                        }
                        return null;
                    }
                });
                
                if (!strategy) {
                    throw new Error('用户取消上传');
                }
                
                this.conflictStrategy = strategy;
                
                // 如果需要重命名，生成新的文件名
                const renameFiles = [];
                if (strategy === 'rename') {
                    for (const conflict of conflicts) {
                        const originalName = conflict.fileInfo.name;
                        const extIndex = originalName.lastIndexOf('.');
                        const name = extIndex > 0 ? originalName.substring(0, extIndex) : originalName;
                        const ext = extIndex > 0 ? originalName.substring(extIndex) : '';
                        const timestamp = new Date().getTime();
                        
                        const newName = `${name}_${timestamp}${ext}`;
                        const newPath = conflict.path.replace(originalName, newName);
                        
                        renameFiles.push({
                            originalPath: conflict.path,
                            newPath: newPath,
                            fileInfo: conflict.fileInfo
                        });
                        
                        conflict.fileInfo.relativePath = newPath;
                        conflict.fileInfo.newName = newName;
                    }
                }
                
                return { strategy, renameFiles };
            }

            // 逐个处理冲突文件
            async handleIndividualConflicts(conflicts) {
                const results = {
                    overwrite: [],
                    skip: [],
                    rename: []
                };
                
                for (let i = 0; i < conflicts.length; i++) {
                    const conflict = conflicts[i];
                    
                    const { value: action } = await Swal.fire({
                        title: `文件冲突 (${i + 1}/${conflicts.length})`,
                        html: `
                            <div style="text-align: left;">
                                <p><strong>文件:</strong> ${conflict.path}</p>
                                <p>仓库中已存在同名文件。</p>
                            </div>
                        `,
                        showCancelButton: true,
                        showDenyButton: true,
                        confirmButtonText: '覆盖',
                        denyButtonText: '重命名',
                        cancelButtonText: '跳过'
                    });
                    
                    if (action === 'confirm') {
                        // 覆盖
                        results.overwrite.push(conflict);
                    } else if (action === 'deny') {
                        // 重命名
                        const { value: newName } = await Swal.fire({
                            title: '重命名文件',
                            input: 'text',
                            inputLabel: '输入新的文件名',
                            inputValue: conflict.fileInfo.name,
                            showCancelButton: true,
                            confirmButtonText: '确定',
                            cancelButtonText: '取消'
                        });
                        
                        if (newName) {
                            const newPath = conflict.path.replace(conflict.fileInfo.name, newName);
                            conflict.fileInfo.relativePath = newPath;
                            conflict.fileInfo.newName = newName;
                            results.rename.push(conflict);
                        } else {
                            results.skip.push(conflict);
                        }
                    } else {
                        // 跳过
                        results.skip.push(conflict);
                    }
                }
                
                return results;
            }

            // 上传单个文件
            async uploadFile(fileInfo, retryCount = 0) {
                try {
                    // 检查文件是否存在以获取SHA
                    const existingSha = await this.api.checkFileExists(fileInfo.relativePath);
                    
                    // 读取文件内容
                    const base64Content = await this.readFileAsBase64(fileInfo.file);
                    
                    // 构建提交消息
                    const message = fileInfo.newName ? 
                        `上传文件: ${fileInfo.newName} (重命名自 ${fileInfo.name})` :
                        `上传文件: ${fileInfo.name}`;
                    
                    // 创建或更新文件
                    const result = await this.api.createOrUpdateFile(
                        fileInfo.relativePath,
                        base64Content,
                        existingSha,
                        message
                    );
                    
                    fileInfo.status = 'success';
                    fileInfo.sha = result.content.sha;
                    
                    return {
                        success: true,
                        file: fileInfo.relativePath,
                        action: existingSha ? 'updated' : 'created'
                    };
                } catch (error) {
                    console.error(`上传文件失败 ${fileInfo.relativePath}:`, error);
                    
                    // 重试逻辑
                    if (retryCount < CONFIG.MAX_RETRIES) {
                        console.log(`重试上传 ${fileInfo.relativePath} (第${retryCount + 1}次)...`);
                        await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY * (retryCount + 1)));
                        return this.uploadFile(fileInfo, retryCount + 1);
                    }
                    
                    fileInfo.status = 'error';
                    fileInfo.error = error.message;
                    
                    return {
                        success: false,
                        file: fileInfo.relativePath,
                        error: error.message
                    };
                }
            }

            // 批量上传文件
            async uploadFiles() {
                try {
                    // 检查冲突
                    const conflicts = await this.checkConflicts();
                    
                    // 处理冲突
                    let conflictResolution = { strategy: 'overwrite', renameFiles: [] };
                    
                    if (conflicts.length > 0) {
                        if (this.conflictStrategy === 'ask') {
                            const individualResults = await this.handleIndividualConflicts(conflicts);
                            
                            // 根据用户选择更新文件状态
                            for (const conflict of individualResults.skip) {
                                conflict.fileInfo.status = 'skipped';
                                conflict.fileInfo.skipReason = '用户选择跳过';
                            }
                        } else {
                            conflictResolution = await this.handleConflicts(conflicts);
                            
                            // 根据策略更新文件状态
                            if (conflictResolution.strategy === 'skip') {
                                for (const conflict of conflicts) {
                                    conflict.fileInfo.status = 'skipped';
                                    conflict.fileInfo.skipReason = '批量跳过冲突文件';
                                }
                            }
                        }
                    }
                    
                    // 准备上传队列
                    this.uploadQueue = this.files.filter(file => file.status === 'pending');
                    
                    let successCount = 0;
                    let failCount = 0;
                    let skipCount = 0;
                    const results = [];
                    
                    // 分批上传文件
                    for (let i = 0; i < this.uploadQueue.length; i += CONFIG.UPLOAD_CHUNK_SIZE) {
                        const chunk = this.uploadQueue.slice(i, i + CONFIG.UPLOAD_CHUNK_SIZE);
                        
                        // 并行上传每个块中的文件
                        const chunkPromises = chunk.map(async (fileInfo, index) => {
                            if (fileInfo.status === 'skipped') {
                                skipCount++;
                                return { 
                                    success: false, 
                                    file: fileInfo.relativePath, 
                                    action: 'skipped',
                                    reason: fileInfo.skipReason 
                                };
                            }
                            
                            const result = await this.uploadFile(fileInfo);
                            return result;
                        });
                        
                        const chunkResults = await Promise.all(chunkPromises);
                        results.push(...chunkResults);
                        
                        // 统计结果
                        chunkResults.forEach(result => {
                            if (result.success) {
                                successCount++;
                            } else if (result.action === 'skipped') {
                                skipCount++;
                            } else {
                                failCount++;
                            }
                        });
                        
                        // 更新进度
                        const progress = Math.round(((i + chunk.length) / this.uploadQueue.length) * 100);
                        if (typeof this.onProgress === 'function') {
                            this.onProgress(progress, `已上传 ${i + chunk.length}/${this.uploadQueue.length} 个文件`);
                        }
                        
                        // 避免速率限制
                        if (i + CONFIG.UPLOAD_CHUNK_SIZE < this.uploadQueue.length) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                    
                    return {
                        success: true,
                        total: this.files.length,
                        uploaded: successCount,
                        failed: failCount,
                        skipped: skipCount,
                        results: results
                    };
                } catch (error) {
                    console.error('上传文件失败:', error);
                    return {
                        success: false,
                        error: error.message,
                        total: this.files.length,
                        uploaded: 0,
                        failed: 0,
                        skipped: 0,
                        results: []
                    };
                }
            }
        }

        // 修复的文件操作类
        class FixedFileOperations {
            constructor(api) {
                this.api = api;
                this.repoInfo = RepoInfo.getCurrentRepo();
                this.branch = RepoInfo.getCurrentBranch();
            }

            // 修复的获取所有文件方法
            async getAllFiles(path = '', allFiles = []) {
                try {
                    console.log(`获取文件列表: ${path || '根目录'} (分支: ${this.branch})`);
                    
                    // 构建带分支参数的URL
                    let endpoint = `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/contents/${path || ''}`;
                    const params = new URLSearchParams();
                    if (this.branch) {
                        params.append('ref', this.branch);
                    }
                    
                    const queryString = params.toString();
                    if (queryString) {
                        endpoint += `?${queryString}`;
                    }
                    
                    const contents = await this.api.get(endpoint);
                    
                    if (!contents || !Array.isArray(contents)) {
                        console.warn(`路径 ${path} 下无内容或不是目录`);
                        return allFiles;
                    }
                    
                    const files = [];
                    const directories = [];
                    
                    // 分离文件和目录
                    for (const item of contents) {
                        if (item.type === 'file') {
                            // 验证必要的字段
                            if (!item.sha) {
                                console.warn(`文件 ${item.path} 缺少 SHA 值，跳过`);
                                continue;
                            }
                            files.push(item);
                            console.log(`找到文件: ${item.path}, SHA: ${item.sha.substring(0, 8)}...`);
                        } else if (item.type === 'dir') {
                            directories.push(item);
                        }
                    }
                    
                    allFiles.push(...files);
                    
                    // 递归处理子目录
                    for (let i = 0; i < directories.length; i++) {
                        const dir = directories[i];
                        await this.getAllFiles(dir.path, allFiles);
                        
                        // 避免速率限制
                        if (i < directories.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 300));
                        }
                    }
                    
                    console.log(`总计找到 ${allFiles.length} 个文件`);
                    return allFiles;
                } catch (error) {
                    console.error(`获取文件列表失败 (路径: ${path}):`, error);
                    throw error;
                }
            }

            // 修复的获取所有目录方法
            async getAllDirectories(path = '', allDirs = [], includeRoot = true) {
                try {
                    console.log(`获取目录列表: ${path || '根目录'} (分支: ${this.branch})`);
                    
                    let endpoint = `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/contents/${path || ''}`;
                    const params = new URLSearchParams();
                    if (this.branch) {
                        params.append('ref', this.branch);
                    }
                    
                    const queryString = params.toString();
                    if (queryString) {
                        endpoint += `?${queryString}`;
                    }
                    
                    const contents = await this.api.get(endpoint);
                    
                    if (!contents || !Array.isArray(contents)) {
                        return allDirs;
                    }
                    
                    // 添加根目录（如果需要）
                    if (includeRoot && path === '') {
                        allDirs.push({ path: '', name: '根目录', type: 'dir' });
                    }
                    
                    const directories = [];
                    
                    for (const item of contents) {
                        if (item.type === 'dir') {
                            directories.push(item);
                        }
                    }
                    
                    allDirs.push(...directories);
                    
                    // 递归处理子目录
                    for (let i = 0; i < directories.length; i++) {
                        const dir = directories[i];
                        await this.getAllDirectories(dir.path, allDirs, false);
                        
                        // 避免速率限制
                        if (i < directories.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 300));
                        }
                    }
                    
                    console.log(`总计找到 ${allDirs.length} 个目录`);
                    return allDirs;
                } catch (error) {
                    console.error(`获取目录列表失败 (路径: ${path}):`, error);
                    throw error;
                }
            }

            // 修复的删除文件方法 - 解决422错误
            async deleteFile(file) {
                try {
                    console.log(`删除文件: ${file.path}, 使用 SHA: ${file.sha ? file.sha.substring(0, 8) + '...' : '未知'}`);
                    
                    if (!file.sha) {
                        console.error(`文件 ${file.path} 缺少 SHA 值，无法删除`);
                        return { 
                            success: false, 
                            file: file.path, 
                            error: '文件缺少 SHA 值，无法删除。请重新扫描文件列表。' 
                        };
                    }
                    
                    // 编码文件路径
                    const encodedPath = encodeURIComponent(file.path);
                    const endpoint = `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/contents/${encodedPath}`;
                    
                    // 构建删除请求数据 - 这是关键，必须包含正确的SHA
                    const requestData = {
                        message: `删除文件: ${file.name} (由 GitHub 批量工具执行)`,
                        sha: file.sha,
                        branch: this.branch
                    };
                    
                    console.log('删除请求数据:', JSON.stringify(requestData, null, 2));
                    
                    // 注意：DELETE请求也需要发送请求体数据
                    const result = await this.api.delete(endpoint, requestData);
                    
                    console.log(`文件删除成功: ${file.path}`);
                    return { success: true, file: file.path };
                } catch (error) {
                    console.error(`删除文件失败 ${file.path}:`, error);
                    
                    // 专门处理422错误
                    if (error.message.includes('422')) {
                        console.error(`删除失败 (422): 文件 ${file.path} 的 SHA 值可能已过期或不正确`);
                        return { 
                            success: false, 
                            file: file.path, 
                            error: `SHA 值不匹配 (422错误)。可能是文件已被修改或SHA不正确。原始错误: ${error.message}` 
                        };
                    }
                    
                    return { 
                        success: false, 
                        file: file.path, 
                        error: error.message 
                    };
                }
            }

            // 修复的创建.gitignore文件方法
            async createGitignoreFile(directory) {
                try {
                    const dirPath = directory.path || '';
                    const gitignorePath = dirPath ? `${dirPath}/.gitignore` : '.gitignore';
                    
                    console.log(`检查.gitignore是否存在: ${gitignorePath}`);
                    
                    // 检查是否已存在.gitignore文件
                    const checkEndpoint = `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/contents/${encodeURIComponent(gitignorePath)}`;
                    const params = new URLSearchParams();
                    if (this.branch) {
                        params.append('ref', this.branch);
                    }
                    
                    const queryString = params.toString();
                    const fullCheckEndpoint = queryString ? `${checkEndpoint}?${queryString}` : checkEndpoint;
                    
                    try {
                        const existing = await this.api.get(fullCheckEndpoint);
                        if (existing) {
                            console.log(`.gitignore已存在: ${gitignorePath}`);
                            return { skipped: true, path: dirPath || '根目录' };
                        }
                    } catch (error) {
                        // 404错误表示文件不存在，可以继续创建
                        if (!error.message.includes('404')) {
                            throw error;
                        }
                    }
                    
                    console.log(`创建.gitignore: ${gitignorePath}`);
                    
                    // 创建.gitignore文件
                    const endpoint = `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/contents/${encodeURIComponent(gitignorePath)}`;
                    
                    const gitignoreContent = `# 自动生成的.gitignore文件
# 创建时间: ${new Date().toLocaleString()}
# 由 GitHub 批量工具生成

# 此文件用于保留空文件夹的Git目录结构
# 当文件夹中的所有文件被删除后，Git会忽略空文件夹
# 这个.gitignore文件确保文件夹被Git跟踪并保留结构

# 文件夹已清空，保留目录结构
`;

                    const content = btoa(unescape(encodeURIComponent(gitignoreContent)));
                    
                    const requestData = {
                        message: `添加.gitignore文件到 ${dirPath || '根目录'} (保留目录结构)`,
                        content: content,
                        branch: this.branch
                    };
                    
                    const result = await this.api.put(endpoint, requestData);
                    console.log(`.gitignore创建成功: ${gitignorePath}`);
                    return { success: true, path: dirPath || '根目录' };
                } catch (error) {
                    console.error(`创建.gitignore失败 ${directory.path || '根目录'}:`, error);
                    return { 
                        success: false, 
                        path: directory.path || '根目录', 
                        error: error.message 
                    };
                }
            }

            // 新功能：删除文件并保留结构（两步操作合并）
            async deleteFilesAndKeepStructure() {
                try {
                    console.log('开始删除文件并保留结构操作');
                    
                    // 第一步：获取所有文件
                    const files = await this.getAllFiles();
                    
                    if (files.length === 0) {
                        return { 
                            success: false, 
                            message: '仓库中没有文件可删除',
                            filesDeleted: 0,
                            gitignoreCreated: 0,
                            gitignoreSkipped: 0
                        };
                    }
                    
                    let filesDeleted = 0;
                    let filesFailed = 0;
                    const failedFiles = [];
                    
                    // 第二步：删除所有文件
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        const result = await this.deleteFile(file);
                        
                        if (result.success) {
                            filesDeleted++;
                        } else {
                            filesFailed++;
                            failedFiles.push({
                                path: file.path,
                                error: result.error
                            });
                        }
                        
                        // 避免速率限制
                        if ((i + 1) % 3 === 0 && i < files.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 800));
                        }
                    }
                    
                    // 第三步：获取所有目录并创建.gitignore文件
                    const directories = await this.getAllDirectories();
                    
                    let gitignoreCreated = 0;
                    let gitignoreSkipped = 0;
                    let gitignoreFailed = 0;
                    const failedGitignores = [];
                    
                    for (let i = 0; i < directories.length; i++) {
                        const dir = directories[i];
                        const result = await this.createGitignoreFile(dir);
                        
                        if (result.success) {
                            gitignoreCreated++;
                        } else if (result.skipped) {
                            gitignoreSkipped++;
                        } else {
                            gitignoreFailed++;
                            failedGitignores.push({
                                path: dir.path || '根目录',
                                error: result.error
                            });
                        }
                        
                        // 避免速率限制
                        if ((i + 1) % 2 === 0 && i < directories.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                    
                    return {
                        success: true,
                        message: '删除文件并保留结构操作完成',
                        filesDeleted,
                        filesFailed,
                        gitignoreCreated,
                        gitignoreSkipped,
                        gitignoreFailed,
                        failedFiles,
                        failedGitignores
                    };
                    
                } catch (error) {
                    console.error('删除文件并保留结构操作失败:', error);
                    return {
                        success: false,
                        message: `操作失败: ${error.message}`,
                        filesDeleted: 0,
                        filesFailed: 0,
                        gitignoreCreated: 0,
                        gitignoreSkipped: 0,
                        gitignoreFailed: 0,
                        failedFiles: [],
                        failedGitignores: []
                    };
                }
            }

            // 新增：获取上传管理器
            getUploadManager() {
                return new ImprovedFileUploadManager(this.api, this.repoInfo, this.branch);
            }
        }

        // 改进的GitHub页面UI管理
        class ImprovedGitHubUIManager {
            constructor() {
                this.api = new EnhancedGitHubAPI();
                this.repoInfo = RepoInfo.getCurrentRepo();
                this.operations = new FixedFileOperations(this.api);
                this.uploadManager = null;
                this.isProcessing = false;
                this.currentOperation = null;
                this.init();
            }

            init() {
                GM_addStyle(CONFIG.BUTTON_STYLE);
                this.createFloatingPanel();
                this.addGlobalHotkey();
                this.initializeToken();
            }

            async initializeToken() {
                const token = TokenManager.getToken();
                if (!token) {
                    // 延迟提示，避免干扰页面加载
                    setTimeout(async () => {
                        const result = await Swal.fire({
                            title: '需要GitHub Token',
                            text: '首次使用需要配置GitHub Personal Access Token',
                            icon: 'info',
                            showCancelButton: true,
                            confirmButtonText: '立即配置',
                            cancelButtonText: '稍后再说'
                        });
                        
                        if (result.isConfirmed) {
                            await TokenManager.requestToken();
                        }
                    }, 3000);
                }
            }

            createFloatingPanel() {
                // 移除已存在的面板
                const existing = document.getElementById('github-tools-floating');
                if (existing) existing.remove();

                const panel = document.createElement('div');
                panel.id = 'github-tools-floating';
                panel.className = 'github-tools-floating';
                
                const repoName = this.repoInfo.isRepoPage ? 
                    `${this.repoInfo.owner}/${this.repoInfo.repo}` : 
                    '未在仓库页面';
                
                panel.innerHTML = `
                    <div class="github-tools-header">
                        <span>📁 GitHub批量工具 v3.8</span>
                        <button class="close-btn" title="最小化">−</button>
                    </div>
                    <div class="github-tools-body">
                        <div class="github-tools-section">
                            <div class="github-tools-section-title">仓库信息</div>
                            <div style="font-size: 12px; color: #24292e; margin-bottom: 10px; word-break: break-all;">
                                ${repoName}<br>
                                <small>分支: ${RepoInfo.getCurrentBranch()}</small>
                            </div>
                        </div>
                        <div class="github-tools-section">
                            <div class="github-tools-section-title">批量操作</div>
                            <div class="github-tools-buttons">
                                <div class="github-tools-buttons-row">
                                    <button class="github-tool-btn danger" id="github-delete-files-btn" style="flex: 1;" ${!this.repoInfo.isRepoPage ? 'disabled' : ''}>
                                        🗑️ 删除所有文件
                                    </button>
                                </div>
                                <div class="github-tools-buttons-row">
                                    <button class="github-tool-btn warning" id="github-delete-keep-structure-btn" style="flex: 1;" ${!this.repoInfo.isRepoPage ? 'disabled' : ''}>
                                        🗑️📄 保留结构式删除
                                    </button>
                                </div>
                                <div class="github-tools-buttons-row">
                                    <button class="github-tool-btn primary" id="github-upload-files-btn" style="flex: 1;" ${!this.repoInfo.isRepoPage ? 'disabled' : ''}>
                                        📤 上传文件/文件夹
                                    </button>
                                </div>
                                <div class="github-tools-buttons-row">
                                    <button class="github-tool-btn" id="github-create-gitignore-btn" style="flex: 1;" ${!this.repoInfo.isRepoPage ? 'disabled' : ''}>
                                        📄 创建.gitignore
                                    </button>
                                </div>
                            </div>
                            <div id="progress-container" class="progress-container" style="display: none;">
                                <div id="progress-bar" class="progress-bar" style="width: 0%;"></div>
                            </div>
                            <div id="status-text" class="status-text" style="display: none;"></div>
                        </div>
                        <div class="github-tools-section">
                            <div class="github-tools-section-title">设置与工具</div>
                            <div class="github-tools-buttons">
                                <button class="github-tool-btn settings" id="github-settings-btn" style="flex: 1;">
                                    ⚙️ Token设置
                                </button>
                                <button class="github-tool-btn settings" id="github-test-api-btn" style="flex: 1;">
                                    🔍 测试连接
                                </button>
                            </div>
                        </div>
                        <div class="danger-zone">
                            <h3>⚠️ 危险操作区域</h3>
                            <div class="danger-note">
                                <p><strong>警告：以下操作不可撤销！</strong></p>
                                <p>删除存储库将会：</p>
                                <ul>
                                    <li>永久删除仓库中的所有文件、提交历史和问题</li>
                                    <li>删除所有分支、标签和发布版本</li>
                                    <li>无法恢复删除的仓库</li>
                                </ul>
                            </div>
                            <div class="github-tools-buttons">
                                <button class="github-tool-btn dark-danger" id="github-delete-repo-btn" style="flex: 1;" ${!this.repoInfo.isRepoPage ? 'disabled' : ''}>
                                    🗑️ 删除存储库
                                </button>
                            </div>
                        </div>
                    </div>
                `;

                document.body.appendChild(panel);

                // 绑定事件 - 使用事件委托确保按钮点击有效
                this.bindPanelEvents(panel);
                
                // 拖拽功能
                this.makeDraggable(panel);
            }

            bindPanelEvents(panel) {
                const closeBtn = panel.querySelector('.close-btn');
                
                // 关闭/最小化按钮
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
                    closeBtn.textContent = panel.style.display === 'none' ? '+' : '−';
                });

                // 使用事件委托绑定按钮点击
                panel.addEventListener('click', (e) => {
                    const target = e.target;
                    
                    // 检查点击的是否是我们的按钮
                    if (target.id === 'github-delete-files-btn' || target.closest('#github-delete-files-btn')) {
                        e.preventDefault();
                        e.stopPropagation();
                        this.handleDeleteFiles();
                    } else if (target.id === 'github-delete-keep-structure-btn' || target.closest('#github-delete-keep-structure-btn')) {
                        e.preventDefault();
                        e.stopPropagation();
                        this.handleDeleteAndKeepStructure();
                    } else if (target.id === 'github-upload-files-btn' || target.closest('#github-upload-files-btn')) {
                        e.preventDefault();
                        e.stopPropagation();
                        this.handleUploadFiles();
                    } else if (target.id === 'github-create-gitignore-btn' || target.closest('#github-create-gitignore-btn')) {
                        e.preventDefault();
                        e.stopPropagation();
                        this.handleCreateGitignore();
                    } else if (target.id === 'github-settings-btn' || target.closest('#github-settings-btn')) {
                        e.preventDefault();
                        e.stopPropagation();
                        this.showSettings();
                    } else if (target.id === 'github-test-api-btn' || target.closest('#github-test-api-btn')) {
                        e.preventDefault();
                        e.stopPropagation();
                        this.testAPI();
                    } else if (target.id === 'github-delete-repo-btn' || target.closest('#github-delete-repo-btn')) {
                        e.preventDefault();
                        e.stopPropagation();
                        this.handleDeleteRepository();
                    }
                });

                // 也绑定直接点击事件作为备用
                const bindDirectEvent = (id, handler) => {
                    const btn = document.getElementById(id);
                    if (btn) {
                        btn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handler.call(this);
                        });
                    }
                };

                bindDirectEvent('github-delete-files-btn', this.handleDeleteFiles);
                bindDirectEvent('github-delete-keep-structure-btn', this.handleDeleteAndKeepStructure);
                bindDirectEvent('github-upload-files-btn', this.handleUploadFiles);
                bindDirectEvent('github-create-gitignore-btn', this.handleCreateGitignore);
                bindDirectEvent('github-settings-btn', this.showSettings);
                bindDirectEvent('github-test-api-btn', this.testAPI);
                bindDirectEvent('github-delete-repo-btn', this.handleDeleteRepository);
            }

            makeDraggable(element) {
                const header = element.querySelector('.github-tools-header');
                let isDragging = false;
                let offset = { x: 0, y: 0 };

                header.addEventListener('mousedown', (e) => {
                    if (e.target.classList.contains('close-btn')) return;
                    
                    isDragging = true;
                    offset = {
                        x: e.clientX - element.getBoundingClientRect().left,
                        y: e.clientY - element.getBoundingClientRect().top
                    };
                    element.style.cursor = 'grabbing';
                    e.preventDefault();
                });

                document.addEventListener('mousemove', (e) => {
                    if (!isDragging) return;

                    element.style.left = `${e.clientX - offset.x}px`;
                    element.style.top = `${e.clientY - offset.y}px`;
                    element.style.right = 'auto';
                    element.style.bottom = 'auto';
                    element.style.transform = 'none';
                });

                document.addEventListener('mouseup', () => {
                    isDragging = false;
                    element.style.cursor = '';
                });
            }

            addGlobalHotkey() {
                document.addEventListener('keydown', (e) => {
                    // Ctrl+Shift+G 打开/关闭面板
                    if (e.ctrlKey && e.shiftKey && e.key === 'G') {
                        e.preventDefault();
                        const panel = document.getElementById('github-tools-floating');
                        if (panel) {
                            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
                            const closeBtn = panel.querySelector('.close-btn');
                            closeBtn.textContent = panel.style.display === 'none' ? '+' : '−';
                        }
                    }
                });
            }

            updateProgress(percent, message) {
                const progressBar = document.getElementById('progress-bar');
                const progressContainer = document.getElementById('progress-container');
                const statusText = document.getElementById('status-text');
                
                if (progressBar && progressContainer && statusText) {
                    progressBar.style.width = `${percent}%`;
                    statusText.textContent = message;
                    
                    if (percent > 0) {
                        progressContainer.style.display = 'block';
                        statusText.style.display = 'block';
                    } else {
                        progressContainer.style.display = 'none';
                        statusText.style.display = 'none';
                    }
                }
            }

            updateButtonsState(disabled) {
                const buttons = document.querySelectorAll('#github-tools-floating .github-tool-btn');
                buttons.forEach(btn => {
                    btn.disabled = disabled;
                    if (disabled) {
                        btn.classList.add('flash');
                    } else {
                        btn.classList.remove('flash');
                    }
                });
            }

            async showSettings() {
                const token = TokenManager.getToken();
                const maskedToken = token ? 
                    `${token.substring(0, 6)}...${token.substring(token.length - 4)}` : 
                    '未设置';
                
                const result = await Swal.fire({
                    title: '设置',
                    html: `
                        <div style="text-align: left;">
                            <p><strong>GitHub Token状态:</strong> ${token ? '✅ 已设置' : '❌ 未设置'}</p>
                            <p><strong>Token预览:</strong> ${maskedToken}</p>
                            <hr style="margin: 10px 0;">
                            <p><strong>仓库信息:</strong></p>
                            <ul style="margin-left: 20px;">
                                <li>仓库: ${this.repoInfo.owner}/${this.repoInfo.repo}</li>
                                <li>分支: ${RepoInfo.getCurrentBranch()}</li>
                            </ul>
                            <hr style="margin: 10px 0;">
                            <p><strong>快捷键:</strong> Ctrl+Shift+G 显示/隐藏面板</p>
                            <p><strong>版本:</strong> 3.8 (新增删除存储库功能)</p>
                        </div>
                    `,
                    showDenyButton: true,
                    showCancelButton: true,
                    confirmButtonText: '更改Token',
                    denyButtonText: '测试连接',
                    cancelButtonText: '关闭'
                });

                if (result.value === 'confirm') {
                    await TokenManager.requestToken();
                } else if (result.value === 'deny') {
                    await this.testAPI();
                }
            }

            async testAPI() {
                try {
                    const swalInstance = Swal.fire({
                        title: '测试API连接...',
                        allowOutsideClick: false,
                        showConfirmButton: false,
                        didOpen: () => {
                            Swal.showLoading();
                        }
                    });

                    // 测试用户API
                    const userData = await this.api.get('/user');
                    
                    // 测试仓库访问
                    const repoData = await this.api.get(`/repos/${this.repoInfo.owner}/${this.repoInfo.repo}`);
                    
                    Swal.close();
                    
                    await Swal.fire({
                        title: '✅ API连接正常',
                        html: `
                            <div style="text-align: left;">
                                <p><strong>用户:</strong> ${userData.login}</p>
                                <p><strong>仓库:</strong> ${repoData.full_name}</p>
                                <p><strong>仓库权限:</strong> ${repoData.permissions ? 
                                    `管理员: ${repoData.permissions.admin ? '✅' : '❌'}, ` +
                                    `推送: ${repoData.permissions.push ? '✅' : '❌'}, ` +
                                    `拉取: ${repoData.permissions.pull ? '✅' : '❌'}` : 
                                    '未知'}</p>
                                <p><strong>默认分支:</strong> ${repoData.default_branch || 'main'}</p>
                                <p><strong>剩余API次数:</strong> ${this.api.rateLimitRemaining || '未知'}</p>
                            </div>
                        `,
                        icon: 'success'
                    });
                } catch (error) {
                    Swal.close();
                    await Swal.fire({
                        title: '❌ API连接失败',
                        html: `
                            <div style="text-align: left;">
                                <p><strong>错误信息:</strong> ${error.message}</p>
                            </div>
                        `,
                        icon: 'error'
                    });
                }
            }

            async handleDeleteFiles() {
                if (this.isProcessing) {
                    await Swal.fire({
                        title: '操作进行中',
                        text: '请等待当前操作完成',
                        icon: 'info',
                        timer: 2000
                    });
                    return;
                }
                
                await this.deleteAllFiles();
            }

            async handleDeleteAndKeepStructure() {
                if (this.isProcessing) {
                    await Swal.fire({
                        title: '操作进行中',
                        text: '请等待当前操作完成',
                        icon: 'info',
                        timer: 2000
                    });
                    return;
                }
                
                await this.deleteFilesAndKeepStructure();
            }

            async handleUploadFiles() {
                if (this.isProcessing) {
                    await Swal.fire({
                        title: '操作进行中',
                        text: '请等待当前操作完成',
                        icon: 'info',
                        timer: 2000
                    });
                    return;
                }
                
                await this.uploadFiles();
            }

            async handleCreateGitignore() {
                if (this.isProcessing) {
                    await Swal.fire({
                        title: '操作进行中',
                        text: '请等待当前操作完成',
                        icon: 'info',
                        timer: 2000
                    });
                    return;
                }
                
                await this.createGitignoreFiles();
            }

            async handleDeleteRepository() {
                if (this.isProcessing) {
                    await Swal.fire({
                        title: '操作进行中',
                        text: '请等待当前操作完成',
                        icon: 'info',
                        timer: 2000
                    });
                    return;
                }
                
                await this.deleteRepository();
            }

            // 删除存储库功能
            async deleteRepository() {
                if (!this.repoInfo.isRepoPage) {
                    await Swal.fire({
                        title: '错误',
                        text: '当前页面不是GitHub仓库页面',
                        icon: 'error'
                    });
                    return;
                }

                const repoName = `${this.repoInfo.owner}/${this.repoInfo.repo}`;
                
                // 第一步：严重警告
                const warningResult = await Swal.fire({
                    title: '⚠️ 极度危险操作！',
                    html: `
                        <div style="text-align: left;">
                            <p style="color: #dc3545; font-size: 18px; font-weight: bold; margin-bottom: 15px;">您将要永久删除存储库！</p>
                            <div class="danger-note">
                                <p><strong>删除存储库将导致：</strong></p>
                                <ul>
                                    <li>所有文件、文件夹被永久删除</li>
                                    <li>所有提交历史、分支、标签丢失</li>
                                    <li>所有issues、pull requests被删除</li>
                                    <li>所有协作者将失去访问权限</li>
                                    <li>此操作无法撤销！</li>
                                </ul>
                            </div>
                            <p>请在下方输入 <strong>"DELETE"</strong> 以确认您了解此操作的严重性：</p>
                            <input type="text" id="confirm-danger" class="swal2-input" placeholder="输入 DELETE" autocomplete="off">
                        </div>
                    `,
                    icon: 'error',
                    showCancelButton: true,
                    confirmButtonText: '继续',
                    cancelButtonText: '取消',
                    confirmButtonColor: '#dc3545',
                    focusCancel: true,
                    preConfirm: () => {
                        const input = document.getElementById('confirm-danger');
                        if (!input || input.value.trim() !== 'DELETE') {
                            Swal.showValidationMessage('请输入 "DELETE" 以确认');
                            return false;
                        }
                        return true;
                    }
                });

                if (!warningResult.isConfirmed) {
                    return;
                }

                // 第二步：获取仓库信息并再次确认
                this.isProcessing = true;
                this.currentOperation = 'delete-repo';
                this.updateButtonsState(true);

                try {
                    // 获取仓库详细信息
                    const repoInfo = await Swal.fire({
                        title: '正在获取仓库信息...',
                        allowOutsideClick: false,
                        showConfirmButton: false,
                        didOpen: () => {
                            Swal.showLoading();
                        }
                    });

                    const repositoryData = await this.api.getRepositoryInfo(this.repoInfo.owner, this.repoInfo.repo);
                    
                    Swal.close();

                    if (!repositoryData) {
                        throw new Error('无法获取仓库信息');
                    }

                    // 显示仓库详细信息并再次确认
                    const repoDetailsHtml = `
                        <div style="text-align: left;">
                            <p><strong>仓库名称:</strong> ${repositoryData.full_name}</p>
                            <p><strong>描述:</strong> ${repositoryData.description || '无描述'}</p>
                            <p><strong>创建时间:</strong> ${new Date(repositoryData.created_at).toLocaleDateString()}</p>
                            <p><strong>最后更新:</strong> ${new Date(repositoryData.updated_at).toLocaleDateString()}</p>
                            <p><strong>默认分支:</strong> ${repositoryData.default_branch}</p>
                            <p><strong>仓库大小:</strong> ${repositoryData.size ? Math.round(repositoryData.size / 1024) : '未知'} MB</p>
                            <p><strong>星标数:</strong> ${repositoryData.stargazers_count}</p>
                            <p><strong>复刻数:</strong> ${repositoryData.forks_count}</p>
                            <p><strong>公开状态:</strong> ${repositoryData.private ? '私有' : '公开'}</p>
                            
                            <div class="danger-note" style="margin: 15px 0;">
                                <p><strong>再次警告：此操作不可撤销！</strong></p>
                                <p>请在下方输入完整的仓库名称以确认删除：</p>
                                <input type="text" id="confirm-repo-fullname" class="swal2-input" placeholder="${repositoryData.full_name}" autocomplete="off">
                            </div>
                        </div>
                    `;

                    const finalConfirm = await Swal.fire({
                        title: '确认删除存储库',
                        html: repoDetailsHtml,
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonText: '确认删除',
                        cancelButtonText: '取消',
                        confirmButtonColor: '#8b0000',
                        width: 700,
                        focusCancel: true,
                        preConfirm: () => {
                            const input = document.getElementById('confirm-repo-fullname');
                            if (!input || input.value.trim() !== repositoryData.full_name) {
                                Swal.showValidationMessage(`请输入 "${repositoryData.full_name}" 以确认`);
                                return false;
                            }
                            return true;
                        }
                    });

                    if (!finalConfirm.isConfirmed) {
                        throw new Error('用户取消删除');
                    }

                    // 第三步：执行删除
                    const deleteProgress = await Swal.fire({
                        title: '正在删除存储库...',
                        html: `
                            <div style="text-align: center;">
                                <div class="progress-container" style="width: 80%; margin: 20px auto;">
                                    <div id="swal-progress-bar" class="progress-bar" style="width: 0%;"></div>
                                </div>
                                <div id="swal-status-text" class="status-text">正在删除存储库 ${repositoryData.full_name}...</div>
                            </div>
                        `,
                        allowOutsideClick: false,
                        showConfirmButton: false,
                        showCancelButton: false
                    });

                    // 更新进度
                    const updateProgress = (percent, message) => {
                        const statusText = document.getElementById('swal-status-text');
                        const progressBar = document.getElementById('swal-progress-bar');
                        if (statusText) statusText.textContent = message;
                        if (progressBar) progressBar.style.width = `${percent}%`;
                    };

                    updateProgress(30, '正在验证权限...');
                    
                    // 检查Token权限
                    try {
                        const userResponse = await this.api.get('/user');
                        console.log('用户权限验证通过:', userResponse.login);
                    } catch (error) {
                        throw new Error('Token权限不足，无法删除存储库');
                    }

                    updateProgress(60, '正在删除存储库...');
                    
                    // 执行删除操作
                    const deleteResult = await this.api.deleteRepository(this.repoInfo.owner, this.repoInfo.repo);
                    
                    updateProgress(100, '删除完成！');
                    
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    Swal.close();

                    // 删除成功
                    await Swal.fire({
                        title: '✅ 存储库删除成功',
                        html: `
                            <div style="text-align: center;">
                                <p style="font-size: 18px; margin-bottom: 15px;">存储库 <strong>${repositoryData.full_name}</strong> 已成功删除。</p>
                                <p>页面将在5秒后跳转到您的仓库列表...</p>
                                <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 6px; border: 1px solid #e1e4e8;">
                                    <p><strong>已删除的内容：</strong></p>
                                    <ul style="text-align: left; margin: 10px 0; padding-left: 20px;">
                                        <li>所有文件和文件夹</li>
                                        <li>提交历史和分支</li>
                                        <li>Issues和Pull Requests</li>
                                        <li>仓库设置和Webhooks</li>
                                    </ul>
                                </div>
                            </div>
                        `,
                        icon: 'success',
                        timer: 5000,
                        timerProgressBar: true,
                        showConfirmButton: false
                    });

                    // 跳转到用户仓库列表
                    setTimeout(() => {
                        window.location.href = `https://github.com/${this.repoInfo.owner}?tab=repositories`;
                    }, 5000);

                } catch (error) {
                    console.error('删除存储库失败:', error);
                    Swal.close();
                    
                    if (error.message === '用户取消删除') {
                        await Swal.fire({
                            title: '已取消',
                            text: '存储库删除操作已被取消',
                            icon: 'info',
                            timer: 2000
                        });
                    } else if (error.message.includes('权限不足')) {
                        await Swal.fire({
                            title: '权限不足',
                            html: `
                                <div style="text-align: left;">
                                    <p><strong>错误信息:</strong> ${error.message}</p>
                                    <p>请确保：</p>
                                    <ul style="margin-left: 20px;">
                                        <li>Token具有管理员权限</li>
                                        <li>您是仓库的所有者或管理员</li>
                                        <li>Token未被撤销或过期</li>
                                    </ul>
                                </div>
                            `,
                            icon: 'error'
                        });
                    } else if (error.message.includes('404')) {
                        await Swal.fire({
                            title: '仓库不存在',
                            text: '指定的仓库可能已被删除或不存在',
                            icon: 'warning'
                        });
                    } else {
                        await Swal.fire({
                            title: '删除失败',
                            html: `
                                <div style="text-align: left;">
                                    <p><strong>错误信息:</strong> ${error.message}</p>
                                    <p>可能的原因：</p>
                                    <ul style="margin-left: 20px;">
                                        <li>网络连接问题</li>
                                        <li>GitHub API限制</li>
                                        <li>仓库已被锁定或正在处理其他操作</li>
                                    </ul>
                                </div>
                            `,
                            icon: 'error'
                        });
                    }
                } finally {
                    this.isProcessing = false;
                    this.currentOperation = null;
                    this.updateButtonsState(false);
                    this.updateProgress(0, '');
                }
            }

            // 改进的文件上传功能
            async uploadFiles() {
                if (!this.repoInfo.isRepoPage) {
                    await Swal.fire({
                        title: '错误',
                        text: '当前页面不是GitHub仓库页面',
                        icon: 'error'
                    });
                    return;
                }

                this.isProcessing = true;
                this.currentOperation = 'upload';
                this.updateButtonsState(true);

                try {
                    // 初始化上传管理器
                    this.uploadManager = this.operations.getUploadManager();

                    // 显示文件选择界面
                    const result = await Swal.fire({
                        title: '上传文件到GitHub仓库',
                        html: `
                            <div style="text-align: center;">
                                <div class="upload-area" id="upload-area">
                                    <div class="upload-icon">📁</div>
                                    <p><strong>点击选择文件和文件夹</strong></p>
                                    <p>支持拖放文件/文件夹到此处</p>
                                    <p style="font-size: 12px; color: #586069;">最大文件大小: ${CONFIG.MAX_FILE_SIZE / (1024*1024)}MB</p>
                                </div>
                                <div class="upload-buttons">
                                    <button class="upload-btn file-btn" id="select-files-btn">
                                        📄 选择文件
                                    </button>
                                    <button class="upload-btn folder-btn" id="select-folders-btn">
                                        📁 选择文件夹
                                    </button>
                                </div>
                                <div id="file-list-container" class="file-list-container" style="display: none;">
                                    <div id="file-list"></div>
                                </div>
                                <div id="file-stats" class="file-stats" style="display: none;"></div>
                            </div>
                        `,
                        showCancelButton: true,
                        confirmButtonText: '开始上传',
                        cancelButtonText: '取消',
                        width: 600,
                        didOpen: () => {
                            const uploadArea = document.getElementById('upload-area');
                            const selectFilesBtn = document.getElementById('select-files-btn');
                            const selectFoldersBtn = document.getElementById('select-folders-btn');
                            
                            // 文件选择按钮
                            selectFilesBtn.addEventListener('click', async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                await this.uploadManager.selectFilesAndFolders();
                                this.updateFileList();
                            });
                            
                            // 文件夹选择按钮
                            selectFoldersBtn.addEventListener('click', async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                await this.uploadManager.selectFolders();
                                this.updateFileList();
                            });
                            
                            // 拖放功能
                            uploadArea.addEventListener('dragover', (e) => {
                                e.preventDefault();
                                uploadArea.classList.add('drag-over');
                            });

                            uploadArea.addEventListener('dragleave', () => {
                                uploadArea.classList.remove('drag-over');
                            });

                            uploadArea.addEventListener('drop', async (e) => {
                                e.preventDefault();
                                uploadArea.classList.remove('drag-over');
                                
                                const items = Array.from(e.dataTransfer.items);
                                if (items.length > 0) {
                                    await this.uploadManager.handleDropItems(items);
                                    this.updateFileList();
                                }
                            });
                        },
                        preConfirm: () => {
                            if (!this.uploadManager || this.uploadManager.files.length === 0) {
                                Swal.showValidationMessage('请选择要上传的文件');
                                return false;
                            }
                            return true;
                        }
                    });

                    if (!result.isConfirmed) {
                        throw new Error('用户取消上传');
                    }

                    // 获取文件统计信息
                    const stats = this.uploadManager.getFileStats();
                    
                    // 确认上传
                    const confirmUpload = await Swal.fire({
                        title: '确认上传',
                        html: `
                            <div style="text-align: left;">
                                <p><strong>上传统计:</strong></p>
                                <div class="file-stats">
                                    <div class="file-stat">
                                        <span class="file-stat-value">${stats.totalFiles}</span>
                                        <span class="file-stat-label">文件数量</span>
                                    </div>
                                    <div class="file-stat">
                                        <span class="file-stat-value">${this.uploadManager.formatFileSize(stats.totalSize)}</span>
                                        <span class="file-stat-label">总大小</span>
                                    </div>
                                    <div class="file-stat">
                                        <span class="file-stat-value">${stats.folders}</span>
                                        <span class="file-stat-label">文件夹数</span>
                                    </div>
                                </div>
                                <p><strong>目标仓库:</strong> ${this.repoInfo.owner}/${this.repoInfo.repo}</p>
                                <p><strong>目标分支:</strong> ${this.uploadManager.branch}</p>
                                <p style="color: #fd7e14; margin-top: 15px;">上传过程中会自动检测并处理同名文件冲突。</p>
                            </div>
                        `,
                        icon: 'question',
                        showCancelButton: true,
                        confirmButtonText: '开始上传',
                        cancelButtonText: '取消'
                    });

                    if (!confirmUpload.isConfirmed) {
                        throw new Error('用户取消上传');
                    }

                    // 显示上传进度
                    const progressSwal = Swal.fire({
                        title: '正在上传文件...',
                        html: `
                            <div style="text-align: center;">
                                <div class="progress-container" style="width: 80%; margin: 20px auto;">
                                    <div id="swal-progress-bar" class="progress-bar" style="width: 0%;"></div>
                                </div>
                                <div id="swal-status-text" class="status-text">准备上传...</div>
                            </div>
                        `,
                        allowOutsideClick: false,
                        showConfirmButton: false,
                        showCancelButton: true,
                        cancelButtonText: '取消上传'
                    });

                    // 设置进度更新回调
                    this.uploadManager.onProgress = (percent, message) => {
                        const statusText = document.getElementById('swal-status-text');
                        const progressBar = document.getElementById('swal-progress-bar');
                        if (statusText) statusText.textContent = message;
                        if (progressBar) progressBar.style.width = `${percent}%`;
                        this.updateProgress(percent, message);
                    };

                    // 设置取消处理
                    progressSwal.then((result) => {
                        if (result.dismiss === Swal.DismissReason.cancel) {
                            throw new Error('用户取消上传');
                        }
                    });

                    // 执行上传
                    const uploadResult = await this.uploadManager.uploadFiles();
                    
                    // 上传完成
                    Swal.close();
                    this.updateProgress(100, '上传完成');

                    // 显示上传结果
                    let resultHtml = `<strong>文件上传完成！</strong><br><br>`;
                    resultHtml += `📤 总计: <strong>${uploadResult.total}</strong> 个文件<br>`;
                    resultHtml += `✅ 成功上传: <strong>${uploadResult.uploaded}</strong> 个文件<br>`;
                    
                    if (uploadResult.skipped > 0) {
                        resultHtml += `⏭️ 跳过: <strong>${uploadResult.skipped}</strong> 个文件<br>`;
                    }
                    
                    if (uploadResult.failed > 0) {
                        resultHtml += `❌ 失败: <strong>${uploadResult.failed}</strong> 个文件<br>`;
                    }

                    // 显示失败详情（如果有）
                    const failedResults = uploadResult.results.filter(r => !r.success && r.action !== 'skipped');
                    if (failedResults.length > 0) {
                        resultHtml += `<br><details style="text-align: left;"><summary>点击查看失败详情</summary>`;
                        resultHtml += `<div class="error-details">`;
                        failedResults.forEach((result, index) => {
                            resultHtml += `<div class="error-item">`;
                            resultHtml += `<strong>${index + 1}. ${result.file}</strong><br>`;
                            resultHtml += `<small style="color: #dc3545;">错误: ${result.error}</small>`;
                            resultHtml += `</div>`;
                        });
                        resultHtml += `</div></details>`;
                    }

                    // 显示重命名详情（如果有）
                    const renamedFiles = this.uploadManager.files.filter(f => f.newName);
                    if (renamedFiles.length > 0) {
                        resultHtml += `<br><details style="text-align: left;"><summary>点击查看重命名文件</summary>`;
                        resultHtml += `<div class="error-details">`;
                        renamedFiles.forEach((file, index) => {
                            resultHtml += `<div class="error-item">`;
                            resultHtml += `<strong>${index + 1}. ${file.name}</strong> → <strong>${file.newName}</strong><br>`;
                            resultHtml += `<small>原因: 避免文件名冲突</small>`;
                            resultHtml += `</div>`;
                        });
                        resultHtml += `</div></details>`;
                    }

                    await Swal.fire({
                        title: uploadResult.success ? '上传完成' : '上传部分失败',
                        html: resultHtml,
                        icon: uploadResult.uploaded > 0 ? (uploadResult.failed > 0 ? 'warning' : 'success') : 'error',
                        width: 700,
                        confirmButtonText: '确定'
                    });

                } catch (error) {
                    console.error('上传文件失败:', error);
                    Swal.close();
                    
                    if (error.message === '用户取消上传') {
                        await Swal.fire({
                            title: '已取消',
                            text: '文件上传已被用户取消',
                            icon: 'info',
                            timer: 2000
                        });
                    } else {
                        await Swal.fire({
                            title: '上传失败',
                            html: `
                                <div style="text-align: left;">
                                    <p><strong>错误信息:</strong> ${error.message}</p>
                                </div>
                            `,
                            icon: 'error'
                        });
                    }
                } finally {
                    this.isProcessing = false;
                    this.currentOperation = null;
                    this.updateButtonsState(false);
                    this.updateProgress(0, '');
                    this.uploadManager = null;
                }
            }

            // 更新文件列表显示
            updateFileList() {
                if (!this.uploadManager) return;

                const fileListContainer = document.getElementById('file-list-container');
                const fileList = document.getElementById('file-list');
                const fileStats = document.getElementById('file-stats');
                
                if (!fileListContainer || !fileList || !fileStats) return;

                if (this.uploadManager.files.length === 0) {
                    fileListContainer.style.display = 'none';
                    fileStats.style.display = 'none';
                    return;
                }

                fileListContainer.style.display = 'block';
                fileStats.style.display = 'block';

                // 清空现有列表
                fileList.innerHTML = '';

                // 按文件夹分组显示文件
                const filesByFolder = {};
                this.uploadManager.files.forEach((fileInfo, index) => {
                    const folderPath = fileInfo.relativePath.includes('/') ? 
                        fileInfo.relativePath.substring(0, fileInfo.relativePath.lastIndexOf('/')) : 
                        '根目录';
                    
                    if (!filesByFolder[folderPath]) {
                        filesByFolder[folderPath] = [];
                    }
                    filesByFolder[folderPath].push({...fileInfo, index});
                });

                // 显示分组文件列表（最多显示20个文件）
                const maxDisplay = 20;
                let displayedCount = 0;

                Object.entries(filesByFolder).forEach(([folder, files]) => {
                    // 显示文件夹标题
                    if (files.length > 0) {
                        const folderHeader = document.createElement('div');
                        folderHeader.className = 'file-list-item';
                        folderHeader.innerHTML = `
                            <div style="display: flex; align-items: center; flex: 1;">
                                <span class="file-icon">📁</span>
                                <div class="file-info">
                                    <span class="file-name">${folder}</span>
                                    <span class="file-size">${files.length} 个文件</span>
                                </div>
                            </div>
                        `;
                        fileList.appendChild(folderHeader);
                    }

                    // 显示该文件夹下的文件
                    files.forEach((fileInfo, fileIndex) => {
                        if (displayedCount >= maxDisplay) return;
                        
                        displayedCount++;
                        const fileItem = document.createElement('div');
                        fileItem.className = 'file-list-item';
                        
                        const icon = fileInfo.type.startsWith('image/') ? '🖼️' :
                                    fileInfo.type.includes('text/') ? '📄' :
                                    fileInfo.type.includes('javascript') ? '📜' :
                                    fileInfo.type.includes('json') ? '📋' :
                                    fileInfo.type.includes('pdf') ? '📕' :
                                    fileInfo.type.includes('zip') || fileInfo.type.includes('compressed') ? '📦' :
                                    '📁';
                        
                        // 显示相对于文件夹的路径
                        const displayName = fileInfo.relativePath.includes('/') ? 
                            fileInfo.relativePath.substring(fileInfo.relativePath.lastIndexOf('/') + 1) : 
                            fileInfo.relativePath;
                        
                        fileItem.innerHTML = `
                            <div style="display: flex; align-items: center; flex: 1; margin-left: 20px;">
                                <span class="file-icon">${icon}</span>
                                <div class="file-info">
                                    <span class="file-name">${displayName}</span>
                                    <span class="file-size">${this.uploadManager.formatFileSize(fileInfo.size)}</span>
                                </div>
                            </div>
                            <button class="remove-file" data-index="${fileInfo.index}" title="移除文件">×</button>
                        `;
                        
                        fileList.appendChild(fileItem);
                    });
                });

                // 如果文件超过显示限制，显示提示
                if (this.uploadManager.files.length > maxDisplay) {
                    const moreItem = document.createElement('div');
                    moreItem.className = 'file-list-item';
                    moreItem.innerHTML = `
                        <div style="text-align: center; width: 100%; color: #586069; font-style: italic;">
                            还有 ${this.uploadManager.files.length - maxDisplay} 个文件...
                        </div>
                    `;
                    fileList.appendChild(moreItem);
                }

                // 更新统计信息
                const stats = this.uploadManager.getFileStats();
                fileStats.innerHTML = `
                    <div class="file-stat">
                        <span class="file-stat-value">${stats.totalFiles}</span>
                        <span class="file-stat-label">文件数量</span>
                    </div>
                    <div class="file-stat">
                        <span class="file-stat-value">${this.uploadManager.formatFileSize(stats.totalSize)}</span>
                        <span class="file-stat-label">总大小</span>
                    </div>
                    <div class="file-stat">
                        <span class="file-stat-value">${stats.folders}</span>
                        <span class="file-stat-label">文件夹数</span>
                    </div>
                `;

                // 绑定移除按钮事件
                fileList.querySelectorAll('.remove-file').forEach(button => {
                    button.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const index = parseInt(button.getAttribute('data-index'));
                        this.uploadManager.files.splice(index, 1);
                        // 重新索引
                        this.uploadManager.files.forEach((file, idx) => {
                            file.index = idx;
                        });
                        this.updateFileList();
                    });
                });
            }

            async deleteAllFiles() {
                if (!this.repoInfo.isRepoPage) {
                    await Swal.fire({
                        title: '错误',
                        text: '当前页面不是GitHub仓库页面',
                        icon: 'error'
                    });
                    return;
                }

                const repoName = `${this.repoInfo.owner}/${this.repoInfo.repo}`;
                const branch = RepoInfo.getCurrentBranch();
                
                const result = await Swal.fire({
                    title: '⚠️ 确认删除所有文件？',
                    html: `
                        <div style="text-align: left;">
                            <p><strong>仓库:</strong> ${repoName}</p>
                            <p><strong>分支:</strong> ${branch}</p>
                            <p><strong>警告:</strong> 此操作将删除仓库中的所有文件，但保留目录结构。</p>
                            <p style="color: #dc3545; font-weight: bold;">此操作不可撤销！请谨慎操作。</p>
                            <p>请在下方输入仓库名称以确认:</p>
                            <input type="text" id="confirm-repo-name" class="swal2-input" placeholder="${repoName}" autocomplete="off">
                        </div>
                    `,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: '确认删除',
                    cancelButtonText: '取消',
                    confirmButtonColor: '#dc3545',
                    focusCancel: true,
                    preConfirm: () => {
                        const input = document.getElementById('confirm-repo-name');
                        if (!input || input.value.trim() !== repoName) {
                            Swal.showValidationMessage(`请输入 "${repoName}" 以确认`);
                            return false;
                        }
                        return true;
                    }
                });

                if (!result.isConfirmed) return;

                this.isProcessing = true;
                this.currentOperation = 'delete';
                this.updateButtonsState(true);
                this.updateProgress(0, '正在扫描文件...');

                try {
                    // 创建进度弹窗
                    const progressSwal = Swal.fire({
                        title: '正在扫描文件...',
                        html: `
                            <div style="text-align: center;">
                                <div class="progress-container" style="width: 80%; margin: 20px auto;">
                                    <div id="swal-progress-bar" class="progress-bar" style="width: 0%;"></div>
                                </div>
                                <div id="swal-status-text" class="status-text">初始化扫描...</div>
                            </div>
                        `,
                        allowOutsideClick: false,
                        showConfirmButton: false,
                        showCancelButton: true,
                        cancelButtonText: '取消操作'
                    });

                    // 设置取消处理
                    progressSwal.then((result) => {
                        if (result.dismiss === Swal.DismissReason.cancel) {
                            this.isProcessing = false;
                            this.updateButtonsState(false);
                            this.updateProgress(0, '');
                            throw new Error('用户取消操作');
                        }
                    });

                    // 获取文件列表
                    const updateProgress = (percent, message) => {
                        const statusText = document.getElementById('swal-status-text');
                        const progressBar = document.getElementById('swal-progress-bar');
                        if (statusText) statusText.textContent = message;
                        if (progressBar) progressBar.style.width = `${percent}%`;
                    };

                    updateProgress(10, '正在获取文件列表...');
                    
                    const files = await this.operations.getAllFiles();
                    
                    if (files.length === 0) {
                        Swal.close();
                        await Swal.fire({
                            title: '提示',
                            text: '仓库中没有文件可删除',
                            icon: 'info'
                        });
                        return;
                    }

                    updateProgress(30, `找到 ${files.length} 个文件，准备删除...`);

                    // 确认删除
                    Swal.close();
                    const confirmDelete = await Swal.fire({
                        title: '找到文件',
                        html: `找到 <strong>${files.length}</strong> 个文件，确认删除吗？`,
                        icon: 'question',
                        showCancelButton: true,
                        confirmButtonText: `删除${files.length}个文件`,
                        cancelButtonText: '取消',
                        confirmButtonColor: '#dc3545'
                    });

                    if (!confirmDelete.isConfirmed) {
                        throw new Error('用户取消删除');
                    }

                    // 重新显示进度弹窗
                    await Swal.fire({
                        title: '正在删除文件...',
                        html: `
                            <div style="text-align: center;">
                                <div class="progress-container" style="width: 80%; margin: 20px auto;">
                                    <div id="swal-progress-bar" class="progress-bar" style="width: 0%;"></div>
                                </div>
                                <div id="swal-status-text" class="status-text">开始删除文件...</div>
                            </div>
                        `,
                        allowOutsideClick: false,
                        showConfirmButton: false,
                        showCancelButton: false
                    });

                    let successCount = 0;
                    let failCount = 0;
                    const failedFiles = [];

                    // 删除文件
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        const percent = Math.round(((i + 1) / files.length) * 100);
                        
                        this.updateProgress(percent, `删除中: ${i + 1}/${files.length}`);
                        
                        const statusText = document.getElementById('swal-status-text');
                        const progressBar = document.getElementById('swal-progress-bar');
                        if (statusText) statusText.textContent = `正在删除文件 ${i + 1}/${files.length}: ${file.name}`;
                        if (progressBar) progressBar.style.width = `${percent}%`;

                        const result = await this.operations.deleteFile(file);
                        
                        if (result.success) {
                            successCount++;
                        } else {
                            failCount++;
                            failedFiles.push({ 
                                path: file.path, 
                                error: result.error,
                                name: file.name 
                            });
                        }
                        
                        // 避免速率限制，每3个文件暂停一下
                        if ((i + 1) % 3 === 0 && i < files.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 800));
                        }
                    }

                    // 完成
                    this.updateProgress(100, '操作完成');
                    Swal.close();
                    
                    let resultHtml = `<strong>删除操作完成！</strong><br><br>`;
                    resultHtml += `✅ 成功删除: <strong>${successCount}</strong> 个文件<br>`;
                    resultHtml += `❌ 失败: <strong>${failCount}</strong> 个文件<br>`;
                    
                    if (failedFiles.length > 0) {
                        resultHtml += `<br><details style="text-align: left;"><summary>点击查看失败详情</summary>`;
                        resultHtml += `<div class="error-details">`;
                        failedFiles.forEach((file, index) => {
                            resultHtml += `<div class="error-item">`;
                            resultHtml += `<strong>${index + 1}. ${file.name}</strong><br>`;
                            resultHtml += `<small>路径: ${file.path}</small><br>`;
                            resultHtml += `<small style="color: #dc3545;">错误: ${file.error}</small>`;
                            resultHtml += `</div>`;
                        });
                        resultHtml += `</div></details>`;
                        
                        // 提供建议
                        resultHtml += `<br><small>常见422错误原因：</small>`;
                        resultHtml += `<ul style="text-align: left; font-size: 12px; margin-top: 5px;">`;
                        resultHtml += `<li>文件已被其他人修改</li>`;
                        resultHtml += `<li>SHA值不正确或已过期</li>`;
                        resultHtml += `<li>分支权限问题</li>`;
                        resultHtml += `</ul>`;
                    }

                    await Swal.fire({
                        title: successCount > 0 ? '操作完成' : '操作部分失败',
                        html: resultHtml,
                        icon: successCount > 0 ? (failCount > 0 ? 'warning' : 'success') : 'error',
                        width: 600,
                        confirmButtonText: '确定'
                    });

                } catch (error) {
                    console.error('删除操作失败:', error);
                    Swal.close();
                    
                    if (error.message === '用户取消操作' || error.message === '用户取消删除') {
                        await Swal.fire({
                            title: '已取消',
                            text: '操作已被用户取消',
                            icon: 'info',
                            timer: 2000
                        });
                    } else {
                        await Swal.fire({
                            title: '操作失败',
                            html: `
                                <div style="text-align: left;">
                                    <p><strong>错误信息:</strong> ${error.message}</p>
                                </div>
                            `,
                            icon: 'error'
                        });
                    }
                } finally {
                    this.isProcessing = false;
                    this.currentOperation = null;
                    this.updateButtonsState(false);
                    this.updateProgress(0, '');
                }
            }

            async deleteFilesAndKeepStructure() {
                if (!this.repoInfo.isRepoPage) {
                    await Swal.fire({
                        title: '错误',
                        text: '当前页面不是GitHub仓库页面',
                        icon: 'error'
                    });
                    return;
                }

                const repoName = `${this.repoInfo.owner}/${this.repoInfo.repo}`;
                const branch = RepoInfo.getCurrentBranch();
                
                const result = await Swal.fire({
                    title: '⚠️ 保留结构式删除文件',
                    html: `
                        <div style="text-align: left;">
                            <p><strong>仓库:</strong> ${repoName}</p>
                            <p><strong>分支:</strong> ${branch}</p>
                            <p><strong>操作说明:</strong> 此操作将执行以下两步：</p>
                            <ol style="margin-left: 20px; margin-bottom: 15px;">
                                <li>删除仓库中的所有文件（保留目录结构）</li>
                                <li>在所有目录中创建.gitignore文件来保持目录结构</li>
                            </ol>
                            <p><strong>注意:</strong> 如果目录已存在.gitignore文件，将不会重复创建。</p>
                            <p style="color: #fd7e14; font-weight: bold;">此操作将修改仓库内容，请谨慎操作。</p>
                            <p>请在下方输入仓库名称以确认:</p>
                            <input type="text" id="confirm-repo-name" class="swal2-input" placeholder="${repoName}" autocomplete="off">
                        </div>
                    `,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: '确认执行',
                    cancelButtonText: '取消',
                    confirmButtonColor: '#fd7e14',
                    focusCancel: true,
                    preConfirm: () => {
                        const input = document.getElementById('confirm-repo-name');
                        if (!input || input.value.trim() !== repoName) {
                            Swal.showValidationMessage(`请输入 "${repoName}" 以确认`);
                            return false;
                        }
                        return true;
                    }
                });

                if (!result.isConfirmed) return;

                this.isProcessing = true;
                this.currentOperation = 'delete-keep-structure';
                this.updateButtonsState(true);
                this.updateProgress(0, '正在准备操作...');

                try {
                    // 创建进度弹窗
                    const progressSwal = Swal.fire({
                        title: '正在执行保留结构式删除...',
                        html: `
                            <div style="text-align: center;">
                                <div class="progress-container" style="width: 80%; margin: 20px auto;">
                                    <div id="swal-progress-bar" class="progress-bar" style="width: 0%;"></div>
                                </div>
                                <div id="swal-status-text" class="status-text">初始化操作...</div>
                            </div>
                        `,
                        allowOutsideClick: false,
                        showConfirmButton: false,
                        showCancelButton: true,
                        cancelButtonText: '取消操作'
                    });

                    // 设置取消处理
                    progressSwal.then((result) => {
                        if (result.dismiss === Swal.DismissReason.cancel) {
                            this.isProcessing = false;
                            this.updateButtonsState(false);
                            this.updateProgress(0, '');
                            throw new Error('用户取消操作');
                        }
                    });

                    // 更新进度显示
                    const updateProgress = (percent, message) => {
                        const statusText = document.getElementById('swal-status-text');
                        const progressBar = document.getElementById('swal-progress-bar');
                        if (statusText) statusText.textContent = message;
                        if (progressBar) progressBar.style.width = `${percent}%`;
                        this.updateProgress(percent, message);
                    };

                    updateProgress(10, '开始执行操作...');
                    
                    // 执行删除文件并保留结构的操作
                    const operationResult = await this.operations.deleteFilesAndKeepStructure();
                    
                    if (!operationResult.success) {
                        if (operationResult.message.includes('没有文件可删除')) {
                            Swal.close();
                            await Swal.fire({
                                title: '提示',
                                text: operationResult.message,
                                icon: 'info'
                            });
                            return;
                        } else {
                            throw new Error(operationResult.message);
                        }
                    }

                    // 完成
                    updateProgress(100, '操作完成');
                    Swal.close();
                    
                    let resultHtml = `<strong>保留结构式删除操作完成！</strong><br><br>`;
                    
                    // 文件删除结果
                    resultHtml += `<h4 style="margin-top: 15px; margin-bottom: 10px;">📁 文件删除结果：</h4>`;
                    resultHtml += `✅ 成功删除: <strong>${operationResult.filesDeleted}</strong> 个文件<br>`;
                    resultHtml += `❌ 删除失败: <strong>${operationResult.filesFailed}</strong> 个文件<br>`;
                    
                    // .gitignore创建结果
                    resultHtml += `<h4 style="margin-top: 15px; margin-bottom: 10px;">📄 .gitignore创建结果：</h4>`;
                    resultHtml += `✅ 成功创建: <strong>${operationResult.gitignoreCreated}</strong> 个.gitignore文件<br>`;
                    resultHtml += `⏭️ 已存在跳过: <strong>${operationResult.gitignoreSkipped}</strong> 个目录<br>`;
                    resultHtml += `❌ 创建失败: <strong>${operationResult.gitignoreFailed}</strong> 个目录<br>`;
                    
                    // 显示失败详情（如果有）
                    const hasFileFailures = operationResult.failedFiles && operationResult.failedFiles.length > 0;
                    const hasGitignoreFailures = operationResult.failedGitignores && operationResult.failedGitignores.length > 0;
                    
                    if (hasFileFailures || hasGitignoreFailures) {
                        resultHtml += `<br><details style="text-align: left;"><summary>点击查看失败详情</summary>`;
                        resultHtml += `<div class="error-details">`;
                        
                        if (hasFileFailures) {
                            resultHtml += `<h5 style="margin-top: 10px; margin-bottom: 5px;">🗑️ 文件删除失败：</h5>`;
                            operationResult.failedFiles.forEach((file, index) => {
                                resultHtml += `<div class="error-item">`;
                                resultHtml += `<strong>${index + 1}. ${file.path}</strong><br>`;
                                resultHtml += `<small style="color: #dc3545;">错误: ${file.error}</small>`;
                                resultHtml += `</div>`;
                            });
                        }
                        
                        if (hasGitignoreFailures) {
                            resultHtml += `<h5 style="margin-top: 10px; margin-bottom: 5px;">📄 .gitignore创建失败：</h5>`;
                            operationResult.failedGitignores.forEach((dir, index) => {
                                resultHtml += `<div class="error-item">`;
                                resultHtml += `<strong>${index + 1}. ${dir.path || '根目录'}</strong><br>`;
                                resultHtml += `<small style="color: #dc3545;">错误: ${dir.error}</small>`;
                                resultHtml += `</div>`;
                            });
                        }
                        
                        resultHtml += `</div></details>`;
                    }
                    
                    // 操作总结
                    resultHtml += `<br><div style="margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 4px; border-left: 4px solid #fd7e14;">`;
                    resultHtml += `<small><strong>操作总结：</strong> 已删除文件并确保每个目录都有.gitignore文件来保持Git目录结构。</small>`;
                    resultHtml += `</div>`;

                    await Swal.fire({
                        title: '操作完成',
                        html: resultHtml,
                        icon: operationResult.filesDeleted > 0 || operationResult.gitignoreCreated > 0 ? 'success' : 'info',
                        width: 700,
                        confirmButtonText: '确定'
                    });

                } catch (error) {
                    console.error('保留结构式删除操作失败:', error);
                    Swal.close();
                    
                    if (error.message === '用户取消操作') {
                        await Swal.fire({
                            title: '已取消',
                            text: '操作已被用户取消',
                            icon: 'info',
                            timer: 2000
                        });
                    } else {
                        await Swal.fire({
                            title: '操作失败',
                            html: `
                                <div style="text-align: left;">
                                    <p><strong>错误信息:</strong> ${error.message}</p>
                                </div>
                            `,
                            icon: 'error'
                        });
                    }
                } finally {
                    this.isProcessing = false;
                    this.currentOperation = null;
                    this.updateButtonsState(false);
                    this.updateProgress(0, '');
                }
            }

            async createGitignoreFiles() {
                if (!this.repoInfo.isRepoPage) {
                    await Swal.fire({
                        title: '错误',
                        text: '当前页面不是GitHub仓库页面',
                        icon: 'error'
                    });
                    return;
                }

                const repoName = `${this.repoInfo.owner}/${this.repoInfo.repo}`;
                const branch = RepoInfo.getCurrentBranch();
                
                const result = await Swal.fire({
                    title: '创建.gitignore文件',
                    html: `
                        <div style="text-align: left;">
                            <p><strong>仓库:</strong> ${repoName}</p>
                            <p><strong>分支:</strong> ${branch}</p>
                            <p>此操作将在所有目录中创建.gitignore文件。</p>
                            <p>已存在的.gitignore文件将被跳过。</p>
                        </div>
                    `,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: '开始创建',
                    cancelButtonText: '取消'
                });

                if (!result.isConfirmed) return;

                this.isProcessing = true;
                this.currentOperation = 'gitignore';
                this.updateButtonsState(true);
                this.updateProgress(0, '正在扫描目录...');

                try {
                    // 创建进度弹窗
                    await Swal.fire({
                        title: '正在扫描目录...',
                        html: `
                            <div style="text-align: center;">
                                <div class="progress-container" style="width: 80%; margin: 20px auto;">
                                    <div id="swal-progress-bar" class="progress-bar" style="width: 0%;"></div>
                                </div>
                                <div id="swal-status-text" class="status-text">初始化扫描...</div>
                            </div>
                        `,
                        allowOutsideClick: false,
                        showConfirmButton: false,
                        showCancelButton: false
                    });

                    // 获取目录列表
                    const updateProgress = (percent, message) => {
                        const statusText = document.getElementById('swal-status-text');
                        const progressBar = document.getElementById('swal-progress-bar');
                        if (statusText) statusText.textContent = message;
                        if (progressBar) progressBar.style.width = `${percent}%`;
                    };

                    updateProgress(10, '正在获取目录列表...');
                    
                    const directories = await this.operations.getAllDirectories();
                    
                    if (directories.length === 0) {
                        Swal.close();
                        await Swal.fire({
                            title: '提示',
                            text: '仓库中没有目录',
                            icon: 'info'
                        });
                        return;
                    }

                    updateProgress(30, `找到 ${directories.length} 个目录，准备创建...`);

                    // 确认开始
                    Swal.close();
                    const confirmStart = await Swal.fire({
                        title: '准备创建.gitignore',
                        html: `将在 <strong>${directories.length}</strong> 个目录中创建.gitignore文件`,
                        icon: 'info',
                        showCancelButton: true,
                        confirmButtonText: `开始创建`,
                        cancelButtonText: '取消'
                    });

                    if (!confirmStart.isConfirmed) {
                        throw new Error('用户取消创建');
                    }

                    // 重新显示进度弹窗
                    await Swal.fire({
                        title: '正在创建.gitignore文件...',
                        html: `
                            <div style="text-align: center;">
                                <div class="progress-container" style="width: 80%; margin: 20px auto;">
                                    <div id="swal-progress-bar" class="progress-bar" style="width: 0%;"></div>
                                </div>
                                <div id="swal-status-text" class="status-text">开始创建.gitignore文件...</div>
                            </div>
                        `,
                        allowOutsideClick: false,
                        showConfirmButton: false,
                        showCancelButton: false
                    });

                    let successCount = 0;
                    let failCount = 0;
                    let skipCount = 0;
                    const results = [];

                    for (let i = 0; i < directories.length; i++) {
                        const dir = directories[i];
                        const percent = Math.round(((i + 1) / directories.length) * 100);
                        
                        this.updateProgress(percent, `处理中: ${i + 1}/${directories.length}`);
                        
                        const statusText = document.getElementById('swal-status-text');
                        const progressBar = document.getElementById('swal-progress-bar');
                        if (statusText) statusText.textContent = `处理目录 ${i + 1}/${directories.length}`;
                        if (progressBar) progressBar.style.width = `${percent}%`;

                        const result = await this.operations.createGitignoreFile(dir);
                        
                        if (result.success) {
                            successCount++;
                            results.push({ path: dir.path || '根目录', status: '✅ 成功' });
                        } else if (result.skipped) {
                            skipCount++;
                            results.push({ path: dir.path || '根目录', status: '⏭️ 已存在' });
                        } else {
                            failCount++;
                            results.push({ 
                                path: dir.path || '根目录', 
                                status: '❌ 失败',
                                error: result.error 
                            });
                        }
                        
                        // 避免速率限制
                        if ((i + 1) % 2 === 0 && i < directories.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }

                    this.updateProgress(100, '操作完成');
                    Swal.close();
                    
                    let resultHtml = `<strong>创建操作完成！</strong><br><br>`;
                    resultHtml += `✅ 成功创建: <strong>${successCount}</strong> 个<br>`;
                    resultHtml += `⏭️ 已存在跳过: <strong>${skipCount}</strong> 个<br>`;
                    resultHtml += `❌ 失败: <strong>${failCount}</strong> 个<br>`;
                    
                    if (failCount > 0) {
                        resultHtml += `<br><details style="text-align: left;"><summary>点击查看详细结果</summary>`;
                        resultHtml += `<div class="error-details">`;
                        results.forEach((item, index) => {
                            resultHtml += `<div class="error-item">`;
                            resultHtml += `<strong>${index + 1}. ${item.path}</strong> - ${item.status}`;
                            if (item.error) {
                                resultHtml += `<br><small style="color: #dc3545;">${item.error}</small>`;
                            }
                            resultHtml += `</div>`;
                        });
                        resultHtml += `</div></details>`;
                    }

                    await Swal.fire({
                        title: '操作完成',
                        html: resultHtml,
                        icon: successCount > 0 ? (failCount > 0 ? 'warning' : 'success') : 'error',
                        width: 600,
                        confirmButtonText: '确定'
                    });

                } catch (error) {
                    console.error('创建操作失败:', error);
                    Swal.close();
                    
                    if (error.message === '用户取消操作' || error.message === '用户取消创建') {
                        await Swal.fire({
                            title: '已取消',
                            text: '操作已被用户取消',
                            icon: 'info',
                            timer: 2000
                        });
                    } else {
                        await Swal.fire({
                            title: '操作失败',
                            html: `
                                <div style="text-align: left;">
                                    <p><strong>错误信息:</strong> ${error.message}</p>
                                </div>
                            `,
                            icon: 'error'
                        });
                    }
                } finally {
                    this.isProcessing = false;
                    this.currentOperation = null;
                    this.updateButtonsState(false);
                    this.updateProgress(0, '');
                }
            }
        }

        // 在GitHub页面初始化
        function initGitHubScript() {
            // 检查是否在仓库页面
            const repoInfo = RepoInfo.getCurrentRepo();
            if (!repoInfo.isRepoPage) {
                console.log('不在GitHub仓库页面，脚本不激活');
                return;
            }

            // 等待页面完全加载
            const checkPageLoaded = () => {
                if (document.readyState === 'complete' && document.querySelector('body')) {
                    setTimeout(() => {
                        try {
                            new ImprovedGitHubUIManager();
                            console.log('GitHub批量工具 v3.8 初始化成功');
                        } catch (error) {
                            console.error('脚本初始化失败:', error);
                        }
                    }, 1500);
                } else {
                    setTimeout(checkPageLoaded, 500);
                }
            };

            checkPageLoaded();
        }

        // 注册Tampermonkey菜单命令
        if (typeof GM_registerMenuCommand !== 'undefined') {
            GM_registerMenuCommand('打开GitHub工具面板', () => {
                const panel = document.getElementById('github-tools-floating');
                if (panel) {
                    panel.style.display = 'block';
                    panel.style.left = '20px';
                    panel.style.top = '20px';
                    const closeBtn = panel.querySelector('.close-btn');
                    closeBtn.textContent = '−';
                } else {
                    initGitHubScript();
                }
            });

            GM_registerMenuCommand('配置GitHub Token', async () => {
                await TokenManager.requestToken();
            });

            GM_registerMenuCommand('测试API连接', () => {
                const repoInfo = RepoInfo.getCurrentRepo();
                if (repoInfo.isRepoPage) {
                    const manager = new ImprovedGitHubUIManager();
                    manager.testAPI();
                } else {
                    Swal.fire('提示', '请在GitHub仓库页面使用此功能', 'info');
                }
            });

            GM_registerMenuCommand('上传文件到仓库', () => {
                const repoInfo = RepoInfo.getCurrentRepo();
                if (repoInfo.isRepoPage) {
                    const manager = new ImprovedGitHubUIManager();
                    manager.handleUploadFiles();
                } else {
                    Swal.fire('提示', '请在GitHub仓库页面使用此功能', 'info');
                }
            });

            GM_registerMenuCommand('删除存储库', () => {
                const repoInfo = RepoInfo.getCurrentRepo();
                if (repoInfo.isRepoPage) {
                    const manager = new ImprovedGitHubUIManager();
                    manager.handleDeleteRepository();
                } else {
                    Swal.fire('提示', '请在GitHub仓库页面使用此功能', 'info');
                }
            });
        }

        // 主入口
        initGitHubScript();
    }

})();
