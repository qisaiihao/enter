// components/folder-selector/folder-selector.js
Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    postId: {
      type: String,
      value: ''
    }
  },

  data: {
    folders: [],
    isLoading: true,
    selectedFolderId: ''
  },

  observers: {
    'show': function(show) {
      if (show) {
        this.loadFolders();
      }
    }
  },

  methods: {
    // 加载收藏夹列表
    loadFolders: function() {
      this.setData({ isLoading: true });
      wx.cloud.callFunction({
        name: 'getMyProfileData',
        data: { action: 'getFavoriteFolders' },
        success: res => {
          if (res.result && res.result.success) {
            this.setData({
              folders: res.result.folders,
              isLoading: false
            });
          } else {
            wx.showToast({ title: '加载失败', icon: 'none' });
            this.setData({ isLoading: false });
          }
        },
        fail: err => {
          console.error('获取收藏夹失败:', err);
          wx.showToast({ title: '网络错误', icon: 'none' });
          this.setData({ isLoading: false });
        }
      });
    },

    // 选择收藏夹
    selectFolder: function(e) {
      const folderId = e.currentTarget.dataset.folderId;
      this.setData({ selectedFolderId: folderId });
    },

    // 确认收藏
    confirmFavorite: function() {
      if (!this.data.selectedFolderId) {
        wx.showToast({ title: '请选择收藏夹', icon: 'none' });
        return;
      }

      wx.showLoading({ title: '收藏中...' });
      wx.cloud.callFunction({
        name: 'getMyProfileData',
        data: {
          action: 'addToFavorite',
          postId: this.properties.postId,
          folderId: this.data.selectedFolderId
        },
        success: res => {
          wx.hideLoading();
          if (res.result && res.result.success) {
            wx.showToast({ title: '收藏成功' });
            this.hideModal();
            this.triggerEvent('favoriteSuccess');
          } else {
            wx.showToast({ 
              title: res.result.message || '收藏失败', 
              icon: 'none' 
            });
          }
        },
        fail: err => {
          wx.hideLoading();
          console.error('收藏失败:', err);
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      });
    },

    // 创建新收藏夹
    createFolder: function() {
      wx.navigateTo({
        url: '/pages/favorite-folders/favorite-folders'
      });
    },

    // 隐藏弹窗
    hideModal: function() {
      this.setData({ 
        selectedFolderId: '',
        show: false 
      });
      this.triggerEvent('hide');
    }
  }
});
