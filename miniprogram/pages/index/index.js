// index.js
// 云开发环境已在app.js中初始化，这里不需要重复初始化
const db = wx.cloud.database();
const PAGE_SIZE = 5;
const dataCache = require('../../utils/dataCache');
const imageOptimizer = require('../../utils/imageOptimizer');
const performanceMonitor = require('../../utils/performanceMonitor');
const likeIcon = require('../../utils/likeIcon');

Page({
  data: {
    postList: [],
    votingInProgress: {},
    page: 0,
    hasMore: true,
    isLoading: false, // 恢复线上版本的初始值
    isLoadingMore: false, // 新增：专门用于控制底部"加载中"UI的状态
    swiperHeights: {},
    imageClampHeights: {}, // 新增：单图瘦高图钳制高度
    displayMode: 'square', // 首页只负责广场模式
    imageCache: {}, // 图片缓存
    visiblePosts: new Set(), // 可见的帖子ID集合
    unreadMessageCount: 0, // 未读消息数量
    
    // --- 页面切换相关 ---
    currentPage: 'home', // 'home'、'discover' 或 'test'
    showPageIndicator: false, // 是否显示页面切换提示
    pageIndicatorText: '', // 切换提示文字
    discoverPostList: [], // 发现页的帖子列表
    discoverPage: 0, // 发现页的分页
    discoverHasMore: true, // 发现页是否还有更多数据
    discoverShownPostIds: [], // 发现页已显示的帖子ID，用于防重复
    discoverRefreshTime: 0, // 发现页刷新时间戳
    touchStartX: 0, // 触摸开始X坐标
    touchStartY: 0, // 触摸开始Y坐标
    touchEndX: 0, // 触摸结束X坐标
    touchEndY: 0 // 触摸结束Y坐标
  },

  onLoad: function (options) {
    // 首页只负责广场模式
    this.setData({ displayMode: 'square' });
    this.pageLoadStartTime = Date.now();
    
    // onLoad 只负责触发异步请求，然后立即结束
    this.getIndexData();
  },

  onShow: function () {
    // TabBar 状态更新，必须保留
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    
    // 检查是否需要刷新（发布帖子后）
    try {
      const shouldRefresh = wx.getStorageSync('shouldRefreshIndex');
      if (shouldRefresh) {
        console.log('【index】检测到发布标记，刷新数据');
        wx.removeStorageSync('shouldRefreshIndex');
        this.refreshIndexData();
      }
    } catch (e) {
      console.error('检查刷新标记失败:', e);
    }
    
    // 检查未读消息数量
    this.checkUnreadMessageCount();
  },

  getIndexData: function () {
    // 检查缓存
    const cachedData = dataCache.get('index_postList_cache');
    if (cachedData) {
      console.log('Index: 使用缓存数据');
      performanceMonitor.recordCacheHit('index_postList_cache', true);
      this.setData({
        postList: cachedData,
        page: Math.ceil(cachedData.length / PAGE_SIZE),
        isLoading: false // 关键：数据返回，关闭骨架屏
      });
      performanceMonitor.recordPageLoad('index', this.pageLoadStartTime);
      return;
    } else {
      performanceMonitor.recordCacheHit('index_postList_cache', false);
    }

    // 如果没有缓存，则加载数据
    this.getPostList();
  },

  refreshData: function() {
    // 清除缓存
    dataCache.remove('index_postList_cache');

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
    // 清除缓存
    dataCache.remove('index_postList_cache');

    if (this.data.currentPage === 'home') {
      // 主页刷新
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
    } else if (this.data.currentPage === 'discover') {
      // 发现页刷新 - 重新获取推荐
      this.refreshDiscoverPosts();
      wx.stopPullDownRefresh();
    } else if (this.data.currentPage === 'test') {
      // 测试页刷新 - 跳转到测试页面
      wx.stopPullDownRefresh();
      wx.navigateTo({
        url: '/pages/test/test',
        success: () => {
          console.log('跳转到测试页面成功');
        },
        fail: (err) => {
          console.error('跳转到测试页面失败:', err);
          wx.showToast({
            title: '跳转失败',
            icon: 'none'
          });
        }
      });
    }
  },

  // 移除或禁用 onReachBottom，避免与 onPageScroll 冲突
  /*
  onReachBottom: function () {
    console.log('【首页】onReachBottom触发，但主要加载逻辑在onPageScroll');
    if (!this.data.hasMore || this.data.isLoading) {
      return;
    }
    this.getPostList();
  },
  */

  // 优化页面滚动监听，使用更简单的防抖，移除 createSelectorQuery 提高性能
  onPageScroll: function(e) {
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
    }
    
    this.scrollTimer = setTimeout(() => {
      // 只在首页时处理预加载逻辑，发现页不需要预加载
      if (this.data.currentPage !== 'home') {
        return;
      }
      
      // 只有在非加载中且还有更多数据时才进行后续判断
      if (!this.data.hasMore || this.data.isLoading) {
        return;
      }

      const windowInfo = wx.getWindowInfo();
      const windowHeight = windowInfo.windowHeight;

      // 使用 wx.createSelectorQuery() 获取页面总高度和最后一个元素的位置
      wx.createSelectorQuery().select('#post-list-container').boundingClientRect(containerRect => {
        if (containerRect && containerRect.height > 0) {
          const scrollHeight = containerRect.height; // 使用容器高度更准确
          const scrollTop = e.scrollTop;
          const distanceToBottom = scrollHeight - scrollTop - windowHeight;
          const preloadThreshold = windowHeight * 1.5; // 提前 1.5 屏预加载
          
          if (distanceToBottom < preloadThreshold) {
            console.log('【首页】触发预加载');
            this.getPostList();
          }
        }
      }).exec();
    }, 100); // 100ms 防抖
  },


  onImageLoad: function(e) {
    const { postid, postindex = 0, imgindex = 0, type } = e.currentTarget.dataset;
    const { width: originalWidth, height: originalHeight } = e.detail;
    if (!originalWidth || !originalHeight) return;

    // 缓存图片尺寸信息
    const imageKey = `${postid}_${imgindex}`;
    this.data.imageCache[imageKey] = { width: originalWidth, height: originalHeight };

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
    // 注意：小程序中不需要手动stopPropagation，因为使用了catch:tap绑定
    console.log('【点赞】onVote事件触发', event.currentTarget.dataset);
    
    const postId = event.currentTarget.dataset.postid;
    const index = event.currentTarget.dataset.index;
    
    console.log('【点赞】postId:', postId, 'index:', index);
    
    if (this.data.votingInProgress[postId]) {
      console.log('【点赞】正在投票中，跳过');
      return;
    }
    
    this.setData({ [`votingInProgress.${postId}`]: true });
    
    let postList = this.data.postList;
    const originalVotes = postList[index].votes;
    const originalIsVoted = postList[index].isVoted;
    
    console.log('【点赞】原始状态 - votes:', originalVotes, 'isVoted:', originalIsVoted);
    
    // 立即更新UI，提供即时反馈
    postList[index].votes = originalIsVoted ? originalVotes - 1 : originalVotes + 1;
    postList[index].isVoted = !originalIsVoted;
    postList[index].likeIcon = likeIcon.getLikeIcon(postList[index].votes, postList[index].isVoted);
    
    console.log('【点赞】更新后状态 - votes:', postList[index].votes, 'isVoted:', postList[index].isVoted);
    console.log('【点赞】新的likeIcon:', postList[index].likeIcon);
    
    this.setData({ postList: postList });
    
    // 调用云函数同步数据
    console.log('【点赞】调用云函数vote，postId:', postId);
    wx.cloud.callFunction({
      name: 'vote',
      data: { postId: postId },
      success: res => {
        console.log('【点赞】云函数返回结果:', res);
        if (!res.result.success) {
          console.log('【点赞】云函数返回失败，回滚UI');
          // 如果服务器失败，回滚UI
          postList[index].votes = originalVotes;
          postList[index].isVoted = originalIsVoted;
          postList[index].likeIcon = likeIcon.getLikeIcon(originalVotes, originalIsVoted);
          this.setData({ postList: postList });
        } else if (postList[index].votes !== res.result.votes) {
          console.log('【点赞】服务器票数不同，更新为服务器数据');
          // 如果服务器返回的票数不同，更新为服务器数据
          postList[index].votes = res.result.votes;
          postList[index].likeIcon = likeIcon.getLikeIcon(postList[index].votes, postList[index].isVoted);
          this.setData({ postList: postList });
        } else {
          console.log('【点赞】云函数调用成功，数据已同步');
        }
      },
      fail: (err) => {
        console.error('【点赞】云函数调用失败:', err);
        // 网络失败，回滚UI
        postList[index].votes = originalVotes;
        postList[index].isVoted = originalIsVoted;
        postList[index].likeIcon = likeIcon.getLikeIcon(originalVotes, originalIsVoted);
        this.setData({ postList: postList });
        wx.showToast({ title: '操作失败', icon: 'none' });
      },
      complete: () => {
        console.log('【点赞】云函数调用完成');
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
  onAvatarLoad: function(e) { 
    // 头像加载成功，不需要特殊处理
    console.log('头像加载成功', e.detail);
  },
  onLikeIconError: function(e) {
    console.error('点赞图标加载失败', e.detail, '图标路径:', e.currentTarget.dataset.src);
  },

  // 图片预加载
  preloadImages: function(posts) {
    const imageUrls = posts
      .filter(post => post.imageUrls && post.imageUrls.length > 0)
      .map(post => post.imageUrls[0])
      .slice(0, 3); // 只预加载前3张图片
    
    if (imageUrls.length > 0) {
      imageOptimizer.preloadImages(imageUrls, (url, success) => {
        if (success) {
          console.log('图片预加载成功:', url);
        }
      });
    }
  },

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

  // 优化 getPostList 函数，这是核心
  getPostList: function (cb) {
    // 【修复】同时检查 isLoading 和 isLoadingMore，确保只有一个请求在进行
    if (this.data.isLoading || this.data.isLoadingMore || !this.data.hasMore) {
      console.log('【首页】getPostList被阻止：正在加载中或没有更多数据');
      if (typeof cb === 'function') cb();
      return;
    }
    
    const skip = this.data.page * PAGE_SIZE;
    const isFirstLoad = this.data.page === 0;

    // 根据加载类型设置不同的状态
    if (isFirstLoad) {
      // 首次加载：显示骨架屏
      this.setData({ isLoading: true });
    } else {
      // 滑动加载更多：显示底部加载提示
      this.setData({ isLoadingMore: true });
    }
    
    const apiStartTime = Date.now();
    wx.cloud.callFunction({
      name: 'getPostList',
      data: { skip: skip, limit: PAGE_SIZE },
      success: res => {
        performanceMonitor.recordApiCall('getPostList', apiStartTime);
        
        if (res.result && res.result.success) {
          let posts = res.result.posts || [];
          
          // --- 关键优化：预处理图片尺寸，防止抖动 ---
          posts = posts.map(post => {
            if (!post.imageUrls || post.imageUrls.length === 0) {
              post.imageUrls = post.imageUrl ? [post.imageUrl] : [];
            }

            // 假设图片URL中包含了尺寸信息，或者你有固定的宽高比
            // 如果没有，则需要在onImageLoad中动态计算并更新，但最好有预设值
            // 这里我们假设一个默认的 4:3 比例用于占位
            if (post.imageUrls.length > 0) {
                post.imageStyle = `height: 0; padding-bottom: 75%;`; // 4:3 宽高比占位
            }
            
            // 添加点赞图标信息
            post.likeIcon = likeIcon.getLikeIcon(post.votes || 0, post.isVoted || false);
            
            return post;
          });

          const newPostsCount = posts.length;
          const currentPostList = this.data.postList;
          
          // 使用更高效的方式更新列表数据 - 修复语法错误
          const newPostList = currentPostList.concat(posts);
          const updateData = {
            postList: newPostList,
            page: this.data.page + 1,
            hasMore: newPostsCount === PAGE_SIZE,
          };

          this.setData(updateData);

          if (isFirstLoad) {
            dataCache.set('index_postList_cache', newPostList);
            this.preloadImages(posts);
            performanceMonitor.recordPageLoad('index', this.pageLoadStartTime);
          }
        } else {
          // 当没有更多数据时，不显示错误提示，而是设置hasMore为false
          if (this.data.page === 0) {
            // 首次加载失败才显示错误
            wx.showToast({ title: '加载失败', icon: 'none' });
          } else {
            // 加载更多时没有数据，这是正常情况，设置hasMore为false
            this.setData({ hasMore: false });
          }
        }
      },
      fail: (err) => {
        console.error('【首页】getPostList云函数调用失败:', err);
        // 只有在首次加载失败时才显示网络错误提示
        if (isFirstLoad) {
          wx.showToast({ title: '网络错误', icon: 'none' });
        } else {
          // 加载更多时网络错误，静默处理，不显示错误提示
          console.log('【首页】加载更多时网络错误，静默处理');
        }
      },
      complete: () => {
        // 请求完成后，根据加载类型释放相应的状态
        if (isFirstLoad) {
          this.setData({ isLoading: false });
        } else {
          this.setData({ isLoadingMore: false });
        }
        if (typeof cb === 'function') cb();
      }
    });
  },

  // 模式切换现在通过底部tabBar实现，不再需要手动切换

  // 检查未读消息数量
  checkUnreadMessageCount: function() {
    wx.cloud.callFunction({
      name: 'getUnreadMessageCount',
      success: res => {
        if (res.result && res.result.success) {
          this.setData({
            unreadMessageCount: res.result.count || 0
          });
        }
      },
      fail: err => {
        console.error('获取未读消息数量失败:', err);
      }
    });
  },

  // 跳转到消息页面
  navigateToMessages: function() {
    wx.navigateTo({
      url: '/pages/messages/messages',
      success: () => {
        console.log('跳转到消息页面成功');
      },
      fail: err => {
        console.error('跳转到消息页面失败:', err);
        wx.showToast({
          title: '跳转失败',
          icon: 'none'
        });
      }
    });
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
  },

  // 搜索框点击处理
  navigateToSearch: function() {
    console.log('点击搜索框，跳转到搜索页面');
    
    wx.navigateTo({
      url: '/pages/search/search',
      success: () => {
        console.log('跳转到搜索页面成功');
      },
      fail: (err) => {
        console.error('跳转到搜索页面失败:', err);
        wx.showToast({
          title: '跳转失败',
          icon: 'none'
        });
      }
    });
  },

  // --- 页面切换相关函数 ---
  
  // 触摸开始事件
  touchStart: function(e) {
    this.setData({ 
      touchStartX: e.touches[0].clientX,
      touchStartY: e.touches[0].clientY
    });
  },

  // 触摸结束事件
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
        // 左滑：根据当前页面决定切换逻辑
        if (this.data.currentPage === 'discover') {
          console.log('左滑从发现页切换回主页');
          this.switchToHome();
        } else if (this.data.currentPage === 'test') {
          console.log('左滑从测试页切换回主页');
          this.switchToHome();
        }
      } else {
        // 右滑：根据当前页面决定切换逻辑
        if (this.data.currentPage === 'home') {
          console.log('右滑从主页切换到发现页');
          this.switchToDiscover();
        } else if (this.data.currentPage === 'discover') {
          console.log('右滑从发现页切换到测试页');
          this.switchToTest();
        }
      }
    }
  },
  
  // 切换到发现页
  switchToDiscover: function() {
    if (this.data.currentPage === 'discover') {
      console.log('已经在发现页，无需切换');
      return;
    }
    
    console.log('切换到发现页');
    this.setData({
      currentPage: 'discover',
      showPageIndicator: true,
      pageIndicatorText: '发现页'
    });
    
    // 加载发现页数据（如果还没有）
    if (this.data.discoverPostList.length === 0) {
      console.log('开始加载发现页数据');
      this.loadDiscoverPosts();
    } else {
      console.log('发现页已有数据，直接切换');
    }
    
    // 3秒后隐藏提示
    setTimeout(() => {
      this.setData({ showPageIndicator: false });
    }, 3000);
  },
  
  // 切换回主页
  switchToHome: function() {
    if (this.data.currentPage === 'home') {
      console.log('已经在主页，无需切换');
      return;
    }
    
    console.log('切换回主页');
    this.setData({
      currentPage: 'home',
      showPageIndicator: true,
      pageIndicatorText: '主页'
    });
    
    // 3秒后隐藏提示
    setTimeout(() => {
      this.setData({ showPageIndicator: false });
    }, 3000);
  },
  
  // 切换到测试页
  switchToTest: function() {
    if (this.data.currentPage === 'test') {
      console.log('已经在测试页，无需切换');
      return;
    }
    
    console.log('切换到测试页');
    this.setData({
      currentPage: 'test',
      showPageIndicator: true,
      pageIndicatorText: '测试页'
    });
    
    // 3秒后隐藏提示
    setTimeout(() => {
      this.setData({ showPageIndicator: false });
    }, 3000);
  },
  
  // 加载发现页数据 - 使用推荐算法
  loadDiscoverPosts: function() {
    console.log('开始加载发现页推荐数据');
    
    // 发现页只使用推荐算法，不再加载更多
    this.loadRecommendationPosts();
  },

  // 加载推荐帖子（首次加载）
  loadRecommendationPosts: function() {
    console.log('使用推荐算法加载发现页数据');
    
    wx.cloud.callFunction({
      name: 'getRecommendationFeed',
      data: { 
        personalizedLimit: 3, // 3个个性化推荐
        hotLimit: 2, // 2个热门推荐
        skip: 0,
        excludePostIds: this.data.discoverShownPostIds
      },
      success: res => {
        console.log('获取推荐数据结果:', res);
        if (res.result && res.result.success) {
          const posts = res.result.posts || [];
          console.log(`获取到推荐帖子数量: ${posts.length} (个性化: ${res.result.personalizedCount}, 按标签: ${res.result.tagBasedCount}, 热门: ${res.result.hotCount}, 最新: ${res.result.latestCount})`);
          
          // 处理图片URL和样式
          posts.forEach(post => {
            if (!post.imageUrls || post.imageUrls.length === 0) {
              post.imageUrls = post.imageUrl ? [post.imageUrl] : [];
            }

            // 设置图片占位样式
            if (post.imageUrls.length > 0) {
              post.imageStyle = `height: 0; padding-bottom: 75%;`; // 4:3 宽高比占位
            }
            
            // 添加点赞图标信息
            post.likeIcon = likeIcon.getLikeIcon(post.votes || 0, post.isVoted || false);
          });

          // 记录已显示的帖子ID
          const newShownIds = posts.map(post => post._id);
          const updatedShownIds = [...this.data.discoverShownPostIds, ...newShownIds];

          this.setData({
            discoverPostList: posts,
            discoverPage: 1,
            discoverHasMore: false, // 推荐算法只显示5个，没有更多
            discoverShownPostIds: updatedShownIds,
            discoverRefreshTime: Date.now()
          });
          
          console.log('发现页推荐数据设置完成，帖子数量:', posts.length);
        } else {
          console.error('获取推荐数据失败:', res);
          wx.showToast({ title: '推荐加载失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('推荐数据请求失败:', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },


  // 刷新发现页推荐
  refreshDiscoverPosts: function() {
    console.log('刷新发现页推荐');
    
    // 重置状态
    this.setData({
      discoverPostList: [],
      discoverPage: 0,
      discoverHasMore: true,
      discoverShownPostIds: [],
      discoverRefreshTime: 0
    });
    
    // 重新加载推荐
    this.loadRecommendationPosts();
  },

  // 刷新广场页数据（发布帖子后调用）
  refreshIndexData: function() {
    console.log('【index】开始刷新广场页数据');
    
    // 清除缓存
    dataCache.clear('index_postList_cache');
    
    // 重置状态
    this.setData({
      postList: [],
      page: 0,
      hasMore: true,
      isLoading: false
    });
    
    // 重新加载数据
    this.getIndexData();
  },

  // 跳转到测试页面
  navigateToTestPage: function() {
    console.log('跳转到测试页面');
    wx.navigateTo({
      url: '/pages/test/test',
      success: () => {
        console.log('跳转到测试页面成功');
      },
      fail: (err) => {
        console.error('跳转到测试页面失败:', err);
        wx.showToast({
          title: '跳转失败',
          icon: 'none'
        });
      }
    });
  }
});