// pages/draft-box/draft-box.js
const db = wx.cloud.database();

Page({
  data: {
    drafts: [],
    isLoading: true
  },

  onLoad: function () {
    this.loadDrafts();
  },

  onShow: function () {
    // 每次显示时重新加载草稿，以防其他页面有更新
    this.loadDrafts();
  },

  // 加载草稿列表
  loadDrafts: function() {
    this.setData({ isLoading: true });
    
    wx.cloud.callFunction({
      name: 'getMyProfileData',
      data: { action: 'getDrafts' },
      success: res => {
        console.log('获取草稿列表结果:', res);
        if (res.result && res.result.success) {
          const drafts = res.result.drafts || [];
          // 格式化时间
          const formattedDrafts = drafts.map(draft => ({
            ...draft,
            formattedSaveTime: this.formatTime(draft.saveTime)
          }));
          
          this.setData({
            drafts: formattedDrafts,
            isLoading: false
          });
        } else {
          console.error('获取草稿失败:', res.result);
          this.setData({ isLoading: false });
          wx.showToast({
            title: '加载草稿失败',
            icon: 'none'
          });
        }
      },
      fail: err => {
        console.error('获取草稿失败:', err);
        this.setData({ isLoading: false });
        wx.showToast({
          title: '网络错误',
          icon: 'none'
        });
      }
    });
  },

  // 编辑草稿
  editDraft: function(e) {
    const draft = e.currentTarget.dataset.draft;
    if (!draft) return;

    // 将草稿数据存储到本地，供发布页使用
    try {
      wx.setStorageSync('editing_draft', draft);
      wx.navigateTo({
        url: '/pages/add/add?mode=edit'
      });
    } catch (error) {
      console.error('存储草稿数据失败:', error);
      wx.showToast({
        title: '打开草稿失败',
        icon: 'none'
      });
    }
  },

  // 删除草稿
  deleteDraft: function(e) {
    const draftId = e.currentTarget.dataset.draftId;
    if (!draftId) return;

    wx.showModal({
      title: '删除草稿',
      content: '确定要删除这个草稿吗？',
      confirmColor: '#ff4d4f',
      success: res => {
        if (!res.confirm) return;

        wx.showLoading({ title: '删除中...' });
        
        wx.cloud.callFunction({
          name: 'getMyProfileData',
          data: {
            action: 'deleteDraft',
            draftId: draftId
          },
          success: result => {
            wx.hideLoading();
            if (result.result && result.result.success) {
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              });
              // 重新加载草稿列表
              this.loadDrafts();
            } else {
              wx.showToast({
                title: result.result?.message || '删除失败',
                icon: 'none'
              });
            }
          },
          fail: err => {
            wx.hideLoading();
            console.error('删除草稿失败:', err);
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          }
        });
      }
    });
  },

  // 去发布页面
  goToPublish: function() {
    wx.navigateTo({
      url: '/pages/add/add'
    });
  },

  // 格式化时间
  formatTime: function(timestamp) {
    if (!timestamp) return '未知时间';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    // 小于1分钟
    if (diff < 60000) {
      return '刚刚';
    }
    
    // 小于1小时
    if (diff < 3600000) {
      return Math.floor(diff / 60000) + '分钟前';
    }
    
    // 小于1天
    if (diff < 86400000) {
      return Math.floor(diff / 3600000) + '小时前';
    }
    
    // 小于7天
    if (diff < 604800000) {
      return Math.floor(diff / 86400000) + '天前';
    }
    
    // 超过7天显示具体日期
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    
    if (year === now.getFullYear()) {
      return `${month}-${day} ${hour}:${minute}`;
    } else {
      return `${year}-${month}-${day} ${hour}:${minute}`;
    }
  }
});
