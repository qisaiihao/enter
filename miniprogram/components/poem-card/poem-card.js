// components/poem-card/poem-card.js
Component({
  properties: {
    post: {
      type: Object,
      value: null
    },
    // 单独属性支持
    postId: {
      type: String,
      value: ''
    },
    postTitle: {
      type: String,
      value: ''
    },
    postContent: {
      type: String,
      value: ''
    },
    authorName: {
      type: String,
      value: ''
    },
    authorAvatar: {
      type: String,
      value: ''
    },
    imageUrls: {
      type: Array,
      value: []
    },
    originalImageUrls: {
      type: Array,
      value: []
    },
    isPoem: {
      type: Boolean,
      value: false
    },
    isOriginal: {
      type: Boolean,
      value: false
    },
    author: {
      type: String,
      value: ''
    },
    createTime: {
      type: String,
      value: ''
    },
    formattedCreateTime: {
      type: String,
      value: ''
    },
    votes: {
      type: Number,
      value: 0
    },
    commentCount: {
      type: Number,
      value: 0
    },
    isVoted: {
      type: Boolean,
      value: false
    },
    likeIcon: {
      type: String,
      value: '/images/seed.png'
    },
    mode: {
      type: String,
      value: 'list' // 'list' | 'detail' | 'immersive'
    },
    showInteractions: {
      type: Boolean,
      value: true
    },
    showComments: {
      type: Boolean,
      value: false
    },
    showBackground: {
      type: Boolean,
      value: false
    }
  },

  data: {
    // 保持与原页面相同的数据结构
  },

  computed: {
    // 计算属性：组合单独的属性为 post 对象
    computedPost: function() {
      if (this.data.post) {
        return this.data.post;
      }
      
      return {
        _id: this.data.postId || '',
        title: this.data.postTitle || '',
        content: this.data.postContent || '',
        authorName: this.data.authorName || '',
        authorAvatar: this.data.authorAvatar || '',
        imageUrls: this.data.imageUrls || [],
        originalImageUrls: this.data.originalImageUrls || [],
        isPoem: this.data.isPoem || false,
        isOriginal: this.data.isOriginal || false,
        author: this.data.author || '',
        createTime: this.data.createTime || '',
        formattedCreateTime: this.data.formattedCreateTime || '',
        votes: this.data.votes || 0,
        commentCount: this.data.commentCount || 0,
        isVoted: this.data.isVoted || false,
        likeIcon: this.data.likeIcon || '/images/seed.png'
      };
    }
  },

  methods: {
    // 作者头像点击
    navigateToUserProfile: function(e) {
      const userId = e.currentTarget.dataset.userId;
      if (userId) {
        wx.navigateTo({
          url: `/pages/user-profile/user-profile?userId=${userId}`
        });
      }
    },

    // 图片预览
    handlePreview: function(e) {
      const src = e.currentTarget.dataset.src;
      const originalImageUrls = e.currentTarget.dataset.originalImageUrls;
      
      if (src && originalImageUrls) {
        const urls = JSON.parse(originalImageUrls);
        wx.previewImage({
          current: src,
          urls: urls
        });
      }
    },

    // 点赞功能
    onVote: function(e) {
      const postId = e.currentTarget.dataset.postid;
      const index = e.currentTarget.dataset.index;
      
      // 触发父组件事件
      this.triggerEvent('vote', {
        postId: postId,
        index: index
      });
    },

    // 评论点击
    onCommentClick: function(e) {
      const postId = e.currentTarget.dataset.postid;
      
      // 触发父组件事件
      this.triggerEvent('comment', {
        postId: postId
      });
    },

    // 标签点击
    onTagClick: function(e) {
      const tag = e.currentTarget.dataset.tag;
      
      // 触发父组件事件
      this.triggerEvent('tagClick', {
        tag: tag
      });
    },

    // 帖子内容点击（跳转详情页）
    onPostContentClick: function(e) {
      const postId = e.currentTarget.dataset.postid;
      
      if (this.data.mode !== 'detail') {
        wx.navigateTo({
          url: `/pages/post-detail/post-detail?id=${postId}`
        });
      }
    },

    // 头像加载错误
    onAvatarError: function(e) {
      console.log('头像加载失败:', e);
    },

    // 图片加载错误
    onImageError: function(e) {
      console.log('图片加载失败:', e);
    },

    // 点赞图标加载错误
    onLikeIconError: function(e) {
      console.log('点赞图标加载失败:', e);
    },

    // 防止事件冒泡
    preventBubble: function(e) {
      e.stopPropagation();
    }
  }
});

