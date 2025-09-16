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
    selectedFolderId: '',
    showCreateModal: false,
    newFolderName: ''
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
      console.log('开始加载收藏夹列表...');
      this.setData({ isLoading: true });
      wx.cloud.callFunction({
        name: 'getMyProfileData',
        data: { action: 'getFavoriteFolders' },
        success: res => {
          console.log('folder-selector获取收藏夹:', res);
          if (res.result && res.result.success) {
            const folders = res.result.folders || [];
            console.log('获取到收藏夹数量:', folders.length);

            // 如果当前选中的文件夹不存在了，清空选择
            const currentSelectedId = this.data.selectedFolderId;
            if (currentSelectedId && !folders.some(f => f._id === currentSelectedId)) {
              console.log('清空失效的选中状态');
              this.setData({
                selectedFolderId: ''
              });
            }

            this.setData({
              folders: folders,
              isLoading: false
            });
          } else {
            wx.showToast({
              title: res.result?.message || '加载失败',
              icon: 'none'
            });
            this.setData({
              isLoading: false,
              folders: [],
              selectedFolderId: ''  // 加载失败时清空选择
            });
          }
        },
        fail: err => {
          console.error('获取收藏夹失败:', err);
          wx.showToast({ title: '网络错误', icon: 'none' });
          this.setData({
            isLoading: false,
            folders: [],
            selectedFolderId: ''  // 网络错误时清空选择
          });
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
      const selectedFolderId = this.data.selectedFolderId;
      const postId = this.properties.postId;

      console.log('确认收藏，postId:', postId, 'folderId:', selectedFolderId);

      if (!selectedFolderId) {
        wx.showToast({ title: '请选择收藏夹', icon: 'none' });
        return;
      }

      if (!postId) {
        console.error('postId 为空，无法收藏');
        wx.showToast({ title: '参数错误：帖子ID为空', icon: 'none' });
        return;
      }

      wx.showLoading({ title: '收藏中...' });
      wx.cloud.callFunction({
        name: 'getMyProfileData',
        data: {
          action: 'addToFavorite',
          postId: postId,
          folderId: selectedFolderId
        },
        success: res => {
          wx.hideLoading();
          console.log('确认收藏返回结果:', res);

          if (res && res.result) {
            if (res.result.success) {
              wx.showToast({ title: '收藏成功' });
              console.log('收藏成功，开始关闭弹窗');

              // 确保状态正确重置
              this.setData({
                selectedFolderId: ''
              });

              // 延迟关闭，确保用户能看到成功提示
              setTimeout(() => {
                this.hideModal();
              }, 1500);

              // 触发成功事件
              this.triggerEvent('favoriteSuccess');
            } else {
              console.error('收藏业务失败:', res.result);
              wx.showToast({
                title: res.result.message || '收藏失败',
                icon: 'none'
              });
            }
          } else {
            console.error('收藏返回格式异常:', res);
            wx.showToast({ title: '收藏失败：返回格式错误', icon: 'none' });
          }
        },
        fail: err => {
          wx.hideLoading();
          console.error('收藏云函数调用失败:', err);
          wx.showToast({
            title: '网络错误：' + (err.errMsg || '未知错误'),
            icon: 'none'
          });
        }
      });
    },

    // 显示创建收藏夹弹窗
    createFolder: function() {
      this.setData({
        showCreateModal: true,
        newFolderName: ''
      });
    },

    // 隐藏创建收藏夹弹窗
    hideCreateModal: function() {
      this.setData({ 
        showCreateModal: false,
        newFolderName: ''
      });
    },

    // 输入收藏夹名称
    onFolderNameInput: function(e) {
      const value = e.detail.value;
      this.setData({ newFolderName: value });
    },

    // 创建收藏夹
    createNewFolder: function() {
      const folderName = this.data.newFolderName.trim();
      if (!folderName) {
        wx.showToast({ title: '请输入收藏夹名称', icon: 'none' });
        return;
      }

      // 实时更新按钮状态
      this.setData({ newFolderName: folderName });

      console.log('组件开始创建收藏夹，名称:', folderName);
      wx.showLoading({ title: '创建中...' });
      wx.cloud.callFunction({
        name: 'getMyProfileData',
        data: { action: 'createFavoriteFolder', folderName: folderName },
        success: res => {
          wx.hideLoading();
          console.log('组件创建收藏夹返回结果:', res);

          // 更详细的返回结果检查
          if (res && res.result) {
            if (res.result.success) {
              wx.showToast({
                title: '创建成功',
                duration: 2000
              });
              this.setData({ showCreateModal: false });
              // 延迟重新加载，确保状态同步
              setTimeout(() => {
                this.loadFolders();
              }, 300);
            } else {
              console.error('组件创建收藏夹业务失败:', res.result);
              wx.showToast({
                title: res.result.message || '创建失败',
                icon: 'none',
                duration: 3000
              });
            }
          } else {
            console.error('组件创建收藏夹返回格式异常:', res);
            wx.showToast({
              title: '创建失败：返回格式错误',
              icon: 'none',
              duration: 3000
            });
          }
        },
        fail: err => {
          wx.hideLoading();
          console.error('组件创建收藏夹云函数调用失败:', err);
          wx.showToast({
            title: '创建失败: ' + (err.errMsg || '网络错误'),
            icon: 'none',
            duration: 3000
          });
        }
      });
    },

    // 隐藏弹窗
    hideModal: function() {
      console.log('=== 点击关闭按钮，开始隐藏弹窗 ===');
      console.log('当前状态：', {
        show: this.data.show,
        showCreateModal: this.data.showCreateModal,
        selectedFolderId: this.data.selectedFolderId
      });

      this.setData({
        selectedFolderId: '',
        show: false,
        showCreateModal: false,  // 确保创建弹窗也关闭
        newFolderName: ''  // 清空输入框
      });

      console.log('=== 弹窗已隐藏，状态已重置 ===');
      this.triggerEvent('hide');
    }
  }
});
