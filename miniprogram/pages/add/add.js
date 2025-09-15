// pages/add/add.js
const db = wx.cloud.database();

Page({
  data: {
    title: '',
    content: '',
    imageList: [], // 图片列表，包含原图和压缩图信息
    maxImageCount: 9, // 最大图片数量
    publishMode: 'normal', // 'normal' | 'poem' 普通模式 | 诗歌模式
    isOriginal: false, // 是否原创
    poemBgImage: '' // 诗歌背景图
  },

  onTitleInput: function(event) { 
    this.setData({ title: event.detail.value }); 
  },
  
  onContentInput: function(event) { 
    this.setData({ content: event.detail.value }); 
  },

  // 切换发布模式
  switchMode: function() {
    const newMode = this.data.publishMode === 'normal' ? 'poem' : 'normal';
    this.setData({ 
      publishMode: newMode,
      // 切换到诗歌模式时重置图片
      imageList: newMode === 'poem' && this.data.imageList.length > 1 ? [] : this.data.imageList,
      maxImageCount: newMode === 'poem' ? 1 : 9
    });
  },

  // 切换原创状态
  toggleOriginal: function() {
    this.setData({ isOriginal: !this.data.isOriginal });
  },

  handleChooseImage: function() {
    const that = this;
    const remainingCount = this.data.maxImageCount - this.data.imageList.length;
    
    if (remainingCount <= 0) {
      wx.showToast({ title: '最多只能上传9张图片', icon: 'none' });
      return;
    }
    
    wx.chooseImage({
      count: remainingCount,
      // 关键修改1：强制使用原图，把压缩控制权完全交给自己的代码
      sizeType: ['original'], 
      sourceType: ['album', 'camera'],
      success: (res) => {
        wx.showLoading({ title: '处理中...' });

        // 关键修改2：不再使用 res.tempFilePaths，而是使用包含size的 res.tempFiles
        console.log('wx.chooseImage 返回的详细文件信息:', res.tempFiles);

        const imagePromises = res.tempFiles.map((file) => {
          // 现在 file 是一个对象，例如 {path: '...', size: 12345}
          const tempFilePath = file.path;
          const sizeInBytes = file.size;

          console.log(`获取到图片 ${tempFilePath} 的原始大小:`, (sizeInBytes / 1024).toFixed(2), 'KB');

          const needCompression = sizeInBytes > 300 * 1024;
          
          const imageInfo = {
            originalPath: tempFilePath,
            imageSize: sizeInBytes,
            needCompression: needCompression,
            previewUrl: tempFilePath,
            compressedPath: tempFilePath,
            originalUrl: '',
            compressedUrl: ''
          };

          if (needCompression) {
            // 如果需要压缩，调用返回Promise的压缩函数
            return that.compressImage(imageInfo);
          } else {
            // 如果不需要压缩，直接用 Promise.resolve 包装后返回
            return Promise.resolve(imageInfo);
          }
        });

        Promise.all(imagePromises).then(newImages => {
          wx.hideLoading();
          that.updateImageList(newImages);
        }).catch(err => {
          wx.hideLoading();
          wx.showToast({ title: '图片处理失败', icon: 'none' });
          console.error('图片处理失败:', err);
        });
      },
      fail: (err) => {
        console.log('选择图片取消或失败:', err);
      }
    });
},

  compressImage: function(imageInfo) {
    return new Promise((resolve) => {
      wx.compressImage({
        src: imageInfo.originalPath,
        quality: 80,
        success: (compressRes) => {
          imageInfo.compressedPath = compressRes.tempFilePath;
          imageInfo.previewUrl = compressRes.tempFilePath;
          resolve(imageInfo);
        },
        fail: (err) => {
          // 压缩失败，使用原图作为备用
          console.log('压缩失败，使用原图:', err);
          imageInfo.compressedPath = imageInfo.originalPath;
          imageInfo.previewUrl = imageInfo.originalPath;
          resolve(imageInfo);
        }
      });
    });
  },

  updateImageList: function(newImages) {
    const currentList = this.data.imageList;
    const updatedList = currentList.concat(newImages);
    this.setData({
      imageList: updatedList
    });
  },

  removeImage: function(e) {
    const index = e.currentTarget.dataset.index;
    const imageList = this.data.imageList;
    imageList.splice(index, 1);
    this.setData({
      imageList: imageList
    });
  },
  
  submitPost: function() {
    const hasImages = this.data.imageList.length > 0;
    const hasTitle = this.data.title && this.data.title.trim();
    const hasContent = this.data.content && this.data.content.trim();
    
    if (!hasImages && !hasTitle && !hasContent) {
      wx.showToast({ title: '请至少上传图片或输入内容', icon: 'none' });
      return;
    }
    
    if (hasTitle && !hasContent) {
      wx.showToast({ title: '请输入正文内容', icon: 'none' });
      return;
    }
    
    console.log('提交帖子:', {
      imageList: this.data.imageList,
      title: this.data.title,
      content: this.data.content
    });
    
    wx.showLoading({ title: '发布中...' });

    if (this.data.imageList.length > 0) {
      this.uploadImagesAndSubmit();
    } else {
      this.submitTextOnly();
    }
  },
  
  uploadImagesAndSubmit: function() {
    const that = this;
    const timestamp = new Date().getTime();
    const imageList = this.data.imageList;
    
    console.log('开始上传图片:', imageList.length + '张');

    const uploadPromises = imageList.map((imageInfo, index) => {
      return new Promise((resolve, reject) => {
        const imageTimestamp = timestamp + index;
        const compressedCloudPath = `post_images/${imageTimestamp}_compressed.jpg`;
        
        wx.cloud.uploadFile({
          cloudPath: compressedCloudPath,
          filePath: imageInfo.compressedPath,
        }).then(compressedRes => {
          console.log('压缩图上传成功:', compressedRes.fileID);
          const compressedFileID = compressedRes.fileID;
          
          if (imageInfo.needCompression) {
            const originalCloudPath = `post_images/${imageTimestamp}_original.jpg`;
            return wx.cloud.uploadFile({
              cloudPath: originalCloudPath,
              filePath: imageInfo.originalPath,
            }).then(originalRes => {
              console.log('原图上传成功:', originalRes.fileID);
              resolve({
                compressedUrl: compressedFileID,
                originalUrl: originalRes.fileID
              });
            });
          } else {
            resolve({
              compressedUrl: compressedFileID,
              originalUrl: compressedFileID
            });
          }
        }).catch(reject);
      });
    });

    Promise.all(uploadPromises).then(uploadResults => {
      console.log('所有图片上传完成:', uploadResults);
      return that.submitToDatabase(uploadResults);
    }).catch(err => {
      console.error('上传失败:', err);
      that.publishFail(err);
    });
  },

  submitToDatabase: function(uploadResults) {
    console.log('提交到数据库:', {
      uploadResults: uploadResults,
      title: this.data.title,
      content: this.data.content,
      publishMode: this.data.publishMode,
      isOriginal: this.data.isOriginal
    });
    
    const imageUrls = uploadResults.map(result => result.compressedUrl);
    const originalImageUrls = uploadResults.map(result => result.originalUrl);
    
    const postData = {
      title: this.data.title,
      content: this.data.content,
      createTime: new Date(),
      votes: 0,
      // 新增诗歌相关字段
      isPoem: this.data.publishMode === 'poem',
      isOriginal: this.data.isOriginal
    };
    
    if (imageUrls.length > 0) {
      postData.imageUrl = imageUrls[0];
      postData.imageUrls = imageUrls;
      postData.originalImageUrl = originalImageUrls[0];
      postData.originalImageUrls = originalImageUrls;
      
      // 如果是诗歌模式，第一张图片作为背景图
      if (this.data.publishMode === 'poem' && imageUrls.length > 0) {
        postData.poemBgImage = imageUrls[0];
      }
    }
    
    return db.collection('posts').add({
      data: postData
    }).then(res => {
      console.log('数据库提交成功:', res);
      this.publishSuccess(res);
    }).catch(err => {
      console.error('数据库提交失败:', err);
      this.publishFail(err);
    });
  },

  submitTextOnly: function() {
    this.submitToDatabase([]);
  },

  publishSuccess: function(res) {
    wx.hideLoading();
    wx.showToast({ title: '发布成功！' });
    // 新增：设置首页和我的主页需要刷新标记
    try {
      wx.setStorageSync('shouldRefreshIndex', true);
      wx.setStorageSync('shouldRefreshProfile', true);
    } catch (e) {}
    wx.navigateBack({ delta: 1 });
  },

  publishFail: function(err) {
    wx.hideLoading();
    wx.showToast({ title: '发布失败', icon: 'none' });
    console.error('[发布流程] 失败：', err);
  },

  // 新增：图片加载失败反馈
  onImageError: function(e) {
    wx.showToast({ title: '图片加载失败', icon: 'none' });
    console.error('图片加载失败', e);
  }
})