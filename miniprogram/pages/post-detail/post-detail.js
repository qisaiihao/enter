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
    imageContainerHeight: null,
    swiperHeights: {},
    imageClampHeights: {},
    showFavoriteModal: false,
    isInputExpanded: false,
    keyboardHeight: 0,
    isFocus: false,
    viewStartTime: 0,
    currentPostId: null,
    isFavorited: false,
    favoriteButtonText: '收藏',
    favoriteButtonClass: 'favorite-button',
    showFollowButton: false,
    isFollowing: false,
    followPending: false,
    isFollowedByAuthor: false,
    isMutualFollow: false
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
          this.prepareFollowState(post._openid);
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
          const currentUserOpenid = app.globalData.openid || wx.getStorageSync('openid');

          const comments = res.result.comments.map(comment => {
            const processedComment = {
              ...comment,
              formattedCreateTime: this.formatTime(comment.createTime),
              likeIcon: likeIcon.getLikeIcon(comment.likes || 0, comment.liked || false),
              canDelete: comment._openid === currentUserOpenid
            };

            if (comment.replies) {
              processedComment.replies = comment.replies.map(reply => ({
                ...reply,
                formattedCreateTime: this.formatTime(reply.createTime),
                likeIcon: likeIcon.getLikeIcon(reply.likes || 0, reply.liked || false),
                canDelete: reply._openid === currentUserOpenid
              }));
            }

            return processedComment;
          });
          console.log('getComments返回的commentCount:', res.result.commentCount);
          console.log('comments数组长度:', comments.length);
          console.log('当前页面的commentCount:', this.data.commentCount);
          
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
          this.setData({ 
            'post.votes': originalVotes,
            'post.isVoted': originalIsVoted,
            'post.likeIcon': likeIcon.getLikeIcon(originalVotes, originalIsVoted)
          });
        } else if (newVotes !== res.result.votes) {
          this.setData({ 
            'post.votes': res.result.votes,
            'post.likeIcon': likeIcon.getLikeIcon(res.result.votes, newIsVoted)
          });
        }
      },
      fail: () => {
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

  onFavorite: function() {
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

  onImageLoad: function(e) {
    const { postid, postindex = 0, imgindex = 0, type } = e.currentTarget.dataset;
    const { width: originalWidth, height: originalHeight } = e.detail;
    if (!originalWidth || !originalHeight) return;
  
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

  onCommentInput: function(e) {
    this.setData({
      newComment: e.detail.value,
      isSubmitDisabled: e.detail.value.trim() === ''
    });
  },

  onSubmitComment: function() {
    if (this.data.isSubmitDisabled) return;

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
      success: res => {
        wx.hideLoading();
        if (res.result && res.result.success) {
          wx.showToast({ title: '评论成功' });
          const newCommentCount = this.data.commentCount + 1;
          this.setData({
            newComment: '',
            isSubmitDisabled: true,
            commentCount: newCommentCount,
          });

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
    console.log('--- showReplyInput function triggered ---');
    console.log('收到的 data- attributes:', e.currentTarget.dataset);

    const commentId = e.currentTarget.dataset.commentId;
    const authorName = e.currentTarget.dataset.authorName;
    
    this.setData({
      replyToComment: commentId,
      replyToAuthor: authorName
    });

    console.log('设置后的回复状态:', {
      replyToComment: this.data.replyToComment,
      replyToAuthor: this.data.replyToAuthor
    });
    
    this.expandInput();
  },

  cancelReply: function() {
    this.setData({
      replyToComment: null,
      replyToAuthor: ''
    });
    console.log('回复状态已被取消');
  },

  onDeleteComment: function(e) {
    const { commentId, parentId } = e.currentTarget.dataset;
    if (!commentId) return;

    wx.showModal({
      title: '删除评论',
      content: '确定要删除这条评论吗？',
      confirmColor: '#ff4d4f',
      success: res => {
        if (!res.confirm) return;

        wx.showLoading({ title: '正在删除', mask: true });

        wx.cloud.callFunction({
          name: 'deleteComment',
          data: { commentId },
          success: result => {
            if (result.result && result.result.success) {
              const deletedCount = Math.max(1, result.result.deletedCount || 1);
              let updatedComments;

              if (parentId) {
                updatedComments = this.data.comments.map(comment => ({
                  ...comment,
                  replies: comment.replies ? comment.replies.slice() : []
                }));
                const parentIndex = updatedComments.findIndex(comment => comment._id === parentId);
                if (parentIndex !== -1) {
                  updatedComments[parentIndex].replies = updatedComments[parentIndex].replies.filter(reply => reply._id !== commentId);
                }
              } else {
                updatedComments = this.data.comments.filter(comment => comment._id !== commentId);
              }

              const newCommentCount = Math.max(0, this.data.commentCount - deletedCount);

              this.setData({
                comments: updatedComments,
                commentCount: newCommentCount
              });

              const pages = getCurrentPages();
              if (pages.length > 1) {
                const prePage = pages[pages.length - 2];
                if (typeof prePage.updatePostCommentCount === 'function') {
                  prePage.updatePostCommentCount(this.data.post._id, newCommentCount);
                }
              }

              wx.showToast({ title: '已删除', icon: 'success' });
            } else {
              wx.showToast({
                title: (result.result && result.result.message) || '删除失败',
                icon: 'none'
              });
            }
          },
          fail: err => {
            console.error('Failed to delete comment', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          },
          complete: () => {
            wx.hideLoading();
          }
        });
      }
    });
  },

  toggleLikeComment: function(e) {
    const { commentId } = e.currentTarget.dataset;
    const postId = this.data.post._id;

    const comments = this.data.comments;
    const { comment, isReply } = this.findComment(comments, commentId);
    if (!comment) return;

    const newLikeState = !comment.liked;
    const oldLikes = comment.likes || 0;
    comment.liked = newLikeState;
    comment.likes = oldLikes + (newLikeState ? 1 : -1);
    comment.likeIcon = likeIcon.getLikeIcon(comment.likes, comment.liked);

    this.setData({ comments: comments });

    wx.cloud.callFunction({
      name: 'likeComment',
      data: {
        commentId: commentId,
        postId: postId
      },
      success: res => {
        if (res.result && res.result.success) {
          if (comment.likes !== res.result.likes) {
            this.updateCommentLikeStatus(commentId, newLikeState, res.result.likes);
          }
        } else {
          this.updateCommentLikeStatus(commentId, !newLikeState, oldLikes);
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
      fail: err => {
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
      comment.likeIcon = likeIcon.getLikeIcon(comment.likes, comment.liked);
      this.setData({ comments: comments });
    }
  },

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

  prepareFollowState: function(authorOpenid) {
    const currentUserId = this.getCurrentUserId();
    console.log('【关注状态】prepareFollowState调用:', {
      authorOpenid,
      currentUserId,
      isSameUser: authorOpenid === currentUserId
    });
    
    if (!authorOpenid || !currentUserId || authorOpenid === currentUserId) {
      console.log('【关注状态】不显示关注按钮 - 自己或无效用户');
      this.setData({
        showFollowButton: false,
        isFollowing: false,
        isFollowedByAuthor: false,
        isMutualFollow: false
      });
      return;
    }
    
    console.log('【关注状态】显示关注按钮');
    this.setData({
      showFollowButton: true,
      isFollowing: false,
      isFollowedByAuthor: false,
      isMutualFollow: false
    });
    this.fetchFollowStatus(authorOpenid);
  },

  fetchFollowStatus: function(targetOpenid) {
    if (!targetOpenid) {
      return;
    }
    wx.cloud.callFunction({
      name: 'follow',
      data: {
        action: 'checkFollow',
        targetOpenid
      },
      success: res => {
        if (res.result && res.result.success) {
          this.setData({
            isFollowing: !!res.result.isFollowing,
            isFollowedByAuthor: !!res.result.isFollower,
            isMutualFollow: !!res.result.isMutual
          });
        } else {
          console.warn('检查关注状态失败', res.result);
        }
      },
      fail: err => {
        console.error('检查关注状态调用失败:', err);
      }
    });
  },

  onFollowTap: function() {
    if (this.data.followPending || !this.data.post) {
      return;
    }

    const targetOpenid = this.data.post._openid;
    if (!targetOpenid) {
      return;
    }

    const currentUserId = this.getCurrentUserId();
    if (!currentUserId) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    this.setData({ followPending: true });

    wx.cloud.callFunction({
      name: 'follow',
      data: {
        action: 'toggleFollow',
        targetOpenid
      },
      success: res => {
        if (res.result && res.result.success) {
          const isFollowing = !!res.result.isFollowing;
          this.setData({ isFollowing });
          wx.showToast({
            title: isFollowing ? '关注成功' : '已取消关注',
            icon: 'success'
          });
          this.fetchFollowStatus(targetOpenid);
        } else {
          wx.showToast({
            title: res.result && res.result.message ? res.result.message : '操作失败',
            icon: 'none'
          });
        }
      },
      fail: err => {
        console.error('切换关注状态失败:', err);
        wx.showToast({
          title: '网络错误',
          icon: 'none'
        });
      },
      complete: () => {
        this.setData({ followPending: false });
      }
    });
  },

  getCurrentUserId: function() {
    return app.globalData.openid || wx.getStorageSync('openid') || wx.getStorageSync('userOpenId');
  },

  navigateToUserProfile: function(e) {
    const userId = e.currentTarget.dataset.userId;
    if (userId) {
      const app = getApp();
      const currentUserOpenid = app.globalData.openid;
      
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

  preventBubble: function() {
    // 空函数，仅用于阻止事件冒泡
  },

  expandInput: function() {
    this.setData({
      isInputExpanded: true,
      isFocus: true
    });
  },

  onInputFocus: function(e) {
    console.log('键盘弹起，高度为:', e.detail.height);
    this.setData({
      keyboardHeight: e.detail.height
    });
  },
  
  onInputBlur: function() {
    setTimeout(() => {
      this.setData({
        isFocus: false,
        keyboardHeight: 0
      });
    }, 100);
  },

  collapseInput: function() {
    this.setData({
      isInputExpanded: false,
      isFocus: false,
      keyboardHeight: 0,
      replyToComment: null,
      replyToAuthor: ''
    });
  },

  onUnload: function() {
    this.recordViewBehavior();
  },

  onHide: function() {
    if (this.data.isInputExpanded) {
      this.collapseInput();
    }
    this.recordViewBehavior();
  },

  recordViewBehavior: function() {
    if (!this.data.currentPostId || !this.data.viewStartTime) {
      return;
    }

    const viewDuration = Math.floor((Date.now() - this.data.viewStartTime) / 1000);
    
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
        console.log('浏览记录已保存', res);
      },
      fail: (err) => {
        console.error('浏览记录保存失败:', err);
      }
    });
  },

  onTagClick: function(e) {
    const tag = e.currentTarget.dataset.tag;
    console.log('点击标签:', tag);
    
    wx.navigateTo({
      url: `/pages/tag-filter/tag-filter?tag=${encodeURIComponent(tag)}`,
      success: () => {
        console.log('跳转到标签筛选页面成功');
      },
      fail: (err) => {
        console.error('跳转到标签筛选页面失败', err);
        wx.showToast({
          title: '跳转失败',
          icon: 'none'
        });
      }
    });
  }
});