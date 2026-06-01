// ==========================================
// 🍣 寿司计数器核心逻辑脚本 (Sushi Counter)
// ==========================================

// 默认寿司盘数据模板（升级为寿司郎经典四色盘价格矩阵）
const DEFAULT_ITEMS = [
    { id: 1, name: '红盘', price: 10, count: 0, color: '#E60012' }, // 寿司郎主打红盘，经典三文鱼、吞拿鱼等
    { id: 2, name: '银盘', price: 15, count: 0, color: '#C0C0C0' }, // 银盘，特选赤虾、大脂等品质款
    { id: 3, name: '金盘', price: 20, count: 0, color: '#FFD700' }, // 金盘，奢华星鳗、海胆海苔包等
    { id: 4, name: '黑盘', price: 28, count: 0, color: '#1A1A1A' }  // 黑盘，顶级限定食材
];

// 精选好看的寿司盘颜色库，用于随机添加新行（保证配色和谐有品牌感）
const BEAUTIFUL_COLORS = [
    '#E60012', // 寿司郎大红
    '#FFC000', // 蛋玉黄
    '#C0C0C0', // 银盘灰
    '#FF9500', // 甜橙黄
    '#1A1A1A', // 海苔黑
    '#4CD964', // 芥末绿
    '#FF2D55', // 樱花粉
    '#5AC8FA'  // 晴空蓝
];

// 全局状态管理
let state = {
    items: [],      // 当前盘子数据列表
    theme: 'ios7'   // 当前启用的视觉主题，默认为 iOS 7
};

// 页面加载初始化函数
function init() {
    // 1. 加载并应用本地保存的主题
    const savedTheme = localStorage.getItem('sushi_theme');
    if (savedTheme) {
        state.theme = savedTheme;
    }
    setTheme(state.theme);

    // 2. 加载本地保存的数据，若无则使用默认的寿司郎配置
    const savedData = localStorage.getItem('sushi_items');
    if (savedData) {
        state.items = JSON.parse(savedData);
    } else {
        state.items = JSON.parse(JSON.stringify(DEFAULT_ITEMS));
    }

    // 3. 执行首次渲染和小计/总计计算
    renderList();
    updateTotal();
}

// 渲染列表区域的 HTML
function renderList() {
    const container = document.getElementById('list-container');
    container.innerHTML = ''; // 清空容器

    // 遍历当前所有盘子数据，并生成对应的 HTML 行
    state.items.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'row-item';
        
        // 设置侧边盘子颜色的 CSS 变量
        row.style.setProperty('--row-color', item.color || '#ccc');

        // 动态注入行 HTML 结构（输入框、计数按钮、小计、删除按钮）
        row.innerHTML = `
            <input type="text" class="input-name" value="${item.name}" onchange="updateItem(${index}, 'name', this.value)">
            <input type="number" class="input-price" value="${item.price}" onchange="updateItem(${index}, 'price', this.value)">
            
            <div class="qty-control">
                <button class="btn-minus" onclick="changeQty(${index}, -1)">-</button>
                <input type="number" class="input-qty" value="${item.count}" readonly>
                <button class="btn-plus" onclick="changeQty(${index}, 1)">+</button>
            </div>
            
            <div class="row-total">¥${item.price * item.count}</div>
            <button class="btn-delete" onclick="deleteRow(${index})">×</button>
        `;
        container.appendChild(row);
    });
}

// 更新某一行盘子的属性（名称或价格）
function updateItem(index, field, value) {
    if (field === 'price') {
        value = parseFloat(value) || 0; // 确保价格是有效数字
    }
    state.items[index][field] = value;
    saveState();      // 保存至 LocalStorage
    renderList();     // 重新渲染以更新小计金额显示
    updateTotal();    // 重新计算并更新底部总金额
}

// 增加或减少指定盘子的数量
function changeQty(index, delta) {
    let newCount = state.items[index].count + delta;
    if (newCount < 0) newCount = 0; // 数量不可为负数
    state.items[index].count = newCount;
    saveState();
    renderList();
    updateTotal();
}

// 新增一行自定义寿司盘
function addRow() {
    const newId = Date.now();
    // 从我们准备好的好看颜色库中随机挑选一个颜色
    const randomColor = BEAUTIFUL_COLORS[Math.floor(Math.random() * BEAUTIFUL_COLORS.length)];
    
    state.items.push({
        id: newId,
        name: '新盘子',
        price: 0,
        count: 0,
        color: randomColor
    });
    saveState();
    renderList();
}

// 删除某一行盘子
function deleteRow(index) {
    if (confirm('确定要删除这一个盘子分类吗？')) {
        state.items.splice(index, 1);
        saveState();
        renderList();
        updateTotal();
    }
}

// 计算并显示底部总账单金额
function updateTotal() {
    const total = state.items.reduce((sum, item) => sum + (item.price * item.count), 0);
    document.getElementById('grand-total').textContent = `¥${total}`;
}

// 切换并保存视觉主题
function setTheme(themeName) {
    document.body.className = `theme-${themeName}`;
    state.theme = themeName;
    localStorage.setItem('sushi_theme', themeName);
}

// 重置所有数量（恢复至默认的寿司郎经典彩盘状态）
function resetAll() {
    if (confirm('确定要重置所有数据吗？这将恢复到默认的寿司郎经典盘组合。')) {
        state.items = JSON.parse(JSON.stringify(DEFAULT_ITEMS));
        saveState();
        renderList();
        updateTotal();
    }
}

// 将当前状态序列化保存至浏览器的 LocalStorage
function saveState() {
    localStorage.setItem('sushi_items', JSON.stringify(state.items));
}

// 启动计数器应用
init();
