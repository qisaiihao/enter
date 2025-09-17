const { imageManager } = require('../../utils/imageManager.js')

Page({
  data: {
    preloadProgress: 0,
    isPreloading: false,
    splashImageUrl: '/images/splash.png' // 默认本地开屏图
  },

  onLoad: function () {
    // 加载云端开屏图
    this.loadSplashImage()
  },

  // 加载云端开屏图
  async loadSplashImage() {
    try {
      console.log('开始加载云端开屏图...')
      const splashUrl = await imageManager.getSplashImageUrl()
      
      if (splashUrl && splashUrl !== '/images/splash.png') {
        console.log('成功获取云端开屏图URL:', splashUrl)
        this.setData({
          splashImageUrl: splashUrl
        })
      } else {
        console.log('使用默认本地开屏图')
      }
    } catch (error) {
      console.error('加载云端开屏图失败:', error)
      // 出错时使用默认本地图片
    }
    
    // 无论云端加载是否成功，都开始预加载流程
    this.startPreloadAndNavigate()
  },

  async startPreloadAndNavigate() {
    const app = getApp();
    
    // 创建一个数组来存放所有的预加载任务 (Promise)
    const preloadTasks = [];

    if (app.globalData.userInfo && app.globalData.openid) {
      // 任务1：预加载 Tab 图标
      preloadTasks.push(this.preloadTabIcons());
      // 任务2：预加载诗歌数据和相关图片
      preloadTasks.push(this.preloadPoemData());
      // 任务3：预加载山页面数据和相关图片
      preloadTasks.push(this.preloadMountainData());
    }

    // 等待所有预加载任务完成
    await Promise.all(preloadTasks);

    // 所有任务完成后，立即跳转
    this.navigateToTarget();
  },

  // 使用 async/await 语法来更清晰地处理异步流程
  preloadPoemData: function() {
    // Promise 的执行函数本身也可以是 async 函数
    return new Promise(async (resolve, reject) => {
      this.setData({ isPreloading: true });
      
      wx.cloud.callFunction({
        name: 'getPostList',
        data: { skip: 0, limit: 5, isPoem: true, isOriginal: true },
        success: async (res) => { // <-- success 回调也变成 async
          try {
            if (res.result && res.result.success && res.result.posts) {
              const app = getApp();
              app.globalData.preloadedPoemData = res.result.posts;
              
              if (res.result.posts.length > 0) {
                console.log('诗歌数据获取成功，开始预加载相关图片...');
                // 关键改动：等待图片下载任务完成！
                await this.preloadFirstPostImages(res.result.posts[0]); 
                console.log('相关图片预加载完成！');
              }
            }
            resolve(); // <-- 成功路径的 resolve 移动到这里
          } catch (e) {
            reject(e); // 捕获内部错误
          }
        },
        fail: (err) => {
          reject(err); // 网络或云函数错误
        },
        complete: () => {
          // complete 里的 resolve 需要移除，因为它执行得太早了
          console.log('诗歌数据预加载流程结束');
          this.setData({ preloadProgress: 100, isPreloading: false });
        }
      });
    });
  },

  // 预加载山页面数据
  preloadMountainData: function() {
    return new Promise(async (resolve, reject) => {
      wx.cloud.callFunction({
        name: 'getPostList',
        data: { skip: 0, limit: 5, isPoem: true, isOriginal: false }, // 非原创诗歌
        success: async (res) => {
          try {
            if (res.result && res.result.success && res.result.posts) {
              const app = getApp();
              app.globalData.preloadedMountainData = res.result.posts;
              
              if (res.result.posts.length > 0) {
                console.log('山页面数据获取成功，开始预加载相关图片...');
                // 预加载第一张图片
                await this.preloadFirstMountainImages(res.result.posts[0]); 
                console.log('山页面相关图片预加载完成！');
              }
            }
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        fail: (err) => {
          reject(err);
        },
        complete: () => {
          console.log('山页面数据预加载流程结束');
        }
      });
    });
  },

  // 预加载山页面第一张图片
  preloadFirstMountainImages: function(post) {
    const app = getApp();
    if (!app.globalData.preloadedImages) {
      app.globalData.preloadedImages = {};
    }
    
    const imageDownloadTasks = [];

    // 预加载背景图片
    const bgImageUrl = post.poemBgImage || (post.imageUrls && post.imageUrls[0]);
    if (bgImageUrl) {
      imageDownloadTasks.push(new Promise(resolve => {
        wx.downloadFile({
          url: bgImageUrl,
          success: (res) => {
            if (res.statusCode === 200) {
              console.log('山页面首张背景图预加载成功:', res.tempFilePath);
              app.globalData.preloadedImages[bgImageUrl] = res.tempFilePath;
            }
          },
          fail: (err) => {
            console.error('山页面背景图预加载失败:', bgImageUrl, err);
          },
          complete: () => {
            resolve();
          }
        });
      }));
    }
    
    // 预加载用户头像
    if (post.authorAvatar) {
      imageDownloadTasks.push(new Promise(resolve => {
        wx.downloadFile({
          url: post.authorAvatar,
          success: (res) => {
            if (res.statusCode === 200) {
              console.log('山页面作者头像预加载成功');
              app.globalData.preloadedImages[post.authorAvatar] = res.tempFilePath;
            }
          },
          fail: (err) => {
            console.error('山页面作者头像预加载失败:', post.authorAvatar, err);
          },
          complete: () => {
            resolve();
          }
        });
      }));
    }
    
    return Promise.all(imageDownloadTasks);
  },

  preloadTabIcons: function() {
    return new Promise(resolve => {
      const tabIcons = [
        '/images/icons/home.png',
        '/images/icons/home-active.png',
        '/images/icons/examples.png',
        '/images/icons/examples-active.png',
        '/images/icons/usercenter.png',
        '/images/icons/usercenter-active.png'
      ];
      
      let loadedCount = 0;
      const totalCount = tabIcons.length;

      if (totalCount === 0) {
        resolve(); // 如果没有图标，直接完成
        return;
      }

      tabIcons.forEach(iconPath => {
        wx.getImageInfo({
          src: iconPath,
          complete: () => { // 使用 complete 确保无论成功失败都会计数
            loadedCount++;
            if (loadedCount === totalCount) {
              console.log('所有Tab图标预加载尝试完毕');
              resolve(); // 所有图标都处理完后，完成 Promise
            }
          }
        });
      });
    });
  },

  // 这个函数现在需要返回一个 Promise，它包裹了所有图片下载任务
  preloadFirstPostImages: function(post) {
    const app = getApp();
    if (!app.globalData.preloadedImages) {
      app.globalData.preloadedImages = {};
    }
    
    // 创建一个数组来收集所有图片下载的 Promise
    const imageDownloadTasks = [];

    // 预加载背景图片
    const bgImageUrl = post.poemBgImage || (post.imageUrls && post.imageUrls[0]);
    if (bgImageUrl) {
      // 为每个下载任务创建一个 Promise
      imageDownloadTasks.push(new Promise(resolve => {
        wx.downloadFile({
          url: bgImageUrl,
          success: (res) => {
            if (res.statusCode === 200) {
              console.log('首张背景图预加载成功:', res.tempFilePath);
              app.globalData.preloadedImages[bgImageUrl] = res.tempFilePath;
            }
          },
          complete: () => {
            resolve(); // 无论成功失败，都算完成，不阻塞主流程
          }
        });
      }));
    }
    
    // 预加载用户头像
    if (post.authorAvatar) {
      imageDownloadTasks.push(new Promise(resolve => {
        wx.downloadFile({
          url: post.authorAvatar,
          success: (res) => {
            if (res.statusCode === 200) {
              console.log('作者头像预加载成功');
              app.globalData.preloadedImages[post.authorAvatar] = res.tempFilePath;
            }
          },
          complete: () => {
            resolve();
          }
        });
      }));
    }
    
    // 预加载其他可能用到的图片（移除svg）
    const commonImages = [
      '/images/like.png',
      '/images/liked.png'
    ];
    
    commonImages.forEach(imagePath => {
      imageDownloadTasks.push(new Promise(resolve => {
        wx.getImageInfo({
          src: imagePath,
          complete: () => {
            console.log('通用图片预加载尝试完毕:', imagePath);
            resolve(); // 无论成功失败，都算完成
          }
        });
      }));
    });
    
    // 返回一个 Promise.all，它会等待所有图片下载任务都完成
    return Promise.all(imageDownloadTasks);
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