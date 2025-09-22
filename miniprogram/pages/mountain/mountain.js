// mountain.js - 非原创诗歌页面
const db = wx.cloud.database();
const PAGE_SIZE = 5;

Page({
  data: {
    isLoading: true, // 默认显示骨架屏
    postList: [],
    currentPostIndex: 0,
    touchStartX: 0,
    touchEndX: 0,
    touchStartY: 0,
    touchEndY: 0,
    hasMore: true,
    page: 0,
    backgroundImage: '', // 这个变量可以废弃了，或者只用来做逻辑判断
    isTransitioning: false,
    preloadedImages: {},
    _hasFirstLoad: false, // 新增：标记是否首次加载

    // --- 新增数据 ---
    currentPost: null, // 专门存放当前帖子的数据
    bgLayers: [ // 管理背景图层的数组
      { url: '', visible: false },
      { url: '', visible: false }
    ],
    activeLayerIndex: 0 // 当前激活的图层索引 (0 或 1)
  },

  onLoad: function () {
    console.log('Mountain 页面 onLoad');
    
    const app = getApp();
    // 检查预加载数据
    if (app.globalData.preloadedMountainData && app.globalData.preloadedMountainData.length > 0) {
      // 【情况A】预加载成功：直接渲染，不显示骨架屏
      console.log('Mountain: 使用预加载数据');
      this.setData({
        postList: app.globalData.preloadedMountainData,
        isLoading: false, // 关键：直接关闭骨架屏
        page: 1,
        _hasFirstLoad: true // 标记已首次加载
      });
      // 使用我们之前写的 updatePostDisplay 来统一更新界面
      this.updatePostDisplay(0);
      app.globalData.preloadedMountainData = null; // 用完即焚
    } else {
      // 【情况B】无预加载：显示骨架屏，并异步请求数据
      console.log('Mountain: 无预加载数据，开始请求');
      this.getMountainData();
    }
  },

  onShow: function () {
    // TabBar 状态更新，必须保留
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    
    // 检查是否需要刷新（发布帖子后）
    try {
      const shouldRefresh = wx.getStorageSync('shouldRefreshMountain');
      if (shouldRefresh) {
        console.log('【mountain】检测到发布标记，刷新数据');
        wx.removeStorageSync('shouldRefreshMountain');
        this.refreshMountainData();
        return; // 刷新后直接返回，不执行后续逻辑
      }
    } catch (e) {
      console.error('检查刷新标记失败:', e);
    }
    
    // 首次进入时刷新数据，之后保持之前的内容
    if (!this.data._hasFirstLoad) {
      console.log('【mountain】首次进入，刷新数据');
      this.refreshMountainData();
    } else {
      console.log('【mountain】再次进入，保持之前内容');
    }
  },

  // 新增：刷新mountain数据的方法
  refreshMountainData: function() {
    console.log('【mountain】开始刷新mountain数据');
    this.setData({
      postList: [],
      currentPostIndex: 0,
      page: 0,
      hasMore: true,
      bgLayers: [
        { url: '', visible: false },
        { url: '', visible: false }
      ],
      activeLayerIndex: 0
    });
    this.getMountainData();
  },

  getMountainData: function () {
    // 你的云函数请求逻辑
    wx.cloud.callFunction({
      name: 'getPostList',
      data: { isPoem: true, isOriginal: false }, // 只获取非原创诗歌
      success: res => {
        console.log('Mountain数据获取成功:', res);
        const posts = res.result.posts || [];
        
        this.setData({
          postList: posts,
          isLoading: false, // 关键：数据返回，关闭骨架屏
          _hasFirstLoad: true // 标记首次加载完成
        });
        // 设置当前帖子
        if (this.data.postList.length > 0) {
          this.setData({
            currentPost: this.data.postList[0]
          });
          this.updatePostDisplay();
        }
      },
      fail: err => {
        console.error('Mountain数据获取失败:', err);
        this.setData({ isLoading: false }); // 关键：请求失败也要关闭骨架屏
      }
    });
  },

  getPostList: function (cb) {
    if (this.data.isLoading) return;
    this.setData({ isLoading: true });
    
    const skip = this.data.page * PAGE_SIZE;
    console.log('开始获取山诗歌列表，skip:', skip, 'page:', this.data.page);

    wx.cloud.callFunction({
      name: 'getPostList',
      data: { skip: skip, limit: PAGE_SIZE, isPoem: true, isOriginal: false }, // 只获取非原创诗歌
      success: res => {
        console.log('获取山诗歌列表结果:', res);
        if (res.result && res.result.success) {
          const posts = res.result.posts || [];
          console.log('获取到山诗歌数量:', posts.length);

          // 调试：检查返回的诗歌数据
          posts.forEach((post, index) => {
            console.log(`山诗歌${index + 1}:`, {
              title: post.title,
              isPoem: post.isPoem,
              isOriginal: post.isOriginal,
              content: post.content ? post.content.substring(0, 50) + '...' : '无内容'
            });
          });
          
          posts.forEach(post => {
            if (!post.imageUrls || post.imageUrls.length === 0) {
              post.imageUrls = post.imageUrl ? [post.imageUrl] : [];
            }
          });

          const newPostList = this.data.page === 0 ? posts : this.data.postList.concat(posts);

          console.log('山postList:', newPostList);

          this.setData({
            postList: newPostList,
            page: this.data.page + 1,
            hasMore: posts.length === PAGE_SIZE,
          });

          // 首次加载或刷新后，初始化显示
          if (this.data.page === 1 && newPostList.length > 0) {
            console.log('第一个山诗歌帖子数据:', {
              title: newPostList[0].title,
              imageUrls: newPostList[0].imageUrls,
              poemBgImage: newPostList[0].poemBgImage,
              hasBgImage: !!newPostList[0].poemBgImage
            });

            this.updatePostDisplay(0); // 使用新函数来统一更新显示
            
            // 预加载后续几张图片，例如第2、3张
            if (newPostList.length > 1) this.loadImageForIndex(1);
            if (newPostList.length > 2) this.loadImageForIndex(2);
          } else {
            console.log('未获取到山诗歌帖子数据');
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
    this.setData({ 
      touchStartX: e.touches[0].clientX,
      touchStartY: e.touches[0].clientY
    });
  },

  touchEnd: function(e) {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const diffX = this.data.touchStartX - touchEndX;
    const diffY = this.data.touchStartY - touchEndY;
    
    // 计算滑动距离和角度
    const distance = Math.sqrt(diffX * diffX + diffY * diffY);
    // 修复角度计算：使用绝对值确保角度正确
    const angle = Math.abs(Math.atan2(Math.abs(diffY), Math.abs(diffX)) * 180 / Math.PI);
    
    // 只有当水平滑动距离足够大，且滑动角度接近水平（小于45度）时才翻页
    if (distance > 80 && Math.abs(diffX) > 50 && angle < 45) {
      if (diffX > 0) {
        this.nextPost();
      } else {
        this.prevPost();
      }
    }
  },

  nextPost: function() {
    if (this.data.currentPostIndex < this.data.postList.length - 1) {
      this.setData({ isTransitioning: true });
      
      this.updatePostDisplay(this.data.currentPostIndex + 1); // 调用新函数

      setTimeout(() => {
        this.setData({ isTransitioning: false });
      }, 500); // 动画时长与CSS中的 transition 一致
    } else {
      if (this.data.hasMore && !this.data.isLoading) {
        this.loadMorePosts(() => {
          if (this.data.postList.length > this.data.currentPostIndex + 1) {
            this.updatePostDisplay(this.data.currentPostIndex + 1);
          }
        });
      }
    }
  },

  prevPost: function() {
    if (this.data.currentPostIndex > 0) {
      this.setData({ isTransitioning: true });
      
      this.updatePostDisplay(this.data.currentPostIndex - 1); // 调用新函数

      setTimeout(() => {
        this.setData({ isTransitioning: false });
      }, 500);
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

  // 加载更多帖子（不显示骨架屏）
  loadMorePosts: function(cb) {
    if (this.data.isLoading) return;
    // 注意：这里不设置 isLoading: true，避免触发骨架屏
    
    const skip = this.data.page * PAGE_SIZE;
    console.log('开始加载更多山诗歌，skip:', skip, 'page:', this.data.page);

    wx.cloud.callFunction({
      name: 'getPostList',
      data: { skip: skip, limit: PAGE_SIZE, isPoem: true, isOriginal: false },
      success: res => {
        console.log('加载更多山诗歌结果:', res);
        if (res.result && res.result.success) {
          const posts = res.result.posts || [];
          console.log('获取到更多山诗歌数量:', posts.length);
          
          posts.forEach(post => {
            if (!post.imageUrls || post.imageUrls.length === 0) {
              post.imageUrls = post.imageUrl ? [post.imageUrl] : [];
            }
          });

          const newPostList = this.data.postList.concat(posts);

          this.setData({
            postList: newPostList,
            page: this.data.page + 1,
            hasMore: posts.length === PAGE_SIZE,
          });

          // 预加载新加载的图片
          const startIndex = this.data.postList.length - posts.length;
          posts.forEach((post, index) => {
            this.loadImageForIndex(startIndex + index);
          });
        }
      },
      fail: () => console.error('加载更多山诗歌失败'),
      complete: () => {
        // 注意：这里不设置 isLoading: false，因为之前没有设置为 true
        if (typeof cb === 'function') cb();
      }
    });
  },

  // 预加载下一首的背景图
  preloadNextBackgroundImage: function(currentIndex) {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= this.data.postList.length) {
      // 如果下一首不存在，检查是否需要加载更多
      if (this.data.hasMore && !this.data.isLoading) {
        this.loadMorePosts(() => {
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

  // --- 核心新函数 ---
  // 统一更新帖子内容和背景的函数
  updatePostDisplay: function(index) {
    if (index < 0 || index >= this.data.postList.length) {
      return;
    }

    const post = this.data.postList[index];
    if (!post) return;

    // 1. 立即更新卡片内容（文字先切换）
    this.setData({
      currentPost: post,
      currentPostIndex: index
    });

    // 2. 延迟切换背景图，让文字先显示
    const imageUrl = post.poemBgImage || (post.imageUrls && post.imageUrls[0]) || '';
    
    // 优先使用预加载好的本地缓存路径
    let finalImageUrl = this.data.preloadedImages[imageUrl];
    
    // 如果本地缓存没有，检查全局预加载缓存
    if (!finalImageUrl) {
      const app = getApp();
      if (app.globalData.preloadedImages && app.globalData.preloadedImages[imageUrl]) {
        finalImageUrl = app.globalData.preloadedImages[imageUrl];
        // 同步到本地缓存
        this.setData({
          [`preloadedImages.${imageUrl}`]: finalImageUrl
        });
      } else {
        finalImageUrl = imageUrl;
      }
    }
    
    // 检查是否是首次显示（双图层都为空）
    const isFirstDisplay = this.data.bgLayers[0].url === '' && this.data.bgLayers[1].url === '';
    
    if (isFirstDisplay) {
      // 首次显示：直接设置第一个图层，不进行切换动画
      console.log('首次显示背景图，直接设置第一个图层');
      this.setData({
        'bgLayers[0].url': finalImageUrl,
        'bgLayers[0].visible': true,
        'bgLayers[1].visible': false,
        activeLayerIndex: 0
      });
      
      // 首次显示时立即预加载第二张图片，确保切换时不会卡顿
      console.log('首次显示完成，立即预加载第二张图片');
      this.preloadNextBackgroundImage(index);
    } else {
      // 后续切换：延迟切换背景图，让文字先显示
      setTimeout(() => {
        this.switchBackgroundImage(finalImageUrl);
      }, 100); // 100ms延迟，让文字先切换
      
      // 预加载下一张
      this.preloadNextBackgroundImage(index);
    }
  },

  // 双图层切换函数
  switchBackgroundImage: function(newImageUrl) {
    if (!newImageUrl) return;

    // 优先使用预加载的本地路径
    const preloadedUrl = this.data.preloadedImages[newImageUrl];
    const finalImageUrl = preloadedUrl || newImageUrl;
    
    console.log('切换背景图:', {
      originalUrl: newImageUrl,
      preloadedUrl: preloadedUrl,
      finalUrl: finalImageUrl,
      hasPreloaded: !!preloadedUrl
    });

    const currentActiveIndex = this.data.activeLayerIndex;
    const nextActiveIndex = (currentActiveIndex + 1) % 2; // 0 -> 1, 1 -> 0

    // 设置待切换的图层索引，等待图片加载完成
    this.pendingLayerIndex = nextActiveIndex;
    this.pendingCurrentIndex = currentActiveIndex;

    // 先设置下一层的图片URL，但不显示
    this.setData({
      [`bgLayers[${nextActiveIndex}].url`]: finalImageUrl,
      [`bgLayers[${nextActiveIndex}].visible`]: false // 确保先隐藏
    });
  },

  // 背景图片加载完成事件
  onBackgroundImageLoad: function(e) {
    const layerIndex = e.currentTarget.dataset.layerIndex;
    console.log(`图层${layerIndex}图片加载完成`);
    
    // 检查是否是待切换的图层
    if (this.pendingLayerIndex === layerIndex) {
      console.log('待切换图层图片加载完成，开始切换透明度');
      
      // 执行透明度切换
      this.setData({
        [`bgLayers[${this.pendingCurrentIndex}].visible`]: false, // 当前层淡出
        [`bgLayers[${this.pendingLayerIndex}].visible`]: true,   // 下一层淡入
        activeLayerIndex: this.pendingLayerIndex
      });
      
      // 清除待切换状态
      this.pendingLayerIndex = null;
      this.pendingCurrentIndex = null;
    }
  },

  // 为指定索引加载图片
  loadImageForIndex: function(index, callback) {
    const post = this.data.postList[index];
    if (!post) return;

    const imageUrl = post.poemBgImage || (post.imageUrls && post.imageUrls[0]) || '';
    if (!imageUrl) return;

    // 检查全局预加载缓存
    const app = getApp();
    if (app.globalData.preloadedImages && app.globalData.preloadedImages[imageUrl]) {
      console.log('使用全局预加载缓存:', imageUrl);
      this.setData({
        [`preloadedImages.${imageUrl}`]: app.globalData.preloadedImages[imageUrl]
      });
      if (typeof callback === 'function') {
        callback(app.globalData.preloadedImages[imageUrl]);
      }
      return;
    }

    // 检查本地预加载缓存
    if (this.data.preloadedImages[imageUrl]) {
      return;
    }

    console.log('开始预加载山图片:', imageUrl);

    // 使用微信图片API预加载
    wx.downloadFile({
      url: imageUrl,
      success: (res) => {
        if (res.statusCode === 200) {
          console.log('山图片预加载成功:', imageUrl);
          this.setData({
            [`preloadedImages.${imageUrl}`]: res.tempFilePath
          });
          // 如果有回调函数，则执行
          if (typeof callback === 'function') {
            callback(res.tempFilePath);
          }
        }
      },
      fail: (err) => {
        console.error('山图片预加载失败:', imageUrl, err);
      }
    });
  },

  
});