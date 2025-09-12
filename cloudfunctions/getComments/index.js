// 云函数 getComments 的入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command; // 获取数据库查询指令

// 云函数入口函数
exports.main = async (event, context) => {
  const { postId } = event;

  if (!postId) {
    return { success: false, message: 'Post ID is required.' };
  }

  try {
    // 1. 获取帖子的所有评论
    const commentsRes = await db.collection('comments')
      .where({
        postId: postId
      })
      .orderBy('createTime', 'asc') // 按时间升序，旧评论在前
      .get();
    
    let allComments = commentsRes.data;

    if (allComments.length === 0) {
      // 如果没有评论，直接返回空数组
      return {
        success: true,
        comments: []
      };
    }

    // 2. 分离父评论和子评论
    const parentComments = allComments.filter(comment => !comment.parentId);
    const childComments = allComments.filter(comment => comment.parentId);

    // 3. 获取所有评论者的 openid
    const openids = allComments.map(comment => comment._openid);
    const uniqueOpenids = [...new Set(openids)]; // 去重

    // 4. 一次性获取所有评论者的用户信息
    const usersRes = await db.collection('users').where({
      _openid: _.in(uniqueOpenids)
    }).get();
    
    const usersMap = new Map();
    usersRes.data.forEach(user => {
      usersMap.set(user._openid, {
        nickName: user.nickName,
        avatarUrl: user.avatarUrl
      });
    });

    // 5. 定义一个函数，用于将用户信息合并到评论中
    const processComments = (comments) => {
      return comments.map(comment => {
        const author = usersMap.get(comment._openid) || { 
          nickName: '匿名用户', 
          avatarUrl: '' // 如果找不到用户信息，提供默认值
        };
        return {
          ...comment,
          authorName: author.nickName,
          authorAvatar: author.avatarUrl
        };
      });
    };

    const processedParentComments = processComments(parentComments);
    const processedChildComments = processComments(childComments);

    // 6. 将子评论按 parentId 组织成 Map，方便查找
    const childCommentsMap = new Map();
    processedChildComments.forEach(child => {
      if (!childCommentsMap.has(child.parentId)) {
        childCommentsMap.set(child.parentId, []);
      }
      childCommentsMap.get(child.parentId).push(child);
    });

    // 7. 将子评论（回复）添加到对应的父评论的 replies 数组中
    const resultComments = processedParentComments.map(parent => ({
      ...parent,
      replies: childCommentsMap.get(parent._id) || []
    }));

    // 8. 获取当前用户对这些评论的点赞状态
    const wxContext = cloud.getWXContext();
    const openId = wxContext.OPENID;
    const allCommentIds = allComments.map(c => c._id);
    
    // [关键修改] 从 votes_log 集合中查询，并且 type 必须是 'comment'
    const likesRes = await db.collection('votes_log').where({
      _openid: openId,
      commentId: _.in(allCommentIds),
      type: 'comment' 
    }).get();
    
    // 创建一个 Set，存放用户点赞过的所有评论ID，方便快速查询
    const userLikedCommentIds = new Set(likesRes.data.map(like => like.commentId));

    // 9. 递归函数：将点赞状态和点赞数附加到每条评论上
    const addLikeStatus = (comments) => {
      comments.forEach(comment => {
        comment.liked = userLikedCommentIds.has(comment._id);
        comment.likes = comment.likes || 0; // 如果没有 likes 字段，默认为 0
        // 如果有子评论，也对子评论进行同样的操作
        if (comment.replies && comment.replies.length > 0) {
          addLikeStatus(comment.replies);
        }
      });
    };
    addLikeStatus(resultComments);

    // 10. (可选，但建议保留) 转换头像的 FileID 为临时 HTTPS 链接
    // (这段代码来自你的原始函数，逻辑是正确的)
    const getAllAvatars = (comments) => {
      let avatars = [];
      comments.forEach(comment => {
        if (comment.authorAvatar && comment.authorAvatar.startsWith('cloud://')) {
          avatars.push(comment.authorAvatar);
        }
        if (comment.replies) {
          avatars = avatars.concat(getAllAvatars(comment.replies));
        }
      });
      return avatars;
    };

    const fileIDs = getAllAvatars(resultComments);
    if (fileIDs.length > 0) {
      const fileListResult = await cloud.getTempFileURL({ fileList: fileIDs });
      const urlMap = new Map();
      fileListResult.fileList.forEach(item => {
        if (item.status === 0) { // status 为 0 表示获取成功
          urlMap.set(item.fileID, item.tempFileURL);
        }
      });

      const updateAvatars = (comments) => {
        comments.forEach(comment => {
          if (comment.authorAvatar && urlMap.has(comment.authorAvatar)) {
            comment.authorAvatar = urlMap.get(comment.authorAvatar);
          }
          if (comment.replies) {
            updateAvatars(comment.replies);
          }
        });
      };
      updateAvatars(resultComments);
    }

    // 11. 返回最终处理好的评论数据
    console.log('getComments返回数据:', {
      commentsCount: resultComments.length,
      allCommentsLength: allComments.length,
      commentCount: allComments.length
    });
    
    return {
      success: true,
      comments: resultComments,
      commentCount: allComments.length // 添加评论总数
    };

  } catch (e) {
    console.error('getComments error', e);
    return {
      success: false,
      message: 'Failed to get comments.',
      error: e.toString() // 返回更具体的错误信息
    };
  }
};