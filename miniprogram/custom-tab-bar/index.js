Component({
  data: {
    selected: 0,
    color: "#999999",
    selectedColor: "#07c160",
    // 双击检测相关数据
    lastTapTime: 0,
    lastTapIndex: -1,
    doubleTapThreshold: 300, // 双击间隔阈值（毫秒）
    list: [
      {
        pagePath: "pages/index/index",
        text: "广场",
        iconPath: "/images/market.png",
        selectedIconPath: "/images/marketplus.png"
      },
      {
        pagePath: "pages/poem/poem", 
        text: "路",
        iconPath: "/images/road.png",
        selectedIconPath: "/images/roadplus.png"
      },
      {
        pagePath: "pages/mountain/mountain",
        text: "山", 
        iconPath: "/images/mountain.png",
        selectedIconPath: "/images/mountainplus.png"
      },
      {
        pagePath: "pages/profile/profile",
        text: "湖",
        iconPath: "/images/pools.png", 
        selectedIconPath: "/images/poolsplus.png"
      }
    ]
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset;
      const url = data.path;
      const index = data.index;
      const currentTime = Date.now();
      
      console.log('=== tabBar点击事件 ===');
      console.log('点击的tab索引:', index);
      console.log('目标页面路径:', url);
      console.log('当前tabBar selected状态:', this.data.selected);
      
      // 检查是否为双击
      const isDoubleTap = (
        currentTime - this.data.lastTapTime < this.data.doubleTapThreshold &&
        this.data.lastTapIndex === index &&
        this.data.selected === index // 只有点击当前选中的tab才算双击
      );
      
      console.log('双击检测:', {
        isDoubleTap,
        currentTime,
        lastTapTime: this.data.lastTapTime,
        timeDiff: currentTime - this.data.lastTapTime,
        lastTapIndex: this.data.lastTapIndex,
        currentIndex: index,
        isCurrentTab: this.data.selected === index
      });
      
      // 更新点击记录
      this.setData({
        lastTapTime: currentTime,
        lastTapIndex: index
      });
      
      if (isDoubleTap) {
        // 双击当前tab，触发刷新
        console.log('检测到双击，触发页面刷新');
        this.refreshCurrentPage();
        return;
      }
      
      // 单次点击，正常切换页面
      const targetUrl = url.startsWith('/') ? url : `/${url}`;
      wx.switchTab({ 
        url: targetUrl,
        success: () => {
          console.log('tabBar切换成功:', targetUrl);
        },
        fail: (err) => {
          console.error('tabBar切换失败:', err);
        }
      });
    },
    
    // 刷新当前页面
    refreshCurrentPage() {
      const currentPage = this.data.list[this.data.selected];
      console.log('刷新页面:', currentPage.pagePath);
      
      // 获取当前页面实例
      const pages = getCurrentPages();
      const currentPageInstance = pages[pages.length - 1];
      
      if (!currentPageInstance) {
        console.error('无法获取当前页面实例');
        return;
      }
      
      // 根据页面路径执行相应的刷新逻辑
      switch (currentPage.pagePath) {
        case 'pages/index/index':
          this.refreshIndexPage(currentPageInstance);
          break;
        case 'pages/poem/poem':
          this.refreshPoemPage(currentPageInstance);
          break;
        case 'pages/mountain/mountain':
          this.refreshMountainPage(currentPageInstance);
          break;
        case 'pages/profile/profile':
          this.refreshProfilePage(currentPageInstance);
          break;
        default:
          console.log('未知页面，执行通用刷新');
          this.refreshGenericPage(currentPageInstance);
      }
    },
    
    // 刷新广场页面
    refreshIndexPage(pageInstance) {
      console.log('刷新广场页面');
      if (pageInstance.refreshData) {
        pageInstance.refreshData();
      } else if (pageInstance.onPullDownRefresh) {
        pageInstance.onPullDownRefresh();
      } else {
        // 通用刷新方法
        wx.startPullDownRefresh();
      }
    },
    
    // 刷新路页面
    refreshPoemPage(pageInstance) {
      console.log('刷新路页面');
      if (pageInstance.refreshPoemData) {
        pageInstance.refreshPoemData();
      } else if (pageInstance.onPullDownRefresh) {
        pageInstance.onPullDownRefresh();
      } else {
        wx.startPullDownRefresh();
      }
    },
    
    // 刷新山页面
    refreshMountainPage(pageInstance) {
      console.log('刷新山页面');
      if (pageInstance.refreshMountainData) {
        pageInstance.refreshMountainData();
      } else if (pageInstance.onPullDownRefresh) {
        pageInstance.onPullDownRefresh();
      } else {
        wx.startPullDownRefresh();
      }
    },
    
    // 刷新湖页面
    refreshProfilePage(pageInstance) {
      console.log('刷新湖页面');
      if (pageInstance.onPullDownRefresh) {
        pageInstance.onPullDownRefresh();
      } else {
        wx.startPullDownRefresh();
      }
    },
    
    // 通用刷新方法
    refreshGenericPage(pageInstance) {
      console.log('执行通用刷新');
      if (pageInstance.onPullDownRefresh) {
        pageInstance.onPullDownRefresh();
      } else {
        wx.startPullDownRefresh();
      }
    }
  }
});
