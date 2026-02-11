// 用户反馈页面
Page({
  data: {
    content: '', // 反馈内容
    images: [], // 反馈图片
    submitting: false, // 提交状态
    maxImages: 3, // 最大图片数量
    statusBarHeight: 0, // 状态栏高度
  },

  onLoad: function () {
    // 获取状态栏高度
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    });
  },

  // 输入反馈内容
  onContentInput: function (e) {
    this.setData({
      content: e.detail.value
    });
  },

  // 选择图片
  chooseImages: function () {
    const { images, maxImages } = this.data;
    const remaining = maxImages - images.length;
    
    if (remaining <= 0) {
      wx.showToast({
        title: `最多只能上传${maxImages}张图片`,
        icon: 'none'
      });
      return;
    }

    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFiles = res.tempFiles.map(file => ({
          path: file.tempFilePath,
          size: file.size
        }));
        
        this.setData({
          images: [...images, ...tempFiles]
        });
      },
      fail: (err) => {
        console.error('选择图片失败:', err);
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        });
      }
    });
  },

  // 删除图片
  removeImage: function (e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images;
    images.splice(index, 1);
    this.setData({ images });
  },

  // 预览图片
  previewImage: function (e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images;
    const urls = images.map(img => img.path);
    
    wx.previewImage({
      current: urls[index],
      urls: urls
    });
  },

  // 提交反馈
  submitFeedback: function () {
    const { content, images, submitting } = this.data;
    
    if (submitting) return;
    
    if (!content.trim()) {
      wx.showToast({
        title: '请输入反馈内容',
        icon: 'none'
      });
      return;
    }

    this.setData({ submitting: true });
    
    // 先上传图片
    this.uploadImages(images).then((imageUrls) => {
      // 提交反馈数据
      return this.submitFeedbackData(content, imageUrls);
    }).then(() => {
      wx.showToast({
        title: '反馈提交成功',
        icon: 'success'
      });
      
      // 清空表单
      this.setData({
        content: '',
        images: []
      });
      
      // 延迟返回上一页
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }).catch((error) => {
      console.error('提交反馈失败:', error);
      wx.showToast({
        title: '提交失败，请重试',
        icon: 'none'
      });
    }).finally(() => {
      this.setData({ submitting: false });
    });
  },

  // 上传图片到云存储
  uploadImages: function (images) {
    if (images.length === 0) {
      return Promise.resolve([]);
    }

    const uploadPromises = images.map((image, index) => {
      return new Promise((resolve, reject) => {
        const fileName = `feedback/${Date.now()}_${index}.jpg`;
        
        wx.cloud.uploadFile({
          cloudPath: fileName,
          filePath: image.path,
          success: (res) => {
            resolve(res.fileID);
          },
          fail: (err) => {
            console.error('图片上传失败:', err);
            reject(err);
          }
        });
      });
    });

    return Promise.all(uploadPromises);
  },

  // 提交反馈数据
  submitFeedbackData: function (content, imageUrls) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'feedbackManager',
        data: {
          action: 'submitFeedback',
          content: content,
          imageUrls: imageUrls
        },
        success: (res) => {
          if (res.result && res.result.success) {
            resolve(res.result);
          } else {
            reject(new Error(res.result?.message || '提交失败'));
          }
        },
        fail: (err) => {
          console.error('调用云函数失败:', err);
          reject(err);
        }
      });
    });
  },

  // 返回上一页
  goBack: function () {
    wx.navigateBack();
  }
});
