// pages/profile-edit/profile-edit.js
const app = getApp();

Page({
  data: {
    avatarUrl: '',
    nickName: '',
    birthday: '',
    bio: '',
    endDate: '',
    isSaving: false,
    tempAvatarPath: null
  },

  onLoad: function (options) {
    this.fetchUserProfile();
    const today = new Date();
    const formattedDate = today.getFullYear() + '-' + (today.getMonth() + 1).toString().padStart(2, '0') + '-' + today.getDate().toString().padStart(2, '0');
    this.setData({ endDate: formattedDate });
  },

  fetchUserProfile: function() {
    wx.cloud.callFunction({
      name: 'getMyProfileData',
      success: res => {
        if (res.result && res.result.success && res.result.userInfo) {
          const user = res.result.userInfo;
          this.setData({
            avatarUrl: user.avatarUrl || '',
            nickName: user.nickName || '',
            birthday: user.birthday || '',
            bio: user.bio || ''
          });
        } else {
          wx.showToast({ title: '加载失败', icon: 'none' });
        }
      },
      fail: err => {
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    });
  },

  onChooseAvatar(e) {
    this.setData({ avatarUrl: e.detail.avatarUrl, tempAvatarPath: e.detail.avatarUrl });
  },

  onNicknameInput(e) {
    this.setData({ nickName: e.detail.value });
  },

  onBirthdayChange(e) {
    this.setData({ birthday: e.detail.value });
  },

  onBioInput(e) {
    this.setData({ bio: e.detail.value });
  },

  onSaveChanges: function() {
    if (this.data.isSaving) return;
    this.setData({ isSaving: true });
    wx.showLoading({ title: '保存中...' });

    let uploadPromise = this.data.tempAvatarPath ? 
      wx.cloud.uploadFile({
        cloudPath: `user_avatars/${Date.now()}`,
        filePath: this.data.tempAvatarPath
      }) : 
      Promise.resolve({ fileID: null });

    uploadPromise.then(uploadRes => {
      return wx.cloud.callFunction({
        name: 'updateUserProfile',
        data: {
          avatarUrl: uploadRes.fileID,
          nickName: this.data.nickName,
          birthday: this.data.birthday,
          bio: this.data.bio
        }
      });
    })
    .then(res => {
      if (res.result.success) {
        wx.hideLoading();
        wx.showToast({ title: '保存成功' });
        
        // 获取页面栈
        const pages = getCurrentPages();
        if (pages.length > 1) {
          // 获取上一个页面实例
          const prePage = pages[pages.length - 2];
          // 调用上一个页面的方法
          prePage.fetchUserProfile();
        }

        // 保存成功后，直接返回
        setTimeout(() => wx.navigateBack(), 1000);
      } else {
        throw new Error(res.result.message || '云函数保存失败');
      }
    })
    .catch(err => {
      wx.hideLoading();
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    })
    .finally(() => {
      this.setData({ isSaving: false });
    });
  }
});
