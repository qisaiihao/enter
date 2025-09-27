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
    showPoemSubmenu: false, // 是否显示写诗子菜单
    canPublish: false, // 是否可以发布
    selectedTags: [], // 选中的标签
    customTag: '', // 自定义标签输入
    showTagSelector: false, // 是否显示标签选择器
    currentCategoryIndex: 0, // 当前选中的分类索引
    allExistingTags: [], // 所有已有标签
    matchedTags: [], // 匹配的标签
    showMatchedTags: false, // 是否显示匹配的标签
    isPublished: false, // 是否已发布成功，用于避免发布后再次询问保存草稿
    isTemporaryHide: false, // 是否临时隐藏（如选择图片），用于避免触发草稿保存
    author: '', // 作者信息
    keyboardHeight: 0, // 键盘高度
    
    // 标签分类数据
    tagCategories: [
      {
        name: '内容主题',
        icon: '📝',
        tags: ['爱情', '亲情', '友情', '乡愁', '思念', '孤独', '咏物', '山水', '田园', '季节', '春天', '夏日', '秋风', '冬雪', '人生', '理想', '哲理', '时间', '青春', '成长', '生死', '怀古', '咏史', '边塞', '战争', '爱国', '城市', '乡村', '生活', '旅行', '饮食', '劳动']
      },
      {
        name: '情感基调',
        icon: '💭',
        tags: ['治愈', '温暖', '浪漫', '唯美', '悲伤', '伤感', '惆怅', '寂寞', '豪放', '豁达', '激昂', '热血', '婉约', '细腻', '清新', '宁静', '励志', '鼓舞', '坚定', '充满希望', '讽刺', '批判', '深沉', '引人深思']
      },
      {
        name: '形式体裁',
        icon: '📖',
        tags: ['古体诗', '近体诗', '五言', '七言', '绝句', '律诗', '词', '曲', '乐府', '骚体', '现代诗', '自由诗', '散文诗', '十四行诗', '叙事诗', '俳句', '短歌', '史诗', '长诗', '短诗', '微型诗', '三行诗']
      },
      {
        name: '意象元素',
        icon: '🌙',
        tags: ['月亮', '星星', '太阳', '宇宙', '银河', '风', '雨', '雪', '云', '雾', '河流', '大海', '山峰', '森林', '花', '草', '树', '麦田', '落叶', '梅', '兰', '竹', '菊', '鸟', '马', '蝉', '鱼', '蝴蝶', '酒', '剑', '琴', '灯', '船', '镜子', '红色', '白色', '蓝色', '金色']
      },
      {
        name: '风格流派',
        icon: '🎭',
        tags: ['唐诗', '宋词', '元曲', '先秦', '两汉', '魏晋', '建安风骨', '朦胧诗', '新月派', '浪漫主义', '现实主义', '象征主义', '现代主义', '意象派', '垮掉的一代', '中文诗', '英文诗', '日文诗', '法文诗', '翻译诗', '中国', '英国', '美国', '日本', '俄罗斯']
      },
      {
        name: '场景用途',
        icon: '🎯',
        tags: ['晚安诗', '早安问候', '节日祝福', '春节', '中秋', '情人节', '毕业季', '婚礼致辞', '旅行途中', '雨天读诗', '写给孩子', '致敬母亲', '送给朋友', '适合摘抄', '可以用作签名']
      }
    ]
  },

  onLoad: function (options) {
    // 页面加载时获取所有已有标签
    this.loadAllExistingTags();
    
    // 检查是否是编辑草稿模式
    if (options.mode === 'edit') {
      this.loadEditingDraft();
    } else {
      // 加载草稿
      this.loadDraft();
    }
    
    // 确保页面不会滚动
    this.preventPageScroll();
  },

  onShow: function() {
    // 每次显示页面时都确保页面不会滚动
    this.preventPageScroll();
  },

  preventPageScroll: function() {
    // 尝试禁用页面滚动
    try {
      wx.pageScrollTo({
        scrollTop: 0,
        duration: 0
      });
    } catch (e) {
      console.log('preventPageScroll error:', e);
    }
  },

  onUnload: function () {
    // 页面卸载时检查是否需要保存草稿（如果已发布成功则不检查）
    if (!this.data.isPublished) {
      this.checkAndSaveDraft();
    }
  },

  onHide: function () {
    // 页面隐藏时检查是否需要保存草稿（如果已发布成功或临时隐藏则不检查）
    if (!this.data.isPublished && !this.data.isTemporaryHide) {
      this.checkAndSaveDraft();
    }
    // 重置临时隐藏标志
    this.setData({ isTemporaryHide: false });
  },

  onTitleInput: function(event) { 
    this.setData({ title: event.detail.value }); 
    this.checkCanPublish();
  },
  
  onContentInput: function(event) {
    const { value, cursor } = event.detail;
    this.setData({ content: value });
    this.checkCanPublish();
  },

  onContainerTap: function(event) {
    // 点击空白区域退出输入法，但不要立即隐藏，给textarea一点时间
    console.log('容器被点击，准备隐藏键盘');
    setTimeout(() => {
      wx.hideKeyboard();
    }, 100);
  },

  onTextareaTap: function(event) {
    // 确保输入框能正常获取焦点
    console.log('textarea被点击，应该获取焦点');
  },

  // 输入框获得焦点时触发，获取键盘高度
  onTextareaFocus: function(e) {
    console.log('textarea获得焦点，键盘高度:', e.detail.height);
    // 在开发者工具中，键盘高度可能为0，我们需要设置一个默认值
    let keyboardHeight = e.detail.height;
    
    // 如果键盘高度为0，可能是开发者工具的问题，设置一个合理的默认值
    if (!keyboardHeight || keyboardHeight === 0) {
      // 获取系统信息来设置合适的键盘高度
      const systemInfo = wx.getSystemInfoSync();
      console.log('系统信息:', systemInfo);
      // 根据屏幕高度设置键盘高度，通常是屏幕高度的1/3到1/2
      keyboardHeight = Math.min(systemInfo.windowHeight * 0.4, 300);
      console.log('使用默认键盘高度:', keyboardHeight);
    }
    
    this.setData({
      keyboardHeight: keyboardHeight
    });
  },

  // 输入框失去焦点时触发，重置键盘高度
  onTextareaBlur: function() {
    console.log('textarea失去焦点');
    this.setData({
      keyboardHeight: 0
    });
  },


  onAuthorInput: function(event) {
    this.setData({ author: event.detail.value });
    this.checkCanPublish();
  },

  // 检查是否可以发布
  checkCanPublish: function() {
    const hasImages = this.data.imageList.length > 0;
    const hasTitle = this.data.title && this.data.title.trim();
    const hasContent = this.data.content && this.data.content.trim();
    
    let canPublish = hasImages || (hasTitle && hasContent);
    
    // 如果是非原创诗歌，必须填写作者
    if (this.data.publishMode === 'poem' && !this.data.isOriginal) {
      const hasAuthor = this.data.author && this.data.author.trim();
      canPublish = canPublish && hasAuthor;
    }
    
    this.setData({ canPublish: canPublish });
  },

  // 切换发布模式
  switchMode: function() {
    if (this.data.publishMode === 'normal') {
      if (this.data.showPoemSubmenu) {
        // 如果子菜单已显示，再次点击写诗按钮则收起子菜单
        this.setData({ 
          showPoemSubmenu: false
        });
      } else {
        // 从普通模式切换到写诗模式，显示子菜单
        this.setData({ 
          showPoemSubmenu: true,
          showTagSelector: false // 隐藏标签选择器
        });
      }
    } else {
      // 从写诗模式切换回普通模式
      this.setData({ 
        publishMode: 'normal',
        isOriginal: false,
        showPoemSubmenu: false,
        // 切换到普通模式时重置图片限制
        maxImageCount: 9
      });
      this.checkCanPublish();
    }
  },

  // 选择写诗模式（原创/非原创）
  selectPoemMode: function(e) {
    const isOriginal = e.currentTarget.dataset.original === 'true';
    this.setData({ 
      publishMode: 'poem',
      isOriginal: isOriginal,
      showPoemSubmenu: false,
      // 切换到诗歌模式时重置图片
      imageList: this.data.imageList.length > 1 ? [] : this.data.imageList,
      maxImageCount: 1
    });
    this.checkCanPublish();
  },



  handleChooseImage: function() {
    const that = this;
    const remainingCount = this.data.maxImageCount - this.data.imageList.length;
    
    if (remainingCount <= 0) {
      wx.showToast({ title: '最多只能上传9张图片', icon: 'none' });
      return;
    }
    
    // 设置临时隐藏标志，避免触发草稿保存
    this.setData({ isTemporaryHide: true });
    
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
          that.checkCanPublish();
        }).catch(err => {
          wx.hideLoading();
          wx.showToast({ title: '图片处理失败', icon: 'none' });
          console.error('图片处理失败:', err);
        });
      },
      fail: (err) => {
        console.log('选择图片取消或失败:', err);
        // 重置临时隐藏标志
        this.setData({ isTemporaryHide: false });
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
    this.checkCanPublish();
  },
  
  submitPost: function() {
    if (!this.data.canPublish) {
      wx.showToast({ title: '请至少上传图片或输入内容', icon: 'none' });
      return;
    }
    
    const hasTitle = this.data.title && this.data.title.trim();
    const hasContent = this.data.content && this.data.content.trim();
    
    if (hasTitle && !hasContent) {
      wx.showToast({ title: '请输入正文内容', icon: 'none' });
      return;
    }
    
    // 如果是非原创诗歌，必须填写作者
    if (this.data.publishMode === 'poem' && !this.data.isOriginal) {
      const hasAuthor = this.data.author && this.data.author.trim();
      if (!hasAuthor) {
        wx.showToast({ title: '非原创诗歌必须填写作者', icon: 'none' });
        return;
      }
    }
    
    console.log('提交帖子:', {
      imageList: this.data.imageList,
      title: this.data.title,
      content: this.data.content
    });
    
    // 如果是非原创诗歌，先检查重复
    if (this.data.publishMode === 'poem' && !this.data.isOriginal) {
      this.checkDuplicatePoem();
    } else {
      // 直接发布
      wx.showLoading({ title: '发布中...' });
      if (this.data.imageList.length > 0) {
        this.uploadImagesAndSubmit();
      } else {
        this.submitTextOnly();
      }
    }
  },

  // 检查重复诗歌
  checkDuplicatePoem: function() {
    wx.showLoading({ title: '检查中...' });
    
    wx.cloud.callFunction({
      name: 'checkDuplicatePoem',
      data: {
        title: this.data.title.trim(),
        author: this.data.author.trim(),
        isOriginal: this.data.isOriginal
      },
      success: res => {
        wx.hideLoading();
        console.log('重复检查结果:', res.result);
        
        if (res.result.success) {
          if (res.result.isDuplicate) {
            // 发现重复，显示确认对话框
            this.showDuplicateConfirmDialog(res.result.duplicateCount);
          } else {
            // 没有重复，直接发布
            this.proceedWithPublish();
          }
        } else {
          wx.showToast({ title: '检查失败，请重试', icon: 'none' });
        }
      },
      fail: err => {
        wx.hideLoading();
        console.error('检查重复失败:', err);
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      }
    });
  },

  // 显示重复确认对话框
  showDuplicateConfirmDialog: function(duplicateCount) {
    wx.showModal({
      title: '发现重复诗歌',
      content: `已有 ${duplicateCount} 篇相同的诗歌发布，是否继续发布？`,
      confirmText: '继续发布',
      cancelText: '取消发布',
      success: res => {
        if (res.confirm) {
          // 用户选择继续发布
          this.proceedWithPublish();
        } else {
          // 用户选择取消发布
          console.log('用户取消发布重复诗歌');
        }
      }
    });
  },

  // 继续发布流程
  proceedWithPublish: function() {
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
      return that.submitWithContentCheck(uploadResults);
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
    
    // 确定作者信息
    let authorName = '';
    if (this.data.publishMode === 'poem') {
      if (this.data.isOriginal) {
        // 原创诗歌：如果填写了作者就用填写的，否则使用用户昵称
        const userInfo = wx.getStorageSync('userInfo');
        const userNickName = userInfo ? userInfo.nickName : '匿名用户';
        authorName = this.data.author && this.data.author.trim() ? this.data.author.trim() : userNickName;
      } else {
        // 非原创诗歌：必须使用填写的作者
        authorName = this.data.author && this.data.author.trim() ? this.data.author.trim() : '';
      }
    }

    const postData = {
      title: this.data.title,
      content: this.data.content,
      createTime: new Date(),
      votes: 0,
      // 新增诗歌相关字段
      isPoem: this.data.publishMode === 'poem',
      isOriginal: this.data.isOriginal,
      // 新增作者字段
      author: authorName,
      // 新增标签字段
      tags: this.data.selectedTags || []
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
    this.submitWithContentCheck([]);
  },

  // 新增：带内容审核的提交函数
  submitWithContentCheck: function(uploadResults) {
    const that = this;
    
    console.log('开始内容审核和提交:', {
      uploadResults: uploadResults,
      title: this.data.title,
      content: this.data.content,
      publishMode: this.data.publishMode,
      isOriginal: this.data.isOriginal,
      author: this.data.author,
      tags: this.data.selectedTags
    });
    
    // 准备审核参数
    const fileIDs = uploadResults.map(result => result.compressedUrl);
    const auditParams = {
      title: this.data.title,
      content: this.data.content,
      fileIDs: fileIDs,
      publishMode: this.data.publishMode,
      isOriginal: this.data.isOriginal,
      author: this.data.author,
      tags: this.data.selectedTags || []
    };
    
    // 调用内容审核云函数
    wx.cloud.callFunction({
      name: 'contentCheck',
      data: auditParams
    }).then(res => {
      console.log('内容审核结果:', res);
      
      if (res.result.code === 0) {
        // 审核通过，发布成功
        that.publishSuccess({ _id: res.result.postId });
      } else {
        // 审核不通过，显示错误信息
        wx.hideLoading();
        wx.showModal({
          title: '发布失败',
          content: res.result.msg || '内容审核不通过，请检查内容后重试',
          showCancel: false
        });
      }
    }).catch(err => {
      console.error('内容审核失败:', err);
      that.publishFail(err);
    });
  },

  publishSuccess: function(res) {
    wx.hideLoading();
    wx.showToast({ title: '发布成功！' });
    // 新增：设置各页面需要刷新标记
    try {
      wx.setStorageSync('shouldRefreshIndex', true);
      wx.setStorageSync('shouldRefreshProfile', true);
      wx.setStorageSync('shouldRefreshPoem', true);
      wx.setStorageSync('shouldRefreshMountain', true);
    } catch (e) {}
    // 设置发布成功标记，避免后续检查草稿
    this.setData({ isPublished: true });
    // 发布成功后清除草稿
    this.clearDraft();
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
  },

  // 标签相关功能
  toggleTagSelector: function() {
    this.setData({
      showTagSelector: !this.data.showTagSelector
    });
  },

  selectTag: function(e) {
    const tag = e.currentTarget.dataset.tag;
    const selectedTags = this.data.selectedTags;
    
    if (selectedTags.includes(tag)) {
      // 如果已选中，则取消选择
      const index = selectedTags.indexOf(tag);
      selectedTags.splice(index, 1);
    } else {
      // 如果未选中且未超过限制，则添加
      if (selectedTags.length < 5) {
        selectedTags.push(tag);
      } else {
        wx.showToast({ title: '最多选择5个标签', icon: 'none' });
        return;
      }
    }
    
    this.setData({ selectedTags: selectedTags });
  },

  onCustomTagInput: function(e) {
    const inputValue = e.detail.value;
    console.log('【标签输入】用户输入:', inputValue);
    this.setData({ customTag: inputValue });
    
    // 防抖处理，避免频繁搜索
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    
    this.searchTimer = setTimeout(() => {
      console.log('【标签搜索】开始搜索匹配标签:', inputValue);
      this.searchMatchingTags(inputValue);
    }, 300); // 300ms防抖
  },

  addCustomTag: function() {
    const customTag = this.data.customTag.trim();
    if (!customTag) {
      wx.showToast({ title: '请输入标签', icon: 'none' });
      return;
    }
    
    if (this.data.selectedTags.includes(customTag)) {
      wx.showToast({ title: '标签已存在', icon: 'none' });
      return;
    }
    
    if (this.data.selectedTags.length >= 5) {
      wx.showToast({ title: '最多选择5个标签', icon: 'none' });
      return;
    }
    
    const selectedTags = [...this.data.selectedTags, customTag];
    this.setData({ 
      selectedTags: selectedTags,
      customTag: ''
    });
  },

  removeTag: function(e) {
    const tag = e.currentTarget.dataset.tag;
    const selectedTags = this.data.selectedTags.filter(t => t !== tag);
    this.setData({ selectedTags: selectedTags });
  },

  // 分类切换功能
  switchCategory: function(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ currentCategoryIndex: index });
  },

  // 获取当前分类的标签
  getCurrentCategoryTags: function() {
    return this.data.tagCategories[this.data.currentCategoryIndex].tags;
  },

  // 加载所有已有标签
  loadAllExistingTags: function() {
    console.log('【标签加载】开始加载所有已有标签...');
    wx.cloud.callFunction({
      name: 'getAllTags',
      success: res => {
        console.log('【标签加载】云函数返回结果:', res);
        if (res.result && res.result.success) {
          this.setData({ allExistingTags: res.result.tags });
          console.log('【标签加载】已加载所有标签:', res.result.tags.length, '个标签:', res.result.tags);
        } else {
          console.error('【标签加载】云函数返回失败:', res.result);
        }
      },
      fail: err => {
        console.error('【标签加载】获取标签失败:', err);
      }
    });
  },

  // 搜索匹配的标签
  searchMatchingTags: function(inputValue) {
    console.log('【标签搜索】搜索参数:', {
      inputValue: inputValue,
      inputLength: inputValue ? inputValue.length : 0,
      allExistingTags: this.data.allExistingTags,
      selectedTags: this.data.selectedTags
    });

    if (!inputValue || inputValue.length < 2) {
      console.log('【标签搜索】输入长度不足，清空匹配结果');
      this.setData({ 
        matchedTags: [],
        showMatchedTags: false
      });
      return;
    }

    const allTags = this.data.allExistingTags;
    console.log('【标签搜索】开始匹配，总标签数:', allTags.length);
    
    const matched = allTags.filter(tag => {
      const isMatch = tag.toLowerCase().includes(inputValue.toLowerCase());
      const notSelected = !this.data.selectedTags.includes(tag);
      console.log(`【标签搜索】检查标签"${tag}": 匹配=${isMatch}, 未选中=${notSelected}`);
      return isMatch && notSelected;
    }).slice(0, 5); // 最多显示5个匹配结果

    console.log('【标签搜索】匹配结果:', matched);

    this.setData({
      matchedTags: matched,
      showMatchedTags: matched.length > 0
    });

    console.log('【标签搜索】设置状态:', {
      matchedTags: matched,
      showMatchedTags: matched.length > 0
    });
  },

  // 选择匹配的标签
  selectMatchedTag: function(e) {
    const tag = e.currentTarget.dataset.tag;
    if (this.data.selectedTags.includes(tag)) {
      wx.showToast({ title: '标签已存在', icon: 'none' });
      return;
    }
    
    if (this.data.selectedTags.length >= 5) {
      wx.showToast({ title: '最多选择5个标签', icon: 'none' });
      return;
    }
    
    const selectedTags = [...this.data.selectedTags, tag];
    this.setData({ 
      selectedTags: selectedTags,
      customTag: '',
      showMatchedTags: false,
      matchedTags: []
    });
  },

  // 检查是否有内容需要保存草稿
  hasContent: function() {
    const hasTitle = this.data.title && this.data.title.trim();
    const hasContent = this.data.content && this.data.content.trim();
    const hasImages = this.data.imageList.length > 0;
    const hasTags = this.data.selectedTags.length > 0;
    
    return hasTitle || hasContent || hasImages || hasTags;
  },

  // 检查并保存草稿
  checkAndSaveDraft: function() {
    if (this.hasContent()) {
      wx.showModal({
        title: '保存草稿',
        content: '检测到您有未完成的内容，是否保存为草稿？',
        confirmText: '保存',
        cancelText: '不保存',
        success: (res) => {
          if (res.confirm) {
            this.saveDraft();
          } else {
            this.clearDraft();
          }
        }
      });
    }
  },

  // 保存草稿
  saveDraft: function() {
    const draftData = {
      title: this.data.title,
      content: this.data.content,
      imageList: this.data.imageList,
      publishMode: this.data.publishMode,
      isOriginal: this.data.isOriginal,
      selectedTags: this.data.selectedTags,
      customTag: this.data.customTag,
      author: this.data.author,
      saveTime: new Date()
    };
    
    wx.showLoading({ title: '保存中...' });
    
    wx.cloud.callFunction({
      name: 'getMyProfileData',
      data: {
        action: 'saveDraft',
        draftData: draftData
      },
      success: res => {
        wx.hideLoading();
        if (res.result && res.result.success) {
          wx.showToast({ title: '草稿已保存', icon: 'success' });
          // 清除本地草稿
          this.clearDraft();
        } else {
          console.error('保存草稿失败:', res.result);
          wx.showToast({ 
            title: res.result?.message || '保存草稿失败', 
            icon: 'none' 
          });
        }
      },
      fail: err => {
        wx.hideLoading();
        console.error('保存草稿失败:', err);
        wx.showToast({ title: '网络错误，保存失败', icon: 'none' });
      }
    });
  },

  // 加载草稿
  loadDraft: function() {
    try {
      const draftData = wx.getStorageSync('publish_draft');
      if (draftData && draftData.saveTime) {
        // 检查草稿是否过期（7天）
        const now = new Date().getTime();
        const draftAge = now - draftData.saveTime;
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        
        if (draftAge < sevenDays) {
          wx.showModal({
            title: '恢复草稿',
            content: '检测到您有未完成的草稿，是否恢复？',
            confirmText: '恢复',
            cancelText: '重新开始',
            success: (res) => {
              if (res.confirm) {
                this.setData({
                  title: draftData.title || '',
                  content: draftData.content || '',
                  imageList: draftData.imageList || [],
                  publishMode: draftData.publishMode || 'normal',
                  isOriginal: draftData.isOriginal || false,
                  selectedTags: draftData.selectedTags || [],
                  customTag: draftData.customTag || '',
                  author: draftData.author || '',
                  maxImageCount: draftData.publishMode === 'poem' ? 1 : 9
                });
                this.checkCanPublish();
                wx.showToast({ title: '草稿已恢复', icon: 'success' });
              } else {
                this.clearDraft();
              }
            }
          });
        } else {
          // 草稿过期，自动清除
          this.clearDraft();
        }
      }
    } catch (e) {
      console.error('加载草稿失败:', e);
    }
  },

  // 加载编辑中的草稿
  loadEditingDraft: function() {
    try {
      const draftData = wx.getStorageSync('editing_draft');
      if (draftData) {
        this.setData({
          title: draftData.title || '',
          content: draftData.content || '',
          imageList: draftData.imageList || [],
          publishMode: draftData.publishMode || 'normal',
          isOriginal: draftData.isOriginal || false,
          selectedTags: draftData.selectedTags || [],
          customTag: draftData.customTag || '',
          author: draftData.author || '',
          maxImageCount: draftData.publishMode === 'poem' ? 1 : 9
        });
        this.checkCanPublish();
        wx.showToast({
          title: '草稿已加载',
          icon: 'success'
        });
        // 清除编辑草稿数据
        wx.removeStorageSync('editing_draft');
      }
    } catch (e) {
      console.error('加载编辑草稿失败:', e);
      wx.showToast({
        title: '加载草稿失败',
        icon: 'none'
      });
    }
  },

  // 清除草稿
  clearDraft: function() {
    try {
      wx.removeStorageSync('publish_draft');
    } catch (e) {
      console.error('清除草稿失败:', e);
    }
  },

})
