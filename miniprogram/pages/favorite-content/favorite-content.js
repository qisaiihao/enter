// pages/favorite-content/favorite-content.js
Page({
  data: {
    folderId: '',
    folderName: '',
    favorites: [],
    isLoading: true,
    hasMore: true,
    page: 0,
    pageSize: 10
  },

  onLoad: function(options) {
    const { folderId, folderName } = options;
    this.setData({
      folderId: folderId,
      folderName: decodeURIComponent(folderName || '')
    });
    
    // 设置导航栏标题
    wx.setNavigationBarTitle({
      title: this.data.folderName
    });
    
    this.loadFavorites();
  },

  onShow: function() {
    // 每次显示时刷新数据
    this.setData({
      favorites: [],
      page: 0,
      hasMore: true
    });
    this.loadFavorites();
  },

  onPullDownRefresh: function() {
    this.setData({
      favorites: [],
      page: 0,
      hasMore: true
    });
    this.loadFavorites(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.loadFavorites();
    }
  },

  loadFavorites: function(callback) {
    if (this.data.isLoading) return;
    
    this.setData({ isLoading: true });
    const skip = this.data.page * this.data.pageSize;
    
    wx.cloud.callFunction({
      name: 'getMyProfileData',
      data: {
        action: 'getFavoritesByFolder',
        folderId: this.data.folderId,
        skip: skip,
        limit: this.data.pageSize
      },
      success: res => {
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
          wx.showToast({ title: '加载失败', icon: 'none' });
          this.setData({ isLoading: false });
        }
      },
      fail: err => {
        console.error('获取收藏内容失败:', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
        this.setData({ isLoading: false });
      },
      complete: () => {
        if (typeof callback === 'function') callback();
      }
    });
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
