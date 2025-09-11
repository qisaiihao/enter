// 云函数 votePost 的入口文件
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

    if (log.data.length > 0) {
      // 2. 如果找到了记录，说明是“取消点赞”
      await db.collection('votes_log').doc(log.data[0]._id).remove()
      await db.collection('posts').doc(postId).update({
        data: {
          votes: _.inc(-1)
        }
      })
    } else {
      // 3. 如果没找到记录，说明是“点赞”
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
    }

    // 4. 无论点赞还是取消，都重新获取文章的最新数据
    updatedPost = await db.collection('posts').doc(postId).get();

    return {
      success: true,
      votes: updatedPost.data.votes // 返回最新的点赞数
    }

  } catch (e) {
    console.error('votePost error', e)
    return {
      success: false,
      error: e
    }
  }
}