// ==========================================================
// 寿司计数器 v3.0.2 核心业务逻辑脚本
// ==========================================================

// 当前静态资源版本号。这里与 index.html、sw.js 的缓存指纹保持一致，防止旧脚本被浏览器长期缓存。
const APP_VERSION = '3.0.2';

// 价格和数量上限用于拦截 LocalStorage 脏数据或误输入，避免超大数字把页面金额显示撑爆。
const MAX_PRICE = 999999;
const MAX_COUNT = 9999;
const MAX_CUSTOM_ITEMS = 100;
const MAX_CUSTOM_NAME_LENGTH = 40;

// 本应用独占的本地存储键名。异常恢复时只清理这些键，避免误删同源下其它项目的数据。
const STORAGE_KEYS = [
    'sushi_tea_price',
    'sushi_dine_count',
    'sushi_classic_plates',
    'sushi_custom_items'
];

// 经典寿司盘默认配置（白、红、银、金、黑五色，分别匹配 8/10/15/20/28 元）。
const DEFAULT_CLASSIC_PLATES = {
    white: { name: '白盘', price: 8, count: 0, color: '#FFFFFF' },
    red: { name: '红盘', price: 10, count: 0, color: '#E60012' },
    silver: { name: '银盘', price: 15, count: 0, color: '#E5E5E7' },
    gold: { name: '金盘', price: 20, count: 0, color: '#FFC000' },
    black: { name: '黑盘', price: 28, count: 0, color: '#1A1A1A' }
};

// 预设好的自定义单点行边框颜色库。恢复脏数据时只允许使用这些颜色，避免异常 CSS 值污染样式。
const BEAUTIFUL_COLORS = [
    '#E60012', // 经典大红
    '#FFC000', // 蛋黄黄
    '#A0D468', // 芥末绿
    '#4FC1E9', // 晴空蓝
    '#EC87C0', // 樱花粉
    '#967ADC', // 芋泥紫
    '#8E8E93', // 磨砂灰
    '#FF9500'  // 甜橙橘
];

// 全局状态管理 State。页面所有显示都从这里计算，避免 DOM 和数据各算各的。
let state = {
    classicPlates: {}, // 经典寿司盘数量及单价管理
    customItems: [],   // 用户自定义单点餐品行
    teaPrice: 5,       // 茶位费单价（默认 5 元/人）
    dineCount: 1       // 就餐人数（默认 1 人）
};

/**
 * 复制默认经典盘配置，避免直接改动 DEFAULT_CLASSIC_PLATES 常量。
 * @returns {Object} 一份新的经典盘默认状态
 */
function createDefaultClassicPlates() {
    return JSON.parse(JSON.stringify(DEFAULT_CLASSIC_PLATES));
}

/**
 * 将任意输入清洗为合法价格。
 * @param {string|number} value 用户输入或本地存储中的原始值
 * @param {number} fallback 无法解析时使用的兜底价格
 * @returns {number} 0 到 MAX_PRICE 之间的价格
 */
function sanitizePrice(value, fallback = 0) {
    const price = parseFloat(value);
    if (!Number.isFinite(price) || price < 0) {
        return fallback;
    }
    return Math.min(price, MAX_PRICE);
}

/**
 * 将任意输入清洗为合法数量。
 * @param {string|number} value 用户输入或本地存储中的原始值
 * @param {number} fallback 无法解析时使用的兜底数量
 * @returns {number} 0 到 MAX_COUNT 之间的整数数量
 */
function sanitizeCount(value, fallback = 0) {
    const count = parseInt(value, 10);
    if (!Number.isFinite(count) || count < 0) {
        return fallback;
    }
    return Math.min(count, MAX_COUNT);
}

/**
 * 将任意输入清洗为合法就餐人数。就餐人数最小为 1，彻底避免除以 0。
 * @param {string|number} value 用户输入或本地存储中的原始值
 * @param {number} fallback 无法解析时使用的兜底人数
 * @returns {number} 1 到 MAX_COUNT 之间的整数人数
 */
function sanitizeDineCount(value, fallback = 1) {
    const count = sanitizeCount(value, fallback);
    return Math.max(1, count);
}

/**
 * 清洗自定义餐品名称，控制长度并保证它始终是普通文本。
 * @param {unknown} value 原始名称
 * @returns {string} 可安全写入 input.value 的名称
 */
function sanitizeCustomName(value) {
    const name = String(value ?? '自定义餐点').trim();
    return (name || '自定义餐点').slice(0, MAX_CUSTOM_NAME_LENGTH);
}

/**
 * 清洗自定义行颜色，只允许使用内置色板中的颜色。
 * @param {unknown} color 原始颜色
 * @param {number} index 当前行序号，用于生成稳定兜底颜色
 * @returns {string} 合法颜色值
 */
function sanitizeRowColor(color, index) {
    if (BEAUTIFUL_COLORS.includes(color)) {
        return color;
    }
    return BEAUTIFUL_COLORS[index % BEAUTIFUL_COLORS.length];
}

/**
 * 格式化账单金额，统一保留 1 位小数。
 * @param {number} amount 待显示金额
 * @returns {string} 可直接显示的金额文本
 */
function formatMoney(amount) {
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    return safeAmount.toFixed(1);
}

/**
 * 只清理本应用自己的本地存储数据，避免误删同源下其它项目。
 */
function clearAppStorage() {
    STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
}

/**
 * 从本地存储恢复经典盘状态，并对缺失字段、异常价格、异常数量做统一兜底。
 * @param {string|null} savedClassicData LocalStorage 中保存的原始 JSON 字符串
 * @returns {Object} 清洗后的经典盘状态
 */
function restoreClassicPlates(savedClassicData) {
    const restoredPlates = createDefaultClassicPlates();
    if (!savedClassicData) {
        return restoredPlates;
    }

    const parsedClassicData = JSON.parse(savedClassicData);
    if (Array.isArray(parsedClassicData) || typeof parsedClassicData !== 'object' || parsedClassicData === null) {
        console.warn('[Storage] 检测到不兼容的经典盘 LocalStorage 格式，已回退为默认配置。');
        return restoredPlates;
    }

    Object.keys(DEFAULT_CLASSIC_PLATES).forEach(color => {
        const savedItem = parsedClassicData[color] || {};
        const defaultItem = DEFAULT_CLASSIC_PLATES[color];
        restoredPlates[color] = {
            name: defaultItem.name,
            color: defaultItem.color,
            price: sanitizePrice(savedItem.price, defaultItem.price),
            count: sanitizeCount(savedItem.count, defaultItem.count)
        };
    });

    return restoredPlates;
}

/**
 * 从本地存储恢复自定义餐品行，并拦截超长列表、异常字段和非法颜色。
 * @param {string|null} savedCustomData LocalStorage 中保存的原始 JSON 字符串
 * @returns {Array} 清洗后的自定义餐品数组
 */
function restoreCustomItems(savedCustomData) {
    if (!savedCustomData) {
        return [];
    }

    const parsedCustomData = JSON.parse(savedCustomData);
    if (!Array.isArray(parsedCustomData)) {
        return [];
    }

    return parsedCustomData
        .slice(0, MAX_CUSTOM_ITEMS)
        .filter(item => item && typeof item === 'object')
        .map((item, index) => ({
            id: Number.isFinite(parseInt(item.id, 10)) ? parseInt(item.id, 10) : Date.now() + index,
            name: sanitizeCustomName(item.name),
            price: sanitizePrice(item.price, 0),
            count: sanitizeCount(item.count, 0),
            color: sanitizeRowColor(item.color, index)
        }));
}

/**
 * 页面加载初始化函数。
 */
function init() {
    try {
        // 1. 从 LocalStorage 恢复就餐基本配置，并在进入状态前完成清洗。
        const savedTeaPrice = localStorage.getItem('sushi_tea_price');
        const savedDineCount = localStorage.getItem('sushi_dine_count');
        state.teaPrice = savedTeaPrice !== null ? sanitizePrice(savedTeaPrice, 5) : 5;
        state.dineCount = savedDineCount !== null ? sanitizeDineCount(savedDineCount, 1) : 1;

        // 2. 恢复经典盘和自定义餐品。所有本地脏数据都在这里被截断或回退。
        state.classicPlates = restoreClassicPlates(localStorage.getItem('sushi_classic_plates'));
        state.customItems = restoreCustomItems(localStorage.getItem('sushi_custom_items'));

        // 3. 同步配置到 DOM 输入框，保证刷新后用户看到的值就是当前状态值。
        document.getElementById('tea-price').value = state.teaPrice;
        document.getElementById('dine-count').value = state.dineCount;
        Object.keys(DEFAULT_CLASSIC_PLATES).forEach(color => {
            const priceInput = document.getElementById(`price-${color}`);
            if (priceInput) {
                priceInput.value = state.classicPlates[color].price;
            }
        });

        // 4. 执行首次全局渲染与金额计算。
        renderAll();

        // 5. 注册 PWA Service Worker。版本指纹必须随静态资源版本同步更新。
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register(`./sw.js?v=${APP_VERSION}`)
                    .then(reg => console.log('[PWA] Service Worker 注册成功，Scope:', reg.scope))
                    .catch(err => console.error('[PWA] Service Worker 注册失败：', err));
            });
        }
    } catch (error) {
        console.error('[Init] 初始化失败，正在清理本应用数据并恢复默认状态：', error);
        clearAppStorage();
        state.classicPlates = createDefaultClassicPlates();
        state.customItems = [];
        state.teaPrice = 5;
        state.dineCount = 1;
        renderAll();
    }
}

/**
 * 全局渲染入口（渲染经典盘数量、自定义餐品行，并更新总账单）。
 */
function renderAll() {
    // 1. 同步经典彩盘数量到 DOM 文本。
    Object.keys(DEFAULT_CLASSIC_PLATES).forEach(color => {
        const countSpan = document.getElementById(`count-${color}`);
        if (countSpan) {
            countSpan.textContent = state.classicPlates[color].count;
        }
    });

    // 2. 渲染自定义横行列表。
    renderCustomList();

    // 3. 重新计算汇总金额（总计与人均）。
    updateTotal();
}

/**
 * 增减经典彩盘数量。
 * @param {string} color 盘子颜色键值 (white, red, silver, gold, black)
 * @param {number} delta 变化量 (1 或 -1)
 */
function changeClassicQty(color, delta) {
    commitFocusedEmptyNumberInput();

    if (!state.classicPlates[color]) {
        return;
    }

    const currentCount = sanitizeCount(state.classicPlates[color].count, 0);
    state.classicPlates[color].count = sanitizeCount(currentCount + delta, 0);

    const countSpan = document.getElementById(`count-${color}`);
    if (countSpan) {
        countSpan.textContent = state.classicPlates[color].count;
    }

    saveState();
    updateTotal();
}

/**
 * 手动修改经典彩盘的单价（支持自定义定价）。
 * @param {string} color 盘子颜色键值
 * @param {string} newPrice 用户输入的新单价
 * @param {boolean} shouldNormalizeInput 是否把清洗后的价格回写到输入框
 */
function updateClassicPrice(color, newPrice, shouldNormalizeInput = true) {
    if (!state.classicPlates[color]) {
        return;
    }

    const price = sanitizePrice(newPrice, 0);
    state.classicPlates[color].price = price;

    // 输入中不强行回写，避免用户刚删掉内容准备重输时被立即塞回 0；提交时再统一纠偏。
    if (shouldNormalizeInput) {
        const priceInput = document.getElementById(`price-${color}`);
        if (priceInput) {
            priceInput.value = price;
        }
    }

    saveState();
    updateTotal();
}

/**
 * 监听就餐人数和茶位费手动修改并更新。
 * @param {boolean} shouldNormalizeInput 是否把清洗后的值回写到输入框
 */
function updateTeaConfig(shouldNormalizeInput = true) {
    const teaPriceInput = document.getElementById('tea-price');
    const dineCountInput = document.getElementById('dine-count');

    state.teaPrice = sanitizePrice(teaPriceInput.value, 0);
    state.dineCount = sanitizeDineCount(dineCountInput.value, 1);

    if (shouldNormalizeInput) {
        teaPriceInput.value = state.teaPrice;
        dineCountInput.value = state.dineCount;
    }

    saveState();
    updateTotal();
}

/**
 * 快捷增减就餐人数。
 * @param {number} delta 变化量
 */
function changeDineCount(delta) {
    commitFocusedEmptyNumberInput();

    state.dineCount = sanitizeDineCount(state.dineCount + delta, 1);
    document.getElementById('dine-count').value = state.dineCount;

    saveState();
    updateTotal();
}

/**
 * 更新单行自定义餐品的小计文本，不重绘整行，避免用户输入时光标被打断。
 * @param {number} index 自定义餐品行序号
 */
function updateCustomRowTotal(index) {
    const rowTotal = document.querySelector(`[data-custom-index="${index}"] .row-total`);
    const item = state.customItems[index];
    if (rowTotal && item) {
        rowTotal.textContent = `¥${formatMoney(item.price * item.count)}`;
    }
}

/**
 * 渲染自定义单点横行列表。这里不用 HTML 字符串拼接用户内容，防止餐品名破坏 DOM 结构。
 */
function renderCustomList() {
    const container = document.getElementById('list-container');
    container.replaceChildren(); // 清空容器后用 DOM API 逐个创建安全节点。

    state.customItems.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'row-item';
        row.dataset.customIndex = String(index);
        row.style.setProperty('--row-color', sanitizeRowColor(item.color, index));

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'input-name';
        nameInput.placeholder = '餐品名称';
        nameInput.value = item.name;
        nameInput.addEventListener('input', () => updateCustomItem(index, 'name', nameInput.value, false));
        nameInput.addEventListener('change', () => updateCustomItem(index, 'name', nameInput.value, true));

        const priceInput = document.createElement('input');
        priceInput.type = 'number';
        priceInput.className = 'input-price';
        priceInput.placeholder = '0';
        priceInput.value = item.price;
        priceInput.addEventListener('focus', () => clearZero(priceInput));
        priceInput.addEventListener('blur', () => restoreZero(priceInput, 0));
        priceInput.addEventListener('input', () => updateCustomItem(index, 'price', priceInput.value, false));
        priceInput.addEventListener('change', () => updateCustomItem(index, 'price', priceInput.value, true));

        const qtyControl = document.createElement('div');
        qtyControl.className = 'qty-control';

        const minusButton = document.createElement('button');
        minusButton.type = 'button';
        minusButton.className = 'btn-minus';
        minusButton.textContent = '-';
        minusButton.addEventListener('click', () => changeCustomQty(index, -1));

        const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.className = 'input-qty';
        qtyInput.value = item.count;
        qtyInput.readOnly = true;

        const plusButton = document.createElement('button');
        plusButton.type = 'button';
        plusButton.className = 'btn-plus';
        plusButton.textContent = '+';
        plusButton.addEventListener('click', () => changeCustomQty(index, 1));

        qtyControl.append(minusButton, qtyInput, plusButton);

        const rowTotal = document.createElement('div');
        rowTotal.className = 'row-total';
        rowTotal.textContent = `¥${formatMoney(item.price * item.count)}`;

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'btn-delete';
        deleteButton.textContent = '×';
        deleteButton.addEventListener('click', () => deleteCustomRow(index));

        row.append(nameInput, priceInput, qtyControl, rowTotal, deleteButton);
        container.appendChild(row);
    });
}

/**
 * 智能清空输入框默认零值，免去手机端繁琐的退格操作。
 * @param {HTMLInputElement} input 输入框对象
 */
function clearZero(input) {
    if (input.value === '0') {
        input.value = '';
    }
}

/**
 * 失焦时若内容为空则自动填补默认值，防止账单数据破损。
 * @param {HTMLInputElement} input 输入框对象
 * @param {number} defaultValue 默认填补的值
 */
function restoreZero(input, defaultValue) {
    if (input.value.trim() === '') {
        input.value = defaultValue;
        // 手动分发 input/change，让实时计算和提交纠偏都能收到同一次空值回填。
        input.dispatchEvent(new Event('input'));
        input.dispatchEvent(new Event('change'));
    }
}

/**
 * 在用户点击其它加减控件前，兜底提交当前聚焦的空数字框。
 * 这能覆盖部分浏览器对非法 number 输入不触发 blur 的边界情况。
 */
function commitFocusedEmptyNumberInput() {
    const input = document.activeElement;
    if (!(input instanceof HTMLInputElement) || input.type !== 'number' || input.value.trim() !== '') {
        return;
    }

    if (input.id === 'tea-price') {
        restoreZero(input, 5);
        return;
    }

    if (input.id === 'dine-count') {
        restoreZero(input, 1);
        return;
    }

    if (input.id.startsWith('price-')) {
        const color = input.id.replace('price-', '');
        restoreZero(input, DEFAULT_CLASSIC_PLATES[color]?.price ?? 0);
        return;
    }

    if (input.classList.contains('input-price')) {
        restoreZero(input, 0);
    }
}

/**
 * 修改自定义单点餐品属性（名称或价格）。
 * @param {number} index 自定义餐品序号
 * @param {string} field 字段名
 * @param {string|number} value 用户输入值
 * @param {boolean} shouldRender 是否重绘列表并回写清洗后的输入值
 */
function updateCustomItem(index, field, value, shouldRender = true) {
    const item = state.customItems[index];
    if (!item) {
        return;
    }

    if (field === 'price') {
        item.price = sanitizePrice(value, 0);
    } else if (field === 'name') {
        item.name = sanitizeCustomName(value);
    } else {
        return;
    }

    saveState();

    if (shouldRender) {
        renderCustomList();
    } else if (field === 'price') {
        updateCustomRowTotal(index);
    }

    updateTotal();
}

/**
 * 增减自定义单点行餐品数量。
 * @param {number} index 自定义餐品序号
 * @param {number} delta 变化量
 */
function changeCustomQty(index, delta) {
    commitFocusedEmptyNumberInput();

    const item = state.customItems[index];
    if (!item) {
        return;
    }

    const currentCount = sanitizeCount(item.count, 0);
    item.count = sanitizeCount(currentCount + delta, 0);

    saveState();
    renderCustomList();
    updateTotal();
}

/**
 * 新增一行自定义单点餐品。
 */
function addCustomRow() {
    commitFocusedEmptyNumberInput();

    if (state.customItems.length >= MAX_CUSTOM_ITEMS) {
        alert(`自定义餐品最多保留 ${MAX_CUSTOM_ITEMS} 行，请先删除不需要的项目。`);
        return;
    }

    const newId = Date.now();
    const randomColor = BEAUTIFUL_COLORS[Math.floor(Math.random() * BEAUTIFUL_COLORS.length)];

    state.customItems.push({
        id: newId,
        name: '自定义餐点',
        price: 0,
        count: 1,
        color: randomColor
    });
    saveState();
    renderAll();
}

/**
 * 删除自定义餐品行。
 * @param {number} index 自定义餐品序号
 */
function deleteCustomRow(index) {
    if (confirm('确定要删除这行自定义餐点吗？')) {
        state.customItems.splice(index, 1);
        saveState();
        renderAll();
    }
}

/**
 * 实时汇总计算总金额与人均消费。
 */
function updateTotal() {
    // 1. 经典五色彩盘总金额。计算前再次清洗，防止运行中被控制台或异常数据污染。
    let classicTotal = 0;
    Object.keys(DEFAULT_CLASSIC_PLATES).forEach(color => {
        const item = state.classicPlates[color] || DEFAULT_CLASSIC_PLATES[color];
        classicTotal += sanitizePrice(item.price, 0) * sanitizeCount(item.count, 0);
    });

    // 2. 自定义餐品总金额。每项都按价格和数量分别清洗后再参与计算。
    const customTotal = state.customItems.reduce((sum, item) => {
        return sum + (sanitizePrice(item.price, 0) * sanitizeCount(item.count, 0));
    }, 0);

    // 3. 茶位费总金额。
    const safeTeaPrice = sanitizePrice(state.teaPrice, 0);
    const safeDineCount = sanitizeDineCount(state.dineCount, 1);
    const teaTotal = safeTeaPrice * safeDineCount;

    // 4. 汇总账单与人均费用。
    const grandTotal = classicTotal + customTotal + teaTotal;
    const averageTotal = grandTotal / safeDineCount;

    // 5. 同步至 DOM。
    document.getElementById('grand-total').textContent = `¥${formatMoney(grandTotal)}`;
    document.getElementById('average-total').textContent = `¥${formatMoney(averageTotal)}`;
}

/**
 * 统一数据持久化存储。写入失败只提示用户，不中断当前页面计算。
 */
function saveState() {
    try {
        localStorage.setItem('sushi_tea_price', state.teaPrice);
        localStorage.setItem('sushi_dine_count', state.dineCount);
        localStorage.setItem('sushi_classic_plates', JSON.stringify(state.classicPlates));
        localStorage.setItem('sushi_custom_items', JSON.stringify(state.customItems));
    } catch (error) {
        console.error('[Storage] 数据写入 LocalStorage 失败：', error);
        if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            alert('本地存储空间已满！当前点单数据将无法在页面刷新后被保留。请尝试删除部分自定义餐品以释放空间。');
        }
    }
}

/**
 * 重置所有数据（恢复初始设定：经典五盘归零、茶位 5 元、人数 1 人、清空单点行）。
 */
function resetAll() {
    if (confirm('确定要重置所有点单数据吗？这将恢复到默认的 1 人就餐及零消费。')) {
        state.teaPrice = 5;
        state.dineCount = 1;
        state.customItems = [];
        state.classicPlates = createDefaultClassicPlates();

        document.getElementById('tea-price').value = 5;
        document.getElementById('dine-count').value = 1;
        Object.keys(DEFAULT_CLASSIC_PLATES).forEach(color => {
            const priceInput = document.getElementById(`price-${color}`);
            if (priceInput) {
                priceInput.value = state.classicPlates[color].price;
            }
        });

        saveState();
        renderAll();
    }
}

// 页面加载自动执行。
init();
