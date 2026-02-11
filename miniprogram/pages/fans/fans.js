Page({
  data: {
    fans: [],
    isLoading: false,
    hasMore: true,
    page: 0,
    PAGE_SIZE: 20,
    pendingOpenid: null,
    defaultAvatar: '../../images/avatar.png'
  },

  onLoad() {
    this.markFollowNotificationsRead();
    this.loadFans(true);
  },

  onPullDownRefresh() {
    this.loadFans(true);
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.isLoading) {
      return;
    }
    this.loadFans();
  },

  loadFans(reset = false) {
    if (this.data.isLoading) {
      return;
    }

    if (reset) {
      this.setData({
        page: 0,
        hasMore: true
      });
      this.markFollowNotificationsRead();
    }

    const page = reset ? 0 : this.data.page;
    this.setData({ isLoading: true });

    wx.cloud.callFunction({
      name: 'follow',
      data: {
        action: 'getFollowerList',
        skip: page * this.data.PAGE_SIZE,
        limit: this.data.PAGE_SIZE
      },
      success: res => {
        if (res.result && res.result.success) {
          const list = res.result.list || [];
          const formatted = list.map(item => ({
            ...item,
            followedAtText: item.followedAt ? this.formatTime(item.followedAt) : ''
          }));
          const newList = reset ? formatted : this.data.fans.concat(formatted);
          this.setData({
            fans: newList,
            page: page + 1,
            hasMore: !!res.result.hasMore,
            total: res.result.total || newList.length
          });
        } else {
          wx.showToast({
            title: res.result && res.result.message ? res.result.message : '加载失败',
            icon: 'none'
          });
        }
      },
      fail: err => {
        console.error('获取粉丝列表失败:', err);
        wx.showToast({
          title: '网络错误',
          icon: 'none'
        });
      },
      complete: () => {
        this.setData({ isLoading: false });
        if (reset) {
          wx.stopPullDownRefresh();
        }
      }
    });
  },

  markFollowNotificationsRead() {
    wx.cloud.callFunction({
      name: 'follow',
      data: {
        action: 'markFollowNotificationsRead'
      }
    }).catch(err => {
      console.error('标记关注消息已读失败:', err);
    });
  },

  onToggleFollow(e) {
    const openid = e.currentTarget.dataset.openid;
    const index = e.currentTarget.dataset.index;

    if (!openid || index === undefined || this.data.pendingOpenid) {
      return;
    }

    this.setData({ pendingOpenid: openid });

    wx.cloud.callFunction({
      name: 'follow',
      data: {
        action: 'toggleFollow',
        targetOpenid: openid
      },
      success: res => {
        if (res.result && res.result.success) {
          const isFollowing = !!res.result.isFollowing;
          this.setData({
            [`fans[${index}].isMutual`]: isFollowing
          });
          wx.showToast({
            title: isFollowing ? '关注成功' : '已取消关注',
            icon: 'success'
          });
          this.refreshFanStatus(openid, index);
        } else {
          wx.showToast({
            title: res.result && res.result.message ? res.result.message : '操作失败',
            icon: 'none'
          });
        }
      },
      fail: err => {
        console.error('操作粉丝关注状态失败:', err);
        wx.showToast({
          title: '网络错误',
          icon: 'none'
        });
      },
      complete: () => {
        this.setData({ pendingOpenid: null });
      }
    });
  },

  refreshFanStatus(openid, index) {
    wx.cloud.callFunction({
      name: 'follow',
      data: {
        action: 'checkFollow',
        targetOpenid: openid
      },
      success: res => {
        if (res.result && res.result.success) {
          this.setData({
            [`fans[${index}].isMutual`]: !!res.result.isMutual
          });
        }
      }
    });
  },

  onAvatarError(e) {
    const index = e.currentTarget.dataset.index;
    if (index === undefined) {
      return;
    }
    this.setData({
      [`fans[${index}].avatarUrl`]: this.data.defaultAvatar
    });
  },

  openUserProfile(e) {
    const openid = e.currentTarget.dataset.openid;
    if (!openid) {
      return;
    }
    wx.navigateTo({
      url: `/pages/user-profile/user-profile?userId=${openid}`
    });
  },

  formatTime(time) {
    try {
      const date = new Date(time);
      if (Number.isNaN(date.getTime())) {
        return '';
      }
      const diff = Date.now() - date.getTime();
      const minute = 60 * 1000;
      const hour = 60 * minute;
      const day = 24 * hour;

      if (diff < minute) {
        return '刚刚';
      }
      if (diff < hour) {
        return `${Math.floor(diff / minute)}分钟前`;
      }
      if (diff < day) {
        return `${Math.floor(diff / hour)}小时前`;
      }
      if (diff < day * 7) {
        return `${Math.floor(diff / day)}天前`;
      }
      const month = `${date.getMonth() + 1}`.padStart(2, '0');
      const dayText = `${date.getDate()}`.padStart(2, '0');
      return `${date.getFullYear()}-${month}-${dayText}`;
    } catch (error) {
      console.error('格式化时间失败:', error);
      return '';
    }
  }
});
