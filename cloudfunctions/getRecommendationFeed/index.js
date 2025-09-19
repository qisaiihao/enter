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

    console.log(`推荐算法开始执行，用户: ${openId}, 总限制: ${totalLimit}, 个性化: ${personalizedLimit}, 热门: ${hotLimit}, 排除ID: ${excludePostIds.length}个`);

    // 先检查数据库中是否有帖子数据
    const totalPostsCount = await db.collection('posts').where({ isOriginal: true }).count();
    console.log(`数据库中原创帖子总数: ${totalPostsCount.total}`);

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
      console.log(`个性化推荐获取到${personalizedPosts.length}个帖子`);
    } else {
      console.log('个性化推荐为空，将用热门帖子填充');
    }

    // 2. 获取热门推荐（如果个性化推荐为空，增加热门推荐数量）
    const actualHotLimit = personalizedPosts.length === 0 ? hotLimit + personalizedLimit : hotLimit;
    console.log(`开始获取热门推荐，限制: ${actualHotLimit} (原始: ${hotLimit}, 个性化为空: ${personalizedPosts.length === 0})`);
    const hotPosts = await getHotPosts(actualHotLimit, Array.from(usedPostIds), openId);
    
    if (hotPosts.length > 0) {
      hotPosts.forEach(post => {
        post.recommendationType = 'hot';
        post.recommendationReason = '热门内容';
        usedPostIds.add(post._id);
      });
      allPosts.push(...hotPosts);
      console.log(`热门推荐获取到${hotPosts.length}个帖子`);
    }

    // 3. 如果推荐不足，优先用热门帖子补充，再用最新帖子补充
    if (allPosts.length < totalLimit) {
      const needMore = totalLimit - allPosts.length;
      console.log(`推荐不足，需要补充${needMore}个帖子`);
      
      // 优先用热门帖子补充
      const additionalHotPosts = await getHotPosts(needMore, Array.from(usedPostIds), openId);
      
      if (additionalHotPosts.length > 0) {
        additionalHotPosts.forEach(post => {
          post.recommendationType = 'hot';
          post.recommendationReason = '热门内容';
          usedPostIds.add(post._id);
        });
        allPosts.push(...additionalHotPosts);
        console.log(`用热门帖子补充了${additionalHotPosts.length}个`);
      }
      
      // 如果还不够，用最新帖子补充
      if (allPosts.length < totalLimit) {
        const stillNeedMore = totalLimit - allPosts.length;
        console.log(`热门帖子补充后仍不足，用最新帖子补充${stillNeedMore}个`);
        
        const latestPosts = await getLatestPosts(stillNeedMore, Array.from(usedPostIds), openId);
        
        if (latestPosts.length > 0) {
          latestPosts.forEach(post => {
            post.recommendationType = 'latest';
            post.recommendationReason = '最新内容';
          });
          allPosts.push(...latestPosts);
          console.log(`用最新帖子补充了${latestPosts.length}个`);
        }
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

    console.log(`用户互动记录总数: ${allInteractions.length}`);
    
    if (allInteractions.length === 0) {
      console.log('用户没有互动记录，跳过个性化推荐');
      return [];
    }

    const interactedPostIds = allInteractions.map(item => item.postId);
    console.log(`用户互动过的帖子ID: ${interactedPostIds.slice(0, 5)}...`);

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

    console.log(`找到用户互动过的帖子: ${postsRes.data.length}个`);

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

    console.log(`感兴趣的作者数量: ${interestedAuthorIds.size}, 感兴趣的标签数量: ${interestedTags.size}`);

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

    console.log('个性化推荐查询条件:', JSON.stringify(matchConditions, null, 2));

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
async function getHotPosts(limit, excludePostIds, openId) {
  try {
    console.log(`获取热门推荐，限制: ${limit}, 排除ID: ${excludePostIds.length}个`);
    
    const matchConditions = {
      isOriginal: true
    };

    if (excludePostIds.length > 0) {
      matchConditions._id = _.nin(excludePostIds);
    }

    console.log('热门推荐查询条件:', matchConditions);

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

    console.log(`热门推荐查询结果: ${hotResult.list ? hotResult.list.length : 0}个帖子`);
    return await processPostsData(hotResult.list || [], openId);

  } catch (error) {
    console.error('获取热门推荐失败:', error);
    return [];
  }
}

// 获取最新帖子
async function getLatestPosts(limit, excludePostIds, openId) {
  try {
    console.log(`获取最新帖子，限制: ${limit}, 排除ID: ${excludePostIds.length}个`);
    
    const matchConditions = {
      isOriginal: true
    };

    if (excludePostIds.length > 0) {
      matchConditions._id = _.nin(excludePostIds);
    }

    console.log('最新帖子查询条件:', matchConditions);

    const latestResult = await db.collection('posts')
      .where(matchConditions)
      .orderBy('createTime', 'desc')
      .limit(limit)
      .get();

    console.log(`最新帖子查询结果: ${latestResult.data ? latestResult.data.length : 0}个帖子`);
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