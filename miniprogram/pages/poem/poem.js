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
    backgroundImage: '', // 这个变量可以废弃了，或者只用来做逻辑判断
    isTransitioning: false,
    preloadedImages: {},

    // --- 新增数据 ---
    currentPost: null, // 专门存放当前帖子的数据
    bgLayers: [ // 管理背景图层的数组
      { url: '', visible: false },
      { url: '', visible: false }
    ],
    activeLayerIndex: 0 // 当前激活的图层索引 (0 或 1)
  },

  onLoad: function () {
    console.log('Poem 页面 onLoad');
    
    // 新增一个标志位，告诉 onShow 这是第一次加载
    this.isFirstLoad = true; 

    const app = getApp();
    if (app.globalData.preloadedPoemData && app.globalData.preloadedPoemData.length > 0) {
      console.log('成功使用预加载的数据！');
      
      // 使用 preloadedPoemData 来设置初始内容
      const preloadedData = app.globalData.preloadedPoemData;
      this.setData({
        postList: preloadedData,
        currentPostIndex: 0,
        page: 1, // 因为已经加载了第一页
        hasMore: true
      });
      
      // 使用我们之前写的 updatePostDisplay 来统一更新界面
      this.updatePostDisplay(0);

      // 清空全局数据，防止重复使用
      app.globalData.preloadedPoemData = null;
    } else {
      console.log('没有预加载数据，正常加载');
      this.getPostList();
    }
  },

  onShow: function () {
    console.log('Poem 页面 onShow');
    console.log('poem.js onShow is setting selected to 1'); // 添加这行日志
    
    // 1. 无条件更新 TabBar 状态
    // 这一步必须是 onShow 的第一件事，且没有任何条件判断
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      console.log('poem.js: getTabBar() 存在，正在设置 selected: 1');
      this.getTabBar().setData({
        selected: 1 // 1 是 "路" 的索引
      });
      console.log('poem.js: tabBar selected 已设置为 1');
    } else {
      console.log('poem.js: getTabBar() 不存在或为空');
    }
    
    // 2. 处理页面数据刷新逻辑
    // 这里的 isFirstLoad 逻辑可以保留，因为它只和页面内容有关，不影响 TabBar
    if (this.isFirstLoad) {
      this.isFirstLoad = false; // 重置标志位
      // 第一次加载时，onLoad 已经获取了数据，所以这里不需要再做什么
      console.log('首次显示 Poem 页面，数据已由 onLoad 加载');
    } else {
      // 如果是从其他页面返回，执行你的刷新逻辑
      console.log('从其他页面返回 Poem 页面，执行刷新');
      this.setData({
        postList: [],
        currentPostIndex: 0,
        page: 0,
        hasMore: true,
        backgroundImage: ''
      }, () => {
        this.getPostList();
      });
    }
  },

  getPostList: function (cb) {
    if (this.data.isLoading) return;
    this.setData({ isLoading: true });
    
    const skip = this.data.page * PAGE_SIZE;
    console.log('开始获取路诗歌列表，skip:', skip, 'page:', this.data.page);

    wx.cloud.callFunction({
      name: 'getPostList',
      data: { skip: skip, limit: PAGE_SIZE, isPoem: true, isOriginal: true }, // 只获取原创诗歌
      success: res => {
        console.log('获取路诗歌列表结果:', res);
        if (res.result && res.result.success) {
          const posts = res.result.posts || [];
          console.log('获取到路诗歌数量:', posts.length);

          // 调试：检查返回的诗歌数据
          posts.forEach((post, index) => {
            console.log(`路诗歌${index + 1}:`, {
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

          console.log('路postList:', newPostList);

          this.setData({
            postList: newPostList,
            page: this.data.page + 1,
            hasMore: posts.length === PAGE_SIZE,
          });

          // 首次加载或刷新后，初始化显示
          if (this.data.page === 1 && newPostList.length > 0) {
            console.log('第一个路诗歌帖子数据:', {
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
            console.log('未获取到诗歌帖子数据');
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
      this.setData({ isTransitioning: true });
      
      this.updatePostDisplay(this.data.currentPostIndex + 1); // 调用新函数

      setTimeout(() => {
        this.setData({ isTransitioning: false });
      }, 500); // 动画时长与CSS中的 transition 一致
    } else {
      if (this.data.hasMore && !this.data.isLoading) {
        this.getPostList(() => {
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
    console.error('图片加载失败', e.detail);
  },

  // 预加载下一首的背景图
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

  // --- 核心新函数 ---
  // 统一更新帖子内容和背景的函数
  updatePostDisplay: function(index) {
    if (index < 0 || index >= this.data.postList.length) {
      return;
    }

    const post = this.data.postList[index];
    if (!post) return;

    // 1. 更新卡片内容
    this.setData({
      currentPost: post,
      currentPostIndex: index
    });

    // 2. 准备切换背景
    const imageUrl = post.poemBgImage || (post.imageUrls && post.imageUrls[0]) || '';
    // 优先使用预加载好的本地缓存路径
    const finalImageUrl = this.data.preloadedImages[imageUrl] || imageUrl;
    this.switchBackgroundImage(finalImageUrl);

    // 3. 预加载下一张
    this.preloadNextBackgroundImage(index);
  },

  // 双图层切换函数
  switchBackgroundImage: function(newImageUrl) {
    if (!newImageUrl) return;

    const currentActiveIndex = this.data.activeLayerIndex;
    const nextActiveIndex = (currentActiveIndex + 1) % 2; // 0 -> 1, 1 -> 0

    this.setData({
      [`bgLayers[${nextActiveIndex}].url`]: newImageUrl,
      [`bgLayers[${currentActiveIndex}].visible`]: false, // 当前层淡出
      [`bgLayers[${nextActiveIndex}].visible`]: true,   // 下一层淡入
      activeLayerIndex: nextActiveIndex
    });
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

    console.log('开始预加载图片:', imageUrl);

    // 使用微信图片API预加载
    wx.downloadFile({
      url: imageUrl,
      success: (res) => {
        if (res.statusCode === 200) {
          console.log('图片预加载成功:', imageUrl);
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
        console.error('图片预加载失败:', imageUrl, err);
      }
    });
  },

  
});