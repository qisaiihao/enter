// test.js
// 测试页面 - 复制主页内容
const db = wx.cloud.database();
const PAGE_SIZE = 10;
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
    isLoading: false, // 初始设置为false，让getPostList能正常执行
    isLoadingMore: false,
    swiperHeights: {},
    imageClampHeights: {},
    displayMode: 'square',
    imageCache: {},
    visiblePosts: new Set(),
    unreadMessageCount: 0,
    // 随机背景色配置
    backgroundColors: ['#a4c4bd', '#c9cfcf', '#906161', '#909388'],
    lastUsedColorIndex: -1, // 记录上一个使用的颜色索引
  },

  onLoad: function (options) {
    this.setData({ displayMode: 'square' });
    this.pageLoadStartTime = Date.now();
    this.getIndexData();
  },

  // 生成随机背景色，确保相邻帖子颜色不同
  generateRandomBackgroundColor: function() {
    const colors = this.data.backgroundColors;
    const lastIndex = this.data.lastUsedColorIndex;
    
    // 如果这是第一个帖子，随机选择一个颜色
    if (lastIndex === -1) {
      const randomIndex = Math.floor(Math.random() * colors.length);
      this.setData({ lastUsedColorIndex: randomIndex });
      return colors[randomIndex];
    }
    
    // 排除上一个使用的颜色，从剩余颜色中随机选择
    const availableColors = colors.filter((_, index) => index !== lastIndex);
    const randomIndex = Math.floor(Math.random() * availableColors.length);
    const selectedColor = availableColors[randomIndex];
    
    // 找到选中颜色在原数组中的索引
    const newLastIndex = colors.indexOf(selectedColor);
    this.setData({ lastUsedColorIndex: newLastIndex });
    
    return selectedColor;
  },

  onShow: function () {
    // TabBar 状态更新
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    
    // 检查是否需要刷新
    try {
      const shouldRefresh = wx.getStorageSync('shouldRefreshIndex');
      if (shouldRefresh) {
        console.log('【test】检测到发布标记，刷新数据');
        wx.removeStorageSync('shouldRefreshIndex');
        this.refreshIndexData();
      }
    } catch (e) {
      console.error('检查刷新标记失败:', e);
    }
  },

  getIndexData: function () {
    console.log('Test: 开始获取数据，当前状态:', {
      isLoading: this.data.isLoading,
      isLoadingMore: this.data.isLoadingMore,
      hasMore: this.data.hasMore,
      page: this.data.page
    });
    
    // 直接加载数据，不使用缓存
    this.getPostList();
  },

  refreshData: function() {
    // 清除缓存
    dataCache.remove('test_postList_cache');

    this.setData({
      postList: [],
      swiperHeights: {},
      imageClampHeights: {},
      page: 0,
      hasMore: true,
      isLoading: true,
      isLoadingMore: false,
      lastUsedColorIndex: -1 // 重置颜色索引
    }, () => {
      this.getPostList();
    });
  },

  onPullDownRefresh: function () {
    // 清除缓存
    dataCache.remove('test_postList_cache');

    this.setData({
      postList: [],
      swiperHeights: {},
      page: 0,
      hasMore: true,
      isLoading: true,
      isLoadingMore: false,
      lastUsedColorIndex: -1 // 重置颜色索引
    }, () => {
      this.getPostList(() => {
        wx.stopPullDownRefresh();
      });
    });
  },

  // 页面滚动监听
  onPageScroll: function(e) {
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
    }
    
    this.scrollTimer = setTimeout(() => {
      if (!this.data.hasMore || this.data.isLoading) {
        return;
      }

      const windowInfo = wx.getWindowInfo();
      const windowHeight = windowInfo.windowHeight;

      wx.createSelectorQuery().select('#post-list-container').boundingClientRect(containerRect => {
        if (containerRect && containerRect.height > 0) {
          const scrollHeight = containerRect.height;
          const scrollTop = e.scrollTop;
          const distanceToBottom = scrollHeight - scrollTop - windowHeight;
          const preloadThreshold = windowHeight * 1.5;
          
          if (distanceToBottom < preloadThreshold) {
            console.log('【测试页】触发预加载');
            this.getPostList();
          }
        }
      }).exec();
    }, 100);
  },


  onVote: function(event) {
    console.log('【测试页点赞】onVote事件触发', event.currentTarget.dataset);
    
    const postId = event.currentTarget.dataset.postid;
    const index = event.currentTarget.dataset.index;
    
    if (this.data.votingInProgress[postId]) {
      console.log('【测试页点赞】正在投票中，跳过');
      return;
    }
    
    this.setData({ [`votingInProgress.${postId}`]: true });
    
    let postList = this.data.postList;
    const originalVotes = postList[index].votes;
    const originalIsVoted = postList[index].isVoted;
    
    // 立即更新UI
    postList[index].votes = originalIsVoted ? originalVotes - 1 : originalVotes + 1;
    postList[index].isVoted = !originalIsVoted;
    postList[index].likeIcon = likeIcon.getLikeIcon(postList[index].votes, postList[index].isVoted);
    
    this.setData({ postList: postList });
    
    // 调用云函数同步数据
    wx.cloud.callFunction({
      name: 'vote',
      data: { postId: postId },
      success: res => {
        if (!res.result.success) {
          // 回滚UI
          postList[index].votes = originalVotes;
          postList[index].isVoted = originalIsVoted;
          postList[index].likeIcon = likeIcon.getLikeIcon(originalVotes, originalIsVoted);
          this.setData({ postList: postList });
        } else if (postList[index].votes !== res.result.votes) {
          postList[index].votes = res.result.votes;
          postList[index].likeIcon = likeIcon.getLikeIcon(postList[index].votes, postList[index].isVoted);
          this.setData({ postList: postList });
        }
      },
      fail: (err) => {
        console.error('【测试页点赞】云函数调用失败:', err);
        // 回滚UI
        postList[index].votes = originalVotes;
        postList[index].isVoted = originalIsVoted;
        postList[index].likeIcon = likeIcon.getLikeIcon(originalVotes, originalIsVoted);
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

  onLikeIconError: function(e) {
    console.error('点赞图标加载失败', e.detail, '图标路径:', e.currentTarget.dataset.src);
  },

  // 获取帖子列表
  getPostList: function (cb) {
    console.log('【测试页】getPostList调用，当前状态:', {
      isLoading: this.data.isLoading,
      isLoadingMore: this.data.isLoadingMore,
      hasMore: this.data.hasMore,
      page: this.data.page
    });
    
    // 简化条件判断，只在真正重复请求时才阻止
    if (this.data.isLoading && this.data.isLoadingMore) {
      console.log('【测试页】getPostList被阻止：同时有两个加载状态');
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
    
    const apiStartTime = Date.now();
    wx.cloud.callFunction({
      name: 'getPostList',
      data: { skip: skip, limit: PAGE_SIZE, isPoem: true, isOriginal: true },
      success: res => {
        performanceMonitor.recordApiCall('getPostList', apiStartTime);
        
        if (res.result && res.result.success) {
          let posts = res.result.posts || [];
          console.log('【测试页】获取到帖子数据:', posts.length, '个');
          
          // 预处理数据
          posts = posts.map(post => {
            post.likeIcon = likeIcon.getLikeIcon(post.votes || 0, post.isVoted || false);
            post.isExpanded = false; // 默认收起状态
            post.backgroundColor = this.generateRandomBackgroundColor(); // 分配随机背景色
            // 根据背景色设置文字颜色
            post.textColor = post.backgroundColor === '#c9cfcf' ? '#333' : 'white';
            return post;
          });

          const newPostsCount = posts.length;
          const currentPostList = this.data.postList;
          
          // 过滤重复的帖子，避免wx:key重复警告
          const existingIds = new Set(currentPostList.map(post => post._id));
          const uniqueNewPosts = posts.filter(post => !existingIds.has(post._id));
          
          const newPostList = currentPostList.concat(uniqueNewPosts);
          const updateData = {
            postList: newPostList,
            page: this.data.page + 1,
            hasMore: uniqueNewPosts.length === PAGE_SIZE, // 使用去重后的数据判断
          };

          console.log('【测试页】更新数据:', {
            newPostsCount,
            uniqueNewPosts: uniqueNewPosts.length,
            totalPosts: newPostList.length,
            page: updateData.page,
            hasMore: updateData.hasMore
          });

          this.setData(updateData);

          if (isFirstLoad) {
            dataCache.set('test_postList_cache', newPostList);
            performanceMonitor.recordPageLoad('test', this.pageLoadStartTime);
          }
        } else {
          if (this.data.page === 0) {
            wx.showToast({ title: '加载失败', icon: 'none' });
          } else {
            this.setData({ hasMore: false });
          }
        }
      },
      fail: (err) => {
        console.error('【测试页】getPostList云函数调用失败:', err);
        if (isFirstLoad) {
          wx.showToast({ title: '网络错误', icon: 'none' });
        }
      },
      complete: () => {
        console.log('【测试页】getPostList完成，重置加载状态');
        this.setData({ 
          isLoading: false,
          isLoadingMore: false 
        });
        if (typeof cb === 'function') cb();
      }
    });
  },



  // 切换帖子展开/收起状态
  togglePostExpansion: function(e) {
    const index = e.currentTarget.dataset.index;
    const postList = this.data.postList;
    
    // 切换展开状态
    postList[index].isExpanded = !postList[index].isExpanded;
    
    this.setData({
      postList: postList
    });
    
    console.log(`帖子 ${index} 展开状态:`, postList[index].isExpanded);
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


  // 刷新测试页数据
  refreshIndexData: function() {
    console.log('【test】开始刷新测试页数据');
    
    // 清除缓存
    dataCache.clear('test_postList_cache');
    
    // 重置状态
    this.setData({
      postList: [],
      page: 0,
      hasMore: true,
      isLoading: true,
      isLoadingMore: false,
      lastUsedColorIndex: -1 // 重置颜色索引
    });
    
    // 重新加载数据
    this.getIndexData();
  }
});
