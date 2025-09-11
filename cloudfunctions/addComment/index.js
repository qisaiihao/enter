// 云函数 addComment 的入口文件 (最终版)
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command; // 引入数据库操作符

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // [新增] 接收前端传来的 replyToAuthorName
  const { postId, content, parentId, replyToAuthorName } = event;

  // Basic validation
  if (!openid) {
    return { success: false, message: 'User not logged in.' };
  }
  if (!postId || !content) {
    return { success: false, message: 'Post ID and content are required.' };
  }
  if (content.trim().length === 0) {
    return { success: false, message: 'Comment content cannot be empty.' };
  }

  try {
    // 准备要存入数据库的数据
    const commentData = {
      _openid: openid,
      postId: postId,
      content: content,
      likes: 0, // [建议] 初始化点赞数为0
      createTime: new Date()
    };

    // 如果 parentId 存在，说明这是一条回复
    if (parentId) {
      commentData.parentId = parentId;
      // [新增] 如果是回复，就把被回复人的名字也存进去
      if (replyToAuthorName) {
        commentData.replyToAuthorName = replyToAuthorName;
      }
    }

    // 将新评论/回复添加到数据库
    const result = await db.collection('comments').add({
      data: commentData
    });

    // [新增] 评论或回复成功后，帖子的评论数 +1
    await db.collection('posts').doc(postId).update({
      data: {
        commentCount: _.inc(1)
      }
    });

    return {
      success: true,
      message: 'Comment added successfully.',
      commentId: result._id
    };

  } catch (e) {
    console.error('addComment error', e);
    return {
      success: false,
      message: 'Failed to add comment.',
      error: e.toString()
    };
  }
};