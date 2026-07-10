// ==========================================================
// 寿司计数器页面控制层
// ==========================================================

import {
    ALL_STORAGE_KEYS,
    ASSET_REVISION,
    DEFAULT_CLASSIC_PLATES,
    LEGACY_STORAGE_KEYS,
    MAX_CUSTOM_ITEMS,
    MAX_CUSTOM_NAME_LENGTH,
    ROW_COLORS,
    STORAGE_KEY,
    calculateTotals,
    createDefaultState,
    formatMoney,
    getRowColorIndex,
    restoreState,
    sanitizeCount,
    sanitizeCustomName,
    sanitizeDineCount,
    sanitizePrice,
    serializeState
} from './core.js?v=3.0.2-r7';

// 页面状态只在此处维护；金额计算、数据清洗和存储格式全部交给 core.js。
let state = createDefaultState();
let statusTimer = null;
let storageFailureReported = false;
let legacyStoragePresent = false;
let isReloadingForWorkerUpdate = false;
let hasServiceWorkerController = 'serviceWorker' in navigator
    && navigator.serviceWorker.controller !== null;

// 缓存固定 DOM 节点，避免每次快速点击都重新扫描整个文档。
const elements = {
    teaPrice: document.getElementById('tea-price'),
    dineCount: document.getElementById('dine-count'),
    listContainer: document.getElementById('list-container'),
    grandTotal: document.getElementById('grand-total'),
    averageTotal: document.getElementById('average-total'),
    appStatus: document.getElementById('app-status')
};

/**
 * 展示短时状态消息。错误不会阻塞页面，用户仍可继续完成当前账单计算。
 * @param {string} message 消息文本
 * @param {'info'|'error'} tone 消息类型
 */
function showStatus(message, tone = 'info') {
    window.clearTimeout(statusTimer);
    elements.appStatus.textContent = message;
    elements.appStatus.dataset.tone = tone;
    elements.appStatus.hidden = false;
    statusTimer = window.setTimeout(() => {
        elements.appStatus.hidden = true;
    }, 6000);
}

/**
 * 统一记录本地存储异常，同一页面会话只提示一次，避免输入事件产生弹窗风暴。
 * @param {string} operation 正在执行的存储操作
 * @param {unknown} error 捕获到的异常
 */
function reportStorageFailure(operation, error) {
    console.error(`[Storage] ${operation}失败：`, error);
    if (storageFailureReported) {
        return;
    }

    storageFailureReported = true;
    showStatus('浏览器未能保存数据；当前页面仍可计算，但刷新后改动可能丢失。', 'error');
}

/**
 * 安全读取单个本地键。浏览器隐私策略拒绝访问时返回 null，而不是让页面初始化中断。
 * @param {string} key 本地存储键
 * @returns {string|null} 已保存文本或 null
 */
function readStorageValue(key) {
    try {
        return localStorage.getItem(key);
    } catch (error) {
        reportStorageFailure('读取', error);
        return null;
    }
}

/**
 * 同时读取新版状态与旧版四键数据，core.js 会优先采用合法的新版状态。
 * @returns {ReturnType<typeof createDefaultState>} 恢复后的合法状态
 */
function loadState() {
    const snapshot = {
        current: readStorageValue(STORAGE_KEY),
        teaPrice: readStorageValue(LEGACY_STORAGE_KEYS.teaPrice),
        dineCount: readStorageValue(LEGACY_STORAGE_KEYS.dineCount),
        classicPlates: readStorageValue(LEGACY_STORAGE_KEYS.classicPlates),
        customItems: readStorageValue(LEGACY_STORAGE_KEYS.customItems)
    };

    legacyStoragePresent = Object.entries(snapshot)
        .some(([field, value]) => field !== 'current' && value !== null);

    return restoreState(snapshot);
}

/**
 * 删除旧版分散键。只有新版单键成功写入后才执行，确保迁移过程中不会丢失原数据。
 */
function removeLegacyStorage() {
    try {
        Object.values(LEGACY_STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
        legacyStoragePresent = false;
    } catch (error) {
        reportStorageFailure('清理旧数据', error);
    }
}

/**
 * 将完整状态用一次同步写入保存，避免旧版四次写入中途失败后留下半套数据。
 * @returns {boolean} 是否保存成功
 */
function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, serializeState(state));
        if (legacyStoragePresent) {
            removeLegacyStorage();
        }
        return true;
    } catch (error) {
        reportStorageFailure('写入', error);
        return false;
    }
}

/**
 * 清理本应用的所有新旧键，不影响同源下其它项目的数据。
 */
function clearAppStorage() {
    try {
        ALL_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
        legacyStoragePresent = false;
    } catch (error) {
        reportStorageFailure('重置', error);
    }
}

/**
 * 将当前状态同步到固定输入框和经典盘计数文本。
 */
function syncStaticView() {
    elements.teaPrice.value = String(state.teaPrice);
    elements.dineCount.value = String(state.dineCount);

    Object.keys(DEFAULT_CLASSIC_PLATES).forEach(color => {
        const item = state.classicPlates[color];
        const priceInput = document.getElementById(`price-${color}`);
        const countOutput = document.getElementById(`count-${color}`);

        if (priceInput) {
            priceInput.value = String(item.price);
        }
        if (countOutput) {
            countOutput.textContent = String(item.count);
        }
    });
}

/**
 * 数字输入框聚焦时清空零值，方便移动端直接输入新数字。
 * @param {HTMLInputElement} input 数字输入框
 */
function clearZero(input) {
    if (input.value === '0') {
        input.value = '';
    }
}

/**
 * 空数字框失焦时回填业务默认值，并派发事件让状态与界面保持一致。
 * @param {HTMLInputElement} input 数字输入框
 * @param {number} defaultValue 默认值
 */
function restoreEmptyNumber(input, defaultValue) {
    if (input.value.trim() !== '') {
        return;
    }

    input.value = String(defaultValue);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * 点击其它计数按钮前提交当前空数字框，覆盖部分移动浏览器不及时触发失焦的情况。
 */
function commitFocusedEmptyNumberInput() {
    const input = document.activeElement;
    if (!(input instanceof HTMLInputElement) || input.type !== 'number' || input.value.trim() !== '') {
        return;
    }

    if (input === elements.teaPrice) {
        restoreEmptyNumber(input, 5);
        return;
    }
    if (input === elements.dineCount) {
        restoreEmptyNumber(input, 1);
        return;
    }
    if (input.id.startsWith('price-')) {
        const color = input.id.slice('price-'.length);
        restoreEmptyNumber(input, DEFAULT_CLASSIC_PLATES[color]?.price ?? 0);
        return;
    }
    if (input.classList.contains('input-price')) {
        restoreEmptyNumber(input, 0);
    }
}

/**
 * 为固定数字输入框绑定清空、实时计算和提交纠偏行为。
 * @param {HTMLInputElement} input 输入框
 * @param {number} defaultValue 空值时的默认值
 * @param {(normalize: boolean) => void} updateHandler 状态更新函数
 */
function bindNumberInput(input, defaultValue, updateHandler) {
    input.addEventListener('focus', () => clearZero(input));
    input.addEventListener('blur', () => restoreEmptyNumber(input, defaultValue));
    input.addEventListener('input', () => updateHandler(false));
    input.addEventListener('change', () => updateHandler(true));
}

/**
 * 更新经典盘数量，只修改对应文本和总额，不重建自定义餐品列表。
 * @param {string} color 经典盘颜色键
 * @param {number} delta 增减量
 */
function changeClassicCount(color, delta) {
    commitFocusedEmptyNumberInput();
    const item = state.classicPlates[color];
    if (!item) {
        return;
    }

    item.count = sanitizeCount(item.count + delta, item.count);
    document.getElementById(`count-${color}`).textContent = String(item.count);
    saveState();
    updateTotal();
}

/**
 * 更新经典盘单价。输入过程中不强行回写，提交时才显示清洗后的最终值。
 * @param {string} color 经典盘颜色键
 * @param {boolean} shouldNormalizeInput 是否回写输入框
 */
function updateClassicPrice(color, shouldNormalizeInput) {
    const item = state.classicPlates[color];
    const input = document.getElementById(`price-${color}`);
    if (!item || !input) {
        return;
    }

    item.price = sanitizePrice(input.value, 0);
    if (shouldNormalizeInput) {
        input.value = String(item.price);
    }
    saveState();
    updateTotal();
}

/**
 * 更新茶位费与人数，提交时把经过上限和最小值处理的结果回写到输入框。
 * @param {boolean} shouldNormalizeInput 是否回写输入框
 */
function updateDineConfig(shouldNormalizeInput) {
    state.teaPrice = sanitizePrice(elements.teaPrice.value, 0);
    state.dineCount = sanitizeDineCount(elements.dineCount.value, 1);

    if (shouldNormalizeInput) {
        elements.teaPrice.value = String(state.teaPrice);
        elements.dineCount.value = String(state.dineCount);
    }
    saveState();
    updateTotal();
}

/**
 * 通过按钮增减就餐人数。
 * @param {number} delta 增减量
 */
function changeDineCount(delta) {
    commitFocusedEmptyNumberInput();
    state.dineCount = sanitizeDineCount(state.dineCount + delta, state.dineCount);
    elements.dineCount.value = String(state.dineCount);
    saveState();
    updateTotal();
}

/**
 * 创建自定义餐品行。全部用户数据只写入 textContent/value，不参与 HTML 解析。
 * @param {{name: string, price: number, count: number, color: string}} item 餐品数据
 * @param {number} index 行序号
 * @returns {HTMLElement} 已构建的行节点
 */
function createCustomRowElement(item, index) {
    const row = document.createElement('article');
    row.className = 'row-item';
    row.dataset.customIndex = String(index);
    row.dataset.colorIndex = String(getRowColorIndex(item.color, index));

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'input-name';
    nameInput.placeholder = '餐品名称';
    nameInput.maxLength = MAX_CUSTOM_NAME_LENGTH;
    nameInput.value = item.name;
    nameInput.dataset.field = 'name';
    nameInput.dataset.index = String(index);
    nameInput.setAttribute('aria-label', `第 ${index + 1} 行餐品名称`);

    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.className = 'input-price';
    priceInput.placeholder = '0';
    priceInput.min = '0';
    priceInput.max = '999999';
    priceInput.step = '0.1';
    priceInput.inputMode = 'decimal';
    priceInput.autocomplete = 'off';
    priceInput.value = String(item.price);
    priceInput.dataset.field = 'price';
    priceInput.dataset.index = String(index);
    priceInput.setAttribute('aria-label', `${item.name}单价`);
    priceInput.addEventListener('focus', () => clearZero(priceInput));
    priceInput.addEventListener('blur', () => restoreEmptyNumber(priceInput, 0));

    const qtyControl = document.createElement('div');
    qtyControl.className = 'qty-control';

    const minusButton = document.createElement('button');
    minusButton.type = 'button';
    minusButton.className = 'btn-minus';
    minusButton.textContent = '−';
    minusButton.dataset.action = 'change-custom-count';
    minusButton.dataset.index = String(index);
    minusButton.dataset.delta = '-1';
    minusButton.setAttribute('aria-label', `${item.name}数量减 1`);

    const qtyOutput = document.createElement('output');
    qtyOutput.className = 'input-qty';
    qtyOutput.textContent = String(item.count);
    qtyOutput.setAttribute('aria-label', `${item.name}当前数量`);

    const plusButton = document.createElement('button');
    plusButton.type = 'button';
    plusButton.className = 'btn-plus';
    plusButton.textContent = '+';
    plusButton.dataset.action = 'change-custom-count';
    plusButton.dataset.index = String(index);
    plusButton.dataset.delta = '1';
    plusButton.setAttribute('aria-label', `${item.name}数量加 1`);
    qtyControl.append(minusButton, qtyOutput, plusButton);

    const rowTotal = document.createElement('output');
    rowTotal.className = 'row-total';
    rowTotal.textContent = `¥${formatMoney(item.price * item.count)}`;
    rowTotal.setAttribute('aria-label', `${item.name}小计`);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn-delete';
    deleteButton.textContent = '×';
    deleteButton.dataset.action = 'delete-custom-row';
    deleteButton.dataset.index = String(index);
    deleteButton.setAttribute('aria-label', `删除${item.name}`);

    row.append(nameInput, priceInput, qtyControl, rowTotal, deleteButton);
    return row;
}

/**
 * 重建自定义餐品列表。只有新增、删除或初始化时调用，快速加减数量不会触发整表重绘。
 */
function renderCustomList() {
    const fragment = document.createDocumentFragment();
    if (state.customItems.length === 0) {
        const emptyState = document.createElement('p');
        emptyState.className = 'empty-state';
        emptyState.textContent = '暂无自定义餐品';
        fragment.appendChild(emptyState);
    } else {
        state.customItems.forEach((item, index) => {
            fragment.appendChild(createCustomRowElement(item, index));
        });
    }

    elements.listContainer.replaceChildren(fragment);
}

/**
 * 更新指定自定义行的数量与小计，不移动输入焦点。
 * @param {number} index 行序号
 */
function updateCustomRowValues(index) {
    const row = elements.listContainer.querySelector(`[data-custom-index="${index}"]`);
    const item = state.customItems[index];
    if (!row || !item) {
        return;
    }

    row.querySelector('.input-qty').textContent = String(item.count);
    row.querySelector('.row-total').textContent = `¥${formatMoney(item.price * item.count)}`;
}

/**
 * 餐品改名后同步更新该行各按钮的辅助说明。
 * @param {number} index 行序号
 */
function updateCustomRowLabels(index) {
    const row = elements.listContainer.querySelector(`[data-custom-index="${index}"]`);
    const item = state.customItems[index];
    if (!row || !item) {
        return;
    }

    row.querySelector('.input-price').setAttribute('aria-label', `${item.name}单价`);
    row.querySelector('.btn-minus').setAttribute('aria-label', `${item.name}数量减 1`);
    row.querySelector('.input-qty').setAttribute('aria-label', `${item.name}当前数量`);
    row.querySelector('.btn-plus').setAttribute('aria-label', `${item.name}数量加 1`);
    row.querySelector('.row-total').setAttribute('aria-label', `${item.name}小计`);
    row.querySelector('.btn-delete').setAttribute('aria-label', `删除${item.name}`);
}

/**
 * 更新自定义餐品名称或价格。
 * @param {HTMLInputElement} input 触发更新的输入框
 * @param {boolean} shouldNormalizeInput 是否回写清洗后的值
 */
function updateCustomItem(input, shouldNormalizeInput) {
    const index = Number(input.dataset.index);
    if (!Number.isInteger(index) || index < 0) {
        return;
    }

    const item = state.customItems[index];
    if (!item) {
        return;
    }

    if (input.dataset.field === 'price') {
        item.price = sanitizePrice(input.value, 0);
        if (shouldNormalizeInput) {
            input.value = String(item.price);
        }
        updateCustomRowValues(index);
    } else if (input.dataset.field === 'name') {
        item.name = sanitizeCustomName(input.value);
        if (shouldNormalizeInput) {
            input.value = item.name;
        }
        updateCustomRowLabels(index);
    } else {
        return;
    }

    saveState();
    updateTotal();
}

/**
 * 增减自定义餐品数量。
 * @param {number} index 行序号
 * @param {number} delta 增减量
 */
function changeCustomCount(index, delta) {
    commitFocusedEmptyNumberInput();
    const item = state.customItems[index];
    if (!item) {
        return;
    }

    item.count = sanitizeCount(item.count + delta, item.count);
    saveState();
    updateCustomRowValues(index);
    updateTotal();
}

/**
 * 新增一行自定义餐品并把输入焦点放到名称框。
 */
function addCustomRow() {
    commitFocusedEmptyNumberInput();
    if (state.customItems.length >= MAX_CUSTOM_ITEMS) {
        showStatus(`自定义餐品最多保留 ${MAX_CUSTOM_ITEMS} 行，请先删除不需要的项目。`, 'error');
        return;
    }

    const index = state.customItems.length;
    state.customItems.push({
        name: '自定义餐点',
        price: 0,
        count: 1,
        color: ROW_COLORS[Math.floor(Math.random() * ROW_COLORS.length)]
    });
    saveState();
    renderCustomList();
    updateTotal();

    window.requestAnimationFrame(() => {
        const nameInput = elements.listContainer.querySelector(`[data-index="${index}"][data-field="name"]`);
        if (nameInput instanceof HTMLInputElement) {
            nameInput.focus();
            nameInput.select();
        }
    });
}

/**
 * 删除指定自定义餐品。删除属于不可逆操作，因此保留原生确认对话框。
 * @param {number} index 行序号
 */
function deleteCustomRow(index) {
    const item = state.customItems[index];
    if (!item || !window.confirm(`确定要删除“${item.name}”吗？`)) {
        return;
    }

    state.customItems.splice(index, 1);
    saveState();
    renderCustomList();
    updateTotal();
}

/**
 * 计算并刷新总额和人均金额。
 */
function updateTotal() {
    const totals = calculateTotals(state);
    elements.grandTotal.textContent = `¥${formatMoney(totals.grandTotal)}`;
    elements.averageTotal.textContent = `¥${formatMoney(totals.averageTotal)}`;
}

/**
 * 重置为初始状态。只清理本应用键，并立即保存一份完整默认快照。
 */
function resetAll() {
    if (!window.confirm('确定要重置所有点单数据吗？这会清空当前盘数和自定义餐品。')) {
        return;
    }

    state = createDefaultState();
    clearAppStorage();
    saveState();
    syncStaticView();
    renderCustomList();
    updateTotal();
    showStatus('点单数据已重置。');
}

/**
 * 处理所有带 data-action 的按钮点击，避免把可执行代码散落在 HTML 属性中。
 * @param {MouseEvent} event 点击事件
 */
function handleActionClick(event) {
    const actionButton = event.target instanceof Element
        ? event.target.closest('button[data-action]')
        : null;
    if (!(actionButton instanceof HTMLButtonElement)) {
        return;
    }

    const delta = Number(actionButton.dataset.delta ?? 0);
    const index = Number(actionButton.dataset.index ?? -1);
    switch (actionButton.dataset.action) {
        case 'change-classic-count':
            changeClassicCount(actionButton.dataset.color, delta);
            break;
        case 'change-dine-count':
            changeDineCount(delta);
            break;
        case 'change-custom-count':
            changeCustomCount(index, delta);
            break;
        case 'add-custom-row':
            addCustomRow();
            break;
        case 'delete-custom-row':
            deleteCustomRow(index);
            break;
        case 'reset':
            resetAll();
            break;
        default:
            break;
    }
}

/**
 * 绑定页面固定控件和自定义列表的统一事件入口。
 */
function bindEvents() {
    document.addEventListener('click', handleActionClick);
    bindNumberInput(elements.teaPrice, 5, updateDineConfig);
    bindNumberInput(elements.dineCount, 1, updateDineConfig);

    Object.keys(DEFAULT_CLASSIC_PLATES).forEach(color => {
        const input = document.getElementById(`price-${color}`);
        bindNumberInput(input, DEFAULT_CLASSIC_PLATES[color].price, normalize => {
            updateClassicPrice(color, normalize);
        });
    });

    elements.listContainer.addEventListener('input', event => {
        if (event.target instanceof HTMLInputElement && event.target.dataset.field) {
            updateCustomItem(event.target, false);
        }
    });
    elements.listContainer.addEventListener('change', event => {
        if (event.target instanceof HTMLInputElement && event.target.dataset.field) {
            updateCustomItem(event.target, true);
        }
    });
}

/**
 * 注册并主动检查 Service Worker 更新。新 Worker 接管后只刷新一次，让旧缓存用户立即进入当前版本。
 */
function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        return;
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        // 首次安装只是让当前页面获得离线能力，不需要刷新；只有替换既有 Worker 时才刷新资源。
        if (!hasServiceWorkerController) {
            hasServiceWorkerController = true;
            return;
        }

        if (isReloadingForWorkerUpdate) {
            return;
        }
        isReloadingForWorkerUpdate = true;
        window.location.reload();
    });

    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register(
                `./sw.js?v=${ASSET_REVISION}`,
                { updateViaCache: 'none' }
            );
            await registration.update();
        } catch (error) {
            console.error('[PWA] Service Worker 注册或更新失败：', error);
        }
    });
}

/**
 * 页面初始化：先恢复并迁移数据，再绑定事件和完成首次渲染。
 */
function init() {
    state = loadState();
    bindEvents();
    syncStaticView();
    renderCustomList();
    updateTotal();

    // 发现旧键时立即写入新版单键；确认写入成功后，saveState 会安全删除旧键。
    if (legacyStoragePresent) {
        saveState();
    }
    registerServiceWorker();
}

init();
