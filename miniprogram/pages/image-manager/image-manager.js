// 图片管理页面逻辑
const { imageManager } = require('../../utils/imageManager.js')

Page({
  data: {
    splashPreview: '',
    uploading: false,
    imageHistory: [],
    isAdmin: false, // 是否为管理员
    currentUserOpenid: '' // 当前用户openid
  },

  onLoad: function () {
    this.checkAdminPermission()
  },

  // 检查管理员权限
  async checkAdminPermission() {
    try {
      // 获取当前用户openid
      const openIdResult = await wx.cloud.callFunction({
        name: 'getOpenId'
      })
      
      if (openIdResult.result && openIdResult.result.openid) {
        const currentOpenid = openIdResult.result.openid
        const isAdmin = currentOpenid === 'ojYBd1_A3uCbQ1LGcHxWxOAeA5SE' // 你的openid
        
        console.log('图片管理页面 - 当前用户:', currentOpenid)
        console.log('图片管理页面 - 是否为管理员:', isAdmin)
        
        this.setData({
          currentUserOpenid: currentOpenid,
          isAdmin: isAdmin
        })
        
        // 如果不是管理员，显示提示并返回
        if (!isAdmin) {
          wx.showModal({
            title: '权限不足',
            content: '您没有权限访问图片管理功能',
            showCancel: false,
            success: () => {
              wx.navigateBack()
            }
          })
          return
        }
        
        // 是管理员，加载图片历史
        this.loadImageHistory()
      } else {
        throw new Error('无法获取用户信息')
      }
    } catch (error) {
      console.error('权限检查失败:', error)
      wx.showModal({
        title: '错误',
        content: '权限检查失败，无法访问此页面',
        showCancel: false,
        success: () => {
          wx.navigateBack()
        }
      })
    }
  },

  // 加载图片历史记录
  async loadImageHistory() {
    try {
      const result = await imageManager.getImageList({
        limit: 10
      })

      if (result.success) {
        this.setData({
          imageHistory: result.images
        })
      }
    } catch (error) {
      console.error('加载图片历史失败:', error)
    }
  },

  // 选择开屏图
  chooseSplashImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'], // 使用压缩图
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        this.setData({
          splashPreview: tempFilePath
        })
      },
      fail: (error) => {
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        })
      }
    })
  },

  // 上传开屏图
  async uploadSplashImage() {
    if (!this.data.splashPreview) {
      wx.showToast({
        title: '请先选择图片',
        icon: 'none'
      })
      return
    }

    this.setData({ uploading: true })

    try {
      const result = await imageManager.uploadSplashImage(this.data.splashPreview)

      if (result.success) {
        wx.showToast({
          title: '上传成功',
          icon: 'success',
          duration: 2000
        })

        // 复制URL到剪贴板
        wx.setClipboardData({
          data: result.url,
          success: () => {
            wx.showToast({
              title: 'URL已复制',
              icon: 'none'
            })
          }
        })

        // 清空预览
        this.setData({
          splashPreview: ''
        })

        // 刷新历史记录
        this.loadImageHistory()

      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('上传失败:', error)
      wx.showToast({
        title: '上传失败: ' + error.message,
        icon: 'none',
        duration: 3000
      })
    } finally {
      this.setData({ uploading: false })
    }
  },

  // 清除开屏图预览
  clearSplashPreview() {
    this.setData({
      splashPreview: ''
    })
  },

  // 复制URL
  copyUrl(e) {
    const url = e.currentTarget.dataset.url
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({
          title: 'URL已复制',
          icon: 'none'
        })
      }
    })
  },

  // 格式化时间
  formatTime(dateStr) {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now - date
    
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    
    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 7) return `${days}天前`
    
    return date.toLocaleDateString()
  }
})