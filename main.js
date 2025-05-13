// ==UserScript==
// @name         BUPT_自定义待办过滤助手_北京邮电大学云邮教学空间
// @namespace    https://ucloud.bupt.edu.cn/
// @version      2.5.2
// @description  允许用户自定义需要隐藏的待办项。
// @match        https://ucloud.bupt.edu.cn/uclass/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==
(function() {
    'use strict';
    // --- 全局变量 ---
    let hiddenItems = new Set(JSON.parse(localStorage.getItem('hiddenTitles_v2') || '[]'));
    let isProcessing = false;
    let isPanelVisible = false;
    let intervalId = null;
    let lastDisplayedCount = 0; // 上次显示的任务数

    // --- 创建控制面板 ---
    function createControlPanel() {
        // 1. 创建样式
        const style = document.createElement('style');
        style.textContent = `
            .filter-panel {
                position: fixed; top: 20px; right: 20px; background: white; padding: 15px;
                border: none; border-radius: 8px; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                transition: transform 0.3s ease;
                transform: translateX(0);
                min-width: 250px;
                max-height: 80vh;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
            }
            .filter-panel.hidden {
                transform: translateX(calc(100% + 40px));
            }
            .filter-toggle-btn {
                position: fixed; top: 20px; right: 20px; padding: 8px 16px; background: #4CAF50;
                color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: all 0.2s ease; z-index: 10000;
            }
            .filter-toggle-btn:hover { background: #45a049; box-shadow: 0 4px 8px rgba(0,0,0,0.15); }
            .filter-input {
                width: 100%; padding: 8px 12px;
                border: 1px solid #ddd; border-radius: 4px; margin-bottom: 10px; font-size: 14px;
                box-sizing: border-box;
            }
            .filter-input:focus { border-color: #4CAF50; outline: none; box-shadow: 0 0 0 2px rgba(76,175,80,0.2); }
            .filter-add-btn {
                background: #4CAF50; color: white; border: none; padding: 8px 16px; border-radius: 4px;
                cursor: pointer; font-weight: 500; transition: all 0.2s ease; display: block;
                width: 100%; margin-bottom: 15px;
            }
            .filter-add-btn:hover { background: #45a049; }
            .filter-item {
                display: flex; align-items: center; justify-content: space-between; padding: 8px;
                background: #f5f5f5; border-radius: 4px; margin-top: 8px;
            }
            .filter-item-text {
                margin-right: 10px; font-size: 14px; color: #333; word-break: break-all;
                flex-grow: 1;
            }
            .filter-delete-btn {
                background: #ff4444; color: white; border: none; padding: 4px 8px; border-radius: 3px;
                cursor: pointer; font-size: 12px; transition: all 0.2s ease; flex-shrink: 0;
            }
            .filter-delete-btn:hover { background: #cc0000; }
            .filter-list-title {
                font-size: 14px; font-weight: 600; color: #333; margin-bottom: 10px; padding-bottom: 5px;
                border-bottom: 2px solid #4CAF50; text-align: center;
            }
            #hiddenItemsList {
                max-height: 300px;
                overflow-y: auto;
                flex-grow: 1;
                margin-top: 10px;
            }
        `;
        document.head.appendChild(style);

        // 2. 创建切换按钮
        const toggleButton = document.createElement('button');
        toggleButton.className = 'filter-toggle-btn';
        toggleButton.textContent = '过滤设置';
        toggleButton.onclick = togglePanel;
        document.body.appendChild(toggleButton);

        // 3. 创建主面板
        const panel = document.createElement('div');
        panel.id = 'filterControlPanel';
        panel.className = 'filter-panel' + (isPanelVisible ? '' : ' hidden');

        // 4. 创建输入框
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'filter-input';
        input.placeholder = '输入要隐藏的待办项关键词';
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                addButton.click();
            }
        });
        panel.appendChild(input);

        // 5. 创建添加按钮
        const addButton = document.createElement('button');
        addButton.className = 'filter-add-btn';
        addButton.textContent = '添加过滤关键词';
        addButton.onclick = () => {
            const title = input.value.trim();
            if (title) {
                hiddenItems.add(title);
                updateHiddenItemsList();
                saveHiddenItems();
                filterItems();
                input.value = '';
                input.focus();
            }
        };
        panel.appendChild(addButton);

        // 6. 创建用于显示隐藏项列表的容器
        const listContainer = document.createElement('div');
        listContainer.id = 'hiddenItemsList';
        panel.appendChild(listContainer);

        // 7. 将面板添加到<body>
        document.body.appendChild(panel);

        // 8. 初始化列表显示
        updateHiddenItemsList();
    }

    // --- 切换面板显示/隐藏 ---
    function togglePanel() {
        const panel = document.getElementById('filterControlPanel');
        const toggleButton = document.querySelector('.filter-toggle-btn');
        if (!panel || !toggleButton) return;

        isPanelVisible = !isPanelVisible;
        panel.className = 'filter-panel' + (isPanelVisible ? '' : ' hidden');
        toggleButton.textContent = isPanelVisible ? '隐藏设置' : '过滤设置';

        if (isPanelVisible) {
            setTimeout(() => {
                if(panel && typeof panel.offsetWidth !== 'undefined') {
                    toggleButton.style.right = `${panel.offsetWidth + 30}px`;
                } else {
                    toggleButton.style.right = '280px';
                }
            }, 50);
        } else {
            toggleButton.style.right = '20px';
        }
    }

    // --- 更新面板中的隐藏项目列表显示 ---
    function updateHiddenItemsList() {
        const listContainer = document.getElementById('hiddenItemsList');
        if (!listContainer) return;

        listContainer.innerHTML = '<div class="filter-list-title">当前隐藏的关键词</div>';
        const sortedItems = Array.from(hiddenItems).sort();

        sortedItems.forEach(title => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'filter-item';

            const textSpan = document.createElement('span');
            textSpan.className = 'filter-item-text';
            textSpan.textContent = title;
            itemDiv.appendChild(textSpan);

            const deleteButton = document.createElement('button');
            deleteButton.className = 'filter-delete-btn';
            deleteButton.textContent = '删除';
            deleteButton.onclick = () => {
                hiddenItems.delete(title);
                updateHiddenItemsList();
                saveHiddenItems();
                filterItems();
            };
            itemDiv.appendChild(deleteButton);
            listContainer.appendChild(itemDiv);
        });

        if (sortedItems.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.textContent = '暂无隐藏关键词';
            emptyMsg.style.textAlign = 'center';
            emptyMsg.style.color = '#888';
            emptyMsg.style.marginTop = '10px';
            listContainer.appendChild(emptyMsg);
        }
    }

    // --- 保存隐藏项目列表到localStorage ---
    function saveHiddenItems() {
        try {
            localStorage.setItem('hiddenTitles_v2', JSON.stringify([...hiddenItems]));
        } catch (e) {
            console.error("保存隐藏项到 localStorage 时出错:", e);
        }
    }

    // --- 获取当前页面中所有任务项目 ---
    function getAllTaskItems() {
        return document.querySelectorAll('div.in-progress-item.home-inline-block');
    }

    // --- 获取当前页面显示的待办数值 ---
    function getCurrentDisplayedCount() {
        const taskValueElement = findTaskCountElement();
        if (!taskValueElement) return null;

        const countText = taskValueElement.textContent.trim();
        const count = parseInt(countText);
        return isNaN(count) ? null : count;
    }

    // --- 计算当前实际被隐藏的待办项数量 ---
    function countHiddenTasks() {
        let count = 0;
        const items = getAllTaskItems();

        // 只计算那些由于我们的关键词匹配而需要隐藏的项目
        for (const item of items) {
            if (item.style.display === 'none') continue; // 跳过已经因其他原因隐藏的项目

            const titleElement = item.querySelector('.activity-title');
            if (!titleElement) continue;

            const title = titleElement.innerText;
            if (Array.from(hiddenItems).some(hiddenTitle => title.includes(hiddenTitle))) {
                count++;
            }
        }

        console.log(`检测到 ${count} 个项目将被基于关键词隐藏`);
        return count;
    }

    // --- 更新页面上显示的待办任务数量 ---
    function updateTaskCount() {
        // 找到页面上显示待办数量的元素
        const taskValueElement = findTaskCountElement();
        if (!taskValueElement) return;

        // 获取当前页面上显示的数值
        const currentCount = getCurrentDisplayedCount();
        if (currentCount === null) return;

        // 计算应该隐藏的任务数
        const hiddenCount = countHiddenTasks();

        // 我们希望显示的是: 当前显示的数值 - 应该隐藏的数值
        const displayCount = Math.max(0, currentCount - hiddenCount);

        // 如果当前显示的数值不等于计算出的数值，更新显示
        if (taskValueElement.textContent.trim() !== displayCount.toString()) {
            console.log(`更新待办数: 从 ${currentCount} 减少到 ${displayCount} (隐藏: ${hiddenCount})`);
            taskValueElement.textContent = displayCount.toString();
            lastDisplayedCount = displayCount;
        }
    }

    // --- 查找页面上显示待办数量的元素 ---
    function findTaskCountElement() {
        const taskItems = document.querySelectorAll('.teacher-task-item');
        for (const item of taskItems) {
            const label = item.querySelector('.task-label');
            if (label && label.textContent.trim() === '待办') {
                const valueElem = item.querySelector('.task-value');
                if (valueElem) return valueElem;
            }
        }
        return null;
    }

    // --- 核心过滤函数 ---
    function filterItems() {
        if (isProcessing) return;
        isProcessing = true;

        try {
            // 先获取当前显示的数量（过滤前）
            const beforeCount = getCurrentDisplayedCount();

            // 获取所有需要过滤的项目
            const items = getAllTaskItems();
            let hiddenByUsCount = 0;

            for (const item of items) {
                const titleElement = item.querySelector('.activity-title');
                if (!titleElement) continue;

                const title = titleElement.innerText;
                const shouldHide = Array.from(hiddenItems).some(hiddenTitle => title.includes(hiddenTitle));

                // 如果该项目应该根据关键词隐藏
                if (shouldHide) {
                    hiddenByUsCount++;
                    item.style.display = 'none';
                } else if (item.dataset.wasHiddenByFilter === 'true') {
                    // 如果之前被我们隐藏过，但现在不应该隐藏了
                    item.style.display = '';
                    delete item.dataset.wasHiddenByFilter;
                }

                // 标记被我们隐藏的项目
                if (shouldHide) {
                    item.dataset.wasHiddenByFilter = 'true';
                }
            }

            console.log(`过滤完成: 根据关键词隐藏了 ${hiddenByUsCount} 个项目`);

            // 更新待办计数
            updateTaskCount();

        } catch (e) {
            console.error("过滤项目时出错:", e);
        } finally {
            isProcessing = false;
        }
    }

    // --- 初始化 ---
    console.log('BUPT 待办过滤助手 v2.5.2 启动');

    function initializeScript() {
        console.log('DOM 内容已加载，开始初始化脚本...');
        try {
            // 1. 创建控制面板UI
            createControlPanel();

            // 2. 页面加载后立即执行一次过滤
            setTimeout(() => {
                console.log('执行首次过滤...');
                filterItems();
            }, 500);

            // 3. 设置过滤器
            console.log('设置过滤器轮询...');
            intervalId = setInterval(filterItems, 500); // 降低轮询频率提高性能

            // 4. 添加分页事件监听
            addPaginationListeners();

        } catch(e) {
            console.error("脚本初始化过程中发生错误:", e);
        }
    }

    // --- 添加分页事件监听 ---
    function addPaginationListeners() {
        // 监听页面内容变化
        const observer = new MutationObserver((mutations) => {
            let shouldFilter = false;

            for (const mutation of mutations) {
                // 检查是否有待办项相关元素变化
                if (mutation.target.classList &&
                    (mutation.target.classList.contains('in-progress-item') ||
                     mutation.target.closest('.in-progress-list'))) {
                    shouldFilter = true;
                    break;
                }
            }

            if (shouldFilter) {
                // 稍微延迟，等待页面内容完全加载
                setTimeout(filterItems, 100);
            }
        });

        // 观察待办列表部分
        const todoListContainer = document.querySelector('.in-progress-list');
        if (todoListContainer) {
            observer.observe(todoListContainer, {
                childList: true,
                subtree: true,
                attributes: true
            });
        }

        // 尝试找到分页按钮并添加点击事件
        const paginationContainer = document.querySelector('.ant-pagination');
        if (paginationContainer) {
            paginationContainer.addEventListener('click', () => {
                // 分页操作后略微延迟执行过滤
                setTimeout(filterItems, 300);
            });
        }
    }

    // 确保 DOM 基本就绪
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeScript);
    } else {
        initializeScript();
    }

    // 清理：添加页面卸载时的清理逻辑
    window.addEventListener('beforeunload', () => {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
    });
})();
