// ==========================================================
// 寿司计数器纯业务核心
// ==========================================================

// 应用版本与静态资源修订号分开管理：普通修复不抬高 SemVer，资源修订号负责击穿旧缓存。
export const APP_VERSION = '3.0.2';
export const ASSET_REVISION = '3.0.2-r7';
export const STATE_SCHEMA_VERSION = 1;

// 业务上限用于拦截误输入和被篡改的本地数据，确保总额始终处于 JavaScript 的安全计算范围内。
export const MAX_PRICE = 999999;
export const MAX_COUNT = 9999;
export const MAX_CUSTOM_ITEMS = 100;
export const MAX_CUSTOM_NAME_LENGTH = 40;

// 新版状态使用单个 JSON 键原子写入；旧键仅用于无损迁移既有用户数据。
export const STORAGE_KEY = 'sushi_state_v1';
export const LEGACY_STORAGE_KEYS = Object.freeze({
    teaPrice: 'sushi_tea_price',
    dineCount: 'sushi_dine_count',
    classicPlates: 'sushi_classic_plates',
    customItems: 'sushi_custom_items'
});
export const ALL_STORAGE_KEYS = Object.freeze([
    STORAGE_KEY,
    ...Object.values(LEGACY_STORAGE_KEYS)
]);

// 五种经典盘的名称、默认单价和展示颜色均属于固定业务配置，不接受本地数据覆盖。
export const DEFAULT_CLASSIC_PLATES = Object.freeze({
    white: Object.freeze({ name: '白盘', price: 8, count: 0, color: '#FFFFFF' }),
    red: Object.freeze({ name: '红盘', price: 10, count: 0, color: '#E60012' }),
    silver: Object.freeze({ name: '银盘', price: 15, count: 0, color: '#E5E5E7' }),
    gold: Object.freeze({ name: '金盘', price: 20, count: 0, color: '#FFC000' }),
    black: Object.freeze({ name: '黑盘', price: 28, count: 0, color: '#1A1A1A' })
});

// 自定义餐品只允许使用内置色板，避免异常 CSS 字符串进入页面样式。
export const ROW_COLORS = Object.freeze([
    '#E60012',
    '#FFC000',
    '#65A30D',
    '#0284C7',
    '#DB2777',
    '#7C3AED',
    '#6B7280',
    '#EA580C'
]);

/**
 * 将 JSON 文本转换为普通数据。解析失败只影响当前字段，不会连带清空其它有效数据。
 * @param {unknown} value 可能是 JSON 文本，也可能已经是对象
 * @returns {unknown|null} 解析后的值；非法 JSON 返回 null
 */
function parseStoredValue(value) {
    if (typeof value !== 'string') {
        return value ?? null;
    }

    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

/**
 * 严格读取数值，拒绝将“12abc”之类的半截文本误判为合法金额。
 * @param {unknown} value 原始值
 * @returns {number} 合法数字或 NaN
 */
function toStrictNumber(value) {
    if (typeof value === 'number') {
        return value;
    }

    if (typeof value !== 'string' || value.trim() === '') {
        return Number.NaN;
    }

    return Number(value);
}

/**
 * 创建互不共享引用的经典盘默认状态，避免一次修改污染后续重置结果。
 * @returns {Record<string, {name: string, price: number, count: number, color: string}>} 默认经典盘状态
 */
export function createDefaultClassicPlates() {
    return Object.fromEntries(
        Object.entries(DEFAULT_CLASSIC_PLATES).map(([key, item]) => [key, { ...item }])
    );
}

/**
 * 创建完整默认状态。
 * @returns {{classicPlates: Object, customItems: Array, teaPrice: number, dineCount: number}} 默认状态
 */
export function createDefaultState() {
    return {
        classicPlates: createDefaultClassicPlates(),
        customItems: [],
        teaPrice: 5,
        dineCount: 1
    };
}

/**
 * 将任意输入清洗为合法价格。
 * @param {unknown} value 用户输入或本地存储值
 * @param {number} fallback 无法解析时使用的兜底价格
 * @returns {number} 0 到 MAX_PRICE 之间的价格
 */
export function sanitizePrice(value, fallback = 0) {
    const parsedFallback = toStrictNumber(fallback);
    const safeFallback = Number.isFinite(parsedFallback) && parsedFallback >= 0
        ? Math.min(parsedFallback, MAX_PRICE)
        : 0;
    const price = toStrictNumber(value);

    if (!Number.isFinite(price) || price < 0) {
        return safeFallback;
    }

    return Math.min(price, MAX_PRICE);
}

/**
 * 将任意输入清洗为合法整数数量，小数统一向零取整。
 * @param {unknown} value 用户输入或本地存储值
 * @param {number} fallback 无法解析时使用的兜底数量
 * @returns {number} 0 到 MAX_COUNT 之间的整数
 */
export function sanitizeCount(value, fallback = 0) {
    const parsedFallback = toStrictNumber(fallback);
    const safeFallback = Number.isFinite(parsedFallback) && parsedFallback >= 0
        ? Math.min(Math.trunc(parsedFallback), MAX_COUNT)
        : 0;
    const count = toStrictNumber(value);

    if (!Number.isFinite(count) || count < 0) {
        return safeFallback;
    }

    return Math.min(Math.trunc(count), MAX_COUNT);
}

/**
 * 清洗就餐人数并保证最少为 1 人，从源头避免人均金额除以零。
 * @param {unknown} value 原始人数
 * @param {number} fallback 非法时的兜底人数
 * @returns {number} 1 到 MAX_COUNT 之间的整数人数
 */
export function sanitizeDineCount(value, fallback = 1) {
    return Math.max(1, sanitizeCount(value, fallback));
}

/**
 * 清洗自定义餐品名称。按 Unicode 字符截断，避免在表情符号中间截出损坏字符。
 * @param {unknown} value 原始名称
 * @returns {string} 非空且不超过上限的名称
 */
export function sanitizeCustomName(value) {
    const normalizedName = String(value ?? '').trim() || '自定义餐点';
    return Array.from(normalizedName).slice(0, MAX_CUSTOM_NAME_LENGTH).join('');
}

/**
 * 清洗自定义行颜色，只接受内置色板值。
 * @param {unknown} color 原始颜色
 * @param {number} index 行序号，用于生成稳定兜底颜色
 * @returns {string} 合法色板值
 */
export function sanitizeRowColor(color, index) {
    if (ROW_COLORS.includes(color)) {
        return color;
    }

    return ROW_COLORS[sanitizeCount(index, 0) % ROW_COLORS.length];
}

/**
 * 返回颜色在固定色板中的位置，页面据此使用预定义 CSS 类，不拼接任意样式文本。
 * @param {unknown} color 原始颜色
 * @param {number} index 行序号
 * @returns {number} 0 到 ROW_COLORS.length - 1 的索引
 */
export function getRowColorIndex(color, index) {
    return ROW_COLORS.indexOf(sanitizeRowColor(color, index));
}

/**
 * 恢复经典盘状态。缺字段、旧数组格式和损坏 JSON 均独立回退为默认配置。
 * @param {unknown} savedValue 已保存的经典盘数据
 * @returns {Object} 清洗后的经典盘状态
 */
export function restoreClassicPlates(savedValue) {
    const restoredPlates = createDefaultClassicPlates();
    const parsedValue = parseStoredValue(savedValue);

    if (!parsedValue || Array.isArray(parsedValue) || typeof parsedValue !== 'object') {
        return restoredPlates;
    }

    Object.keys(DEFAULT_CLASSIC_PLATES).forEach(color => {
        const defaultItem = DEFAULT_CLASSIC_PLATES[color];
        const savedItem = parsedValue[color];

        if (!savedItem || typeof savedItem !== 'object' || Array.isArray(savedItem)) {
            return;
        }

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
 * 恢复自定义餐品，限制总行数并逐字段清洗。
 * @param {unknown} savedValue 已保存的自定义餐品数据
 * @returns {Array<{name: string, price: number, count: number, color: string}>} 合法餐品数组
 */
export function restoreCustomItems(savedValue) {
    const parsedValue = parseStoredValue(savedValue);
    if (!Array.isArray(parsedValue)) {
        return [];
    }

    return parsedValue
        .slice(0, MAX_CUSTOM_ITEMS)
        .filter(item => item && typeof item === 'object' && !Array.isArray(item))
        .map((item, index) => ({
            name: sanitizeCustomName(item.name),
            price: sanitizePrice(item.price, 0),
            count: sanitizeCount(item.count, 0),
            color: sanitizeRowColor(item.color, index)
        }));
}

/**
 * 统一清洗完整状态对象，供读取、保存和测试共同使用。
 * @param {unknown} candidate 待清洗状态
 * @returns {{classicPlates: Object, customItems: Array, teaPrice: number, dineCount: number}} 合法状态
 */
export function normalizeState(candidate) {
    const source = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
        ? candidate
        : {};

    return {
        classicPlates: restoreClassicPlates(source.classicPlates),
        customItems: restoreCustomItems(source.customItems),
        teaPrice: source.teaPrice == null ? 5 : sanitizePrice(source.teaPrice, 5),
        dineCount: source.dineCount == null ? 1 : sanitizeDineCount(source.dineCount, 1)
    };
}

/**
 * 从新版单键状态或四个旧键恢复数据。新版状态有效时优先使用，否则自动回退旧数据。
 * @param {{current?: unknown, teaPrice?: unknown, dineCount?: unknown, classicPlates?: unknown, customItems?: unknown}} snapshot 存储快照
 * @returns {{classicPlates: Object, customItems: Array, teaPrice: number, dineCount: number}} 恢复后的状态
 */
export function restoreState(snapshot = {}) {
    const currentState = parseStoredValue(snapshot.current);
    if (
        currentState
        && typeof currentState === 'object'
        && !Array.isArray(currentState)
        && currentState.schemaVersion === STATE_SCHEMA_VERSION
    ) {
        return normalizeState(currentState);
    }

    return normalizeState({
        teaPrice: snapshot.teaPrice,
        dineCount: snapshot.dineCount,
        classicPlates: snapshot.classicPlates,
        customItems: snapshot.customItems
    });
}

/**
 * 将状态编码为单个带架构版本的 JSON 文本，保证一次写入即可得到完整账单快照。
 * @param {unknown} currentState 当前状态
 * @returns {string} 可写入 LocalStorage 的 JSON 文本
 */
export function serializeState(currentState) {
    const normalizedState = normalizeState(currentState);
    return JSON.stringify({
        schemaVersion: STATE_SCHEMA_VERSION,
        ...normalizedState
    });
}

/**
 * 计算经典盘、自定义餐品、茶位费、总额及人均金额。
 * @param {unknown} currentState 当前状态
 * @returns {{classicTotal: number, customTotal: number, teaTotal: number, grandTotal: number, averageTotal: number}} 各项金额
 */
export function calculateTotals(currentState) {
    const source = currentState && typeof currentState === 'object' && !Array.isArray(currentState)
        ? currentState
        : {};

    // 高频计算只读取金额相关字段，不复制名称和颜色，避免 100 行列表每次点击产生整表临时对象。
    const classicSource = source.classicPlates && typeof source.classicPlates === 'object'
        ? source.classicPlates
        : {};
    const classicTotal = Object.entries(DEFAULT_CLASSIC_PLATES).reduce((sum, [color, defaultItem]) => {
        const item = classicSource[color] && typeof classicSource[color] === 'object'
            ? classicSource[color]
            : defaultItem;
        return sum + (
            sanitizePrice(item.price, defaultItem.price)
            * sanitizeCount(item.count, defaultItem.count)
        );
    }, 0);

    const customItems = Array.isArray(source.customItems)
        ? source.customItems.slice(0, MAX_CUSTOM_ITEMS)
        : [];
    const customTotal = customItems.reduce((sum, item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return sum;
        }
        return sum + (sanitizePrice(item.price, 0) * sanitizeCount(item.count, 0));
    }, 0);

    const safeTeaPrice = source.teaPrice == null ? 5 : sanitizePrice(source.teaPrice, 5);
    const safeDineCount = source.dineCount == null ? 1 : sanitizeDineCount(source.dineCount, 1);
    const teaTotal = safeTeaPrice * safeDineCount;
    const grandTotal = classicTotal + customTotal + teaTotal;

    return {
        classicTotal,
        customTotal,
        teaTotal,
        grandTotal,
        averageTotal: grandTotal / safeDineCount
    };
}

/**
 * 统一将金额格式化为一位小数，异常值显示为 0.0。
 * @param {unknown} amount 待显示金额
 * @returns {string} 金额文本
 */
export function formatMoney(amount) {
    const parsedAmount = toStrictNumber(amount);
    return (Number.isFinite(parsedAmount) ? parsedAmount : 0).toFixed(1);
}
