// 云函数 likeComment 的入口文件 (已更新)
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;
  const { commentId, postId } = event; // [移除] 不再需要 isLiked

  if (!commentId || !postId) {
    return { success: false, message: '缺少评论ID或帖子ID' };
  }

  try {
    const votesLogCollection = db.collection('votes_log');
    
    // [核心修改] 查询用户是否已经点赞过此评论
    const existingLog = await votesLogCollection.where({
      _openid: openId,
      commentId: commentId,
      type: 'comment'
    }).get();

    if (existingLog.data.length > 0) {
      // --- 用户已点赞，执行取消点赞 ---
      const logId = existingLog.data[0]._id;
      await votesLogCollection.doc(logId).remove();
      
      await db.collection('comments').doc(commentId).update({
        data: {
          likes: _.inc(-1)
        }
      });

    } else {
      // --- 用户未点赞，执行点赞 ---
      await votesLogCollection.add({
        data: {
          _openid: openId,
          commentId: commentId,
          postId: postId,
          type: 'comment',
          createTime: new Date()
        }
      });
      
      await db.collection('comments').doc(commentId).update({
        data: {
          likes: _.inc(1)
        }
      });
    }
    
    // [新增] 返回最新的点赞数
    const updatedComment = await db.collection('comments').doc(commentId).get();
    
    return { 
      success: true,
      likes: updatedComment.data.likes
    };

  } catch (e) {
    console.error('likeComment error', e);
    return { success: false, message: '操作失败', error: e.toString() };
  }
};