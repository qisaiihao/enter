// pages/profile-edit/profile-edit.js
const app = getApp();
const { compressAvatar } = require('../../utils/avatarCompress');

Page({
  data: {
    avatarUrl: '',
    nickName: '',
    birthday: '',
    bio: '',
    poemId: '',
    password: '',
    endDate: '',
    isSaving: false,
    tempAvatarPath: null,
    signatureUrl: '',
    signaturePreview: '',
    signatureTempPath: null,
    isProcessingSignature: false
  },

  onLoad: function (options) {
    this.originalPoemId = '';
    this.fetchUserProfile();
    const today = new Date();
    const formattedDate = today.getFullYear() + '-' + (today.getMonth() + 1).toString().padStart(2, '0') + '-' + today.getDate().toString().padStart(2, '0');
    this.setData({ endDate: formattedDate });
  },

  fetchUserProfile: function() {
    wx.cloud.callFunction({
      name: 'getMyProfileData',
      success: res => {
        if (res.result && res.result.success && res.result.userInfo) {
          const user = res.result.userInfo;
          this.setData({
            avatarUrl: user.avatarUrl || '',
            nickName: user.nickName || '',
            birthday: user.birthday || '',
            bio: user.bio || '',
            poemId: user.poemId || '',
            password: user.password || '',
            signatureUrl: user.signatureUrl || '',
            signaturePreview: user.signatureUrl || '',
            signatureTempPath: null
          });
          this.originalPoemId = user.poemId || '';
        } else {
          wx.showToast({ title: '加载失败', icon: 'none' });
        }
      },
      fail: err => {
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    });
  },

  onChooseAvatar(e) {
    const originalPath = e.detail.avatarUrl;
    console.log('选择头像，原始路径:', originalPath);
    
    // 显示压缩提示
    wx.showLoading({ title: '压缩头像中...' });
    
    // 压缩头像
    compressAvatar(originalPath)
      .then(compressedPath => {
        console.log('头像压缩完成，压缩后路径:', compressedPath);
        this.setData({ 
          avatarUrl: compressedPath, 
          tempAvatarPath: compressedPath 
        });
        wx.hideLoading();
        wx.showToast({ 
          title: '头像压缩完成', 
          icon: 'success',
          duration: 1500
        });
      })
      .catch(err => {
        console.error('头像压缩失败:', err);
        // 压缩失败，使用原始图片
        this.setData({ 
          avatarUrl: originalPath, 
          tempAvatarPath: originalPath 
        });
        wx.hideLoading();
        wx.showToast({ 
          title: '压缩失败，使用原图', 
          icon: 'none',
          duration: 2000
        });
      });
  },

  onChooseSignature() {
    if (this.data.isProcessingSignature) return;

    const handleResult = (filePath) => {
      if (!filePath) {
        wx.showToast({ title: '未选择图片', icon: 'none' });
        return;
      }
      this.processSignatureImage(filePath);
    };

    const chooseMediaOptions = {
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: res => {
        const file = res.tempFiles && res.tempFiles[0];
        handleResult(file && (file.tempFilePath || file.filePath));
      },
      fail: err => {
        if (err && err.errMsg && err.errMsg.includes('cancel')) {
          return;
        }
        wx.showToast({ title: '选择图片失败', icon: 'none' });
      }
    };

    if (wx.chooseMedia) {
      wx.chooseMedia(chooseMediaOptions);
    } else {
      wx.chooseImage({
        count: 1,
        sizeType: ['original', 'compressed'],
        sourceType: ['album', 'camera'],
        success: res => handleResult(res.tempFilePaths && res.tempFilePaths[0]),
        fail: err => {
          if (err && err.errMsg && err.errMsg.includes('cancel')) {
            return;
          }
          wx.showToast({ title: '选择图片失败', icon: 'none' });
        }
      });
    }
  },

  processSignatureImage(filePath) {
    wx.showLoading({ title: '处理中...', mask: true });
    this.setData({ isProcessingSignature: true });

    wx.createSelectorQuery().select('#signatureCanvas').node().exec(res => {
      const canvasNode = res && res[0] && res[0].node;
      if (!canvasNode) {
        wx.hideLoading();
        wx.showToast({ title: '获取画布失败', icon: 'none' });
        this.setData({ isProcessingSignature: false });
        return;
      }

      const canvas = canvasNode;
      const ctx = canvas.getContext('2d');
      const img = canvas.createImage();
      img.src = filePath;

      img.onload = () => {
        const originalWidth = img.width;
        const originalHeight = img.height;
        const maxSide = 800;
        const scale = Math.min(1, maxSide / Math.max(originalWidth, originalHeight));
        const width = Math.max(1, Math.round(originalWidth * scale));
        const height = Math.max(1, Math.round(originalHeight * scale));

        canvas.width = width;
        canvas.height = height;

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        try {
          const imageData = ctx.getImageData(0, 0, width, height);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const avg = (r + g + b) / 3;
            const diff = Math.max(Math.abs(r - g), Math.abs(r - b), Math.abs(g - b));
            if (avg > 235 && diff < 25) {
              data[i + 3] = 0;
            } else if (avg > 220 && diff < 30) {
              data[i + 3] = Math.min(data[i + 3], 120);
            }
          }
          ctx.putImageData(imageData, 0, 0);
        } catch (error) {
          console.error('签名像素处理失败:', error);
          wx.hideLoading();
          wx.showToast({ title: '处理失败', icon: 'none' });
          this.setData({ isProcessingSignature: false });
          return;
        }

        wx.canvasToTempFilePath({
          canvas,
          x: 0,
          y: 0,
          width,
          height,
          destWidth: width,
          destHeight: height,
          fileType: 'png',
          success: result => {
            wx.hideLoading();
            wx.showToast({ title: '签名已优化', icon: 'success', duration: 1500 });
            this.setData({
              signaturePreview: result.tempFilePath,
              signatureTempPath: result.tempFilePath,
              signatureUrl: ''
            });
          },
          fail: err => {
            console.error('导出签名失败:', err);
            wx.hideLoading();
            wx.showToast({ title: '导出失败', icon: 'none' });
          },
          complete: () => {
            this.setData({ isProcessingSignature: false });
          }
        });
      };

      img.onerror = error => {
        console.error('签名图片加载失败:', error);
        wx.hideLoading();
        wx.showToast({ title: '图片加载失败', icon: 'none' });
        this.setData({ isProcessingSignature: false });
      };
    });
  },

  onNicknameInput(e) {
    this.setData({ nickName: e.detail.value });
  },

  onBirthdayChange(e) {
    this.setData({ birthday: e.detail.value });
  },

  onBioInput(e) {
    this.setData({ bio: e.detail.value });
  },

  onPoemIdInput(e) {
    this.setData({ poemId: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  onSaveChanges: function() {
    if (this.data.isSaving || this.data.isProcessingSignature) return;
    this.setData({ isSaving: true });
    wx.showLoading({ title: '保存中...', mask: true });

    const trimmedPoemId = (this.data.poemId || '').trim();
    const trimmedPassword = (this.data.password || '').trim();

    this.setData({
      poemId: trimmedPoemId,
      password: trimmedPassword
    });

    if (trimmedPassword && !trimmedPoemId) {
      wx.hideLoading();
      wx.showToast({ title: '请先设置Poem ID', icon: 'none' });
      this.setData({ isSaving: false });
      return;
    }

    if (trimmedPoemId && /\s/.test(trimmedPoemId)) {
      wx.hideLoading();
      wx.showToast({ title: 'Poem ID不能包含空格', icon: 'none' });
      this.setData({ isSaving: false });
      return;
    }

    const avatarUpload = this.data.tempAvatarPath
      ? wx.cloud.uploadFile({
          cloudPath: `user_avatars/${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          filePath: this.data.tempAvatarPath
        }).then(res => res.fileID)
      : Promise.resolve(null);

    const signatureUpload = this.data.signatureTempPath
      ? wx.cloud.uploadFile({
          cloudPath: `user_signatures/${Date.now()}_${Math.floor(Math.random() * 1000)}.png`,
          filePath: this.data.signatureTempPath
        }).then(res => res.fileID)
      : Promise.resolve(null);

    Promise.all([avatarUpload, signatureUpload])
      .then(([avatarFileID, signatureFileID]) => {
        const payload = {
          avatarUrl: avatarFileID,
          nickName: this.data.nickName,
          birthday: this.data.birthday,
          bio: this.data.bio,
          signatureUrl: signatureFileID
        };

        if (trimmedPoemId) {
          payload.poemId = trimmedPoemId;
        }

        if (trimmedPassword) {
          payload.password = trimmedPassword;
        }

        return wx.cloud.callFunction({
          name: 'updateUserProfile',
          data: payload
        });
      })
      .then(res => {
        if (res.result.success) {
          wx.hideLoading();
          wx.showToast({ title: '保存成功' });

          if (trimmedPoemId) {
            this.originalPoemId = trimmedPoemId;
          }

          const pages = getCurrentPages();
          if (pages.length > 1) {
            const prePage = pages[pages.length - 2];
            if (prePage && typeof prePage.fetchUserProfile === 'function') {
              prePage.fetchUserProfile();
            }
          }

          setTimeout(() => wx.navigateBack(), 1000);
        } else {
          throw new Error(res.result.message || '云函数保存失败');
        }
      })
      .catch(err => {
        console.error('保存资料失败:', err);
        wx.hideLoading();
        wx.showToast({ title: err.message || '操作失败', icon: 'none' });
      })
      .finally(() => {
        this.setData({ isSaving: false });
      });
  }
});
