// pages/favorite-folders/favorite-folders.js
Page({
  data: {
    folders: [],
    isLoading: true,
    showCreateModal: false,
    newFolderName: '',
    editingFolder: null,
    showEditModal: false,
    editFolderName: ''
  },

  onLoad: function() {
    this.loadFolders();
  },

  onShow: function() {
    this.loadFolders();
  },

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

  // 显示创建收藏夹弹窗
  showCreateFolder: function() {
    this.setData({
      showCreateModal: true,
      newFolderName: ''
    });
  },

  // 隐藏创建收藏夹弹窗
  hideCreateModal: function() {
    this.setData({ showCreateModal: false });
  },

  // 输入收藏夹名称
  onFolderNameInput: function(e) {
    this.setData({ newFolderName: e.detail.value });
  },

  // 创建收藏夹
  createFolder: function() {
    const folderName = this.data.newFolderName.trim();
    if (!folderName) {
      wx.showToast({ title: '请输入收藏夹名称', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '创建中...' });
    wx.cloud.callFunction({
      name: 'getMyProfileData',
      data: { action: 'createFavoriteFolder', folderName: folderName },
      success: res => {
        wx.hideLoading();
        if (res.result && res.result.success) {
          wx.showToast({ title: '创建成功' });
          this.setData({ showCreateModal: false });
          this.loadFolders();
        } else {
          wx.showToast({ 
            title: res.result.message || '创建失败', 
            icon: 'none' 
          });
        }
      },
      fail: err => {
        wx.hideLoading();
        console.error('创建收藏夹失败:', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  // 进入收藏夹
  enterFolder: function(e) {
    const folderId = e.currentTarget.dataset.folderId;
    const folderName = e.currentTarget.dataset.folderName;
    wx.navigateTo({
      url: `/pages/favorite-content/favorite-content?folderId=${folderId}&folderName=${encodeURIComponent(folderName)}`
    });
  },

  // 长按收藏夹显示编辑选项
  onFolderLongPress: function(e) {
    const folderId = e.currentTarget.dataset.folderId;
    const folderName = e.currentTarget.dataset.folderName;
    
    wx.showActionSheet({
      itemList: ['重命名', '删除'],
      success: res => {
        if (res.tapIndex === 0) {
          // 重命名
          this.showEditFolder(folderId, folderName);
        } else if (res.tapIndex === 1) {
          // 删除
          this.deleteFolder(folderId, folderName);
        }
      }
    });
  },

  // 显示编辑收藏夹弹窗
  showEditFolder: function(folderId, folderName) {
    this.setData({
      showEditModal: true,
      editingFolder: folderId,
      editFolderName: folderName
    });
  },

  // 隐藏编辑收藏夹弹窗
  hideEditModal: function() {
    this.setData({ 
      showEditModal: false,
      editingFolder: null,
      editFolderName: ''
    });
  },

  // 输入编辑的收藏夹名称
  onEditFolderNameInput: function(e) {
    this.setData({ editFolderName: e.detail.value });
  },

  // 更新收藏夹名称
  updateFolderName: function() {
    const folderName = this.data.editFolderName.trim();
    if (!folderName) {
      wx.showToast({ title: '请输入收藏夹名称', icon: 'none' });
      return;
    }

    // 这里需要创建一个更新收藏夹名称的云函数
    wx.showToast({ title: '重命名功能待实现', icon: 'none' });
    this.hideEditModal();
  },

  // 删除收藏夹
  deleteFolder: function(folderId, folderName) {
    wx.showModal({
      title: '确认删除',
      content: `确定要删除收藏夹"${folderName}"吗？删除后其中的所有收藏内容也会被删除。`,
      success: res => {
        if (res.confirm) {
          // 这里需要创建一个删除收藏夹的云函数
          wx.showToast({ title: '删除功能待实现', icon: 'none' });
        }
      }
    });
  }
});
