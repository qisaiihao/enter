// pages/post-detail/post-detail.js
const app = getApp();
const likeIcon = require('../../utils/likeIcon');

Page({
  data: {
    post: null,
    comments: [],
    newComment: '',
    commentCount: 0,
    isLoading: true,
    isSubmitDisabled: true,
    replyToComment: null,
    replyToAuthor: '',
    showUploadTip: false,
    votingInProgress: false,
    // --- 已修正和新增的 data ---
    imageContainerHeight: null, // 用于控制swiper的高度
    swiperHeights: {}, // 多图swiper高度
    imageClampHeights: {}, // 单图瘦高图钳制高度
    showFavoriteModal: false, // 控制收藏弹窗
    isInputExpanded: false, // 控制输入框展开/收起状态
    keyboardHeight: 0,      // 新增：用于存储键盘高度
    isFocus: false,         // 新增：控制 textarea 的 focus 状态
    // --- 浏览记录相关 ---
    viewStartTime: 0,       // 浏览开始时间
    currentPostId: null,    // 当前帖子ID
    // --- 收藏状态相关 ---
    isFavorited: false,     // 是否已收藏
    favoriteButtonText: '收藏', // 收藏按钮文字
    favoriteButtonClass: 'favorite-button' // 收藏按钮样式类
  },

  onLoad: function (options) {
    const postId = options.id;
    if (postId) {
      this.setData({ currentPostId: postId });
      this.loadPostDetail(postId);
    } else {
      this.setData({ isLoading: false });
      wx.showToast({ title: '无效的帖子ID', icon: 'none' });
    }
  },

  onShow: function() {
    // 记录浏览开始时间
    this.setData({ viewStartTime: Date.now() });
  },

  loadPostDetail: function(postId) {
    wx.showLoading({ title: '加载中...' });
    wx.cloud.callFunction({
      name: 'getPostDetail',
      data: { postId: postId },
      success: res => {
        if (res.result && res.result.post) {
          let post = res.result.post;
          post.formattedCreateTime = this.formatTime(post.createTime);
          // 添加点赞图标信息
          post.likeIcon = likeIcon.getLikeIcon(post.votes || 0, post.isVoted || false);
          console.log('loadPostDetail完整返回数据:', res.result);
          console.log('loadPostDetail获取到的commentCount:', res.result.commentCount, '类型:', typeof res.result.commentCount);
          console.log('loadPostDetail获取到的post.commentCount:', post.commentCount, '类型:', typeof post.commentCount);
          
          const finalCommentCount = res.result.commentCount || post.commentCount || 0;
          console.log('最终使用的commentCount:', finalCommentCount);
          
          this.setData({
            post: post,
            commentCount: finalCommentCount,
          });
          console.log('loadPostDetail设置后的commentCount:', this.data.commentCount);
          this.getComments(post._id);
        } else {
          wx.showToast({ title: '帖子加载失败', icon: 'none' });
        }
      },
      fail: err => {
        console.error('Failed to get post detail', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
      complete: () => {
        this.setData({ isLoading: false });
        wx.hideLoading();
      }
    });
  },

  getComments: function(postId) {
    wx.cloud.callFunction({
      name: 'getComments',
      data: { postId: postId },
      success: res => {
        if (res.result && res.result.comments) {
          const comments = res.result.comments.map(comment => {
            comment.formattedCreateTime = this.formatTime(comment.createTime);
            // 添加评论的动态点赞图标
            comment.likeIcon = likeIcon.getLikeIcon(comment.likes || 0, comment.liked || false);
            if (comment.replies) {
              comment.replies.forEach(reply => {
                reply.formattedCreateTime = this.formatTime(reply.createTime);
                // 添加回复的动态点赞图标
                reply.likeIcon = likeIcon.getLikeIcon(reply.likes || 0, reply.liked || false);
              });
            }
            return comment;
          });
          console.log('getComments返回的commentCount:', res.result.commentCount);
          console.log('comments数组长度:', comments.length);
          console.log('当前页面的commentCount:', this.data.commentCount);
          
          // 只有在getComments返回的commentCount大于当前值时才更新
          const newCommentCount = res.result.commentCount || comments.length;
          const shouldUpdateCount = newCommentCount > this.data.commentCount;
          
          this.setData({ 
            comments: comments,
            commentCount: shouldUpdateCount ? newCommentCount : this.data.commentCount
          });
          console.log('更新后的commentCount:', this.data.commentCount);
        } else {
          wx.showToast({ title: '评论加载失败', icon: 'none' });
        }
      },
      fail: err => {
        console.error('Failed to get comments', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  onVote: function(event) {
    const postId = event.currentTarget.dataset.postid;
    if (this.data.votingInProgress) return;
    this.setData({ votingInProgress: true });
    
    const post = this.data.post;
    const originalVotes = post.votes;
    const originalIsVoted = post.isVoted;
    
    const newVotes = originalIsVoted ? originalVotes - 1 : originalVotes + 1;
    const newIsVoted = !originalIsVoted;
    const newLikeIcon = likeIcon.getLikeIcon(newVotes, newIsVoted);
    
    // 只更新必要的字段，避免整个post对象重新渲染
    this.setData({ 
      'post.votes': newVotes,
      'post.isVoted': newIsVoted,
      'post.likeIcon': newLikeIcon
    });
    
    wx.cloud.callFunction({
      name: 'vote',
      data: { postId: postId },
      success: res => {
        if (!res.result.success) {
          // 恢复原始状态
          this.setData({ 
            'post.votes': originalVotes,
            'post.isVoted': originalIsVoted,
            'post.likeIcon': likeIcon.getLikeIcon(originalVotes, originalIsVoted)
          });
        } else if (newVotes !== res.result.votes) {
          // 使用服务器返回的实际数据
          this.setData({ 
            'post.votes': res.result.votes,
            'post.likeIcon': likeIcon.getLikeIcon(res.result.votes, newIsVoted)
          });
        }
      },
      fail: () => {
        // 恢复原始状态
        this.setData({ 
          'post.votes': originalVotes,
          'post.isVoted': originalIsVoted,
          'post.likeIcon': likeIcon.getLikeIcon(originalVotes, originalIsVoted)
        });
        wx.showToast({ title: '操作失败，请检查网络', icon: 'none' });
      },
      complete: () => {
        this.setData({ votingInProgress: false });
      }
    });
  },

  // --- 收藏功能 ---
  onFavorite: function() {
    // 如果已经收藏，显示提示
    if (this.data.isFavorited) {
      wx.showToast({
        title: '已经收藏过了',
        icon: 'none',
      });
      return;
    }
    
    this.setData({
      showFavoriteModal: true,
    });
  },

  hideFavoriteModal: function() {
    this.setData({
      showFavoriteModal: false,
    });
  },

  onFavoriteSuccess: function() {
    this.hideFavoriteModal();
    // 更新收藏状态
    this.setData({
      isFavorited: true,
      favoriteButtonText: '已收藏',
      favoriteButtonClass: 'favorite-button favorited'
    });
    wx.showToast({
      title: '收藏成功',
      icon: 'success',
    });
  },

  handlePreview: function(event) {
    const currentUrl = event.currentTarget.dataset.src;
    const originalUrls = event.currentTarget.dataset.originalImageUrls;
    if (currentUrl) {
      wx.previewImage({
        current: currentUrl,
        urls: originalUrls || [currentUrl]
      });
    } else {
      wx.showToast({ title: '图片加载失败', icon: 'none' });
    }
  },

  // --- Swiper 和图片高度计算 ---
  onImageLoad: function(e) {
    const { postid, postindex = 0, imgindex = 0, type } = e.currentTarget.dataset;
    const { width: originalWidth, height: originalHeight } = e.detail;
    if (!originalWidth || !originalHeight) return;
  
    // 多图
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
  

  onImageError: function(e) {
    console.error('图片加载失败', e);
  },

  onAvatarError: function(e) {
    console.error('头像加载失败', e);
  },

  // --- 评论功能 (已恢复) ---
  onCommentInput: function(e) {
    this.setData({
      newComment: e.detail.value,
      isSubmitDisabled: e.detail.value.trim() === ''
    });
  },

  onSubmitComment: function() {
    if (this.data.isSubmitDisabled) return;

    // [调试日志 3] 在提交前，最后检查一下当前的回复状态
    console.log('--- onSubmitComment function triggered ---');
    console.log('提交前的回复状态:', {
      replyToComment: this.data.replyToComment,
      replyToAuthor: this.data.replyToAuthor
    });

    const content = this.data.newComment;
    const postId = this.data.post._id;
    const parentId = this.data.replyToComment; 
    const replyToAuthor = this.data.replyToAuthor;

    wx.showLoading({ title: '提交中...' });
    wx.cloud.callFunction({
      name: 'addComment',
      data: { 
        postId: postId,
        content: content,
        parentId: parentId,
        replyToAuthorName: replyToAuthor
      },
      // ... success 和 fail 回调保持不变 ...
      success: res => {
        wx.hideLoading();
        if (res.result && res.result.success) {
          wx.showToast({ title: '评论成功' });
          // 立即更新评论数量
          const newCommentCount = this.data.commentCount + 1;
          this.setData({
            newComment: '',
            isSubmitDisabled: true,
            commentCount: newCommentCount,
          });

          // ★★★ 提交成功后，调用收起函数 ★★★
          this.collapseInput();

          this.getComments(postId);

          const pages = getCurrentPages();
          if (pages.length > 1) {
            const prePage = pages[pages.length - 2];
            if (prePage.route === 'pages/index/index' && typeof prePage.updatePostCommentCount === 'function') {
              prePage.updatePostCommentCount(postId, newCommentCount);
            } else if (prePage.route === 'pages/profile/profile' && typeof prePage.updatePostCommentCount === 'function') {
              prePage.updatePostCommentCount(postId, newCommentCount);
            }
          }
        } else {
          wx.showToast({ title: (res.result && res.result.message) || '评论失败', icon: 'none' });
        }
      },
      fail: err => {
        wx.hideLoading();
        console.error('Failed to add comment', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  showReplyInput: function(e) {
    // [调试日志 1] 检查函数是否被触发，以及接收到的数据
    console.log('--- showReplyInput function triggered ---');
    console.log('收到的 data- attributes:', e.currentTarget.dataset);

    const commentId = e.currentTarget.dataset.commentId;
    const authorName = e.currentTarget.dataset.authorName;
    
    this.setData({
      replyToComment: commentId,
      replyToAuthor: authorName
    });

    // [调试日志 2] 检查 state 是否被成功设置
    console.log('设置后的回复状态:', {
      replyToComment: this.data.replyToComment,
      replyToAuthor: this.data.replyToAuthor
    });
    
    // ★★★ 设置完回复对象后，立即展开输入框 ★★★
    this.expandInput();
  },

  cancelReply: function() {
    this.setData({
      replyToComment: null,
      replyToAuthor: ''
    });
    console.log('回复状态已被取消');
  },

  cancelReply: function() {
    this.setData({
      replyToComment: null,
      replyToAuthor: ''
    });
  },

  toggleLikeComment: function(e) {
    const { commentId } = e.currentTarget.dataset;
    const postId = this.data.post._id;

    // [前端优化] 先在本地立即更新UI，提供更快的用户反馈
    const comments = this.data.comments;
    const { comment, isReply } = this.findComment(comments, commentId);
    if (!comment) return;

    const newLikeState = !comment.liked;
    const oldLikes = comment.likes || 0;
    comment.liked = newLikeState;
    comment.likes = oldLikes + (newLikeState ? 1 : -1);
    // 更新动态点赞图标
    comment.likeIcon = likeIcon.getLikeIcon(comment.likes, comment.liked);

    this.setData({ comments: comments });

    // 调用云函数，不再需要传递 isLiked
    wx.cloud.callFunction({
      name: 'likeComment',
      data: {
        commentId: commentId,
        postId: postId
      },
      success: res => {
        if (res.result && res.result.success) {
          // [核心] 使用后端返回的权威点赞数，更新UI
          if (comment.likes !== res.result.likes) {
            this.updateCommentLikeStatus(commentId, newLikeState, res.result.likes);
          }
        } else {
          // 如果云函数执行失败，回滚前端的UI更改
          this.updateCommentLikeStatus(commentId, !newLikeState, oldLikes);
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
      fail: err => {
        // 如果网络不通或函数名错误，回滚前端的UI更改
        this.updateCommentLikeStatus(commentId, !newLikeState, oldLikes);
        console.error('Failed to like comment', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  updateCommentLikeStatus: function(commentId, newLikeState, finalLikes) {
    let comments = this.data.comments;
    const { comment, isReply } = this.findComment(comments, commentId);

    if (comment) {
      comment.liked = newLikeState;
      comment.likes = finalLikes;
      // 更新动态点赞图标
      comment.likeIcon = likeIcon.getLikeIcon(comment.likes, comment.liked);
      this.setData({ comments: comments });
    }
  },

  // [新增] 辅助函数，用于在复杂的评论/回复结构中查找特定评论
  findComment: function(comments, commentId) {
    for (let i = 0; i < comments.length; i++) {
      if (comments[i]._id === commentId) {
        return { comment: comments[i], isReply: false };
      }
      if (comments[i].replies) {
        for (let j = 0; j < comments[i].replies.length; j++) {
          if (comments[i].replies[j]._id === commentId) {
            return { comment: comments[i].replies[j], isReply: true };
          }
        }
      }
    }
    return { comment: null, isReply: false };
  },

  toggleShowAllReplies: function(e) {
    const commentId = e.currentTarget.dataset.commentId;
    let comments = this.data.comments;
    const comment = comments.find(c => c._id === commentId);
    if (comment) {
      comment.showAllReplies = !comment.showAllReplies;
      this.setData({ comments: comments });
    }
  },

  // --- 时间格式化 (已恢复) ---
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

  // 新增：跳转到用户个人主页
  navigateToUserProfile: function(e) {
    const userId = e.currentTarget.dataset.userId;
    if (userId) {
      const app = getApp();
      const currentUserOpenid = app.globalData.openid;
      
      // 检查是否点击的是自己的头像
      if (userId === currentUserOpenid) {
        console.log('【帖子详情】点击的是自己头像，切换到我的页面');
        wx.switchTab({
          url: '/pages/profile/profile'
        });
      } else {
        console.log('【帖子详情】点击的是他人头像，跳转到用户主页');
        wx.navigateTo({
          url: `/pages/user-profile/user-profile?userId=${userId}`
        });
      }
    }
  },

  // 阻止事件冒泡，防止点赞区域触发卡片点击
  preventBubble: function() {
    // 空函数，仅用于阻止事件冒泡
  },

  // 展开输入框
  expandInput: function() {
    this.setData({
      isInputExpanded: true,
      isFocus: true // 让 textarea 自动获取焦点
    });
  },

  // 输入框获得焦点时，获取键盘高度
  onInputFocus: function(e) {
    console.log('键盘弹起，高度为：', e.detail.height);
    this.setData({
      keyboardHeight: e.detail.height
    });
  },
  
  // 输入框失去焦点时，收起键盘和输入框
  onInputBlur: function() {
    // 延迟收起，避免点击发送按钮时，输入框提前消失
    setTimeout(() => {
      this.setData({
        isFocus: false,
        keyboardHeight: 0
      });
    }, 100);
  },

  // 点击遮罩层或手动收起输入框
  collapseInput: function() {
    this.setData({
      isInputExpanded: false,
      isFocus: false,
      keyboardHeight: 0,
      // 清理回复状态
      replyToComment: null,
      replyToAuthor: ''
    });
  },

  // 页面返回时收起输入框
  onUnload: function() {
    // 记录浏览行为
    this.recordViewBehavior();
  },

  // 页面隐藏时收起输入框
  onHide: function() {
    if (this.data.isInputExpanded) {
      this.collapseInput();
    }
    // 记录浏览行为
    this.recordViewBehavior();
  },

  // 记录浏览行为
  recordViewBehavior: function() {
    if (!this.data.currentPostId || !this.data.viewStartTime) {
      return;
    }

    const viewDuration = Math.floor((Date.now() - this.data.viewStartTime) / 1000); // 转换为秒
    
    // 只有浏览时间超过3秒才记录
    if (viewDuration < 3) {
      return;
    }

    wx.cloud.callFunction({
      name: 'recordView',
      data: {
        postId: this.data.currentPostId,
        viewDuration: viewDuration
      },
      success: (res) => {
        console.log('浏览记录已保存:', res);
      },
      fail: (err) => {
        console.error('浏览记录保存失败:', err);
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
  }
});