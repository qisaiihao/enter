// pages/favorite-content/favorite-content.js
Page({
  data: {
    folderId: '',
    folderName: '',
    favorites: [],
    isLoading: true,
    hasMore: true,
    page: 0,
    pageSize: 10,
    swiperHeights: {}, // 每个帖子的swiper高度，跟随第一张图片
    imageClampHeights: {}, // 单图瘦高图钳制高度
  },

  onLoad: function(options) {
    const folderId = options.folderId;
    const folderName = options.folderName || '';

    if (!folderId) {
      wx.showToast({
        title: '参数错误：收藏夹ID为空',
        icon: 'none'
      });
      this.setData({ isLoading: false });
      return;
    }

    // 解码文件夹名称
    let decodedFolderName = folderName;
    try {
      decodedFolderName = decodeURIComponent(folderName || '');
    } catch (e) {
      decodedFolderName = folderName;
    }

    // 重置所有状态，确保可以加载
    this.setData({
      folderId: folderId,
      folderName: decodedFolderName,
      favorites: [],      // 清空数据
      page: 0,            // 重置页码
      hasMore: true,      // 重置加载状态
      isLoading: false    // 重置加载状态
    });
    
    // 设置标题并加载数据
    wx.setNavigationBarTitle({
      title: decodedFolderName || '收藏夹'
    });
    
    this.loadFavorites();
  },

  onShow: function() {
    // 不执行任何操作，避免干扰加载
  },

  onPullDownRefresh: function() {
    this.setData({
      favorites: [],
      page: 0,
      hasMore: true,
      isLoading: false
    });
    this.loadFavorites(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function() {
    if (this.data.hasMore) {
      this.loadFavorites();
    }
  },

  loadFavorites: function(callback) {
    if (!this.data.folderId) {
      this.setData({ isLoading: false });
      return;
    }

    this.setData({ isLoading: true });
    const skip = this.data.page * this.data.pageSize;

    // 设置加载超时机制
    const loadTimeout = setTimeout(() => {
      console.error('加载超时，强制结束加载状态');
      this.setData({ isLoading: false });
      wx.showToast({
        title: '加载超时，请重试',
        icon: 'none'
      });
    }, 10000); // 10秒超时

    // 添加全局错误保护
    try {
      wx.cloud.callFunction({
      name: 'getMyProfileData',
      data: {
        action: 'getFavoritesByFolder',
        folderId: this.data.folderId,
        skip: skip,
        limit: this.data.pageSize
      },
      success: res => {
        clearTimeout(loadTimeout);

        if (res.result && res.result.success) {
          const newFavorites = res.result.favorites || [];

          // 格式化时间
          newFavorites.forEach(favorite => {
            favorite.formattedCreateTime = this.formatTime(favorite.createTime);
            favorite.formattedPostCreateTime = this.formatTime(favorite.postCreateTime);
          });

          const allFavorites = this.data.page === 0 ? newFavorites : this.data.favorites.concat(newFavorites);

          this.setData({
            favorites: allFavorites,
            page: this.data.page + 1,
            hasMore: newFavorites.length === this.data.pageSize,
            isLoading: false
          });
        } else {
          wx.showToast({
            title: res.result?.message || '加载失败',
            icon: 'none'
          });
          this.setData({ isLoading: false });
        }
      },
      fail: err => {
        clearTimeout(loadTimeout);
        wx.showToast({ title: '网络错误', icon: 'none' });
        this.setData({ isLoading: false });
      },
      complete: () => {
        clearTimeout(loadTimeout);
        if (typeof callback === 'function') callback();
      }
    });
    } catch (error) {
      console.error('加载过程发生异常:', error);
      clearTimeout(loadTimeout);
      this.setData({ isLoading: false });
      wx.showToast({
        title: '加载异常，请重试',
        icon: 'none'
      });
      if (typeof callback === 'function') callback();
    }
  },

  // 重新加载
  manualLoad: function() {
    if (!this.data.folderId) {
      wx.showToast({
        title: '收藏夹ID为空',
        icon: 'none'
      });
      return;
    }

    this.setData({
      favorites: [],
      page: 0,
      hasMore: true,
      isLoading: false
    });
    
    this.loadFavorites();
  },

  // 点击收藏项跳转到详情页
  onFavoriteTap: function(e) {
    const postId = e.currentTarget.dataset.postId;
    wx.navigateTo({
      url: `/pages/post-detail/post-detail?id=${postId}`
    });
  },

  // 长按收藏项显示操作选项
  onFavoriteLongPress: function(e) {
    const favoriteId = e.currentTarget.dataset.favoriteId;
    const postTitle = e.currentTarget.dataset.postTitle;
    
    wx.showActionSheet({
      itemList: ['取消收藏'],
      success: res => {
        if (res.tapIndex === 0) {
          this.removeFavorite(favoriteId, postTitle);
        }
      }
    });
  },

  // 取消收藏
  removeFavorite: function(favoriteId, postTitle) {
    wx.showModal({
      title: '确认取消收藏',
      content: `确定要取消收藏"${postTitle}"吗？`,
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });
          wx.cloud.callFunction({
            name: 'getMyProfileData',
            data: { action: 'removeFromFavorite', favoriteId: favoriteId },
            success: res => {
              wx.hideLoading();
              if (res.result && res.result.success) {
                wx.showToast({ title: '取消收藏成功' });
                // 从列表中移除该项
                const favorites = this.data.favorites.filter(item => item._id !== favoriteId);
                this.setData({ favorites: favorites });
              } else {
                wx.showToast({ 
                  title: res.result.message || '操作失败', 
                  icon: 'none' 
                });
              }
            },
            fail: err => {
              wx.hideLoading();
              console.error('取消收藏失败:', err);
              wx.showToast({ title: '网络错误', icon: 'none' });
            }
          });
        }
      }
    });
  },

  // 图片预览
  onImagePreview: function(e) {
    const current = e.currentTarget.dataset.src;
    const urls = e.currentTarget.dataset.urls;
    if (current && urls && urls.length > 0) {
      wx.previewImage({ current, urls });
    }
  },

  // 预览图片（与点赞页面统一）
  handlePreview: function(event) {
    const currentUrl = event.currentTarget.dataset.src;
    const originalUrls = event.currentTarget.dataset.originalImageUrls;
    if (currentUrl) {
      wx.previewImage({
        current: currentUrl,
        urls: originalUrls || [currentUrl]
      });
    } else {
      wx.showToast({ title: '图片加载失败', icon: 'none' });
    }
  },

  // 图片加载错误处理（与点赞页面统一）
  onImageError: function(e) {
    console.error('图片加载失败', e);
    const { src } = e.detail;
    console.error('失败的图片URL:', src);
    // 获取当前图片的上下文信息
    const { postindex, imgindex } = e.currentTarget.dataset;
    if (postindex !== undefined && imgindex !== undefined) {
      const favorite = this.data.favorites[postindex];
      console.error('图片加载失败的上下文:', {
        postId: favorite ? favorite.postId : 'unknown',
        postTitle: favorite ? favorite.postTitle : 'unknown',
        imageIndex: imgindex,
        imageUrl: src
      });
    }
    // 不显示toast，避免频繁弹窗，但记录错误
    console.error('图片加载失败详情:', {
      error: e.detail,
      src: src,
      dataset: e.currentTarget.dataset
    });
  },

  // 图片加载成功时，动态设置swiper高度（与点赞页面统一）
  onImageLoad: function(e) {
    const { postid, postindex = 0, imgindex = 0, type } = e.currentTarget.dataset;
    const { width: originalWidth, height: originalHeight } = e.detail;
    if (!originalWidth || !originalHeight) return;

    // 多图 Swiper 逻辑
    if (type === 'multi' && imgindex === 0) {
      const query = wx.createSelectorQuery().in(this);
      query.select(`#swiper-${postid}`).boundingClientRect(rect => {
        if (rect && rect.width) {
          const containerWidth = rect.width;
          const actualRatio = originalWidth / originalHeight;
          const maxRatio = 16 / 9;
          const minRatio = 9 / 16;
          let targetRatio = actualRatio;
          if (actualRatio > maxRatio) targetRatio = maxRatio;
          else if (actualRatio < minRatio) targetRatio = minRatio;
          const displayHeight = containerWidth / targetRatio;
          if (this.data.swiperHeights[postindex] !== displayHeight) {
            this.setData({ [`swiperHeights[${postindex}]`]: displayHeight });
          }
        }
      }).exec();
    }
    // 单图
    if (type === 'single') {
      const actualRatio = originalWidth / originalHeight;
      const minRatio = 9 / 16;
      if (actualRatio < minRatio) {
        const query = wx.createSelectorQuery().in(this);
        query.select(`#single-image-${postid}`).boundingClientRect(rect => {
          if (rect && rect.width) {
            const containerWidth = rect.width;
            const displayHeight = containerWidth / minRatio;
            if (this.data.imageClampHeights[postid] !== displayHeight) {
              this.setData({ [`imageClampHeights.${postid}`]: displayHeight });
            }
          }
        }).exec();
      }
    }
  },

  // 格式化时间
  formatTime: function(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;

    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return `${hours}小时前`;

    const days = Math.floor(diff / 86400000);
    if (days < 7) return `${days}天前`;

    return date.toLocaleDateString();
  }
});
