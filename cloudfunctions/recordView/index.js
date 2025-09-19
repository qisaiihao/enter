// 记录用户浏览行为的云函数
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { postId, viewDuration = 0 } = event;
  const openId = wxContext.OPENID;

  if (!openId) {
    return { success: false, message: '用户未登录' };
  }

  if (!postId) {
    return { success: false, message: '缺少帖子ID' };
  }

  try {
    // 检查是否已经记录过这次浏览
    const existingView = await db.collection('view_log')
      .where({
        _openid: openId,
        postId: postId,
        // 只检查最近1小时内的记录，避免重复记录
        createTime: _.gte(new Date(Date.now() - 60 * 60 * 1000))
      })
      .get();

    if (existingView.data.length > 0) {
      // 如果已存在，更新浏览时长
      const viewId = existingView.data[0]._id;
      await db.collection('view_log').doc(viewId).update({
        data: {
          viewDuration: _.max([existingView.data[0].viewDuration || 0, viewDuration]),
          lastViewTime: new Date()
        }
      });
      
      return { success: true, message: '浏览时长已更新' };
    }

    // 记录新的浏览行为
    await db.collection('view_log').add({
      data: {
        _openid: openId,
        postId: postId,
        viewDuration: viewDuration,
        createTime: new Date(),
        lastViewTime: new Date(),
        type: 'view' // 标记为浏览类型
      }
    });

    return { success: true, message: '浏览记录已保存' };

  } catch (error) {
    console.error('记录浏览行为失败:', error);
    return {
      success: false,
      message: '记录失败',
      error: error.message
    };
  }
};
