// pages/messages/messages.js
const app = getApp();
const { formatTimeAgo } = require('../../utils/time');

Page({
  data: {
    messages: [],
    isLoading: false,
    hasMore: true,
    page: 0,
    PAGE_SIZE: 10,
    activeTab: 'all', // all, like, comment, favorite
    unreadCount: 0
  },

  onLoad: function (options) {
    this.loadMessages();
  },

  onShow: function () {
    // 页面显示时刷新消息
    if (this.data.messages.length === 0) {
      this.loadMessages();
    } else {
      this.checkUnreadCount();
    }
  },

  onPullDownRefresh: function () {
    this.setData({
      messages: [],
      page: 0,
      hasMore: true
    });
    this.loadMessages(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    if (!this.data.hasMore || this.data.isLoading) return;
    this.loadMessages();
  },

  // 切换消息类型标签
  switchTab: function (e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.activeTab) return;
    
    this.setData({
      activeTab: tab,
      messages: [],
      page: 0,
      hasMore: true
    });
    this.loadMessages();
  },

  // 加载消息列表
  loadMessages: function (callback) {
    if (this.data.isLoading) return;
    
    this.setData({ isLoading: true });
    const { page, PAGE_SIZE, activeTab } = this.data;
    
    wx.cloud.callFunction({
      name: 'getMessages',
      data: {
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
        type: activeTab === 'all' ? null : activeTab
      },
      success: res => {
        if (res.result && res.result.success) {
          const newMessages = res.result.messages || [];
          const totalCount = res.result.totalCount || 0;
          
          // 格式化时间和消息内容
          newMessages.forEach(msg => {
            if (msg.createTime) {
              const timeAgo = formatTimeAgo(msg.createTime);
              msg.formattedTime = timeAgo;
              
              // 根据消息类型和时间生成更清晰的消息内容
              if (msg.type === 'like') {
                msg.content = `${timeAgo}被点赞`;
              } else if (msg.type === 'comment') {
                msg.content = `${timeAgo}被回复`;
              } else if (msg.type === 'favorite') {
                msg.content = `${timeAgo}被收藏`;
              }
            }
          });
          
          const allMessages = page === 0 ? newMessages : this.data.messages.concat(newMessages);
          
          this.setData({
            messages: allMessages,
            page: page + 1,
            hasMore: newMessages.length === PAGE_SIZE,
            unreadCount: res.result.unreadCount || 0
          });
          
          // 标记已读
          if (newMessages.length > 0) {
            this.markMessagesAsRead(newMessages.filter(msg => !msg.isRead).map(msg => msg._id));
          }
        }
      },
      fail: err => {
        console.error('获取消息失败:', err);
        wx.showToast({
          title: '获取消息失败',
          icon: 'none'
        });
      },
      complete: () => {
        this.setData({ isLoading: false });
        if (callback) callback();
      }
    });
  },

  // 检查未读消息数量
  checkUnreadCount: function () {
    wx.cloud.callFunction({
      name: 'getUnreadMessageCount',
      success: res => {
        if (res.result && res.result.success) {
          this.setData({
            unreadCount: res.result.count || 0
          });
        }
      }
    });
  },

  // 标记消息为已读
  markMessagesAsRead: function (messageIds) {
    if (!messageIds || messageIds.length === 0) return;
    
    wx.cloud.callFunction({
      name: 'markMessagesAsRead',
      data: { messageIds },
      success: res => {
        if (res.result && res.result.success) {
          // 更新本地数据
          const updatedMessages = this.data.messages.map(msg => {
            if (messageIds.includes(msg._id)) {
              msg.isRead = true;
            }
            return msg;
          });
          
          this.setData({
            messages: updatedMessages,
            unreadCount: Math.max(0, this.data.unreadCount - messageIds.length)
          });
        }
      }
    });
  },


  // 跳转到相关帖子
  navigateToPost: function (e) {
    const postId = e.currentTarget.dataset.postid;
    if (postId) {
      wx.navigateTo({
        url: `/pages/post-detail/post-detail?id=${postId}`
      });
    }
  },

  // 删除单条消息
  deleteMessage: function (e) {
    const messageId = e.currentTarget.dataset.messageid;
    const index = e.currentTarget.dataset.index;
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条消息吗？',
      success: res => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'deleteMessage',
            data: { messageId },
            success: res => {
              if (res.result && res.result.success) {
                const messages = this.data.messages.filter((msg, i) => i !== index);
                this.setData({ messages });
                wx.showToast({
                  title: '删除成功',
                  icon: 'success'
                });
              }
            }
          });
        }
      }
    });
  },

  // 清空所有消息
  clearAllMessages: function () {
    wx.showModal({
      title: '清空消息',
      content: '确定要清空所有消息吗？此操作不可恢复。',
      success: res => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'clearAllMessages',
            success: res => {
              if (res.result && res.result.success) {
                this.setData({
                  messages: [],
                  page: 0,
                  hasMore: false,
                  unreadCount: 0
                });
                wx.showToast({
                  title: '已清空',
                  icon: 'success'
                });
              }
            }
          });
        }
      }
    });
  }
});