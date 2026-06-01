// ==========================================================
// 🍣 寿司计数器 PWA Service Worker 极速直通穿透版 (sw.js)
// ==========================================================

// 提示：这是开发调试期间的“直通穿透”版本。它不进行本地强缓存，
// 从而彻底避开浏览器缓存延迟，确保您每次在手机或模拟器里刷新，都 100% 看到最新界面！
// 当全部调试满意、准备打包上线时，我们再一键恢复 100% 离线缓存。

const CACHE_NAME = 'sushi-counter-cache-v-temp';

// 1. 安装事件：清除可能残留在 Cache 中的旧文件
self.addEventListener('install', event => {
    self.skipWaiting(); // 强行跳过等待，立即接管并生效
});

// 2. 激活事件：彻底清除浏览器 Cache Storage 里的所有历史缓存
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(name => {
                    console.log('[Service Worker] 终极清理所有历史缓存:', name);
                    return caches.delete(name);
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. 拦截请求事件：100% 直通网络，不做任何本地拦截，确保页面实时拉取最新 CSS
self.addEventListener('fetch', event => {
    // 直通网络，绝不拦截！
    return;
});
