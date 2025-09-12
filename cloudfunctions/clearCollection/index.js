const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const MAX_LIMIT = 1000 // 云函数删除操作的上限

// 云函数入口函数
exports.main = async (event, context) => {
  const { collectionName } = event // 从参数中获取要清空的集合名

  if (!collectionName) {
    return {
      success: false,
      error: "必须提供要清空的集合名称 'collectionName'"
    }
  }

  try {
    let totalRemoved = 0;
    while (true) {
      // 每次循环最多删除1000条
      const result = await db.collection(collectionName).where({
        // 使用 _.exists(true) 匹配所有记录，比 neq 更通用
        _id: db.command.exists(true)
      }).remove();
      
      const removed = result.stats.removed;
      totalRemoved += removed;

      // 如果本次删除的记录数小于1000，说明已经没有更多记录了，退出循环
      if (removed < MAX_LIMIT) {
        break;
      }
    }
    
    console.log(`成功清空集合 [${collectionName}]，共删除了 ${totalRemoved} 条记录。`);
    return {
      success: true,
      removed: totalRemoved
    }

  } catch (e) {
    console.error(`清空集合 [${collectionName}] 失败`, e);
    return {
      success: false,
      error: e
    }
  }
}