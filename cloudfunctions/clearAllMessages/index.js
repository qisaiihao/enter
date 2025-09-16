const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  
  try {
    // 删除用户的所有消息
    const result = await db.collection('messages')
      .where({
        toUserId: openid
      })
      .remove();
    
    return {
      success: true,
      deleted: result.stats.removed || 0
    };
    
  } catch (error) {
    console.error('清空消息失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
};