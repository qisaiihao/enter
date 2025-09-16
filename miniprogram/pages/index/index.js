// index.js
wx.cloud.init({
  env: ''
});
const db = wx.cloud.database();
const PAGE_SIZE = 5;

Page({
  data: {
    postList: [],
    votingInProgress: {},
    page: 0,
    hasMore: true,
    isLoading: false,
    swiperHeights: {},
    imageClampHeights: {}, // 新增：单图瘦高图钳制高度
    displayMode: 'square' // 首页只负责广场模式
  },

  onLoad: function (options) {
    // 首页只负责广场模式
    this.setData({ displayMode: 'square' });
  },

  onShow: function () {
    try {
      const shouldRefresh = wx.getStorageSync('shouldRefreshIndex');
      if (shouldRefresh) {
        wx.setStorageSync('shouldRefreshIndex', false);
        this.refreshData();
      }
    } catch (e) {}

    if (this.data.postList.length === 0) {
      this.getPostList();
    }
  },

  refreshData: function() {
    this.setData({
      postList: [],
      swiperHeights: {},
      imageClampHeights: {},
      page: 0,
      hasMore: true,
    }, () => {
      this.getPostList();
    });
  },

  onPullDownRefresh: function () {
    this.setData({
      postList: [],
      swiperHeights: {},
      page: 0,
      hasMore: true,
    }, () => {
      this.getPostList(() => {
        wx.stopPullDownRefresh();
      });
    });
  },

  onReachBottom: function () {
    if (!this.data.hasMore || this.data.isLoading) return;
    this.getPostList();
  },

  getPostList: function (cb) {
    if (this.data.isLoading) return;
    this.setData({ isLoading: true });
    
    const skip = this.data.page * PAGE_SIZE;

    wx.cloud.callFunction({
      name: 'getPostList',
      data: { skip: skip, limit: PAGE_SIZE },
      success: res => {
        if (res.result && res.result.success) {
          const posts = res.result.posts || [];
          
          posts.forEach(post => {
            if (!post.imageUrls || post.imageUrls.length === 0) {
              post.imageUrls = post.imageUrl ? [post.imageUrl] : [];
            }
          });

          const newPostList = this.data.page === 0 ? posts : this.data.postList.concat(posts);

          // 调试：检查帖子数据中是否包含_openid
          console.log('【首页】帖子数据示例:', posts.slice(0, 2).map(post => ({
            _id: post._id,
            title: post.title,
            authorName: post.authorName,
            _openid: post._openid,
            hasOpenid: !!post._openid
          })));

          this.setData({
            postList: newPostList,
            page: this.data.page + 1,
            hasMore: posts.length === PAGE_SIZE,
          });
        } else {
          wx.showToast({ title: '加载失败', icon: 'none' });
        }
      },
      fail: () => wx.showToast({ title: '网络错误', icon: 'none' }),
      complete: () => {
        this.setData({ isLoading: false });
        if (typeof cb === 'function') cb();
      }
    });
  },

  onImageLoad: function(e) {
    const { postid, postindex = 0, imgindex = 0, type } = e.currentTarget.dataset;
    const { width: originalWidth, height: originalHeight } = e.detail;
    if (!originalWidth || !originalHeight) return;

    // 多图 Swiper 逻辑
    if (type === 'multi' && imgindex === 0) {
      const query = wx.createSelectorQuery().in(this);
      query.select(`#swiper-${postid}`).boundingClientRect(rect => {
        if (rect && rect.width) {
          const containerWidth = rect.width;
          const actualRatio = originalWidth / originalHeight;
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
    // 单图
    if (type === 'single') {
      const actualRatio = originalWidth / originalHeight;
      const minRatio = 9 / 16;
      if (actualRatio < minRatio) {
        const query = wx.createSelectorQuery().in(this);
        query.select(`#single-image-${postid}`).boundingClientRect(rect => {
          if (rect && rect.width) {
            const containerWidth = rect.width;
            const displayHeight = containerWidth / minRatio;
            if (this.data.imageClampHeights[postid] !== displayHeight) {
              this.setData({ [`imageClampHeights.${postid}`]: displayHeight });
            }
          }
        }).exec();
      }
    }
  },

  // catch:tap 用于图片预览，并阻止跳转
  handlePreview: function(event) {
    const current = event.currentTarget.dataset.src || event.currentTarget.dataset.imageUrl;
    const urls = event.currentTarget.dataset.originalImageUrls;
    if (current && urls && urls.length > 0) {
      wx.previewImage({ current, urls });
    }
  },

  onVote: function(event) {
    const postId = event.currentTarget.dataset.postid;
    const index = event.currentTarget.dataset.index;
    if (this.data.votingInProgress[postId]) return;
    this.setData({ [`votingInProgress.${postId}`]: true });
    let postList = this.data.postList;
    const originalVotes = postList[index].votes;
    const originalIsVoted = postList[index].isVoted;
    postList[index].votes = originalIsVoted ? originalVotes - 1 : originalVotes + 1;
    postList[index].isVoted = !originalIsVoted;
    this.setData({ postList: postList });
    wx.cloud.callFunction({
      name: 'vote',
      data: { postId: postId },
      success: res => {
        if (!res.result.success) {
          postList[index].votes = originalVotes;
          postList[index].isVoted = originalIsVoted;
          this.setData({ postList: postList });
        } else if (postList[index].votes !== res.result.votes) {
          postList[index].votes = res.result.votes;
          this.setData({ postList: postList });
        }
      },
      fail: () => {
        postList[index].votes = originalVotes;
        postList[index].isVoted = originalIsVoted;
        this.setData({ postList: postList });
        wx.showToast({ title: '操作失败', icon: 'none' });
      },
      complete: () => {
        this.setData({ [`votingInProgress.${postId}`]: false });
      }
    });
  },

  updatePostCommentCount: function(postId, newCommentCount) {
    const postList = this.data.postList;
    const postIndex = postList.findIndex(p => p._id === postId);
    if (postIndex > -1) {
      this.setData({
        [`postList[${postIndex}].commentCount`]: newCommentCount
      });
    }
  },

  onImageError: function(e) { console.error('图片加载失败', e.detail); },
  onAvatarError: function(e) { console.error('头像加载失败', e.detail); },

  // 新增：跳转到用户个人主页
  navigateToUserProfile: function(e) {
    console.log('【头像点击】事件触发', e);
    console.log('【头像点击】dataset:', e.currentTarget.dataset);
    
    const userId = e.currentTarget.dataset.userId;
    console.log('【头像点击】提取的userId:', userId);
    
    if (userId) {
      const app = getApp();
      const currentUserOpenid = app.globalData.openid;
      
      // 检查是否点击的是自己的头像
      if (userId === currentUserOpenid) {
        console.log('【头像点击】点击的是自己头像，切换到我的页面');
        wx.switchTab({
          url: '/pages/profile/profile'
        });
      } else {
        console.log('【头像点击】点击的是他人头像，跳转到用户主页');
        wx.navigateTo({
          url: `/pages/user-profile/user-profile?userId=${userId}`,
          success: function() {
            console.log('【头像点击】跳转成功');
          },
          fail: function(err) {
            console.error('【头像点击】跳转失败:', err);
            wx.showToast({
              title: '跳转失败',
              icon: 'none'
            });
          }
        });
      }
    } else {
      console.error('【头像点击】userId为空，无法跳转');
      wx.showToast({
        title: '用户信息获取失败',
        icon: 'none'
      });
    }
  },

  // 模式切换现在通过底部tabBar实现，不再需要手动切换
});