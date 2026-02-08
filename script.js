// 默认数据模板
const DEFAULT_ITEMS = [
    { id: 1, name: '项目A', price: 10, count: 0, color: '#FF3B30' },
    { id: 2, name: '项目B', price: 20, count: 0, color: '#FFCC00' },
    { id: 3, name: '项目C', price: 30, count: 0, color: '#007AFF' }
];

// 状态管理
let state = {
    items: [],
    theme: 'ios7' // 默认主题
};

// 初始化
function init() {
    // 1. 加载主题
    const savedTheme = localStorage.getItem('sushi_theme');
    if (savedTheme) {
        state.theme = savedTheme;
    }
    setTheme(state.theme);

    // 2. 加载数据
    const savedData = localStorage.getItem('sushi_items');
    if (savedData) {
        state.items = JSON.parse(savedData);
    } else {
        state.items = JSON.parse(JSON.stringify(DEFAULT_ITEMS));
    }

    renderList();
    updateTotal();
}

// 渲染列表
function renderList() {
    const container = document.getElementById('list-container');
    container.innerHTML = ''; // 清空

    state.items.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'row-item';
        // 设置侧边颜色变量
        row.style.setProperty('--row-color', item.color || '#ccc');

        row.innerHTML = `
            <input type="text" class="input-name" value="${item.name}" onchange="updateItem(${index}, 'name', this.value)">
            <input type="number" class="input-price" value="${item.price}" onchange="updateItem(${index}, 'price', this.value)">
            
            <div class="qty-control">
                <button class="btn-minus" onclick="changeQty(${index}, -1)">-</button>
                <input type="number" class="input-qty" value="${item.count}" readonly> <!-- 暂时只读，通过按钮操作 -->
                <button class="btn-plus" onclick="changeQty(${index}, 1)">+</button>
            </div>
            
            <div class="row-total">¥${item.price * item.count}</div>
            <button class="btn-delete" onclick="deleteRow(${index})">×</button>
        `;
        container.appendChild(row);
    });
}

// 更新单项属性
function updateItem(index, field, value) {
    if (field === 'price') {
        value = parseFloat(value) || 0;
    }
    state.items[index][field] = value;
    saveState();
    renderList(); // 重新渲染以更新小计
    updateTotal();
}

// 增减数量
function changeQty(index, delta) {
    let newCount = state.items[index].count + delta;
    if (newCount < 0) newCount = 0;
    state.items[index].count = newCount;
    saveState();
    renderList();
    updateTotal();
}

// 添加新行
function addRow() {
    const newId = Date.now();
    // 随机一个颜色
    const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16);
    
    state.items.push({
        id: newId,
        name: '新项目',
        price: 0,
        count: 0,
        color: randomColor
    });
    saveState();
    renderList();
}

// 删除行
function deleteRow(index) {
    if (confirm('确定删除这一行吗？')) {
        state.items.splice(index, 1);
        saveState();
        renderList();
        updateTotal();
    }
}

// 计算总计
function updateTotal() {
    const total = state.items.reduce((sum, item) => sum + (item.price * item.count), 0);
    document.getElementById('grand-total').textContent = `¥${total}`;
}

// 切换主题
function setTheme(themeName) {
    document.body.className = `theme-${themeName}`;
    state.theme = themeName;
    localStorage.setItem('sushi_theme', themeName);
}

// 重置所有数量 (保留项目)
function resetAll() {
    if (confirm('确定清空所有计数吗？')) {
        state.items.forEach(item => item.count = 0);
        saveState();
        renderList();
        updateTotal();
    }
}

// 保存到本地存储
function saveState() {
    localStorage.setItem('sushi_items', JSON.stringify(state.items));
}

// 启动
init();
