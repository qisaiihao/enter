// pages/post-detail/post-detail.js
const app = getApp();

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
  },

  onLoad: function (options) {
    const postId = options.id;
    if (postId) {
      this.loadPostDetail(postId);
    } else {
      this.setData({ isLoading: false });
      wx.showToast({ title: '无效的帖子ID', icon: 'none' });
    }
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
            if (comment.replies) {
              comment.replies.forEach(reply => {
                reply.formattedCreateTime = this.formatTime(reply.createTime);
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
    
    post.votes = originalIsVoted ? originalVotes - 1 : originalVotes + 1;
    post.isVoted = !originalIsVoted;
    this.setData({ post: post });
    
    wx.cloud.callFunction({
      name: 'vote',
      data: { postId: postId },
      success: res => {
        if (!res.result.success) {
          post.votes = originalVotes;
          post.isVoted = originalIsVoted;
          this.setData({ post: post });
        } else if (post.votes !== res.result.votes) {
          post.votes = res.result.votes;
          this.setData({ post: post });
        }
      },
      fail: () => {
        post.votes = originalVotes;
        post.isVoted = originalIsVoted;
        this.setData({ post: post });
        wx.showToast({ title: '操作失败，请检查网络', icon: 'none' });
      },
      complete: () => {
        this.setData({ votingInProgress: false });
      }
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
          console.log('更新评论数量:', this.data.commentCount, '->', newCommentCount);
          this.setData({ 
            newComment: '',
            isSubmitDisabled: true,
            replyToComment: null,
            replyToAuthor: '',
            commentCount: newCommentCount
          });
          this.getComments(postId); 
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
    // [这是正确的 toggleLikeComment 函数]
    const { commentId, liked } = e.currentTarget.dataset;
    const postId = this.data.post._id; // [修正 1] 从页面数据中获取 postId
    const newLikeState = !liked;      // [修正 2] 计算出用户希望的新状态 (true代表点赞, false代表取消)

    // 调用云函数，并传递所有必需的参数
    wx.cloud.callFunction({
      name: 'likeComment',
      data: {
        commentId: commentId,
        postId: postId,       // <-- [修复] 必须传入 postId
        isLiked: newLikeState // <-- [修复] 必须传入你希望的新状态
      },
      success: res => {
        if (res.result && res.result.success) {
          // [修正 3] 云函数成功后，只用新状态来更新本地UI，不再依赖云函数返回点赞数
          this.updateCommentLikeStatus(commentId, newLikeState);
        } else {
          // 如果云函数执行失败，提示用户
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
      fail: err => {
        // 如果网络不通或函数名错误，提示用户
        console.error('Failed to like comment', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  updateCommentLikeStatus: function(commentId, newLikeState) {
    // [这是重写后的 updateCommentLikeStatus 函数]
    let comments = this.data.comments;
    let found = false;

    // 循环遍历所有评论和回复，找到被点击的那一条
    for (let i = 0; i < comments.length; i++) {
      if (comments[i]._id === commentId) {
        // 匹配到父评论
        comments[i].liked = newLikeState;
        // 在本地直接计算点赞数的变化 (+1 或 -1)
        comments[i].likes = (comments[i].likes || 0) + (newLikeState ? 1 : -1);
        found = true;
        break; // 找到了就跳出循环
      }
      if (comments[i].replies && !found) {
        // 检查子评论 (回复)
        for (let j = 0; j < comments[i].replies.length; j++) {
          if (comments[i].replies[j]._id === commentId) {
            comments[i].replies[j].liked = newLikeState;
            comments[i].replies[j].likes = (comments[i].replies[j].likes || 0) + (newLikeState ? 1 : -1);
            found = true;
            break; // 找到了就跳出内层循环
          }
        }
      }
      if (found) break; // 找到了就跳出外层循环
    }

    // 更新页面数据，让界面立刻刷新
    this.setData({ comments: comments });
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
  }
});