// 个性化推荐云函数
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const $ = _.aggregate;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { userId, limit = 3, skip = 0 } = event;
  const openId = userId || wxContext.OPENID;

  if (!openId) {
    return { success: false, message: '用户未登录' };
  }

  try {
    // 1. 获取用户最近的互动记录（点赞、评论、浏览）
    const BATCH_SIZE = 50; // 获取最近50条互动记录
    
    // 获取点赞记录
    const voteRes = await db.collection('votes_log')
      .where({ 
        _openid: openId,
        type: 'post' // 只获取帖子点赞记录
      })
      .orderBy('createTime', 'desc')
      .limit(BATCH_SIZE)
      .get();

    // 获取浏览记录
    const viewRes = await db.collection('view_log')
      .where({ 
        _openid: openId,
        type: 'view'
      })
      .orderBy('createTime', 'desc')
      .limit(BATCH_SIZE)
      .get();

    // 合并所有互动记录
    const allInteractions = [
      ...voteRes.data.map(item => ({ ...item, interactionType: 'vote' })),
      ...viewRes.data.map(item => ({ ...item, interactionType: 'view' }))
    ].sort((a, b) => new Date(b.createTime) - new Date(a.createTime));

    // 如果没有互动记录，返回空数组
    if (allInteractions.length === 0) {
      return { success: true, posts: [], message: '暂无互动记录' };
    }

    const interactedPostIds = allInteractions.map(item => item.postId);

    // 2. 获取用户互动过的帖子信息，提取作者和标签
    const postsRes = await db.collection('posts')
      .where({
        _id: _.in(interactedPostIds)
      })
      .field({
        _openid: true,
        tags: true
      })
      .get();

    // 提取用户感兴趣的作者和标签
    const interestedAuthorIds = new Set();
    const interestedTags = new Set();

    postsRes.data.forEach(post => {
      interestedAuthorIds.add(post._openid);
      if (post.tags && Array.isArray(post.tags)) {
        post.tags.forEach(tag => interestedTags.add(tag));
      }
    });

    // 3. 查找相似内容（相同作者或标签的帖子）
    let query = db.collection('posts').aggregate();

    // 构建推荐条件
    const matchConditions = {
      _id: _.nin(interactedPostIds), // 排除已互动过的帖子
      isOriginal: true // 只推荐原创内容
    };

    // 如果有感兴趣的作者或标签，添加推荐条件
    if (interestedAuthorIds.size > 0 || interestedTags.size > 0) {
      const orConditions = [];
      
      if (interestedAuthorIds.size > 0) {
        orConditions.push({ _openid: _.in(Array.from(interestedAuthorIds)) });
      }
      
      if (interestedTags.size > 0) {
        orConditions.push({ tags: _.in(Array.from(interestedTags)) });
      }
      
      if (orConditions.length > 0) {
        matchConditions.$or = orConditions;
      }
    }

    query = query.match(matchConditions);

    // 4. 排序和分页
    const postsResult = await query
      .sort({ createTime: -1 })
      .skip(skip)
      .limit(limit)
      .lookup({
        from: 'users',
        localField: '_openid',
        foreignField: '_openid',
        as: 'authorInfo',
      })
      .lookup({
        from: 'comments',
        localField: '_id',
        foreignField: 'postId',
        as: 'comments',
      })
      .lookup({
        from: 'votes_log',
        let: { post_id: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$postId', '$$post_id'] },
                  { $eq: ['$_openid', openId] }
                ]
              }
            }
          }
        ],
        as: 'userVote',
      })
      .project({
        _id: '$_id',
        _openid: '$_openid',
        title: '$title',
        content: '$content',
        createTime: '$createTime',
        imageUrl: '$imageUrl',
        imageUrls: '$imageUrls',
        originalImageUrl: '$originalImageUrl',
        originalImageUrls: '$originalImageUrls',
        votes: '$votes',
        isPoem: '$isPoem',
        isOriginal: '$isOriginal',
        poemBgImage: '$poemBgImage',
        tags: '$tags',
        authorName: $.ifNull([$.arrayElemAt(['$authorInfo.nickName', 0]), '匿名用户']),
        authorAvatar: $.ifNull([$.arrayElemAt(['$authorInfo.avatarUrl', 0]), '']),
        commentCount: $.size('$comments'),
        isVoted: $.gt([$.size('$userVote'), 0]),
      })
      .end();

    const posts = postsResult.list || [];

    // 5. 处理图片URL转换
    const fileIDs = new Set();
    
    posts.forEach(post => {
      if (!Array.isArray(post.imageUrls)) post.imageUrls = post.imageUrls ? [post.imageUrls] : [];
      if (!Array.isArray(post.originalImageUrls)) post.originalImageUrls = post.originalImageUrls ? [post.originalImageUrls] : [];
      
      const urlsToCheck = [
        ...post.imageUrls,
        ...post.originalImageUrls,
        post.imageUrl,
        post.originalImageUrl,
        post.authorAvatar,
        post.poemBgImage
      ].filter(url => url && url.startsWith('cloud://'));
      
      urlsToCheck.forEach(url => fileIDs.add(url));
    });

    if (fileIDs.size > 0) {
      try {
        const fileListResult = await cloud.getTempFileURL({ fileList: Array.from(fileIDs) });
        const urlMap = new Map();
        
        fileListResult.fileList.forEach(item => {
          if (item.status === 0) {
            urlMap.set(item.fileID, item.tempFileURL);
          }
        });

        posts.forEach(post => {
          const convertUrl = (url) => urlMap.get(url) || url;
          
          if (post.imageUrl) post.imageUrl = convertUrl(post.imageUrl);
          if (post.originalImageUrl) post.originalImageUrl = convertUrl(post.originalImageUrl);
          if (post.authorAvatar) post.authorAvatar = convertUrl(post.authorAvatar);
          if (post.poemBgImage) post.poemBgImage = convertUrl(post.poemBgImage);
          
          if (Array.isArray(post.imageUrls)) {
            post.imageUrls = post.imageUrls.map(convertUrl);
          }
          if (Array.isArray(post.originalImageUrls)) {
            post.originalImageUrls = post.originalImageUrls.map(convertUrl);
          }
        });
      } catch (fileError) {
        console.error('图片URL转换失败:', fileError);
      }
    }

    return {
      success: true,
      posts: posts,
      total: posts.length
    };

  } catch (error) {
    console.error('个性化推荐失败:', error);
    return {
      success: false,
      message: '推荐失败',
      error: error.message
    };
  }
};
