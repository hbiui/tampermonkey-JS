// ==UserScript==
// @name         GitHub 批量文件管理工具 Pro
// @namespace    http://tampermonkey.net/
// @version      5.1.1
// @description  在GitHub页面添加批量操作按钮：删除所有文件（保留目录结构）、创建.gitignore文件、上传本地文件到仓库和一键删除存储库 - 修复子目录上传问题
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

    // ==================== 配置管理 ====================
    const CONFIG = {
        API_BASE: 'https://api.github.com',
        GITHUB_TOKEN_KEY: 'github_token_v5',
        SCRIPT_ENABLED_KEY: 'script_enabled_v5',
        PANEL_POSITION_KEY: 'panel_position_v5',
        MAX_RETRIES: 3,
        RETRY_DELAY: 1000,
        PAGE_SIZE: 100,
        CHUNK_SIZE: 3,
        UPLOAD_CHUNK_SIZE: 5,
        MAX_FILE_SIZE: 100 * 1024 * 1024,
        ANIMATION_DURATION: 300,
        INIT_RETRY_COUNT: 10,
        INIT_RETRY_DELAY: 1000,
        DELETE_CONFIRM_DELAY: 5000, // 删除确认按钮重置延迟
        DEBUG_MODE: true, // 调试模式
        LOG_UPLOAD_PATHS: true, // 记录上传路径
        PANEL_OPEN_KEY: 'panel_open_v51',
        FAB_POSITION_KEY: 'fab_position_v51'
    };

    // ==================== 样式定义 ====================
    const STYLES = `
        /* ========== 基础按钮样式 ========== */
        .github-tool-btn {
            background: linear-gradient(135deg, #2ea44f 0%, #268f42 100%);
            color: white;
            border: none;
            padding: 10px 16px;
            margin: 4px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
            line-height: 1.4;
            white-space: nowrap;
            vertical-align: middle;
            min-width: 80px;
            box-shadow: 0 2px 4px rgba(46, 164, 79, 0.2);
            position: relative;
            overflow: hidden;
        }

        .github-tool-btn::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 0;
            height: 0;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 50%;
            transform: translate(-50%, -50%);
            transition: width 0.6s, height 0.6s;
        }

        .github-tool-btn:hover::before {
            width: 300px;
            height: 300px;
        }

        .github-tool-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(46, 164, 79, 0.3);
        }

        .github-tool-btn:active {
            transform: translateY(0);
            box-shadow: 0 2px 4px rgba(46, 164, 79, 0.2);
        }

        .github-tool-btn.danger {
            background: linear-gradient(135deg, #dc3545 0%, #bb2d3b 100%);
            box-shadow: 0 2px 4px rgba(220, 53, 69, 0.2);
        }

        .github-tool-btn.danger:hover {
            box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3);
        }

        .github-tool-btn.danger.confirm {
            background: linear-gradient(135deg, #8b0000 0%, #660000 100%);
            animation: pulse-danger 1s infinite;
        }

        .github-tool-btn.danger.confirm:hover {
            background: linear-gradient(135deg, #a00000 0%, #770000 100%);
        }

        @keyframes pulse-danger {
            0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(139, 0, 0, 0.7); }
            70% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(139, 0, 0, 0); }
            100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(139, 0, 0, 0); }
        }

        .github-tool-btn.warning {
            background: linear-gradient(135deg, #fd7e14 0%, #e67e00 100%);
            box-shadow: 0 2px 4px rgba(253, 126, 20, 0.2);
        }

        .github-tool-btn.warning:hover {
            box-shadow: 0 4px 12px rgba(253, 126, 20, 0.3);
        }

        .github-tool-btn.warning.confirm {
            background: linear-gradient(135deg, #cc5500 0%, #994400 100%);
            animation: pulse-warning 1s infinite;
        }

        .github-tool-btn.warning.confirm:hover {
            background: linear-gradient(135deg, #dd6600 0%, #aa5500 100%);
        }

        @keyframes pulse-warning {
            0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(204, 85, 0, 0.7); }
            70% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(204, 85, 0, 0); }
            100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(204, 85, 0, 0); }
        }

        .github-tool-btn.primary {
            background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
            box-shadow: 0 2px 4px rgba(0, 123, 255, 0.2);
        }

        .github-tool-btn.primary:hover {
            box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);
        }

        .github-tool-btn.dark-danger {
            background: linear-gradient(135deg, #8b0000 0%, #660000 100%);
            box-shadow: 0 2px 4px rgba(139, 0, 0, 0.3);
        }

        .github-tool-btn.dark-danger:hover {
            box-shadow: 0 4px 12px rgba(139, 0, 0, 0.4);
        }

        .github-tool-btn.settings {
            background: linear-gradient(135deg, #6c757d 0%, #545b62 100%);
            box-shadow: 0 2px 4px rgba(108, 117, 125, 0.2);
        }

        .github-tool-btn.settings:hover {
            box-shadow: 0 4px 12px rgba(108, 117, 125, 0.3);
        }

        .github-tool-btn:disabled {
            background: linear-gradient(135deg, #adb5bd 0%, #868e96 100%);
            cursor: not-allowed;
            transform: none;
            opacity: 0.6;
            box-shadow: none;
        }

        .github-tool-btn:disabled::before {
            display: none;
        }

        .github-tool-btn.loading {
            pointer-events: none;
            opacity: 0.8;
        }

        .github-tool-btn.loading::after {
            content: '';
            width: 16px;
            height: 16px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top-color: white;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            position: absolute;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        /* ========== 浮动面板样式 ========== */
        .github-tools-floating {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 999999;
            background: linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%);
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
            width: 300px;
            max-width: calc(100vw - 40px);
            overflow: hidden;
            animation: panelSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            backdrop-filter: blur(10px);
            font-size: 13px;
        }

        .github-tools-floating.minimized {
            width: auto;
            height: auto;
            border-radius: 50px;
        }

        .github-tools-floating.minimized .github-tools-body {
            display: none;
        }

        @keyframes panelSlideIn {
            from {
                transform: translateX(120%) scale(0.9);
                opacity: 0;
            }
            to {
                transform: translateX(0) scale(1);
                opacity: 1;
            }
        }

        .github-tools-header {
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: white;
            padding: 14px 16px;
            font-weight: 600;
            font-size: 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: move;
            user-select: none;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .github-tools-header .header-content {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
        }

        .github-tools-header .logo {
            font-size: 18px;
        }

        .github-tools-header .title {
            font-size: 13px;
            font-weight: 600;
            background: linear-gradient(90deg, #ffffff 0%, #ffffff 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: #ffffff;
            background-clip: text;
        }

        .github-tools-header .header-actions {
            display: flex;
            gap: 6px;
            align-items: center;
        }

        .github-tools-header .action-btn {
            background: rgba(255, 255, 255, 0.1);
            border: none;
            color: white;
            cursor: pointer;
            font-size: 16px;
            width: 28px;
            height: 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 6px;
            flex-shrink: 0;
            transition: all 0.2s ease;
        }

        .github-tools-header .action-btn:hover {
            background: rgba(255, 255, 255, 0.2);
            transform: scale(1.05);
        }

        .github-tools-body {
            padding: 16px;
            max-height: 70vh;
            overflow-y: auto;
            overflow-x: hidden;
        }

        .github-tools-body::-webkit-scrollbar {
            width: 6px;
        }

        .github-tools-body::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 3px;
        }

        .github-tools-body::-webkit-scrollbar-thumb {
            background: #888;
            border-radius: 3px;
        }

        .github-tools-body::-webkit-scrollbar-thumb:hover {
            background: #555;
        }

        .github-tools-section {
            margin-bottom: 16px;
            animation: sectionFadeIn 0.3s ease-out;
        }

        @keyframes sectionFadeIn {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .github-tools-section-title {
            font-size: 11px;
            color: #666;
            margin-bottom: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .github-tools-section-title::before {
            content: '';
            width: 3px;
            height: 12px;
            background: linear-gradient(180deg, #4facfe 0%, #00f2fe 100%);
            border-radius: 2px;
        }

        .github-tools-buttons {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
        }

        /* ========== 进度条样式 ========== */
        .progress-container {
            width: 100%;
            background: linear-gradient(90deg, #e0e0e0 0%, #f5f5f5 100%);
            border-radius: 8px;
            margin: 10px 0;
            overflow: hidden;
            box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .progress-bar {
            height: 6px;
            background: linear-gradient(90deg, #4facfe 0%, #00f2fe 100%);
            border-radius: 8px;
            transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
        }

        .progress-bar::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
            animation: shimmer 2s infinite;
        }

        @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }

        .status-text {
            font-size: 11px;
            color: #666;
            margin-top: 6px;
            text-align: center;
            min-height: 16px;
        }

        /* ========== 错误详情样式 ========== */
        .error-details {
            max-height: 180px;
            overflow-y: auto;
            text-align: left;
            margin-top: 12px;
            padding: 12px;
            background: linear-gradient(145deg, #fff5f5 0%, #fff0f0 100%);
            border-radius: 8px;
            border-left: 3px solid #dc3545;
            font-size: 11px;
        }

        .error-details::-webkit-scrollbar {
            width: 4px;
        }

        .error-details::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 2px;
        }

        .error-details::-webkit-scrollbar-thumb {
            background: #dc3545;
            border-radius: 2px;
        }

        .error-item {
            margin-bottom: 8px;
            padding-bottom: 8px;
            border-bottom: 1px dashed rgba(220, 53, 69, 0.2);
        }

        .error-item:last-child {
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
        }

        .error-item strong {
            color: #dc3545;
        }

        .error-item small {
            color: #721c24;
        }

        /* ========== 仓库信息卡片 ========== */
        .repo-info-card {
            background: linear-gradient(145deg, #f8f9fa 0%, #ffffff 100%);
            border-radius: 10px;
            padding: 12px;
            margin-bottom: 12px;
            border: 1px solid #e9ecef;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        .repo-info-card .repo-name {
            font-weight: 700;
            color: #1a1a2e;
            font-size: 13px;
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .repo-info-card .repo-name svg {
            width: 16px;
            height: 16px;
            fill: #1a1a2e;
        }

        .repo-info-card .branch-info {
            font-size: 11px;
            color: #666;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .repo-info-card .branch-info::before {
            content: '';
            width: 8px;
            height: 1px;
            background: #4facfe;
        }

        /* ========== 上传相关样式 ========== */
        .upload-area {
            border: 2px dashed #4facfe;
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            background: linear-gradient(145deg, #f8fbff 0%, #ffffff 100%);
            margin-bottom: 12px;
            font-size: 12px;
            position: relative;
            overflow: hidden;
            min-height: 120px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
        }

        .upload-area::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 0;
            height: 0;
            background: rgba(79, 172, 254, 0.1);
            border-radius: 50%;
            transform: translate(-50%, -50%);
            transition: all 0.4s ease;
        }

        .upload-area:hover {
            background: linear-gradient(145deg, #f0f7ff 0%, #f8fbff 100%);
            border-color: #00f2fe;
            transform: scale(1.02);
            box-shadow: 0 4px 16px rgba(79, 172, 254, 0.2);
        }

        .upload-area:hover::before {
            width: 200px;
            height: 200px;
        }

        .upload-area.drag-over {
            background: linear-gradient(145deg, #e6f7ff 0%, #f0f7ff 100%);
            border-color: #1890ff;
            transform: scale(1.05);
            box-shadow: 0 8px 24px rgba(79, 172, 254, 0.3);
            border-width: 3px;
        }

        .upload-area p {
            margin: 6px 0;
            color: #666;
            position: relative;
            z-index: 1;
        }

        .upload-icon {
            font-size: 36px;
            color: #4facfe;
            margin-bottom: 12px;
            display: block;
            position: relative;
            z-index: 1;
            transition: transform 0.3s ease;
        }

        .upload-area:hover .upload-icon {
            transform: translateY(-4px);
        }

        .file-list-container {
            max-height: 250px;
            overflow-y: auto;
            border: 1px solid #e9ecef;
            border-radius: 10px;
            padding: 8px;
            background: linear-gradient(145deg, #fafbfc 0%, #ffffff 100%);
            margin-top: 12px;
            text-align: left;
            font-size: 12px;
            box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.03);
        }

        .file-list-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px;
            border-bottom: 1px solid #f1f1f1;
            transition: all 0.2s ease;
            border-radius: 6px;
        }

        .file-list-item:hover {
            background: rgba(79, 172, 254, 0.05);
        }

        .file-list-item:last-child {
            border-bottom: none;
        }

        .file-icon {
            margin-right: 10px;
            font-size: 16px;
        }

        .file-info {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-width: 0;
        }

        .file-name {
            font-weight: 600;
            color: #1a1a2e;
            word-break: break-all;
            font-size: 12px;
            margin-bottom: 2px;
        }

        .file-path {
            font-size: 10px;
            color: #888;
            word-break: break-all;
            margin-bottom: 2px;
            font-family: monospace;
        }

        .file-size {
            font-size: 10px;
            color: #999;
            font-weight: 500;
        }

        .remove-file {
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%);
            border: none;
            color: white;
            cursor: pointer;
            font-size: 14px;
            padding: 6px 10px;
            margin-left: 10px;
            flex-shrink: 0;
            border-radius: 6px;
            transition: all 0.2s ease;
            box-shadow: 0 2px 4px rgba(255, 107, 107, 0.2);
        }

        .remove-file:hover {
            transform: scale(1.1);
            box-shadow: 0 4px 8px rgba(255, 107, 107, 0.3);
        }

        .file-stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-top: 12px;
            padding: 12px;
            background: linear-gradient(145deg, #f8f9fa 0%, #ffffff 100%);
            border-radius: 10px;
            border: 1px solid #e9ecef;
        }

        .file-stat {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
        }

        .file-stat-value {
            font-weight: 700;
            font-size: 16px;
            color: #1a1a2e;
            margin-bottom: 2px;
        }

        .file-stat-label {
            color: #666;
            font-size: 10px;
            font-weight: 500;
        }

        .upload-buttons {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
            margin-top: 12px;
        }

        .upload-btn {
            padding: 12px;
            font-size: 12px;
            border-radius: 10px;
            border: 2px solid #e9ecef;
            background: linear-gradient(145deg, #f8f9fa 0%, #ffffff 100%);
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            font-weight: 600;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        .upload-btn:hover {
            background: linear-gradient(145deg, #e9ecef 0%, #f8f9fa 100%);
            border-color: #dee2e6;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .upload-btn.file-btn {
            background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
            color: white;
            border-color: #0056b3;
        }

        .upload-btn.file-btn:hover {
            box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);
        }

        .upload-btn.folder-btn {
            background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%);
            color: white;
            border-color: #1e7e34;
        }

        .upload-btn.folder-btn:hover {
            box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
        }

        .file-conflict-options {
            background: linear-gradient(145deg, #fff9e6 0%, #fff3cd 100%);
            border-radius: 10px;
            padding: 14px;
            margin-top: 12px;
            text-align: left;
            font-size: 12px;
            border: 1px solid #ffeaa7;
            box-shadow: 0 2px 8px rgba(255, 234, 167, 0.2);
        }

        .conflict-option {
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            padding: 8px;
            background: rgba(255, 255, 255, 0.5);
            border-radius: 6px;
            transition: all 0.2s ease;
        }

        .conflict-option:hover {
            background: rgba(255, 255, 255, 0.8);
        }

        .conflict-option input {
            margin-right: 10px;
            transform: scale(1.1);
            cursor: pointer;
        }

        .conflict-option label {
            cursor: pointer;
            flex: 1;
        }

        /* ========== 危险区域样式 ========== */
        .danger-zone {
            margin-top: 16px;
            padding: 16px;
            background: linear-gradient(145deg, #fff5f5 0%, #ffffff 100%);
            border-radius: 12px;
            border: 2px solid #dc3545;
            box-shadow: 0 4px 16px rgba(220, 53, 69, 0.1);
        }

        .danger-zone h3 {
            color: #dc3545;
            margin-top: 0;
            margin-bottom: 10px;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 700;
        }

        .danger-zone h3 svg {
            width: 20px;
            height: 20px;
            fill: currentColor;
        }

        .danger-note {
            background: linear-gradient(145deg, #fff3cd 0%, #ffeaa7 100%);
            border-radius: 8px;
            padding: 12px;
            margin: 10px 0;
            text-align: left;
            font-size: 11px;
            border-left: 3px solid #ffc107;
        }

        .danger-note ul {
            margin: 8px 0 0 0;
            padding-left: 18px;
        }

        .danger-note li {
            margin-bottom: 6px;
            line-height: 1.6;
            color: #856404;
        }

        /* ========== Tampermonkey控制面板样式 ========== */
        .tampermonkey-control-panel {
            background: linear-gradient(145deg, #f8f9fa 0%, #ffffff 100%);
            padding: 20px;
            margin: 20px 0;
            border-radius: 16px;
            border: 1px solid #e9ecef;
            max-width: 520px;
            font-size: 13px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
        }

        .tampermonkey-control-panel h3 {
            margin-top: 0;
            margin-bottom: 16px;
            color: #1a1a2e;
            font-size: 16px;
            font-weight: 700;
            border-bottom: 2px solid #e9ecef;
            padding-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .tampermonkey-control-panel h3 svg {
            width: 24px;
            height: 24px;
            fill: #1a1a2e;
        }

        .tampermonkey-control-panel .github-tools-buttons {
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin-top: 16px;
        }

        .github-tools-toggle {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
            padding: 12px;
            background: linear-gradient(145deg, #f8f9fa 0%, #ffffff 100%);
            border-radius: 10px;
            border: 1px solid #e9ecef;
        }

        .github-tools-toggle span {
            font-weight: 600;
            font-size: 12px;
            color: #1a1a2e;
        }

        /* ========== 开关样式 ========== */
        .switch {
            position: relative;
            display: inline-block;
            width: 50px;
            height: 26px;
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
            background: linear-gradient(145deg, #adb5bd 0%, #868e96 100%);
            transition: .3s;
            border-radius: 26px;
            box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .slider:before {
            position: absolute;
            content: "";
            height: 20px;
            width: 20px;
            left: 3px;
            bottom: 3px;
            background: white;
            transition: .3s cubic-bezier(0.4, 0, 0.2, 1);
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        input:checked + .slider {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
        }

        input:checked + .slider:before {
            transform: translateX(24px);
        }

        input:disabled + .slider {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* ========== 已选择文件状态样式 ========== */
        .selected-files-status {
            background: linear-gradient(145deg, #f0f7ff 0%, #e6f2ff 100%);
            border-radius: 8px;
            padding: 10px 12px;
            margin: 12px 0;
            text-align: left;
            font-size: 12px;
            border-left: 3px solid #4facfe;
            box-shadow: 0 2px 6px rgba(79, 172, 254, 0.1);
            transition: all 0.3s ease;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .selected-files-status.hidden {
            display: none;
        }

        .selected-files-status-content {
            flex: 1;
        }

        .selected-files-status-title {
            font-weight: 700;
            color: #1a1a2e;
            margin-bottom: 4px;
            font-size: 13px;
        }

        .selected-files-status-details {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
        }

        .selected-files-stat {
            display: flex;
            flex-direction: column;
        }

        .selected-files-stat-value {
            font-weight: 700;
            color: #007bff;
            font-size: 13px;
        }

        .selected-files-stat-label {
            color: #666;
            font-size: 10px;
            font-weight: 500;
        }

        .selected-files-status-clear {
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a5a 100%);
            border: none;
            color: white;
            cursor: pointer;
            font-size: 11px;
            padding: 5px 10px;
            border-radius: 6px;
            transition: all 0.2s ease;
            box-shadow: 0 2px 4px rgba(255, 107, 107, 0.2);
            flex-shrink: 0;
            margin-left: 10px;
        }

        .selected-files-status-clear:hover {
            transform: scale(1.05);
            box-shadow: 0 4px 8px rgba(255, 107, 107, 0.3);
        }

        /* ========== 响应式调整 ========== */
        @media (max-width: 1400px) {
            .github-tools-floating {
                width: 260px;
            }
        }

        @media (max-width: 1200px) {
            .github-tools-floating {
                width: 240px;
            }

            .github-tool-btn {
                padding: 8px 12px;
                font-size: 12px;
                min-width: 70px;
            }
        }

        @media (max-width: 768px) {
            .github-tools-floating {
                width: calc(100vw - 40px);
                bottom: 10px;
                right: 10px;
                left: 10px;
                max-width: none;
            }

            .github-tool-btn {
                padding: 8px 10px;
                font-size: 11px;
            }
        }
    
/* v5.1.0 深色模式自适应 */
.github-tools-floating.gt-dark { background: #1f2328; color: #e6edf3; }
.github-tools-floating.gt-dark .github-tools-header { background: #161b22; }
#github-tools-fab.gt-dark { background: linear-gradient(135deg,#0d1117,#161b22); }
`;

    // ==================== 工具函数 ====================
    const Utils = {
        // 延迟函数
        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        // 格式化文件大小
        formatFileSize(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
        },

        // 安全的JSON解析
        safeJSONParse(str, defaultValue = null) {
            try {
                return JSON.parse(str);
            } catch (e) {
                console.error('JSON解析失败:', e);
                return defaultValue;
            }
        },

        // 防抖函数
        debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },

        // 节流函数
        throttle(func, limit) {
            let inThrottle;
            return function(...args) {
                if (!inThrottle) {
                    func.apply(this, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        },

        // 获取仓库名称图标
        getRepoIcon() {
            return `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.6-3.65 3.74.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;
        },

        // 获取警告图标
        getWarningIcon() {
            return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L1 21h22M12 6l7.53 13H4.47M11 10v4h2v-4m-2 6v2h2v-2"/></svg>`;
        },

        // 获取成功图标
        getSuccessIcon() {
            return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`;
        },

        // 获取文件夹路径的层级结构
        getFolderStructure(path) {
            if (!path) return [];
            const parts = path.split('/').filter(p => p);
            const structure = [];
            let currentPath = '';

            for (const part of parts) {
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                structure.push({
                    name: part,
                    path: currentPath
                });
            }

            return structure;
        },

        // 从完整路径中提取文件夹结构
        extractFolderFromPath(fullPath, basePath = '') {
            if (!fullPath) return fullPath;

            // 移除basePath前缀
            let relativePath = fullPath;
            if (basePath && fullPath.startsWith(basePath)) {
                relativePath = fullPath.substring(basePath.length);
                // 移除开头的斜杠
                if (relativePath.startsWith('/')) {
                    relativePath = relativePath.substring(1);
                }
            }

            return relativePath;
        },

        // 修复路径：确保路径格式正确，去除多余的斜杠
        normalizePath(path) {
            if (!path) return '';
            // 移除开头和结尾的斜杠，并替换多个斜杠为单个
            return path.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\/+/g, '/');
        },

        // 合并路径，正确处理空路径和斜杠
        joinPath(basePath, relativePath) {
            if (!basePath) return Utils.normalizePath(relativePath);
            if (!relativePath) return Utils.normalizePath(basePath);

            const normalizedBase = Utils.normalizePath(basePath);
            const normalizedRelative = Utils.normalizePath(relativePath);

            if (!normalizedBase) return normalizedRelative;
            if (!normalizedRelative) return normalizedBase;

            return `${normalizedBase}/${normalizedRelative}`;
        },

        // 修复：安全的路径编码函数 - 改进版本
        encodePathForAPI(path) {
            if (!path) return '';

            if (CONFIG.DEBUG_MODE) {
                console.log('[Utils.encodePathForAPI] 原始路径:', path);
            }

            // 先规范化路径
            const normalizedPath = Utils.normalizePath(path);

            // 对路径进行分段编码，正确处理特殊字符
            const encodedPath = normalizedPath.split('/')
                .map(segment => {
                    // 先解码已编码的部分，避免双重编码
                    let decodedSegment = segment;
                    try {
                        decodedSegment = decodeURIComponent(segment);
                    } catch (e) {
                        // 如果解码失败，保持原样
                        if (CONFIG.DEBUG_MODE) {
                            console.log(`[Utils.encodePathForAPI] 解码失败 ${segment}:`, e);
                        }
                    }

                    // 对每个部分进行编码
                    return encodeURIComponent(decodedSegment);
                })
                .join('/');

            if (CONFIG.DEBUG_MODE) {
                console.log('[Utils.encodePathForAPI] 编码后路径:', encodedPath);
            }

            return encodedPath;
        },

        // 修复：构建完整的GitHub API文件路径
        buildGitHubFilePath(basePath, relativePath) {
            // 合并基础路径和相对路径
            const fullPath = Utils.joinPath(basePath, relativePath);

            if (CONFIG.DEBUG_MODE) {
                console.log('[Utils.buildGitHubFilePath]', {
                    basePath,
                    relativePath,
                    fullPath
                });
            }

            // 确保路径以正确格式返回
            return Utils.normalizePath(fullPath);
        },

        // 调试日志
        debugLog(...args) {
            if (CONFIG.DEBUG_MODE) {
                console.log('[GitHub工具调试]', ...args);
            }
        }
    };

    // ==================== 全局状态管理 ====================
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

        static getPanelPosition() {
            return GM_getValue(CONFIG.PANEL_POSITION_KEY, null);
        }

        static setPanelPosition(position) {
            if (position && typeof position === 'object') {
                GM_setValue(CONFIG.PANEL_POSITION_KEY, position);
            }
        }
    }

    // ==================== GitHub Token 管理 ====================
    class TokenManager {
        static getToken() {
            const token = GM_getValue(CONFIG.GITHUB_TOKEN_KEY, '');
            if (!token) {
                console.warn('[TokenManager] GitHub Token 未设置');
                return '';
            }
            return token;
        }

        static setToken(token) {
            GM_setValue(CONFIG.GITHUB_TOKEN_KEY, token);
            console.log('[TokenManager] GitHub Token 已保存');
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
            const { value: token, isDismissed } = await Swal.fire({
                title: '🔐 配置 GitHub Token',
                input: 'password',
                inputLabel: '需要 GitHub Personal Access Token（需要 repo 权限）',
                inputPlaceholder: '输入您的 GitHub Token',
                inputAttributes: {
                    autocapitalize: 'off',
                    autocomplete: 'off'
                },
                showCancelButton: true,
                confirmButtonText: '✅ 保存并验证',
                cancelButtonText: '❌ 取消',
                backdrop: true,
                allowOutsideClick: false,
                heightAuto: false,
                customClass: {
                    popup: 'token-modal'
                },
                inputValidator: (value) => {
                    if (!value || value.trim() === '') {
                        return '请输入 Token！';
                    }
                    if (value.length < 10) {
                        return 'Token 长度太短，请检查是否正确';
                    }
                    return null;
                }
            });

            if (isDismissed) {
                return null;
            }

            if (token) {
                this.setToken(token);

                // 测试 Token 是否有效
                Swal.fire({
                    title: '🔄 验证 Token...',
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });

                const isValid = await this.testToken(token);
                Swal.close();

                if (isValid) {
                    await Swal.fire({
                        title: '✅ Token 验证成功',
                        text: 'Token 已保存并验证通过',
                        icon: 'success',
                        timer: 2000,
                        showConfirmButton: false
                    });
                } else {
                    await Swal.fire({
                        title: '⚠️ Token 验证失败',
                        text: 'Token 已保存但验证失败，请检查权限（需要 repo 权限）',
                        icon: 'warning',
                        confirmButtonText: '知道了'
                    });
                }
                return token;
            }
            return null;
        }

        static async testToken(token) {
            try {
                const response = await fetch(`${CONFIG.API_BASE}/user`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });

                if (response.ok) {
                    const userData = await response.json();
                    console.log('[TokenManager] Token 验证成功，用户:', userData.login);
                    return true;
                } else {
                    console.error('[TokenManager] Token 验证失败，状态码:', response.status);
                    return false;
                }
            } catch (error) {
                console.error('[TokenManager] Token 验证错误:', error);
                return false;
            }
        }
    }

    // ==================== 仓库信息管理 ====================
    class RepoInfo {
        static getCurrentRepo() {
            try {
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
            } catch (error) {
                console.error('[RepoInfo] 获取仓库信息失败:', error);
                return { isRepoPage: false };
            }
        }

        static getCurrentBranch() {
            try {
                // 尝试从 URL 获取分支信息
                const pathParts = window.location.pathname.split('/');
                if (pathParts.length > 4 && pathParts[3] === 'tree') {
                    // 修复: 只返回tree后的第一个部分(分支名),不包含后续的路径
                    return decodeURIComponent(pathParts[4]);
                }
                if (pathParts.length > 4 && pathParts[3] === 'blob') {
                    // blob视图也只取第一个部分
                    return decodeURIComponent(pathParts[4]);
                }

                // 尝试从页面元素获取
                const branchSelectors = [
                    '[data-hotkey="w"] .css-truncate-target',
                    '#branch-select-menu summary span',
                    '.commit-ref',
                    '[data-branch-name]',
                    '.branch-name',
                    'head-ref',
                    'base-ref'
                ];

                for (const selector of branchSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        const text = element.textContent.trim();
                        if (text && !text.includes('...') && text.length < 100) {
                            return text;
                        }
                    }
                }

                // 从 URL 参数获取
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.has('branch')) {
                    return urlParams.get('branch');
                }

                return 'main';
            } catch (error) {
                console.error('[RepoInfo] 获取分支信息失败:', error);
                return 'main';
            }
        }

       // 修复:获取当前所在目录路径 - v5.1.1 彻底修复版本
        static getCurrentDirectoryPath() {
            try {
                const pathname = window.location.pathname;
                Utils.debugLog('[RepoInfo] 当前URL路径:', pathname);

                // GitHub URL格式: /owner/repo/tree/branch/path/to/folder
                // 或: /owner/repo/blob/branch/path/to/file.ext

                // 使用正则表达式精确匹配
                const treeMatch = pathname.match(/^\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)(?:\/(.+))?$/);
                const blobMatch = pathname.match(/^\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)(?:\/(.+))?$/);

                let currentPath = '';

                if (treeMatch) {
                    // tree视图 - 直接返回路径
                    currentPath = treeMatch[4] || '';
                    Utils.debugLog('[RepoInfo] tree视图路径:', currentPath);
                } else if (blobMatch) {
                    // blob视图 - 需要去掉文件名
                    const fullPath = blobMatch[4] || '';
                    if (fullPath) {
                        const lastSlash = fullPath.lastIndexOf('/');
                        currentPath = lastSlash > 0 ? fullPath.substring(0, lastSlash) : '';
                    }
                    Utils.debugLog('[RepoInfo] blob视图路径:', currentPath);
                }

                // 解码URL编码
                if (currentPath) {
                    try {
                        currentPath = decodeURIComponent(currentPath);
                    } catch (e) {
                        console.warn('[RepoInfo] URL解码失败:', e);
                    }
                }

                Utils.debugLog('[RepoInfo] 最终解析路径:', currentPath);
                return currentPath;

            } catch (error) {
                console.error('[RepoInfo] 获取当前目录路径失败:', error);
                return '';
            }
        }
    }

    // ==================== 增强的 GitHub API 调用器 ====================
    class EnhancedGitHubAPI {
        constructor() {
            this.baseUrl = CONFIG.API_BASE;
            this.rateLimitRemaining = null;
            this.rateLimitReset = null;
            this.repoInfo = null;
            this.branch = null;
        }

        setRepoInfo(repoInfo) {
            this.repoInfo = repoInfo;
            Utils.debugLog('[EnhancedGitHubAPI] 设置仓库信息:', repoInfo);
        }

        setBranch(branch) {
            this.branch = branch;
            Utils.debugLog('[EnhancedGitHubAPI] 设置分支:', branch);
        }

        updateRateLimitInfo(response) {
            try {
                if (response && response.responseHeaders) {
                    const remaining = response.responseHeaders.match(/X-RateLimit-Remaining:\s*(\d+)/i);
                    const reset = response.responseHeaders.match(/X-RateLimit-Reset:\s*(\d+)/i);

                    if (remaining && remaining[1]) {
                        this.rateLimitRemaining = parseInt(remaining[1], 10);
                        console.log(`[EnhancedGitHubAPI] API 剩余请求次数: ${this.rateLimitRemaining}`);
                    }

                    if (reset && reset[1]) {
                        this.rateLimitReset = parseInt(reset[1], 10);
                    }
                }
            } catch (error) {
                console.error('[EnhancedGitHubAPI] 解析速率限制信息失败:', error);
            }
        }

        async _requestWithRetry(method, endpoint, data = null, retryCount = 0) {
            const token = TokenManager.getToken();
            if (!token) {
                throw new Error('未设置 GitHub Token，请先配置 Token');
            }

            return new Promise((resolve, reject) => {
                const options = {
                    method: method,
                    url: `${this.baseUrl}${endpoint}`,
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                        'User-Agent': 'GitHub-Batch-Tools/5.1.1'
                    },
                    timeout: 30000,
                    onload: (response) => {
                        console.log(`[EnhancedGitHubAPI] API 响应: ${method} ${endpoint} - 状态: ${response.status}`);

                        // 更新速率限制信息
                        this.updateRateLimitInfo(response);

                        // 处理 401 错误
                        if (response.status === 401) {
                            reject(new Error('Token 无效或已过期，请重新配置 Token'));
                            return;
                        }

                        // 处理 403 错误
                        if (response.status === 403) {
                            const headers = response.responseHeaders || '';
                            if (headers.includes('X-RateLimit-Remaining: 0') || headers.includes('X-RateLimit-Remaining:0')) {
                                const resetTime = this.rateLimitReset ? new Date(this.rateLimitReset * 1000) : new Date();
                                reject(new Error(`API 速率限制已达上限，请在 ${resetTime.toLocaleTimeString()} 后重试`));
                                return;
                            } else {
                                reject(new Error('权限不足，请检查 Token 是否具有 repo 权限'));
                                return;
                            }
                        }

                        // 处理 404 错误
                        if (response.status === 404) {
                            resolve(null);
                            return;
                        }

                       // 处理成功响应
                        if (response.status >= 200 && response.status < 300) {
                            try {
                                // 处理空响应
                                if (!response.responseText || response.responseText === '') {
                                    if (method === 'DELETE') {
                                        resolve({ success: true });
                                    } else if (method === 'PUT') {
                                        // PUT请求成功但无响应体，视为成功
                                        console.warn('[EnhancedGitHubAPI] PUT成功但响应为空');
                                        resolve({ success: true, status: response.status });
                                    } else {
                                        resolve({ success: true });
                                    }
                                    return;
                                }

                                const json = JSON.parse(response.responseText);
                                resolve(json);
                            } catch (e) {
                                console.error('[EnhancedGitHubAPI] JSON 解析错误:', e);
                                console.error('[EnhancedGitHubAPI] 响应文本:', response.responseText);
                                // 即使解析失败，如果状态码是成功的，也返回成功
                                resolve({ success: true, status: response.status, rawResponse: response.responseText });
                            }
                        } else {
                            // 处理 422 错误
                            if (response.status === 422) {
                                try {
                                    const errorData = JSON.parse(response.responseText);
                                    let errorMsg = '请求无法处理 (422 错误)';
                                    if (errorData.message) {
                                        errorMsg += `: ${errorData.message}`;
                                    }
                                    if (errorData.errors && errorData.errors.length > 0) {
                                        const errorDetails = errorData.errors.map(e => e.message || e.code || e.resource).join(', ');
                                        errorMsg += ` - ${errorDetails}`;
                                    }
                                    reject(new Error(errorMsg));
                                } catch {
                                    reject(new Error(`请求无法处理 (422 错误): ${response.responseText}`));
                                }
                                return;
                            }

                            // 重试逻辑
                            if (retryCount < CONFIG.MAX_RETRIES) {
                                console.log(`[EnhancedGitHubAPI] 请求失败，第 ${retryCount + 1} 次重试...`);
                                setTimeout(() => {
                                    this._requestWithRetry(method, endpoint, data, retryCount + 1)
                                        .then(resolve)
                                        .catch(reject);
                                }, CONFIG.RETRY_DELAY * (retryCount + 1));
                            } else {
                                reject(new Error(`API 请求失败: ${response.status} - ${response.statusText || '未知错误'}`));
                            }
                        }
                    },
                    onerror: (error) => {
                        console.error('[EnhancedGitHubAPI] API 请求错误:', error);
                        if (retryCount < CONFIG.MAX_RETRIES) {
                            console.log(`[EnhancedGitHubAPI] 网络错误，第 ${retryCount + 1} 次重试...`);
                            setTimeout(() => {
                                this._requestWithRetry(method, endpoint, data, retryCount + 1)
                                    .then(resolve)
                                    .catch(reject);
                            }, CONFIG.RETRY_DELAY * (retryCount + 1));
                        } else {
                            reject(new Error(`网络错误: ${error.error || '未知网络错误'}`));
                        }
                    },
                    ontimeout: () => {
                        console.error('[EnhancedGitHubAPI] API 请求超时');
                        if (retryCount < CONFIG.MAX_RETRIES) {
                            console.log(`[EnhancedGitHubAPI] 请求超时，第 ${retryCount + 1} 次重试...`);
                            setTimeout(() => {
                                this._requestWithRetry(method, endpoint, data, retryCount + 1)
                                    .then(resolve)
                                    .catch(reject);
                            }, CONFIG.RETRY_DELAY * (retryCount + 1));
                        } else {
                            reject(new Error('API 请求超时，请检查网络连接'));
                        }
                    }
                };

                if (data) {
                    options.data = JSON.stringify(data);
                }

                GM_xmlhttpRequest(options);
            });
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

        // 修复：检查文件是否存在，使用正确的路径编码 - 改进版本
        async checkFileExists(filePath) {
            try {
                // 使用安全的路径编码函数
                const encodedPath = Utils.encodePathForAPI(filePath);
                const endpoint = `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/contents/${encodedPath}`;
                const params = new URLSearchParams();
                if (this.branch) {
                    params.append('ref', this.branch);
                }

                const queryString = params.toString();
                const fullEndpoint = queryString ? `${endpoint}?${queryString}` : endpoint;

                Utils.debugLog(`[EnhancedGitHubAPI] 检查文件是否存在: ${filePath}, 编码后: ${encodedPath}`);

                const result = await this.get(fullEndpoint);
                return result ? result.sha : null;
            } catch (error) {
                if (error.message && error.message.includes('404')) {
                    return null;
                }

                // 记录详细错误信息
                Utils.debugLog(`[EnhancedGitHubAPI] 检查文件失败 ${filePath}:`, error);
                throw error;
            }
        }

        // 修复：创建或更新文件，使用正确的路径编码 - 改进版本
        async createOrUpdateFile(filePath, content, sha = null, message = null) {
            // 使用安全的路径编码函数
            const encodedPath = Utils.encodePathForAPI(filePath);
            const endpoint = `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/contents/${encodedPath}`;

            const requestData = {
                message: message || `上传文件: ${filePath} (由 GitHub 批量工具执行)`,
                content: content,
                branch: this.branch
            };

            if (sha) {
                requestData.sha = sha;
            }

            Utils.debugLog(`[EnhancedGitHubAPI] 创建/更新文件:`, {
                filePath,
                encodedPath,
                sha: sha || '无',
                message: requestData.message
            });

            return await this.put(endpoint, requestData);
        }

        async deleteRepository(owner, repo) {
            const endpoint = `/repos/${owner}/${repo}`;
            console.log(`[EnhancedGitHubAPI] 准备删除存储库: ${owner}/${repo}`);
            return await this.delete(endpoint);
        }

        async getRepositoryInfo(owner, repo) {
            const endpoint = `/repos/${owner}/${repo}`;
            return await this.get(endpoint);
        }
    }

    // ==================== 文件操作类 ====================
    class FileOperations {
        constructor(api) {
            this.api = api;
            this.repoInfo = RepoInfo.getCurrentRepo();
            this.branch = RepoInfo.getCurrentBranch();

            if (this.api) {
                this.api.setRepoInfo(this.repoInfo);
                this.api.setBranch(this.branch);
            }

            Utils.debugLog('[FileOperations] 初始化:', {
                repoInfo: this.repoInfo,
                branch: this.branch
            });
        }

        // 更新仓库信息
        refreshRepoInfo() {
            this.repoInfo = RepoInfo.getCurrentRepo();
            this.branch = RepoInfo.getCurrentBranch();

            if (this.api) {
                this.api.setRepoInfo(this.repoInfo);
                this.api.setBranch(this.branch);
            }

            Utils.debugLog('[FileOperations] 刷新仓库信息:', {
                repoInfo: this.repoInfo,
                branch: this.branch
            });
        }

        async getAllFiles(path = '', allFiles = []) {
            try {
                console.log(`[FileOperations] 获取文件列表: ${path || '根目录'} (分支: ${this.branch})`);

                let endpoint = `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/contents/${Utils.encodePathForAPI(path) || ''}`;
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
                    console.warn(`[FileOperations] 路径 ${path} 下无内容或不是目录`);
                    return allFiles;
                }

                const files = [];
                const directories = [];

                for (const item of contents) {
                    if (item.type === 'file') {
                        if (!item.sha) {
                            console.warn(`[FileOperations] 文件 ${item.path} 缺少 SHA 值，跳过`);
                            continue;
                        }
                        files.push(item);
                        console.log(`[FileOperations] 找到文件: ${item.path}, SHA: ${item.sha.substring(0, 8)}...`);
                    } else if (item.type === 'dir') {
                        directories.push(item);
                    }
                }

                allFiles.push(...files);

                // 递归获取子目录中的文件
                for (let i = 0; i < directories.length; i++) {
                    const dir = directories[i];
                    await this.getAllFiles(dir.path, allFiles);

                    if (i < directories.length - 1) {
                        await Utils.delay(300);
                    }
                }

                console.log(`[FileOperations] 总计找到 ${allFiles.length} 个文件`);
                return allFiles;
            } catch (error) {
                console.error(`[FileOperations] 获取文件列表失败 (路径: ${path}):`, error);
                throw error;
            }
        }

        async getAllDirectories(path = '', allDirs = [], includeRoot = true) {
            try {
                console.log(`[FileOperations] 获取目录列表: ${path || '根目录'} (分支: ${this.branch})`);

                let endpoint = `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/contents/${Utils.encodePathForAPI(path) || ''}`;
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

                // 递归获取子目录
                for (let i = 0; i < directories.length; i++) {
                    const dir = directories[i];
                    await this.getAllDirectories(dir.path, allDirs, false);

                    if (i < directories.length - 1) {
                        await Utils.delay(300);
                    }
                }

                console.log(`[FileOperations] 总计找到 ${allDirs.length} 个目录`);
                return allDirs;
            } catch (error) {
                console.error(`[FileOperations] 获取目录列表失败 (路径: ${path}):`, error);
                throw error;
            }
        }

        async deleteFile(file) {
            try {
                console.log(`[FileOperations] 删除文件: ${file.path}, 使用 SHA: ${file.sha ? file.sha.substring(0, 8) + '...' : '未知'}`);

                if (!file.sha) {
                    console.error(`[FileOperations] 文件 ${file.path} 缺少 SHA 值，无法删除`);
                    return {
                        success: false,
                        file: file.path,
                        error: '文件缺少 SHA 值，无法删除。请重新扫描文件列表。'
                    };
                }

                const encodedPath = Utils.encodePathForAPI(file.path);
                const endpoint = `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/contents/${encodedPath}`;

                const requestData = {
                    message: `删除文件: ${file.name} (由 GitHub 批量工具执行)`,
                    sha: file.sha,
                    branch: this.branch
                };

                const result = await this.api.delete(endpoint, requestData);
                console.log(`[FileOperations] 文件删除成功: ${file.path}`);
                return { success: true, file: file.path };
            } catch (error) {
                console.error(`[FileOperations] 删除文件失败 ${file.path}:`, error);

                if (error.message && error.message.includes('422')) {
                    return {
                        success: false,
                        file: file.path,
                        error: `SHA 值不匹配 (422 错误)。可能是文件已被修改或 SHA 不正确。原始错误: ${error.message}`
                    };
                }

                return {
                    success: false,
                    file: file.path,
                    error: error.message || '未知错误'
                };
            }
        }

        async createGitignoreFile(directory) {
            try {
                const dirPath = directory.path || '';
                const gitignorePath = dirPath ? `${dirPath}/.gitignore` : '.gitignore';

                console.log(`[FileOperations] 检查 .gitignore 是否存在: ${gitignorePath}`);

                const checkEndpoint = `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/contents/${Utils.encodePathForAPI(gitignorePath)}`;
                const params = new URLSearchParams();
                if (this.branch) {
                    params.append('ref', this.branch);
                }

                const queryString = params.toString();
                const fullCheckEndpoint = queryString ? `${checkEndpoint}?${queryString}` : checkEndpoint;

                try {
                    const existing = await this.api.get(fullCheckEndpoint);
                    if (existing) {
                        console.log(`[FileOperations] .gitignore 已存在: ${gitignorePath}`);
                        return { skipped: true, path: dirPath || '根目录' };
                    }
                } catch (error) {
                    if (!error.message || !error.message.includes('404')) {
                        throw error;
                    }
                }

                console.log(`[FileOperations] 创建 .gitignore: ${gitignorePath}`);

                const endpoint = `/repos/${this.repoInfo.owner}/${this.repoInfo.repo}/contents/${Utils.encodePathForAPI(gitignorePath)}`;

                const gitignoreContent = `# 自动生成的 .gitignore 文件
# 创建时间: ${new Date().toLocaleString('zh-CN')}
# 由 GitHub 批量工具生成

# 此文件用于保留空文件夹的 Git 目录结构
# 当文件夹中的所有文件被删除后，Git 会忽略空文件夹
# 这个 .gitignore 文件确保文件夹被 Git 跟踪并保留结构

# 文件夹已清空，保留目录结构
`;

                const content = btoa(unescape(encodeURIComponent(gitignoreContent)));

                const requestData = {
                    message: `添加 .gitignore 文件到 ${dirPath || '根目录'} (保留目录结构)`,
                    content: content,
                    branch: this.branch
                };

                const result = await this.api.put(endpoint, requestData);
                console.log(`[FileOperations] .gitignore 创建成功: ${gitignorePath}`);
                return { success: true, path: dirPath || '根目录' };
            } catch (error) {
                console.error(`[FileOperations] 创建 .gitignore 失败 ${directory.path || '根目录'}:`, error);
                return {
                    success: false,
                    path: directory.path || '根目录',
                    error: error.message || '未知错误'
                };
            }
        }

        async deleteFilesAndKeepStructure() {
            try {
                console.log('[FileOperations] 开始删除文件并保留结构操作');

                const files = await this.getAllFiles();

                if (files.length === 0) {
                    return {
                        success: false,
                        message: '仓库中没有文件可删除',
                        filesDeleted: 0,
                        filesFailed: 0,
                        gitignoreCreated: 0,
                        gitignoreSkipped: 0,
                        gitignoreFailed: 0,
                        failedFiles: [],
                        failedGitignores: []
                    };
                }

                let filesDeleted = 0;
                let filesFailed = 0;
                const failedFiles = [];

                // 删除文件
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

                    // 每删除 3 个文件后延迟，避免 API 速率限制
                    if ((i + 1) % 3 === 0 && i < files.length - 1) {
                        await Utils.delay(800);
                    }
                }

                const directories = await this.getAllDirectories();

                let gitignoreCreated = 0;
                let gitignoreSkipped = 0;
                let gitignoreFailed = 0;
                const failedGitignores = [];

                // 创建 .gitignore 文件
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

                    if ((i + 1) % 2 === 0 && i < directories.length - 1) {
                        await Utils.delay(1000);
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
                console.error('[FileOperations] 删除文件并保留结构操作失败:', error);
                return {
                    success: false,
                    message: `操作失败: ${error.message || '未知错误'}`,
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

        getUploadManager() {
            return new FileUploadManager(this.api, this.repoInfo, this.branch);
        }
    }

    // ==================== 文件上传管理器 ====================
    class FileUploadManager {
        constructor(api, repoInfo, branch) {
            this.api = api;
            this.repoInfo = repoInfo;
            this.branch = branch;
            this.files = [];
            this.uploadQueue = [];
            this.conflictStrategy = 'overwrite';
            this.onProgress = null;
            this.folderBasePath = '';
            this.selectedFolderName = '';
            this.onFileListChanged = null;

            Utils.debugLog('[FileUploadManager] 初始化:', {
                repoInfo,
                branch
            });
        }

        async selectFilesAndFolders() {
            return new Promise((resolve) => {
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.multiple = true;
                fileInput.id = 'multi-file-input';
                fileInput.style.display = 'none';

                document.body.appendChild(fileInput);

                fileInput.addEventListener('change', (e) => {
                    const selectedFiles = Array.from(e.target.files);
                    this.processSelectedFiles(selectedFiles, false);
                    resolve(selectedFiles);
                    document.body.removeChild(fileInput);
                });

                fileInput.click();
            });
        }

        async selectFolders() {
            return new Promise((resolve) => {
                const folderInput = document.createElement('input');
                folderInput.type = 'file';
                folderInput.webkitdirectory = true;
                folderInput.multiple = false;
                folderInput.id = 'folder-input';
                folderInput.style.display = 'none';

                document.body.appendChild(folderInput);

                folderInput.addEventListener('change', async (e) => {
                    const selectedFiles = Array.from(e.target.files);

                    let folderName = '';
                    if (selectedFiles.length > 0 && selectedFiles[0].webkitRelativePath) {
                        const firstPath = selectedFiles[0].webkitRelativePath;
                        const pathParts = firstPath.split('/');
                        if (pathParts.length > 0) {
                            folderName = pathParts[0];
                        }
                    }

                    this.selectedFolderName = folderName;
                    await this.processSelectedFiles(selectedFiles, true);
                    resolve(selectedFiles);
                    document.body.removeChild(folderInput);
                });

                folderInput.click();
            });
        }

        async processSelectedFiles(files, isFolderSelection = false) {
            const newFiles = [];

            for (const file of files) {
                if (file.size > CONFIG.MAX_FILE_SIZE) {
                    console.warn(`[FileUploadManager] 文件 ${file.name} 超过 ${CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB 限制，跳过`);
                    continue;
                }

                let relativePath;

                if (isFolderSelection && file.webkitRelativePath) {
                    // 对于文件夹选择，使用 webkitRelativePath
                    relativePath = file.webkitRelativePath;
                } else {
                    // 对于文件选择，直接使用文件名
                    relativePath = file.name;
                }

                newFiles.push({
                    file: file,
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    relativePath: relativePath,
                    lastModified: file.lastModified,
                    status: 'pending'
                });
            }

            this.files.push(...newFiles);
            console.log(`[FileUploadManager] 添加了 ${newFiles.length} 个新文件，总计 ${this.files.length} 个文件`);

            if (this.onFileListChanged) {
                this.onFileListChanged();
            }

            if (isFolderSelection && newFiles.length > 0) {
                console.log('[FileUploadManager] 文件夹结构示例:');
                newFiles.slice(0, 3).forEach((fileInfo, index) => {
                    console.log(`  ${index + 1}. ${fileInfo.relativePath}`);
                });
            }
        }

        async handleDropItems(items) {
            const newFiles = [];

            for (const item of items) {
                if (item.kind === 'file') {
                    const file = item.getAsFile();
                    if (file) {
                        if (file.size > CONFIG.MAX_FILE_SIZE) {
                            console.warn(`[FileUploadManager] 文件 ${file.name} 超过 ${CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB 限制，跳过`);
                            continue;
                        }

                        newFiles.push({
                            file: file,
                            name: file.name,
                            size: file.size,
                            type: file.type,
                            relativePath: file.name,
                            lastModified: file.lastModified,
                            status: 'pending'
                        });
                    }
                }
            }

            this.files.push(...newFiles);
            console.log(`[FileUploadManager] 通过拖放添加了 ${newFiles.length} 个文件，总计 ${this.files.length} 个文件`);

            if (this.onFileListChanged) {
                this.onFileListChanged();
            }
        }

        async handleDropItemsWithStructure(items) {
            console.log('[FileUploadManager] 处理拖放项目（带结构）:', items);

            const newFiles = [];

            for (const item of items) {
                const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;

                if (entry) {
                    const files = await this.traverseEntry(entry, '');
                    newFiles.push(...files);
                } else if (item.kind === 'file') {
                    const file = item.getAsFile();
                    if (file) {
                        if (file.size > CONFIG.MAX_FILE_SIZE) {
                            console.warn(`[FileUploadManager] 文件 ${file.name} 超过 ${CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB 限制，跳过`);
                            continue;
                        }

                        newFiles.push({
                            file: file,
                            name: file.name,
                            size: file.size,
                            type: file.type,
                            relativePath: file.name,
                            lastModified: file.lastModified,
                            status: 'pending'
                        });
                    }
                }
            }

            this.files.push(...newFiles);
            console.log(`[FileUploadManager] 通过拖放添加了 ${newFiles.length} 个文件（带结构），总计 ${this.files.length} 个文件`);

            if (this.onFileListChanged) {
                this.onFileListChanged();
            }
        }

        async traverseEntry(entry, currentPath) {
            const files = [];

            return new Promise((resolve) => {
                if (entry.isFile) {
                    entry.file((file) => {
                        if (file.size > CONFIG.MAX_FILE_SIZE) {
                            console.warn(`[FileUploadManager] 文件 ${file.name} 超过 ${CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB 限制，跳过`);
                            resolve([]);
                            return;
                        }

                        const relativePath = currentPath ? `${currentPath}/${file.name}` : file.name;

                        files.push({
                            file: file,
                            name: file.name,
                            size: file.size,
                            type: file.type,
                            relativePath: relativePath,
                            lastModified: file.lastModified,
                            status: 'pending'
                        });

                        resolve(files);
                    });
                } else if (entry.isDirectory) {
                    const dirReader = entry.createReader();

                    dirReader.readEntries(async (entries) => {
                        const subFiles = [];

                        for (const subEntry of entries) {
                            const subPath = currentPath ? `${currentPath}/${subEntry.name}` : subEntry.name;
                            const result = await this.traverseEntry(subEntry, subPath);
                            subFiles.push(...result);
                        }

                        resolve(subFiles);
                    });
                } else {
                    resolve([]);
                }
            });
        }

        getFileStats() {
            const stats = {
                totalFiles: this.files.length,
                totalSize: 0,
                fileTypes: {},
                folders: 0
            };

            const uniqueFolders = new Set();

            for (const file of this.files) {
                stats.totalSize += file.size;

                const ext = file.name.split('.').pop().toLowerCase();
                stats.fileTypes[ext] = (stats.fileTypes[ext] || 0) + 1;

                if (file.relativePath.includes('/')) {
                    const folderPath = file.relativePath.substring(0, file.relativePath.lastIndexOf('/'));
                    if (folderPath) {
                        const pathParts = folderPath.split('/');
                        let currentPath = '';
                        for (const part of pathParts) {
                            currentPath = currentPath ? `${currentPath}/${part}` : part;
                            uniqueFolders.add(currentPath);
                        }
                    }
                }
            }

            stats.folders = uniqueFolders.size;

            return stats;
        }

        // 修复：获取完整的仓库路径 - v5.1.1 彻底修复版本
        getRepositoryPath(relativePath) {
            // 获取当前目录路径
            const currentDirectoryPath = RepoInfo.getCurrentDirectoryPath();

            Utils.debugLog(`[FileUploadManager] 路径计算开始:`, {
                当前目录: currentDirectoryPath,
                相对路径: relativePath
            });

            // 如果没有当前目录，直接返回相对路径
            if (!currentDirectoryPath || currentDirectoryPath === '') {
                Utils.debugLog(`[FileUploadManager] 在根目录，直接使用相对路径:`, relativePath);
                return Utils.normalizePath(relativePath);
            }

            // 使用工具函数构建完整的文件路径
            const fullPath = Utils.buildGitHubFilePath(currentDirectoryPath, relativePath);

            Utils.debugLog(`[FileUploadManager] 路径计算完成:`, {
                当前目录: currentDirectoryPath,
                相对路径: relativePath,
                完整路径: fullPath
            });

            return fullPath;
        }

        clearAllFiles() {
            this.files = [];
            console.log('[FileUploadManager] 已清除所有文件');

            if (this.onFileListChanged) {
                this.onFileListChanged();
            }
        }

        removeFile(index) {
            if (index >= 0 && index < this.files.length) {
                this.files.splice(index, 1);
                console.log(`[FileUploadManager] 已移除文件，剩余 ${this.files.length} 个文件`);

                if (this.onFileListChanged) {
                    this.onFileListChanged();
                }
            }
        }

        readFileAsBase64(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const content = e.target.result;
                        const base64 = content.split(',')[1];
                        resolve(base64);
                    } catch (error) {
                        reject(error);
                    }
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        async checkConflicts() {
            const conflicts = [];

            for (const fileInfo of this.files) {
                try {
                    // 使用完整的仓库路径检查冲突
                    const repositoryPath = this.getRepositoryPath(fileInfo.relativePath);
                    const existingSha = await this.api.checkFileExists(repositoryPath);

                    if (existingSha) {
                        conflicts.push({
                            fileInfo: fileInfo,
                            existingSha: existingSha,
                            path: repositoryPath,
                            relativePath: fileInfo.relativePath
                        });
                    }
                } catch (error) {
                    console.error(`[FileUploadManager] 检查文件冲突失败 ${fileInfo.relativePath}:`, error);
                }
            }

            return conflicts;
        }

        async handleConflicts(conflicts) {
            if (conflicts.length === 0) {
                return { strategy: 'overwrite', renameFiles: [] };
            }

            const currentDirectoryPath = RepoInfo.getCurrentDirectoryPath();
            const uploadLocation = currentDirectoryPath ? `📁 ${currentDirectoryPath}` : '📁 根目录';

            const conflictListHtml = conflicts.slice(0, 10).map((conflict, index) => {
                const displayPath = this.getRepositoryPath(conflict.relativePath);
                return `<div style="padding: 6px; background: rgba(220, 53, 69, 0.05); border-radius: 4px; margin-bottom: 4px;">
                    <strong>${index + 1}.</strong> ${displayPath}
                </div>`;
            }).join('');

            const moreCount = conflicts.length > 10 ? conflicts.length - 10 : 0;

            const { value: strategy, isDismissed } = await Swal.fire({
                title: '📁 发现文件冲突',
                html: `
                    <div style="text-align: left; font-size: 13px;">
                        <p>发现 <strong style="color: #dc3545;">${conflicts.length}</strong> 个文件与仓库中现有文件冲突。</p>
                        <p style="color: #666; font-size: 12px; margin-bottom: 10px;">
                            上传位置: <strong>${uploadLocation}</strong>
                        </p>
                        ${conflicts.length <= 10 ?
                            `<div style="max-height: 200px; overflow-y: auto; margin: 10px 0; padding: 10px; background: #f6f8fa; border-radius: 8px; border: 1px solid #e9ecef;">
                                ${conflictListHtml}
                            </div>` :
                            `<p style="color: #666; font-size: 12px;">显示前 10 个冲突文件...</p>`
                        }
                        ${moreCount > 0 ? `<p style="color: #dc3545; font-weight: 600;">... 还有 ${moreCount} 个文件</p>` : ''}
                        <div class="file-conflict-options">
                            <p style="font-weight: 600; margin-bottom: 12px;">请选择处理方式：</p>
                            <div class="conflict-option">
                                <input type="radio" id="overwrite" name="conflict-strategy" value="overwrite" checked>
                                <label for="overwrite">📄 覆盖现有文件</label>
                            </div>
                            <div class="conflict-option">
                                <input type="radio" id="skip" name="conflict-strategy" value="skip">
                                <label for="skip">⏭️ 跳过这些文件</label>
                            </div>
                            <div class="conflict-option">
                                <input type="radio" id="rename" name="conflict-strategy" value="rename">
                                <label for="rename">✏️ 重命名新文件</label>
                            </div>
                            <div class="conflict-option">
                                <input type="radio" id="ask" name="conflict-strategy" value="ask">
                                <label for="ask">❓ 逐个询问</label>
                            </div>
                        </div>
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: '✅ 继续',
                cancelButtonText: '❌ 取消上传',
                width: 500,
                preConfirm: () => {
                    const selected = document.querySelector('input[name="conflict-strategy"]:checked');
                    if (!selected) {
                        Swal.showValidationMessage('请选择一个处理方式');
                        return false;
                    }
                    return selected.value;
                }
            });

            if (isDismissed) {
                throw new Error('用户取消上传');
            }

            this.conflictStrategy = strategy;

            const renameFiles = [];
            if (strategy === 'rename') {
                for (const conflict of conflicts) {
                    const originalName = conflict.fileInfo.name;
                    const extIndex = originalName.lastIndexOf('.');
                    const name = extIndex > 0 ? originalName.substring(0, extIndex) : originalName;
                    const ext = extIndex > 0 ? originalName.substring(extIndex) : '';
                    const timestamp = Date.now();

                    const newName = `${name}_${timestamp}${ext}`;
                    const newRelativePath = conflict.relativePath.replace(originalName, newName);
                    conflict.fileInfo.relativePath = newRelativePath;
                    conflict.fileInfo.newName = newName;

                    renameFiles.push({
                        originalPath: conflict.path,
                        originalRelativePath: conflict.relativePath,
                        newRelativePath: newRelativePath,
                        fileInfo: conflict.fileInfo
                    });
                }
            }

            return { strategy, renameFiles };
        }

        async handleIndividualConflicts(conflicts) {
            const results = {
                overwrite: [],
                skip: [],
                rename: []
            };

            for (let i = 0; i < conflicts.length; i++) {
                const conflict = conflicts[i];
                const displayPath = this.getRepositoryPath(conflict.relativePath);

                const { value: action, isDismissed } = await Swal.fire({
                    title: `文件冲突 (${i + 1}/${conflicts.length})`,
                    html: `
                        <div style="text-align: left; font-size: 13px;">
                            <p><strong>📁 文件:</strong> ${displayPath}</p>
                            <p style="color: #dc3545;">仓库中已存在同名文件。</p>
                        </div>
                    `,
                    showCancelButton: true,
                    showDenyButton: true,
                    confirmButtonText: '📄 覆盖',
                    denyButtonText: '✏️ 重命名',
                    cancelButtonText: '⏭️ 跳过',
                    confirmButtonColor: '#dc3545',
                    denyButtonColor: '#007bff'
                });

                if (isDismissed) {
                    throw new Error('用户取消操作');
                }

                if (action === true) {
                    results.overwrite.push(conflict);
                } else if (action === false) {
                    const { value: newName, isDismissed: nameDismissed } = await Swal.fire({
                        title: '✏️ 重命名文件',
                        input: 'text',
                        inputLabel: '输入新的文件名',
                        inputValue: conflict.fileInfo.name,
                        showCancelButton: true,
                        confirmButtonText: '✅ 确定',
                        cancelButtonText: '❌ 取消'
                    });

                    if (nameDismissed) {
                        results.skip.push(conflict);
                    } else if (newName) {
                        const newRelativePath = conflict.relativePath.replace(conflict.fileInfo.name, newName);
                        conflict.fileInfo.relativePath = newRelativePath;
                        conflict.fileInfo.newName = newName;
                        results.rename.push(conflict);
                    } else {
                        results.skip.push(conflict);
                    }
                } else {
                    results.skip.push(conflict);
                }
            }

            return results;
        }

        // 修复：上传文件方法，添加详细的路径调试信息和更健壮的错误处理
        async uploadFile(fileInfo, retryCount = 0) {
            try {
                // 使用完整的仓库路径上传文件
                const repositoryPath = this.getRepositoryPath(fileInfo.relativePath);

                if (!repositoryPath || repositoryPath.includes('//')) {
                    throw new Error(`无效的文件路径: ${repositoryPath}`);
                }

                Utils.debugLog(`[FileUploadManager] 上传文件:`, {
                    文件名: fileInfo.name,
                    相对路径: fileInfo.relativePath,
                    仓库路径: repositoryPath,
                    当前分支: this.branch
                });

                // 检查父目录是否存在（如果需要的话）
                if (repositoryPath.includes('/')) {
                    const parentDir = repositoryPath.substring(0, repositoryPath.lastIndexOf('/'));
                    if (parentDir) {
                        try {
                            // 尝试获取父目录信息来验证路径
                            await this.api.checkFileExists(parentDir);
                        } catch (error) {
                            console.log(`[FileUploadManager] 父目录检查: ${parentDir}`, error.message);
                            // 如果父目录不存在，GitHub API 通常会自动创建，所以这里只是记录
                        }
                    }
                }

                const existingSha = await this.api.checkFileExists(repositoryPath);
                const base64Content = await this.readFileAsBase64(fileInfo.file);

                const message = fileInfo.newName ?
                    `上传文件: ${fileInfo.newName} (重命名自 ${fileInfo.name})` :
                    `上传文件: ${fileInfo.name}`;

                const currentDirectoryPath = RepoInfo.getCurrentDirectoryPath();
                const fullMessage = currentDirectoryPath ?
                    `${message} 到目录 ${currentDirectoryPath}` :
                    message;

                const result = await this.api.createOrUpdateFile(
                    repositoryPath,
                    base64Content,
                    existingSha,
                    fullMessage
                );

                // 修复：GitHub API在某些情况下不返回content字段，需要更健壮的处理
                if (!result) {
                    throw new Error('GitHub API 返回空响应');
                }

                // 检查响应结构，有些GitHub API版本可能不返回content对象
                let fileSha = null;
                if (result.content && result.content.sha) {
                    fileSha = result.content.sha;
                } else if (result.commit && result.commit.sha) {
                    // 有时GitHub API只返回commit信息
                    fileSha = result.commit.sha;
                } else if (result.sha) {
                    // 直接返回SHA的情况
                    fileSha = result.sha;
                } else {
                    // 记录完整响应以便调试
                    Utils.debugLog('[FileUploadManager] GitHub API 响应结构:', result);
                    // 如果没有SHA，我们仍然认为操作成功，只是无法记录SHA
                    console.warn(`[FileUploadManager] GitHub API 响应未包含SHA，但仍然认为上传成功: ${repositoryPath}`);
                }

                fileInfo.status = 'success';
                fileInfo.sha = fileSha;
                fileInfo.repositoryPath = repositoryPath;

                Utils.debugLog(`[FileUploadManager] 上传成功:`, {
                    路径: repositoryPath,
                    操作: existingSha ? '更新' : '创建',
                    SHA: fileSha ? fileSha.substring(0, 8) + '...' : '未获取到SHA'
                });

                return {
                    success: true,
                    file: repositoryPath,
                    displayPath: repositoryPath,
                    action: existingSha ? 'updated' : 'created',
                    sha: fileSha
                };
            } catch (error) {
                console.error(`[FileUploadManager] 上传文件失败 ${fileInfo.relativePath}:`, error);

                // 收集详细错误信息
                let errorDetails = error.message || '未知错误';

                // 检查是否为具体的API错误
                if (error.message && error.message.includes('Cannot read properties of null')) {
                    errorDetails = `GitHub API 返回了意外的响应格式: ${error.message}. 请检查网络连接和API权限。`;
                }

                // 检查网络连接
                if (!navigator.onLine) {
                    errorDetails += '\n网络连接已断开，请检查网络';
                }

                // 检查Token有效性
                if (error.message && (error.message.includes('401') || error.message.includes('token'))) {
                    errorDetails += '\nGitHub Token可能无效，请重新配置';
                }

                // 检查API限制
                if (error.message && (error.message.includes('rate limit') || error.message.includes('403'))) {
                    errorDetails += '\nGitHub API速率限制已到，请稍后重试';
                }

                if (retryCount < CONFIG.MAX_RETRIES) {
                    console.log(`[FileUploadManager] 重试上传 ${fileInfo.relativePath} (第 ${retryCount + 1} 次)...`);
                    await Utils.delay(CONFIG.RETRY_DELAY * (retryCount + 1));
                    return this.uploadFile(fileInfo, retryCount + 1);
                }

                fileInfo.status = 'error';
                fileInfo.error = errorDetails;

                return {
                    success: false,
                    file: this.getRepositoryPath(fileInfo.relativePath),
                    displayPath: this.getRepositoryPath(fileInfo.relativePath),
                    error: errorDetails
                };
            }
        }

        async uploadFiles() {
            try {
                const conflicts = await this.checkConflicts();

                let conflictResolution = { strategy: 'overwrite', renameFiles: [] };

                if (conflicts.length > 0) {
                    if (this.conflictStrategy === 'ask') {
                        const individualResults = await this.handleIndividualConflicts(conflicts);

                        for (const conflict of individualResults.skip) {
                            conflict.fileInfo.status = 'skipped';
                            conflict.fileInfo.skipReason = '用户选择跳过';
                        }
                    } else {
                        conflictResolution = await this.handleConflicts(conflicts);

                        if (conflictResolution.strategy === 'skip') {
                            for (const conflict of conflicts) {
                                conflict.fileInfo.status = 'skipped';
                                conflict.fileInfo.skipReason = '批量跳过冲突文件';
                            }
                        }
                    }
                }

                this.uploadQueue = this.files.filter(file => file.status === 'pending');

                let successCount = 0;
                let failCount = 0;
                let skipCount = 0;
                const results = [];

                // 分批上传文件
                for (let i = 0; i < this.uploadQueue.length; i += CONFIG.UPLOAD_CHUNK_SIZE) {
                    const chunk = this.uploadQueue.slice(i, i + CONFIG.UPLOAD_CHUNK_SIZE);

                    const chunkPromises = chunk.map(async (fileInfo) => {
                        if (fileInfo.status === 'skipped') {
                            skipCount++;
                            return {
                                success: false,
                                file: this.getRepositoryPath(fileInfo.relativePath),
                                displayPath: this.getRepositoryPath(fileInfo.relativePath),
                                action: 'skipped',
                                reason: fileInfo.skipReason
                            };
                        }

                        const result = await this.uploadFile(fileInfo);
                        return result;
                    });

                    const chunkResults = await Promise.all(chunkPromises);
                    results.push(...chunkResults);

                    for (const result of chunkResults) {
                        if (result.success) {
                            successCount++;
                        } else if (result.action === 'skipped') {
                            skipCount++;
                        } else {
                            failCount++;
                        }
                    }

                    const progress = Math.round(((i + chunk.length) / this.uploadQueue.length) * 100);
                    if (typeof this.onProgress === 'function') {
                        this.onProgress(progress, `已上传 ${i + chunk.length}/${this.uploadQueue.length} 个文件`);
                    }

                    if (i + CONFIG.UPLOAD_CHUNK_SIZE < this.uploadQueue.length) {
                        await Utils.delay(1000);
                    }
                }

                const currentDirectoryPath = RepoInfo.getCurrentDirectoryPath();
                const uploadLocation = currentDirectoryPath || '根目录';

                Utils.debugLog('[FileUploadManager] 上传完成:', {
                    总计: this.files.length,
                    成功: successCount,
                    失败: failCount,
                    跳过: skipCount,
                    位置: uploadLocation
                });

                return {
                    success: true,
                    total: this.files.length,
                    uploaded: successCount,
                    failed: failCount,
                    skipped: skipCount,
                    uploadLocation: uploadLocation,
                    results: results
                };
            } catch (error) {
                console.error('[FileUploadManager] 上传文件失败:', error);

                // 收集详细错误信息
                let errorDetails = error.message;

                // 检查网络连接
                if (!navigator.onLine) {
                    errorDetails += '\n网络连接已断开，请检查网络';
                }

                // 检查Token有效性
                if (error.message && (error.message.includes('401') || error.message.includes('token'))) {
                    errorDetails += '\nGitHub Token可能无效，请重新配置';
                }

                // 检查API限制
                if (error.message && (error.message.includes('rate limit') || error.message.includes('403'))) {
                    errorDetails += '\nGitHub API速率限制已到，请稍后重试';
                }

                const currentDirectoryPath = RepoInfo.getCurrentDirectoryPath();
                const uploadLocation = currentDirectoryPath || '根目录';

                Utils.debugLog('[FileUploadManager] 上传失败:', {
                    错误: errorDetails,
                    位置: uploadLocation
                });

                return {
                    success: false,
                    error: errorDetails,
                    total: this.files.length,
                    uploaded: 0,
                    failed: 0,
                    skipped: 0,
                    uploadLocation: uploadLocation,
                    results: []
                };
            }
        }
    }

    // ==================== UI 管理器 ====================
    class GitHubUIManager {
        constructor() {
            this.api = new EnhancedGitHubAPI();
            this.repoInfo = RepoInfo.getCurrentRepo();
            this.api.setRepoInfo(this.repoInfo);
            this.branch = RepoInfo.getCurrentBranch();
            this.api.setBranch(this.branch);
            this.operations = new FileOperations(this.api);
            this.uploadManager = null;
            this.isProcessing = false;
            this.currentOperation = null;
            this.deleteConfirmState = {
                deleteFiles: false,
                deleteKeepStructure: false,
                deleteRepo: false
            };
            this.deleteConfirmTimers = {};

            // 调试信息
            Utils.debugLog('[GitHubUIManager] 初始化:', {
                页面URL: window.location.href,
                仓库信息: this.repoInfo,
                分支: this.branch,
                当前目录: RepoInfo.getCurrentDirectoryPath()
            });

            this.init();
        }

        init() {
            GM_addStyle(STYLES);
            this.createFloatingPanel();
            this.addGlobalHotkey();
            this.initializeToken();
            this.setupPJAXListener();
        }

        async initializeToken() {
            const token = TokenManager.getToken();
            if (!token) {
                await Utils.delay(3000);
                const { isConfirmed } = await Swal.fire({
                    title: '🔑 需要 GitHub Token',
                    text: '首次使用需要配置 GitHub Personal Access Token（需要 repo 权限）',
                    icon: 'info',
                    showCancelButton: true,
                    confirmButtonText: '✅ 立即配置',
                    cancelButtonText: '⏭️ 稍后再说',
                    confirmButtonColor: '#2ea44f'
                });

                if (isConfirmed) {
                    await TokenManager.requestToken();
                }
            }
        }

        // 设置PJAX监听器，当GitHub页面导航时更新面板
        setupPJAXListener() {
            // 监听pjax:end事件（GitHub使用pjax进行页面导航）
            document.addEventListener('pjax:end', () => {
                setTimeout(() => {
                    this.refreshPanelInfo();
                }, 500);
            });

            // 监听popstate事件（浏览器前进/后退）
            window.addEventListener('popstate', () => {
                setTimeout(() => {
                    this.refreshPanelInfo();
                }, 500);
            });

            // 监听hashchange事件（URL哈希变化）
            window.addEventListener('hashchange', () => {
                setTimeout(() => {
                    this.refreshPanelInfo();
                }, 500);
            });
        }

        // 刷新面板信息
        refreshPanelInfo() {
            try {
                const panel = document.getElementById('github-tools-floating');
                if (!panel) return;

                // 刷新仓库信息
                this.repoInfo = RepoInfo.getCurrentRepo();
                this.branch = RepoInfo.getCurrentBranch();
                this.api.setRepoInfo(this.repoInfo);
                this.api.setBranch(this.branch);
                this.operations.refreshRepoInfo();

                // 更新面板显示
                const repoName = this.repoInfo.isRepoPage ?
                    `${this.repoInfo.owner}/${this.repoInfo.repo}` :
                    '未在仓库页面';

                const currentDirectoryPath = RepoInfo.getCurrentDirectoryPath();
                const locationText = currentDirectoryPath ?
                    `📁 当前目录: ${currentDirectoryPath}` :
                    '📁 当前目录: 根目录';

                const repoInfoCard = panel.querySelector('.repo-info-card');
                if (repoInfoCard) {
                    repoInfoCard.innerHTML = `
                        <div class="repo-name">
                            ${Utils.getRepoIcon()}
                            <span>${repoName}</span>
                        </div>
                        <div class="branch-info">🌿 ${this.branch}</div>
                        <div class="branch-info" style="margin-top: 4px;">${locationText}</div>
                    `;
                }

                // 更新按钮状态
                const buttons = panel.querySelectorAll('.github-tool-btn');
                buttons.forEach(btn => {
                    if (btn.id && btn.id.includes('github-') && !btn.id.includes('settings') && !btn.id.includes('test')) {
                        btn.disabled = !this.repoInfo.isRepoPage;
                    }
                });

                Utils.debugLog('[GitHubUIManager] 面板信息已刷新:', {
                    仓库信息: this.repoInfo,
                    分支: this.branch,
                    当前目录: currentDirectoryPath
                });
            } catch (error) {
                console.error('[GitHubUIManager] 刷新面板信息失败:', error);
            }
        }

        createFloatingPanel() {
            const existing = document.getElementById('github-tools-floating');
            if (existing) existing.remove();

            const panel = document.createElement('div');
            panel.id = 'github-tools-floating';
            panel.className = 'github-tools-floating';

            const repoName = this.repoInfo.isRepoPage ?
                `${this.repoInfo.owner}/${this.repoInfo.repo}` :
                '未在仓库页面';

            const currentDirectoryPath = RepoInfo.getCurrentDirectoryPath();
            const locationText = currentDirectoryPath ?
                `📁 当前目录: ${currentDirectoryPath}` :
                '📁 当前目录: 根目录';

            panel.innerHTML = `
                <div class="github-tools-header">
                    <div class="header-content">
                        <span class="logo">📁</span>
                        <span class="title">GitHub 批量工具 v5.1.1</span>
                    </div>
                    <div class="header-actions">
                        <button class="action-btn minimize-btn" title="最小化">−</button>
                        <button class="action-btn close-btn" title="关闭">✕</button>
                        <button class="action-btn refresh-btn" title="刷新信息">↻</button>
                    </div>
                </div>
                <div class="github-tools-body">
                    <div class="repo-info-card">
                        <div class="repo-name">
                            ${Utils.getRepoIcon()}
                            <span>${repoName}</span>
                        </div>
                        <div class="branch-info">🌿 ${this.branch}</div>
                        <div class="branch-info" style="margin-top: 4px;">${locationText}</div>
                    </div>
                    <div class="github-tools-section">
                        <div class="github-tools-section-title">批量操作</div>
                        <div class="github-tools-buttons">
                            <button class="github-tool-btn danger" id="github-delete-files-btn" ${!this.repoInfo.isRepoPage ? 'disabled' : ''}>
                                🗑️ 删除文件
                            </button>
                            <button class="github-tool-btn warning" id="github-delete-keep-structure-btn" ${!this.repoInfo.isRepoPage ? 'disabled' : ''}>
                                📂 保留结构
                            </button>
                            <button class="github-tool-btn primary" id="github-upload-files-btn" ${!this.repoInfo.isRepoPage ? 'disabled' : ''}>
                                📤 上传文件
                            </button>
                            <button class="github-tool-btn" id="github-create-gitignore-btn" ${!this.repoInfo.isRepoPage ? 'disabled' : ''}>
                                📄 .gitignore
                            </button>
                        </div>
                        <div id="progress-container" class="progress-container" style="display: none;">
                            <div id="progress-bar" class="progress-bar" style="width: 0%;"></div>
                        </div>
                        <div id="status-text" class="status-text" style="display: none;"></div>
                    </div>
                    <div class="github-tools-section">
                        <div class="github-tools-section-title">工具设置</div>
                        <div class="github-tools-buttons">
                            <button class="github-tool-btn settings" id="github-settings-btn">
                                ⚙️ 设置
                            </button>
                            <button class="github-tool-btn settings" id="github-test-api-btn">
                                🔍 测试
                            </button>
                        </div>
                    </div>
                    <div class="danger-zone">
                        <h3>${Utils.getWarningIcon()} 危险操作</h3>
                        <div class="danger-note">
                            <p style="font-weight: 600; color: #dc3545;">⚠️ 警告：不可撤销！</p>
                            <ul>
                                <li>永久删除所有文件和历史</li>
                                <li>无法恢复删除的仓库</li>
                            </ul>
                        </div>
                        <div class="github-tools-buttons">
                            <button class="github-tool-btn dark-danger" id="github-delete-repo-btn" ${!this.repoInfo.isRepoPage ? 'disabled' : ''}>
                                🗑️ 删除仓库
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(panel);
            // v5.1.1: 默认隐藏主面板
            panel.style.display = 'none';
            // v5.1.1: 创建右下角悬浮按钮
            this.createFloatingButton();
            // v5.1.1: 记住上次展开状态
            const wasOpen = GM_getValue(CONFIG.PANEL_OPEN_KEY, false);
            if (wasOpen) {
                panel.style.display = 'block';
                document.getElementById('github-tools-fab')?.remove();
            }


            const savedPosition = StateManager.getPanelPosition();
            if (savedPosition) {
                panel.style.left = savedPosition.left || '';
                panel.style.top = savedPosition.top || '';
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
            }

            this.bindPanelEvents(panel);
            this.makeDraggable(panel);

            console.log('[GitHubUIManager] 浮动面板创建成功');
        }

        bindPanelEvents(panel) {
            const minimizeBtn = panel.querySelector('.minimize-btn');
            const closeBtn = panel.querySelector('.close-btn');
            const refreshBtn = panel.querySelector('.refresh-btn');

            minimizeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                panel.classList.toggle('minimized');
                minimizeBtn.textContent = panel.classList.contains('minimized') ? '+' : '−';
            });

            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                panel.style.display = 'none';
                GM_setValue(CONFIG.PANEL_OPEN_KEY, false);
                this.createFloatingButton();
            });

            refreshBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.refreshPanelInfo();
                Swal.fire({
                    title: '🔄 信息已刷新',
                    icon: 'success',
                    toast: true,
                    position: 'top-end',
                    timer: 2000,
                    showConfirmButton: false
                });
            });

            panel.addEventListener('click', (e) => {
                const target = e.target.closest('.github-tool-btn');
                if (!target) return;

                if (target.id === 'github-delete-files-btn') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleDeleteFiles();
                } else if (target.id === 'github-delete-keep-structure-btn') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleDeleteAndKeepStructure();
                } else if (target.id === 'github-upload-files-btn') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleUploadFiles();
                } else if (target.id === 'github-create-gitignore-btn') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleCreateGitignore();
                } else if (target.id === 'github-settings-btn') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showSettings();
                } else if (target.id === 'github-test-api-btn') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.testAPI();
                } else if (target.id === 'github-delete-repo-btn') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleDeleteRepository();
                }
            });
        }

        createFloatingButton() {
            const existing = document.getElementById('github-tools-fab');
            if (existing) existing.remove();

            const fab = document.createElement('button');
            fab.id = 'github-tools-fab';
            fab.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 56px;
                height: 56px;
                border-radius: 50%;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                z-index: 999998;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            fab.textContent = '📁';
            fab.title = '打开 GitHub 批量工具';

            fab.addEventListener('mouseenter', () => {
                fab.style.transform = 'scale(1.1)';
            });

            fab.addEventListener('mouseleave', () => {
                fab.style.transform = 'scale(1)';
            });

                        // v5.1.1: 悬浮按钮可拖动 + 吸附边缘
            let dragging = false, sx = 0, sy = 0;
            fab.addEventListener('mousedown', (e) => {
                dragging = true; sx = e.clientX; sy = e.clientY; e.preventDefault();
            });
            document.addEventListener('mousemove', (e) => {
                if (!dragging) return;
                const rect = fab.getBoundingClientRect();
                fab.style.right = 'auto'; fab.style.bottom = 'auto';
                fab.style.left = Math.min(window.innerWidth - 56, Math.max(0, rect.left + (e.clientX - sx))) + 'px';
                fab.style.top  = Math.min(window.innerHeight - 56, Math.max(0, rect.top  + (e.clientY - sy))) + 'px';
                sx = e.clientX; sy = e.clientY;
            });
            document.addEventListener('mouseup', () => {
                if (!dragging) return; dragging = false;
                const rect = fab.getBoundingClientRect();
                GM_setValue(CONFIG.FAB_POSITION_KEY, { left: fab.style.left, top: fab.style.top });
            });
            const savedFabPos = GM_getValue(CONFIG.FAB_POSITION_KEY, null);
            if (savedFabPos) { fab.style.left = savedFabPos.left; fab.style.top = savedFabPos.top; fab.style.right='auto'; fab.style.bottom='auto'; }

            fab.addEventListener('click', () => {
                const panel = document.getElementById('github-tools-floating');
                if (panel) {
                    panel.style.display = 'block';
                    panel.classList.remove('minimized');
                    GM_setValue(CONFIG.PANEL_OPEN_KEY, true);
                    fab.remove();
                    // 刷新面板信息
                    this.refreshPanelInfo();
                }
            });

            document.body.appendChild(fab);
        }

        makeDraggable(element) {
            const header = element.querySelector('.github-tools-header');
            let isDragging = false;
            let startX, startY, initialX, initialY;

            header.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('action-btn')) return;

                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                initialX = element.offsetLeft;
                initialY = element.offsetTop;

                element.style.transition = 'none';
                element.style.cursor = 'grabbing';

                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;

                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;

                element.style.left = `${initialX + deltaX}px`;
                element.style.top = `${initialY + deltaY}px`;
                element.style.right = 'auto';
                element.style.bottom = 'auto';
            });

            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    element.style.transition = '';
                    element.style.cursor = '';

                    StateManager.setPanelPosition({
                        left: element.style.left,
                        top: element.style.top
                    });
                }
            });
        }

        addGlobalHotkey() {
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.shiftKey && e.key === 'Z') {
                    e.preventDefault();
                    const panel = document.getElementById('github-tools-floating');
                    if (panel) {
                        if (panel.style.display === 'none') {
                            panel.style.display = 'block';
                            document.getElementById('github-tools-fab')?.remove();
                            // 刷新面板信息
                            this.refreshPanelInfo();
                        } else {
                            panel.style.display = 'none';
                            this.createFloatingButton();
                        }
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
                if (btn.id === 'github-delete-files-btn' && this.deleteConfirmState.deleteFiles) {
                } else if (btn.id === 'github-delete-keep-structure-btn' && this.deleteConfirmState.deleteKeepStructure) {
                } else if (btn.id === 'github-delete-repo-btn' && this.deleteConfirmState.deleteRepo) {
                } else {
                    btn.disabled = disabled;
                }

                if (disabled && !btn.classList.contains('confirm')) {
                    btn.classList.add('loading');
                } else {
                    btn.classList.remove('loading');
                }
            });
        }

        resetDeleteConfirmState(buttonId) {
            const button = document.getElementById(buttonId);
            if (!button) return;

            if (buttonId === 'github-delete-files-btn') {
                this.deleteConfirmState.deleteFiles = false;
                button.classList.remove('confirm');
                button.innerHTML = '🗑️ 删除文件';
            } else if (buttonId === 'github-delete-keep-structure-btn') {
                this.deleteConfirmState.deleteKeepStructure = false;
                button.classList.remove('confirm');
                button.innerHTML = '📂 保留结构';
            } else if (buttonId === 'github-delete-repo-btn') {
                this.deleteConfirmState.deleteRepo = false;
                button.classList.remove('confirm');
                button.innerHTML = '🗑️ 删除仓库';
            }

            if (this.deleteConfirmTimers[buttonId]) {
                clearTimeout(this.deleteConfirmTimers[buttonId]);
                delete this.deleteConfirmTimers[buttonId];
            }
        }

        setDeleteConfirmState(buttonId) {
            const button = document.getElementById(buttonId);
            if (!button) return;

            if (buttonId === 'github-delete-files-btn') {
                this.deleteConfirmState.deleteFiles = true;
                button.classList.add('confirm');
                button.innerHTML = '⚠️ 确认删除文件';
            } else if (buttonId === 'github-delete-keep-structure-btn') {
                this.deleteConfirmState.deleteKeepStructure = true;
                button.classList.add('confirm');
                button.innerHTML = '⚠️ 确认保留结构删除';
            } else if (buttonId === 'github-delete-repo-btn') {
                this.deleteConfirmState.deleteRepo = true;
                button.classList.add('confirm');
                button.innerHTML = '🔥 确认删除仓库';
            }

            if (this.deleteConfirmTimers[buttonId]) {
                clearTimeout(this.deleteConfirmTimers[buttonId]);
            }

            this.deleteConfirmTimers[buttonId] = setTimeout(() => {
                this.resetDeleteConfirmState(buttonId);
            }, CONFIG.DELETE_CONFIRM_DELAY);
        }

        async showSettings() {
            const token = TokenManager.getToken();
            const maskedToken = token ?
                `${token.substring(0, 6)}...${token.substring(token.length - 4)}` :
                '未设置';

            const currentDirectoryPath = RepoInfo.getCurrentDirectoryPath();

            const result = await Swal.fire({
                title: '⚙️ 设置',
                html: `
                    <div style="text-align: left; font-size: 13px;">
                        <p><strong>🔑 GitHub Token 状态:</strong> ${token ? '✅ 已设置' : '❌ 未设置'}</p>
                        <p><strong>🔒 Token 预览:</strong> ${maskedToken}</p>
                        <hr style="margin: 12px 0; border: none; border-top: 1px solid #e9ecef;">
                        <p><strong>📁 仓库信息:</strong></p>
                        <ul style="margin-left: 18px; margin-bottom: 12px; line-height: 1.8;">
                            <li>仓库: ${this.repoInfo.owner}/${this.repoInfo.repo}</li>
                            <li>分支: ${this.branch}</li>
                            <li>当前目录: ${currentDirectoryPath || '根目录'}</li>
                        </ul>
                        <hr style="margin: 12px 0; border: none; border-top: 1px solid #e9ecef;">
                        <p><strong>⌨️ 快捷键:</strong> <kbd style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 2px 6px; font-family: monospace; font-size: 11px;">Ctrl+Shift+Z</kbd> 显示/隐藏面板</p>
                        <p><strong>📌 版本:</strong> 5.1.1 (修复上传到子目录失败和API响应处理问题)</p>
                        <p><strong>🆕 更新说明:</strong></p>
                        <ul style="margin-left: 18px; line-height: 1.6;">
                            <li>✅ 修复GitHub API响应中content字段可能为null的问题</li>
                            <li>✅ 增强对GitHub API不同响应格式的处理</li>
                            <li>✅ 改进上传到子目录的稳定性</li>
                            <li>✅ 添加更详细的错误日志和调试信息</li>
                            <li>✅ 修复Cannot read properties of null错误</li>
                        </ul>
                        <div class="github-tools-toggle" style="margin-top: 16px;">
                            <span>调试模式</span>
                            <label class="switch">
                                <input type="checkbox" ${CONFIG.DEBUG_MODE ? 'checked' : ''} id="debug-mode-toggle">
                                <span class="slider"></span>
                            </label>
                        </div>
                        <p style="font-size: 11px; color: #666; margin-top: 8px;">调试模式会在控制台输出详细日志，帮助诊断问题</p>
                    </div>
                `,
                showDenyButton: true,
                showCancelButton: true,
                confirmButtonText: '🔄 更改 Token',
                denyButtonText: '🔍 测试连接',
                cancelButtonText: '❌ 关闭',
                width: 500,
                allowOutsideClick: true,
                allowEscapeKey: true,
                confirmButtonColor: '#007bff',
                denyButtonColor: '#28a745',
                cancelButtonColor: '#6c757d',
                didOpen: () => {
                    const debugToggle = document.getElementById('debug-mode-toggle');
                    if (debugToggle) {
                        debugToggle.addEventListener('change', (e) => {
                            CONFIG.DEBUG_MODE = e.target.checked;
                            GM_notification({
                                title: '🔧 调试模式',
                                text: CONFIG.DEBUG_MODE ? '已启用' : '已禁用',
                                timeout: 2000
                            });
                        });
                    }
                }
            });

            if (result.isConfirmed) {
                await TokenManager.requestToken();
            } else if (result.isDenied) {
                await this.testAPI();
            }
        }

        async testAPI() {
            try {
                const swalInstance = Swal.fire({
                    title: '🔄 测试 API 连接...',
                    allowOutsideClick: false,
                    showConfirmButton: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });

                const userData = await this.api.get('/user');
                const repoData = await this.api.get(`/repos/${this.repoInfo.owner}/${this.repoInfo.repo}`);

                Swal.close();

                await Swal.fire({
                    title: '✅ API 连接正常',
                    html: `
                        <div style="text-align: left; font-size: 13px; line-height: 1.8;">
                            <p><strong>👤 用户:</strong> ${userData.login}</p>
                            <p><strong>📁 仓库:</strong> ${repoData.full_name}</p>
                            <p><strong>🔐 仓库权限:</strong> ${repoData.permissions ?
                                `管理员: ${repoData.permissions.admin ? '✅' : '❌'}, 推送: ${repoData.permissions.push ? '✅' : '❌'}, 拉取: ${repoData.permissions.pull ? '✅' : '❌'}` :
                                '未知'}</p>
                            <p><strong>🌿 默认分支:</strong> ${repoData.default_branch || 'main'}</p>
                            <p><strong>📊 剩余 API 次数:</strong> ${this.api.rateLimitRemaining || '未知'}</p>
                            <p><strong>📁 当前目录:</strong> ${RepoInfo.getCurrentDirectoryPath() || '根目录'}</p>
                            <p><strong>🔗 当前 URL:</strong> <small>${window.location.href}</small></p>
                        </div>
                    `,
                    icon: 'success',
                    width: 480,
                    confirmButtonText: '✅ 确定',
                    confirmButtonColor: '#2ea44f'
                });
            } catch (error) {
                Swal.close();
                await Swal.fire({
                    title: '❌ API 连接失败',
                    html: `
                        <div style="text-align: left; font-size: 13px;">
                            <p><strong>❌ 错误信息:</strong> ${error.message}</p>
                            <p style="margin-top: 12px;">建议检查：</p>
                            <ul style="margin-left: 18px; line-height: 1.8;">
                                <li>Token 是否正确配置</li>
                                <li>Token 是否具有 repo 权限</li>
                                <li>网络连接是否正常</li>
                                <li>GitHub API 是否可用</li>
                            </ul>
                        </div>
                    `,
                    icon: 'error',
                    width: 450,
                    confirmButtonText: '❌ 确定',
                    confirmButtonColor: '#dc3545'
                });
            }
        }

        async handleDeleteFiles() {
            if (this.isProcessing) {
                await Swal.fire({
                    title: '⏳ 操作进行中',
                    text: '请等待当前操作完成',
                    icon: 'info',
                    timer: 2000,
                    toast: true,
                    position: 'top-end'
                });
                return;
            }

            if (!this.deleteConfirmState.deleteFiles) {
                this.setDeleteConfirmState('github-delete-files-btn');
                return;
            }

            await this.deleteAllFiles();
        }

        async handleDeleteAndKeepStructure() {
            if (this.isProcessing) {
                await Swal.fire({
                    title: '⏳ 操作进行中',
                    text: '请等待当前操作完成',
                    icon: 'info',
                    timer: 2000,
                    toast: true,
                    position: 'top-end'
                });
                return;
            }

            if (!this.deleteConfirmState.deleteKeepStructure) {
                this.setDeleteConfirmState('github-delete-keep-structure-btn');
                return;
            }

            await this.deleteFilesAndKeepStructure();
        }

        async handleUploadFiles() {
            if (this.isProcessing) {
                await Swal.fire({
                    title: '⏳ 操作进行中',
                    text: '请等待当前操作完成',
                    icon: 'info',
                    timer: 2000,
                    toast: true,
                    position: 'top-end'
                });
                return;
            }

            // 上传前刷新仓库信息
            this.refreshPanelInfo();
            await this.uploadFiles();
        }

        async handleCreateGitignore() {
            if (this.isProcessing) {
                await Swal.fire({
                    title: '⏳ 操作进行中',
                    text: '请等待当前操作完成',
                    icon: 'info',
                    timer: 2000,
                    toast: true,
                    position: 'top-end'
                });
                return;
            }

            // 操作前刷新仓库信息
            this.refreshPanelInfo();
            await this.createGitignoreFiles();
        }

        async handleDeleteRepository() {
            if (this.isProcessing) {
                await Swal.fire({
                    title: '⏳ 操作进行中',
                    text: '请等待当前操作完成',
                    icon: 'info',
                    timer: 2000,
                    toast: true,
                    position: 'top-end'
                });
                return;
            }

            if (!this.deleteConfirmState.deleteRepo) {
                this.setDeleteConfirmState('github-delete-repo-btn');
                return;
            }

            // 操作前刷新仓库信息
            this.refreshPanelInfo();
            await this.deleteRepository();
        }

        async deleteAllFiles() {
            if (!this.repoInfo.isRepoPage) {
                await Swal.fire({
                    title: '❌ 错误',
                    text: '当前页面不是 GitHub 仓库页面',
                    icon: 'error',
                    toast: true,
                    position: 'top-end'
                });
                this.resetDeleteConfirmState('github-delete-files-btn');
                return;
            }

            this.isProcessing = true;
            this.currentOperation = 'delete-files';
            this.updateButtonsState(true);

            try {
                const progressSwal = Swal.fire({
                    title: '🗑️ 正在删除文件...',
                    html: `
                        <div style="text-align: center;">
                            <div class="progress-container" style="width: 80%; margin: 15px auto;">
                                <div id="swal-progress-bar" class="progress-bar" style="width: 0%;"></div>
                            </div>
                            <div id="swal-status-text" class="status-text" style="font-size: 12px;">正在获取文件列表...</div>
                        </div>
                    `,
                    allowOutsideClick: false,
                    showConfirmButton: false,
                    showCancelButton: true,
                    cancelButtonText: '❌ 取消操作',
                    width: 400
                });

                const updateProgress = (percent, message) => {
                    const statusText = document.getElementById('swal-status-text');
                    const progressBar = document.getElementById('swal-progress-bar');
                    if (statusText) statusText.textContent = message;
                    if (progressBar) progressBar.style.width = `${percent}%`;
                };

                progressSwal.then((result) => {
                    if (result.dismiss === Swal.DismissReason.cancel) {
                        throw new Error('用户取消操作');
                    }
                });

                const files = await this.operations.getAllFiles();

                if (files.length === 0) {
                    Swal.close();
                    await Swal.fire({
                        title: 'ℹ️ 提示',
                        text: '仓库中没有文件可删除',
                        icon: 'info',
                        confirmButtonText: '✅ 确定'
                    });
                    return;
                }

                let successCount = 0;
                let failCount = 0;
                const failedFiles = [];

                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const percent = Math.round(((i + 1) / files.length) * 100);

                    updateProgress(percent, `正在删除 ${i + 1}/${files.length} 个文件...`);

                    const result = await this.operations.deleteFile(file);

                    if (result.success) {
                        successCount++;
                    } else {
                        failCount++;
                        failedFiles.push({
                            path: file.path,
                            error: result.error
                        });
                    }

                    this.updateProgress(percent, `正在删除文件 ${i + 1}/${files.length}...`);

                    if ((i + 1) % 3 === 0 && i < files.length - 1) {
                        await Utils.delay(800);
                    }
                }

                updateProgress(100, '操作完成！');
                Swal.close();

                let resultHtml = `<strong>文件删除操作完成！</strong><br><br>`;
                resultHtml += `✅ 成功删除: <strong>${successCount}</strong> 个文件<br>`;
                resultHtml += `❌ 删除失败: <strong>${failCount}</strong> 个文件`;

                if (failedFiles.length > 0) {
                    resultHtml += `<br><br><details style="text-align: left;"><summary>📋 查看失败详情</summary>`;
                    resultHtml += `<div class="error-details">`;
                    failedFiles.forEach((file, index) => {
                        resultHtml += `<div class="error-item">`;
                        resultHtml += `<strong>${index + 1}. ${file.path}</strong><br>`;
                        resultHtml += `<small style="color: #721c24;">❌ 错误: ${file.error}</small>`;
                        resultHtml += `</div>`;
                    });
                    resultHtml += `</div></details>`;
                }

                await Swal.fire({
                    title: '✅ 操作完成',
                    html: resultHtml,
                    icon: successCount > 0 ? 'success' : 'error',
                    width: 500,
                    confirmButtonText: '✅ 确定',
                    confirmButtonColor: '#2ea44f'
                });

            } catch (error) {
                console.error('[GitHubUIManager] 删除文件失败:', error);
                Swal.close();

                if (error.message === '用户取消操作') {
                    await Swal.fire({
                        title: 'ℹ️ 已取消',
                        text: '操作已被用户取消',
                        icon: 'info',
                        timer: 2000,
                        toast: true,
                        position: 'top-end'
                    });
                } else {
                    await Swal.fire({
                        title: '❌ 操作失败',
                        html: `
                            <div style="text-align: left; font-size: 13px;">
                                <p><strong>❌ 错误信息:</strong> ${error.message}</p>
                            </div>
                        `,
                        icon: 'error',
                        width: 400,
                        confirmButtonText: '❌ 确定',
                        confirmButtonColor: '#dc3545'
                    });
                }
            } finally {
                this.isProcessing = false;
                this.currentOperation = null;
                this.updateButtonsState(false);
                this.updateProgress(0, '');
                this.resetDeleteConfirmState('github-delete-files-btn');
            }
        }

        async deleteFilesAndKeepStructure() {
            if (!this.repoInfo.isRepoPage) {
                await Swal.fire({
                    title: '❌ 错误',
                    text: '当前页面不是 GitHub 仓库页面',
                    icon: 'error',
                    toast: true,
                    position: 'top-end'
                });
                this.resetDeleteConfirmState('github-delete-keep-structure-btn');
                return;
            }

            this.isProcessing = true;
            this.currentOperation = 'delete-keep-structure';
            this.updateButtonsState(true);
            this.updateProgress(0, '正在准备操作...');

            try {
                const progressSwal = Swal.fire({
                    title: '📂 正在执行保留结构式删除...',
                    html: `
                        <div style="text-align: center;">
                            <div class="progress-container" style="width: 80%; margin: 15px auto;">
                                <div id="swal-progress-bar" class="progress-bar" style="width: 0%;"></div>
                            </div>
                            <div id="swal-status-text" class="status-text" style="font-size: 12px;">初始化操作...</div>
                        </div>
                    `,
                    allowOutsideClick: false,
                    showConfirmButton: false,
                    showCancelButton: true,
                    cancelButtonText: '❌ 取消操作',
                    width: 400
                });

                progressSwal.then((result) => {
                    if (result.dismiss === Swal.DismissReason.cancel) {
                        throw new Error('用户取消操作');
                    }
                });

                const updateProgress = (percent, message) => {
                    const statusText = document.getElementById('swal-status-text');
                    const progressBar = document.getElementById('swal-progress-bar');
                    if (statusText) statusText.textContent = message;
                    if (progressBar) progressBar.style.width = `${percent}%`;
                    this.updateProgress(percent, message);
                };

                updateProgress(10, '开始执行操作...');

                const operationResult = await this.operations.deleteFilesAndKeepStructure();

                if (!operationResult.success) {
                    if (operationResult.message.includes('没有文件可删除')) {
                        Swal.close();
                        await Swal.fire({
                            title: 'ℹ️ 提示',
                            text: operationResult.message,
                            icon: 'info',
                            toast: true,
                            position: 'top-end'
                        });
                        return;
                    } else {
                        throw new Error(operationResult.message);
                    }
                }

                updateProgress(100, '操作完成！');
                Swal.close();

                let resultHtml = `<strong>保留结构式删除操作完成！</strong><br><br>`;

                resultHtml += `<h4 style="margin-top: 10px; margin-bottom: 8px; font-size: 14px; font-weight: 600;">📁 文件删除结果：</h4>`;
                resultHtml += `✅ 成功删除: <strong>${operationResult.filesDeleted}</strong> 个文件<br>`;
                resultHtml += `❌ 删除失败: <strong>${operationResult.filesFailed}</strong> 个文件<br>`;

                resultHtml += `<h4 style="margin-top: 10px; margin-bottom: 8px; font-size: 14px; font-weight: 600;">📄 .gitignore 创建结果：</h4>`;
                resultHtml += `✅ 成功创建: <strong>${operationResult.gitignoreCreated}</strong> 个 .gitignore 文件<br>`;
                resultHtml += `⏭️ 已存在跳过: <strong>${operationResult.gitignoreSkipped}</strong> 个目录<br>`;
                resultHtml += `❌ 创建失败: <strong>${operationResult.gitignoreFailed}</strong> 个目录`;

                const hasFileFailures = operationResult.failedFiles && operationResult.failedFiles.length > 0;
                const hasGitignoreFailures = operationResult.failedGitignores && operationResult.failedGitignores.length > 0;

                if (hasFileFailures || hasGitignoreFailures) {
                    resultHtml += `<br><br><details style="text-align: left;"><summary>📋 查看失败详情</summary>`;
                    resultHtml += `<div class="error-details">`;

                    if (hasFileFailures) {
                        resultHtml += `<h5 style="margin-top: 8px; margin-bottom: 5px; font-size: 12px; font-weight: 600;">🗑️ 文件删除失败：</h5>`;
                        operationResult.failedFiles.forEach((file, index) => {
                            resultHtml += `<div class="error-item">`;
                            resultHtml += `<strong>${index + 1}. ${file.path}</strong><br>`;
                            resultHtml += `<small style="color: #721c24;">❌ 错误: ${file.error}</small>`;
                            resultHtml += `</div>`;
                        });
                    }

                    if (hasGitignoreFailures) {
                        resultHtml += `<h5 style="margin-top: 8px; margin-bottom: 5px; font-size: 12px; font-weight: 600;">📄 .gitignore 创建失败：</h5>`;
                        operationResult.failedGitignores.forEach((dir, index) => {
                            resultHtml += `<div class="error-item">`;
                            resultHtml += `<strong>${index + 1}. ${dir.path || '根目录'}</strong><br>`;
                            resultHtml += `<small style="color: #721c24;">❌ 错误: ${dir.error}</small>`;
                            resultHtml += `</div>`;
                        });
                    }

                    resultHtml += `</div></details>`;
                }

                await Swal.fire({
                    title: '✅ 操作完成',
                    html: resultHtml,
                    icon: operationResult.filesDeleted > 0 || operationResult.gitignoreCreated > 0 ? 'success' : 'info',
                    width: 550,
                    confirmButtonText: '✅ 确定',
                    confirmButtonColor: '#2ea44f'
                });

            } catch (error) {
                console.error('[GitHubUIManager] 保留结构式删除操作失败:', error);
                Swal.close();

                if (error.message === '用户取消操作') {
                    await Swal.fire({
                        title: 'ℹ️ 已取消',
                        text: '操作已被用户取消',
                        icon: 'info',
                        timer: 2000,
                        toast: true,
                        position: 'top-end'
                    });
                } else {
                    await Swal.fire({
                        title: '❌ 操作失败',
                        html: `
                            <div style="text-align: left; font-size: 13px;">
                                <p><strong>❌ 错误信息:</strong> ${error.message}</p>
                            </div>
                        `,
                        icon: 'error',
                        width: 400,
                        confirmButtonText: '❌ 确定',
                        confirmButtonColor: '#dc3545'
                    });
                }
            } finally {
                this.isProcessing = false;
                this.currentOperation = null;
                this.updateButtonsState(false);
                this.updateProgress(0, '');
                this.resetDeleteConfirmState('github-delete-keep-structure-btn');
            }
        }

        async uploadFiles() {
            if (!this.repoInfo.isRepoPage) {
                await Swal.fire({
                    title: '❌ 错误',
                    text: '当前页面不是 GitHub 仓库页面',
                    icon: 'error',
                    toast: true,
                    position: 'top-end'
                });
                return;
            }

            this.isProcessing = true;
            this.currentOperation = 'upload';
            this.updateButtonsState(true);

            this.uploadManager = this.operations.getUploadManager();

            const currentDirectoryPath = RepoInfo.getCurrentDirectoryPath();
            const uploadLocation = currentDirectoryPath ? `📁 ${currentDirectoryPath}` : '📁 根目录';

            const { value: formValues, isDismissed } = await Swal.fire({
                title: '📤 上传文件',
                html: `
                    <div style="text-align: left; font-size: 13px;">
                        <p style="margin-bottom: 12px; padding: 8px; background: #f0f7ff; border-radius: 8px; border-left: 3px solid #4facfe;">
                            <strong>上传位置:</strong> ${uploadLocation}
                        </p>
                        <div class="upload-area" id="upload-drop-zone">
                            <div class="upload-icon">📤</div>
                            <p><strong>拖放文件或文件夹到这里</strong></p>
                            <p>或点击下方按钮选择文件</p>
                            <p style="font-size: 11px; color: #999; margin-top: 8px;">支持拖放多个文件和文件夹，保持原始层级结构</p>
                        </div>

                        <div id="selected-files-status" class="selected-files-status hidden">
                            <div class="selected-files-status-content">
                                <div class="selected-files-status-title">📋 已选择文件</div>
                                <div class="selected-files-status-details">
                                    <div class="selected-files-stat">
                                        <span class="selected-files-stat-value" id="selected-files-count">0</span>
                                        <span class="selected-files-stat-label">文件数</span>
                                    </div>
                                    <div class="selected-files-stat">
                                        <span class="selected-files-stat-value" id="selected-folders-count">0</span>
                                        <span class="selected-files-stat-label">文件夹</span>
                                    </div>
                                    <div class="selected-files-stat">
                                        <span class="selected-files-stat-value" id="selected-files-size">0 B</span>
                                        <span class="selected-files-stat-label">总大小</span>
                                    </div>
                                </div>
                            </div>
                            <button class="selected-files-status-clear" id="clear-selected-files">清空</button>
                        </div>

                        <div class="upload-buttons">
                            <button type="button" class="upload-btn file-btn" id="select-files-btn">
                                📄 选择文件
                            </button>
                            <button type="button" class="upload-btn folder-btn" id="select-folder-btn">
                                📁 选择文件夹
                            </button>
                        </div>
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: '📤 开始上传',
                cancelButtonText: '❌ 取消',
                confirmButtonColor: '#2ea44f',
                width: 450,
                showLoaderOnConfirm: false,
                preConfirm: () => {
                    if (this.uploadManager.files.length === 0) {
                        Swal.showValidationMessage('请选择要上传的文件');
                        return false;
                    }
                    return true;
                },
                didOpen: () => {
                    const dropZone = document.getElementById('upload-drop-zone');
                    const selectFilesBtn = document.getElementById('select-files-btn');
                    const selectFolderBtn = document.getElementById('select-folder-btn');
                    const clearSelectedFilesBtn = document.getElementById('clear-selected-files');
                    const selectedFilesStatus = document.getElementById('selected-files-status');

                    const updateSelectedFilesStatus = () => {
                        const stats = this.uploadManager.getFileStats();
                        const selectedFilesCount = document.getElementById('selected-files-count');
                        const selectedFoldersCount = document.getElementById('selected-folders-count');
                        const selectedFilesSize = document.getElementById('selected-files-size');

                        if (stats.totalFiles > 0) {
                            selectedFilesStatus.classList.remove('hidden');
                            selectedFilesCount.textContent = stats.totalFiles;
                            selectedFoldersCount.textContent = stats.folders;
                            selectedFilesSize.textContent = Utils.formatFileSize(stats.totalSize);
                        } else {
                            selectedFilesStatus.classList.add('hidden');
                        }
                    };

                    this.uploadManager.onFileListChanged = updateSelectedFilesStatus;

                    clearSelectedFilesBtn.addEventListener('click', () => {
                        this.uploadManager.clearAllFiles();
                        updateSelectedFilesStatus();
                    });

                    dropZone.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        dropZone.classList.add('drag-over');
                    });

                    dropZone.addEventListener('dragleave', (e) => {
                        e.preventDefault();
                        dropZone.classList.remove('drag-over');
                    });

                    dropZone.addEventListener('drop', async (e) => {
                        e.preventDefault();
                        dropZone.classList.remove('drag-over');

                        const items = e.dataTransfer.items;
                        if (items && items.length > 0) {
                            await this.uploadManager.handleDropItemsWithStructure(items);
                            updateSelectedFilesStatus();
                        }
                    });

                    selectFilesBtn.addEventListener('click', async () => {
                        await this.uploadManager.selectFilesAndFolders();
                        updateSelectedFilesStatus();
                    });

                    selectFolderBtn.addEventListener('click', async () => {
                        await this.uploadManager.selectFolders();
                        updateSelectedFilesStatus();
                    });
                }
            });

            if (isDismissed) {
                this.isProcessing = false;
                this.updateButtonsState(false);
                return;
            }

            try {
                const files = this.uploadManager.files;
                if (files.length === 0) {
                    await Swal.fire({
                        title: 'ℹ️ 提示',
                        text: '未选择任何文件',
                        icon: 'info',
                        confirmButtonText: '✅ 确定'
                    });
                    this.isProcessing = false;
                    this.updateButtonsState(false);
                    return;
                }

                const stats = this.uploadManager.getFileStats();
                const fileListHtml = files.slice(0, 10).map((file, index) => {
                    const displayPath = this.uploadManager.getRepositoryPath(file.relativePath);

                    return `
                    <div class="file-list-item">
                        <span class="file-icon">${file.relativePath.includes('/') ? '📁' : '📄'}</span>
                        <div class="file-info">
                            <div class="file-name">${file.name}</div>
                            <div class="file-path">${displayPath}</div>
                            <div class="file-size">${Utils.formatFileSize(file.size)}</div>
                        </div>
                        <button class="remove-file" data-index="${files.indexOf(file)}">✕</button>
                    </div>
                `}).join('');

                const moreCount = files.length > 10 ? files.length - 10 : 0;

                const { value: confirmUpload, isDismissed: uploadDismissed } = await Swal.fire({
                    title: '📋 确认上传',
                    html: `
                        <div style="text-align: left; font-size: 13px;">
                            <p style="margin-bottom: 12px; padding: 8px; background: #f0f7ff; border-radius: 8px; border-left: 3px solid #4facfe;">
                                <strong>上传位置:</strong> ${uploadLocation}
                            </p>
                            <div class="selected-files-status" style="margin-bottom: 16px;">
                                <div class="selected-files-status-content">
                                    <div class="selected-files-status-title">📋 已选择文件</div>
                                    <div class="selected-files-status-details">
                                        <div class="selected-files-stat">
                                            <span class="selected-files-stat-value">${files.length}</span>
                                            <span class="selected-files-stat-label">文件数</span>
                                        </div>
                                        <div class="selected-files-stat">
                                            <span class="selected-files-stat-value">${stats.folders}</span>
                                            <span class="selected-files-stat-label">文件夹</span>
                                        </div>
                                        <div class="selected-files-stat">
                                            <span class="selected-files-stat-value">${Utils.formatFileSize(stats.totalSize)}</span>
                                            <span class="selected-files-stat-label">总大小</span>
                                        </div>
                                    </div>
                                </div>
                                <button class="selected-files-status-clear" id="confirm-clear-selected-files">清空</button>
                            </div>
                            <div class="file-list-container">
                                ${fileListHtml}
                                ${moreCount > 0 ? `<div style="text-align: center; color: #999; padding: 10px;">... 还有 ${moreCount} 个文件</div>` : ''}
                            </div>
                        </div>
                    `,
                    showCancelButton: true,
                    confirmButtonText: '✅ 开始上传',
                    cancelButtonText: '❌ 取消',
                    confirmButtonColor: '#2ea44f',
                    width: 500,
                    didOpen: () => {
                        const clearBtn = document.getElementById('confirm-clear-selected-files');
                        clearBtn.addEventListener('click', (e) => {
                            this.uploadManager.clearAllFiles();
                            Swal.close();
                            this.uploadFiles();
                        });

                        document.querySelectorAll('.remove-file').forEach(btn => {
                            btn.addEventListener('click', (e) => {
                                const index = parseInt(e.target.dataset.index);
                                this.uploadManager.removeFile(index);
                                e.target.closest('.file-list-item').remove();

                                const newStats = this.uploadManager.getFileStats();
                                const statElements = document.querySelectorAll('.selected-files-stat-value');
                                if (statElements[0]) statElements[0].textContent = this.uploadManager.files.length;
                                if (statElements[1]) statElements[1].textContent = newStats.folders;
                                if (statElements[2]) statElements[2].textContent = Utils.formatFileSize(newStats.totalSize);

                                if (this.uploadManager.files.length === 0) {
                                    Swal.close();
                                    this.uploadFiles();
                                }
                            });
                        });
                    }
                });

                if (uploadDismissed) {
                    throw new Error('用户取消上传');
                }

                if (!confirmUpload) return;

                this.uploadManager.onProgress = (percent, message) => {
                    this.updateProgress(percent, message);
                };

                const progressSwal = Swal.fire({
                    title: '📤 正在上传文件...',
                    html: `
                        <div style="text-align: center;">
                            <p style="font-size: 12px; margin-bottom: 10px; color: #666;">
                                上传到: <strong>${uploadLocation}</strong>
                            </p>
                            <div class="progress-container" style="width: 80%; margin: 15px auto;">
                                <div id="swal-progress-bar" class="progress-bar" style="width: 0%;"></div>
                            </div>
                            <div id="swal-status-text" class="status-text" style="font-size: 12px;">准备上传...</div>
                        </div>
                    `,
                    allowOutsideClick: false,
                    showConfirmButton: false,
                    showCancelButton: true,
                    cancelButtonText: '❌ 取消',
                    width: 400
                });

                const updateProgress = (percent, message) => {
                    const statusText = document.getElementById('swal-status-text');
                    const progressBar = document.getElementById('swal-progress-bar');
                    if (statusText) statusText.textContent = message;
                    if (progressBar) progressBar.style.width = `${percent}%`;
                };

                progressSwal.then((result) => {
                    if (result.dismiss === Swal.DismissReason.cancel) {
                        throw new Error('用户取消上传');
                    }
                });

                const result = await this.uploadManager.uploadFiles();
                updateProgress(100, '上传完成！');

                await Utils.delay(500);
                Swal.close();

                if (result.success) {
                    let resultHtml = `<strong>文件上传完成！</strong><br><br>`;
                    resultHtml += `<p style="margin-bottom: 10px; padding: 8px; background: #f0f8ff; border-radius: 8px; border-left: 3px solid #4facfe;">
                        <strong>上传位置:</strong> ${result.uploadLocation}
                    </p>`;
                    resultHtml += `✅ 成功上传: <strong>${result.uploaded}</strong> 个文件<br>`;
                    resultHtml += `⏭️ 跳过: <strong>${result.skipped}</strong> 个文件<br>`;
                    resultHtml += `❌ 失败: <strong>${result.failed}</strong> 个文件`;

                    // 显示失败详情
                    if (result.failed > 0 && result.results) {
                        const failedFiles = result.results.filter(r => !r.success && r.action !== 'skipped');
                        if (failedFiles.length > 0) {
                            resultHtml += `<br><br><details style="text-align: left;"><summary>📋 查看失败详情</summary>`;
                            resultHtml += `<div class="error-details">`;
                            failedFiles.forEach((file, index) => {
                                resultHtml += `<div class="error-item">`;
                                resultHtml += `<strong>${index + 1}. ${file.displayPath || file.file}</strong><br>`;
                                resultHtml += `<small style="color: #721c24;">❌ 错误: ${file.error || '未知错误'}</small>`;
                                resultHtml += `</div>`;
                            });
                            resultHtml += `</div></details>`;
                        }
                    }

                    await Swal.fire({
                        title: result.failed === 0 ? '✅ 上传完成' : '⚠️ 上传完成（有失败）',
                        html: resultHtml,
                        icon: result.failed === 0 ? 'success' : 'warning',
                        width: 500,
                        confirmButtonText: '✅ 确定',
                        confirmButtonColor: '#2ea44f'
                    });
                } else {
                    await Swal.fire({
                        title: '❌ 上传失败',
                        html: `
                            <div style="text-align: left; font-size: 13px;">
                                <p><strong>上传位置:</strong> ${result.uploadLocation}</p>
                                <p><strong>❌ 错误信息:</strong> ${result.error}</p>
                                <p style="margin-top: 12px;">建议检查：</p>
                                <ul style="margin-left: 18px; line-height: 1.8;">
                                    <li>当前目录路径是否正确</li>
                                    <li>文件路径是否包含特殊字符</li>
                                    <li>网络连接是否正常</li>
                                    <li>Token 权限是否足够</li>
                                </ul>
                                <p style="margin-top: 12px; font-size: 11px; color: #666;">提示：可以在设置中启用调试模式查看详细日志</p>
                            </div>
                        `,
                        icon: 'error',
                        width: 500,
                        confirmButtonText: '❌ 确定',
                        confirmButtonColor: '#dc3545'
                    });
                }

            } catch (error) {
                console.error('[GitHubUIManager] 上传文件失败:', error);
                Swal.close();

                if (error.message === '用户取消上传') {
                    await Swal.fire({
                        title: 'ℹ️ 已取消',
                        text: '上传已被用户取消',
                        icon: 'info',
                        timer: 2000,
                        toast: true,
                        position: 'top-end'
                    });
                } else {
                    await Swal.fire({
                        title: '❌ 上传失败',
                        html: `
                            <div style="text-align: left; font-size: 13px;">
                                <p><strong>❌ 错误信息:</strong> ${error.message}</p>
                                <p style="margin-top: 12px;">当前目录: <strong>${RepoInfo.getCurrentDirectoryPath() || '根目录'}</strong></p>
                                <p style="margin-top: 12px; font-size: 11px; color: #666;">提示：可以在设置中启用调试模式查看详细日志</p>
                            </div>
                        `,
                        icon: 'error',
                        width: 450,
                        confirmButtonText: '❌ 确定',
                        confirmButtonColor: '#dc3545'
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

        async createGitignoreFiles() {
            if (!this.repoInfo.isRepoPage) {
                await Swal.fire({
                    title: '❌ 错误',
                    text: '当前页面不是 GitHub 仓库页面',
                    icon: 'error',
                    toast: true,
                    position: 'top-end'
                });
                return;
            }

            const repoName = `${this.repoInfo.owner}/${this.repoInfo.repo}`;
            const branch = this.branch;
            const currentDirectoryPath = RepoInfo.getCurrentDirectoryPath();
            const locationText = currentDirectoryPath ? `当前目录: ${currentDirectoryPath}` : '根目录';

            const result = await Swal.fire({
                title: '📄 创建 .gitignore 文件',
                html: `
                    <div style="text-align: left; font-size: 13px;">
                        <p><strong>📁 仓库:</strong> ${repoName}</p>
                        <p><strong>🌿 分支:</strong> ${branch}</p>
                        <p><strong>📂 位置:</strong> ${locationText}</p>
                        <p>此操作将在所有目录中创建 .gitignore 文件。</p>
                        <p>已存在的 .gitignore 文件将被跳过。</p>
                    </div>
                `,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: '✅ 开始创建',
                cancelButtonText: '❌ 取消',
                width: 400
            });

            if (!result.isConfirmed) return;

            this.isProcessing = true;
            this.currentOperation = 'gitignore';
            this.updateButtonsState(true);
            this.updateProgress(0, '正在扫描目录...');

            try {
                await Swal.fire({
                    title: '🔍 正在扫描目录...',
                    allowOutsideClick: false,
                    showConfirmButton: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });

                const directories = await this.operations.getAllDirectories();

                if (directories.length === 0) {
                    Swal.close();
                    await Swal.fire({
                        title: 'ℹ️ 提示',
                        text: '仓库中没有目录',
                        icon: 'info',
                        toast: true,
                        position: 'top-end'
                    });
                    return;
                }

                Swal.close();

                const confirmStart = await Swal.fire({
                    title: '📄 准备创建 .gitignore',
                    html: `将在 <strong style="color: #007bff;">${directories.length}</strong> 个目录中创建 .gitignore 文件`,
                    icon: 'info',
                    showCancelButton: true,
                    confirmButtonText: '✅ 开始创建',
                    cancelButtonText: '❌ 取消',
                    width: 350
                });

                if (!confirmStart.isConfirmed) {
                    throw new Error('用户取消创建');
                }

                const progressSwal = Swal.fire({
                    title: '📄 正在创建 .gitignore 文件...',
                    html: `
                        <div style="text-align: center;">
                            <div class="progress-container" style="width: 80%; margin: 15px auto;">
                                <div id="swal-progress-bar" class="progress-bar" style="width: 0%;"></div>
                            </div>
                            <div id="swal-status-text" class="status-text" style="font-size: 12px;">开始创建 .gitignore 文件...</div>
                        </div>
                    `,
                    allowOutsideClick: false,
                    showConfirmButton: false,
                    showCancelButton: true,
                    cancelButtonText: '❌ 取消',
                    width: 400
                });

                const updateProgress = (percent, message) => {
                    const statusText = document.getElementById('swal-status-text');
                    const progressBar = document.getElementById('swal-progress-bar');
                    if (statusText) statusText.textContent = message;
                    if (progressBar) progressBar.style.width = `${percent}%`;
                };

                let successCount = 0;
                let failCount = 0;
                let skipCount = 0;
                const results = [];

                for (let i = 0; i < directories.length; i++) {
                    const dir = directories[i];
                    const percent = Math.round(((i + 1) / directories.length) * 100);

                    this.updateProgress(percent, `处理中: ${i + 1}/${directories.length}`);
                    updateProgress(percent, `处理目录 ${i + 1}/${directories.length}`);

                    const result = await this.operations.createGitignoreFile(dir);
                    results.push(result);

                    if (result.success) {
                        successCount++;
                    } else if (result.skipped) {
                        skipCount++;
                    } else {
                        failCount++;
                    }

                    if ((i + 1) % 2 === 0 && i < directories.length - 1) {
                        await Utils.delay(1000);
                    }
                }

                updateProgress(100, '操作完成！');

                await Utils.delay(500);
                Swal.close();

                let resultHtml = `<strong>.gitignore 文件创建完成！</strong><br><br>`;
                resultHtml += `✅ 成功创建: <strong>${successCount}</strong> 个 .gitignore 文件<br>`;
                resultHtml += `⏭️ 已存在跳过: <strong>${skipCount}</strong> 个目录<br>`;
                resultHtml += `❌ 创建失败: <strong>${failCount}</strong> 个目录`;

                if (failCount > 0) {
                    resultHtml += `<br><br><details style="text-align: left;"><summary>📋 查看失败详情</summary>`;
                    resultHtml += `<div class="error-details">`;
                    results.forEach((result, index) => {
                        if (!result.success && !result.skipped) {
                            resultHtml += `<div class="error-item">`;
                            resultHtml += `<strong>${index + 1}. ${result.path || '根目录'}</strong><br>`;
                            resultHtml += `<small style="color: #721c24;">❌ 错误: ${result.error}</small>`;
                            resultHtml += `</div>`;
                        }
                    });
                    resultHtml += `</div></details>`;
                }

                await Swal.fire({
                    title: '✅ 操作完成',
                    html: resultHtml,
                    icon: successCount > 0 ? 'success' : 'info',
                    width: 450,
                    confirmButtonText: '✅ 确定',
                    confirmButtonColor: '#2ea44f'
                });

            } catch (error) {
                console.error('[GitHubUIManager] 创建 .gitignore 失败:', error);
                Swal.close();

                if (error.message === '用户取消创建') {
                    await Swal.fire({
                        title: 'ℹ️ 已取消',
                        text: '操作已被用户取消',
                        icon: 'info',
                        timer: 2000,
                        toast: true,
                        position: 'top-end'
                    });
                } else {
                    await Swal.fire({
                        title: '❌ 操作失败',
                        html: `
                            <div style="text-align: left; font-size: 13px;">
                                <p><strong>❌ 错误信息:</strong> ${error.message}</p>
                            </div>
                        `,
                        icon: 'error',
                        width: 400,
                        confirmButtonText: '❌ 确定',
                        confirmButtonColor: '#dc3545'
                    });
                }
            } finally {
                this.isProcessing = false;
                this.currentOperation = null;
                this.updateButtonsState(false);
                this.updateProgress(0, '');
            }
        }

        async deleteRepository() {
            if (!this.repoInfo.isRepoPage) {
                await Swal.fire({
                    title: '❌ 错误',
                    text: '当前页面不是 GitHub 仓库页面',
                    icon: 'error',
                    toast: true,
                    position: 'top-end'
                });
                this.resetDeleteConfirmState('github-delete-repo-btn');
                return;
            }

            const repoName = `${this.repoInfo.owner}/${this.repoInfo.repo}`;

            this.isProcessing = true;
            this.currentOperation = 'delete-repo';
            this.updateButtonsState(true);

            try {
                const repoInfo = await Swal.fire({
                    title: '📊 正在获取仓库信息...',
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

                const repoDetailsHtml = `
                    <div style="text-align: left; font-size: 13px;">
                        <p><strong>📁 仓库名称:</strong> ${repositoryData.full_name}</p>
                        <p><strong>📝 描述:</strong> ${repositoryData.description || '无描述'}</p>
                        <p><strong>📅 创建时间:</strong> ${new Date(repositoryData.created_at).toLocaleDateString('zh-CN')}</p>
                        <p><strong>🔄 最后更新:</strong> ${new Date(repositoryData.updated_at).toLocaleDateString('zh-CN')}</p>
                        <p><strong>🌿 默认分支:</strong> ${repositoryData.default_branch}</p>
                        <p><strong>💾 仓库大小:</strong> ${repositoryData.size ? Math.round(repositoryData.size / 1024) : '未知'} MB</p>

                        <div class="danger-note">
                            <p style="font-weight: 600; color: #dc3545; margin-bottom: 8px;">🔥 再次警告：此操作不可撤销！</p>
                            <p>请在下方输入 <strong style="color: #dc3545;">DELETE</strong> 以确认删除：</p>
                            <input type="text" id="confirm-repo-fullname" class="swal2-input" placeholder="DELETE" autocomplete="off" style="font-size: 13px; font-weight: 600;">
                        </div>
                    </div>
                `;

                const finalConfirm = await Swal.fire({
                    title: '🗑️ 确认删除存储库',
                    html: repoDetailsHtml,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: '🗑️ 确认删除',
                    cancelButtonText: '❌ 取消',
                    confirmButtonColor: '#8b0000',
                    width: 550,
                    focusCancel: true,
                    preConfirm: () => {
                        const input = document.getElementById('confirm-repo-fullname');
                        const expectedText = `DELETE`;
                        if (!input || input.value.trim() !== expectedText) {
                            Swal.showValidationMessage(`请输入 "${expectedText}" 以确认`);
                            return false;
                        }
                        return true;
                    }
                });

                if (!finalConfirm.isConfirmed) {
                    throw new Error('用户取消删除');
                }

                const deleteProgress = await Swal.fire({
                    title: '🗑️ 正在删除存储库...',
                    html: `
                        <div style="text-align: center;">
                            <div class="progress-container" style="width: 80%; margin: 15px auto;">
                                <div id="swal-progress-bar" class="progress-bar" style="width: 0%;"></div>
                            </div>
                            <div id="swal-status-text" class="status-text" style="font-size: 12px;">正在删除存储库 ${repositoryData.full_name}...</div>
                        </div>
                    `,
                    allowOutsideClick: false,
                    showConfirmButton: false,
                    showCancelButton: false,
                    width: 400
                });

                const updateProgress = (percent, message) => {
                    const statusText = document.getElementById('swal-status-text');
                    const progressBar = document.getElementById('swal-progress-bar');
                    if (statusText) statusText.textContent = message;
                    if (progressBar) progressBar.style.width = `${percent}%`;
                };

                updateProgress(30, '正在验证权限...');

                try {
                    const userResponse = await this.api.get('/user');
                    console.log('[GitHubUIManager] 用户权限验证通过:', userResponse.login);
                } catch (error) {
                    throw new Error('Token 权限不足，无法删除存储库');
                }

                updateProgress(60, '正在删除存储库...');

                const deleteResult = await this.api.deleteRepository(this.repoInfo.owner, this.repoInfo.repo);
                updateProgress(100, '删除完成！');

                await Utils.delay(1000);
                Swal.close();

                await Swal.fire({
                    title: '✅ 存储库删除成功',
                    html: `
                        <div style="text-align: center; font-size: 13px;">
                            <p style="margin-bottom: 12px; font-size: 15px;">存储库 <strong>${repositoryData.full_name}</strong> 已成功删除。</p>
                            <p>页面将在 5 秒后跳转到您的仓库列表...</p>
                            <div style="margin-top: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef; font-size: 12px;">
                                <p style="font-weight: 600; margin-bottom: 8px;">🗑️ 已删除的内容：</p>
                                <ul style="text-align: left; margin: 8px 0; padding-left: 18px; line-height: 1.8;">
                                    <li>所有文件和文件夹</li>
                                    <li>提交历史和分支</li>
                                    <li>Issues 和 Pull Requests</li>
                                    <li>仓库设置和 Webhooks</li>
                                </ul>
                            </div>
                        </div>
                    `,
                    icon: 'success',
                    timer: 5000,
                    timerProgressBar: true,
                    showConfirmButton: false,
                    width: 480
                });

                setTimeout(() => {
                    window.location.href = `https://github.com/${this.repoInfo.owner}?tab=repositories`;
                }, 5000);

            } catch (error) {
                console.error('[GitHubUIManager] 删除存储库失败:', error);
                Swal.close();

                if (error.message === '用户取消删除') {
                    await Swal.fire({
                        title: 'ℹ️ 已取消',
                        text: '存储库删除操作已被取消',
                        icon: 'info',
                        timer: 2000,
                        toast: true,
                        position: 'top-end'
                    });
                } else if (error.message.includes('权限不足')) {
                    await Swal.fire({
                        title: '🔐 权限不足',
                        html: `
                            <div style="text-align: left; font-size: 13px;">
                                <p><strong>❌ 错误信息:</strong> ${error.message}</p>
                                <p style="margin-top: 12px;">请确保：</p>
                                <ul style="margin-left: 18px; line-height: 1.8;">
                                    <li>Token 具有管理员权限</li>
                                    <li>您是仓库的所有者或管理员</li>
                                    <li>Token 未被撤销或过期</li>
                                </ul>
                            </div>
                        `,
                        icon: 'error',
                        width: 450,
                        confirmButtonText: '❌ 确定',
                        confirmButtonColor: '#dc3545'
                    });
                } else if (error.message.includes('404')) {
                    await Swal.fire({
                        title: '🔍 仓库不存在',
                        text: '指定的仓库可能已被删除或不存在',
                        icon: 'warning',
                        width: 400,
                        confirmButtonText: '❌ 确定',
                        confirmButtonColor: '#fd7e14'
                    });
                } else {
                    await Swal.fire({
                        title: '❌ 删除失败',
                        html: `
                            <div style="text-align: left; font-size: 13px;">
                                <p><strong>❌ 错误信息:</strong> ${error.message}</p>
                                <p style="margin-top: 12px;">可能的原因：</p>
                                <ul style="margin-left: 18px; line-height: 1.8;">
                                    <li>网络连接问题</li>
                                    <li>GitHub API 限制</li>
                                    <li>仓库已被锁定或正在处理其他操作</li>
                                </ul>
                            </div>
                        `,
                        icon: 'error',
                        width: 450,
                        confirmButtonText: '❌ 确定',
                        confirmButtonColor: '#dc3545'
                    });
                }
            } finally {
                this.isProcessing = false;
                this.currentOperation = null;
                this.updateButtonsState(false);
                this.updateProgress(0, '');
                this.resetDeleteConfirmState('github-delete-repo-btn');
            }
        }
    }

    // ==================== Tampermonkey 控制面板 ====================
    function addTampermonkeyControlPanel() {
        setTimeout(() => {
            const selectors = ['#scripts', '.script_list', '.tm-container', '.tm-script-list', 'body'];

            for (const selector of selectors) {
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
            <h3>📁 GitHub 批量文件管理工具 v5.1.1</h3>
            <div class="github-tools-toggle">
                <span>脚本启用状态</span>
                <label class="switch">
                    <input type="checkbox" ${StateManager.getScriptEnabled() ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
            <p style="font-size: 12px; margin-bottom: 12px;"><strong>📋 功能说明：</strong></p>
            <ul style="margin: 8px 0 15px 0; padding-left: 18px; color: #666; font-size: 12px; line-height: 1.8;">
                <li>🗑️ 删除所有文件（保留目录结构）</li>
                <li>📂 保留结构式删除文件</li>
                <li>📄 在所有文件夹中创建 .gitignore 文件</li>
                <li>📤 上传本地文件和文件夹到仓库</li>
                <li>🗑️ 一键删除存储库（危险操作）</li>
                <li>🆕 拖放上传文件和文件夹</li>
                <li>🆕 双次点击确认删除</li>
                <li>✅ 修复上传到子目录失败和API响应处理问题</li>
                <li>✅ 增强对GitHub API不同响应格式的处理</li>
                <li>✅ 改进上传到子目录的稳定性</li>
                <li>✅ 修复Cannot read properties of null错误</li>
            </ul>
            <div class="github-tools-buttons">
                <button class="github-tool-btn" id="tm-open-github">🌍 访问 GitHub</button>
                <button class="github-tool-btn settings" id="tm-configure-token">🔑 配置 Token</button>
                <button class="github-tool-btn" id="tm-test-connection">🔍 测试连接</button>
                <button class="github-tool-btn danger" id="tm-open-panel">📁 打开面板</button>
            </div>
            <div style="margin-top: 16px; padding: 12px; background: linear-gradient(145deg, #f8f9fa 0%, #ffffff 100%); border-radius: 10px; font-size: 11px; color: #666; line-height: 1.6;">
                脚本状态：<span id="tm-status">${StateManager.getScriptEnabled() ? '✅ 已启用' : '❌ 已禁用'}</span>
                <br>
                <small>💡 在 GitHub 仓库页面会自动显示工具面板</small>
                <br>
                <small>📁 <strong>更新 v5.1.1:</strong> 修复子目录上传问题 - 正确解析分支和路径</small>
                <br>
                <small>🔧 调试模式: ${CONFIG.DEBUG_MODE ? '✅ 已启用' : '❌ 已禁用'}</small>
            </div>
        `;

        if (container.id === 'scripts' || container.classList.contains('script_list')) {
            container.insertBefore(panel, container.firstChild);
        } else {
            container.insertAdjacentElement('afterbegin', panel);
        }

        GM_addStyle(STYLES);

        document.getElementById('tm-open-github').addEventListener('click', () => {
            GM_openInTab('https://github.com', { active: true });
        });

        document.getElementById('tm-configure-token').addEventListener('click', async () => {
            await TokenManager.requestToken();
        });

        document.getElementById('tm-test-connection').addEventListener('click', async () => {
            const token = TokenManager.getToken();
            if (!token) {
                GM_notification({
                    title: '❌ 错误',
                    text: '请先配置 GitHub Token',
                    timeout: 3000
                });
                return;
            }

            try {
                const response = await fetch(`${CONFIG.API_BASE}/user`, {
                    headers: {
                        'Authorization': `token ${token}`
                    }
                });

                if (response.ok) {
                    const user = await response.json();
                    GM_notification({
                        title: '✅ 连接成功',
                        text: `已连接为：${user.login}`,
                        timeout: 3000
                    });
                } else {
                    GM_notification({
                        title: '❌ 连接失败',
                        text: 'Token 无效或网络错误',
                        timeout: 3000
                    });
                }
            } catch (error) {
                GM_notification({
                    title: '❌ 连接失败',
                    text: '网络错误或 API 限制',
                    timeout: 3000
                });
            }
        });

        document.getElementById('tm-open-panel').addEventListener('click', () => {
            GM_openInTab('https://github.com', { active: true }).then(() => {
                GM_notification({
                    title: '💡 GitHub 工具',
                    text: '请在 GitHub 仓库页面使用工具面板',
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
                    title: '✅ GitHub 工具',
                    text: '脚本已启用，请刷新 GitHub 页面',
                    timeout: 3000
                });
            }
        });
    }

    // ==================== 主初始化函数 ====================
    function main() {
        if (StateManager.isGitHubPage() && StateManager.getScriptEnabled()) {
            console.log('[GitHub Batch Tools] v5.1.1 - 开始初始化');
            Utils.debugLog('[GitHub Batch Tools] 调试模式:', CONFIG.DEBUG_MODE);
            initializeGitHubPage();
        }
    }

    function initializeGitHubPage() {
        const repoInfo = RepoInfo.getCurrentRepo();
        if (!repoInfo.isRepoPage) {
            console.log('[GitHub Batch Tools] 不在 GitHub 仓库页面，脚本不激活');
            return;
        }

        const initializeWithRetry = (retryCount = 0) => {
            try {
                if (document.readyState === 'loading') {
                    console.log('[GitHub Batch Tools] 文档仍在加载，等待...');
                    if (retryCount < CONFIG.INIT_RETRY_COUNT) {
                        setTimeout(() => initializeWithRetry(retryCount + 1), CONFIG.INIT_RETRY_DELAY);
                    }
                    return;
                }

                if (document.getElementById('github-tools-floating')) {
                    console.log('[GitHub Batch Tools] 面板已存在，跳过初始化');
                    return;
                }

                const githubSelectors = [
                    'body',
                    '#repository-container-header',
                    '.repository-content',
                    '[data-pjax="#js-repo-pjax-container"]',
                    '.Layout-main',
                    '.Box',
                    '.file-navigation'
                ];

                const isGitHubPageLoaded = githubSelectors.some(selector =>
                    document.querySelector(selector)
                );

                if (!isGitHubPageLoaded) {
                    console.log('[GitHub Batch Tools] GitHub页面元素未找到，等待...');
                    if (retryCount < CONFIG.INIT_RETRY_COUNT) {
                        setTimeout(() => initializeWithRetry(retryCount + 1), CONFIG.INIT_RETRY_DELAY);
                    }
                    return;
                }

                const observer = new MutationObserver((mutations) => {
                    const shouldInitialize = mutations.some(mutation => {
                        if (mutation.addedNodes.length > 0) {
                            for (const node of mutation.addedNodes) {
                                if (node.nodeType === Node.ELEMENT_NODE) {
                                    const element = node;
                                    if (element.classList && (
                                        element.classList.contains('repository-content') ||
                                        element.id === 'repository-container-header' ||
                                        element.hasAttribute('data-pjax') ||
                                        element.classList.contains('Box') ||
                                        element.classList.contains('file-navigation')
                                    )) {
                                        return true;
                                    }
                                }
                            }
                        }
                        return false;
                    });

                    if (shouldInitialize) {
                        observer.disconnect();
                        setTimeout(() => {
                            try {
                                if (!document.getElementById('github-tools-floating')) {
                                    new GitHubUIManager();
                                    console.log('[GitHub Batch Tools] v5.1.1 初始化成功（通过DOM监听）');
                                }
                            } catch (error) {
                                console.error('[GitHub Batch Tools] 脚本初始化失败:', error);
                            }
                        }, 1000);
                    }
                });

                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });

                setTimeout(() => {
                    try {
                        if (!document.getElementById('github-tools-floating')) {
                            new GitHubUIManager();
                            console.log('[GitHub Batch Tools] v5.1.1 初始化成功');
                        }
                        observer.disconnect();
                    } catch (error) {
                        console.error('[GitHub Batch Tools] 脚本初始化失败:', error);
                    }
                }, 1500);

                setTimeout(() => {
                    observer.disconnect();
                }, 20000);

            } catch (error) {
                console.error('[GitHub Batch Tools] 初始化过程中出错:', error);
                if (retryCount < CONFIG.INIT_RETRY_COUNT) {
                    setTimeout(() => initializeWithRetry(retryCount + 1), CONFIG.INIT_RETRY_DELAY);
                }
            }
        };

        initializeWithRetry();
    }

    // ==================== 菜单命令注册 ====================
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('📁 打开 GitHub 工具面板', () => {
            const panel = document.getElementById('github-tools-floating');
            if (panel) {
                panel.style.display = 'block';
                panel.classList.remove('minimized');
                document.getElementById('github-tools-fab')?.remove();
                // 获取当前页面管理器并刷新信息
                const manager = window.githubToolsManager;
                if (manager && typeof manager.refreshPanelInfo === 'function') {
                    manager.refreshPanelInfo();
                }
            } else {
                main();
            }
        });

        GM_registerMenuCommand('🔑 配置 GitHub Token', async () => {
            await TokenManager.requestToken();
        });

        GM_registerMenuCommand('🔍 测试 API 连接', () => {
            const repoInfo = RepoInfo.getCurrentRepo();
            if (repoInfo.isRepoPage) {
                const manager = new GitHubUIManager();
                manager.testAPI();
            } else {
                Swal.fire('💡 提示', '请在 GitHub 仓库页面使用此功能', 'info');
            }
        });

        GM_registerMenuCommand('📤 上传文件到仓库', () => {
            const repoInfo = RepoInfo.getCurrentRepo();
            if (repoInfo.isRepoPage) {
                const manager = new GitHubUIManager();
                manager.handleUploadFiles();
            } else {
                Swal.fire('💡 提示', '请在 GitHub 仓库页面使用此功能', 'info');
            }
        });

        GM_registerMenuCommand('🗑️ 删除存储库', () => {
            const repoInfo = RepoInfo.getCurrentRepo();
            if (repoInfo.isRepoPage) {
                const manager = new GitHubUIManager();
                manager.handleDeleteRepository();
            } else {
                Swal.fire('💡 提示', '请在 GitHub 仓库页面使用此功能', 'info');
            }
        });

        GM_registerMenuCommand('🔧 切换调试模式', () => {
            CONFIG.DEBUG_MODE = !CONFIG.DEBUG_MODE;
            GM_notification({
                title: '🔧 调试模式',
                text: CONFIG.DEBUG_MODE ? '已启用' : '已禁用',
                timeout: 2000
            });
        });
    }

    // ==================== 启动脚本 ====================
    if (StateManager.isTampermonkeyPage()) {
        addTampermonkeyControlPanel();
    }

    // 改进的启动方式
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    } else {
        setTimeout(main, 2000);

        const checkInterval = setInterval(() => {
            if (document.querySelector('.repository-content') && !document.getElementById('github-tools-floating')) {
                clearInterval(checkInterval);
                main();
            }
        }, 1000);

        setTimeout(() => clearInterval(checkInterval), 10000);
    }

})();
// v5.1.1 深色模式检测
function __gt_isDark() {
  const a = document.documentElement.getAttribute('data-color-mode');
  if (a) return a === 'dark';
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}
function __gt_applyTheme() {
  const p = document.getElementById('github-tools-floating');
  const f = document.getElementById('github-tools-fab');
  const d = __gt_isDark();
  if (p) p.classList.toggle('gt-dark', d);
  if (f) f.classList.toggle('gt-dark', d);
}
const __gt_mo = new MutationObserver(__gt_applyTheme);
__gt_mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-color-mode'] });
