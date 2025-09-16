// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const $ = db.command.aggregate;

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const currentOpenid = wxContext.OPENID;

  if (!currentOpenid) {
    return { success: false, message: 'User not logged in.' };
  }

  const { userId, skip = 0, limit = 20 } = event;
  console.log('【getUserProfile云函数】收到参数:', { userId, skip, limit });

  if (!userId) {
    return { success: false, message: '用户ID不能为空' };
  }

  try {
    // 获取目标用户的公开信息和帖子
    const profileData = await db.collection('users').aggregate()
      .match({ _openid: userId })
      .limit(1)
      .lookup({
        from: 'posts',
        let: { user_openid: '$_openid' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_openid', '$$user_openid'] } } },
          { $sort: { createTime: -1 } },
          { $skip: skip },
          { $limit: limit }
        ],
        as: 'posts'
      })
      .project({
        _id: 1,
        _openid: 1,
        nickName: 1,
        avatarUrl: 1,
        bio: 1,
        // 不返回私人信息如生日、年龄等
        posts: 1
      })
      .end();

    if (!profileData.list || profileData.list.length === 0) {
      return { success: false, message: '用户不存在' };
    }

    const userInfo = profileData.list[0];
    let posts = userInfo.posts || [];

    // 处理图片URL
    posts.forEach(post => {
      if (!Array.isArray(post.imageUrls)) {
        post.imageUrls = post.imageUrls ? [post.imageUrls] : [];
      }
      if (!Array.isArray(post.originalImageUrls)) {
        post.originalImageUrls = post.originalImageUrls ? [post.originalImageUrls] : [];
      }
    });

    // 转换云存储URL为临时URL
    const fileIDs = [];
    posts.forEach(post => {
      if (post.imageUrl && post.imageUrl.startsWith('cloud://')) {
        fileIDs.push(post.imageUrl);
      }
      if (post.imageUrls && Array.isArray(post.imageUrls)) {
        post.imageUrls.forEach(url => {
          if (url && url.startsWith('cloud://')) {
            fileIDs.push(url);
          }
        });
      }
      if (post.originalImageUrls && Array.isArray(post.originalImageUrls)) {
        post.originalImageUrls.forEach(url => {
          if (url && url.startsWith('cloud://')) {
            fileIDs.push(url);
          }
        });
      }
    });

    // 处理用户头像URL
    if (userInfo.avatarUrl && userInfo.avatarUrl.startsWith('cloud://')) {
      fileIDs.push(userInfo.avatarUrl);
    }

    if (fileIDs.length > 0) {
      try {
        const fileListResult = await cloud.getTempFileURL({ fileList: fileIDs });
        const urlMap = new Map();
        fileListResult.fileList.forEach(item => {
          if (item.status === 0) {
            urlMap.set(item.fileID, item.tempFileURL);
          }
        });

        // 转换帖子图片URL
        posts.forEach(post => {
          if (post.imageUrl && urlMap.has(post.imageUrl)) {
            post.imageUrl = urlMap.get(post.imageUrl);
          }
          if (post.imageUrls && Array.isArray(post.imageUrls)) {
            post.imageUrls = post.imageUrls.map(url => {
              return urlMap.has(url) ? urlMap.get(url) : url;
            });
          }
          if (post.originalImageUrls && Array.isArray(post.originalImageUrls)) {
            post.originalImageUrls = post.originalImageUrls.map(url => {
              return urlMap.has(url) ? urlMap.get(url) : url;
            });
          }
        });

        // 转换用户头像URL
        if (userInfo.avatarUrl && urlMap.has(userInfo.avatarUrl)) {
          userInfo.avatarUrl = urlMap.get(userInfo.avatarUrl);
        }
      } catch (fileError) {
        console.error('文件URL转换失败:', fileError);
      }
    }

    // 获取每个帖子的评论数量
    for (let post of posts) {
      try {
        const commentCount = await db.collection('comments')
          .where({ postId: post._id })
          .count();
        post.commentCount = commentCount.total;
      } catch (err) {
        console.error('获取评论数量失败:', err);
        post.commentCount = 0;
      }
    }

    // 检查当前用户是否点赞了这些帖子
    if (posts.length > 0) {
      const postIds = posts.map(p => p._id);
      try {
        const votesResult = await db.collection('votes_log')
          .where({
            _openid: currentOpenid,
            postId: db.command.in(postIds)
          })
          .get();

        const votedPostIds = new Set(votesResult.data.map(v => v.postId));
        posts.forEach(post => {
          post.isVoted = votedPostIds.has(post._id);
        });
      } catch (err) {
        console.error('获取点赞状态失败:', err);
        posts.forEach(post => {
          post.isVoted = false;
        });
      }
    }

    console.log('【getUserProfile云函数】最终返回 posts 数量:', posts.length);

    return {
      success: true,
      userInfo: {
        _openid: userInfo._openid,
        nickName: userInfo.nickName || '微信用户',
        avatarUrl: userInfo.avatarUrl || '',
        bio: userInfo.bio || '这个用户很懒，什么都还没留下...'
      },
      posts: posts
    };

  } catch (e) {
    console.error('【getUserProfile云函数】错误:', e);
    return {
      success: false,
      error: e.message || '获取用户信息失败'
    };
  }
};
