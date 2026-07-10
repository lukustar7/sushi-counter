// ==========================================================
// 寿司计数器离线缓存控制
// ==========================================================

// 修订号独立于 SemVer；静态文件发生变化时升级修订号即可淘汰旧缓存。
const ASSET_REVISION = '3.0.2-r7';
const CACHE_PREFIX = 'sushi-counter-cache-';
const CACHE_NAME = `${CACHE_PREFIX}${ASSET_REVISION}`;

// 查询参数与页面引用保持一致，确保预缓存命中的就是当前发布资源。
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    `./style.css?v=${ASSET_REVISION}`,
    `./core.js?v=${ASSET_REVISION}`,
    `./script.js?v=${ASSET_REVISION}`,
    './manifest.json',
    './icon.svg'
];

/**
 * 安装时完整预缓存核心文件；任何一个文件缺失都会让本次安装失败，避免产生残缺离线包。
 */
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS_TO_CACHE))
            .then(() => self.skipWaiting())
    );
});

/**
 * 激活时只删除本应用旧修订缓存，不触碰同源下其它项目的缓存。
 */
self.addEventListener('activate', event => {
    event.waitUntil(activateCurrentWorker());
});

/**
 * 清理旧缓存并接管页面。刷新动作由页面的 controllerchange 监听器执行，避免 Worker 强制导航多个窗口。
 * @returns {Promise<void>} 激活完成信号
 */
async function activateCurrentWorker() {
    const cacheNames = await caches.keys();
    const outdatedCaches = cacheNames.filter(name => {
        return name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME;
    });

    await Promise.all(outdatedCaches.map(name => caches.delete(name)));
    await self.clients.claim();
}

/**
 * HTML 使用联网优先以获得最新入口，其它同源静态资源使用缓存优先保证离线速度。
 */
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);
    if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) {
        return;
    }

    const acceptsHtml = event.request.headers.get('accept')?.includes('text/html');
    if (event.request.mode === 'navigate' || acceptsHtml) {
        event.respondWith(networkFirst(event.request));
        return;
    }

    event.respondWith(cacheFirst(event.request));
});

/**
 * 页面请求优先绕过 HTTP 缓存访问网络，失败时依次回退精确缓存和应用首页。
 * @param {Request} request 页面请求
 * @returns {Promise<Response>} 可用响应
 */
async function networkFirst(request) {
    try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response && response.status === 200 && response.type === 'basic') {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
        }
        return response;
    } catch {
        const exactResponse = await caches.match(request);
        if (exactResponse) {
            return exactResponse;
        }

        const indexResponse = await caches.match('./index.html');
        return indexResponse || new Response(
            '当前离线且本地缓存尚未建立，请联网打开一次寿司计数器。',
            { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
        );
    }
}

/**
 * 静态资源优先读取缓存，未命中时联网获取并在返回前完成缓存写入。
 * @param {Request} request 静态资源请求
 * @returns {Promise<Response>} 可用响应
 */
async function cacheFirst(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }

    const response = await fetch(request);
    if (response && response.status === 200 && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
    }
    return response;
}
