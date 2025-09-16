// poem.js
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
    backgroundImage: '', // 当前背景图片
    nextBackgroundImage: '', // 预加载背景图片
    isTransitioning: false, // 切换动画状态
    preloadedImages: {}, // 预加载的图片缓存
    showFavoriteModal: false, // 显示收藏夹选择器
    currentPostId: '', // 当前要收藏的帖子ID
    imageCache: {}, // 图片缓存
    preloadQueue: [], // 预加载队列
    isPreloading: false, // 是否正在预加载
    preloadedCount: 0 // 已预加载数量
  },

  onLoad: function () {
    this.getPostList();
  },

  onShow: function () {
    // 检查缓存
    const cacheKey = 'poem_postList_cache';
    const cacheTime = 'poem_postList_cache_time';
    const now = Date.now();
    const cacheExpiry = 3 * 60 * 1000; // 3分钟缓存

    try {
      const cachedData = wx.getStorageSync(cacheKey);
      const cacheTimestamp = wx.getStorageSync(cacheTime);
      
      if (cachedData && cacheTimestamp && (now - cacheTimestamp < cacheExpiry)) {
        this.setData({
          postList: cachedData,
          currentPostIndex: 0,
          page: Math.ceil(cachedData.length / PAGE_SIZE),
          backgroundImage: cachedData[0] ? (cachedData[0].poemBgImage || (cachedData[0].imageUrls && cachedData[0].imageUrls[0]) || '') : ''
        });
        return;
      }
    } catch (e) {
      // 缓存读取失败，重新加载
    }

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
      data: { skip: skip, limit: PAGE_SIZE, isPoem: true, isOriginal: true }, // 只获取原创诗歌
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

          // 缓存数据（只在第一页时缓存）
          if (this.data.page === 1) {
            try {
              wx.setStorageSync('poem_postList_cache', newPostList);
              wx.setStorageSync('poem_postList_cache_time', Date.now());
            } catch (e) {
              // 诗歌缓存保存失败
            }
          }

          // 设置背景图片为第一个诗歌帖子的背景图，并预加载周围图片
          if (newPostList.length > 0) {
            // 立即预加载前几首诗歌的图片
            this.preloadNextBackgroundImage(0);
            
            // 设置当前背景图 - 确保使用压缩图
            const currentPost = newPostList[0];
            // 优先使用poemBgImage（压缩图），其次使用imageUrls[0]（压缩图），避免使用原图
            const imageUrl = currentPost.poemBgImage || (currentPost.imageUrls && currentPost.imageUrls[0]) || '';
            
            if (imageUrl) {
              this.setData({
                backgroundImage: imageUrl
              });
            }
            
            // 立即开始智能预加载
            this.smartPreload();
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
    
    // 在用户开始滑动时就开始预加载
    const currentIndex = this.data.currentPostIndex;
    this.preloadNextBackgroundImage(currentIndex);
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
      const nextIndex = this.data.currentPostIndex + 1;
      this.switchToPost(nextIndex);
    } else {
      if (this.data.hasMore && !this.data.isLoading) {
        this.getPostList(() => {
          if (this.data.postList.length > this.data.currentPostIndex + 1) {
            const nextIndex = this.data.currentPostIndex + 1;
            this.switchToPost(nextIndex);
          }
        });
      }
    }
  },

  prevPost: function() {
    if (this.data.currentPostIndex > 0) {
      const prevIndex = this.data.currentPostIndex - 1;
      this.switchToPost(prevIndex);
    }
  },

  // 更新当前背景图片（如果预加载完成）
  updateCurrentBackgroundIfNeeded: function(imageUrl, preloadedPath) {
    const currentPost = this.data.postList[this.data.currentPostIndex];
    if (currentPost) {
      const currentImageUrl = currentPost.poemBgImage || (currentPost.imageUrls && currentPost.imageUrls[0]) || '';
      if (currentImageUrl === imageUrl && this.data.backgroundImage === imageUrl) {
        // 使用双缓冲更新背景（微信小程序兼容）
        this.setData({
          nextBackgroundImage: preloadedPath
        });
        
        setTimeout(() => {
          this.setData({
            backgroundImage: preloadedPath,
            nextBackgroundImage: ''
          });
        }, 50);
      }
    }
  },

  // 智能预加载 - 预加载前几首诗歌的图片
  smartPreload: function() {
    // 预加载前5首诗歌的图片，确保滑动时有足够的预加载图片
    const preloadCount = Math.min(5, this.data.postList.length);
    for (let i = 0; i < preloadCount; i++) {
      this.loadImageForIndex(i);
    }
  },

  // 核心切换函数 - 使用双缓冲技术避免闪烁
  switchToPost: function(index) {
    const post = this.data.postList[index];
    if (!post) return;

    // 获取预加载的图片URL - 确保使用压缩图
    const imageUrl = post.poemBgImage || (post.imageUrls && post.imageUrls[0]) || '';
    let finalImageUrl = imageUrl;

    // 如果图片已经预加载，使用预加载的本地路径
    if (imageUrl && this.data.preloadedImages[imageUrl] && this.data.preloadedImages[imageUrl] !== 'loading') {
      finalImageUrl = this.data.preloadedImages[imageUrl];
    }

    // 双缓冲切换：先设置预加载图片，再切换
    if (finalImageUrl !== this.data.backgroundImage) {
      // 设置预加载图片
      this.setData({
        nextBackgroundImage: finalImageUrl
      });

      // 使用setTimeout确保平滑切换（微信小程序兼容）
      setTimeout(() => {
        this.setData({
          currentPostIndex: index,
          backgroundImage: finalImageUrl,
          nextBackgroundImage: ''
        });
      }, 50); // 减少延迟提高响应速度
    } else {
      // 如果图片相同，也要更新背景图片和索引
      this.setData({ 
        currentPostIndex: index,
        backgroundImage: finalImageUrl
      });
    }

    // 预加载周围诗歌的图片
    this.preloadNextBackgroundImage(index);
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
    // 图片加载失败
  },

  // 智能预加载系统 - 预加载周围图片确保平滑切换
  preloadNextBackgroundImage: function(currentIndex) {
    const preloadIndices = [];
    
    // 预加载下一首
    if (currentIndex + 1 < this.data.postList.length) {
      preloadIndices.push(currentIndex + 1);
    }
    
    // 预加载上一首（如果存在）
    if (currentIndex - 1 >= 0) {
      preloadIndices.push(currentIndex - 1);
    }
    
    // 预加载下下首（提前预加载）
    if (currentIndex + 2 < this.data.postList.length) {
      preloadIndices.push(currentIndex + 2);
    }
    
    // 并行预加载
    preloadIndices.forEach(index => {
      this.loadImageForIndex(index);
    });
    
    // 如果接近列表末尾，预加载更多数据
    if (currentIndex >= this.data.postList.length - 2 && this.data.hasMore && !this.data.isLoading) {
      this.getPostList();
    }
  },

  // 快速图片预加载 - 简化流程，提高速度
  loadImageForIndex: function(index) {
    const post = this.data.postList[index];
    if (!post) return;

    // 确保使用压缩图而不是原图
    const imageUrl = post.poemBgImage || (post.imageUrls && post.imageUrls[0]) || '';
    if (!imageUrl) return;

    // 如果已经预加载过，跳过
    if (this.data.preloadedImages[imageUrl]) return;

    // 标记为正在预加载
    this.setData({
      [`preloadedImages.${imageUrl}`]: 'loading'
    });

    // 直接下载，不进行额外验证以提高速度
    wx.downloadFile({
      url: imageUrl,
      success: (res) => {
        if (res.statusCode === 200) {
          // 直接使用下载的文件，不进行额外验证
          this.setData({
            [`preloadedImages.${imageUrl}`]: res.tempFilePath
          });
          this.data.preloadedCount++;
          
          // 如果这是当前显示的图片，立即更新背景
          this.updateCurrentBackgroundIfNeeded(imageUrl, res.tempFilePath);
        } else {
          // 下载失败，回退到原URL
          this.setData({
            [`preloadedImages.${imageUrl}`]: imageUrl
          });
        }
      },
      fail: (err) => {
        // 下载失败，回退到原URL
        this.setData({
          [`preloadedImages.${imageUrl}`]: imageUrl
        });
      }
    });
  },

  
});