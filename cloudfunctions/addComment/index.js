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

    // === 新增：创建评论消息通知 ===
    try {
      // 获取帖子信息
      const postResult = await db.collection('posts').doc(postId).get()
      const post = postResult.data
      
      // 获取评论者信息
      const userResult = await db.collection('users').where({
        _openid: openid
      }).limit(1).get()
      const user = userResult.data[0]
      
      // 确定通知对象
      let notifyUserId = null
      let messageContent = ''
      
      if (parentId) {
        // 如果是回复评论，需要通知被回复的评论作者
        const parentCommentResult = await db.collection('comments').doc(parentId).get()
        const parentComment = parentCommentResult.data
        
        if (parentComment && parentComment._openid !== openid) {
          notifyUserId = parentComment._openid
          messageContent = `${user ? user.nickName : '微信用户'} 回复了你的评论`
        }
      } else {
        // 如果是直接评论帖子，通知帖子作者
        if (post._openid !== openid) {
          notifyUserId = post._openid
          messageContent = `${user ? user.nickName : '微信用户'} 评论了你的帖子`
        }
      }
      
      // 如果需要发送通知
      if (notifyUserId) {
        await db.collection('messages').add({
          data: {
            fromUserId: openid,
            fromUserName: user ? user.nickName : '微信用户',
            fromUserAvatar: user ? user.avatarUrl : '',
            toUserId: notifyUserId,
            type: 'comment',
            postId: postId,
            postTitle: post.title || '无标题',
            content: messageContent,
            commentId: result._id,
            isRead: false,
            createTime: new Date()
          }
        })
        console.log('评论消息已创建，通知用户:', notifyUserId)
      } else {
        console.log('无需发送通知（自己给自己评论/回复）')
      }
    } catch (msgError) {
      console.error('创建评论消息失败:', msgError)
      // 不影响主流程，只是记录错误
    }

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