const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  
  const { messageIds } = event;
  
  if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
    return {
      success: false,
      error: '消息ID列表不能为空'
    };
  }
  
  try {
    // 批量更新消息为已读
    const result = await db.collection('messages')
      .where({
        _id: db.command.in(messageIds),
        toUserId: openid,
        isRead: false
      })
      .update({
        data: {
          isRead: true,
          readTime: new Date()
        }
      });
    
    return {
      success: true,
      updated: result.stats.updated || 0
    };
    
  } catch (error) {
    console.error('标记消息已读失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
};