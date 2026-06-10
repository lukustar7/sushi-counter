// ==========================================================
// 🍣 寿司计数器 PWA Service Worker 核心拦截缓存脚本 (sw.js)
// ==========================================================

// 每次大版本更新时升级缓存版本名称，强迫所有浏览器清空历史缓存并重新拉取
const CACHE_NAME = 'sushi-counter-cache-v3.0.0';

// 预缓存核心静态资源，保障在无网络信号（如地下室门店）环境下依然可以 0.1 秒秒开
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css?v=3.0.0', // 绑定 3.0.0 版本指纹，确保样式最新
    './script.js',
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
 * 2. 监听 Service Worker 激活事件 (Activate)
 * 遍历已有的 Cache 库，强力清理并删除所有过期的历史版本旧缓存，释放存储空间
 */
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(name => {
                    if (name !== CACHE_NAME) {
                        console.log('[Service Worker] 终极清理废弃的旧版缓存:', name);
                        return caches.delete(name);
                    }
                })
            );
        }).then(() => self.clients.claim()) // 立即取得对所有客户端页面的控制
    );
});

/**
 * 3. 监听网络拦截事件 (Fetch)
 * 采用“缓存优先，网络回退 (Cache First, Network Fallback)”策略，拦截同源 GET 请求，
 * 实现脱网状态下的 100% 离线秒开体验，并动态将联网请求成功的新资源存入缓存。
 */
self.addEventListener('fetch', event => {
    // 仅拦截本站同源的 GET 请求，防止意外干扰其它第三方外部服务
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // 如果在本地 Cache Storage 中命中了缓存，直接立即返回，实现 0.1 秒离线秒开
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                // 缓存未命中，则发起真实的网络抓取
                return fetch(event.request).then(response => {
                    // 若请求不成功，直接将原始响应返回给页面
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    
                    // 联网获取成功后，克隆一份响应并动态存入缓存，以便下次离线使用
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                    
                    return response;
                }).catch(() => {
                    // 彻底断网且没有缓存命中时的安全兜底
                    console.log('[Service Worker] 彻底断网且未命中本地缓存：', event.request.url);
                });
            })
    );
});
