// ==========================================================
// 寿司计数器 PWA Service Worker 核心拦截缓存脚本 (sw.js)
// ==========================================================

// 每次发布静态资源更新时升级缓存版本名称，确保浏览器能拉取最新文件。
const CACHE_PREFIX = 'sushi-counter-cache-';
const CACHE_NAME = `${CACHE_PREFIX}v3.0.2`;

// 预缓存核心静态资源，保障无网络环境下仍可打开基础页面。
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css?v=3.0.2',
    './script.js?v=3.0.2',
    './manifest.json',
    './icon.svg'
];

/**
 * 1. 监听 Service Worker 安装事件 (Install)
 * 执行静态资源预缓存，并强行跳过等待阶段，立即接管控制权
 */
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Service Worker] 正在预缓存核心资源清单...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting()) // 强行跳过等待阶段，立即生效
    );
});

/**
 * 2. 监听 Service Worker 激活事件 (Activate)。
 * 只清理本应用创建的旧缓存，避免误删同源下其它本地项目的 Cache Storage。
 */
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(name => {
                    if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) {
                        console.log('[Service Worker] 清理寿司计数器旧版缓存:', name);
                        return caches.delete(name);
                    }
                    return undefined;
                })
            );
        }).then(() => self.clients.claim()) // 立即取得对所有客户端页面的控制
    );
});

/**
 * 3. 监听网络拦截事件 (Fetch)。
 * HTML 页面使用“联网优先，断网回缓存”，防止旧首页长期锁住新版本入口。
 * CSS/JS/图标等静态文件继续使用“缓存优先，联网回退”，保证离线启动速度。
 */
self.addEventListener('fetch', event => {
    // 仅拦截本站同源的 GET 请求，防止意外干扰其它第三方外部服务
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
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
 * HTML 导航请求优先从网络获取，失败时回退到缓存首页。
 * @param {Request} request 页面请求
 * @returns {Promise<Response>} 页面响应
 */
function networkFirst(request) {
    return fetch(request)
        .then(response => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
            }

            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
                cache.put(request, responseToCache);
            });
            return response;
        })
        .catch(() => caches.match(request).then(cachedResponse => {
            return cachedResponse || caches.match('./index.html').then(indexResponse => {
                return indexResponse || new Response('当前离线且本地缓存尚未建立，请联网打开一次寿司计数器。', {
                    status: 503,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            });
        }));
}

/**
 * 静态资源优先从缓存读取，缓存未命中时联网获取并写入缓存。
 * @param {Request} request 静态资源请求
 * @returns {Promise<Response>} 静态资源响应
 */
function cacheFirst(request) {
    return caches.match(request).then(cachedResponse => {
        if (cachedResponse) {
            return cachedResponse;
        }

        return fetch(request).then(response => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
            }

            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
                cache.put(request, responseToCache);
            });
            return response;
        });
    });
}
