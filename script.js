// ==========================================================
// 🍣 寿司计数器 v3.0.1 核心业务逻辑脚本
// ==========================================================

// 经典寿司盘默认配置（白、红、银、金、黑五色，分别匹配 8/10/15/20/28 元）
const DEFAULT_CLASSIC_PLATES = {
    white: { name: '白盘', price: 8, count: 0, color: '#FFFFFF' },
    red: { name: '红盘', price: 10, count: 0, color: '#E60012' },
    silver: { name: '银盘', price: 15, count: 0, color: '#E5E5E7' },
    gold: { name: '金盘', price: 20, count: 0, color: '#FFC000' },
    black: { name: '黑盘', price: 28, count: 0, color: '#1A1A1A' }
};

// 预设好配色的自定义单点行边框随机颜色库（避开低对比度和杂乱颜色）
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

// 全局状态管理 State
let state = {
    classicPlates: {}, // 经典寿司盘数量及单价管理
    customItems: [],   // 用户自定义单点餐品行
    teaPrice: 5,       // 茶位费单价（默认 5 元/人）
    dineCount: 1       //就餐人数（默认 1 人）
};

/**
 * 页面加载初始化函数
 */
function init() {
    try {
        // 1. 从 LocalStorage 恢复就餐基本配置
        const savedTeaPrice = localStorage.getItem('sushi_tea_price');
        const savedDineCount = localStorage.getItem('sushi_dine_count');
        
        state.teaPrice = savedTeaPrice !== null ? parseFloat(savedTeaPrice) : 5;
        state.dineCount = savedDineCount !== null ? parseInt(savedDineCount, 10) : 1;

        // 🚨 初始加载数据合法性防御校验，强力阻断本地异常脏数据渲染
        if (isNaN(state.teaPrice) || state.teaPrice < 0) {
            state.teaPrice = 5;
        }
        if (isNaN(state.dineCount) || state.dineCount < 1) {
            state.dineCount = 1;
        }

        // 同步配置到 DOM 输入框
        document.getElementById('tea-price').value = state.teaPrice;
        document.getElementById('dine-count').value = state.dineCount;

        // 2. 从 LocalStorage 恢复经典盘子数据（包含自定义单价）
        const savedClassicData = localStorage.getItem('sushi_classic_plates');
        if (savedClassicData) {
            const parsedClassicData = JSON.parse(savedClassicData);
            
            // 向下兼容性防护：检查旧版数据格式
            // 如果旧版数据以扁平数组格式（1.x 遗留结构）存在，则直接触发自我清理和默认值回填
            if (Array.isArray(parsedClassicData)) {
                console.warn('[Storage] 检测到不兼容的旧版数组格式 LocalStorage，正在执行重置...');
                state.classicPlates = JSON.parse(JSON.stringify(DEFAULT_CLASSIC_PLATES));
            } else {
                state.classicPlates = parsedClassicData;
                // 确保由于版本演进缺失的“白盘”得到初始化
                if (!state.classicPlates.white) {
                    state.classicPlates.white = { name: '白盘', price: 8, count: 0, color: '#FFFFFF' };
                }
            }
        } else {
            state.classicPlates = JSON.parse(JSON.stringify(DEFAULT_CLASSIC_PLATES));
        }

        // 针对经典盘恢复出的单价进行防御校验，防止脏数据注入
        for (const color in state.classicPlates) {
            let itemPrice = parseFloat(state.classicPlates[color].price);
            if (isNaN(itemPrice) || itemPrice < 0) {
                state.classicPlates[color].price = DEFAULT_CLASSIC_PLATES[color].price;
            }
        }

        // 将恢复的经典盘子单价实时同步到对应的 input 输入框中
        for (const color in state.classicPlates) {
            const priceInput = document.getElementById(`price-${color}`);
            if (priceInput) {
                priceInput.value = state.classicPlates[color].price;
            }
        }

        // 3. 从 LocalStorage 恢复自定义餐品行
        const savedCustomData = localStorage.getItem('sushi_custom_items');
        if (savedCustomData) {
            state.customItems = JSON.parse(savedCustomData);
            // 确保自定义项是数组结构
            if (!Array.isArray(state.customItems)) {
                state.customItems = [];
            } else {
                // 防御自定义项单价出现负数
                state.customItems.forEach(item => {
                    let itemPrice = parseFloat(item.price);
                    if (isNaN(itemPrice) || itemPrice < 0) {
                        item.price = 0;
                    }
                });
            }
        } else {
            state.customItems = []; // 默认无自定义单点
        }

        // 4. 执行首次全局渲染与金额计算
        renderAll();

        // 5. 注册 PWA Service Worker (支持桌面添加到屏幕与 100% 离线使用)
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                // 绑定版本指纹注册，强行击穿 Service Worker 级联强缓存
                navigator.serviceWorker.register('./sw.js?v=3.0.1')
                    .then(reg => console.log('[PWA] Service Worker 注册成功，Scope:', reg.scope))
                    .catch(err => console.error('[PWA] Service Worker 注册失败：', err));
            });
        }
    } catch (error) {
        console.error('[Init] 初始化失败，正在强制重置数据以恢复运行：', error);
        // 如果由于极端异常导致解析出错，强行清空本地存储并回天默认值以防止页面白屏
        localStorage.clear();
        state.classicPlates = JSON.parse(JSON.stringify(DEFAULT_CLASSIC_PLATES));
        state.customItems = [];
        state.teaPrice = 5;
        state.dineCount = 1;
        renderAll();
    }
}

/**
 * 全局渲染入口（渲染经典盘数量、自定义餐品行，并更新总账单）
 */
function renderAll() {
    // 1. 同步经典彩盘数量到 DOM 文本
    for (const color in state.classicPlates) {
        const countSpan = document.getElementById(`count-${color}`);
        if (countSpan) {
            countSpan.textContent = state.classicPlates[color].count;
        }
    }

    // 2. 渲染自定义横行列表
    renderCustomList();

    // 3. 重新计算汇总金额（总计与人均）
    updateTotal();
}

/**
 * 增减经典彩盘数量
 * @param {string} color 盘子颜色键值 (white, red, silver, gold, black)
 * @param {number} delta 变化量 (1 或 -1)
 */
function changeClassicQty(color, delta) {
    if (state.classicPlates[color]) {
        let newCount = state.classicPlates[color].count + delta;
        if (newCount < 0) newCount = 0; // 盘数不可为负数
        state.classicPlates[color].count = newCount;
        
        saveState();
        renderAll();
    }
}

/**
 * 手动修改经典彩盘的单价（支持自定义定价）
 * @param {string} color 盘子颜色键值
 * @param {string} newPrice 用户输入的新单价
 */
function updateClassicPrice(color, newPrice) {
    if (state.classicPlates[color]) {
        let price = parseFloat(newPrice);
        if (isNaN(price) || price < 0) price = 0; // 容错处理：不合法单价设为 0
        state.classicPlates[color].price = price;
        
        // 🚨 DOM 状态写回同步：确保输入框内显示的值与 JS 内存中洗涤纠错后的值 100% 同步一致，防止“所见非所得”
        const priceInput = document.getElementById(`price-${color}`);
        if (priceInput) {
            priceInput.value = price;
        }
        
        saveState();
        updateTotal();
    }
}

/**
 * 监听就餐人数和茶位费手动修改并更新
 */
function updateTeaConfig() {
    const teaPriceInput = document.getElementById('tea-price');
    const dineCountInput = document.getElementById('dine-count');

    let tPrice = parseFloat(teaPriceInput.value);
    let dCount = parseInt(dineCountInput.value, 10);

    if (isNaN(tPrice) || tPrice < 0) tPrice = 0;
    if (isNaN(dCount) || dCount < 1) dCount = 1;

    state.teaPrice = tPrice;
    state.dineCount = dCount;

    // 🚨 DOM 状态写回同步：确保人数和茶位输入框显示最新规范清洗后的值，防止输入负数越界
    teaPriceInput.value = tPrice;
    dineCountInput.value = dCount;

    saveState();
    updateTotal();
}

/**
 * 快捷增减就餐人数
 * @param {number} delta 变化量
 */
function changeDineCount(delta) {
    let newCount = state.dineCount + delta;
    if (newCount < 1) newCount = 1; // 默认最少 1 人就餐
    state.dineCount = newCount;
    document.getElementById('dine-count').value = newCount;

    saveState();
    updateTotal();
}

/**
 * 渲染自定义单点横行列表 HTML 结构
 */
function renderCustomList() {
    const container = document.getElementById('list-container');
    container.innerHTML = ''; // 清空容器

    state.customItems.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'row-item';
        
        // 设置侧边盘子装饰条颜色的 CSS 变量
        row.style.setProperty('--row-color', item.color || '#ccc');

        // 动态注入横行结构（在价格框中追加 onfocus="clearZero(this)" 等智能清零功能）
        row.innerHTML = `
            <input type="text" class="input-name" value="${item.name}" placeholder="餐品名称" onchange="updateCustomItem(${index}, 'name', this.value)">
            <input type="number" class="input-price" value="${item.price}" placeholder="0" onfocus="clearZero(this)" onblur="restoreZero(this, 0)" onchange="updateCustomItem(${index}, 'price', this.value)">
            
            <div class="qty-control">
                <button class="btn-minus" onclick="changeCustomQty(${index}, -1)">-</button>
                <input type="number" class="input-qty" value="${item.count}" readonly>
                <button class="btn-plus" onclick="changeCustomQty(${index}, 1)">+</button>
            </div>
            
            <div class="row-total">¥${item.price * item.count}</div>
            <button class="btn-delete" onclick="deleteCustomRow(${index})">×</button>
        `;
        container.appendChild(row);
    });
}

/**
 * 智能清空输入框默认零值，免去手机端繁琐的退格操作
 * @param {HTMLInputElement} input 输入框对象
 */
function clearZero(input) {
    if (input.value === '0') {
        input.value = '';
    }
}

/**
 * 失焦时若内容为空则自动填补默认值，防止账单数据破损
 * @param {HTMLInputElement} input 输入框对象
 * @param {number} defaultValue 默认填补的值
 */
function restoreZero(input, defaultValue) {
    if (input.value.trim() === '') {
        input.value = defaultValue;
        // 手动分发变更事件触发金额计算
        input.dispatchEvent(new Event('change'));
    }
}

/**
 * 修改自定义单点餐品属性 (名称或价格)
 */
function updateCustomItem(index, field, value) {
    if (field === 'price') {
        value = parseFloat(value) || 0; // 确保是合法价格
        if (value < 0) value = 0; // 🚨 防御边界漏洞：自定义单价绝不可为负数，防止恶意扣减账单
    }
    state.customItems[index][field] = value;
    saveState();
    renderCustomList();
    updateTotal();
}

/**
 * 增减自定义单点行餐品数量
 */
function changeCustomQty(index, delta) {
    let newCount = state.customItems[index].count + delta;
    if (newCount < 0) newCount = 0; // 数量不可为负
    state.customItems[index].count = newCount;
    saveState();
    renderCustomList();
    updateTotal();
}

/**
 * 新增一行自定义单点餐品
 */
function addCustomRow() {
    const newId = Date.now();
    // 随机选择精选色板中的美观颜色作为行边条
    const randomColor = BEAUTIFUL_COLORS[Math.floor(Math.random() * BEAUTIFUL_COLORS.length)];
    
    state.customItems.push({
        id: newId,
        name: '自定义餐点',
        price: 0,
        count: 1, // 新增行默认为 1 件
        color: randomColor
    });
    saveState();
    renderAll();
}

/**
 * 删除自定义餐品行
 */
function deleteCustomRow(index) {
    if (confirm('确定要删除这行自定义餐点吗？')) {
        state.customItems.splice(index, 1);
        saveState();
        renderAll();
    }
}

/**
 * 实时汇总计算总金额与人均消费
 */
function updateTotal() {
    // 1. 经典五色彩盘总金额
    let classicTotal = 0;
    for (const color in state.classicPlates) {
        const item = state.classicPlates[color];
        classicTotal += (item.price * item.count);
    }

    // 2. 自定义餐品总金额
    const customTotal = state.customItems.reduce((sum, item) => sum + (item.price * item.count), 0);

    // 3. 茶位费总金额
    const teaTotal = state.teaPrice * state.dineCount;

    // 4. 汇总账单
    const grandTotal = classicTotal + customTotal + teaTotal;

    // 5. 计算人均费用（防止就餐人数为0造成除零错误）
    let averageTotal = grandTotal;
    if (state.dineCount > 0) {
        averageTotal = grandTotal / state.dineCount;
    }

    // 6. 同步至 DOM 确认渲染显示 (保留 1 位小数)
    document.getElementById('grand-total').textContent = `¥${grandTotal.toFixed(1)}`;
    document.getElementById('average-total').textContent = `¥${averageTotal.toFixed(1)}`;
}

/**
 * 统一数据持久化存储
 * 🚨 健壮性保护：使用 try-catch 包裹写入逻辑，防范移动端 LocalStorage 空间已满引发的页面崩溃
 */
function saveState() {
    try {
        localStorage.setItem('sushi_tea_price', state.teaPrice);
        localStorage.setItem('sushi_dine_count', state.dineCount);
        localStorage.setItem('sushi_classic_plates', JSON.stringify(state.classicPlates));
        localStorage.setItem('sushi_custom_items', JSON.stringify(state.customItems));
    } catch (error) {
        console.error('[Storage] 数据写入 LocalStorage 失败：', error);
        // 如果捕获到存储爆满（配额超限）异常，弹出友好且不中断流程的警告提示
        if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            alert('本地存储空间已满！当前点单数据将无法在页面刷新后被保留。请尝试删除部分自定义餐品以释放空间。');
        }
    }
}

/**
 * 重置所有数据（恢复初始设定：经典五盘归零、茶位5元、人数1人、清空单点行）
 */
function resetAll() {
    if (confirm('确定要重置所有点单数据吗？这将恢复到默认的 1 人就餐及零消费。')) {
        state.teaPrice = 5;
        state.dineCount = 1;
        state.customItems = [];
        state.classicPlates = JSON.parse(JSON.stringify(DEFAULT_CLASSIC_PLATES));

        // 更新 DOM
        document.getElementById('tea-price').value = 5;
        document.getElementById('dine-count').value = 1;
        for (const color in state.classicPlates) {
            const priceInput = document.getElementById(`price-${color}`);
            if (priceInput) {
                priceInput.value = state.classicPlates[color].price;
            }
        }

        saveState();
        renderAll();
    }
}

// 页面加载自动执行
init();
