// 图片优化工具
class ImageOptimizer {
  constructor() {
    this.cache = new Map();
    this.preloadQueue = [];
    this.maxPreloadCount = 3;
  }

  // 预加载图片
  preloadImages(urls, callback) {
    if (!Array.isArray(urls) || urls.length === 0) return;
    
    const urlsToPreload = urls.slice(0, this.maxPreloadCount);
    
    urlsToPreload.forEach((url, index) => {
      if (this.cache.has(url)) {
        callback && callback(url, true);
        return;
      }

      wx.downloadFile({
        url: url,
        success: (res) => {
          if (res.statusCode === 200) {
            this.cache.set(url, res.tempFilePath);
            callback && callback(url, true);
          }
        },
        fail: (err) => {
          console.error('图片预加载失败:', url, err);
          callback && callback(url, false);
        }
      });
    });
  }

  // 获取缓存的图片路径
  getCachedImage(url) {
    return this.cache.get(url) || url;
  }

  // 清理缓存
  clearCache() {
    this.cache.clear();
  }

  // 获取缓存大小
  getCacheSize() {
    return this.cache.size;
  }
}

// 创建单例
const imageOptimizer = new ImageOptimizer();

module.exports = imageOptimizer;
