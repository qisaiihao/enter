Component({
  data: {
    selected: 0,
    color: "#999999",
    selectedColor: "#07c160",
    list: [
      {
        pagePath: "pages/index/index",
        text: "广场",
        iconPath: "/images/market.PNG"
      },
      {
        pagePath: "pages/poem/poem", 
        text: "路",
        iconPath: "/images/road.PNG"
      },
      {
        pagePath: "pages/mountain/mountain",
        text: "山", 
        iconPath: "/images/mountain.PNG"
      },
      {
        pagePath: "pages/profile/profile",
        text: "湖",
        iconPath: "/images/pools.PNG" 
      }
    ]
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset;
      const url = data.path;
      const index = data.index;
      
      // 先更新选中态，提供立即的按下反馈
      if (this.data.selected !== index) {
        this.setData({ selected: index });
      }
      
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
