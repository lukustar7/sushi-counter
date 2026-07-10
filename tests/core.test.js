import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MAX_COUNT,
    MAX_CUSTOM_ITEMS,
    MAX_PRICE,
    ROW_COLORS,
    calculateTotals,
    createDefaultState,
    formatMoney,
    restoreState,
    sanitizeCount,
    sanitizeCustomName,
    sanitizeDineCount,
    sanitizePrice,
    serializeState
} from '../core.js';

test('默认状态每次创建都互不影响', () => {
    const firstState = createDefaultState();
    const secondState = createDefaultState();

    firstState.classicPlates.white.count = 8;
    firstState.customItems.push({ name: '测试', price: 1, count: 1, color: ROW_COLORS[0] });

    assert.equal(secondState.classicPlates.white.count, 0);
    assert.deepEqual(secondState.customItems, []);
});

test('价格清洗拒绝空值、负数、半截数字和无限值', () => {
    assert.equal(sanitizePrice('', 5), 5);
    assert.equal(sanitizePrice('-1', 5), 5);
    assert.equal(sanitizePrice('12abc', 5), 5);
    assert.equal(sanitizePrice('Infinity', 5), 5);
    assert.equal(sanitizePrice('12.5', 5), 12.5);
    assert.equal(sanitizePrice(MAX_PRICE + 1, 5), MAX_PRICE);
});

test('数量清洗会取整、限制上下界并确保就餐人数不为零', () => {
    assert.equal(sanitizeCount('3.9'), 3);
    assert.equal(sanitizeCount('-1', 7), 7);
    assert.equal(sanitizeCount(MAX_COUNT + 1), MAX_COUNT);
    assert.equal(sanitizeDineCount(0), 1);
    assert.equal(sanitizeDineCount('not-a-number', 2), 2);
});

test('损坏的新版状态会回退旧键，且不同字段互不连带清空', () => {
    const restoredState = restoreState({
        current: '{broken-json',
        teaPrice: '7.5',
        dineCount: '3',
        classicPlates: JSON.stringify({
            white: { price: 9, count: 2 },
            red: { price: -10, count: 4 }
        }),
        customItems: JSON.stringify([
            { name: '<script>不可执行</script>', price: 12, count: 2, color: '#000000' }
        ])
    });

    assert.equal(restoredState.teaPrice, 7.5);
    assert.equal(restoredState.dineCount, 3);
    assert.equal(restoredState.classicPlates.white.price, 9);
    assert.equal(restoredState.classicPlates.red.price, 10);
    assert.equal(restoredState.customItems[0].name, '<script>不可执行</script>');
    assert.equal(restoredState.customItems[0].color, ROW_COLORS[0]);
});

test('自定义餐品恢复时限制为 100 行并截断超长 Unicode 名称', () => {
    const oversizedItems = Array.from({ length: MAX_CUSTOM_ITEMS + 25 }, (_, index) => ({
        name: `${'寿司🍣'.repeat(30)}${index}`,
        price: index,
        count: 1,
        color: ROW_COLORS[index % ROW_COLORS.length]
    }));
    const restoredState = restoreState({ customItems: JSON.stringify(oversizedItems) });

    assert.equal(restoredState.customItems.length, MAX_CUSTOM_ITEMS);
    assert.equal(Array.from(restoredState.customItems[0].name).length, 40);
    assert.equal(Array.from(sanitizeCustomName('🍣'.repeat(50))).length, 40);
});

test('单键序列化可以完整往返并带回合法状态', () => {
    const state = createDefaultState();
    state.teaPrice = 6;
    state.dineCount = 2;
    state.classicPlates.gold.count = 3;
    state.customItems.push({ name: '乌冬面', price: 18, count: 1, color: ROW_COLORS[2] });

    const restoredState = restoreState({ current: serializeState(state) });
    assert.deepEqual(restoredState, state);
});

test('账单计算同时覆盖经典盘、自定义餐品、茶位费和人均金额', () => {
    const state = createDefaultState();
    state.teaPrice = 5;
    state.dineCount = 2;
    state.classicPlates.white.count = 2;
    state.classicPlates.black.count = 1;
    state.customItems.push({ name: '拉面', price: 20, count: 2, color: ROW_COLORS[0] });

    assert.deepEqual(calculateTotals(state), {
        classicTotal: 44,
        customTotal: 40,
        teaTotal: 10,
        grandTotal: 94,
        averageTotal: 47
    });
    assert.equal(formatMoney(94), '94.0');
});

test('全部字段达到上限时总额仍是有限且可格式化的数字', () => {
    const state = createDefaultState();
    state.teaPrice = MAX_PRICE;
    state.dineCount = MAX_COUNT;
    Object.values(state.classicPlates).forEach(item => {
        item.price = MAX_PRICE;
        item.count = MAX_COUNT;
    });
    state.customItems = Array.from({ length: MAX_CUSTOM_ITEMS }, (_, index) => ({
        name: `餐品 ${index + 1}`,
        price: MAX_PRICE,
        count: MAX_COUNT,
        color: ROW_COLORS[index % ROW_COLORS.length]
    }));

    const totals = calculateTotals(state);
    assert.equal(Number.isFinite(totals.grandTotal), true);
    assert.match(formatMoney(totals.grandTotal), /^\d+\.\d$/);
});
