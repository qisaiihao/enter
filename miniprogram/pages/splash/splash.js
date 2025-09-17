const { imageManager } = require('../../utils/imageManager.js')

Page({
  data: {
    // ---- 新增的状态控制 ----
    currentPhase: 'typing', // 'typing', 'imageDisplay', 'done'
    showEnterButton: false, // 控制进入按钮的显示
    showNewLineCursor: false, // 控制换行后光标的显示
    textMoveUp: false, // 控制文字上移动画
    preloadCompleted: false, // 预加载是否完成

    // ---- 打字机动画所需数据 ----
    fullText: 'poementer',
    typedText: '',

    // ---- 预加载的开屏图数据 ----
    preloadedImagePath: '', // 存储预加载成功的图片本地路径
    
    // ---- 原有数据 ----
    preloadProgress: 0,
    isPreloading: false,
    splashImageUrl: '/images/splash.png' // 默认本地开屏图
  },

  onLoad: function () {
    // 1. 启动打字机动画
    this.executeTypingAnimation();

    // 2. 并行执行图片预加载和原有的数据预加载
    this.loadSplashImage();
  },

  /**
   * 函数：执行打字机动画
   */
  executeTypingAnimation: function () {
    const textToType = this.data.fullText; // 获取要完整显示的文本
    let charIndex = 0; // 定义一个索引，用于追踪当前应该显示哪个字符

    // 递归函数，模拟人打字的节奏
    const typeNextChar = () => {
      if (charIndex < textToType.length) {
        // 1. 更新 typedText：将当前已显示的文本加上下一个要显示的字符
        this.setData({
          typedText: this.data.typedText + textToType[charIndex]
        });
        
        // 2. 索引递增，准备显示下一个字符
        charIndex++;
        
        // 3. 根据字符位置和内容决定下一个字符的延迟时间
        let delay = this.getTypingDelay(charIndex, textToType);
        
        // 4. 递归调用，继续下一个字符
        setTimeout(typeNextChar, delay);
      } else {
        // 所有字符都已显示完毕，延迟后显示"进入"按钮
        setTimeout(() => {
          this.setData({
            showEnterButton: true,
            textMoveUp: true // 触发文字上移动画
          });
        }, 500);
      }
    };

    // 开始打字动画
    typeNextChar();
  },

  /**
   * 获取打字延迟时间，模拟人打字的节奏
   */
  getTypingDelay: function(charIndex, text) {
    const char = text[charIndex - 1]; // 当前字符
    const nextChar = text[charIndex]; // 下一个字符
    
    // 基础延迟时间
    let baseDelay = 150;
    
    // 根据字符类型调整延迟
    if (char === ' ') {
      // 空格后稍微停顿
      baseDelay = 200;
    } else if (char === 'e' && nextChar === 'n') {
      // "poem"后的"enter"开始前，停顿更长时间
      baseDelay = 800;
    } else if (char === 'm' && nextChar === 'e') {
      // "poem"结束后，停顿
      baseDelay = 600;
    } else if (char === 't' && nextChar === 'e') {
      // "enter"中的"te"之间
      baseDelay = 180;
    } else if (char === 'e' && nextChar === 'r') {
      // "enter"中的"er"之间
      baseDelay = 160;
    } else {
      // 其他字符的随机延迟，模拟人打字的自然节奏
      baseDelay = 120 + Math.random() * 100; // 120-220ms的随机延迟
    }
    
    return baseDelay;
  },

  /**
   * 响应：用户点击"进入"按钮
   */
  handleEnterButtonClick: function() {
    // 添加按钮点击反馈
    wx.vibrateShort();
    
    // 检查预加载是否完成
    if (!this.data.preloadCompleted) {
      wx.showToast({
        title: '正在加载中...',
        icon: 'loading',
        duration: 1000
      });
      return;
    }
    
    // 隐藏按钮，显示换行后的光标
    this.setData({
      showEnterButton: false,
      showNewLineCursor: true
    });
    
    // 闪烁两下后跳转
    this.blinkNewLineCursorAndNavigate();
  },

  /**
   * 换行光标闪烁两下后跳转
   */
  blinkNewLineCursorAndNavigate: function() {
    let blinkCount = 0;
    const maxBlinks = 2;
    
    const blinkInterval = setInterval(() => {
      blinkCount++;
      
      if (blinkCount >= maxBlinks) {
        clearInterval(blinkInterval);
        // 闪烁完成后跳转
        setTimeout(() => {
          this.navigateToTarget();
        }, 500); // 延迟0.5秒后跳转
      }
    }, 600); // 每0.6秒闪烁一次
  },

  // 加载云端开屏图
  async loadSplashImage() {
    try {
      console.log('开始加载云端开屏图...')
      const splashUrl = await imageManager.getSplashImageUrl()
      
      if (splashUrl && splashUrl !== '/images/splash.png') {
        console.log('成功获取云端开屏图URL:', splashUrl)
        this.setData({
          splashImageUrl: splashUrl,
          preloadedImagePath: splashUrl
        })
      } else {
        console.log('使用默认本地开屏图')
        this.setData({
          preloadedImagePath: '/images/splash.png'
        })
      }
    } catch (error) {
      console.error('加载云端开屏图失败:', error)
      // 出错时使用默认本地图片
    }
    
    // 无论云端加载是否成功，都开始预加载流程
    this.executeOriginalPreloadTasks()
  },

  /**
   * 函数：执行原有的其它预加载任务
   */
  async executeOriginalPreloadTasks() {
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

    // 预加载完成后，设置标志位，但不自动跳转
    // 跳转将由用户点击"进入"按钮触发
    this.setData({
      preloadCompleted: true
    });
    
    console.log('预加载任务完成，等待用户点击进入按钮');
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