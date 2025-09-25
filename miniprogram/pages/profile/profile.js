const app = getApp();

const PAGE_SIZE = 5;

Page({
  data: {
    isLoading: true, // 默认显示骨架屏
    userInfo: {},
    isSidebarOpen: false,
    myPosts: [],
    page: 0,
    hasMore: true,
    PAGE_SIZE: PAGE_SIZE,
    swiperHeights: {}, // 多图swiper高度
    imageClampHeights: {}, // 单图瘦高图钳制高度
    _hasFirstShow: false, // 新增：标记是否首次进入
    unreadCount: 0, // 未读消息数量
    isLoadingMore: false, // 是否正在加载更多
    
    // 新增：标签切换相关
    currentTab: 'posts', // 'posts' | 'favorites'
    favoriteList: [], // 收藏列表
    favoritePage: 0, // 收藏分页
    favoriteHasMore: true, // 收藏是否有更多
    favoriteLoading: false, // 收藏加载状态
    
    // 新增：权限控制
    currentUserOpenid: '', // 当前用户openid
    isAdmin: false, // 是否为管理员（只有你能看到图片管理入口）
    
  },

  onLoad: function (options) {
    // 计算3:4比例高度（宽3高4，竖图）
    const windowWidth = wx.getSystemInfoSync().windowWidth;
    const fixedHeight = Math.round(windowWidth * 4 / 3);
    this.setData({ swiperFixedHeight: fixedHeight });
    
    // onLoad 只负责触发异步请求，然后立即结束
    this.getProfileData();
  },

  onShow: function () {
    // TabBar 状态更新，必须保留
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    
    // 每次进入页面时主动刷新数据（但避免首次加载时重复调用）
    if (this.data._hasFirstShow) {
      console.log('【profile】onShow触发，开始刷新数据');
      this.refreshProfileData();
    } else {
      console.log('【profile】首次显示，标记已显示');
      this.setData({ _hasFirstShow: true });
    }
  },

  getProfileData: function () {
    // 获取用户信息和帖子数据
    this.checkLoginAndFetchData();
  },

  // 新增：刷新个人资料数据的方法（使用与下拉刷新相同的逻辑）
  refreshProfileData: function() {
    console.log('【profile】开始刷新个人资料数据，当前标签:', this.data.currentTab);
    
    // 检查是否需要刷新首页数据
    const shouldRefreshIndex = wx.getStorageSync('shouldRefreshIndex');
    if (shouldRefreshIndex) {
      console.log('【profile】检测到首页需要刷新标记，清除缓存');
      wx.removeStorageSync('shouldRefreshIndex');
    }
    
    // 刷新用户信息（只在有用户信息时刷新，避免重复调用）
    if (this.data.userInfo && this.data.userInfo._openid) {
      this.fetchUserProfile();
    }
    
    // 使用与下拉刷新完全相同的逻辑
    if (this.data.currentTab === 'posts') {
      this.setData({
        myPosts: [],
        page: 0,
        hasMore: true,
        isLoadingMore: false,
        swiperHeights: {},
        imageClampHeights: {},
      });
      this.loadMyPosts(() => {
        console.log('【profile】onShow刷新帖子数据完成');
      });
    } else if (this.data.currentTab === 'favorites') {
      this.setData({
        favoriteList: [],
        favoritePage: 0,
        favoriteHasMore: true,
        favoriteLoading: false,
        swiperHeights: {},
        imageClampHeights: {},
      });
      this.loadFavorites(() => {
        console.log('【profile】onShow刷新收藏数据完成');
      });
    }
    
    // 检查未读消息数量
    this.checkUnreadMessages();
  },

  onPullDownRefresh: function () {
    console.log('【profile】下拉刷新触发，当前标签:', this.data.currentTab);
    if (this.data.currentTab === 'posts') {
      this.setData({
        myPosts: [],
        page: 0,
        hasMore: true,
        swiperHeights: {},
        imageClampHeights: {},
      });
      this.loadMyPosts(() => {
        wx.stopPullDownRefresh();
        console.log('【profile】下拉刷新结束');
      });
    } else if (this.data.currentTab === 'favorites') {
      this.setData({
        favoriteList: [],
        favoritePage: 0,
        favoriteHasMore: true,
        swiperHeights: {},
        imageClampHeights: {},
      });
      this.loadFavorites(() => {
        wx.stopPullDownRefresh();
        console.log('【profile】收藏下拉刷新结束');
      });
    }
  },

  onReachBottom: function () {
    console.log('【profile】触底加载触发', 'currentTab:', this.data.currentTab);
    if (this.data.currentTab === 'posts') {
      console.log('【profile】触底加载我的帖子', 'hasMore:', this.data.hasMore, 'isLoading:', this.data.isLoading, '当前页:', this.data.page);
      if (!this.data.hasMore || this.data.isLoading) return;
      this.loadMyPosts();
    } else if (this.data.currentTab === 'favorites') {
      console.log('【profile】触底加载收藏', 'favoriteHasMore:', this.data.favoriteHasMore, 'favoriteLoading:', this.data.favoriteLoading);
      if (!this.data.favoriteHasMore || this.data.favoriteLoading) return;
      this.loadFavorites();
    }
  },

  // 强制刷新数据
  forceRefresh: function() {
    console.log('强制刷新数据');
    // 清除缓存
    this.setData({
      userInfo: {},
      myPosts: [],
      isLoading: true,
      swiperHeights: {},
      imageClampHeights: {},
    });
    // 重新获取数据
    this.checkLoginAndFetchData();
  },

  checkLoginAndFetchData: function() {
    const storedUserInfo = wx.getStorageSync('userInfo');
    console.log('存储的用户信息:', storedUserInfo);
    
    if (storedUserInfo && storedUserInfo._openid) {
      console.log('用户已登录，开始获取个人资料和帖子数据');
      this.fetchUserProfile();
      // 首次加载时也要加载帖子数据
      this.loadMyPosts();
    } else {
      console.log('用户未登录，存储的用户信息:', storedUserInfo);
      this.setData({ isLoading: false });
      wx.showToast({ title: '请先登录', icon: 'none' });
      // Optionally, redirect to a login page
      // wx.redirectTo({ url: '/pages/login/login' });
    }
  },

  fetchUserProfile: function() {
    // 首先获取当前用户的openid
    wx.cloud.callFunction({
      name: 'getOpenId',
      success: openIdRes => {
        if (openIdRes.result && openIdRes.result.openid) {
          const currentOpenid = openIdRes.result.openid;
          const isAdmin = currentOpenid === 'ojYBd1_A3uCbQ1LGcHxWxOAeA5SE'; // 你的openid
          
          console.log('当前用户openid:', currentOpenid);
          console.log('是否为管理员:', isAdmin);
          
          this.setData({
            currentUserOpenid: currentOpenid,
            isAdmin: isAdmin
          });
        }
        
        // 继续获取用户资料（无论openid获取是否成功）
        wx.cloud.callFunction({
          name: 'getMyProfileData',
          success: res => {
            console.log('getMyProfileData 返回：', res);
            if (res.result && res.result.success && res.result.userInfo) {
              const user = res.result.userInfo;
              if (user.birthday) {
                user.age = this.calculateAge(user.birthday);
              } else {
                user.age = '';
              }
              // 只更新 userInfo，不更新 myPosts
              this.setData({ 
                userInfo: user,
                isLoading: false // 关键：数据返回，关闭骨架屏
              });
            } else {
              wx.showToast({ title: '个人资料数据异常', icon: 'none', duration: 3000 });
              console.error('个人资料数据异常', res);
              const storedUserInfo = wx.getStorageSync('userInfo');
              if(storedUserInfo) {
                if (storedUserInfo.birthday) {
                  storedUserInfo.age = this.calculateAge(storedUserInfo.birthday);
                }
                this.setData({ 
                  userInfo: storedUserInfo,
                  isLoading: false // 关键：数据返回，关闭骨架屏
                });
              }
            }
          },
          fail: err => {
            wx.showToast({ title: 'getMyProfileData 云函数失败', icon: 'none', duration: 3000 });
            console.error('getMyProfileData 云函数失败', err);
            const storedUserInfo = wx.getStorageSync('userInfo');
            if(storedUserInfo) {
              if (storedUserInfo.birthday) {
                storedUserInfo.age = this.calculateAge(storedUserInfo.birthday);
              }
              this.setData({ 
                userInfo: storedUserInfo,
                isLoading: false // 关键：数据返回，关闭骨架屏
              });
            }
          }
        });
      },
      fail: err => {
        console.error('获取openid失败:', err);
        // 即使openid获取失败，也要继续获取用户资料
        wx.cloud.callFunction({
          name: 'getMyProfileData',
          success: res => {
            console.log('getMyProfileData 返回：', res);
            if (res.result && res.result.success && res.result.userInfo) {
              const user = res.result.userInfo;
              if (user.birthday) {
                user.age = this.calculateAge(user.birthday);
              } else {
                user.age = '';
              }
              this.setData({ 
                userInfo: user,
                isLoading: false
              });
            } else {
              wx.showToast({ title: '个人资料数据异常', icon: 'none', duration: 3000 });
              const storedUserInfo = wx.getStorageSync('userInfo');
              if(storedUserInfo) {
                if (storedUserInfo.birthday) {
                  storedUserInfo.age = this.calculateAge(storedUserInfo.birthday);
                }
                this.setData({ 
                  userInfo: storedUserInfo,
                  isLoading: false
                });
              }
            }
          },
          fail: err => {
            wx.showToast({ title: '获取数据失败', icon: 'none' });
            console.error('获取数据失败', err);
            const storedUserInfo = wx.getStorageSync('userInfo');
            if(storedUserInfo) {
              if (storedUserInfo.birthday) {
                storedUserInfo.age = this.calculateAge(storedUserInfo.birthday);
              }
              this.setData({ 
                userInfo: storedUserInfo,
                isLoading: false
              });
            }
          }
        });
      }
    });
  },

  loadMyPosts: function (cb) {
    const { page, PAGE_SIZE } = this.data;
    console.log('【profile】请求分页参数', { page, PAGE_SIZE, skip: page * PAGE_SIZE, limit: PAGE_SIZE });
    
    // 只有在首次加载时才显示骨架屏
    if (page === 0) {
      this.setData({ isLoading: true });
    }
    
    wx.cloud.callFunction({
      name: 'getMyProfileData',
      data: {
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE
      },
      success: res => {
        if (res.result && res.result.success) {
          const posts = res.result.posts || [];
          console.log('【profile】本次返回帖子数量:', posts.length);
          posts.forEach(post => {
            if (post.createTime) {
              post.formattedCreateTime = this.formatTime(post.createTime);
            }
            // 为每个帖子设置默认的图片样式
            if (post.imageUrls && post.imageUrls.length > 0) {
              post.imageStyle = `height: 0; padding-bottom: 75%;`; // 4:3 宽高比占位
            }
          });
          const newMyPosts = page === 0 ? posts : this.data.myPosts.concat(posts);
          console.log('【profile】更新后 myPosts 长度:', newMyPosts.length, 'hasMore:', posts.length === PAGE_SIZE, 'page:', page + 1);
          this.setData({
            myPosts: newMyPosts,
            page: page + 1,
            hasMore: posts.length === PAGE_SIZE
          });
        }
      },
      complete: () => {
        this.setData({ isLoading: false });
        if (typeof cb === 'function') cb();
      }
    });
  },

  // 根据生日计算年龄
  calculateAge: function(birthday) {
    if (!birthday) return '';
    try {
      const birth = new Date(birthday);
      if (isNaN(birth.getTime())) return '';
      const now = new Date();
      let age = now.getFullYear() - birth.getFullYear();
      const m = now.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
        age--;
      }
      return age > 0 ? age : '';
    } catch (e) {
      console.error('计算年龄失败:', e);
      return '';
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

  // 点击帖子跳转详情
  navigateToPostDetail: function(e) {
    const postId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${postId}` });
  },

  // 删除帖子
  onDelete: function(event) {
    const postId = event.currentTarget.dataset.postid;
    const index = event.currentTarget.dataset.index;
    const that = this;

    wx.showModal({
      title: '确认删除',
      content: '您确定要删除这条帖子吗？此操作不可恢复。',
      success: function(res) {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          wx.cloud.callFunction({
            name: 'deletePost',
            data: { postId: postId },
            success: function(res) {
              wx.hideLoading();
              if (res.result && res.result.success) {
                wx.showToast({ title: '删除成功' });
                const newList = that.data.myPosts.filter(post => post._id !== postId);
                that.setData({ myPosts: newList });
                // 新增：删除成功后设置首页需要刷新标记
                try {
                  wx.setStorageSync('shouldRefreshIndex', true);
                } catch (e) {}
              } else {
                wx.showToast({ title: '删除失败', icon: 'none' });
              }
            },
            fail: function(err) {
              wx.hideLoading();
              wx.showToast({ title: '调用失败', icon: 'none' });
            }
          });
        }
      }
    });
  },

  updatePostCommentCount: function(postId, newCommentCount) {
    const postIndex = this.data.myPosts.findIndex(p => p._id === postId);
    if (postIndex > -1) {
      this.setData({
        [`myPosts[${postIndex}].commentCount`]: newCommentCount
      });
    }
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

  // 阻止事件冒泡
  stopPropagation: function() {
    // 空函数，用于阻止事件冒泡
  },

  // 头像加载错误处理
  onAvatarError: function(e) {
    console.error('头像加载失败:', e);
    // 可以在这里设置默认头像
  },

  // 头像加载成功处理
  onAvatarLoad: function(e) {
    // 头像加载成功，可以在这里做一些处理
  },

  // 图片加载错误处理
  onImageError: function(e) {
    console.error('图片加载失败:', e.detail);
    const { src } = e.detail;
    console.error('失败的图片URL:', src);
    const { postindex, imgindex } = e.currentTarget.dataset;
    if (postindex !== undefined && imgindex !== undefined) {
      const post = this.data.myPosts[postindex];
      console.error('图片加载失败的上下文:', {
        postId: post ? post._id : 'unknown',
        postTitle: post ? post.title : 'unknown',
        imageIndex: imgindex,
        imageUrl: src
      });
    }
    // 不显示toast，避免频繁弹窗，但记录错误
    console.error('图片加载失败详情:', {
      error: e.detail,
      src: src,
      dataset: e.currentTarget.dataset
    });
  },

  // 统一图片自适应/钳制逻辑
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

  // 测试图片URL有效性
  testImageUrls: function() {
    console.log('=== 开始测试图片URL有效性 ===');
    this.data.myPosts.forEach((post, index) => {
      console.log(`帖子${index + 1} (${post._id}):`);
      console.log('  - 标题:', post.title);
      console.log('  - 作者头像:', post.authorAvatar);
      console.log('  - 图片URLs:', post.imageUrls);
      console.log('  - 原图URLs:', post.originalImageUrls);
      
      if (post.imageUrls && post.imageUrls.length > 0) {
        post.imageUrls.forEach((url, imgIndex) => {
          console.log(`  - 图片${imgIndex + 1}:`, url);
          // 检查URL格式
          if (url && url.startsWith('http')) {
            console.log(`    ✓ 格式正确 (HTTP URL)`);
          } else if (url && url.startsWith('cloud://')) {
            console.log(`    ⚠ 格式为cloud:// (需要转换)`);
          } else if (!url) {
            console.log(`    ✗ URL为空`);
          } else {
            console.log(`    ? 未知格式: ${url}`);
          }
        });
      } else {
        console.log('  - 无图片');
      }
      console.log('---');
    });
    console.log('=== 图片URL测试完成 ===');
  },

  // 切换侧边栏显示/隐藏
  toggleSidebar: function() {
    this.setData({ isSidebarOpen: !this.data.isSidebarOpen });
  },

  // 跳转到我的点赞页面
  navigateToMyLikes: function() {
    wx.navigateTo({
      url: '/pages/my-likes/my-likes',
    });
  },

  // 跳转到编辑资料页面
  navigateToEditProfile: function() {
    wx.navigateTo({
      url: '/pages/profile-edit/profile-edit',
    });
  },

  // 跳转到收藏夹页面
  navigateToFavoriteFolders: function() {
    wx.navigateTo({
      url: '/pages/favorite-folders/favorite-folders',
    });
  },

  // 跳转到消息通知页面
  navigateToMessages: function() {
    wx.navigateTo({
      url: '/pages/messages/messages',
    });
  },

  // 检查未读消息数量
  checkUnreadMessages: function() {
    wx.cloud.callFunction({
      name: 'getUnreadMessageCount',
      success: res => {
        if (res.result && res.result.success) {
          this.setData({
            unreadCount: res.result.count || 0
          });
        }
      },
      fail: err => {
        console.error('检查未读消息失败:', err);
      }
    });
  },

  // 新增：标签切换方法
  switchTab: function(e) {
    const tab = e.currentTarget.dataset.tab;
    console.log('【profile】切换标签到:', tab);
    
    if (tab === this.data.currentTab) return; // 如果是当前标签，不做任何操作
    
    this.setData({ currentTab: tab });
    
    if (tab === 'posts') {
      // 切换到我的帖子标签
      if (this.data.myPosts.length === 0) {
        // 首次加载帖子数据
        this.setData({
          myPosts: [],
          page: 0,
          hasMore: true,
          isLoadingMore: false,
          swiperHeights: {},
          imageClampHeights: {},
        });
        this.loadMyPosts();
      }
    } else if (tab === 'favorites') {
      // 切换到收藏标签
      if (this.data.favoriteList.length === 0) {
        // 首次加载收藏数据
        this.setData({
          favoriteList: [],
          favoritePage: 0,
          favoriteHasMore: true,
          favoriteLoading: false,
          swiperHeights: {},
          imageClampHeights: {},
        });
        this.loadFavorites();
      }
    }
  },

  // 新增：加载收藏列表
  loadFavorites: function(cb) {
    // 移除阻止重复调用的条件判断，允许在onShow时刷新数据
    // if (this.data.favoriteLoading) return;
    
    const { favoritePage, PAGE_SIZE } = this.data;
    console.log('【profile】请求收藏分页参数', { favoritePage, PAGE_SIZE, skip: favoritePage * PAGE_SIZE, limit: PAGE_SIZE });
    
    this.setData({ favoriteLoading: true });
    
    wx.cloud.callFunction({
      name: 'getMyProfileData',
      data: {
        action: 'getAllFavorites',
        skip: favoritePage * PAGE_SIZE,
        limit: PAGE_SIZE
      },
      success: res => {
        console.log('【profile】获取收藏返回:', res);
        if (res.result && res.result.success) {
          const favorites = res.result.favorites || [];
          console.log('【profile】本次返回收藏数量:', favorites.length);
          
          // 格式化时间和设置图片样式
          favorites.forEach(favorite => {
            if (favorite.favoriteTime) {
              favorite.formattedFavoriteTime = this.formatTime(favorite.favoriteTime);
            }
            // 为每个收藏的帖子设置默认的图片样式
            if (favorite.imageUrls && favorite.imageUrls.length > 0) {
              favorite.imageStyle = `height: 0; padding-bottom: 75%;`; // 4:3 宽高比占位
            }
          });
          
          const newFavoriteList = favoritePage === 0 ? favorites : this.data.favoriteList.concat(favorites);
          console.log('【profile】更新后收藏列表长度:', newFavoriteList.length, 'favoriteHasMore:', favorites.length === PAGE_SIZE, 'favoritePage:', favoritePage + 1);
          
          this.setData({
            favoriteList: newFavoriteList,
            favoritePage: favoritePage + 1,
            favoriteHasMore: favorites.length === PAGE_SIZE
          });
        } else {
          wx.showToast({ 
            title: res.result?.message || '加载收藏失败', 
            icon: 'none' 
          });
        }
      },
      fail: err => {
        console.error('【profile】获取收藏失败:', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
      complete: () => {
        this.setData({ favoriteLoading: false });
        if (typeof cb === 'function') cb();
      }
    });
  },

  // 新增：收藏项跳转到帖子详情
  navigateToFavoriteDetail: function(e) {
    const postId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${postId}` });
  },

  // 新增：取消收藏
  removeFavorite: function(e) {
    const favoriteId = e.currentTarget.dataset.favoriteId;
    const index = e.currentTarget.dataset.index;
    const that = this;

    wx.showModal({
      title: '确认取消收藏',
      content: '确定要取消收藏这个内容吗？',
      success: function(res) {
        if (res.confirm) {
          wx.showLoading({ title: '取消收藏中...' });
          wx.cloud.callFunction({
            name: 'getMyProfileData',
            data: { 
              action: 'removeFromFavorite',
              favoriteId: favoriteId 
            },
            success: function(res) {
              wx.hideLoading();
              if (res.result && res.result.success) {
                wx.showToast({ title: '已取消收藏' });
                // 从列表中移除该项
                const newList = that.data.favoriteList.filter((item, i) => i !== index);
                that.setData({ favoriteList: newList });
              } else {
                wx.showToast({ title: '取消收藏失败', icon: 'none' });
              }
            },
            fail: function(err) {
              wx.hideLoading();
              wx.showToast({ title: '操作失败', icon: 'none' });
            }
          });
        }
      }
    });
  },

  // 新增：返回上一页
  navigateBack: function() {
    wx.navigateBack();
  },

  // 新增：跳转到图片管理页面
  navigateToImageManager: function() {
    wx.navigateTo({
      url: '/pages/image-manager/image-manager'
    });
  },

  // 滚动到底部触发加载更多
  onScrollToLower: function() {
    console.log('【profile】滚动到底部，当前标签:', this.data.currentTab);
    
    if (this.data.currentTab === 'posts') {
      // 我的帖子标签页
      if (this.data.hasMore && !this.data.isLoadingMore && !this.data.isLoading) {
        console.log('【profile】开始加载更多帖子');
        this.setData({ isLoadingMore: true });
        this.loadMyPosts(() => {
          this.setData({ isLoadingMore: false });
          console.log('【profile】加载更多帖子完成');
        });
      }
    } else if (this.data.currentTab === 'favorites') {
      // 收藏标签页
      if (this.data.favoriteHasMore && !this.data.favoriteLoading) {
        console.log('【profile】开始加载更多收藏');
        this.loadFavorites(() => {
          console.log('【profile】加载更多收藏完成');
        });
      }
    }
  }
});