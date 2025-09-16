const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  
  const { skip = 0, limit = 10, type = null } = event;
  
  try {
    // 构建查询条件
    let whereCondition = {
      toUserId: openid
    };
    
    // 如果指定了消息类型，添加类型过滤
    if (type && ['like', 'comment', 'favorite'].includes(type)) {
      whereCondition.type = type;
    }
    
    // 查询消息列表
    const messagesResult = await db.collection('messages')
      .where(whereCondition)
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(limit)
      .get();
    
    // 查询未读消息数量
    const unreadCountResult = await db.collection('messages')
      .where({
        toUserId: openid,
        isRead: false
      })
      .count();
    
    // 获取发送者信息
    const fromUserIds = messagesResult.data.map(msg => msg.fromUserId);
    let userInfoMap = {};
    
    if (fromUserIds.length > 0) {
      const uniqueUserIds = [...new Set(fromUserIds)];
      const usersResult = await db.collection('users')
        .where({
          _openid: _.in(uniqueUserIds)
        })
        .field({
          _openid: true,
          nickName: true,
          avatarUrl: true
        })
        .get();
      
      userInfoMap = usersResult.data.reduce((map, user) => {
        map[user._openid] = user;
        return map;
      }, {});
    }
    
    // 补充发送者信息
    const messages = messagesResult.data.map(msg => {
      const userInfo = userInfoMap[msg.fromUserId] || {};
      return {
        ...msg,
        fromUserName: userInfo.nickName || '微信用户',
        fromUserAvatar: userInfo.avatarUrl || ''
      };
    });
    
    return {
      success: true,
      messages: messages,
      totalCount: unreadCountResult.total,
      unreadCount: unreadCountResult.total
    };
    
  } catch (error) {
    console.error('获取消息失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
};