Page({
  data: {
    preloadProgress: 0,
    isPreloading: false
  },

  onLoad: function () {
    // 开始预加载
    this.startPreload();
    
    setTimeout(() => {
      this.navigateToTarget();
    }, 2000); // 2 seconds
  },

  startPreload: function() {
    const app = getApp();
    if (app.globalData.userInfo && app.globalData.openid) {
      // 用户已登录，预加载poem页面数据
      this.preloadTabIcons();
      this.preloadPoemData();
    }
  },

  preloadPoemData: function() {
    this.setData({ isPreloading: true });
    
    // 预加载poem页面的数据
    wx.cloud.callFunction({
      name: 'getPostList',
      data: { skip: 0, limit: 5, isPoem: true, isOriginal: true },
      success: res => {
        if (res.result && res.result.success) {
          // 将数据存储到全局，供poem页面使用
          const app = getApp();
          app.globalData.preloadedPoemData = res.result.data;
          
          // 预加载第一张背景图片和相关信息
          if (res.result.data.length > 0) {
            this.preloadFirstPost(res.result.data[0]);
          }
        }
        this.setData({ preloadProgress: 100, isPreloading: false });
      },
      fail: err => {
        console.error('预加载poem数据失败:', err);
        this.setData({ isPreloading: false });
      }
    });
  },

  preloadTabIcons: function() {
    // 预加载tab栏图标
    const tabIcons = [
      'images/icons/home.png',
      'images/icons/home-active.png',
      'images/icons/examples.png',
      'images/icons/examples-active.png',
      'images/icons/usercenter.png',
      'images/icons/usercenter-active.png'
    ];
    
    tabIcons.forEach(iconPath => {
      wx.getImageInfo({
        src: iconPath,
        success: () => {
          console.log('Tab图标预加载成功:', iconPath);
        },
        fail: (err) => {
          console.error('Tab图标预加载失败:', iconPath, err);
        }
      });
    });
  },

  preloadFirstPost: function(post) {
    // 预加载背景图片
    if (post.backgroundImage) {
      wx.getImageInfo({
        src: post.backgroundImage,
        success: () => {
          console.log('首张背景图预加载成功');
        },
        fail: (err) => {
          console.error('首张背景图预加载失败:', err);
        }
      });
    }
    
    // 预加载用户头像
    if (post.authorAvatar) {
      wx.getImageInfo({
        src: post.authorAvatar,
        success: () => {
          console.log('作者头像预加载成功');
        },
        fail: (err) => {
          console.error('作者头像预加载失败:', err);
        }
      });
    }
    
    // 预加载其他可能用到的图片
    const commonImages = [
      'images/like.png',
      'images/liked.png',
      'images/menu-icon.svg'
    ];
    
    commonImages.forEach(imagePath => {
      wx.getImageInfo({
        src: imagePath,
        success: () => {
          console.log('通用图片预加载成功:', imagePath);
        },
        fail: (err) => {
          console.error('通用图片预加载失败:', imagePath, err);
        }
      });
    });
  },

  navigateToTarget: function() {
    // 开始淡出动画
    this.startFadeOut();
    
    // 延迟跳转，让动画完成
    setTimeout(() => {
      // 检查用户是否已登录
      const app = getApp();
      if (app.globalData.userInfo && app.globalData.openid) {
        // 用户已登录，跳转到主页面
        wx.switchTab({
          url: '/pages/poem/poem'
        });
      } else {
        // 用户未登录，跳转到登录页面
        wx.redirectTo({
          url: '/pages/login/login'
        });
      }
    }, 800); // 等待动画完成
  },

  startFadeOut: function() {
    // 添加淡出和缩放动画类
    this.setData({
      fadeOut: true,
      zoomOut: true
    });
  }
});