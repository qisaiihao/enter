// pages/post-detail/post-detail.js
const app = getApp();
const likeIcon = require('../../utils/likeIcon');
const avatarCache = require('../../utils/avatarCache');
const followCache = require('../../utils/followCache');

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
    isMutualFollow: false,
    commentImages: [],
    maxCommentImages: 3,
    showEmojiPanel: false,
    emojiList: ['😀','😁','😂','🤣','😊','😍','😎','🤔','😢','🙏','👍','👎'],
    isSubmittingComment: false
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
              canDelete: comment._openid === currentUserOpenid,
              imageUrls: comment.imageUrls || [],
              originalImageUrls: comment.originalImageUrls || []
            };

            if (comment.replies) {
              processedComment.replies = comment.replies.map(reply => ({
                ...reply,
                formattedCreateTime: this.formatTime(reply.createTime),
                likeIcon: likeIcon.getLikeIcon(reply.likes || 0, reply.liked || false),
                canDelete: reply._openid === currentUserOpenid,
                imageUrls: reply.imageUrls || [],
                originalImageUrls: reply.originalImageUrls || []
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

  updateSubmitState: function() {
    const hasText = (this.data.newComment || '').trim().length > 0;
    const hasImages = Array.isArray(this.data.commentImages) && this.data.commentImages.length > 0;
    const disabled = (!hasText && !hasImages) || this.data.isSubmittingComment;
    if (this.data.isSubmitDisabled !== disabled) {
      this.setData({ isSubmitDisabled: disabled });
    }
  },

  onCommentInput: function(e) {
    this.setData({
      newComment: e.detail.value
    }, () => {
      this.updateSubmitState();
    });
  },

  toggleEmojiPanel: function() {
    const shouldShow = !this.data.showEmojiPanel;
    const updateData = {
      showEmojiPanel: shouldShow,
      isFocus: !shouldShow
    };
    if (shouldShow) {
      updateData.keyboardHeight = 0;
      wx.hideKeyboard();
    }
    this.setData(updateData);
  },

  insertEmoji: function(e) {
    const emoji = e.currentTarget.dataset.emoji;
    if (!emoji) return;
    const newComment = (this.data.newComment || '') + emoji;
    this.setData({
      newComment: newComment
    }, () => {
      this.updateSubmitState();
    });
  },

  closeEmojiPanel: function() {
    if (this.data.showEmojiPanel) {
      this.setData({ showEmojiPanel: false });
    }
  },

  chooseCommentImages: function() {
    this.closeEmojiPanel();
    const existing = this.data.commentImages ? this.data.commentImages.length : 0;
    const remaining = this.data.maxCommentImages - existing;
    if (remaining <= 0) {
      wx.showToast({ title: '最多选择3张图片', icon: 'none' });
      return;
    }
    
    // 确保输入框保持展开状态
    if (!this.data.isInputExpanded) {
      this.expandInput();
    }
    
    wx.chooseImage({
      count: remaining,
      sizeType: ['original', 'compressed'],
      sourceType: ['album', 'camera'],
      success: res => {
        const tempFiles = res.tempFiles || (res.tempFilePaths || []).map(path => ({ tempFilePath: path, size: 0 }));
        const tasks = tempFiles.map(file => this.prepareCommentImage(file));
        Promise.all(tasks).then(processedImages => {
          const validImages = processedImages.filter(item => !!item);
          if (validImages.length === 0) {
            return;
          }
          const updatedImages = (this.data.commentImages || []).concat(validImages);
          this.setData({
            commentImages: updatedImages.slice(0, this.data.maxCommentImages)
          }, () => {
            this.updateSubmitState();
            // 选择图片后保持输入框展开状态
            this.setData({
              isInputExpanded: true,
              isFocus: false // 不自动聚焦，避免键盘弹出
            });
          });
        }).catch(err => {
          console.error('评论图片处理失败:', err);
          wx.showToast({ title: '图片处理失败', icon: 'none' });
        });
      },
      fail: err => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          console.error('选择评论图片失败:', err);
          wx.showToast({ title: '无法选择图片', icon: 'none' });
        }
      }
    });
  },

  prepareCommentImage: function(file) {
    return new Promise((resolve) => {
      const tempPath = file.tempFilePath || file.path || (Array.isArray(file.tempFilePaths) ? file.tempFilePaths[0] : '');
      if (!tempPath) {
        resolve(null);
        return;
      }
      const sizeInBytes = file.size || 0;
      // 降低压缩阈值到200KB，确保所有超过200KB的图片都被压缩
      const needCompression = sizeInBytes > 200 * 1024;
      const imageInfo = {
        id: 'comment_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
        originalPath: tempPath,
        previewUrl: tempPath,
        compressedPath: tempPath,
        size: sizeInBytes,
        needCompression: needCompression
      };
      if (!needCompression) {
        resolve(imageInfo);
        return;
      }
      this.compressCommentImage(imageInfo).then(resolvedInfo => {
        resolve(resolvedInfo);
      }).catch(err => {
        console.warn('评论图片压缩异常:', err);
        imageInfo.compressedPath = imageInfo.originalPath;
        imageInfo.previewUrl = imageInfo.originalPath;
        imageInfo.needCompression = false;
        resolve(imageInfo);
      });
    });
  },

  compressCommentImage: function(imageInfo) {
    return new Promise((resolve) => {
      // 使用更激进的压缩参数，确保文件大小不超过200KB
      const compressWithQuality = (quality) => {
        wx.compressImage({
          src: imageInfo.originalPath,
          quality: quality,
          success: res => {
            // 检查压缩后的文件大小
            wx.getFileInfo({
              filePath: res.tempFilePath,
              success: fileInfo => {
                const compressedSize = fileInfo.size;
                console.log(`压缩质量${quality}%，文件大小: ${(compressedSize / 1024).toFixed(2)}KB`);
                
                // 如果文件大小超过200KB且质量还可以继续降低，则继续压缩
                if (compressedSize > 200 * 1024 && quality > 30) {
                  console.log(`文件大小${(compressedSize / 1024).toFixed(2)}KB超过200KB，继续压缩...`);
                  compressWithQuality(quality - 10);
                } else {
                  imageInfo.compressedPath = res.tempFilePath;
                  imageInfo.previewUrl = res.tempFilePath;
                  imageInfo.compressedSize = compressedSize;
                  console.log(`最终压缩质量${quality}%，文件大小: ${(compressedSize / 1024).toFixed(2)}KB`);
                  resolve(imageInfo);
                }
              },
              fail: () => {
                // 如果无法获取文件信息，直接使用压缩结果
                imageInfo.compressedPath = res.tempFilePath;
                imageInfo.previewUrl = res.tempFilePath;
                resolve(imageInfo);
              }
            });
          },
          fail: err => {
            console.warn(`压缩质量${quality}%失败:`, err);
            if (quality > 30) {
              // 如果压缩失败且质量还可以降低，尝试更低的质量
              compressWithQuality(quality - 10);
            } else {
              // 如果所有压缩都失败，使用原图
              imageInfo.compressedPath = imageInfo.originalPath;
              imageInfo.previewUrl = imageInfo.originalPath;
              imageInfo.needCompression = false;
              resolve(imageInfo);
            }
          }
        });
      };
      
      // 从60%质量开始压缩，逐步降低直到文件大小符合要求
      compressWithQuality(60);
    });
  },

  removeCommentImage: function(e) {
    const index = e.currentTarget.dataset.index;
    if (index === undefined) return;
    const images = (this.data.commentImages || []).slice();
    images.splice(index, 1);
    this.setData({ commentImages: images }, () => {
      this.updateSubmitState();
    });
  },

  previewSelectedCommentImage: function(e) {
    const index = e.currentTarget.dataset.index || 0;
    const images = this.data.commentImages || [];
    if (!images.length) return;
    const urls = images.map(item => item.previewUrl);
    wx.previewImage({
      current: urls[index],
      urls: urls
    });
  },

  uploadCommentImages: function() {
    const images = this.data.commentImages || [];
    if (!images.length) {
      return Promise.resolve([]);
    }
    const openid = this.getCurrentUserId() || 'guest';
    const timestamp = Date.now();
    return Promise.all(images.map((image, index) => {
      const uniqueKey = (openid || 'guest') + '_' + timestamp + '_' + index;
      const compressedCloudPath = 'comment_images/' + uniqueKey + '_compressed.jpg';
      return wx.cloud.uploadFile({
        cloudPath: compressedCloudPath,
        filePath: image.compressedPath || image.previewUrl || image.originalPath
      }).then(compressedRes => {
        if (image.needCompression) {
          const originalCloudPath = 'comment_images/' + uniqueKey + '_original.jpg';
          return wx.cloud.uploadFile({
            cloudPath: originalCloudPath,
            filePath: image.originalPath
          }).then(originalRes => ({
            compressedUrl: compressedRes.fileID,
            originalUrl: originalRes.fileID
          }));
        }
        return {
          compressedUrl: compressedRes.fileID,
          originalUrl: compressedRes.fileID
        };
      });
    }));
  },

  previewCommentImageFromList: function(e) {
    const commentIndex = Number(e.currentTarget.dataset.commentIndex);
    const replyIndexRaw = e.currentTarget.dataset.replyIndex;
    const replyIndex = typeof replyIndexRaw === 'undefined' ? -1 : Number(replyIndexRaw);
    const imageIndex = Number(e.currentTarget.dataset.imageIndex) || 0;
    const isReplyRaw = e.currentTarget.dataset.isReply;
    const isReply = isReplyRaw === true || isReplyRaw === 'true';

    let images = [];
    if (!Number.isNaN(commentIndex) && commentIndex >= 0) {
      const targetComment = this.data.comments[commentIndex];
      if (targetComment) {
        if (isReply && Array.isArray(targetComment.replies) && replyIndex >= 0) {
          const targetReply = targetComment.replies[replyIndex];
          if (targetReply) {
            if (Array.isArray(targetReply.originalImageUrls) && targetReply.originalImageUrls.length > 0) {
              images = targetReply.originalImageUrls;
            } else if (Array.isArray(targetReply.imageUrls)) {
              images = targetReply.imageUrls;
            }
          }
        } else {
          if (Array.isArray(targetComment.originalImageUrls) && targetComment.originalImageUrls.length > 0) {
            images = targetComment.originalImageUrls;
          } else if (Array.isArray(targetComment.imageUrls)) {
            images = targetComment.imageUrls;
          }
        }
      }
    }

    if (!images || !images.length) {
      return;
    }

    wx.previewImage({
      current: images[imageIndex] || images[0],
      urls: images
    });
  },

  onSubmitComment: async function() {
    if (this.data.isSubmitDisabled || this.data.isSubmittingComment) return;

    const trimmedContent = (this.data.newComment || '').trim();
    const hasContent = trimmedContent.length > 0;
    const hasImages = Array.isArray(this.data.commentImages) && this.data.commentImages.length > 0;

    if (!hasContent && !hasImages) {
      wx.showToast({ title: '请输入内容或添加图片', icon: 'none' });
      return;
    }

    const postId = this.data.post && this.data.post._id;
    if (!postId) {
      wx.showToast({ title: '帖子信息缺失', icon: 'none' });
      return;
    }

    const parentId = this.data.replyToComment;
    const replyToAuthor = this.data.replyToAuthor;

    this.setData({ isSubmittingComment: true });
    this.updateSubmitState();
    wx.showLoading({ title: '提交中...' });

    try {
      const imageUploadResults = await this.uploadCommentImages();
      const imageUrls = imageUploadResults.map(item => item.compressedUrl);
      const originalImageUrls = imageUploadResults.map(item => item.originalUrl);

      const res = await wx.cloud.callFunction({
        name: 'addComment',
        data: {
          postId: postId,
          content: trimmedContent,
          parentId: parentId,
          replyToAuthorName: replyToAuthor,
          imageUrls: imageUrls,
          originalImageUrls: originalImageUrls
        }
      });

      wx.hideLoading();

      if (res.result && res.result.success) {
        wx.showToast({ title: '评论成功' });
        const newCommentCount = this.data.commentCount + 1;

        this.setData({
          newComment: '',
          commentImages: [],
          showEmojiPanel: false,
          commentCount: newCommentCount
        });
        this.updateSubmitState();
        this.collapseInput();
        this.getComments(postId);

        const pages = getCurrentPages();
        if (pages.length > 1) {
          const prePage = pages[pages.length - 2];
          if ((prePage.route === 'pages/index/index' || prePage.route === 'pages/profile/profile') && typeof prePage.updatePostCommentCount === 'function') {
            prePage.updatePostCommentCount(postId, newCommentCount);
          }
        }
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '评论失败', icon: 'none' });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('Failed to add comment with media:', error);
      wx.showToast({ title: '评论失败', icon: 'none' });
    } finally {
      this.setData({ isSubmittingComment: false });
      this.updateSubmitState();
    }
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
    this.fetchFollowStatusWithCache(authorOpenid);
  },

  fetchFollowStatusWithCache: function(targetOpenid) {
    if (!targetOpenid) {
      return;
    }
    
    const currentUserId = this.getCurrentUserId();
    if (!currentUserId) {
      return;
    }

    // 使用缓存获取关注状态
    followCache.getFollowStatus(currentUserId, targetOpenid).then(followData => {
      if (followData) {
        this.setData({
          isFollowing: followData.isFollowing,
          isFollowedByAuthor: followData.isFollowedByAuthor,
          isMutualFollow: followData.isMutualFollow
        });
      }
    });
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

    // 使用缓存切换关注状态
    followCache.toggleFollowStatus(currentUserId, targetOpenid).then(followData => {
      if (followData) {
        this.setData({ 
          isFollowing: followData.isFollowing,
          isFollowedByAuthor: followData.isFollowedByAuthor,
          isMutualFollow: followData.isMutualFollow
        });
        wx.showToast({
          title: followData.isFollowing ? '关注成功' : '已取消关注',
          icon: 'success'
        });
      } else {
        wx.showToast({
          title: '操作失败',
          icon: 'none'
        });
      }
    }).catch(err => {
      console.error('切换关注状态失败:', err);
      wx.showToast({
        title: '网络错误',
        icon: 'none'
      });
    }).finally(() => {
      this.setData({ followPending: false });
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
      isFocus: true,
      showEmojiPanel: false
    });
  },

  onInputFocus: function(e) {
    console.log('键盘弹起，高度为:', e.detail.height);
    this.setData({
      keyboardHeight: e.detail.height,
      showEmojiPanel: false
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
      replyToAuthor: '',
      showEmojiPanel: false
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

















