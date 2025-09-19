// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;
const $ = _.aggregate;

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { skip = 0, limit = 10, isPoem, isOriginal, tag = '' } = event; // 添加isPoem、isOriginal和tag参数

  try {
    // 移除调试日志以提升性能

    let query = db.collection('posts').aggregate();

    // 构建筛选条件
    const matchConditions = {};

    // 如果指定了isPoem参数，添加诗歌筛选条件
    if (isPoem !== undefined) {
      matchConditions.isPoem = isPoem;
    }

    // 如果指定了isOriginal参数，添加原创筛选条件
    if (isOriginal !== undefined) {
      matchConditions.isOriginal = isOriginal;
    }

    // 如果指定了tag参数，添加标签筛选条件
    if (tag) {
      matchConditions.tags = tag;  // 匹配包含该标签的文档
      matchConditions['tags.0'] = { $exists: true };  // 确保tags数组至少有一个元素
    }

    // 如果有筛选条件，应用match
    if (Object.keys(matchConditions).length > 0) {
      query = query.match(matchConditions);
    }

    // 在筛选后进行排序和分页
    query = query.sort({ createTime: -1 })
      .skip(skip)
      .limit(limit);
    
    const postsRes = await query
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
      // 关联当前用户的点赞记录 (兼容旧版SDK的写法)
      .lookup({
        from: 'votes_log',
        let: {
          post_id: '$_id'
        },
        // 使用JSON对象替代.pipeline().build()
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$postId', '$$post_id'] },
                  { $eq: ['$_openid', wxContext.OPENID] }
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
        tags: '$tags', // 新增标签字段
        authorName: $.ifNull([$.arrayElemAt(['$authorInfo.nickName', 0]), '匿名用户']),
        authorAvatar: $.ifNull([$.arrayElemAt(['$authorInfo.avatarUrl', 0]), '']),
        commentCount: $.size('$comments'),
        isVoted: $.gt([$.size('$userVote'), 0]),
      })
      .end();

    const posts = postsRes.list;

    // 移除调试信息以提升性能

    // --- 优化图片URL转换逻辑 ---
    const fileIDs = new Set(); // 使用Set避免重复fileID
    
    posts.forEach(post => {
      // 保证 imageUrls、originalImageUrls 一定为数组
      if (!Array.isArray(post.imageUrls)) post.imageUrls = post.imageUrls ? [post.imageUrls] : [];
      if (!Array.isArray(post.originalImageUrls)) post.originalImageUrls = post.originalImageUrls ? [post.originalImageUrls] : [];
      
      // 收集所有需要转换的fileID
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

        // 批量转换所有帖子的图片URL
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
      }
    }

    // 移除调试日志以提升性能

    return {
      success: true,
      posts: posts
    };

  } catch (e) {
    return {
      success: false,
      error: {
        message: e.message,
        stack: e.stack
      }
    };
  }
};