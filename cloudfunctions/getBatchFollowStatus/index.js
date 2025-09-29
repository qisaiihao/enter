// 批量获取关注状态云函数
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { currentUserId, targetUserIds } = event;

  if (!OPENID) {
    return {
      success: false,
      message: '用户未登录'
    };
  }

  if (!currentUserId || !targetUserIds || !Array.isArray(targetUserIds) || targetUserIds.length === 0) {
    return {
      success: false,
      message: '参数错误'
    };
  }

  try {
    const followsCollection = db.collection('follows');
    
    // 批量查询关注关系
    const [followingRes, followerRes] = await Promise.all([
      // 查询当前用户关注的目标用户
      followsCollection.where({
        followerId: currentUserId,
        followedId: _.in(targetUserIds)
      }).get(),
      // 查询目标用户关注当前用户
      followsCollection.where({
        followerId: _.in(targetUserIds),
        followedId: currentUserId
      }).get()
    ]);

    const followingSet = new Set(followingRes.data.map(item => item.followedId));
    const followerSet = new Set(followerRes.data.map(item => item.followerId));

    // 构建结果
    const followStatuses = targetUserIds.map(targetUserId => ({
      targetUserId: targetUserId,
      isFollowing: followingSet.has(targetUserId),
      isFollowedByAuthor: followerSet.has(targetUserId),
      isMutualFollow: followingSet.has(targetUserId) && followerSet.has(targetUserId)
    }));

    return {
      success: true,
      followStatuses: followStatuses
    };
  } catch (error) {
    console.error('批量获取关注状态失败:', error);
    return {
      success: false,
      message: '获取关注状态失败',
      error: error.message
    };
  }
};
