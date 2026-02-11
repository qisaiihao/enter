Component({
  data: {
    selected: 0,
    color: "#999999",
    selectedColor: "#9ed7ee",
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
      
      console.log('=== tabBar点击事件 ===');
      console.log('点击的tab索引:', index);
      console.log('目标页面路径:', url);
      console.log('当前tabBar selected状态:', this.data.selected);
      
      // 跳转到对应页面，状态更新完全交给页面的onShow处理
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
    }
  }
});
