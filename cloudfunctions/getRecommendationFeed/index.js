// 混合推荐云函数 - 简化版本，避免云函数间调用
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const $ = _.aggregate;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { 
    personalizedLimit = 3, 
    hotLimit = 2, 
    skip = 0,
    excludePostIds = [] // 排除已显示的帖子ID
  } = event;
  const openId = wxContext.OPENID;

  if (!openId) {
    return { success: false, message: '用户未登录' };
  }

  try {
    const totalLimit = personalizedLimit + hotLimit;
    const allPosts = [];
    const usedPostIds = new Set(excludePostIds);

    // 1. 获取个性化推荐（基于用户互动记录）
    console.log('开始获取个性化推荐...');
    const personalizedPosts = await getPersonalizedPosts(openId, personalizedLimit, usedPostIds);
    
    if (personalizedPosts.length > 0) {
      personalizedPosts.forEach(post => {
        post.recommendationType = 'personalized';
        post.recommendationReason = '基于你的兴趣推荐';
        usedPostIds.add(post._id);
      });
      allPosts.push(...personalizedPosts);
    }

    // 2. 获取热门推荐
    console.log('开始获取热门推荐...');
    const hotPosts = await getHotPosts(hotLimit, Array.from(usedPostIds));
    
    if (hotPosts.length > 0) {
      hotPosts.forEach(post => {
        post.recommendationType = 'hot';
        post.recommendationReason = '热门内容';
        usedPostIds.add(post._id);
      });
      allPosts.push(...hotPosts);
    }

    // 3. 如果推荐不足，用最新帖子补充
    if (allPosts.length < totalLimit) {
      const needMore = totalLimit - allPosts.length;
      console.log(`推荐不足，用最新帖子补充${needMore}个`);
      
      const latestPosts = await getLatestPosts(needMore, Array.from(usedPostIds));
      
      if (latestPosts.length > 0) {
        latestPosts.forEach(post => {
          post.recommendationType = 'latest';
          post.recommendationReason = '最新内容';
        });
        allPosts.push(...latestPosts);
      }
    }

    // 4. 随机打乱推荐顺序
    const shuffledPosts = shuffleArray(allPosts);
    const finalPosts = shuffledPosts.slice(0, totalLimit);

    console.log(`最终推荐${finalPosts.length}个帖子:`, finalPosts.map(p => ({
      id: p._id,
      title: p.title,
      type: p.recommendationType,
      reason: p.recommendationReason
    })));

    return {
      success: true,
      posts: finalPosts,
      total: finalPosts.length,
      personalizedCount: finalPosts.filter(p => p.recommendationType === 'personalized').length,
      hotCount: finalPosts.filter(p => p.recommendationType === 'hot').length,
      latestCount: finalPosts.filter(p => p.recommendationType === 'latest').length
    };

  } catch (error) {
    console.error('混合推荐失败:', error);
    return {
      success: false,
      message: '推荐失败',
      error: error.message
    };
  }
};

// 获取个性化推荐帖子
async function getPersonalizedPosts(openId, limit, usedPostIds) {
  try {
    // 获取用户最近的互动记录
    const BATCH_SIZE = 30; // 减少查询数量
    
    const voteRes = await db.collection('votes_log')
      .where({ 
        _openid: openId,
        type: 'post'
      })
      .orderBy('createTime', 'desc')
      .limit(BATCH_SIZE)
      .get();

    const viewRes = await db.collection('view_log')
      .where({ 
        _openid: openId,
        type: 'view'
      })
      .orderBy('createTime', 'desc')
      .limit(BATCH_SIZE)
      .get();

    const allInteractions = [
      ...voteRes.data.map(item => ({ ...item, interactionType: 'vote' })),
      ...viewRes.data.map(item => ({ ...item, interactionType: 'view' }))
    ].sort((a, b) => new Date(b.createTime) - new Date(a.createTime));

    if (allInteractions.length === 0) {
      return [];
    }

    const interactedPostIds = allInteractions.map(item => item.postId);

    // 获取用户互动过的帖子信息
    const postsRes = await db.collection('posts')
      .where({
        _id: _.in(interactedPostIds)
      })
      .field({
        _openid: true,
        tags: true
      })
      .limit(20) // 限制查询数量
      .get();

    const interestedAuthorIds = new Set();
    const interestedTags = new Set();

    postsRes.data.forEach(post => {
      interestedAuthorIds.add(post._openid);
      if (post.tags && Array.isArray(post.tags)) {
        post.tags.forEach(tag => interestedTags.add(tag));
      }
    });

    // 查找相似内容
    const matchConditions = {
      _id: _.nin([...interactedPostIds, ...usedPostIds]),
      isOriginal: true
    };

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

    const personalizedResult = await db.collection('posts').aggregate()
      .match(matchConditions)
      .sort({ createTime: -1 })
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

    return await processPostsData(personalizedResult.list || [], openId);

  } catch (error) {
    console.error('获取个性化推荐失败:', error);
    return [];
  }
}

// 获取热门推荐帖子
async function getHotPosts(limit, excludePostIds) {
  try {
    const matchConditions = {
      isOriginal: true
    };

    if (excludePostIds.length > 0) {
      matchConditions._id = _.nin(excludePostIds);
    }

    const hotResult = await db.collection('posts').aggregate()
      .match(matchConditions)
      .addFields({
        hotScore: {
          $add: [
            { $multiply: [{ $ifNull: ['$votes', 0] }, 2] },
            { $multiply: [{ $ifNull: ['$commentCount', 0] }, 5] }
          ]
        }
      })
      .sort({ hotScore: -1, createTime: -1 })
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
        hotScore: '$hotScore',
        authorName: $.ifNull([$.arrayElemAt(['$authorInfo.nickName', 0]), '匿名用户']),
        authorAvatar: $.ifNull([$.arrayElemAt(['$authorInfo.avatarUrl', 0]), '']),
        commentCount: $.size('$comments'),
        isVoted: $.gt([$.size('$userVote'), 0]),
      })
      .end();

    return await processPostsData(hotResult.list || [], openId);

  } catch (error) {
    console.error('获取热门推荐失败:', error);
    return [];
  }
}

// 获取最新帖子
async function getLatestPosts(limit, excludePostIds) {
  try {
    const matchConditions = {
      isOriginal: true
    };

    if (excludePostIds.length > 0) {
      matchConditions._id = _.nin(excludePostIds);
    }

    const latestResult = await db.collection('posts')
      .where(matchConditions)
      .orderBy('createTime', 'desc')
      .limit(limit)
      .get();

    return await processPostsData(latestResult.data || [], openId);

  } catch (error) {
    console.error('获取最新帖子失败:', error);
    return [];
  }
}

// 数组随机打乱函数
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// 处理帖子数据的通用方法
async function processPostsData(posts, openId) {
  if (!posts || posts.length === 0) return [];

  // 处理图片URL转换
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

  return posts;
}