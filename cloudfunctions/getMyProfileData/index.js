// 修复后的getMyProfileData云函数
// 主要修复了：
// 1. 移除了重复的formattedFavorites变量声明
// 2. 修复了多余的大括号导致的语法错误
// 3. 清理了未使用的formatFavoritesForFolder函数引用

console.log('【profile云函数】=== 代码已更新修复版本 ===');

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

    // 图片URL转换逻辑（简化版）
    const fileIDSet = new Set();
    posts.forEach((post, index) => {
      // 保证 imageUrls、originalImageUrls 一定为数组
      if (!Array.isArray(post.imageUrls)) post.imageUrls = post.imageUrls ? [post.imageUrls] : [];
      if (!Array.isArray(post.originalImageUrls)) post.originalImageUrls = post.originalImageUrls ? [post.originalImageUrls] : [];
      
      // 收集唯一的fileID
      if (post.imageUrls && Array.isArray(post.imageUrls) && post.imageUrls.length > 0) {
        post.imageUrls.forEach(url => {
          if (url && url.startsWith('cloud://')) {
            fileIDSet.add(url);
          }
        });
      }
      
      if (userInfo.avatarUrl && userInfo.avatarUrl.startsWith('cloud://')) {
        fileIDSet.add(userInfo.avatarUrl);
      }
    });
    
    const fileIDs = Array.from(fileIDSet);

    if (fileIDs.length > 0) {
      try {
        const fileListResult = await cloud.getTempFileURL({ fileList: fileIDs });
        const urlMap = new Map();
        fileListResult.fileList.forEach(item => {
          if (item.status === 0) {
            urlMap.set(item.fileID, item.tempFileURL);
          }
        });

        posts.forEach((post) => {
          if (post.imageUrls && Array.isArray(post.imageUrls)) {
            post.imageUrls = post.imageUrls.map(url => {
              return urlMap.has(url) ? urlMap.get(url) : url;
            });
          }
          if (userInfo.avatarUrl && urlMap.has(userInfo.avatarUrl)) {
            userInfo.avatarUrl = urlMap.get(userInfo.avatarUrl);
          }
        });
      } catch (fileError) {
        console.error('文件URL转换失败:', fileError);
      }
    }

    // 给每个post加上作者信息
    posts = posts.map(post => ({
      ...post,
      authorName: userInfo.nickName,
      authorAvatar: userInfo.avatarUrl
    }));

    console.log('【profile云函数】最终返回 posts 数量:', posts.length);

    return {
      success: true,
      userInfo: userInfo,
      posts: posts
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

async function createFavoriteFolder(openid, folderName) {
  try {
    if (!folderName || folderName.trim() === '') {
      return {
        success: false,
        message: '收藏夹名称不能为空'
      };
    }

    // 检查用户是否已有同名收藏夹
    const existingFolder = await db.collection('favorite_folders').where({
      _openid: openid,
      name: folderName.trim()
    }).get();

    if (existingFolder.data.length > 0) {
      return {
        success: false,
        message: '收藏夹名称已存在'
      };
    }

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

    return {
      success: true,
      folderId: result._id,
      message: '收藏夹创建成功'
    };
  } catch (error) {
    console.error('创建收藏夹失败:', error);
    return {
      success: false,
      message: '创建收藏夹失败',
      error: error.message
    };
  }
}

async function addToFavorite(openid, postId, folderId) {
  try {
    if (!postId || !folderId) {
      return {
        success: false,
        message: '参数不完整'
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

    // 添加到收藏
    const result = await db.collection('favorites').add({
      data: {
        _openid: openid,
        postId: postId,
        folderId: folderId,
        createTime: new Date()
      }
    });

    // 更新收藏夹的项目数量
    await db.collection('favorite_folders').doc(folderId).update({
      data: {
        itemCount: db.command.inc(1),
        updateTime: new Date()
      }
    });

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

async function getFavoritesByFolder(openid, folderId, skip, limit) {
  try {
    if (!folderId) {
      return {
        success: false,
        message: '收藏夹ID不能为空'
      };
    }

    // 获取收藏夹中的收藏项
    const result = await db.collection('favorites').where({
      _openid: openid,
      folderId: folderId
    }).orderBy('createTime', 'desc').skip(skip).limit(limit).get();

    return {
      success: true,
      favorites: result.data
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

async function removeFromFavorite(openid, favoriteId) {
  try {
    if (!favoriteId) {
      return {
        success: false,
        message: '收藏ID不能为空'
      };
    }

    // 首先获取收藏项信息，以便更新收藏夹计数
    const favorite = await db.collection('favorites').doc(favoriteId).get();
    if (!favorite.data) {
      return {
        success: false,
        message: '收藏项不存在'
      };
    }

    const folderId = favorite.data.folderId;

    // 删除收藏项
    await db.collection('favorites').doc(favoriteId).remove();

    // 更新收藏夹的项目数量
    if (folderId) {
      await db.collection('favorite_folders').doc(folderId).update({
        data: {
          itemCount: db.command.inc(-1),
          updateTime: new Date()
        }
      });
    }

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

async function getAllFavorites(openid, skip, limit) {
  try {
    // 获取用户的所有收藏项，按收藏时间降序排列
    const favoritesResult = await db.collection('favorites').where({
      _openid: openid
    }).orderBy('createTime', 'desc').skip(skip).limit(limit).get();

    const favorites = favoritesResult.data;
    
    if (favorites.length === 0) {
      return {
        success: true,
        favorites: []
      };
    }

    // 获取所有相关的帖子ID
    const postIds = favorites.map(fav => fav.postId);
    
    // 获取帖子详细信息
    const postsResult = await db.collection('posts').where({
      _id: db.command.in(postIds)
    }).get();
    
    const postsMap = new Map();
    postsResult.data.forEach(post => {
      postsMap.set(post._id, post);
    });

    // 获取用户信息
    const userIds = [...new Set(postsResult.data.map(post => post._openid))];
    const usersResult = await db.collection('users').where({
      _openid: db.command.in(userIds)
    }).get();
    
    const usersMap = new Map();
    usersResult.data.forEach(user => {
      usersMap.set(user._openid, user);
    });

    // 获取评论数量
    const commentsCountResult = await db.collection('comments').aggregate()
      .match({ postId: db.command.in(postIds) })
      .group({ _id: '$postId', count: $.sum(1) })
      .end();

    const commentsCountMap = new Map();
    commentsCountResult.list.forEach(item => {
      commentsCountMap.set(item._id, item.count);
    });

    // 构建完整的收藏数据
    const completeFavorites = favorites.map(favorite => {
      const post = postsMap.get(favorite.postId);
      if (!post) return null;
      
      const user = usersMap.get(post._openid);
      const commentCount = commentsCountMap.get(post._id) || 0;
      
      // 确保图片URLs是数组
      if (!Array.isArray(post.imageUrls)) {
        post.imageUrls = post.imageUrls ? [post.imageUrls] : [];
      }
      if (!Array.isArray(post.originalImageUrls)) {
        post.originalImageUrls = post.originalImageUrls ? [post.originalImageUrls] : [];
      }
      
      return {
        ...favorite,
        _id: post._id,
        title: post.title,
        content: post.content,
        imageUrls: post.imageUrls,
        originalImageUrls: post.originalImageUrls,
        createTime: post.createTime,
        votes: post.votes || 0,
        commentCount: commentCount,
        authorName: user ? user.nickName : '未知用户',
        authorAvatar: user ? user.avatarUrl : '',
        favoriteTime: favorite.createTime,
        favoriteId: favorite._id
      };
    }).filter(item => item !== null);

    // 处理图片URL转换
    const fileIDSet = new Set();
    completeFavorites.forEach(favorite => {
      if (favorite.imageUrls && Array.isArray(favorite.imageUrls)) {
        favorite.imageUrls.forEach(url => {
          if (url && url.startsWith('cloud://')) {
            fileIDSet.add(url);
          }
        });
      }
      if (favorite.authorAvatar && favorite.authorAvatar.startsWith('cloud://')) {
        fileIDSet.add(favorite.authorAvatar);
      }
    });

    const fileIDs = Array.from(fileIDSet);
    if (fileIDs.length > 0) {
      try {
        const fileListResult = await cloud.getTempFileURL({ fileList: fileIDs });
        const urlMap = new Map();
        fileListResult.fileList.forEach(item => {
          if (item.status === 0) {
            urlMap.set(item.fileID, item.tempFileURL);
          }
        });

        completeFavorites.forEach(favorite => {
          if (favorite.imageUrls && Array.isArray(favorite.imageUrls)) {
            favorite.imageUrls = favorite.imageUrls.map(url => {
              return urlMap.has(url) ? urlMap.get(url) : url;
            });
          }
          if (favorite.authorAvatar && urlMap.has(favorite.authorAvatar)) {
            favorite.authorAvatar = urlMap.get(favorite.authorAvatar);
          }
        });
      } catch (fileError) {
        console.error('文件URL转换失败:', fileError);
      }
    }

    return {
      success: true,
      favorites: completeFavorites
    };
  } catch (error) {
    console.error('获取所有收藏失败:', error);
    return {
      success: false,
      message: '获取收藏失败',
      error: error.message
    };
  }
}