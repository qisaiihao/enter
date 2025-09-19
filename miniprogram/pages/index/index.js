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
    unreadMessageCount: 0 // 未读消息数量
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
          wx.showToast({ title: '加载失败', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('【首页】getPostList云函数调用失败:', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
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
    
    // 这里可以实现标签筛选功能
    // 暂时显示一个提示，后续可以扩展为筛选功能
    wx.showToast({
      title: `点击了标签: ${tag}`,
      icon: 'none',
      duration: 2000
    });
    
    // 可以在这里添加跳转到标签筛选页面的逻辑
    // wx.navigateTo({
    //   url: `/pages/tag-filter/tag-filter?tag=${encodeURIComponent(tag)}`
    // });
  }
});