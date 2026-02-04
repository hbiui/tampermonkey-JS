// ==UserScript==
// @name         DeepSeek 提示词助手 v12.2 (稳定入口版)
// @namespace    http://tampermonkey.net/
// @version      12.2
// @description  增强按钮注入稳定性，优化性能，修复导入问题
// @author       DeepSeekUser
// @match        https://chat.deepseek.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=deepseek.com
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 1. 原始内置模板 (数据持久化种子) - 更新为JSON中的所有分类
    // ==========================================
    const DB_KEY = 'ds_helper_v12_storage';
    const DB_VERSION = '12.2';
    const DEFAULT_CAT = "我的收藏";

    const INITIAL_TEMPLATE = {
        "💻 编程技术": [
            { title: "代码深度剖析", content: "请作为资深架构师，解释以下代码的实现原理、设计模式、潜在性能瓶颈及安全性漏洞：\n\n[代码]" },
            { title: "SQL 优化专家", content: "以下 SQL 查询执行很慢，请分析执行计划，解释原因，并提供索引优化或重写建议：\n\n[SQL]" },
            { title: "Vue3/React 转换", content: "请将这段代码重构为 Composition API (Vue3) 或 Hooks (React) 风格，并优化逻辑复用性。" },
            { title: "Python 算法优化", content: "优化以下Python代码的性能，考虑时间复杂度和空间复杂度，并提供改进建议：\n\n[代码]" },
            { title: "前端性能调优", content: "分析以下前端代码的性能问题，提供优化建议，包括资源加载、渲染性能、内存管理等方面：\n\n[代码或URL]" }
        ],
        "📈 市场运营": [
            { title: "小红书爆款", content: "模仿头部博主语气写种草文案。产品：[产品]。要求：标题带悬念和数字，正文多 Emoji，语气亲切，痛点+场景+解决方案。" },
            { title: "短视频脚本", content: "生成 1 分钟短视频分镜脚本。主题：[主题]。包含：黄金 3 秒开场、剧情反转、口播台词、BGM 情绪建议。" },
            { title: "品牌定位分析", content: "为[品牌]进行市场定位分析，包括目标用户画像、竞品分析、差异化策略、品牌价值主张。" },
            { title: "SEO 优化方案", content: "为[网站/产品]制定SEO优化方案，包括关键词策略、内容优化、外链建设、技术SEO建议。" },
            { title: "社交媒体策略", content: "制定[品牌]的社交媒体运营策略，包括平台选择、内容规划、互动策略、KOL合作方案。" }
        ],
        "🎓 学术科研": [
            { title: "论文降重", content: "请保持学术含义不变，通过改变句式、替换同义词、主动转被动等方式，大幅降低以下段落的查重率：\n\n[段落]" },
            { title: "SCI 摘要润色", content: "请作为 Nature/Science 级别的审稿人，润色此摘要。要求：提升学术词汇丰富度，句式紧凑，逻辑流更顺畅。" },
            { title: "研究方案设计", content: "为[研究主题]设计详细的研究方案，包括研究问题、假设、方法、样本选择、数据分析计划。" },
            { title: "文献综述框架", content: "为[研究领域]构建文献综述框架，包括主题分类、理论发展脉络、研究缺口、未来研究方向。" },
            { title: "学术论文结构", content: "为[论文主题]提供标准的学术论文结构建议，包括摘要、引言、方法、结果、讨论、结论各部分要点。" }
        ],
        "🎨 AI 绘画": [
            { title: "Midjourney 摄影级", content: "生成 MJ V6 提示词。画面：[描述]。风格：索尼 A7R4，85mm 镜头，电影感布光，超高清，--ar 16:9 --v 6.0" },
            { title: "Logo 设计", content: "设计 Logo 提示词。品牌：[名称]。理念：[理念]。风格：极简主义/矢量图/扁平化。" },
            { title: "角色设计", content: "设计游戏角色提示词。职业：[职业]。特征：[特征]。风格：动漫/写实/像素风，详细描述外观、服装、装备。" },
            { title: "场景概念图", content: "生成场景概念艺术提示词。场景：[描述]。氛围：[氛围]。风格：科幻/奇幻/赛博朋克，包含光影、天气、细节。" },
            { title: "产品渲染图", content: "生成产品3D渲染提示词。产品：[产品]。材质：[材质]。布光：[布光要求]。背景：[背景]，高质量渲染，商业级表现。" }
        ],
        "🔍 数据分析": [
            { title: "数据清洗指南", content: "为以下数据集提供数据清洗方案：\n1. 缺失值处理策略\n2. 异常值检测方法\n3. 数据标准化建议\n4. 特征工程思路\n\n数据集描述：[描述]" },
            { title: "可视化图表选择", content: "针对以下分析目的，推荐最合适的可视化图表类型并说明理由：\n分析目的：[目的]\n数据类型：[类型]\n受众群体：[受众]" },
            { title: "A/B 测试分析", content: "分析以下A/B测试结果：\n控制组数据：[数据]\n实验组数据：[数据]\n统计显著性要求：[要求]\n提供结论和建议。" },
            { title: "用户行为分析", content: "分析用户行为数据，识别关键行为路径、转化漏斗、流失点，提供优化建议。" }
        ],
        "📝 内容创作": [
            { title: "爆款文章结构", content: "为[主题]设计爆款文章结构：\n1. 吸睛标题（3个版本）\n2. 开头钩子（2种方式）\n3. 正文框架（逻辑递进）\n4. 结尾升华（行动号召）" },
            { title: "公众号推文", content: "写一篇公众号推文。主题：[主题]。风格：[风格]。要求：段落清晰，小标题突出，金句点缀，互动性强。" },
            { title: "广告文案创意", content: "为[产品]创作广告文案，包含：\n1. 主标语（10字以内）\n2. 副标（20字以内）\n3. 正文（200字）\n4. 行动号召" },
            { title: "播客大纲设计", content: "设计播客节目大纲。主题：[主题]。时长：[时长]。包含：开场白、话题引入、嘉宾对话要点、互动环节、结尾总结。" }
        ],
        "🌐 外语学习": [
            { title: "英语语法纠正", content: "纠正以下英语句子中的语法错误，并解释错误原因和正确用法：\n\n[句子]" },
            { title: "口语表达优化", content: "优化以下口语表达，使其更地道、自然：\n\n[表达]\n使用场景：[场景]" },
            { title: "商务邮件写作", content: "撰写商务邮件。类型：[类型，如询价、投诉、邀请等]。收件人：[对象]。语气：[语气]。包含所有必要元素。" },
            { title: "语言学习计划", content: "制定[语言]学习计划。水平：[当前水平]。目标：[目标]。时间：[周期]。提供每日学习安排和资源推荐。" }
        ],
        "🎮 游戏设计": [
            { title: "游戏机制设计", content: "设计[类型]游戏的游戏机制：\n1. 核心玩法循环\n2. 成长系统\n3. 奖励机制\n4. 平衡性考虑" },
            { title: "角色技能系统", content: "设计游戏角色技能系统。职业：[职业]。定位：[定位]。包含主动技能、被动技能、天赋树设计。" },
            { title: "关卡设计思路", content: "设计游戏关卡。游戏类型：[类型]。难度：[难度]。包含：地形布局、敌人配置、谜题设计、奖励放置。" },
            { title: "叙事设计框架", content: "构建游戏叙事框架。世界观：[世界观]。主角：[主角]。包含：主要剧情线、支线任务、角色弧光、关键转折点。" }
        ],
        "💼 商业咨询": [
            { title: "商业模式画布", content: "为[企业/产品]填写商业模式画布：\n1. 客户细分\n2. 价值主张\n3. 渠道通路\n4. 客户关系\n5. 收入来源\n6. 核心资源\n7. 关键业务\n8. 重要伙伴\n9. 成本结构" },
            { title: "SWOT 分析", content: "为[企业/项目]进行SWOT分析：\n优势、劣势、机会、威胁，并提供战略建议。" },
            { title: "市场营销计划", content: "制定[产品]的市场营销计划，包括：目标市场、定位策略、营销渠道、促销活动、预算分配、KPI指标。" },
            { title: "竞品分析报告", content: "分析[产品]的竞品：\n1. 竞品列表\n2. 功能对比\n3. 价格策略\n4. 用户评价\n5. 市场份额\n6. 差异化机会" }
        ],
        "⚖️ 法律文书": [
            { title: "合同条款审核", content: "审核以下合同条款，指出潜在风险、模糊表述、权利义务不对等问题，并提供修改建议：\n\n[合同条款]" },
            { title: "隐私政策生成", content: "为[应用/网站]生成隐私政策模板，包含：数据收集范围、使用方式、存储保护、用户权利、Cookie政策等。" },
            { title: "免责声明起草", content: "为[产品/服务]起草免责声明，涵盖责任限制、使用风险、知识产权、争议解决等。" },
            { title: "用户协议框架", content: "构建用户协议框架，包含：服务条款、账户管理、内容规范、费用说明、终止条件、法律适用等。" }
        ],
        "❤️ 心理健康": [
            { title: "压力管理策略", content: "针对以下压力情境，提供压力管理策略：\n情境：[描述]\n包含：认知重构、放松技巧、时间管理、社交支持建议。" },
            { title: "沟通技巧指导", content: "改善沟通技巧，特别是在[情境]下：\n1. 积极倾听方法\n2. 非暴力沟通表达\n3. 冲突解决策略\n4. 同理心建立" },
            { title: "情绪调节方法", content: "提供情绪调节方法，针对[情绪]：\n1. 识别与接纳\n2. 身体调节技巧\n3. 认知调节策略\n4. 行为调节建议" },
            { title: "自我关爱计划", content: "制定个性化自我关爱计划，包括：日常小确幸、身心健康维护、社交滋养、成长学习安排。" }
        ],
        "🏠 生活助手": [
            { title: "旅行规划助手", content: "规划[目的地]旅行：\n时间：[时长]\n预算：[预算]\n兴趣：[兴趣]\n提供：行程安排、住宿推荐、餐饮建议、交通方案、注意事项。" },
            { title: "家居装修方案", content: "为[空间]提供装修方案：\n风格：[风格]\n预算：[预算]\n需求：[需求]\n包含：布局设计、材料选择、色彩搭配、家具配置、预算分配。" },
            { title: "健身训练计划", content: "制定健身训练计划：\n目标：[目标]\n水平：[水平]\n时间：[每周时间]\n设备：[可用设备]\n提供：训练安排、动作指导、营养建议、休息安排。" },
            { title: "饮食营养搭配", content: "设计饮食计划：\n目标：[减脂/增肌/健康]\n禁忌：[禁忌]\n偏好：[口味偏好]\n提供：一日三餐搭配、营养比例、食材选择、烹饪建议。" }
        ]
    };

    // ==========================================
    // 2. 数据管理引擎 (性能优化版)
    // ==========================================
    const Store = {
        // 缓存数据
        _cache: null,
        _cacheTimestamp: 0,
        CACHE_TTL: 30000, // 30秒缓存
        
        init() {
            let data = localStorage.getItem(DB_KEY);
            if (!data) {
                this.resetFactory();
                return;
            }
            
            try {
                const parsed = JSON.parse(data);
                // 版本迁移逻辑
                if (!parsed.version || parsed.version !== DB_VERSION) {
                    console.log(`迁移从 ${parsed.version || '旧版本'} 到 ${DB_VERSION}`);
                    parsed.version = DB_VERSION;
                    this.save(parsed);
                }
            } catch (e) {
                console.error('数据解析失败，重置为出厂设置', e);
                this.resetFactory();
            }
            this._cache = null; // 清除缓存
        },
        
        load(force = false) {
            // 使用缓存减少localStorage读取
            const now = Date.now();
            if (!force && this._cache && (now - this._cacheTimestamp) < this.CACHE_TTL) {
                return this._cache;
            }
            
            try {
                const data = localStorage.getItem(DB_KEY);
                const result = JSON.parse(data || '{"version":"' + DB_VERSION + '","prompts":[],"categories":[]}');
                this._cache = result;
                this._cacheTimestamp = now;
                return result;
            } catch (e) {
                return { version: DB_VERSION, prompts: [], categories: [] };
            }
        },
        
        save(data) {
            data.version = DB_VERSION;
            data.lastModified = Date.now();
            localStorage.setItem(DB_KEY, JSON.stringify(data));
            this._cache = data;
            this._cacheTimestamp = Date.now();
        },
        
        resetFactory() {
            const prompts = [];
            const categories = [DEFAULT_CAT];
            
            for (let cat in INITIAL_TEMPLATE) {
                if (INITIAL_TEMPLATE.hasOwnProperty(cat)) {
                    categories.push(cat);
                    INITIAL_TEMPLATE[cat].forEach(p => {
                        prompts.push({
                            id: `sys_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            title: p.title,
                            content: p.content,
                            category: cat,
                            isCustom: true,
                            createdAt: Date.now()
                        });
                    });
                }
            }
            
            const data = {
                version: DB_VERSION,
                prompts,
                categories: [...new Set(categories)],
                lastModified: Date.now()
            };
            this.save(data);
            this._cache = data;
            this._cacheTimestamp = Date.now();
            return data;
        },
        
        upsertPrompt(obj) {
            const data = this.load();
            
            if (obj.category && !data.categories.includes(obj.category)) {
                data.categories.push(obj.category);
            }
            
            if (obj.id) {
                const idx = data.prompts.findIndex(p => p.id === obj.id);
                if (idx !== -1) {
                    data.prompts[idx] = { 
                        ...data.prompts[idx], 
                        ...obj,
                        updatedAt: Date.now()
                    };
                } else {
                    data.prompts.unshift({
                        ...obj,
                        id: `u_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        isCustom: true,
                        createdAt: Date.now()
                    });
                }
            } else {
                data.prompts.unshift({
                    ...obj,
                    id: `u_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    isCustom: true,
                    createdAt: Date.now()
                });
            }
            
            this.save(data);
        },
        
        deletePrompt(id) {
            const data = this.load();
            data.prompts = data.prompts.filter(p => p.id !== id);
            this.save(data);
        },
        
        renameCategory(oldName, newName) {
            if (!newName || oldName === newName) return false;
            
            const data = this.load();
            const idx = data.categories.indexOf(oldName);
            
            if (idx !== -1) {
                data.categories[idx] = newName;
                data.prompts.forEach(p => {
                    if (p.category === oldName) {
                        p.category = newName;
                        p.updatedAt = Date.now();
                    }
                });
                this.save(data);
                return true;
            }
            return false;
        },
        
        deleteCategory(catName) {
            if (catName === DEFAULT_CAT) return false;
            
            const data = this.load();
            const idx = data.categories.indexOf(catName);
            
            if (idx !== -1) {
                data.categories.splice(idx, 1);
                data.prompts.forEach(p => {
                    if (p.category === catName) {
                        p.category = DEFAULT_CAT;
                        p.updatedAt = Date.now();
                    }
                });
                this.save(data);
                return true;
            }
            return false;
        },
        
        importPrompts(promptsArray, fallbackCategory = "") {
            const data = this.load();
            let newCategoryAdded = false;
            
            promptsArray.forEach(prompt => {
                // 确保category、title、content正确对应
                const category = (prompt.category && prompt.category.trim()) 
                    ? prompt.category.trim() 
                    : (fallbackCategory || DEFAULT_CAT);
                
                const title = prompt.title && prompt.title.trim() 
                    ? prompt.title.trim() 
                    : '未命名';
                    
                const content = prompt.content || '';
                
                if (category && !data.categories.includes(category)) {
                    data.categories.push(category);
                    newCategoryAdded = true;
                }
                
                data.prompts.unshift({
                    id: `imp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    title: title,
                    content: content,
                    category: category,
                    isCustom: true,
                    createdAt: Date.now(),
                    importedAt: Date.now()
                });
            });
            
            this.save(data);
            
            return {
                success: true,
                count: promptsArray.length,
                newCategoryAdded,
                categoryUsed: fallbackCategory || DEFAULT_CAT
            };
        }
    };

    // ==========================================
    // 3. UI 样式 (优化版)
    // ==========================================
    const styles = `
        :root {
            --v12-primary: #4d6bfe;
            --v12-bg: rgba(255, 255, 255, 0.98);
            --v12-bg-s: #ffffff;
            --v12-text: #1f2937;
            --v12-border: rgba(0, 0, 0, 0.08);
            --v12-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.25);
            --v12-danger: #ef4444;
            --v12-success: #10b981;
            --v12-animation-speed: 0.2s;
        }
        .dark :root {
            --v12-bg: rgba(30, 41, 59, 0.98);
            --v12-bg-s: #1e293b;
            --v12-text: #f3f4f6;
            --v12-border: rgba(255, 255, 255, 0.1);
            --v12-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.6);
        }

        #v12-wrapper * { 
            box-sizing: border-box; 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif; 
        }

        /* 工具栏按钮 - 增强版 */
        #v12-toolbar-btn {
            display: inline-flex !important;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            width: 36px;
            height: 36px;
            border-radius: 8px;
            color: #666;
            transition: all var(--v12-animation-speed) ease;
            background: transparent;
            border: none;
            padding: 0;
            margin: 0 4px;
            flex-shrink: 0;
            position: relative;
            z-index: 9999;
        }
        #v12-toolbar-btn:hover {
            background-color: rgba(0, 0, 0, 0.05);
            color: var(--v12-primary);
            transform: translateY(-1px);
        }
        .dark #v12-toolbar-btn:hover {
            background-color: rgba(255, 255, 255, 0.1);
            color: var(--v12-primary);
        }
        
        /* 浮动按钮 - 备用方案 */
        #v12-float-btn {
            position: fixed;
            bottom: 100px;
            right: 30px;
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: var(--v12-primary);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 4px 20px rgba(77, 107, 254, 0.4);
            z-index: 99999;
            transition: all 0.3s ease;
            border: none;
            font-size: 24px;
        }
        #v12-float-btn:hover {
            transform: scale(1.1) translateY(-5px);
            box-shadow: 0 8px 30px rgba(77, 107, 254, 0.6);
        }

        /* 遮罩层 */
        .v12-overlay {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(5px);
            z-index: 10000;
        }
        .v12-overlay.v12-clickable {
            cursor: pointer;
        }

        /* 主面板 */
        #v12-panel {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 1020px;
            height: 780px;
            max-width: 90vw;
            max-height: 90vh;
            background: var(--v12-bg);
            border-radius: 24px;
            border: 1px solid var(--v12-border);
            box-shadow: var(--v12-shadow);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            color: var(--v12-text);
            animation: v12-pop 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            cursor: default;
            will-change: transform;
        }
        @keyframes v12-pop {
            from { opacity:0; transform: translate(-50%, -48%) scale(0.95); }
            to { opacity:1; transform: translate(-50%, -50%) scale(1); }
        }

        .v12-header {
            padding: 20px 28px;
            border-bottom: 1px solid var(--v12-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        }
        .v12-title {
            font-weight: 800;
            font-size: 22px;
        }
        .v12-btn {
            padding: 8px 16px;
            border-radius: 12px;
            border: 1px solid var(--v12-border);
            background: transparent;
            color: var(--v12-text);
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: all var(--v12-animation-speed) ease;
            user-select: none;
        }
        .v12-btn:hover {
            background: var(--v12-primary);
            color: #fff;
            border-color: var(--v12-primary);
            transform: translateY(-1px);
        }
        .v12-btn-danger {
            color: var(--v12-danger);
            border-color: rgba(239,68,68,0.2);
        }
        .v12-btn-danger:hover {
            background: var(--v12-danger);
            color: #fff;
            border-color: var(--v12-danger);
        }

        .v12-body {
            flex: 1;
            display: flex;
            overflow: hidden;
        }
        .v12-sidebar {
            width: 260px;
            min-width: 260px;
            border-right: 1px solid var(--v12-border);
            padding: 16px 14px;
            overflow-y: auto;
            background: rgba(127,127,127,0.02);
        }
        .v12-content {
            flex: 1;
            padding: 28px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
        }

        .v12-cat-group {
            font-size: 11px;
            color: var(--v12-text);
            opacity: 0.4;
            margin: 10px 10px 8px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 1px;
            user-select: none;
        }
        .v12-item {
            padding: 12px 14px;
            border-radius: 12px;
            cursor: pointer;
            font-size: 14px;
            margin-bottom: 4px;
            color: var(--v12-text);
            opacity: 0.85;
            transition: all var(--v12-animation-speed) ease;
            display: flex;
            justify-content: space-between;
            align-items: center;
            user-select: none;
        }
        .v12-item:hover {
            background: rgba(127,127,127,0.08);
            opacity: 1;
            transform: translateX(3px);
        }
        .v12-item.active {
            background: var(--v12-primary);
            color: #fff;
            opacity: 1;
            font-weight: 700;
            box-shadow: 0 8px 16px rgba(77,107,254,0.3);
            transform: translateX(5px);
        }

        .v12-search {
            width: 100%;
            padding: 16px;
            border-radius: 16px;
            border: 1px solid var(--v12-border);
            background: var(--v12-bg-s);
            color: var(--v12-text);
            margin-bottom: 24px;
            outline: none;
            font-size: 15px;
            transition: all var(--v12-animation-speed) ease;
        }
        .v12-search:focus {
            border-color: var(--v12-primary);
            box-shadow: 0 0 0 3px rgba(77,107,254,0.1);
        }

        .v12-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
        }

        .v12-card {
            background: var(--v12-bg-s);
            border: 1px solid var(--v12-border);
            border-radius: 18px;
            padding: 20px;
            cursor: pointer;
            position: relative;
            transition: all var(--v12-animation-speed) ease;
            display: flex;
            flex-direction: column;
        }
        .v12-card:hover {
            transform: translateY(-5px);
            border-color: var(--v12-primary);
            box-shadow: 0 15px 30px rgba(0,0,0,0.08);
        }

        .v12-card-t {
            font-weight: 700;
            margin-bottom: 10px;
            font-size: 16px;
            padding-right: 50px;
        }
        .v12-card-c {
            font-size: 13px;
            opacity: 0.7;
            line-height: 1.6;
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
        }

        .v12-card-actions {
            position: absolute;
            top: 15px;
            right: 15px;
            display: flex;
            gap: 8px;
        }

        .v12-action-btn {
            width: 28px;
            height: 28px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            transition: all var(--v12-animation-speed) ease;
            cursor: pointer;
            opacity: 0;
        }
        .v12-card:hover .v12-action-btn {
            opacity: 1;
        }
        .v12-b-edit {
            background: rgba(77,107,254,0.1);
            color: var(--v12-primary);
        }
        .v12-b-edit:hover {
            background: var(--v12-primary);
            color: #fff;
            transform: scale(1.1);
        }
        .v12-b-del {
            background: rgba(239,68,68,0.1);
            color: var(--v12-danger);
        }
        .v12-b-del:hover {
            background: var(--v12-danger);
            color: #fff;
            transform: scale(1.1);
        }

        /* 模态框等样式保持不变 */
        .v12-modal {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 550px;
            max-width: 90vw;
            background: var(--v12-bg-s);
            border-radius: 24px;
            padding: 35px;
            border: 1px solid var(--v12-border);
            box-shadow: 0 50px 100px rgba(0,0,0,0.4);
            display: flex;
            flex-direction: column;
            gap: 20px;
            z-index: 10002;
        }
        .v12-label {
            font-size: 12px;
            font-weight: 800;
            opacity: 0.5;
            margin-bottom: 5px;
            text-transform: uppercase;
        }
        .v12-input, .v12-select {
            width: 100%;
            padding: 14px;
            border-radius: 12px;
            border: 1px solid var(--v12-border);
            background: transparent;
            color: var(--v12-text);
            outline: none;
            font-size: 14px;
        }
        
        #v12-toast {
            position: fixed;
            top: 40px;
            left: 50%;
            transform: translateX(-50%);
            background: #111;
            color: #fff;
            padding: 12px 28px;
            border-radius: 40px;
            font-size: 14px;
            opacity: 0;
            transition: 0.3s;
            z-index: 20000;
            font-weight: 600;
            pointer-events: none;
        }

        .v12-export-options {
            display: flex;
            gap: 10px;
            margin-top: 15px;
            justify-content: center;
        }
        .v12-exp-opt {
            flex: 1;
            padding: 15px;
            border: 1px solid var(--v12-border);
            border-radius: 12px;
            cursor: pointer;
            text-align: center;
            transition: 0.2s;
        }
        .v12-exp-opt:hover {
            border-color: var(--v12-primary);
            background: rgba(77,107,254,0.05);
        }
        .v12-exp-opt i {
            display: block;
            font-size: 24px;
            margin-bottom: 8px;
        }

        .v12-stats {
            font-size: 12px;
            opacity: 0.5;
            margin-top: 5px;
            font-weight: normal;
        }
    `;

    // ==========================================
    // 4. 控制中心 (增强按钮注入版)
    // ==========================================
    let currentActiveCat = DEFAULT_CAT;
    let editPromptId = null;
    let searchTimeout = null;
    let debounceTimer = null;
    
    // DOM缓存
    let cachedElements = {};
    let renderQueue = null;
    
    // 按钮注入状态
    let injectionAttempts = 0;
    const MAX_INJECTION_ATTEMPTS = 50;
    let buttonObserver = null;
    let floatButtonAdded = false;

    function init() {
        Store.init();
        GM_addStyle(styles);
        createBaseDOM();
        bindGlobalEvents();
        
        // 立即尝试注入按钮
        injectToolbarButton();
        
        // 延迟再次尝试，确保页面完全加载
        setTimeout(() => {
            injectToolbarButton();
            setupButtonInjection();
        }, 2000);
        
        // 如果10秒后还没有按钮，创建浮动按钮
        setTimeout(() => {
            if (!document.getElementById('v12-toolbar-btn') && !floatButtonAdded) {
                createFloatButton();
            }
        }, 10000);
    }

    // 增强的按钮注入逻辑
    function injectToolbarButton() {
        // 如果按钮已存在，返回true
        if (document.getElementById('v12-toolbar-btn')) {
            return true;
        }
        
        console.log('尝试注入DeepSeek助手按钮...');
        
        // 深度搜索可能的工具栏位置
        const possibleSelectors = [
            // DeepSeek 常见工具栏选择器
            'div[class*="toolbar"]',
            'div[class*="Toolbar"]',
            'div[class*="input-tools"]',
            'div[class*="message-input"]',
            'div[class*="chat-input"]',
            'div[class*="input-area"]',
            'div[class*="input-container"]',
            'div[class*="input-wrapper"]',
            'div[class*="send-container"]',
            'div[class*="actions"]',
            'div[class*="Actions"]',
            'div[class*="button-group"]',
            'div[class*="tools"]',
            'div[role="toolbar"]',
            // 查找包含按钮的容器
            'div:has(button)',
            'div:has(svg)',
            'div:has([role="button"])'
        ];
        
        let bestContainer = null;
        let bestScore = 0;
        
        // 同时查找textarea附近的容器
        const textareas = document.querySelectorAll('textarea');
        for (const textarea of textareas) {
            if (textarea.offsetHeight > 0 && textarea.offsetWidth > 0) {
                // 向上查找可能的工具栏
                let parent = textarea.parentElement;
                for (let i = 0; i < 6; i++) {
                    if (!parent) break;
                    
                    // 检查父元素是否包含按钮
                    const buttons = parent.querySelectorAll('button, [role="button"], svg');
                    if (buttons.length > 0) {
                        bestContainer = parent;
                        bestScore = 10 + buttons.length;
                        break;
                    }
                    
                    // 检查兄弟元素
                    const siblings = Array.from(parent.children || []);
                    for (const sibling of siblings) {
                        if (sibling !== textarea && sibling.querySelectorAll) {
                            const siblingButtons = sibling.querySelectorAll('button, [role="button"], svg');
                            if (siblingButtons.length > 0) {
                                const score = siblingButtons.length;
                                if (score > bestScore) {
                                    bestContainer = sibling;
                                    bestScore = score;
                                }
                            }
                        }
                    }
                    
                    parent = parent.parentElement;
                }
                
                if (bestContainer) break;
            }
        }
        
        // 如果没有找到，尝试常见选择器
        if (!bestContainer) {
            for (const selector of possibleSelectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    for (const el of elements) {
                        // 检查元素是否可见且可能包含按钮
                        if (el.offsetHeight > 0 && el.offsetWidth > 0) {
                            const buttons = el.querySelectorAll('button, [role="button"], svg');
                            if (buttons.length > 0) {
                                const score = buttons.length;
                                if (score > bestScore) {
                                    bestContainer = el;
                                    bestScore = score;
                                }
                            }
                        }
                    }
                } catch (e) {
                    // 忽略无效选择器
                }
            }
        }
        
        // 如果找到容器，注入按钮
        if (bestContainer) {
            const button = document.createElement('button');
            button.id = 'v12-toolbar-btn';
            button.title = 'DeepSeek提示词助手 v' + DB_VERSION;
            button.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 6.5C12 6.5 14 4.5 17 4.5C20 4.5 22 6.5 22 9.5V18.5C22 18.5 20 16.5 17 16.5C14 16.5 12 18.5 12 18.5M12 6.5C12 6.5 10 4.5 7 4.5C4 4.5 2 6.5 2 9.5V18.5C2 18.5 4 16.5 7 16.5C10 16.5 12 18.5 12 18.5M12 6.5V18.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>`;
            
            button.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                document.getElementById('v12-main-overlay').style.display = 'block';
                renderAll();
            };
            
            // 尝试插入到合适的位置
            try {
                // 插入到容器的第一个位置
                bestContainer.insertBefore(button, bestContainer.firstChild);
                console.log('✅ DeepSeek助手按钮注入成功');
                
                // 隐藏浮动按钮（如果存在）
                const floatBtn = document.getElementById('v12-float-btn');
                if (floatBtn) {
                    floatBtn.style.display = 'none';
                }
                
                return true;
            } catch (error) {
                console.error('按钮插入失败:', error);
            }
        }
        
        return false;
    }

    // 创建浮动按钮作为备用
    function createFloatButton() {
        if (document.getElementById('v12-float-btn') || floatButtonAdded) {
            return;
        }
        
        const floatBtn = document.createElement('button');
        floatBtn.id = 'v12-float-btn';
        floatBtn.title = 'DeepSeek提示词助手';
        floatBtn.innerHTML = '📚';
        floatBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.getElementById('v12-main-overlay').style.display = 'block';
            renderAll();
        };
        
        document.body.appendChild(floatBtn);
        floatButtonAdded = true;
        console.log('✅ 浮动按钮创建成功（工具栏按钮注入失败）');
    }

    function setupButtonInjection() {
        // 清除之前的观察者
        if (buttonObserver) {
            buttonObserver.disconnect();
        }
        
        // 设置MutationObserver监听DOM变化
        buttonObserver = new MutationObserver((mutations) => {
            // 只在按钮不存在时尝试重新注入
            if (!document.getElementById('v12-toolbar-btn') && injectionAttempts < MAX_INJECTION_ATTEMPTS) {
                injectionAttempts++;
                if (injectToolbarButton()) {
                    injectionAttempts = 0; // 重置计数
                }
            }
        });
        
        // 监听整个文档的变化
        buttonObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // 定期检查按钮是否存在
        const checkInterval = setInterval(() => {
            if (!document.getElementById('v12-toolbar-btn')) {
                if (injectionAttempts < MAX_INJECTION_ATTEMPTS) {
                    injectionAttempts++;
                    injectToolbarButton();
                } else {
                    clearInterval(checkInterval);
                    // 如果多次尝试失败，创建浮动按钮
                    if (!floatButtonAdded) {
                        createFloatButton();
                    }
                }
            }
        }, 3000);
        
        // 监听页面可见性变化，当页面重新激活时检查按钮
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && !document.getElementById('v12-toolbar-btn')) {
                injectToolbarButton();
            }
        });
    }

    function getElement(id) {
        if (!cachedElements[id]) {
            cachedElements[id] = document.getElementById(id);
        }
        return cachedElements[id];
    }

    // 优化的DOM操作函数
    function createBaseDOM() {
        const wrap = document.createElement('div');
        wrap.id = 'v12-wrapper';
        document.body.appendChild(wrap);

        wrap.innerHTML = `
            <!-- 主面板 -->
            <div id="v12-main-overlay" class="v12-overlay v12-clickable">
                <div id="v12-panel">
                    <div class="v12-header">
                        <div class="v12-title">DeepSeek 助手 Pro <span style="font-size:12px; opacity:0.4; font-weight:400;">v${DB_VERSION}</span></div>
                        <div style="display:flex; gap:12px; flex-wrap:wrap;">
                            <button class="v12-btn" id="v12-add">➕ 新增提示词</button>
                            <button class="v12-btn" id="v12-imp">📥 导入库</button>
                            <button class="v12-btn" id="v12-exp">📤 导出库</button>
                            <button class="v12-btn v12-btn-danger" id="v12-reset">🔄 重置</button>
                            <div style="width:1px; background:var(--v12-border); margin:0 5px;"></div>
                            <button class="v12-btn" id="v12-close" style="font-size:20px; padding:5px 12px;">✕</button>
                        </div>
                    </div>
                    <div class="v12-body">
                        <div class="v12-sidebar" id="v12-sb"></div>
                        <div class="v12-content">
                            <input type="text" class="v12-search" id="v12-srch" placeholder="🔍 搜索提示词 (标题/内容)">
                            <div class="v12-grid" id="v12-grid"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 导出选项 -->
            <div id="v12-exp-overlay" class="v12-overlay" style="z-index:10003">
                <div class="v12-modal" style="width:450px;">
                    <h3 style="margin:0; text-align:center;">选择导出格式</h3>
                    <div class="v12-export-options">
                        <div class="v12-exp-opt" id="v12-exp-json"><i>📄</i>JSON<br><span style="font-size:10px; opacity:0.5">完整备份</span></div>
                        <div class="v12-exp-opt" id="v12-exp-csv"><i>📊</i>CSV<br><span style="font-size:10px; opacity:0.5">Excel可用</span></div>
                        <div class="v12-exp-opt" id="v12-exp-txt"><i>📝</i>TXT<br><span style="font-size:10px; opacity:0.5">层级分明</span></div>
                    </div>
                    <button class="v12-btn" id="v12-exp-cancel" style="margin-top:10px; justify-content:center;">取消</button>
                </div>
            </div>

            <!-- 编辑表单 -->
            <div id="v12-form-overlay" class="v12-overlay" style="z-index:10001">
                <div class="v12-modal">
                    <h3 id="v12-form-t" style="margin:0; font-size:24px;">管理提示词</h3>
                    <div>
                        <div class="v12-label">分类</div>
                        <select class="v12-select" id="v12-cat-sel"></select>
                        <input type="text" class="v12-input" id="v12-cat-new" placeholder="创建新分类名称..." style="display:none; margin-top:10px;">
                    </div>
                    <div>
                        <div class="v12-label">标题</div>
                        <input type="text" class="v12-input" id="v12-title-in" placeholder="起个名字">
                    </div>
                    <div>
                        <div class="v12-label">内容</div>
                        <textarea class="v12-input" id="v12-cont-in" style="height:180px; resize:vertical" placeholder="输入 Prompt..."></textarea>
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:10px;">
                        <button class="v12-btn" id="v12-f-cancel">取消</button>
                        <button class="v12-btn" id="v12-f-save" style="background:var(--v12-primary); color:#fff; border:none;">保存更改</button>
                    </div>
                </div>
            </div>

            <!-- 重命名分类 -->
            <div id="v12-ren-overlay" class="v12-overlay" style="z-index:10002">
                <div class="v12-modal" style="width:420px; padding:30px;">
                    <h3 style="margin:0;">重命名分类</h3>
                    <input type="text" class="v12-input" id="v12-ren-val">
                    <div style="display:flex; justify-content:flex-end; gap:12px;">
                        <button class="v12-btn" id="v12-ren-cancel">取消</button>
                        <button class="v12-btn" id="v12-ren-save" style="background:var(--v12-primary); color:#fff; border:none;">确认修改</button>
                    </div>
                </div>
            </div>

            <!-- 导入确认 -->
            <div id="v12-imp-confirm-overlay" class="v12-overlay" style="z-index:10004; display:none;">
                <div class="v12-modal" style="width:500px;">
                    <h3 id="v12-imp-title" style="margin:0; margin-bottom:10px;">导入确认</h3>
                    <div id="v12-imp-details" style="font-size:14px; line-height:1.6;">
                        <!-- 动态内容 -->
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:20px;">
                        <button class="v12-btn" id="v12-imp-cancel">取消</button>
                        <button class="v12-btn" id="v12-imp-confirm" style="background:var(--v12-success); color:#fff; border:none;">确认导入</button>
                    </div>
                </div>
            </div>

            <!-- 提示消息 -->
            <div id="v12-toast"></div>
            
            <!-- 隐藏的文件上传 -->
            <input type="file" id="v12-file-up" accept=".json,.csv,.txt" style="display:none">
        `;
        
        // 初始化缓存
        cachedElements = {
            'v12-sb': wrap.querySelector('#v12-sb'),
            'v12-grid': wrap.querySelector('#v12-grid'),
            'v12-srch': wrap.querySelector('#v12-srch')
        };
    }

    // 优化版的CSV解析
    function parseCSV(text) {
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        if (lines.length < 2) return [];
        
        // 更智能的表头检测
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        
        // 识别列索引
        const findHeaderIndex = (possibleNames) => {
            for (const name of possibleNames) {
                const idx = headers.findIndex(h => 
                    h.toLowerCase() === name.toLowerCase()
                );
                if (idx !== -1) return idx;
            }
            return -1;
        };
        
        const catIdx = findHeaderIndex(['分类', 'category', '分类名称']);
        const titleIdx = findHeaderIndex(['标题', 'title', '名称', 'prompt标题']);
        const contentIdx = findHeaderIndex(['内容', 'content', 'prompt', '正文', '提示词']);
        
        // 默认列顺序：分类, 标题, 内容
        const useCatIdx = catIdx !== -1 ? catIdx : 0;
        const useTitleIdx = titleIdx !== -1 ? titleIdx : 1;
        const useContentIdx = contentIdx !== -1 ? contentIdx : 2;
        
        const result = [];
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // 更健壮的CSV解析
            const cells = [];
            let inQuotes = false;
            let cell = '';
            
            for (let char of line) {
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    cells.push(cell);
                    cell = '';
                } else {
                    cell += char;
                }
            }
            cells.push(cell);
            
            // 清理单元格
            const cleanCells = cells.map(c => {
                let clean = c.trim();
                if (clean.startsWith('"') && clean.endsWith('"')) {
                    clean = clean.slice(1, -1);
                }
                // 处理转义字符
                clean = clean.replace(/\\n/g, '\n')
                            .replace(/\\t/g, '\t')
                            .replace(/\\r/g, '\r')
                            .replace(/\\\\/g, '\\');
                return clean;
            });
            
            // 确保我们有足够的数据列
            if (cleanCells.length <= Math.max(useCatIdx, useTitleIdx, useContentIdx)) {
                // 如果列数不足，尝试其他逻辑
                if (cleanCells.length >= 2) {
                    result.push({
                        category: cleanCells[0] || '',
                        title: cleanCells[1] || '未命名',
                        content: cleanCells[2] || cleanCells[1] || ''
                    });
                }
                continue;
            }
            
            result.push({
                category: cleanCells[useCatIdx] || '',
                title: cleanCells[useTitleIdx] || '未命名',
                content: cleanCells[useContentIdx] || ''
            });
        }
        
        return result;
    }

    // 优化版的TXT解析
    function parseTXT(text) {
        const lines = text.split(/\r?\n/);
        const result = [];
        
        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return;
            
            // 尝试多种分隔符
            const separators = ['\t', '|', ',', ';'];
            let parts = null;
            let usedSeparator = null;
            
            for (let sep of separators) {
                if (trimmed.includes(sep)) {
                    const split = trimmed.split(sep).map(p => p.trim());
                    if (split.length >= 2) {
                        parts = split;
                        usedSeparator = sep;
                        break;
                    }
                }
            }
            
            if (!parts) {
                // 如果没有分隔符，跳过
                return;
            }
            
            // 根据列数决定映射
            let category = '', title = '', content = '';
            
            if (parts.length === 2) {
                // 假设格式：标题|内容 或 分类|标题
                if (parts[1].length > 100 || parts[1].includes('\\n')) {
                    // 第二列很长或包含换行，很可能是内容
                    title = parts[0];
                    content = parts[1];
                } else {
                    category = parts[0];
                    title = parts[1];
                }
            } else if (parts.length >= 3) {
                // 三列或更多：分类|标题|内容
                category = parts[0];
                title = parts[1];
                content = parts.slice(2).join(usedSeparator);
            }
            
            // 处理转义字符
            content = content.replace(/\\n/g, '\n')
                           .replace(/\\t/g, '\t')
                           .replace(/\\r/g, '\r')
                           .replace(/\\\\/g, '\\');
            
            result.push({
                category: category,
                title: title || '未命名',
                content: content
            });
        });
        
        return result;
    }

    function downloadFile(content, filename, type = 'text/plain') {
        const blob = new Blob([content], { type: type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // 使用DocumentFragment优化渲染
    function renderAll() {
        if (renderQueue) {
            cancelAnimationFrame(renderQueue);
        }
        
        renderQueue = requestAnimationFrame(() => {
            const data = Store.load();
            const sb = cachedElements['v12-sb'];
            const grid = cachedElements['v12-grid'];
            const srchVal = cachedElements['v12-srch'].value.toLowerCase().trim();
            
            // 更新侧边栏
            const sbFragment = document.createDocumentFragment();
            sbFragment.innerHTML = `<div class="v12-cat-group">🗂️ 所有分类</div>`;
            
            data.categories.forEach(cat => {
                const count = data.prompts.filter(p => p.category === cat).length;
                const item = document.createElement('div');
                item.className = `v12-item ${cat === currentActiveCat ? 'active' : ''}`;
                item.innerHTML = `<span>${cat} <span style="font-size:11px; opacity:0.5;">(${count})</span></span>`;
                
                item.onclick = () => {
                    currentActiveCat = cat;
                    renderAll();
                };
                sbFragment.appendChild(item);
            });
            
            sb.innerHTML = '';
            sb.appendChild(sbFragment);
            
            // 渲染主内容区
            let list = data.prompts.filter(p => p.category === currentActiveCat);
            
            // 搜索功能
            if (srchVal) {
                list = data.prompts.filter(p => 
                    (p.title && p.title.toLowerCase().includes(srchVal)) || 
                    (p.content && p.content.toLowerCase().includes(srchVal))
                );
            }
            
            const gridFragment = document.createDocumentFragment();
            
            if (!list.length) {
                grid.innerHTML = `
                    <div style="grid-column:1/-1; text-align:center; padding:60px; opacity:0.5;">
                        <div style="font-size:48px; margin-bottom:20px;">📝</div>
                        <div style="font-size:16px; margin-bottom:10px;">${srchVal ? '没有找到匹配的提示词' : '此分类下还没有提示词'}</div>
                        ${!srchVal ? '<button class="v12-btn" onclick="document.getElementById(\'v12-add\').click()" style="margin-top:20px;">➕ 添加第一条提示词</button>' : ''}
                    </div>`;
            } else {
                // 使用DocumentFragment批量添加
                list.forEach(p => {
                    const card = document.createElement('div');
                    card.className = 'v12-card';
                    
                    const previewContent = p.content && p.content.length > 150 
                        ? p.content.substring(0, 150) + '...' 
                        : p.content || '';
                    
                    card.innerHTML = `
                        <div class="v12-card-t">${p.title || '未命名'}</div>
                        <div class="v12-card-c">${previewContent}</div>
                        <div class="v12-card-actions">
                            <div class="v12-action-btn v12-b-edit" title="修改内容">✎</div>
                            <div class="v12-action-btn v12-b-del" title="彻底删除">🗑</div>
                        </div>
                        <div style="font-size:11px; opacity:0.4; margin-top:10px; display:flex; justify-content:space-between;">
                            <span>${p.category || DEFAULT_CAT}</span>
                            <span>${p.updatedAt ? '已修改' : '已添加'}</span>
                        </div>`;
                    
                    card.onclick = () => {
                        insertToChat(p.content);
                        getElement('v12-main-overlay').style.display = 'none';
                    };
                    
                    const editBtn = card.querySelector('.v12-b-edit');
                    const delBtn = card.querySelector('.v12-b-del');
                    
                    editBtn.onclick = (e) => {
                        e.stopPropagation();
                        openForm(p);
                    };
                    
                    delBtn.onclick = (e) => {
                        e.stopPropagation();
                        deletePrompt(p.id);
                    };
                    
                    gridFragment.appendChild(card);
                });
                
                grid.innerHTML = '';
                grid.appendChild(gridFragment);
            }
            
            renderQueue = null;
        });
    }

    // 修复的插入函数 - 参考脚本2的实现方式
    function insertToChat(text) {
        // 参考脚本2：直接查找textarea
        const area = document.querySelector('textarea');
        if (!area) {
            showToast('未找到对话框');
            return;
        }
        
        // 使用脚本2的方式设置值，确保触发所有事件
        const currentValue = area.value || '';
        const newValue = currentValue.trim() ? currentValue + "\n\n" + text : text;
        
        // 使用Object.getOwnPropertyDescriptor来设置值，确保触发事件
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        setter.call(area, newValue);
        
        // 触发输入事件
        area.dispatchEvent(new Event('input', { bubbles: true }));
        area.dispatchEvent(new Event('change', { bubbles: true }));
        
        // 聚焦并调整高度
        area.focus();
        area.style.height = 'auto';
        area.style.height = Math.min(area.scrollHeight, 300) + 'px';
        
        // 设置光标位置到末尾
        area.setSelectionRange(newValue.length, newValue.length);
        
        showToast('提示词已插入到对话框');
    }

    function openForm(p = null) {
        const overlay = getElement('v12-form-overlay');
        const sel = getElement('v12-cat-sel');
        const data = Store.load();
        
        editPromptId = p ? p.id : null;
        getElement('v12-form-t').textContent = p ? "修改提示词" : "新增提示词";
        getElement('v12-title-in').value = p ? p.title : "";
        getElement('v12-cont-in').value = p ? p.content : "";
        
        sel.innerHTML = '';
        data.categories.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            sel.appendChild(opt);
        });
        
        const newOpt = document.createElement('option');
        newOpt.value = "__NEW__";
        newOpt.textContent = "➕ 创建新分类...";
        sel.appendChild(newOpt);
        
        sel.value = p ? p.category : currentActiveCat;
        getElement('v12-cat-new').style.display = 'none';
        getElement('v12-cat-new').value = "";
        
        overlay.style.display = 'block';
    }

    let renTarget = null;
    function openRename(cat) {
        renTarget = cat;
        getElement('v12-ren-val').value = cat;
        getElement('v12-ren-overlay').style.display = 'block';
        setTimeout(() => getElement('v12-ren-val').focus(), 100);
    }

    function deleteCat(cat) {
        if (confirm(`确定要删除分类【${cat}】吗？\n该分类下的提示词将移动到"${DEFAULT_CAT}"。`)) {
            Store.deleteCategory(cat);
            if (currentActiveCat === cat) currentActiveCat = DEFAULT_CAT;
            renderAll();
            showToast('分类已删除');
        }
    }

    function deletePrompt(id) {
        if (confirm('确定要彻底删除这条提示词吗？此操作不可撤销。')) {
            Store.deletePrompt(id);
            renderAll();
            showToast('提示词已删除');
        }
    }

    function bindGlobalEvents() {
        // 主面板关闭
        const mainOverlay = getElement('v12-main-overlay');
        const mainPanel = getElement('v12-panel');
        
        mainOverlay.addEventListener('click', function(e) {
            if (e.target === this) {
                this.style.display = 'none';
            }
        });
        
        getElement('v12-close').onclick = () => {
            mainOverlay.style.display = 'none';
        };
        
        // ESC键关闭所有弹窗
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const overlays = document.querySelectorAll('.v12-overlay');
                overlays.forEach(overlay => {
                    overlay.style.display = 'none';
                });
            }
        });
        
        // 新增提示词
        getElement('v12-add').onclick = () => openForm();
        
        // 重置功能
        getElement('v12-reset').onclick = () => {
            if (confirm('⚠️ 警告：出厂重置将擦除您所有的修改，恢复到最原始的行业模板。\n\n确定继续吗？')) {
                Store.resetFactory();
                currentActiveCat = DEFAULT_CAT;
                renderAll();
                showToast('已恢复出厂设置');
            }
        };
        
        // 导出功能
        const expOverlay = getElement('v12-exp-overlay');
        getElement('v12-exp').onclick = () => expOverlay.style.display = 'block';
        getElement('v12-exp-cancel').onclick = () => expOverlay.style.display = 'none';
        
        // JSON导出
        getElement('v12-exp-json').onclick = () => {
            const data = Store.load(true); // 强制刷新
            const exportData = {
                version: DB_VERSION,
                exportDate: new Date().toISOString(),
                totalPrompts: data.prompts.length,
                totalCategories: data.categories.length,
                ...data
            };
            
            downloadFile(
                JSON.stringify(exportData, null, 2), 
                `DeepSeek_Prompts_${new Date().toISOString().split('T')[0]}.json`, 
                'application/json'
            );
            expOverlay.style.display = 'none';
            showToast('JSON 导出成功');
        };
        
        // CSV导出
        getElement('v12-exp-csv').onclick = () => {
            const data = Store.load(true);
            
            let csv = '\ufeff';
            csv += "分类,标题,内容\n";
            
            data.prompts.forEach(p => {
                const escapeCSV = (str) => {
                    if (typeof str !== 'string') return '';
                    if (str.includes(',') || str.includes('\n') || str.includes('"') || str.includes('\r')) {
                        return '"' + str.replace(/"/g, '""') + '"';
                    }
                    return str;
                };
                
                const category = escapeCSV(p.category || '');
                const title = escapeCSV(p.title || '未命名');
                const content = escapeCSV(p.content || '');
                
                csv += `${category},${title},${content}\n`;
            });
            
            downloadFile(
                csv,
                `DeepSeek_Prompts_${new Date().toISOString().split('T')[0]}.csv`,
                'text/csv;charset=utf-8'
            );
            expOverlay.style.display = 'none';
            showToast('CSV 导出成功');
        };
        
        // TXT导出
        getElement('v12-exp-txt').onclick = () => {
            const data = Store.load(true);
            
            let txt = `# DeepSeek 提示词库\n`;
            txt += `# 导出时间：${new Date().toLocaleString('zh-CN')}\n`;
            txt += `# 版本：${DB_VERSION}\n`;
            txt += `# 总计：${data.prompts.length} 条提示词，${data.categories.length} 个分类\n`;
            txt += `# 格式：分类 | 标题 | 内容\n`;
            txt += `# ==========================================\n\n`;
            
            // 按分类分组
            const grouped = {};
            data.categories.forEach(cat => {
                grouped[cat] = data.prompts.filter(p => p.category === cat);
            });
            
            // 按分类输出
            for (const [category, prompts] of Object.entries(grouped)) {
                if (prompts.length === 0) continue;
                
                txt += `\n## ${category} (${prompts.length}条)\n`;
                txt += `---\n\n`;
                
                prompts.forEach((p, i) => {
                    txt += `${i + 1}. ${p.title}\n`;
                    txt += `   分类：${p.category}\n`;
                    
                    const lines = p.content.split('\n');
                    if (lines.length === 1) {
                        txt += `   内容：${p.content}\n`;
                    } else {
                        txt += `   内容：\n`;
                        lines.forEach(line => {
                            txt += `      ${line}\n`;
                        });
                    }
                    
                    txt += `\n`;
                });
                
                txt += `\n`;
            }
            
            downloadFile(
                txt,
                `DeepSeek_Prompts_${new Date().toISOString().split('T')[0]}.txt`,
                'text/plain;charset=utf-8'
            );
            expOverlay.style.display = 'none';
            showToast('TXT 导出成功');
        };
        
        // 导入功能
        const fUp = getElement('v12-file-up');
        let pendingImport = null;
        
        getElement('v12-imp').onclick = () => fUp.click();
        
        fUp.onchange = (e) => {
            const f = e.target.files[0];
            if (!f) return;
            
            if (f.size > 10 * 1024 * 1024) {
                alert('文件太大，请选择小于10MB的文件');
                fUp.value = '';
                return;
            }
            
            const reader = new FileReader();
            const ext = f.name.split('.').pop().toLowerCase();
            const fileNameAsCat = f.name.replace(/\.[^/.]+$/, "");
            
            reader.onload = (evt) => {
                try {
                    const content = evt.target.result;
                    let importedPrompts = [];
                    let importType = '';
                    
                    if (ext === 'json') {
                        const json = JSON.parse(content);
                        if (json.prompts && Array.isArray(json.prompts)) {
                            if (confirm('检测到完整数据库备份，是否恢复整个数据库？\n注意：这将覆盖当前所有数据。')) {
                                Store.save(json);
                                renderAll();
                                showToast('数据库已完整恢复');
                                fUp.value = '';
                                return;
                            } else {
                                importedPrompts = json.prompts.map(p => ({
                                    category: p.category || '',
                                    title: p.title || '',
                                    content: p.content || ''
                                }));
                            }
                        } else if (Array.isArray(json)) {
                            importedPrompts = json.map(p => ({
                                category: p.category || '',
                                title: p.title || '',
                                content: p.content || ''
                            }));
                        }
                        importType = 'JSON';
                    } else if (ext === 'csv') {
                        importedPrompts = parseCSV(content);
                        importType = 'CSV';
                    } else if (ext === 'txt') {
                        importedPrompts = parseTXT(content);
                        importType = 'TXT';
                    }
                    
                    if (importedPrompts.length === 0) {
                        throw new Error('未找到有效的提示词数据');
                    }
                    
                    // 分析导入数据
                    const categories = new Set();
                    let hasCategoryCount = 0;
                    
                    importedPrompts.forEach(p => {
                        if (p.category && p.category.trim()) {
                            categories.add(p.category.trim());
                            hasCategoryCount++;
                        }
                    });
                    
                    // 确定目标分类
                    let targetCategory = '';
                    if (categories.size === 1) {
                        targetCategory = Array.from(categories)[0];
                    } else if (categories.size > 1) {
                        targetCategory = '多种分类';
                    } else {
                        targetCategory = fileNameAsCat || '导入数据';
                    }
                    
                    pendingImport = {
                        prompts: importedPrompts,
                        targetCategory: targetCategory,
                        importType: importType,
                        fileName: f.name,
                        hasCategoryCount: hasCategoryCount,
                        categoryCount: categories.size
                    };
                    
                    showImportConfirm(pendingImport);
                    
                } catch(e) {
                    console.error('导入失败:', e);
                    alert(`导入失败：文件格式不匹配或内容错误\n\n错误信息：${e.message}`);
                    fUp.value = '';
                }
            };
            
            reader.readAsText(f, 'UTF-8');
        };
        
        // 导入确认对话框
        function showImportConfirm(importData) {
            const overlay = getElement('v12-imp-confirm-overlay');
            const title = getElement('v12-imp-title');
            const details = getElement('v12-imp-details');
            
            title.textContent = `确认导入 ${importData.prompts.length} 条提示词`;
            
            let detailsHTML = `
                <p><strong>文件：</strong>${importData.fileName}</p>
                <p><strong>格式：</strong>${importData.importType}</p>
                <p><strong>提示词数量：</strong>${importData.prompts.length} 条</p>
            `;
            
            if (importData.categoryCount > 0) {
                detailsHTML += `<p><strong>分类情况：</strong>${importData.hasCategoryCount} 条有分类，${importData.prompts.length - importData.hasCategoryCount} 条无分类</p>`;
                detailsHTML += `<p><strong>分类策略：</strong>将严格按原分类归类</p>`;
            } else {
                detailsHTML += `<p><strong>分类策略：</strong>所有提示词将归入新分类 "<strong>${importData.targetCategory}</strong>"</p>`;
            }
            
            detailsHTML += `<p style="margin-top:20px; color:var(--v12-primary); font-weight:600;">确认导入吗？</p>`;
            
            details.innerHTML = detailsHTML;
            overlay.style.display = 'block';
        }
        
        // 导入确认按钮
        getElement('v12-imp-confirm').onclick = () => {
            if (!pendingImport) return;
            
            try {
                const result = Store.importPrompts(
                    pendingImport.prompts,
                    pendingImport.categoryCount === 0 ? pendingImport.targetCategory : ''
                );
                
                if (result.newCategoryAdded && pendingImport.categoryCount === 0) {
                    currentActiveCat = pendingImport.targetCategory;
                } else if (pendingImport.categoryCount > 0) {
                    const firstWithCategory = pendingImport.prompts.find(p => p.category);
                    if (firstWithCategory) {
                        currentActiveCat = firstWithCategory.category;
                    }
                }
                
                renderAll();
                showToast(`成功导入 ${result.count} 条提示词`);
                
                getElement('v12-imp-confirm-overlay').style.display = 'none';
                getElement('v12-file-up').value = '';
                pendingImport = null;
            } catch(e) {
                alert(`导入过程中发生错误：${e.message}`);
            }
        };
        
        // 导入取消按钮
        getElement('v12-imp-cancel').onclick = () => {
            getElement('v12-imp-confirm-overlay').style.display = 'none';
            getElement('v12-file-up').value = '';
            pendingImport = null;
        };
        
        // 表单保存
        getElement('v12-f-save').onclick = () => {
            const sVal = getElement('v12-cat-sel').value;
            let cat = sVal === "__NEW__" ? getElement('v12-cat-new').value.trim() : sVal;
            const t = getElement('v12-title-in').value.trim();
            const c = getElement('v12-cont-in').value.trim();
            
            if (!cat) return alert('请选择或输入分类名称');
            if (!t) return alert('请输入提示词标题');
            if (!c) return alert('请输入提示词内容');
            
            Store.upsertPrompt({ id: editPromptId, title: t, content: c, category: cat });
            getElement('v12-form-overlay').style.display = 'none';
            currentActiveCat = cat;
            renderAll();
            showToast('保存成功');
        };
        
        // 分类选择变化
        getElement('v12-cat-sel').onchange = (e) => {
            getElement('v12-cat-new').style.display = e.target.value === "__NEW__" ? "block" : "none";
            if (e.target.value === "__NEW__") {
                setTimeout(() => getElement('v12-cat-new').focus(), 100);
            }
        };
        
        // 重命名保存
        getElement('v12-ren-save').onclick = () => {
            const newVal = getElement('v12-ren-val').value.trim();
            if (newVal && newVal !== renTarget) {
                Store.renameCategory(renTarget, newVal);
                if (currentActiveCat === renTarget) currentActiveCat = newVal;
                renderAll();
                showToast('重命名成功');
            }
            getElement('v12-ren-overlay').style.display = 'none';
        };
        
        // 取消按钮
        getElement('v12-f-cancel').onclick = () => getElement('v12-form-overlay').style.display = 'none';
        getElement('v12-ren-cancel').onclick = () => getElement('v12-ren-overlay').style.display = 'none';
        
        // 搜索优化：使用requestAnimationFrame防抖
        const searchInput = getElement('v12-srch');
        searchInput.addEventListener('input', () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                requestAnimationFrame(renderAll);
            }, 300);
        });
    }

    function showToast(msg) {
        const t = getElement('v12-toast');
        t.textContent = msg;
        t.style.opacity = 1;
        t.style.transform = 'translateX(-50%) translateY(0)';
        
        setTimeout(() => {
            t.style.opacity = 0;
            t.style.transform = 'translateX(-50%) translateY(-10px)';
        }, 2000);
    }

    // 初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 1000); // 延迟1秒初始化
    }
})();