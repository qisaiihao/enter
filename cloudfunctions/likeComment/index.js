// 云函数 likeComment 的入口文件 (带调试日志版)
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  // [调试日志 1] 函数开始执行
  console.log('--- likeComment function started ---');
  console.log('Input event:', event);

  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;
  const { commentId, postId, isLiked } = event;

  if (!commentId || !postId) {
    console.error('Error: commentId or postId is missing.');
    return { success: false, message: '缺少评论ID或帖子ID' };
  }

  try {
    const votesLogCollection = db.collection('votes_log');

    if (isLiked) {
      // [调试日志 2] 用户要点赞
      console.log(`Action: ADD LIKE. User [${openId}] is liking comment [${commentId}]`);
      await votesLogCollection.add({
        data: {
          commentId: commentId,
          postId: postId,
          type: 'comment',
          createTime: new Date()
        }
      });
      console.log('Step 1/2 Success: Added record to votes_log.');
      
      await db.collection('comments').doc(commentId).update({
        data: {
          likes: _.inc(1)
        }
      });
      console.log('Step 2/2 Success: Incremented likes count in comments collection.');

    } else {
      // [调试日志 3] 用户要取消点赞
      console.log(`Action: REMOVE LIKE. User [${openId}] is unliking comment [${commentId}]`);
      const removeResult = await votesLogCollection.where({
        _openid: openId,
        commentId: commentId,
        type: 'comment'
      }).remove();
      console.log(`Step 1/2 Success: Removed ${removeResult.stats.removed} record(s) from votes_log.`);

      await db.collection('comments').doc(commentId).update({
        data: {
          likes: _.inc(-1)
        }
      });
      console.log('Step 2/2 Success: Decremented likes count in comments collection.');
    }
    
    // [调试日志 4] 函数成功结束
    console.log('--- likeComment function finished successfully ---');
    return { success: true };

  } catch (e) {
    // [调试日志 5] 函数捕获到错误
    console.error('--- likeComment function CRASHED ---');
    console.error('Error details:', e);
    return { success: false, message: '操作失败', error: e.toString() };
  }
};