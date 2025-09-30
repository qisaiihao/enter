// 管理员反馈查看页面
Page({
  data: {
    feedbackList: [], // 反馈列表
    loading: false, // 加载状态
    hasMore: true, // 是否有更多数据
    page: 0, // 当前页码
    pageSize: 10, // 每页数量
    isAdmin: false, // 是否为管理员
    currentUserOpenid: '', // 当前用户openid
    statusBarHeight: 0, // 状态栏高度
  },

  onLoad: function () {
    // 获取状态栏高度
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    });
    
    // 设置CSS变量
    wx.setNavigationBarColor({
      frontColor: '#000000',
      backgroundColor: '#ffffff'
    });
    
    this.checkAdminPermission();
  },

  onShow: function () {
    // 每次显示时刷新数据
    if (this.data.isAdmin) {
      this.refreshFeedbackList();
    }
  },

  // 检查管理员权限
  async checkAdminPermission() {
    try {
      // 获取当前用户openid
      const openIdResult = await wx.cloud.callFunction({
        name: 'getOpenId'
      });
      
      if (openIdResult.result && openIdResult.result.openid) {
        const currentOpenid = openIdResult.result.openid;
        const adminOpenids = ['ojYBd1_A3uCbQ1LGcHxWxOAeA5SE', 'ojYBd14JG3-ghYuGCI2WHmkMc9nE']; // 管理员openid列表
        const isAdmin = adminOpenids.includes(currentOpenid);
        
        console.log('反馈管理页面 - 当前用户:', currentOpenid);
        console.log('反馈管理页面 - 是否为管理员:', isAdmin);
        
        this.setData({
          currentUserOpenid: currentOpenid,
          isAdmin: isAdmin
        });
        
        // 如果不是管理员，显示提示并返回
        if (!isAdmin) {
          wx.showModal({
            title: '权限不足',
            content: '您没有权限访问反馈管理功能',
            showCancel: false,
            success: () => {
              wx.navigateBack();
            }
          });
          return;
        }
        
        // 是管理员，加载反馈列表
        this.loadFeedbackList();
      } else {
        throw new Error('无法获取用户信息');
      }
    } catch (error) {
      console.error('权限检查失败:', error);
      wx.showModal({
        title: '错误',
        content: '权限检查失败，无法访问此页面',
        showCancel: false,
        success: () => {
          wx.navigateBack();
        }
      });
    }
  },

  // 加载反馈列表
  loadFeedbackList: function (isRefresh = false) {
    if (this.data.loading) return;
    
    const { page, pageSize } = this.data;
    const currentPage = isRefresh ? 0 : page;
    
    this.setData({ loading: true });
    
    wx.cloud.callFunction({
      name: 'feedbackManager',
      data: {
        action: 'getFeedbackList',
        skip: currentPage * pageSize,
        limit: pageSize
      },
      success: (res) => {
        if (res.result && res.result.success) {
          const feedbackList = res.result.feedbackList || [];
          
          // 格式化时间
          feedbackList.forEach(feedback => {
            feedback.formattedCreateTime = this.formatTime(feedback.createTime);
          });
          
          const newFeedbackList = isRefresh ? feedbackList : this.data.feedbackList.concat(feedbackList);
          
          this.setData({
            feedbackList: newFeedbackList,
            page: currentPage + 1,
            hasMore: feedbackList.length === pageSize
          });
        } else {
          wx.showToast({
            title: res.result?.message || '加载失败',
            icon: 'none'
          });
        }
      },
      fail: (err) => {
        console.error('加载反馈列表失败:', err);
        wx.showToast({
          title: '网络错误',
          icon: 'none'
        });
      },
      complete: () => {
        this.setData({ loading: false });
      }
    });
  },

  // 刷新反馈列表
  refreshFeedbackList: function () {
    this.setData({
      feedbackList: [],
      page: 0,
      hasMore: true
    });
    this.loadFeedbackList(true);
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.refreshFeedbackList();
    wx.stopPullDownRefresh();
  },

  // 上拉加载更多
  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadFeedbackList();
    }
  },

  // 格式化时间
  formatTime: function (dateString) {
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

  // 预览图片
  previewImage: function (e) {
    const currentUrl = e.currentTarget.dataset.src;
    const allUrls = e.currentTarget.dataset.urls;
    
    wx.previewImage({
      current: currentUrl,
      urls: allUrls
    });
  },

  // 删除反馈
  deleteFeedback: function (e) {
    const feedbackId = e.currentTarget.dataset.id;
    const index = e.currentTarget.dataset.index;
    const that = this;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条反馈吗？',
      confirmColor: '#ff4d4f',
      success: function (res) {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          
          wx.cloud.callFunction({
            name: 'feedbackManager',
            data: {
              action: 'deleteFeedback',
              feedbackId: feedbackId
            },
            success: function (res) {
              wx.hideLoading();
              if (res.result && res.result.success) {
                wx.showToast({
                  title: '删除成功',
                  icon: 'success'
                });
                
                // 从列表中移除
                const newList = that.data.feedbackList.filter((item, i) => i !== index);
                that.setData({ feedbackList: newList });
              } else {
                wx.showToast({
                  title: res.result?.message || '删除失败',
                  icon: 'none'
                });
              }
            },
            fail: function (err) {
              wx.hideLoading();
              console.error('删除反馈失败:', err);
              wx.showToast({
                title: '删除失败',
                icon: 'none'
              });
            }
          });
        }
      }
    });
  },

  // 标记为已处理
  markAsProcessed: function (e) {
    const feedbackId = e.currentTarget.dataset.id;
    const index = e.currentTarget.dataset.index;
    const that = this;

    wx.showLoading({ title: '处理中...' });
    
    wx.cloud.callFunction({
      name: 'feedbackManager',
      data: {
        action: 'markAsProcessed',
        feedbackId: feedbackId
      },
      success: function (res) {
        wx.hideLoading();
        if (res.result && res.result.success) {
          wx.showToast({
            title: '已标记为处理',
            icon: 'success'
          });
          
          // 更新列表中的状态
          that.setData({
            [`feedbackList[${index}].isProcessed`]: true,
            [`feedbackList[${index}].processedTime`]: new Date()
          });
        } else {
          wx.showToast({
            title: res.result?.message || '操作失败',
            icon: 'none'
          });
        }
      },
      fail: function (err) {
        wx.hideLoading();
        console.error('标记处理失败:', err);
        wx.showToast({
          title: '操作失败',
          icon: 'none'
        });
      }
    });
  },

  // 返回上一页
  goBack: function () {
    wx.navigateBack();
  }
});
