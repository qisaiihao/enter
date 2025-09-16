const PAGE_SIZE = 5;

Page({
  data: {
    userInfo: {},
    isLoading: false,
    userPosts: [],
    page: 0,
    hasMore: true,
    PAGE_SIZE: PAGE_SIZE,
    swiperHeights: {},
    imageClampHeights: {},
    targetUserId: '', // 目标用户ID
  },

  onLoad: function (options) {
    console.log('【用户主页】页面加载，options:', options);
    
    const targetUserId = options.userId;
    if (!targetUserId) {
      wx.showToast({ title: '用户信息获取失败', icon: 'none' });
      wx.navigateBack();
      return;
    }

    this.setData({ targetUserId });
    this.loadUserProfile();
  },

  onPullDownRefresh: function () {
    this.setData({
      userPosts: [],
      page: 0,
      hasMore: true,
      swiperHeights: {},
      imageClampHeights: {},
    });
    this.loadUserProfile(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    if (!this.data.hasMore || this.data.isLoading) return;
    this.loadUserPosts();
  },

  // 加载用户信息和帖子
  loadUserProfile: function(cb) {
    this.setData({ isLoading: true });
    
    wx.cloud.callFunction({
      name: 'getUserProfile',
      data: {
        userId: this.data.targetUserId,
        skip: 0,
        limit: this.data.PAGE_SIZE
      },
      success: res => {
        console.log('【用户主页】getUserProfile 返回:', res);
        if (res.result && res.result.success) {
          const userInfo = res.result.userInfo;
          const posts = res.result.posts || [];
          
          // 格式化时间
          posts.forEach(post => {
            if (post.createTime) {
              post.formattedCreateTime = this.formatTime(post.createTime);
            }
          });

          this.setData({
            userInfo: userInfo,
            userPosts: posts,
            page: 1,
            hasMore: posts.length === this.data.PAGE_SIZE
          });

          // 设置页面标题为用户昵称
          wx.setNavigationBarTitle({
            title: userInfo.nickName || '用户主页'
          });
        } else {
          wx.showToast({ 
            title: res.result?.message || '获取用户信息失败', 
            icon: 'none' 
          });
        }
      },
      fail: err => {
        console.error('【用户主页】getUserProfile 云函数失败:', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
      complete: () => {
        this.setData({ isLoading: false });
        if (typeof cb === 'function') cb();
      }
    });
  },

  // 加载更多帖子
  loadUserPosts: function() {
    if (this.data.isLoading) return;
    
    const { page, PAGE_SIZE } = this.data;
    this.setData({ isLoading: true });
    
    wx.cloud.callFunction({
      name: 'getUserProfile',
      data: {
        userId: this.data.targetUserId,
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE
      },
      success: res => {
        if (res.result && res.result.success) {
          const posts = res.result.posts || [];
          
          posts.forEach(post => {
            if (post.createTime) {
              post.formattedCreateTime = this.formatTime(post.createTime);
            }
          });
          
          const newUserPosts = this.data.userPosts.concat(posts);
          
          this.setData({
            userPosts: newUserPosts,
            page: page + 1,
            hasMore: posts.length === PAGE_SIZE
          });
        }
      },
      complete: () => {
        this.setData({ isLoading: false });
      }
    });
  },

  // 跳转到帖子详情
  navigateToPostDetail: function(e) {
    const postId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${postId}` });
  },

  // 图片预览
  handlePreview: function(event) {
    const currentUrl = event.currentTarget.dataset.src;
    const originalUrls = event.currentTarget.dataset.originalImageUrls;
    if (currentUrl) {
      wx.previewImage({
        current: currentUrl,
        urls: originalUrls || [currentUrl]
      });
    }
  },

  // 图片加载处理
  onImageLoad: function(e) {
    const { postindex, imgindex = 0, type } = e.currentTarget.dataset;
    const { width, height } = e.detail;
    if (!width || !height) return;

    // 多图处理
    if (type === 'multi' && imgindex === 0) {
      const query = wx.createSelectorQuery().in(this);
      query.select(`#user-swiper-img-${postindex}-0`).boundingClientRect(rect => {
        if (rect && rect.width) {
          const containerWidth = rect.width;
          const actualRatio = width / height;
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
    // 单图处理
    if (type === 'single') {
      const actualRatio = width / height;
      const minRatio = 9 / 16;
      if (actualRatio < minRatio) {
        const query = wx.createSelectorQuery().in(this);
        query.select(`#user-single-img-${postindex}`).boundingClientRect(rect => {
          if (rect && rect.width) {
            const containerWidth = rect.width;
            const displayHeight = containerWidth / minRatio;
            if (this.data.imageClampHeights[postindex] !== displayHeight) {
              this.setData({ [`imageClampHeights.${postindex}`]: displayHeight });
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
  },

  onImageError: function(e) {
    console.error('图片加载失败:', e.detail);
  },

  onAvatarError: function(e) {
    console.error('头像加载失败:', e.detail);
  }
});
