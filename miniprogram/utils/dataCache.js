// 数据缓存工具
class DataCache {
  constructor() {
    this.defaultExpiry = 5 * 60 * 1000; // 5分钟默认过期时间
  }

  // 设置缓存
  set(key, data, expiry = this.defaultExpiry) {
    try {
      const cacheData = {
        data: data,
        timestamp: Date.now(),
        expiry: expiry
      };
      wx.setStorageSync(key, cacheData);
      return true;
    } catch (e) {
      console.error('缓存设置失败:', e);
      return false;
    }
  }

  // 获取缓存
  get(key) {
    try {
      const cacheData = wx.getStorageSync(key);
      if (!cacheData) return null;

      const now = Date.now();
      if (now - cacheData.timestamp > cacheData.expiry) {
        // 缓存过期，删除
        this.remove(key);
        return null;
      }

      return cacheData.data;
    } catch (e) {
      console.error('缓存获取失败:', e);
      return null;
    }
  }

  // 删除缓存
  remove(key) {
    try {
      wx.removeStorageSync(key);
      return true;
    } catch (e) {
      console.error('缓存删除失败:', e);
      return false;
    }
  }

  // 检查缓存是否存在且未过期
  has(key) {
    return this.get(key) !== null;
  }

  // 清理所有缓存
  clear() {
    try {
      const keys = ['index_postList_cache', 'poem_postList_cache', 'mountain_postList_cache'];
      keys.forEach(key => this.remove(key));
      return true;
    } catch (e) {
      console.error('缓存清理失败:', e);
      return false;
    }
  }
}

// 创建单例
const dataCache = new DataCache();

module.exports = dataCache;
