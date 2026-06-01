// ==========================================================
// 🍣 寿司计数器 PWA Service Worker 离线缓存控制脚本 (sw.js)
// ==========================================================

const CACHE_NAME = 'sushi-counter-cache-v3';

// 预缓存核心静态资源，保障无网络环境下依然 0.1 秒离线秒开！
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css?v=2.2', // 双重保险：加上版本指纹，防止 Service Worker 级联读取旧 CSS 缓存
    './script.js',
    './manifest.json',
    './icon.svg'
];

// 1. 监听安装事件，将静态资源写入 Cache Storage
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Service Worker] 正在预缓存核心资源...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting()) // 强行跳过等待，立即接管
    );
});

// 2. 监听激活事件，清理废弃的旧版本缓存
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(name => {
                    if (name !== CACHE_NAME) {
                        console.log('[Service Worker] 清理废弃的旧缓存:', name);
                        return caches.delete(name);
                    }
                })
            );
        }).then(() => self.clients.claim()) // 立即控制所有客户端页面
    );
});

// 3. 监听网络请求事件，执行“缓存优先，网络回退”的加载策略
self.addEventListener('fetch', event => {
    // 仅拦截同源 GET 请求，防止意外干扰其它第三方请求
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // 如果在本地缓存里找到了资源，直接秒回！这才是离线能开的秘密
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                // 缓存里没找到，就联网去请求
                return fetch(event.request).then(response => {
                    // 如果请求失败，直接返回错误
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    
                    // 动态将新请求成功的资源克隆并存入缓存中，以便下次离线使用
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                    
                    return response;
                }).catch(() => {
                    // 彻底断网且没有缓存时的优雅兜底
                    console.log('[Service Worker] 彻底断网且未命中缓存：', event.request.url);
                });
            })
    );
});
