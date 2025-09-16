const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  
  const { messageId } = event;
  
  if (!messageId) {
    return {
      success: false,
      error: 'messageId不能为空'
    };
  }
  
  try {
    // 删除消息（只能删除自己的消息）
    const result = await db.collection('messages')
      .where({
        _id: messageId,
        toUserId: openid
      })
      .remove();
    
    return {
      success: true,
      deleted: result.stats.removed || 0
    };
    
  } catch (error) {
    console.error('删除消息失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
};