import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { APP_VERSION, ASSET_REVISION } from '../core.js';

const [html, serviceWorker, packageManifest] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../sw.js', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse)
]);

test('应用版本、资源指纹和缓存清单保持一致', () => {
    assert.equal(packageManifest.version, APP_VERSION);
    assert.match(html, new RegExp(`<title>寿司计数器 v${APP_VERSION.replaceAll('.', '\\.')}<\\/title>`));
    assert.equal(html.includes(`style.css?v=${ASSET_REVISION}`), true);
    assert.equal(html.includes(`script.js?v=${ASSET_REVISION}`), true);
    assert.equal(serviceWorker.includes(`const ASSET_REVISION = '${ASSET_REVISION}'`), true);
    assert.equal(serviceWorker.includes('`./core.js?v=${ASSET_REVISION}`'), true);
});

test('严格内容安全策略下不保留内联事件或内联样式', () => {
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
    assert.doesNotMatch(html, /\sstyle\s*=/i);
    assert.match(html, /Content-Security-Policy/);
});

test('页面允许缩放，并为每个按钮声明明确类型', () => {
    assert.doesNotMatch(html, /user-scalable\s*=\s*no/i);
    assert.doesNotMatch(html, /maximum-scale/i);

    const openingButtonTags = html.match(/<button\b[^>]*>/gi) ?? [];
    assert.ok(openingButtonTags.length > 0);
    openingButtonTags.forEach(buttonTag => {
        assert.match(buttonTag, /\stype="button"/i);
        assert.match(buttonTag, /\saria-label="[^"]+"/i);
    });
});
