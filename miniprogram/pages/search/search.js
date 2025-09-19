// pages/search/search.js
const db = wx.cloud.database();

Page({
  data: {
    searchKeyword: '',
    searchResults: [],
    isSearching: false,
    searchHistory: [],
    hotSearches: ['诗歌', '原创', '生活', '感悟', '旅行', '美食', '摄影', '读书'],
    searchTimer: null  // 防抖定时器
  },

  onLoad: function (options) {
    // 加载搜索历史
    this.loadSearchHistory();
  },

  // 搜索输入处理
  onSearchInput: function(e) {
    const keyword = e.detail.value;
    this.setData({
      searchKeyword: keyword
    });

    // 清除之前的定时器
    if (this.data.searchTimer) {
      clearTimeout(this.data.searchTimer);
    }

    // 如果输入为空，立即清空结果
    if (!keyword.trim()) {
      this.setData({
        searchResults: [],
        isSearching: false
      });
      return;
    }

    // 设置防抖定时器，500ms后自动搜索
    const timer = setTimeout(() => {
      this.performSearch(keyword);
    }, 500);
    
    this.setData({
      searchTimer: timer
    });
  },

  // 搜索确认处理
  onSearchConfirm: function(e) {
    const keyword = e.detail.value.trim();
    if (keyword) {
      // 清除防抖定时器
      if (this.data.searchTimer) {
        clearTimeout(this.data.searchTimer);
        this.setData({ searchTimer: null });
      }
      
      this.setData({
        searchKeyword: keyword
      });
      this.performSearch(keyword);
    }
  },

  // 清空搜索
  clearSearch: function() {
    // 清除防抖定时器
    if (this.data.searchTimer) {
      clearTimeout(this.data.searchTimer);
    }
    
    this.setData({
      searchKeyword: '',
      searchResults: [],
      isSearching: false,
      searchTimer: null
    });
  },

  // 执行搜索
  performSearch: function(keyword) {
    const searchKeyword = keyword || this.data.searchKeyword;
    console.log('执行搜索，关键词:', searchKeyword, '传入参数:', keyword, '当前数据:', this.data.searchKeyword);
    
    if (!searchKeyword.trim()) return;

    // 立即清空之前的结果，确保界面立即更新
    this.setData({
      searchResults: [],
      isSearching: true,
      searchKeyword: searchKeyword
    });

    // 保存搜索历史
    this.saveSearchHistory(searchKeyword);

    // 调用云函数搜索
    wx.cloud.callFunction({
      name: 'searchPosts',
      data: {
        keyword: searchKeyword,
        limit: 20
      },
      success: res => {
        console.log('搜索结果:', res);
        if (res.result && res.result.success) {
          let posts = res.result.posts || [];
          
          // 处理图片数据
          posts = posts.map(post => {
            if (!post.imageUrls || post.imageUrls.length === 0) {
              post.imageUrls = post.imageUrl ? [post.imageUrl] : [];
            }
            
            // 设置图片容器样式
            if (post.imageUrls.length > 0) {
              post.imageStyle = `height: 0; padding-bottom: 75%;`;
            }
            
            return post;
          });

          console.log('设置搜索结果:', posts.length, '条结果，关键词:', searchKeyword);
          this.setData({
            searchResults: posts
          });
        } else {
          wx.showToast({
            title: '搜索失败',
            icon: 'none'
          });
        }
      },
      fail: err => {
        console.error('搜索失败:', err);
        wx.showToast({
          title: '网络错误',
          icon: 'none'
        });
      },
      complete: () => {
        this.setData({
          isSearching: false
        });
      }
    });
  },

  // 选择历史关键词
  selectHistoryKeyword: function(e) {
    const keyword = e.currentTarget.dataset.keyword;
    this.setData({
      searchKeyword: keyword
    }, () => {
      this.performSearch(keyword);
    });
  },

  // 选择热门关键词
  selectHotKeyword: function(e) {
    const keyword = e.currentTarget.dataset.keyword;
    this.setData({
      searchKeyword: keyword
    }, () => {
      this.performSearch(keyword);
    });
  },

  // 清空搜索历史
  clearHistory: function() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空搜索历史吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('searchHistory');
          this.setData({
            searchHistory: []
          });
        }
      }
    });
  },

  // 加载搜索历史
  loadSearchHistory: function() {
    try {
      const history = wx.getStorageSync('searchHistory') || [];
      this.setData({
        searchHistory: history.slice(0, 10) // 最多显示10条历史记录
      });
    } catch (e) {
      console.error('加载搜索历史失败:', e);
    }
  },

  // 保存搜索历史
  saveSearchHistory: function(keyword) {
    try {
      let history = wx.getStorageSync('searchHistory') || [];
      
      // 移除重复项
      history = history.filter(item => item !== keyword);
      
      // 添加到开头
      history.unshift(keyword);
      
      // 限制历史记录数量
      history = history.slice(0, 20);
      
      wx.setStorageSync('searchHistory', history);
      
      this.setData({
        searchHistory: history.slice(0, 10)
      });
    } catch (e) {
      console.error('保存搜索历史失败:', e);
    }
  },

  // 返回上一页
  goBack: function() {
    wx.navigateBack();
  },

  // 帖子点击处理
  onPostTap: function(e) {
    const postId = e.currentTarget.dataset.postid;
    wx.navigateTo({
      url: `/pages/post-detail/post-detail?id=${postId}`
    });
  },

  // 标签点击处理
  onTagClick: function(e) {
    const tag = e.currentTarget.dataset.tag;
    wx.navigateTo({
      url: `/pages/tag-filter/tag-filter?tag=${encodeURIComponent(tag)}`
    });
  },

  // 评论点击处理
  onCommentClick: function(e) {
    const postId = e.currentTarget.dataset.postid;
    wx.navigateTo({
      url: `/pages/post-detail/post-detail?id=${postId}`
    });
  },

  // 图片预览处理
  handlePreview: function(e) {
    const current = e.currentTarget.dataset.src || e.currentTarget.dataset.imageUrl;
    const urls = e.currentTarget.dataset.originalImageUrls;
    if (current && urls && urls.length > 0) {
      wx.previewImage({ current, urls });
    }
  },

  // 头像错误处理
  onAvatarError: function(e) {
    console.error('头像加载失败', e.detail);
  },

  // 图片错误处理
  onImageError: function(e) {
    console.error('图片加载失败', e.detail);
  },

  // 跳转到用户主页
  navigateToUserProfile: function(e) {
    const userId = e.currentTarget.dataset.userId;
    wx.navigateTo({
      url: `/pages/user-profile/user-profile?userId=${userId}`
    });
  }
});
