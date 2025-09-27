const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { commentId } = event;
  const { OPENID } = cloud.getWXContext();

  if (!commentId) {
    return { success: false, message: '缺少评论ID' };
  }

  try {
    const commentRes = await db.collection('comments').doc(commentId).get();
    const comment = commentRes.data;

    if (!comment) {
      return { success: false, message: '评论不存在' };
    }

    if (comment._openid !== OPENID) {
      return { success: false, message: '无权删除该评论' };
    }

    let deleteIds = [commentId];

    if (!comment.parentId) {
      const repliesRes = await db.collection('comments')
        .where({ parentId: commentId })
        .limit(1000)
        .get();
      const replyIds = repliesRes.data.map(reply => reply._id);
      if (replyIds.length > 0) {
        deleteIds = deleteIds.concat(replyIds);
      }
    }

    if (deleteIds.length > 0) {
      const batchRemove = async (collectionName, buildFilter) => {
        const tasks = [];
        for (let i = 0; i < deleteIds.length; i += 10) {
          const ids = deleteIds.slice(i, i + 10);
          tasks.push(
            db.collection(collectionName).where(buildFilter(ids)).remove()
          );
        }
        await Promise.all(tasks);
      };

      await batchRemove('votes_log', ids => ({
        commentId: _.in(ids),
        type: 'comment'
      }));

      await batchRemove('messages', ids => ({
        commentId: _.in(ids),
        type: 'comment'
      }));

      await batchRemove('comments', ids => ({
        _id: _.in(ids)
      }));
    }

    if (comment.postId) {
      const decrement = deleteIds.length;
      await db.collection('posts').doc(comment.postId).update({
        data: {
          commentCount: _.inc(-decrement)
        }
      });

      const postRes = await db.collection('posts').doc(comment.postId).get();
      if (postRes.data && postRes.data.commentCount < 0) {
        await db.collection('posts').doc(comment.postId).update({
          data: {
            commentCount: 0
          }
        });
      }
    }

    return {
      success: true,
      deletedCount: deleteIds.length
    };
  } catch (error) {
    console.error('deleteComment error:', error);
    return {
      success: false,
      message: '删除失败',
      error: error.toString()
    };
  }
};
