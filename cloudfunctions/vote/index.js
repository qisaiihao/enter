const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    const { postId } = event
    const { OPENID } = cloud.getWXContext()

    // 1. 查找 votes_log 表，精确查找 type 为 'post' 的记录
    const log = await db.collection('votes_log').where({
      _openid: OPENID,
      postId: postId,
      type: 'post' // [修改点] 查询时精确匹配帖子类型
    }).get()

    let updatedPost;
    let isLiked = false;

    if (log.data.length > 0) {
      // 2. 如果找到了记录，说明是"取消点赞"
      await db.collection('votes_log').doc(log.data[0]._id).remove()
      await db.collection('posts').doc(postId).update({
        data: {
          votes: _.inc(-1)
        }
      })
      isLiked = false
    } else {
      // 3. 如果没找到记录，说明是"点赞"
      await db.collection('votes_log').add({
        data: {
          _openid: OPENID,
          postId: postId,
          type: 'post', // [修改点] 存入时明确指定类型为 post
          createTime: new Date()
        }
      })
      await db.collection('posts').doc(postId).update({
        data: {
          votes: _.inc(1)
        }
      })
      isLiked = true

      // === 新增：创建点赞消息通知 ===
      try {
        // 获取帖子信息
        const postResult = await db.collection('posts').doc(postId).get()
        const post = postResult.data
        
        // 获取点赞者信息
        const userResult = await db.collection('users').where({
          _openid: OPENID
        }).limit(1).get()
        const user = userResult.data[0]
        
        // 如果给自己点赞，不发送通知
        if (post._openid === OPENID) {
          console.log('用户给自己点赞，不发送通知')
        } else {
          // 创建消息记录
          await db.collection('messages').add({
            data: {
              fromUserId: OPENID,
              fromUserName: user ? user.nickName : '微信用户',
              fromUserAvatar: user ? user.avatarUrl : '',
              toUserId: post._openid,
              type: 'like',
              postId: postId,
              postTitle: post.title || '无标题',
              content: `${user ? user.nickName : '微信用户'} 点赞了你的帖子`,
              isRead: false,
              createTime: new Date()
            }
          })
          console.log('点赞消息已创建')
        }
      } catch (msgError) {
        console.error('创建点赞消息失败:', msgError)
        // 不影响主流程，只是记录错误
      }
    }

    // 4. 无论点赞还是取消，都重新获取文章的最新数据
    updatedPost = await db.collection('posts').doc(postId).get();

    return {
      success: true,
      votes: updatedPost.data.votes, // 返回最新的点赞数
      isLiked: isLiked
    }

  } catch (e) {
    console.error('votePost error', e)
    return {
      success: false,
      error: e
    }
  }
}