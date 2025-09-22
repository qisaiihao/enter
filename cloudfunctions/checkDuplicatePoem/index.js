// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const { title, author, isOriginal } = event;

  try {
    // 只检查非原创诗歌的重复
    if (isOriginal) {
      return {
        success: true,
        isDuplicate: false,
        message: '原创诗歌无需检查重复'
      };
    }

    if (!title || !author) {
      return {
        success: false,
        error: '标题和作者信息不完整'
      };
    }

    // 查询是否存在相同的非原创诗歌
    const result = await db.collection('posts')
      .where({
        isPoem: true,
        isOriginal: false,
        title: title.trim(),
        author: author.trim()
      })
      .get();

    const isDuplicate = result.data.length > 0;
    
    return {
      success: true,
      isDuplicate: isDuplicate,
      duplicateCount: result.data.length,
      message: isDuplicate ? `发现 ${result.data.length} 篇相同的诗歌` : '未发现重复诗歌'
    };

  } catch (e) {
    console.error('检查重复诗歌失败:', e);
    return {
      success: false,
      error: e.message
    };
  }
};
