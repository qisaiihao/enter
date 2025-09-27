Page({
  data: {
    followings: [],
    isLoading: false,
    hasMore: true,
    page: 0,
    PAGE_SIZE: 20,
    pendingOpenid: null,
    defaultAvatar: '../../images/avatar.png'
  },

  onLoad() {
    this.loadFollowings(true);
  },

  onPullDownRefresh() {
    this.loadFollowings(true);
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.isLoading) {
      return;
    }
    this.loadFollowings();
  },

  loadFollowings(reset = false) {
    if (this.data.isLoading) {
      return;
    }

    if (reset) {
      this.setData({
        page: 0,
        hasMore: true
      });
    }

    const page = reset ? 0 : this.data.page;
    this.setData({ isLoading: true });

    wx.cloud.callFunction({
      name: 'follow',
      data: {
        action: 'getFollowingList',
        skip: page * this.data.PAGE_SIZE,
        limit: this.data.PAGE_SIZE
      },
      success: res => {
        if (res.result && res.result.success) {
          const list = res.result.list || [];
          const newList = reset ? list : this.data.followings.concat(list);
          this.setData({
            followings: newList,
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
        console.error('获取关注列表失败:', err);
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

  onToggleFollow(e) {
    const openid = e.currentTarget.dataset.openid;
    const index = e.currentTarget.dataset.index;

    if (!openid || this.data.pendingOpenid) {
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
          const stillFollowing = !!res.result.isFollowing;
          if (!stillFollowing) {
            const list = this.data.followings.filter((item, idx) => idx !== index);
            this.setData({
              followings: list
            });
            wx.showToast({
              title: '已取消关注',
              icon: 'success'
            });

            if (this.data.hasMore && list.length < this.data.PAGE_SIZE) {
              this.loadFollowings();
            }
            if (list.length === 0 && !this.data.hasMore) {
              this.setData({ page: 0 });
            }
          } else {
            wx.showToast({
              title: '已关注',
              icon: 'success'
            });
          }
        } else {
          wx.showToast({
            title: res.result && res.result.message ? res.result.message : '操作失败',
            icon: 'none'
          });
        }
      },
      fail: err => {
        console.error('取消关注失败:', err);
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

  onAvatarError(e) {
    const index = e.currentTarget.dataset.index;
    if (index === undefined) {
      return;
    }
    const avatarKey = `followings[${index}].avatarUrl`;
    this.setData({
      [avatarKey]: this.data.defaultAvatar
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
  }
});

