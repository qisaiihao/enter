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
    console.log('=== 收藏夹列表页面 onLoad ===');
    this.loadFolders();
  },

  onShow: function() {
    console.log('=== 收藏夹列表页面 onShow ===');
    this.loadFolders();
  },

  loadFolders: function() {
    this.setData({ isLoading: true });
    wx.cloud.callFunction({
      name: 'getMyProfileData',
      data: { action: 'getFavoriteFolders' },
      success: res => {
        console.log('获取收藏夹返回数据:', res);
        if (res.result && res.result.success) {
          const folders = res.result.folders || [];
          console.log('收藏夹数据:', folders);

          // 检查数据结构
          folders.forEach((folder, index) => {
            console.log(`收藏夹${index}:`, {
              _id: folder._id,
              name: folder.name,
              itemCount: folder.itemCount,
              createTime: folder.createTime
            });
          });

          this.setData({
            folders: folders,
            isLoading: false
          });
        } else {
          console.error('获取收藏夹失败:', res.result);
          wx.showToast({
            title: res.result?.message || '加载失败',
            icon: 'none'
          });
          this.setData({
            isLoading: false,
            folders: []
          });
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

    console.log('开始创建收藏夹，名称:', folderName);
    wx.showLoading({ title: '创建中...' });
    wx.cloud.callFunction({
      name: 'getMyProfileData',
      data: { action: 'createFavoriteFolder', folderName: folderName },
      success: res => {
        wx.hideLoading();
        console.log('创建收藏夹云函数返回:', res);

        // 更详细的返回结果检查
        if (res && res.result) {
          if (res.result.success) {
            wx.showToast({ title: '创建成功' });
            // 先清空输入框，再关闭弹窗，避免状态混乱
            this.setData({
              showCreateModal: false,
              newFolderName: ''  // 清空输入框
            });
            // 延迟加载，确保状态更新完成
            setTimeout(() => {
              this.loadFolders();
            }, 300);
          } else {
            console.error('创建收藏夹业务失败:', res.result);
            wx.showToast({
              title: res.result.message || '创建失败',
              icon: 'none'
            });
          }
        } else {
          console.error('创建收藏夹返回格式异常:', res);
          wx.showToast({ title: '创建失败：返回格式错误', icon: 'none' });
        }
      },
      fail: err => {
        wx.hideLoading();
        console.error('创建收藏夹云函数调用失败:', err);
        wx.showToast({
          title: '网络错误：' + (err.errMsg || '未知错误'),
          icon: 'none'
        });
      }
    });
  },

  // 进入收藏夹
  enterFolder: function(e) {
    console.log('=== 点击收藏夹项 ===');
    console.log('事件对象:', e);
    console.log('dataset:', e.currentTarget.dataset);

    const folderId = e.currentTarget.dataset.folderId;
    const folderName = e.currentTarget.dataset.folderName;

    console.log('提取的folderId:', folderId);
    console.log('提取的folderName:', folderName);

    if (!folderId) {
      console.error('错误：folderId 为空');
      wx.showToast({
        title: '收藏夹ID为空',
        icon: 'none'
      });
      return;
    }

    const targetUrl = `/pages/favorite-content/favorite-content?folderId=${folderId}&folderName=${encodeURIComponent(folderName || '')}`;
    console.log('跳转URL:', targetUrl);

    wx.navigateTo({
      url: targetUrl,
      success: function() {
        console.log('跳转成功');
      },
      fail: function(err) {
        console.error('跳转失败:', err);
      }
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
