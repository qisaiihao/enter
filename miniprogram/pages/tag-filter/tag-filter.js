// pages/tag-filter/tag-filter.js
const db = wx.cloud.database();
const PAGE_SIZE = 10;

Page({
  data: {
    tag: '',
    postList: [],
    page: 0,
    hasMore: true,
    isLoading: false,
    isLoadingMore: false
  },

  onLoad: function (options) {
    const tag = decodeURIComponent(options.tag || '');
    if (!tag) {
      wx.showToast({ title: '标签参数错误', icon: 'none' });
      wx.navigateBack();
      return;
    }

    this.setData({ tag: tag });
    wx.setNavigationBarTitle({ title: `#${tag}` });
    this.getPostList();
  },

  getPostList: function (cb) {
    if (this.data.isLoading || this.data.isLoadingMore || !this.data.hasMore) {
      if (typeof cb === 'function') cb();
      return;
    }
    
    const skip = this.data.page * PAGE_SIZE;
    const isFirstLoad = this.data.page === 0;

    if (isFirstLoad) {
      this.setData({ isLoading: true });
    } else {
      this.setData({ isLoadingMore: true });
    }
    
    wx.cloud.callFunction({
      name: 'getPostList',
      data: { 
        skip: skip, 
        limit: PAGE_SIZE,
        tag: this.data.tag // 传递标签参数
      },
      success: res => {
        if (res.result && res.result.success) {
          let posts = res.result.posts || [];
          
          // 处理图片数据
          posts = posts.map(post => {
            if (!post.imageUrls || post.imageUrls.length === 0) {
              post.imageUrls = post.imageUrl ? [post.imageUrl] : [];
            }
            
            // 设置图片容器样式，确保图片能正确显示
            if (post.imageUrls.length > 0) {
              post.imageStyle = `height: 0; padding-bottom: 75%;`; // 4:3 宽高比占位
            }
            
            return post;
          });

          const newPostList = this.data.page === 0 ? posts : this.data.postList.concat(posts);
          
          this.setData({
            postList: newPostList,
            page: this.data.page + 1,
            hasMore: posts.length === PAGE_SIZE,
          });
        } else {
          wx.showToast({ title: '加载失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('获取标签文章失败:', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
      complete: () => {
        if (isFirstLoad) {
          this.setData({ isLoading: false });
        } else {
          this.setData({ isLoadingMore: false });
        }
        if (typeof cb === 'function') cb();
      }
    });
  },

  onReachBottom: function () {
    if (!this.data.hasMore || this.data.isLoading || this.data.isLoadingMore) {
      return;
    }
    this.getPostList();
  },

  onPullDownRefresh: function () {
    this.setData({
      postList: [],
      page: 0,
      hasMore: true,
    }, () => {
      this.getPostList(() => {
        wx.stopPullDownRefresh();
      });
    });
  },

  // 跳转到帖子详情
  onPostTap: function(e) {
    const postId = e.currentTarget.dataset.postid;
    wx.navigateTo({
      url: `/pages/post-detail/post-detail?id=${postId}`
    });
  },

  // 跳转到用户主页
  navigateToUserProfile: function(e) {
    const userId = e.currentTarget.dataset.userId;
    if (userId) {
      const app = getApp();
      const currentUserOpenid = app.globalData.openid;
      
      if (userId === currentUserOpenid) {
        wx.switchTab({
          url: '/pages/profile/profile'
        });
      } else {
        wx.navigateTo({
          url: `/pages/user-profile/user-profile?userId=${userId}`
        });
      }
    }
  },

  // 图片预览
  handlePreview: function(event) {
    const current = event.currentTarget.dataset.src || event.currentTarget.dataset.imageUrl;
    const urls = event.currentTarget.dataset.originalImageUrls;
    if (current && urls && urls.length > 0) {
      wx.previewImage({ current, urls });
    }
  },

  onImageError: function(e) { 
    console.error('图片加载失败', e.detail); 
  },

  onAvatarError: function(e) { 
    console.error('头像加载失败', e.detail); 
  },

  // 标签点击处理
  onTagClick: function(e) {
    const tag = e.currentTarget.dataset.tag;
    console.log('点击标签:', tag);
    
    // 跳转到标签筛选页面
    wx.navigateTo({
      url: `/pages/tag-filter/tag-filter?tag=${encodeURIComponent(tag)}`,
      success: () => {
        console.log('跳转到标签筛选页面成功');
      },
      fail: (err) => {
        console.error('跳转到标签筛选页面失败:', err);
        wx.showToast({
          title: '跳转失败',
          icon: 'none'
        });
      }
    });
  },

  // 评论点击处理
  onCommentClick: function(e) {
    const postId = e.currentTarget.dataset.postid;
    console.log('点击评论，跳转到详情页:', postId);
    
    wx.navigateTo({
      url: `/pages/post-detail/post-detail?id=${postId}`,
      success: () => {
        console.log('跳转到详情页成功');
      },
      fail: (err) => {
        console.error('跳转到详情页失败:', err);
        wx.showToast({
          title: '跳转失败',
          icon: 'none'
        });
      }
    });
  }
});
