console.log('【profile云函数】=== 代码已更新 ===');

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
  const openid = wxContext.OPENID;

  if (!openid) {
    return { success: false, message: 'User not logged in.' };
  }

  const { skip = 0, limit = 20, action } = event;
  console.log('【profile云函数】收到参数:', { skip, limit, action });

  // 处理收藏功能相关请求
  if (action === 'getFavoriteFolders') {
    return await getFavoriteFolders(openid);
  } else if (action === 'createFavoriteFolder') {
    return await createFavoriteFolder(openid, event.folderName);
  } else if (action === 'addToFavorite') {
    return await addToFavorite(openid, event.postId, event.folderId);
  } else if (action === 'getFavoritesByFolder') {
    return await getFavoritesByFolder(openid, event.folderId, event.skip || 0, event.limit || 10);
  } else if (action === 'removeFromFavorite') {
    return await removeFromFavorite(openid, event.favoriteId);
  } else if (action === 'getAllFavorites') {
    return await getAllFavorites(openid, event.skip || 0, event.limit || 10);
  }

  try {
    // Step 1: Aggregate to get user info and their posts
    const profileData = await db.collection('users').aggregate()
      .match({ _openid: openid })
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
        as: 'userPosts',
      })
      .project({
        _id: 1,
        nickName: 1,
        avatarUrl: 1, // This is a fileID
        birthday: 1, // 新增：获取生日
        bio: 1,      // 新增：获取个性签名
        posts: '$userPosts'
      })
      .end();

    if (profileData.list.length === 0) {
      return { success: false, message: 'User not found.' };
    }

    const result = profileData.list[0];
    let userInfo = { 
      nickName: result.nickName, 
      avatarUrl: result.avatarUrl, // fileID
      birthday: result.birthday,
      bio: result.bio
    };
    let posts = result.posts || []; // 这里已经是分页后的 posts
    console.log('【profile云函数】聚合后 posts 数量:', posts.length);

    // Step 2: Aggregate to get comment counts for the posts
    if (posts.length > 0) {
      const postIds = posts.map(p => p._id);
      const commentsCountRes = await db.collection('comments').aggregate()
        .match({ postId: db.command.in(postIds) })
        .group({ _id: '$postId', count: $.sum(1) })
        .end();

      const commentsCountMap = new Map();
      commentsCountRes.list.forEach(item => {
        commentsCountMap.set(item._id, item.count);
      });

      posts = posts.map(post => ({
        ...post,
        commentCount: commentsCountMap.get(post._id) || 0
      }));
      posts.sort((a, b) => b.createTime - a.createTime);
    }

    // --- Efficiently convert FileIDs to temp URLs ---
    const fileIDSet = new Set(); // 使用Set避免重复
    posts.forEach((post, index) => {
      console.log(`处理第${index + 1}个帖子的图片字段:`, {
        imageUrl: post.imageUrl,
        imageUrls: post.imageUrls,
        originalImageUrl: post.originalImageUrl,
        originalImageUrls: post.originalImageUrls,
        authorAvatar: userInfo.avatarUrl
      });
      
      // 保证 imageUrls、originalImageUrls 一定为数组
      if (!Array.isArray(post.imageUrls)) post.imageUrls = post.imageUrls ? [post.imageUrls] : [];
      if (!Array.isArray(post.originalImageUrls)) post.originalImageUrls = post.originalImageUrls ? [post.originalImageUrls] : [];
      
      // 特殊处理：如果imageUrl有值但imageUrls为空，将imageUrl添加到imageUrls中
      if (post.imageUrl && (!post.imageUrls || post.imageUrls.length === 0)) {
        post.imageUrls = [post.imageUrl];
      }
      if (post.originalImageUrl && (!post.originalImageUrls || post.originalImageUrls.length === 0)) {
        post.originalImageUrls = [post.originalImageUrl];
      }
      
      // 收集唯一的fileID，优先使用imageUrls和originalImageUrls
      if (post.imageUrls && Array.isArray(post.imageUrls) && post.imageUrls.length > 0) {
        post.imageUrls.forEach(url => {
          if (url && url.startsWith('cloud://')) {
            fileIDSet.add(url);
          }
        });
      } else if (post.imageUrl && post.imageUrl.startsWith('cloud://')) {
        // 只有当imageUrls为空时才使用imageUrl
        fileIDSet.add(post.imageUrl);
      }
      
      if (post.originalImageUrls && Array.isArray(post.originalImageUrls) && post.originalImageUrls.length > 0) {
        post.originalImageUrls.forEach(url => {
          if (url && url.startsWith('cloud://')) {
            fileIDSet.add(url);
          }
        });
      } else if (post.originalImageUrl && post.originalImageUrl.startsWith('cloud://')) {
        // 只有当originalImageUrls为空时才使用originalImageUrl
        fileIDSet.add(post.originalImageUrl);
      }
      
      if (userInfo.avatarUrl && userInfo.avatarUrl.startsWith('cloud://')) {
        fileIDSet.add(userInfo.avatarUrl);
      }
    });
    
    const fileIDs = Array.from(fileIDSet);

    console.log('需要转换的fileID数量:', fileIDs.length);
    console.log('fileID列表:', fileIDs);

    if (fileIDs.length > 0) {
      try {
        // 分批处理，每批最多50个文件
        const batchSize = 50;
        const urlMap = new Map();
        
        for (let i = 0; i < fileIDs.length; i += batchSize) {
          const batch = fileIDs.slice(i, i + batchSize);
          console.log(`处理第${Math.floor(i/batchSize) + 1}批，文件数量: ${batch.length}`);
          
          const fileListResult = await cloud.getTempFileURL({ fileList: batch });
          console.log('getTempFileURL返回结果:', fileListResult);
          
          fileListResult.fileList.forEach(item => {
            console.log('处理文件转换结果:', {
              fileID: item.fileID,
              status: item.status,
              tempFileURL: item.tempFileURL,
              errMsg: item.errMsg
            });
            
            if (item.status === 0) {
              urlMap.set(item.fileID, item.tempFileURL);
            } else {
              console.error('文件转换失败:', item.fileID, item.errMsg);
            }
          });
        }

        console.log('成功转换的URL数量:', urlMap.size);

        posts.forEach((post, index) => {
          console.log(`转换第${index + 1}个帖子的图片URL`);
          
          if (post.imageUrl && urlMap.has(post.imageUrl)) {
            post.imageUrl = urlMap.get(post.imageUrl);
            console.log('转换imageUrl:', post.imageUrl);
          }
          if (post.originalImageUrl && urlMap.has(post.originalImageUrl)) {
            post.originalImageUrl = urlMap.get(post.originalImageUrl);
            console.log('转换originalImageUrl:', post.originalImageUrl);
          }
          if (post.imageUrls && Array.isArray(post.imageUrls)) {
            post.imageUrls = post.imageUrls.map(url => {
              if (url && urlMap.has(url)) {
                const convertedUrl = urlMap.get(url);
                console.log('转换imageUrls中的URL:', url, '->', convertedUrl);
                return convertedUrl;
              }
              return url;
            });
          }
          if (post.originalImageUrls && Array.isArray(post.originalImageUrls)) {
            post.originalImageUrls = post.originalImageUrls.map(url => {
              if (url && urlMap.has(url)) {
                const convertedUrl = urlMap.get(url);
                console.log('转换originalImageUrls中的URL:', url, '->', convertedUrl);
                return convertedUrl;
              }
              return url;
            });
          }
          if (userInfo.avatarUrl && urlMap.has(userInfo.avatarUrl)) {
            userInfo.avatarUrl = urlMap.get(userInfo.avatarUrl);
            console.log('转换authorAvatar:', userInfo.avatarUrl);
          }
        });
      } catch (fileError) {
        console.error('文件URL转换失败:', fileError);
        // 即使文件转换失败，也要返回帖子数据
      }
    }

    // 图片URL转换完成后，给每个post加上作者信息
    posts = posts.map(post => ({
      ...post,
      authorName: userInfo.nickName,
      authorAvatar: userInfo.avatarUrl
    }));

    console.log('【profile云函数】最终返回 posts 数量:', posts.length);

    return {
      success: true,
      userInfo: userInfo,
      posts: posts // 只返回分页后的
    };

  } catch (e) {
    console.error(e);
    return {
      success: false,
      error: e
    };
  }
};

// 收藏功能相关函数

// 获取收藏夹列表
async function getFavoriteFolders(openid) {
  try {
    const result = await db.collection('favorite_folders').where({
      _openid: openid
    }).orderBy('createTime', 'desc').get();

    return {
      success: true,
      folders: result.data
    };
  } catch (error) {
    console.error('获取收藏夹失败:', error);
    return {
      success: false,
      message: '获取收藏夹失败',
      error: error.message
    };
  }
}

// 创建收藏夹
async function createFavoriteFolder(openid, folderName) {
  try {
    console.log('开始创建收藏夹，用户:', openid, '名称:', folderName);

    if (!folderName || folderName.trim() === '') {
      console.log('收藏夹名称为空');
      return {
        success: false,
        message: '收藏夹名称不能为空'
      };
    }

    // 检查用户是否已有同名收藏夹
    console.log('检查同名收藏夹...');
    const existingFolder = await db.collection('favorite_folders').where({
      _openid: openid,
      name: folderName.trim()
    }).get();

    if (existingFolder.data.length > 0) {
      console.log('找到同名收藏夹:', existingFolder.data[0]);
      return {
        success: false,
        message: '收藏夹名称已存在'
      };
    }

    console.log('未找到同名收藏夹，开始创建...');
    // 创建新收藏夹
    const result = await db.collection('favorite_folders').add({
      data: {
        _openid: openid,
        name: folderName.trim(),
        createTime: new Date(),
        updateTime: new Date(),
        itemCount: 0
      }
    });

    console.log('收藏夹创建成功，ID:', result._id);
    return {
      success: true,
      folderId: result._id,
      message: '收藏夹创建成功'
    };
  } catch (error) {
    console.error('创建收藏夹失败:', error);
    console.error('错误码:', error.code);
    console.error('错误信息:', error.message);

    // 如果是集合不存在错误
    if (error.code === -502001) {
      return {
        success: false,
        message: '数据库集合不存在，请联系管理员创建 favorite_folders 集合',
        error: error.message,
        code: error.code
      };
    }

    return {
      success: false,
      message: '创建收藏夹失败',
      error: error.message,
      code: error.code
    };
  }
}

// 添加到收藏
async function addToFavorite(openid, postId, folderId) {
  try {
    if (!postId || !folderId) {
      return {
        success: false,
        message: '参数不完整'
      };
    }

    // 检查收藏夹是否存在且属于当前用户
    const folder = await db.collection('favorite_folders').where({
      _id: folderId,
      _openid: openid
    }).get();

    if (folder.data.length === 0) {
      return {
        success: false,
        message: '收藏夹不存在'
      };
    }

    // 检查是否已经收藏过
    const existingFavorite = await db.collection('favorites').where({
      _openid: openid,
      postId: postId,
      folderId: folderId
    }).get();

    if (existingFavorite.data.length > 0) {
      return {
        success: false,
        message: '已经收藏过了'
      };
    }

    // 获取帖子信息和作者信息
    const postResult = await db.collection('posts').aggregate()
      .match({ _id: postId })
      .lookup({
        from: 'users',
        localField: '_openid',
        foreignField: '_openid',
        as: 'authorInfo'
      })
      .project({
        _id: 1,
        _openid: 1,
        title: 1,
        content: 1,
        imageUrl: 1,
        imageUrls: 1,
        poemBgImage: 1,
        isPoem: 1,
        isOriginal: 1,
        createTime: 1,
        authorName: $.ifNull([$.arrayElemAt(['$authorInfo.nickName', 0]), '匿名用户']),
        authorAvatar: $.ifNull([$.arrayElemAt(['$authorInfo.avatarUrl', 0]), ''])
      })
      .end();

    if (!postResult.list || postResult.list.length === 0) {
      return {
        success: false,
        message: '帖子不存在'
      };
    }

    const post = postResult.list[0];

    // 添加到收藏
    const result = await db.collection('favorites').add({
      data: {
        _openid: openid,
        postId: postId,
        folderId: folderId,
        createTime: new Date(),
        // 保存帖子的关键信息，避免重复查询
        postTitle: post.title,
        postContent: post.content,
        postImageUrl: post.imageUrl,
        postImageUrls: post.imageUrls,
        postPoemBgImage: post.poemBgImage,
        postIsPoem: post.isPoem,
        postIsOriginal: post.isOriginal,
        postAuthorName: post.authorName || '匿名用户',
        postAuthorAvatar: post.authorAvatar || '',
        postCreateTime: post.createTime
      }
    });

    // 更新收藏夹的项目数量
    await db.collection('favorite_folders').doc(folderId).update({
      data: {
        itemCount: db.command.inc(1),
        updateTime: new Date()
      }
    });

    // === 新增：创建收藏消息通知 ===
    try {
      // 获取收藏者信息
      const userResult = await db.collection('users').where({
        _openid: openid
      }).limit(1).get()
      const user = userResult.data[0]
      
      // 如果给自己收藏，不发送通知
      if (post._openid === openid) {
        console.log('用户给自己收藏，不发送通知')
      } else {
        // 创建消息记录
        await db.collection('messages').add({
          data: {
            fromUserId: openid,
            fromUserName: user ? user.nickName : '微信用户',
            fromUserAvatar: user ? user.avatarUrl : '',
            toUserId: post._openid,
            type: 'favorite',
            postId: postId,
            postTitle: post.title || '无标题',
            content: `${user ? user.nickName : '微信用户'} 收藏了你的帖子`,
            isRead: false,
            createTime: new Date()
          }
        })
        console.log('收藏消息已创建')
      }
    } catch (msgError) {
      console.error('创建收藏消息失败:', msgError)
      // 不影响主流程，只是记录错误
    }

    return {
      success: true,
      favoriteId: result._id,
      message: '收藏成功'
    };
  } catch (error) {
    console.error('添加收藏失败:', error);
    return {
      success: false,
      message: '添加收藏失败',
      error: error.message
    };
  }
}

// 获取收藏夹中的内容
async function getFavoritesByFolder(openid, folderId, skip, limit) {
  try {
    if (!folderId) {
      return {
        success: false,
        message: '收藏夹ID不能为空'
      };
    }

    // 检查收藏夹是否存在且属于当前用户
    const folder = await db.collection('favorite_folders').where({
      _id: folderId,
      _openid: openid
    }).get();

    if (folder.data.length === 0) {
      return {
        success: false,
        message: '收藏夹不存在'
      };
    }

    // 获取收藏夹中的收藏项
    const result = await db.collection('favorites').where({
      _openid: openid,
      folderId: folderId
    }).orderBy('createTime', 'desc').skip(skip).limit(limit).get();

    // 转换FileID为临时URL
    const fileIDs = [];
    result.data.forEach(favorite => {
      if (favorite.postImageUrl && favorite.postImageUrl.startsWith('cloud://')) {
        fileIDs.push(favorite.postImageUrl);
      }
      if (favorite.postImageUrls && Array.isArray(favorite.postImageUrls)) {
        favorite.postImageUrls.forEach(url => {
          if (url && url.startsWith('cloud://')) {
            fileIDs.push(url);
          }
        });
      }
      if (favorite.postPoemBgImage && favorite.postPoemBgImage.startsWith('cloud://')) {
        fileIDs.push(favorite.postPoemBgImage);
      }
      if (favorite.postAuthorAvatar && favorite.postAuthorAvatar.startsWith('cloud://')) {
        fileIDs.push(favorite.postAuthorAvatar);
      }
    });

    if (fileIDs.length > 0) {
      try {
        const fileListResult = await cloud.getTempFileURL({ fileList: fileIDs });
        const urlMap = new Map();
        fileListResult.fileList.forEach(item => {
          if (item.status === 0) {
            urlMap.set(item.fileID, item.tempFileURL);
          }
        });

        // 转换URL
        result.data.forEach(favorite => {
          if (favorite.postImageUrl && urlMap.has(favorite.postImageUrl)) {
            favorite.postImageUrl = urlMap.get(favorite.postImageUrl);
          }
          if (favorite.postImageUrls && Array.isArray(favorite.postImageUrls)) {
            favorite.postImageUrls = favorite.postImageUrls.map(url => {
              return urlMap.has(url) ? urlMap.get(url) : url;
            });
          }
          if (favorite.postPoemBgImage && urlMap.has(favorite.postPoemBgImage)) {
            favorite.postPoemBgImage = urlMap.get(favorite.postPoemBgImage);
          }
          if (favorite.postAuthorAvatar && urlMap.has(favorite.postAuthorAvatar)) {
            favorite.postAuthorAvatar = urlMap.get(favorite.postAuthorAvatar);
          }
        });
      } catch (fileError) {
        console.error('文件URL转换失败:', fileError);
      }
    }

    return {
      success: true,
      favorites: result.data,
      folderInfo: folder.data[0]
    };
  } catch (error) {
    console.error('获取收藏内容失败:', error);
    return {
      success: false,
      message: '获取收藏内容失败',
      error: error.message
    };
  }
}

// 取消收藏
async function removeFromFavorite(openid, favoriteId) {
  try {
    if (!favoriteId) {
      return {
        success: false,
        message: '收藏ID不能为空'
      };
    }

    // 获取收藏项信息
    const favorite = await db.collection('favorites').where({
      _id: favoriteId,
      _openid: openid
    }).get();

    if (favorite.data.length === 0) {
      return {
        success: false,
        message: '收藏项不存在'
      };
    }

    const folderId = favorite.data[0].folderId;

    // 删除收藏项
    await db.collection('favorites').doc(favoriteId).remove();

    // 更新收藏夹的项目数量
    await db.collection('favorite_folders').doc(folderId).update({
      data: {
        itemCount: db.command.inc(-1),
        updateTime: new Date()
      }
    });

    return {
      success: true,
      message: '取消收藏成功'
    };
  } catch (error) {
    console.error('取消收藏失败:', error);
    return {
      success: false,
      message: '取消收藏失败',
      error: error.message
    };
  }
}

// 获取用户的所有收藏（跨收藏夹，按时间排序）
async function getAllFavorites(openid, skip, limit) {
  try {
    console.log('【getAllFavorites】开始获取用户所有收藏', { openid, skip, limit });

    // 获取用户的所有收藏项，按收藏时间降序排列
    const result = await db.collection('favorites').where({
      _openid: openid
    }).orderBy('createTime', 'desc').skip(skip).limit(limit).get();

    console.log('【getAllFavorites】查询到收藏数量:', result.data.length);

    // 转换FileID为临时URL
    const fileIDs = [];
    result.data.forEach(favorite => {
      if (favorite.postImageUrl && favorite.postImageUrl.startsWith('cloud://')) {
        fileIDs.push(favorite.postImageUrl);
      }
      if (favorite.postImageUrls && Array.isArray(favorite.postImageUrls)) {
        favorite.postImageUrls.forEach(url => {
          if (url && url.startsWith('cloud://')) {
            fileIDs.push(url);
          }
        });
      }
      if (favorite.postPoemBgImage && favorite.postPoemBgImage.startsWith('cloud://')) {
        fileIDs.push(favorite.postPoemBgImage);
      }
      if (favorite.postAuthorAvatar && favorite.postAuthorAvatar.startsWith('cloud://')) {
        fileIDs.push(favorite.postAuthorAvatar);
      }
    });

    // 转换云存储URL为临时URL
    if (fileIDs.length > 0) {
      try {
        const fileListResult = await cloud.getTempFileURL({ fileList: fileIDs });
        const urlMap = new Map();
        fileListResult.fileList.forEach(item => {
          if (item.status === 0) {
            urlMap.set(item.fileID, item.tempFileURL);
          }
        });

        // 转换URL
        result.data.forEach(favorite => {
          if (favorite.postImageUrl && urlMap.has(favorite.postImageUrl)) {
            favorite.postImageUrl = urlMap.get(favorite.postImageUrl);
          }
          if (favorite.postImageUrls && Array.isArray(favorite.postImageUrls)) {
            favorite.postImageUrls = favorite.postImageUrls.map(url => {
              return urlMap.has(url) ? urlMap.get(url) : url;
            });
          }
          if (favorite.postPoemBgImage && urlMap.has(favorite.postPoemBgImage)) {
            favorite.postPoemBgImage = urlMap.get(favorite.postPoemBgImage);
          }
          if (favorite.postAuthorAvatar && urlMap.has(favorite.postAuthorAvatar)) {
            favorite.postAuthorAvatar = urlMap.get(favorite.postAuthorAvatar);
          }
        });
      } catch (fileError) {
        console.error('【getAllFavorites】文件URL转换失败:', fileError);
      }
    }

    // 对于作者信息缺失的收藏记录，需要重新查询
    const needAuthorInfoFavorites = result.data.filter(favorite => 
      !favorite.postAuthorName || favorite.postAuthorName === '匿名用户'
    );

    // 如果有需要补充作者信息的收藏记录，批量查询
    const authorInfoMap = new Map();
    if (needAuthorInfoFavorites.length > 0) {
      const postIds = needAuthorInfoFavorites.map(f => f.postId);
      const postsWithAuthor = await db.collection('posts').aggregate()
        .match({ _id: db.command.in(postIds) })
        .lookup({
          from: 'users',
          localField: '_openid',
          foreignField: '_openid',
          as: 'authorInfo'
        })
        .project({
          _id: 1,
          authorName: $.ifNull([$.arrayElemAt(['$authorInfo.nickName', 0]), '匿名用户']),
          authorAvatar: $.ifNull([$.arrayElemAt(['$authorInfo.avatarUrl', 0]), ''])
        })
        .end();

      postsWithAuthor.list.forEach(post => {
        authorInfoMap.set(post._id, {
          authorName: post.authorName,
          authorAvatar: post.authorAvatar
        });
      });
    }

    // 格式化收藏数据，转换为类似帖子的格式以便前端复用组件
    const formattedFavorites = result.data.map(favorite => {
      // 处理图片数组，确保兼容性
      let imageUrls = [];
      let originalImageUrls = [];
      
      if (favorite.postImageUrls && Array.isArray(favorite.postImageUrls)) {
        imageUrls = favorite.postImageUrls;
        originalImageUrls = favorite.postImageUrls;
      } else if (favorite.postImageUrl) {
        imageUrls = [favorite.postImageUrl];
        originalImageUrls = [favorite.postImageUrl];
      }

      // 获取作者信息（优先使用补充查询的结果）
      const authorInfo = authorInfoMap.get(favorite.postId);
      const authorName = authorInfo ? authorInfo.authorName : (favorite.postAuthorName || '匿名用户');
      const authorAvatar = authorInfo ? authorInfo.authorAvatar : (favorite.postAuthorAvatar || '');

      return {
        _id: favorite.postId, // 使用原帖子ID，方便跳转详情
        favoriteId: favorite._id, // 收藏记录的ID，用于取消收藏
        title: favorite.postTitle || '无标题',
        content: favorite.postContent || '',
        imageUrls: imageUrls,
        originalImageUrls: originalImageUrls,
        poemBgImage: favorite.postPoemBgImage || '',
        isPoem: favorite.postIsPoem || false,
        isOriginal: favorite.postIsOriginal || false,
        authorName: authorName,
        authorAvatar: authorAvatar,
        createTime: favorite.postCreateTime, // 原帖子创建时间
        favoriteTime: favorite.createTime, // 收藏时间
        votes: 0, // 收藏列表不显示点赞数
        commentCount: 0, // 收藏列表不显示评论数
        isFavorite: true // 标记为收藏项
      };
    });

    console.log('【getAllFavorites】格式化后的收藏数据:', formattedFavorites.length);

    return {
      success: true,
      favorites: formattedFavorites
    };
  } catch (error) {
    console.error('【getAllFavorites】获取所有收藏失败:', error);
    return {
      success: false,
      message: '获取收藏失败',
      error: error.message
    };
  }
}
