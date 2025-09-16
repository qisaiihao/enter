// mountain.js - 非原创诗歌页面
const db = wx.cloud.database();
const PAGE_SIZE = 5;

Page({
  data: {
    postList: [],
    currentPostIndex: 0,
    touchStartX: 0,
    touchEndX: 0,
    isLoading: false,
    hasMore: true,
    page: 0,
    backgroundImage: '', // 背景图片
    isTransitioning: false, // 切换动画状态
    preloadedImages: {}, // 预加载的图片缓存
    
  },

  onLoad: function () {
    this.getPostList();
  },

  onShow: function () {
    // 强制刷新，避免显示非诗歌帖子
    this.setData({
      postList: [],
      currentPostIndex: 0,
      page: 0,
      hasMore: true,
      backgroundImage: ''
    }, () => {
      this.getPostList();
    });
  },

  getPostList: function (cb) {
    if (this.data.isLoading) return;
    this.setData({ isLoading: true });
    
    const skip = this.data.page * PAGE_SIZE;

    wx.cloud.callFunction({
      name: 'getPostList',
      data: { skip: skip, limit: PAGE_SIZE, isPoem: true, isOriginal: false }, // 只获取非原创诗歌
      success: res => {
        if (res.result && res.result.success) {
          const posts = res.result.posts || [];
          
          posts.forEach(post => {
            if (!post.imageUrls || post.imageUrls.length === 0) {
              post.imageUrls = post.imageUrl ? [post.imageUrl] : [];
            }
          });

          const newPostList = this.data.page === 0 ? posts : this.data.postList.concat(posts);

          this.setData({
            postList: newPostList,
            page: this.data.page + 1,
            hasMore: posts.length === PAGE_SIZE,
          });

          // 设置背景图片为第一个诗歌帖子的背景图，并预加载下一首
          if (newPostList.length > 0) {
            // 设置当前背景图 - 确保使用压缩图
            const currentBgImage = newPostList[0].poemBgImage || (newPostList[0].imageUrls && newPostList[0].imageUrls[0]) || '';
            if (currentBgImage) {
              this.setData({
                backgroundImage: currentBgImage
              });
            }

            // 预加载下一首的背景图
            this.preloadNextBackgroundImage(0);
          }
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

  touchStart: function(e) {
    this.setData({ touchStartX: e.touches[0].clientX });
  },

  touchEnd: function(e) {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = this.data.touchStartX - touchEndX;
    
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        this.nextPost();
      } else {
        this.prevPost();
      }
    }
  },

  nextPost: function() {
    if (this.data.currentPostIndex < this.data.postList.length - 1) {
      // 添加切换动画效果
      this.setData({ 
        isTransitioning: true
      });
      
      const nextIndex = this.data.currentPostIndex + 1;
      this.setData({ 
        currentPostIndex: nextIndex
      });
      
      // 更新背景图片为当前诗歌的背景图
      const currentPost = this.data.postList[nextIndex];
      if (currentPost && currentPost.poemBgImage) {
        this.setData({
          backgroundImage: currentPost.poemBgImage
        });
      } else if (currentPost && currentPost.imageUrls && currentPost.imageUrls.length > 0) {
        this.setData({
          backgroundImage: currentPost.imageUrls[0]
        });
      } else {
        this.setData({
          backgroundImage: ''
        });
      }

      // 动画结束
      setTimeout(() => {
        this.setData({ isTransitioning: false });
      }, 300);

      // 预加载下下首的背景图（提前两首）
      this.preloadNextBackgroundImage(nextIndex);
    } else {
      if (this.data.hasMore && !this.data.isLoading) {
        this.getPostList(() => {
          if (this.data.postList.length > this.data.currentPostIndex + 1) {
            const nextIndex = this.data.currentPostIndex + 1;
            this.setData({ 
              currentPostIndex: nextIndex
            });
            
            // 更新背景图片
            const currentPost = this.data.postList[nextIndex];
            if (currentPost && currentPost.poemBgImage) {
              this.setData({
                backgroundImage: currentPost.poemBgImage
              });
            } else if (currentPost && currentPost.imageUrls && currentPost.imageUrls.length > 0) {
              this.setData({
                backgroundImage: currentPost.imageUrls[0]
              });
            } else {
              this.setData({
                backgroundImage: ''
              });
            }
          }
        });
      }
    }
  },

  prevPost: function() {
    if (this.data.currentPostIndex > 0) {
      // 添加切换动画效果
      this.setData({ 
        isTransitioning: true
      });
      
      const prevIndex = this.data.currentPostIndex - 1;
      this.setData({ 
        currentPostIndex: prevIndex
      });
      
      // 更新背景图片为当前诗歌的背景图
      const currentPost = this.data.postList[prevIndex];
      if (currentPost && currentPost.poemBgImage) {
        this.setData({
          backgroundImage: currentPost.poemBgImage
        });
      } else if (currentPost && currentPost.imageUrls && currentPost.imageUrls.length > 0) {
        this.setData({
          backgroundImage: currentPost.imageUrls[0]
        });
      } else {
        this.setData({
          backgroundImage: ''
        });
      }
      
      // 动画结束
      setTimeout(() => {
        this.setData({ isTransitioning: false });
      }, 300);

      // 预加载下下首的背景图（提前两首）
      this.preloadNextBackgroundImage(prevIndex);
    }
  },

  onSinglePostTap: function(e) {
    const postId = e.currentTarget.dataset.postid;
    wx.navigateTo({
      url: `/pages/post-detail/post-detail?id=${postId}`
    });
  },

  onImageLoad: function(e) {
    const { postid, type } = e.currentTarget.dataset;
    const { width: originalWidth, height: originalHeight } = e.detail;
    if (!originalWidth || !originalHeight) return;

    if (type === 'single') {
      const actualRatio = originalWidth / originalHeight;
      const minRatio = 9 / 16;
      if (actualRatio < minRatio) {
        const query = wx.createSelectorQuery().in(this);
        query.select(`#single-image-${postid}`).boundingClientRect(rect => {
          if (rect && rect.width) {
            const containerWidth = rect.width;
            const displayHeight = containerWidth / minRatio;
            if (this.data.imageClampHeights && this.data.imageClampHeights[postid] !== displayHeight) {
              this.setData({ [`imageClampHeights.${postid}`]: displayHeight });
            }
          }
        }).exec();
      }
    }
  },

  onImageError: function(e) {
    console.error('山图片加载失败', e.detail);
  },

  // 精简预加载 - 只预加载下一首的背景图
  preloadNextBackgroundImage: function(currentIndex) {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= this.data.postList.length) {
      // 如果下一首不存在，检查是否需要加载更多
      if (this.data.hasMore && !this.data.isLoading) {
        this.getPostList(() => {
          // 加载完成后再次尝试预加载
          if (nextIndex < this.data.postList.length) {
            this.loadImageForIndex(nextIndex);
          }
        });
      }
      return;
    }

    this.loadImageForIndex(nextIndex);
  },

  // 为指定索引加载图片
  loadImageForIndex: function(index) {
    const post = this.data.postList[index];
    if (!post) return;

    // 确保使用压缩图而不是原图
    const imageUrl = post.poemBgImage || (post.imageUrls && post.imageUrls[0]) || '';
    if (!imageUrl) return;

    // 如果已经预加载过，跳过
    if (this.data.preloadedImages[imageUrl]) {
      return;
    }


    // 使用微信图片API预加载
    wx.downloadFile({
      url: imageUrl,
      success: (res) => {
        if (res.statusCode === 200) {
          this.setData({
            [`preloadedImages.${imageUrl}`]: res.tempFilePath
          });
        }
      },
      fail: (err) => {
        console.error('山图片预加载失败:', imageUrl, err);
      }
    });
  },

  
});