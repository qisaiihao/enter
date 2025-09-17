// 数据库初始化脚本
// 在微信开发者工具的云开发控制台中运行

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 创建 images 集合并设置索引
async function initDatabase() {
  try {
    // 创建集合（如果不存在）
    await db.createCollection('images')
    
    // 创建索引
    await db.collection('images').createIndex({
      category: 1,
      status: 1
    })
    
    await db.collection('images').createIndex({
      uploadTime: -1
    })
    
    await db.collection('images').createIndex({
      fileID: 1
    })
    
    console.log('数据库初始化完成')
    return { success: true, message: '数据库初始化完成' }
  } catch (error) {
    console.error('数据库初始化失败:', error)
    return { success: false, error: error.message }
  }
}

module.exports = {
  initDatabase
}