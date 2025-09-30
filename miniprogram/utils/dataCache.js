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

  // 头像缓存相关方法
  setAvatarCache(userId, avatarData) {
    const key = `avatar_${userId}`;
    // 头像缓存24小时
    return this.set(key, avatarData, 24 * 60 * 60 * 1000);
  }

  getAvatarCache(userId) {
    const key = `avatar_${userId}`;
    return this.get(key);
  }

  // 关注状态缓存相关方法
  setFollowStatusCache(currentUserId, targetUserId, followData) {
    const key = `follow_${currentUserId}_${targetUserId}`;
    // 关注状态缓存1小时
    return this.set(key, followData, 60 * 60 * 1000);
  }

  getFollowStatusCache(currentUserId, targetUserId) {
    const key = `follow_${currentUserId}_${targetUserId}`;
    return this.get(key);
  }

  // 批量获取用户头像缓存
  getBatchAvatarCache(userIds) {
    const results = {};
    userIds.forEach(userId => {
      const cached = this.getAvatarCache(userId);
      if (cached) {
        results[userId] = cached;
      }
    });
    return results;
  }

  // 批量获取关注状态缓存
  getBatchFollowStatusCache(currentUserId, targetUserIds) {
    const results = {};
    targetUserIds.forEach(targetUserId => {
      const cached = this.getFollowStatusCache(currentUserId, targetUserId);
      if (cached) {
        results[targetUserId] = cached;
      }
    });
    return results;
  }

  // 清理特定用户的缓存
  clearUserCache(userId) {
    try {
      // 清理该用户的头像缓存
      this.remove(`avatar_${userId}`);
      
      // 清理所有与该用户相关的关注状态缓存
      const keys = wx.getStorageInfoSync().keys;
      keys.forEach(key => {
        if (key.startsWith(`follow_`) && key.includes(`_${userId}`)) {
          this.remove(key);
        }
      });
      return true;
    } catch (e) {
      console.error('清理用户缓存失败:', e);
      return false;
    }
  }

  // 更新帖子缓存中的点赞信息
  updatePostLikeInCache(postId, votes, isVoted, likeIcon) {
    try {
      const cacheKeys = ['index_postList_cache', 'poem_postList_cache', 'mountain_postList_cache'];
      
      cacheKeys.forEach(cacheKey => {
        const cachedData = this.get(cacheKey);
        if (cachedData && Array.isArray(cachedData)) {
          const postIndex = cachedData.findIndex(p => p._id === postId);
          if (postIndex > -1) {
            cachedData[postIndex].votes = votes;
            cachedData[postIndex].isVoted = isVoted;
            cachedData[postIndex].likeIcon = likeIcon;
            // 重新设置缓存
            this.set(cacheKey, cachedData);
            console.log(`【缓存更新】${cacheKey} 中的帖子 ${postId} 点赞信息已更新`);
          }
        }
      });
      return true;
    } catch (e) {
      console.error('更新帖子点赞缓存失败:', e);
      return false;
    }
  }
}

// 创建单例
const dataCache = new DataCache();

module.exports = dataCache;
